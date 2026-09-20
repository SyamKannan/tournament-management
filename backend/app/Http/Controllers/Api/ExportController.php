<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CricketMatchState;
use App\Models\FootballMatchState;
use App\Models\GameMatch;
use App\Models\Player;
use App\Models\RegistrationPayment;
use App\Models\Standing;
use App\Models\Team;
use App\Models\Tournament;
use App\Models\Venue;
use App\Services\CricketScorecard;
use App\Services\CsvWriter;
use App\Services\FootballScorecard;
use App\Services\PlayerStatsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Downloads an organizer takes away from the platform.
 *
 * Everything here already exists on a screen. It is offered as a file because a
 * village tournament's paperwork does not live in a browser: the fee sheet gets
 * printed for the committee, the roster gets checked against ID cards at the
 * gate, and the table gets sent to a WhatsApp group.
 *
 * Which of these need a login is the same question as for the screens they come
 * from. The table and the fixture list are public, exactly as the tournament hub
 * is. The fee collection and the roster carry managers' phone numbers, so they
 * stay with the organizer.
 */
class ExportController extends Controller
{
    public function __construct(
        private readonly CsvWriter $csv,
        private readonly PlayerStatsService $stats,
        private readonly CricketScorecard $cricketCard,
        private readonly FootballScorecard $footballCard,
    ) {}

    /* --------------------------------------------------------------- Public */

    /** The tournament table, as it reads on the hub. */
    public function standings(string $tournamentId): StreamedResponse|JsonResponse
    {
        $tournament = $this->publicTournament($tournamentId);

        if (! $tournament instanceof Tournament) {
            return $tournament;
        }

        $teams = Team::query()->where('tournament_id', $tournament->id)->get()->keyBy('id');
        $standings = Standing::query()
            ->where('tournament_id', $tournament->id)
            ->orderBy('rank')
            ->get();

        $football = $tournament->sport_code === 'football';

        $headings = $football
            ? ['Position', 'Group', 'Team', 'Played', 'Won', 'Drawn', 'Lost', 'Goals For', 'Goals Against', 'Goal Difference', 'Fair Play', 'Points', 'Form']
            : ['Position', 'Group', 'Team', 'Played', 'Won', 'Lost', 'No Result', 'Runs Scored', 'Overs Faced', 'Runs Conceded', 'Overs Bowled', 'Net Run Rate', 'Points', 'Form'];

        $rows = $standings->map(function (Standing $standing) use ($teams, $football) {
            $name = $teams->get($standing->team_id)->name ?? $standing->team_id;
            $form = implode(' ', (array) ($standing->form ?? []));

            return $football
                ? [
                    $standing->rank, $standing->group_name, $name,
                    $standing->played, $standing->won, $standing->drawn, $standing->lost,
                    $standing->goals_for, $standing->goals_against, $standing->goal_difference,
                    $standing->disciplinary_points, $standing->points, $form,
                ]
                : [
                    $standing->rank, $standing->group_name, $name,
                    $standing->played, $standing->won, $standing->lost, $standing->no_result,
                    $standing->runs_scored, $standing->overs_faced,
                    $standing->runs_conceded, $standing->overs_bowled,
                    number_format((float) $standing->net_run_rate, 3), $standing->points, $form,
                ];
        });

        return $this->csv->download($this->filename($tournament, 'points-table'), $headings, $rows);
    }

    /** The fixture list with results, for pinning up. */
    public function fixtures(string $tournamentId): StreamedResponse|JsonResponse
    {
        $tournament = $this->publicTournament($tournamentId);

        if (! $tournament instanceof Tournament) {
            return $tournament;
        }

        $matches = GameMatch::query()
            ->where('tournament_id', $tournament->id)
            ->orderBy('match_number')
            ->get();

        $teams = Team::query()->where('tournament_id', $tournament->id)->get()->keyBy('id');
        $venues = Venue::query()->whereIn('id', $matches->pluck('venue_id')->filter())->get()->keyBy('id');

        $rows = $matches->map(fn (GameMatch $match) => [
            $match->match_number,
            $match->round_name,
            $match->group_name,
            // An unplayed bracket fixture has no teams yet, and saying so is
            // more use than an empty cell.
            $teams->get($match->team_a_id)->name ?? 'To be decided',
            $teams->get($match->team_b_id)->name ?? 'To be decided',
            $match->scheduled_at,
            $venues->get($match->venue_id)->name ?? '',
            $match->status,
            $teams->get($match->winner_team_id)->name ?? '',
            $match->result_summary,
        ]);

        return $this->csv->download(
            $this->filename($tournament, 'fixtures'),
            ['Match', 'Round', 'Group', 'Home', 'Away', 'Scheduled', 'Ground', 'Status', 'Winner', 'Result'],
            $rows
        );
    }

    /** Top scorers and wicket-takers, as the leaderboard shows them. */
    public function leaderboard(string $tournamentId): StreamedResponse|JsonResponse
    {
        $tournament = $this->publicTournament($tournamentId);

        if (! $tournament instanceof Tournament) {
            return $tournament;
        }

        $football = $tournament->sport_code === 'football';

        // Derived on read, like every other statistic on this platform — there
        // is no stored table to dump.
        $entries = $this->stats->forTournament($tournament);

        $headings = $football
            ? ['Player', 'Code', 'Team', 'Matches', 'Goals', 'Assists', 'Penalties Scored', 'Clean Sheets', 'Yellow Cards', 'Red Cards', 'Player of the Match']
            : ['Player', 'Code', 'Team', 'Matches', 'Runs', 'Balls Faced', 'Highest', 'Strike Rate', 'Wickets', 'Overs Bowled', 'Runs Conceded', 'Catches'];

        $rows = $entries
            ->map(fn (array $entry) => $entry['stats'])
            ->sortByDesc(fn (array $stats) => $football
                ? (int) ($stats['football']['goals'] ?? 0)
                : (int) ($stats['cricket']['runs_scored'] ?? 0))
            ->map(function (array $stats) use ($football) {
                $totals = $football ? ($stats['football'] ?? []) : ($stats['cricket'] ?? []);

                return $football
                    ? [
                        $stats['full_name'], $stats['player_code'], $stats['team_name'],
                        $totals['matches'] ?? 0, $totals['goals'] ?? 0, $totals['assists'] ?? 0,
                        $totals['penalties_scored'] ?? 0, $totals['clean_sheets'] ?? 0,
                        $totals['yellow_cards'] ?? 0, $totals['red_cards'] ?? 0,
                        $totals['player_of_match_count'] ?? 0,
                    ]
                    : [
                        $stats['full_name'], $stats['player_code'], $stats['team_name'],
                        $totals['matches'] ?? 0, $totals['runs_scored'] ?? 0, $totals['balls_faced'] ?? 0,
                        $totals['highest_score'] ?? 0, $totals['strike_rate'] ?? 0,
                        $totals['wickets_taken'] ?? 0, $totals['overs_bowled'] ?? 0,
                        $totals['runs_conceded'] ?? 0, $totals['catches'] ?? 0,
                    ];
            })
            ->values();

        return $this->csv->download($this->filename($tournament, 'player-stats'), $headings, $rows);
    }

    /* ------------------------------------------------------- Organizer only */

    /**
     * Ground-fee collection, team by team.
     *
     * The committee's sheet: who has paid, how much is outstanding, and the
     * number to ring about it.
     */
    public function fees(Request $request, string $tournamentId): StreamedResponse|JsonResponse
    {
        $tournament = Tournament::find($tournamentId);

        if (! $tournament) {
            return response()->json(['error' => 'Tournament not found'], 404);
        }

        if ($denied = $this->denyForeignTenant($request, $tournament->organization_id)) {
            return $denied;
        }

        $teams = Team::query()->where('tournament_id', $tournament->id)->orderBy('name')->get();
        $payments = RegistrationPayment::query()
            ->where('tournament_id', $tournament->id)
            ->get()
            ->keyBy('team_id');

        $rows = $teams->map(function (Team $team) use ($payments, $tournament) {
            $payment = $payments->get($team->id);

            return [
                $team->name,
                $team->status,
                $team->manager_name,
                $team->manager_phone,
                (float) ($payment->total_fee ?? $tournament->ground_fee ?? 0),
                (float) ($payment->paid_amount ?? 0),
                (float) ($payment->remaining_amount ?? ($tournament->ground_fee ?? 0)),
                $payment->status ?? 'unpaid',
                $payment->payment_method ?? '',
                $payment->receipt_number ?? '',
                $payment->transaction_id ?? '',
            ];
        });

        return $this->csv->download(
            $this->filename($tournament, 'fee-collection'),
            ['Team', 'Team Status', 'Manager', 'Manager Phone', 'Fee', 'Paid', 'Outstanding', 'Payment Status', 'Method', 'Receipt No', 'Transaction'],
            $rows
        );
    }

    /**
     * Every squad, player by player — the list checked at the gate.
     */
    public function roster(Request $request, string $tournamentId): StreamedResponse|JsonResponse
    {
        $tournament = Tournament::find($tournamentId);

        if (! $tournament) {
            return response()->json(['error' => 'Tournament not found'], 404);
        }

        if ($denied = $this->denyForeignTenant($request, $tournament->organization_id)) {
            return $denied;
        }

        $teams = Team::query()->where('tournament_id', $tournament->id)->orderBy('name')->get()->keyBy('id');
        $players = Player::query()
            ->whereIn('team_id', $teams->keys())
            ->orderBy('team_id')
            ->orderBy('jersey_number')
            ->get();

        $football = $tournament->sport_code === 'football';

        $rows = $players->map(fn (Player $player) => [
            $teams->get($player->team_id)->name ?? '',
            $teams->get($player->team_id)->group_name ?? '',
            $player->jersey_number,
            $player->full_name,
            $player->player_code,
            $player->mobile,
            $player->age,
            $football ? $player->football_position : $player->cricket_role,
            $player->is_captain ? 'Captain' : ($player->is_wicketkeeper ? 'Wicketkeeper' : ''),
        ]);

        return $this->csv->download(
            $this->filename($tournament, 'squads'),
            ['Team', 'Group', 'Jersey', 'Player', 'Player Code', 'Mobile', 'Age', $football ? 'Position' : 'Role', 'Role'],
            $rows
        );
    }

    /* ------------------------------------------------------------ Scorecard */

    /**
     * One match's full card as printable HTML.
     *
     * HTML rather than a generated PDF: the browser's own "Save as PDF" produces
     * the same result, and it avoids putting headless Chrome — which poster
     * generation already needs and which is the most fragile thing in the
     * deployment — on the path of a download an organizer wants immediately.
     */
    public function scorecard(string $matchId): \Illuminate\Http\Response|JsonResponse
    {
        $match = GameMatch::find($matchId);

        if (! $match) {
            return response()->json(['error' => 'Match not found'], 404);
        }

        $tournament = Tournament::find($match->tournament_id);

        if (! $tournament || $tournament->status === 'draft') {
            return response()->json(['error' => 'Match not found'], 404);
        }

        $teams = Team::query()->whereIn('id', [$match->team_a_id, $match->team_b_id])->get()->keyBy('id');

        $isCricket = $match->sport_code === 'cricket';

        $card = $isCricket
            ? $this->cricketCard->forMatch($match, CricketMatchState::query()->where('match_id', $match->id)->first())
            : $this->footballCard->forMatch($match, FootballMatchState::query()->where('match_id', $match->id)->first());

        return response()->view('exports.scorecard', [
            'match' => $match,
            'tournament' => $tournament,
            'teamA' => $teams->get($match->team_a_id),
            'teamB' => $teams->get($match->team_b_id),
            'venue' => $match->venue_id ? Venue::find($match->venue_id) : null,
            'card' => $card,
            'isCricket' => $isCricket,
            // Both card shapes identify sides by id, so the view needs a way to
            // name them without loading teams itself.
            'teamNames' => $teams->map(fn (Team $team) => $team->name)->all(),
        ]);
    }

    /* ------------------------------------------------------------- Helpers */

    /**
     * A tournament anyone may export from — by id or slug, and never a draft,
     * matching the rule the public hub already follows.
     */
    private function publicTournament(string $idOrSlug): Tournament|JsonResponse
    {
        $tournament = Tournament::query()
            ->where('id', $idOrSlug)
            ->orWhere('slug', $idOrSlug)
            ->first();

        if (! $tournament || $tournament->status === 'draft') {
            return response()->json(['error' => 'Tournament not found'], 404);
        }

        return $tournament;
    }

    private function filename(Tournament $tournament, string $what): string
    {
        return sprintf('%s-%s-%s.csv', $tournament->slug, $what, now()->format('Y-m-d'));
    }
}

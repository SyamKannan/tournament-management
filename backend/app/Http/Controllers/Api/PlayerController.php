<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuctionPlayer;
use App\Models\Organization;
use App\Models\Player;
use App\Models\Team;
use App\Models\Tournament;
use App\Services\PlayerIdentity;
use App\Services\PlayerStatsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

/**
 * Player profiles, match logs, careers, tournament stats tables and
 * leaderboards — all public and read-only — plus the signed-in player's
 * dashboard.
 *
 * Every number comes from PlayerStatsService, which reads it off the scoring
 * logs. Public responses never carry a player's mobile number, date of birth
 * or age, and nothing from a draft tournament is shown.
 */
class PlayerController extends Controller
{
    /** Squad-entry columns kept off every public response. */
    private const PRIVATE_PLAYER_FIELDS = ['mobile', 'dob', 'age'];

    /** The auction-pool fields safe to show a stranger: no contact or payment details. */
    private const PUBLIC_AUCTION_FIELDS = ['id', 'auction_id', 'status', 'category', 'base_price', 'sold_price', 'sold_to_team_id', 'sold_to_team_name', 'sport_code'];

    /** Stats-table sort keys, each mapped to its stat and direction. */
    private const CRICKET_SORTS = [
        'runs' => ['runs_scored', 'desc'],
        'wickets' => ['wickets_taken', 'desc'],
        'average' => ['batting_average', 'desc'],
        'strike_rate' => ['strike_rate', 'desc'],
        'economy' => ['economy_rate', 'asc'],
        'highest' => ['highest_score', 'desc'],
        'fifties' => ['fifties', 'desc'],
        'fours' => ['fours', 'desc'],
        'sixes' => ['sixes', 'desc'],
        'catches' => ['catches', 'desc'],
        'matches' => ['matches', 'desc'],
        'potm' => ['player_of_match_count', 'desc'],
    ];

    private const FOOTBALL_SORTS = [
        'goals' => ['goals', 'desc'],
        'assists' => ['assists', 'desc'],
        'matches' => ['matches', 'desc'],
        'clean_sheets' => ['clean_sheets', 'desc'],
        'yellow_cards' => ['yellow_cards', 'desc'],
        'red_cards' => ['red_cards', 'desc'],
        'potm' => ['player_of_match_count', 'desc'],
    ];

    public function __construct(private readonly PlayerStatsService $stats) {}

    /**
     * Full profile for a squad player, or for someone who only exists in an
     * auction pool so far.
     */
    public function profile(string $id): JsonResponse
    {
        [$player, $auctionPlayer] = $this->findPublicPlayer($id);

        if (! $player) {
            return response()->json(['error' => 'Player not found'], 404);
        }

        return response()->json([
            'player' => $this->publicPlayer($player),
            'team' => $player->team_id ? Team::find($player->team_id) : null,
            'tournament' => Tournament::find($player->tournament_id),
            'organization' => Organization::find($player->organization_id),
            'stats' => $this->stats->forPlayer($player),
            'auction_info' => $auctionPlayer?->only(self::PUBLIC_AUCTION_FIELDS),
        ]);
    }

    /**
     * Every match the player took part in, newest first, a page at a time.
     */
    public function matches(Request $request, string $id): JsonResponse
    {
        [$player] = $this->findPublicPlayer($id);

        if (! $player) {
            return response()->json(['error' => 'Player not found'], 404);
        }

        [$page, $perPage] = $this->pagination($request, 20);
        $log = $this->stats->matchLog($player);

        return response()->json([
            'player' => $this->publicPlayer($player),
            'data' => array_slice($log, ($page - 1) * $perPage, $perPage),
            'meta' => $this->meta($page, $perPage, count($log)),
        ]);
    }

    /**
     * Find a player by name, so anyone — a player looking for their own
     * record — can reach a profile without logging in. Only squad players of
     * approved teams in tournaments that aren't drafts; each result carries a
     * headline line of stats so the right entry is easy to pick out.
     */
    public function search(Request $request): JsonResponse
    {
        $term = trim((string) $request->query('q', ''));

        if (mb_strlen($term) < 2) {
            return response()->json(['error' => 'Type at least 2 letters of the player’s name'], 422);
        }

        [$page, $perPage] = $this->pagination($request, 20);

        // '!' escapes LIKE's wildcards: a backslash means something different
        // inside a MySQL string literal than it does on sqlite or Postgres.
        $pattern = '%'.str_replace(['!', '%', '_'], ['!!', '!%', '!_'], mb_strtolower($term)).'%';

        $query = Player::query()
            ->select('players.*')
            ->join('tournaments', 'tournaments.id', '=', 'players.tournament_id')
            ->join('teams', 'teams.id', '=', 'players.team_id')
            ->where('tournaments.status', '!=', 'draft')
            ->where('teams.status', 'approved')
            ->whereRaw("LOWER(players.full_name) LIKE ? ESCAPE '!'", [$pattern])
            ->when($request->query('sport'), fn ($q, $sport) => $q->where('tournaments.sport_code', $sport));

        $total = (clone $query)->count();

        $players = $query
            ->orderBy('players.full_name')
            ->orderByDesc('tournaments.start_date')
            ->skip(($page - 1) * $perPage)
            ->take($perPage)
            ->get();

        $blocks = $this->stats->forPlayers($players);
        $tournaments = Tournament::query()->whereIn('id', $players->pluck('tournament_id')->unique())->get()->keyBy('id');
        $organizations = Organization::query()->whereIn('id', $players->pluck('organization_id')->unique())->pluck('name', 'id');

        return response()->json([
            'query' => $term,
            'data' => $players->map(function (Player $player) use ($blocks, $tournaments, $organizations) {
                $stats = $blocks[$player->id];
                $tournament = $tournaments->get($player->tournament_id);
                $sport = $stats['sport_code'];

                return [
                    'player_id' => $player->id,
                    'full_name' => $player->full_name,
                    'photo' => $player->photo ?: null,
                    'jersey_number' => $player->jersey_number,
                    'role' => $sport === 'cricket' ? $player->cricket_role : $player->football_position,
                    'team_name' => $stats['team_name'],
                    'organization_name' => $organizations[$player->organization_id] ?? null,
                    'tournament' => [
                        'id' => $tournament?->id,
                        'name' => $tournament?->name,
                        'slug' => $tournament?->slug,
                        'sport_code' => $sport,
                    ],
                    'headline' => $sport === 'cricket'
                        ? [
                            'matches' => $stats['cricket']['matches'],
                            'runs' => $stats['cricket']['runs_scored'],
                            'wickets' => $stats['cricket']['wickets_taken'],
                        ]
                        : [
                            'matches' => $stats['football']['matches'],
                            'goals' => $stats['football']['goals'],
                            'assists' => $stats['football']['assists'],
                        ],
                ];
            })->values(),
            'meta' => $this->meta($page, $perPage, $total),
        ]);
    }

    /**
     * Turn a Player Code into the profile to open. A person's code is shared by
     * all their squad entries, so the most recent one in a public tournament
     * is chosen — their profile links the rest through the career panel.
     */
    public function byCode(string $code, PlayerIdentity $identity): JsonResponse
    {
        $normalized = $identity->normalizeCode($code);

        $player = $normalized
            ? Player::query()
                ->select('players.*')
                ->leftJoin('tournaments', 'tournaments.id', '=', 'players.tournament_id')
                ->where('players.player_code', $normalized)
                ->where(fn ($q) => $q->whereNull('tournaments.status')->orWhere('tournaments.status', '!=', 'draft'))
                // A squad entry in a tournament beats the bare sign-up record.
                ->orderByRaw("CASE WHEN players.tournament_id = '' THEN 1 ELSE 0 END")
                ->orderByDesc('players.created_at')
                ->first()
            : null;

        if (! $player) {
            return response()->json(['error' => 'No player found with that Player Code'], 404);
        }

        return response()->json([
            'player_id' => $player->id,
            'player_code' => $player->player_code,
            'full_name' => $player->full_name,
        ]);
    }

    /**
     * The player's totals across every tournament linked to their account,
     * with a per-tournament breakdown.
     */
    public function career(string $id): JsonResponse
    {
        [$player] = $this->findPublicPlayer($id);

        if (! $player) {
            return response()->json(['error' => 'Player not found'], 404);
        }

        return response()->json([
            'player' => $this->publicPlayer($player),
            'career' => $this->stats->career($player),
        ]);
    }

    /**
     * A tournament's full player stats table — sortable, filterable by team
     * or name, and paged. `{tournament}` is the tournament's id or its slug.
     */
    public function tournamentStats(Request $request, string $tournament): JsonResponse
    {
        $found = $this->findPublicTournament($tournament);

        if (! $found) {
            return response()->json(['error' => 'Tournament not found'], 404);
        }

        $sport = $found->sport_code === 'cricket' ? 'cricket' : 'football';
        $sorts = $sport === 'cricket' ? self::CRICKET_SORTS : self::FOOTBALL_SORTS;
        $sort = array_key_exists((string) $request->query('sort'), $sorts)
            ? (string) $request->query('sort')
            : array_key_first($sorts);
        [$field, $direction] = $sorts[$sort];

        $team = (string) $request->query('team', '');
        $search = mb_strtolower(trim((string) $request->query('search', '')));

        $rows = $this->stats->forTournament($found)
            ->filter(fn (array $row) => $team === '' || $row['player']->team_id === $team)
            ->filter(fn (array $row) => $search === '' || str_contains(mb_strtolower($row['player']->full_name), $search))
            ->map(fn (array $row) => $this->statsRow($row['player'], $row['stats'], $sport))
            ->sort(fn (array $a, array $b) => $this->compareStat($a['stats'][$field], $b['stats'][$field], $direction)
                ?: strcasecmp($a['full_name'], $b['full_name']))
            ->values();

        [$page, $perPage] = $this->pagination($request, 25);

        return response()->json([
            'tournament' => [
                'id' => $found->id,
                'name' => $found->name,
                'slug' => $found->slug,
                'sport_code' => $sport,
            ],
            'sport' => $sport,
            'sort' => $sort,
            'sort_options' => array_keys($sorts),
            'data' => $rows->slice(($page - 1) * $perPage, $perPage)->values(),
            'meta' => $this->meta($page, $perPage, $rows->count()),
        ]);
    }

    /**
     * Tournament leaderboards — Orange/Purple Cap for cricket, Golden Boot and
     * top playmakers for football. A cap only goes to someone who has actually
     * scored a run or taken a wicket, and the boards only list players who
     * have scored, assisted, batted or bowled.
     */
    public function leaderboard(string $tournamentId): JsonResponse
    {
        $tournament = $this->findPublicTournament($tournamentId);

        if (! $tournament) {
            return response()->json(['error' => 'Tournament not found'], 404);
        }

        $all = $this->stats->forTournament($tournament);

        return response()->json(
            $tournament->sport_code === 'cricket'
                ? $this->cricketLeaderboard($tournament, $all)
                : $this->footballLeaderboard($tournament, $all)
        );
    }

    /**
     * The signed-in player's own dashboard.
     */
    public function dashboard(Request $request): JsonResponse
    {
        $user = $request->user();

        $player = Player::query()
            ->where('id', $user->id)
            ->orWhere(fn ($query) => $query->whereNotNull('mobile')->where('mobile', $user->phone))
            ->first();

        if (! $player) {
            return response()->json(['error' => 'Player profile not found'], 404);
        }

        $auctionEntry = AuctionPlayer::query()
            ->where('player_id', $player->id)
            ->orWhere('id', $player->id)
            ->orWhere(fn ($q) => $q->whereNotNull('mobile')->where('mobile', $player->mobile))
            ->first();

        return response()->json([
            'user' => $user->toAuthPayload(),
            'player' => $player,
            'team' => Team::find($player->team_id),
            'tournament' => Tournament::find($player->tournament_id),
            'organization' => Organization::find($player->organization_id),
            'stats' => $this->stats->forPlayer($player),
            'auction_entry' => $auctionEntry,
        ]);
    }

    /**
     * Update the logged-in player's profile (name, photo, phone, styles, age, jersey).
     */
    public function updateProfile(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'phone' => ['sometimes', 'string', 'max:64'],
            'avatar' => ['sometimes', 'nullable', 'string'],
            'football_position' => ['sometimes', 'nullable', 'string', 'max:64'],
            'cricket_role' => ['sometimes', 'nullable', 'string', 'max:64'],
            'cricket_batting_style' => ['sometimes', 'nullable', 'string', 'max:64'],
            'cricket_bowling_style' => ['sometimes', 'nullable', 'string', 'max:64'],
            'age' => ['sometimes', 'nullable', 'integer', 'min:5', 'max:100'],
            'jersey_number' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:99'],
            'dob' => ['sometimes', 'nullable', 'string'],
        ]);

        if (isset($data['name'])) {
            $user->name = $data['name'];
        }
        if (isset($data['phone'])) {
            $user->phone = $data['phone'];
        }
        if (isset($data['avatar'])) {
            $user->avatar = $data['avatar'];
        }
        $user->save();

        $player = Player::query()->where('id', $user->id)->first();
        if (! $player) {
            $player = Player::query()->whereNotNull('mobile')->where('mobile', $user->phone)->first();
        }

        if ($player) {
            $playerUpdates = [];
            if (isset($data['name'])) $playerUpdates['full_name'] = $data['name'];
            if (isset($data['avatar'])) $playerUpdates['photo'] = $data['avatar'];
            if (isset($data['phone'])) $playerUpdates['mobile'] = $data['phone'];
            if (isset($data['football_position'])) $playerUpdates['football_position'] = $data['football_position'];
            if (isset($data['cricket_role'])) $playerUpdates['cricket_role'] = $data['cricket_role'];
            if (isset($data['cricket_batting_style'])) $playerUpdates['cricket_batting_style'] = $data['cricket_batting_style'];
            if (isset($data['cricket_bowling_style'])) $playerUpdates['cricket_bowling_style'] = $data['cricket_bowling_style'];
            if (isset($data['age'])) $playerUpdates['age'] = $data['age'];
            if (isset($data['jersey_number'])) $playerUpdates['jersey_number'] = $data['jersey_number'];
            if (isset($data['dob'])) $playerUpdates['dob'] = $data['dob'];

            $player->fill($playerUpdates)->save();
        }

        return response()->json([
            'user' => $user->toAuthPayload(),
            'player' => $player,
            'message' => 'Profile updated successfully!',
        ]);
    }

    /* ------------------------------------------------------------- Helpers */

    /**
     * A squad player by id, or an auction-pool entry presented as one — and
     * nobody at all if their tournament is still a draft.
     *
     * @return array{0: ?Player, 1: ?AuctionPlayer}
     */
    private function findPublicPlayer(string $id): array
    {
        $player = Player::find($id);
        $auctionPlayer = AuctionPlayer::query()
            ->where('player_id', $id)
            ->orWhere('id', $id)
            ->first();

        $effective = $player ?? ($auctionPlayer ? $this->playerFromAuctionEntry($auctionPlayer) : null);

        if (! $effective || Tournament::query()->whereKey($effective->tournament_id)->value('status') === 'draft') {
            return [null, null];
        }

        return [$effective, $auctionPlayer];
    }

    private function findPublicTournament(string $idOrSlug): ?Tournament
    {
        $tournament = Tournament::query()
            ->where('id', $idOrSlug)
            ->orWhere('slug', $idOrSlug)
            ->first();

        return $tournament && $tournament->status !== 'draft' ? $tournament : null;
    }

    /** @return array<string, mixed> */
    private function publicPlayer(Player $player): array
    {
        return $player->makeHidden(self::PRIVATE_PLAYER_FIELDS)->toArray();
    }

    /**
     * @param  array<string, mixed>  $stats
     * @return array<string, mixed>
     */
    private function statsRow(Player $player, array $stats, string $sport): array
    {
        return [
            'player_id' => $player->id,
            'full_name' => $player->full_name,
            'photo' => $player->photo ?: null,
            'jersey_number' => $player->jersey_number,
            'team_id' => $player->team_id,
            'team_name' => $stats['team_name'],
            'role' => $sport === 'cricket' ? $player->cricket_role : $player->football_position,
            'is_captain' => (bool) $player->is_captain,
            'stats' => $stats[$sport],
        ];
    }

    /** Nulls — an average nobody has yet — always sort last, whichever the direction. */
    private function compareStat(int|float|null $a, int|float|null $b, string $direction): int
    {
        if ($a === null || $b === null) {
            return ($a === null) <=> ($b === null);
        }

        return $direction === 'asc' ? $a <=> $b : $b <=> $a;
    }

    /** @return array{0: int, 1: int} */
    private function pagination(Request $request, int $defaultPerPage): array
    {
        $page = max(1, (int) $request->query('page', 1));
        $perPage = min(100, max(1, (int) $request->query('per_page', $defaultPerPage)));

        return [$page, $perPage];
    }

    /** @return array{page: int, per_page: int, total: int, last_page: int} */
    private function meta(int $page, int $perPage, int $total): array
    {
        return [
            'page' => $page,
            'per_page' => $perPage,
            'total' => $total,
            'last_page' => max(1, (int) ceil($total / $perPage)),
        ];
    }

    /**
     * Present an auction-pool entry as a player so profiles render before the
     * player has been bought into a squad.
     */
    private function playerFromAuctionEntry(AuctionPlayer $entry): Player
    {
        return new Player([
            'id' => $entry->id,
            'team_id' => $entry->sold_to_team_id ?? '',
            'tournament_id' => $entry->tournament_id,
            'organization_id' => $entry->organization_id,
            'full_name' => $entry->full_name,
            'photo' => $entry->photo,
            'jersey_number' => 10,
            'football_position' => $entry->football_position,
            'cricket_role' => $entry->cricket_role,
            'cricket_batting_style' => $entry->cricket_batting_style,
            'cricket_bowling_style' => $entry->cricket_bowling_style,
            'age' => $entry->age,
            'mobile' => $entry->mobile,
            'is_captain' => false,
            'is_wicketkeeper' => false,
            'created_at' => $entry->created_at,
            'updated_at' => $entry->created_at,
        ]);
    }

    /**
     * @param  Collection<int, array{player: Player, stats: array<string, mixed>}>  $all
     */
    private function cricketLeaderboard(Tournament $tournament, Collection $all): array
    {
        $card = fn (array $row) => [
            'player_id' => $row['player']->id,
            'full_name' => $row['player']->full_name,
            'team_name' => $row['stats']['team_name'],
            'photo' => $row['player']->photo ?: null,
        ];

        $batters = $all
            ->filter(fn (array $row) => $row['stats']['cricket']['innings_batted'] > 0)
            ->sort(fn (array $a, array $b) => $b['stats']['cricket']['runs_scored'] <=> $a['stats']['cricket']['runs_scored']
                ?: $this->compareStat($a['stats']['cricket']['strike_rate'], $b['stats']['cricket']['strike_rate'], 'desc'))
            ->take(10)
            ->map(fn (array $row) => [
                ...$card($row),
                'runs' => $row['stats']['cricket']['runs_scored'],
                'balls' => $row['stats']['cricket']['balls_faced'],
                'innings' => $row['stats']['cricket']['innings_batted'],
                'highest_score' => $row['stats']['cricket']['highest_score'],
                'highest_score_not_out' => $row['stats']['cricket']['highest_score_not_out'],
                'average' => $row['stats']['cricket']['batting_average'],
                'strike_rate' => $row['stats']['cricket']['strike_rate'],
                'fifties' => $row['stats']['cricket']['fifties'],
                'fours' => $row['stats']['cricket']['fours'],
                'sixes' => $row['stats']['cricket']['sixes'],
            ])
            ->values();

        $bowlers = $all
            ->filter(fn (array $row) => $row['stats']['cricket']['innings_bowled'] > 0)
            ->sort(fn (array $a, array $b) => $b['stats']['cricket']['wickets_taken'] <=> $a['stats']['cricket']['wickets_taken']
                ?: $this->compareStat($a['stats']['cricket']['economy_rate'], $b['stats']['cricket']['economy_rate'], 'asc'))
            ->take(10)
            ->map(fn (array $row) => [
                ...$card($row),
                'wickets' => $row['stats']['cricket']['wickets_taken'],
                'innings' => $row['stats']['cricket']['innings_bowled'],
                'overs' => $row['stats']['cricket']['overs_bowled'],
                'runs_conceded' => $row['stats']['cricket']['runs_conceded'],
                'economy' => $row['stats']['cricket']['economy_rate'],
                'average' => $row['stats']['cricket']['bowling_average'],
                'best_bowling' => $row['stats']['cricket']['best_bowling_wickets'].'/'.$row['stats']['cricket']['best_bowling_runs'],
                'three_wickets' => $row['stats']['cricket']['three_wicket_hauls'],
                'five_wickets' => $row['stats']['cricket']['five_wicket_hauls'],
            ])
            ->values();

        return [
            'tournament_id' => $tournament->id,
            'tournament_name' => $tournament->name,
            'sport' => 'cricket',
            'orange_cap' => ($batters->first()['runs'] ?? 0) > 0 ? $batters->first() : null,
            'purple_cap' => ($bowlers->first()['wickets'] ?? 0) > 0 ? $bowlers->first() : null,
            'top_batsmen' => $batters,
            'top_bowlers' => $bowlers,
        ];
    }

    /**
     * @param  Collection<int, array{player: Player, stats: array<string, mixed>}>  $all
     */
    private function footballLeaderboard(Tournament $tournament, Collection $all): array
    {
        $row = fn (array $entry) => [
            'player_id' => $entry['player']->id,
            'full_name' => $entry['player']->full_name,
            'team_name' => $entry['stats']['team_name'],
            'photo' => $entry['player']->photo ?: null,
            'goals' => $entry['stats']['football']['goals'],
            'assists' => $entry['stats']['football']['assists'],
            'matches' => $entry['stats']['football']['matches'],
            'penalties' => $entry['stats']['football']['penalties_scored'],
            'potm' => $entry['stats']['football']['player_of_match_count'],
        ];

        // Fewer matches breaks a tie: the same tally in fewer games is the better return.
        $leaders = fn (string $stat) => $all
            ->filter(fn (array $entry) => $entry['stats']['football'][$stat] > 0)
            ->sort(fn (array $a, array $b) => $b['stats']['football'][$stat] <=> $a['stats']['football'][$stat]
                ?: $a['stats']['football']['matches'] <=> $b['stats']['football']['matches'])
            ->take(10)
            ->map($row)
            ->values();

        $scorers = $leaders('goals');
        $playmakers = $leaders('assists');

        return [
            'tournament_id' => $tournament->id,
            'tournament_name' => $tournament->name,
            'sport' => 'football',
            'golden_boot' => $scorers->first(),
            'top_playmaker' => $playmakers->first(),
            'top_scorers' => $scorers,
            'top_assists' => $playmakers,
        ];
    }
}

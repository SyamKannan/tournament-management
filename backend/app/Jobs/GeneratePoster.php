<?php

namespace App\Jobs;

use App\Models\GameMatch;
use App\Models\Organization;
use App\Models\Player;
use App\Models\Poster;
use App\Models\Standing;
use App\Models\Team;
use App\Models\Tournament;
use App\Models\Venue;
use App\Services\Poster\ArtDirectorService;
use App\Services\Poster\BackgroundService;
use App\Services\Poster\PaletteService;
use App\Services\Poster\PosterRenderer;
use App\Services\PosterService;
use App\Services\RealtimeBroadcaster;
use App\Services\TossService;
use App\Support\Ids;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;

/**
 * Chains PaletteService -> ArtDirectorService -> BackgroundService -> Blade
 * -> Browsershot into one PNG, then writes the `posters` row and broadcasts
 * it. Queued (not synchronous) because a full render — LLM call, optional
 * image generation, headless Chrome — easily takes 10-20 seconds, far too
 * slow to hold open the HTTP request that triggered it (a manual "Generate"
 * click, or the toss/match-completed automation hooks).
 *
 * Unlike the AI copy/artwork steps, there is no fallback for the render
 * step itself — Chrome is required infrastructure. A missing/broken Chrome
 * throws and the job lands in `failed_jobs`, rather than silently no-op'ing.
 */
class GeneratePoster implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, SerializesModels;

    public int $tries = 1;

    public int $timeout = 180;

    public function __construct(
        private readonly string $tournamentId,
        private readonly ?string $matchId,
        private readonly string $posterType,
        private readonly ?string $createdBy = null,
        private readonly ?string $origin = null,
    ) {}

    public function handle(
        PaletteService $palette,
        ArtDirectorService $artDirector,
        BackgroundService $background,
        RealtimeBroadcaster $realtime,
        PosterRenderer $renderer,
        PosterService $posters,
    ): void {
        $tournament = Tournament::find($this->tournamentId);

        if (! $tournament) {
            Log::warning('GeneratePoster: tournament not found', ['tournament_id' => $this->tournamentId]);

            return;
        }

        $match = $this->matchId ? GameMatch::find($this->matchId) : null;

        if ($this->posterType === 'tournament_announcement') {
            // Same designed templates as the Tournaments page poster.
            $html = $posters->tournamentHtml(
                $tournament,
                Organization::find($tournament->organization_id),
                true,
                $this->origin,
            )['html'];
        } else {
            $colors = $palette->extract($tournament);
            $copy = $artDirector->direct($this->buildMatchData($tournament, $match), $this->posterType, $colors);
            $backgroundImage = null;

            if ($copy) {
                $backgroundImage = $background->generate($copy['mood_prompt']);
            } else {
                $copy = $this->fallbackCopy($tournament, $match, $palette->toTemplatePalette($colors));
            }

            $viewData = [
                ...$this->viewDataFor($tournament, $match),
                'palette' => $copy['palette'],
                'layout' => $copy['layout'],
                'headline' => $copy['headline'],
                'subhead' => $copy['subhead'],
                'backgroundImage' => $backgroundImage,
                'variant' => $this->pickVariant(),
                'bokeh' => $this->randomBokeh(),
                'antonFontBase64' => $renderer->fontBase64('Anton-Regular.ttf'),
                'interFontBase64' => $renderer->fontBase64('Inter-Variable.ttf'),
            ];

            $html = view('posters.partials.'.$this->posterType, $viewData)->render();
        }

        $id = Ids::unique('poster');
        $renderer->renderToFile($html, public_path("uploads/match-posters/{$id}.png"));

        $imageUrl = url("uploads/match-posters/{$id}.png");

        $poster = Poster::create([
            'id' => $id,
            'tournament_id' => $tournament->id,
            'match_id' => $match?->id,
            'poster_type' => $this->posterType,
            'image_path' => $imageUrl,
            'created_by' => $this->createdBy,
        ]);

        $realtime->toRoom("tournament:{$tournament->id}", 'POSTER_CREATED', ['poster' => $poster]);
    }

    /**
     * Facts handed to the art director — real match/tournament data so its
     * headline can reference something specific instead of generic hype.
     */
    private function buildMatchData(Tournament $tournament, ?GameMatch $match): array
    {
        $data = [
            'tournament_name' => $tournament->name,
            'sport' => $tournament->sport_code,
        ];

        if (! $match) {
            if ($this->posterType === 'points_table') {
                $data['standings'] = Standing::query()
                    ->where('tournament_id', $tournament->id)
                    ->orderBy('rank')
                    ->limit(5)
                    ->get(['team_id', 'points', 'won', 'lost', 'played'])
                    ->map(fn (Standing $s) => [
                        'team_name' => Team::find($s->team_id)?->name,
                        'points' => $s->points,
                        'played' => $s->played,
                    ])->all();
            } else {
                $data['format'] = $tournament->format;
                $data['max_teams'] = $tournament->max_teams;
                $data['prize_money'] = $tournament->prize_money;
                $data['dates'] = [$tournament->start_date, $tournament->end_date];
            }

            return $data;
        }

        $teamA = Team::find($match->team_a_id);
        $teamB = Team::find($match->team_b_id);

        $data['team_a'] = $teamA?->name;
        $data['team_b'] = $teamB?->name;
        $data['round'] = $match->round_name;
        $data['venue'] = $match->venue_id ? Venue::find($match->venue_id)?->name : null;
        $data['scheduled_at'] = $match->scheduled_at;

        if ($this->posterType === 'toss') {
            $data['toss_winner'] = $match->toss_winner_team_id ? Team::find($match->toss_winner_team_id)?->name : null;
            $data['toss_decision'] = TossService::decisionPhrase($match->toss_decision);
        }

        if (in_array($this->posterType, ['result', 'player_of_match'], true)) {
            $data['winner'] = $match->winner_team_id ? Team::find($match->winner_team_id)?->name : null;
            $data['result_summary'] = $match->result_summary;
        }

        if ($this->posterType === 'player_of_match') {
            $player = $match->man_of_the_match_player_id ? Player::find($match->man_of_the_match_player_id) : null;
            $data['player_name'] = $player?->full_name;
            $data['player_team'] = $player ? Team::find($player->team_id)?->name : null;
        }

        return $data;
    }

    /**
     * Everything each Blade partial actually renders — independent of
     * whether the art director succeeded, so this always runs.
     */
    private function viewDataFor(Tournament $tournament, ?GameMatch $match): array
    {
        $tournamentArr = [
            'name' => $tournament->name,
            'logo' => $tournament->logo,
            'sport_code' => $tournament->sport_code,
        ];
        $dateRange = $this->formatDateRange($tournament->start_date, $tournament->end_date);

        if ($this->posterType === 'points_table') {
            $standings = Standing::query()
                ->where('tournament_id', $tournament->id)
                ->orderBy('rank')
                ->get();

            return [
                'tournament' => $tournamentArr,
                'dateRange' => $dateRange,
                'standings' => $standings->map(fn (Standing $s) => [
                    'team_name' => Team::find($s->team_id)?->name ?: 'Unknown',
                    'played' => $s->played,
                    'won' => $s->won,
                    'lost' => $s->lost,
                    'points' => $s->points,
                ])->all(),
            ];
        }

        // Every remaining poster type (matchday, toss, result, player_of_match)
        // is tied to a specific match.
        $teamA = $this->teamArray(Team::find($match?->team_a_id));
        $teamB = $this->teamArray(Team::find($match?->team_b_id));
        $venue = $match?->venue_id ? Venue::find($match->venue_id) : null;
        $matchMeta = trim(implode(' · ', array_filter([
            $venue?->name,
            $this->formatDateRange($match?->scheduled_at, $match?->scheduled_at),
        ])));

        $common = [
            'tournament' => $tournamentArr,
            'dateRange' => $dateRange,
            'match' => ['round_name' => $match?->round_name],
            'teamA' => $teamA,
            'teamB' => $teamB,
            'matchMeta' => $matchMeta,
        ];

        if ($this->posterType === 'toss') {
            $winnerTeamModel = $match?->toss_winner_team_id ? Team::find($match->toss_winner_team_id) : null;

            return [
                ...$common,
                'winnerTeam' => $this->teamArray($winnerTeamModel) ?: $teamA,
                'decision' => TossService::decisionPhrase($match?->toss_decision),
            ];
        }

        if ($this->posterType === 'result') {
            $winnerTeamModel = $match?->winner_team_id ? Team::find($match->winner_team_id) : null;
            $cricketState = $match?->cricketState;
            $footballState = $match?->footballState;

            return [
                ...$common,
                'winnerTeam' => $this->teamArray($winnerTeamModel) ?: $teamA,
                'resultSummary' => $match?->result_summary ?: '',
                'teamAScore' => $cricketState
                    ? "{$cricketState->team_a_runs}/{$cricketState->team_a_wickets}"
                    : (string) ($footballState?->team_a_score ?? ''),
                'teamBScore' => $cricketState
                    ? "{$cricketState->team_b_runs}/{$cricketState->team_b_wickets}"
                    : (string) ($footballState?->team_b_score ?? ''),
            ];
        }

        if ($this->posterType === 'player_of_match') {
            $player = $match?->man_of_the_match_player_id ? Player::find($match->man_of_the_match_player_id) : null;

            return [
                ...$common,
                'player' => $player ? ['full_name' => $player->full_name, 'photo' => $player->photo] : ['full_name' => 'Player of the Match', 'photo' => ''],
                'team' => $player ? ($this->teamArray(Team::find($player->team_id)) ?: []) : [],
            ];
        }

        return $common;
    }

    /**
     * @return array{name: string, short_name: string, logo: string}
     */
    private function teamArray(?Team $team): array
    {
        if (! $team) {
            return ['name' => 'TBD', 'short_name' => 'TBD', 'logo' => ''];
        }

        return ['name' => $team->name, 'short_name' => $team->short_name, 'logo' => $team->logo];
    }

    /**
     * Used only when the art director is unconfigured or fails — plain,
     * real-data copy so the poster is still meaningful, just not as sharp as
     * an AI-written headline.
     *
     * @param  array{bg: string, accent: string, text: string}  $templatePalette
     */
    private function fallbackCopy(Tournament $tournament, ?GameMatch $match, array $templatePalette): array
    {
        $teamA = Team::find($match?->team_a_id)?->name ?: 'Team A';
        $teamB = Team::find($match?->team_b_id)?->name ?: 'Team B';

        [$headline, $subhead, $layout] = match ($this->posterType) {
            'matchday' => ["{$teamA} vs {$teamB}", $match?->round_name ?: $tournament->name, 'split_vs'],
            'toss' => [
                (Team::find($match?->toss_winner_team_id)?->name ?: $teamA).' Win The Toss',
                'Elect to '.ucwords(TossService::decisionPhrase($match?->toss_decision)),
                'centered',
            ],
            'result' => [
                (Team::find($match?->winner_team_id)?->name ?: $teamA).' Win!',
                $match?->result_summary ?: "{$teamA} vs {$teamB}",
                'stat_hero',
            ],
            'player_of_match' => ['Player of the Match', $tournament->name, 'centered'],
            'points_table' => ['Points Table', $tournament->name, 'centered'],
            default => [$tournament->name, '', 'centered'],
        };

        return [
            'headline' => $headline,
            'subhead' => $subhead,
            'palette' => $templatePalette,
            'layout' => $layout,
            'mood_prompt' => '',
        ];
    }

    private function formatDateRange(?string $start, ?string $end): string
    {
        if (! $start) {
            return '';
        }

        try {
            $startDate = Carbon::parse($start);
            $endDate = $end ? Carbon::parse($end) : $startDate;
        } catch (\Throwable) {
            return $start;
        }

        return $startDate->isSameDay($endDate)
            ? $startDate->format('jS M Y')
            : $startDate->format('jS M').' – '.$endDate->format('jS M Y');
    }

    /**
     * Picked fresh on every render, independent of the art director/AI
     * background — this is what guarantees "generate it again, get a
     * different-looking poster" even with no AI keys configured at all.
     */
    private function pickVariant(): string
    {
        return ['floodlight', 'blocks', 'stripes', 'halftone'][random_int(0, 3)];
    }

    /**
     * A handful of scattered translucent circles, randomised every render.
     *
     * @return array<int, array{x: float, y: float, size: int, color: string, opacity: float}>
     */
    private function randomBokeh(): array
    {
        $circles = [];

        for ($i = 0; $i < random_int(7, 11); $i++) {
            $circles[] = [
                'x' => random_int(0, 100),
                'y' => random_int(0, 100),
                'size' => random_int(30, 150),
                'color' => random_int(0, 1) ? '#ffffff' : 'var(--accent)',
                'opacity' => random_int(4, 16) / 100,
            ];
        }

        return $circles;
    }
}

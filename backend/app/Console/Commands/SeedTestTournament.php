<?php

namespace App\Console\Commands;

use App\Models\Player;
use App\Models\Sport;
use App\Models\Team;
use App\Models\Tournament;
use App\Models\Venue;
use App\Services\Fixtures\FixtureBuilder;
use App\Services\ScoringEngine;
use App\Support\Ids;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Spins up a throwaway tournament with N approved teams, full squads and a
 * generated fixture list — the setup you would otherwise reach by clicking
 * through the registration flow a dozen times.
 *
 * Dev only: it writes demo contacts and never touches the seeded data.
 */
class SeedTestTournament extends Command
{
    protected $signature = 'demo:tournament
        {--teams=10 : How many approved teams to create}
        {--sport=football : football or cricket}
        {--format=league_knockout : league, knockout, group_stage or league_knockout}
        {--squad=11 : Players per team}
        {--org= : Organization id (defaults to the first one)}
        {--name= : Tournament name}
        {--groups= : Number of groups, for the group formats}
        {--double-round : A league played home and away}
        {--no-fixtures : Create the teams but leave the schedule unbuilt}
        {--fresh : Delete previous demo:tournament tournaments in this organization first}';

    protected $description = 'Create a test tournament with N approved teams, squads and fixtures';

    /** Marks the tournaments this command created, so --fresh knows what to remove. */
    private const MARKER = 'Created by demo:tournament — test data.';

    public function handle(FixtureBuilder $fixtures, ScoringEngine $scoring): int
    {
        if (app()->environment('production')) {
            $this->error('Refusing to create test data in production.');

            return self::FAILURE;
        }

        $count = max(2, (int) $this->option('teams'));
        $squad = max(1, (int) $this->option('squad'));
        $sportCode = $this->option('sport') === 'cricket' ? 'cricket' : 'football';
        $format = in_array($this->option('format'), FixtureBuilder::FORMATS, true)
            ? $this->option('format')
            : 'league_knockout';

        $organizationId = $this->option('org') ?: DB::table('organizations')->value('id');

        if (! $organizationId) {
            $this->error('No organizations exist — run `php artisan migrate:fresh --seed` first.');

            return self::FAILURE;
        }

        if ($this->option('fresh')) {
            $stale = Tournament::query()
                ->where('organization_id', $organizationId)
                ->where('description', self::MARKER)
                ->pluck('id');

            Tournament::query()->whereIn('id', $stale)->delete();
            $this->line(sprintf('Removed %d previous test tournament(s).', $stale->count()));
        }

        $sportId = Sport::query()->where('code', $sportCode)->value('id') ?: 'sport-'.$sportCode;
        $name = $this->option('name') ?: sprintf('Test %s Cup (%d teams)', ucfirst($sportCode), $count);
        $slug = Ids::slug($name).'-'.Ids::token(4);

        $tournament = Tournament::create([
            'id' => Ids::timestamped('tourney'),
            'organization_id' => $organizationId,
            'sport_id' => $sportId,
            'sport_code' => $sportCode,
            'name' => $name,
            'slug' => $slug,
            'description' => self::MARKER,
            'location' => 'Test Ground',
            'village' => 'Testpuram',
            'district' => 'Malappuram',
            'state' => 'Kerala',
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addDays(14)->toDateString(),
            'registration_opening' => now()->subWeek()->toDateString(),
            'registration_closing' => now()->toDateString(),
            'format' => $format,
            'max_teams' => $count,
            'ground_fee' => 2000,
            'payment_config' => ['allow_partial' => true, 'min_partial_type' => 'percentage', 'min_partial_value' => 50],
            'prize_money' => 25000,
            'runner_up_prize' => 10000,
            'contact_person' => 'Test Organizer',
            'phone' => '+91 90000 00000',
            'whatsapp' => '+91 90000 00000',
            'status' => 'ongoing',
            'settings' => $sportCode === 'football'
                ? [
                    'squad_min_players' => 7,
                    'squad_max_players' => max(14, $squad),
                    'max_substitutes' => 5,
                    'football_format' => '11-a-side',
                    'match_duration_minutes' => 90,
                    'half_duration_minutes' => 45,
                    'extra_time_minutes' => 10,
                    'enable_penalty_shootout' => true,
                    'points_win' => 3,
                    'points_draw' => 1,
                    'points_loss' => 0,
                ]
                : [
                    'squad_min_players' => 11,
                    'squad_max_players' => max(15, $squad),
                    'overs_per_innings' => 20,
                    'max_overs_per_bowler' => 4,
                    'match_duration_minutes' => 180,
                    'points_win' => 2,
                    'points_loss' => 0,
                    'points_no_result' => 1,
                ],
            'has_auction' => false,
        ]);

        $teams = collect();

        for ($i = 0; $i < $count; $i++) {
            $letter = chr(65 + ($i % 26)).($i >= 26 ? (string) intdiv($i, 26) : '');
            $teamName = 'Test Team '.$letter;

            $team = Team::create([
                'id' => Ids::unique('team'),
                'tournament_id' => $tournament->id,
                'organization_id' => $organizationId,
                'name' => $teamName,
                'short_name' => 'TT'.$letter,
                'village' => 'Testpuram',
                'district' => 'Malappuram',
                'jersey_color' => sprintf('#%06X', crc32($teamName) & 0xFFFFFF),
                'captain_name' => $teamName.' Captain',
                'manager_name' => $teamName.' Manager',
                'manager_phone' => sprintf('+9190000%05d', 10000 + $i),
                'manager_whatsapp' => sprintf('+9190000%05d', 10000 + $i),
                'manager_email' => sprintf('team%d@example.test', $i + 1),
                'status' => 'approved',
            ]);

            for ($p = 1; $p <= $squad; $p++) {
                Player::create([
                    'id' => Ids::unique('player'),
                    'team_id' => $team->id,
                    'tournament_id' => $tournament->id,
                    'organization_id' => $organizationId,
                    'full_name' => sprintf('%s Player %d', $teamName, $p),
                    'age' => 18 + ($p % 15),
                    'mobile' => sprintf('+9198%03d%05d', $i, $p),
                    'jersey_number' => $p,
                    'is_captain' => $p === 1,
                    'is_wicketkeeper' => $sportCode === 'cricket' && $p === 2,
                    'football_position' => $sportCode === 'football'
                        ? ['Goalkeeper', 'Defender', 'Midfielder', 'Forward'][min(3, intdiv($p - 1, 3))]
                        : null,
                    'cricket_role' => $sportCode === 'cricket'
                        ? ['Batsman', 'Bowler', 'All-rounder', 'Wicketkeeper'][$p % 4]
                        : null,
                ]);
            }

            $teams->push($team);
        }

        $this->info(sprintf('Created "%s" with %d teams of %d players.', $tournament->name, $teams->count(), $squad));

        if ($this->option('no-fixtures')) {
            $this->line('Fixtures skipped (--no-fixtures).');
            $this->outputLinks($tournament);

            return self::SUCCESS;
        }

        if (! Venue::query()->where('organization_id', $organizationId)->exists()) {
            $this->warn('This organization has no venues — fixtures will carry times but no ground.');
        }

        $created = DB::transaction(fn () => $fixtures->build($tournament, $teams, [
            'format' => $format,
            'groups' => $this->option('groups') ? (int) $this->option('groups') : null,
            'double_round' => (bool) $this->option('double-round'),
            'start_date' => $tournament->start_date,
        ]));

        // Byes come out already completed and a group table starts empty, so the
        // table and the bracket both need settling once before anyone looks.
        $sportCode === 'football'
            ? $scoring->recalculateFootballStandings($tournament->id)
            : $scoring->recalculateCricketStandings($tournament->id);

        $this->info(sprintf('Generated %d fixtures (%s).', count($created), $format));
        $this->outputLinks($tournament);

        return self::SUCCESS;
    }

    private function outputLinks(Tournament $tournament): void
    {
        $client = rtrim((string) (config('app.frontend_url') ?: 'http://localhost:5173'), '/');

        $this->newLine();
        $this->line('  id:   '.$tournament->id);
        $this->line('  hub:  '.$client.'/t/'.$tournament->slug);
        $this->line('  api:  /api/tournaments/public/'.$tournament->slug);
    }
}

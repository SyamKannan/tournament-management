<?php

namespace Tests\Feature;

use App\Models\GameMatch;
use App\Models\Team;
use App\Models\Tournament;
use App\Models\Venue;
use App\Services\Fixtures\BracketService;
use App\Services\Fixtures\FixtureBuilder;
use App\Support\Ids;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Tests\TestCase;

/**
 * Fixture generation and knockout progression.
 *
 * What a "knockout" used to be: the approved teams paired in list order, one
 * flat round, no seeding, no byes, and no later rounds — a semi-final winner
 * produced no final because the final was never created. And every fixture was
 * given the organization's first ground at two-hour offsets from one instant.
 *
 * These cover the replacements: seeding that keeps the top two apart, byes for
 * an odd field, every round existing up front, winners moving on, a result being
 * undone taking them back out again, groups feeding a bracket, and a ground
 * never hosting two matches at once.
 */
class BracketTest extends TestCase
{
    private const ORG = 'org-green-valley';

    private FixtureBuilder $builder;

    private BracketService $brackets;

    protected function setUp(): void
    {
        parent::setUp();
        $this->builder = app(FixtureBuilder::class);
        $this->brackets = app(BracketService::class);
    }

    /* ----------------------------------------------------------- Knockout */

    public function test_a_knockout_creates_every_round_up_to_the_final(): void
    {
        [$tournament] = $this->tournamentWith(8, 'knockout');

        $matches = collect($this->builder->build($tournament, $this->teamsOf($tournament)));

        // 4 quarter-finals + 2 semi-finals + 1 final.
        $this->assertCount(7, $matches);
        $this->assertSame([4, 2, 1], $matches->groupBy('bracket_round')->map->count()->values()->all());
        $this->assertSame(
            ['Quarter-Final', 'Semi-Final', 'Final'],
            $matches->groupBy('bracket_round')->map(fn ($round) => $round->first()->round_name)->values()->all()
        );
    }

    public function test_later_rounds_wait_for_teams_and_say_what_they_are_waiting_for(): void
    {
        [$tournament] = $this->tournamentWith(4, 'knockout');

        $matches = collect($this->builder->build($tournament, $this->teamsOf($tournament)));
        $final = $matches->firstWhere('round_name', 'Final');

        $this->assertTrue($final->awaitsTeams());
        $this->assertSame('winner', $final->advance_from['a']['type']);
        $this->assertSame('winner', $final->advance_from['b']['type']);

        // And the two semi-finals are the matches it is waiting on.
        $semiIds = $matches->where('round_name', 'Semi-Final')->pluck('id')->sort()->values()->all();
        $waitingOn = collect([$final->advance_from['a']['match_id'], $final->advance_from['b']['match_id']])
            ->sort()->values()->all();

        $this->assertSame($semiIds, $waitingOn);
    }

    public function test_the_top_two_seeds_cannot_meet_before_the_final(): void
    {
        [$tournament, $teams] = $this->tournamentWith(8, 'knockout');

        $matches = collect($this->builder->build($tournament, $this->teamsOf($tournament)));
        $top = $teams[0]->id;
        $second = $teams[1]->id;

        $firstRound = $matches->where('bracket_round', 1);

        // Whatever else happens, they are not drawn against each other, and not
        // even in the same half of the draw.
        foreach ($firstRound as $match) {
            $pair = [$match->team_a_id, $match->team_b_id];
            $this->assertFalse(in_array($top, $pair, true) && in_array($second, $pair, true));
        }

        $half = fn (string $teamId) => $firstRound
            ->first(fn (GameMatch $m) => in_array($teamId, [$m->team_a_id, $m->team_b_id], true))
            ->bracket_position <= 2 ? 'top' : 'bottom';

        $this->assertNotSame($half($top), $half($second), 'the top two seeds belong in opposite halves');
    }

    public function test_a_field_that_is_not_a_power_of_two_gives_the_top_seeds_byes(): void
    {
        [$tournament, $teams] = $this->tournamentWith(6, 'knockout');

        $matches = collect($this->builder->build($tournament, $this->teamsOf($tournament)));
        $firstRound = $matches->where('bracket_round', 1);

        $byes = $firstRound->where('status', 'completed');
        $played = $firstRound->where('status', 'scheduled');

        // Six into a bracket of eight: two byes, two matches actually played.
        $this->assertCount(2, $byes);
        $this->assertCount(2, $played);

        // The byes belong to the two best seeds, and each is already through.
        $this->assertSame(
            [$teams[0]->id, $teams[1]->id],
            $byes->pluck('winner_team_id')->sort()->values()->all() === [$teams[0]->id, $teams[1]->id]
                ? [$teams[0]->id, $teams[1]->id]
                : $byes->pluck('winner_team_id')->sort()->values()->all()
        );
        $this->assertStringContainsString('Bye', (string) $byes->first()->result_summary);
    }

    public function test_a_two_team_knockout_is_just_a_final(): void
    {
        [$tournament] = $this->tournamentWith(2, 'knockout');

        $matches = collect($this->builder->build($tournament, $this->teamsOf($tournament)));

        $this->assertCount(1, $matches);
        $this->assertSame('Final', $matches->first()->round_name);
        $this->assertFalse($matches->first()->awaitsTeams());
        $this->assertNull($matches->first()->feeds_match_id, 'the final feeds nothing');
    }

    /* -------------------------------------------------------- Progression */

    public function test_winning_a_semi_final_puts_the_team_in_the_final(): void
    {
        [$tournament] = $this->tournamentWith(4, 'knockout');
        $matches = collect($this->builder->build($tournament, $this->teamsOf($tournament)));

        $semi = $matches->where('round_name', 'Semi-Final')->first();
        $winner = $semi->team_a_id;

        $this->completeMatch($semi, $winner);

        $final = GameMatch::find($matches->firstWhere('round_name', 'Final')->id);

        $this->assertContains($winner, [$final->team_a_id, $final->team_b_id]);
    }

    public function test_the_bracket_fills_in_order_so_one_pass_settles_it(): void
    {
        [$tournament] = $this->tournamentWith(4, 'knockout');
        $matches = collect($this->builder->build($tournament, $this->teamsOf($tournament)));
        $semis = $matches->where('round_name', 'Semi-Final')->values();

        // Both semis decided before anything syncs.
        foreach ($semis as $semi) {
            $semi->status = 'completed';
            $semi->winner_team_id = $semi->team_a_id;
            $semi->save();
        }

        $this->brackets->sync($tournament->id);

        $final = GameMatch::find($matches->firstWhere('round_name', 'Final')->id);

        $this->assertFalse($final->awaitsTeams(), 'a single sync should fill both sides of the final');
        $this->assertSame(
            $semis->pluck('team_a_id')->sort()->values()->all(),
            collect([$final->team_a_id, $final->team_b_id])->sort()->values()->all()
        );
    }

    public function test_undoing_a_semi_final_takes_the_wrong_team_back_out_of_the_final(): void
    {
        [$tournament] = $this->tournamentWith(4, 'knockout');
        $matches = collect($this->builder->build($tournament, $this->teamsOf($tournament)));
        $semi = $matches->where('round_name', 'Semi-Final')->first();

        $this->completeMatch($semi, $semi->team_a_id);
        $final = GameMatch::find($matches->firstWhere('round_name', 'Final')->id);
        $this->assertNotSame('', $final->team_a_id.$final->team_b_id);

        // The semi is reopened — the goal that decided it was undone.
        $semi->status = 'in_progress';
        $semi->winner_team_id = null;
        $semi->save();
        $this->brackets->sync($tournament->id);

        $final->refresh();

        $this->assertSame('', $final->team_a_id, 'the finalist must be withdrawn again');
    }

    public function test_correcting_a_result_replaces_the_team_that_went_through(): void
    {
        [$tournament] = $this->tournamentWith(4, 'knockout');
        $matches = collect($this->builder->build($tournament, $this->teamsOf($tournament)));
        $semi = $matches->where('round_name', 'Semi-Final')->first();
        $finalId = $matches->firstWhere('round_name', 'Final')->id;

        $this->completeMatch($semi, $semi->team_a_id);
        $this->completeMatch($semi->fresh(), $semi->team_b_id);

        $final = GameMatch::find($finalId);

        $this->assertContains($semi->team_b_id, [$final->team_a_id, $final->team_b_id]);
        $this->assertNotContains($semi->team_a_id, [$final->team_a_id, $final->team_b_id]);
    }

    public function test_a_match_already_under_way_is_not_rewritten_underneath_it(): void
    {
        [$tournament] = $this->tournamentWith(4, 'knockout');
        $matches = collect($this->builder->build($tournament, $this->teamsOf($tournament)));
        $semi = $matches->where('round_name', 'Semi-Final')->first();
        $final = GameMatch::find($matches->firstWhere('round_name', 'Final')->id);

        $this->completeMatch($semi, $semi->team_a_id);
        $final->refresh();
        $wasPlaying = $final->team_a_id;

        // The final has kicked off. Reopening the semi now must not swap a team
        // out from under a live scoreboard.
        $final->status = 'in_progress';
        $final->save();

        $semi->status = 'in_progress';
        $semi->winner_team_id = null;
        $semi->save();
        $this->brackets->sync($tournament->id);

        $this->assertSame($wasPlaying, $final->fresh()->team_a_id);
    }

    public function test_a_bye_carries_its_team_into_the_next_round_immediately(): void
    {
        [$tournament, $teams] = $this->tournamentWith(6, 'knockout');
        $matches = collect($this->builder->build($tournament, $this->teamsOf($tournament)));

        $this->brackets->sync($tournament->id);

        $semis = GameMatch::query()
            ->where('tournament_id', $tournament->id)
            ->where('bracket_round', 2)
            ->get();

        // The two teams that got byes are already in the semi-finals.
        $through = $semis->flatMap(fn (GameMatch $m) => [$m->team_a_id, $m->team_b_id])->filter()->values();

        $this->assertContains($teams[0]->id, $through->all());
        $this->assertContains($teams[1]->id, $through->all());
    }

    /* ------------------------------------------------------------- League */

    public function test_a_league_plays_every_pairing_once(): void
    {
        [$tournament] = $this->tournamentWith(5, 'league');

        $matches = collect($this->builder->build($tournament, $this->teamsOf($tournament)));

        // Five teams: 5 * 4 / 2.
        $this->assertCount(10, $matches);

        $pairings = $matches->map(fn (GameMatch $m) => collect([$m->team_a_id, $m->team_b_id])->sort()->implode('-'));
        $this->assertSame(10, $pairings->unique()->count(), 'no pairing should be played twice');
    }

    public function test_a_league_round_never_asks_a_team_to_play_twice(): void
    {
        [$tournament] = $this->tournamentWith(6, 'league');

        $matches = collect($this->builder->build($tournament, $this->teamsOf($tournament)));

        foreach ($matches->groupBy('round_name') as $roundName => $round) {
            $appearances = $round->flatMap(fn (GameMatch $m) => [$m->team_a_id, $m->team_b_id]);

            $this->assertSame(
                $appearances->count(),
                $appearances->unique()->count(),
                "a team appears twice in {$roundName}"
            );
        }
    }

    public function test_a_double_round_league_plays_everyone_home_and_away(): void
    {
        [$tournament] = $this->tournamentWith(4, 'league');

        $matches = collect($this->builder->build($tournament, $this->teamsOf($tournament), ['double_round' => true]));

        $this->assertCount(12, $matches);

        // Every ordered pairing exactly once: A-B and B-A both appear.
        $ordered = $matches->map(fn (GameMatch $m) => $m->team_a_id.'>'.$m->team_b_id);
        $this->assertSame(12, $ordered->unique()->count());
    }

    /* ------------------------------------------------------------- Groups */

    public function test_a_group_stage_splits_the_teams_and_records_who_is_where(): void
    {
        [$tournament] = $this->tournamentWith(8, 'group_stage');

        $matches = collect($this->builder->build($tournament, $this->teamsOf($tournament), ['groups' => 2]));

        $groups = $matches->pluck('group_name')->unique()->sort()->values()->all();
        $this->assertSame(['Group A', 'Group B'], $groups);

        // Four teams per group, each playing the other three.
        foreach ($matches->groupBy('group_name') as $groupMatches) {
            $this->assertCount(6, $groupMatches);
        }
    }

    public function test_groups_are_seeded_serpentine_so_the_strongest_are_spread_out(): void
    {
        [$tournament, $teams] = $this->tournamentWith(8, 'group_stage');

        $groups = $this->builder->assignGroups($this->teamsOf($tournament), 2);

        $groupOf = fn (string $teamId) => collect($groups)
            ->search(fn (array $members) => collect($members)->contains(fn (Team $t) => $t->id === $teamId));

        // Seeds one and two must not end up in the same group.
        $this->assertNotSame($groupOf($teams[0]->id), $groupOf($teams[1]->id));
    }

    public function test_a_group_of_one_is_folded_into_another_group(): void
    {
        [$tournament] = $this->tournamentWith(5, 'group_stage');

        $groups = $this->builder->assignGroups($this->teamsOf($tournament), 4);

        foreach ($groups as $name => $members) {
            $this->assertGreaterThanOrEqual(2, count($members), "{$name} has nobody to play");
        }
    }

    public function test_a_league_knockout_puts_the_group_qualifiers_into_a_bracket(): void
    {
        [$tournament] = $this->tournamentWith(8, 'league_knockout');

        $matches = collect($this->builder->build($tournament, $this->teamsOf($tournament), ['groups' => 2]));
        $bracket = $matches->whereNotNull('bracket_round');

        // Two groups, two qualifiers each: semi-finals and a final.
        $this->assertCount(3, $bracket);

        $semis = $bracket->where('bracket_round', 1);
        $sources = $semis->flatMap(fn (GameMatch $m) => [$m->advance_from['a'], $m->advance_from['b']]);

        $this->assertTrue($sources->every(fn (array $s) => $s['type'] === 'group'));

        // A group winner meets the other group's runner-up, never its own.
        foreach ($semis as $semi) {
            $this->assertNotSame(
                $semi->advance_from['a']['group'],
                $semi->advance_from['b']['group'],
                'a group winner should not face its own runner-up in the semi-final'
            );
        }
    }

    public function test_the_knockout_is_seeded_only_once_the_groups_have_finished(): void
    {
        [$tournament] = $this->tournamentWith(4, 'league_knockout');
        $matches = collect($this->builder->build($tournament, $this->teamsOf($tournament), ['groups' => 1]));

        $groupMatches = $matches->whereNull('bracket_round');
        $bracket = $matches->whereNotNull('bracket_round');

        $this->assertNotEmpty($bracket, 'a league_knockout should produce a bracket');

        // One group match decided is not a final table.
        $first = $groupMatches->first();
        $this->completeMatch($first, $first->team_a_id);

        $this->assertTrue(
            GameMatch::find($bracket->first()->id)->awaitsTeams(),
            'the bracket must not be seeded off a half-played group'
        );

        foreach ($groupMatches as $match) {
            $this->completeMatch($match->fresh(), $match->team_a_id);
        }

        $this->assertFalse(
            GameMatch::find($bracket->first()->id)->awaitsTeams(),
            'once every group match is done the qualifiers are known'
        );
    }

    /* ------------------------------------------------- Grounds and clocks */

    public function test_a_ground_never_hosts_two_matches_at_the_same_time(): void
    {
        $this->addVenue('Second Ground');
        $this->addVenue('Third Ground');

        [$tournament] = $this->tournamentWith(6, 'league');

        $matches = collect($this->builder->build($tournament, $this->teamsOf($tournament)));

        $slots = $matches->map(fn (GameMatch $m) => $m->venue_id.'@'.$m->scheduled_at);

        $this->assertSame($slots->count(), $slots->unique()->count(), 'a ground was double-booked');
    }

    public function test_every_available_ground_is_used(): void
    {
        $this->addVenue('Second Ground');
        $this->addVenue('Third Ground');

        [$tournament] = $this->tournamentWith(8, 'league');

        $matches = collect($this->builder->build($tournament, $this->teamsOf($tournament)));

        $this->assertSame(3, $matches->pluck('venue_id')->unique()->count(), 'the club has three grounds');
    }

    public function test_fixtures_start_on_the_date_they_were_asked_for(): void
    {
        [$tournament] = $this->tournamentWith(4, 'league');
        $start = Carbon::parse('2027-01-15 16:00');

        $matches = collect($this->builder->build($tournament, $this->teamsOf($tournament), [
            'start_date' => $start->toDateTimeString(),
        ]));

        $first = Carbon::parse($matches->first()->scheduled_at);

        $this->assertSame($start->format('Y-m-d H:i'), $first->format('Y-m-d H:i'));
    }

    public function test_a_bare_date_kicks_off_in_the_afternoon_not_at_midnight(): void
    {
        [$tournament] = $this->tournamentWith(4, 'league');

        $matches = collect($this->builder->build($tournament, $this->teamsOf($tournament), [
            'start_date' => '2027-02-20',
        ]));

        $this->assertSame('15:00', Carbon::parse($matches->first()->scheduled_at)->format('H:i'));
    }

    /* ---------------------------------------------------------------- API */

    public function test_the_bracket_endpoint_describes_each_side_before_it_is_known(): void
    {
        [$tournament] = $this->tournamentWith(4, 'knockout');
        $this->builder->build($tournament, $this->teamsOf($tournament));

        $response = $this->getJson('/api/matches/bracket/'.$tournament->id)
            ->assertOk()
            ->assertJsonStructure([
                'has_bracket',
                'rounds' => [['round', 'name', 'matches' => [['id', 'side_a' => ['team_id', 'team_name', 'source_label'], 'side_b']]]],
            ]);

        $final = collect($response->json('rounds'))->firstWhere('name', 'Final');

        $this->assertNull($final['matches'][0]['side_a']['team_id']);
        $this->assertStringContainsString('Winner of', $final['matches'][0]['side_a']['source_label']);
    }

    public function test_the_bracket_endpoint_is_public_and_hides_a_draft(): void
    {
        [$tournament] = $this->tournamentWith(4, 'knockout');
        $this->builder->build($tournament, $this->teamsOf($tournament));

        // No login: the hub and the stadium screen both read this.
        $this->getJson('/api/matches/bracket/'.$tournament->id)->assertOk();

        $tournament->status = 'draft';
        $tournament->save();

        $this->getJson('/api/matches/bracket/'.$tournament->id)->assertNotFound();
    }

    public function test_the_bracket_endpoint_names_the_champion(): void
    {
        [$tournament] = $this->tournamentWith(2, 'knockout');
        $matches = collect($this->builder->build($tournament, $this->teamsOf($tournament)));
        $final = $matches->first();

        $this->completeMatch($final, $final->team_a_id);

        $this->assertSame(
            $final->team_a_id,
            $this->getJson('/api/matches/bracket/'.$tournament->id)->assertOk()->json('champion.id')
        );
    }

    public function test_a_league_has_no_bracket_to_show(): void
    {
        [$tournament] = $this->tournamentWith(4, 'league');
        $this->builder->build($tournament, $this->teamsOf($tournament));

        $this->getJson('/api/matches/bracket/'.$tournament->id)
            ->assertOk()
            ->assertJsonPath('has_bracket', false);
    }

    public function test_generating_fixtures_through_the_api_records_the_groups_on_the_teams(): void
    {
        [$tournament] = $this->tournamentWith(8, 'league_knockout');
        $this->actingAsUser('admin@greenvalley.com');

        $this->postJson('/api/matches/auto-generate-fixtures', [
            'tournament_id' => $tournament->id,
            'format' => 'league_knockout',
            'groups' => 2,
        ])->assertCreated();

        $groups = Team::query()
            ->where('tournament_id', $tournament->id)
            ->pluck('group_name')
            ->unique()
            ->sort()
            ->values()
            ->all();

        $this->assertSame(['Group A', 'Group B'], $groups);
    }

    public function test_the_old_round_robin_format_name_still_works(): void
    {
        [$tournament] = $this->tournamentWith(4, 'league');
        $this->actingAsUser('admin@greenvalley.com');

        $this->postJson('/api/matches/auto-generate-fixtures', [
            'tournament_id' => $tournament->id,
            'format' => 'round_robin',
        ])->assertCreated();

        $this->assertSame(6, GameMatch::query()->where('tournament_id', $tournament->id)->count());
    }

    /* ------------------------------------------------------------- Venues */

    public function test_an_organizer_manages_their_grounds(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $id = $this->postJson('/api/venues', [
            'name' => 'Panchayat Stadium',
            'village' => 'Kottappadi',
            'district' => 'Malappuram',
        ])->assertCreated()->json('id');

        $this->putJson("/api/venues/{$id}", ['name' => 'Panchayat Stadium (Main)'])->assertOk();

        $this->assertSame('Panchayat Stadium (Main)', Venue::find($id)->name);

        $this->deleteJson("/api/venues/{$id}")->assertOk();
        $this->assertNull(Venue::find($id));
    }

    public function test_removing_a_ground_releases_its_scheduled_fixtures(): void
    {
        $venue = $this->addVenue('Temporary Ground');
        [$tournament] = $this->tournamentWith(4, 'league');

        GameMatch::query()->where('tournament_id', $tournament->id)->delete();
        $match = GameMatch::create([
            'id' => Ids::unique('match'),
            'tournament_id' => $tournament->id,
            'organization_id' => self::ORG,
            'sport_code' => 'football',
            'team_a_id' => $this->teamsOf($tournament)[0]->id,
            'team_b_id' => $this->teamsOf($tournament)[1]->id,
            'venue_id' => $venue->id,
            'status' => 'scheduled',
        ]);

        $this->actingAsUser('admin@greenvalley.com');
        $this->deleteJson("/api/venues/{$venue->id}")
            ->assertOk()
            ->assertJsonPath('released_fixtures', 1);

        $this->assertNull($match->fresh()->venue_id, 'a fixture must not point at a ground that is gone');
    }

    public function test_a_ground_that_has_hosted_a_match_cannot_be_removed(): void
    {
        $venue = $this->addVenue('Historic Ground');
        [$tournament] = $this->tournamentWith(4, 'league');

        GameMatch::create([
            'id' => Ids::unique('match'),
            'tournament_id' => $tournament->id,
            'organization_id' => self::ORG,
            'sport_code' => 'football',
            'team_a_id' => $this->teamsOf($tournament)[0]->id,
            'team_b_id' => $this->teamsOf($tournament)[1]->id,
            'venue_id' => $venue->id,
            'status' => 'completed',
        ]);

        $this->actingAsUser('admin@greenvalley.com');

        $this->deleteJson("/api/venues/{$venue->id}")
            ->assertStatus(409)
            ->assertJsonPath('played_count', 1);

        $this->assertNotNull(Venue::find($venue->id));
    }

    public function test_one_club_cannot_touch_another_clubs_grounds(): void
    {
        $venue = $this->addVenue('Green Valley Ground');

        $this->actingAsUser('admin@malabar.com');

        $this->putJson("/api/venues/{$venue->id}", ['name' => 'Ours Now'])->assertForbidden();
        $this->deleteJson("/api/venues/{$venue->id}")->assertForbidden();
    }

    public function test_adding_a_ground_needs_a_login(): void
    {
        $this->postJson('/api/venues', ['name' => 'Anywhere'])->assertUnauthorized();
    }

    /* ----------------------------------------------------------- Helpers */

    /**
     * A tournament of its own with `$count` approved teams, seeded in the order
     * they are created — the tests treat that order as the seeding.
     *
     * @return array{0: Tournament, 1: array<int, Team>}
     */
    private function tournamentWith(int $count, string $format): array
    {
        $tournament = Tournament::create([
            'id' => Ids::unique('tourney'),
            'organization_id' => self::ORG,
            'sport_id' => 'sport-football',
            'sport_code' => 'football',
            'name' => 'Bracket Test Cup',
            'slug' => 'bracket-test-'.Ids::token(6),
            'format' => $format,
            'status' => 'registration_closed',
            'start_date' => '2027-03-01',
            'payment_config' => [],
            'settings' => ['match_duration_minutes' => 60, 'half_duration_minutes' => 30],
        ]);

        $teams = [];

        for ($i = 1; $i <= $count; $i++) {
            $teams[] = Team::create([
                'id' => Ids::unique('team'),
                'tournament_id' => $tournament->id,
                'organization_id' => self::ORG,
                'name' => 'Seed '.$i,
                'short_name' => 'S'.$i,
                'status' => 'approved',
                'manager_name' => 'Manager '.$i,
                'manager_phone' => '94470000'.str_pad((string) $i, 2, '0', STR_PAD_LEFT),
            ]);
        }

        return [$tournament, $teams];
    }

    /** @return Collection<int, Team> */
    private function teamsOf(Tournament $tournament): Collection
    {
        return Team::query()
            ->where('tournament_id', $tournament->id)
            ->where('status', 'approved')
            ->orderBy('name')
            ->get()
            ->values();
    }

    /**
     * Record a result the way finishing a match does.
     *
     * Through the standings recalculation rather than calling `sync()` straight,
     * because that is the real path: the table has to be rebuilt before the
     * bracket can read a group's qualifiers off it, and the recalculation is
     * what triggers the sync.
     */
    private function completeMatch(GameMatch $match, string $winnerId): void
    {
        $match->status = 'completed';
        $match->winner_team_id = $winnerId;
        $match->save();

        app(\App\Services\ScoringEngine::class)->recalculateFootballStandings($match->tournament_id);
    }

    private function addVenue(string $name): Venue
    {
        return Venue::create([
            'id' => Ids::unique('venue'),
            'organization_id' => self::ORG,
            'name' => $name,
            'created_at' => now(),
        ]);
    }
}

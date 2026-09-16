<?php

namespace Tests\Feature;

use App\Models\GameMatch;
use App\Models\MatchLineup;
use App\Models\Player;
use App\Models\Tournament;
use App\Models\User;
use App\Services\PlayerStatsService;
use App\Services\ScoringEngine;
use Tests\TestCase;

/**
 * Player statistics are read off the scoring logs, so these tests score real
 * balls and events through the engine and check the numbers that come back —
 * and that undo, cancellation and unplayed fixtures are reflected without any
 * stats being written.
 *
 * The seeded live matches are cancelled first, so every total below comes
 * from the fixture each test scores and can be asserted exactly.
 */
class PlayerStatsTest extends TestCase
{
    private const CRICKET = 'tourney-cricket-t20';

    private const FOOTBALL = 'tourney-football-sevens';

    private const KINGS = 'team-kozhikode-kings';

    private const WARRIORS = 'team-coastal-warriors';

    private const BLASTERS = 'team-malabar-blasters';

    private const STRIKERS = 'team-green-valley-strikers';

    private ScoringEngine $scoring;

    private PlayerStatsService $stats;

    protected function setUp(): void
    {
        parent::setUp();

        $this->scoring = app(ScoringEngine::class);
        $this->stats = app(PlayerStatsService::class);

        GameMatch::query()->whereIn('id', ['match-crick-live-1', 'match-fb-live-1'])->update(['status' => 'cancelled']);
    }

    /* -------------------------------------------------------------- Cricket */

    public function test_batting_figures_come_from_the_deliveries(): void
    {
        $this->scoreCricketOvers();

        $opener = $this->cricket('pl-kk-1');
        $this->assertSame(1, $opener['matches']);
        $this->assertSame(1, $opener['innings_batted']);
        $this->assertSame(10, $opener['runs_scored']);
        $this->assertSame(4, $opener['balls_faced'], 'a wide is not a ball faced; a bye is');
        $this->assertSame(1, $opener['fours']);
        $this->assertSame(1, $opener['sixes']);
        $this->assertSame(10, $opener['highest_score']);
        $this->assertFalse($opener['highest_score_not_out']);
        $this->assertEquals(10.0, $opener['batting_average']);
        $this->assertEquals(250.0, $opener['strike_rate']);
        $this->assertSame(0, $opener['not_outs']);

        $runOut = $this->cricket('pl-kk-2');
        $this->assertSame(1, $runOut['innings_batted'], 'run out at the non-striker’s end is still an innings');
        $this->assertSame(1, $runOut['ducks']);
        $this->assertNull($runOut['strike_rate'], 'no balls faced, no strike rate');

        $notOut = $this->cricket('pl-kk-3');
        $this->assertSame(1, $notOut['runs_scored']);
        $this->assertSame(8, $notOut['balls_faced']);
        $this->assertSame(1, $notOut['not_outs']);
        $this->assertNull($notOut['batting_average'], 'never dismissed, no average');
        $this->assertTrue($notOut['highest_score_not_out']);
    }

    public function test_bowling_and_fielding_figures_come_from_the_deliveries(): void
    {
        $this->scoreCricketOvers();

        $opening = $this->cricket('pl-cw-3');
        $this->assertSame(1, $opening['innings_bowled']);
        $this->assertSame(6, $opening['balls_bowled']);
        $this->assertEquals(1.0, $opening['overs_bowled']);
        $this->assertSame(12, $opening['runs_conceded'], 'the wide is charged, the byes are not');
        $this->assertSame(1, $opening['wickets_taken'], 'the catch counts, the run out does not');
        $this->assertSame(0, $opening['maidens']);
        $this->assertEquals(12.0, $opening['economy_rate']);
        $this->assertEquals(12.0, $opening['bowling_average']);
        $this->assertSame(1, $opening['best_bowling_wickets']);
        $this->assertSame(12, $opening['best_bowling_runs']);

        $maiden = $this->cricket('pl-cw-1');
        $this->assertSame(1, $maiden['maidens']);
        $this->assertEquals(0.0, $maiden['economy_rate']);
        $this->assertNull($maiden['bowling_average']);
        $this->assertSame(1, $maiden['catches']);

        $this->assertSame(1, $this->cricket('pl-cw-2')['run_outs']);
    }

    public function test_a_player_on_the_team_sheet_who_did_not_bat_or_bowl_still_played(): void
    {
        $this->scoreCricketOvers();

        $benchless = $this->cricket('pl-kk-5');
        $this->assertSame(1, $benchless['matches']);
        $this->assertSame(0, $benchless['innings_batted']);
        $this->assertNull($benchless['highest_score']);
    }

    public function test_undo_takes_the_ball_back_off_the_stats(): void
    {
        $this->scoreCricketOvers();

        $this->scoring->undoLastCricketBall('match-stats-cricket');

        $this->assertSame(0, $this->cricket('pl-cw-1')['maidens'], 'five balls are not a maiden');
        $this->assertSame(5, $this->cricket('pl-cw-1')['balls_bowled']);
        $this->assertSame(7, $this->cricket('pl-kk-3')['balls_faced']);
    }

    public function test_a_cancelled_match_drops_out_of_the_stats(): void
    {
        $this->scoreCricketOvers();

        GameMatch::query()->whereKey('match-stats-cricket')->update(['status' => 'cancelled']);

        $this->assertSame(0, $this->cricket('pl-kk-1')['matches']);
        $this->assertSame(0, $this->cricket('pl-kk-1')['runs_scored']);
        $this->assertSame(0, $this->cricket('pl-cw-3')['wickets_taken']);
    }

    public function test_a_team_sheet_for_a_match_not_yet_played_is_not_an_appearance(): void
    {
        $this->cricketMatch();

        $this->assertSame(0, $this->cricket('pl-kk-5')['matches']);
    }

    public function test_a_player_with_no_matches_starts_at_zero_with_nothing_invented(): void
    {
        $stats = $this->stats->forPlayer(Player::findOrFail('pl-kk-4'));

        $this->assertSame(0, $stats['cricket']['matches']);
        $this->assertSame(0, $stats['cricket']['runs_scored']);
        $this->assertSame(0, $stats['cricket']['wickets_taken']);
        $this->assertSame([], $stats['recent_performances']);
        $this->assertSame([], $stats['awards']);
    }

    public function test_the_match_log_reads_like_a_scorebook(): void
    {
        $this->scoreCricketOvers();
        GameMatch::query()->whereKey('match-stats-cricket')->update(['man_of_the_match_player_id' => 'pl-cw-1']);

        $opener = $this->stats->matchLog(Player::findOrFail('pl-kk-1'))[0];
        $this->assertSame('match-stats-cricket', $opener['match_id']);
        $this->assertSame('Coastal Warriors CC', $opener['opponent_name']);
        $this->assertSame('10 (4)', $opener['summary']);
        $this->assertSame(10, $opener['cricket']['batting']['runs']);
        $this->assertFalse($opener['cricket']['batting']['not_out']);
        $this->assertNull($opener['cricket']['bowling']);

        $bowler = $this->stats->matchLog(Player::findOrFail('pl-cw-3'))[0];
        $this->assertSame('1/12 (1.0 ov)', $bowler['summary']);

        $maiden = $this->stats->forPlayer(Player::findOrFail('pl-cw-1'));
        $this->assertSame('0/0 (1.0 ov), 1 ct', $maiden['recent_performances'][0]['summary']);
        $this->assertTrue($maiden['recent_performances'][0]['player_of_match']);
        $this->assertSame(1, $maiden['cricket']['player_of_match_count']);
        $this->assertSame('Player of the Match', $maiden['awards'][0]['title']);
    }

    /* ------------------------------------------------------------- Football */

    public function test_goals_assists_cards_and_clean_sheets_come_from_the_events(): void
    {
        $this->scoreFootballMatch();

        $midfielder = $this->football('pl-mb-3');
        $this->assertSame(1, $midfielder['matches']);
        $this->assertSame(2, $midfielder['goals']);
        $this->assertSame(1, $midfielder['penalties_scored']);
        $this->assertEquals(2.0, $midfielder['goals_per_match']);

        $striker = $this->football('pl-mb-4');
        $this->assertSame(1, $striker['assists'], 'an assist on the open-play goal only');
        $this->assertSame(1, $striker['yellow_cards']);

        $keeper = $this->football('pl-mb-1');
        $this->assertSame(1, $keeper['matches'], 'on the team sheet');
        $this->assertSame(1, $keeper['clean_sheets']);

        $this->assertSame(1, $this->football('pl-gvs-2')['penalties_missed']);
        $this->assertSame(0, $this->football('pl-gvs-1')['clean_sheets'], 'conceded two');

        $log = $this->stats->matchLog(Player::findOrFail('pl-mb-3'))[0];
        $this->assertSame('won', $log['result']);
        $this->assertSame('2 goals (1 pen)', $log['summary']);
    }

    public function test_undoing_an_event_takes_it_off_the_stats(): void
    {
        $this->scoreFootballMatch();

        $this->scoring->updateFootballTimer('match-stats-football', 'reopen');
        $this->scoring->undoLastFootballEvent('match-stats-football');
        $this->scoring->undoLastFootballEvent('match-stats-football');

        $this->assertSame(0, $this->football('pl-mb-4')['yellow_cards']);
        $this->assertSame(0, $this->football('pl-gvs-2')['penalties_missed']);
        $this->assertSame(2, $this->football('pl-mb-3')['goals']);
    }

    /* --------------------------------------------------------------- Career */

    public function test_a_career_joins_squad_entries_through_the_players_account(): void
    {
        $this->scoreFootballMatch();

        // The same person, registered for another tournament with their
        // number typed differently.
        Player::create([
            'id' => 'pl-shameer-highland',
            'team_id' => 'team-highland-test',
            'tournament_id' => 'tourney-highland-7s',
            'organization_id' => 'org-green-valley',
            'full_name' => 'Shameer Babu',
            'mobile' => '9847188881',
            'jersey_number' => 1,
            'football_position' => 'Goalkeeper',
        ]);

        $career = $this->stats->career(Player::findOrFail('pl-mb-1'));

        $this->assertTrue($career['linked_to_account']);
        $this->assertSame(2, $career['tournaments_count']);
        $this->assertSame(1, $career['football']['matches']);
        $this->assertSame(1, $career['football']['clean_sheets']);
        $this->assertNull($career['cricket']);

        Tournament::query()->whereKey('tourney-highland-7s')->update(['status' => 'draft']);

        $this->assertSame(1, $this->stats->career(Player::findOrFail('pl-mb-1'))['tournaments_count'], 'drafts stay private');
    }

    public function test_a_player_without_an_account_has_a_one_tournament_career(): void
    {
        $career = $this->stats->career(Player::findOrFail('pl-mb-3'));

        $this->assertFalse($career['linked_to_account']);
        $this->assertSame(1, $career['tournaments_count']);
    }

    /* ------------------------------------------------------------ Public API */

    public function test_the_public_endpoints_need_no_login_and_return_their_shapes(): void
    {
        $this->scoreFootballMatch();

        $this->getJson('/api/players/pl-mb-3/matches?per_page=5')
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('meta.per_page', 5)
            ->assertJsonStructure([
                'player' => ['id', 'full_name'],
                'data' => ['*' => ['match_id', 'date', 'team_name', 'opponent_name', 'result', 'summary', 'player_of_match', 'football']],
                'meta' => ['page', 'per_page', 'total', 'last_page'],
            ]);

        $this->getJson('/api/players/pl-mb-1/career')
            ->assertOk()
            ->assertJsonStructure([
                'player' => ['id', 'full_name'],
                'career' => ['linked_to_account', 'tournaments_count', 'cricket', 'football', 'tournaments' => ['*' => ['tournament', 'team_name', 'stats']], 'awards'],
            ]);
    }

    public function test_the_tournament_stats_table_sorts_filters_and_pages(): void
    {
        $this->scoreFootballMatch();

        $response = $this->getJson('/api/players/tournament/malappuram-7s-football-2026/stats?sort=goals&per_page=3')
            ->assertOk()
            ->assertJsonPath('sport', 'football')
            ->assertJsonPath('sort', 'goals')
            ->assertJsonPath('meta.per_page', 3)
            ->assertJsonPath('data.0.player_id', 'pl-mb-3')
            ->assertJsonPath('data.0.stats.goals', 2)
            ->assertJsonStructure(['tournament' => ['id', 'name', 'slug'], 'sort_options', 'data' => ['*' => ['player_id', 'full_name', 'team_name', 'role', 'stats']], 'meta']);

        $this->assertCount(3, $response->json('data'));

        $strikers = $this->getJson('/api/players/tournament/'.self::FOOTBALL.'/stats?team='.self::STRIKERS.'&per_page=100')->assertOk();
        $this->assertNotEmpty($strikers->json('data'));
        $this->assertSame([self::STRIKERS], array_values(array_unique(array_column($strikers->json('data'), 'team_id'))));

        $this->getJson('/api/players/tournament/'.self::FOOTBALL.'/stats?search=shameer')
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.player_id', 'pl-mb-1');

        // An unknown sort falls back to the sport's headline stat.
        $this->getJson('/api/players/tournament/'.self::FOOTBALL.'/stats?sort=nonsense')->assertOk()->assertJsonPath('sort', 'goals');
    }

    public function test_bowlers_who_have_not_bowled_sort_last_on_economy(): void
    {
        $this->scoreCricketOvers();

        $rows = $this->getJson('/api/players/tournament/'.self::CRICKET.'/stats?sort=economy&per_page=100')->assertOk()->json('data');

        $this->assertSame('pl-cw-1', $rows[0]['player_id']);
        $this->assertSame('pl-cw-3', $rows[1]['player_id']);
        $this->assertNull($rows[2]['stats']['economy_rate']);
    }

    public function test_a_player_can_find_their_stats_by_name_without_logging_in(): void
    {
        $this->scoreFootballMatch();

        $this->getJson('/api/players/search?q=SHAMEER')
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.player_id', 'pl-mb-1')
            ->assertJsonPath('data.0.team_name', 'Malabar Blasters FC')
            ->assertJsonPath('data.0.tournament.slug', 'malappuram-7s-football-2026')
            ->assertJsonPath('data.0.headline.matches', 1)
            ->assertJsonStructure(['data' => ['*' => ['player_id', 'full_name', 'photo', 'role', 'team_name', 'organization_name', 'tournament', 'headline']], 'meta']);

        $this->assertArrayNotHasKey('mobile', $this->getJson('/api/players/search?q=shameer')->json('data.0'));
    }

    public function test_player_search_needs_two_letters_and_treats_wildcards_literally(): void
    {
        $this->getJson('/api/players/search?q=a')->assertStatus(422);
        $this->getJson('/api/players/search?q=%25%25')->assertOk()->assertJsonPath('meta.total', 0);
        $this->getJson('/api/players/search?q=__')->assertOk()->assertJsonPath('meta.total', 0);
    }

    public function test_player_search_skips_draft_tournaments_and_filters_by_sport(): void
    {
        $this->getJson('/api/players/search?q=shameer&sport=cricket')->assertOk()->assertJsonPath('meta.total', 0);

        Tournament::query()->whereKey(self::FOOTBALL)->update(['status' => 'draft']);

        $this->getJson('/api/players/search?q=shameer')->assertOk()->assertJsonPath('meta.total', 0);
    }

    /* ---------------------------------------------------------- Player Code */

    public function test_every_player_has_an_easy_to_type_player_code(): void
    {
        $codes = Player::query()->pluck('player_code');

        $this->assertNotEmpty($codes);
        foreach ($codes as $code) {
            $this->assertMatchesRegularExpression('/^SP-[2346789ABCDEFGHJKMNPQRTUVWXYZ]{5}$/', (string) $code);
        }

        $created = Player::create([
            'id' => 'pl-code-new',
            'team_id' => self::STRIKERS,
            'tournament_id' => self::FOOTBALL,
            'organization_id' => 'org-green-valley',
            'full_name' => 'New Signing',
        ]);
        $this->assertMatchesRegularExpression('/^SP-[A-Z0-9]{5}$/', $created->player_code);
    }

    public function test_a_player_keeps_one_code_across_tournaments(): void
    {
        $again = Player::create([
            'id' => 'pl-shameer-highland',
            'team_id' => 'team-highland-test',
            'tournament_id' => 'tourney-highland-7s',
            'organization_id' => 'org-green-valley',
            'full_name' => 'Shameer Babu',
            'mobile' => '9847188881',
        ]);

        $this->assertSame(Player::findOrFail('pl-mb-1')->player_code, $again->player_code);
    }

    public function test_a_managers_own_number_on_every_player_does_not_share_one_code(): void
    {
        $manager = User::query()->where('role', '!=', 'PLAYER')->where('phone', '!=', '')->firstOrFail();

        $first = Player::create(['id' => 'pl-kid-1', 'team_id' => self::STRIKERS, 'tournament_id' => self::FOOTBALL, 'organization_id' => 'org-green-valley', 'full_name' => 'Kid One', 'mobile' => $manager->phone]);
        $second = Player::create(['id' => 'pl-kid-2', 'team_id' => self::STRIKERS, 'tournament_id' => self::FOOTBALL, 'organization_id' => 'org-green-valley', 'full_name' => 'Kid Two', 'mobile' => $manager->phone]);

        $this->assertNotSame($first->player_code, $second->player_code);
    }

    public function test_a_player_code_opens_the_players_profile_however_it_is_typed(): void
    {
        $code = Player::findOrFail('pl-kk-1')->player_code;
        $bare = substr($code, 3);

        foreach ([$code, strtolower($code), $bare, 'sp '.strtolower($bare)] as $typed) {
            $this->getJson('/api/players/code/'.rawurlencode($typed))
                ->assertOk()
                ->assertJsonPath('player_id', 'pl-kk-1')
                ->assertJsonPath('player_code', $code);
        }

        $this->getJson('/api/players/code/SP-00000')->assertNotFound();
        $this->getJson('/api/players/code/rahul')->assertNotFound();

        $this->getJson('/api/players/pl-kk-1/profile')->assertOk()->assertJsonPath('player.player_code', $code);

        Tournament::query()->whereKey(self::CRICKET)->update(['status' => 'draft']);
        $this->getJson('/api/players/code/'.$code)->assertNotFound();
    }

    public function test_public_responses_never_expose_contact_details(): void
    {
        $player = $this->getJson('/api/players/pl-mb-1/profile')->assertOk()->json('player');
        $this->assertArrayNotHasKey('mobile', $player);
        $this->assertArrayNotHasKey('dob', $player);
        $this->assertArrayNotHasKey('age', $player);

        $this->assertArrayNotHasKey('mobile', $this->getJson('/api/players/pl-mb-1/career')->json('player'));
        $this->assertArrayNotHasKey('mobile', $this->getJson('/api/players/pl-mb-1/matches')->json('player'));

        $auctionOnly = $this->getJson('/api/players/ap-fb-2/profile')->assertOk();
        $this->assertArrayNotHasKey('mobile', $auctionOnly->json('player'));
        $this->assertArrayNotHasKey('mobile', $auctionOnly->json('auction_info'));
        $this->assertArrayNotHasKey('email', $auctionOnly->json('auction_info'));
        $this->assertArrayNotHasKey('payment_reference', $auctionOnly->json('auction_info'));
    }

    public function test_nothing_from_a_draft_tournament_is_public(): void
    {
        Tournament::query()->whereKey(self::FOOTBALL)->update(['status' => 'draft']);

        $this->getJson('/api/players/pl-mb-1/profile')->assertNotFound();
        $this->getJson('/api/players/pl-mb-1/matches')->assertNotFound();
        $this->getJson('/api/players/pl-mb-1/career')->assertNotFound();
        $this->getJson('/api/players/tournament/'.self::FOOTBALL.'/stats')->assertNotFound();
        $this->getJson('/api/players/tournament/'.self::FOOTBALL.'/leaderboard')->assertNotFound();
    }

    public function test_no_cap_is_awarded_before_anyone_has_scored(): void
    {
        $this->getJson('/api/players/tournament/'.self::CRICKET.'/leaderboard')
            ->assertOk()
            ->assertJsonPath('orange_cap', null)
            ->assertJsonPath('purple_cap', null)
            ->assertJsonPath('top_batsmen', []);

        $this->scoreCricketOvers();

        $this->getJson('/api/players/tournament/'.self::CRICKET.'/leaderboard')
            ->assertOk()
            ->assertJsonPath('orange_cap.player_id', 'pl-kk-1')
            ->assertJsonPath('orange_cap.runs', 10)
            ->assertJsonPath('purple_cap.player_id', 'pl-cw-3');
    }

    /* ------------------------------------------------------------ Fixtures */

    private function cricketMatch(): void
    {
        GameMatch::create([
            'id' => 'match-stats-cricket',
            'tournament_id' => self::CRICKET,
            'organization_id' => 'org-malabar-cricket',
            'sport_code' => 'cricket',
            'match_number' => 9,
            'round_name' => 'Stats Test',
            'team_a_id' => self::KINGS,
            'team_b_id' => self::WARRIORS,
            'scheduled_at' => '2026-09-10T10:00:00.000Z',
            'status' => 'scheduled',
            'batting_first_team_id' => self::KINGS,
        ]);

        MatchLineup::create([
            'id' => 'lineup-stats-kk-5',
            'match_id' => 'match-stats-cricket',
            'team_id' => self::KINGS,
            'player_id' => 'pl-kk-5',
            'batting_order' => 5,
            'is_playing' => true,
        ]);
    }

    /**
     * Two overs. The first, from pl-cw-3, to pl-kk-1 and pl-kk-2:
     * 4, 6, wide, 2 byes, caught (pl-cw-1), pl-kk-2 run out (pl-cw-2) with
     * pl-kk-3 on strike, then a single to pl-kk-3 with pl-kk-4 in. The second,
     * a maiden from pl-cw-1 to pl-kk-3.
     */
    private function scoreCricketOvers(): void
    {
        $this->cricketMatch();

        $ball = fn (array $params) => $this->scoring->recordCricketBall([
            'matchId' => 'match-stats-cricket',
            'innings' => 1,
            'runsScored' => 0,
            'extras' => 'none',
            'isWicket' => false,
            ...$params,
        ]);

        $ball(['runsScored' => 4, 'strikerId' => 'pl-kk-1', 'nonStrikerId' => 'pl-kk-2', 'bowlerId' => 'pl-cw-3']);
        $ball(['runsScored' => 6, 'strikerId' => 'pl-kk-1', 'nonStrikerId' => 'pl-kk-2', 'bowlerId' => 'pl-cw-3']);
        $ball(['extras' => 'wide', 'extrasRuns' => 1, 'strikerId' => 'pl-kk-1', 'nonStrikerId' => 'pl-kk-2', 'bowlerId' => 'pl-cw-3']);
        $ball(['extras' => 'bye', 'extrasRuns' => 2, 'strikerId' => 'pl-kk-1', 'nonStrikerId' => 'pl-kk-2', 'bowlerId' => 'pl-cw-3']);
        $ball(['isWicket' => true, 'wicketType' => 'caught', 'dismissedPlayerId' => 'pl-kk-1', 'fielderId' => 'pl-cw-1', 'strikerId' => 'pl-kk-1', 'nonStrikerId' => 'pl-kk-2', 'bowlerId' => 'pl-cw-3']);
        $ball(['isWicket' => true, 'wicketType' => 'run_out', 'dismissedPlayerId' => 'pl-kk-2', 'fielderId' => 'pl-cw-2', 'strikerId' => 'pl-kk-3', 'nonStrikerId' => 'pl-kk-2', 'bowlerId' => 'pl-cw-3']);
        $ball(['runsScored' => 1, 'strikerId' => 'pl-kk-3', 'nonStrikerId' => 'pl-kk-4', 'bowlerId' => 'pl-cw-3']);

        for ($i = 0; $i < 6; $i++) {
            $ball(['strikerId' => 'pl-kk-3', 'nonStrikerId' => 'pl-kk-4', 'bowlerId' => 'pl-cw-1']);
        }
    }

    /**
     * Blasters 2 – 0 Strikers, finished: pl-mb-3 scores from open play
     * (assist pl-mb-4) and from the spot, pl-gvs-2 misses a penalty, pl-mb-4
     * is booked. pl-mb-1 keeps goal on the saved team sheet.
     */
    private function scoreFootballMatch(): void
    {
        GameMatch::create([
            'id' => 'match-stats-football',
            'tournament_id' => self::FOOTBALL,
            'organization_id' => 'org-green-valley',
            'sport_code' => 'football',
            'match_number' => 9,
            'round_name' => 'Stats Test',
            'team_a_id' => self::BLASTERS,
            'team_b_id' => self::STRIKERS,
            'scheduled_at' => '2026-09-10T10:00:00.000Z',
            'status' => 'scheduled',
        ]);

        MatchLineup::create([
            'id' => 'lineup-stats-mb-1',
            'match_id' => 'match-stats-football',
            'team_id' => self::BLASTERS,
            'player_id' => 'pl-mb-1',
            'batting_order' => 1,
            'is_playing' => true,
        ]);

        $event = fn (array $params) => $this->scoring->addFootballEvent(['matchId' => 'match-stats-football', 'minute' => 10, ...$params]);

        $event(['teamId' => self::BLASTERS, 'playerId' => 'pl-mb-3', 'assistPlayerId' => 'pl-mb-4', 'eventType' => 'goal']);
        $event(['teamId' => self::BLASTERS, 'playerId' => 'pl-mb-3', 'eventType' => 'penalty_goal']);
        $event(['teamId' => self::STRIKERS, 'playerId' => 'pl-gvs-2', 'eventType' => 'penalty_missed']);
        $event(['teamId' => self::BLASTERS, 'playerId' => 'pl-mb-4', 'eventType' => 'yellow_card']);

        $this->scoring->updateFootballTimer('match-stats-football', 'finish');
    }

    /** @return array<string, mixed> */
    private function cricket(string $playerId): array
    {
        return $this->stats->forPlayer(Player::findOrFail($playerId))['cricket'];
    }

    /** @return array<string, mixed> */
    private function football(string $playerId): array
    {
        return $this->stats->forPlayer(Player::findOrFail($playerId))['football'];
    }
}

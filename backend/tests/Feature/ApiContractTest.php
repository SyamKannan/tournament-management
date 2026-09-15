<?php

namespace Tests\Feature;

use App\Models\Auction;
use App\Models\RegistrationLink;
use Tests\TestCase;

/**
 * Guards the response shape every screen in the React client depends on.
 *
 * The front-end was not changed during the move to Laravel, so these assertions
 * are the contract: key names, nesting and types must stay exactly as they are.
 */
class ApiContractTest extends TestCase
{
    public function test_the_public_plan_catalogue_is_a_flat_list(): void
    {
        $this->getJson('/api/plans')
            ->assertOk()
            ->assertJsonStructure([
                '*' => ['id', 'name', 'description', 'price', 'currency', 'billing_type', 'features', 'status'],
            ]);
    }

    public function test_health_reports_the_platform_name(): void
    {
        $this->getJson('/api/health')
            ->assertOk()
            ->assertJsonStructure(['status', 'platform', 'time', 'version'])
            ->assertJsonPath('status', 'healthy');
    }

    public function test_the_public_organization_page_carries_tournaments_and_sponsors(): void
    {
        $this->getJson('/api/organizations/public/green-valley-sc')
            ->assertOk()
            ->assertJsonStructure([
                'organization' => ['id', 'name', 'slug', 'logo', 'banner', 'social_media'],
                'active_tournaments',
                'past_tournaments',
                'sponsors',
            ]);
    }

    public function test_an_inactive_organization_is_not_publicly_visible(): void
    {
        $this->getJson('/api/organizations/public/does-not-exist')
            ->assertNotFound()
            ->assertJsonPath('error', 'Organization not found or inactive');
    }

    public function test_the_public_tournament_hub_nests_live_state_into_each_fixture(): void
    {
        $response = $this->getJson('/api/tournaments/public/malappuram-7s-football-2026')
            ->assertOk()
            ->assertJsonStructure([
                'tournament' => ['id', 'name', 'slug', 'settings', 'payment_config'],
                'organization' => ['id', 'name'],
                'teams',
                'matches' => ['*' => ['id', 'team_a', 'team_b', 'venue', 'football_state', 'cricket_state']],
                'standings',
                'sponsors',
                'announcements',
                'registration_link',
            ]);

        $football = collect($response->json('matches'))->firstWhere('sport_code', 'football');

        $this->assertIsArray($football['football_state']);
        $this->assertIsArray($football['football_state']['events']);
        $this->assertIsInt($football['football_state']['team_a_score']);
    }

    public function test_the_team_registration_page_exposes_the_fee_breakdown(): void
    {
        $token = RegistrationLink::query()->value('token');

        $this->getJson("/api/teams/public/registration/{$token}")
            ->assertOk()
            ->assertJsonStructure([
                'link' => ['id', 'token', 'status', 'max_teams', 'current_registrations'],
                'tournament' => ['id', 'name', 'settings'],
                'organization' => ['id', 'name'],
                'payment_options' => ['totalFee', 'allowPartial', 'partialPercentage', 'partialAmount', 'fullAmount'],
                'current_teams_count',
                'is_full',
            ]);
    }

    public function test_an_unknown_registration_token_is_rejected(): void
    {
        $this->getJson('/api/teams/public/registration/not-a-real-token')
            ->assertNotFound()
            ->assertJsonPath('error', 'Invalid or expired registration link');
    }

    public function test_the_match_detail_includes_both_squads(): void
    {
        $this->getJson('/api/matches/match-fb-live-1')
            ->assertOk()
            ->assertJsonStructure([
                'match' => ['id', 'status', 'team_a_id', 'team_b_id'],
                'tournament' => ['id', 'name'],
                'team_a' => ['id', 'name', 'players'],
                'team_b' => ['id', 'name', 'players'],
                'venue',
                'football_state' => ['team_a_score', 'team_b_score', 'events'],
                // Both screens read the team sheets and what the big screen is
                // showing off the same payload.
                'lineups',
                'scoreboard' => ['stage', 'resolved_stage', 'cursor', 'reveal_interval_seconds'],
            ]);
    }

    public function test_the_match_detail_carries_the_team_sheets_in_reveal_order(): void
    {
        $response = $this->getJson('/api/matches/match-crick-live-1')->assertOk();

        $lineups = $response->json('lineups');
        $this->assertNotEmpty($lineups, 'A match with squads should always produce a default team sheet.');

        $this->assertArrayHasKey('player', $lineups[0]);
        $this->assertArrayHasKey('batting_order', $lineups[0]);

        // The reveal leads with whoever bats first, so the display can walk the
        // list straight through without re-sorting it.
        $match = $response->json('match');
        $battingFirst = $match['batting_first_team_id'] ?: $match['team_a_id'];
        $this->assertSame($battingFirst, $lineups[0]['team_id']);
    }

    public function test_the_cricket_match_detail_carries_a_derived_scorecard(): void
    {
        $response = $this->getJson('/api/matches/match-crick-live-1')->assertOk();

        $card = $response->json('scorecard');
        $this->assertNotEmpty($card);

        $this->assertSame(1, $card[0]['innings']);
        foreach (['batting_team_id', 'bowling_team_id', 'runs', 'wickets', 'extras', 'batting', 'bowling'] as $key) {
            $this->assertArrayHasKey($key, $card[0]);
        }

        $batter = collect($card[0]['batting'])->firstWhere('has_batted', true);
        $this->assertNotNull($batter, 'Deliveries in the seed should produce at least one batter.');
        foreach (['player_id', 'name', 'runs', 'balls', 'fours', 'sixes', 'strike_rate', 'is_out'] as $key) {
            $this->assertArrayHasKey($key, $batter);
        }
    }

    public function test_the_scoreboard_feed_carries_the_stage_and_any_item_on_screen(): void
    {
        $this->getJson('/api/matches/scoreboard/match/match-fb-live-1')
            ->assertOk()
            ->assertJsonStructure([
                'match', 'tournament', 'team_a', 'team_b', 'venue',
                'football_state' => ['clock_seconds', 'current_half', 'events'],
                'lineups', 'scorecard', 'football_scorecard', 'sent_off_player_ids',
                'scoreboard' => ['stage', 'resolved_stage', 'cursor', 'stage_at', 'item_id', 'item', 'ends_at'],
            ]);
    }

    public function test_the_fixture_list_nests_teams_and_state(): void
    {
        $this->getJson('/api/matches/tournament/tourney-football-sevens')
            ->assertOk()
            ->assertJsonStructure([
                '*' => ['id', 'match_number', 'team_a', 'team_b', 'football_state', 'cricket_state'],
            ]);
    }

    public function test_the_auction_room_payload_matches_the_arena_screen(): void
    {
        $this->getJson('/api/auctions/auction-football-1')
            ->assertOk()
            ->assertJsonStructure([
                'auction' => ['id', 'title', 'status', 'team_purse', 'base_prices', 'hammer_state', 'bid_history'],
                'tournament', 'organization', 'current_player',
                'team_purses' => ['*' => ['team_id', 'team_name', 'total_purse', 'spent_amount', 'remaining_purse', 'players_bought_count', 'max_players', 'bought_players']],
                'players', 'bid_history',
            ]);
    }

    public function test_the_auction_registration_page_reports_the_pool_size(): void
    {
        $token = Auction::query()->value('token');

        $this->getJson("/api/auctions/public/registration/{$token}")
            ->assertOk()
            ->assertJsonStructure(['auction', 'tournament', 'organization', 'registered_players_count']);
    }

    public function test_a_player_profile_includes_career_statistics(): void
    {
        $this->getJson('/api/players/pl-mb-1/profile')
            ->assertOk()
            ->assertJsonStructure([
                'player' => ['id', 'full_name', 'jersey_number'],
                'team', 'tournament', 'organization',
                'stats' => ['id', 'player_id', 'full_name', 'sport_code'],
                'auction_info',
            ]);
    }

    public function test_the_football_leaderboard_names_a_golden_boot(): void
    {
        $this->getJson('/api/players/tournament/tourney-football-sevens/leaderboard')
            ->assertOk()
            ->assertJsonPath('sport', 'football')
            ->assertJsonStructure([
                'tournament_id', 'tournament_name', 'sport',
                'golden_boot', 'top_playmaker', 'top_scorers', 'top_assists',
            ]);
    }

    public function test_the_cricket_leaderboard_names_an_orange_cap(): void
    {
        $this->getJson('/api/players/tournament/tourney-cricket-t20/leaderboard')
            ->assertOk()
            ->assertJsonPath('sport', 'cricket')
            ->assertJsonStructure([
                'orange_cap', 'purple_cap', 'top_batsmen', 'top_bowlers',
            ]);
    }

    public function test_the_super_admin_dashboards_return_their_expected_shapes(): void
    {
        $this->actingAsUser('syamdas@gmail.com');

        $this->getJson('/api/admin/metrics')
            ->assertOk()
            ->assertJsonStructure([
                'organizations' => ['total', 'active', 'pending', 'suspended'],
                'subscriptions' => ['active', 'expired', 'cancelled'],
                'revenue' => ['mrr', 'arr', 'oneTimeRevenue', 'totalPlatformRevenue'],
                'activity' => ['totalTournaments', 'totalTeams', 'totalPlayers', 'liveMatches'],
            ]);

        $this->getJson('/api/admin/organizations')
            ->assertOk()
            ->assertJsonStructure([
                '*' => ['id', 'name', 'subscription', 'plan', 'tournaments_count', 'teams_count', 'admin_user'],
            ]);

        $this->getJson('/api/admin/subscriptions')
            ->assertOk()
            ->assertJsonStructure(['*' => ['id', 'organization_name', 'plan_name', 'plan_price']]);

        $this->getJson('/api/admin/invoices')->assertOk();
        $this->getJson('/api/admin/audit-logs')->assertOk();
    }

    public function test_the_organization_usage_panel_reports_limits_and_invoices(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $this->getJson('/api/organizations/org-green-valley/usage')
            ->assertOk()
            ->assertJsonStructure([
                'subscription', 'plan',
                'usage' => [
                    'tournaments' => ['current', 'max', 'percentage'],
                    'teams' => ['current', 'max', 'percentage'],
                    'players' => ['current', 'max', 'percentage'],
                    'ads' => ['current', 'max', 'percentage'],
                ],
                'invoices',
            ]);
    }

    public function test_the_teams_listing_nests_roster_payment_and_receipt(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $this->getJson('/api/teams/tournament/tourney-football-sevens')
            ->assertOk()
            ->assertJsonStructure([
                '*' => ['id', 'name', 'status', 'players_count', 'players', 'payment', 'receipt'],
            ]);
    }

    public function test_the_financial_report_totals_collection(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $this->getJson('/api/reports/financials/tourney-football-sevens')
            ->assertOk()
            ->assertJsonStructure([
                'tournament' => ['id', 'name', 'ground_fee', 'sport'],
                'summary' => ['total_teams', 'total_expected', 'total_collected', 'total_pending', 'collection_percentage'],
                'records' => ['*' => ['team_id', 'team_name', 'manager_name', 'total_fee', 'paid_amount', 'remaining_amount', 'status']],
            ]);
    }

    public function test_the_tournament_listing_carries_team_counts_and_the_share_token(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $this->getJson('/api/tournaments')
            ->assertOk()
            ->assertJsonStructure([
                '*' => ['id', 'name', 'organization_name', 'teams_count', 'approved_teams_count', 'registration_link_token'],
            ]);
    }

    public function test_sponsor_and_announcement_listings_return_arrays(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $this->getJson('/api/sponsors')->assertOk()->assertJsonStructure(['*' => ['id', 'name', 'logo', 'tier']]);
        $this->getJson('/api/sponsors/ads')->assertOk()->assertJsonStructure(['*' => ['id', 'match_id', 'title', 'media_url', 'status', 'duration_seconds']]);
        $this->getJson('/api/sponsors/announcements')->assertOk()->assertJsonStructure(['*' => ['id', 'match_id', 'title', 'message', 'duration_seconds']]);
    }

    public function test_the_player_dashboard_bundles_the_player_team_and_stats(): void
    {
        $this->actingAsUser('shameer.player@gmail.com');

        $this->getJson('/api/players/me/dashboard')
            ->assertOk()
            ->assertJsonStructure(['user', 'player', 'team', 'tournament', 'organization', 'stats']);
    }

    public function test_money_and_counts_are_returned_as_numbers_not_strings(): void
    {
        $tournament = $this->getJson('/api/tournaments/public/malappuram-7s-football-2026')->json('tournament');

        $this->assertIsNumeric($tournament['ground_fee']);
        $this->assertIsNotString($tournament['ground_fee']);
        $this->assertIsInt($tournament['max_teams']);
        $this->assertIsBool($tournament['has_auction']);
        $this->assertIsArray($tournament['settings']);
        $this->assertIsArray($tournament['payment_config']);
    }

    public function test_timestamps_are_iso_8601_with_milliseconds(): void
    {
        $tournament = $this->getJson('/api/tournaments/public/malappuram-7s-football-2026')->json('tournament');

        $this->assertMatchesRegularExpression(
            '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/',
            $tournament['created_at']
        );
    }
}

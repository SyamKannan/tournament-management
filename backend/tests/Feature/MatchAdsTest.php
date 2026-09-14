<?php

namespace Tests\Feature;

use App\Models\Advertisement;
use App\Models\GameMatch;
use App\Services\ScoreboardDirector;
use Tests\TestCase;

/**
 * Ads and announcements belong to one match and reach its big screen only as a
 * full-screen segment pushed from the scorer console.
 */
class MatchAdsTest extends TestCase
{
    private const MATCH_ID = 'match-fb-live-1';

    private const OTHER_MATCH_ID = 'match-fb-sched-2';

    /* ------------------------------------------------------------ Creating */

    public function test_an_ad_must_name_its_match(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $this->postJson('/api/sponsors/ads', [
            'title' => 'Gold sale',
            'business_name' => 'Jewellers',
            'media_url' => 'https://example.com/ad.jpg',
        ])->assertUnprocessable()->assertJsonValidationErrors('match_id');
    }

    public function test_an_ad_is_created_on_its_match(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $this->postJson('/api/sponsors/ads', [
            'match_id' => self::MATCH_ID,
            'title' => 'Gold sale',
            'business_name' => 'Jewellers',
            'media_url' => 'https://example.com/ad.jpg',
            'duration_seconds' => 20,
        ])->assertCreated()
            ->assertJsonPath('match_id', self::MATCH_ID)
            ->assertJsonPath('organization_id', 'org-green-valley')
            ->assertJsonPath('duration_seconds', 20);
    }

    public function test_an_organizer_cannot_attach_an_ad_to_another_organizations_match(): void
    {
        $this->actingAsUser('admin@malabar.com');

        $this->postJson('/api/sponsors/ads', [
            'match_id' => self::MATCH_ID,
            'title' => 'Gold sale',
            'business_name' => 'Jewellers',
            'media_url' => 'https://example.com/ad.jpg',
        ])->assertForbidden();
    }

    public function test_an_announcement_takes_its_tournament_from_the_match(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $this->postJson('/api/sponsors/announcements', [
            'match_id' => self::MATCH_ID,
            'title' => 'Drinks break',
            'message' => 'Play resumes in five minutes.',
        ])->assertCreated()
            ->assertJsonPath('match_id', self::MATCH_ID)
            ->assertJsonPath('tournament_id', GameMatch::find(self::MATCH_ID)->tournament_id)
            ->assertJsonPath('duration_seconds', 30);
    }

    public function test_listings_filter_by_match(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $ads = $this->getJson('/api/sponsors/ads?matchId='.self::MATCH_ID)->assertOk()->json();
        $this->assertNotEmpty($ads);
        $this->assertSame([self::MATCH_ID], array_values(array_unique(array_column($ads, 'match_id'))));

        $announcements = $this->getJson('/api/sponsors/announcements?matchId='.self::MATCH_ID)->assertOk()->json();
        $this->assertSame(['ann-2'], array_column($announcements, 'id'));
    }

    /* ------------------------------------------------------------- Copying */

    public function test_an_ad_copies_onto_other_matches_of_the_same_organization(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $this->postJson('/api/sponsors/ads/ad-1/copy', ['match_ids' => [self::OTHER_MATCH_ID]])
            ->assertCreated()
            ->assertJsonPath('0.match_id', self::OTHER_MATCH_ID)
            ->assertJsonPath('0.business_name', 'Malabar Gold & Diamonds');

        $this->assertSame(1, Advertisement::query()->where('match_id', self::MATCH_ID)->where('business_name', 'Malabar Gold & Diamonds')->count());
    }

    public function test_an_ad_cannot_be_copied_to_another_organizations_match(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $this->postJson('/api/sponsors/ads/ad-1/copy', ['match_ids' => ['match-crick-live-1']])
            ->assertUnprocessable();
    }

    /* --------------------------------------------------------- Big screen */

    public function test_pushing_an_ad_puts_it_full_screen_with_its_end_time(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $this->postJson('/api/matches/'.self::MATCH_ID.'/scoreboard/stage', ['stage' => 'ad', 'item_id' => 'ad-1'])
            ->assertOk()
            ->assertJsonPath('resolved_stage', 'ad')
            ->assertJsonPath('item_id', 'ad-1')
            ->assertJsonPath('item.business_name', 'Malabar Gold & Diamonds');

        $this->getJson('/api/matches/scoreboard/match/'.self::MATCH_ID)
            ->assertJsonPath('scoreboard.resolved_stage', 'ad')
            ->assertJsonPath('scoreboard.item_id', 'ad-1');
    }

    public function test_another_matchs_ad_cannot_be_pushed_to_this_screen(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $this->postJson('/api/matches/'.self::MATCH_ID.'/scoreboard/stage', ['stage' => 'ad', 'item_id' => 'ad-3'])
            ->assertStatus(400);
    }

    public function test_an_item_stage_needs_an_item(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $this->postJson('/api/matches/'.self::MATCH_ID.'/scoreboard/stage', ['stage' => 'announcement'])
            ->assertStatus(400);
    }

    public function test_an_ad_comes_off_once_its_time_is_up(): void
    {
        $director = app(ScoreboardDirector::class);
        $match = $director->setStage(self::MATCH_ID, 'ad', null, 'ad-1');

        $this->assertSame('ad', $director->resolve($match));

        $this->travel(16)->seconds();

        $payload = $director->payload($match->fresh());
        $this->assertSame('auto', $payload['stage']);
        $this->assertNotSame('ad', $payload['resolved_stage']);
        $this->assertNull($payload['item']);
    }

    public function test_a_zero_duration_holds_until_switched_back(): void
    {
        $director = app(ScoreboardDirector::class);
        $match = $director->setStage(self::MATCH_ID, 'announcement', null, 'ann-2');

        $this->travel(2)->hours();

        $payload = $director->payload($match->fresh());
        $this->assertSame('announcement', $payload['resolved_stage']);
        $this->assertNull($payload['ends_at']);
    }

    public function test_changing_the_time_applies_to_the_ad_on_screen(): void
    {
        $this->actingAsUser('admin@greenvalley.com');
        app(ScoreboardDirector::class)->setStage(self::MATCH_ID, 'ad', null, 'ad-1');

        $this->putJson('/api/sponsors/ads/ad-1', ['duration_seconds' => 0])
            ->assertOk()
            ->assertJsonPath('duration_seconds', 0);

        $this->travel(1)->hours();

        $this->getJson('/api/matches/scoreboard/match/'.self::MATCH_ID)
            ->assertJsonPath('scoreboard.resolved_stage', 'ad');
    }

    public function test_a_scorer_can_change_the_time_but_a_team_manager_cannot(): void
    {
        $this->actingAsUser('scorer@greenvalley.com');
        $this->putJson('/api/sponsors/ads/ad-1', ['duration_seconds' => 25])->assertOk();

        $this->actingAsUser('manager@malabarblasters.com');
        $this->putJson('/api/sponsors/ads/ad-1', ['duration_seconds' => 5])->assertForbidden();
    }

    public function test_deleting_the_ad_on_screen_takes_it_off(): void
    {
        $this->actingAsUser('admin@greenvalley.com');
        app(ScoreboardDirector::class)->setStage(self::MATCH_ID, 'ad', null, 'ad-1');

        $this->deleteJson('/api/sponsors/ads/ad-1')->assertOk();

        $this->getJson('/api/matches/scoreboard/match/'.self::MATCH_ID)
            ->assertJsonPath('scoreboard.stage', 'auto')
            ->assertJsonPath('scoreboard.item', null);
    }

    public function test_a_scoring_action_returns_the_screen_to_the_score(): void
    {
        $this->actingAsUser('scorer@greenvalley.com');
        app(ScoreboardDirector::class)->setStage(self::MATCH_ID, 'announcement', null, 'ann-2');

        $match = GameMatch::find(self::MATCH_ID);

        $this->postJson('/api/matches/'.self::MATCH_ID.'/football/event', [
            'team_id' => $match->team_a_id,
            'player_id' => 'pl-mb-3',
            'event_type' => 'goal',
            'minute' => 70,
        ])->assertOk();

        $this->assertSame('auto', GameMatch::find(self::MATCH_ID)->scoreboard_stage);
    }

    public function test_the_retired_push_endpoints_are_gone(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $this->postJson('/api/sponsors/ads/control/push-popup', ['match_id' => self::MATCH_ID])->assertNotFound();
        $this->postJson('/api/sponsors/ads/control/break-mode', ['match_id' => self::MATCH_ID, 'action' => 'start'])->assertNotFound();
    }
}

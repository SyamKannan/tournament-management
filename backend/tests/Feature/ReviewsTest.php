<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Organization;
use App\Models\PlatformSetting;
use App\Models\Review;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

/**
 * Landing-page reviews: 4★ and up go public on their own, the super admin's
 * show/hide wins over the rule, and a club only ever touches its own review.
 */
class ReviewsTest extends TestCase
{
    private const ORG = 'org-green-valley';

    private const OTHER_ORG = 'org-highland-fc';

    protected function setUp(): void
    {
        parent::setUp();
        config(['caching.enabled' => true]);
        Cache::flush();
    }

    private function organizer(string $org = self::ORG): array
    {
        return $this->demoHeaders('ORG_ADMIN', $org);
    }

    private function admin(): array
    {
        return $this->demoHeaders('SUPER_ADMIN');
    }

    private function review(string $org, int $rating, string $visibility = 'auto'): Review
    {
        return Review::create([
            'id' => 'review_'.$org,
            'organization_id' => $org,
            'author_name' => 'Organizer of '.$org,
            'author_title' => $org,
            'rating' => $rating,
            'body' => 'Scoring the whole league from one phone was easy.',
            'visibility' => $visibility,
        ]);
    }

    private function publicIds(): array
    {
        return collect($this->getJson('/api/reviews')->assertOk()->json('data'))->pluck('id')->all();
    }

    public function test_an_organizer_review_of_four_stars_or_more_goes_public_on_its_own(): void
    {
        $this->withHeaders($this->organizer())
            ->putJson('/api/organizations/'.self::ORG.'/review', ['rating' => 4, 'body' => 'Our village league finally has live scores.'])
            ->assertOk()
            ->assertJsonPath('review.is_live', true)
            ->assertJsonPath('review.author_title', Organization::find(self::ORG)->name);

        $reviews = $this->getJson('/api/reviews')->assertOk()->assertJsonPath('enabled', true)->json('data');
        $this->assertCount(1, $reviews);
        $this->assertSame(['id', 'author_name', 'author_title', 'rating', 'body', 'created_at'], array_keys($reviews[0]));
    }

    public function test_below_the_minimum_waits_for_the_admin(): void
    {
        $this->withHeaders($this->organizer())
            ->putJson('/api/organizations/'.self::ORG.'/review', ['rating' => 3, 'body' => 'Good, but the poster took a while.'])
            ->assertJsonPath('review.is_live', false);

        $this->assertSame([], $this->publicIds());

        $id = Review::query()->value('id');
        $this->withHeaders($this->admin())->getJson('/api/admin/reviews?filter=not_live')->assertJsonPath('total', 1);
        $this->withHeaders($this->admin())->getJson('/api/admin/reviews?filter=live')->assertJsonPath('total', 0);
        $this->withHeaders($this->admin())->putJson("/api/admin/reviews/$id", ['visibility' => 'shown'])
            ->assertOk()->assertJsonPath('is_live', true);

        $this->assertSame([$id], $this->publicIds());
    }

    public function test_the_admin_can_hide_a_five_star_review_and_it_stays_hidden_after_an_edit(): void
    {
        $review = $this->review(self::ORG, 5);
        $this->assertSame([$review->id], $this->publicIds());

        $this->withHeaders($this->admin())->putJson("/api/admin/reviews/{$review->id}", ['visibility' => 'hidden'])->assertOk();
        $this->assertSame([], $this->publicIds());

        $this->withHeaders($this->organizer())
            ->putJson('/api/organizations/'.self::ORG.'/review', ['rating' => 5, 'body' => 'Edited to say even nicer things.'])
            ->assertJsonPath('review.is_live', false);
        $this->assertSame([], $this->publicIds());
        $this->assertTrue(AuditLog::query()->where('action', 'HID_REVIEW')->exists());
    }

    public function test_editing_a_hand_approved_review_returns_it_to_the_rule(): void
    {
        $review = $this->review(self::ORG, 2, 'shown');
        $this->assertSame([$review->id], $this->publicIds());

        $this->withHeaders($this->organizer())
            ->putJson('/api/organizations/'.self::ORG.'/review', ['rating' => 1, 'body' => 'Changed my mind about this.'])
            ->assertJsonPath('review.is_live', false);

        $this->assertSame('auto', $review->fresh()->visibility);
        $this->assertSame([], $this->publicIds());
    }

    public function test_the_minimum_rating_and_switch_apply_to_existing_reviews(): void
    {
        $four = $this->review(self::ORG, 4);
        $five = $this->review(self::OTHER_ORG, 5);
        $this->assertEqualsCanonicalizing([$four->id, $five->id], $this->publicIds());

        $this->withHeaders($this->admin())->putJson('/api/admin/settings', ['reviews' => ['min_rating' => 5]])
            ->assertOk()->assertJsonPath('reviews.min_rating', 5)->assertJsonPath('reviews.enabled', true);
        $this->assertSame([$five->id], $this->publicIds());

        $this->withHeaders($this->admin())->putJson('/api/admin/settings', ['reviews' => ['enabled' => false]])->assertOk();
        $this->getJson('/api/reviews')->assertJsonPath('enabled', false)->assertJsonPath('data', []);
    }

    public function test_highest_rated_first_and_capped_at_max_shown(): void
    {
        $four = $this->review(self::ORG, 4);
        $this->review(self::OTHER_ORG, 5);
        $this->review('org-malabar-cricket', 5);

        PlatformSetting::current()->update(['reviews' => ['max_shown' => 2]]);

        $ids = $this->publicIds();
        $this->assertCount(2, $ids);
        $this->assertNotContains($four->id, $ids);
    }

    public function test_a_suspended_clubs_review_leaves_the_page(): void
    {
        $review = $this->review(self::ORG, 5);
        $this->assertSame([$review->id], $this->publicIds());

        Organization::find(self::ORG)->update(['status' => 'suspended']);

        $this->assertSame([], $this->publicIds());
    }

    public function test_clubs_and_other_roles_cannot_reach_other_reviews(): void
    {
        $this->withHeaders($this->organizer('org-malabar-cricket'))
            ->putJson('/api/organizations/'.self::ORG.'/review', ['rating' => 1, 'body' => 'Writing as somebody else.'])
            ->assertForbidden();

        $this->withHeaders($this->organizer())->getJson('/api/admin/reviews')->assertForbidden();

        $this->withHeaders($this->admin())
            ->putJson('/api/organizations/'.self::ORG.'/review', ['rating' => 5, 'body' => 'The platform reviewing itself.'])
            ->assertForbidden();
    }

    public function test_the_admin_can_only_show_or_hide(): void
    {
        $review = $this->review(self::ORG, 3);

        $this->withHeaders($this->admin())->putJson("/api/admin/reviews/{$review->id}", ['body' => 'Put words in their mouth.'])
            ->assertStatus(422)
            ->assertJsonPath('errors.visibility.0', 'Choose whether to show or hide the review.');
        $this->assertSame('Scoring the whole league from one phone was easy.', $review->fresh()->body);

        $this->withHeaders($this->admin())->deleteJson("/api/admin/reviews/{$review->id}")->assertStatus(405);
        $this->assertTrue(AuditLog::query()->where('action', 'SHOWED_REVIEW')->doesntExist());
    }

    public function test_the_admin_adds_a_review_that_shows_at_once_and_can_be_hidden(): void
    {
        $this->review(self::ORG, 5);

        // Any rating: the admin chose to add it, so it skips the minimum.
        $added = $this->withHeaders($this->admin())->postJson('/api/admin/reviews', [
            'author_name' => '  Suresh  ',
            'author_title' => 'Kerala Sevens',
            'rating' => 3,
            'body' => 'Told us on the phone it saved them hours.',
        ])
            ->assertCreated()
            ->assertJsonPath('is_live', true)
            ->assertJsonPath('organization_id', null)
            ->assertJsonPath('author_name', 'Suresh')
            ->json('id');

        $this->assertContains($added, $this->publicIds());
        $this->assertTrue(AuditLog::query()->where('action', 'ADDED_REVIEW')->where('entity_id', $added)->exists());

        // Not one-per-club: a second one is fine.
        $this->withHeaders($this->admin())->postJson('/api/admin/reviews', [
            'author_name' => 'Anil', 'rating' => 5, 'body' => 'Heard at the district final.',
        ])->assertCreated()->assertJsonPath('author_title', '');

        $this->withHeaders($this->admin())->putJson("/api/admin/reviews/$added", ['visibility' => 'hidden'])->assertOk();
        $this->assertNotContains($added, $this->publicIds());
    }

    public function test_only_the_super_admin_adds_reviews_and_input_is_explained(): void
    {
        // Anonymous first: the guard keeps the last signed-in user between requests in a test.
        $this->postJson('/api/admin/reviews', ['author_name' => 'Me', 'rating' => 5, 'body' => 'Praising my own club here.'])
            ->assertUnauthorized();
        $this->withHeaders($this->organizer())
            ->postJson('/api/admin/reviews', ['author_name' => 'Me', 'rating' => 5, 'body' => 'Praising my own club here.'])
            ->assertForbidden();

        $this->withHeaders($this->admin())->postJson('/api/admin/reviews', ['rating' => 0, 'body' => 'short'])
            ->assertStatus(422)
            ->assertJsonPath('errors.author_name.0', 'Enter the name to show with the review.')
            ->assertJsonPath('errors.rating.0', 'Choose between 1 and 5 stars.')
            ->assertJsonPath('errors.body.0', 'Write at least 10 characters.');

        $this->assertSame(0, Review::query()->count());
    }

    public function test_a_long_list_can_be_searched_filtered_sorted_and_counted(): void
    {
        $five = $this->review(self::ORG, 5);
        $three = $this->review(self::OTHER_ORG, 3);
        $three->update(['body' => 'Fixtures were confusing at first.', 'created_at' => now()->subDay()]);
        $this->review('org-malabar-cricket', 1);

        $admin = $this->withHeaders($this->admin());

        $admin->getJson('/api/admin/reviews?filter=live')
            ->assertJsonPath('total', 1)
            ->assertJsonPath('counts', ['all' => 3, 'live' => 1, 'not_live' => 2]);

        // Counts follow the search, so each tab says what it would hold.
        $admin->getJson('/api/admin/reviews?search=FIXTURES')
            ->assertJsonPath('total', 1)
            ->assertJsonPath('data.0.id', $three->id)
            ->assertJsonPath('counts', ['all' => 1, 'live' => 0, 'not_live' => 1]);

        $admin->getJson('/api/admin/reviews?rating=5')->assertJsonPath('total', 1)->assertJsonPath('data.0.id', $five->id);

        $this->assertSame([1, 3, 5], array_column($admin->getJson('/api/admin/reviews?sort=lowest')->json('data'), 'rating'));
        $this->assertSame([5, 3, 1], array_column($admin->getJson('/api/admin/reviews?sort=highest')->json('data'), 'rating'));
        $this->assertSame($three->id, $admin->getJson('/api/admin/reviews?sort=oldest')->json('data.0.id'));
    }

    public function test_many_reviews_are_shown_or_hidden_at_once(): void
    {
        $a = $this->review(self::ORG, 5);
        $b = $this->review(self::OTHER_ORG, 4);
        $low = $this->review('org-malabar-cricket', 2);
        $this->assertEqualsCanonicalizing([$a->id, $b->id], $this->publicIds());

        $this->withHeaders($this->admin())
            ->postJson('/api/admin/reviews/visibility', ['ids' => [$a->id, $b->id], 'visibility' => 'hidden'])
            ->assertOk()->assertJsonPath('updated', 2);
        $this->assertSame([], $this->publicIds());
        $this->assertTrue(AuditLog::query()->where('action', 'HID_REVIEWS')->exists());

        $this->withHeaders($this->admin())
            ->postJson('/api/admin/reviews/visibility', ['ids' => [$low->id], 'visibility' => 'shown'])
            ->assertJsonPath('updated', 1);
        $this->assertSame([$low->id], $this->publicIds());

        $this->withHeaders($this->admin())
            ->postJson('/api/admin/reviews/visibility', ['ids' => [], 'visibility' => 'shown'])
            ->assertStatus(422)->assertJsonPath('errors.ids.0', 'Select at least one review.');

        $this->withHeaders($this->organizer())
            ->postJson('/api/admin/reviews/visibility', ['ids' => [$a->id], 'visibility' => 'shown'])
            ->assertForbidden();
    }

    public function test_bad_input_is_explained(): void
    {
        $this->withHeaders($this->organizer())
            ->putJson('/api/organizations/'.self::ORG.'/review', ['rating' => 9, 'body' => 'short'])
            ->assertStatus(422)
            ->assertJsonPath('errors.rating.0', 'Choose between 1 and 5 stars.')
            ->assertJsonPath('errors.body.0', 'Write at least 10 characters.');

        // The club card sends null when no star was tapped.
        $this->withHeaders($this->organizer())
            ->putJson('/api/organizations/'.self::ORG.'/review', ['rating' => null, 'body' => 'Long enough to pass.'])
            ->assertJsonPath('errors.rating.0', 'Choose a star rating.');
    }

    public function test_a_club_is_not_told_its_review_is_live_while_the_section_is_off(): void
    {
        PlatformSetting::current()->update(['reviews' => ['enabled' => false]]);

        $this->withHeaders($this->organizer())
            ->putJson('/api/organizations/'.self::ORG.'/review', ['rating' => 5, 'body' => 'Five stars from our club.'])
            ->assertOk()
            ->assertJsonPath('review.is_live', false);
    }

    public function test_saving_twice_keeps_one_review_per_club(): void
    {
        foreach ([5, 4] as $rating) {
            $this->withHeaders($this->organizer())
                ->putJson('/api/organizations/'.self::ORG.'/review', ['rating' => $rating, 'body' => 'Saved from two taps.'])
                ->assertOk();
        }

        $this->assertSame(1, Review::query()->where('organization_id', self::ORG)->count());
        $this->assertSame(4, Review::query()->where('organization_id', self::ORG)->value('rating'));
    }

    public function test_the_admin_list_says_why_a_review_is_not_shown(): void
    {
        $this->review(self::ORG, 5);
        Organization::find(self::ORG)->update(['status' => 'suspended']);

        $this->withHeaders($this->admin())->getJson('/api/admin/reviews')
            ->assertJsonPath('data.0.is_live', false)
            ->assertJsonPath('data.0.club_active', false)
            ->assertJsonPath('data.0.organization_name', Organization::find(self::ORG)->name);
    }
}

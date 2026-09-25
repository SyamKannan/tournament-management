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
        $this->assertSame(['id', 'author_name', 'author_title', 'rating', 'body', 'is_featured', 'created_at'], array_keys($reviews[0]));
    }

    public function test_below_the_minimum_waits_for_the_admin(): void
    {
        $this->withHeaders($this->organizer())
            ->putJson('/api/organizations/'.self::ORG.'/review', ['rating' => 3, 'body' => 'Good, but the poster took a while.'])
            ->assertJsonPath('review.is_live', false);

        $this->assertSame([], $this->publicIds());

        $id = Review::query()->value('id');
        $this->withHeaders($this->admin())->getJson('/api/admin/reviews?filter=held')->assertJsonPath('total', 1);
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
        $this->assertTrue(AuditLog::query()->where('action', 'UPDATED_REVIEW')->exists());
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

    public function test_featured_first_and_capped_at_max_shown(): void
    {
        $this->review(self::ORG, 5);
        $featured = $this->review(self::OTHER_ORG, 4);
        $featured->update(['is_featured' => true]);
        $this->review('org-malabar-cricket', 5);

        $settings = PlatformSetting::current();
        $settings->update(['reviews' => ['max_shown' => 2]]);

        $ids = $this->publicIds();
        $this->assertCount(2, $ids);
        $this->assertSame($featured->id, $ids[0]);
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

    public function test_the_admin_adds_reviews_but_cannot_reword_a_clubs(): void
    {
        $added = $this->withHeaders($this->admin())->postJson('/api/admin/reviews', [
            'author_name' => 'Suresh', 'author_title' => 'Kerala Sevens', 'rating' => 3, 'body' => 'Told us on the phone it saved them hours.',
        ])->assertCreated()->assertJsonPath('is_live', true)->json('id');
        $this->assertSame([$added], $this->publicIds());

        $club = $this->review(self::ORG, 3);
        $this->withHeaders($this->admin())->putJson("/api/admin/reviews/{$club->id}", ['body' => 'Put words in their mouth.'])
            ->assertStatus(422)->assertJsonStructure(['error']);

        $this->withHeaders($this->admin())->deleteJson("/api/admin/reviews/$added")->assertOk();
        $this->assertSame([], $this->publicIds());
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

        $review = $this->review(self::ORG, 5);
        $this->withHeaders($this->admin())->putJson("/api/admin/reviews/{$review->id}", ['author_name' => ''])
            ->assertStatus(422)
            ->assertJsonPath('errors.author_name.0', 'Enter the name to show with the review.');
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

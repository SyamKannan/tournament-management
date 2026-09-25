<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Models\PlatformSetting;
use App\Models\Review;
use App\Support\Audit;
use App\Support\Cached;
use App\Support\Ids;
use App\Support\Paginate;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Reviews of the platform: the landing-page section, each club's own review,
 * and the super admin's moderation. What a visitor sees is decided by
 * `Review::scopePublished()` — the admin's minimum rating plus their overrides.
 */
class ReviewController extends Controller
{
    private const MESSAGES = [
        'rating.required' => 'Choose a star rating.',
        'rating.min' => 'Choose between 1 and 5 stars.',
        'rating.max' => 'Choose between 1 and 5 stars.',
        'rating.integer' => 'Choose between 1 and 5 stars.',
        'body.required' => 'Write a few words about your experience.',
        'body.min' => 'Write at least 10 characters.',
        'body.max' => 'Keep it under 500 characters.',
    ];

    /* ----------------------------------------------------------------- Public */

    public function index(): JsonResponse
    {
        return Cached::json('platform', 'reviews', 'platform', function () {
            $settings = PlatformSetting::current()->reviewSettings();

            if (! $settings['enabled']) {
                return ['enabled' => false, 'data' => []];
            }

            $reviews = Review::query()
                ->published($settings['min_rating'])
                ->showcaseOrder()
                ->limit($settings['max_shown'])
                ->get();

            // Only what the card shows — never who wrote it or how to reach them.
            return [
                'enabled' => true,
                'data' => $reviews->map(fn (Review $review) => [
                    'id' => $review->id,
                    'author_name' => $review->author_name,
                    'author_title' => $review->author_title,
                    'rating' => $review->rating,
                    'body' => $review->body,
                    'created_at' => $review->created_at,
                ])->values(),
            ];
        });
    }

    /* -------------------------------------------------------------- Organizer */

    public function showOwn(string $id): JsonResponse
    {
        return response()->json($this->ownPayload(Review::query()->where('organization_id', $id)->first()));
    }

    /**
     * One review per club. An edit to a review the admin had approved by hand
     * goes back to the rule, so changed words are never live on an old approval;
     * a hidden review stays hidden.
     */
    public function saveOwn(Request $request, string $id): JsonResponse
    {
        $user = $request->user();

        if ($user->role === 'SUPER_ADMIN') {
            return response()->json(['error' => 'Reviews come from the clubs themselves. Add one from the Reviews page instead.'], 403);
        }

        $organization = Organization::find($id);
        if (! $organization) {
            return response()->json(['error' => 'Organization not found'], 404);
        }

        $data = $request->validate([
            'rating' => ['required', 'integer', 'min:1', 'max:5'],
            'body' => ['required', 'string', 'min:10', 'max:500'],
            'author_name' => ['sometimes', 'nullable', 'string', 'max:80'],
            'author_title' => ['sometimes', 'nullable', 'string', 'max:120'],
        ], self::MESSAGES);

        $attributes = [
            'user_id' => $user->id,
            'rating' => $data['rating'],
            'body' => trim($data['body']),
            'author_name' => trim((string) ($data['author_name'] ?? '')) ?: $user->name,
            'author_title' => trim((string) ($data['author_title'] ?? '')) ?: $organization->name,
        ];

        try {
            $review = $this->writeOwn($organization->id, $attributes);
        } catch (UniqueConstraintViolationException) {
            // Two first saves at once (a double tap on a slow phone): the other
            // one created the row, so this one becomes an edit of it.
            $review = $this->writeOwn($organization->id, $attributes);
        }

        return response()->json($this->ownPayload($review));
    }

    private function writeOwn(string $organizationId, array $attributes): Review
    {
        $review = Review::query()->firstOrNew(['organization_id' => $organizationId], [
            'id' => Ids::unique('review'),
        ]);

        $review->fill($attributes);

        if ($review->exists && $review->visibility === 'shown' && $review->isDirty(['rating', 'body'])) {
            $review->visibility = 'auto';
        }

        $review->save();

        return $review;
    }

    /** `is_live`: approved and the section is switched on — what the club would actually see. */
    private function ownPayload(?Review $review): array
    {
        $settings = PlatformSetting::current()->reviewSettings();

        return [
            'review' => $review ? [
                ...$review->only(['id', 'author_name', 'author_title', 'rating', 'body', 'updated_at']),
                'is_live' => $settings['enabled'] && $review->passesRule($settings['min_rating']),
            ] : null,
        ];
    }

    /* ------------------------------------------------------------ Super admin */

    /** `filter`: live (on the home page) | not_live | everything when absent. */
    public function adminIndex(Request $request): JsonResponse
    {
        $minRating = PlatformSetting::current()->reviewSettings()['min_rating'];

        $query = Review::query()->with('organization:id,name,status');

        match ($request->query('filter')) {
            'live' => $query->published($minRating),
            'not_live' => $query->whereNotIn('id', Review::query()->published($minRating)->select('id')),
            default => null,
        };

        $query->orderByDesc('updated_at')->orderBy('id');

        return response()->json(Paginate::query($query, $request, fn (Review $review) => $this->adminRow($review, $minRating)));
    }

    /** Show or hide one review by hand; `auto` hands it back to the rating rule. */
    public function adminUpdate(Request $request, string $id): JsonResponse
    {
        $review = Review::find($id);
        if (! $review) {
            return response()->json(['error' => 'Review not found'], 404);
        }

        $data = $request->validate([
            'visibility' => ['required', 'string', 'in:'.implode(',', Review::VISIBILITIES)],
        ], [
            'visibility.required' => 'Choose whether to show or hide the review.',
            'visibility.in' => 'Choose whether to show or hide the review.',
        ]);

        $review->fill([
            ...$data,
            'moderated_by' => $request->user()->id,
            'moderated_at' => now(),
        ])->save();

        $user = $request->user();
        Audit::log([
            'organization_id' => $review->organization_id,
            'user_id' => $user->id,
            'user_name' => $user->name,
            'user_role' => $user->role,
            'action' => $data['visibility'] === 'hidden' ? 'HID_REVIEW' : 'SHOWED_REVIEW',
            'entity_type' => 'Review',
            'entity_id' => $review->id,
            'details' => ($data['visibility'] === 'hidden' ? 'Hid' : 'Showed')." the review by {$review->author_name}",
            'ip_address' => $request->ip(),
        ]);

        return response()->json($this->adminRow($review->load('organization:id,name,status')));
    }

    private function adminRow(Review $review, ?int $minRating = null): array
    {
        $minRating ??= PlatformSetting::current()->reviewSettings()['min_rating'];
        $organization = $review->organization;
        $clubActive = ! $organization || $organization->status === 'active';

        return [
            ...$review->only([
                'id', 'organization_id', 'author_name', 'author_title', 'rating', 'body',
                'visibility', 'moderated_at', 'created_at', 'updated_at',
            ]),
            'organization_name' => $organization?->name,
            'club_active' => $clubActive,
            'is_live' => $clubActive && $review->passesRule($minRating),
        ];
    }
}

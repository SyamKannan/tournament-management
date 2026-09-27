<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\UserNotification;
use App\Support\Paginate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The signed-in account's own in-app feed (the bell).
 *
 * Every query is scoped to the caller's user id, so there is no tenant to
 * check — nobody can name another account's feed. An impersonating super
 * admin can read the organizer's feed but not mark it read: those items are
 * still news to the organizer.
 */
class UserNotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = UserNotification::query()
            ->where('user_id', $request->user()->id)
            ->orderByDesc('created_at')
            ->orderByDesc('id');

        if ($request->boolean('unread')) {
            $query->whereNull('read_at');
        }

        return response()->json(Paginate::query($query, $request, defaultPerPage: 20));
    }

    public function unreadCount(Request $request): JsonResponse
    {
        return response()->json(['unread' => $this->unread($request->user())]);
    }

    public function markRead(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $item = UserNotification::query()->where('user_id', $user->id)->whereKey($id)->first();

        if (! $item) {
            return response()->json(['error' => 'That notification no longer exists.'], 404);
        }

        if (! $user->impersonatorId && ! $item->read_at) {
            $item->read_at = now();
            $item->save();
        }

        return response()->json(['notification' => $item, 'unread' => $this->unread($user)]);
    }

    public function markAllRead(Request $request): JsonResponse
    {
        $user = $request->user();
        $updated = 0;

        if (! $user->impersonatorId) {
            $updated = UserNotification::query()
                ->where('user_id', $user->id)
                ->whereNull('read_at')
                ->update(['read_at' => now(), 'updated_at' => now()]);
        }

        return response()->json(['updated' => $updated, 'unread' => $this->unread($user)]);
    }

    private function unread(User $user): int
    {
        return UserNotification::query()->where('user_id', $user->id)->whereNull('read_at')->count();
    }
}

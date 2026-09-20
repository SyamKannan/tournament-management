<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use App\Models\NotificationOptOut;
use App\Services\Notifications\NotificationService;
use App\Support\Audit;
use App\Support\Phone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * What an organizer can see and decide about the messages their club sends.
 *
 * The delivery log is scoped to the organization on every read — the numbers in
 * it are their teams' managers and players, and one club has no business
 * reading another's contact list.
 */
class NotificationController extends Controller
{
    public function __construct(private readonly NotificationService $notifications) {}

    /** Which events this club sends, with a description of each. */
    public function settings(string $organizationId): JsonResponse
    {
        return response()->json($this->notifications->settingsFor($organizationId));
    }

    public function updateSettings(Request $request, string $organizationId): JsonResponse
    {
        $data = $request->validate([
            'enabled' => ['sometimes', 'boolean'],
            'sender_name' => ['sometimes', 'nullable', 'string', 'max:64'],
            'events' => ['sometimes', 'array'],
            'events.*' => ['boolean'],
        ]);

        $settings = $this->notifications->updateSettingsFor($organizationId, $data);

        $user = $request->user();
        Audit::log([
            'organization_id' => $organizationId,
            'user_id' => $user->id,
            'user_name' => $user->name,
            'user_role' => $user->role,
            'action' => 'UPDATED_NOTIFICATION_SETTINGS',
            'entity_type' => 'Organization',
            'entity_id' => $organizationId,
            'details' => 'Updated which notifications this organization sends',
            'ip_address' => $request->ip(),
        ]);

        return response()->json($settings);
    }

    /**
     * The delivery log, newest first, with a tally by status — the answer to
     * "did the teams actually get told?".
     */
    public function index(Request $request, string $organizationId): JsonResponse
    {
        $data = $request->validate([
            'status' => ['sometimes', 'string', 'in:queued,sent,failed,skipped'],
            'event' => ['sometimes', 'string', 'max:64'],
            'limit' => ['sometimes', 'integer', 'min:1', 'max:200'],
        ]);

        $query = Notification::query()->where('organization_id', $organizationId);

        if (! empty($data['status'])) {
            $query->where('status', $data['status']);
        }

        if (! empty($data['event'])) {
            $query->where('event', $data['event']);
        }

        $notifications = (clone $query)
            ->orderByDesc('created_at')
            ->limit((int) ($data['limit'] ?? 50))
            ->get();

        return response()->json([
            'notifications' => $notifications,
            'counts' => [
                'total' => Notification::query()->where('organization_id', $organizationId)->count(),
                'sent' => $this->countByStatus($organizationId, 'sent'),
                'queued' => $this->countByStatus($organizationId, 'queued'),
                'failed' => $this->countByStatus($organizationId, 'failed'),
                'skipped' => $this->countByStatus($organizationId, 'skipped'),
            ],
            'opted_out' => NotificationOptOut::query()
                ->where('organization_id', $organizationId)
                ->orderByDesc('created_at')
                ->get(),
        ]);
    }

    /**
     * Stop contacting a number, or start again.
     *
     * The organizer's to set, because they are the ones a manager tells to stop.
     * A gateway's own STOP reply would arrive on an inbound webhook, which no
     * provider is wired to yet — when one is, it calls the same service method.
     */
    public function optOut(Request $request, string $organizationId): JsonResponse
    {
        $data = $request->validate([
            'phone' => ['required', 'string', 'max:32'],
            'reason' => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);

        if (! Phone::normalize($data['phone'])) {
            return response()->json(['error' => 'That does not look like a phone number.'], 422);
        }

        $optOut = $this->notifications->optOut(
            $data['phone'],
            $organizationId,
            (string) ($data['reason'] ?? 'Asked not to be contacted'),
        );

        return response()->json(['opt_out' => $optOut], 201);
    }

    public function optIn(Request $request, string $organizationId): JsonResponse
    {
        $data = $request->validate([
            'phone' => ['required', 'string', 'max:32'],
        ]);

        $this->notifications->optIn($data['phone']);

        return response()->json(['message' => 'This number will be contacted again.']);
    }

    private function countByStatus(string $organizationId, string $status): int
    {
        return Notification::query()
            ->where('organization_id', $organizationId)
            ->where('status', $status)
            ->count();
    }
}

<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use App\Models\NotificationOptOut;
use App\Services\Notifications\Channels\ChannelManager;
use App\Services\Notifications\NotificationService;
use App\Support\Paginate;
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
            // Kept for older clients; `per_page` is the paging control now.
            'limit' => ['sometimes', 'integer', 'min:1', 'max:200'],
            'search' => ['sometimes', 'nullable', 'string', 'max:100'],
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:200'],
        ]);

        $query = Notification::query()->where('organization_id', $organizationId);

        if (! empty($data['status'])) {
            $query->where('status', $data['status']);
        }

        if (! empty($data['event'])) {
            $query->where('event', $data['event']);
        }

        // "Did the Kondotty lads get told?" is answered by searching the log
        // in the database — a filter over the newest fifty could not see
        // anything older, which is the question an organizer usually has.
        Paginate::search($query, $data['search'] ?? null, ['notifications.to', 'body', 'event']);

        $page = Paginate::query(
            $query->orderByDesc('created_at')->orderByDesc('id'),
            $request,
            defaultPerPage: (int) ($data['limit'] ?? 50),
        );

        $channels = app(ChannelManager::class);

        // A `log` send is reported by the engine as sent, but nobody received
        // it. Each row says so, and `delivery` says so for the whole setup, so
        // no organizer is told a team was contacted when it wasn't.
        $notifications = collect($page['data'])->map(function (Notification $n) {
            $row = $n->toArray();
            $row['simulated'] = $n->driver === 'log';

            return $row;
        })->values();

        return response()->json([
            'notifications' => $notifications,
            'pagination' => collect($page)->except('data')->all(),
            'delivery' => [
                'sms_simulated' => $channels->isSimulated('sms'),
                'whatsapp_simulated' => $channels->isSimulated('whatsapp'),
            ],
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

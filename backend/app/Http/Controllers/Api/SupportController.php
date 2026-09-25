<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SupportMessage;
use App\Models\SupportTicket;
use App\Models\Upload;
use App\Models\User;
use App\Services\SupportService;
use App\Support\Audit;
use App\Support\Paginate;
use App\Support\Phone;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Help & Support: a club's tickets to the platform, the super admin's inbox,
 * and the public form for someone who cannot sign in at all.
 *
 * Team managers, scorers and players are not here on purpose — their
 * questions belong to the organizer running their tournament.
 */
class SupportController extends Controller
{
    /** A support-folder upload, by path or full URL; group 1 is the file name. */
    private const ATTACHMENT_PATTERN = '/^(?:https?:\/\/[^\/\s]+)?\/?uploads\/support\/([A-Za-z0-9_.\-]+)$/';

    /** What a visitor with no account can ask about. */
    private const PUBLIC_CATEGORIES = ['account_access', 'billing', 'other'];

    public function __construct(private readonly SupportService $support) {}

    /* -------------------------------------------------------------- Organizer */

    /** `status`: active (open or awaiting the club) | open | awaiting_reply | resolved | closed. */
    public function index(Request $request, string $id): JsonResponse
    {
        $query = SupportTicket::query()->where('organization_id', $id);
        $this->filter($query, $request);

        return response()->json(Paginate::query($query, $request, fn (SupportTicket $t) => $this->row($t, 'user')));
    }

    public function store(Request $request, string $id): JsonResponse
    {
        if ($refused = $this->refuseSuperAdmin($request)) {
            return $refused;
        }

        $data = $request->validate([
            'category' => ['required', 'string', 'in:'.implode(',', SupportTicket::CATEGORIES)],
            'subject' => ['required', 'string', 'min:4', 'max:140'],
            'body' => ['required', 'string', 'min:10', 'max:5000'],
            'urgent' => ['sometimes', 'boolean'],
            'context' => ['sometimes', 'array'],
            'context.*' => ['nullable', 'string', 'max:200'],
            ...$this->attachmentRules(),
        ], [
            'category.required' => 'Choose what this is about.',
            'subject.required' => 'Give your question a short title.',
            'subject.min' => 'Write a few more words in the title.',
            'body.required' => 'Tell us what happened.',
            'body.min' => 'Write at least 10 characters so we can help.',
            ...$this->attachmentMessages(),
        ]);

        $user = $request->user();

        $ticket = $this->support->open([
            'category' => $data['category'],
            'subject' => trim($data['subject']),
            'body' => $data['body'],
            'priority' => ($data['urgent'] ?? false) ? 'urgent' : 'normal',
            'context' => $this->context($data['context'] ?? [], $request),
            'attachments' => $this->attachments($data['attachments'] ?? []),
        ], $user, $id);

        $this->audit($request, $ticket, 'SUPPORT_TICKET_OPENED', "Opened support ticket {$ticket->reference()}: {$ticket->subject}");

        return response()->json($this->thread($ticket, 'user'), 201);
    }

    public function show(Request $request, string $id, string $ticketId): JsonResponse
    {
        $ticket = $this->clubTicket($id, $ticketId);
        if (! $ticket) {
            return $this->notFound();
        }

        // Reading it is what clears the badge — but only when the club itself
        // reads it, not a super admin looking over its shoulder.
        if ($ticket->unread_by_user && $request->user()->role !== 'SUPER_ADMIN') {
            $ticket->forceFill(['unread_by_user' => false])->save();
        }

        return response()->json($this->thread($ticket, 'user'));
    }

    public function reply(Request $request, string $id, string $ticketId): JsonResponse
    {
        if ($refused = $this->refuseSuperAdmin($request)) {
            return $refused;
        }

        $ticket = $this->clubTicket($id, $ticketId);
        if (! $ticket) {
            return $this->notFound();
        }

        if ($ticket->status === 'closed') {
            return response()->json(['error' => 'This ticket is closed. Open a new one and mention '.$ticket->reference().'.'], 422);
        }

        $data = $request->validate([
            'body' => ['required', 'string', 'min:1', 'max:5000'],
            ...$this->attachmentRules(),
        ], ['body.required' => 'Write a reply first.', ...$this->attachmentMessages()]);

        $this->support->reply($ticket, $request->user(), 'user', $data['body'], $this->attachments($data['attachments'] ?? []));

        return response()->json($this->thread($ticket->refresh(), 'user'));
    }

    /** A club can say it is sorted, or take that back. Closing is the platform's call. */
    public function updateStatus(Request $request, string $id, string $ticketId): JsonResponse
    {
        if ($refused = $this->refuseSuperAdmin($request)) {
            return $refused;
        }

        $ticket = $this->clubTicket($id, $ticketId);
        if (! $ticket) {
            return $this->notFound();
        }

        $data = $request->validate([
            'status' => ['required', 'string', 'in:resolved,open'],
        ]);

        if ($ticket->status === 'closed') {
            return response()->json(['error' => 'This ticket is closed. Open a new one and mention '.$ticket->reference().'.'], 422);
        }

        // Reopening is for a resolved ticket; one still in progress stays as it is.
        if ($data['status'] === 'open') {
            if ($ticket->status !== 'resolved') {
                return response()->json($this->thread($ticket, 'user'));
            }
            // Back in the platform's court, so the inbox should notice it.
            $ticket->unread_by_admin = true;
        }

        $this->support->setStatus($ticket, $data['status']);

        return response()->json($this->thread($ticket, 'user'));
    }

    public function unreadCount(string $id): JsonResponse
    {
        return response()->json([
            'unread' => SupportTicket::query()->where('organization_id', $id)->where('unread_by_user', true)->count(),
        ]);
    }

    /* ----------------------------------------------------------------- Public */

    /**
     * The "can't sign in" form. It never looks the number up in front of the
     * caller, so it says nothing about whether an account exists. Quoting an
     * earlier reference from the same number adds to that ticket instead.
     */
    public function contact(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'phone' => ['required', 'string', 'max:24'],
            'email' => ['nullable', 'email', 'max:120'],
            'category' => ['required', 'string', 'in:'.implode(',', self::PUBLIC_CATEGORIES)],
            'subject' => ['nullable', 'string', 'max:140'],
            'body' => ['required', 'string', 'min:10', 'max:3000'],
            'reference' => ['nullable', 'string', 'max:20'],
        ], [
            'name.required' => 'Tell us your name.',
            'phone.required' => 'Give a number we can reach you on.',
            'body.required' => 'Tell us what is wrong.',
            'body.min' => 'Write at least 10 characters so we can help.',
        ]);

        $phone = Phone::normalize($data['phone']);
        if (! $phone) {
            return response()->json([
                'error' => 'That phone number does not look right.',
                'errors' => ['phone' => ['That phone number does not look right.']],
            ], 422);
        }

        $existing = $this->followUpTarget($data['reference'] ?? null, $phone);

        if ($existing) {
            $this->support->reply($existing, null, 'user', $data['body'], [], false, trim($data['name']));
            $ticket = $existing;
        } else {
            $ticket = $this->support->open([
                'category' => $data['category'],
                'subject' => trim((string) ($data['subject'] ?? '')) ?: $this->defaultSubject($data['category']),
                'body' => $data['body'],
                'contact_name' => trim($data['name']),
                'contact_phone' => $phone,
                'contact_email' => trim((string) ($data['email'] ?? '')),
                'context' => $this->context([], $request),
            ], null, null);
        }

        return response()->json([
            'reference' => $ticket->reference(),
            'message' => "We have your message ({$ticket->reference()}). We will get back to you on the number you gave.",
        ], 201);
    }

    /* ------------------------------------------------------------ Super admin */

    /** Also `category`, `priority`, `organization_id`, `unread=1`. */
    public function adminIndex(Request $request): JsonResponse
    {
        $query = SupportTicket::query()->with('organization:id,name');
        $this->filter($query, $request);

        if (in_array($request->query('category'), SupportTicket::CATEGORIES, true)) {
            $query->where('category', $request->query('category'));
        }
        if (in_array($request->query('priority'), SupportTicket::PRIORITIES, true)) {
            $query->where('priority', $request->query('priority'));
        }
        if ($organizationId = $request->query('organization_id')) {
            $query->where('organization_id', $organizationId);
        }
        if ($request->boolean('unread')) {
            $query->where('unread_by_admin', true);
        }

        return response()->json([
            ...Paginate::query($query, $request, fn (SupportTicket $t) => $this->row($t, 'admin')),
            'summary' => $this->summary(),
        ]);
    }

    public function adminSummary(): JsonResponse
    {
        return response()->json($this->summary());
    }

    public function adminShow(string $ticketId): JsonResponse
    {
        $ticket = SupportTicket::find($ticketId);
        if (! $ticket) {
            return $this->notFound();
        }

        if ($ticket->unread_by_admin) {
            $ticket->forceFill(['unread_by_admin' => false])->save();
        }

        return response()->json($this->thread($ticket, 'admin'));
    }

    public function adminReply(Request $request, string $ticketId): JsonResponse
    {
        $ticket = SupportTicket::find($ticketId);
        if (! $ticket) {
            return $this->notFound();
        }

        $data = $request->validate([
            'body' => ['required', 'string', 'min:1', 'max:5000'],
            'internal' => ['sometimes', 'boolean'],
            ...$this->attachmentRules(),
        ], ['body.required' => 'Write a reply first.', ...$this->attachmentMessages()]);

        $internal = (bool) ($data['internal'] ?? false);
        $this->support->reply($ticket, $request->user(), 'admin', $data['body'], $this->attachments($data['attachments'] ?? []), $internal);

        if (! $internal) {
            $this->audit($request, $ticket, 'SUPPORT_TICKET_REPLIED', "Replied to support ticket {$ticket->reference()}");
        }

        return response()->json($this->thread($ticket->refresh(), 'admin'));
    }

    public function adminUpdate(Request $request, string $ticketId): JsonResponse
    {
        $ticket = SupportTicket::find($ticketId);
        if (! $ticket) {
            return $this->notFound();
        }

        $data = $request->validate([
            'status' => ['sometimes', 'string', 'in:'.implode(',', SupportTicket::STATUSES)],
            'priority' => ['sometimes', 'string', 'in:'.implode(',', SupportTicket::PRIORITIES)],
            'category' => ['sometimes', 'string', 'in:'.implode(',', SupportTicket::CATEGORIES)],
            'assigned_to' => ['sometimes', 'nullable', 'string'],
        ]);

        if (array_key_exists('assigned_to', $data) && $data['assigned_to'] !== null
            && ! User::query()->whereKey($data['assigned_to'])->where('role', 'SUPER_ADMIN')->exists()) {
            return response()->json(['error' => 'Tickets can only be assigned to a platform admin.'], 422);
        }

        $changes = [];
        foreach (['priority', 'category', 'assigned_to'] as $field) {
            if (array_key_exists($field, $data) && $ticket->{$field} !== $data[$field]) {
                $ticket->{$field} = $data[$field];
                $changes[] = $field;
            }
        }
        $ticket->save();

        if (isset($data['status']) && $data['status'] !== $ticket->status) {
            $this->support->setStatus($ticket, $data['status']);
            $changes[] = 'status → '.$data['status'];
        }

        if ($changes) {
            $this->audit($request, $ticket, 'SUPPORT_TICKET_UPDATED', "Updated support ticket {$ticket->reference()}: ".implode(', ', $changes));
        }

        return response()->json($this->thread($ticket, 'admin'));
    }

    /* ---------------------------------------------------------------- Helpers */

    private function filter(Builder $query, Request $request): void
    {
        $status = $request->query('status');

        if ($status === 'active') {
            $query->whereIn('status', ['open', 'awaiting_reply']);
        } elseif (in_array($status, SupportTicket::STATUSES, true)) {
            $query->where('status', $status);
        }

        $search = trim((string) $request->query('search'));
        if (preg_match('/^kw\s*-?\s*(\d{1,9})$/i', $search, $match)) {
            $query->where('number', (int) $match[1]);
        } elseif ($search !== '') {
            $query->where(function (Builder $inner) use ($search) {
                Paginate::search($inner, $search, ['subject', 'contact_name']);

                // Bare digits are a ticket number or part of a phone number,
                // typed with whatever spacing; stored numbers are digits only.
                if (preg_match('/^[\d\s+\-()]+$/', $search)) {
                    $digits = preg_replace('/\D/', '', $search) ?? '';
                    if ($digits !== '') {
                        $inner->orWhere('contact_phone', 'like', '%'.$digits.'%');
                        if (strlen($digits) <= 9) {
                            $inner->orWhere('number', (int) $digits);
                        }
                    }
                }
            });
        }

        // Urgent first, then whatever moved most recently.
        $query->orderByRaw("CASE WHEN priority = 'urgent' AND status IN ('open', 'awaiting_reply') THEN 0 ELSE 1 END")
            ->orderByDesc('last_message_at')
            ->orderByDesc('id');
    }

    /** @return array<string, int> */
    private function summary(): array
    {
        return [
            'open' => SupportTicket::query()->where('status', 'open')->count(),
            'awaiting_reply' => SupportTicket::query()->where('status', 'awaiting_reply')->count(),
            'unread' => SupportTicket::query()->where('unread_by_admin', true)->count(),
            'urgent' => SupportTicket::query()->where('status', 'open')->where('priority', 'urgent')->count(),
        ];
    }

    /** @return array<string, mixed> */
    private function row(SupportTicket $ticket, string $side): array
    {
        $row = [
            'id' => $ticket->id,
            'reference' => $ticket->reference(),
            'category' => $ticket->category,
            'priority' => $ticket->priority,
            'status' => $ticket->status,
            'subject' => $ticket->subject,
            'unread' => $side === 'admin' ? $ticket->unread_by_admin : $ticket->unread_by_user,
            'last_message_at' => $ticket->last_message_at,
            'resolved_at' => $ticket->resolved_at,
            'created_at' => $ticket->created_at,
        ];

        if ($side === 'admin') {
            $row += [
                'organization_id' => $ticket->organization_id,
                'organization_name' => $ticket->organization?->name,
                'contact_name' => $ticket->contact_name,
                'contact_phone' => $ticket->contact_phone,
                'contact_email' => $ticket->contact_email,
                'assigned_to' => $ticket->assigned_to,
                'context' => $ticket->context ?? (object) [],
            ];
        }

        return $row;
    }

    /** @return array<string, mixed> */
    private function thread(SupportTicket $ticket, string $side): array
    {
        $messages = $ticket->messages()->get()
            ->when($side !== 'admin', fn ($all) => $all->reject(fn (SupportMessage $m) => $m->is_internal))
            ->map(fn (SupportMessage $m) => [
                'id' => $m->id,
                'author_name' => $m->author_name,
                'author_side' => $m->author_side,
                'body' => $m->body,
                'attachments' => $m->attachments ?? [],
                'created_at' => $m->created_at,
                ...($side === 'admin' ? ['is_internal' => $m->is_internal] : []),
            ])
            ->values();

        $payload = ['ticket' => $this->row($ticket->loadMissing('organization:id,name'), $side), 'messages' => $messages];

        if ($side === 'admin' && ! $ticket->organization_id && $ticket->contact_phone !== '') {
            $payload['matched_accounts'] = $this->accountsForPhone($ticket->contact_phone);
        }

        return $payload;
    }

    /**
     * Accounts on the number a locked-out visitor gave — what the admin needs to
     * issue a temporary password. Stored numbers vary in how they were typed.
     *
     * @return array<int, array<string, mixed>>
     */
    private function accountsForPhone(string $phone): array
    {
        // Spaces, dashes and the `+` stripped in SQL to find candidates; the
        // normalizer then decides, so a country code typed or not both match.
        return User::query()
            ->whereRaw("REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE ?", ['%'.substr($phone, -10)])
            ->with('organization:id,name')
            ->limit(20)
            ->get()
            ->filter(fn (User $user) => Phone::normalize($user->phone) === $phone)
            ->take(10)
            ->map(fn (User $user) => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $user->role,
                'organization_id' => $user->organization_id,
                'organization_name' => $user->organization?->name,
            ])
            ->values()
            ->all();
    }

    private function followUpTarget(?string $reference, string $phone): ?SupportTicket
    {
        if (! $reference || ! preg_match('/(\d{3,})/', $reference, $match)) {
            return null;
        }

        // Only a contact-form ticket: a club's thread is never written into from
        // outside, whoever knows its number and the organizer's phone.
        $ticket = SupportTicket::query()->where('number', (int) $match[1])->whereNull('organization_id')->first();

        return $ticket && $ticket->status !== 'closed' && $ticket->contact_phone === $phone
            ? $ticket
            : null;
    }

    private function clubTicket(string $organizationId, string $ticketId): ?SupportTicket
    {
        return SupportTicket::query()->whereKey($ticketId)->where('organization_id', $organizationId)->first();
    }

    /**
     * Only the keys the screens send, plus the browser, so a report of "it broke"
     * arrives with where and on what.
     *
     * @param  array<string, mixed>  $context
     * @return array<string, string>|null
     */
    private function context(array $context, Request $request): ?array
    {
        $kept = array_filter(
            array_intersect_key($context, array_flip(['page', 'tournament_id', 'match_id', 'invoice_id'])),
            fn ($value) => is_string($value) && trim($value) !== '',
        );

        $agent = substr((string) $request->userAgent(), 0, 200);
        if ($agent !== '') {
            $kept['user_agent'] = $agent;
        }

        return $kept ?: null;
    }

    private function defaultSubject(string $category): string
    {
        return match ($category) {
            'account_access' => "Can't sign in",
            'billing' => 'Question about payment',
            default => 'Message from the contact form',
        };
    }

    /** @return array<string, array<int, string>> */
    private function attachmentRules(): array
    {
        return [
            'attachments' => ['sometimes', 'array', 'max:3'],
            'attachments.*' => ['string', 'max:300', 'regex:'.self::ATTACHMENT_PATTERN],
        ];
    }

    /**
     * Only files this platform actually stored in the support folder, saved as
     * this platform's own URL — a link to another host would have the admin's
     * browser fetch it (and tell that host who is looking) on every view.
     *
     * @param  array<int, string>  $urls
     * @return array<int, string>
     */
    private function attachments(array $urls): array
    {
        $canonical = [];

        foreach (array_values($urls) as $index => $url) {
            $filename = preg_match(self::ATTACHMENT_PATTERN, $url, $match) ? $match[1] : null;

            if (! $filename || ! Upload::query()->where('folder', 'support')->where('filename', $filename)->exists()) {
                throw ValidationException::withMessages(["attachments.$index" => 'Attach screenshots uploaded here.']);
            }

            $canonical[] = url("uploads/support/{$filename}");
        }

        return array_values(array_unique($canonical));
    }

    /** @return array<string, string> */
    private function attachmentMessages(): array
    {
        return [
            'attachments.max' => 'Attach up to three screenshots.',
            'attachments.*.regex' => 'Attach screenshots uploaded here.',
        ];
    }

    /** The super admin answers from the inbox, not by writing as the club. */
    private function refuseSuperAdmin(Request $request): ?JsonResponse
    {
        return $request->user()->role === 'SUPER_ADMIN'
            ? response()->json(['error' => 'Answer club tickets from the Support inbox.'], 403)
            : null;
    }

    private function notFound(): JsonResponse
    {
        return response()->json(['error' => 'Ticket not found'], 404);
    }

    private function audit(Request $request, SupportTicket $ticket, string $action, string $details): void
    {
        $user = $request->user();

        Audit::log([
            'organization_id' => $ticket->organization_id,
            'user_id' => $user->id,
            'user_name' => $user->name,
            'user_role' => $user->role,
            'action' => $action,
            'entity_type' => 'SupportTicket',
            'entity_id' => $ticket->id,
            'details' => $details,
            'ip_address' => $request->ip(),
        ]);
    }
}

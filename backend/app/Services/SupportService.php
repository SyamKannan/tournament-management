<?php

namespace App\Services;

use App\Models\SupportMessage;
use App\Models\SupportTicket;
use App\Models\User;
use App\Services\Notifications\Audience;
use App\Services\Notifications\NotificationService;
use App\Support\Ids;
use App\Support\Phone;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * The one write path for support tickets: opening one, adding to its thread,
 * and moving it through its statuses.
 *
 * Who is waiting on whom is kept on the ticket — `open` means the platform owes
 * an answer, `awaiting_reply` means the club does — and each side has an unread
 * flag the other side's message raises. Internal notes change neither.
 */
class SupportService
{
    /** Resolved tickets nobody comes back to are closed after this long. */
    public const AUTO_CLOSE_DAYS = 7;

    private const FIRST_NUMBER = 1001;

    public function __construct(private readonly NotificationService $notifications) {}

    /**
     * @param  array{category: string, subject: string, body: string, priority?: string, context?: array<string, mixed>, attachments?: array<int, string>, contact_name?: string, contact_phone?: string, contact_email?: string}  $data
     */
    public function open(array $data, ?User $author, ?string $organizationId): SupportTicket
    {
        // Two tickets opened in the same instant can read the same highest
        // number; the unique index refuses the second, which then takes the next.
        for ($attempt = 1; ; $attempt++) {
            try {
                return DB::transaction(function () use ($data, $author, $organizationId) {
                    $ticket = SupportTicket::create([
                        'id' => Ids::unique('tkt'),
                        'number' => max(self::FIRST_NUMBER - 1, (int) SupportTicket::query()->max('number')) + 1,
                        'organization_id' => $organizationId,
                        'created_by' => $author?->id,
                        'contact_name' => $data['contact_name'] ?? ($author?->name ?? ''),
                        // Stored the one way, however it was typed, so a call link and
                        // a follow-up from the contact form both match it.
                        'contact_phone' => Phone::normalize($data['contact_phone'] ?? $author?->phone) ?? '',
                        'contact_email' => $data['contact_email'] ?? ($author?->email ?? ''),
                        'category' => $data['category'],
                        'priority' => $data['priority'] ?? 'normal',
                        'subject' => $data['subject'],
                        'context' => $data['context'] ?? null,
                        'status' => 'open',
                        'unread_by_admin' => true,
                        'unread_by_user' => false,
                        'last_message_at' => now(),
                    ]);

                    $this->writeMessage($ticket, $author, 'user', $data['body'], $data['attachments'] ?? [], false, $data['contact_name'] ?? null);

                    return $ticket;
                });
            } catch (QueryException $e) {
                if ($attempt >= 3) {
                    throw $e;
                }
            }
        }
    }

    /**
     * Add to a thread. `side` is `user` (the club or the visitor) or `admin`.
     *
     * @param  array<int, string>  $attachments
     */
    public function reply(
        SupportTicket $ticket,
        ?User $author,
        string $side,
        string $body,
        array $attachments = [],
        bool $internal = false,
        ?string $authorName = null,
    ): SupportMessage {
        $message = DB::transaction(function () use ($ticket, $author, $side, $body, $attachments, $internal, $authorName) {
            $message = $this->writeMessage($ticket, $author, $side, $body, $attachments, $internal, $authorName);

            if (! $internal) {
                if ($side === 'admin') {
                    $ticket->status = 'awaiting_reply';
                    $ticket->unread_by_user = true;
                } else {
                    // A club writing back — to an answer or to a ticket it had
                    // marked resolved — puts it back in the platform's court.
                    $ticket->status = 'open';
                    $ticket->unread_by_admin = true;
                }
                $ticket->resolved_at = null;
                $ticket->last_message_at = now();
                $ticket->save();
            }

            return $message;
        });

        // A side effect of the reply, never a reason for it to fail — same rule
        // as every other notification.
        if ($side === 'admin' && ! $internal) {
            try {
                $this->notifyReply($ticket, $body);
            } catch (\Throwable $e) {
                Log::warning('support.reply_notification_failed', ['ticket' => $ticket->id, 'error' => $e->getMessage()]);
            }
        }

        return $message;
    }

    public function setStatus(SupportTicket $ticket, string $status): SupportTicket
    {
        $ticket->status = $status;
        $ticket->resolved_at = in_array($status, ['resolved', 'closed'], true) ? ($ticket->resolved_at ?? now()) : null;
        $ticket->save();

        return $ticket;
    }

    /**
     * Close resolved tickets left alone for AUTO_CLOSE_DAYS. Acts only on what
     * the dates say, so running it twice closes nothing twice.
     */
    public function closeStale(bool $dryRun = false): int
    {
        $query = SupportTicket::query()
            ->where('status', 'resolved')
            ->where('resolved_at', '<=', now()->subDays(self::AUTO_CLOSE_DAYS));

        if ($dryRun) {
            return $query->count();
        }

        $closed = 0;
        foreach ($query->get() as $ticket) {
            $this->setStatus($ticket, 'closed');
            $closed++;
        }

        return $closed;
    }

    /** @param  array<int, string>  $attachments */
    private function writeMessage(
        SupportTicket $ticket,
        ?User $author,
        string $side,
        string $body,
        array $attachments,
        bool $internal,
        ?string $authorName,
    ): SupportMessage {
        return SupportMessage::create([
            'id' => Ids::unique('tmsg'),
            'ticket_id' => $ticket->id,
            'author_id' => $author?->id,
            // The platform answers as one voice; who typed it stays on the audit trail.
            'author_name' => $side === 'admin' ? 'KickWick Support' : ($author?->name ?? ($authorName ?: $ticket->contact_name)),
            'author_side' => $side,
            'body' => trim($body),
            'is_internal' => $internal,
            'attachments' => array_values($attachments) ?: null,
        ]);
    }

    /**
     * Tell whoever opened the ticket that an answer is waiting. A club reads it
     * in the app; a locked-out visitor has only this message, so it carries the
     * start of the answer either way.
     */
    private function notifyReply(SupportTicket $ticket, string $body): void
    {
        $creator = $ticket->creator;

        $recipients = match (true) {
            $creator && $creator->phone !== '' => [[
                'name' => $creator->name,
                'phone' => $creator->phone,
                'whatsapp' => $creator->phone,
                'role' => $creator->role,
            ]],
            $ticket->organization_id !== null => Audience::organizers($ticket->organization_id),
            default => [[
                'name' => $ticket->contact_name,
                'phone' => $ticket->contact_phone,
                'role' => 'contact',
            ]],
        };

        $this->notifications->dispatch(
            'support_reply',
            $recipients,
            [
                'reference' => $ticket->reference(),
                'excerpt' => Str::limit(preg_replace('/\s+/', ' ', trim($body)) ?? '', 240),
                'next_step' => $ticket->organization_id
                    ? 'Read and reply under Help & Support in KickWick.'
                    : 'To reply, use the contact form again with reference '.$ticket->reference().'.',
            ],
            $ticket->organization_id,
            'SupportTicket',
            $ticket->id,
        );
    }
}

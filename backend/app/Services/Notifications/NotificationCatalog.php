<?php

namespace App\Services\Notifications;

/**
 * Every message the platform can send, and the words it sends.
 *
 * One place on purpose. These go to village team managers and players on a
 * phone, most often over a poor connection, so they are written to be read at a
 * glance and to survive being cut to an SMS length: what happened, which
 * tournament, and the one thing to do about it.
 *
 * Templates take `{placeholders}` filled from the data the caller passes.
 * A placeholder with no value is dropped along with its surrounding line, so a
 * tournament with no venue does not send the word "at" followed by nothing.
 */
final class NotificationCatalog
{
    /**
     * channel: the channel to prefer. WhatsApp where there is something to read
     * and a link to follow, SMS where it has to arrive on any handset.
     *
     * audience: who it is for, which decides whose number is looked up.
     */
    private const EVENTS = [
        'team_registered' => [
            'channel' => 'whatsapp',
            'audience' => 'organizer',
            'description' => 'A team registered for one of your tournaments',
            'template' => "New team registration\n{team} has registered for {tournament}.\nManager: {manager}\nFee: {fee}\nApprove or decline them in your KickWick teams page.",
        ],
        'team_approved' => [
            'channel' => 'whatsapp',
            'audience' => 'team_manager',
            'description' => 'A team you manage was approved',
            'template' => "{team} is in!\nYour team is confirmed for {tournament}.\nStarts {start_date}{venue_line}\nBalance to pay: {balance}",
        ],
        'team_rejected' => [
            'channel' => 'whatsapp',
            'audience' => 'team_manager',
            'description' => 'A team you manage was declined',
            'template' => "{team} — registration declined\n{tournament} could not take your entry.\n{reason}\nContact {contact} if you think this is a mistake.",
        ],
        'payment_received' => [
            'channel' => 'whatsapp',
            'audience' => 'team_manager',
            'description' => 'A ground-fee payment was recorded',
            'template' => "Payment received — {amount}\n{team}, {tournament}.\nPaid so far: {paid} of {fee}\nStill to pay: {balance}\nReceipt: {receipt}",
        ],
        'fee_due_reminder' => [
            'channel' => 'sms',
            'audience' => 'team_manager',
            'description' => 'Reminder that a ground fee is still unpaid',
            'template' => "{team}: {balance} of the {tournament} entry fee is still due. Please settle before {deadline}.",
        ],
        'fixtures_published' => [
            'channel' => 'whatsapp',
            'audience' => 'team_manager',
            'description' => 'The fixture list for a tournament was published',
            'template' => "Fixtures are out — {tournament}\n{team} plays {match_count} match(es).\nFirst up: {first_match}\nFull list: {link}",
        ],
        'match_reminder' => [
            'channel' => 'sms',
            'audience' => 'team_manager',
            'description' => 'Reminder before a match your team is playing',
            'template' => "{team} vs {opponent} — {kickoff}{venue_line}. {tournament}. Please have your squad ready.",
        ],
        'match_result' => [
            'channel' => 'whatsapp',
            'audience' => 'team_manager',
            'description' => 'The result of a match your team played',
            'template' => "{tournament}\n{result}\n{summary}",
        ],
        'tournament_cancelled' => [
            'channel' => 'sms',
            'audience' => 'team_manager',
            'description' => 'A tournament your team entered was called off',
            'template' => "{tournament} has been cancelled. {reason} Contact {contact} about your entry fee.",
        ],
        'auction_player_sold' => [
            'channel' => 'whatsapp',
            'audience' => 'player',
            'description' => 'A player was sold at auction',
            'template' => "Sold! {player} to {team} for {price}.\n{tournament} auction.",
        ],
        'password_reset_code' => [
            // SMS, not WhatsApp: it has to reach a handset that may not have
            // WhatsApp at all, on a network where SMS is what still works.
            'channel' => 'sms',
            'audience' => 'account',
            'description' => 'A one-time code for someone resetting their password',
            'template' => 'Your KickWick code is {code}. It expires in {minutes} minutes. If you did not ask for it, ignore this message.',
        ],
        'subscription_expiring' => [
            'channel' => 'whatsapp',
            'audience' => 'organizer',
            'description' => 'Your KickWick plan is about to lapse',
            'template' => "Your {plan} plan ends {end_date} ({days_left} day(s) away).\nRenew in Billing to keep hosting tournaments.",
        ],
        'subscription_expired' => [
            'channel' => 'whatsapp',
            'audience' => 'organizer',
            'description' => 'Your KickWick plan has lapsed',
            'template' => "Your {plan} plan ended on {end_date}.\nYour tournaments stay online, but you cannot create new ones until you renew.",
        ],
        'support_reply' => [
            // SMS: for a locked-out visitor this is the only way the answer arrives.
            'channel' => 'sms',
            'audience' => 'organizer',
            'description' => 'KickWick support answered one of your tickets',
            'template' => "KickWick support replied to {reference}:\n{excerpt}\n{next_step}",
        ],
    ];

    /** @return array<int, string> */
    public static function events(): array
    {
        return array_keys(self::EVENTS);
    }

    public static function exists(string $event): bool
    {
        return isset(self::EVENTS[$event]);
    }

    public static function channel(string $event): string
    {
        return self::EVENTS[$event]['channel'] ?? 'sms';
    }

    public static function audience(string $event): string
    {
        return self::EVENTS[$event]['audience'] ?? 'team_manager';
    }

    /**
     * The catalogue as the settings screen shows it — every event with what it
     * is for, so an organizer is switching off something they understand.
     *
     * @return array<int, array{event: string, channel: string, audience: string, description: string}>
     */
    public static function describe(): array
    {
        $out = [];

        foreach (self::EVENTS as $event => $definition) {
            $out[] = [
                'event' => $event,
                'channel' => $definition['channel'],
                'audience' => $definition['audience'],
                'description' => $definition['description'],
            ];
        }

        return $out;
    }

    /**
     * Fill a template.
     *
     * A line whose placeholders are all empty is dropped rather than left half
     * written, which is what keeps one template usable for a tournament that
     * has a venue and one that does not.
     *
     * @param  array<string, mixed>  $data
     */
    public static function render(string $event, array $data): string
    {
        $template = self::EVENTS[$event]['template'] ?? '';
        $lines = [];

        foreach (explode("\n", $template) as $line) {
            $placeholders = [];
            preg_match_all('/\{(\w+)\}/', $line, $placeholders);

            $rendered = $line;
            $filled = 0;
            $total = count($placeholders[1]);

            foreach ($placeholders[1] as $key) {
                $value = trim((string) ($data[$key] ?? ''));

                if ($value !== '') {
                    $filled++;
                }

                $rendered = str_replace('{'.$key.'}', $value, $rendered);
            }

            // A line made only of placeholders, none of which had a value, has
            // nothing left to say.
            if ($total > 0 && $filled === 0 && trim(preg_replace('/\{(\w+)\}/', '', $line) ?? '') === '') {
                continue;
            }

            $rendered = trim(preg_replace('/[ \t]+/', ' ', $rendered) ?? '');

            if ($rendered !== '') {
                $lines[] = $rendered;
            }
        }

        return implode("\n", $lines);
    }
}

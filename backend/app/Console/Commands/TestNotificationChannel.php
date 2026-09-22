<?php

namespace App\Console\Commands;

use App\Models\Notification;
use App\Services\Notifications\Channels\ChannelManager;
use App\Support\Phone;
use Illuminate\Console\Command;

/**
 * Send one real message through the configured gateway and report what it said.
 *
 * For setting up a gateway: it goes straight to the driver — no queue, no
 * opt-out check, no row in any club's delivery log — so the answer comes back
 * in the terminal, with the gateway's own error code when it refuses.
 *
 *     php artisan notifications:test 9847012345
 *     php artisan notifications:test 9847012345 --channel=whatsapp --event=password_reset_code
 *
 * For Indian SMS the text must match a DLT-approved template word for word, so
 * pass one with --message.
 */
class TestNotificationChannel extends Command
{
    protected $signature = 'notifications:test
                            {phone : Recipient mobile number (10-digit Indian numbers are fine)}
                            {--channel=sms : sms or whatsapp}
                            {--event=password_reset_code : Event to send as — picks the WhatsApp template when one is mapped}
                            {--message= : Exact text to send (must match a DLT template for Indian SMS)}';

    protected $description = 'Send one test message through the configured SMS/WhatsApp gateway';

    public function handle(ChannelManager $channels): int
    {
        $channel = (string) $this->option('channel');

        if (! in_array($channel, ['sms', 'whatsapp'], true)) {
            $this->error('--channel must be sms or whatsapp.');

            return self::INVALID;
        }

        $to = Phone::normalize((string) $this->argument('phone'));

        if (! $to) {
            $this->error('That does not look like a phone number.');

            return self::INVALID;
        }

        $driverName = $channels->driverNameFor($channel);
        $this->line("Channel: {$channel}   Driver: {$driverName}   To: +{$to}");

        foreach ($channels->healthIssues() as $issue) {
            if (in_array($issue['channel'], [$channel, 'all'], true)) {
                $this->warn('  '.$issue['message']);
            }
        }

        if ($driverName === 'log') {
            $this->warn("The {$channel} channel is on the `log` driver — this will be written to the log, not sent.");
        }

        $notification = new Notification([
            'id' => 'test-'.now()->timestamp,
            'event' => (string) $this->option('event'),
            'channel' => $channel,
            'to' => $to,
            'body' => (string) ($this->option('message') ?: 'KickWick test message. If you received this, messages are working.'),
        ]);

        try {
            $result = $channels->for($channel)->send($notification);
        } catch (\Throwable $e) {
            $this->error('Driver error: '.$e->getMessage());

            return self::FAILURE;
        }

        if ($result->delivered) {
            $this->info("Accepted by the gateway. Reference: {$result->reference}");
            $this->line('Check the phone — and the gateway\'s message logs for the carrier\'s final status.');

            return self::SUCCESS;
        }

        $this->error(($result->retryable ? 'Failed (would be retried): ' : 'Refused (would not be retried): ').$result->error);

        return self::FAILURE;
    }
}

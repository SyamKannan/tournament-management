<?php

namespace App\Services\Notifications\Channels;

use Illuminate\Contracts\Container\Container;

/**
 * Hands out the driver configured for a channel.
 *
 * Drivers are registered by name rather than discovered, so the set of things
 * that can send a message to a member of the public is a list you can read.
 */
class ChannelManager
{
    /** @var array<string, class-string<ChannelDriver>> */
    private array $drivers = [
        'log' => LogDriver::class,
        'twilio' => TwilioDriver::class,
        'meta_whatsapp' => MetaWhatsAppDriver::class,
    ];

    public function __construct(private readonly Container $container) {}

    /**
     * Register a gateway. Called from a service provider when one is added, so
     * a new driver never means editing this class.
     *
     * @param  class-string<ChannelDriver>  $driver
     */
    public function extend(string $name, string $driver): void
    {
        $this->drivers[$name] = $driver;
    }

    /**
     * @throws \RuntimeException when the channel names a driver that is not registered
     */
    public function for(string $channel): ChannelDriver
    {
        $name = (string) config("notifications.channels.{$channel}", 'log');

        if (! isset($this->drivers[$name])) {
            throw new \RuntimeException("No notification driver registered as [{$name}] for the {$channel} channel.");
        }

        return $this->container->make($this->drivers[$name]);
    }

    /** @return array<int, string> */
    public function registered(): array
    {
        return array_keys($this->drivers);
    }

    /** The driver name configured for a channel, without building it. */
    public function driverNameFor(string $channel): string
    {
        return (string) config("notifications.channels.{$channel}", 'log');
    }

    /**
     * Whether a channel only records messages instead of sending them.
     *
     * The engine reports a `log` send as successful on purpose — the row, the
     * opt-out check and the retry sweep all have to keep working without a
     * gateway. But "sent" then means "written to a log file", and an organizer
     * reading their notification list must not be told a team was contacted
     * when nobody was. Everything user-facing asks this first.
     */
    public function isSimulated(string $channel): bool
    {
        return $this->driverNameFor($channel) === 'log';
    }

    /**
     * Whether the product offers messaging at all.
     *
     * False hides every WhatsApp/SMS surface and the SMS password-reset route,
     * because none of it can work: a `log` driver delivers nothing. Explicit
     * config wins; otherwise it is on as soon as a channel names a real driver.
     */
    public function featureEnabled(): bool
    {
        $configured = config('notifications.feature_enabled');

        if ($configured !== null && $configured !== '') {
            return filter_var($configured, FILTER_VALIDATE_BOOLEAN);
        }

        return ! $this->isSimulated('sms') || ! $this->isSimulated('whatsapp');
    }

    /**
     * What is wrong with the current notification setup, in words an operator
     * can act on. Empty means messages are really going out.
     *
     * @return array<int, array{channel: string, driver: string, severity: string, message: string}>
     */
    public function healthIssues(): array
    {
        $issues = [];

        // Hidden on purpose: nothing is being sent, and nothing in the product
        // offers to send it. That is a setup state, not a fault.
        if (! $this->featureEnabled()) {
            return [];
        }

        if (! config('notifications.enabled')) {
            $issues[] = [
                'channel' => 'all',
                'driver' => 'none',
                'severity' => 'critical',
                'message' => 'Notifications are switched off entirely (NOTIFICATIONS_ENABLED=false). '
                    .'Nothing is queued, including password reset codes.',
            ];

            return $issues;
        }

        foreach (['sms', 'whatsapp'] as $channel) {
            $driver = $this->driverNameFor($channel);

            if (! isset($this->drivers[$driver])) {
                $issues[] = [
                    'channel' => $channel,
                    'driver' => $driver,
                    'severity' => 'critical',
                    'message' => "No driver is registered as [{$driver}], so every {$channel} message fails.",
                ];

                continue;
            }

            if ($driver !== 'log') {
                foreach ($this->missingCredentials($driver, $channel) as $missing) {
                    $issues[] = [
                        'channel' => $channel,
                        'driver' => $driver,
                        'severity' => 'critical',
                        'message' => "The {$driver} driver carries {$channel} but {$missing} is not set.",
                    ];
                }

                continue;
            }

            // `log` in production means a real person asking for a password
            // reset code never receives one, and there is no other way in.
            $issues[] = [
                'channel' => $channel,
                'driver' => 'log',
                'severity' => app()->isProduction() ? 'critical' : 'info',
                'message' => app()->isProduction()
                    ? "The {$channel} channel is still on the `log` driver, so messages are written to the "
                        ."application log and never delivered. Password reset codes cannot reach anyone."
                    : "The {$channel} channel records messages instead of sending them (no gateway configured).",
            ];
        }

        return $issues;
    }

    /**
     * Credentials a configured driver needs but has not been given.
     *
     * @return array<int, string>
     */
    private function missingCredentials(string $driver, string $channel): array
    {
        $required = match ($driver) {
            'twilio' => array_filter([
                'TWILIO_SID' => 'notifications.twilio.sid',
                'TWILIO_TOKEN' => 'notifications.twilio.token',
                // A Messaging Service stands in for the per-channel sender.
                ($channel === 'whatsapp' ? 'TWILIO_WHATSAPP_FROM' : 'TWILIO_SMS_FROM').' or TWILIO_MESSAGING_SERVICE_SID'
                    => blank(config('notifications.twilio.messaging_service_sid'))
                        ? ($channel === 'whatsapp' ? 'notifications.twilio.whatsapp_from' : 'notifications.twilio.sms_from')
                        : null,
            ]),
            'meta_whatsapp' => [
                'META_WHATSAPP_PHONE_NUMBER_ID' => 'notifications.meta.phone_number_id',
                'META_WHATSAPP_TOKEN' => 'notifications.meta.token',
            ],
            default => [],
        };

        $missing = [];

        foreach ($required as $envName => $configKey) {
            if (blank(config($configKey))) {
                $missing[] = $envName;
            }
        }

        return $missing;
    }
}

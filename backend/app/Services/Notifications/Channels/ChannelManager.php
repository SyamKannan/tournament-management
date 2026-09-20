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
}

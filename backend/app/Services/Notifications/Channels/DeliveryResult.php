<?php

namespace App\Services\Notifications\Channels;

/**
 * What a driver made of one send attempt.
 *
 * `retryable` is the driver's judgement, and the only thing it is asked to
 * decide: a gateway timeout is worth another go, a number the gateway calls
 * invalid never will be, and retrying it just burns the allowance.
 */
final class DeliveryResult
{
    private function __construct(
        public readonly bool $delivered,
        public readonly ?string $reference = null,
        public readonly ?string $error = null,
        public readonly bool $retryable = false,
    ) {}

    public static function sent(?string $reference = null): self
    {
        return new self(true, $reference);
    }

    /** A failure worth trying again — a timeout, a 5xx, a rate limit. */
    public static function failed(string $error): self
    {
        return new self(false, null, $error, true);
    }

    /** A failure that will never succeed — a bad number, a rejected template. */
    public static function rejected(string $error): self
    {
        return new self(false, null, $error, false);
    }
}

<?php

namespace App\Services;

use App\Models\User;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;

/**
 * Issues and verifies the HS256 bearer tokens the SPA stores in localStorage.
 */
class TokenService
{
    public const DEV_FALLBACK_SECRET = 'local-development-only-jwt-secret-change-me';

    public function issue(User $user): string
    {
        $issuedAt = time();

        return JWT::encode([
            'id' => $user->id,
            'role' => $user->role,
            'email' => $user->email,
            'iat' => $issuedAt,
            'exp' => $issuedAt + (int) config('auth.jwt.ttl'),
        ], $this->secret(), 'HS256');
    }

    /**
     * @return array{id: string, role: string, email: string}|null
     */
    public function decode(string $token): ?array
    {
        $key = new Key($this->secret(), 'HS256');

        try {
            $payload = (array) JWT::decode($token, $key);
        } catch (\Throwable) {
            return null;
        }

        if (! isset($payload['id'])) {
            return null;
        }

        return [
            'id' => (string) $payload['id'],
            'role' => (string) ($payload['role'] ?? ''),
            'email' => (string) ($payload['email'] ?? ''),
        ];
    }

    /**
     * The committed fallback secret is public, so anyone could forge a
     * super-admin token with it. Production refuses to run on it rather than
     * silently accepting forged tokens.
     */
    private function secret(): string
    {
        $secret = (string) config('auth.jwt.secret');

        if (app()->environment('production') && ($secret === self::DEV_FALLBACK_SECRET || strlen($secret) < 32)) {
            throw new \RuntimeException('JWT_SECRET must be set to a random value of at least 32 characters in production.');
        }

        return $secret;
    }
}

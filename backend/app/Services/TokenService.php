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
    public function issue(User $user): string
    {
        $issuedAt = time();

        return JWT::encode([
            'id' => $user->id,
            'role' => $user->role,
            'email' => $user->email,
            'iat' => $issuedAt,
            'exp' => $issuedAt + (int) config('auth.jwt.ttl'),
        ], (string) config('auth.jwt.secret'), 'HS256');
    }

    /**
     * @return array{id: string, role: string, email: string}|null
     */
    public function decode(string $token): ?array
    {
        try {
            $payload = (array) JWT::decode($token, new Key((string) config('auth.jwt.secret'), 'HS256'));
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
}

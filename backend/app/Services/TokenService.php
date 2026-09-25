<?php

namespace App\Services;

use App\Models\RevokedToken;
use App\Models\User;
use App\Support\Ids;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;

/**
 * Issues, verifies and revokes the HS256 bearer tokens the SPA stores in
 * localStorage.
 *
 * The tokens carry their own expiry, so most of the time nothing has to be
 * stored to check one. Revocation is the exception, and there are two kinds:
 *
 *   - one token, by its `jti` — signing out of a session, or ending an
 *     impersonation, where the token to kill is the one in hand;
 *   - every token a user holds, by `users.token_version` — a password change,
 *     "sign out everywhere", or an organization being suspended, where the
 *     sessions to end are not known individually.
 *
 * `authenticate()` is the one way in: it applies both, so no caller can check
 * the signature and forget the rest.
 */
class TokenService
{
    public const DEV_FALLBACK_SECRET = 'local-development-only-jwt-secret-change-me';

    /**
     * @param  string|null  $impersonatorId  the super admin looking through this
     *                                       account; carried as `imp` so the API can
     *                                       tell their session from the user's own
     */
    public function issue(User $user, ?string $impersonatorId = null): string
    {
        $issuedAt = time();

        return JWT::encode(array_filter([
            'id' => $user->id,
            'role' => $user->role,
            'email' => $user->email,
            // Names this token so it alone can be revoked later.
            'jti' => Ids::unique('tok'),
            // The version this was issued under; `revokeAllFor()` moves the
            // user past it and every token stamped with an older one is done.
            'tv' => (int) ($user->token_version ?? 0),
            'iat' => $issuedAt,
            'exp' => $issuedAt + (int) config('auth.jwt.ttl'),
            'imp' => $impersonatorId,
        ], fn ($value) => $value !== null), $this->secret(), 'HS256');
    }

    /**
     * The user a token stands for, or null if it is not one we will accept.
     *
     * This is what the middleware calls: the signature, the expiry, the
     * denylist and the user's own cut-off are all checked here.
     */
    public function authenticate(string $token): ?User
    {
        $claims = $this->decode($token);

        if (! $claims) {
            return null;
        }

        $user = User::find($claims['id']);

        if (! $user) {
            return null;
        }

        // Tokens from a superseded version are gone: the password changed, the
        // user signed out everywhere, or their organization was suspended. A
        // token issued after that carries the new version and lives, however
        // close together the two happened — which a timestamp could not tell
        // apart, `iat` being accurate only to the second.
        if ($claims['tv'] !== (int) ($user->token_version ?? 0)) {
            return null;
        }

        $user->impersonatorId = $claims['imp'];

        return $user;
    }

    /**
     * Claims from a token that is correctly signed, unexpired and not revoked.
     *
     * @return array{id: string, role: string, email: string, jti: string, tv: int, iat: int, exp: int, imp: string|null}|null
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

        $jti = (string) ($payload['jti'] ?? '');

        // Tokens issued before revocation existed carry no `jti`, so there is
        // nothing to look up. They are still ours — the signature says so —
        // and their missing `tv` reads as version 0, which is where every
        // account starts, so they keep working until something revokes them
        // rather than logging everyone out the day this ships.
        if ($jti !== '' && $this->isRevoked($jti)) {
            return null;
        }

        return [
            'id' => (string) $payload['id'],
            'role' => (string) ($payload['role'] ?? ''),
            'email' => (string) ($payload['email'] ?? ''),
            'jti' => $jti,
            'tv' => (int) ($payload['tv'] ?? 0),
            'iat' => (int) ($payload['iat'] ?? 0),
            'exp' => (int) ($payload['exp'] ?? 0),
            'imp' => isset($payload['imp']) ? (string) $payload['imp'] : null,
        ];
    }

    /**
     * Refuse this one token from now on. Used for signing out of a session and
     * for ending an impersonation, where the other sessions must survive.
     *
     * Safe to call twice, and on a token that is already expired or malformed
     * — signing out should never fail on the way out of the door.
     */
    public function revoke(string $token): void
    {
        $claims = $this->decode($token);

        if (! $claims || $claims['jti'] === '') {
            return;
        }

        $this->pruneExpired();

        RevokedToken::query()->updateOrCreate(
            ['jti' => $claims['jti']],
            [
                'user_id' => $claims['id'],
                'expires_at' => $claims['exp'] ?: time() + (int) config('auth.jwt.ttl'),
                'created_at' => now(),
            ]
        );
    }

    /**
     * Refuse every token this user currently holds.
     *
     * Nothing is written per token — moving the user's version covers tokens
     * this server has never seen, which is the point: a password change has to
     * end sessions on devices nobody can enumerate.
     *
     * A token issued after this call carries the new version and is unaffected,
     * so the caller can be handed a replacement and stay signed in.
     */
    public function revokeAllFor(User $user): void
    {
        $user->increment('token_version');
    }

    private function isRevoked(string $jti): bool
    {
        return RevokedToken::query()->whereKey($jti)->exists();
    }

    /**
     * Drop denylist rows for tokens that have expired on their own.
     *
     * Done on write rather than on a schedule: the table only grows when
     * someone signs out, so the work belongs there and the application needs
     * no cron to stay tidy.
     */
    private function pruneExpired(): void
    {
        RevokedToken::query()->where('expires_at', '<', time())->delete();
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

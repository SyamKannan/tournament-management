<?php

namespace App\Services;

use App\Models\PasswordReset;
use App\Models\User;
use App\Services\Notifications\NotificationService;
use App\Support\Ids;
use App\Support\Phone;
use Illuminate\Support\Facades\Hash;

/**
 * Sending a one-time code and taking it back.
 *
 * Deliberately says the same thing whether or not the account exists. An honest
 * "no such number" turns this endpoint into a way to find out who is registered,
 * and for a platform whose users are identified by mobile number that is a list
 * worth having.
 *
 * The code goes out over SMS — not WhatsApp — because it has to arrive on the
 * handset of a scorer who may not have WhatsApp installed, and because SMS is
 * the channel that still works on a village network.
 */
class PasswordResetService
{
    /** Long enough not to be guessed inside the attempt limit, short enough to read out. */
    private const CODE_LENGTH = 6;

    private const TTL_MINUTES = 15;

    public function __construct(private readonly NotificationService $notifications) {}

    /**
     * Start a reset for whoever this identifier belongs to.
     *
     * Returns nothing about whether it matched — the caller answers the same way
     * either way.
     */
    public function request(string $identifier): void
    {
        $user = $this->findUser($identifier);

        if (! $user) {
            return;
        }

        $to = Phone::normalize($user->phone);

        if (! $to) {
            // Nothing to send to. Not an error the caller can be told about
            // without revealing that the account exists.
            return;
        }

        // One live code per account: asking again replaces the last one rather
        // than leaving several valid at once.
        PasswordReset::query()->where('user_id', $user->id)->whereNull('used_at')->delete();

        $code = $this->generateCode();

        PasswordReset::create([
            'id' => Ids::unique('reset'),
            'user_id' => $user->id,
            'identifier' => $this->normalizeIdentifier($identifier),
            'code_hash' => Hash::make($code),
            'expires_at' => now()->addMinutes(self::TTL_MINUTES),
            'created_at' => now(),
        ]);

        $this->notifications->dispatch(
            'password_reset_code',
            [[
                'name' => $user->name,
                'phone' => $user->phone,
                'whatsapp' => null,
                'role' => $user->role,
            ]],
            ['code' => $code, 'minutes' => (string) self::TTL_MINUTES],
            // Not the organization's to switch off: being locked out of an
            // account is not marketing.
            organizationId: null,
            relatedType: 'user',
            relatedId: $user->id,
        );
    }

    /**
     * Finish a reset. Returns the user on success, or a reason it failed.
     *
     * @return array{user: ?User, error: ?string}
     */
    public function complete(string $identifier, string $code, string $newPassword): array
    {
        $user = $this->findUser($identifier);

        if (! $user) {
            return ['user' => null, 'error' => 'That code is not valid or has expired.'];
        }

        $reset = PasswordReset::query()
            ->where('user_id', $user->id)
            ->whereNull('used_at')
            ->latest('created_at')
            ->first();

        if (! $reset || ! $reset->isUsable()) {
            return ['user' => null, 'error' => 'That code is not valid or has expired.'];
        }

        // Each guess claims an attempt before it is compared, in one
        // conditional update: read-then-increment let parallel requests all
        // see "4 attempts so far" and each get a guess past the ceiling.
        $claimed = PasswordReset::query()
            ->whereKey($reset->id)
            ->whereNull('used_at')
            ->where('attempts', '<', PasswordReset::MAX_ATTEMPTS)
            ->increment('attempts');

        if (! $claimed || ! Hash::check($code, $reset->code_hash)) {
            return ['user' => null, 'error' => 'That code is not valid or has expired.'];
        }

        $user->password_hash = Hash::make($newPassword);
        $user->must_change_password = false;
        $user->save();

        $reset->used_at = now();
        $reset->save();

        return ['user' => $user, 'error' => null];
    }

    /**
     * Accepts a phone number or an email — people remember one or the other, and
     * which one it is is obvious from what they typed.
     */
    private function findUser(string $identifier): ?User
    {
        // An email is an email, even one with ten digits in it — reading its
        // digits as a phone number found somebody else's account.
        if (str_contains($identifier, '@')) {
            return User::query()->whereRaw('LOWER(email) = ?', [mb_strtolower(trim($identifier))])->first();
        }

        $phone = Phone::normalize($identifier);

        if (! $phone) {
            return null;
        }

        // Stored numbers are not normalised: narrow on the last ten digits in
        // SQL, then compare properly.
        $matches = User::query()
            ->whereRaw("REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '+', ''), '-', ''), '(', ''), ')', ''), '.', '') LIKE ?", ['%'.substr($phone, -10)])
            ->limit(20)
            ->get()
            ->filter(fn (User $user) => Phone::normalize($user->phone) === $phone)
            ->values();

        // Phone numbers aren't unique: one person often holds a player and a
        // manager account on the same number. Picking one of them would reset
        // whichever the database happened to return, so a shared number sends
        // nothing and the person is told to use their email instead.
        return $matches->count() === 1 ? $matches->first() : null;
    }

    private function normalizeIdentifier(string $identifier): string
    {
        return Phone::normalize($identifier) ?? mb_strtolower(trim($identifier));
    }

    /** Numeric, so it can be read off a screen and typed on a keypad. */
    private function generateCode(): string
    {
        $code = '';

        for ($i = 0; $i < self::CODE_LENGTH; $i++) {
            $code .= random_int(0, 9);
        }

        return $code;
    }
}

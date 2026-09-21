<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\Hash;

/**
 * Passwords set by someone other than the account's owner.
 *
 * Two flows need one: onboarding a club (the super admin creates the organizer's
 * account) and getting a locked-out person back in when the SMS code cannot
 * reach them. Both used to be unsafe in opposite ways — onboarding fell back to
 * the same `admin123` for every club, and there was no way back in at all.
 *
 * A temporary password here is random, shown exactly once to the person who
 * issued it, and marks the account `must_change_password`, so the app asks the
 * owner to choose their own at the next sign-in and the handed-over secret
 * stops being valid knowledge.
 */
class TemporaryPasswordService
{
    /**
     * No 0/O, 1/l/I — this is read aloud over the phone or copied off a screen
     * by someone who may not be at a desk.
     */
    private const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    public function __construct(private readonly TokenService $tokens) {}

    public function generate(int $length = 10): string
    {
        $alphabet = self::ALPHABET;
        $max = strlen($alphabet) - 1;
        $password = '';

        for ($i = 0; $i < $length; $i++) {
            $password .= $alphabet[random_int(0, $max)];
        }

        return $password;
    }

    /**
     * Give an existing account a fresh temporary password.
     *
     * Every session it holds is ended: whoever had the old password — the
     * reason for a reset is often that someone else does — must not keep a
     * signed-in tab.
     */
    public function issue(User $user): string
    {
        $password = $this->generate();

        $user->password_hash = Hash::make($password);
        $user->must_change_password = true;
        $user->save();

        $this->tokens->revokeAllFor($user);

        return $password;
    }
}

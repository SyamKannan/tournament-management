<?php

namespace App\Services;

use App\Models\Player;
use App\Models\User;
use Illuminate\Support\Collection;

/**
 * Who a squad entry belongs to, and the Player Code that names them.
 *
 * A `players` row is one person in one team in one tournament, so the same
 * person turns up as several rows. They are joined up through a player
 * account: the account's own id (a player who signed up), or its phone number
 * on the squad entry. Only accounts with the PLAYER role link by phone — a team
 * manager who types their own number against every player in the squad must
 * not merge the whole squad into one person.
 *
 * The Player Code (`SP-7K4Q2`) is how a player finds their own stats without
 * logging in. It belongs to the person, not the row: every entry linked to the
 * same account carries the same code, so a player keeps one code for life.
 * Entries with no account each get their own.
 */
class PlayerIdentity
{
    public const CODE_PREFIX = 'SP-';

    /** No 0/O, 1/I/L or 5/S look-alikes, so a code read aloud or off a phone screen is typed right. */
    private const CODE_ALPHABET = '2346789ABCDEFGHJKMNPQRTUVWXYZ';

    private const CODE_LENGTH = 5;

    /**
     * The player account behind a squad entry, if any.
     */
    public function accountFor(Player $player): ?User
    {
        $account = $player->id ? User::query()->whereKey($player->id)->where('role', 'PLAYER')->first() : null;

        if ($account) {
            return $account;
        }

        $key = $this->phoneKey($player->mobile);

        return $key
            ? User::query()
                ->where('role', 'PLAYER')
                ->whereRaw($this->normalizedPhoneSql('phone').' LIKE ?', ['%'.$key])
                ->first()
            : null;
    }

    /**
     * Every squad entry belonging to the same person, the given one included.
     *
     * @return array{account: ?User, entries: Collection<int, Player>}
     */
    public function linkedEntries(Player $player): array
    {
        $account = $this->accountFor($player);
        $entries = $account ? $this->entriesForAccount($account) : collect();

        if (! $entries->contains(fn (Player $entry) => $entry->id === $player->id)) {
            $entries->push($player);
        }

        return ['account' => $account, 'entries' => $entries->values()];
    }

    /**
     * Give an entry its Player Code — the one the same person already carries
     * on another entry, or a fresh one. Leaves an existing code alone.
     */
    public function assignCode(Player $player): void
    {
        if ($player->player_code) {
            return;
        }

        $account = $this->accountFor($player);

        $existing = $account
            ? $this->entriesForAccount($account)
                ->where('id', '!=', $player->id)
                ->pluck('player_code')
                ->filter()
                ->first()
            : null;

        $player->player_code = $existing ?? $this->newCode();
    }

    /**
     * Give every entry that has no code yet one, oldest first, so a person's
     * earliest entry decides the code the later ones share.
     */
    public function backfillCodes(): void
    {
        Player::query()
            ->whereNull('player_code')
            ->orderBy('created_at')
            ->orderBy('id')
            ->each(function (Player $player) {
                $this->assignCode($player);
                $player->saveQuietly();
            });
    }

    /**
     * A code as the player typed it — any case, with or without the prefix,
     * dash or spaces — in its stored form, or null if it can't be one.
     */
    public function normalizeCode(string $input): ?string
    {
        $compact = strtoupper(preg_replace('/[\s\-]/', '', $input));

        if (str_starts_with($compact, 'SP') && strlen($compact) === strlen('SP') + self::CODE_LENGTH) {
            $compact = substr($compact, 2);
        }

        $pattern = '/^['.self::CODE_ALPHABET.']{'.self::CODE_LENGTH.'}$/';

        return preg_match($pattern, $compact) ? self::CODE_PREFIX.$compact : null;
    }

    private function newCode(): string
    {
        do {
            $code = self::CODE_PREFIX;
            for ($i = 0; $i < self::CODE_LENGTH; $i++) {
                $code .= self::CODE_ALPHABET[random_int(0, strlen(self::CODE_ALPHABET) - 1)];
            }
        } while (Player::query()->where('player_code', $code)->exists());

        return $code;
    }

    /** @return Collection<int, Player> */
    private function entriesForAccount(User $account): Collection
    {
        $key = $this->phoneKey($account->phone);

        return Player::query()
            ->where('id', $account->id)
            ->when($key, fn ($query) => $query->orWhereRaw($this->normalizedPhoneSql('mobile').' LIKE ?', ['%'.$key]))
            ->get();
    }

    /**
     * The last ten digits of a phone number, so "+91 98471 88881" and
     * "9847188881" are the same person. Too short to be a real number is no
     * key at all — a stray "0" must not join everyone up.
     */
    private function phoneKey(?string $phone): ?string
    {
        $digits = preg_replace('/\D/', '', (string) $phone);

        return strlen($digits) >= 7 ? substr($digits, -10) : null;
    }

    /** Strip the separators people type into phone numbers, portably across sqlite, MySQL and Postgres. */
    private function normalizedPhoneSql(string $column): string
    {
        $sql = $column;

        foreach ([' ', '-', '+', '(', ')', '.'] as $separator) {
            $sql = "REPLACE({$sql}, '{$separator}', '')";
        }

        return $sql;
    }
}

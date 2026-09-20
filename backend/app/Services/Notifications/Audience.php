<?php

namespace App\Services\Notifications;

use App\Models\AuctionPlayer;
use App\Models\Organization;
use App\Models\Player;
use App\Models\Team;
use App\Models\User;

/**
 * Who to contact for a given record.
 *
 * Every caller would otherwise work out for itself which of a team's four
 * contact columns to use, and they would not all agree. The numbers on these
 * records are contact details — nothing here is ever put in an API response.
 */
final class Audience
{
    /**
     * The manager of one team. The registering manager's details live on the
     * team row; a linked user account is preferred when there is one, since
     * that is the number they keep up to date.
     *
     * @return array<int, array{name: string, phone: ?string, whatsapp: ?string, role: string}>
     */
    public static function teamManager(?Team $team): array
    {
        if (! $team) {
            return [];
        }

        $user = $team->manager_user_id ? User::find($team->manager_user_id) : null;

        return [[
            'name' => $team->manager_name ?: ($user->name ?? $team->name),
            'phone' => $user->phone ?? $team->manager_phone,
            'whatsapp' => $team->manager_whatsapp ?: ($user->phone ?? $team->manager_phone),
            'role' => 'TEAM_MANAGER',
        ]];
    }

    /**
     * Every approved team's manager in a tournament — the fixture list going
     * out, or the tournament being called off.
     *
     * @return array<int, array{name: string, phone: ?string, whatsapp: ?string, role: string}>
     */
    public static function tournamentManagers(string $tournamentId, bool $approvedOnly = true): array
    {
        $query = Team::query()->where('tournament_id', $tournamentId);

        if ($approvedOnly) {
            $query->where('status', 'approved');
        }

        return $query->get()
            ->flatMap(fn (Team $team) => self::teamManager($team))
            ->all();
    }

    /**
     * The organizer's own admins — who hears about a registration coming in or
     * a plan about to lapse.
     *
     * @return array<int, array{name: string, phone: ?string, whatsapp: ?string, role: string}>
     */
    public static function organizers(string $organizationId): array
    {
        $admins = User::query()
            ->where('organization_id', $organizationId)
            ->where('role', 'ORG_ADMIN')
            ->get()
            ->map(fn (User $user) => [
                'name' => $user->name,
                'phone' => $user->phone,
                'whatsapp' => $user->phone,
                'role' => 'ORG_ADMIN',
            ])
            ->all();

        if ($admins) {
            return $admins;
        }

        // A club with no admin user still has its own contact number on the
        // organization, which is what the registration form collected.
        $organization = Organization::find($organizationId);

        if (! $organization) {
            return [];
        }

        return [[
            'name' => $organization->contact_person ?: $organization->name,
            'phone' => $organization->phone,
            'whatsapp' => $organization->whatsapp ?: $organization->phone,
            'role' => 'ORG_ADMIN',
        ]];
    }

    /**
     * A player, from either the squad record or the auction entry — the two
     * hold the same person's number in different columns.
     *
     * @return array<int, array{name: string, phone: ?string, whatsapp: ?string, role: string}>
     */
    public static function player(Player|AuctionPlayer|null $player): array
    {
        if (! $player) {
            return [];
        }

        return [[
            // Both records call it `full_name`, and both keep the number in
            // `mobile` — the auction entry is a copy of the squad record.
            'name' => (string) $player->full_name,
            'phone' => $player->mobile,
            'whatsapp' => $player->mobile,
            'role' => 'PLAYER',
        ]];
    }
}

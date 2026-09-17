<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

abstract class Controller
{
    /** Contact details that never go out on a public (anonymous) read. */
    protected const TEAM_CONTACT_FIELDS = ['manager_phone', 'manager_whatsapp', 'manager_email', 'manager_address'];

    protected const PLAYER_CONTACT_FIELDS = ['mobile', 'dob'];

    /**
     * Whether the caller runs this organization — they see phone numbers and
     * addresses; everyone else (the public hub, a stadium screen) does not.
     */
    protected function isOrganizationStaff(Request $request, ?string $organizationId): bool
    {
        $user = $request->user();

        return $user !== null && (
            $user->role === 'SUPER_ADMIN'
            || (in_array($user->role, ['ORG_ADMIN', 'SCORER'], true) && $user->organization_id === $organizationId)
        );
    }

    /**
     * @template T of \Illuminate\Database\Eloquent\Model|\Illuminate\Support\Collection|null
     *
     * @param  T  $teams
     * @return T
     */
    protected function withoutTeamContacts($teams)
    {
        $teams?->makeHidden(self::TEAM_CONTACT_FIELDS);

        return $teams;
    }

    /**
     * @template T of \Illuminate\Database\Eloquent\Model|\Illuminate\Support\Collection|null
     *
     * @param  T  $players
     * @return T
     */
    protected function withoutPlayerContacts($players)
    {
        $players?->makeHidden(self::PLAYER_CONTACT_FIELDS);

        return $players;
    }

    /**
     * Guard a record that carries its own organization, for routes where the
     * owning organization can only be known after the record is loaded.
     *
     * Returns the 403 response to send back, or null when access is allowed.
     * Routes whose organization is derivable from the URL should use the
     * `tenant` middleware instead.
     */
    protected function denyForeignTenant(Request $request, ?string $organizationId): ?JsonResponse
    {
        $user = $request->user();

        if (! $user) {
            return response()->json(['error' => 'Authentication required'], 401);
        }

        if ($user->role !== 'SUPER_ADMIN' && $organizationId !== $user->organization_id) {
            return response()->json(['error' => 'You do not have access to this organization.'], 403);
        }

        return null;
    }
}

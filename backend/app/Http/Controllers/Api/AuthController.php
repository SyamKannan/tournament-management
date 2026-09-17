<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Models\PlatformSetting;
use App\Models\Player;
use App\Models\User;
use App\Services\TokenService;
use App\Support\Audit;
use App\Support\Ids;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

class AuthController extends Controller
{
    public function __construct(
        private readonly TokenService $tokens,
    ) {}

    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'email' => ['required', 'string'],
            'password' => ['required', 'string'],
        ], [
            'email.required' => 'Email and password are required',
            'password.required' => 'Email and password are required',
        ]);

        $user = User::query()->whereRaw('LOWER(email) = ?', [mb_strtolower($credentials['email'])])->first();

        if (! $user || ! $this->passwordMatches($user, $credentials['password'])) {
            return response()->json(['error' => 'Invalid email or password'], 401);
        }

        // Said at the door rather than on the first action they try.
        if ($user->role !== 'SUPER_ADMIN' && $user->organization_id) {
            $status = Organization::query()->whereKey($user->organization_id)->value('status');

            if (in_array($status, ['suspended', 'cancelled'], true)) {
                return response()->json([
                    'error' => 'This organization is suspended. Please contact platform support.',
                ], 403);
            }
        }

        return response()->json($this->identityPayload($user));
    }

    /**
     * Role switcher used for guided walkthroughs: hands back a real token for a
     * representative user in the requested role.
     */
    public function switchDemoRole(Request $request): JsonResponse
    {
        $role = (string) $request->input('role');
        $organizationId = $request->input('organizationId');

        if (! in_array($role, ['SUPER_ADMIN', 'ORG_ADMIN', 'SCORER', 'TEAM_MANAGER'], true)) {
            return response()->json(['token' => null, 'user' => null, 'organization' => null]);
        }

        $user = null;

        if ($role === 'ORG_ADMIN' && $organizationId) {
            $user = User::query()->where('role', $role)->where('organization_id', $organizationId)->first();
        }

        $user ??= User::query()->where('role', $role)->first();

        if (! $user) {
            return response()->json(['error' => 'Demo user not found for role '.$role], 404);
        }

        return response()->json($this->identityPayload($user));
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user();

        if (! $user) {
            return response()->json(['error' => 'Not authenticated'], 401);
        }

        return response()->json([
            'user' => $user->toAuthPayload(),
            'organization' => $user->organization_id ? Organization::find($user->organization_id) : null,
        ]);
    }

    /**
     * Public organizer signup: creates the organization and its first admin,
     * free of charge and with no subscription. The organization picks (and
     * pays for) a plan later, at the point it tries to host a tournament —
     * see BillingService::checkLimit(), enforced in TournamentController::store().
     */
    public function registerOrganization(Request $request): JsonResponse
    {
        $data = $request->validate([
            'organizationName' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255'],
            'contactPerson' => ['required', 'string', 'max:255'],
            'organizationType' => ['nullable', 'string', 'max:255'],
            'logo' => ['nullable', 'string'],
            'phone' => ['nullable', 'string', 'max:64'],
            'whatsapp' => ['nullable', 'string', 'max:64'],
            'address' => ['nullable', 'string'],
            'village' => ['nullable', 'string', 'max:255'],
            'panchayat' => ['nullable', 'string', 'max:255'],
            'district' => ['nullable', 'string', 'max:255'],
            'state' => ['nullable', 'string', 'max:255'],
            'country' => ['nullable', 'string', 'max:255'],
            'password' => ['required', 'string', 'min:6'],
        ], [], [
            'organizationName' => 'organization name',
            'contactPerson' => 'contact person',
        ]);

        // Sign-in matches on a lowercased email, so the check here has to as
        // well — otherwise "A@x.com" and "a@x.com" become two accounts and only
        // one of them can ever sign in.
        if ($this->emailTaken($data['email'])) {
            return response()->json(['error' => 'An account with this email address already exists. Please sign in.'], 422);
        }

        $settings = PlatformSetting::current();

        [$organization, $user] = DB::transaction(function () use ($data, $settings) {
            $organizationId = Ids::timestamped('org');
            $phone = $data['phone'] ?? '';

            $organization = Organization::create([
                'id' => $organizationId,
                'name' => $data['organizationName'],
                'slug' => Ids::slug($data['organizationName']).'-'.Ids::token(3),
                'logo' => $data['logo'] ?? 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=150&auto=format&fit=crop&q=80',
                'banner' => 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=1200&auto=format&fit=crop&q=80',
                'type' => $data['organizationType'] ?? 'Sports Club',
                'description' => 'Registered organization: '.$data['organizationName'],
                'contact_person' => $data['contactPerson'],
                'phone' => $phone,
                'whatsapp' => $data['whatsapp'] ?? $phone,
                'email' => $data['email'],
                'address' => $data['address'] ?? '',
                'village' => $data['village'] ?? '',
                'panchayat' => $data['panchayat'] ?? '',
                'municipality' => '',
                'district' => $data['district'] ?? '',
                'state' => $data['state'] ?? '',
                'country' => $data['country'] ?? 'India',
                'website' => '',
                'social_media' => [],
                'status' => $settings->require_admin_approval_for_orgs ? 'pending' : 'active',
            ]);

            $user = User::create([
                'id' => Ids::timestamped('user'),
                'name' => $data['contactPerson'],
                'email' => $data['email'],
                'password_hash' => Hash::make($data['password']),
                'phone' => $phone,
                'role' => 'ORG_ADMIN',
                'organization_id' => $organizationId,
                'avatar' => 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
            ]);

            Audit::log([
                'organization_id' => $organizationId,
                'user_id' => $user->id,
                'user_name' => $data['contactPerson'],
                'user_role' => 'ORG_ADMIN',
                'action' => 'ORGANIZATION_SELF_SIGNUP',
                'entity_type' => 'Organization',
                'entity_id' => $organizationId,
                'details' => sprintf('Organization [%s] signed up (no plan yet — will choose one when hosting a tournament)', $data['organizationName']),
            ]);

            return [$organization->fresh(), $user];
        });

        return response()->json([
            'token' => $this->tokens->issue($user),
            'user' => $user->toAuthPayload(),
            'organization' => $organization,
            'message' => 'Organization created successfully',
        ], 201);
    }

    /**
     * Public athlete signup: creates the player account and linked player profile.
     */
    public function registerPlayer(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255'],
            'password' => ['required', 'string', 'min:6'],
            'phone' => ['required', 'string', 'max:64'],
            'sport' => ['nullable', 'string', 'max:64'],
            'role_or_position' => ['nullable', 'string', 'max:64'],
            'batting_style' => ['nullable', 'string', 'max:64'],
            'bowling_style' => ['nullable', 'string', 'max:64'],
            'district' => ['nullable', 'string', 'max:128'],
            'state' => ['nullable', 'string', 'max:128'],
            'age' => ['nullable', 'integer', 'min:5', 'max:100'],
            'dob' => ['nullable', 'string', 'max:32'],
            'jersey_number' => ['nullable', 'integer', 'min:0', 'max:999'],
            'avatar' => ['nullable', 'string'],
        ]);

        if ($this->emailTaken($data['email'])) {
            return response()->json(['error' => 'An account with this email address already exists. Please sign in.'], 422);
        }

        [$user, $player] = DB::transaction(function () use ($data) {
            $userId = Ids::timestamped('usr');
            $sport = strtolower($data['sport'] ?? 'cricket');
            $avatar = $data['avatar'] ?? 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80';

            $user = User::create([
                'id' => $userId,
                'name' => $data['name'],
                'email' => $data['email'],
                'password_hash' => Hash::make($data['password']),
                'role' => 'PLAYER',
                'phone' => $data['phone'],
                'avatar' => $avatar,
            ]);

            $player = Player::create([
                'id' => $userId,
                'team_id' => '',
                'tournament_id' => '',
                'organization_id' => '',
                'full_name' => $data['name'],
                'photo' => $avatar,
                'age' => $data['age'] ?? 22,
                'dob' => $data['dob'] ?? null,
                'mobile' => $data['phone'],
                'jersey_number' => $data['jersey_number'] ?? 10,
                'is_captain' => false,
                'is_wicketkeeper' => ($sport === 'cricket' && ($data['role_or_position'] ?? '') === 'Wicket Keeper'),
                'football_position' => $sport === 'football' ? ($data['role_or_position'] ?? 'Striker') : null,
                'cricket_role' => $sport === 'cricket' ? ($data['role_or_position'] ?? 'All-Rounder') : null,
                'cricket_batting_style' => $data['batting_style'] ?? 'Right Handed',
                'cricket_bowling_style' => $data['bowling_style'] ?? 'Right Arm Fast Medium',
            ]);

            Audit::log([
                'organization_id' => '',
                'user_id' => $user->id,
                'user_name' => $user->name,
                'user_role' => 'PLAYER',
                'action' => 'PLAYER_SELF_SIGNUP',
                'entity_type' => 'Player',
                'entity_id' => $player->id,
                'details' => sprintf('Athlete [%s] registered on site (%s)', $user->name, $sport),
            ]);

            return [$user, $player];
        });

        return response()->json([
            'token' => $this->tokens->issue($user),
            'user' => $user->toAuthPayload(),
            'player' => $player,
            'message' => 'Athlete profile registered successfully!',
        ], 201);
    }

    /**
     * Self-service account update, available to every authenticated role
     * (super admin, org admin, scorer, team manager, player). Organization
     * fields (name, logo, address, ...) are edited separately via
     * OrganizationController::update() — this only touches the caller's own
     * identity: name, email, phone, avatar and password.
     */
    public function updateProfile(Request $request): JsonResponse
    {
        $user = $request->user();

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'phone' => ['sometimes', 'string', 'max:64'],
            'avatar' => ['sometimes', 'nullable', 'string'],
            'email' => [
                'sometimes', 'email', 'max:255',
                Rule::unique('users', 'email')->ignore($user->id),
            ],
            'current_password' => ['required_with:new_password', 'string'],
            'new_password' => ['sometimes', 'string', 'min:6'],
        ]);

        if (isset($data['new_password'])) {
            if (! $this->passwordMatches($user, $data['current_password'])) {
                return response()->json(['error' => 'Current password is incorrect'], 422);
            }
            $user->password_hash = Hash::make($data['new_password']);
        }

        foreach (['name', 'phone', 'avatar', 'email'] as $field) {
            if (isset($data[$field])) {
                $user->{$field} = $data[$field];
            }
        }

        $user->save();

        // Player identity fields (name/phone/avatar) mirror onto the linked
        // player record so the two never drift apart — same rule
        // PlayerController::updateProfile() follows.
        $player = Player::query()->where('id', $user->id)->first();
        if ($player) {
            $playerUpdates = [];
            if (isset($data['name'])) $playerUpdates['full_name'] = $data['name'];
            if (isset($data['avatar'])) $playerUpdates['photo'] = $data['avatar'];
            if (isset($data['phone'])) $playerUpdates['mobile'] = $data['phone'];
            if ($playerUpdates) {
                $player->update($playerUpdates);
            }
        }

        Audit::log([
            'organization_id' => $user->organization_id ?? '',
            'user_id' => $user->id,
            'user_name' => $user->name,
            'user_role' => $user->role,
            'action' => 'UPDATED_OWN_PROFILE',
            'entity_type' => 'User',
            'entity_id' => $user->id,
            'details' => sprintf('%s updated their account profile', $user->name),
        ]);

        return response()->json([
            'user' => $user->fresh()->toAuthPayload(),
            'organization' => $user->organization_id ? Organization::find($user->organization_id) : null,
        ]);
    }

    private function identityPayload(User $user): array
    {
        return [
            'token' => $this->tokens->issue($user),
            'user' => $user->toAuthPayload(),
            'organization' => $user->organization_id ? Organization::find($user->organization_id) : null,
        ];
    }

    private function emailTaken(string $email): bool
    {
        return User::query()->whereRaw('LOWER(email) = ?', [mb_strtolower($email)])->exists();
    }

    private function passwordMatches(User $user, string $password): bool
    {
        return Hash::check($password, (string) $user->password_hash);
    }
}

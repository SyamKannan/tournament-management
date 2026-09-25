<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Models\PlatformSetting;
use App\Models\Player;
use App\Models\User;
use App\Services\BillingService;
use App\Services\LegalService;
use App\Services\PasswordResetService;
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
        private readonly BillingService $billing,
        private readonly LegalService $legal,
    ) {}

    public const TERMS_MESSAGES = [
        'accept_terms.accepted' => 'Please agree to the Terms & Conditions and Privacy Policy to create your account.',
        'accept_terms.required' => 'Please agree to the Terms & Conditions and Privacy Policy to create your account.',
    ];

    /**
     * Signups must tick "I agree" once there are terms to agree to. Before any
     * are published there is nothing to link to, so the box isn't asked for.
     */
    private function termsRule(): array
    {
        return $this->legal->hasDocuments() ? ['accept_terms' => ['required', 'accepted']] : [];
    }

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
     * Ask for a one-time code to reset a password.
     *
     * Answers the same way whether or not the number belongs to an account. A
     * truthful "no such user" would turn this into a way of finding out who is
     * registered, and on a platform where the username is a mobile number that
     * is a list worth stealing.
     */
    public function requestPasswordReset(Request $request, PasswordResetService $resets): JsonResponse
    {
        $data = $request->validate([
            // A phone number or an email — whichever they remember.
            'identifier' => ['required', 'string', 'max:255'],
        ]);

        $resets->request($data['identifier']);

        return response()->json([
            'message' => 'If that phone number or email belongs to an account, a code is on its way by SMS.',
        ]);
    }

    /**
     * Set a new password using the code.
     *
     * A successful reset ends every session the account had open — the point of
     * resetting is usually that someone else has the old password.
     */
    public function resetPassword(Request $request, PasswordResetService $resets): JsonResponse
    {
        $data = $request->validate([
            'identifier' => ['required', 'string', 'max:255'],
            'code' => ['required', 'string', 'max:12'],
            'password' => ['required', 'string', 'min:6'],
        ]);

        ['user' => $user, 'error' => $error] = $resets->complete(
            $data['identifier'],
            $data['code'],
            $data['password'],
        );

        if (! $user) {
            return response()->json(['error' => $error], 422);
        }

        $this->tokens->revokeAllFor($user);

        Audit::log([
            'organization_id' => $user->organization_id ?? '',
            'user_id' => $user->id,
            'user_name' => $user->name,
            'user_role' => $user->role,
            'action' => 'RESET_PASSWORD',
            'entity_type' => 'User',
            'entity_id' => $user->id,
            'details' => sprintf('%s reset their password with a one-time code', $user->name),
            'ip_address' => $request->ip(),
        ]);

        // Signed in straight away — the token is issued after the revocation, so
        // it carries the new version and survives it.
        return response()->json($this->identityPayload($user));
    }

    /**
     * End this session: the bearer token used to make the call stops working.
     *
     * Dropping the token from localStorage was all signing out ever did, which
     * left it good for the rest of its seven days if anyone else had a copy.
     * Other sessions — the organizer's phone, the scorer's tablet — are left
     * alone; `logoutEverywhere()` is the one that ends those.
     *
     * Ending an impersonation comes through here too: the client calls it
     * while still holding the impersonation token, so that token dies and the
     * super admin's own, kept aside in the browser, is untouched.
     */
    public function logout(Request $request): JsonResponse
    {
        if ($token = $request->bearerToken()) {
            $this->tokens->revoke($token);
        }

        return response()->json(['message' => 'Signed out']);
    }

    /**
     * End every session this account has open, on any device.
     *
     * The token making the call goes with them, so the client signs out and
     * asks for the password again — which is the point when a device has been
     * lost or a password is thought to be known.
     */
    public function logoutEverywhere(Request $request): JsonResponse
    {
        $this->tokens->revokeAllFor($request->user());

        return response()->json(['message' => 'Signed out of every device']);
    }

    /**
     * Public organizer signup: creates the organization and its first admin,
     * already on the Free plan, so the club can host its first tournament
     * without buying anything. A paid plan is only needed to host more — see
     * BillingService::checkLimit(), enforced in TournamentController::store().
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
            ...$this->termsRule(),
        ], self::TERMS_MESSAGES, [
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

        [$organization, $user] = DB::transaction(function () use ($data, $settings, $request) {
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

            $this->billing->startFreePlan($organizationId);
            $this->legal->accept($user, $request, 'signup');

            Audit::log([
                'organization_id' => $organizationId,
                'user_id' => $user->id,
                'user_name' => $data['contactPerson'],
                'user_role' => 'ORG_ADMIN',
                'action' => 'ORGANIZATION_SELF_SIGNUP',
                'entity_type' => 'Organization',
                'entity_id' => $organizationId,
                'details' => sprintf('Organization [%s] signed up on the Free plan', $data['organizationName']),
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
            ...$this->termsRule(),
        ], self::TERMS_MESSAGES);

        if ($this->emailTaken($data['email'])) {
            return response()->json(['error' => 'An account with this email address already exists. Please sign in.'], 422);
        }

        [$user, $player] = DB::transaction(function () use ($data, $request) {
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

            $this->legal->accept($user, $request, 'signup');

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

        $passwordChanged = isset($data['new_password']);

        if ($passwordChanged) {
            if (! $this->passwordMatches($user, $data['current_password'])) {
                return response()->json(['error' => 'Current password is incorrect'], 422);
            }
            $user->password_hash = Hash::make($data['new_password']);
            // Their own choice now, so the "set by someone else" flag goes.
            $user->must_change_password = false;

            // Changing a password has to end the sessions opened with the old
            // one — otherwise whoever the change was meant to shut out keeps
            // their token for the rest of its week. The caller gets a fresh
            // token below so the tab they did it in stays signed in.
            $this->tokens->revokeAllFor($user);
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

        $payload = [
            'user' => $user->fresh()->toAuthPayload(),
            'organization' => $user->organization_id ? Organization::find($user->organization_id) : null,
        ];

        // Only when the password changed: the token that made this request was
        // just revoked along with every other, so the client needs a
        // replacement or it would sign itself out mid-edit.
        if ($passwordChanged) {
            $payload['token'] = $this->tokens->issue($user, $request->user()->impersonatorId);
        }

        return response()->json($payload);
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

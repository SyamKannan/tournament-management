<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Models\PlatformSetting;
use App\Models\User;
use App\Services\BillingService;
use App\Services\TokenService;
use App\Support\Audit;
use App\Support\Ids;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    public function __construct(
        private readonly TokenService $tokens,
        private readonly BillingService $billing,
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
     * Public organizer signup: creates the organization, its first admin, and
     * activates the chosen plan in one step.
     */
    public function registerOrganization(Request $request): JsonResponse
    {
        $data = $request->validate([
            'organizationName' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255'],
            'contactPerson' => ['required', 'string', 'max:255'],
            'planId' => ['required', 'string'],
            'organizationType' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:64'],
            'whatsapp' => ['nullable', 'string', 'max:64'],
            'address' => ['nullable', 'string'],
            'village' => ['nullable', 'string', 'max:255'],
            'panchayat' => ['nullable', 'string', 'max:255'],
            'district' => ['nullable', 'string', 'max:255'],
            'state' => ['nullable', 'string', 'max:255'],
            'password' => ['nullable', 'string', 'min:6'],
            'paymentMethod' => ['nullable', 'string', 'max:32'],
        ], [], [
            'organizationName' => 'organization name',
            'contactPerson' => 'contact person',
            'planId' => 'plan',
        ]);

        $settings = PlatformSetting::current();

        [$organization, $user] = DB::transaction(function () use ($data, $settings) {
            $organizationId = Ids::timestamped('org');
            $phone = $data['phone'] ?? '';

            $organization = Organization::create([
                'id' => $organizationId,
                'name' => $data['organizationName'],
                'slug' => Ids::slug($data['organizationName']).'-'.Ids::token(3),
                'logo' => 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=150&auto=format&fit=crop&q=80',
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
                'state' => $data['state'] ?? 'Kerala',
                'country' => 'India',
                'website' => '',
                'social_media' => [],
                'status' => $settings->require_admin_approval_for_orgs ? 'pending' : 'active',
            ]);

            $user = User::create([
                'id' => Ids::timestamped('user'),
                'name' => $data['contactPerson'],
                'email' => $data['email'],
                'password_hash' => Hash::make($data['password'] ?? 'default123'),
                'phone' => $phone,
                'role' => 'ORG_ADMIN',
                'organization_id' => $organizationId,
                'avatar' => 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
            ]);

            $this->billing->subscribePlan($organizationId, $data['planId'], $data['paymentMethod'] ?? 'upi');

            Audit::log([
                'organization_id' => $organizationId,
                'user_id' => $user->id,
                'user_name' => $data['contactPerson'],
                'user_role' => 'ORG_ADMIN',
                'action' => 'ORGANIZATION_SELF_SIGNUP',
                'entity_type' => 'Organization',
                'entity_id' => $organizationId,
                'details' => sprintf('Organization [%s] signed up with plan [%s]', $data['organizationName'], $data['planId']),
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

    private function identityPayload(User $user): array
    {
        return [
            'token' => $this->tokens->issue($user),
            'user' => $user->toAuthPayload(),
            'organization' => $user->organization_id ? Organization::find($user->organization_id) : null,
        ];
    }

    private function passwordMatches(User $user, string $password): bool
    {
        return Hash::check($password, (string) $user->password_hash);
    }
}

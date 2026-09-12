<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Invoice;
use App\Models\Organization;
use App\Models\Plan;
use App\Models\PlatformSetting;
use App\Models\Sport;
use App\Models\Subscription;
use App\Models\Team;
use App\Models\Tournament;
use App\Models\User;
use App\Services\BillingService;
use App\Services\TokenService;
use App\Support\Audit;
use App\Support\Ids;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Super-admin console: platform metrics, SaaS plan catalogue, organization
 * onboarding and suspension, billing overview and the audit trail.
 *
 * Every route here is behind `role:SUPER_ADMIN`.
 */
class AdminController extends Controller
{
    public function __construct(
        private readonly BillingService $billing,
        private readonly TokenService $tokens,
    ) {}

    public function metrics(): JsonResponse
    {
        return response()->json($this->billing->platformMetrics());
    }

    /* ------------------------------------------------------------------ Plans */

    public function listPlans(): JsonResponse
    {
        return response()->json(Plan::query()->get());
    }

    public function storePlan(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'price' => ['required', 'numeric', 'min:0'],
            'billing_type' => ['required', 'string', 'in:recurring,one_time'],
            'description' => ['nullable', 'string'],
            'currency' => ['nullable', 'string', 'max:8'],
            'billing_interval' => ['nullable', 'string', 'in:monthly,quarterly,yearly,custom'],
            'trial_days' => ['nullable', 'integer', 'min:0'],
            'tournament_limit' => ['nullable', 'integer', 'min:0'],
            'team_limit' => ['nullable', 'integer', 'min:0'],
            'player_limit' => ['nullable', 'integer', 'min:0'],
            'storage_limit_mb' => ['nullable', 'integer', 'min:0'],
            'ad_limit' => ['nullable', 'integer', 'min:0'],
            'features' => ['nullable', 'array'],
            'features.*' => ['string'],
        ]);

        $plan = Plan::create([
            'id' => Ids::timestamped('plan'),
            'name' => $data['name'],
            'description' => $data['description'] ?? '',
            'price' => (float) $data['price'],
            'currency' => $data['currency'] ?? '₹',
            'billing_type' => $data['billing_type'],
            'billing_interval' => $data['billing_type'] === 'recurring'
                ? ($data['billing_interval'] ?? 'monthly')
                : null,
            'trial_days' => (int) ($data['trial_days'] ?? 0),
            'tournament_limit' => (int) ($data['tournament_limit'] ?? 1),
            'team_limit' => (int) ($data['team_limit'] ?? 16),
            'player_limit' => (int) ($data['player_limit'] ?? 250),
            'storage_limit_mb' => (int) ($data['storage_limit_mb'] ?? 1024),
            'ad_limit' => (int) ($data['ad_limit'] ?? 5),
            'features' => $data['features'] ?? [],
            'status' => 'active',
        ]);

        $this->audit($request, 'CREATED_PLAN', 'Plan', $plan->id,
            sprintf('Created plan [%s] with price %s%s', $plan->name, $plan->currency, $plan->price));

        return response()->json($plan, 201);
    }

    public function updatePlan(Request $request, string $id): JsonResponse
    {
        $plan = Plan::find($id);

        if (! $plan) {
            return response()->json(['error' => 'Plan not found'], 404);
        }

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string'],
            'price' => ['sometimes', 'numeric', 'min:0'],
            'currency' => ['sometimes', 'string', 'max:8'],
            'billing_type' => ['sometimes', 'string', 'in:recurring,one_time'],
            'billing_interval' => ['sometimes', 'nullable', 'string', 'in:monthly,quarterly,yearly,custom'],
            'trial_days' => ['sometimes', 'integer', 'min:0'],
            'tournament_limit' => ['sometimes', 'integer', 'min:0'],
            'team_limit' => ['sometimes', 'integer', 'min:0'],
            'player_limit' => ['sometimes', 'integer', 'min:0'],
            'storage_limit_mb' => ['sometimes', 'integer', 'min:0'],
            'ad_limit' => ['sometimes', 'integer', 'min:0'],
            'features' => ['sometimes', 'array'],
            'features.*' => ['string'],
            'status' => ['sometimes', 'string', 'in:active,inactive,archived'],
        ]);

        $plan->fill($data)->save();

        $this->audit($request, 'UPDATED_PLAN', 'Plan', $plan->id, sprintf('Updated plan [%s] settings', $plan->name));

        return response()->json($plan);
    }

    public function destroyPlan(Request $request, string $id): JsonResponse
    {
        $plan = Plan::find($id);

        if (! $plan) {
            return response()->json(['error' => 'Plan not found'], 404);
        }

        $plan->delete();

        $this->audit($request, 'DELETED_PLAN', 'Plan', $id, sprintf('Deleted plan [%s]', $plan->name));

        return response()->json(['message' => 'Plan deleted successfully']);
    }

    /* ----------------------------------------------------------------- Sports */

    public function listSports(): JsonResponse
    {
        return response()->json(Sport::query()->orderBy('name')->get());
    }

    public function updateSport(Request $request, string $id): JsonResponse
    {
        $sport = Sport::find($id);

        if (! $sport) {
            return response()->json(['error' => 'Sport not found'], 404);
        }

        $data = $request->validate([
            'is_active' => ['required', 'boolean'],
        ]);

        if (! $data['is_active']) {
            $otherActive = Sport::query()->where('is_active', true)->where('id', '!=', $id)->exists();
            if (! $otherActive) {
                return response()->json(['error' => 'At least one sport must stay enabled'], 422);
            }
        }

        $sport->fill($data)->save();

        $this->audit($request, $data['is_active'] ? 'ENABLED_SPORT' : 'DISABLED_SPORT', 'Sport', $sport->id,
            sprintf('%s sport [%s]', $data['is_active'] ? 'Enabled' : 'Disabled', $sport->name));

        return response()->json($sport);
    }

    /* ------------------------------------------------------------------ Users */

    public function listUsers(Request $request): JsonResponse
    {
        $role = $request->query('role');
        $search = $request->query('search');

        $query = User::with('organization')->orderBy('name');

        if ($role && $role !== 'ALL') {
            $query->where('role', $role);
        }

        if ($search) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%")
                  ->orWhere('phone', 'like', "%{$search}%");
            });
        }

        $users = $query->get();

        return response()->json($users->map(function (User $user) {
            return [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'phone' => $user->phone,
                'role' => $user->role,
                'avatar' => $user->avatar,
                'created_at' => $user->created_at,
                'organization' => $user->organization ? [
                    'id' => $user->organization->id,
                    'name' => $user->organization->name,
                    'slug' => $user->organization->slug,
                    'logo' => $user->organization->logo,
                    'type' => $user->organization->type,
                ] : null,
            ];
        }));
    }

    /* ----------------------------------------------------------- Organizations */

    public function listOrganizations(): JsonResponse
    {
        $organizations = Organization::query()->get();
        $subscriptions = Subscription::query()->get()->keyBy('organization_id');
        $plans = Plan::query()->get()->keyBy('id');

        $tournamentCounts = Tournament::query()
            ->selectRaw('organization_id, COUNT(*) as total')
            ->groupBy('organization_id')
            ->pluck('total', 'organization_id');

        $teamCounts = Team::query()
            ->selectRaw('organization_id, COUNT(*) as total')
            ->groupBy('organization_id')
            ->pluck('total', 'organization_id');

        $admins = User::query()
            ->where('role', 'ORG_ADMIN')
            ->get()
            ->keyBy('organization_id');

        return response()->json($organizations->map(function (Organization $organization) use ($subscriptions, $plans, $tournamentCounts, $teamCounts, $admins) {
            $subscription = $subscriptions->get($organization->id);
            $admin = $admins->get($organization->id);

            return [
                ...$organization->toArray(),
                'subscription' => $subscription,
                'plan' => $subscription ? $plans->get($subscription->plan_id) : null,
                'tournaments_count' => (int) ($tournamentCounts[$organization->id] ?? 0),
                'teams_count' => (int) ($teamCounts[$organization->id] ?? 0),
                'admin_user' => $admin ? [
                    'id' => $admin->id,
                    'name' => $admin->name,
                    'email' => $admin->email,
                    'phone' => $admin->phone,
                ] : null,
            ];
        }));
    }

    public function storeOrganization(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255'],
            'contact_person' => ['required', 'string', 'max:255'],
            'plan_id' => ['required', 'string'],
            'type' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:64'],
            'whatsapp' => ['nullable', 'string', 'max:64'],
            'address' => ['nullable', 'string'],
            'village' => ['nullable', 'string', 'max:255'],
            'panchayat' => ['nullable', 'string', 'max:255'],
            'district' => ['nullable', 'string', 'max:255'],
            'state' => ['nullable', 'string', 'max:255'],
            'admin_name' => ['nullable', 'string', 'max:255'],
            'admin_email' => ['nullable', 'email', 'max:255'],
            'admin_password' => ['nullable', 'string', 'min:6'],
        ]);

        $organization = DB::transaction(function () use ($data, $request) {
            $organizationId = Ids::timestamped('org');
            $phone = $data['phone'] ?? '';

            $organization = Organization::create([
                'id' => $organizationId,
                'name' => $data['name'],
                'slug' => Ids::slug($data['name']).'-'.Ids::token(3),
                'logo' => 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=150&auto=format&fit=crop&q=80',
                'banner' => 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=1200&auto=format&fit=crop&q=80',
                'type' => $data['type'] ?? 'Sports Club',
                'description' => 'Organization: '.$data['name'],
                'contact_person' => $data['contact_person'],
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
                'status' => 'active',
            ]);

            User::create([
                'id' => Ids::timestamped('user'),
                'name' => $data['admin_name'] ?? $data['contact_person'],
                'email' => $data['admin_email'] ?? $data['email'],
                'password_hash' => Hash::make($data['admin_password'] ?? 'admin123'),
                'phone' => $phone,
                'role' => 'ORG_ADMIN',
                'organization_id' => $organizationId,
                'avatar' => 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80',
            ]);

            $this->billing->subscribePlan($organizationId, $data['plan_id'], 'upi');

            $this->audit($request, 'SUPER_ADMIN_CREATED_ORGANIZATION', 'Organization', $organizationId,
                sprintf('Super Admin manually onboarded organization [%s] with plan [%s]', $data['name'], $data['plan_id']));

            return $organization->fresh();
        });

        return response()->json($organization, 201);
    }

    public function updateOrganizationStatus(Request $request, string $id): JsonResponse
    {
        $organization = Organization::find($id);

        if (! $organization) {
            return response()->json(['error' => 'Organization not found'], 404);
        }

        $data = $request->validate([
            'status' => ['required', 'string', 'in:pending,active,suspended,expired,cancelled'],
        ]);

        $organization->status = $data['status'];
        $organization->save();

        $this->audit($request, 'CHANGED_ORGANIZATION_STATUS', 'Organization', $organization->id,
            sprintf('Changed organization [%s] status to [%s]', $organization->name, $data['status']));

        return response()->json($organization);
    }

    /* ------------------------------------------------------- Billing & audit */

    public function listSubscriptions(): JsonResponse
    {
        $organizations = Organization::query()->get()->keyBy('id');
        $plans = Plan::query()->get()->keyBy('id');

        return response()->json(Subscription::query()->get()->map(function (Subscription $subscription) use ($organizations, $plans) {
            $plan = $plans->get($subscription->plan_id);

            return [
                ...$subscription->toArray(),
                'organization_name' => $organizations->get($subscription->organization_id)?->name,
                'plan_name' => $plan?->name,
                'plan_price' => $plan?->price,
            ];
        }));
    }

    public function listInvoices(): JsonResponse
    {
        return response()->json(Invoice::query()->get());
    }

    public function auditLogs(): JsonResponse
    {
        return response()->json(
            AuditLog::query()->orderByDesc('created_at')->orderByDesc('id')->get()
        );
    }

    /* ----------------------------------------------------- Platform settings */

    public function settings(): JsonResponse
    {
        return response()->json(PlatformSetting::current());
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $data = $request->validate([
            'platform_name' => ['sometimes', 'string', 'max:255'],
            'country' => ['sometimes', 'string', 'max:100'],
            'support_email' => ['sometimes', 'email', 'max:255'],
            'support_phone' => ['sometimes', 'string', 'max:64'],
            'currency_symbol' => ['sometimes', 'string', 'max:8'],
            'currency_code' => ['sometimes', 'string', 'max:8'],
            'enable_public_signup' => ['sometimes', 'boolean'],
            'require_admin_approval_for_orgs' => ['sometimes', 'boolean'],
            'default_trial_days' => ['sometimes', 'integer', 'min:0'],
            'grace_period_days' => ['sometimes', 'integer', 'min:0'],
            'payment_gateway_mode' => ['sometimes', 'string', 'in:sandbox,live'],
            'enabled_payment_methods' => ['sometimes', 'array', 'min:1'],
            'enabled_payment_methods.*' => ['string', 'in:upi,pay_at_ground'],
        ]);

        $settings = PlatformSetting::current();
        $settings->fill($data)->save();

        $this->audit($request, 'UPDATED_PLATFORM_SETTINGS', 'PlatformSetting', (string) $settings->id,
            'Updated platform settings');

        return response()->json($settings);
    }

    /* --------------------------------------------------------- Impersonation */

    public function impersonate(Request $request): JsonResponse
    {
        $userId = $request->input('user_id');
        $organizationId = $request->input('organization_id');

        if (! $userId && ! $organizationId) {
            return response()->json(['error' => 'user_id or organization_id is required'], 422);
        }

        $targetUser = null;

        if ($userId) {
            $targetUser = User::find($userId);
        } elseif ($organizationId) {
            $targetUser = User::where('organization_id', $organizationId)
                ->where('role', 'ORG_ADMIN')
                ->first();

            // Fallback to any user in the organization if no ORG_ADMIN
            $targetUser ??= User::where('organization_id', $organizationId)->first();
        }

        if (! $targetUser) {
            return response()->json(['error' => 'Target user or club admin not found'], 404);
        }

        $token = $this->tokens->issue($targetUser);
        $organization = $targetUser->organization_id ? Organization::find($targetUser->organization_id) : null;

        $this->audit(
            $request,
            'IMPERSONATE_USER',
            'user',
            $targetUser->id,
            "Super Admin impersonated user {$targetUser->name} ({$targetUser->email}, role: {$targetUser->role})"
        );

        return response()->json([
            'token' => $token,
            'user' => $targetUser->toAuthPayload(),
            'organization' => $organization,
        ]);
    }

    public function impersonationTargets(): JsonResponse
    {
        $organizations = Organization::query()->orderBy('name')->get();
        $orgAdmins = User::query()
            ->where('role', 'ORG_ADMIN')
            ->get()
            ->keyBy('organization_id');

        $orgTargets = $organizations->map(function (Organization $org) use ($orgAdmins) {
            $admin = $orgAdmins->get($org->id);
            return [
                'id' => $org->id,
                'name' => $org->name,
                'slug' => $org->slug,
                'logo' => $org->logo,
                'type' => $org->type,
                'district' => $org->district,
                'admin_user' => $admin ? [
                    'id' => $admin->id,
                    'name' => $admin->name,
                    'email' => $admin->email,
                    'role' => $admin->role,
                ] : null,
            ];
        });

        $players = User::query()
            ->where('role', 'PLAYER')
            ->orderBy('name')
            ->limit(50)
            ->get(['id', 'name', 'email', 'phone', 'role', 'avatar', 'organization_id']);

        $teamManagers = User::query()
            ->where('role', 'TEAM_MANAGER')
            ->orderBy('name')
            ->limit(50)
            ->get(['id', 'name', 'email', 'phone', 'role', 'avatar', 'organization_id']);

        return response()->json([
            'organizations' => $orgTargets,
            'players' => $players,
            'team_managers' => $teamManagers,
        ]);
    }

    private function audit(Request $request, string $action, string $entityType, string $entityId, string $details): void
    {
        $user = $request->user();

        Audit::log([
            'user_id' => $user->id,
            'user_name' => $user->name,
            'user_role' => $user->role,
            'action' => $action,
            'entity_type' => $entityType,
            'entity_id' => $entityId,
            'details' => $details,
            'ip_address' => $request->ip(),
        ]);
    }
}

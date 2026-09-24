<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Invoice;
use App\Models\Organization;
use App\Models\Plan;
use App\Models\Sponsor;
use App\Models\Team;
use App\Models\User;
use App\Models\Tournament;
use App\Services\BillingService;
use App\Services\PaymentGatewayService;
use App\Services\TemporaryPasswordService;
use App\Support\Audit;
use App\Support\Ids;
use App\Support\Paginate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OrganizationController extends Controller
{
    public function __construct(
        private readonly BillingService $billing,
        private readonly PaymentGatewayService $gateway,
    ) {}

    /**
     * Public club page: profile, what they are running now, what they have run
     * before, and who sponsors them. No authentication.
     */
    public function publicProfile(string $slug): JsonResponse
    {
        $organization = Organization::query()->where('slug', $slug)->where('status', 'active')->first();

        if (! $organization) {
            return response()->json(['error' => 'Organization not found or inactive'], 404);
        }

        return response()->json([
            'organization' => $organization,
            'active_tournaments' => Tournament::query()
                ->where('organization_id', $organization->id)
                ->whereNotIn('status', ['cancelled', 'draft'])
                ->get(),
            'past_tournaments' => Tournament::query()
                ->where('organization_id', $organization->id)
                ->where('status', 'completed')
                ->get(),
            'sponsors' => Sponsor::query()->where('organization_id', $organization->id)->get(),
        ]);
    }

    public function show(string $id): JsonResponse
    {
        $organization = Organization::find($id);

        if (! $organization) {
            return response()->json(['error' => 'Organization not found'], 404);
        }

        return response()->json($organization);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $organization = Organization::find($id);

        if (! $organization) {
            return response()->json(['error' => 'Organization not found'], 404);
        }

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'logo' => ['sometimes', 'string'],
            'banner' => ['sometimes', 'string'],
            'type' => ['sometimes', 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string'],
            'contact_person' => ['sometimes', 'string', 'max:255'],
            'phone' => ['sometimes', 'string', 'max:64'],
            'whatsapp' => ['sometimes', 'string', 'max:64'],
            'email' => ['sometimes', 'email', 'max:255'],
            'address' => ['sometimes', 'nullable', 'string'],
            'village' => ['sometimes', 'nullable', 'string', 'max:255'],
            'panchayat' => ['sometimes', 'nullable', 'string', 'max:255'],
            'municipality' => ['sometimes', 'nullable', 'string', 'max:255'],
            'district' => ['sometimes', 'nullable', 'string', 'max:255'],
            'state' => ['sometimes', 'nullable', 'string', 'max:255'],
            'country' => ['sometimes', 'nullable', 'string', 'max:255'],
            'website' => ['sometimes', 'nullable', 'string'],
            'social_media' => ['sometimes', 'array'],
        ]);

        $organization->fill($data)->save();

        $user = $request->user();
        Audit::log([
            'organization_id' => $organization->id,
            'user_id' => $user->id,
            'user_name' => $user->name,
            'user_role' => $user->role,
            'action' => 'UPDATED_ORGANIZATION_PROFILE',
            'entity_type' => 'Organization',
            'entity_id' => $organization->id,
            'details' => sprintf('Updated organization details for [%s]', $organization->name),
            'ip_address' => $request->ip(),
        ]);

        return response()->json($organization);
    }

    /**
     * Plan usage against limits, plus the organization's billing history.
     */
    public function usage(string $id): JsonResponse
    {
        return response()->json([
            ...$this->billing->usage($id),
            'invoices' => Invoice::query()->where('organization_id', $id)->get(),
        ]);
    }

    /**
     * Start checkout for a paid plan on the subscription flow's gateway
     * (demo or Razorpay, chosen by the super admin). Returns configured:false
     * only for free plans, which activate without a payment.
     */
    public function subscribeOrder(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'plan_id' => ['required', 'string'],
            'method' => ['nullable', 'string'],
        ], [
            'plan_id.required' => 'Plan ID is required',
        ]);

        $plan = Plan::find($data['plan_id']);

        if (! $plan) {
            return response()->json(['error' => 'Plan not found'], 404);
        }

        if ((float) $plan->price <= 0) {
            return response()->json(['configured' => false]);
        }

        try {
            $order = $this->gateway->createOrder(
                'subscription',
                (float) $plan->price,
                $plan->currency ?: 'INR',
                'sub-'.$id.'-'.Ids::token(6),
                ['organization_id' => $id, 'plan_id' => $plan->id, 'purpose' => 'subscription'],
                null,
                $data['method'] ?? null,
            );
        } catch (\RuntimeException $e) {
            report($e);

            return response()->json(['error' => str_starts_with($e->getMessage(), 'Unable to create')
                ? 'Unable to start payment. Please try again.'
                : $e->getMessage()], 503);
        }

        return response()->json($order);
    }

    public function subscribe(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'plan_id' => ['required', 'string'],
            'payment_method' => ['nullable', 'string', 'in:upi,card,netbanking,bank_transfer'],
            'razorpay_payment_id' => ['nullable', 'string', 'max:255'],
            'razorpay_order_id' => ['nullable', 'string', 'max:255'],
            'razorpay_signature' => ['nullable', 'string', 'max:512'],
        ], [
            'plan_id.required' => 'Plan ID is required',
        ]);

        $plan = Plan::find($data['plan_id']);
        $verifiedTransactionReference = null;

        // A paid plan always needs a verified checkout result from the
        // subscription flow's gateway — never a self-reported payment.
        if ($plan && (float) $plan->price > 0) {
            if (empty($data['razorpay_payment_id']) || empty($data['razorpay_order_id']) || empty($data['razorpay_signature'])) {
                return response()->json(['error' => 'Payment verification is required to activate this plan.'], 400);
            }

            // Checked against the plan's price, so a cheap plan's checkout
            // can't be used to switch on an expensive one.
            if (! $this->gateway->verify('subscription', $data['razorpay_order_id'], $data['razorpay_payment_id'], $data['razorpay_signature'], (float) $plan->price)) {
                return response()->json(['error' => 'Payment verification failed. Please try again.'], 400);
            }

            // One payment buys one period. A signed result stays valid forever,
            // so without this it could be sent again next month to renew free.
            if (Invoice::query()->where('transaction_reference', $data['razorpay_payment_id'])->exists()) {
                return response()->json(['error' => 'This payment has already been used to activate a plan. Refresh the page to see your current plan.'], 409);
            }

            $verifiedTransactionReference = $data['razorpay_payment_id'];
        }

        try {
            return response()->json(
                $this->billing->subscribePlan($id, $data['plan_id'], $data['payment_method'] ?? 'upi', $verifiedTransactionReference)
            );
        } catch (\RuntimeException $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }
    }

    /* ------------------------------------------------------------- Members */

    /**
     * The accounts that work for this club: its own staff (scorers, other
     * admins) and the managers of teams entered in its tournaments. The
     * organizer is who a manager phones when they cannot sign in, so this
     * is the list they help from.
     */
    public function members(Request $request, string $id): JsonResponse
    {
        $query = $this->memberQuery($id)->orderBy('name')->orderBy('id');

        if ($role = $request->query('role')) {
            $query->where('role', $role);
        }

        Paginate::search($query, $request->query('search'), ['name', 'email', 'phone']);

        return response()->json(Paginate::query($query, $request, fn (User $u) => [
            'id' => $u->id,
            'name' => $u->name,
            'email' => $u->email,
            'phone' => $u->phone,
            'role' => $u->role,
            'avatar' => $u->avatar,
            'must_change_password' => (bool) $u->must_change_password,
        ]));
    }

    /**
     * Issue a temporary password to one of this club's members.
     *
     * Limited to people below the organizer: another organizer of the same
     * club, or a super admin, is not theirs to reset — that would let one
     * admin lock another out.
     */
    public function resetMemberPassword(Request $request, string $id, string $userId, TemporaryPasswordService $passwords): JsonResponse
    {
        $member = $this->memberQuery($id)->whereKey($userId)->first();

        if (! $member) {
            return response()->json(['error' => 'That person is not a member of this organization.'], 404);
        }

        if (in_array($member->role, ['ORG_ADMIN', 'SUPER_ADMIN'], true)) {
            return response()->json([
                'error' => 'Another administrator\'s password can only be reset by platform support.',
            ], 403);
        }

        $password = $passwords->issue($member);

        $actor = $request->user();
        Audit::log([
            'organization_id' => $id,
            'user_id' => $actor->id,
            'user_name' => $actor->name,
            'user_role' => $actor->role,
            'action' => 'RESET_MEMBER_PASSWORD',
            'entity_type' => 'User',
            'entity_id' => $member->id,
            'details' => sprintf('Issued a temporary password for [%s] (%s); all their sessions were ended.', $member->name, $member->role),
            'ip_address' => $request->ip(),
        ]);

        return response()->json([
            'user' => $member->fresh()->toAuthPayload(),
            'temporary_password' => $password,
            'message' => 'Temporary password issued. Share it with them — they will choose their own when they sign in.',
        ]);
    }

    private function memberQuery(string $organizationId): \Illuminate\Database\Eloquent\Builder
    {
        $managerIds = Team::query()
            ->where('organization_id', $organizationId)
            ->whereNotNull('manager_user_id')
            ->pluck('manager_user_id');

        return User::query()->where(function ($q) use ($organizationId, $managerIds) {
            $q->where('organization_id', $organizationId)
                ->orWhereIn('id', $managerIds);
        })->where('role', '!=', 'SUPER_ADMIN');
    }
}

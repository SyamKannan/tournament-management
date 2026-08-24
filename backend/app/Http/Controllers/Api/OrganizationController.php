<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Invoice;
use App\Models\Organization;
use App\Models\Sponsor;
use App\Models\Tournament;
use App\Services\BillingService;
use App\Support\Audit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OrganizationController extends Controller
{
    public function __construct(private readonly BillingService $billing) {}

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

    public function subscribe(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'plan_id' => ['required', 'string'],
            'payment_method' => ['nullable', 'string', 'in:upi,razorpay,stripe,bank_transfer'],
        ], [
            'plan_id.required' => 'Plan ID is required',
        ]);

        try {
            return response()->json(
                $this->billing->subscribePlan($id, $data['plan_id'], $data['payment_method'] ?? 'upi')
            );
        } catch (\RuntimeException $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }
    }
}

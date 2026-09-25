<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\LegalAcceptance;
use App\Models\LegalDocument;
use App\Services\LegalService;
use App\Support\Audit;
use App\Support\Cached;
use App\Support\Paginate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Terms & Conditions and Privacy Policy: the public pages, an account
 * accepting them, and the super admin publishing new versions.
 */
class LegalController extends Controller
{
    public function __construct(private readonly LegalService $legal) {}

    /* ----------------------------------------------------------------- Public */

    public function show(string $type): JsonResponse
    {
        if ($missing = $this->unknownType($type)) {
            return $missing;
        }

        // Checked outside the cache so "not published" is never what gets stored.
        $document = $this->legal->current($type);

        if (! $document) {
            return response()->json(['error' => 'This document has not been published yet.'], 404);
        }

        return Cached::json('platform', "legal:{$type}", 'platform', function () use ($type, $document) {
            return [
                ...$document->toPublicArray(),
                'versions' => LegalDocument::query()
                    ->where('type', $type)
                    ->orderByDesc('version')
                    ->get(['version', 'published_at', 'summary_of_changes'])
                    ->map(fn (LegalDocument $d) => [
                        'version' => $d->version,
                        'published_at' => $d->published_at?->toIso8601String(),
                        'summary_of_changes' => $d->summary_of_changes,
                    ]),
            ];
        });
    }

    public function showVersion(string $type, int $version): JsonResponse
    {
        if ($missing = $this->unknownType($type)) {
            return $missing;
        }

        $document = LegalDocument::query()->where('type', $type)->where('version', $version)->first();

        if (! $document) {
            return response()->json(['error' => 'That version could not be found.'], 404);
        }

        return response()->json($document->toPublicArray());
    }

    /** "I agree" from an existing account — signups accept as part of registering. */
    public function accept(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user->impersonatorId) {
            return response()->json([
                'error' => 'Only the account holder can accept the terms. Sign out of this account to continue as yourself.',
            ], 403);
        }

        $request->validate(
            ['accept' => ['accepted']],
            ['accept.accepted' => 'Tick the box to confirm you agree to the Terms & Conditions and Privacy Policy.'],
        );

        $this->legal->accept($user, $request, 'prompt');

        return response()->json(['user' => $user->fresh()->toAuthPayload()]);
    }

    /* ------------------------------------------------------------ Super admin */

    public function adminIndex(): JsonResponse
    {
        $required = $this->legal->requiredVersions();

        $documents = [];
        foreach (LegalDocument::TYPES as $type) {
            $versions = LegalDocument::query()->where('type', $type)->orderByDesc('version')->get();
            $counts = LegalAcceptance::query()
                ->where('type', $type)
                ->groupBy('version')
                ->selectRaw('version, COUNT(*) as total')
                ->pluck('total', 'version');

            $documents[$type] = [
                'required_version' => $required[$type] ?? null,
                'coverage' => $this->legal->coverage($type),
                'versions' => $versions->map(fn (LegalDocument $d) => [
                    ...$d->toPublicArray(),
                    'published_by_name' => $d->published_by_name,
                    'acceptances' => (int) ($counts[$d->version] ?? 0),
                ]),
            ];
        }

        return response()->json(['documents' => $documents]);
    }

    public function publish(Request $request, string $type): JsonResponse
    {
        if ($missing = $this->unknownType($type)) {
            return $missing;
        }

        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'body' => ['required', 'string', 'min:50', 'max:200000'],
            'summary_of_changes' => ['nullable', 'string', 'max:1000'],
            'requires_reacceptance' => ['boolean'],
        ], [
            'title.required' => 'Give the document a title.',
            'body.required' => 'The document needs its text.',
            'body.min' => 'The document text looks too short — write at least 50 characters.',
        ]);

        $document = $this->legal->publish($type, $data, $request->user());

        Audit::log([
            'user_id' => $request->user()->id,
            'user_name' => $request->user()->name,
            'user_role' => $request->user()->role,
            'action' => 'LEGAL_DOCUMENT_PUBLISHED',
            'entity_type' => 'LegalDocument',
            'entity_id' => $document->id,
            'details' => sprintf(
                '%s version %d published%s',
                $document->title,
                $document->version,
                $document->requires_reacceptance ? ' — every user must accept it again' : ' (no re-acceptance needed)'
            ),
            'ip_address' => $request->ip(),
        ]);

        return response()->json($document->toPublicArray(), 201);
    }

    public function acceptances(Request $request, string $type, int $version): JsonResponse
    {
        if ($missing = $this->unknownType($type)) {
            return $missing;
        }

        $query = LegalAcceptance::query()
            ->with('user:id,name,email,phone,role,organization_id')
            ->where('type', $type)
            ->where('version', $version)
            ->orderByDesc('accepted_at')
            ->orderByDesc('id');

        if ($term = trim((string) $request->query('search'))) {
            $query->whereHas('user', fn ($users) => Paginate::search($users, $term, ['name', 'email', 'phone']));
        }

        return response()->json(Paginate::query($query, $request, fn (LegalAcceptance $a) => [
            'id' => $a->id,
            'user_id' => $a->user_id,
            'name' => $a->user?->name ?? '',
            'email' => $a->user?->email ?? '',
            'phone' => $a->user?->phone ?? '',
            'role' => $a->user?->role ?? '',
            'organization_id' => $a->user?->organization_id,
            'method' => $a->method,
            'ip_address' => $a->ip_address,
            'accepted_at' => $a->accepted_at?->toIso8601String(),
        ]));
    }

    private function unknownType(string $type): ?JsonResponse
    {
        return in_array($type, LegalDocument::TYPES, true)
            ? null
            : response()->json(['error' => 'There is no such document.'], 404);
    }
}

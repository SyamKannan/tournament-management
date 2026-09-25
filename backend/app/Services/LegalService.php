<?php

namespace App\Services;

use App\Models\LegalAcceptance;
use App\Models\LegalDocument;
use App\Models\User;
use App\Support\Ids;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Terms & Conditions and Privacy Policy: publishing versions, and who has
 * agreed to them.
 *
 * What an account owes is the *required* version of each document — the
 * latest one published with `requires_reacceptance`. A later version without
 * that flag (a typo fix) becomes the text everyone reads but asks nothing of
 * people who accepted the one before. Nothing published at all means nothing
 * is owed, so a fresh install without documents works as before.
 */
class LegalService
{
    /** The newest published version of a document, or null. */
    public function current(string $type): ?LegalDocument
    {
        return LegalDocument::query()->where('type', $type)->orderByDesc('version')->first();
    }

    /** @return array<string, int> type => version every account must have accepted */
    public function requiredVersions(): array
    {
        return LegalDocument::query()
            ->where('requires_reacceptance', true)
            ->groupBy('type')
            ->selectRaw('type, MAX(version) as version')
            ->pluck('version', 'type')
            ->map(fn ($version) => (int) $version)
            ->all();
    }

    /** True once any document exists — the point from which signups must agree. */
    public function hasDocuments(): bool
    {
        return LegalDocument::query()->exists();
    }

    /**
     * Documents this account still has to accept, e.g. ['terms'].
     *
     * Super admins publish the documents rather than agree to them.
     *
     * @return list<string>
     */
    public function pendingFor(User $user): array
    {
        if ($user->role === 'SUPER_ADMIN') {
            return [];
        }

        $required = $this->requiredVersions();

        return array_values(array_filter(
            LegalDocument::TYPES,
            fn (string $type) => isset($required[$type])
                && (int) ($user->{LegalDocument::USER_COLUMNS[$type]} ?? 0) < $required[$type],
        ));
    }

    /**
     * Record that this account agreed to the current version of every
     * published document. Called from signup (inside its transaction) and
     * from the "accept to continue" screen.
     */
    public function accept(User $user, Request $request, string $method): void
    {
        DB::transaction(function () use ($user, $request, $method) {
            foreach (LegalDocument::TYPES as $type) {
                $document = $this->current($type);

                if (! $document) {
                    continue;
                }

                $column = LegalDocument::USER_COLUMNS[$type];

                // Already on this version — accepting again adds nothing.
                if ((int) ($user->{$column} ?? 0) >= $document->version) {
                    continue;
                }

                LegalAcceptance::create([
                    'user_id' => $user->id,
                    'document_id' => $document->id,
                    'type' => $type,
                    'version' => $document->version,
                    'method' => $method,
                    'ip_address' => (string) $request->ip(),
                    'user_agent' => mb_substr((string) $request->userAgent(), 0, 512),
                    'accepted_at' => now(),
                ]);

                $user->{$column} = $document->version;
            }

            $user->save();
        });
    }

    /**
     * What a team manager agreed to on a public registration link, for the team row.
     *
     * @return array{terms: int|null, privacy: int|null, accepted_at: string, ip_address: string}
     */
    public function snapshotForTeam(Request $request): array
    {
        return [
            'terms' => $this->current('terms')?->version,
            'privacy' => $this->current('privacy')?->version,
            'accepted_at' => now()->toIso8601String(),
            'ip_address' => (string) $request->ip(),
        ];
    }

    /** Publish the next version. The earlier ones stay exactly as they were. */
    public function publish(string $type, array $data, User $publisher): LegalDocument
    {
        return DB::transaction(function () use ($type, $data, $publisher) {
            $latest = (int) LegalDocument::query()->where('type', $type)->lockForUpdate()->max('version');

            return LegalDocument::create([
                'id' => Ids::unique('legal'),
                'type' => $type,
                'version' => $latest + 1,
                'title' => $data['title'],
                'body' => $data['body'],
                'summary_of_changes' => $data['summary_of_changes'] ?? '',
                // The first version is what everyone agrees to in the first place.
                'requires_reacceptance' => $latest === 0 ? true : (bool) ($data['requires_reacceptance'] ?? true),
                'published_by' => $publisher->id,
                'published_by_name' => $publisher->name,
                'published_at' => now(),
            ]);
        });
    }

    /**
     * How many accounts are up to date with this document's required version.
     *
     * @return array{accepted: int, total: int}
     */
    public function coverage(string $type): array
    {
        $required = $this->requiredVersions()[$type] ?? null;
        $column = LegalDocument::USER_COLUMNS[$type];
        $users = User::query()->where('role', '!=', 'SUPER_ADMIN');

        return [
            'accepted' => $required === null ? 0 : (clone $users)->where($column, '>=', $required)->count(),
            'total' => $users->count(),
        ];
    }
}

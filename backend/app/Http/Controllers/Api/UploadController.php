<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Upload;
use App\Services\BillingService;
use App\Support\Ids;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\RateLimiter;

/**
 * Image uploads for logos and player photos.
 *
 * Public on purpose: team registration, auction sign-up and player
 * registration all upload a photo before anyone has an account.
 *
 * Everything lands under `public/uploads`, which the web server serves
 * directly, so the file name is built here and never taken from the upload:
 * a PNG sent as `shell.php` must not come back out as PHP. SVG is refused for
 * the same reason — it can carry script, and these files are served from our
 * own origin.
 */
class UploadController extends Controller
{
    /** Extension per accepted image type — the only names a stored file can get. */
    private const EXTENSIONS = [
        'jpg' => 'jpg',
        'jpeg' => 'jpg',
        'png' => 'png',
        'gif' => 'gif',
        'webp' => 'webp',
    ];

    private const MAX_BYTES = 10 * 1024 * 1024;

    /** Every folder the client uploads into. */
    private const FOLDERS = ['profiles', 'players', 'clubs', 'logos', 'tournaments', 'teams', 'sponsors', 'posters', 'support'];

    /** A support screenshot is a screenshot, not a banner. */
    private const SUPPORT_MAX_BYTES = 4 * 1024 * 1024;

    /** Per person (or address, signed out) per day, for uploads no quota counts. */
    private const SUPPORT_DAILY = 30;

    private const ANONYMOUS_DAILY = 150;

    public function __construct(private readonly BillingService $billing) {}

    public function upload(Request $request): JsonResponse
    {
        $request->validate([
            'image' => ['nullable', 'image', 'mimes:jpeg,png,jpg,gif,webp', 'max:10240'],
            'file' => ['nullable', 'image', 'mimes:jpeg,png,jpg,gif,webp', 'max:10240'],
            'base64' => ['nullable', 'string', 'max:15000000'],
            'folder' => ['nullable', 'string', 'max:64'],
        ]);

        // Only the folders the app uploads into; anything else lands in
        // `profiles` rather than a directory a caller made up.
        $requested = (string) $request->input('folder', 'profiles');
        $folder = in_array($requested, self::FOLDERS, true) ? $requested : 'profiles';
        $targetDir = public_path("uploads/{$folder}");

        // Nobody's quota covers these two, so each has its own ceiling: the
        // support folder was also a way round a club's storage limit (upload
        // the crest "as a screenshot"), and anonymous uploads had none at all.
        if ($limited = $this->denyUncounted($request, $folder)) {
            return $limited;
        }

        if (! File::isDirectory($targetDir)) {
            File::makeDirectory($targetDir, 0755, true, true);
        }

        // An organizer uploading against their own account is charged for the
        // space. A public registration upload has no account behind it and no
        // quota to charge, so it is recorded but never refused — turning a team
        // away from registering because the club is near its storage limit
        // would punish the wrong person.
        // A screenshot for a support ticket is not the club's content either: a
        // club at its limit must still be able to show us what went wrong.
        $organizationId = $folder === 'support' ? null : $request->user()?->organization_id;

        if ($organizationId) {
            $quota = $this->billing->checkLimit($organizationId, 'storage');

            if (! $quota['allowed']) {
                return response()->json([
                    'error' => $quota['reason'] ?? 'Storage limit reached for your plan.',
                    'limit' => $quota,
                ], 403);
            }
        }

        if ($uploaded = $request->file('image') ?? $request->file('file')) {
            // guessExtension() reads the file's own bytes; the client's name
            // does not come near the stored file.
            $extension = self::EXTENSIONS[strtolower((string) $uploaded->guessExtension())] ?? null;

            if (! $extension) {
                return response()->json(['error' => 'Upload a JPG, PNG, GIF or WEBP image.'], 422);
            }

            $filename = Ids::token(12).'_'.time().'.'.$extension;
            // Read before the move: the uploaded temp file is gone afterwards.
            $bytes = (int) $uploaded->getSize();
            $uploaded->move($targetDir, $filename);

            return $this->stored($request, $folder, $filename, $bytes, $organizationId);
        }

        if ($base64 = $request->input('base64')) {
            if (! preg_match('/^data:image\/([a-zA-Z0-9.+-]+);base64,/', $base64, $matches)) {
                return response()->json(['error' => 'No image file or base64 data provided'], 422);
            }

            $extension = self::EXTENSIONS[strtolower($matches[1])] ?? null;

            if (! $extension) {
                return response()->json(['error' => 'Invalid image format'], 422);
            }

            $data = base64_decode(substr($base64, strpos($base64, ',') + 1), true);

            if ($data === false) {
                return response()->json(['error' => 'Base64 decoding failed'], 422);
            }

            if (strlen($data) > self::MAX_BYTES) {
                return response()->json(['error' => 'That image is larger than 10 MB.'], 422);
            }

            // The data URI says what it likes; the bytes decide.
            if (! @getimagesizefromstring($data)) {
                return response()->json(['error' => 'That file is not a readable image.'], 422);
            }

            $filename = Ids::token(12).'_'.time().'.'.$extension;
            File::put("{$targetDir}/{$filename}", $data);

            return $this->stored($request, $folder, $filename, strlen($data), $organizationId);
        }

        return response()->json(['error' => 'No image file or base64 data provided'], 422);
    }

    private function denyUncounted(Request $request, string $folder): ?JsonResponse
    {
        $user = $request->user();

        if ($folder !== 'support' && $user?->organization_id) {
            return null; // the club's own storage quota applies
        }

        $size = (int) ($request->file('image') ?? $request->file('file'))?->getSize()
            ?: (int) (strlen((string) $request->input('base64', '')) * 3 / 4);

        if ($folder === 'support' && $size > self::SUPPORT_MAX_BYTES) {
            return response()->json(['error' => 'Screenshots can be up to 4 MB.'], 422);
        }

        [$bucket, $max] = $folder === 'support'
            ? ['support', self::SUPPORT_DAILY]
            : ['anonymous', self::ANONYMOUS_DAILY];
        $key = "upload-daily:{$bucket}:".($user?->id ?? $request->ip());

        if (RateLimiter::tooManyAttempts($key, $max)) {
            return response()->json(['error' => 'That is a lot of uploads for one day. Please try again tomorrow.'], 429);
        }

        RateLimiter::hit($key, 86400);

        return null;
    }

    private function stored(Request $request, string $folder, string $filename, int $bytes, ?string $organizationId): JsonResponse
    {
        // Recorded whether or not anybody owns it, so what is on disk is always
        // accounted for even when it counts against no quota.
        Upload::create([
            'id' => Ids::unique('upl'),
            'organization_id' => $organizationId,
            'uploaded_by' => $request->user()?->id,
            'folder' => $folder,
            'filename' => $filename,
            'bytes' => $bytes,
            'created_at' => now(),
        ]);

        return response()->json([
            'url' => url("uploads/{$folder}/{$filename}"),
            'path' => "uploads/{$folder}/{$filename}",
            'filename' => $filename,
            'message' => 'Image uploaded successfully',
        ], 201);
    }
}

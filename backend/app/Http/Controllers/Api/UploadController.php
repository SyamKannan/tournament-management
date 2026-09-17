<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\Ids;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;

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

    public function upload(Request $request): JsonResponse
    {
        $request->validate([
            'image' => ['nullable', 'image', 'mimes:jpeg,png,jpg,gif,webp', 'max:10240'],
            'file' => ['nullable', 'image', 'mimes:jpeg,png,jpg,gif,webp', 'max:10240'],
            'base64' => ['nullable', 'string', 'max:15000000'],
            'folder' => ['nullable', 'string', 'max:64'],
        ]);

        $folder = preg_replace('/[^a-zA-Z0-9_\-]/', '', (string) $request->input('folder', 'profiles')) ?: 'profiles';
        $targetDir = public_path("uploads/{$folder}");

        if (! File::isDirectory($targetDir)) {
            File::makeDirectory($targetDir, 0755, true, true);
        }

        if ($uploaded = $request->file('image') ?? $request->file('file')) {
            // guessExtension() reads the file's own bytes; the client's name
            // does not come near the stored file.
            $extension = self::EXTENSIONS[strtolower((string) $uploaded->guessExtension())] ?? null;

            if (! $extension) {
                return response()->json(['error' => 'Upload a JPG, PNG, GIF or WEBP image.'], 422);
            }

            $filename = Ids::token(12).'_'.time().'.'.$extension;
            $uploaded->move($targetDir, $filename);

            return $this->stored($folder, $filename);
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

            return $this->stored($folder, $filename);
        }

        return response()->json(['error' => 'No image file or base64 data provided'], 422);
    }

    private function stored(string $folder, string $filename): JsonResponse
    {
        return response()->json([
            'url' => url("uploads/{$folder}/{$filename}"),
            'path' => "uploads/{$folder}/{$filename}",
            'filename' => $filename,
            'message' => 'Image uploaded successfully',
        ], 201);
    }
}

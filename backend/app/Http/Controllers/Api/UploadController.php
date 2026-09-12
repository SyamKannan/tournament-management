<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\Ids;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;

class UploadController extends Controller
{
    /**
     * Upload an image file (PNG, JPG, WEBP, GIF, SVG) or Base64 payload.
     * Returns public URL.
     */
    public function upload(Request $request): JsonResponse
    {
        $request->validate([
            'image' => ['nullable', 'image', 'mimes:jpeg,png,jpg,gif,webp,svg', 'max:10240'],
            'file' => ['nullable', 'image', 'mimes:jpeg,png,jpg,gif,webp,svg', 'max:10240'],
            'base64' => ['nullable', 'string'],
            'folder' => ['nullable', 'string', 'max:64'],
        ]);

        $folder = preg_replace('/[^a-zA-Z0-9_\-]/', '', $request->input('folder', 'profiles'));
        $targetDir = public_path("uploads/{$folder}");

        if (! File::isDirectory($targetDir)) {
            File::makeDirectory($targetDir, 0755, true, true);
        }

        // 1. Multipart File upload
        $uploadedFile = $request->file('image') ?? $request->file('file');
        if ($uploadedFile) {
            $extension = $uploadedFile->getClientOriginalExtension() ?: 'jpg';
            $filename = Ids::token(12) . '_' . time() . '.' . $extension;
            $uploadedFile->move($targetDir, $filename);

            $url = url("uploads/{$folder}/{$filename}");
            return response()->json([
                'url' => $url,
                'path' => "uploads/{$folder}/{$filename}",
                'filename' => $filename,
                'message' => 'Image uploaded successfully',
            ], 201);
        }

        // 2. Base64 payload upload
        if ($base64 = $request->input('base64')) {
            if (preg_match('/^data:image\/(\w+);base64,/', $base64, $type)) {
                $base64Data = substr($base64, strpos($base64, ',') + 1);
                $type = strtolower($type[1]);

                if (! in_array($type, ['jpg', 'jpeg', 'gif', 'png', 'webp', 'svg'])) {
                    return response()->json(['error' => 'Invalid image format'], 422);
                }

                $data = base64_decode($base64Data);
                if ($data === false) {
                    return response()->json(['error' => 'Base64 decoding failed'], 422);
                }

                $filename = Ids::token(12) . '_' . time() . '.' . $type;
                File::put("{$targetDir}/{$filename}", $data);

                $url = url("uploads/{$folder}/{$filename}");
                return response()->json([
                    'url' => $url,
                    'path' => "uploads/{$folder}/{$filename}",
                    'filename' => $filename,
                    'message' => 'Image uploaded successfully',
                ], 201);
            }
        }

        return response()->json(['error' => 'No image file or base64 data provided'], 422);
    }
}

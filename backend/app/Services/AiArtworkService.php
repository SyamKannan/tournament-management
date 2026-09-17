<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * AI background artwork for posters. OpenAI's image model (high quality) when
 * OPENAI_API_KEY is set, else Google's Gemini image model via GEMINI_API_KEY.
 * Every failure mode (no key, network error, non-2xx, no image in the
 * response) returns null rather than throwing — poster templates always have
 * a designed CSS background to fall back to, the same "never block the real
 * feature on a third-party call" posture as RealtimeBroadcaster.
 */
class AiArtworkService
{
    private const OPENAI_ENDPOINT = 'https://api.openai.com/v1/images/generations';

    private const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent';

    public function __construct(private readonly ?string $apiKey = null) {}

    public function isConfigured(): bool
    {
        return (bool) ($this->openAiKey() || $this->geminiKey());
    }

    /**
     * Returns a data: URI for the generated portrait (4:5-ish) image, or null
     * if generation isn't configured or every configured provider failed.
     */
    public function generateBackground(string $prompt): ?string
    {
        if ($this->openAiKey() && ($image = $this->openAi($prompt))) {
            return $image;
        }

        return $this->geminiKey() ? $this->gemini($prompt) : null;
    }

    private function openAi(string $prompt): ?string
    {
        try {
            $response = Http::withToken($this->openAiKey())
                ->timeout(150)
                ->post(self::OPENAI_ENDPOINT, [
                    'model' => config('services.openai.image_model', 'gpt-image-1'),
                    'prompt' => $prompt,
                    'size' => '1024x1536',
                    'quality' => 'high',
                    'output_format' => 'jpeg',
                    'output_compression' => 90,
                    'n' => 1,
                ]);

            if (! $response->successful()) {
                Log::warning('OpenAI poster artwork failed', ['status' => $response->status(), 'body' => $response->body()]);

                return null;
            }

            $b64 = $response->json('data.0.b64_json');

            return $b64 ? 'data:image/jpeg;base64,'.$b64 : null;
        } catch (\Throwable $e) {
            Log::warning('OpenAI poster artwork threw', ['message' => $e->getMessage()]);

            return null;
        }
    }

    private function gemini(string $prompt): ?string
    {
        try {
            $response = Http::withHeaders(['x-goog-api-key' => $this->geminiKey()])
                ->timeout(120)
                ->post(sprintf(self::GEMINI_ENDPOINT, config('services.gemini.image_model', 'gemini-2.5-flash-image')), [
                    'contents' => [['parts' => [['text' => $prompt]]]],
                    'generationConfig' => [
                        'responseModalities' => ['IMAGE'],
                        'imageConfig' => ['aspectRatio' => '4:5'],
                    ],
                ]);

            if (! $response->successful()) {
                Log::warning('Gemini poster artwork failed', ['status' => $response->status(), 'body' => $response->body()]);

                return null;
            }

            foreach ($response->json('candidates.0.content.parts') ?? [] as $part) {
                $data = $part['inlineData'] ?? $part['inline_data'] ?? null;
                if (! empty($data['data'])) {
                    return 'data:'.($data['mimeType'] ?? $data['mime_type'] ?? 'image/png').';base64,'.$data['data'];
                }
            }

            return null;
        } catch (\Throwable $e) {
            Log::warning('Gemini poster artwork threw', ['message' => $e->getMessage()]);

            return null;
        }
    }

    private function openAiKey(): ?string
    {
        return $this->apiKey ?: (config('services.openai.api_key') ?: null);
    }

    private function geminiKey(): ?string
    {
        return config('services.gemini.api_key') ?: null;
    }
}

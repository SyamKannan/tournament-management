<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Thin wrapper around OpenAI's image-generation endpoint, used to give
 * PosterService a custom background instead of a flat gradient. Every
 * failure mode (no key configured, network error, non-2xx response) just
 * returns null rather than throwing — poster generation always has a
 * template-only fallback, the same "never block the real feature on a
 * third-party call" posture as RealtimeBroadcaster.
 */
class AiArtworkService
{
    private const ENDPOINT = 'https://api.openai.com/v1/images/generations';

    private const MODEL = 'gpt-image-1';

    public function __construct(private readonly ?string $apiKey = null) {}

    public function isConfigured(): bool
    {
        return (bool) $this->key();
    }

    /**
     * Returns a data: URI (base64 JPEG) for the generated image, or null if
     * generation isn't configured or the call failed for any reason.
     */
    public function generateBackground(string $prompt): ?string
    {
        $key = $this->key();

        if (! $key) {
            return null;
        }

        try {
            $response = Http::withToken($key)
                ->timeout(25)
                ->post(self::ENDPOINT, [
                    'model' => self::MODEL,
                    'prompt' => $prompt,
                    'size' => '1024x1536',
                    'quality' => 'medium',
                    'output_format' => 'jpeg',
                    'output_compression' => 80,
                    'n' => 1,
                ]);

            if (! $response->successful()) {
                Log::warning('AI poster artwork generation failed', [
                    'status' => $response->status(),
                    'body' => $response->body(),
                ]);

                return null;
            }

            $b64 = $response->json('data.0.b64_json');

            return $b64 ? 'data:image/jpeg;base64,'.$b64 : null;
        } catch (\Throwable $e) {
            Log::warning('AI poster artwork generation threw', ['message' => $e->getMessage()]);

            return null;
        }
    }

    private function key(): ?string
    {
        return $this->apiKey ?: (config('services.openai.api_key') ?: null);
    }
}

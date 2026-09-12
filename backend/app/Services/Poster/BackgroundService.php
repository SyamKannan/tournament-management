<?php

namespace App\Services\Poster;

use App\Services\AiArtworkService;

/**
 * Generates the poster's background artwork from the art director's
 * mood_prompt. Thin wrapper around the existing AiArtworkService (already
 * used by the tournament-branding poster feature) rather than a second copy
 * of the same OpenAI image-generation call — same resilience posture: no key
 * configured or any failure returns null, and the Blade template's CSS mesh
 * gradient (Layer 1 fallback) takes over.
 */
class BackgroundService
{
    public function __construct(private readonly AiArtworkService $artwork) {}

    public function isConfigured(): bool
    {
        return $this->artwork->isConfigured();
    }

    public function generate(string $moodPrompt): ?string
    {
        return $this->artwork->generateBackground($moodPrompt);
    }
}

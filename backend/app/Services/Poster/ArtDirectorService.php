<?php

namespace App\Services\Poster;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Calls the Anthropic Messages API as the poster's "art director": given the
 * match data and the club's extracted palette, it picks a headline, subhead,
 * layout and background-art mood — copy a hardcoded template could never get
 * right, since it actually reads the match data for something real to say.
 *
 * Every failure mode (no key, malformed JSON, timeout, non-2xx) returns null
 * rather than throwing. GeneratePoster falls back to a hardcoded template on
 * null — poster generation must never fail just because the model call did.
 */
class ArtDirectorService
{
    private const ENDPOINT = 'https://api.anthropic.com/v1/messages';

    private const SYSTEM_PROMPT = <<<'PROMPT'
        You are an art director for a cricket tournament's social posters.
        Return ONLY a JSON object. No markdown, no preamble, no code fences.

        Schema:
        {
          "headline": "max 4 words, punchy, specific to this match",
          "subhead": "max 8 words, the stage or context",
          "palette": {"bg": "#hex", "accent": "#hex", "text": "#hex"},
          "layout": "split_vs" | "centered" | "stat_hero",
          "mood_prompt": "background art prompt"
        }

        The headline must reference something real in the data given — a
        rivalry, a margin, a milestone — never generic hype. Keep the palette
        within the club colors given. End mood_prompt with exactly: "no text,
        no letters, no logos, no faces".
        PROMPT;

    public function __construct(private readonly ?string $apiKey = null) {}

    public function isConfigured(): bool
    {
        return (bool) $this->key();
    }

    /**
     * @param  array<string, mixed>  $matchData
     * @param  string[]  $palette  hex colors extracted from the club logo
     * @return array{headline: string, subhead: string, palette: array{bg: string, accent: string, text: string}, layout: string, mood_prompt: string}|null
     */
    public function direct(array $matchData, string $posterType, array $palette): ?array
    {
        $key = $this->key();

        if (! $key) {
            return null;
        }

        $userMessage = sprintf(
            "Match data: %s\nPoster type: %s\nClub colors from logo: %s",
            json_encode($matchData, JSON_UNESCAPED_UNICODE),
            $posterType,
            json_encode($palette)
        );

        try {
            $response = Http::withHeaders([
                'x-api-key' => $key,
                'anthropic-version' => '2023-06-01',
            ])
                ->timeout(20)
                ->post(self::ENDPOINT, [
                    'model' => config('services.anthropic.model'),
                    'max_tokens' => 500,
                    'system' => self::SYSTEM_PROMPT,
                    'messages' => [
                        ['role' => 'user', 'content' => $userMessage],
                    ],
                ]);

            if (! $response->successful()) {
                Log::warning('Poster art director call failed', [
                    'status' => $response->status(),
                    'body' => $response->body(),
                ]);

                return null;
            }

            $text = $response->json('content.0.text');

            return $this->parse($text);
        } catch (\Throwable $e) {
            Log::warning('Poster art director call threw', ['message' => $e->getMessage()]);

            return null;
        }
    }

    private function parse(?string $text): ?array
    {
        if (! $text) {
            return null;
        }

        // The prompt forbids markdown fences, but strip them defensively —
        // models occasionally wrap JSON in ```json ... ``` anyway.
        $cleaned = trim(preg_replace('/^```(?:json)?|```$/m', '', trim($text)));

        try {
            $data = json_decode($cleaned, true, flags: JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return null;
        }

        if (! is_array($data) || ! $this->isValid($data)) {
            return null;
        }

        return [
            'headline' => (string) $data['headline'],
            'subhead' => (string) $data['subhead'],
            'palette' => [
                'bg' => (string) $data['palette']['bg'],
                'accent' => (string) $data['palette']['accent'],
                'text' => (string) $data['palette']['text'],
            ],
            'layout' => (string) $data['layout'],
            'mood_prompt' => (string) $data['mood_prompt'],
        ];
    }

    private function isValid(array $data): bool
    {
        if (! isset($data['headline'], $data['subhead'], $data['layout'], $data['mood_prompt'], $data['palette'])) {
            return false;
        }

        if (! in_array($data['layout'], ['split_vs', 'centered', 'stat_hero'], true)) {
            return false;
        }

        if (! is_array($data['palette'])) {
            return false;
        }

        foreach (['bg', 'accent', 'text'] as $key) {
            if (! isset($data['palette'][$key]) || ! preg_match('/^#[0-9a-fA-F]{6}$/', $data['palette'][$key])) {
                return false;
            }
        }

        return true;
    }

    private function key(): ?string
    {
        return $this->apiKey ?: (config('services.anthropic.api_key') ?: null);
    }
}

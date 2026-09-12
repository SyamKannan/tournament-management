<?php

namespace App\Services\Poster;

use App\Models\Tournament;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use League\ColorExtractor\Color;
use League\ColorExtractor\ColorExtractor;
use League\ColorExtractor\Palette;

/**
 * Extracts 2-3 dominant colors from a tournament's logo so every poster's
 * palette is derived from real club branding rather than a generic template
 * color. Requires the `gd` extension (league/color-extractor's dependency);
 * see the poster README section for why that's enabled here.
 */
class PaletteService
{
    private const CACHE_TTL_SECONDS = 86400;

    /** Used when there's no logo, or extraction fails for any reason. */
    private const DEFAULT_COLORS = ['#0f172a', '#facc15', '#f8fafc'];

    /**
     * @return string[] hex colors, most dominant first
     */
    public function extract(Tournament $tournament, int $count = 3): array
    {
        $logo = trim((string) $tournament->logo);

        if (! $logo) {
            return self::DEFAULT_COLORS;
        }

        $cacheKey = 'poster_palette:'.$tournament->id.':'.md5($logo);

        return Cache::remember($cacheKey, self::CACHE_TTL_SECONDS, function () use ($logo, $count) {
            try {
                $palette = Palette::fromUrl($logo);
                $colors = array_map(
                    fn (int $color) => Color::fromIntToHex($color),
                    (new ColorExtractor($palette))->extract($count)
                );

                // Pad a near-monochrome logo's extraction with defaults so
                // callers always get a usable bg/accent spread.
                if (count($colors) < 2) {
                    $colors = array_values(array_unique([...$colors, ...self::DEFAULT_COLORS]));
                }

                return $colors;
            } catch (\Throwable $e) {
                Log::warning('Poster palette extraction failed', ['logo' => $logo, 'message' => $e->getMessage()]);

                return self::DEFAULT_COLORS;
            }
        });
    }

    /**
     * Heuristic bg/accent/text triple used whenever the AI art director isn't
     * available: darkest extracted color as background (posters read best as
     * dark-base/light-text), lightest as accent, near-white text guaranteed
     * legible against the renderer's dark scrim.
     *
     * @param  string[]  $colors
     * @return array{bg: string, accent: string, text: string}
     */
    public function toTemplatePalette(array $colors): array
    {
        if (! $colors) {
            $colors = self::DEFAULT_COLORS;
        }

        $byLuminance = $colors;
        usort($byLuminance, fn (string $a, string $b) => $this->luminance($a) <=> $this->luminance($b));

        return [
            'bg' => $byLuminance[0],
            'accent' => end($byLuminance),
            'text' => '#f8fafc',
        ];
    }

    private function luminance(string $hex): float
    {
        $hex = ltrim($hex, '#');
        $r = hexdec(substr($hex, 0, 2));
        $g = hexdec(substr($hex, 2, 2));
        $b = hexdec(substr($hex, 4, 2));

        return 0.2126 * $r + 0.7152 * $g + 0.0722 * $b;
    }
}

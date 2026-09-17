<?php

namespace App\Services\Poster;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\File;
use Spatie\Browsershot\Browsershot;

/**
 * Headless-Chrome rendering shared by every poster: HTML in, 1080x1350 PNG
 * (at 2x) out. Chrome is required infrastructure here — failures throw, and
 * callers decide whether they have a fallback.
 */
class PosterRenderer
{
    public const WIDTH = 1080;

    public const HEIGHT = 1350;

    public function renderToFile(string $html, string $outputPath): void
    {
        File::ensureDirectoryExists(dirname($outputPath), 0755);

        $shot = Browsershot::html($html)
            ->windowSize(self::WIDTH, self::HEIGHT)
            ->deviceScaleFactor(2)
            ->waitUntilNetworkIdle()
            ->noSandbox()
            ->setNodeModulePath(base_path('node_modules'))
            ->timeout(60);

        if ($chromePath = $this->chromePath()) {
            $shot->setChromePath($chromePath);
        }

        $shot->save($outputPath);
    }

    /** base64 of a font in resources/fonts, for inlining as a data: URI. */
    public function fontBase64(string $filename): string
    {
        return Cache::rememberForever(
            "poster_font_b64:{$filename}",
            fn () => base64_encode(File::get(resource_path("fonts/{$filename}")))
        );
    }

    /**
     * `POSTER_CHROME_PATH` is required in production; this auto-detect only
     * exists so local dev works with zero config on a machine that already
     * has a browser installed.
     */
    public function chromePath(): ?string
    {
        if ($configured = config('services.poster.chrome_path')) {
            return $configured;
        }

        foreach ([
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/usr/bin/google-chrome',
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
            'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        ] as $candidate) {
            if (File::exists($candidate)) {
                return $candidate;
            }
        }

        return null;
    }
}

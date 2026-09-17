<?php

namespace App\Services;

use App\Models\Organization;
use App\Models\Tournament;
use App\Services\Poster\PosterRenderer;
use App\Support\Ids;
use App\Support\RegistrationQr;
use Carbon\Carbon;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Tournament posters: a designed Blade template (resources/views/posters/
 * tournament/) filled with the tournament's real details and registration QR,
 * rendered to PNG by headless Chrome. When an image model is configured it
 * paints cinematic key art behind the layout (AiArtworkService); without one,
 * each template draws its own stadium/trophy artwork in CSS/SVG.
 *
 * The AI call is best-effort, and so is Chrome here: if the render fails the
 * poster falls back to the self-contained SVG layout below, so the organizer
 * always gets something to share.
 */
class PosterService
{
    public const TEMPLATES = ['arena', 'split', 'classic'];

    private const WIDTH = 1080;

    private const HEIGHT = 1350;

    /** Sport-keyed palettes for the SVG fallback: [gradient start, gradient end, accent]. */
    private const PALETTES = [
        'football' => ['#047857', '#0f172a', '#facc15'],
        'cricket' => ['#0e7490', '#1e1b4b', '#fb923c'],
    ];

    /** Per template, per sport: deep background, primary, accent, secondary accent. */
    private const TEMPLATE_PALETTES = [
        'arena' => [
            'football' => ['deep' => '#020d07', 'primary' => '#0a7a3f', 'accent' => '#c8ff2e', 'accent2' => '#ffffff'],
            'cricket' => ['deep' => '#050a24', 'primary' => '#1d3bb8', 'accent' => '#ffc21a', 'accent2' => '#ff4d3d'],
        ],
        'split' => [
            'football' => ['deep' => '#0b0b0f', 'primary' => '#ff5a1f', 'accent' => '#ffd400', 'accent2' => '#ffffff'],
            'cricket' => ['deep' => '#0c1233', 'primary' => '#e11d48', 'accent' => '#ffd166', 'accent2' => '#ffffff'],
        ],
        'classic' => [
            'football' => ['deep' => '#07080a', 'primary' => '#14301f', 'accent' => '#e9c46a', 'accent2' => '#fff4d6'],
            'cricket' => ['deep' => '#07080a', 'primary' => '#2a1a0c', 'accent' => '#e9c46a', 'accent2' => '#fff4d6'],
        ],
    ];

    public function __construct(
        private readonly AiArtworkService $artwork,
        private readonly PosterRenderer $renderer,
    ) {}

    /**
     * @return array{url: string, used_ai: bool, template: string}
     */
    public function generate(
        Tournament $tournament,
        ?Organization $organization,
        bool $useAi = true,
        ?string $origin = null,
        ?string $template = null,
    ): array {
        $poster = $this->tournamentHtml($tournament, $organization, $useAi, $origin, $template);
        $filename = $tournament->id.'_'.Ids::token(6);
        $targetDir = public_path('uploads/posters');

        try {
            $this->renderer->renderToFile($poster['html'], "{$targetDir}/{$filename}.png");

            return [
                'url' => url("uploads/posters/{$filename}.png"),
                'used_ai' => $poster['used_ai'],
                'template' => $poster['template'],
            ];
        } catch (\Throwable $e) {
            Log::warning('Poster render failed, falling back to SVG', ['message' => $e->getMessage()]);
        }

        File::ensureDirectoryExists($targetDir, 0755);
        File::put("{$targetDir}/{$filename}.svg", $this->buildSvg($tournament, $organization, $poster['background'], $poster['qr']));

        return [
            'url' => url("uploads/posters/{$filename}.svg"),
            'used_ai' => $poster['used_ai'],
            'template' => 'svg',
        ];
    }

    /**
     * @return array{html: string, template: string, used_ai: bool, background: ?string, qr: ?string}
     */
    public function tournamentHtml(
        Tournament $tournament,
        ?Organization $organization,
        bool $useAi = true,
        ?string $origin = null,
        ?string $template = null,
    ): array {
        $template = in_array($template, self::TEMPLATES, true) ? $template : self::TEMPLATES[random_int(0, count(self::TEMPLATES) - 1)];
        $sport = $tournament->sport_code === 'cricket' ? 'cricket' : 'football';

        $background = ($useAi && $this->artwork->isConfigured())
            ? $this->artwork->generateBackground($this->buildArtPrompt($tournament, $template))
            : null;

        $registrationUrl = RegistrationQr::url($tournament, $origin);
        $qr = $registrationUrl ? RegistrationQr::dataUri($registrationUrl) : null;

        $html = view("posters.tournament.{$template}", [
            'sport' => $sport,
            'palette' => self::TEMPLATE_PALETTES[$template][$sport],
            'name' => $tournament->name,
            'tagline' => $this->tagline($sport),
            'orgName' => $organization?->name ?: 'Independent Organizer',
            'orgLogo' => $this->inlineImage($organization?->logo) ?: '',
            'tournamentLogo' => $this->inlineImage($tournament->logo) ?: '',
            'dateRange' => $this->formatDateRange($tournament->start_date, $tournament->end_date),
            'venue' => trim(implode(', ', array_filter([$tournament->location, $tournament->district]))),
            'format' => ucwords(str_replace('_', ' + ', $tournament->format ?: 'league')),
            'maxTeams' => $tournament->max_teams,
            'prize' => $tournament->prize_money > 0 ? '₹'.$this->indianMoney($tournament->prize_money) : null,
            'runnerUp' => $tournament->runner_up_prize > 0 ? '₹'.$this->indianMoney($tournament->runner_up_prize) : null,
            'entryFee' => $tournament->ground_fee > 0 ? '₹'.$this->indianMoney($tournament->ground_fee) : 'Free',
            'contact' => trim((string) ($tournament->whatsapp ?: $tournament->phone)),
            'contactPerson' => trim((string) $tournament->contact_person),
            'closing' => $this->formatDay($tournament->registration_closing),
            'registrationUrl' => $registrationUrl,
            'registrationQr' => $qr,
            'backgroundImage' => $background,
            'fonts' => [
                'anton' => $this->renderer->fontBase64('Anton-Regular.ttf'),
                'bebas' => $this->renderer->fontBase64('BebasNeue-Regular.ttf'),
                'oswald' => $this->renderer->fontBase64('Oswald-Variable.ttf'),
                'inter' => $this->renderer->fontBase64('Inter-Variable.ttf'),
            ],
        ])->render();

        return [
            'html' => $html,
            'template' => $template,
            'used_ai' => $background !== null,
            'background' => $background,
            'qr' => $qr,
        ];
    }

    /**
     * Art direction per template, so the key art leaves room where that
     * layout puts its text. Steers away from rendering text/logos (drawn
     * precisely by the template) and from recognizable faces, since a generic
     * "cricket player" prompt tends to produce someone who reads as a real star.
     */
    private function buildArtPrompt(Tournament $tournament, string $template): string
    {
        $subject = $tournament->sport_code === 'cricket'
            ? 'a cricket batter in full kit mid cover-drive, the red ball exploding off the bat with sparks and dust'
            : 'a football striker mid volley, the ball bursting forward with spray and turf flying';

        $composition = match ($template) {
            'split' => 'Subject placed in the right half of the frame, tightly cropped, with the left half dark and uncluttered.',
            'classic' => 'A gleaming gold championship trophy on a pedestal in the centre, dark moody background with gold bokeh, a player silhouette softly behind it.',
            default => 'Subject in the upper-middle of the frame, stadium floodlights and a packed night stadium behind, bottom third fading to dark and uncluttered.',
        };

        return 'Premium sports tournament poster key art, cinematic photograph, '.$subject.'. '
            .$composition.' '
            .'Dramatic rim lighting, volumetric light rays, haze, flying particles, high contrast, rich colour grade, '
            .'shallow depth of field, ultra detailed, portrait 4:5. '
            .'The player is seen from behind or in silhouette, face not visible, generic unbranded kit. '
            .'Absolutely no text, no letters, no numbers, no logos, no watermarks, no scoreboards.';
    }

    /**
     * Logos are inlined as data URIs so a slow or dead image host can't leave
     * a blank circle in the screenshot; null (template shows the initial)
     * when the image can't be read.
     */
    private function inlineImage(?string $src): ?string
    {
        $src = trim((string) $src);

        if ($src === '' || str_starts_with($src, 'data:image/')) {
            return $src ?: null;
        }

        try {
            if (preg_match('#^https?://#i', $src)) {
                $response = Http::timeout(8)->get($src);
                if (! $response->successful()) {
                    return null;
                }
                $body = $response->body();
                $mime = $response->header('Content-Type');
            } else {
                $path = public_path(ltrim((string) parse_url($src, PHP_URL_PATH), '/'));
                $body = File::isFile($path) ? File::get($path) : null;
                $mime = $body ? File::mimeType($path) : null;
            }
        } catch (\Throwable) {
            // Unreachable from PHP (e.g. no CA bundle) — let Chrome try the URL; the template hides it on error.
            return preg_match('#^https?://#i', $src) ? $src : null;
        }

        if (! $body || ! str_starts_with((string) $mime, 'image/')) {
            return null;
        }

        return 'data:'.explode(';', $mime)[0].';base64,'.base64_encode($body);
    }

    private function tagline(string $sport): string
    {
        $lines = $sport === 'cricket'
            ? ['The Battle For Glory', 'Every Run Counts', 'Rise To The Occasion', 'Where Legends Are Made']
            : ['The Battle For Glory', 'Play Hard. Win Big.', 'Where Legends Are Made', 'One Ball. One Dream.'];

        return $lines[random_int(0, count($lines) - 1)];
    }

    /** 1,00,000-style grouping, the way the audience writes prize amounts. */
    private function indianMoney(float $amount): string
    {
        $whole = (string) (int) round($amount);
        if (strlen($whole) <= 3) {
            return $whole;
        }

        return preg_replace('/\B(?=(\d{2})+(?!\d))/', ',', substr($whole, 0, -3)).','.substr($whole, -3);
    }

    private function formatDay(?string $date): ?string
    {
        if (! $date) {
            return null;
        }

        try {
            return Carbon::parse($date)->format('j M Y');
        } catch (\Throwable) {
            return null;
        }
    }

    private function buildSvg(Tournament $tournament, ?Organization $organization, ?string $backgroundImage, ?string $registrationQr = null): string
    {
        [$gradFrom, $gradTo, $accent] = self::PALETTES[$tournament->sport_code] ?? self::PALETTES['football'];
        $sportLabel = $tournament->sport_code === 'football' ? "\u{26BD} FOOTBALL" : "\u{1F3CF} CRICKET";
        $w = self::WIDTH;
        $h = self::HEIGHT;

        $orgName = $organization?->name ?: 'Independent Organizer';
        $orgLogo = $organization?->logo ?: '';

        $venue = $this->truncate(trim(implode(', ', array_filter([$tournament->location, $tournament->district]))), 48);
        $dateRange = $this->formatDateRange($tournament->start_date, $tournament->end_date);

        [$titleLines, $titleFontSize, $titleLineHeight] = $this->layoutTitle($tournament->name);
        $titleStartY = 560 - (count($titleLines) - 1) * ($titleLineHeight / 2);

        $chips = array_values(array_filter([
            ['MAX TEAMS', (string) $tournament->max_teams],
            $tournament->prize_money > 0 ? ['PRIZE MONEY', '₹'.$this->money($tournament->prize_money)] : null,
            $tournament->ground_fee > 0 ? ['ENTRY FEE', '₹'.$this->money($tournament->ground_fee)] : null,
            ['FORMAT', ucwords(str_replace('_', ' + ', $tournament->format ?: 'league'))],
        ]));

        $svg = [];
        $svg[] = '<svg xmlns="http://www.w3.org/2000/svg" width="'.$w.'" height="'.$h.'" viewBox="0 0 '.$w.' '.$h.'">';

        $svg[] = '<defs>';
        $svg[] = '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">';
        $svg[] = '<stop offset="0%" stop-color="'.$gradFrom.'"/>';
        $svg[] = '<stop offset="100%" stop-color="'.$gradTo.'"/>';
        $svg[] = '</linearGradient>';
        $svg[] = '<clipPath id="logoClip"><circle cx="130" cy="130" r="70"/></clipPath>';
        $svg[] = '</defs>';

        // Background: AI artwork (with a darkening overlay so text stays
        // legible over it) when available, otherwise the plain gradient.
        if ($backgroundImage) {
            $svg[] = '<image href="'.$this->escape($backgroundImage).'" x="0" y="0" width="'.$w.'" height="'.$h.'" preserveAspectRatio="xMidYMid slice"/>';
            $svg[] = '<rect width="'.$w.'" height="'.$h.'" fill="url(#bg)" opacity="0.55"/>';
        } else {
            $svg[] = '<rect width="'.$w.'" height="'.$h.'" fill="url(#bg)"/>';
        }
        $svg[] = '<circle cx="'.($w - 60).'" cy="60" r="260" fill="#ffffff" opacity="0.06"/>';
        $svg[] = '<circle cx="60" cy="'.($h - 120).'" r="320" fill="#000000" opacity="0.15"/>';
        $svg[] = '<rect x="0" y="0" width="'.$w.'" height="10" fill="'.$accent.'"/>';

        // Org badge (top-left): logo circle + name
        $svg[] = '<circle cx="130" cy="130" r="74" fill="#ffffff" opacity="0.95"/>';
        if ($orgLogo) {
            $svg[] = '<image href="'.$this->escape($orgLogo).'" x="60" y="60" width="140" height="140" clip-path="url(#logoClip)" preserveAspectRatio="xMidYMid slice"/>';
        } else {
            $svg[] = '<text x="130" y="150" font-family="Arial, sans-serif" font-size="56" font-weight="900" fill="'.$gradTo.'" text-anchor="middle">'.$this->escape(mb_substr($orgName, 0, 1)).'</text>';
        }
        $svg[] = '<text x="225" y="115" font-family="Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="3" fill="'.$accent.'">PRESENTED BY</text>';
        $svg[] = '<text x="225" y="152" font-family="Arial, sans-serif" font-size="34" font-weight="900" fill="#ffffff">'.$this->escape($this->truncate($orgName, 22)).'</text>';

        // Sport badge (top-right)
        $badgeWidth = 260;
        $svg[] = '<rect x="'.($w - $badgeWidth - 60).'" y="70" width="'.$badgeWidth.'" height="56" rx="28" fill="#ffffff" opacity="0.12"/>';
        $svg[] = '<text x="'.($w - $badgeWidth / 2 - 60).'" y="107" font-family="Arial, sans-serif" font-size="24" font-weight="800" fill="#ffffff" text-anchor="middle">'.$sportLabel.'</text>';

        // Tournament name
        foreach ($titleLines as $i => $line) {
            $svg[] = '<text x="'.($w / 2).'" y="'.($titleStartY + $i * $titleLineHeight).'" font-family="Arial, sans-serif" font-size="'.$titleFontSize.'" font-weight="900" fill="#ffffff" text-anchor="middle">'.$this->escape($line).'</text>';
        }
        $svg[] = '<rect x="'.($w / 2 - 90).'" y="'.($titleStartY + count($titleLines) * $titleLineHeight - $titleFontSize * 0.6).'" width="180" height="6" rx="3" fill="'.$accent.'"/>';

        // Venue + dates
        $infoY = $titleStartY + count($titleLines) * $titleLineHeight + 30;
        if ($venue) {
            $svg[] = '<text x="'.($w / 2).'" y="'.$infoY.'" font-family="Arial, sans-serif" font-size="30" fill="#e2e8f0" text-anchor="middle">'."\u{1F4CD}".' '.$this->escape($venue).'</text>';
            $infoY += 46;
        }
        if ($dateRange) {
            $svg[] = '<text x="'.($w / 2).'" y="'.$infoY.'" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="'.$accent.'" text-anchor="middle">'.$this->escape($dateRange).'</text>';
        }

        // Registration QR card (bottom-right) takes a column out of the chip row
        // and the footer, which then left-align beside it.
        $qrCardW = 240;
        $contentRight = $registrationQr ? $w - 60 - $qrCardW - 24 : $w - 60;

        // Info chips
        if ($chips) {
            $chipY = $h - 320;
            $count = count($chips);
            $chipW = ($contentRight - 60 - ($count - 1) * 24) / $count;
            foreach ($chips as $i => [$label, $value]) {
                $cx = 60 + $i * ($chipW + 24);
                $svg[] = '<rect x="'.$cx.'" y="'.$chipY.'" width="'.$chipW.'" height="130" rx="20" fill="#ffffff" opacity="0.10"/>';
                $svg[] = '<text x="'.($cx + $chipW / 2).'" y="'.($chipY + 46).'" font-family="Arial, sans-serif" font-size="18" font-weight="700" letter-spacing="1.5" fill="'.$accent.'" text-anchor="middle">'.$this->escape($label).'</text>';
                $svg[] = '<text x="'.($cx + $chipW / 2).'" y="'.($chipY + 92).'" font-family="Arial, sans-serif" font-size="'.($registrationQr ? 26 : 30).'" font-weight="900" fill="#ffffff" text-anchor="middle">'.$this->escape($this->truncate($value, 14)).'</text>';
            }
        }

        // Footer
        $svg[] = '<rect x="0" y="'.($h - 130).'" width="'.$w.'" height="130" fill="#000000" opacity="0.25"/>';
        [$footerX, $footerAnchor] = $registrationQr ? [60, 'start'] : [$w / 2, 'middle'];
        $svg[] = '<text x="'.$footerX.'" y="'.($h - 78).'" font-family="Arial, sans-serif" font-size="34" font-weight="900" fill="#ffffff" text-anchor="'.$footerAnchor.'">REGISTER YOUR TEAM TODAY</text>';
        $contact = trim((string) ($tournament->whatsapp ?: $tournament->phone));
        $svg[] = '<text x="'.$footerX.'" y="'.($h - 38).'" font-family="Arial, sans-serif" font-size="24" fill="'.$accent.'" text-anchor="'.$footerAnchor.'">'.$this->escape($contact ?: 'Contact the organizer for details').'</text>';

        if ($registrationQr) {
            $cardX = $w - 60 - $qrCardW;
            $cardY = $h - 340;
            $svg[] = '<rect x="'.$cardX.'" y="'.$cardY.'" width="'.$qrCardW.'" height="280" rx="20" fill="#ffffff"/>';
            $svg[] = '<image href="'.$registrationQr.'" x="'.($cardX + 15).'" y="'.($cardY + 15).'" width="210" height="210"/>';
            $svg[] = '<text x="'.($cardX + $qrCardW / 2).'" y="'.($cardY + 260).'" font-family="Arial, sans-serif" font-size="18" font-weight="900" fill="'.$gradTo.'" text-anchor="middle">SCAN TO REGISTER</text>';
        }

        $svg[] = '</svg>';

        return implode('', $svg);
    }

    /**
     * Fits the tournament name into the title area by shrinking the font
     * (rather than silently dropping lines) until it fits within the line
     * budget for that size; only hard-truncates as a last resort for names
     * that still overflow at the smallest size.
     *
     * @return array{0: string[], 1: int, 2: int}
     */
    private function layoutTitle(string $name): array
    {
        $titleAreaWidth = 920;

        foreach ([72 => 3, 60 => 3, 50 => 4, 42 => 4, 36 => 5] as $size => $maxLines) {
            $maxCharsPerLine = max(6, (int) floor($titleAreaWidth / ($size * 0.56)));
            $lines = $this->wrapAll($name, $maxCharsPerLine);

            if (count($lines) <= $maxLines) {
                return [$lines, $size, (int) round($size * 1.12)];
            }
        }

        $size = 36;
        $maxCharsPerLine = max(6, (int) floor($titleAreaWidth / ($size * 0.56)));
        $lines = array_slice($this->wrapAll($name, $maxCharsPerLine), 0, 5);
        $lines[4] = $this->truncate($lines[4], $maxCharsPerLine);

        return [$lines, $size, (int) round($size * 1.12)];
    }

    /**
     * @return string[]
     */
    private function wrapAll(string $text, int $maxCharsPerLine): array
    {
        return explode("\n", wordwrap($text, $maxCharsPerLine, "\n", false));
    }

    private function truncate(string $text, int $max): string
    {
        return mb_strlen($text) > $max ? mb_substr($text, 0, $max - 1).'…' : $text;
    }

    private function money(float $amount): string
    {
        return $amount == floor($amount) ? number_format($amount, 0) : number_format($amount, 2);
    }

    private function formatDateRange(?string $start, ?string $end): string
    {
        if (! $start) {
            return '';
        }

        try {
            $startDate = Carbon::parse($start);
            $endDate = $end ? Carbon::parse($end) : $startDate;
        } catch (\Throwable) {
            return $start;
        }

        if ($startDate->isSameDay($endDate)) {
            return $startDate->format('jS M Y');
        }

        if ($startDate->isSameMonth($endDate)) {
            return $startDate->format('jS').' – '.$endDate->format('jS M Y');
        }

        return $startDate->format('jS M').' – '.$endDate->format('jS M Y');
    }

    private function escape(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_XML1, 'UTF-8');
    }
}

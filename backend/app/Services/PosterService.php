<?php

namespace App\Services;

use App\Models\Organization;
use App\Models\Tournament;
use App\Support\Ids;
use Carbon\Carbon;
use Illuminate\Support\Facades\File;

/**
 * Composes a shareable tournament poster as a self-contained SVG: the
 * logo/name/dates/venue layout always renders from plain PHP (no external
 * API, no PHP image extension needed — the box this runs on may not have
 * GD/Imagick, see CLAUDE.md's deployability notes), and optionally gets a
 * custom AI-generated background behind it via AiArtworkService. That call
 * is best-effort — no key configured, a timeout, or any other failure just
 * falls back to the plain gradient template instead of breaking generation,
 * the same posture RealtimeBroadcaster takes toward the websocket bridge.
 */
class PosterService
{
    private const WIDTH = 1080;

    private const HEIGHT = 1350;

    /** Sport-keyed palettes: [gradient start, gradient end, accent]. */
    private const PALETTES = [
        'football' => ['#047857', '#0f172a', '#facc15'],
        'cricket' => ['#0e7490', '#1e1b4b', '#fb923c'],
    ];

    public function __construct(private readonly AiArtworkService $artwork) {}

    /**
     * @return array{url: string, used_ai: bool}
     */
    public function generate(Tournament $tournament, ?Organization $organization, bool $useAi = true): array
    {
        $background = ($useAi && $this->artwork->isConfigured())
            ? $this->artwork->generateBackground($this->buildArtPrompt($tournament))
            : null;

        $svg = $this->buildSvg($tournament, $organization, $background);

        $targetDir = public_path('uploads/posters');
        if (! File::isDirectory($targetDir)) {
            File::makeDirectory($targetDir, 0755, true, true);
        }

        $filename = $tournament->id.'_'.Ids::token(6).'.svg';
        File::put("{$targetDir}/{$filename}", $svg);

        return [
            'url' => url("uploads/posters/{$filename}"),
            'used_ai' => $background !== null,
        ];
    }

    /**
     * Deliberately steers the model away from rendering any text/logos of
     * its own — those are drawn precisely afterwards as SVG overlay — and
     * away from real people, since a generic prompt with "football/cricket
     * players" tends to produce faces that read as a specific real person.
     */
    private function buildArtPrompt(Tournament $tournament): string
    {
        $sport = $tournament->sport_code === 'football' ? 'football (soccer)' : 'cricket';
        $venue = trim(implode(', ', array_filter([$tournament->location, $tournament->district]))) ?: 'a village sports ground';

        return sprintf(
            'A dramatic, professional sports tournament poster background for a %s tournament at %s. '
            .'Dynamic action energy, stadium floodlights at dusk, motion blur, vibrant color grade. '
            .'Wide poster background artwork only: absolutely no text, no words, no letters, no numbers, '
            .'no logos, no scoreboards, and no recognizable faces or real people — silhouettes or abstract '
            .'action shapes only. Portrait orientation, full bleed.',
            $sport,
            $venue,
        );
    }

    private function buildSvg(Tournament $tournament, ?Organization $organization, ?string $backgroundImage): string
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

        // Info chips
        if ($chips) {
            $chipY = $h - 320;
            $count = count($chips);
            $chipW = ($w - 120 - ($count - 1) * 24) / $count;
            foreach ($chips as $i => [$label, $value]) {
                $cx = 60 + $i * ($chipW + 24);
                $svg[] = '<rect x="'.$cx.'" y="'.$chipY.'" width="'.$chipW.'" height="130" rx="20" fill="#ffffff" opacity="0.10"/>';
                $svg[] = '<text x="'.($cx + $chipW / 2).'" y="'.($chipY + 46).'" font-family="Arial, sans-serif" font-size="18" font-weight="700" letter-spacing="1.5" fill="'.$accent.'" text-anchor="middle">'.$this->escape($label).'</text>';
                $svg[] = '<text x="'.($cx + $chipW / 2).'" y="'.($chipY + 92).'" font-family="Arial, sans-serif" font-size="30" font-weight="900" fill="#ffffff" text-anchor="middle">'.$this->escape($this->truncate($value, 14)).'</text>';
            }
        }

        // Footer
        $svg[] = '<rect x="0" y="'.($h - 130).'" width="'.$w.'" height="130" fill="#000000" opacity="0.25"/>';
        $svg[] = '<text x="'.($w / 2).'" y="'.($h - 78).'" font-family="Arial, sans-serif" font-size="34" font-weight="900" fill="#ffffff" text-anchor="middle">REGISTER YOUR TEAM TODAY</text>';
        $contact = trim((string) ($tournament->whatsapp ?: $tournament->phone));
        $svg[] = '<text x="'.($w / 2).'" y="'.($h - 38).'" font-family="Arial, sans-serif" font-size="24" fill="'.$accent.'" text-anchor="middle">'.$this->escape($contact ?: 'Contact the organizer for details').'</text>';

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

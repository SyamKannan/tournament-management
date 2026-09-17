<?php

namespace App\Support;

use App\Models\RegistrationLink;
use App\Models\Tournament;
use chillerlan\QRCode\QRCode;
use chillerlan\QRCode\QROptions;

/**
 * The public team-registration link of a tournament, and a QR code for it,
 * for printing onto posters. Pure-PHP SVG output — no GD/Imagick needed.
 */
class RegistrationQr
{
    /**
     * The link lives on the client SPA, not the API host, so the base is
     * FRONTEND_URL when set, else the origin the request came from (captured at
     * dispatch for queued posters), else APP_URL. Null when the tournament has
     * no active link or is no longer taking teams.
     */
    public static function url(Tournament $tournament, ?string $origin = null): ?string
    {
        if (in_array($tournament->status, ['cancelled', 'completed'], true)) {
            return null;
        }

        $link = RegistrationLink::query()->where('tournament_id', $tournament->id)->first();

        if (! $link || $link->status !== 'active') {
            return null;
        }

        $base = rtrim((string) (config('app.frontend_url') ?: $origin ?: config('app.url')), '/');

        return "{$base}/register/team/".rawurlencode($link->token);
    }

    /** base64 `data:image/svg+xml` URI, usable as an <img> src or SVG <image> href. */
    public static function dataUri(string $url): string
    {
        return (new QRCode(new QROptions([
            'outputBase64' => true,
            'addQuietzone' => true,
            'quietzoneSize' => 2,
            'svgAddXmlHeader' => false,
        ])))->render($url);
    }
}

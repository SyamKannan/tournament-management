{{--
    Shared poster shell: fonts, the four render layers, and the small type
    system every partial builds on. `$palette` is {bg, accent, text} (from the
    art director, or PaletteService::toTemplatePalette() as fallback).
    `$backgroundImage` is a data: URI / URL from BackgroundService, or null —
    when null the CSS two-tone/decor combo (Layer 1 fallback) takes over.
    `$variant` (floodlight/blocks/stripes/halftone) and `$bokeh` (a list of
    scattered circles) are picked fresh, at random, on every single render —
    see GeneratePoster::pickVariant()/randomBokeh() — so regenerating the same
    poster never looks the same way twice, independent of whether AI copy or
    AI artwork are configured.
--}}
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
    @font-face {
        font-family: 'Anton';
        src: url(data:font/ttf;base64,{{ $antonFontBase64 }}) format('truetype');
        font-weight: 400;
        font-style: normal;
    }
    @font-face {
        font-family: 'Inter';
        src: url(data:font/ttf;base64,{{ $interFontBase64 }}) format('truetype');
        font-weight: 100 900;
        font-style: normal;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    :root {
        --bg: {{ $palette['bg'] }};
        --bg-deep: color-mix(in srgb, {{ $palette['bg'] }} 55%, black 45%);
        --accent: {{ $palette['accent'] }};
        --text: {{ $palette['text'] }};
        --margin: 64px;
        --fs-headline: 96px;
        --fs-subhead: 48px;
        --fs-body: 28px;
        --fs-meta: 18px;
    }

    html, body {
        width: 1080px;
        height: 1350px;
        background: var(--bg);
        color: var(--text);
        font-family: 'Inter', sans-serif;
        overflow: hidden;
    }

    .canvas {
        position: relative;
        width: 1080px;
        height: 1350px;
    }

    /* Layer 1: AI artwork, or a two-tone club-color backdrop when there's none. */
    .bg-layer {
        position: absolute;
        inset: 0;
        @if ($backgroundImage)
            background-image: url({{ $backgroundImage }});
            background-size: cover;
            background-position: center;
        @else
            background: linear-gradient(165deg, var(--bg) 0%, var(--bg) 62%, var(--bg-deep) 62%, var(--bg-deep) 100%);
        @endif
    }

    /* Decorative pass, layered above bg-layer regardless of whether that's an
       AI photo or the CSS fallback — this is what actually varies between
       renders (see $variant), not just the copy. */
    .decor-layer {
        position: absolute;
        inset: 0;
        overflow: hidden;
    }

    @if ($variant === 'floodlight')
        .decor-layer::before, .decor-layer::after {
            content: '';
            position: absolute;
            top: -10%;
            width: 140%;
            height: 90%;
            background: conic-gradient(from 200deg at 50% 0%, transparent 0deg, rgba(255,255,255,0.16) 18deg, transparent 34deg);
        }
        .decor-layer::before { left: -55%; }
        .decor-layer::after { right: -55%; transform: scaleX(-1); }
    @elseif ($variant === 'blocks')
        .decor-layer::before {
            content: '';
            position: absolute;
            inset: 0;
            background: var(--accent);
            clip-path: polygon(0 0, 100% 0, 100% 14%, 0 34%);
            opacity: 0.9;
        }
        .decor-layer::after {
            content: '';
            position: absolute;
            inset: 0;
            background: var(--accent);
            clip-path: polygon(0 78%, 100% 92%, 100% 100%, 0 100%);
            opacity: 0.55;
        }
    @elseif ($variant === 'stripes')
        .decor-layer::before {
            content: '';
            position: absolute;
            inset: -20% -20%;
            background: repeating-linear-gradient(-35deg,
                color-mix(in srgb, var(--accent) 35%, transparent) 0px,
                color-mix(in srgb, var(--accent) 35%, transparent) 22px,
                transparent 22px,
                transparent 90px);
            opacity: 0.5;
        }
    @else
        {{-- halftone --}}
        .decor-layer::before {
            content: '';
            position: absolute;
            inset: 0;
            background-image: radial-gradient(color-mix(in srgb, var(--text) 70%, transparent) 3px, transparent 3.5px);
            background-size: 28px 28px;
            opacity: 0.12;
        }
    @endif

    /* Scattered bokeh — a fresh random set every render (see $bokeh). */
    .bokeh {
        position: absolute;
        border-radius: 50%;
        filter: blur(1px);
    }

    /* Layer 2: always-on scrim so Layer 3 text is legible over anything. */
    .scrim {
        position: absolute;
        inset: 0;
        background: linear-gradient(180deg,
            rgba(0,0,0,0.55) 0%,
            rgba(0,0,0,0.25) 30%,
            rgba(0,0,0,0.35) 70%,
            rgba(0,0,0,0.75) 100%);
    }

    /* Layers 3 & 4: typography, match data, logos — drawn by each partial. */
    .content {
        position: relative;
        z-index: 2;
        width: 100%;
        height: 100%;
        padding: var(--margin);
        display: flex;
        flex-direction: column;
    }

    .eyebrow {
        display: inline-block;
        font-size: var(--fs-meta);
        font-weight: 800;
        letter-spacing: 2px;
        text-transform: uppercase;
        color: #0a0a0a;
        background: var(--accent);
        padding: 8px 20px;
        border-radius: 999px;
    }

    /* The bold outlined/dropped-shadow look of a printed tournament flyer,
       not a restrained app UI headline — that's the whole point here. */
    .headline {
        font-family: 'Anton', sans-serif;
        font-size: var(--fs-headline);
        line-height: 1;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: var(--accent);
        -webkit-text-stroke: 7px #0a0a0a;
        paint-order: stroke fill;
        text-shadow: 0 10px 0 rgba(0,0,0,0.35);
    }

    .subhead {
        font-size: var(--fs-subhead);
        font-weight: 600;
        opacity: 0.9;
    }

    .body-text {
        font-size: var(--fs-body);
        font-weight: 500;
        opacity: 0.85;
    }

    .meta {
        font-size: var(--fs-meta);
        opacity: 0.75;
    }

    .logo-circle {
        border-radius: 50%;
        background: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        flex-shrink: 0;
    }

    .logo-circle img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .logo-circle .initials {
        font-family: 'Anton', sans-serif;
        color: var(--bg);
    }

    .footer-bar {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        z-index: 2;
        padding: 32px var(--margin);
        background: rgba(0,0,0,0.4);
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .footer-bar .meta { opacity: 0.9; }

    {{ $extraStyles ?? '' }}
</style>
</head>
<body>
<div class="canvas">
    <div class="bg-layer"></div>
    <div class="decor-layer">
        @foreach ($bokeh ?? [] as $circle)
            <div class="bokeh" style="
                left: {{ $circle['x'] }}%;
                top: {{ $circle['y'] }}%;
                width: {{ $circle['size'] }}px;
                height: {{ $circle['size'] }}px;
                background: {{ $circle['color'] }};
                opacity: {{ $circle['opacity'] }};
            "></div>
        @endforeach
    </div>
    <div class="scrim"></div>
    <div class="content layout-{{ $layout }}">
        @yield('content')
    </div>
    @yield('footer')
</div>

{{-- Runs before Puppeteer's load/networkidle wait, so the shrink is applied
     before the screenshot is taken. Steps the headline down through the type
     scale until it fits within two lines instead of silently overflowing. --}}
<script>
    (function () {
        var el = document.querySelector('.headline');
        if (!el) return;

        var steps = [96, 80, 64, 52, 42];
        var maxLines = 2;
        var lineHeightRatio = 0.95;

        for (var i = 0; i < steps.length; i++) {
            el.style.fontSize = steps[i] + 'px';
            var lines = Math.round(el.scrollHeight / (steps[i] * lineHeightRatio));
            if (el.scrollHeight <= el.clientHeight + 2 && lines <= maxLines) {
                break;
            }
        }
    })();
</script>
</body>
</html>

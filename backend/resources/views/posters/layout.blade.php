{{--
    Shared poster shell: fonts, the four render layers, and the small type
    system every partial builds on. `$palette` is {bg, accent, text} (from the
    art director, or PaletteService::toTemplatePalette() as fallback).
    `$backgroundImage` is a data: URI / URL from BackgroundService, or null —
    when null the CSS mesh gradient (Layer 1 fallback) takes over.
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

    /* Layer 1: AI artwork, or a pure-CSS mesh gradient when there's none. */
    .bg-layer {
        position: absolute;
        inset: 0;
        @if ($backgroundImage)
            background-image: url({{ $backgroundImage }});
            background-size: cover;
            background-position: center;
        @else
            background:
                radial-gradient(at 15% 15%, color-mix(in srgb, var(--accent) 55%, transparent) 0px, transparent 55%),
                radial-gradient(at 85% 10%, color-mix(in srgb, var(--text) 25%, transparent) 0px, transparent 50%),
                radial-gradient(at 80% 90%, color-mix(in srgb, var(--accent) 40%, transparent) 0px, transparent 55%),
                radial-gradient(at 10% 95%, color-mix(in srgb, var(--text) 15%, transparent) 0px, transparent 50%),
                var(--bg);
        @endif
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
        font-size: var(--fs-meta);
        font-weight: 700;
        letter-spacing: 3px;
        text-transform: uppercase;
        color: var(--accent);
    }

    .headline {
        font-family: 'Anton', sans-serif;
        font-size: var(--fs-headline);
        line-height: 0.95;
        text-transform: uppercase;
        letter-spacing: 1px;
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

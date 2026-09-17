{{--
    Shell for tournament posters: fonts inlined as data URIs (no network in
    the render), palette tokens, a film-grain overlay, and a fit-text pass that
    shrinks any [data-fit] element until it fits its box before the screenshot.
--}}
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
    @font-face { font-family: 'Anton'; src: url(data:font/ttf;base64,{{ $fonts['anton'] }}) format('truetype'); }
    @font-face { font-family: 'Bebas'; src: url(data:font/ttf;base64,{{ $fonts['bebas'] }}) format('truetype'); }
    @font-face { font-family: 'Oswald'; src: url(data:font/ttf;base64,{{ $fonts['oswald'] }}) format('truetype'); font-weight: 200 700; }
    @font-face { font-family: 'Inter'; src: url(data:font/ttf;base64,{{ $fonts['inter'] }}) format('truetype'); font-weight: 100 900; }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    :root {
        --deep: {{ $palette['deep'] }};
        --primary: {{ $palette['primary'] }};
        --accent: {{ $palette['accent'] }};
        --accent2: {{ $palette['accent2'] }};
    }

    html, body {
        width: 1080px;
        height: 1350px;
        overflow: hidden;
        background: var(--deep);
        color: #fff;
        font-family: 'Inter', sans-serif;
        -webkit-font-smoothing: antialiased;
    }

    .poster { position: relative; width: 1080px; height: 1350px; overflow: hidden; }
    .layer { position: absolute; inset: 0; }
    .ai-bg { background-size: cover; background-position: center; }

    .grain {
        position: absolute; inset: 0; pointer-events: none; z-index: 50;
        opacity: .09; mix-blend-mode: overlay;
        background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
    }

    .icon { width: 1em; height: 1em; flex-shrink: 0; }
    .logo-round { border-radius: 50%; overflow: hidden; background: #fff; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .logo-round img { width: 100%; height: 100%; object-fit: cover; }
    .qr-img { display: block; width: 100%; height: auto; }

    @yield('styles')
</style>
</head>
<body>
<div class="poster">
    @yield('body')
    <div class="grain"></div>
</div>
<script>
    document.querySelectorAll('[data-fit]').forEach(function (el) {
        var max = +el.dataset.max, min = +el.dataset.min || 40, lines = +el.dataset.lines || 2;
        for (var size = max; size >= min; size -= 2) {
            el.style.fontSize = size + 'px';
            var lh = parseFloat(getComputedStyle(el).lineHeight) || size;
            if (Math.round(el.scrollHeight / lh) <= lines && el.scrollWidth <= el.clientWidth + 1) break;
        }
    });
</script>
</body>
</html>

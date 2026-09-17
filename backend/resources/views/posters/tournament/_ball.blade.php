{{-- Rendered sport ball (cricket or football), sized by its container. --}}
@php $uid = 'b'.random_int(1000, 9999); @endphp
@if($sport === 'cricket')
<svg viewBox="0 0 200 200" width="100%" height="100%">
    <defs>
        <radialGradient id="{{ $uid }}g" cx="34%" cy="28%" r="80%">
            <stop offset="0" stop-color="#ff7a66"/>
            <stop offset=".35" stop-color="#d0142c"/>
            <stop offset=".8" stop-color="#6d0014"/>
            <stop offset="1" stop-color="#2b0007"/>
        </radialGradient>
        <clipPath id="{{ $uid }}c"><circle cx="100" cy="100" r="96"/></clipPath>
    </defs>
    <circle cx="100" cy="100" r="96" fill="url(#{{ $uid }}g)"/>
    <g clip-path="url(#{{ $uid }}c)" fill="none" stroke-linecap="round">
        <path d="M58 0 C112 58 112 142 58 200" stroke="#3a0008" stroke-width="10" opacity=".35"/>
        <path d="M58 0 C112 58 112 142 58 200" stroke="#f3dfbf" stroke-width="2.4"/>
        <path d="M74 0 C128 58 128 142 74 200" stroke="#f3dfbf" stroke-width="2.4"/>
        <path d="M50 0 C104 58 104 142 50 200" stroke="#f3dfbf" stroke-width="4" stroke-dasharray="1.5 7"/>
        <path d="M82 0 C136 58 136 142 82 200" stroke="#f3dfbf" stroke-width="4" stroke-dasharray="1.5 7"/>
    </g>
    <ellipse cx="66" cy="56" rx="34" ry="18" fill="#fff" opacity=".28" transform="rotate(-35 66 56)"/>
</svg>
@else
@php
    $pent = function (float $cx, float $cy, float $r, float $rot) {
        $pts = [];
        for ($i = 0; $i < 5; $i++) {
            $a = deg2rad($rot + $i * 72);
            $pts[] = round($cx + $r * cos($a), 2).','.round($cy + $r * sin($a), 2);
        }
        return implode(' ', $pts);
    };
@endphp
<svg viewBox="0 0 200 200" width="100%" height="100%">
    <defs>
        <radialGradient id="{{ $uid }}g" cx="35%" cy="30%" r="80%">
            <stop offset="0" stop-color="#ffffff"/>
            <stop offset=".55" stop-color="#e3e8ec"/>
            <stop offset=".9" stop-color="#8d98a3"/>
            <stop offset="1" stop-color="#4b5560"/>
        </radialGradient>
        <radialGradient id="{{ $uid }}s" cx="35%" cy="30%" r="85%">
            <stop offset=".6" stop-color="#000" stop-opacity="0"/>
            <stop offset="1" stop-color="#000" stop-opacity=".45"/>
        </radialGradient>
        <clipPath id="{{ $uid }}c"><circle cx="100" cy="100" r="96"/></clipPath>
    </defs>
    <circle cx="100" cy="100" r="96" fill="url(#{{ $uid }}g)"/>
    <g clip-path="url(#{{ $uid }}c)">
        @for($i = 0; $i < 5; $i++)
            @php
                $a = deg2rad(-90 + $i * 72);
                $ix = 100 + 30 * cos($a); $iy = 100 + 30 * sin($a);
                $ox = 100 + 64 * cos($a); $oy = 100 + 64 * sin($a);
                $pcx = 100 + 92 * cos($a); $pcy = 100 + 92 * sin($a);
                $b = deg2rad(-54 + $i * 72);
                $ex = 100 + 118 * cos($b); $ey = 100 + 118 * sin($b);
                $mx = 100 + 78 * cos($b); $my = 100 + 78 * sin($b);
            @endphp
            <line x1="{{ $ix }}" y1="{{ $iy }}" x2="{{ $ox }}" y2="{{ $oy }}" stroke="#1f2328" stroke-width="2.5"/>
            <polygon points="{{ $pent($pcx, $pcy, 28, -90 + $i * 72 + 36) }}" fill="#15181c"/>
            <line x1="{{ $mx }}" y1="{{ $my }}" x2="{{ $ex }}" y2="{{ $ey }}" stroke="#1f2328" stroke-width="2.5"/>
        @endfor
        <polygon points="{{ $pent(100, 100, 30, -90) }}" fill="#15181c"/>
        @for($i = 0; $i < 5; $i++)
            @php
                $a1 = deg2rad(-90 + $i * 72); $a2 = deg2rad(-90 + ($i + 1) * 72);
                $x1 = 100 + 64 * cos($a1); $y1 = 100 + 64 * sin($a1);
                $b = deg2rad(-54 + $i * 72);
                $mx = 100 + 78 * cos($b); $my = 100 + 78 * sin($b);
                $x2 = 100 + 64 * cos($a2); $y2 = 100 + 64 * sin($a2);
            @endphp
            <polyline points="{{ $x1 }},{{ $y1 }} {{ $mx }},{{ $my }} {{ $x2 }},{{ $y2 }}" fill="none" stroke="#1f2328" stroke-width="2.5"/>
        @endfor
    </g>
    <circle cx="100" cy="100" r="96" fill="url(#{{ $uid }}s)"/>
    <ellipse cx="68" cy="54" rx="30" ry="15" fill="#fff" opacity=".55" transform="rotate(-35 68 54)"/>
</svg>
@endif

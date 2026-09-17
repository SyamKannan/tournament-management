{{-- CLASSIC — black and gold championship: framed border, lit trophy, centred serif-free display type. --}}
@extends('posters.tournament._base')

@section('styles')
    .base { background:
        radial-gradient(ellipse 60% 40% at 50% 30%, color-mix(in srgb, var(--accent) 22%, transparent) 0%, transparent 70%),
        radial-gradient(ellipse 90% 60% at 50% 100%, color-mix(in srgb, var(--primary) 90%, transparent) 0%, transparent 70%),
        var(--deep); }
    .ai-bg { opacity:.9; }
    .ai-shade { background: linear-gradient(180deg, rgba(0,0,0,.55) 0%, rgba(0,0,0,.1) 30%, rgba(0,0,0,.35) 50%, rgba(7,8,10,.94) 68%, #07080a 100%); }
    .rays { position:absolute; left:50%; top:380px; width:1600px; height:1600px; margin:-800px 0 0 -800px; opacity:.16;
        background: repeating-conic-gradient(from 0deg, var(--accent) 0deg 4deg, transparent 4deg 16deg);
        -webkit-mask-image: radial-gradient(circle, #000 0%, transparent 45%); }
    .sparkle { position:absolute; border-radius:50%; background: var(--accent); filter: blur(1px); }

    .frame { position:absolute; inset:28px; border:2px solid color-mix(in srgb, var(--accent) 70%, transparent); z-index:4; pointer-events:none; }
    .frame:after { content:''; position:absolute; inset:10px; border:1px solid color-mix(in srgb, var(--accent) 35%, transparent); }
    .corner { position:absolute; width:46px; height:46px; border-color: var(--accent); border-style: solid; z-index:5; }

    .gold-text { background: linear-gradient(180deg, #fff3c4 0%, #f2cf6b 38%, #c8962e 62%, #f7e08f 100%); -webkit-background-clip:text; background-clip:text; color:transparent; }

    .head { position:absolute; top:70px; left:0; right:0; text-align:center; z-index:6; display:flex; flex-direction:column; align-items:center; }
    .head .logo-round { width:84px; height:84px; border:3px solid var(--accent); box-shadow: 0 0 0 6px rgba(0,0,0,.4); }
    .head b { margin-top:14px; font-family:'Oswald'; font-weight:600; font-size:28px; letter-spacing:6px; text-transform:uppercase; color: var(--accent2); }
    .head small { font-family:'Oswald'; font-weight:400; font-size:18px; letter-spacing:10px; text-transform:uppercase; color: var(--accent); }

    .trophy { position:absolute; left:50%; top:250px; width:280px; height:336px; margin-left:-140px; z-index:5;
        filter: drop-shadow(0 30px 40px rgba(0,0,0,.7)) drop-shadow(0 0 50px color-mix(in srgb, var(--accent) 45%, transparent)); }

    .main { position:absolute; left:90px; right:90px; top:600px; z-index:6; text-align:center; display:flex; flex-direction:column; align-items:center; }
    .season { font-family:'Oswald'; font-weight:500; font-size:22px; letter-spacing:12px; text-transform:uppercase; color: var(--accent2); }
    .title { width:100%; font-family:'Anton'; text-transform:uppercase; line-height:1; letter-spacing:2px; margin-top:10px;
        filter: drop-shadow(0 4px 0 rgba(0,0,0,.6)); }
    .divider { display:flex; align-items:center; gap:16px; margin:20px 0 6px; width:560px; }
    .divider:before, .divider:after { content:''; flex:1; height:2px; background: linear-gradient(90deg, transparent, var(--accent), transparent); }
    .divider i { width:14px; height:14px; background: var(--accent); transform: rotate(45deg); }
    .tag { font-family:'Oswald'; font-weight:400; font-size:26px; letter-spacing:6px; text-transform:uppercase; color: rgba(255,244,214,.8); }

    .cols { display:flex; border-top:1px solid color-mix(in srgb, var(--accent) 45%, transparent); border-bottom:1px solid color-mix(in srgb, var(--accent) 45%, transparent); }
    .col { flex:1; padding:18px 12px; text-align:center; min-width:0; }
    .col + .col { border-left:1px solid color-mix(in srgb, var(--accent) 45%, transparent); }
    .col small { display:flex; justify-content:center; align-items:center; gap:8px; font-family:'Oswald'; font-size:17px; letter-spacing:4px; text-transform:uppercase; color: var(--accent); }
    .col b { margin-top:6px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; font-family:'Oswald'; font-weight:600; font-size:27px; line-height:1.15; color:#fff; }

    .lower { position:absolute; left:90px; right:90px; bottom:72px; z-index:6; display:flex; flex-direction:column; gap:30px; }
    .bottom { display:flex; align-items:flex-end; justify-content:space-between; gap:30px; }
    .purse small { display:block; font-family:'Oswald'; font-size:20px; letter-spacing:8px; text-transform:uppercase; color: var(--accent2); }
    .purse b { display:block; font-family:'Anton'; font-size:100px; line-height:1; }
    .purse em { display:block; font-style:normal; font-family:'Oswald'; font-size:22px; letter-spacing:2px; color: rgba(255,244,214,.75); }
    .reg { display:flex; align-items:center; gap:22px; }
    .reg .txt { text-align:right; font-family:'Oswald'; }
    .reg .txt small { display:block; font-size:18px; letter-spacing:5px; text-transform:uppercase; color: var(--accent); }
    .reg .txt b { display:block; font-size:30px; font-weight:700; color:#fff; }
    .reg .txt span { display:block; font-size:18px; letter-spacing:2px; color: rgba(255,244,214,.7); text-transform:uppercase; }
    .qr-card { background:#fff; padding:12px; border:3px solid var(--accent); box-shadow: 0 0 0 6px #07080a, 0 0 0 8px color-mix(in srgb, var(--accent) 60%, transparent); }
    .qr-label { display:none; }
@endsection

@section('body')
    <div class="layer base"></div>
    @if($backgroundImage)
        <div class="layer ai-bg" style="background-image:url('{{ $backgroundImage }}')"></div>
        <div class="layer ai-shade"></div>
    @else
        <div class="rays"></div>
        @foreach([[180, 300, 6], [880, 260, 8], [240, 560, 4], [830, 520, 5], [140, 820, 3], [940, 760, 4], [360, 220, 3], [720, 180, 4]] as [$x, $y, $r])
            <div class="sparkle" style="left:{{ $x }}px; top:{{ $y }}px; width:{{ $r * 2 }}px; height:{{ $r * 2 }}px; box-shadow:0 0 {{ $r * 6 }}px {{ $r * 2 }}px color-mix(in srgb, var(--accent) 60%, transparent)"></div>
        @endforeach
        <div class="trophy">
            <svg viewBox="0 0 300 360" width="100%" height="100%">
                <defs>
                    <linearGradient id="gold" x1="0" x2="1" y1="0" y2="0">
                        <stop offset="0" stop-color="#8a5a12"/><stop offset=".25" stop-color="#f7dc84"/><stop offset=".45" stop-color="#fff6cf"/>
                        <stop offset=".6" stop-color="#e2b04a"/><stop offset="1" stop-color="#7a4d0c"/>
                    </linearGradient>
                    <linearGradient id="goldV" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0" stop-color="#fff1b8"/><stop offset="1" stop-color="#a8721c"/>
                    </linearGradient>
                </defs>
                <path d="M78 48 H40 C28 48 22 60 25 76 C32 118 58 140 92 146" fill="none" stroke="url(#goldV)" stroke-width="13" stroke-linecap="round"/>
                <path d="M222 48 H260 C272 48 278 60 275 76 C268 118 242 140 208 146" fill="none" stroke="url(#goldV)" stroke-width="13" stroke-linecap="round"/>
                <path d="M62 26 H238 V100 C238 170 200 210 150 214 C100 210 62 170 62 100 Z" fill="url(#gold)"/>
                <rect x="56" y="18" width="188" height="16" rx="4" fill="url(#goldV)"/>
                <path d="M150 70 l10.6 21.5 23.7 3.4 -17.1 16.7 4 23.6 -21.2 -11.1 -21.2 11.1 4 -23.6 -17.1 -16.7 23.7 -3.4 Z" fill="#7a4d0c" opacity=".55"/>
                <path d="M90 40 C84 100 96 160 130 200" fill="none" stroke="#fff" stroke-width="7" opacity=".35" stroke-linecap="round"/>
                <rect x="136" y="212" width="28" height="44" fill="url(#gold)"/>
                <ellipse cx="150" cy="236" rx="26" ry="9" fill="url(#goldV)"/>
                <path d="M100 256 H200 L214 300 H86 Z" fill="url(#gold)"/>
                <rect x="66" y="300" width="168" height="40" rx="3" fill="#1b140a" stroke="url(#goldV)" stroke-width="3"/>
                <rect x="104" y="312" width="92" height="16" rx="2" fill="url(#goldV)" opacity=".85"/>
            </svg>
        </div>
    @endif

    <div class="frame"></div>
    <div class="corner" style="top:20px; left:20px; border-width:4px 0 0 4px"></div>
    <div class="corner" style="top:20px; right:20px; border-width:4px 4px 0 0"></div>
    <div class="corner" style="bottom:20px; left:20px; border-width:0 0 4px 4px"></div>
    <div class="corner" style="bottom:20px; right:20px; border-width:0 4px 4px 0"></div>

    <div class="head">
        @include('posters.tournament._logo')
        <b>{{ $orgName }}</b>
        <small>Proudly Presents</small>
    </div>

    <div class="main">
        <div class="season">{{ $sport }} Championship</div>
        <div class="title gold-text" data-fit data-max="104" data-min="54" data-lines="2">{{ $name }}</div>
        <div class="divider"><i></i></div>
        <div class="tag">{{ $tagline }}</div>
    </div>

    <div class="lower">
    <div class="cols">
        @if($dateRange)<div class="col"><small>@include('posters.tournament._icon', ['name' => 'calendar']) Dates</small><b>{{ $dateRange }}</b></div>@endif
        @if($venue)<div class="col" style="flex:1.4"><small>@include('posters.tournament._icon', ['name' => 'pin']) Venue</small><b>{{ $venue }}</b></div>@endif
        <div class="col"><small>@include('posters.tournament._icon', ['name' => 'ticket']) Entry</small><b>{{ $entryFee }}</b></div>
    </div>

    <div class="bottom">
        <div class="purse">
            @if($prize)
                <small>Prize Purse</small>
                <b class="gold-text">{{ $prize }}</b>
                @if($runnerUp)<em>Runner-up {{ $runnerUp }}</em>@endif
            @else
                <small>{{ $format }}</small>
                <b class="gold-text">{{ $maxTeams }} Teams</b>
            @endif
        </div>
        <div class="reg">
            <div class="txt">
                <small>Registrations Open</small>
                @if($contact)<b>{{ $contact }}</b>@endif
                <span>{{ $registrationQr ? 'Scan to register' : $maxTeams.' teams' }}{{ $closing ? ' · by '.$closing : '' }}</span>
            </div>
            @include('posters.tournament._qr', ['size' => 180])
        </div>
    </div>
    </div>
@endsection

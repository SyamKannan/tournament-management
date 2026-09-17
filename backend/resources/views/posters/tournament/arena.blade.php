{{-- ARENA — night-stadium key art, towering condensed title, gold prize hero, glass info deck. --}}
@extends('posters.tournament._base')

@section('styles')
    .sky { background:
        radial-gradient(ellipse 70% 45% at 50% 8%, color-mix(in srgb, var(--primary) 85%, white 15%) 0%, transparent 70%),
        radial-gradient(ellipse 120% 70% at 50% 100%, color-mix(in srgb, var(--primary) 55%, black) 0%, transparent 70%),
        linear-gradient(180deg, color-mix(in srgb, var(--primary) 45%, var(--deep)) 0%, var(--deep) 75%); }

    .flood { position:absolute; top:-40px; width:900px; height:1100px; opacity:.55;
        background: conic-gradient(from 160deg at 50% 0%, transparent 0deg, rgba(255,255,255,.22) 12deg, rgba(255,255,255,.04) 26deg, transparent 40deg);
        filter: blur(6px); }
    .flood.l { left:-380px; transform: rotate(-8deg); }
    .flood.r { right:-380px; transform: scaleX(-1) rotate(-8deg); }
    .lamp { position:absolute; top:34px; width:150px; height:34px; border-radius:8px;
        background: repeating-linear-gradient(90deg, #fff 0 18px, rgba(255,255,255,.35) 18px 24px);
        box-shadow: 0 0 60px 30px rgba(255,255,255,.35), 0 0 180px 80px color-mix(in srgb, var(--accent) 25%, transparent); }

    .pitch { position:absolute; left:-60%; right:-60%; bottom:-380px; height:980px;
        transform: perspective(700px) rotateX(64deg);
        background:
            linear-gradient(90deg, transparent 49.8%, rgba(255,255,255,.35) 49.8% 50.2%, transparent 50.2%),
            repeating-linear-gradient(90deg, #15803d 0 120px, #166534 120px 240px);
        -webkit-mask-image: linear-gradient(to top, #000 20%, transparent 85%); opacity:.75; }

    .ball-wrap { position:absolute; right:-70px; top:170px; width:520px; height:520px; transform: rotate(-18deg);
        filter: drop-shadow(0 40px 60px rgba(0,0,0,.6)) drop-shadow(0 0 60px color-mix(in srgb, var(--accent) 35%, transparent)); }
    .streak { position:absolute; height:14px; border-radius:14px; right:380px;
        background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent) 90%, white)); opacity:.75; transform: rotate(-18deg); }

    .shade { background: linear-gradient(180deg, rgba(0,0,0,.55) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 38%, color-mix(in srgb, var(--deep) 70%, transparent) 58%, var(--deep) 84%); }

    .top { position:absolute; top:52px; left:60px; right:60px; display:flex; justify-content:space-between; align-items:center; z-index:5; }
    .org { display:flex; align-items:center; gap:18px; }
    .org .logo-round { width:86px; height:86px; border:4px solid var(--accent); }
    .org small { display:block; font-family:'Oswald'; font-weight:500; font-size:20px; letter-spacing:6px; color:var(--accent); text-transform:uppercase; }
    .org b { display:block; font-family:'Oswald'; font-weight:700; font-size:34px; line-height:1.1; max-width:560px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-transform:uppercase; }
    .sport-pill { font-family:'Oswald'; font-weight:700; font-size:24px; letter-spacing:5px; text-transform:uppercase;
        padding:12px 26px; border-radius:999px; background:rgba(255,255,255,.1); border:2px solid rgba(255,255,255,.35); backdrop-filter: blur(6px); }

    .stack { position:absolute; left:60px; right:60px; bottom:132px; z-index:5; display:flex; flex-direction:column; gap:34px; }
    .tagline { display:flex; align-items:center; gap:18px; font-family:'Oswald'; font-weight:600; font-size:26px; letter-spacing:8px; text-transform:uppercase; color:var(--accent); }
    .tagline:before { content:''; width:70px; height:4px; background:var(--accent); }
    .title { font-family:'Anton'; text-transform:uppercase; line-height:.92; letter-spacing:1px; margin-top:14px; width:960px;
        background: linear-gradient(180deg, #ffffff 0%, #ffffff 55%, color-mix(in srgb, var(--accent) 55%, white) 100%);
        -webkit-background-clip:text; background-clip:text; color:transparent;
        filter: drop-shadow(0 8px 0 rgba(0,0,0,.45)); }
    .title span { display:block; width:100%; }

    .date-ribbon { display:inline-flex; align-items:center; gap:14px; margin-top:22px; padding:12px 30px 12px 26px;
        background:var(--accent); color:#0a0a0a; font-family:'Oswald'; font-weight:700; font-size:34px; letter-spacing:2px; text-transform:uppercase;
        clip-path: polygon(0 0, 100% 0, calc(100% - 22px) 100%, 0 100%); }

    .deck { display:flex; gap:24px; align-items:stretch; }
    .panel { flex:1; border-radius:28px; padding:26px 30px; background:rgba(255,255,255,.08); border:1.5px solid rgba(255,255,255,.18);
        backdrop-filter: blur(14px); display:flex; flex-direction:column; gap:18px; }
    .prize-row { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; padding-bottom:16px; border-bottom:1.5px dashed rgba(255,255,255,.25); }
    .prize-row .lbl { font-family:'Oswald'; font-weight:600; font-size:20px; letter-spacing:5px; text-transform:uppercase; color:rgba(255,255,255,.75); display:flex; gap:10px; align-items:center; }
    .prize-row .lbl .icon { color:var(--accent); font-size:26px; }
    .prize-amt { font-family:'Anton'; font-size:92px; line-height:.9;
        background: linear-gradient(180deg, #fff6c2 0%, #ffd23f 45%, #e79a00 100%); -webkit-background-clip:text; background-clip:text; color:transparent;
    }
    .runner { font-family:'Oswald'; font-weight:500; font-size:22px; color:rgba(255,255,255,.8); text-align:right; }
    .runner b { color:#fff; font-weight:700; }
    .facts { display:grid; grid-template-columns: 1fr 1fr; gap:14px 22px; }
    .fact { display:flex; align-items:center; gap:14px; min-width:0; }
    .fact .ic { width:48px; height:48px; border-radius:14px; background:var(--accent); color:#0a0a0a; display:flex; align-items:center; justify-content:center; font-size:26px; flex-shrink:0; }
    .fact small { display:block; font-family:'Oswald'; font-size:16px; letter-spacing:3px; text-transform:uppercase; color:rgba(255,255,255,.6); }
    .fact b { display:block; font-family:'Oswald'; font-weight:700; font-size:27px; line-height:1.15; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .fact.wide { grid-column: span 2; }

    .qr-card { border-radius:28px; background:#fff; padding:18px 18px 14px; display:flex; flex-direction:column; align-items:center; justify-content:center;
        box-shadow: 0 0 0 6px var(--accent), 0 30px 60px rgba(0,0,0,.5); }
    .qr-frame { width:100%; }
    .qr-label { margin-top:8px; font-family:'Anton'; font-size:25px; letter-spacing:1px; color:#0a0a0a; text-transform:uppercase; }

    .footer { position:absolute; left:0; right:0; bottom:0; height:104px; z-index:6; display:flex; align-items:center; justify-content:space-between; padding:0 60px;
        background: linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 70%, white)); color:#0a0a0a; }
    .footer .cta { font-family:'Anton'; font-size:44px; letter-spacing:1px; text-transform:uppercase; }
    .footer .contact { text-align:right; font-family:'Oswald'; }
    .footer .contact b { display:flex; gap:10px; align-items:center; justify-content:flex-end; font-size:34px; font-weight:700; }
    .footer .contact small { font-size:18px; font-weight:600; letter-spacing:2px; text-transform:uppercase; opacity:.75; }
@endsection

@section('body')
    @if($backgroundImage)
        <div class="layer ai-bg" style="background-image:url('{{ $backgroundImage }}')"></div>
    @else
        <div class="layer sky"></div>
        <div class="pitch"></div>
        <div class="flood l"></div><div class="flood r"></div>
                <div class="streak" style="top:420px; width:420px"></div>
        <div class="streak" style="top:470px; width:300px; opacity:.45"></div>
        <div class="streak" style="top:520px; width:220px; opacity:.3"></div>
        <div class="ball-wrap">@include('posters.tournament._ball', ['sport' => $sport])</div>
    @endif
    <div class="layer shade"></div>

    <div class="top">
        <div class="org">
            @include('posters.tournament._logo')
            <div><small>Presented by</small><b>{{ $orgName }}</b></div>
        </div>
        <div class="sport-pill">{{ $sport }}</div>
    </div>

    <div class="stack">
    <div class="hero">
        <div class="tagline">{{ $tagline }}</div>
        <div class="title"><span data-fit data-max="140" data-min="64" data-lines="2">{{ $name }}</span></div>
        @if($dateRange)
            <div class="date-ribbon">@include('posters.tournament._icon', ['name' => 'calendar']) {{ $dateRange }}</div>
        @endif
    </div>

    <div class="deck">
        <div class="panel">
            @if($prize)
                <div class="prize-row">
                    <div>
                        <div class="lbl">@include('posters.tournament._icon', ['name' => 'trophy']) Prize Money</div>
                        <div class="prize-amt">{{ $prize }}</div>
                    </div>
                    @if($runnerUp)<div class="runner">Runner-up<br><b>{{ $runnerUp }}</b></div>@endif
                </div>
            @endif
            <div class="facts">
                @if($venue)
                    <div class="fact wide"><div class="ic">@include('posters.tournament._icon', ['name' => 'pin'])</div><div style="min-width:0"><small>Venue</small><b>{{ $venue }}</b></div></div>
                @endif
                <div class="fact"><div class="ic">@include('posters.tournament._icon', ['name' => 'grid'])</div><div style="min-width:0"><small>Format</small><b>{{ $format }}</b></div></div>
                <div class="fact"><div class="ic">@include('posters.tournament._icon', ['name' => 'ticket'])</div><div style="min-width:0"><small>Entry Fee</small><b>{{ $entryFee }}</b></div></div>
                @unless($prize)
                    <div class="fact"><div class="ic">@include('posters.tournament._icon', ['name' => 'users'])</div><div style="min-width:0"><small>Teams</small><b>{{ $maxTeams }} Teams</b></div></div>
                    @if($closing)<div class="fact"><div class="ic">@include('posters.tournament._icon', ['name' => 'calendar'])</div><div style="min-width:0"><small>Closes</small><b>{{ $closing }}</b></div></div>@endif
                @endunless
            </div>
        </div>
        @include('posters.tournament._qr', ['size' => 270])
    </div>
    </div>

    <div class="footer">
        <div>
            <div class="cta">Registrations Open</div>
            <div style="font-family:'Oswald'; font-weight:600; font-size:18px; letter-spacing:3px; text-transform:uppercase; opacity:.75; margin-top:-2px">
                Only {{ $maxTeams }} team slots{{ $closing ? ' · closes '.$closing : '' }}
            </div>
        </div>
        @if($contact)
            <div class="contact">
                <small>{{ $contactPerson ?: 'Call / WhatsApp' }}</small>
                <b>@include('posters.tournament._icon', ['name' => 'phone']) {{ $contact }}</b>
            </div>
        @endif
    </div>
@endsection

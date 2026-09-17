{{-- SPLIT — bold diagonal colour block, oversized outlined sport word, left-aligned editorial type. --}}
@extends('posters.tournament._base')

@section('styles')
    .base { background: var(--deep); }
    .art { position:absolute; top:0; right:0; width:62%; height:900px; overflow:hidden;
        clip-path: polygon(40% 0, 100% 0, 100% 100%, 10% 100%);
        background:
            radial-gradient(circle at 60% 45%, color-mix(in srgb, var(--accent) 55%, var(--primary)) 0%, var(--primary) 45%, color-mix(in srgb, var(--primary) 55%, black) 100%); }
    .art.ai { background-size: cover; background-position: center; }
    .art:after { content:''; position:absolute; inset:0;
        background: repeating-linear-gradient(-60deg, rgba(255,255,255,.07) 0 3px, transparent 3px 22px); }
    .art .ball { position:absolute; right:40px; top:150px; width:470px; height:470px; transform: rotate(14deg);
        filter: drop-shadow(-30px 40px 40px rgba(0,0,0,.55)); z-index:2; }
    .art .ring { position:absolute; right:-40px; top:70px; width:630px; height:630px; border-radius:50%; border:3px solid rgba(255,255,255,.25); }
    .art .ring.two { right:40px; top:150px; width:470px; height:470px; border:18px solid rgba(0,0,0,.12); }
    .stripe { position:absolute; top:0; height:900px; width:40px; left:630px; background:var(--accent); transform: skewX(-12.6deg); transform-origin: top; }

    .top { position:absolute; top:56px; left:60px; z-index:5; display:flex; align-items:center; gap:16px; max-width:470px; }
    .top .logo-round { width:74px; height:74px; }
    .top b { font-family:'Oswald'; font-weight:700; font-size:26px; line-height:1.1; text-transform:uppercase; }
    .top small { display:block; font-family:'Oswald'; font-weight:500; font-size:16px; letter-spacing:5px; color:var(--accent); text-transform:uppercase; }

    .season { position:absolute; left:60px; top:210px; z-index:5; font-family:'Oswald'; font-weight:700; font-size:24px; letter-spacing:6px; text-transform:uppercase;
        background: var(--accent); color:#0a0a0a; padding:8px 18px; }

    .title-wrap { position:absolute; left:60px; top:280px; width:440px; height:580px; z-index:5; display:flex; flex-direction:column; justify-content:center; }
    .title { font-family:'Bebas'; text-transform:uppercase; line-height:.88; color:#fff; width:100%; text-shadow: 0 6px 0 rgba(0,0,0,.35); }
    .bar { width:140px; height:12px; background:var(--primary); margin-top:26px; box-shadow: 160px 0 0 var(--accent); }
    .tag { margin-top:24px; font-family:'Oswald'; font-weight:500; font-size:30px; color:rgba(255,255,255,.8); text-transform:uppercase; letter-spacing:3px; }

    .prize { position:absolute; right:60px; top:700px; z-index:6; transform: rotate(-4deg); background: var(--accent); color:#0a0a0a;
        padding:18px 34px 20px; box-shadow: 12px 12px 0 var(--primary); text-align:center; }
    .prize small { display:block; font-family:'Oswald'; font-weight:700; font-size:22px; letter-spacing:6px; text-transform:uppercase; }
    .prize b { display:block; font-family:'Anton'; font-size:96px; line-height:.95; }
    .prize em { display:block; font-style:normal; font-family:'Oswald'; font-weight:600; font-size:22px; }

    .facts { position:absolute; left:60px; top:900px; width:560px; z-index:5; display:flex; flex-direction:column; gap:20px; }
    .fact { display:flex; align-items:center; gap:18px; }
    .fact .ic { width:58px; height:58px; border-radius:50%; border:3px solid var(--accent); color:var(--accent); display:flex; align-items:center; justify-content:center; font-size:26px; flex-shrink:0; }
    .fact small { display:block; font-family:'Oswald'; font-size:17px; letter-spacing:4px; text-transform:uppercase; color:rgba(255,255,255,.55); }
    .fact b { display:block; font-family:'Oswald'; font-weight:700; font-size:32px; line-height:1.1; text-transform:uppercase; max-width:640px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }

    .qr-card { position:absolute; right:60px; bottom:146px; z-index:6; background:#fff; padding:16px 16px 10px; text-align:center; border-top:10px solid var(--primary); }
    .qr-label { font-family:'Anton'; color:#0a0a0a; font-size:24px; text-transform:uppercase; margin-top:6px; }

    .footer { position:absolute; left:0; right:0; bottom:0; height:118px; z-index:5; background:#fff; color:#0a0a0a;
        display:flex; align-items:center; justify-content:space-between; padding:0 60px; }
    .footer .cta { font-family:'Anton'; font-size:48px; text-transform:uppercase; line-height:1; }
    .footer .cta span { color: var(--primary); }
    .footer .sub { font-family:'Oswald'; font-weight:600; font-size:19px; letter-spacing:3px; text-transform:uppercase; opacity:.65; margin-top:4px; }
    .footer .phone { font-family:'Oswald'; font-weight:700; font-size:36px; display:flex; align-items:center; gap:10px; }
@endsection

@section('body')
    <div class="layer base"></div>
    @if($backgroundImage)
        <div class="art ai" style="background-image:url('{{ $backgroundImage }}')"></div>
    @else
        <div class="art">
            <div class="ring"></div><div class="ring two"></div>
            <div class="ball">@include('posters.tournament._ball', ['sport' => $sport])</div>
        </div>
    @endif
    <div class="stripe"></div>

    <div class="top">
        @include('posters.tournament._logo')
        <div><small>Presents</small><b>{{ $orgName }}</b></div>
    </div>

    <div class="season">{{ $sport }} Tournament</div>

    <div class="title-wrap">
        <div class="title" data-fit data-max="170" data-min="70" data-lines="4">{{ $name }}</div>
        <div class="bar"></div>
        <div class="tag">{{ $tagline }}</div>
    </div>

    @if($prize)
        <div class="prize">
            <small>Winner Takes</small>
            <b>{{ $prize }}</b>
            @if($runnerUp)<em>Runner-up {{ $runnerUp }}</em>@endif
        </div>
    @endif

    <div class="facts">
        @if($dateRange)
            <div class="fact"><div class="ic">@include('posters.tournament._icon', ['name' => 'calendar'])</div><div><small>Match Days</small><b>{{ $dateRange }}</b></div></div>
        @endif
        @if($venue)
            <div class="fact"><div class="ic">@include('posters.tournament._icon', ['name' => 'pin'])</div><div><small>Venue</small><b>{{ $venue }}</b></div></div>
        @endif
        <div class="fact"><div class="ic">@include('posters.tournament._icon', ['name' => 'ticket'])</div><div><small>Entry Fee · {{ $format }}</small><b>{{ $entryFee }} per team</b></div></div>
    </div>

    @include('posters.tournament._qr', ['size' => 220])

    <div class="footer">
        <div>
            <div class="cta">Register <span>Now</span></div>
            <div class="sub">{{ $maxTeams }} slots only{{ $closing ? ' · closes '.$closing : '' }}</div>
        </div>
        @if($contact)
            <div class="phone">@include('posters.tournament._icon', ['name' => 'phone']) {{ $contact }}</div>
        @endif
    </div>
@endsection

@extends('posters.layout')

@section('content')
<div class="eyebrow">{{ $tournament['name'] }} &middot; TOSS</div>
<div class="headline" style="margin-top:20px;">{{ $headline }}</div>
<div class="subhead" style="margin-top:16px;">{{ $subhead }}</div>

{{-- Hero: the toss decision, the one fact this poster exists to announce. --}}
<div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:28px;">
    @include('posters.partials._logo-circle', ['team' => $winnerTeam, 'size' => 220])
    <div class="body-text" style="text-align:center; font-size:34px; font-weight:700;">{{ $winnerTeam['name'] }}</div>
    <div style="font-family:'Anton',sans-serif; font-size:88px; color:var(--accent); text-align:center; text-transform:uppercase;">
        ELECTED TO {{ strtoupper($decision) }}
    </div>
</div>

<div class="body-text" style="text-align:center;">{{ $matchMeta }}</div>
@endsection

@section('footer')
    @include('posters.partials._footer')
@endsection

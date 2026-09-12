@extends('posters.layout')

@section('content')
<div class="eyebrow">{{ $tournament['name'] }} &middot; TOSS</div>

<div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:32px;">
    @include('posters.partials._logo-circle', ['team' => $winnerTeam, 'size' => 180])

    {{-- Hero: the toss decision — the one fact this poster exists to announce. --}}
    <div class="headline" style="text-align:center;">{{ $headline }}</div>
    <div class="subhead" style="text-align:center;">{{ $subhead }}</div>

    <div class="body-text">{{ $winnerTeam['name'] }} elected to {{ $decision }}</div>
</div>

<div class="meta" style="text-align:center;">{{ $matchMeta }}</div>
@endsection

@section('footer')
    @include('posters.partials._footer')
@endsection

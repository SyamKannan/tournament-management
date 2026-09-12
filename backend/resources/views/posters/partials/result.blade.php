@extends('posters.layout')

@section('content')
<div class="eyebrow">{{ $tournament['name'] }} &middot; FULL TIME</div>
<div class="headline" style="margin-top:20px;">{{ $headline }}</div>
<div class="subhead" style="margin-top:16px;">{{ $subhead }}</div>

<div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:32px;">
    <div style="display:flex; align-items:center; gap:48px;">
        <div style="display:flex; flex-direction:column; align-items:center; gap:14px;">
            @include('posters.partials._logo-circle', ['team' => $teamA, 'size' => 160])
            <div class="body-text" style="font-size:26px;">{{ $teamA['name'] }}</div>
            <div class="subhead">{{ $teamAScore }}</div>
        </div>
        <div class="meta" style="font-size:32px;">&mdash;</div>
        <div style="display:flex; flex-direction:column; align-items:center; gap:14px;">
            @include('posters.partials._logo-circle', ['team' => $teamB, 'size' => 160])
            <div class="body-text" style="font-size:26px;">{{ $teamB['name'] }}</div>
            <div class="subhead">{{ $teamBScore }}</div>
        </div>
    </div>

    {{-- Hero: the winning margin — the one big fact of a result poster. --}}
    <div style="font-family:'Anton',sans-serif; font-size:96px; color:var(--accent); text-align:center; text-transform:uppercase; line-height:1;">
        {{ $winnerTeam['name'] }}<br>WON
    </div>
    <div class="subhead">{{ $resultSummary }}</div>
</div>
@endsection

@section('footer')
    @include('posters.partials._footer')
@endsection

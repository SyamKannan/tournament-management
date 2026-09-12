@extends('posters.layout')

@section('content')
<div class="eyebrow">{{ $tournament['name'] }} &middot; FULL TIME</div>

<div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:36px;">
    <div style="display:flex; align-items:center; gap:48px;">
        <div style="display:flex; flex-direction:column; align-items:center; gap:14px;">
            @include('posters.partials._logo-circle', ['team' => $teamA, 'size' => 150])
            <div class="body-text" style="font-size:24px;">{{ $teamA['name'] }}</div>
            <div class="body-text" style="font-weight:700;">{{ $teamAScore }}</div>
        </div>
        <div class="meta" style="font-size:28px;">&mdash;</div>
        <div style="display:flex; flex-direction:column; align-items:center; gap:14px;">
            @include('posters.partials._logo-circle', ['team' => $teamB, 'size' => 150])
            <div class="body-text" style="font-size:24px;">{{ $teamB['name'] }}</div>
            <div class="body-text" style="font-weight:700;">{{ $teamBScore }}</div>
        </div>
    </div>

    {{-- Hero: the one big fact of a result poster — the winning margin. --}}
    <div class="headline" style="text-align:center;">{{ $headline }}</div>
    <div class="subhead" style="text-align:center;">{{ $subhead }}</div>
</div>
@endsection

@section('footer')
    @include('posters.partials._footer')
@endsection

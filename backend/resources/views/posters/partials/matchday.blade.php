@extends('posters.layout')

@section('content')
{{-- Headline stays quiet here on purpose: the VS lockup below is the one
     hero element this poster is built around, per the design rules. --}}
<div class="eyebrow">{{ $tournament['name'] }} &middot; {{ strtoupper($match['round_name'] ?: 'MATCH DAY') }}</div>
<div class="subhead" style="margin-top:20px;">{{ $headline }}</div>
<div class="body-text" style="margin-top:8px;">{{ $subhead }}</div>

{{-- Hero: the VS lockup. --}}
<div style="flex:1; display:flex; align-items:center; justify-content:center; gap:56px;">
    <div style="display:flex; flex-direction:column; align-items:center; gap:20px; width:280px;">
        @include('posters.partials._logo-circle', ['team' => $teamA, 'size' => 240])
        <div class="subhead" style="text-align:center; font-size:32px;">{{ $teamA['name'] }}</div>
    </div>

    <div style="font-family:'Anton',sans-serif; font-size:110px; color:var(--accent); flex-shrink:0;">VS</div>

    <div style="display:flex; flex-direction:column; align-items:center; gap:20px; width:280px;">
        @include('posters.partials._logo-circle', ['team' => $teamB, 'size' => 240])
        <div class="subhead" style="text-align:center; font-size:32px;">{{ $teamB['name'] }}</div>
    </div>
</div>

<div class="body-text" style="text-align:center;">{{ $matchMeta }}</div>
@endsection

@section('footer')
    @include('posters.partials._footer')
@endsection

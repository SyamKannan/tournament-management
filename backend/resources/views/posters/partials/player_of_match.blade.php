@extends('posters.layout')

@section('content')
<div class="eyebrow">{{ $tournament['name'] }} &middot; PLAYER OF THE MATCH</div>

{{-- Hero: the player — photo/initials + name read together as one spotlight. --}}
<div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:24px;">
    @include('posters.partials._logo-circle', ['team' => ['logo' => $player['photo'] ?? '', 'name' => $player['full_name'] ?? '?'], 'size' => 280])
    <div class="headline" style="text-align:center;">{{ $player['full_name'] ?? 'Player of the Match' }}</div>
    <div class="body-text">{{ $team['name'] ?? '' }}</div>
</div>

<div class="subhead" style="text-align:center;">{{ $headline }}</div>
<div class="body-text" style="text-align:center;">{{ $subhead }}</div>
@endsection

@section('footer')
    @include('posters.partials._footer')
@endsection

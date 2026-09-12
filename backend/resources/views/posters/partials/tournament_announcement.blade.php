@extends('posters.layout')

@section('content')
<div class="eyebrow">{{ strtoupper($tournament['sport_code'] ?? '') }} TOURNAMENT</div>

{{-- Hero: the tournament itself — this poster type has no match to spotlight. --}}
<div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:20px;">
    @include('posters.partials._logo-circle', ['team' => ['logo' => $tournament['logo'] ?? '', 'name' => $tournament['name']], 'size' => 160])
    <div class="headline" style="text-align:center;">{{ $headline }}</div>
    <div class="subhead" style="text-align:center;">{{ $subhead }}</div>
</div>

<div style="display:flex; justify-content:center; gap:24px; flex-wrap:wrap;">
    @foreach($chips as $chip)
    <div style="background:rgba(255,255,255,0.1); border-radius:16px; padding:16px 28px; text-align:center;">
        <div class="meta" style="letter-spacing:1.5px; text-transform:uppercase;">{{ $chip['label'] }}</div>
        <div class="body-text" style="font-weight:800; margin-top:6px;">{{ $chip['value'] }}</div>
    </div>
    @endforeach
</div>
@endsection

@section('footer')
    @include('posters.partials._footer')
@endsection

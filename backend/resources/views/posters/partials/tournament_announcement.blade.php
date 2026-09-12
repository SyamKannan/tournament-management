@extends('posters.layout')

@section('content')
@php
    $sportEmoji = ($tournament['sport_code'] ?? '') === 'football' ? '⚽' : '🏏';
@endphp

{{-- Badge: a rotated "polaroid" card, the flyer-shop signature this whole
     template is built around. --}}
<div style="display:flex; justify-content:center;">
    <div style="
        background:#ffffff; border-radius:20px; padding:20px 32px; text-align:center;
        transform:rotate(-3deg); box-shadow:0 16px 32px rgba(0,0,0,0.35);
    ">
        <div style="font-size:64px; line-height:1;">{{ $sportEmoji }}</div>
        <div style="font-family:'Anton',sans-serif; font-size:22px; color:#0a0a0a; margin-top:6px; letter-spacing:1px;">
            {{ strtoupper($tournament['sport_code'] ?? 'TOURNAMENT') }}
        </div>
    </div>
</div>

{{-- Hero: the tournament name/announcement copy. --}}
<div style="text-align:center; margin-top:28px;">
    <div class="headline">{{ $headline }}</div>
    <div class="subhead" style="margin-top:14px;">{{ $subhead }}</div>
</div>

{{-- Details panel — the "RULES" box in a printed flyer: a plain white card,
     everything quiet and legible, no competing with the headline above. --}}
<div style="
    flex:1; margin-top:32px; margin-bottom:150px; background:rgba(255,255,255,0.94); border-radius:24px;
    padding:36px 40px; display:flex; flex-direction:column; justify-content:center; gap:18px; overflow:hidden;
">
    @foreach($chips as $i => $chip)
        @if($i > 0)
            <div style="border-top:2px dashed rgba(10,10,10,0.2);"></div>
        @endif
        <div style="display:flex; justify-content:space-between; align-items:baseline;">
            <span style="font-size:22px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:#0a0a0a; opacity:0.6;">
                {{ $chip['label'] }}
            </span>
            <span style="font-family:'Anton',sans-serif; font-size:32px; color:#0a0a0a;">
                {{ $chip['value'] }}
            </span>
        </div>
    @endforeach
</div>
@endsection

@section('footer')
    @include('posters.partials._footer')
@endsection

{{--
    Shared team/club badge: real logo via <img>, or a circle with the short
    name's initials in the accent color when there's no logo — reused by
    every poster type instead of each one handling the missing-logo case.
    Params: $team (array with `logo`, `short_name`, `name`), $size (px).
--}}
@php
    $size = $size ?? 200;
    $source = trim((string) ($team['logo'] ?? ''));
    $label = $team['short_name'] ?? $team['name'] ?? '?';
    $initials = strtoupper(mb_substr(trim($label), 0, 2));
@endphp
<div class="logo-circle" style="width:{{ $size }}px; height:{{ $size }}px;">
    @if($source)
        <img src="{{ $source }}" alt="">
    @else
        <span class="initials" style="font-size:{{ (int) ($size * 0.38) }}px;">{{ $initials }}</span>
    @endif
</div>

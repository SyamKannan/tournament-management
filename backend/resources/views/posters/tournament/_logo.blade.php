{{-- Round logo: initial underneath, image on top that removes itself if it fails to load. --}}
<div class="logo-round" style="position:relative">
    <span style="font-family:'Anton'; font-size:{{ $initialSize ?? 40 }}px; color:{{ $initialColor ?? '#07080a' }}">{{ mb_strtoupper(mb_substr($orgName, 0, 1)) }}</span>
    @if($tournamentLogo || $orgLogo)
        <img src="{{ $tournamentLogo ?: $orgLogo }}" alt="" onerror="this.remove()" style="position:absolute; inset:0">
    @endif
</div>

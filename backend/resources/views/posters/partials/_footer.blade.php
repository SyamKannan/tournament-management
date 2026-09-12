{{-- Shared footer bar: club branding + tournament dates, on every poster type. --}}
<div class="footer-bar">
    <div style="display:flex; align-items:center; gap:16px;">
        <div style="width:56px; height:56px;">
            @include('posters.partials._logo-circle', ['team' => ['logo' => $tournament['logo'] ?? '', 'name' => $tournament['name']], 'size' => 56])
        </div>
        <div class="meta" style="font-weight:700;">{{ $tournament['name'] }}</div>
    </div>
    <div class="meta">{{ $dateRange ?? '' }}</div>
</div>

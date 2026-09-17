{{-- Registration QR card. Expects $registrationQr (data URI) and an optional $label/$size. --}}
@if(!empty($registrationQr))
<div class="qr-card" style="width:{{ $size ?? 230 }}px;">
    <div class="qr-frame"><img class="qr-img" src="{{ $registrationQr }}" alt=""></div>
    <div class="qr-label">{{ $label ?? 'Scan to Register' }}</div>
</div>
@endif

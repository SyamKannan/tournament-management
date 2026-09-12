@extends('posters.layout')

@section('content')
<div class="eyebrow">{{ $tournament['name'] }}</div>
<div class="headline" style="margin-top:16px;">{{ $headline }}</div>
<div class="subhead" style="margin-top:12px; margin-bottom:32px;">{{ $subhead }}</div>

{{-- Standings themselves are the "everything else quiet" data display —
     structured rows, not shouty type — with only the leader row picked out. --}}
<table style="width:100%; border-collapse:collapse; font-size:var(--fs-body);">
    <thead>
        <tr style="opacity:0.7; font-size:var(--fs-meta); text-transform:uppercase; letter-spacing:1px;">
            <td style="padding:12px 8px; text-align:left;">Team</td>
            <td style="padding:12px 8px; text-align:center;">P</td>
            <td style="padding:12px 8px; text-align:center;">W</td>
            <td style="padding:12px 8px; text-align:center;">L</td>
            <td style="padding:12px 8px; text-align:right;">Pts</td>
        </tr>
    </thead>
    <tbody>
        @foreach($standings as $i => $row)
        <tr style="{{ $i === 0 ? 'background:color-mix(in srgb, var(--accent) 30%, transparent); font-weight:700;' : '' }} border-bottom:1px solid rgba(255,255,255,0.12);">
            <td style="padding:16px 8px; text-align:left;">{{ $i + 1 }}. {{ $row['team_name'] }}</td>
            <td style="padding:16px 8px; text-align:center;">{{ $row['played'] }}</td>
            <td style="padding:16px 8px; text-align:center;">{{ $row['won'] }}</td>
            <td style="padding:16px 8px; text-align:center;">{{ $row['lost'] }}</td>
            <td style="padding:16px 8px; text-align:right; font-weight:700;">{{ $row['points'] }}</td>
        </tr>
        @endforeach
    </tbody>
</table>
@endsection

@section('footer')
    @include('posters.partials._footer')
@endsection

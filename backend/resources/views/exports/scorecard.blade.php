{{--
    A match card built to be printed.

    Plain HTML with an inline stylesheet rather than a server-rendered PDF: the
    browser's own "Save as PDF" produces the same page, and it keeps headless
    Chrome — already the most fragile part of poster generation — off the path of
    a download an organizer wants right now. `@media print` drops the screen
    chrome so what comes out of the printer is the card and nothing else.
--}}
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $teamA->name ?? 'Team A' }} vs {{ $teamB->name ?? 'Team B' }} — Scorecard</title>
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            margin: 0; padding: 24px; background: #f1f5f9; color: #0f172a;
        }
        .sheet { max-width: 820px; margin: 0 auto; background: #fff; padding: 28px; border-radius: 12px; }
        h1 { font-size: 20px; margin: 0 0 4px; }
        h2 { font-size: 14px; margin: 24px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #e2e8f0; }
        .muted { color: #64748b; font-size: 12px; margin: 0; }
        .score { display: flex; gap: 16px; align-items: baseline; margin: 16px 0; flex-wrap: wrap; }
        .score strong { font-size: 24px; }
        .result { background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46;
                  padding: 8px 12px; border-radius: 8px; font-size: 13px; font-weight: 600; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 8px; }
        th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }
        th { background: #f8fafc; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #475569; }
        td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
        .actions { max-width: 820px; margin: 0 auto 16px; text-align: right; }
        button {
            font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
            padding: 8px 16px; border-radius: 8px; border: 1px solid #0f172a;
            background: #0f172a; color: #fff;
        }
        footer { margin-top: 24px; font-size: 11px; color: #94a3b8; }
        @media print {
            body { background: #fff; padding: 0; }
            .sheet { max-width: none; padding: 0; border-radius: 0; }
            .actions { display: none; }
        }
    </style>
</head>
<body>
    <div class="actions">
        <button type="button" onclick="window.print()">Print or save as PDF</button>
    </div>

    <div class="sheet">
        <h1>{{ $teamA->name ?? 'Team A' }} vs {{ $teamB->name ?? 'Team B' }}</h1>
        <p class="muted">
            {{ $tournament->name }}
            @if($match->round_name) &middot; {{ $match->round_name }} @endif
            @if($venue) &middot; {{ $venue->name }} @endif
            @if($match->scheduled_at) &middot; {{ $match->scheduled_at }} @endif
        </p>

        @if($match->result_summary)
            <div class="score"><span class="result">{{ $match->result_summary }}</span></div>
        @endif

        {{-- Each scorecard service already decides what a card contains; this
             only lays out what it is handed. Cricket returns a list of innings;
             football returns one entry per side. --}}
        @if($isCricket)
            @forelse($card as $innings)
                <h2>
                    {{ $teamNames[$innings['batting_team_id']] ?? 'Innings '.$innings['innings'] }}
                    &mdash; {{ $innings['runs'] }}/{{ $innings['wickets'] }}
                    ({{ $innings['overs'] }} overs)
                    @if(($innings['extras'] ?? 0) > 0)
                        <span class="muted">extras {{ $innings['extras'] }}</span>
                    @endif
                </h2>

                <table>
                    <thead><tr>
                        <th>Batter</th><th>How out</th>
                        <th class="num">R</th><th class="num">B</th>
                        <th class="num">4s</th><th class="num">6s</th><th class="num">SR</th>
                    </tr></thead>
                    <tbody>
                    @forelse(($innings['batting'] ?? []) as $batter)
                        <tr>
                            <td>{{ $batter['name'] }}</td>
                            <td>{{ $batter['dismissal'] ?? 'not out' }}</td>
                            <td class="num">{{ $batter['runs'] }}</td>
                            <td class="num">{{ $batter['balls'] }}</td>
                            <td class="num">{{ $batter['fours'] ?? 0 }}</td>
                            <td class="num">{{ $batter['sixes'] ?? 0 }}</td>
                            <td class="num">{{ $batter['strike_rate'] }}</td>
                        </tr>
                    @empty
                        <tr><td colspan="7" class="muted">No batting recorded.</td></tr>
                    @endforelse
                    </tbody>
                </table>

                <table>
                    <thead><tr>
                        <th>Bowler</th>
                        <th class="num">O</th><th class="num">R</th>
                        <th class="num">W</th><th class="num">Econ</th>
                    </tr></thead>
                    <tbody>
                    @forelse(($innings['bowling'] ?? []) as $bowler)
                        <tr>
                            <td>{{ $bowler['name'] }}</td>
                            <td class="num">{{ $bowler['overs'] }}</td>
                            <td class="num">{{ $bowler['runs'] }}</td>
                            <td class="num">{{ $bowler['wickets'] }}</td>
                            <td class="num">{{ $bowler['economy'] }}</td>
                        </tr>
                    @empty
                        <tr><td colspan="5" class="muted">No bowling recorded.</td></tr>
                    @endforelse
                    </tbody>
                </table>
            @empty
                <h2>Scorecard</h2>
                <p class="muted">This match has not been scored yet.</p>
            @endforelse
        @else
            @foreach($card as $side)
                <h2>{{ $teamNames[$side['team_id']] ?? 'Team' }} &mdash; {{ $side['score'] }}</h2>

                <table>
                    <thead><tr><th class="num">Min</th><th>Player</th><th>Event</th></tr></thead>
                    <tbody>
                    @php
                        // One ordered list per side, so the card reads down the
                        // match rather than by category.
                        $entries = collect()
                            ->concat(collect($side['goals'] ?? [])->map(fn ($e) => $e + ['label' => $e['type'] === 'own_goal' ? 'Own goal' : ($e['type'] === 'penalty_goal' ? 'Goal (penalty)' : 'Goal')]))
                            ->concat(collect($side['cards'] ?? [])->map(fn ($e) => $e + ['label' => $e['type'] === 'red_card' ? 'Red card' : 'Yellow card']))
                            ->concat(collect($side['missed_penalties'] ?? [])->map(fn ($e) => $e + ['label' => 'Penalty missed']))
                            ->concat(collect($side['substitutions'] ?? [])->map(fn ($e) => $e + ['label' => 'Substitution']))
                            ->sortBy('minute');
                    @endphp
                    @forelse($entries as $entry)
                        <tr>
                            <td class="num">{{ $entry['minute'] }}'</td>
                            <td>{{ $entry['name'] ?? '—' }}</td>
                            <td>{{ $entry['label'] }}</td>
                        </tr>
                    @empty
                        <tr><td colspan="3" class="muted">Nothing recorded for this side.</td></tr>
                    @endforelse
                    </tbody>
                </table>
            @endforeach
        @endif

        <footer>
            Generated {{ now()->format('j M Y, g:ia') }} &middot; {{ $tournament->name }}
        </footer>
    </div>
</body>
</html>

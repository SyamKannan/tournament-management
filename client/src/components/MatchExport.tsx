import React, { useState } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FileText, Download } from 'lucide-react';
import { useToast } from './ui/Toast';
import type {
  Match, Team, Player, CricketMatchState, FootballMatchState, FootballScorecardSide, ScorecardInnings,
} from '../types';
import { FOOTBALL_EVENT_LABELS, tossDecisionPhrase } from '../lib/football';
import { label } from '../lib/labels';

interface MatchExportProps {
  match: Match;
  tournamentName: string;
  teamA: Team & { players?: Player[] };
  teamB: Team & { players?: Player[] };
  cricketState?: CricketMatchState;
  footballState?: FootballMatchState;
  scorecard?: ScorecardInnings[];
  footballScorecard?: FootballScorecardSide[] | null;
}

/**
 * Takes the finished match away with the organizer.
 *
 * The PDF is the record people file and share — a printed scorecard, innings
 * by innings. The CSV is the raw ball-by-ball log, one row per delivery, so a
 * league can total a season up in a spreadsheet without this app.
 *
 * Both are generated in the browser from what the console already holds, the
 * way the ground-fee report does it — no export endpoint and no round trip.
 */
export const MatchExport: React.FC<MatchExportProps> = ({
  match,
  tournamentName,
  teamA,
  teamB,
  cricketState,
  footballState,
  scorecard = [],
  footballScorecard,
}) => {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const isFootball = match.sport_code === 'football';

  const teamName = (teamId?: string | null) =>
    teamId === teamA.id ? teamA.name : teamId === teamB.id ? teamB.name : '—';

  const playerName = (playerId?: string | null) => {
    if (!playerId) return '';
    const player = [...(teamA.players || []), ...(teamB.players || [])].find(p => p.id === playerId);
    return player?.full_name || playerId;
  };

  const fileBase = `${tournamentName}_${teamA.name}_vs_${teamB.name}`.replace(/[^a-zA-Z0-9]+/g, '_');

  const save = (content: string, mime: string, extension: string) => {
    const blob = new Blob([content], { type: `${mime};charset=utf-8;` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileBase}.${extension}`;
    link.click();
    // Revoking immediately can cancel the download in some browsers, so give
    // the click a moment to take the blob first.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  /* --------------------------------------------------------------- CSV */

  const exportCsv = () => {
    const rows: string[][] = [];

    if (isFootball) {
      rows.push(['Minute', 'Team', 'Event', 'Player', 'Assist', 'Player On', 'Player Off', 'Counts For']);
      (footballState?.events || []).forEach(event => {
        // An own goal is logged against the scorer's side but counts for the other.
        const countsFor = event.event_type === 'own_goal'
          ? teamName(event.team_id === teamA.id ? teamB.id : teamA.id)
          : ['goal', 'penalty_goal'].includes(event.event_type) ? teamName(event.team_id) : '';

        rows.push([
          String(event.minute),
          teamName(event.team_id),
          event.event_type,
          event.event_type === 'substitution' ? '' : playerName(event.player_id),
          playerName(event.assist_player_id),
          playerName(event.sub_in_player_id),
          playerName(event.sub_out_player_id),
          countsFor,
        ]);
      });
    } else {
      rows.push([
        'Innings', 'Over', 'Ball', 'Batting', 'Bowling', 'Striker', 'Non-striker',
        'Bowler', 'Runs', 'Extra', 'Extra Runs', 'Wicket', 'How Out', 'Batter Out', 'Fielder', 'Commentary',
      ]);

      (cricketState?.deliveries || []).forEach(ball => {
        const battingTeamId = ball.innings === 1
          ? (match.batting_first_team_id || teamA.id)
          : (match.batting_first_team_id === teamA.id ? teamB.id : teamA.id);

        rows.push([
          String(ball.innings),
          String(ball.over_number + 1),
          String(ball.ball_number),
          teamName(battingTeamId),
          teamName(battingTeamId === teamA.id ? teamB.id : teamA.id),
          playerName(ball.striker_id),
          playerName(ball.non_striker_id),
          playerName(ball.bowler_id),
          String(ball.runs_scored),
          ball.extras === 'none' ? '' : ball.extras,
          String(ball.extras_runs),
          ball.is_wicket ? 'YES' : '',
          ball.wicket_type || '',
          playerName(ball.dismissed_player_id),
          playerName(ball.fielder_id),
          ball.commentary || '',
        ]);
      });
    }

    if (rows.length === 1) {
      toast.error('There is nothing recorded to export yet');
      return;
    }

    // Quote every field and double any quote inside it, so a commentary line
    // with a comma can't shift the columns.
    const csv = rows
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    save(csv, 'text/csv', 'csv');
  };

  /* --------------------------------------------------------------- PDF */

  const exportPdf = () => {
    setBusy(true);

    try {
      const doc = new jsPDF();

      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, 210, 34, 'F');

      doc.setTextColor(16, 185, 129);
      doc.setFontSize(15);
      doc.setFont('helvetica', 'bold');
      doc.text(`${teamA.name} vs ${teamB.name}`.toUpperCase(), 14, 16);

      doc.setTextColor(203, 213, 225);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(
        `${tournamentName} | ${match.round_name || 'Match'} | ${new Date(match.scheduled_at || Date.now()).toLocaleDateString()}`,
        14,
        24,
      );

      const summary: string[][] = [];

      if (match.toss_winner_team_id) {
        summary.push([
          'Toss',
          `${teamName(match.toss_winner_team_id)} won and chose to ${tossDecisionPhrase(match.toss_decision)}`,
        ]);
      }
      if (isFootball) {
        summary.push(['Score', `${teamA.name} ${footballState?.team_a_score ?? 0} - ${footballState?.team_b_score ?? 0} ${teamB.name}`]);
      }
      if (match.result_summary) summary.push(['Result', match.result_summary]);
      if (match.man_of_the_match_player_id) {
        summary.push(['Player of the Match', playerName(match.man_of_the_match_player_id)]);
      }
      summary.push(['Status', label(match.status)]);

      autoTable(doc, {
        startY: 42,
        head: [['Match Details', '']],
        body: summary,
        theme: 'grid',
        headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255] },
      });

      if (isFootball) {
        appendFootballCard(doc, footballScorecard, teamName);
        appendFootball(doc, footballState, teamName, playerName);
      } else {
        appendCricket(doc, scorecard, teamName);
      }

      doc.save(`${fileBase}.pdf`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to build the match PDF');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-5 rounded-3xl glass-panel border border-slate-800 space-y-3">
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-cyan-400" />
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Export Match Data</span>
      </div>

      <p className="text-[11px] text-slate-500 leading-relaxed">
        The PDF is the scorecard to file or share. The CSV is every
        {isFootball ? ' event' : ' ball'} as a row, for your own records.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={exportPdf}
          disabled={busy}
          className="py-2.5 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <FileText className="w-4 h-4" />
          <span>Scorecard PDF</span>
        </button>
        <button
          onClick={exportCsv}
          disabled={busy}
          className="py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          <span>{isFootball ? 'Events CSV' : 'Ball-by-Ball CSV'}</span>
        </button>
      </div>
    </div>
  );
};

/** Batting and bowling tables for each innings played. */
const appendCricket = (
  doc: jsPDF,
  scorecard: ScorecardInnings[],
  teamName: (id?: string | null) => string,
) => {
  scorecard.forEach(card => {
    const batted = card.batting.filter(row => row.has_batted);

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [[
        `${teamName(card.batting_team_id)} — ${card.runs}/${card.wickets} (${card.overs} ov)`,
        'R', 'B', '4s', '6s', 'SR',
      ]],
      body: [
        ...batted.map(row => [
          `${row.name}\n${row.dismissal || 'not out'}`,
          String(row.runs),
          String(row.balls),
          String(row.fours),
          String(row.sixes),
          String(row.strike_rate),
        ]),
        ['Extras', String(card.extras), '', '', '', ''],
        ['TOTAL', `${card.runs}/${card.wickets}`, `${card.overs} ov`, '', '', ''],
      ],
      theme: 'striped',
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
      columnStyles: { 0: { cellWidth: 80 } },
      styles: { fontSize: 8 },
    });

    if (card.bowling.length > 0) {
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 4,
        head: [[`${teamName(card.bowling_team_id)} bowling`, 'O', 'M', 'R', 'W', 'Econ']],
        body: card.bowling.map(row => [
          row.name,
          row.overs,
          String(row.maidens),
          String(row.runs),
          String(row.wickets),
          String(row.economy),
        ]),
        theme: 'striped',
        headStyles: { fillColor: [8, 145, 178], textColor: [255, 255, 255] },
        columnStyles: { 0: { cellWidth: 80 } },
        styles: { fontSize: 8 },
      });
    }
  });
};

/** Each side's scorers, bookings and changes — the card the big screen shows. */
const appendFootballCard = (
  doc: jsPDF,
  card: FootballScorecardSide[] | null | undefined,
  teamName: (id?: string | null) => string,
) => {
  (card || []).forEach(side => {
    const goals = side.goals.map(goal => [
      `${goal.minute}'`,
      `${goal.name || 'Unnamed'}${goal.type === 'penalty_goal' ? ' (pen)' : goal.type === 'own_goal' ? ' (OG)' : ''}`,
      goal.assist_name ? `Assist: ${goal.assist_name}` : '',
    ]);
    const bookings = side.cards.map(booking => [
      `${booking.minute}'`,
      booking.name || 'Unnamed',
      booking.type === 'red_card' ? 'Red card' : 'Yellow card',
    ]);
    const changes = side.substitutions.map(sub => [
      `${sub.minute}'`,
      `${sub.in_name || '—'} on`,
      `${sub.out_name || '—'} off`,
    ]);

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 8,
      head: [[`${teamName(side.team_id)} — ${side.score}`, '', '']],
      body: [...goals, ...bookings, ...changes].length > 0
        ? [...goals, ...bookings, ...changes]
        : [['—', 'Nothing recorded', '']],
      theme: 'striped',
      headStyles: { fillColor: [4, 120, 87], textColor: [255, 255, 255] },
      columnStyles: { 0: { cellWidth: 18 } },
      styles: { fontSize: 8 },
    });
  });
};

/** The full event timeline, in order. */
const appendFootball = (
  doc: jsPDF,
  state: FootballMatchState | undefined,
  teamName: (id?: string | null) => string,
  playerName: (id?: string | null) => string,
) => {
  const events = state?.events || [];

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 10,
    head: [['Min', 'Team', 'Event', 'Player', 'Detail']],
    body: events.length > 0
      ? events.map(event => [
        `${event.minute}'`,
        teamName(event.team_id),
        FOOTBALL_EVENT_LABELS[event.event_type] ?? label(event.event_type),
        event.event_type === 'substitution'
          ? `${playerName(event.sub_in_player_id)} on`
          : playerName(event.player_id),
        event.event_type === 'substitution'
          ? `${playerName(event.sub_out_player_id)} off`
          : event.assist_player_id ? `Assist: ${playerName(event.assist_player_id)}` : '',
      ])
      : [['—', '—', 'No events recorded', '—', '—']],
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
    styles: { fontSize: 8 },
  });
};

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Users, Phone, Crown, Loader2, Download, Shield } from 'lucide-react';
import { api, ApiError } from '../../services/api';
import type { CricketBattingStyle, CricketBowlingStyle, CricketRole, FootballPosition, Player } from '../../types';
import { LoadingState, EmptyState } from '../../components/ui/Feedback';
import { useToast } from '../../components/ui/Toast';
import {
  useManagedTeams, useSelectedTeam, PageHeader, TeamSwitcher, TeamLogo, TeamStatusBadge, type ManagedTeam,
} from './teamShared';

const FOOTBALL_POSITIONS: FootballPosition[] = [
  'Goalkeeper', 'Centre Back', 'Left Back', 'Right Back', 'Defensive Midfielder',
  'Central Midfielder', 'Attacking Midfielder', 'Left Wing', 'Right Wing', 'Striker',
];
const CRICKET_ROLES: CricketRole[] = ['Batter', 'Bowler', 'All-rounder', 'Wicketkeeper', 'Wicketkeeper + Batter'];
const BATTING_STYLES: CricketBattingStyle[] = ['Right Hand', 'Left Hand'];
const BOWLING_STYLES: CricketBowlingStyle[] = [
  'Fast', 'Medium Fast', 'Medium', 'Off Spin', 'Leg Spin', 'Left-arm Orthodox', 'Left-arm Wrist Spin', 'None',
];

const selectClass = 'w-full px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 disabled:opacity-60';

/** Downloads the squad as a PDF team sheet: number, name, role, phone. */
function downloadSquadSheet(entry: ManagedTeam) {
  const { team, tournament, players } = entry;
  const isFootball = tournament?.sport_code === 'football';
  const doc = new jsPDF();
  doc.setFillColor(3, 7, 18);
  doc.rect(0, 0, 210, 32, 'F');
  doc.setTextColor(29, 37, 70);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`${team.name.toUpperCase()} — SQUAD SHEET`, 14, 16);
  doc.setTextColor(156, 163, 175);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`${tournament?.name ?? ''}  |  Manager: ${team.manager_name}  |  ${new Date().toLocaleDateString()}`, 14, 25);

  autoTable(doc, {
    startY: 40,
    head: [isFootball ? ['#', 'Player', 'Position', 'Phone'] : ['#', 'Player', 'Role', 'Batting', 'Bowling', 'Phone']],
    body: players.map(p => {
      const name = `${p.full_name}${p.is_captain ? ' (C)' : ''}`;
      return isFootball
        ? [p.jersey_number || '', name, p.football_position || '', p.mobile || '']
        : [p.jersey_number || '', name, p.cricket_role || '', p.cricket_batting_style || '', p.cricket_bowling_style || '', p.mobile || ''];
    }),
    theme: 'striped',
    headStyles: { fillColor: [29, 37, 70] },
    styles: { fontSize: 9 },
  });
  doc.save(`${team.name.replace(/[^a-zA-Z0-9]/g, '_')}_Squad.pdf`);
}

/** Squad management: roles, captain and contacts for the selected team. */
export const TeamSquadPage: React.FC = () => {
  const { teams, error, patchTeam } = useManagedTeams();
  const { selected, select } = useSelectedTeam(teams);

  if (error) return <EmptyState icon={Users} title="Couldn't load your squad" message={error} />;
  if (!teams) return <LoadingState label="Loading your squad…" />;
  if (!selected) {
    return (
      <div className="space-y-6">
        <PageHeader title="My Squad" subtitle="Positions, roles, captain and player contacts" />
        <EmptyState icon={Users} title="No squad yet" message="Enter a tournament to add your squad." action={{ label: 'Join a tournament', to: '/team/join' }} />
      </div>
    );
  }

  const { team, tournament, players } = selected;
  const isFootball = tournament?.sport_code === 'football';
  const captain = players.find(p => p.is_captain);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Squad"
        subtitle="Set positions and roles, pick the captain, and reach your players"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <TeamSwitcher teams={teams} selectedId={team.id} onSelect={select} />
            <button
              type="button"
              onClick={() => downloadSquadSheet(selected)}
              disabled={players.length === 0}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
            >
              <Download className="w-4 h-4 text-emerald-400" /> Squad sheet (PDF)
            </button>
          </div>
        }
      />

      <div className="p-4 rounded-2xl glass-card border border-slate-800 flex flex-wrap items-center gap-4">
        <TeamLogo team={team} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-black text-white">{team.name}</h2>
            <TeamStatusBadge status={team.status} />
          </div>
          <p className="text-xs text-slate-400">
            {tournament?.name} · {players.length} players{captain ? ` · Captain: ${captain.full_name}` : ''}
          </p>
        </div>
      </div>

      {players.length === 0 ? (
        <EmptyState icon={Shield} title="No players on the team sheet" message="Players added at registration show up here." />
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {players.map(p => (
            <SquadCard
              key={p.id}
              teamId={team.id}
              player={p}
              isFootball={isFootball}
              onSaved={updated => patchTeam(team.id, { players: updated })}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/** One player: contact, captaincy and role pickers that save on change. */
const SquadCard: React.FC<{
  teamId: string;
  player: Player;
  isFootball: boolean;
  onSaved: (players: Player[]) => void;
}> = ({ teamId, player, isFootball, onSaved }) => {
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  const save = async (patch: Partial<Player>) => {
    setSaving(true);
    try {
      onSaved(await api.put(`/teams/${teamId}/players/${player.id}`, patch));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update the player');
    } finally {
      setSaving(false);
    }
  };

  const picker = <T extends string>(text: string, value: T | undefined, options: T[], field: keyof Player) => (
    <label className="block min-w-0">
      <span className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">{text}</span>
      <select
        value={value ?? ''}
        disabled={saving}
        onChange={e => save({ [field]: e.target.value || null } as Partial<Player>)}
        className={selectClass}
      >
        <option value="">Not set</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );

  return (
    <div className={`p-4 rounded-2xl glass-card border ${player.is_captain ? 'border-amber-500/40' : 'border-slate-800'}`}>
      <div className="flex items-center gap-3">
        <span className="shrink-0 w-11 h-11 rounded-xl bg-slate-800 grid place-items-center text-sm font-black text-emerald-400">
          {player.jersey_number || '–'}
        </span>
        <div className="min-w-0 flex-1">
          <Link to={`/players/${player.id}`} className="block text-sm font-bold text-white hover:text-emerald-400 truncate">
            {player.full_name}
          </Link>
          {player.mobile ? (
            <a href={`tel:${player.mobile.replace(/\s+/g, '')}`} className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-cyan-300">
              <Phone className="w-3 h-3" /> {player.mobile}
            </a>
          ) : (
            <span className="text-xs text-slate-600">No phone number</span>
          )}
        </div>
        {saving && <Loader2 className="w-4 h-4 text-slate-500 animate-spin shrink-0" aria-label="Saving" />}
        <button
          type="button"
          onClick={() => !player.is_captain && save({ is_captain: true })}
          disabled={saving}
          title={player.is_captain ? 'Captain' : 'Make captain'}
          aria-pressed={!!player.is_captain}
          className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
            player.is_captain
              ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
              : 'text-slate-500 border-slate-700 hover:text-amber-300 hover:border-amber-500/40'
          }`}
        >
          <Crown className="w-3 h-3" /> {player.is_captain ? 'Captain' : 'Make captain'}
        </button>
      </div>

      <div className={`mt-3 grid gap-2 ${isFootball ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-3'}`}>
        {isFootball ? (
          picker('Position', player.football_position, FOOTBALL_POSITIONS, 'football_position')
        ) : (
          <>
            {picker('Role', player.cricket_role, CRICKET_ROLES, 'cricket_role')}
            {picker('Batting', player.cricket_batting_style, BATTING_STYLES, 'cricket_batting_style')}
            {picker('Bowling', player.cricket_bowling_style, BOWLING_STYLES, 'cricket_bowling_style')}
          </>
        )}
      </div>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useToast } from './ui/Toast';
import type { MatchLineupEntry, Player, SportCode, Team } from '../types';
import { ChevronUp, ChevronDown, Star, Hand, Save, Users } from 'lucide-react';

interface MatchLineupEditorProps {
  matchId: string;
  sport: SportCode;
  teams: (Team & { players?: Player[] })[];
  lineups: MatchLineupEntry[];
  onSaved: () => void;
}

/** A row as the editor holds it, before it's sent back as a team sheet. */
interface EditorRow {
  player_id: string;
  name: string;
  jersey_number: number;
  is_playing: boolean;
  is_captain: boolean;
  is_wicketkeeper: boolean;
}

/**
 * Naming the XI for one fixture: who plays, in what order, and who wears the
 * armband and the gloves.
 *
 * The order is the batting card the scorer works down and the sequence the big
 * screen announces players in, so it is edited once here rather than twice.
 * Until an organizer touches it the server's default (squad order, first
 * eleven playing) stands, which is why this can be skipped entirely.
 */
export const MatchLineupEditor: React.FC<MatchLineupEditorProps> = ({
  matchId,
  sport,
  teams,
  lineups,
  onSaved,
}) => {
  const toast = useToast();
  const isFootball = sport === 'football';
  // The keeper flag is one column for both sports: gloves behind the stumps,
  // or in goal.
  const keeperLabel = isFootball ? 'Goalkeeper' : 'Wicketkeeper';
  const [activeTeamId, setActiveTeamId] = useState(teams[0]?.id ?? '');
  const [rows, setRows] = useState<EditorRow[]>([]);
  const [saving, setSaving] = useState(false);

  const activeTeam = teams.find(team => team.id === activeTeamId) ?? teams[0];

  // Reload the working copy whenever the saved sheet or the chosen side
  // changes, so switching tabs never carries unsaved edits across teams.
  useEffect(() => {
    if (!activeTeam) return;

    const forTeam = lineups.filter(row => row.team_id === activeTeam.id);

    setRows(
      forTeam.map(row => ({
        player_id: row.player_id,
        name: row.player.full_name,
        jersey_number: row.player.jersey_number,
        is_playing: row.is_playing,
        is_captain: row.is_captain,
        is_wicketkeeper: row.is_wicketkeeper,
      }))
    );
  }, [lineups, activeTeam?.id]);

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;

    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    setRows(next);
  };

  const toggle = (index: number, field: 'is_playing' | 'is_captain' | 'is_wicketkeeper') => {
    setRows(rows.map((row, position) => {
      if (position !== index) {
        // Only one captain and one keeper per side.
        return field === 'is_playing' ? row : { ...row, [field]: false };
      }
      return { ...row, [field]: !row[field] };
    }));
  };

  const save = async () => {
    if (!activeTeam) return;

    setSaving(true);
    try {
      await api.put(`/matches/${matchId}/lineup`, {
        team_id: activeTeam.id,
        players: rows.map((row, index) => ({
          player_id: row.player_id,
          batting_order: index + 1,
          is_playing: row.is_playing,
          is_captain: row.is_captain,
          is_wicketkeeper: row.is_wicketkeeper,
        })),
      });
      toast.success(`${activeTeam.name} team sheet saved`);
      onSaved();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save the team sheet');
    } finally {
      setSaving(false);
    }
  };

  if (!activeTeam) return null;

  const playingCount = rows.filter(row => row.is_playing).length;

  return (
    <div className="p-5 rounded-3xl glass-panel border border-slate-800 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            {isFootball ? 'Team Sheets & Starting Line-up' : 'Team Sheets & Batting Order'}
          </span>
        </div>
        <span className="text-xs font-mono text-slate-500">{playingCount} playing</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {teams.map(team => (
          <button
            key={team.id}
            onClick={() => setActiveTeamId(team.id)}
            className={`py-2.5 px-3 rounded-2xl border text-xs font-bold transition-all truncate ${
              team.id === activeTeam.id
                ? 'bg-amber-500/20 border-amber-500 text-white'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
            }`}
          >
            {team.name}
          </button>
        ))}
      </div>

      <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
        {rows.map((row, index) => (
          <div
            key={row.player_id}
            className={`flex items-center gap-2 p-2 rounded-xl border text-xs ${
              row.is_playing ? 'bg-slate-900 border-slate-800' : 'bg-slate-950 border-slate-900 opacity-60'
            }`}
          >
            <span className="w-6 text-center font-mono font-bold text-slate-500 shrink-0">{index + 1}</span>

            <button
              onClick={() => toggle(index, 'is_playing')}
              className={`w-9 shrink-0 py-1 rounded-lg text-xs font-black uppercase border ${
                row.is_playing
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                  : 'bg-slate-900 border-slate-800 text-slate-500'
              }`}
              title={row.is_playing ? (isFootball ? 'Move to the bench' : 'Drop from the XI') : (isFootball ? 'Add to the starting line-up' : 'Add to the XI')}
            >
              {row.is_playing ? 'In' : 'Out'}
            </button>

            <span className="flex-1 min-w-0 truncate font-semibold text-white">
              <span className="font-mono text-slate-500">#{row.jersey_number}</span> {row.name}
            </span>

            <button
              onClick={() => toggle(index, 'is_captain')}
              className={`p-1.5 rounded-lg border shrink-0 ${
                row.is_captain
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                  : 'bg-slate-900 border-slate-800 text-slate-600'
              }`}
              title="Captain"
            >
              <Star className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => toggle(index, 'is_wicketkeeper')}
              className={`p-1.5 rounded-lg border shrink-0 ${
                row.is_wicketkeeper
                  ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                  : 'bg-slate-900 border-slate-800 text-slate-600'
              }`}
              title={keeperLabel}
            >
              <Hand className="w-3.5 h-3.5" />
            </button>

            <div className="flex flex-col shrink-0">
              <button
                onClick={() => move(index, -1)}
                disabled={index === 0}
                className="p-0.5 text-slate-500 hover:text-white disabled:opacity-30"
                title={isFootball ? 'Move up the sheet' : 'Move up the order'}
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => move(index, 1)}
                disabled={index === rows.length - 1}
                className="p-0.5 text-slate-500 hover:text-white disabled:opacity-30"
                title={isFootball ? 'Move down the sheet' : 'Move down the order'}
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="w-full py-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
      >
        <Save className="w-4 h-4" />
        <span>{saving ? 'Saving…' : `Save ${activeTeam.name} sheet`}</span>
      </button>
    </div>
  );
};

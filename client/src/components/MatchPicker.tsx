import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import type { Match, Tournament } from '../types';

export const matchLabel = (match: Match) =>
  `#${match.match_number} ${match.team_a?.name || match.team_a_id} vs ${match.team_b?.name || match.team_b_id}${match.round_name ? ` · ${match.round_name}` : ''}`;

interface MatchPickerProps {
  /** Called with the chosen match and every match in its tournament. */
  onChange: (match: Match | null, tournamentMatches: Match[]) => void;
}

/**
 * Tournament → match selector for pages whose content belongs to one match.
 *
 * The choice lives in `?match=` so the scorer console can link straight to a
 * match's ads or announcements, and a reload keeps the organizer where they were.
 */
export const MatchPicker: React.FC<MatchPickerProps> = ({ onChange }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [tournamentId, setTournamentId] = useState('');
  const [matches, setMatches] = useState<Match[]>([]);
  const matchId = searchParams.get('match') || '';

  // Tournaments, then the one the linked match belongs to (or the first).
  useEffect(() => {
    (async () => {
      try {
        const list: Tournament[] = await api.get('/tournaments');
        setTournaments(list);

        let initial = list[0]?.id || '';
        if (matchId) {
          const detail = await api.get(`/matches/${matchId}`).catch(() => null);
          if (detail?.match?.tournament_id) initial = detail.match.tournament_id;
        }
        setTournamentId(initial);
      } catch (err) {
        console.error('Failed to load tournaments', err);
      }
    })();
    // Only on mount: later changes to ?match= come from this component itself.
  }, []);

  useEffect(() => {
    if (!tournamentId) {
      setMatches([]);
      return;
    }

    api.get(`/matches/tournament/${tournamentId}`)
      .then((list: Match[]) => {
        setMatches(list);
        if (!list.some(match => match.id === matchId)) {
          selectMatch(list[0]?.id || '');
        }
      })
      .catch(err => console.error('Failed to load matches', err));
  }, [tournamentId]);

  useEffect(() => {
    onChange(matches.find(match => match.id === matchId) || null, matches);
  }, [matchId, matches]);

  const selectMatch = (id: string) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('match', id); else next.delete('match');
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="grid sm:grid-cols-2 gap-3 text-xs">
      <div>
        <label className="block text-slate-400 font-semibold mb-1">Tournament</label>
        <select
          value={tournamentId}
          onChange={e => setTournamentId(e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold outline-none"
        >
          {tournaments.length === 0 && <option value="">No tournaments</option>}
          {tournaments.map(tournament => (
            <option key={tournament.id} value={tournament.id}>{tournament.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-slate-400 font-semibold mb-1">Match</label>
        <select
          value={matchId}
          onChange={e => selectMatch(e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold outline-none"
        >
          {matches.length === 0 && <option value="">No matches scheduled</option>}
          {matches.map(match => (
            <option key={match.id} value={match.id}>{matchLabel(match)}</option>
          ))}
        </select>
      </div>
    </div>
  );
};

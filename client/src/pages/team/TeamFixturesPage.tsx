import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Radio, Trophy, ExternalLink, MapPin, Clock, Shield } from 'lucide-react';
import { api, ApiError } from '../../services/api';
import type { CricketMatchState, FootballMatchState, Match, Team, Venue } from '../../types';
import { label } from '../../lib/labels';
import { LoadingState, EmptyState } from '../../components/ui/Feedback';
import { useManagedTeams, useSelectedTeam, PageHeader, StatTile, isLiveStatus } from './teamShared';

/** A match from `GET /matches/tournament/{id}`: the whole tournament's schedule. */
interface ScheduledMatch extends Match {
  team_a: Team | null;
  team_b: Team | null;
  venue: Venue | null;
  football_state: FootballMatchState | null;
  cricket_state: CricketMatchState | null;
}

const isFinished = (m: ScheduledMatch) => m.status === 'completed';
const isLive = (m: ScheduledMatch) => isLiveStatus(m.status);

const dayKey = (value: string) => {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? date.toDateString() : 'unscheduled';
};
const dayLabel = (key: string) => {
  if (key === 'unscheduled') return 'Date to be announced';
  const date = new Date(key);
  const today = new Date().toDateString();
  const tomorrow = new Date(Date.now() + 86_400_000).toDateString();
  const text = date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  return key === today ? `Today · ${text}` : key === tomorrow ? `Tomorrow · ${text}` : text;
};
const timeOf = (value: string) => {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : 'TBA';
};

/** Score line for a live or finished match, per sport; null before kick-off. */
function scoreFor(m: ScheduledMatch): [string, string] | null {
  if (!isLive(m) && !isFinished(m)) return null;
  if (m.football_state) return [String(m.football_state.team_a_score ?? 0), String(m.football_state.team_b_score ?? 0)];
  if (m.cricket_state) {
    const c = m.cricket_state;
    return [`${c.team_a_runs}/${c.team_a_wickets}`, `${c.team_b_runs}/${c.team_b_wickets}`];
  }
  return null;
}

/** The full fixture list of the tournament the selected team is in, with the team's own matches highlighted. */
export const TeamFixturesPage: React.FC = () => {
  const { teams, error } = useManagedTeams();
  const { selected, select } = useSelectedTeam(teams);
  const [matches, setMatches] = useState<ScheduledMatch[] | null>(null);
  const [matchesError, setMatchesError] = useState<string | null>(null);
  const [onlyMine, setOnlyMine] = useState(false);
  const tournamentId = selected?.tournament?.id;

  useEffect(() => {
    if (!tournamentId) return;
    setMatches(null);
    setMatchesError(null);
    api.get(`/matches/tournament/${tournamentId}`)
      .then(res => setMatches(Array.isArray(res) ? res : []))
      .catch(err => setMatchesError(err instanceof ApiError ? err.message : 'Failed to load the fixtures'));
  }, [tournamentId]);

  const myTeamId = selected?.team.id;
  const sorted = useMemo(
    () => [...(matches ?? [])]
      .filter(m => m.status !== 'cancelled')
      .sort((a, b) => (a.scheduled_at || '9999').localeCompare(b.scheduled_at || '9999') || a.match_number - b.match_number),
    [matches],
  );

  if (error) return <EmptyState icon={Calendar} title="Couldn't load your teams" message={error} />;
  if (!teams) return <LoadingState label="Loading fixtures…" />;
  if (!selected || !selected.tournament) {
    return (
      <div className="space-y-6">
        <PageHeader title="Fixtures & Results" subtitle="The match schedule of every tournament your team is in" />
        <EmptyState icon={Calendar} title="No tournament yet" message="Enter a tournament to see its fixtures here." action={{ label: 'Join a tournament', to: '/team/join' }} />
      </div>
    );
  }

  const { team, tournament } = selected;
  const isMine = (m: ScheduledMatch) => m.team_a_id === myTeamId || m.team_b_id === myTeamId;
  const mine = sorted.filter(isMine);
  const shown = onlyMine ? mine : sorted;
  const nextMatch = mine.find(m => !isFinished(m) && m.status !== 'abandoned');
  const results = mine.filter(isFinished);
  const won = results.filter(m => m.winner_team_id === myTeamId).length;
  const drawn = results.filter(m => !m.winner_team_id).length;

  const groups = shown.reduce<Record<string, ScheduledMatch[]>>((acc, m) => {
    (acc[dayKey(m.scheduled_at)] ??= []).push(m);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fixtures & Results"
        subtitle={`${tournament.name} · full match schedule`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {teams.length > 1 && (
              <select
                value={team.id}
                onChange={e => select(e.target.value)}
                aria-label="Tournament"
                className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                {teams.map(t => (
                  <option key={t.team.id} value={t.team.id}>{t.tournament?.name ?? 'Tournament'} · {t.team.name}</option>
                ))}
              </select>
            )}
            <Link
              to={`/tournaments/${tournament.slug}`}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs font-bold flex items-center gap-1.5"
            >
              <Trophy className="w-4 h-4 text-amber-400" /> Points table <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        }
      />

      {/* Your next match */}
      {nextMatch && (
        <section className="p-5 rounded-2xl bg-gradient-to-br from-emerald-500/15 via-slate-900 to-slate-900 border border-emerald-500/30">
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
            {isLive(nextMatch) ? <><Radio className="w-3.5 h-3.5" /> Playing now</> : <><Clock className="w-3.5 h-3.5" /> Your next match</>}
          </p>
          <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <TeamChip team={nextMatch.team_a} highlight={nextMatch.team_a_id === myTeamId} large />
              <span className="text-xs font-black text-slate-500">VS</span>
              <TeamChip team={nextMatch.team_b} highlight={nextMatch.team_b_id === myTeamId} large />
            </div>
            <div className="text-sm sm:text-right">
              <p className="font-black text-white">{dayLabel(dayKey(nextMatch.scheduled_at))}</p>
              <p className="text-emerald-300 font-bold">{timeOf(nextMatch.scheduled_at)}</p>
              <p className="text-xs text-slate-400 flex sm:justify-end items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3" /> {nextMatch.venue?.name || tournament.location || 'Venue to be announced'}
              </p>
            </div>
          </div>
          {isLive(nextMatch) && (
            <Link to={`/scoreboard/match/${nextMatch.id}`} className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/15 text-rose-400 text-xs font-black">
              <Radio className="w-3.5 h-3.5" /> Watch live score
            </Link>
          )}
        </section>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile icon={Calendar} label="Your matches" value={mine.length} hint={`${sorted.length} in the tournament`} />
        <StatTile icon={Trophy} label="Won" value={won} tone="text-emerald-400" />
        <StatTile icon={Trophy} label="Lost" value={results.length - won - drawn} tone="text-rose-400" />
        <StatTile icon={Trophy} label="Drawn" value={drawn} />
      </div>

      {/* Full schedule */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-white font-heading flex items-center gap-2">
            <Calendar className="w-4 h-4 text-cyan-400" /> Tournament schedule
          </h2>
          <div className="inline-flex p-1 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold">
            {[false, true].map(value => (
              <button
                key={String(value)}
                type="button"
                onClick={() => setOnlyMine(value)}
                aria-pressed={onlyMine === value}
                className={`px-3 py-1.5 rounded-lg transition-colors ${onlyMine === value ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                {value ? `${team.name} only` : 'All matches'}
              </button>
            ))}
          </div>
        </div>

        {matchesError ? (
          <EmptyState icon={Calendar} title="Couldn't load the fixtures" message={matchesError} />
        ) : !matches ? (
          <LoadingState label="Loading the schedule…" className="min-h-[20vh]" />
        ) : shown.length === 0 ? (
          <EmptyState icon={Calendar} title="No fixtures yet" message="The schedule appears here once the organizer makes the draw." />
        ) : (
          Object.entries(groups).map(([key, dayMatches]) => (
            <div key={key} className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">{dayLabel(key)}</h3>
              <ul className="space-y-2">
                {dayMatches.map(m => <FixtureRow key={m.id} match={m} myTeamId={myTeamId!} mine={isMine(m)} />)}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
};

const TeamChip: React.FC<{ team: Team | null; highlight?: boolean; large?: boolean }> = ({ team, highlight, large }) => (
  <span className={`flex items-center gap-2 min-w-0 ${highlight ? 'text-emerald-300' : 'text-white'}`}>
    <span className={`${large ? 'w-10 h-10' : 'w-7 h-7'} rounded-lg bg-slate-800 border border-slate-700 overflow-hidden shrink-0 grid place-items-center`}>
      {team?.logo ? <img src={team.logo} alt="" className="w-full h-full object-cover" /> : <Shield className="w-1/2 h-1/2 text-slate-500" />}
    </span>
    <span className={`font-bold truncate ${large ? 'text-base' : 'text-sm'}`}>
      {team ? (large ? team.name : team.short_name || team.name) : 'TBD'}
    </span>
  </span>
);

const FixtureRow: React.FC<{ match: ScheduledMatch; myTeamId: string; mine: boolean }> = ({ match: m, myTeamId, mine }) => {
  const score = scoreFor(m);
  const live = isLive(m);
  const outcome = isFinished(m) && mine
    ? (!m.winner_team_id ? 'D' : m.winner_team_id === myTeamId ? 'W' : 'L')
    : null;

  return (
    <li className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center gap-3 ${
      mine ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-slate-900/60 border-slate-800'
    }`}>
      <div className="sm:w-24 shrink-0 flex sm:flex-col items-center sm:items-start gap-2 sm:gap-0">
        <span className="text-sm font-black text-white">{timeOf(m.scheduled_at)}</span>
        <span className="text-xs text-slate-500">{m.round_name || `Match ${m.match_number}`}</span>
      </div>

      <div className="flex-1 min-w-0 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <TeamChip team={m.team_a} highlight={m.team_a_id === myTeamId} />
        <span className={`px-2 text-center text-xs font-black whitespace-nowrap ${score ? 'text-white' : 'text-slate-500'}`}>
          {score ? `${score[0]} – ${score[1]}` : 'vs'}
        </span>
        <span className="justify-self-end min-w-0"><TeamChip team={m.team_b} highlight={m.team_b_id === myTeamId} /></span>
      </div>

      <div className="sm:w-44 shrink-0 flex items-center justify-between sm:justify-end gap-2 text-xs">
        <span className="text-slate-400 truncate flex items-center gap-1">
          {m.venue?.name && <><MapPin className="w-3 h-3 shrink-0" /> {m.venue.name}</>}
        </span>
        {live ? (
          <Link to={`/scoreboard/match/${m.id}`} className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-500/15 text-rose-400 font-black uppercase">
            <Radio className="w-3 h-3" /> Live
          </Link>
        ) : outcome ? (
          <span className={`shrink-0 w-6 h-6 rounded-md grid place-items-center font-black ${
            outcome === 'W' ? 'bg-emerald-500/20 text-emerald-400' : outcome === 'L' ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-500/20 text-slate-300'
          }`}>{outcome}</span>
        ) : (
          <span className="shrink-0 font-bold uppercase text-slate-500">{label(m.status)}</span>
        )}
      </div>
    </li>
  );
};

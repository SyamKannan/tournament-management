import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../../services/api';
import type { Match, Tournament } from '../../types';
import { Calendar, Sparkles, RefreshCw, MapPin, Tv, ArrowLeft, Ban } from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { TournamentPicker } from '../../components/ui/TournamentPicker';
import { Skeleton, SkeletonCard, EmptyState } from '../../components/ui/Feedback';

export const OrgFixturesPage: React.FC = () => {
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();
  const { tournamentId: routeTournamentId } = useParams<{ tournamentId: string }>();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTourneyId, setSelectedTourneyId] = useState<string>('');
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    const fetchTourneys = async () => {
      try {
        setLoading(true);
        const res = await api.get('/tournaments');
        setTournaments(res);
        if (!routeTournamentId && res.length > 0) {
          // Entered without a specific tournament (e.g. from the sidebar) — pin
          // the URL to one so the page always shows an unambiguous context.
          navigate(`/organization/tournaments/${res[0].id}/fixtures`, { replace: true });
        }
      } catch (err) {
        console.error('Failed to load tournaments', err);
      } finally {
        setLoading(false);
      }
    };
    fetchTourneys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (routeTournamentId) setSelectedTourneyId(routeTournamentId);
  }, [routeTournamentId]);

  const handleSelectTournament = (id: string) => {
    navigate(`/organization/tournaments/${id}/fixtures`);
  };

  const activeTournament = tournaments.find(t => t.id === selectedTourneyId);

  const fetchMatches = async (tourneyId: string) => {
    if (!tourneyId) return;
    try {
      const res = await api.get(`/matches/tournament/${tourneyId}`);
      setMatches(res);
    } catch (err) {
      console.error('Failed to load matches', err);
    }
  };

  useEffect(() => {
    if (selectedTourneyId) fetchMatches(selectedTourneyId);
  }, [selectedTourneyId]);

  const handleAutoGenerate = async (format: 'round_robin' | 'knockout') => {
    const label = format === 'round_robin' ? 'round robin' : 'knockout';
    // A tournament has one schedule: the second run replaces the first rather
    // than stacking another full set of fixtures on top of it.
    const replace = matches.length > 0;

    const proceed = await confirm({
      title: replace ? `Regenerate ${label} fixtures?` : `Generate ${label} fixtures?`,
      message: replace
        ? `The current ${matches.length} fixture${matches.length === 1 ? '' : 's'} will be deleted and a fresh ${label} schedule built from the approved teams. Matches that have already started or finished block this.`
        : 'Every approved team will be scheduled.',
      confirmLabel: replace ? 'Replace fixtures' : 'Generate fixtures',
      tone: replace ? 'danger' : 'default',
    });
    if (!proceed) return;
    setGenerating(true);
    try {
      const res = await api.post('/matches/auto-generate-fixtures', {
        tournament_id: selectedTourneyId,
        format,
        replace,
      });
      toast.success(res?.message || 'Fixtures updated');
      fetchMatches(selectedTourneyId);
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate fixtures');
      // A 409 means our fixture list is out of date with the server's.
      if (err?.status === 409) fetchMatches(selectedTourneyId);
    } finally {
      setGenerating(false);
    }
  };

  const handleCancelMatch = async (m: Match) => {
    const teams = `${m.team_a?.name || m.team_a_id} vs ${m.team_b?.name || m.team_b_id}`;
    const proceed = await confirm({
      title: `Cancel match #${m.match_number}?`,
      message: `${teams} will be marked cancelled and can no longer be scored. This cannot be undone.`,
      confirmLabel: 'Cancel match',
      cancelLabel: 'Keep match',
      tone: 'danger',
    });
    if (!proceed) return;
    try {
      const updated = await api.post(`/matches/${m.id}/cancel`, {});
      setMatches(prev => prev.map(x => (x.id === m.id ? { ...x, ...updated } : x)));
      toast.success('Match cancelled');
    } catch (err: any) {
      toast.error(err.message || 'Failed to cancel match');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-72" />
        <div className="grid md:grid-cols-2 gap-4">
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
        </div>
      </div>
    );
  }

  const isFootball = activeTournament?.sport_code === 'football';
  const tournamentCancelled = activeTournament?.status === 'cancelled';
  const hasFixtures = matches.length > 0;
  const lockedCount = matches.filter(m => m.status !== 'scheduled' && m.status !== 'cancelled').length;
  const completedCount = matches.filter(m => m.status === 'completed').length;
  const liveCount = matches.filter(m => m.status === 'in_progress' || m.status === 'half_time' || m.status === 'innings_break').length;

  return (
    <div className="space-y-6">
      {/* Breadcrumb back to the tournaments list */}
      <Link
        to="/organization/tournaments"
        className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
        Back to Tournaments
      </Link>

      {/* Top Header Card — anchors the page to the specific tournament */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 border border-slate-800 shadow-2xl relative">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="flex items-start gap-4 min-w-0 w-full lg:w-auto">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-500 p-0.5 shadow-lg shadow-emerald-500/20 flex items-center justify-center shrink-0">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <Calendar className="w-7 h-7 text-emerald-400" />
              </div>
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                {activeTournament && (
                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider ${
                    isFootball ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                  }`}>
                    {isFootball ? '⚽ Football' : '🏏 Cricket'}
                  </span>
                )}
                {liveCount > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[11px] font-bold uppercase animate-pulse">
                    ● {liveCount} live now
                  </span>
                )}
                {matches.length > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-[11px] font-bold">
                    {completedCount}/{matches.length} completed
                  </span>
                )}
              </div>

              <h1 className="text-2xl sm:text-3xl font-black font-heading text-white tracking-tight truncate">
                {activeTournament ? activeTournament.name : 'Fixtures & Bracket Scheduler'}
              </h1>
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                {activeTournament && (activeTournament.village || activeTournament.district) && (
                  <>
                    <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                    <span className="truncate">{activeTournament.village}{activeTournament.village && activeTournament.district ? ', ' : ''}{activeTournament.district}</span>
                    <span className="text-slate-700">•</span>
                  </>
                )}
                <span>Round Robin or Single Elimination fixtures and stadium match venues</span>
              </p>
            </div>
          </div>

          <TournamentPicker
            tournaments={tournaments}
            value={selectedTourneyId}
            onChange={handleSelectTournament}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-6 pt-6 border-t border-slate-800">
          {tournamentCancelled ? (
            <span className="px-3 py-1.5 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xs font-bold flex items-center gap-1.5">
              <Ban className="w-3.5 h-3.5" />
              This tournament has been cancelled — fixtures are read-only.
            </span>
          ) : (<>
          <button
            disabled={generating}
            onClick={() => handleAutoGenerate('round_robin')}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>{hasFixtures ? 'Regenerate Round Robin' : 'Auto Round Robin'}</span>
          </button>
          <button
            disabled={generating}
            onClick={() => handleAutoGenerate('knockout')}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{hasFixtures ? 'Regenerate Knockout Bracket' : 'Generate Knockout Bracket'}</span>
          </button>
          {hasFixtures && (
            <span className="text-[11px] text-slate-400">
              {lockedCount > 0
                ? `Regenerating is blocked — ${lockedCount} match${lockedCount === 1 ? ' has' : 'es have'} already started.`
                : 'Regenerating replaces the current schedule.'}
            </span>
          )}
          </>)}
        </div>
      </div>

      {/* Match Cards List */}
      {matches.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="No fixtures scheduled yet"
          message="Approve at least two teams, then generate a round robin or knockout bracket to build the schedule."
        />
      ) : (
      <div className="grid md:grid-cols-2 gap-4">
        {matches.map(m => {
          const isLive = m.status === 'in_progress' || m.status === 'half_time' || m.status === 'innings_break';
          const isCancelled = m.status === 'cancelled';
          const canCancel = !isCancelled && m.status !== 'completed' && activeTournament?.status !== 'cancelled';

          return (
            <div key={m.id} className={`p-5 rounded-2xl glass-card border transition-all ${
              isLive ? 'border-rose-500/40 glow-emerald' : 'border-slate-800'
            } ${isCancelled ? 'opacity-60' : ''}`}>
              <div className="flex items-center justify-between text-xs pb-3 border-b border-slate-800">
                <span className="font-semibold text-slate-400">{m.round_name} • Match #{m.match_number}</span>
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase ${
                  isLive ? 'bg-rose-500/20 text-rose-400 animate-pulse' :
                  m.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' :
                  isCancelled ? 'bg-rose-500/10 text-rose-400 line-through' : 'bg-slate-800 text-slate-300'
                }`}>
                  {m.status.replace('_', ' ')}
                </span>
              </div>

              <div className="py-4 flex items-center justify-between">
                <div className="text-left flex-1 font-bold text-sm text-white truncate pr-2">
                  {m.team_a?.name || m.team_a_id}
                </div>
                <div className="px-3 py-1 rounded-xl bg-slate-950 border border-slate-800 font-mono font-black text-sm text-emerald-400">
                  {m.sport_code === 'football' ? (
                    `${m.football_state?.team_a_score || 0} - ${m.football_state?.team_b_score || 0}`
                  ) : (
                    `${m.cricket_state?.team_a_runs || 0}/${m.cricket_state?.team_a_wickets || 0}`
                  )}
                </div>
                <div className="text-right flex-1 font-bold text-sm text-white truncate pl-2">
                  {m.team_b?.name || m.team_b_id}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                <span className="text-slate-400 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-500" />
                  <span>{m.venue?.name || 'Main Stadium'}</span>
                </span>
                <div className="flex items-center gap-2">
                  {canCancel && (
                    <button
                      type="button"
                      onClick={() => handleCancelMatch(m)}
                      className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400"
                      title="Cancel match"
                      aria-label="Cancel match"
                    >
                      <Ban className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <Link
                    to={`/scoreboard/match/${m.id}`}
                    target="_blank"
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                    title="Open Scoreboard TV"
                  >
                    <Tv className="w-3.5 h-3.5" />
                  </Link>
                  {!isCancelled && (
                    <Link
                      to={`/organization/scorer/${m.id}`}
                      className="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 text-xs font-bold"
                    >
                      Live Scorer Pad →
                    </Link>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
};

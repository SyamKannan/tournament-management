import React, { useState, useEffect } from 'react';
import { SportsLoader } from '../../components/ui/SportsLoader';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../services/api';
import type {
  Player, PlayerStats, Team, Tournament, Organization, AuctionPlayer,
  PlayerMatchPerformance, PlayerCareer, PageMeta, CricketPlayerStats, FootballPlayerStats,
} from '../../types';
import { Trophy, Award, Flame, ChevronLeft, History } from 'lucide-react';
import { PlayerCodeBadge } from '../../components/PlayerCodeBadge';
import {
  playerPhoto, stat, overs, highestScore, bestBowling, matchDate, RESULT_STYLES,
} from '../../lib/playerStats';

const MATCHES_PER_PAGE = 10;

const StatTile: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: string }> = ({
  label, value, hint, tone = 'text-white',
}) => (
  <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 text-center">
    <span className="text-xs font-black uppercase tracking-widest text-slate-400 block">{label}</span>
    <div className={`text-3xl sm:text-4xl font-black font-mono mt-1 ${tone}`}>{value}</div>
    {hint && <span className="text-xs text-slate-500 font-semibold">{hint}</span>}
  </div>
);

const MiniStat: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
    <span className="text-xs text-slate-400 block">{label}</span>
    <span className="text-lg font-mono font-black text-white">{value}</span>
  </div>
);

const CricketBreakdown: React.FC<{ s: CricketPlayerStats }> = ({ s }) => (
  <div className="space-y-6">
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <StatTile label="Runs" value={s.runs_scored} hint={`SR ${stat(s.strike_rate)}`} tone="text-amber-400" />
      <StatTile label="Wickets" value={s.wickets_taken} hint={`Econ ${stat(s.economy_rate)}`} tone="text-cyan-400" />
      <StatTile label="Matches" value={s.matches} hint={`${s.innings_batted} innings batted`} />
      <StatTile label="Player of Match" value={s.player_of_match_count} hint="Awards" tone="text-yellow-400" />
    </div>

    <div className="grid md:grid-cols-2 gap-6">
      <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-3">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider font-heading">Batting</h3>
        <div className="grid grid-cols-3 gap-3">
          <MiniStat label="Average" value={stat(s.batting_average)} />
          <MiniStat label="High score" value={highestScore(s)} />
          <MiniStat label="Balls faced" value={s.balls_faced} />
          <MiniStat label="50s / 100s" value={`${s.fifties} / ${s.centuries}`} />
          <MiniStat label="4s / 6s" value={`${s.fours} / ${s.sixes}`} />
          <MiniStat label="Not outs / ducks" value={`${s.not_outs} / ${s.ducks}`} />
        </div>
      </div>

      <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-3">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider font-heading">Bowling & Fielding</h3>
        <div className="grid grid-cols-3 gap-3">
          <MiniStat label="Overs" value={overs(s.overs_bowled)} />
          <MiniStat label="Best" value={bestBowling(s)} />
          <MiniStat label="Average" value={stat(s.bowling_average)} />
          <MiniStat label="Maidens" value={s.maidens} />
          <MiniStat label="3W / 5W" value={`${s.three_wicket_hauls} / ${s.five_wicket_hauls}`} />
          <MiniStat label="Ct / St / RO" value={`${s.catches} / ${s.stumpings} / ${s.run_outs}`} />
        </div>
      </div>
    </div>
  </div>
);

const FootballBreakdown: React.FC<{ s: FootballPlayerStats }> = ({ s }) => (
  <div className="space-y-6">
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <StatTile label="Goals" value={s.goals} hint={`${s.penalties_scored} penalties`} tone="text-emerald-400" />
      <StatTile label="Assists" value={s.assists} tone="text-cyan-400" />
      <StatTile label="Matches" value={s.matches} hint={`${stat(s.goals_per_match)} goals per match`} tone="text-amber-400" />
      <StatTile label="Player of Match" value={s.player_of_match_count} hint="Awards" tone="text-yellow-400" />
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <MiniStat label="Clean sheets" value={s.clean_sheets} />
      <MiniStat label="Yellow / red cards" value={`${s.yellow_cards} / ${s.red_cards}`} />
      <MiniStat label="Penalties missed" value={s.penalties_missed} />
      <MiniStat label="Own goals" value={s.own_goals} />
    </div>
  </div>
);

export const PublicPlayerProfilePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<{
    player: Player;
    team?: Team | null;
    tournament?: Tournament | null;
    organization?: Organization | null;
    stats: PlayerStats;
    auction_info?: Partial<AuctionPlayer> | null;
  } | null>(null);
  const [matches, setMatches] = useState<PlayerMatchPerformance[]>([]);
  const [matchesMeta, setMatchesMeta] = useState<PageMeta | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [career, setCareer] = useState<PlayerCareer | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError('Player profile not found');
      setLoading(false);
      return;
    }

    const fetchProfile = async () => {
      try {
        setLoading(true);
        setError(null);
        setData(await api.get(`/players/${id}/profile`));

        // The match log and career fill in below the headline stats; either
        // failing leaves the rest of the profile standing.
        api.get(`/players/${id}/matches?per_page=${MATCHES_PER_PAGE}`)
          .then(res => { setMatches(res.data); setMatchesMeta(res.meta); })
          .catch(() => {});
        api.get(`/players/${id}/career`)
          .then(res => setCareer(res.career))
          .catch(() => {});
      } catch (err: any) {
        setError(err.message || 'Player profile not found');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [id]);

  const loadMoreMatches = async () => {
    if (!matchesMeta || matchesMeta.page >= matchesMeta.last_page) return;
    try {
      setLoadingMore(true);
      const res = await api.get(`/players/${id}/matches?per_page=${MATCHES_PER_PAGE}&page=${matchesMeta.page + 1}`);
      setMatches(prev => [...prev, ...res.data]);
      setMatchesMeta(res.meta);
    } catch {
      // keep what is already shown
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-white">
        <div className="flex flex-col items-center gap-3">
          <SportsLoader size="lg" />
          <span className="text-sm font-semibold text-slate-400">Loading Public Player Profile...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-center text-white">
        <div className="max-w-md p-8 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
          <h2 className="text-xl font-bold text-rose-400">Player Not Found</h2>
          <p className="text-xs text-slate-400">{error || 'This player profile does not exist.'}</p>
          <Link to="/" className="inline-block px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold">
            Return to Home
          </Link>
        </div>
      </div>
    );
  }

  const { player, team, tournament, organization, stats, auction_info } = data;
  const sport = stats.sport_code;
  const awards = stats.awards || [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      {/* Top Breadcrumb */}
      <div>
        <Link
          to={tournament?.slug ? `/tournaments/${tournament.slug}` : '/'}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>{tournament?.name ? `Back to ${tournament.name}` : 'Back to Tournaments'}</span>
        </Link>
      </div>

      {/* Header Profile Card */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 border border-slate-800 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 text-center sm:text-left">
          <div className="relative">
            <img
              src={playerPhoto(stats.photo, sport)}
              alt={player.full_name}
              className="w-28 h-28 sm:w-32 sm:h-32 rounded-3xl object-cover border-2 border-emerald-500/50 shadow-xl bg-slate-950"
            />
            {!!player.jersey_number && (
              <div className="absolute -bottom-2 -right-2 min-w-8 h-8 px-1 rounded-xl bg-emerald-600 text-white font-black font-mono text-sm flex items-center justify-center border-2 border-slate-950 shadow-md">
                #{player.jersey_number}
              </div>
            )}
          </div>

          <div className="space-y-1.5 flex-1">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-black uppercase tracking-widest">
                {sport}
              </span>
              <PlayerCodeBadge code={player.player_code} />
              {auction_info?.status === 'sold' && auction_info.sold_price != null && (
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-black uppercase">
                  AUCTION VALUE: ₹{auction_info.sold_price.toLocaleString()}
                </span>
              )}
            </div>

            <h1 className="text-3xl sm:text-4xl font-black font-heading text-white tracking-tight">
              {player.full_name}
            </h1>

            <div className="text-xs font-bold text-cyan-400">
              {player.football_position || player.cricket_role}
              {team && ` • ${team.name}`}
            </div>

            <p className="text-xs text-slate-400">
              {[organization?.name, tournament?.name].filter(Boolean).join(' • ')}
            </p>
          </div>
        </div>
      </div>

      {/* Tournament statistics */}
      {sport === 'cricket' && stats.cricket && <CricketBreakdown s={stats.cricket} />}
      {sport === 'football' && stats.football && <FootballBreakdown s={stats.football} />}

      {/* Career across tournaments — only worth a panel once there is more than one */}
      {career && career.tournaments_count > 1 && (
        <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider font-heading flex items-center gap-2">
            <History className="w-4 h-4 text-cyan-400" />
            <span>Career • {career.tournaments_count} Tournaments</span>
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {career.cricket && (
              <>
                <MiniStat label="Cricket matches" value={career.cricket.matches} />
                <MiniStat label="Career runs" value={career.cricket.runs_scored} />
                <MiniStat label="Career wickets" value={career.cricket.wickets_taken} />
                <MiniStat label="Batting average" value={stat(career.cricket.batting_average)} />
              </>
            )}
            {career.football && (
              <>
                <MiniStat label="Football matches" value={career.football.matches} />
                <MiniStat label="Career goals" value={career.football.goals} />
                <MiniStat label="Career assists" value={career.football.assists} />
                <MiniStat label="Clean sheets" value={career.football.clean_sheets} />
              </>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase text-xs">
                  <th className="pb-2">Tournament</th>
                  <th className="pb-2">Team</th>
                  <th className="pb-2 text-center">Matches</th>
                  <th className="pb-2 text-right">Headline</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {career.tournaments.map(entry => {
                  const s = entry.stats as CricketPlayerStats & FootballPlayerStats;
                  return (
                    <tr key={entry.player_id}>
                      <td className="py-2.5">
                        <Link to={`/players/${entry.player_id}`} className="font-bold text-white hover:text-emerald-400">
                          {entry.tournament.name}
                        </Link>
                      </td>
                      <td className="py-2.5 text-slate-400">{entry.team_name || '–'}</td>
                      <td className="py-2.5 text-center font-mono">{s.matches}</td>
                      <td className="py-2.5 text-right font-mono text-slate-300">
                        {entry.tournament.sport_code === 'cricket'
                          ? `${s.runs_scored} runs • ${s.wickets_taken} wkts`
                          : `${s.goals} goals • ${s.assists} ast`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MATCH LOG & AWARDS */}
      <div className="grid md:grid-cols-12 gap-6">
        <div className="md:col-span-7 p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-3">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider font-heading flex items-center gap-2">
            <Flame className="w-4 h-4 text-orange-400" />
            <span>Match by Match</span>
          </h3>

          {matches.length === 0 ? (
            <p className="text-xs text-slate-500">No matches played yet.</p>
          ) : (
            <div className="space-y-2 text-xs">
              {matches.map(m => (
                <div key={m.match_id} className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold text-white flex items-center gap-2">
                      <span className="truncate">vs {m.opponent_name}</span>
                      {m.player_of_match && <Trophy className="w-3.5 h-3.5 text-yellow-400 shrink-0" aria-label="Player of the match" />}
                    </div>
                    <div className="text-slate-300 font-mono mt-0.5">{m.summary}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {[m.round_name, matchDate(m.date)].filter(Boolean).join(' • ')}
                    </div>
                  </div>
                  {m.result ? (
                    <span className={`px-2 py-0.5 rounded-lg border text-xs font-black uppercase shrink-0 ${RESULT_STYLES[m.result]}`}>
                      {m.result}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-400 text-xs font-black uppercase shrink-0">
                      Live
                    </span>
                  )}
                </div>
              ))}

              {matchesMeta && matchesMeta.page < matchesMeta.last_page && (
                <button
                  onClick={loadMoreMatches}
                  disabled={loadingMore}
                  className="w-full py-2 rounded-xl border border-slate-800 text-slate-300 hover:bg-slate-800 font-bold disabled:opacity-50"
                >
                  {loadingMore ? 'Loading…' : `Show more (${matchesMeta.total - matches.length} left)`}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="md:col-span-5 p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-3">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider font-heading flex items-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-400" />
            <span>Honors & Achievements</span>
          </h3>

          {awards.length === 0 ? (
            <p className="text-xs text-slate-500">No awards yet.</p>
          ) : (
            <div className="space-y-2 text-xs">
              {awards.map(aw => (
                <div key={aw.id} className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center gap-3">
                  <Award className="w-5 h-5 text-amber-400 shrink-0" />
                  <div>
                    <div className="font-bold text-white">{aw.title}{aw.opponent_name ? ` vs ${aw.opponent_name}` : ''}</div>
                    <div className="text-xs text-slate-400">{aw.tournament_name} • {matchDate(aw.date)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

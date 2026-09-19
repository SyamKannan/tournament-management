import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../services/api';
import type { Tournament, Organization, Match, Standing, Sponsor, Announcement, Team } from '../../types';
import {
  Trophy, Calendar, MapPin, DollarSign, Users, Tv,
  Award, Radio, Gavel, Flame
} from 'lucide-react';
import { FEATURE_AUCTION_ENABLED } from '../../config';
import { periodLabel, tossDecisionPhrase } from '../../lib/football';
import { playerPhoto, stat } from '../../lib/playerStats';
import { label } from '../../lib/labels';

export const PublicTournamentPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<{
    tournament: Tournament;
    organization: Organization;
    teams: Team[];
    matches: Match[];
    standings: Standing[];
    sponsors: Sponsor[];
    announcements: Announcement[];
    registration_link?: any;
  } | null>(null);

  const [leaderboards, setLeaderboards] = useState<any | null>(null);
  const [auctionData, setAuctionData] = useState<any | null>(null);

  const [activeTab, setActiveTab] = useState<'matches' | 'standings' | 'leaderboards' | 'auction' | 'teams' | 'sponsors'>('matches');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    const fetchTournament = async () => {
      try {
        setIsLoading(true);
        const res = await api.get(`/tournaments/public/${slug || 'malappuram-7s-football-2026'}`);
        setData(res);

        if (res.tournament?.id) {
          // Fetch leaderboards
          api.get(`/players/tournament/${res.tournament.id}/leaderboard`)
            .then(l => setLeaderboards(l))
            .catch(() => {});

          // Fetch auction
          if (FEATURE_AUCTION_ENABLED) {
            api.get(`/auctions/tournament/${res.tournament.id}`)
              .then(a => setAuctionData(a))
              .catch(() => {});
          }
        }
      } catch (err: any) {
        setError(err.message || 'Tournament not found');
      } finally {
        setIsLoading(false);
      }
    };
    fetchTournament();
  }, [slug]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="flex items-center gap-3 text-emerald-400">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="font-semibold text-sm">Loading Tournament Hub...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-center">
        <h2 className="text-xl font-bold text-white mb-2">Tournament Not Found</h2>
        <p className="text-xs text-slate-400 mb-6">{error || 'This tournament page may be private or deleted.'}</p>
        <Link to="/" className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold">
          Return to Platform Home
        </Link>
      </div>
    );
  }

  const { tournament, organization, teams, matches, standings, sponsors, announcements } = data;
  const isFootball = tournament.sport_code === 'football';
  const liveMatches = matches.filter(m => m.status === 'in_progress' || m.status === 'half_time' || m.status === 'innings_break');
  const upcomingMatches = matches.filter(m => m.status === 'scheduled' || m.status === 'toss');

  // The live cards used to print the same made-up score for every match.
  // Cricket shows the innings in play: the first innings tally, or the chase.
  const liveScore = (m: Match) => {
    if (m.sport_code === 'football') {
      return `${m.football_state?.team_a_score ?? 0} : ${m.football_state?.team_b_score ?? 0}`;
    }
    const state = m.cricket_state;
    if (!state) return '0/0';
    return state.current_innings === 2
      ? `${state.team_b_runs}/${state.team_b_wickets}`
      : `${state.team_a_runs}/${state.team_a_wickets}`;
  };

  const liveProgress = (m: Match) => {
    if (m.sport_code === 'football') {
      const state = m.football_state;
      return state ? `${periodLabel(state.current_half)} • ${state.match_minute}'` : 'Kick-off soon';
    }
    const state = m.cricket_state;
    if (!state) return 'Starting soon';
    const overs = state.current_innings === 2 ? state.team_b_overs : state.team_a_overs;
    return `Innings ${state.current_innings} • ${overs} ov${state.target_runs ? ` • Target ${state.target_runs}` : ''}`;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20 font-sans">
      {/* Tournament Hero Banner */}
      <div className="relative border-b border-slate-800/80 bg-gradient-to-b from-slate-900 to-slate-950">
        <div className={`absolute inset-0 pointer-events-none ${isFootball ? 'bg-[radial-gradient(40rem_16rem_at_15%_0%,rgba(200, 245, 53,0.14),transparent)]' : 'bg-[radial-gradient(40rem_16rem_at_15%_0%,rgba(245,158,11,0.14),transparent)]'}`} aria-hidden="true" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5 sm:gap-6">
            <div className="flex items-start gap-3.5 sm:gap-4 min-w-0">
              {tournament.logo && !logoFailed ? (
                <img
                  src={tournament.logo}
                  alt={tournament.name}
                  onError={() => setLogoFailed(true)}
                  className="w-16 h-16 sm:w-24 sm:h-24 rounded-2xl object-cover border-2 border-slate-700 shadow-xl bg-slate-900 flex-shrink-0"
                />
              ) : (
                <div
                  aria-hidden="true"
                  className={`w-16 h-16 sm:w-24 sm:h-24 rounded-2xl flex-shrink-0 flex items-center justify-center text-3xl sm:text-5xl shadow-xl border ${
                    isFootball
                      ? 'bg-gradient-to-br from-emerald-500/25 to-cyan-500/10 border-emerald-500/30'
                      : 'bg-gradient-to-br from-amber-500/25 to-orange-500/10 border-amber-500/30'
                  }`}
                >
                  {isFootball ? '⚽' : '🏏'}
                </div>
              )}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                    isFootball ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  }`}>
                    {isFootball ? '⚽ Football 7s' : '🏏 Cricket T20'}
                  </span>
                  <span className="text-xs text-slate-400 font-medium">
                    Host: <Link to={`/organizations/${organization.slug}`} className="text-slate-200 hover:text-emerald-400 underline font-semibold">{organization.name}</Link>
                  </span>
                </div>

                <h1 className="text-xl sm:text-3xl lg:text-4xl font-black font-heading text-white tracking-tight leading-tight">
                  {tournament.name}
                </h1>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-400 mt-2.5">
                  <a
                    href={(tournament as any).settings?.google_maps_url || `https://maps.google.com/?q=${encodeURIComponent(tournament.location || `${tournament.village}, ${tournament.district}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-semibold hover:underline bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20 transition-colors"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{tournament.location || `${tournament.village}, ${tournament.district}`} 🗺️</span>
                  </a>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{new Date(tournament.start_date).toLocaleDateString()} - {new Date(tournament.end_date).toLocaleDateString()}</span>
                  </span>
                  <span className="flex items-center gap-1 font-mono text-amber-400 font-bold">
                    <DollarSign className="w-3.5 h-3.5" />
                    <span>1st Prize: ₹{tournament.prize_money.toLocaleString()}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Action CTAs */}
            <div className="w-full md:w-auto grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-3">
              {liveMatches.length > 0 && (
                <Link
                  to={`/scoreboard/match/${liveMatches[0].id}`}
                  target="_blank"
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 animate-pulse-subtle"
                >
                  <Tv className="w-4 h-4" />
                  <span>Watch 16:9 Live TV ↗</span>
                </Link>
              )}

              {auctionData?.auction && (
                <Link
                  to={`/auction/${auctionData.auction.id}`}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs font-black flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/20"
                >
                  <Gavel className="w-4 h-4" />
                  <span>Live Player Auction</span>
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-t border-slate-800/60">
          <nav className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar fade-x -mx-4 px-4 sm:mx-0 sm:px-0 py-2.5 text-xs font-semibold">
            {[
              { id: 'matches', label: 'Matches & Fixtures', icon: Calendar, badge: liveMatches.length > 0 ? 'LIVE' : undefined },
              { id: 'leaderboards', label: 'Player Stats & Leaders', icon: Flame },
              { id: 'standings', label: 'Points Table', icon: Trophy },
              ...(FEATURE_AUCTION_ENABLED ? [{ id: 'auction', label: 'Player Auction', icon: Gavel }] : []),
              { id: 'teams', label: `Teams (${teams.length})`, icon: Users },
              { id: 'sponsors', label: 'Sponsors & Info', icon: Award }
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`shrink-0 px-3.5 sm:px-4 py-2 rounded-xl flex items-center gap-2 whitespace-nowrap border transition-all ${
                    activeTab === tab.id
                      ? 'bg-slate-800 text-white border-slate-700 shadow-sm font-bold'
                      : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                  {tab.badge && (
                    <span className="px-1.5 py-0.5 rounded bg-rose-500 text-white text-[11px] font-black animate-pulse">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8">
        {/* Match announcements, each labelled with the fixture it is about */}
        {announcements.length > 0 && (
          <div className="mb-6 space-y-2">
            {announcements.map(ann => {
              const annMatch = matches.find(m => m.id === ann.match_id);
              return (
              <div key={ann.id} className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-start gap-3 text-xs">
                <Radio className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  {annMatch && (
                    <div className="text-[11px] font-bold uppercase tracking-wide text-amber-400/80">
                      Match #{annMatch.match_number} · {annMatch.team_a?.name || annMatch.team_a_id} vs {annMatch.team_b?.name || annMatch.team_b_id}
                    </div>
                  )}
                  <div className="font-bold text-white">{ann.title}</div>
                  <div className="text-[11px] opacity-90 mt-0.5">{ann.message}</div>
                </div>
              </div>
              );
            })}
          </div>
        )}

        {/* TAB 1: MATCHES & FIXTURES */}
        {activeTab === 'matches' && (
          <div className="space-y-8">
            {/* Live Matches Section */}
            {liveMatches.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                  <h3 className="text-base font-bold font-heading text-white uppercase tracking-wider">
                    Live Stadium Matches
                  </h3>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  {liveMatches.map(m => (
                    <div key={m.id} className="p-5 rounded-3xl bg-slate-900 border-2 border-rose-500/40 shadow-xl space-y-4">
                      <div className="flex items-center justify-between text-xs">
                        <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 font-bold uppercase text-[11px]">
                          {m.status === 'in_progress' ? '● Live' : m.status === 'innings_break' ? 'Innings Break' : 'Half Time'}
                        </span>
                        <span className="text-slate-400 font-medium">{m.round_name}</span>
                      </div>

                      <div className="flex items-center justify-between py-2">
                        <div className="text-right flex-1">
                          <h4 className="font-bold text-white text-base">{m.team_a?.name || m.team_a_id}</h4>
                        </div>
                        <div className="px-6 text-center shrink-0">
                          <span className="font-mono text-2xl sm:text-3xl font-black text-emerald-400">
                            {liveScore(m)}
                          </span>
                        </div>
                        <div className="text-left flex-1">
                          <h4 className="font-bold text-white text-base">{m.team_b?.name || m.team_b_id}</h4>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-800 flex justify-between items-center text-xs">
                        <span className="text-slate-400 font-mono">{liveProgress(m)}</span>
                        <Link
                          to={`/scoreboard/match/${m.id}`}
                          target="_blank"
                          className="text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1"
                        >
                          <span>Full Scoreboard ↗</span>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upcoming Matches */}
            <div>
              <h3 className="text-base font-bold font-heading text-white uppercase tracking-wider mb-4">
                Upcoming Fixtures ({upcomingMatches.length})
              </h3>
              <div className="grid md:grid-cols-2 gap-4">
                {upcomingMatches.map(m => {
                  const tossWinnerName = m.toss_winner_team_id === m.team_a_id
                    ? (m.team_a?.name || m.team_a_id)
                    : m.toss_winner_team_id === m.team_b_id
                      ? (m.team_b?.name || m.team_b_id)
                      : null;

                  return (
                    <div key={m.id} className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-bold text-white text-sm">{m.team_a?.name || m.team_a_id} vs {m.team_b?.name || m.team_b_id}</div>
                        <div className="text-slate-400 mt-1">{m.round_name} • {new Date(m.scheduled_at).toLocaleString()}</div>
                        {tossWinnerName && m.toss_decision && (
                          <div className="text-amber-400 mt-1 font-semibold">
                            🪙 {tossWinnerName} won the toss and chose to {tossDecisionPhrase(m.toss_decision)}
                          </div>
                        )}
                      </div>
                      <span className="px-2.5 py-1 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 font-bold uppercase text-[11px]">
                        Scheduled
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: LEADERBOARDS & PLAYER STATS */}
        {activeTab === 'leaderboards' && (
          <div className="space-y-8">
            {leaderboards?.sport === 'football' ? (
              <div className="space-y-6">
                {/* Golden Boot Top Cards */}
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Golden Boot Leader */}
                  {leaderboards.golden_boot && (
                    <div className="p-6 rounded-3xl bg-gradient-to-r from-amber-500/20 via-slate-900 to-amber-500/20 border border-amber-500/40 shadow-xl flex items-center gap-5">
                      <img
                        src={playerPhoto(leaderboards.golden_boot.photo, tournament.sport_code)}
                        alt={leaderboards.golden_boot.full_name}
                        className="w-20 h-20 rounded-2xl object-cover border-2 border-amber-400 shadow-md shrink-0"
                      />
                      <div>
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[11px] font-black uppercase tracking-widest">
                          🏆 GOLDEN BOOT LEADER
                        </span>
                        <h4 className="text-xl font-black text-white font-heading mt-1">{leaderboards.golden_boot.full_name}</h4>
                        <div className="text-xs text-slate-400">{leaderboards.golden_boot.team_name}</div>
                        <div className="text-2xl font-black font-mono text-amber-400 mt-1.5">
                          {leaderboards.golden_boot.goals} Goals <span className="text-xs font-normal text-slate-400">({leaderboards.golden_boot.matches} matches)</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Top Playmaker Leader */}
                  {leaderboards.top_playmaker && (
                    <div className="p-6 rounded-3xl bg-gradient-to-r from-cyan-500/20 via-slate-900 to-cyan-500/20 border border-cyan-500/40 shadow-xl flex items-center gap-5">
                      <img
                        src={playerPhoto(leaderboards.top_playmaker.photo, tournament.sport_code)}
                        alt={leaderboards.top_playmaker.full_name}
                        className="w-20 h-20 rounded-2xl object-cover border-2 border-cyan-400 shadow-md shrink-0"
                      />
                      <div>
                        <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-[11px] font-black uppercase tracking-widest">
                          🎯 TOP PLAYMAKER
                        </span>
                        <h4 className="text-xl font-black text-white font-heading mt-1">{leaderboards.top_playmaker.full_name}</h4>
                        <div className="text-xs text-slate-400">{leaderboards.top_playmaker.team_name}</div>
                        <div className="text-2xl font-black font-mono text-cyan-400 mt-1.5">
                          {leaderboards.top_playmaker.assists} Assists <span className="text-xs font-normal text-slate-400">({leaderboards.top_playmaker.matches} matches)</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Top Goal Scorers Table */}
                <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-heading">
                    Tournament Top Goal Scorers
                  </h3>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 uppercase text-[11px]">
                          <th className="pb-3">Rank</th>
                          <th className="pb-3">Player</th>
                          <th className="pb-3">Team</th>
                          <th className="pb-3 text-center">Matches</th>
                          <th className="pb-3 text-center">Penalties</th>
                          <th className="pb-3 text-right">Goals</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {(leaderboards.top_scorers || []).map((s: any, idx: number) => (
                          <tr key={s.player_id} className="hover:bg-slate-800/40 transition-colors">
                            <td className="py-3 font-mono font-bold text-slate-400">{idx + 1}</td>
                            <td className="py-3">
                              <Link to={`/players/${s.player_id}`} className="font-bold text-white hover:text-emerald-400 flex items-center gap-2">
                                <img src={playerPhoto(s.photo, tournament.sport_code)} alt={s.full_name} className="w-6 h-6 rounded-md object-cover" />
                                <span>{s.full_name}</span>
                              </Link>
                            </td>
                            <td className="py-3 text-slate-400">{s.team_name}</td>
                            <td className="py-3 text-center font-mono">{s.matches}</td>
                            <td className="py-3 text-center font-mono">{s.penalties}</td>
                            <td className="py-3 text-right font-mono font-black text-emerald-400 text-sm">{s.goals}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              /* Cricket Leaders (Orange & Purple Caps) */
              <div className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Orange Cap */}
                  {leaderboards?.orange_cap && (
                    <div className="p-6 rounded-3xl bg-gradient-to-r from-amber-500/20 via-slate-900 to-amber-500/20 border border-amber-500/40 shadow-xl flex items-center gap-5">
                      <img
                        src={playerPhoto(leaderboards.orange_cap.photo, tournament.sport_code)}
                        alt={leaderboards.orange_cap.full_name}
                        className="w-20 h-20 rounded-2xl object-cover border-2 border-amber-400 shadow-md shrink-0"
                      />
                      <div>
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[11px] font-black uppercase tracking-widest">
                          🧢 ORANGE CAP (MOST RUNS)
                        </span>
                        <h4 className="text-xl font-black text-white font-heading mt-1">{leaderboards.orange_cap.full_name}</h4>
                        <div className="text-xs text-slate-400">{leaderboards.orange_cap.team_name}</div>
                        <div className="text-2xl font-black font-mono text-amber-400 mt-1.5">
                          {leaderboards.orange_cap.runs} Runs <span className="text-xs font-normal text-slate-400">(SR: {stat(leaderboards.orange_cap.strike_rate)})</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Purple Cap */}
                  {leaderboards?.purple_cap && (
                    <div className="p-6 rounded-3xl bg-gradient-to-r from-purple-500/20 via-slate-900 to-purple-500/20 border border-purple-500/40 shadow-xl flex items-center gap-5">
                      <img
                        src={playerPhoto(leaderboards.purple_cap.photo, tournament.sport_code)}
                        alt={leaderboards.purple_cap.full_name}
                        className="w-20 h-20 rounded-2xl object-cover border-2 border-purple-400 shadow-md shrink-0"
                      />
                      <div>
                        <span className="px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30 text-[11px] font-black uppercase tracking-widest">
                          🧢 PURPLE CAP (MOST WICKETS)
                        </span>
                        <h4 className="text-xl font-black text-white font-heading mt-1">{leaderboards.purple_cap.full_name}</h4>
                        <div className="text-xs text-slate-400">{leaderboards.purple_cap.team_name}</div>
                        <div className="text-2xl font-black font-mono text-purple-400 mt-1.5">
                          {leaderboards.purple_cap.wickets} Wickets <span className="text-xs font-normal text-slate-400">(Econ: {stat(leaderboards.purple_cap.economy)})</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: POINTS TABLE */}
        {activeTab === 'standings' && (
          <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase text-[11px]">
                  <th className="pb-3">Rank</th>
                  <th className="pb-3">Team</th>
                  <th className="pb-3 text-center">P</th>
                  <th className="pb-3 text-center">W</th>
                  <th className="pb-3 text-center">D</th>
                  <th className="pb-3 text-center">L</th>
                  <th className="pb-3 text-center">Pts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {standings.map((s, idx) => (
                  <tr key={s.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 font-bold text-slate-400">{idx + 1}</td>
                    <td className="py-3 font-sans font-bold text-white">{s.team_name || s.team_id}</td>
                    <td className="py-3 text-center">{s.played}</td>
                    <td className="py-3 text-center text-emerald-400 font-bold">{s.won}</td>
                    <td className="py-3 text-center">{s.drawn}</td>
                    <td className="py-3 text-center text-rose-400">{s.lost}</td>
                    <td className="py-3 text-center font-black text-amber-400 text-sm">{s.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 4: PLAYER AUCTION */}
        {activeTab === 'auction' && (
          <div className="space-y-6">
            {auctionData?.auction ? (
              <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 shadow-xl space-y-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                  <div>
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[11px] font-black uppercase tracking-widest">
                      OFFICIAL AUCTION HUB
                    </span>
                    <h3 className="text-xl font-black text-white font-heading mt-1">
                      {auctionData.auction.title}
                    </h3>
                  </div>

                  <div className="flex items-center gap-3">
                    <Link
                      to={`/register/player-auction/${auctionData.auction.token}`}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-colors"
                    >
                      Register as Player
                    </Link>

                    <Link
                      to={`/auction/${auctionData.auction.id}`}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-black text-xs shadow-md"
                    >
                      Open Live Arena ↗
                    </Link>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center">
                    <span className="text-slate-400 uppercase text-[11px] font-bold block">Virtual Team Purse</span>
                    <span className="text-xl font-mono font-black text-amber-400">₹{auctionData.auction.team_purse.toLocaleString()}</span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">Bidding Points</span>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center">
                    <span className="text-slate-400 uppercase text-[11px] font-bold block">Registered</span>
                    <span className="text-xl font-mono font-black text-cyan-400">{auctionData.registered_count} Players</span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">In Player Pool</span>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center">
                    <span className="text-slate-400 uppercase text-[11px] font-bold block">Sold</span>
                    <span className="text-xl font-mono font-black text-emerald-400">{auctionData.sold_count} Sold</span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">Squad Allocated</span>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center">
                    <span className="text-slate-400 uppercase text-[11px] font-bold block">Min Increment</span>
                    <span className="text-xl font-mono font-black text-slate-300">₹{auctionData.auction.min_bid_increment}</span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">Per Bid Raise</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs text-slate-400 flex items-center gap-3">
                  <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 font-bold shrink-0 text-sm">💡</div>
                  <div>
                    <strong className="text-slate-200">Virtual-Money Tournament Auction:</strong> Teams bid using virtual budget allocations. The final auction price becomes the player's official fee entitlement handled directly by the tournament committee.
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 rounded-3xl bg-slate-900 border border-slate-800 text-center text-xs text-slate-400">
                No active player auction scheduled for this tournament.
              </div>
            )}
          </div>
        )}

        {/* TAB 5: REGISTERED TEAMS */}
        {activeTab === 'teams' && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {teams.map(team => (
              <div key={team.id} className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="w-4 h-4 rounded-full" style={{ backgroundColor: team.jersey_color }} />
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[11px] font-bold uppercase">
                      {label(team.status)}
                    </span>
                  </div>
                  <h4 className="text-base font-bold text-white font-heading">{team.name}</h4>
                  <p className="text-xs text-slate-400 mt-1">{team.village}, {team.district}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB 6: SPONSORS & INFO */}
        {activeTab === 'sponsors' && (
          <div className="space-y-6">
            <h3 className="text-base font-bold font-heading text-white uppercase tracking-wider">
              Tournament Official Sponsors
            </h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {sponsors.map(sp => (
                <div key={sp.id} className="p-5 rounded-2xl bg-slate-900 border border-slate-800 text-center">
                  <img src={sp.logo} alt={sp.name} className="w-16 h-16 rounded-xl object-cover mx-auto mb-3 border border-slate-700" />
                  <div className="font-bold text-white text-xs">{sp.name}</div>
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[11px] font-bold uppercase mt-1 inline-block">
                    {sp.tier} Partner
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

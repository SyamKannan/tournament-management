import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../services/api';
import { websocketUrl } from '../../config';
import { useToast } from '../../components/ui/Toast';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/Feedback';
import {
  Gavel, Wallet, Users, ArrowLeft, TrendingUp, CheckCircle2, Trophy,
} from 'lucide-react';

interface MyTeamView {
  auction: any;
  tournament: any;
  team: any;
  purse: { total_purse: number; spent_amount: number; remaining_purse: number; players_bought_count: number; max_players: number };
  current_player: any | null;
  squad: any[];
  bidding: {
    open: boolean;
    is_leading: boolean;
    leading_team_name: string | null;
    current_bid: number;
    next_bid: number;
    can_afford: boolean;
    squad_full: boolean;
    blocked_reason: string | null;
  };
  my_bids: any[];
  bid_history: any[];
}

const money = (value: number) => '₹' + Math.round(value).toLocaleString('en-IN');

/**
 * The team manager's side of a live auction.
 *
 * Deliberately single-purpose: who is on the hammer, what the next bid costs,
 * one button to place it, and what the team has left. Running the auction —
 * calling players, hammering sold — belongs to the organizer, not here.
 */
export const TeamAuctionPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();

  const [data, setData] = useState<MyTeamView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bidding, setBidding] = useState(false);

  // Remembers whether we held the top bid, so being outbid can be announced
  // once rather than on every refresh.
  const wasLeading = useRef(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api.get<MyTeamView>(`/auctions/${id}/my-team`);

      if (wasLeading.current && !res.bidding.is_leading && res.bidding.open) {
        toast.warning('You have been outbid', `${res.bidding.leading_team_name} now leads at ${money(res.bidding.current_bid)}.`);
      }
      wasLeading.current = res.bidding.is_leading;

      setData(res);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Could not load the auction.');
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => { load(); }, [load]);

  // Live updates: the room pushes every hammer call, bid and sale.
  useEffect(() => {
    if (!id) return;

    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      try {
        socket = new WebSocket(websocketUrl());
        socket.onopen = () => socket?.send(JSON.stringify({ type: 'SUBSCRIBE', room: `auction:${id}` }));
        socket.onmessage = event => {
          const message = JSON.parse(event.data);
          if (['PLAYER_ON_HAMMER', 'BID_PLACED', 'PLAYER_SOLD', 'PLAYER_UNSOLD', 'ACCELERATED_ROUND_STARTED', 'AUCTION_STATUS_CHANGED'].includes(message.type)) {
            load();
          }
        };
        // Reconnect quietly; the page still works on the polling fallback below.
        socket.onclose = () => { retry = setTimeout(connect, 4000); };
      } catch {
        retry = setTimeout(connect, 4000);
      }
    };

    connect();
    // Safety net in case the gateway is unavailable.
    const poll = setInterval(load, 15000);

    return () => {
      if (retry) clearTimeout(retry);
      clearInterval(poll);
      socket?.close();
    };
  }, [id, load]);

  const placeBid = async () => {
    if (!data || bidding) return;
    setBidding(true);
    try {
      await api.post(`/auctions/${id}/place-bid`, { amount: data.bidding.next_bid });
      toast.success(`Bid placed at ${money(data.bidding.next_bid)}`);
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Bid failed');
    } finally {
      setBidding(false);
    }
  };

  if (loading) return <LoadingState label="Joining the auction room…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return null;

  const { auction, tournament, team, purse, current_player: player, squad, bidding: bid, my_bids } = data;
  const spentPercent = purse.total_purse > 0 ? (purse.spent_amount / purse.total_purse) * 100 : 0;

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">

      <div className="flex items-center justify-between gap-3">
        <Link to="/team/auctions" className="flex items-center gap-2 text-sm font-semibold text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          My auctions
        </Link>
        <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wide ${
          auction.status === 'live'
            ? 'bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/30 animate-live-blink'
            : 'bg-slate-800 text-slate-400 ring-1 ring-slate-700'
        }`}>
          {auction.status === 'live' ? '● Live' : auction.status}
        </span>
      </div>

      <div>
        <h1 className="text-xl sm:text-2xl font-black font-heading text-white">{team.name}</h1>
        <p className="text-sm text-slate-400 mt-0.5">{tournament?.name}</p>
      </div>

      {/* Purse — the number a manager checks before every bid. */}
      <div className="rounded-2xl bg-slate-900/70 ring-1 ring-slate-800 p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-300">
            <Wallet className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            Purse remaining
          </span>
          <span className="text-xs text-slate-400">
            {purse.players_bought_count}/{purse.max_players} players
          </span>
        </div>

        <div className="text-3xl font-black text-emerald-400 font-mono-score">{money(purse.remaining_purse)}</div>
        <div className="mt-3 h-2 rounded-full bg-slate-800 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500"
               style={{ width: `${Math.min(100, spentPercent)}%` }} />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Spent {money(purse.spent_amount)} of {money(purse.total_purse)}
        </p>
      </div>

      {/* On the hammer */}
      <div className={`rounded-2xl p-5 ring-1 transition-colors ${
        bid.is_leading ? 'bg-emerald-950/30 ring-emerald-500/40' : 'bg-slate-900/70 ring-slate-800'
      }`}>
        <h2 className="flex items-center gap-2 text-sm font-bold text-white mb-4">
          <Gavel className="w-4 h-4 text-amber-400" aria-hidden="true" />
          On the hammer
        </h2>

        {!player ? (
          <p className="text-sm text-slate-400 py-6 text-center">
            Waiting for the auctioneer to call the next player.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-4">
              <img src={player.photo} alt="" className="w-16 h-16 rounded-xl object-cover ring-1 ring-slate-700" />
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold text-white truncate">{player.full_name}</p>
                <p className="text-xs text-slate-400 mt-0.5 truncate">
                  {player.football_position || player.cricket_role || 'Player'}
                  {player.age ? ` · ${player.age} yrs` : ''}
                  {player.village ? ` · ${player.village}` : ''}
                </p>
                <span className="inline-block mt-1.5 px-2 py-0.5 rounded bg-slate-800 text-[11px] font-bold text-slate-300">
                  {player.category} · base {money(player.base_price)}
                </span>
              </div>
            </div>

            <div className="mt-5 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs text-slate-400">Current bid</p>
                <p className="text-2xl font-black text-white font-mono-score">{money(bid.current_bid)}</p>
                {bid.leading_team_name && (
                  <p className={`text-xs mt-0.5 font-semibold ${bid.is_leading ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {bid.is_leading ? 'You are leading' : `${bid.leading_team_name} leads`}
                  </p>
                )}
              </div>

              <button
                onClick={placeBid}
                disabled={!bid.open || bidding || !bid.can_afford || bid.squad_full || bid.is_leading}
                className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600
                           hover:from-emerald-500 hover:to-teal-500 text-white font-bold shadow-lg shadow-emerald-900/40
                           disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none transition-colors
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                {bidding ? 'Placing…' : `Bid ${money(bid.next_bid)}`}
              </button>
            </div>

            {bid.blocked_reason && (
              <p className="mt-3 text-xs text-slate-500 text-right">{bid.blocked_reason}</p>
            )}
          </>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {/* Squad bought so far */}
        <section className="rounded-2xl bg-slate-900/70 ring-1 ring-slate-800 p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-white mb-4">
            <Users className="w-4 h-4 text-cyan-400" aria-hidden="true" />
            My squad ({squad.length})
          </h2>

          {squad.length === 0 ? (
            <p className="text-sm text-slate-500 py-4">No players bought yet.</p>
          ) : (
            <ul className="space-y-2">
              {squad.map(p => (
                <li key={p.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-950/60">
                  <img src={p.photo} alt="" className="w-9 h-9 rounded-lg object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white truncate">{p.full_name}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {p.football_position || p.cricket_role || 'Player'}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-emerald-400 font-mono-score shrink-0">
                    {money(p.sold_price || 0)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* This team's own bids */}
        <section className="rounded-2xl bg-slate-900/70 ring-1 ring-slate-800 p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-white mb-4">
            <TrendingUp className="w-4 h-4 text-amber-400" aria-hidden="true" />
            My bids
          </h2>

          {my_bids.length === 0 ? (
            <p className="text-sm text-slate-500 py-4">You have not bid yet.</p>
          ) : (
            <ul className="space-y-2 max-h-72 overflow-y-auto">
              {my_bids.map(b => (
                <li key={b.id} className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-950/60">
                  <span className="text-xs text-slate-400">
                    {new Date(b.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="text-sm font-bold text-white font-mono-score">{money(b.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};

/**
 * Landing list for a manager who runs teams in more than one auction.
 */
export const TeamAuctionsListPage: React.FC = () => {
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get('/auctions/mine')
      .then(setRows)
      .catch(err => setError(err?.message || 'Could not load your auctions.'));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!rows) return <LoadingState label="Loading your auctions…" />;

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-black font-heading text-white">My auctions</h1>
        <p className="text-sm text-slate-400 mt-1">Tournaments where your team takes part in a player auction.</p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Gavel}
          title="No auctions to join"
          message="When an organizer enables an auction for a tournament your team is entered in, it will appear here."
        />
      ) : (
        <div className="space-y-3">
          {rows.map(({ auction, tournament, team, purse }) => (
            <Link
              key={auction.id}
              to={`/team/auction/${auction.id}`}
              className="block p-5 rounded-2xl bg-slate-900/70 ring-1 ring-slate-800 hover:ring-emerald-500/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-bold text-white truncate">{tournament?.name}</p>
                  <p className="text-sm text-slate-400 mt-0.5 truncate flex items-center gap-1.5">
                    <Trophy className="w-3.5 h-3.5" aria-hidden="true" />
                    {team?.name}
                  </p>
                </div>
                <span className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase ${
                  auction.status === 'live'
                    ? 'bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/30'
                    : 'bg-slate-800 text-slate-400 ring-1 ring-slate-700'
                }`}>
                  {auction.status}
                </span>
              </div>

              {purse && (
                <div className="mt-3 flex items-center gap-4 text-xs text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                    {money(purse.remaining_purse)} left
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
                    {purse.players_bought_count}/{purse.max_players} players
                  </span>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../../services/api';
import type { Team, Tournament, RegistrationReceipt } from '../../types';
import {
  Download, Phone, ArrowLeft, Users, MapPin, Clock, CheckCircle2
} from 'lucide-react';
import { ReceiptModal } from '../../components/ReceiptModal';
import { PlayerCodeBadge } from '../../components/PlayerCodeBadge';
import { OfflinePaymentModal } from '../../components/OfflinePaymentModal';
import { useToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { Skeleton, SkeletonTable, EmptyState } from '../../components/ui/Feedback';
import { TournamentPicker } from '../../components/ui/TournamentPicker';
import { label } from '../../lib/labels';

export const OrgTeamsPage: React.FC = () => {
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { tournamentId: routeTournamentId } = useParams<{ tournamentId: string }>();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTourneyId, setSelectedTourneyId] = useState<string>('');
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [selectedReceipt, setSelectedReceipt] = useState<RegistrationReceipt | null>(null);
  const [paymentTeam, setPaymentTeam] = useState<Team | null>(null);
  const [rosterTeam, setRosterTeam] = useState<Team | null>(null);
  // A tournament can take sixty-odd teams. Finding the one whose manager is
  // on the phone meant scrolling the whole table.
  const [teamSearch, setTeamSearch] = useState('');
  const [teamStatus, setTeamStatus] = useState<'all' | 'pending' | 'approved' | 'unpaid'>('all');

  useEffect(() => {
    // Left before the list arrived (another sidebar item was clicked): the late
    // answer must not redirect back here.
    let cancelled = false;
    const fetchTourneys = async () => {
      try {
        setLoading(true);
        const res = await api.get('/tournaments');
        if (cancelled) return;
        setTournaments(res);
        if (!routeTournamentId && res.length > 0) {
          // Entered without a specific tournament (e.g. from the sidebar) — pin
          // the URL to one so the page always shows an unambiguous context.
          navigate(`/organization/tournaments/${res[0].id}/teams`, { replace: true });
        }
      } catch (err) {
        console.error('Failed to load tournaments', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchTourneys();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (routeTournamentId) {
      setSelectedTourneyId(routeTournamentId);
    }
  }, [routeTournamentId]);

  const handleSelectTournament = (id: string) => {
    navigate(`/organization/tournaments/${id}/teams`);
  };

  const activeTournament = tournaments.find(t => t.id === selectedTourneyId);

  const fetchTeams = async (tourneyId: string) => {
    if (!tourneyId) return;
    try {
      const res = await api.get(`/teams/tournament/${tourneyId}`);
      setTeams(res);
    } catch (err) {
      console.error('Failed to fetch teams', err);
    }
  };

  useEffect(() => {
    if (selectedTourneyId) {
      fetchTeams(selectedTourneyId);
    }
  }, [selectedTourneyId]);

  const handleStatusChange = async (team: Team, status: 'approved' | 'rejected') => {
    const approving = status === 'approved';
    const ok = await confirm({
      title: approving ? `Approve ${team.name}?` : `Reject ${team.name}?`,
      message: approving
        ? 'The team will be confirmed for the tournament and notified of their approval.'
        : 'The team will be marked as rejected and notified. This can be reversed later if needed.',
      confirmLabel: approving ? 'Approve Team' : 'Reject Team',
      tone: approving ? 'default' : 'danger',
    });
    if (!ok) return;

    try {
      await api.put(`/teams/${team.id}/status`, { status });
      fetchTeams(selectedTourneyId);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update team status');
    }
  };

  const outstandingFor = (team: Team) =>
    team.payment ? team.payment.remaining_amount : (activeTournament?.ground_fee || 0);

  const handleMarkPaid = async (team: Team) => {
    const amount = outstandingFor(team);
    const ok = await confirm({
      title: `Mark ${team.name} as paid?`,
      message: `Records ₹${amount.toLocaleString()} collected in cash and clears the team's ground fee balance. A receipt will be issued.`,
      confirmLabel: 'Mark as Paid',
    });
    if (!ok) return;

    try {
      await api.post(`/teams/${team.id}/record-payment`, {
        payment_method: 'cash',
        amount,
        payment_option: 'full',
        notes: 'Marked as paid by organizer',
      });
      toast.success(`${team.name} marked as paid`);
      fetchTeams(selectedTourneyId);
    } catch (err: any) {
      toast.error(err.message || 'Failed to mark team as paid');
    }
  };

  const handlePaymentSuccess = () => {
    setPaymentTeam(null);
    fetchTeams(selectedTourneyId);
  };

  const visibleTeams = useMemo(() => {
    const q = teamSearch.trim().toLowerCase();
    const digits = q.replace(/\D+/g, '');
    return teams.filter(team => {
      if (teamStatus === 'pending' && team.status !== 'pending') return false;
      if (teamStatus === 'approved' && team.status !== 'approved') return false;
      if (teamStatus === 'unpaid' && outstandingFor(team) <= 0) return false;
      if (!q) return true;
      return [team.name, team.short_name, team.manager_name, team.village, team.captain_name]
        .some(value => value?.toLowerCase().includes(q))
        || (digits.length >= 3 && (team.manager_phone || '').replace(/\D+/g, '').includes(digits));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teams, teamSearch, teamStatus]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-72" />
        <SkeletonTable rows={6} />
      </div>
    );
  }

  const isFootball = activeTournament?.sport_code === 'football';

  const pendingCount = teams.filter(t => t.status === 'pending').length;
  const approvedCount = teams.filter(t => t.status === 'approved').length;
  const unpaidCount = teams.filter(t => outstandingFor(t) > 0).length;

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
      <div className="p-4 sm:p-8 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 border border-slate-800 shadow-2xl relative">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 sm:gap-6">
          <div className="flex items-start gap-4 min-w-0 w-full lg:w-auto">
            <div className="hidden sm:flex w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-500 p-0.5 shadow-lg shadow-emerald-500/20 items-center justify-center shrink-0">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <Users className="w-7 h-7 text-emerald-400" />
              </div>
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                {activeTournament && (
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider ${
                    isFootball ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                  }`}>
                    {isFootball ? '⚽ Football' : '🏏 Cricket'}
                  </span>
                )}
                {pendingCount > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 text-xs font-bold flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {pendingCount} pending approval{pendingCount === 1 ? '' : 's'}
                  </span>
                )}
                {approvedCount > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-xs font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    {approvedCount} approved
                  </span>
                )}
                {unpaidCount > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-300 border border-rose-500/20 text-xs font-bold">
                    {unpaidCount} fee{unpaidCount === 1 ? '' : 's'} outstanding
                  </span>
                )}
              </div>

              <h1 className="text-xl sm:text-3xl font-black font-heading text-white tracking-tight leading-tight sm:truncate">
                {activeTournament ? activeTournament.name : 'Teams & Ground Fee Payments'}
              </h1>
              <p className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                {activeTournament && (activeTournament.village || activeTournament.district) && (
                  <>
                    <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                    <span className="sm:truncate">{activeTournament.village}{activeTournament.village && activeTournament.district ? ', ' : ''}{activeTournament.district}</span>
                    <span className="text-slate-700">•</span>
                  </>
                )}
                <span>Team registrations, squad approvals, and ground fee payments</span>
              </p>
            </div>
          </div>

          <TournamentPicker
            tournaments={tournaments}
            value={selectedTourneyId}
            onChange={handleSelectTournament}
          />
        </div>
      </div>

      {/* Teams Table */}
      {teams.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No teams registered yet"
          message="Once teams register for this tournament, their squads, ground fee payments, and approval status will show up here."
        />
      ) : (
      <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="w-full sm:w-80">
          <label htmlFor="team-search" className="sr-only">Search teams</label>
          <input
            id="team-search"
            type="search"
            value={teamSearch}
            onChange={e => setTeamSearch(e.target.value)}
            placeholder="Search team, manager, village or phone…"
            className="w-full px-3.5 py-2.5 rounded-xl glass-input text-sm"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Filter teams">
          {([
            ['all', `All (${teams.length})`],
            ['pending', `Awaiting approval (${teams.filter(t => t.status === 'pending').length})`],
            ['approved', 'Approved'],
            ['unpaid', 'Fee outstanding'],
          ] as const).map(([value, text]) => (
            <button
              key={value}
              type="button"
              aria-pressed={teamStatus === value}
              onClick={() => setTeamStatus(value)}
              className={`min-h-10 px-3 rounded-xl text-sm font-bold border transition-colors ${
                teamStatus === value
                  ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {text}
            </button>
          ))}
        </div>
      </div>
      <div className="border border-slate-800 rounded-2xl overflow-hidden glass-card">
        <div className="overflow-x-auto min-w-0">
          <table className="responsive-table w-full min-w-[720px] text-sm text-left">
            <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 uppercase text-xs font-bold tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Team Name</th>
                <th className="px-4 py-3.5">Manager Contact</th>
                <th className="px-4 py-3.5 text-center">Squad</th>
                <th className="px-4 py-3.5">Ground Fee Paid</th>
                <th className="px-4 py-3.5">Remaining Balance</th>
                <th className="px-4 py-3.5 text-center">Approval Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {visibleTeams.map(team => {
                const pay = team.payment;
                const remaining = outstandingFor(team);
                const paidAmount = pay?.paid_amount || 0;
                const feeState = remaining <= 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid';

                return (
                  <tr key={team.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="rt-full px-5 py-4">
                      <div className="flex items-center gap-3">
                        <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: team.jersey_color }} />
                        <div>
                          <div className="font-bold text-white text-xs">{team.name}</div>
                          <div className="text-xs text-slate-400">{team.village}, {team.district}</div>
                        </div>
                      </div>
                    </td>

                    <td data-label="Manager" className="px-4 py-4">
                      <div className="font-medium text-white">{team.manager_name}</div>
                      <div className="text-xs text-slate-400 font-mono flex items-center gap-1">
                        <Phone className="w-3 h-3 text-slate-500" />
                        <span>{team.manager_phone}</span>
                      </div>
                    </td>

                    <td data-label="Squad" className="px-4 py-4 text-center">
                      <button
                        onClick={() => setRosterTeam(team)}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs font-semibold transition-colors"
                      >
                        {team.players_count ?? team.players?.length ?? 0} Players ↗
                      </button>
                    </td>

                    <td data-label="Fee Paid" className="px-4 py-4 font-mono font-bold text-emerald-400">
                      ₹{paidAmount.toLocaleString()}
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`px-1.5 py-px rounded text-xs font-bold uppercase ${
                          feeState === 'paid' ? 'bg-emerald-500/20 text-emerald-400' :
                          feeState === 'partial' ? 'bg-amber-500/20 text-amber-400' : 'bg-rose-500/20 text-rose-400'
                        }`}>
                          {feeState}
                        </span>
                        {pay?.payment_method && paidAmount > 0 && (
                          <span className="text-xs text-slate-500 font-normal uppercase">{label(pay.payment_method)}</span>
                        )}
                      </div>
                    </td>

                    <td data-label="Balance" className="px-4 py-4">
                      {remaining > 0 ? (
                        <div>
                          <span className="font-mono font-bold text-amber-400">₹{remaining.toLocaleString()}</span>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                            <button
                              onClick={() => handleMarkPaid(team)}
                              className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 text-xs font-bold"
                            >
                              Mark as Paid
                            </button>
                            <button
                              onClick={() => setPaymentTeam(team)}
                              className="text-xs text-slate-400 hover:text-white hover:underline font-semibold"
                            >
                              Record partial / UPI
                            </button>
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-500 font-mono">₹0 (Cleared)</span>
                      )}
                    </td>

                    <td data-label="Approval" className="px-4 py-4 text-center">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${
                        team.status === 'approved' ? 'bg-emerald-500/20 text-emerald-400' :
                        team.status === 'pending' ? 'bg-amber-500/20 text-amber-400' : 'bg-rose-500/20 text-rose-400'
                      }`}>
                        {label(team.status)}
                      </span>
                    </td>

                    <td className="rt-full px-5 py-4 text-right">
                      <div className="flex items-center justify-start md:justify-end gap-1.5">
                        {team.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleStatusChange(team, 'approved')}
                              className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 text-xs font-semibold"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleStatusChange(team, 'rejected')}
                              className="px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 text-xs font-semibold"
                            >
                              Reject
                            </button>
                          </>
                        )}

                        {team.receipt && (
                          <button
                            onClick={() => setSelectedReceipt(team.receipt!)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                            title="View Official Receipt"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visibleTeams.length === 0 && (
            <p className="p-8 text-center text-sm text-slate-400">No teams match that search or filter.</p>
          )}
        </div>
      </div>
      </div>
      )}

      {/* Roster Inspection Modal */}
      {rosterTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div>
                <h3 className="text-base font-bold text-white font-heading">{rosterTeam.name} Roster</h3>
                <p className="text-xs text-slate-400">Captain: {rosterTeam.captain_name} | Manager: {rosterTeam.manager_name}</p>
              </div>
              <button onClick={() => setRosterTeam(null)} aria-label="Close roster" className="min-h-10 min-w-10 text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="p-6 overflow-y-auto space-y-2 text-xs">
              {rosterTeam.players?.map((p, i) => (
                <div key={p.id || i} className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-lg bg-slate-900 border border-slate-800 font-mono font-bold text-emerald-400 flex items-center justify-center">
                      {p.jersey_number}
                    </span>
                    <div>
                      <div className="font-bold text-white flex items-center gap-1.5">
                        <span>{p.full_name}</span>
                        {p.is_captain && <span className="text-xs text-amber-400 font-bold">(C)</span>}
                      </div>
                      <div className="text-xs text-slate-400">
                        {p.football_position || `${p.cricket_role || 'Player'} (${p.cricket_bowling_style || ''})`}
                      </div>
                    </div>
                  </div>
                  <PlayerCodeBadge code={p.player_code} size="sm" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Offline Payment Modal */}
      {paymentTeam && (
        <OfflinePaymentModal
          team={paymentTeam}
          totalFee={activeTournament?.ground_fee || 0}
          onClose={() => setPaymentTeam(null)}
          onSuccess={handlePaymentSuccess}
        />
      )}

      {/* Receipt Modal */}
      {selectedReceipt && (
        <ReceiptModal
          receipt={selectedReceipt}
          onClose={() => setSelectedReceipt(null)}
        />
      )}
    </div>
  );
};

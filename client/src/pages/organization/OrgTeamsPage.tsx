import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import type { Team, Tournament, RegistrationReceipt } from '../../types';
import { 
  Download, Phone
} from 'lucide-react';
import { ReceiptModal } from '../../components/ReceiptModal';
import { OfflinePaymentModal } from '../../components/OfflinePaymentModal';
import { useToast } from '../../components/ui/Toast';
import { Skeleton, SkeletonTable } from '../../components/ui/Feedback';

export const OrgTeamsPage: React.FC = () => {
  const toast = useToast();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTourneyId, setSelectedTourneyId] = useState<string>('');
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [selectedReceipt, setSelectedReceipt] = useState<RegistrationReceipt | null>(null);
  const [paymentTeam, setPaymentTeam] = useState<Team | null>(null);
  const [rosterTeam, setRosterTeam] = useState<Team | null>(null);

  useEffect(() => {
    const fetchTourneys = async () => {
      try {
        setLoading(true);
        const res = await api.get('/tournaments');
        setTournaments(res);
        if (res.length > 0) {
          setSelectedTourneyId(res[0].id);
        }
      } catch (err) {
        console.error('Failed to load tournaments', err);
      } finally {
        setLoading(false);
      }
    };
    fetchTourneys();
  }, []);

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

  const handleStatusChange = async (teamId: string, status: string) => {
    try {
      await api.put(`/teams/${teamId}/status`, { status });
      fetchTeams(selectedTourneyId);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update team status');
    }
  };

  const handlePaymentSuccess = () => {
    setPaymentTeam(null);
    fetchTeams(selectedTourneyId);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-72" />
        <SkeletonTable rows={6} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black font-heading text-white">Teams & Ground Fee Payments</h1>
          <p className="text-xs text-slate-400 mt-1">Review team registrations, approve squads, record offline cash payments, and issue receipts</p>
        </div>

        {/* Tournament Selector */}
        {tournaments.length > 1 && (
          <div className="flex items-center gap-2 min-w-0 w-full sm:w-auto">
            <span className="text-xs font-semibold text-slate-400 shrink-0">Tournament:</span>
            <select
              value={selectedTourneyId}
              onChange={(e) => setSelectedTourneyId(e.target.value)}
              className="px-3.5 py-2 rounded-xl glass-input text-xs bg-slate-900 font-semibold text-white min-w-0 flex-1 sm:flex-none sm:max-w-xs truncate"
            >
              {tournaments.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Teams Table */}
      <div className="border border-slate-800 rounded-2xl overflow-hidden glass-card">
        <div className="overflow-x-auto min-w-0">
          <table className="w-full min-w-[720px] text-xs text-left">
            <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 uppercase text-[11px] font-bold tracking-wider">
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
              {teams.map(team => {
                const pay = team.payment;
                const hasPending = pay && pay.remaining_amount > 0;

                return (
                  <tr key={team.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: team.jersey_color }} />
                        <div>
                          <div className="font-bold text-white text-xs">{team.name}</div>
                          <div className="text-[11px] text-slate-400">{team.village}, {team.district}</div>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-4">
                      <div className="font-medium text-white">{team.manager_name}</div>
                      <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
                        <Phone className="w-3 h-3 text-slate-500" />
                        <span>{team.manager_phone}</span>
                      </div>
                    </td>

                    <td className="px-4 py-4 text-center">
                      <button
                        onClick={() => setRosterTeam(team)}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[11px] font-semibold transition-colors"
                      >
                        {team.players_count || 7} Players ↗
                      </button>
                    </td>

                    <td className="px-4 py-4 font-mono font-bold text-emerald-400">
                      ₹{pay ? pay.paid_amount.toLocaleString() : '0'}
                      <div className="text-[11px] text-slate-500 font-normal uppercase">{pay?.payment_method || 'N/A'}</div>
                    </td>

                    <td className="px-4 py-4">
                      {hasPending ? (
                        <div>
                          <span className="font-mono font-bold text-amber-400">₹{pay.remaining_amount.toLocaleString()}</span>
                          <button
                            onClick={() => setPaymentTeam(team)}
                            className="block text-[11px] text-emerald-400 hover:underline font-bold mt-0.5"
                          >
                            + Record Cash/UPI
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-500 font-mono">₹0 (Cleared)</span>
                      )}
                    </td>

                    <td className="px-4 py-4 text-center">
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase ${
                        team.status === 'approved' ? 'bg-emerald-500/20 text-emerald-400' :
                        team.status === 'pending' ? 'bg-amber-500/20 text-amber-400' : 'bg-rose-500/20 text-rose-400'
                      }`}>
                        {team.status}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {team.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleStatusChange(team.id, 'approved')}
                              className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 text-[11px] font-semibold"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleStatusChange(team.id, 'rejected')}
                              className="px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 text-[11px] font-semibold"
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
        </div>
      </div>

      {/* Roster Inspection Modal */}
      {rosterTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div>
                <h3 className="text-base font-bold text-white font-heading">{rosterTeam.name} Roster</h3>
                <p className="text-xs text-slate-400">Captain: {rosterTeam.captain_name} | Manager: {rosterTeam.manager_name}</p>
              </div>
              <button onClick={() => setRosterTeam(null)} className="text-slate-400 hover:text-white">✕</button>
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
                        {p.is_captain && <span className="text-[11px] text-amber-400 font-bold">(C)</span>}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {p.football_position || `${p.cricket_role || 'Player'} (${p.cricket_bowling_style || ''})`}
                      </div>
                    </div>
                  </div>
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

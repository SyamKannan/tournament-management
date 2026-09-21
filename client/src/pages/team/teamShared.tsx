import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock, CreditCard, Loader2, Shield, XCircle } from 'lucide-react';
import { api, ApiError } from '../../services/api';
import type { Organization, Player, RegistrationPayment, Team, Tournament } from '../../types';
import { useToast } from '../../components/ui/Toast';
import { openCheckout } from '../../utils/checkout';
import type { RazorpayOrder } from '../../utils/razorpay';

/* Shared by the team manager workspace pages (overview, squad, fixtures, join, payments). */

export interface TeamFixture {
  id: string;
  match_number: number;
  round_name: string;
  scheduled_at: string;
  status: string;
  opponent_id: string;
  opponent_name: string;
  result_summary: string | null;
  outcome: 'won' | 'lost' | 'draw' | null;
}

export interface ManagedTeam {
  team: Team;
  tournament: Tournament | null;
  organization: Pick<Organization, 'id' | 'name' | 'slug' | 'logo'> | null;
  players: Player[];
  payment: RegistrationPayment | null;
  matches: TeamFixture[];
}

/** The manager's teams from `GET /teams/mine`, with a reload and a local patch for edits. */
export function useManagedTeams() {
  const [teams, setTeams] = useState<ManagedTeam[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    api.get('/teams/mine')
      .then(res => setTeams(Array.isArray(res) ? res : []))
      .catch(err => setError(err instanceof ApiError ? err.message : 'Failed to load your teams'));
  }, []);

  useEffect(reload, [reload]);

  const patchTeam = (teamId: string, patch: Partial<ManagedTeam>) =>
    setTeams(current => current?.map(t => (t.team.id === teamId ? { ...t, ...patch } : t)) ?? current);

  return { teams, error, reload, patchTeam };
}

/** Remembers which team a multi-team manager is looking at, across pages. */
export function useSelectedTeam(teams: ManagedTeam[] | null) {
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    try { return sessionStorage.getItem('team_workspace_team'); } catch { return null; }
  });
  const selected = teams?.find(t => t.team.id === selectedId) ?? teams?.[0] ?? null;

  const select = (id: string) => {
    setSelectedId(id);
    try { sessionStorage.setItem('team_workspace_team', id); } catch { /* storage unavailable */ }
  };

  return { selected, select };
}

/** Match statuses during play (and the toss just before it), when there is a live score to watch. */
export const LIVE_STATUSES = ['toss', 'in_progress', 'half_time', 'innings_break', 'drinks_break'];
export const isLiveStatus = (status: string) => LIVE_STATUSES.includes(status);

export const money = (n?: number | string | null) => `₹${Number(n || 0).toLocaleString()}`;

export const formatWhen = (value: string) => {
  if (!value) return 'Time to be announced';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};

export const formatDay = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

export const TEAM_STATUS: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  approved: { label: 'Approved', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', icon: CheckCircle2 },
  pending: { label: 'Awaiting approval', className: 'bg-amber-500/10 text-amber-400 border-amber-500/30', icon: Clock },
  rejected: { label: 'Rejected', className: 'bg-rose-500/10 text-rose-400 border-rose-500/30', icon: XCircle },
  withdrawn: { label: 'Withdrawn', className: 'bg-slate-500/10 text-slate-400 border-slate-500/30', icon: XCircle },
};

export const TeamStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const s = TEAM_STATUS[status] ?? TEAM_STATUS.pending;
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-bold ${s.className}`}>
      <Icon className="w-3 h-3" /> {s.label}
    </span>
  );
};

export const PageHeader: React.FC<{ title: string; subtitle: string; action?: React.ReactNode }> = ({ title, subtitle, action }) => (
  <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
    <div>
      <h1 className="text-2xl font-black font-heading text-white">{title}</h1>
      <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
    </div>
    {action}
  </div>
);

export const TeamLogo: React.FC<{ team: Team; size?: string }> = ({ team, size = 'w-12 h-12' }) => (
  <div className={`${size} rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center overflow-hidden shrink-0`}>
    {team.logo ? <img src={team.logo} alt="" className="w-full h-full object-cover" /> : <Shield className="w-1/2 h-1/2 text-slate-500" />}
  </div>
);

/** Picker shown when a manager runs more than one team. */
export const TeamSwitcher: React.FC<{ teams: ManagedTeam[]; selectedId?: string; onSelect: (id: string) => void }> = ({ teams, selectedId, onSelect }) =>
  teams.length > 1 ? (
    <label className="inline-flex items-center gap-2 text-xs text-slate-400">
      <span className="font-semibold">Team</span>
      <select
        value={selectedId}
        onChange={e => onSelect(e.target.value)}
        className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
      >
        {teams.map(t => (
          <option key={t.team.id} value={t.team.id}>
            {t.team.name}{t.tournament ? ` · ${t.tournament.name}` : ''}
          </option>
        ))}
      </select>
    </label>
  ) : null;

export const StatTile: React.FC<{ icon: React.ElementType; label: string; value: React.ReactNode; hint?: string; tone?: string }> = ({ icon: Icon, label, value, hint, tone }) => (
  <div className="p-4 rounded-2xl glass-card border border-slate-800">
    <p className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
      <Icon className="w-3.5 h-3.5" /> {label}
    </p>
    <p className={`mt-1.5 text-xl font-black truncate ${tone ?? 'text-white'}`}>{value}</p>
    {hint && <p className="text-xs text-slate-500 mt-0.5 truncate">{hint}</p>}
  </div>
);

/** What's still owed on a team, and whether half the fee can be paid now. */
export function feeState(entry: ManagedTeam) {
  const { payment, tournament, team } = entry;
  const due = payment ? Number(payment.remaining_amount || 0) : Number(tournament?.ground_fee || 0);
  const totalFee = payment ? Number(payment.total_fee || 0) : Number(tournament?.ground_fee || 0);
  const paid = payment ? Number(payment.paid_amount || 0) : 0;
  // Same rule as the API: halves only when the organizer allows them, and only while half is less than what's left.
  const half = Math.round((totalFee / 2) * 100) / 100;
  const canPayHalf = !!tournament?.payment_config?.allow_partial && half > 0 && half < due;
  const canPay = due > 0 && !['withdrawn', 'rejected'].includes(team.status);
  return { due, totalFee, paid, half, canPayHalf, canPay };
}

/** "Pay half" / "Pay full" buttons for a team's outstanding ground fee, via the online checkout. */
export const PayFeeButtons: React.FC<{ entry: ManagedTeam; onPaid: () => void }> = ({ entry, onPaid }) => {
  const toast = useToast();
  const [paying, setPaying] = useState<'half' | 'full' | null>(null);
  const { due, half, canPayHalf, canPay } = feeState(entry);
  const { team, tournament } = entry;

  if (!canPay) return null;

  const pay = async (option: 'half' | 'full') => {
    setPaying(option);
    try {
      const order: RazorpayOrder & { amount_due: number; amount: number } =
        await api.post(`/teams/${team.id}/balance/order`, { option });
      const verified = await openCheckout({
        order,
        name: tournament?.name ?? 'Ground fee',
        description: `Ground fee — ${team.name}`,
      });
      await api.post(`/teams/${team.id}/balance/pay`, {
        ...verified,
        option,
        payment_method: verified.method ?? order.preferred_method ?? 'upi',
      });
      toast.success(order.amount < order.amount_due
        ? `Paid ${money(order.amount)}. ${money(order.amount_due - order.amount)} left to pay.`
        : `Paid ${money(order.amount)}. Your ground fee is settled.`);
      onPaid();
    } catch (err: any) {
      if (err?.message !== 'Payment cancelled') toast.error(err?.message || 'Payment could not be completed');
    } finally {
      setPaying(null);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {canPayHalf && (
        <button
          type="button"
          onClick={() => pay('half')}
          disabled={paying !== null}
          className="px-4 py-2 rounded-xl bg-slate-950/60 hover:bg-slate-950 border border-amber-500/50 text-amber-300 text-xs font-black flex items-center gap-1.5 disabled:opacity-60"
        >
          {paying === 'half' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />}
          Pay half · {money(half)}
        </button>
      )}
      <button
        type="button"
        onClick={() => pay('full')}
        disabled={paying !== null}
        className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black flex items-center gap-1.5 disabled:opacity-60"
      >
        {paying === 'full' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />}
        {canPayHalf ? 'Pay full' : 'Pay'} · {money(due)}
      </button>
    </div>
  );
};

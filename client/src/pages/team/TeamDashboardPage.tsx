import React from 'react';
import { Link } from 'react-router-dom';
import {
  Shield, Trophy, Users, Calendar, Wallet, ExternalLink, Radio, Plus, Receipt, ArrowRight, AlertTriangle,
} from 'lucide-react';
import { label } from '../../lib/labels';
import { LoadingState, EmptyState } from '../../components/ui/Feedback';
import {
  useManagedTeams, isLiveStatus, money, formatWhen, feeState, PageHeader, TeamLogo, TeamStatusBadge, StatTile, PayFeeButtons,
} from './teamShared';

/** Team manager overview: every team at a glance, what's owed, what's next, and quick links. */
export const TeamDashboardPage: React.FC = () => {
  const { teams, error, reload } = useManagedTeams();

  if (error) return <EmptyState icon={Shield} title="Couldn't load your teams" message={error} />;
  if (!teams) return <LoadingState label="Loading your teams…" />;

  if (teams.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Overview" subtitle="Your teams, fixtures and ground fees in one place" />
        <EmptyState
          icon={Shield}
          title="No team entered yet"
          message="Find a tournament that's taking entries, add your squad and pay the ground fee online."
          action={{ label: 'Join a tournament', to: '/team/join' }}
        />
      </div>
    );
  }

  const fees = teams.map(t => ({ entry: t, ...feeState(t) }));
  const totalDue = fees.reduce((sum, f) => sum + (f.canPay ? f.due : 0), 0);
  const totalPaid = fees.reduce((sum, f) => sum + f.paid, 0);
  const playerCount = teams.reduce((sum, t) => sum + t.players.length, 0);
  const upcoming = teams
    .flatMap(t => t.matches.filter(m => !m.outcome).map(m => ({ ...m, entry: t })))
    .sort((a, b) => (a.scheduled_at || '9999').localeCompare(b.scheduled_at || '9999'));
  const played = teams.flatMap(t => t.matches.filter(m => m.outcome));
  const record = {
    won: played.filter(m => m.outcome === 'won').length,
    lost: played.filter(m => m.outcome === 'lost').length,
    draw: played.filter(m => m.outcome === 'draw').length,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        subtitle="Your teams, fixtures and ground fees in one place"
        action={
          <Link
            to="/team/join"
            className="self-start sm:self-auto px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
          >
            <Plus className="w-4 h-4" /> Join a tournament
          </Link>
        }
      />

      {/* Ground fees still owed */}
      {fees.filter(f => f.canPay).map(f => (
        <div key={f.entry.team.id} className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-200">{money(f.due)} ground fee due for {f.entry.team.name}</p>
              <p className="text-xs text-amber-200/70">
                {f.entry.tournament?.name}{f.paid > 0 ? ` · paid ${money(f.paid)} of ${money(f.totalFee)}` : ''}
              </p>
            </div>
          </div>
          <PayFeeButtons entry={f.entry} onPaid={reload} />
        </div>
      ))}

      {/* Numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile icon={Trophy} label="Teams" value={teams.length} hint={`${teams.filter(t => t.team.status === 'approved').length} approved`} />
        <StatTile icon={Users} label="Players" value={playerCount} hint="Across all squads" />
        <StatTile icon={Calendar} label="Record" value={`W${record.won} L${record.lost} D${record.draw}`} hint={`${played.length} matches played`} />
        <StatTile
          icon={Wallet}
          label="Ground fees"
          value={totalDue > 0 ? `${money(totalDue)} due` : 'All paid'}
          hint={`${money(totalPaid)} paid so far`}
          tone={totalDue > 0 ? 'text-amber-400' : 'text-emerald-400'}
        />
      </div>

      <div className="grid lg:grid-cols-5 gap-6 [&>*]:min-w-0">
        {/* Next matches */}
        <section className="lg:col-span-3 p-5 rounded-2xl glass-card border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white font-heading flex items-center gap-2">
              <Calendar className="w-4 h-4 text-cyan-400" /> Next matches
            </h2>
            <Link to="/team/fixtures" className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1">
              All fixtures <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">No matches scheduled yet. They appear once the organizer makes the draw.</p>
          ) : (
            <ul className="space-y-2">
              {upcoming.slice(0, 4).map(m => (
                <li key={m.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-900/70 border border-slate-800">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate">{m.entry.team.name} <span className="text-slate-500 font-medium">vs</span> {m.opponent_name}</p>
                    <p className="text-[11px] text-slate-400 truncate">{m.round_name || `Match ${m.match_number}`} · {formatWhen(m.scheduled_at)}</p>
                  </div>
                  {isLiveStatus(m.status) ? (
                    <Link to={`/scoreboard/match/${m.id}`} className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-500/15 text-rose-400 text-[11px] font-black uppercase">
                      <Radio className="w-3 h-3" /> Live
                    </Link>
                  ) : (
                    <span className="shrink-0 text-[11px] font-bold uppercase text-slate-500">{label(m.status)}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Quick links */}
        <section className="lg:col-span-2 p-5 rounded-2xl glass-card border border-slate-800 space-y-2">
          <h2 className="text-sm font-bold text-white font-heading mb-1">Quick actions</h2>
          {[
            { to: '/team/squad', icon: Users, text: 'Manage squad', hint: 'Positions, roles, captain, contacts' },
            { to: '/team/payments', icon: Receipt, text: 'Payments & invoices', hint: 'Receipts and PDF payment report' },
            { to: '/team/join', icon: Plus, text: 'Join a tournament', hint: 'Enter a new tournament' },
          ].map(({ to, icon: Icon, text, hint }) => (
            <Link key={to} to={to} className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/70 border border-slate-800 hover:border-emerald-500/40 transition-colors group">
              <span className="w-9 h-9 rounded-lg bg-emerald-500/10 grid place-items-center shrink-0">
                <Icon className="w-4 h-4 text-emerald-400" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-white">{text}</span>
                <span className="block text-[11px] text-slate-400 truncate">{hint}</span>
              </span>
              <ArrowRight className="w-4 h-4 shrink-0 text-slate-600 group-hover:text-emerald-400" />
            </Link>
          ))}
        </section>
      </div>

      {/* Teams */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-white font-heading">Your teams</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {teams.map(t => {
            const fee = feeState(t);
            const next = t.matches.find(m => !m.outcome);
            return (
              <div key={t.team.id} className="p-5 rounded-2xl glass-card border border-slate-800 space-y-4">
                <div className="flex items-center gap-3">
                  <TeamLogo team={t.team} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-black text-white truncate">{t.team.name}</h3>
                      <TeamStatusBadge status={t.team.status} />
                    </div>
                    {t.tournament && (
                      <Link to={`/tournaments/${t.tournament.slug}`} className="text-xs text-slate-400 hover:text-emerald-400 inline-flex items-center gap-1 mt-0.5">
                        {t.tournament.name} <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}
                  </div>
                </div>
                <dl className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-xl bg-slate-900/70">
                    <dt className="text-[10px] uppercase font-bold text-slate-500">Squad</dt>
                    <dd className="text-sm font-black text-white">{t.players.length}</dd>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-900/70 min-w-0">
                    <dt className="text-[10px] uppercase font-bold text-slate-500">Next</dt>
                    <dd className="text-sm font-black text-white truncate">{next ? `vs ${next.opponent_name}` : '—'}</dd>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-900/70">
                    <dt className="text-[10px] uppercase font-bold text-slate-500">Fee</dt>
                    <dd className={`text-sm font-black ${fee.due > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{fee.due > 0 ? `${money(fee.due)} due` : 'Paid'}</dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};

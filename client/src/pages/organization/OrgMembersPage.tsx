import React, { useState } from 'react';
import { KeyRound, Loader2, Phone, Search, UserCog } from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { SkeletonTable, ErrorState, EmptyState } from '../../components/ui/Feedback';
import { Pager } from '../../components/ui/Pager';
import { TemporaryPasswordDialog } from '../../components/TemporaryPasswordDialog';
import { usePaginatedList } from '../../lib/usePaginatedList';
import { label } from '../../lib/labels';

interface Member {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  avatar?: string;
  must_change_password?: boolean;
}

const ROLE_FILTERS = [
  { value: '', label: 'Everyone' },
  { value: 'TEAM_MANAGER', label: 'Team managers' },
  { value: 'SCORER', label: 'Scorers' },
  { value: 'ORG_ADMIN', label: 'Admins' },
];

/**
 * The people who sign in to work with this club — its scorers and admins, and
 * the managers of every team entered in its tournaments.
 *
 * It exists for one phone call: "I can't log in." The SMS reset code does not
 * always arrive (no signal, a changed number, no gateway), and the organizer
 * is the person a manager rings. From here they issue a temporary password,
 * read it out, and the manager chooses their own when they sign in.
 */
export const OrgMembersPage: React.FC = () => {
  const { organization, user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [role, setRole] = useState('');
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ name: string; loginId: string; password: string } | null>(null);

  const list = usePaginatedList<Member>(organization ? `/organizations/${organization.id}/members` : null, {
    perPage: 25,
    params: { role },
  });

  const reset = async (member: Member) => {
    if (!organization || resettingId) return;
    const proceed = await confirm({
      title: `Give ${member.name} a temporary password?`,
      message: 'Their current password stops working and they are signed out everywhere. They will choose a new password the next time they sign in.',
      confirmLabel: 'Issue temporary password',
      tone: 'danger',
    });
    if (!proceed) return;

    setResettingId(member.id);
    try {
      const res: { temporary_password: string } = await api.post(
        `/organizations/${organization.id}/members/${member.id}/reset-password`,
      );
      setIssued({ name: member.name, loginId: member.phone || member.email, password: res.temporary_password });
      list.reload();
    } catch (err: any) {
      toast.error(err?.message || 'Could not reset the password');
    } finally {
      setResettingId(null);
    }
  };

  if (!organization) return null;

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-black font-heading text-white flex items-center gap-2">
          <UserCog className="w-6 h-6 text-emerald-400" aria-hidden="true" />
          People & sign-in help
        </h1>
        <p className="text-sm text-slate-400 mt-1 max-w-2xl">
          Everyone who signs in to work with your club. If a team manager or scorer cannot get into their
          account and the SMS code is not reaching them, issue a temporary password here and read it to them.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-80">
          <label htmlFor="member-search" className="sr-only">Search people</label>
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            id="member-search"
            type="search"
            placeholder="Search name, phone or email…"
            value={list.search}
            onChange={e => list.setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 rounded-xl glass-input text-sm"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Filter by role">
          {ROLE_FILTERS.map(filter => (
            <button
              key={filter.value || 'all'}
              type="button"
              aria-pressed={role === filter.value}
              onClick={() => setRole(filter.value)}
              className={`min-h-10 px-3 rounded-xl text-sm font-bold border transition-colors ${
                role === filter.value
                  ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {list.initialLoading ? (
        <SkeletonTable rows={6} />
      ) : list.error && list.rows.length === 0 ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : list.rows.length === 0 ? (
        <EmptyState
          icon={UserCog}
          title={list.search ? 'Nobody matches that search' : 'No one here yet'}
          message="Team managers appear here once their team is entered in one of your tournaments."
        />
      ) : (
        <ul className="rounded-2xl glass-card border border-slate-800 divide-y divide-slate-800 overflow-hidden">
          {list.rows.map(member => {
            const isSelf = member.id === user?.id;
            const canReset = !isSelf && member.role !== 'ORG_ADMIN' && member.role !== 'SUPER_ADMIN';
            return (
              <li key={member.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-slate-800 border border-slate-700 overflow-hidden grid place-items-center font-bold text-slate-300 shrink-0">
                    {member.avatar ? <img src={member.avatar} alt="" className="w-full h-full object-cover" /> : member.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white text-base truncate">{member.name}</span>
                      <span className="px-2 py-0.5 rounded-lg bg-slate-800 border border-slate-700 text-xs font-bold text-slate-300">{label(member.role)}</span>
                      {member.must_change_password && (
                        <span className="px-2 py-0.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-xs font-bold text-cyan-300">
                          Has a temporary password
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-400 flex items-center gap-1.5 flex-wrap">
                      <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                      <span className="tabular-nums">{member.phone || 'No phone'}</span>
                      {member.email && <span className="truncate">· {member.email}</span>}
                    </p>
                  </div>
                </div>

                {canReset ? (
                  <button
                    type="button"
                    onClick={() => reset(member)}
                    disabled={resettingId === member.id}
                    className="min-h-11 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50 shrink-0"
                  >
                    {resettingId === member.id
                      ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      : <KeyRound className="w-4 h-4" aria-hidden="true" />}
                    Issue temporary password
                  </button>
                ) : (
                  <span className="text-sm text-slate-500 shrink-0">
                    {isSelf ? 'You — change it in My Profile' : 'Admins are reset by platform support'}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Pager page={list.page} totalPages={list.totalPages} total={list.total} perPage={list.perPage} onPage={list.setPage} busy={list.loading} />

      {issued && (
        <TemporaryPasswordDialog
          title="Temporary password issued"
          name={issued.name}
          loginId={issued.loginId}
          password={issued.password}
          onClose={() => setIssued(null)}
        />
      )}
    </div>
  );
};

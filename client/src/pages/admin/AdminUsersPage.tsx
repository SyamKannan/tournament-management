import React, { useState } from 'react';
import { api } from '../../services/api';
import {
  Users, Trophy, Building2, Search,
  LogIn, Loader2, UserCheck, Phone, KeyRound
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { roleHome } from '../../lib/roleHome';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { Skeleton, SkeletonTable, ErrorState } from '../../components/ui/Feedback';
import { Pager } from '../../components/ui/Pager';
import { TemporaryPasswordDialog } from '../../components/TemporaryPasswordDialog';
import { usePaginatedList } from '../../lib/usePaginatedList';
import { label } from '../../lib/labels';

/**
 * Every account on the platform, a page at a time, searched on the server.
 *
 * Also where a locked-out person is got back in: their SMS reset code cannot
 * always reach them, so the super admin can issue a one-time password here.
 */
export const AdminUsersPage: React.FC = () => {
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { impersonate, user: currentUser } = useAuth();

  const [impersonatingUserId, setImpersonatingUserId] = useState<string | null>(null);
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ name: string; loginId: string; password: string } | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>('ALL');

  const list = usePaginatedList<any>('/admin/users', {
    perPage: 25,
    params: { role: roleFilter === 'ALL' ? undefined : roleFilter },
  });
  const users = list.rows;
  const search = list.search;
  const setSearch = list.setSearch;
  const filteredUsers = users;

  const roleCounts: Record<string, number> = list.raw?.role_counts ?? {};
  const counts = {
    total: Object.values(roleCounts).reduce((sum, n) => sum + n, 0),
    players: roleCounts.PLAYER ?? 0,
    orgAdmins: roleCounts.ORG_ADMIN ?? 0,
    teamManagers: roleCounts.TEAM_MANAGER ?? 0,
    scorers: roleCounts.SCORER ?? 0,
  };

  const handleImpersonate = async (targetUser: any) => {
    try {
      setImpersonatingUserId(targetUser.id);
      const res = await impersonate({ userId: targetUser.id });
      toast.success(`Logged in as ${res.user.name} (${label(targetUser.role)})`);
      navigate(roleHome(res.user.role), { replace: true });
    } catch (err: any) {
      toast.error(err?.message || 'Failed to impersonate user');
    } finally {
      setImpersonatingUserId(null);
    }
  };

  const handleResetPassword = async (targetUser: any) => {
    if (resettingUserId) return;
    const proceed = await confirm({
      title: `Issue a temporary password for ${targetUser.name}?`,
      message: 'Their current password stops working and every device they are signed in on is signed out. They will choose a new password at their next sign-in.',
      confirmLabel: 'Issue temporary password',
      tone: 'danger',
    });
    if (!proceed) return;

    setResettingUserId(targetUser.id);
    try {
      const res: { temporary_password: string } = await api.post(`/admin/users/${targetUser.id}/reset-password`);
      setIssued({
        name: targetUser.name,
        loginId: targetUser.email || targetUser.phone,
        password: res.temporary_password,
      });
      list.reload();
    } catch (err: any) {
      toast.error(err?.message || 'Could not reset the password');
    } finally {
      setResettingUserId(null);
    }
  };

  if (list.initialLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-72" />
        <SkeletonTable rows={8} />
      </div>
    );
  }

  if (list.error && users.length === 0) {
    return <ErrorState message={list.error} onRetry={list.reload} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black font-heading text-white flex items-center gap-2.5">
            <Users className="w-7 h-7 text-cyan-400" />
            <span>Platform Users & Players</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Browse and impersonate all registered players, club organizers, and managers across the platform
          </p>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Users</div>
            <div className="text-2xl font-black text-white font-mono mt-1">{counts.total}</div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
            <Users className="w-4 h-4" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-cyan-400 uppercase tracking-wider">Players</div>
            <div className="text-2xl font-black text-cyan-300 font-mono mt-1">{counts.players}</div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <Trophy className="w-4 h-4" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Club Admins</div>
            <div className="text-2xl font-black text-emerald-300 font-mono mt-1">{counts.orgAdmins}</div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Building2 className="w-4 h-4" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-purple-400 uppercase tracking-wider">Team Managers</div>
            <div className="text-2xl font-black text-purple-300 font-mono mt-1">{counts.teamManagers}</div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <UserCheck className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-80">
          <label htmlFor="users-search" className="sr-only">Search users</label>
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
          <input
            id="users-search"
            type="search"
            placeholder="Search by name, email or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl glass-input text-sm"
          />
        </div>

        {/* Role filter buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto text-xs pb-1 md:pb-0">
          <button
            onClick={() => setRoleFilter('ALL')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
              roleFilter === 'ALL'
                ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            All ({counts.total})
          </button>
          <button
            onClick={() => setRoleFilter('PLAYER')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 ${
              roleFilter === 'PLAYER'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Trophy className="w-3.5 h-3.5" />
            <span>Players ({counts.players})</span>
          </button>
          <button
            onClick={() => setRoleFilter('ORG_ADMIN')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 ${
              roleFilter === 'ORG_ADMIN'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Club Admins ({counts.orgAdmins})</span>
          </button>
          <button
            onClick={() => setRoleFilter('TEAM_MANAGER')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 ${
              roleFilter === 'TEAM_MANAGER'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Managers ({counts.teamManagers})</span>
          </button>
        </div>
      </div>

      {/* Users Table */}
      <div className="border border-slate-800 rounded-2xl overflow-hidden glass-card">
        <div className="overflow-x-auto">
          <table className="responsive-table w-full min-w-[960px] text-sm text-left">
            <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 uppercase text-xs font-bold tracking-wider">
              <tr>
                <th className="px-5 py-3.5">User / Player Persona</th>
                <th className="px-4 py-3.5">Role</th>
                <th className="px-4 py-3.5">Club / Organization</th>
                <th className="px-4 py-3.5">Contact Details</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredUsers.map((u) => {
                const isCurrent = currentUser?.id === u.id;
                const isPending = impersonatingUserId === u.id;

                const roleBadge = 
                  u.role === 'SUPER_ADMIN' ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' :
                  u.role === 'ORG_ADMIN' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                  u.role === 'PLAYER' ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' :
                  u.role === 'TEAM_MANAGER' ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' :
                  'bg-amber-500/20 text-amber-300 border-amber-500/30';

                const buttonStyle =
                  u.role === 'PLAYER' ? 'bg-cyan-600/20 hover:bg-cyan-600 text-cyan-300 hover:text-white border-cyan-500/30' :
                  u.role === 'ORG_ADMIN' ? 'bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border-emerald-500/30' :
                  u.role === 'TEAM_MANAGER' ? 'bg-purple-600/20 hover:bg-purple-600 text-purple-300 hover:text-white border-purple-500/30' :
                  'bg-amber-600/20 hover:bg-amber-600 text-amber-300 hover:text-white border-amber-500/30';

                const actionLabel =
                  u.role === 'PLAYER' ? 'Login As Player' :
                  u.role === 'ORG_ADMIN' ? 'Login As Club' :
                  u.role === 'TEAM_MANAGER' ? 'Login As Manager' : 'Login As User';

                return (
                  <tr key={u.id} className="hover:bg-slate-800/40 transition-colors">
                    {/* User Info */}
                    <td data-label="User" className="rt-full px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center font-bold text-slate-300 flex-shrink-0">
                          {u.avatar ? (
                            <img src={u.avatar} alt={u.name} className="w-full h-full object-cover" />
                          ) : (
                            <span>{u.name?.charAt(0) || 'U'}</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-white text-xs truncate flex items-center gap-2">
                            <span>{u.name}</span>
                            {u.must_change_password && (
                              <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-xs font-bold" title="Signed in with a temporary password and has not chosen their own yet">
                                Temp password
                              </span>
                            )}
                            {isCurrent && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-xs font-bold uppercase">
                                You
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400 font-mono truncate">{u.email}</div>
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td data-label="Role" className="px-4 py-4">
                      <span className={`px-2.5 py-1 rounded-lg border font-bold text-xs tracking-wider uppercase font-mono ${roleBadge}`}>
                        {label(u.role)}
                      </span>
                    </td>

                    {/* Organization */}
                    <td data-label="Club / Organization" className="px-4 py-4">
                      {u.organization ? (
                        <div className="flex items-center gap-2.5">
                          {u.organization.logo && (
                            <img src={u.organization.logo} alt={u.organization.name} className="w-6 h-6 rounded-lg object-cover border border-slate-700" />
                          )}
                          <div>
                            <div className="font-semibold text-white text-xs">{u.organization.name}</div>
                            <div className="text-xs text-slate-500">{u.organization.type || 'Sports Org'}</div>
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-500 text-xs italic">Platform Direct</span>
                      )}
                    </td>

                    {/* Contact */}
                    <td data-label="Contact Details" className="px-4 py-4">
                      <div className="text-slate-300 font-mono text-xs flex items-center gap-1.5">
                        <Phone className="w-3 h-3 text-slate-500" />
                        <span>{u.phone || 'No phone'}</span>
                      </div>
                    </td>

                    {/* Action Button */}
                    <td data-label="Actions" className="rt-full px-4 py-4 text-right">
                      {isCurrent ? (
                        <span className="text-xs text-slate-500 italic pr-2">Active Session</span>
                      ) : (
                        <div className="inline-flex flex-wrap items-center justify-end gap-2">
                        <button
                          onClick={() => handleResetPassword(u)}
                          disabled={resettingUserId === u.id}
                          title={`Issue a temporary password for ${u.name}`}
                          className="px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {resettingUserId === u.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                            : <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />}
                          <span>Reset password</span>
                        </button>
                        <button
                          onClick={() => handleImpersonate(u)}
                          disabled={isPending}
                          title={`Impersonate ${u.name}`}
                          className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all inline-flex items-center gap-1.5 active:scale-95 disabled:opacity-50 ${buttonStyle}`}
                        >
                          {isPending ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <LogIn className="w-3.5 h-3.5" />
                          )}
                          <span>{actionLabel}</span>
                        </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    <Users className="w-10 h-10 mx-auto mb-2 text-slate-600" />
                    <p className="text-sm font-medium">No users match {search ? 'that search' : 'this filter'}</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Pager
        page={list.page}
        totalPages={list.totalPages}
        total={list.total}
        perPage={list.perPage}
        onPage={list.setPage}
        busy={list.loading}
      />

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

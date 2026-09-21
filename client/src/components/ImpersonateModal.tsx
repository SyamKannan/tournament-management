import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { 
  X, Search, Building2, User as UserIcon, 
  LogIn, Loader2, Sparkles, Trophy, Users
} from 'lucide-react';
import { useToast } from './ui/Toast';
import { roleHome } from '../lib/roleHome';

const TONES = {
  emerald: {
    border: 'hover:border-emerald-500/40', name: 'group-hover:text-emerald-400',
    avatar: 'bg-emerald-950/50 border-emerald-500/30 text-emerald-400',
    button: 'bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 border-emerald-500/30',
  },
  cyan: {
    border: 'hover:border-cyan-500/40', name: 'group-hover:text-cyan-400',
    avatar: 'bg-cyan-950/50 border-cyan-500/30 text-cyan-400',
    button: 'bg-cyan-600/20 hover:bg-cyan-600 text-cyan-300 border-cyan-500/30',
  },
  purple: {
    border: 'hover:border-purple-500/40', name: 'group-hover:text-purple-400',
    avatar: 'bg-purple-950/50 border-purple-500/30 text-purple-400',
    button: 'bg-purple-600/20 hover:bg-purple-600 text-purple-300 border-purple-500/30',
  },
};

interface TargetCardProps {
  name: string;
  subtitle?: string;
  detail?: React.ReactNode;
  image?: string;
  fallbackIcon: React.ElementType;
  tone: keyof typeof TONES;
  actionLabel: string;
  pending: boolean;
  onLogin: () => void;
}

/** An account the super admin can log in as. Long names truncate but show in full on hover. */
const TargetCard: React.FC<TargetCardProps> = ({
  name, subtitle, detail, image, fallbackIcon: FallbackIcon, tone, actionLabel, pending, onLogin,
}) => {
  const [imageFailed, setImageFailed] = useState(false);
  const t = TONES[tone];

  return (
    <div className={`p-3 rounded-2xl bg-slate-950/70 border border-slate-800 ${t.border} transition-colors flex items-center gap-3 group min-w-0`}>
      <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 overflow-hidden ${t.avatar}`}>
        {image && !imageFailed ? (
          <img src={image} alt="" onError={() => setImageFailed(true)} className="w-full h-full object-cover" />
        ) : (
          <FallbackIcon className="w-5 h-5" aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0 flex-1" title={[name, subtitle].filter(Boolean).join('\n')}>
        <h4 className={`text-sm font-bold text-white truncate transition-colors ${t.name}`}>{name}</h4>
        {subtitle && <p className="text-xs text-slate-400 truncate">{subtitle}</p>}
        {detail && <div className="text-xs text-slate-500 truncate">{detail}</div>}
      </div>
      <button
        type="button"
        onClick={onLogin}
        disabled={pending}
        aria-label={`${actionLabel}: ${name}`}
        title={actionLabel}
        className={`px-3 py-1.5 rounded-xl border text-xs font-bold hover:text-white transition-all flex items-center gap-1.5 shrink-0 active:scale-95 disabled:opacity-50 ${t.button}`}
      >
        {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogIn className="w-3.5 h-3.5" />}
        <span>Log in</span>
      </button>
    </div>
  );
};

interface ImpersonateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ImpersonateModal: React.FC<ImpersonateModalProps> = ({ isOpen, onClose }) => {
  const { impersonate } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'ALL' | 'CLUBS' | 'PLAYERS' | 'MANAGERS'>('ALL');

  const [data, setData] = useState<{
    organizations: any[];
    players: any[];
    team_managers: any[];
    totals: { organizations: number; players: number; team_managers: number };
  }>({
    organizations: [],
    players: [],
    team_managers: [],
    totals: { organizations: 0, players: 0, team_managers: 0 },
  });

  // The server does the searching — across every account, not just the first
  // fifty it used to send, which left anyone later in the alphabet unreachable.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const fetchTargets = async () => {
      try {
        setLoading(true);
        const query = debouncedSearch ? `?search=${encodeURIComponent(debouncedSearch)}` : '';
        const res = await api.get(`/admin/impersonate/targets${query}`);
        if (isMounted) {
          setData({
            organizations: res.organizations || [],
            players: res.players || [],
            team_managers: res.team_managers || [],
            totals: res.totals || {
              organizations: (res.organizations || []).length,
              players: (res.players || []).length,
              team_managers: (res.team_managers || []).length,
            },
          });
        }
      } catch (err: any) {
        toast.error(err?.message || 'Failed to load impersonation targets');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchTargets();
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, debouncedSearch]);

  const truncated =
    data.totals.organizations > data.organizations.length ||
    data.totals.players > data.players.length ||
    data.totals.team_managers > data.team_managers.length;

  const handleImpersonateOrg = async (org: any) => {
    try {
      setImpersonatingId(org.id);
      const res = await impersonate({ organizationId: org.id });
      toast.success(`Now viewing as ${org.name}`);
      onClose();
      navigate(roleHome(res.user.role), { replace: true });
    } catch (err: any) {
      toast.error(err?.message || 'Failed to impersonate organization');
    } finally {
      setImpersonatingId(null);
    }
  };

  const handleImpersonateUser = async (user: any) => {
    try {
      setImpersonatingId(user.id);
      const res = await impersonate({ userId: user.id });
      toast.success(`Logged in as ${res.user.name}`);
      onClose();
      navigate(roleHome(res.user.role), { replace: true });
    } catch (err: any) {
      toast.error(err?.message || 'Failed to impersonate user');
    } finally {
      setImpersonatingId(null);
    }
  };

  const filteredOrgs = useMemo(() => {
    const q = search.toLowerCase();
    return data.organizations.filter(o => 
      o.name?.toLowerCase().includes(q) ||
      o.admin_user?.name?.toLowerCase().includes(q) ||
      o.admin_user?.email?.toLowerCase().includes(q) ||
      o.district?.toLowerCase().includes(q)
    );
  }, [data.organizations, search]);

  const filteredPlayers = useMemo(() => {
    const q = search.toLowerCase();
    return data.players.filter(p => 
      p.name?.toLowerCase().includes(q) ||
      p.email?.toLowerCase().includes(q) ||
      p.phone?.toLowerCase().includes(q)
    );
  }, [data.players, search]);

  const filteredManagers = useMemo(() => {
    const q = search.toLowerCase();
    return data.team_managers.filter(m => 
      m.name?.toLowerCase().includes(q) ||
      m.email?.toLowerCase().includes(q) ||
      m.phone?.toLowerCase().includes(q)
    );
  }, [data.team_managers, search]);

  if (!isOpen) return null;

  // Portal to <body>: the navbar's backdrop-blur would otherwise make `fixed` relative to the navbar.
  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh] max-h-[88dvh]">
        {/* Header */}
        <div className="shrink-0 px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 p-0.5 shadow-lg shadow-amber-500/20 flex items-center justify-center">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-amber-400" />
              </div>
            </div>
            <div>
              <h2 className="text-base font-bold text-white font-heading">
                Impersonate Club / User Persona
              </h2>
              <p className="text-xs text-slate-400">
                Experience the platform live as any sports club admin or player
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Search & Tabs Toolbar */}
        <div className="shrink-0 p-4 border-b border-slate-800 bg-slate-900/60 space-y-3">
          <div className="relative">
            <label htmlFor="impersonate-search" className="sr-only">Search clubs and people</label>
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
            <input
              id="impersonate-search"
              type="search"
              autoFocus
              placeholder="Search by club, name, email, phone or district…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          {truncated && (
            <p className="text-sm text-amber-300" role="status">
              Showing the first matches only — {data.totals.organizations} clubs, {data.totals.players} players and {data.totals.team_managers} managers match. Keep typing to narrow it down.
            </p>
          )}

          <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs">
            <button
              onClick={() => setActiveTab('ALL')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-colors ${
                activeTab === 'ALL'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              All Personas
            </button>
            <button
              onClick={() => setActiveTab('CLUBS')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-colors flex items-center gap-1.5 ${
                activeTab === 'CLUBS'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Clubs & Orgs ({filteredOrgs.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('PLAYERS')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-colors flex items-center gap-1.5 ${
                activeTab === 'PLAYERS'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Trophy className="w-3.5 h-3.5" />
              <span>Players ({filteredPlayers.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('MANAGERS')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-colors flex items-center gap-1.5 ${
                activeTab === 'MANAGERS'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Team Managers ({filteredManagers.length})</span>
            </button>
          </div>
        </div>

        {/* Content list */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-6">
          {loading ? (
            <div className="py-16 text-center text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-amber-400" />
              <p className="text-sm">Loading available accounts & clubs...</p>
            </div>
          ) : (
            <>
              {/* Organizations / Clubs Section */}
              {(activeTab === 'ALL' || activeTab === 'CLUBS') && filteredOrgs.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
                    <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Sports Organizations / Club Admins</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {filteredOrgs.map((org) => (
                      <TargetCard
                        key={org.id}
                        name={org.name}
                        subtitle={`Admin: ${org.admin_user?.name || org.contact_person || 'Org Admin'}`}
                        detail={org.admin_user?.email || org.email}
                        image={org.logo}
                        fallbackIcon={Building2}
                        tone="emerald"
                        actionLabel="Log in as club"
                        pending={impersonatingId === org.id}
                        onLogin={() => handleImpersonateOrg(org)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Players Section */}
              {(activeTab === 'ALL' || activeTab === 'PLAYERS') && filteredPlayers.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
                    <Trophy className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Registered Players</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {filteredPlayers.map((player) => (
                      <TargetCard
                        key={player.id}
                        name={player.name}
                        subtitle={player.email}
                        detail={<span className="font-mono">{player.phone || 'Player Profile'}</span>}
                        image={player.avatar}
                        fallbackIcon={UserIcon}
                        tone="cyan"
                        actionLabel="Log in as player"
                        pending={impersonatingId === player.id}
                        onLogin={() => handleImpersonateUser(player)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Team Managers Section */}
              {(activeTab === 'ALL' || activeTab === 'MANAGERS') && filteredManagers.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
                    <Users className="w-3.5 h-3.5 text-purple-400" />
                    <span>Team Managers</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {filteredManagers.map((manager) => (
                      <TargetCard
                        key={manager.id}
                        name={manager.name}
                        subtitle={manager.email}
                        detail={<span className="text-purple-400/80">Team Manager</span>}
                        fallbackIcon={UserIcon}
                        tone="purple"
                        actionLabel="Log in as team manager"
                        pending={impersonatingId === manager.id}
                        onLogin={() => handleImpersonateUser(manager)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {filteredOrgs.length === 0 && filteredPlayers.length === 0 && filteredManagers.length === 0 && (
                <div className="py-12 text-center text-slate-400">
                  <UserIcon className="w-10 h-10 mx-auto mb-2 text-slate-600" />
                  <p className="text-sm font-medium">No accounts found matching "{search}"</p>
                  <p className="text-xs text-slate-500 mt-1">Try searching by a different name or clear the search</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-4 sm:px-6 py-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between gap-3 text-xs text-slate-400">
          <span className="min-w-0">🔒 Actions performed while impersonating are logged to the audit trail.</span>
          <button
            onClick={onClose}
            className="shrink-0 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

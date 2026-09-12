import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { 
  X, Search, Building2, User as UserIcon, 
  LogIn, Loader2, Sparkles, Trophy, Users
} from 'lucide-react';
import { useToast } from './ui/Toast';

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
  }>({
    organizations: [],
    players: [],
    team_managers: [],
  });

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const fetchTargets = async () => {
      try {
        setLoading(true);
        const res = await api.get('/admin/impersonate/targets');
        if (isMounted) {
          setData({
            organizations: res.organizations || [],
            players: res.players || [],
            team_managers: res.team_managers || [],
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
  }, [isOpen]);

  const handleImpersonateOrg = async (org: any) => {
    try {
      setImpersonatingId(org.id);
      const res = await impersonate({ organizationId: org.id });
      toast.success(`Logged in as ${res.user.name} (${org.name})`);
      onClose();
      navigate('/organization/dashboard');
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
      if (res.user.role === 'PLAYER') {
        navigate('/player/dashboard');
      } else if (res.user.role === 'TEAM_MANAGER') {
        navigate('/team/auctions');
      } else {
        navigate('/organization/dashboard');
      }
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

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
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
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Tabs Toolbar */}
        <div className="p-4 border-b border-slate-800 bg-slate-900/60 space-y-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by club name, organizer, player name, email, or district..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

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
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
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
                    {filteredOrgs.map((org) => {
                      const isPending = impersonatingId === org.id;
                      return (
                        <div
                          key={org.id}
                          className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 hover:border-emerald-500/40 transition-all flex items-center justify-between gap-3 group"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <img
                              src={org.logo}
                              alt={org.name}
                              className="w-10 h-10 rounded-xl object-cover border border-slate-700 bg-slate-900 flex-shrink-0"
                            />
                            <div className="min-w-0">
                              <h4 className="text-sm font-bold text-white truncate group-hover:text-emerald-400 transition-colors">
                                {org.name}
                              </h4>
                              <p className="text-xs text-slate-400 truncate">
                                Admin: {org.admin_user?.name || org.contact_person || 'Org Admin'}
                              </p>
                              <div className="text-[11px] text-slate-500 truncate">
                                {org.admin_user?.email || org.email}
                              </div>
                            </div>
                          </div>

                          <button
                            onClick={() => handleImpersonateOrg(org)}
                            disabled={isPending}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 text-xs font-bold transition-all flex items-center gap-1.5 flex-shrink-0 active:scale-95 disabled:opacity-50"
                          >
                            {isPending ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <LogIn className="w-3.5 h-3.5" />
                            )}
                            <span>Login As Club</span>
                          </button>
                        </div>
                      );
                    })}
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
                    {filteredPlayers.map((player) => {
                      const isPending = impersonatingId === player.id;
                      return (
                        <div
                          key={player.id}
                          className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 hover:border-cyan-500/40 transition-all flex items-center justify-between gap-3 group"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-cyan-950/50 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold flex-shrink-0">
                              {player.avatar ? (
                                <img src={player.avatar} alt={player.name} className="w-full h-full object-cover rounded-xl" />
                              ) : (
                                <UserIcon className="w-5 h-5" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-sm font-bold text-white truncate group-hover:text-cyan-400 transition-colors">
                                {player.name}
                              </h4>
                              <p className="text-xs text-slate-400 truncate">
                                {player.email}
                              </p>
                              <div className="text-[11px] text-slate-500 font-mono">
                                {player.phone || 'Player Profile'}
                              </div>
                            </div>
                          </div>

                          <button
                            onClick={() => handleImpersonateUser(player)}
                            disabled={isPending}
                            className="px-3 py-1.5 rounded-xl bg-cyan-600/20 hover:bg-cyan-600 text-cyan-300 hover:text-white border border-cyan-500/30 text-xs font-bold transition-all flex items-center gap-1.5 flex-shrink-0 active:scale-95 disabled:opacity-50"
                          >
                            {isPending ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <LogIn className="w-3.5 h-3.5" />
                            )}
                            <span>Login As Player</span>
                          </button>
                        </div>
                      );
                    })}
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
                    {filteredManagers.map((manager) => {
                      const isPending = impersonatingId === manager.id;
                      return (
                        <div
                          key={manager.id}
                          className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 hover:border-purple-500/40 transition-all flex items-center justify-between gap-3 group"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-purple-950/50 border border-purple-500/30 flex items-center justify-center text-purple-400 font-bold flex-shrink-0">
                              <UserIcon className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-sm font-bold text-white truncate group-hover:text-purple-400 transition-colors">
                                {manager.name}
                              </h4>
                              <p className="text-xs text-slate-400 truncate">
                                {manager.email}
                              </p>
                              <div className="text-[11px] text-purple-400/80">
                                Team Manager
                              </div>
                            </div>
                          </div>

                          <button
                            onClick={() => handleImpersonateUser(manager)}
                            disabled={isPending}
                            className="px-3 py-1.5 rounded-xl bg-purple-600/20 hover:bg-purple-600 text-purple-300 hover:text-white border border-purple-500/30 text-xs font-bold transition-all flex items-center gap-1.5 flex-shrink-0 active:scale-95 disabled:opacity-50"
                          >
                            {isPending ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <LogIn className="w-3.5 h-3.5" />
                            )}
                            <span>Login As Manager</span>
                          </button>
                        </div>
                      );
                    })}
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
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400">
          <span>🔒 Actions performed while impersonating are logged to audit trail.</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

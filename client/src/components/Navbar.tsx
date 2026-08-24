import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  Trophy, ShieldCheck, Building2, UserCircle, 
  Tv, LogOut, ChevronDown, Sparkles, LogIn, Plus
} from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, organization, role, isAuthenticated, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const navigate = useNavigate();

  const handleLogout = () => {
    setShowUserMenu(false);
    logout();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-50 bg-slate-950/85 border-b border-slate-800/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo */}
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500 p-0.5 shadow-md shadow-emerald-500/20 group-hover:scale-105 transition-transform flex items-center justify-center">
                <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                  <Trophy className="w-4.5 h-4.5 text-emerald-400" />
                </div>
              </div>
              <div>
                <span className="text-base font-black tracking-tight text-white font-heading flex items-center gap-1.5">
                  SPORTIVO <span className="text-emerald-400 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 font-sans font-bold uppercase">SaaS</span>
                </span>
              </div>
            </Link>
          </div>

          {/* Quick Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 text-sm font-medium text-slate-300">
            <Link to="/" className="px-3 py-1.5 rounded-lg hover:text-white hover:bg-slate-800/50 transition-colors text-xs font-semibold">
              Home
            </Link>
            <Link to="/tournaments/malappuram-7s-football-2026" className="px-3 py-1.5 rounded-lg hover:text-emerald-400 hover:bg-slate-800/50 transition-colors text-xs font-semibold flex items-center gap-1.5">
              <span>⚽ Football Hub</span>
            </Link>
            <Link to="/tournaments/calicut-super-8s-t20-2026" className="px-3 py-1.5 rounded-lg hover:text-amber-400 hover:bg-slate-800/50 transition-colors text-xs font-semibold flex items-center gap-1.5">
              <span>🏏 Cricket Hub</span>
            </Link>
            <Link to="/scoreboard/match/match-fb-live-1" target="_blank" className="px-3 py-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/10 transition-colors text-xs font-semibold flex items-center gap-1.5">
              <Tv className="w-3.5 h-3.5" />
              <span>16:9 Live TV</span>
            </Link>
          </nav>

          {/* Right Action: Login / User Account */}
          <div className="flex items-center gap-2.5">
            {!isAuthenticated ? (
              <div className="flex items-center gap-2">
                <Link
                  to="/login"
                  className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-xs font-bold text-slate-200 transition-all flex items-center gap-1.5"
                >
                  <LogIn className="w-3.5 h-3.5 text-slate-400" />
                  <span>Log In</span>
                </Link>

                <Link
                  to="/register-club"
                  className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-xs font-bold text-white shadow-md shadow-emerald-600/20 transition-all flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Register Club</span>
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                {/* Workspace Shortcut Button */}
                {role === 'SUPER_ADMIN' ? (
                  <Link
                    to="/admin/dashboard"
                    className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-md shadow-emerald-600/20 flex items-center gap-1.5"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Super Admin Panel</span>
                  </Link>
                ) : (
                  <Link
                    to="/organization/dashboard"
                    className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold shadow-md shadow-cyan-600/20 flex items-center gap-1.5"
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    <span>Club Dashboard</span>
                  </Link>
                )}

                {/* User Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="flex items-center gap-2 p-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all text-xs"
                  >
                    <img
                      src={user?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80'}
                      alt={user?.name || 'User'}
                      className="w-6 h-6 rounded-lg object-cover"
                    />
                    <div className="hidden sm:block text-left pr-1">
                      <div className="text-[11px] font-bold text-white leading-tight truncate max-w-[120px]">
                        {user?.name?.split(' ')[0]}
                      </div>
                      <div className="text-[9px] text-slate-400 font-medium">
                        {role === 'SUPER_ADMIN' ? 'Super Admin' : (organization?.name || 'Club Admin')}
                      </div>
                    </div>
                    <ChevronDown className="w-3 h-3 text-slate-400" />
                  </button>

                  {showUserMenu && (
                    <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-slate-900/95 border border-slate-800 shadow-2xl p-1.5 z-50 backdrop-blur-xl animate-in fade-in slide-in-from-top-2">
                      <div className="px-3 py-2.5 border-b border-slate-800/80 mb-1">
                        <p className="text-xs font-bold text-white truncate">{user?.name}</p>
                        <p className="text-[10px] text-slate-400 truncate">{user?.email}</p>
                        <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-bold uppercase">
                          {role === 'SUPER_ADMIN' ? 'Platform Super Admin' : (organization?.name || 'Org Admin')}
                        </span>
                      </div>

                      {role === 'SUPER_ADMIN' ? (
                        <Link
                          to="/admin/dashboard"
                          onClick={() => setShowUserMenu(false)}
                          className="w-full text-left px-3 py-2 rounded-xl text-xs text-slate-300 hover:text-white hover:bg-slate-800 transition-colors flex items-center gap-2"
                        >
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Admin Console</span>
                        </Link>
                      ) : (
                        <Link
                          to="/organization/dashboard"
                          onClick={() => setShowUserMenu(false)}
                          className="w-full text-left px-3 py-2 rounded-xl text-xs text-slate-300 hover:text-white hover:bg-slate-800 transition-colors flex items-center gap-2"
                        >
                          <Building2 className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Club Dashboard</span>
                        </Link>
                      )}

                      <Link
                        to="/login"
                        onClick={() => setShowUserMenu(false)}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs text-slate-300 hover:text-white hover:bg-slate-800 transition-colors flex items-center gap-2"
                      >
                        <UserCircle className="w-3.5 h-3.5 text-slate-400" />
                        <span>Switch Account</span>
                      </Link>

                      <div className="my-1 border-t border-slate-800" />

                      <button
                        onClick={handleLogout}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs text-rose-400 hover:bg-rose-500/10 transition-colors flex items-center gap-2"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

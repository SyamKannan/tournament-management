import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  ShieldCheck, Building2, UserCircle, User,
  LogOut, ChevronDown, LogIn, Plus, Menu, X, Wifi, WifiOff, Gavel,
  Sparkles, ArrowLeft, Settings
} from 'lucide-react';
import { ImpersonateModal } from './ImpersonateModal';
import { label } from '../lib/labels';
import { BrandMark } from './brand/BrandMark';
import { PreferencesMenu } from './PreferencesMenu';

interface NavbarProps {
  /** Shown only on workspace routes, where a sidebar exists to open. */
  onMenuClick?: () => void;
  showMenuButton?: boolean;
}

const PUBLIC_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/players', label: 'Player Stats' },
  { to: '/register-player', label: 'Join as Player' },
  { to: '/register-club', label: 'Register Club' },
  { to: '/login', label: 'Sign In' },
];

export const Navbar: React.FC<NavbarProps> = ({ onMenuClick, showMenuButton }) => {
  const { user, organization, role, isAuthenticated, isWsConnected, isImpersonating, stopImpersonating, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [showImpersonateModal, setShowImpersonateModal] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Close the account menu on an outside click or Escape — without this the
  // panel stays open until its own button is pressed again.
  useEffect(() => {
    if (!showUserMenu) return;

    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowUserMenu(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showUserMenu]);

  // Any navigation dismisses the open panels.
  useEffect(() => {
    setShowUserMenu(false);
    setShowMobileNav(false);
  }, [location.pathname]);

  const handleLogout = () => {
    setShowUserMenu(false);
    logout();
    navigate('/login');
  };

  // Each role lands in the workspace it actually owns.
  const WORKSPACES = {
    SUPER_ADMIN:  { to: '/admin/dashboard',        label: 'Admin Console',  icon: ShieldCheck, classes: 'from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-600/20' },
    ORG_ADMIN:    { to: '/organization/dashboard', label: 'Club Dashboard', icon: Building2,   classes: 'from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-cyan-600/20' },
    TEAM_MANAGER: { to: '/team/dashboard',         label: 'My Team',        icon: Gavel,       classes: 'from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 shadow-amber-600/20' },
    PLAYER:       { to: '/player/dashboard',       label: 'My Profile',     icon: UserCircle,  classes: 'from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 shadow-violet-600/20' },
  } as const;

  const workspace = WORKSPACES[role as keyof typeof WORKSPACES] ?? WORKSPACES.ORG_ADMIN;

  // A club account represents the club, not a person: show its crest and name.
  const isClubAccount = role === 'ORG_ADMIN' && !!organization;
  const ROLE_CAPTIONS: Record<string, string> = {
    SUPER_ADMIN: 'Super Admin', PLAYER: 'Player', TEAM_MANAGER: 'Team Manager', SCORER: 'Scorer',
  };
  const identity = isClubAccount
    ? {
        image: organization.logo,
        title: organization.name,
        fullTitle: organization.name,
        caption: 'Club account',
        email: organization.email || user?.email,
        badge: organization.type || 'Club',
      }
    : {
        image: user?.avatar,
        title: user?.name?.split(' ')[0],
        fullTitle: user?.name,
        caption: ROLE_CAPTIONS[role] || organization?.name || 'Member',
        email: user?.email,
        badge: role === 'SUPER_ADMIN' ? 'Platform Super Admin' : (organization?.name || ROLE_CAPTIONS[role] || label(role)),
      };

  const WorkspaceIcon = workspace.icon;

  return (
    <header className="sticky top-0 z-50 bg-slate-950/90 border-b border-slate-800/80 backdrop-blur-xl">
      {/* Inside a workspace the header spans the full width so it lines up with the sidebar below it. */}
      <div className={showMenuButton ? 'px-4 sm:px-6' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'}>
        <div className="flex items-center justify-between h-16 gap-3">

          <div className="flex items-center gap-2 min-w-0">
            {showMenuButton && (
              <button
                onClick={onMenuClick}
                aria-label="Open navigation menu"
                className="lg:hidden -ml-1 p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}

            <Link to="/" className="flex items-center gap-2.5 group min-w-0">
              <BrandMark className="w-9 h-9 shrink-0 shadow-md shadow-emerald-500/20 rounded-xl group-hover:scale-105 transition-transform" />
              <span className="text-base font-black tracking-tight text-white font-heading flex items-center gap-1.5">
                KickWick
                <span className="hidden sm:inline text-emerald-400 text-xs px-1.5 py-0.5 rounded bg-emerald-500/10
                                 border border-emerald-500/20 font-sans font-bold uppercase">
                  PRO
                </span>
              </span>
            </Link>
          </div>

          <nav className="hidden lg:flex items-center gap-1 text-sm font-medium text-slate-300" aria-label="Main">
            {/* Players, clubs and team managers work from their own workspace; the logo still links home. */}
            {(!isAuthenticated || role === 'SUPER_ADMIN') && (
              <Link to="/" className="px-3 py-2 rounded-lg hover:text-white hover:bg-slate-800/60 transition-colors text-sm font-semibold">
                Home
              </Link>
            )}
            <Link to="/players" className="px-3 py-2 rounded-lg hover:text-white hover:bg-slate-800/60 transition-colors text-sm font-semibold">
              Player Stats
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            <PreferencesMenu />
            {isAuthenticated && (
              <span
                title={isWsConnected ? 'Live updates connected' : 'Live updates offline'}
                className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold ${
                  isWsConnected
                    ? 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20'
                    : 'bg-slate-800 text-slate-500 ring-1 ring-slate-700'
                }`}
              >
                {isWsConnected
                  ? <Wifi className="w-3.5 h-3.5" aria-hidden="true" />
                  : <WifiOff className="w-3.5 h-3.5" aria-hidden="true" />}
                <span className="sr-only sm:not-sr-only">{isWsConnected ? 'Live' : 'Offline'}</span>
              </span>
            )}

            {!isAuthenticated ? (
              <>
                <div className="hidden sm:flex items-center gap-2">
                  <Link
                    to="/login"
                    className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80
                               text-sm font-bold text-slate-200 transition-colors flex items-center gap-1.5"
                  >
                    <LogIn className="w-4 h-4 text-slate-400" aria-hidden="true" />
                    Log In
                  </Link>
                  <Link
                    to="/register-player"
                    className="px-3.5 py-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30
                               text-sm font-bold text-cyan-300 hover:text-white transition-colors flex items-center gap-1.5"
                  >
                    <User className="w-4 h-4 text-cyan-400" aria-hidden="true" />
                    Join as Player
                  </Link>
                  <Link
                    to="/register-club"
                    className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600
                               hover:from-emerald-500 hover:to-teal-500 text-sm font-bold text-white
                               shadow-md shadow-emerald-600/20 transition-colors flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                    Register Club
                  </Link>
                </div>

                <button
                  onClick={() => setShowMobileNav(open => !open)}
                  aria-label={showMobileNav ? 'Close menu' : 'Open menu'}
                  aria-expanded={showMobileNav}
                  className="sm:hidden p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  {showMobileNav ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
              </>
            ) : (
              <>
                {/* The sidebar already leads around the workspace; outside it, this is the way back in. */}
                {!showMenuButton && <Link
                  to={workspace.to}
                  className={`hidden md:flex px-3 py-2 rounded-xl bg-gradient-to-r ${workspace.classes}
                              text-white text-sm font-bold shadow-md items-center gap-1.5 transition-colors`}
                >
                  <WorkspaceIcon className="w-4 h-4" aria-hidden="true" />
                  {workspace.label}
                </Link>}

                <div className="relative" ref={menuRef}>
                  <button
                    onClick={() => setShowUserMenu(open => !open)}
                    aria-expanded={showUserMenu}
                    aria-haspopup="menu"
                    aria-label="Account menu"
                    className="flex items-center gap-2 p-1.5 rounded-xl bg-slate-900 border border-slate-800
                               hover:border-slate-700 transition-colors"
                  >
                    {identity.image ? (
                      <img src={identity.image} alt="" className="w-7 h-7 rounded-lg object-cover bg-slate-800" />
                    ) : (
                      <span className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center text-slate-300">
                        {isClubAccount ? <Building2 className="w-4 h-4" aria-hidden="true" /> : <UserCircle className="w-4 h-4" aria-hidden="true" />}
                      </span>
                    )}
                    <span className="hidden sm:block text-left pr-1">
                      <span className="block text-xs font-bold text-white leading-tight truncate max-w-[130px]">
                        {identity.title}
                      </span>
                      <span className="block text-xs text-slate-400 font-medium truncate max-w-[130px]">
                        {identity.caption}
                      </span>
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </button>

                  {showUserMenu && (
                    <div
                      role="menu"
                      className="absolute right-0 mt-2 w-60 rounded-2xl bg-slate-900/98 border border-slate-800
                                 shadow-2xl shadow-black/50 p-1.5 z-50 backdrop-blur-xl animate-toast-in"
                    >
                      <div className="px-3 py-2.5 border-b border-slate-800/80 mb-1">
                        <p className="text-sm font-bold text-white truncate">{identity.fullTitle}</p>
                        <p className="text-xs text-slate-400 truncate">{identity.email}</p>
                        <span className="inline-block mt-1.5 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400
                                         border border-emerald-500/20 text-xs font-bold uppercase">
                          {identity.badge}
                        </span>
                      </div>

                      <Link
                        role="menuitem"
                        to={workspace.to}
                        className="w-full text-left px-3 py-2.5 rounded-xl text-sm text-slate-300 hover:text-white
                                   hover:bg-slate-800 transition-colors flex items-center gap-2.5"
                      >
                        <WorkspaceIcon className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                        {workspace.label}
                      </Link>

                      <Link
                        role="menuitem"
                        to="/account/profile"
                        className="w-full text-left px-3 py-2.5 rounded-xl text-sm text-slate-300 hover:text-white
                                   hover:bg-slate-800 transition-colors flex items-center gap-2.5"
                      >
                        <Settings className="w-4 h-4 text-cyan-400" aria-hidden="true" />
                        {isClubAccount ? 'Club Profile' : 'My Profile'}
                      </Link>

                      {role === 'SUPER_ADMIN' && !isImpersonating && (
                        <button
                          role="menuitem"
                          onClick={() => {
                            setShowUserMenu(false);
                            setShowImpersonateModal(true);
                          }}
                          className="w-full text-left px-3 py-2.5 rounded-xl text-sm text-amber-300 hover:text-amber-200
                                     hover:bg-amber-500/10 transition-colors flex items-center gap-2.5 font-medium"
                        >
                          <Sparkles className="w-4 h-4 text-amber-400" aria-hidden="true" />
                          Impersonate Club / User
                        </button>
                      )}

                      {isImpersonating && (
                        <button
                          role="menuitem"
                          onClick={async () => {
                            setShowUserMenu(false);
                            await stopImpersonating();
                            navigate('/admin/dashboard');
                          }}
                          className="w-full text-left px-3 py-2.5 rounded-xl text-sm text-amber-400 hover:bg-amber-500/10
                                     transition-colors flex items-center gap-2.5 font-bold"
                        >
                          <ArrowLeft className="w-4 h-4 text-amber-400" aria-hidden="true" />
                          Exit Impersonation
                        </button>
                      )}

                      <div className="my-1 border-t border-slate-800" />

                      <button
                        role="menuitem"
                        onClick={handleLogout}
                        className="w-full text-left px-3 py-2.5 rounded-xl text-sm text-rose-400 hover:bg-rose-500/10
                                   transition-colors flex items-center gap-2.5"
                      >
                        <LogOut className="w-4 h-4" aria-hidden="true" />
                        Sign Out
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Signed-out mobile menu */}
      {showMobileNav && !isAuthenticated && (
        <nav className="sm:hidden border-t border-slate-800 bg-slate-950/98 backdrop-blur-xl px-4 py-3 space-y-1" aria-label="Mobile">
          {PUBLIC_LINKS.map(link => (
            <Link
              key={link.to}
              to={link.to}
              className="block px-3 py-3 rounded-xl text-sm font-semibold text-slate-200 hover:bg-slate-800 transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      )}

      {/* Impersonate Modal for Super Admin */}
      <ImpersonateModal
        isOpen={showImpersonateModal}
        onClose={() => setShowImpersonateModal(false)}
      />
    </header>
  );
};

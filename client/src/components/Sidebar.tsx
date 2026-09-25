import React, { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePlatformConfig } from '../context/PlatformConfigContext';
import {
  LayoutDashboard, CreditCard, Building2, Trophy, Users, Calendar,
  Radio, Megaphone, FileText, Settings, History, X, Gamepad2, Image as ImageIcon,
  Receipt, PlusCircle, BellRing, MapPin, UserCog, MessageSquareHeart
} from 'lucide-react';

interface SidebarProps {
  type: 'admin' | 'organization' | 'team';
  /** Drawer state — only consulted below the `lg` breakpoint. */
  open: boolean;
  onClose: () => void;
}

const ADMIN_LINKS = [
  { to: '/admin/dashboard', label: 'Overview & Metrics', icon: LayoutDashboard },
  { to: '/admin/plans', label: 'Plans & Pricing', icon: CreditCard },
  { to: '/admin/sports', label: 'Sports', icon: Gamepad2 },
  { to: '/admin/organizations', label: 'Organizations', icon: Building2 },
  { to: '/admin/users', label: 'Users & Players', icon: Users },
  { to: '/admin/subscriptions', label: 'Subscriptions', icon: FileText },
  { to: '/admin/reviews', label: 'Reviews', icon: MessageSquareHeart },
  { to: '/admin/settings', label: 'Platform Settings', icon: Settings },
  { to: '/admin/audit-logs', label: 'Audit Logs', icon: History },
];

const ORG_LINKS = [
  { to: '/organization/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/organization/tournaments', label: 'Tournaments', icon: Trophy },
  { to: '/organization/teams', label: 'Teams & Approvals', icon: Users },
  { to: '/organization/fixtures', label: 'Fixtures & Brackets', icon: Calendar },
  { to: '/organization/venues', label: 'Grounds', icon: MapPin },
  { to: '/organization/posters', label: 'Posters', icon: ImageIcon },
  { to: '/organization/sponsors', label: 'Sponsors & Ads', icon: Megaphone },
  { to: '/organization/announcements', label: 'Announcements', icon: Radio },
  // Hidden until a gateway is connected — see `requiresMessaging`.
  { to: '/organization/notifications', label: 'WhatsApp & SMS', icon: BellRing, requiresMessaging: true },
  { to: '/organization/members', label: 'People & Sign-in', icon: UserCog },
  { to: '/organization/reports', label: 'Financials & Reports', icon: FileText },
  { to: '/organization/billing', label: 'Billing & Plan', icon: CreditCard },
];

const TEAM_LINKS = [
  { to: '/team/dashboard', label: 'Overview', icon: LayoutDashboard },
  { to: '/team/squad', label: 'My Squad', icon: Users },
  { to: '/team/fixtures', label: 'Fixtures & Results', icon: Calendar },
  { to: '/team/join', label: 'Join Tournament', icon: PlusCircle },
  { to: '/team/payments', label: 'Payments & Invoices', icon: Receipt },
];

const WORKSPACE_LINKS = { admin: ADMIN_LINKS, organization: ORG_LINKS, team: TEAM_LINKS };

/**
 * Workspace navigation.
 *
 * A permanent rail from `lg` up; below that it becomes an overlay drawer, so a
 * phone keeps its full width for content instead of losing 16rem of it.
 */
export const Sidebar: React.FC<SidebarProps> = ({ type, open, onClose }) => {
  const { organization, user } = useAuth();
  const { messagingEnabled } = usePlatformConfig();
  // A section that cannot do anything is not shown at all: with no gateway
  // connected, "WhatsApp & SMS" would only ever report messages nobody got.
  const links = WORKSPACE_LINKS[type].filter(
    (link: { requiresMessaging?: boolean }) => !link.requiresMessaging || messagingEnabled,
  );

  // While the drawer covers the page, Escape closes it and the page behind
  // must not scroll underneath.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm lg:hidden animate-fade-in"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        aria-label={type === 'admin' ? 'Admin navigation' : type === 'team' ? 'Team navigation' : 'Workspace navigation'}
        className={`
          fixed inset-y-0 left-0 z-50 w-[17rem] p-4 flex flex-col justify-between
          glass-panel border-r border-slate-800/80 overflow-y-auto
          transition-transform duration-300 ease-out
          ${open ? 'translate-x-0 animate-drawer-in' : '-translate-x-full'}
          lg:sticky lg:top-16 lg:z-30 lg:h-[calc(100vh-4rem)] lg:w-64 lg:translate-x-0 lg:shrink-0
        `}
      >
        <div>
          <div className="flex items-start justify-between gap-2 mb-4">
            <div className="flex-1 min-w-0 p-3 rounded-xl bg-slate-900/80 border border-slate-800">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {type === 'admin' ? 'Platform Control' : type === 'team' ? 'Team Manager' : 'Active Organization'}
              </div>
              <div className="text-sm font-bold text-white truncate mt-0.5">
                {type === 'admin' ? 'Super Admin Portal' : type === 'team' ? (user?.name || 'My Teams') : (organization?.name || 'Your Organization')}
              </div>
              {type === 'organization' && organization?.type && (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" aria-hidden="true" />
                  <span className="text-xs text-emerald-400 font-medium capitalize truncate">
                    {organization.type}
                  </span>
                </div>
              )}
            </div>

            <button
              onClick={onClose}
              aria-label="Close navigation menu"
              className="lg:hidden p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="space-y-1.5">
            {links.map(link => {
              const Icon = link.icon;
              return (
                <NavLink
                  key={link.to}
                  to={link.to}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 group ${
                      isActive
                        ? 'bg-gradient-to-r from-emerald-500/20 via-teal-500/15 to-emerald-500/5 text-emerald-300 border border-emerald-500/35 shadow-lg shadow-emerald-950/50'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 hover:translate-x-0.5'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <div className="flex items-center gap-3 min-w-0">
                        <Icon className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-110 ${isActive ? 'text-emerald-400' : 'text-slate-400 group-hover:text-slate-200'}`} aria-hidden="true" />
                        <span className="truncate">{link.label}</span>
                      </div>
                      {isActive && (
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400 animate-pulse" />
                      )}
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>
        </div>
      </aside>
    </>
  );
};

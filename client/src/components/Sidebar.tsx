import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  LayoutDashboard, CreditCard, Building2, Trophy, Users, Calendar, 
  Radio, Megaphone, FileText, Settings, ShieldCheck, History, 
  Tv, Sparkles
} from 'lucide-react';

interface SidebarProps {
  type: 'admin' | 'organization';
}

export const Sidebar: React.FC<SidebarProps> = ({ type }) => {
  const { organization, role } = useAuth();

  const adminLinks = [
    { to: '/admin/dashboard', label: 'Overview & Metrics', icon: LayoutDashboard },
    { to: '/admin/plans', label: 'Plans & SaaS Pricing', icon: CreditCard, highlight: true },
    { to: '/admin/organizations', label: 'Organizations (Tenants)', icon: Building2 },
    { to: '/admin/subscriptions', label: 'Subscriptions & Invoices', icon: FileText },
    { to: '/admin/settings', label: 'Platform Settings', icon: Settings },
    { to: '/admin/audit-logs', label: 'Platform Audit Logs', icon: History }
  ];

  const orgLinks = [
    { to: '/organization/dashboard', label: 'Workspace Dashboard', icon: LayoutDashboard },
    { to: '/organization/tournaments', label: 'Tournaments', icon: Trophy, highlight: true },
    { to: '/organization/teams', label: 'Teams & Approvals', icon: Users },
    { to: '/organization/fixtures', label: 'Fixtures & Brackets', icon: Calendar },
    { to: '/organization/sponsors', label: 'Sponsors & Break Ads', icon: Megaphone },
    { to: '/organization/announcements', label: 'Announcements', icon: Radio },
    { to: '/organization/reports', label: 'Financials & Reports', icon: FileText }
  ];

  const links = type === 'admin' ? adminLinks : orgLinks;

  return (
    <aside className="w-64 flex-shrink-0 min-h-[calc(100vh-4rem)] glass-panel border-r border-slate-800/80 p-4 flex flex-col justify-between">
      <div>
        {/* Workspace info header */}
        <div className="p-3 mb-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            {type === 'admin' ? 'Platform Control' : 'Active Organization'}
          </div>
          <div className="text-sm font-bold text-white truncate mt-0.5">
            {type === 'admin' ? 'Super Admin Portal' : (organization?.name || 'Green Valley SC')}
          </div>
          {type === 'organization' && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-[11px] text-emerald-400 font-medium capitalize">
                {organization?.type || 'Sports Club'}
              </span>
            </div>
          )}
        </div>

        {/* Nav Link List */}
        <nav className="space-y-1">
          {links.map(link => {
            const Icon = link.icon;
            return (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/10 text-emerald-400 border border-emerald-500/30 shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                  }`
                }
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{link.label}</span>
                {link.highlight && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400" />
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Bottom Feature Widget */}
      <div className="mt-6 pt-4 border-t border-slate-800/80">
        <div className="p-3 rounded-xl bg-gradient-to-br from-slate-900 to-slate-950 border border-emerald-500/20 shadow-md">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
            <Tv className="w-3.5 h-3.5" />
            <span>16:9 Scoreboard Mode</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
            Project live matches to LED screens & stadium TVs with automated break-time ads.
          </p>
          <a
            href="/scoreboard/match/match-fb-live-1"
            target="_blank"
            rel="noreferrer"
            className="mt-2.5 inline-flex items-center justify-center w-full px-2.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-[11px] font-semibold text-emerald-300 transition-colors"
          >
            Open Live Big Screen ↗
          </a>
        </div>
      </div>
    </aside>
  );
};

import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { usePlatformConfig } from '../../context/PlatformConfigContext';
import { roleHome } from '../../lib/roleHome';
import { SHOW_ADMIN_LOGIN, SHOW_DEMO_ACCOUNTS } from '../../config';
import { AuthShowcase } from '../../components/AuthShowcase';
import { SPORTS_CAROUSELS } from '../../lib/sportsImagery';
import { AuthLayout, AuthHeader, AuthCard, AuthAlert, AuthField, AuthSubmit, AuthFooter, type AuthAccent } from '../../components/auth/AuthUI';
import { ShieldCheck, Building2, Lock, Mail, Eye, EyeOff, User, type LucideIcon } from 'lucide-react';

type LoginTab = 'ORG_ADMIN' | 'PLAYER' | 'SUPER_ADMIN';

const TABS: { id: LoginTab; label: string; icon: LucideIcon; accent: AuthAccent }[] = [
  { id: 'ORG_ADMIN', label: 'Club', icon: Building2, accent: 'emerald' },
  { id: 'PLAYER', label: 'Player', icon: User, accent: 'amber' },
  ...(SHOW_ADMIN_LOGIN ? [{ id: 'SUPER_ADMIN' as const, label: 'Admin', icon: ShieldCheck, accent: 'cyan' as const }] : []),
];

const DEMO_ACCOUNTS: Record<LoginTab, { name: string; email: string }[]> = {
  ORG_ADMIN: [
    { name: 'Green Valley Sports Club', email: 'admin@greenvalley.com' },
    { name: 'Malabar Cricket Academy', email: 'admin@malabar.com' },
  ],
  PLAYER: [
    { name: 'Shameer Babu · Football striker', email: 'shameer.player@gmail.com' },
    { name: 'Rahul Menon · Cricket all-rounder', email: 'rahul.player@gmail.com' },
  ],
  SUPER_ADMIN: [{ name: 'Syam · Platform super admin', email: 'syamdas@gmail.com' }],
};

export const LoginPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login, isAuthenticated, role } = useAuth();
  const { messagingEnabled } = usePlatformConfig();

  const redirectUrl = searchParams.get('redirect');
  const initialRoleParam = searchParams.get('role');

  const [activeTab, setActiveTab] = useState<LoginTab>(
    initialRoleParam === 'SUPER_ADMIN' && SHOW_ADMIN_LOGIN ? 'SUPER_ADMIN' : initialRoleParam === 'PLAYER' ? 'PLAYER' : 'ORG_ADMIN'
  );

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // If already authenticated, redirect
  useEffect(() => {
    if (isAuthenticated) {
      navigate(redirectUrl || roleHome(role));
    }
  }, [isAuthenticated, role, redirectUrl, navigate]);

  const handleTabChange = (tab: LoginTab) => {
    setActiveTab(tab);
    setError(null);
    // Pre-filling seeded credentials is a demo convenience only.
    if (!SHOW_DEMO_ACCOUNTS) return;
    if (tab === 'SUPER_ADMIN') {
      setEmail('syamdas@gmail.com');
      setPassword('12345678');
    } else if (tab === 'PLAYER') {
      setEmail('shameer.player@gmail.com');
      setPassword('12345678');
    } else {
      setEmail('admin@greenvalley.com');
      setPassword('12345678');
    }
  };

  const handleQuickFill = (demoEmail: string, demoPass: string, tab: LoginTab) => {
    setActiveTab(tab);
    setEmail(demoEmail);
    setPassword(demoPass);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await login(email, password);
      navigate(redirectUrl || roleHome(result.user.role));
    } catch (err: any) {
      setError(err?.message || 'Invalid email or password. Please verify your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const accent = TABS.find(t => t.id === activeTab)?.accent ?? 'emerald';

  return (
    <AuthLayout
      accent={accent}
      showcase={
        <AuthShowcase
          images={SPORTS_CAROUSELS.login}
          eyebrow="Welcome back"
          title={<>Sign in to run your <span className="text-emerald-400">tournaments.</span></>}
          description="Score matches live, keep the points table up to date and manage your teams, all in one place."
          stats={['clubs', 'tournaments', 'matches_played', 'teams', 'live_matches']}
          accent="emerald"
        />
      }
    >
      <AuthHeader
        accent={accent}
        title="Welcome back"
        subtitle="Sign in to your dashboard, player profile and live scoreboards."
      />

      {/* Account type */}
      <div role="tablist" aria-label="Account type" className="relative flex p-1 mb-5 rounded-2xl bg-slate-900/80 ring-1 ring-white/5">
        {TABS.map(tab => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => handleTabChange(tab.id)}
              className={`relative flex-1 h-10 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition-colors ${
                active ? 'text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="login-tab"
                  className="absolute inset-0 rounded-xl bg-slate-700/70 ring-1 ring-white/10 shadow"
                  transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                />
              )}
              <tab.icon className="relative w-4 h-4" />
              <span className="relative">{tab.label}</span>
            </button>
          );
        })}
      </div>

      <AuthCard>
        <AuthAlert message={error} />

        <form onSubmit={handleSubmit} className="space-y-4">
          <AuthField label="Email" htmlFor="login-email" icon={Mail}>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              required
              className="auth-field"
            />
          </AuthField>

          <AuthField
            label="Password"
            htmlFor="login-password"
            icon={Lock}
            trailing={
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="w-9 h-9 rounded-lg grid place-items-center text-slate-500 hover:text-slate-200 hover:bg-white/5"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            }
          >
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              className="auth-field pr-12"
            />
          </AuthField>

          <div className="pt-2 space-y-3">
            <AuthSubmit accent={accent} loading={isLoading}>Sign in</AuthSubmit>
            {/* Recovering a password means a code by SMS. With no gateway
                connected there is nothing to offer, so say who can help
                instead of sending people to a code that never arrives. */}
            <div className="text-center">
              {messagingEnabled ? (
                <Link to="/forgot-password" className="text-sm font-semibold text-slate-400 hover:text-white">
                  Forgotten your password?
                </Link>
              ) : (
                <p className="text-sm text-slate-400">
                  Forgotten your password? Ask your club organizer to issue you a new one.
                </p>
              )}
            </div>
          </div>
        </form>

        {/* Seeded demo logins — only rendered when VITE_SHOW_DEMO_ACCOUNTS=true. */}
        {SHOW_DEMO_ACCOUNTS && (
          <div className="mt-6">
            <div className="flex items-center gap-3 mb-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
              <span className="h-px flex-1 bg-white/10" />
              Demo accounts
              <span className="h-px flex-1 bg-white/10" />
            </div>
            <div className="space-y-2">
              {DEMO_ACCOUNTS[activeTab].map(acc => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => handleQuickFill(acc.email, '12345678', activeTab)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] ring-1 ring-white/5 text-left flex items-center justify-between gap-3 transition-colors"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-white truncate">{acc.name}</span>
                    <span className="block text-xs text-slate-400 truncate">{acc.email}</span>
                  </span>
                  <span className="shrink-0 text-xs font-bold text-slate-300">Use</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500 text-center">Password for every demo account: 12345678</p>
          </div>
        )}
      </AuthCard>

      <AuthFooter
        links={[
          { prompt: 'New player?', to: '/register-player', label: 'Create a player profile' },
          { prompt: 'Running a club?', to: '/register-club', label: 'Register your club' },
        ]}
      />
    </AuthLayout>
  );
};

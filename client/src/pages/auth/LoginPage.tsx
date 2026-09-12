import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { SHOW_DEMO_ACCOUNTS } from '../../config';
import { AuthShowcase } from '../../components/AuthShowcase';
import { SPORTS_CAROUSELS } from '../../lib/sportsImagery';
import {
  Trophy, ShieldCheck, Building2, Lock, Mail,
  ArrowRight, AlertCircle, Eye, EyeOff, User
} from 'lucide-react';

export const LoginPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login, isAuthenticated, role } = useAuth();

  const redirectUrl = searchParams.get('redirect');
  const initialRoleParam = searchParams.get('role');

  const [activeTab, setActiveTab] = useState<'ORG_ADMIN' | 'PLAYER' | 'SUPER_ADMIN'>(
    initialRoleParam === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : initialRoleParam === 'PLAYER' ? 'PLAYER' : 'ORG_ADMIN'
  );

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // If already authenticated, redirect
  useEffect(() => {
    if (isAuthenticated) {
      if (redirectUrl) {
        navigate(redirectUrl);
      } else if (role === 'SUPER_ADMIN') {
        navigate('/admin/dashboard');
      } else if (role === 'PLAYER') {
        navigate('/player/dashboard');
      } else {
        navigate('/organization/dashboard');
      }
    }
  }, [isAuthenticated, role, redirectUrl, navigate]);

  const handleTabChange = (tab: 'ORG_ADMIN' | 'PLAYER' | 'SUPER_ADMIN') => {
    setActiveTab(tab);
    setError(null);
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

  const handleQuickFill = (demoEmail: string, demoPass: string, tab: 'ORG_ADMIN' | 'PLAYER' | 'SUPER_ADMIN') => {
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
      if (redirectUrl) {
        navigate(redirectUrl);
      } else if (result.user.role === 'SUPER_ADMIN') {
        navigate('/admin/dashboard');
      } else if (result.user.role === 'PLAYER') {
        navigate('/player/dashboard');
      } else {
        navigate('/organization/dashboard');
      }
    } catch (err: any) {
      setError(err?.message || 'Invalid email or password. Please verify your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="lg:flex">
      <AuthShowcase
        images={SPORTS_CAROUSELS.login}
        eyebrow="Live Match Control"
        title={<>Run your tournament like <span className="text-emerald-400">it's matchday.</span></>}
        description="Live scoring with instant undo, automated standings, and 16:9 broadcast scoreboards — all from one dashboard."
        stats={[
          { value: '120+', label: 'Clubs Onboarded' },
          { value: '500+', label: 'Matches Scored' },
          { value: '16:9', label: 'TV Broadcast' },
        ]}
        accent="emerald"
      />

    <div className="min-h-[85vh] flex-1 flex items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.21, 1.02, 0.73, 1] }}
        className="w-full max-w-md"
      >
        {/* Brand Header */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2.5 group mb-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-cyan-500 p-0.5 shadow-xl shadow-emerald-500/20 group-hover:scale-105 transition-transform flex items-center justify-center">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <Trophy className="w-6 h-6 text-emerald-400" />
              </div>
            </div>
          </Link>
          <h1 className="text-2xl font-black font-heading text-white tracking-tight">
            Sign In to Sportivo
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Access your tournament dashboard, player profile, and live scoreboards
          </p>
        </div>

        {/* Portal Tabs */}
        <div className="flex rounded-2xl bg-slate-900/90 p-1 border border-slate-800 mb-6 text-xs font-bold">
          <button
            type="button"
            onClick={() => handleTabChange('ORG_ADMIN')}
            className={`flex-1 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'ORG_ADMIN'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Club Login</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('PLAYER')}
            className={`flex-1 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'PLAYER'
                ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Player Login</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('SUPER_ADMIN')}
            className={`flex-1 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'SUPER_ADMIN'
                ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Super Admin</span>
          </button>
        </div>

        {/* Login Card */}
        <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-800 shadow-2xl relative">
          {error && (
            <div className="mb-5 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start gap-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  required
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl glass-input text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-300">
                  Password
                </label>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl glass-input text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-3 text-slate-500 hover:text-slate-300"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className={`w-full py-3 rounded-xl text-white font-black text-sm shadow-lg flex items-center justify-center gap-2 transition-all mt-6 ${
                activeTab === 'SUPER_ADMIN'
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-cyan-600/20'
                  : activeTab === 'PLAYER'
                  ? 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 shadow-amber-600/20'
                  : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-600/20'
              }`}
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Seeded demo logins — only rendered when VITE_SHOW_DEMO_ACCOUNTS=true. */}
          {SHOW_DEMO_ACCOUNTS && (
          <div className="mt-6 pt-5 border-t border-slate-800/80">
            <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 block mb-2">
              1-Click Demo Accounts:
            </span>

            {activeTab === 'PLAYER' ? (
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => handleQuickFill('shameer.player@gmail.com', '12345678', 'PLAYER')}
                  className="w-full p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-left text-xs transition-colors flex items-center justify-between"
                >
                  <div>
                    <span className="font-bold text-white block">Shameer Babu (⚽ Football Striker)</span>
                    <span className="text-[11px] text-slate-400">shameer.player@gmail.com • 12345678</span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 font-mono text-[11px] font-bold">Fill</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickFill('rahul.player@gmail.com', '12345678', 'PLAYER')}
                  className="w-full p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-left text-xs transition-colors flex items-center justify-between"
                >
                  <div>
                    <span className="font-bold text-white block">Rahul Menon (🏏 Cricket All-Rounder)</span>
                    <span className="text-[11px] text-slate-400">rahul.player@gmail.com • 12345678</span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-mono text-[11px] font-bold">Fill</span>
                </button>
              </div>
            ) : activeTab === 'SUPER_ADMIN' ? (
              <button
                type="button"
                onClick={() => handleQuickFill('syamdas@gmail.com', '12345678', 'SUPER_ADMIN')}
                className="w-full p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-left text-xs transition-colors flex items-center justify-between"
              >
                <div>
                  <span className="font-bold text-white block">Syam (Platform Super Admin)</span>
                  <span className="text-[11px] text-slate-400">syamdas@gmail.com • 12345678</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-mono text-[11px] font-bold">Fill</span>
              </button>
            ) : (
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => handleQuickFill('admin@greenvalley.com', '12345678', 'ORG_ADMIN')}
                  className="w-full p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-left text-xs transition-colors flex items-center justify-between"
                >
                  <div>
                    <span className="font-bold text-white block">Green Valley Sports Club</span>
                    <span className="text-[11px] text-slate-400">admin@greenvalley.com • 12345678</span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono text-[11px] font-bold">Fill</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickFill('admin@malabar.com', '12345678', 'ORG_ADMIN')}
                  className="w-full p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-left text-xs transition-colors flex items-center justify-between"
                >
                  <div>
                    <span className="font-bold text-white block">Malabar Cricket Academy</span>
                    <span className="text-[11px] text-slate-400">admin@malabar.com • 12345678</span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono text-[11px] font-bold">Fill</span>
                </button>
              </div>
            )}
          </div>
          )}
        </div>

        {/* Footer Links */}
        <div className="mt-6 p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div>
            Are you an athlete?{' '}
            <Link to="/register-player" className="text-cyan-400 font-bold hover:underline">
              Register as Player ↗
            </Link>
          </div>
          <div>
            Club or Academy?{' '}
            <Link to="/register-club" className="text-emerald-400 font-bold hover:underline">
              Register Club ↗
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
    </div>
  );
};

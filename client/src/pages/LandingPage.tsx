import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import type { Plan } from '../types';
import {
  ShieldCheck, Tv, Sparkles, CheckCircle2, ArrowRight
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useToast } from '../components/ui/Toast';
import { SHOW_DEMO_ACCOUNTS } from '../config';
import { SPORTS_IMAGES, SPORTS_CAROUSELS } from '../lib/sportsImagery';
import { useImageCarousel } from '../lib/useImageCarousel';
import { ImageCarouselBackdrop } from '../components/ImageCarouselBackdrop';

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09 } },
};

const GALLERY_ITEMS = [
  { image: SPORTS_IMAGES.cricketBallGrass, title: 'Cricket Match Day', tag: 'Cricket' },
  { image: SPORTS_IMAGES.stadiumNight, title: 'Live Cricket Fixtures', tag: 'Live Scoring' },
  { image: SPORTS_IMAGES.womensMatch, title: 'Ground Fee Collection', tag: 'Payments' },
  { image: SPORTS_IMAGES.sprinklerStadium, title: '16:9 TV Broadcast', tag: 'Big Screen' },
];

export const LandingPage: React.FC = () => {
  const toast = useToast();
  const { registerOrg } = useAuth();
  const navigate = useNavigate();
  const heroSlide = useImageCarousel(SPORTS_CAROUSELS.hero.length, 7000);
  const [showSignupModal, setShowSignupModal] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState('plan-standard');
  const [billingCycle, setBillingCycle] = useState<'all' | 'monthly' | 'yearly'>('all');

  // Dynamic Plans from Super Admin
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);

  // Signup form state
  const [orgName, setOrgName] = useState('');
  const [orgType, setOrgType] = useState('Sports Club');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [district, setDistrict] = useState('Malappuram');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        setLoadingPlans(true);
        const res = await api.get('/plans');
        if (Array.isArray(res) && res.length > 0) {
          setPlans(res);
          setSelectedPlanId(res[0]?.id || 'plan-standard');
        }
      } catch (err) {
        console.error('Failed to load plans', err);
      } finally {
        setLoadingPlans(false);
      }
    };

    fetchPlans();
  }, []);

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await registerOrg({
        organizationName: orgName,
        organizationType: orgType,
        contactPerson: contactName,
        email,
        phone,
        district,
        planId: selectedPlanId,
        paymentMethod: 'upi'
      });

      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      setSignupSuccess(true);
      setTimeout(() => {
        navigate('/organization/dashboard');
      }, 1500);
    } catch (err: any) {
      toast.error(err.message || 'Signup failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const featureLabels: Record<string, string> = {
    live_scoring: 'Live Scoring with Instant Undo',
    scoreboard_tv: '16:9 Big Screen TV Scoreboard',
    team_registration_links: 'Public Mobile Team Registration Links',
    standings: 'Automated Points Tables & GD/NRR',
    break_ads: 'Break-Time Sponsor Ads Rotator',
    sponsor_management: 'Sponsor Tiers Management',
    emergency_announcements: 'Emergency Delay Scoreboard Broadcasts',
    player_auctions: 'IPL/ISL Live Player Auction Arena',
    player_career_stats: 'Player Career Stats & Digital ID Pass',
    offline_payments_tracking: 'Offline Cash & UPI Payment Tracker',
    pdf_exports: 'Official Registration Receipts & PDF Exports',
    advanced_analytics: 'Advanced Analytics & Insights',
    custom_branding: 'Custom Organization Branding'
  };

  const filteredPlans = plans.filter(p => {
    if (billingCycle === 'all') return true;
    if (billingCycle === 'monthly') return p.billing_interval === 'monthly' || p.billing_type === 'recurring';
    if (billingCycle === 'yearly') return p.billing_interval === 'yearly';
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 overflow-hidden">
      {/* Background Gradients & Sports Glows */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-600/15 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-40 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 left-1/3 w-96 h-96 bg-amber-600/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[36rem] h-[36rem] bg-violet-600/10 rounded-full blur-3xl" />
      </div>

      {/* Hero Section */}
      <section className="relative z-10 pt-16 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center overflow-hidden">
        {/* Hero photo backdrop — rotates through football & cricket, never one sport */}
        <div className="absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
          <ImageCarouselBackdrop images={SPORTS_CAROUSELS.hero} activeIndex={heroSlide} className="opacity-25" />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/40 via-slate-950/85 to-slate-950" />
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-violet-500/10" />
        </div>

        {/* Floating decorative sport chips */}
        <div className="absolute top-24 left-[8%] text-3xl opacity-40 animate-float-slow select-none hidden sm:block" aria-hidden="true">⚽</div>
        <div className="absolute top-40 right-[10%] text-3xl opacity-40 animate-float-slower select-none hidden sm:block" aria-hidden="true">🏏</div>
        <div className="absolute bottom-10 left-[15%] text-2xl opacity-30 animate-float-slow select-none hidden sm:block" aria-hidden="true">🏆</div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
        >
          {/* Top Pills */}
          <motion.div variants={fadeUp} transition={{ duration: 0.5 }} className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold mb-8">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-spin" style={{ animationDuration: '4s' }} />
            <span>Professional Sports Management Platform</span>
            <span className="w-1 h-1 rounded-full bg-emerald-400" />
            <span className="text-slate-400 font-normal">Cricket Scoring Engine</span>
          </motion.div>

          <motion.h1 variants={fadeUp} transition={{ duration: 0.55 }} className="text-4xl sm:text-6xl lg:text-7xl font-black font-heading tracking-tight text-white max-w-5xl mx-auto leading-[1.1]">
            Power Local Tournaments with <span className="bg-gradient-to-r from-emerald-400 via-cyan-300 to-violet-400 bg-clip-text text-transparent">Next-Gen Sports Tech</span>
          </motion.h1>

          <motion.p variants={fadeUp} transition={{ duration: 0.55 }} className="mt-6 text-base sm:text-xl text-slate-400 max-w-3xl mx-auto leading-relaxed font-light">
            A full-featured sports platform for clubs, village panchayats, and tournament organizers.
            Manage club memberships, public team registrations, live digital scoring with undo, and 16:9 TV broadcast scoreboards.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div variants={fadeUp} transition={{ duration: 0.55 }} className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/register-club"
              className="px-7 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-black text-sm shadow-xl shadow-emerald-500/25 hover:scale-105 transition-all flex items-center gap-2"
            >
              <span>Register Sports Club</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/register-player"
              className="px-7 py-3.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 hover:border-cyan-500/50 text-white font-bold text-sm shadow-lg transition-all flex items-center gap-2 hover:scale-105"
            >
              <span className="text-cyan-400">⚡</span>
              <span>Join as Player</span>
            </Link>
            <Link
              to="/login"
              className="px-7 py-3.5 rounded-2xl bg-slate-900/90 text-white hover:bg-slate-800 font-bold text-sm border border-slate-700/80 flex items-center gap-2 hover:scale-105 transition-all shadow-md"
            >
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              <span>Sign In to Dashboard</span>
            </Link>

            <Link
              to="/scoreboard/match/match-fb-live-1"
              target="_blank"
              className="px-6 py-3.5 rounded-2xl bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 font-bold text-sm border border-emerald-500/30 flex items-center gap-2 hover:scale-105 transition-all"
            >
              <Tv className="w-4 h-4 text-emerald-400" />
              <span>16:9 Live TV</span>
            </Link>
          </motion.div>

          {/* Dedicated Portals Section */}
          <motion.div variants={fadeUp} transition={{ duration: 0.55 }} className="mt-14 max-w-5xl mx-auto p-5 rounded-3xl bg-slate-900/80 border border-slate-800/80 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between mb-4 px-1">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Direct Portals & Instant Login</span>
              </span>
              <span className="text-xs text-slate-400">Choose your access mode</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Club Login */}
              <Link
                to="/login?role=ORG_ADMIN"
                className="p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-cyan-500/60 hover:bg-cyan-500/5 text-left transition-all group"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-cyan-400">Clubs & Academies</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-1 transition-all" />
                </div>
                <div className="text-sm font-bold text-white">Club Dashboard</div>
                <p className="text-[11px] text-slate-400 mt-1">{SHOW_DEMO_ACCOUNTS ? 'admin@greenvalley.com • 12345678' : 'Run tournaments, teams and payments'}</p>
              </Link>

              {/* Player Login */}
              <Link
                to="/login?role=PLAYER"
                className="p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-amber-500/60 hover:bg-amber-500/5 text-left transition-all group"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-amber-400">Players & Athletes</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-amber-400 group-hover:translate-x-1 transition-all" />
                </div>
                <div className="text-sm font-bold text-white">Player Career Portal</div>
                <p className="text-[11px] text-slate-400 mt-1">{SHOW_DEMO_ACCOUNTS ? 'shameer.player@gmail.com • 12345678' : 'Track your stats and career profile'}</p>
              </Link>

              {/* Super Admin Login */}
              <Link
                to="/login?role=SUPER_ADMIN"
                className="p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-emerald-500/60 hover:bg-emerald-500/5 text-left transition-all group"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-emerald-400">Platform Owner</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all" />
                </div>
                <div className="text-sm font-bold text-white">Super Admin Portal</div>
                <p className="text-[11px] text-slate-400 mt-1">{SHOW_DEMO_ACCOUNTS ? 'syamdas@gmail.com • 12345678' : 'Manage plans, tenants and billing'}</p>
              </Link>
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* Sports in Action Gallery */}
      <section className="relative z-10 py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-800/60">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-2xl mx-auto mb-10"
        >
          <span className="text-xs font-bold uppercase tracking-widest text-cyan-400 block mb-2">
            Built For The Field
          </span>
          <h2 className="text-3xl sm:text-4xl font-black font-heading text-white">
            Every Format. Every Matchday.
          </h2>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {GALLERY_ITEMS.map(item => (
            <motion.div
              key={item.title}
              variants={fadeUp}
              transition={{ duration: 0.45 }}
              className="group relative aspect-[3/4] rounded-3xl overflow-hidden border border-slate-800 shadow-xl"
            >
              <div
                className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110"
                style={{ backgroundImage: `url(${item.image})` }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-4">
                <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold uppercase tracking-wider mb-2">
                  {item.tag}
                </span>
                <div className="text-sm font-bold text-white leading-tight">{item.title}</div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* DYNAMIC CLUB PLANS SECTION */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-800/60">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-3xl mx-auto mb-12"
        >
          <span className="text-xs font-bold uppercase tracking-widest text-emerald-400 block mb-2">
            TRANSPARENT CLUB PRICING
          </span>
          <h2 className="text-3xl sm:text-4xl font-black font-heading text-white">
            Membership Plans & Tournament Packages
          </h2>
          <p className="text-sm text-slate-400 mt-3">
            Choose the plan tailored for your sports club, academy, or independent tournament committee. All plans include real-time live scoring and automatic standings.
          </p>

          {/* Billing Interval Filter */}
          <div className="inline-flex items-center gap-1.5 p-1 rounded-2xl bg-slate-900 border border-slate-800 mt-6 text-xs font-bold">
            {(['all', 'monthly', 'yearly'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setBillingCycle(tab)}
                className={`px-4 py-1.5 rounded-xl capitalize transition-all ${
                  billingCycle === tab
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab === 'all' ? 'All Plans' : tab}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Dynamic Plans Grid */}
        {loadingPlans ? (
          <div className="flex justify-center items-center py-16">
            <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-80px' }}
            className={`grid gap-6 ${
            filteredPlans.length === 1 ? 'max-w-md mx-auto' :
            filteredPlans.length === 2 ? 'md:grid-cols-2 max-w-3xl mx-auto' :
            filteredPlans.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2 lg:grid-cols-4'
          }`}>
            {filteredPlans.map(plan => {
              const isPopular = plan.id.includes('standard') || plan.name.toLowerCase().includes('pro');
              const isOneTime = plan.billing_type === 'one_time';

              return (
                <motion.div
                  key={plan.id}
                  variants={fadeUp}
                  transition={{ duration: 0.45 }}
                  className={`rounded-3xl p-6 flex flex-col justify-between transition-all relative ${
                    isPopular
                      ? 'glass-panel border-2 border-emerald-500/80 shadow-2xl shadow-emerald-500/10'
                      : isOneTime
                      ? 'glass-card border border-amber-500/30 hover:border-amber-500/60'
                      : 'glass-card border border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-black text-[11px] uppercase tracking-wider shadow-md">
                      Most Popular
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between">
                      <div className={`text-xs font-bold uppercase tracking-wider ${
                        isPopular ? 'text-emerald-400' : isOneTime ? 'text-amber-400' : 'text-slate-400'
                      }`}>
                        {plan.name}
                      </div>
                      {plan.trial_days > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[11px] font-black uppercase">
                          {plan.trial_days}d Free Trial
                        </span>
                      )}
                    </div>

                    <div className="mt-3 flex items-baseline gap-1">
                      <span className="text-3xl sm:text-4xl font-black text-white font-heading">
                        ₹{plan.price.toLocaleString()}
                      </span>
                      <span className="text-xs text-slate-400">
                        {isOneTime ? '/ event' : `/${plan.billing_interval || 'month'}`}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 mt-2 min-h-[32px]">
                      {plan.description}
                    </p>

                    {/* Limits */}
                    <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-1.5 text-xs text-slate-300">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Active Tournaments:</span>
                        <strong className="text-white">{plan.tournament_limit >= 999 ? 'Unlimited' : plan.tournament_limit}</strong>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Teams Capacity:</span>
                        <strong className="text-white">{plan.team_limit >= 999 ? 'Unlimited' : `Up to ${plan.team_limit}`}</strong>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Players Capacity:</span>
                        <strong className="text-white">{plan.player_limit >= 999 ? 'Unlimited' : `${plan.player_limit} max`}</strong>
                      </div>
                    </div>

                    {/* Features List */}
                    <div className="mt-5 pt-4 border-t border-slate-800/80">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                        Included Features:
                      </span>
                      <ul className="space-y-2 text-xs text-slate-300">
                        {plan.features.map(f => (
                          <li key={f} className="flex items-center gap-2">
                            <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${
                              isPopular ? 'text-emerald-400' : isOneTime ? 'text-amber-400' : 'text-cyan-400'
                            }`} />
                            <span className="leading-tight">{featureLabels[f] || f.replace(/_/g, ' ')}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <button
                    onClick={() => { setSelectedPlanId(plan.id); setShowSignupModal(true); }}
                    className={`mt-8 w-full py-2.5 rounded-xl font-black text-xs transition-all ${
                      isPopular
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-lg shadow-emerald-500/20'
                        : isOneTime
                        ? 'bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300'
                        : 'bg-slate-800 hover:bg-slate-700 text-white'
                    }`}
                  >
                    {plan.trial_days > 0 ? `Start ${plan.trial_days}-Day Free Trial` : `Select ${plan.name}`}
                  </button>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </section>

      {/* Signup Modal */}
      {showSignupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl p-6 overflow-hidden">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white font-heading">Onboard Your Sports Organization</h3>
                <p className="text-xs text-slate-400">Step 1 of Club Onboarding</p>
              </div>
              <button
                onClick={() => setShowSignupModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {signupSuccess ? (
              <div className="p-8 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto text-xl font-bold">
                  ✓
                </div>
                <h4 className="text-lg font-bold text-white">Organization Activated!</h4>
                <p className="text-xs text-slate-400">Redirecting to your new organization workspace...</p>
              </div>
            ) : (
              <form onSubmit={handleSignupSubmit} className="space-y-3.5 text-xs">
                {/* Plan Selector Dropdown */}
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Selected Plan</label>
                  <select
                    value={selectedPlanId}
                    onChange={(e) => setSelectedPlanId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold outline-none focus:border-emerald-500"
                  >
                    {plans.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} — ₹{p.price.toLocaleString()} ({p.billing_type === 'one_time' ? 'One-time Event' : p.billing_interval || 'monthly'})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Organization / Club Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Malabar United Sports Club"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Organization Type</label>
                    <select
                      value={orgType}
                      onChange={(e) => setOrgType(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white outline-none"
                    >
                      <option value="Sports Club">Sports Club</option>
                      <option value="Sports Academy">Sports Academy</option>
                      <option value="Village Panchayat">Village Panchayat</option>
                      <option value="School / College">School / College</option>
                      <option value="Private Organizer">Private Organizer</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">District</label>
                    <select
                      value={district}
                      onChange={(e) => setDistrict(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white outline-none"
                    >
                      <option value="Malappuram">Malappuram</option>
                      <option value="Kozhikode">Kozhikode</option>
                      <option value="Ernakulam">Ernakulam</option>
                      <option value="Thrissur">Thrissur</option>
                      <option value="Thiruvananthapuram">Thiruvananthapuram</option>
                      <option value="Kannur">Kannur</option>
                      <option value="Palakkad">Palakkad</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Contact Person *</label>
                    <input
                      type="text"
                      required
                      placeholder="Manager Name"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Phone / WhatsApp *</label>
                    <input
                      type="tel"
                      required
                      placeholder="+91 98470 00000"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Admin Email Address *</label>
                  <input
                    type="email"
                    required
                    placeholder="admin@yourclub.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white outline-none focus:border-emerald-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full mt-4 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2"
                >
                  {isSubmitting ? 'Activating Organization...' : 'Complete Registration & Open Dashboard'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

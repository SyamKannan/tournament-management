import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../services/api';
import type { Plan } from '../types';
import {
  CheckCircle2, ArrowRight, Search,
  Zap, Tv, Smartphone, Trophy, Gavel, Wallet
} from 'lucide-react';
import { SPORTS_CAROUSELS, FEATURE_IMAGES } from '../lib/sportsImagery';
import { useImageCarousel } from '../lib/useImageCarousel';
import { ImageCarouselBackdrop } from '../components/ImageCarouselBackdrop';
import { LiveMatchesMarquee } from '../components/LiveMatchesMarquee';
import { SiteFooter } from '../components/SiteFooter';

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09 } },
};

// Plan cards list only this many features so long plans don't stretch the pricing grid.
const PLAN_FEATURE_PREVIEW = 6;

const FEATURE_ITEMS = [
  {
    image: FEATURE_IMAGES.batsmanStrike,
    position: 'center 45%',
    icon: Zap,
    tag: 'Live Scoring',
    title: 'Ball-by-Ball Scoring',
    description: 'Score every ball, goal and card as it happens. Tapped the wrong button? Undo it in one tap.',
  },
  {
    image: FEATURE_IMAGES.liveBigScreen,
    position: 'center 48%',
    icon: Tv,
    tag: 'Big Screen',
    title: 'TV & Projector Scoreboard',
    description: 'Put the live score up on any TV or projector so the whole ground sees it update in real time.',
  },
  {
    image: FEATURE_IMAGES.phoneOnPitch,
    position: 'center',
    icon: Smartphone,
    tag: 'Registration',
    title: 'Teams Register by Phone',
    description: 'Share one link. Teams sign up and add their squads from their phones, with no paperwork.',
  },
  {
    image: FEATURE_IMAGES.trophyLift,
    position: 'center 80%',
    icon: Trophy,
    tag: 'Standings',
    title: 'Automatic Points Table',
    description: 'Points, goal difference and net run rate update after every match. No spreadsheets needed.',
  },
  {
    image: FEATURE_IMAGES.teamHuddle,
    position: 'center 55%',
    icon: Gavel,
    tag: 'Auctions',
    title: 'Live Player Auctions',
    description: 'Run an IPL-style auction with live bids, team budgets and base prices on the big screen.',
  },
  {
    image: FEATURE_IMAGES.tapToPay,
    position: 'center',
    icon: Wallet,
    tag: 'Payments',
    title: 'Ground Fees & Receipts',
    description: 'Track cash and UPI entry fees, including part payments, and hand out receipts in seconds.',
  },
];

export const LandingPage: React.FC = () => {
  const heroSlide = useImageCarousel(SPORTS_CAROUSELS.hero.length, 7000);
  const [billingCycle, setBillingCycle] = useState<'all' | 'monthly' | 'yearly'>('all');

  // Dynamic Plans from Super Admin
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        setLoadingPlans(true);
        const res = await api.get('/plans');
        if (Array.isArray(res) && res.length > 0) {
          setPlans(res);
        }
      } catch (err) {
        console.error('Failed to load plans', err);
      } finally {
        setLoadingPlans(false);
      }
    };

    fetchPlans();
  }, []);

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
    custom_branding: 'Custom Organization Branding',
    coin_toss: 'Pre-Match Coin Toss',
    ai_tournament_poster: 'Match & Tournament Posters'
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
      <section className="relative z-10 pt-12 sm:pt-20 pb-16 sm:pb-24 px-4 sm:px-6 lg:px-8 text-center overflow-hidden">
        {/* Hero photo backdrop — rotates through football & cricket, never one sport.
            Full-bleed so the photo never shows a hard edge on wide screens. */}
        <div className="absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
          <ImageCarouselBackdrop images={SPORTS_CAROUSELS.hero} activeIndex={heroSlide} className="opacity-25" />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/40 via-slate-950/85 to-slate-950" />
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-violet-500/10" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgb(2_6_23)_100%)]" />
        </div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="max-w-7xl mx-auto"
        >
          {/* Top Pills */}
          <motion.div variants={fadeUp} transition={{ duration: 0.5 }} className="inline-flex max-w-full items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold mb-6 sm:mb-8 backdrop-blur">
            <Trophy className="w-3.5 h-3.5 shrink-0 text-amber-400" aria-hidden="true" />
            <span className="whitespace-nowrap">Made for village & club tournaments</span>
            {/* <span className="hidden sm:block w-1 h-1 rounded-full bg-emerald-400" /> */}
            {/* <span className="hidden sm:inline text-slate-400 font-normal">Football & Cricket</span> */}
          </motion.div>

          <motion.h1 variants={fadeUp} transition={{ duration: 0.55 }} className="text-[1.75rem] min-[400px]:text-4xl sm:text-5xl lg:text-7xl font-black font-heading tracking-tight text-white max-w-5xl mx-auto leading-[1.1]">
            <span className="block whitespace-nowrap">Your Tournament,</span>
            <span className="block whitespace-nowrap bg-gradient-to-r from-emerald-400 via-cyan-300 to-violet-400 bg-clip-text text-transparent">Scored Live.</span>
          </motion.h1>

          <motion.p variants={fadeUp} transition={{ duration: 0.55 }} className="mt-5 sm:mt-6 text-[15px] sm:text-xl text-slate-400 max-w-3xl mx-auto leading-relaxed">
            Register teams, score every ball and goal from your phone, and show the score on a TV at the
            ground. The points table updates itself after each match.
          </motion.p>

          {/* CTA Buttons — sign-in and player signup already live in the navbar */}
          <motion.div variants={fadeUp} transition={{ duration: 0.55 }} className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 max-w-sm sm:max-w-none mx-auto">
            <Link
              to="/register-club"
              className="px-7 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-black text-sm shadow-xl shadow-emerald-500/25 sm:hover:scale-105 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <span>Register Your Club</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="#features"
              className="px-7 py-3.5 rounded-2xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 hover:border-slate-600 text-white font-bold text-sm transition-all flex items-center justify-center gap-2 sm:hover:scale-105 active:scale-[0.98]"
            >
              See How It Works
            </a>
          </motion.div>

          <motion.p variants={fadeUp} transition={{ duration: 0.55 }} className="mt-5 text-sm text-slate-400">
            Played in a tournament?{' '}
            <Link to="/players" className="inline-flex items-center gap-1 font-semibold text-cyan-300 hover:text-cyan-200">
              <Search className="w-3.5 h-3.5" aria-hidden="true" />
              Find your stats
            </Link>
          </motion.p>

          {/* Current matches, scrolling — tap one for its score */}
          <motion.div variants={fadeUp} transition={{ duration: 0.55 }}>
            <LiveMatchesMarquee />
          </motion.div>
        </motion.div>
      </section>

      {/* Platform Features */}
      <section id="features" className="relative z-10 scroll-mt-20 py-20 sm:py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-800/60">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-2xl mx-auto mb-12"
        >
          <span className="text-xs font-bold uppercase tracking-widest text-cyan-400 block mb-2">
            Features
          </span>
          <h2 className="text-3xl sm:text-4xl font-black font-heading text-white">
            What You Can Do
          </h2>
          <p className="mt-4 text-[15px] sm:text-lg text-slate-400 leading-relaxed">
            Football and cricket tournaments, from team registration to the final.
          </p>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
        >
          {FEATURE_ITEMS.map(item => (
            <motion.div
              key={item.title}
              variants={fadeUp}
              transition={{ duration: 0.45 }}
              className="group flex flex-col rounded-3xl overflow-hidden border border-slate-800 bg-slate-900/60 shadow-xl hover:border-emerald-500/40 transition-colors"
            >
              <div className="relative aspect-[16/10] overflow-hidden">
                <div
                  className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110"
                  style={{ backgroundImage: `url(${item.image})`, backgroundPosition: item.position }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/30 to-transparent" />
                <span className="absolute top-3 left-3 px-2 py-0.5 rounded-full bg-slate-950/70 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold uppercase tracking-wider backdrop-blur">
                  {item.tag}
                </span>
              </div>
              <div className="flex-1 p-5 -mt-8 relative">
                <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mb-3 backdrop-blur">
                  <item.icon className="w-5 h-5 text-emerald-400" />
                </div>
                <h3 className="text-lg font-bold text-white leading-tight">{item.title}</h3>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">{item.description}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="relative z-10 scroll-mt-20 py-20 sm:py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-800/60">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-3xl mx-auto mb-12"
        >
          <span className="text-xs font-bold uppercase tracking-widest text-emerald-400 block mb-2">
            Pricing
          </span>
          <h2 className="text-3xl sm:text-4xl font-black font-heading text-white">
            Plans &amp; Prices
          </h2>
          <p className="text-[15px] sm:text-lg text-slate-400 mt-4 leading-relaxed">
            Pay per tournament or monthly. You only choose a plan when you host your first tournament.
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
            className="flex flex-wrap justify-center gap-6"
          >
            {filteredPlans.map(plan => {
              // Centered wrap: an odd plan count leaves a centered last row, not a lone card on the left.
              const planWidth = filteredPlans.length === 1
                ? 'md:max-w-md'
                : filteredPlans.length === 4
                ? 'md:w-[calc(50%-12px)] xl:w-[calc(25%-18px)]'
                : 'md:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)]';
              const isPopular = plan.id.includes('standard') || plan.name.toLowerCase().includes('pro');
              const isOneTime = plan.billing_type === 'one_time';
              const isFree = plan.price === 0;

              return (
                <motion.div
                  key={plan.id}
                  variants={fadeUp}
                  transition={{ duration: 0.45 }}
                  className={`w-full max-w-md md:max-w-none rounded-3xl p-6 flex flex-col justify-between transition-all relative ${planWidth} ${
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
                      {isFree && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[11px] font-black uppercase">
                          Free Tournament
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
                        {plan.features.slice(0, PLAN_FEATURE_PREVIEW).map(f => (
                          <li key={f} className="flex items-center gap-2">
                            <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${
                              isPopular ? 'text-emerald-400' : isOneTime ? 'text-amber-400' : 'text-cyan-400'
                            }`} />
                            <span className="leading-tight">{featureLabels[f] || f.replace(/_/g, ' ')}</span>
                          </li>
                        ))}
                      </ul>
                      {plan.features.length > PLAN_FEATURE_PREVIEW && (
                        <p className="mt-2.5 pl-[22px] text-[11px] font-semibold text-slate-500">
                          + {plan.features.length - PLAN_FEATURE_PREVIEW} more features
                        </p>
                      )}
                    </div>
                  </div>

                  <Link
                    to="/register-club"
                    className={`mt-8 w-full py-2.5 rounded-xl font-black text-xs text-center transition-all ${
                      isPopular
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-lg shadow-emerald-500/20'
                        : isOneTime
                        ? 'bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300'
                        : 'bg-slate-800 hover:bg-slate-700 text-white'
                    }`}
                  >
                    {isFree ? 'Get Started Free' : `Start with ${plan.name}`}
                  </Link>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </section>

      <SiteFooter />
    </div>
  );
};

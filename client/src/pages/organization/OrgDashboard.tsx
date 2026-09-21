import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { 
  Trophy, Users, DollarSign, CreditCard, 
  Plus, ExternalLink, Radio, ShieldCheck, Share2, Camera
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { ImageUploadModal } from '../../components/ImageUploadModal';
import { useToast } from '../../components/ui/Toast';
import { label } from '../../lib/labels';
import { formatDate, formatMoney } from '../../lib/format';

export const OrgDashboard: React.FC = () => {
  const toast = useToast();
  const { organization } = useAuth();
  const [showLogoModal, setShowLogoModal] = useState(false);
  const [orgLogo, setOrgLogo] = useState<string>('');
  const [usageData, setUsageData] = useState<any>(null);
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [financials, setFinancials] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const fetchOrgData = async () => {
    if (!organization) return;
    try {
      setLoading(true);
      const [usageRes, tourneysRes] = await Promise.all([
        api.get(`/organizations/${organization.id}/usage`),
        api.get('/tournaments')
      ]);
      setUsageData(usageRes);
      setTournaments(tourneysRes);

      if (tourneysRes.length > 0) {
        const finRes = await api.get(`/reports/financials/${tourneysRes[0].id}`);
        setFinancials(finRes);
      }
    } catch (err) {
      console.error('Failed to load org dashboard', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrgData();
  }, [organization]);

  const copyRegLink = (token: string) => {
    const url = `${window.location.origin}/register/team/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2500);
  };

  if (loading || !usageData) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-medium">Loading club dashboard...</span>
        </div>
      </div>
    );
  }

  const { subscription, plan, usage } = usageData;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Club Header Banner */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pb-5 border-b border-slate-800/80">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="relative group shrink-0">
            <img
              src={orgLogo || organization?.logo || 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=150&auto=format&fit=crop&q=80'}
              alt={organization?.name}
              className="w-14 h-14 rounded-2xl object-cover border border-slate-700/60 shadow-lg shadow-cyan-500/10 bg-slate-900"
            />
            <button
              type="button"
              onClick={() => setShowLogoModal(true)}
              title="Upload Club Crest / Logo"
              className="absolute inset-0 bg-black/60 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-xs font-bold gap-0.5 cursor-pointer"
            >
              <Camera className="w-4 h-4 text-cyan-400" />
              <span>Logo</span>
            </button>
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h1 className="text-lg sm:text-2xl font-black font-heading text-white tracking-tight leading-tight">{organization?.name}</h1>
              <span className="whitespace-nowrap px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 text-xs font-bold uppercase border border-cyan-500/20">
                {organization?.type || 'Sports Club'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {organization?.village && `${organization?.village}, `}{organization?.district}, {organization?.state}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:flex items-center gap-2.5">
          <Link
            to="/organization/tournaments"
            className="justify-center px-4 py-2.5 sm:py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 flex items-center gap-1.5 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Tournament</span>
          </Link>

          <Link
            to={`/organizations/${organization?.slug}`}
            target="_blank"
            className="justify-center px-3.5 py-2.5 sm:py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white font-semibold text-xs border border-slate-800 flex items-center gap-1.5 transition-colors"
          >
            <span>Public Page</span>
            <ExternalLink className="w-3 h-3 text-slate-400" />
          </Link>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Collected */}
        <div className="relative overflow-hidden p-4 sm:p-5 rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-900/60 border border-slate-800/80 hover:border-slate-700 transition-colors shadow-sm">
          <div className="flex items-center justify-between gap-2 text-xs text-slate-400 font-semibold mb-2">
            <span>Registration Revenue</span>
            <div className="shrink-0 w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-white font-heading tabular-nums">
            ₹{financials ? financials.summary.total_collected.toLocaleString() : '0'}
          </div>
          <div className="text-xs text-emerald-400 font-medium mt-1 flex flex-wrap items-center gap-x-1">
            <span>{financials ? `${financials.summary.collection_percentage}% collected` : '0%'}</span>
            <span className="text-slate-500 font-normal">of ₹{financials?.summary?.total_expected?.toLocaleString() || 0}</span>
          </div>
        </div>

        {/* Due Balance */}
        <div className="relative overflow-hidden p-4 sm:p-5 rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-900/60 border border-slate-800/80 hover:border-slate-700 transition-colors shadow-sm">
          <div className="flex items-center justify-between gap-2 text-xs text-slate-400 font-semibold mb-2">
            <span>Pending Balance</span>
            <div className="shrink-0 w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-amber-400" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-400 font-heading tabular-nums">
            ₹{financials ? financials.summary.total_pending.toLocaleString() : '0'}
          </div>
          <div className="hidden sm:block text-xs text-slate-400 font-medium mt-1">
            Advance collections awaiting ground settlement
          </div>
        </div>

        {/* Registered Teams */}
        <div className="relative overflow-hidden p-4 sm:p-5 rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-900/60 border border-slate-800/80 hover:border-slate-700 transition-colors shadow-sm">
          <div className="flex items-center justify-between gap-2 text-xs text-slate-400 font-semibold mb-2">
            <span>Registered Teams</span>
            <div className="shrink-0 w-7 h-7 rounded-lg bg-cyan-500/10 flex items-center justify-center">
              <Users className="w-4 h-4 text-cyan-400" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-white font-heading tabular-nums">
            {financials?.summary?.total_teams || 0} Teams
          </div>
          <div className="hidden sm:block text-xs text-slate-400 font-medium mt-1">
            Squad rosters & managers verified
          </div>
        </div>

        {/* Active Tournaments */}
        <div className="relative overflow-hidden p-4 sm:p-5 rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-900/60 border border-slate-800/80 hover:border-slate-700 transition-colors shadow-sm">
          <div className="flex items-center justify-between gap-2 text-xs text-slate-400 font-semibold mb-2">
            <span>Tournaments</span>
            <div className="shrink-0 w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center">
              <Trophy className="w-4 h-4 text-indigo-400" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-white font-heading tabular-nums">
            {tournaments.length} Active
          </div>
          <div className="hidden sm:block text-xs text-slate-400 font-medium mt-1">
            Across every sport you host
          </div>
        </div>
      </div>

      {/* Subscription & Resource Quota */}
      <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/80 border border-slate-800/80 flex flex-col lg:flex-row lg:items-center justify-between gap-4 lg:gap-6">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            {plan ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white">{plan.name}</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold uppercase border border-emerald-500/20">
                    {label(subscription?.status) || 'Active'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  ₹{subscription?.amount_paid ?? plan.price} / {plan.billing_interval || 'month'} • Renews {subscription?.next_billing_date ? formatDate(subscription.next_billing_date) : 'Active'}
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white">No Active Plan</span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-xs font-bold uppercase border border-slate-700">
                    Free Account
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Registration is free — choose a plan when you're ready to host your first tournament.
                </p>
              </>
            )}
          </div>
        </div>

        <Link
          to="/organization/billing"
          className="shrink-0 justify-center px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 flex items-center gap-1.5"
        >
          <CreditCard className="w-4 h-4" />
          <span>{plan ? 'Manage Plan' : 'Choose a Plan'}</span>
        </Link>

        {/* Quota Progress */}
        <div className="flex-1 lg:max-w-md grid grid-cols-3 gap-3 sm:gap-4">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-400">Tournaments</span>
              <span className="font-bold text-white font-mono">{usage.tournaments.current}/{usage.tournaments.max}</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${usage.tournaments.percentage}%` }} />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-400">Teams</span>
              <span className="font-bold text-white font-mono">{usage.teams.current}/{usage.teams.max}</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${usage.teams.percentage}%` }} />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-400">Sponsor Ads</span>
              <span className="font-bold text-white font-mono">{usage.ads.current}/{usage.ads.max}</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full bg-amber-500 rounded-full" style={{ width: `${usage.ads.percentage}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Tournaments Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            Active Tournaments
          </h2>
          <Link to="/organization/tournaments" className="text-xs font-bold text-cyan-400 hover:text-cyan-300">
            View All ({tournaments.length}) →
          </Link>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {tournaments.map(t => (
            <div key={t.id} className="p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-slate-800/80 hover:border-slate-700 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30 transition-all flex flex-col justify-between shadow-sm">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase border ${
                    t.sport_code === 'football' 
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  }`}>
                    {t.sport_code === 'football' ? '⚽ 7s Football' : '🏏 T20 Cricket'} • {label(t.status)}
                  </span>
                  <span className="text-xs font-mono font-bold text-slate-300">Ground Fee: {formatMoney(t.ground_fee)}</span>
                </div>

                <h3 className="text-base font-bold text-white font-heading">{t.name}</h3>
                <p className="text-xs text-slate-400 mt-1">{t.location || `${t.village}, ${t.district}`}</p>

                <div className="text-xs text-slate-400 mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span>Teams Registered: <strong className="text-white font-mono">{t.teams_count || 4} / {t.max_teams}</strong></span>
                  <span>Approved: <strong className="text-emerald-400 font-mono">{t.approved_teams_count || 4}</strong></span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => copyRegLink(t.registration_link_token || 'sevens-cup-2026-reg')}
                  className="px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold text-xs transition-colors flex items-center gap-1.5"
                >
                  <Share2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{copiedToken === (t.registration_link_token || 'sevens-cup-2026-reg') ? 'Copied Link!' : 'Share Reg Link'}</span>
                </button>

                <div className="flex items-center gap-2">
                  <Link
                    to={`/organization/tournaments/${t.id}/fixtures`}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 font-semibold text-xs transition-colors flex items-center gap-1"
                  >
                    <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
                    <span>Live Scorer</span>
                  </Link>

                  <Link
                    to="/organization/teams"
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition-colors"
                  >
                    Manage →
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Club Logo Upload Modal */}
      <ImageUploadModal
        isOpen={showLogoModal}
        onClose={() => setShowLogoModal(false)}
        title="Upload Club Crest / Logo"
        subtitle="Choose an image file from your computer or pick a club crest"
        currentImage={orgLogo || organization?.logo}
        folder="clubs"
        onSuccess={async (newUrl) => {
          if (!organization) return;
          try {
            await api.put(`/organizations/${organization.id}`, { logo: newUrl });
            setOrgLogo(newUrl);
            toast.success('Club logo updated successfully!');
          } catch (err) {
            console.error('Failed to update organization logo', err);
          }
        }}
      />
    </div>
  );
};

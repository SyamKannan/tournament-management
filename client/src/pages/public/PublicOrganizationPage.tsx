import React, { useState, useEffect } from 'react';
import { SportsLoader } from '../../components/ui/SportsLoader';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../services/api';
import type { Organization, Tournament, Sponsor } from '../../types';
import { 
  Trophy
} from 'lucide-react';
import { label } from '../../lib/labels';
import { formatMoney } from '../../lib/format';

export const PublicOrganizationPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<{
    organization: Organization;
    active_tournaments: Tournament[];
    past_tournaments: Tournament[];
    sponsors: Sponsor[];
  } | null>(null);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrg = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/organizations/public/${slug || 'green-valley-sc'}`);
        setData(res);
      } catch (err) {
        console.error('Failed to load org profile', err);
      } finally {
        setLoading(false);
      }
    };
    fetchOrg();
  }, [slug]);

  if (loading || !data) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="flex items-center gap-3 text-emerald-400">
          <SportsLoader size="sm" />
          <span className="font-semibold text-sm">Loading Organization Profile...</span>
        </div>
      </div>
    );
  }

  const { organization, active_tournaments } = data;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20">
      {/* Banner */}
      <div className="h-56 sm:h-72 w-full relative overflow-hidden bg-slate-900 border-b border-slate-800">
        <img src={organization.banner} alt={organization.name} className="w-full h-full object-cover opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-20 relative z-10">
        <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-6 pb-8 border-b border-slate-800">
          <div className="flex items-end gap-5">
            <img
              src={organization.logo}
              alt={organization.name}
              className="w-28 h-28 rounded-3xl object-cover border-4 border-slate-900 shadow-2xl bg-slate-900 flex-shrink-0"
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold uppercase">
                  {organization.type}
                </span>
                <span className="text-xs text-slate-400 font-semibold">{organization.district}, {organization.state}</span>
              </div>
              <h1 className="text-2xl sm:text-4xl font-black font-heading text-white tracking-tight mt-1">{organization.name}</h1>
              <p className="text-xs text-slate-300 mt-2 max-w-2xl leading-relaxed">{organization.description}</p>
            </div>
          </div>
        </div>

        {/* Tournaments Grid */}
        <div className="mt-10 space-y-8">
          <div>
            <h2 className="text-xl font-bold font-heading text-white mb-4 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-emerald-400" />
              <span>Active & Upcoming Tournaments ({active_tournaments.length})</span>
            </h2>

            <div className="grid md:grid-cols-2 gap-4">
              {active_tournaments.map(t => (
                <div key={t.id} className="p-6 rounded-3xl glass-card border border-slate-800 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold uppercase">
                        {t.sport_code.toUpperCase()} • {label(t.format)}
                      </span>
                      <span className="font-mono text-xs font-bold text-emerald-400">Fee: {formatMoney(t.ground_fee)}</span>
                    </div>
                    <h3 className="text-lg font-bold text-white font-heading">{t.name}</h3>
                    <p className="text-xs text-slate-400 mt-1">{t.location || t.district}</p>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between">
                    <Link
                      to={`/tournaments/${t.slug}`}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md"
                    >
                      Visit Tournament Hub →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, MapPin, Calendar, Users, Clock, Plus } from 'lucide-react';
import { api, ApiError } from '../../services/api';
import type { Organization, Tournament } from '../../types';
import { LoadingState, EmptyState } from '../../components/ui/Feedback';
import { PageHeader, money, formatDay } from './teamShared';

interface OpenTournament {
  registration_token: string;
  spots_left: number;
  entry_fee: number;
  closes_on: string | null;
  organization: Pick<Organization, 'id' | 'name' | 'logo'> | null;
  tournament: Pick<Tournament, 'id' | 'name' | 'slug' | 'sport_code' | 'logo' | 'location' | 'district' | 'start_date' | 'end_date' | 'max_teams'>;
}

/** Tournaments taking entries now; "Join & Pay" opens the entry form with the manager's details filled in. */
export const TeamJoinPage: React.FC = () => {
  const [open, setOpen] = useState<OpenTournament[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sport, setSport] = useState<'all' | 'football' | 'cricket'>('all');

  useEffect(() => {
    api.get('/teams/open-tournaments')
      .then(res => setOpen(Array.isArray(res) ? res : []))
      .catch(err => setError(err instanceof ApiError ? err.message : 'Failed to load tournaments'));
  }, []);

  if (error) return <EmptyState icon={Trophy} title="Couldn't load tournaments" message={error} />;
  if (!open) return <LoadingState label="Finding open tournaments…" />;

  const shown = open.filter(o => sport === 'all' || o.tournament.sport_code === sport);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Join a Tournament"
        subtitle="Tournaments taking entries now. Enter your squad and pay the ground fee in full or in halves."
        action={
          <div className="inline-flex p-1 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold self-start">
            {(['all', 'football', 'cricket'] as const).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setSport(s)}
                aria-pressed={sport === s}
                className={`px-3 py-1.5 rounded-lg capitalize transition-colors ${sport === s ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                {s === 'all' ? 'All sports' : s}
              </button>
            ))}
          </div>
        }
      />

      {shown.length === 0 ? (
        <EmptyState icon={Trophy} title="Nothing open right now" message="No tournaments are taking entries at the moment. Check back soon." />
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {shown.map(({ tournament, organization, registration_token, spots_left, entry_fee, closes_on }) => (
            <div key={tournament.id} className="p-5 rounded-2xl glass-card border border-slate-800 hover:border-emerald-500/40 transition-colors flex flex-col">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-700 overflow-hidden shrink-0 grid place-items-center">
                  {tournament.logo ? <img src={tournament.logo} alt="" className="w-full h-full object-cover" /> : <Trophy className="w-5 h-5 text-amber-400" />}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-white leading-tight">{tournament.name}</h3>
                  <p className="text-xs text-slate-400 mt-0.5 capitalize">
                    {tournament.sport_code}{organization ? ` · ${organization.name}` : ''}
                  </p>
                </div>
              </div>

              <dl className="mt-4 space-y-1.5 text-xs text-slate-300 flex-1">
                {(tournament.location || tournament.district) && (
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-500" />
                    <span className="truncate">{[tournament.location, tournament.district].filter(Boolean).join(', ')}</span>
                  </div>
                )}
                {tournament.start_date && (
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    <span>Starts {formatDay(tournament.start_date)}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-slate-500" />
                  <span>{spots_left} of {tournament.max_teams} places left</span>
                </div>
                {closes_on && (
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    <span>Entries close {formatDay(closes_on)}</span>
                  </div>
                )}
              </dl>

              <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Ground fee</p>
                  <p className="text-base font-black text-white">{entry_fee > 0 ? money(entry_fee) : 'Free'}</p>
                </div>
                <Link
                  to={`/register/team/${registration_token}`}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-md shadow-emerald-600/20 flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" /> Join &amp; Pay
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

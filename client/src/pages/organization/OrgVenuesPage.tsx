import React, { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/Feedback';
import { MapPin, Plus, Trash2, Pencil, ExternalLink, Check, X } from 'lucide-react';

type Venue = {
  id: string;
  name: string;
  address: string | null;
  village: string;
  panchayat: string;
  district: string;
  google_maps_url: string | null;
  fixture_count: number;
};

const BLANK = { name: '', address: '', village: '', panchayat: '', district: '', google_maps_url: '' };

/**
 * The grounds this club plays on.
 *
 * Worth its own page because the fixture builder spreads a matchday across
 * everything listed here — one ground means one match at a time, three means an
 * eight-team group stage finishes in an afternoon.
 */
export const OrgVenuesPage: React.FC = () => {
  const toast = useToast();
  const confirm = useConfirm();
  const { organization } = useAuth();

  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(BLANK);

  const load = useCallback(async () => {
    if (!organization?.id) return;
    setLoading(true);
    try {
      setVenues(await api.get(`/venues?organization_id=${organization.id}`));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not load your grounds');
    } finally {
      setLoading(false);
    }
  }, [organization?.id]);

  useEffect(() => { load(); }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/venues/${editingId}`, form);
        toast.success('Ground updated');
      } else {
        await api.post('/venues', form);
        toast.success('Ground added');
      }
      setForm(BLANK);
      setEditingId(null);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save that ground');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (venue: Venue) => {
    setEditingId(venue.id);
    setForm({
      name: venue.name,
      address: venue.address || '',
      village: venue.village || '',
      panchayat: venue.panchayat || '',
      district: venue.district || '',
      google_maps_url: venue.google_maps_url || '',
    });
  };

  const remove = async (venue: Venue) => {
    const proceed = await confirm({
      title: `Remove ${venue.name}?`,
      message: venue.fixture_count > 0
        ? `${venue.fixture_count} fixture${venue.fixture_count === 1 ? '' : 's'} point at this ground. Scheduled ones will be left without a ground; matches already played keep it and will block the removal.`
        : 'This ground will no longer be used when building a schedule.',
      confirmLabel: 'Remove ground',
      tone: 'danger',
    });
    if (!proceed) return;

    try {
      const res = await api.delete(`/venues/${venue.id}`);
      toast.success(
        res?.released_fixtures
          ? `Ground removed. ${res.released_fixtures} fixture(s) now need a ground.`
          : 'Ground removed'
      );
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not remove that ground');
    }
  };

  if (!organization?.id) return null;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-black font-heading text-white flex items-center gap-2">
          <MapPin className="w-6 h-6 text-emerald-400" />
          Grounds
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Where your matches are played. A schedule spreads each matchday across every ground
          listed here, so adding one lets more matches run at the same time.
        </p>
      </div>

      <form onSubmit={submit} className="p-6 rounded-3xl glass-card border border-slate-800 space-y-4">
        <h3 className="text-sm font-bold text-white font-heading">
          {editingId ? 'Edit ground' : 'Add a ground'}
        </h3>

        <div className="grid sm:grid-cols-2 gap-3 text-xs">
          <div className="sm:col-span-2">
            <label className="block text-slate-300 font-semibold mb-1">Ground name</label>
            <input
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="Kottappadi Football Stadium"
              className="w-full px-3.5 py-2 rounded-xl glass-input"
              required
            />
          </div>
          {([
            ['village', 'Village'],
            ['panchayat', 'Panchayat'],
            ['district', 'District'],
            ['google_maps_url', 'Google Maps link'],
          ] as const).map(([field, labelText]) => (
            <div key={field}>
              <label className="block text-slate-300 font-semibold mb-1">{labelText}</label>
              <input
                value={form[field]}
                onChange={e => setForm({ ...form, [field]: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl glass-input"
              />
            </div>
          ))}
          <div className="sm:col-span-2">
            <label className="block text-slate-300 font-semibold mb-1">Address</label>
            <input
              value={form.address}
              onChange={e => setForm({ ...form, address: e.target.value })}
              className="w-full px-3.5 py-2 rounded-xl glass-input"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          {editingId && (
            <button
              type="button"
              onClick={() => { setEditingId(null); setForm(BLANK); }}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold text-xs flex items-center gap-1.5"
            >
              <X className="w-4 h-4" />
              <span>Cancel</span>
            </button>
          )}
          <button
            type="submit"
            disabled={saving || !form.name.trim()}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/25 flex items-center gap-1.5 disabled:opacity-60"
          >
            {editingId ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            <span>{saving ? 'Saving…' : editingId ? 'Save ground' : 'Add ground'}</span>
          </button>
        </div>
      </form>

      {loading ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : venues.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="No grounds yet"
          message="Add the pitches you play on. Fixtures generated without any ground are still scheduled — they just do not say where."
        />
      ) : (
        <div className="space-y-2">
          {venues.map(venue => (
            <div
              key={venue.id}
              className="p-4 rounded-2xl glass-card border border-slate-800 flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-bold text-white truncate">{venue.name}</div>
                <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                  {[venue.village, venue.panchayat, venue.district].filter(Boolean).join(' · ') || 'No location set'}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  {venue.fixture_count === 0
                    ? 'No fixtures yet'
                    : `${venue.fixture_count} fixture${venue.fixture_count === 1 ? '' : 's'}`}
                  {venue.google_maps_url && (
                    <a
                      href={venue.google_maps_url}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-2 text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1"
                    >
                      Map <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </p>
              </div>

              <div className="flex gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => startEdit(venue)}
                  title="Edit this ground"
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(venue)}
                  title="Remove this ground"
                  className="p-2 rounded-xl bg-slate-800 hover:bg-rose-600/20 border border-slate-700 hover:border-rose-500/40 text-slate-300 hover:text-rose-400"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

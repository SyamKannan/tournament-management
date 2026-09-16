import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../services/api';
import type { Plan } from '../../types';
import { 
  Plus, X, LogIn, Loader2, Building2, Search, Trophy, ShieldCheck, AlertCircle
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { Skeleton, SkeletonTable } from '../../components/ui/Feedback';
import { PhoneInput } from '../../components/PhoneInput';

export const AdminOrganizationsPage: React.FC = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const { impersonate } = useAuth();
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [impersonatingOrgId, setImpersonatingOrgId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'active' | 'suspended'>('ALL');

  // Form state for Super Admin manual onboarding
  const [name, setName] = useState('');
  const [type, setType] = useState('Sports Club');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [district, _setDistrict] = useState('Malappuram');
  const [planId, setPlanId] = useState('');

  const fetchOrgs = async () => {
    try {
      setLoading(true);
      const [orgsRes, plansRes] = await Promise.all([
        api.get('/admin/organizations'),
        api.get('/admin/plans')
      ]);
      setOrganizations(orgsRes);
      setPlans(plansRes);
      if (plansRes.length > 0 && !planId) setPlanId(plansRes[0].id);
    } catch (err) {
      console.error('Failed to fetch organizations', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrgs();
  }, []);

  const handleStatusToggle = async (orgId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
      await api.put(`/admin/organizations/${orgId}/status`, { status: nextStatus });
      fetchOrgs();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update organization status');
    }
  };

  const handleImpersonate = async (org: any) => {
    try {
      setImpersonatingOrgId(org.id);
      const res = await impersonate({ organizationId: org.id });
      toast.success(`Logged in as ${res.user.name} (${org.name})`);
      navigate('/organization/dashboard');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to login as organization admin');
    } finally {
      setImpersonatingOrgId(null);
    }
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/admin/organizations', {
        name,
        type,
        contact_person: contactPerson,
        phone,
        email,
        district,
        plan_id: planId,
        admin_name: contactPerson,
        admin_email: email,
        admin_password: 'admin' + Date.now().toString().slice(-4)
      });
      setShowCreateModal(false);
      fetchOrgs();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create organization');
    }
  };

  const filteredOrganizations = useMemo(() => {
    const q = search.toLowerCase();
    return organizations.filter(o => {
      const matchesStatus = statusFilter === 'ALL' || o.status === statusFilter;
      const matchesSearch = 
        o.name?.toLowerCase().includes(q) ||
        o.contact_person?.toLowerCase().includes(q) ||
        o.email?.toLowerCase().includes(q) ||
        o.district?.toLowerCase().includes(q) ||
        o.type?.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [organizations, search, statusFilter]);

  const counts = useMemo(() => {
    return {
      total: organizations.length,
      active: organizations.filter(o => o.status === 'active').length,
      suspended: organizations.filter(o => o.status === 'suspended').length,
      totalTournaments: organizations.reduce((acc, o) => acc + (o.tournaments_count || 0), 0),
    };
  }, [organizations]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-72" />
        <SkeletonTable rows={6} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold uppercase tracking-wider">
              Club Directory
            </span>
          </div>
          <h1 className="text-2xl font-black font-heading text-white">Organizations</h1>
          <p className="text-xs text-slate-400 mt-1">Activate, suspend or add clubs, and sign in as a club admin to help them</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/25 flex items-center gap-1.5 active:scale-95 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Onboard New Organization</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Organizations</div>
            <div className="text-2xl font-black text-white font-mono mt-1">{counts.total}</div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
            <Building2 className="w-4 h-4" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">Active Clubs</div>
            <div className="text-2xl font-black text-emerald-300 font-mono mt-1">{counts.active}</div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <ShieldCheck className="w-4 h-4" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-[11px] font-bold text-rose-400 uppercase tracking-wider">Suspended</div>
            <div className="text-2xl font-black text-rose-300 font-mono mt-1">{counts.suspended}</div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
            <AlertCircle className="w-4 h-4" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">Hosted Tourneys</div>
            <div className="text-2xl font-black text-amber-300 font-mono mt-1">{counts.totalTournaments}</div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Trophy className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by club name, contact, email, or district..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* Status filter buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto text-xs pb-1 md:pb-0">
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
              statusFilter === 'ALL'
                ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            All Organizations ({counts.total})
          </button>
          <button
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 ${
              statusFilter === 'active'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Active ({counts.active})</span>
          </button>
          <button
            onClick={() => setStatusFilter('suspended')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 ${
              statusFilter === 'suspended'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Suspended ({counts.suspended})</span>
          </button>
        </div>
      </div>

      {/* Organizations Table */}
      <div className="border border-slate-800 rounded-2xl overflow-hidden glass-card">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 uppercase text-[11px] font-bold tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Organization</th>
                <th className="px-4 py-3.5">Type</th>
                <th className="px-4 py-3.5">Plan / Tier</th>
                <th className="px-4 py-3.5">Admin Contact</th>
                <th className="px-4 py-3.5 text-center">Tournaments</th>
                <th className="px-4 py-3.5 text-center">Status</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredOrganizations.map(org => (
                <tr key={org.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <img src={org.logo} alt={org.name} className="w-9 h-9 rounded-xl object-cover border border-slate-700 bg-slate-900" />
                      <div>
                        <Link to={`/organizations/${org.slug}`} className="font-bold text-white text-xs hover:text-emerald-400 transition-colors">
                          {org.name}
                        </Link>
                        <div className="text-[11px] text-slate-400">{org.district}, {org.state}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-slate-300 font-medium">
                    {org.type}
                  </td>
                  <td className="px-4 py-4">
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-semibold font-mono text-[11px]">
                      {org.plan?.name || 'Standard Pro'}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="text-white font-medium">{org.contact_person}</div>
                    <div className="text-[11px] text-slate-400 font-mono">{org.phone}</div>
                  </td>
                  <td className="px-4 py-4 text-center font-mono font-bold text-slate-200">
                    {org.tournaments_count || 0}
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase ${
                      org.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                    }`}>
                      {org.status}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleImpersonate(org)}
                        disabled={impersonatingOrgId === org.id}
                        title="Login and test platform as this Club Admin"
                        className="px-2.5 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-500/20 text-xs font-semibold transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                      >
                        {impersonatingOrgId === org.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <LogIn className="w-3.5 h-3.5" />
                        )}
                        <span>Login As Club</span>
                      </button>

                      <button
                        onClick={() => handleStatusToggle(org.id, org.status)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                          org.status === 'active'
                            ? 'bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 border border-rose-500/20'
                            : 'bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 border border-emerald-500/20'
                        }`}
                      >
                        {org.status === 'active' ? 'Suspend' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Onboarding Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <h3 className="text-base font-bold text-white font-heading">Onboard Organization (Super Admin)</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateOrg} className="p-6 space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Organization Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Kozhikode Youth Sports Association"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full px-3.5 py-2 rounded-xl glass-input"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Organization Type</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl glass-input bg-slate-900"
                  >
                    <option value="Sports Club">Sports Club</option>
                    <option value="Village Association">Village Association</option>
                    <option value="Panchayat">Panchayat Sports Council</option>
                    <option value="Sports Academy">Sports Academy</option>
                    <option value="Private Organizer">Private Organizer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Assign Plan *</label>
                  <select
                    value={planId}
                    onChange={(e) => setPlanId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl glass-input bg-slate-900 text-emerald-400 font-semibold"
                  >
                    {plans.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.currency}{p.price})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Admin Contact Person *</label>
                  <input
                    type="text"
                    placeholder="e.g. Ramesh Nair"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    required
                    className="w-full px-3.5 py-2 rounded-xl glass-input"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Mobile Number *</label>
                  <PhoneInput
                    placeholder="98470 12345"
                    value={phone}
                    onChange={setPhone}
                    required
                    className="w-full px-3.5 py-2 rounded-xl glass-input"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Admin Email *</label>
                <input
                  type="email"
                  placeholder="admin@sportsorg.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3.5 py-2 rounded-xl glass-input"
                />
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold"
                >
                  Create & Activate Organization
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

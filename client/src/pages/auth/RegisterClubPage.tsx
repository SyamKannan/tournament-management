import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import type { Plan } from '../../types';
import { 
  Building2, ArrowRight, ArrowLeft, AlertCircle
} from 'lucide-react';

export const RegisterClubPage: React.FC = () => {
  const navigate = useNavigate();
  const { registerOrg } = useAuth();

  const [step, setStep] = useState<1 | 2>(1);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);

  const [formData, setFormData] = useState({
    organizationName: '',
    organizationType: 'Sports Club',
    contactPerson: '',
    phone: '',
    whatsapp: '',
    email: '',
    password: '',
    village: '',
    panchayat: '',
    district: 'Malappuram',
    state: 'Kerala',
    planId: 'plan-standard'
  });

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        setLoadingPlans(true);
        const res = await api.get('/plans');
        if (Array.isArray(res) && res.length > 0) {
          setPlans(res);
          setFormData(prev => ({ ...prev, planId: res[0]?.id || 'plan-standard' }));
        }
      } catch (err) {
        console.error('Failed to load plans', err);
      } finally {
        setLoadingPlans(false);
      }
    };

    fetchPlans();
  }, []);

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleStep1Submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.organizationName || !formData.contactPerson || !formData.email || !formData.password || !formData.phone) {
      setError('Please fill in all required fields.');
      return;
    }
    setError(null);
    setStep(2);
  };

  const handleFinalSubmit = async () => {
    setIsLoading(true);
    setError(null);

    try {
      await registerOrg(formData);
      navigate('/organization/dashboard');
    } catch (err: any) {
      setError(err?.message || 'Failed to register organization. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[85vh] max-w-2xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="text-center mb-8">
        <Link to="/" className="inline-flex items-center gap-2 mb-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-500 p-0.5 shadow-lg shadow-cyan-500/20 flex items-center justify-center">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <Building2 className="w-5 h-5 text-cyan-400" />
            </div>
          </div>
        </Link>
        <h1 className="text-2xl font-black font-heading text-white tracking-tight">
          Register Your Sports Club / Organization
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Create your organization account to host football & cricket tournaments with live scoring
        </p>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-3 mt-6">
          <div className={`flex items-center gap-1.5 text-xs font-bold ${step >= 1 ? 'text-cyan-400' : 'text-slate-500'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${step >= 1 ? 'bg-cyan-500 text-slate-950 font-black' : 'bg-slate-800 text-slate-400'}`}>1</span>
            <span>Club Details</span>
          </div>
          <div className="w-8 h-0.5 bg-slate-800" />
          <div className={`flex items-center gap-1.5 text-xs font-bold ${step >= 2 ? 'text-cyan-400' : 'text-slate-500'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${step >= 2 ? 'bg-cyan-500 text-slate-950 font-black' : 'bg-slate-800 text-slate-400'}`}>2</span>
            <span>Select Plan</span>
          </div>
        </div>
      </div>

      {/* Main Card */}
      <div className="p-6 sm:p-8 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl backdrop-blur-xl">
        {error && (
          <div className="mb-5 p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {step === 1 ? (
          <form onSubmit={handleStep1Submit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                Organization / Club Name *
              </label>
              <input
                type="text"
                value={formData.organizationName}
                onChange={(e) => handleChange('organizationName', e.target.value)}
                placeholder="e.g. Green Valley Sports Club"
                required
                className="w-full px-4 py-2.5 rounded-xl glass-input text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Organization Type
                </label>
                <select
                  value={formData.organizationType}
                  onChange={(e) => handleChange('organizationType', e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl glass-input text-sm text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="Sports Club">Sports Club</option>
                  <option value="Sports Academy">Sports Academy</option>
                  <option value="Village Panchayat">Village Panchayat</option>
                  <option value="School / College">School / College</option>
                  <option value="Private Organizer">Private Organizer</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Contact Person Name *
                </label>
                <input
                  type="text"
                  value={formData.contactPerson}
                  onChange={(e) => handleChange('contactPerson', e.target.value)}
                  placeholder="e.g. Rahul K."
                  required
                  className="w-full px-4 py-2.5 rounded-xl glass-input text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Phone Number *
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  placeholder="+91 98470 12345"
                  required
                  className="w-full px-4 py-2.5 rounded-xl glass-input text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  WhatsApp Number
                </label>
                <input
                  type="tel"
                  value={formData.whatsapp}
                  onChange={(e) => handleChange('whatsapp', e.target.value)}
                  placeholder="+91 98470 12345"
                  className="w-full px-4 py-2.5 rounded-xl glass-input text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Admin Email Address *
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  placeholder="admin@greenvalley.com"
                  required
                  className="w-full px-4 py-2.5 rounded-xl glass-input text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Password *
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => handleChange('password', e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-4 py-2.5 rounded-xl glass-input text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Village / City
                </label>
                <input
                  type="text"
                  value={formData.village}
                  onChange={(e) => handleChange('village', e.target.value)}
                  placeholder="e.g. Nilambur"
                  className="w-full px-4 py-2.5 rounded-xl glass-input text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  District
                </label>
                <select
                  value={formData.district}
                  onChange={(e) => handleChange('district', e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl glass-input text-sm text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="Malappuram">Malappuram</option>
                  <option value="Kozhikode">Kozhikode</option>
                  <option value="Ernakulam">Ernakulam</option>
                  <option value="Thrissur">Thrissur</option>
                  <option value="Thiruvananthapuram">Thiruvananthapuram</option>
                  <option value="Kannur">Kannur</option>
                  <option value="Palakkad">Palakkad</option>
                  <option value="Kollam">Kollam</option>
                  <option value="Alappuzha">Alappuzha</option>
                  <option value="Kottayam">Kottayam</option>
                  <option value="Idukki">Idukki</option>
                  <option value="Wayanad">Wayanad</option>
                  <option value="Kasaragod">Kasaragod</option>
                  <option value="Pathanamthitta">Pathanamthitta</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="w-full mt-4 py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-sm shadow-lg shadow-cyan-600/20 flex items-center justify-center gap-2"
            >
              <span>Continue to Select Plan</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        ) : (
          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-bold text-white mb-3">Choose a Plan for {formData.organizationName}:</h3>
              
              {loadingPlans ? (
                <div className="py-8 text-center text-xs text-slate-400">Loading available plans...</div>
              ) : (
                <div className="space-y-3">
                  {plans.map(p => {
                    const isSelected = formData.planId === p.id;
                    const isOneTime = p.billing_type === 'one_time';

                    return (
                      <div
                        key={p.id}
                        onClick={() => handleChange('planId', p.id)}
                        className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-cyan-500/10 border-cyan-500/60 ring-1 ring-cyan-500/40 shadow-lg'
                            : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white text-sm">{p.name}</span>
                              {p.trial_days > 0 && (
                                <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 text-[11px] font-bold uppercase">
                                  {p.trial_days}-Day Free Trial
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400 mt-1">
                              {p.description || `${p.tournament_limit >= 999 ? 'Unlimited' : p.tournament_limit} Tournaments, ${p.team_limit} Teams, ${p.player_limit} Players`}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-base font-black text-cyan-400 font-mono">
                              ₹{p.price.toLocaleString()}
                              <span className="text-[11px] text-slate-400 font-normal">
                                {isOneTime ? '/event' : `/${p.billing_interval || 'mo'}`}
                              </span>
                            </div>
                            {p.trial_days > 0 && (
                              <div className="text-[11px] text-slate-500 font-medium">Free during trial</div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>

              <button
                type="button"
                onClick={handleFinalSubmit}
                disabled={isLoading}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Complete Registration & Open Dashboard</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        <div className="mt-6 pt-5 border-t border-slate-800 text-center">
          <p className="text-xs text-slate-400">
            Already registered?{' '}
            <Link to="/login" className="text-cyan-400 hover:text-cyan-300 font-semibold underline underline-offset-2">
              Sign In to Your Dashboard
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

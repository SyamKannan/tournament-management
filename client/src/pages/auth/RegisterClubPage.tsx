import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { AuthShowcase } from '../../components/AuthShowcase';
import { ImageUploadModal } from '../../components/ImageUploadModal';
import { PhoneInput } from '../../components/PhoneInput';
import { COUNTRIES } from '../../lib/countries';
import { SPORTS_CAROUSELS } from '../../lib/sportsImagery';
import {
  Building2, ArrowRight, AlertCircle, Camera
} from 'lucide-react';

export const RegisterClubPage: React.FC = () => {
  const navigate = useNavigate();
  const { registerOrg } = useAuth();

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
    district: '',
    state: '',
    country: 'India',
    logo: ''
  });

  const [showLogoModal, setShowLogoModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.organizationName || !formData.contactPerson || !formData.email || !formData.password || !formData.phone) {
      setError('Please fill in all required fields.');
      return;
    }
    setError(null);
    setIsLoading(true);

    try {
      await registerOrg(formData);
      navigate('/organization/dashboard');
    } catch (err: any) {
      setError(err?.message || 'Failed to register organization. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="lg:flex">
      <AuthShowcase
        images={SPORTS_CAROUSELS.registerClub}
        eyebrow="Club & Academy Onboarding"
        title={<>Manage every team, fixture and <span className="text-cyan-400">payment</span> in one place.</>}
        description="Public registration links, offline payment tracking, sponsor management and PDF receipts — built for clubs, academies and panchayats."
        stats={[
          { value: '13', label: 'Kerala Districts' },
          { value: 'Live', label: 'Cricket Scoring' },
          { value: '24/7', label: 'Live Dashboard' },
        ]}
        accent="cyan"
      />

    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.21, 1.02, 0.73, 1] }}
      className="min-h-[85vh] flex-1 max-w-2xl mx-auto px-4 py-12"
    >
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
          Create your free organization account to host cricket tournaments with live scoring —
          no card required, choose a paid plan only when you launch your first tournament.
        </p>
      </div>

      {/* Main Card */}
      <div className="p-6 sm:p-8 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl backdrop-blur-xl">
        {error && (
          <div className="mb-5 p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="relative w-16 h-16 shrink-0 rounded-2xl overflow-hidden bg-slate-950 border-2 border-cyan-500/40 flex items-center justify-center">
                {formData.logo ? (
                  <img src={formData.logo} alt="Club logo" className="w-full h-full object-cover" />
                ) : (
                  <Building2 className="w-7 h-7 text-slate-600" />
                )}
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => setShowLogoModal(true)}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 flex items-center gap-1.5"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>{formData.logo ? 'Change Club Logo' : 'Upload Club Logo'}</span>
                </button>
                <p className="text-[11px] text-slate-500 mt-1">Optional — you can add or change this anytime from settings.</p>
              </div>
            </div>

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
                <PhoneInput
                  value={formData.phone}
                  onChange={(phone) => handleChange('phone', phone)}
                  placeholder="98470 12345"
                  required
                  className="w-full px-4 py-2.5 rounded-xl glass-input text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  WhatsApp Number
                </label>
                <PhoneInput
                  value={formData.whatsapp}
                  onChange={(whatsapp) => handleChange('whatsapp', whatsapp)}
                  placeholder="98470 12345"
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
                  Country
                </label>
                <select
                  value={formData.country}
                  onChange={(e) => handleChange('country', e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl glass-input text-sm text-white focus:outline-none focus:border-cyan-500"
                >
                  {COUNTRIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  State / Province
                </label>
                <input
                  type="text"
                  value={formData.state}
                  onChange={(e) => handleChange('state', e.target.value)}
                  placeholder="e.g. Kerala"
                  className="w-full px-4 py-2.5 rounded-xl glass-input text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  District / Region
                </label>
                <input
                  type="text"
                  value={formData.district}
                  onChange={(e) => handleChange('district', e.target.value)}
                  placeholder="e.g. Malappuram"
                  className="w-full px-4 py-2.5 rounded-xl glass-input text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

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
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-4 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Create Free Account & Open Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

        <div className="mt-6 pt-5 border-t border-slate-800 text-center">
          <p className="text-xs text-slate-400">
            Already registered?{' '}
            <Link to="/login" className="text-cyan-400 hover:text-cyan-300 font-semibold underline underline-offset-2">
              Sign In to Your Dashboard
            </Link>
          </p>
        </div>
      </div>
    </motion.div>

    <ImageUploadModal
      isOpen={showLogoModal}
      onClose={() => setShowLogoModal(false)}
      onSuccess={(url) => handleChange('logo', url)}
      title="Upload Club Logo"
      subtitle="Choose a logo from your computer or select a preset"
      currentImage={formData.logo}
      folder="clubs"
      aspectRatio="square"
    />
    </div>
  );
};

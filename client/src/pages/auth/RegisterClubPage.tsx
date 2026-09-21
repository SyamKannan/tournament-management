import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { AuthShowcase } from '../../components/AuthShowcase';
import { ImageUploadModal } from '../../components/ImageUploadModal';
import { PhoneInput } from '../../components/PhoneInput';
import { COUNTRIES } from '../../lib/countries';
import { SPORTS_CAROUSELS } from '../../lib/sportsImagery';
import { AuthLayout, AuthHeader, AuthCard, AuthAlert, AuthField, AuthSubmit, AuthSection, AuthFooter } from '../../components/auth/AuthUI';
import { Building2, Camera, User, Mail, Lock, MapPin, Eye, EyeOff } from 'lucide-react';

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
  const [showPassword, setShowPassword] = useState(false);
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

  const text = (field: keyof typeof formData, props: React.InputHTMLAttributes<HTMLInputElement> & { icon?: boolean } = {}) => {
    const { icon = true, className = '', ...rest } = props;
    return (
      <input
        id={`club-${field}`}
        type="text"
        value={formData[field]}
        onChange={(e) => handleChange(field, e.target.value)}
        className={`auth-field ${icon ? '' : 'no-icon'} ${className}`}
        {...rest}
      />
    );
  };

  const passwordToggle = (
    <button
      type="button"
      onClick={() => setShowPassword(v => !v)}
      aria-label={showPassword ? 'Hide password' : 'Show password'}
      className="w-9 h-9 rounded-lg grid place-items-center text-slate-500 hover:text-slate-200 hover:bg-white/5"
    >
      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
    </button>
  );

  return (
    <AuthLayout
      accent="cyan"
      width="lg"
      showcase={
        <AuthShowcase
          images={SPORTS_CAROUSELS.registerClub}
          eyebrow="For clubs and organizers"
          title={<>Run your tournament from entries to the <span className="text-cyan-400">final.</span></>}
          description="Take team entries and ground fees online, make the fixtures, score every match live and show it on a TV at the ground."
          stats={['clubs', 'tournaments', 'teams', 'matches_played']}
          accent="cyan"
        />
      }
    >
      <AuthHeader
        accent="cyan"
        icon={Building2}
        eyebrow="Free to start"
        title="Register your club"
        subtitle="No card needed. Pick a paid plan only when you launch your first tournament."
      />

      <AuthCard>
        <AuthAlert message={error} />

        <form onSubmit={handleSubmit} className="space-y-6">
          <AuthSection step={1} title="Club details">
            <div className="flex items-center gap-4 mb-5">
              <button
                type="button"
                onClick={() => setShowLogoModal(true)}
                aria-label={formData.logo ? 'Change club logo' : 'Upload club logo'}
                className="group relative w-16 h-16 shrink-0 rounded-2xl overflow-hidden bg-slate-950 ring-1 ring-white/10 hover:ring-cyan-400/60 grid place-items-center transition"
              >
                {formData.logo ? (
                  <img src={formData.logo} alt="Club logo" className="w-full h-full object-cover" />
                ) : (
                  <Camera className="w-6 h-6 text-slate-500 group-hover:text-cyan-400 transition-colors" />
                )}
              </button>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">Club logo</p>
                <p className="text-xs text-slate-500 mt-0.5">Optional. You can add or change it later.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <AuthField label="Club or organization name *" htmlFor="club-organizationName" icon={Building2}>
                  {text('organizationName', { placeholder: 'e.g. Green Valley Sports Club', required: true, autoComplete: 'organization' })}
                </AuthField>
              </div>
              <AuthField label="Type" htmlFor="club-organizationType">
                <select
                  id="club-organizationType"
                  value={formData.organizationType}
                  onChange={(e) => handleChange('organizationType', e.target.value)}
                  className="auth-field no-icon"
                >
                  <option value="Sports Club">Sports Club</option>
                  <option value="Sports Academy">Sports Academy</option>
                  <option value="Village Panchayat">Village Panchayat</option>
                  <option value="School / College">School / College</option>
                  <option value="Private Organizer">Private Organizer</option>
                </select>
              </AuthField>
              <AuthField label="Contact person *" htmlFor="club-contactPerson" icon={User}>
                {text('contactPerson', { placeholder: 'e.g. Rahul K.', required: true, autoComplete: 'name' })}
              </AuthField>
            </div>
          </AuthSection>

          <AuthSection step={2} title="Login and contact">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <AuthField label="Admin email *" htmlFor="club-email" icon={Mail}>
                {text('email', { type: 'email', placeholder: 'admin@yourclub.com', required: true, autoComplete: 'email', inputMode: 'email' })}
              </AuthField>
              <AuthField label="Password *" htmlFor="club-password" icon={Lock} trailing={passwordToggle}>
                {text('password', { type: showPassword ? 'text' : 'password', placeholder: 'Create a password', required: true, autoComplete: 'new-password', className: 'pr-12' })}
              </AuthField>
              <AuthField label="Phone *" htmlFor="club-phone">
                <PhoneInput
                  id="club-phone"
                  autoComplete="tel-national"
                  value={formData.phone}
                  onChange={(phone) => handleChange('phone', phone)}
                  placeholder="98470 12345"
                  required
                  className="auth-field no-icon"
                />
              </AuthField>
              <AuthField label="WhatsApp" htmlFor="club-whatsapp">
                <PhoneInput
                  id="club-whatsapp"
                  value={formData.whatsapp}
                  onChange={(whatsapp) => handleChange('whatsapp', whatsapp)}
                  placeholder="98470 12345"
                  className="auth-field no-icon"
                />
              </AuthField>
            </div>
          </AuthSection>

          <AuthSection step={3} title="Location">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <AuthField label="Country" htmlFor="club-country">
                <select
                  id="club-country"
                  value={formData.country}
                  onChange={(e) => handleChange('country', e.target.value)}
                  className="auth-field no-icon"
                >
                  {COUNTRIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </AuthField>
              <AuthField label="State / province" htmlFor="club-state">
                {text('state', { placeholder: 'e.g. Kerala', icon: false })}
              </AuthField>
              <AuthField label="District / region" htmlFor="club-district">
                {text('district', { placeholder: 'e.g. Malappuram', icon: false })}
              </AuthField>
              <AuthField label="Village / city" htmlFor="club-village" icon={MapPin}>
                {text('village', { placeholder: 'e.g. Nilambur' })}
              </AuthField>
            </div>
          </AuthSection>

          <AuthSubmit accent="cyan" loading={isLoading} loadingLabel="Creating your account...">
            Create free account
          </AuthSubmit>
        </form>
      </AuthCard>

      <AuthFooter links={[{ prompt: 'Already registered?', to: '/login', label: 'Sign in' }]} />

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
    </AuthLayout>
  );
};

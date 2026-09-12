import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  User, Mail, Lock, Phone, MapPin,
  Sparkles, CheckCircle2, ArrowRight, Hash, Calendar, Camera
} from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { ImageUploadModal } from '../../components/ImageUploadModal';
import { AuthShowcase } from '../../components/AuthShowcase';
import { SPORTS_CAROUSELS } from '../../lib/sportsImagery';
import { usePlatformConfig } from '../../context/PlatformConfigContext';

const DISTRICTS_KERALA = [
  'Malappuram', 'Kozhikode', 'Ernakulam', 'Thrissur', 'Kannur', 
  'Thiruvananthapuram', 'Palakkad', 'Kollam', 'Alappuzha', 
  'Kottayam', 'Kasaragod', 'Wayanad', 'Idukki', 'Pathanamthitta'
];

const CRICKET_ROLES = [
  'All-Rounder', 'Top-Order Batsman', 'Middle-Order Batsman', 
  'Fast Bowler', 'Spin Bowler', 'Wicket Keeper'
];

const FOOTBALL_POSITIONS = [
  'Striker (CF)', 'Winger (LW/RW)', 'Attacking Midfielder (CAM)', 
  'Central Midfielder (CM)', 'Defensive Midfielder (CDM)', 
  'Fullback (LB/RB)', 'Center Back (CB)', 'Goalkeeper (GK)'
];

const AVATAR_PRESETS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
];

export const RegisterPlayerPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const toast = useToast();
  const { enabledSports } = usePlatformConfig();

  const [sport, setSport] = useState<'cricket' | 'football'>('cricket');

  // Keep the picker on an enabled sport — an admin can disable the
  // currently-selected sport at any time.
  useEffect(() => {
    if (enabledSports.length > 0 && !enabledSports.some(s => s.code === sport)) {
      setSport(enabledSports[0].code as 'cricket' | 'football');
    }
  }, [enabledSports]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [district, setDistrict] = useState('Malappuram');
  const [state, _setState] = useState('Kerala');
  const [age, setAge] = useState('22');
  const [dob, setDob] = useState('2002-05-15');
  const [jerseyNumber, setJerseyNumber] = useState('10');
  const [avatar, setAvatar] = useState(AVATAR_PRESETS[0]);
  const [customAvatar, setCustomAvatar] = useState('');
  const [showPhotoModal, setShowPhotoModal] = useState(false);

  // Sport Specifics
  const [cricketRole, setCricketRole] = useState('All-Rounder');
  const [battingStyle, setBattingStyle] = useState('Right Handed');
  const [bowlingStyle, setBowlingStyle] = useState('Right Arm Fast Medium');
  const [footballPosition, setFootballPosition] = useState('Striker (CF)');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name || !email || !password || !phone) {
      setError('Please fill in all required fields (Name, Email, Password, Phone).');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    try {
      setLoading(true);
      const payload = {
        name,
        email,
        password,
        phone,
        sport,
        role_or_position: sport === 'cricket' ? cricketRole : footballPosition,
        batting_style: sport === 'cricket' ? battingStyle : null,
        bowling_style: sport === 'cricket' ? bowlingStyle : null,
        district,
        state,
        age: parseInt(age, 10) || 22,
        dob,
        jersey_number: parseInt(jerseyNumber, 10) || 10,
        avatar: customAvatar || avatar,
      };

      const res = await api.post('/auth/register-player', payload);

      if (res.token) {
        localStorage.setItem('sports_saas_token', res.token);
        // Login session
        await login(email, password);
        toast.success(`Welcome ${name}! Your Athlete Profile is ready.`);
        navigate('/player/dashboard');
      }
    } catch (err: any) {
      setError(err?.message || 'Registration failed. Please check your information and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lg:flex">
      <AuthShowcase
        images={SPORTS_CAROUSELS.registerPlayer}
        eyebrow="Athlete Career Hub"
        title={<>Get scouted. Get <span className="text-amber-400">stats.</span> Get seen.</>}
        description="Build a public player profile, join local cricket tournaments, and track your career stats match after match."
        stats={[
          { value: 'Live', label: 'Career Stats' },
          { value: 'Public', label: 'Player Profile' },
          { value: 'Free', label: 'To Join' },
        ]}
        accent="amber"
      />

    <div className="min-h-[calc(100vh-4rem)] flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-10 relative">
      {/* Background glow flares */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-[140px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-[140px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.21, 1.02, 0.73, 1] }}
        className="relative z-10 w-full max-w-3xl"
      >
        {/* Header Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-bold uppercase tracking-wider mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            Athlete Career Hub
          </div>
          <h1 className="text-3xl sm:text-4xl font-black font-heading text-white tracking-tight">
            Create Your <span className="text-gradient-emerald">Player Profile</span>
          </h1>
          <p className="text-sm text-slate-400 max-w-md mx-auto mt-2">
            Join local leagues, track lifetime match stats, and get scouted by club managers.
          </p>
        </div>

        {/* Main Card */}
        <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-b from-slate-900/90 to-slate-950/95 border border-slate-800 shadow-2xl backdrop-blur-2xl">
          {error && (
            <div className="mb-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Step 1: Sport Selection */}
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5">
                1. Select Your Primary Sport
              </label>
              <div className={`grid gap-3 ${enabledSports.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {enabledSports.some(s => s.code === 'cricket') && (
                <button
                  type="button"
                  onClick={() => setSport('cricket')}
                  className={`p-4 rounded-2xl border text-left transition-all flex items-center justify-between group ${
                    sport === 'cricket'
                      ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/10 border-emerald-500 text-white shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-500/50'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${sport === 'cricket' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-900 text-slate-400'}`}>
                      🏏
                    </div>
                    <div>
                      <div className="text-sm font-black font-heading text-white">Cricket</div>
                      <div className="text-[11px] text-slate-400">Leather / Tape Ball / Box</div>
                    </div>
                  </div>
                  {sport === 'cricket' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
                </button>
                )}

                {enabledSports.some(s => s.code === 'football') && (
                  <button
                    type="button"
                    onClick={() => setSport('football')}
                    className={`p-4 rounded-2xl border text-left transition-all flex items-center justify-between group ${
                      sport === 'football'
                        ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/10 border-cyan-500 text-white shadow-lg shadow-cyan-500/10 ring-1 ring-cyan-500/50'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${sport === 'football' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-900 text-slate-400'}`}>
                        ⚽
                      </div>
                      <div>
                        <div className="text-sm font-black font-heading text-white">Football</div>
                        <div className="text-[11px] text-slate-400">11s / 7s / 5s Sevens</div>
                      </div>
                    </div>
                    {sport === 'football' && <CheckCircle2 className="w-5 h-5 text-cyan-400 shrink-0" />}
                  </button>
                )}
              </div>
            </div>

            {/* Step 2: Account & Contact Info */}
            <div className="pt-2 border-t border-slate-800/80">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">
                2. Account & Contact Details
              </label>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Full Name *</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. Shameer Ahmed"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-950/90 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Email Address (Login Username) *</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="email"
                      required
                      placeholder="e.g. shameer@gmail.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-950/90 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Password *</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="password"
                      required
                      placeholder="Minimum 6 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-950/90 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Phone / WhatsApp *</label>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="tel"
                      required
                      placeholder="e.g. +91 98460 12345"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-950/90 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Step 3: Sporting Specs & Position */}
            <div className="pt-2 border-t border-slate-800/80">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">
                3. Sporting Specialty & Stats
              </label>

              {sport === 'cricket' ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Playing Role</label>
                    <select
                      value={cricketRole}
                      onChange={(e) => setCricketRole(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/90 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                    >
                      {CRICKET_ROLES.map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Batting Style</label>
                    <select
                      value={battingStyle}
                      onChange={(e) => setBattingStyle(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/90 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="Right Handed">Right Handed</option>
                      <option value="Left Handed">Left Handed</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Bowling Style</label>
                    <select
                      value={bowlingStyle}
                      onChange={(e) => setBowlingStyle(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/90 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="Right Arm Fast">Right Arm Fast</option>
                      <option value="Right Arm Fast Medium">Right Arm Fast Medium</option>
                      <option value="Right Arm Off Spin">Right Arm Off Spin</option>
                      <option value="Right Arm Leg Spin">Right Arm Leg Spin</option>
                      <option value="Left Arm Fast">Left Arm Fast</option>
                      <option value="Left Arm Orthodox Spin">Left Arm Orthodox Spin</option>
                      <option value="None">Does not bowl</option>
                    </select>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Football Position</label>
                    <select
                      value={footballPosition}
                      onChange={(e) => setFootballPosition(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/90 border border-slate-800 text-xs text-white focus:outline-none focus:border-cyan-500"
                    >
                      {FOOTBALL_POSITIONS.map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Preferred Foot</label>
                    <select
                      value={battingStyle}
                      onChange={(e) => setBattingStyle(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/90 border border-slate-800 text-xs text-white focus:outline-none focus:border-cyan-500"
                    >
                      <option value="Right Footed">Right Footed</option>
                      <option value="Left Footed">Left Footed</option>
                      <option value="Both (Ambidextrous)">Both (Ambidextrous)</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Age, DOB, Jersey & District */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5 mt-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Age</label>
                  <input
                    type="number"
                    min="8"
                    max="80"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-950/90 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Date of Birth</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                    <input
                      type="date"
                      value={dob}
                      onChange={(e) => setDob(e.target.value)}
                      className="w-full pl-9 pr-2.5 py-2.5 rounded-xl bg-slate-950/90 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Jersey #</label>
                  <div className="relative">
                    <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                    <input
                      type="number"
                      min="0"
                      max="99"
                      value={jerseyNumber}
                      onChange={(e) => setJerseyNumber(e.target.value)}
                      className="w-full pl-8 pr-2.5 py-2.5 rounded-xl bg-slate-950/90 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono font-bold text-emerald-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">District</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                    <select
                      value={district}
                      onChange={(e) => setDistrict(e.target.value)}
                      className="w-full pl-8 pr-2.5 py-2.5 rounded-xl bg-slate-950/90 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                    >
                      {DISTRICTS_KERALA.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 4: Avatar Selection */}
            <div className="pt-2 border-t border-slate-800/80">
              <div className="flex items-center justify-between mb-2.5">
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                  4. Profile Photo / Avatar
                </label>
                <button
                  type="button"
                  onClick={() => setShowPhotoModal(true)}
                  className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Upload My Photo</span>
                </button>
              </div>

              <div className="flex items-center gap-3 overflow-x-auto pb-2">
                {customAvatar && (
                  <div className="relative w-12 h-12 rounded-2xl overflow-hidden border-2 border-emerald-400 ring-2 ring-emerald-500/50 scale-105 shrink-0">
                    <img src={customAvatar} alt="Custom upload" className="w-full h-full object-cover" />
                  </div>
                )}
                {AVATAR_PRESETS.map((pUrl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => { setAvatar(pUrl); setCustomAvatar(''); }}
                    className={`relative w-12 h-12 rounded-2xl overflow-hidden border-2 transition-transform hover:scale-105 shrink-0 ${
                      avatar === pUrl && !customAvatar ? 'border-emerald-400 ring-2 ring-emerald-500/50 scale-105' : 'border-slate-800 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={pUrl} alt={`Avatar ${idx}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-4">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-black text-sm shadow-xl shadow-emerald-500/25 flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer font-heading tracking-wide uppercase"
              >
                {loading ? (
                  <span>Creating Athlete Profile...</span>
                ) : (
                  <>
                    <span>Complete Player Registration</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Footer links */}
          <div className="mt-8 pt-6 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
            <div>
              Already registered?{' '}
              <Link to="/login" className="font-bold text-emerald-400 hover:underline">
                Sign In to Player Dashboard →
              </Link>
            </div>
            <div>
              Organizing a club or league?{' '}
              <Link to="/register-club" className="font-bold text-cyan-400 hover:underline">
                Register Club →
              </Link>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Photo Upload Modal */}
      <ImageUploadModal
        isOpen={showPhotoModal}
        onClose={() => setShowPhotoModal(false)}
        title="Upload Player Photo"
        subtitle="Choose a photo from your computer or camera"
        folder="players"
        onSuccess={(url) => {
          setCustomAvatar(url);
          setAvatar(url);
          toast.success('Photo selected!');
        }}
      />
    </div>
    </div>
  );
};

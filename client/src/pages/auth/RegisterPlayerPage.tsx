import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Mail, Lock, MapPin, CheckCircle2, Hash, Camera, Eye, EyeOff } from 'lucide-react';
import { AuthLayout, AuthHeader, AuthCard, AuthAlert, AuthField, AuthSubmit, AuthSection, AuthFooter } from '../../components/auth/AuthUI';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { ImageUploadModal } from '../../components/ImageUploadModal';
import { PhoneInput } from '../../components/PhoneInput';
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
  const [showPassword, setShowPassword] = useState(false);

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

  const sportOptions = [
    { code: 'cricket' as const, emoji: '🏏', name: 'Cricket', detail: 'Leather, tape ball or box' },
    { code: 'football' as const, emoji: '⚽', name: 'Football', detail: '11s, 7s or 5s' },
  ].filter(o => enabledSports.some(s => s.code === o.code));

  return (
    <AuthLayout
      accent="amber"
      width="lg"
      showcase={
        <AuthShowcase
          images={SPORTS_CAROUSELS.registerPlayer}
          eyebrow="For players"
          title={<>Every match you play, in one <span className="text-amber-400">profile.</span></>}
          description="Join free to get your Player Code and see your runs, wickets and goals from every tournament you play."
          stats={['players', 'tournaments', 'matches_played', 'teams']}
          accent="amber"
        />
      }
    >
      <AuthHeader
        accent="amber"
        icon={User}
        eyebrow="Free player profile"
        title="Create your player profile"
        subtitle="Join local leagues, keep your career stats in one place and get picked by team managers."
      />

      <AuthCard>
        <AuthAlert message={error} />

        <form onSubmit={handleSubmit} className="space-y-6">
          <AuthSection step={1} title="Your sport">
            <div className={`grid gap-3 ${sportOptions.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {sportOptions.map(o => {
                const active = sport === o.code;
                return (
                  <button
                    key={o.code}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSport(o.code)}
                    className={`relative p-3 sm:p-4 rounded-2xl text-left flex items-center gap-3 transition-all ring-1 ${
                      active
                        ? 'bg-amber-500/10 ring-amber-400/70 shadow-lg shadow-amber-500/10'
                        : 'bg-slate-950/50 ring-white/10 hover:ring-white/20'
                    }`}
                  >
                    <span className={`w-10 h-10 shrink-0 rounded-xl grid place-items-center text-lg ${active ? 'bg-amber-500/20' : 'bg-white/5'}`}>
                      {o.emoji}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-white">{o.name}</span>
                      <span className="block text-xs text-slate-400 truncate">{o.detail}</span>
                    </span>
                    {active && <CheckCircle2 className="absolute top-2 right-2 w-4 h-4 text-amber-400" />}
                  </button>
                );
              })}
            </div>
          </AuthSection>

          <AuthSection step={2} title="Account and contact">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <AuthField label="Full name *" htmlFor="player-name" icon={User}>
                <input
                  id="player-name"
                  type="text"
                  required
                  autoComplete="name"
                  placeholder="e.g. Shameer Ahmed"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="auth-field"
                />
              </AuthField>
              <AuthField label="Email (your login) *" htmlFor="player-email" icon={Mail}>
                <input
                  id="player-email"
                  type="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="auth-field"
                />
              </AuthField>
              <AuthField
                label="Password *"
                htmlFor="player-password"
                icon={Lock}
                hint="At least 6 characters."
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="w-9 h-9 rounded-lg grid place-items-center text-slate-500 hover:text-slate-200 hover:bg-white/5"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
              >
                <input
                  id="player-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  placeholder="Create a password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="auth-field pr-12"
                />
              </AuthField>
              <AuthField label="Phone / WhatsApp *" htmlFor="player-phone">
                <PhoneInput
                  id="player-phone"
                  autoComplete="tel-national"
                  required
                  placeholder="98460 12345"
                  value={phone}
                  onChange={setPhone}
                  className="auth-field no-icon"
                />
              </AuthField>
            </div>
          </AuthSection>

          <AuthSection step={3} title="How you play">
            {sport === 'cricket' ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <AuthField label="Playing role" htmlFor="player-role">
                  <select id="player-role" value={cricketRole} onChange={(e) => setCricketRole(e.target.value)} className="auth-field no-icon">
                    {CRICKET_ROLES.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </AuthField>
                <AuthField label="Batting" htmlFor="player-batting">
                  <select id="player-batting" value={battingStyle} onChange={(e) => setBattingStyle(e.target.value)} className="auth-field no-icon">
                    <option value="Right Handed">Right Handed</option>
                    <option value="Left Handed">Left Handed</option>
                  </select>
                </AuthField>
                <AuthField label="Bowling" htmlFor="player-bowling">
                  <select id="player-bowling" value={bowlingStyle} onChange={(e) => setBowlingStyle(e.target.value)} className="auth-field no-icon">
                    <option value="Right Arm Fast">Right Arm Fast</option>
                    <option value="Right Arm Fast Medium">Right Arm Fast Medium</option>
                    <option value="Right Arm Off Spin">Right Arm Off Spin</option>
                    <option value="Right Arm Leg Spin">Right Arm Leg Spin</option>
                    <option value="Left Arm Fast">Left Arm Fast</option>
                    <option value="Left Arm Orthodox Spin">Left Arm Orthodox Spin</option>
                    <option value="None">Does not bowl</option>
                  </select>
                </AuthField>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <AuthField label="Position" htmlFor="player-position">
                  <select id="player-position" value={footballPosition} onChange={(e) => setFootballPosition(e.target.value)} className="auth-field no-icon">
                    {FOOTBALL_POSITIONS.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </AuthField>
                <AuthField label="Preferred foot" htmlFor="player-foot">
                  <select id="player-foot" value={battingStyle} onChange={(e) => setBattingStyle(e.target.value)} className="auth-field no-icon">
                    <option value="Right Footed">Right Footed</option>
                    <option value="Left Footed">Left Footed</option>
                    <option value="Both (Ambidextrous)">Both (Ambidextrous)</option>
                  </select>
                </AuthField>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
              <AuthField label="Age" htmlFor="player-age">
                <input
                  id="player-age"
                  type="number"
                  inputMode="numeric"
                  min="8"
                  max="80"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  className="auth-field no-icon"
                />
              </AuthField>
              <AuthField label="Jersey no." htmlFor="player-jersey" icon={Hash}>
                <input
                  id="player-jersey"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="99"
                  value={jerseyNumber}
                  onChange={(e) => setJerseyNumber(e.target.value)}
                  className="auth-field font-mono font-bold"
                />
              </AuthField>
              <AuthField label="Date of birth" htmlFor="player-dob">
                <input
                  id="player-dob"
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  className="auth-field no-icon"
                />
              </AuthField>
              <AuthField label="District" htmlFor="player-district" icon={MapPin}>
                <select id="player-district" value={district} onChange={(e) => setDistrict(e.target.value)} className="auth-field">
                  {DISTRICTS_KERALA.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </AuthField>
            </div>
          </AuthSection>

          <AuthSection
            step={4}
            title="Profile photo"
            action={
              <button
                type="button"
                onClick={() => setShowPhotoModal(true)}
                className="px-3 h-9 rounded-xl bg-white/5 hover:bg-white/10 ring-1 ring-white/10 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Upload photo</span>
              </button>
            }
          >
            <div className="flex items-center gap-3 overflow-x-auto no-scrollbar p-1 -m-1">
              {customAvatar && (
                <div className="w-14 h-14 rounded-2xl overflow-hidden ring-2 ring-amber-400 shrink-0">
                  <img src={customAvatar} alt="Your uploaded photo" className="w-full h-full object-cover" />
                </div>
              )}
              {AVATAR_PRESETS.map((pUrl, idx) => {
                const active = avatar === pUrl && !customAvatar;
                return (
                  <button
                    key={pUrl}
                    type="button"
                    aria-pressed={active}
                    aria-label={`Use avatar ${idx + 1}`}
                    onClick={() => { setAvatar(pUrl); setCustomAvatar(''); }}
                    className={`w-14 h-14 rounded-2xl overflow-hidden shrink-0 transition ${
                      active ? 'ring-2 ring-amber-400' : 'ring-1 ring-white/10 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={pUrl} alt="" className="w-full h-full object-cover" />
                  </button>
                );
              })}
            </div>
          </AuthSection>

          <AuthSubmit accent="amber" loading={loading} loadingLabel="Creating your profile...">
            Create player profile
          </AuthSubmit>
        </form>
      </AuthCard>

      <AuthFooter
        links={[
          { prompt: 'Already registered?', to: '/login?role=PLAYER', label: 'Sign in' },
          { prompt: 'Organizing a league?', to: '/register-club', label: 'Register your club' },
        ]}
      />

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
    </AuthLayout>
  );
};

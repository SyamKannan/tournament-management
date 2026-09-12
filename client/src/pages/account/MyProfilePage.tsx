import React, { useEffect, useState } from 'react';
import { api, ApiError } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { ImageUploadModal } from '../../components/ImageUploadModal';
import { PhoneInput } from '../../components/PhoneInput';
import type { Organization, OrganizationType, Player } from '../../types';
import { Camera, Save, KeyRound, Building2, UserCircle2, ShieldCheck } from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Platform Super Admin',
  ORG_ADMIN: 'Organization Admin',
  SCORER: 'Scorer',
  TEAM_MANAGER: 'Team Manager',
  PLAYER: 'Player',
};

const ORGANIZATION_TYPES: OrganizationType[] = [
  'Sports Club', 'Village Association', 'Panchayat', 'School', 'College',
  'Cricket Club', 'Football Club', 'Sports Academy', 'Ground', 'Private Organizer',
  'Community Organization', 'Other',
];

export const MyProfilePage: React.FC = () => {
  const toast = useToast();
  const { user, organization, role, refreshProfile } = useAuth();

  const [showPhotoModal, setShowPhotoModal] = useState(false);

  const [account, setAccount] = useState({ name: '', email: '', phone: '', avatar: '' });
  const [savingAccount, setSavingAccount] = useState(false);

  const [passwords, setPasswords] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [savingPassword, setSavingPassword] = useState(false);

  const [org, setOrg] = useState<Organization | null>(null);
  const [savingOrg, setSavingOrg] = useState(false);

  const [player, setPlayer] = useState<Player | null>(null);
  const [savingPlayer, setSavingPlayer] = useState(false);

  useEffect(() => {
    if (user) {
      setAccount({ name: user.name || '', email: user.email || '', phone: user.phone || '', avatar: user.avatar || '' });
    }
  }, [user]);

  useEffect(() => {
    if (role === 'ORG_ADMIN' && organization) {
      setOrg(organization);
    }
  }, [role, organization]);

  useEffect(() => {
    if (role !== 'PLAYER') return;
    api.get('/players/me/dashboard')
      .then(res => setPlayer(res.player))
      .catch(err => console.error('Failed to load player profile', err));
  }, [role]);

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAccount(true);
    try {
      await api.put('/auth/me', account);
      await refreshProfile();
      toast.success('Account details updated');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update account details');
    } finally {
      setSavingAccount(false);
    }
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwords.current_password || !passwords.new_password) {
      toast.error('Enter your current password and a new password');
      return;
    }
    if (passwords.new_password !== passwords.confirm_password) {
      toast.error('New password and confirmation do not match');
      return;
    }
    setSavingPassword(true);
    try {
      await api.put('/auth/me', {
        current_password: passwords.current_password,
        new_password: passwords.new_password,
      });
      setPasswords({ current_password: '', new_password: '', confirm_password: '' });
      toast.success('Password changed successfully');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to change password');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSaveOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org) return;
    setSavingOrg(true);
    try {
      const updated = await api.put(`/organizations/${org.id}`, {
        name: org.name,
        type: org.type,
        contact_person: org.contact_person,
        phone: org.phone,
        whatsapp: org.whatsapp,
        email: org.email,
        address: org.address,
        village: org.village,
        panchayat: org.panchayat,
        district: org.district,
        state: org.state,
        country: org.country,
        website: org.website,
      });
      setOrg(updated);
      await refreshProfile();
      toast.success('Organization profile updated');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update organization profile');
    } finally {
      setSavingOrg(false);
    }
  };

  const handleSavePlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!player) return;
    setSavingPlayer(true);
    try {
      await api.post('/players/me/profile', {
        age: player.age,
        jersey_number: player.jersey_number,
        dob: player.dob,
        football_position: player.football_position,
        cricket_role: player.cricket_role,
        cricket_batting_style: player.cricket_batting_style,
        cricket_bowling_style: player.cricket_bowling_style,
      });
      toast.success('Player profile updated');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update player profile');
    } finally {
      setSavingPlayer(false);
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-black font-heading text-white">My Profile</h1>
        <p className="text-xs text-slate-400 mt-1">Manage your account details, security, and profile information</p>
      </div>

      {/* Identity header */}
      <div className="p-6 rounded-3xl glass-card border border-slate-800 flex flex-col sm:flex-row items-center sm:items-start gap-5">
        <div className="relative group shrink-0">
          <img
            src={account.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'}
            alt=""
            className="w-20 h-20 rounded-2xl object-cover border-2 border-emerald-500/40 bg-slate-950"
          />
          <button
            type="button"
            onClick={() => setShowPhotoModal(true)}
            title="Change profile photo"
            className="absolute inset-0 bg-black/60 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[10px] font-bold gap-1 cursor-pointer"
          >
            <Camera className="w-4 h-4 text-emerald-400" />
            <span>Change</span>
          </button>
        </div>
        <div className="text-center sm:text-left">
          <h2 className="text-lg font-bold text-white">{user.name}</h2>
          <p className="text-xs text-slate-400">{user.email}</p>
          <span className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-black uppercase tracking-wider">
            <ShieldCheck className="w-3 h-3" />
            {ROLE_LABELS[role] || role}
          </span>
        </div>
      </div>

      {/* Account details */}
      <form onSubmit={handleSaveAccount} className="p-6 rounded-3xl glass-card border border-slate-800 space-y-4">
        <h3 className="text-sm font-bold text-white font-heading flex items-center gap-2">
          <UserCircle2 className="w-4 h-4 text-emerald-400" />
          Account Details
        </h3>
        <div className="grid sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Full Name</label>
            <input
              type="text"
              value={account.name}
              onChange={(e) => setAccount({ ...account, name: e.target.value })}
              className="w-full px-3.5 py-2 rounded-xl glass-input"
              required
            />
          </div>
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Email</label>
            <input
              type="email"
              value={account.email}
              onChange={(e) => setAccount({ ...account, email: e.target.value })}
              className="w-full px-3.5 py-2 rounded-xl glass-input"
              required
            />
          </div>
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Phone</label>
            <PhoneInput
              value={account.phone}
              onChange={(phone) => setAccount({ ...account, phone })}
              className="w-full px-3.5 py-2 rounded-xl glass-input"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={savingAccount}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/25 flex items-center gap-1.5 disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            <span>{savingAccount ? 'Saving...' : 'Save Account Details'}</span>
          </button>
        </div>
      </form>

      {/* Change password */}
      <form onSubmit={handleSavePassword} className="p-6 rounded-3xl glass-card border border-slate-800 space-y-4">
        <h3 className="text-sm font-bold text-white font-heading flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-cyan-400" />
          Change Password
        </h3>
        <div className="grid sm:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Current Password</label>
            <input
              type="password"
              value={passwords.current_password}
              onChange={(e) => setPasswords({ ...passwords, current_password: e.target.value })}
              className="w-full px-3.5 py-2 rounded-xl glass-input"
              autoComplete="current-password"
            />
          </div>
          <div>
            <label className="block text-slate-300 font-semibold mb-1">New Password</label>
            <input
              type="password"
              value={passwords.new_password}
              onChange={(e) => setPasswords({ ...passwords, new_password: e.target.value })}
              className="w-full px-3.5 py-2 rounded-xl glass-input"
              autoComplete="new-password"
              minLength={6}
            />
          </div>
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Confirm New Password</label>
            <input
              type="password"
              value={passwords.confirm_password}
              onChange={(e) => setPasswords({ ...passwords, confirm_password: e.target.value })}
              className="w-full px-3.5 py-2 rounded-xl glass-input"
              autoComplete="new-password"
              minLength={6}
            />
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={savingPassword}
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold text-xs flex items-center gap-1.5 disabled:opacity-60"
          >
            <KeyRound className="w-4 h-4 text-cyan-400" />
            <span>{savingPassword ? 'Updating...' : 'Change Password'}</span>
          </button>
        </div>
      </form>

      {/* Organization profile (ORG_ADMIN only) */}
      {role === 'ORG_ADMIN' && org && (
        <form onSubmit={handleSaveOrg} className="p-6 rounded-3xl glass-card border border-slate-800 space-y-4">
          <h3 className="text-sm font-bold text-white font-heading flex items-center gap-2">
            <Building2 className="w-4 h-4 text-amber-400" />
            Organization Profile
          </h3>
          <div className="grid sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Organization Name</label>
              <input
                type="text"
                value={org.name}
                onChange={(e) => setOrg({ ...org, name: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl glass-input"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Type</label>
              <select
                value={org.type}
                onChange={(e) => setOrg({ ...org, type: e.target.value as OrganizationType })}
                className="w-full px-3.5 py-2 rounded-xl glass-input bg-slate-900"
              >
                {ORGANIZATION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Contact Person</label>
              <input
                type="text"
                value={org.contact_person}
                onChange={(e) => setOrg({ ...org, contact_person: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl glass-input"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Organization Email</label>
              <input
                type="email"
                value={org.email}
                onChange={(e) => setOrg({ ...org, email: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl glass-input"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Phone</label>
              <PhoneInput
                value={org.phone}
                onChange={(phone) => setOrg({ ...org, phone })}
                className="w-full px-3.5 py-2 rounded-xl glass-input"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">WhatsApp</label>
              <PhoneInput
                value={org.whatsapp}
                onChange={(whatsapp) => setOrg({ ...org, whatsapp })}
                className="w-full px-3.5 py-2 rounded-xl glass-input"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Website</label>
              <input
                type="text"
                value={org.website}
                onChange={(e) => setOrg({ ...org, website: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl glass-input"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Address</label>
              <input
                type="text"
                value={org.address}
                onChange={(e) => setOrg({ ...org, address: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl glass-input"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Village</label>
              <input
                type="text"
                value={org.village}
                onChange={(e) => setOrg({ ...org, village: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl glass-input"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Panchayat</label>
              <input
                type="text"
                value={org.panchayat}
                onChange={(e) => setOrg({ ...org, panchayat: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl glass-input"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">District</label>
              <input
                type="text"
                value={org.district}
                onChange={(e) => setOrg({ ...org, district: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl glass-input"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">State</label>
              <input
                type="text"
                value={org.state}
                onChange={(e) => setOrg({ ...org, state: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl glass-input"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Country</label>
              <input
                type="text"
                value={org.country}
                onChange={(e) => setOrg({ ...org, country: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl glass-input"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingOrg}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-xs shadow-lg shadow-amber-600/25 flex items-center gap-1.5 disabled:opacity-60"
            >
              <Save className="w-4 h-4" />
              <span>{savingOrg ? 'Saving...' : 'Save Organization Profile'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Player profile (PLAYER only) */}
      {role === 'PLAYER' && player && (
        <form onSubmit={handleSavePlayer} className="p-6 rounded-3xl glass-card border border-slate-800 space-y-4">
          <h3 className="text-sm font-bold text-white font-heading flex items-center gap-2">
            <UserCircle2 className="w-4 h-4 text-violet-400" />
            Player Profile
          </h3>
          <div className="grid sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Age</label>
              <input
                type="number"
                min={5}
                max={100}
                value={player.age ?? ''}
                onChange={(e) => setPlayer({ ...player, age: Number(e.target.value) })}
                className="w-full px-3.5 py-2 rounded-xl glass-input font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Jersey Number</label>
              <input
                type="number"
                min={0}
                max={99}
                value={player.jersey_number ?? ''}
                onChange={(e) => setPlayer({ ...player, jersey_number: Number(e.target.value) })}
                className="w-full px-3.5 py-2 rounded-xl glass-input font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Date of Birth</label>
              <input
                type="date"
                value={player.dob ? player.dob.slice(0, 10) : ''}
                onChange={(e) => setPlayer({ ...player, dob: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl glass-input"
              />
            </div>
            {player.football_position !== undefined && player.football_position !== null && (
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Football Position</label>
                <input
                  type="text"
                  value={player.football_position || ''}
                  onChange={(e) => setPlayer({ ...player, football_position: e.target.value as any })}
                  className="w-full px-3.5 py-2 rounded-xl glass-input"
                />
              </div>
            )}
            {player.cricket_role !== undefined && player.cricket_role !== null && (
              <>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Cricket Role</label>
                  <input
                    type="text"
                    value={player.cricket_role || ''}
                    onChange={(e) => setPlayer({ ...player, cricket_role: e.target.value as any })}
                    className="w-full px-3.5 py-2 rounded-xl glass-input"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Batting Style</label>
                  <input
                    type="text"
                    value={player.cricket_batting_style || ''}
                    onChange={(e) => setPlayer({ ...player, cricket_batting_style: e.target.value as any })}
                    className="w-full px-3.5 py-2 rounded-xl glass-input"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Bowling Style</label>
                  <input
                    type="text"
                    value={player.cricket_bowling_style || ''}
                    onChange={(e) => setPlayer({ ...player, cricket_bowling_style: e.target.value as any })}
                    className="w-full px-3.5 py-2 rounded-xl glass-input"
                  />
                </div>
              </>
            )}
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingPlayer}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-bold text-xs shadow-lg shadow-violet-600/25 flex items-center gap-1.5 disabled:opacity-60"
            >
              <Save className="w-4 h-4" />
              <span>{savingPlayer ? 'Saving...' : 'Save Player Profile'}</span>
            </button>
          </div>
        </form>
      )}

      <ImageUploadModal
        isOpen={showPhotoModal}
        onClose={() => setShowPhotoModal(false)}
        title="Update Profile Photo"
        subtitle="Choose a photo or select an avatar"
        currentImage={account.avatar}
        folder={role === 'ORG_ADMIN' ? 'clubs' : 'profiles'}
        onSuccess={async (newUrl) => {
          setAccount(prev => ({ ...prev, avatar: newUrl }));
          try {
            await api.put('/auth/me', { avatar: newUrl });
            await refreshProfile();
            toast.success('Profile photo updated');
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : 'Failed to update profile photo');
          }
        }}
      />
    </div>
  );
};

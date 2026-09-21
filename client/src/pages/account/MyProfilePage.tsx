import React, { useEffect, useState } from 'react';
import { api, ApiError } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { ImageUploadModal } from '../../components/ImageUploadModal';
import { PhoneInput } from '../../components/PhoneInput';
import type { Organization, OrganizationType, Player } from '../../types';
import { Camera, Save, KeyRound, Building2, UserCircle2, ShieldCheck, LogOut } from 'lucide-react';
import { label } from '../../lib/labels';

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
  const { user, organization, role, refreshProfile, adoptToken, logoutEverywhere } = useAuth();

  const [showPhotoModal, setShowPhotoModal] = useState(false);

  const [account, setAccount] = useState({ name: '', email: '', phone: '', avatar: '' });
  const [savingAccount, setSavingAccount] = useState(false);

  const [passwords, setPasswords] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [savingPassword, setSavingPassword] = useState(false);
  const [signingOutEverywhere, setSigningOutEverywhere] = useState(false);

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
      const res = await api.put('/auth/me', {
        current_password: passwords.current_password,
        new_password: passwords.new_password,
      });

      // The change signed every other device out, this one included, so the
      // server sends a replacement token to carry on with.
      if (res?.token) {
        adoptToken(res.token);
      }

      setPasswords({ current_password: '', new_password: '', confirm_password: '' });
      toast.success('Password changed. You have been signed out on your other devices.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to change password');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSignOutEverywhere = async () => {
    setSigningOutEverywhere(true);
    try {
      // Ends this session too, so the app drops back to the sign-in screen.
      await logoutEverywhere();
      toast.success('Signed out on every device. Sign in again to carry on.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to sign out on all devices');
    } finally {
      setSigningOutEverywhere(false);
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
      toast.success('Club details updated');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update club details');
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

  // A club (ORG_ADMIN) account is the club itself, not a person: the page leads with the
  // club's logo, name and details, and the login account is just how it signs in.
  const isClub = role === 'ORG_ADMIN' && !!org;
  const headerImage = isClub ? org.logo : account.avatar;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-black font-heading text-white">{isClub ? 'Club Profile' : 'My Profile'}</h1>
        <p className="text-xs text-slate-400 mt-1">
          {isClub
            ? "Your club's public details, sign-in email and password"
            : 'Manage your account details, security, and profile information'}
        </p>
      </div>

      {/* Identity header */}
      <div className="p-6 rounded-3xl glass-card border border-slate-800 flex flex-col sm:flex-row items-center sm:items-start gap-5">
        <div className="relative group shrink-0">
          {headerImage ? (
            <img
              src={headerImage}
              alt=""
              className="w-20 h-20 rounded-2xl object-cover border-2 border-emerald-500/40 bg-slate-950"
            />
          ) : (
            <div className="w-20 h-20 rounded-2xl border-2 border-emerald-500/40 bg-slate-950 flex items-center justify-center text-emerald-400">
              {isClub ? <Building2 className="w-8 h-8" /> : <UserCircle2 className="w-8 h-8" />}
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowPhotoModal(true)}
            title={isClub ? 'Change club logo' : 'Change profile photo'}
            className="absolute inset-0 bg-black/60 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-xs font-bold gap-1 cursor-pointer"
          >
            <Camera className="w-4 h-4 text-emerald-400" />
            <span>Change</span>
          </button>
        </div>
        <div className="text-center sm:text-left">
          <h2 className="text-lg font-bold text-white">{isClub ? org.name : user.name}</h2>
          <p className="text-xs text-slate-400">{isClub ? (org.email || user.email) : user.email}</p>
          <span className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-black uppercase tracking-wider">
            {isClub ? <Building2 className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
            {isClub ? (org.type || 'Club') : (ROLE_LABELS[role] || label(role))}
          </span>
        </div>
      </div>

      {/* Organization profile (ORG_ADMIN only) */}
      {role === 'ORG_ADMIN' && org && (
        <form onSubmit={handleSaveOrg} className="p-6 rounded-3xl glass-card border border-slate-800 space-y-4">
          <h3 className="text-sm font-bold text-white font-heading flex items-center gap-2">
            <Building2 className="w-4 h-4 text-amber-400" />
            Club Details
          </h3>
          <div className="grid sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label htmlFor="myprofile-club-organization-name" className="block text-slate-300 font-semibold mb-1">Club / Organization Name</label>
              <input id="myprofile-club-organization-name"
                type="text"
                value={org.name}
                onChange={(e) => setOrg({ ...org, name: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl glass-input"
              />
            </div>
            <div>
              <label htmlFor="myprofile-type" className="block text-slate-300 font-semibold mb-1">Type</label>
              <select id="myprofile-type"
                value={org.type}
                onChange={(e) => setOrg({ ...org, type: e.target.value as OrganizationType })}
                className="w-full px-3.5 py-2 rounded-xl glass-input bg-slate-900"
              >
                {ORGANIZATION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="myprofile-contact-person" className="block text-slate-300 font-semibold mb-1">Contact Person</label>
              <input id="myprofile-contact-person"
                type="text"
                value={org.contact_person}
                onChange={(e) => setOrg({ ...org, contact_person: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl glass-input"
              />
            </div>
            <div>
              <label htmlFor="myprofile-public-contact-email" className="block text-slate-300 font-semibold mb-1">Public Contact Email</label>
              <input id="myprofile-public-contact-email"
                type="email"
                value={org.email}
                onChange={(e) => setOrg({ ...org, email: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl glass-input"
              />
            </div>
            <div>
              <label htmlFor="myprofile-phone" className="block text-slate-300 font-semibold mb-1">Phone</label>
              <PhoneInput id="myprofile-phone"
                value={org.phone}
                onChange={(phone) => setOrg({ ...org, phone })}
                className="w-full px-3.5 py-2 rounded-xl glass-input"
              />
            </div>
            <div>
              <label htmlFor="myprofile-whatsapp" className="block text-slate-300 font-semibold mb-1">WhatsApp</label>
              <PhoneInput id="myprofile-whatsapp"
                value={org.whatsapp}
                onChange={(whatsapp) => setOrg({ ...org, whatsapp })}
                className="w-full px-3.5 py-2 rounded-xl glass-input"
              />
            </div>
            <div>
              <label htmlFor="myprofile-website" className="block text-slate-300 font-semibold mb-1">Website</label>
              <input id="myprofile-website"
                type="text"
                value={org.website}
                onChange={(e) => setOrg({ ...org, website: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl glass-input"
              />
            </div>
            <div>
              <label htmlFor="myprofile-address" className="block text-slate-300 font-semibold mb-1">Address</label>
              <input id="myprofile-address"
                type="text"
                value={org.address}
                onChange={(e) => setOrg({ ...org, address: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl glass-input"
              />
            </div>
            <div>
              <label htmlFor="myprofile-village" className="block text-slate-300 font-semibold mb-1">Village</label>
              <input id="myprofile-village"
                type="text"
                value={org.village}
                onChange={(e) => setOrg({ ...org, village: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl glass-input"
              />
            </div>
            <div>
              <label htmlFor="myprofile-panchayat" className="block text-slate-300 font-semibold mb-1">Panchayat</label>
              <input id="myprofile-panchayat"
                type="text"
                value={org.panchayat}
                onChange={(e) => setOrg({ ...org, panchayat: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl glass-input"
              />
            </div>
            <div>
              <label htmlFor="myprofile-district" className="block text-slate-300 font-semibold mb-1">District</label>
              <input id="myprofile-district"
                type="text"
                value={org.district}
                onChange={(e) => setOrg({ ...org, district: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl glass-input"
              />
            </div>
            <div>
              <label htmlFor="myprofile-state" className="block text-slate-300 font-semibold mb-1">State</label>
              <input id="myprofile-state"
                type="text"
                value={org.state}
                onChange={(e) => setOrg({ ...org, state: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl glass-input"
              />
            </div>
            <div>
              <label htmlFor="myprofile-country" className="block text-slate-300 font-semibold mb-1">Country</label>
              <input id="myprofile-country"
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
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/25 flex items-center gap-1.5 disabled:opacity-60"
            >
              <Save className="w-4 h-4" />
              <span>{savingOrg ? 'Saving...' : 'Save Organization Profile'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Account details */}
      <form onSubmit={handleSaveAccount} className="p-6 rounded-3xl glass-card border border-slate-800 space-y-4">
        <h3 className="text-sm font-bold text-white font-heading flex items-center gap-2">
          <UserCircle2 className="w-4 h-4 text-emerald-400" />
          {isClub ? 'Sign-in Details' : 'Account Details'}
        </h3>
        {isClub && (
          <p className="text-xs text-slate-400 -mt-2">The email and phone this club account signs in with.</p>
        )}
        <div className="grid sm:grid-cols-2 gap-3 text-xs">
          <div className={isClub ? 'hidden' : undefined}>
            <label htmlFor="myprofile-full-name" className="block text-slate-300 font-semibold mb-1">Full Name</label>
            <input id="myprofile-full-name"
              type="text"
              value={account.name}
              onChange={(e) => setAccount({ ...account, name: e.target.value })}
              className="w-full px-3.5 py-2 rounded-xl glass-input"
              required={!isClub}
            />
          </div>
          <div>
            <label htmlFor="myprofile-field" className="block text-slate-300 font-semibold mb-1">{isClub ? 'Sign-in Email' : 'Email'}</label>
            <input id="myprofile-field"
              type="email"
              value={account.email}
              onChange={(e) => setAccount({ ...account, email: e.target.value })}
              className="w-full px-3.5 py-2 rounded-xl glass-input"
              required
            />
          </div>
          <div>
            <label htmlFor="myprofile-phone-2" className="block text-slate-300 font-semibold mb-1">Phone</label>
            <PhoneInput id="myprofile-phone-2"
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
            <span>{savingAccount ? 'Saving...' : isClub ? 'Save Sign-in Details' : 'Save Account Details'}</span>
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
            <label htmlFor="myprofile-current-password" className="block text-slate-300 font-semibold mb-1">Current Password</label>
            <input id="myprofile-current-password"
              type="password"
              value={passwords.current_password}
              onChange={(e) => setPasswords({ ...passwords, current_password: e.target.value })}
              className="w-full px-3.5 py-2 rounded-xl glass-input"
              autoComplete="current-password"
            />
          </div>
          <div>
            <label htmlFor="myprofile-new-password" className="block text-slate-300 font-semibold mb-1">New Password</label>
            <input id="myprofile-new-password"
              type="password"
              value={passwords.new_password}
              onChange={(e) => setPasswords({ ...passwords, new_password: e.target.value })}
              className="w-full px-3.5 py-2 rounded-xl glass-input"
              autoComplete="new-password"
              minLength={6}
            />
          </div>
          <div>
            <label htmlFor="myprofile-confirm-new-password" className="block text-slate-300 font-semibold mb-1">Confirm New Password</label>
            <input id="myprofile-confirm-new-password"
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

      {/* Signed-in devices */}
      <div className="p-6 rounded-3xl glass-card border border-slate-800 space-y-4">
        <h3 className="text-sm font-bold text-white font-heading flex items-center gap-2">
          <LogOut className="w-4 h-4 text-amber-400" />
          Signed-in Devices
        </h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          Signing in leaves this account open on that device for up to seven days. If you have signed
          in on a shared or lost phone, sign out everywhere — every device, including this one, will
          have to sign in again.
        </p>
        <div className="flex justify-end">
          <button
            type="button"
            disabled={signingOutEverywhere}
            onClick={handleSignOutEverywhere}
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold text-xs flex items-center gap-1.5 disabled:opacity-60"
          >
            <LogOut className="w-4 h-4 text-amber-400" />
            <span>{signingOutEverywhere ? 'Signing out...' : 'Sign Out on All Devices'}</span>
          </button>
        </div>
      </div>


      {/* Player profile (PLAYER only) */}
      {role === 'PLAYER' && player && (
        <form onSubmit={handleSavePlayer} className="p-6 rounded-3xl glass-card border border-slate-800 space-y-4">
          <h3 className="text-sm font-bold text-white font-heading flex items-center gap-2">
            <UserCircle2 className="w-4 h-4 text-violet-400" />
            Player Profile
          </h3>
          <div className="grid sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label htmlFor="myprofile-age" className="block text-slate-300 font-semibold mb-1">Age</label>
              <input id="myprofile-age"
                type="number"
                min={5}
                max={100}
                value={player.age ?? ''}
                onChange={(e) => setPlayer({ ...player, age: Number(e.target.value) })}
                className="w-full px-3.5 py-2 rounded-xl glass-input font-mono"
              />
            </div>
            <div>
              <label htmlFor="myprofile-jersey-number" className="block text-slate-300 font-semibold mb-1">Jersey Number</label>
              <input id="myprofile-jersey-number"
                type="number"
                min={0}
                max={99}
                value={player.jersey_number ?? ''}
                onChange={(e) => setPlayer({ ...player, jersey_number: Number(e.target.value) })}
                className="w-full px-3.5 py-2 rounded-xl glass-input font-mono"
              />
            </div>
            <div>
              <label htmlFor="myprofile-date-of-birth" className="block text-slate-300 font-semibold mb-1">Date of Birth</label>
              <input id="myprofile-date-of-birth"
                type="date"
                value={player.dob ? player.dob.slice(0, 10) : ''}
                onChange={(e) => setPlayer({ ...player, dob: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl glass-input"
              />
            </div>
            {player.football_position !== undefined && player.football_position !== null && (
              <div>
                <label htmlFor="myprofile-football-position" className="block text-slate-300 font-semibold mb-1">Football Position</label>
                <input id="myprofile-football-position"
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
                  <label htmlFor="myprofile-cricket-role" className="block text-slate-300 font-semibold mb-1">Cricket Role</label>
                  <input id="myprofile-cricket-role"
                    type="text"
                    value={player.cricket_role || ''}
                    onChange={(e) => setPlayer({ ...player, cricket_role: e.target.value as any })}
                    className="w-full px-3.5 py-2 rounded-xl glass-input"
                  />
                </div>
                <div>
                  <label htmlFor="myprofile-batting-style" className="block text-slate-300 font-semibold mb-1">Batting Style</label>
                  <input id="myprofile-batting-style"
                    type="text"
                    value={player.cricket_batting_style || ''}
                    onChange={(e) => setPlayer({ ...player, cricket_batting_style: e.target.value as any })}
                    className="w-full px-3.5 py-2 rounded-xl glass-input"
                  />
                </div>
                <div>
                  <label htmlFor="myprofile-bowling-style" className="block text-slate-300 font-semibold mb-1">Bowling Style</label>
                  <input id="myprofile-bowling-style"
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
        title={isClub ? 'Update Club Logo' : 'Update Profile Photo'}
        subtitle={isClub ? 'Shown on your tournaments, posters and scoreboards' : 'Choose a photo or select an avatar'}
        currentImage={isClub ? org.logo : account.avatar}
        folder={role === 'ORG_ADMIN' ? 'clubs' : 'profiles'}
        onSuccess={async (newUrl) => {
          if (isClub) {
            try {
              setOrg(await api.put(`/organizations/${org.id}`, { logo: newUrl }));
              await refreshProfile();
              toast.success('Club logo updated');
            } catch (err) {
              toast.error(err instanceof ApiError ? err.message : 'Failed to update club logo');
            }
            return;
          }
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

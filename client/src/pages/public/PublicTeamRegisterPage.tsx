import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../services/api';
import type { Tournament, Organization } from '../../types';
import {
  ShieldCheck, CheckCircle2, ArrowRight, ArrowLeft,
  Plus, Trash2, Download, Camera
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { ReceiptModal } from '../../components/ReceiptModal';
import { PlayerCodeBadge } from '../../components/PlayerCodeBadge';
import { ImageUploadModal } from '../../components/ImageUploadModal';
import { PhoneInput } from '../../components/PhoneInput';
import { useToast } from '../../components/ui/Toast';
import type { PaymentMethod } from '../../types';
import type { RazorpayOrder, RazorpayVerifiedPayment } from '../../utils/razorpay';
import { openCheckout } from '../../utils/checkout';
import { PAYMENT_METHOD_META, ALL_PAYMENT_METHODS, isOnlineMethod } from '../../lib/paymentMethods';

const AVATAR_COLORS = [
  'bg-rose-500/20 text-rose-300', 'bg-amber-500/20 text-amber-300', 'bg-emerald-500/20 text-emerald-300',
  'bg-cyan-500/20 text-cyan-300', 'bg-blue-500/20 text-blue-300', 'bg-violet-500/20 text-violet-300',
  'bg-fuchsia-500/20 text-fuchsia-300', 'bg-teal-500/20 text-teal-300',
];

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
};

const PAYMENT_METHOD_INFO = PAYMENT_METHOD_META;

interface PlayerRow {
  full_name: string;
  jersey_number: number | string;
  is_captain: boolean;
  is_wicketkeeper?: boolean;
  football_position?: string;
  cricket_role?: string;
  cricket_bowling_style?: string;
  cricket_batting_style?: string;
  photo?: string;
}

export const PublicTeamRegisterPage: React.FC = () => {
  const toast = useToast();
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [_organization, setOrganization] = useState<Organization | null>(null);
  const [paymentOptions, setPaymentOptions] = useState<any>(null);

  // Wizard Step (1 to 5)
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Step 1: Team Details
  const [teamName, setTeamName] = useState('');
  const [shortName, setShortName] = useState('');
  const [jerseyColor, setJerseyColor] = useState('#3B82F6');
  const [secondaryJerseyColor, _setSecondaryJerseyColor] = useState('#FFFFFF');
  const [village, setVillage] = useState('');
  const [panchayat, setPanchayat] = useState('');
  const [district, setDistrict] = useState('Malappuram');

  // Step 2: Team Manager
  const [managerName, setManagerName] = useState('');
  const [managerPhone, setManagerPhone] = useState('');
  const [managerWhatsapp, setManagerWhatsapp] = useState('');
  const [managerEmail, setManagerEmail] = useState('');
  const [managerAddress, setManagerAddress] = useState('');

  // Step 3: Squad Players
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [photoUploadIndex, setPhotoUploadIndex] = useState<number | null>(null);

  // Step 4: Payment Option
  const [selectedPaymentOption, setSelectedPaymentOption] = useState<'full' | 'partial'>('partial');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('upi');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  // Shown once checkout succeeds, while the registration is being submitted.
  const [paymentStage, setPaymentStage] = useState<'idle' | 'verifying' | 'success'>('idle');

  // Step 5: Completed Receipt
  const [completedReceipt, setCompletedReceipt] = useState<any>(null);
  const [registeredPlayers, setRegisteredPlayers] = useState<{ id: string; full_name: string; jersey_number: number; player_code: string }[]>([]);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  useEffect(() => {
    const fetchLinkData = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/teams/public/registration/${token}`);
        setTournament(res.tournament);
        setOrganization(res.organization);
        setPaymentOptions(res.payment_options);

        const availableMethods: PaymentMethod[] = res.tournament.payment_config?.enabled_methods?.length
          ? res.tournament.payment_config.enabled_methods
          : ALL_PAYMENT_METHODS;
        setPaymentMethod(availableMethods[0]);

        // Prepopulate default players count (e.g. 7 for football sevens, 11 for cricket)
        const isFb = res.tournament.sport_code === 'football';
        const defaultCount = res.tournament.settings.squad_min_players || (isFb ? 7 : 11);
        
        const initialPlayers: PlayerRow[] = Array.from({ length: defaultCount }, (_, i) => ({
          full_name: '',
          jersey_number: i + 1,
          is_captain: i === 0,
          football_position: isFb ? (i === 0 ? 'Goalkeeper' : i <= 2 ? 'Centre Back' : i <= 4 ? 'Central Midfielder' : 'Striker') : undefined,
          cricket_role: !isFb ? (i <= 3 ? 'Batter' : i <= 5 ? 'All-rounder' : 'Bowler') : undefined,
          cricket_batting_style: 'Right Hand',
          cricket_bowling_style: 'Fast'
        }));
        setPlayers(initialPlayers);
      } catch (err: any) {
        setError(err.message || 'Invalid registration link');
      } finally {
        setLoading(false);
      }
    };

    fetchLinkData();
  }, [token]);

  const handleAddPlayer = () => {
    const isFb = tournament?.sport_code === 'football';
    const nextJersey = players.length > 0 ? Math.max(...players.map(p => Number(p.jersey_number) || 0)) + 1 : 1;
    setPlayers([
      ...players,
      {
        full_name: '',
        jersey_number: nextJersey,
        is_captain: false,
        football_position: isFb ? 'Central Midfielder' : undefined,
        cricket_role: !isFb ? 'Batter' : undefined,
        cricket_batting_style: 'Right Hand',
        cricket_bowling_style: 'Medium'
      }
    ]);
  };

  const handleRemovePlayer = (index: number) => {
    const min = tournament?.settings.squad_min_players || 7;
    if (players.length <= min) {
      toast.warning(`Minimum ${min} players required for this tournament roster.`);
      return;
    }
    setPlayers(players.filter((_, i) => i !== index));
  };

  const handlePlayerChange = (index: number, field: keyof PlayerRow, value: any) => {
    const updated = [...players];
    if (field === 'is_captain' && value === true) {
      updated.forEach(p => (p.is_captain = false));
    }
    (updated[index] as any)[field] = value;
    setPlayers(updated);
  };

  // Step 3 Validation: Duplicates & Empty names
  const validatePlayers = () => {
    for (let i = 0; i < players.length; i++) {
      if (!players[i].full_name.trim()) {
        toast.warning(`Please enter the name for Player #${i + 1}`);
        return false;
      }
      if (!players[i].jersey_number) {
        toast.warning(`Please enter a jersey number for ${players[i].full_name}`);
        return false;
      }
    }

    const jerseys = players.map(p => Number(p.jersey_number));
    const unique = new Set(jerseys);
    if (unique.size !== jerseys.length) {
      toast.warning('Duplicate jersey numbers detected! Every player must have a unique jersey number.');
      return false;
    }
    return true;
  };

  // Submit registration + record the ground-fee payment against it
  const submitRegistration = async (verifiedPayment?: RazorpayVerifiedPayment) => {
    setIsProcessingPayment(true);
    try {
      const res = await api.post(`/teams/public/registration/${token}`, {
        team_name: teamName,
        short_name: shortName || teamName.substring(0, 4).toUpperCase(),
        jersey_color: jerseyColor,
        secondary_jersey_color: secondaryJerseyColor,
        village,
        panchayat,
        district,
        manager_name: managerName,
        manager_phone: managerPhone,
        manager_whatsapp: managerWhatsapp || managerPhone,
        manager_email: managerEmail,
        manager_address: managerAddress,
        players: players.map(p => ({
          ...p,
          jersey_number: Number(p.jersey_number)
        })),
        payment_option: selectedPaymentOption,
        payment_method: paymentMethod,
        ...(verifiedPayment && {
          razorpay_payment_id: verifiedPayment.razorpay_payment_id,
          razorpay_order_id: verifiedPayment.razorpay_order_id,
          razorpay_signature: verifiedPayment.razorpay_signature,
        })
      });

      confetti({ particleCount: 150, spread: 80, origin: { y: 0.5 } });
      setCompletedReceipt(res.receipt);
      setRegisteredPlayers(res.players || []);
      setCurrentStep(5);
    } catch (err: any) {
      toast.error(err.message || 'Registration failed');
    } finally {
      setIsProcessingPayment(false);
      setPaymentStage('idle');
    }
  };

  // Paying at the ground skips straight to registration. UPI / card /
  // netbanking open the checkout the super admin configured for ground fees
  // (Razorpay or the demo checkout), starting on the method picked here, and
  // the registration is only submitted once the payment is verified.
  const handlePayAndRegister = async () => {
    if (!isOnlineMethod(paymentMethod)) {
      await submitRegistration();
      return;
    }

    setIsProcessingPayment(true);
    try {
      const order: RazorpayOrder = await api.post(`/teams/public/registration/${token}/payment-order`, {
        payment_option: selectedPaymentOption,
        method: paymentMethod
      });

      if (!order.configured) {
        await submitRegistration();
        return;
      }

      const verified = await openCheckout({
        order,
        method: paymentMethod,
        name: tournament.name,
        description: `Ground fee — ${teamName}`,
        prefill: { name: managerName, contact: managerPhone, email: managerEmail }
      });

      setPaymentStage('success');
      await submitRegistration(verified);
    } catch (err: any) {
      toast.error(err.message || 'Payment could not be completed');
      setPaymentStage('idle');
      setIsProcessingPayment(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="flex items-center gap-3 text-emerald-400">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="font-semibold text-sm">Loading Registration Wizard...</span>
        </div>
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-center">
        <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mb-4 text-xl">⚠️</div>
        <h2 className="text-xl font-bold text-white mb-2">Registration Link Inactive</h2>
        <p className="text-xs text-slate-400 mb-6">{error || 'This tournament registration link has expired or is invalid.'}</p>
        <Link to="/" className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold">
          Go to Platform Home
        </Link>
      </div>
    );
  }

  const isFootball = tournament.sport_code === 'football';
  const totalGroundFee = tournament.ground_fee || 0;
  const partialAmount = paymentOptions?.partialAmount || Math.round(totalGroundFee / 2);
  const isPayAtGround = paymentMethod === 'pay_at_ground';
  const amountToPayNow = isPayAtGround ? 0 : (selectedPaymentOption === 'full' ? totalGroundFee : partialAmount);
  const balanceDue = Math.max(0, totalGroundFee - amountToPayNow);
  const availablePaymentMethods: PaymentMethod[] = tournament.payment_config?.enabled_methods?.length
    ? tournament.payment_config.enabled_methods
    : ALL_PAYMENT_METHODS;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20">
      {/* Top Header */}
      <div className="border-b border-slate-800 bg-slate-900/60 sticky top-0 z-30 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={tournament.logo} alt={tournament.name} className="w-10 h-10 rounded-xl object-cover border border-slate-700" />
            <div>
              <h1 className="text-sm font-bold text-white font-heading truncate max-w-xs sm:max-w-md">{tournament.name}</h1>
              <span className="text-[11px] text-slate-400">Team Registration Portal</span>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold font-mono">
            Fee: ₹{totalGroundFee.toLocaleString()}
          </span>
        </div>

        {/* 5-Step Mobile Progress Bar */}
        <div className="max-w-3xl mx-auto px-4 pb-3">
          <div className="grid grid-cols-5 gap-1.5 text-center text-[11px] font-bold">
            {[
              { num: 1, label: 'Team' },
              { num: 2, label: 'Manager' },
              { num: 3, label: 'Squad' },
              { num: 4, label: 'Payment' },
              { num: 5, label: 'Receipt' }
            ].map(s => (
              <div key={s.num} className="flex flex-col items-center gap-1">
                <div className={`w-full h-1.5 rounded-full transition-all ${
                  currentStep >= s.num ? 'bg-gradient-to-r from-emerald-500 to-teal-400' : 'bg-slate-800'
                }`} />
                <span className={currentStep === s.num ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                  {s.num}. {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Registration Wizard Container */}
      <div className="max-w-3xl mx-auto px-4 pt-6">
        <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-slate-800 shadow-2xl">
          {/* STEP 1: TEAM DETAILS */}
          {currentStep === 1 && (
            <div className="space-y-4 animate-in fade-in">
              <div className="border-b border-slate-800 pb-3 mb-4">
                <h2 className="text-lg font-bold text-white font-heading">Step 1: Team Details & Identity</h2>
                <p className="text-xs text-slate-400">Enter your official club or village team name and jersey colors</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Official Team Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Malabar Blasters FC or Nilgiri Lions"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 rounded-xl glass-input text-sm font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Short Name / Code</label>
                  <input
                    type="text"
                    placeholder="e.g. MBFC"
                    maxLength={5}
                    value={shortName}
                    onChange={(e) => setShortName(e.target.value.toUpperCase())}
                    className="w-full px-4 py-2.5 rounded-xl glass-input text-sm uppercase font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Primary Jersey Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={jerseyColor}
                      onChange={(e) => setJerseyColor(e.target.value)}
                      className="w-10 h-10 rounded-xl bg-transparent border-0 cursor-pointer p-0"
                    />
                    <span className="text-xs font-mono text-slate-300 uppercase">{jerseyColor}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Village / Town</label>
                  <input
                    type="text"
                    placeholder="e.g. Nilambur"
                    value={village}
                    onChange={(e) => setVillage(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Panchayat / Ward</label>
                  <input
                    type="text"
                    placeholder="Nilambur Grama"
                    value={panchayat}
                    onChange={(e) => setPanchayat(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">District</label>
                  <input
                    type="text"
                    placeholder="Malappuram"
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs"
                  />
                </div>
              </div>

              <div className="pt-6 flex justify-end">
                <button
                  type="button"
                  disabled={!teamName.trim()}
                  onClick={() => setCurrentStep(2)}
                  className="px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/20 disabled:opacity-40 flex items-center gap-2"
                >
                  <span>Continue to Manager Details</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: TEAM MANAGER DETAILS */}
          {currentStep === 2 && (
            <div className="space-y-4 animate-in fade-in">
              <div className="border-b border-slate-800 pb-3 mb-4">
                <h2 className="text-lg font-bold text-white font-heading">Step 2: Team Manager Contact</h2>
                <p className="text-xs text-slate-400">Mobile number is the primary contact for fixtures and receipt delivery</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Manager Full Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Faisal Mohammed"
                  value={managerName}
                  onChange={(e) => setManagerName(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 rounded-xl glass-input text-sm font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Mobile Number (Primary) *</label>
                  <PhoneInput
                    placeholder="97455 11223"
                    value={managerPhone}
                    onChange={setManagerPhone}
                    required
                    className="w-full px-4 py-2.5 rounded-xl glass-input text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">WhatsApp Number</label>
                  <PhoneInput
                    placeholder="Same as mobile or custom"
                    value={managerWhatsapp}
                    onChange={setManagerWhatsapp}
                    className="w-full px-4 py-2.5 rounded-xl glass-input text-sm font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Email Address</label>
                  <input
                    type="email"
                    placeholder="manager@domain.com"
                    value={managerEmail}
                    onChange={(e) => setManagerEmail(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl glass-input text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Address / Club House</label>
                  <input
                    type="text"
                    placeholder="Kacherippadi, Manjeri"
                    value={managerAddress}
                    onChange={(e) => setManagerAddress(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl glass-input text-sm"
                  />
                </div>
              </div>

              <div className="pt-6 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="px-4 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  disabled={!managerName.trim() || !managerPhone.trim()}
                  onClick={() => setCurrentStep(3)}
                  className="px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/20 disabled:opacity-40 flex items-center gap-2"
                >
                  <span>Continue to Player Roster</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: SQUAD & PLAYERS (FOOTBALL POSITIONS / CRICKET ROLES) */}
          {currentStep === 3 && (
            <div className="space-y-4 animate-in fade-in">
              <div className="border-b border-slate-800 pb-3 mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white font-heading">
                    Step 3: {isFootball ? 'Football Squad Roster' : 'Cricket Squad Roster'}
                  </h2>
                  <p className="text-xs text-slate-400">
                    Min: {tournament.settings.squad_min_players || 7} | Max: {tournament.settings.squad_max_players || 14} players
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddPlayer}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 text-xs font-bold flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Player</span>
                </button>
              </div>

              {/* Player list table */}
              <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                {players.map((player, idx) => (
                  <div key={idx} className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setPhotoUploadIndex(idx)}
                      className="relative group w-10 h-10 rounded-full overflow-hidden shrink-0 border border-slate-700"
                      title="Add player photo (optional)"
                    >
                      {player.photo ? (
                        <img src={player.photo} alt={player.full_name} className="w-full h-full object-cover" />
                      ) : (
                        <div className={`w-full h-full flex items-center justify-center text-xs font-bold ${AVATAR_COLORS[idx % AVATAR_COLORS.length]}`}>
                          {getInitials(player.full_name || `P${idx + 1}`)}
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Camera className="w-3.5 h-3.5 text-white" />
                      </div>
                    </button>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <span className="w-6 h-6 rounded-full bg-slate-800 text-[11px] font-bold text-slate-400 flex items-center justify-center font-mono">
                        {idx + 1}
                      </span>
                      <input
                        type="number"
                        min="1"
                        max="99"
                        placeholder="Jersey"
                        value={player.jersey_number}
                        onChange={(e) => handlePlayerChange(idx, 'jersey_number', e.target.value)}
                        className="w-16 px-2 py-1.5 rounded-lg glass-input text-center font-mono font-bold text-xs text-emerald-400"
                      />
                    </div>

                    <div className="flex-1 w-full sm:w-auto">
                      <input
                        type="text"
                        placeholder={`Player ${idx + 1} Full Name`}
                        value={player.full_name}
                        onChange={(e) => handlePlayerChange(idx, 'full_name', e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg glass-input text-xs font-semibold"
                      />
                    </div>

                    {/* Position / Role selection */}
                    <div className="w-full sm:w-44">
                      {isFootball ? (
                        <select
                          value={player.football_position}
                          onChange={(e) => handlePlayerChange(idx, 'football_position', e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg glass-input text-[11px] bg-slate-900 text-slate-200"
                        >
                          <option value="Goalkeeper">Goalkeeper (GK)</option>
                          <option value="Centre Back">Centre Back (CB)</option>
                          <option value="Left Back">Left Back (LB)</option>
                          <option value="Right Back">Right Back (RB)</option>
                          <option value="Defensive Midfielder">Def. Midfield (DM)</option>
                          <option value="Central Midfielder">Central Mid (CM)</option>
                          <option value="Attacking Midfielder">Attacking Mid (AM)</option>
                          <option value="Left Wing">Left Wing (LW)</option>
                          <option value="Right Wing">Right Wing (RW)</option>
                          <option value="Striker">Striker / Forward</option>
                        </select>
                      ) : (
                        <select
                          value={player.cricket_role}
                          onChange={(e) => handlePlayerChange(idx, 'cricket_role', e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg glass-input text-[11px] bg-slate-900 text-slate-200"
                        >
                          <option value="Batter">Batter</option>
                          <option value="Bowler">Bowler</option>
                          <option value="All-rounder">All-rounder</option>
                          <option value="Wicketkeeper">Wicketkeeper</option>
                          <option value="Wicketkeeper + Batter">WK + Batter</option>
                        </select>
                      )}
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                      <label className="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer">
                        <input
                          type="radio"
                          name="captain"
                          checked={player.is_captain}
                          onChange={() => handlePlayerChange(idx, 'is_captain', true)}
                          className="text-emerald-500"
                        />
                        <span className={player.is_captain ? 'font-bold text-amber-400' : ''}>Captain</span>
                      </label>

                      {players.length > (tournament.settings.squad_min_players || 7) && (
                        <button
                          type="button"
                          onClick={() => handleRemovePlayer(idx)}
                          className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-900 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-6 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="px-4 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (validatePlayers()) setCurrentStep(4);
                  }}
                  className="px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/20 flex items-center gap-2"
                >
                  <span>Continue to Payment Selection</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: GROUND FEE & PAYMENT SUMMARY (FULL vs 50% PARTIAL) */}
          {currentStep === 4 && (
            <div className="space-y-5 animate-in fade-in">
              <div className="border-b border-slate-800 pb-3 mb-4">
                <h2 className="text-lg font-bold text-white font-heading">Step 4: Ground Fee & Payment</h2>
                <p className="text-xs text-slate-400">Choose between full payment or partial advance payment</p>
              </div>

              {/* Summary Card */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs space-y-2">
                <div className="flex justify-between text-slate-400">
                  <span>Tournament</span>
                  <span className="font-semibold text-white">{tournament.name}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Registered Team</span>
                  <span className="font-bold text-emerald-400">{teamName} ({players.length} Players)</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Total Ground Fee</span>
                  <span className="font-mono font-bold text-white text-sm">₹{totalGroundFee.toLocaleString()}</span>
                </div>
              </div>

              {/* Payment Methods */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                  Select Payment Method
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {availablePaymentMethods.map(id => {
                    const info = PAYMENT_METHOD_INFO[id];
                    const Icon = info.icon;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setPaymentMethod(id)}
                        className={`p-3 rounded-2xl border text-center text-xs font-semibold flex flex-col items-center gap-1.5 transition-all ${
                          paymentMethod === id
                            ? 'bg-slate-800 border-emerald-500 text-emerald-400'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                        <span>{info.label}</span>
                        <span className="text-[10px] font-normal text-slate-500">{info.blurb}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Payment Options Selection — not applicable when settling at the ground */}
              {!isPayAtGround && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                    Select Ground Fee Option
                  </label>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {/* Full Payment Option */}
                    <button
                      type="button"
                      onClick={() => setSelectedPaymentOption('full')}
                      className={`p-4 rounded-2xl border text-left transition-all ${
                        selectedPaymentOption === 'full'
                          ? 'bg-emerald-500/15 border-emerald-500 text-white shadow-md shadow-emerald-500/10'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-sm">Full Payment (100%)</span>
                        <span className="font-mono text-base font-black text-emerald-400">₹{totalGroundFee.toLocaleString()}</span>
                      </div>
                      <p className="text-[11px] text-slate-400">Pay complete ground fee in advance. Instant fully-paid confirmation.</p>
                    </button>

                    {/* Partial 50% Payment Option */}
                    <button
                      type="button"
                      onClick={() => setSelectedPaymentOption('partial')}
                      className={`p-4 rounded-2xl border text-left transition-all ${
                        selectedPaymentOption === 'partial'
                          ? 'bg-amber-500/15 border-amber-500 text-white shadow-md shadow-amber-500/10'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-sm">Partial Advance (50%)</span>
                        <span className="font-mono text-base font-black text-amber-400">₹{partialAmount.toLocaleString()}</span>
                      </div>
                      <p className="text-[11px] text-slate-400">Pay ₹{partialAmount.toLocaleString()} now. Remaining ₹{balanceDue.toLocaleString()} due at match venue.</p>
                    </button>
                  </div>
                </div>
              )}

              {isPayAtGround && (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
                  You'll pay the full ₹{totalGroundFee.toLocaleString()} ground fee in cash or UPI when your team arrives at the venue. Nothing is charged now.
                </div>
              )}

              {/* Pay Now Callout */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-emerald-500/30 flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-400">Amount Due Now</div>
                  <div className="text-2xl font-black text-emerald-400 font-mono">₹{amountToPayNow.toLocaleString()}</div>
                  {balanceDue > 0 && <div className="text-[11px] text-amber-400">Remaining Balance: ₹{balanceDue.toLocaleString()}</div>}
                </div>

                <button
                  type="button"
                  disabled={isProcessingPayment || paymentStage !== 'idle'}
                  onClick={handlePayAndRegister}
                  className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-sm shadow-xl shadow-emerald-500/20 disabled:opacity-50 flex items-center gap-2"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>
                    {isProcessingPayment || paymentStage !== 'idle'
                      ? 'Processing...'
                      : isPayAtGround
                        ? 'Register — Pay at Ground'
                        : `Pay ₹${amountToPayNow.toLocaleString()} & Register`}
                  </span>
                </button>
              </div>

              <div className="flex justify-start">
                <button
                  type="button"
                  onClick={() => setCurrentStep(3)}
                  className="px-4 py-2 rounded-2xl bg-slate-800 text-xs font-semibold text-slate-300 flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to Squad</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: REGISTRATION CONFIRMATION & RECEIPT */}
          {currentStep === 5 && completedReceipt && (
            <div className="space-y-6 text-center py-4 animate-in zoom-in-95">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400 flex items-center justify-center mx-auto shadow-xl shadow-emerald-500/20">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <h2 className="text-2xl font-black text-white font-heading">Registration Confirmed!</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Team <strong className="text-emerald-400">{teamName}</strong> has been successfully registered for {tournament.name}.
                </p>
              </div>

              {/* Receipt Summary Card */}
              <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 max-w-md mx-auto text-left text-xs space-y-2.5">
                <div className="flex justify-between border-b border-slate-800 pb-2">
                  <span className="text-slate-400">Official Receipt No:</span>
                  <span className="font-mono font-bold text-white">{completedReceipt.receipt_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Total Ground Fee:</span>
                  <span className="font-mono text-slate-200">₹{completedReceipt.receipt_data.total_fee.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-emerald-400 font-bold">
                  <span>Amount Paid:</span>
                  <span className="font-mono">₹{completedReceipt.receipt_data.paid_amount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-amber-400 font-bold border-t border-slate-800 pt-2">
                  <span>Remaining Balance:</span>
                  <span className="font-mono">₹{completedReceipt.receipt_data.remaining_balance.toLocaleString()}</span>
                </div>
              </div>

              {/* Player Codes — the manager passes each one on */}
              {registeredPlayers.length > 0 && (
                <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 max-w-md mx-auto text-left text-xs space-y-3">
                  <div>
                    <div className="font-bold text-white">Player Codes</div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Share each code with the player. They can enter it on Find My Stats to see their own stats, with no login.
                    </p>
                  </div>
                  <div className="divide-y divide-slate-800/70">
                    {registeredPlayers.map(p => (
                      <div key={p.id} className="py-2 flex items-center justify-between gap-3">
                        <span className="text-slate-200 truncate">
                          <span className="font-mono text-slate-500 mr-2">#{p.jersey_number}</span>
                          {p.full_name}
                        </span>
                        <PlayerCodeBadge code={p.player_code} size="sm" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowReceiptModal(true)}
                  className="px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20"
                >
                  <Download className="w-4 h-4" />
                  <span>View & Download Official PDF Receipt</span>
                </button>

                <Link
                  to={`/tournaments/${tournament.slug}`}
                  className="px-6 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-colors"
                >
                  View Tournament Hub ↗
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Player Photo Upload — optional, defaults to an initials avatar */}
      {photoUploadIndex !== null && (
        <ImageUploadModal
          isOpen={photoUploadIndex !== null}
          onClose={() => setPhotoUploadIndex(null)}
          onSuccess={(url) => {
            handlePlayerChange(photoUploadIndex, 'photo', url);
            setPhotoUploadIndex(null);
          }}
          title="Upload Player Photo"
          subtitle="Optional — leave unset to use a default avatar"
          currentImage={players[photoUploadIndex]?.photo}
          folder="players"
          aspectRatio="square"
        />
      )}

      {/* Official Receipt Modal */}
      {showReceiptModal && (
        <ReceiptModal
          receipt={completedReceipt}
          onClose={() => setShowReceiptModal(false)}
        />
      )}

      {/* Shown after checkout succeeds while the registration is submitted. */}
      {paymentStage !== 'idle' && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-950/95 backdrop-blur-md p-4 animate-in fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-8 text-center space-y-5">
            {paymentStage === 'success' ? (
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400 flex items-center justify-center mx-auto animate-in zoom-in-95">
                <CheckCircle2 className="w-8 h-8" />
              </div>
            ) : (
              <div className="w-16 h-16 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center mx-auto relative">
                {(() => {
                  const Icon = PAYMENT_METHOD_INFO[paymentMethod].icon;
                  return <Icon className="w-7 h-7 text-emerald-400" />;
                })()}
                <div className="absolute inset-0 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
              </div>
            )}

            <div>
              <h3 className="text-sm font-bold text-white font-heading">
                {paymentStage === 'verifying' && 'Processing Payment...'}
                {paymentStage === 'success' && 'Payment Confirmed!'}
              </h3>
              <p className="text-xs text-slate-400 mt-1.5">
                {paymentStage === 'success'
                  ? `₹${amountToPayNow.toLocaleString()} received. Finishing your registration...`
                  : `Completing your ₹${amountToPayNow.toLocaleString()} payment via ${PAYMENT_METHOD_INFO[paymentMethod].label}.`}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, ApiError } from '../../services/api';
import type { Tournament } from '../../types';
import {
  ShieldCheck, CheckCircle2, ArrowRight, ArrowLeft,
  Plus, Trash2, Download, Camera, RotateCcw, AlertTriangle, Info,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { ReceiptModal } from '../../components/ReceiptModal';
import { PlayerCodeBadge } from '../../components/PlayerCodeBadge';
import { ImageUploadModal } from '../../components/ImageUploadModal';
import { PhoneInput } from '../../components/PhoneInput';
import { useToast } from '../../components/ui/Toast';
import { FieldError, fieldErrorId, useFieldErrors } from '../../components/ui/FieldError';
import { useAuth } from '../../context/AuthContext';
import type { PaymentMethod } from '../../types';
import type { RazorpayOrder, RazorpayVerifiedPayment } from '../../utils/razorpay';
import { openCheckout } from '../../utils/checkout';
import { PAYMENT_METHOD_META, ALL_PAYMENT_METHODS, isOnlineMethod } from '../../lib/paymentMethods';
import { useDraft, useLeaveWarning } from '../../lib/useDraft';
import { usePreferences } from '../../i18n';

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

const FOOTBALL_POSITIONS: { value: string; label: string }[] = [
  { value: 'Goalkeeper', label: 'Goalkeeper (GK)' },
  { value: 'Centre Back', label: 'Centre Back (CB)' },
  { value: 'Left Back', label: 'Left Back (LB)' },
  { value: 'Right Back', label: 'Right Back (RB)' },
  { value: 'Defensive Midfielder', label: 'Defensive Mid (DM)' },
  { value: 'Central Midfielder', label: 'Central Mid (CM)' },
  { value: 'Attacking Midfielder', label: 'Attacking Mid (AM)' },
  { value: 'Left Wing', label: 'Left Wing (LW)' },
  { value: 'Right Wing', label: 'Right Wing (RW)' },
  { value: 'Striker', label: 'Striker / Forward' },
];

const CRICKET_ROLES: { value: string; label: string }[] = [
  { value: 'Batter', label: 'Batter' },
  { value: 'Bowler', label: 'Bowler' },
  { value: 'All-rounder', label: 'All-rounder' },
  { value: 'Wicketkeeper', label: 'Wicketkeeper' },
  { value: 'Wicketkeeper + Batter', label: 'WK + Batter' },
];

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

/** What the server returns for a finished (or replayed) registration. */
interface RegistrationResult {
  receipt: any;
  players: { id: string; full_name: string; jersey_number: number; player_code: string }[];
  replayed?: boolean;
}

type PaidWith = RazorpayVerifiedPayment & { amount: number };

/**
 * Everything typed so far, kept on the device until the team is registered.
 *
 * `paidWith` is the important part: once a checkout has succeeded, the money
 * has moved. If the registration request then fails — the signal dropped, the
 * tab was closed — the verified payment is still here, so "Finish
 * registration" resubmits with it instead of charging again. The server treats
 * a resubmission of a registration that did go through as a replay and hands
 * back the receipt.
 */
interface Draft {
  step: number;
  teamName: string;
  shortName: string;
  jerseyColor: string;
  village: string;
  panchayat: string;
  district: string;
  managerName: string;
  managerPhone: string;
  managerWhatsapp: string;
  managerEmail: string;
  managerAddress: string;
  players: PlayerRow[];
  paymentOption: 'full' | 'partial';
  paymentMethod: PaymentMethod | null;
  paidWith: PaidWith | null;
}

type Outcome =
  | { kind: 'none' }
  | { kind: 'recover'; ref: string; amount: number }
  | { kind: 'refund'; ref: string };

const inputClass = 'w-full px-4 py-3 rounded-xl glass-input text-base';
const labelClass = 'block text-sm font-semibold text-slate-200 mb-1.5';
const hintClass = 'mt-1 text-sm text-slate-400';
const primaryButton = 'min-h-12 px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-base shadow-lg shadow-emerald-600/20 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2';
const secondaryButton = 'min-h-12 px-5 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-base font-semibold text-slate-200 inline-flex items-center gap-2';

export const PublicTeamRegisterPage: React.FC = () => {
  const toast = useToast();
  const { t, money } = usePreferences();
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fields = useFieldErrors();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [paymentOptions, setPaymentOptions] = useState<any>(null);
  // Entries closed or the field already full — said up front, not on submit.
  const [closedReason, setClosedReason] = useState<string | null>(null);

  const draft = useDraft<Draft>(token ? `team-registration:${token}` : null);
  const saved = draft.initial;

  const [currentStep, setCurrentStep] = useState<number>(saved?.step && saved.step < 5 ? saved.step : 1);

  // Step 1: Team
  const [teamName, setTeamName] = useState(saved?.teamName ?? '');
  const [shortName, setShortName] = useState(saved?.shortName ?? '');
  const [jerseyColor, setJerseyColor] = useState(saved?.jerseyColor ?? '#3B82F6');
  const secondaryJerseyColor = '#FFFFFF';
  const [village, setVillage] = useState(saved?.village ?? '');
  const [panchayat, setPanchayat] = useState(saved?.panchayat ?? '');
  const [district, setDistrict] = useState(saved?.district ?? 'Malappuram');

  // Step 2: Manager
  const [managerName, setManagerName] = useState(saved?.managerName ?? '');
  const [managerPhone, setManagerPhone] = useState(saved?.managerPhone ?? '');
  const [managerWhatsapp, setManagerWhatsapp] = useState(saved?.managerWhatsapp ?? '');
  const [managerEmail, setManagerEmail] = useState(saved?.managerEmail ?? '');
  const [managerAddress, setManagerAddress] = useState(saved?.managerAddress ?? '');

  // Entering from a team manager's portal: start from their own details
  // (the team is linked to their account when it's submitted).
  const { user, role } = useAuth();
  const isManagerAccount = role === 'TEAM_MANAGER' && !!user;
  useEffect(() => {
    if (!isManagerAccount || !user) return;
    setManagerName(current => current || user.name || '');
    setManagerPhone(current => current || user.phone || '');
    setManagerWhatsapp(current => current || user.phone || '');
    setManagerEmail(current => current || user.email || '');
  }, [isManagerAccount, user]);

  // Step 3: Squad
  const [players, setPlayers] = useState<PlayerRow[]>(saved?.players ?? []);
  const [photoUploadIndex, setPhotoUploadIndex] = useState<number | null>(null);
  const [squadErrors, setSquadErrors] = useState<Record<number, string>>({});
  const [squadSummaryError, setSquadSummaryError] = useState<string | null>(null);

  // Step 4: Payment
  const [selectedPaymentOption, setSelectedPaymentOption] = useState<'full' | 'partial'>(saved?.paymentOption ?? 'partial');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(saved?.paymentMethod ?? 'upi');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentStage, setPaymentStage] = useState<'idle' | 'checking' | 'verifying' | 'success'>('idle');
  const [paidWith, setPaidWith] = useState<PaidWith | null>(saved?.paidWith ?? null);
  const [outcome, setOutcome] = useState<Outcome>(
    saved?.paidWith ? { kind: 'recover', ref: saved.paidWith.razorpay_payment_id, amount: saved.paidWith.amount } : { kind: 'none' },
  );

  // Step 5: Receipt
  const [completed, setCompleted] = useState<RegistrationResult | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  useEffect(() => {
    const fetchLinkData = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/teams/public/registration/${token}`);
        setTournament(res.tournament);
        setPaymentOptions(res.payment_options);
        setClosedReason(
          res.closed_reason
            || (res.is_full ? t('reg.closed.full', { max: res.tournament.max_teams }) : null),
        );

        const availableMethods: PaymentMethod[] = res.tournament.payment_config?.enabled_methods?.length
          ? res.tournament.payment_config.enabled_methods
          : ALL_PAYMENT_METHODS;

        // A restored draft keeps its own choices where they are still offered.
        if (!saved?.paymentOption) {
          setSelectedPaymentOption(res.payment_options?.allowPartial ? 'partial' : 'full');
        } else if (saved.paymentOption === 'partial' && !res.payment_options?.allowPartial) {
          setSelectedPaymentOption('full');
        }
        if (!saved?.paymentMethod || !availableMethods.includes(saved.paymentMethod)) {
          setPaymentMethod(availableMethods[0]);
        }

        if (!saved?.players?.length) {
          const isFb = res.tournament.sport_code === 'football';
          const defaultCount = res.tournament.settings.squad_min_players || (isFb ? 7 : 11);
          setPlayers(Array.from({ length: defaultCount }, (_, i) => ({
            full_name: '',
            jersey_number: i + 1,
            is_captain: i === 0,
            football_position: isFb ? (i === 0 ? 'Goalkeeper' : i <= 2 ? 'Centre Back' : i <= 4 ? 'Central Midfielder' : 'Striker') : undefined,
            cricket_role: !isFb ? (i <= 3 ? 'Batter' : i <= 5 ? 'All-rounder' : 'Bowler') : undefined,
            cricket_batting_style: 'Right Hand',
            cricket_bowling_style: 'Fast',
          })));
        }
      } catch (err: any) {
        setError(err.message || t('reg.inactive.body'));
      } finally {
        setLoading(false);
      }
    };

    fetchLinkData();
    // The draft is read once, on open; switching language must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Written as they go.
  const snapshot: Draft = useMemo(() => ({
    step: currentStep,
    teamName, shortName, jerseyColor, village, panchayat, district,
    managerName, managerPhone, managerWhatsapp, managerEmail, managerAddress,
    players, paymentOption: selectedPaymentOption, paymentMethod, paidWith,
  }), [currentStep, teamName, shortName, jerseyColor, village, panchayat, district,
    managerName, managerPhone, managerWhatsapp, managerEmail, managerAddress,
    players, selectedPaymentOption, paymentMethod, paidWith]);

  const hasTyped = teamName.trim() !== '' || managerName.trim() !== '' || players.some(p => p.full_name.trim() !== '');
  const finished = currentStep === 5 && completed !== null;
  const { save: saveDraft, clear: clearDraft } = draft;

  useEffect(() => {
    if (!loading && !finished && hasTyped) saveDraft(snapshot);
  }, [snapshot, loading, finished, hasTyped, saveDraft]);

  useLeaveWarning(hasTyped && !finished);

  const startOver = () => {
    clearDraft();
    window.location.reload();
  };

  const minPlayers = tournament?.settings.squad_min_players || 7;
  const maxPlayers = tournament?.settings.squad_max_players || 14;

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
        cricket_bowling_style: 'Medium',
      },
    ]);
  };

  const handleRemovePlayer = (index: number) => {
    if (players.length <= minPlayers) {
      toast.warning(t('reg.squad.errMin', { min: minPlayers }));
      return;
    }
    setPlayers(players.filter((_, i) => i !== index));
    setSquadErrors({});
  };

  const handlePlayerChange = (index: number, field: keyof PlayerRow, value: any) => {
    const updated = players.map(p => ({ ...p }));
    if (field === 'is_captain' && value === true) {
      updated.forEach(p => (p.is_captain = false));
    }
    (updated[index] as any)[field] = value;
    setPlayers(updated);
    if (squadErrors[index]) {
      setSquadErrors(previous => {
        const next = { ...previous };
        delete next[index];
        return next;
      });
    }
    fields.clear(`players.${index}`);
  };

  /**
   * Check the squad in place: each problem is shown on its own row and the
   * first one is scrolled to — one toast saying "something is wrong" over a
   * list of fifteen sent people hunting.
   */
  const validatePlayers = (): boolean => {
    const errors: Record<number, string> = {};
    const seen = new Map<number, number>();

    players.forEach((player, i) => {
      const n = i + 1;
      const jersey = Number(player.jersey_number);
      if (!player.full_name.trim()) {
        errors[i] = t('reg.squad.errName', { n });
      } else if (player.jersey_number === '' || player.jersey_number === null || player.jersey_number === undefined) {
        errors[i] = t('reg.squad.errJersey', { n });
      } else if (!Number.isInteger(jersey) || jersey < 1 || jersey > 99) {
        errors[i] = t('reg.squad.errJerseyRange');
      } else if (seen.has(jersey)) {
        errors[i] = t('reg.squad.errDuplicate', { number: jersey });
        const first = seen.get(jersey)!;
        errors[first] = errors[first] ?? t('reg.squad.errDuplicate', { number: jersey });
      } else {
        seen.set(jersey, i);
      }
    });

    setSquadErrors(errors);

    if (players.length < minPlayers) {
      setSquadSummaryError(t('reg.squad.errMin', { min: minPlayers }));
      return false;
    }
    setSquadSummaryError(null);

    const firstBad = Object.keys(errors).map(Number).sort((a, b) => a - b)[0];
    if (firstBad !== undefined) {
      document.getElementById(`player-row-${firstBad}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      document.getElementById(`player-name-${firstBad}`)?.focus({ preventScroll: true });
      return false;
    }
    return true;
  };

  const payload = useCallback((verified?: RazorpayVerifiedPayment | null) => ({
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
    players: players.map(p => ({ ...p, jersey_number: Number(p.jersey_number) })),
    payment_option: selectedPaymentOption,
    payment_method: paymentMethod,
    ...(verified && {
      razorpay_payment_id: verified.razorpay_payment_id,
      razorpay_order_id: verified.razorpay_order_id,
      razorpay_signature: verified.razorpay_signature,
    }),
  }), [teamName, shortName, jerseyColor, village, panchayat, district, managerName, managerPhone,
    managerWhatsapp, managerEmail, managerAddress, players, selectedPaymentOption, paymentMethod]);

  /** Send a server rejection to the step and field it is about. */
  const showRejection = (err: unknown) => {
    fields.capture(err);
    const firstKey = err instanceof ApiError ? Object.keys(err.fieldErrors)[0] : undefined;
    if (firstKey?.startsWith('players')) setCurrentStep(3);
    else if (firstKey?.startsWith('manager')) setCurrentStep(2);
    else if (firstKey && ['team_name', 'short_name', 'village', 'panchayat', 'district'].includes(firstKey)) setCurrentStep(1);
    toast.error(err instanceof Error ? err.message : 'Registration failed');
  };

  const submitRegistration = async (verified?: PaidWith) => {
    setIsProcessingPayment(true);
    try {
      const res: RegistrationResult = await api.post(`/teams/public/registration/${token}`, payload(verified));
      confetti({ particleCount: 150, spread: 80, origin: { y: 0.5 } });
      setCompleted(res);
      setOutcome({ kind: 'none' });
      setPaidWith(null);
      clearDraft();
      setCurrentStep(5);
    } catch (err: unknown) {
      const apiErr = err instanceof ApiError ? err : null;

      if (!verified) {
        showRejection(err);
      } else if (apiErr?.data?.refund_pending) {
        // The server refused a paid entry and told the organizer to refund.
        setOutcome({ kind: 'refund', ref: verified.razorpay_payment_id });
        setPaidWith(null);
        clearDraft();
      } else {
        // Money moved; the registration may or may not have. Keep the payment
        // so they can finish without paying twice — and if the server named a
        // field, take them to it first.
        setOutcome({ kind: 'recover', ref: verified.razorpay_payment_id, amount: verified.amount });
        if (apiErr && !apiErr.isNetworkError && apiErr.status < 500 && apiErr.status !== 429) {
          showRejection(err);
        } else {
          toast.error(apiErr?.message || 'Registration failed');
        }
      }
    } finally {
      setIsProcessingPayment(false);
      setPaymentStage('idle');
    }
  };

  const totalGroundFee = tournament?.ground_fee || 0;
  const allowHalf = !!paymentOptions?.allowPartial && totalGroundFee > 0;
  const partialAmount = allowHalf ? (paymentOptions?.partialAmount || totalGroundFee / 2) : totalGroundFee;
  const isPayAtGround = paymentMethod === 'pay_at_ground';
  const amountToPayNow = isPayAtGround ? 0 : (selectedPaymentOption === 'full' ? totalGroundFee : partialAmount);
  const balanceDue = Math.max(0, totalGroundFee - amountToPayNow);

  // Paying at the ground skips straight to registration. UPI / card /
  // netbanking open the checkout — but only once the server has said the entry
  // would be accepted, so nobody pays for a registration that was always going
  // to be refused.
  const handlePayAndRegister = async () => {
    if (isProcessingPayment || !tournament) return;
    setIsProcessingPayment(true);
    setPaymentStage('checking');

    try {
      await api.post(`/teams/public/registration/${token}/validate`, payload());
    } catch (err) {
      setIsProcessingPayment(false);
      setPaymentStage('idle');
      showRejection(err);
      return;
    }

    if (!isOnlineMethod(paymentMethod)) {
      await submitRegistration();
      return;
    }

    try {
      const order: RazorpayOrder = await api.post(`/teams/public/registration/${token}/payment-order`, {
        payment_option: selectedPaymentOption,
        method: paymentMethod,
      });

      if (!order.configured) {
        await submitRegistration();
        return;
      }

      setPaymentStage('verifying');
      const verified = await openCheckout({
        order,
        method: paymentMethod,
        name: tournament.name,
        description: `Ground fee — ${teamName}`,
        prefill: { name: managerName, contact: managerPhone, email: managerEmail },
      });

      const withAmount: PaidWith = { ...verified, amount: amountToPayNow };
      // Saved before submitting: if this tab dies now, the payment survives.
      setPaidWith(withAmount);
      saveDraft({ ...snapshot, paidWith: withAmount });

      setPaymentStage('success');
      await submitRegistration(withAmount);
    } catch (err: any) {
      toast.error(err.message || 'Payment could not be completed');
      setPaymentStage('idle');
      setIsProcessingPayment(false);
    }
  };

  const retryWithSavedPayment = () => {
    if (!paidWith || isProcessingPayment) return;
    setPaymentStage('success');
    submitRegistration(paidWith);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4" role="status">
        <div className="flex items-center gap-3 text-emerald-400">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="font-semibold text-base">{t('reg.loading')}</span>
        </div>
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-center">
        <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mb-4 text-xl" aria-hidden="true">⚠️</div>
        <h1 className="text-xl font-bold text-white mb-2">{t('reg.inactive.title')}</h1>
        <p className="text-base text-slate-400 mb-6 max-w-sm">{error || t('reg.inactive.body')}</p>
        <Link to="/" className="px-5 py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold">
          {t('common.home')}
        </Link>
      </div>
    );
  }

  if (closedReason && outcome.kind === 'none' && !finished) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-center">
        <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mb-4 text-xl" aria-hidden="true">🔒</div>
        <h1 className="text-xl font-bold text-white mb-2">{t('reg.closed.title')}</h1>
        <p className="text-base text-slate-300 mb-1">{tournament.name}</p>
        <p className="text-base text-slate-400 mb-6 max-w-sm">{closedReason} {t('reg.closed.contact')}</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Link to={`/tournaments/${tournament.slug}`} className="px-5 py-3 rounded-xl bg-slate-800 text-white text-sm font-bold">
            {t('reg.viewTournament')}
          </Link>
          <Link to="/" className="px-5 py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold">
            {t('common.home')}
          </Link>
        </div>
      </div>
    );
  }

  const isFootball = tournament.sport_code === 'football';
  const availablePaymentMethods: PaymentMethod[] = tournament.payment_config?.enabled_methods?.length
    ? tournament.payment_config.enabled_methods
    : ALL_PAYMENT_METHODS;

  const steps = [
    { num: 1, label: t('reg.step.team') },
    { num: 2, label: t('reg.step.manager') },
    { num: 3, label: t('reg.step.squad') },
    { num: 4, label: t('reg.step.payment') },
    { num: 5, label: t('reg.step.receipt') },
  ];

  const receipt = completed?.receipt;
  const hasRowServerErrors = Object.keys(fields.errors).some(k => /^players\.\d+/.test(k));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/80 sticky top-0 z-30 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img src={tournament.logo} alt="" className="w-11 h-11 rounded-xl object-cover border border-slate-700 shrink-0" />
            <div className="min-w-0">
              <h1 className="text-base font-bold text-white font-heading truncate">{tournament.name}</h1>
              <span className="text-sm text-slate-400">{t('reg.portal')}</span>
            </div>
          </div>
          <span className="shrink-0 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-bold font-mono">
            {t('reg.fee', { amount: money(totalGroundFee) })}
          </span>
        </div>

        {/* Progress */}
        <div className="max-w-3xl mx-auto px-4 pb-3">
          <p className="sr-only" aria-live="polite">{t('reg.stepOf', { step: currentStep, total: steps.length })}</p>
          <ol className="grid grid-cols-5 gap-1.5 text-center text-xs font-bold">
            {steps.map(s => (
              <li key={s.num} className="flex flex-col items-center gap-1" aria-current={currentStep === s.num ? 'step' : undefined}>
                <div className={`w-full h-1.5 rounded-full transition-all ${
                  currentStep >= s.num ? 'bg-gradient-to-r from-emerald-500 to-teal-400' : 'bg-slate-800'
                }`} />
                {/* On a phone only the current step is named — five labels
                    squeezed into one row were all cut off. */}
                <span className={`truncate max-w-full ${currentStep === s.num ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {s.num}
                  <span className={currentStep === s.num ? '' : 'hidden sm:inline'}>. {s.label}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 pt-6 space-y-4">
        {/* Restored draft */}
        {draft.restored && !finished && outcome.kind === 'none' && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/30">
            <p className="flex items-start gap-2 text-base text-cyan-200">
              <Info className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
              {t('draft.restored')}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button type="button" onClick={startOver} className="min-h-11 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-semibold text-slate-200 inline-flex items-center gap-1.5">
                <RotateCcw className="w-4 h-4" aria-hidden="true" /> {t('draft.discard')}
              </button>
              <button type="button" onClick={draft.dismissRestored} className="min-h-11 px-4 rounded-xl text-sm font-semibold text-slate-400 hover:text-slate-200">
                {t('common.close')}
              </button>
            </div>
          </div>
        )}

        {/* Paid, but the registration didn't finish */}
        {outcome.kind === 'recover' && !finished && (
          <div role="alert" className="p-5 rounded-2xl bg-amber-500/10 border-2 border-amber-500/50 space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-bold text-amber-200">
              <AlertTriangle className="w-5 h-5" aria-hidden="true" /> {t('reg.recover.title')}
            </h2>
            <p className="text-base text-amber-100 leading-relaxed">
              {t('reg.recover.body', { amount: money(outcome.amount), ref: outcome.ref })}
            </p>
            <button type="button" onClick={retryWithSavedPayment} disabled={isProcessingPayment} className={primaryButton}>
              <RotateCcw className="w-5 h-5" aria-hidden="true" />
              {isProcessingPayment ? t('common.processing') : t('reg.recover.retry')}
            </button>
            <p className="text-sm text-amber-100">{t('reg.recover.help', { ref: outcome.ref })}</p>
          </div>
        )}

        {/* Paid, and the registration was refused */}
        {outcome.kind === 'refund' && (
          <div role="alert" className="p-5 rounded-2xl bg-rose-500/10 border-2 border-rose-500/50 space-y-2">
            <h2 className="flex items-center gap-2 text-lg font-bold text-rose-200">
              <AlertTriangle className="w-5 h-5" aria-hidden="true" /> {t('reg.refund.title')}
            </h2>
            <p className="text-base text-rose-100 leading-relaxed">{t('reg.refund.body', { ref: outcome.ref })}</p>
            <p className="font-code text-base text-white bg-slate-900 rounded-lg px-3 py-2 inline-block select-all">{outcome.ref}</p>
          </div>
        )}

        <div className="glass-panel rounded-3xl p-5 sm:p-8 border border-slate-800 shadow-2xl">
          {/* STEP 1: TEAM */}
          {currentStep === 1 && (
            <form
              className="space-y-5"
              onSubmit={e => {
                e.preventDefault();
                if (teamName.trim()) setCurrentStep(2);
              }}
            >
              <div className="border-b border-slate-800 pb-3">
                <h2 className="text-xl font-bold text-white font-heading">{t('reg.team.title')}</h2>
                <p className="text-base text-slate-400">{t('reg.team.subtitle')}</p>
              </div>

              <div>
                <label htmlFor="team-name" className={labelClass}>
                  {t('reg.team.name')} <span className="text-rose-400" aria-hidden="true">*</span>
                </label>
                <input
                  id="team-name"
                  type="text"
                  autoComplete="organization"
                  placeholder={t('reg.team.namePlaceholder')}
                  value={teamName}
                  onChange={e => { setTeamName(e.target.value); fields.clear('team_name'); }}
                  required
                  className={`${inputClass} font-semibold`}
                  {...fields.inputProps('team_name')}
                />
                <FieldError id={fieldErrorId('team_name')} message={fields.get('team_name')} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="team-short" className={labelClass}>{t('reg.team.short')}</label>
                  <input
                    id="team-short"
                    type="text"
                    placeholder="MBFC"
                    maxLength={5}
                    value={shortName}
                    onChange={e => setShortName(e.target.value.toUpperCase())}
                    aria-describedby="team-short-hint"
                    className={`${inputClass} uppercase font-mono`}
                  />
                  <p id="team-short-hint" className={hintClass}>{t('reg.team.shortHint')}</p>
                </div>

                <div>
                  <label htmlFor="team-jersey" className={labelClass}>{t('reg.team.jersey')}</label>
                  <div className="flex items-center gap-3">
                    <input
                      id="team-jersey"
                      type="color"
                      value={jerseyColor}
                      onChange={e => setJerseyColor(e.target.value)}
                      className="w-12 h-12 rounded-xl bg-transparent border border-slate-700 cursor-pointer p-0.5"
                    />
                    <span className="text-base font-mono text-slate-300 uppercase">{jerseyColor}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="team-village" className={labelClass}>{t('reg.team.village')}</label>
                  <input id="team-village" type="text" placeholder="Nilambur" value={village} onChange={e => setVillage(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="team-panchayat" className={labelClass}>{t('reg.team.panchayat')}</label>
                  <input id="team-panchayat" type="text" placeholder="Nilambur Grama" value={panchayat} onChange={e => setPanchayat(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="team-district" className={labelClass}>{t('reg.team.district')}</label>
                  <input id="team-district" type="text" autoComplete="address-level2" placeholder="Malappuram" value={district} onChange={e => setDistrict(e.target.value)} className={inputClass} />
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <button type="submit" disabled={!teamName.trim()} className={primaryButton}>
                  <span>{t('reg.team.next')}</span>
                  <ArrowRight className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>
            </form>
          )}

          {/* STEP 2: MANAGER */}
          {currentStep === 2 && (
            <form
              className="space-y-5"
              onSubmit={e => {
                e.preventDefault();
                if (managerName.trim() && managerPhone.trim()) setCurrentStep(3);
              }}
            >
              <div className="border-b border-slate-800 pb-3">
                <h2 className="text-xl font-bold text-white font-heading">{t('reg.manager.title')}</h2>
                <p className="text-base text-slate-400">{t('reg.manager.subtitle')}</p>
              </div>

              <div>
                <label htmlFor="manager-name" className={labelClass}>
                  {t('reg.manager.name')} <span className="text-rose-400" aria-hidden="true">*</span>
                </label>
                <input
                  id="manager-name"
                  type="text"
                  autoComplete="name"
                  placeholder="Faisal Mohammed"
                  value={managerName}
                  onChange={e => { setManagerName(e.target.value); fields.clear('manager_name'); }}
                  required
                  className={`${inputClass} font-semibold`}
                  {...fields.inputProps('manager_name')}
                />
                <FieldError id={fieldErrorId('manager_name')} message={fields.get('manager_name')} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="manager-phone" className={labelClass}>
                    {t('reg.manager.phone')} <span className="text-rose-400" aria-hidden="true">*</span>
                  </label>
                  <PhoneInput
                    id="manager-phone"
                    autoComplete="tel-national"
                    placeholder="97455 11223"
                    value={managerPhone}
                    onChange={value => { setManagerPhone(value); fields.clear('manager_phone'); }}
                    required
                    invalid={!!fields.get('manager_phone')}
                    describedBy={fields.get('manager_phone') ? fieldErrorId('manager_phone') : undefined}
                    className="w-full px-4 py-3 rounded-xl glass-input text-base font-mono"
                  />
                  <FieldError id={fieldErrorId('manager_phone')} message={fields.get('manager_phone')} />
                </div>
                <div>
                  <label htmlFor="manager-whatsapp" className={labelClass}>{t('reg.manager.whatsapp')}</label>
                  <PhoneInput
                    id="manager-whatsapp"
                    placeholder="97455 11223"
                    value={managerWhatsapp}
                    onChange={setManagerWhatsapp}
                    describedBy="manager-whatsapp-hint"
                    className="w-full px-4 py-3 rounded-xl glass-input text-base font-mono"
                  />
                  <p id="manager-whatsapp-hint" className={hintClass}>{t('reg.manager.whatsappHint')}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="manager-email" className={labelClass}>
                    {t('reg.manager.email')} <span className="text-sm font-normal text-slate-500">({t('common.optional')})</span>
                  </label>
                  <input
                    id="manager-email"
                    type="email"
                    autoComplete="email"
                    placeholder="manager@example.com"
                    value={managerEmail}
                    onChange={e => { setManagerEmail(e.target.value); fields.clear('manager_email'); }}
                    className={inputClass}
                    {...fields.inputProps('manager_email')}
                  />
                  <FieldError id={fieldErrorId('manager_email')} message={fields.get('manager_email')} />
                </div>
                <div>
                  <label htmlFor="manager-address" className={labelClass}>
                    {t('reg.manager.address')} <span className="text-sm font-normal text-slate-500">({t('common.optional')})</span>
                  </label>
                  <input id="manager-address" type="text" autoComplete="street-address" placeholder="Kacherippadi, Manjeri" value={managerAddress} onChange={e => setManagerAddress(e.target.value)} className={inputClass} />
                </div>
              </div>

              <div className="pt-4 flex items-center justify-between gap-3">
                <button type="button" onClick={() => setCurrentStep(1)} className={secondaryButton}>
                  <ArrowLeft className="w-5 h-5" aria-hidden="true" />
                  <span>{t('common.back')}</span>
                </button>
                <button type="submit" disabled={!managerName.trim() || !managerPhone.trim()} className={primaryButton}>
                  <span>{t('reg.manager.next')}</span>
                  <ArrowRight className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>
            </form>
          )}

          {/* STEP 3: SQUAD */}
          {currentStep === 3 && (
            <div className="space-y-5">
              <div className="border-b border-slate-800 pb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-white font-heading">{t('reg.squad.title')}</h2>
                  <p className="text-base text-slate-400">
                    {t('reg.squad.limits', { min: minPlayers, max: maxPlayers })} · {t('reg.squad.count', { count: players.length })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddPlayer}
                  disabled={players.length >= maxPlayers}
                  className="min-h-11 px-4 rounded-xl bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-40"
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  <span>{t('reg.squad.add')}</span>
                </button>
              </div>

              {squadSummaryError && <FieldError message={squadSummaryError} />}
              {fields.get('players') && !hasRowServerErrors && <FieldError message={fields.get('players')} />}

              <ol className="space-y-3">
                {players.map((player, idx) => {
                  const n = idx + 1;
                  const rowError = squadErrors[idx] ?? fields.get(`players.${idx}`);
                  const errorId = `player-error-${idx}`;
                  return (
                    <li
                      key={idx}
                      id={`player-row-${idx}`}
                      className={`p-3 sm:p-4 rounded-2xl bg-slate-950/80 border ${rowError ? 'border-rose-500/60' : 'border-slate-800'}`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span className="text-sm font-bold text-slate-300">{t('reg.squad.player', { n })}</span>
                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer min-h-11">
                            <input
                              type="radio"
                              name="captain"
                              checked={player.is_captain}
                              onChange={() => handlePlayerChange(idx, 'is_captain', true)}
                            />
                            <span className={player.is_captain ? 'font-bold text-amber-400' : ''}>{t('reg.squad.captain')}</span>
                          </label>
                          {players.length > minPlayers && (
                            <button
                              type="button"
                              onClick={() => handleRemovePlayer(idx)}
                              aria-label={t('reg.squad.remove', { n })}
                              className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-900 transition-colors"
                            >
                              <Trash2 className="w-5 h-5" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-[auto_5.5rem_1fr] sm:grid-cols-[auto_5.5rem_1fr_12rem] gap-3 items-end">
                        <button
                          type="button"
                          onClick={() => setPhotoUploadIndex(idx)}
                          aria-label={t('reg.squad.photo', { n })}
                          className="relative group w-12 h-12 rounded-full overflow-hidden shrink-0 border border-slate-700"
                        >
                          {player.photo ? (
                            <img src={player.photo} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className={`w-full h-full flex items-center justify-center text-sm font-bold ${AVATAR_COLORS[idx % AVATAR_COLORS.length]}`}>
                              {getInitials(player.full_name || `P${n}`)}
                            </span>
                          )}
                          <span className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity flex items-center justify-center">
                            <Camera className="w-4 h-4 text-white" aria-hidden="true" />
                          </span>
                        </button>

                        <div>
                          <label htmlFor={`player-jersey-${idx}`} className="block text-xs font-semibold text-slate-400 mb-1">{t('reg.squad.jersey')}</label>
                          <input
                            id={`player-jersey-${idx}`}
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={99}
                            value={player.jersey_number}
                            onChange={e => handlePlayerChange(idx, 'jersey_number', e.target.value)}
                            aria-invalid={rowError ? true : undefined}
                            aria-describedby={rowError ? errorId : undefined}
                            className="w-full px-2 py-2.5 rounded-lg glass-input text-center font-mono font-bold text-base"
                          />
                        </div>

                        <div className="min-w-0">
                          <label htmlFor={`player-name-${idx}`} className="block text-xs font-semibold text-slate-400 mb-1">{t('reg.squad.name')}</label>
                          <input
                            id={`player-name-${idx}`}
                            type="text"
                            autoComplete="off"
                            value={player.full_name}
                            onChange={e => handlePlayerChange(idx, 'full_name', e.target.value)}
                            aria-invalid={rowError ? true : undefined}
                            aria-describedby={rowError ? errorId : undefined}
                            className="w-full px-3 py-2.5 rounded-lg glass-input text-base font-semibold"
                          />
                        </div>

                        <div className="col-span-3 sm:col-span-1">
                          <label htmlFor={`player-role-${idx}`} className="block text-xs font-semibold text-slate-400 mb-1">
                            {isFootball ? t('reg.squad.position') : t('reg.squad.role')}
                          </label>
                          <select
                            id={`player-role-${idx}`}
                            value={isFootball ? player.football_position : player.cricket_role}
                            onChange={e => handlePlayerChange(idx, isFootball ? 'football_position' : 'cricket_role', e.target.value)}
                            className="w-full px-3 py-2.5 rounded-lg glass-input text-base"
                          >
                            {(isFootball ? FOOTBALL_POSITIONS : CRICKET_ROLES).map(option => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <FieldError id={errorId} message={rowError} />
                    </li>
                  );
                })}
              </ol>

              <div className="pt-4 flex items-center justify-between gap-3">
                <button type="button" onClick={() => setCurrentStep(2)} className={secondaryButton}>
                  <ArrowLeft className="w-5 h-5" aria-hidden="true" />
                  <span>{t('common.back')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => { if (validatePlayers()) setCurrentStep(4); }}
                  className={primaryButton}
                >
                  <span>{t('reg.squad.next')}</span>
                  <ArrowRight className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: PAYMENT */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div className="border-b border-slate-800 pb-3">
                <h2 className="text-xl font-bold text-white font-heading">{t('reg.pay.title')}</h2>
                <p className="text-base text-slate-400">{allowHalf ? t('reg.pay.subtitleHalf') : t('reg.pay.subtitle')}</p>
              </div>

              <dl className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-base space-y-2">
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-400">{t('reg.pay.tournament')}</dt>
                  <dd className="font-semibold text-white text-right">{tournament.name}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-400">{t('reg.pay.team')}</dt>
                  <dd className="font-bold text-emerald-400 text-right">{teamName} · {t('reg.squad.count', { count: players.length })}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-400">{t('reg.pay.totalFee')}</dt>
                  <dd className="font-mono font-bold text-white">{money(totalGroundFee)}</dd>
                </div>
              </dl>

              <fieldset>
                <legend className="text-base font-bold text-slate-200 mb-3">{t('reg.pay.method')}</legend>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {availablePaymentMethods.map(id => {
                    const info = PAYMENT_METHOD_META[id];
                    const Icon = info.icon;
                    const selected = paymentMethod === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setPaymentMethod(id)}
                        className={`min-h-24 p-3 rounded-2xl border-2 text-center text-sm font-semibold flex flex-col items-center justify-center gap-1.5 transition-all ${
                          selected
                            ? 'bg-slate-800 border-emerald-500 text-emerald-300'
                            : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <Icon className="w-6 h-6" aria-hidden="true" />
                        <span>{info.label}</span>
                        <span className="text-xs font-normal text-slate-400">{info.blurb}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              {!isPayAtGround && (
                <fieldset>
                  <legend className="text-base font-bold text-slate-200 mb-3">{t('reg.pay.option')}</legend>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      aria-pressed={selectedPaymentOption === 'full'}
                      onClick={() => setSelectedPaymentOption('full')}
                      className={`p-4 rounded-2xl border-2 text-left transition-all ${
                        selectedPaymentOption === 'full'
                          ? 'bg-emerald-500/15 border-emerald-500 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <span className="flex items-center justify-between mb-1.5">
                        <span className="font-bold text-base">{t('reg.pay.full')}</span>
                        <span className="font-mono text-lg font-black text-emerald-400">{money(totalGroundFee)}</span>
                      </span>
                      <span className="block text-sm text-slate-400">{t('reg.pay.fullHint')}</span>
                    </button>

                    {allowHalf && (
                      <button
                        type="button"
                        aria-pressed={selectedPaymentOption === 'partial'}
                        onClick={() => setSelectedPaymentOption('partial')}
                        className={`p-4 rounded-2xl border-2 text-left transition-all ${
                          selectedPaymentOption === 'partial'
                            ? 'bg-amber-500/15 border-amber-500 text-white'
                            : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <span className="flex items-center justify-between mb-1.5">
                          <span className="font-bold text-base">{t('reg.pay.half')}</span>
                          <span className="font-mono text-lg font-black text-amber-400">{money(partialAmount)}</span>
                        </span>
                        <span className="block text-sm text-slate-400">
                          {t('reg.pay.halfHint', { now: money(partialAmount), later: money(totalGroundFee - partialAmount) })}
                        </span>
                      </button>
                    )}
                  </div>
                </fieldset>
              )}

              {isPayAtGround && (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-base">
                  {t('reg.pay.atGround', { amount: money(totalGroundFee) })}
                </div>
              )}

              <div className="p-4 rounded-2xl bg-slate-900 border-2 border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="text-sm text-slate-400">{t('reg.pay.dueNow')}</div>
                  <div className="text-3xl font-black text-emerald-400 font-mono">{money(amountToPayNow)}</div>
                  {balanceDue > 0 && <div className="text-sm text-amber-400">{t('reg.pay.balance', { amount: money(balanceDue) })}</div>}
                </div>

                <button
                  type="button"
                  disabled={isProcessingPayment || paymentStage !== 'idle' || outcome.kind === 'recover'}
                  onClick={handlePayAndRegister}
                  className="min-h-14 px-7 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-base shadow-xl shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                >
                  <ShieldCheck className="w-5 h-5" aria-hidden="true" />
                  <span>
                    {paymentStage === 'checking'
                      ? t('reg.pay.checking')
                      : isProcessingPayment || paymentStage !== 'idle'
                        ? t('common.processing')
                        : isPayAtGround
                          ? t('reg.pay.registerAtGround')
                          : t('reg.pay.payAndRegister', { amount: money(amountToPayNow) })}
                  </span>
                </button>
              </div>

              <div className="flex justify-start">
                <button type="button" onClick={() => setCurrentStep(3)} className={secondaryButton}>
                  <ArrowLeft className="w-5 h-5" aria-hidden="true" />
                  <span>{t('reg.pay.backToSquad')}</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: RECEIPT */}
          {currentStep === 5 && receipt && (
            <div className="space-y-6 text-center py-2">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" aria-hidden="true" />
              </div>

              <div>
                <h2 className="text-2xl font-black text-white font-heading">{t('reg.done.title')}</h2>
                <p className="text-base text-slate-300 mt-1">
                  {completed?.replayed
                    ? t('reg.done.alreadyBody', { team: teamName })
                    : t('reg.done.body', { team: teamName, tournament: tournament.name })}
                </p>
              </div>

              <dl className="p-5 rounded-2xl bg-slate-950 border border-slate-800 max-w-md mx-auto text-left text-base space-y-2.5">
                <div className="flex justify-between gap-3 border-b border-slate-800 pb-2">
                  <dt className="text-slate-400">{t('reg.done.receiptNo')}</dt>
                  <dd className="font-code font-bold text-white">{receipt.receipt_number}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-400">{t('reg.done.totalFee')}</dt>
                  <dd className="font-mono text-slate-200">{money(receipt.receipt_data.total_fee)}</dd>
                </div>
                <div className="flex justify-between gap-3 text-emerald-400 font-bold">
                  <dt>{t('reg.done.paid')}</dt>
                  <dd className="font-mono">{money(receipt.receipt_data.paid_amount)}</dd>
                </div>
                <div className="flex justify-between gap-3 text-amber-400 font-bold border-t border-slate-800 pt-2">
                  <dt>{t('reg.done.balance')}</dt>
                  <dd className="font-mono">{money(receipt.receipt_data.remaining_balance)}</dd>
                </div>
              </dl>

              {completed && completed.players.length > 0 && (
                <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 max-w-md mx-auto text-left space-y-3">
                  <div>
                    <h3 className="text-base font-bold text-white">{t('reg.done.codes')}</h3>
                    <p className="text-sm text-slate-400 mt-0.5">{t('reg.done.codesHint')}</p>
                  </div>
                  <ul className="divide-y divide-slate-800/70">
                    {completed.players.map(p => (
                      <li key={p.id} className="py-2 flex items-center justify-between gap-3 text-base">
                        <span className="text-slate-200 truncate">
                          <span className="font-mono text-slate-500 mr-2">#{p.jersey_number}</span>
                          {p.full_name}
                        </span>
                        <PlayerCodeBadge code={p.player_code} size="sm" />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-center gap-3">
                <button type="button" onClick={() => setShowReceiptModal(true)} className={primaryButton}>
                  <Download className="w-5 h-5" aria-hidden="true" />
                  <span>{t('reg.done.download')}</span>
                </button>

                {isManagerAccount && (
                  <Link to="/team/dashboard" className={secondaryButton}>{t('reg.done.myTeam')}</Link>
                )}

                <Link to={`/tournaments/${tournament.slug}`} className={secondaryButton}>
                  {t('reg.done.hub')} ↗
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {photoUploadIndex !== null && (
        <ImageUploadModal
          isOpen={photoUploadIndex !== null}
          onClose={() => setPhotoUploadIndex(null)}
          onSuccess={url => {
            handlePlayerChange(photoUploadIndex, 'photo', url);
            setPhotoUploadIndex(null);
          }}
          title={t('reg.photo.title')}
          subtitle={t('reg.photo.subtitle')}
          currentImage={players[photoUploadIndex]?.photo}
          folder="players"
          aspectRatio="square"
        />
      )}

      {showReceiptModal && receipt && (
        <ReceiptModal receipt={receipt} onClose={() => setShowReceiptModal(false)} />
      )}

      {/* While the checkout runs, and while the paid registration is submitted. */}
      {(paymentStage === 'verifying' || paymentStage === 'success') && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-950/95 backdrop-blur-md p-4" role="alertdialog" aria-live="assertive">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-8 text-center space-y-5">
            {paymentStage === 'success' ? (
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" aria-hidden="true" />
              </div>
            ) : (
              <div className="w-16 h-16 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center mx-auto relative">
                {(() => {
                  const Icon = PAYMENT_METHOD_META[paymentMethod].icon;
                  return <Icon className="w-7 h-7 text-emerald-400" aria-hidden="true" />;
                })()}
                <div className="absolute inset-0 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
              </div>
            )}

            <div>
              <h3 className="text-lg font-bold text-white font-heading">
                {paymentStage === 'verifying' ? t('reg.pay.verifying') : t('reg.pay.confirmed')}
              </h3>
              <p className="text-base text-slate-300 mt-1.5">
                {paymentStage === 'success'
                  ? t('reg.pay.confirmedBody', { amount: money(paidWith?.amount ?? amountToPayNow) })
                  : t('reg.pay.verifyingBody', { amount: money(amountToPayNow), method: PAYMENT_METHOD_META[paymentMethod].label })}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

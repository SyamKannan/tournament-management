import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { AuthShowcase } from '../../components/AuthShowcase';
import { SPORTS_CAROUSELS } from '../../lib/sportsImagery';
import { PhoneInput } from '../../components/PhoneInput';
import {
  AuthLayout, AuthHeader, AuthCard, AuthAlert, AuthField, AuthSubmit, AuthFooter,
} from '../../components/auth/AuthUI';
import { KeyRound, MessageSquare, ArrowLeft } from 'lucide-react';
import { roleHome } from '../../lib/roleHome';

/**
 * Getting back into an account, by a code sent to the phone.
 *
 * A phone number rather than an email, because most of the people who use this —
 * team managers, scorers, players — registered with a number and may have no
 * email at all. Two steps on one page: ask for the code, then type it with the
 * new password, so nobody has to find their way back from an SMS to a browser.
 */
export const ForgotPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const { adoptToken, refreshProfile } = useAuth();

  const [step, setStep] = useState<'ask' | 'confirm'>('ask');
  const [identifier, setIdentifier] = useState('');
  const [usePhone, setUsePhone] = useState(true);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const askForCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) {
      setError('Enter the phone number or email you signed up with.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await api.post('/auth/forgot-password', { identifier });
      // The server deliberately does not say whether the account exists, so
      // neither does this screen.
      setNotice(res?.message || 'If that account exists, a code is on its way.');
      setStep('confirm');
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429
          ? 'Too many attempts. Wait a few minutes and try again.'
          : err instanceof ApiError ? err.message : 'Could not send a code right now.'
      );
    } finally {
      setBusy(false);
    }
  };

  const submitNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('The two passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Use at least six characters.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await api.post('/auth/reset-password', { identifier, code, password });

      // Signed straight in: the server hands back a token that already carries
      // the new session version.
      if (res?.token) {
        adoptToken(res.token);
        await refreshProfile();
        navigate(roleHome(res.user?.role), { replace: true });
        return;
      }

      navigate('/login', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reset your password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      accent="cyan"
      showcase={
        <AuthShowcase
          images={SPORTS_CAROUSELS.login}
          eyebrow="Account recovery"
          title={<>Locked out? <span className="text-cyan-400">Back in a minute.</span></>}
          description="We text a six-digit code to the number on your account. No email needed."
          stats={['clubs', 'tournaments', 'matches_played']}
          accent="cyan"
        />
      }
    >
      <AuthHeader
        accent="cyan"
        icon={KeyRound}
        eyebrow="Account recovery"
        title={step === 'ask' ? 'Forgotten your password?' : 'Enter the code we sent'}
        subtitle={
          step === 'ask'
            ? 'We will text a six-digit code to the number on your account.'
            : 'The code lasts fifteen minutes. Then choose a new password.'
        }
      />

      <AuthCard>
        <AuthAlert message={error} />

        {notice && step === 'confirm' && (
          <div className="mb-4 p-3 rounded-xl bg-cyan-500/10 ring-1 ring-cyan-500/20 text-xs text-cyan-200 flex items-start gap-2">
            <MessageSquare className="w-4 h-4 shrink-0 mt-px" />
            <span>{notice}</span>
          </div>
        )}

        {step === 'ask' ? (
          <form onSubmit={askForCode} className="space-y-4">
            <div className="flex gap-1.5 text-[11px] font-bold">
              {([true, false] as const).map(phoneMode => (
                <button
                  key={String(phoneMode)}
                  type="button"
                  onClick={() => { setUsePhone(phoneMode); setIdentifier(''); }}
                  className={`px-3 py-1.5 rounded-xl ring-1 transition-colors ${
                    usePhone === phoneMode
                      ? 'bg-cyan-500/20 ring-cyan-500/40 text-cyan-200'
                      : 'bg-white/[0.03] ring-white/5 text-slate-400 hover:text-white'
                  }`}
                >
                  {phoneMode ? 'Phone number' : 'Email'}
                </button>
              ))}
            </div>

            {usePhone ? (
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Phone number on your account
                </label>
                <PhoneInput value={identifier} onChange={setIdentifier} />
              </div>
            ) : (
              <AuthField htmlFor="recover-email" label="Email on your account">
                <input
                  id="recover-email"
                  type="email"
                  autoComplete="email"
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input"
                />
              </AuthField>
            )}

            <div className="pt-2">
              <AuthSubmit accent="cyan" loading={busy}>Send me a code</AuthSubmit>
            </div>
          </form>
        ) : (
          <form onSubmit={submitNewPassword} className="space-y-4">
            <AuthField htmlFor="recover-code" label="Six-digit code">
              <input
                id="recover-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="w-full px-3.5 py-2.5 rounded-xl glass-input tracking-[0.4em] text-center font-bold"
              />
            </AuthField>

            <AuthField htmlFor="recover-password" label="New password">
              <input
                id="recover-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                minLength={6}
                className="w-full px-3.5 py-2.5 rounded-xl glass-input"
              />
            </AuthField>

            <AuthField htmlFor="recover-confirm" label="Repeat the new password">
              <input
                id="recover-confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                minLength={6}
                className="w-full px-3.5 py-2.5 rounded-xl glass-input"
              />
            </AuthField>

            <p className="text-[11px] text-slate-500">
              Resetting signs you out everywhere else, in case somebody else knows your old password.
            </p>

            <div className="pt-2 space-y-2">
              <AuthSubmit accent="cyan" loading={busy}>Set new password</AuthSubmit>
              <button
                type="button"
                onClick={() => { setStep('ask'); setCode(''); setError(null); }}
                className="w-full text-[11px] font-semibold text-slate-400 hover:text-white flex items-center justify-center gap-1.5"
              >
                <ArrowLeft className="w-3 h-3" />
                Use a different number
              </button>
            </div>
          </form>
        )}
      </AuthCard>

      <AuthFooter
        links={[
          { prompt: 'Remembered it?', to: '/login', label: 'Back to sign in' },
        ]}
      />
    </AuthLayout>
  );
};

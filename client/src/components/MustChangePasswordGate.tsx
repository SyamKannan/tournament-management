import React, { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from './ui/Toast';
import { FieldError, fieldErrorId, useFieldErrors } from './ui/FieldError';
import { useT } from '../i18n';

/**
 * Stops everything until an account with a handed-over password chooses its own.
 *
 * Onboarding and an admin reset both give someone a password that another
 * person knows. `must_change_password` is set on those accounts, and until it
 * is cleared this sits over the whole app — a password shared over the phone
 * should not quietly become permanent.
 */
export const MustChangePasswordGate: React.FC = () => {
  const { user, isImpersonating, adoptToken, refreshProfile, logout } = useAuth();
  const toast = useToast();
  const t = useT();
  const fields = useFieldErrors();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmNext, setConfirmNext] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // An admin looking through someone's account must not be made to set that
  // person's password.
  if (!user?.must_change_password || isImpersonating) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;

    if (next.length < 6) return setLocalError(t('auth.mustChange.tooShort'));
    if (next !== confirmNext) return setLocalError(t('auth.mustChange.mismatch'));
    if (next === current) return setLocalError(t('auth.mustChange.same'));
    setLocalError(null);

    setSaving(true);
    try {
      const res: { token?: string } = await api.put('/auth/me', {
        current_password: current,
        new_password: next,
      });
      // A password change ends every other session and issues this tab a new
      // token; without adopting it the next request would sign them out.
      if (res.token) adoptToken(res.token);
      await refreshProfile();
      toast.success(t('auth.mustChange.done'));
    } catch (err) {
      if (!fields.capture(err)) {
        setLocalError(err instanceof Error ? err.message : 'Could not change the password');
      }
    } finally {
      setSaving(false);
    }
  };

  const input = 'w-full px-4 py-3 rounded-xl glass-input text-base';

  return (
    <div
      className="fixed inset-0 z-[3000] bg-slate-950/95 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="must-change-title"
    >
      <form onSubmit={submit} className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-6 sm:p-8 space-y-5">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-500/15 text-amber-400 grid place-items-center shrink-0">
            <KeyRound className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h2 id="must-change-title" className="text-xl font-bold text-white font-heading">{t('auth.mustChange.title')}</h2>
            <p className="text-base text-slate-400 mt-1">{t('auth.mustChange.body')}</p>
          </div>
        </div>

        <div>
          <label htmlFor="mc-current" className="block text-sm font-semibold text-slate-200 mb-1.5">{t('auth.mustChange.current')}</label>
          <input
            id="mc-current"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={e => { setCurrent(e.target.value); fields.clear('current_password'); }}
            required
            className={input}
            {...fields.inputProps('current_password')}
          />
          <FieldError id={fieldErrorId('current_password')} message={fields.get('current_password')} />
        </div>

        <div>
          <label htmlFor="mc-new" className="block text-sm font-semibold text-slate-200 mb-1.5">{t('auth.mustChange.new')}</label>
          <input
            id="mc-new"
            type="password"
            autoComplete="new-password"
            minLength={6}
            value={next}
            onChange={e => { setNext(e.target.value); fields.clear('new_password'); }}
            required
            className={input}
            {...fields.inputProps('new_password')}
          />
          <FieldError id={fieldErrorId('new_password')} message={fields.get('new_password')} />
        </div>

        <div>
          <label htmlFor="mc-confirm" className="block text-sm font-semibold text-slate-200 mb-1.5">{t('auth.mustChange.confirm')}</label>
          <input
            id="mc-confirm"
            type="password"
            autoComplete="new-password"
            value={confirmNext}
            onChange={e => setConfirmNext(e.target.value)}
            required
            className={input}
          />
        </div>

        <FieldError message={localError} />

        <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-between">
          <button type="button" onClick={logout} className="min-h-12 px-5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-base font-semibold text-slate-200">
            {t('auth.mustChange.signOut')}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="min-h-12 px-6 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-base disabled:opacity-50"
          >
            {saving ? t('common.saving') : t('auth.mustChange.submit')}
          </button>
        </div>
      </form>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../ui/Toast';
import { FieldError } from '../ui/FieldError';
import { useSingleFlight } from '../../lib/useSingleFlight';
import { useT } from '../../i18n';
import { LEGAL_PATHS, TERMS_REQUIRED_EVENT, type LegalDocument, type LegalType } from '../../lib/legal';
import { LegalMarkdown } from './LegalMarkdown';

/**
 * Stops everything until the signed-in account has accepted the current Terms
 * & Conditions and Privacy Policy.
 *
 * Shown when sign-in says so (`legal_pending`), and when the server refuses a
 * request with TERMS_NOT_ACCEPTED — new terms published while someone was
 * already working. The server enforces it either way; this is what lets the
 * person actually do something about it.
 */
export const TermsGate: React.FC = () => {
  const { user, isImpersonating, refreshProfile, logout } = useAuth();
  const toast = useToast();
  const t = useT();
  const flight = useSingleFlight();
  const [raised, setRaised] = useState<LegalType[] | null>(null);
  const [documents, setDocuments] = useState<LegalDocument[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onRequired = (event: Event) => {
      const pending = (event as CustomEvent<{ pending: LegalType[] }>).detail?.pending;
      setRaised(pending?.length ? pending : ['terms', 'privacy']);
    };
    window.addEventListener(TERMS_REQUIRED_EVENT, onRequired);
    return () => window.removeEventListener(TERMS_REQUIRED_EVENT, onRequired);
  }, []);

  // A different account signing in starts from its own state.
  useEffect(() => { setRaised(null); setAgreed(false); }, [user?.id]);

  const pending = raised ?? user?.legal_pending ?? [];
  // The password gate goes first; an admin looking through an account can't accept for its owner.
  const active = !!user && !isImpersonating && !user.must_change_password && pending.length > 0;
  const pendingKey = pending.join(',');

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setDocuments(null);
    setLoadError(null);
    Promise.all(pendingKey.split(',').map(type => api.get<LegalDocument>(`/legal/${type}`)))
      .then(docs => { if (!cancelled) setDocuments(docs); })
      .catch(err => { if (!cancelled) setLoadError(err instanceof Error ? err.message : t('legal.gate.loadFailed')); });
    return () => { cancelled = true; };
  }, [active, pendingKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!active) return null;

  const accept = () => flight.run(async () => {
    if (!agreed) {
      setError(t('legal.gate.tickFirst'));
      return;
    }
    setError(null);
    try {
      await api.post('/auth/accept-terms', { accept: true });
      await refreshProfile();
      setRaised(null);
      toast.success(t('legal.gate.done'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('legal.gate.failed'));
    }
  });

  // Someone who accepted before is being asked again: say so, and what changed.
  const isUpdate = !!user?.legal_accepted_before;

  return (
    <div
      className="fixed inset-0 z-[3000] bg-slate-950/95 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="terms-gate-title"
    >
      <div className="w-full max-w-2xl rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-6 sm:p-8 space-y-5">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 text-emerald-400 grid place-items-center shrink-0">
            <ScrollText className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h2 id="terms-gate-title" className="text-xl font-bold text-white font-heading">
              {isUpdate ? t('legal.gate.titleUpdated') : t('legal.gate.title')}
            </h2>
            <p className="text-base text-slate-400 mt-1">{isUpdate ? t('legal.gate.bodyUpdated') : t('legal.gate.body')}</p>
          </div>
        </div>

        {loadError && <FieldError message={loadError} />}

        {!documents && !loadError && <p className="text-base text-slate-400">{t('common.loading')}</p>}

        {documents?.map(doc => (
          <section key={doc.type} className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-base font-bold text-white">{doc.title}</h3>
              <a href={LEGAL_PATHS[doc.type]} target="_blank" rel="noopener" className="text-sm font-semibold text-emerald-400 hover:text-emerald-300">
                {t('legal.gate.openFull')}
              </a>
            </div>
            {isUpdate && doc.summary_of_changes && (
              <p className="text-sm text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
                <strong className="font-semibold">{t('legal.gate.whatChanged')}</strong> {doc.summary_of_changes}
              </p>
            )}
            <div className="max-h-[32vh] overflow-y-auto rounded-2xl bg-slate-950 border border-slate-800 p-4" tabIndex={0}>
              <LegalMarkdown source={doc.body} className="text-sm" />
            </div>
          </section>
        ))}

        <label htmlFor="terms-gate-agree" className="flex items-start gap-3 cursor-pointer select-none">
          <input
            id="terms-gate-agree"
            type="checkbox"
            checked={agreed}
            onChange={e => { setAgreed(e.target.checked); setError(null); }}
            className="mt-0.5 w-5 h-5 shrink-0 rounded accent-emerald-500"
          />
          <span className="text-base text-slate-200">{t('legal.gate.agree')}</span>
        </label>

        <FieldError message={error} />

        <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-between">
          <button type="button" onClick={logout} className="min-h-12 px-5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-base font-semibold text-slate-200">
            {t('auth.mustChange.signOut')}
          </button>
          <button
            type="button"
            onClick={accept}
            disabled={flight.busy || !documents}
            className="min-h-12 px-6 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-base disabled:opacity-50"
          >
            {flight.busy ? t('common.saving') : t('legal.gate.accept')}
          </button>
        </div>
      </div>
    </div>
  );
};

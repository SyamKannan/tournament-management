import React, { useState } from 'react';
import { Check, Copy, KeyRound } from 'lucide-react';

interface Props {
  title: string;
  /** Who it is for: shown so the right person is phoned. */
  name: string;
  /** How they sign in — email or phone. */
  loginId?: string;
  password: string;
  onClose: () => void;
}

/**
 * A password issued on someone's behalf, shown exactly once.
 *
 * It is never stored in the clear and cannot be fetched again, so this says so
 * plainly — and says that the owner will be asked to choose their own at
 * sign-in, which is what makes reading it out over the phone acceptable.
 */
export const TemporaryPasswordDialog: React.FC<Props> = ({ title, name, loginId, password, onClose }) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const text = loginId ? `Login: ${loginId}\nTemporary password: ${password}` : password;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (http, old browser): the password is selectable.
    }
  };

  return (
    <div className="fixed inset-0 z-[2500] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="temp-pw-title">
      <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 text-emerald-400 grid place-items-center shrink-0">
            <KeyRound className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h2 id="temp-pw-title" className="text-lg font-bold text-white font-heading">{title}</h2>
            <p className="text-sm text-slate-400 mt-0.5">For <strong className="text-slate-200">{name}</strong></p>
          </div>
        </div>

        <dl className="space-y-3">
          {loginId && (
            <div>
              <dt className="text-xs font-bold uppercase tracking-wider text-slate-400">Signs in with</dt>
              <dd className="font-code text-base text-white break-all select-all">{loginId}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs font-bold uppercase tracking-wider text-slate-400">Temporary password</dt>
            <dd className="mt-1 flex items-center gap-2">
              <span className="flex-1 font-code text-2xl tracking-wider text-emerald-300 bg-slate-950 rounded-xl px-4 py-3 select-all break-all">
                {password}
              </span>
              <button
                type="button"
                onClick={copy}
                aria-label="Copy login details"
                className="min-h-12 min-w-12 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 grid place-items-center"
              >
                {copied ? <Check className="w-5 h-5 text-emerald-400" aria-hidden="true" /> : <Copy className="w-5 h-5" aria-hidden="true" />}
              </button>
            </dd>
          </div>
        </dl>

        <ul className="text-sm text-slate-300 space-y-1.5 list-disc pl-5">
          <li>This is the only time it is shown. Share it with them now.</li>
          <li>They will be asked to choose their own password when they sign in.</li>
          <li>Any device they were signed in on has been signed out.</li>
        </ul>

        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="min-h-12 px-6 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-base">
            I have shared it
          </button>
        </div>
      </div>
    </div>
  );
};

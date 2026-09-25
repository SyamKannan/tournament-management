import React from 'react';
import { useT } from '../../i18n';
import { FieldError } from '../ui/FieldError';

/**
 * "I agree to the Terms & Conditions and Privacy Policy", for every form that
 * creates an account or enters a team. The links open in a new tab so reading
 * them never loses what has been typed.
 */
export const TermsCheckbox: React.FC<{
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string | null;
}> = ({ id, checked, onChange, error }) => {
  const t = useT();
  const link = 'font-semibold text-emerald-400 hover:text-emerald-300 underline underline-offset-2';

  return (
    <div>
      <label htmlFor={id} className="flex items-start gap-3 cursor-pointer select-none">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="mt-0.5 w-5 h-5 shrink-0 rounded accent-emerald-500"
        />
        <span className="text-sm text-slate-300 leading-relaxed">
          {t('legal.agree.prefix')}{' '}
          <a href="/terms" target="_blank" rel="noopener" className={link}>{t('legal.terms')}</a>{' '}
          {t('legal.agree.and')}{' '}
          <a href="/privacy" target="_blank" rel="noopener" className={link}>{t('legal.privacy')}</a>
          {t('legal.agree.suffix')}
        </span>
      </label>
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
};

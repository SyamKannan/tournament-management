import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { LifeBuoy, CheckCircle2 } from 'lucide-react';
import { api, ApiError } from '../../services/api';
import { AuthShowcase } from '../../components/AuthShowcase';
import { SPORTS_CAROUSELS } from '../../lib/sportsImagery';
import { PhoneInput } from '../../components/PhoneInput';
import { FieldError, fieldErrorId, useFieldErrors } from '../../components/ui/FieldError';
import { useSingleFlight } from '../../lib/useSingleFlight';
import { AuthLayout, AuthHeader, AuthCard, AuthAlert, AuthField, AuthSubmit, AuthFooter } from '../../components/auth/AuthUI';

const CATEGORIES = [
  { value: 'account_access', label: "I can't sign in" },
  { value: 'billing', label: 'A payment or plan question' },
  { value: 'other', label: 'Something else' },
];

/**
 * For someone who cannot reach Help & Support because they cannot sign in —
 * usually an organizer who forgot a password on a deployment with no SMS.
 * The answer comes back on the number they give.
 */
export const ContactSupportPage: React.FC = () => {
  const fields = useFieldErrors();
  const { run, busy } = useSingleFlight();
  const [form, setForm] = useState({ name: '', phone: '', email: '', category: 'account_access', body: '', reference: '' });
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ reference: string; message: string } | null>(null);

  const update = (key: keyof typeof form, value: string) => {
    setForm(previous => ({ ...previous, [key]: value }));
    fields.clear(key);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    run(async () => {
      try {
        setSent(await api.post('/support/contact', form));
      } catch (err) {
        if (fields.capture(err)) return;
        setError(
          err instanceof ApiError && err.status === 429
            ? 'You have sent several messages already. Please wait for our reply.'
            : err instanceof ApiError ? err.message : 'Could not send your message right now.',
        );
      }
    });
  };

  return (
    <AuthLayout
      accent="cyan"
      showcase={
        <AuthShowcase
          images={SPORTS_CAROUSELS.login}
          eyebrow="Support"
          title={<>Stuck? <span className="text-cyan-400">Tell us.</span></>}
          description="A real person on the KickWick team reads every message."
          stats={['clubs', 'tournaments', 'matches_played']}
          accent="cyan"
        />
      }
    >
      <AuthHeader
        accent="cyan"
        icon={LifeBuoy}
        eyebrow="Support"
        title={sent ? 'Message sent' : 'Contact KickWick support'}
        subtitle={sent ? undefined : 'Signed in already? Club admins can use Help & Support in their workspace instead.'}
      />

      <AuthCard>
        {sent ? (
          <div className="space-y-4 text-center" role="status">
            <CheckCircle2 className="w-10 h-10 text-cyan-400 mx-auto" />
            <p className="text-sm text-slate-200">{sent.message}</p>
            <p className="text-xs text-slate-400">Keep your reference <span className="font-mono font-bold text-white">{sent.reference}</span> — quote it if you write again.</p>
            <Link to="/login" className="inline-block text-sm font-semibold text-cyan-300 hover:text-white">Back to sign in</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <AuthAlert message={error} />

            <AuthField htmlFor="contact-name" label="Your name">
              <input
                id="contact-name"
                autoComplete="name"
                value={form.name}
                onChange={e => update('name', e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl glass-input"
                {...fields.inputProps('name')}
              />
              <FieldError id={fieldErrorId('name')} message={fields.get('name')} />
            </AuthField>

            <div>
              <label htmlFor="contact-phone" className="block text-xs font-semibold text-slate-300 mb-1.5">
                Phone number — we reply here
              </label>
              <PhoneInput id="contact-phone" value={form.phone} onChange={value => update('phone', value)} invalid={Boolean(fields.get('phone'))} describedBy={fields.get('phone') ? fieldErrorId('phone') : undefined} />
              <FieldError id={fieldErrorId('phone')} message={fields.get('phone')} />
            </div>

            <AuthField htmlFor="contact-email" label="Email (optional)">
              <input
                id="contact-email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={e => update('email', e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl glass-input"
                {...fields.inputProps('email')}
              />
              <FieldError id={fieldErrorId('email')} message={fields.get('email')} />
            </AuthField>

            <AuthField htmlFor="contact-category" label="What do you need help with?">
              <select
                id="contact-category"
                value={form.category}
                onChange={e => update('category', e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl glass-input"
              >
                {CATEGORIES.map(category => <option key={category.value} value={category.value}>{category.label}</option>)}
              </select>
            </AuthField>

            <AuthField htmlFor="contact-body" label="Message">
              <textarea
                id="contact-body"
                rows={5}
                maxLength={3000}
                value={form.body}
                onChange={e => update('body', e.target.value)}
                placeholder="Which club or account is it, and what is going wrong?"
                className="w-full px-3.5 py-2.5 rounded-xl glass-input"
                {...fields.inputProps('body')}
              />
              <FieldError id={fieldErrorId('body')} message={fields.get('body')} />
            </AuthField>

            <AuthField htmlFor="contact-reference" label="Earlier reference (optional)">
              <input
                id="contact-reference"
                value={form.reference}
                onChange={e => update('reference', e.target.value)}
                placeholder="KW-1042"
                className="w-full px-3.5 py-2.5 rounded-xl glass-input font-mono"
              />
            </AuthField>

            <div className="pt-2">
              <AuthSubmit accent="cyan" loading={busy}>Send message</AuthSubmit>
            </div>
          </form>
        )}
      </AuthCard>

      <AuthFooter links={[{ prompt: 'Remembered it?', to: '/login', label: 'Back to sign in' }]} />
    </AuthLayout>
  );
};

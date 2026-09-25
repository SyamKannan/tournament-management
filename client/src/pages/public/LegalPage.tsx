import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ScrollText } from 'lucide-react';
import { api } from '../../services/api';
import { formatDate } from '../../lib/format';
import { LEGAL_PATHS, LEGAL_TITLES, type LegalDocument, type LegalType, type PublicLegalDocument } from '../../lib/legal';
import { LegalMarkdown } from '../../components/legal/LegalMarkdown';
import { SiteFooter } from '../../components/SiteFooter';
import { PageLoader } from '../../components/ui/SportsLoader';

/**
 * `/terms` and `/privacy`: the current version, with every earlier one a
 * click away (`?version=2`) — so anyone can read exactly what they agreed to.
 */
export const LegalPage: React.FC<{ type: LegalType }> = ({ type }) => {
  const [params] = useSearchParams();
  const requested = Number(params.get('version')) || null;
  const [current, setCurrent] = useState<PublicLegalDocument | null>(null);
  const [shown, setShown] = useState<LegalDocument | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api.get<PublicLegalDocument>(`/legal/${type}`)
      .then(async doc => {
        const version = requested && requested !== doc.version
          ? await api.get<LegalDocument>(`/legal/${type}/versions/${requested}`)
          : doc;
        if (!cancelled) { setCurrent(doc); setShown(version); }
      })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'This page could not be loaded.'); });
    return () => { cancelled = true; };
  }, [type, requested]);

  if (!shown && !error) return <PageLoader />;

  const other: LegalType = type === 'terms' ? 'privacy' : 'terms';
  const isOld = !!shown && !!current && shown.version !== current.version;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 text-emerald-400 grid place-items-center shrink-0">
            <ScrollText className="w-5 h-5" aria-hidden="true" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white font-heading">{shown?.title ?? LEGAL_TITLES[type]}</h1>
        </div>

        {error && <p className="mt-6 text-base text-slate-300">{error}</p>}

        {shown && (
          <>
            <p className="text-sm text-slate-400">
              Version {shown.version} · Effective {formatDate(shown.published_at)}
            </p>

            {isOld && (
              <p className="mt-4 text-sm text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
                You are reading an earlier version.{' '}
                <Link to={LEGAL_PATHS[type]} className="font-semibold underline underline-offset-2">Read the current version</Link>.
              </p>
            )}

            <LegalMarkdown source={shown.body} className="mt-8" />

            {current && current.versions.length > 1 && (
              <section className="mt-12 pt-6 border-t border-slate-800">
                <h2 className="text-base font-bold text-white mb-3">Version history</h2>
                <ul className="space-y-2 text-sm">
                  {current.versions.map(v => (
                    <li key={v.version} className="flex flex-wrap gap-x-3 gap-y-1">
                      <Link
                        to={v.version === current.version ? LEGAL_PATHS[type] : `${LEGAL_PATHS[type]}?version=${v.version}`}
                        className={`font-semibold ${v.version === shown.version ? 'text-white' : 'text-emerald-400 hover:text-emerald-300'}`}
                        aria-current={v.version === shown.version ? 'page' : undefined}
                      >
                        Version {v.version}
                      </Link>
                      <span className="text-slate-500">{formatDate(v.published_at)}</span>
                      {v.summary_of_changes && <span className="text-slate-400">{v.summary_of_changes}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        <p className="mt-10 text-sm text-slate-400">
          See also the <Link to={LEGAL_PATHS[other]} className="font-semibold text-emerald-400 hover:text-emerald-300">{LEGAL_TITLES[other]}</Link>.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
};

export const TermsPage: React.FC = () => <LegalPage type="terms" />;
export const PrivacyPage: React.FC = () => <LegalPage type="privacy" />;

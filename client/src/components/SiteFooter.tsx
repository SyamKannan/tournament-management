import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, MessageCircle, Phone, Trophy } from 'lucide-react';
import { api } from '../services/api';
import type { PublicFooter, SocialNetwork } from '../types';

// lucide dropped brand logos, so these are minimal hand-drawn marks (24px grid).
const SOCIAL_ICONS: Record<SocialNetwork, { label: string; icon: React.ReactNode }> = {
  facebook: {
    label: 'Facebook',
    icon: <path fill="currentColor" stroke="none" d="M13.5 21v-7.5H16l.4-3h-2.9V8.7c0-.9.3-1.4 1.5-1.4h1.5V4.6c-.3 0-1.2-.1-2.2-.1-2.2 0-3.8 1.4-3.8 3.9v2.1H8v3h2.5V21z" />,
  },
  instagram: {
    label: 'Instagram',
    icon: <><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" /></>,
  },
  youtube: {
    label: 'YouTube',
    icon: <><rect x="2.5" y="5.5" width="19" height="13" rx="4" /><path fill="currentColor" stroke="none" d="M10 9v6l5.2-3z" /></>,
  },
  x: {
    label: 'X',
    icon: <path d="M4 4h4.2L20 20h-4.2zM19.5 4l-6.4 7M4.5 20l6.4-7" />,
  },
  whatsapp: { label: 'WhatsApp', icon: null },
};

const isInternal = (url: string) => url.startsWith('/') && !url.startsWith('//');

export const SiteFooter: React.FC = () => {
  const [footer, setFooter] = useState<PublicFooter | null>(null);

  useEffect(() => {
    api.get<PublicFooter>('/footer').then(setFooter).catch(() => setFooter(null));
  }, []);

  if (!footer) return null;

  const socials = (Object.keys(SOCIAL_ICONS) as SocialNetwork[]).filter(key => footer.social[key]);
  const hasContact = footer.support_email || footer.support_phone;
  const year = new Date().getFullYear();

  return (
    <footer className="relative z-10 border-t border-slate-800/80 bg-slate-950/80 backdrop-blur">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Link to="/" className="inline-flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500 p-0.5">
              <span className="w-full h-full bg-slate-950 rounded-[10px] grid place-items-center">
                <Trophy className="w-4 h-4 text-emerald-400" aria-hidden="true" />
              </span>
            </span>
            <span className="text-base font-black tracking-tight text-white font-heading">{footer.platform_name}</span>
          </Link>
          {footer.tagline && <p className="mt-3 text-sm text-slate-400 max-w-xs leading-relaxed">{footer.tagline}</p>}

          {socials.length > 0 && (
            <div className="mt-5 flex items-center gap-2">
              {socials.map(key => (
                <a
                  key={key}
                  href={footer.social[key]}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={SOCIAL_ICONS[key].label}
                  className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 hover:border-emerald-500/50 text-slate-400 hover:text-emerald-400 grid place-items-center transition-colors"
                >
                  {key === 'whatsapp' ? (
                    <MessageCircle className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      {SOCIAL_ICONS[key].icon}
                    </svg>
                  )}
                </a>
              ))}
            </div>
          )}
        </div>

        {footer.links.length > 0 && (
          <nav aria-label="Footer">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">Quick Links</h3>
            <ul className="space-y-2.5 text-sm">
              {footer.links.map(link => (
                <li key={`${link.label}-${link.url}`}>
                  {isInternal(link.url) ? (
                    <Link to={link.url} className="text-slate-300 hover:text-emerald-400 transition-colors">{link.label}</Link>
                  ) : (
                    <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-slate-300 hover:text-emerald-400 transition-colors">{link.label}</a>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        )}

        {hasContact && (
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">Contact</h3>
            <ul className="space-y-2.5 text-sm">
              {footer.support_email && (
                <li>
                  <a href={`mailto:${footer.support_email}`} className="inline-flex items-center gap-2 text-slate-300 hover:text-emerald-400 transition-colors break-all">
                    <Mail className="w-4 h-4 shrink-0 text-slate-500" aria-hidden="true" />
                    {footer.support_email}
                  </a>
                </li>
              )}
              {footer.support_phone && (
                <li>
                  <a href={`tel:${footer.support_phone.replace(/\s+/g, '')}`} className="inline-flex items-center gap-2 text-slate-300 hover:text-emerald-400 transition-colors">
                    <Phone className="w-4 h-4 shrink-0 text-slate-500" aria-hidden="true" />
                    {footer.support_phone}
                  </a>
                </li>
              )}
            </ul>
          </div>
        )}
      </div>

      <div className="border-t border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between text-xs text-slate-500 text-center sm:text-left">
          <p>{footer.copyright || `© ${year} ${footer.platform_name}. All rights reserved.`}</p>
          {/* Always here, whatever the admin puts in Quick Links. */}
          <nav aria-label="Legal" className="flex justify-center gap-4">
            <Link to="/terms" className="hover:text-emerald-400 transition-colors">Terms & Conditions</Link>
            <Link to="/privacy" className="hover:text-emerald-400 transition-colors">Privacy Policy</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
};

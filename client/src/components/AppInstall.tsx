import React, { useEffect, useState } from 'react';
import { Download, RefreshCw, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useT } from '../i18n';

/** Chrome/Edge/Android fire this when the site can be installed. Not in the DOM typings. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'kickwick_install_dismissed';

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Makes the web app installable on phones and desktops, and says when a new
 * version is ready.
 *
 * The update is never applied on its own: a scorer mid-over must not have the
 * page reload under them, so the new version waits for them to tap Reload.
 */
export const AppInstall: React.FC = () => {
  const t = useT();
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // A screen left open all day still hears about a new version.
      if (registration) setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000);
    },
  });

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      if (!wasDismissed()) setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstallEvent(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice.catch(() => null);
    setInstallEvent(null);
  };

  const dismissInstall = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      /* private window: just hide it for now */
    }
    setInstallEvent(null);
  };

  if (needRefresh) {
    return (
      <Bar>
        <RefreshCw className="w-5 h-5 shrink-0 text-cyan-400" aria-hidden="true" />
        <p className="flex-1 text-sm font-semibold text-white">{t('app.updateReady')}</p>
        <button type="button" onClick={() => updateServiceWorker(true)} className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-bold text-slate-950 hover:bg-cyan-400">
          {t('app.reload')}
        </button>
        <button type="button" onClick={() => setNeedRefresh(false)} aria-label={t('common.close')} className="p-1 text-slate-400 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </Bar>
    );
  }

  if (!installEvent) return null;

  return (
    <Bar>
      <Download className="w-5 h-5 shrink-0 text-lime-400" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white">{t('app.install')}</p>
        <p className="text-xs text-slate-400">{t('app.installHint')}</p>
      </div>
      <button type="button" onClick={install} className="rounded-lg bg-lime-400 px-3 py-2 text-sm font-bold text-slate-950 hover:bg-lime-300">
        {t('app.installAction')}
      </button>
      <button type="button" onClick={dismissInstall} className="px-2 py-2 text-xs font-semibold text-slate-400 hover:text-white">
        {t('app.notNow')}
      </button>
    </Bar>
  );
};

const Bar: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    role="status"
    className="fixed inset-x-3 bottom-3 z-[240] mx-auto flex max-w-lg items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 shadow-2xl ring-1 ring-slate-700 sm:bottom-5"
    style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
  >
    {children}
  </div>
);

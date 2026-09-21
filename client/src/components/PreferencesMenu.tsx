import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, Languages, Monitor, Moon, Sun, Type } from 'lucide-react';
import { LANGUAGES, usePreferences, type TextSize, type ThemeChoice } from '../i18n';

/**
 * Theme, text size and language behind one button.
 *
 * One control rather than three because they are picked for the same reason —
 * someone standing outdoors wants light, larger, and their own language — and
 * because a public page (a registration link opened from WhatsApp) has room
 * for one button in its header, not three.
 */
export const PreferencesMenu: React.FC<{ className?: string; align?: 'left' | 'right' }> = ({
  className = '',
  align = 'right',
}) => {
  const { t, theme, setTheme, textSize, setTextSize, language, setLanguage, resolvedTheme } = usePreferences();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (wrapper.current && !wrapper.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const themes: { value: ThemeChoice; label: string; icon: React.ElementType }[] = [
    { value: 'light', label: t('prefs.theme.light'), icon: Sun },
    { value: 'dark', label: t('prefs.theme.dark'), icon: Moon },
    { value: 'system', label: t('prefs.theme.system'), icon: Monitor },
  ];

  const sizes: { value: TextSize; label: string; sample: string }[] = [
    { value: 'normal', label: t('prefs.textSize.normal'), sample: 'text-sm' },
    { value: 'large', label: t('prefs.textSize.large'), sample: 'text-base' },
    { value: 'larger', label: t('prefs.textSize.larger'), sample: 'text-lg' },
  ];

  const option = (selected: boolean) =>
    `flex items-center justify-center gap-1.5 min-h-11 px-2 rounded-xl text-sm font-semibold border transition-colors ${
      selected
        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
        : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
    }`;

  const TriggerIcon = resolvedTheme === 'dark' ? Moon : Sun;

  return (
    <div ref={wrapper} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={t('prefs.title')}
        title={t('prefs.title')}
        className="inline-flex items-center justify-center gap-1.5 min-h-10 min-w-10 px-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700/60"
      >
        <TriggerIcon className="w-4 h-4" aria-hidden="true" />
        <span className="text-xs font-bold uppercase">{language === 'ml' ? 'മ' : 'EN'}</span>
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={t('prefs.title')}
          className={`absolute z-[300] mt-2 w-[min(20rem,calc(100vw-2rem))] ${align === 'right' ? 'right-0' : 'left-0'} rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-4 space-y-4 animate-fade-in`}
        >
          <fieldset>
            <legend className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              <Sun className="w-3.5 h-3.5" aria-hidden="true" /> {t('prefs.theme')}
            </legend>
            <div className="grid grid-cols-3 gap-2">
              {themes.map(({ value, label, icon: Icon }) => (
                <button key={value} type="button" aria-pressed={theme === value} onClick={() => setTheme(value)} className={option(theme === value)}>
                  <Icon className="w-4 h-4" aria-hidden="true" />
                  <span className="truncate">{label}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              <Type className="w-3.5 h-3.5" aria-hidden="true" /> {t('prefs.textSize')}
            </legend>
            <div className="grid grid-cols-3 gap-2">
              {sizes.map(({ value, label, sample }) => (
                <button key={value} type="button" aria-pressed={textSize === value} onClick={() => setTextSize(value)} className={option(textSize === value)}>
                  <span className={`${sample} font-black`} aria-hidden="true">A</span>
                  <span className="truncate text-xs">{label}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              <Languages className="w-3.5 h-3.5" aria-hidden="true" /> {t('prefs.language')}
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {LANGUAGES.map(lang => (
                <button
                  key={lang.code}
                  type="button"
                  lang={lang.code}
                  aria-pressed={language === lang.code}
                  onClick={() => setLanguage(lang.code)}
                  className={option(language === lang.code)}
                >
                  {language === lang.code && <Check className="w-4 h-4" aria-hidden="true" />}
                  <span>{lang.native}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <p className="text-xs text-slate-400 leading-relaxed">{t('prefs.outdoorHint')}</p>
        </div>
      )}
    </div>
  );
};

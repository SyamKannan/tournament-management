import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { en, type TranslationKey } from './en';
import { ml } from './ml';

/**
 * Language, theme and text size — the three things a person on a ground needs
 * to change about how the app reads, kept together because they are chosen
 * together (outdoors: light theme, bigger text, their own language).
 *
 * Every choice is stored on the device and applied to <html> before React
 * renders (see `applyStoredPreferences`, called from main.tsx), so a page
 * never flashes dark-then-light or English-then-Malayalam.
 */

export type Language = 'en' | 'ml';
export type ThemeChoice = 'light' | 'dark' | 'system';
export type TextSize = 'normal' | 'large' | 'larger';

export const LANGUAGES: { code: Language; label: string; native: string }[] = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'ml', label: 'Malayalam', native: 'മലയാളം' },
];

const DICTIONARIES: Record<Language, Partial<Record<TranslationKey, string>>> = { en, ml };

const STORAGE = {
  language: 'kickwick_language',
  theme: 'kickwick_theme',
  textSize: 'kickwick_text_size',
} as const;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: the choice still applies this visit.
  }
}

function initialLanguage(): Language {
  const stored = read(STORAGE.language);
  if (stored === 'en' || stored === 'ml') return stored;
  // A phone set to Malayalam gets Malayalam without being asked.
  const browser = typeof navigator !== 'undefined' ? navigator.language?.toLowerCase() ?? '' : '';
  return browser.startsWith('ml') ? 'ml' : 'en';
}

function initialTheme(): ThemeChoice {
  const stored = read(STORAGE.theme);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

function initialTextSize(): TextSize {
  const stored = read(STORAGE.textSize);
  return stored === 'large' || stored === 'larger' ? stored : 'normal';
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

function resolveTheme(choice: ThemeChoice): 'light' | 'dark' {
  return choice === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : choice;
}

function applyToDocument(language: Language, theme: ThemeChoice, textSize: TextSize): void {
  const root = document.documentElement;
  const resolved = resolveTheme(theme);
  root.lang = language;
  root.dataset.theme = resolved;
  root.dataset.textSize = textSize;
  root.style.colorScheme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#070b1d' : '#f5f7fb');
}

/** Run before the first render so nothing flashes in the wrong theme. */
export function applyStoredPreferences(): void {
  applyToDocument(initialLanguage(), initialTheme(), initialTextSize());
}

/** Fill `{name}` placeholders. */
function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    vars[name] !== undefined ? String(vars[name]) : match,
  );
}

/** Translate outside React (the API client, plain helpers). */
export function translate(key: TranslationKey, vars?: Record<string, string | number>): string {
  const language = (document.documentElement.lang === 'ml' ? 'ml' : 'en') as Language;
  const template = DICTIONARIES[language][key] ?? en[key] ?? key;
  return interpolate(template, vars);
}

interface PreferencesValue {
  language: Language;
  setLanguage: (language: Language) => void;
  theme: ThemeChoice;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: ThemeChoice) => void;
  textSize: TextSize;
  setTextSize: (size: TextSize) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  /** Money in the reader's locale: ₹12,500 */
  money: (amount: number) => string;
}

const PreferencesContext = createContext<PreferencesValue | null>(null);

export const PreferencesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(initialLanguage);
  const [theme, setThemeState] = useState<ThemeChoice>(initialTheme);
  const [textSize, setTextSizeState] = useState<TextSize>(initialTextSize);
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() => resolveTheme(initialTheme()));

  useEffect(() => {
    applyToDocument(language, theme, textSize);
    setResolvedTheme(resolveTheme(theme));
  }, [language, theme, textSize]);

  // "Match device" follows the phone switching to dark at sunset.
  useEffect(() => {
    if (theme !== 'system' || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      applyToDocument(language, theme, textSize);
      setResolvedTheme(resolveTheme(theme));
    };
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, [theme, language, textSize]);

  const setLanguage = useCallback((next: Language) => {
    write(STORAGE.language, next);
    setLanguageState(next);
  }, []);

  const setTheme = useCallback((next: ThemeChoice) => {
    write(STORAGE.theme, next);
    setThemeState(next);
  }, []);

  const setTextSize = useCallback((next: TextSize) => {
    write(STORAGE.textSize, next);
    setTextSizeState(next);
  }, []);

  const t = useCallback((key: TranslationKey, vars?: Record<string, string | number>) => {
    const template = DICTIONARIES[language][key] ?? en[key] ?? key;
    return interpolate(template, vars);
  }, [language]);

  const money = useCallback((amount: number) => {
    const value = Number.isFinite(amount) ? amount : 0;
    return `₹${value.toLocaleString(language === 'ml' ? 'ml-IN' : 'en-IN', { maximumFractionDigits: 2 })}`;
  }, [language]);

  const value = useMemo<PreferencesValue>(() => ({
    language, setLanguage, theme, resolvedTheme, setTheme, textSize, setTextSize, t, money,
  }), [language, setLanguage, theme, resolvedTheme, setTheme, textSize, setTextSize, t, money]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
};

export function usePreferences(): PreferencesValue {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error('usePreferences must be used inside PreferencesProvider');
  return context;
}

/** Just the translator — what most components need. */
export function useT() {
  return usePreferences().t;
}

export type { TranslationKey };

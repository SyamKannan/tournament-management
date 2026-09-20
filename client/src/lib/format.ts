/**
 * Shared display formatting for dates and money.
 *
 * Without these, the same value reads differently from screen to screen —
 * `9/10/2026` next to `Sep 12, 4:49 PM`, or `₹5000` next to `₹50,000`. Dates
 * use a day-first, spelled-out month so there is no 9/10 vs 10/9 ambiguity,
 * and amounts always carry Indian digit grouping.
 */

const DATE: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
const TIME: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };

const parse = (value: string | number | Date | null | undefined): Date | null => {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** "10 Sep 2026" — em dash when there is nothing to show. */
export const formatDate = (value: string | number | Date | null | undefined, fallback = '—') => {
  const date = parse(value);
  return date ? date.toLocaleDateString(undefined, DATE) : fallback;
};

/** "10 Sep 2026, 6:49 PM" — no seconds; nobody reads them. */
export const formatDateTime = (value: string | number | Date | null | undefined, fallback = '—') => {
  const date = parse(value);
  return date ? date.toLocaleString(undefined, { ...DATE, ...TIME }) : fallback;
};

/** "Sat, 12 Sep, 4:49 PM" — for fixtures, where the weekday is what matters. */
export const formatMatchTime = (value: string | number | Date | null | undefined, fallback = '—') => {
  const date = parse(value);
  return date
    ? date.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', ...TIME })
    : fallback;
};

/** "₹5,000" — grouped Indian-style, no trailing paise on whole amounts. */
export const formatMoney = (amount: number | string | null | undefined, fallback = '₹0') => {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  if (value === null || value === undefined || Number.isNaN(value)) return fallback;
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
};

import React from 'react';

/**
 * Dial codes covering the countries already listed in
 * AdminPlatformSettingsPage's country picker, deduplicated by dial code
 * (US and Canada both use +1).
 */
export const COUNTRY_DIAL_CODES: { dial: string; flag: string; label: string }[] = [
  { dial: '+91', flag: '🇮🇳', label: 'India' },
  { dial: '+1', flag: '🇺🇸', label: 'US / Canada' },
  { dial: '+44', flag: '🇬🇧', label: 'UK' },
  { dial: '+61', flag: '🇦🇺', label: 'Australia' },
  { dial: '+971', flag: '🇦🇪', label: 'UAE' },
  { dial: '+65', flag: '🇸🇬', label: 'Singapore' },
  { dial: '+92', flag: '🇵🇰', label: 'Pakistan' },
  { dial: '+880', flag: '🇧🇩', label: 'Bangladesh' },
  { dial: '+94', flag: '🇱🇰', label: 'Sri Lanka' },
  { dial: '+977', flag: '🇳🇵', label: 'Nepal' },
  { dial: '+27', flag: '🇿🇦', label: 'South Africa' },
  { dial: '+64', flag: '🇳🇿', label: 'New Zealand' },
  { dial: '+60', flag: '🇲🇾', label: 'Malaysia' },
  { dial: '+254', flag: '🇰🇪', label: 'Kenya' },
  { dial: '+234', flag: '🇳🇬', label: 'Nigeria' },
  { dial: '+353', flag: '🇮🇪', label: 'Ireland' },
  { dial: '+49', flag: '🇩🇪', label: 'Germany' },
  { dial: '+33', flag: '🇫🇷', label: 'France' },
];

const DEFAULT_DIAL = '+91';

// Longest dial code first so "+1" doesn't swallow a match meant for a
// longer code that happens to share its leading digit.
const DIALS_BY_LENGTH_DESC = [...COUNTRY_DIAL_CODES].sort((a, b) => b.dial.length - a.dial.length);

/**
 * Phone numbers are stored as a single free-text string throughout the
 * backend (no separate country-code column), so we split an existing value
 * like "+91 98470 12345" into a dial code + local number for display, and
 * recombine on every change.
 */
function splitPhoneValue(value: string): { dial: string; number: string } {
  const trimmed = (value || '').trim();
  const match = DIALS_BY_LENGTH_DESC.find(c => trimmed === c.dial || trimmed.startsWith(`${c.dial} `) || trimmed.startsWith(c.dial));
  if (match) {
    return { dial: match.dial, number: trimmed.slice(match.dial.length).trim() };
  }
  return { dial: DEFAULT_DIAL, number: trimmed };
}

function stripClasses(classes: string, pattern: RegExp): string {
  return classes.split(/\s+/).filter(c => c && !pattern.test(c)).join(' ');
}

interface PhoneInputProps {
  /** Full stored value, e.g. "+91 98470 12345". */
  value: string;
  onChange: (value: string) => void;
  /** Shared styling applied to both the code select and the number input. */
  className?: string;
  /** Overrides `className` for just the select, if it needs different width/padding. */
  selectClassName?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  autoComplete?: string;
}

export const PhoneInput: React.FC<PhoneInputProps> = ({
  value,
  onChange,
  className = '',
  selectClassName,
  placeholder,
  required,
  disabled,
  id,
  autoComplete,
}) => {
  const { dial, number } = splitPhoneValue(value);
  // Callers pass input-style classes like "w-full px-4"; width would override
  // the fixed select width (squeezing the number input out), and wide padding
  // doesn't fit the compact code picker.
  const inner = stripClasses(className, /^(w|min-w|max-w)-/);
  const selectClasses = selectClassName
    ? stripClasses(selectClassName, /^(w|min-w|max-w)-/)
    : `${stripClasses(inner, /^(px|pl|pr)-/)} pl-3 pr-1`;

  return (
    <div className="flex gap-2 w-full min-w-0">
      <select
        aria-label="Country code"
        value={dial}
        disabled={disabled}
        onChange={(e) => onChange(`${e.target.value} ${number}`.trim())}
        className={`shrink-0 w-[6.5rem] ${selectClasses}`}
      >
        {COUNTRY_DIAL_CODES.map(c => (
          <option key={c.dial} value={c.dial}>{c.flag} {c.dial}</option>
        ))}
      </select>
      <input
        id={id}
        type="tel"
        inputMode="tel"
        required={required}
        disabled={disabled}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={number}
        onChange={(e) => onChange(`${dial} ${e.target.value}`.trim())}
        className={`flex-1 min-w-0 ${inner}`}
      />
    </div>
  );
};

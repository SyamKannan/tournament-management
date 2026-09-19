import React from 'react';

/**
 * Scorey, the assistant's mascot: a round little football-ball buddy with big
 * eyes, rosy cheeks and a star antenna. `animated` adds a blink and a bob.
 */
export const ScoreyAvatar: React.FC<{ size?: number; animated?: boolean; className?: string }> = ({
  size = 32,
  animated = false,
  className = '',
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    role="img"
    aria-label="Scorey"
    className={`${animated ? 'scorey-bob' : ''} ${className}`}
  >
    {/* star antenna */}
    <line x1="32" y1="12" x2="32" y2="5" stroke="#d6f95a" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M32 0.5l1.6 3.3 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z" fill="#fbbf24" />

    {/* body */}
    <circle cx="32" cy="36" r="25" fill="#c8f535" />
    <circle cx="32" cy="36" r="25" fill="url(#scorey-shine)" />
    {/* football patches */}
    <path d="M32 13.5l4.5 3.3-1.7 5.2h-5.6l-1.7-5.2z" fill="#6b8c0a" opacity="0.55" />
    <path d="M9.6 30.5l4.7-1.2 2.4 4.6-3.3 4.2-4.4-.9a23 23 0 0 1 .6-6.7z" fill="#6b8c0a" opacity="0.45" />
    <path d="M54.4 30.5l-4.7-1.2-2.4 4.6 3.3 4.2 4.4-.9a23 23 0 0 0-.6-6.7z" fill="#6b8c0a" opacity="0.45" />

    {/* face */}
    <g className={animated ? 'scorey-blink' : ''}>
      <ellipse cx="23.5" cy="36" rx="5" ry="6" fill="#0f172a" />
      <ellipse cx="40.5" cy="36" rx="5" ry="6" fill="#0f172a" />
      <circle cx="25.2" cy="33.6" r="1.9" fill="#fff" />
      <circle cx="42.2" cy="33.6" r="1.9" fill="#fff" />
      <circle cx="22.4" cy="38.2" r="0.9" fill="#fff" />
      <circle cx="39.4" cy="38.2" r="0.9" fill="#fff" />
    </g>
    <ellipse cx="15.5" cy="44" rx="4" ry="2.5" fill="#fb7185" opacity="0.7" />
    <ellipse cx="48.5" cy="44" rx="4" ry="2.5" fill="#fb7185" opacity="0.7" />
    <path d="M27 45.5q5 5 10 0" fill="none" stroke="#0f172a" strokeWidth="2.4" strokeLinecap="round" />

    <defs>
      <radialGradient id="scorey-shine" cx="0.35" cy="0.3" r="0.75">
        <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
        <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
      </radialGradient>
    </defs>
  </svg>
);

import React, { useState } from 'react';

interface PlayerAvatarProps {
  photo?: string | null;
  name: string;
  /** Shown under the initials when there's no photo — kit identity at a glance. */
  jerseyNumber?: number | null;
  /** Team colour, used as the accent behind the initials. */
  accentColor?: string | null;
  className?: string;
  /** Tailwind text size for the initials; the caller sizes the box itself. */
  textClassName?: string;
}

/**
 * Palette for generated avatars — picked by name so the same player always
 * gets the same colour, and two players side by side rarely collide.
 */
const TONES = [
  { from: '#0f766e', to: '#155e75' },
  { from: '#9a3412', to: '#7c2d12' },
  { from: '#4338ca', to: '#3730a3' },
  { from: '#a16207', to: '#854d0e' },
  { from: '#be123c', to: '#881337' },
  { from: '#15803d', to: '#14532d' },
];

/** First letters of the first and last name — "Sanju V. Pillai" becomes SP. */
const initialsOf = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const toneFor = (name: string) => {
  const hash = [...name].reduce((total, character) => total + character.charCodeAt(0), 0);
  return TONES[hash % TONES.length];
};

/**
 * A player's photo, or a generated stand-in when there isn't one.
 *
 * The fallback is drawn rather than fetched: squads routinely register without
 * photos, and a remote placeholder that fails to load would leave a hole in the
 * middle of a stadium screen. `onError` routes a broken photo URL here too, so
 * a dead link degrades the same way a missing one does.
 */
export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({
  photo,
  name,
  jerseyNumber,
  accentColor,
  className = '',
  textClassName = 'text-2xl',
}) => {
  const [failed, setFailed] = useState(false);

  if (photo && !failed) {
    return (
      <img
        src={photo}
        alt={name}
        onError={() => setFailed(true)}
        className={`object-cover ${className}`}
      />
    );
  }

  const tone = toneFor(name);

  return (
    <div
      className={`flex flex-col items-center justify-center select-none ${className}`}
      style={{ backgroundImage: `linear-gradient(145deg, ${tone.from}, ${tone.to})` }}
      role="img"
      aria-label={name}
    >
      <span className={`font-black font-heading text-white/95 tracking-tight ${textClassName}`}>
        {initialsOf(name)}
      </span>

      {jerseyNumber !== null && jerseyNumber !== undefined && (
        <span
          className="font-mono font-bold text-[0.65em] uppercase tracking-widest mt-0.5"
          style={{ color: accentColor || 'rgba(255,255,255,0.55)' }}
        >
          #{jerseyNumber}
        </span>
      )}
    </div>
  );
};

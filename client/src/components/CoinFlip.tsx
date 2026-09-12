import React from 'react';

interface CoinFlipProps {
  isFlipping: boolean;
  size?: 'md' | 'lg';
}

const SIZE_CLASSES: Record<'md' | 'lg', string> = {
  md: 'w-20 h-20 text-4xl border-4',
  lg: 'w-32 h-32 sm:w-40 sm:h-40 text-7xl sm:text-8xl border-8',
};

/**
 * A CSS 3D coin flip (rotateY, several turns, ~1.4s — see `.animate-coin-flip`
 * in index.css). `prefers-reduced-motion` is handled globally there too
 * (animation-duration collapses to ~0ms for every animation on the site), so
 * this component doesn't need its own media-query branch — the coin still
 * "flips" for those users, just straight to the result.
 */
export const CoinFlip: React.FC<CoinFlipProps> = ({ isFlipping, size = 'md' }) => (
  <div
    className={`${SIZE_CLASSES[size]} rounded-full bg-gradient-to-br from-amber-400 to-yellow-600 border-amber-300/60 shadow-2xl shadow-amber-500/30 flex items-center justify-center ${isFlipping ? 'animate-coin-flip' : ''}`}
  >
    🪙
  </div>
);

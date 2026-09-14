import React from 'react';

interface CoinFlipProps {
  /** True from the moment the toss is triggered until the reveal is done. */
  isFlipping: boolean;
  /**
   * The face to settle on, decided by the server. While this is null the coin
   * just keeps spinning, so the animation can start before the request lands.
   */
  result?: 'heads' | 'tails' | null;
  size?: 'md' | 'lg';
}

/**
 * Duration of the settle animation — callers time their reveal against it.
 * Must stay in step with the `coin-land-*` animations in index.css.
 */
export const COIN_FLIP_MS = 3600;

const WRAP_CLASSES: Record<'md' | 'lg', string> = {
  md: 'w-20 h-20',
  lg: 'w-36 h-36 sm:w-48 sm:h-48',
};

const FACE_CLASSES: Record<'md' | 'lg', string> = {
  md: 'text-2xl border-4',
  lg: 'text-5xl sm:text-6xl border-[6px]',
};

const LABEL_CLASSES: Record<'md' | 'lg', string> = {
  md: 'text-[9px] tracking-[0.2em]',
  lg: 'text-xs sm:text-sm tracking-[0.3em]',
};

/**
 * A two-sided coin that tumbles end-over-end in CSS 3D and lands on the face
 * the server returned.
 *
 * Both phases are keyframe animations rather than transitions: an animation
 * fires on the frame its class is applied, whereas a transition needs the
 * browser to have painted the previous value first — which React's batched
 * renders don't guarantee, so the coin would sometimes snap instead of spin.
 *
 * `prefers-reduced-motion` is handled globally in index.css (it collapses
 * animation durations), so the coin still shows the right face without spinning.
 */
export const CoinFlip: React.FC<CoinFlipProps> = ({ isFlipping, result, size = 'md' }) => {
  const animationClass = isFlipping
    ? result
      ? result === 'tails'
        ? 'coin-landing-tails'
        : 'coin-landing-heads'
      : 'coin-spinning'
    : '';

  // Once settled, hold the face statically so a reload shows the same result.
  const restingStyle = isFlipping
    ? undefined
    : { transform: `rotateX(${result === 'tails' ? 180 : 0}deg)` };

  const face = `coin-face ${FACE_CLASSES[size]} border-amber-200/70 font-black text-amber-950 flex-col gap-0.5 shadow-2xl shadow-amber-500/40`;

  return (
    <div className={`${WRAP_CLASSES[size]} coin-3d-wrap shrink-0`}>
      <div className={`coin-3d ${animationClass}`} style={restingStyle}>
        <div className={`${face} bg-[radial-gradient(circle_at_30%_25%,#fde68a_0%,#f59e0b_45%,#b45309_100%)]`}>
          <span>H</span>
          <span className={`${LABEL_CLASSES[size]} font-bold uppercase opacity-70`}>Heads</span>
        </div>
        <div className={`${face} coin-face-back bg-[radial-gradient(circle_at_70%_25%,#fcd34d_0%,#d97706_45%,#92400e_100%)]`}>
          <span>T</span>
          <span className={`${LABEL_CLASSES[size]} font-bold uppercase opacity-70`}>Tails</span>
        </div>
      </div>
    </div>
  );
};

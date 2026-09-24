import React from 'react';

/**
 * The app's loading animation: a ball bouncing on the ground that turns from a
 * football into a cricket ball at the top of every bounce — KickWick runs both.
 * Motion lives in index.css (`.sports-loader*`) and stops under reduced motion.
 */
/** One size everywhere, so the loader never jumps between screens. */
const BALL_PX = 48;

const rad = (deg: number) => (deg * Math.PI) / 180;

/** A regular pentagon's points, `r` from its centre, first vertex at `deg`. */
const pentagon = (cx: number, cy: number, r: number, deg: number) =>
  Array.from({ length: 5 }, (_, i) => {
    const a = rad(deg + i * 72);
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(' ');

// The centre patch points up; the five around it sit on the rim, pointing out.
const RIM = [-90, -18, 54, 126, 198].map(deg => ({
  deg,
  x: 20 + 19 * Math.cos(rad(deg)),
  y: 20 + 19 * Math.sin(rad(deg)),
}));

const Football: React.FC = () => (
  <svg viewBox="0 0 40 40" className="sports-loader-face sports-loader-football" aria-hidden="true">
    <defs>
      <clipPath id="sports-loader-football-clip"><circle cx="20" cy="20" r="19" /></clipPath>
    </defs>
    <circle cx="20" cy="20" r="19" fill="#f8fafc" />
    <g clipPath="url(#sports-loader-football-clip)" fill="#0f172a" stroke="#0f172a" strokeWidth="1.4">
      <polygon points={pentagon(20, 20, 7, -90)} />
      {RIM.map(({ deg, x, y }) => (
        <React.Fragment key={deg}>
          <line x1={20 + 7 * Math.cos(rad(deg))} y1={20 + 7 * Math.sin(rad(deg))} x2={x} y2={y} />
          <polygon points={pentagon(x, y, 6.5, deg + 180)} />
        </React.Fragment>
      ))}
    </g>
    <circle cx="20" cy="20" r="19" fill="none" stroke="#0f172a" strokeWidth="1.5" />
  </svg>
);

const CricketBall: React.FC = () => (
  <svg viewBox="0 0 40 40" className="sports-loader-face sports-loader-cricket" aria-hidden="true">
    <defs>
      <radialGradient id="sports-loader-leather" cx="35%" cy="30%" r="75%">
        <stop offset="0%" stopColor="#f87171" />
        <stop offset="55%" stopColor="#dc2626" />
        <stop offset="100%" stopColor="#7f1d1d" />
      </radialGradient>
    </defs>
    <circle cx="20" cy="20" r="19" fill="url(#sports-loader-leather)" />
    <path d="M7 5.5 C15 14, 15 26, 7 34.5" stroke="#fef3c7" strokeWidth="1.4" fill="none" />
    <path d="M10.5 3.5 C19 13, 19 27, 10.5 36.5" stroke="#fef3c7" strokeWidth="1.4" fill="none" />
    <path
      d="M8.6 8 l2.6 -1.4 M10.6 11.5 l2.8 -1 M11.8 15.5 l2.9 -0.5 M12.3 20 h3 M11.8 24.5 l2.9 0.5 M10.6 28.5 l2.8 1 M8.6 32 l2.6 1.4"
      stroke="#fef3c7" strokeWidth="0.9" strokeLinecap="round"
    />
  </svg>
);

interface SportsLoaderProps {
  label?: string;
  className?: string;
}

export const SportsLoader: React.FC<SportsLoaderProps> = ({ label, className = '' }) => (
  <div className={`inline-flex flex-col items-center gap-3 ${className}`}>
    <div
      className="sports-loader"
      style={{ '--ball': `${BALL_PX}px` } as React.CSSProperties}
      aria-hidden="true"
    >
      <div className="sports-loader-ball">
        <div className="sports-loader-spin">
          <Football />
          <CricketBall />
        </div>
      </div>
      <div className="sports-loader-shadow" />
    </div>
    {label && <span className="text-sm text-slate-400 font-medium">{label}</span>}
  </div>
);

/** Full-area centred loader for a page or route that has nothing to show yet. */
export const PageLoader: React.FC<{ label?: string; className?: string }> = ({
  label,
  className = 'min-h-[60vh]',
}) => (
  <div
    className={`flex items-center justify-center ${className}`}
    role="status"
    aria-live="polite"
    aria-label={label ?? 'Loading'}
  >
    <SportsLoader label={label} />
  </div>
);

/** KickWick logo: a K whose upper arm kicks a ball in flight. It shows no single sport, so it fits any sport added later. */
export const BrandMark = ({ className = 'w-9 h-9' }: { className?: string }) => (
  <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
    <rect width="64" height="64" rx="16" fill="#111834" />
    <path d="M20 14v36M22 34l16-13M30 28l16 22" stroke="#C8F535" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <circle cx="46" cy="15" r="6.5" fill="#38BDF8" />
  </svg>
);

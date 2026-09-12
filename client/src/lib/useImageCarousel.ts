import { useEffect, useState } from 'react';

// Advances an index on an interval, looping through `length` slides. Skips
// auto-advance entirely when the reader has asked for reduced motion.
export function useImageCarousel(length: number, intervalMs = 6000): number {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (length <= 1) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const id = setInterval(() => {
      setIndex((i) => (i + 1) % length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [length, intervalMs]);

  return index;
}

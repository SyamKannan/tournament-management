import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ImageCarouselBackdropProps {
  images: readonly string[];
  activeIndex: number;
  className?: string;
}

// Crossfading, slow-zooming background image — purely presentational. Pair
// with `useImageCarousel` for the advancing index so multiple consumers
// (e.g. dots UI) can share one clock instead of drifting independently.
export const ImageCarouselBackdrop: React.FC<ImageCarouselBackdropProps> = ({
  images,
  activeIndex,
  className = '',
}) => {
  return (
    <AnimatePresence mode="sync">
      <motion.div
        key={images[activeIndex]}
        className={`absolute inset-0 bg-cover bg-center animate-ken-burns ${className}`}
        style={{ backgroundImage: `url(${images[activeIndex]})` }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 1.4, ease: 'easeInOut' }}
        aria-hidden="true"
      />
    </AnimatePresence>
  );
};

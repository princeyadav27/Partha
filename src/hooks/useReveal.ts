import { useEffect, useRef } from 'react';

/**
 * Adds a one-shot reveal animation when an element scrolls into view.
 * Uses IntersectionObserver when available, with a deterministic
 * scroll/resize position check as fallback so reveals never get missed.
 */
export function useReveal<T extends HTMLElement>(delay = 0) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add('revealed');
      return;
    }

    let done = false;
    const reveal = () => {
      if (done) return;
      done = true;
      if (delay) el.style.transitionDelay = `${delay}ms`;
      el.classList.add('revealed');
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
      io.disconnect();
    };

    // Deterministic check: element top above the viewport fold (minus margin).
    const check = () => {
      const rect = el.getBoundingClientRect();
      if (rect.top <= window.innerHeight - 40 && rect.bottom >= 0) reveal();
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) reveal();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    );
    io.observe(el);

    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    check();

    return () => {
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
      io.disconnect();
    };
  }, [delay]);

  return ref;
}

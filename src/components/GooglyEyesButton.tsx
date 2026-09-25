import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useSpring } from 'framer-motion';

/**
 * Partha's contact button: a pair of googly eyes whose pupils track the
 * cursor. Click and the eyes go smirky — the archer's gaze locks on — while
 * the label swaps from "Get in touch" to "Will aim back".
 *
 * Ported to Partha's design system (no Tailwind): one shared pointer
 * listener feeds both eyes, reduced-motion and touch devices get sensible
 * fallbacks, and the whole thing sits on the deep-green pill token.
 */

const EASE = [0.16, 1, 0.3, 1] as [number, number, number, number];

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

function useIsTouch(): boolean {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    setTouch(window.matchMedia('(hover: none)').matches);
  }, []);
  return touch;
}

type EyeSide = 'left' | 'right';
type PointerHandler = (x: number, y: number) => void;

function Eye({
  side,
  smirk,
  reduced,
  touch,
  register,
}: {
  side: EyeSide;
  smirk: boolean;
  reduced: boolean;
  touch: boolean;
  register: (handler: PointerHandler) => () => void;
}) {
  const eyeRef = useRef<HTMLDivElement>(null);
  const pupilX = useMotionValue(0);
  const pupilY = useMotionValue(0);
  const springX = useSpring(pupilX, { stiffness: 300, damping: 20 });
  const springY = useSpring(pupilY, { stiffness: 300, damping: 20 });

  // Cursor tracking: one shared window listener (registered by the button)
  // calls this eye's own geometry-aware update.
  useEffect(() => {
    if (reduced) return;
    const update: PointerHandler = (cx, cy) => {
      const el = eyeRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const ex = rect.left + rect.width / 2;
      const ey = rect.top + rect.height / 2;
      const angle = Math.atan2(cy - ey, cx - ex);
      const distance = Math.min(9, Math.hypot(cx - ex, cy - ey) / 12);
      pupilX.set(Math.cos(angle) * distance);
      pupilY.set(Math.sin(angle) * distance);
    };
    return register(update);
  }, [reduced, register, pupilX, pupilY]);

  // Touch devices have no cursor: let the eyes wander a little so they
  // never look dead.
  useEffect(() => {
    if (!touch || reduced) return;
    const id = window.setInterval(() => {
      const angle = Math.random() * Math.PI * 2;
      const distance = 3 + Math.random() * 5;
      pupilX.set(Math.cos(angle) * distance);
      pupilY.set(Math.sin(angle) * distance);
    }, 1900);
    return () => window.clearInterval(id);
  }, [touch, reduced, pupilX, pupilY]);

  const spring = reduced ? { duration: 0 } : { type: 'spring' as const, stiffness: 260, damping: 18 };

  return (
    <motion.div
      ref={eyeRef}
      className="eyes-eye"
      aria-hidden="true"
      animate={smirk ? { scaleY: 0.42, rotate: side === 'left' ? -4 : 4 } : { scaleY: 1, rotate: 0 }}
      transition={spring}
    >
      <motion.span
        className="eyes-pupil"
        style={{ x: springX, y: springY }}
        animate={{
          y: smirk ? 2 : 0,
          scaleX: smirk ? 0.5 : 1,
          scaleY: smirk ? 1.6 : 1,
          backgroundColor: smirk ? '#7a0000' : '#0a0a0a',
          boxShadow: smirk ? '0 0 6px 1px rgba(255,0,0,0.65)' : '0 0 0 0 rgba(255,0,0,0)',
        }}
        transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 20 }}
      />
      <motion.span
        className={`eyes-lid eyes-lid-${side}`}
        initial={false}
        animate={{ height: smirk ? 22 : 0, rotate: smirk ? (side === 'left' ? 14 : -14) : 0 }}
        transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 22 }}
      />
    </motion.div>
  );
}

export default function GooglyEyesButton() {
  const [clicked, setClicked] = useState(false);
  const reduced = usePrefersReducedMotion();
  const touch = useIsTouch();
  const handlers = useRef<Set<PointerHandler>>(new Set());

  useEffect(() => {
    if (reduced) return;
    const onMove = (event: MouseEvent) => {
      handlers.current.forEach((fn) => fn(event.clientX, event.clientY));
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [reduced]);

  const register = (handler: PointerHandler) => {
    handlers.current.add(handler);
    return () => {
      handlers.current.delete(handler);
    };
  };

  return (
    <motion.button
      type="button"
      className="eyes-btn"
      aria-pressed={clicked}
      onClick={() => setClicked((prev) => !prev)}
      whileHover={reduced ? undefined : { scale: 1.02 }}
      whileTap={reduced ? undefined : { scale: 0.98 }}
    >
      <span className="eyes-label">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={clicked ? 'smirk' : 'calm'}
            className="eyes-label-text"
            initial={reduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -10 }}
            transition={{ duration: reduced ? 0 : 0.25, ease: EASE }}
          >
            {clicked ? 'Will aim back' : 'Get in touch'}
          </motion.span>
        </AnimatePresence>
      </span>
      <span className="eyes-pair">
        <Eye side="left" smirk={clicked} reduced={reduced} touch={touch} register={register} />
        <Eye side="right" smirk={clicked} reduced={reduced} touch={touch} register={register} />
      </span>
    </motion.button>
  );
}

// Наклон в 3D под пальцем: астролябия чуть поворачивается за касанием и возвращается пружиной.
import { motion, useMotionValue, useSpring, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

export function Tilt({ children, max = 10 }: { children: ReactNode; max?: number }) {
  const reduce = useReducedMotion();
  const rx = useMotionValue(12), ry = useMotionValue(0);
  const sx = useSpring(rx, { stiffness: 120, damping: 18 }), sy = useSpring(ry, { stiffness: 120, damping: 18 });
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    ry.set(x * max * 2); rx.set(12 - y * max * 2);
  };
  return (
    <div style={{ perspective: 900 }} onPointerMove={move} onPointerLeave={() => { rx.set(12); ry.set(0); }} onPointerUp={() => { rx.set(12); ry.set(0); }}>
      <motion.div style={{ rotateX: reduce ? 0 : sx, rotateY: reduce ? 0 : sy, transformStyle: 'preserve-3d' }}>
        {children}
      </motion.div>
    </div>
  );
}

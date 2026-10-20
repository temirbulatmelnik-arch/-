// Обёртка 3D-фигуры: грузится отдельно (three.js тяжёлый), без WebGL или при ошибке показывает запасную картинку.
import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { EXERCISES, type ExerciseId } from '../engine/exercises';
import { amountAt, demoTimeline, locate, type Step } from '../engine/timeline';
import type { FigureMotion, FigureProps, FigureView } from './figureTypes';

const Figure3D = lazy(() => import('./Figure3D'));

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/** Что показывать крупно: лицо, шею, верх тела или всё тело */
export function viewFor(ex: ExerciseId): FigureView {
  const e = EXERCISES[ex];
  if (e.block === 'face') return 'face';
  if (['nod', 'nodPress', 'headLift', 'scmStretch', 'trapStretch', 'screen'].includes(e.anim)) return 'neck';
  if (e.anim === 'walk') return 'body';
  return 'upper';
}

export function Figure({ fallback, ...props }: FigureProps & { fallback?: ReactNode }) {
  const box = `relative ${props.className ?? ''}`;
  const spare = fallback ?? <div className={`${box} grid place-items-center text-[14px] text-muted`}>3D недоступно</div>;
  return (
    <Boundary fallback={spare}>
      <Suspense fallback={<div className={`${box} grid place-items-center`}><span className="size-8 animate-spin rounded-full border-2 border-line border-t-gold" /></div>}>
        <Figure3D {...props} />
      </Suspense>
    </Boundary>
  );
}

/** Демонстрация упражнения по кругу: отдаёт движение для фигуры и текущий шаг для подписи */
export function useDemoMotion(ex: ExerciseId) {
  const motion = useRef<FigureMotion>({ anim: EXERCISES[ex].anim, amount: 0, phase: 'rest' });
  const [step, setStep] = useState<Step | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const tl = demoTimeline(ex);
    const t0 = performance.now();
    let last = -1, raf = 0, lastP = -1;
    const frame = () => {
      const t = ((performance.now() - t0) / 1000) % tl.total;
      const loc = locate(tl, t);
      const s = tl.steps[loc.index];
      motion.current = { anim: s.anim, amount: amountAt(tl, loc.index, loc.offset), phase: s.phase, side: s.side };
      if (loc.index !== last) { last = loc.index; setStep(s); }
      const p = Math.round((loc.offset / s.duration) * 20) / 20;
      if (p !== lastP) { lastP = p; setProgress(p); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [ex]);

  return { motion, step, progress };
}

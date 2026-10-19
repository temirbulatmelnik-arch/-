// Обёртка 3D-фигуры: грузится отдельно (three.js тяжёлый), без WebGL или при ошибке показывает запасную картинку.
import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { demoTimeline } from '../engine/guides';
import type { BlockType, Position } from '../engine/program';
import { levelAt, locate, type Step } from '../engine/timeline';
import type { FigureFocus, FigureMotion, FigurePose, FigureZoom } from './Figure3D';

const Figure3D = lazy(() => import('./Figure3D'));

export const poseFor = (p: Position): FigurePose => p;

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/** Дыхательные упражнения смотрим на всё туловище, остальные — на таз */
export const focusFor = (t: BlockType): FigureFocus => (t === 'breath' || t === 'release' ? 'torso' : 'pelvis');

export function Figure({ motion, pose, zoom, focus, autoRotate, className = '', fallback }: {
  motion: { current: FigureMotion };
  pose: FigurePose;
  zoom?: FigureZoom;
  focus?: FigureFocus;
  autoRotate?: boolean;
  className?: string;
  fallback?: ReactNode;
}) {
  const box = `relative ${className}`;
  const spare = fallback ?? <div className={`${box} grid place-items-center text-[14px] text-muted`}>3D недоступно</div>;
  return (
    <Boundary fallback={spare}>
      <Suspense fallback={<div className={`${box} grid place-items-center`}><span className="size-8 animate-spin rounded-full border-2 border-line border-t-calm" /></div>}>
        <Figure3D motion={motion} pose={pose} zoom={zoom} focus={focus} autoRotate={autoRotate} className={className} />
      </Suspense>
    </Boundary>
  );
}

/** Демонстрация упражнения по кругу: отдаёт движение для фигуры и текущий шаг для подписи */
export function useDemoMotion(type: BlockType, position: Position) {
  const motion = useRef<FigureMotion>({ level: 0, phase: 'relax' });
  const [step, setStep] = useState<Step | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const tl = demoTimeline(type, position);
    const t0 = performance.now();
    let last = -1, raf = 0, lastP = -1;
    const frame = () => {
      const t = ((performance.now() - t0) / 1000) % tl.total;
      const loc = locate(tl, t);
      const s = tl.steps[loc.index];
      motion.current = { level: levelAt(tl, loc.index, loc.offset), phase: s.phase };
      if (loc.index !== last) { last = loc.index; setStep(s); }
      const p = Math.round((loc.offset / s.duration) * 20) / 20;
      if (p !== lastP) { lastP = p; setProgress(p); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [type, position]);

  return { motion, step, progress };
}

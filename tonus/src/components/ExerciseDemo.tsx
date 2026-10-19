// Демонстрация упражнения на 3D-фигуре и подробная инструкция к нему.
import { Hand, PersonStanding, ScanEye, Wind, X } from 'lucide-react';
import { useState } from 'react';
import { GUIDES, type Guide } from '../engine/guides';
import { POSITION_LABEL, type BlockType, type Position } from '../engine/program';
import { ANATOMY_COLORS } from './anatomyColors';
import { Figure, focusFor, poseFor, useDemoMotion } from './Figure';
import type { FigureZoom } from './Figure3D';

function stepTone(level: number, phase: string) {
  if (phase === 'inhale' || phase === 'exhale') return 'bg-breath';
  return level > 0 ? 'bg-squeeze' : 'bg-calm';
}

export function ExerciseDemo({ type, position, initialZoom = 'body', autoRotate = true }: {
  type: BlockType; position: Position; initialZoom?: FigureZoom; autoRotate?: boolean;
}) {
  const { motion, step, progress } = useDemoMotion(type, position);
  const [zoom, setZoom] = useState<FigureZoom>(initialZoom);

  return (
    <div className="relative overflow-hidden rounded-3xl bg-surface-2">
      <Figure motion={motion} pose={poseFor(position)} zoom={zoom} focus={focusFor(type)} autoRotate={autoRotate} className="aspect-square w-full" />
      <button
        type="button"
        onClick={() => setZoom(zoom === 'body' ? 'pelvis' : 'body')}
        className="absolute top-3 right-3 flex items-center gap-1.5 rounded-xl bg-bg/80 px-2.5 py-1.5 text-[13px] font-medium backdrop-blur"
      >
        {zoom === 'body' ? <><ScanEye size={14} /> Насквозь</> : <><PersonStanding size={14} /> Тело</>}
      </button>
      <span className="pointer-events-none absolute top-3 left-3 rounded-xl bg-bg/80 px-2.5 py-1.5 text-[12px] text-muted backdrop-blur">
        Поверните пальцем
      </span>
      {step && (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-2xl bg-bg/85 px-3 py-2 backdrop-blur">
          <div className="flex items-center gap-2 text-[14px] font-semibold">
            <span className={`size-2.5 shrink-0 rounded-full ${stepTone(step.level, step.phase)}`} />
            {step.label}
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-2">
            <div className={`h-full rounded-full ${stepTone(step.level, step.phase)}`} style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

export function GuideText({ type, guide, position }: { type: BlockType; guide?: Guide; position?: Position }) {
  const g = guide ?? GUIDES[type];
  return (
    <div className="space-y-4 text-[15px] leading-relaxed">
      <p className="text-muted">{g.goal}</p>
      {position && <p className="rounded-2xl bg-surface-2 px-3 py-2 text-[14px]"><b>Положение:</b> {POSITION_LABEL[position].toLowerCase()}.</p>}
      <div>
        <h4 className="mb-2 text-[15px] font-semibold">Как выполнять</h4>
        <ol className="space-y-2">
          {g.steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 text-[13px] font-semibold">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="flex gap-3">
        <Wind size={18} className="mt-1 shrink-0 text-breath" />
        <p><b>Дыхание.</b> {g.breath}</p>
      </div>
      <div className="flex gap-3">
        <Hand size={18} className="mt-1 shrink-0 text-calm" />
        <p><b>Что чувствовать.</b> {g.feel}</p>
      </div>
      <div>
        <h4 className="mb-2 text-[15px] font-semibold">Ошибки</h4>
        <ul className="space-y-1.5">
          {g.mistakes.map((s, i) => (
            <li key={i} className="flex gap-2.5"><X size={18} className="mt-1 shrink-0 text-squeeze" strokeWidth={3} /><span>{s}</span></li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Легенда вида «насквозь» */
export function FigureLegend() {
  const items: [string, string][] = [
    [ANATOMY_COLORS.muscle, 'мышцы: тазовое дно, сфинктер, диафрагма'],
    [ANATOMY_COLORS.active, 'мышца работает'],
    [ANATOMY_COLORS.bone, 'кости'],
  ];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
      {items.map(([c, t]) => <span key={t} className="flex items-center gap-1.5"><span className="size-2.5 rounded-full ring-1 ring-line" style={{ background: c }} />{t}</span>)}
    </div>
  );
}

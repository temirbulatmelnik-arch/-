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

/** front — быстрые с передней подсказкой: сразу вид насквозь на основание пениса */
export function ExerciseDemo({ type, position, front = false, initialZoom = front ? 'pelvis' : 'body', autoRotate = !front }: {
  type: BlockType; position: Position; front?: boolean; initialZoom?: FigureZoom; autoRotate?: boolean;
}) {
  const { motion, step, progress } = useDemoMotion(type, position, front);
  const [zoom, setZoom] = useState<FigureZoom>(initialZoom);

  return (
    <div className="stage hairline relative overflow-hidden rounded-[30px]">
      <Figure key={front ? 'front' : 'back'} motion={motion} pose={poseFor(position)} zoom={zoom} focus={focusFor(type, front)} autoRotate={autoRotate} className="aspect-square w-full" />
      <button
        type="button"
        onClick={() => setZoom(zoom === 'body' ? 'pelvis' : 'body')}
        className="hairline absolute top-3 right-3 flex items-center gap-1.5 rounded-full bg-bg/75 px-3 py-1.5 text-[10.5px] font-medium tracking-[0.16em] uppercase backdrop-blur"
      >
        {zoom === 'body' ? <><ScanEye size={13} className="text-gold" /> Насквозь</> : <><PersonStanding size={13} className="text-gold" /> Тело</>}
      </button>
      <span className="pointer-events-none absolute top-3.5 left-4 text-[10px] tracking-[0.18em] text-muted uppercase">
        Поверните пальцем
      </span>
      {step && (
        <div className="hairline pointer-events-none absolute inset-x-3 bottom-3 rounded-[20px] bg-bg/80 px-4 py-2.5 backdrop-blur">
          <div className="font-display flex items-center gap-2 text-[17px]">
            <span className={`size-2.5 shrink-0 rounded-full ${stepTone(step.level, step.phase)}`} />
            {step.label}
          </div>
          <div className="mt-2 h-[2px] overflow-hidden rounded-full bg-line">
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
      {position && <p className="hairline rounded-2xl bg-surface px-4 py-2.5 text-[14px]"><span className="eyebrow mr-2 text-gold">Положение</span>{POSITION_LABEL[position].toLowerCase()}</p>}
      <div>
        <h4 className="font-display mb-3 text-[22px]">Как выполнять</h4>
        <ol className="space-y-2">
          {g.steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="font-display grid size-7 shrink-0 place-items-center rounded-full border border-gold/45 text-[14px] text-gold">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="flex gap-3">
        <Wind size={18} strokeWidth={1.5} className="mt-1 shrink-0 text-breath" />
        <p><b>Дыхание.</b> {g.breath}</p>
      </div>
      <div className="flex gap-3">
        <Hand size={18} strokeWidth={1.5} className="mt-1 shrink-0 text-calm" />
        <p><b>Что чувствовать.</b> {g.feel}</p>
      </div>
      <div>
        <h4 className="font-display mb-3 text-[22px]">Ошибки</h4>
        <ul className="space-y-1.5">
          {g.mistakes.map((s, i) => (
            <li key={i} className="flex gap-2.5"><X size={17} className="mt-1 shrink-0 text-squeeze" strokeWidth={2} /><span>{s}</span></li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Легенда вида «насквозь» */
export function FigureLegend() {
  const items: [string, string][] = [
    [ANATOMY_COLORS.muscle, 'мышцы: тазовое дно, сфинктеры, диафрагма'],
    [ANATOMY_COLORS.active, 'мышца работает'],
    [ANATOMY_COLORS.bone, 'кости'],
    [ANATOMY_COLORS.penis, 'пенис и мошонка'],
    [ANATOMY_COLORS.testes, 'яички'],
  ];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
      {items.map(([c, t]) => <span key={t} className="flex items-center gap-1.5"><span className="size-2.5 rounded-full ring-1 ring-line" style={{ background: c }} />{t}</span>)}
    </div>
  );
}

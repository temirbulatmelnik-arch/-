// Демонстрация упражнения на 3D-фигуре, карта мышц и подробная техника.
import { Hand, PersonStanding, ScanEye, Wind, X } from 'lucide-react';
import { useState } from 'react';
import { EXERCISES, POSE_LABEL, type ExerciseId } from '../engine/exercises';
import { muscleNames, type MuscleMap } from '../engine/muscles';
import { Figure, useDemoMotion, viewFor } from './Figure';

function stepTone(amount: number, phase: string) {
  if (phase === 'inhale' || phase === 'exhale') return 'bg-stretch';
  return amount > 0 ? 'bg-work' : 'bg-gold';
}

export function ExerciseDemo({ ex, initialXray = true, autoRotate = true, className = '' }: { ex: ExerciseId; initialXray?: boolean; autoRotate?: boolean; className?: string }) {
  const { motion, step, progress } = useDemoMotion(ex);
  const [xray, setXray] = useState(initialXray);
  const e = EXERCISES[ex];
  return (
    <div className={`relative overflow-hidden rounded-[28px] ${e.block === 'face' ? 'bg-face' : 'bg-posture'} ${className}`}>
      <Figure motion={motion} pose={e.pose} view={viewFor(ex)} xray={xray} muscles={e.muscles} autoRotate={autoRotate} className="aspect-square w-full" />
      <button type="button" onClick={() => setXray(!xray)}
        className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full bg-white/45 px-3 py-1.5 text-[12.5px] font-medium text-card backdrop-blur-md dark:bg-black/30">
        {xray ? <><PersonStanding size={14} /> Тело</> : <><ScanEye size={14} /> Мышцы</>}
      </button>
      <span className="pointer-events-none absolute top-3 left-3 rounded-full bg-white/45 px-3 py-1.5 text-[12px] text-card backdrop-blur-md dark:bg-black/30">Поверните пальцем</span>
      {step && (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-2xl bg-white/55 px-3.5 py-2.5 text-card backdrop-blur-md dark:bg-black/40">
          <div className="flex items-center gap-2 text-[14px] font-semibold">
            <span className={`size-2 shrink-0 rounded-full ${stepTone(step.amount, step.phase)}`} />
            {step.label}
          </div>
          <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
            <div className={`h-full rounded-full ${stepTone(step.amount, step.phase)}`} style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

const GROUPS: { key: keyof MuscleMap; label: string; dot: string }[] = [
  { key: 'work', label: 'Работают', dot: 'bg-work' },
  { key: 'also', label: 'Помогают', dot: 'bg-work/45' },
  { key: 'stretch', label: 'Растягиваются', dot: 'bg-stretch' },
  { key: 'quiet', label: 'Должны молчать', dot: 'ring-2 ring-warn ring-inset' },
];

export function MuscleList({ muscles, compact = false }: { muscles: MuscleMap; compact?: boolean }) {
  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-3'}>
      {GROUPS.filter(g => muscles[g.key]?.length).map(g => (
        <div key={g.key} className="flex gap-3">
          <div className="flex w-[118px] shrink-0 items-center gap-2 text-[12px] font-semibold tracking-wide text-muted uppercase">
            <span className={`size-2.5 shrink-0 rounded-full ${g.dot}`} />{g.label}
          </div>
          <div className="text-[14px] leading-snug">{muscleNames(muscles[g.key]).join(', ')}</div>
        </div>
      ))}
    </div>
  );
}

export function GuideText({ ex, withPose = true }: { ex: ExerciseId; withPose?: boolean }) {
  const e = EXERCISES[ex];
  const g = e.guide;
  return (
    <div className="space-y-5 text-[15px] leading-relaxed">
      <p className="text-muted">{g.goal}</p>
      {withPose && <p className="hairline rounded-2xl bg-surface px-4 py-2.5 text-[14px]"><span className="eyebrow mr-2 text-gold">Положение</span>{POSE_LABEL[e.pose].toLowerCase()}</p>}
      <div>
        <h4 className="font-display mb-2.5 text-[22px]">Как выполнять</h4>
        <ol className="space-y-2.5">
          {g.steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="font-display grid size-6 shrink-0 place-items-center rounded-full border border-gold/50 text-[15px] text-gold">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="flex gap-3"><Wind size={18} className="mt-1 shrink-0 text-stretch" /><p><b className="font-semibold">Дыхание.</b> {g.breath}</p></div>
      <div className="flex gap-3"><Hand size={18} className="mt-1 shrink-0 text-gold" /><p><b className="font-semibold">Что чувствовать.</b> {g.feel}</p></div>
      <div>
        <h4 className="font-display mb-2.5 text-[22px]">Ошибки</h4>
        <ul className="space-y-1.5">
          {g.mistakes.map((s, i) => <li key={i} className="flex gap-2.5"><X size={17} className="mt-1 shrink-0 text-warn" strokeWidth={2.5} /><span>{s}</span></li>)}
        </ul>
      </div>
      <div>
        <h4 className="font-display mb-2.5 text-[22px]">Мышцы</h4>
        <MuscleList muscles={e.muscles} />
      </div>
      {e.evidence && <p className="rounded-2xl bg-surface-2 px-4 py-3 text-[13px] leading-snug text-muted"><span className="eyebrow mr-1.5 text-gold">Основание</span> {e.evidence}</p>}
    </div>
  );
}

/** Легенда вида «насквозь» */
export function FigureLegend() {
  const items: [string, string][] = [['bg-work', 'работают'], ['bg-stretch', 'растягиваются'], ['ring-2 ring-warn ring-inset', 'должны молчать']];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
      {items.map(([c, t]) => <span key={t} className="flex items-center gap-1.5"><span className={`size-2.5 rounded-full ${c}`} />{t}</span>)}
    </div>
  );
}

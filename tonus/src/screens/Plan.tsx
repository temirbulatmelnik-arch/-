import { motion } from 'motion/react';
import { Check, ChevronRight, Clock } from 'lucide-react';
import { useState } from 'react';
import { ExerciseDemo, FigureLegend, GuideText } from '../components/ExerciseDemo';
import { Chip, ScreenHeader, Sheet, PrimaryButton, plural } from '../components/ui';
import { BLOCK_INFO, LEVELS, POSITION_LABEL, POSITION_SHORT, type BlockType, type Level } from '../engine/program';
import { levelReadiness } from '../engine/stats';
import { buildTimeline, formatDuration } from '../engine/timeline';
import { useStore } from '../store/store';
import { blockSummary } from './Today';

const BLOCK_ORDER: BlockType[] = ['breath', 'slow', 'quick', 'lift', 'endurance', 'release'];

const dot = (t: BlockType) => (BLOCK_INFO[t].color === 'squeeze' ? 'bg-squeeze' : t === 'breath' ? 'bg-breath' : 'bg-calm');

export function Plan() {
  const { levelId, history, setLevel } = useStore();
  const [open, setOpen] = useState<Level | null>(null);
  const [exercise, setExercise] = useState<BlockType | null>(null);
  const current = LEVELS.find(l => l.id === levelId) ?? LEVELS[0];
  const ready = levelReadiness(history, levelId);

  return (
    <div className="pb-4">
      <ScreenHeader title="Программа" subtitle={`${LEVELS.length} уровней. Переход — когда текущий даётся легко.`} />

      <section className="card mx-5 p-5">
        <h2 className="text-[17px] font-semibold">Из чего состоит тренировка</h2>
        <ul className="mt-3 space-y-3">
          {BLOCK_ORDER.map(t => (
            <li key={t}>
              <button type="button" onClick={() => setExercise(t)} className="flex w-full gap-3 text-left">
                <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${dot(t)}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium">{BLOCK_INFO[t].title} <span className="font-normal text-muted">— {BLOCK_INFO[t].short.toLowerCase()}</span></span>
                  <span className="block text-[14px] leading-snug text-muted">{BLOCK_INFO[t].how}</span>
                  <span className="mt-1 inline-flex items-center gap-0.5 text-[13px] font-medium text-calm">Показать в 3D <ChevronRight size={14} /></span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-4 rounded-2xl bg-surface-2 p-3 text-[13px] leading-snug text-muted">
          Рекомендуемый режим — 3 тренировки в день, каждый день. Уровни 1–4 выполняются сидя на твёрдом стуле, с 5-го — стоя.
        </p>
      </section>

      <ol className="mt-4 space-y-2 px-5">
        {LEVELS.map(l => {
          const tl = buildTimeline(l);
          const current = l.id === levelId;
          const passed = l.id < levelId;
          return (
            <li key={l.id}>
              <motion.button
                type="button"
                whileTap={{ scale: 0.98 }}
                onClick={() => setOpen(l)}
                className={`card flex w-full items-center gap-4 p-4 text-left ${current ? 'ring-2 ring-calm' : ''}`}
              >
                <span className={`grid size-11 shrink-0 place-items-center rounded-2xl text-[17px] font-semibold ${current ? 'bg-calm text-on-accent' : passed ? 'bg-calm/15 text-calm' : 'bg-surface-2 text-muted'}`}>
                  {passed ? <Check size={20} strokeWidth={3} /> : l.id}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-[16px] font-semibold">{l.name}</span>
                    {current && <Chip tone="calm">сейчас</Chip>}
                  </span>
                  <span className="block text-[13px] text-muted">{l.subtitle} · {POSITION_SHORT[l.position]} · {formatDuration(tl.total)}</span>
                  {current && Number.isFinite(ready.need) && (
                    <span className="mt-2 block">
                      <span className="block h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <span className="block h-full rounded-full bg-calm" style={{ width: `${Math.min(100, (ready.done / ready.need) * 100)}%` }} />
                      </span>
                      <span className="mt-1 block text-[12px] text-muted">{Math.min(ready.done, ready.need)} из {ready.need} тренировок до следующего уровня</span>
                    </span>
                  )}
                </span>
              </motion.button>
            </li>
          );
        })}
      </ol>

      <Sheet open={!!exercise} onClose={() => setExercise(null)} title={exercise ? BLOCK_INFO[exercise].title : ''}>
        {exercise && (
          <div>
            <ExerciseDemo type={exercise} position={current.position} />
            <div className="mt-2"><FigureLegend /></div>
            <div className="mt-5"><GuideText type={exercise} position={current.position} /></div>
          </div>
        )}
      </Sheet>

      <Sheet open={!!open} onClose={() => setOpen(null)} title={open ? `Уровень ${open.id} · ${open.name}` : ''}>
        {open && <LevelDetails level={open} current={open.id === levelId} onSelect={() => { setLevel(open.id); setOpen(null); }} />}
      </Sheet>
    </div>
  );
}

function LevelDetails({ level, current, onSelect }: { level: Level; current: boolean; onSelect: () => void }) {
  const tl = buildTimeline(level);
  return (
    <div>
      <p className="text-[15px] text-muted">{level.subtitle}. {POSITION_LABEL[level.position]}.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Chip><Clock size={14} /> {formatDuration(tl.total)}</Chip>
        <Chip tone="squeeze">{tl.contractions} {plural(tl.contractions, 'сокращение', 'сокращения', 'сокращений')}</Chip>
        <Chip>под нагрузкой {formatDuration(tl.tension)}</Chip>
      </div>
      <ul className="card mt-4 divide-y divide-line px-4">
        {level.blocks.map((b, i) => (
          <li key={i} className="flex items-center justify-between gap-3 py-3 text-[15px]">
            <span className="flex items-center gap-2"><span className={`size-2.5 rounded-full ${dot(b.type)}`} />{BLOCK_INFO[b.type].title}</span>
            <span className="text-right text-[14px] text-muted">{blockSummary(b)}</span>
          </li>
        ))}
      </ul>
      {Number.isFinite(level.minSessions) && (
        <p className="mt-3 text-[13px] text-muted">Переход на следующий уровень приложение предложит после {level.minSessions} тренировок, если последние прошли без «тяжело» и без дискомфорта.</p>
      )}
      <PrimaryButton onClick={onSelect} disabled={current} className="mt-5">
        {current ? 'Это ваш текущий уровень' : 'Выбрать этот уровень'}
      </PrimaryButton>
    </div>
  );
}

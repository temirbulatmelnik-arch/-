import { motion } from 'motion/react';
import { Check, ChevronRight, Clock } from 'lucide-react';
import { useState } from 'react';
import { ExerciseDemo, FigureLegend, GuideText } from '../components/ExerciseDemo';
import { Chip, ScreenHeader, Sheet, PrimaryButton, plural } from '../components/ui';
import { BLOCK_INFO, LEVELS, POSITION_LABEL, POSITION_SHORT, blockTitle, sessionLevel, type Block, type BlockType, type Level } from '../engine/program';
import { levelReadiness, type LevelReadiness } from '../engine/stats';
import { buildTimeline, formatDuration } from '../engine/timeline';
import { useStore } from '../store/store';
import { NextLevel, blockSummary, dotClass } from './Today';

const BLOCK_ORDER: BlockType[] = ['breath', 'slow', 'quick', 'endurance', 'knack', 'lift', 'release'];

export function Plan() {
  const { levelId, levelSince, history, checks, setLevel } = useStore();
  const [open, setOpen] = useState<Level | null>(null);
  const [exercise, setExercise] = useState<BlockType | null>(null);
  const current = LEVELS.find(l => l.id === levelId) ?? LEVELS[0];
  const ready = levelReadiness(history, levelId, { since: levelSince, checks });

  return (
    <div className="pb-4">
      <ScreenHeader title="Программа" subtitle="8 уровней и поддержка. Переход — не раньше чем через 2 недели, когда все сжатия в полную силу и с запасом." />

      <section className="card mx-5 p-5">
        <h2 className="text-[17px] font-semibold">Из чего состоит тренировка</h2>
        <ul className="mt-3 space-y-3">
          {BLOCK_ORDER.map(t => (
            <li key={t}>
              <button type="button" onClick={() => setExercise(t)} className="flex w-full gap-3 text-left">
                <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${dotClass(t)}`} />
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
          Каждый день — одна основная тренировка, она главная. Лёгкие на 2–3 минуты — 1–2 раза по желанию: их пропуск не мешает прогрессу.
          Уровни 1–4 — сидя на твёрдом стуле, 5–8 — стоя. Весь путь занимает 3–5 месяцев: столько в исследованиях формировался эффект.
          Затем поддержка: 2–3 полные тренировки в неделю и ежедневный «Knack».
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
                  {current && Number.isFinite(ready.needDays) && (
                    <span className="mt-2 block">
                      <span className="block h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <span className="block h-full rounded-full bg-calm" style={{ width: `${Math.min(100, (ready.days / ready.needDays) * 100)}%` }} />
                      </span>
                      <span className="mt-1 block text-[12px] text-muted">{Math.min(ready.days, ready.needDays)} из {ready.needDays} дней · {Math.min(ready.done, ready.need)} из {ready.need} тренировок</span>
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
        {open && <LevelDetails level={open} current={open.id === levelId} ready={open.id === levelId ? ready : undefined} onSelect={() => { setLevel(open.id); setOpen(null); }} />}
      </Sheet>
    </div>
  );
}

function BlockList({ blocks }: { blocks: Block[] }) {
  return (
    <ul className="card divide-y divide-line px-4">
      {blocks.map((b, i) => (
        <li key={i} className="flex items-center justify-between gap-3 py-3 text-[15px]">
          <span className="flex items-center gap-2"><span className={`size-2.5 shrink-0 rounded-full ${dotClass(b.type)}`} />{blockTitle(b)}</span>
          <span className="text-right text-[14px] text-muted">{blockSummary(b)}</span>
        </li>
      ))}
    </ul>
  );
}

function LevelDetails({ level, current, ready, onSelect }: { level: Level; current: boolean; ready?: LevelReadiness; onSelect: () => void }) {
  const tl = buildTimeline(level);
  const light = buildTimeline(sessionLevel(level, 'light'));
  return (
    <div>
      <p className="text-[15px] text-muted">{level.subtitle}. {POSITION_LABEL[level.position]}.</p>
      <h3 className="mt-4 mb-2 text-[15px] font-semibold">{level.maintenance ? 'Полная тренировка, 2–3 раза в неделю' : 'Основная тренировка, каждый день'}</h3>
      <div className="mb-3 flex flex-wrap gap-2">
        <Chip><Clock size={14} /> {formatDuration(tl.total)}</Chip>
        <Chip tone="squeeze">{tl.contractions} {plural(tl.contractions, 'сокращение', 'сокращения', 'сокращений')}</Chip>
        <Chip>под нагрузкой {formatDuration(tl.tension)}</Chip>
      </div>
      <BlockList blocks={level.blocks} />
      <h3 className="mt-5 mb-2 text-[15px] font-semibold">{level.maintenance ? 'Ежедневный «Knack»' : 'Лёгкая тренировка, по желанию'} · {formatDuration(light.total)}</h3>
      <BlockList blocks={level.light} />
      {level.maintenance ? (
        <p className="mt-3 text-[13px] text-muted">
          Раз в месяц — контроль техники и самотест. Раз в 3 месяца или при падении самотеста больше чем на 20 % приложение предложит 4-недельный интенсивный блок на уровне «Пик».
        </p>
      ) : (
        <p className="mt-3 text-[13px] text-muted">
          Переход на следующий уровень — не раньше чем через {level.minDays} {plural(level.minDays, 'день', 'дня', 'дней')} и {level.minSessions} основных тренировок,
          когда три последние оценены «с запасом», без дискомфорта и есть свежая проверка техники.
        </p>
      )}
      {ready && !level.maintenance && <NextLevel r={ready} />}
      <PrimaryButton onClick={onSelect} disabled={current} className="mt-5">
        {current ? 'Это ваш текущий уровень' : 'Выбрать этот уровень'}
      </PrimaryButton>
    </div>
  );
}

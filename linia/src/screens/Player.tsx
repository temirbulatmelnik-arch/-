import { AnimatePresence, motion } from 'motion/react';
import { Check, CircleGauge, Frown, Hand, Meh, Pause, PersonStanding, Play, ScanEye, SkipForward, Smile, Vibrate, VibrateOff, Volume2, VolumeX, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ExerciseDemo, FigureLegend, GuideText } from '../components/Exercise';
import { Figure, viewFor } from '../components/Figure';
import type { FigureMotion } from '../components/figureTypes';
import { IconButton, PrimaryButton, SecondaryButton, Switch } from '../components/ui';
import { STOP_SIGNS } from '../engine/content';
import { speak } from '../engine/cues';
import { EXERCISES, type BlockId } from '../engine/exercises';
import { doseText } from '../engine/format';
import { blockPlan } from '../engine/plan';
import { BLOCKS, sessionItems, SESSION_TITLE, type Item, type SessionKind } from '../engine/program';
import type { Rating } from '../engine/stats';
import { amountAt, buildTimeline, formatDuration, type Phase } from '../engine/timeline';
import { useWorkout, type WorkoutState } from '../engine/useWorkout';
import { useStore } from '../store/store';
import { useSessionOptions } from './useBlock';

/** Занятие засчитывается, если выполнено не меньше этой доли */
const COMPLETE_SHARE = 0.6;
/** Через сколько секунд упражнение начнётся само, если не нажать «Начать» */
const INTRO_AUTOSTART = 30;

const clock = (sec: number) => {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const phaseColor = (phase: Phase, amount: number) =>
  phase === 'inhale' || phase === 'exhale' ? 'var(--stretch)' : phase === 'prep' || phase === 'switch' ? 'var(--gold)' : amount > 0.05 ? 'var(--work)' : 'var(--gold)';

export function Player({ block, kind, onClose }: { block: BlockId; kind: SessionKind; onClose: () => void }) {
  const bs = useStore(s => s.blocks[block]);
  const history = useStore(s => s.history);
  const opts = useSessionOptions();
  // уровень и ступень фиксируются в начале занятия
  const [{ plan, items }] = useState(() => {
    const p = blockPlan(block, bs, history);
    return { plan: p, items: sessionItems(p.training, kind, opts) };
  });
  const settings = useStore(s => s.settings);
  // с голосом паузы перед упражнениями длиннее — в них звучит техника; включение голоса посреди занятия ленту не меняет
  const [voice] = useState(() => settings.voice);
  const tl = useMemo(() => buildTimeline(items, { stage: plan.stage, voice }), [items, plan.stage, voice]);
  const setSettings = useStore(s => s.setSettings);
  const addSession = useStore(s => s.addSession);
  const { state, pause, resume, skip, finishHold, seek } = useWorkout(tl, settings);
  const [confirmExit, setConfirmExit] = useState(false);
  const savedId = useRef<string | null>(null);
  const [intro, setIntro] = useState<number | null>(null);
  const shown = useRef(new Set<number>());
  const [xray, setXray] = useState(true);
  const figureMotion = useRef<FigureMotion>({ anim: tl.steps[0].anim, amount: 0, phase: 'prep' });

  const step = tl.steps[state.index];
  const amount = amountAt(tl, state.index, state.offset);
  const progress = Math.min(1, state.offset / step.duration);
  const left = Math.max(0, Math.ceil(step.duration - state.offset));
  const ex = EXERCISES[step.ex];
  const quick = step.duration <= 1.01 && step.phase !== 'prep';
  const audible = settings.sound || settings.voice;
  figureMotion.current = { anim: step.anim, amount, phase: step.phase, side: step.side };

  // перед каждым упражнением основного занятия — пауза и подробное объяснение с 3D-демонстрацией
  useEffect(() => {
    if (kind !== 'core' || !settings.intro || state.done || step.phase !== 'prep' || shown.current.has(step.item)) return;
    shown.current.add(step.item);
    pause();
    setIntro(step.item);
    speak(step.speak ?? EXERCISES[items[step.item].ex].voice, settings);
  }, [state.index]);

  // техника уже прозвучала на экране объяснения — после «Начать» остаётся короткий отсчёт подготовки
  const startItem = () => {
    setIntro(null);
    if (step.phase === 'prep') seek(tl.starts[state.index] + Math.max(0, step.duration - 3));
    resume({ silent: true });
  };
  const skipItem = () => { setIntro(null); skip(); resume(); };

  const completed = state.worked >= tl.total * COMPLETE_SHARE;
  const save = () => {
    if (savedId.current) return savedId.current;
    const id = `${Date.now()}`;
    addSession({
      id, at: new Date().toISOString(), block, kind, levelId: plan.level.id,
      duration: Math.round(state.worked), planned: Math.round(tl.total), completed, reps: state.reps,
      holds: state.holds.length ? state.holds : undefined,
    });
    savedId.current = id;
    return id;
  };

  const [doneId, setDoneId] = useState<string | null>(null);
  useEffect(() => { if (state.done) setDoneId(save()); }, [state.done]);

  if (state.done) return doneId ? <Summary state={state} block={block} kind={kind} levelName={plan.training.name} completed={completed} saveId={doneId} onClose={onClose} /> : null;

  const exit = () => {
    if (state.worked >= 20) save();
    onClose();
  };
  const itemNo = step.item + 1;
  const title = items[step.item].circuit ? `Круг Y–T–W · ${ex.title.replace(' лёжа на животе', '')}` : ex.title;

  return (
    <div className="pt-safe pb-safe fixed inset-0 z-40 flex flex-col bg-bg">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5">
        <div className="flex items-center gap-2 pt-3">
          <IconButton label="Завершить" onClick={() => { pause(); setConfirmExit(true); }} className="hairline bg-surface"><X size={19} /></IconButton>
          <div className="min-w-0 flex-1 text-center">
            <div className="truncate text-[15px] font-semibold">{title}</div>
            <div className="text-[12.5px] text-muted tabular-nums">{tl.items.length > 1 ? `${itemNo} из ${tl.items.length} · ` : ''}{clock(tl.total - state.t)}</div>
          </div>
          <IconButton label={audible ? 'Выключить звук и голос' : 'Включить звук и голос'} onClick={() => setSettings({ sound: !audible, voice: !audible })} className="hairline bg-surface">
            {audible ? <Volume2 size={19} /> : <VolumeX size={19} className="text-muted" />}
          </IconButton>
          <IconButton label={settings.vibration ? 'Выключить вибрацию' : 'Включить вибрацию'} onClick={() => setSettings({ vibration: !settings.vibration })} className="hairline bg-surface">
            {settings.vibration ? <Vibrate size={19} /> : <VibrateOff size={19} className="text-muted" />}
          </IconButton>
        </div>

        <div className="mt-4 flex gap-[3px]" aria-hidden>
          {tl.items.map((b, i) => {
            const p = Math.min(1, Math.max(0, (state.t - b.start) / (b.end - b.start)));
            return (
              <div key={i} className="h-[3px] overflow-hidden rounded-full bg-surface-2" style={{ flexGrow: b.end - b.start }}>
                <div className="bg-gold-grad h-full rounded-full" style={{ width: `${p * 100}%` }} />
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex justify-center">
          <div className="inline-flex rounded-full bg-surface-2 p-0.5 text-[12.5px] font-medium">
            {([['figure', 'Анатомия', PersonStanding], ['timer', 'Таймер', CircleGauge]] as const).map(([id, label, Icon]) => (
              <button key={id} type="button" onClick={() => setSettings({ playerView: id })} aria-pressed={settings.playerView === id}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition ${settings.playerView === id ? 'bg-bg text-ink shadow-sm' : 'text-muted'}`}>
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center py-3">
          {settings.playerView === 'figure' ? (
            <div className={`relative w-full max-w-[350px] overflow-hidden rounded-[30px] ${block === 'face' ? 'bg-face' : 'bg-posture'}`}>
              <Figure motion={figureMotion} pose={ex.pose} view={viewFor(step.ex)} xray={xray} muscles={ex.muscles} className="aspect-square w-full"
                fallback={<div className="grid aspect-square w-full place-items-center"><BigRing value={quick ? step.rep ?? 0 : left} progress={progress} color={phaseColor(step.phase, amount)} /></div>} />
              <Countdown value={quick ? step.rep ?? 0 : left} sub={quick ? `из ${step.reps}` : undefined} progress={progress} color={phaseColor(step.phase, amount)} />
              <button type="button" onClick={() => setXray(!xray)} className="text-card absolute top-3 right-3 flex items-center gap-1.5 rounded-full bg-white/45 px-3 py-1.5 text-[12.5px] font-medium backdrop-blur-md dark:bg-black/30">
                {xray ? <><PersonStanding size={14} /> Тело</> : <><ScanEye size={14} /> Мышцы</>}
              </button>
              {step.side && <span className="text-card absolute right-3 bottom-3 rounded-full bg-white/45 px-3 py-1.5 text-[12.5px] font-medium backdrop-blur-md dark:bg-black/30">{step.side === 'l' ? 'Левая сторона' : 'Правая сторона'}</span>}
            </div>
          ) : (
            <BigRing value={quick ? step.rep ?? 0 : left} sub={quick ? `из ${step.reps}` : undefined} progress={progress} color={phaseColor(step.phase, amount)} />
          )}

          <AnimatePresence mode="wait">
            <motion.div key={state.index} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: quick ? 0.08 : 0.22 }}
              className="mt-4 min-h-[112px] text-center" aria-live="polite">
              <div className="font-display text-[34px] leading-tight">{step.label}</div>
              {step.hint && <p className="mx-auto mt-1.5 max-w-[34ch] text-[14.5px] leading-snug text-muted">{step.hint}</p>}
              {step.reps && step.phase !== 'prep' && step.phase !== 'switch' && !quick && (
                <div className="mt-2.5 text-[13px] font-medium tracking-wide text-faint">
                  Повтор {step.rep} из {step.reps}{step.sets && step.sets > 1 && step.set ? ` · подход ${step.set} из ${step.sets}` : ''}
                </div>
              )}
              {!step.reps && step.sets && step.sets > 1 && step.set && step.phase === 'hold' && <div className="mt-2.5 text-[13px] font-medium text-faint">Подход {step.set} из {step.sets}</div>}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-center gap-6 pb-6">
          {step.failure ? (
            <IconButton label="Не могу держать" onClick={finishHold} className="hairline size-14 bg-surface text-work"><Hand size={22} /></IconButton>
          ) : <div className="size-14" />}
          <motion.button type="button" whileTap={{ scale: 0.94 }} onClick={state.paused ? () => resume() : pause} aria-label={state.paused ? 'Продолжить' : 'Пауза'}
            className="bg-gold-grad grid size-20 place-items-center rounded-full text-on-accent shadow-xl shadow-gold/30">
            {state.paused ? <Play size={32} className="translate-x-0.5" fill="currentColor" /> : <Pause size={30} fill="currentColor" />}
          </motion.button>
          <IconButton label="Следующее упражнение" onClick={skip} className="hairline size-14 bg-surface"><SkipForward size={22} /></IconButton>
        </div>
        {step.failure && <p className="-mt-3 pb-4 text-center text-[13px] text-muted">Подбородок «уехал» или голова дрожит — нажмите ладонь</p>}
      </div>

      <AnimatePresence>
        {intro !== null && !confirmExit && (
          <ItemIntro key={intro} item={items[intro]} stage={plan.stage} index={intro} count={items.length}
            onStart={startItem} onSkip={skipItem} onExit={() => setConfirmExit(true)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmExit && (
          <motion.div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="card w-full max-w-sm p-6 text-center" initial={{ scale: 0.95 }} animate={{ scale: 1 }}>
              <h2 className="font-display text-[30px]">Завершить занятие?</h2>
              <p className="mt-2 text-[14.5px] text-muted">Выполненная часть сохранится. Занятие засчитывается, если выполнено хотя бы на {COMPLETE_SHARE * 100} %.</p>
              <div className="mt-5 grid gap-2">
                <PrimaryButton onClick={() => { setConfirmExit(false); if (intro === null) resume(); }}>Продолжить</PrimaryButton>
                <SecondaryButton onClick={exit}>Завершить</SecondaryButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Countdown({ value, sub, progress, color }: { value: number; sub?: string; progress: number; color: string }) {
  const r = 30, len = 2 * Math.PI * r;
  return (
    <div className="pointer-events-none absolute top-3 left-3 grid size-[76px] place-items-center rounded-full bg-bg/80 backdrop-blur">
      <svg viewBox="0 0 76 76" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="38" cy="38" r={r} fill="none" stroke="var(--line)" strokeWidth="3" />
        <circle cx="38" cy="38" r={r} fill="none" style={{ stroke: color }} strokeWidth="3" strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - progress)} />
      </svg>
      <div className="text-center leading-none">
        <div className="font-display text-[32px] tabular-nums">{value}</div>
        {sub && <div className="mt-0.5 text-[10.5px] text-muted">{sub}</div>}
      </div>
    </div>
  );
}

function BigRing({ value, sub, progress, color }: { value: number; sub?: string; progress: number; color: string }) {
  const r = 120, len = 2 * Math.PI * r;
  return (
    <div className="relative grid size-[270px] place-items-center">
      <svg viewBox="0 0 270 270" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="135" cy="135" r={r} fill="none" stroke="var(--line)" strokeWidth="2" />
        <circle cx="135" cy="135" r={r} fill="none" style={{ stroke: color, transition: 'stroke .3s' }} strokeWidth="3" strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - progress)} />
      </svg>
      <div className="text-center">
        <div className="font-display text-[96px] leading-none tabular-nums">{value}</div>
        {sub && <div className="mt-1 text-[15px] text-muted">{sub}</div>}
      </div>
    </div>
  );
}

function ItemIntro({ item, stage, index, count, onStart, onSkip, onExit }: {
  item: Item; stage: number; index: number; count: number; onStart: () => void; onSkip: () => void; onExit: () => void;
}) {
  const e = EXERCISES[item.ex];
  const title = item.circuit ? 'Круг Y–T–W' : e.title;
  const [left, setLeft] = useState(INTRO_AUTOSTART);
  const [auto, setAuto] = useState(true);
  const startRef = useRef(onStart);
  startRef.current = onStart;

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => setLeft(l => {
      if (l <= 1) { clearInterval(id); startRef.current(); return 0; }
      return l - 1;
    }), 1000);
    return () => clearInterval(id);
  }, [auto]);

  return (
    <motion.div className="pt-safe fixed inset-0 z-50 flex flex-col bg-bg" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
      role="dialog" aria-modal="true" aria-label={title}>
      <div className="mx-auto w-full max-w-md flex-1 overflow-y-auto px-5 pb-4">
        <div className="flex items-center gap-2 pt-3">
          <IconButton label="Завершить занятие" onClick={onExit} className="hairline bg-surface"><X size={19} /></IconButton>
          <div className="eyebrow flex-1 text-center text-gold">Упражнение {index + 1} из {count}</div>
          <div className="size-11" />
        </div>
        <h1 className="font-display mt-3 text-[38px] leading-[1.02]">{title}</h1>
        <p className="mt-1.5 mb-4 text-[15px] text-muted">{doseText(item, stage)}{item.effort ? ` · усилие ${item.effort}` : ''}</p>
        <ExerciseDemo ex={item.circuit ? item.circuit[0] : item.ex} />
        <div className="mt-2.5"><FigureLegend /></div>
        <div className="mt-6"><GuideText ex={item.ex} /></div>
        {item.circuit && <p className="mt-4 text-[14px] text-muted">По кругу: «Y», «T» и «W» лёжа на животе — подробная техника каждого в библиотеке блока.</p>}
      </div>
      <div className="pb-safe border-t border-line bg-bg/95 backdrop-blur">
        <div className="mx-auto w-full max-w-md px-5 pt-3 pb-4">
          <PrimaryButton onClick={onStart}><Play size={18} fill="currentColor" /> Начать</PrimaryButton>
          <div className="mt-2 flex items-center justify-between text-[13px] text-muted">
            {auto ? <button type="button" onClick={() => setAuto(false)} className="py-1">Начнётся через {left} с · <span className="underline underline-offset-2">не начинать</span></button> : <span>Начните, когда будете готовы</span>}
            <button type="button" onClick={onSkip} className="py-1 font-medium">Пропустить</button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/** Оценка основного занятия: переход на уровень — после трёх «с запасом» подряд */
export const RATINGS: { id: Rating; label: string; hint: string; icon: typeof Smile }[] = [
  { id: 'easy', label: 'С запасом', hint: 'чисто, мог бы ещё', icon: Smile },
  { id: 'ok', label: 'На пределе', hint: 'чисто, но тяжело', icon: Meh },
  { id: 'hard', label: 'Техника ломалась', hint: 'не держал форму', icon: Frown },
];

function Summary({ state, block, kind, levelName, completed, saveId, onClose }: { state: WorkoutState; block: BlockId; kind: SessionKind; levelName: string; completed: boolean; saveId: string; onClose: () => void }) {
  const rateSession = useStore(s => s.rateSession);
  const [rating, setRating] = useState<Rating | null>(null);
  const [discomfort, setDiscomfort] = useState(false);
  const finish = () => {
    if (rating || discomfort) rateSession(saveId, rating ?? undefined, discomfort);
    onClose();
  };
  return (
    <div className="pt-safe pb-safe fixed inset-0 z-40 overflow-y-auto bg-bg">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col px-5 py-8">
        <motion.div className="bg-gold-grad mx-auto grid size-24 place-items-center rounded-full text-on-accent shadow-xl shadow-gold/30"
          initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }}>
          <Check size={44} strokeWidth={2.6} />
        </motion.div>
        <h1 className="font-display mt-5 text-center text-[42px] leading-none">{completed ? 'Прекрасно' : 'Выполнено частично'}</h1>
        <p className="mt-2 text-center text-[15px] text-muted">{BLOCKS[block].title} · {SESSION_TITLE[kind].toLowerCase()} · {levelName}</p>
        {!completed && <p className="mt-3 rounded-2xl bg-surface-2 p-3 text-center text-[14px] text-muted">Занятие засчитывается, если выполнено хотя бы на {COMPLETE_SHARE * 100} %. Эта часть сохранена.</p>}

        <div className="mt-7 grid grid-cols-2 gap-2">
          {[['Время', formatDuration(state.worked)], ['Повторов', String(state.reps)]].map(([k, v]) => (
            <div key={k} className="card px-3 py-4 text-center">
              <div className="font-display text-[28px] leading-none">{v}</div>
              <div className="mt-1.5 text-[12px] text-muted">{k}</div>
            </div>
          ))}
        </div>
        {state.holds.length > 0 && (
          <div className="card mt-2 px-4 py-4 text-center">
            <div className="text-[13px] text-muted">Подъём головы до отказа</div>
            <div className="font-display mt-1 text-[28px]">{state.holds.map(h => `${h} с`).join(' · ')}</div>
            <div className="mt-1 text-[12.5px] text-muted">Цель «Пика» — не меньше 40 с, средняя норма мужчин 38,9 с</div>
          </div>
        )}

        {kind === 'core' && (
          <>
            <h2 className="font-display mt-8 text-[26px]">Как прошло?</h2>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {RATINGS.map(r => (
                <motion.button key={r.id} type="button" whileTap={{ scale: 0.95 }} onClick={() => setRating(r.id)} aria-pressed={rating === r.id}
                  className={`flex flex-col items-center gap-1 rounded-[22px] border px-2 py-3.5 text-[13.5px] font-medium transition ${rating === r.id ? 'border-gold bg-gold/12' : 'border-line bg-surface'}`}>
                  <r.icon size={24} strokeWidth={1.6} className={rating === r.id ? 'text-gold' : 'text-muted'} />
                  <span className="text-center leading-tight">{r.label}</span>
                  <span className="text-center text-[11px] font-normal text-muted">{r.hint}</span>
                </motion.button>
              ))}
            </div>
            <p className="mt-2 text-[13px] leading-snug text-muted">«С запасом» увеличивает удержания на следующем занятии. Переход на уровень — после трёх таких подряд и не раньше срока уровня.</p>
          </>
        )}

        <div className="card mt-4 px-4"><Switch checked={discomfort} onChange={setDiscomfort} label="Была боль или дискомфорт" /></div>
        <AnimatePresence>
          {discomfort && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="mt-3 rounded-[22px] bg-warn/10 p-4 text-[14px] leading-relaxed">
                Упражнения не должны вызывать боль. Сделайте перерыв на день-два и продолжите уровнем ниже. Обратитесь к врачу, если:
                <ul className="mt-2 space-y-1">{STOP_SIGNS[block].map(s => <li key={s}>— {s}</li>)}</ul>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-auto pt-8"><PrimaryButton onClick={finish}>Готово</PrimaryButton></div>
      </div>
    </div>
  );
}

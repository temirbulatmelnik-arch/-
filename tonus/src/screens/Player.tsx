import { AnimatePresence, motion } from 'motion/react';
import { Check, CircleDot, Frown, Meh, Pause, PersonStanding, Play, ScanEye, SkipForward, Smile, Vibrate, VibrateOff, Volume2, VolumeX, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ExerciseDemo, FigureLegend, GuideText } from '../components/ExerciseDemo';
import { Figure, focusFor, poseFor } from '../components/Figure';
import type { FigureMotion, FigureZoom } from '../components/Figure3D';
import { SphincterRing, phaseColor } from '../components/SphincterRing';
import { IconButton, PrimaryButton, SecondaryButton, Switch } from '../components/ui';
import { speak } from '../engine/cues';
import { guideFor } from '../engine/guides';
import { BLOCK_INFO, SESSION_TITLE, blockTitle, type Block, type Level, type SessionKind } from '../engine/program';
import { todayCount, type Rating } from '../engine/stats';
import { buildTimeline, formatDuration, levelAt, type Phase } from '../engine/timeline';
import { useWorkout, type WorkoutState } from '../engine/useWorkout';
import { useStore } from '../store/store';

/** Тренировка идёт в дневную цель, если выполнено не меньше этой доли */
const COMPLETE_SHARE = 0.6;
/** Через сколько секунд упражнение начнётся само, если не нажать «Начать» */
const INTRO_AUTOSTART = 30;

const clock = (sec: number) => {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function Player({ level, kind, onClose }: { level: Level; kind: SessionKind; onClose: () => void }) {
  const tl = useMemo(() => buildTimeline(level), [level]);
  const settings = useStore(s => s.settings);
  const setSettings = useStore(s => s.setSettings);
  const addSession = useStore(s => s.addSession);
  const { state, pause, resume, skip } = useWorkout(tl, settings);
  const [confirmExit, setConfirmExit] = useState(false);
  const savedId = useRef<string | null>(null);
  const [intro, setIntro] = useState<number | null>(null);
  const shownIntros = useRef(new Set<number>());
  const [zoom, setZoom] = useState<FigureZoom>('pelvis');
  const figureMotion = useRef<FigureMotion>({ level: 0, phase: 'prep' });

  const step = tl.steps[state.index];
  const lvl = levelAt(tl, state.index, state.offset);
  const progress = Math.min(1, state.offset / step.duration);
  const left = Math.max(0, Math.ceil(step.duration - state.offset));
  const blockNo = step.block + 1;
  const quick = step.blockType === 'quick' && step.phase !== 'prep' && !step.pause;
  const audible = settings.sound || settings.voice;
  figureMotion.current = { level: lvl, phase: step.phase };

  // перед каждым упражнением — пауза и подробное объяснение с 3D-демонстрацией
  useEffect(() => {
    if (!settings.intro || state.done || step.phase !== 'prep' || shownIntros.current.has(step.block)) return;
    shownIntros.current.add(step.block);
    pause();
    setIntro(step.block);
    speak(guideFor(level.blocks[step.block]).voice, settings);
  }, [state.index]);

  const startBlock = () => {
    setIntro(null);
    resume();
  };
  const skipBlock = () => {
    setIntro(null);
    skip();
    resume();
  };

  const completed = state.worked >= tl.total * COMPLETE_SHARE;

  const save = () => {
    if (savedId.current) return savedId.current;
    const id = `${Date.now()}`;
    addSession({
      id, at: new Date().toISOString(), levelId: level.id, kind,
      duration: Math.round(state.worked), planned: Math.round(tl.total), completed,
      contractions: state.contractions,
    });
    savedId.current = id;
    return id;
  };

  const [doneId, setDoneId] = useState<string | null>(null);
  useEffect(() => {
    if (state.done) setDoneId(save());
  }, [state.done]);

  if (state.done) return doneId ? <Summary state={state} level={level} kind={kind} completed={completed} saveId={doneId} onClose={onClose} /> : null;

  const exit = () => {
    if (state.worked >= 20) save();
    onClose();
  };

  return (
    <div className="pt-safe pb-safe fixed inset-0 z-40 flex flex-col bg-bg">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5">
        {/* верх */}
        <div className="flex items-center gap-2 pt-3">
          <IconButton label="Завершить" onClick={() => { pause(); setConfirmExit(true); }} className="bg-surface-2"><X size={20} /></IconButton>
          <div className="min-w-0 flex-1 text-center">
            <div className="truncate text-[15px] font-semibold">{blockTitle(level.blocks[step.block])}</div>
            <div className="text-[13px] text-muted tabular-nums">Блок {blockNo} из {tl.blocks.length} · {clock(tl.total - state.t)}</div>
          </div>
          <IconButton label={audible ? 'Выключить звук и голос' : 'Включить звук и голос'} onClick={() => setSettings({ sound: !audible, voice: !audible })} className="bg-surface-2">
            {audible ? <Volume2 size={20} /> : <VolumeX size={20} className="text-muted" />}
          </IconButton>
          <IconButton label={settings.vibration ? 'Выключить вибрацию' : 'Включить вибрацию'} onClick={() => setSettings({ vibration: !settings.vibration })} className="bg-surface-2">
            {settings.vibration ? <Vibrate size={20} /> : <VibrateOff size={20} className="text-muted" />}
          </IconButton>
        </div>

        {/* полоса блоков */}
        <div className="mt-4 flex gap-[2px]" aria-hidden>
          {tl.blocks.map((b, i) => {
            const p = Math.min(1, Math.max(0, (state.t - b.start) / (b.end - b.start)));
            const work = BLOCK_INFO[b.type].color === 'squeeze';
            return (
              <div key={i} className="h-1.5 overflow-hidden rounded-full bg-surface-2" style={{ flexGrow: b.end - b.start }}>
                <div className={`h-full rounded-full ${work ? 'bg-squeeze' : b.type === 'breath' ? 'bg-breath' : 'bg-calm'}`} style={{ width: `${p * 100}%` }} />
              </div>
            );
          })}
        </div>

        {/* вид: фигура или кольцо */}
        <div className="mt-3 flex justify-center">
          <div className="inline-flex rounded-xl bg-surface-2 p-0.5 text-[13px] font-medium">
            {([['figure', 'Фигура', PersonStanding], ['ring', 'Кольцо', CircleDot]] as const).map(([id, label, Icon]) => (
              <button key={id} type="button" onClick={() => setSettings({ playerView: id })} aria-pressed={settings.playerView === id}
                className={`flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 transition ${settings.playerView === id ? 'bg-bg text-ink shadow-sm' : 'text-muted'}`}>
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center py-3">
          {settings.playerView === 'figure' ? (
            <div className="relative w-full max-w-[340px]">
              <Figure motion={figureMotion} pose={poseFor(level.position)} zoom={zoom} focus={focusFor(step.blockType)} className="aspect-square w-full overflow-hidden rounded-3xl bg-surface-2"
                fallback={<SphincterRing level={lvl} phase={step.phase} progress={progress} />} />
              <Countdown value={quick ? step.rep ?? 0 : left} sub={quick ? `из ${step.reps}` : undefined} progress={progress} phase={step.phase} level={lvl} />
              <button type="button" onClick={() => setZoom(zoom === 'body' ? 'pelvis' : 'body')}
                className="absolute top-3 right-3 flex items-center gap-1.5 rounded-xl bg-bg/80 px-2.5 py-1.5 text-[13px] font-medium backdrop-blur">
                {zoom === 'body' ? <><ScanEye size={14} /> Насквозь</> : <><PersonStanding size={14} /> Тело</>}
              </button>
            </div>
          ) : (
            <SphincterRing level={lvl} phase={step.phase} progress={progress}>
              {quick ? (
                <div className="text-center">
                  <div className="text-[64px] leading-none font-semibold">{step.rep}</div>
                  <div className="mt-1 text-[15px] text-muted">из {step.reps}</div>
                </div>
              ) : (
                <div className="text-[76px] leading-none font-semibold" aria-live="off">{left}</div>
              )}
            </SphincterRing>
          )}

          <AnimatePresence mode="wait">
            <motion.div
              key={state.index}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: quick ? 0.08 : 0.25 }}
              className="mt-4 min-h-[104px] text-center"
              aria-live="polite"
            >
              <div className="text-[26px] leading-tight font-semibold">{step.label}</div>
              {step.hint && <p className="mx-auto mt-2 max-w-[34ch] text-[15px] leading-snug text-muted">{step.hint}</p>}
              {step.reps && step.phase !== 'prep' && !quick && (
                <div className="mt-3 text-[14px] font-medium text-faint">Повтор {step.rep} из {step.reps}</div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* управление */}
        <div className="flex items-center justify-center gap-6 pb-6">
          <div className="size-14" />
          <motion.button
            type="button"
            whileTap={{ scale: 0.94 }}
            onClick={state.paused ? resume : pause}
            aria-label={state.paused ? 'Продолжить' : 'Пауза'}
            className="grid size-20 place-items-center rounded-full bg-ink text-bg shadow-xl"
          >
            {state.paused ? <Play size={34} className="translate-x-0.5" fill="currentColor" /> : <Pause size={32} fill="currentColor" />}
          </motion.button>
          <IconButton label="Следующий блок" onClick={skip} className="size-14 bg-surface-2"><SkipForward size={24} /></IconButton>
        </div>
      </div>

      <AnimatePresence>
        {intro !== null && !confirmExit && (
          <BlockIntro
            key={intro}
            block={level.blocks[intro]}
            index={intro}
            count={tl.blocks.length}
            level={level}
            onStart={startBlock}
            onSkip={skipBlock}
            onExit={() => setConfirmExit(true)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmExit && (
          <motion.div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="card w-full max-w-sm p-6 text-center" initial={{ scale: 0.95 }} animate={{ scale: 1 }}>
              <h2 className="text-xl font-semibold">Завершить тренировку?</h2>
              <p className="mt-2 text-[15px] text-muted">Выполненная часть сохранится в журнале. В дневную цель идут тренировки, выполненные хотя бы на {COMPLETE_SHARE * 100} %.</p>
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

/** Обратный отсчёт поверх 3D-фигуры */
function Countdown({ value, sub, progress, phase, level }: { value: number; sub?: string; progress: number; phase: Phase; level: number }) {
  const r = 30, len = 2 * Math.PI * r;
  return (
    <div className="pointer-events-none absolute top-3 left-3 grid size-[76px] place-items-center rounded-full bg-bg/85 backdrop-blur">
      <svg viewBox="0 0 76 76" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="38" cy="38" r={r} fill="none" stroke="var(--line)" strokeWidth="4" />
        <circle cx="38" cy="38" r={r} fill="none" style={{ stroke: phaseColor(phase, level) }} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={len} strokeDashoffset={len * (1 - progress)} />
      </svg>
      <div className="text-center leading-none">
        <div className="text-[28px] font-semibold tabular-nums">{value}</div>
        {sub && <div className="mt-0.5 text-[11px] text-muted">{sub}</div>}
      </div>
    </div>
  );
}

/** Подробное объяснение перед упражнением: 3D-демонстрация, шаги, дыхание, ошибки */
function BlockIntro({ block, index, count, level, onStart, onSkip, onExit }: {
  block: Block; index: number; count: number; level: Level; onStart: () => void; onSkip: () => void; onExit: () => void;
}) {
  const type = block.type;
  const title = blockTitle(block);
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
    <motion.div
      className="pt-safe fixed inset-0 z-50 flex flex-col bg-bg"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
      role="dialog" aria-modal="true" aria-label={title}
    >
      <div className="mx-auto w-full max-w-md flex-1 overflow-y-auto px-5 pb-4">
        <div className="flex items-center gap-2 pt-3">
          <IconButton label="Завершить тренировку" onClick={onExit} className="bg-surface-2"><X size={20} /></IconButton>
          <div className="flex-1 text-center text-[13px] font-medium tracking-wide text-muted uppercase">Упражнение {index + 1} из {count}</div>
          <div className="size-11" />
        </div>
        <h1 className="mt-3 text-[28px] leading-tight font-semibold tracking-tight">{title}</h1>
        <p className="mb-4 text-[15px] text-muted">{BLOCK_INFO[type].short}</p>
        <ExerciseDemo type={type} position={level.position} />
        <div className="mt-2"><FigureLegend /></div>
        <div className="mt-5"><GuideText type={type} guide={guideFor(block)} position={level.position} /></div>
      </div>
      <div className="pb-safe border-t border-line bg-bg/95 backdrop-blur">
        <div className="mx-auto w-full max-w-md px-5 pt-3 pb-4">
          <PrimaryButton onClick={onStart}><Play size={20} fill="currentColor" /> Начать</PrimaryButton>
          <div className="mt-2 flex items-center justify-between text-[13px] text-muted">
            {auto ? (
              <button type="button" onClick={() => setAuto(false)} className="py-1">Начнётся через {left} с · <span className="underline underline-offset-2">не начинать</span></button>
            ) : <span>Начните, когда будете готовы</span>}
            <button type="button" onClick={onSkip} className="py-1 font-medium">Пропустить</button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/** Оценка основной тренировки по силе и запасу: переход на уровень — после трёх «с запасом» подряд */
export const RATINGS: { id: Rating; label: string; hint: string; icon: typeof Smile }[] = [
  { id: 'easy', label: 'С запасом', hint: 'мог бы ещё 1–2', icon: Smile },
  { id: 'ok', label: 'На пределе', hint: 'всё в полную силу', icon: Meh },
  { id: 'hard', label: 'Ослабевало', hint: 'не держал до конца', icon: Frown },
];

function Summary({ state, level, kind, completed, saveId, onClose }: { state: WorkoutState; level: Level; kind: SessionKind; completed: boolean; saveId: string; onClose: () => void }) {
  const history = useStore(s => s.history);
  const goal = useStore(s => s.settings.dailyGoal);
  const rateSession = useStore(s => s.rateSession);
  const [rating, setRating] = useState<Rating | null>(null);
  const [discomfort, setDiscomfort] = useState(false);
  const today = todayCount(history);

  const finish = () => {
    if (rating || discomfort) rateSession(saveId, rating ?? undefined, discomfort);
    onClose();
  };

  return (
    <div className="pt-safe pb-safe fixed inset-0 z-40 overflow-y-auto bg-bg">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col px-5 py-8">
        <motion.div
          className="mx-auto grid size-24 place-items-center rounded-full bg-gradient-to-br from-calm to-breath text-on-accent shadow-lg shadow-calm/30"
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        >
          <Check size={48} strokeWidth={3} />
        </motion.div>
        <h1 className="mt-5 text-center text-[28px] font-semibold">{completed ? 'Готово!' : 'Выполнено частично'}</h1>
        <p className="mt-1 text-center text-[15px] text-muted">{SESSION_TITLE[kind]} · уровень {level.id} «{level.name}» · сегодня {today} из {goal}</p>
        {!completed && (
          <p className="mt-3 rounded-2xl bg-surface-2 p-3 text-center text-[14px] text-muted">
            В дневную цель идут тренировки, выполненные хотя бы на {COMPLETE_SHARE * 100} %. Эта сохранена в журнале.
          </p>
        )}

        <div className="mt-6 grid grid-cols-3 gap-2">
          {[
            ['Время', formatDuration(state.worked)],
            ['Сокращений', String(state.contractions)],
            ['Под нагрузкой', formatDuration(state.tension)],
          ].map(([k, v]) => (
            <div key={k} className="card px-3 py-4 text-center">
              <div className="text-[20px] font-semibold">{v}</div>
              <div className="mt-1 text-[12px] text-muted">{k}</div>
            </div>
          ))}
        </div>

        {kind === 'main' && (
          <>
            <h2 className="mt-8 text-[17px] font-semibold">Все удержания — в полную силу?</h2>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {RATINGS.map(r => (
                <motion.button
                  key={r.id}
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setRating(r.id)}
                  aria-pressed={rating === r.id}
                  className={`flex flex-col items-center gap-1 rounded-2xl border px-2 py-3 text-[14px] font-medium transition ${rating === r.id ? 'border-calm bg-calm/15' : 'border-line bg-surface'}`}
                >
                  <r.icon size={26} className={rating === r.id ? 'text-calm' : 'text-muted'} />
                  {r.label}
                  <span className="text-[11px] font-normal text-muted">{r.hint}</span>
                </motion.button>
              ))}
            </div>
            <p className="mt-2 text-[13px] text-muted">Следующий уровень приложение предложит после трёх тренировок подряд «с запасом» — но не раньше чем через 2 недели.</p>
          </>
        )}

        <div className="card mt-4 px-4">
          <Switch checked={discomfort} onChange={setDiscomfort} label="Был дискомфорт или боль" />
        </div>
        <AnimatePresence>
          {discomfort && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="mt-3 rounded-2xl bg-gold/15 p-4 text-[14px] leading-relaxed">
                Упражнения не должны вызывать боль. 1–2 дня делайте только расслабление — кнопка появится на главном экране, затем вернитесь
                на уровень ниже. Если боль повторяется, болит при семяизвержении, в промежности или яичках, мышца «не отпускается», есть кровь,
                трещина или обострение геморроя — покажитесь специалисту.
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-auto pt-8">
          <PrimaryButton onClick={finish}>Готово</PrimaryButton>
        </div>
      </div>
    </div>
  );
}

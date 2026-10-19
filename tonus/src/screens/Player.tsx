import { AnimatePresence, motion } from 'motion/react';
import { Check, Frown, Meh, Pause, Play, SkipForward, Smile, Vibrate, VibrateOff, Volume2, VolumeX, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SphincterRing } from '../components/SphincterRing';
import { IconButton, PrimaryButton, SecondaryButton, Switch } from '../components/ui';
import { BLOCK_INFO, type Level } from '../engine/program';
import { todayCount, type Rating } from '../engine/stats';
import { buildTimeline, formatDuration, levelAt } from '../engine/timeline';
import { useWorkout, type WorkoutState } from '../engine/useWorkout';
import { useStore } from '../store/store';

/** Тренировка идёт в дневную цель, если выполнено не меньше этой доли */
const COMPLETE_SHARE = 0.6;

const clock = (sec: number) => {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function Player({ level, onClose }: { level: Level; onClose: () => void }) {
  const tl = useMemo(() => buildTimeline(level), [level]);
  const settings = useStore(s => s.settings);
  const setSettings = useStore(s => s.setSettings);
  const addSession = useStore(s => s.addSession);
  const { state, pause, resume, skip } = useWorkout(tl, settings);
  const [confirmExit, setConfirmExit] = useState(false);
  const savedId = useRef<string | null>(null);

  const step = tl.steps[state.index];
  const lvl = levelAt(tl, state.index, state.offset);
  const progress = Math.min(1, state.offset / step.duration);
  const left = Math.max(0, Math.ceil(step.duration - state.offset));
  const blockNo = step.block + 1;
  const quick = step.blockType === 'quick' && step.phase !== 'prep';
  const audible = settings.sound || settings.voice;

  const completed = state.worked >= tl.total * COMPLETE_SHARE;

  const save = () => {
    if (savedId.current) return savedId.current;
    const id = `${Date.now()}`;
    addSession({
      id, at: new Date().toISOString(), levelId: level.id,
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

  if (state.done) return doneId ? <Summary state={state} level={level} completed={completed} saveId={doneId} onClose={onClose} /> : null;

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
            <div className="truncate text-[15px] font-semibold">{BLOCK_INFO[step.blockType].title}</div>
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

        {/* кольцо */}
        <div className="flex flex-1 flex-col items-center justify-center py-4">
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

          <AnimatePresence mode="wait">
            <motion.div
              key={state.index}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: quick ? 0.08 : 0.25 }}
              className="mt-6 min-h-[112px] text-center"
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
        {confirmExit && (
          <motion.div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="card w-full max-w-sm p-6 text-center" initial={{ scale: 0.95 }} animate={{ scale: 1 }}>
              <h2 className="text-xl font-semibold">Завершить тренировку?</h2>
              <p className="mt-2 text-[15px] text-muted">Выполненная часть сохранится в журнале. В дневную цель идут тренировки, выполненные хотя бы на {COMPLETE_SHARE * 100} %.</p>
              <div className="mt-5 grid gap-2">
                <PrimaryButton onClick={() => { setConfirmExit(false); resume(); }}>Продолжить</PrimaryButton>
                <SecondaryButton onClick={exit}>Завершить</SecondaryButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const RATINGS: { id: Rating; label: string; icon: typeof Smile }[] = [
  { id: 'easy', label: 'Легко', icon: Smile },
  { id: 'ok', label: 'Нормально', icon: Meh },
  { id: 'hard', label: 'Тяжело', icon: Frown },
];

function Summary({ state, level, completed, saveId, onClose }: { state: WorkoutState; level: Level; completed: boolean; saveId: string; onClose: () => void }) {
  const history = useStore(s => s.history);
  const goal = useStore(s => s.settings.dailyGoal);
  const rateSession = useStore(s => s.rateSession);
  const [rating, setRating] = useState<Rating | null>(null);
  const [discomfort, setDiscomfort] = useState(false);
  const today = todayCount(history);

  const finish = () => {
    if (rating || discomfort) rateSession(saveId, rating ?? 'ok', discomfort);
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
        <p className="mt-1 text-center text-[15px] text-muted">Уровень {level.id} «{level.name}» · сегодня {today} из {goal}</p>
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

        <h2 className="mt-8 text-[17px] font-semibold">Как прошло?</h2>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {RATINGS.map(r => (
            <motion.button
              key={r.id}
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={() => setRating(r.id)}
              aria-pressed={rating === r.id}
              className={`flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-[14px] font-medium transition ${rating === r.id ? 'border-calm bg-calm/15' : 'border-line bg-surface'}`}
            >
              <r.icon size={26} className={rating === r.id ? 'text-calm' : 'text-muted'} />
              {r.label}
            </motion.button>
          ))}
        </div>
        <p className="mt-2 text-[13px] text-muted">Оценка помогает понять, когда переходить на следующий уровень.</p>

        <div className="card mt-4 px-4">
          <Switch checked={discomfort} onChange={setDiscomfort} label="Был дискомфорт или боль" />
        </div>
        <AnimatePresence>
          {discomfort && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="mt-3 rounded-2xl bg-gold/15 p-4 text-[14px] leading-relaxed">
                Упражнения не должны вызывать боль. Сделайте перерыв на 1–2 дня, затем вернитесь на уровень ниже и больше времени уделяйте
                расслаблению. Если боль повторяется, есть кровь, трещина или обострение геморроя — покажитесь проктологу.
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

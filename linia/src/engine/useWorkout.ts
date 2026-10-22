// Проигрыватель занятия: идёт по ленте шагов по реальному времени (performance.now),
// подаёт сигналы на каждом новом шаге и обратный отсчёт в конце удержаний.
import { useCallback, useEffect, useRef, useState } from 'react';
import { keepAwake, playCue, playTick, speak, stopSpeech, unlockAudio, type CueSettings } from './cues';
import { locate, nextItemStart, stepEnd, type Timeline } from './timeline';

export interface WorkoutState {
  t: number;
  index: number;
  offset: number;
  paused: boolean;
  done: boolean;
  /** секунд реально пройдено (без пропущенного) */
  worked: number;
  /** выполненные повторы — без пропущенных */
  reps: number;
  /** удержания до отказа, с */
  holds: number[];
}

export function useWorkout(tl: Timeline, cues: CueSettings) {
  const [state, setState] = useState<WorkoutState>({ t: 0, index: 0, offset: 0, paused: false, done: false, worked: 0, reps: 0, holds: [] });
  const startRef = useRef(0);
  const tRef = useRef(0);
  const skippedRef = useRef(0);
  const reps = useRef(0);
  const holds = useRef<number[]>([]);
  const counted = useRef(new Set<number>());
  const lastIndex = useRef(-1);
  const lastTick = useRef(-1);
  const said = useRef(new Set<string>());
  const pausedRef = useRef(false);
  const quiet = useRef(false);
  const doneRef = useRef(false);
  const raf = useRef(0);
  const cuesRef = useRef(cues);
  cuesRef.current = cues;

  const frame = useCallback(() => {
    const t = (performance.now() - startRef.current) / 1000;
    const prev = locate(tl, tRef.current);
    const prevStep = tl.steps[prev.index];
    tRef.current = t;
    const loc = locate(tl, t);
    const c = cuesRef.current;
    // удержание до отказа выдержано до потолка
    if (prevStep.failure && loc.index !== prev.index && !holds.current[prev.index]) holds.current[prev.index] = prevStep.duration;

    if (loc.done) {
      doneRef.current = true;
      playCue('done', c);
      speak('Занятие завершено. Прекрасно!', c);
      void keepAwake(false);
      setState({ t: tl.total, index: loc.index, offset: loc.offset, paused: false, done: true, worked: tl.total - skippedRef.current, reps: reps.current, holds: holds.current.filter(Boolean) });
      return;
    }

    const step = tl.steps[loc.index];
    if (loc.index !== lastIndex.current) {
      lastIndex.current = loc.index;
      lastTick.current = -1;
      // после паузы шаг начинается заново, но повтор считаем один раз
      if (step.counted && !counted.current.has(loc.index)) {
        counted.current.add(loc.index);
        reps.current++;
      }
      playCue(step.cue, c);
      if (step.speak && !quiet.current) speak(step.speak, c);
      quiet.current = false;
    }
    step.says?.forEach(([at, text], k) => {
      const key = `${loc.index}:${k}`;
      if (loc.offset >= at && !said.current.has(key)) {
        said.current.add(key);
        speak(text, c);
      }
    });
    if (step.tick) {
      const left = Math.ceil(step.duration - loc.offset);
      if (left <= 3 && left !== lastTick.current && left < Math.ceil(step.duration)) {
        lastTick.current = left;
        playTick(c);
      }
    }

    setState({ t, index: loc.index, offset: loc.offset, paused: false, done: false, worked: t - skippedRef.current, reps: reps.current, holds: holds.current.filter(Boolean) });
    raf.current = requestAnimationFrame(frame);
  }, [tl]);

  const run = useCallback((from: number) => {
    cancelAnimationFrame(raf.current);
    startRef.current = performance.now() - from * 1000;
    pausedRef.current = false;
    void keepAwake(true);
    raf.current = requestAnimationFrame(frame);
  }, [frame]);

  const pause = useCallback(() => {
    if (pausedRef.current || doneRef.current) return;
    pausedRef.current = true;
    cancelAnimationFrame(raf.current);
    stopSpeech();
    void keepAwake(false);
    setState(s => ({ ...s, paused: true }));
  }, []);

  /** silent — без повтора фразы текущего шага (её уже прочитали, например на экране объяснения) */
  const resume = useCallback((opts?: { silent?: boolean }) => {
    if (doneRef.current) return;
    unlockAudio();
    // после паузы заново подаём сигнал текущего шага
    lastIndex.current = -1;
    quiet.current = !!opts?.silent;
    run(tRef.current);
  }, [run]);

  const jump = useCallback((to: number) => {
    skippedRef.current += Math.max(0, to - tRef.current);
    tRef.current = to;
    lastIndex.current = -1;
    if (pausedRef.current) {
      const loc = locate(tl, to);
      setState(s => ({ ...s, t: to, index: loc.index, offset: loc.offset }));
    } else run(to);
  }, [tl, run]);

  /** к следующему упражнению */
  const skip = useCallback(() => {
    if (doneRef.current) return;
    unlockAudio();
    jump(nextItemStart(tl, tRef.current));
  }, [tl, jump]);

  /** «Не могу держать»: удержание до отказа закончено — записываем время и идём дальше */
  const finishHold = useCallback(() => {
    if (doneRef.current) return;
    const loc = locate(tl, tRef.current);
    if (!tl.steps[loc.index].failure) return;
    holds.current[loc.index] = Math.round(loc.offset);
    jump(stepEnd(tl, tRef.current));
  }, [tl, jump]);

  useEffect(() => {
    unlockAudio();
    run(0);
    const onVis = () => {
      if (document.visibilityState === 'hidden') pause();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf.current);
      document.removeEventListener('visibilitychange', onVis);
      stopSpeech();
      void keepAwake(false);
    };
  }, [run, pause]);

  return { state, pause, resume, skip, finishHold, seek: jump };
}

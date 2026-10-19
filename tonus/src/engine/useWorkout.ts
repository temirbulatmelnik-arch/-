// Проигрыватель тренировки: идёт по ленте шагов по реальному времени (performance.now),
// подаёт сигналы на каждом новом шаге и обратный отсчёт в конце удержаний.
import { useCallback, useEffect, useRef, useState } from 'react';
import { keepAwake, playCue, playTick, speak, stopSpeech, unlockAudio, type CueSettings } from './cues';
import { locate, nextBlockStart, type Timeline } from './timeline';

export interface WorkoutState {
  t: number;
  index: number;
  offset: number;
  paused: boolean;
  done: boolean;
  /** секунды, реально пройденные (без пропущенных блоков) */
  worked: number;
  /** выполненные сокращения и время под нагрузкой — без пропущенного */
  contractions: number;
  tension: number;
}

export function useWorkout(tl: Timeline, cues: CueSettings) {
  const [state, setState] = useState<WorkoutState>({ t: 0, index: 0, offset: 0, paused: false, done: false, worked: 0, contractions: 0, tension: 0 });
  const startRef = useRef(0);
  const tRef = useRef(0);
  const skippedRef = useRef(0);
  const doneWork = useRef({ contractions: 0, tension: 0 });
  const counted = useRef(new Set<number>());
  const lastIndex = useRef(-1);
  const lastTick = useRef(-1);
  const said = useRef(new Set<number>());
  const pausedRef = useRef(false);
  const doneRef = useRef(false);
  const raf = useRef(0);
  const cuesRef = useRef(cues);
  cuesRef.current = cues;

  const frame = useCallback(() => {
    const t = (performance.now() - startRef.current) / 1000;
    const prev = locate(tl, tRef.current);
    if (tl.steps[prev.index].level > 0) doneWork.current.tension += Math.min(0.25, Math.max(0, t - tRef.current));
    tRef.current = t;
    const loc = locate(tl, t);
    const c = cuesRef.current;

    if (loc.done) {
      doneRef.current = true;
      playCue('done', c);
      speak('Тренировка завершена. Отлично!', c);
      void keepAwake(false);
      setState({ t: tl.total, index: loc.index, offset: loc.offset, paused: false, done: true, worked: tl.total - skippedRef.current, ...doneWork.current });
      return;
    }

    const step = tl.steps[loc.index];
    if (loc.index !== lastIndex.current) {
      lastIndex.current = loc.index;
      lastTick.current = -1;
      // после паузы шаг начинается заново, но сокращение считаем один раз
      if (step.contraction && !counted.current.has(loc.index)) {
        counted.current.add(loc.index);
        doneWork.current.contractions++;
      }
      playCue(step.cue, c);
      if (step.speak) speak(step.speak, c);
    }
    if (step.say && loc.offset >= step.say[0] && !said.current.has(loc.index)) {
      said.current.add(loc.index);
      speak(step.say[1], c);
    }
    if (step.tick) {
      const left = Math.ceil(step.duration - loc.offset);
      if (left <= 3 && left !== lastTick.current && left < Math.ceil(step.duration)) {
        lastTick.current = left;
        playTick(c);
      }
    }

    setState({ t, index: loc.index, offset: loc.offset, paused: false, done: false, worked: t - skippedRef.current, ...doneWork.current });
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

  const resume = useCallback(() => {
    if (doneRef.current) return;
    unlockAudio();
    // после паузы заново подаём сигнал текущего шага
    lastIndex.current = -1;
    run(tRef.current);
  }, [run]);

  const skip = useCallback(() => {
    if (doneRef.current) return;
    unlockAudio();
    const next = nextBlockStart(tl, tRef.current);
    skippedRef.current += next - tRef.current;
    tRef.current = next;
    lastIndex.current = -1;
    if (pausedRef.current) {
      const loc = locate(tl, next);
      setState(s => ({ ...s, t: next, index: loc.index, offset: loc.offset }));
    } else run(next);
  }, [tl, run]);

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

  return { state, pause, resume, skip };
}

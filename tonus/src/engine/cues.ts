// Подсказки во время тренировки: тоны (Web Audio), вибрация, голос (Speech Synthesis), экран не гаснет (Wake Lock).
// Всё работает без файлов и без сети; если браузер чего-то не умеет — молча пропускаем.
import type { Cue } from './timeline';

let ctx: AudioContext | null = null;

/** Вызывать из обработчика нажатия: браузеры разрешают звук только после жеста пользователя */
export function unlockAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch { ctx = null; }
}

function tone(freqs: number[], dur = 0.16, gap = 0.02, vol = 0.18, type: OscillatorType = 'sine') {
  if (!ctx) return;
  let t = ctx.currentTime + 0.01;
  for (const f of freqs) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
    t += dur + gap;
  }
}

const SOUNDS: Record<Exclude<Cue, 'none'> | 'tick' | 'done', () => void> = {
  squeeze: () => tone([587, 880], 0.12, 0.01, 0.2),
  relax: () => tone([523, 392], 0.18, 0.02, 0.14),
  breath: () => tone([440], 0.5, 0, 0.07, 'triangle'),
  prep: () => tone([660, 990], 0.22, 0.06, 0.1, 'triangle'),
  tick: () => tone([1200], 0.04, 0, 0.06),
  done: () => tone([523, 659, 784, 1047], 0.16, 0.03, 0.16, 'triangle'),
};

const VIBES: Record<Exclude<Cue, 'none'> | 'done', number[]> = {
  squeeze: [90],
  relax: [30, 60, 30],
  breath: [20],
  prep: [40, 80, 40],
  done: [120, 80, 120, 80, 240],
};

export interface CueSettings { sound: boolean; vibration: boolean; voice: boolean; ticks: boolean }

export function playCue(cue: Cue | 'done', s: CueSettings) {
  if (cue === 'none') return;
  if (s.sound) SOUNDS[cue]();
  if (s.vibration && 'vibrate' in navigator) navigator.vibrate(VIBES[cue]);
}

export function playTick(s: CueSettings) {
  if (s.sound && s.ticks) SOUNDS.tick();
}

let ruVoice: SpeechSynthesisVoice | null | undefined;

function pickVoice(): SpeechSynthesisVoice | null {
  if (ruVoice !== undefined && ruVoice !== null) return ruVoice;
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return null;
  ruVoice = voices.find(v => v.lang.toLowerCase().startsWith('ru') && /milena|katya|google|yandex|irina/i.test(v.name))
    ?? voices.find(v => v.lang.toLowerCase().startsWith('ru')) ?? null;
  return ruVoice;
}

export const voiceSupported = () => typeof speechSynthesis !== 'undefined';

export function speak(text: string, s: CueSettings) {
  if (!s.voice || !voiceSupported()) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ru-RU';
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = 1.05;
    u.volume = 0.9;
    speechSynthesis.speak(u);
  } catch { /* голос недоступен */ }
}

export function stopSpeech() {
  if (voiceSupported()) speechSynthesis.cancel();
}

let lock: WakeLockSentinel | null = null;

export async function keepAwake(on: boolean) {
  try {
    if (on && 'wakeLock' in navigator && document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen');
    if (!on) { await lock?.release(); lock = null; }
  } catch { lock = null; }
}

// Статистика по журналу тренировок: серия дней, тренировки за день, готовность к следующему уровню.
import { levelById, LEVELS } from './program';

export type Rating = 'easy' | 'ok' | 'hard';

export interface SessionRecord {
  id: string;
  /** ISO-время окончания */
  at: string;
  levelId: number;
  /** сколько секунд реально выполнено */
  duration: number;
  planned: number;
  completed: boolean;
  contractions: number;
  rating?: Rating;
  discomfort?: boolean;
}

/** Локальная дата в виде YYYY-MM-DD */
export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function countByDay(history: SessionRecord[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of history) if (s.completed) {
    const k = dayKey(new Date(s.at));
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

/** Серия дней подряд хотя бы с одной тренировкой. Сегодняшний день ещё может быть впереди. */
export function streak(history: SessionRecord[], now = new Date()): number {
  const days = countByDay(history);
  let d = days.has(dayKey(now)) ? now : addDays(now, -1);
  let n = 0;
  while (days.has(dayKey(d))) { n++; d = addDays(d, -1); }
  return n;
}

export function bestStreak(history: SessionRecord[]): number {
  const keys = [...countByDay(history).keys()].sort();
  let best = 0, cur = 0, prev: string | null = null;
  for (const k of keys) {
    cur = prev && dayKey(addDays(new Date(prev + 'T12:00'), 1)) === k ? cur + 1 : 1;
    best = Math.max(best, cur);
    prev = k;
  }
  return best;
}

export function todayCount(history: SessionRecord[], now = new Date()): number {
  return countByDay(history).get(dayKey(now)) ?? 0;
}

export interface LevelReadiness {
  done: number;
  need: number;
  ready: boolean;
  /** последние тренировки были тяжёлыми или с дискомфортом — подниматься рано */
  holdBack: boolean;
}

export function levelReadiness(history: SessionRecord[], levelId: number): LevelReadiness {
  const level = levelById(levelId);
  const at = history.filter(s => s.completed && s.levelId === levelId);
  const last = at.slice(-3);
  const holdBack = last.some(s => s.rating === 'hard' || s.discomfort);
  const need = level.minSessions;
  const isLast = levelId === LEVELS[LEVELS.length - 1].id;
  return { done: at.length, need, ready: !isLast && at.length >= need && !holdBack, holdBack };
}

export function totals(history: SessionRecord[]) {
  const done = history.filter(s => s.completed);
  return {
    sessions: done.length,
    minutes: Math.round(history.reduce((a, s) => a + s.duration, 0) / 60),
    contractions: done.reduce((a, s) => a + s.contractions, 0),
  };
}

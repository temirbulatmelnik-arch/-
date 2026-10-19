// Статистика по журналу тренировок: серия дней, тренировки за день, готовность к следующему уровню,
// проверки техники и самотесты.
import { levelById, MAINTENANCE_ID, type SessionKind } from './program';

/** Оценка основной тренировки: easy — все сжатия в полную силу и есть запас на 1–2 повтора,
 *  ok — в полную силу, но без запаса, hard — сжатие ослабевало */
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
  /** старые записи без вида — основные тренировки */
  kind?: SessionKind;
  rating?: Rating;
  discomfort?: boolean;
}

/** Проверка техники и самотест */
export interface CheckRecord {
  id: string;
  at: string;
  /** все признаки правильного сжатия: спереди, промежность, задний проход, ягодицы и дыхание */
  technique: boolean;
  /** мышца полностью отпускается после сжатия */
  relaxes: boolean;
  /** секунд максимального сжатия, пока оно не начало ослабевать */
  hold?: number;
  /** чётких быстрых сокращений подряд */
  quick?: number;
}

const DAY = 86_400_000;
export const kindOf = (s: SessionRecord): SessionKind => s.kind ?? 'main';

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

/** Полных календарных дней между датами */
export function daysBetween(from: string | Date, to: Date): number {
  const a = new Date(from); a.setHours(0, 0, 0, 0);
  const b = new Date(to); b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / DAY);
}

export function countByDay(history: SessionRecord[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of history) if (s.completed) {
    const k = dayKey(new Date(s.at));
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

/** Серия дней подряд хотя бы с одной тренировкой. Сегодняшний день ещё может быть впереди.
 *  Пропуск лёгких тренировок серию не прерывает. */
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

export function todayDone(history: SessionRecord[], kind: SessionKind, now = new Date()): number {
  const k = dayKey(now);
  return history.filter(s => s.completed && kindOf(s) === kind && dayKey(new Date(s.at)) === k).length;
}

/** Основные тренировки с понедельника этой недели */
export function weekMains(history: SessionRecord[], now = new Date()): number {
  const monday = addDays(now, -((now.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return history.filter(s => s.completed && kindOf(s) === 'main' && new Date(s.at) >= monday).length;
}

/** Был ли дискомфорт за последние двое суток: тогда — только расслабление */
export function recentDiscomfort(history: SessionRecord[], now = new Date()): boolean {
  return history.some(s => s.discomfort && now.getTime() - new Date(s.at).getTime() < 2 * DAY);
}

/** Проверка техники действует 4 недели; повторять её каждые 3 недели, в поддержке — раз в месяц */
export const CHECK_VALID_DAYS = 28;
export const CHECK_EVERY_DAYS = 21;
export const CHECK_EVERY_MAINTENANCE = 30;

export interface CheckStatus {
  last?: CheckRecord;
  days?: number;
  /** проверки ещё не было, пора повторить или прошлая не удалась */
  due: 'first' | 'time' | 'retry' | null;
  /** свежая успешная проверка */
  valid: boolean;
}

export function checkStatus(checks: CheckRecord[], now = new Date(), maintenance = false): CheckStatus {
  const last = checks[checks.length - 1];
  if (!last) return { due: 'first', valid: false };
  const days = daysBetween(last.at, now);
  const ok = last.technique && last.relaxes;
  const every = maintenance ? CHECK_EVERY_MAINTENANCE : CHECK_EVERY_DAYS;
  const due = !ok && days >= 2 ? 'retry' : days >= every ? 'time' : null;
  return { last, days, due, valid: ok && days < CHECK_VALID_DAYS };
}

/** Результаты самотеста упали на 20 % и больше от лучших прежних (только проверки не раньше from) */
export function testDrop(checks: CheckRecord[], from?: string | Date): boolean {
  const tests = checks.filter(c => c.hold !== undefined || c.quick !== undefined);
  const last = tests[tests.length - 1];
  if (!last || tests.length < 2 || (from && new Date(last.at) < new Date(from))) return false;
  const prev = tests.slice(0, -1);
  const best = (f: 'hold' | 'quick') => Math.max(0, ...prev.map(c => c[f] ?? 0));
  const fell = (f: 'hold' | 'quick') => last[f] !== undefined && best(f) > 0 && last[f]! < best(f) * 0.8;
  return fell('hold') || fell('quick');
}

export interface LevelReadiness {
  /** основных тренировок на уровне и сколько нужно */
  done: number;
  need: number;
  /** дней на уровне и сколько нужно */
  days: number;
  needDays: number;
  /** последние три оценённые основные тренировки — в полную силу и с запасом */
  reserve: boolean;
  /** свежая успешная проверка техники */
  checked: boolean;
  ready: boolean;
  /** последние тренировки были тяжёлыми или с дискомфортом — подниматься рано */
  holdBack: boolean;
}

export function levelReadiness(history: SessionRecord[], levelId: number, { since, checks = [], now = new Date() }: { since?: string; checks?: CheckRecord[]; now?: Date } = {}): LevelReadiness {
  const level = levelById(levelId);
  const at = history.filter(s => s.completed && s.levelId === levelId && kindOf(s) === 'main');
  const holdBack = at.slice(-3).some(s => s.rating === 'hard' || s.discomfort);
  const rated = at.filter(s => s.rating).slice(-3);
  const reserve = rated.length === 3 && rated.every(s => s.rating === 'easy');
  const days = since ? daysBetween(since, now) : 0;
  const checked = checkStatus(checks, now).valid;
  const isLast = levelId === MAINTENANCE_ID;
  const ready = !isLast && at.length >= level.minSessions && days >= level.minDays && reserve && checked && !holdBack;
  return { done: at.length, need: level.minSessions, days, needDays: level.minDays, reserve, checked, ready, holdBack };
}

export function totals(history: SessionRecord[]) {
  const done = history.filter(s => s.completed);
  return {
    sessions: done.length,
    minutes: Math.round(history.reduce((a, s) => a + s.duration, 0) / 60),
    contractions: done.reduce((a, s) => a + s.contractions, 0),
  };
}

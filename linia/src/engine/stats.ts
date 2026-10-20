// Статистика по журналу: занятия за день и неделю, ступени роста, готовность к следующему уровню,
// расписание замеров и сигнал вернуться на уровень ниже.
import type { BlockId } from './exercises';
import { levelById, maxLevel, type SessionKind } from './program';

/** Оценка основного занятия: easy — все повторы чисто и есть запас, ok — на пределе, hard — техника ломалась */
export type Rating = 'easy' | 'ok' | 'hard';

export interface SessionRecord {
  id: string;
  /** ISO-время окончания */
  at: string;
  block: BlockId;
  kind: SessionKind;
  levelId: number;
  /** секунд реально выполнено */
  duration: number;
  planned: number;
  completed: boolean;
  reps: number;
  rating?: Rating;
  discomfort?: boolean;
  /** удержания до отказа, с — подъём головы на «Пике» */
  holds?: number[];
}

/** Замеры. cva — угол шеи по фото (и угол плеча), dnf — тест выносливости сгибателей шеи,
 *  profile — шейно-подбородочный угол, front — фото анфас, body — масса и окружность шеи,
 *  acromion — расстояние от акромиона до пола лёжа, мм */
export type CheckKind = 'cva' | 'dnf' | 'profile' | 'front' | 'body' | 'acromion';

export interface CheckRecord {
  id: string;
  at: string;
  kind: CheckKind;
  values: Partial<Record<'cva' | 'shoulder' | 'seconds' | 'angle' | 'weight' | 'neck' | 'left' | 'right' | 'shots', number>>;
  /** миниатюра фото (data URL) — хранится только на устройстве */
  thumb?: string;
}

export const CHECK_BLOCK: Record<CheckKind, BlockId> = { cva: 'posture', dnf: 'posture', acromion: 'posture', profile: 'face', front: 'face', body: 'face' };

const DAY = 86_400_000;

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

const done = (h: SessionRecord[], block?: BlockId, kind?: SessionKind) => h.filter(s => s.completed && (!block || s.block === block) && (!kind || s.kind === kind));

export function todayDone(history: SessionRecord[], block: BlockId, kind: SessionKind, now = new Date()): number {
  const k = dayKey(now);
  return done(history, block, kind).filter(s => dayKey(new Date(s.at)) === k).length;
}

export function mondayOf(now: Date): Date {
  const m = addDays(now, -((now.getDay() + 6) % 7));
  m.setHours(0, 0, 0, 0);
  return m;
}

/** Занятия вида kind с понедельника этой недели */
export function weekDone(history: SessionRecord[], block: BlockId, kind: SessionKind = 'core', now = new Date()): number {
  const monday = mondayOf(now);
  return done(history, block, kind).filter(s => new Date(s.at) >= monday).length;
}

/** Дни недели (пн = 0) с основным занятием блока */
export function weekDays(history: SessionRecord[], block: BlockId, now = new Date()): boolean[] {
  const monday = mondayOf(now);
  const out = Array(7).fill(false) as boolean[];
  for (const s of done(history, block, 'core')) {
    const d = daysBetween(monday, new Date(s.at));
    if (d >= 0 && d < 7) out[d] = true;
  }
  return out;
}

/** Серия дней подряд хотя бы с одним занятием в любом блоке; сегодняшний день ещё может быть впереди */
export function streak(history: SessionRecord[], now = new Date()): number {
  const days = new Set(done(history).map(s => dayKey(new Date(s.at))));
  let d = days.has(dayKey(now)) ? now : addDays(now, -1);
  let n = 0;
  while (days.has(dayKey(d))) { n++; d = addDays(d, -1); }
  return n;
}

/** Ступень внутри уровня: число основных занятий «с запасом» на нём */
export function stageOf(history: SessionRecord[], block: BlockId, levelId: number, since: string): number {
  return done(history, block, 'core').filter(s => s.levelId === levelId && s.rating === 'easy' && s.at >= since).length;
}

/** Был ли дискомфорт за последние сутки */
export function recentDiscomfort(history: SessionRecord[], block: BlockId, now = new Date()): boolean {
  return history.some(s => s.block === block && s.discomfort && now.getTime() - new Date(s.at).getTime() < DAY);
}

export interface LevelReadiness {
  /** занятий «с запасом» подряд на уровне и сколько нужно */
  streak: number;
  need: number;
  days: number;
  needDays: number;
  /** проверка техники пройдена на этом уровне */
  checked: boolean;
  /** боль или «техника ломалась» в последних занятиях */
  holdBack: boolean;
  ready: boolean;
  last: boolean;
}

export const EASY_NEEDED = 3;

export function readiness(history: SessionRecord[], block: BlockId, levelId: number, { since, techAt, now = new Date() }: { since: string; techAt?: string; now?: Date }): LevelReadiness {
  const level = levelById(block, levelId);
  const at = done(history, block, 'core').filter(s => s.levelId === levelId && s.at >= since);
  let run = 0;
  for (let i = at.length - 1; i >= 0 && at[i].rating === 'easy' && !at[i].discomfort; i--) run++;
  const holdBack = at.slice(-3).some(s => s.rating === 'hard' || s.discomfort) || recentDiscomfort(history, block, now);
  const days = daysBetween(since, now);
  const checked = !!techAt && techAt >= since;
  const last = levelId >= maxLevel(block) || !!level.maintenance;
  const ready = !last && run >= EASY_NEEDED && days >= level.minDays && checked && !holdBack;
  return { streak: Math.min(run, EASY_NEEDED), need: EASY_NEEDED, days, needDays: level.minDays, checked, holdBack, ready, last };
}

/** Замеры: в начале, на 4-й, 8-й и 12-й неделе, дальше осанка — раз в месяц, лицо — раз в 3 недели */
export const CHECK_WEEKS = [0, 4, 8, 12];
const KINDS: Record<BlockId, CheckKind> = { posture: 'cva', face: 'profile' };

export interface CheckPlan {
  /** следующий плановый замер */
  next: Date;
  /** номер недели программы для подписи */
  week: number;
  due: boolean;
  last?: CheckRecord;
}

export function checkPlan(checks: CheckRecord[], block: BlockId, started: string, now = new Date()): CheckPlan {
  const own = checks.filter(c => c.kind === KINDS[block]);
  const last = own[own.length - 1];
  const start = new Date(started);
  const after = (w: number) => addDays(start, w * 7);
  const every = block === 'posture' ? 4 : 3;
  let week = CHECK_WEEKS.find(w => !own.some(c => new Date(c.at) >= addDays(after(w), -3)));
  let next: Date;
  if (week !== undefined) next = after(week);
  else {
    next = addDays(new Date(last!.at), every * 7);
    week = Math.round(daysBetween(start, next) / 7);
  }
  return { next, week, due: next.getTime() - DAY * 3 <= now.getTime(), last };
}

/** Поддержка осанки: угол шеи падал три замера подряд или тест выносливости хуже лучшего на 10 с —
 *  пора на 2 недели вернуться к уровню «Выносливость» */
export function regressSignal(checks: CheckRecord[], since?: string): 'cva' | 'dnf' | null {
  const after = (c: CheckRecord) => !since || c.at >= since;
  const cva = checks.filter(c => c.kind === 'cva' && c.values.cva !== undefined);
  const lastFour = cva.slice(-4).map(c => c.values.cva!);
  if (lastFour.length === 4 && after(cva[cva.length - 1]) && lastFour.every((v, i) => i === 0 || v < lastFour[i - 1])) return 'cva';
  const dnf = checks.filter(c => c.kind === 'dnf' && c.values.seconds !== undefined);
  const last = dnf[dnf.length - 1];
  if (last && after(last) && dnf.length >= 2) {
    const best = Math.max(...dnf.slice(0, -1).map(c => c.values.seconds!));
    if (last.values.seconds! <= best - 10) return 'dnf';
  }
  return null;
}

/** Изменение угла меньше 5° телефон не различает — тренд засчитываем после трёх замеров подряд в одну сторону */
export const PHOTO_ERROR = 5;
export function trend(values: number[]): 'up' | 'down' | 'noise' | null {
  if (values.length < 2) return null;
  const d = values[values.length - 1] - values[0];
  const last3 = values.slice(-3);
  const steady = last3.length === 3 && (last3.every((v, i) => i === 0 || v > last3[i - 1]) || last3.every((v, i) => i === 0 || v < last3[i - 1]));
  if (Math.abs(d) < PHOTO_ERROR && !steady) return 'noise';
  return d > 0 ? 'up' : 'down';
}

export function totals(history: SessionRecord[], block?: BlockId) {
  const d = done(history, block);
  return {
    sessions: d.filter(s => s.kind === 'core').length,
    minutes: Math.round(history.filter(s => !block || s.block === block).reduce((a, s) => a + s.duration, 0) / 60),
    reps: d.reduce((a, s) => a + s.reps, 0),
  };
}

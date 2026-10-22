// Даты как строки YYYY-MM-DD по местному времени: без часовых поясов и сдвигов на сутки.

const pad = (n: number) => String(n).padStart(2, '0');

export const toKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromKey = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d || 1);
};
export const today = () => toKey(new Date());
export const monthKey = (k: string) => k.slice(0, 7);

export function addDays(k: string, n: number): string {
  const d = fromKey(k);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
}

export const daysBetween = (a: string, b: string) => Math.round((fromKey(b).getTime() - fromKey(a).getTime()) / 86_400_000);

export const lastDay = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};

/** Дата в месяце с ограничением по длине месяца; 'last' — последний день */
export function dayIn(month: string, day: number | 'last'): string {
  const last = lastDay(month);
  return `${month}-${pad(day === 'last' ? last : Math.min(day, last))}`;
}

/** Понедельник недели, в которой лежит дата */
export function weekStart(k: string): string {
  const d = fromKey(k);
  const dow = (d.getDay() + 6) % 7; // пн = 0
  return addDays(k, -dow);
}

/** 1-е число месяца */
export const monthStart = (k: string) => `${monthKey(k)}-01`;

/** Сколько месяцев от a до b (YYYY-MM) */
export function monthsBetween(a: string, b: string): number {
  const [ya, ma] = a.split('-').map(Number), [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_PREP = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const WEEKDAYS_FULL = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

/** 16.11 */
export const ddmm = (k: string) => `${k.slice(8, 10)}.${k.slice(5, 7)}`;
/** 16.11.2026 */
export const ddmmyyyy = (k: string) => `${ddmm(k)}.${k.slice(0, 4)}`;
/** 16 ноября */
export const dayMonth = (k: string) => `${Number(k.slice(8, 10))} ${MONTHS_GEN[Number(k.slice(5, 7)) - 1]}`;
/** ноябрь 2026 */
export const monthName = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
/** «в декабре» */
export const monthIn = (m: string) => `в ${MONTHS_PREP[Number(m.slice(5, 7)) - 1]}`;
/** ноя 26 */
export const monthShort = (m: string) => `${MONTHS_SHORT[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
export const weekday = (k: string) => WEEKDAYS[fromKey(k).getDay()];
export const weekdayFull = (k: string) => WEEKDAYS_FULL[fromKey(k).getDay()];

/** «сегодня», «завтра», «через 3 дня», «2 дня назад» */
export function relDays(from: string, to: string): string {
  const n = daysBetween(from, to);
  if (n === 0) return 'сегодня';
  if (n === 1) return 'завтра';
  if (n === -1) return 'вчера';
  if (n > 0) return `через ${n} ${plural(n, 'день', 'дня', 'дней')}`;
  return `${-n} ${plural(-n, 'день', 'дня', 'дней')} назад`;
}

export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

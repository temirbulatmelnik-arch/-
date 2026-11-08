// Время приложения — московское (UTC+3, без перехода на летнее время с 2014 года).
export const MSK = 3 * 3600e3;
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_NOM = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const WD = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const msk = (t: number | Date) => new Date((typeof t === 'number' ? t : t.getTime()) + MSK);

/** момент по московским дате и часам */
export const fromMsk = (y: number, m: number, d: number, h = 0, min = 0) => new Date(Date.UTC(y, m - 1, d, h, min) - MSK);
export const mskParts = (t: number | Date) => { const x = msk(t); return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate(), h: x.getUTCHours(), min: x.getUTCMinutes(), wd: x.getUTCDay() }; };
export const fmtTime = (t: number | Date) => { const p = mskParts(t); return `${p.h}:${String(p.min).padStart(2, '0')}`; };
export const fmtDay = (t: number | Date, year = false) => { const p = mskParts(t); return `${p.d} ${MONTHS[p.m - 1]}${year ? ' ' + p.y : ''}`; };
export const fmtDayShort = (t: number | Date) => { const p = mskParts(t); return `${String(p.d).padStart(2, '0')}.${String(p.m).padStart(2, '0')}.${p.y}`; };
export const fmtWeekday = (t: number | Date) => WD[mskParts(t).wd];
export const fmtMonth = (t: number | Date) => { const p = mskParts(t); return `${MONTHS_NOM[p.m - 1]} ${p.y}`; };
export const fmtDateTime = (t: number | Date) => `${fmtDay(t, true)}, ${fmtTime(t)}`;
export function fmtRange(a: number, b: number): string {
  const pa = mskParts(a), pb = mskParts(b);
  if (pa.y === pb.y && pa.m === pb.m && pa.d === pb.d) return `${fmtDay(a)} ${fmtTime(a)}–${fmtTime(b)}`;
  if (b - a < 3 * 864e5) return `${fmtDay(a)} ${fmtTime(a)} – ${fmtDay(b)} ${fmtTime(b)}`;
  return `${fmtDay(a, pa.y !== pb.y)} – ${fmtDay(b, true)}`;
}
/** полдень по Москве для дня (смещение в днях от сегодня) */
export function mskDay(base: Date, offsetDays: number, hour: number): Date {
  const p = mskParts(base);
  return fromMsk(p.y, p.m, p.d + offsetDays, hour);
}

// Рабочие дни в России: зарплата, аванс и премии, выпавшие на выходной или праздник, приходят
// в предыдущий рабочий день (ст. 136 ТК РФ). Праздники — по производственному календарю.
import { addDays, fromKey } from './dates';

/** Нерабочие праздничные дни и переносы по постановлениям правительства */
const HOLIDAYS: Record<number, string[]> = {
  2026: ['01-01', '01-02', '01-05', '01-06', '01-07', '01-08', '01-09', '02-23', '03-09', '05-01', '05-11', '06-12', '11-04', '12-31'],
};

/** Праздники по ТК РФ (ст. 112) — для лет, на которые календарь ещё не утверждён */
const FIXED = ['01-01', '01-02', '01-03', '01-04', '01-05', '01-06', '01-07', '01-08', '02-23', '03-08', '05-01', '05-09', '06-12', '11-04'];

function holidays(year: number): Set<string> {
  if (HOLIDAYS[year]) return new Set(HOLIDAYS[year]);
  const set = new Set(FIXED);
  // праздник в выходной переносится на следующий рабочий день (кроме январских — их переносят отдельно)
  for (const md of FIXED) {
    if (md.startsWith('01-')) continue;
    let d = `${year}-${md}`;
    if (!isWeekend(d)) continue;
    do d = addDays(d, 1); while (isWeekend(d) || set.has(d.slice(5)));
    set.add(d.slice(5));
  }
  // 31 декабря — выходной с 2025 года
  set.add('12-31');
  return set;
}

const isWeekend = (k: string) => { const dow = fromKey(k).getDay(); return dow === 0 || dow === 6; };

const cache = new Map<number, Set<string>>();
export function isWorkday(k: string): boolean {
  const year = Number(k.slice(0, 4));
  if (!cache.has(year)) cache.set(year, holidays(year));
  return !isWeekend(k) && !cache.get(year)!.has(k.slice(5));
}

/** Ближайший рабочий день не позже даты: 25.10.2026 (вс) → 23.10 (пт) */
export function workdayOnOrBefore(k: string): string {
  let d = k;
  for (let i = 0; i < 20 && !isWorkday(d); i++) d = addDays(d, -1);
  return d;
}

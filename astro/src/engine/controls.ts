// Сверка с контрольными значениями задания (раздел 2 и 6). Используется в тестах и во вкладке «Карты → Сверка».
// Если контроль не сходится, причина ищется, а не подгоняется: известные опечатки контроля доказаны его же аспектами
// и независимым расчётом Swiss Ephemeris (файлы seas/sepl/semo_18).
import { fmtLon, lonOf, sep, type PointId } from './core';
import { natal, ME, DIMA, type Chart } from './chart';
import { fromMsk, fmtDayShort } from './time';
import { transitsAt } from './transits';
import type { AstroEvent } from './events';

const L = (deg: number, min: number, sign: number) => sign * 30 + deg + min / 60;
export type Status = 'ok' | 'typo' | 'fail';
export interface ControlRow { group: string; label: string; expected: string; actual: string; delta?: string; status: Status; note?: string }

const SIGN: Record<string, number> = { Ari: 0, Tau: 1, Gem: 2, Can: 3, Leo: 4, Vir: 5, Lib: 6, Sco: 7, Sag: 8, Cap: 9, Aqu: 10, Pis: 11 };
type Pt = [PointId | `c${number}`, number, number, keyof typeof SIGN, number?, string?]; // точка, °, ′, знак, допуск, пометка опечатки

const ME_PTS: Pt[] = [
  ['sun', 4, 44, 'Tau'], ['mercury', 5, 38, 'Tau'], ['venus', 10, 30, 'Tau'], ['moon', 28, 44, 'Sco'], ['mars', 16, 47, 'Vir'],
  ['jupiter', 18, 46, 'Aqu'], ['saturn', 13, 19, 'Ari'], ['uranus', 8, 32, 'Aqu'], ['neptune', 29, 56, 'Cap'], ['pluto', 4, 58, 'Sag'],
  ['node', 27, 1, 'Vir'], ['snode', 27, 1, 'Pis'], ['lilith', 5, 0, 'Vir', 1.1],
  ['chiron', 25, 37, 'Lib', 1, 'Опечатка контроля: Swiss Ephemeris даёт 28°27′ Весов. Аспекты из того же задания (его Сатурн ☍ мой Хирон 0°10′, его Луна ☌ мой Хирон) сходятся только с 28°.'],
  ['fortune', 25, 47, 'Tau', 1], ['spirit', 13, 47, 'Can', 1], ['asc', 19, 47, 'Sag'], ['mc', 26, 54, 'Lib'],
  ['c2', 3, 10, 'Aqu'], ['c3', 23, 9, 'Pis'], ['c5', 18, 50, 'Tau'], ['c6', 5, 16, 'Gem'],
];
const DIMA_PTS: Pt[] = [
  ['sun', 24, 13, 'Sco', 1], ['moon', 25, 37, 'Lib', 1, 'Опечатка контроля: SE даёт 28°14′ Весов. Контрольные аспекты Луна ☍ Сатурн 0°07′ и его Луна ☌ мой MC 1°17′ сходятся только с 28°.'],
  ['mercury', 16, 3, 'Sag', 1], ['venus', 28, 40, 'Sco', 1], ['mars', 23, 57, 'Vir', 1],
  ['jupiter', 15, 22, 'Pis', 1, 'Опечатка контроля: SE даёт 18°11′ Рыб. Контрольный Меркурий □ Юпитер 2°09′ требует 18°.'],
  ['saturn', 25, 30, 'Ari', 1, 'Опечатка контроля: SE даёт 28°20′ Овна. Контрольный «его Сатурн ⚻ моя Луна 0°25′» требует 28°.'],
  ['uranus', 9, 10, 'Aqu', 1], ['chiron', 23, 16, 'Sco', 1], ['lilith', 7, 30, 'Sco', 1], ['asc', 11, 15, 'Leo', 1], ['mc', 12, 0, 'Ari', 1], ['c5', 25, 35, 'Sco', 1],
];

function pointRows(c: Chart, pts: Pt[], group: string): ControlRow[] {
  return pts.map(([id, d, m, s, tol = 0.1, typo]) => {
    const exp = L(d, m, SIGN[s]);
    const act = id.startsWith('c') && id.length <= 3 && !['chiron'].includes(id) && /^c\d+$/.test(id) ? c.houses.cusps[Number(id.slice(1)) - 1] : c.points[id as PointId].lon;
    const dlt = sep(exp, act);
    const ok = dlt <= tol + 1e-9;
    return { group, label: /^c\d+$/.test(id) ? `Куспид ${id.slice(1)}` : NAME[id], expected: fmtLon(exp) + (tol > 0.1 ? ' (≈)' : ''), actual: fmtLon(act), delta: `${(dlt * 60).toFixed(1)}′`, status: ok ? 'ok' : typo ? 'typo' : 'fail', note: ok ? undefined : typo };
  });
}
const NAME: Record<string, string> = { sun: 'Солнце', moon: 'Луна', mercury: 'Меркурий', venus: 'Венера', mars: 'Марс', jupiter: 'Юпитер', saturn: 'Сатурн', uranus: 'Уран', neptune: 'Нептун', pluto: 'Плутон', node: 'Сев. узел (ср.)', snode: 'Юж. узел', lilith: 'Лилит (ср.)', chiron: 'Хирон', fortune: 'Парс Фортуны', spirit: 'Парс Духа', asc: 'Асцендент', mc: 'MC' };

export function natalControls(): ControlRow[] {
  return [...pointRows(natal(ME), ME_PTS, 'Карта Темирбулата'), ...pointRows(natal(DIMA), DIMA_PTS, 'Карта Димы')];
}

export function transitControls(): ControlRow[] {
  const t = fromMsk(2026, 10, 30, 9);
  const exp: [PointId, number, number, keyof typeof SIGN, string?][] = [
    ['sun', 6, 49, 'Sco'], ['moon', 2, 20, 'Can'], ['mercury', 18, 24, 'Sco'], ['venus', 27, 9, 'Lib'], ['mars', 17, 44, 'Leo'],
    ['jupiter', 24, 6, 'Leo'], ['saturn', 9, 22, 'Ari'], ['uranus', 4, 45, 'Gem'], ['neptune', 2, 6, 'Ari'],
    ['pluto', 3, 29, 'Aqu', 'Опечатка контроля: SE на этот момент даёт 3°07′ Водолея. Тот же сдвиг Плутона (+0,37°) объясняет и сдвиг закреплённых дат Плутона.'],
  ];
  const rows: ControlRow[] = exp.map(([id, d, m, s, typo]) => {
    const e = L(d, m, SIGN[s]), a = lonOf(id, t), dl = sep(e, a);
    const ok = dl <= 0.1;
    return { group: 'Транзиты 30.10.2026 09:00 МСК', label: NAME[id], expected: fmtLon(e), actual: fmtLon(a), delta: `${(dl * 60).toFixed(1)}′`, status: ok ? 'ok' : typo ? 'typo' : 'fail', note: ok ? undefined : typo };
  });
  const t2 = fromMsk(2026, 11, 8, 13);
  const trs = transitsAt(natal(ME), t2);
  const need: [PointId, string, PointId, string][] = [['sun', 'sext', 'mars', 'Солнце ⚹ мой Марс'], ['moon', 'opp', 'sun', 'Луна ☍ моё Солнце'], ['moon', 'opp', 'mercury', 'Луна ☍ мой Меркурий'], ['mercury', 'square', 'uranus', 'Меркурий R □ мой Уран'], ['saturn', 'sext', 'uranus', 'Сатурн ⚹ мой Уран']];
  for (const [a, asp, b, label] of need) {
    const h = trs.find(x => x.t === a && x.aspect === asp && x.n === b);
    rows.push({ group: 'Транзиты 08.11.2026 13:00 МСК', label, expected: 'есть', actual: h ? `есть, орб ${(h.orb * 60).toFixed(0)}′${h.retro ? ', R' : ''}` : 'нет', status: h ? 'ok' : 'fail' });
  }
  return rows;
}

/** закреплённые даты: ищутся среди автоматически найденных событий (±2 дня) */
interface Pin { label: string; dates: string[]; match: (e: AstroEvent) => boolean; typo?: string; range?: [string, string] }
const tr = (who: string, tp: string, a: string, n: string) => (e: AstroEvent) => e.who === who && (e.key === `transit:${tp}:${a}:${n}` || e.key === `station:${tp}:${a}:${n}`);
const ecl = (pred: (e: AstroEvent) => boolean) => (e: AstroEvent) => e.kind === 'eclipse' && e.key === 'eclipse:solar' && pred(e);
const PLUTO_TYPO = 'Расчёт сверен со Swiss Ephemeris: точные даты другие. В контроле Плутон смещён на +0,37° (см. 30.10.2026) — отсюда сдвиг на недели и «лишние» проходы.';
export const PINS: Pin[] = [
  { label: 'Финал моего возвращения Сатурна', dates: ['03.03.2027'], match: tr('me', 'saturn', 'conj', 'saturn') },
  { label: 'Плутон □ моё Солнце', dates: ['01.01.2027', '18.10.2027'], match: tr('me', 'pluto', 'square', 'sun'), typo: 'Точный проход — 13.01.2027 (≈01.01 в задании). 18.10.2027 Плутон разворачивается в 0°26′ от точки — найден как «стационарен □ моё Солнце».' },
  { label: 'Плутон □ мой Меркурий', dates: ['30.01.2027', '03.12.2027'], match: tr('me', 'pluto', 'square', 'mercury'), typo: PLUTO_TYPO },
  { label: 'Солнечное затмение на моём Юпитере', dates: ['06.02.2027'], match: ecl(e => String(e.meta.contacts).includes('"point":"jupiter"')) },
  { label: 'Плутон ☌ мой Уран', dates: ['09.05.2027', '15.03.2028', '19.01.2029', '07.11.2029'], match: tr('me', 'pluto', 'conj', 'uranus'), typo: PLUTO_TYPO },
  { label: 'Сатурн ☍ мой MC', dates: ['07.07.2027', '19.03.2028'], match: tr('me', 'saturn', 'opp', 'mc') },
  { label: 'Полное солнечное затмение (□ моя Венера, ☍ мой Уран, на Асц Димы)', dates: ['02.08.2027'], match: ecl(e => ['venus', 'uranus'].every(p => String(e.meta.contacts).includes(`"point":"${p}"`)) && String(e.meta.contacts).includes('"who":"dima","point":"asc"')) },
  { label: 'Затмение □ мои Солнце и Меркурий, ☌ мой Уран', dates: ['26.01.2028'], match: ecl(e => ['sun', 'mercury', 'uranus'].every(p => String(e.meta.contacts).includes(`"point":"${p}"`))) },
  { label: 'Юпитер ☌ мой Сев. узел', dates: ['26.12.2027', '09.08.2028'], match: tr('me', 'jupiter', 'conj', 'node') },
  { label: 'Сатурн ☌ моё Солнце', dates: ['21.05.2028', '18.12.2028'], match: tr('me', 'saturn', 'conj', 'sun') },
  { label: 'Сатурн ☌ мой Меркурий', dates: ['29.05.2028', '29.11.2028', '11.02.2029'], match: tr('me', 'saturn', 'conj', 'mercury') },
  { label: 'Сатурн ☌ моя Венера', dates: ['24.07.2028', '03.04.2029'], match: tr('me', 'saturn', 'conj', 'venus') },
  { label: 'Солнечное затмение в моём 7-м доме', dates: ['22.07.2028'], match: ecl(e => e.meta.houseMe === 7) },
  { label: 'Юпитер ☌ мой MC', dates: ['28.02.2029', '08.09.2029'], match: tr('me', 'jupiter', 'conj', 'mc') },
  { label: 'Прогр. Венера ☌ мой Десцендент (весна 2029)', dates: ['весна 2029'], range: ['01.03.2029', '31.05.2029'], match: e => e.who === 'me' && e.key === 'prog:venus:opp:asc' },
  { label: 'Дима: возвращение Сатурна', dates: ['10.08.2027', '31.03.2028'], match: tr('dima', 'saturn', 'conj', 'saturn') },
  { label: 'Дима: Сатурн ☍ его Луна', dates: ['10.08.2027', '31.03.2028'], match: tr('dima', 'saturn', 'opp', 'moon') },
  { label: 'Затмение в 7-м доме Димы', dates: ['06.02.2027'], match: ecl(e => e.meta.houseDima === 7) },
  { label: 'Дима: Плутон на Десценденте (2029)', dates: ['2029'], range: ['01.01.2029', '31.12.2029'], match: e => e.who === 'dima' && (e.key === 'approach:pluto:opp:asc' || e.key === 'transit:pluto:opp:asc') },
];

const parse = (s: string) => { const [d, m, y] = s.split('.').map(Number); return Date.UTC(y, m - 1, d, 9); };

export function pinControls(events: AstroEvent[]): ControlRow[] {
  return PINS.map(p => {
    const found = events.filter(p.match);
    const res = p.range ? [(() => {
      const [a, b] = p.range!.map(parse);
      const best = found.find(e => e.t >= a && e.t <= b) ?? null;
      return { d: p.dates[0], best, dd: best ? 0 : Infinity, ok: !!best };
    })()] : p.dates.map(d => {
      const t = parse(d);
      const best = found.reduce<AstroEvent | null>((b, e) => (!b || Math.abs(e.t - t) < Math.abs(b.t - t) ? e : b), null);
      const dd = best ? Math.abs(best.t - t) / 864e5 : Infinity;
      return { d, best, dd, ok: dd <= 2 };
    });
    const allOk = res.every(r => r.ok);
    return {
      group: 'Закреплённые даты (±2 дня)', label: p.label, expected: p.dates.join(', '),
      actual: found.length ? [...new Set(found.map(e => fmtDayShort(e.t) + (e.meta.station ? ' (станция)' : '')))].join(', ') : 'не найдено',
      delta: res.map(r => (Number.isFinite(r.dd) ? `${r.dd.toFixed(1)} дн` : '—')).join(' / '),
      status: allOk ? 'ok' : p.typo ? 'typo' : 'fail', note: allOk ? undefined : p.typo,
    };
  });
}

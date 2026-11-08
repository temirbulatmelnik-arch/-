// Ведический блок: айанамша Лахири, раши, накшатры, достоинства, карака, йоги, Вимшоттари-даши, садэ-сати.
import { centuries, lonOf, norm, type PointId } from './core';
import type { Chart } from './chart';

/** Лахири: 23°51′25.5″ на J2000 + общая прецессия по долготе (IAU 2006) */
export function ayanamsa(d: Date): number {
  const T = centuries(d);
  return 23.857092 + (5028.796195 * T + 1.1054348 * T * T) / 3600;
}
export const sidereal = (lon: number, d: Date) => norm(lon - ayanamsa(d));

export const NAKSHATRAS = ['Ашвини', 'Бхарани', 'Криттика', 'Рохини', 'Мригашира', 'Ардра', 'Пунарвасу', 'Пушья', 'Ашлеша', 'Магха', 'Пурва-Пхалгуни', 'Уттара-Пхалгуни', 'Хаста', 'Читра', 'Свати', 'Вишакха', 'Анурадха', 'Джьештха', 'Мула', 'Пурва-Ашадха', 'Уттара-Ашадха', 'Шравана', 'Дхаништха', 'Шатабхиша', 'Пурва-Бхадрапада', 'Уттара-Бхадрапада', 'Ревати'];
export type Graha = 'sun' | 'moon' | 'mars' | 'mercury' | 'jupiter' | 'venus' | 'saturn' | 'rahu' | 'ketu';
export const GRAHA_NAME: Record<Graha, string> = { sun: 'Сурья', moon: 'Чандра', mars: 'Мангала', mercury: 'Будха', jupiter: 'Гуру', venus: 'Шукра', saturn: 'Шани', rahu: 'Раху', ketu: 'Кету' };
export const GRAHA_RU: Record<Graha, string> = { sun: 'Солнце', moon: 'Луна', mars: 'Марс', mercury: 'Меркурий', jupiter: 'Юпитер', venus: 'Венера', saturn: 'Сатурн', rahu: 'Раху', ketu: 'Кету' };
export const GRAHA_GEN: Record<Graha, string> = { sun: 'Солнца', moon: 'Луны', mars: 'Марса', mercury: 'Меркурия', jupiter: 'Юпитера', venus: 'Венеры', saturn: 'Сатурна', rahu: 'Раху', ketu: 'Кету' };
export const GRAHA_ABBR: Record<Graha, string> = { sun: 'Су', moon: 'Ча', mars: 'Ма', mercury: 'Бу', jupiter: 'Гу', venus: 'Шу', saturn: 'Ша', rahu: 'Ра', ketu: 'Ке' };
const DASHA_ORDER: Graha[] = ['ketu', 'venus', 'sun', 'moon', 'mars', 'rahu', 'jupiter', 'saturn', 'mercury'];
const DASHA_YEARS: Record<Graha, number> = { ketu: 7, venus: 20, sun: 6, moon: 10, mars: 7, rahu: 18, jupiter: 16, saturn: 19, mercury: 17 };
const YEAR_MS = 365.25 * 864e5;

export const SIGN_LORD: Graha[] = ['mars', 'venus', 'mercury', 'moon', 'sun', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'saturn', 'jupiter'];
const EXALT: Partial<Record<Graha, number>> = { sun: 0, moon: 1, mars: 9, mercury: 5, jupiter: 3, venus: 11, saturn: 6 };
const OWN: Partial<Record<Graha, number[]>> = { sun: [4], moon: [3], mars: [0, 7], mercury: [2, 5], jupiter: [8, 11], venus: [1, 6], saturn: [9, 10] };
const DIG: Partial<Record<Graha, number>> = { sun: 10, mars: 10, jupiter: 1, mercury: 1, moon: 4, venus: 4, saturn: 7 };

export interface GrahaPos { g: Graha; lon: number; sign: number; deg: number; bhava: number; nak: number; pada: number; retro: boolean; dignity: string }
export interface VedicChart { lagna: number; lagnaSign: number; lagnaNak: number; grahas: Record<Graha, GrahaPos>; ak: Graha; dk: Graha; yogas: string[]; ayan: number }

export function nakOf(sid: number) {
  const n = Math.floor(sid / (360 / 27));
  return { nak: n, pada: Math.floor((sid % (360 / 27)) / (360 / 108)) + 1, lord: DASHA_ORDER[n % 9] };
}

function dignity(g: Graha, sign: number): string {
  const ex = EXALT[g];
  if (ex === sign) return 'экзальтация';
  if (ex !== undefined && (ex + 6) % 12 === sign) return 'падение';
  if (OWN[g]?.includes(sign)) return 'своя обитель';
  return '';
}

export function vedicChart(c: Chart): VedicChart {
  const ayan = ayanamsa(c.date);
  const lagna = norm(c.houses.asc - ayan);
  const ls = Math.floor(lagna / 30);
  const map: Record<Graha, PointId> = { sun: 'sun', moon: 'moon', mars: 'mars', mercury: 'mercury', jupiter: 'jupiter', venus: 'venus', saturn: 'saturn', rahu: 'node', ketu: 'snode' };
  const grahas = {} as Record<Graha, GrahaPos>;
  for (const g of Object.keys(map) as Graha[]) {
    const p = c.points[map[g]];
    const lon = norm(p.lon - ayan), sign = Math.floor(lon / 30);
    const { nak, pada } = nakOf(lon);
    grahas[g] = { g, lon, sign, deg: lon % 30, bhava: ((sign - ls + 12) % 12) + 1, nak, pada, retro: g === 'rahu' || g === 'ketu' ? true : p.retro, dignity: dignity(g, sign) };
  }
  const seven: Graha[] = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn'];
  const byDeg = [...seven].sort((a, b) => grahas[b].deg - grahas[a].deg);
  const yogas = findYogas(grahas, ls);
  return { lagna, lagnaSign: ls, lagnaNak: nakOf(lagna).nak, grahas, ak: byDeg[0], dk: byDeg[6], yogas, ayan };
}

const KENDRA = [1, 4, 7, 10];
function findYogas(G: Record<Graha, GrahaPos>, ls: number): string[] {
  const out: string[] = [];
  const fromMoon = (g: Graha) => ((G[g].sign - G.moon.sign + 12) % 12) + 1;
  if (G.sun.sign === G.mercury.sign) out.push(`Будха-Адитья йога — Солнце и Меркурий вместе (${G.sun.bhava}-я бхава): ум, речь, умение объяснять.`);
  if (KENDRA.includes(fromMoon('jupiter'))) out.push('Гаджа-Кесари йога — Юпитер в кендре от Луны: защита и уважение.');
  // нича-бханга: управитель знака падения или знака экзальтации — в кендре от лагны или Луны
  for (const g of ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn'] as Graha[]) {
    if (G[g].dignity !== 'падение') continue;
    const lordDeb = SIGN_LORD[G[g].sign];
    const exSign = EXALT[g]!;
    const lordEx = SIGN_LORD[exSign];
    const exaltedHere = (Object.keys(EXALT) as Graha[]).find(x => EXALT[x] === G[g].sign); // кто экзальтирует в этом знаке
    const inKendra = (x: Graha) => KENDRA.includes(G[x].bhava) || KENDRA.includes(fromMoon(x));
    const why = [lordDeb, lordEx, exaltedHere].filter((x): x is Graha => !!x && x !== g && inKendra(x));
    if (why.length) out.push(`Нича-бханга${g === 'moon' || KENDRA.includes(G[g].bhava) ? ' раджа-йога' : ''} — падение ${GRAHA_GEN[g]} отменено: ${[...new Set(why)].map(x => GRAHA_RU[x]).join(', ')} в кендре.`);
    else out.push(`${GRAHA_RU[g]} в падении без отмены.`);
  }
  for (const g of ['mars', 'mercury', 'jupiter', 'venus', 'saturn'] as Graha[]) {
    const d = G[g].dignity;
    if ((d === 'экзальтация' || d === 'своя обитель') && KENDRA.includes(G[g].bhava)) {
      const name = { mars: 'Ручака', mercury: 'Бхадра', jupiter: 'Хамса', venus: 'Малавья', saturn: 'Шаша' }[g as 'mars'];
      out.push(`${name} йога (махапуруша) — ${GRAHA_RU[g]} силён в кендре.`);
    }
  }
  for (const g of Object.keys(DIG) as Graha[]) if (G[g].bhava === DIG[g]) out.push(`${GRAHA_RU[g]} с диг-балой (сила направления) в ${G[g].bhava}-й бхаве.`);
  const lagnaLord = SIGN_LORD[ls];
  if (KENDRA.includes(G[lagnaLord].bhava)) out.push(`Управитель лагны (${GRAHA_RU[lagnaLord]}) в кендре — опора на себя.`);
  return out;
}

// ── Вимшоттари ─────────────────────────────────────────────────────────────────────────────────
export interface Dasha { lord: Graha; start: Date; end: Date; sub: { lord: Graha; start: Date; end: Date }[] }

export function vimshottari(c: Chart): Dasha[] {
  const moon = norm(c.points.moon.lon - ayanamsa(c.date));
  const span = 360 / 27;
  const n = Math.floor(moon / span);
  const elapsed = (moon % span) / span;
  const first = n % 9;
  const out: Dasha[] = [];
  // начало первой махадаши — в прошлом (до рождения) на пройденную долю
  let t = c.date.getTime() - elapsed * DASHA_YEARS[DASHA_ORDER[first]] * YEAR_MS;
  for (let k = 0; k < 18; k++) {
    const lord = DASHA_ORDER[(first + k) % 9];
    const len = DASHA_YEARS[lord] * YEAR_MS;
    const sub: Dasha['sub'] = [];
    let s = t;
    const i0 = DASHA_ORDER.indexOf(lord);
    for (let j = 0; j < 9; j++) {
      const sl = DASHA_ORDER[(i0 + j) % 9];
      const sl_len = (len * DASHA_YEARS[sl]) / 120;
      sub.push({ lord: sl, start: new Date(s), end: new Date(s + sl_len) });
      s += sl_len;
    }
    out.push({ lord, start: new Date(t), end: new Date(t + len), sub });
    t += len;
  }
  return out;
}

export function dashaAt(ds: Dasha[], d: Date) {
  const md = ds.find(x => x.start <= d && d < x.end)!;
  const ad = md.sub.find(x => x.start <= d && d < x.end)!;
  return { md, ad };
}

/** периоды садэ-сати: сидерический Сатурн в 12-м, 1-м и 2-м знаке от натальной Луны */
export function sadeSati(c: Chart, fromYear: number, toYear: number): { start: Date; end: Date }[] {
  const ms = Math.floor(norm(c.points.moon.lon - ayanamsa(c.date)) / 30);
  const zone = new Set([(ms + 11) % 12, ms, (ms + 1) % 12]);
  const out: { start: Date; end: Date }[] = [];
  let cur: { start: Date; end: Date } | null = null;
  for (let t = Date.UTC(fromYear, 0, 1); t < Date.UTC(toYear, 0, 1); t += 10 * 864e5) {
    const d = new Date(t);
    const s = Math.floor(sidereal(lonOf('saturn', d), d) / 30);
    if (zone.has(s)) { if (!cur) cur = { start: d, end: d }; cur.end = d; }
    else if (cur && t - cur.end.getTime() > 400 * 864e5) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out;
}

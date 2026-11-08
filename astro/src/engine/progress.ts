// Вторичные прогрессии (день = год), солнечные дуги, соляры, профекции.
import { diff, lonOf, MOVING, norm, type PointId, signOf } from './core';
import { makeChart, SPB, type Chart, type Person } from './chart';
import { houseOf } from './houses';

const TROP_YEAR = 365.2422;

/** момент прогрессии: рождение + (возраст в годах) суток */
export function progressedDate(p: Person, d: Date): Date {
  const years = (d.getTime() - p.birthUTC.getTime()) / (TROP_YEAR * 864e5);
  return new Date(p.birthUTC.getTime() + years * 864e5);
}
export function progressedLon(p: Person, id: PointId, d: Date): number {
  return lonOf(id, progressedDate(p, d));
}
/** солнечная дуга = прогрессированное Солнце − натальное */
export function solarArc(p: Person, d: Date): number {
  return norm(progressedLon(p, 'sun', d) - lonOf('sun', p.birthUTC));
}

/** соляр: точный возврат Солнца на натальную долготу в год year; карта — на Санкт-Петербург */
export function solarReturn(p: Person, year: number): { date: Date; chart: Chart } {
  const target = lonOf('sun', p.birthUTC);
  const b = p.birthUTC;
  let lo = Date.UTC(year, b.getUTCMonth(), b.getUTCDate()) - 3 * 864e5;
  let hi = lo + 6 * 864e5;
  const f = (t: number) => diff(target, lonOf('sun', new Date(t)));
  for (let k = 0; k < 50; k++) {
    const mid = (lo + hi) / 2;
    if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid;
  }
  const date = new Date((lo + hi) / 2);
  return { date, chart: makeChart(date, SPB.lat, SPB.lon) };
}

/** годовая профекция от Асцендента: возраст N → N-й знак от знака Асц */
export const SIGN_RULER: PointId[] = ['mars', 'venus', 'mercury', 'moon', 'sun', 'mercury', 'venus', 'pluto', 'jupiter', 'saturn', 'uranus', 'neptune'];
export const SIGN_RULER_TRAD: PointId[] = ['mars', 'venus', 'mercury', 'moon', 'sun', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'saturn', 'jupiter'];
export function profection(p: Person, natal: Chart, d: Date) {
  const b = p.birthUTC;
  let age = d.getUTCFullYear() - b.getUTCFullYear();
  const bdThisYear = Date.UTC(d.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate(), b.getUTCHours(), b.getUTCMinutes());
  if (d.getTime() < bdThisYear) age -= 1;
  const sign = (signOf(natal.houses.asc) + age) % 12;
  const start = new Date(Date.UTC(b.getUTCFullYear() + age, b.getUTCMonth(), b.getUTCDate(), b.getUTCHours(), b.getUTCMinutes()));
  const end = new Date(Date.UTC(b.getUTCFullYear() + age + 1, b.getUTCMonth(), b.getUTCDate(), b.getUTCHours(), b.getUTCMinutes()));
  return { age, sign, lord: SIGN_RULER_TRAD[sign], house: (age % 12) + 1, start, end };
}

/** прогрессированные точки (планеты + углы по солнечной дуге) */
export function progressedPoints(p: Person, natal: Chart, d: Date) {
  const pd = progressedDate(p, d);
  const arc = solarArc(p, d);
  const out: Partial<Record<PointId, { lon: number; house: number }>> = {};
  for (const id of MOVING) {
    if (id === 'node' || id === 'lilith') continue;
    const l = lonOf(id, pd);
    out[id] = { lon: l, house: houseOf(l, natal.houses.cusps) };
  }
  for (const id of ['asc', 'mc'] as PointId[]) {
    const l = norm(natal.points[id].lon + arc);
    out[id] = { lon: l, house: houseOf(l, natal.houses.cusps) };
  }
  return out;
}

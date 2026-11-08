// Дома Плацидуса: RAMC, истинный наклон эклиптики, итерация по полуподдугам. Плюс Вертекс.
import * as A from 'astronomy-engine';
import { DEG, norm, obliquity } from './core';

export interface Houses { cusps: number[]; asc: number; mc: number; vertex: number; ramc: number; eps: number }

const atan2d = (y: number, x: number) => norm(Math.atan2(y, x) / DEG);

/** долгота точки эклиптики по прямому восхождению */
const lonFromRA = (ra: number, eps: number) => atan2d(Math.sin(ra * DEG), Math.cos(ra * DEG) * Math.cos(eps * DEG));

/** асцендент для RAMC и широты */
function ascFor(ramc: number, lat: number, eps: number): number {
  const r = ramc * DEG, e = eps * DEG, f = lat * DEG;
  return atan2d(Math.cos(r), -(Math.sin(r) * Math.cos(e) + Math.tan(f) * Math.sin(e)));
}

/** куспид Плацидуса: frac — доля полуподдуги (1/3, 2/3), above — над горизонтом (11, 12) или под (2, 3) */
function placidusCusp(ramc: number, lat: number, eps: number, frac: number, above: boolean): number {
  const e = eps * DEG, f = lat * DEG;
  let ra = above ? ramc + 90 * frac : ramc + 180 - 90 * frac;
  for (let k = 0; k < 50; k++) {
    const lon = lonFromRA(ra, eps);
    const dec = Math.asin(Math.sin(e) * Math.sin(lon * DEG));
    const x = -Math.tan(f) * Math.tan(dec);
    const dsa = Math.acos(Math.max(-1, Math.min(1, x))) / DEG; // полудневная дуга
    const next = above ? ramc + dsa * frac : ramc + 180 - (180 - dsa) * frac;
    if (Math.abs(next - ra) < 1e-8) { ra = next; break; }
    ra = next;
  }
  return lonFromRA(ra, eps);
}

export function placidus(d: Date, lat: number, lonEast: number): Houses {
  const eps = obliquity(d);
  const ramc = norm(A.SiderealTime(d) * 15 + lonEast);
  const mc = lonFromRA(ramc, eps);
  const asc = ascFor(ramc, lat, eps);
  const c11 = placidusCusp(ramc, lat, eps, 1 / 3, true);
  const c12 = placidusCusp(ramc, lat, eps, 2 / 3, true);
  const c2 = placidusCusp(ramc, lat, eps, 2 / 3, false);
  const c3 = placidusCusp(ramc, lat, eps, 1 / 3, false);
  const cusps = [asc, c2, c3, norm(mc + 180), norm(c11 + 180), norm(c12 + 180), norm(asc + 180), norm(c2 + 180), norm(c3 + 180), mc, c11, c12];
  // Вертекс: «асцендент» для RAMC + 180° на коширотe, западная точка пересечения первого вертикала
  const vertex = ascFor(norm(ramc + 180), 90 - lat, eps);
  return { cusps, asc, mc, vertex, ramc, eps };
}

/** номер дома 1…12 для долготы */
export function houseOf(lon: number, cusps: number[]): number {
  for (let i = 0; i < 12; i++) {
    const a = cusps[i], b = cusps[(i + 1) % 12];
    const span = norm(b - a), off = norm(lon - a);
    if (off < span) return i + 1;
  }
  return 12;
}

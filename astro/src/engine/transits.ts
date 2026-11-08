// Транзиты: аспекты транзитных планет к натальным точкам, сходимость, точность, окно действия, все проходы.
import { diff, lonOf, norm, type PointId, sep } from './core';
import { ASPECT, ASPECTS, ASPECT_POINTS, MIRROR_POINTS, transitOrb, type AspectId } from './aspects';
import type { Chart } from './chart';

export const TRANSITING: PointId[] = ['moon', 'sun', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'chiron', 'node'];
export const SLOW: PointId[] = ['jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'chiron'];
const DAY = 864e5;

// кеш суточных долгот (полдень UTC) — для медленных планет и поиска дат
const cache = new Map<string, number>();
export function noonLon(id: PointId, dayIndex: number): number {
  const k = id + dayIndex;
  let v = cache.get(k);
  if (v === undefined) { v = lonOf(id, new Date(dayIndex * DAY + DAY / 2)); cache.set(k, v); }
  return v;
}
const dayIndex = (t: number) => Math.floor(t / DAY);

/** шаг поиска и полуширина окна (сутки) по планете */
function searchParams(id: PointId): { step: number; half: number } {
  switch (id) {
    case 'moon': return { step: 1 / 24, half: 1.5 };
    case 'sun': return { step: 0.5, half: 4 };
    case 'mercury': case 'venus': return { step: 0.5, half: 60 };
    case 'mars': return { step: 1, half: 120 };
    case 'node': return { step: 2, half: 120 };
    default: return { step: 1, half: 520 };
  }
}

/** моменты, когда долгота id проходит через точку target (точное попадание), в интервале */
export function crossings(id: PointId, target: number, from: number, to: number, stepDays?: number): number[] {
  const step = (stepDays ?? searchParams(id).step) * DAY;
  const slow = SLOW.includes(id) && step >= DAY;
  const L = (t: number) => (slow && t % DAY === 0 ? noonLon(id, dayIndex(t)) : lonOf(id, new Date(t)));
  const out: number[] = [];
  let t0 = slow ? dayIndex(from) * DAY : from;
  let f0 = diff(target, L(t0));
  for (let t = t0 + step; t <= to + step; t += step) {
    const f1 = diff(target, L(t));
    if (f0 === 0 || (Math.sign(f0) !== Math.sign(f1) && Math.abs(f0 - f1) < 90)) {
      let lo = t - step, hi = t;
      const g = (x: number) => diff(target, lonOf(id, new Date(x)));
      let glo = g(lo);
      for (let k = 0; k < 40 && hi - lo > 30e3; k++) {
        const mid = (lo + hi) / 2, gm = g(mid);
        if (Math.sign(gm) === Math.sign(glo)) { lo = mid; glo = gm; } else hi = mid;
      }
      const x = (lo + hi) / 2;
      if (x >= from - step && x <= to + step) out.push(x);
    }
    f0 = f1; t0 = t;
  }
  return out;
}

export interface Transit {
  t: PointId; n: PointId; aspect: AspectId; orb: number; // текущий орбис
  applying: boolean; exactNow: boolean; retro: boolean;
  passes: number[]; // все точные проходы истории (мс)
  nearest: number | null; // ближайший точный проход
  window: [number, number]; // окно действия (вход в орбис — выход)
  aspectPoint: number; // долгота точки, в которую надо попасть
  /** поправка силы из тонкостей (nuance.ts): хозяева времени, секта, состояние планеты, рецепции и т. д. */
  mult?: number;
  tags?: string[];
}

/** все транзиты к натальной карте в момент d */
export function transitsAt(natal: Chart, d: Date, opts: { minor?: boolean; bodies?: PointId[] } = {}): Transit[] {
  const t = d.getTime();
  const out: Transit[] = [];
  const bodies = opts.bodies ?? TRANSITING;
  const targets = [...ASPECT_POINTS, ...MIRROR_POINTS];
  for (const id of bodies) {
    const L = lonOf(id, d);
    const L1 = lonOf(id, new Date(t + 3600e3));
    const retro = diff(L, L1) < 0;
    for (const n of targets) {
      const nl = natal.points[n]?.lon;
      if (nl === undefined) continue;
      const mirror = MIRROR_POINTS.includes(n);
      for (const def of ASPECTS) {
        if (mirror && def.id !== 'conj') continue;
        if (opts.minor === false && !def.major) continue;
        if (id === 'node' && !(def.id === 'conj' || def.id === 'opp')) continue;
        if (id === n && id === 'node') continue;
        const orbMax = transitOrb(def.id, id);
        const s = sep(L, nl);
        const orb = Math.abs(s - def.angle);
        if (orb > orbMax) continue;
        // точка попадания: nl ± угол, ближайшая к планете
        const p1 = norm(nl + def.angle), p2 = norm(nl - def.angle);
        const ap = sep(L, p1) <= sep(L, p2) ? p1 : p2;
        const orb1 = sep(L1, ap);
        out.push({ t: id, n, aspect: def.id, orb, applying: orb1 < sep(L, ap), exactNow: orb < 0.2, retro, passes: [], nearest: null, window: [t, t], aspectPoint: ap });
      }
    }
  }
  return out;
}

/** дополняет транзит проходами и окном (дороже — только для показываемых) */
export function enrich(tr: Transit, at: Date): Transit {
  const { half } = searchParams(tr.t);
  const t = at.getTime();
  const passesAll = crossings(tr.t, tr.aspectPoint, t - half * DAY, t + half * DAY);
  // история: проходы, связанные с текущим моментом без выхода из «петли» больше чем на 330 дней
  passesAll.sort((a, b) => a - b);
  let passes = passesAll;
  if (SLOW.includes(tr.t) && passesAll.length) {
    const groups: number[][] = [];
    for (const p of passesAll) {
      const g = groups[groups.length - 1];
      if (g && p - g[g.length - 1] < 330 * DAY) g.push(p); else groups.push([p]);
    }
    passes = groups.reduce((best, g) => (dist(g, t) < dist(best, t) ? g : best), groups[0]);
  } else if (passesAll.length) {
    const near = passesAll.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a));
    passes = [near];
  }
  const nearest = passes.length ? passes.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a)) : null;
  const orbMax = transitOrb(tr.aspect, tr.t);
  const window = actionWindow(tr.t, tr.aspectPoint, orbMax, passes.length ? passes : [t], t);
  return { ...tr, passes, nearest, window };
}
const dist = (g: number[], t: number) => (t < g[0] ? g[0] - t : t > g[g.length - 1] ? t - g[g.length - 1] : 0);

/** окно: от входа в орбис до выхода, охватывая все проходы */
export function actionWindow(id: PointId, point: number, orb: number, passes: number[], now: number): [number, number] {
  const { step } = searchParams(id);
  const st = Math.max(step, id === 'moon' ? 1 / 48 : 0.25) * DAY;
  const inOrb = (x: number) => sep(lonOf(id, new Date(x)), point) <= orb;
  const first = Math.min(passes[0], now), last = Math.max(passes[passes.length - 1], now);
  let a = first;
  for (let k = 0; k < 3000 && inOrb(a - st); k++) a -= st;
  let b = last;
  for (let k = 0; k < 3000 && inOrb(b + st); k++) b += st;
  return [a, b];
}

export const aspectAngle = (a: AspectId) => ASPECT[a].angle;

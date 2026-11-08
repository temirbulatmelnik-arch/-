// Аспекты: типы, орбисы натала, транзитов и синастрии; поиск всех аспектов.
import { sep, type PointId } from './core';

export type AspectId = 'conj' | 'sext' | 'square' | 'trine' | 'opp' | 'quincunx' | 'semisq' | 'sesq' | 'semisext' | 'quintile';
export interface AspectDef { id: AspectId; angle: number; glyph: string; name: string; major: boolean; nature: -1 | 0 | 1 }

export const ASPECTS: AspectDef[] = [
  { id: 'conj', angle: 0, glyph: '☌', name: 'соединение', major: true, nature: 0 },
  { id: 'opp', angle: 180, glyph: '☍', name: 'оппозиция', major: true, nature: -1 },
  { id: 'trine', angle: 120, glyph: '△', name: 'трин', major: true, nature: 1 },
  { id: 'square', angle: 90, glyph: '□', name: 'квадрат', major: true, nature: -1 },
  { id: 'sext', angle: 60, glyph: '⚹', name: 'секстиль', major: true, nature: 1 },
  { id: 'quincunx', angle: 150, glyph: '⚻', name: 'квинконс', major: false, nature: -1 },
  { id: 'semisq', angle: 45, glyph: '∠', name: 'полуквадрат', major: false, nature: -1 },
  { id: 'sesq', angle: 135, glyph: '⚼', name: 'сесквиквадрат', major: false, nature: -1 },
  { id: 'semisext', angle: 30, glyph: '⚺', name: 'полусекстиль', major: false, nature: 1 },
  { id: 'quintile', angle: 72, glyph: 'Q', name: 'квинтиль', major: false, nature: 1 },
];
export const ASPECT = Object.fromEntries(ASPECTS.map(a => [a.id, a])) as Record<AspectId, AspectDef>;

const LUM = new Set<PointId>(['sun', 'moon']);
const ANGLES = new Set<PointId>(['asc', 'mc', 'dsc', 'ic']);
const HIGH = new Set<PointId>(['uranus', 'neptune', 'pluto']);

/** натальные орбисы: ☌☍ 8°, △□ 7°, ⚹ 5°, ⚻ 3°, минорные 2° (+1° со светилом) */
export function natalOrb(a: AspectId, p: PointId, q: PointId): number {
  const lum = LUM.has(p) || LUM.has(q);
  switch (a) {
    case 'conj': case 'opp': return 8;
    case 'trine': case 'square': return 7;
    case 'sext': return 5;
    case 'quincunx': return 3;
    default: return 2 + (lum ? 1 : 0);
  }
}

/** транзитные орбисы — по транзитной планете; минорные — половина */
export function transitOrb(a: AspectId, transiting: PointId): number {
  const base: Partial<Record<PointId, number>> = { moon: 2.5, sun: 1.5, mercury: 1.5, venus: 1.5, mars: 1.5, jupiter: 1.2 };
  const b = base[transiting] ?? 1;
  return ASPECT[a].major && a !== 'quincunx' ? b : b / 2;
}

/** синастрия: ☌☍ 7°, △□ 6°, ⚹ 4°, ⚻ 2°; для Асц/MC/узлов/высших — до 3° (соединение и оппозиция — до 4°);
 *  минорные 1,5° */
export function synastryOrb(a: AspectId, p: PointId, q: PointId): number {
  const base = a === 'conj' || a === 'opp' ? 7 : a === 'trine' || a === 'square' ? 6 : a === 'sext' ? 4 : a === 'quincunx' ? 2 : 1.5;
  const limited = [p, q].some(x => ANGLES.has(x) || x === 'node' || x === 'snode' || HIGH.has(x) || x === 'vertex' || x === 'chiron' || x === 'lilith' || x === 'fortune' || x === 'spirit');
  return limited ? Math.min(base, a === 'conj' || a === 'opp' ? 4 : 3) : base;
}

export interface Hit { a: PointId; b: PointId; aspect: AspectId; orb: number; exact: number /* текущая разница с точным углом, знак не важен */ }

/** лучший аспект между двумя долготами при правиле орбисов */
export function aspectBetween(la: number, lb: number, orbFn: (a: AspectId) => number, only?: (a: AspectDef) => boolean): { aspect: AspectId; orb: number } | null {
  const s = sep(la, lb);
  let best: { aspect: AspectId; orb: number } | null = null;
  for (const def of ASPECTS) {
    if (only && !only(def)) continue;
    const o = Math.abs(s - def.angle);
    if (o <= orbFn(def.id) && (!best || o < best.orb)) best = { aspect: def.id, orb: o };
  }
  return best;
}

/** пары, аспекты которых не показываем (ось сама с собой и производные) */
export function trivialPair(p: PointId, q: PointId): boolean {
  const k = [p, q].sort().join('|');
  return ['asc|dsc', 'ic|mc', 'node|snode', 'asc|fortune', 'asc|spirit', 'fortune|spirit'].includes(k);
}

/** точки, участвующие в аспектах; «зеркальные» (Юж. узел, Dsc, IC) — только соединения */
export const ASPECT_POINTS: PointId[] = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'node', 'chiron', 'lilith', 'asc', 'mc', 'vertex', 'fortune', 'spirit'];
export const MIRROR_POINTS: PointId[] = ['snode', 'dsc', 'ic'];

export function aspectsWithin(
  la: Record<string, { lon: number }>, lb: Record<string, { lon: number }>,
  orbFn: (a: AspectId, p: PointId, q: PointId) => number, sameChart: boolean,
): Hit[] {
  const out: Hit[] = [];
  const A = [...ASPECT_POINTS, ...MIRROR_POINTS], B = A;
  for (let i = 0; i < A.length; i++) {
    for (let j = sameChart ? i + 1 : 0; j < B.length; j++) {
      const p = A[i], q = B[j];
      if (!la[p] || !lb[q] || p === q && sameChart) continue;
      if (sameChart && trivialPair(p, q)) continue;
      const mirror = MIRROR_POINTS.includes(p) || MIRROR_POINTS.includes(q);
      const hit = aspectBetween(la[p].lon, lb[q].lon, a => orbFn(a, p, q), mirror ? d => d.id === 'conj' : undefined);
      if (hit) out.push({ a: p, b: q, aspect: hit.aspect, orb: hit.orb, exact: hit.orb });
    }
  }
  return out.sort((x, y) => x.orb - y.orb);
}

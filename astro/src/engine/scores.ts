// Шкалы −2…+2: сферы дня и шкалы пары. Напряжённые аспекты −, гармоничные +, медленные планеты тяжелее, Луна легче;
// учитываются дома натальных точек и личные заметки (какая точка за что отвечает).
import type { PointId } from './core';
import { transitOrb, ASPECT } from './aspects';
import { natal, ME, DIMA, type Chart } from './chart';
import type { Transit } from './transits';
import { valence } from '../content/compose';

export type Sphere = 'work' | 'money' | 'love' | 'sex' | 'health';
export const SPHERES: { id: Sphere; name: string; color: string }[] = [
  { id: 'work', name: 'Работа', color: '#7aa2ff' },
  { id: 'money', name: 'Деньги', color: '#e8c56a' },
  { id: 'love', name: 'Отношения', color: '#f08fb4' },
  { id: 'sex', name: 'Близость', color: '#c46cf0' },
  { id: 'health', name: 'Самочувствие', color: '#6fd6b0' },
];

const PW: Partial<Record<PointId, number>> = { moon: 0.55, sun: 1, mercury: 0.9, venus: 1, mars: 1.1, jupiter: 1.5, saturn: 1.8, uranus: 1.6, neptune: 1.5, pluto: 1.8, chiron: 1.1, node: 0.8 };

/** за что отвечает натальная точка (личные заметки «Темирбулата») */
const REL_ME: Partial<Record<PointId, Partial<Record<Sphere, number>>>> = {
  sun: { work: 0.6, money: 0.6, love: 0.5, health: 0.8 }, // стеллиум: дом, карьера, отношения, деньги разом
  moon: { love: 0.8, sex: 0.5, health: 0.8 },
  mercury: { work: 0.5, love: 0.7 },
  venus: { work: 0.7, love: 1, sex: 0.8, money: 0.7 },
  mars: { sex: 1, health: 0.8, money: 0.4 },
  jupiter: { money: 1, health: 0.4 },
  saturn: { work: 0.7, health: 0.4 },
  uranus: { money: 0.8, health: 0.3 },
  neptune: { work: 0.5, health: 0.6 },
  pluto: { sex: 0.7, work: 0.3 },
  node: { work: 0.4 },
  chiron: { work: 0.7, health: 0.3 },
  lilith: { sex: 0.9 },
  asc: { health: 1, love: 0.3 },
  mc: { work: 1 },
  dsc: { love: 1 },
  ic: { health: 0.4 },
  vertex: { love: 0.5, sex: 0.5 },
  fortune: { money: 0.8, love: 0.3 },
  spirit: { love: 0.6 },
};
const REL_HOUSE: Partial<Record<number, Partial<Record<Sphere, number>>>> = {
  1: { health: 0.6 }, 2: { money: 0.8 }, 5: { love: 0.4, sex: 0.5 }, 6: { work: 0.6, health: 0.6 }, 7: { love: 0.8 }, 8: { money: 0.5, sex: 0.7 }, 10: { work: 0.8 },
};
const REL_TRANSIT: Partial<Record<PointId, Partial<Record<Sphere, number>>>> = {
  venus: { love: 0.4, sex: 0.3, money: 0.3 }, mars: { sex: 0.4, health: 0.3 }, jupiter: { money: 0.3 }, saturn: { work: 0.3 }, moon: { health: 0.2 },
};

export function transitStrength(tr: Transit): number {
  const max = transitOrb(tr.aspect, tr.t);
  const close = Math.max(0, 1 - tr.orb / max);
  const minor = ASPECT[tr.aspect].major && tr.aspect !== 'quincunx' ? 1 : 0.5;
  return (PW[tr.t] ?? 1) * (0.35 + 0.65 * Math.pow(close, 0.7)) * minor * (tr.exactNow ? 1.15 : 1) * (tr.mult ?? 1);
}

const REL_DIMA: Partial<Record<PointId, Partial<Record<Sphere, number>>>> = {
  sun: { health: 0.9, work: 0.4 }, moon: { love: 1, health: 0.6 }, mercury: { work: 0.5, love: 0.4 }, venus: { love: 1, sex: 0.9, money: 0.5 },
  mars: { sex: 0.9, health: 0.7, work: 0.4 }, jupiter: { money: 0.6 }, saturn: { work: 1, love: 0.5 }, uranus: { love: 0.6 }, chiron: { health: 0.5 },
  lilith: { sex: 0.8 }, asc: { health: 1, love: 0.3 }, mc: { work: 1 }, dsc: { love: 1 }, node: { money: 0.6 }, vertex: { love: 0.4 }, fortune: { money: 0.8 },
};
let _houses: { me: Chart; dima: Chart } | null = null;
/** за какую сферу отвечает транзит: натальная точка, её дом и сама транзитная планета */
export function relevanceOf(tr: Transit, s: Sphere, who: 'me' | 'dima'): number {
  if (!_houses) _houses = { me: natal(ME), dima: natal(DIMA) };
  const rel = who === 'me' ? REL_ME : REL_DIMA;
  return relevanceIn(tr, s, _houses[who], rel);
}

/** управления: планета отвечает и за дома, которыми управляет (по знакам на куспидах) */
const TRAD = ['mars', 'venus', 'mercury', 'moon', 'sun', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'saturn', 'jupiter'];
const MODERN: Record<number, string> = { 7: 'pluto', 10: 'uranus', 11: 'neptune' };
const _ruled = new WeakMap<Chart, Record<string, number[]>>();
export function ruledHouses(c: Chart, planet: string): number[] {
  let m = _ruled.get(c);
  if (!m) {
    m = {};
    c.houses.cusps.forEach((cusp, i) => {
      const sg = Math.floor((((cusp % 360) + 360) % 360) / 30);
      for (const r of [TRAD[sg], MODERN[sg]].filter(Boolean)) (m![r] ??= []).push(i + 1);
    });
    _ruled.set(c, m);
  }
  return m[planet] ?? [];
}
function relevanceIn(tr: Transit, s: Sphere, c: Chart, rel: Partial<Record<PointId, Partial<Record<Sphere, number>>>>): number {
  const house = c.points[tr.n]?.house ?? 0;
  const ruled = ruledHouses(c, tr.n).reduce((a, h) => a + (REL_HOUSE[h]?.[s] ?? 0), 0);
  return Math.min(1.4, (rel[tr.n]?.[s] ?? 0) + (REL_HOUSE[house]?.[s] ?? 0) * 0.6 + Math.min(0.5, ruled * 0.35) + (REL_TRANSIT[tr.t]?.[s] ?? 0));
}

export function sphereScores(trs: Transit[], natal: Chart, rel: Partial<Record<PointId, Partial<Record<Sphere, number>>>> = natal.person?.id === 'dima' ? REL_DIMA : REL_ME): Record<Sphere, number> {
  const acc: Record<Sphere, number> = { work: 0, money: 0, love: 0, sex: 0, health: 0 };
  for (const tr of trs) {
    const v = valence(tr.aspect, tr.t) * transitStrength(tr);
    for (const s of Object.keys(acc) as Sphere[]) acc[s] += v * relevanceIn(tr, s, natal, rel);
  }
  for (const s of Object.keys(acc) as Sphere[]) acc[s] = Math.round(2 * Math.tanh(acc[s] / 2.2) * 10) / 10;
  return acc;
}

export function transitScore(tr: Transit): number { return valence(tr.aspect, tr.t) * transitStrength(tr); }

// ── пара ──
export type PairScale = 'tender' | 'talk' | 'passion' | 'conflict';
export const PAIR_SCALES: { id: PairScale; name: string; color: string }[] = [
  { id: 'tender', name: 'Нежность', color: '#f2a6c4' },
  { id: 'talk', name: 'Общение', color: '#8fc6ff' },
  { id: 'passion', name: 'Страсть', color: '#e2649a' },
  { id: 'conflict', name: 'Конфликтность', color: '#ff8a5c' },
];
const PAIR_REL: Record<PairScale, PointId[]> = {
  tender: ['moon', 'venus', 'spirit', 'dsc'],
  talk: ['mercury', 'dsc', 'asc'],
  passion: ['mars', 'venus', 'pluto', 'lilith', 'vertex'],
  conflict: ['mars', 'mercury', 'moon', 'saturn', 'uranus', 'asc'],
};

export function pairScores(mine: Transit[], his: Transit[], comp: Transit[]): Record<PairScale, number> {
  const acc: Record<PairScale, number> = { tender: 0, talk: 0, passion: 0, conflict: 0 };
  const all = [...mine.map(t => [t, 1] as const), ...his.map(t => [t, 1] as const), ...comp.map(t => [t, 0.8] as const)];
  for (const [tr, k] of all) {
    const v = valence(tr.aspect, tr.t) * transitStrength(tr) * k;
    for (const s of ['tender', 'talk', 'passion'] as PairScale[]) {
      if (PAIR_REL[s].includes(tr.n)) acc[s] += v * (tr.t === 'venus' && s !== 'talk' ? 1.3 : tr.t === 'mercury' && s === 'talk' ? 1.3 : 1);
      if (s === 'passion' && tr.t === 'mars' && (tr.n === 'venus' || tr.n === 'mars' || tr.n === 'moon')) acc.passion += Math.abs(v) * 0.5; // Марс разжигает и в напряжении
    }
    if (v < 0 && PAIR_REL.conflict.includes(tr.n)) acc.conflict += -v * (['mars', 'saturn', 'uranus', 'pluto', 'mercury'].includes(tr.t) ? 1 : 0.4);
  }
  return {
    tender: Math.round(2 * Math.tanh(acc.tender / 2) * 10) / 10,
    talk: Math.round(2 * Math.tanh(acc.talk / 2) * 10) / 10,
    passion: Math.round(2 * Math.tanh(acc.passion / 2) * 10) / 10,
    conflict: Math.round(2 * Math.tanh(acc.conflict / 4) * 10) / 10, // 0…2 — чем больше, тем горячее
  };
}

// Сборка данных экранов «Сегодня» и «Мы» на выбранный момент.
import { bodyPos, PLANETS, type PointId, MOVING } from './core';
import { natal, ME, DIMA, composite, type Chart } from './chart';
import { houseOf } from './houses';
import { enrich, transitsAt, type Transit } from './transits';
import { moonInfo, type MoonInfo } from './moon';
import { sphereScores, transitScore, transitStrength, pairScores, type Sphere, type PairScale } from './scores';
import { dashaAt, vimshottari, type Dasha } from './vedic';
import { profection, progressedLon } from './progress';
import { Composer, headline } from '../content/compose';
import { SHARED_POINTS } from '../content/pair';

export interface TransitCard extends Transit { score: number; strength: number; text: string[]; houseT: number }

let _charts: { me: Chart; dima: Chart; comp: Chart; dashMe: Dasha[]; dashDima: Dasha[] } | null = null;
export function charts() {
  if (!_charts) {
    const me = natal(ME), dima = natal(DIMA);
    _charts = { me, dima, comp: composite(me, dima), dashMe: vimshottari(me), dashDima: vimshottari(dima) };
  }
  return _charts;
}

function cards(natalChart: Chart, d: Date, who: 'me' | 'dima', composer: Composer, bodies?: PointId[]): TransitCard[] {
  const trs = transitsAt(natalChart, d, { bodies });
  return trs
    .map(t => ({ ...t, score: transitScore(t), strength: transitStrength(t) }))
    .sort((a, b) => b.strength - a.strength)
    .map(t => {
      const e = enrich(t, d);
      const houseT = houseOf(bodyPos(t.t, d).lon, natalChart.houses.cusps);
      return { ...e, score: t.score, strength: t.strength, houseT, text: composer.transit(e, who, houseT) };
    });
}

export interface TodayData {
  date: Date; transits: TransitCard[]; scores: Record<Sphere, number>; moon: MoonInfo; moonHouse: number;
  head: { advice: string; avoid: string; extra?: string };
  long: TransitCard[]; retro: { id: PointId; lon: number; station: boolean }[];
  sky: { id: PointId; lon: number; retro: boolean }[];
  context: { md: string; ad: string; adEnd: Date; prof: ReturnType<typeof profection>; progMoon: number };
}

export function today(d: Date): TodayData {
  const { me, dashMe } = charts();
  const composer = new Composer();
  const all = cards(me, d, 'me', composer);
  const long = all.filter(t => ['saturn', 'uranus', 'neptune', 'pluto'].includes(t.t));
  const transits = all.filter(t => !long.includes(t));
  const scores = sphereScores(all, me);
  const moon = moonInfo(d);
  const sky = MOVING.filter(id => id !== 'lilith' && id !== 'node').map(id => { const b = bodyPos(id, d); return { id, lon: b.lon, retro: b.retro }; });
  const retro = PLANETS.concat(['chiron']).map(id => bodyPos(id, d)).filter(b => b.retro || (b.station && b.id !== 'sun' && b.id !== 'moon')).map(b => ({ id: b.id, lon: b.lon, station: b.station }));
  const { md, ad } = dashaAt(dashMe, d);
  return {
    date: d, transits, long, scores, moon, moonHouse: houseOf(moon.lon, me.houses.cusps),
    head: headline(all, moon.vocNow), retro, sky,
    context: { md: md.lord, ad: ad.lord, adEnd: ad.end, prof: profection(ME, me, d), progMoon: progressedLon(ME, 'moon', d) },
  };
}

export interface PairData {
  mine: TransitCard[]; his: TransitCard[]; comp: TransitCard[];
  shared: { name: string; note: string; hits: TransitCard[] }[];
  scores: Record<PairScale, number>; evening: Record<PairScale, number>;
  dashMe: { md: string; ad: string; adEnd: Date }; dashDima: { md: string; ad: string; adEnd: Date };
  advice: string;
}

export function pair(d: Date, evening: Date): PairData {
  const { me, dima, comp, dashMe, dashDima } = charts();
  const composer = new Composer();
  const mine = cards(me, d, 'me', composer);
  const his = cards(dima, d, 'dima', composer);
  const compT = transitsAt(comp, d).map(t => ({ ...t, score: transitScore(t), strength: transitStrength(t), houseT: 0, text: [] as string[] })).sort((a, b) => b.strength - a.strength);
  const shared = SHARED_POINTS.map(sp => ({ name: sp.name, note: sp.note, hits: mine.filter(t => t.n === sp.me).filter(t => his.some(h => h.t === t.t && h.n === sp.dima)) }));
  const scores = pairScores(mine, his, compT);
  const eMine = transitsAt(me, evening), eHis = transitsAt(dima, evening), eComp = transitsAt(comp, evening);
  const ev = pairScores(eMine, eHis, eComp);
  const a = dashaAt(dashMe, d), b = dashaAt(dashDima, d);
  return {
    mine, his, comp: compT, shared, scores, evening: ev,
    dashMe: { md: a.md.lord, ad: a.ad.lord, adEnd: a.ad.end }, dashDima: { md: b.md.lord, ad: b.ad.lord, adEnd: b.ad.end },
    advice: pairAdvice(scores),
  };
}

function pairAdvice(s: Record<PairScale, number>): string {
  if (s.conflict >= 1.2) return 'Горячий день: спорные темы — на потом, сначала выслушать до конца (мой Марс □ его Меркурий).';
  if (s.tender >= 1) return 'День нежности: время вдвоём, без телефонов; маленький знак внимания значит много.';
  if (s.passion >= 1) return 'Искра в воздухе — устройте вечер только для двоих.';
  if (s.talk >= 1) return 'Хорошо договариваться: обсудите планы и быт, слова сейчас находятся легко.';
  if (s.talk <= -1) return 'Слова путаются — переспрашивайте, не додумывайте за другого.';
  if (s.tender <= -1) return 'Каждый немного в себе — дайте друг другу пространство и тёплое «я рядом».';
  return 'Ровный день для пары: тыл держится, искре нужен маленький повод — придумайте его.';
}

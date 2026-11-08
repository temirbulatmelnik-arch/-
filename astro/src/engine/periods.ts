// «Календарь ключевых периодов»: долгие транзиты собираются в истории и периоды по узлам карты,
// для каждого — даты, пики, сферы, тон, смысл и совет. Плюс обзор по годам (профекция, соляр, даши).
import type { PointId } from './core';
import type { AstroEvent } from './events';
import { PL_NOM, pointRu } from './events';
import { ASPECT } from './aspects';
import { CONFIGS_DIMA, CONFIGS_ME, type Config } from '../content/synthText';
import { ASPECT_TONE, PERIOD_KIND, PERIOD_SOFT, PERIOD_SPECIAL, PROFECTION_YEAR, YEAR_SIGN } from '../content/periodText';
import type { Sphere } from './scores';
import { fmtDay } from './time';

export interface Period {
  id: string; who: 'me' | 'dima' | 'pair'; tp: string; start: number; end: number; title: string; kind: string;
  tone: 'pos' | 'neg' | 'deep'; intensity: number; spheres: Sphere[]; aspects: string[]; peaks: number[]; text: string[]; do: string; avoid: string;
}
export interface YearCard { from: number; to: number; age: number; title: string; text: string[]; periods: string[] }

interface Story { who: 'me' | 'dima'; tp: string; a: string; n: string; start: number; end: number; peaks: number[]; weight: number }
const PERSONAL = ['sun', 'moon', 'mercury', 'venus', 'mars', 'asc', 'mc', 'node'];
const DAY = 864e5;
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
const SHARED_NAME: Record<string, string> = { uranus: 'общий нерв свободы', tender: 'точка нежности пары', mcmoon: 'моя карьера — его чувства' };

function cfgFor(who: 'me' | 'dima', n: string): Config | undefined {
  const cs = who === 'me' ? CONFIGS_ME : CONFIGS_DIMA;
  if (who === 'me' && ['sun', 'mercury', 'venus'].includes(n)) return cs.find(c => c.id === 'stellium');
  if (who === 'me' && n === 'uranus') return cs.find(c => c.id === 'nerve');
  return cs.find(c => c.points.includes(n));
}

function relevant(s: Story): boolean {
  if (s.tp === 'jupiter') return ['conj', 'opp', 'square', 'trine'].includes(s.a) && [...PERSONAL, 'jupiter'].includes(s.n);
  if (s.n === s.tp) return s.tp === 'saturn'; // возвращение Сатурна
  return [...PERSONAL, 'saturn', 'uranus', 'chiron'].includes(s.n) || (s.who === 'dima' && s.n === 'uranus');
}

export function buildPeriods(events: AstroEvent[], from: number): Period[] {
  // истории: один ключ транзита + группа проходов
  const stories = new Map<string, Story>();
  for (const e of events) {
    if (e.kind !== 'transit' || !e.window || !e.passes || !String(e.key).startsWith('transit:')) continue;
    const [, tp, a, n] = String(e.key).split(':');
    const k = `${e.who}:${e.key}:${Math.round(e.passes[0] / DAY)}`;
    if (!stories.has(k)) stories.set(k, { who: e.who as 'me' | 'dima', tp, a, n, start: e.window[0], end: e.window[1], peaks: e.passes, weight: e.weight });
  }
  // подход высших планет к углам — тоже история
  for (const e of events) {
    if (!String(e.key).startsWith('approach:')) continue;
    const [, tp, a, n] = String(e.key).split(':');
    stories.set(`${e.who}:${e.key}`, { who: e.who as 'me' | 'dima', tp, a: a === 'opp' ? 'conj' : a, n: a === 'opp' && n === 'asc' ? 'dsc' : n, start: e.t, end: e.window ? e.window[1] : e.t + 365 * DAY, peaks: [e.t], weight: e.weight });
  }
  const list = [...stories.values()].filter(relevant);
  // периоды: одна планета + один узел карты + пересечение во времени (зазор до 4 месяцев)
  const groups: { who: 'me' | 'dima'; tp: string; cfg: string; items: Story[] }[] = [];
  for (const s of list.sort((x, y) => x.start - y.start)) {
    const c = cfgFor(s.who, s.n);
    const cid = c?.id ?? s.n;
    const g = groups.find(x => x.who === s.who && x.tp === s.tp && x.cfg === cid && s.start <= Math.max(...x.items.map(i => i.end)) + 120 * DAY);
    if (g) g.items.push(s); else groups.push({ who: s.who, tp: s.tp, cfg: cid, items: [s] });
  }
  const periods: Period[] = groups.map(g => makePeriod(g.who, g.tp, g.cfg, g.items));
  // пара: одна и та же медленная планета по общим точкам у обоих одновременно
  const SHARED: [string, string, string][] = [['uranus', 'uranus', 'uranus'], ['moon', 'venus', 'tender'], ['mc', 'moon', 'mcmoon']];
  for (const [mp, dp, id] of SHARED) {
    for (const a of list.filter(s => s.who === 'me' && s.n === mp && s.tp !== 'jupiter' && ['conj', 'opp', 'square'].includes(s.a))) {
      const b = list.find(s => s.who === 'dima' && s.n === dp && s.tp === a.tp && s.start < a.end && a.start < s.end && ['conj', 'opp', 'square'].includes(s.a));
      if (!b) continue;
      const sp = PERIOD_SPECIAL[`pair:${a.tp}:${id}`];
      const kind = PERIOD_KIND[a.tp];
      periods.push({
        id: `pair:${a.tp}:${id}:${a.start}`, who: 'pair', tp: a.tp, start: Math.min(a.start, b.start), end: Math.max(a.end, b.end),
        title: sp?.title ?? `${PL_NOM[a.tp]} на точке «${SHARED_NAME[id]}»`, kind: kind.name, tone: kind.tone, intensity: (a.weight + b.weight) * 1.2,
        spheres: ['love'], aspects: [`${PL_NOM[a.tp]} ${ASPECT[a.a as 'conj'].glyph} ${pointRu(a.n, 'me')}`, `${PL_NOM[b.tp]} ${ASPECT[b.a as 'conj'].glyph} ${pointRu(b.n, 'dima')}`],
        peaks: [...a.peaks, ...b.peaks].sort((x, y) => x - y), text: sp?.text ?? [kind.what, 'Транзит задевает одну и ту же тему в обеих картах — это общий опыт пары.'], do: sp?.do ?? kind.do, avoid: sp?.avoid ?? kind.avoid,
      });
    }
  }
  return periods.filter(p => p.end >= from).sort((a, b) => a.start - b.start);
}

function makePeriod(who: 'me' | 'dima', tp: string, cfg: string, items: Story[]): Period {
  const c = cfgFor(who, items[0].n);
  const hardAny = items.some(i => ['conj', 'square', 'opp'].includes(i.a));
  const kind = hardAny ? PERIOD_KIND[tp] : { ...PERIOD_KIND[tp], ...PERIOD_SOFT[tp] };
  const sp = PERIOD_SPECIAL[`${who}:${tp}:${items[0].n}`] ?? PERIOD_SPECIAL[`${who}:${tp}:${cfg}`];
  const start = Math.min(...items.map(i => i.start)), end = Math.max(...items.map(i => i.end));
  const aspects = [...new Set(items.map(i => `${PL_NOM[tp]} ${ASPECT[i.a as 'conj'].glyph} ${pointRu(i.n, who)}`))];
  const peaks = [...new Set(items.flatMap(i => i.peaks))].sort((a, b) => a - b);
  const hard = items.some(i => ['conj', 'square', 'opp'].includes(i.a));
  const tone: Period['tone'] = tp === 'jupiter' ? 'pos' : !hard ? 'pos' : kind.tone;
  const text: string[] = sp ? [...sp.text] : [
    kind.what,
    c ? `Задета тема «${c.name}» — ${c.short}.` : `Задет ${pointRu(items[0].n, who)}.`,
    ASPECT_TONE[items[0].a] ?? '',
  ].filter(Boolean);
  if (peaks.length > 1) text.push(`Пики: ${peaks.map(p => fmtDay(p, true)).join(', ')} — ${peaks.length > 2 ? 'ретроградные петли делают это одной историей' : 'два прохода одной истории'}.`);
  const intensity = items.reduce((s, i) => s + i.weight, 0) * (items.length > 1 ? 1.15 : 1);
  return {
    id: `${who}:${tp}:${cfg}:${start}`, who, tp, start, end, title: sp?.title ?? `${kind.name}: ${c?.name ?? cap(pointRu(items[0].n, who))}`, kind: kind.name, tone, intensity,
    spheres: c?.spheres ?? [], aspects, peaks, text, do: sp?.do ?? kind.do, avoid: sp?.avoid ?? kind.avoid,
  };
}

/** годы жизни (от дня рождения до дня рождения): профекция, соляр, даши и периоды года */
export function buildYears(events: AstroEvent[], periods: Period[], from: number): YearCard[] {
  const srs = events.filter(e => e.kind === 'birthday' && e.who === 'me');
  const firstSr = srs[0];
  const starts: number[] = firstSr && firstSr.t > from ? [firstSr.t - 365.25 * DAY, ...srs.map(e => e.t)] : srs.map(e => e.t);
  const out: YearCard[] = [];
  for (let i = 0; i < starts.length && out.length < 4; i++) {
    const a = starts[i], b = starts[i + 1] ?? a + 365.25 * DAY;
    const age = new Date(a + 3 * DAY).getUTCFullYear() - 1997;
    const prof = (age % 12); // от Стрельца: 0 — Стрелец
    const sign = (8 + prof) % 12;
    const sr = srs.find(e => Math.abs(e.t - a) < 5 * DAY);
    const text: string[] = [PROFECTION_YEAR[sign] ?? `Год ${YEAR_SIGN[sign]}.`];
    if (sr) text.push(`Соляр: Асцендент года в знаке ${YEAR_SIGN[sr.meta.ascSign as number]}, Луна в ${sr.meta.moonH}-м доме, Юпитер в ${sr.meta.jupH}-м.`);
    const dashas = events.filter(e => e.kind === 'dasha' && e.who === 'me' && e.t >= a && e.t < b).map(e => e.title.replace('Антардаша: ', ''));
    if (dashas.length) text.push(`Смена периода (даша): ${dashas.join(', ')}.`);
    const ps = periods.filter(p => p.who !== 'dima' && p.start < b && p.end > a && p.intensity > 1.6).sort((x, y) => y.intensity - x.intensity).slice(0, 4).map(p => p.title);
    out.push({ from: a, to: b, age, title: `${age}-й год — год ${YEAR_SIGN[sign]}`, text, periods: ps });
  }
  return out.filter(y => y.to > from);
}

export const _types: PointId | undefined = undefined;

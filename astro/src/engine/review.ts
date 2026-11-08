// «Рецензия дня»: связный текст простым языком — какой будет день, что главное, как он пройдёт по часам,
// где будет легко и где трудно, и план: что сделать, чего избегать, лучшее и сложное время.
import { lonOf, norm, type PointId } from './core';
import type { Chart } from './chart';
import { crossings } from './transits';
import { fmtDay, fmtTime } from './time';
import { relevanceOf, SPHERES, type Sphere } from './scores';
import type { DaySynthesis } from './synthesis';
import type { MoonInfo } from './moon';
import { SPHERE_ADVICE, SPHERE_Q } from '../content/synthText';
import { ADVICE, natureOf } from '../content/compose';
import { HEADLINE, MOON_EVENT, MOON_MOOD, NOT_DO, PLAIN_ACT, PLAIN_POINT_DIMA, PLAIN_POINT_ME, SPHERE_DO } from '../content/reviewText';
import type { Transit } from './transits';

export interface MoonEvent { t: number; n: PointId; aspect: 'conj' | 'sext' | 'square' | 'trine' | 'opp'; tone: 'pos' | 'neg' | 'neu'; text: string }
export interface DayReview {
  headline: string; mood: string[]; main: string[];
  flow: { slot: string; score: number; text: string }[];
  events: MoonEvent[];
  easy: string; hard: string;
  plan: { do: string[]; avoid: string[]; best?: string; tricky?: string };
}
type T = Transit & { score: number; strength: number; text: string[] };

const SLOW = ['jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'chiron'];
const MOON_TARGETS: PointId[] = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'asc', 'mc', 'node'];
const ANG: Record<string, number> = { conj: 0, sext: 60, square: 90, trine: 120, opp: 180 };
const GLYPH: Record<string, string> = { conj: '☌', sext: '⚹', square: '□', trine: '△', opp: '☍' };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const pick = <X,>(xs: X[], seed: number) => xs[Math.abs(Math.floor(seed)) % xs.length];

/** точные лунные аспекты к натальным точкам за сутки (с 6 утра до полуночи по Москве) */
export function moonEvents(natal: Chart, dayStart: number): MoonEvent[] {
  const out: MoonEvent[] = [];
  const from = dayStart + 6 * 3600e3, to = dayStart + 24 * 3600e3;
  for (const n of MOON_TARGETS) {
    const nl = natal.points[n].lon;
    for (const a of Object.keys(ANG) as MoonEvent['aspect'][]) {
      const pts = a === 'conj' || a === 'opp' ? [norm(nl + ANG[a])] : [norm(nl + ANG[a]), norm(nl - ANG[a])];
      for (const p of pts) for (const t of crossings('moon', p, from, to, 1).filter(x => x >= from && x < to)) {
        const tone: MoonEvent['tone'] = a === 'conj' ? (['venus', 'jupiter', 'sun', 'mc'].includes(n) ? 'pos' : ['mars', 'saturn', 'pluto', 'uranus'].includes(n) ? 'neg' : 'neu') : a === 'square' || a === 'opp' ? 'neg' : 'pos';
        const ev = MOON_EVENT[n];
        if (!ev) continue;
        out.push({ t, n, aspect: a, tone, text: a === 'conj' ? ev.conj : tone === 'pos' ? ev.soft : ev.hard });
      }
    }
  }
  return out.sort((x, y) => x.t - y.t);
}

export function reviewDay(input: { all: T[]; synth: DaySynthesis; slots: Record<Sphere, number>[]; moon: MoonInfo; events: MoonEvent[]; dayStart: number; who: 'me' | 'dima'; lordsNote?: string }): DayReview {
  const { all, synth, slots, moon, events, dayStart, who } = input;
  const POINT = who === 'me' ? PLAIN_POINT_ME : PLAIN_POINT_DIMA;
  const seed = dayStart / 864e5;
  const real = all.filter(t => t.t !== 'moon');
  const pos = real.filter(t => t.score > 0.08), neg = real.filter(t => t.score < -0.08);

  // общий настрой
  const headline = pick(HEADLINE[synth.tone], seed);
  const mood: string[] = [];
  const slowN = real.filter(t => SLOW.includes(t.t)).length;
  mood.push(`Поддерживающих влияний сегодня ${pos.length}, напряжённых — ${neg.length}. ${slowN ? `Основу дня задают долгие процессы, которые идут неделями и месяцами, а быстрые планеты лишь окрашивают сегодняшние часы.` : 'Долгих процессов почти нет — день лёгкий на подъём и быстро меняется.'}`);
  mood.push(`Луна в знаке ${['Овна', 'Тельца', 'Близнецов', 'Рака', 'Льва', 'Девы', 'Весов', 'Скорпиона', 'Стрельца', 'Козерога', 'Водолея', 'Рыб'][moon.sign]} делает настроение ${MOON_MOOD[moon.sign]}.${moon.ingress < dayStart + 24 * 3600e3 ? ` С ${fmtTime(moon.ingress)} Луна переходит в ${['Овен', 'Телец', 'Близнецы', 'Рак', 'Лев', 'Деву', 'Весы', 'Скорпион', 'Стрелец', 'Козерог', 'Водолей', 'Рыбы'][moon.nextSign]} — настрой станет ${MOON_MOOD[moon.nextSign]}.` : ''}`);

  // главное: 2–3 самых сильных влияния простыми словами
  const main: string[] = [];
  const MIRROR: Record<string, string> = { ic: 'mc', dsc: 'asc', snode: 'node' };
  const top = [...real].filter(t => !(MIRROR[t.n] && real.some(o => o.t === t.t && o.n === MIRROR[t.n]))).sort((a, b) => b.strength - a.strength).slice(0, 3);
  for (const t of top) {
    const act = PLAIN_ACT[t.t]; if (!act) continue;
    const nat = natureOf(t.aspect);
    const verb = nat === 'soft' ? act.soft : nat === 'hard' ? act.hard : act.conj;
    let s = `${act.who} ${verb} ${POINT[t.n] ?? 'одну из точек карты'}.`;
    if (SLOW.includes(t.t)) s += ` Это не на один день: влияние длится до ${fmtDay(t.window[1], true)}${t.passes.length > 1 ? ` (в нём ${t.passes.length} точных прохода, ближайший — ${fmtDay(t.nearest ?? t.passes[0], true)})` : t.nearest ? `, точный пик — ${fmtDay(t.nearest, true)}` : ''}.`;
    else s += ` Это влияние на день-два${t.nearest && Math.abs(t.nearest - dayStart - 12 * 3600e3) < 864e5 ? `, пик — около ${fmtTime(t.nearest)}` : ''}.`;
    if (t.text[1]) s += ` ${t.text[1]}`;
    const tags = t.tags ?? [];
    if (tags.some(x => x.includes('года'))) s += ' Оно звучит громче обычного: эта планета сейчас ведёт ваш год.';
    const soft = tags.find(x => x.startsWith('смягчено'));
    if (soft) s += ` Его смягчает ${soft.split(': ')[1]} — трудность будет с поддержкой.`;
    if (tags.includes('двойное попадание')) s += ' Сюда же сейчас приходит внутренний процесс (прогрессия) — это скорее событие, чем настроение.';
    if (tags.includes('станция на точке')) s += ' Планета сейчас разворачивается прямо на этой точке — эффект особенно сильный.';
    main.push(s);
  }
  if (!main.length) main.push('Сильных влияний сегодня нет — хороший день, чтобы спокойно доделать начатое и отдохнуть.');

  // как пройдёт день
  const name = (s: Sphere) => SPHERES.find(x => x.id === s)!.name.toLowerCase();
  const SL = [{ slot: 'Утро', from: 6, to: 12 }, { slot: 'День', from: 12, to: 18 }, { slot: 'Вечер', from: 18, to: 24 }];
  const avg = (r: Record<Sphere, number>) => (r.work + r.money + r.love + r.sex + r.health) / 5;
  const flow = SL.map((x, i) => {
    const r = slots[i], a = avg(r);
    const best = (Object.keys(r) as Sphere[]).sort((p, q) => r[q] - r[p])[0];
    const evs = events.filter(e => e.t >= dayStart + x.from * 3600e3 && e.t < dayStart + x.to * 3600e3);
    const lvl = a >= 0.4 ? 0 : a <= -0.4 ? 2 : 1;
    const ADJ: Record<string, [string, string][]> = {
      'Утро': [['Утро', 'лёгкое'], ['Утро', 'ровное'], ['Утро', 'напряжённое']],
      'День': [['Середина дня', 'лёгкая'], ['Середина дня', 'ровная'], ['Середина дня', 'напряжённая']],
      'Вечер': [['Вечер', 'лёгкий'], ['Вечер', 'ровный'], ['Вечер', 'напряжённый']],
    };
    const [nm, adj] = ADJ[x.slot][lvl];
    let text = `${nm} ${adj}${r[best] >= 0.5 ? `, удачнее всего — ${name(best)}` : ''}.`;
    const prev = i ? avg(slots[i - 1]) : null;
    if (prev !== null && a - prev >= 0.3) text += ' Становится легче.';
    if (prev !== null && prev - a >= 0.3) text += ' Напряжение растёт.';
    if (evs.length) text += ` ${evs.slice(0, 2).map((e, k) => `${k ? 'около' : 'Около'} ${fmtTime(e.t)} — ${e.text}`).join('; ')}.`;
    if (moon.voc && moon.voc.start < dayStart + x.to * 3600e3 && moon.voc.end > dayStart + x.from * 3600e3) text += ` С ${fmtTime(Math.max(moon.voc.start, dayStart + x.from * 3600e3))} Луна «без курса» — начатое может не получить продолжения.`;
    return { slot: x.slot, score: Math.round(a * 10) / 10, text };
  });

  // где легко, где трудно
  const contrib = (s: Sphere) => [...real].map(t => ({ t, v: t.score * relevanceOf(t, s, who) })).sort((a, b) => b.v - a.v);
  const sp = [...synth.spheres].sort((a, b) => b.score - a.score);
  const bestS = sp[0], worstS = sp[sp.length - 1];
  const upT = contrib(bestS.sphere)[0], downT = contrib(worstS.sphere).slice(-1)[0];
  const easy = bestS.score >= 0.3 && upT && upT.v > 0
    ? `Легче всего сегодня — ${name(bestS.sphere)}: ${PLAIN_ACT[upT.t.t]?.who ?? ''} ${natureOf(upT.t.aspect) === 'soft' ? PLAIN_ACT[upT.t.t]?.soft : PLAIN_ACT[upT.t.t]?.conj} ${POINT[upT.t.n] ?? ''}. ${cap(SPHERE_ADVICE[bestS.sphere].up)}.`
    : 'Явно лёгких сфер нет — опирайтесь на привычные дела и людей, в которых уверены.';
  const hard = worstS.score <= -0.3 && downT && downT.v < 0
    ? `Больше всего сил потребует сфера ${SPHERE_Q[worstS.sphere]}: ${PLAIN_ACT[downT.t.t]?.who ?? ''} ${PLAIN_ACT[downT.t.t]?.hard} ${POINT[downT.t.n] ?? ''}. ${cap(SPHERE_ADVICE[worstS.sphere].down)}.`
    : 'Явно трудных сфер нет — день не будет сопротивляться вашим планам.';

  // план
  const plan: DayReview['plan'] = { do: [], avoid: [] };
  if (bestS.score >= 0.3) plan.do.push(SPHERE_DO[bestS.sphere]);
  for (const t of [...pos].sort((a, b) => b.score - a.score)) { if (plan.do.length >= 3) break; const a = ADVICE[t.t]; if (a && !plan.do.some(x => x.toLowerCase().includes(a.toLowerCase()))) plan.do.push(cap(a)); }
  for (const t of [...neg].sort((a, b) => a.score - b.score)) { if (plan.avoid.length >= 3) break; const a = NOT_DO[t.t]; if (a && !plan.avoid.includes(a)) plan.avoid.push(a); }
  if (!plan.do.length) plan.do.push('Доделать начатое и выделить время на отдых');
  if (!plan.avoid.length) plan.avoid.push('Придумывать себе тревоги — поводов для них нет');
  const good = events.find(e => e.tone === 'pos' && ['venus', 'jupiter', 'sun', 'mc', 'mercury'].includes(e.n)) ?? events.find(e => e.tone === 'pos');
  const bad = events.find(e => e.tone === 'neg' && ['mars', 'saturn', 'uranus', 'pluto', 'moon', 'sun'].includes(e.n));
  if (good) plan.best = `около ${fmtTime(good.t)} — ${good.text}`;
  if (moon.voc && moon.voc.start < dayStart + 24 * 3600e3 && moon.voc.end > dayStart + 6 * 3600e3) plan.tricky = `${fmtTime(Math.max(moon.voc.start, dayStart + 6 * 3600e3))}–${moon.voc.end < dayStart + 24 * 3600e3 ? fmtTime(moon.voc.end) : 'полночь'} — Луна без курса: новое не начинать`;
  else if (bad) plan.tricky = `около ${fmtTime(bad.t)} — ${bad.text}`;
  void lonOf;
  return { headline, mood, main, flow, events: events.slice(0, 6), easy, hard, plan };
}
export const MOON_GLYPH = GLYPH;

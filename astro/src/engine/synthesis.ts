// Разбор дня: как транзиты взаимодействуют между собой и как складываются в сферы жизни.
// Транзиты группируются по узлам карты (конфигурациям); быстрые планеты, задевающие точку долгого транзита
// или саму медленную планету, отмечаются как «спусковой крючок» — долгая тема ощутима именно сегодня.
import { ASPECT } from './aspects';
import { sep, type PointId } from './core';
import { PL_NOM, pointRu } from './events';
import { transitScore, transitStrength, relevanceOf, type Sphere, SPHERES, type PairScale } from './scores';
import type { Transit } from './transits';
import { CONFIGS_DIMA, CONFIGS_ME, GIFT, GIFT_NOM, PL_GEN, SPHERE_ADVICE, SPHERE_Q, THREAT, DIMA_NEED, type Config } from '../content/synthText';

export interface TLike extends Transit { score: number; strength: number }
export interface Link { config: Config; tone: 'pos' | 'neg' | 'mix'; players: { t: PointId; n: PointId; aspect: string; score: number }[]; text: string; weight: number }
export interface SphereNote { sphere: Sphere; score: number; up: string[]; down: string[]; text: string }
export interface DaySynthesis {
  title: string; subtitle: string; tone: 'pos' | 'neg' | 'mix' | 'calm';
  overview: string[]; links: Link[]; triggers: string[]; spheres: SphereNote[];
}

const FAST: PointId[] = ['moon', 'sun', 'mercury', 'venus', 'mars'];
const SLOW: PointId[] = ['jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'chiron'];
const STELLIUM = ['sun', 'mercury', 'venus'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const join = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} и ${xs[xs.length - 1]}`);
const plural = (n: number, one: string, few: string, many: string) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? few : many; };
/** транзиты одной планеты — одной фразой: «Хирон ☍ мой Хирон и ☍ мой MC» */
function byPlanet(xs: TLike[], who: 'me' | 'dima'): { t: PointId; text: string }[] {
  const out: { t: PointId; text: string }[] = [];
  for (const x of xs) {
    const o = out.find(y => y.t === x.t);
    const part = `${ASPECT[x.aspect].glyph} ${pointRu(x.n, who)}`;
    if (o) o.text += ` и ${part}`; else out.push({ t: x.t, text: `${PL_NOM[x.t]} ${part}` });
  }
  return out;
}
const label = (t: TLike, who: 'me' | 'dima') => `${PL_NOM[t.t]} ${ASPECT[t.aspect].glyph} ${pointRu(t.n, who)}`;

function configsFor(t: TLike, cfgs: Config[]): Config[] {
  const out = cfgs.filter(c => c.points.includes(t.n));
  // транзит к Урану или к стеллиуму — это и главный нерв
  if (cfgs === CONFIGS_ME && STELLIUM.includes(t.n)) { const nerve = cfgs.find(c => c.id === 'nerve'); if (nerve && !out.includes(nerve) && (t.t === 'uranus' || SLOW.includes(t.t))) out.push(nerve); }
  if (cfgs === CONFIGS_ME && t.n === 'sun') { const pl = cfgs.find(c => c.id === 'pluto'); if (pl && !out.includes(pl)) out.push(pl); }
  if (cfgs === CONFIGS_ME && (t.n === 'venus' || t.n === 'neptune')) { const cr = cfgs.find(c => c.id === 'career'); if (cr && !out.includes(cr) && SLOW.includes(t.t)) out.push(cr); }
  return out;
}

function linkText(c: Config, tone: Link['tone'], pl: TLike[], who: 'me' | 'dima'): string {
  const pos = byPlanet(pl.filter(p => p.score > 0).sort((a, b) => b.score - a.score), who);
  const neg = byPlanet(pl.filter(p => p.score < 0).sort((a, b) => a.score - b.score), who);
  const parts: string[] = [];
  const n = pos.length + neg.length;
  if (n === 1) {
    const p = (pos[0] ?? neg[0]);
    parts.push(`${p.text}: ${pos.length ? `приносит ${GIFT[p.t]}` : THREAT[p.t]}.`);
  } else if (tone === 'mix') {
    parts.push(`Здесь сходятся ${n} ${plural(n, 'влияние', 'влияния', 'влияний')}. ${pos[0].text} даёт ${GIFT[pos[0].t]}, а ${neg[0].text} ${THREAT[neg[0].t]}.`);
  } else if (tone === 'pos') {
    parts.push(`Поддержка с ${n > 2 ? 'нескольких' : 'двух'} сторон: ${join(pos.map(p => `${p.text} — ${GIFT[p.t]}`))}. Такое совпадение бывает нечасто.`);
  } else {
    parts.push(`Давление с ${n > 2 ? 'нескольких' : 'двух'} сторон: ${join(neg.map(p => `${p.text} ${THREAT[p.t]}`))}.`);
  }
  parts.push(`Итог: ${c[tone]}.`);
  return parts.join(' ');
}

export function synthesizeDay(trs: TLike[], sky: { id: PointId; lon: number }[], moonSignText: string, who: 'me' | 'dima' = 'me'): DaySynthesis {
  const cfgs = who === 'me' ? CONFIGS_ME : CONFIGS_DIMA;
  const strong = trs.filter(t => t.strength > 0.25);
  // связки по узлам
  const byCfg = new Map<string, TLike[]>();
  for (const t of strong) for (const c of configsFor(t, cfgs)) { if (!byCfg.has(c.id)) byCfg.set(c.id, []); byCfg.get(c.id)!.push(t); }
  const links: Link[] = [];
  for (const [id, pl] of byCfg) {
    const c = cfgs.find(x => x.id === id)!;
    const uniq = pl.filter((p, i) => pl.findIndex(q => q.t === p.t && q.n === p.n && q.aspect === p.aspect) === i);
    const weight = uniq.reduce((s, p) => s + p.strength, 0);
    if (uniq.length < 2 && weight < 0.9) continue;
    const posW = uniq.filter(p => p.score > 0).reduce((s, p) => s + p.score, 0);
    const negW = -uniq.filter(p => p.score < 0).reduce((s, p) => s + p.score, 0);
    const tone: Link['tone'] = posW > 0.15 && negW > 0.15 ? 'mix' : posW >= negW ? 'pos' : 'neg';
    links.push({ config: c, tone, weight, players: uniq.map(p => ({ t: p.t, n: p.n, aspect: p.aspect, score: p.score })), text: linkText(c, tone, uniq, who) });
  }
  links.sort((a, b) => b.weight - a.weight);

  // спусковые крючки: быстрая планета задевает точку долгого транзита или саму медленную планету
  const triggers: string[] = [];
  const slowT = trs.filter(t => SLOW.includes(t.t) && t.t !== 'chiron' || t.t === 'chiron' && t.strength > 0.5);
  for (const f of trs.filter(t => FAST.includes(t.t) && t.strength > 0.2)) {
    const s = slowT.find(x => x.n === f.n);
    if (s && triggers.length < 3) triggers.push(`${label(f, who)} задевает ту же точку, что и долгий транзит ${PL_GEN[s.t]} (${ASPECT[s.aspect].glyph}) — его тема ощутима именно сегодня${f.t === 'moon' ? ', хотя и всего несколько часов' : ''}.`);
  }
  for (const f of sky.filter(x => FAST.includes(x.id))) {
    for (const s of sky.filter(x => ['saturn', 'uranus', 'neptune', 'pluto', 'jupiter'].includes(x.id))) {
      const d = sep(f.lon, s.lon);
      for (const [ang, g, w] of [[0, '☌', 'сливается с'], [90, '□', 'спорит с'], [180, '☍', 'противостоит']] as const) {
        if (Math.abs(d - ang) < (f.id === 'moon' ? 3 : 1.5) && triggers.length < 4) {
          if (trs.some(t => t.t === s.id && t.strength > 0.4)) triggers.push(`${PL_NOM[f.id]} ${g} ${PL_NOM[s.id]} в небе: ${PL_NOM[f.id]} ${w} планетой, которая сейчас работает с вашей картой, — её транзит звучит громче.`);
        }
      }
    }
  }

  // сферы
  const spheres: SphereNote[] = SPHERES.map(s => ({ sphere: s.id, score: 0, up: [], down: [], text: '' }));
  const contrib = (t: TLike, sp: Sphere) => t.score * relevance(t, sp, who);
  for (const sn of spheres) {
    const cs = trs.map(t => ({ t, v: contrib(t, sn.sphere) })).filter(x => Math.abs(x.v) > 0.05).sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
    const ups = cs.filter(x => x.v > 0).slice(0, 2), downs = cs.filter(x => x.v < 0).slice(0, 2);
    sn.up = ups.map(x => label(x.t, who)); sn.down = downs.map(x => label(x.t, who));
    const sum = cs.reduce((a, x) => a + x.v, 0);
    sn.score = Math.round(2 * Math.tanh(sum / 2.2) * 10) / 10;
    const state = ups.length && downs.length && Math.abs(sum) < 0.9 ? 'mix' : sum > 0.25 ? 'up' : sum < -0.25 ? 'down' : 'calm';
    const parts: string[] = [];
    const U = byPlanet(ups.map(x => x.t), who), D = byPlanet(downs.map(x => x.t), who);
    if (U.length) parts.push(`Помогает ${U.map(x => `${x.text} — даёт ${GIFT[x.t]}`).join('; ')}.`);
    if (D.length) parts.push(`Мешает ${D.map(x => `${x.text} — ${THREAT[x.t]}`).join('; ')}.`);
    if (U.length && D.length && U[0].t !== D[0].t) parts.push(`Как это сложится: ${GIFT_NOM[U[0].t]} есть, но ${PL_NOM[D[0].t]} ${THREAT[D[0].t]} — поэтому ${SPHERE_ADVICE[sn.sphere].mix}.`);
    else if (U.length && D.length) parts.push(`Как это сложится: ${SPHERE_ADVICE[sn.sphere].mix}.`);
    else parts.push(cap(SPHERE_ADVICE[sn.sphere][state as 'up']) + '.');
    sn.text = parts.join(' ');
  }

  // общий тон и заголовок дня
  const posW = trs.filter(t => t.score > 0).reduce((s, t) => s + t.score, 0);
  const negW = -trs.filter(t => t.score < 0).reduce((s, t) => s + t.score, 0);
  const tone: DaySynthesis['tone'] = posW + negW < 1.2 ? 'calm' : posW > negW * 1.5 ? 'pos' : negW > posW * 1.5 ? 'neg' : 'mix';
  const lead = links[0];
  const title = lead ? lead.config.title[lead.tone] : tone === 'calm' ? 'Тихий день' : tone === 'pos' ? 'День в плюс' : tone === 'neg' ? 'День осторожности' : 'День контрастов';
  const subtitle = lead ? `${lead.config.name}: ${lead.config.short}` : moonSignText;
  const overview: string[] = [];
  const slowCount = trs.filter(t => SLOW.includes(t.t)).length, fastCount = trs.filter(t => FAST.includes(t.t)).length;
  const tonePhrase = tone === 'pos' ? 'Гармоничных влияний заметно больше, чем напряжённых — день скорее помогает.' : tone === 'neg' ? 'Напряжённых влияний больше — день требует осторожности и терпения, но не опасен.' : tone === 'mix' ? 'Поддержка и напряжение почти уравновешены — день контрастный: где-то легко, где-то тормозит.' : 'Сильных влияний мало — день держится на вашем собственном ритме.';
  overview.push(tonePhrase);
  if (slowCount) overview.push(`Фон задают долгие транзиты (${slowCount}) — это недели и месяцы; быстрые (${fastCount}) лишь окрашивают сегодняшний день.`);
  if (links.length >= 2) overview.push(`Главные узлы дня: ${links.slice(0, 3).map(l => `«${l.config.name}»`).join(', ')}. Они связаны: что происходит в одном, отражается в другом.`);
  else if (links.length === 1) overview.push(`Главная тема дня — «${lead.config.name}».`);
  const best = [...spheres].sort((a, b) => b.score - a.score)[0], worst = [...spheres].sort((a, b) => a.score - b.score)[0];
  if (best.score >= 0.5) overview.push(`Лучше всего сегодня складывается сфера ${SPHERE_Q[best.sphere]}${worst.score <= -0.5 ? `, труднее всего — ${SPHERE_Q[worst.sphere]}` : ''}.`);
  else if (worst.score <= -0.5) overview.push(`Больше всего внимания просит сфера ${SPHERE_Q[worst.sphere]}.`);
  return { title, subtitle, tone, overview, links: links.slice(0, 4), triggers, spheres };
}

// релевантность — те же веса, что и в шкалах (scores.ts), но для объяснения по сферам
function relevance(t: TLike, s: Sphere, who: 'me' | 'dima') { return relevanceOf(t, s, who); }

// ── пара ──
export interface PairSynthesis { title: string; summary: string[]; scaleNotes: Record<PairScale, string>; dima: string[]; need: string; doList: string[]; avoidList: string[] }

export function synthesizePair(mine: TLike[], his: TLike[], scores: Record<PairScale, number>, evening: Record<PairScale, number>, sharedHits: { name: string; hits: TLike[] }[]): PairSynthesis {
  const top = (xs: TLike[]) => [...xs].filter(x => x.strength > 0.3).sort((a, b) => b.strength - a.strength);
  const mineTop = top(mine), hisTop = top(his);
  const love = (xs: TLike[]) => xs.filter(t => ['venus', 'moon', 'dsc', 'mars', 'spirit', 'vertex', 'lilith'].includes(t.n));
  const word = (xs: TLike[]) => xs.filter(t => t.n === 'mercury' || t.t === 'mercury');
  const title = scores.conflict >= 1.2 ? 'Горячий день — беречь слова' : scores.tender >= 0.8 ? 'День нежности' : scores.passion >= 0.8 ? 'Искра в воздухе' : scores.talk >= 0.8 ? 'Легко договориться' : evening.tender > scores.tender + 0.5 ? 'Вечер теплее дня' : 'Ровный день, тыл держится';
  const summary: string[] = [];
  const mineL = love(mineTop), hisL = love(hisTop);
  summary.push(mineL.length || hisL.length ? `Сегодня любовные точки задеты ${mineL.length && hisL.length ? 'у обоих' : mineL.length ? 'у вас' : 'у Димы'}: ${[...mineL.slice(0, 2).map(t => label(t, 'me')), ...hisL.slice(0, 2).map(t => label(t, 'dima'))].join(', ')}.` : 'Любовные точки обеих карт сегодня спокойны — отношения держатся на привычном тепле и Сатурне пары: времени и обязательствах.');
  const w = [...word(mineTop), ...word(hisTop)];
  if (w.length) summary.push(`Слова сегодня под влиянием ${[...new Set(w.slice(0, 3).map(t => PL_GEN[t.t]))].join(' и ')}: помните о главной зоне споров пары — мой Марс □ его Меркурий. ${w.some(t => t.score < 0) ? 'Сегодня она чувствительна: тон важнее сути.' : 'Сегодня договориться легче обычного.'}`);
  const shared = sharedHits.filter(s => s.hits.length);
  if (shared.length) summary.push(`Задевает обоих сразу: ${shared.map(s => `${s.name} (${[...new Set(s.hits.map(h => PL_NOM[h.t]))].join(', ')})`).join('; ')} — это общий опыт, проживайте его вместе.`);
  if (Math.abs(evening.tender - scores.tender) >= 0.5 || Math.abs(evening.conflict - scores.conflict) >= 0.5) summary.push(`К вечеру ${evening.tender > scores.tender ? 'теплеет' : 'холодает'}${evening.conflict > scores.conflict ? ', а напряжение растёт — важные разговоры лучше днём' : evening.conflict < scores.conflict ? ', напряжение спадает — вечер подходит для разговора' : ''}.`);
  const sc = (v: number, hi: string, lo: string, mid: string) => (v >= 0.7 ? hi : v <= -0.7 ? lo : mid);
  const scaleNotes: Record<PairScale, string> = {
    tender: sc(scores.tender, 'Тепло само идёт в руки: объятия, забота, общий ужин.', 'Каждый немного в себе; тепло нужно проявить первым — без ожиданий.', 'Нежность ровная: держится на привычных ритуалах.'),
    talk: sc(scores.talk, 'Слова находятся легко — хороший день для планов и быта.', 'Слова путаются: переспрашивайте и не додумывайте за другого.', 'Разговоры обычные; сложные темы — по одной.'),
    passion: sc(scores.passion, 'Притяжение сильнее обычного — устройте вечер для двоих.', 'Страсть приглушена или колюча — не требуйте, дайте ей время.', 'Страсть по настроению.'),
    conflict: scores.conflict >= 1.2 ? 'Высокая: спорные темы отложите, правило пары — выслушать до конца.' : scores.conflict >= 0.5 ? 'Средняя: возможны уколы на ровном месте; юмор и пауза спасают.' : 'Низкая: можно обсуждать даже трудное.',
  };
  const dima = hisTop.slice(0, 3).map(t => `${label(t, 'dima')}: ${t.score >= 0 ? `ему даёт ${GIFT[t.t]}` : `${THREAT[t.t]}`}.`);
  const needKey = hisTop.find(t => DIMA_NEED[t.n])?.n;
  const need = needKey ? `Что ему нужно от вас сегодня: ${DIMA_NEED[needKey]}.` : 'Сегодня ему достаточно обычного тепла и вашего присутствия.';
  const doList: string[] = [], avoidList: string[] = [];
  if (scores.tender >= 0.3 || evening.tender >= 0.3) doList.push('время вдвоём без телефонов');
  if (scores.talk >= 0.3) doList.push('обсудить планы и быт');
  if (scores.passion >= 0.3) doList.push('вечер только для двоих');
  if (doList.length === 0) doList.push('маленький знак внимания — сообщение, кофе, прикосновение');
  if (scores.conflict >= 0.5) avoidList.push('спорить о тоне и словах');
  if (scores.talk <= -0.3) avoidList.push('додумывать за другого');
  if (hisTop.some(t => t.n === 'moon' || t.n === 'saturn')) avoidList.push('оставлять его в неизвестности');
  if (avoidList.length === 0) avoidList.push('откладывать тёплые слова «на потом»');
  return { title, summary, scaleNotes, dima, need, doList, avoidList };
}
export { transitScore, transitStrength };

// Тонкости толкования — то, что отличает разбор астролога от простого списка аспектов:
// 1) хозяева времени (профекция, даши), 2) управления домами, 3) сходимость и станции, 4) секта карты,
// 5) состояние транзитной планеты (достоинства, ретроградность), 6) фигуры, двойные попадания, точки затмений,
// 7) рецепции, диспозиторы и взаимное смягчение и усиление аспектов на одной точке.
// Каждая тонкость даёт множитель силы транзита и, если заметна, — заметку с объяснением.
import * as A from 'astronomy-engine';
import { bodyPos, lonOf, norm, sep, signOf, type BodyPos, type PointId } from './core';
import { ASPECT, aspectsWithin, natalOrb, transitOrb } from './aspects';
import { natal, ME, DIMA, type Chart, type Person } from './chart';
import { profection, progressedPoints, SIGN_RULER_TRAD } from './progress';
import { dashaAt, vimshottari, type Graha } from './vedic';
import { ruledHouses } from './scores';
import { PL_NOM, pointRu } from './events';
import type { Transit } from './transits';

export interface NuanceNote { kind: string; icon: string; title: string; text: string; weight: number }

const MODERN_RULER: Record<number, PointId> = { 7: 'pluto', 10: 'uranus', 11: 'neptune' };
const EXALT: Partial<Record<PointId, number>> = { sun: 0, moon: 1, mercury: 5, venus: 11, mars: 9, jupiter: 3, saturn: 6 };
const PLANETS7: PointId[] = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn'];
const OUTER: PointId[] = ['uranus', 'neptune', 'pluto'];
const BENEFIC = new Set<PointId>(['venus', 'jupiter']);
const MALEFIC = new Set<PointId>(['mars', 'saturn', 'pluto', 'uranus']);
const HARD = new Set(['square', 'opp', 'semisq', 'sesq', 'quincunx']);
const SOFT = new Set(['trine', 'sext', 'semisext', 'quintile']);
const GEN: Record<string, string> = { sun: 'Солнца', moon: 'Луны', mercury: 'Меркурия', venus: 'Венеры', mars: 'Марса', jupiter: 'Юпитера', saturn: 'Сатурна', uranus: 'Урана', neptune: 'Нептуна', pluto: 'Плутона', chiron: 'Хирона', node: 'Узла' };
const SIGN_PREP = ['Овне', 'Тельце', 'Близнецах', 'Раке', 'Льве', 'Деве', 'Весах', 'Скорпионе', 'Стрельце', 'Козероге', 'Водолее', 'Рыбах'];
const HOUSE_WORD = ['личность', 'деньги', 'слово и документы', 'дом и семья', 'любовь и творчество', 'работа и здоровье', 'партнёрство', 'кризисы и близость', 'учёба и дальние горизонты', 'карьера', 'друзья и планы', 'тайное и отдых'];
const GRAHA_POINT: Record<Graha, PointId> = { sun: 'sun', moon: 'moon', mars: 'mars', mercury: 'mercury', jupiter: 'jupiter', venus: 'venus', saturn: 'saturn', rahu: 'node', ketu: 'snode' };
const FEM = new Set(['moon', 'venus']);
const CORE = new Set<string>(['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'asc', 'mc', 'node', 'chiron']);
const lord = (p: string) => (FEM.has(p) ? 'хозяйка' : 'хозяин');
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

export function rulerOf(sign: number): PointId { return SIGN_RULER_TRAD[sign]; }

/** эссенциальное достоинство: обитель, экзальтация, изгнание, падение */
export function dignity(p: PointId, sign: number): 'domicile' | 'exalt' | 'detriment' | 'fall' | '' {
  const homes = [...SIGN_RULER_TRAD.map((r, i) => (r === p ? i : -1)), ...Object.entries(MODERN_RULER).map(([s, r]) => (r === p ? Number(s) : -1))].filter(x => x >= 0);
  if (homes.includes(sign)) return 'domicile';
  if (EXALT[p] === sign) return 'exalt';
  if (homes.some(h => (h + 6) % 12 === sign)) return 'detriment';
  if (EXALT[p] !== undefined && (EXALT[p]! + 6) % 12 === sign) return 'fall';
  return '';
}
const DIGN_RU = { domicile: 'в обители', exalt: 'в экзальтации', detriment: 'в изгнании', fall: 'в падении', '': '' };

/** цепочки диспозиторов натальной карты и финальный диспозитор (традиционные управители) */
export function dispositors(c: Chart): { final: PointId | null; chains: Record<string, PointId[]>; receptions: [PointId, PointId][] } {
  const chains: Record<string, PointId[]> = {};
  const ends = new Set<string>();
  for (const p of [...PLANETS7, ...OUTER]) {
    const chain: PointId[] = [p];
    let cur = p;
    for (let k = 0; k < 10; k++) {
      const r = rulerOf(c.points[cur].sign);
      if (r === cur || chain.includes(r)) { if (r !== cur) chain.push(r); break; }
      chain.push(r); cur = r;
    }
    chains[p] = chain;
    const last = chain[chain.length - 1];
    ends.add(rulerOf(c.points[last].sign) === last ? last : 'loop');
  }
  const receptions: [PointId, PointId][] = [];
  for (let i = 0; i < PLANETS7.length; i++) for (let j = i + 1; j < PLANETS7.length; j++) {
    const a = PLANETS7[i], b = PLANETS7[j];
    if (rulerOf(c.points[a].sign) === b && rulerOf(c.points[b].sign) === a) receptions.push([a, b]);
  }
  return { final: ends.size === 1 && !ends.has('loop') ? ([...ends][0] as PointId) : null, chains, receptions };
}

interface Ctx {
  who: 'me' | 'dima'; person: Person; natal: Chart; d: Date;
  sky: Partial<Record<PointId, BodyPos>>;
  lords: { year: PointId; md: PointId; ad: PointId; profSign: number; age: number };
  prog: Partial<Record<PointId, { lon: number }>>;
  eclipses: { lon: number; t: number; solar: boolean }[];
}

const _natal: Partial<Record<'me' | 'dima', Chart>> = {};
const _dashas: Partial<Record<'me' | 'dima', ReturnType<typeof vimshottari>>> = {};
const _ecl = new Map<number, { lon: number; t: number; solar: boolean }[]>();

function eclipsesAround(d: Date) {
  const key = Math.floor(d.getTime() / (20 * 864e5));
  if (_ecl.has(key)) return _ecl.get(key)!;
  const out: { lon: number; t: number; solar: boolean }[] = [];
  const from = new Date(d.getTime() - 190 * 864e5), to = d.getTime() + 40 * 864e5;
  for (let s = A.SearchGlobalSolarEclipse(from); s.peak.date.getTime() < to; s = A.NextGlobalSolarEclipse(s.peak)) out.push({ lon: lonOf('sun', s.peak.date), t: s.peak.date.getTime(), solar: true });
  for (let l = A.SearchLunarEclipse(from); l.peak.date.getTime() < to; l = A.NextLunarEclipse(l.peak)) if (l.kind !== 'penumbral') out.push({ lon: lonOf('moon', l.peak.date), t: l.peak.date.getTime(), solar: false });
  _ecl.set(key, out);
  return out;
}

export function makeCtx(who: 'me' | 'dima', d: Date): Ctx {
  const person = who === 'me' ? ME : DIMA;
  const nat = (_natal[who] ??= natal(person));
  const ds = (_dashas[who] ??= vimshottari(nat));
  const { md, ad } = dashaAt(ds, d);
  const prof = profection(person, nat, d);
  const sky: Partial<Record<PointId, BodyPos>> = {};
  for (const id of ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'chiron', 'node'] as PointId[]) sky[id] = bodyPos(id, d);
  return { who, person, natal: nat, d, sky, lords: { year: prof.lord, md: GRAHA_POINT[md.lord], ad: GRAHA_POINT[ad.lord], profSign: prof.sign, age: prof.age }, prog: progressedPoints(person, nat, d), eclipses: eclipsesAround(d) };
}

const clamp = (x: number) => Math.max(0.5, Math.min(2.1, x));
const str = (t: Transit) => (t as unknown as { strength?: number }).strength ?? 1;

/** поправки к силе каждого транзита + заметки «Тонкости дня» */
export function applyNuance<T extends Transit>(trs: T[], ctx: Ctx, withNotes = true): { trs: T[]; notes: NuanceNote[] } {
  const notes: NuanceNote[] = [];
  const add = (n: NuanceNote) => { if (withNotes && !notes.some(x => x.title === n.title)) notes.push(n); };
  const L = (t: Transit) => `${PL_NOM[t.t]} ${ASPECT[t.aspect].glyph} ${pointRu(t.n, ctx.who)}`;
  const out = trs.map(t => ({ ...t, mult: 1, tags: [] as string[] }));
  const night = !ctx.natal.day;
  const natalOpp = aspectsWithin(ctx.natal.points, ctx.natal.points, natalOrb, true).filter(h => ['opp', 'trine', 'sext'].includes(h.aspect) && CORE.has(h.a) && CORE.has(h.b));

  for (const t of out) {
    const hard = HARD.has(t.aspect), soft = SOFT.has(t.aspect);
    const sk = ctx.sky[t.t];
    // 3) сходимость и станции
    if (sk?.station && t.t !== 'sun' && t.t !== 'moon') { t.mult *= 1.4; t.tags.push('станция на точке'); }
    else if (!t.exactNow) t.mult *= t.applying ? 1.1 : 0.8;
    // 1) хозяева времени
    const Y = ctx.lords.year;
    if (t.n === Y || t.t === Y) { t.mult *= 1.35; t.tags.push(`${lord(Y)} года`); }
    if (t.n === ctx.lords.ad || t.t === ctx.lords.ad) { t.mult *= 1.2; t.tags.push('владыка периода'); }
    else if (t.n === ctx.lords.md || t.t === ctx.lords.md) { t.mult *= 1.1; t.tags.push('владыка даши'); }
    // 4) секта: в ночной карте Сатурн тяжелее, Марс мягче, Венера — благодетель секты; в дневной — наоборот
    if (hard && t.t === (night ? 'saturn' : 'mars')) { t.mult *= 1.2; t.tags.push('вредитель вне секты'); }
    if (hard && t.t === (night ? 'mars' : 'saturn')) t.mult *= 0.85;
    if ((soft || t.aspect === 'conj') && t.t === (night ? 'venus' : 'jupiter')) { t.mult *= 1.15; t.tags.push('благодетель секты'); }
    // 5) состояние транзитной планеты
    if (sk && t.t !== 'moon') {
      const dg = dignity(t.t, signOf(sk.lon));
      if (dg === 'domicile' || dg === 'exalt') { t.mult *= hard ? 0.85 : 1.15; t.tags.push(DIGN_RU[dg]); }
      if (dg === 'detriment' || dg === 'fall') { t.mult *= hard ? 1.2 : 0.9; t.tags.push(DIGN_RU[dg]); }
      if (sk.retro && t.t !== 'node') { t.mult *= 0.92; }
    }
    // 7) рецепции транзитной и натальной планеты
    const np = ctx.natal.points[t.n];
    if (np && sk && [...PLANETS7, ...OUTER].includes(t.n)) {
      const tIn = rulerOf(signOf(sk.lon)) === t.n || MODERN_RULER[signOf(sk.lon)] === t.n;
      const nIn = rulerOf(np.sign) === t.t || MODERN_RULER[np.sign] === t.t;
      if (tIn && nIn) { if (hard) t.mult *= 0.7; t.tags.push('взаимная рецепция'); add({ kind: 'reception', icon: '⇄', title: `Взаимная рецепция: ${PL_NOM[t.t]} и ${pointRu(t.n, ctx.who)}`, text: `${PL_NOM[t.t]} стоит в знаке, которым управляет ${pointRu(t.n, ctx.who)}, а ${pointRu(t.n, ctx.who)} — в знаке ${GEN[t.t]}. Планеты «гостят друг у друга»: даже ${hard ? 'напряжённый' : 'этот'} аспект ${L(t)} работает как договорённость, а не как конфликт.`, weight: 2 }); }
      else if (tIn && hard) { t.mult *= 0.88; t.tags.push('гость у хозяина'); }
    }
    // 6) двойное попадание: прогрессия в ту же точку
    if (np && CORE.has(t.n) && ['saturn', 'jupiter', 'uranus', 'neptune', 'pluto'].includes(t.t) && t.aspect in { conj: 1, opp: 1, square: 1, trine: 1, sext: 1 }) for (const pid of ['sun', 'moon', 'mercury', 'venus', 'mars', 'asc', 'mc'] as PointId[]) {
      const pp = ctx.prog[pid];
      if (!pp || pid === t.n) continue;
      const s = sep(pp.lon, np.lon);
      const hit = [0, 90, 180].find(a => Math.abs(s - a) <= 1);
      if (hit !== undefined) {
        t.mult *= 1.3; t.tags.push('двойное попадание');
        add({ kind: 'double', icon: '◎', title: `Двойное попадание: ${pointRu(t.n, ctx.who)}`, text: `Сюда сейчас бьют сразу транзит (${L(t)}) и прогрессия (прогр. ${PL_NOM[pid]} ${hit === 0 ? '☌' : hit === 90 ? '□' : '☍'}). Когда медленный внутренний процесс и внешнее событие совпадают, тема проявляется особенно ярко — это событие, а не настроение.`, weight: 2.6 });
        break;
      }
    }
    // 6) точки затмений
    for (const e of ctx.eclipses) {
      if (np && Math.min(sep(e.lon, np.lon), Math.abs(sep(e.lon, np.lon) - 180)) <= 3 && Math.abs(e.t - ctx.d.getTime()) < 185 * 864e5 && sk && sep(sk.lon, e.lon) <= 3) {
        t.mult *= 1.2; t.tags.push('точка затмения');
      }
    }
  }

  // 6) фигуры: транзитная планета замыкает натальную оппозицию в тау-квадрат, трин — в большой трин, секстиль — в йод
  for (const h of natalOpp) {
    for (const [tp, sk] of Object.entries(ctx.sky)) {
      if (!sk || tp === 'moon' || tp === h.a || tp === h.b) continue;
      const pa = ctx.natal.points[h.a].lon, pb = ctx.natal.points[h.b].lon;
      const need = h.aspect === 'opp' ? 90 : h.aspect === 'trine' ? 120 : 150;
      const orb = transitOrb(h.aspect === 'sext' ? 'quincunx' : 'square', tp as PointId) * 1.3;
      if (Math.abs(sep(sk.lon, pa) - need) <= orb && Math.abs(sep(sk.lon, pb) - need) <= orb) {
        const fig = h.aspect === 'opp' ? 'Тау-квадрат' : h.aspect === 'trine' ? 'Большой трин' : 'Йод («перст судьбы»)';
        for (const t of out) if (t.t === tp && (t.n === h.a || t.n === h.b)) { t.mult *= 1.2; t.tags.push(fig.split(' ')[0].toLowerCase()); }
        const meaning = h.aspect === 'opp' ? 'напряжение натальной оппозиции получает выход: давление заставляет действовать, но и даёт результат' : h.aspect === 'trine' ? 'замкнутый круг лёгкости: таланты этих точек работают сами — главное не расслабиться' : 'точка вынужденной подстройки: обстоятельства подталкивают к повороту, которого не избежать';
        add({ kind: 'figure', icon: '△', title: `${fig}: ${PL_NOM[tp]} + ${pointRu(h.a, ctx.who)} и ${pointRu(h.b, ctx.who).replace(/^(мой|моя|моё|его) /, '')}`, text: `${PL_NOM[tp]} сегодня образует с натальными ${pointRu(h.a, ctx.who)} и ${pointRu(h.b, ctx.who).replace(/^(мой|моя|моё|его) /, '')} фигуру «${fig}» — ${meaning}.`, weight: 2.4 });
      }
    }
  }

  // 7) смягчение и усиление: несколько транзитов на одну натальную точку
  const byN = new Map<string, typeof out>();
  for (const t of out) if (t.t !== 'moon' && t.orb <= transitOrb(t.aspect, t.t)) { if (!byN.has(t.n)) byN.set(t.n, []); byN.get(t.n)!.push(t); }
  let pairNotes = 0;
  for (const [n, ts] of byN) {
    if (ts.length < 2) continue;
    const benSoft = ts.find(t => BENEFIC.has(t.t) && ['trine', 'sext', 'conj'].includes(t.aspect));
    const malHard = ts.filter(t => MALEFIC.has(t.t) && ['square', 'opp', 'quincunx'].includes(t.aspect));
    if (benSoft && malHard.length) {
      for (const m of malHard) { m.mult *= 0.75; m.tags.push(`смягчено: ${PL_NOM[benSoft.t]}`); }
      add({ kind: 'soften', icon: '☁', title: `${PL_NOM[benSoft.t]} смягчает ${malHard.map(m => PL_NOM[m.t]).join(' и ')}`, text: `${cap(pointRu(n as PointId, ctx.who))} под давлением (${malHard.map(L).join(', ')}), но ${L(benSoft)} подставляет плечо. Трудность остаётся, но проходит мягче и с поддержкой — людей, денег или удачного случая.`, weight: 2.2 });
    } else if (malHard.length >= 2) {
      for (const m of malHard) { m.mult *= 1.2; m.tags.push('двойное давление'); }
      add({ kind: 'aggravate', icon: '⚠', title: `Двойное давление: ${pointRu(n as PointId, ctx.who)}`, text: `${malHard.map(L).join(' и ')} — два тяжёлых влияния на одну точку усиливают друг друга. Это главная зона осторожности дня: не форсируйте и не принимайте здесь решений на пике.`, weight: 2.5 });
    }
    // пары планет на одной точке — свой характер
    const planets = [...new Set(ts.map(t => t.t))];
    for (let i = 0; i < planets.length; i++) for (let j = i + 1; j < planets.length; j++) {
      const key = [planets[i], planets[j]].sort().join('|');
      const txt = PAIR_RULE[key];
      const slowIn = [planets[i], planets[j]].some(p => ['jupiter', 'saturn', 'uranus', 'neptune', 'pluto'].includes(p));
      if (txt && pairNotes < 2 && slowIn) { pairNotes++; add({ kind: 'pair', icon: '∞', title: `${PL_NOM[planets[i]]} и ${PL_NOM[planets[j]]} — на одной точке (${pointRu(n as PointId, ctx.who)})`, text: txt, weight: 1.8 }); }
    }
  }

  // 7) небо модулирует медленный транзит: благодетель в аспекте к транзитной планете смягчает её, вредитель — обостряет
  for (const slow of ['saturn', 'uranus', 'neptune', 'pluto'] as PointId[]) {
    const ss = ctx.sky[slow]; if (!ss || !out.some(t => t.t === slow)) continue;
    for (const f of ['venus', 'jupiter', 'mars', 'sun'] as PointId[]) {
      const fs = ctx.sky[f]; if (!fs) continue;
      const d = sep(fs.lon, ss.lon);
      const a = [[0, 'conj'], [60, 'sext'], [90, 'square'], [120, 'trine'], [180, 'opp']].find(([ang]) => Math.abs(d - (ang as number)) <= 3) as [number, string] | undefined;
      if (!a) continue;
      const benign = BENEFIC.has(f) ? !HARD.has(a[1]) : f === 'sun' && SOFT.has(a[1]);
      const harsh = f === 'mars' && (HARD.has(a[1]) || a[1] === 'conj');
      if (!benign && !harsh) continue;
      for (const t of out) if (t.t === slow && HARD.has(t.aspect)) t.mult *= benign ? 0.85 : 1.15;
      add({ kind: 'sky', icon: benign ? '✧' : 'ϟ', title: `${PL_NOM[f]} ${ASPECT[a[1] as 'conj'].glyph} ${PL_NOM[slow]} в небе`, text: benign ? `Сегодня ${PL_NOM[f]} поддерживает сам транзитный ${PL_NOM[slow]} — поэтому его долгие транзиты к вашей карте ощущаются легче обычного.` : `Сегодня Марс задевает транзитный ${PL_NOM[slow]} — его долгие транзиты к вашей карте обостряются на пару дней.`, weight: 1.6 });
    }
  }

  for (const t of out) t.mult = clamp(t.mult);

  if (withNotes) {
    // 1) хозяева времени — всегда первой строкой
    const Y = ctx.lords.year;
    const hitY = out.filter(t => (t.n === Y || t.t === Y) && t.orb <= transitOrb(t.aspect, t.t));
    add({ kind: 'lords', icon: '♛', title: `${lord(Y).charAt(0).toUpperCase() + lord(Y).slice(1)} года — ${PL_NOM[Y]}, период — ${PL_NOM[ctx.lords.md]}/${PL_NOM[ctx.lords.ad]}`, text: `${ctx.lords.age}-й год жизни — профекция в знак ${['Овна', 'Тельца', 'Близнецов', 'Рака', 'Льва', 'Девы', 'Весов', 'Скорпиона', 'Стрельца', 'Козерога', 'Водолея', 'Рыб'][ctx.lords.profSign]}: ${PL_NOM[Y]} ведёт этот год, а по ведическим дашам идёт период ${GEN[ctx.lords.md]} и ${GEN[ctx.lords.ad]}. Транзиты к этим планетам и от них весят больше обычного${hitY.length ? `. Сегодня это ${hitY.slice(0, 3).map(L).join(', ')}` : ''}.`, weight: hitY.length ? 3 : 1.2 });
    // 4) секта
    if (out.some(t => (t.t === 'saturn' || t.t === 'mars') && HARD.has(t.aspect)))
      add({ kind: 'sect', icon: night ? '☾' : '☀', title: night ? 'Ночная карта: Сатурн тяжелее, Марс мягче' : 'Дневная карта: Марс тяжелее, Сатурн мягче', text: night ? `Солнце при рождении было под горизонтом, поэтому для ${ctx.who === 'me' ? 'вас' : 'Димы'} Сатурн — «чужой» вредитель: его давление ощущается сильнее, а Марс — «свой»: его напор проще направить в дело. Венера — благодетель секты.` : 'Солнце при рождении было над горизонтом: Сатурн переносится легче, Марс — резче. Юпитер — благодетель секты.', weight: 1.4 });
    // 5) состояние главных транзитных планет
    for (const id of ['saturn', 'jupiter', 'mars', 'uranus', 'pluto', 'neptune', 'venus'] as PointId[]) {
      const sk = ctx.sky[id]; if (!sk || !out.some(t => t.t === id && str(t) > 0.3)) continue;
      const dg = dignity(id, signOf(sk.lon));
      if (!dg && !sk.retro && !sk.station) continue;
      const parts: string[] = [];
      if (dg) parts.push(`${DIGN_RU[dg]} (${SIGN_PREP[signOf(sk.lon)]})`);
      if (sk.station) parts.push('стоит — разворачивается');
      else if (sk.retro) parts.push(FEM.has(id) ? 'ретроградная' : 'ретроградный');
      const effect = dg === 'fall' || dg === 'detriment' ? 'действует грубее и неудобнее — его уроки резче' : dg ? 'в силе — действует чисто и конструктивно' : '';
      add({ kind: 'condition', icon: '⚖', title: `${PL_NOM[id]}: ${parts.join(', ')}`, text: `${PL_NOM[id]} сейчас ${parts.join(', ')}${effect ? ` — ${effect}` : ''}.${sk.retro ? ` Ретроградность переводит ${FEM.has(id) ? 'её' : 'его'} тему в пересмотр: возвращаются старые вопросы, новое лучше доделывать, а не начинать.` : ''}${sk.station ? ' Станция — самый сильный момент планеты: её транзиты сейчас звучат громче всего.' : ''}`, weight: sk.station ? 2.2 : 1.3 });
    }
    // 2) управления: через какие дома отзывается главный транзит
    const top = [...out].filter(t => [...PLANETS7, ...OUTER].includes(t.n)).sort((a, b) => b.mult * str(b) - a.mult * str(a)).slice(0, 2);
    for (const t of top) {
      const hs = ruledHouses(ctx.natal, t.n).filter(h => h !== ctx.natal.points[t.n].house);
      if (!hs.length) continue;
      const hsText = hs.length === 1 ? `${hs[0]}-м домом` : `${hs.slice(0, -1).map(h => `${h}-м`).join(', ')} и ${hs[hs.length - 1]}-м домами`;
      add({ kind: 'rulers', icon: '⌂', title: `${cap(pointRu(t.n, ctx.who))} управляет ${hsText}`, text: `Поэтому ${L(t)} отзывается не только там, где стоит ${pointRu(t.n, ctx.who).replace(/^(мой|моя|моё|его) /, '')} (${ctx.natal.points[t.n].house}-й дом — ${HOUSE_WORD[ctx.natal.points[t.n].house - 1]}), но и в темах: ${hs.map(h => HOUSE_WORD[h - 1]).join(', ')}.`, weight: 1.5 });
    }
    // 6) чувствительные точки затмений
    const now = ctx.d.getTime();
    for (const e of ctx.eclipses) {
      if (Math.abs(e.t - now) > 185 * 864e5) continue;
      const hitNat = (['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'asc', 'mc', 'node'] as PointId[]).filter(p => { const s = sep(e.lon, ctx.natal.points[p].lon); return s <= 3 || s >= 177; });
      const crossing = Object.entries(ctx.sky).filter(([id, s]) => s && id !== 'moon' && sep(s.lon, e.lon) <= 2).map(([id]) => id);
      if (hitNat.length && (crossing.length || Math.abs(e.t - now) < 40 * 864e5)) add({ kind: 'eclipse', icon: '◐', title: `Точка ${e.solar ? 'солнечного' : 'лунного'} затмения ${new Date(e.t + 3 * 3600e3).toISOString().slice(8, 10)}.${new Date(e.t + 3 * 3600e3).toISOString().slice(5, 7)}`, text: `Затмение легло на ${hitNat.map(p => pointRu(p, ctx.who)).join(', ')} — эта точка чувствительна около полугода. ${crossing.length ? `Сегодня через неё проходит ${crossing.map(c => PL_NOM[c]).join(' и ')} — тема затмения оживает.` : e.t > now ? 'Затмение впереди — подготовьтесь к перезапуску этой темы.' : ''}`, weight: crossing.length ? 2.3 : 1.5 });
    }
  }
  notes.sort((a, b) => b.weight - a.weight);
  return { trs: out, notes };
}

/** характер пар транзитных планет на одной точке */
const PAIR_RULE: Record<string, string> = {
  'jupiter|saturn': 'Юпитер и Сатурн на одной точке — рост через дисциплину: расширяться можно, но по плану и с обязательствами.',
  'mars|uranus': 'Марс и Уран вместе — резкие события, спешка, риск травм и вспышек: осторожность в движении, на дороге и в словах.',
  'neptune|venus': 'Венера и Нептун — романтика и иллюзии рядом: красиво и вдохновенно, но проверяйте реальность, особенно в деньгах и чувствах.',
  'neptune|saturn': 'Сатурн и Нептун — проверка мечты на реальность: что-то разочарует, зато останется настоящее.',
  'mars|pluto': 'Марс и Плутон — огромная сила и риск силового конфликта: направьте её в дело или спорт, а не в борьбу с людьми.',
  'jupiter|sun': 'Солнце и Юпитер — удача, признание, щедрость: хороший момент проявиться.',
  'mercury|uranus': 'Меркурий и Уран — внезапные новости, озарения и резкие слова: записывайте идеи, перечитывайте сообщения.',
  'moon|pluto': 'Луна и Плутон — сильные и глубокие эмоции: не решайте на их пике.',
  'saturn|venus': 'Венера и Сатурн — чувства и деньги проверяются на серьёзность: что настоящее, то укрепится.',
  'mars|venus': 'Венера и Марс вместе — притяжение и страсть, но и вспыльчивость в любви.',
  'jupiter|neptune': 'Юпитер и Нептун — вдохновение и щедрость: мечтайте, но не раздавайте лишнего и не верьте обещаниям вслепую.',
  'pluto|saturn': 'Сатурн и Плутон — тяжёлая, но мощная перестройка: то, что выстоит сейчас, выстоит всегда.',
  'saturn|uranus': 'Сатурн и Уран — старое против нового: найдите форму для перемен, и они станут прочными.',
  'jupiter|uranus': 'Юпитер и Уран — неожиданная удача и прорыв: будьте готовы сказать «да» внезапному шансу.',
  'jupiter|venus': 'Венера и Юпитер — два благодетеля на одной точке: щедрый, приятный момент для любви и денег.',
  'mars|saturn': 'Марс и Сатурн — газ и тормоз одновременно: раздражение от задержек; выручает терпеливое упорство.',
  'moon|saturn': 'Луна и Сатурн — грусть или чувство одиночества на пару часов: это пройдёт, не делайте выводов.',
  'mercury|saturn': 'Меркурий и Сатурн — серьёзные разговоры и документы: медленно, но основательно.',
  'neptune|pluto': 'Нептун и Плутон — глубинные, почти незаметные перемены мировоззрения.',
};

/** тексты для портрета: управители и диспозиторы натальной карты */
export function rulershipPortrait(c: Chart, who: 'me' | 'dima'): string[] {
  const { final, chains, receptions } = dispositors(c);
  const ascRuler = rulerOf(c.points.asc.sign);
  const lines: string[] = [];
  lines.push(`Управитель карты — ${PL_NOM[ascRuler]} (Асцендент в ${SIGN_PREP[c.points.asc.sign]}), стоит в ${c.points[ascRuler].house}-м доме: главная сцена жизни — ${HOUSE_WORD[c.points[ascRuler].house - 1]}.`);
  if (final) lines.push(`Финальный диспозитор — ${PL_NOM[final]} ${DIGN_RU[dignity(final, c.points[final].sign)] || ''}: все цепочки управителей сходятся к ${final === 'venus' || final === 'moon' ? 'ней' : 'нему'}. ${FINAL_TEXT[final] ?? ''}`);
  else lines.push('Единого финального диспозитора нет — несколько центров силы, жизнь держится на разных опорах.');
  const sample = (['sun', 'moon', 'mars', 'saturn'] as PointId[]).map(p => chains[p].map(x => PL_NOM[x]).join(' → ')).join('; ');
  lines.push(`Цепочки управителей: ${sample}.`);
  if (receptions.length) lines.push(`Взаимная рецепция: ${receptions.map(([a, b]) => `${PL_NOM[a]} и ${PL_NOM[b]}`).join(', ')} — эти планеты помогают друг другу.`);
  const ruledText = (['venus', 'mercury', 'sun', 'mars', 'moon', 'jupiter', 'saturn'] as PointId[]).map(p => { const hs = ruledHouses(c, p); return hs.length ? `${PL_NOM[p]} — ${hs.join(', ')}` : ''; }).filter(Boolean).join('; ');
  lines.push(`Кто каким домом управляет: ${ruledText}. Транзит к планете отзывается во всех её домах.`);
  void who; void norm;
  return lines;
}
const FINAL_TEXT: Partial<Record<PointId, string>> = {
  venus: 'Вкус, ценности, любовь и чувство красоты — внутренний «начальник» всей карты: решения в итоге принимаются через «нравится — не нравится» и «ценно — не ценно».',
  jupiter: 'Вера, смысл и щедрость — внутренний центр карты: всё в итоге подчиняется поиску смысла и роста. Совпадает с атмакаракой — Юпитером.',
  mars: 'Воля и действие — внутренний центр карты.', mercury: 'Ум и слово — внутренний центр карты.', saturn: 'Ответственность и структура — внутренний центр карты.',
  sun: 'Воля и самовыражение — внутренний центр карты.', moon: 'Чувства и забота — внутренний центр карты.',
};

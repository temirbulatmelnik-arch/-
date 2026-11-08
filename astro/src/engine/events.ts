// «Даты»: события на 36 месяцев вперёд для обоих — лунации, затмения, ретроградность с тенями, точные транзиты
// Юпитера–Плутона (все проходы), прогрессии, солнечные дуги, смены даш, дни рождения и соляры.
import * as A from 'astronomy-engine';
import { diff, lonOf, norm, type PointId, sep, signOf } from './core';
import { ASPECT, type AspectId } from './aspects';
import { natal, type Chart, ME, DIMA } from './chart';
import { houseOf } from './houses';
import { actionWindow, crossings } from './transits';
import { progressedDate, solarArc, solarReturn } from './progress';
import { vimshottari } from './vedic';

const DAY = 864e5;
export type Who = 'me' | 'dima' | 'pair';
export type EventKind = 'lunation' | 'eclipse' | 'retro' | 'transit' | 'progression' | 'arc' | 'dasha' | 'birthday';

export interface AstroEvent {
  id: string;
  t: number; // главный момент
  kind: EventKind;
  who: Who;
  title: string; // «Плутон □ моё Солнце»
  glyphs: string; // «♇□☉»
  window?: [number, number];
  passes?: number[];
  passIndex?: number; // номер прохода в истории (1, 2, 3)
  important: boolean;
  weight: number; // сила для сортировки и полосы
  key: string; // ключ для толкования: kind:planet:aspect:point
  meta: Record<string, string | number | boolean | undefined>;
}

const TR_PLANETS: PointId[] = ['jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
const TARGETS: PointId[] = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'chiron', 'asc', 'mc', 'node'];
const MAJOR: AspectId[] = ['conj', 'sext', 'square', 'trine', 'opp'];
const PERSONAL = new Set<PointId>(['sun', 'moon', 'mercury', 'venus', 'mars', 'asc', 'mc', 'node']);

/** общий поиск: моменты, когда f(t) (разность углов) проходит через 0 */
function roots(f: (t: number) => number, from: number, to: number, step: number): number[] {
  const out: number[] = [];
  let a = from, fa = f(a);
  for (let b = from + step; b <= to; b += step) {
    const fb = f(b);
    if (Math.sign(fa) !== Math.sign(fb) && Math.abs(fa - fb) < 90) {
      let lo = a, hi = b, flo = fa;
      for (let k = 0; k < 50 && hi - lo > 60e3; k++) {
        const m = (lo + hi) / 2, fm = f(m);
        if (Math.sign(fm) === Math.sign(flo)) { lo = m; flo = fm; } else hi = m;
      }
      out.push((lo + hi) / 2);
    }
    a = b; fa = fb;
  }
  return out;
}

function eclipseContacts(lon: number, charts: Chart[]) {
  const out: { who: 'me' | 'dima'; point: PointId; aspect: AspectId; orb: number }[] = [];
  for (const c of charts) {
    for (const p of ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'node', 'asc', 'mc', 'chiron'] as PointId[]) {
      const s = sep(lon, c.points[p].lon);
      for (const a of ['conj', 'opp', 'square'] as AspectId[]) {
        const orb = Math.abs(s - ASPECT[a].angle);
        if (orb <= 3) out.push({ who: c.person!.id, point: p, aspect: a, orb });
      }
    }
  }
  return out.sort((a, b) => a.orb - b.orb);
}

export function buildEvents(fromMs: number, months = 36): AstroEvent[] {
  const me = natal(ME), dima = natal(DIMA);
  const charts = [me, dima];
  const to = fromMs + months * 30.44 * DAY;
  const ev: AstroEvent[] = [];
  const push = (e: Omit<AstroEvent, 'id'>) => ev.push({ ...e, id: `${e.key}@${Math.round(e.t / 6e4)}` });

  // ── затмения ──
  const eclipseTimes: number[] = [];
  for (let s = A.SearchGlobalSolarEclipse(new Date(fromMs - 20 * DAY)); s.peak.date.getTime() < to; s = A.NextGlobalSolarEclipse(s.peak)) {
    const t = s.peak.date.getTime();
    if (t < fromMs - DAY) continue;
    eclipseTimes.push(t);
    const lon = lonOf('sun', s.peak.date);
    const contacts = eclipseContacts(lon, charts);
    const kindRu = ({ total: 'полное', annular: 'кольцеобразное', partial: 'частное', hybrid: 'гибридное' } as Record<string, string>)[s.kind] ?? '';
    push({ t, kind: 'eclipse', who: contacts.some(c => c.who === 'me') && contacts.some(c => c.who === 'dima') ? 'pair' : contacts[0]?.who ?? 'pair', title: `Солнечное затмение, ${kindRu}`, glyphs: '☉☊', important: true, weight: 3 + contacts.length * 0.3, key: 'eclipse:solar', meta: { lon, kindRu, contacts: JSON.stringify(contacts), houseMe: houseOf(lon, me.houses.cusps), houseDima: houseOf(lon, dima.houses.cusps) } });
  }
  for (let l = A.SearchLunarEclipse(new Date(fromMs - 20 * DAY)); l.peak.date.getTime() < to; l = A.NextLunarEclipse(l.peak)) {
    const t = l.peak.date.getTime();
    if (t < fromMs - DAY) continue;
    eclipseTimes.push(t);
    const lon = lonOf('moon', l.peak.date);
    const contacts = eclipseContacts(lon, charts);
    const kindRu = ({ total: 'полное', partial: 'частное', penumbral: 'полутеневое' } as Record<string, string>)[l.kind] ?? '';
    push({ t, kind: 'eclipse', who: contacts.some(c => c.who === 'me') && contacts.some(c => c.who === 'dima') ? 'pair' : contacts[0]?.who ?? 'pair', title: `Лунное затмение, ${kindRu}`, glyphs: '☽☊', important: l.kind !== 'penumbral' || contacts.length > 0, weight: 2.5 + contacts.length * 0.3, key: 'eclipse:lunar', meta: { lon, kindRu, contacts: JSON.stringify(contacts), houseMe: houseOf(lon, me.houses.cusps), houseDima: houseOf(lon, dima.houses.cusps) } });
  }

  // ── новолуния и полнолуния ──
  for (const [phase, name] of [[0, 'Новолуние'], [180, 'Полнолуние']] as const) {
    let t = A.SearchMoonPhase(phase, new Date(fromMs), 40);
    while (t && t.date.getTime() < to) {
      const ms = t.date.getTime();
      if (!eclipseTimes.some(e => Math.abs(e - ms) < DAY)) {
        const lon = lonOf('moon', t.date);
        push({ t: ms, kind: 'lunation', who: 'pair', title: `${name} в ${signPrep(lon)}`, glyphs: phase === 0 ? '●' : '○', important: false, weight: 1, key: `lunation:${phase}`, meta: { lon, phase, houseMe: houseOf(lon, me.houses.cusps), houseDima: houseOf(lon, dima.houses.cusps) } });
      }
      t = A.SearchMoonPhase(phase, new Date(ms + 20 * DAY), 40);
    }
  }

  // ── ретроградность Меркурия, Венеры, Марса с тенями ──
  for (const id of ['mercury', 'venus', 'mars'] as PointId[]) {
    const sp = (t: number) => diff(lonOf(id, new Date(t - DAY / 2)), lonOf(id, new Date(t + DAY / 2)));
    const st = roots(sp, fromMs - 120 * DAY, to, DAY);
    for (let i = 0; i < st.length - 1; i++) {
      const tR = st[i], tD = st[i + 1];
      if (sp(tR + DAY) >= 0) continue; // нужна пара: станция R → станция D
      const LR = lonOf(id, new Date(tR)), LD = lonOf(id, new Date(tD));
      const pre = crossings(id, LD, tR - 120 * DAY, tR, 1).pop() ?? tR;
      const post = crossings(id, LR, tD, tD + 150 * DAY, 1)[0] ?? tD;
      if (post < fromMs) continue;
      const imp = id !== 'mercury';
      push({ t: tR, kind: 'retro', who: 'pair', title: `${PL_NOM[id]} ${id === 'venus' ? 'ретроградная' : 'ретроградный'}`, glyphs: `${GL[id]}℞`, window: [tR, tD], important: imp || true, weight: id === 'mercury' ? 1.6 : 2.2, key: `retro:${id}`, meta: { planet: id, pre, post, tD, LR, LD, houseMe: houseOf(LR, me.houses.cusps), houseDima: houseOf(LR, dima.houses.cusps) } });
    }
  }

  // ── точные транзиты Юпитера–Плутона (все проходы, одна история) ──
  for (const c of charts) {
    for (const tp of TR_PLANETS) {
      for (const n of TARGETS) {
        for (const a of MAJOR) {
          const pts = a === 'conj' || a === 'opp' ? [norm(c.points[n].lon + ASPECT[a].angle)] : [norm(c.points[n].lon + ASPECT[a].angle), norm(c.points[n].lon - ASPECT[a].angle)];
          for (const p of pts) {
            const hits = crossings(tp, p, fromMs - 400 * DAY, to + 200 * DAY, 1);
            if (!hits.length) continue;
            // истории
            const groups: number[][] = [];
            for (const h of hits) { const g = groups[groups.length - 1]; if (g && h - g[g.length - 1] < 330 * DAY) g.push(h); else groups.push([h]); }
            for (const g of groups) {
              if (g[g.length - 1] < fromMs || g[0] > to) continue;
              const orb = tp === 'jupiter' ? 1.2 : 1;
              const win = actionWindow(tp, p, orb, g, g[0]);
              const w = (PLW[tp] ?? 1) * (PERSONAL.has(n) ? 1.4 : 0.8) * (a === 'conj' ? 1.3 : a === 'opp' || a === 'square' ? 1.15 : 0.9);
              g.forEach((h, i) => {
                if (h < fromMs - DAY || h > to) return;
                push({ t: h, kind: 'transit', who: c.person!.id, title: `${PL_NOM[tp]} ${ASPECT[a].glyph} ${pointRu(n, c.person!.id)}`, glyphs: `${GL[tp]}${ASPECT[a].glyph}${GL[n]}`, window: win, passes: g, passIndex: i + 1, important: w >= 2.3 || (PERSONAL.has(n) && a !== 'sext' && a !== 'trine' && tp !== 'jupiter') || (tp === 'jupiter' && (a === 'conj') && PERSONAL.has(n)), weight: w, key: `transit:${tp}:${a}:${n}`, meta: { tp, a, n, retro: diff(lonOf(tp, new Date(h - DAY)), lonOf(tp, new Date(h + DAY))) < 0, house: houseOf(lonOf(tp, new Date(h)), c.houses.cusps) } });
              });
            }
          }
        }
      }
    }
  }

  // ── станции медленных планет на натальных точках (стоит на точке — работает как точный аспект) ──
  for (const tp of ['mars', ...TR_PLANETS] as PointId[]) {
    const sp = (t: number) => diff(lonOf(tp, new Date(t - DAY / 2)), lonOf(tp, new Date(t + DAY / 2)));
    for (const ts of roots(sp, fromMs, to, tp === 'mars' ? DAY : 2 * DAY)) {
      const L = lonOf(tp, new Date(ts));
      const turnsRetro = sp(ts + 2 * DAY) < 0;
      for (const c of charts) {
        for (const n of TARGETS) {
          for (const a of MAJOR) {
            const orb = Math.abs(sep(L, c.points[n].lon) - ASPECT[a].angle);
            if (orb > (tp === 'mars' ? 1 : 1.2)) continue;
            push({ t: ts, kind: 'transit', who: c.person!.id, title: `${PL_NOM[tp]} стационарен ${ASPECT[a].glyph} ${pointRu(n, c.person!.id)}`, glyphs: `${GL[tp]}${turnsRetro ? '℞' : 'D'}${ASPECT[a].glyph}${GL[n]}`, window: [ts - (tp === 'mars' ? 10 : 30) * DAY, ts + (tp === 'mars' ? 10 : 30) * DAY], important: PERSONAL.has(n) || n === 'saturn', weight: (PLW[tp] ?? 1.1) * 1.2, key: `station:${tp}:${a}:${n}`, meta: { tp, a, n, orb, turnsRetro, station: true } });
          }
        }
      }
    }
  }

  // ── подход высших планет к углам: вход в орбис 2° соединения/оппозиции ──
  for (const c of charts) {
    for (const tp of ['uranus', 'neptune', 'pluto'] as PointId[]) {
      for (const n of ['asc', 'mc'] as PointId[]) {
        for (const a of ['conj', 'opp'] as AspectId[]) {
          const p = norm(c.points[n].lon + ASPECT[a].angle);
          for (const edge of [norm(p - 2), norm(p + 2)]) {
            for (const h of crossings(tp, edge, fromMs, to, 2)) {
              // только вход (к точке ближе после, чем до)
              if (sep(lonOf(tp, new Date(h + 20 * DAY)), p) >= sep(lonOf(tp, new Date(h - 20 * DAY)), p)) continue;
              const angleName = a === 'opp' ? (n === 'asc' ? 'Десцендент' : 'IC') : n === 'asc' ? 'Асцендент' : 'MC';
              push({ t: h, kind: 'transit', who: c.person!.id, title: `${PL_NOM[tp]} подходит к ${c.person!.id === 'me' ? 'моему' : 'его'} ${angleName === 'MC' || angleName === 'IC' ? angleName : angleName.replace(/т$/, 'ту')}`, glyphs: `${GL[tp]}→${a === 'opp' ? (n === 'asc' ? 'Dsc' : 'IC') : GL[n]}`, window: [h, h + 3 * 365 * DAY], important: true, weight: 2.6, key: `approach:${tp}:${a}:${n}`, meta: { tp, a, n, approach: true } });
            }
          }
        }
      }
    }
  }

  // ── прогрессии ──
  for (const c of charts) {
    const p = c.person!;
    const pl = (id: PointId) => (t: number) => lonOf(id, progressedDate(p, new Date(t)));
    // смены знаков прогрессивной Луны
    for (let s = 0; s < 12; s++) {
      for (const h of roots(t => diff(s * 30, pl('moon')(t)), fromMs, to, 20 * DAY)) {
        push({ t: h, kind: 'progression', who: p.id, title: `Прогр. Луна входит в ${SIGNS_ACC[s]}`, glyphs: `☽→${SG[s]}`, important: true, weight: 2, key: `prog:moonsign:${s}`, meta: { sign: s, house: houseOf(s * 30, c.houses.cusps), person: p.id } });
      }
    }
    // прогр. Луна, Солнце, Венера к натальным точкам
    for (const pid of ['moon', 'sun', 'venus'] as PointId[]) {
      const asp: AspectId[] = pid === 'moon' ? ['conj', 'opp', 'square'] : MAJOR;
      const tg: PointId[] = pid === 'moon' ? ['asc', 'mc', 'sun', 'venus', 'mars', 'jupiter', 'saturn', 'node'] : ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'asc', 'mc', 'node'];
      for (const n of tg) {
        if (n === pid) continue;
        for (const a of asp) {
          for (const sgn of a === 'conj' || a === 'opp' ? [1] : [1, -1]) {
            const target = norm(c.points[n].lon + sgn * ASPECT[a].angle);
            for (const h of roots(t => diff(target, pl(pid)(t)), fromMs, to, pid === 'moon' ? 15 * DAY : 30 * DAY)) {
              const dscNote = n === 'asc' && a === 'opp';
              push({ t: h, kind: 'progression', who: p.id, title: `Прогр. ${PL_NOM[pid]} ${dscNote ? '☌ Десцендент' : ASPECT[a].glyph + ' ' + pointRu(n, p.id, true)}`, glyphs: `p${GL[pid]}${ASPECT[a].glyph}${GL[n]}`, window: [h - (pid === 'moon' ? 30 : 365) * DAY, h + (pid === 'moon' ? 30 : 365) * DAY], important: pid !== 'moon' || n === 'asc' || n === 'mc' || a === 'conj', weight: pid === 'moon' ? 1.6 : 2.4, key: `prog:${pid}:${a}:${n}`, meta: { pid, a, n } });
            }
          }
        }
      }
    }
    // солнечные дуги: направленные точки к углам и светилам
    const arc = (t: number) => solarArc(p, new Date(t));
    const dirPts: PointId[] = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'asc', 'mc'];
    const tgPts: PointId[] = ['asc', 'mc', 'sun', 'moon'];
    for (const dp of dirPts) {
      for (const n of tgPts) {
        if (dp === n) continue;
        for (const a of ['conj', 'opp', 'square'] as AspectId[]) {
          for (const sgn of a === 'square' ? [1, -1] : [1]) {
            const target = norm(c.points[n].lon + sgn * ASPECT[a].angle);
            for (const h of roots(t => diff(target, norm(c.points[dp].lon + arc(t))), fromMs, to, 30 * DAY)) {
              push({ t: h, kind: 'arc', who: p.id, title: `Солн. дуга: ${PL_NOM[dp]} ${ASPECT[a].glyph} ${pointRu(n, p.id, true)}`, glyphs: `d${GL[dp]}${ASPECT[a].glyph}${GL[n]}`, window: [h - 180 * DAY, h + 180 * DAY], important: a === 'conj' || n === 'asc' || n === 'mc', weight: 2.2, key: `arc:${dp}:${a}:${n}`, meta: { dp, a, n } });
            }
          }
        }
      }
    }
    // даши
    for (const md of vimshottari(c)) {
      if (md.start.getTime() >= fromMs && md.start.getTime() < to) push({ t: md.start.getTime(), kind: 'dasha', who: p.id, title: `Махадаша ${GEN_V[md.lord]} начинается`, glyphs: 'ॐ', important: true, weight: 3, key: `dasha:md:${md.lord}`, meta: { lord: md.lord, end: md.end.getTime() } });
      for (const ad of md.sub) {
        if (ad.start.getTime() >= fromMs && ad.start.getTime() < to) push({ t: ad.start.getTime(), kind: 'dasha', who: p.id, title: `Антардаша: ${NOM_V[md.lord]} — ${NOM_V[ad.lord]}`, glyphs: 'ॐ', window: [ad.start.getTime(), ad.end.getTime()], important: false, weight: 1.6, key: `dasha:ad:${ad.lord}`, meta: { md: md.lord, lord: ad.lord, end: ad.end.getTime() } });
      }
    }
    // дни рождения и соляры
    const b = new Date(fromMs).getUTCFullYear();
    for (let y = b; y <= b + 4; y++) {
      const sr = solarReturn(p, y);
      const t = sr.date.getTime();
      if (t < fromMs || t > to) continue;
      push({ t, kind: 'birthday', who: p.id, title: p.id === 'me' ? `Мой соляр ${y}` : `Соляр ${p.nameGen} ${y}`, glyphs: '☉↺', important: true, weight: 2.5, key: 'birthday', meta: { year: y, asc: sr.chart.houses.asc, ascSign: signOf(sr.chart.houses.asc), moonH: sr.chart.points.moon.house, jupH: sr.chart.points.jupiter.house, sunH: sr.chart.points.sun.house, age: y - p.birthUTC.getUTCFullYear(), person: p.id } });
    }
  }
  return ev.sort((a, b) => a.t - b.t);
}

export const GL: Record<string, string> = { sun: '☉', moon: '☽', mercury: '☿', venus: '♀', mars: '♂', jupiter: '♃', saturn: '♄', uranus: '♅', neptune: '♆', pluto: '♇', node: '☊', snode: '☋', chiron: '⚷', lilith: '⚸', asc: 'Asc', mc: 'MC', dsc: 'Dsc', ic: 'IC', vertex: 'Vx', fortune: '⊗', spirit: 'Дух' };
export const PL_NOM: Record<string, string> = { sun: 'Солнце', moon: 'Луна', mercury: 'Меркурий', venus: 'Венера', mars: 'Марс', jupiter: 'Юпитер', saturn: 'Сатурн', uranus: 'Уран', neptune: 'Нептун', pluto: 'Плутон', chiron: 'Хирон', node: 'Сев. узел', snode: 'Юж. узел', lilith: 'Лилит', asc: 'Асцендент', mc: 'MC', dsc: 'Десцендент', ic: 'IC', vertex: 'Вертекс', fortune: 'Парс Фортуны', spirit: 'Парс Духа' };
const NOM_V: Record<string, string> = { sun: 'Солнце', moon: 'Луна', mars: 'Марс', mercury: 'Меркурий', jupiter: 'Юпитер', venus: 'Венера', saturn: 'Сатурн', rahu: 'Раху', ketu: 'Кету' };
const GEN_V: Record<string, string> = { sun: 'Солнца', moon: 'Луны', mars: 'Марса', mercury: 'Меркурия', jupiter: 'Юпитера', venus: 'Венеры', saturn: 'Сатурна', rahu: 'Раху', ketu: 'Кету' };
const PLW: Partial<Record<PointId, number>> = { jupiter: 1.3, saturn: 1.8, uranus: 1.7, neptune: 1.6, pluto: 1.9 };
const SG = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];
const SIGNS_ACC = ['Овна', 'Тельца', 'Близнецы', 'Рак', 'Льва', 'Деву', 'Весы', 'Скорпиона', 'Стрельца', 'Козерога', 'Водолея', 'Рыбы'];
const SIGNS_PREP = ['Овне', 'Тельце', 'Близнецах', 'Раке', 'Льве', 'Деве', 'Весах', 'Скорпионе', 'Стрельце', 'Козероге', 'Водолее', 'Рыбах'];
const signPrep = (lon: number) => SIGNS_PREP[signOf(lon)];

const MY: Record<string, string> = { sun: 'моё Солнце', moon: 'моя Луна', mercury: 'мой Меркурий', venus: 'моя Венера', mars: 'мой Марс', jupiter: 'мой Юпитер', saturn: 'мой Сатурн', uranus: 'мой Уран', neptune: 'мой Нептун', pluto: 'мой Плутон', chiron: 'мой Хирон', node: 'мой Сев. узел', asc: 'мой Асц', mc: 'мой MC', lilith: 'моя Лилит', vertex: 'мой Вертекс', fortune: 'мой Парс Фортуны', spirit: 'мой Парс Духа', snode: 'мой Юж. узел', dsc: 'мой Десцендент', ic: 'мой IC' };
const HIS: Record<string, string> = { sun: 'его Солнце', moon: 'его Луна', mercury: 'его Меркурий', venus: 'его Венера', mars: 'его Марс', jupiter: 'его Юпитер', saturn: 'его Сатурн', uranus: 'его Уран', neptune: 'его Нептун', pluto: 'его Плутон', chiron: 'его Хирон', node: 'его Сев. узел', asc: 'его Асц', mc: 'его MC', lilith: 'его Лилит', vertex: 'его Вертекс', fortune: 'его Парс Фортуны', spirit: 'его Парс Духа', snode: 'его Юж. узел', dsc: 'его Десцендент', ic: 'его IC' };
const NAT: Record<string, string> = { sun: 'натальное Солнце', moon: 'натальная Луна', mercury: 'натальный Меркурий', venus: 'натальная Венера', mars: 'натальный Марс', jupiter: 'натальный Юпитер', saturn: 'натальный Сатурн', uranus: 'натальный Уран', neptune: 'натальный Нептун', pluto: 'натальный Плутон', node: 'натальный узел', asc: 'Асцендент', mc: 'MC', chiron: 'натальный Хирон' };
export function pointRu(n: string, who: 'me' | 'dima', natalWord = false): string {
  if (natalWord) return NAT[n] ?? PL_NOM[n];
  return (who === 'me' ? MY : HIS)[n] ?? PL_NOM[n];
}

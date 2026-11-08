// Луна дня: знак, фаза, лунный день (от восходов Луны в Петербурге), смена знака, «Луна без курса».
import * as A from 'astronomy-engine';
import { diff, lonOf, norm, PLANETS, type PointId, sep, signOf } from './core';
import { SPB } from './chart';
import { crossings } from './transits';

const DAY = 864e5;
const OBS = new A.Observer(SPB.lat, SPB.lon, 0);

export interface MoonInfo {
  lon: number; sign: number; phaseAngle: number; illum: number; phaseName: string; phaseEmoji: string; waxing: boolean;
  lunarDay: number; lunarDayStart: number; nextLunarDay: number | null;
  ingress: number; nextSign: number;
  voc: { start: number; end: number } | null; // ближайший или текущий период без курса
  vocNow: boolean;
  lastAspect?: { planet: PointId; aspect: string; t: number };
  newMoon: number; fullMoon: number;
}

const PHASES: [number, string, string][] = [
  [0, 'Новолуние', '🌑'], [45, 'Молодая Луна', '🌒'], [90, 'Первая четверть', '🌓'], [135, 'Растущая Луна', '🌔'],
  [180, 'Полнолуние', '🌕'], [225, 'Убывающая Луна', '🌖'], [270, 'Последняя четверть', '🌗'], [315, 'Старая Луна', '🌘'],
];

function moonIngress(t: number): number {
  const L = lonOf('moon', new Date(t));
  const target = (signOf(L) + 1) * 30;
  let lo = t, hi = t + 3 * DAY;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    const d = diff(L, lonOf('moon', new Date(mid)));
    if (d < norm(target - L)) lo = mid; else hi = mid;
  }
  return hi;
}

/** точные птолемеевы аспекты Луны к планетам в интервале */
function moonAspects(from: number, to: number): { t: number; planet: PointId; aspect: string }[] {
  const out: { t: number; planet: PointId; aspect: string }[] = [];
  const angles: [number, string][] = [[0, '☌'], [60, '⚹'], [90, '□'], [120, '△'], [180, '☍']];
  const step = 2 * 3600e3;
  for (const p of PLANETS) {
    if (p === 'moon') continue;
    const f = (t: number, ang: number, sgn: number) => diff(norm(lonOf(p, new Date(t)) + sgn * ang), lonOf('moon', new Date(t)));
    for (const [ang, g] of angles) {
      for (const sgn of ang === 0 || ang === 180 ? [1] : [1, -1]) {
        let a = from, fa = f(a, ang, sgn);
        for (let b = from + step; b <= to + step; b += step) {
          const fb = f(b, ang, sgn);
          if (Math.sign(fa) !== Math.sign(fb) && Math.abs(fa - fb) < 90) {
            let lo = a, hi = b, flo = fa;
            for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2, fm = f(m, ang, sgn); if (Math.sign(fm) === Math.sign(flo)) { lo = m; flo = fm; } else hi = m; }
            const x = (lo + hi) / 2;
            if (x >= from && x <= to) out.push({ t: x, planet: p, aspect: g });
          }
          a = b; fa = fb;
        }
      }
    }
  }
  return out.sort((x, y) => x.t - y.t);
}

export function moonInfo(d: Date): MoonInfo {
  const t = d.getTime();
  const lon = lonOf('moon', d);
  const sun = lonOf('sun', d);
  const phaseAngle = norm(lon - sun);
  const illum = (1 - Math.cos((phaseAngle * Math.PI) / 180)) / 2;
  let ph = PHASES[0];
  for (const p of PHASES) if (sep(phaseAngle, p[0]) <= 22.5) ph = p;
  const nm = A.SearchMoonPhase(0, new Date(t - 31 * DAY), 31)!;
  let newMoon = nm.date.getTime();
  const nm2 = A.SearchMoonPhase(0, new Date(newMoon + DAY), 31)!;
  if (nm2.date.getTime() <= t) newMoon = nm2.date.getTime();
  const fullMoon = A.SearchMoonPhase(180, new Date(t - 15 * DAY), 31)!.date.getTime();
  // лунные дни: 1-й — от новолуния до первого восхода Луны, далее — от восхода до восхода
  let lunarDay = 1, lunarDayStart = newMoon, nextLunarDay: number | null = null;
  let from = newMoon;
  for (let k = 0; k < 32; k++) {
    const r = A.SearchRiseSet(A.Body.Moon, OBS, +1, new Date(from), 2);
    if (!r) break;
    const rt = r.date.getTime();
    if (rt > t) { nextLunarDay = rt; break; }
    lunarDay += 1; lunarDayStart = rt; from = rt + 3600e3;
  }
  const ingress = moonIngress(t);
  // без курса: от последнего точного аспекта Луны до выхода из знака
  const signStart = crossings('moon', signOf(lon) * 30, t - 3 * DAY, t, 1 / 24).filter(x => x <= t).pop() ?? t - 2.5 * DAY;
  const asp = moonAspects(signStart, ingress);
  const last = asp[asp.length - 1];
  const vocStart = last ? last.t : signStart;
  let voc: MoonInfo['voc'] = { start: vocStart, end: ingress };
  let vocNow = t >= vocStart && t < ingress;
  if (!vocNow && ingress - vocStart > 2.6 * DAY) voc = null;
  return { lon, sign: signOf(lon), phaseAngle, illum, phaseName: ph[1], phaseEmoji: ph[2], waxing: phaseAngle < 180, lunarDay, lunarDayStart, nextLunarDay, ingress, nextSign: (signOf(lon) + 1) % 12, voc, vocNow, lastAspect: last, newMoon, fullMoon };
}

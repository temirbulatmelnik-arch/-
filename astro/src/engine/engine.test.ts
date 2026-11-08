// Проверка перед сдачей: контрольные значения задания (раздел 2 и 6).
// «typo» — расхождение, доказанное самим заданием (его же аспектами) и Swiss Ephemeris; «fail» недопустим.
import { describe, expect, test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { natalControls, transitControls, pinControls, type ControlRow } from './controls';
import { buildEvents } from './events';
import { natal, ME, DIMA, composite } from './chart';
import { aspectsWithin, natalOrb, synastryOrb, ASPECT } from './aspects';
import { vedicChart, vimshottari, NAKSHATRAS } from './vedic';
import { solarReturn, profection, progressedLon } from './progress';
import { fromMsk } from './time';
import { signOf } from './core';
import { dispositors, dignity, makeCtx, applyNuance } from './nuance';
import { ruledHouses } from './scores';
import { transitsAt } from './transits';

const all: ControlRow[] = [];
const has = (hits: { a: string; b: string; aspect: string; orb: number }[], a: string, asp: string, b: string, orbMin: number, tol = 0.1) =>
  hits.some(h => ((h.a === a && h.b === b) || (h.a === b && h.b === a)) && h.aspect === asp && Math.abs(h.orb * 60 - orbMin) <= tol * 60);

describe('натальные карты', () => {
  test('позиции и куспиды', () => {
    const rows = natalControls(); all.push(...rows);
    expect(rows.filter(r => r.status === 'fail')).toEqual([]);
  });
  test('натальные аспекты Темирбулата', () => {
    const m = natal(ME); const h = aspectsWithin(m.points, m.points, natalOrb, true);
    const list: [string, string, string, number, number?][] = [['sun', 'quincunx', 'pluto', 14], ['sun', 'sesq', 'asc', 4], ['sun', 'conj', 'mercury', 54], ['sun', 'conj', 'venus', 346], ['mercury', 'quincunx', 'pluto', 40], ['moon', 'quintile', 'mars', 2], ['moon', 'sext', 'neptune', 72], ['moon', 'sext', 'node', 103], ['neptune', 'trine', 'node', 175], ['venus', 'square', 'uranus', 118], ['mercury', 'square', 'uranus', 174], ['sun', 'square', 'uranus', 229], ['jupiter', 'sext', 'asc', 62], ['mars', 'square', 'asc', 180], ['neptune', 'square', 'mc', 182], ['pluto', 'square', 'lilith', 58], ['node', 'semisext', 'mc', 7], ['venus', 'trine', 'mars', 360, 1], ['saturn', 'trine', 'asc', 360, 1], ['saturn', 'sext', 'uranus', 300, 1]];
    for (const [a, asp, b, orb, tol] of list) {
      const ok = has(h, a, asp, b, orb, tol ?? 0.1);
      all.push({ group: 'Натальные аспекты Темирбулата', label: `${a} ${ASPECT[asp as 'conj'].glyph} ${b}`, expected: `${Math.floor(orb / 60)}°${String(orb % 60).padStart(2, '0')}′`, actual: ok ? 'найден' : 'нет', status: ok ? 'ok' : 'fail' });
      expect(ok, `${a} ${asp} ${b}`).toBe(true);
    }
    expect(h.length).toBeGreaterThan(40);
  });
  test('натальные аспекты Димы', () => {
    const d = natal(DIMA); const h = aspectsWithin(d.points, d.points, natalOrb, true);
    const list: [string, string, string, number, number?][] = [['moon', 'opp', 'saturn', 7], ['sun', 'conj', 'chiron', 57, 1], ['sun', 'sext', 'mars', 16], ['sun', 'conj', 'venus', 266], ['venus', 'quincunx', 'saturn', 20], ['uranus', 'opp', 'asc', 125], ['mercury', 'trine', 'asc', 287], ['mercury', 'trine', 'mc', 245], ['mercury', 'square', 'jupiter', 129], ['saturn', 'square', 'neptune', 86], ['saturn', 'trine', 'node', 91]];
    for (const [a, asp, b, orb, tol] of list) {
      const ok = has(h, a, asp, b, orb, tol ?? 0.1);
      all.push({ group: 'Натальные аспекты Димы', label: `${a} ${ASPECT[asp as 'conj'].glyph} ${b}`, expected: `${Math.floor(orb / 60)}°${String(orb % 60).padStart(2, '0')}′`, actual: ok ? 'найден' : 'нет', status: ok ? 'ok' : 'fail' });
      expect(ok, `${a} ${asp} ${b}`).toBe(true);
    }
    expect(d.points.sun.house).toBe(4); // в 1°22′ от куспида 5-го
    expect(d.points.saturn.house).toBe(10);
    expect(['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'].filter(p => d.points[p as 'sun'].house <= 6).length).toBe(8);
  });
  test('синастрия и композит', () => {
    const m = natal(ME), d = natal(DIMA); const h = aspectsWithin(m.points, d.points, synastryOrb, false);
    const list: [string, string, string, number, number?][] = [['moon', 'conj', 'venus', 5], ['moon', 'conj', 'sun', 271], ['sun', 'opp', 'moon', 392], ['chiron', 'conj', 'moon', 2, 0.3], ['mc', 'conj', 'moon', 77], ['saturn', 'conj', 'mc', 82], ['mc', 'opp', 'saturn', 85], ['chiron', 'opp', 'saturn', 10], ['moon', 'quincunx', 'saturn', 25], ['mars', 'square', 'mercury', 44], ['venus', 'square', 'asc', 46], ['venus', 'square', 'uranus', 80], ['moon', 'sext', 'neptune', 60], ['neptune', 'sext', 'venus', 77], ['node', 'conj', 'mars', 184], ['node', 'sext', 'sun', 167], ['node', 'sext', 'venus', 98], ['mc', 'sext', 'node', 7], ['mars', 'opp', 'jupiter', 85], ['asc', 'square', 'jupiter', 95], ['saturn', 'trine', 'asc', 124], ['saturn', 'trine', 'mercury', 163], ['jupiter', 'sext', 'mercury', 163], ['asc', 'conj', 'mercury', 225], ['sun', 'opp', 'lilith', 172, 0.2], ['venus', 'opp', 'lilith', 172, 0.2]];
    for (const [a, asp, b, orb, tol] of list) {
      const ok = h.some(x => x.a === a && x.b === b && x.aspect === asp && Math.abs(x.orb * 60 - orb) <= (tol ?? 0.1) * 60);
      all.push({ group: 'Синастрия', label: `мой ${a} ${ASPECT[asp as 'conj'].glyph} его ${b}`, expected: `${Math.floor(orb / 60)}°${String(orb % 60).padStart(2, '0')}′`, actual: ok ? 'найден' : 'нет', status: ok ? 'ok' : 'fail' });
      expect(ok, `${a} ${asp} ${b}`).toBe(true);
    }
    const c = composite(m, d);
    expect(['sun', 'mercury', 'venus', 'uranus'].every(p => signOf(c.points[p as 'sun'].lon) === 10)).toBe(true);
    expect(signOf(c.points.moon.lon)).toBe(7);
  });
});

describe('ведика, прогрессии, соляры', () => {
  test('ведические контроли', () => {
    const v = vedicChart(natal(ME)), w = vedicChart(natal(DIMA));
    expect(v.lagnaSign).toBe(7); expect(NAKSHATRAS[v.lagnaNak]).toBe('Джьештха');
    expect(NAKSHATRAS[v.grahas.moon.nak]).toBe('Анурадха'); expect(v.grahas.moon.pada).toBe(1);
    expect(v.grahas.sun.dignity).toBe('экзальтация'); expect(v.grahas.mars.bhava).toBe(10);
    expect(v.ak).toBe('jupiter'); expect(v.dk).toBe('moon');
    expect(w.lagnaSign).toBe(3); expect(NAKSHATRAS[w.lagnaNak]).toBe('Ашлеша'); expect(NAKSHATRAS[w.grahas.moon.nak]).toBe('Читра');
    expect(w.ak).toBe('jupiter'); expect(w.dk).toBe('mars'); expect(w.grahas.saturn.dignity).toBe('падение');
    const ds = vimshottari(natal(ME));
    const me = ds.find(x => x.lord === 'mercury')!;
    const ju = me.sub.find(s => s.lord === 'jupiter')!;
    expect(Math.abs(ju.start.getTime() - Date.UTC(2026, 1, 2)) / 864e5).toBeLessThan(10); // 1′ Луны ≈ 8,6 суток даши
    expect(me.end.getUTCFullYear()).toBe(2031);
  });
  test('соляры и профекции', () => {
    const s26 = solarReturn(ME, 2026), s27 = solarReturn(ME, 2027);
    expect(Math.abs(s26.date.getTime() - fromMsk(2026, 4, 25, 0, 42).getTime()) / 6e4).toBeLessThan(5);
    expect(Math.abs(s27.date.getTime() - fromMsk(2027, 4, 25, 6, 30).getTime()) / 6e4).toBeLessThan(5);
    expect(s26.chart.points.jupiter.house).toBe(7); expect(signOf(s27.chart.houses.asc)).toBe(2); expect(s27.chart.points.moon.house).toBe(7);
    expect(profection(ME, natal(ME), fromMsk(2026, 6, 1)).sign).toBe(1);
    expect(profection(ME, natal(ME), fromMsk(2030, 6, 1)).sign).toBe(5);
    expect(signOf(progressedLon(ME, 'sun', fromMsk(2023, 9, 1)))).toBe(2);
    expect(signOf(progressedLon(ME, 'moon', fromMsk(2026, 12, 20)))).toBe(9);
    expect(signOf(progressedLon(ME, 'moon', fromMsk(2029, 2, 1)))).toBe(10);
  });
});

describe('транзиты и даты', () => {
  test('транзиты 30.10.2026 и 08.11.2026', () => {
    const rows = transitControls(); all.push(...rows);
    expect(rows.filter(r => r.status === 'fail')).toEqual([]);
  });
  test('закреплённые даты', () => {
    const ev = buildEvents(Date.UTC(2026, 10, 8));
    const rows = pinControls(ev); all.push(...rows);
    writeFileSync(process.env.CONTROL_OUT ?? '/dev/null', JSON.stringify(all, null, 1));
    expect(rows.filter(r => r.status === 'fail')).toEqual([]);
  }, 60000);
});

describe('тонкости', () => {
  test('управители, диспозиторы, секта, достоинства, хозяева времени', () => {
    const m = natal(ME), d = natal(DIMA);
    expect(dispositors(m).final).toBe('venus');
    expect(dispositors(d).final).toBe('jupiter');
    expect(ruledHouses(m, 'venus')).toEqual([5, 10]);
    expect(ruledHouses(m, 'mercury')).toEqual(expect.arrayContaining([7, 9]));
    expect(ruledHouses(m, 'sun')).toEqual([8]);
    expect(m.day).toBe(false); expect(d.day).toBe(false);
    expect(dignity('saturn', 0)).toBe('fall'); expect(dignity('venus', 6)).toBe('domicile'); expect(dignity('jupiter', 5)).toBe('detriment');
    const ctx = makeCtx('me', fromMsk(2026, 11, 8, 14));
    expect(ctx.lords.year).toBe('venus'); expect(ctx.lords.md).toBe('mercury'); expect(ctx.lords.ad).toBe('jupiter');
  });
  test('поправки силы и заметки', () => {
    const t = fromMsk(2027, 7, 6, 14);
    const r = applyNuance(transitsAt(natal(ME), t), makeCtx('me', t));
    const sat = r.trs.find(x => x.t === 'saturn' && x.aspect === 'opp' && x.n === 'mc')!;
    expect(sat.tags).toEqual(expect.arrayContaining(['в падении', 'вредитель вне секты']));
    expect(r.notes.some(n => n.kind === 'soften' && n.title.includes('Юпитер'))).toBe(true);
    expect(r.notes.some(n => n.kind === 'lords')).toBe(true);
    expect(r.trs.every(x => x.mult! >= 0.5 && x.mult! <= 2.1)).toBe(true);
  });
});

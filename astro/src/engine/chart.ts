// Натальная карта: все точки, дома, знаки; люди приложения.
import { bodyPos, MOVING, norm, type PointId, signOf } from './core';
import { houseOf, placidus, type Houses } from './houses';

export interface Person {
  id: 'me' | 'dima';
  name: string;
  nameGen: string; // родительный: «Димы»
  birthUTC: Date;
  local: string; // как записано: «25.04.1997, 01:15 (UTC+4)»
  place: string;
  lat: number;
  lon: number;
}

export const ME: Person = {
  id: 'me', name: 'Темирбулат', nameGen: 'Темирбулата',
  birthUTC: new Date(Date.UTC(1997, 3, 24, 21, 15)),
  local: '25.04.1997, 01:15 (UTC+4, летнее время)', place: 'Десногорск', lat: 54.15, lon: 33.28,
};
export const DIMA: Person = {
  id: 'dima', name: 'Дима', nameGen: 'Димы',
  birthUTC: new Date(Date.UTC(1998, 10, 16, 19, 5)),
  local: '16.11.1998, 22:05 (UTC+3)', place: 'Сосновый Бор', lat: 59.9, lon: 29.09,
};
export const SPB = { lat: 59.94, lon: 30.31, name: 'Санкт-Петербург' };

export interface ChartPoint { id: PointId; lon: number; speed: number; retro: boolean; station: boolean; house: number; sign: number }
export interface Chart { person?: Person; date: Date; houses: Houses; points: Record<PointId, ChartPoint>; day: boolean }

export function makeChart(date: Date, lat: number, lon: number, person?: Person): Chart {
  const houses = placidus(date, lat, lon);
  const pts = {} as Record<PointId, ChartPoint>;
  const put = (id: PointId, l: number, speed = 0, retro = false, station = false) => {
    pts[id] = { id, lon: norm(l), speed, retro, station, house: houseOf(l, houses.cusps), sign: signOf(l) };
  };
  for (const id of MOVING) {
    const b = bodyPos(id, date);
    put(id, b.lon, b.speed, b.retro, b.station);
  }
  put('snode', pts.node.lon + 180, pts.node.speed);
  put('asc', houses.asc); put('mc', houses.mc); put('dsc', houses.asc + 180); put('ic', houses.mc + 180);
  put('vertex', houses.vertex);
  // дневная карта — Солнце над горизонтом (дома 7–12)
  const day = pts.sun.house >= 7;
  const s = pts.sun.lon, m = pts.moon.lon, a = houses.asc;
  // по ТЗ: Парс Фортуны — ночная формула Асц + Солнце − Луна, Парс Духа — Асц + Луна − Солнце
  put('fortune', day ? a + m - s : a + s - m);
  put('spirit', day ? a + s - m : a + m - s);
  return { person, date, houses, points: pts, day };
}

export const natal = (p: Person) => makeChart(p.birthUTC, p.lat, p.lon, p);

/** композит — средние точки (ближняя полуокружность), куспиды — от средних MC и широты-средней */
export function composite(a: Chart, b: Chart): Chart {
  const mid = (x: number, y: number) => {
    const d = norm(y - x);
    return d > 180 ? norm(x + (d - 360) / 2) : norm(x + d / 2);
  };
  const pts = {} as Record<PointId, ChartPoint>;
  const mc = mid(a.houses.mc, b.houses.mc);
  const asc = mid(a.houses.asc, b.houses.asc);
  // дома композита: равные от средней точки Асц — честно и без «выдуманного» места
  const cusps = Array.from({ length: 12 }, (_, i) => norm(asc + i * 30));
  for (const id of Object.keys(a.points) as PointId[]) {
    const l = id === 'mc' ? mc : id === 'ic' ? norm(mc + 180) : id === 'asc' ? asc : id === 'dsc' ? norm(asc + 180) : mid(a.points[id].lon, b.points[id].lon);
    pts[id] = { id, lon: l, speed: 0, retro: false, station: false, house: houseOf(l, cusps), sign: signOf(l) };
  }
  pts.snode = { ...pts.node, id: 'snode', lon: norm(pts.node.lon + 180), sign: signOf(pts.node.lon + 180), house: houseOf(pts.node.lon + 180, cusps) };
  return { date: a.date, houses: { ...a.houses, cusps, asc, mc }, points: pts, day: true };
}

// Ядро расчётов: положения планет и точек в тропическом зодиаке (эклиптика и равноденствие даты).
// Планеты — astronomy-engine (видимые геоцентрические положения), Хирон — оскулирующие элементы орбиты,
// узлы и Лилит — средние, по формулам Меуса.
import * as A from 'astronomy-engine';

export const DEG = Math.PI / 180;
export const norm = (x: number) => ((x % 360) + 360) % 360;
/** разность долгот b − a в диапазоне (−180, 180] */
export const diff = (a: number, b: number) => {
  const d = norm(b - a);
  return d > 180 ? d - 360 : d;
};
/** угловое расстояние 0…180 */
export const sep = (a: number, b: number) => Math.abs(diff(a, b));

export type PointId =
  | 'sun' | 'moon' | 'mercury' | 'venus' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune' | 'pluto'
  | 'node' | 'snode' | 'lilith' | 'chiron'
  | 'asc' | 'mc' | 'dsc' | 'ic' | 'vertex' | 'fortune' | 'spirit';

export const PLANETS: PointId[] = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
export const MOVING: PointId[] = [...PLANETS, 'node', 'lilith', 'chiron'];

const BODY: Partial<Record<PointId, A.Body>> = {
  sun: A.Body.Sun, moon: A.Body.Moon, mercury: A.Body.Mercury, venus: A.Body.Venus, mars: A.Body.Mars,
  jupiter: A.Body.Jupiter, saturn: A.Body.Saturn, uranus: A.Body.Uranus, neptune: A.Body.Neptune, pluto: A.Body.Pluto,
};

/** юлианские столетия TT от J2000 */
export const centuries = (d: Date) => A.MakeTime(d).tt / 36525;

/** средний наклон эклиптики + нутация (истинный наклон), градусы */
export function obliquity(d: Date): number {
  return A.e_tilt(A.MakeTime(d)).tobl;
}

/** средний восходящий узел Луны (Меус 47.7) */
export function meanNode(d: Date): number {
  const T = centuries(d);
  return norm(125.0445479 - 1934.1362891 * T + 0.0020754 * T * T + (T * T * T) / 467441 - (T * T * T * T) / 60616000 + nutLon(d));
}
/** средняя Чёрная Луна (средний апогей, Меус 47 — перигей + 180°) */
export function meanLilith(d: Date): number {
  const T = centuries(d);
  return norm(83.3532465 + 4069.0137287 * T - 0.01032 * T * T - (T * T * T) / 80053 + (T * T * T * T) / 18999000 + 180 + nutLon(d));
}
/** нутация в долготе, градусы (точки «средние», но отсчёт — от истинного равноденствия, как у планет) */
function nutLon(d: Date): number {
  return A.e_tilt(A.MakeTime(d)).dpsi / 3600;
}

// ── Хирон ───────────────────────────────────────────────────────────────────────────────────────
// Оскулирующие элементы 2060 Chiron (гелиоцентрические, эклиптика и равноденствие J2000) на 1 января
// каждого чётного года: [год, a (а.е.), e, i, Ω, ω, M]. Источник — Swiss Ephemeris (seas_18, по данным JPL).
// Между эпохами — кеплерово движение от ближайшей эпохи. Точность ≈ ±1° честно указывается в интерфейсе.
const CHIRON: number[][] = [[1988, 13.6792092, 0.3799083, 6.926732, 209.353387, 339.232309, 302.189212], [1990, 13.7218112, 0.3818999, 6.92765, 209.372461, 339.005001, 316.790691], [1992, 13.7490388, 0.384226, 6.927883, 209.387447, 339.105163, 331.056129], [1994, 13.7457484, 0.3847859, 6.927503, 209.397246, 339.340928, 345.100852], [1996, 13.7064409, 0.3832147, 6.929682, 209.385304, 339.549689, 359.132247], [1998, 13.6472364, 0.38061, 6.93696, 209.380968, 339.478307, 13.454317], [2000, 13.6051245, 0.3793455, 6.941612, 209.396696, 339.142328, 27.987094], [2002, 13.6083211, 0.380325, 6.93873, 209.362092, 339.017915, 42.356892], [2004, 13.6424582, 0.3816665, 6.935297, 209.277587, 339.299401, 56.354254], [2006, 13.6816447, 0.3818007, 6.934773, 209.221209, 339.739763, 70.215942], [2008, 13.7071007, 0.3804699, 6.934027, 209.246644, 340.022316, 84.210239], [2010, 13.7039847, 0.3787641, 6.92977, 209.337789, 339.900444, 98.66823], [2012, 13.6742533, 0.3789965, 6.926428, 209.388049, 339.497266, 113.410552], [2014, 13.6445258, 0.3812, 6.932844, 209.324335, 339.304025, 127.912141], [2016, 13.6370235, 0.382696, 6.944566, 209.233092, 339.458519, 141.951697], [2018, 13.6514896, 0.3820183, 6.950072, 209.199031, 339.715162, 155.842282], [2020, 13.6796737, 0.3793957, 6.942392, 209.232079, 339.818882, 169.889941], [2022, 13.7066304, 0.3766735, 6.925233, 209.288163, 339.629039, 184.400014], [2024, 13.7112764, 0.3766372, 6.916958, 209.307868, 339.320388, 199.165534], [2026, 13.6906486, 0.379137, 6.926972, 209.297999, 339.259243, 213.637124], [2028, 13.6641347, 0.3813873, 6.942222, 209.296713, 339.438188, 227.684152], [2030, 13.6491405, 0.3818124, 6.948375, 209.301757, 339.624971, 241.652063], [2032, 13.6561212, 0.3804717, 6.940962, 209.283308, 339.620095, 255.803602], [2034, 13.689602, 0.3788746, 6.927711, 209.233059, 339.311918, 270.388319], [2036, 13.731106, 0.3792782, 6.923552, 209.211409, 338.914323, 285.149761]];
const K = 0.01720209895; // гауссова постоянная
const OBL2000 = 23.4392911 * DEG;

/** гелиоцентрический вектор Хирона, экватор J2000 (EQJ), а.е. */
function chironHelio(d: Date): A.Vector {
  const year = d.getUTCFullYear() + d.getUTCMonth() / 12;
  let best = CHIRON[0];
  for (const el of CHIRON) if (Math.abs(el[0] - year) < Math.abs(best[0] - year)) best = el;
  const [y, a, e, i, O, w, M0] = best;
  const t = A.MakeTime(d).tt;
  const t0 = A.MakeTime(new Date(Date.UTC(y, 0, 1))).tt;
  const n = K / Math.pow(a, 1.5); // рад/сутки
  const M = M0 * DEG + n * (t - t0);
  let E = M;
  for (let k = 0; k < 30; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xv = a * (Math.cos(E) - e);
  const yv = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const v = Math.atan2(yv, xv);
  const r = Math.hypot(xv, yv);
  const ii = i * DEG, OO = O * DEG, u = v + w * DEG;
  // эклиптика J2000
  const xe = r * (Math.cos(OO) * Math.cos(u) - Math.sin(OO) * Math.sin(u) * Math.cos(ii));
  const ye = r * (Math.sin(OO) * Math.cos(u) + Math.cos(OO) * Math.sin(u) * Math.cos(ii));
  const ze = r * Math.sin(u) * Math.sin(ii);
  // → экватор J2000
  return new A.Vector(xe, ye * Math.cos(OBL2000) - ze * Math.sin(OBL2000), ye * Math.sin(OBL2000) + ze * Math.cos(OBL2000), A.MakeTime(d));
}

function chironLon(d: Date): number {
  const earth = A.HelioVector(A.Body.Earth, d);
  let lt = 0;
  let v = chironHelio(d);
  for (let k = 0; k < 2; k++) {
    const g = new A.Vector(v.x - earth.x, v.y - earth.y, v.z - earth.z, earth.t);
    lt = Math.hypot(g.x, g.y, g.z) / 173.1446; // световое время, сутки
    v = chironHelio(new Date(d.getTime() - lt * 864e5));
  }
  const g = new A.Vector(v.x - earth.x, v.y - earth.y, v.z - earth.z, earth.t);
  return norm(A.Ecliptic(g).elon);
}

/** долгота тела (тропическая, дата) */
export function lonOf(id: PointId, d: Date): number {
  switch (id) {
    case 'moon': return norm(A.EclipticGeoMoon(d).lon);
    case 'node': return meanNode(d);
    case 'snode': return norm(meanNode(d) + 180);
    case 'lilith': return meanLilith(d);
    case 'chiron': return chironLon(d);
    default: {
      const b = BODY[id];
      if (!b) throw new Error('нет тела ' + id);
      return norm(A.Ecliptic(A.GeoVector(b, d, true)).elon);
    }
  }
}

/** скорость, °/сутки — по разнице долгот ±12 ч */
export function speedOf(id: PointId, d: Date): number {
  const h = 12 * 3600e3;
  return diff(lonOf(id, new Date(d.getTime() - h)), lonOf(id, new Date(d.getTime() + h)));
}

/** наибольшая прямая суточная скорость: планета стационарна, если движется медленнее 8 % от неё */
export const MAX_SPEED: Partial<Record<PointId, number>> = {
  sun: 1.02, moon: 15.4, mercury: 2.2, venus: 1.26, mars: 0.79, jupiter: 0.24, saturn: 0.13,
  uranus: 0.062, neptune: 0.038, pluto: 0.041, chiron: 0.15, node: 0.053, lilith: 0.111,
};

export interface BodyPos { id: PointId; lon: number; speed: number; retro: boolean; station: boolean }

export function bodyPos(id: PointId, d: Date): BodyPos {
  const lon = lonOf(id, d);
  const speed = id === 'snode' ? speedOf('node', d) : speedOf(id, d);
  const max = MAX_SPEED[id === 'snode' ? 'node' : id] ?? 1;
  const isPlanet = PLANETS.includes(id) || id === 'chiron';
  return { id, lon, speed, retro: isPlanet && speed < 0, station: isPlanet && id !== 'sun' && id !== 'moon' && Math.abs(speed) < max * 0.08 };
}

export const SIGNS = ['Овен', 'Телец', 'Близнецы', 'Рак', 'Лев', 'Дева', 'Весы', 'Скорпион', 'Стрелец', 'Козерог', 'Водолей', 'Рыбы'];
export const SIGNS_GEN = ['Овна', 'Тельца', 'Близнецов', 'Рака', 'Льва', 'Девы', 'Весов', 'Скорпиона', 'Стрельца', 'Козерога', 'Водолея', 'Рыб'];
export const SIGNS_PREP = ['Овне', 'Тельце', 'Близнецах', 'Раке', 'Льве', 'Деве', 'Весах', 'Скорпионе', 'Стрельце', 'Козероге', 'Водолее', 'Рыбах'];
export const SIGN_GLYPH = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];
export const signOf = (lon: number) => Math.floor(norm(lon) / 30);

/** «4°44′ Тельца» */
export function fmtLon(lon: number, opts: { glyph?: boolean } = {}): string {
  const x = norm(lon);
  let deg = Math.floor(x % 30);
  let min = Math.round((x % 1) * 60);
  let s = signOf(x);
  if (min === 60) { min = 0; deg += 1; if (deg === 30) { deg = 0; s = (s + 1) % 12; } }
  return `${deg}°${String(min).padStart(2, '0')}′ ${opts.glyph ? SIGN_GLYPH[s] : SIGNS_GEN[s]}`;
}
export function fmtOrb(x: number): string {
  const a = Math.abs(x);
  let d = Math.floor(a), m = Math.round((a - d) * 60);
  if (m === 60) { d += 1; m = 0; }
  return `${d}°${String(m).padStart(2, '0')}′`;
}

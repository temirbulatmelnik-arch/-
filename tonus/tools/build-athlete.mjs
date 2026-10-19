// Собирает 3D-модель спортивного мужчины для «Тонуса» из открытых данных MakeHuman (CC0):
// базовая сетка + морфы тела (мужчина ~25 лет, спортивный, сухой, идеальные пропорции, V-силуэт),
// игровой скелет MPFB (53 кости) с весами, раскраска (кожа, стрижка, брови, шорты) и морф вдоха.
// Результат: public/figure/athlete.json (кости, ориентиры) и public/figure/athlete.bin (геометрия).
// Запуск: node tools/build-athlete.mjs   (файлы MakeHuman кешируются в tools/.cache)
import fs from 'node:fs';
import path from 'node:path';

const MH = 'https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/';
const MPFB = 'https://raw.githubusercontent.com/makehumancommunity/mpfb2/master/src/mpfb/data/';
const ROOT = path.dirname(new URL(import.meta.url).pathname);
const CACHE = path.join(ROOT, '.cache');
const OUT = path.join(ROOT, '..', 'public', 'figure');
const HEIGHT = 1.8; // рост модели, м

async function get(url) {
  const file = path.join(CACHE, url.replace(/^https:\/\/raw\.githubusercontent\.com\//, '').replace(/[/]/g, '__'));
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const text = await res.text();
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(file, text);
  return text;
}

// ---------- параметры тела ----------
const muscle = 0.85, weight = 0.42, height = 0.62, proportions = 1;
const races = { african: 1 / 3, asian: 1 / 3, caucasian: 1 / 3 };
const split = (v, lo, mid, hi) => (v >= 0.5 ? { [mid]: 1 - (v - 0.5) * 2, [hi]: (v - 0.5) * 2 } : { [lo]: (0.5 - v) * 2, [mid]: 1 - (0.5 - v) * 2 });
const mW = split(muscle, 'minmuscle', 'averagemuscle', 'maxmuscle');
const wW = split(weight, 'minweight', 'averageweight', 'maxweight');
const targets = [];
for (const [r, k] of Object.entries(races)) targets.push([`macrodetails/${r}-male-young.target`, k]);
for (const [m, a] of Object.entries(mW)) for (const [w, b] of Object.entries(wW)) {
  if (!a || !b) continue;
  targets.push([`macrodetails/universal-male-young-${m}-${w}.target`, a * b]);
  targets.push([`macrodetails/height/male-young-${m}-${w}-maxheight.target`, a * b * Math.max(0, (height - 0.5) * 2)]);
  targets.push([`macrodetails/proportions/male-young-${m}-${w}-idealproportions.target`, a * b * Math.max(0, (proportions - 0.5) * 2)]);
}
targets.push(['torso/torso-vshape-incr.target', 0.45]);
targets.push(['stomach/stomach-pregnant-decr.target', 0.4]);

// ---------- базовая сетка ----------
const obj = await get(MH + '3dobjs/base.obj');
const V = [];
const groups = new Map(); // имя → массив граней (индексы вершин)
let group = '';
for (const line of obj.split('\n')) {
  if (line.startsWith('v ')) { const [, x, y, z] = line.split(/\s+/); V.push([+x, +y, +z]); }
  else if (line.startsWith('g ')) { group = line.slice(2).trim(); if (!groups.has(group)) groups.set(group, []); }
  else if (line.startsWith('f ')) groups.get(group).push(line.slice(2).trim().split(/\s+/).map(t => parseInt(t, 10) - 1));
}

for (const [file, w] of targets) {
  if (w < 1e-4) continue;
  const text = await get(MH + 'targets/' + file);
  for (const line of text.split('\n')) {
    if (!line || line[0] === '#') continue;
    const [i, dx, dy, dz] = line.trim().split(/\s+/);
    const v = V[+i];
    v[0] += w * +dx; v[1] += w * +dy; v[2] += w * +dz;
  }
}

const centroid = idx => { const c = [0, 0, 0]; for (const i of idx) for (let k = 0; k < 3; k++) c[k] += V[i][k] / idx.length; return c; };
const groupVerts = name => [...new Set(groups.get(name).flat())];

// ---------- скелет ----------
const rig = JSON.parse(await get(MPFB + 'rigs/standard/rig.game_engine.json'));
const weightsFile = JSON.parse(await get(MPFB + 'rigs/standard/weights.game_engine.json'));
const endPos = e => (e.strategy === 'CUBE' ? centroid(groupVerts(e.cube_name)) : centroid(e.vertex_indices));
// порядок: родитель раньше ребёнка
const names = [];
const visit = n => { if (names.includes(n)) return; if (rig[n].parent) visit(rig[n].parent); names.push(n); };
Object.keys(rig).forEach(visit);

// ---------- тело: вершины группы body ----------
const bodyFaces = groups.get('body');
const used = [...new Set(bodyFaces.flat())].sort((a, b) => a - b);
const remap = new Map(used.map((v, i) => [v, i]));
const tris = [];
for (const f of bodyFaces) for (let k = 1; k + 1 < f.length; k++) tris.push(remap.get(f[0]), remap.get(f[k]), remap.get(f[k + 1]));

// нормировка: ступни на полу, рост HEIGHT, единицы — метры
let minY = Infinity, maxY = -Infinity;
for (const i of used) { minY = Math.min(minY, V[i][1]); maxY = Math.max(maxY, V[i][1]); }
const S = HEIGHT / (maxY - minY);
const norm = p => [p[0] * S, (p[1] - minY) * S, p[2] * S];
const pos = used.map(i => norm(V[i]));
const bones = names.map(n => ({ name: n, parent: rig[n].parent ? names.indexOf(rig[n].parent) : -1, head: norm(endPos(rig[n].head)).map(x => +x.toFixed(4)) }));
const bonePos = n => bones[names.indexOf(n)].head;

// нормали (по площади граней)
const nrm = pos.map(() => [0, 0, 0]);
for (let t = 0; t < tris.length; t += 3) {
  const [a, b, c] = [pos[tris[t]], pos[tris[t + 1]], pos[tris[t + 2]]];
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  for (const i of [tris[t], tris[t + 1], tris[t + 2]]) for (let k = 0; k < 3; k++) nrm[i][k] += n[k];
}
for (const n of nrm) { const l = Math.hypot(...n) || 1; n[0] /= l; n[1] /= l; n[2] /= l; }

// ---------- веса костей (до 4 на вершину) ----------
const infl = used.map(() => []);
for (const [bone, list] of Object.entries(weightsFile.weights)) {
  const bi = names.indexOf(bone);
  for (const [vi, w] of list) { const j = remap.get(vi); if (j !== undefined && w > 1e-4) infl[j].push([bi, w]); }
}
const skinIdx = new Uint8Array(used.length * 4), skinW = new Uint8Array(used.length * 4);
const dominant = new Array(used.length);
infl.forEach((list, i) => {
  list.sort((a, b) => b[1] - a[1]);
  const top = list.slice(0, 4);
  const sum = top.reduce((s, x) => s + x[1], 0) || 1;
  // округляем вниз, остаток отдаём самой сильной кости: сумма ровно 255
  let acc = 0;
  top.forEach(([b, w], k) => {
    skinIdx[i * 4 + k] = b;
    const q = Math.floor((w / sum) * 255);
    skinW[i * 4 + k] = q; acc += q;
  });
  if (top.length) skinW[i * 4] += 255 - acc;
  if (!top.length) { skinIdx[i * 4] = names.indexOf('pelvis'); skinW[i * 4] = 255; }
  dominant[i] = top.length ? names[top[0][0]] : 'pelvis';
});

// ---------- ориентиры ----------
const eyes = ['helper-l-eye', 'helper-r-eye'].map(g => {
  const vs = groupVerts(g).map(i => norm(V[i]));
  const c = [0, 1, 2].map(k => vs.reduce((s, v) => s + v[k], 0) / vs.length);
  const r = vs.reduce((s, v) => s + Math.hypot(v[0] - c[0], v[1] - c[1], v[2] - c[2]), 0) / vs.length;
  return { c: c.map(x => +x.toFixed(4)), r: +r.toFixed(4) };
});
// промежность: самая нижняя точка тела по середине
let crotch = null;
pos.forEach((p, i) => { if (Math.abs(p[0]) < 0.012 && ['pelvis', 'thigh_l', 'thigh_r'].includes(dominant[i]) && (!crotch || p[1] < crotch[1])) crotch = p; });
const hipY = (bonePos('thigh_l')[1] + bonePos('thigh_r')[1]) / 2;
const spine01 = bonePos('spine_01'), spine03 = bonePos('spine_03');

// ---------- раскраска ----------
const hex = h => [1, 3, 5].map(k => parseInt(h.slice(k, k + 2), 16));
const SKIN = hex('#d9a988'), HAIR = hex('#2f241d'), BROW = hex('#3a2a20'), SHORTS = hex('#2b303b'), LIPS = hex('#c27f70');
const mix = (a, b, t) => a.map((x, k) => Math.round(x + (b[k] - x) * Math.min(1, Math.max(0, t))));
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const headC = bonePos('head');
const headTop = Math.max(...pos.filter((_, i) => dominant[i] === 'head').map(p => p[1]));
const eyeMidY = (eyes[0].c[1] + eyes[1].c[1]) / 2;
const eyeR = (eyes[0].r + eyes[1].r) / 2;
const legs = ['thigh_l', 'thigh_r'];
const thighMidY = hipY - 0.42 * (hipY - bonePos('calf_l')[1]);
const waistY = spine01[1] + 0.035;

const col = pos.map((p, i) => {
  let c = SKIN;
  const d = dominant[i];
  // шорты: таз и верх бёдер, мягкие края по талии и на бёдрах
  if (d === 'pelvis' || d === 'spine_01' || legs.includes(d)) {
    const shorts = smooth(thighMidY - 0.006, thighMidY + 0.006, p[1]) * (1 - smooth(waistY - 0.006, waistY + 0.006, p[1]));
    c = mix(SKIN, SHORTS, shorts);
  }
  if (d === 'head' || d === 'neck_01') {
    const dx = p[0] - headC[0], dz = p[2] - headC[2];
    const ang = Math.atan2(Math.abs(dx), dz); // 0 — лицо, π — затылок
    // линия роста волос: высоко надо лбом, над ушами, ниже на затылке
    const line = eyeMidY + 0.055 - 0.035 * (1 - Math.cos(Math.min(Math.PI, ang) * 1.0)) - 0.02 * smooth(1.8, 3.1, ang);
    const hair = smooth(line - 0.004, line + 0.01, p[1]) * (p[1] > headTop - 0.2 ? 1 : 0);
    c = mix(c, HAIR, hair * 0.92);
    // брови: дуга над каждым глазом
    for (const e of eyes) {
      const ex = p[0] - e.c[0], ey = p[1] - e.c[1];
      const outward = Math.sign(e.c[0]) * ex; // к виску
      const arc = e.r * 1.55 + 0.004 * Math.cos((outward / (e.r * 2.2)) * Math.PI / 2);
      if (p[2] > e.c[2] - e.r * 0.2 && outward > -e.r * 0.9 && outward < e.r * 1.7 && Math.abs(ey - arc) < e.r * 0.32 * (1 - 0.35 * Math.max(0, outward / (e.r * 1.7))))
        c = mix(c, BROW, 0.85);
    }
    // губы
    const mouthY = eyeMidY - 0.072;
    if (Math.abs(p[0]) < 0.024 && Math.abs(p[1] - mouthY) < 0.006 && p[2] > headC[2] + 0.07) c = mix(c, LIPS, 0.55);
  }
  return c;
});

// ---------- морф вдоха: живот вперёд, грудь чуть шире ----------
const navelY = spine01[1] + 0.03;
const breath = pos.map((p, i) => {
  const n = nrm[i];
  const torso = ['pelvis', 'spine_01', 'spine_02', 'spine_03'].includes(dominant[i]);
  if (!torso || n[2] < -0.2) return [0, 0, 0];
  const belly = Math.exp(-(((p[1] - navelY) / 0.09) ** 2)) * smooth(-0.2, 0.6, n[2]) * (p[1] > hipY - 0.02 ? 1 : 0);
  const chest = Math.exp(-(((p[1] - spine03[1]) / 0.08) ** 2)) * smooth(-0.1, 0.5, n[2]);
  return [n[0] * (0.012 * belly + 0.004 * chest), n[1] * 0.004 * chest + 0.003 * chest, n[2] * (0.024 * belly + 0.006 * chest)];
});

// ---------- запись ----------
const nV = pos.length;
let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
for (const p of pos) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
const qPos = new Uint16Array(nV * 3);
pos.forEach((p, i) => { for (let k = 0; k < 3; k++) qPos[i * 3 + k] = Math.round(((p[k] - lo[k]) / (hi[k] - lo[k])) * 65535); });
const qCol = new Uint8Array(nV * 3); col.forEach((c, i) => qCol.set(c, i * 3));
const qBreath = new Int8Array(nV * 3); // шаг 0,25 мм
breath.forEach((d, i) => { for (let k = 0; k < 3; k++) qBreath[i * 3 + k] = Math.max(-127, Math.min(127, Math.round(d[k] / 0.00025))); });
const idx = new Uint16Array(tris);

const parts = [qPos, qCol, skinIdx, skinW, qBreath, idx];
const offsets = [];
let off = 0;
for (const a of parts) { off = Math.ceil(off / 4) * 4; offsets.push(off); off += a.byteLength; }
const buf = Buffer.alloc(off);
parts.forEach((a, k) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).copy(buf, offsets[k]));

const meta = {
  source: 'MakeHuman base mesh, targets and MPFB game_engine rig — CC0 (makehumancommunity.org)',
  vertices: nV, indices: idx.length,
  bounds: { lo: lo.map(x => +x.toFixed(5)), hi: hi.map(x => +x.toFixed(5)) },
  breathStep: 0.00025,
  offsets: { position: offsets[0], color: offsets[1], skinIndex: offsets[2], skinWeight: offsets[3], breath: offsets[4], index: offsets[5] },
  bones,
  eyes,
  landmarks: {
    crotch: crotch.map(x => +x.toFixed(4)),
    hipY: +hipY.toFixed(4),
    spine01: spine01.map(x => +x.toFixed(4)),
    spine03: spine03.map(x => +x.toFixed(4)),
    minZ: +lo[2].toFixed(4),
  },
};
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'athlete.bin'), buf);
fs.writeFileSync(path.join(OUT, 'athlete.json'), JSON.stringify(meta));
console.log(`вершин ${nV}, треугольников ${idx.length / 3}, костей ${bones.length}, файл ${(buf.length / 1024).toFixed(0)} КБ`);
console.log('глаза', JSON.stringify(eyes), 'промежность', crotch.map(x => x.toFixed(3)).join(' '), 'рост', (hi[1] - lo[1]).toFixed(3));

// 3D-фигура для упражнений: реалистичный спортивный мужчина 190 см / 90 кг (MakeHuman, CC0) со скелетом
// и запечёнными текстурами кожи и рельефа, в положении сидя или стоя.
// Вид «насквозь»: кожа становится полупрозрачной, внутри — настоящая анатомия Z-Anatomy / BodyParts3D
// (CC BY-SA): кости таза, бёдра, позвоночник, рёбра, мышца, поднимающая задний проход, наружный сфинктер,
// мочевой пузырь, простата, диафрагма; сфинктер уретры и мышцы у основания пениса построены по поверхностям атласа.
// Пенис — ровный цилиндр по изогнутой оси: выходит из лобка, свисает перед мошонкой; головка своего оттенка,
// под кожей — вены. Мошонка — мешочек вокруг яичек атласа, крепится снизу к основанию пениса. Плотные при передней подсказке, иначе — контур. Анатомия прикреплена к костям скелета и движется вместе с позой.
// Вдох: живот и грудь расширяются, диафрагма сокращается и опускается, тазовое дно мягко опускается.
// Сжатие: мышцы тазового дна поднимаются и подсвечиваются, сфинктер сужается. С передней подсказкой
// сильнее работают мышцы у основания пениса и сфинктер уретры: пенис подтягивается, яички поднимаются.
// В «Knack» фигура кашляет, приседает или прыгает, камера следует за тазом.
// Модели собирает tools/build-figure.py (Blender).
import { ContactShadows, Html, OrbitControls } from '@react-three/drei';
import { Canvas, createPortal, useFrame, useThree } from '@react-three/fiber';
import { use, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { KnackTask } from '../engine/program';
import type { Phase } from '../engine/timeline';
import { ANATOMY_COLORS } from './anatomyColors';

/** level — сила сжатия, front — передняя подсказка, action — движение «Knack» и его ход 0…1 */
export interface FigureMotion { level: number; phase: Phase; front?: boolean; action?: { task: KnackTask; p: number } }
export type FigurePose = 'sitting' | 'standing';
/** body — тело целиком; pelvis — вид насквозь */
export type FigureZoom = 'body' | 'pelvis';
/** на чём держать камеру в виде насквозь: таз (сжатия), туловище (дыхание), основание пениса (передняя подсказка) */
export type FigureFocus = 'pelvis' | 'torso' | 'front';

type Vec3 = [number, number, number];
interface AthleteMeta {
  vertices: number;
  indices: number;
  bounds: { lo: Vec3; hi: Vec3 };
  breathStep: number;
  offsets: Record<'position' | 'normal' | 'uv' | 'skinIndex' | 'skinWeight' | 'breath' | 'index', number>;
  textures: { color: string; normal: string; rough: string };
  bones: { name: string; parent: number; head: Vec3 }[];
  eyes: { c: Vec3; r: number }[];
  landmarks: { crotch: Vec3; hipY: number; spine01: Vec3; spine03: Vec3; navel: Vec3; minZ: number };
}
interface AnatomyGroup {
  name: string; bone: string; vertices: number; indices: number; lo: Vec3; hi: Vec3;
  offsets: Record<'position' | 'normal' | 'index', number> & { tint?: number; fade?: number; vein?: number };
  /** точка поворота группы (корень пениса) */
  pivot?: Vec3;
}
interface Loaded {
  meta: AthleteMeta;
  geometry: THREE.BufferGeometry;
  color: THREE.Texture;
  normal: THREE.Texture;
  rough: THREE.Texture;
  anatomy: { group: AnatomyGroup; geometry: THREE.BufferGeometry; center: THREE.Vector3 }[];
}

const fileUrl = (f: string) => new URL(`figure/${f}`, document.baseURI).href;

async function fetchJson<T>(f: string): Promise<T> {
  const r = await fetch(fileUrl(f));
  if (!r.ok) throw new Error(f);
  return r.json() as Promise<T>;
}

/** Двоичный файл; где .bin не отдаётся (превью на claude.ai), он лежит рядом в base64 */
async function fetchBin(f: string): Promise<ArrayBuffer> {
  const r = await fetch(fileUrl(f));
  if (r.ok && !r.headers.get('content-type')?.includes('text/html')) return r.arrayBuffer();
  const { b64 } = await fetchJson<{ b64: string }>(`${f}.json`);
  return Uint8Array.from(atob(b64), ch => ch.charCodeAt(0)).buffer;
}

function dequant(q: Uint16Array, lo: Vec3, hi: Vec3) {
  const out = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) out[i] = lo[i % 3] + (q[i] / 65535) * (hi[i % 3] - lo[i % 3]);
  return out;
}

const int8ToFloat = (a: Int8Array, k = 1 / 127) => Float32Array.from(a, v => v * k);

let loading: Promise<Loaded> | null = null;

function loadFigure(): Promise<Loaded> {
  loading ??= (async () => {
    const tex = new THREE.TextureLoader();
    const [meta, bin, ameta, abin] = await Promise.all([
      fetchJson<AthleteMeta>('athlete.json'), fetchBin('athlete.bin'),
      fetchJson<{ groups: AnatomyGroup[] }>('anatomy.json'), fetchBin('anatomy.bin'),
    ]);
    const [color, normal, rough] = await Promise.all([
      tex.loadAsync(fileUrl(meta.textures.color)), tex.loadAsync(fileUrl(meta.textures.normal)), tex.loadAsync(fileUrl(meta.textures.rough)),
    ]);
    color.colorSpace = THREE.SRGBColorSpace;
    for (const t of [color, normal, rough]) t.anisotropy = 4;

    const n = meta.vertices, o = meta.offsets;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(dequant(new Uint16Array(bin, o.position, n * 3), meta.bounds.lo, meta.bounds.hi), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(int8ToFloat(new Int8Array(bin, o.normal, n * 3)), 3));
    // развёртка MakeHuman (v вверх) совпадает с соглашением three.js при flipY = true
    g.setAttribute('uv', new THREE.BufferAttribute(Float32Array.from(new Uint16Array(bin, o.uv, n * 2), v => v / 65535), 2));
    g.setAttribute('skinIndex', new THREE.Uint8BufferAttribute(new Uint8Array(bin, o.skinIndex, n * 4), 4));
    g.setAttribute('skinWeight', new THREE.Uint8BufferAttribute(new Uint8Array(bin, o.skinWeight, n * 4), 4, true));
    g.setIndex(new THREE.BufferAttribute(new Uint16Array(bin, o.index, meta.indices), 1));
    g.morphAttributes.position = [new THREE.BufferAttribute(int8ToFloat(new Int8Array(bin, o.breath, n * 3), meta.breathStep), 3)];
    g.morphTargetsRelative = true;
    g.computeTangents();

    const anatomy = ameta.groups.map(group => {
      const ag = new THREE.BufferGeometry();
      ag.setAttribute('position', new THREE.BufferAttribute(dequant(new Uint16Array(abin, group.offsets.position, group.vertices * 3), group.lo, group.hi), 3));
      ag.setAttribute('normal', new THREE.BufferAttribute(int8ToFloat(new Int8Array(abin, group.offsets.normal, group.vertices * 3)), 3));
      ag.setIndex(new THREE.BufferAttribute(new Uint16Array(abin, group.offsets.index, group.indices), 1));
      if (group.offsets.tint !== undefined) {
        // оттенок по вершинам: кожа ствола → головка; над венами кожа чуть синеватая
        const tint = new Uint8Array(abin, group.offsets.tint, group.vertices);
        const vein = group.offsets.vein !== undefined ? new Uint8Array(abin, group.offsets.vein, group.vertices) : null;
        const a = new THREE.Color(ANATOMY_COLORS.penis), b = new THREE.Color(ANATOMY_COLORS.glans), v = new THREE.Color(ANATOMY_COLORS.vein), c = new THREE.Color();
        const col = new Float32Array(group.vertices * 3);
        tint.forEach((t, i) => c.copy(a).lerp(b, t / 255).lerp(v, vein ? 0.55 * (vein[i] / 255) : 0).toArray(col, i * 3));
        ag.setAttribute('color', new THREE.BufferAttribute(col, 3));
      }
      // у тела кожа пениса и мошонки растворяется: 0 — под кожей тела, 1 — снаружи
      if (group.offsets.fade !== undefined) ag.setAttribute('fade', new THREE.BufferAttribute(new Uint8Array(abin, group.offsets.fade, group.vertices), 1, true));
      // центр группы — точка, вокруг которой она сжимается и поднимается
      ag.computeBoundingBox();
      const center = ag.boundingBox!.getCenter(new THREE.Vector3());
      ag.translate(-center.x, -center.y, -center.z);
      return { group, geometry: ag, center };
    });
    return { meta, geometry: g, color, normal, rough, anatomy };
  })();
  return loading;
}

const rest = (meta: AthleteMeta, name: string) => new THREE.Vector3(...meta.bones.find(b => b.name === name)!.head);

/** Своя копия скелета для каждой фигуры на экране: позы у них разные */
function createInstance(data: Loaded) {
  const { meta, geometry } = data;
  const bones = meta.bones.map(b => Object.assign(new THREE.Bone(), { name: b.name }));
  meta.bones.forEach((b, i) => {
    const p = b.parent >= 0 ? meta.bones[b.parent].head : [0, 0, 0];
    bones[i].position.set(b.head[0] - p[0], b.head[1] - p[1], b.head[2] - p[2]);
    if (b.parent >= 0) bones[b.parent].add(bones[i]);
  });
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
  mesh.add(bones[0]);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.frustumCulled = false;
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.morphTargetInfluences = [0];
  const by = Object.fromEntries(bones.map(b => [b.name, b])) as Record<string, THREE.Bone>;

  // анатомия: каждая группа — дочерний объект своей кости, в положении покоя
  const anatomy: Record<string, THREE.Mesh> = {};
  /** группы с точкой поворота: двигаем опору, а не саму группу */
  const pivots: Record<string, THREE.Object3D> = {};
  for (const a of data.anatomy) {
    const m = new THREE.Mesh(a.geometry);
    m.name = a.group.name;
    m.frustumCulled = false;
    let parent: THREE.Object3D = by[a.group.bone];
    let origin = rest(meta, a.group.bone);
    if (a.group.pivot) {
      const pv = new THREE.Object3D();
      pv.position.set(...a.group.pivot).sub(origin);
      pv.userData.base = pv.position.clone();
      parent.add(pv);
      pivots[a.group.name] = pv;
      parent = pv;
      origin = new THREE.Vector3(...a.group.pivot);
    }
    m.position.copy(a.center).sub(origin);
    m.userData.base = m.position.clone();
    parent.add(m);
    anatomy[a.group.name] = m;
  }
  return { mesh, by, anatomy, pivots };
}
type Instance = ReturnType<typeof createInstance>;

/** положение кости в системе модели (без поворота всей фигуры) */
function boneInMesh(inst: Instance, b: THREE.Object3D, offset = new THREE.Vector3()) {
  let m = new THREE.Matrix4().compose(offset, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
  for (let o: THREE.Object3D | null = b; o && o !== inst.mesh; o = o.parent) { o.updateMatrix(); m = o.matrix.clone().multiply(m); }
  return new THREE.Vector3().setFromMatrixPosition(m);
}

/** Камера: направление взгляда и расстояние для каждого положения */
// floor — взгляд на таз со стороны промежности, как в анатомических атласах: тазовое дно видно «воронкой»;
// front — сбоку-спереди на основание пениса, яички и мышцы под ними
const VIEW: Record<FigurePose, { dir: Vec3; floor: Vec3; front: Vec3; body: number; torso: number; pelvis: number; frontDist: number }> = {
  standing: { dir: [0.5, 0.18, 0.85], floor: [0.42, -0.32, 0.85], front: [0.8, -0.1, 0.6], body: 3.6, torso: 1.55, pelvis: 0.95, frontDist: 0.8 },
  sitting: { dir: [0.6, 0.28, 0.75], floor: [0.45, -0.1, 0.88], front: [0.72, 0.3, 0.62], body: 3.1, torso: 1.45, pelvis: 0.95, frontDist: 0.8 },
};

type Act = FigureMotion['action'];
const ease = (x: number) => { const t = THREE.MathUtils.clamp(x, 0, 1); return t * t * (3 - 2 * t); };

/** Насколько согнуться в момент p действия «Knack»: присед, наклон корпуса, прыжок, руки вперёд или вверх */
function actionAmounts(act: Act) {
  const out = { squat: 0, flex: 0, air: 0, reach: 0, swing: 0 };
  if (!act) return out;
  const p = act.p;
  if (act.task === 'squat') {
    out.squat = Math.sin(Math.PI * ease(p));
    out.reach = out.squat;
  } else if (act.task === 'cough') {
    // резкий наклон, короткая задержка и медленный возврат
    out.flex = p < 0.15 ? ease(p / 0.15) : p < 0.45 ? 1 : 1 - ease((p - 0.45) / 0.55);
    out.squat = 0.12 * out.flex;
  } else {
    // прыжок: подсесть, оттолкнуться с махом рук, полёт, мягко приземлиться
    out.squat = p < 0.3 ? 0.5 * ease(p / 0.3) : p < 0.42 ? 0.5 * (1 - ease((p - 0.3) / 0.12)) : p > 0.76 ? 0.4 * Math.sin(Math.PI * (p - 0.76) / 0.24) : 0;
    out.air = p > 0.42 && p < 0.76 ? Math.sin(Math.PI * (p - 0.42) / 0.34) : 0;
    out.swing = p > 0.3 && p < 0.8 ? Math.sin(Math.PI * (p - 0.3) / 0.5) : 0;
    out.reach = p < 0.3 ? -0.6 * ease(p / 0.3) : 0;
  }
  return out;
}

const zero = new THREE.Vector3();
const mixDir = (a: Vec3, b: Vec3, k: number): Vec3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

/** Ставит кости в позу (и в момент действия «Knack», если оно идёт) и возвращает сдвиг фигуры.
 *  Позы задаются направлениями костей в системе тела (Y — к голове, Z — вперёд, X — влево),
 *  поэтому не зависят от исходной А-позы модели. Стопы при этом остаются на месте. */
function poseBones(inst: Instance, meta: AthleteMeta, pose: FigurePose, act?: Act): THREE.Vector3 {
  const { by } = inst;
  Object.values(by).forEach(b => b.quaternion.identity());
  const restDir = (a: string, b: string) => rest(meta, b).sub(rest(meta, a)).normalize();
  /** повернуть кость так, чтобы она смотрела на child в направлении dir (с учётом поворота родителей) */
  const aim = (bone: string, child: string, dir: Vec3) => {
    const b = by[bone];
    const parents = new THREE.Quaternion();
    const chain: THREE.Bone[] = [];
    for (let p = b.parent; p instanceof THREE.Bone; p = p.parent) chain.unshift(p);
    chain.forEach(p => parents.multiply(p.quaternion));
    const local = new THREE.Vector3(...dir).normalize().applyQuaternion(parents.invert());
    b.quaternion.setFromUnitVectors(restDir(bone, child), local);
  };
  const sides = [['l', 1], ['r', -1]] as const;
  const arms = (up: Vec3, fore: Vec3, hand: Vec3) => sides.forEach(([s, x]) => {
    aim(`upperarm_${s}`, `lowerarm_${s}`, [up[0] * x, up[1], up[2]]);
    aim(`lowerarm_${s}`, `hand_${s}`, [fore[0] * x, fore[1], fore[2]]);
    aim(`hand_${s}`, `middle_01_${s}`, [hand[0] * x, hand[1], hand[2]]);
  });
  const feetFlat = (dir: Vec3) => sides.forEach(([s]) => aim(`foot_${s}`, `ball_${s}`, dir));
  const ankleRest = rest(meta, 'foot_l');
  const footRest = restDir('foot_l', 'ball_l').toArray() as Vec3;
  const a = actionAmounts(act);
  const lean = (k: number) => k > 0 && aim('spine_01', 'spine_02', mixDir(restDir('spine_01', 'spine_02').toArray() as Vec3, [0, 0.86, 0.5], k));

  const offset = new THREE.Vector3();
  if (pose === 'standing') {
    if (a.squat > 0) {
      sides.forEach(([s, x]) => {
        aim(`thigh_${s}`, `calf_${s}`, mixDir(restDir(`thigh_${s}`, `calf_${s}`).toArray() as Vec3, [0.16 * x, -0.42, 0.9], a.squat));
        aim(`calf_${s}`, `foot_${s}`, mixDir(restDir(`calf_${s}`, `foot_${s}`).toArray() as Vec3, [0.03 * x, -0.9, -0.42], a.squat));
      });
      feetFlat(footRest);
    }
    lean(Math.max(0.55 * a.squat, a.flex));
    const up: Vec3 = a.swing ? mixDir([0.13, -1, 0.02], [0.25, 0.75, 0.6], a.swing) : a.reach > 0 ? mixDir([0.13, -1, 0.02], [0.14, -0.2, 0.97], a.reach) : mixDir([0.13, -1, 0.02], [0.2, -0.8, -0.55], -a.reach);
    const fore: Vec3 = a.swing ? mixDir([0.1, -1, 0.16], [0.2, 0.8, 0.5], a.swing) : a.reach > 0 ? mixDir([0.1, -1, 0.16], [0.06, -0.05, 1], a.reach) : [0.1, -1, 0.16];
    arms(up, fore, a.swing || a.reach > 0 ? fore : [0.06, -1, 0.1]);
  } else {
    sides.forEach(([s, x]) => {
      aim(`thigh_${s}`, `calf_${s}`, [0.12 * x, -0.04, 1]);
      aim(`calf_${s}`, `foot_${s}`, [0.03 * x, -1, 0.06]);
    });
    feetFlat(footRest);
    // сидя «Knack» — только наклон корпуса, как при кашле
    lean(0.6 * Math.max(a.flex, a.squat));
    arms([0.2, -0.9, 0.38], [0.08, -0.45, 0.9], [0.02, -0.5, 0.86]);
  }
  if (pose === 'sitting' || a.squat > 0) {
    // таз опускается так, чтобы лодыжки остались на прежней высоте, а стоя — и на прежнем месте
    inst.mesh.updateMatrixWorld(true);
    const foot = boneInMesh(inst, by.foot_l);
    offset.y = ankleRest.y - foot.y;
    if (pose === 'standing') offset.z = ankleRest.z - foot.z;
  }
  offset.y += 0.13 * a.air;
  return offset;
}

function applyPose(inst: Instance, meta: AthleteMeta, pose: FigurePose) {
  const { by } = inst;
  const group = new THREE.Object3D();
  group.position.copy(poseBones(inst, meta, pose));
  group.updateMatrix();
  inst.mesh.updateMatrixWorld(true);

  const world = (b: THREE.Object3D, offset = new THREE.Vector3()) => boneInMesh(inst, b, offset).applyMatrix4(group.matrix);
  const floor = world(inst.anatomy.levator ?? by.pelvis);
  const dia = world(inst.anatomy.diaphragm ?? by.spine_02);
  const pts = [world(by.head), world(by.foot_l), world(by.foot_r), world(by.hand_l), world(by.hand_r), world(by.pelvis)];
  const box = new THREE.Box3().setFromPoints(pts);
  const v = VIEW[pose];
  const dir = new THREE.Vector3(...v.dir).normalize();
  const center = box.getCenter(new THREE.Vector3());
  const torso = floor.clone().lerp(dia, 0.42);
  const pelvis = floor.clone().lerp(dia, 0.06);
  const fdir = new THREE.Vector3(...v.floor).normalize();
  // основание пениса: между луковицей и корнем, чуть ниже — чтобы в кадр попали и яички
  const bulb = inst.anatomy.bulbospongiosus ? world(inst.anatomy.bulbospongiosus) : floor;
  const root = inst.pivots.penis ? world(inst.pivots.penis) : floor;
  const front = bulb.clone().lerp(root, 0.55).add(new THREE.Vector3(0, -0.03, 0));
  const frdir = new THREE.Vector3(...v.front).normalize();
  return {
    position: group.position.toArray() as Vec3,
    camera: {
      body: { target: center.toArray() as Vec3, pos: center.clone().addScaledVector(dir, v.body).toArray() as Vec3 },
      torso: { target: torso.toArray() as Vec3, pos: torso.clone().addScaledVector(dir, v.torso).toArray() as Vec3 },
      pelvis: { target: pelvis.toArray() as Vec3, pos: pelvis.clone().addScaledVector(fdir, v.pelvis).toArray() as Vec3 },
      front: { target: front.toArray() as Vec3, pos: front.clone().addScaledVector(frdir, v.frontDist).toArray() as Vec3 },
    },
  };
}

function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  const dark = document.documentElement.classList.contains('dark');
  return {
    dark,
    calm: new THREE.Color(v('--calm', '#0f9e8c')),
    floor: new THREE.Color(v('--surface-2', '#e9edf5')),
    ink: v('--muted', '#55607a'),
    prop: new THREE.Color(dark ? '#33405c' : '#c6cfdc'),
  };
}
type Theme = ReturnType<typeof readTheme>;

/** Цвета темы приложения; меняются вместе с темой */
function useTheme(): Theme {
  const [c, setC] = useState(readTheme);
  useEffect(() => {
    const mo = new MutationObserver(() => setC(readTheme()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);
  return c;
}


/** Радужка глаза: рисуется на холсте один раз */
let irisTexture: THREE.CanvasTexture | null = null;
function iris() {
  if (irisTexture) return irisTexture;
  const W = 512, H = 256;
  const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const g = c.getContext('2d')!;
  g.fillStyle = '#f1ece6';
  g.fillRect(0, 0, W, H);
  // к краям — лёгкая розоватость
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(190,120,110,0.35)');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // верхний полюс сферы смотрит вперёд: зрачок и радужка — полоса у верхнего края развёртки
  const irisEnd = H * 0.16, pupilEnd = H * 0.065;
  for (let x = 0; x < W; x++) {
    const n = Math.sin(x * 0.9) * 0.5 + Math.sin(x * 2.3 + 1) * 0.3 + Math.random() * 0.4;
    const l = 30 + 18 * n;
    g.fillStyle = `hsl(28, 45%, ${l}%)`;
    g.fillRect(x, pupilEnd, 1, irisEnd - pupilEnd);
  }
  g.fillStyle = '#5a3d27';
  g.globalAlpha = 0.5;
  g.fillRect(0, irisEnd - 6, W, 6);
  g.globalAlpha = 1;
  g.fillStyle = '#080605';
  g.fillRect(0, 0, W, pupilEnd);
  irisTexture = new THREE.CanvasTexture(c);
  irisTexture.colorSpace = THREE.SRGBColorSpace;
  return irisTexture;
}
const eyeGeometry = new THREE.SphereGeometry(1, 48, 32).rotateX(Math.PI / 2);

/** Рельеф кожи без текстур: высота задаётся функцией координат, нормаль — по её производным (bump Микельсена).
 *  rugae — поперечные складки мошонки */
const SKIN_RELIEF = {
  rugae: '0.00015 * sin(p.y * 1400.0 + 2.6 * sin(p.x * 330.0) + 1.8 * sin(p.z * 410.0)) * (0.55 + 0.45 * sin(p.x * 170.0 + p.z * 230.0)) + 0.00007 * sin(p.y * 2300.0 + 3.0 * sin(p.z * 500.0)) + 0.00004 * sin(p.x * 2900.0) * sin(p.z * 2700.0)',
};

/** Кожа пениса и мошонки: тёплая, матовая, с лёгким бархатным отливом */
function genitalSkin(p: THREE.MeshPhysicalMaterialParameters, relief?: keyof typeof SKIN_RELIEF) {
  // двусторонняя: у тела кожа срезана, и в срезе не должно быть просвета
  const m = new THREE.MeshPhysicalMaterial({ roughness: 0.58, metalness: 0, sheen: 0.35, sheenRoughness: 0.5, sheenColor: new THREE.Color('#ffcab4'), clearcoat: 0.06, clearcoatRoughness: 0.5, envMapIntensity: 0.6, transparent: true, side: THREE.DoubleSide, ...p });
  m.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute float fade;\nvarying float vFade;\nvarying vec3 vObjPos;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;\nvFade = fade;');
    shader.fragmentShader = 'varying float vFade;\nvarying vec3 vObjPos;\n' + shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      diffuseColor.a *= vFade;
      ${relief ? `{
        vec3 p = vObjPos;
        float h = ${SKIN_RELIEF[relief]};
        vec3 dpdx = dFdx(-vViewPosition), dpdy = dFdy(-vViewPosition);
        vec3 r1 = cross(dpdy, normal), r2 = cross(normal, dpdx);
        float det = dot(dpdx, r1);
        vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
        normal = normalize(abs(det) * normal - grad);
      }` : ''}`,
    );
  };
  m.customProgramCacheKey = () => `skin-${relief ?? 'smooth'}`;
  return m;
}

/** Кожа насквозь: прозрачна в центре, плотнее по краям силуэта — как на рентгене */
function xrayMaterial(base: THREE.MeshPhysicalMaterial) {
  base.transparent = true;
  base.depthWrite = false;
  base.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      float rim = 1.0 - abs(dot(normal, normalize(vViewPosition)));
      diffuseColor.a = mix(0.05, 0.62, pow(rim, 2.4));`,
    );
  };
  base.customProgramCacheKey = () => 'xray';
  return base;
}

function Label({ position, children, color }: { position: Vec3; children: string; color: string }) {
  return (
    <Html position={position} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
      <span style={{ color, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', textShadow: '0 0 4px var(--bg), 0 0 2px var(--bg), 0 0 6px var(--bg)' }}>{children}</span>
    </Html>
  );
}

function Athlete({ inst, data, motion, theme, xray, focus, layout, pose, follow }: {
  inst: Instance; data: Loaded; motion: RefObject<FigureMotion>; theme: Theme; xray: boolean; focus: FigureFocus;
  layout: ReturnType<typeof applyPose>; pose: FigurePose; follow: RefObject<THREE.Vector3>;
}) {
  const { meta } = data;
  const skin = useMemo(() => {
    const m = new THREE.MeshPhysicalMaterial({
      map: data.color, normalMap: data.normal, normalScale: new THREE.Vector2(1, 1), roughnessMap: data.rough,
      roughness: 1, metalness: 0, sheen: 0.22, sheenRoughness: 0.55, sheenColor: new THREE.Color('#ffcbb2'),
      clearcoat: 0.04, clearcoatRoughness: 0.6, envMapIntensity: 0.65,
    });
    return xray ? xrayMaterial(m) : m;
  }, [data, xray]);
  useEffect(() => { inst.mesh.material = skin; inst.mesh.renderOrder = xray ? 20 : 0; return () => skin.dispose(); }, [inst, skin, xray]);

  const mats = useMemo(() => {
    const muscle = () => new THREE.MeshPhysicalMaterial({ color: ANATOMY_COLORS.muscle, roughness: 0.42, sheen: 0.6, sheenColor: new THREE.Color('#ff9a8a'), clearcoat: 0.3, clearcoatRoughness: 0.4, emissive: ANATOMY_COLORS.active, emissiveIntensity: 0 });
    return {
      bone: new THREE.MeshStandardMaterial({ color: ANATOMY_COLORS.bone, roughness: 0.62 }),
      levator: muscle(),
      sphincter: muscle(),
      diaphragm: muscle(),
      urethral: muscle(),
      bulbo: Object.assign(muscle(), { side: THREE.DoubleSide }),
      ischio: Object.assign(muscle(), { side: THREE.DoubleSide }),
      penis: genitalSkin({ vertexColors: true }),
      scrotum: genitalSkin({ color: ANATOMY_COLORS.scrotum, roughness: 0.7 }, 'rugae'),
      penisGhost: xrayMaterial(genitalSkin({ vertexColors: true })),
      scrotumGhost: xrayMaterial(genitalSkin({ color: ANATOMY_COLORS.scrotum })),
      bladder: new THREE.MeshPhysicalMaterial({ color: ANATOMY_COLORS.bladder, roughness: 0.3, transparent: true, opacity: 0.8, clearcoat: 0.6 }),
      prostate: new THREE.MeshStandardMaterial({ color: ANATOMY_COLORS.prostate, roughness: 0.5 }),
    };
  }, []);
  useEffect(() => () => Object.values(mats).forEach(x => x.dispose()), [mats]);
  // при взгляде на таз кости полупрозрачные: мышцы тазового дна лежат внутри тазового кольца;
  // пенис и яички плотные только при передней подсказке, иначе не заслоняют тазовое дно
  useEffect(() => {
    const see = focus !== 'torso';
    mats.bone.transparent = see;
    mats.bone.opacity = see ? 0.5 : 1;
    mats.bone.depthWrite = !see;
    mats.bone.needsUpdate = true;
    const a = inst.anatomy, solid = focus === 'front';
    if (a.penis) a.penis.material = solid ? mats.penis : mats.penisGhost;
    if (a.scrotum) a.scrotum.material = solid ? mats.scrotum : mats.scrotumGhost;
  }, [inst, mats, focus, xray]);
  useEffect(() => {
    const a = inst.anatomy;
    const set = (name: string, mat: THREE.Material) => { if (a[name]) { a[name].material = mat; a[name].visible = xray; a[name].renderOrder = 1; } };
    ['pelvis_bones', 'femur_l', 'femur_r', 'spine', 'ribs'].forEach(n => set(n, mats.bone));
    set('levator', mats.levator);
    ['pelvis_bones', 'femur_l', 'femur_r', 'spine', 'ribs'].forEach(n => { if (a[n]) a[n].renderOrder = 2; });
    set('sphincter', mats.sphincter);
    set('diaphragm', mats.diaphragm);
    set('bladder', mats.bladder);
    set('prostate', mats.prostate);
    set('urethral_sphincter', mats.urethral);
    set('bulbospongiosus', mats.bulbo);
    set('ischiocavernosus', mats.ischio);
    set('penis', focus === 'front' ? mats.penis : mats.penisGhost);
    set('scrotum', focus === 'front' ? mats.scrotum : mats.scrotumGhost);
    // кожа пениса и мошонки рисуется после костей и мышц, как и кожа тела
    for (const n of ['penis', 'scrotum']) if (a[n]) a[n].renderOrder = 19;
  }, [inst, mats, xray]);

  const eyeMats = useMemo(() => ({
    eye: new THREE.MeshPhysicalMaterial({ map: iris(), roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 }),
  }), []);

  const tmp = useMemo(() => new THREE.Color(), []);
  const muscleColor = useMemo(() => new THREE.Color(ANATOMY_COLORS.muscle), []);
  const activeColor = useMemo(() => new THREE.Color(ANATOMY_COLORS.active), []);

  const groupRef = useRef<THREE.Group>(null);
  const acting = useRef(false);

  useFrame(state => {
    const mo = motion.current;
    if (!mo) return;
    // «Knack»: поза меняется каждый кадр, пока идёт действие; камера следует за тазом
    if (mo.action || acting.current) {
      const off = poseBones(inst, meta, pose, mo.action);
      groupRef.current?.position.copy(off);
      follow.current.copy(off).sub(new THREE.Vector3(...layout.position));
      acting.current = !!mo.action;
    }
    const t = state.clock.elapsedTime;
    const sq = Math.max(0, mo.level);
    // передняя подсказка сильнее включает мышцы у основания пениса, задняя — сфинктер и тазовое дно
    const fa = sq * (mo.front ? 1 : 0.45);
    const ba = sq * (mo.front ? 0.6 : 1);
    const breathing = mo.phase === 'inhale' || mo.phase === 'exhale';
    // вдох: в дыхательных упражнениях — по ленте, иначе спокойное фоновое дыхание (раз в 5 с)
    const b = breathing ? THREE.MathUtils.clamp(-mo.level / 0.25, 0, 1) : 0.35 * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / 5));
    const bFloor = breathing ? b : 0;
    if (inst.mesh.morphTargetInfluences) inst.mesh.morphTargetInfluences[0] = b;

    const a = inst.anatomy;
    const lev = a.levator, sph = a.sphincter, dia = a.diaphragm;
    if (lev) {
      lev.position.copy(lev.userData.base).add(new THREE.Vector3(0, 0.012 * sq - 0.009 * bFloor, 0.004 * sq));
      lev.scale.set(1 - 0.05 * sq, 1 - 0.2 * sq + 0.14 * bFloor, 1 - 0.06 * sq);
    }
    if (sph) {
      const k = 1 - 0.24 * sq + 0.06 * bFloor;
      sph.position.copy(sph.userData.base).add(new THREE.Vector3(0, 0.009 * sq - 0.005 * bFloor, 0.003 * sq));
      sph.scale.set(k, 1 + 0.12 * sq, k);
    }
    for (const nm of ['bladder', 'prostate']) {
      const o = a[nm];
      if (o) o.position.copy(o.userData.base).add(new THREE.Vector3(0, 0.005 * sq - 0.004 * bFloor, 0));
    }
    // пенис подтягивается к телу и слегка укорачивается, яички поднимаются
    const pv = inst.pivots.penis;
    if (pv) {
      pv.position.copy(pv.userData.base).add(new THREE.Vector3(0, 0.007 * fa, -0.006 * fa));
      pv.rotation.x = -0.22 * fa;
      pv.scale.setScalar(1 - 0.09 * fa);
    }
    if (a.scrotum) {
      // мошонка подтягивается вверх и чуть сжимается вместе с яичками
      a.scrotum.position.copy(a.scrotum.userData.base).add(new THREE.Vector3(0, 0.012 * fa - 0.003 * bFloor, 0.003 * fa));
      a.scrotum.scale.set(1 - 0.03 * fa, 1 - 0.1 * fa, 1 - 0.03 * fa);
    }
    if (a.urethral_sphincter) {
      const k = 1 - 0.22 * fa;
      a.urethral_sphincter.scale.set(k, 1 + 0.1 * fa, k);
    }
    for (const nm of ['bulbospongiosus', 'ischiocavernosus']) a[nm]?.scale.setScalar(1 - 0.05 * fa);
    if (dia) {
      dia.position.copy(dia.userData.base).add(new THREE.Vector3(0, -0.024 * b, 0));
      dia.scale.set(1 + 0.02 * b, 1 - 0.22 * b, 1 + 0.02 * b);
    }
    // работающая мышца подсвечивается
    for (const [m, k] of [[mats.levator, ba], [mats.sphincter, ba], [mats.urethral, fa], [mats.bulbo, fa], [mats.ischio, fa], [mats.diaphragm, breathing && mo.phase === 'inhale' ? b : 0]] as const) {
      m.emissiveIntensity = 0.55 * k;
      m.color.copy(tmp.copy(muscleColor).lerp(activeColor, 0.35 * k));
    }
  });

  const headRest = rest(meta, 'head');

  return (
    <group ref={groupRef} position={layout.position}>
      <primitive object={inst.mesh} />
      {createPortal(
        <>
          {meta.eyes.map((e, i) => (
            <mesh key={i} geometry={eyeGeometry} material={eyeMats.eye} position={new THREE.Vector3(...e.c).sub(headRest)} scale={e.r * 0.96} />
          ))}
        </>,
        inst.by.head,
      )}
      {/* подписи — от центра своей группы */}
      {xray && focus !== 'front' && inst.anatomy.levator && createPortal(<Label position={[0.1, 0.045, 0.03]} color={theme.ink}>мышцы тазового дна</Label>, inst.anatomy.levator)}
      {xray && inst.anatomy.sphincter && createPortal(<Label position={focus === 'front' ? [0.02, -0.02, -0.06] : [-0.075, -0.05, -0.02]} color={theme.ink}>анальный сфинктер</Label>, inst.anatomy.sphincter)}
      {xray && focus === 'front' && inst.anatomy.urethral_sphincter && createPortal(<Label position={[0.02, 0.03, -0.02]} color={theme.ink}>сфинктер уретры</Label>, inst.anatomy.urethral_sphincter)}
      {xray && focus === 'front' && inst.anatomy.bulbospongiosus && createPortal(<Label position={[0, -0.07, -0.035]} color={theme.ink}>мышцы у основания пениса</Label>, inst.anatomy.bulbospongiosus)}
      {xray && inst.anatomy.diaphragm && createPortal(<Label position={[0.17, 0.02, 0]} color={theme.ink}>диафрагма</Label>, inst.anatomy.diaphragm)}
    </group>
  );
}

function Props({ pose, theme, seat, xray }: { pose: FigurePose; theme: Theme; seat: number; xray: boolean }) {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} receiveShadow>
        <circleGeometry args={[1.45, 64]} />
        <meshStandardMaterial color={theme.floor} roughness={1} />
      </mesh>
      {pose === 'sitting' && (
        <mesh position={[0, seat / 2, -0.05]} castShadow receiveShadow>
          <cylinderGeometry args={[0.22, 0.2, seat, 40]} />
          <meshStandardMaterial color={theme.prop} roughness={0.7} transparent={xray} opacity={xray ? 0.3 : 1} depthWrite={!xray} />
        </mesh>
      )}
    </>
  );
}

/** Отражения окружения без загрузки файлов: процедурная «комната» three.js */
function Environment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.55;
    return () => { scene.environment = null; env.dispose(); pmrem.dispose(); };
  }, [gl, scene]);
  return null;
}

/** Плавный перелёт камеры при смене положения или масштаба; follow — сдвиг фигуры в «Knack», камера идёт за ним */
function CameraRig({ view, controls, follow, track }: { view: { pos: Vec3; target: Vec3 }; controls: RefObject<OrbitControlsImpl | null>; follow: RefObject<THREE.Vector3>; track: boolean }) {
  const { camera } = useThree();
  const anim = useRef({ k: 1, fromPos: new THREE.Vector3(), fromTarget: new THREE.Vector3(), toPos: new THREE.Vector3(), toTarget: new THREE.Vector3() });
  const applied = useRef(new THREE.Vector3());
  const d = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    const a = anim.current;
    a.fromPos.copy(camera.position).sub(applied.current);
    a.fromTarget.copy(controls.current?.target ?? new THREE.Vector3(...view.target)).sub(applied.current);
    a.toPos.set(...view.pos);
    a.toTarget.set(...view.target);
    a.k = 0;
  }, [view, camera, controls]);

  useFrame((_, dt) => {
    const a = anim.current;
    const c = controls.current;
    if (!c) return;
    if (a.k < 1) {
      a.k = Math.min(1, a.k + dt / 0.9);
      const e = a.k * a.k * (3 - 2 * a.k);
      camera.position.lerpVectors(a.fromPos, a.toPos, e).add(applied.current);
      c.target.lerpVectors(a.fromTarget, a.toTarget, e).add(applied.current);
      c.update();
    }
    // на всё тело смотрим неподвижно — так видно присед и прыжок; вблизи камера держит таз в кадре
    d.copy(track ? follow.current : zero).sub(applied.current);
    if (d.lengthSq() > 1e-10) {
      camera.position.add(d);
      c.target.add(d);
      applied.current.add(d);
      c.update();
    }
  });
  return null;
}

export default function Figure3D({ motion, pose, zoom = 'body', focus = 'torso', autoRotate = false, className = '' }: {
  motion: RefObject<FigureMotion>;
  pose: FigurePose;
  zoom?: FigureZoom;
  focus?: FigureFocus;
  autoRotate?: boolean;
  className?: string;
}) {
  const data = use(loadFigure());
  const inst = useMemo(() => createInstance(data), [data]);
  const layout = useMemo(() => applyPose(inst, data.meta, pose), [inst, data, pose]);
  const view = layout.camera[zoom === 'body' ? 'body' : focus];
  const follow = useRef(new THREE.Vector3());
  const theme = useTheme();
  const controls = useRef<OrbitControlsImpl>(null);
  // начальная точка камеры; дальше камеру ведёт CameraRig, чтобы смена вида шла плавно
  const [start] = useState(() => view);
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const seat = data.meta.landmarks.hipY + layout.position[1] - 0.09;

  return (
    <div className={`relative ${className}`}>
      <Canvas
        dpr={[1, 2]}
        shadows
        camera={{ position: start.pos, fov: 30, near: 0.05, far: 30 }}
        gl={{ antialias: true, alpha: true }}
        style={{ touchAction: 'pan-y' }}
        fallback={<div className="grid size-full place-items-center text-[14px] text-muted">3D недоступно на этом устройстве</div>}
      >
        <Environment />
        <hemisphereLight args={['#fff4ec', theme.dark ? '#1a2540' : '#c9d2e0', 0.55]} />
        <directionalLight position={[2.2, 4.2, 3]} intensity={2.1} color="#fff0e2" castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0004}
          shadow-camera-left={-1.3} shadow-camera-right={1.3} shadow-camera-top={2.2} shadow-camera-bottom={-0.5} />
        <directionalLight position={[-3, 2.4, 1.2]} intensity={0.6} color="#dbe6ff" />
        <directionalLight position={[0.5, 2.8, -3.5]} intensity={1.3} color="#ffffff" />
        <Athlete inst={inst} data={data} motion={motion} theme={theme} xray={zoom === 'pelvis'} focus={focus} layout={layout} pose={pose} follow={follow} />
        <Props pose={pose} theme={theme} seat={seat} xray={zoom === 'pelvis'} />
        <ContactShadows key={pose} position={[0, 0.001, 0]} scale={3.4} blur={2.4} opacity={theme.dark ? 0.55 : 0.32} far={1.8} resolution={512} frames={1} />
        <OrbitControls
          ref={controls}
          target={start.target}
          enablePan={false}
          enableZoom
          minDistance={0.45}
          maxDistance={6}
          minPolarAngle={0.15}
          maxPolarAngle={Math.PI / 2 + 0.45}
          enableDamping
          autoRotate={autoRotate && !reduced}
          autoRotateSpeed={0.6}
        />
        <CameraRig view={view} controls={controls} follow={follow} track={zoom !== 'body'} />
      </Canvas>
    </div>
  );
}

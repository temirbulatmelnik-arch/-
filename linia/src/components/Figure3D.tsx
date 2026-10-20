// 3D-фигура «Линии»: тот же спортивный мужчина 190 см / 90 кг, что в «Тонусе» (MakeHuman, CC0), с костями
// нижней челюсти и языка. Вид «Мышцы»: кожа полупрозрачная, внутри — анатомия Z-Anatomy / BodyParts3D (CC BY-SA):
// череп, челюсть, зубы, язык, подъязычная кость, позвонки, рёбра, ключицы, лопатки и мышцы лица, шеи и плеч.
// Анатомия скинирована на тот же скелет, поэтому мышцы тянутся вместе с кивком, открыванием рта и подъёмом рук.
// Работающие мышцы светятся тёплым, растягиваемые — холодным, «должны молчать» — приглушённым розовым,
// остальные почти прозрачны. Позы и движения задаются направлениями костей в осях тела
// (Y — к голове, Z — вперёд, X — влево) и поворотом всей фигуры: лёжа, на боку, в упоре.
// Модели собирает tools/build-figure.py (Blender).
import { ContactShadows, Html, OrbitControls } from '@react-three/drei';
import { Canvas, createPortal, useFrame, useThree } from '@react-three/fiber';
import { use, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { Anim, Pose } from '../engine/exercises';
import { MUSCLES, type MuscleId, type MuscleMap } from '../engine/muscles';
import type { FigureMotion, FigureProps, FigureView } from './figureTypes';

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
  landmarks: { eyeY: number; eyeZ: number; menton: number };
}
type Kind = 'bone' | 'teeth' | 'cartilage' | 'muscle';
interface AnatomyGroup {
  name: string; kind: Kind; vertices: number; indices: number; lo: Vec3; hi: Vec3;
  offsets: Record<'position' | 'normal' | 'index' | 'skinIndex' | 'skinWeight', number>;
}
interface Loaded {
  meta: AthleteMeta;
  geometry: THREE.BufferGeometry;
  color: THREE.Texture; normal: THREE.Texture; rough: THREE.Texture;
  anatomy: { group: AnatomyGroup; geometry: THREE.BufferGeometry; center: THREE.Vector3; bone: number }[];
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
    g.setAttribute('uv', new THREE.BufferAttribute(Float32Array.from(new Uint16Array(bin, o.uv, n * 2), v => v / 65535), 2));
    g.setAttribute('skinIndex', new THREE.Uint8BufferAttribute(new Uint8Array(bin, o.skinIndex, n * 4), 4));
    g.setAttribute('skinWeight', new THREE.Uint8BufferAttribute(new Uint8Array(bin, o.skinWeight, n * 4), 4, true));
    g.setIndex(new THREE.BufferAttribute(new Uint16Array(bin, o.index, meta.indices), 1));
    g.morphAttributes.position = [new THREE.BufferAttribute(int8ToFloat(new Int8Array(bin, o.breath, n * 3), meta.breathStep), 3)];
    g.morphTargetsRelative = true;
    g.computeTangents();

    const anatomy = ameta.groups.map(group => {
      const go = group.offsets, nv = group.vertices;
      const ag = new THREE.BufferGeometry();
      ag.setAttribute('position', new THREE.BufferAttribute(dequant(new Uint16Array(abin, go.position, nv * 3), group.lo, group.hi), 3));
      ag.setAttribute('normal', new THREE.BufferAttribute(int8ToFloat(new Int8Array(abin, go.normal, nv * 3)), 3));
      const si = new Uint8Array(abin, go.skinIndex, nv * 4), sw = new Uint8Array(abin, go.skinWeight, nv * 4);
      ag.setAttribute('skinIndex', new THREE.Uint8BufferAttribute(si, 4));
      ag.setAttribute('skinWeight', new THREE.Uint8BufferAttribute(sw, 4, true));
      ag.setIndex(new THREE.BufferAttribute(new Uint16Array(abin, go.index, group.indices), 1));
      ag.computeBoundingBox();
      // главная кость группы — для подписи
      const tot = new Map<number, number>();
      for (let i = 0; i < nv * 4; i++) tot.set(si[i], (tot.get(si[i]) ?? 0) + sw[i]);
      const bone = [...tot.entries()].sort((a, b) => b[1] - a[1])[0][0];
      return { group, geometry: ag, center: ag.boundingBox!.getCenter(new THREE.Vector3()), bone };
    });
    return { meta, geometry: g, color, normal, rough, anatomy };
  })();
  return loading;
}

const restOf = (meta: AthleteMeta, name: string) => new THREE.Vector3(...meta.bones.find(b => b.name === name)!.head);

/** Своя копия скелета для каждой фигуры на экране; тело и анатомия — на одном скелете */
function createInstance(data: Loaded) {
  const { meta } = data;
  const bones = meta.bones.map(b => Object.assign(new THREE.Bone(), { name: b.name }));
  meta.bones.forEach((b, i) => {
    const p = b.parent >= 0 ? meta.bones[b.parent].head : [0, 0, 0];
    bones[i].position.set(b.head[0] - p[0], b.head[1] - p[1], b.head[2] - p[2]);
    bones[i].userData.rest = bones[i].position.clone();
    if (b.parent >= 0) bones[b.parent].add(bones[i]);
  });
  const mesh = new THREE.SkinnedMesh(data.geometry, new THREE.MeshStandardMaterial());
  mesh.add(bones[0]);
  mesh.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  mesh.bind(skeleton);
  mesh.frustumCulled = false;
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.morphTargetInfluences = [0];
  const by = Object.fromEntries(bones.map(b => [b.name, b])) as Record<string, THREE.Bone>;
  const anatomy: Record<string, THREE.SkinnedMesh> = {};
  const anchors: Record<string, THREE.Object3D> = {};
  for (const a of data.anatomy) {
    const m = new THREE.SkinnedMesh(a.geometry, new THREE.MeshStandardMaterial());
    m.name = a.group.name;
    m.frustumCulled = false;
    m.bind(skeleton, mesh.bindMatrix);
    m.userData.kind = a.group.kind;
    anatomy[a.group.name] = m;
    // точка для подписи: центр группы, закреплённый на её главной кости
    const bone = bones[a.bone];
    const anchor = new THREE.Object3D();
    anchor.position.copy(a.center).sub(restOf(meta, bone.name));
    bone.add(anchor);
    anchors[a.group.name] = anchor;
  }
  return { mesh, by, anatomy, anchors, skeleton };
}
type Instance = ReturnType<typeof createInstance>;

// ===================================================================== позы

interface Spec {
  /** поворот всей фигуры */
  orient: THREE.Quaternion;
  /** направления костей в осях тела: [кость, дочерняя, направление] */
  aims: [string, string, Vec3][];
  /** собственные повороты суставов (оси родителя): сгибание X, поворот Y, наклон Z */
  rots: Record<string, Vec3>;
  /** сдвиги языка и челюсти, м */
  shifts?: Record<string, Vec3>;
  breath?: number;
  /** опора: кость остаётся в мировой точке (отжимания), иначе фигура ставится на пол */
  pivot?: { bone: string; world: Vec3 };
  /** сидя: таз на сиденье */
  seat?: boolean;
}

const D = THREE.MathUtils.degToRad;
const qEuler = (x: number, y = 0, z = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'XYZ'));
const qAxis = (axis: Vec3, a: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...axis), a);
const norm = (v: Vec3): Vec3 => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const mix = (a: Vec3, b: Vec3, k: number): Vec3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const sx = (v: Vec3, s: number): Vec3 => [v[0] * s, v[1], v[2]];
const ease = (x: number) => { const t = THREE.MathUtils.clamp(x, 0, 1); return t * t * (3 - 2 * t); };
/** мировое направление → оси тела при повороте фигуры q */
const toBody = (q: THREE.Quaternion, v: Vec3): Vec3 => new THREE.Vector3(...v).applyQuaternion(q.clone().invert()).toArray() as Vec3;

const ARM_DOWN: Vec3 = [0.13, -1, 0.02], FORE_DOWN: Vec3 = [0.1, -1, 0.14], HAND_DOWN: Vec3 = [0.06, -1, 0.1];
const SUPINE = qEuler(-Math.PI / 2);
const PRONE = qEuler(Math.PI / 2);
/** лёжа на боку: side — какой бок сверху (+1 левый, −1 правый) */
const sideLying = (top: number) => qAxis([0, 0, 1], top > 0 ? Math.PI / 2 : -Math.PI / 2).multiply(qEuler(-Math.PI / 2));

function arms(spec: Spec, up: Vec3, fore: Vec3, hand?: Vec3, only?: 1 | -1) {
  for (const [s, x] of [['l', 1], ['r', -1]] as const) {
    if (only && only !== x) continue;
    spec.aims.push([`upperarm_${s}`, `lowerarm_${s}`, sx(up, x)], [`lowerarm_${s}`, `hand_${s}`, sx(fore, x)], [`hand_${s}`, `middle_01_${s}`, sx(hand ?? fore, x)]);
  }
}
function legs(spec: Spec, thigh: Vec3, calf: Vec3) {
  for (const [s, x] of [['l', 1], ['r', -1]] as const) spec.aims.push([`thigh_${s}`, `calf_${s}`, sx(thigh, x)], [`calf_${s}`, `foot_${s}`, sx(calf, x)]);
}
const armSide = (spec: Spec, side: number, up: Vec3, fore: Vec3, hand?: Vec3) => arms(spec, sx(up, side), sx(fore, side), hand && sx(hand, side), side as 1 | -1);

/** Положение тела: поворот фигуры и исходные направления рук и ног */
function basePose(pose: Pose, side: number): Spec {
  const spec: Spec = { orient: new THREE.Quaternion(), aims: [], rots: {} };
  switch (pose) {
    case 'standing': case 'wall': case 'walking':
      arms(spec, ARM_DOWN, FORE_DOWN, HAND_DOWN);
      break;
    case 'doorway':
      arms(spec, ARM_DOWN, FORE_DOWN, HAND_DOWN);
      armSide(spec, side, [1, 0, 0], [0.05, 1, 0]);
      break;
    case 'sitting': case 'chairBack':
      legs(spec, [0.12, -0.04, 1], [0.03, -1, 0.06]);
      arms(spec, [0.2, -0.9, 0.38], [0.08, -0.45, 0.9], [0.02, -0.5, 0.86]);
      spec.seat = true;
      break;
    case 'supine': case 'supineRoll':
      spec.orient = SUPINE;
      legs(spec, [0.1, -0.55, 0.83], [0.04, -0.72, -0.69]);
      if (pose === 'supineRoll') arms(spec, [0.95, 0.2, -0.05], [0.95, 0.3, -0.05]);
      else arms(spec, [0.2, -1, -0.02], [0.14, -1, 0.02]);
      break;
    case 'prone':
      spec.orient = PRONE;
      arms(spec, [0.17, -1, 0], [0.1, -1, 0.02], [0.08, -1, 0.05]);
      break;
    case 'side': {
      spec.orient = sideLying(side);
      legs(spec, [0.06, -0.62, 0.78], [0.03, -0.88, -0.48]);
      // нижняя рука под головой, верхняя вдоль тела
      armSide(spec, -side, [0.15, 1, 0.12], [-0.3, 0.45, 0.85]);
      armSide(spec, side, [0.1, -1, 0.12], [0.06, -1, 0.2]);
      break;
    }
    case 'quadruped':
      spec.orient = PRONE;
      legs(spec, [0.1, 0, 1], [0.06, -1, 0.02]);
      arms(spec, [0.12, 0, 1], [0.1, 0.05, 1], [0.05, 1, 0.1]);
      break;
    case 'plank': case 'pushKnee': case 'pushTable': case 'pushWall':
      // настраивается в движении «плюс»
      break;
  }
  return spec;
}

/** Отжимание «плюс»: угол корпуса и руки к опоре. e — разгибание рук, plus — лопатки вперёд */
function pushPose(pose: Pose, a: number): Spec {
  const e = ease(a / 0.75), plus = ease((a - 0.75) / 0.25);
  const cfg = {
    plank: { pivot: 'foot_l', top: 64, bottom: 78, support: [0, -1, 0] as Vec3, world: [0, 0.08, -0.75] as Vec3 },
    pushKnee: { pivot: 'calf_l', top: 50, bottom: 70, support: [0, -1, 0] as Vec3, world: [0, 0.06, -0.35] as Vec3 },
    pushTable: { pivot: 'foot_l', top: 30, bottom: 46, support: [0, -0.62, 0.78] as Vec3, world: [0, 0.08, -0.55] as Vec3 },
    pushWall: { pivot: 'foot_l', top: 12, bottom: 22, support: [0, -0.05, 1] as Vec3, world: [0, 0.08, -0.35] as Vec3 },
  }[pose as 'plank']!;
  const phi = D(cfg.bottom + (cfg.top - cfg.bottom) * e);
  const orient = qEuler(phi);
  const spec: Spec = { orient, aims: [], rots: {}, pivot: { bone: cfg.pivot, world: cfg.world } };
  const toSupport = norm(toBody(orient, cfg.support));
  const bentUp: Vec3 = norm([0.55, -0.55, toSupport[2] * 0.6]);
  arms(spec, norm(mix(bentUp, [0.12, toSupport[1], toSupport[2]], e)), [0.08, toSupport[1], toSupport[2]], [0.03, 0.6, 0.8]);
  if (pose === 'pushKnee') legs(spec, [0.07, -1, 0], norm([0.04, -Math.sin(phi), -Math.cos(phi)]));
  // «плюс»: лопатки разъезжаются вперёд, верх спины чуть округляется
  spec.rots.clavicle_l = [0, -0.28 * plus, 0];
  spec.rots.clavicle_r = [0, 0.28 * plus, 0];
  spec.rots.spine_03 = [0.08 * plus, 0, 0];
  return spec;
}

/** Движение упражнения поверх положения тела */
function animSpec(anim: Anim, pose: Pose, a: number, side: number, t: number): Spec {
  if (['plank', 'pushKnee', 'pushTable', 'pushWall'].includes(pose)) return pushPose(pose, anim === 'plus' ? a : 1);
  const spec = basePose(pose, side);
  const r = spec.rots;
  const retract = (k: number) => { r.clavicle_l = [0, 0.22 * k, -0.08 * k]; r.clavicle_r = [0, -0.22 * k, 0.08 * k]; };
  const fistUnderChin = () => armSide(spec, -1, [0.18, -0.55, 0.82], [-0.35, 0.82, 0.45], [-0.3, 0.6, 0.75]);
  switch (anim) {
    case 'nod': r.head = [0.2 * a, 0, 0]; r.neck_01 = [-0.04 * a, 0, 0]; break;
    case 'nodPress':
      r.head = [0.15, 0, 0];
      armSide(spec, side, [0.3, 0.1, 0.95], [-0.3, 0.85, 0.42], [-0.2, 0.9, 0.35]);
      break;
    case 'headLift': r.neck_01 = [0.34 * a, 0, 0]; r.head = [0.22 * a, 0, 0]; break;
    case 'er':
      armSide(spec, side, [0.12, -1, 0.1], norm(mix([-0.35, -0.15, 0.92], [1, -0.1, 0.25], a)));
      break;
    case 'sideFlex': {
      const th = 0.25 + 2.5 * a;
      armSide(spec, side, [0.1, -Math.cos(th), Math.sin(th)], [0.1, -Math.cos(th), Math.sin(th)]);
      break;
    }
    case 'scapSet': arms(spec, [0.2, -1, -0.32 * a], [0.12, -1, -0.3 * a], [0.08, -1, -0.25 * a]); retract(a); break;
    case 'proneT': arms(spec, [1, 0, -0.35 * a], [1, 0.02, -0.35 * a], [1, 0.03, -0.3 * a]); retract(a); break;
    case 'proneY': arms(spec, [0.62, 0.78, -0.35 * a], [0.6, 0.8, -0.35 * a]); retract(a); break;
    case 'proneW': arms(spec, [0.85, -0.35, -0.35 * a], [0.15, 1, -0.38 * a]); retract(a); break;
    case 'proneExt':
      r.spine_03 = [-0.2 * a, 0, 0]; r.spine_02 = [-0.08 * a, 0, 0];
      arms(spec, [0.18, -1, -0.15 * a], [0.12, -1, -0.12 * a]); retract(a);
      break;
    case 'angel':
      arms(spec, norm(mix([0.92, -0.3, -0.12], [0.42, 0.9, -0.1], a)), norm(mix([0.1, 1, -0.1], [0.32, 0.95, -0.05], a)));
      break;
    case 'doorway':
      armSide(spec, side, [0.9, 0, -0.45 * a], [0.05, 1, -0.1 * a]);
      r.spine_03 = [0, -side * 0.18 * a, 0];
      break;
    case 'trapStretch':
      r.neck_01 = [0.08 * a, 0, side * 0.3 * a]; r.head = [0.12 * a, 0, side * 0.12 * a];
      armSide(spec, side, [0.25, -1, -0.05], [0.12, -1, 0.05]);
      armSide(spec, -side, [0.45, 0.55, 0.4], [-0.55, 0.65, 0.05]);
      break;
    case 'scmStretch':
      r.head = [-0.25 * a, side * 0.45 * a, 0];
      arms(spec, [0.25, -0.55, 0.8], [-0.75, 0.5, 0.2]);
      break;
    case 'chairExt':
      r.spine_03 = [-0.32 * a, 0, 0]; r.spine_02 = [-0.12 * a, 0, 0]; r.neck_01 = [0.04 * a, 0, 0];
      arms(spec, [0.75, 0.55, 0.25], [-0.7, 0.3, -0.6]);
      break;
    case 'thread': {
      r.spine_03 = [0, side * 0.55 * (1 - 2 * a), 0]; r.spine_02 = [0, side * 0.2 * (1 - 2 * a), 0];
      armSide(spec, side, norm(mix([0.85, 0.05, -0.5], [-0.85, 0.05, 0.5], a)), norm(mix([0.9, 0.1, -0.45], [-0.9, 0.1, 0.4], a)));
      break;
    }
    case 'breath': spec.breath = a; break;
    case 'walk': {
      const ph = t * Math.PI * 2 * 0.85, sw = 0.38 * Math.sin(ph);
      legs(spec, [0.06, -Math.cos(sw), Math.sin(sw)], [0.03, -Math.cos(sw - 0.25 - 0.25 * Math.max(0, Math.sin(ph))), Math.sin(sw - 0.25)]);
      spec.aims = spec.aims.map(x => (x[0].endsWith('_r') && x[0].startsWith('thigh') ? [x[0], x[1], [x[2][0], -Math.cos(-sw), Math.sin(-sw)]] : x[0].endsWith('_r') && x[0].startsWith('calf') ? [x[0], x[1], [x[2][0], -Math.cos(-sw - 0.25), Math.sin(-sw - 0.25)]] : x));
      arms(spec, [0.13, -1, -0.35 * Math.sin(ph)], [0.1, -1, 0.1 - 0.35 * Math.sin(ph)]);
      for (const x of spec.aims) if (x[0] === 'upperarm_r' || x[0] === 'lowerarm_r') x[2] = [x[2][0], x[2][1], -x[2][2] + 0.1];
      break;
    }
    case 'screen': r.head = [0.04 + 0.03 * Math.sin(t * 0.8), 0, 0]; arms(spec, [0.25, -0.8, 0.55], [-0.15, 0.3, 0.94]); break;
    case 'ctar': r.head = [0.13 * a, 0, 0]; r.neck_01 = [0.08 * a, 0, 0]; fistUnderChin(); break;
    case 'tongueTip': r.tongue = [-0.38 * a, 0, 0]; spec.shifts = { tongue: [0, 0.003 * a, 0] }; break;
    case 'tongueBack': r.tongue = [0.12 * a, 0, 0]; spec.shifts = { tongue: [0, 0.007 * a, -0.002 * a] }; break;
    case 'jawOpen': r.jaw = [0.3 * a, 0, 0]; fistUnderChin(); break;
    case 'chew': {
      const c = 0.5 - 0.5 * Math.cos(t * Math.PI * 2 * 1.3);
      r.jaw = [0.16 * c * Math.max(0.3, a), side * 0.05 * c, 0];
      break;
    }
    case 'clench': r.jaw = [-0.005 * a, 0, 0]; break;
    case 'smile': arms(spec, [0.22, -0.45, 0.86], [-0.35, 0.82, 0.45], [-0.25, 0.85, 0.45]); break;
    case 'platysma': r.head = [-0.22 * a, 0, 0]; r.jaw = [0.12 * a, 0, 0]; break;
    case 'jawJut': r.head = [-0.3 * a, 0, 0]; spec.shifts = { jaw: [0, 0, 0.007 * a] }; break;
    case 'kissCeiling': r.head = [-0.5 * a, 0, 0]; r.neck_01 = [-0.15 * a, 0, 0]; break;
    case 'shaker': r.neck_01 = [0.3 * a, 0, 0]; r.head = [0.15 * a, 0, 0]; break;
    case 'mewing': r.tongue = [-0.3 * a, 0, 0]; spec.shifts = { tongue: [0, 0.006 * a, 0] }; break;
    case 'plus': break;
  }
  return spec;
}

/** Ставит кости по описанию позы */
function applySpec(inst: Instance, meta: AthleteMeta, spec: Spec) {
  const { by } = inst;
  for (const b of Object.values(by)) { b.quaternion.identity(); b.position.copy(b.userData.rest); }
  for (const [name, [x, y, z]] of Object.entries(spec.rots)) by[name]?.quaternion.copy(qEuler(x, y, z));
  for (const [name, [x, y, z]] of Object.entries(spec.shifts ?? {})) by[name]?.position.add(new THREE.Vector3(x, y, z));
  const restDir = (a: string, b: string) => restOf(meta, b).sub(restOf(meta, a)).normalize();
  for (const [bone, child, dir] of spec.aims) {
    const b = by[bone];
    if (!b) continue;
    const parents = new THREE.Quaternion();
    const chain: THREE.Bone[] = [];
    for (let p = b.parent; p instanceof THREE.Bone; p = p.parent) chain.unshift(p);
    chain.forEach(p => parents.multiply(p.quaternion));
    const local = new THREE.Vector3(...dir).normalize().applyQuaternion(parents.invert());
    b.quaternion.setFromUnitVectors(restDir(bone, child), local);
  }
  if (inst.mesh.morphTargetInfluences) inst.mesh.morphTargetInfluences[0] = spec.breath ?? 0;
}

/** положение кости в системе модели (без поворота фигуры) */
function boneInMesh(inst: Instance, b: THREE.Object3D, offset = new THREE.Vector3()) {
  let m = new THREE.Matrix4().compose(offset, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
  for (let o: THREE.Object3D | null = b; o && o !== inst.mesh; o = o.parent) { o.updateMatrix(); m = o.matrix.clone().multiply(m); }
  return new THREE.Vector3().setFromMatrixPosition(m);
}

/** Самая низкая точка кожи после позы — чтобы положить фигуру на пол (считается один раз на позу) */
function lowestY(inst: Instance, q: THREE.Quaternion) {
  inst.mesh.updateMatrixWorld(true);
  inst.skeleton.update();
  const pos = inst.mesh.geometry.getAttribute('position');
  const v = new THREE.Vector3();
  let min = Infinity;
  for (let i = 0; i < pos.count; i += 3) {
    inst.mesh.getVertexPosition(i, v);
    v.applyQuaternion(q);
    if (v.y < min) min = v.y;
  }
  return min;
}

const MAT = 0.012;

/** Сдвиг фигуры: опора на месте, иначе — на полу (лёжа) или на сиденье (сидя) */
function placement(inst: Instance, meta: AthleteMeta, spec: Spec): THREE.Vector3 {
  inst.mesh.updateMatrixWorld(true);
  if (spec.pivot) {
    const p = boneInMesh(inst, inst.by[spec.pivot.bone]).applyQuaternion(spec.orient);
    return new THREE.Vector3(...spec.pivot.world).sub(p);
  }
  if (spec.seat) {
    // стопы на полу: лодыжки на прежней высоте
    const foot = boneInMesh(inst, inst.by.foot_l);
    return new THREE.Vector3(0, restOf(meta, 'foot_l').y - foot.y, 0);
  }
  if (spec.orient.equals(new THREE.Quaternion())) return new THREE.Vector3();
  return new THREE.Vector3(0, MAT - lowestY(inst, spec.orient), 0);
}

// ===================================================================== камера

const CAM: Record<FigureView, { dist: number }> = { face: { dist: 0.62 }, neck: { dist: 1.0 }, upper: { dist: 1.9 }, body: { dist: 3.4 } };
/** с какой стороны смотреть, в осях тела: спереди-сбоку — лицо, сбоку — шея, сзади — лопатки */
function camDir(anim: Anim, view: FigureView, side: number): Vec3 {
  if (view === 'face') return [0.78, 0.12, 0.62];
  if (['proneT', 'proneY', 'proneW', 'proneExt', 'scapSet', 'thread', 'er', 'sideFlex'].includes(anim)) return [side * 0.45, 0.3, -0.85];
  if (anim === 'plus') return [0.95, 0.25, 0.2];
  if (anim === 'doorway' || anim === 'angel' || anim === 'breath') return [side * 0.55, 0.2, 0.8];
  if (view === 'neck') return [0.92, 0.12, 0.38];
  return [0.6, 0.2, 0.78];
}

function focusPoint(inst: Instance, meta: AthleteMeta, view: FigureView) {
  const L = meta.landmarks;
  const head = restOf(meta, 'head');
  if (view === 'face') return boneInMesh(inst, inst.by.head, new THREE.Vector3(0, (L.eyeY + L.menton) / 2 - 0.012 - head.y, L.eyeZ - 0.035 - head.z));
  if (view === 'neck') return boneInMesh(inst, inst.by.neck_01, new THREE.Vector3(0, 0.02, 0.02));
  if (view === 'upper') return boneInMesh(inst, inst.by.spine_03, new THREE.Vector3(0, 0.08, 0));
  return boneInMesh(inst, inst.by.spine_01);
}

// ===================================================================== материалы

const COLORS = {
  bone: '#ece2d0', teeth: '#e9e0cf', cartilage: '#cfdcd8', muscle: '#b65a52', tongue: '#d4807a',
  work: '#ff7a45', also: '#f0a27a', stretch: '#4fa8f0', quiet: '#c95a8a',
};

/** Кожа насквозь: прозрачна в центре, плотнее по краям силуэта — как на рентгене */
function xrayMaterial(base: THREE.MeshPhysicalMaterial) {
  base.transparent = true;
  base.depthWrite = false;
  base.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      float rim = 1.0 - abs(dot(normal, normalize(vViewPosition)));
      diffuseColor.a = mix(0.035, 0.55, pow(rim, 2.6));`);
  };
  base.customProgramCacheKey = () => 'xray';
  return base;
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
  const irisEnd = H * 0.16, pupilEnd = H * 0.065;
  for (let x = 0; x < W; x++) {
    const l = 30 + 18 * (Math.sin(x * 0.9) * 0.5 + Math.sin(x * 2.3 + 1) * 0.3 + Math.random() * 0.4);
    g.fillStyle = `hsl(28, 45%, ${l}%)`;
    g.fillRect(x, pupilEnd, 1, irisEnd - pupilEnd);
  }
  g.fillStyle = '#080605';
  g.fillRect(0, 0, W, pupilEnd);
  irisTexture = new THREE.CanvasTexture(c);
  irisTexture.colorSpace = THREE.SRGBColorSpace;
  return irisTexture;
}
const eyeGeometry = new THREE.SphereGeometry(1, 48, 32).rotateX(Math.PI / 2);

function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  const dark = document.documentElement.classList.contains('dark');
  return { dark, gold: v('--gold', '#a8854f'), ink: v('--ink', '#2b211c'), prop: new THREE.Color(dark ? '#4a3c33' : '#efe4d6'), mat: new THREE.Color(dark ? '#5a4636' : '#e3cfb3') };
}
type Theme = ReturnType<typeof readTheme>;
function useTheme(): Theme {
  const [c, setC] = useState(readTheme);
  useEffect(() => {
    const mo = new MutationObserver(() => setC(readTheme()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);
  return c;
}

type Role = 'work' | 'also' | 'stretch' | 'quiet' | null;
function roleOf(name: string, m?: MuscleMap): Role {
  if (!m) return null;
  for (const r of ['work', 'also', 'stretch', 'quiet'] as const) if ((m[r] as string[] | undefined)?.includes(name)) return r;
  return null;
}

function Label({ text, color }: { text: string; color: string }) {
  return (
    <Html center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
      <span style={{ color, fontSize: 11, fontWeight: 600, letterSpacing: '0.02em', whiteSpace: 'nowrap', textShadow: '0 0 4px rgba(255,255,255,.85), 0 0 8px rgba(255,255,255,.6)' }}>{text}</span>
    </Html>
  );
}

function Athlete({ inst, data, motion, pose, view, xray, muscles, theme, layout }: {
  inst: Instance; data: Loaded; motion: RefObject<FigureMotion>; pose: Pose; view: FigureView; xray: boolean; muscles?: MuscleMap; theme: Theme;
  layout: { offset: THREE.Vector3; orient: THREE.Quaternion; side: number };
}) {
  const { meta } = data;
  const skin = useMemo(() => {
    const m = new THREE.MeshPhysicalMaterial({
      map: data.color, normalMap: data.normal, roughnessMap: data.rough, roughness: 1, metalness: 0,
      sheen: 0.25, sheenRoughness: 0.55, sheenColor: new THREE.Color('#ffcbb2'), clearcoat: 0.05, clearcoatRoughness: 0.6, envMapIntensity: 0.7,
    });
    return xray ? xrayMaterial(m) : m;
  }, [data, xray]);
  useEffect(() => { inst.mesh.material = skin; inst.mesh.renderOrder = xray ? 20 : 0; return () => skin.dispose(); }, [inst, skin, xray]);

  // у каждой группы анатомии свой материал: цвет и свечение зависят от роли мышцы в упражнении
  const mats = useMemo(() => {
    const out: Record<string, THREE.MeshPhysicalMaterial> = {};
    for (const [name, m] of Object.entries(inst.anatomy)) {
      const kind = m.userData.kind as Kind;
      const base = kind === 'muscle' ? (name === 'tongue' ? COLORS.tongue : COLORS.muscle) : COLORS[kind];
      out[name] = new THREE.MeshPhysicalMaterial({
        color: base, roughness: kind === 'teeth' ? 0.25 : kind === 'muscle' ? 0.42 : 0.6, clearcoat: kind === 'muscle' ? 0.35 : 0.15, clearcoatRoughness: 0.4,
        sheen: kind === 'muscle' ? 0.5 : 0, sheenColor: new THREE.Color('#ffb0a0'), emissive: new THREE.Color('#000000'), transparent: true, opacity: 1,
      });
      out[name].userData.base = new THREE.Color(base);
    }
    return out;
  }, [inst]);
  useEffect(() => () => Object.values(mats).forEach(x => x.dispose()), [mats]);
  useEffect(() => {
    for (const [name, m] of Object.entries(inst.anatomy)) {
      m.material = mats[name];
      m.visible = xray;
      m.renderOrder = m.userData.kind === 'muscle' ? 2 : 1;
    }
  }, [inst, mats, xray]);

  // роли мышц и непрозрачность: работающие — плотные, остальные — тонкой вуалью
  const roles = useMemo(() => Object.fromEntries(Object.keys(inst.anatomy).map(n => [n, roleOf(n, muscles)])) as Record<string, Role>, [inst, muscles]);
  const anyRole = Object.values(roles).some(Boolean);
  useEffect(() => {
    for (const [name, m] of Object.entries(mats)) {
      const kind = inst.anatomy[name].userData.kind as Kind;
      const role = roles[name];
      m.opacity = kind === 'teeth' ? 0.62 : kind !== 'muscle' ? (view === 'face' ? 0.5 : 0.72) : role === 'work' ? 0.96 : role === 'stretch' ? 0.82 : role === 'also' ? 0.78 : role === 'quiet' ? 0.5 : anyRole ? 0.14 : 0.6;
      m.depthWrite = m.opacity > 0.9;
      m.color.copy(m.userData.base).lerp(new THREE.Color(role ? COLORS[role] : m.userData.base), role === 'stretch' ? 0.8 : role ? 0.55 : 0);
      m.needsUpdate = true;
    }
  }, [mats, roles, anyRole, view, inst]);

  const eyeMat = useMemo(() => new THREE.MeshPhysicalMaterial({ map: iris(), roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05, transparent: xray, opacity: xray ? 0.35 : 1, depthWrite: !xray }), [xray]);
  const groupRef = useRef<THREE.Group>(null);
  const tmpQ = useMemo(() => new THREE.Quaternion(), []);
  const glowWork = useMemo(() => new THREE.Color(COLORS.work), []);
  const glowStretch = useMemo(() => new THREE.Color(COLORS.stretch), []);

  useFrame(state => {
    const mo = motion.current;
    if (!mo) return;
    const t = state.clock.elapsedTime;
    const spec = animSpec(mo.anim, pose, mo.amount, mo.side === 'r' ? -1 : mo.side === 'l' ? 1 : layout.side, t);
    applySpec(inst, meta, spec);
    const g = groupRef.current;
    if (g) {
      // отжимания и наклоны: опора на месте; остальные позы — сдвиг, посчитанный один раз
      if (spec.pivot) {
        g.quaternion.copy(spec.orient);
        g.position.copy(placement(inst, meta, spec));
      } else {
        g.quaternion.copy(tmpQ.copy(layout.orient));
        g.position.copy(layout.offset);
      }
    }
    // свечение: работающие пульсируют в удержании, растягиваемые светятся холодным
    const a = Math.max(0, mo.amount);
    const pulse = 0.75 + 0.25 * Math.sin(t * 4.2);
    for (const [name, m] of Object.entries(mats)) {
      const role = roles[name];
      if (role === 'work') { m.emissive.copy(glowWork); m.emissiveIntensity = 0.12 + 0.75 * a * pulse; }
      else if (role === 'also') { m.emissive.copy(glowWork); m.emissiveIntensity = 0.25 * a; }
      else if (role === 'stretch') { m.emissive.copy(glowStretch); m.emissiveIntensity = 0.1 + 0.6 * a; }
      else m.emissiveIntensity = 0;
    }
  });

  const headRest = restOf(meta, 'head');
  const label = muscles?.work?.[0] ?? muscles?.stretch?.[0];
  const labelGroup = label && inst.anchors[label] ? label : null;
  return (
    <group ref={groupRef} position={layout.offset} quaternion={layout.orient}>
      <primitive object={inst.mesh} />
      {Object.values(inst.anatomy).map(m => <primitive key={m.name} object={m} />)}
      {createPortal(<>{meta.eyes.map((e, i) => <mesh key={i} geometry={eyeGeometry} material={eyeMat} position={new THREE.Vector3(...e.c).sub(headRest)} scale={e.r * 0.96} />)}</>, inst.by.head)}
      {xray && labelGroup && createPortal(<Label text={MUSCLES[labelGroup as MuscleId].name} color={theme.ink} />, inst.anchors[labelGroup])}
    </group>
  );
}

/** Опоры: коврик, стена, стул, проём, стол */
function Props({ pose, theme, xray, layout, data, inst }: { pose: Pose; theme: Theme; xray: boolean; layout: { offset: THREE.Vector3; orient: THREE.Quaternion }; data: Loaded; inst: Instance }) {
  const mat = (c: THREE.Color, o = 1) => <meshStandardMaterial color={c} roughness={0.8} transparent={xray || o < 1} opacity={xray ? 0.35 * o : o} depthWrite={!xray} />;
  const lying = ['supine', 'supineRoll', 'prone', 'side', 'quadruped', 'plank', 'pushKnee'].includes(pose);
  const seatY = data.meta.landmarks ? restOf(data.meta, 'thigh_l').y + layout.offset.y - 0.09 : 0.45;
  const backZ = useMemo(() => {
    const box = new THREE.Box3().setFromBufferAttribute(inst.mesh.geometry.getAttribute('position') as THREE.BufferAttribute);
    return box.min.z;
  }, [inst]);
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} receiveShadow>
        <circleGeometry args={[2.2, 64]} />
        <meshStandardMaterial color={theme.prop} roughness={1} transparent opacity={0.6} />
      </mesh>
      {lying && <mesh position={[0, MAT / 2, layout.offset.z]} receiveShadow><boxGeometry args={[0.7, MAT, 2.0]} />{mat(theme.mat)}</mesh>}
      {(pose === 'sitting' || pose === 'chairBack') && (
        <mesh position={[0, seatY / 2, -0.05]} castShadow receiveShadow><cylinderGeometry args={[0.22, 0.2, seatY, 40]} />{mat(theme.prop)}</mesh>
      )}
      {pose === 'chairBack' && <mesh position={[0, seatY + 0.2, backZ - 0.03]} castShadow><boxGeometry args={[0.42, 0.4, 0.03]} />{mat(theme.prop)}</mesh>}
      {pose === 'wall' && <mesh position={[0, 1.2, backZ - 0.012]} receiveShadow><boxGeometry args={[1.6, 2.4, 0.02]} />{mat(theme.prop, 0.9)}</mesh>}
      {pose === 'pushWall' && <mesh position={[0, 1.2, 0.62]} receiveShadow><boxGeometry args={[1.6, 2.4, 0.02]} />{mat(theme.prop, 0.9)}</mesh>}
      {pose === 'pushTable' && <mesh position={[0, 0.37, 0.62]} castShadow receiveShadow><boxGeometry args={[1.0, 0.74, 0.5]} />{mat(theme.prop)}</mesh>}
      {pose === 'doorway' && (
        <>
          {[-0.45, 0.45].map(x => <mesh key={x} position={[x, 1.05, 0.08]}><boxGeometry args={[0.08, 2.1, 0.16]} />{mat(theme.prop, 0.9)}</mesh>)}
          <mesh position={[0, 2.12, 0.08]}><boxGeometry args={[0.98, 0.08, 0.16]} />{mat(theme.prop, 0.9)}</mesh>
        </>
      )}
      {pose === 'supineRoll' && <mesh position={[0, MAT + 0.03, layout.offset.z + 0.05]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.035, 0.035, 0.5, 24]} />{mat(theme.prop)}</mesh>}
    </>
  );
}

function Environment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.6;
    return () => { scene.environment = null; env.dispose(); pmrem.dispose(); };
  }, [gl, scene]);
  return null;
}

/** Плавный перелёт камеры при смене вида */
function CameraRig({ view, controls }: { view: { pos: Vec3; target: Vec3 }; controls: RefObject<OrbitControlsImpl | null> }) {
  const { camera } = useThree();
  const anim = useRef({ k: 1, fromPos: new THREE.Vector3(), fromTarget: new THREE.Vector3(), toPos: new THREE.Vector3(), toTarget: new THREE.Vector3() });
  useEffect(() => {
    const a = anim.current;
    a.fromPos.copy(camera.position);
    a.fromTarget.copy(controls.current?.target ?? new THREE.Vector3(...view.target));
    a.toPos.set(...view.pos);
    a.toTarget.set(...view.target);
    a.k = 0;
  }, [view, camera, controls]);
  useFrame((_, dt) => {
    const a = anim.current, c = controls.current;
    if (!c || a.k >= 1) return;
    a.k = Math.min(1, a.k + dt / 0.9);
    const e = a.k * a.k * (3 - 2 * a.k);
    camera.position.lerpVectors(a.fromPos, a.toPos, e);
    c.target.lerpVectors(a.fromTarget, a.toTarget, e);
    c.update();
  });
  return null;
}

export default function Figure3D({ motion, pose, view, xray, muscles, autoRotate = false, className = '' }: FigureProps) {
  const data = use(loadFigure());
  const inst = useMemo(() => createInstance(data), [data]);
  const theme = useTheme();
  const controls = useRef<OrbitControlsImpl>(null);
  const anim = motion.current.anim;
  const side = motion.current.side === 'r' ? -1 : 1;
  // раскладка на позу: поворот фигуры, сдвиг на пол, точка и направление камеры — один раз на смену позы и вида
  const layout = useMemo(() => {
    const spec = animSpec(anim, pose, 0, side, 0);
    applySpec(inst, data.meta, spec);
    const offset = placement(inst, data.meta, spec);
    const orient = spec.orient.clone();
    const focus = focusPoint(inst, data.meta, view).applyQuaternion(orient).add(offset);
    const dir = new THREE.Vector3(...sx(camDir(anim, view, side), view === 'face' ? 1 : 1)).applyQuaternion(orient);
    if (dir.y < 0.2) dir.y = 0.2;
    dir.normalize();
    const pos = focus.clone().addScaledVector(dir, CAM[view].dist);
    return { offset, orient, side, camera: { target: focus.toArray() as Vec3, pos: pos.toArray() as Vec3 } };
  }, [inst, data, pose, view, anim, side]);
  const [start] = useState(() => layout.camera);
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <div className={`relative ${className}`}>
      <Canvas dpr={[1, 2]} shadows camera={{ position: start.pos, fov: 30, near: 0.02, far: 30 }} gl={{ antialias: true, alpha: true }} style={{ touchAction: 'pan-y' }}
        fallback={<div className="grid size-full place-items-center text-[14px] text-muted">3D недоступно на этом устройстве</div>}>
        <Environment />
        <hemisphereLight args={['#fff4ec', theme.dark ? '#2a1f1a' : '#d9cbbd', 0.6]} />
        <directionalLight position={[2.2, 4.2, 3]} intensity={2.0} color="#fff0e2" castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0004}
          shadow-camera-left={-1.5} shadow-camera-right={1.5} shadow-camera-top={2.2} shadow-camera-bottom={-1} />
        <directionalLight position={[-3, 2.4, 1.2]} intensity={0.55} color="#ffe3d0" />
        <directionalLight position={[0.5, 2.8, -3.5]} intensity={1.2} color="#ffffff" />
        <Athlete inst={inst} data={data} motion={motion} pose={pose} view={view} xray={xray} muscles={muscles} theme={theme} layout={layout} />
        <Props pose={pose} theme={theme} xray={xray} layout={layout} data={data} inst={inst} />
        <ContactShadows key={pose} position={[0, 0.001, 0]} scale={4} blur={2.4} opacity={theme.dark ? 0.5 : 0.28} far={1.8} resolution={512} frames={1} />
        <OrbitControls ref={controls} target={start.target} enablePan={false} enableZoom minDistance={0.25} maxDistance={6} minPolarAngle={0.1} maxPolarAngle={Math.PI / 2 + 0.3}
          enableDamping autoRotate={autoRotate && !reduced} autoRotateSpeed={0.5} />
        <CameraRig view={layout.camera} controls={controls} />
      </Canvas>
    </div>
  );
}

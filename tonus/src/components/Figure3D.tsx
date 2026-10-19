// 3D-фигура для упражнений: реалистичный спортивный мужчина 190 см / 90 кг (MakeHuman, CC0) со скелетом
// и запечёнными текстурами кожи и рельефа, в положении сидя или стоя.
// Вид «насквозь»: кожа становится полупрозрачной, внутри — настоящая анатомия Z-Anatomy / BodyParts3D
// (CC BY-SA): кости таза, бёдра, позвоночник, рёбра, мышца, поднимающая задний проход, наружный сфинктер,
// мочевой пузырь, простата, диафрагма. Анатомия прикреплена к костям скелета и движется вместе с позой.
// Вдох: живот и грудь расширяются, диафрагма сокращается и опускается, тазовое дно мягко опускается.
// Сжатие: мышцы тазового дна поднимаются и подсвечиваются, сфинктер сужается.
// Модели собирает tools/build-figure.py (Blender).
import { ContactShadows, Html, OrbitControls } from '@react-three/drei';
import { Canvas, createPortal, useFrame, useThree } from '@react-three/fiber';
import { use, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { Phase } from '../engine/timeline';
import { ANATOMY_COLORS } from './anatomyColors';

export interface FigureMotion { level: number; phase: Phase }
export type FigurePose = 'sitting' | 'standing';
/** body — тело целиком; pelvis — вид насквозь */
export type FigureZoom = 'body' | 'pelvis';
/** на чём держать камеру в виде насквозь: таз (сжатия) или туловище целиком (дыхание) */
export type FigureFocus = 'pelvis' | 'torso';

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
  offsets: Record<'position' | 'normal' | 'index', number>;
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
  for (const a of data.anatomy) {
    const m = new THREE.Mesh(a.geometry);
    m.name = a.group.name;
    m.position.copy(a.center).sub(rest(meta, a.group.bone));
    m.userData.base = m.position.clone();
    m.frustumCulled = false;
    by[a.group.bone].add(m);
    anatomy[a.group.name] = m;
  }
  return { mesh, by, anatomy };
}
type Instance = ReturnType<typeof createInstance>;

/** положение кости в системе модели (без поворота всей фигуры) */
function boneInMesh(inst: Instance, b: THREE.Object3D, offset = new THREE.Vector3()) {
  let m = new THREE.Matrix4().compose(offset, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
  for (let o: THREE.Object3D | null = b; o && o !== inst.mesh; o = o.parent) { o.updateMatrix(); m = o.matrix.clone().multiply(m); }
  return new THREE.Vector3().setFromMatrixPosition(m);
}

/** Камера: направление взгляда и расстояние для каждого положения */
// floor — взгляд на таз со стороны промежности, как в анатомических атласах: тазовое дно видно «воронкой»
const VIEW: Record<FigurePose, { dir: Vec3; floor: Vec3; body: number; torso: number; pelvis: number }> = {
  standing: { dir: [0.5, 0.18, 0.85], floor: [0.42, -0.32, 0.85], body: 3.6, torso: 1.55, pelvis: 0.95 },
  sitting: { dir: [0.6, 0.28, 0.75], floor: [0.45, -0.1, 0.88], body: 3.1, torso: 1.45, pelvis: 0.95 },
};

/** Ставит кости в позу и возвращает, где оказалась фигура и куда смотреть камере.
 *  Позы задаются направлениями костей в системе тела (Y — к голове, Z — вперёд, X — влево),
 *  поэтому не зависят от исходной А-позы модели. */
function applyPose(inst: Instance, meta: AthleteMeta, pose: FigurePose) {
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

  const group = new THREE.Object3D();
  if (pose === 'standing') {
    arms([0.13, -1, 0.02], [0.1, -1, 0.16], [0.06, -1, 0.1]);
  } else {
    sides.forEach(([s, x]) => {
      aim(`thigh_${s}`, `calf_${s}`, [0.12 * x, -0.04, 1]);
      aim(`calf_${s}`, `foot_${s}`, [0.03 * x, -1, 0.06]);
    });
    feetFlat(footRest);
    arms([0.2, -0.9, 0.38], [0.08, -0.45, 0.9], [0.02, -0.5, 0.86]);
    // таз опускается так, чтобы лодыжки оказались на прежней высоте над полом
    inst.mesh.updateMatrixWorld(true);
    group.position.y = ankleRest.y - boneInMesh(inst, by.foot_l).y;
  }
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
  return {
    position: group.position.toArray() as Vec3,
    camera: {
      body: { target: center.toArray() as Vec3, pos: center.clone().addScaledVector(dir, v.body).toArray() as Vec3 },
      torso: { target: torso.toArray() as Vec3, pos: torso.clone().addScaledVector(dir, v.torso).toArray() as Vec3 },
      pelvis: { target: pelvis.toArray() as Vec3, pos: pelvis.clone().addScaledVector(fdir, v.pelvis).toArray() as Vec3 },
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

function Athlete({ inst, data, motion, theme, xray, focus, layout }: {
  inst: Instance; data: Loaded; motion: RefObject<FigureMotion>; theme: Theme; xray: boolean; focus: FigureFocus; layout: ReturnType<typeof applyPose>;
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
      bladder: new THREE.MeshPhysicalMaterial({ color: ANATOMY_COLORS.bladder, roughness: 0.3, transparent: true, opacity: 0.8, clearcoat: 0.6 }),
      prostate: new THREE.MeshStandardMaterial({ color: ANATOMY_COLORS.prostate, roughness: 0.5 }),
    };
  }, []);
  useEffect(() => () => Object.values(mats).forEach(x => x.dispose()), [mats]);
  // при взгляде на таз кости полупрозрачные: мышцы тазового дна лежат внутри тазового кольца
  useEffect(() => {
    const see = focus === 'pelvis';
    mats.bone.transparent = see;
    mats.bone.opacity = see ? 0.5 : 1;
    mats.bone.depthWrite = !see;
    mats.bone.needsUpdate = true;
  }, [mats, focus]);
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
  }, [inst, mats, xray]);

  const eyeMats = useMemo(() => ({
    eye: new THREE.MeshPhysicalMaterial({ map: iris(), roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 }),
  }), []);

  const tmp = useMemo(() => new THREE.Color(), []);
  const muscleColor = useMemo(() => new THREE.Color(ANATOMY_COLORS.muscle), []);
  const activeColor = useMemo(() => new THREE.Color(ANATOMY_COLORS.active), []);

  useFrame(state => {
    const mo = motion.current;
    if (!mo) return;
    const t = state.clock.elapsedTime;
    const sq = Math.max(0, mo.level);
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
    if (dia) {
      dia.position.copy(dia.userData.base).add(new THREE.Vector3(0, -0.024 * b, 0));
      dia.scale.set(1 + 0.02 * b, 1 - 0.22 * b, 1 + 0.02 * b);
    }
    // работающая мышца подсвечивается
    for (const [m, k] of [[mats.levator, sq], [mats.sphincter, sq], [mats.diaphragm, breathing && mo.phase === 'inhale' ? b : 0]] as const) {
      m.emissiveIntensity = 0.55 * k;
      m.color.copy(tmp.copy(muscleColor).lerp(activeColor, 0.35 * k));
    }
  });

  const headRest = rest(meta, 'head');

  return (
    <group position={layout.position}>
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
      {xray && inst.anatomy.levator && createPortal(<Label position={[0.1, 0.045, 0.03]} color={theme.ink}>мышцы тазового дна</Label>, inst.anatomy.levator)}
      {xray && inst.anatomy.sphincter && createPortal(<Label position={[-0.075, -0.05, -0.02]} color={theme.ink}>сфинктер</Label>, inst.anatomy.sphincter)}
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

/** Плавный перелёт камеры при смене положения или масштаба */
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
    const a = anim.current;
    if (a.k >= 1 || !controls.current) return;
    a.k = Math.min(1, a.k + dt / 0.9);
    const e = a.k * a.k * (3 - 2 * a.k);
    camera.position.lerpVectors(a.fromPos, a.toPos, e);
    controls.current.target.lerpVectors(a.fromTarget, a.toTarget, e);
    controls.current.update();
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
        <Athlete inst={inst} data={data} motion={motion} theme={theme} xray={zoom === 'pelvis'} focus={focus} layout={layout} />
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
        <CameraRig view={view} controls={controls} />
      </Canvas>
    </div>
  );
}

// 3D-фигура для упражнений: реалистичный спортивный мужчина (MakeHuman, CC0) со скелетом,
// в положении лёжа, сидя или стоя. Поверх тела подсвечены диафрагма (голубой купол), тазовое дно (чаша)
// и кольцо сфинктера. Вдох: живот и грудь расширяются, диафрагма и тазовое дно опускаются.
// Сжатие: чаша поднимается и уплощается, кольцо сужается и уходит вверх. Во время удержаний фигура
// спокойно дышит — как и нужно делать. Модель собирается скриптом tools/build-athlete.mjs.
import { ContactShadows, Html, OrbitControls } from '@react-three/drei';
import { Canvas, createPortal, useFrame, useThree } from '@react-three/fiber';
import { use, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { Phase } from '../engine/timeline';

export interface FigureMotion { level: number; phase: Phase }
export type FigurePose = 'lying' | 'sitting' | 'standing';
export type FigureZoom = 'body' | 'pelvis';

type Vec3 = [number, number, number];
interface AthleteMeta {
  vertices: number;
  indices: number;
  bounds: { lo: Vec3; hi: Vec3 };
  breathStep: number;
  offsets: Record<'position' | 'color' | 'skinIndex' | 'skinWeight' | 'breath' | 'index', number>;
  bones: { name: string; parent: number; head: Vec3 }[];
  eyes: { c: Vec3; r: number }[];
  landmarks: { crotch: Vec3; hipY: number; spine01: Vec3; spine03: Vec3; minZ: number };
}
interface Athlete { meta: AthleteMeta; geometry: THREE.BufferGeometry }

let athlete: Promise<Athlete> | null = null;

function loadAthlete(): Promise<Athlete> {
  athlete ??= (async () => {
    const url = (f: string) => new URL(`figure/${f}`, document.baseURI).href;
    const [meta, bin] = await Promise.all([
      fetch(url('athlete.json')).then(r => { if (!r.ok) throw new Error('athlete.json'); return r.json() as Promise<AthleteMeta>; }),
      fetch(url('athlete.bin')).then(r => { if (!r.ok) throw new Error('athlete.bin'); return r.arrayBuffer(); }),
    ]);
    const n = meta.vertices, o = meta.offsets, { lo, hi } = meta.bounds;
    const q = new Uint16Array(bin, o.position, n * 3);
    const position = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) position[i] = lo[i % 3] + (q[i] / 65535) * (hi[i % 3] - lo[i % 3]);
    const c8 = new Uint8Array(bin, o.color, n * 3);
    const color = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) { const c = c8[i] / 255; color[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
    const b8 = new Int8Array(bin, o.breath, n * 3);
    const breath = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) breath[i] = b8[i] * meta.breathStep;

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(position, 3));
    g.setAttribute('color', new THREE.BufferAttribute(color, 3));
    g.setAttribute('skinIndex', new THREE.Uint8BufferAttribute(new Uint8Array(bin, o.skinIndex, n * 4), 4));
    g.setAttribute('skinWeight', new THREE.Uint8BufferAttribute(new Uint8Array(bin, o.skinWeight, n * 4), 4, true));
    g.setIndex(new THREE.BufferAttribute(new Uint16Array(bin, o.index, meta.indices), 1));
    g.morphAttributes.position = [new THREE.BufferAttribute(breath, 3)];
    g.morphTargetsRelative = true;
    g.computeVertexNormals();
    return { meta, geometry: g };
  })();
  return athlete;
}

/** Своя копия скелета для каждой фигуры на экране: позы у них разные */
function createInstance({ meta, geometry }: Athlete) {
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
  mesh.morphTargetInfluences = [0];
  const by = Object.fromEntries(bones.map(b => [b.name, b])) as Record<string, THREE.Bone>;
  return { mesh, by };
}
type Instance = ReturnType<typeof createInstance>;

const rest = (meta: AthleteMeta, name: string) => new THREE.Vector3(...meta.bones.find(b => b.name === name)!.head);

/** положение кости в системе модели (без поворота всей фигуры) */
function boneInMesh(inst: Instance, b: THREE.Object3D, offset = new THREE.Vector3()) {
  let m = new THREE.Matrix4().compose(offset, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
  for (let o: THREE.Object3D | null = b; o && o !== inst.mesh; o = o.parent) { o.updateMatrix(); m = o.matrix.clone().multiply(m); }
  return new THREE.Vector3().setFromMatrixPosition(m);
}

/** Камера: направление взгляда и расстояние для каждого положения */
const VIEW: Record<FigurePose, { dir: Vec3; body: number; pelvis: number }> = {
  standing: { dir: [0.55, 0.22, 0.8], body: 3.4, pelvis: 1.25 },
  sitting: { dir: [0.6, 0.3, 0.75], body: 2.9, pelvis: 1.2 },
  lying: { dir: [0.78, 0.58, 0.25], body: 2.7, pelvis: 1.15 },
};

/** Ставит кости в позу и возвращает, где оказалась фигура и куда смотреть камере.
 *  Позы задаются направлениями костей в системе тела (Y — к голове, Z — вперёд, X — влево),
 *  поэтому не зависят от исходной А-позы модели. Положение лёжа — та же поза, повёрнутая на спину. */
function applyPose(inst: Instance, meta: AthleteMeta, pose: FigurePose) {
  const { by } = inst;
  Object.values(by).forEach(b => b.quaternion.identity());
  const restDir = (a: string, b: string) => rest(meta, b).sub(rest(meta, a)).normalize();
  const len = (a: string, b: string) => rest(meta, b).distanceTo(rest(meta, a));
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
  } else if (pose === 'sitting') {
    sides.forEach(([s, x]) => {
      aim(`thigh_${s}`, `calf_${s}`, [0.12 * x, -0.04, 1]);
      aim(`calf_${s}`, `foot_${s}`, [0.03 * x, -1, 0.06]);
    });
    feetFlat(footRest);
    arms([0.2, -0.9, 0.38], [0.08, -0.45, 0.9], [0.02, -0.5, 0.86]);
  } else {
    // лёжа на спине, колени согнуты, стопы на полу: подбираем угол голени так, чтобы стопа встала на пол
    const lift = -meta.landmarks.minZ;
    const thigh: Vec3 = [0.1, -0.66, 0.75];
    const t = new THREE.Vector3(...thigh).normalize();
    const hip = rest(meta, 'thigh_l');
    const ankleZ = ankleRest.y - lift; // высота лодыжки над полом = её высота стоя
    const cz = THREE.MathUtils.clamp((ankleZ - hip.z - t.z * len('thigh_l', 'calf_l')) / len('calf_l', 'foot_l'), -0.99, 0.99);
    sides.forEach(([s, x]) => {
      aim(`thigh_${s}`, `calf_${s}`, [thigh[0] * x, thigh[1], thigh[2]]);
      aim(`calf_${s}`, `foot_${s}`, [0.02 * x, -Math.sqrt(1 - cz * cz), cz]);
    });
    feetFlat([0, -0.94, -0.34]);
    arms([0.2, -1, -0.04], [0.12, -1, -0.04], [0.06, -1, -0.06]);
    group.rotation.x = -Math.PI / 2;
    group.position.y = lift;
    group.position.z = 0.75;
  }
  if (pose === 'sitting') {
    // таз опускается так, чтобы лодыжки оказались на прежней высоте над полом
    inst.mesh.updateMatrixWorld(true);
    group.position.y = ankleRest.y - boneInMesh(inst, by.foot_l).y;
  }
  group.updateMatrix();
  inst.mesh.updateMatrixWorld(true);

  const world = (b: THREE.Bone, offset = new THREE.Vector3()) => boneInMesh(inst, b, offset).applyMatrix4(group.matrix);
  const L = meta.landmarks;
  const floor = world(by.pelvis, new THREE.Vector3(0, L.crotch[1] + 0.055, L.crotch[2]).sub(rest(meta, 'pelvis')));
  const dia = world(by.spine_02, new THREE.Vector3(0, L.spine03[1] + 0.03, L.spine03[2] + 0.07).sub(rest(meta, 'spine_02')));
  const pts = [world(by.head), world(by.foot_l), world(by.foot_r), world(by.hand_l), world(by.hand_r), world(by.pelvis)];
  const box = new THREE.Box3().setFromPoints(pts);
  const v = VIEW[pose];
  const dir = new THREE.Vector3(...v.dir).normalize();
  const center = box.getCenter(new THREE.Vector3());
  const focus = floor.clone().lerp(dia, 0.45);
  return {
    position: group.position.toArray() as Vec3,
    rotation: [group.rotation.x, 0, 0] as Vec3,
    camera: {
      body: { target: center.toArray() as Vec3, pos: center.clone().addScaledVector(dir, v.body).toArray() as Vec3 },
      pelvis: { target: focus.toArray() as Vec3, pos: focus.clone().addScaledVector(dir, v.pelvis).toArray() as Vec3 },
    },
  };
}

function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  const dark = document.documentElement.classList.contains('dark');
  return {
    dark,
    calm: new THREE.Color(v('--calm', '#0f9e8c')),
    squeeze: new THREE.Color(v('--squeeze', '#e5486b')),
    breath: new THREE.Color(v('--breath', '#1d8fd6')),
    floor: new THREE.Color(v('--surface-2', '#e9edf5')),
    ink: v('--muted', '#55607a'),
    prop: new THREE.Color(dark ? '#33405c' : '#c6cfdc'),
  };
}
type Colors = ReturnType<typeof readColors>;

/** Цвета темы приложения; меняются вместе с темой */
function useThemeColors(): Colors {
  const [c, setC] = useState(readColors);
  useEffect(() => {
    const mo = new MutationObserver(() => setC(readColors()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);
  return c;
}

// чаша тазового дна — нижняя часть сферы, открытая вверх; купол диафрагмы — верхняя, открытая вниз
const bowl = new THREE.SphereGeometry(0.07, 40, 16, 0, Math.PI * 2, Math.PI * 0.6, Math.PI * 0.4);
const dome = new THREE.SphereGeometry(0.13, 40, 12, 0, Math.PI * 2, 0, Math.PI * 0.36);
const ring = new THREE.TorusGeometry(0.016, 0.006, 16, 48);
const cone = new THREE.ConeGeometry(0.009, 0.022, 16);
const sphere = new THREE.SphereGeometry(1, 24, 16);
const box = new THREE.BoxGeometry(1, 1, 1);

function Label({ position, children, color }: { position: Vec3; children: string; color: string }) {
  return (
    <Html position={position} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
      <span style={{ color, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', textShadow: '0 0 4px var(--bg), 0 0 2px var(--bg)' }}>{children}</span>
    </Html>
  );
}

function Athlete({ inst, meta, motion, colors, xray, layout }: {
  inst: Instance; meta: AthleteMeta; motion: RefObject<FigureMotion>; colors: Colors; xray: boolean; layout: ReturnType<typeof applyPose>;
}) {
  const floorRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const arrowsRef = useRef<THREE.Group>(null);
  const diaRef = useRef<THREE.Mesh>(null);
  const tmp = useMemo(() => new THREE.Color(), []);
  const L = meta.landmarks;

  const skin = useMemo(() => new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.58, sheen: 0.35, sheenRoughness: 0.55, sheenColor: new THREE.Color('#ffd2bd'),
    transparent: xray, opacity: xray ? 0.38 : 1, depthWrite: !xray,
  }), [xray]);
  useEffect(() => { inst.mesh.material = skin; return () => skin.dispose(); }, [inst, skin]);

  // органы рисуются поверх тела, как подсветка
  const m = useMemo(() => ({
    floor: new THREE.MeshStandardMaterial({ color: colors.calm, emissive: colors.calm, emissiveIntensity: 0.5, roughness: 0.4, side: THREE.DoubleSide, transparent: true, opacity: 0.92, depthTest: false }),
    ring: new THREE.MeshStandardMaterial({ color: colors.squeeze, emissive: colors.squeeze, emissiveIntensity: 0.6, roughness: 0.3, transparent: true, opacity: 0.95, depthTest: false }),
    dia: new THREE.MeshStandardMaterial({ color: colors.breath, emissive: colors.breath, emissiveIntensity: 0.45, transparent: true, opacity: 0.7, side: THREE.DoubleSide, roughness: 0.4, depthTest: false }),
    arrow: new THREE.MeshBasicMaterial({ color: colors.squeeze, transparent: true, opacity: 0, depthTest: false }),
    sclera: new THREE.MeshStandardMaterial({ color: '#f4f1ec', roughness: 0.25 }),
    iris: new THREE.MeshStandardMaterial({ color: '#4a3324', roughness: 0.3 }),
    pupil: new THREE.MeshStandardMaterial({ color: '#0c0a09', roughness: 0.15 }),
  }), [colors]);
  useEffect(() => () => Object.values(m).forEach(x => x.dispose()), [m]);
  // в общем виде органы чуть прозрачнее, чтобы не спорить с телом
  useEffect(() => {
    m.floor.opacity = xray ? 0.92 : 0.8;
    m.dia.opacity = xray ? 0.7 : 0.5;
  }, [m, xray]);

  const pelvisRest = rest(meta, 'pelvis'), spineRest = rest(meta, 'spine_02'), headRest = rest(meta, 'head');
  const floorPos = new THREE.Vector3(0, L.crotch[1] + 0.055, L.crotch[2]).sub(pelvisRest);
  const ringPos = new THREE.Vector3(0, L.crotch[1] + 0.03, L.crotch[2] - 0.045).sub(pelvisRest);
  const diaPos = new THREE.Vector3(0, L.spine03[1] + 0.03, L.spine03[2] + 0.07).sub(spineRest);

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
    if (diaRef.current) {
      diaRef.current.position.y = diaPos.y - 0.035 * b;
      diaRef.current.scale.set(1, 0.6 * (1 - 0.35 * b), 0.72);
    }
    if (floorRef.current) {
      floorRef.current.position.y = floorPos.y + 0.022 * sq - 0.014 * bFloor;
      floorRef.current.scale.set(1 - 0.08 * sq, 0.6 * (1 - 0.45 * sq) * (1 + 0.35 * bFloor), 1.15 * (1 - 0.08 * sq));
      tmp.copy(colors.calm).lerp(colors.squeeze, sq).lerp(colors.breath, 0.35 * bFloor);
      m.floor.color.copy(tmp);
      m.floor.emissive.copy(tmp);
      m.floor.emissiveIntensity = 0.45 + 0.5 * sq;
    }
    if (ringRef.current) {
      const k = (1 - 0.42 * sq) * (1 + 0.15 * bFloor);
      ringRef.current.scale.set(k, k, 1 + 0.4 * sq);
      ringRef.current.position.y = ringPos.y + 0.022 * sq - 0.01 * bFloor;
    }
    if (arrowsRef.current) {
      m.arrow.opacity = sq * 0.9;
      arrowsRef.current.position.y = floorPos.y - 0.075 + 0.035 * ((t * 0.9) % 1) * Math.min(1, sq * 2);
    }
  });

  return (
    <group position={layout.position} rotation={layout.rotation}>
      <primitive object={inst.mesh} />
      {createPortal(
        <>
          <mesh ref={floorRef} geometry={bowl} material={m.floor} position={floorPos} scale={[1, 0.6, 1.15]} renderOrder={10} />
          <mesh ref={ringRef} geometry={ring} material={m.ring} position={ringPos} rotation={[Math.PI / 2, 0, 0]} renderOrder={11} />
          <group ref={arrowsRef} position={[floorPos.x, floorPos.y - 0.075, floorPos.z]}>
            {[-0.03, 0, 0.03].map(x => <mesh key={x} geometry={cone} material={m.arrow} position={[x, 0, x === 0 ? -0.02 : 0.005]} renderOrder={12} />)}
          </group>
          {xray && (
            <>
              <Label position={[0.15, floorPos.y + 0.02, floorPos.z]} color={colors.ink}>тазовое дно</Label>
              <Label position={[-0.12, ringPos.y - 0.045, ringPos.z]} color={colors.ink}>сфинктер</Label>
            </>
          )}
        </>,
        inst.by.pelvis,
      )}
      {createPortal(
        <>
          <mesh ref={diaRef} geometry={dome} material={m.dia} position={diaPos} scale={[1, 0.6, 0.72]} renderOrder={10} />
          {xray && <Label position={[0.17, diaPos.y, diaPos.z]} color={colors.ink}>диафрагма</Label>}
        </>,
        inst.by.spine_02,
      )}
      {createPortal(
        <>
          {meta.eyes.map((e, i) => {
            const c = new THREE.Vector3(...e.c).sub(headRest);
            return (
              <group key={i} position={c}>
                <mesh geometry={sphere} material={m.sclera} scale={e.r * 0.94} />
                <mesh geometry={sphere} material={m.iris} position={[0, 0, e.r * 0.78]} scale={[e.r * 0.48, e.r * 0.48, e.r * 0.2]} />
                <mesh geometry={sphere} material={m.pupil} position={[0, 0, e.r * 0.88]} scale={[e.r * 0.22, e.r * 0.22, e.r * 0.12]} />
              </group>
            );
          })}
        </>,
        inst.by.head,
      )}
    </group>
  );
}

function Props({ pose, colors, seat }: { pose: FigurePose; colors: Colors; seat: number }) {
  const mat = useMemo(() => colors.calm.clone().lerp(colors.floor, 0.78), [colors]);
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]}>
        <circleGeometry args={[1.35, 64]} />
        <meshStandardMaterial color={colors.floor} roughness={1} />
      </mesh>
      {pose === 'lying' && (
        <mesh position={[0, 0.006, 0]} geometry={box} scale={[0.7, 0.012, 2.0]}>
          <meshStandardMaterial color={mat} roughness={0.9} />
        </mesh>
      )}
      {pose === 'sitting' && (
        <mesh position={[0, seat / 2, -0.05]}>
          <cylinderGeometry args={[0.21, 0.19, seat, 40]} />
          <meshStandardMaterial color={colors.prop} roughness={0.7} />
        </mesh>
      )}
    </>
  );
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

export default function Figure3D({ motion, pose, zoom = 'body', autoRotate = false, className = '' }: {
  motion: RefObject<FigureMotion>;
  pose: FigurePose;
  zoom?: FigureZoom;
  autoRotate?: boolean;
  className?: string;
}) {
  const data = use(loadAthlete());
  const inst = useMemo(() => createInstance(data), [data]);
  const layout = useMemo(() => applyPose(inst, data.meta, pose), [inst, data, pose]);
  const view = layout.camera[zoom];
  const colors = useThemeColors();
  const controls = useRef<OrbitControlsImpl>(null);
  // начальная точка камеры; дальше камеру ведёт CameraRig, чтобы смена вида шла плавно
  const [start] = useState(() => view);
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const L = data.meta.landmarks;
  const seat = L.hipY + layout.position[1] - 0.08;

  return (
    <div className={`relative ${className}`}>
      <Canvas
        dpr={[1, 2]}
        camera={{ position: start.pos, fov: 32, near: 0.05, far: 30 }}
        gl={{ antialias: true, alpha: true }}
        style={{ touchAction: 'pan-y' }}
        fallback={<div className="grid size-full place-items-center text-[14px] text-muted">3D недоступно на этом устройстве</div>}
      >
        <hemisphereLight args={['#fff6ee', colors.dark ? '#1a2540' : '#c9d2e0', 1.0]} />
        <directionalLight position={[2.5, 4, 3]} intensity={1.6} color="#fff1e6" />
        <directionalLight position={[-3, 2.5, 1.5]} intensity={0.55} color="#dfe8ff" />
        <directionalLight position={[0, 3, -3.5]} intensity={0.9} color="#ffffff" />
        <Athlete inst={inst} meta={data.meta} motion={motion} colors={colors} xray={zoom === 'pelvis'} layout={layout} />
        <Props pose={pose} colors={colors} seat={seat} />
        <ContactShadows key={pose} position={[0, 0.001, 0]} scale={3.2} blur={2.2} opacity={colors.dark ? 0.6 : 0.35} far={1.8} resolution={512} frames={1} />
        <OrbitControls
          ref={controls}
          target={start.target}
          enablePan={false}
          enableZoom
          minDistance={0.45}
          maxDistance={6}
          minPolarAngle={0.15}
          maxPolarAngle={Math.PI / 2 - 0.04}
          enableDamping
          autoRotate={autoRotate && !reduced}
          autoRotateSpeed={0.7}
        />
        <CameraRig view={view} controls={controls} />
      </Canvas>
    </div>
  );
}

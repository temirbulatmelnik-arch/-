// 3D-фигура для упражнений: человек в положении лёжа, сидя или стоя, туловище полупрозрачное.
// Внутри видны диафрагма (голубой купол), тазовое дно (чаша) и кольцо сфинктера.
// Вдох: живот расширяется, диафрагма и тазовое дно опускаются. Сжатие: чаша поднимается и уплощается,
// кольцо сужается и уходит вверх. Во время удержаний фигура спокойно дышит — как и нужно делать.
import { ContactShadows, Html, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { Phase } from '../engine/timeline';

export interface FigureMotion { level: number; phase: Phase }
export type FigurePose = 'lying' | 'sitting' | 'standing';
export type FigureZoom = 'body' | 'pelvis';

const THIGH = 0.44, SHIN = 0.43, UPPER = 0.29, FORE = 0.27;

interface PoseDef {
  root: [number, number, number];
  rootTilt: number;
  hip: number;
  hipSpread: number;
  knee: number;
  /** угол стопы относительно тела: 0 — стоя на полу, π/2 — лёжа, стопа на полу */
  footWorld: number;
  shoulderX: number;
  shoulderZ: number;
  elbow: number;
  prop: 'mat' | 'stool' | 'none';
  camera: Record<FigureZoom, { pos: [number, number, number]; target: [number, number, number] }>;
}

const POSES: Record<FigurePose, PoseDef> = {
  standing: {
    root: [0, 1.0, 0], rootTilt: 0, hip: 0, hipSpread: 0.05, knee: 0, footWorld: 0,
    shoulderX: 0, shoulderZ: 0.12, elbow: -0.15, prop: 'none',
    camera: { body: { pos: [1.9, 1.45, 2.8], target: [0, 0.95, 0] }, pelvis: { pos: [0.95, 1.4, 1.15], target: [0, 1.16, 0] } },
  },
  sitting: {
    root: [0, 0.575, 0], rootTilt: 0, hip: -Math.PI / 2, hipSpread: 0.12, knee: Math.PI / 2, footWorld: 0,
    shoulderX: 0, shoulderZ: 0.08, elbow: -0.8, prop: 'stool',
    camera: { body: { pos: [1.85, 1.3, 2.4], target: [0, 0.75, 0.1] }, pelvis: { pos: [0.95, 0.98, 1.1], target: [0, 0.74, 0.02] } },
  },
  lying: {
    root: [0, 0.12, 0], rootTilt: -Math.PI / 2, hip: -0.85, hipSpread: 0.14, knee: 2.0, footWorld: Math.PI / 2,
    shoulderX: 0, shoulderZ: 0.2, elbow: 0, prop: 'mat',
    camera: { body: { pos: [2.0, 1.7, 0.8], target: [0, 0.15, -0.3] }, pelvis: { pos: [0.95, 0.85, 0.45], target: [0, 0.14, -0.17] } },
  },
};

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
    body: new THREE.Color(dark ? '#c3ccdc' : '#94a3ba'),
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

const sphere = new THREE.SphereGeometry(1, 32, 24);
// чаша тазового дна — нижняя часть сферы, открытая вверх
const bowl = new THREE.SphereGeometry(0.14, 40, 16, 0, Math.PI * 2, Math.PI * 0.6, Math.PI * 0.4);
// купол диафрагмы — верхняя часть сферы, открытая вниз
const dome = new THREE.SphereGeometry(0.15, 40, 12, 0, Math.PI * 2, 0, Math.PI * 0.36);
const ring = new THREE.TorusGeometry(0.032, 0.011, 16, 48);
const cone = new THREE.ConeGeometry(0.016, 0.04, 16);
const box = new THREE.BoxGeometry(1, 1, 1);

function Limb({ length, radius, material }: { length: number; radius: number; material: THREE.Material }) {
  const geo = useMemo(() => new THREE.CapsuleGeometry(radius, Math.max(0.01, length - radius), 8, 16), [length, radius]);
  return <mesh geometry={geo} material={material} position={[0, -length / 2, 0]} />;
}

function Label({ position, children, color }: { position: [number, number, number]; children: string; color: string }) {
  return (
    <Html position={position} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
      <span style={{ color, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', textShadow: '0 0 4px var(--bg), 0 0 2px var(--bg)' }}>{children}</span>
    </Html>
  );
}

function Body({ pose, motion, colors, xray }: { pose: FigurePose; motion: RefObject<FigureMotion>; colors: Colors; xray: boolean }) {
  const labels = xray;
  const P = POSES[pose];
  const floorRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const arrowsRef = useRef<THREE.Group>(null);
  const bellyRef = useRef<THREE.Mesh>(null);
  const chestRef = useRef<THREE.Mesh>(null);
  const diaRef = useRef<THREE.Mesh>(null);
  const tmp = useMemo(() => new THREE.Color(), []);

  const m = useMemo(() => ({
    skin: new THREE.MeshStandardMaterial({ color: colors.body, roughness: 0.55, transparent: xray, opacity: xray ? 0.32 : 1, depthWrite: !xray }),
    glass: new THREE.MeshStandardMaterial({ color: colors.body, roughness: 0.2, transparent: true, opacity: colors.dark ? 0.2 : 0.28, depthWrite: false }),
    spine: new THREE.MeshStandardMaterial({ color: colors.body, roughness: 0.6, transparent: true, opacity: 0.5 }),
    floor: new THREE.MeshStandardMaterial({ color: colors.calm, emissive: colors.calm, emissiveIntensity: 0.35, roughness: 0.4, side: THREE.DoubleSide }),
    ring: new THREE.MeshStandardMaterial({ color: colors.squeeze, emissive: colors.squeeze, emissiveIntensity: 0.5, roughness: 0.3 }),
    dia: new THREE.MeshStandardMaterial({ color: colors.breath, emissive: colors.breath, emissiveIntensity: 0.3, transparent: true, opacity: 0.8, side: THREE.DoubleSide, roughness: 0.4 }),
    arrow: new THREE.MeshBasicMaterial({ color: colors.squeeze, transparent: true, opacity: 0 }),
  }), [colors, xray]);
  useEffect(() => () => Object.values(m).forEach(x => x.dispose()), [m]);

  useFrame(state => {
    const mo = motion.current;
    if (!mo) return;
    const t = state.clock.elapsedTime;
    const sq = Math.max(0, mo.level);
    const breathing = mo.phase === 'inhale' || mo.phase === 'exhale';
    // вдох: в дыхательных упражнениях — по ленте, иначе спокойное фоновое дыхание (раз в 5 с)
    const b = breathing ? THREE.MathUtils.clamp(-mo.level / 0.25, 0, 1) : 0.35 * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / 5));
    const bFloor = breathing ? b : 0;

    bellyRef.current?.scale.set(0.15 * (1 + 0.06 * b), 0.13 * (1 + 0.04 * b), 0.12 * (1 + 0.24 * b));
    bellyRef.current?.position.set(0, 0.17, 0.01 + 0.02 * b);
    chestRef.current?.scale.set(0.18 * (1 + 0.03 * b), 0.17 * (1 + 0.02 * b), 0.12 * (1 + 0.05 * b));
    if (diaRef.current) {
      diaRef.current.position.y = -0.06 - 0.05 * b;
      diaRef.current.scale.set(1, 0.6 * (1 - 0.35 * b), 0.75);
    }
    if (floorRef.current) {
      floorRef.current.position.y = 0.02 + 0.04 * sq - 0.025 * bFloor;
      floorRef.current.scale.set(1 - 0.08 * sq, 0.6 * (1 - 0.45 * sq) * (1 + 0.35 * bFloor), 0.85 * (1 - 0.08 * sq));
      tmp.copy(colors.calm).lerp(colors.squeeze, sq).lerp(colors.breath, 0.35 * bFloor);
      m.floor.color.copy(tmp);
      m.floor.emissive.copy(tmp);
      m.floor.emissiveIntensity = 0.3 + 0.5 * sq;
    }
    if (ringRef.current) {
      const k = (1 - 0.42 * sq) * (1 + 0.15 * bFloor);
      ringRef.current.scale.set(k, k, 1 + 0.4 * sq);
      ringRef.current.position.y = -0.075 + 0.04 * sq - 0.02 * bFloor;
    }
    if (arrowsRef.current) {
      m.arrow.opacity = sq * 0.9;
      arrowsRef.current.position.y = -0.15 + 0.06 * ((t * 0.9) % 1) * Math.min(1, sq * 2);
    }
  });

  const footRot = P.footWorld - (P.hip + P.knee);

  return (
    <group position={P.root} rotation={[P.rootTilt, 0, 0]}>
      {/* таз */}
      <mesh geometry={sphere} material={m.glass} scale={[0.17, 0.12, 0.12]} renderOrder={2} />
      <mesh ref={floorRef} geometry={bowl} material={m.floor} position={[0, 0.02, 0]} scale={[1, 0.6, 0.85]} />
      <mesh ref={ringRef} geometry={ring} material={m.ring} position={[0, -0.075, -0.045]} rotation={[Math.PI / 2, 0, 0]} />
      <group ref={arrowsRef}>
        {[-0.06, 0, 0.06].map(x => <mesh key={x} geometry={cone} material={m.arrow} position={[x, 0, x === 0 ? -0.03 : 0.01]} />)}
      </group>
      {labels && (
        <>
          <Label position={[0.23, 0.0, 0]} color={colors.ink}>тазовое дно</Label>
          <Label position={[-0.16, -0.12, -0.06]} color={colors.ink}>сфинктер</Label>
        </>
      )}
      {/* позвоночник */}
      <mesh geometry={sphere} material={m.spine} position={[0, 0.3, -0.09]} scale={[0.022, 0.32, 0.022]} />
      {/* ноги */}
      {[-1, 1].map(side => (
        <group key={side} position={[0.09 * side, -0.07, 0]} rotation={[P.hip, 0, P.hipSpread * side]}>
          <Limb length={THIGH} radius={0.065} material={m.skin} />
          <group position={[0, -THIGH, 0]} rotation={[P.knee, 0, -P.hipSpread * side]}>
            <Limb length={SHIN} radius={0.05} material={m.skin} />
            <group position={[0, -SHIN, 0]} rotation={[footRot, 0, 0]}>
              <mesh geometry={box} material={m.skin} position={[0, -0.03, 0.06]} scale={[0.09, 0.06, 0.24]} />
            </group>
          </group>
        </group>
      ))}
      {/* живот */}
      <mesh ref={bellyRef} geometry={sphere} material={m.glass} position={[0, 0.17, 0.01]} scale={[0.15, 0.13, 0.12]} renderOrder={2} />
      {/* грудь, голова, руки */}
      <group position={[0, 0.4, 0]}>
        <mesh ref={chestRef} geometry={sphere} material={m.glass} scale={[0.18, 0.17, 0.12]} renderOrder={2} />
        <mesh ref={diaRef} geometry={dome} material={m.dia} position={[0, -0.06, 0]} scale={[1, 0.6, 0.75]} />
        {labels && <Label position={[0.24, -0.04, 0]} color={colors.ink}>диафрагма</Label>}
        <mesh geometry={sphere} material={m.skin} position={[0, 0.21, 0]} scale={[0.045, 0.06, 0.045]} />
        <mesh geometry={sphere} material={m.skin} position={[0, 0.34, 0.01]} scale={[0.095, 0.11, 0.1]} />
        <mesh geometry={sphere} material={m.skin} position={[0, 0.33, 0.105]} scale={[0.016, 0.022, 0.016]} />
        {[-1, 1].map(side => (
          <group key={side} position={[0.21 * side, 0.12, 0]} rotation={[P.shoulderX, 0, P.shoulderZ * side]}>
            <mesh geometry={sphere} material={m.skin} scale={0.05} />
            <Limb length={UPPER} radius={0.042} material={m.skin} />
            <group position={[0, -UPPER, 0]} rotation={[P.elbow, 0, 0]}>
              <Limb length={FORE} radius={0.036} material={m.skin} />
              <mesh geometry={sphere} material={m.skin} position={[0, -FORE - 0.03, 0]} scale={[0.035, 0.05, 0.022]} />
            </group>
          </group>
        ))}
      </group>
    </group>
  );
}

function Props({ pose, colors }: { pose: FigurePose; colors: Colors }) {
  const prop = POSES[pose].prop;
  const mat = useMemo(() => colors.calm.clone().lerp(colors.floor, 0.78), [colors]);
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]}>
        <circleGeometry args={[1.25, 64]} />
        <meshStandardMaterial color={colors.floor} roughness={1} />
      </mesh>
      {prop === 'mat' && (
        <mesh position={[0, 0.006, -0.35]} geometry={box} scale={[0.66, 0.012, 1.9]}>
          <meshStandardMaterial color={mat} roughness={0.9} />
        </mesh>
      )}
      {prop === 'stool' && (
        <mesh position={[0, 0.22, -0.02]}>
          <cylinderGeometry args={[0.2, 0.18, 0.44, 40]} />
          <meshStandardMaterial color={colors.prop} roughness={0.7} />
        </mesh>
      )}
    </>
  );
}

/** Плавный перелёт камеры при смене положения или масштаба */
function CameraRig({ pose, zoom, controls }: { pose: FigurePose; zoom: FigureZoom; controls: RefObject<OrbitControlsImpl | null> }) {
  const { camera } = useThree();
  const anim = useRef({ k: 1, fromPos: new THREE.Vector3(), fromTarget: new THREE.Vector3(), toPos: new THREE.Vector3(), toTarget: new THREE.Vector3() });

  useEffect(() => {
    const a = anim.current;
    const c = POSES[pose].camera[zoom];
    a.fromPos.copy(camera.position);
    a.fromTarget.copy(controls.current?.target ?? new THREE.Vector3(...c.target));
    a.toPos.set(...c.pos);
    a.toTarget.set(...c.target);
    a.k = 0;
  }, [pose, zoom, camera, controls]);

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
  const colors = useThemeColors();
  const controls = useRef<OrbitControlsImpl>(null);
  // начальная точка камеры; дальше камеру ведёт CameraRig, чтобы смена вида шла плавно
  const [start] = useState(() => POSES[pose].camera[zoom]);
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <div className={`relative ${className}`}>
      <Canvas
        dpr={[1, 2]}
        camera={{ position: start.pos, fov: 35, near: 0.05, far: 20 }}
        gl={{ antialias: true, alpha: true }}
        style={{ touchAction: 'pan-y' }}
        fallback={<div className="grid size-full place-items-center text-[14px] text-muted">3D недоступно на этом устройстве</div>}
      >
        <hemisphereLight args={['#ffffff', colors.dark ? '#1a2540' : '#c9d2e0', 1.1]} />
        <directionalLight position={[2, 4, 3]} intensity={1.4} />
        <directionalLight position={[-2, 2, -2]} intensity={0.4} />
        <Body pose={pose} motion={motion} colors={colors} xray={zoom === 'pelvis'} />
        <Props pose={pose} colors={colors} />
        <ContactShadows key={pose} position={[0, 0.001, 0]} scale={3} blur={2.2} opacity={colors.dark ? 0.6 : 0.35} far={1.6} resolution={512} frames={1} />
        <OrbitControls
          ref={controls}
          target={start.target}
          enablePan={false}
          enableZoom
          minDistance={0.45}
          maxDistance={5}
          minPolarAngle={0.15}
          maxPolarAngle={Math.PI / 2 - 0.04}
          enableDamping
          autoRotate={autoRotate && !reduced}
          autoRotateSpeed={0.7}
        />
        <CameraRig pose={pose} zoom={zoom} controls={controls} />
      </Canvas>
    </div>
  );
}

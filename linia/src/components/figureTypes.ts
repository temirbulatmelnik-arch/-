import type { Anim, Pose } from '../engine/exercises';
import type { MuscleMap } from '../engine/muscles';
import type { Phase, Side } from '../engine/timeline';

/** amount — ход движения 0…1, side — сторона в упражнениях на одну сторону */
export interface FigureMotion { anim: Anim; amount: number; phase: Phase; side?: Side }
/** что в кадре: лицо и шея, шея, верх тела, тело целиком */
export type FigureView = 'face' | 'neck' | 'upper' | 'body';

export interface FigureProps {
  motion: { current: FigureMotion };
  pose: Pose;
  view: FigureView;
  /** вид насквозь: кожа полупрозрачная, внутри мышцы и кости */
  xray: boolean;
  /** какие мышцы подсвечивать: работают — тёплым, растягиваются — холодным */
  muscles?: MuscleMap;
  autoRotate?: boolean;
  className?: string;
}

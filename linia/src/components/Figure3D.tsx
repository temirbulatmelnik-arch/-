// Временная заглушка: 3D-фигура собирается отдельно (tools/build-figure.py).
import type { FigureProps } from './figureTypes';

export default function Figure3D({ className = '' }: FigureProps) {
  return <div className={`grid place-items-center text-[13px] text-muted ${className}`}>3D-модель готовится</div>;
}

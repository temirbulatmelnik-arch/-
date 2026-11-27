import { useEffect, useRef } from 'react';

// Repeated contour, with whole periods in each half so the loop has no seam.
const CONTOUR = 'M0 4 Q7.5 1 15 4 T30 4 T45 4 T60 4 T75 4 T90 4 T105 4 T120 4';

export function WaterSurface({ color, fill }: { color: string; fill?: string }) {
  return (
    <span className="nv-wave" aria-hidden="true">
      <svg viewBox="0 0 120 8" preserveAspectRatio="none" focusable="false">
        {fill && <path d={CONTOUR + ' V8 H0 Z'} fill={fill} />}
        <path d={CONTOUR} fill="none" stroke={color} strokeWidth="1.25" vectorEffect="non-scaling-stroke" />
      </svg>
    </span>
  );
}

export function HarborCurrents() {
  const ref = useVisibleWaves<HTMLDivElement>();

  return (
    <div ref={ref} className="nv-harbor-currents" aria-hidden="true">
      <div className="nv-current nv-current-deep">
        <svg viewBox="0 0 480 560" preserveAspectRatio="none" focusable="false">
          <defs>
            <linearGradient id="nv-current-depth" x2="0" y2="1">
              <stop offset="0" stopColor="var(--nv-current-teal)" stopOpacity="0" />
              <stop offset=".38" stopColor="var(--nv-current-teal)" />
              <stop offset=".68" stopColor="var(--nv-current-violet)" />
              <stop offset="1" stopColor="var(--nv-current-violet)" stopOpacity="0" />
            </linearGradient>
            <pattern id="nv-current-bands" width="480" height="112" patternUnits="userSpaceOnUse">
              <path d="M0 31C80 53 144 9 240 16C328 21 386 47 480 26V81C379 100 320 71 238 70C150 69 80 105 0 85Z" fill="url(#nv-current-depth)" />
            </pattern>
          </defs>
          <rect width="480" height="560" fill="url(#nv-current-bands)" />
        </svg>
      </div>
      <div className="nv-current nv-current-surface">
        <svg viewBox="0 0 480 560" preserveAspectRatio="none" focusable="false">
          <defs>
            <linearGradient id="nv-current-glint">
              <stop offset="0" stopColor="var(--nv-current-foam)" stopOpacity="0" />
              <stop offset=".25" stopColor="var(--nv-current-foam)" />
              <stop offset=".55" stopColor="var(--nv-current-gold)" />
              <stop offset=".82" stopColor="var(--nv-current-foam)" />
              <stop offset="1" stopColor="var(--nv-current-foam)" stopOpacity="0" />
            </linearGradient>
            <pattern id="nv-current-creases" width="480" height="112" y="34" patternUnits="userSpaceOnUse">
              <g fill="none" stroke="url(#nv-current-glint)">
                <path d="M0 47C95 58 159 18 255 26C349 34 393 58 480 38" strokeWidth="1.05" />
                <path d="M0 57C89 73 163 32 252 39C344 46 398 71 480 48" strokeWidth=".7" opacity=".55" />
              </g>
            </pattern>
          </defs>
          <rect width="480" height="560" fill="url(#nv-current-creases)" />
        </svg>
      </div>
    </div>
  );
}

export function useVisibleWaves<T extends HTMLElement>(enabled = true) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const group = ref.current;
    if (!group || !enabled) return;
    let visible = false;
    const update = () => group.toggleAttribute('data-wave-running', visible && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting && entry.intersectionRatio > 0;
      update();
    });
    observer.observe(group);
    document.addEventListener('visibilitychange', update);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
      group.removeAttribute('data-wave-running');
    };
  }, [enabled]);
  return ref;
}

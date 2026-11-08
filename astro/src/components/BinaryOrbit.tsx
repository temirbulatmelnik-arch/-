// Образ пары: две звезды на общей орбите (в перспективе — дальняя чуть меньше и тусклее).
// Чем больше нежности, тем ближе орбита; страсть ускоряет; конфликтность окрашивает ореол.
import { useInView, useReducedMotion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { isCalm, scrollingNow } from './frameGate';

export function BinaryOrbit({ tender, conflict, passion }: { tender: number; conflict: number; passion: number }) {
  const reduce = useReducedMotion();
  const a = useRef<SVGGElement>(null), b = useRef<SVGGElement>(null);
  const box = useRef<SVGSVGElement>(null);
  const visible = useInView(box);
  const r = 50 - tender * 7;
  const period = (26 - passion * 5) * 1000;
  const aura = conflict >= 1.2 ? 'rgba(255,128,100,.32)' : conflict >= 0.5 ? 'rgba(242,190,120,.24)' : 'rgba(140,170,255,.22)';
  // 25 кадров/с, только пока орбита на экране; во время прокрутки — реже
  useEffect(() => {
    if (!visible) return;
    let timer = 0, raf = 0;
    const place = (el: SVGGElement | null, th: number, phase: number) => {
      if (!el) return;
      const x = Math.cos(th + phase) * r, y = Math.sin(th + phase) * r * 0.38;
      const depth = 0.82 + 0.18 * Math.sin(th + phase);
      el.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${depth.toFixed(3)})`);
      el.style.opacity = String(0.65 + 0.35 * depth);
    };
    const tick = (t: number) => {
      const still = reduce || isCalm();
      const th = still ? 0.6 : (t / period) * Math.PI * 2;
      place(a.current, th, 0); place(b.current, th, Math.PI);
      if (!still) timer = window.setTimeout(() => { raf = requestAnimationFrame(tick); }, scrollingNow() ? 250 : 40);
    };
    raf = requestAnimationFrame(tick);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
  }, [visible, r, period, reduce]);
  return (
    <svg ref={box} viewBox="-120 -70 240 140" className="mx-auto block w-full max-w-[360px]" aria-hidden="true">
      <defs>
        <radialGradient id="me-star"><stop offset="0" stopColor="#fff6dc" /><stop offset=".3" stopColor="#f2cf86" /><stop offset="1" stopColor="rgba(242,207,134,0)" /></radialGradient>
        <radialGradient id="him-star"><stop offset="0" stopColor="#f2f5ff" /><stop offset=".3" stopColor="#9fb4ff" /><stop offset="1" stopColor="rgba(159,180,255,0)" /></radialGradient>
        <radialGradient id="aura"><stop offset="0" stopColor={aura} /><stop offset="1" stopColor="rgba(0,0,0,0)" /></radialGradient>
      </defs>
      <circle r="70" fill="url(#aura)" />
      <ellipse rx={r} ry={r * 0.38} fill="none" stroke="var(--brass)" strokeOpacity=".4" strokeDasharray="2 4" />
      <circle r="1.6" fill="var(--brass)" opacity=".7" />
      <g ref={a}><circle r="17" fill="url(#me-star)" /><circle r="3.8" fill="#fffaf0" /></g>
      <g ref={b}><circle r="15" fill="url(#him-star)" /><circle r="3.3" fill="#ffffff" /></g>
    </svg>
  );
}

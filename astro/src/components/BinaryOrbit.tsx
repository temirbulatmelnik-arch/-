// Образ пары: две звезды на общей орбите (в перспективе — дальняя чуть меньше и тусклее).
// Чем больше нежности, тем ближе орбита; страсть ускоряет; конфликтность окрашивает ореол.
import { motion, useAnimationFrame, useReducedMotion } from 'motion/react';
import { useRef } from 'react';

export function BinaryOrbit({ tender, conflict, passion }: { tender: number; conflict: number; passion: number }) {
  const reduce = useReducedMotion();
  const a = useRef<SVGGElement>(null), b = useRef<SVGGElement>(null);
  const r = 50 - tender * 7;
  const period = (26 - passion * 5) * 1000;
  const aura = conflict >= 1.2 ? 'rgba(255,128,100,.32)' : conflict >= 0.5 ? 'rgba(242,190,120,.24)' : 'rgba(140,170,255,.22)';
  useAnimationFrame(t => {
    const th = reduce ? 0.6 : (t / period) * Math.PI * 2;
    const place = (el: SVGGElement | null, phase: number) => {
      if (!el) return;
      const x = Math.cos(th + phase) * r, y = Math.sin(th + phase) * r * 0.38;
      const depth = 0.82 + 0.18 * Math.sin(th + phase);
      el.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${depth.toFixed(3)})`);
      el.style.opacity = String(0.65 + 0.35 * depth);
    };
    place(a.current, 0); place(b.current, Math.PI);
  });
  return (
    <svg viewBox="-120 -70 240 140" className="mx-auto block w-full max-w-[360px]" aria-hidden="true">
      <defs>
        <radialGradient id="me-star"><stop offset="0" stopColor="#fff6dc" /><stop offset=".3" stopColor="#f2cf86" /><stop offset="1" stopColor="rgba(242,207,134,0)" /></radialGradient>
        <radialGradient id="him-star"><stop offset="0" stopColor="#f2f5ff" /><stop offset=".3" stopColor="#9fb4ff" /><stop offset="1" stopColor="rgba(159,180,255,0)" /></radialGradient>
        <radialGradient id="aura"><stop offset="0" stopColor={aura} /><stop offset="1" stopColor="rgba(0,0,0,0)" /></radialGradient>
      </defs>
      <motion.circle r="70" fill="url(#aura)" animate={reduce ? undefined : { scale: [1, 1.07, 1] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }} />
      <ellipse rx={r} ry={r * 0.38} fill="none" stroke="var(--brass)" strokeOpacity=".4" strokeDasharray="2 4" />
      <circle r="1.6" fill="var(--brass)" opacity=".7" />
      <g ref={a}><circle r="17" fill="url(#me-star)" /><circle r="3.8" fill="#fffaf0" /></g>
      <g ref={b}><circle r="15" fill="url(#him-star)" /><circle r="3.3" fill="#ffffff" /></g>
    </svg>
  );
}

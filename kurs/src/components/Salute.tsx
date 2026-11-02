// Салют над Невой — только в редкие важные моменты: закрыт долг, неделя закрыта в плюс, первое знакомство с новым видом
// (навык emil-design-eng: восторг живёт там, где событие редкое). Холст поверх всего, нажатия проходят сквозь.
// С «Уменьшением движения» — без салюта.
import { useEffect, useRef } from 'react';
import { haptic } from './haptics';

import type { SaluteSize } from '../store/events';

interface P { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; trail: [number, number][] }

const COLORS = ['#ffd49a', '#ffe9c9', '#ff9a63', '#9fe3f2', '#ffffff', '#c9b8ff'];

export function Salute() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0, parts: P[] = [], until = 0, launched = 0, bursts = 0, total = 0;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const burst = (w: number, h: number) => {
      const x = w * (0.2 + Math.random() * 0.6), y = h * (0.14 + Math.random() * 0.22);
      const color = COLORS[Math.floor(Math.random() * COLORS.length)], second = COLORS[Math.floor(Math.random() * COLORS.length)];
      const n = 46 + Math.floor(Math.random() * 18);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.12, sp = 2.2 + Math.random() * 2.6;
        parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.6, life: 0, max: 60 + Math.random() * 30, color: i % 3 ? color : second, size: 1.6 + Math.random() * 1.4, trail: [] });
      }
      haptic();
    };
    const frame = () => {
      const c = canvas.current;
      if (!c) return;
      const ctx = c.getContext('2d')!;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = window.innerWidth, h = window.innerHeight;
      if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const t = performance.now();
      if (bursts < total && t >= launched) { burst(w, h); bursts++; launched = t + 260 + Math.random() * 320; }
      ctx.globalCompositeOperation = 'lighter';
      parts = parts.filter(p => p.life < p.max);
      for (const p of parts) {
        p.trail.push([p.x, p.y]);
        if (p.trail.length > 5) p.trail.shift();
        p.vx *= 0.975; p.vy = p.vy * 0.975 + 0.045;
        p.x += p.vx; p.y += p.vy; p.life++;
        const k = 1 - p.life / p.max;
        ctx.strokeStyle = p.color; ctx.globalAlpha = k * 0.55; ctx.lineWidth = p.size * 0.8;
        ctx.beginPath(); ctx.moveTo(p.trail[0][0], p.trail[0][1]); for (const [tx, ty] of p.trail) ctx.lineTo(tx, ty); ctx.stroke();
        ctx.globalAlpha = k; ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.6 + k * 0.6), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (t < until || parts.length) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, w, h);
    };
    const on = (e: Event) => {
      if (reduce.matches) return;
      total = (e as CustomEvent<SaluteSize>).detail === 'big' ? 6 : 3;
      bursts = 0; launched = performance.now() + 120;
      until = performance.now() + 2600;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
    };
    window.addEventListener('kurs:salute', on);
    return () => { window.removeEventListener('kurs:salute', on); cancelAnimationFrame(raf); };
  }, []);
  return <canvas ref={canvas} aria-hidden="true" className="pointer-events-none fixed inset-0 z-[80] h-full w-full" />;
}

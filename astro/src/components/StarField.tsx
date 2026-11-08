// Живое небо (навыки algorithmic-art и canvas-api): звёзды с сидом медленно вращаются вокруг полюса над экраном,
// как на фотографиях звёздных треков; мерцание у каждой своё; изредка — метеор. Поля туманности — градиенты.
// Энергосбережение: 30 кадров/с, пауза в фоне, при «Уменьшении движения» — неподвижное небо.
import { useEffect, useRef } from 'react';

function rng(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
}

interface Star { r: number; a: number; size: number; tw: number; ph: number; hue: number }

export function StarField() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext('2d')!;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rand = rng(250497);
    let w = 0, h = 0, dpr = 1, stars: Star[] = [];
    const resize = () => {
      dpr = Math.min(2, devicePixelRatio || 1);
      w = innerWidth; h = innerHeight;
      cv.width = w * dpr; cv.height = h * dpr;
      cv.style.width = w + 'px'; cv.style.height = h + 'px';
      const R = Math.hypot(w, h) * 1.15;
      const n = Math.round((w * h) / 2600);
      stars = Array.from({ length: n }, () => {
        const m = rand();
        return { r: Math.sqrt(rand()) * R, a: rand() * Math.PI * 2, size: m > 0.985 ? 1.9 : m > 0.9 ? 1.25 : 0.7, tw: 0.6 + rand() * 2.2, ph: rand() * 6.28, hue: rand() };
      });
    };
    resize();
    addEventListener('resize', resize);
    let meteor: { x: number; y: number; vx: number; vy: number; life: number } | null = null;
    let nextMeteor = performance.now() + 7000;
    let raf = 0, last = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 33) return;
      last = now;
      const light = document.documentElement.classList.contains('light');
      const star = light ? '70, 80, 160' : '255, 255, 255';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      // полюс мира — над экраном слева: дуги вращения едва заметны
      const px = w * 0.3, py = -h * 0.35;
      const rot = reduce ? 0 : (now / 1000) * ((Math.PI * 2) / 2400); // оборот за 40 минут
      const t = now / 1000;
      for (const s of stars) {
        const a = s.a + rot;
        const x = px + Math.cos(a) * s.r, y = py + Math.sin(a) * s.r;
        if (x < -4 || x > w + 4 || y < -4 || y > h + 4) continue;
        const tw = reduce ? 0.8 : 0.55 + 0.45 * Math.sin(t * s.tw + s.ph);
        const alpha = (light ? 0.35 : 0.9) * tw * (s.size > 1 ? 1 : 0.75);
        if (s.size > 1.5 && !light) {
          const g = ctx.createRadialGradient(x, y, 0, x, y, 7);
          const col = s.hue > 0.6 ? '255, 214, 160' : s.hue > 0.3 ? '190, 205, 255' : '255, 255, 255';
          g.addColorStop(0, `rgba(${col}, ${0.55 * tw})`); g.addColorStop(1, `rgba(${col}, 0)`);
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 7, 0, 6.283); ctx.fill();
        }
        ctx.fillStyle = `rgba(${star}, ${alpha})`;
        ctx.beginPath(); ctx.arc(x, y, s.size * (light ? 0.9 : 1), 0, 6.283); ctx.fill();
      }
      if (!reduce && !light) {
        if (!meteor && now > nextMeteor) {
          const x = w * (0.2 + Math.random() * 0.8), y = h * Math.random() * 0.35;
          meteor = { x, y, vx: -(6 + Math.random() * 4), vy: 3 + Math.random() * 2, life: 1 };
          nextMeteor = now + 14000 + Math.random() * 16000;
        }
        if (meteor) {
          const m = meteor;
          const g = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * 12, m.y - m.vy * 12);
          g.addColorStop(0, `rgba(255, 246, 220, ${0.9 * m.life})`); g.addColorStop(1, 'rgba(255, 246, 220, 0)');
          ctx.strokeStyle = g; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x - m.vx * 12, m.y - m.vy * 12); ctx.stroke();
          m.x += m.vx; m.y += m.vy; m.life -= 0.03;
          if (m.life <= 0) meteor = null;
        }
      }
    };
    raf = requestAnimationFrame(draw);
    const vis = () => { cancelAnimationFrame(raf); if (document.visibilityState === 'visible') raf = requestAnimationFrame(draw); };
    document.addEventListener('visibilitychange', vis);
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', resize); document.removeEventListener('visibilitychange', vis); };
  }, []);
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10">
      <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 70% at 75% -10%, var(--sky-a) 0%, var(--sky-b) 45%, var(--sky-c) 100%)' }} />
      <div className="absolute inset-0 opacity-60" style={{ background: 'radial-gradient(40% 30% at 15% 55%, rgba(140, 90, 220, .16), transparent 70%), radial-gradient(35% 25% at 85% 80%, rgba(60, 150, 210, .12), transparent 70%)' }} />
      <canvas ref={ref} className="absolute inset-0" />
    </div>
  );
}

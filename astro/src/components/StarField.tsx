// Живое небо (навыки algorithmic-art и canvas-api): звёзды с сидом медленно вращаются вокруг полюса над экраном,
// мерцают, изредка пролетает метеор. Бережно к батарее: 15 кадров/с, яркие звёзды — готовые спрайты (без градиентов
// в каждом кадре), пауза во время прокрутки и в фоне; при «Уменьшении движения» — один неподвижный кадр.
import { useEffect, useRef } from 'react';
import { isCalm, onCalmChange, reducedMotion, scrollingNow } from './frameGate';

function rng(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
}
interface Star { r: number; a: number; size: number; tw: number; ph: number; sprite: number }

function makeSprite(col: string, dpr: number): HTMLCanvasElement {
  const s = Math.ceil(16 * dpr), c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!, h = s / 2;
  const gr = g.createRadialGradient(h, h, 0, h, h, h);
  gr.addColorStop(0, `rgba(${col}, 0.9)`); gr.addColorStop(0.18, `rgba(${col}, 0.55)`); gr.addColorStop(1, `rgba(${col}, 0)`);
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
  return c;
}

export function StarField() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext('2d')!;
    let reduce = reducedMotion() || isCalm();
    const rand = rng(250497);
    let w = 0, h = 0, dpr = 1, stars: Star[] = [], sprites: HTMLCanvasElement[] = [];
    const resize = () => {
      dpr = Math.min(2, devicePixelRatio || 1);
      w = innerWidth; h = innerHeight;
      cv.width = w * dpr; cv.height = h * dpr;
      cv.style.width = w + 'px'; cv.style.height = h + 'px';
      sprites = ['255, 214, 160', '190, 205, 255', '255, 255, 255'].map(c => makeSprite(c, dpr));
      const R = Math.hypot(w, h) * 1.15;
      const n = Math.round((w * h) / 3200);
      stars = Array.from({ length: n }, () => {
        const m = rand();
        return { r: Math.sqrt(rand()) * R, a: rand() * Math.PI * 2, size: m > 0.985 ? 1.9 : m > 0.9 ? 1.25 : 0.7, tw: 0.6 + rand() * 2.2, ph: rand() * 6.28, sprite: Math.floor(rand() * 3) };
      });
      draw(performance.now(), true);
    };
    let meteor: { x: number; y: number; vx: number; vy: number; life: number } | null = null;
    let nextMeteor = performance.now() + 9000;
    let raf = 0;
    function draw(now: number, force = false) {
      if (!force && scrollingNow()) return;
      const light = document.documentElement.classList.contains('light');
      const star = light ? '70, 80, 160' : '255, 255, 255';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const px = w * 0.3, py = -h * 0.35;
      const rot = reduce ? 0 : (now / 1000) * ((Math.PI * 2) / 2400);
      const t = now / 1000;
      ctx.fillStyle = `rgb(${star})`;
      for (const s of stars) {
        const a = s.a + rot;
        const x = px + Math.cos(a) * s.r, y = py + Math.sin(a) * s.r;
        if (x < -8 || x > w + 8 || y < -8 || y > h + 8) continue;
        const tw = reduce ? 0.8 : 0.55 + 0.45 * Math.sin(t * s.tw + s.ph);
        if (s.size > 1.5 && !light) { ctx.globalAlpha = tw; ctx.drawImage(sprites[s.sprite], x - 8, y - 8, 16, 16); }
        ctx.globalAlpha = (light ? 0.35 : 0.9) * tw * (s.size > 1 ? 1 : 0.75);
        ctx.fillRect(x - s.size / 2, y - s.size / 2, s.size, s.size);
      }
      ctx.globalAlpha = 1;
      if (!reduce && !light) {
        if (!meteor && now > nextMeteor) {
          meteor = { x: w * (0.2 + Math.random() * 0.8), y: h * Math.random() * 0.35, vx: -(12 + Math.random() * 6), vy: 6 + Math.random() * 3, life: 1 };
          nextMeteor = now + 16000 + Math.random() * 18000;
        }
        if (meteor) {
          const m = meteor;
          const g = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * 6, m.y - m.vy * 6);
          g.addColorStop(0, `rgba(255, 246, 220, ${0.9 * m.life})`); g.addColorStop(1, 'rgba(255, 246, 220, 0)');
          ctx.strokeStyle = g; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x - m.vx * 6, m.y - m.vy * 6); ctx.stroke();
          m.x += m.vx; m.y += m.vy; m.life -= 0.07;
          if (m.life <= 0) meteor = null;
        }
      }
    }
    // 15 кадров/с через setTimeout: между кадрами экран свободен
    let timer = 0;
    const loop = (now: number) => { draw(now, true); timer = window.setTimeout(() => { raf = requestAnimationFrame(loop); }, scrollingNow() ? 300 : 66); };
    const stop = () => { clearTimeout(timer); cancelAnimationFrame(raf); };
    resize();
    addEventListener('resize', resize);
    if (!reduce) raf = requestAnimationFrame(loop);
    const vis = () => { stop(); if (document.visibilityState === 'visible' && !reduce) raf = requestAnimationFrame(loop); };
    const offCalm = onCalmChange(() => { reduce = reducedMotion() || isCalm(); stop(); draw(performance.now(), true); if (!reduce) raf = requestAnimationFrame(loop); });
    document.addEventListener('visibilitychange', vis);
    return () => { stop(); offCalm(); removeEventListener('resize', resize); document.removeEventListener('visibilitychange', vis); };
  }, []);
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10">
      <canvas ref={ref} className="absolute inset-0" />
    </div>
  );
}

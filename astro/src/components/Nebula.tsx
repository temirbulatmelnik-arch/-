// Туманность (навык webgl): фрагментный шейдер с фрактальным шумом медленно течёт цветами стихии дня.
// Рисуется в половинном разрешении, 30 кадров/с, пауза в фоне; при «Уменьшении движения» — один неподвижный кадр.
// Без WebGL остаётся CSS-градиент под ней.
import { useEffect, useRef } from 'react';

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAG = `precision mediump float;
uniform vec2 r; uniform float t; uniform vec3 c1; uniform vec3 c2; uniform vec3 c3; uniform float light;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a*n(p); p = p*2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
void main(){
  vec2 uv = gl_FragCoord.xy / r; vec2 p = uv * vec2(r.x/r.y, 1.0) * 2.2;
  float tt = t * 0.025;
  vec2 q = vec2(fbm(p + tt), fbm(p + vec2(5.2, 1.3) - tt));
  float f = fbm(p + 2.4*q + vec2(tt*1.3, -tt));
  vec3 col = mix(c1, c2, smoothstep(0.25, 0.75, f));
  col = mix(col, c3, smoothstep(0.55, 0.95, q.y) * 0.75);
  float glow = smoothstep(0.45, 1.0, f) * 0.55;
  float vig = smoothstep(1.25, 0.2, length(uv - vec2(0.62, 0.78)));
  vec3 base = light > 0.5 ? vec3(0.93, 0.94, 0.99) : vec3(0.025, 0.03, 0.10);
  vec3 outc = light > 0.5 ? mix(base, col, 0.22 + glow*0.25) : base + col * (0.22 + glow) * (0.45 + 0.75*vig);
  gl_FragColor = vec4(outc, 1.0);
}`;

const hex = (s: string) => { const m = s.trim().replace('#', ''); const v = parseInt(m.length === 3 ? m.split('').map(x => x + x).join('') : m, 16); return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255]; };

export function Nebula() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const gl = cv.getContext('webgl', { antialias: false, premultipliedAlpha: false, powerPreference: 'low-power' });
    if (!gl) return;
    const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const pr = gl.createProgram()!;
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return;
    gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = (n: string) => gl.getUniformLocation(pr, n);
    const ur = U('r'), ut = U('t'), u1 = U('c1'), u2 = U('c2'), u3 = U('c3'), ul = U('light');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    // цвета плавно догоняют CSS-переменные стихии
    let cur = [hex('#3b2a8a'), hex('#1b5a9a'), hex('#b0508a')];
    const resize = () => { const k = 0.5; cv.width = Math.round(innerWidth * k); cv.height = Math.round(innerHeight * k); gl.viewport(0, 0, cv.width, cv.height); };
    resize(); addEventListener('resize', resize);
    let raf = 0, last = 0;
    const start = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < 33) return; last = now;
      const cs = getComputedStyle(document.documentElement);
      const target = ['--aura1', '--aura2', '--aura3'].map(v => hex(cs.getPropertyValue(v) || '#444488'));
      cur = cur.map((c, i) => c.map((x, j) => x + (target[i][j] - x) * 0.04));
      gl.uniform2f(ur, cv.width, cv.height);
      gl.uniform1f(ut, reduce ? 40 : (now - start) / 1000 + 40);
      gl.uniform3fv(u1, cur[0]); gl.uniform3fv(u2, cur[1]); gl.uniform3fv(u3, cur[2]);
      gl.uniform1f(ul, document.documentElement.classList.contains('light') ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (reduce && now - start > 2500) cancelAnimationFrame(raf);
    };
    raf = requestAnimationFrame(frame);
    const vis = () => { cancelAnimationFrame(raf); if (document.visibilityState === 'visible') raf = requestAnimationFrame(frame); };
    document.addEventListener('visibilitychange', vis);
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', resize); document.removeEventListener('visibilitychange', vis); };
  }, []);
  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none fixed inset-0 -z-20 h-full w-full" />;
}

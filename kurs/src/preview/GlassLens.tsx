import { useEffect, useRef } from 'react';

const snapshots = new Map<string, Promise<ImageData | null>>();

function snapshot(source: SVGSVGElement, width: number, height: number, density: number) {
  const clone = source.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  const theme = getComputedStyle(source);
  const svg = new XMLSerializer().serializeToString(clone)
    .replace(/var\((--[\w-]+)\)/g, (_, token: string) => theme.getPropertyValue(token).trim());
  const key = [source.id, width, height, density, svg].join(':');
  const cached = snapshots.get(key);
  if (cached) return cached;
  const pixels = new Promise<ImageData | null>(resolve => {
    const image = new Image();
    image.onerror = () => resolve(null);
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * density);
      canvas.height = Math.round(height * density);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      try {
        if (!ctx) return resolve(null);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
      } catch {
        resolve(null);
      }
    };
    image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
  if (snapshots.size >= 8) snapshots.delete(snapshots.keys().next().value!);
  snapshots.set(key, pixels);
  return pixels;
}

function refract(data: ImageData, ctx: CanvasRenderingContext2D, dx: number, dy: number,
  width: number, height: number, radius: number, bevel: number) {
  const output = ctx.createImageData(width, height);
  const rw = width / 2 - radius, rh = height / 2 - radius;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cx = x + .5 - width / 2, cy = y + .5 - height / 2;
      const qx = Math.abs(cx) - rw, qy = Math.abs(cy) - rh;
      const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
      const length = Math.hypot(ox, oy);
      const distance = radius - length - Math.min(Math.max(qx, qy), 0);
      const fraction = Math.min(1, Math.max(0, distance / bevel));
      const strength = bevel * .65 * Math.sin(Math.PI * fraction);
      const nx = (length ? ox / length : Number(qx > qy)) * Math.sign(cx);
      const ny = (length ? oy / length : Number(qy >= qx)) * Math.sign(cy);
      const sx = dx + x + nx * strength;
      const sy = dy + y + ny * strength;
      const left = Math.floor(sx), top = Math.floor(sy);
      if (left < 0 || top < 0 || left + 1 >= data.width || top + 1 >= data.height) continue;
      const fx = sx - left, fy = sy - top;
      const row = (top * data.width + left) * 4, below = row + data.width * 4;
      const index = (y * width + x) * 4;
      for (let channel = 0; channel < 4; channel++) {
        const above = data.data[row + channel] * (1 - fx) + data.data[row + channel + 4] * fx;
        const lower = data.data[below + channel] * (1 - fx) + data.data[below + channel + 4] * fx;
        output.data[index + channel] = above * (1 - fy) + lower * fy;
      }
    }
  }
  ctx.putImageData(output, 0, 0);
}

export function GlassLens() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const host = canvas?.parentElement?.parentElement;
    const source = host?.closest('[data-glass-scene]')?.querySelector<SVGSVGElement>('svg[data-glass-source]');
    const ctx = canvas?.getContext('2d');
    if (!canvas || !host || !source || !ctx) return;
    let frame = 0;
    let version = 0;
    const paint = () => {
      frame = 0;
      const revision = ++version;
      const rect = canvas.getBoundingClientRect();
      const scene = source.getBoundingClientRect();
      const width = canvas.clientWidth, height = canvas.clientHeight;
      if (!rect.width || !rect.height || !scene.width || !scene.height || !width || !height) return;
      const density = Math.min(devicePixelRatio || 1, 1.5);
      const radius = Math.min(parseFloat(getComputedStyle(host).borderTopLeftRadius) || 0, width / 2, height / 2);
      const bevel = Math.max(4, Math.min(10, Math.min(width, height) * .2));
      void snapshot(source, scene.width, scene.height, density).then(data => {
        if (revision !== version || !data) return;
        canvas.width = Math.round(width * density);
        canvas.height = Math.round(height * density);
        refract(data, ctx, (rect.left - scene.left) * density, (rect.top - scene.top) * density,
          canvas.width, canvas.height, radius * density, bevel * density);
        canvas.dataset.art = source.id;
      });
    };
    const queue = () => { if (!frame) frame = requestAnimationFrame(paint); };
    // Each source scrolls with its lens. Draw once per layout or theme change.
    const resize = new ResizeObserver(queue);
    resize.observe(host);
    resize.observe(source);
    const theme = new MutationObserver(queue);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    queue();
    return () => { resize.disconnect(); theme.disconnect(); cancelAnimationFrame(frame); version++; };
  }, []);

  return <span className="nv-optic" aria-hidden="true"><canvas ref={ref} /></span>;
}

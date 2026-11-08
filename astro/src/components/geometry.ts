// Геометрия колеса: Асцендент слева, долготы растут против часовой стрелки.
export const toXY = (lon: number, asc: number, r: number, cx = 0, cy = 0) => {
  const a = ((180 + lon - asc) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) };
};

/** раздвигает глифы, чтобы не налезали: возвращает отображаемые долготы */
export function spread(items: { id: string; lon: number }[], gap: number): Record<string, number> {
  const s = [...items].sort((a, b) => a.lon - b.lon).map(x => ({ ...x, d: x.lon }));
  for (let it = 0; it < 30; it++) {
    let moved = false;
    for (let i = 0; i < s.length; i++) {
      const a = s[i], b = s[(i + 1) % s.length];
      let d = b.d - a.d;
      if (i === s.length - 1) d += 360;
      if (s.length > 1 && d < gap) {
        const push = (gap - d) / 2;
        a.d -= push; b.d += push; moved = true;
      }
    }
    if (!moved) break;
  }
  return Object.fromEntries(s.map(x => [x.id, x.d]));
}

export function arcPath(r1: number, r2: number, a1: number, a2: number, asc: number) {
  const p1 = toXY(a1, asc, r2), p2 = toXY(a2, asc, r2), p3 = toXY(a2, asc, r1), p4 = toXY(a1, asc, r1);
  return `M${p1.x} ${p1.y} A${r2} ${r2} 0 0 0 ${p2.x} ${p2.y} L${p3.x} ${p3.y} A${r1} ${r1} 0 0 1 ${p4.x} ${p4.y}Z`;
}

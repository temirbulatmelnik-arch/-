// «Тонкости дня»: что астролог учёл сверх списка аспектов — хозяева времени, секта, состояние планет,
// рецепции, фигуры, двойные попадания, точки затмений, смягчение и усиление.
import { motion } from 'motion/react';
import type { NuanceNote } from '../engine/nuance';

const TONE: Record<string, string> = { soften: 'var(--asp-soft)', reception: 'var(--asp-soft)', aggravate: 'var(--asp-hard)', double: 'var(--aura3)', figure: 'var(--aura3)', eclipse: '#ff9e6e', lords: 'var(--brass)' };

export function NuanceList({ notes, max = 7 }: { notes: NuanceNote[]; max?: number }) {
  return (
    <div className="space-y-2.5">
      {notes.slice(0, max).map((n, i) => (
        <motion.div key={n.title} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-30px' }} transition={{ duration: 0.55, delay: Math.min(i, 4) * 0.05, ease: [0.23, 1, 0.32, 1] }}
          className={`oracle flex gap-3 rounded-[22px] p-4 ${i === 0 ? 'halo' : ''}`}>
          <span className="glyph grid size-10 shrink-0 place-items-center rounded-full text-[18px]" style={{ color: TONE[n.kind] ?? 'var(--brass)', background: 'var(--line)' }}>{n.icon}</span>
          <div className="min-w-0">
            <h3 className="text-[16px] leading-snug font-semibold">{n.title}</h3>
            <p className="mt-1 text-[15px] leading-relaxed text-dim">{n.text}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

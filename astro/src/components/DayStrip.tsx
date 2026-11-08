// Лента дней: две недели вокруг выбранного дня, у каждого — фаза Луны. Выбранный день светится цветом стихии.
import { motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { MoonDisc } from './MoonDisc';
import { mskDay, mskParts } from '../engine/time';
import { lonOf, norm } from '../engine/core';
import { spring } from './motion';

const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

export function DayStrip({ offset, onPick }: { offset: number; onPick: (n: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const base = new Date();
  const days = Array.from({ length: 21 }, (_, i) => offset - 7 + i);
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[data-sel="1"]');
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [offset]);
  return (
    <div ref={ref} className="no-scrollbar -mx-4 flex snap-x gap-1.5 overflow-x-auto px-4 py-2">
      {days.map(n => {
        const d = mskDay(base, n, 12);
        const p = mskParts(d);
        const phase = norm(lonOf('moon', d) - lonOf('sun', d));
        const sel = n === offset;
        return (
          <button key={n} data-sel={sel ? '1' : '0'} onClick={() => onPick(n)} aria-label={`${p.d}.${p.m}`} aria-pressed={sel}
            className={`relative flex w-[54px] shrink-0 snap-center flex-col items-center gap-1 rounded-[20px] py-2 ${sel ? 'text-ink' : 'text-faint'}`}>
            {sel && <motion.span layoutId="day-sel" transition={spring} className="halo oracle absolute inset-0 -z-0 rounded-[20px]" />}
            <span className="relative text-[12px] font-semibold">{n === 0 ? 'сег' : WD[p.wd]}</span>
            <span className="num relative text-[22px] leading-none font-semibold">{p.d}</span>
            <span className="relative"><MoonDisc phase={phase} size={16} glow={false} /></span>
          </button>
        );
      })}
    </div>
  );
}

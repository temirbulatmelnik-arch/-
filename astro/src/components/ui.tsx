import { motion, type HTMLMotionProps } from 'motion/react';
import type { ReactNode } from 'react';
import { snappy, spring } from './motion';

export function Tap({ className = '', children, ...rest }: HTMLMotionProps<'button'>) {
  return <motion.button type="button" whileTap={{ scale: 0.96 }} transition={snappy} className={className} {...rest}>{children}</motion.button>;
}

/** Сегментированный переключатель с плывущей подложкой */
export function Segmented<T extends string>({ value, options, onChange, id, small }: { value: T; options: { id: T; label: ReactNode }[]; onChange: (v: T) => void; id: string; small?: boolean }) {
  return (
    <div className={`glass relative flex rounded-full p-1 ${small ? 'text-[15px]' : 'text-[16px]'}`} role="tablist">
      {options.map(o => (
        <button key={o.id} role="tab" aria-selected={value === o.id} onClick={() => onChange(o.id)}
          className={`relative z-0 flex-1 rounded-full px-3 ${small ? 'py-1.5' : 'py-2'} font-medium transition-colors duration-200 ${value === o.id ? 'text-night' : 'text-dim'}`}>
          {value === o.id && <motion.span layoutId={`seg-${id}`} transition={spring} className="absolute inset-0 -z-10 rounded-full bg-brass shadow-[0_2px_14px_rgba(226,189,114,.35)]" />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Section({ title, children, aside, className = '' }: { title: ReactNode; children: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <section className={`mt-8 ${className}`}>
      <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
        <h2 className="serif text-[26px] font-semibold leading-tight text-ink">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Chip({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'good' | 'bad' | 'brass' }) {
  const c = tone === 'good' ? 'text-good border-[color:var(--good)]/30' : tone === 'bad' ? 'text-bad border-[color:var(--bad)]/30' : tone === 'brass' ? 'text-brass border-[color:var(--brass)]/40' : 'text-dim hair';
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[14px] leading-6 ${c}`}>{children}</span>;
}

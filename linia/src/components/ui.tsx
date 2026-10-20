import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

export function Switch({ checked, onChange, label, hint, icon }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; icon?: ReactNode;
}) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-center gap-3 py-3 text-left">
      {icon && <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-muted">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">{label}</span>
        {hint && <span className="block text-[13px] leading-snug text-muted">{hint}</span>}
      </span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? 'bg-gold' : 'bg-surface-2 ring-1 ring-line ring-inset'}`}>
        <motion.span className="absolute top-1 left-1 size-5 rounded-full bg-white shadow" animate={{ x: checked ? 20 : 0 }} transition={{ type: 'spring', stiffness: 500, damping: 32 }} />
      </span>
    </button>
  );
}

export function IconButton({ onClick, label, children, className = '' }: {
  onClick: () => void; label: string; children: ReactNode; className?: string;
}) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className={`grid size-11 place-items-center rounded-full text-ink transition active:scale-95 ${className}`}>
      {children}
    </button>
  );
}

/** Главная кнопка: шампанское золото с бликом */
export function PrimaryButton({ onClick, children, className = '', disabled }: {
  onClick: () => void; children: ReactNode; className?: string; disabled?: boolean;
}) {
  return (
    <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={onClick} disabled={disabled}
      className={`sheen bg-gold-grad flex h-14 w-full items-center justify-center gap-2 rounded-full text-[16px] font-semibold tracking-wide text-on-accent shadow-lg shadow-gold/30 disabled:opacity-40 ${className}`}>
      {children}
    </motion.button>
  );
}

export function SecondaryButton({ onClick, children, className = '' }: {
  onClick: () => void; children: ReactNode; className?: string;
}) {
  return (
    <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={onClick}
      className={`hairline flex h-12 items-center justify-center gap-2 rounded-full bg-surface px-5 text-[15px] font-medium text-ink ${className}`}>
      {children}
    </motion.button>
  );
}

export function Chip({ children, tone = 'neutral', className = '' }: { children: ReactNode; tone?: 'neutral' | 'gold' | 'rose' | 'pearl' | 'warn' | 'glass'; className?: string }) {
  const tones = {
    neutral: 'bg-surface-2 text-muted',
    gold: 'bg-gold/15 text-ink',
    rose: 'bg-rose/15 text-ink',
    pearl: 'bg-pearl/15 text-ink',
    warn: 'bg-warn/12 text-ink',
    glass: 'bg-white/35 text-card backdrop-blur-md dark:bg-white/10',
  };
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-medium ${tones[tone]} ${className}`}>{children}</span>;
}

export function Sheet({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[3px]" onClick={onClose} />
          <motion.div role="dialog" aria-modal="true" aria-label={title}
            className="pb-safe relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[32px] bg-bg"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 380, damping: 38 }}>
            <div className="sticky top-0 z-10 flex items-center justify-between bg-bg/90 px-6 pt-5 pb-2 backdrop-blur">
              <h2 className="font-display text-[28px] leading-tight">{title}</h2>
              <IconButton onClick={onClose} label="Закрыть" className="hairline bg-surface"><X size={19} /></IconButton>
            </div>
            <div className="px-6 pb-8">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ScreenHeader({ title, overline, subtitle, action }: { title: string; overline?: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-3 px-6 pt-7 pb-5">
      <div>
        {overline && <div className="eyebrow mb-2 text-gold">{overline}</div>}
        <h1 className="font-display text-[40px] leading-[1.02]">{title}</h1>
        {subtitle && <p className="mt-2 text-[15px] text-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-9 mb-3 flex items-end justify-between px-6">
      <h2 className="font-display text-[26px] leading-none">{children}</h2>
      {action}
    </div>
  );
}

/** Тонкое золотое кольцо прогресса */
export function Ring({ value, size = 44, stroke = 2.5, children, className = '' }: { value: number; size?: number; stroke?: number; children?: ReactNode; className?: string }) {
  const r = (size - stroke) / 2, len = 2 * Math.PI * r;
  return (
    <span className={`relative inline-grid place-items-center ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.18} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--gold)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={len} strokeDashoffset={len * (1 - Math.min(1, Math.max(0, value)))} style={{ transition: 'stroke-dashoffset .6s ease' }} />
      </svg>
      <span className="relative text-[12px] font-semibold tabular-nums">{children}</span>
    </span>
  );
}

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export { plural } from '../engine/format';

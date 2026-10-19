import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

export function Switch({ checked, onChange, label, hint, icon }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 py-3 text-left"
    >
      {icon && <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">{label}</span>
        {hint && <span className="block text-[13px] text-muted">{hint}</span>}
      </span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? 'bg-calm' : 'bg-surface-2 ring-1 ring-line ring-inset'}`}>
        <motion.span
          className="absolute top-1 left-1 size-5 rounded-full bg-white shadow"
          animate={{ x: checked ? 20 : 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        />
      </span>
    </button>
  );
}

export function IconButton({ onClick, label, children, className = '' }: {
  onClick: () => void; label: string; children: ReactNode; className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid size-11 place-items-center rounded-2xl text-ink transition active:scale-95 ${className}`}
    >
      {children}
    </button>
  );
}

export function PrimaryButton({ onClick, children, className = '', disabled }: {
  onClick: () => void; children: ReactNode; className?: string; disabled?: boolean;
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-calm to-breath text-[17px] font-semibold text-on-accent shadow-lg shadow-calm/25 disabled:opacity-40 ${className}`}
    >
      {children}
    </motion.button>
  );
}

export function SecondaryButton({ onClick, children, className = '' }: {
  onClick: () => void; children: ReactNode; className?: string;
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className={`flex h-12 items-center justify-center gap-2 rounded-2xl bg-surface-2 px-4 text-[15px] font-medium text-ink ${className}`}
    >
      {children}
    </motion.button>
  );
}

export function Chip({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'calm' | 'squeeze' | 'gold' }) {
  const tones = {
    neutral: 'bg-surface-2 text-muted',
    calm: 'bg-calm/15 text-ink',
    squeeze: 'bg-squeeze/15 text-ink',
    gold: 'bg-gold/15 text-ink',
  };
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-medium ${tones[tone]}`}>{children}</span>;
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
          <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="pb-safe relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-bg"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between bg-bg/90 px-5 pt-4 pb-2 backdrop-blur">
              <h2 className="text-xl font-semibold">{title}</h2>
              <IconButton onClick={onClose} label="Закрыть" className="bg-surface-2"><X size={20} /></IconButton>
            </div>
            <div className="px-5 pb-6">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ScreenHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-3 px-5 pt-6 pb-4">
      <div>
        <h1 className="text-[28px] leading-tight font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Русское склонение: plural(5, 'день', 'дня', 'дней') → 'дней' */
export function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

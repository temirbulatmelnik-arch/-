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
      {icon && <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-gold">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">{label}</span>
        {hint && <span className="block text-[13px] text-muted">{hint}</span>}
      </span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? 'bg-gold-grad' : 'bg-surface-2 ring-1 ring-line ring-inset'}`}>
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
      className={`grid size-11 place-items-center rounded-full text-ink transition active:scale-95 ${className}`}
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
      className={`sheen bg-gold-grad flex h-14 w-full items-center justify-center gap-2.5 rounded-full text-[13.5px] font-medium tracking-[0.16em] text-on-accent uppercase shadow-lg shadow-gold/25 disabled:opacity-40 ${className}`}
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
      className={`hairline flex h-12 items-center justify-center gap-2 rounded-full bg-surface px-5 text-[13px] font-medium tracking-[0.12em] text-ink uppercase ${className}`}
    >
      {children}
    </motion.button>
  );
}

export function Chip({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'calm' | 'squeeze' | 'gold' }) {
  const tones = {
    neutral: 'border-line text-muted',
    calm: 'border-calm/40 text-ink',
    squeeze: 'border-squeeze/40 text-ink',
    gold: 'border-gold/45 text-ink',
  };
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-medium tracking-wide ${tones[tone]}`}>{children}</span>;
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
            className="pb-safe relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[32px] border-t border-gold/30 bg-bg"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between bg-bg/90 px-5 pt-4 pb-2 backdrop-blur">
              <h2 className="font-display text-[28px] leading-tight">{title}</h2>
              <IconButton onClick={onClose} label="Закрыть" className="hairline bg-surface"><X size={19} /></IconButton>
            </div>
            <div className="px-5 pb-6">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ScreenHeader({ title, subtitle, action, eyebrow }: { title: string; subtitle?: string; action?: ReactNode; eyebrow?: string }) {
  return (
    <header className="flex items-start justify-between gap-3 px-5 pt-7 pb-5">
      <div>
        <div className="eyebrow mb-2.5 text-gold">{eyebrow ?? 'Тонус'}</div>
        <h1 className="font-display text-[40px] leading-[1.02]">{title}</h1>
        {subtitle && <p className="mt-2.5 max-w-[36ch] text-[15px] leading-snug text-muted">{subtitle}</p>}
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

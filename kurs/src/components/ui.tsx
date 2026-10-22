import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

export function IconButton({ onClick, label, children, className = '' }: {
  onClick: () => void; label: string; children: ReactNode; className?: string;
}) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className={`grid size-11 shrink-0 place-items-center rounded-full text-ink transition active:scale-95 ${className}`}>
      {children}
    </button>
  );
}

export function PrimaryButton({ onClick, children, className = '', disabled, tone = 'accent' }: {
  onClick: () => void; children: ReactNode; className?: string; disabled?: boolean; tone?: 'accent' | 'danger';
}) {
  return (
    <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={onClick} disabled={disabled}
      className={`flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-[16px] font-bold text-on-accent disabled:opacity-40 ${tone === 'danger' ? 'bg-danger' : 'bg-accent'} ${className}`}>
      {children}
    </motion.button>
  );
}

export function SecondaryButton({ onClick, children, className = '', disabled }: {
  onClick: () => void; children: ReactNode; className?: string; disabled?: boolean;
}) {
  return (
    <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={onClick} disabled={disabled}
      className={`flex h-12 items-center justify-center gap-2 rounded-2xl bg-surface-2 px-4 text-[15px] font-semibold text-ink disabled:opacity-40 ${className}`}>
      {children}
    </motion.button>
  );
}

export type Tone = 'neutral' | 'accent' | 'danger' | 'warn' | 'info';
const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-muted',
  accent: 'bg-accent/12 text-accent',
  danger: 'bg-danger/12 text-danger',
  warn: 'bg-warn/14 text-warn',
  info: 'bg-info/12 text-info',
};

export function Chip({ children, tone = 'neutral', className = '' }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap ${TONES[tone]} ${className}`}>{children}</span>;
}

export function Sheet({ open, onClose, title, children, footer }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={onClose} />
          <motion.div role="dialog" aria-modal="true" aria-label={title}
            className="relative flex max-h-[94dvh] w-full max-w-md flex-col rounded-t-[30px] bg-bg"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 420, damping: 40 }}>
            <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-2">
              <h2 className="text-[22px] leading-tight font-extrabold tracking-tight">{title}</h2>
              <IconButton onClick={onClose} label="Закрыть" className="bg-surface-2"><X size={19} /></IconButton>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6">{children}</div>
            {footer && <div className="pb-safe border-t border-line bg-bg px-5 pt-3"><div className="pb-3">{footer}</div></div>}
            {!footer && <div className="pb-safe" />}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ScreenHeader({ title, overline, action }: { title: string; overline?: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-3 px-5 pt-6 pb-4">
      <div className="min-w-0">
        {overline && <div className="eyebrow mb-1.5 text-muted">{overline}</div>}
        <h1 className="text-[32px] leading-[1.05] font-extrabold tracking-tight">{title}</h1>
      </div>
      {action}
    </header>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-7 mb-2.5 flex items-end justify-between gap-3 px-5">
      <h2 className="text-[19px] leading-none font-extrabold tracking-tight">{children}</h2>
      {action}
    </div>
  );
}

/** Полоса прогресса: value 0..1; over — превышение лимита */
export function Bar({ value, tone = 'accent', marker, className = '' }: { value: number; tone?: 'accent' | 'danger' | 'warn' | 'hero'; marker?: number; className?: string }) {
  const color = { accent: 'bg-accent', danger: 'bg-danger', warn: 'bg-warn', hero: 'bg-[#7ee2b8]' }[tone];
  return (
    <div className={`relative h-2 overflow-hidden rounded-full ${tone === 'hero' ? 'bg-white/15' : 'bg-surface-2'} ${className}`}>
      <div className={`h-full rounded-full ${color} transition-[width] duration-500`} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
      {marker != null && marker > 0 && marker < 1 && <div className={`absolute top-0 h-full w-0.5 ${tone === 'hero' ? 'bg-white/60' : 'bg-ink/40'}`} style={{ left: `${marker * 100}%` }} />}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[12.5px] leading-snug text-faint">{hint}</span>}
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-2xl bg-surface-2 p-1">
      {options.map(o => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)}
          className={`flex-1 rounded-xl px-2 py-2 text-[14px] font-semibold transition ${o.id === value ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-center gap-3 py-2.5 text-left">
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{label}</span>
        {hint && <span className="block text-[13px] leading-snug text-muted">{hint}</span>}
      </span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-surface-2 ring-1 ring-line ring-inset'}`}>
        <motion.span className="absolute top-1 left-1 size-5 rounded-full bg-white shadow" animate={{ x: checked ? 20 : 0 }} transition={{ type: 'spring', stiffness: 500, damping: 32 }} />
      </span>
    </button>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl bg-surface-2 px-4 py-5 text-center text-[14px] text-muted">{children}</p>;
}

/** Всплывающее сообщение внизу экрана */
export function Toast({ text, onDone }: { text: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!text) return;
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  }, [text, onDone]);
  return (
    <AnimatePresence>
      {text && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
          className="pointer-events-none fixed inset-x-0 bottom-28 z-[60] mx-auto w-fit max-w-[90%] rounded-2xl bg-ink px-4 py-3 text-center text-[14px] font-semibold text-bg shadow-xl">
          {text}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

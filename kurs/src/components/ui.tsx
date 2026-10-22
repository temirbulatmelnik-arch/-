import { AnimatePresence, motion } from 'motion/react';
import { CarTaxiFront, Cigarette, Coffee, Pill, Repeat, Sandwich, Scissors, ShoppingBag, ShoppingBasket, TramFront, X, type LucideIcon } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { num } from '../domain/money';
import type { CategoryId } from '../domain/types';

/* ---------- Деньги ---------- */

/** Сумма: тонкие цифры и маленький знак рубля. sign — плюс у поступлений. */
export function Money({ value, className = '', approx, sign, rubClass = '' }: { value: number; className?: string; approx?: boolean; sign?: boolean; rubClass?: string }) {
  const v = Math.round(value);
  return (
    <span className={`whitespace-nowrap ${className}`}>
      {approx && <span className="opacity-60">≈&#8239;</span>}
      {sign && v > 0 ? '+' : ''}{num(v)}
      <span className={`ml-[0.12em] text-[0.62em] font-normal opacity-55 ${rubClass}`}>₽</span>
    </span>
  );
}

/* ---------- Иконки категорий ---------- */

export const CATEGORY_ICON: Record<CategoryId, LucideIcon> = {
  groceries: ShoppingBasket, work: Sandwich, taxi: CarTaxiFront, transport: TramFront, health: Pill,
  shopping: ShoppingBag, beauty: Scissors, tobacco: Cigarette, fun: Coffee, fixed: Repeat,
};

export function CatIcon({ id, className = '' }: { id: CategoryId; className?: string }) {
  const Icon = CATEGORY_ICON[id];
  return <span className={`grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-ink/80 ${className}`}><Icon size={18} strokeWidth={1.5} /></span>;
}

/* ---------- Кнопки ---------- */

export function IconButton({ onClick, label, children, className = '' }: { onClick: () => void; label: string; children: ReactNode; className?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className={`grid size-10 shrink-0 place-items-center rounded-full border border-line bg-surface text-ink transition active:scale-95 ${className}`}>
      {children}
    </button>
  );
}

export function PrimaryButton({ onClick, children, className = '', disabled, tone = 'brass' }: {
  onClick: () => void; children: ReactNode; className?: string; disabled?: boolean; tone?: 'brass' | 'ink' | 'neg';
}) {
  const tones = { brass: 'bg-brass-grad text-on-brass', ink: 'bg-ink text-bg', neg: 'bg-neg text-white' };
  return (
    <motion.button type="button" whileTap={{ scale: 0.98 }} onClick={onClick} disabled={disabled}
      className={`flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl text-[15.5px] font-semibold tracking-[-0.01em] disabled:opacity-35 ${tones[tone]} ${className}`}>
      {children}
    </motion.button>
  );
}

export function SecondaryButton({ onClick, children, className = '', disabled }: { onClick: () => void; children: ReactNode; className?: string; disabled?: boolean }) {
  return (
    <motion.button type="button" whileTap={{ scale: 0.98 }} onClick={onClick} disabled={disabled}
      className={`flex h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-4 text-[14.5px] font-medium text-ink disabled:opacity-35 ${className}`}>
      {children}
    </motion.button>
  );
}

export type Tone = 'neutral' | 'brass' | 'pos' | 'neg' | 'warn' | 'info';
const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-muted',
  brass: 'bg-brass/12 text-brass',
  pos: 'bg-pos/12 text-pos',
  neg: 'bg-neg/12 text-neg',
  warn: 'bg-warn/14 text-warn',
  info: 'bg-info/12 text-info',
};

export function Chip({ children, tone = 'neutral', className = '' }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-[3px] text-[11.5px] font-medium whitespace-nowrap ${TONES[tone]} ${className}`}>{children}</span>;
}

/* ---------- Лист снизу ---------- */

export function Sheet({ open, onClose, title, subtitle, children, footer }: {
  open: boolean; onClose: () => void; title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode;
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
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[3px]" onClick={onClose} />
          <motion.div role="dialog" aria-modal="true" aria-label={title}
            className="relative flex max-h-[94dvh] w-full max-w-md flex-col rounded-t-[28px] border-t border-line bg-bg"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 420, damping: 42 }}>
            <div className="mx-auto mt-2.5 h-1 w-9 rounded-full bg-line" />
            <div className="flex items-start justify-between gap-3 px-5 pt-3 pb-3">
              <div className="min-w-0">
                <h2 className="text-[21px] leading-tight font-medium tracking-[-0.02em]">{title}</h2>
                {subtitle && <div className="mt-0.5 text-[13px] text-muted">{subtitle}</div>}
              </div>
              <IconButton onClick={onClose} label="Закрыть" className="size-9"><X size={17} strokeWidth={1.6} /></IconButton>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6">{children}</div>
            {footer ? <div className="pb-safe border-t border-line bg-bg px-5 pt-3"><div className="pb-3">{footer}</div></div> : <div className="pb-safe" />}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ---------- Заголовки ---------- */

export function ScreenHeader({ title, overline, action }: { title: string; overline?: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-3 px-5 pt-6 pb-5">
      <div className="min-w-0">
        {overline && <div className="eyebrow mb-1.5 text-muted">{overline}</div>}
        <h1 className="text-[30px] leading-[1.05] font-medium tracking-[-0.03em]">{title}</h1>
      </div>
      {action}
    </header>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-8 mb-3 flex items-center justify-between gap-3 px-5">
      <h2 className="eyebrow text-muted">{children}</h2>
      {action}
    </div>
  );
}

export function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} className="text-[13px] font-medium text-brass">{children}</button>;
}

/* ---------- Прогресс ---------- */

/** Тонкая полоса: value 0..1; marker — где сейчас время (доля недели) */
export function Bar({ value, tone = 'brass', marker, className = '', onCard }: { value: number; tone?: 'brass' | 'pos' | 'neg' | 'warn' | 'card'; marker?: number; className?: string; onCard?: boolean }) {
  const color = { brass: 'bg-brass', pos: 'bg-pos', neg: 'bg-neg', warn: 'bg-warn', card: 'bg-card-brass' }[tone];
  const dark = onCard || tone === 'card';
  return (
    <div className={`relative h-[3px] rounded-full ${dark ? 'bg-card/12' : 'bg-line'} ${className}`}>
      <div className={`h-full rounded-full ${color} transition-[width] duration-700 ease-out`} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
      {marker != null && marker > 0 && marker < 1 && (
        <div className={`absolute -top-[3px] h-[9px] w-px ${dark ? 'bg-card/50' : 'bg-ink/35'}`} style={{ left: `${marker * 100}%` }} />
      )}
    </div>
  );
}

/* ---------- Поля ---------- */

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[12px] leading-snug text-faint">{hint}</span>}
    </label>
  );
}

/** Большое поле суммы */
export function AmountInput({ value, onChange, autoFocus, size = 'lg' }: { value: string; onChange: (v: string) => void; autoFocus?: boolean; size?: 'lg' | 'md' }) {
  return (
    <div className="flex items-baseline gap-2 rounded-2xl border border-line bg-surface px-4 py-3">
      <input value={value} onChange={e => onChange(e.target.value)} inputMode="decimal" placeholder="0" autoFocus={autoFocus} aria-label="Сумма"
        className={`figure w-full min-w-0 bg-transparent outline-none placeholder:text-faint ${size === 'lg' ? 'text-[44px] leading-none' : 'text-[28px] leading-none'}`} />
      <span className={`text-muted ${size === 'lg' ? 'text-[24px]' : 'text-[18px]'}`}>₽</span>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-[14px] bg-surface-2 p-[3px]">
      {options.map(o => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)}
          className={`relative flex-1 rounded-[11px] px-2 py-2 text-[13.5px] font-medium transition-colors ${o.id === value ? 'text-ink' : 'text-muted'}`}>
          {o.id === value && <motion.span layoutId={`seg-${options.map(x => x.id).join('')}`} className="absolute inset-0 rounded-[11px] border border-line bg-surface" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-center gap-3 py-2.5 text-left">
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-medium">{label}</span>
        {hint && <span className="block text-[12.5px] leading-snug text-muted">{hint}</span>}
      </span>
      <span className={`relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors ${checked ? 'bg-brass' : 'bg-surface-2 ring-1 ring-line ring-inset'}`}>
        <motion.span className="absolute top-[3px] left-[3px] size-6 rounded-full bg-white shadow" animate={{ x: checked ? 20 : 0 }} transition={{ type: 'spring', stiffness: 500, damping: 32 }} />
      </span>
    </button>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-[22px] border border-dashed border-line px-5 py-6 text-center text-[13.5px] leading-snug text-muted">{children}</p>;
}

/** Строка «подпись — значение» */
export function Row({ label, children, className = '' }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-2.5 text-[14px] ${className}`}>
      <span className="text-muted">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}

export function Toast({ text, onDone }: { text: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!text) return;
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  }, [text, onDone]);
  return (
    <AnimatePresence>
      {text && (
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 14 }}
          className="pointer-events-none fixed inset-x-0 bottom-28 z-[60] mx-auto w-fit max-w-[88%] rounded-full bg-ink px-5 py-3 text-center text-[13.5px] font-medium text-bg shadow-xl">
          {text}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

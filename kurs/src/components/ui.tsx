import { animate, AnimatePresence, motion, useMotionValue } from 'motion/react';
import { CarTaxiFront, Cigarette, Coffee, Pill, Repeat, Sandwich, Scissors, ShoppingBag, ShoppingBasket, TramFront, X, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { num } from '../domain/money';
import type { CategoryId } from '../domain/types';
import { usePan } from './motion';

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

/** Цвета категорий (версия 0.3): у каждой свой яркий цвет — список трат читается по цвету, не по подписи.
 *  Различимы и в светлой, и в тёмной теме; на плитке значок белый */
export const CAT_COLOR: Record<CategoryId, string> = {
  groceries: '#2ba36a', work: '#f08a3c', taxi: '#e9aa1c', transport: '#2f86d6', health: '#e5527a',
  shopping: '#8b63e0', beauty: '#e069b0', tobacco: '#8c7a6b', fun: '#f0603a', fixed: '#5b6fb8',
};

/** Цветная плитка со значком: c — цвет (hex или var) */
export function Tile({ c, children, className = 'size-10' }: { c: string; children: ReactNode; className?: string }) {
  return <span className={`tile ${className}`} style={{ '--c': c } as CSSProperties}>{children}</span>;
}

export function CatIcon({ id, className = 'size-10' }: { id: CategoryId; className?: string }) {
  const Icon = CATEGORY_ICON[id];
  return <Tile c={CAT_COLOR[id]} className={className}><Icon size={19} strokeWidth={1.9} /></Tile>;
}

/* ---------- Кнопки ---------- */

export function IconButton({ onClick, label, children, className = '' }: { onClick: () => void; label: string; children: ReactNode; className?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className={`grid size-11 shrink-0 place-items-center rounded-full border border-line bg-surface text-ink transition-transform duration-100 ease-out active:scale-[.97] ${className}`}>
      {children}
    </button>
  );
}

export function PrimaryButton({ onClick, children, className = '', disabled, tone = 'sea' }: {
  onClick: () => void; children: ReactNode; className?: string; disabled?: boolean; tone?: 'sea' | 'ink' | 'neg';
}) {
  const tones = { sea: 'btn-sea', ink: 'bg-ink text-bg', neg: 'bg-neg text-white' };
  return (
    <motion.button type="button" whileTap={{ scale: 0.97 }} transition={{ duration: 0.12, ease: [0.23, 1, 0.32, 1] }} onClick={onClick} disabled={disabled}
      className={`flex h-[52px] w-full items-center justify-center gap-2 rounded-[18px] text-[15.5px] font-medium disabled:opacity-35 ${tones[tone]} ${className}`}>
      {children}
    </motion.button>
  );
}

export function SecondaryButton({ onClick, children, className = '', disabled }: { onClick: () => void; children: ReactNode; className?: string; disabled?: boolean }) {
  return (
    <motion.button type="button" whileTap={{ scale: 0.97 }} transition={{ duration: 0.12, ease: [0.23, 1, 0.32, 1] }} onClick={onClick} disabled={disabled}
      className={`flex h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-4 text-[14.5px] font-medium text-ink disabled:opacity-35 ${className}`}>
      {children}
    </motion.button>
  );
}

export type Tone = 'neutral' | 'sea' | 'pos' | 'neg' | 'warn' | 'info';
const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-muted',
  sea: 'bg-sea/12 text-sea',
  pos: 'bg-pos/12 text-pos',
  neg: 'bg-neg/12 text-neg',
  warn: 'bg-warn/14 text-warn',
  info: 'bg-info/12 text-info',
};

export function Chip({ children, tone = 'neutral', className = '' }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-[3px] text-[11.5px] font-medium whitespace-nowrap ${TONES[tone]} ${className}`}>{children}</span>;
}

/* ---------- Лист снизу ---------- */

/** Лист снизу, как в iOS: выезжает пружиной, тянется пальцем за шапку вниз и закрывается.
 *  compact — не выше трёх четвертей экрана: над ним видно, откуда он открылся */
/** bare — содержимое само раскладывает высоту (например, прокрутка сверху и закреплённая клавиатура снизу) */
export function Sheet({ open, onClose, title, subtitle, children, footer, compact, action, bare }: {
  open: boolean; onClose: () => void; title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; compact?: boolean; action?: ReactNode; bare?: boolean;
}) {
  const fade = useMotionValue(1);
  const pull = useMotionValue(0);
  useEffect(() => {
    if (!open) return;
    fade.set(1);
    pull.set(0);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose, fade, pull]);

  // за шапку лист тянется вниз; закрыть можно и коротким броском — не нужно тянуть далеко (apple-design: drag to
  // dismiss). Жест — usePan, а не drag из motion: тот перемерял бы лист при каждой перерисовке (каждой цифре траты)
  const pan = usePan({
    axis: 'y',
    onMove: d => { pull.set(d > 0 ? d * 0.9 : d * 0.04); fade.set(1 - Math.min(0.85, Math.max(0, d) / 520)); },
    onEnd: (d, v) => {
      if (d > 110 || (v > 320 && d > 12)) onClose();
      else { animate(pull, 0, { type: 'spring', bounce: 0, duration: 0.35 }); animate(fade, 1, { duration: 0.2 }); }
    },
  });

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.2 } }} transition={{ duration: 0.25 }}>
          <motion.div className="absolute inset-0 bg-[rgba(4,14,22,.5)] backdrop-blur-[4px]" style={{ opacity: fade }} onClick={onClose} />
          <motion.div role="dialog" aria-modal="true" aria-label={title} className="relative w-full max-w-md"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%', transition: { duration: 0.26, ease: [0.32, 0.72, 0, 1] } }}
            transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}>
          <motion.div style={{ y: pull }}
            className={`flex flex-col rounded-t-[30px] border-t border-line bg-bg shadow-[0_-18px_48px_-24px_rgba(4,14,22,.55)] ${compact ? 'max-h-[78dvh]' : 'max-h-[94dvh]'}`}>
            {/* за шапку лист тянется вниз — как в iOS */}
            <div {...pan} className="cursor-grab touch-none select-none active:cursor-grabbing">
              <div className="mx-auto mt-2.5 h-[5px] w-10 rounded-full bg-line" />
              <div className="flex items-start justify-between gap-3 px-5 pt-3 pb-3">
                <div className="min-w-0">
                  <h2 className="font-display text-[19px] leading-tight font-medium">{title}</h2>
                  {subtitle && <div className="mt-0.5 text-[13px] text-muted">{subtitle}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-2" onPointerDown={e => e.stopPropagation()}>
                  {action}
                  <IconButton onClick={onClose} label="Закрыть" className="size-10"><X size={17} strokeWidth={1.6} /></IconButton>
                </div>
              </div>
            </div>
            {bare
              ? <div className="flex min-h-0 flex-1 flex-col">{children}</div>
              : <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6">{children}</div>}
            {footer ? <div className="pb-safe border-t border-line bg-bg px-5 pt-3"><div className="pb-3">{footer}</div></div> : !bare && <div className="pb-safe" />}
          </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ---------- Заголовки ---------- */

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-8 mb-3 flex items-center justify-between gap-3 px-5">
      <h2 className="text-[15px] font-medium">{children}</h2>
      {action}
    </div>
  );
}

export function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} className="text-[13px] font-medium text-sea">{children}</button>;
}

/* ---------- Прогресс ---------- */

/** Тонкая полоса: value 0..1; marker — где сейчас время (доля недели) */
export function Bar({ value, tone = 'sea', marker, className = '', onCard }: { value: number; tone?: 'sea' | 'pos' | 'neg' | 'warn' | 'card'; marker?: number; className?: string; onCard?: boolean }) {
  const color = { sea: 'bg-sea', pos: 'bg-pos', neg: 'bg-neg', warn: 'bg-warn', card: 'bg-card-sea' }[tone];
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
/** Поле суммы. sm — для двух полей в ряд (долг и доступно на кредитке); disabled — значение подставлено само */
export function AmountInput({ value, onChange, autoFocus, size = 'lg', label = 'Сумма', disabled, prefix }: {
  value: string; onChange: (v: string) => void; autoFocus?: boolean; size?: 'lg' | 'md' | 'sm'; label?: string; disabled?: boolean;
  /** перед числом: например, кнопка «−» для суммы меньше нуля */
  prefix?: ReactNode;
}) {
  const text = size === 'lg' ? 'text-[44px]' : size === 'md' ? 'text-[28px]' : 'text-[22px]';
  const rub = size === 'lg' ? 'text-[24px]' : size === 'md' ? 'text-[18px]' : 'text-[15px]';
  return (
    <div className={`flex items-baseline gap-2 rounded-2xl border border-line ${size === 'sm' ? 'px-3 py-2.5' : 'px-4 py-3'} ${disabled ? 'bg-surface-2' : 'bg-surface'}`}>
      {prefix}
      <input value={value} onChange={e => onChange(e.target.value)} inputMode="decimal" placeholder="0" autoFocus={autoFocus} aria-label={label} disabled={disabled}
        className={`figure w-full min-w-0 bg-transparent leading-none outline-none placeholder:text-faint disabled:text-muted disabled:opacity-100 ${text}`} />
      <span className={`text-muted ${rub}`}>₽</span>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="relative flex rounded-[14px] bg-surface-2 p-[3px]">
      {/* подложка выбранного — CSS-переход по transform: общая layout-анимация motion обходила бы все элементы приложения */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-[3px] left-[3px] rounded-[11px] border border-line bg-surface transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
        style={{ width: `calc((100% - 6px) / ${options.length})`, transform: `translateX(${Math.max(0, options.findIndex(o => o.id === value)) * 100}%)` }} />
      {options.map(o => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)}
          className={`relative flex-1 rounded-[11px] px-2 py-2 text-[13.5px] font-medium transition-colors ${o.id === value ? 'text-ink' : 'text-muted'}`}>
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
      <span className={`relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors ${checked ? 'bg-sea' : 'bg-surface-2 ring-1 ring-line ring-inset'}`}>
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
  // таймер зависит только от текста: иначе каждое нажатие где угодно перезапускало бы его и сообщение висело
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (!text) return;
    const t = setTimeout(() => done.current(), 2800);
    return () => clearTimeout(t);
  }, [text]);
  // сообщение выезжает сверху, как «островок» iPhone: туда смотрят, оно не закрывает кнопки внизу
  return (
    <AnimatePresence>
      {text && (
        <motion.div key={text} role="status" initial={{ opacity: 0, y: -24, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -16, scale: 0.97, transition: { duration: 0.18, ease: [0.23, 1, 0.32, 1] } }}
          transition={{ type: 'spring', bounce: 0.2, duration: 0.45 }} onClick={() => done.current()}
          className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+10px)] z-[70] mx-auto flex w-fit max-w-[90%] items-center gap-2.5 rounded-full bg-ink px-4 py-2.5 text-[13.5px] leading-snug font-medium text-bg shadow-[0_14px_34px_-12px_rgba(4,14,22,.6)]">
          <motion.span className="size-2 shrink-0 rounded-full bg-sea" initial={{ scale: 0.5 }} animate={{ scale: [0.5, 1.5, 1] }} transition={{ duration: 0.45, delay: 0.1, ease: [0.23, 1, 0.32, 1] }} />
          {text}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

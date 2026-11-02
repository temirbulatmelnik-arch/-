// Набор движений «Курса»: пружины, отклик под пальцем, цифры-табло, свайп строк, листание страниц пальцем.
// Всё на motion/react; «Уменьшение движения» на iPhone выключает сдвиги через MotionConfig в App.
import { animate, AnimatePresence, motion, useDragControls, useMotionValue, useReducedMotion, useTransform, type HTMLMotionProps, type PanInfo } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { num } from '../domain/money';

/* Токены движения — навыки emil-design-eng, apple-design и motion-design (.claude/skills):
   сильные кривые вместо встроенных, отклик 120 мс, пружины без отскока для интерфейса (Apple: damping 1),
   лёгкий отскок — только после жеста с инерцией. Те же кривые — в index.css (--ease-*). */
export const ease = {
  /** вход и выход, отклик */
  out: [0.23, 1, 0.32, 1],
  /** движение по экрану */
  inOut: [0.77, 0, 0.175, 1],
  /** листы снизу, как в iOS */
  drawer: [0.32, 0.72, 0, 1],
} as const;
/** отклик под пальцем */
export const snappy = { duration: 0.12, ease: ease.out } as const;
/** интерфейс: появление, переключение, раскрытие */
export const spring = { type: 'spring', bounce: 0, duration: 0.35 } as const;
/** после жеста с инерцией (свайп, бросок): чуть живее */
export const fling = { type: 'spring', bounce: 0.2, duration: 0.45 } as const;
/** большие числа и неспешные вещи */
export const soft = { type: 'spring', bounce: 0, duration: 0.55 } as const;

/** Кнопка с откликом: чуть сжимается под пальцем, как кнопки iOS */
export function Tap({ className = '', children, ...rest }: HTMLMotionProps<'button'>) {
  return <motion.button type="button" whileTap={{ scale: 0.97 }} transition={snappy} className={`select-none ${className}`} {...rest}>{children}</motion.button>;
}

/* ---------- Цифры-табло ---------- */

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

function Digit({ d }: { d: number }) {
  return (
    <span className="relative inline-block h-[1em] overflow-hidden align-[-0.12em] leading-none">
      <span className="invisible">0</span>
      <motion.span className="absolute inset-x-0 top-0 flex flex-col" initial={false} animate={{ y: `${-d * 10}%` }} transition={soft}>
        {DIGITS.map(x => <span key={x} className="h-[1em] leading-none">{x}</span>)}
      </motion.span>
    </span>
  );
}

/** Сумма, разряды которой прокручиваются при изменении. Ключ разряда — место справа: новые тысячи выезжают слева */
export function Roll({ value, className = '', sign, rub = true }: { value: number; className?: string; sign?: boolean; rub?: boolean }) {
  const v = Math.round(value);
  const text = num(Math.abs(v));
  const chars = [...text];
  return (
    <span className={`inline-flex items-baseline whitespace-nowrap tabular-nums ${className}`} aria-label={`${v < 0 ? 'минус ' : ''}${text} ₽`}>
      {v < 0 && <span aria-hidden="true">−</span>}
      {sign && v > 0 && <span aria-hidden="true">+</span>}
      <span aria-hidden="true" className="inline-flex items-baseline">
        <AnimatePresence initial={false} mode="popLayout">
          {chars.map((c, i) => {
            const key = chars.length - i;
            return /\d/.test(c)
              ? <motion.span key={key} layout="position" initial={{ opacity: 0, y: '-20%' }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: '20%', transition: snappy }} transition={soft}><Digit d={Number(c)} /></motion.span>
              : <motion.span key={`s${key}`} layout="position" className="inline-block w-[0.22em]" />;
          })}
        </AnimatePresence>
      </span>
      {rub && <span aria-hidden="true" className="ml-[0.12em] text-[0.62em] font-normal opacity-55">₽</span>}
    </span>
  );
}

/** Число досчитывает от start при первом показе — для больших сумм, которые «рассказывают» (долг тает) */
export function useTween(value: number, start?: number, ms = 1000): number {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? value : start ?? value);
  const cur = useRef(shown);
  useEffect(() => {
    if (reduced) { setShown(value); cur.current = value; return; }
    const c = animate(cur.current, value, { duration: ms / 1000, ease: [0.16, 1, 0.3, 1], onUpdate: v => { cur.current = v; setShown(v); } });
    return () => c.stop();
  }, [value, ms, reduced]);
  return shown;
}

/* ---------- Свайп строки ---------- */

export interface SwipeAction {
  label: string;
  icon?: ReactNode;
  tone: 'pos' | 'neg' | 'sea' | 'ink';
  onAction: () => void;
}
const ACTION_BG = { pos: 'var(--pos)', neg: 'var(--neg)', sea: 'var(--sea)', ink: 'var(--muted)' };
const W = 76;

/** Строка, которую можно сдвинуть: влево — действия справа (изменить, удалить), вправо — действие слева (оплачено).
 *  Сильный свайп выполняет крайнее действие сразу, как в «Почте» */
export function SwipeRow({ children, left, right = [], className = '', rowClass = 'bg-surface' }: { children: ReactNode; left?: SwipeAction; right?: SwipeAction[]; className?: string; rowClass?: string }) {
  const x = useMotionValue(0);
  const max = right.length * W;
  const leftOpacity = useTransform(x, [0, 40, W], [0, 0.6, 1]);
  const rightOpacity = useTransform(x, [-W, -40, 0], [1, 0.6, 0]);
  // после свайпа — пружина с инерцией пальца (apple-design: передать скорость, лёгкий отскок)
  const settle = (to: number) => animate(x, to, fling);
  const end = (_: unknown, info: PanInfo) => {
    const dx = info.offset.x, vx = info.velocity.x;
    if (left && (dx > W * 1.6 || (dx > W * 0.6 && vx > 500))) { settle(0); left.onAction(); return; }
    if (right.length && (dx < -max - 90)) { settle(0); right[right.length - 1].onAction(); return; }
    if (right.length && (dx < -max / 2 || vx < -500)) { settle(-max); return; }
    settle(0);
  };
  return (
    <div data-noswipe className={`relative overflow-hidden select-none ${className}`}>
      {left && (
        <motion.button type="button" onClick={() => { settle(0); left.onAction(); }} style={{ opacity: leftOpacity, background: ACTION_BG[left.tone] }}
          className="absolute inset-y-0 left-0 flex w-1/2 items-center gap-2 pl-5 text-[13px] font-medium text-white">
          {left.icon}{left.label}
        </motion.button>
      )}
      {right.length > 0 && (
        <motion.div style={{ opacity: rightOpacity }} className="absolute inset-y-0 right-0 flex">
          {right.map(a => (
            <button key={a.label} type="button" onClick={() => { settle(0); a.onAction(); }} style={{ width: W, background: ACTION_BG[a.tone] }}
              className="flex flex-col items-center justify-center gap-1 text-[11.5px] font-medium text-white">{a.icon}{a.label}</button>
          ))}
        </motion.div>
      )}
      <motion.div drag="x" dragDirectionLock dragConstraints={{ left: right.length ? -max - 120 : 0, right: left ? W * 2 : 0 }} dragElastic={0.12}
        dragMomentum={false} onDragEnd={end} style={{ x, touchAction: 'pan-y' }} className={`relative ${rowClass}`}>
        {children}
      </motion.div>
    </div>
  );
}

/* ---------- Переключатель страниц, листается пальцем ---------- */

export interface PageDef<T extends string> { id: T; label: ReactNode; render: () => ReactNode }

/** Сегменты сверху и страницы под ними. Свайп по странице листает соседнюю; элементы с data-noswipe (календарь,
 *  график) свайп не забирают — у них свой жест */
export function Pager<T extends string>({ value, onChange, pages, className = '' }: { value: T; onChange: (v: T) => void; pages: PageDef<T>[]; className?: string }) {
  const index = pages.findIndex(p => p.id === value);
  const prev = useRef(index);
  const dir = index >= prev.current ? 1 : -1;
  useEffect(() => { prev.current = index; }, [index]);
  const controls = useDragControls();
  const go = (i: number) => { if (i >= 0 && i < pages.length && i !== index) onChange(pages[i].id); };
  const end = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -70 || info.velocity.x < -450) go(index + 1);
    else if (info.offset.x > 70 || info.velocity.x > 450) go(index - 1);
  };
  return (
    <div className={className}>
      <div className="relative mx-4 flex rounded-[15px] bg-surface-2 p-[3px]" role="tablist">
        {pages.map(p => (
          <button key={p.id} type="button" role="tab" aria-selected={p.id === value} onClick={() => onChange(p.id)}
            className={`relative flex-1 rounded-[12px] px-2 py-2 text-[13.5px] font-medium transition-colors ${p.id === value ? 'text-ink' : 'text-muted'}`}>
            {p.id === value && <motion.span layoutId={`pager-${pages.map(x => x.id).join('')}`} className="absolute inset-0 rounded-[12px] bg-surface shadow-[0_1px_3px_rgba(10,36,51,.12)]" transition={spring} />}
            <span className="relative">{p.label}</span>
          </button>
        ))}
      </div>
      <motion.div drag="x" dragListener={false} dragControls={controls} dragConstraints={{ left: 0, right: 0 }} dragElastic={0.18} dragDirectionLock onDragEnd={end}
        onPointerDown={e => { if (!(e.target as HTMLElement).closest('[data-noswipe],input,textarea,select')) controls.start(e); }}
        style={{ touchAction: 'pan-y' }} className="overflow-x-clip">
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.div key={value} custom={dir} variants={{
            enter: (d: number) => ({ x: d * 20, opacity: 0 }),
            center: { x: 0, opacity: 1 },
            exit: (d: number) => ({ x: -d * 20, opacity: 0, transition: { duration: 0.12, ease: ease.out } }),
          }} initial="enter" animate="center" exit="exit" transition={{ duration: 0.22, ease: ease.out }}>
            {pages[index]?.render()}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

/* ---------- Появление списков ---------- */

/** Первое появление списка: строки приходят снизу по очереди, быстро; дальше — без задержек */
export const list = { hidden: {}, show: { transition: { staggerChildren: 0.035, delayChildren: 0.05 } } };
export const item = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: ease.out } } };

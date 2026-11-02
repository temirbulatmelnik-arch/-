// Набор движений «Курса»: пружины, отклик под пальцем, цифры-табло, свайп строк, листание страниц пальцем.
// Всё на motion/react; «Уменьшение движения» на iPhone выключает сдвиги через MotionConfig в App.
import { animate, AnimatePresence, motion, useMotionValue, useReducedMotion, useTransform, type HTMLMotionProps } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { num } from '../domain/money';
import { haptic } from './haptics';

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

/** Сумма, разряды которой прокручиваются при изменении. Ключ разряда — место справа: новые тысячи выезжают слева.
 *  Сдвиг разрядов (layout) перемеряется, только когда меняется их число (layoutDependency): иначе каждая перерисовка
 *  заставляла бы motion обходить все анимированные элементы приложения */
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
              ? <motion.span key={key} layout="position" layoutDependency={chars.length} initial={{ opacity: 0, y: '-20%' }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: '20%', transition: snappy }} transition={soft}><Digit d={Number(c)} /></motion.span>
              : <motion.span key={`s${key}`} layout="position" layoutDependency={chars.length} className="inline-block w-[0.22em]" />;
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

/** Сумма досчитывает от from до to без перерисовки React: значение движения пишется прямо в текст */
export function CountTo({ to, from, className = '', ms = 1000 }: { to: number; from: number; className?: string; ms?: number }) {
  const mv = useMotionValue(from);
  const text = useTransform(mv, v => num(Math.round(v)));
  useEffect(() => {
    const c = animate(mv, to, { duration: ms / 1000, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [to, ms, mv]);
  return (
    <span className={`whitespace-nowrap tabular-nums ${className}`} aria-label={`${num(Math.round(to))} ₽`}>
      <motion.span aria-hidden="true">{text}</motion.span><span aria-hidden="true" className="ml-[0.12em] text-[0.62em] font-normal opacity-55">₽</span>
    </span>
  );
}

/* ---------- Жест пальцем по одной оси ---------- */

/**
 * Перетаскивание по одной оси на обычных событиях указателя — вместо drag из motion. У motion каждый элемент с drag
 * при любой перерисовке заново измеряет себя и обходит все анимированные элементы приложения (а вкладки живут
 * сразу все) — отсюда подвисания списков и календаря. Здесь: направление решается по первым 8 px; чужое направление
 * отдаём прокрутке страницы; после жеста нажатие (click) гасится, чтобы строка не открывалась.
 */
export function usePan({ axis, onMove, onEnd, accept }: {
  axis: 'x' | 'y';
  /** d — сдвиг пальца от начала жеста по своей оси */
  onMove: (d: number) => void;
  /** d — итоговый сдвиг, v — скорость, px/с */
  onEnd: (d: number, v: number) => void;
  /** начинать ли жест с этого места (например, не с календаря внутри страницы) */
  accept?: (target: Element) => boolean;
}) {
  const st = useRef<{ x0: number; y0: number; id: number; lock: 'x' | 'y' | null; last: number; lastT: number; v: number } | null>(null);
  const moved = useRef(false);
  const onPointerDown = (e: ReactPointerEvent) => {
    if ((e.pointerType === 'mouse' && e.button !== 0) || (accept && !accept(e.target as Element))) return;
    st.current = { x0: e.clientX, y0: e.clientY, id: e.pointerId, lock: null, last: 0, lastT: e.timeStamp, v: 0 };
    moved.current = false;
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const s = st.current;
    if (!s || e.pointerId !== s.id) return;
    const dx = e.clientX - s.x0, dy = e.clientY - s.y0;
    if (!s.lock) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      s.lock = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (s.lock !== axis) { st.current = null; return; }
      moved.current = true;
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    }
    const d = axis === 'x' ? dx : dy;
    const dt = e.timeStamp - s.lastT;
    if (dt > 0) s.v = ((d - s.last) / dt) * 1000;
    s.last = d; s.lastT = e.timeStamp;
    onMove(d);
  };
  const finish = (e: ReactPointerEvent) => {
    const s = st.current;
    st.current = null;
    if (!s || s.lock !== axis) return;
    onEnd(s.last, e.timeStamp - s.lastT > 90 ? 0 : s.v);
  };
  // нажатие после жеста не считается нажатием
  const onClickCapture = (e: ReactMouseEvent) => { if (moved.current) { moved.current = false; e.stopPropagation(); e.preventDefault(); } };
  return { onPointerDown, onPointerMove, onPointerUp: finish, onPointerCancel: finish, onClickCapture };
}

/** сопротивление за краем, как резинка: за пределом сдвиг идёт с коэффициентом k */
const rubber = (v: number, min: number, max: number, k: number) => (v < min ? min + (v - min) * k : v > max ? max + (v - max) * k : v);

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
  const settle = (to: number, velocity = 0) => animate(x, to, { ...fling, velocity });
  // щелчок, когда свайп дошёл до порога действия — отпустите, и оно сработает
  const armed = useRef(false);
  const from = useRef(0);
  const lo = right.length ? -max - 120 : 0, hi = left ? W * 2 : 0;
  const pan = usePan({
    axis: 'x',
    onMove: d => {
      if (d === 0) return;
      const at = from.current + d;
      x.set(rubber(at, lo, hi, 0.12));
      const on = (!!left && at > W * 1.6) || (right.length > 0 && at < -max - 90);
      if (on !== armed.current) { armed.current = on; if (on) haptic(); }
    },
    onEnd: (d, vx) => {
      armed.current = false;
      const at = from.current + d;
      if (left && (at > W * 1.6 || (at > W * 0.6 && vx > 500))) { settle(0); left.onAction(); return; }
      if (right.length && (at < -max - 90)) { settle(0); right[right.length - 1].onAction(); return; }
      if (right.length && (at < -max / 2 || vx < -500)) { settle(-max, vx); return; }
      settle(0, vx);
    },
  });
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
      <motion.div {...pan} onPointerDown={e => { from.current = x.get(); x.stop(); pan.onPointerDown(e); }}
        style={{ x, touchAction: 'pan-y' }} className={`relative ${rowClass}`}>
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
  const index = Math.max(0, pages.findIndex(p => p.id === value));
  const prev = useRef(index);
  const dir = index >= prev.current ? 1 : -1;
  useEffect(() => { prev.current = index; }, [index]);
  // страница собирается при первом показе и дальше живёт скрытой: переключение — только показать готовое
  const [seen, setSeen] = useState<ReadonlySet<T>>(() => new Set([value]));
  useEffect(() => { setSeen(s => (s.has(value) ? s : new Set(s).add(value))); }, [value]);
  const go = (i: number) => { if (i >= 0 && i < pages.length && i !== index) { haptic(); onChange(pages[i].id); } };
  // новая страница чуть въезжает со стороны листания — WAAPI, мимо основного потока
  const boxes = useRef(new Map<T, HTMLDivElement>());
  const reduce = useReducedMotion();
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) { first.current = false; return; }
    boxes.current.get(value)?.animate(reduce ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: `translateX(${dir * 20}px)` }, { opacity: 1, transform: 'none' }],
      { duration: 220, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
  }, [value]);
  // скрытая страница получает тот же элемент, что в прошлый раз, — React её не перерисовывает; видимая — свежая
  const rendered = useRef(new Map<T, ReactNode>());
  const content = (p: PageDef<T>) => {
    let el = rendered.current.get(p.id);
    if (p.id === value || el === undefined) { el = p.render(); rendered.current.set(p.id, el); }
    return el;
  };
  // свайп по странице: содержимое идёт за пальцем с сопротивлением, дальше порога — соседняя страница
  const x = useMotionValue(0);
  const pan = usePan({
    axis: 'x',
    accept: t => !t.closest('[data-noswipe],input,textarea,select'),
    onMove: d => x.set(d * 0.18),
    onEnd: (d, v) => {
      animate(x, 0, spring);
      if (d < -70 || v < -450) go(index + 1);
      else if (d > 70 || v > 450) go(index - 1);
    },
  });
  return (
    <div className={className}>
      <div className="relative mx-4 grid rounded-[15px] bg-surface-2 p-[3px]" style={{ gridTemplateColumns: `repeat(${pages.length}, minmax(0, 1fr))` }} role="tablist">
        {/* подложка выбранной страницы — CSS-переход по transform, без общей layout-анимации */}
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-[3px] left-[3px] rounded-[12px] bg-surface shadow-[0_1px_3px_rgba(10,36,51,.12)] transition-transform duration-[350ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
          style={{ width: `calc((100% - 6px) / ${pages.length})`, transform: `translateX(${index * 100}%)` }} />
        {pages.map(p => (
          <button key={p.id} type="button" role="tab" aria-selected={p.id === value} onClick={() => go(pages.indexOf(p))}
            className={`relative rounded-[12px] px-2 py-2 text-[13.5px] font-medium transition-colors ${p.id === value ? 'text-ink' : 'text-muted'}`}>
            {p.label}
          </button>
        ))}
      </div>
      <motion.div {...pan} style={{ x, touchAction: 'pan-y' }} className="overflow-x-clip">
        {pages.filter(p => seen.has(p.id) || p.id === value).map(p => (
          <div key={p.id} hidden={p.id !== value} ref={el => { if (el) boxes.current.set(p.id, el); else boxes.current.delete(p.id); }}>{content(p)}</div>
        ))}
      </motion.div>
    </div>
  );
}

/* ---------- Появление списков ---------- */

/** Первое появление списка: строки приходят снизу по очереди, быстро; дальше — без задержек */
/** Каскад появления списка: при первом показе вкладки его нет — содержимое сразу на месте, вкладка открывается
 *  мгновенно; при смене фильтра или месяца — есть, это ответ на действие. Вернуть в initial у motion-обёртки списка */
export function useEnter(): 'hidden' | false {
  const shown = useRef(false);
  useEffect(() => { shown.current = true; }, []);
  return shown.current ? 'hidden' : false;
}

export const list = { hidden: {}, show: { transition: { staggerChildren: 0.035, delayChildren: 0.05 } } };
export const item = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: ease.out } } };

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

/* ---------- Лента: текущая страница и соседние по бокам ---------- */

/** Положения пружины по кадрам (60 в секунду) от 0 до 1 — критическое затухание, без отскока. v — начальная скорость
 *  в долях пути за секунду: лента продолжает движение пальца, а не начинает его заново (навык apple-design) */
function springPath(v: number): number[] {
  const k = 380, c = 2 * Math.sqrt(k), dt = 1 / 480;
  // скорость больше собственной частоты пружины дала бы перелёт за край — край пуст, соседа за соседом нет
  let x = 0, s = Math.max(-3, Math.min(Math.sqrt(k) * 0.8, v)), t = 0, frame = 1;
  const out = [0];
  while (t < 1) {
    s += (k * (1 - x) - c * s) * dt; x += s * dt; t += dt;
    if (t >= frame / 60) { out.push(Math.min(1, x)); frame++; }
    if (1 - x < 0.002 && Math.abs(s) < 0.05) break;
  }
  out.push(1);
  return out;
}

/**
 * Лента из трёх страниц: prev — слева, current — на месте, next — справа. Лента идёт за пальцем; отпустили дальше
 * трети ширины или бросили — доезжает пружиной до соседней и только потом зовёт onShift: ключи сдвигаются, соседняя
 * страница становится текущей тем же DOM (без пересборки), а с дальнего края собирается новая, невидимая.
 * Доезд — WAAPI по ключевым кадрам пружины: его ведёт видеокарта, он не встаёт, даже если основной поток занят.
 * Высота — по текущей странице (heightOf, без измерений); при листании плавно меняется на высоту соседней.
 * control — для стрелок: та же анимация, что от пальца; false — лента скрыта, менять сразу.
 */
export function Flip({ keys, render, heightOf, onShift, control, gap = 24, className = '' }: {
  keys: readonly [string, string, string];
  render: (key: string, slot: -1 | 0 | 1) => ReactNode;
  heightOf: (key: string) => number;
  onShift: (dir: 1 | -1) => void;
  control?: { current: ((dir: 1 | -1) => boolean) | null };
  /** расстояние между страницами во время листания, px — это поля по бокам */
  gap?: number;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const pos = useRef(0);
  const anim = useRef<Animation | null>(null);
  /** куда едет пружина: 1 — к следующей, −1 — к предыдущей, 0 — обратно на место */
  const going = useRef<1 | -1 | 0>(0);
  /** сдвиг отдан в onShift, ключи ещё не сменились */
  const shifted = useRef<1 | -1 | 0>(0);
  /** нажатия стрелок, пока лента едет: +2 — ещё две вперёд */
  const queue = useRef(0);
  const drag = useRef<{ from: number } | null>(null);
  const reduce = useReducedMotion();
  const cur = keys[1];

  const put = (v: number) => { pos.current = v; if (strip.current) strip.current.style.transform = v ? `translate3d(${v}px,0,0)` : ''; };
  const lift = (on: boolean) => { if (strip.current) strip.current.style.willChange = on ? 'transform' : ''; };
  const height = (key: string) => {
    const el = box.current;
    if (!el) return;
    el.style.transition = reduce ? '' : 'height .4s cubic-bezier(.32,.72,0,1)';
    el.style.height = `${heightOf(key)}px`;
  };
  /** остановить пружину там, где она сейчас: палец перехватывает ленту */
  const grab = () => {
    const a = anim.current, el = strip.current;
    if (!a || !el) return;
    const t = getComputedStyle(el).transform;
    const x = t && t !== 'none' ? new DOMMatrixReadOnly(t).m41 : 0;
    a.cancel(); anim.current = null; going.current = 0;
    put(x);
  };
  const settle = (dir: 1 | -1 | 0, v = 0) => {
    const el = strip.current, w = box.current?.clientWidth ?? 0;
    if (!el) return;
    const from = pos.current, to = -dir * w;
    going.current = dir;
    height(keys[1 + dir]);
    const done = () => {
      anim.current = null; going.current = 0;
      put(to);
      if (dir) { shifted.current = dir; onShift(dir); } else lift(false);
    };
    if (reduce || !w || Math.abs(to - from) < 1) { done(); return; }
    const path = springPath(v / (to - from));
    const a = el.animate(path.map(p => ({ transform: `translate3d(${(from + (to - from) * p).toFixed(2)}px,0,0)` })),
      { duration: ((path.length - 1) * 1000) / 60, easing: 'linear' });
    anim.current = a;
    // конечное положение — сразу в стиль: анимация лежит поверх и, закончившись, просто снимается
    put(to);
    a.onfinish = () => { if (anim.current === a) done(); };
  };

  const pan = usePan({
    axis: 'x',
    onMove: d => {
      // палец перехватил ленту — нажатые до этого стрелки больше не в счёт
      if (!drag.current) { grab(); lift(true); queue.current = 0; drag.current = { from: pos.current }; }
      const w = box.current?.clientWidth ?? 0;
      put(rubber(drag.current.from + d, -w, w, 0.2));
    },
    onEnd: (_, v) => {
      drag.current = null;
      const w = box.current?.clientWidth ?? 0, at = pos.current;
      // бросок решает сам, иначе — дальше трети ширины
      const dir = v < -350 ? 1 : v > 350 ? -1 : at < -w * 0.3 ? 1 : at > w * 0.3 ? -1 : 0;
      settle(dir, v);
    },
  });

  // ключи сменились: соседняя страница встала на место текущей — сдвигаем ленту на ширину, на экране всё как было
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) { first.current = false; return; }
    const dir = shifted.current, w = box.current?.clientWidth ?? 0;
    shifted.current = 0;
    if (dir) {
      put(pos.current + dir * w);
      if (drag.current) drag.current.from += dir * w;
    } else {
      // месяц сменили извне (например, нажали на название) — без ленты, страница просто проявляется
      anim.current?.cancel(); anim.current = null; going.current = 0; queue.current = 0;
      put(0);
      if (!reduce) strip.current?.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 240, easing: 'cubic-bezier(.23,1,.32,1)' });
    }
    if (box.current) { box.current.style.transition = ''; box.current.style.height = `${heightOf(cur)}px`; }
    if (!drag.current) lift(false);
    const q = queue.current;
    if (q && !drag.current) { const d = q > 0 ? 1 : -1; queue.current -= d; lift(true); settle(d); }
  }, [cur]);

  const go = (dir: 1 | -1) => {
    if (!box.current?.clientWidth) return false;
    if (drag.current) return true;
    // едем к соседней или ждём смены ключей — стрелка встаёт в очередь
    if ((anim.current && going.current) || shifted.current) { queue.current += dir; return true; }
    grab(); lift(true); settle(dir);
    return true;
  };
  useEffect(() => {
    if (!control) return;
    control.current = go;
    return () => { control.current = null; };
  });

  return (
    <div ref={box} {...pan} className={`relative overflow-hidden select-none ${className}`} style={{ height: heightOf(cur), touchAction: 'pan-y' }}>
      <div ref={strip} className="absolute inset-0">
        {keys.map((k, i) => (
          <div key={k} inert={i !== 1} aria-hidden={i !== 1 || undefined} className="absolute top-0" style={{
            left: gap / 2, right: gap / 2, transform: i === 1 ? undefined : `translateX(calc(${i - 1} * (100% + ${gap}px)))`,
          }}>
            {render(k, (i - 1) as -1 | 0 | 1)}
          </div>
        ))}
      </div>
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

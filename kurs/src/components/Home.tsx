// Части «Сегодня» версии 0.3: один следующий шаг вместо стопки карточек, быстрые траты одной кнопкой и плитки-входы
// «Траты» и «Долги» (вкладок теперь две: «Сегодня» и «Впереди»).
import { Anchor, ChevronRight, History, ReceiptText } from 'lucide-react';
import { AnimatePresence, motion, useMotionValue } from 'motion/react';
import type { CSSProperties, ReactNode } from 'react';
import type { QuickSpend } from '../domain/quick';
import { CATEGORY } from '../domain/plan';
import type { CategoryId } from '../domain/types';
import { haptic } from './haptics';
import { Roll, usePan } from './motion';
import { CAT_COLOR, CatIcon, Money } from './ui';

/* ---------- Следующий шаг ---------- */

export interface Step {
  id: string;
  /** цвет по смыслу: платёж — закат, поступление — отмель, дело — золото, сверка — сумерки, спокойно — Нева */
  tone: 'out' | 'in' | 'todo' | 'rsv' | 'calm';
  kicker: string;
  title: ReactNode;
  amount?: ReactNode;
  text?: ReactNode;
  primary: { label: string; run: () => void };
  /** второе действие; без него — «Позже» */
  secondary?: { label: string; run: () => void };
  /** спокойный шаг: смахнуть нельзя, это не дело, а справка */
  calm?: boolean;
}

const TONE: Record<Step['tone'], { bg: string; line: string; ink: string }> = {
  out: { bg: 'var(--stack-ahead)', line: 'var(--stack-ahead-line)', ink: 'var(--stack-ahead-kicker)' },
  in: { bg: 'linear-gradient(155deg, color-mix(in oklab, var(--pos) 16%, var(--surface)), color-mix(in oklab, var(--pos) 26%, var(--surface)) 70%)', line: 'color-mix(in oklab, var(--pos) 35%, var(--line))', ink: 'var(--pos)' },
  todo: { bg: 'var(--stack-todo)', line: 'var(--stack-todo-line)', ink: 'var(--stack-todo-kicker)' },
  rsv: { bg: 'var(--stack-money)', line: 'var(--stack-money-line)', ink: 'var(--stack-money-kicker)' },
  calm: { bg: 'var(--stack-today)', line: 'var(--stack-today-line)', ink: 'var(--stack-today-kicker)' },
};

/** Один шаг за раз: приложение само говорит, что сделать сейчас. Сделали или отложили — карточка улетает, выезжает
 *  следующая. Смахнуть влево — «позже». Под карточкой — сколько шагов ещё */
export function NextStep({ steps, onLater }: { steps: Step[]; onLater: (id: string) => void }) {
  const step = steps[0];
  const x = useMotionValue(0);
  const pan = usePan({
    axis: 'x',
    accept: () => !!step && !step.calm,
    onMove: d => x.set(d < 0 ? d : d * 0.15),
    onEnd: (d, v) => { if (step && (d < -90 || v < -500)) { haptic(); onLater(step.id); } x.set(0); },
  });
  if (!step) return null;
  const t = TONE[step.tone];
  return (
    <div>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.section key={step.id} {...pan} style={{ x, background: t.bg, borderColor: t.line, touchAction: 'pan-y' }}
          initial={{ opacity: 0, x: 48, scale: 0.97 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: -64, scale: 0.96, transition: { duration: 0.18 } }}
          transition={{ type: 'spring', bounce: 0.18, duration: 0.45 }}
          className="relative overflow-hidden rounded-[24px] border px-[18px] pt-4 pb-3.5 shadow-[0_14px_30px_-22px_rgba(10,36,51,.5)]">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-medium" style={{ color: t.ink }}>{step.kicker}</div>
              <div className="mt-0.5 text-[17px] leading-snug font-medium">{step.title}</div>
              {step.text && <div className="mt-1 text-[13px] leading-snug text-muted">{step.text}</div>}
            </div>
            {step.amount != null && <div className="figure shrink-0 pt-4 text-[19px]">{step.amount}</div>}
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={step.primary.run}
              className="h-11 flex-1 rounded-[15px] text-[14.5px] font-medium text-white transition-transform duration-100 active:scale-[.97]" style={{ background: t.ink }}>
              {step.primary.label}
            </button>
            {!step.calm && (
              <button type="button" onClick={() => (step.secondary ? step.secondary.run() : onLater(step.id))}
                className="h-11 rounded-[15px] px-4 text-[14px] font-medium transition-transform duration-100 active:scale-[.97]" style={{ background: 'color-mix(in oklab, var(--ink) 8%, transparent)' }}>
                {step.secondary?.label ?? 'Позже'}
              </button>
            )}
          </div>
        </motion.section>
      </AnimatePresence>
      {steps.length > 1 && (
        <div className="mt-2 flex items-center justify-center gap-1.5" aria-label={`Шагов: ${steps.length}`}>
          {steps.slice(0, 6).map((s, i) => <span key={s.id} className={`h-1.5 rounded-full transition-all duration-300 ${i === 0 ? 'w-4 bg-ink/60' : 'w-1.5 bg-ink/20'}`} />)}
          <span className="ml-1 text-[11.5px] text-faint">ещё {steps.length - 1}</span>
        </div>
      )}
    </div>
  );
}

/* ---------- Быстрые траты ---------- */

/** Монета летит от нажатой кнопки к кольцу дня: трата «упала в воду». WAAPI, без React */
export function flyCoin(from: Element, color = '#f47a3a') {
  const ring = document.querySelector('main:not([hidden]) [data-ring]');
  if (!ring || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const a = from.getBoundingClientRect(), b = ring.getBoundingClientRect();
  const x0 = a.left + a.width / 2, y0 = a.top + a.height / 2, x1 = b.left + b.width / 2, y1 = b.top + b.height / 2;
  const coin = document.createElement('div');
  coin.style.cssText = `position:fixed;left:${x0 - 9}px;top:${y0 - 9}px;width:18px;height:18px;border-radius:9px;z-index:60;pointer-events:none;background:radial-gradient(circle at 35% 30%,#fff8,${color});box-shadow:0 4px 10px -2px ${color}`;
  document.body.appendChild(coin);
  const dx = x1 - x0, dy = y1 - y0;
  coin.animate([
    { transform: 'translate(0,0) scale(1)', opacity: 1 },
    { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 70}px) scale(1.25)`, opacity: 1, offset: 0.55 },
    { transform: `translate(${dx}px, ${dy}px) scale(.4)`, opacity: 0.2 },
  ], { duration: 620, easing: 'cubic-bezier(.3,.6,.4,1)' }).onfinish = () => {
    coin.remove();
    ring.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 380, easing: 'cubic-bezier(.3,1.5,.5,1)' });
  };
}

/* ---------- Переезд вкладок ---------- */

const GHOST_ICON: Record<string, string> = {
  // те же значки, что были у вкладок: чек и якорь (контуры lucide)
  budget: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M14 8H8"/><path d="M16 12H8"/><path d="M13 16H8"/>',
  plan: '<path d="M12 22V8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/><circle cx="12" cy="5" r="3"/>',
};

/** Первый запуск новой версии: «Траты» и «Долги» появляются внизу, там, где были их кнопки, и на глазах перелетают
 *  в свои плитки на «Сегодня» — видно, куда они переехали. Страница сама прокручивается к плиткам. WAAPI, без React */
export function flyTabs() {
  const page = document.querySelector('main:not([hidden])');
  const bar = document.querySelector('nav[aria-label="Разделы"] .bar-glass');
  const first = page?.querySelector<HTMLElement>('[data-entry="budget"]');
  if (!page || !bar || !first || document.querySelector('[role="dialog"]')) return;
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // плитки — в верхнюю половину экрана, над панелью
  const top = Math.max(0, first.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.4);
  window.scrollTo({ top, behavior: calm ? 'auto' : 'smooth' });
  let still = 0, last = -1, frames = 0;
  const wait = () => {
    still = Math.abs(window.scrollY - last) < 0.5 ? still + 1 : 0;
    last = window.scrollY;
    if (still < 4 && ++frames < 90) { requestAnimationFrame(wait); return; }
    const b = bar.getBoundingClientRect();
    // прежняя панель была в пять колонок: «Траты» — четвёртая, «Долги» — пятая
    ([['budget', 'Траты', 0.7], ['plan', 'Долги', 0.9]] as const).forEach(([id, label, at], i) => {
      const tile = page.querySelector<HTMLElement>(`[data-entry="${id}"]`);
      if (!tile) return;
      const land = () => tile.animate(
        [{ transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(255,255,255,0)' }, { transform: 'scale(1.06)', boxShadow: '0 0 0 4px rgba(255,255,255,.75)', offset: 0.35 }, { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(255,255,255,0)' }],
        { duration: 620, easing: 'cubic-bezier(.3,1.4,.5,1)' });
      if (calm) { land(); return; }
      const r = tile.getBoundingClientRect();
      const x0 = b.left + b.width * at, y0 = b.top + b.height / 2, x1 = r.left + r.width / 2, y1 = r.top + r.height / 2;
      const ghost = document.createElement('div');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.style.cssText = `position:fixed;left:${x0 - 34}px;top:${y0 - 27}px;width:68px;height:54px;border-radius:20px;z-index:55;pointer-events:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;color:#fff;font-size:11px;font-weight:500;background:${id === 'budget' ? 'var(--deep-sea)' : 'var(--deep-dusk)'};box-shadow:0 14px 28px -12px rgba(4,14,22,.7), inset 0 1px 0 rgba(255,255,255,.3)`;
      ghost.innerHTML = `<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${GHOST_ICON[id]}</svg><span>${label}</span>`;
      document.body.appendChild(ghost);
      const dx = x1 - x0, dy = y1 - y0;
      ghost.animate([
        { transform: 'translate(0,0) scale(.5)', opacity: 0 },
        { transform: 'translate(0,0) scale(1.08)', opacity: 1, offset: 0.16 },
        { transform: 'translate(0,0) scale(1)', opacity: 1, offset: 0.4, easing: 'cubic-bezier(.5,0,.2,1)' },
        { transform: `translate(${dx * 0.55}px, ${dy * 0.7 - 46}px) scale(1.25)`, opacity: 1, offset: 0.78 },
        { transform: `translate(${dx}px, ${dy}px) scale(${Math.min(2.2, r.width / 68)})`, opacity: 0 },
      ], { duration: 1500, delay: i * 220, fill: 'both', easing: 'ease-out' }).onfinish = () => { ghost.remove(); land(); haptic(); };
    });
  };
  requestAnimationFrame(wait);
}

/** Частые траты одной кнопкой и «как вчера»; пусто — подсказка, откуда они возьмутся */
export function QuickSpends({ items, yesterday, onSpend, onYesterday }: {
  items: QuickSpend[]; yesterday: { count: number; sum: number } | null;
  onSpend: (q: QuickSpend, el: Element) => void; onYesterday: (el: Element) => void;
}) {
  if (!items.length && !yesterday) return null;
  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-0.5" data-noswipe>
      {yesterday && (
        <button type="button" onClick={e => onYesterday(e.currentTarget)}
          className="flex h-[52px] shrink-0 items-center gap-2.5 rounded-[18px] bg-surface pr-3.5 pl-2 text-left shadow-[0_1px_2px_rgba(10,36,51,.06),0_10px_24px_-18px_rgba(10,36,51,.45)] transition-transform duration-100 active:scale-[.95]">
          <span className="dot-tile size-9" style={{ '--c': 'var(--own)' } as CSSProperties}><History size={18} strokeWidth={1.9} /></span>
          <span><span className="block text-[13.5px] leading-tight font-medium">Как вчера</span><span className="block text-[11.5px] leading-tight text-muted">{yesterday.count} на <Money value={yesterday.sum} /></span></span>
        </button>
      )}
      {items.map(q => (
        <button key={q.key} type="button" onClick={e => onSpend(q, e.currentTarget)} aria-label={`Записать: ${q.note ?? CATEGORY[q.category].short}, ${q.amount} ₽`}
          className="flex h-[52px] shrink-0 items-center gap-2.5 rounded-[18px] bg-surface pr-3.5 pl-2 text-left shadow-[0_1px_2px_rgba(10,36,51,.06),0_10px_24px_-18px_rgba(10,36,51,.45)] transition-transform duration-100 active:scale-[.95]">
          <CatIcon id={q.category} className="size-9 !rounded-[11px]" />
          <span><span className="block max-w-[110px] truncate text-[13.5px] leading-tight font-medium">{q.note ?? CATEGORY[q.category].short}</span><span className="block text-[11.5px] leading-tight text-muted"><Money value={q.amount} /></span></span>
        </button>
      ))}
    </div>
  );
}

/* ---------- Входы «Траты» и «Долги» ---------- */

/** Две плитки на месте прежних вкладок: те же значки и названия, внутри — те же экраны целиком */
export function EntryTiles({ spent, limit, shares, debt, melted, onSpend, onDebts }: {
  spent: number; limit: number; shares: { id: CategoryId; share: number }[];
  debt: number; melted: number; onSpend: () => void; onDebts: () => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={onSpend} data-entry="budget" className="deep-card px-4 pt-3.5 pb-3.5 text-left transition-transform duration-100 active:scale-[.97]">
        <span className="flex items-center justify-between text-[12.5px] text-card-muted"><span className="flex items-center gap-1.5"><ReceiptText size={15} strokeWidth={1.7} />Траты месяца</span><ChevronRight size={15} /></span>
        <span className="figure mt-1 block text-[22px] leading-tight"><Roll value={spent} /></span>
        <span className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-card/15">
          {shares.map(s => <span key={s.id} className="h-full" style={{ width: `${s.share * 100}%`, background: CAT_COLOR[s.id] }} />)}
        </span>
        <span className="mt-1.5 block text-[11.5px] text-card-muted">из <Money value={limit} /> по плану</span>
      </button>
      <button type="button" onClick={onDebts} data-entry="plan" className="deep-card deep-dusk px-4 pt-3.5 pb-3.5 text-left transition-transform duration-100 active:scale-[.97]">
        <span className="flex items-center justify-between text-[12.5px] text-card-muted"><span className="flex items-center gap-1.5"><Anchor size={15} strokeWidth={1.7} />Долги</span><ChevronRight size={15} /></span>
        <span className="figure mt-1 block text-[22px] leading-tight"><Roll value={debt} /></span>
        <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-card/15"><span className="block h-full rounded-full bg-card-sea" style={{ width: `${Math.min(100, Math.max(2, (melted / Math.max(1, debt + melted)) * 100))}%` }} /></span>
        <span className="mt-1.5 block text-[11.5px] text-card-muted">{melted > 0 ? <>уже растаяло <Money value={melted} /></> : 'курс к свободе'}</span>
      </button>
    </div>
  );
}

// «Остров» — как Dynamic Island на iPhone, из жидкого стекла (вариант «Тонированное» — решение владельца, DESIGN.md).
// Когда шапка экрана уехала вверх, сверху выкатывается капсула: кольцо и сколько ещё можно сегодня. Нажатие — капсула
// перетекает в панель: сегодня, неделя, ближайший платёж и быстрые действия. Свайп вверх, нажатие мимо или Escape —
// обратно в капсулу (навык apple-design: из источника и обратно в источник).
// Движение — CSS-переходы размеров и transform (классы lg-* в index.css), без layout-анимаций и drag из motion:
// те при каждой перерисовке обходили бы все анимированные элементы приложения (README, «Скорость»).
import { CalendarClock, Plus, Scale, ScanText } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { eventsBetween } from '../domain/calendar';
import { addDays, dayMonth } from '../domain/dates';
import { dayBudget, weekSummary } from '../domain/summary';
import { useStore } from '../store/store';
import { useCal, useToday, useUi } from '../store/ui';
import { haptic } from './haptics';
import { Roll, usePan } from './motion';
import { runQuick } from './TabBar';
import { Money } from './ui';

function MiniRing({ frac, over, size, stroke = 3 }: { frac: number; over: boolean; size: number; stroke?: number }) {
  const r = size / 2 - stroke, L = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} style={{ stroke: 'var(--lg-track)' }} />
      {/* смещение дуги — в style: переход срабатывает на изменение стиля, а не атрибута */}
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={L}
        className="transition-[stroke-dashoffset] duration-700 ease-[cubic-bezier(.32,.72,0,1)]"
        style={{ stroke: over ? 'var(--neg)' : 'var(--sea)', strokeDashoffset: L * (1 - Math.min(1, Math.max(0, over ? 1 : frac))) }} />
    </svg>
  );
}

export function Island({ show }: { show: boolean }) {
  const now = useToday();
  const cal = useCal();
  const [expenses, debts, overrides, marks] = useStore(useShallow(s => [s.expenses, s.debts, s.weeklyOverrides, s.marks] as const));
  const set = useUi(s => s.set);
  const [open, setOpen] = useState(false);
  const b = useMemo(() => dayBudget(expenses, debts, overrides, now), [expenses, debts, overrides, now]);
  const w = useMemo(() => weekSummary(expenses, debts, overrides, now), [expenses, debts, overrides, now]);
  const next = useMemo(() => eventsBetween(cal, addDays(now, -20), addDays(now, 10)).find(e => e.kind === 'payment' && !marks[e.key]?.done), [cal, now, marks]);
  // как кольцо на «Сегодня»: сколько ещё можно сегодня, без «минуса»; сверх нормы или лимит недели исчерпан — красным
  const over = b.mode !== 'ok';
  const frac = b.day > 0 ? b.canSpend / b.day : 0;
  const act = (fn: () => void) => { setOpen(false); window.setTimeout(fn, 160); };

  // в документе — пока виден и пока уходит; ушёл — снимаем, чтобы стекло не размывало фон впустую.
  // Появление: кадр в положении «ушёл» (lg-gone), затем класс снимается — капсула выкатывается пружиной
  const [mounted, setMounted] = useState(show);
  const [gone, setGone] = useState(true);
  useEffect(() => {
    if (show) {
      setMounted(true);
      let id2 = 0;
      const id1 = requestAnimationFrame(() => { id2 = requestAnimationFrame(() => setGone(false)); });
      return () => { cancelAnimationFrame(id1); cancelAnimationFrame(id2); };
    }
    setOpen(false);
    setGone(true);
    const t = window.setTimeout(() => setMounted(false), 320);
    return () => window.clearTimeout(t);
  }, [show]);

  // размеры для перетекания: капсула — по содержимому, панель — по высоте содержимого (меняются вместе с суммами)
  const el = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ pw: 180, ph: 320 });
  useLayoutEffect(() => {
    if (!mounted) return;
    const measure = () => setSize(s => {
      const pw = Math.ceil(pill.current?.offsetWidth ?? s.pw), ph = Math.ceil(panel.current?.offsetHeight ?? s.ph);
      return pw === s.pw && ph === s.ph ? s : { pw, ph };
    });
    measure();
    const ro = new ResizeObserver(measure);
    if (pill.current) ro.observe(pill.current);
    if (panel.current) ro.observe(panel.current);
    return () => ro.disconnect();
  }, [mounted]);
  const wide = Math.round(Math.min(window.innerWidth * 0.92, 392));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // свет из точки касания и лёгкое «вздутие» стекла под пальцем — классы и переменные прямо на элементе, без перерисовки
  const light = (e: ReactPointerEvent) => {
    const n = el.current;
    if (!n) return;
    const r = n.getBoundingClientRect();
    n.style.setProperty('--tx', `${e.clientX - r.left}px`);
    n.style.setProperty('--ty', `${e.clientY - r.top}px`);
    n.classList.add('lg-lit');
    if (!open) n.classList.add('lg-press');
  };
  const unlight = () => el.current?.classList.remove('lg-lit', 'lg-press');
  // раскрытую панель можно смахнуть вверх: идёт за пальцем, вниз — почти не пускает
  const pan = usePan({
    axis: 'y',
    accept: () => open,
    onMove: d => { const n = el.current; if (n) { n.style.transition = 'none'; n.style.transform = `translateY(${d < 0 ? d * 0.5 : d * 0.08}px)`; } },
    onEnd: (d, v) => {
      const n = el.current;
      if (n) { n.style.transition = ''; n.style.transform = ''; }
      if (d < -24 || v < -300) setOpen(false);
    },
  });

  if (!mounted) return null;
  const pct = Math.round(Math.max(0, Math.min(1, frac)) * 100);
  const weekPct = Math.min(100, Math.max(0, (w.left / Math.max(1, w.limit)) * 100));
  const chip = { background: 'var(--lg-chip)' };
  return (
    <>
      <div aria-hidden="true" onClick={() => setOpen(false)}
        className={`fixed inset-0 z-[44] bg-[rgba(4,14,22,.22)] transition-opacity duration-300 ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`} />
      <div ref={el} role="button" tabIndex={0} aria-expanded={open}
        aria-label={open ? 'Свернуть' : `${b.mode === 'week' ? 'Лимит недели исчерпан' : b.mode === 'day' ? 'Сегодня сверх нормы' : `Сегодня можно ${Math.round(b.canSpend)} ₽`}. Раскрыть`}
        onClick={() => { if (!open) { setOpen(true); haptic(); } }}
        onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) setOpen(!open); }}
        onPointerDown={e => { light(e); pan.onPointerDown(e); }} onPointerMove={pan.onPointerMove}
        onPointerUp={e => { unlight(); pan.onPointerUp(e); }} onPointerCancel={e => { unlight(); pan.onPointerCancel(e); }}
        onPointerLeave={unlight} onClickCapture={pan.onClickCapture}
        className={`lg lg-morph fixed inset-x-0 top-[calc(env(safe-area-inset-top)+22px)] z-[45] mx-auto text-ink select-none ${open ? 'lg-open' : 'cursor-pointer'} ${gone ? 'lg-gone' : ''}`}
        style={{ width: open ? wide : size.pw, height: open ? size.ph : 44, borderRadius: open ? 32 : 22, touchAction: open ? 'none' : 'manipulation' }}>
        {/* слои стекла — соседи содержимого, а не его предки: прозрачность или фильтр на предке отрезали бы стекло
            от того, что под ним */}
        <div className="lg-layer lg-glass lg-fade" />
        <div className="lg-layer lg-shine lg-fade" />
        <div className="lg-layer lg-touch" />
        <div className="lg-layer lg-rim lg-fade" />
        <div className="lg-layer lg-fade pointer-events-auto overflow-hidden">
          <div ref={pill} className="lg-pill absolute top-0 left-0 flex h-11 items-center gap-2.5 pr-4 pl-2 whitespace-nowrap">
            <MiniRing frac={frac} over={over} size={30} />
            <span className={`font-display text-[16px] font-medium ${over ? 'text-neg' : ''}`}><Roll value={b.canSpend} /></span>
            <span className="text-[12.5px] text-muted">{b.mode === 'week' ? (b.nextWeek ? 'до понедельника' : 'до воскресенья') : b.mode === 'day' ? 'сверх нормы' : 'сегодня'}</span>
          </div>
          <div ref={panel} className="lg-panel absolute top-0 left-0 px-[18px] pt-3 pb-[18px]" style={{ width: wide }}>
            <div className="mx-auto mb-3 h-1 w-9 rounded-full" style={{ background: 'var(--lg-track)' }} />
            <div className="flex items-center gap-4">
              <div className="relative grid size-16 shrink-0 place-items-center">
                <div className="absolute inset-0"><MiniRing frac={frac} over={over} size={64} stroke={4} /></div>
                <span className="text-[11px] text-muted">{over ? 0 : pct}%</span>
              </div>
              <div className="min-w-0">
                <div className="text-[12.5px] text-muted">{b.mode === 'week' ? 'Лимит недели исчерпан' : b.mode === 'day' ? <>Сегодня сверх нормы на <Money value={b.overDay} /></> : 'Сегодня можно ещё'}</div>
                <div className={`font-display text-[30px] leading-tight font-medium ${over ? 'text-neg' : ''}`}><Roll value={b.canSpend} /></div>
                <div className="text-[12.5px] text-muted">
                  {b.mode === 'week' ? <>потрачено сегодня <Money value={b.spentToday} />{b.weekLeft < 0 && <>, перерасход недели <Money value={-b.weekLeft} /></>}</> : <>потрачено <Money value={b.spentToday} /> из <Money value={b.day} /></>}
                </div>
              </div>
            </div>
            <div className="mt-2.5 rounded-[18px] px-3.5 py-3" style={chip}>
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="text-muted">На неделю, до воскресенья</span>
                <Money value={w.left} className={`font-display text-[15px] ${w.left < 0 ? 'text-neg' : ''}`} />
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--lg-track)' }}>
                <div className="h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(.32,.72,0,1)]" style={{ width: `${weekPct}%`, background: w.left < 0 ? 'var(--neg)' : 'var(--sea)' }} />
              </div>
            </div>
            {next && (
              <button type="button" onClick={() => act(() => set({ event: next }))} className="mt-2.5 flex w-full items-center gap-3 rounded-[18px] px-3.5 py-3 text-left" style={chip}>
                <CalendarClock size={18} strokeWidth={1.7} className="shrink-0" style={{ color: 'var(--mark-out)' }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium">{next.title}</span>
                  <span className="block text-[12px] text-muted">{next.date < now ? 'просрочен' : next.date === now ? 'сегодня' : dayMonth(next.date)}</span>
                </span>
                <Money value={next.amount} approx={next.approx} className="shrink-0 font-display text-[14px]" />
              </button>
            )}
            <div className="mt-3 grid grid-cols-3 gap-2">
              {([['add', 'Трата', Plus], ['scan', 'Из банка', ScanText], ['checkup', 'Сверка', Scale]] as const).map(([id, label, Icon]) => (
                <button key={id} type="button" onClick={() => act(() => (id === 'add' ? set({ add: {} }) : runQuick(id)))}
                  className={`flex h-14 flex-col items-center justify-center gap-1 rounded-[18px] text-[12px] font-medium transition-transform duration-100 active:scale-95 ${id === 'add' ? 'bg-[#1f6f8f] text-white' : ''}`}
                  style={id === 'add' ? undefined : chip}>
                  <Icon size={18} strokeWidth={1.8} />{label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

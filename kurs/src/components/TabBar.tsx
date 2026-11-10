// Нижняя панель: четыре вкладки по вопросам и «плюс» посередине — записать трату одним нажатием.
// Удержание «плюса» раскрывает веер: из банка, сверка, чат «Финансы», премия.
import { AnimatePresence, motion } from 'motion/react';
import { Anchor, CalendarDays, Gift, MessagesSquare, Plus, ReceiptText, Scale, ScanText } from 'lucide-react';
import { useRef, useState, type ComponentType, type CSSProperties } from 'react';
import { today } from '../domain/dates';
import { weekToClose } from '../domain/weekly';
import { useStore } from '../store/store';
import { useUi, type Tab } from '../store/ui';
import { ease, fling, snappy } from './motion';
import { BridgeIcon } from './Petersburg';
import { haptic } from './haptics';

type Icon = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
export const TABS: { id: Tab; label: string; icon: Icon }[] = [
  { id: 'week', label: 'Сегодня', icon: BridgeIcon },
  { id: 'payments', label: 'Впереди', icon: CalendarDays },
  { id: 'budget', label: 'Траты', icon: ReceiptText },
  { id: 'plan', label: 'Долги', icon: Anchor },
];

/** Понедельник недели, которую пора сверить: в выходные — текущая, в пн–вт — прошлая, если её ещё не сверяли */
export function checkupMonday(): string {
  const s = useStore.getState();
  const done = { ...s.closures, ...Object.fromEntries(s.checkups.map(c => [c.monday, c])) } as typeof s.closures;
  return weekToClose(today(), done);
}

/** Внизу две вкладки и «плюс» между ними: «Сегодня» и «Впереди». «Траты» и «Долги» открываются плитками с «Сегодня»
 *  и считаются его частью — пока они открыты, подсвечено «Сегодня», нажатие на него возвращает назад */
const BAR: Tab[] = ['week', 'payments'];
const home = (t: Tab): Tab => (t === 'payments' ? 'payments' : 'week');
const COL: Record<Tab, number> = { week: 0, budget: 0, plan: 0, payments: 2 };

const HOLD_MS = 420;
const RING = 2 * Math.PI * 34;

/** Быстрые действия с данными — одни и те же цвета в веере «плюса» и на «Сегодня» */
export const QUICK_COLOR: Record<string, string> = { scan: '#1f8fb0', checkup: '#5b6fb8', sync: '#8b63e0', bonus: '#e9a01c' };
const FAN: { id: string; label: string; icon: Icon; angle: number; color: string }[] = [
  { id: 'scan', label: 'Из банка', icon: ScanText, angle: 160, color: QUICK_COLOR.scan },
  { id: 'checkup', label: 'Сверка', icon: Scale, angle: 122, color: QUICK_COLOR.checkup },
  { id: 'sync', label: 'Чат', icon: MessagesSquare, angle: 58, color: QUICK_COLOR.sync },
  { id: 'bonus', label: 'Премия', icon: Gift, angle: 20, color: QUICK_COLOR.bonus },
];

export function runQuick(id: string) {
  const set = useUi.getState().set;
  if (id === 'scan') set({ scan: true });
  else if (id === 'checkup') set({ checkup: checkupMonday() });
  else if (id === 'sync') set({ sync: true });
  else if (id === 'bonus') set({ bonus: {} });
  else if (id === 'hub') set({ hub: true });
}

export function TabBar() {
  const tab = useUi(s => s.tab);
  const setTab = useUi(s => s.setTab);
  const set = useUi(s => s.set);
  const [fan, setFan] = useState(false);
  // удержание «плюса»: кольцо вокруг него заполняется, пока палец на кнопке, — видно, что сейчас раскроется веер
  const [holding, setHolding] = useState(false);
  const timer = useRef(0);
  const held = useRef(false);

  const down = () => {
    held.current = false;
    window.clearTimeout(timer.current);
    if (!fan) setHolding(true);
    timer.current = window.setTimeout(() => { held.current = true; setHolding(false); setFan(true); haptic(); }, HOLD_MS);
  };
  const cancel = () => { window.clearTimeout(timer.current); setHolding(false); };
  const up = () => {
    cancel();
    if (held.current) return;
    if (fan) setFan(false);
    else set({ add: {} });
  };
  const pick = (id: string) => { setFan(false); runQuick(id); };

  const tabButton = (t: typeof TABS[number]) => {
    const active = t.id === home(tab);
    return (
      <motion.button key={t.id} type="button" whileTap={{ scale: 0.94 }} transition={snappy} aria-current={active ? 'page' : undefined}
        onClick={() => (t.id === tab ? window.scrollTo({ top: 0, behavior: 'smooth' }) : setTab(t.id))}
        className={`relative flex flex-col items-center gap-[3px] rounded-[22px] py-2 text-[11px] font-medium transition-colors ${active ? 'text-ink' : 'text-faint'}`}>
        <motion.span key={String(active)} initial={active ? { y: 2, scale: 0.9 } : false} animate={{ y: 0, scale: 1 }} transition={{ type: 'spring', bounce: 0.3, duration: 0.3 }} className="relative">
          <t.icon size={21} strokeWidth={active ? 1.9 : 1.5} className={active ? 'text-sea' : ''} />
        </motion.span>
        <span className="relative">{t.label}</span>
      </motion.button>
    );
  };

  return (
    <>
      <AnimatePresence>
        {fan && (
          <motion.div key="fan" className="fixed inset-0 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.14 } }} transition={{ duration: 0.2 }} onClick={() => setFan(false)}>
            <div className="absolute inset-0 bg-[rgba(4,14,22,.42)] backdrop-blur-[6px]" />
            <div className="pb-safe absolute inset-x-0 bottom-0">
              <div className="relative mx-auto h-[210px] w-full max-w-md">
                {FAN.map((f, i) => {
                  const r = 128, a = (f.angle * Math.PI) / 180;
                  return (
                    <motion.button key={f.id} type="button" onClick={e => { e.stopPropagation(); pick(f.id); }}
                      initial={{ x: 0, y: 0, scale: 0.6, opacity: 0 }}
                      animate={{ x: Math.cos(a) * r, y: -Math.sin(a) * r, scale: 1, opacity: 1 }}
                      exit={{ x: 0, y: 0, scale: 0.6, opacity: 0, transition: { duration: 0.14, ease: ease.out } }}
                      transition={{ ...fling, delay: i * 0.03 }}
                      className="absolute bottom-[38px] left-1/2 -ml-[34px] flex w-[68px] flex-col items-center gap-1.5">
                      <span className="tile size-[58px] !rounded-full" style={{ '--c': f.color } as CSSProperties}><f.icon size={24} strokeWidth={1.8} /></span>
                      <span className="rounded-full bg-black/40 px-2 py-0.5 text-[12px] font-medium whitespace-nowrap text-white backdrop-blur">{f.label}</span>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <nav className="pb-safe pointer-events-none fixed inset-x-0 bottom-0 z-40" aria-label="Разделы">
        <div className="pointer-events-auto relative mx-auto mb-2.5 w-[min(94%,404px)]">
          <div className="bar-glass relative grid grid-cols-3 items-end rounded-[28px] p-1.5">
            {/* подложка активной вкладки едет за пальцем обычным CSS-переходом: только transform, на видеокарте.
                Раньше это была общая layout-анимация motion — она пересчитывала положение сотен элементов страницы
                при каждом переключении и давала заметную задержку */}
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-1.5 left-1.5 w-[calc((100%-12px)/3)] rounded-[22px] transition-transform duration-[380ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
              style={{ transform: `translateX(${COL[tab] * 100}%)`, background: 'var(--bar-pill)' }} />
            {tabButton(TABS.find(t => t.id === BAR[0])!)}
            <span aria-hidden="true" />
            {tabButton(TABS.find(t => t.id === BAR[1])!)}
          </div>
          <motion.button type="button" aria-label={fan ? 'Закрыть' : 'Записать трату. Удерживайте — ещё действия'}
            onPointerDown={down} onPointerUp={up} onPointerLeave={cancel} onPointerCancel={cancel} onContextMenu={e => e.preventDefault()}
            whileTap={{ scale: 0.94 }} transition={snappy}
            className="sun absolute -top-[22px] left-1/2 grid size-[62px] -translate-x-1/2 place-items-center rounded-full select-none [-webkit-touch-callout:none]">
            {/* кольцо удержания: линейно, пока держат (это прогресс), назад — быстро */}
            <svg viewBox="0 0 72 72" className="pointer-events-none absolute -inset-[5px] size-[72px] -rotate-90" aria-hidden="true">
              <circle cx="36" cy="36" r="34" fill="none" strokeWidth="3" strokeLinecap="round" stroke="#fff"
                strokeDasharray={RING} style={{ strokeDashoffset: holding ? 0 : RING, transition: holding ? `stroke-dashoffset ${HOLD_MS}ms linear` : 'stroke-dashoffset 160ms var(--ease-out)' }} />
            </svg>
            <motion.span animate={{ rotate: fan ? 135 : 0 }} transition={{ type: 'spring', bounce: 0.25, duration: 0.4 }}><Plus size={28} strokeWidth={2.2} /></motion.span>
          </motion.button>
        </div>
      </nav>
    </>
  );
}

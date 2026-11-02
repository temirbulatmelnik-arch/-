// Нижняя панель: четыре вкладки по вопросам и «плюс» посередине — записать трату одним нажатием.
// Удержание «плюса» раскрывает веер: из банка, сверка, чат «Финансы», премия.
import { AnimatePresence, motion } from 'motion/react';
import { Anchor, CalendarDays, Gift, MessagesSquare, Plus, ReceiptText, Scale, ScanText } from 'lucide-react';
import { useRef, useState, type ComponentType } from 'react';
import { today } from '../domain/dates';
import { weekToClose } from '../domain/weekly';
import { useStore } from '../store/store';
import { useUi, type Tab } from '../store/ui';
import { ease, fling, snappy, spring } from './motion';
import { BridgeIcon } from './Petersburg';

type Icon = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
export const TABS: { id: Tab; label: string; icon: Icon }[] = [
  { id: 'week', label: 'Сегодня', icon: BridgeIcon },
  { id: 'payments', label: 'Платежи', icon: CalendarDays },
  { id: 'budget', label: 'Траты', icon: ReceiptText },
  { id: 'plan', label: 'Долги', icon: Anchor },
];

/** Понедельник недели, которую пора сверить: в выходные — текущая, в пн–вт — прошлая, если её ещё не сверяли */
export function checkupMonday(): string {
  const s = useStore.getState();
  const done = { ...s.closures, ...Object.fromEntries(s.checkups.map(c => [c.monday, c])) } as typeof s.closures;
  return weekToClose(today(), done);
}

const HOLD_MS = 420;
const RING = 2 * Math.PI * 34;

const FAN: { id: string; label: string; icon: Icon; angle: number }[] = [
  { id: 'scan', label: 'Из банка', icon: ScanText, angle: 160 },
  { id: 'checkup', label: 'Сверка', icon: Scale, angle: 122 },
  { id: 'sync', label: 'Чат', icon: MessagesSquare, angle: 58 },
  { id: 'bonus', label: 'Премия', icon: Gift, angle: 20 },
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
  const { tab, setTab, set } = useUi();
  const [fan, setFan] = useState(false);
  // удержание «плюса»: кольцо вокруг него заполняется, пока палец на кнопке, — видно, что сейчас раскроется веер
  const [holding, setHolding] = useState(false);
  const timer = useRef(0);
  const held = useRef(false);

  const down = () => {
    held.current = false;
    window.clearTimeout(timer.current);
    if (!fan) setHolding(true);
    timer.current = window.setTimeout(() => { held.current = true; setHolding(false); setFan(true); }, HOLD_MS);
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
    const active = t.id === tab;
    return (
      <motion.button key={t.id} type="button" whileTap={{ scale: 0.94 }} transition={snappy} aria-current={active ? 'page' : undefined}
        onClick={() => (active ? window.scrollTo({ top: 0, behavior: 'smooth' }) : setTab(t.id))}
        className={`relative flex flex-col items-center gap-[3px] rounded-[22px] py-2 text-[10.5px] font-medium transition-colors ${active ? 'text-ink' : 'text-faint'}`}>
        {active && <motion.span layoutId="tab-bg" className="absolute inset-0 rounded-[22px] bg-surface-2" transition={spring} />}
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
                      <span className="grid size-[58px] place-items-center rounded-full border border-white/40 bg-surface text-sea shadow-[0_12px_28px_-10px_rgba(4,14,22,.6)]"><f.icon size={23} strokeWidth={1.6} /></span>
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
          <div className="glass grid grid-cols-5 items-end rounded-[28px] border border-line bg-surface/85 p-1.5 shadow-[0_16px_40px_-14px_rgba(4,14,22,.45)] backdrop-blur-xl backdrop-saturate-150">
            {TABS.slice(0, 2).map(tabButton)}
            <span aria-hidden="true" />
            {TABS.slice(2).map(tabButton)}
          </div>
          <motion.button type="button" aria-label={fan ? 'Закрыть' : 'Записать трату. Удерживайте — ещё действия'}
            onPointerDown={down} onPointerUp={up} onPointerLeave={cancel} onPointerCancel={cancel} onContextMenu={e => e.preventDefault()}
            whileTap={{ scale: 0.94 }} transition={snappy}
            className="absolute -top-[22px] left-1/2 grid size-[62px] -translate-x-1/2 place-items-center rounded-full bg-sea text-on-sea shadow-[0_14px_30px_-10px_rgba(31,111,143,.75),inset_0_1px_0_rgba(255,255,255,.35)] ring-[5px] ring-bg select-none [-webkit-touch-callout:none]">
            {/* кольцо удержания: линейно, пока держат (это прогресс), назад — быстро */}
            <svg viewBox="0 0 72 72" className="pointer-events-none absolute -inset-[5px] size-[72px] -rotate-90" aria-hidden="true">
              <circle cx="36" cy="36" r="34" fill="none" strokeWidth="3" strokeLinecap="round" stroke="var(--card-sea)"
                strokeDasharray={RING} style={{ strokeDashoffset: holding ? 0 : RING, transition: holding ? `stroke-dashoffset ${HOLD_MS}ms linear` : 'stroke-dashoffset 160ms var(--ease-out)' }} />
            </svg>
            <motion.span animate={{ rotate: fan ? 135 : 0 }} transition={{ type: 'spring', bounce: 0.25, duration: 0.4 }}><Plus size={28} strokeWidth={2.2} /></motion.span>
          </motion.button>
        </div>
      </nav>
    </>
  );
}

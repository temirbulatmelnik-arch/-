// Знакомство с новым видом: четыре карточки — где что теперь лежит. Листаются пальцем, у каждой — живая картинка.
// Показывается один раз; снова — из настроек.
import { AnimatePresence, motion, type PanInfo } from 'motion/react';
import { Anchor, Gift, MessagesSquare, Plus, Scale, ScanText } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Roll, spring } from '../components/motion';
import { useStore } from '../store/store';
import { salute } from '../store/events';
import { useUi } from '../store/ui';

export const TOUR_VERSION = 5;

const SLIDES: { title: string; text: string; art: () => ReactNode }[] = [
  { title: 'Свои, в долг и резерв', text: 'У денег теперь цвет. Синяя вода — свои, сиреневая штриховка — взятое в долг, сумерки — резерв. В трате выберите, откуда деньги: под суммой сразу видно, что останется. На «Сегодня» — три сосуда «Где деньги»: нажмите на любой.', art: () => <ArtMoney /> },
  { title: 'Сегодня — сколько можно', text: 'Сверху остаток недели и кольцо дня. Фонари — дни недели: ведите пальцем вдоль набережной, и подпись покажет траты каждого дня. Потяните сцену вниз — мост сведётся, а приложение проверит обновления. Прокрутите — сверху появится «Остров» с деньгами на сегодня, нажмите на него.', art: () => <ArtToday /> },
  { title: '«+» — записать трату', text: 'Одно нажатие — сумма, категория, готово. Удержите «+», и раскроются остальные действия: из банка, сверка, чат, премия.', art: () => <ArtPlus /> },
  { title: 'Платежи — хватит ли денег', text: 'Три вида, листаются пальцем: месяц с водой в днях, «Хватит ли» — ответ одной фразой и линия резерва, которую можно вести пальцем, и список. Нажмите на день — он раскроется прямо из календаря. Строку можно сдвинуть вправо — «оплачено» — или удержать: появится меню.', art: () => <ArtPay /> },
  { title: 'Траты и Долги', text: '«Траты» — куда ушли деньги по категориям, поиск, свайп влево — изменить или удалить. «Долги» — общий долг тает, по фарватеру к свободе.', art: () => <ArtDebts /> },
];

export function Tour() {
  const open = useUi(s => s.tour);
  const set = useUi(s => s.set);
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  useEffect(() => { if (open) setI(0); }, [open]);
  const finish = () => { useStore.getState().setSettings({ tourSeen: TOUR_VERSION }); set({ tour: false }); };
  // дошли до конца — маленький салют: первое знакомство случается один раз
  const go = (n: number) => { if (n < 0) return; if (n >= SLIDES.length) { finish(); window.setTimeout(() => salute('small'), 350); return; } setDir(n > i ? 1 : -1); setI(n); };
  const end = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -60 || info.velocity.x < -400) go(i + 1);
    else if (info.offset.x > 60 || info.velocity.x > 400) go(i - 1);
  };
  const s = SLIDES[i];
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[60] flex items-end justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-[rgba(4,14,22,.55)] backdrop-blur-md" onClick={finish} />
          <motion.div initial={{ y: 60, opacity: 0, scale: 0.96 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 40, opacity: 0 }} transition={spring}
            className="pb-safe relative mx-3 mb-3 w-full max-w-md overflow-hidden rounded-[32px] bg-bg shadow-2xl" role="dialog" aria-label="Что где теперь">
            <motion.div drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.2} onDragEnd={end} style={{ touchAction: 'pan-y' }}>
              <div className="relative h-[230px] overflow-hidden" style={{ background: 'linear-gradient(180deg, var(--sky-1), var(--sky-2) 55%, var(--sky-3))' }}>
                <AnimatePresence mode="popLayout" custom={dir} initial={false}>
                  <motion.div key={i} custom={dir} className="absolute inset-0 grid place-items-center"
                    variants={{ enter: (d: number) => ({ x: d * 80, opacity: 0 }), center: { x: 0, opacity: 1 }, exit: (d: number) => ({ x: -d * 80, opacity: 0 }) }}
                    initial="enter" animate="center" exit="exit" transition={spring}>
                    {s.art()}
                  </motion.div>
                </AnimatePresence>
              </div>
              <div className="px-6 pt-5">
                <div className="text-[12.5px] text-muted">Новый вид, {i + 1} из {SLIDES.length}</div>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
                    <h2 className="font-display mt-1 text-[21px] leading-tight font-medium">{s.title}</h2>
                    <p className="mt-2 min-h-[84px] text-[14.5px] leading-snug text-muted">{s.text}</p>
                  </motion.div>
                </AnimatePresence>
              </div>
            </motion.div>
            <div className="flex items-center justify-between gap-3 px-6 pt-2 pb-5">
              <div className="flex gap-1.5">
                {SLIDES.map((_, k) => <motion.span key={k} animate={{ width: k === i ? 22 : 7, opacity: k === i ? 1 : 0.35 }} transition={spring} className="h-[7px] rounded-full bg-sea" />)}
              </div>
              <div className="flex items-center gap-2">
                {i < SLIDES.length - 1 && <button type="button" onClick={finish} className="px-2 py-2 text-[14px] text-muted">Пропустить</button>}
                <motion.button type="button" whileTap={{ scale: 0.95 }} onClick={() => go(i + 1)} className="h-11 rounded-full bg-ink px-5 text-[14.5px] font-medium text-bg">
                  {i < SLIDES.length - 1 ? 'Дальше' : 'Понятно'}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ---------- картинки ---------- */

function useTick(ms: number, n: number) {
  const [k, setK] = useState(0);
  useEffect(() => { const t = setInterval(() => setK(x => (x + 1) % n), ms); return () => clearInterval(t); }, [ms, n]);
  return k;
}

function ArtToday() {
  const k = useTick(1400, 4);
  const left = [1140, 890, 640, 1140][k];
  return (
    <div className="flex items-center gap-6" style={{ color: 'var(--scene-ink)' }}>
      <div>
        <div className="figure text-[30px] leading-none"><Roll value={left * 7} /></div>
        <div className="mt-1 text-[13px]" style={{ color: 'var(--scene-muted)' }}>на неделю</div>
        <div className="mt-4 flex gap-2.5">
          {[0, 1, 2, 3, 4, 5, 6].map(d => (
            <motion.span key={d} animate={{ scale: d === 2 ? [1, 1.25, 1] : 1, opacity: d < 2 ? 0.45 : 1 }} transition={{ duration: 1.4, repeat: Infinity }}
              className="size-3 rounded-full" style={{ background: d === 2 ? '#FF9A63' : '#FFE0B8', boxShadow: d === 2 ? '0 0 12px #ff7b42' : undefined }} />
          ))}
        </div>
      </div>
      <div className="grid size-[112px] place-items-center rounded-full border backdrop-blur" style={{ background: 'var(--glass)', borderColor: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>
        <svg viewBox="0 0 112 112" className="absolute size-[112px] -rotate-90"><motion.circle cx="56" cy="56" r="46" fill="none" strokeWidth="6" strokeLinecap="round" stroke="var(--ring-1)" animate={{ pathLength: left / 1140 }} transition={spring} /></svg>
        <div className="text-center"><div className="figure text-[19px] leading-none"><Roll value={left} /></div><div className="mt-1 text-[10.5px]" style={{ color: 'var(--ring-label)' }}>на сегодня</div></div>
      </div>
    </div>
  );
}

/** Три сосуда: свои, в долг, резерв — вода поднимается по очереди */
function ArtMoney() {
  const k = useTick(1800, 2);
  const cells = [['Свои', 'linear-gradient(180deg, var(--own-2), var(--own))', 0.7], ['В долг', 'var(--loan-hatch)', 0.35], ['Резерв', 'linear-gradient(180deg, var(--rsv-2), var(--rsv))', 0.9]] as const;
  return (
    <div className="flex w-[300px] gap-2.5">
      {cells.map(([label, fill, level], n) => (
        <div key={label} className="relative h-[120px] flex-1 overflow-hidden rounded-[20px] bg-surface shadow-lg">
          <motion.span className="absolute inset-x-0 bottom-0 origin-bottom" style={{ height: `${level * 100}%`, background: fill, opacity: 0.45 }}
            animate={{ scaleY: k ? 1 : 0.35 }} transition={{ type: 'spring', bounce: 0.25, duration: 1.1, delay: n * 0.12 }} />
          <span className="relative block px-3 pt-2.5 text-[12.5px] font-medium text-ink">{label}</span>
        </div>
      ))}
    </div>
  );
}

function ArtPlus() {
  const k = useTick(1600, 2);
  const icons = [ScanText, Scale, MessagesSquare, Gift];
  return (
    <div className="relative h-[190px] w-[300px]">
      {icons.map((I, n) => {
        const a = ([160, 122, 58, 20][n] * Math.PI) / 180;
        return (
          <motion.span key={n} className="absolute bottom-[30px] left-1/2 -ml-[22px] grid size-11 place-items-center rounded-full bg-surface text-sea shadow-lg"
            animate={k ? { x: Math.cos(a) * 100, y: -Math.sin(a) * 100, scale: 1, opacity: 1 } : { x: 0, y: 0, scale: 0.3, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 24, delay: n * 0.04 }}><I size={19} strokeWidth={1.6} /></motion.span>
        );
      })}
      <motion.span animate={{ rotate: k ? 135 : 0, scale: k ? 0.94 : 1 }} transition={{ type: 'spring', stiffness: 380, damping: 18 }}
        className="sun absolute bottom-[22px] left-1/2 -ml-[30px] grid size-[60px] place-items-center rounded-full">
        <Plus size={26} strokeWidth={2.2} />
      </motion.span>
    </div>
  );
}

function ArtPay() {
  const k = useTick(1500, 3);
  return (
    <div className="w-[300px]">
      <div className="relative flex rounded-[13px] bg-white/45 p-[3px] text-[12px] font-medium backdrop-blur" style={{ color: 'var(--scene-ink)' }}>
        <motion.span className="absolute inset-y-[3px] w-[calc((100%-6px)/3)] rounded-[10px] bg-white/85" animate={{ x: `${k * 100}%` }} transition={spring} />
        {['Месяц', 'Хватит ли', 'Список'].map(t => <span key={t} className="relative flex-1 py-1.5 text-center">{t}</span>)}
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1">
        {Array.from({ length: 14 }, (_, d) => (
          <div key={d} className="relative h-9 overflow-hidden rounded-t-[10px] rounded-b-[4px] bg-white/55">
            <motion.span className="absolute inset-x-0 bottom-0" style={{ background: d === 9 ? 'rgba(238,97,37,.45)' : 'rgba(31,111,143,.42)' }}
              animate={{ height: `${[70, 64, 60, 52, 80, 74, 70, 62, 40, 18, 66, 60, 58, 54][d]}%` }} initial={{ height: 0 }} transition={{ ...spring, delay: d * 0.03 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ArtDebts() {
  const k = useTick(1700, 4);
  return (
    <div className="w-[300px]" style={{ color: 'var(--scene-ink)' }}>
      <div className="flex h-3 overflow-hidden rounded-full bg-white/40">
        {[['#1f6f8f', 34], ['#23a383', 22], ['#ee6125', 16], ['#7c8fc0', 12]].map(([c, w]) => <motion.span key={c} style={{ background: c as string }} initial={{ width: 0 }} animate={{ width: `${w}%` }} transition={spring} />)}
      </div>
      <div className="relative mt-8 h-14">
        <svg viewBox="0 0 300 56" className="absolute inset-0"><path d="M6 40 C70 10 120 50 170 26 S260 18 294 30" fill="none" stroke="currentColor" strokeOpacity=".35" strokeDasharray="4 5" /></svg>
        {[30, 96, 160, 226, 284].map((x, n) => (
          <span key={x} className="absolute -mt-2 grid size-4 place-items-center rounded-full border-2" style={{ left: x - 8, top: [32, 22, 24, 18, 26][n], borderColor: n < k ? 'var(--pos)' : 'currentColor', background: n < k ? 'var(--pos)' : 'transparent' }} />
        ))}
        <motion.span className="absolute -mt-5" animate={{ left: [22, 88, 152, 218][k] }} transition={spring}><Anchor size={18} /></motion.span>
      </div>
      <div className="mt-2 flex justify-between text-[11.5px]" style={{ color: 'var(--scene-muted)' }}><span>сейчас</span><span>свобода</span></div>
    </div>
  );
}


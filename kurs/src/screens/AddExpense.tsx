// Запись траты: своя клавиатура в листе (iPhone не закрывает экран своей), сумма, категория, «Записать».
// Больше 5 000 — предложить паузу 48 часов. Сверху — «Из банка»: загрузить траты разом.
import { AlertTriangle, CalendarDays, CreditCard, Delete, Hourglass, PiggyBank, ScanText, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { snappy, spring } from '../components/motion';
import { CAT_COLOR, CATEGORY_ICON, PrimaryButton, SecondaryButton, Sheet } from '../components/ui';
import { bridgeWeek, weekMoney } from '../domain/bridge';
import { dayMonth, today, weekday, weekStart } from '../domain/dates';
import { parseAmount, rub } from '../domain/money';
import { BIG_PURCHASE, CATEGORIES, CATEGORY } from '../domain/plan';
import { weekSummary } from '../domain/summary';
import type { CategoryId, Source } from '../domain/types';
import { useStore } from '../store/store';
import { toast, useUi, type AddPrefill } from '../store/ui';

const SOURCE_NAME: Record<Source, string> = { life: 'Карта', reserve: 'Резерв', credit: 'Кредитка' };
const NEXT: Record<Source, Source> = { life: 'reserve', reserve: 'credit', credit: 'life' };

export function AddExpenseSheet() {
  const prefill = useUi(s => s.add);
  const set = useUi(s => s.set);
  const close = () => set({ add: null });
  return (
    <Sheet bare open={!!prefill} onClose={close} title={prefill?.edit ? 'Трата' : 'Новая трата'}
      action={!prefill?.edit && (
        <motion.button type="button" whileTap={{ scale: 0.94 }} onClick={() => { set({ add: null }); window.setTimeout(() => set({ scan: true }), 200); }}
          className="flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[13px] font-medium"><ScanText size={15} strokeWidth={1.7} className="text-sea" /> Из банка</motion.button>
      )}>
      {prefill && <Form key={prefill.edit?.id ?? prefill.wishId ?? 'new'} p={prefill} onDone={close} />}
    </Sheet>
  );
}

// prefill приходит пропсом: во время анимации закрытия в состоянии уже null
function Form({ p, onDone }: { p: AddPrefill; onDone: () => void }) {
  const edit = p.edit;
  const store = useStore.getState();
  const [amount, setAmount] = useState(edit ? String(edit.amount) : p.amount ? String(p.amount) : '');
  const [category, setCategory] = useState<CategoryId | null>(edit?.category ?? p.category ?? null);
  const [source, setSource] = useState<Source>(edit?.source ?? p.source ?? 'life');
  const bridge = useStore(s => s.bridge);
  const [note, setNote] = useState(edit?.note ?? p.note ?? '');
  const [date, setDate] = useState(edit?.date ?? p.date ?? today());
  const [askPause, setAskPause] = useState(false);
  const dateInput = useRef<HTMLInputElement>(null);

  /** своя клавиатура: цифры, запятая, стереть; до двух знаков после запятой */
  const press = (k: string) => setAmount(a => {
    if (k === 'del') return a.slice(0, -1);
    if (k === ',') return a.includes(',') ? a : (a || '0') + ',';
    if (a.includes(',') && a.split(',')[1].length >= 2) return a;
    if (a.replace(',', '').length >= 9) return a;
    return a === '0' ? k : a + k;
  });
  // с клавиатуры компьютера тоже можно
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === ',' || e.key === '.') press(',');
      else if (e.key === 'Backspace') press('del');
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  const value = parseAmount(amount) ?? 0;
  const valid = value > 0 && !!category;

  const save = () => {
    if (!valid) return;
    if (!edit && !p.wishId && value > BIG_PURCHASE && source === 'life' && !askPause) { setAskPause(true); return; }
    const item = { date, amount: value, category: category!, note: note.trim() || undefined, source, origin: 'manual' as const, ...(source === 'credit' && p.creditCard ? { creditCard: p.creditCard } : {}) };
    if (edit) store.updateExpense(edit.id, item);
    else store.addExpenses([item]);
    if (p.wishId) store.resolveWish(p.wishId, 'bought');
    const s = useStore.getState();
    const week = weekSummary(s.expenses, s.debts, s.weeklyOverrides, today());
    const plan = source === 'credit' ? weekMoney(s.expenses, s.debts, s.weeklyOverrides, s.bridge, weekStart(date)) : null;
    if (plan && plan.creditCap > 0) toast(plan.creditLeft >= 0 ? `Мост на кредитке: на неделе ещё ${rub(plan.creditLeft)}` : `Сверх моста на ${rub(-plan.creditLeft)} — это перерасход`);
    else if (source === 'credit') toast('Записано как нарушение: с кредиток не тратим');
    else if (week.left < 0) toast(`Перерасход недели: ${rub(-week.left)}`);
    else toast(`Записано. На неделю осталось ${rub(week.left)}`);
    onDone();
  };

  const pause = () => {
    store.addWish({ title: note.trim() || CATEGORY[category!].short, amount: value, category: category! });
    toast('Отложено на 48 часов. Напомню на главном экране');
    onDone();
  };

  if (askPause) {
    return (
      <div className="space-y-4 overflow-y-auto px-5 pt-2 pb-6">
        <div className="card flex items-start gap-3 p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-warn/12 text-warn"><Hourglass size={18} strokeWidth={1.5} /></span>
          <div>
            <div className="text-[16px] font-medium">{rub(value)} — крупная трата</div>
            <p className="mt-1 text-[13.5px] leading-snug text-muted">Правило плана: всё дороже {rub(BIG_PURCHASE)} — только из недельного лимита и после паузы 48 часов. Через двое суток желание часто проходит само.</p>
          </div>
        </div>
        <PrimaryButton onClick={pause}><Hourglass size={17} strokeWidth={1.6} /> Отложить на 48 часов</PrimaryButton>
        <SecondaryButton onClick={save} className="w-full">Уже купил — просто записать</SecondaryButton>
      </div>
    );
  }

  return (
    <>
    {/* сверху — сумма, когда, откуда, категория; прокручивается сама, если экран невысокий */}
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 pb-4 [mask-image:linear-gradient(to_bottom,black_calc(100%-18px),transparent)]">
      {/* сумма: цифры выпрыгивают по одной */}
      <div className="flex min-h-[64px] items-end justify-center gap-1 pt-1" aria-live="polite" aria-label={`Сумма ${amount || 0} ₽`}>
        <span className="figure flex text-[52px] leading-none">
          <AnimatePresence initial={false} mode="popLayout">
            {(amount || '0').split('').map((ch, i) => (
              <motion.span key={`${i}-${ch}`} layout initial={{ y: 18, opacity: 0, scale: 0.6 }} animate={{ y: 0, opacity: amount ? 1 : 0.3, scale: 1 }} exit={{ y: -14, opacity: 0, scale: 0.6 }} transition={snappy}>{ch}</motion.span>
            ))}
          </AnimatePresence>
        </span>
        <span className="mb-1.5 text-[26px] text-muted">₽</span>
      </div>

      {/* дата, откуда платили и что купили — одной строкой; источник переключается по кругу, обычно это карта */}
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => dateInput.current?.showPicker?.() ?? dateInput.current?.focus()} className="relative flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[13px] font-medium">
          <CalendarDays size={15} strokeWidth={1.6} className="text-sea" />{date === today() ? 'Сегодня' : `${weekday(date)}, ${dayMonth(date)}`}
          <input ref={dateInput} type="date" value={date} onChange={e => setDate(e.target.value || today())} className="absolute inset-0 opacity-0" aria-label="Дата" />
        </button>
        <motion.button type="button" whileTap={{ scale: 0.95 }} transition={snappy} onClick={() => setSource(NEXT[source])} aria-label={`Откуда: ${SOURCE_NAME[source]}. Нажмите, чтобы сменить`}
          className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium ${source === 'credit' ? 'border-neg/40 bg-neg/10 text-neg' : source === 'reserve' ? 'border-info/40 bg-info/10 text-info' : 'border-line bg-surface'}`}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span key={source} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={snappy} className="flex items-center gap-1.5">
              {source === 'reserve' ? <PiggyBank size={15} strokeWidth={1.6} /> : <CreditCard size={15} strokeWidth={1.6} className={source === 'life' ? 'text-sea' : ''} />}{SOURCE_NAME[source]}
            </motion.span>
          </AnimatePresence>
        </motion.button>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Что купили" className="h-10 min-w-0 flex-1 rounded-full border border-line bg-surface px-3.5 text-[16px] outline-none placeholder:text-faint focus:border-sea" />
      </div>

      <div className="grid grid-cols-5 gap-2">
        {CATEGORIES.map(c => {
          const Icon = CATEGORY_ICON[c.id];
          const on = category === c.id;
          return (
            <motion.button key={c.id} type="button" onClick={() => setCategory(c.id)} whileTap={{ scale: 0.95 }} transition={snappy}
              className={`relative flex aspect-[1/0.92] flex-col items-center justify-center gap-1 overflow-hidden rounded-[18px] border text-center ${on ? 'border-transparent text-white' : 'border-line bg-surface'}`}>
              {on && <motion.span layoutId="cat-pick" className="absolute inset-0" style={{ background: CAT_COLOR[c.id] }} transition={spring} />}
              <motion.span className="relative" animate={on ? { rotate: [0, -12, 10, 0], scale: [1, 1.25, 1] } : { rotate: 0, scale: 1 }} transition={{ duration: 0.45 }}>
                <Icon size={20} strokeWidth={1.6} className={on ? '' : 'text-ink/75'} />
              </motion.span>
              <span className="relative px-0.5 text-[10px] leading-tight font-medium">{c.short}</span>
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence initial={false}>
        {source === 'credit' && !bridgeWeek(bridge, weekStart(date)) && (
          <motion.p key="credit" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="flex items-start gap-2 overflow-hidden px-1 text-[12.5px] leading-snug text-neg">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" /> Кредитки заморожены — только гасим. Запишу как нарушение плана.
          </motion.p>
        )}
        {source === 'reserve' && (
          <motion.p key="reserve" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden px-1 text-[12.5px] leading-snug text-info">Из резерва — только здоровье и срочное, в недельный лимит не входит.</motion.p>
        )}
      </AnimatePresence>
      {edit && (
        <SecondaryButton onClick={() => { store.removeExpense(edit.id); toast('Трата удалена'); onDone(); }} className="w-full text-neg">
          <Trash2 size={16} strokeWidth={1.5} /> Удалить
        </SecondaryButton>
      )}
    </div>

    {/* снизу всегда на месте — клавиатура и «Записать», как в банковских приложениях */}
    <div className="pb-safe bg-bg px-5 pt-2">
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Клавиатура">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'del'].map(k => (
          <motion.button key={k} type="button" onClick={() => press(k)} whileTap={{ scale: 0.95, backgroundColor: 'var(--surface-2)' }} transition={snappy}
            aria-label={k === 'del' ? 'Стереть' : k === ',' ? 'Запятая' : k}
            className="figure grid h-[46px] place-items-center rounded-[15px] bg-surface text-[23px] select-none">
            {k === 'del' ? <Delete size={22} strokeWidth={1.6} /> : k}
          </motion.button>
        ))}
      </div>

      <div className="pt-2.5 pb-3">
        <PrimaryButton onClick={save} disabled={!valid}>{edit ? 'Сохранить' : !value ? 'Введите сумму' : category ? `Записать ${rub(value)}` : 'Выберите категорию'}</PrimaryButton>
      </div>
    </div>
    </>
  );
}

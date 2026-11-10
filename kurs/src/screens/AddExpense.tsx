// Запись траты: своя клавиатура в листе (iPhone не закрывает экран своей), сумма, категория, «Записать».
// Больше 5 000 — предложить паузу 48 часов. Сверху — «Из банка»: загрузить траты разом.
import { CalendarDays, CreditCard, Delete, Hourglass, PiggyBank, ScanText, Trash2, Wallet, type LucideIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { snappy } from '../components/motion';
import { useShallow } from 'zustand/react/shallow';
import { haptic } from '../components/haptics';
import { CAT_COLOR, CATEGORY_ICON, Money, PrimaryButton, SecondaryButton, Sheet } from '../components/ui';
import { activeBridge, bridgeState } from '../domain/bridge';
import { dayMonth, today, weekday } from '../domain/dates';
import { parseAmount, rub } from '../domain/money';
import { BIG_PURCHASE, CATEGORIES, CATEGORY } from '../domain/plan';
import { SOURCE_LABEL, SOURCES, spendEffect, suggestSource, type SpendEffect } from '../domain/sources';
import { guessCategory, parseSpoken } from '../domain/spoken';
import type { CategoryId, Source } from '../domain/types';
import { useStore } from '../store/store';
import { toast, useUi, type AddPrefill } from '../store/ui';
import { useLedger } from './Checkup';

/** Источник денег: свои — Нева, в долг — сиреневая штриховка (чужие деньги), резерв — сумерки */
const SRC_UI: Record<Source, { icon: LucideIcon; pill: string }> = {
  life: { icon: Wallet, pill: 'linear-gradient(180deg, var(--own-2), var(--own))' },
  credit: { icon: CreditCard, pill: 'var(--loan-pill)' },
  reserve: { icon: PiggyBank, pill: 'linear-gradient(180deg, var(--rsv-2), var(--rsv))' },
};
const EFFECT_COLOR: Record<SpendEffect['tone'], string> = { ok: 'var(--muted)', warn: 'var(--warn)', neg: 'var(--neg)', loan: 'var(--loan)', rsv: 'var(--rsv)' };

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
  const [note, setNote] = useState(edit?.note ?? p.note ?? '');
  const [date, setDate] = useState(edit?.date ?? p.date ?? today());
  // откуда деньги: приложение само предлагает — карта, пока на ней есть недельные деньги; карта пуста и на неделе
  // есть мост — кредитка моста. Выбор можно сменить одним нажатием
  const suggested = useMemo(() => suggestSource(store, date), []);
  const [source, setSource] = useState<Source>(edit?.source ?? p.source ?? suggested);
  const [picked, setPicked] = useState(!!(edit || p.source));
  const [expenses, debts, weeklyOverrides, bridge] = useStore(useShallow(s => [s.expenses, s.debts, s.weeklyOverrides, s.bridge] as const));
  const led = useLedger();
  const loan = useMemo(() => (activeBridge(bridge) ? bridgeState(expenses, bridge) : null), [expenses, bridge]);
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

  // трата одной фразой: в поле «Что купили» можно набрать или продиктовать «обед 340» — сумма и категория встанут сами.
  // Текст поля при этом не трогаем (иначе диктовка iPhone обрывается); число уйдёт из примечания при записи.
  // auto — что поставила фраза: набрали сумму или выбрали категорию руками — фраза их больше не меняет
  const auto = useRef<{ amount: string | null; category: CategoryId | null }>({ amount: null, category: null });
  const typeNote = (text: string) => {
    setNote(text);
    if (edit) return;
    const said = parseSpoken(text);
    const a = auto.current;
    if (said.amount != null) {
      if (amount === '' || amount === a.amount) { a.amount = String(said.amount).replace('.', ','); setAmount(a.amount); }
    } else if (a.amount != null) {
      // число из фразы стёрли — убираем и сумму, которую оно поставило
      if (amount === a.amount) setAmount('');
      a.amount = null;
    }
    const guess = guessCategory(said.words, store.expenses);
    if (guess && (category == null || category === a.category)) { a.category = guess; setCategory(guess); }
  };
  /** примечание для записи: сумма пришла из фразы — остаются только слова */
  const noteText = () => (auto.current.amount != null && auto.current.amount === amount ? parseSpoken(note).words : note.trim());

  const value = parseAmount(amount) ?? 0;
  const valid = value > 0 && !!category;
  // что будет после записи — одной строкой под суммой: остаток дня, долг по мосту или остаток резерва
  const effect = useMemo(() => spendEffect({ expenses, debts, weeklyOverrides, bridge }, { amount: value, source, date, now: today(), reserve: led.reserve, skipId: edit?.id }),
    [expenses, debts, weeklyOverrides, bridge, value, source, date, led.reserve, edit?.id]);

  /** src — источник, если сумму бросили в сосуд: состояние ещё не успело обновиться */
  const save = (src: Source = source) => {
    if (!valid) return;
    if (!edit && !p.wishId && value > BIG_PURCHASE && src === 'life' && !askPause) { setAskPause(true); return; }
    const item = { date, amount: value, category: category!, note: noteText() || undefined, source: src, origin: 'manual' as const, ...(src === 'credit' && p.creditCard ? { creditCard: p.creditCard } : {}) };
    const done = src === source ? effect : spendEffect({ expenses, debts, weeklyOverrides, bridge }, { amount: value, source: src, date, now: today(), reserve: led.reserve, skipId: edit?.id });
    if (edit) store.updateExpense(edit.id, item);
    else store.addExpenses([item]);
    haptic('success');
    if (p.wishId) store.resolveWish(p.wishId, 'bought');
    // то же, что было написано под суммой
    toast(`Записано. ${done.text}`);
    onDone();
  };

  // сумму можно потянуть пальцем и бросить в сосуд: «Свои», «В долг» или «Резерв». Сосуд под пальцем подрастает;
  // отпустили над ним — источник выбран, а если сумма и категория есть — трата сразу записана
  const vessels = useRef<Partial<Record<Source, HTMLElement | null>>>({});
  const grab = useRef<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number; over: Source | null } | null>(null);
  const hit = (x: number, y: number): Source | null => SOURCES.find(id => {
    const r = vessels.current[id]?.getBoundingClientRect();
    return !!r && x >= r.left - 4 && x <= r.right + 4 && y >= r.top - 14 && y <= r.bottom + 14;
  }) ?? null;
  const dragHandlers = {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => { if (value > 0) { grab.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture?.(e.pointerId); } },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const g = grab.current;
      if (!g || (!drag && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 10)) return;
      const over = hit(e.clientX, e.clientY);
      if (over !== (drag?.over ?? null) && over) haptic();
      setDrag({ x: e.clientX, y: e.clientY, over });
    },
    onPointerUp: () => {
      grab.current = null;
      if (!drag) return;
      const over = drag.over;
      setDrag(null);
      if (!over) return;
      setSource(over); setPicked(true);
      if (valid) save(over);
    },
    onPointerCancel: () => { grab.current = null; setDrag(null); },
  };

  const pause = () => {
    store.addWish({ title: noteText() || CATEGORY[category!].short, amount: value, category: category! });
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
        <SecondaryButton onClick={() => save()} className="w-full">Уже купил — просто записать</SecondaryButton>
      </div>
    );
  }

  return (
    <>
    {/* сверху — сумма, когда, откуда, категория; прокручивается сама, если экран невысокий */}
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 pb-4 [mask-image:linear-gradient(to_bottom,black_calc(100%-18px),transparent)]">
      {/* сумма: цифры выпрыгивают по одной */}
      <div {...dragHandlers} className={`flex min-h-[64px] touch-none items-end justify-center gap-1 pt-1 transition-opacity duration-150 ${drag ? 'opacity-30' : ''}`} aria-live="polite" aria-label={`Сумма ${amount || 0} ₽`}>
        <span className="figure flex text-[52px] leading-none">
          <AnimatePresence initial={false} mode="popLayout">
            {(amount || '0').split('').map((ch, i) => (
              <motion.span key={`${i}-${ch}`} layout initial={{ y: 18, opacity: 0, scale: 0.6 }} animate={{ y: 0, opacity: amount ? 1 : 0.3, scale: 1 }} exit={{ y: -14, opacity: 0, scale: 0.6 }} transition={snappy}>{ch}</motion.span>
            ))}
          </AnimatePresence>
        </span>
        <span className="mb-1.5 text-[26px] text-muted">₽</span>
      </div>

      {/* что будет после записи: остаток дня, долг по мосту, остаток резерва — меняется вместе с суммой и источником */}
      <p className="-mt-1 min-h-[18px] text-center text-[12.5px] leading-snug font-medium" style={{ color: EFFECT_COLOR[effect.tone] }} aria-live="polite">{effect.text}</p>

      {/* откуда деньги: свои, в долг или резерв — три кнопки, под каждой — сколько там сейчас */}
      <div role="radiogroup" aria-label="Откуда деньги" className="relative grid grid-cols-3 rounded-[18px] bg-surface-2 p-[3px]">
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-[3px] left-[3px] rounded-[15px] shadow-[0_6px_14px_-8px_rgba(10,36,51,.5),inset_0_1px_0_rgba(255,255,255,.3)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
          style={{ width: 'calc((100% - 6px) / 3)', transform: `translateX(${SOURCES.indexOf(source) * 100}%)`, background: SRC_UI[source].pill }} />
        {SOURCES.map(id => {
          const Icon = SRC_UI[id].icon;
          const on = source === id;
          return (
            <button key={id} ref={el => { vessels.current[id] = el; }} type="button" role="radio" aria-checked={on} onClick={() => { setSource(id); setPicked(true); haptic(); }}
              className={`relative flex flex-col items-center gap-px rounded-[15px] py-1.5 transition-[color,transform,box-shadow] duration-200 ${on ? 'text-white' : 'text-muted'} ${drag?.over === id ? 'drop-over shadow-[0_0_0_2px_var(--ink)]' : ''}`}>
              <span className="flex items-center gap-1.5 text-[13.5px] font-medium"><Icon size={15} strokeWidth={1.8} />{SOURCE_LABEL[id]}</span>
              <span className={`text-[11px] leading-tight ${on ? 'opacity-85' : 'opacity-80'}`}>
                {id === 'life' ? (led.card != null ? <>на карте <Money value={Math.max(0, led.card)} /></> : 'с карты')
                  : id === 'credit' ? (loan ? <>мост: ещё <Money value={Math.max(0, loan.left)} /></> : 'с кредитки')
                    : <Money value={led.reserve} />}
              </span>
            </button>
          );
        })}
      </div>
      {/* подсказка не исчезает во время жеста: иначе сосуды съезжали бы из-под пальца */}
      {value > 0 && !!category && !edit && <p className={`-mt-1.5 text-center text-[11.5px] text-faint ${drag ? 'invisible' : ''}`}>Потяните сумму в «Свои», «В долг» или «Резерв» — запишется сразу</p>}
      {drag && createPortal(
        <div className="pointer-events-none fixed z-[90] -translate-x-1/2 -translate-y-[130%] rounded-full bg-ink px-4 py-2 text-bg shadow-[0_14px_30px_-10px_rgba(4,14,22,.7)]" style={{ left: drag.x, top: drag.y }}>
          <span className="figure text-[20px]"><Money value={value} /></span>
        </div>, document.body)}
      {!picked && source === 'credit' && <p className="-mt-1 text-center text-[12px] leading-snug" style={{ color: 'var(--loan)' }}>Недельные деньги на карте кончились — предлагаю мост на кредитке</p>}

      {/* когда и что купили */}
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => dateInput.current?.showPicker?.() ?? dateInput.current?.focus()} className="relative flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[13px] font-medium">
          <CalendarDays size={15} strokeWidth={1.6} className="text-sea" />{date === today() ? 'Сегодня' : `${weekday(date)}, ${dayMonth(date)}`}
          <input ref={dateInput} type="date" value={date} onChange={e => setDate(e.target.value || today())} className="absolute inset-0 opacity-0" aria-label="Дата" />
        </button>
        <input value={note} onChange={e => typeNote(e.target.value)} placeholder={edit ? 'Что купили' : 'Что купили — или «обед 340»'} enterKeyHint="done" onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} className="h-10 min-w-0 flex-1 rounded-full border border-line bg-surface px-3.5 text-[16px] outline-none placeholder:text-faint focus:border-sea" />
      </div>

      <div className="grid grid-cols-5 gap-2">
        {CATEGORIES.map(c => {
          const Icon = CATEGORY_ICON[c.id];
          const on = category === c.id;
          return (
            <motion.button key={c.id} type="button" onClick={() => setCategory(c.id)} whileTap={{ scale: 0.95 }} transition={snappy}
              style={{ '--c': CAT_COLOR[c.id], ...(on ? {} : { background: `color-mix(in oklab, ${CAT_COLOR[c.id]} 13%, var(--surface))` }) } as CSSProperties}
              className={`relative flex aspect-[1/0.92] flex-col items-center justify-center gap-1 overflow-hidden rounded-[18px] text-center transition-shadow duration-200 ${on ? 'tile' : ''}`}>
              <motion.span className="relative" animate={on ? { rotate: [0, -12, 10, 0], scale: [1, 1.25, 1] } : { rotate: 0, scale: 1 }} transition={{ duration: 0.45 }}>
                <Icon size={21} strokeWidth={1.8} style={on ? undefined : { color: CAT_COLOR[c.id] }} />
              </motion.span>
              <span className="relative px-0.5 text-[10px] leading-tight font-medium">{c.short}</span>
            </motion.button>
          );
        })}
      </div>

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
        <PrimaryButton onClick={() => save()} disabled={!valid}>{edit ? 'Сохранить' : !value ? 'Введите сумму' : category ? `Записать ${rub(value)}` : 'Выберите категорию'}</PrimaryButton>
      </div>
    </div>
    </>
  );
}

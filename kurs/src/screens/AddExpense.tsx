import { countsWeekly, LIFE_ACCOUNT } from '../domain/accounts';
// Запись траты: нативный ввод суммы, категория и сохранение.
// Больше 5 000 — предложить паузу 48 часов. Сверху — «Из банка»: загрузить траты разом.
import { CreditCard, Hourglass, PiggyBank, Trash2, Wallet, type LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { snappy } from '../components/motion';
import { runQuick } from '../components/TabBar';
import { useShallow } from 'zustand/react/shallow';
import { haptic } from '../components/haptics';
import { AmountInput, CAT_COLOR, CATEGORY_ICON, Money, PrimaryButton, SecondaryButton, Sheet } from '../components/ui';
import { activeBridge, bridgeState } from '../domain/bridge';
import { dayMonth, today } from '../domain/dates';
import { parseAmount, rub } from '../domain/money';
import { BIG_PURCHASE, CATEGORIES, CATEGORY } from '../domain/plan';
import { DEFAULT_SPEND_SOURCE, SOURCE_LABEL, SOURCES, spendEffect, type SpendEffect } from '../domain/sources';
import { guessCategory, parseSpoken } from '../domain/spoken';
import type { CategoryId, Expense, Source } from '../domain/types';
import { useStore } from '../store/store';
import { toast, useBudgetExpenses, useUi, withUndo, type AddPrefill } from '../store/ui';
import { useCoverage } from '../components/Coverage';
import { horizonUnverified } from '../domain/financialView';
import { positionBeforeIncome } from '../domain/coverage';
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
    <Sheet open={!!prefill} onClose={close} title={prefill?.edit ? 'Трата' : 'Новая операция'}>
      {prefill && <Form key={prefill.edit?.id ?? prefill.wishId ?? 'new'} p={prefill} onDone={close} />}
    </Sheet>
  );
}

// prefill приходит пропсом: во время анимации закрытия в состоянии уже null
function Form({ p, onDone }: { p: AddPrefill; onDone: () => void }) {
  const store = useStore.getState();
  const edit = p.edit ? store.expenses.find(e => e.id === p.edit!.id) ?? p.edit : undefined;
  const [amount, setAmount] = useState(edit ? String(edit.amount) : p.amount ? String(p.amount) : '');
  const recent = store.expenses.filter(item => item.source === 'life' && item.budgetScope !== 'separate').at(-1)?.category;
  const [category, setCategory] = useState<CategoryId | null>(edit?.category ?? p.category ?? recent ?? null);
  const categoryPicked = useRef(!!(edit || p.category));
  const [note, setNote] = useState(edit?.note ?? p.note ?? '');
  const [date, setDate] = useState(edit?.date ?? p.date ?? today());
  const suggested = DEFAULT_SPEND_SOURCE;
  const [source, setSource] = useState<Source>(edit?.source ?? p.source ?? suggested);
  const [advanced, setAdvanced] = useState(!!(edit || p.source || p.date));
  const [card, setCard] = useState(edit?.creditCard ?? p.creditCard ?? '');
  const [account, setAccount] = useState(edit?.accountId ?? LIFE_ACCOUNT);
  const [funding, setFunding] = useState<NonNullable<Expense['fundingSource']>>(edit?.fundingSource ?? 'unknown');
  const [scope, setScope] = useState<Expense['budgetScope']>(edit?.budgetScope);
  const cashAccounts = useStore(s => s.accountBook.accounts);
  const expenses = useBudgetExpenses();
  const [debts, weeklyOverrides, bridge] = useStore(useShallow(s => [s.debts, s.weeklyOverrides, s.bridge] as const));
  const led = useLedger();
  const { input, now } = useCoverage('cautious');
  const budgetOnly = horizonUnverified(input);
  const liquidityCap = useMemo(() => positionBeforeIncome(input, now).available, [input, now]);
  const loan = useMemo(() => (activeBridge(bridge) ? bridgeState(expenses, bridge) : null), [expenses, bridge]);
  const [askPause, setAskPause] = useState(false);

  const saving = useRef(false);
  const openAlternative = (action: () => void) => {
    onDone();
    action();
  };

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
    if (guess && !categoryPicked.current) { a.category = guess; setCategory(guess); }
  };
  /** примечание для записи: сумма пришла из фразы — остаются только слова */
  const noteText = () => (auto.current.amount != null && auto.current.amount === amount ? parseSpoken(note).words : note.trim());

  const value = parseAmount(amount) ?? 0;
  const valid = value > 0 && !!category;
  // что будет после записи — одной строкой под суммой: остаток дня, долг по мосту или остаток резерва
  const effect = useMemo(() => spendEffect({ expenses, debts, weeklyOverrides, bridge }, {
    amount: value, source, date, now: today(), reserve: led.reserve, lifeAvailable: led.lifeAvailable, liquidityCap, skipId: edit?.id, creditCard: card,
    category: category ?? undefined, budgetOnly, budgetScope: scope, accountId: source === 'life' ? account : undefined,
  }), [expenses, debts, weeklyOverrides, bridge, value, source, date, led.reserve, led.lifeAvailable, liquidityCap, budgetOnly, edit?.id, card, category, account, scope]);

  const save = () => {
    const src = source;
    if (!valid || saving.current) return;
    if (src === 'credit' && !card) { setSource(src); toast('Выберите кредитную карту'); return; }
    if (!edit && !p.wishId && value > BIG_PURCHASE && src === 'life' && !askPause) { setAskPause(true); return; }
    const item = { date, amount: value, category: category!, note: noteText() || undefined, source: src, origin: 'manual' as const, creditCard: src === 'credit' ? card : undefined, accountId: src === 'life' && account !== LIFE_ACCOUNT ? account : undefined,
      fundingSource: src === 'credit' ? 'borrowed' as const : funding, budgetScope: scope };
    saving.current = true;
    withUndo(`Записано. ${effect.text}`, () => {
      if (edit) store.updateExpense(edit.id, item);
      else store.addExpenses([item]);
    });
    haptic('success');
    if (p.wishId) store.resolveWish(p.wishId, 'bought');
    onDone();
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

  const budgetDraft = { source, category: category ?? 'fun' as const, accountId: source === 'life' ? account : undefined };
  const weekly = countsWeekly({ ...budgetDraft, budgetScope: scope });
  const defaultWeekly = countsWeekly(budgetDraft);

  return (
    <form className="space-y-3 pb-3" onSubmit={event => { event.preventDefault(); save(); }}>
      <AmountInput value={amount} autoFocus={!edit} onChange={text => {
        const next = text.replace(/\s/g, '').replace('.', ',');
        if (/^\d{0,9}(,\d{0,2})?$/.test(next)) setAmount(next);
      }} />
      <p className="text-center text-[13px] leading-snug" aria-live="polite">
        {value > 0 && <><Money value={-value} kopecks /> · {source === 'life' && account === LIFE_ACCOUNT ? 'с карты жизни' : SOURCE_LABEL[source]}
          {' · '}{scope === 'unknown' ? 'бюджет требует сверки' : weekly ? 'из недельного бюджета' : 'вне недельного бюджета'}</>}
      </p>
      <p className="text-center text-[12px] leading-snug" style={{ color: EFFECT_COLOR[effect.tone] }}>{effect.text}</p>

      <button type="button" aria-expanded={advanced} onClick={() => setAdvanced(value => !value)}
        className="flex min-h-10 w-full items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 text-left text-[13px]">
        <span>{date === today() ? 'Сегодня' : dayMonth(date)} · {SOURCE_LABEL[source]}</span>
        <span className="text-sea">{advanced ? 'Свернуть' : 'Изменить'}</span>
      </button>
      {advanced && <div className="space-y-2">
      {/* откуда деньги: свои, в долг или резерв — три кнопки, под каждой — сколько там сейчас */}
      <div role="radiogroup" aria-label="Откуда деньги" className="relative grid grid-cols-3 rounded-[18px] bg-surface-2 p-[3px]">
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-[3px] left-[3px] rounded-[15px] shadow-[0_6px_14px_-8px_rgba(10,36,51,.5),inset_0_1px_0_rgba(255,255,255,.3)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
          style={{ width: 'calc((100% - 6px) / 3)', transform: `translateX(${SOURCES.indexOf(source) * 100}%)`, background: SRC_UI[source].pill }} />
        {SOURCES.map(id => {
          const Icon = SRC_UI[id].icon;
          const on = source === id;
          return (
            <button key={id} type="button" role="radio" aria-checked={on} onClick={() => { setSource(id); haptic(); }}
              className={`relative flex flex-col items-center gap-px rounded-[15px] py-1.5 transition-[color,transform,box-shadow] duration-200 ${on ? 'text-white' : 'text-muted'}`}>
              <span className="flex items-center gap-1.5 text-[13.5px] font-medium"><Icon size={15} strokeWidth={1.8} />{SOURCE_LABEL[id]}</span>
              <span className={`text-[11px] leading-tight ${on ? 'opacity-85' : 'opacity-80'}`}>
                {id === 'life' ? (led.lifeAvailable != null ? <>свободно <Money value={led.lifeAvailable} /></> : 'с карты')
                  : id === 'credit' ? (loan ? <>мост: использовано <Money value={loan.used} kopecks /></> : 'с кредитки')
                    : <Money value={led.reserve} />}
              </span>
            </button>
          );
        })}
      </div>
      {source === 'credit' && <label className="block text-[13px]">Кредитная карта
        <select className="field mt-1" value={card} onChange={e => setCard(e.target.value)}>
          <option value="">Выберите карту</option>
          {debts.filter(d => d.kind === 'card' && (!d.closed || d.id === card)).map(d => <option key={d.id} value={d.id}>{d.short}</option>)}
        </select>
      </label>}
      {source === 'life' && cashAccounts.length > 0 && <label className="block text-[13px]">Счёт списания
        <select className="field mt-1" value={account} onChange={e => setAccount(e.target.value)}>
          <option value={LIFE_ACCOUNT}>Карта жизни</option>
          {cashAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>}
      {source !== 'credit' && (cashAccounts.length > 0 || funding !== 'unknown') && <label className="block text-[13px]">Происхождение денег
        <select className="field mt-1" value={funding} onChange={e => setFunding(e.target.value as NonNullable<Expense['fundingSource']>)}>
          <option value="unknown">Неизвестно или смешано</option><option value="own">Подтверждено: собственные</option>
          <option value="borrowed">Подтверждено: ранее полученный заём</option>
        </select>
      </label>}
      {<label className="block text-[13px]">Участие в недельном бюджете
        <select className="field mt-1" value={scope ?? ''} onChange={e => setScope(e.target.value as Expense['budgetScope'] || undefined)}>
          <option value="">По умолчанию · {defaultWeekly ? 'в недельном бюджете' : 'вне недельного бюджета'}</option>
          <option value="weekly">Из недельных денег</option>
          <option value="separate">Оплачено отдельно</option>
          <option value="unknown">Источник требует сверки</option>
        </select>
      </label>}
        <label className="block text-[13px]">Дата расхода
          <input type="date" value={date} max={now} onChange={e => setDate(e.target.value || now)} className="field mt-1" />
        </label>
      </div>}
      {/* когда и что купили */}
      {advanced && <div className="flex items-center gap-2">
        <input aria-label="Описание расхода" value={note} onChange={e => typeNote(e.target.value)} placeholder={edit ? 'Что купили' : 'Что купили — или «обед 340»'} enterKeyHint="done" onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} className="h-10 min-w-0 flex-1 rounded-full border border-line bg-surface px-3.5 text-[16px] outline-none placeholder:text-faint focus:border-sea" />
      </div>}

      <div className="grid grid-cols-5 gap-2">
        {CATEGORIES.map(c => {
          const Icon = CATEGORY_ICON[c.id];
          const on = category === c.id;
          return (
            <motion.button key={c.id} type="button" aria-pressed={on} onClick={() => { categoryPicked.current = true; setCategory(c.id); }} whileTap={{ scale: 0.95 }} transition={snappy}
              style={{ '--c': CAT_COLOR[c.id], ...(on ? {} : { background: `color-mix(in oklab, ${CAT_COLOR[c.id]} 13%, var(--surface))` }) } as CSSProperties}
              className={`relative flex min-h-11 flex-col items-center justify-center gap-1 overflow-hidden rounded-[18px] text-center transition-shadow duration-200 ${on ? 'tile' : ''}`}>
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
      <PrimaryButton type="submit" disabled={!valid || (source === 'credit' && !card)}>
        {edit ? 'Сохранить' : !value ? 'Введите сумму' : category ? `Записать ${rub(value)}` : 'Выберите категорию'}
      </PrimaryButton>
      {!edit && <details className="rounded-xl bg-surface-2 px-3">
        <summary className="flex min-h-11 cursor-pointer items-center text-[13px] font-medium text-sea">Другие действия</summary>
        <div className="grid grid-cols-2 gap-1 pb-2 text-left text-[13px]">
          <button type="button" className="min-h-11 text-left" onClick={() => openAlternative(() => runQuick('bonus'))}>Поступление</button>
          <button type="button" className="min-h-11 text-left" onClick={() => openAlternative(() => useUi.getState().set({ finance: true, financeView: 'journal' }))}>Перевод</button>
          <button type="button" className="min-h-11 text-left" onClick={() => openAlternative(() => useUi.getState().set({ paymentQueue: true }))}>Платёж</button>
          <button type="button" className="min-h-11 text-left" onClick={() => openAlternative(() => runQuick('scan'))}>Из банка</button>
          <button type="button" className="min-h-11 text-left" onClick={() => openAlternative(() => runQuick('checkup'))}>Сверка</button>
          <button type="button" className="min-h-11 text-left" onClick={() => openAlternative(() => runQuick('sync'))}>Чат</button>
        </div>
      </details>}
    </form>
  );
}

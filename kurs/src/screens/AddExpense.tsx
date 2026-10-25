// Быстрый ввод траты: сумма → категория → «Записать». Больше 5 000 — предложить паузу 48 часов.
import { AlertTriangle, Hourglass, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CATEGORY_ICON, PrimaryButton, SecondaryButton, Segmented, Sheet } from '../components/ui';
import { today } from '../domain/dates';
import { parseAmount, rub } from '../domain/money';
import { BIG_PURCHASE, CATEGORIES, CATEGORY } from '../domain/plan';
import { weekSummary } from '../domain/summary';
import type { CategoryId, Source } from '../domain/types';
import { useStore } from '../store/store';
import { toast, useUi, type AddPrefill } from '../store/ui';

export function AddExpenseSheet() {
  const prefill = useUi(s => s.add);
  const set = useUi(s => s.set);
  const close = () => set({ add: null });
  return (
    <Sheet open={!!prefill} onClose={close} title={prefill?.edit ? 'Трата' : 'Новая трата'}>
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
  const [source, setSource] = useState<Source>(edit?.source ?? 'life');
  const [note, setNote] = useState(edit?.note ?? p.note ?? '');
  const [date, setDate] = useState(edit?.date ?? today());
  const [askPause, setAskPause] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // клавиатура открывается сразу — первое касание уже ввод суммы
    if (!edit) setTimeout(() => input.current?.focus(), 250);
  }, [edit]);

  const value = parseAmount(amount) ?? 0;
  const valid = value > 0 && !!category;

  const save = () => {
    if (!valid) return;
    if (!edit && !p.wishId && value > BIG_PURCHASE && source === 'life' && !askPause) { setAskPause(true); return; }
    const item = { date, amount: value, category: category!, note: note.trim() || undefined, source, origin: 'manual' as const };
    if (edit) store.updateExpense(edit.id, item);
    else store.addExpenses([item]);
    if (p.wishId) store.resolveWish(p.wishId, 'bought');
    const s = useStore.getState();
    const week = weekSummary(s.expenses, s.debts, s.weeklyOverrides, today());
    if (source === 'credit') toast('Записано как нарушение: с кредиток не тратим');
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
      <div className="space-y-4 pt-2">
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
    <div className="space-y-4 pt-1">
      <div className="flex items-baseline gap-2 rounded-[22px] border border-line bg-surface px-5 py-4">
        <input ref={input} value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="0" aria-label="Сумма"
          className="figure w-full min-w-0 bg-transparent text-[48px] leading-none outline-none placeholder:text-faint" />
        <span className="text-[26px] text-muted">₽</span>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {CATEGORIES.map(c => {
          const Icon = CATEGORY_ICON[c.id];
          const on = category === c.id;
          return (
            <button key={c.id} type="button" onClick={() => setCategory(c.id)}
              className={`flex aspect-square flex-col items-center justify-center gap-1.5 rounded-2xl border text-center transition active:scale-95 ${on ? 'border-ink bg-ink text-bg' : 'border-line bg-surface'}`}>
              <Icon size={20} strokeWidth={1.5} className={on ? 'text-card-sea' : 'text-ink/75'} />
              <span className="px-0.5 text-[10px] leading-tight font-medium">{c.short}</span>
            </button>
          );
        })}
      </div>

      <Segmented<Source> value={source} onChange={setSource} options={[
        { id: 'life', label: 'Карта жизни' },
        { id: 'reserve', label: 'Из резерва' },
        { id: 'credit', label: 'Кредитка' },
      ]} />
      {source === 'credit' && (
        <p className="flex items-start gap-2 rounded-2xl bg-neg/10 px-4 py-3 text-[13px] leading-snug text-neg">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> Кредитки заморожены — только гасим. Запишу как нарушение плана.
        </p>
      )}
      {source === 'reserve' && (
        <p className="rounded-2xl bg-info/10 px-4 py-3 text-[13px] leading-snug text-info">Из резерва — только здоровье по назначению и срочное. Не входит в недельный лимит и уменьшает резерв.</p>
      )}

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Комментарий" className="field" />
        <input type="date" value={date} onChange={e => setDate(e.target.value || today())} className="field w-[150px]" aria-label="Дата" />
      </div>

      <PrimaryButton onClick={save} disabled={!valid}>{edit ? 'Сохранить' : category ? `Записать${value ? ` ${rub(value)}` : ''}` : 'Выберите категорию'}</PrimaryButton>
      {edit && (
        <SecondaryButton onClick={() => { store.removeExpense(edit.id); toast('Трата удалена'); onDone(); }} className="w-full text-neg">
          <Trash2 size={16} strokeWidth={1.5} /> Удалить
        </SecondaryButton>
      )}
    </div>
  );
}

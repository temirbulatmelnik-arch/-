// Карточка долга: обновить остаток, внести досрочно, условия. И форма нового долга.
import { Lock, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Field, Money, PrimaryButton, SecondaryButton, Segmented, Sheet, Switch } from '../components/ui';
import { ddmmyyyy, monthName, relDays } from '../domain/dates';
import { parseAmount, pct, rub } from '../domain/money';
import type { Debt, DebtKind } from '../domain/types';
import { useStore } from '../store/store';
import { toast, useToday, useUi } from '../store/ui';

export function DebtSheet() {
  const id = useUi(s => s.debt);
  const debt = useStore(s => s.debts.find(d => d.id === id));
  const set = useUi(s => s.set);
  return (
    <Sheet open={!!debt} onClose={() => set({ debt: null })} title={debt?.short ?? ''}>
      {debt && <Body key={debt.id} d={debt} />}
    </Sheet>
  );
}

const ruleText = (d: Debt) => {
  switch (d.rule.type) {
    case 'fixed': return `Фиксированный платёж ${rub(d.rule.amount)}`;
    case 'annuity': return `Аннуитет ${rub(d.rule.amount)} до ${ddmmyyyy(d.rule.endDate)}; досрочка уменьшает платёж`;
    case 'interestPlus': return `Проценты за месяц + ${pct(d.rule.share)} долга${d.rule.min ? `, не меньше ${rub(d.rule.min)}` : ''}`;
    case 'schedule': return `По графику: ${d.rule.items.map(i => `${rub(i.amount)} ${ddmmyyyy(i.date)}`).join(', ')}`;
  }
};

function Body({ d }: { d: Debt }) {
  const now = useToday();
  const [updateDebt, prepay, removeDebt, reserve] = useStore(useShallow(s => [s.updateDebt, s.prepay, s.removeDebt, s.reserve] as const));
  const set = useUi(s => s.set);
  const [balance, setBalance] = useState(String(d.balance));
  const [extra, setExtra] = useState('');
  const [fromReserve, setFromReserve] = useState(false);
  const extraValue = parseAmount(extra) ?? 0;
  const interest = (d.balance * d.rate) / 12;

  return (
    <div className="space-y-4 pt-1">
      <div className="card p-5">
        <div className="text-[13px] font-medium text-muted">{d.name}</div>
        <Money value={d.balance} className="figure mt-1 block text-[40px] leading-none" />
        <div className="mt-2 flex flex-wrap gap-1.5 text-[12.5px]">
          <span className="rounded-full bg-surface-2 px-2.5 py-1 font-medium">ставка {pct(d.rate)}</span>
          {d.limit && <span className="rounded-full bg-surface-2 px-2.5 py-1 font-medium">лимит {rub(d.limit)}</span>}
          <span className="rounded-full bg-surface-2 px-2.5 py-1 font-medium">≈ {rub(interest)} процентов в месяц</span>
          {d.targetClose && <span className="rounded-full bg-sea/12 px-2.5 py-1 font-medium text-sea">закрыть: {monthName(d.targetClose)}</span>}
        </div>
        {d.frozen && !d.closed && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-neg/10 p-3 text-[13.5px] leading-snug text-neg">
            <Lock size={16} className="mt-0.5 shrink-0" /> Заморожена: только гасим. Банк предложит поднять лимит — отказ.
          </p>
        )}
        <p className="mt-3 text-[13.5px] leading-snug text-muted">{ruleText(d)}. Платёж {d.dueDay === 'last' ? 'до последнего дня месяца' : `${d.kind === 'card' ? 'до ' : ''}${d.dueDay}-го числа`}.</p>
        {d.note && <p className="mt-2 text-[13.5px] leading-snug">{d.note}</p>}
        {d.updatedAt && <p className="mt-2 text-[12px] text-faint">Остаток обновлён {relDays(now, d.updatedAt.slice(0, 10))}</p>}
      </div>

      {!d.closed && (
        <>
          <div className="card space-y-3 p-4">
            <Field label="Текущий остаток (из приложения банка)" hint="Или загрузите скриншот экрана долга — «Курс» обновит сам.">
              <input value={balance} onChange={e => setBalance(e.target.value)} inputMode="decimal" className="field text-[18px] font-medium" />
            </Field>
            <SecondaryButton className="w-full" disabled={parseAmount(balance) == null || parseAmount(balance) === d.balance}
              onClick={() => { updateDebt(d.id, { balance: parseAmount(balance)! }); toast('Остаток обновлён'); }}>Сохранить остаток</SecondaryButton>
          </div>

          <div className="card space-y-3 p-4">
            <Field label="Внести досрочно" hint={d.kind === 'split' ? 'При досрочном погашении выберите «уменьшить платёж».' : d.kind === 'loan' ? 'Выберите досрочное погашение с сокращением срока.' : 'Сначала внесите обязательный платёж, сверх него — досрочно.'}>
              <input value={extra} onChange={e => setExtra(e.target.value)} inputMode="decimal" placeholder="0" className="field text-[18px] font-medium" />
            </Field>
            <Switch checked={fromReserve} onChange={setFromReserve} label="Деньги из резерва" hint={`Сейчас в резерве ${rub(reserve)}. Брать только сверх суммы, которую резерв должен держать.`} />
            <PrimaryButton disabled={extraValue <= 0} onClick={() => { prepay(d.id, Math.min(extraValue, d.balance), fromReserve); setExtra(''); toast(extraValue >= d.balance - 0.5 ? `${d.short} закрыт!` : 'Досрочный платёж учтён'); }}>
              Внёс {extraValue > 0 ? rub(extraValue) : ''}
            </PrimaryButton>
          </div>
        </>
      )}

      {d.closed && (
        <SecondaryButton className="w-full" onClick={() => updateDebt(d.id, { closed: false, closedOn: undefined, balance: Math.max(1, parseAmount(balance) ?? 1) })}>Открыть снова</SecondaryButton>
      )}
      <button type="button" onClick={() => { if (confirm(`Удалить «${d.short}» из приложения?`)) { removeDebt(d.id); set({ debt: null }); } }}
        className="flex w-full items-center justify-center gap-1.5 py-2 text-[13px] font-medium text-faint"><Trash2 size={14} /> Удалить долг из приложения</button>
    </div>
  );
}

export function NewDebtSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Новый долг">
      {open && <NewDebt onClose={onClose} />}
    </Sheet>
  );
}

function NewDebt({ onClose }: { onClose: () => void }) {
  const [debts, addDebt] = useStore(useShallow(s => [s.debts, s.addDebt] as const));
  const [kind, setKind] = useState<DebtKind>('card');
  const [name, setName] = useState('');
  const [balance, setBalance] = useState('');
  const [rate, setRate] = useState('');
  const [payment, setPayment] = useState('');
  const [day, setDay] = useState('');
  const [frozen, setFrozen] = useState(true);
  const b = parseAmount(balance), r = parseAmount(rate), p = parseAmount(payment), dd = Number(day);
  const ok = name.trim() && b != null && b > 0 && r != null && dd >= 1 && dd <= 31 && (kind === 'card' || (p != null && p > 0));

  const save = () => {
    if (!ok) return;
    const id = `${name.trim().toLowerCase().replace(/[^a-zа-я0-9]+/gi, '-')}-${Date.now().toString(36)}`;
    addDebt({
      id, name: name.trim(), short: name.trim(), kind, balance: b!, startBalance: b!, rate: r! / 100, dueDay: dd,
      rule: kind === 'card' ? { type: 'interestPlus', share: 0.03 } : { type: 'fixed', amount: p! },
      frozen: kind === 'card' ? frozen : false, order: Math.max(0, ...debts.map(x => x.order)) + 1, closed: false, updatedAt: new Date().toISOString(),
    });
    toast('Долг добавлен');
    onClose();
  };

  return (
    <div className="space-y-3 pt-1">
      <Segmented<DebtKind> value={kind} onChange={setKind} options={[{ id: 'card', label: 'Кредитка' }, { id: 'loan', label: 'Кредит' }, { id: 'split', label: 'Сплит/рассрочка' }]} />
      <Field label="Название"><input value={name} onChange={e => setName(e.target.value)} placeholder="Например, Кредитка Озон" className="field" /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Остаток, ₽"><input value={balance} onChange={e => setBalance(e.target.value)} inputMode="decimal" className="field" /></Field>
        <Field label="Ставка, % годовых"><input value={rate} onChange={e => setRate(e.target.value)} inputMode="decimal" className="field" /></Field>
        <Field label={kind === 'card' ? 'Платёж (оценка)' : 'Платёж, ₽'} hint={kind === 'card' ? 'Считается сам: проценты + 3% долга' : undefined}>
          <input value={payment} onChange={e => setPayment(e.target.value)} inputMode="decimal" disabled={kind === 'card'} className="field disabled:opacity-50" />
        </Field>
        <Field label="День платежа"><input value={day} onChange={e => setDay(e.target.value)} inputMode="numeric" placeholder="1–31" className="field" /></Field>
      </div>
      {kind === 'card' && <Switch checked={frozen} onChange={setFrozen} label="Заморозить: с неё не тратим" />}
      <PrimaryButton onClick={save} disabled={!ok}>Добавить</PrimaryButton>
    </div>
  );
}

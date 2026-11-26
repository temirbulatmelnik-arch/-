import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { SkyHeader } from '../components/Petersburg';
import { Money, SecondaryButton } from '../components/ui';
import { rubles } from '../domain/accounts';
import { ddmmyyyy } from '../domain/dates';
import { financialJournal } from '../domain/journal';
import { useStore } from '../store/store';
import { useToday, useUi } from '../store/ui';
import { Budget } from './Budget';
import { useLedger } from './Checkup';

const filters = [
  ['all', 'Все'], ['expense', 'Расходы'], ['income', 'Доходы'], ['transfer', 'Переводы'], ['debt', 'Долги'], ['review', 'Нужна сверка'],
] as const;
type Filter = typeof filters[number][0];

export function History() {
  const today = useToday();
  const set = useUi(s => s.set);
  const led = useLedger();
  const [filter, setFilter] = useState<Filter>('all');
  const [showBudget, setShowBudget] = useState(false);
  const [limit, setLimit] = useState(40);
  const [accountBook, expenses, oneOff, marks, reserveLog] = useStore(useShallow(s =>
    [s.accountBook, s.expenses, s.oneOff, s.marks, s.reserveLog] as const));
  const rows = useMemo(() => financialJournal({ accountBook, expenses, oneOff, marks, reserveLog }).entries
    .filter(op => op.status === 'confirmed' && op.date <= today && op.type !== 'allocation')
    .sort((a, b) => b.date.localeCompare(a.date) || (b.at ?? '').localeCompare(a.at ?? '') || a.id.localeCompare(b.id)),
  [accountBook, expenses, oneOff, marks, reserveLog, today]);
  const statements = (accountBook.importBatches ?? []).slice(-5).reverse().filter(batch => batch.statement);
  const review = new Set(led.reconciliation.map(item => item.operationId));
  const visible = rows.filter(op => {
    if (filter === 'all') return true;
    if (filter === 'review') return review.has(op.id);
    if (filter === 'expense') return op.type === 'expense' || op.type === 'credit_purchase' || op.type === 'refund';
    if (filter === 'debt') return ['loan_disbursement', 'debt_payment', 'credit_purchase', 'fee', 'interest'].includes(op.type);
    return op.type === filter;
  });

  if (showBudget) return <>
    <SecondaryButton className="mx-4 mt-3" onClick={() => setShowBudget(false)}>Все операции</SecondaryButton>
    <Budget />
  </>;

  return <div>
    <SkyHeader title="История" action={<SecondaryButton onClick={() => set({ scan: true })}>Из банка</SecondaryButton>} />
    <div className="space-y-3 px-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {review.size > 0
          ? <button type="button" className="min-h-11 text-[14px] text-warn" onClick={() => { setFilter('review'); setLimit(40); }}>Нужна сверка · {review.size}</button>
          : <p className="text-[14px] text-muted">{led.cardFrom ? 'Последняя точка карты · ' + ddmmyyyy(led.cardFrom.date) : 'Остаток карты требует сверки'}</p>}
        <button type="button" className="min-h-11 text-[13px] text-sea" onClick={() => setShowBudget(true)}>Статистика трат</button>
      </div>
      <div className="flex flex-wrap gap-1.5" aria-label="Вид операций">
        {filters.map(([id, label]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => { setFilter(id); setLimit(40); }}
          className={`min-h-11 rounded-xl px-3 text-[13px] ${filter === id ? 'bg-ink text-bg' : 'bg-surface-2'}`}>{label}</button>)}
      </div>
      <ul className="card divide-y divide-line">
        {visible.slice(0, limit).map(op => {
          const expenseId = 'expenseId' in op ? op.expenseId : undefined;
          const expense = op.legacyExpense ? expenses.find(e => e.id === expenseId) : undefined;
          const outgoing = ['expense', 'credit_purchase', 'debt_payment', 'fee', 'interest'].includes(op.type);
          const summary = op.note ?? oneOff.find(e => e.key === op.eventKey)?.title ??
            (op.type === 'transfer' ? 'Перевод между счетами' : op.type === 'income' ? 'Поступление' :
              op.type === 'refund' ? 'Возврат покупки' : op.type === 'loan_disbursement' ? 'Выдача займа' : 'Списание');
          const row = <><span className="min-w-0">
            <span className="block break-words">{summary}</span>
            <span className="block text-[12px] text-muted">{ddmmyyyy(op.date)} · {review.has(op.id) ? 'Нужна сверка' : 'Факт'}</span>
          </span><Money value={outgoing ? -op.amount : op.amount} kopecks className="shrink-0" /></>;
          return <li key={op.id}>{expense
            ? <button type="button" className="flex min-h-11 w-full items-center justify-between gap-2 p-3 text-left text-[14px]"
              onClick={() => set({ add: { edit: expense } })}>{row}</button>
            : <div className="flex min-h-11 items-center justify-between gap-2 p-3 text-[14px]">{row}</div>}</li>;
        })}
      </ul>
      {visible.length === 0 && <p className="px-2 text-[14px] text-muted">В этом разделе пока нет операций.</p>}
      {visible.length > limit && <SecondaryButton onClick={() => setLimit(n => n + 40)}>Показать ещё</SecondaryButton>}
      {filter === 'all' && statements.length > 0 && <details className="card p-3 text-[13px]">
        <summary className="min-h-10 py-2 font-medium">Сверка импортированных выписок</summary>
        <ul className="divide-y divide-line">
          {statements.map(batch => {
            const check = batch.statement!;
            const matched = check.status === 'matched' && check.closingMinor != null && check.ledgerClosingMinor === check.closingMinor;
            return <li key={batch.id} className="space-y-1 py-2">
              <p>{check.end ? ddmmyyyy(check.end) : 'Дата конца периода неизвестна'} · {matched ? 'Остаток совпал' : 'Нужна сверка'}</p>
              {check.closingMinor != null && <p className="text-muted">По выписке <Money value={rubles(check.closingMinor)} kopecks />
                {check.ledgerClosingMinor != null && <> · по учёту <Money value={rubles(check.ledgerClosingMinor)} kopecks /></>}</p>}
            </li>;
          })}
        </ul>
      </details>}
      {filter === 'all' && !!(accountBook.operationChanges?.length || accountBook.expenseChanges?.length) && <details className="card p-3">
        <summary className="min-h-11 cursor-pointer py-2 text-[14px] font-medium">Журнал исправлений</summary>
        <ul className="divide-y divide-line">
          {[
            ...(accountBook.operationChanges ?? []),
            ...(accountBook.expenseChanges ?? []).map(change => ({ ...change, reason: change.after ? 'Исправление расхода' : 'Удаление расхода' })),
          ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit).map(({ at, reason, before, after }) =>
            <li key={`${before.id}:${at}:${reason}`} className="py-2 text-[14px]">
              <div>{reason} · {ddmmyyyy(before.date)}</div>
              <div className="text-[13px] text-muted">{before.note && `${before.note} · `}<Money value={before.amount} kopecks />
                {after && (!('status' in after) || after.status !== 'voided') ? <> → <Money value={after.amount} kopecks /></> : ' · отменено'}</div>
            </li>) }
        </ul>
      </details>}
    </div>
  </div>;
}

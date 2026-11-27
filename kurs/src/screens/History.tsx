import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { SkyHeader } from '../components/Petersburg';
import { CatIcon, Money, SecondaryButton, Sheet } from '../components/ui';
import { accountOptions, cents, reversibleOperation, rubles, type AccountOperation } from '../domain/accounts';
import { dayMonth, ddmmyyyy, weekdayFull } from '../domain/dates';
import { CATEGORIES, CATEGORY } from '../domain/plan';
import { financialJournal, groupablePaymentMatches } from '../domain/journal';
import { useStore } from '../store/store';
import { toast, useToday, useUi } from '../store/ui';
import { Budget } from './Budget';
import { useLedger } from './Checkup';

const debitTypes = new Set(['expense', 'credit_purchase', 'debt_payment', 'fee', 'interest']);
const types: Record<AccountOperation['type'], string> = {
  expense: 'Расход', credit_purchase: 'Покупка в кредит', transfer: 'Внутренний перевод', refund: 'Возврат',
  income: 'Доход', loan_disbursement: 'Выдача займа', debt_payment: 'Платёж по долгу', fee: 'Комиссия',
  interest: 'Проценты', adjustment: 'Корректировка', allocation: 'Распределение',
};

const filters = [
  ['all', 'Все'], ['expense', 'Расходы'], ['income', 'Доходы'], ['transfer', 'Переводы'], ['debt', 'Долги'], ['review', 'Нужна сверка'],
] as const;
type Filter = typeof filters[number][0];

export function History() {
  const today = useToday();
  const set = useUi(s => s.set);
  const led = useLedger();
  const range = useUi(s => s.historyRange);
  const [query, setQuery] = useState('');
  const [account, setAccount] = useState('');
  const [category, setCategory] = useState('');
  const [selected, select] = useState<string | null>(null);
  const [batchReview, setBatchReview] = useState(false);
  const [confirmVoid, setConfirmVoid] = useState(false);
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
  const accounts = new Map(accountOptions(accountBook).map(row => [row.id, row.name]));
  const uniqueMatches = groupablePaymentMatches(led.reconciliation, expenses);
  const expenseById = new Map(expenses.map(row => [row.id, row]));
  const titleByKey = new Map(oneOff.map(row => [row.key, row.title]));
  const rowInfo = (op: AccountOperation) => {
    const expense = 'expenseId' in op && op.expenseId ? expenseById.get(op.expenseId) : undefined;
    const category = 'category' in op ? op.category ?? expense?.category : expense?.category;
    const title = op.note || expense?.note || (op.eventKey && titleByKey.get(op.eventKey)) || types[op.type];
    const from = accounts.get(op.accountId) ?? 'Счёт уточняется';
    const route = op.type === 'transfer' ? from + ' → ' + (accounts.get(op.toAccountId) ?? 'Счёт уточняется') : from;
    return { expense, category, title, route };
  };
  const needle = query.trim().toLocaleLowerCase('ru');
  const searchMoney = /^[-+−]?\s*\d[\d\s]*(?:[.,]\d{1,2})?\s*₽?$/.test(needle)
    ? cents(Math.abs(Number(needle.replace(/[\s₽]/g, '').replace('−', '-').replace(',', '.')))) : null;
  const visible = rows.filter(op => {
    if ((range?.from && op.date < range.from) || (range?.to && op.date > range.to)) return false;
    if (account && account !== op.accountId && !(op.type === 'transfer' && account === op.toAccountId)) return false;
    const info = rowInfo(op);
    if (category && category !== info.category) return false;
    if (needle && searchMoney !== cents(op.amount) &&
      ![info.title, info.route, info.category && CATEGORY[info.category].short].some(label => label?.toLocaleLowerCase('ru').includes(needle))) return false;
    if (filter === 'all') return true;
    if (filter === 'review') return review.has(op.id);
    if (filter === 'expense') return op.type === 'expense' || op.type === 'credit_purchase' || op.type === 'refund';
    if (filter === 'debt') return ['loan_disbursement', 'debt_payment', 'credit_purchase', 'fee', 'interest'].includes(op.type);
    return op.type === filter;
  });

  const shown = new Set(visible.slice(0, limit).map(op => op.id));
  const days = new Map<string, AccountOperation[]>();
  const datesShown = new Set(visible.slice(0, limit).map(op => op.date));
  for (const op of visible) {
    if (!datesShown.has(op.date)) break;
    const group = days.get(op.date);
    if (group) group.push(op);
    else days.set(op.date, [op]);
  }
  const detail = rows.find(op => op.id === selected);

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
      {filter === 'review' && uniqueMatches.length > 0 && <SecondaryButton className="w-full" onClick={() => setBatchReview(true)}>
        Проверить совпадения · {uniqueMatches.length}
      </SecondaryButton>}
      <Sheet open={batchReview} onClose={() => setBatchReview(false)} title="Совпадения с календарём">
        <div className="space-y-3 pt-1">
          <p className="text-sm text-muted">Сверьте каждую пару с выпиской. Подтвердите все пары только если в каждой было одно списание. Источник денег останется открытым для сверки.</p>
          <ul className="card divide-y divide-line">
            {uniqueMatches.map(issue => <li key={issue.operationId} className="p-3 text-sm">
              {ddmmyyyy(issue.date)} · {expenseById.get(issue.relatedId)?.note ?? 'Расход'} · <Money value={issue.amount} kopecks />
            </li>)}
          </ul>
          <SecondaryButton className="w-full" disabled={!uniqueMatches.length} onClick={() => {
            if (useStore.getState().linkReviewedPayments(uniqueMatches.map(issue => ({ operationId: issue.operationId, expenseId: issue.relatedId })))) {
              toast('Совпадения записаны'); setBatchReview(false);
            } else toast('Список изменился. Проверьте записи снова.');
          }}>Подтверждаю одно списание в каждой паре</SecondaryButton>
        </div>
      </Sheet>
      <label className="block text-[13px] text-muted">Поиск по названию или сумме
        <input className="field mt-1" type="search" value={query} onChange={e => { setQuery(e.target.value); setLimit(40); }} />
      </label>
      <details className="card p-3" open={range ? true : undefined}>
        <summary className="min-h-10 py-2 text-sm font-medium">Период, счёт и категория</summary>
        <div className="grid grid-cols-2 gap-2 text-[13px]">
          <label className="min-w-0">С даты<input className="field mt-1 min-w-0" type="date" value={range?.from ?? ''} max={range?.to || today}
            onChange={e => { set({ historyRange: { from: e.target.value, to: range?.to ?? '' } }); setLimit(40); }} /></label>
          <label className="min-w-0">По дату<input className="field mt-1 min-w-0" type="date" value={range?.to ?? ''} min={range?.from || undefined} max={today}
            onChange={e => { set({ historyRange: { from: range?.from ?? '', to: e.target.value } }); setLimit(40); }} /></label>
          <label className="min-w-0">Счёт<select className="field mt-1" value={account} onChange={e => { setAccount(e.target.value); setLimit(40); }}>
            <option value="">Все счета</option>{[...accounts].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
          <label className="min-w-0">Категория<select className="field mt-1" value={category} onChange={e => { setCategory(e.target.value); setLimit(40); }}>
            <option value="">Все категории</option>{CATEGORIES.map(item => <option key={item.id} value={item.id}>{item.short}</option>)}</select></label>
        </div>
        {(range || category || account) && <button type="button" className="min-h-11 text-[13px] text-sea" onClick={() => {
          set({ historyRange: undefined }); setCategory(''); setAccount(''); setLimit(40);
        }}>Сбросить фильтры</button>}
      </details>
      {[...days].map(([date, operations]) => {
        const totals = operations.reduce((total, op) => {
          if (debitTypes.has(op.type)) total.debit += cents(op.amount);
          if (op.type === 'income' && op.fundingSource !== 'borrowed') total.income += cents(op.amount);
          return total;
        }, { debit: 0, income: 0 });
        return <section key={date} aria-label={dayMonth(date)}>
          <h2 className="px-1 text-sm font-medium">{dayMonth(date)}, {weekdayFull(date).toLocaleLowerCase('ru')}</h2>
          <p className="mb-1 px-1 text-[13px] text-muted">Расходы <Money value={rubles(totals.debit)} kopecks /> · доходы <Money value={rubles(totals.income)} kopecks /></p>
          <ul className="card divide-y divide-line">
            {operations.filter(op => shown.has(op.id)).map(op => {
              const info = rowInfo(op);
              return <li key={op.id}><button type="button" className="flex min-h-12 w-full items-center gap-2 p-3 text-left text-[14px]"
                onClick={() => { select(op.id); setConfirmVoid(false); }}>
                {info.category && <CatIcon id={info.category} className="size-8 shrink-0" />}
                <span className="min-w-0 flex-1"><span className="block break-words">{info.title}</span>
                  <span className="block text-[12px] text-muted">{info.route}{review.has(op.id) && ' · нужна сверка'}</span></span>
                <Money value={debitTypes.has(op.type) ? -op.amount : op.amount} kopecks sign={op.type === 'income' || op.type === 'refund'} className="shrink-0" />
              </button></li>;
            })}
          </ul>
        </section>;
      })}
      <Sheet open={!!detail} title={detail ? rowInfo(detail).title : ''} onClose={() => select(null)}>
        {detail && <div className="space-y-3 pt-2">
          <div className="card p-4 text-sm">
            <Money value={detail.amount} kopecks className="figure block text-3xl" />
            <p>{types[detail.type]} · {ddmmyyyy(detail.date)}</p>
            <p className="text-muted">{rowInfo(detail).route}</p>
            <p className="text-muted">{review.has(detail.id) ? 'Нужна сверка' : detail.origin === 'bank' ? 'Из банка' : 'Записано в учёте'}</p>
          </div>
          {rowInfo(detail).expense && <SecondaryButton className="w-full" onClick={() => {
            const expense = rowInfo(detail).expense;
            if (expense) { select(null); set({ add: { edit: expense } }); }
          }}>Изменить расход</SecondaryButton>}
          {reversibleOperation(detail) && detail.origin !== 'bank' && !rowInfo(detail).expense &&
            <SecondaryButton className="w-full" onClick={() => {
              if (!confirmVoid) { setConfirmVoid(true); return; }
              if (useStore.getState().voidOperation(detail.id)) { toast('Подтверждение отменено'); select(null); }
              else toast('Отмена недоступна. Сначала проверьте связанные записи.');
            }}>{confirmVoid ? 'Да, отменить подтверждение' : 'Отменить подтверждение'}</SecondaryButton>}
        </div>}
      </Sheet>
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

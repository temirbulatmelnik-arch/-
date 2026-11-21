import { ledger, reserveAnchor } from '../domain/ledger';
import type { ImageOCR } from '../domain/imageText';
import { useMemo, useState } from 'react';
import { accountOptions, cashAccount, cents, LIFE_ACCOUNT, RESERVE_ACCOUNT, validAmount, validDate } from '../domain/accounts';
import { cashIncomeEvent, eventsBetween } from '../domain/calendar';
import { addDays, ddmm, plural } from '../domain/dates';
import { moscowClock } from '../domain/funds';
import { parseAmount } from '../domain/money';
import { CATEGORIES } from '../domain/plan';
import { merchantName, parseScreenshot, redactBankText, screenshotDuplicate, type ScreenshotKind, type ScreenshotRow } from '../domain/screenshots';
import type { CategoryId } from '../domain/types';
import { Field, Money, PrimaryButton, SecondaryButton } from '../components/ui';
import { uid, useStore } from '../store/store';
import { toast, useUi } from '../store/ui';

const kinds: Record<ScreenshotKind, string> = {
  purchase: 'Расход со счёта', credit: 'Покупка по кредитке', debt: 'Платёж по долгу', transfer: 'Перевод между своими счетами',
  refund: 'Возврат покупки', incoming: 'Поступление от другого человека', payroll: 'Выплата работодателя',
  loan: 'Заёмное поступление', unknown: 'Требует уточнения',
};

type ReviewRow = ScreenshotRow & { originalCategory: CategoryId; eventKey?: string; expenseId?: string; force?: boolean; selected?: boolean };
const getEvents = (s: ReturnType<typeof useStore.getState>, date: string) => validDate(date) ?
  eventsBetween(s, addDays(date, -14), addDays(date, 14)) : [];

function bookingError(row: ReviewRow): string | null {
  if (!validDate(row.date) || row.date > moscowClock().date) return 'Сверьте дату операции.';
  if (row.time && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(row.time) || Date.parse(`${row.date}T${row.time}:00+03:00`) > Date.now())) return 'Сверьте время операции.';
  const state = useStore.getState();
  const account = row.kind === 'credit' ? row.debtId : row.accountId;
  const accounts = [account, row.kind === 'transfer' ? row.toAccountId : undefined];
  const recent = state.checkups.at(-1);
  if (!row.time && accounts.some(id => id && (id === LIFE_ACCOUNT ? state.cardBalance?.date === row.date || recent?.date === row.date
    : id === RESERVE_ACCOUNT ? reserveAnchor(state.reserveLog)?.date === row.date || recent?.date === row.date
      : state.accountBook.accounts.some(a => a.id === id && a.balance?.date === row.date) ||
        state.debts.some(debt => debt.id === id && (debt.bankBalance?.date ?? debt.updatedAt?.slice(0, 10)) === row.date))))
    return 'Укажите время из выписки: на эту дату есть сверка остатка.';
  if (row.currency !== 'RUB' || !validAmount(row.amount) || row.amount <= 0) return 'Укажите фактическую сумму списания или зачисления в рублях.';
  if (row.kind === 'unknown') return 'Укажите подтверждённый вид операции.';
  if (row.kind === 'transfer' && (!row.toAccountId || row.accountId === row.toAccountId)) return 'Укажите два разных счёта.';
  if (row.kind === 'refund' && !row.expenseId) return 'Укажите исходную покупку.';
  if (row.kind === 'payroll' && !row.eventKey) return 'Свяжите с выплатой в календаре.';
  if ((row.kind === 'credit' || row.kind === 'debt' || row.kind === 'loan') && !row.debtId) return 'Укажите обязательство.';
  return null;
}

export function recordScreenshot(row: ReviewRow): boolean {
  const s = useStore.getState();
  const duplicate = screenshotDuplicate(row, s.expenses, s.accountBook, s.marks, getEvents(s, row.date));
  if (bookingError(row) || duplicate?.exact || (duplicate && !row.force)) return false;
  const amount = row.amount!;
  const date = row.date;
  const at = row.time ? new Date(`${date}T${row.time}:00+03:00`).toISOString() : undefined;
  const note = redactBankText([row.merchant, row.memo].filter(Boolean).join(' · ')).slice(0, 180);
  const base = { id: uid(), date, amount, at, externalId: row.fingerprint, accountId: row.accountId, note,
    status: 'confirmed' as const, origin: 'bank' as const, fundingSource: 'unknown' as const };
  if (row.kind === 'purchase' || row.kind === 'credit') {
    s.addExpenses([{ date, amount, note, source: row.kind === 'credit' ? 'credit' : row.accountId === RESERVE_ACCOUNT ? 'reserve' : 'life',
      ...(row.kind === 'credit' ? { creditCard: row.debtId } : { accountId: row.accountId }),
      category: row.category, origin: 'screenshot', occurredAt: at, fingerprint: row.fingerprint }]);
    const key = merchantName(row.merchant);
    if (key && row.category !== row.originalCategory) s.remember(key, row.category);
    return true;
  }
  if (row.kind === 'refund') {
    const e = s.expenses.find(e => e.id === row.expenseId);
    if (!e) return false;
    const accountId = cashAccount(e) ?? e.creditCard;
    return !!accountId && s.saveOperation({ ...base, type: 'refund', accountId, debtId: e.creditCard, expenseId: e.id });
  }
  if (row.kind === 'transfer') {
    const toAccountId = row.toAccountId!;
    const led = ledger(s);
    const pending = led.pendingSweepToReserve[row.accountId] ?? 0;
    const purpose = toAccountId === RESERVE_ACCOUNT && pending >= amount ? 'sweep' : toAccountId === LIFE_ACCOUNT ? 'unassigned' : undefined;
    return s.saveOperation({ ...base, type: 'transfer', toAccountId, purpose });
  }
  if (row.kind === 'loan') return s.saveOperation({ ...base, type: 'loan_disbursement', debtId: row.debtId!, fundingSource: 'borrowed' });
  if (row.eventKey) {
    const event = getEvents(s, date).find(e => e.key === row.eventKey && !s.marks[e.key]?.done);
    if (!event || (row.kind === 'payroll' && !cashIncomeEvent(event)) ||
        (row.kind === 'debt' && event.debtId !== row.debtId)) return false;
    const partialId = row.kind === 'debt' && cents(amount) < cents(event.amount) ? uid() : undefined;
    s.markEvent(event, true, amount, undefined, { paidDate: date, accountId: row.accountId, bankAt: at, partialId,
      externalId: row.fingerprint, bankVerified: true });
    return useStore.getState().accountBook.operations.some(op => op.externalId === row.fingerprint);
  }
  if (row.kind === 'debt') return s.saveOperation({ ...base, type: 'debt_payment', debtId: row.debtId });
  if (row.kind === 'incoming') return s.saveOperation({ ...base, type: 'income', pendingSweep: row.accountId !== RESERVE_ACCOUNT, fundingSource: 'own' });
  return false;
}


export function ScreenshotFlow({ images, onBack }: { images: ImageOCR[]; onBack: () => void }) {
  const [sources, setSources] = useState(images);
  const [edited, setEdited] = useState<Record<number, string>>({});
  const [revision, setRevision] = useState(0);
  const memory = useStore(s => s.merchantMemory);
  const today = moscowClock().date;
  const parsed = useMemo(() => sources.map(image => {
    const result = parseScreenshot(image.text, today, image.id, image.confidence, memory);
    return { ...result, stage: image.stage === 'parsed' ? result.stage : image.stage, incomplete: image.incomplete };
  }), [sources, today, memory]);
  const rows = [...new Map(parsed.flatMap(result => result.rows.map(row => [row.fingerprint, row] as const))).values()];
  const skipped = parsed.reduce((sum, result) => sum + result.skipped, 0);
  const unreadable = parsed.filter(item => item.stage === 'decode' || item.stage === 'ocr' || item.incomplete).length;
  const missing = rows.filter(row => !row.date).length;
  return <div className="space-y-3">
    <h3 className="text-xl font-semibold">{rows.length === 1 ? 'Найдена' : 'Найдено'} {rows.length} {plural(rows.length, 'операция', 'операции', 'операций')}</h3>
    {(skipped > 0 || missing > 0 || unreadable > 0) && <p className="card p-3 text-sm text-warn" role="status">
      {skipped > 0 && `Не удалось определить сумму или продавца у ${skipped} строк. `}
      {missing > 0 && `У ${missing} операций не видно даты. `}
      {unreadable > 0 && `Не все части ${unreadable} снимков удалось прочитать. `}
      Сверьте найденные строки с банковской историей.
    </p>}
    {rows.length === 0 && <p className="card p-3 text-sm">Для записи нужны сумма и описание операции. Исправьте прочитанный текст ниже или выберите более чёткий снимок.</p>}
    <details open={!rows.length || undefined} className="card p-3 text-sm">
      <summary className="min-h-9 font-medium text-sea">Распознанный текст и диагностика</summary>
      {parsed.map((item, i) => <section key={i} className="mt-3 space-y-2 border-t border-line pt-2">
        <p>Снимок {i + 1} · {item.stage === 'decode' ? 'формат изображения не прочитан' : item.stage === 'ocr' ? 'текст не найден' :
          item.stage === 'parse' ? 'строки отсутствуют после разбора' : item.incomplete ? 'обработан частично' : 'разобран'}</p>
        <p className="break-words text-[12px] text-muted">{Object.entries(item.rules).map(([name, count]) => `${name} × ${count}`).join(' · ') || 'Нет сработавших правил'}</p>
        <Field label={`Текст снимка ${i + 1}`}>
          <textarea className="field min-h-32" value={edited[i] ?? item.text} placeholder="Например: 14 ноября, Магнит −350 ₽"
            onChange={event => setEdited(previous => ({ ...previous, [i]: event.target.value }))} />
        </Field>
      </section>)}
      <SecondaryButton className="mt-3 w-full" disabled={!Object.keys(edited).length} onClick={() => {
        setSources(previous => previous.map((image, i) => edited[i] == null ? image :
          { ...image, text: redactBankText(edited[i]), stage: 'parsed', confidence: 100, incomplete: false }));
        setEdited({});
        setRevision(value => value + 1);
      }}>Пересчитать из текста</SecondaryButton>
    </details>
    {rows.length ? <ScreenshotReview key={revision} rows={rows} onBack={onBack} /> :
      <SecondaryButton className="w-full" onClick={onBack}>Выбрать другие снимки</SecondaryButton>}
  </div>;
}

export function ScreenshotReview({ rows, onBack }: { rows: ScreenshotRow[]; onBack: () => void }) {
  const [drafts, setDrafts] = useState<ReviewRow[]>(rows.map(row => ({ ...row, originalCategory: row.category })));
  const [message, show] = useState('');
  const store = useStore();
  const accounts = accountOptions(store.accountBook);
  const [open, expand] = useState<string | null>(null);
  const duplicateFor = (row: ReviewRow) => screenshotDuplicate(row, store.expenses, store.accountBook, store.marks, getEvents(store, row.date));
  const selectable = (row: ReviewRow) => {
    const dup = duplicateFor(row);
    return !bookingError(row) && (!dup || (!dup.exact && row.force));
  };
  const selected = drafts.filter(row => row.selected).length;
  const change = (i: number, patch: Partial<ReviewRow>) => setDrafts(rs => rs.map((r, j) => i === j ? { ...r, selected: false, ...patch } : r));
  const save = () => {
    const ready = drafts.filter(row => row.selected);
    if (!ready.length) { show('Отметьте проверенные операции.'); return; }
    const bad = ready.map(bookingError).find(Boolean);
    if (bad) { show(bad); return; }
    const added: string[] = [];
    for (const row of ready) if (recordScreenshot(row)) added.push(row.fingerprint);
    if (added.length < ready.length) {
      setDrafts(rs => rs.map(row => added.includes(row.fingerprint) ? { ...row, selected: false } : row));
      show(`Записано ${added.length} из ${ready.length}. Проверьте совпадения, связанные записи и суммы возвратов.`);
      return;
    }
    toast(`Записано операций: ${added.length}`);
    useUi.getState().set({ scan: false });
  };
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-[13px] text-muted">Отмечено {selected} из {drafts.length}</p>
      <button type="button" className="min-h-11 text-sm text-sea" onClick={() =>
        setDrafts(previous => previous.map(row => ({ ...row, selected: selectable(row) })))}>Отметить готовые</button>
    </div>
    {drafts.map((row, i) => {
      const duplicate = duplicateFor(row);
      const errors = bookingError(row);
      const candidates = getEvents(store, row.date).filter(e => !store.marks[e.key]?.done &&
        (row.kind === 'payroll' ? cashIncomeEvent(e) && !!e.incomeKind && e.incomeKind !== 'other' : e.kind === 'payment' && e.debtId === row.debtId));
      const refunds = (row.kind === 'refund' ? store.expenses : []).filter(e => e.date <= row.date && cents(row.amount ?? 0) <= cents(e.amount)).sort((a, b) =>
        Number((cashAccount(b) ?? b.creditCard) === row.accountId) - Number((cashAccount(a) ?? a.creditCard) === row.accountId) || b.date.localeCompare(a.date));
      const category = ['purchase', 'credit'].includes(row.kind) ? CATEGORIES.find(c => c.id === row.category)?.short : kinds[row.kind];
      const account = row.kind === 'credit' ? store.debts.find(d => d.id === row.debtId)?.short : accounts.find(a => a.id === row.accountId)?.name;
      return <section className="card space-y-2 p-3" key={row.fingerprint}>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
          <button type="button" className="min-h-12 min-w-0 text-left" aria-label={`Редактировать ${row.merchant || 'операцию'}`} aria-expanded={open === row.fingerprint}
            onClick={() => expand(open === row.fingerprint ? null : row.fingerprint)}>
            <span className="block font-semibold [overflow-wrap:anywhere]">{row.merchant || 'Операция'}</span>
            <span className="block text-xs text-muted">{row.date ? ddmm(row.date) : 'Уточните дату'} · {category} · {account ?? 'Уточните счёт'}</span>
          </button>
          <div className="max-w-28 min-w-0 text-right font-semibold [overflow-wrap:anywhere]">
            {row.amount == null ? 'Уточнить' : row.currency === 'RUB' ? <Money value={row.amount} kopecks /> :
              <>{row.amount.toLocaleString('ru-RU')} {row.currency}</>}
          </div>
        </div>
        {(row.warnings.length > 0 || errors) && <p className="text-xs text-warn">{errors ?? row.warnings[0]}</p>}
        {open === row.fingerprint && <div className="space-y-2 border-t border-line pt-2">
        <Field label="Вид операции"><select className="field" value={row.kind} onChange={e => change(i, { kind: e.target.value as ScreenshotKind, eventKey: undefined, selected: false })}>
          {Object.entries(kinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></Field>
        {row.warnings.map(w => <p key={w} className="text-[12px] text-warn">{w}</p>)}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Сумма"><input className="field" inputMode="decimal" defaultValue={row.amount ?? ''} onChange={e => change(i, { amount: parseAmount(e.target.value) })} /></Field>
          <Field label="Валюта"><input className="field" value={row.currency} maxLength={3} onChange={e => change(i, { currency: e.target.value.toUpperCase() })} /></Field>
          <Field label="Дата"><input className="field" type="date" value={row.date} max={moscowClock().date} onChange={e => change(i, { date: e.target.value, eventKey: undefined })} /></Field>
          <Field label="Время, МСК"><input className="field" type="time" value={row.time} onChange={e => change(i, { time: e.target.value })} /></Field>
        </div>
        <Field label="Магазин или получатель"><input className="field" value={row.merchant} maxLength={100} onChange={e => change(i, { merchant: redactBankText(e.target.value) })} /></Field>
        <Field label="Назначение и комментарий"><input className="field" value={row.memo} maxLength={150} onChange={e => change(i, { memo: redactBankText(e.target.value) })} /></Field>
        {row.kind !== 'credit' && <Field label={row.lastFour ? `Счёт операции · распознано ••${row.lastFour}` : 'Счёт операции'}>
          <select className="field" value={row.accountId} onChange={e => change(i, { accountId: e.target.value })}>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        </Field>}
        {row.kind === 'transfer' && <Field label="Куда переведено"><select className="field" value={row.toAccountId ?? ''} onChange={e => change(i, { toAccountId: e.target.value })}>
          <option value="">Укажите счёт</option>{accounts.filter(a => a.id !== row.accountId).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select></Field>}
        {['credit', 'loan', 'debt'].includes(row.kind) && <Field label="Карта или обязательство"><select className="field" value={row.debtId ?? ''} onChange={e => change(i, { debtId: e.target.value, eventKey: undefined })}>
          <option value="">Укажите обязательство</option>{store.debts.filter(d => row.kind !== 'credit' || d.kind === 'card').map(d => <option key={d.id} value={d.id}>{d.short}</option>)}
        </select></Field>}
        {(row.kind === 'payroll' || row.kind === 'debt') && <Field label="Связать с календарём"><select className="field" value={row.eventKey ?? ''} onChange={e => change(i, { eventKey: e.target.value || undefined })}>
          <option value="">{row.kind === 'payroll' ? 'Выберите выплату' : 'Отдельная операция'}</option>{candidates.map(e => <option key={e.key} value={e.key}>{ddmm(e.date)} · {e.title} · {e.amount} ₽</option>)}
        </select></Field>}
        {row.kind === 'refund' && <Field label="Исходная покупка"><select className="field" value={row.expenseId ?? ''} onChange={e => {
          const expense = store.expenses.find(row => row.id === e.target.value);
          change(i, { expenseId: e.target.value, ...(expense ? { accountId: cashAccount(expense) ?? expense.creditCard ?? LIFE_ACCOUNT } : {}) });
        }}>
          <option value="">Выберите покупку</option>{refunds.map(e => <option key={e.id} value={e.id}>{ddmm(e.date)} · {e.note} · {e.amount} ₽</option>)}
        </select></Field>}
        {['purchase', 'credit'].includes(row.kind) && <Field label={row.categoryGuessed ? 'Категория · предположение' : 'Категория'}>
          <select className="field" value={row.category} onChange={e => change(i, { category: e.target.value as CategoryId, categoryGuessed: false })}>
            {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.short}</option>)}
          </select>
        </Field>}
        </div>}
        {duplicate && <details className="rounded-xl bg-warn/10 p-2 text-[13px]">
          <summary className="text-warn">{duplicate.exact ? duplicate.label ?? 'Строка с этого снимка уже записана' : 'В истории есть похожая операция'}</summary>
          <p>{ddmm(row.date)} · <Money value={row.amount ?? 0} kopecks /> · {duplicate.expense?.note ?? duplicate.operation?.note ?? duplicate.label ?? 'Банковская операция'}</p>
          {!duplicate.exact && <label className="mt-2 flex gap-2"><input type="checkbox" checked={!!row.force} onChange={e => change(i, { force: e.target.checked, selected: false })} /> Это другая операция</label>}
        </details>}
        <label className="flex min-h-11 items-center gap-2 text-[14px]">
          <input type="checkbox" disabled={!!errors || duplicate?.exact || (!!duplicate && !row.force)}
            checked={!!row.selected && !!selectable(row)} onChange={e => change(i, { selected: e.target.checked })} /> Проверено, добавить
        </label>
      </section>;
    })}
    {message && <p role="status" className="text-[13px] text-warn">{message}</p>}
    <PrimaryButton onClick={save} disabled={!drafts.some(row => row.selected)}>Записать отмеченные{selected > 0 ? ` · ${selected}` : ''}</PrimaryButton>
    <SecondaryButton className="w-full" onClick={onBack}>Назад без записи</SecondaryButton>
  </div>;
}

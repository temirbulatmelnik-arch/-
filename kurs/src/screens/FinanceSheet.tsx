import { useMemo, useState } from 'react';
import { Field, Money, PrimaryButton, SecondaryButton, Segmented, Sheet } from '../components/ui';
import { accountOptions, cashAccount, cents, LIFE_ACCOUNT, monthDebtActivity, RESERVE_ACCOUNT, validDate, type AccountOperation, type CashAccount } from '../domain/accounts';
import { eventsBetween } from '../domain/calendar';
import { addDays, ddmmyyyy, monthKey } from '../domain/dates';
import { parseAmount } from '../domain/money';
import { uid, useStore } from '../store/store';
import { toast, useCal, useToday, useUi } from '../store/ui';
import { useLedger } from './Checkup';

export function FinanceSheet() {
  const open = useUi(s => s.finance);
  const set = useUi(s => s.set);
  return <Sheet open={open} title="Счета и операции" onClose={() => set({ finance: false })}>{open && <Body />}</Sheet>;
}

function Body() {
  const [tab, setTab] = useState<'accounts' | 'journal' | 'split'>('accounts');
  return <div className="space-y-4">
    <Segmented value={tab} onChange={setTab} options={[{ id: 'accounts', label: 'Счета' }, { id: 'journal', label: 'Операции' }, { id: 'split', label: 'Сплит' }]} />
    {tab === 'accounts' ? <Accounts /> : tab === 'journal' ? <Journal /> : <Split />}
  </div>;
}

function Accounts() {
  const book = useStore(s => s.accountBook);
  const led = useLedger();
  const set = useUi(s => s.set);
  const now = useToday();
  const [account, setAccount] = useState<CashAccount | null>(null);
  const [stressDate, setStressDate] = useState(book.stress?.date ?? now);
  const [stressAmount, setStressAmount] = useState(book.stress ? String(book.stress.amount) : '');
  const [stressAccount, setStressAccount] = useState(book.stress?.accountId ?? RESERVE_ACCOUNT);
  const show = (p: { card?: true; reserve?: true }) => set({ finance: false, ...p });
  return <>
    <div className="card divide-y divide-line p-4">
      <AccountRow name="Карта жизни" value={led.card} onClick={() => show({ card: true })} />
      <AccountRow name="Резерв" value={led.reserveVerified ? led.reserve : null} onClick={() => show({ reserve: true })} />
      {led.cashAccounts.map(a => <AccountRow key={a.id} name={a.name} value={a.expected} onClick={() => setAccount(a)} />)}
    </div>
    {account ? <AccountForm key={account.id} account={account} close={() => setAccount(null)} />
      : <SecondaryButton className="w-full" onClick={() => setAccount({ id: uid(), name: '' })}>Добавить дебетовый счёт</SecondaryButton>}
    {led.unclassifiedCredit.length > 0 && <div className="card p-4">
      <h3 className="font-medium">Кредитные покупки без карты</h3>
      {led.unclassifiedCredit.slice(-12).map(e => <button className="block py-2 text-left text-sea" type="button" key={e.id}
        onClick={() => set({ finance: false, add: { edit: e } })}>{ddmmyyyy(e.date)} · {e.note || 'Покупка'} · <Money value={e.amount} /></button>)}
    </div>}
    <div className="card space-y-3 p-4">
      <h3 className="font-medium">Стресс-сценарий</h3>
      <Field label="Дата необходимого расхода"><input className="field" type="date" min={now} value={stressDate} onChange={e => setStressDate(e.target.value)} /></Field>
      <Field label="Сумма"><input className="field" inputMode="decimal" value={stressAmount} onChange={e => setStressAmount(e.target.value)} /></Field>
      <AccountSelect label="Счёт" value={stressAccount} set={setStressAccount} />
      <SecondaryButton className="w-full" onClick={() => {
        const amount = parseAmount(stressAmount);
        if (amount && validDate(stressDate) && stressDate >= now) { useStore.getState().setStress({ date: stressDate, amount, accountId: stressAccount }); toast('Стресс-сценарий обновлён'); }
        else if (!stressAmount.trim()) { useStore.getState().setStress(undefined); toast('Расход удалён из стресс-сценария'); }
        else toast('Укажите дату и сумму');
      }}>Сохранить сценарий</SecondaryButton>
    </div>
  </>;
}

function AccountRow({ name, value, onClick }: { name: string; value: number | null; onClick: () => void }) {
  return <button className="flex w-full justify-between gap-2 py-3 text-left" type="button" onClick={onClick}>
    <span>{name}</span>{value == null ? <span className="text-muted">Не подтверждено</span> : <Money value={value} />}
  </button>;
}

function AccountForm({ account, close }: { account: CashAccount; close: () => void }) {
  const [name, setName] = useState(account.name);
  const [balance, setBalance] = useState('');
  const entered = balance.trim() ? parseAmount(balance) : undefined;
  return <div className="card space-y-3 p-4">
    <Field label="Название счёта"><input className="field" value={name} onChange={e => setName(e.target.value)} placeholder="Дебетовая карта" /></Field>
    <Field label="Сверенный остаток сегодня" hint="Оставьте пустым, если баланс не проверяли.">
      <input className="field" inputMode="decimal" value={balance} onChange={e => setBalance(e.target.value)} />
    </Field>
    <PrimaryButton disabled={!name.trim() || entered === null} onClick={() => {
      useStore.getState().saveCashAccount(account.id, name, entered ?? undefined); close(); toast('Счёт сохранён');
    }}>Сохранить счёт</PrimaryButton>
  </div>;
}

function AccountSelect({ label, value, set }: { label: string; value: string; set: (value: string) => void }) {
  const book = useStore(s => s.accountBook);
  return <Field label={label}><select className="field" value={value} onChange={e => set(e.target.value)}>
    {!value && <option value="">Выберите счёт по выписке</option>}
    {accountOptions(book).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
  </select></Field>;
}

const LABELS = { transfer: 'Перевод', loan_disbursement: 'Получение займа', refund: 'Возврат покупки',
  debt_payment: 'Платёж по долгу', fee: 'Комиссия', interest: 'Начисленные проценты' } as const;
type JournalKind = keyof typeof LABELS;

function Journal() {
  const now = useToday();
  const { accountBook: book, debts, expenses, oneOff, marks } = useStore();
  const activity = monthDebtActivity(book, expenses, now);
  const [type, setType] = useState<JournalKind>('transfer');
  const [date, setDate] = useState(now);
  const [time, setTime] = useState('');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState(LIFE_ACCOUNT);
  const [to, setTo] = useState(RESERVE_ACCOUNT);
  const [debtId, setDebtId] = useState('');
  const [splitPlanId, setSplitPlanId] = useState('');
  const [oldKey, setOldKey] = useState('');
  const [expenseId, setExpenseId] = useState('');
  const [principal, setPrincipal] = useState('');
  const [interest, setInterest] = useState('');
  const [fee, setFee] = useState('');
  const [note, setNote] = useState('');
  const [externalId, setExternalId] = useState('');
  const [scheduled, setScheduled] = useState(false);
  const [debtBooked, setDebtBooked] = useState(false);
  const [auditId, setAuditId] = useState('');
  const [auditDebt, setAuditDebt] = useState('');
  const [auditCash, setAuditCash] = useState('');
  const [paymentFunding, setPaymentFunding] = useState<'unknown' | 'borrowed'>('unknown');
  const [cashBooked, setCashBooked] = useState(false);
  const [preview, setPreview] = useState<AccountOperation | null>(null);
  const audit = book.loanReviews?.find(r => r.id === auditId);
  const historical = type === 'loan_disbursement' ? book.historicalLoans?.find(r => r.eventKey === oldKey) : undefined;
  const checkBalances = !!(audit || historical);
  const auditDone = (id: string) => book.operations.some(e => e.type === 'loan_disbursement' && e.auditId === id && e.status === 'confirmed');
  const eligible = oneOff.filter(e => e.kind === 'income' && marks[e.key]?.done &&
    !book.operations.some(op => op.eventKey === e.key) && (!audit || (
      cents(marks[e.key].amount ?? e.amount) === cents(audit.amount) &&
      (marks[e.key].paidDate ?? e.date) >= audit.from && (marks[e.key].paidDate ?? e.date) <= audit.to
    )));
  const active = [...accountOptions(book), ...debts.filter(d => d.kind === 'card').map(d => ({ id: d.id, name: d.short }))];
  const loanRisk = book.operations.some(op => op.type === 'loan_disbursement' && op.fundingSource === 'borrowed');

  const prepare = () => {
    const value = parseAmount(amount);
    if (checkBalances && (!auditDebt || !auditCash || !accountId || !debtId)) { toast('Укажите счёт, долг и включение операции в банковские остатки'); return; }
    if (!value || !validDate(date) || (date > now && !(type === 'transfer' && scheduled))) { toast('Укажите сумму и дату операции'); return; }
    const timestamp = time ? new Date(`${date}T${time}`) : date === now ? new Date() : undefined;
    if (timestamp && Number.isNaN(timestamp.getTime())) { toast('Проверьте время операции'); return; }
    const base = { id: uid(), date, at: timestamp?.toISOString(), amount: value, accountId,
      status: type === 'transfer' && scheduled ? 'planned' as const : 'confirmed' as const,
      origin: 'manual' as const, fundingSource: 'unknown' as const, note: note.trim() || undefined,
      externalId: externalId.trim() || undefined };
    if (type === 'transfer') setPreview({ ...base, type, toAccountId: to });
    else if (type === 'loan_disbursement') setPreview({ ...base, type, debtId, splitPlanId: splitPlanId || undefined,
      eventKey: oldKey || undefined, fundingSource: 'borrowed', debtBooked: checkBalances ? auditDebt === 'yes' : debtBooked,
      cashBooked: checkBalances ? auditCash === 'yes' : cashBooked, auditId: audit?.id });
    else if (type === 'debt_payment') setPreview({ ...base, type, debtId, debtBooked, cashBooked, fundingSource: paymentFunding,
      principal: parseAmount(principal) ?? undefined, interest: parseAmount(interest) ?? undefined, fee: parseAmount(fee) ?? undefined });
    else if (type === 'refund') {
      const purchase = expenses.find(e => e.id === expenseId);
      const id = purchase && (cashAccount(purchase) ?? purchase.creditCard);
      if (!id) { toast('Сначала укажите счёт покупки'); return; }
      setPreview({ ...base, type, expenseId, accountId: id, debtId: purchase.source === 'credit' ? purchase.creditCard : undefined, cashBooked });
    }
    else setPreview({ ...base, type, debtId: debtId || undefined, cashBooked });
  };

  if (preview) return <div className="card space-y-3 p-4">
    <h3 className="font-medium">Проверьте операцию</h3>
    <p>{LABELS[preview.type as JournalKind]} · <Money value={preview.amount} /> · {ddmmyyyy(preview.date)}</p>
    <p className="text-[13px] text-muted">{active.find(a => a.id === preview.accountId)?.name}
      {preview.type === 'transfer' && <> → {active.find(a => a.id === preview.toAccountId)?.name}</>}</p>
    {preview.type === 'loan_disbursement' && <p className="text-[13px] text-muted">
      {preview.eventKey ? 'Отметка календаря сохранится. Поступление будет учтено как заём.' : 'Операция появится в журнале заимствований.'}
      {' '}{preview.debtBooked ? 'Указано, что выдача уже включена в долг банка.' : 'Прибавляется только к долгу после банковской сверки.'}
    </p>}
    {preview.type === 'debt_payment' && preview.fundingSource === 'borrowed' && <p className="text-[13px] text-warn">
      Погашение за счёт нового займа повышает риск. Журнал учтёт фактическое списание, выдачу займа зарегистрируйте отдельно.
    </p>}
    {preview.cashBooked && <p className="text-[13px] text-muted">Денежный остаток уже содержит эту операцию.</p>}
    <PrimaryButton onClick={() => {
      if (!useStore.getState().saveOperation(preview)) { toast('Проверьте реквизиты, разбивку и наличие дубля'); return; }
      setPreview(null); setAmount(''); setNote(''); setExternalId(''); setOldKey(''); setAuditId(''); toast('Операция сохранена');
    }}>Подтвердить запись</PrimaryButton>
    <SecondaryButton className="w-full" onClick={() => setPreview(null)}>Вернуться к редактированию</SecondaryButton>
  </div>;

  return <>
    <div className="card space-y-1 p-4 text-[13px]">
      <h3 className="font-medium">Движение по долгам за {monthKey(now)}</h3>
      <p>Заёмные зачисления <Money value={activity.loanDisbursements} /> · траты по кредиткам <Money value={activity.creditPurchases} /></p>
      <p>Проценты <Money value={activity.interest} /> · комиссии <Money value={activity.fees} /></p>
      <p>Погашено тело долга <Money value={activity.principal} /></p>
      {activity.unknownPrincipal > 0 && <p className="text-muted">Платежи без разбивки <Money value={activity.unknownPrincipal} /></p>}
      {book.historicalLoans?.some(row => !book.operations.some(op => op.eventKey === row.eventKey)) && <details className="text-muted">
        <summary className="text-sea">Заёмные поступления из истории календаря</summary>
        {book.historicalLoans?.filter(row => !book.operations.some(op => op.eventKey === row.eventKey)).map(row =>
          <button type="button" className="mt-2 block text-left text-sea" key={row.eventKey} onClick={() => {
            setType('loan_disbursement'); setAuditId(''); setOldKey(row.eventKey); setDate(row.date);
            setAmount(String(row.amount)); setAccountId(''); setDebtId(row.debtId); setSplitPlanId(''); setTime('');
            setAuditCash(''); setAuditDebt(''); setExternalId(''); setNote('');
          }}>{ddmmyyyy(row.date)} · {debts.find(d => d.id === row.debtId)?.short} · <Money value={row.amount} /> · сверить</button>)}
        <p className="mt-2">Категория исправлена. Привязку к счёту и включение в банковские остатки нужно сверить отдельно.</p>
      </details>}
    </div>
    {!!book.loanReviews?.length && <div className="card divide-y divide-line px-4">
      <h3 className="py-3 font-medium">Заёмные поступления к сверке</h3>
      {book.loanReviews.map(r => <button className="flex w-full justify-between gap-2 py-3 text-left text-[13px]" key={r.id} type="button"
        disabled={auditDone(r.id)} onClick={() => {
          setAuditId(r.id); setAuditDebt(''); setAuditCash(''); setType('loan_disbursement'); setOldKey('');
          setDate(r.from); setAmount(String(r.amount)); setNote(r.label); setDebtId(''); setSplitPlanId(''); setExternalId(''); setTime('');
        }}>
        <span>{r.label} · <Money value={r.amount} /></span>
        <span className={auditDone(r.id) ? 'text-pos' : 'text-sea'}>{auditDone(r.id) ? 'Сверено' : 'Сверить'}</span>
      </button>)}
    </div>}
    <div className="card space-y-3 p-4">
      {audit && <p className="text-[13px] text-muted">{audit.label} · {ddmmyyyy(audit.from)}–{ddmmyyyy(audit.to)}</p>}
      <Field label="Вид операции"><select className="field" value={type} onChange={e => { setType(e.target.value as JournalKind); setAuditId(''); setOldKey(''); setCashBooked(false); setDebtBooked(false); }}>
        {Object.entries(LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></Field>
      {type === 'loan_disbursement' && eligible.length > 0 && <Field label="Связать с уже полученным поступлением">
        <select className="field" value={oldKey} onChange={e => {
          setOldKey(e.target.value);
          const old = eligible.find(x => x.key === e.target.value);
          if (old) { setDate(marks[old.key].paidDate ?? old.date); setAmount(String(marks[old.key].amount ?? old.amount)); }
        }}>
          <option value="">Новая операция</option>
          {eligible.map(e => <option key={e.key} value={e.key}>{ddmmyyyy(marks[e.key].paidDate ?? e.date)} · {e.title} · {marks[e.key].amount ?? e.amount} ₽</option>)}
        </select>
      </Field>}
      {type !== 'refund' && <AccountSelect label={type === 'loan_disbursement' ? 'Счёт зачисления' : 'Счёт списания'} value={accountId} set={setAccountId} />}
      {type === 'transfer' && <>
        <AccountSelect label="Счёт назначения" value={to} set={setTo} />
        <label className="flex gap-2 text-[14px]"><input type="checkbox" checked={scheduled} onChange={e => setScheduled(e.target.checked)} /> Только запланировать</label>
      </>}
      {type !== 'transfer' && type !== 'refund' && <Field label="Связанное обязательство"><select className="field" value={debtId} onChange={e => { setDebtId(e.target.value); setSplitPlanId(''); }}>
        <option value="">Выберите при наличии</option>{debts.map(d => <option key={d.id} value={d.id}>{d.short}</option>)}
      </select></Field>}
      {type === 'loan_disbursement' && book.splitPlans.some(p => p.debtId === debtId) && <Field label="План Сплита">
        <select className="field" value={splitPlanId} onChange={e => setSplitPlanId(e.target.value)}><option value="">Не указан</option>
          {book.splitPlans.filter(p => p.debtId === debtId).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>}
      {type === 'refund' && <Field label="Связанная покупка"><select className="field" value={expenseId} onChange={e => setExpenseId(e.target.value)}>
        <option value="">Выберите покупку</option>
        {expenses.slice(-100).reverse().map(e => <option key={e.id} value={e.id}>{ddmmyyyy(e.date)} · {e.note || e.category} · {e.amount} ₽</option>)}
      </select></Field>}
      {checkBalances && <>
        <Field label="Уже вошло в остаток долга?"><select className="field" value={auditDebt} onChange={e => setAuditDebt(e.target.value)}>
          <option value="">Уточните по выписке</option><option value="yes">Да, вошло</option><option value="no">Нет, ещё не вошло</option>
        </select></Field>
        <Field label="Уже вошло в остаток денежного счёта?"><select className="field" value={auditCash} onChange={e => setAuditCash(e.target.value)}>
          <option value="">Уточните по выписке</option><option value="yes">Да, вошло</option><option value="no">Нет, ещё не вошло</option>
        </select></Field>
      </>}
      {type === 'debt_payment' && <Field label="Источник средств погашения">
        <select className="field" value={paymentFunding} onChange={e => setPaymentFunding(e.target.value === 'borrowed' ? 'borrowed' : 'unknown')}>
          <option value="unknown">Личные или неизвестно</option><option value="borrowed">Подтверждённый новый заём</option>
        </select>
      </Field>}
      {!checkBalances && (type === 'loan_disbursement' || type === 'debt_payment') &&
        <label className="flex gap-2 text-[14px]"><input type="checkbox" checked={debtBooked} onChange={e => setDebtBooked(e.target.checked)} /> Уже включено в сверенный долг</label>}
      {!checkBalances && type !== 'transfer' && <label className="flex gap-2 text-[14px]"><input type="checkbox" checked={cashBooked} onChange={e => setCashBooked(e.target.checked)} /> Уже включено в сверенный денежный остаток</label>}
      <Field label="Сумма"><input className="field" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></Field>
      {type === 'debt_payment' && <div className="space-y-3">
        {([{ label: 'Тело долга', value: principal, set: setPrincipal }, { label: 'Проценты', value: interest, set: setInterest }, { label: 'Комиссия', value: fee, set: setFee }])
          .map(x => <Field key={x.label} label={x.label}><input className="field" value={x.value} onChange={e => x.set(e.target.value)} inputMode="decimal" /></Field>)}
      </div>}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Дата"><input className="field" type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
        <Field label="Время из банка"><input className="field" type="time" value={time} onChange={e => setTime(e.target.value)} /></Field>
      </div>
      <Field label="Идентификатор операции из банка"><input className="field" value={externalId} onChange={e => setExternalId(e.target.value)} /></Field>
      <Field label="Примечание"><input className="field" value={note} onChange={e => setNote(e.target.value)} /></Field>
      <PrimaryButton onClick={prepare}>Посмотреть изменения</PrimaryButton>
    </div>
    {loanRisk && <p className="text-[13px] text-warn">Полученные займы входят в денежные остатки по своим счетам. Доля заёмных средств в смешанном остатке неизвестна без связи с расходами.</p>}
    {book.operations.length > 0 && <div className="card divide-y divide-line p-4">
      {book.operations.slice(-20).reverse().map(op => <div className="py-2 text-[13px]" key={op.id}>
        {ddmmyyyy(op.date)} · {LABELS[op.type as JournalKind] ?? op.note ?? 'Поступление'} · <Money value={op.amount} />
        {' · '}{active.find(a => a.id === op.accountId)?.name ?? op.accountId}{op.status === 'planned' && ' · план'}
        {op.type === 'transfer' && op.status === 'planned' && <button type="button" className="ml-2 text-sea" onClick={() =>
          setPreview({ ...op, date: now, at: new Date().toISOString(), status: 'confirmed' })}>Подтвердить исполнение сегодня</button>}
      </div>)}
    </div>}
  </>;
}

function Split() {
  const cal = useCal();
  const now = useToday();
  const book = useStore(s => s.accountBook);
  const [debt, setDebt] = useState('');
  const [planId, setPlanId] = useState('');
  const [name, setName] = useState('');
  const [schedule, setSchedule] = useState('');
  const [payoff, setPayoff] = useState('');
  const [replaceParent, setReplaceParent] = useState(false);
  const [date, setDate] = useState(now);
  const [amount, setAmount] = useState('');
  const [account, setAccount] = useState(LIFE_ACCOUNT);
  const [replaces, setReplaces] = useState<string[]>([]);
  const [debitId, setDebitId] = useState('');
  const splitDebts = cal.debts.filter(d => d.kind === 'split');
  const debtIds = useMemo(() => new Set(splitDebts.map(d => d.id)), [splitDebts]);
  const candidates = eventsBetween({ ...cal, accountBook: { ...book, splitDebits: [] } },
    `${monthKey(date || now)}-01`, addDays(date || now, 30)).filter(e => e.debtId && debtIds.has(e.debtId) && !cal.marks?.[e.key]?.done);

  return <>
    <div className="card space-y-3 p-4">
      <h3 className="font-medium">Планы Сплита</h3>
      {book.splitPlans.map(p => <button key={p.id} type="button" className="block text-left text-[14px] text-sea" onClick={() => {
        setPlanId(p.id); setDebt(p.debtId); setName(p.name); setSchedule(p.schedule.map(s => `${s.date} ${s.amount}`).join('\n')); setPayoff(p.payoff ? String(p.payoff.amount) : ''); setReplaceParent(!!p.replacesKeys?.length);
      }}>{p.name}{p.payoff ? <> · закрытие <Money value={p.payoff.amount} /> на {ddmmyyyy(p.payoff.date)}</> : ''}</button>)}
      <Field label="Обязательство"><select className="field" value={debt} onChange={e => setDebt(e.target.value)}>
        <option value="">Выберите долг</option>{splitDebts.map(d => <option key={d.id} value={d.id}>{d.short}</option>)}
      </select></Field>
      <Field label="Название плана"><input className="field" value={name} onChange={e => setName(e.target.value)} /></Field>
      <Field label="График из банка" hint="Одна строка на платёж: ГГГГ-ММ-ДД сумма">
        <textarea className="field min-h-20" value={schedule} onChange={e => setSchedule(e.target.value)} />
      </Field>
      <label className="flex gap-2 text-[14px]"><input type="checkbox" checked={replaceParent} onChange={e => setReplaceParent(e.target.checked)} />
        Строки заменяют прежнюю сводную оценку за эти месяцы
      </label>
      <Field label="Стоимость полного закрытия по банку сегодня"><input className="field" value={payoff} onChange={e => setPayoff(e.target.value)} inputMode="decimal" /></Field>
      <SecondaryButton className="w-full" onClick={() => {
        if (!debt || !name.trim()) { toast('Укажите долг и название'); return; }
        const rows = schedule.trim() ? schedule.trim().split('\n').map(line => {
          const [date, ...rest] = line.trim().split(/\s+/);
          return { date, amount: parseAmount(rest.join(' ')) };
        }) : [];
        if (rows.some(r => !validDate(r.date) || r.amount == null || r.amount <= 0)) { toast('Проверьте строки графика'); return; }
        const amount = parseAmount(payoff);
        useStore.getState().saveSplitPlan({ id: planId || uid(), debtId: debt, name: name.trim(),
          schedule: rows.map(r => ({ date: r.date, amount: r.amount! })),
          ...(replaceParent ? { replacesKeys: [...new Set(rows.map(r => `pay:${debt}:${monthKey(r.date)}`))] } : {}), ...(amount == null ? {} : { payoff: { date: now, amount } }) });
        setPlanId(''); setName(''); setSchedule(''); setPayoff(''); toast('План сохранён');
      }}>Сохранить план</SecondaryButton>
    </div>
    <div className="card space-y-3 p-4">
      <h3 className="font-medium">Общее автосписание</h3>
      {book.splitDebits.map(entry => <button key={entry.id} type="button" className="block text-sea" onClick={() => {
        setDebitId(entry.id); setDate(entry.date); setAmount(String(entry.amount)); setAccount(entry.accountId); setReplaces(entry.replacesKeys);
      }}>{ddmmyyyy(entry.date)} · <Money value={entry.amount} /></button>)}
      <Field label="Дата списания"><input className="field" type="date" value={date} onChange={e => { setDate(e.target.value); setReplaces([]); }} /></Field>
      <Field label="Общая сумма из банка"><input className="field" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></Field>
      <AccountSelect label="Карта автосписания" value={account} set={setAccount} />
      <p className="text-[13px] text-muted">Отметьте только строки графика, которые уже входят в общую сумму.</p>
      {candidates.map(e => <label className="flex gap-2 text-[13px]" key={e.key}>
        <input type="checkbox" checked={replaces.includes(e.key)} onChange={() => setReplaces(replaces.includes(e.key) ? replaces.filter(x => x !== e.key) : [...replaces, e.key])} />
        {ddmmyyyy(e.date)} · {e.title} · <Money value={e.amount} />
      </label>)}
      <PrimaryButton onClick={() => {
        const value = parseAmount(amount);
        if (!value || !validDate(date) || !replaces.length) { toast('Укажите сумму, дату и включённые строки'); return; }
        const ids = [...new Set(candidates.filter(e => replaces.includes(e.key)).flatMap(e => e.debtId ? [e.debtId] : []))];
        useStore.getState().saveSplitDebit({ id: debitId || uid(), date, amount: value, accountId: account, debtIds: ids, replacesKeys: replaces });
        setDebitId(''); setAmount(''); setReplaces([]); toast('Автосписание сохранено');
      }}>Сохранить автосписание</PrimaryButton>
    </div>
  </>;
}

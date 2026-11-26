import { accountOptions, LIFE_ACCOUNT, RESERVE_ACCOUNT, validDate } from '../domain/accounts';
// Платёж, поступление или воскресное пополнение карты: отметить, поправить сумму и дату (у кредиток они плавают), распределить премию.
import { CalendarDays, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { AmountInput, Money, PrimaryButton, Row, SecondaryButton, Sheet } from '../components/ui';
import { GROUP_LABEL, whenText } from '../components/rows';
import { actionableEvent, cashIncomeEvent, eventGroup, incomeStatus, INCOME_STATUS_LABEL } from '../domain/calendar';
import { addDays, dayMonth, ddmmyyyy, relDays, weekdayFull } from '../domain/dates';
import { DEFAULT_PREPARATION_TIME, moscowClock, paymentPreparations, weeklyTopUp } from '../domain/funds';
import { ledger } from '../domain/ledger';
import { parseAmount, rub } from '../domain/money';
import type { CalEvent } from '../domain/types';
import { useLedger } from './Checkup';
import { uid, useStore } from '../store/store';
import { toast, useToday, useUi } from '../store/ui';

const BONUS_KINDS = ['bonusQuarter', 'bonusYear', 'vacation', 'thirteenth'];
export const isBonus = (e: CalEvent) => cashIncomeEvent(e) && !!e.incomeKind && BONUS_KINDS.includes(e.incomeKind);

export function EventSheet() {
  const e = useUi(s => s.event);
  const set = useUi(s => s.set);
  return (
    <Sheet open={!!e} onClose={() => set({ event: null })} title={e?.title ?? ''} subtitle={e ? GROUP_LABEL[eventGroup(e)] : undefined}>
      {e && <Body key={e.key} e={e} />}
    </Sheet>
  );
}

function Body({ e }: { e: CalEvent }) {
  const now = useToday();
  const moscowDate = moscowClock().date;
  const mark = useStore(s => s.marks[e.key]);
  const led = useLedger();
  const prepTime = DEFAULT_PREPARATION_TIME;
  const assigned = mark?.done ? e.accountId : LIFE_ACCOUNT;
  const prepared = led.heldForPayments.find(row => row.key === e.key && row.accountId === assigned);
  const [paymentScope, setPaymentScope] = useState<'weekly' | 'separate' | 'unknown'>('unknown');
  const [partial, setPartial] = useState(false);
  const [partialId] = useState(uid);
  const override = useStore(s => s.overrides[e.key]);
  const debt = useStore(s => (e.debtId ? s.debts.find(d => d.id === e.debtId) : undefined));
  const { markEvent, setOverride, clearOverride, updateDebt } = useStore.getState();
  const set = useUi(s => s.set);
  const group = eventGroup(e);
  const pay = e.payroll;
  const status = incomeStatus(e, mark);
  const [bankVerified, setBankVerified] = useState(false);
  const locked = e.economicType === 'loan_disbursement' || (pay?.documented && !bankVerified && !mark?.done) ||
    e.projection === 'conditional' || e.projection === 'internal_transfer';

  // пополнение по воскресеньям: до лимита следующей недели минус остаток уходящей
  const monday = e.kind === 'weekly' ? addDays(e.date, -6) : '';
  const [amount, setAmount] = useState(() => {
    if (mark?.amount == null && e.kind === 'weekly') {
      const led = ledger(useStore.getState());
      return led.lifeAvailable == null ? '' : String(weeklyTopUp(e.amount, led.lifeAvailable));
    }
    return String(Math.round((mark?.amount ?? e.amount) * 100) / 100);
  });
  const [editing, setEditing] = useState(false);
  const book = useStore(s => s.accountBook);
  const payment = mark?.done ? book.operations.find(row => row.eventKey === e.key && row.status === 'confirmed' &&
    (row.type === 'debt_payment' || row.type === 'expense') && row.budget?.unknown) : undefined;
  const account = assigned ?? LIFE_ACCOUNT;
  const prep = paymentPreparations([{ ...e, accountId: assigned, prepareOn: addDays(e.date, -1) }], mark ? { [e.key]: mark } : {}, led.heldForPayments, led.reserve)[0];
  const from = account === LIFE_ACCOUNT ? 'card' : 'reserve';
  const [paidDate, setPaidDate] = useState(() => pay?.documented && pay.actualPayDate ? pay.actualPayDate : moscowClock().date);
  const [principal, setPrincipal] = useState('');
  const [interest, setInterest] = useState('');
  const [fee, setFee] = useState('');
  const [gross, setGross] = useState('');
  const [withheld, setWithheld] = useState('');
  const [otherWithheld, setOtherWithheld] = useState('');
  const [newAmount, setNewAmount] = useState(String(e.amount));
  const [newDate, setNewDate] = useState(e.date);
  const [dateSource, setDateSource] = useState(() => pay ? useStore.getState().work?.payDateSources?.[pay.key] ?? '' : '');
  const value = parseAmount(amount) ?? 0;
  const close = () => set({ event: null });

  const done = () => {
    if (e.kind === 'weekly') {
      if (useStore.getState().confirmWeeklyTransfer(e.key, value, paidDate)) { toast('Пополнение записано'); close(); }
      else toast('Пополнение уже отмечено или остатки требуют сверки');
      return;
    }
    if (pay?.documented && !bankVerified) return;
    if (e.kind === 'payment' && partial && value >= e.amount) { toast('Для частичного платежа введите меньшую сумму'); return; }
    if (isBonus(e) && !e.nominalDate && e.economicType !== 'loan_disbursement') { set({ event: null, bonus: { event: { ...e, amount: value } } }); return; }
    markEvent(e, true, value, from, { accountId: account || undefined, bankVerified, budgetScope: paymentScope, partialId: partial ? partialId : undefined, principal: parseAmount(principal) ?? undefined,
      interest: parseAmount(interest) ?? undefined, fee: parseAmount(fee) ?? undefined, paidDate,
      ...(gross || withheld || otherWithheld ? { payrollActual: { gross: parseAmount(gross) ?? undefined,
        tax: parseAmount(withheld) ?? undefined, otherWithheld: parseAmount(otherWithheld) ?? undefined } } : {}),
    });
    const state = useStore.getState();
    if (!(partial ? state.accountBook.operations.some(op => op.id === partialId) : state.marks[e.key]?.done)) {
      toast('Проверьте счёт и разбивку платежа');
      return;
    }
    toast(e.kind === 'income' ? 'Поступление записано' : partial ? 'Частичное списание записано' : 'Банковское списание записано');
    close();
  };

  const saveEdit = () => {
    if (pay) {
      const state = useStore.getState();
      if (!state.work || !validDate(newDate) || !dateSource.trim()) { toast('Укажите дату и подтверждение бухгалтерии'); return; }
      const changed = state.saveWork({ ...state.work,
        payDates: { ...state.work.payDates, [pay.key]: newDate },
        payDateSources: { ...state.work.payDateSources, [pay.key]: dateSource.trim() },
      });
      if (!changed) { toast('Дата не сохранена. Проверьте параметры работы.'); return; }
      toast('Дата из графика бухгалтерии сохранена');
      close();
      return;
    }
    const a = parseAmount(newAmount);
    setOverride(e.key, { ...(a != null && a !== e.amount ? { amount: a } : {}), ...(newDate && newDate !== e.date ? { date: newDate } : {}) });
    toast('Сумма и дата обновлены');
    close();
  };

  return (
    <div className="space-y-4 pt-1">
      <div className="card px-5 py-4">
        <Money value={mark?.done && mark.amount != null ? mark.amount : e.amount} approx={e.approx && !mark?.done} sign={e.kind === 'income'} kopecks={!e.approx}
          className={`figure block text-[40px] leading-none ${e.kind === 'income' ? 'text-pos' : ''}`} />
        <div className="mt-3 divide-y divide-line">
          <Row label="Когда">{e.dateMode === 'month' ? 'в течение месяца' : `${whenText(e)}, ${weekdayFull(e.date)}`}</Row>
          {status && e.economicType !== 'loan_disbursement' && <Row label="Статус">{INCOME_STATUS_LABEL[status]}</Row>}
          {e.kind === 'payment' && !mark?.done && <Row label="Счёт списания">
            {accountOptions(book).find(option => option.id === assigned)?.name ?? 'Требует уточнения'}
          </Row>}
          {e.kind === 'payment' && <>
            <Row label="Подготовка">{mark?.done ? 'Платёж списан' : prepared?.amount && prepared.amount >= e.amount
              ? 'Перевод сделан' : prepared?.amount ? 'Подготовлен частично' : 'Не подготовлен'}</Row>
            {prep && <details className="py-2 text-[13px]">
              <summary className="text-sea">Банк требует более ранний срок</summary>
              <label className="mt-2 block text-muted">Укажите дату из правил банка
                <input className="field mt-1" type="date" value={override?.prepareOn ?? e.prepareOn ?? ''}
                  max={addDays(e.date, -1)} onChange={x => {
                    const date = x.target.value;
                    if (date && date >= e.date) return;
                    setOverride(e.key, { prepareOn: date || undefined });
                  }} />
              </label>
            </details>}
            {prep && <Row label="Подготовить к">{ddmmyyyy(prep.remindDate)} · {prepTime} МСК</Row>}
            {prepared && <Row label="Последнее выделение">{ddmmyyyy(prepared.date)} · <Money value={prepared.amount} kopecks /></Row>}
            {mark?.done && mark.paidDate && <Row label="Фактическое списание">{ddmmyyyy(mark.paidDate)}</Row>}
            {prep?.accountId && prep.accountId !== RESERVE_ACCOUNT && !prep.toFund && !prep.inTransit ? null :
              prep && <Row label="Подготовить деньги"><button type="button" className="text-sea"
                onClick={() => set({ event: null, transfer: { kind: 'payment', plan: prep } })}>Открыть маршрут</button></Row>}
          </>}
          {!!e.possibleExtra && !mark?.done && <Row label="Диапазон до сверки">
            <Money value={e.amount} kopecks />–<Money value={e.amount + e.possibleExtra} kopecks />
          </Row>}
          {pay && <>
            <Row label="Расчётный период">{pay.accrualPeriod}</Row>
            <Row label="Номинальная дата">{ddmmyyyy(pay.nominalDate)}</Row>
            <Row label="Ожидаемая дата">{pay.documented && !pay.actualPayDate ? 'Дата требует сверки' : ddmmyyyy(pay.expectedPayDate)}</Row>
            {pay.alternatePayDate && <Row label="Альтернативная дата">{ddmmyyyy(pay.alternatePayDate)} · после подтверждения</Row>}
            <Row label="Банковская отметка">{mark?.done ? (pay.actualPayDate ? ddmmyyyy(pay.actualPayDate) : 'Отмечено') : 'Ожидает сверки'}</Row>
            {pay.documented && !mark?.done && pay.actualPayDate && <Row label="Дата по документам">{ddmmyyyy(pay.actualPayDate)}</Row>}
            <Row label={pay.actualGrossKnown ? 'Начислено по листку' : 'Оценка начисления'}>{pay.gross ? <Money value={pay.gross} approx={!pay.actualGrossKnown} kopecks /> : 'Нет данных'}</Row>
            <Row label={pay.actualTaxKnown ? 'НДФЛ по листку' : 'Оценка НДФЛ'}><Money value={pay.tax} approx={!pay.actualTaxKnown} kopecks /></Row>
            {!!pay.taxDeduction && <Row label="Предполагаемый вычет"><Money value={pay.taxDeduction} approx /></Row>}
            {pay.workDays != null && <Row label="Рабочие дни">{pay.paidDays} из {pay.workDays} · 1–15 числа {pay.firstPaidDays} из {pay.firstWorkDays}</Row>}
            <Row label="Основание">{pay.documentarySource ?? pay.source}</Row>
          </>}
          {e.dateMode !== 'month' && !mark?.done && actionableEvent(e) && <Row label="Осталось">{relDays(now, e.date)}</Row>}
          {debt && <Row label="Остаток долга"><button type="button" onClick={() => set({ event: null, debt: debt.id })} className="text-sea"><Money value={debt.balance} /></button></Row>}
          {override && <Row label="Изменено вручную"><button type="button" onClick={() => { clearOverride(e.key); toast('Вернул расчётные сумму и дату'); close(); }} className="text-sea">вернуть расчёт</button></Row>}
        </div>
        {e.note && <p className="mt-3 rounded-xl bg-sea/10 px-3 py-2.5 text-[13px] leading-snug">{e.note}</p>}
      </div>

      {led.heldForPayments.filter(row => row.key === e.key && (mark?.done || row.accountId !== assigned || row.amount > e.amount))
        .map(row => <SecondaryButton key={row.accountId} className="w-full" onClick={() => set({ event: null,
          transfer: { kind: 'return', held: { ...row, amount: mark?.done || row.accountId !== assigned ? row.amount : row.amount - e.amount } } })}>
          Вернуть остаток в резерв <Money value={mark?.done || row.accountId !== assigned ? row.amount : row.amount - e.amount} kopecks />
        </SecondaryButton>)}
      {!locked && !mark?.done && e.kind === 'payment' && value > (prepared?.amount ?? 0) && (
        <label className="card block p-3 text-[13px]">{prepared?.amount ? 'Источник оставшейся части' : 'Источник оплаты'}
          <select className="field mt-1" value={paymentScope} onChange={event => setPaymentScope(event.target.value as typeof paymentScope)}>
            <option value="unknown">Уточню при сверке</option>
            <option value="weekly">Из недельных денег</option>
            <option value="separate">Оплачено отдельно</option>
          </select>
        </label>
      )}
      {locked ? (
        <div className="space-y-2"><p className="rounded-2xl bg-surface-2 px-4 py-3 text-[14px] text-muted">
          {e.economicType === 'loan_disbursement' ? 'Подтверждённое заёмное поступление. В доходы не входит.'
            : pay?.documented ? 'Сумма известна по расчётному листку. Для банковского зачисления сверьте дату и сумму по выписке.'
            : e.projection === 'internal_transfer' ? 'Пополнение своего счёта. В обязательные расходы не входит.'
            : 'Условная досрочка. После прихода денег допустимую сумму проверяет осторожный прогноз.'}
        </p>
        {pay?.documented && !mark?.done && <SecondaryButton onClick={() => setBankVerified(true)} className="w-full">Есть зачисление в выписке</SecondaryButton>}
        </div>
      ) : mark?.done ? (
        <>
          <p className="rounded-2xl bg-pos/10 px-4 py-3 text-[14px] text-pos">
            {e.kind === 'income' ? 'Пришло' : e.kind === 'weekly' ? 'Долито' : 'Оплачено'}: {rub(mark.amount ?? e.amount)}
          </p>
          {payment && <div className="card space-y-2 p-3 text-[13px]">
            <p>Уточните источник части платежа, которая была без подготовки.</p>
            <SecondaryButton onClick={() => { if (useStore.getState().setPaymentFunding(payment.id, 'weekly')) toast('Учтено в недельном бюджете'); }}>Из недельных денег</SecondaryButton>
            <SecondaryButton onClick={() => { if (useStore.getState().setPaymentFunding(payment.id, 'separate')) toast('Отмечено как отдельная оплата'); }}>Оплачено отдельно</SecondaryButton>
          </div>}
          {(e.kind !== 'weekly' || !book.operations.some(op => op.type === 'transfer' && op.purpose === 'weekly' && op.eventKey === e.key)) && <SecondaryButton onClick={() => { markEvent(e, false); if (useStore.getState().marks[e.key]?.done) { toast('Операция уже вошла в сверку или использована'); return; } toast('Отметка снята'); close(); }} className="w-full"><Undo2 size={16} strokeWidth={1.5} /> Снять отметку</SecondaryButton>}
        </>
      ) : editing ? (
        <div className="card space-y-3 p-4">
          <div className="text-[13px] text-muted">{group === 'debt' ? 'Сумма и дата из приложения банка — у кредиток они меняются каждый месяц.' : 'Только для этого месяца.'}</div>
          {pay ? <label className="block text-[13px]">Подтверждение даты бухгалтерией
            <input className="field mt-1" value={dateSource} onChange={e => setDateSource(e.target.value)} placeholder="Например, утверждённый график от …" />
          </label> : <AmountInput value={newAmount} onChange={setNewAmount} size="md" />}
          <input type="date" value={newDate} onChange={x => setNewDate(x.target.value || e.date)} className="field" aria-label={pay ? 'Дата выплаты' : 'Дата платежа'} />
          {debt && typeof debt.dueDay === 'number' && newDate.slice(8) !== String(debt.dueDay).padStart(2, '0') && (
            <button type="button" onClick={() => { updateDebt(debt.id, { dueDay: Number(newDate.slice(8)) }); toast(`Теперь ${debt.short} — ${Number(newDate.slice(8))}-го каждый месяц`); }}
              className="text-[13px] font-medium text-sea">Сделать {Number(newDate.slice(8))}-е днём платежа каждый месяц</button>
          )}
          <PrimaryButton onClick={saveEdit} tone="ink" disabled={!!pay && !dateSource.trim()}>Сохранить</PrimaryButton>
        </div>
      ) : (
        <>
          <div>
            <div className="mb-1.5 text-[12.5px] font-medium text-muted">{e.kind === 'income' ? 'Сколько пришло' : e.kind === 'weekly' ? 'Сколько долили' : 'Сколько заплатили'}</div>
            <AmountInput value={amount} onChange={setAmount} size="md" />
          </div>
          {e.kind !== 'weekly' && <label className="block text-[13px]">
            Фактическая дата<input className="field mt-1" type="date" value={paidDate} max={moscowDate} onChange={x => setPaidDate(x.target.value)} />
          </label>}
          {e.kind === 'payment' && (
            <div>
              <div className="mb-1.5 text-[12.5px] font-medium text-muted">Откуда оплачено</div>
              <p className="text-[14px]">Карта жизни</p>
              {debt && <p className="mt-1.5 text-[12px] leading-snug text-muted">Платёж по долгу — только реальными деньгами: с кредитки его не гасим.</p>}
            </div>
          )}
          {e.kind === 'payment' && debt && <div className="space-y-2">
            {([{ label: 'Тело долга по выписке', value: principal, set: setPrincipal }, { label: 'Проценты', value: interest, set: setInterest },
              { label: 'Комиссия', value: fee, set: setFee }]).map(part => <label key={part.label} className="block text-[13px]">
              {part.label}<input className="field mt-1" inputMode="decimal" value={part.value} onChange={x => part.set(x.target.value)} />
            </label>)}
            <p className="text-[12.5px] text-muted">Если разбивки нет, оставьте поля пустыми. Списание учтётся, тело долга уточняется по выписке.</p>
          </div>}
          {e.nominalDate && e.kind === 'income' && <details className="text-[13px]">
            <summary className="text-sea">Суммы из расчётного листка</summary>
            {([{ label: 'Начислено до НДФЛ', value: gross, set: setGross }, { label: 'Фактический НДФЛ', value: withheld, set: setWithheld },
                { label: 'Другие удержания', value: otherWithheld, set: setOtherWithheld }]).map(part => <label key={part.label} className="mt-2 block">
              {part.label}<input className="field mt-1" inputMode="decimal" value={part.value} onChange={x => part.set(x.target.value)} />
            </label>)}
          </details>}
          {isBonus(e) && <p className="text-[12.5px] leading-snug text-muted">После подтверждения «Курс» предложит перевести поступление в резерв.</p>}
          {e.kind === 'payment' && value > 0 && value < e.amount && <label className="flex items-start gap-2 text-[13px]">
            <input type="checkbox" checked={partial} onChange={x => setPartial(x.target.checked)} /> Банк списал только часть. Остальное ещё к оплате.
          </label>}
          {e.kind === 'weekly' && value > led.reserve && <p className="text-[13px] text-warn">В резерве недостаточно денег.</p>}
          <PrimaryButton onClick={done} disabled={value <= 0 || !paidDate || paidDate > moscowDate || (e.kind === 'payment' && !account) || (e.kind === 'weekly' && (led.lifeAvailable == null || value > led.reserve))}>
            {e.kind === 'income' ? (isBonus(e) ? 'Подтвердить зачисление' : 'Поступление зачислено') : e.kind === 'weekly' ? 'Долил' : partial ? 'Записать частичное списание' : 'Платёж списан'}
          </PrimaryButton>
          {e.kind === 'weekly' ? (
            <>
              <p className="text-[12.5px] leading-snug text-muted">Сумма спишется с резерва. Удобнее закрыть неделю: приложение само посчитает, сколько осталось на карте и сколько долить.</p>
              <SecondaryButton onClick={() => set({ event: null, week: monday })} className="w-full">Закрыть неделю</SecondaryButton>
            </>
          ) : (
            <SecondaryButton onClick={() => (group === 'fixed' ? set({ event: null, fixed: true }) : setEditing(true))} className="w-full">
              <CalendarDays size={16} strokeWidth={1.5} /> {pay ? 'Указать дату по графику бухгалтерии' : group === 'fixed' ? 'Изменить сумму или число месяца' : `Изменить сумму или дату${e.dateMode !== 'month' ? ` (${dayMonth(e.date)})` : ''}`}
            </SecondaryButton>
          )}
        </>
      )}
    </div>
  );
}

import { accountOptions, LIFE_ACCOUNT } from '../domain/accounts';
// Платёж, поступление или воскресное пополнение карты: отметить, поправить сумму и дату (у кредиток они плавают), распределить премию.
import { CalendarDays, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { AmountInput, Money, PrimaryButton, Row, SecondaryButton, Sheet } from '../components/ui';
import { GROUP_LABEL, whenText } from '../components/rows';
import { actionableEvent, cashIncomeEvent, eventGroup, incomeStatus, INCOME_STATUS_LABEL } from '../domain/calendar';
import { addDays, dayMonth, ddmmyyyy, relDays, weekdayFull } from '../domain/dates';
import { heldKeys, ledger } from '../domain/ledger';
import { parseAmount, rub } from '../domain/money';
import type { CalEvent } from '../domain/types';
import { useStore } from '../store/store';
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
  const mark = useStore(s => s.marks[e.key]);
  const override = useStore(s => s.overrides[e.key]);
  const debt = useStore(s => (e.debtId ? s.debts.find(d => d.id === e.debtId) : undefined));
  const { markEvent, setOverride, clearOverride, updateDebt } = useStore.getState();
  const set = useUi(s => s.set);
  const group = eventGroup(e);
  const pay = e.payroll;
  const status = incomeStatus(e, mark);
  const locked = e.economicType === 'loan_disbursement' || pay?.documented ||
    e.projection === 'conditional' || e.projection === 'internal_transfer';

  // пополнение по воскресеньям: до лимита следующей недели минус остаток уходящей
  const monday = e.kind === 'weekly' ? addDays(e.date, -6) : '';
  const [amount, setAmount] = useState(() => {
    if (mark?.amount == null && e.kind === 'weekly') {
      const led = ledger(useStore.getState());
      return led.card == null ? '' : String(Math.round(Math.max(0, e.amount - Math.max(0, led.card - led.heldOnCard - led.incomeOnCard))));
    }
    return String(Math.round((mark?.amount ?? e.amount) * 100) / 100);
  });
  const [editing, setEditing] = useState(false);
  // деньги под платёж уже перевели на карту — по умолчанию «с карты»
  const [from, setFrom] = useState<'reserve' | 'card'>(() => mark?.paidFrom ?? (heldKeys(useStore.getState().reserveLog, useStore.getState().marks).has(e.key) ? 'card' : 'reserve'));
  const book = useStore(s => s.accountBook);
  const [account, setAccount] = useState(e.accountId ?? (e.kind === 'payment' ? '' : LIFE_ACCOUNT));
  const [paidDate, setPaidDate] = useState(now);
  const [principal, setPrincipal] = useState('');
  const [interest, setInterest] = useState('');
  const [fee, setFee] = useState('');
  const [gross, setGross] = useState('');
  const [withheld, setWithheld] = useState('');
  const [otherWithheld, setOtherWithheld] = useState('');
  const [newAmount, setNewAmount] = useState(String(e.amount));
  const [newDate, setNewDate] = useState(e.date);
  const value = parseAmount(amount) ?? 0;
  const close = () => set({ event: null });

  const done = () => {
    if (isBonus(e) && !e.nominalDate && e.economicType !== 'loan_disbursement') { set({ event: null, bonus: { event: { ...e, amount: value } } }); return; }
    markEvent(e, true, value, from, { accountId: account, principal: parseAmount(principal) ?? undefined,
      interest: parseAmount(interest) ?? undefined, fee: parseAmount(fee) ?? undefined, paidDate,
      ...(gross || withheld || otherWithheld ? { payrollActual: { gross: parseAmount(gross) ?? undefined,
        tax: parseAmount(withheld) ?? undefined, otherWithheld: parseAmount(otherWithheld) ?? undefined } } : {}),
    });
    if (!useStore.getState().marks[e.key]?.done) { toast('Проверьте счёт и разбивку платежа'); return; }
    toast(e.kind === 'income' ? `Пришло на карту. В воскресной сверке приложение напомнит перевести ${rub(value)} в резерв` : e.kind === 'weekly' ? 'Отмечено: карта долита из резерва' : debt ? `Оплачено. В учёте отражена подтверждённая часть тела долга` : 'Отмечено: оплачено');
    close();
  };

  const saveEdit = () => {
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
            {accountOptions(book).find(option => option.id === e.accountId)?.name ?? 'Требует уточнения'}
          </Row>}
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
            <Row label="Основание">{pay.documentarySource ?? pay.source}</Row>
          </>}
          {e.dateMode !== 'month' && !mark?.done && actionableEvent(e) && <Row label="Осталось">{relDays(now, e.date)}</Row>}
          {debt && <Row label="Остаток долга"><button type="button" onClick={() => set({ event: null, debt: debt.id })} className="text-sea"><Money value={debt.balance} /></button></Row>}
          {override && <Row label="Изменено вручную"><button type="button" onClick={() => { clearOverride(e.key); toast('Вернул расчётные сумму и дату'); close(); }} className="text-sea">вернуть расчёт</button></Row>}
        </div>
        {e.note && <p className="mt-3 rounded-xl bg-sea/10 px-3 py-2.5 text-[13px] leading-snug">{e.note}</p>}
      </div>

      {locked ? (
        <p className="rounded-2xl bg-surface-2 px-4 py-3 text-[14px] text-muted">
          {e.economicType === 'loan_disbursement' ? 'Подтверждённое заёмное поступление. В доходы не входит.'
            : pay?.documented ? 'Историческая выплата по документам. Банковское движение не создаётся.'
            : e.projection === 'internal_transfer' ? 'Пополнение своего счёта. В обязательные расходы не входит.'
            : 'Условная досрочка. После прихода денег допустимую сумму проверяет осторожный прогноз.'}
        </p>
      ) : mark?.done ? (
        <>
          <p className="rounded-2xl bg-pos/10 px-4 py-3 text-[14px] text-pos">
            {e.kind === 'income' ? 'Пришло' : e.kind === 'weekly' ? 'Долито' : 'Оплачено'}: {rub(mark.amount ?? e.amount)}
          </p>
          <SecondaryButton onClick={() => { markEvent(e, false); toast('Отметка снята'); close(); }} className="w-full"><Undo2 size={16} strokeWidth={1.5} /> Снять отметку</SecondaryButton>
        </>
      ) : editing ? (
        <div className="card space-y-3 p-4">
          <div className="text-[13px] text-muted">{group === 'debt' ? 'Сумма и дата из приложения банка — у кредиток они меняются каждый месяц.' : 'Только для этого месяца.'}</div>
          <AmountInput value={newAmount} onChange={setNewAmount} size="md" />
          <input type="date" value={newDate} onChange={x => setNewDate(x.target.value || e.date)} className="field" aria-label="Дата платежа" />
          {debt && typeof debt.dueDay === 'number' && newDate.slice(8) !== String(debt.dueDay).padStart(2, '0') && (
            <button type="button" onClick={() => { updateDebt(debt.id, { dueDay: Number(newDate.slice(8)) }); toast(`Теперь ${debt.short} — ${Number(newDate.slice(8))}-го каждый месяц`); }}
              className="text-[13px] font-medium text-sea">Сделать {Number(newDate.slice(8))}-е днём платежа каждый месяц</button>
          )}
          <PrimaryButton onClick={saveEdit} tone="ink">Сохранить</PrimaryButton>
        </div>
      ) : (
        <>
          <div>
            <div className="mb-1.5 text-[12.5px] font-medium text-muted">{e.kind === 'income' ? 'Сколько пришло' : e.kind === 'weekly' ? 'Сколько долили' : 'Сколько заплатили'}</div>
            <AmountInput value={amount} onChange={setAmount} size="md" />
          </div>
          {e.kind !== 'weekly' && <label className="block text-[13px]">
            Фактическая дата<input className="field mt-1" type="date" value={paidDate} max={now} onChange={x => setPaidDate(x.target.value)} />
          </label>}
          {e.kind === 'payment' && (
            <div>
              <div className="mb-1.5 text-[12.5px] font-medium text-muted">Откуда оплачено</div>
              <select className="field" value={account} onChange={x => { setAccount(x.target.value); setFrom(x.target.value === LIFE_ACCOUNT ? 'card' : 'reserve'); }}>
                <option value="">Выберите счёт по выписке</option>
                {accountOptions(book).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              {account && account !== e.accountId && <button type="button" className="mt-2 text-[13px] text-sea" onClick={() => {
                useStore.getState().setPaymentAccount(e.key, account);
                toast('Счёт списания назначен');
              }}>Назначить счёт для этого платежа</button>}
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
          {isBonus(e) && <p className="text-[12.5px] leading-snug text-muted">Распределение начинается после сверки зачисления. Досрочка доступна в пределах безопасного лимита.</p>}
          <PrimaryButton onClick={done} disabled={value <= 0 || !paidDate || paidDate > now || (e.kind === 'payment' && !account)}>
            {e.kind === 'income' ? (isBonus(e) ? 'Пришла — распределить' : 'Пришло') : e.kind === 'weekly' ? 'Долил' : 'Оплачено'}
          </PrimaryButton>
          {e.kind === 'weekly' ? (
            <>
              <p className="text-[12.5px] leading-snug text-muted">Сумма спишется с резерва. Удобнее закрыть неделю: приложение само посчитает, сколько осталось на карте и сколько долить.</p>
              <SecondaryButton onClick={() => set({ event: null, week: monday })} className="w-full">Закрыть неделю</SecondaryButton>
            </>
          ) : (
            <SecondaryButton onClick={() => (group === 'fixed' ? set({ event: null, fixed: true }) : setEditing(true))} className="w-full">
              <CalendarDays size={16} strokeWidth={1.5} /> {group === 'fixed' ? 'Изменить сумму или число месяца' : `Изменить сумму или дату${e.dateMode !== 'month' ? ` (${dayMonth(e.date)})` : ''}`}
            </SecondaryButton>
          )}
        </>
      )}
    </div>
  );
}

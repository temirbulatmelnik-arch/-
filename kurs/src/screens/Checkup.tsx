// Воскресная сверка с банком: остатки на карте, в резерве и долг на кредитке моста против учёта приложения.
// Расхождения — словами, с кнопкой «внести трату»; затем сколько перевести между картой и резервом и «Перевёл».
// Показывается сама в воскресенье после 18:00 при входе в приложение, пока сверка недели не сохранена.
import { Check } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { AmountInput, Money, PrimaryButton, Segmented, Sheet } from '../components/ui';
import { addDays, ddmm, today, weekStart } from '../domain/dates';
import { checkupPlan, ledger, MATCH, weekLeftover, type Ledger } from '../domain/ledger';
import { num, parseAmount, round } from '../domain/money';
import { weekReport } from '../domain/weekly';
import { useStore } from '../store/store';
import { salute } from '../store/events';
import { toast, useUi } from '../store/ui';

/** учёт по счетам: что должно быть в банке сейчас */
export function useLedger(): Ledger {
  const [checkups, cardBalance, reserve, reserveLog, marks, expenses, oneOff, debts, bridge] = useStore(useShallow(s =>
    [s.checkups, s.cardBalance, s.reserve, s.reserveLog, s.marks, s.expenses, s.oneOff, s.debts, s.bridge] as const));
  return useMemo(() => ledger({ checkups, cardBalance, reserve, reserveLog, marks, expenses, oneOff, debts, bridge }),
    [checkups, cardBalance, reserve, reserveLog, marks, expenses, oneOff, debts, bridge]);
}

let snoozed = 0;

/** В воскресенье с 18:00 при входе в приложение — сверка недели, если её ещё не было */
export function useSundayCheckup() {
  useEffect(() => {
    let timer = 0;
    const check = () => {
      if (document.visibilityState !== 'visible') return;
      const now = new Date();
      if (now.getDay() !== 0 || now.getHours() < 18 || Date.now() - snoozed < 3_600_000) return;
      const monday = weekStart(today());
      const s = useStore.getState();
      if (!s.ready || s.checkups.some(c => c.monday === monday)) return;
      // файл обмена с сайта открывается первым — сверка после него
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const ui = useUi.getState();
        if (!ui.inbox && !ui.sync && !ui.checkup && !ui.add && !ui.event) ui.set({ checkup: monday });
      }, 1600);
    };
    check();
    document.addEventListener('visibilitychange', check);
    // закрыли окно обмена — теперь можно и сверку
    const unsub = useUi.subscribe((st, prev) => { if ((prev.sync && !st.sync) || (prev.inbox && !st.inbox)) check(); });
    return () => { document.removeEventListener('visibilitychange', check); window.clearTimeout(timer); unsub(); };
  }, []);
}

export function CheckupSheet() {
  const monday = useUi(s => s.checkup);
  const set = useUi(s => s.set);
  const close = () => { snoozed = Date.now(); set({ checkup: null }); };
  return (
    <Sheet open={!!monday} onClose={close} title="Сверка с банком" subtitle={monday ? `Неделя ${ddmm(monday)}–${ddmm(addDays(monday, 6))}` : undefined}>
      {monday && <Body key={monday} monday={monday} />}
    </Sheet>
  );
}

function Body({ monday }: { monday: string }) {
  const [expenses, debts, overrides, bridge, marks, closures, checkups] = useStore(useShallow(s =>
    [s.expenses, s.debts, s.weeklyOverrides, s.bridge, s.marks, s.closures, s.checkups] as const));
  const set = useUi(s => s.set);
  const led = useLedger();
  const [card, setCard] = useState('');
  const [reserve, setReserve] = useState('');
  const [credit, setCredit] = useState('');
  const limit = led.creditCard?.limit;
  const [creditMode, setCreditMode] = useState<'debt' | 'available'>('debt');

  const cardV = parseAmount(card);
  const reserveV = parseAmount(reserve);
  const creditRaw = parseAmount(credit);
  const creditV = creditRaw == null ? null : creditMode === 'available' && limit ? round(limit - creditRaw) : creditRaw;

  const leftover = useMemo(() => weekLeftover(expenses, debts, overrides, bridge, monday), [expenses, debts, overrides, bridge, monday]);
  const plan = useMemo(() => checkupPlan({ expenses, debts, overrides, bridge, marks, monday, leftover, incomeOnCard: led.incomeOnCard }),
    [expenses, debts, overrides, bridge, marks, monday, leftover, led.incomeOnCard]);
  const [sent, setSent] = useState('');
  useEffect(() => setSent(String(Math.abs(plan.net))), [plan.net]);
  const sentV = parseAmount(sent) ?? 0;

  const dCard = cardV != null && led.card != null ? round(cardV - led.card) : null;
  const dReserve = reserveV != null ? round(reserveV - led.reserve) : null;
  const dCredit = creditV != null && led.credit != null ? round(creditV - led.credit) : null;
  const mirror = dCard != null && dReserve != null && Math.abs(dCard) > MATCH && Math.abs(dCard + dReserve) <= MATCH;
  const ready = cardV != null && reserveV != null && (!led.creditCard || creditV != null);

  const addSpend = (amount: number, source: 'life' | 'credit') =>
    set({ add: { amount: Math.round(amount * 100) / 100, source, date: addDays(monday, 6) > today() ? today() : addDays(monday, 6), creditCard: source === 'credit' ? led.creditCard?.id : undefined } });

  const save = (transfer: boolean) => {
    if (!ready) return;
    // поправленная сумма перевода: направление то же, разница — в пополнении или в переводе в резерв
    let topUp = transfer ? plan.topUp : 0;
    let toReserve = transfer ? plan.toReserve : 0;
    if (transfer && sentV !== Math.abs(plan.net)) {
      if (plan.net >= 0) topUp = Math.max(0, sentV + toReserve);
      else toReserve = Math.max(0, sentV + topUp);
    }
    const r = weekReport(expenses, debts, overrides, monday, bridge);
    useStore.getState().checkup({
      monday,
      expected: { card: led.card, reserve: round(led.reserve), credit: led.credit },
      actual: { card: cardV!, reserve: reserveV!, credit: creditV },
      topUp, toReserve, creditCard: led.creditCard?.id,
    }, transfer ? { monday, limit: r.limit, spent: r.spent, left: r.left, transferred: 0 } : null);
    toast(transfer ? (closures[monday] ? 'Сверка сохранена' : 'Сверка сохранена, неделя закрыта') : 'Остатки сохранены, перевод — позже');
    // неделя закрыта в плюс — маленький салют
    if (transfer && r.left >= 0) window.setTimeout(() => salute('small'), 300);
    set({ checkup: null });
  };

  return (
    <div className="space-y-4 pt-1">
      <p className="text-[13.5px] leading-snug text-muted">Откройте банк и впишите, что видите сейчас, до перевода. Приложение сравнит с учётом и скажет, сколько перевести.</p>

      <Account label="На карте ВТБ" hint="мастер-счёт, карта жизни" value={card} onChange={setCard}>
        {cardV != null && (led.card == null
          ? <Note>Первая сверка: с этой суммы начнётся учёт карты.</Note>
          : <Verdict d={dCard!} expected={led.card}
              less={x => <>Меньше, чем по учёту, на <Money value={x} />. Похоже, не все траты внесены.{' '}
                <button type="button" onClick={() => addSpend(x, 'life')} className="font-medium text-sea">Добавить трату {num(x)} ₽</button></>}
              more={x => <>Больше, чем по учёту, на <Money value={x} />: пришло, но не отмечено (возврат, перевод или доход).</>} />)}
      </Account>

      <Account label="В резерве" hint="накопительный счёт" value={reserve} onChange={setReserve}>
        {reserveV != null && <Verdict d={dReserve!} expected={led.reserve}
          less={x => <>Меньше, чем по учёту, на <Money value={x} />: платёж или трата из резерва не отмечены.</>}
          more={x => <>Больше, чем по учёту, на <Money value={x} />: проценты или поступление, которое не отмечено.</>} />}
      </Account>

      {led.creditCard && (
        <Account label={/кредит/i.test(led.creditCard.short) ? led.creditCard.short : `${led.creditCard.short}, кредитка`} hint={creditMode === 'debt' ? 'сколько должны банку' : 'сколько доступно'} value={credit} onChange={setCredit}
          top={limit ? <Segmented value={creditMode} onChange={setCreditMode} options={[{ id: 'debt', label: 'Долг' }, { id: 'available', label: 'Доступно' }]} /> : undefined}>
          {creditV != null && led.credit != null && <Verdict d={dCredit!} expected={led.credit}
            less={x => <>Долг меньше, чем по учёту, на <Money value={x} />: погашение или возврат не отмечены.</>}
            more={x => <>Долг больше, чем по учёту, на <Money value={x} />: покупки с кредитки не внесены или начислены проценты.{' '}
              <button type="button" onClick={() => addSpend(x, 'credit')} className="font-medium text-sea">Добавить трату с кредитки {num(x)} ₽</button></>} />}
          {creditMode === 'available' && creditV != null && <Note>Долг = лимит <Money value={limit!} /> − доступно = <Money value={creditV} /></Note>}
        </Account>
      )}

      {mirror && <Note>Карта и резерв разошлись на одну сумму в разные стороны: похоже, <Money value={Math.abs(dCard!)} /> уже переведены между ними. Это не ошибка, сверка запомнит остатки из банка.</Note>}

      {ready && (
        <section className="deep-card space-y-3 px-5 py-5">
          <div className="text-[13px] text-card-muted">Перевод на следующую неделю</div>
          <div className="figure text-[26px] leading-tight">
            {plan.net > 0 ? <>Из резерва на карту <Money value={plan.net} /></> : plan.net < 0 ? <>С карты в резерв <Money value={-plan.net} /></> : 'Переводить ничего не нужно'}
          </div>
          <div className="space-y-1.5 text-[13px] leading-snug text-card-muted">
            {plan.toppedBefore > 0
              ? <div>Пополнение на неделю уже отмечено: <Money value={plan.toppedBefore} className="text-card" />. Второй раз не списываю.</div>
              : bridgeNext(bridge, monday)
              ? <div>По плану моста из резерва — <Money value={plan.topUp} className="text-card" />. Остаток недели <Money value={plan.leftover} /> уменьшает траты с кредитки.</div>
              : <div>Лимит следующей недели <Money value={plan.nextLimit} className="text-card" /> минус остаток на карте по учёту <Money value={plan.leftover} /> = <Money value={plan.topUp} className="text-card" />.</div>}
            {plan.toReserve > 0 && <div>Поступления на карту после прошлой сверки — в резерв: <Money value={plan.toReserve} className="text-card" />.</div>}
            {plan.credit > 0 && <div>Со Сбер-кредитки на неделю — до <Money value={plan.credit} className="text-card" />, только покупки.</div>}
          </div>
          {plan.net !== 0 && (
            <div>
              <div className="mb-1.5 text-[12px] text-card-muted">Перевели другую сумму — поправьте</div>
              <AmountInput value={sent} onChange={setSent} size="md" />
            </div>
          )}
          <PrimaryButton onClick={() => save(true)}>{plan.net === 0 ? 'Сохранить и закрыть неделю' : 'Перевёл'}</PrimaryButton>
          <button type="button" onClick={() => save(false)} className="w-full py-1 text-[13px] text-card-muted">Сохранить остатки, перевести позже</button>
        </section>
      )}

      {checkups.length > 0 && (
        <section>
          <div className="mb-2 px-1 text-[13px] text-muted">Прошлые сверки</div>
          <div className="card divide-hair overflow-hidden">
            {[...checkups].reverse().slice(0, 4).map(c => (
              <div key={c.id} className="px-4 py-3 text-[12.5px] leading-snug">
                <div className="flex justify-between text-[13.5px]"><span className="font-medium">{ddmm(c.date)}</span>
                  <span className="text-muted">{c.topUp > 0 ? <>на карту <Money value={c.topUp} /></> : c.toReserve > 0 ? <>в резерв <Money value={c.toReserve} /></> : 'без перевода'}</span></div>
                <div className="mt-1 text-muted">{line('карта', c.expected.card, c.actual.card)}; {line('резерв', c.expected.reserve, c.actual.reserve)}{c.actual.credit != null ? <>; {line('кредитка', c.expected.credit, c.actual.credit)}</> : null}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const bridgeNext = (bridge: ReturnType<typeof useStore.getState>['bridge'], monday: string) =>
  !!bridge && !bridge.closed && bridge.weeks.some(w => w.monday === addDays(monday, 7));

function line(name: string, expected: number | null, actual: number): ReactNode {
  if (expected == null) return <>{name} <Money value={actual} /></>;
  const d = round(actual - expected);
  return <>{name} {Math.abs(d) <= MATCH ? 'сошлось' : <Money value={d} sign className={d < 0 ? 'text-neg' : ''} />}</>;
}

function Account({ label, hint, value, onChange, top, children }: { label: string; hint: string; value: string; onChange: (v: string) => void; top?: ReactNode; children?: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3 px-1"><span className="text-[14px] font-medium">{label}</span><span className="text-[12px] text-faint">{hint}</span></div>
      {top}
      <AmountInput value={value} onChange={onChange} size="md" />
      {children}
    </div>
  );
}

function Verdict({ d, expected, less, more }: { d: number; expected: number; less: (x: number) => ReactNode; more: (x: number) => ReactNode }) {
  if (Math.abs(d) <= MATCH) return <p className="flex items-center gap-1.5 px-1 text-[13px] text-pos"><Check size={15} strokeWidth={2} /> Сошлось с учётом</p>;
  return (
    <p className={`rounded-2xl px-4 py-3 text-[13px] leading-snug ${d < 0 ? 'bg-warn/12' : 'bg-info/10'}`}>
      {d < 0 ? less(-d) : more(d)} <span className="text-muted">По учёту <Money value={expected} />.</span>
    </p>
  );
}

const Note = ({ children }: { children: ReactNode }) => <p className="px-1 text-[12.5px] leading-snug text-muted">{children}</p>;

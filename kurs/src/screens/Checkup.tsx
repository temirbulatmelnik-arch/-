// Воскресная сверка с банком: остатки на карте, в резерве и долги на кредитках против учёта приложения.
// Кредитки — все открытые: первой кредитка моста, под ней остальные. У каждой «Долг» и «Доступно», связанные лимитом:
// вписали одно — второе считается само (доступно = лимит − долг, бывает меньше нуля). Лимит меняется здесь же.
// «Без изменений» — долг как по учёту, без ввода.
// Расхождения — словами, с кнопкой «внести трату»; затем сколько перевести между картой и резервом и «Перевёл».
// Показывается сама в воскресенье после 18:00 при входе в приложение, пока сверка недели не сохранена.
import { Check } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { AmountInput, Money, PrimaryButton, Sheet } from '../components/ui';
import { addDays, ddmm, today, weekStart } from '../domain/dates';
import { checkupPlan, ledger, MATCH, weekLeftover, type CardLedger, type Ledger } from '../domain/ledger';
import { num, parseAmount, round } from '../domain/money';
import type { Debt } from '../domain/types';
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
  // кредитки: что вписано, в каком поле (долг или доступно) и отмечено ли «без изменений»
  const [entries, setEntries] = useState<Record<string, CardEntry>>({});
  const entryOf = (id: string) => entries[id] ?? NO_ENTRY;
  const patchEntry = (id: string, p: Partial<CardEntry>) => setEntries(e => ({ ...e, [id]: { ...(e[id] ?? NO_ENTRY), ...p } }));

  const cardV = parseAmount(card);
  const reserveV = parseAmount(reserve);
  const bridgeCard = led.cards.find(c => c.bridge);
  const otherCards = led.cards.filter(c => !c.bridge);

  const leftover = useMemo(() => weekLeftover(expenses, debts, overrides, bridge, monday), [expenses, debts, overrides, bridge, monday]);
  const plan = useMemo(() => checkupPlan({ expenses, debts, overrides, bridge, marks, monday, leftover, incomeOnCard: led.incomeOnCard }),
    [expenses, debts, overrides, bridge, marks, monday, leftover, led.incomeOnCard]);
  const [sent, setSent] = useState('');
  useEffect(() => setSent(String(Math.abs(plan.net))), [plan.net]);
  const sentV = parseAmount(sent) ?? 0;

  const dCard = cardV != null && led.card != null ? round(cardV - led.card) : null;
  const dReserve = reserveV != null ? round(reserveV - led.reserve) : null;
  const mirror = dCard != null && dReserve != null && Math.abs(dCard) > MATCH && Math.abs(dCard + dReserve) <= MATCH;
  const ready = cardV != null && reserveV != null && led.cards.every(c => debtOf(c, entryOf(c.debt.id)) != null);

  const addSpend = (amount: number, source: 'life' | 'credit', creditCard?: string) =>
    set({ add: { amount: Math.round(amount * 100) / 100, source, date: addDays(monday, 6) > today() ? today() : addDays(monday, 6), creditCard: source === 'credit' ? creditCard : undefined } });

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
      expected: { card: led.card, reserve: round(led.reserve), credit: bridgeCard ? bridgeCard.expected : null },
      actual: { card: cardV!, reserve: reserveV!, credit: bridgeCard ? debtOf(bridgeCard, entryOf(bridgeCard.debt.id)) : null },
      topUp, toReserve, creditCard: bridgeCard?.debt.id,
      ...(otherCards.length ? { cards: otherCards.map(c => ({ id: c.debt.id, expected: c.expected, actual: debtOf(c, entryOf(c.debt.id))! })) } : {}),
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

      {led.cards.length > 0 && (
        <div className="space-y-1 px-1 pt-1">
          <div className="text-[15px] font-medium">Кредитки</div>
          <p className="text-[12.5px] leading-snug text-muted">Удобнее вписать «Доступно» — баланс карты, он бывает и меньше нуля: долг посчитается по лимиту. Долг «с процентами на сегодня» не подходит — проценты месяца приложение добавит само в день платежа.</p>
        </div>
      )}
      {led.cards.map(c => (
        <CardAccount key={c.debt.id} c={c} entry={entryOf(c.debt.id)} onEntry={p => patchEntry(c.debt.id, p)} onAddSpend={x => addSpend(x, 'credit', c.debt.id)} />
      ))}

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
                <div className="mt-1 text-muted">{line('карта', c.expected.card, c.actual.card)}; {line('резерв', c.expected.reserve, c.actual.reserve)}{c.actual.credit != null ? <>; {line(debts.find(d => d.id === c.creditCard)?.short ?? 'кредитка', c.expected.credit, c.actual.credit)}</> : null}
                  {(c.cards ?? []).map(k => <span key={k.id}>; {line(debts.find(d => d.id === k.id)?.short ?? 'кредитка', k.expected, k.actual)}</span>)}</div>
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

/** Кредитка в сверке: что вписано в «Долг» и «Доступно», какое поле вписывали последним, доступно меньше нуля,
 *  «без изменений» */
type CardEntry = { debt: string; avail: string; src: 'debt' | 'available'; neg: boolean; same: boolean };
const NO_ENTRY: CardEntry = { debt: '', avail: '', src: 'debt', neg: false, same: false };

/** вписанное «Доступно»: знак — отдельной кнопкой «−», на цифровой клавиатуре iPhone минуса нет */
function availOf(e: CardEntry): number | null {
  const a = parseAmount(e.avail);
  return a == null ? null : e.neg ? -Math.abs(a) : a;
}

/** долг по карте из того, что вписано: «без изменений» — как по учёту; при известном лимите вписали доступно —
 *  лимит минус доступно (доступно бывает меньше нуля — тогда долг больше лимита); иначе — вписанный долг */
function debtOf(c: CardLedger, e: CardEntry): number | null {
  if (e.same) return c.expected;
  const limit = c.debt.limit;
  if (limit && e.src === 'available') {
    const a = availOf(e);
    return a == null ? null : round(limit - a);
  }
  return parseAmount(e.debt);
}

/** сумма для поля ввода: целые — с пробелами между разрядами, копейки — через запятую */
function amountText(x: number): string {
  const [i, f] = Math.abs(round(x)).toFixed(2).split('.');
  return `${x < 0 ? '−' : ''}${num(Number(i))}${f === '00' ? '' : `,${f}`}`;
}

function CardAccount({ c, entry, onEntry, onAddSpend }: {
  c: CardLedger; entry: CardEntry; onEntry: (p: Partial<CardEntry>) => void; onAddSpend: (x: number) => void;
}) {
  const { debt, expected } = c;
  const limit = debt.limit;
  const v = debtOf(c, entry);
  // при известном лимите поля связаны: вписанное — как вписали, второе — посчитанное (доступно = лимит − долг,
  // бывает меньше нуля, как «баланс» в банке). Без лимита поля независимы
  const linked = !!limit && !entry.same;
  const availValue: number | null = entry.same ? (limit ? limit - expected : null)
    : !limit || entry.src === 'available' ? availOf(entry)
    : v == null ? null : limit - v;
  const debtShown = entry.same ? amountText(expected) : !linked || entry.src === 'debt' ? entry.debt : v == null ? '' : amountText(v);
  const availOwn = !limit || (entry.src === 'available' && !entry.same);
  const availShown = availOwn ? entry.avail : availValue == null ? '' : amountText(Math.abs(availValue));
  const availNeg = availOwn ? entry.neg || (availValue ?? 0) < 0 : (availValue ?? 0) < 0;
  const toggleSign = () => onEntry({ src: 'available', neg: !availNeg, avail: availOwn ? entry.avail : availValue == null ? '' : amountText(Math.abs(availValue)) });
  const d = v == null ? null : round(v - expected);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 px-1">
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-medium">{debt.name || debt.short}</span>
          <span className="block text-[12px] text-faint">{c.bridge ? 'кредитка моста' : debt.frozen ? 'проверить списания' : 'проверить покупки'}</span>
        </span>
        <button type="button" role="checkbox" aria-checked={entry.same} onClick={() => onEntry({ same: !entry.same })}
          className={`flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[13px] font-medium transition-colors duration-150 ${entry.same ? 'border-transparent bg-pos/14 text-pos' : 'border-line text-muted'}`}>
          <span className={`grid size-[18px] place-items-center rounded-full border transition-colors duration-150 ${entry.same ? 'border-transparent bg-pos text-white' : 'border-faint'}`}>
            {entry.same && <Check size={12} strokeWidth={3} />}
          </span>
          Без изменений
        </button>
      </div>
      {/* поля друг под другом: рядом суммы с копейками не помещаются */}
      <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
        <span className="px-1 text-[13px] text-muted">Долг</span>
        <AmountInput size="sm" label={`${debt.short}: долг`} value={debtShown} disabled={entry.same} onChange={t => onEntry({ debt: t, src: 'debt' })} />
        <span className="px-1 text-[13px] text-muted">Доступно</span>
        <AmountInput size="sm" label={`${debt.short}: доступно${availNeg ? ', меньше нуля' : ''}`} value={availShown} disabled={entry.same}
          onChange={t => onEntry({ avail: t, src: 'available', neg: availNeg })}
          prefix={<button type="button" onClick={toggleSign} disabled={entry.same} aria-pressed={availNeg} aria-label="Доступно меньше нуля"
            className={`grid size-8 shrink-0 place-items-center self-center rounded-full text-[19px] leading-none font-medium transition-colors duration-150 ${availNeg ? 'bg-ink text-bg' : 'bg-surface-2 text-faint'}`}>−</button>} />
      </div>
      <LimitLine debt={debt} />
      {entry.same
        ? <p className="flex items-center gap-1.5 px-1 text-[13px] text-pos"><Check size={15} strokeWidth={2} /> Без изменений: долг как по учёту — <Money value={expected} /></p>
        : d != null
          ? <Verdict d={d} expected={expected}
              less={x => <>Долг меньше, чем по учёту, на <Money value={x} />: погашение или возврат не отмечены.</>}
              more={x => <>Долг больше, чем по учёту, на <Money value={x} />: {c.bridge ? 'покупки с кредитки не внесены' : 'списания с карты не внесены'} или начислены проценты.{' '}
                <button type="button" onClick={() => onAddSpend(x)} className="font-medium text-sea">Добавить трату с карты {num(x)} ₽</button></>} />
          : !limit && <Note>Укажите лимит карты — тогда долг посчитается по «Доступно».</Note>}
    </div>
  );
}

/** Лимит кредитки: показан под полями, меняется здесь же. Лимит с телефона не перетирается обновлением плана */
function LimitLine({ debt }: { debt: Debt }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const value = parseAmount(text);
  const save = () => {
    if (value == null || value <= 0) return;
    useStore.getState().updateDebt(debt.id, { limit: round(value) });
    setEditing(false);
    toast(`Лимит ${debt.short}: ${num(value)} ₽`);
  };
  if (editing) {
    return (
      <form onSubmit={e => { e.preventDefault(); save(); }} className="flex items-center gap-2 px-1">
        <span className="shrink-0 text-[13px] text-muted">Лимит</span>
        <input value={text} onChange={e => setText(e.target.value)} inputMode="decimal" autoFocus placeholder="0" aria-label={`Лимит ${debt.short}`}
          className="field h-10 min-w-0 flex-1 !py-1.5" />
        <button type="submit" disabled={value == null || value <= 0} className="shrink-0 px-1 text-[14px] font-medium text-sea disabled:text-faint">Сохранить</button>
        <button type="button" onClick={() => setEditing(false)} className="shrink-0 px-1 text-[14px] text-muted">Отмена</button>
      </form>
    );
  }
  return (
    <div className="flex items-center justify-between gap-3 px-1 text-[12.5px] text-muted">
      <span>{debt.limit ? <>Лимит <Money value={debt.limit} /></> : 'Лимит карты не указан'}</span>
      <button type="button" onClick={() => { setText(debt.limit ? String(debt.limit) : ''); setEditing(true); }} className="py-1 font-medium text-sea">
        {debt.limit ? 'Изменить' : 'Указать лимит'}
      </button>
    </div>
  );
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

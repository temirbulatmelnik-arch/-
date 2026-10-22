// Прогноз по модели плана: помесячно начисляем проценты, платим обязательное, живём по лимиту этапа,
// в месяц премии всё сверх резерва (20 000 + нехватка до следующей премии) — досрочно по порядку лавины.
import { addMonths, monthKey, monthsBetween } from './dates';
import { annuity, estimatePayment } from './calendar';
import { currentPhase, FIXED_MONTHLY, nextBonusMonth, planConfig, RESERVE_BUFFER, shortfallFor } from './plan';
import type { CalEvent, Debt, IncomeTemplate } from './types';

const BONUS_KINDS = ['bonusQuarter', 'bonusYear', 'vacation', 'thirteenth'];

export interface Forecast {
  /** месяц закрытия каждого долга (YYYY-MM) или null, если не закрывается до горизонта */
  closeMonth: Record<string, string | null>;
  /** общий долг на конец месяца */
  trajectory: [string, number][];
  interest: number;
  freeMonth: string | null;
}

export function forecast(opts: { debts: Debt[]; incomes: IncomeTemplate[]; reserve: number; from: string; horizon?: number; oneOff?: CalEvent[]; templateFrom?: string }): Forecast {
  const debts = opts.debts.map(d => ({ ...d, rule: { ...d.rule } as Debt['rule'] }));
  const closeMonth: Record<string, string | null> = Object.fromEntries(debts.map(d => [d.id, d.closed ? (d.closedOn ? monthKey(d.closedOn) : null) : null]));
  const trajectory: [string, number][] = [];
  let cash = opts.reserve;
  let interestSum = 0;
  let freeMonth: string | null = null;
  const start = monthKey(opts.from);

  for (let i = 0; i < (opts.horizon ?? 72); i++) {
    const m = addMonths(start, i);
    const mon = Number(m.slice(5, 7));
    // до начала шаблона берём поступления из календаря плана: там уже учтены отпуск, 13-я и т. п.
    const early = !!opts.templateFrom && m < opts.templateFrom;
    const earlyIncomes = early ? (opts.oneOff ?? []).filter(e => e.kind === 'income' && monthKey(e.date) === m) : [];
    const income = early
      ? earlyIncomes.reduce((s, e) => s + e.amount, 0)
      : opts.incomes.filter(t => !t.months || t.months.includes(mon)).reduce((s, t) => s + t.amount, 0);
    const phase = currentPhase(debts, `${m}-15`);
    const living = phase.monthly || phase.weekly * 4.33 + FIXED_MONTHLY;
    cash += income - living;

    for (const d of debts) {
      if (d.closed || d.balance <= 0.5) continue;
      const pay = estimatePayment(d, m);
      const interest = d.rule.type === 'schedule' ? 0 : (d.balance * d.rate) / 12;
      interestSum += interest;
      d.balance = Math.max(0, d.balance + interest - pay);
      cash -= pay;
      if (d.balance <= 0.5) { d.closed = true; closeMonth[d.id] = m; }
    }

    // досрочно — только в месяц премии, как в плане: резерв до следующей премии, остальное в долг
    // (с учётом решений плана по месяцам: например, годовая — только в Альфу)
    const bonusMonth = early ? earlyIncomes.some(e => e.incomeKind && BONUS_KINDS.includes(e.incomeKind)) : opts.incomes.some(t => t.months?.includes(mon));
    const rule = planConfig().bonusRules?.[m];
    if (bonusMonth || rule) {
      const keepMonths = rule?.months ?? Math.max(0, monthsBetween(m, nextBonusMonth(m)) - 1);
      let keep = RESERVE_BUFFER;
      for (let k = 1; k <= keepMonths; k++) keep += shortfallFor(addMonths(m, k), debts);
      let extra = cash - (rule?.full ? RESERVE_BUFFER : keep);
      const queue = debts.filter(x => !x.closed && !x.noPrepay && x.balance > 0.5 && (!rule?.targets || rule.targets.includes(x.id))).sort((a, b) => a.order - b.order);
      for (const d of queue) {
        if (extra <= 0) break;
        const pay = Math.min(extra, d.balance);
        if (rule?.full && pay < d.balance - 0.5) break;
        d.balance -= pay;
        extra -= pay;
        cash -= pay;
        if (d.balance <= 0.5) { d.closed = true; closeMonth[d.id] = m; }
        else if (d.rule.type === 'annuity') {
          d.rule = { ...d.rule, amount: annuity(d.balance, d.rate, monthsBetween(m, monthKey(d.rule.endDate))) };
        }
      }
    }

    const total = debts.reduce((s, d) => s + (d.closed ? 0 : d.balance), 0);
    trajectory.push([m, Math.round(total)]);
    if (total <= 0.5) { freeMonth = m; break; }
  }
  return { closeMonth, trajectory, interest: Math.round(interestSum), freeMonth };
}

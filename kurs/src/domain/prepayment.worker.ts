import { createRepaymentPlanner, type RepaymentChoice } from './prepayment';
import { setPlanSource, DEFAULT_PLAN, type PlanConfig } from './plan';
import type { CoverageInput } from './coverage';

export interface RepaymentRequest {
  input: CoverageInput;
  plan: PlanConfig | null;
  today: string;
  date: string;
  mode: 'suggest' | 'products' | 'calculate';
  choices?: RepaymentChoice[];
  withoutVacation?: boolean;
}

self.addEventListener('message', (event: MessageEvent<RepaymentRequest>) => {
  const { input, plan, today, date, mode, choices, withoutVacation } = event.data;
  try {
    setPlanSource(() => plan ?? DEFAULT_PLAN);
    const planner = createRepaymentPlanner(input, today, { withoutVacation });
    if (mode === 'suggest') {
      self.postMessage({ next: planner.nextOpportunity(date), baselineIssue: planner.baselineIssue, nextIncome: planner.nextIncome });
    } else if (mode === 'products') {
      self.postMessage({ products: planner.products(date), nextSalary: planner.nextSalary, until: planner.until });
    } else {
      const rows = planner.analyze(date, false, choices);
      const alt = rows.slice(2).find(row => row.status === 'available' || row.status === 'afterIncome') ??
        rows.slice(2).find(row => row.status === 'conditional');
      self.postMessage({ baseline: rows[0], result: rows[1], alternative: alt, nextIncome: planner.nextIncome });
    }
  } catch {
    self.postMessage({ failed: true });
  }
});

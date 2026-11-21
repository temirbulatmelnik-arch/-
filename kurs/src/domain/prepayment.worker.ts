import { createRepaymentPlanner } from './prepayment';
import { setPlanSource, DEFAULT_PLAN, type PlanConfig } from './plan';
import type { CoverageInput } from './coverage';

export interface RepaymentRequest {
  input: CoverageInput;
  plan: PlanConfig | null;
  today: string;
  date: string;
  suggest: boolean;
  withoutVacation?: boolean;
}

self.addEventListener('message', (event: MessageEvent<RepaymentRequest>) => {
  const { input, plan, today, date, suggest, withoutVacation } = event.data;
  try {
    setPlanSource(() => plan ?? DEFAULT_PLAN);
    const planner = createRepaymentPlanner(input, today, { withoutVacation });
    self.postMessage(suggest ? { next: planner.nextOpportunity(date) } : { rows: planner.analyze(date) });
  } catch {
    self.postMessage({ failed: true });
  }
});

import { rubles } from './accounts';

type TaxBand = { untilMinor: number | null; percent: number };

export interface TaxRuleSet {
  id: string;
  effectiveFrom: string;
  bands: readonly TaxBand[];
}

/** Шкала для основной налоговой базы. Входная база хранится в копейках, удержание округляется до рублей. */
export const BASE_TAX_RULE: TaxRuleSet = {
  id: 'ru-primary-tax-2025',
  effectiveFrom: '2025-01-01',
  bands: [
    { untilMinor: 240000000, percent: 13 }, { untilMinor: 500000000, percent: 15 },
    { untilMinor: 2000000000, percent: 18 }, { untilMinor: 5000000000, percent: 20 },
    { untilMinor: null, percent: 22 },
  ],
};

export function taxOnBase(baseMinor: number, rule = BASE_TAX_RULE) {
  let weighted = 0, lower = 0;
  for (const { untilMinor, percent } of rule.bands) {
    const upper = untilMinor ?? baseMinor;
    weighted += Math.max(0, Math.min(upper, baseMinor) - lower) * percent;
    if (baseMinor <= upper) break;
    lower = upper;
  }
  return Math.round(weighted / 10000) * 100;
}

export function explainTax(beforeMinor: number, taxableMinor: number, rule = BASE_TAX_RULE) {
  return {
    value: taxOnBase(beforeMinor + taxableMinor, rule) - taxOnBase(beforeMinor, rule),
    formula: 'tax(cumulativeBase + taxableIncome) - tax(cumulativeBase)',
    inputs: { cumulativeBase: beforeMinor, taxableIncome: taxableMinor }, sources: [rule.id],
  };
}

export function taxForPayment(beforeMinor: number, taxableMinor: number) {
  return rubles(explainTax(beforeMinor, taxableMinor).value);
}

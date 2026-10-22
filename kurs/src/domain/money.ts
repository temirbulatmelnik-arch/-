// Деньги: «12 345 ₽». Неразрывные пробелы, чтобы сумма не переносилась по строкам.

const NBSP = ' ';
const NNBSP = ' ';

export function rub(n: number, opts: { sign?: boolean; approx?: boolean } = {}): string {
  const v = Math.round(n);
  const abs = Math.abs(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP);
  const sign = v < 0 ? '−' : opts.sign && v > 0 ? '+' : '';
  return `${opts.approx ? '≈' + NBSP : ''}${sign}${abs}${NBSP}₽`;
}

/** Без знака рубля: 12 345 */
export const num = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP).replace('-', '−');

/** 1,09 млн ₽ / 925 тыс. ₽ */
export function rubShort(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace('.', ',').replace(/,?0+$/, '')}${NBSP}млн${NBSP}₽`;
  if (a >= 10_000) return `${Math.round(n / 1000)}${NBSP}тыс.${NBSP}₽`;
  return rub(n);
}

export const pct = (rate: number) => `${(rate * 100).toFixed(rate * 100 % 1 ? 1 : 0).replace('.', ',')}%`;

/** Разбор суммы из ввода: «12 345,50», «12345.5», «−1 200 ₽» */
export function parseAmount(s: string): number | null {
  const clean = s.replace(/[\s  ₽руб.]+$/gi, '').replace(/[\s  ]/g, '').replace('−', '-').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(clean)) return null;
  return Number(clean);
}

export const round = (n: number) => Math.round(n * 100) / 100;

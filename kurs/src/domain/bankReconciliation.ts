import { cents, validAmount, validDate } from './accounts';

export interface StatementBounds {
  opening: number | null;
  closing: number | null;
  end: string | null;
}

export interface StatementCheck {
  status: 'matched' | 'mismatch' | 'incomplete';
  end: string | null;
  openingMinor: number | null;
  closingMinor: number | null;
  calculatedMinor: number | null;
  differenceMinor: number | null;
}

export function reconcileStatement(bounds: StatementBounds, signedRows: (number | null)[], rejected = 0): StatementCheck {
  const openingMinor = validAmount(bounds.opening) ? cents(bounds.opening) : null;
  const closingMinor = validAmount(bounds.closing) ? cents(bounds.closing) : null;
  const end = validDate(bounds.end) ? bounds.end : null;
  const incomplete = openingMinor === null || rejected > 0 || signedRows.some(amount => !validAmount(amount));
  const total = incomplete ? null : (signedRows as number[]).reduce((sum, amount) => sum + cents(amount), openingMinor);
  const calculatedMinor = total != null && Number.isSafeInteger(total) ? total : null;
  const differenceMinor = calculatedMinor != null && closingMinor != null ? closingMinor - calculatedMinor : null;
  return { status: differenceMinor == null ? 'incomplete' : differenceMinor ? 'mismatch' : 'matched',
    end, openingMinor, closingMinor, calculatedMinor, differenceMinor };
}

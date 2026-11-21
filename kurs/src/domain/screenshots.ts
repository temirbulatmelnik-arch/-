import { cashAccount, cents, LIFE_ACCOUNT, RESERVE_ACCOUNT, type AccountBook } from './accounts';
import { categorize } from './categorize';
import { addDays } from './dates';
import { validDate } from './accounts';
import type { CalEvent, CategoryId, EventMark, Expense } from './types';

export type ScreenshotKind = 'purchase' | 'credit' | 'debt' | 'transfer' | 'refund' | 'incoming' | 'payroll' | 'loan' | 'unknown';
export interface ScreenshotRow {
  fingerprint: string;
  amount: number | null;
  currency: string;
  date: string;
  time: string;
  merchant: string;
  memo: string;
  kind: ScreenshotKind;
  accountId: string;
  toAccountId?: string;
  debtId?: string;
  category: CategoryId;
  categoryGuessed: boolean;
  warnings: string[];
  lastFour?: string;
}

const money = /([+−–-])?\s*(\d{1,3}(?:[   ]\d{3})+|\d+)(?:[,.](\d{1,2}))?\s*(₽|руб(?:\.|лей)?|RUB|USD|EUR|KZT|BYN|\$|€|₸)(?=$|[\s.,)])/i;
const clock = /\b([01]?\d|2[0-3]):([0-5]\d)\b/;
const months = ['январ', 'феврал', 'март', 'апрел', 'мая', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];

export function redactBankText(text: string): string {
  return text.replace(/(?<!\d)(?:\d[ -]?){12,34}(?!\d)/g, '••••').replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/gi, '••••').trim();
}

function dateIn(text: string, today: string) {
  const iso = text.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  if (validDate(iso)) return iso;
  const ru = text.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})\b/);
  if (ru) {
    const day = `${ru[3].length === 2 ? '20' : ''}${ru[3]}-${ru[2].padStart(2, '0')}-${ru[1].padStart(2, '0')}`;
    if (validDate(day)) return day;
  }
  if (/^(?:сегодня|вчера)(?=\s|,|$)/i.test(text)) return /^сегодня/i.test(text) ? today : addDays(today, -1);
  const words = text.toLowerCase().match(/^(\d{1,2})\s+([а-я]+)(?:\s+(\d{4}))?/);
  const month = words && months.findIndex(name => words[2].startsWith(name));
  if (words && month != null && month >= 0) {
    const short = `-${String(month + 1).padStart(2, '0')}-${words[1].padStart(2, '0')}`;
    let year = Number(words[3] ?? today.slice(0, 4));
    if (!words[3] && `${year}${short}` > today) year--;
    const date = `${year}${short}`;
    if (validDate(date)) return date;
  }
  return null;
}

function classify(text: string, sign: string | undefined): ScreenshotKind {
  if (/отмен[аеёиоуы]|отклон[её]|не исполн|не выполн|ожидает|в обработке|заблокирован/i.test(text)) return 'unknown';
  if (/возврат|refund/i.test(text)) return 'refund';
  if (/между\s+(?:своими|счетами)|перевод себе|свой сч[её]т|с накопительного|на накопительный/i.test(text)) return 'transfer';
  if (/(?:погашен|плат[её]ж|списан).*(кредит|сплит|рассроч)|(?:кредит|сплит|рассроч).*(погашен|минимальн.*плат[её]ж)/i.test(text)) return 'debt';
  if (/выдача (?:кредит|займ)|за[её]мн.*поступ|перевод (?:из|со) сплит|поступление (?:из|со) сплит/i.test(text)) return 'loan';
  if (/зарплат|заработн|аванс|отпускн|материальн.*помощ|премия/i.test(text)) return 'payroll';
  if (sign === '+' || /входящий перевод|перевод от /i.test(text)) return 'incoming';
  if (/кредитн.*карт/i.test(text) && (sign || /покупк/i.test(text))) return 'credit';
  if (sign && !/перевод|остаток|баланс|доступно/i.test(text) || /покупка|оплата/i.test(text)) return 'purchase';
  return 'unknown';
}

export const merchantName = (value: string) => value.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, '').slice(0, 48);

export function screenshotRows(text: string, today: string, imageId: string, confidence: number,
  memory: Record<string, string> = {}): ScreenshotRow[] {
  const lines = redactBankText(text).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const output: ScreenshotRow[] = [];
  let date = '';
  let buffer: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(money);
    if (!match) {
      const found = dateIn(line, today);
      if (found) { date = found; buffer = clock.test(line) ? [line] : []; }
      else buffer.push(line);
      continue;
    }
    if (/остаток|баланс|доступно|лимит|итого|комиссия\b|начисл.*балл/i.test(line)) continue;
    const prefix = line.slice(0, match.index).trim();
    const after = line.slice((match.index ?? 0) + match[0].length).trim();
    const metadata: string[] = [];
    const more = /^(?:карт[аы]|сч[её]т|назначение|OPID-|\*{2,}|•{2,}|\d{1,2}:\d{2})/i;
    while (metadata.length < 4 && lines[i + 1] && !money.test(lines[i + 1]) && more.test(lines[i + 1])) metadata.push(lines[++i]);
    const details = metadata.join(' ');
    const bankId = [...buffer, prefix, after, details].join(' ').match(/OPID-([a-f0-9]{24})/i)?.[1];
    const clean = (value: string) => value.replace(/OPID-[a-f0-9]{24}/gi, '').trim();
    const nearby = clean([...buffer.slice(-3), prefix, after, details].join(' '));
    const kind = classify(nearby, match[1]);
    const lastFour = nearby.match(/(?:[•*xх·]{2,}\s*|(?:карта|сч[её]т)\s+)(\d{4})(?!\d)/i)?.[1];
    const time = nearby.match(clock);
    const selectedDate = dateIn(line, today) ?? date;
    const merchant = clean(prefix || [...buffer].reverse().find(s => /[\p{L}]/u.test(s) && !dateIn(s, today)) || '').slice(0, 100);
    const key = merchantName(merchant);
    const stored = memory[key];
    const category = stored && stored !== 'self' ? stored as CategoryId : categorize(merchant);
    const amount = Number(match[2].replace(/\s/g, '') + (match[3] ? '.' + match[3] : ''));
    const currency = ({ '$': 'USD', '€': 'EUR', '₸': 'KZT' } as Record<string, string>)[match[4]] ??
      (/^(?:₽|руб|RUB)/i.test(match[4]) ? 'RUB' : match[4].toUpperCase());
    output.push({
      fingerprint: bankId ? `bank-id:${bankId}` : `shot:${imageId}:${output.length}`, kind: stored === 'self' && kind === 'unknown' ? 'transfer' : kind,
      date: selectedDate, time: time ? `${time[1].padStart(2, '0')}:${time[2]}` : '', merchant,
      memo: clean(details).replace(/^назначение\s*:?\s*/i, '').slice(0, 150), amount, currency,
      accountId: /накопительн/i.test(nearby) && kind !== 'transfer' ? RESERVE_ACCOUNT : LIFE_ACCOUNT,
      ...(kind === 'transfer' && /на накопительный/i.test(nearby) ? { toAccountId: RESERVE_ACCOUNT } : {}),
      ...(kind === 'transfer' && /с накопительного/i.test(nearby) ? { accountId: RESERVE_ACCOUNT, toAccountId: LIFE_ACCOUNT } : {}),
      lastFour, category: category ?? 'fun', categoryGuessed: !category,
      warnings: [
        ...(confidence < 75 ? ['Распознавание неуверенное. Сверьте сумму и название.'] : []),
        ...(!selectedDate ? ['Не определена дата.'] : []),
        ...(kind === 'unknown' ? ['Уточните вид и статус операции в банке.'] : []),
        ...(currency !== 'RUB' ? ['Для учёта нужна фактическая сумма в рублях по выписке.'] : []),
      ],
    });
    buffer = [];
  }
  return output;
}

export function screenshotDuplicate(row: ScreenshotRow, expenses: Expense[], book: AccountBook, marks: Record<string, EventMark> = {}, events: CalEvent[] = []) {
  const account = row.kind === 'credit' ? row.debtId : row.accountId;
  const exactExpense = expenses.find(e => e.fingerprint === row.fingerprint);
  const exactOp = book.operations.find(op => op.externalId === row.fingerprint);
  if (exactExpense || exactOp) return { exact: true, expense: exactExpense, operation: exactOp };
  const amount = cents(row.amount ?? 0);
  if (!amount || row.currency !== 'RUB') return null;
  const historical = row.kind === 'loan' && book.historicalLoans?.find(loan => loan.date === row.date && cents(loan.amount) === amount &&
    (!row.debtId || loan.debtId === row.debtId));
  if (historical) return { exact: true, expense: undefined, operation: undefined, label: 'Заёмное поступление уже учтено в истории' };
  const marked = ['debt', 'incoming', 'payroll'].includes(row.kind) && events.find(event => {
    const mark = marks[event.key];
    return mark?.done && (mark.paidDate ?? event.date) === row.date && cents(mark.amount ?? event.amount) === amount &&
      (row.kind === 'debt' ? event.kind === 'payment' && event.debtId === row.debtId : event.kind === 'income');
  });
  const key = merchantName(row.merchant);
  const expense = expenses.find(e => e.date === row.date && cents(e.amount) === amount &&
    (cashAccount(e) ?? e.creditCard) === account && ['purchase', 'credit'].includes(row.kind) &&
    (!key || !e.note || merchantName(e.note).includes(key) || key.includes(merchantName(e.note))));
  const operation = book.operations.find(op => op.status === 'confirmed' && op.date === row.date &&
    cents(op.amount) === amount && op.accountId === account && !['purchase', 'credit', 'unknown'].includes(row.kind));
  return expense || operation || marked ? { exact: false, expense, operation, label: marked ? marked.title : undefined } : null;
}

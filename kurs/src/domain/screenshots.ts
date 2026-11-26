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

const numeric = String.raw`([+−–—-])?[ \u00a0\u202f]*(\d{1,3}(?:[ \u00a0\u202f.]\d{3})+|\d+)(?:[,.](\d{1,2})(?!\d))?`;
const currency = String.raw`(?:₽|руб(?:\.|лей|ля)?|RUB|USD|EUR|KZT|BYN|\$|€|₸|[РP](?:\.|(?=$|\s)))`;
const priced = new RegExp(`(?<![\\p{L}\\d.,])${numeric}[ \\u00a0\\u202f]*(${currency})(?=$|[\\s.,)])`, 'iu');
const unpriced = new RegExp(`(?<![\\p{L}\\d.,:])${numeric}\\s*$`, 'iu');
const currencyOnly = new RegExp(`^${currency}$`, 'i');
const service = /^(?:баланс|остаток|доступно|общий итог|итого|всего|лимит|предложение|реклама|до\s+\d|получите|кэшбэк|бонусы|комиссия|начисл.*балл|навигация|история(?:\s+операций)?$|главная(?:\s+|$)|экран(?:\s+|$))/i;
const separateBalance = /^(?:баланс|остаток|доступно|общий итог|итого|всего|лимит|начисл.*балл|кэшбэк|бонусы)(?:\s|$)/i;
const amountOnly = (line: string) => {
  const match = line.match(priced) ?? line.match(unpriced);
  return !!match && !(line.slice(0, match.index).trim() || line.slice((match.index ?? 0) + match[0].length).trim());
};
const descriptor = /^(?:табак|транспорт|алкоголь|супермаркеты|цифровой контент|кафе и рестораны|зарплата|перевод|покупки|продукты|оплата услуг|финансы|прочее|возврат)\s*$/i;
const detail = /^(?:карт[аы](?=\s|$)|сч[её]т(?=\s|$)|назначение|OPID-|\*{2,}|•{2,}|\d{1,2}:\d{2})/i;
const clock = /\b([01]?\d|2[0-3]):([0-5]\d)\b/;
const months = ['январ', 'феврал', 'март', 'апрел', 'мая', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];

export function redactBankText(text: string): string {
  return text.replace(/(?<!\d)(?:\d[ -]?){12,34}(?!\d)/g, '••••')
    .replace(/(?<!\d)\d{10,}(?!\d)/g, '••••')
    .replace(/(?:ИНН|СНИЛС|БИК|RRN|REF(?:ERENCE)?)\s*[:№#]?\s*[\d-]{6,}/gi, '••••')
    .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/gi, '••••').trim();
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
  const words = text.toLowerCase().match(/^(\d{1,2})\s+([а-я]+)(?:\s+(20\d{2}))?/);
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

export interface OCRWord { text: string; x0: number; x1: number; y0: number; y1: number }

/** OCR engines return columns as separate blocks. Rejoin words on the same visual baseline. */
export function reflowOCR(words: OCRWord[]): string {
  const rows: { baseline: number; height: number; words: OCRWord[] }[] = [];
  for (const word of [...words].sort((a, b) => a.y1 - b.y1)) {
    const height = word.y1 - word.y0;
    if (!word.text.trim() || height < 3) continue;
    const recent = rows.at(-1);
    if (recent && Math.abs(recent.baseline - word.y1) <= Math.max(4, 0.35 * Math.max(height, recent.height))) {
      recent.words.push(word);
      recent.height = Math.max(height, recent.height);
    } else rows.push({ baseline: word.y1, height, words: [word] });
  }
  return rows.map(row => row.words.sort((a, b) => a.x0 - b.x0).map((word, i, same) =>
    (i ? word.x0 - same[i - 1].x1 > row.height * 1.25 ? '   ' : ' ' : '') + word.text).join('')).join('\n');
}

function dateHeading(line: string, today: string) {
  const prefix = line.match(/^(?:(?:дата(?: операции)?\s*:?\s*)?(?:\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.\d{2,4})|\d{1,2}\s+[а-я]+(?:\s+20\d{2})?|сегодня|вчера)(?=$|[\s,])/i);
  if (!prefix) return null;
  const date = dateIn(prefix[0].replace(/^дата(?: операции)?\s*:?\s*/i, ''), today);
  const tail = line.slice(prefix[0].length).replace(/^[,\s]+/, '');
  return date && (!tail || clock.test(tail) && /^\d{1,2}:\d{2}$/.test(tail) ||
    /^(?:[+−–—-]|\d)/.test(tail) && !tail.replace(priced, '').replace(unpriced, '').trim()) ? date : null;
}

export interface ScreenshotParse { rows: ScreenshotRow[]; skipped: number; rules: Record<string, number>; stage: 'parsed' | 'parse' | 'decode' | 'ocr'; text: string }

export function parseScreenshot(text: string, today: string, imageId: string, confidence: number,
  memory: Record<string, string> = {}): ScreenshotParse {
  const safeText = redactBankText(text);
  const lines = safeText.split(/\r?\n/).map(line => line.replace(/[\u00ad\u200b]/g, '').trim()).filter(Boolean);
  const rows: ScreenshotRow[] = [];
  const rules: Record<string, number> = {};
  const hit = (name: string) => { rules[name] = (rules[name] ?? 0) + 1; };
  let skipped = 0;
  let date = '';
  let buffer: string[] = [];
  const flush = () => {
    if (buffer.some(label => /^[\p{L}].{2,}/u.test(label) && !descriptor.test(label) && !detail.test(label))) {
      skipped++;
      hit('missing-amount');
    }
    buffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const heading = dateHeading(line, today);
    if (heading) {
      flush();
      date = heading;
      const time = line.match(clock)?.[0];
      if (time) buffer.push(time);
      hit('date-heading'); continue;
    }
    if (service.test(line) || /^(?:[0-9]{1,2}:\d{2}\s+)?(?:LTE|Wi-Fi|5G)\b/i.test(line)) {
      flush();
      if (separateBalance.test(line) && !priced.test(line) && amountOnly(lines[i + 1] ?? '')) {
        i++;
        if (currencyOnly.test(lines[i + 1] ?? '')) i++;
      }
      hit('interface'); continue;
    }
    if (/^\d{1,2}:\d{2}$/.test(line)) { buffer.push(line); continue; }
    let match = line.match(priced);
    let carriedCurrency = '';
    const withContext = line.match(unpriced);
    if (!match && withContext && currencyOnly.test(lines[i + 1] ?? '')) {
      carriedCurrency = lines[++i];
      match = withContext;
    }
    const candidate = match ?? withContext;
    const supplied = candidate && line.slice(0, candidate.index).trim();
    const labels = [...buffer.slice(-4), supplied || ''];
    const currentGroup = date || /история|выписка|операци/i.test(safeText);
    const next = lines[i + 1] ?? '';
    const nextLabel = descriptor.test(next) ? next : '';
    const context = labels.join(' ') + ' ' + nextLabel;
    const labelExists = /[\p{L}]{2}/u.test(context);
    const signed = candidate?.[1];
    const currencyToken = match?.[4] ?? carriedCurrency;
    const strippedAmount = candidate?.[2].replace(/[\s.]/g, '') ?? '';
    const trustedMoney = Boolean(match || candidate && labelExists && (
      signed && (currentGroup || categorize(context) || classify(context, signed) !== 'purchase') ||
      !signed && (classify(context, undefined) !== 'unknown' || categorize(context) && (candidate[3] || /\s{2,}/.test(line)))));
    if (!trustedMoney || !candidate || strippedAmount.length > 9 || detail.test(line) && !currencyToken ||
        /^\d{1,2}:\d{2}(?:\s|$)/.test(line) && !signed && !currencyToken) {
      if (currencyOnly.test(line) || /^\+\d{1,3}$/.test(line) || /^(?:[\d.,:]+|[\p{P}\p{S}]+)$/u.test(line)) { hit('interface'); continue; }
      if (withContext && signed && !labelExists) { skipped++; hit('missing-label'); continue; }
      buffer.push(line);
      if (buffer.length > 8) buffer.shift();
      continue;
    }

    const right = line.slice((candidate.index ?? 0) + candidate[0].length).trim();
    const metadata: string[] = [];
    while (metadata.length < 4 && lines[i + 1] && !dateHeading(lines[i + 1], today) &&
      !priced.test(lines[i + 1]) && (detail.test(lines[i + 1]) || descriptor.test(lines[i + 1]) && !amountOnly(lines[i + 2] ?? ''))) metadata.push(lines[++i]);
    const details = metadata.join(' ');
    const raw = [...labels, right, details].join(' ');
    const bankId = raw.match(/OPID-([a-f0-9]{24})/i)?.[1];
    const clean = (value: string) => value.replace(/OPID-[a-f0-9]{24}/gi, '').trim();
    const nearby = clean(raw);
    const time = nearby.match(clock);
    const pickedDate = dateIn(line, today) ?? date;
    const merchant = clean(supplied || buffer.find(v => /[\p{L}]/u.test(v) && !detail.test(v) && !service.test(v)) || '').slice(0, 100);
    const stored = memory[merchantName(merchant)];
    const category = stored && stored !== 'self' ? stored as CategoryId : categorize(merchant) ?? categorize(nearby);
    let kind = classify(nearby, signed);
    if (kind === 'unknown' && !signed && category && !/отмен|отклон|перевод|в обработке|ожидает/i.test(nearby)) kind = 'purchase';
    if (stored === 'self' && kind === 'unknown') kind = 'transfer';
    const amount = Number(strippedAmount + (candidate[3] ? '.' + candidate[3] : ''));
    const normalized = ({ '$': 'USD', '€': 'EUR', '₸': 'KZT' } as Record<string, string>)[currencyToken] ??
      (!currencyToken || /^(?:₽|руб|RUB|[РP]\.?$)/i.test(currencyToken) ? 'RUB' : currencyToken.toUpperCase());
    if (!amount) { skipped++; hit('missing-amount'); buffer = []; continue; }
    hit(currencyToken ? carriedCurrency ? 'currency-next-line' : 'explicit-amount' : 'contextual-rubles');
    rows.push({
      fingerprint: bankId ? `bank-id:${bankId}` : `shot:${imageId}:${rows.length}`, kind, date: pickedDate,
      time: time ? `${time[1].padStart(2, '0')}:${time[2]}` : '', merchant,
      memo: clean(details).replace(/^назначение\s*:?\s*/i, '').slice(0, 150), amount, currency: normalized,
      accountId: /накопительн/i.test(nearby) && kind !== 'transfer' ? RESERVE_ACCOUNT : LIFE_ACCOUNT,
      ...(kind === 'transfer' && /на накопительный/i.test(nearby) ? { toAccountId: RESERVE_ACCOUNT } : {}),
      ...(kind === 'transfer' && /с накопительного/i.test(nearby) ? { accountId: RESERVE_ACCOUNT, toAccountId: LIFE_ACCOUNT } : {}),
      lastFour: nearby.match(/(?:[•*xх·]{2,}\s*|(?:карта|сч[её]т)\s+)(\d{4})(?!\d)/i)?.[1],
      category: category ?? 'fun', categoryGuessed: !category,
      warnings: [
        ...(confidence < 75 ? ['Распознавание неуверенное. Сверьте сумму и название.'] : []),
        ...(!pickedDate ? ['На снимке не видно дату этой операции.'] : []),
        ...(!currencyToken ? ['Предполагаются рубли. Сверьте валюту.'] : []),
        ...(kind === 'unknown' ? ['Уточните вид и статус операции в банке.'] : []),
        ...(normalized !== 'RUB' ? ['Для учёта нужна фактическая сумма в рублях по выписке.'] : []),
      ],
    });
    buffer = [];
  }
  flush();
  return { rows, skipped, rules, stage: rows.length ? 'parsed' : 'parse',
    text: safeText.replace(/OPID-[a-f0-9]{24}/gi, '[идентификатор операции]').slice(0, 24000) };
}

export const screenshotRows = (...args: Parameters<typeof parseScreenshot>) => parseScreenshot(...args).rows;

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
  const operation = book.operations.find(op => !op.legacyExpense && op.status === 'confirmed' && op.date === row.date &&
    cents(op.amount) === amount && op.accountId === account &&
    (row.kind === 'refund' ? op.type === 'refund' : !['purchase', 'credit', 'unknown'].includes(row.kind)));
  return expense || operation || marked ? { exact: false, expense, operation, label: marked ? marked.title : undefined } : null;
}

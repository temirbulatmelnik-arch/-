// Выписка PDF без интернета: pdf.js достаёт текст по строкам, дальше — поиск дат и сумм.
// Формат банков меняется, поэтому разбор «по возможности»: всё показывается на проверку перед применением.
import { parseDate } from './statements';

export interface PdfLine {
  date: string;
  occurredAt?: string;
  amount: number;
  /** знак суммы в выписке: − списание, + зачисление, null — без знака */
  sign: -1 | 1 | null;
  text: string;
}

export interface PdfStatement {
  lines: PdfLine[];
  /** исходящий остаток, если нашёлся */
  closingBalance: number | null;
  openingBalance: number | null;
  /** дата конца периода выписки */
  periodEnd: string | null;
  raw: string;
  rejected?: number;
}

/** Текст PDF построчно: элементы с одной высотой собираются в строку слева направо */
export async function pdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const it of content.items) {
      if (!('str' in it) || !it.str.trim()) continue;
      const y = Math.round(it.transform[5] / 3) * 3;
      rows.set(y, [...(rows.get(y) ?? []), { x: it.transform[4], s: it.str }]);
    }
    [...rows.entries()].sort((a, b) => b[0] - a[0]).forEach(([, items]) => out.push(items.sort((a, b) => a.x - b.x).map(i => i.s).join(' ').replace(/\s+/g, ' ').trim()));
  }
  return out.join('\n');
}

const MONEY = /([−\-+])?\s?(\d{1,3}(?:[   ]\d{3})+|\d+)[,.](\d{2})(?!\d)/g;
const DATE = /\b(\d{2})[./](\d{2})[./](\d{4})\b/;
/** даты и время убираются до поиска сумм: «26.10» не должно читаться как 26,10 ₽ */
const stripDates = (s: string) => s.replace(/\b\d{2}[./]\d{2}[./]\d{2,4}\b/g, ' ').replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, ' ');

export function parseStatementText(raw: string): PdfStatement {
  const lines: PdfLine[] = [];
  let closingBalance: number | null = null;
  let openingBalance: number | null = null;
  let periodEnd: string | null = null;
  if (/Период выписки/i.test(raw) && /Сумма операции в валюте счета\/карты/i.test(raw) &&
      /Дата обработки/.test(raw)) return parseVtbStatement(raw);
  const period = raw.match(/по\s+(\d{2}[./]\d{2}[./]\d{4})/i);
  if (period) periodEnd = parseDate(period[1]);
  let current: PdfLine | null = null;
  for (const line of raw.split('\n')) {
    const low = line.toLowerCase();
    const isOpening = /входящ|остаток на начало|баланс на начало|начальный остаток/.test(low);
    if (isOpening || /исходящ|остаток на конец|баланс на конец|конечный остаток/.test(low)) {
      const m = [...stripDates(line).matchAll(MONEY)].pop();
      if (m) {
        const amount = Number(`${m[2].replace(/[   ]/g, '')}.${m[3]}`) * (m[1] === '-' || m[1] === '−' ? -1 : 1);
        if (isOpening) openingBalance = amount;
        else closingBalance = amount;
      }
      continue;
    }
    if (/итого|оборот/.test(low)) continue;
    const d = line.match(DATE);
    const amounts = [...stripDates(line).matchAll(MONEY)];
    if (d && amounts.length) {
      // сумма со знаком надёжнее; иначе — первая сумма после даты
      const pick = amounts.find(a => a[1]) ?? amounts[0];
      const value = Number(`${pick[2].replace(/[   ]/g, '')}.${pick[3]}`);
      const text = stripDates(line).replace(MONEY, ' ').replace(/(RUB|RUR|руб\.?|₽)/gi, ' ').replace(/\s+/g, ' ').trim();
      const date = parseDate(d[0])!;
      const time = line.match(/\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\b/);
      const occurredAt = time ? `${date}T${time[1].padStart(2, '0')}:${time[2]}:${time[3] ?? '00'}+03:00` : undefined;
      current = { date, occurredAt, amount: value, sign: pick[1] ? (pick[1] === '+' ? 1 : -1) : null, text };
      if (value > 0) lines.push(current);
    } else if (current && !d && !amounts.length && line.length > 2 && current.text.length < 120) {
      // описание операции часто переносится на следующую строку
      current.text = `${current.text} ${line}`.trim();
    }
  }
  return { lines, openingBalance, closingBalance, periodEnd, raw };
}

const VTB_ROW = /^(\d{2}\.\d{2}\.\d{4})(?:\s+(\d{2}:\d{2}(?::\d{2})?))?\s+(\d{2}\.\d{2}\.\d{4})\s+/;
const VTB_CELL = /([+−-]?\d+(?:[.,]\d{2})?)\s+[A-Z]{3}\b/g;
const vtbNumber = (raw: string) => Number(raw.replace(',', '.').replace('−', '-'));

function parseVtbStatement(raw: string): PdfStatement {
  const lines: PdfLine[] = [];
  let openingBalance = null, closingBalance = null, periodEnd = null;
  let rejected = 0;
  let current: PdfLine | undefined;
  let sameDay = false;
  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim();
    if (/^Период выписки/i.test(line)) {
      periodEnd = parseDate([...line.matchAll(new RegExp(DATE.source, 'g'))].at(-1)?.[0] ?? '');
      continue;
    }
    if (/^Баланс на (начало|конец) периода/i.test(line)) {
      const first = [...line.matchAll(VTB_CELL)][0];
      if (first) {
        if (/начало/i.test(line)) openingBalance = vtbNumber(first[1]);
        else closingBalance = vtbNumber(first[1]);
      }
      continue;
    }
    const row = line.match(VTB_ROW);
    if (row) {
      current = undefined;
      const tail = line.slice(row[0].length);
      const [source, credit, debit] = [...tail.matchAll(VTB_CELL)];
      if (!source || !credit || !debit || !credit[0].endsWith('RUB') || !debit[0].endsWith('RUB') ||
          vtbNumber(credit[1]) < 0 || (vtbNumber(credit[1]) !== 0 && vtbNumber(debit[1]) !== 0)) {
        rejected++;
        continue;
      }
      const amount = vtbNumber(credit[1]) - Math.abs(vtbNumber(debit[1]));
      if (!amount) continue;
      // The statement closes by bank booking date. Preserve the operation clock only when both dates agree.
      const date = parseDate(row[3])!;
      sameDay = row[1] === row[3];
      const time = sameDay ? row[2] : undefined;
      const occurredAt = time ? date + 'T' + (time.length === 5 ? time + ':00' : time) + '+03:00' : undefined;
      current = { date, occurredAt, amount: Math.abs(amount), sign: amount < 0 ? -1 : 1,
        text: tail.slice(debit.index! + debit[0].length).trim() };
      lines.push(current);
    } else if (/^(?:Дата и время|Сумма операции|Операции по сч[её]ту|Итого|Страница|Выписка)/i.test(line)) {
      current = undefined;
    } else if (current && line && current.text.length < 500) {
      const time = line.match(/^(\d{2}:\d{2}(?::\d{2})?)\b\s*/);
      if (time && sameDay && current.occurredAt == null) {
        const clock = time[1].length === 5 ? time[1] + ':00' : time[1];
        current.occurredAt = current.date + 'T' + clock + '+03:00';
      }
      const detail = line.slice(time?.[0].length ?? 0);
      if (detail) current.text = (current.text + ' ' + detail).trim();
    }
  }
  return { lines, closingBalance, openingBalance, periodEnd, raw, rejected };
}

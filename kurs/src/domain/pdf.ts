// Выписка PDF без интернета: pdf.js достаёт текст по строкам, дальше — поиск дат и сумм.
// Формат банков меняется, поэтому разбор «по возможности»: всё показывается на проверку перед применением.
import { parseDate } from './statements';

export interface PdfLine {
  date: string;
  amount: number;
  /** знак суммы в выписке: − списание, + зачисление, null — без знака */
  sign: -1 | 1 | null;
  text: string;
}

export interface PdfStatement {
  lines: PdfLine[];
  /** исходящий остаток, если нашёлся */
  closingBalance: number | null;
  /** дата конца периода выписки */
  periodEnd: string | null;
  raw: string;
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
  let periodEnd: string | null = null;
  const period = raw.match(/по\s+(\d{2}[./]\d{2}[./]\d{4})/i);
  if (period) periodEnd = parseDate(period[1]);
  let current: PdfLine | null = null;
  for (const line of raw.split('\n')) {
    const low = line.toLowerCase();
    if (/исходящ|остаток на конец|баланс на конец|конечный остаток/.test(low)) {
      const m = [...stripDates(line).matchAll(MONEY)].pop();
      if (m) closingBalance = Number(`${m[2].replace(/[   ]/g, '')}.${m[3]}`) * (m[1] === '-' || m[1] === '−' ? -1 : 1);
      continue;
    }
    if (/входящ|остаток на начало|итого|оборот/.test(low)) continue;
    const d = line.match(DATE);
    const amounts = [...stripDates(line).matchAll(MONEY)];
    if (d && amounts.length) {
      // сумма со знаком надёжнее; иначе — первая сумма после даты
      const pick = amounts.find(a => a[1]) ?? amounts[0];
      const value = Number(`${pick[2].replace(/[   ]/g, '')}.${pick[3]}`);
      const text = stripDates(line).replace(MONEY, ' ').replace(/(RUB|RUR|руб\.?|₽)/gi, ' ').replace(/\s+/g, ' ').trim();
      current = { date: parseDate(d[0])!, amount: value, sign: pick[1] ? (pick[1] === '+' ? 1 : -1) : null, text };
      if (value > 0) lines.push(current);
    } else if (current && !d && !amounts.length && line.length > 2 && current.text.length < 120) {
      // описание операции часто переносится на следующую строку
      current.text = `${current.text} ${line}`.trim();
    }
  }
  return { lines, closingBalance, periodEnd, raw };
}

const INCOME_WORDS = /зачислен|поступлен|заработн|зарплат|аванс|преми|отпускн|возврат|кэшбэк|cashback|пополнение/i;

/** Списание или зачисление: знак из выписки, иначе по словам описания */
export const isIncomeLine = (l: PdfLine) => (l.sign != null ? l.sign > 0 : INCOME_WORDS.test(l.text));

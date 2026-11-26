// Разбор выписок без интернета: CSV из банка и текст, скопированный со скриншота
// (iPhone сам распознаёт текст на фото: «Фото» → удерживать текст → «Скопировать»).
import { categorize, fingerprint, isNotSpending } from './categorize';
import { addDays } from './dates';
import type { CategoryId, Source } from './types';

export interface DraftTx {
  id: string;
  date: string;
  amount: number;
  merchant: string;
  category: CategoryId;
  source: Source;
  /** не трата: перевод себе, погашение, зарплата */
  skip: boolean;
  /** уже есть в журнале */
  duplicate?: boolean;
  /** Совпадение без точного банковского идентификатора. */
  needsDuplicateReview?: boolean;
  occurredAt?: string;
  fingerprint: string;
  /** поступление, а не трата */
  income?: boolean;
  /** что предложило приложение — если человек сменит категорию, запомнить продавца */
  suggested?: CategoryId;
  /** название для памяти продавцов */
  nameKey?: string;
  /** та же трата уже внесена вручную или из чата: привязать к ней отпечаток */
  linkId?: string;
  /** сумма из заголовка дня */
  fromHeader?: boolean;
  creditCard?: string;
  structured?: boolean;
}

let seq = 0;
const uid = () => `d${Date.now().toString(36)}${(seq++).toString(36)}`;

export function draft(date: string, amount: number, merchant: string, opts: { category?: CategoryId | null; source?: Source; income?: boolean; skip?: boolean } = {}): DraftTx {
  const notSpending = opts.income || opts.skip || isNotSpending(merchant);
  return {
    id: uid(), date, amount: Math.abs(amount), merchant: merchant.trim() || 'Без названия',
    category: opts.category ?? categorize(merchant) ?? 'fun',
    source: opts.source ?? 'life', skip: notSpending, income: opts.income, fingerprint: fingerprint(date, Math.abs(amount), merchant),
  };
}

/* ---------- CSV ---------- */

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q;
    } else if (c === sep && !q) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

/** 22.10.2026, 22.10.2026 14:31, 2026-10-22, 22/10/26 → YYYY-MM-DD */
export function parseDate(s: string): string | null {
  let m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

const num = (s: string) => {
  const c = s.replace(/[\s  "]/g, '').replace('−', '-').replace(/[₽RUBруб.]+$/i, '').replace(',', '.');
  const n = Number(c);
  return Number.isFinite(n) && c !== '' ? n : null;
};

export interface CsvResult {
  rows: DraftTx[];
  bank: string;
  rejected: number;
  /** что поняли про столбцы — показать человеку */
  columns: { date: string; amount: string; merchant: string };
}

export function parseCsv(text: string, fileHash?: string): CsvResult | null {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return null;
  for (const separator of [';', '\t', ',']) {
    const result = parseBankTable(lines.map(line => splitCsvLine(line, separator)), fileHash);
    if (result) return result;
  }
  return null;
}

const cellText = (cell: string | number | boolean | Date | null) => cell instanceof Date
  ? cell.toISOString().slice(0, 19) : String(cell ?? '').trim();

export function parseBankTable(table: (string | number | boolean | Date | null)[][], fileHash?: string): CsvResult | null {
  const grid = table.map(row => row.map(cellText));
  const find = (head: string[], ...keys: string[]) => keys.map(key => head.findIndex(h => h.includes(key))).find(index => index >= 0) ?? -1;
  const dateIndex = (head: string[]) => find(head, 'дата операции', 'дата и время', 'дата', 'transaction date', 'date');
  const amountIndex = (head: string[]) => find(head, 'сумма операции', 'transaction amount', 'сумма', 'amount');
  const header = grid.findIndex((row, index) => index < 30 && row.length > 1 && dateIndex(row.map(h => h.toLowerCase())) >= 0 && amountIndex(row.map(h => h.toLowerCase())) >= 0);
  if (header < 0) return null;
  const head = grid[header].map(h => h.toLowerCase());
  const iDate = dateIndex(head);
  const iAmount = amountIndex(head);
  const iDesc = find(head, 'описание операции', 'описание', 'назначение', 'контрагент', 'получатель', 'description', 'merchant');
  const iCat = find(head, 'категория', 'category');
  const iStatus = find(head, 'статус', 'status');
  const iDirection = find(head, 'направление', 'приход/расход', 'дебет/кредит', 'тип операции', 'direction');
  const iCurrency = find(head, 'валюта операции', 'валюта', 'currency');
  const iExternal = find(head, 'id операции', 'идентификатор операции', 'transaction id', 'operation id');
  const iAccount = find(head, 'номер счёта', 'номер счета', 'account', 'номер карты', 'card', 'счёт', 'счет', 'карта');
  const bankTitle = grid.slice(0, header).flat().join(' ');
  const bank = /\bVTB\b|ВТБ/i.test(bankTitle) ? 'vtb' : /Т-Банк|Тинькофф/i.test(bankTitle) ? 'tbank' : 'table';

  const rows: DraftTx[] = [];
  let rejected = 0;
  for (const [row, c] of grid.slice(header + 1).entries()) {
    if (!c.some(Boolean)) continue;
    const rawDate = c[iDate] ?? '';
    const date = parseDate(rawDate);
    const rawAmount = c[iAmount] ?? '';
    const amount = num(rawAmount);
    const direction = c[iDirection]?.toLowerCase() ?? '';
    const currency = c[iCurrency] ?? '';
    const status = c[iStatus] ?? '';
    if (!date || amount == null || amount === 0 ||
      (currency && !/^(?:[₽р]|руб\.?|рубл[ьи]|RUB|RUR|643)$/i.test(currency)) ||
      /fail|pending|reject|reversed|declined|отклон|отмен|в обработке|ожида|заблок/i.test(status)) {
      rejected++;
      continue;
    }
    const credit = /^(?:приход|зачисление|поступление|кредит|credit|in|пополнение|возврат)$/.test(direction);
    const debit = /^(?:расход|списание|дебет|debit|out|оплата|покупка)$/.test(direction);
    if ((direction && !credit && !debit) || (credit && amount < 0)) {
      rejected++;
      continue;
    }
    const merchant = [c[iDesc], iCat >= 0 ? c[iCat] : ''].filter(Boolean).join(' · ');
    const tx = { ...draft(date, amount, merchant, { income: credit || (!debit && amount > 0) }), structured: true };
    const external = iExternal >= 0 ? c[iExternal] : undefined;
    const account = iAccount >= 0 ? c[iAccount] : undefined;
    if (external && (account || bank !== 'table')) tx.fingerprint = JSON.stringify(['csv:operation', bank, account ?? '', external]);
    else if (fileHash) tx.fingerprint = JSON.stringify(['csv:file', fileHash, row]);
    const time = rawDate.match(/(?:T|\s)([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?(Z|[+-]\d\d:\d\d)?$/i);
    if (time) tx.occurredAt = `${date}T${time[1]}:${time[2]}:${time[3] ?? '00'}${time[4] ?? '+03:00'}`;
    rows.push(tx);
  }
  return { rows, bank, rejected, columns: { date: head[iDate], amount: head[iAmount], merchant: iDesc >= 0 ? head[iDesc] : '—' } };
}

/* ---------- Текст со скриншота ---------- */

const MONTHS: Record<string, number> = { январ: 1, феврал: 2, март: 3, апрел: 4, ма: 5, июн: 6, июл: 7, август: 8, сентябр: 9, октябр: 10, ноябр: 11, декабр: 12 };

function headerDate(line: string, now: string): string | null {
  const l = line.toLowerCase().trim();
  if (/^сегодня/.test(l)) return now;
  if (/^вчера/.test(l)) return addDays(now, -1);
  const m = l.match(/^(\d{1,2})\s+([а-я]+)(?:\s+(\d{4}))?/);
  if (m) {
    const key = Object.keys(MONTHS).sort((a, b) => b.length - a.length).find(k => m[2].startsWith(k));
    if (key) {
      let y = m[3] ? Number(m[3]) : Number(now.slice(0, 4));
      const mm = MONTHS[key];
      const k = `${y}-${String(mm).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
      if (!m[3] && k > now) y -= 1; // «25 декабря» в январе — прошлый год
      return `${y}-${String(mm).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    }
  }
  return parseDate(l.length <= 16 ? l : '');
}

/** Сумма в строке: «−1 234,56 ₽», «- 350 ₽», «+48 648 ₽». Без знака и без ₽ — не сумма (это может быть время или номер). */
const AMOUNT = /([−\-+–])?\s?(\d{1,3}(?:[   ]\d{3})*|\d+)(?:[,.](\d{1,2}))?\s?(?:₽|руб|RUB|р\.)/i;

export function parseText(text: string, now: string): DraftTx[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const out: DraftTx[] = [];
  let date = now;
  let lastText = '';
  for (const line of lines) {
    const hd = headerDate(line, now);
    if (hd && !AMOUNT.test(line)) { date = hd; continue; }
    const m = line.match(AMOUNT);
    if (!m) {
      // «Супермаркеты», «Перевод» — подпись категории под названием: не затираем название продавца
      if (!/^\d{1,2}:\d{2}$/.test(line) && line.length > 1) lastText = lastText && line.length < 16 && /^[А-ЯЁA-Z][а-яёa-z]+$/.test(line) ? `${lastText} · ${line}` : line;
      continue;
    }
    const value = Number(m[2].replace(/[   ]/g, '') + (m[3] ? `.${m[3]}` : ''));
    if (!value) continue;
    const before = line.slice(0, m.index).trim();
    const merchant = before.length > 1 ? before : lastText;
    const income = m[1] === '+';
    out.push(draft(date, value, merchant, { income }));
    lastText = '';
  }
  return out;
}

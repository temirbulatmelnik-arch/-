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
  fingerprint: string;
  /** поступление, а не трата */
  income?: boolean;
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
  /** что поняли про столбцы — показать человеку */
  columns: { date: string; amount: string; merchant: string };
}

export function parseCsv(text: string): CsvResult | null {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return null;
  const sep = [';', '\t', ','].sort((a, b) => lines[0].split(b).length - lines[0].split(a).length)[0];
  const head = splitCsvLine(lines[0], sep).map(h => h.toLowerCase());
  const find = (...keys: string[]) => head.findIndex(h => keys.some(k => h.includes(k)));
  const iDate = find('дата операции', 'дата', 'date');
  // «Сумма операции» точнее «Суммы платежа» (у Т-Банка обе), но берём первую подходящую
  const iAmount = find('сумма операции', 'сумма', 'amount');
  const iDesc = find('описание', 'назначение', 'контрагент', 'получатель', 'description', 'merchant');
  const iCat = find('категория', 'category');
  const iStatus = find('статус', 'status');
  if (iDate < 0 || iAmount < 0) return null;

  const rows: DraftTx[] = [];
  for (const line of lines.slice(1)) {
    const c = splitCsvLine(line, sep);
    const date = parseDate(c[iDate] ?? '');
    const amount = num(c[iAmount] ?? '');
    if (!date || amount == null || amount === 0) continue;
    if (iStatus >= 0 && /fail|отклон/i.test(c[iStatus] ?? '')) continue;
    const merchant = [c[iDesc], iCat >= 0 ? c[iCat] : ''].filter(Boolean).join(' · ');
    rows.push(draft(date, amount, merchant, { income: amount > 0 }));
  }
  // выписка, где все суммы положительные, — это обычно только списания
  if (rows.length && rows.every(r => r.income)) rows.forEach(r => { r.income = false; r.skip = isNotSpending(r.merchant); });
  return { rows, columns: { date: head[iDate], amount: head[iAmount], merchant: iDesc >= 0 ? head[iDesc] : '—' } };
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

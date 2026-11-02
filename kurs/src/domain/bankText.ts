// Текст со скриншота банка (iPhone: «Фото» → удерживать текст → «Скопировать»): ВТБ «История», Сбер, Т-Банк.
// Live Text читает экран столбцами и с ошибками: название, сумма и категория банка идут в разном порядке, «₽» бывает «ł»,
// «Транспорт» — «Іранспорт», сумма дня из заголовка может оказаться между операциями. Разбор собирает операции
// из строк по их виду: заголовок дня, сумма, категория банка (ближайшая по написанию), название, служебный текст.
import { addDays } from './dates';

export type Bank = 'vtb' | 'sber' | 'tbank' | 'unknown';

export interface BankOp {
  date: string;
  amount: number;
  /** '+' пришло, '-' ушло, '' без знака (у Сбера так пишутся списания, у ВТБ — «Между своими счетами») */
  sign: '+' | '-' | '';
  name: string;
  /** категория банка, приведённая к известной */
  cat?: string;
  /** порядковый номер среди одинаковых операций дня на скриншоте: две поездки по 95 ₽ — 1 и 2 */
  ord: number;
  /** сумма взята из заголовка дня: в строке операции её не разобрать */
  fromHeader?: boolean;
}

export interface BankDay {
  date: string;
  /** сумма списаний дня из заголовка */
  total?: number;
  /** сумма разобранных списаний */
  out: number;
}

export interface BankParse {
  bank: Bank;
  /** экран кредитной карты (Т-Банк «Платинум», Сбер «Кредитная») — траты с кредитки */
  credit: boolean;
  ops: BankOp[];
  days: BankDay[];
  /** «Внесите платёж 12 345,67 ₽ до 30.11.26» */
  dues: { amount: number; date: string; text: string }[];
  /** остатки с главного экрана банка */
  balances: { card?: number; reserve?: number };
}

/** Категории банков, как их пишут ВТБ, Сбер и Т-Банк */
export const BANK_CATS = [
  'Транспорт', 'Супермаркеты', 'Кафе и рестораны', 'Фастфуд', 'Алкоголь', 'Табак', 'Аптеки', 'Медицина', 'Красота', 'Такси',
  'Маркетплейсы', 'Дом и ремонт', 'Украшения и бижутерия', 'Одежда', 'Одежда и обувь', 'Турагентства', 'Цифровой контент', 'Связь',
  'Переводы людям', 'Входящие переводы', 'Между своими счетами', 'Возврат средств', 'Другие зачисления', 'Выплата процентов',
  'Вклады и накопления', 'Поступление заработной платы', 'Платежи и переводы', 'Списание кредита', 'Перевод по СБП',
  'Погашение кредита', 'Переводы', 'Услуги банка', 'Развлечения', 'Животные', 'Образование', 'Спорт', 'Прочие расходы',
  'Наличные', 'Пополнения', 'Зарплата', 'Кэшбэк', 'Отели', 'Авиабилеты', 'Ж/д билеты', 'Топливо', 'Автоуслуги',
];

const MONTHS: [string, number][] = [['январ', 1], ['феврал', 2], ['март', 3], ['апрел', 4], ['ма', 5], ['июн', 6], ['июл', 7], ['август', 8], ['сентябр', 9], ['октябр', 10], ['ноябр', 11], ['декабр', 12]];

/** латиница, похожая на кириллицу, — в кириллицу; «І» в начале слова — «Т» (так Live Text читает «Транспорт») */
export function fixOcr(s: string): string {
  const map: Record<string, string> = { A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', a: 'а', c: 'с', e: 'е', o: 'о', p: 'р', x: 'х', y: 'у' };
  // только в словах, где уже есть кириллица: латинские названия продавцов не трогаем
  return s.replace(/[A-Za-zА-Яа-яЁёІі]+/g, w => (/[А-Яа-яЁё]/.test(w) ? w.replace(/^[ІI]/, 'Т').replace(/[ABCEHKMOPTXaceopxy]/g, c => map[c]) : w));
}

function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Категория банка с поправкой на ошибки распознавания: ближайшая по написанию, не дальше 2 букв (и не больше четверти слова) */
export function bankCat(line: string): string | null {
  const s = fixOcr(line).toLowerCase().replace(/ё/g, 'е').trim();
  if (s.length < 4 || s.length > 32) return null;
  let best: string | null = null, dist = Infinity;
  for (const c of BANK_CATS) {
    const d = lev(s, c.toLowerCase().replace(/ё/g, 'е'));
    if (d < dist) { dist = d; best = c; }
  }
  if (best && dist <= Math.min(2, Math.floor(s.length / 4))) return best;
  // начало категории, остальное не распозналось: «Услуги» → «Услуги банка»
  return s.length >= 5 ? BANK_CATS.find(c => c.toLowerCase().startsWith(`${s} `)) ?? null : null;
}

/** Сумма: «−1 234,56 ₽», «- 46 ₽», «+3 000 ₽», «200,50ł», «-11.111 ₽» (точка — разделитель тысяч), «12 345,67р» */
const AMOUNT = /(^|[^\d])([−\-–+])?\s?(\d{1,3}(?:[\s  .]\d{3})+|\d+)(?:,(\d{1,2})|\.(\d{1,2})(?!\d))?\s?(₽|ł|Р|р\.?|руб\.?|RUB)(?![а-яё])/i;

export function amountIn(line: string): { value: number; sign: '+' | '-' | ''; index: number } | null {
  const m = line.match(AMOUNT);
  if (!m) return null;
  const value = Number(m[3].replace(/[\s  .]/g, '') + (m[4] || m[5] ? `.${m[4] ?? m[5]}` : ''));
  if (!value) return null;
  return { value, sign: m[2] === '+' ? '+' : m[2] ? '-' : '', index: (m.index ?? 0) + m[1].length };
}

/** «Сегодня, 2 ноября − 431 ₽», «Вчера», «31 октября, сб», «22 октября» */
function header(line: string, now: string): { date: string; total?: number } | null {
  const l = fixOcr(line).trim();
  const m = l.match(/^(Сегодня|Вчера)?[,\s]*(?:(\d{1,2})\s+([А-Яа-яё]+))?(?:,\s*[а-я]{2})?\s*(.*)$/i);
  if (!m || (!m[1] && !m[2])) return null;
  const rest = m[4].trim();
  const amt = rest ? amountIn(rest) : null;
  if (rest && (!amt || rest.slice(0, amt.index).replace(/[−\-–+\s]/g, ''))) return null;
  let date: string | null = null;
  if (m[2]) {
    const word = m[3].toLowerCase();
    const month = MONTHS.slice().sort((a, b) => b[0].length - a[0].length).find(([k]) => word.startsWith(k))?.[1];
    if (!month) return null;
    let y = Number(now.slice(0, 4));
    const key = (yy: number) => `${yy}-${String(month).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    if (key(y) > now) y -= 1; // дата в будущем — прошлый год
    date = key(y);
  } else date = /^сегодня/i.test(m[1]) ? now : addDays(now, -1);
  return { date, ...(amt ? { total: amt.value } : {}) };
}

/** Служебные строки экрана: кнопки, подписи карт, уведомления — не операции */
const NOISE = [/^детали/i, /^узнать больше/i, /^сегодня до конца дня/i, /^рассрочка на/i, /^поиск/i, /^что показывать/i, /^период$/i, /^карта или сч[её]т/i,
  /^без переводов/i, /^история$/i, /^операции$/i, /^траты$/i, /^пополнения$/i, /^главная$/i, /^платежи$/i, /^продукты$/i, /^чат$/i, /^витрина$/i, /^город$/i];

/** Подпись карты: «Платинум», «МИР Классическая ЕКП: 74,76 ₽», «Кредитная •• 1234» */
const CARD = /^(платинум|мир\b|visa|mastercard|кредитн|дебетов|.*•{2})/i;

export function parseBankText(text: string, now: string): BankParse {
  const raw = text.split(/\r?\n/).map(l => l.replace(/[  ]/g, ' ').trim()).filter(Boolean);
  const all = raw.join('\n');
  const bank: Bank = /Перевод по СБП|Погашение кредита|СберБанк|МИР Классическая/i.test(all) ? 'sber'
    : /Платинум|Услуги банка|Т-Банк|Тинькофф/i.test(all) ? 'tbank'
      : /Переводы людям|Входящие переводы|Кафе и рестораны|Между своими счетами|Мастер-сч/i.test(all) ? 'vtb' : 'unknown';
  const credit = raw.some(l => /^платинум$/i.test(l) || /^кредитн/i.test(l));

  const ops: BankOp[] = [];
  const days: BankDay[] = [];
  const dues: BankParse['dues'] = [];
  const balances: BankParse['balances'] = {};
  let day: BankDay | null = null;
  let cur: { name?: string; cat?: string; amounts: { value: number; sign: BankOp['sign'] }[] } = { amounts: [] };

  const flush = () => {
    if (day && cur.name && cur.amounts.length) {
      const a = cur.amounts.at(-1)!;
      ops.push({ date: day.date, amount: a.value, sign: a.sign, name: cur.name, ...(cur.cat ? { cat: cur.cat } : {}), ord: 0 });
    }
    cur = { amounts: [] };
  };

  for (const line0 of raw) {
    const line = line0.replace(/ł/g, '₽');
    // остатки с главного экрана
    const bal = amountIn(line);
    if (bal && /мастер-?сч[её]т/i.test(line)) { balances.card = bal.value; continue; }
    if (bal && /^(резерв|накопительн)/i.test(line)) { balances.reserve = bal.value; continue; }
    // «Внесите платёж 12 345,67р до 30.11.26» — точный обязательный платёж
    const due = line.match(/внесите (?:платёж|платеж)\s+(.+?)\s+до\s+(\d{2})\.(\d{2})\.(\d{2,4})/i);
    if (due) {
      const a = amountIn(due[1].replace(/р$/, ' ₽')) ?? amountIn(`${due[1]} ₽`);
      if (a) dues.push({ amount: a.value, date: `${due[4].length === 2 ? `20${due[4]}` : due[4]}-${due[3]}-${due[2]}`, text: line });
      continue;
    }
    if (NOISE.some(r => r.test(line)) || CARD.test(line)) continue;

    const h = header(line, now);
    if (h) {
      flush();
      day = { date: h.date, ...(h.total != null ? { total: h.total } : {}), out: 0 };
      days.push(day);
      continue;
    }
    if (!day) continue;

    const a = amountIn(line);
    if (a && !line.slice(0, a.index).replace(/[−\-–+\s]/g, '')) {
      // сумма без названия сразу под заголовком — это сумма дня (Сбер, Т-Банк)
      if (!cur.name && day.total == null && !ops.some(o => o.date === day!.date)) { day.total = a.value; continue; }
      // вторая сумма у одной операции: первая была суммой дня, прочитанной не на месте (Сбер)
      if (cur.amounts.length === 1 && day.total == null) { day.total = cur.amounts[0].value; cur.amounts = []; }
      cur.amounts.push({ value: a.value, sign: a.sign });
      continue;
    }
    // название и сумма в одной строке
    if (a) {
      flush();
      cur = { name: line.slice(0, a.index).replace(/[−\-–+\s]+$/, '').trim(), amounts: [{ value: a.value, sign: a.sign }] };
      continue;
    }
    // мусор распознавания: одна буква, арабская вязь вместо иконки
    const letters = line.replace(/[^А-Яа-яЁёA-Za-z]/g, '');
    if (letters.length < 2) continue;
    const cat = bankCat(line);
    if (cat && cur.name && !cur.cat) { cur.cat = cat; continue; }
    if (cur.name && (cur.amounts.length || cur.cat)) flush();
    else if (cur.name) cur = { amounts: [] }; // строка без суммы («Платёж по кредиту») — уведомление, не операция
    cur.name = fixOcr(line).replace(/(\.\.\.|…)$/, '').trim();
  }
  flush();

  // порядковые номера одинаковых операций дня и сумма списаний дня
  const seen = new Map<string, number>();
  for (const o of ops) {
    const k = `${o.date}|${o.amount}|${normName(o.name)}`;
    o.ord = (seen.get(k) ?? 0) + 1;
    seen.set(k, o.ord);
  }
  for (const d of days) {
    const list = ops.filter(o => o.date === d.date);
    // одна операция за день, а её сумма не разобралась («-14 ł»): берём сумму из заголовка
    if (list.length === 1 && d.total != null && list[0].sign !== '+' && list[0].amount < d.total - 1) { list[0].amount = d.total; list[0].fromHeader = true; }
    d.out = Math.round(list.filter(o => o.sign !== '+').reduce((s, o) => s + o.amount, 0) * 100) / 100;
  }
  return { bank, credit, ops, days, dues, balances };
}

/** Название для памяти и повторов: без регистра, знаков и многоточия; человек — по имени */
export function normName(name: string): string {
  const s = fixOcr(name).replace(/(\.\.\.|…)$/, '').trim();
  if (isPerson(s)) return `person:${s.split(/\s+/)[0].toUpperCase()}`;
  return s.toUpperCase().replace(/Ё/g, 'Е').replace(/[^A-ZА-Я0-9]/g, '');
}

/** «Иван Петрович И.», «Пётр Сергеевич С.», «Иван П.» — человек, а не магазин */
export const isPerson = (s: string) => /^[А-ЯЁ][а-яё]+(\s[А-ЯЁ][а-яё]+)?\s[А-ЯЁ]\.?$/.test(s.replace(/(\.\.\.|…)$/, '').trim()) || /^[А-ЯЁ][а-яё]+\s[А-ЯЁ][а-яё]+(вич|вна|ич|кызы|оглы)$/.test(s.replace(/(\.\.\.|…)$/, '').trim());

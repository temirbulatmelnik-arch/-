// Трата одной фразой: «обед 340», «такси тысяча двести», «метро 95 рублей». Фразу можно набрать или продиктовать
// микрофоном на клавиатуре iPhone — он работает в любом поле, в том числе в приложении, установленном профилем.
// Из фразы достаём сумму (цифрами или словами) и по словам подбираем категорию: сначала по своим прошлым тратам,
// потом по словарю.
import type { CategoryId, Expense } from './types';

const UNITS: Record<string, number> = {
  ноль: 0, один: 1, одна: 1, одну: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9,
  десять: 10, одиннадцать: 11, двенадцать: 12, тринадцать: 13, четырнадцать: 14, пятнадцать: 15, шестнадцать: 16,
  семнадцать: 17, восемнадцать: 18, девятнадцать: 19,
  двадцать: 20, тридцать: 30, сорок: 40, пятьдесят: 50, шестьдесят: 60, семьдесят: 70, восемьдесят: 80, девяносто: 90,
  сто: 100, двести: 200, триста: 300, четыреста: 400, пятьсот: 500, шестьсот: 600, семьсот: 700, восемьсот: 800, девятьсот: 900,
  полторы: 1.5, полтора: 1.5,
};
const THOUSAND = /^(тысяч[аиу]?|тыщ[аиу]?|тыс)$/;
const CURRENCY = /^(₽|р|руб|рубль|рубля|рублей|рублях)$/;

export interface Spoken {
  /** сумма из фразы; null — числа во фразе нет */
  amount: number | null;
  /** фраза без суммы и слова «рублей» — это примечание к трате */
  words: string;
}

/** Разобрать фразу. Чисел несколько («2 кофе 300») — сумма последняя, остальное остаётся в примечании */
export function parseSpoken(text: string): Spoken {
  // «1 500» и «1 500,50» — одно число: группы по три цифры склеиваем заранее
  const joined = text.replace(/(\d{1,3})((?:[   ]\d{3})+)(?!\d)/g, (_, a: string, b: string) => a + b.replace(/[   ]/g, ''));
  const tokens = joined.split(/\s+/).filter(Boolean);
  const clean = (t: string) => t.toLowerCase().replace(/ё/g, 'е').replace(/^[«"'(]+|[»"').,;:!?]+$/g, '');
  // подряд идущие числовые слова — одно число; запоминаем, какие слова оно заняло
  const runs: { from: number; to: number; value: number }[] = [];
  let i = 0;
  while (i < tokens.length) {
    let total = 0, cur = 0, j = i, any = false;
    for (; j < tokens.length; j++) {
      const t = clean(tokens[j]);
      const digits = /^(\d+(?:[.,]\d{1,2})?)(р|руб|₽)?$/.exec(t);
      if (digits) {
        // второе число цифрами подряд — уже другое число: «2 300» без склейки остаётся «2» и «300»
        if (any) break;
        cur = Number(digits[1].replace(',', '.')); any = true;
      } else if (t in UNITS) {
        cur += UNITS[t]; any = true;
      } else if (THOUSAND.test(t)) {
        total += (cur || 1) * 1000; cur = 0; any = true;
      } else break;
    }
    if (any) {
      // «рублей» после числа — часть суммы, в примечание не идёт
      let to = j;
      if (to < tokens.length && CURRENCY.test(clean(tokens[to]))) to++;
      runs.push({ from: i, to, value: Math.round((total + cur) * 100) / 100 });
      i = to;
    } else i++;
  }
  const last = runs.length ? runs[runs.length - 1] : null;
  if (!last || last.value <= 0) return { amount: null, words: text.trim() };
  const words = tokens.filter((_, k) => k < last.from || k >= last.to).join(' ').replace(/^[\s,.;:—–-]+|[\s,.;:—–-]+$/g, '');
  return { amount: last.value, words };
}

/** Слова, по которым категория понятна без истории; основы слов — чтобы ловить «обеда», «обедал» */
const HINTS: [CategoryId, string[]][] = [
  ['transport', ['метро', 'автобус', 'трамва', 'троллейбус', 'маршрутк', 'электричк', 'самокат', 'проезд', 'подорожник', 'транспорт']],
  ['taxi', ['такси']],
  ['work', ['обед', 'столов', 'бизнес-ланч', 'ланч', 'кофе']],
  ['groceries', ['продукт', 'магазин', 'супермаркет', 'рынок', 'овощ', 'фрукт', 'молок', 'хлеб', 'мясо']],
  ['health', ['аптек', 'лекарств', 'врач', 'анализ', 'стоматолог', 'клиник']],
  ['beauty', ['стрижк', 'парикмахер', 'барбер', 'маникюр', 'оптик', 'линзы', 'косметик']],
  ['tobacco', ['сигарет', 'табак', 'стик', 'вейп', 'пиво', 'вино', 'алкогол']],
  ['fixed', ['связь', 'интернет', 'подписк', 'спортзал', 'абонемент', 'телефон']],
  ['shopping', ['одежд', 'обув', 'маркетплейс', 'быт', 'посуд', 'техник']],
  ['fun', ['кафе', 'ресторан', 'бар', 'доставк', 'кино', 'подарок', 'подарк', 'театр', 'концерт', 'пицц', 'суши', 'бургер']],
];

/** Категория по словам фразы: как записывали такие траты раньше, иначе — по словарю; не понятно — null */
export function guessCategory(words: string, expenses: Pick<Expense, 'note' | 'category'>[]): CategoryId | null {
  const w = words.toLowerCase().replace(/ё/g, 'е').trim();
  if (!w) return null;
  const votes = new Map<CategoryId, number>();
  for (const e of expenses) {
    const n = e.note?.toLowerCase().replace(/ё/g, 'е').trim();
    // по началу слова — только от трёх букв: иначе категория прыгала бы на каждой набранной букве
    if (n && (n === w || (w.length >= 3 && n.length >= 3 && (n.startsWith(w) || w.startsWith(n))))) votes.set(e.category, (votes.get(e.category) ?? 0) + 1);
  }
  if (votes.size) return [...votes].sort((a, b) => b[1] - a[1])[0][0];
  const parts = w.split(/[\s,]+/);
  for (const [id, stems] of HINTS) if (parts.some(p => stems.some(st => p.startsWith(st)))) return id;
  return null;
}

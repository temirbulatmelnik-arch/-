// Категория по названию продавца из выписки (шаблоны из аудита + русские названия, как в приложениях банков).
import { planConfig } from './plan';
import type { CategoryId } from './types';

/** Порядок важен: BARBER раньше BAR, GOLD APPLE раньше APPLE, доставка раньше кафе */
const RULES: [CategoryId, string[]][] = [
  ['taxi', ['4121', 'TAXI', 'FASTEN', 'ТАКСИ', 'YANDEX.GO', 'ЯНДЕКС GO', 'ЯНДЕКС ТАКСИ', 'CITYMOBIL', 'СИТИМОБИЛ']],
  ['transport', ['7299', 'BERIZAR', 'RUNCHARGE', 'WHOOSH', 'URENT', 'METRO', 'МЕТРО', 'BAS_AVTO', 'AVTOBUS', 'АВТОБУС', 'VEST-SERVIS', 'RASP.EL', 'TPP', 'ПОДОРОЖНИК', 'ЭЛЕКТРИЧК', 'ЦППК', 'СЗППК', 'ЮРЕНТ', 'ВУШ']],
  ['beauty', ['GOLD APPLE', 'ЗОЛОТОЕ ЯБЛОКО', 'LETUAL', 'ЛЭТУАЛЬ', 'BARBER', 'БАРБЕР', 'SALON', 'САЛОН', 'ОПТИК', 'OPTIC']],
  ['fun', ['5814*EDA', 'EDA.YANDEX', 'DOSTAVKA', 'ДОСТАВКА', 'YAMIYAMI', 'ЯМИ ЯМИ', 'SAMOKAT', 'САМОКАТ', 'LAVKA', 'ЛАВКА', 'EDARIT', 'KUPER', 'КУПЕР', 'DOSTAEVSKY', 'ДОСТАЕВСКИЙ', 'ЯНДЕКС ЕДА',
    'COFFEE', 'КОФЕ', 'CAFE', 'КАФЕ', 'PUB', 'ПАБ', 'BURGER', 'БУРГЕР', 'VKUSNOITOCHKA', 'ВКУСНО И ТОЧКА', 'SHAVERMA', 'ШАВЕРМ', 'KHACHAPURI', 'ХАЧАПУРИ', 'SUSHI', 'СУШИ',
    'DODO', 'ДОДО', 'DRINKIT', 'PEKARNYA', 'ПЕКАРН', 'RESTORAN', 'РЕСТОРАН', 'HOOKAH', 'КАЛЬЯН', 'BAR', 'БАР', 'КИНО', 'CINEMA', 'TICKET', 'БИЛЕТ']],
  ['groceries', ['PYATEROCHKA', 'ПЯТЕРОЧКА', 'ПЯТЁРОЧКА', 'MAGNIT', 'МАГНИТ', 'LENTA', 'ЛЕНТА', 'AUCHAN', 'АШАН', 'PEREKRESTOK', 'ПЕРЕКРЕСТОК', 'ПЕРЕКРЁСТОК', 'DIXY', 'ДИКСИ', 'VKUSVILL', 'ВКУСВИЛЛ', 'MAGAZIN', 'МАГАЗИН', 'NEBO', 'ПРОДУКТ', 'SPAR', 'ОКЕЙ', "O'KEY"]],
  ['tobacco', ['TABAK', 'TOBAK', 'ТАБАК', 'KRASNOE&BELOE', 'КРАСНОЕ&БЕЛОЕ', 'КРАСНОЕ И БЕЛОЕ', 'WINELAB', 'ВИНЛАБ', 'NAPITKI', 'НАПИТКИ', 'GRADUSY', 'ГРАДУСЫ', 'БРИСТОЛЬ', 'ALCO', 'АЛКО']],
  ['health', ['APTEK', 'APTECH', 'АПТЕК', 'FARMA', 'ФАРМА', '5912', 'INTRAMED', 'KLINIK', 'КЛИНИК', 'МЕДИЦ', 'ЗДРАВСИТИ', 'СТОМАТ', 'ДОКТОР']],
  ['shopping', ['OZON', 'ОЗОН', 'WILDBERR', 'ВАЙЛДБЕРР', 'WB*', 'LAMODA', 'ЛАМОДА', 'LIME', 'MARKET', 'МАРКЕТ', 'ЛЕРУА', 'LEROY', 'IKEA', 'ФИКС ПРАЙС', 'FIX PRICE', 'DNS']],
  ['fixed', ['DDX', 'FITVEND', 'FITNESS', 'ФИТНЕС', 'ANTHROPIC', 'CLAUDE', 'VPN', 'APPLE.COM', 'APPLE', 'PLUS', 'ПЛЮС', 'MTS', 'МТС', 'TOPUP', 'MEGAFON', 'МЕГАФОН', 'T-MOBILE', 'Т-МОБАЙЛ', 'BEELINE', 'БИЛАЙН', 'TELE2', 'ТЕЛЕ2']],
];

/** Переводы себе, погашения кредитов, зарплата — не траты */
const NOT_SPENDING = ['ПЕРЕВОД СЕБЕ', 'МЕЖДУ СВОИМИ', 'МЕЖДУ СЧЕТАМИ', 'МЕЖДУ СЧЕТ', 'ПОГАШЕНИЕ', 'ВНЕСЕНИЕ', 'ПОПОЛНЕНИЕ СЧЕТА', 'ЗАРАБОТН', 'ЗАРПЛАТ', 'АВАНС', 'ПРЕМИЯ',
  'КРЕДИТ', 'НАКОПИТЕЛЬН', 'СБЕРЕГАТЕЛЬН', 'ВОЗВРАТ', 'КЭШБЭК', 'CASHBACK', 'ПРОЦЕНТЫ НА ОСТАТОК'];

export function categorize(merchant: string): CategoryId | null {
  const s = ` ${merchant.toUpperCase().replace(/Ё/g, 'Е')} `;
  // свои шаблоны из плана (например, столовая на работе) — раньше общих
  for (const [cat, keys] of [...(planConfig().merchantRules ?? []), ...RULES]) {
    for (const k of keys) {
      const key = k.toUpperCase().replace(/Ё/g, 'Е');
      // короткие латинские шаблоны (BAR, PUB, TPP) — только целым словом
      if (key.length <= 4 && /^[A-ZА-Я]+$/.test(key)) {
        if (new RegExp(`[^A-ZА-Я0-9]${key}[^A-ZА-Я]`).test(s)) return cat;
      } else if (s.includes(key)) return cat;
    }
  }
  return null;
}

export function isNotSpending(text: string): boolean {
  const s = text.toUpperCase().replace(/Ё/g, 'Е');
  return NOT_SPENDING.some(k => s.includes(k));
}

/** Отпечаток операции для поиска дублей: дата + сумма + первые буквы продавца */
export const fingerprint = (date: string, amount: number, merchant: string) =>
  `${date}|${Math.round(amount * 100)}|${merchant.toUpperCase().replace(/[^A-ZА-Я0-9]/g, '').slice(0, 10)}`;

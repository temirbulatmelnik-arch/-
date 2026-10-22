// Разбор скриншота или PDF-выписки через Claude: что это за экран и какие блоки приложения обновить.
// Запрос идёт напрямую с телефона в API Anthropic с личным ключом, без промежуточного сервера.
import Anthropic from '@anthropic-ai/sdk';
import type { CategoryId, Debt, IncomeKind } from './types';
import { CATEGORIES, planConfig } from './plan';


export type ScreenKind = 'transactions' | 'debt_status' | 'payment_receipt' | 'income' | 'savings_balance' | 'other';

export interface AiResult {
  kind: ScreenKind;
  summary: string;
  bank: string;
  transactions: {
    date: string;
    amount: number;
    merchant: string;
    category: CategoryId;
    direction: 'expense' | 'income' | 'own_transfer' | 'debt_payment';
    card: 'debit' | 'credit' | 'unknown';
  }[];
  debts: { debtId: string; balance: number; minPayment: number; dueDate: string; limit: number }[];
  payments: { debtId: string; amount: number; date: string }[];
  incomes: { kind: IncomeKind; amount: number; date: string }[];
  /** баланс накопительного счёта (резерв); 0 — не видно */
  savingsBalance: number;
  /** остаток на зарплатной (дебетовой) карте или счёте на конец выписки; 0 — не видно */
  accountBalance: number;
  /** дата этого остатка YYYY-MM-DD */
  balanceDate: string;
  warnings: string[];
}

const str = { type: 'string' } as const;
const numT = { type: 'number' } as const;
const obj = (props: Record<string, unknown>) => ({ type: 'object', properties: props, required: Object.keys(props), additionalProperties: false });

function schema(debtIds: string[]) {
  return obj({
    kind: { type: 'string', enum: ['transactions', 'debt_status', 'payment_receipt', 'income', 'savings_balance', 'other'] },
    summary: str,
    bank: str,
    transactions: {
      type: 'array',
      items: obj({
        date: str, amount: numT, merchant: str,
        category: { type: 'string', enum: CATEGORIES.map(c => c.id) },
        direction: { type: 'string', enum: ['expense', 'income', 'own_transfer', 'debt_payment'] },
        card: { type: 'string', enum: ['debit', 'credit', 'unknown'] },
      }),
    },
    debts: { type: 'array', items: obj({ debtId: { type: 'string', enum: debtIds }, balance: numT, minPayment: numT, dueDate: str, limit: numT }) },
    payments: { type: 'array', items: obj({ debtId: { type: 'string', enum: debtIds }, amount: numT, date: str }) },
    incomes: { type: 'array', items: obj({ kind: { type: 'string', enum: ['salary', 'bonusMonthly', 'advance', 'bonusQuarter', 'bonusYear', 'vacation', 'thirteenth', 'other'] }, amount: numT, date: str }) },
    savingsBalance: numT,
    accountBalance: numT,
    balanceDate: str,
    warnings: { type: 'array', items: str },
  });
}

function systemPrompt(debts: Debt[], now: string): string {
  const list = debts.filter(d => !d.closed).map(d => `- ${d.id}: ${d.name}${d.limit ? `, лимит ${d.limit}` : ''}, остаток в приложении ${Math.round(d.balance)}, платёж до ${d.dueDay === 'last' ? 'последнего дня' : `${d.dueDay}-го`} числа`).join('\n');
  const cats = CATEGORIES.map(c => `- ${c.id}: ${c.name}`).join('\n');
  return `Ты разбираешь скриншоты и выписки из приложений российских банков для личного финансового приложения «Курс». Сегодня ${now}.

Определи, что на изображении, и верни только то, что на нём действительно видно:
- transactions — список операций (покупки, переводы, зачисления). Дата YYYY-MM-DD: «Сегодня», «Вчера», заголовки вида «22 октября» переводи в даты; год текущий, если не указан, кроме дат в будущем — тогда прошлый. Сумма — положительное число.
  direction: expense — покупка или оплата услуг; income — зачисление зарплаты, премии, аванса, отпускных; own_transfer — перевод между своими счетами, «Перевод себе», пополнение накопительного счёта, снятие наличных себе; debt_payment — погашение кредита, кредитной карты, Сплита, рассрочки.
  card: credit — операция по кредитной карте или Сплиту (по названию карты/счёта, «Кредитная карта», «Платинум», «Сплит»); debit — дебетовая или зарплатная карта; unknown — непонятно.
- debts — экран кредитной карты, кредита или Сплита: текущая задолженность (balance — полная сумма к погашению, включая проценты, если её видно), минимальный/обязательный платёж, дата платежа (YYYY-MM-DD), лимит. Неизвестное число — 0, неизвестная дата — пустая строка.
- payments — подтверждение платежа по долгу (чек, «Платёж выполнен», погашение в истории).
- incomes — поступления зарплаты (salary, ~10-го), премии за месяц (bonusMonthly, ~15-го), аванса (advance, ~25-го), квартальной (bonusQuarter) или годовой (bonusYear) премии, отпускных (vacation), 13-й зарплаты (thirteenth).
- savingsBalance — баланс накопительного (сберегательного) счёта — это резерв, иначе 0.
- accountBalance и balanceDate — остаток на зарплатной (дебетовой) карте или текущем счёте: исходящий остаток выписки на дату конца периода или баланс на экране карты. Не видно — 0 и пустая строка.
Выписка PDF может быть длинной: перечисли в transactions все операции за период, без пропусков.
- warnings — коротко по-русски: трата с кредитной карты, оформление новой рассрочки/кредита/«Долями»/Сплита, предложение повысить лимит, просрочка, комиссия, страховка или платные уведомления.

Долги в приложении (debtId):
${list || '- нет'}
Сопоставляй по банку и типу продукта. Если долг не из списка — не включай его в debts, а напиши об этом в warnings.

Категории трат:
${cats}
Правила категорий: Яндекс Go и такси — taxi; самокаты, метро, автобусы, электрички — transport; столовые и кафе у работы — work; доставка еды, Самокат, Лавка, кафе, бары, кино, подарки — fun; супермаркеты — groceries; связь, DDX, подписки (Claude, Яндекс Плюс, VPN) — fixed.

${planConfig().aiHints ? `Особенности этого человека:\n${planConfig().aiHints}\n\n` : ''}summary — одна фраза по-русски: что на скриншоте и что предлагается обновить.`;
}

/** Уменьшаем снимок: длинная сторона до 1600 px, JPEG — быстрее и дешевле, текст читается */
export async function prepareImage(file: File): Promise<{ data: string; media: 'image/jpeg' | 'image/png' }> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  // длинные скриншоты: держим ширину читаемой, ограничиваем высоту лимитом API (8000 px)
  const w = Math.round(bmp.width * scale), h = Math.min(7900, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, Math.round(bmp.height * scale));
  const url = canvas.toDataURL('image/jpeg', 0.86);
  return { data: url.split(',')[1], media: 'image/jpeg' };
}

const toBase64 = async (file: File) => {
  const buf = new Uint8Array(await file.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
};

export class AiError extends Error {}

export async function analyze(opts: { files: File[]; apiKey: string; model: string; debts: Debt[]; now: string; note?: string }): Promise<AiResult> {
  const client = new Anthropic({ apiKey: opts.apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const f of opts.files) {
    if (f.type === 'application/pdf') {
      content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: await toBase64(f) } });
    } else {
      const img = await prepareImage(f);
      content.push({ type: 'image', source: { type: 'base64', media_type: img.media, data: img.data } });
    }
  }
  content.push({ type: 'text', text: opts.note?.trim() ? `Комментарий: ${opts.note.trim()}` : 'Разбери вложения.' });

  try {
    const stream = client.beta.messages.stream({
      model: opts.model,
      max_tokens: 32000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: schema(opts.debts.map(d => d.id)) } },
      system: systemPrompt(opts.debts, opts.now),
      messages: [{ role: 'user', content }],
    });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === 'refusal') throw new AiError('Claude отказался разбирать это изображение. Попробуйте другой скриншот.');
    if (msg.stop_reason === 'max_tokens') throw new AiError('Слишком много операций за раз. Разделите выписку на части.');
    const text = msg.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('');
    return JSON.parse(text) as AiResult;
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new AiError('Ключ API не подходит. Проверьте его в настройках.');
    if (e instanceof Anthropic.PermissionDeniedError) throw new AiError('Ключу не хватает прав или доступ из вашей страны закрыт.');
    if (e instanceof Anthropic.RateLimitError) throw new AiError('Слишком много запросов или закончился баланс API. Попробуйте позже.');
    if (e instanceof Anthropic.BadRequestError) throw new AiError(`Запрос отклонён: ${e.message}`);
    if (e instanceof Anthropic.APIConnectionError) throw new AiError('Нет связи с api.anthropic.com. Проверьте интернет или VPN.');
    if (e instanceof Anthropic.APIError) throw new AiError(`Ошибка сервиса Claude (${e.status ?? '—'}). Попробуйте ещё раз.`);
    if (e instanceof SyntaxError) throw new AiError('Ответ не удалось прочитать. Попробуйте ещё раз.');
    throw e;
  }
}

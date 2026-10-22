// Обмен с чатом «Финансы» в Claude: отчёт приложения для чата и инструкция для проекта,
// по которой чат отвечает обновлением плана в формате, который приложение умеет применить.
import { eventsBetween, type CalendarInput } from './calendar';
import { addDays, ddmm, ddmmyyyy, monthKey } from './dates';
import { rub } from './money';
import { CATEGORY, currentPhase, monthlyInterest, targetDebt, totalDebt } from './plan';
import { monthByCategory } from './summary';
import type { CardBalance, ChecklistItem, Debt, EventMark, Expense, WeekClosure, WishItem } from './types';

export interface ReportInput {
  now: string;
  cal: CalendarInput;
  debts: Debt[];
  marks: Record<string, EventMark>;
  expenses: Expense[];
  reserve: number;
  savings: number;
  cardBalance: CardBalance | null;
  closures: Record<string, WeekClosure>;
  checklist: ChecklistItem[];
  checks: Record<string, { done: boolean; at: string }>;
  wishes: WishItem[];
}

const n = (v: number) => rub(v).replace(/ /g, ' ').replace(/ /g, ' ');

/** Отчёт в Markdown: чат читает его как файл проекта или вложение и видит актуальное состояние */
export function buildReport(r: ReportInput): string {
  const phase = currentPhase(r.debts, r.now);
  const target = targetDebt(r.debts);
  const open = r.debts.filter(d => !d.closed).sort((a, b) => a.order - b.order);
  const next = eventsBetween(r.cal, r.now, addDays(r.now, 45));
  const past = eventsBetween(r.cal, addDays(r.now, -45), addDays(r.now, -1));
  const lines: string[] = [];
  lines.push(`# «Курс» — состояние на ${ddmmyyyy(r.now)}`, '');
  lines.push('Отчёт выгружен из приложения «Курс». Используй его как самые свежие данные: они новее аудита.', '');
  lines.push('## Сводка', '');
  lines.push(`- Общий долг: ${n(totalDebt(r.debts))}; проценты ≈ ${n(monthlyInterest(r.debts))} в месяц`);
  lines.push(`- Этап ${phase.id} «${phase.title}»: на жизнь ${n(phase.monthly)} в месяц, ${n(phase.weekly)} в неделю`);
  if (target) lines.push(`- Целевой долг: ${target.short}`);
  lines.push(`- Резерв: ${n(r.reserve)}; копилка недельных остатков: ${n(r.savings)}`);
  if (r.cardBalance) lines.push(`- Зарплатная карта: ${n(r.cardBalance.amount)} на ${ddmm(r.cardBalance.date)}`);
  lines.push('', '## Долги', '', '| Долг | Остаток | Ставка | Обновлён |', '|---|---|---|---|');
  for (const d of open) lines.push(`| ${d.short} (id: ${d.id}) | ${n(d.balance)} | ${(d.rate * 100).toFixed(1)}% | ${d.updatedAt ? ddmm(d.updatedAt.slice(0, 10)) : '—'} |`);
  const closed = r.debts.filter(d => d.closed);
  if (closed.length) lines.push('', `Закрыты: ${closed.map(d => `${d.short}${d.closedOn ? ` (${ddmm(d.closedOn)})` : ''}`).join(', ')}.`);

  lines.push('', '## Платежи и поступления за 45 дней', '');
  for (const e of past.filter(e => e.kind !== 'weekly')) {
    const m = r.marks[e.key];
    lines.push(`- ${ddmm(e.date)} ${e.title}: ${m?.done ? `${e.kind === 'income' ? 'пришло' : 'оплачено'} ${n(m.amount ?? e.amount)}` : `НЕ ОТМЕЧЕНО (ожидалось ${n(e.amount)})`}`);
  }
  lines.push('', '## Ближайшие 45 дней', '');
  for (const e of next.filter(e => e.kind !== 'weekly')) {
    const m = r.marks[e.key];
    lines.push(`- ${ddmm(e.date)} ${e.title}: ${e.kind === 'income' ? '+' : '−'}${n(e.amount)}${m?.done ? ' (уже отмечено)' : ''}`);
  }

  const weeks = Object.values(r.closures).sort((a, b) => b.monday.localeCompare(a.monday)).slice(0, 8);
  if (weeks.length) {
    lines.push('', '## Итоги недель', '', '| Неделя | Лимит | Потрачено | Остаток | В копилку |', '|---|---|---|---|---|');
    for (const w of weeks) lines.push(`| ${ddmm(w.monday)}–${ddmm(addDays(w.monday, 6))} | ${n(w.limit)} | ${n(w.spent)} | ${n(w.left)} | ${n(w.transferred)} |`);
  }

  for (const [title, month] of [['Траты этого месяца', monthKey(r.now)], ['Траты прошлого месяца', monthKey(addDays(`${monthKey(r.now)}-01`, -1))]] as const) {
    const rows = monthByCategory(r.expenses, r.debts, month).filter(x => x.spent > 0 || x.limit > 0);
    lines.push('', `## ${title}`, '', '| Категория | Потрачено | Лимит |', '|---|---|---|');
    for (const x of rows) lines.push(`| ${CATEGORY[x.id].name} | ${n(x.spent)} | ${n(x.limit)} |`);
  }

  const credit = r.expenses.filter(e => e.source === 'credit' && e.date >= addDays(r.now, -60));
  lines.push('', '## Нарушения и паузы', '');
  lines.push(credit.length ? `- Траты с кредиток за 60 дней: ${credit.length} на ${n(credit.reduce((s, e) => s + e.amount, 0))}` : '- Трат с кредиток за 60 дней нет');
  const skipped = r.wishes.filter(w => w.resolved === 'skipped');
  if (skipped.length) lines.push(`- Пауза 48 часов отменила покупки на ${n(skipped.reduce((s, w) => s + w.amount, 0))}`);

  if (r.checklist.length) {
    lines.push('', '## Чек-лист', '');
    for (const c of r.checklist) {
      const done = r.checks[c.id]?.done ?? c.done;
      lines.push(`- [${done ? 'x' : ' '}] ${c.title}${c.due ? ` (срок ${c.due})` : ''} — id: ${c.id}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

/** Текст для инструкций проекта «Финансы»: как читать отчёт и в каком виде отдавать обновление плана */
export const PROJECT_INSTRUCTIONS = `Ты ведёшь мой план выхода из долгов. У меня на iPhone приложение «Курс», которое считает недельный лимит, платежи, резерв и прогноз.

Как читать данные:
- Файлы «Курс — состояние на …» — свежие отчёты из приложения. Они новее аудита: всегда опирайся на самый поздний.
- Если отчёты расходятся с аудитом (остатки, даты, суммы), считай верными отчёты.

Когда я прошу «обнови план для приложения» или когда мы меняем стратегию, лимиты, чек-лист, даты или суммы платежей, в конце ответа дай один блок \`\`\`json с обновлением в таком формате (только изменившиеся поля, остальное не включай):

{
  "app": "kurs-plan",
  "version": 1,
  "date": "ГГГГ-ММ-ДД",
  "summary": "одной фразой, что меняется",
  "strategy": [{ "title": "Раздел", "text": "Абзацы через пустую строку, пункты с «- »" }],
  "checklist": [{ "id": "латиница-через-дефис", "title": "Что сделать", "due": "ГГГГ-ММ-ДД", "note": "пояснение" }],
  "rules": ["Правило 1", "Правило 2"],
  "phases": [{ "id": 1, "title": "Название", "monthly": 0, "weekly": 0, "shortfall": 0, "closes": ["…"], "premiums": "куда премии", "from": "ГГГГ-ММ", "to": "ГГГГ-ММ" }],
  "categories": { "groceries": { "limit": 0, "baseline": 0 } },
  "bonusRules": { "ГГГГ-ММ": { "targets": ["id долга"], "months": 3, "full": true, "note": "решение по премии этого месяца" } },
  "weeklyOverrides": [{ "from": "ГГГГ-ММ-ДД", "to": "ГГГГ-ММ-ДД", "amount": 0 }],
  "debts": [{ "id": "id долга из отчёта", "balance": 0, "rate": 0.5, "dueDay": 16, "minPayment": 0, "targetClose": "ГГГГ-ММ", "note": "…", "closed": false }],
  "fixed": [{ "id": "mts", "name": "МТС", "day": 8, "amount": 0, "from": "ГГГГ-ММ" }],
  "events": [{ "date": "ГГГГ-ММ-ДД", "title": "Разовый платёж", "amount": 0, "kind": "payment" }],
  "payments": [{ "debtId": "id долга", "month": "ГГГГ-ММ", "amount": 0, "date": "ГГГГ-ММ-ДД" }],
  "reserve": 0
}

Правила формата:
- Ставки — долей (54,5% → 0.545). Суммы — числа без пробелов и знака ₽.
- id долгов бери из отчёта приложения, не придумывай новые для существующих долгов.
- Категории трат: groceries, work, taxi, transport, health, shopping, beauty, tobacco, fun, fixed.
- "fixed" и "rules" заменяют список целиком — присылай полный список. "checklist" — тоже полный список.
- Ничего лишнего внутри блока: только JSON.`;

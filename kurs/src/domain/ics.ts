// Напоминания через календарь iPhone: файл .ics с событиями и будильниками.
// Веб-приложение не может само будить телефон по расписанию без сервера, а календарь напомнит надёжно.
// Повторная загрузка обновляет события с теми же UID, а не дублирует их.
import { addDays } from './dates';
import { rub } from './money';
import type { CalEvent } from './types';

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

/** Строки длиннее 75 байт переносятся по RFC 5545 */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > (parts.length ? 74 : 75)) { parts.push(cur); cur = ''; }
    cur += ch;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

export interface IcsOptions {
  hideAmounts: boolean;
  /** за сколько дней до платежа напомнить (0 — в день платежа) */
  remindDays: number[];
  /** ЧЧ:ММ */
  time: string;
  now?: Date;
}

export function buildIcs(events: CalEvent[], o: IcsOptions): string {
  const stamp = (o.now ?? new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const [hh, mm] = o.time.split(':').map(Number);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Kurs//RU', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Курс'];
  for (const e of events) {
    const money = o.hideAmounts ? '' : ` ${rub(e.amount, { approx: e.approx })}`;
    const title = e.kind === 'payment' ? `Курс: ${e.title}${money}` : e.kind === 'weekly' ? `Курс: долить карту жизни` : `Курс: ожидается ${e.title.toLowerCase()}${money}`;
    const start = e.date.replace(/-/g, '');
    const desc = e.kind === 'payment'
      ? `${e.dateMode === 'until' ? 'Внести до этой даты' : 'Дата платежа'}. Просрочка недопустима ни на день. Отметьте оплату в «Курсе».`
      : e.kind === 'weekly' ? 'Вечером долить карту жизни из резерва до недельного лимита: остаток недели остаётся на карте. Откройте «Курс» → «Закрыть неделю» — он посчитает сумму.'
      : 'Если это премия — в тот же день распределите её в «Курсе»: резерв, остальное в долг.';
    lines.push(
      'BEGIN:VEVENT',
      `UID:kurs-${e.key.replace(/[^a-zA-Z0-9-]/g, '-')}@kurs.local`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${addDays(e.date, 1).replace(/-/g, '')}`,
      fold(`SUMMARY:${esc(title)}`),
      fold(`DESCRIPTION:${esc(desc)}`),
      'TRANSP:TRANSPARENT',
    );
    // будильник для события на весь день: смещение от полуночи дня события
    const days = e.kind === 'payment' ? o.remindDays : [0];
    for (const d of [...new Set(days)].sort((a, b) => b - a)) {
      const minutes = hh * 60 + mm - d * 24 * 60;
      const sign = minutes < 0 ? '-' : '';
      const abs = Math.abs(minutes);
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', fold(`DESCRIPTION:${esc(title)}`), `TRIGGER:${sign}P${Math.floor(abs / 1440) ? `${Math.floor(abs / 1440)}D` : ''}T${Math.floor((abs % 1440) / 60)}H${abs % 60}M`, 'END:VALARM');
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR', '');
  return lines.join('\r\n');
}

export function downloadFile(name: string, content: string | Blob, type: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

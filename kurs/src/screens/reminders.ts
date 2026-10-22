// Напоминания: файл .ics для календаря iPhone и цифра на значке приложения.
import { eventsBetween } from '../domain/calendar';
import { addDays, addMonths, monthKey, today } from '../domain/dates';
import { buildIcs, downloadFile } from '../domain/ics';
import { alerts } from '../domain/summary';
import { useStore } from '../store/store';
import { toast } from '../store/ui';

/** Платежи, поступления и понедельники на полгода вперёд — одним файлом */
export function exportCalendar(months = 6) {
  const s = useStore.getState();
  const from = today();
  const to = `${addMonths(monthKey(from), months)}-01`;
  const events = eventsBetween(s, from, to).filter(e => !s.marks[e.key]?.done);
  const ics = buildIcs(events, { hideAmounts: s.settings.hideAmounts, remindDays: s.settings.remindDays, time: s.settings.remindTime });
  downloadFile('kurs-platezhi.ics', ics, 'text/calendar');
  s.setSettings({ lastIcsAt: new Date().toISOString() });
  toast('Откройте файл и нажмите «Добавить все»');
}

/** Цифра на значке: сколько платежей просрочено или подходит срок. Работает в установленном приложении после разрешения уведомлений. */
export function updateBadge() {
  const s = useStore.getState();
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  if (!s.settings.badge || !nav.setAppBadge) return;
  const now = today();
  const n = alerts({ cal: s, marks: s.marks, expenses: s.expenses, wishes: s.wishes, now, nowMs: Date.now(), lastBackupAt: addDays(now, 0), lastIcsAt: 'x' })
    .filter(a => a.tone === 'danger' || a.tone === 'warn').length;
  (n ? nav.setAppBadge(n) : nav.clearAppBadge?.())?.catch(() => {});
}

export async function enableBadge(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  const p = await Notification.requestPermission().catch(() => 'denied' as NotificationPermission);
  return p === 'granted';
}

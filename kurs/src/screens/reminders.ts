import { actionableEvent, eventsBetween } from '../domain/calendar';
import { addDays, addMonths, monthKey } from '../domain/dates';
import { DEFAULT_PREPARATION_TIME, moscowClock, paymentPreparations, preparationDue } from '../domain/funds';
import { buildIcs, calendarTest, downloadFile } from '../domain/ics';
import { ledger } from '../domain/ledger';
import { useStore } from '../store/store';
import { toast } from '../store/ui';

async function shareCalendar(name: string, ics: string) {
  const files = [new File([ics], name, { type: 'text/calendar' })];
  if (navigator.canShare?.({ files })) {
    try { await navigator.share({ files }); return true; }
    catch (error) { if (error instanceof DOMException && error.name === 'AbortError') return false; }
  }
  downloadFile(name, ics, 'text/calendar');
  return true;
}

export async function exportCalendar(months = 6) {
  const s = useStore.getState();
  const from = moscowClock().date;
  const to = `${addMonths(monthKey(from), months)}-01`;
  const events = eventsBetween(s, from, to).filter(e => !s.marks[e.key]?.done && actionableEvent(e));
  const led = ledger({ ...s, now: from });
  const groups = paymentPreparations(events, s.marks, led.heldForPayments, led.reserve);
  const ics = buildIcs(events, { hideAmounts: s.settings.hideAmounts, remindDays: s.settings.remindDays, time: s.settings.remindTime,
    preparation: { time: s.settings.preparationTime ?? DEFAULT_PREPARATION_TIME, groups } });
  if (!await shareCalendar('kurs-platezhi.ics', ics)) return;
  s.setSettings({ lastIcsAt: new Date().toISOString() });
  toast('Импортируйте файл в отдельный календарь «Курс»');
}

export async function exportCalendarTest() {
  if (await shareCalendar('kurs-test.ics', calendarTest())) toast('Импортируйте событие в Календарь. Сигнал запланирован через 3 минуты.');
}

export function updateBadge() {
  const s = useStore.getState();
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  if (!s.settings.badge || !nav.setAppBadge) { void nav.clearAppBadge?.().catch(() => {}); return; }
  if (!s.ready) return;
  const clock = moscowClock();
  const led = ledger({ ...s, now: clock.date });
  const n = paymentPreparations(eventsBetween(s, addDays(clock.date, -45), addDays(clock.date, 1)),
    s.marks, led.heldForPayments, led.reserve).filter(g => g.date <= clock.date || preparationDue(g, clock, s.settings.preparationTime ?? DEFAULT_PREPARATION_TIME)).length;
  (n ? nav.setAppBadge(n) : nav.clearAppBadge?.())?.catch(() => {});
}

export function reminderDiagnostics() {
  const mode = matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return { mode, worker: 'serviceWorker' in navigator, push: 'PushManager' in window,
    online: navigator.onLine, permission: 'Notification' in window ? Notification.permission : 'unavailable' as const };
}

export async function enableBadge(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  const p = await Notification.requestPermission().catch(() => 'denied' as NotificationPermission);
  return p === 'granted';
}

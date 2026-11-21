import { eventsBetween } from '../domain/calendar';
import { addDays, weekStart } from '../domain/dates';
import { DEFAULT_PREPARATION_TIME, moscowClock, needsPreparation, paymentPreparations, preparationInstant } from '../domain/funds';
import { ledger } from '../domain/ledger';
import { useStore } from '../store/store';
import { useUi } from '../store/ui';
import { reminderDiagnostics } from './reminders';

const endpoint = import.meta.env.VITE_KURS_PUSH_ENDPOINT?.replace(/\/$/, '');
const key = import.meta.env.VITE_KURS_PUSH_VAPID_PUBLIC_KEY;
export const pushConfigured = Boolean(endpoint?.startsWith('https://') && key);
const STORAGE = 'kurs:push';
type PushState = { installation: string; token: string; ids: Record<string, string>; sent?: string; latestSync?: string; scheduled?: number; remove?: boolean };

const read = (): PushState | null => {
  try { return JSON.parse(localStorage.getItem(STORAGE) ?? 'null'); } catch { return null; }
};
const write = (state: PushState) => localStorage.setItem(STORAGE, JSON.stringify(state));
export const pushEnabled = () => !!read() && !read()?.remove;

export async function paymentPushDiagnostics() {
  const state = read();
  const subscription = navigator.serviceWorker?.controller
    ? await (await navigator.serviceWorker.ready).pushManager?.getSubscription() : null;
  const fallback = { subscribed: Boolean(subscription), latestSync: state?.latestSync, scheduled: state?.scheduled, backend: 'unknown' };
  if (!state || state.remove || !pushConfigured || !navigator.onLine) return fallback;
  try {
    const response = await fetch(`${endpoint}/${state.installation}/schedule`, {
      headers: { Authorization: `Bearer ${state.token}` }, credentials: 'omit', cache: 'no-store',
      referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return { ...fallback, backend: 'unavailable' };
    const data = await response.json();
    return { ...fallback, backend: 'online',
      latestSync: typeof data.latestSync === 'string' ? data.latestSync : state.latestSync,
      scheduled: typeof data.scheduled === 'number' ? data.scheduled : state.scheduled };
  } catch { return { ...fallback, backend: 'unavailable' }; }
}

function request(name: string, state: PushState, body?: object) {
  return fetch(`${endpoint}/${state.installation}/${name}`, {
    method: body ? 'PUT' : 'DELETE', headers: { Authorization: `Bearer ${state.token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(8000),
  }).then(response => { if (!response.ok) throw new Error('Push endpoint unavailable'); });
}

export async function enablePaymentPush() {
  const status = reminderDiagnostics();
  if (!pushConfigured || !status.mode || !status.worker || !status.push || !status.online || !navigator.serviceWorker.controller) return false;
  try {
    if (await Notification.requestPermission() !== 'granted') return false;
    const registration = await navigator.serviceWorker.ready;
    const binary = atob(key.replace(/-/g, '+').replace(/_/g, '/'));
    const applicationServerKey = Uint8Array.from(binary, char => char.charCodeAt(0));
    await registration.pushManager.getSubscription() ??
      await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
    write({ installation: crypto.randomUUID(), token: crypto.randomUUID() + crypto.randomUUID(), ids: {} });
    await syncPaymentPush();
    return true;
  } catch {
    await disablePaymentPush().catch(() => {});
    return false;
  }
}

export async function disablePaymentPush() {
  const state = read();
  if (state) write({ ...state, remove: true });
  if (navigator.serviceWorker?.controller) {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager?.getSubscription();
    await subscription?.unsubscribe();
  }
  if (state && navigator.onLine && pushConfigured) {
    await request('schedule', state);
    localStorage.removeItem(STORAGE);
  }
}

let syncing = false;
let syncAgain = false;
export async function syncPaymentPush() {
  if (!pushConfigured || !navigator.onLine) return;
  if (syncing) { syncAgain = true; return; }
  const state = read();
  if (!state) return;
  syncing = true;
  try {
    if (state.remove || Notification.permission !== 'granted') { await disablePaymentPush(); return; }
    if (!navigator.serviceWorker.controller) return;
    const subscription = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if (!subscription) { await disablePaymentPush(); return; }
    const s = useStore.getState();
    if (!s.ready) return;
    const now = moscowClock().date;
    const time = s.settings.preparationTime ?? DEFAULT_PREPARATION_TIME;
    const events = eventsBetween(s, now, addDays(now, 46));
    const led = ledger({ ...s, now });
    const groups = paymentPreparations(events, s.marks, led.heldForPayments, led.reserve)
      .filter(needsPreparation);
    const dates = [
      ...groups.map(g => ({ localKey: JSON.stringify(g.events.map(event => event.key)), date: g.remindDate })),
      ...events.filter(event => event.kind === 'weekly' && !s.marks[event.key]?.done)
        .map(event => ({ localKey: JSON.stringify([event.key]), date: event.date })),
    ];
    const ids: Record<string, string> = {};
    const scheduled = dates.flatMap(({ localKey, date }) => {
      const instant = preparationInstant(date, time);
      if (Date.parse(instant) <= Date.now()) return [];
      const id = state.ids[localKey] ?? crypto.randomUUID();
      ids[localKey] = id;
      return [{ id, at: instant }]; // Account, amount, titles and localKey stay on the device.
    });
    const body = { subscription: subscription.toJSON(), scheduled };
    const serialized = JSON.stringify(body);
    if (serialized === state.sent) return;
    if (read()?.token !== state.token || read()?.remove) return;
    await request('schedule', state, body);
    if (read()?.token === state.token && !read()?.remove) write({ ...state, ids, sent: serialized, latestSync: new Date().toISOString(), scheduled: scheduled.length });
  } finally {
    syncing = false;
    if (syncAgain) { syncAgain = false; void syncPaymentPush().catch(() => {}); }
  }
}

export async function testPaymentPush() {
  const state = read();
  if (!pushConfigured || !state || state.remove || !navigator.onLine) return false;
  try { await request('test', state, { id: crypto.randomUUID() }); return true; }
  catch { return false; }
}

export function openPaymentReminder() {
  const url = new URL(location.href);
  const id = url.searchParams.get('reminder');
  const calendarKey = new URLSearchParams(url.hash.slice(1)).get('kurs-payment');
  if ((!id && !calendarKey) || !useStore.getState().ready) return;
  history.replaceState(null, '', url.pathname);
  const entry = Object.entries(read()?.ids ?? {}).find(([, opaqueId]) => opaqueId === id);
  const keys: string[] = calendarKey ? [calendarKey] : entry ? JSON.parse(entry[0]) : [];
  const today = moscowClock().date;
  const ui = useUi.getState();
  const s = useStore.getState();
  const events = eventsBetween(s, addDays(today, -10), addDays(today, 14)).filter(e => keys.includes(e.key) && !s.marks[e.key]?.done);
  const first = events[0];
  if (!first) return;
  if (first.kind === 'weekly') { ui.set({ week: weekStart(first.date) }); return; }
  const led = ledger({ ...s, now: today });
  const groups = paymentPreparations(events, s.marks, led.heldForPayments, led.reserve);
  if (groups.length === 1 && events.length > 1) ui.set({ transfer: { kind: 'payment', plan: groups[0] } });
  else ui.set({ event: first });
}

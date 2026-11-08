// Клиент фонового потока: запросы с кешем; пока считается новое — на экране остаётся прошлое.
import { useEffect, useState } from 'react';
import type { TodayData, PairData } from './engine/day';
import type { AstroEvent } from './engine/events';

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, (v: unknown) => void>();
const cache = new Map<string, unknown>();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; data?: unknown; error?: string }>) => {
      const res = pending.get(e.data.id);
      pending.delete(e.data.id);
      if (e.data.error) console.error(e.data.error);
      res?.(e.data.data);
    };
  }
  return worker;
}

function ask<T>(key: string, msg: Record<string, unknown>): Promise<T> {
  if (cache.has(key)) return Promise.resolve(cache.get(key) as T);
  return new Promise<T>(resolve => {
    const id = ++seq;
    pending.set(id, v => { cache.set(key, v); resolve(v as T); });
    getWorker().postMessage({ id, ...msg });
  });
}

export const askToday = (t: number) => ask<TodayData>('today' + t, { kind: 'today', t });
export const askPair = (t: number, eve: number) => ask<PairData>('pair' + t + ':' + eve, { kind: 'pair', t, eve });

const EV_KEY = 'astro-events-v1';
export async function askEvents(from: number): Promise<AstroEvent[]> {
  const day = new Date(from + 3 * 3600e3).toISOString().slice(0, 10);
  const stamp = `${__APP_VERSION__}:${day}`;
  try {
    const raw = localStorage.getItem(EV_KEY);
    if (raw) { const v = JSON.parse(raw); if (v.stamp === stamp) return v.data; }
  } catch { /* нет хранилища */ }
  const data = await ask<AstroEvent[]>('events' + day, { kind: 'events', from });
  try { localStorage.setItem(EV_KEY, JSON.stringify({ stamp, data })); } catch { /* переполнено */ }
  return data;
}

/** хук: последний готовый результат + признак «считается» */
export function useAsync<T>(key: string, run: () => Promise<T>): { data: T | undefined; busy: boolean } {
  const [state, setState] = useState<{ key: string; data: T | undefined }>({ key: '', data: undefined });
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    let live = true;
    setBusy(true);
    run().then(d => { if (live) { setState({ key, data: d }); setBusy(false); } });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { data: state.data, busy };
}

/** «прогрев»: соседние дни считаются заранее, чтобы листание было мгновенным */
export function prefetchToday(ts: number[]) { for (const t of ts) void askToday(t); }

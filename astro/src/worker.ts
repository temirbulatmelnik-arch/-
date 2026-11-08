// Все тяжёлые расчёты — в фоновом потоке, чтобы листание дат и анимации не подтормаживали.
import { today, pair } from './engine/day';
import { buildEvents } from './engine/events';

type Req = { id: number; kind: 'today'; t: number } | { id: number; kind: 'pair'; t: number; eve: number } | { id: number; kind: 'events'; from: number };

self.onmessage = (e: MessageEvent<Req>) => {
  const r = e.data;
  try {
    let data: unknown;
    if (r.kind === 'today') data = today(new Date(r.t));
    else if (r.kind === 'pair') data = pair(new Date(r.t), new Date(r.eve));
    else data = buildEvents(r.from);
    (self as unknown as Worker).postMessage({ id: r.id, data });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: r.id, error: String(err) });
  }
};

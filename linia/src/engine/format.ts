// Подписи доз и склонения.
import { EXERCISES } from './exercises';
import type { Item } from './program';
import { at } from './timeline';

/** Русское склонение: plural(5, 'день', 'дня', 'дней') → 'дней' */
export function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

/** Доза упражнения одной строкой: «10 × 10 с», «3 × 10 · пауза 3 с», «2 × 30 с на сторону» */
export function doseText(item: Item, stage = 0): string {
  const reps = at(item.reps, stage) ?? 1;
  const hold = at(item.hold, stage);
  const time = at(item.time, stage);
  const sets = item.sets ?? 1;
  const side = EXERCISES[item.ex].sided && !item.alternate ? ' на сторону' : '';
  const pre = sets > 1 ? `${sets} × ` : '';
  if (item.circuit) return `${sets} ${plural(sets, 'круг', 'круга', 'кругов')}: ${reps > 1 ? `${reps} × ` : ''}${hold} с каждое`;
  if (item.breaths) return `${item.breaths} медленных вдохов`;
  if (item.switchEvery && time) return `${Math.round(time / 60)} мин, смена стороны каждые ${item.switchEvery} с`;
  if (time !== undefined) return time >= 120 ? `${Math.round(time / 60)} мин` : `${pre}${time} с${side}`;
  if (item.quick) return `${reps} быстрых нажатий`;
  if (item.failure) return `${sets} × до потери техники, до ${hold} с`;
  if (item.tempo) {
    const top = hold ?? item.tempo[1];
    const count = sets > 1 ? `${reps}` : `${reps} ${plural(reps, 'повтор', 'повтора', 'повторов')}`;
    return `${pre}${count}${side}${top >= 2 ? ` · пауза ${top} с` : ''}`;
  }
  if (hold) return `${pre}${reps} × ${hold} с${side}${item.alternate ? ', стороны по очереди' : ''}`;
  return `${pre}${reps} ${plural(reps, 'повтор', 'повтора', 'повторов')}${side}`;
}

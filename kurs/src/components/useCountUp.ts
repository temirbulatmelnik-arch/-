// Число досчитывает до нового значения, когда сумма меняется (трата, выписка): видно, сколько ушло.
import { useEffect, useRef, useState } from 'react';

/** start — с какого числа досчитать при первом показе (по умолчанию сразу value) */
export function useCountUp(value: number, ms = 700, start?: number): number {
  const [shown, setShown] = useState(start ?? value);
  const from = useRef(start ?? value);
  useEffect(() => {
    const begin = from.current;
    if (begin === value) {
      from.current = value;
      setShown(value);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const v = begin + (value - begin) * (1 - (1 - k) ** 3);
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

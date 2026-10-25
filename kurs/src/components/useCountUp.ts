// Число досчитывает до нового значения, когда сумма меняется (трата, выписка): видно, сколько ушло.
import { useEffect, useRef, useState } from 'react';

export function useCountUp(value: number, ms = 700): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    if (start === value) {
      from.current = value;
      setShown(value);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const v = start + (value - start) * (1 - (1 - k) ** 3);
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

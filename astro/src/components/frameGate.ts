// Общие правила для живого фона: рисовать редко, не рисовать во время прокрутки, в фоне и при «Уменьшении движения».
// Прокрутка на iPhone — главный момент, когда нужен каждый кадр; фон в это время замирает.
let lastScroll = 0;
if (typeof window !== 'undefined') {
  addEventListener('scroll', () => { lastScroll = performance.now(); }, { passive: true });
  addEventListener('touchmove', () => { lastScroll = performance.now(); }, { passive: true });
}
export const scrollingNow = () => performance.now() - lastScroll < 350;
export const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** «экономный режим»: живой фон замирает (настройка в шапке, хранится на телефоне) */
let calm = false;
export const setCalm = (v: boolean) => { calm = v; listeners.forEach(f => f()); };
export const isCalm = () => calm;
const listeners = new Set<() => void>();
export const onCalmChange = (f: () => void) => { listeners.add(f); return () => listeners.delete(f); };

// Токены движения (навыки emil-design-eng, apple-design, motion-design): сильные кривые, пружины без отскока
// для интерфейса, лёгкий отскок — только после жеста. Небесные тела движутся медленнее и мягче интерфейса.
export const ease = { out: [0.23, 1, 0.32, 1], inOut: [0.77, 0, 0.175, 1], drawer: [0.32, 0.72, 0, 1] } as const;
export const snappy = { duration: 0.12, ease: ease.out } as const;
export const spring = { type: 'spring', bounce: 0, duration: 0.35 } as const;
export const fling = { type: 'spring', bounce: 0.18, duration: 0.5 } as const;
/** небесная механика: планеты переезжают на новые места не спеша */
export const celestial = { type: 'spring', bounce: 0, duration: 1.4 } as const;
export const soft = { type: 'spring', bounce: 0, duration: 0.6 } as const;

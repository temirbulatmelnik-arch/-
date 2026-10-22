// Модели Claude для разбора скриншотов. Отдельно от ai.ts: SDK грузится только при первом разборе.
export const MODELS = [
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', note: 'точнее всего, ≈ 3–5 ₽ за скриншот' },
  { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', note: 'быстрее и вдвое дешевле' },
  { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', note: 'самый дешёвый, может ошибаться в мелочах' },
];
export const DEFAULT_MODEL = MODELS[0].id;

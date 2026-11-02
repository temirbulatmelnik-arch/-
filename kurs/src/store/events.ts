// События интерфейса, которые запускают из любого места: салют над Невой (components/Salute.tsx).
export type SaluteSize = 'small' | 'big';
export const salute = (size: SaluteSize = 'small') => {
  try { window.dispatchEvent(new CustomEvent('kurs:salute', { detail: size })); } catch { /* вне браузера — тесты */ }
};

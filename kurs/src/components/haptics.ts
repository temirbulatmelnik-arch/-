// Тактильный щелчок, как у родных приложений iPhone: только в важные моменты — раскрылся веер, сработал свайп,
// запись сохранена, перелистнули страницу (навык apple-design: «haptics только для значимого»).
// В iOS 18+ веб-страница не может вызвать вибрацию напрямую, но переключатель <input switch> щёлкает при нажатии —
// нажатие на его подпись даёт тот же отклик. На Android — Vibration API. Где ни того ни другого нет — тишина.
let last = 0;

export function haptic(kind: 'tick' | 'success' = 'tick') {
  const now = Date.now();
  if (now - last < 40) return; // серия щелчков подряд сливается в один
  last = now;
  try {
    if (typeof navigator.vibrate === 'function' && !/iPhone|iPad/.test(navigator.userAgent)) {
      navigator.vibrate(kind === 'success' ? [10, 40, 14] : 8);
      return;
    }
    const label = document.createElement('label');
    label.ariaHidden = 'true';
    label.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    label.appendChild(input);
    document.head.appendChild(label);
    label.click();
    if (kind === 'success') window.setTimeout(() => label.click(), 90);
    window.setTimeout(() => label.remove(), 200);
  } catch { /* без отклика — не страшно */ }
}

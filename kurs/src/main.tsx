import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geologica';
import '@fontsource-variable/unbounded';
import './index.css';
import App from './App';
import { useUi } from './store/ui';

// страница открылась сама — флаг спасения от старого кеша «Тонуса» больше не нужен (vite.config.ts)
try { sessionStorage.removeItem('kurs-rescue'); } catch { /* нет доступа к хранилищу */ }

const render = () => createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
// демо-макет нового вида: вымышленный план вместо ввода кода
if (import.meta.env.VITE_DEMO) void import('./demo').then(m => { m.startDemo(); render(); });
else render();

// Проверяем обновление при запуске, возврате в приложение и восстановлении интернета.
if (!import.meta.env.VITE_NO_SW && 'serviceWorker' in navigator && window.isSecureContext && window.self === window.top) {
  const workers = navigator.serviceWorker;
  const url = new URL('./sw.js', window.location.href).href;
  let controller = workers.controller;

  workers.addEventListener('controllerchange', () => {
    const next = workers.controller;
    if (controller?.scriptURL === url && next?.scriptURL === url && next !== controller) {
      // Перезагрузка по кнопке сохраняет возможность закончить открытую форму.
      useUi.getState().set({ pwaUpdateReady: true });
    }
    controller = next;
  });

  void workers.register(url, { updateViaCache: 'none' }).then(registration => {
    const check = () => {
      if (document.visibilityState === 'visible') void registration.update().catch(() => {});
    };
    document.addEventListener('visibilitychange', check);
    window.addEventListener('pageshow', event => { if (event.persisted) check(); });
    window.addEventListener('online', check);
  }).catch(() => {});
}

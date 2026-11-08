import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/cormorant';
import '@fontsource-variable/manrope';
import '@fontsource/noto-sans-symbols/symbols-400.css';
import './index.css';
import App from './App';

// страница открылась сама — флаг спасения от старого кеша «Тонуса» больше не нужен (vite.config.ts)
try { sessionStorage.removeItem('astro-rescue'); } catch { /* нет доступа к хранилищу */ }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Офлайн: сервис-воркер кеширует приложение; новая версия включается, когда приложение уходит в фон.
if (!import.meta.env.VITE_NO_SW && 'serviceWorker' in navigator && window.isSecureContext && window.self === window.top) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    const update = registerSW({
      immediate: true,
      onNeedRefresh() {
        const apply = () => {
          if (document.visibilityState !== 'hidden') return;
          document.removeEventListener('visibilitychange', apply);
          void update(true);
        };
        document.addEventListener('visibilitychange', apply);
      },
    });
  }).catch(() => {});
}

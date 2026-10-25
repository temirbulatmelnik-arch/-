import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geologica';
import '@fontsource-variable/unbounded';
import './index.css';
import App from './App';

// страница открылась сама — флаг спасения от старого кеша «Тонуса» больше не нужен (vite.config.ts)
try { sessionStorage.removeItem('kurs-rescue'); } catch { /* нет доступа к хранилищу */ }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Офлайн-режим: сервис-воркер кеширует приложение. В превью собирается с VITE_NO_SW=1.
// Новая версия скачивается сразу, а включается, когда приложение уходит в фон: при следующем входе — уже она.
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

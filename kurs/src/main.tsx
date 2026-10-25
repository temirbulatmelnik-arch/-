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
if (!import.meta.env.VITE_NO_SW && 'serviceWorker' in navigator && window.isSecureContext && window.self === window.top) {
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true })).catch(() => {});
}

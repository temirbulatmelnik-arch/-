import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/manrope';
import '@fontsource-variable/cormorant-garamond';
import './index.css';
import App from './App';

// страница открылась сама — флаг спасения от старого кеша «Тонуса» больше не нужен (vite.config.ts)
try { sessionStorage.removeItem('linia-rescue'); } catch { /* нет доступа к хранилищу */ }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Офлайн-режим: сервис-воркер кеширует приложение. В песочницах (превью) регистрация не нужна и может падать;
// одностраничная сборка для превью собирается с VITE_NO_SW=1.
if (!import.meta.env.VITE_NO_SW && 'serviceWorker' in navigator && window.isSecureContext && window.self === window.top) {
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true })).catch(() => {});
}

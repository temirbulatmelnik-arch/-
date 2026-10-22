import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/jost';
import '@fontsource-variable/playfair-display';
import './index.css';
import App from './App';

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

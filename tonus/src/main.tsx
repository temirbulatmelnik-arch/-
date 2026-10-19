import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/golos-text';
import './index.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Офлайн-режим: сервис-воркер кеширует приложение. В песочницах (превью) регистрация не нужна и может падать.
if ('serviceWorker' in navigator && window.isSecureContext && window.self === window.top) {
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true })).catch(() => {});
}

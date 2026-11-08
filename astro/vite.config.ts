import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// «Астропрогноз» лежит в подпапке сайта «Тонуса». Офлайн-кеш «Тонуса» старых версий отдаёт на любой адрес сайта
// свою страницу, а она грузит скрипт по относительному пути — внутри /astro/ это astro/assets/main-….js.
// Под именами скриптов этих версий лежит этот файл: снимает старый кеш «Тонуса» и открывает «Астропрогноз» заново
// (тот же приём, что у «Линии» и «Курса»; D7Ly9c4F — версия «Тонуса», опубликованная перед «Астропрогнозом»).
const OLD_TONUS_SCRIPTS = ['Bn3U8i1d', 'D9wJjs2o', 'CNKNB8rP', 'D1bQ82hG', 'WQUPf_4J', 'BizCc0Vw', 'DxNG8Fr-', 'iPeDBITD', 'N36OuWRg', 'Bp15hiCJ', 'BF5Lr51Z', 'ByGrbDwf', 'Ci2ruGCU', 'BfktcWq2', 'D7Ly9c4F'];
const RESCUE = `(async () => {
  try { if (sessionStorage.getItem('astro-rescue')) return; sessionStorage.setItem('astro-rescue', '1'); } catch {}
  document.body.innerHTML = '<p style="font:17px system-ui;padding:32px;color:#aeb0dc;background:#0a0d2a;min-height:100vh;margin:0">Открываем «Мой астропрогноз»…</p>';
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.filter(r => !['/linia/', '/kurs/', '/astro/'].some(p => new URL(r.scope).pathname.includes(p))).map(r => r.unregister()));
  } catch {}
  location.reload();
})();
`;
function tonusRescue(): Plugin {
  return {
    name: 'astro-tonus-rescue',
    apply: 'build',
    generateBundle() {
      for (const h of OLD_TONUS_SCRIPTS) this.emitFile({ type: 'asset', fileName: `assets/main-${h}.js`, source: RESCUE });
    },
  };
}

// base: './' — приложение работает из любой папки сайта (GitHub Pages: …/astro/)
export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: { chunkSizeWarningLimit: 900 },
  worker: { format: 'es' },
  plugins: [
    tonusRescue(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Мой астропрогноз',
        short_name: 'Астропрогноз',
        description: 'Ежедневный прогноз по полному разбору двух карт. Все расчёты — на телефоне.',
        lang: 'ru',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0a0d2a',
        theme_color: '#0a0d2a',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'], globIgnores: ['**/assets/main-{' + OLD_TONUS_SCRIPTS.join(',') + '}.js'] },
    }),
  ],
  test: { environment: 'node' },
});

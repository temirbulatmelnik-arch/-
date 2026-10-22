import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };
import { buildWebClip } from './src/install/webclip.ts';

// Готовый профиль Web Clip рядом с сайтом — запасной путь, если загрузка из страницы установки не сработала.
// Нужен адрес сайта: SITE_URL=https://user.github.io/repo/kurs/ npm run build
function webClipProfile(): Plugin {
  return {
    name: 'kurs-webclip-profile',
    apply: 'build',
    async generateBundle() {
      const url = process.env.SITE_URL;
      if (!url) return;
      const icon = readFileSync('public/apple-touch-icon-180x180.png').toString('base64');
      this.emitFile({ type: 'asset', fileName: 'kurs.mobileconfig', source: await buildWebClip({ url, label: 'Курс', iconBase64: icon }) });
    },
  };
}

// «Курс» лежит в подпапке сайта «Тонуса». Офлайн-кеш «Тонуса» старых версий отдаёт на любой адрес сайта свою
// страницу, а она грузит скрипт по относительному пути — внутри /kurs/ это kurs/assets/main-….js.
// Под именами скриптов этих версий лежит этот файл: снимает старый кеш «Тонуса» и открывает «Курс» заново
// (тот же приём, что у «Линии»; D7Ly9c4F — версия, опубликованная перед появлением «Курса»).
const OLD_TONUS_SCRIPTS = ['Bn3U8i1d', 'D9wJjs2o', 'CNKNB8rP', 'D1bQ82hG', 'WQUPf_4J', 'BizCc0Vw', 'DxNG8Fr-', 'iPeDBITD', 'N36OuWRg', 'Bp15hiCJ', 'BF5Lr51Z', 'ByGrbDwf', 'Ci2ruGCU', 'BfktcWq2', 'D7Ly9c4F'];
const RESCUE = `(async () => {
  try { if (sessionStorage.getItem('kurs-rescue')) return; sessionStorage.setItem('kurs-rescue', '1'); } catch {}
  document.body.innerHTML = '<p style="font:17px system-ui;padding:32px;color:#5d6b66">Открываем «Курс»…</p>';
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.filter(r => !new URL(r.scope).pathname.includes('/kurs/') && !new URL(r.scope).pathname.includes('/linia/')).map(r => r.unregister()));
  } catch {}
  location.reload();
})();
`;
function tonusRescue(): Plugin {
  return {
    name: 'kurs-tonus-rescue',
    apply: 'build',
    generateBundle() {
      for (const h of OLD_TONUS_SCRIPTS) this.emitFile({ type: 'asset', fileName: `assets/main-${h}.js`, source: RESCUE });
    },
  };
}

// base: './' — приложение работает из любой папки (GitHub Pages, превью)
export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: process.env.VITE_NO_SW
      ? { input: { main: 'index.html' }, output: { inlineDynamicImports: true } }
      : { input: { main: 'index.html', install: 'install.html' } },
  },
  plugins: [
    webClipProfile(),
    tonusRescue(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Курс — план выхода из долгов',
        short_name: 'Курс',
        description: 'Недельный лимит, календарь платежей, премии в долг, разбор выписок и скриншотов.',
        lang: 'ru',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0e1311',
        theme_color: '#0e1311',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // seed.enc.json кешируется тоже: план открывается и без интернета
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'], globIgnores: ['**/assets/main-{' + OLD_TONUS_SCRIPTS.join(',') + '}.js'] },
    }),
  ],
  test: { environment: 'node' },
});

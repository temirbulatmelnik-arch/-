import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };
import { buildWebClip } from './src/install/webclip.ts';

// Готовый профиль Web Clip рядом с сайтом — запасной путь, если загрузка из страницы установки не сработала.
// Нужен адрес сайта: SITE_URL=https://user.github.io/repo/ npm run build
function webClipProfile(): Plugin {
  return {
    name: 'tonus-webclip-profile',
    apply: 'build',
    async generateBundle() {
      const url = process.env.SITE_URL;
      if (!url) return;
      const icon = readFileSync('public/apple-touch-icon-180x180.png').toString('base64');
      this.emitFile({ type: 'asset', fileName: 'tonus.mobileconfig', source: await buildWebClip({ url, label: 'Тонус', iconBase64: icon }) });
    },
  };
}

// base: './' — приложение работает из любой папки (GitHub Pages, флешка, артефакт)
export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    // одностраничное превью (VITE_NO_SW=1) собирается без страницы установки — она живёт на сайте
    chunkSizeWarningLimit: 1000, // three.js — отдельный ленивый модуль ~1 МБ
    rollupOptions: process.env.VITE_NO_SW
      ? { input: { main: 'index.html' }, output: { inlineDynamicImports: true } }
      : { input: { main: 'index.html', install: 'install.html' } },
  },
  plugins: [
    webClipProfile(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Тонус — тренер тазового дна',
        short_name: 'Тонус',
        description: 'Упражнения Кегеля для мышц тазового дна и анального сфинктера: таймер, подсказки, прогресс.',
        lang: 'ru',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0c0b0a',
        theme_color: '#0c0b0a',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // «Линия» лежит в подпапке того же сайта (/linia/) — офлайн-кеш «Тонуса» её не перехватывает
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,jpg,woff2,bin,json}'], navigateFallbackDenylist: [/\/linia\//] },
    }),
  ],
  test: { environment: 'node' },
});

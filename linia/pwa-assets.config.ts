import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

export default defineConfig({
  preset: { ...minimal2023Preset, maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#110d0b' } }, apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#110d0b' } } },
  images: ['public/favicon.svg'],
});

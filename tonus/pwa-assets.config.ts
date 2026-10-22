import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// значок без отступов: фон «оникс» уходит под маску iOS и Android, золото остаётся в безопасной зоне
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, padding: 0, resizeOptions: { background: '#0c0b0a' } },
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: { background: '#0c0b0a' } },
  },
  images: ['public/favicon.svg'],
});

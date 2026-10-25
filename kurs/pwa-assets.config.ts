import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// иконка — сцена во всю площадь (закат, разведённый Дворцовый мост), поэтому без полей
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, padding: 0, resizeOptions: { background: '#1a4a62' } },
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: { background: '#1a4a62' } },
  },
  images: ['public/favicon.svg'],
});

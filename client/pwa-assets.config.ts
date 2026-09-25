import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Regenerate the app icons from the logo: npx pwa-assets-generator
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#111834' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#111834' } },
  },
  images: ['public/favicon.svg'],
});

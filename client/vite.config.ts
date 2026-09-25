import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Installable app (phone home screen, desktop window) and an app-shell cache so
    // the site opens on a weak signal. Only the built shell is cached: API calls,
    // uploads and the WebSocket always go to the network, so a score is never stale.
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        // Generated into public/ from favicon.svg by pwa-assets.config.ts.
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        name: 'KickWick – Live Sports Tournaments',
        short_name: 'KickWick',
        description: 'Run football and cricket tournaments: registration, live scoring, TV scoreboards, tables and ground fees.',
        theme_color: '#070b1d',
        background_color: '#070b1d',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        categories: ['sports'],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/ws/, /^\/storage\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts', expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      // Laravel API (php artisan serve).
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true
      },
      // The real-time gateway (php artisan websocket:serve) listens on :4000.
      // The app opens ws://<host>:4000/ws directly, so this entry only covers
      // relative-path clients.
      '/ws': {
        target: 'ws://localhost:4000',
        ws: true
      }
    }
  }
});

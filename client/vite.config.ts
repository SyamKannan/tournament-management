import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
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

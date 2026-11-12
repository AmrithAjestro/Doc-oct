import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev only: /api and /uploads are forwarded to the Express server, so no CORS is involved.
const API_TARGET = process.env.VITE_PROXY_TARGET || 'http://localhost:5000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/uploads': { target: API_TARGET, changeOrigin: true }
    }
  }
});

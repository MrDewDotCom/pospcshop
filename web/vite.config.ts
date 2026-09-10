import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const apiTarget = `http://localhost:${process.env.PORT ?? 3300}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  server: {
    // Listen on all interfaces so phones on the shop WiFi can open the dev server.
    host: true,
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': apiTarget,
      '/uploads': apiTarget,
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});

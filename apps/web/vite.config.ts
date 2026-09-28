/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Read the root .env. Only VITE_* values reach the browser, so secrets stay on the server.
  envDir: '../..',
  server: {
    port: 5173,
    // In dev, Vite forwards /api to the API, so page and API look like one site (no CORS).
    // nginx does the same in Docker.
    proxy: { '/api': 'http://localhost:3000' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
});

/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Read VITE_* values from the repo-root .env, like the API does. Vite only exposes variables
  // that start with VITE_ to the browser, so JWT_SECRET and the database password never reach it.
  envDir: '../..',
  server: {
    port: 5173,
    // In dev the page and the API look like one origin: the browser calls /api on 5173 and Vite
    // forwards it. No CORS round trip, and the same relative URLs work behind nginx in 07.
    proxy: { '/api': 'http://localhost:3000' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
});

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: 'client',
  publicDir: '../public',
  build: { outDir: '../dist/public', emptyOutDir: true },
  server: { proxy: { '/api': 'http://localhost:3000' } },
  test: { root: '.', environment: 'jsdom', include: ['shared/**/*.test.ts', 'server/**/*.test.ts', 'client/**/*.test.tsx'] }
});

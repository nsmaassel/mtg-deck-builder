import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4200,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../../dist/apps/web',
    reportCompressedSize: true,
  },
  resolve: {
    alias: {
      '@mtg/collection': resolve(__dirname, '../../libs/collection/src/index.ts'),
      '@mtg/scryfall': resolve(__dirname, '../../libs/scryfall/src/index.ts'),
      '@mtg/edhrec': resolve(__dirname, '../../libs/edhrec/src/index.ts'),
      '@mtg/deck-builder': resolve(__dirname, '../../libs/deck-builder/src/index.ts'),
      '@mtg/ai-advisor': resolve(__dirname, '../../libs/ai-advisor/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/*.spec.tsx', 'src/**/*.spec.ts'],
    coverage: { provider: 'v8', reporter: ['text', 'lcov'] },
  },
});

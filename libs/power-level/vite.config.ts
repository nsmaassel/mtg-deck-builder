import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@mtg/deck-builder': resolve(__dirname, '../../libs/deck-builder/src/index.ts'),
      '@mtg/power-level': resolve(__dirname, '../../libs/power-level/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: { provider: 'v8', reporter: ['text', 'lcov'] },
  },
});

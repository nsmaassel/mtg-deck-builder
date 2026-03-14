import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
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
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: { provider: 'v8', reporter: ['text', 'lcov'] },
  },
});

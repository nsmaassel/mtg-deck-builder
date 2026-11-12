import { defineConfig } from 'vitest/config';
import { workspaceAliases } from '../../vitest.aliases';

export default defineConfig({
  resolve: { alias: workspaceAliases() },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: { provider: 'v8', reporter: ['text', 'lcov'] },
  },
});

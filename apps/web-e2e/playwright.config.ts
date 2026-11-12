import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './src',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: 'html',
  use: {
    // The API serves the built SPA too, so one server on any port is enough:
    //   E2E_BASE_URL=http://localhost:3000 npx playwright test
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:4200',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Don't auto-start servers — tests assume app is running
  // Run: pnpm serve:web & pnpm serve:api before e2e tests
  // The Commander Builder needs the card index: pnpm data:cards
});

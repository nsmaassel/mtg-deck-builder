import { test, expect } from '@playwright/test';
import { DeckBuilderPage } from '../pages/deck-builder.page';
import { readFileSync } from 'fs';
import { join } from 'path';

const sampleCollection = readFileSync(join(__dirname, '../fixtures/sample-collection.txt'), 'utf-8');

test.describe('Journey 8: Error States', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows error when submitting without collection', async ({ page }) => {
    const builder = new DeckBuilderPage(page);
    await builder.enterCommander("Atraxa, Praetors' Voice");
    await builder.submitBuild();
    // Should not navigate away or show deck — should show error
    await expect(builder.deckHeader()).not.toBeVisible();
    // The error banner should appear (App.tsx renders .error-banner with role="alert")
    await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 5000 });
  });

  test('shows error when submitting without commander', async ({ page }) => {
    const builder = new DeckBuilderPage(page);
    await builder.pasteCollection(sampleCollection);
    await builder.submitBuild();
    await expect(builder.deckHeader()).not.toBeVisible();
    await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 5000 });
  });

  test('shows error for completely invalid input', async ({ page }) => {
    const builder = new DeckBuilderPage(page);
    await builder.pasteCollection('this is not a valid collection at all');
    await builder.enterCommander("Atraxa, Praetors' Voice");
    await builder.submitBuild();
    // API returns 400 — UI should show the error-banner
    await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 15000 });
  });
});

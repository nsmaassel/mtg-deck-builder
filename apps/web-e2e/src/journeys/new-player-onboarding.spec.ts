import { test, expect } from '@playwright/test';
import { DeckBuilderPage } from '../pages/deck-builder.page';

test.describe('Journey 9: New Player Onboarding — Build Without a Collection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('@smoke @onboarding builds a 100-card deck with no collection', async ({ page }) => {
    const builder = new DeckBuilderPage(page);

    // Guide is visible for first-time users
    await expect(page.locator('.onboarding-guide')).toBeVisible();

    // Skip collection hides the textarea
    await builder.skipCollection();
    expect(await builder.collectionHidden()).toBe(true);

    // Owned-only mode is not offered to new players
    const modeOptions = await builder.modeSelect.locator('option').allTextContents();
    expect(modeOptions.some(t => /only my cards/i.test(t))).toBe(false);

    await builder.enterCommander('Krenko, Mob Boss');
    await builder.submitBuild();
    await builder.waitForDeck();

    await expect(builder.deckHeader()).toContainText('Krenko');
    await expect(builder.deckStats()).toContainText('100 cards');

    // Everything is unowned since no collection was provided
    const total = await builder.cardItems().count();
    const unowned = await builder.unownedCards().count();
    expect(unowned).toBe(total);
  });

  test('@regression @onboarding validates commander is required when skipping collection', async ({ page }) => {
    const builder = new DeckBuilderPage(page);
    await builder.skipCollection();
    await builder.submitBuild();
    await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[role="alert"]')).toContainText(/commander/i);
  });

  test('@regression @onboarding unchecking skip restores the collection textarea', async ({ page }) => {
    const builder = new DeckBuilderPage(page);
    await builder.skipCollection();
    expect(await builder.collectionHidden()).toBe(true);

    await page.uncheck('input[type=checkbox]');
    await expect(builder.collectionInput).toBeVisible();
  });
});

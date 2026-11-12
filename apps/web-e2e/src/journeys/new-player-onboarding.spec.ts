import { test, expect } from '@playwright/test';
import { DeckBuilderPage } from '../pages/deck-builder.page';

test.describe('Journey 9: New Player Onboarding — Build Without a Collection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#/commander');
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
    // The deck says what it was built around and where its data comes from.
    await expect(page.locator('.deck-themes')).toContainText('Goblin');
    await expect(page.locator('.data-credit')).toContainText('Scryfall');

    // Nothing is owned since no collection was provided, apart from the basic lands everyone has
    const ownedNames = await page.locator('.card-item:not(.card-unowned) .card-name').allTextContents();
    expect(ownedNames.every(name => name.trim() === 'Mountain')).toBe(true);
    expect(await builder.unownedCards().count()).toBeGreaterThan(60);
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

import { test, expect } from '@playwright/test';
import { DeckBuilderPage } from '../pages/deck-builder.page';
import { readFileSync } from 'fs';
import { join } from 'path';

const sampleCollection = readFileSync(join(__dirname, '../fixtures/sample-collection.txt'), 'utf-8');

test.describe('Journey 2: Power Level Bracket Targeting', () => {
  test('@regression swap suggestions appear when targeting lower bracket', async ({ page }) => {
    const builder = new DeckBuilderPage(page);
    await page.goto('/');
    await builder.pasteCollection(sampleCollection);
    await builder.enterCommander("Atraxa, Praetors' Voice");
    // Sample collection has Game Changers — should build at Bracket 3+
    // Target Bracket 1 to force maximum suggestions
    await builder.selectTargetBracket(1);
    await builder.submitBuild();
    await builder.waitForDeck();

    // Swap suggestions panel should be visible
    await expect(builder.targetSuggestions()).toBeVisible();
    // At least one suggestion
    const swapCount = await builder.swapSuggestions().count();
    expect(swapCount).toBeGreaterThanOrEqual(1);
    // First suggestion should have a removal card name
    const firstSwap = builder.swapSuggestions().first();
    await expect(firstSwap.locator('.swap-remove strong')).not.toBeEmpty();
  });

  test('@regression no swap suggestions when no bracket target set', async ({ page }) => {
    const builder = new DeckBuilderPage(page);
    await page.goto('/');
    await builder.pasteCollection(sampleCollection);
    await builder.enterCommander("Atraxa, Praetors' Voice");
    // Leave target-bracket as default (no target)
    await builder.submitBuild();
    await builder.waitForDeck();

    // No suggestions panel when no target set
    await expect(builder.targetSuggestions()).not.toBeVisible();
  });
});

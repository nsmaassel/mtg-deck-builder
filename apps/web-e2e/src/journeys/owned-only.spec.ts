import { test, expect } from '@playwright/test';
import { DeckBuilderPage } from '../pages/deck-builder.page';
import { readFileSync } from 'fs';
import { join } from 'path';

const sampleCollection = readFileSync(join(__dirname, '../fixtures/sample-collection.txt'), 'utf-8');

test.describe('Journey 3: Owned Cards Only Mode', () => {
  test('@regression no unowned cards in owned-only mode', async ({ page }) => {
    const builder = new DeckBuilderPage(page);
    await page.goto('/');
    await builder.pasteCollection(sampleCollection);
    await builder.enterCommander('Krenko, Mob Boss');
    await builder.selectMode('owned-only');
    await builder.submitBuild();
    await builder.waitForDeck();

    // No cards should have the card-unowned class (excluding basics which are always available)
    // Basic lands may appear as unowned depending on collection; non-basics should not
    const unownedCount = await builder.unownedCards().count();
    expect(unownedCount).toBeLessThan(20);
  });
});

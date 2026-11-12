import { test, expect } from '@playwright/test';
import { DeckBuilderPage } from '../pages/deck-builder.page';
import { readFileSync } from 'fs';
import { join } from 'path';

const sampleCollection = readFileSync(join(__dirname, '../fixtures/sample-collection.txt'), 'utf-8');

test.describe('Journey 3: Owned Cards Only Mode', () => {
  test('@regression no unowned cards in owned-only mode', async ({ page }) => {
    const builder = new DeckBuilderPage(page);
    await page.goto('/#/commander');
    await builder.pasteCollection(sampleCollection);
    await builder.enterCommander('Krenko, Mob Boss');
    await builder.selectMode('owned-only');
    await builder.submitBuild();
    await builder.waitForDeck();

    // Every card comes from the collection; basic lands count as owned
    await expect(builder.unownedCards()).toHaveCount(0);
  });
});

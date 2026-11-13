import { test, expect } from '@playwright/test';
import { DeckBuilderPage } from '../pages/deck-builder.page';
import { readFileSync } from 'fs';
import { join } from 'path';

const sampleCollection = readFileSync(join(__dirname, '../fixtures/sample-collection.txt'), 'utf-8');

test.describe('Journey 2: Power Level Bracket Targeting', () => {
  test('@regression a build aimed at a lower bracket says what it left out', async ({ page }) => {
    const builder = new DeckBuilderPage(page);
    await page.goto('/#/commander');
    await builder.pasteCollection(sampleCollection);
    await builder.enterCommander("Atraxa, Praetors' Voice");
    // Sample collection has Game Changers — builds at Bracket 3+ with no target
    await builder.selectTargetBracket(2);
    await builder.submitBuild();
    await builder.waitForDeck();

    // The build is steered to the bracket and names what it changed to get there
    const tuning = page.locator('.bracket-tuning');
    await expect(tuning).toBeVisible();
    await expect(tuning).toContainText('Bracket 2');
    await expect(tuning.locator('.tuning-left-out strong').first()).not.toBeEmpty();
  });

  test('@regression no swap suggestions when no bracket target set', async ({ page }) => {
    const builder = new DeckBuilderPage(page);
    await page.goto('/#/commander');
    await builder.pasteCollection(sampleCollection);
    await builder.enterCommander("Atraxa, Praetors' Voice");
    // Leave target-bracket as default (no target)
    await builder.submitBuild();
    await builder.waitForDeck();

    // No suggestions panel when no target set
    await expect(builder.targetSuggestions()).not.toBeVisible();
    await expect(page.locator('.bracket-tuning')).not.toBeVisible();
  });
});

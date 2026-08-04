import { test, expect } from '@playwright/test';
import { DeckBuilderPage } from '../pages/deck-builder.page';
import { readFileSync } from 'fs';
import { join } from 'path';

const minimalCollection = readFileSync(join(__dirname, '../fixtures/minimal-collection.txt'), 'utf-8');

test.describe('Journey 5: Gap Analysis', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('@regression shows the missing-staples section for a small collection', async ({ page }) => {
    const builder = new DeckBuilderPage(page);
    await builder.buildDeck(minimalCollection, 'Krenko, Mob Boss');

    await expect(builder.gapsSection()).toBeVisible();
    await expect(builder.gapsSection()).toContainText('Missing Staples');
  });
});
import { test, expect } from '@playwright/test';
import { DeckBuilderPage } from '../pages/deck-builder.page';
import { readFileSync } from 'fs';
import { join } from 'path';

const sampleCollection = readFileSync(join(__dirname, '../fixtures/sample-collection.txt'), 'utf-8');

test.describe('Journey 1: Core Deck Build — Happy Path', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('@smoke builds a 100-card deck for Atraxa', async ({ page }) => {
    const builder = new DeckBuilderPage(page);
    await builder.buildDeck(sampleCollection, "Atraxa, Praetors' Voice");

    // Commander name shown
    await expect(builder.deckHeader()).toContainText('Atraxa');

    // Stats show 100 cards
    await expect(builder.deckStats()).toContainText('100 cards');

    // Power level badge is present
    await expect(builder.powerLevelBadge()).toBeVisible();
    await expect(builder.bracketLabel()).toContainText('Bracket');
    await expect(builder.powerScore()).toContainText('/10');

    // Deck has at least 6 slots
    const slotCount = await builder.slotSections().count();
    expect(slotCount).toBeGreaterThanOrEqual(6);
    await expect(builder.slotSections().first()).toBeVisible();
  });

  test('@regression deck card count is exactly 100', async ({ page }) => {
    const builder = new DeckBuilderPage(page);
    await builder.buildDeck(sampleCollection, "Atraxa, Praetors' Voice");
    await expect(builder.deckStats()).toContainText('100 cards');
  });

  test('@regression power level signals are shown for collection with Game Changers', async ({ page }) => {
    const builder = new DeckBuilderPage(page);
    await builder.buildDeck(sampleCollection, "Atraxa, Praetors' Voice");
    // Collection has Rhystic Study (Game Changer) — should show signal chip
    const signalText = await builder.signalChips().allTextContents();
    expect(signalText.some(t => t.includes('Game Changer') || t.includes('Tutor'))).toBe(true);
  });

  test('@regression gap analysis section is shown for small collection', async ({ page }) => {
    const builder = new DeckBuilderPage(page);
    const minimalCollection = readFileSync(join(__dirname, '../fixtures/minimal-collection.txt'), 'utf-8');
    await builder.buildDeck(minimalCollection, 'Krenko, Mob Boss');
    // With a tiny collection, many cards are unowned
    await expect(builder.gapsSection()).toBeVisible();
  });
});

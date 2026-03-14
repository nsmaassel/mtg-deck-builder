import type { Page, Locator } from '@playwright/test';

/**
 * Page Object for the MTG Deck Builder web app.
 * Encapsulates all selectors and interactions so tests read like user stories.
 */
export class DeckBuilderPage {
  readonly collectionInput: Locator;
  readonly commanderInput: Locator;
  readonly modeSelect: Locator;
  readonly targetBracketSelect: Locator;
  readonly buildButton: Locator;
  readonly budgetInput: Locator;

  constructor(private readonly page: Page) {
    this.collectionInput = page.locator('#collection');
    this.commanderInput = page.locator('#commander');
    this.modeSelect = page.locator('#mode');
    this.targetBracketSelect = page.locator('#target-bracket');
    this.buildButton = page.locator('.build-btn');
    this.budgetInput = page.locator('#budget-price');
  }

  async goto() {
    await this.page.goto('/');
  }

  async pasteCollection(collectionText: string) {
    await this.collectionInput.fill(collectionText);
  }

  async enterCommander(name: string) {
    await this.commanderInput.fill(name);
  }

  async selectMode(mode: 'prefer-owned' | 'owned-only' | 'budget') {
    await this.modeSelect.selectOption(mode);
  }

  async selectTargetBracket(bracket: 1 | 2 | 3 | 4 | 5) {
    await this.targetBracketSelect.selectOption(String(bracket));
  }

  async setBudget(amount: number) {
    await this.budgetInput.fill(String(amount));
  }

  async submitBuild() {
    await this.buildButton.click();
  }

  // Result accessors
  deckHeader() { return this.page.locator('.deck-header h2'); }
  deckStats() { return this.page.locator('.deck-stats'); }
  powerLevelBadge() { return this.page.locator('.power-level-badge'); }
  bracketLabel() { return this.page.locator('.bracket-label'); }
  powerScore() { return this.page.locator('.power-score'); }
  signalChips() { return this.page.locator('.signal-chip'); }
  targetSuggestions() { return this.page.locator('.target-suggestions'); }
  swapSuggestions() { return this.page.locator('.swap-suggestion'); }
  slotSections() { return this.page.locator('.slot-section'); }
  cardItems() { return this.page.locator('.card-item'); }
  unownedCards() { return this.page.locator('.card-item.card-unowned'); }
  gapsSection() { return this.page.locator('.gaps-section'); }
  explainButton() { return this.page.locator('.explain-btn'); }
  errorMessage() { return this.page.locator('.error-banner, [role="alert"], .error-message'); }

  async waitForDeck() {
    // Wait for deck header to appear (indicates build completed)
    await this.deckHeader().waitFor({ timeout: 30_000 });
  }

  async buildDeck(collection: string, commanderName: string) {
    await this.pasteCollection(collection);
    await this.enterCommander(commanderName);
    await this.submitBuild();
    await this.waitForDeck();
  }
}

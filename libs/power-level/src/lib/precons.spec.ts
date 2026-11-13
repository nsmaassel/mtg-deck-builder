import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import type { DeckAnalysis, DeckCard, DeckList, SlotName } from '@mtg/deck-builder';
import { assessPowerLevel } from './analyzer';
import type { ComboResult } from './combos';

/**
 * Wizards' own preconstructed Commander decks, as the reference the
 * assessment is held to. `scripts/eval-brackets.ts --fixtures` writes the
 * file from MTGJSON's decklists and our card data; rerun it when the rules
 * change on purpose and read the difference.
 */
interface Fixture {
  name: string;
  set: string;
  released: string;
  bracket: number;
  averageCmc: number;
  averagePopularityPercent: number;
  /** name, slot, mana value, then `G` for a Game Changer and any traits. */
  cards: Array<[string, SlotName, number, ...string[]]>;
  combos: ComboResult[];
}

const { decks } = JSON.parse(readFileSync(join(__dirname, '__fixtures__/precons.json'), 'utf8')) as { decks: Fixture[] };

function assess(fixture: Fixture) {
  const cards = fixture.cards.map(([name, slot, cmc, ...flags]): DeckCard => {
    const traits = flags.filter(flag => flag !== 'G') as NonNullable<DeckCard['traits']>;
    return {
      name, slot, cmc, quantity: 1, ownedInCollection: false, popularity: 0, synergy: 0, score: 0, type_line: '', reasons: [],
      ...(flags.includes('G') ? { gameChanger: true } : {}),
      ...(traits.length > 0 ? { traits } : {}),
    };
  });
  const slots: Record<SlotName, DeckCard[]> = { ramp: [], draw: [], interaction: [], winConditions: [], synergy: [], lands: [], flex: [] };
  for (const card of cards.slice(1)) slots[card.slot].push(card);
  const deck: DeckList = { commander: cards[0]!, slots, totalCards: cards.length };
  const analysis: DeckAnalysis = {
    commanderName: cards[0]!.name,
    manaCurve: {},
    colorDistribution: {},
    averageCmc: fixture.averageCmc,
    topPicksCoveragePercent: 0,
    averagePopularityPercent: fixture.averagePopularityPercent,
    themes: [],
  };
  return assessPowerLevel(deck, analysis, undefined, undefined, fixture.combos);
}

describe('preconstructed Commander decks', () => {
  it('has a deck for every year since 2020 and for each kind of rule', () => {
    expect(decks.length).toBeGreaterThanOrEqual(10);
    expect(new Set(decks.map(deck => deck.released.slice(0, 4))).size).toBeGreaterThanOrEqual(7);
  });

  it.each(decks.map(deck => [deck.name, deck.set, deck] as const))('%s (%s) rates as recorded', (_name, _set, fixture) => {
    expect(assess(fixture).bracket).toBe(fixture.bracket);
  });

  it('never calls a precon cEDH, and puts none above Bracket 2 on our estimate alone', () => {
    for (const fixture of decks) {
      const power = assess(fixture);
      expect(power.bracket, fixture.name).toBeLessThan(5);
      if (power.bracket > 2) {
        // Something in the box does it: a Game Changer, a combo, land denial or extra turns. Each names its cards.
        expect(power.findings[0], fixture.name).toMatchObject({ basis: 'rule', bracket: power.bracket });
      }
    }
  });

  it('rates the ordinary precon of each year since 2020 as Bracket 2', () => {
    const plain = decks.filter(deck => deck.bracket <= 2);
    expect(plain.length).toBeGreaterThanOrEqual(6);
    for (const fixture of plain) expect(assess(fixture).bracket, fixture.name).toBe(2);
  });
});

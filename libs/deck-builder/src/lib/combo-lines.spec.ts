import { describe, it, expect } from 'vitest';
import { ComboIndex, CombosBuilder } from '@mtg/combos';
import { buildCommanderTestIndex } from '@mtg/commander-recs/testing';
import { buildDeckForCommander } from './candidates';
import { comboLines } from './combo-lines';

const index = buildCommanderTestIndex();
const id = (name: string) => index.byName(name)!.oracleId;

interface Spec {
  id: string;
  cards: string[];
  commander?: string;
  requires?: string;
}

function combosOf(specs: Spec[]): ComboIndex {
  const builder = new CombosBuilder(index);
  for (const spec of specs) {
    builder.add({
      id: spec.id,
      status: 'OK',
      uses: spec.cards.map(name => ({ card: { name, oracleId: id(name) }, quantity: 1, mustBeCommander: name === spec.commander })),
      requires: spec.requires ? [{ template: { name: spec.requires }, quantity: 1 }] : [],
      produces: [{ feature: { name: 'Infinite mana', status: 'S' } }],
      identity: 'R',
      popularity: 100,
    });
  }
  return ComboIndex.fromFile(builder.build({ timestamp: '2026-11-12T00:00:00Z', version: 'test' }));
}

describe('comboLines', () => {
  const { deck } = buildDeckForCommander(index, index.byName('Krenko, Mob Boss')!, new Map());
  const inDeck = new Set(Object.values(deck.slots).flat().map(card => card.name));

  it('builds on a deck that holds the cards the cases below lean on', () => {
    for (const name of ['Sol Ring', 'Impact Tremors', 'Goblin Matron', 'Skirk Prospector']) expect(inDeck.has(name)).toBe(true);
    expect(inDeck.has('Counterspell')).toBe(false);
  });

  it('finds the combos whose cards are all in the deck, by name and size', () => {
    const combos = combosOf([
      { id: 'in', cards: ['Sol Ring', 'Impact Tremors'] },
      { id: 'three', cards: ['Sol Ring', 'Goblin Matron', 'Skirk Prospector'] },
      { id: 'half', cards: ['Sol Ring', 'Counterspell'] },
    ]);
    expect(comboLines(index, combos, deck)).toEqual([
      { id: 'in', uses: ['Sol Ring', 'Impact Tremors'], cardCount: 2, produces: ['Infinite mana'] },
      { id: 'three', uses: ['Sol Ring', 'Goblin Matron', 'Skirk Prospector'], cardCount: 3, produces: ['Infinite mana'] },
    ]);
  });

  it('leaves out a combo that needs more than its named cards', () => {
    const combos = combosOf([{ id: 'needs-outlet', cards: ['Sol Ring', 'Impact Tremors'], requires: 'Sacrifice outlet' }]);
    expect(comboLines(index, combos, deck)).toEqual([]);
  });

  it('counts a combo that needs its commander only when that card leads the deck', () => {
    const combos = combosOf([
      { id: 'led', cards: ['Krenko, Mob Boss', 'Sol Ring'], commander: 'Krenko, Mob Boss' },
      { id: 'not-led', cards: ['Squee, Goblin Nabob', 'Sol Ring'], commander: 'Squee, Goblin Nabob' },
    ]);
    expect(inDeck.has('Squee, Goblin Nabob')).toBe(true);
    expect(comboLines(index, combos, deck).map(line => line.id)).toEqual(['led']);
  });
});

import { describe, it, expect } from 'vitest';
import { collectionCombos, deckCombos } from './combos';
import { parseDeckText } from './deck-text';
import { buildTestCombos, buildTestIndex, collectionOf, oracleId } from './testing/fixtures';

const index = buildTestIndex();
// Six made-up combos: see COMBOS in the fixtures for what each needs and where it is legal.
const combos = buildTestCombos(index);

const nothing = collectionOf({});
const ids = (list: { id: string }[]) => list.map(combo => combo.id);
const cards = (list: { card: { name: string } }[]) => list.map(entry => entry.card.name);

describe('deckCombos', () => {
  it('finds the combos a list holds every card of, with what they do and where the steps are', () => {
    const deck = parseDeckText('4 Opt\n4 Shock\n52 Mountain');
    const found = deckCombos(deck, 'standard', nothing, index, combos);

    expect(found.inDeckTotal).toBe(1);
    expect(found.inDeck).toEqual([
      {
        id: 'opt-shock',
        url: 'https://commanderspellbook.com/combo/opt-shock/',
        cards: [
          { oracleId: oracleId('Opt'), name: 'Opt', arenaRarity: 'common' },
          { oracleId: oracleId('Shock'), name: 'Shock', arenaRarity: 'common' },
        ],
        alsoNeeds: [],
        produces: ['Infinite damage', 'Infinite storm count', 'Infinite mana'],
        moreResults: 1,
        colors: ['U', 'R'],
        popularity: 500,
      },
    ]);
  });

  it('names the cards that would add a combo, inside the deck\'s colours and legal in the format', () => {
    const deck = parseDeckText('4 Opt\n4 Shock\n52 Mountain');
    const found = deckCombos(deck, 'standard', nothing, index, combos);

    // Duress would finish a blue-black combo and Brainstorm one that is not legal here; only the red one is on offer.
    expect(cards(found.oneCardAway)).toEqual(['Lightning Strike']);
    expect(found.oneCardAway[0]).toMatchObject({ owned: 0, finishes: 1 });
    expect(found.oneCardAway[0]!.combos[0]).toMatchObject({ id: 'shock-strike', alsoNeeds: ['2x Sacrifice outlet'] });

    expect(cards(deckCombos(deck, 'historic', nothing, index, combos).oneCardAway)).toEqual(['Brainstorm', 'Lightning Strike']);
  });

  it('puts a card the player already owns ahead of one to craft', () => {
    const deck = parseDeckText('4 Opt\n4 Shock\n4 Cut Down\n48 Swamp');
    const owned = collectionOf({ Duress: 2 });
    const found = deckCombos(deck, 'standard', owned, index, combos);

    expect(cards(found.oneCardAway)).toEqual(['Duress', 'Lightning Strike']);
    expect(found.oneCardAway[0]).toMatchObject({ owned: 2 });
  });

  it('counts a combo that needs its commander only when that card leads the list', () => {
    const led = parseDeckText('Commander\n1 Niv-Mizzet, Parun\n\nDeck\n1 Opt\n98 Island');
    expect(ids(deckCombos(led, 'brawl', nothing, index, combos).inDeck)).toEqual(['niv-opt']);

    const inTheNinetyNine = parseDeckText('Commander\n1 Tempest Angler\n\nDeck\n1 Niv-Mizzet, Parun\n1 Opt\n97 Island');
    expect(ids(deckCombos(inTheNinetyNine, 'brawl', nothing, index, combos).inDeck)).toEqual([]);
  });

  it('never offers the commander a combo needs as a card to add', () => {
    const deck = parseDeckText('Commander\n1 Tempest Angler\n\nDeck\n1 Opt\n98 Island');
    expect(cards(deckCombos(deck, 'brawl', nothing, index, combos).oneCardAway)).not.toContain('Niv-Mizzet, Parun');
  });
});

describe('collectionCombos', () => {
  const owned = collectionOf({ Opt: 4, Shock: 2, 'Sheoldred, the Apocalypse': 1 });

  it('lists the combos a collection holds and the cards that would finish the most', () => {
    const found = collectionCombos(owned, 'standard', index, combos);

    expect(found.ownedTotal).toBe(1);
    expect(ids(found.owned)).toEqual(['opt-shock']);
    // One combo each, so the most played combo decides the order.
    expect(cards(found.oneCardAway)).toEqual(['Go for the Throat', 'Duress', 'Lightning Strike']);
    expect(found.oneCardAway[0]).toMatchObject({ owned: 0, finishes: 1, card: { arenaRarity: 'uncommon' } });
  });

  it('narrows both lists to the colours asked for', () => {
    const found = collectionCombos(owned, 'standard', index, combos, ['U', 'R']);
    expect(ids(found.owned)).toEqual(['opt-shock']);
    expect(cards(found.oneCardAway)).toEqual(['Lightning Strike']);
  });

  it('respects the format: a commander combo is on offer where there is a command zone', () => {
    expect(cards(collectionCombos(owned, 'brawl', index, combos).oneCardAway)).toContain('Niv-Mizzet, Parun');
    expect(cards(collectionCombos(owned, 'standard', index, combos).oneCardAway)).not.toContain('Niv-Mizzet, Parun');
  });

  it('finds nothing in an empty collection', () => {
    expect(collectionCombos(nothing, 'standard', index, combos)).toEqual({ owned: [], ownedTotal: 0, oneCardAway: [] });
  });
});

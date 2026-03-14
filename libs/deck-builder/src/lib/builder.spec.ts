import { describe, it, expect } from 'vitest';
import { buildDeck } from './builder';
import { scoreCard, labelToSlot, isColorLegal } from './scoring';
import type { ScryfallCard } from '@mtg/scryfall';
import type { EDHRecCard } from '@mtg/edhrec';
import type { CollectionMap } from '@mtg/collection';
import { parseArenaCollection } from '@mtg/collection';

// --- Fixtures ---

const ATRAXA: ScryfallCard = {
  id: 'abc',
  name: "Atraxa, Praetors' Voice",
  type_line: 'Legendary Creature — Phyrexian Angel Horror',
  color_identity: ['W', 'U', 'B', 'G'],
  cmc: 4,
  legalities: { commander: 'legal' },
  prices: { usd: '12.00' },
  edhrec_rank: 5,
};

const MONO_GREEN_COMMANDER: ScryfallCard = {
  id: 'def',
  name: 'Selvala, Heart of the Wilds',
  type_line: 'Legendary Creature — Elf Scout',
  color_identity: ['G'],
  cmc: 3,
  legalities: { commander: 'legal' },
  prices: { usd: '5.00' },
  edhrec_rank: 50,
};

function makeEDHRecCards(count: number, label: string, startInclusion = 80): EDHRecCard[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `Card ${label} ${i + 1}`,
    inclusion: startInclusion - i,
    synergy: 0.5,
    label,
    cmc: 2,
  }));
}

function makeCollection(cardNames: string[]): CollectionMap {
  const text = cardNames.map(n => `1 ${n}`).join('\n');
  return parseArenaCollection(text).collection;
}

function makeCollectionScryfallData(
  cards: Array<{ name: string; colorIdentity: string[] }>,
): Map<string, ScryfallCard> {
  const map = new Map<string, ScryfallCard>();
  for (const { name, colorIdentity } of cards) {
    map.set(name.toLowerCase(), {
      id: name,
      name,
      type_line: 'Sorcery',
      color_identity: colorIdentity,
      cmc: 2,
      legalities: { commander: 'legal' },
      prices: { usd: '1.00' },
      edhrec_rank: null,
    });
  }
  return map;
}

// --- Tests ---

describe('scoreCard', () => {
  it('gives high score to high-inclusion, high-synergy, low-cmc card', () => {
    const score = scoreCard({ name: 'Sol Ring', inclusion: 95, synergy: 0.8, label: 'ramp', cmc: 1 });
    expect(score).toBeGreaterThan(0.7);
  });

  it('gives low score to low-inclusion, low-synergy, high-cmc card', () => {
    const score = scoreCard({ name: 'Big Threat', inclusion: 10, synergy: -0.5, label: 'synergy', cmc: 9 });
    expect(score).toBeLessThan(0.25);
  });

  it('clamps inclusion at 100', () => {
    const capped = scoreCard({ name: 'X', inclusion: 150, synergy: 1, label: 'ramp', cmc: 0 });
    const normal = scoreCard({ name: 'X', inclusion: 100, synergy: 1, label: 'ramp', cmc: 0 });
    expect(capped).toBeCloseTo(normal, 5);
  });
});

describe('labelToSlot', () => {
  it('maps EDHRec labels to slot names', () => {
    expect(labelToSlot('ramp')).toBe('ramp');
    expect(labelToSlot('mana-rock')).toBe('ramp');
    expect(labelToSlot('draw')).toBe('draw');
    expect(labelToSlot('removal')).toBe('interaction');
    expect(labelToSlot('land')).toBe('lands');
    expect(labelToSlot('win-con')).toBe('winConditions');
    expect(labelToSlot('unknown')).toBe('synergy');
  });
});

describe('isColorLegal', () => {
  it('allows colorless cards in any commander', () => {
    expect(isColorLegal([], ['W', 'U'])).toBe(true);
  });
  it('allows cards within commander color identity', () => {
    expect(isColorLegal(['W', 'U'], ['W', 'U', 'B', 'G'])).toBe(true);
  });
  it('rejects off-color cards', () => {
    expect(isColorLegal(['R'], ['W', 'U', 'B', 'G'])).toBe(false);
    expect(isColorLegal(['R'], ['G'])).toBe(false);
  });
  it('rejects multi-color cards with any off-color pip', () => {
    expect(isColorLegal(['W', 'R'], ['W', 'U'])).toBe(false);
  });
});

describe('buildDeck', () => {
  it('returns exactly 100 cards total', () => {
    const edhrecCards: EDHRecCard[] = [
      ...makeEDHRecCards(15, 'ramp'),
      ...makeEDHRecCards(15, 'draw'),
      ...makeEDHRecCards(15, 'removal'),
      ...makeEDHRecCards(10, 'win-con'),
      ...makeEDHRecCards(40, 'synergy'),
      ...makeEDHRecCards(40, 'land'),
    ];
    const cardNames = edhrecCards.map(c => c.name);
    const collection = makeCollection(cardNames);
    const collectionScryfallData = makeCollectionScryfallData(
      edhrecCards.map(c => ({ name: c.name, colorIdentity: [] }))
    );

    const { deck } = buildDeck({ commanderCard: ATRAXA, edhrecCards, collection, collectionScryfallData });
    expect(deck.totalCards).toBe(100);
  });

  it('commander is always in the deck', () => {
    const edhrecCards = makeEDHRecCards(99, 'synergy');
    const collection = makeCollection(edhrecCards.map(c => c.name));
    const collectionScryfallData = makeCollectionScryfallData(
      edhrecCards.map(c => ({ name: c.name, colorIdentity: [] }))
    );

    const { deck } = buildDeck({ commanderCard: ATRAXA, edhrecCards, collection, collectionScryfallData });
    expect(deck.commander.name).toBe("Atraxa, Praetors' Voice");
  });

  it('enforces singleton rule — no card appears twice', () => {
    const edhrecCards = makeEDHRecCards(120, 'synergy');
    const collection = makeCollection(edhrecCards.map(c => c.name));
    const collectionScryfallData = makeCollectionScryfallData(
      edhrecCards.map(c => ({ name: c.name, colorIdentity: [] }))
    );

    const { deck } = buildDeck({ commanderCard: ATRAXA, edhrecCards, collection, collectionScryfallData });
    const allNames = [deck.commander, ...Object.values(deck.slots).flat()].map(c => c.name.toLowerCase());
    const uniqueNames = new Set(allNames);
    expect(allNames.length).toBe(uniqueNames.size);
  });

  it('filters out off-color cards for mono-green commander', () => {
    const blueCards: EDHRecCard[] = Array.from({ length: 30 }, (_, i) => ({
      name: `Blue Card ${i}`,
      inclusion: 70,
      synergy: 0.5,
      label: 'draw',
      cmc: 2,
    }));
    const greenCards: EDHRecCard[] = Array.from({ length: 80 }, (_, i) => ({
      name: `Green Card ${i}`,
      inclusion: 60,
      synergy: 0.4,
      label: 'synergy',
      cmc: 3,
    }));

    const allCards = [...blueCards, ...greenCards];
    const collection = makeCollection(allCards.map(c => c.name));
    const collectionScryfallData = makeCollectionScryfallData([
      ...blueCards.map(c => ({ name: c.name, colorIdentity: ['U'] })),
      ...greenCards.map(c => ({ name: c.name, colorIdentity: ['G'] })),
    ]);

    const { deck } = buildDeck({
      commanderCard: MONO_GREEN_COMMANDER,
      edhrecCards: allCards,
      collection,
      collectionScryfallData,
    });

    const allDeckCards = [...Object.values(deck.slots).flat()];
    const hasBlueCard = allDeckCards.some(c => c.name.startsWith('Blue Card'));
    expect(hasBlueCard).toBe(false);
  });

  it('gap report lists unowned cards that are IN the deck, sorted by inclusion', () => {
    // Staple A and B are unowned but highly-recommended — they should get placed in the deck
    const ownedCards = makeEDHRecCards(50, 'synergy', 50);
    const unownedCards: EDHRecCard[] = [
      { name: 'Staple A', inclusion: 95, synergy: 0.8, label: 'ramp', cmc: 1 },
      { name: 'Staple B', inclusion: 88, synergy: 0.6, label: 'draw', cmc: 2 },
    ];
    const allEDHRec = [...ownedCards, ...unownedCards];
    const collection = makeCollection(ownedCards.map(c => c.name)); // only owned
    const collectionScryfallData = makeCollectionScryfallData(
      allEDHRec.map(c => ({ name: c.name, colorIdentity: [] }))
    );

    const { deck, gaps } = buildDeck({
      commanderCard: ATRAXA,
      edhrecCards: allEDHRec,
      collection,
      collectionScryfallData,
    });

    // Unowned staples should be in the deck (score-boosted owned cards fill first, but ramp/draw slots have room)
    const allDeckCards = [...Object.values(deck.slots).flat()];
    const deckNames = allDeckCards.map(c => c.name);
    expect(deckNames).toContain('Staple A');
    expect(deckNames).toContain('Staple B');

    // Gap report = unowned cards IN the deck
    const gapNames = gaps.missingStaples.map(c => c.name);
    expect(gapNames).toContain('Staple A');
    expect(gapNames).toContain('Staple B');
    // Higher inclusion first
    const idxA = gapNames.indexOf('Staple A');
    const idxB = gapNames.indexOf('Staple B');
    expect(idxA).toBeLessThan(idxB);
  });

  it('fills lands with basics when not enough land cards in collection', () => {
    // Provide enough cards for all non-land slots + no land-labeled cards
    const synCards = makeEDHRecCards(28, 'synergy'); // 25 needed + buffer
    const rampCards = makeEDHRecCards(12, 'ramp');
    const drawCards = makeEDHRecCards(12, 'draw');
    const interCards = makeEDHRecCards(12, 'removal');
    const winCards = makeEDHRecCards(7, 'win-con');
    const flexCards = makeEDHRecCards(5, 'flex');
    const fewCards = [...synCards, ...rampCards, ...drawCards, ...interCards, ...winCards, ...flexCards];
    const collection = makeCollection(fewCards.map(c => c.name));
    const collectionScryfallData = makeCollectionScryfallData(
      fewCards.map(c => ({ name: c.name, colorIdentity: [] }))
    );

    const { deck } = buildDeck({
      commanderCard: MONO_GREEN_COMMANDER,
      edhrecCards: fewCards,
      collection,
      collectionScryfallData,
    });

    expect(deck.totalCards).toBe(100);
    const landSlot = deck.slots.lands;
    expect(landSlot.length).toBeGreaterThan(0);
    const hasBasics = landSlot.some(c => c.type_line === 'Basic Land');
    expect(hasBasics).toBe(true);
  });
});

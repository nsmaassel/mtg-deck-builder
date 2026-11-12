import { describe, it, expect } from 'vitest';
import { parseArenaCollection } from '@mtg/collection';
import type { CollectionMap } from '@mtg/collection';
import { profileCommander, recommend, scoreFor } from '@mtg/commander-recs';
import type { Recommendation } from '@mtg/commander-recs';
// Fixtures live with the library that defines what they exercise; there is no path alias for them yet.
import { buildCommanderTestIndex } from '@mtg/commander-recs/testing';
import { buildDeck } from './builder';
import { buildDeckForCommander, candidatesFor } from './candidates';
import { OWNED_BOOST, scoreCard, isColorLegal, nonbasicLandLimit } from './scoring';
import { SLOT_TARGETS } from './types';
import type { BuildDeckOptions, DeckCard, DeckList } from './types';

// --- Fixtures ---

const index = buildCommanderTestIndex();
const card = (name: string) => {
  const found = index.byName(name);
  if (!found) throw new Error(`fixture has no ${name}`);
  return found;
};

const NO_COLLECTION = parseArenaCollection('').collection;

function makeCollection(cardNames: string[]): CollectionMap {
  return parseArenaCollection(cardNames.map(n => `1 ${n}`).join('\n')).collection;
}

function build(commander: string, collection: CollectionMap = NO_COLLECTION, options: BuildDeckOptions = {}) {
  return buildDeckForCommander(index, card(commander), collection, options);
}

const cardsOf = (deck: DeckList): DeckCard[] => Object.values(deck.slots).flat();
const namesIn = (cards: DeckCard[]) => cards.map(c => c.name);
const isBasic = (c: DeckCard) => c.type_line === 'Basic Land';

/** A recommendation with the given parts, for tests of the scoring alone. */
function makeRecommendation(parts: Partial<Recommendation> & Pick<Recommendation, 'slot'>): Recommendation {
  return {
    oracleId: 'id:test',
    name: 'Test Card',
    popularity: 0,
    synergy: 0,
    score: 0,
    themes: [],
    reasons: ['Test'],
    cmc: 0,
    typeLine: 'Artifact',
    colorIdentity: [],
    ...parts,
  };
}

// --- Tests ---

describe('scoreCard', () => {
  it('is the recommendation score: popularity, synergy and cheapness by slot weight', () => {
    const krenko = profileCommander(index, card('Krenko, Mob Boss'));
    const solRing = scoreFor(index, krenko, card('Sol Ring'))!;
    // Ramp: popularity 1 × 0.65 + synergy 0 × 0.20 + cheapness (1 − 1/10) × 0.15
    expect(scoreCard(solRing)).toBeCloseTo(0.785, 10);
  });

  it('adds a fixed boost for a card the player owns', () => {
    const rec = makeRecommendation({ slot: 'ramp', score: 0.5 });
    expect(OWNED_BOOST).toBe(0.15);
    expect(scoreCard(rec, true)).toBeCloseTo(0.65, 10);
    expect(scoreCard(rec, false)).toBe(0.5);
  });

  it('never passes 1', () => {
    expect(scoreCard(makeRecommendation({ slot: 'ramp', score: 0.95 }), true)).toBe(1);
  });

  it('lets popularity decide a staple slot and synergy decide the synergy slot', () => {
    const staple = { popularity: 0.9, synergy: 0, cmc: 2 };
    const onTheme = { popularity: 0.2, synergy: 0.9, cmc: 2 };
    const asRamp = (parts: typeof staple) => scoreCard(makeRecommendation({ slot: 'synergy', ...parts }), false, 'ramp');
    const asSynergy = (parts: typeof staple) => scoreCard(makeRecommendation({ slot: 'ramp', ...parts }), false, 'synergy');

    expect(asRamp(staple)).toBeGreaterThan(asRamp(onTheme));
    expect(asSynergy(onTheme)).toBeGreaterThan(asSynergy(staple));
    // Synergy: 0.2 × 0.35 + 0.9 × 0.55 + (1 − 2/10) × 0.10
    expect(asSynergy(onTheme)).toBeCloseTo(0.645, 10);
    // Ramp: 0.9 × 0.65 + 0 × 0.20 + (1 − 2/10) × 0.15
    expect(asRamp(staple)).toBeCloseTo(0.705, 10);
  });

  it('re-scores a card for another slot from its parts, not from its own slot score', () => {
    const rec = makeRecommendation({ slot: 'interaction', score: 0.123, popularity: 0.3, synergy: 1, cmc: 5 });
    expect(scoreCard(rec)).toBe(0.123);
    // Synergy: 0.3 × 0.35 + 1 × 0.55 + (1 − 5/10) × 0.10
    expect(scoreCard(rec, false, 'synergy')).toBeCloseTo(0.705, 10);
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

describe('nonbasicLandLimit', () => {
  it('leaves a one-colour deck most of its basics and lets a five-colour deck fix with nearly every land', () => {
    expect(nonbasicLandLimit(1)).toBeLessThan(nonbasicLandLimit(2));
    expect(nonbasicLandLimit(2)).toBeLessThan(nonbasicLandLimit(3));
    expect(nonbasicLandLimit(5)).toBeLessThanOrEqual(SLOT_TARGETS.lands);
    expect(nonbasicLandLimit(1)).toBe(12);
  });
});

describe('buildDeck', () => {
  it('returns exactly 100 cards total, with every slot at its target', () => {
    const { deck } = build('Krenko, Mob Boss');
    expect(deck.totalCards).toBe(100);
    for (const [slot, target] of Object.entries(SLOT_TARGETS)) {
      expect(deck.slots[slot as keyof typeof SLOT_TARGETS]).toHaveLength(target);
    }
  });

  it('commander is always in the deck, and never among the 99', () => {
    const { deck } = build('Krenko, Mob Boss');
    expect(deck.commander.name).toBe('Krenko, Mob Boss');
    expect(deck.commander.reasons).toEqual(['The commander']);
    expect(namesIn(cardsOf(deck))).not.toContain('Krenko, Mob Boss');
  });

  it('enforces singleton rule — no card appears twice, basic lands aside', () => {
    const { deck } = build('Krenko, Mob Boss');
    const names = namesIn(cardsOf(deck).filter(c => !isBasic(c)));
    expect(new Set(names).size).toBe(names.length);
  });

  it('filters out off-color cards, even when a caller passes one in', () => {
    const profile = profileCommander(index, card('Krenko, Mob Boss'));
    const offColor = makeRecommendation({
      oracleId: 'id:Blue Staple', name: 'Blue Staple', slot: 'draw', score: 1, popularity: 1, colorIdentity: ['U'],
    });
    const { deck } = buildDeck({ profile, recommendations: [offColor, ...recommend(index, profile)], owned: new Set() });

    expect(namesIn(cardsOf(deck))).not.toContain('Blue Staple');
    for (const name of namesIn(cardsOf(deck).filter(c => !isBasic(c)))) {
      expect(isColorLegal(card(name).colorIdentity, ['R'])).toBe(true);
    }
  });

  it('carries what each card is there for', () => {
    const { deck } = build('Krenko, Mob Boss');
    for (const c of cardsOf(deck)) {
      expect(c.reasons.length).toBeGreaterThanOrEqual(1);
      expect(c.popularity).toBeGreaterThanOrEqual(0);
      expect(c.popularity).toBeLessThanOrEqual(1);
      expect(c.synergy).toBeGreaterThanOrEqual(0);
      expect(c.synergy).toBeLessThanOrEqual(1);
    }
    const matron = deck.slots.synergy.find(c => c.name === 'Goblin Matron')!;
    expect(matron.reasons).toEqual(['Goblin that cares about Goblins, like the commander']);
    expect(matron.type_line).toBe('Creature — Goblin');
    expect(matron.usdPrice).toBe(1);
  });
});

describe('buildDeck: staples and synergy', () => {
  const krenko = build('Krenko, Mob Boss').deck;
  const zada = build('Zada, Hedron Grinder').deck;
  const shared = (a: DeckCard[], b: DeckCard[]) => namesIn(a).filter(name => namesIn(b).includes(name));

  it('gives universal staples their ramp, draw and interaction slots whoever the commander is', () => {
    for (const deck of [krenko, zada]) {
      expect(namesIn(deck.slots.ramp)).toEqual(expect.arrayContaining(['Sol Ring', 'Arcane Signet', 'Mind Stone']));
      expect(namesIn(deck.slots.interaction)).toEqual(expect.arrayContaining(['Chaos Warp', 'Lightning Bolt']));
      expect(namesIn(deck.slots.draw)).toContain('Faithless Looting');
      // Sol Ring is the most played card there is: first in ramp, ahead of anything on theme.
      expect(deck.slots.ramp[0]!.name).toBe('Sol Ring');
    }
    expect(namesIn(krenko.slots.interaction)).toContain('Blasphemous Act');
  });

  it('still makes room in a staple slot for a card that does the job and fits the commander', () => {
    expect(namesIn(krenko.slots.ramp)).toContain('Skirk Prospector');
    expect(namesIn(zada.slots.ramp)).not.toContain('Skirk Prospector');
  });

  it('leads the synergy slot with what the commander is about', () => {
    for (const c of krenko.slots.synergy) expect(c.synergy).toBeGreaterThan(0);
    for (const c of zada.slots.synergy) expect(c.synergy).toBeGreaterThan(0);
    expect(krenko.slots.synergy.filter(c => /Goblin/.test(c.type_line)).length).toBeGreaterThanOrEqual(20);
    expect(zada.slots.synergy.filter(c => /Instant|Sorcery/.test(c.type_line)).length).toBeGreaterThanOrEqual(20);
  });

  it('builds visibly different decks for two commanders in the same colours', () => {
    expect(krenko.commander.type_line).toContain('Goblin');
    // Same colours, same staples...
    expect(shared(krenko.slots.ramp, zada.slots.ramp).length).toBeGreaterThanOrEqual(8);
    // ...and almost nothing in common where the deck is about its commander.
    expect(shared(krenko.slots.synergy, zada.slots.synergy).length).toBeLessThanOrEqual(3);
  });

  it('gives a card that lost its own slot to a staple a synergy slot when it fits', () => {
    // Siege-Gang Commander is tagged as removal; ten more widely played removal spells take interaction.
    expect(namesIn(krenko.slots.interaction)).not.toContain('Siege-Gang Commander');
    const siegeGang = krenko.slots.synergy.find(c => c.name === 'Siege-Gang Commander');
    expect(siegeGang).toBeDefined();
    expect(siegeGang!.slot).toBe('synergy');
  });

  it('spends the flex slots on the most widely played cards left over', () => {
    expect(namesIn(krenko.slots.flex)).toContain('Lightning Greaves');
    const flexFloor = Math.min(...krenko.slots.flex.map(c => c.popularity));
    const unused = recommend(index, profileCommander(index, card('Krenko, Mob Boss')))
      .filter(r => r.slot !== 'lands' && !namesIn(cardsOf(krenko)).includes(r.name));
    for (const r of unused) expect(r.popularity).toBeLessThanOrEqual(flexFloor);
  });

  it('puts win conditions in their slot', () => {
    expect(namesIn(krenko.slots.winConditions)).toEqual(expect.arrayContaining(['Insurrection', 'Underworld Breach']));
  });
});

describe('buildDeck: lands', () => {
  it('caps nonbasic lands by the number of colours and fills the rest with basics', () => {
    const { deck } = build('Krenko, Mob Boss');
    const nonbasic = deck.slots.lands.filter(c => !isBasic(c));
    const basics = deck.slots.lands.filter(isBasic);
    expect(deck.slots.lands).toHaveLength(36);
    expect(nonbasic).toHaveLength(nonbasicLandLimit(1));
    expect(new Set(namesIn(basics))).toEqual(new Set(['Mountain']));
    expect(basics.every(c => c.ownedInCollection)).toBe(true);
  });

  it('prefers lands that make the deck\'s colour to ones that only fix', () => {
    const { deck } = build('Krenko, Mob Boss');
    const names = namesIn(deck.slots.lands);
    expect(names).toContain('Red Land 1');
    expect(names).toContain('Reliquary Tower');
    expect(names).not.toContain('Steam Vents');
    expect(names).not.toContain('Polluted Delta');
  });

  it('splits basics across the colours of a multicolour commander', () => {
    const { deck } = build('Niv-Mizzet, Parun');
    const basics = namesIn(deck.slots.lands.filter(isBasic));
    expect(new Set(basics)).toEqual(new Set(['Island', 'Mountain']));
    expect(namesIn(deck.slots.lands)).toContain('Steam Vents');
  });

  it('gives a colourless commander Wastes, not basics it cannot play', () => {
    const { deck } = build('Kozilek, the Great Distortion');
    const basics = namesIn(deck.slots.lands.filter(isBasic));
    expect(deck.slots.lands).toHaveLength(36);
    expect(new Set(basics)).toEqual(new Set(['Wastes']));
  });
});

describe('buildDeck modes', () => {
  // Ten Goblins too far down to make an open build, ten Ogres nothing recommends, and a few staples.
  const ownedNames = [
    ...Array.from({ length: 10 }, (_, i) => `Goblin Grunt ${i + 21}`),
    ...Array.from({ length: 10 }, (_, i) => `Hill Ogre ${i + 51}`),
    'Sol Ring', 'Chaos Warp', 'Goblin Chieftain', 'Command Tower',
  ];
  const collection = makeCollection(ownedNames);

  it('owned-only: no unowned non-basic cards in deck', () => {
    const { deck } = build('Krenko, Mob Boss', collection, { mode: 'owned-only' });
    const unowned = cardsOf(deck).filter(c => !c.ownedInCollection && !isBasic(c));
    expect(unowned).toEqual([]);
  });

  it('owned-only: scores every owned card, including ones no top list reaches', () => {
    const profile = profileCommander(index, card('Krenko, Mob Boss'));
    const listed = new Set(recommend(index, profile).map(r => r.name));
    // Hill Ogre 60 is off theme and barely played: nothing recommends it.
    expect(listed.has('Hill Ogre 60')).toBe(false);

    const { deck } = build('Krenko, Mob Boss', collection, { mode: 'owned-only' });
    const names = namesIn(cardsOf(deck));
    for (const name of ownedNames) expect(names).toContain(name);
    // 23 owned nonland cards, one owned land, 35 basics and the commander.
    expect(deck.totalCards).toBe(1 + 23 + 36);
  });

  it('owned-only: puts the owned cards that fit the commander ahead of the ones that do not', () => {
    const { deck } = build('Krenko, Mob Boss', collection, { mode: 'owned-only' });
    const synergy = namesIn(deck.slots.synergy);
    expect(synergy.slice(0, 11)).toEqual(expect.arrayContaining(['Goblin Chieftain', 'Goblin Grunt 21', 'Goblin Grunt 30']));
    expect(synergy.indexOf('Goblin Grunt 30')).toBeLessThan(synergy.indexOf('Hill Ogre 51'));
  });

  it('prefer-owned: owned cards are in, and the rest of the 100 is filled with recommendations', () => {
    const { deck } = build('Krenko, Mob Boss', collection, { mode: 'prefer-owned' });
    expect(deck.totalCards).toBe(100);
    const all = cardsOf(deck);
    expect(all.find(c => c.name === 'Sol Ring')!.ownedInCollection).toBe(true);
    expect(all.find(c => c.name === 'Goblin Matron')!.ownedInCollection).toBe(false);
    expect(all.filter(c => !c.ownedInCollection).length).toBeGreaterThan(0);
  });

  it('prefer-owned: an owned card beats a slightly better one to buy', () => {
    const withGrunt = build('Krenko, Mob Boss', makeCollection(['Goblin Grunt 30']));
    const without = build('Krenko, Mob Boss');
    expect(namesIn(cardsOf(without.deck))).not.toContain('Goblin Grunt 30');
    expect(namesIn(cardsOf(withGrunt.deck))).toContain('Goblin Grunt 30');
  });

  it('budget: unowned cards above price ceiling are excluded', () => {
    const { deck } = build('Krenko, Mob Boss', NO_COLLECTION, { mode: 'budget', budgetMaxPrice: 5 });
    const tooExpensive = cardsOf(deck).filter(c => !c.ownedInCollection && !isBasic(c) && (c.usdPrice ?? Infinity) > 5);
    expect(tooExpensive).toEqual([]);
    expect(namesIn(cardsOf(deck))).not.toContain('Goblin Chieftain');
  });

  it('budget: cheap unowned cards ARE included, and the deck still reaches 100', () => {
    const { deck } = build('Krenko, Mob Boss', NO_COLLECTION, { mode: 'budget', budgetMaxPrice: 5 });
    expect(deck.totalCards).toBe(100);
    expect(namesIn(cardsOf(deck))).toEqual(expect.arrayContaining(['Sol Ring', 'Goblin Matron']));
  });

  it('budget: a card already owned stays in whatever it costs', () => {
    const { deck } = build('Krenko, Mob Boss', makeCollection(['Goblin Chieftain']), { mode: 'budget', budgetMaxPrice: 5 });
    const chieftain = cardsOf(deck).find(c => c.name === 'Goblin Chieftain');
    expect(chieftain).toMatchObject({ ownedInCollection: true, usdPrice: 20 });
  });
});

describe('candidatesFor', () => {
  const profile = profileCommander(index, card('Krenko, Mob Boss'));

  it('adds every owned card that can go in the deck to the recommendations', () => {
    const collection = makeCollection(['Hill Ogre 60', 'Counterspell', 'Not A Real Card']);
    const { recommendations, owned, unknownNames } = candidatesFor(index, profile, collection);
    const names = recommendations.map(r => r.name);

    expect(names).toContain('Hill Ogre 60');
    expect(names).toContain('Sol Ring');
    // Owned, but outside the colour identity: known to be owned, never a candidate.
    expect(owned.has(card('Counterspell').oracleId)).toBe(true);
    expect(names).not.toContain('Counterspell');
    expect(unknownNames).toEqual(['Not A Real Card']);
    expect(new Set(names).size).toBe(names.length);
  });

  it('digs for affordable cards in budget mode', () => {
    const { recommendations } = candidatesFor(index, profile, NO_COLLECTION, { mode: 'budget', budgetMaxPrice: 5 });
    const affordable = recommendations.filter(r => r.usd !== undefined && r.usd <= 5);
    expect(affordable.length).toBeGreaterThan(recommend(index, profile).filter(r => r.usd !== undefined && r.usd <= 5).length - 1);
    expect(affordable.length).toBeGreaterThanOrEqual(99 - 36);
  });
});

describe('buildDeck: analysis and gaps', () => {
  it('lists the themes the deck was built around', () => {
    const { analysis } = build('Krenko, Mob Boss');
    expect(analysis.commanderName).toBe('Krenko, Mob Boss');
    expect(analysis.themes).toEqual([
      { slug: 'typal', name: 'Goblin Typal', because: 'cares about Goblins' },
      { slug: 'tokens', name: 'Tokens', because: 'makes creature tokens' },
    ]);
    expect(build('Isamaru, Hound of Konda').analysis.themes).toEqual([]);
  });

  it('averages mana value over every nonland card, free spells included', () => {
    const { deck, analysis } = build('Krenko, Mob Boss');
    const spells = [deck.commander, ...cardsOf(deck).filter(c => c.slot !== 'lands')];
    const mean = spells.reduce((sum, c) => sum + c.cmc, 0) / spells.length;
    expect(analysis.averageCmc).toBeCloseTo(mean, 2);
    expect(Object.values(analysis.manaCurve).reduce((sum, n) => sum + n, 0)).toBe(spells.length);
  });

  it('counts colours by colour identity', () => {
    const { analysis } = build('Krenko, Mob Boss');
    expect(Object.keys(analysis.colorDistribution)).toEqual(['R']);
    expect(Object.keys(build('Niv-Mizzet, Parun').analysis.colorDistribution).sort()).toEqual(['R', 'U']);
    expect(build('Kozilek, the Great Distortion').analysis.colorDistribution).toEqual({});
  });

  it('reports how much of the deck we would build with every card available made this one', () => {
    const coverage = (collection: CollectionMap, options: BuildDeckOptions = {}) =>
      build('Krenko, Mob Boss', collection, options).analysis.topPicksCoveragePercent;

    // Nothing holds the build back, so the deck is the yardstick.
    expect(coverage(NO_COLLECTION)).toBe(100);
    // Owning one of the top picks changes nothing; owning a card that is not one displaces a pick.
    expect(coverage(makeCollection(['Sol Ring']))).toBe(100);
    expect(coverage(makeCollection(['Goblin Grunt 30']))).toBeLessThan(100);
    expect(coverage(makeCollection(['Goblin Grunt 30']))).toBeGreaterThan(90);
    // A collection of two cards holds an owned-only build far back, and a budget holds one back a little.
    expect(coverage(makeCollection(['Sol Ring', 'Goblin Grunt 30']), { mode: 'owned-only' })).toBeLessThan(10);
    const budget = coverage(NO_COLLECTION, { mode: 'budget', budgetMaxPrice: 5 });
    expect(budget).toBeLessThan(100);
    expect(budget).toBeGreaterThan(80);
  });

  it('gap report lists unowned cards that are IN the deck, the ones the deck leans on most first', () => {
    const { deck, gaps } = build('Krenko, Mob Boss', makeCollection(['Sol Ring']));
    const inDeck = namesIn(cardsOf(deck));

    expect(gaps.missingCards).toHaveLength(10);
    for (const missing of gaps.missingCards) {
      expect(inDeck).toContain(missing.name);
      expect(missing.reasons.length).toBeGreaterThanOrEqual(1);
    }
    expect(gaps.missingCards.map(c => c.name)).not.toContain('Sol Ring');
    expect(gaps.missingCards.map(c => c.name)).not.toContain('Mountain');

    const scores = gaps.missingCards.map(c => cardsOf(deck).find(d => d.name === c.name)!.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(gaps.missingCards[0]).toMatchObject({ name: 'Arcane Signet', wouldFillSlot: 'ramp', usdPrice: 1 });
  });

  it('splits the gap report by price', () => {
    const { gaps } = build('Krenko, Mob Boss');
    for (const c of gaps.budgetUpgrades) expect(c.usdPrice).toBeLessThan(5);
    for (const c of gaps.premiumUpgrades) expect(c.usdPrice).toBeGreaterThanOrEqual(5);
    expect(gaps.budgetUpgrades.length + gaps.premiumUpgrades.length).toBe(gaps.missingCards.length);
  });

  it('has nothing to report when every card in the deck is owned', () => {
    const { gaps } = build('Krenko, Mob Boss', makeCollection(['Sol Ring', 'Goblin Grunt 21']), { mode: 'owned-only' });
    expect(gaps.missingCards).toEqual([]);
  });
});

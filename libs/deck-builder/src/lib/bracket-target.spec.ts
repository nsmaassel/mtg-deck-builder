import { describe, it, expect } from 'vitest';
import { profileCommander, recommendationScore } from '@mtg/commander-recs';
import type { Recommendation, RecommendationSlot } from '@mtg/commander-recs';
import { buildCommanderTestIndex } from '@mtg/commander-recs/testing';
import type { ComboResult } from '@mtg/power-level';
import { buildDeckForBracket } from './bracket-target';
import { buildDeck } from './builder';
import type { BuildDeckInput, BuildDeckOptions, DeckList } from './types';

const index = buildCommanderTestIndex();
const profile = profileCommander(index, index.byName('Krenko, Mob Boss')!);

function rec(name: string, slot: RecommendationSlot, parts: Partial<Recommendation> = {}): Recommendation {
  // Mana value 3: a deck this cheap on average would read as optimised beside two Game Changers.
  const base = { popularity: 0.35, synergy: 0, cmc: 3, ...parts };
  return {
    oracleId: `id:${name}`,
    name,
    slot,
    themes: [],
    reasons: ['Test'],
    typeLine: 'Artifact',
    colorIdentity: [],
    ...base,
    score: recommendationScore({ slot, ...base }),
  };
}

/** More cards than a deck holds, every slot covered, all equally played. Extras go on top. */
function pool(popularity: number, extras: Recommendation[] = [], synergy = 0): Recommendation[] {
  const filler = (slot: RecommendationSlot, count: number) =>
    Array.from({ length: count }, (_, i) => rec(`${slot} ${i}`, slot, { popularity, synergy }));
  return [
    ...filler('ramp', 14), ...filler('draw', 14), ...filler('interaction', 14),
    ...filler('winConditions', 8), ...filler('synergy', 40), ...extras,
  ];
}

function input(recommendations: Recommendation[], options: BuildDeckOptions = {}, owned: string[] = []): BuildDeckInput {
  return { profile, recommendations, owned: new Set(owned.map(name => `id:${name}`)), options };
}

const names = (deck: DeckList) => Object.values(deck.slots).flat().map(card => card.name);
const gameChanger = (name: string, parts: Partial<Recommendation> = {}) =>
  rec(name, 'synergy', { popularity: 0.9, gameChanger: true, ...parts });

describe('buildDeckForBracket', () => {
  it('leaves a deck alone that already sits at its target', () => {
    const result = buildDeckForBracket(input(pool(0.35)), 2);
    expect(result.bracketTuning).toEqual({ target: 2, reached: 2, untuned: 2, leftOut: [], added: [], fewerStaples: false });
    expect(names(result.deck)).toEqual(names(buildDeck(input(pool(0.35))).deck));
  });

  it('leaves out Game Changers to come down, and still fills the deck', () => {
    const cards = pool(0.35, [gameChanger('Rhystic Study'), gameChanger('Cyclonic Rift')]);
    expect(buildDeck(input(cards)).powerLevel.bracket).toBe(3);

    const result = buildDeckForBracket(input(cards), 2);
    expect(result.bracketTuning).toMatchObject({ target: 2, reached: 2, untuned: 3, fewerStaples: false });
    expect(result.bracketTuning!.leftOut.map(c => c.name).sort()).toEqual(['Cyclonic Rift', 'Rhystic Study']);
    expect(result.bracketTuning!.leftOut[0]!.reason).toBe('On the Game Changers list');
    expect(names(result.deck)).not.toContain('Rhystic Study');
    expect(result.deck.totalCards).toBe(100);
    expect(result.powerLevel.bracket).toBe(2);
  });

  it('takes out only as many as the target asks: Bracket 3 keeps three of five Game Changers', () => {
    const changers = ['A', 'B', 'C', 'D', 'E'].map((letter, i) => gameChanger(`Changer ${letter}`, { popularity: 0.9 - i * 0.05 }));
    const result = buildDeckForBracket(input(pool(0.35, changers)), 3);
    expect(result.bracketTuning).toMatchObject({ reached: 3, untuned: 4 });
    // The two the deck leans on least go.
    expect(result.bracketTuning!.leftOut.map(c => c.name)).toEqual(['Changer E', 'Changer D']);
    expect(result.powerLevel.signals.gameChangers).toHaveLength(3);
  });

  it('breaks a two-card combo by leaving out the half the deck needs less, and says which combo', () => {
    const cards = pool(0.35, [
      rec('Combo Half', 'synergy', { popularity: 0.8 }),
      rec('Other Half', 'synergy', { popularity: 0.7 }),
    ]);
    const combosOf = (deck: DeckList): ComboResult[] =>
      ['Combo Half', 'Other Half'].every(name => names(deck).includes(name))
        ? [{ id: 'c1', uses: ['Combo Half', 'Other Half'], cardCount: 2, produces: ['Infinite mana'] }]
        : [];

    expect(buildDeckForBracket(input(cards), 3, combosOf).bracketTuning).toMatchObject({ reached: 3, leftOut: [] });
    const result = buildDeckForBracket(input(cards), 2, combosOf);
    expect(result.bracketTuning).toMatchObject({ reached: 2, untuned: 3 });
    expect(result.bracketTuning!.leftOut).toEqual([{ name: 'Other Half', reason: 'Half of a two-card combo with Combo Half' }]);
    expect(names(result.deck)).toContain('Combo Half');
  });

  it('eases off staples when nothing else holds the bracket up', () => {
    // Widely played cards with no synergy against on-theme cards few decks play.
    const onTheme = Array.from({ length: 70 }, (_, i) =>
      rec(`Theme ${i}`, (['ramp', 'draw', 'interaction', 'synergy'] as const)[i % 4]!, { popularity: 0.33, synergy: 0.8 }),
    );
    const cards = pool(0.6, onTheme);
    expect(buildDeck(input(cards)).powerLevel.bracket).toBe(3);

    const result = buildDeckForBracket(input(cards), 2);
    expect(result.bracketTuning).toMatchObject({ reached: 2, untuned: 3, leftOut: [], fewerStaples: true });
    expect(result.powerLevel.signals.averagePopularity).toBeLessThan(40);
    // The cards shown keep their real numbers.
    expect(Object.values(result.deck.slots).flat().find(c => c.name === 'ramp 0')?.popularity ?? 0.6).toBe(0.6);
  });

  it('puts in a Game Changer to go up, in a slot of the deck', () => {
    // Ranked below everything else, so the plain build passes it over.
    const cards = pool(0.35, [gameChanger('Smothering Tithe', { popularity: 0.05 })]);
    expect(names(buildDeck(input(cards)).deck)).not.toContain('Smothering Tithe');

    const result = buildDeckForBracket(input(cards), 3);
    expect(result.bracketTuning).toMatchObject({ reached: 3, untuned: 2, leftOut: [] });
    expect(result.bracketTuning!.added).toEqual([{ name: 'Smothering Tithe', reason: 'On the Game Changers list' }]);
    expect(names(result.deck)).toContain('Smothering Tithe');
    expect(result.deck.totalCards).toBe(100);
    expect(result.deck.slots.synergy).toHaveLength(25);
  });

  it('adds only what the build may use: an owned-only build without the card stays where it is and says so', () => {
    const cards = pool(0.35, [gameChanger('Smothering Tithe', { popularity: 0.05 })]);
    const owned = cards.filter(card => !card.gameChanger).map(card => card.name);
    const result = buildDeckForBracket(input(cards, { mode: 'owned-only' }, owned), 3);
    expect(result.bracketTuning).toMatchObject({ target: 3, reached: 2, added: [] });
    expect(result.powerLevel.targetBracket).toBe(3);
  });

  it('never goes above the target to get nearer to it', () => {
    // From Bracket 1 the only card on offer would make it a 3.
    const cards = pool(0.2, [gameChanger('Smothering Tithe', { popularity: 0.05 })]);
    const result = buildDeckForBracket(input(cards), 2);
    expect(result.bracketTuning).toMatchObject({ reached: 1, untuned: 1, added: [] });
    expect(names(result.deck)).not.toContain('Smothering Tithe');
  });
});

describe('buildDeckForBracket, choosing what to change', () => {
  it('does not leave out a tutor that is not what holds the bracket up', () => {
    // Bracket 3 on widely played cards alone; one cheap tutor is along for the ride.
    const onTheme = Array.from({ length: 70 }, (_, i) =>
      rec(`Theme ${i}`, (['ramp', 'draw', 'interaction', 'synergy'] as const)[i % 4]!, { popularity: 0.33, synergy: 0.8 }),
    );
    const cards = pool(0.6, [...onTheme, rec('Demonic Tutor', 'synergy', { popularity: 0.9, synergy: 0.9 })]);
    const result = buildDeckForBracket(input(cards), 2);
    expect(result.bracketTuning).toMatchObject({ reached: 2, leftOut: [], fewerStaples: true });
    expect(names(result.deck)).toContain('Demonic Tutor');
  });

  it('takes the change that lands on the target over one that goes past it', () => {
    // Either a Game Changer or a combo holds this deck at 4. Without the Game Changer it is a 3; without the combo too.
    const cards = pool(0.35, [
      gameChanger('Rhystic Study'),
      rec('Combo Half', 'synergy', { popularity: 0.8 }),
      rec('Other Half', 'synergy', { popularity: 0.7 }),
    ]);
    const combosOf = (deck: DeckList): ComboResult[] =>
      ['Combo Half', 'Other Half'].every(name => names(deck).includes(name))
        ? [{ id: 'c1', uses: ['Combo Half', 'Other Half'], cardCount: 2, produces: ['Infinite mana'] }]
        : [];
    const result = buildDeckForBracket(input(cards), 3, combosOf);
    expect(result.bracketTuning).toMatchObject({ reached: 3, untuned: 4 });
    expect(result.bracketTuning!.leftOut).toHaveLength(1);
  });

  it('counts a commander on the Game Changers list', () => {
    const marked = { ...profile, commander: { ...profile.commander, gameChanger: true } };
    const result = buildDeck({ ...input(pool(0.2)), profile: marked });
    expect(result.powerLevel.signals.gameChangers).toEqual([profile.commander.name]);
    expect(result.powerLevel.bracket).toBe(3);
    // It cannot be left out, so a lower target is reported as out of reach rather than looped on.
    expect(buildDeckForBracket({ ...input(pool(0.2)), profile: marked }, 2).bracketTuning).toMatchObject({ reached: 3, leftOut: [] });
  });
});

import { describe, it, expect } from 'vitest';
import type { MetaArchetype, MetaSnapshot, TournamentDeck } from '@mtg/meta-decks/types';
import { parseDeckText } from './deck-text';
import { checkDeck, deckFromTournamentList } from './service';
import type { AdvisorData } from './service';
import { TextModel } from './similarity';
import { buildTestIndex, collectionOf } from './testing/fixtures';

const index = buildTestIndex();

const winner: TournamentDeck = {
  player: 'alice', result: '1st Place', uri: 'https://example.test/list', event: 'Test Challenge', date: '2026-11-01',
  main: [
    { name: 'Slickshot Show-Off', count: 4 }, { name: 'Opt', count: 4 }, { name: 'Shock', count: 4 },
    { name: 'Lightning Strike', count: 4 }, { name: 'Steam Vents', count: 4 }, { name: 'Mountain', count: 40 },
  ],
  side: [{ name: 'Negate', count: 3 }],
};

const prowess: MetaArchetype = {
  id: 'izzet-prowess', name: 'Izzet Prowess', colors: ['U', 'R'], deckCount: 40, metaShare: 0.1, matchWins: 60, matchLosses: 40,
  cards: [
    { name: 'Slickshot Show-Off', mainShare: 1, mainAvg: 4, sideShare: 0, sideAvg: 0 },
    { name: 'Opt', mainShare: 0.95, mainAvg: 4, sideShare: 0, sideAvg: 0 },
    { name: 'Shock', mainShare: 0.9, mainAvg: 3.8, sideShare: 0, sideAvg: 0 },
    { name: 'Lightning Strike', mainShare: 0.8, mainAvg: 3.5, sideShare: 0, sideAvg: 0 },
    { name: 'Steam Vents', mainShare: 0.9, mainAvg: 4, sideShare: 0, sideAvg: 0 },
    { name: 'Negate', mainShare: 0, mainAvg: 0, sideShare: 0.7, sideAvg: 2.4 },
    { name: 'Crackling Cyclops', mainShare: 0.3, mainAvg: 2, sideShare: 0, sideAvg: 0 },
  ],
  representative: winner, otherLists: [],
};

const snapshot: MetaSnapshot = {
  format: 'standard', generatedAt: '2026-11-09T00:00:00Z', from: '2026-10-01', to: '2026-11-08',
  eventCount: 10, totalDecks: 400, minMatchesForWinRate: 50, archetypes: [prowess], sources: [],
};

const data: AdvisorData = { index, text: new TextModel(index), meta: new Map([['standard', snapshot]]) };
const nothing = collectionOf({});

describe('checkDeck', () => {
  it('reads a pasted list against the archetype it resembles, and says how closely', () => {
    const pasted = parseDeckText('4 Slickshot Show-Off\n4 Opt\n4 Shock\n4 Hulking Raptor\n44 Mountain');
    const check = checkDeck(pasted, 'standard', nothing, data);

    expect(check.archetype).toBeUndefined();
    expect(check.tune).toMatchObject({ archetypeId: 'izzet-prowess', archetype: 'Izzet Prowess', lists: 40 });
    expect(check.tune!.similarity).toBeGreaterThan(0.4);
    expect(check.tune!.missingStaples.map(row => row.card.name)).toEqual(['Steam Vents', 'Lightning Strike']);
    expect(check.tune!.unusual.map(row => row.card.name)).toEqual(['Hulking Raptor']);
    expect(check.tune!.sideboardStaples.map(row => row.card.name)).toEqual(['Negate']);
  });

  it('lets the resembled archetype inform the stand-ins of a pasted list', () => {
    const pasted = parseDeckText('4 Slickshot Show-Off\n4 Opt\n4 Shock\n4 Lightning Strike\n44 Mountain');
    const check = checkDeck(pasted, 'standard', collectionOf({ 'Crackling Cyclops': 4 }), data);
    const standIn = check.cards.find(card => card.name === 'Slickshot Show-Off')!.substitutes[0]!;

    // Only the matched archetype can tell that its lists play the stand-in too.
    expect(standIn.card.name).toBe('Crackling Cyclops');
    expect(standIn.reasons.join(' ')).toContain('In 30% of Izzet Prowess main decks');
  });

  it('compares a list taken from the meta with its own archetype, without a similarity', () => {
    const check = checkDeck(deckFromTournamentList(winner, 'Izzet Prowess'), 'standard', nothing, data, { archetype: prowess });

    expect(check.archetype).toBe('Izzet Prowess');
    expect(check.tune).toMatchObject({ archetypeId: 'izzet-prowess', missingStaples: [], unusual: [] });
    expect(check.tune).not.toHaveProperty('similarity');
  });

  it('has no comparison where the format has no meta, or nothing in it is close', () => {
    const elves = parseDeckText('4 Llanowar Elves\n4 Elvish Mystic\n52 Forest');
    expect(checkDeck(elves, 'historic', nothing, data).tune).toBeUndefined();
    expect(checkDeck(elves, 'standard', nothing, data).tune).toBeUndefined();
  });

  it('reports what keeps the list from being a legal deck', () => {
    const check = checkDeck(parseDeckText('4 Shock\n4 Opt\n20 Island'), 'standard', nothing, data);
    expect(check.issues).toEqual([{ kind: 'size', message: '28 cards in the main deck. Standard needs at least 60.', cards: [] }]);
    expect(checkDeck(deckFromTournamentList(winner), 'standard', nothing, data, { archetype: prowess }).issues).toEqual([]);
  });
});

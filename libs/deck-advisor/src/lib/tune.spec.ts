import { describe, it, expect } from 'vitest';
import type { ArchetypeCard, MetaArchetype, MetaSnapshot } from '@mtg/meta-decks/types';
import { parseDeckText } from './deck-text';
import { buildTestIndex, collectionOf } from './testing/fixtures';
import { nearestArchetype, tuneDeck } from './tune';

const index = buildTestIndex();

const card = (name: string, mainShare: number, mainAvg: number, sideShare = 0, sideAvg = 0): ArchetypeCard =>
  ({ name, mainShare, mainAvg, sideShare, sideAvg });

function archetype(id: string, name: string, cards: ArchetypeCard[], extra: Partial<MetaArchetype> = {}): MetaArchetype {
  const list = { player: 'p', result: '1st Place', uri: '', event: 'e', date: '2026-11-01', main: [], side: [] };
  return {
    id, name, colors: [], deckCount: 40, metaShare: 0.1, matchWins: 0, matchLosses: 0,
    cards, representative: list, otherLists: [], ...extra,
  };
}

const prowess = archetype('izzet-prowess', 'Izzet Prowess', [
  card('Slickshot Show-Off', 1, 4),
  card('Opt', 0.95, 4),
  card('Shock', 0.9, 3.8),
  card('Lightning Strike', 0.8, 3.5),
  card('Steam Vents', 0.9, 4),
  card('Mountain', 1, 6),
  card('Tempest Angler', 0.05, 2),
  card('Negate', 0.1, 1, 0.7, 2.4),
  card('Abrade', 0, 0, 0.65, 2),
]);
const black = archetype('mono-black', 'Mono-Black Midrange', [
  card('Sheoldred, the Apocalypse', 1, 4),
  card('Go for the Throat', 1, 4),
  card('Cut Down', 0.9, 3.6),
  card('Duress', 0.5, 2, 0.6, 2),
  card('Swamp', 1, 20),
]);
const other = archetype('ur-other', 'Izzet Other', [card('Opt', 1, 4), card('Shock', 1, 4)], { isOther: true });

const snapshot: MetaSnapshot = {
  format: 'standard', generatedAt: '2026-11-09T00:00:00Z', from: '2026-10-01', to: '2026-11-08',
  eventCount: 10, totalDecks: 400, minMatchesForWinRate: 50, archetypes: [black, prowess, other], sources: [],
};

const mine = parseDeckText(
  '4 Slickshot Show-Off\n4 Opt\n2 Shock\n4 Tempest Angler\n4 Hulking Raptor\n4 Izzet Guildgate\n18 Mountain\n\nSideboard\n2 Duress',
);

describe('nearestArchetype', () => {
  it('picks the archetype whose usual spells the list shares most', () => {
    const match = nearestArchetype(mine, snapshot, index);
    expect(match?.archetype.id).toBe('izzet-prowess');
    expect(match!.similarity).toBeGreaterThan(0.4);
    expect(match!.similarity).toBeLessThan(1);
  });

  it('scores a list of exactly the usual copies higher than one that strays', () => {
    const typical = parseDeckText('4 Slickshot Show-Off\n4 Opt\n4 Shock\n3 Lightning Strike\n20 Mountain');
    expect(nearestArchetype(typical, snapshot, index)!.similarity).toBeGreaterThan(nearestArchetype(mine, snapshot, index)!.similarity);
  });

  it('never matches a colours-only bucket, and gives up when nothing is close', () => {
    // Opt and Shock alone are exactly the "Izzet Other" bucket and too little of Izzet Prowess.
    expect(nearestArchetype(parseDeckText('4 Hulking Raptor\n4 Essence Scatter\n1 Opt\n20 Island'), snapshot, index)).toBeUndefined();
    expect(nearestArchetype(parseDeckText('20 Island\n20 Mountain'), snapshot, index)).toBeUndefined();
  });

  it('does not read a list as an archetype in colours the list does not play', () => {
    // The same red spells head two archetypes; only one of them is mono-red.
    const red = [card('Slickshot Show-Off', 1, 4), card('Shock', 1, 4), card('Lightning Strike', 1, 4)];
    const monoRed = archetype('mono-red', 'Mono-Red Aggro', red, { colors: ['R'] });
    const izzet = archetype('izzet', 'Izzet Aggro', [...red, card('Negate', 0.2, 1)], { colors: ['U', 'R'] });
    const both: MetaSnapshot = { ...snapshot, archetypes: [izzet, monoRed] };

    const list = parseDeckText('4 Slickshot Show-Off\n4 Shock\n4 Lightning Strike\n20 Mountain');
    expect(nearestArchetype(list, both, index)?.archetype.id).toBe('mono-red');
    const splashing = parseDeckText('4 Slickshot Show-Off\n4 Shock\n4 Lightning Strike\n4 Opt\n4 Negate\n20 Mountain');
    expect(nearestArchetype(splashing, both, index)?.archetype.id).toBe('izzet');
  });

  it('ignores lands: the same spells on another mana base are the same deck', () => {
    const a = parseDeckText('4 Slickshot Show-Off\n4 Opt\n4 Shock\n20 Mountain');
    const b = parseDeckText('4 Slickshot Show-Off\n4 Opt\n4 Shock\n4 Izzet Guildgate\n8 Island\n8 Mountain');
    expect(nearestArchetype(a, snapshot, index)!.similarity).toBe(nearestArchetype(b, snapshot, index)!.similarity);
  });
});

describe('tuneDeck', () => {
  const owned = collectionOf({ 'Lightning Strike': 4, Shock: 2, Negate: 1 });
  const tune = tuneDeck(mine, nearestArchetype(mine, snapshot, index)!, owned, index)!;
  const names = (rows: { card: { name: string } }[]) => rows.map(row => row.card.name);

  it('lists what most lists play that this one lacks or runs clearly fewer of, most played first', () => {
    // Shock: lists run 3.8, this one 2. Lightning Strike and Steam Vents: absent. Opt and the Show-Off: all there.
    expect(names(tune.missingStaples)).toEqual(['Shock', 'Steam Vents', 'Lightning Strike']);
    expect(tune.missingStaples[0]).toMatchObject({ share: 0.9, typicalCopies: 3.8, inDeck: 2, owned: 2, craftRarity: 'common' });
    expect(tune.missingStaples[2]).toMatchObject({ inDeck: 0, owned: 4 });
  });

  it('does not count a land as missing for running fewer copies, or a basic land at all', () => {
    const fewer = parseDeckText('4 Slickshot Show-Off\n4 Opt\n4 Shock\n4 Lightning Strike\n1 Steam Vents\n2 Mountain');
    const result = tuneDeck(fewer, { archetype: prowess, similarity: 0.9 }, owned, index)!;
    expect(result.missingStaples).toEqual([]);
  });

  it('lists the spells few or none of the lists play, rarest first', () => {
    // Hulking Raptor is in no list at all; Tempest Angler in one of twenty. The Guildgate is a land.
    expect(names(tune.unusual)).toEqual(['Hulking Raptor', 'Tempest Angler']);
    expect(tune.unusual[0]).toMatchObject({ share: 0, inDeck: 4 });
  });

  it('lists the sideboard cards most lists bring that this list has nowhere', () => {
    expect(names(tune.sideboardStaples)).toEqual(['Negate', 'Abrade']);
    expect(tune.sideboardStaples[0]).toMatchObject({ share: 0.7, typicalCopies: 2.4, owned: 1 });
  });

  it('says nothing about an archetype with a handful of lists', () => {
    const thin = { ...prowess, deckCount: 4 };
    expect(tuneDeck(mine, { archetype: thin, similarity: 0.8 }, owned, index)).toBeUndefined();
  });
});

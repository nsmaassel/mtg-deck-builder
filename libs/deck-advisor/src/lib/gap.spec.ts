import { describe, it, expect } from 'vitest';
import { parseDeckText } from './deck-text';
import { analyzeGap, deckColors, isCastable } from './gap';
import { buildTestIndex, collectionOf } from './testing/fixtures';

const index = buildTestIndex();

function gapFor(deckText: string, cards: Record<string, number>, wildcards?: Parameters<typeof collectionOf>[1], format = 'standard' as const) {
  return analyzeGap(parseDeckText(deckText), collectionOf(cards, wildcards), index, format);
}

describe('analyzeGap', () => {
  it('counts owned and missing copies and the wildcards the missing ones cost', () => {
    const gap = gapFor('4 Slickshot Show-Off\n4 Shock\n2 Sheoldred, the Apocalypse\n', {
      'Slickshot Show-Off': 1,
      Shock: 4,
    });
    expect(gap.totalCards).toBe(10);
    expect(gap.ownedCards).toBe(5);
    expect(gap.completion).toBe(0.5);
    expect(gap.wildcardsNeeded).toEqual({ common: 0, uncommon: 0, rare: 3, mythic: 2 });
    expect(gap.cards.map(c => [c.name, c.status, c.missing])).toEqual([
      ['Slickshot Show-Off', 'partial', 3],
      ['Shock', 'owned', 0],
      ['Sheoldred, the Apocalypse', 'missing', 2],
    ]);
  });

  it('treats basic lands as always owned', () => {
    const gap = gapFor('20 Mountain\n4 Shock\n', { Shock: 4 });
    expect(gap.completion).toBe(1);
    expect(gap.craftable).toBe(true);
  });

  it('hands owned copies to the main deck before the sideboard', () => {
    const gap = gapFor('Deck\n3 Negate\n\nSideboard\n2 Negate\n', { Negate: 3 });
    const [main, side] = gap.cards;
    expect([main?.board, main?.owned, main?.missing]).toEqual(['main', 3, 0]);
    expect([side?.board, side?.owned, side?.missing]).toEqual(['sideboard', 0, 2]);
  });

  it('counts a companion once when Arena lists it in the sideboard too', () => {
    const gap = gapFor('Companion\n1 Negate\n\nDeck\n4 Shock\n\nSideboard\n1 Negate\n', { Shock: 4, Negate: 1 });
    expect(gap.totalCards).toBe(5);
    expect(gap.completion).toBe(1);
  });

  it('says whether the wildcard inventory covers the crafts', () => {
    const deck = '4 Slickshot Show-Off\n2 Sheoldred, the Apocalypse\n';
    const enough = gapFor(deck, {}, { common: 0, uncommon: 0, rare: 4, mythic: 2 });
    expect(enough.craftable).toBe(true);
    expect(enough.wildcardsShort).toEqual({ common: 0, uncommon: 0, rare: 0, mythic: 0 });

    const short = gapFor(deck, {}, { common: 9, uncommon: 9, rare: 1, mythic: 2 });
    expect(short.craftable).toBe(false);
    expect(short.wildcardsShort).toEqual({ common: 0, uncommon: 0, rare: 3, mythic: 0 });
  });

  it('leaves craftable undefined when cards are missing and no inventory is known', () => {
    expect(gapFor('4 Slickshot Show-Off\n', {}).craftable).toBeUndefined();
  });

  it('flags cards that are not legal in the format and never counts them as owned', () => {
    const gap = gapFor('4 Brainstorm\n', { Brainstorm: 4 });
    expect(gap.cards[0]?.status).toBe('not-legal');
    expect(gap.cards[0]?.owned).toBe(0);
    expect(gap.wildcardsNeeded).toEqual({ common: 0, uncommon: 0, rare: 0, mythic: 0 });
    expect(gap.craftable).toBe(false);
  });

  it('flags cards that do not exist on Arena in an Arena format', () => {
    const gap = analyzeGap(parseDeckText('4 Hidden Strings\n'), collectionOf({}), index, 'pioneer');
    expect(gap.cards[0]?.status).toBe('not-on-arena');
    expect(gap.cards[0]?.craftRarity).toBeUndefined();
    expect(gap.wildcardsNeeded).toEqual({ common: 0, uncommon: 0, rare: 0, mythic: 0 });
    expect(gap.craftable).toBe(false);
  });

  it('does not ask for wildcards in a paper format', () => {
    const gap = analyzeGap(parseDeckText('1 Mana Crypt\n'), collectionOf({}), index, 'commander');
    expect(gap.cards[0]?.status).toBe('missing');
    expect(gap.cards[0]?.craftRarity).toBeUndefined();
    expect(gap.wildcardsNeeded).toEqual({ common: 0, uncommon: 0, rare: 0, mythic: 0 });
  });

  it('reports names that match no card', () => {
    const gap = gapFor('4 Shock\n2 Totally Made Up Card\n', { Shock: 4 });
    expect(gap.cards[1]).toMatchObject({ name: 'Totally Made Up Card', status: 'unknown', missing: 2 });
    expect(gap.craftable).toBe(false);
  });

  it('lets a playset cover any number of copies', () => {
    const gap = gapFor('7 Shock\n', { Shock: 4 });
    expect(gap.cards[0]?.missing).toBe(0);
  });

  it('resolves names the way sources write them', () => {
    const gap = gapFor('4 callous sell-sword\n', { 'Callous Sell-Sword // Burn Together': 4 });
    expect(gap.cards[0]).toMatchObject({ name: 'Callous Sell-Sword // Burn Together', status: 'owned' });
  });
});

describe('deckColors', () => {
  it('uses the commander\'s colour identity when there is one', () => {
    const deck = parseDeckText('Commander\n1 Niv-Mizzet, Parun\n\nDeck\n1 Go for the Throat\n');
    expect(deckColors(deck, index)).toEqual(['U', 'R']);
  });

  it('reads the colours a 60-card deck needs from its spells', () => {
    expect(deckColors(parseDeckText('4 Shock\n4 Opt\n20 Island\n'), index)).toEqual(['U', 'R']);
  });

  it('does not add a colour for the other half of an adventure card', () => {
    const deck = parseDeckText('4 Shock\n4 Callous Sell-Sword // Burn Together\n20 Mountain\n');
    expect(deckColors(deck, index)).toEqual(['R']);
  });

  it('ignores a stray sideboard card in another colour', () => {
    const deck = parseDeckText('Deck\n4 Shock\n4 Opt\n\nSideboard\n1 Llanowar Elves\n');
    expect(deckColors(deck, index)).toEqual(['U', 'R']);
  });

  it('ignores a one-of in another colour but keeps a real splash', () => {
    expect(deckColors(parseDeckText('4 Shock\n4 Opt\n1 Cut Down\n'), index)).toEqual(['U', 'R']);
    expect(deckColors(parseDeckText('4 Shock\n4 Opt\n3 Cut Down\n'), index)).toEqual(['U', 'B', 'R']);
  });

  it('falls back to what the lands make for a deck with no coloured spells', () => {
    expect(deckColors(parseDeckText('4 Soul-Guide Lantern\n10 Island\n'), index)).toEqual(['U']);
  });
});

describe('isCastable', () => {
  it('accepts a hybrid card when either colour is available', () => {
    const angler = index.byName('Tempest Angler')!;
    expect(isCastable(angler, ['R'])).toBe(true);
    expect(isCastable(angler, ['U'])).toBe(true);
    expect(isCastable(angler, ['G'])).toBe(false);
  });

  it('judges an adventure card by its front face', () => {
    const sellSword = index.byName('Callous Sell-Sword')!;
    expect(isCastable(sellSword, ['B'])).toBe(true);
    expect(isCastable(sellSword, ['R'])).toBe(false);
  });

  it('accepts colourless cards anywhere', () => {
    expect(isCastable(index.byName('Soul-Guide Lantern')!, [])).toBe(true);
  });
});

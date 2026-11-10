import { describe, it, expect } from 'vitest';
import { formatArenaDeck, parseDeckText } from './deck-text';
import { parseFormat } from './formats';

describe('parseDeckText', () => {
  it('reads an MTG Arena export with sections', () => {
    const deck = parseDeckText(`About
Name Izzet Prowess

Companion
1 Jegantha, the Wellspring (IKO) 222

Deck
4 Slickshot Show-Off (OTJ) 146
4 Opt (FDN) 512
20 Mountain (FDN) 279

Sideboard
2 Negate (FDN) 159
1 Jegantha, the Wellspring (IKO) 222
`);
    expect(deck.name).toBe('Izzet Prowess');
    expect(deck.companion).toEqual([{ name: 'Jegantha, the Wellspring', count: 1 }]);
    expect(deck.main).toEqual([
      { name: 'Slickshot Show-Off', count: 4 },
      { name: 'Opt', count: 4 },
      { name: 'Mountain', count: 20 },
    ]);
    expect(deck.sideboard).toEqual([
      { name: 'Negate', count: 2 },
      { name: 'Jegantha, the Wellspring', count: 1 },
    ]);
    expect(deck.unrecognized).toEqual([]);
  });

  it('reads a Brawl export with a commander', () => {
    const deck = parseDeckText('Commander\n1 Niv-Mizzet, Parun (GRN) 192\n\nDeck\n1 Opt\n1 Shock\n');
    expect(deck.commander).toEqual([{ name: 'Niv-Mizzet, Parun', count: 1 }]);
    expect(deck.main).toHaveLength(2);
  });

  it('reads an MTGO-style list: a full main deck, a blank line, then the sideboard', () => {
    const deck = parseDeckText('4 Shock\n4 Opt\n52 Mountain\n\n2 Negate\n1 Abrade\n');
    expect(deck.main.map(l => l.name)).toEqual(['Shock', 'Opt', 'Mountain']);
    expect(deck.sideboard.map(l => l.name)).toEqual(['Negate', 'Abrade']);
  });

  it('keeps a list grouped by card type in the main deck', () => {
    const deck = parseDeckText('// Creatures\n4 Monastery Swiftspear\n\n// Spells\n4 Lightning Strike\n\n// Lands\n20 Mountain\n');
    expect(deck.main.map(l => l.name)).toEqual(['Monastery Swiftspear', 'Lightning Strike', 'Mountain']);
    expect(deck.sideboard).toEqual([]);
  });

  it('does not mistake a short last group for a sideboard when the rest is not a whole deck', () => {
    const deck = parseDeckText('4 Shock\n4 Opt\n\n2 Negate\n');
    expect(deck.main).toHaveLength(3);
    expect(deck.sideboard).toEqual([]);
  });

  it('takes the sideboard of a grouped list from its last, sideboard-sized group', () => {
    const deck = parseDeckText('20 Shock\n\n20 Opt\n\n20 Mountain\n\n15 Negate\n');
    expect(deck.main.map(l => l.name)).toEqual(['Shock', 'Opt', 'Mountain']);
    expect(deck.sideboard).toEqual([{ name: 'Negate', count: 15 }]);
  });

  it('reads cards before the first header as the main deck', () => {
    const deck = parseDeckText('4 Shock\n\n4 Opt\nSideboard\n2 Negate\n');
    expect(deck.main.map(l => l.name)).toEqual(['Shock', 'Opt']);
    expect(deck.sideboard.map(l => l.name)).toEqual(['Negate']);
  });

  it('treats a commented section name as a header', () => {
    const deck = parseDeckText('4 Shock\n// Sideboard\n2 Negate\n');
    expect(deck.main).toEqual([{ name: 'Shock', count: 4 }]);
    expect(deck.sideboard).toEqual([{ name: 'Negate', count: 2 }]);
  });

  it('does not start a sideboard on a blank line inside an Arena export', () => {
    const deck = parseDeckText('Deck\n4 Shock\n\n4 Opt\n');
    expect(deck.main.map(l => l.name)).toEqual(['Shock', 'Opt']);
    expect(deck.sideboard).toEqual([]);
  });

  it('accepts SB: prefixes, 4x counts, comments and Windows line endings', () => {
    const deck = parseDeckText('// my list\r\n4x Shock\r\n# note\r\nSB: 2 Negate\r\n');
    expect(deck.main).toEqual([{ name: 'Shock', count: 4 }]);
    expect(deck.sideboard).toEqual([{ name: 'Negate', count: 2 }]);
  });

  it('keeps names with commas, apostrophes and split halves intact', () => {
    const deck = parseDeckText("1 Sheoldred, the Apocalypse (DMU) 107\n2 Fire // Ice\n1 Urza's Saga (MH2) 259\n");
    expect(deck.main.map(l => l.name)).toEqual(['Sheoldred, the Apocalypse', 'Fire // Ice', "Urza's Saga"]);
  });

  it('merges repeated lines for the same card', () => {
    const deck = parseDeckText('2 Shock (M21) 159\n2 shock (FDN) 200\n');
    expect(deck.main).toEqual([{ name: 'Shock', count: 4 }]);
  });

  it('reports lines it cannot read instead of guessing', () => {
    const deck = parseDeckText('4 Shock\nthis is not a card line\n');
    expect(deck.main).toHaveLength(1);
    expect(deck.unrecognized).toEqual(['this is not a card line']);
  });

  it('returns an empty deck for empty input', () => {
    const deck = parseDeckText('');
    expect([deck.commander, deck.companion, deck.main, deck.sideboard, deck.unrecognized].flat()).toEqual([]);
  });
});

describe('formatArenaDeck', () => {
  it('writes sections Arena can import and round-trips through the parser', () => {
    const text = formatArenaDeck({
      commander: [{ name: 'Niv-Mizzet, Parun', count: 1 }],
      companion: [],
      main: [{ name: 'Opt', count: 1 }, { name: 'Island', count: 30 }],
      sideboard: [],
    });
    expect(text).toBe('Commander\n1 Niv-Mizzet, Parun\n\nDeck\n1 Opt\n30 Island\n');
    const again = parseDeckText(text);
    expect(again.commander).toEqual([{ name: 'Niv-Mizzet, Parun', count: 1 }]);
    expect(again.main).toEqual([{ name: 'Opt', count: 1 }, { name: 'Island', count: 30 }]);
  });
});

describe('parseFormat', () => {
  it.each([
    ['Standard', 'standard'],
    ['TraditionalStandard', 'standard'],
    ['HistoricBrawl', 'brawl'],
    ['Historic Brawl', 'brawl'],
    ['standard_brawl', 'standardbrawl'],
    ['Explorer', 'pioneer'],
    ['EDH', 'commander'],
  ])('maps %s to %s', (input, expected) => {
    expect(parseFormat(input)).toBe(expected);
  });

  it('returns undefined for formats it does not know', () => {
    expect(parseFormat('Gladiator')).toBeUndefined();
    expect(parseFormat(undefined)).toBeUndefined();
  });

  it('is not fooled by names every object has', () => {
    for (const name of ['constructor', 'toString', 'valueOf', '__proto__', 'hasOwnProperty']) {
      expect(parseFormat(name)).toBeUndefined();
    }
  });
});

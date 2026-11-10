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

  it('treats the first blank line of a headerless list as the start of the sideboard', () => {
    const deck = parseDeckText('4 Shock\n4 Opt\n\n2 Negate\n1 Abrade\n');
    expect(deck.main.map(l => l.name)).toEqual(['Shock', 'Opt']);
    expect(deck.sideboard.map(l => l.name)).toEqual(['Negate', 'Abrade']);
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
});

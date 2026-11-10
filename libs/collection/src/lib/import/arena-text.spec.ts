import { describe, it, expect } from 'vitest';
import { parseArenaText, parseArenaTextLine } from './arena-text';

describe('parseArenaTextLine', () => {
  it.each([
    ['4 Lightning Bolt (M21) 161', { count: 4, name: 'Lightning Bolt', set: 'M21', collectorNumber: '161' }],
    ['4x Luminarch Aspirant (ZNR) #24 [rare]', { count: 4, name: 'Luminarch Aspirant', set: 'ZNR', collectorNumber: '24' }],
    ['2x Lightning Bolt (FCA) #40 [uncommon]', { count: 2, name: 'Lightning Bolt', set: 'FCA', collectorNumber: '40' }],
    ['2 Bonecrusher Giant', { count: 2, name: 'Bonecrusher Giant' }],
    ['4 Momo, Friendly Flier (TLA) 29', { count: 4, name: 'Momo, Friendly Flier', set: 'TLA', collectorNumber: '29' }],
    ['1 Abrade (FDN) 188', { count: 1, name: 'Abrade', set: 'FDN', collectorNumber: '188' }],
    ['1 Nicol Bolas, God-Pharaoh (AKR) 247', { count: 1, name: 'Nicol Bolas, God-Pharaoh', set: 'AKR', collectorNumber: '247' }],
    ["1 Accorder's Shield", { count: 1, name: "Accorder's Shield" }],
    ["1 Atraxa, Praetors' Voice (C16) 36", { count: 1, name: "Atraxa, Praetors' Voice", set: 'C16', collectorNumber: '36' }],
    ['1 Fire // Ice (MH2) 290', { count: 1, name: 'Fire // Ice', set: 'MH2', collectorNumber: '290' }],
    ['3 Kellan, Daring Traveler /// Journey On (WOE) 230', { count: 3, name: 'Kellan, Daring Traveler /// Journey On', set: 'WOE', collectorNumber: '230' }],
    ['1 Wear // Tear', { count: 1, name: 'Wear // Tear' }],
    ['2 Hallowed Fountain (RNA) 123a', { count: 2, name: 'Hallowed Fountain', set: 'RNA', collectorNumber: '123a' }],
    ['1 Ugin, the Spirit Dragon (M21) ★12', { count: 1, name: 'Ugin, the Spirit Dragon', set: 'M21', collectorNumber: '★12' }],
    ['1 Counterspell (PLST) MH2-267', { count: 1, name: 'Counterspell', set: 'PLST', collectorNumber: 'MH2-267' }],
    ['4 Lightning Bolt (M21)', { count: 4, name: 'Lightning Bolt', set: 'M21' }],
    ['4 Luminarch Aspirant (znr) 24', { count: 4, name: 'Luminarch Aspirant', set: 'znr', collectorNumber: '24' }],
    ['1 Xathrid Necromancer (M14) 123', { count: 1, name: 'Xathrid Necromancer', set: 'M14', collectorNumber: '123' }],
    ['4x Xathrid Necromancer', { count: 4, name: 'Xathrid Necromancer' }],
    ['3X Opt', { count: 3, name: 'Opt' }],
    ['1 Borrowing 100,000 Arrows', { count: 1, name: 'Borrowing 100,000 Arrows' }],
    ['2 Sheoldred, the Apocalypse (DMU) 107 *F*', { count: 2, name: 'Sheoldred, the Apocalypse', set: 'DMU', collectorNumber: '107' }],
    ['  4   Lightning   Bolt  (M21)   161  ', { count: 4, name: 'Lightning Bolt', set: 'M21', collectorNumber: '161' }],
    ['17 Island (ANB) 113', { count: 17, name: 'Island', set: 'ANB', collectorNumber: '113' }],
  ])('parses %j', (line, expected) => {
    expect(parseArenaTextLine(line)).toEqual(expected);
  });

  it.each([
    'Lightning Bolt',
    'Deck',
    'MTGA Collection Export',
    'Unique cards: 3512',
    'x4 Lightning Bolt',
    '4xLightning Bolt',
    '4',
    '',
    '99999999999999999999999 Island',
  ])('rejects %j', (line) => {
    expect(parseArenaTextLine(line)).toBeNull();
  });

  it('rejects over-long lines quickly instead of backtracking through them', () => {
    const started = Date.now();
    expect(parseArenaTextLine(`1 ${' ['.repeat(200_000)}`)).toBeNull();
    expect(parseArenaTextLine(`1 a${' '.repeat(200_000)}b`)).toBeNull();
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe('parseArenaText', () => {
  it('reads an Arena export (F10)', () => {
    const imp = parseArenaText('4 Momo, Friendly Flier (TLA) 29\n1 Abrade (FDN) 188\n');
    expect(imp.format).toBe('arena-text');
    expect(imp.entries).toEqual([
      { count: 4, name: 'Momo, Friendly Flier', set: 'TLA', collectorNumber: '29' },
      { count: 1, name: 'Abrade', set: 'FDN', collectorNumber: '188' },
    ]);
    expect(imp.unrecognizedLines).toEqual([]);
    expect(imp.warnings).toEqual([]);
  });

  it('reads the MTGA Collection Reader text file with its comment line (F3)', () => {
    const imp = parseArenaText(
      '# mtga_collection.txt          one line per printing:  <qty> <name> (<SET>) <collector>\n' +
        '4 Luminarch Aspirant (ZNR) 24\n2 Lightning Bolt (FCA) 40\n',
    );
    expect(imp.entries).toEqual([
      { count: 4, name: 'Luminarch Aspirant', set: 'ZNR', collectorNumber: '24' },
      { count: 2, name: 'Lightning Bolt', set: 'FCA', collectorNumber: '40' },
    ]);
    expect(imp.unrecognizedLines).toEqual([]);
  });

  it('reads the NthPhantom10 text export and skips its header block (F4)', () => {
    const imp = parseArenaText(
      [
        'MTGA Collection Export',
        'Exported: 2026-11-09 21:00:00',
        'Unique cards: 3512',
        'Total cards:   9120',
        '============================================================',
        '4x Luminarch Aspirant (ZNR) #24 [rare]',
        '',
        '2x Lightning Bolt (FCA) #40 [uncommon]',
        '',
      ].join('\n'),
    );
    expect(imp.entries).toEqual([
      { count: 4, name: 'Luminarch Aspirant', set: 'ZNR', collectorNumber: '24' },
      { count: 2, name: 'Lightning Bolt', set: 'FCA', collectorNumber: '40' },
    ]);
    expect(imp.unrecognizedLines).toEqual([]);
    expect(imp.warnings).toEqual([]);
  });

  it('skips the indented description lines of a NthPhantom10 export, even ones that start with a number', () => {
    const imp = parseArenaText(
      [
        'MTGA Collection Export',
        'Exported: 2026-11-09 21:00:00',
        'Unique cards: 2',
        'Total cards:   6',
        '============================================================',
        '2x Lightning Bolt (FCA) #40 [uncommon]',
        '    Instant | {R}',
        '    Lightning Bolt deals',
        '    3 damage to any target.',
        '',
        '4x Luminarch Aspirant (ZNR) #24 [rare]',
        '    Creature — Human Cleric | {1}{W}',
        '',
      ].join('\n'),
    );
    expect(imp.entries.map((e) => e.name)).toEqual(['Lightning Bolt', 'Luminarch Aspirant']);
    expect(imp.unrecognizedLines).toEqual([]);
  });

  it('still reads an indented list that is not a NthPhantom10 export', () => {
    const imp = parseArenaText('    4 Lightning Bolt (M21) 161\n    2 Opt\n');
    expect(imp.entries).toEqual([
      { count: 4, name: 'Lightning Bolt', set: 'M21', collectorNumber: '161' },
      { count: 2, name: 'Opt' },
    ]);
  });

  it('reads the MTGA Deck Advisor and Untapped-script name lists (F6, F11)', () => {
    const imp = parseArenaText("4 Lightning Bolt\n2 Bonecrusher Giant\n1 Accorder's Shield\n");
    expect(imp.entries).toEqual([
      { count: 4, name: 'Lightning Bolt' },
      { count: 2, name: 'Bonecrusher Giant' },
      { count: 1, name: "Accorder's Shield" },
    ]);
  });

  it('skips blank lines, comments and Arena deck section headers', () => {
    const imp = parseArenaText(
      [
        'About',
        'Name Azorius Control',
        '',
        '// my notes',
        '# another note',
        'Commander',
        "1 Atraxa, Praetors' Voice (C16) 36",
        '',
        'Companion',
        '1 Yorion, Sky Nomad (IKO) 232',
        '',
        'Deck',
        '4 Opt (ELD) 59',
        '',
        'Sideboard',
        '2 Negate (ZNR) 71',
      ].join('\n'),
    );
    expect(imp.entries.map((e) => e.name)).toEqual(["Atraxa, Praetors' Voice", 'Yorion, Sky Nomad', 'Opt', 'Negate']);
    expect(imp.unrecognizedLines).toEqual([]);
  });

  it('handles CRLF and lone CR line endings', () => {
    expect(parseArenaText('4 Opt (ELD) 59\r\n2 Negate (ZNR) 71\r\n').entries).toHaveLength(2);
    expect(parseArenaText('4 Opt (ELD) 59\r2 Negate (ZNR) 71\r').entries).toHaveLength(2);
  });

  it('keeps unreadable lines and carries on', () => {
    const imp = parseArenaText('garbage line here\n1 Sol Ring (C21) 263\nLightning Bolt\n');
    expect(imp.entries).toEqual([{ count: 1, name: 'Sol Ring', set: 'C21', collectorNumber: '263' }]);
    expect(imp.unrecognizedLines).toEqual(['garbage line here', 'Lightning Bolt']);
  });

  it('ignores zero-count lines without reporting them', () => {
    const imp = parseArenaText('0 Opt (ELD) 59\n2 Negate (ZNR) 71\n');
    expect(imp.entries).toEqual([{ count: 2, name: 'Negate', set: 'ZNR', collectorNumber: '71' }]);
    expect(imp.unrecognizedLines).toEqual([]);
  });

  it('caps unrecognized lines at 50 and says how many there were', () => {
    const lines = Array.from({ length: 120 }, (_, i) => `not a card ${i}`);
    const imp = parseArenaText(`1 Opt\n${lines.join('\n')}`);
    expect(imp.unrecognizedLines).toHaveLength(50);
    expect(imp.unrecognizedLines[0]).toBe('not a card 0');
    expect(imp.warnings.some((w) => w.includes('120'))).toBe(true);
  });

  it('clips very long unreadable lines', () => {
    const imp = parseArenaText(`${'z'.repeat(5000)}\n1 Opt\n`);
    expect(imp.entries).toHaveLength(1);
    expect(imp.unrecognizedLines).toHaveLength(1);
    expect(imp.unrecognizedLines[0]!.length).toBeLessThanOrEqual(201);
  });

  it('returns an empty import with a warning when nothing parses', () => {
    for (const input of ['', '   \n\n', 'hello\nworld']) {
      const imp = parseArenaText(input);
      expect(imp.entries).toEqual([]);
      expect(imp.warnings.length).toBeGreaterThan(0);
    }
  });
});

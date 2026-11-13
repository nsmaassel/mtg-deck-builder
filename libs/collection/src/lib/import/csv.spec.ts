import { describe, it, expect } from 'vitest';
import { looksLikeCollectionCsv, parseCollectionCsv, readCsv } from './csv';

describe('readCsv', () => {
  const fields = (input: string, delimiter = ',') => readCsv(input, delimiter).map((r) => r.fields);

  it('splits plain records', () => {
    expect(fields('a,b,c\n1,2,3\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('reads quoted fields with delimiters, escaped quotes and line breaks', () => {
    expect(fields('1,"Momo, Friendly Flier",tla\n')).toEqual([['1', 'Momo, Friendly Flier', 'tla']]);
    expect(fields('1,"Kongming, ""Sleeping Dragon""",PTK\n')).toEqual([['1', 'Kongming, "Sleeping Dragon"', 'PTK']]);
    expect(fields('1,"two\nlines",x\n2,b,y')).toEqual([
      ['1', 'two\nlines', 'x'],
      ['2', 'b', 'y'],
    ]);
  });

  it('keeps empty fields, including a trailing one', () => {
    expect(fields('4,Luminarch Aspirant,ZNR,Near Mint,English,,\n')).toEqual([
      ['4', 'Luminarch Aspirant', 'ZNR', 'Near Mint', 'English', '', ''],
    ]);
  });

  it('accepts CRLF, lone CR and a missing final newline', () => {
    expect(fields('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(fields('a,b\r1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('uses the delimiter it is given', () => {
    expect(fields('4;Luminarch Aspirant;znr;24;rare', ';')).toEqual([['4', 'Luminarch Aspirant', 'znr', '24', 'rare']]);
  });

  it('survives an unterminated quote', () => {
    expect(fields('1,"never closed\n2,x')).toEqual([['1', 'never closed\n2,x']]);
  });

  it('keeps the raw text of each record', () => {
    expect(readCsv('a,b\n1,"x, y"\n', ',').map((r) => r.raw)).toEqual(['a,b', '1,"x, y"']);
  });
});

describe('parseCollectionCsv', () => {
  it('reads the MTGA Collection Reader CSV (F3)', () => {
    const imp = parseCollectionCsv(
      'Count,Name,Edition,Collector Number,Condition,Language,Foil,Tag\n4,Luminarch Aspirant,ZNR,24,Near Mint,English,,\n',
    );
    expect(imp.format).toBe('csv');
    expect(imp.entries).toEqual([{ count: 4, name: 'Luminarch Aspirant', set: 'ZNR', collectorNumber: '24' }]);
    expect(imp.warnings).toEqual([]);
    expect(imp.unrecognizedLines).toEqual([]);
  });

  it('reads the NthPhantom10 Moxfield file (F4)', () => {
    const imp = parseCollectionCsv('Count,Name,Edition,Condition,Language,Foil,Tag\n4,Luminarch Aspirant,ZNR,Near Mint,English,,\n');
    expect(imp.entries).toEqual([{ count: 4, name: 'Luminarch Aspirant', set: 'ZNR' }]);
  });

  it('reads the Deckbox file and does not mistake Tradelist Count for the count (F4)', () => {
    const imp = parseCollectionCsv(
      'Count,Tradelist Count,Name,Edition,Card Number,Condition,Language,Foil,Signed,Artist Proof,Altered Art,Misprint,Promo,Textless,My Price\n' +
        '4,0,Luminarch Aspirant,Zendikar Rising,24,Near Mint,English,,,,,,,,\n',
    );
    expect(imp.entries).toEqual([{ count: 4, name: 'Luminarch Aspirant', set: 'Zendikar Rising', collectorNumber: '24' }]);
  });

  it('reads the MTGGoldfish file (F4)', () => {
    const imp = parseCollectionCsv('Card,Set,Quantity\nLuminarch Aspirant,ZNR,4\n"Momo, Friendly Flier",TLA,2\n');
    expect(imp.entries).toEqual([
      { count: 4, name: 'Luminarch Aspirant', set: 'ZNR' },
      { count: 2, name: 'Momo, Friendly Flier', set: 'TLA' },
    ]);
  });

  it('reads the Cardsphere file (F4)', () => {
    const imp = parseCollectionCsv('Quantity,Card Name,Set,Foil\n4,Luminarch Aspirant,Zendikar Rising,\n');
    expect(imp.entries).toEqual([{ count: 4, name: 'Luminarch Aspirant', set: 'Zendikar Rising' }]);
  });

  it('reads the semicolon-separated MTG Arena Tool file and warns about what it leaves out (F5)', () => {
    const imp = parseCollectionCsv('Count;Name;Edition;Collector Number;Rarity\n4;Luminarch Aspirant;znr;24;rare\n');
    expect(imp.entries).toEqual([{ count: 4, name: 'Luminarch Aspirant', set: 'znr', collectorNumber: '24' }]);
    expect(imp.warnings).toHaveLength(1);
    expect(imp.warnings[0]).toMatch(/basic lands/i);
  });

  it('reads the MartoEporedia file with quoted names (F7)', () => {
    const imp = parseCollectionCsv(
      'Name,Set,CollectorNumber,Rarity,Quantity\n"Nicol Bolas, God-Pharaoh",AKR,247,Mythic,1\nHalf-Elf Monk,AFR,19,Common,4\n',
    );
    expect(imp.entries).toEqual([
      { count: 1, name: 'Nicol Bolas, God-Pharaoh', set: 'AKR', collectorNumber: '247' },
      { count: 4, name: 'Half-Elf Monk', set: 'AFR', collectorNumber: '19' },
    ]);
  });

  it('reads the 13-column Moxfield collection CSV (F8)', () => {
    const imp = parseCollectionCsv(
      'Count,Tradelist Count,Name,Edition,Condition,Language,Foil,Tags,Last Modified,Collector Number,Alter,Proxy,Purchase Price\n' +
        '4,0,"Momo, Friendly Flier",tla,NM,English,,,,29,False,False,\n',
    );
    expect(imp.entries).toEqual([{ count: 4, name: 'Momo, Friendly Flier', set: 'tla', collectorNumber: '29' }]);
    expect(imp.warnings).toEqual([]);
  });

  it('reads the Archidekt collection CSV (F9)', () => {
    const imp = parseCollectionCsv(
      'Quantity,Name,Edition Code,Collector Number,Condition,Language,Foil\n4,"Momo, Friendly Flier",TLA,29,Near Mint,English,\n',
    );
    expect(imp.entries).toEqual([{ count: 4, name: 'Momo, Friendly Flier', set: 'TLA', collectorNumber: '29' }]);
  });

  it('reads tab-separated files, where commas are plain text', () => {
    const imp = parseCollectionCsv('Count\tName\tSet\n4\tMomo, Friendly Flier\tTLA\n');
    expect(imp.entries).toEqual([{ count: 4, name: 'Momo, Friendly Flier', set: 'TLA' }]);
  });

  it('matches headers case-insensitively and accepts the other count and id spellings', () => {
    expect(parseCollectionCsv('QTY,CARD NAME,SET CODE,NUMBER\n2,Opt,ELD,59\n').entries).toEqual([
      { count: 2, name: 'Opt', set: 'ELD', collectorNumber: '59' },
    ]);
    expect(parseCollectionCsv('owned,name,Arena Id\n3,Opt,70123\n').entries).toEqual([{ count: 3, name: 'Opt', arenaId: 70123 }]);
    expect(parseCollectionCsv('Amount,Card,ArenaId\n1,Opt,70123\n').entries).toEqual([{ count: 1, name: 'Opt', arenaId: 70123 }]);
    expect(parseCollectionCsv('GrpId,Quantity\n70123,4\n70124,2\n').entries).toEqual([
      { count: 4, arenaId: 70123 },
      { count: 2, arenaId: 70124 },
    ]);
    expect(parseCollectionCsv('Id,Name,Count\n70123,Opt,4\n').entries).toEqual([{ count: 4, name: 'Opt', arenaId: 70123 }]);
  });

  it('ignores an Id column that does not hold Arena ids', () => {
    const imp = parseCollectionCsv('Id,Name,Count\n0d9a3a09-8a9c-4c4e-9f0c-6e9d1b1f2a33,Opt,4\n');
    expect(imp.entries).toEqual([{ count: 4, name: 'Opt' }]);
  });

  it('reads an Untapped.gg export by its per-printing count, not the per-card count it repeats on every row', () => {
    // The header and rows as Untapped wrote them on 2026-11-12: one row per printing. `Count` is the
    // card's copies across printings (4 on each Opt row); `PrintCount` is this printing's own.
    const imp = parseCollectionCsv(
      [
        'Id,Name,Set,Color,Rarity,Count,PrintCount',
        '6873,"Crash of Rhinos",AA4,Green,Common,0,0',
        '66091,"Opt",XLN,Blue,Common,4,4',
        '70206,"Opt",ELD,Blue,Common,4,2',
        '68310,"Llanowar Elves",M19,Green,Common,4,3',
        '69781,"Llanowar Elves",DAR,Green,Common,4,0',
        '82345,"Sheoldred, the Apocalypse",DMU,Black,Mythic,2,2',
      ].join('\n'),
    );
    expect(imp.warnings).toEqual([]);
    expect(imp.entries).toEqual([
      { count: 4, name: 'Opt', arenaId: 66091, set: 'XLN' },
      { count: 2, name: 'Opt', arenaId: 70206, set: 'ELD' },
      { count: 3, name: 'Llanowar Elves', arenaId: 68310, set: 'M19' },
      { count: 2, name: 'Sheoldred, the Apocalypse', arenaId: 82345, set: 'DMU' },
    ]);
  });

  it('survives an unknown header: extra columns ignored', () => {
    const imp = parseCollectionCsv(
      'Card Name,Set,Rarity,Color,Owned,Missing,Type\n"Sheoldred, the Apocalypse",DMU,Mythic,B,2,2,Creature\nOpt,ELD,Common,U,4,0,Instant\n',
    );
    expect(imp.entries).toEqual([
      { count: 2, name: 'Sheoldred, the Apocalypse', set: 'DMU' },
      { count: 4, name: 'Opt', set: 'ELD' },
    ]);
  });

  it('counts each row once and warns when there is no count column', () => {
    const imp = parseCollectionCsv('Name,Set,Rarity\nOpt,ELD,Common\n"Momo, Friendly Flier",TLA,Rare\n');
    expect(imp.entries).toEqual([
      { count: 1, name: 'Opt', set: 'ELD' },
      { count: 1, name: 'Momo, Friendly Flier', set: 'TLA' },
    ]);
    expect(imp.warnings).toHaveLength(1);
    expect(imp.warnings[0]).toMatch(/count/i);
  });

  it('returns an empty import naming the headers when there is no name or id column', () => {
    const imp = parseCollectionCsv('Foo,Bar,Count\n1,2,3\n');
    expect(imp.entries).toEqual([]);
    expect(imp.unrecognizedLines).toEqual([]);
    expect(imp.warnings).toHaveLength(1);
    expect(imp.warnings[0]).toContain('Foo');
    expect(imp.warnings[0]).toContain('Bar');
    expect(imp.warnings[0]).toContain('Count');
  });

  it('strips a BOM and reads CRLF files', () => {
    const imp = parseCollectionCsv('﻿Count,Name\r\n4,Opt\r\n2,"Fire // Ice"\r\n');
    expect(imp.entries).toEqual([
      { count: 4, name: 'Opt' },
      { count: 2, name: 'Fire // Ice' },
    ]);
  });

  it('skips blank rows, tolerates short rows and ignores zero counts', () => {
    const imp = parseCollectionCsv('Count,Name,Edition,Collector Number\n\n4,Opt\n,,,\n0,Negate,ZNR,71\n2,Shock,M21,159\n');
    expect(imp.entries).toEqual([
      { count: 4, name: 'Opt' },
      { count: 2, name: 'Shock', set: 'M21', collectorNumber: '159' },
    ]);
    expect(imp.unrecognizedLines).toEqual([]);
  });

  it('reports rows it cannot read and caps them at 50', () => {
    const imp = parseCollectionCsv('Count,Name\nmany,Opt\n4,\n2,Shock\n');
    expect(imp.entries).toEqual([{ count: 2, name: 'Shock' }]);
    expect(imp.unrecognizedLines).toEqual(['many,Opt', '4,']);

    const bad = Array.from({ length: 80 }, (_, i) => `x${i},Opt`).join('\n');
    const capped = parseCollectionCsv(`Count,Name\n${bad}\n`);
    expect(capped.unrecognizedLines).toHaveLength(50);
    expect(capped.warnings.some((w) => w.includes('80'))).toBe(true);
  });

  it.each(['', '\n\n', 'Count,Name', 'Count,Name\n'])('returns an empty import with a warning for %j', (input) => {
    const imp = parseCollectionCsv(input);
    expect(imp.entries).toEqual([]);
    expect(imp.warnings.length).toBeGreaterThan(0);
  });
});

describe('looksLikeCollectionCsv', () => {
  it.each([
    'Count,Name,Edition,Collector Number,Condition,Language,Foil,Tag\n4,Luminarch Aspirant,ZNR,24,Near Mint,English,,\n',
    'Count;Name;Edition;Collector Number;Rarity\n4;Luminarch Aspirant;znr;24;rare\n',
    'Card,Set,Quantity\nOpt,ELD,4\n',
    'Quantity,Card Name,Set,Foil\n',
    '\n\nName,Set,CollectorNumber,Rarity,Quantity\n',
    'GrpId,Quantity\n70123,4\n',
    'Name,Set,Rarity\nOpt,ELD,Common\n',
    'Count\tName\n4\tOpt\n',
  ])('accepts %j', (input) => {
    expect(looksLikeCollectionCsv(input)).toBe(true);
  });

  it.each([
    '',
    '4 Lightning Bolt (M21) 161\n',
    '4 Momo, Friendly Flier (TLA) 29\n',
    'Deck\n4 Opt (ELD) 59\n',
    'Name\nOpt\n',
    'Foo,Bar,Baz\n1,2,3\n',
    'Count,Condition\n1,NM\n',
    '# Name, Count\n4 Opt\n',
  ])('rejects %j', (input) => {
    expect(looksLikeCollectionCsv(input)).toBe(false);
  });
});

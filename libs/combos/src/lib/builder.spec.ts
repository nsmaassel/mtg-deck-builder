import { describe, it, expect } from 'vitest';
import { FORMATS } from '@mtg/card-index';
import type { Format } from '@mtg/card-index';
import { CombosBuilder } from './builder';
import type { SpellbookVariant } from './builder';
import { SOURCE, VARIANTS, buildTestFile, oracleId, testCardIndex, variant } from './testing/fixtures';
import type { CombosFile, SerializedCombo } from './types';

function comboOf(file: CombosFile, id: string): SerializedCombo {
  const combo = file.combos.find(each => each.i === id);
  if (!combo) throw new Error(`no combo ${id} in the file`);
  return combo;
}

/** The formats a combo's mask stands for. */
function legalOf(file: CombosFile, id: string): string[] {
  const { l } = comboOf(file, id);
  return file.formats.filter((_, bit) => (l & (1 << bit)) !== 0);
}

function maskOf(formats: Format[]): number {
  return formats.reduce((mask, format) => mask | (1 << FORMATS.indexOf(format)), 0);
}

function build(...variants: SpellbookVariant[]): CombosFile {
  return buildTestFile(variants);
}

describe('CombosBuilder', () => {
  it('compacts an upstream variant to table indices and leaves the text behind', () => {
    const file = build(
      variant({
        id: '100-200',
        uses: ['Heliod, Sun-Crowned', 'Walking Ballista'],
        produces: [['Infinite damage', 'S'], 'Infinite lifegain triggers'],
        identity: 'W',
        popularity: 9000,
        bracketTag: 'R',
      }),
    );

    expect(file.cards).toEqual([oracleId('Heliod, Sun-Crowned'), oracleId('Walking Ballista')]);
    expect(file.features).toEqual(['Infinite damage', 'Infinite lifegain triggers']);
    expect(file.bracketTags).toEqual(['R']);
    expect(file.requirements).toEqual([]);
    const legal = maskOf(['historic', 'timeless', 'pioneer', 'brawl', 'commander', 'modern', 'legacy', 'vintage']);
    expect(file.combos).toEqual([{ i: '100-200', c: [0, 1], p: [0, 1], k: 'W', l: legal, u: 9000, b: 0 }]);

    const json = JSON.stringify(file);
    for (const leftBehind of ['Step one', 'scryfall', 'tcgplayer', 'Artifact', 'Prerequisites', 'description']) {
      expect(json).not.toContain(leftBehind);
    }
  });

  it('records where the data came from and the bit order of the masks', () => {
    const file = build();
    expect(file.version).toBe(1);
    expect(file.source).toEqual({ timestamp: SOURCE.timestamp, version: SOURCE.version });
    expect(file.builtAt).toBe(SOURCE.builtAt);
    expect(file.formats).toEqual(FORMATS);
    expect(file.combos).toEqual([]);
  });

  it('shares one table entry between every combo that names the same card, requirement or result', () => {
    const file = buildTestFile();
    expect(new Set(file.cards).size).toBe(file.cards.length);
    expect(file.cards.filter(id => id === oracleId('Kiki-Jiki, Mirror Breaker'))).toHaveLength(1);
    expect(file.features.filter(name => name === 'Infinite creature tokens with haste')).toHaveLength(1);
    const kiki = file.cards.indexOf(oracleId('Kiki-Jiki, Mirror Breaker'));
    expect(file.combos.filter(combo => combo.c.includes(kiki))).toHaveLength(5);
  });

  describe('legality', () => {
    const file = buildTestFile();

    it('is where every card is legal in the card index, whatever upstream says', () => {
      // The fixture's upstream legalities claim Standard and Pauper for everything.
      expect(legalOf(file, '100-200')).toEqual(['historic', 'timeless', 'pioneer', 'brawl', 'commander', 'modern', 'legacy', 'vintage']);
      expect(legalOf(file, '300-301')).toEqual(['commander', 'modern', 'legacy', 'vintage']);
    });

    it('covers Historic and Timeless, which upstream has no key for', () => {
      expect(legalOf(file, '500-501')).toContain('historic');
      expect(legalOf(file, '500-501')).toContain('timeless');
    });

    it('is the overlap when the cards are legal in different places', () => {
      // Helix is eternal-only; Dragon's Approach and Coveted Prize go down to Standard.
      expect(legalOf(file, '700-701-702')).toEqual(['commander', 'modern', 'legacy', 'vintage']);
    });

    it('counts a restricted card as legal and a banned one as not', () => {
      // Sol Ring: restricted in Vintage, banned in Legacy. Felidar Guardian: banned in Pioneer.
      expect(legalOf(file, '900-901')).toEqual(['commander', 'vintage']);
      expect(legalOf(file, '310-401')).not.toContain('pioneer');
      expect(legalOf(file, '310-401')).toContain('historic');
    });

    it('keeps a combo that needs a commander out of formats that have none', () => {
      // Both cards are legal from Pioneer up, but K'rrik has to be the commander.
      expect(legalOf(file, '800-801')).toEqual(['brawl', 'commander']);
    });
  });

  it('leaves out variants that are not published, have no specific card, or use a card the index lacks', () => {
    const builder = new CombosBuilder(testCardIndex());
    expect(builder.add(variant({ id: '1-2', uses: ['Scurry Oak', 'Ivy Lane Denizen'], identity: 'G' }))).toBeUndefined();
    expect(builder.add(variant({ id: '1-3', uses: ['Scurry Oak', 'Ivy Lane Denizen'], identity: 'G', status: 'E', popularity: null }))).toBe('status');
    expect(builder.add(variant({ id: '--77', uses: [], requires: ['Persist Creature'], identity: 'C' }))).toBe('no-cards');
    expect(builder.add(variant({ id: '1-4', uses: ['Scurry Oak', 'Unreleased Card'], identity: 'G' }))).toBe('unknown-card');
    expect(builder.add(variant({ id: '1-5', uses: ['Unreleased Card', 'Sol Ring'], identity: 'C' }))).toBe('unknown-card');

    const noOracleId = variant({ id: '1-6', uses: ['Scurry Oak'], identity: 'G' });
    noOracleId.uses[0]!.card.oracleId = null;
    expect(builder.add(noOracleId)).toBe('unknown-card');

    expect(builder.read).toBe(6);
    expect(builder.kept).toBe(1);
    expect(builder.dropped).toEqual({ status: 1, 'no-cards': 1, 'unknown-card': 3 });
    expect(builder.unknownCards).toEqual(new Map([['Unreleased Card', 2], ['Scurry Oak', 1]]));

    const file = builder.build(SOURCE);
    expect(file.combos.map(combo => combo.i)).toEqual(['1-2']);
    // A dropped variant leaves nothing in the tables.
    expect(file.cards).toEqual([oracleId('Scurry Oak'), oracleId('Ivy Lane Denizen')]);
    expect(file.requirements).toEqual([]);
  });

  it('notes extra copies and commanders by position among the cards of the combo', () => {
    const file = buildTestFile();
    const approach = comboOf(file, '700-701-702');
    expect(approach.c.map(card => file.cards[card])).toEqual(
      ['Spellweaver Helix', "Dragon's Approach", 'Coveted Prize'].map(oracleId),
    );
    expect(approach.n).toEqual([1, 2]);
    expect(approach.m).toBeUndefined();

    const krrik = comboOf(file, '800-801');
    expect(krrik.m).toEqual([0]);
    expect(krrik.n).toBeUndefined();
  });

  it('folds a card listed twice into one entry that needs both copies', () => {
    const file = build(variant({ id: '1-1-2', uses: ["Dragon's Approach", 'Coveted Prize', "Dragon's Approach"], identity: 'BR' }));
    const combo = comboOf(file, '1-1-2');
    expect(combo.c).toHaveLength(2);
    expect(combo.n).toEqual([0, 2]);
  });

  it('keeps generic requirements as table index and quantity pairs', () => {
    const file = buildTestFile();
    const altar = comboOf(file, '600-601--90');
    const pairs = [];
    for (let i = 0; i < altar.r!.length; i += 2) pairs.push([file.requirements[altar.r![i]!], altar.r![i + 1]]);
    expect(pairs).toEqual([['Persist Creature', 2], ['Haste Enabler', 1]]);
    expect(comboOf(file, '100-200').r).toBeUndefined();
  });

  it('writes colour identity in WUBRG order and leaves it out for colourless', () => {
    const file = buildTestFile();
    expect(comboOf(file, '310-401').k).toBe('WUR');
    expect(comboOf(file, '300-302').k).toBe('WR');
    expect(comboOf(file, '10-11').k).toBeUndefined();
  });

  it('puts results that stand by themselves ahead of helper triggers, otherwise in upstream order', () => {
    const file = build(
      variant({
        id: '1-2',
        uses: ['Scurry Oak', 'Ivy Lane Denizen'],
        produces: [
          ['Infinite creature ETB', 'H'],
          ['Infinite lifegain triggers', 'C'],
          ['Infinite creature tokens', 'S'],
          ['Infinite creature LTB', 'H'],
          ['Infinite damage', 'S'],
          ['Something new upstream', 'X'],
        ],
        identity: 'G',
      }),
    );
    expect(comboOf(file, '1-2').p.map(feature => file.features[feature])).toEqual([
      'Infinite creature tokens',
      'Infinite damage',
      'Infinite lifegain triggers',
      'Infinite creature ETB',
      'Infinite creature LTB',
      'Something new upstream',
    ]);
  });

  it('writes combos most popular first, then by id, and omits a zero popularity', () => {
    const file = buildTestFile([...VARIANTS].reverse());
    expect(file.combos.map(combo => combo.i)).toEqual([
      '10-11',
      '100-200',
      '300-301',
      '310-401',
      '300-401',
      '300-302',
      '300-303',
      '300-304',
      '500-501',
      '500--77',
      '600-601--90',
      '800-801',
      '700-701-702',
      '900-901',
    ]);
    expect(comboOf(file, '900-901').u).toBeUndefined();
    expect(comboOf(file, '10-11').u).toBe(20000);
  });
});

import { describe, it, expect } from 'vitest';
import { FORMATS } from '@mtg/card-index';
import { COMPLETER_COMBOS, ComboIndex } from './combo-index';
import { byRank } from './order';
import { SOURCE, VARIANTS, buildTestFile, holding, oracleId, testCombos, variant } from './testing/fixtures';
import type { Combo, ComboQuery, CombosFile, SerializedCombo } from './types';

const index = testCombos();

const ids = (combos: Combo[]): string[] => combos.map(combo => combo.id);

/** Owned copies from `{ 'Card Name': copies }`. */
function counts(cards: Record<string, number>): Map<string, number> {
  return new Map(Object.entries(cards).map(([name, copies]) => [oracleId(name), copies]));
}

describe('ComboIndex', () => {
  it('knows its size and where the data came from', () => {
    expect(index.size).toBe(VARIANTS.length);
    expect(index.source).toEqual(SOURCE);
  });

  it('refuses a file format it does not know', () => {
    const file = { ...buildTestFile(), version: 2 } as unknown as CombosFile;
    expect(() => ComboIndex.fromFile(file)).toThrow(/Unsupported combos file version 2/);
  });

  it('gives the same answers whatever order the file lists the combos in', () => {
    const file = buildTestFile();
    const shuffled = ComboIndex.fromFile({ ...file, combos: [...file.combos].reverse() });
    const kiki = oracleId('Kiki-Jiki, Mirror Breaker');
    expect(ids(shuffled.withCard(kiki))).toEqual(ids(index.withCard(kiki)));
  });

  describe('get', () => {
    it('rebuilds a combo from the tables', () => {
      expect(index.get('100-200')).toEqual({
        id: '100-200',
        cards: [oracleId('Heliod, Sun-Crowned'), oracleId('Walking Ballista')],
        commanders: [],
        requirements: [],
        produces: ['Infinite damage', 'Infinite lifegain triggers'],
        identity: ['W'],
        legal: ['historic', 'timeless', 'pioneer', 'brawl', 'commander', 'modern', 'legacy', 'vintage'],
        popularity: 9000,
        bracketTag: 'R',
      });
    });

    it('carries copies, commanders and generic requirements when a combo has them', () => {
      const approach = index.get('700-701-702')!;
      expect(approach.copies).toEqual({ [oracleId("Dragon's Approach")]: 2 });
      expect(approach.identity).toEqual(['B', 'R']);
      expect(index.get('100-200')).not.toHaveProperty('copies');

      expect(index.get('800-801')!.commanders).toEqual([oracleId("K'rrik, Son of Yawgmoth")]);

      const altar = index.get('600-601--90')!;
      expect(altar.requirements).toEqual([
        { name: 'Persist Creature', quantity: 2 },
        { name: 'Haste Enabler', quantity: 1 },
      ]);
      expect(altar.identity).toEqual([]);
      expect(altar.popularity).toBe(600);
    });

    it('finds every combo by id and nothing else', () => {
      for (const { id } of VARIANTS) expect(index.get(id)?.id).toBe(id);
      expect(index.get('100-201')).toBeUndefined();
      expect(index.get('')).toBeUndefined();
    });

    it('leaves out formats this code does not know', () => {
      const file = buildTestFile();
      const renamed = ComboIndex.fromFile({ ...file, formats: file.formats.map(f => (f === 'modern' ? 'frontier' : f)) });
      expect(renamed.get('300-301')!.legal).toEqual(['commander', 'legacy', 'vintage']);
    });
  });

  describe('withCard', () => {
    const kiki = oracleId('Kiki-Jiki, Mirror Breaker');

    it('lists the combos that use a card, most popular first, then by id', () => {
      expect(ids(index.withCard(kiki))).toEqual(['300-301', '300-401', '300-302', '300-303', '300-304']);
    });

    it('stops at the limit', () => {
      expect(ids(index.withCard(kiki, { limit: 2 }))).toEqual(['300-301', '300-401']);
      expect(index.withCard(kiki, { limit: 0 })).toEqual([]);
    });

    it('keeps to a format', () => {
      const felidar = oracleId('Felidar Guardian');
      expect(ids(index.withCard(felidar))).toEqual(['310-401', '300-401']);
      expect(ids(index.withCard(felidar, { format: 'historic' }))).toEqual(['310-401']);
      expect(index.withCard(felidar, { format: 'pioneer' })).toEqual([]);
    });

    it('keeps to combos that fit inside a colour identity', () => {
      expect(ids(index.withCard(kiki, { identity: ['R'] }))).toEqual(['300-301']);
      expect(ids(index.withCard(kiki, { identity: ['R', 'U'] }))).toEqual(['300-301', '300-303', '300-304']);
      expect(ids(index.withCard(kiki, { identity: ['W', 'U', 'B', 'R', 'G'] }))).toHaveLength(5);
      expect(index.withCard(kiki, { identity: [] })).toEqual([]);
    });

    it('can leave out combos that need a generic requirement as well', () => {
      const oak = oracleId('Scurry Oak');
      expect(ids(index.withCard(oak))).toEqual(['500-501', '500--77']);
      expect(ids(index.withCard(oak, { specificOnly: true }))).toEqual(['500-501']);
    });

    it('has nothing for a card no combo uses', () => {
      expect(index.withCard(oracleId('Island'))).toEqual([]);
    });
  });

  describe('complete', () => {
    it('finds the combos whose cards are all held', () => {
      const cards = holding('Heliod, Sun-Crowned', 'Walking Ballista', 'Kiki-Jiki, Mirror Breaker', 'Island');
      expect(ids(index.complete(cards))).toEqual(['100-200']);
      expect(index.complete(new Set())).toEqual([]);
    });

    it('lists them most popular first, then by id', () => {
      const cards = holding(
        'Deceiver Exarch', 'Pestermite', 'Zealous Conscripts', 'Kiki-Jiki, Mirror Breaker',
        'Walking Ballista', 'Heliod, Sun-Crowned', 'Rings of Brighthearth', 'Basalt Monolith',
      );
      expect(ids(index.complete(cards))).toEqual(['10-11', '100-200', '300-301', '300-303', '300-304']);
      expect(ids(index.complete(cards, { limit: 2 }))).toEqual(['10-11', '100-200']);
    });

    it('takes owned copies by card just as well as a set', () => {
      const cards = counts({ 'Heliod, Sun-Crowned': 1, 'Walking Ballista': 4, 'Kiki-Jiki, Mirror Breaker': 2 });
      expect(ids(index.complete(cards))).toEqual(['100-200']);
    });

    it('does not count a card held in zero copies', () => {
      expect(index.complete(counts({ 'Heliod, Sun-Crowned': 0, 'Walking Ballista': 1 }))).toEqual([]);
    });

    it('checks the specific cards only: a generic requirement is for the caller to mention', () => {
      expect(ids(index.complete(holding('Scurry Oak')))).toEqual(['500--77']);
      expect(index.complete(holding('Scurry Oak'), { specificOnly: true })).toEqual([]);
    });

    it('keeps to a format and to a colour identity', () => {
      const cards = holding('Heliod, Sun-Crowned', 'Walking Ballista', 'Basalt Monolith', 'Rings of Brighthearth');
      expect(ids(index.complete(cards))).toEqual(['10-11', '100-200']);
      expect(ids(index.complete(cards, { format: 'pioneer' }))).toEqual(['100-200']);
      expect(ids(index.complete(cards, { format: 'legacy' }))).toEqual(['10-11', '100-200']);
      expect(index.complete(cards, { format: 'standard' })).toEqual([]);
      expect(ids(index.complete(cards, { identity: [] }))).toEqual(['10-11']);
      expect(ids(index.complete(cards, { identity: ['W', 'G'] }))).toEqual(['10-11', '100-200']);
    });

    it('wants every copy a combo needs: a set holds one of each', () => {
      const approach = ['Spellweaver Helix', "Dragon's Approach", 'Coveted Prize'];
      expect(index.complete(holding(...approach))).toEqual([]);
      expect(index.complete(counts({ 'Spellweaver Helix': 1, "Dragon's Approach": 1, 'Coveted Prize': 1 }))).toEqual([]);
      expect(ids(index.complete(counts({ 'Spellweaver Helix': 1, "Dragon's Approach": 2, 'Coveted Prize': 1 })))).toEqual(['700-701-702']);
      expect(ids(index.complete(counts({ 'Spellweaver Helix': 4, "Dragon's Approach": 4, 'Coveted Prize': 4 })))).toEqual(['700-701-702']);
    });

    it('starts afresh on every call', () => {
      index.complete(holding('Heliod, Sun-Crowned', 'Walking Ballista'));
      expect(index.complete(holding('Basalt Monolith', 'Rings of Brighthearth')).map(c => c.id)).toEqual(['10-11']);
    });
  });

  describe('near', () => {
    it('finds combos one card short and names the card', () => {
      expect(index.near(holding('Heliod, Sun-Crowned'))).toEqual([
        { combo: index.get('100-200'), missing: [oracleId('Walking Ballista')] },
      ]);
    });

    it('lists them most popular first, then by id', () => {
      const matches = index.near(holding('Kiki-Jiki, Mirror Breaker'));
      expect(matches.map(match => match.combo.id)).toEqual(['300-301', '300-401', '300-302', '300-303', '300-304']);
      expect(matches.map(match => match.missing)).toEqual(
        ['Zealous Conscripts', 'Felidar Guardian', 'Restoration Angel', 'Deceiver Exarch', 'Pestermite'].map(name => [oracleId(name)]),
      );
      expect(index.near(holding('Kiki-Jiki, Mirror Breaker'), { limit: 2 })).toHaveLength(2);
    });

    it('leaves out complete combos and combos further away', () => {
      const cards = holding('Heliod, Sun-Crowned', 'Walking Ballista', 'Spellweaver Helix');
      expect(index.near(cards)).toEqual([]);
    });

    it('can look further away than one card', () => {
      const matches = index.near(holding('Spellweaver Helix'), { missing: 2 });
      expect(matches.map(match => match.combo.id)).toEqual(['700-701-702']);
      expect(matches[0]!.missing).toEqual([oracleId("Dragon's Approach"), oracleId('Coveted Prize')]);
    });

    it('is the same as complete when nothing may be missing', () => {
      const cards = holding('Heliod, Sun-Crowned', 'Walking Ballista', 'Kiki-Jiki, Mirror Breaker');
      expect(index.near(cards, { missing: 0 })).toEqual([{ combo: index.get('100-200'), missing: [] }]);
    });

    it('counts a card held in too few copies as the missing one', () => {
      const expected = [{ combo: index.get('700-701-702'), missing: [oracleId("Dragon's Approach")] }];
      expect(index.near(holding('Spellweaver Helix', "Dragon's Approach", 'Coveted Prize'))).toEqual(expected);
      expect(index.near(counts({ 'Spellweaver Helix': 1, "Dragon's Approach": 1, 'Coveted Prize': 3 }))).toEqual(expected);
    });

    it('needs the player to hold part of the combo', () => {
      // 500--77 is Scurry Oak plus a generic requirement: one card "short" for anyone at all.
      expect(index.near(new Set())).toEqual([]);
      expect(index.near(holding('Sol Ring')).map(match => match.combo.id)).toEqual(['900-901']);
      expect(index.near(holding('Sol Ring'), { missing: 2 })).toEqual([]);
    });

    it('keeps to a format, a colour identity and specific cards', () => {
      const cards = holding('Felidar Guardian', 'Scurry Oak', "Ashnod's Altar");
      const near = (query: ComboQuery) => index.near(cards, query).map(match => match.combo.id);
      expect(near({})).toEqual(['310-401', '300-401', '500-501', '600-601--90']);
      expect(near({ format: 'historic' })).toEqual(['310-401', '500-501']);
      expect(near({ identity: ['W', 'R'] })).toEqual(['300-401', '600-601--90']);
      expect(near({ specificOnly: true })).toEqual(['310-401', '300-401', '500-501']);
    });
  });

  describe('completers', () => {
    it('ranks the cards that would finish the most combos, then by how popular the best is', () => {
      const cards = holding(
        'Zealous Conscripts', 'Restoration Angel', 'Deceiver Exarch', 'Pestermite', 'Felidar Guardian', 'Heliod, Sun-Crowned',
      );
      const completers = index.completers(cards);
      expect(completers.map(each => [each.oracleId, each.total])).toEqual([
        [oracleId('Kiki-Jiki, Mirror Breaker'), 5],
        [oracleId('Walking Ballista'), 1],
        [oracleId('Saheeli Rai'), 1],
      ]);
      expect(ids(completers[0]!.combos)).toEqual(['300-301', '300-401', '300-302', '300-303', '300-304']);
      expect(completers[1]!.combos).toEqual([index.get('100-200')]);
    });

    it('breaks a tie on popularity by combo id', () => {
      const completers = index.completers(holding('Kiki-Jiki, Mirror Breaker'));
      expect(completers.map(each => each.oracleId)).toEqual(
        ['Zealous Conscripts', 'Felidar Guardian', 'Restoration Angel', 'Deceiver Exarch', 'Pestermite'].map(oracleId),
      );
      expect(index.completers(holding('Kiki-Jiki, Mirror Breaker'), { limit: 2 })).toHaveLength(2);
    });

    it('lists only the most popular few combos of a card but counts them all', () => {
      const partners = [
        'Zealous Conscripts', 'Restoration Angel', 'Deceiver Exarch', 'Pestermite', 'Felidar Guardian', 'Saheeli Rai', 'Sol Ring',
      ];
      const family = testCombos(
        partners.map((partner, n) => variant({ id: `1-${n + 2}`, uses: ['Kiki-Jiki, Mirror Breaker', partner], identity: 'R', popularity: n })),
      );
      const [kiki, ...others] = family.completers(holding(...partners));
      expect(others).toEqual([]);
      expect(kiki!.total).toBe(7);
      expect(kiki!.combos).toHaveLength(COMPLETER_COMBOS);
      expect(ids(kiki!.combos)).toEqual(['1-8', '1-7', '1-6', '1-5', '1-4']);
    });

    it('keeps to a format, a colour identity and specific cards', () => {
      const cards = holding('Felidar Guardian', 'Scurry Oak', "Ashnod's Altar");
      const completers = (query: ComboQuery) => index.completers(cards, query).map(each => each.oracleId);
      expect(completers({})).toEqual(['Saheeli Rai', 'Kiki-Jiki, Mirror Breaker', 'Ivy Lane Denizen', 'Nim Deathmantle'].map(oracleId));
      expect(completers({ format: 'historic' })).toEqual(['Saheeli Rai', 'Ivy Lane Denizen'].map(oracleId));
      expect(completers({ identity: ['W', 'R'] })).toEqual(['Kiki-Jiki, Mirror Breaker', 'Nim Deathmantle'].map(oracleId));
      expect(completers({ specificOnly: true })).toEqual(['Saheeli Rai', 'Kiki-Jiki, Mirror Breaker', 'Ivy Lane Denizen'].map(oracleId));

      const historic = index.completers(cards, { format: 'historic' });
      expect(historic[0]).toEqual({ oracleId: oracleId('Saheeli Rai'), combos: [index.get('310-401')], total: 1 });
    });

    it('offers another copy of a card held in too few', () => {
      const cards = holding('Spellweaver Helix', "Dragon's Approach", 'Coveted Prize');
      expect(index.completers(cards)).toEqual([
        { oracleId: oracleId("Dragon's Approach"), combos: [index.get('700-701-702')], total: 1 },
      ]);
    });

    it('credits a combo to the card it lacks, not to a card it merely shares', () => {
      // One Approach is enough for the second combo, which is short of the Helix instead.
      const two = testCombos([
        variant({ id: '1-2', uses: [{ name: "Dragon's Approach", quantity: 2 }, 'Coveted Prize'], identity: 'R', popularity: 10 }),
        variant({ id: '1-3', uses: ["Dragon's Approach", 'Spellweaver Helix'], identity: 'R', popularity: 20 }),
      ]);
      const completers = two.completers(counts({ "Dragon's Approach": 1, 'Coveted Prize': 1 }));
      expect(completers.map(each => [each.oracleId, each.total, ids(each.combos)])).toEqual([
        [oracleId('Spellweaver Helix'), 1, ['1-3']],
        [oracleId("Dragon's Approach"), 1, ['1-2']],
      ]);
    });

    it('has nothing to offer a player who holds no part of any combo', () => {
      expect(index.completers(new Set())).toEqual([]);
      expect(index.completers(holding('Island'))).toEqual([]);
    });
  });
});

/** A generator of the same numbers every run, so a failure can be repeated. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const CARD_COUNT = 8000;
const COMBO_COUNT = 100_000;
const cardName = (card: number): string => `card-${card}`;

/** As many combos as the real data has, over as many cards, with every optional field in play. */
function syntheticFile(): CombosFile {
  const next = random(20261112);
  const pick = (below: number): number => Math.floor(next() * below);
  const combos: SerializedCombo[] = [];
  for (let n = 0; n < COMBO_COUNT; n++) {
    const cards = new Set<number>();
    // A quarter of the card pool is used far more than the rest, like staples are.
    while (cards.size < 2 + pick(4)) cards.add(next() < 0.5 ? pick(CARD_COUNT / 4) : pick(CARD_COUNT));
    const combo: SerializedCombo = { i: `c${n}`, c: [...cards], p: [pick(50)], l: pick(1 << FORMATS.length) };
    if (next() < 0.02) combo.n = [pick(cards.size), 2];
    if (next() < 0.06) combo.r = [pick(20), 1];
    const identity = [...'WUBRG'].filter(() => next() < 0.4).join('');
    if (identity) combo.k = identity;
    if (next() < 0.6) combo.u = pick(40);
    combos.push(combo);
  }
  return {
    version: 1,
    builtAt: SOURCE.builtAt,
    source: { timestamp: SOURCE.timestamp, version: SOURCE.version },
    formats: FORMATS,
    cards: Array.from({ length: CARD_COUNT }, (_, card) => cardName(card)),
    requirements: Array.from({ length: 20 }, (_, n) => `requirement-${n}`),
    features: Array.from({ length: 50 }, (_, n) => `feature-${n}`),
    bracketTags: [],
    combos,
  };
}

/** The slow, obvious way to answer the same questions, to check the index against. */
function bruteForce(file: CombosFile, owned: ReadonlyMap<string, number>, query: ComboQuery) {
  const bit = query.format === undefined ? 0 : 1 << FORMATS.indexOf(query.format);
  const complete: string[] = [];
  const near: Array<{ id: string; missing: string }> = [];
  for (const combo of [...file.combos].sort(byRank)) {
    if ((combo.l & bit) !== bit) continue;
    if (query.identity && ![...(combo.k ?? '')].every(color => query.identity!.includes(color))) continue;
    if (query.specificOnly && combo.r) continue;
    const needed = (position: number): number => {
      const at = (combo.n ?? []).findIndex((value, i) => i % 2 === 0 && value === position);
      return at === -1 ? 1 : combo.n![at + 1]!;
    };
    const missing = combo.c.filter((card, position) => (owned.get(cardName(card)) ?? 0) < needed(position));
    if (missing.length === 0) complete.push(combo.i);
    if (missing.length === 1 && combo.c.length > missing.length) near.push({ id: combo.i, missing: cardName(missing[0]!) });
  }
  const totals = new Map<string, number>();
  for (const { missing } of near) totals.set(missing, (totals.get(missing) ?? 0) + 1);
  return { complete, near, totals };
}

describe('ComboIndex at the size of the real data', () => {
  const file = syntheticFile();
  const big = ComboIndex.fromFile(file);
  const next = random(7);
  // A whole collection: more distinct cards than the combos use, in one to four copies.
  const collection = new Map<string, number>();
  for (let card = 0; card < 12_000; card++) if (next() < 0.85) collection.set(cardName(card), 1 + Math.floor(next() * 4));
  const everything = { limit: Infinity };

  it.each<[string, ComboQuery]>([
    ['any combo', {}],
    ['one format', { format: 'historic' }],
    ['two colours, specific cards only', { identity: ['U', 'R'], specificOnly: true }],
  ])('agrees with a brute-force search: %s', (_, query) => {
    const expected = bruteForce(file, collection, query);
    expect(expected.complete.length).toBeGreaterThan(100);
    expect(expected.near.length).toBeGreaterThan(100);

    expect(ids(big.complete(collection, { ...query, ...everything }))).toEqual(expected.complete);
    expect(
      big.near(collection, { ...query, ...everything }).map(match => ({ id: match.combo.id, missing: match.missing[0] })),
    ).toEqual(expected.near);

    const completers = big.completers(collection, { ...query, ...everything });
    expect(new Map(completers.map(each => [each.oracleId, each.total]))).toEqual(expected.totals);
    for (let i = 1; i < completers.length; i++) {
      const [before, after] = [completers[i - 1]!, completers[i]!];
      expect(before.total).toBeGreaterThanOrEqual(after.total);
      if (before.total === after.total) {
        expect(before.combos[0]!.popularity).toBeGreaterThanOrEqual(after.combos[0]!.popularity);
      }
      expect(after.combos.length).toBe(Math.min(after.total, COMPLETER_COMBOS));
    }
  });

  it('answers for a whole collection in milliseconds', () => {
    const started = performance.now();
    const rounds = 20;
    for (let round = 0; round < rounds; round++) {
      big.complete(collection, { format: 'historic' });
      big.near(collection, { format: 'historic' });
      big.completers(collection, { format: 'historic' });
    }
    const perQuery = (performance.now() - started) / (rounds * 3);
    // Typically well under 5 ms. The bound is loose so a busy machine does not fail it, yet a scan per card would.
    expect(perQuery).toBeLessThan(100);
  });
});

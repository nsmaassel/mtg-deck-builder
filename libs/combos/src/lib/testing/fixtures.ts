import { CardIndex, CardIndexBuilder } from '@mtg/card-index';
import type { Format } from '@mtg/card-index';
import { CombosBuilder } from '../builder';
import type { SpellbookVariant } from '../builder';
import { ComboIndex } from '../combo-index';
import type { CombosFile } from '../types';

const ETERNAL: Format[] = ['commander', 'modern', 'legacy', 'vintage'];
const PIONEER_UP: Format[] = ['pioneer', 'historic', 'timeless', 'brawl', ...ETERNAL];
const STANDARD_UP: Format[] = ['standard', 'alchemy', 'standardbrawl', ...PIONEER_UP];

/** Card name → Scryfall legalities. Real names, legalities chosen so the formats tell the combos apart. */
const CARDS: Record<string, Record<string, string>> = {
  'Basalt Monolith': legalIn(['commander', 'legacy', 'vintage']),
  'Rings of Brighthearth': legalIn(['commander', 'legacy', 'vintage']),
  'Heliod, Sun-Crowned': legalIn(PIONEER_UP),
  'Walking Ballista': legalIn(PIONEER_UP),
  'Kiki-Jiki, Mirror Breaker': legalIn(ETERNAL),
  'Zealous Conscripts': legalIn(ETERNAL),
  'Restoration Angel': legalIn(ETERNAL),
  'Deceiver Exarch': legalIn(ETERNAL),
  Pestermite: legalIn(ETERNAL),
  'Felidar Guardian': { ...legalIn(PIONEER_UP), pioneer: 'banned' },
  'Saheeli Rai': legalIn(PIONEER_UP),
  'Scurry Oak': legalIn(PIONEER_UP),
  'Ivy Lane Denizen': legalIn(PIONEER_UP),
  "Ashnod's Altar": legalIn(ETERNAL),
  'Nim Deathmantle': legalIn(ETERNAL),
  'Spellweaver Helix': legalIn(ETERNAL),
  "Dragon's Approach": legalIn(STANDARD_UP),
  'Coveted Prize': legalIn(STANDARD_UP),
  "K'rrik, Son of Yawgmoth": legalIn(PIONEER_UP),
  "Bolas's Citadel": legalIn(PIONEER_UP),
  'Sol Ring': { commander: 'legal', vintage: 'restricted', legacy: 'banned' },
  'Hullbreaker Horror': legalIn(STANDARD_UP),
};

function legalIn(formats: readonly Format[]): Record<string, string> {
  return Object.fromEntries(formats.map(format => [format, 'legal']));
}

export function oracleId(name: string): string {
  return `id:${name}`;
}

/** A card index holding the cards the fixture combos use, and nothing else. */
export function testCardIndex(): CardIndex {
  const builder = new CardIndexBuilder();
  for (const [name, legalities] of Object.entries(CARDS)) {
    builder.addPrinting({
      oracle_id: oracleId(name),
      name,
      layout: 'normal',
      set: 'tst',
      rarity: 'rare',
      type_line: 'Artifact',
      legalities,
    });
  }
  return new CardIndex(builder.build({ builtAt: '2026-01-01T00:00:00Z' }));
}

interface UseSpec {
  name: string;
  quantity?: number;
  mustBeCommander?: boolean;
}

interface VariantSpec {
  id: string;
  uses: Array<string | UseSpec>;
  /** Template name, or `[name, quantity]`. */
  requires?: Array<string | [string, number]>;
  /** Feature name (a helper, status `H`), or `[name, status]`. */
  produces?: Array<string | [string, string]>;
  identity: string;
  popularity?: number | null;
  bracketTag?: string;
  status?: string;
}

/**
 * A variant as Commander Spellbook's bulk file has it, including the bulk the builder is meant to
 * leave behind: step text, prices, image links and upstream's own legalities.
 */
export function variant(spec: VariantSpec): SpellbookVariant {
  const shaped = {
    id: spec.id,
    status: spec.status ?? 'OK',
    uses: spec.uses.map((use, position) => {
      const { name, quantity = 1, mustBeCommander = false }: UseSpec = typeof use === 'string' ? { name: use } : use;
      return {
        card: {
          id: 1000 + position,
          name,
          oracleId: oracleId(name),
          spoiler: false,
          faces: 1,
          typeLine: 'Artifact',
          imageUriFrontPng: 'https://cards.scryfall.io/png/front/0/5/05b837a2.png?1783931228',
          imageUriBackPng: null,
        },
        zoneLocations: ['B'],
        battlefieldCardState: '',
        exileCardState: '',
        libraryCardState: '',
        graveyardCardState: '',
        mustBeCommander,
        quantity,
        usedFace: null,
      };
    }),
    requires: (spec.requires ?? []).map((requirement, position) => {
      const [name, quantity]: [string, number] = typeof requirement === 'string' ? [requirement, 1] : requirement;
      return {
        template: { id: 200 + position, name, scryfallQuery: 'otag:example', scryfallApi: 'https://api.scryfall.com/cards/search?q=otag%3Aexample' },
        zoneLocations: ['B'],
        battlefieldCardState: '',
        exileCardState: '',
        libraryCardState: '',
        graveyardCardState: '',
        mustBeCommander: false,
        quantity,
      };
    }),
    produces: (spec.produces ?? ['Infinite storm count']).map((feature, position) => {
      const [name, status]: [string, string] = typeof feature === 'string' ? [feature, 'H'] : feature;
      return { feature: { id: 300 + position, name, uncountable: true, status }, quantity: 1 };
    }),
    of: [{ id: 27507 }],
    includes: [{ id: 27481 }],
    identity: spec.identity,
    manaNeeded: '{3}',
    manaValueNeeded: 3,
    easyPrerequisites: 'All permanents are on the battlefield.',
    notablePrerequisites: '',
    description: 'Step one of the combo.\nStep two of the combo.\nRepeat.',
    notes: '',
    popularity: spec.popularity === undefined ? 0 : spec.popularity,
    salt: null,
    saltVoteCount: 0,
    spoiler: false,
    bracketTag: spec.bracketTag ?? 'E',
    // Deliberately wrong and without Historic or Timeless, as upstream is: the builder must not read these.
    legalities: { commander: true, brawl: true, standardBrawl: true, alchemy: true, vintage: true, legacy: true, modern: true, pioneer: true, standard: true, pauper: true },
    prices: { tcgplayer: '6.43', cardkingdom: '6.68', cardmarket: '4.20' },
    variantCount: 231,
  };
  return shaped;
}

/** The fixture combos, in no particular order. Ids are made up; the Kiki-Jiki family differs by one card each. */
export const VARIANTS: SpellbookVariant[] = [
  variant({ id: '500-501', uses: ['Scurry Oak', 'Ivy Lane Denizen'], produces: [['Infinite creature tokens', 'S'], 'Infinite creature ETB'], identity: 'G', popularity: 1200 }),
  variant({ id: '100-200', uses: ['Heliod, Sun-Crowned', 'Walking Ballista'], produces: ['Infinite lifegain triggers', ['Infinite damage', 'S']], identity: 'W', popularity: 9000, bracketTag: 'R' }),
  variant({ id: '300-304', uses: ['Kiki-Jiki, Mirror Breaker', 'Pestermite'], produces: [['Infinite creature tokens with haste', 'S']], identity: 'UR', popularity: 2000 }),
  variant({ id: '300-301', uses: ['Kiki-Jiki, Mirror Breaker', 'Zealous Conscripts'], produces: [['Infinite creature tokens with haste', 'S']], identity: 'R', popularity: 5000 }),
  variant({ id: '300-303', uses: ['Kiki-Jiki, Mirror Breaker', 'Deceiver Exarch'], produces: [['Infinite creature tokens with haste', 'S']], identity: 'UR', popularity: 2000 }),
  variant({ id: '300-302', uses: ['Kiki-Jiki, Mirror Breaker', 'Restoration Angel'], produces: [['Infinite creature tokens with haste', 'S']], identity: 'RW', popularity: 3000 }),
  variant({ id: '300-401', uses: ['Kiki-Jiki, Mirror Breaker', 'Felidar Guardian'], produces: [['Infinite creature tokens with haste', 'S']], identity: 'RW', popularity: 4000 }),
  variant({ id: '310-401', uses: ['Saheeli Rai', 'Felidar Guardian'], produces: [['Infinite creature tokens with haste', 'S']], identity: 'URW', popularity: 4500 }),
  variant({ id: '500--77', uses: ['Scurry Oak'], requires: ['Gives +1/+1 counter to creatures that enter'], produces: [['Infinite creature tokens', 'S']], identity: 'G', popularity: 800 }),
  variant({ id: '600-601--90', uses: ["Ashnod's Altar", 'Nim Deathmantle'], requires: [['Persist Creature', 2], 'Haste Enabler'], produces: [['Infinite colorless mana', 'S']], identity: 'C', popularity: 600 }),
  variant({ id: '700-701-702', uses: ['Spellweaver Helix', { name: "Dragon's Approach", quantity: 2 }, 'Coveted Prize'], produces: [['Near-infinite damage', 'S']], identity: 'BR', popularity: 4 }),
  variant({ id: '800-801', uses: [{ name: "K'rrik, Son of Yawgmoth", mustBeCommander: true }, "Bolas's Citadel"], produces: [['Infinite lifeloss', 'S']], identity: 'B', popularity: 150, bracketTag: 'S' }),
  variant({ id: '900-901', uses: ['Sol Ring', 'Hullbreaker Horror'], produces: [['Infinite colorless mana', 'S']], identity: 'U', popularity: 0 }),
  variant({ id: '10-11', uses: ['Basalt Monolith', 'Rings of Brighthearth'], produces: [['Infinite colorless mana', 'S']], identity: 'C', popularity: 20000, bracketTag: 'S' }),
];

export const SOURCE = { timestamp: '2026-11-12T18:11:59.973366+00:00', version: '7.3.7', builtAt: '2026-11-12T20:00:00.000Z' };

export function buildTestFile(variants: readonly SpellbookVariant[] = VARIANTS): CombosFile {
  const builder = new CombosBuilder(testCardIndex());
  for (const each of variants) builder.add(each);
  return builder.build(SOURCE);
}

export function testCombos(variants?: readonly SpellbookVariant[]): ComboIndex {
  return ComboIndex.fromFile(buildTestFile(variants));
}

/** A set of oracle ids from card names. */
export function holding(...names: string[]): Set<string> {
  return new Set(names.map(oracleId));
}

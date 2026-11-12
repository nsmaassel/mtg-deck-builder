import { CardIndex, CardIndexBuilder } from '@mtg/card-index';
import type { ScryfallPrinting } from '@mtg/card-index';

export interface FixtureCard {
  name: string;
  cost?: string;
  type: string;
  text?: string;
  tags?: string[];
  keywords?: string[];
  /** Defaults to the colours in the mana cost. */
  identity?: string[];
  produces?: string[];
  /** Scryfall's EDHREC rank. Unranked when absent. */
  rank?: number;
  usd?: number;
  gameChanger?: boolean;
  /** Formats the card is legal in. Defaults to Commander only. */
  legal?: string[];
}

function colorsOf(cost: string): string[] {
  return [...new Set([...cost].filter(ch => 'WUBRG'.includes(ch)))];
}

function manaValue(cost: string): number {
  let total = 0;
  for (const [, symbol = ''] of cost.matchAll(/\{([^}]+)\}/g)) {
    if (symbol === 'X') continue;
    total += /^\d+$/.test(symbol) ? Number(symbol) : 1;
  }
  return total;
}

export function oracleId(name: string): string {
  return `id:${name}`;
}

/**
 * A card index from hand-written cards.
 *
 * The real index drops a tag that only one card carries, which would make a
 * small fixture lose most of its tags. A card that is legal nowhere a deck is
 * built carries every such tag once more, so each fixture card keeps the tags
 * it was written with.
 */
export function buildFixtureIndex(cards: FixtureCard[]): CardIndex {
  const builder = new CardIndexBuilder();
  const tagged = new Map<string, string[]>();

  for (const spec of cards) {
    const cost = spec.cost ?? '';
    const printing: ScryfallPrinting = {
      oracle_id: oracleId(spec.name),
      name: spec.name,
      layout: 'normal',
      set: 'tst',
      rarity: 'rare',
      games: ['paper'],
      mana_cost: cost,
      cmc: manaValue(cost),
      type_line: spec.type,
      oracle_text: spec.text ?? '',
      colors: colorsOf(cost),
      color_identity: spec.identity ?? colorsOf(cost),
      produced_mana: spec.produces,
      keywords: spec.keywords,
      legalities: Object.fromEntries((spec.legal ?? ['commander']).map(format => [format, 'legal'])),
      prices: { usd: spec.usd === undefined ? null : spec.usd.toFixed(2) },
      edhrec_rank: spec.rank,
      game_changer: spec.gameChanger,
    };
    builder.addPrinting(printing);
    for (const tag of spec.tags ?? []) tagged.set(tag, [...(tagged.get(tag) ?? []), oracleId(spec.name)]);
  }

  const carrier = 'Tag Carrier';
  builder.addPrinting({
    oracle_id: oracleId(carrier),
    name: carrier,
    layout: 'normal',
    set: 'tst',
    rarity: 'common',
    games: ['paper'],
    type_line: 'Artifact',
    legalities: { vintage: 'legal' },
  });

  for (const [slug, ids] of tagged) {
    const carriers = ids.length === 1 ? [...ids, oracleId(carrier)] : ids;
    builder.addTag({ id: `tag:${slug}`, slug, taggings: carriers.map(oracle_id => ({ oracle_id })) });
  }
  return new CardIndex(builder.build({ builtAt: '2026-01-01T00:00:00Z' }));
}

/** `count` near-identical cards, each a little less played than the one before. */
function several(
  count: number,
  name: (n: number) => string,
  spec: Omit<FixtureCard, 'name' | 'rank'>,
  firstRank: number,
  rankStep = 10,
): FixtureCard[] {
  return Array.from({ length: count }, (_, i) => ({ ...spec, name: name(i + 1), rank: firstRank + i * rankStep }));
}

/**
 * A mono-red Commander card pool with a few neighbours in other colours.
 *
 * Two red commanders want different things from it: Krenko wants Goblins,
 * Zada wants cheap instants. The named cards carry the tags the real ones do;
 * the numbered ones are filler so that every slot of a deck can be filled.
 */
export const COMMANDER_POOL: FixtureCard[] = [
  // Commanders
  {
    name: 'Krenko, Mob Boss', cost: '{2}{R}{R}', type: 'Legendary Creature — Goblin Warrior', rank: 1090, usd: 4,
    text: '{T}: Create X 1/1 red Goblin creature tokens, where X is the number of Goblins you control.',
    tags: ['typal', 'typal-goblin', 'repeatable-creature-tokens', 'exponential'],
  },
  {
    name: 'Zada, Hedron Grinder', cost: '{3}{R}', type: 'Legendary Creature — Goblin Ally', rank: 3469, usd: 1,
    text: 'Whenever you cast an instant or sorcery spell that targets only Zada, copy that spell for each other creature you control.',
    tags: ['synergy-instant', 'synergy-sorcery', 'copy-spell'],
  },
  {
    // Not tagged: its theme has to be read from the rules text.
    name: 'Ezuri, Renegade Leader', cost: '{1}{G}{G}', type: 'Legendary Creature — Elf Warrior', rank: 2500,
    text: '{G}: Regenerate another target Elf. {2}{G}{G}{G}: Elf creatures you control get +3/+3 and gain trample until end of turn.',
  },
  {
    // Makes Spirits without being one: wants what rewards Spirits, not every Spirit.
    name: "Kykar, Wind's Fury", cost: '{1}{U}{R}{W}', type: 'Legendary Creature — Bird Wizard', rank: 2924,
    text: 'Flying. Whenever you cast a noncreature spell, create a 1/1 white Spirit creature token with flying. Sacrifice a Spirit: Add {R}.',
    tags: ['typal', 'typal-spirit', 'synergy-instant', 'synergy-sorcery', 'repeatable-creature-tokens'],
  },
  { name: 'Isamaru, Hound of Konda', cost: '{W}', type: 'Legendary Creature — Dog', rank: 9000 },
  {
    // A token deck with no creature type of its own.
    name: 'Purphoros, God of the Forge', cost: '{3}{R}', type: 'Legendary Enchantment Creature — God', rank: 697, usd: 10,
    text: 'Indestructible. Whenever another creature you control enters, Purphoros deals 2 damage to each opponent.',
    tags: ['creaturefall', 'impact-effect'],
  },
  {
    // Names its own subtype, but a Shrine is a kind of enchantment, not a kind of creature.
    name: "Go-Shintai of Life's Origin", cost: '{3}{G}', type: 'Legendary Enchantment Creature — Shrine', rank: 7000,
    text: 'Whenever Go-Shintai or another nontoken Shrine you control enters, create a 1/1 colorless Shrine enchantment creature token.',
  },
  { name: 'Sanctum of Fruitful Harvest', cost: '{2}{G}', type: 'Legendary Enchantment — Shrine', rank: 8000, usd: 1 },
  {
    // Tagged, but with nothing any theme listens for.
    name: 'Squee, Goblin Nabob', cost: '{2}{R}', type: 'Legendary Creature — Goblin', rank: 3000,
    text: 'At the beginning of your upkeep, you may return Squee from your graveyard to your hand.',
    tags: ['recursion-self'],
  },
  {
    name: 'Kozilek, the Great Distortion', cost: '{8}{C}{C}', type: 'Legendary Creature — Eldrazi', rank: 4000, identity: [],
    text: 'Menace. Discard a card with mana value X: Counter target spell with mana value X.',
  },
  {
    name: 'Niv-Mizzet, Parun', cost: '{U}{U}{U}{R}{R}{R}', type: 'Legendary Creature — Dragon Wizard', rank: 811,
    text: 'Flying. Whenever you draw a card, Niv-Mizzet deals 1 damage to any target. Whenever a player casts an instant or sorcery spell, you draw a card.',
    tags: ['draw-matters', 'synergy-instant', 'synergy-sorcery'],
  },

  // Staples every red deck plays
  { name: 'Sol Ring', cost: '{1}', type: 'Artifact', rank: 1, usd: 1, tags: ['ramp', 'mana-rock'], produces: ['C'] },
  { name: 'Arcane Signet', cost: '{2}', type: 'Artifact', rank: 3, usd: 1, tags: ['ramp', 'mana-rock'], produces: ['W', 'U', 'B', 'R', 'G'] },
  { name: 'Mind Stone', cost: '{2}', type: 'Artifact', rank: 50, usd: 1, tags: ['ramp', 'mana-rock', 'draw'], produces: ['C'] },
  { name: 'Lightning Greaves', cost: '{2}', type: 'Artifact — Equipment', rank: 13, usd: 5, tags: ['protection', 'protects-creature', 'gives-haste'] },
  { name: 'Chaos Warp', cost: '{2}{R}', type: 'Instant', rank: 29, usd: 2, tags: ['removal', 'spot-removal'] },
  { name: 'Blasphemous Act', cost: '{8}{R}', type: 'Sorcery', rank: 21, usd: 3, tags: ['removal', 'sweeper'] },
  { name: 'Lightning Bolt', cost: '{R}', type: 'Instant', rank: 150, usd: 1, tags: ['removal', 'spot-removal', 'burn'] },
  { name: 'Faithless Looting', cost: '{R}', type: 'Sorcery', rank: 160, usd: 1, tags: ['draw', 'loot'] },
  { name: 'Insurrection', cost: '{5}{R}{R}{R}', type: 'Sorcery', rank: 1822, usd: 2, tags: ['theft', 'theft-mass'] },
  { name: 'Underworld Breach', cost: '{1}{R}', type: 'Enchantment', rank: 500, usd: 12, gameChanger: true, tags: ['graveyard-fuel'] },

  // What Krenko wants
  { name: 'Goblin Chieftain', cost: '{1}{R}{R}', type: 'Creature — Goblin', rank: 2582, usd: 20, tags: ['typal', 'typal-goblin', 'anthem'], keywords: ['Haste'] },
  { name: 'Goblin Matron', cost: '{2}{R}', type: 'Creature — Goblin', rank: 1805, usd: 1, tags: ['typal', 'typal-goblin', 'tutor'] },
  { name: 'Skirk Prospector', cost: '{R}', type: 'Creature — Goblin', rank: 1357, usd: 1, tags: ['typal', 'typal-goblin', 'ramp', 'mana-dork'], produces: ['R'] },
  {
    name: 'Siege-Gang Commander', cost: '{3}{R}{R}', type: 'Creature — Goblin', rank: 1617, usd: 1,
    text: 'When this creature enters, create three 1/1 red Goblin creature tokens. {1}{R}, Sacrifice a Goblin: This creature deals 2 damage to any target.',
    tags: ['typal', 'typal-goblin', 'removal', 'multiple-bodies'],
  },
  { name: 'Mogg Fanatic', cost: '{R}', type: 'Creature — Goblin', rank: 6000, usd: 1 },
  { name: 'Impact Tremors', cost: '{1}{R}', type: 'Enchantment', rank: 204, usd: 2, tags: ['creaturefall', 'impact-effect'] },
  { name: 'Coat of Arms', cost: '{5}', type: 'Artifact', rank: 970, usd: 8, tags: ['typal', 'typal-share', 'anthem'] },

  { name: 'Flamewake Phoenix', cost: '{1}{R}{R}', type: 'Creature — Phoenix', rank: 5000, usd: 1, tags: ['recursion-self'], keywords: ['Flying', 'Haste'] },

  // What Zada wants
  { name: 'Guttersnipe', cost: '{2}{R}', type: 'Creature — Goblin Shaman', rank: 409, usd: 1, tags: ['synergy-instant', 'synergy-sorcery'] },
  { name: 'Young Pyromancer', cost: '{1}{R}', type: 'Creature — Human Shaman', rank: 857, usd: 1, tags: ['synergy-instant', 'synergy-sorcery', 'repeatable-creature-tokens'] },

  // Lands
  { name: 'Command Tower', type: 'Land', rank: 2, usd: 1, tags: ['rainbow-land'], produces: ['W', 'U', 'B', 'R', 'G'] },
  { name: 'Reliquary Tower', type: 'Land', rank: 10, usd: 3, tags: ['utility-land'], produces: ['C'] },
  { name: 'Cavern of Souls', type: 'Land', rank: 112, usd: 40, tags: ['rainbow-land', 'restricted-mana', 'typal', 'typal-choose'], produces: ['W', 'U', 'B', 'R', 'G', 'C'] },
  { name: 'Evolving Wilds', type: 'Land', rank: 19, usd: 1, tags: ['fetchland', 'tutor-land'], text: '{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.' },
  { name: 'Polluted Delta', type: 'Land', rank: 300, usd: 30, tags: ['fetchland', 'tutor-land'], text: '{T}, Pay 1 life, Sacrifice this land: Search your library for an Island or Swamp card, put it onto the battlefield, then shuffle.' },
  { name: 'Steam Vents', type: 'Land — Island Mountain', rank: 62, usd: 15, tags: ['dual-land'], identity: ['U', 'R'], produces: ['U', 'R'] },
  { name: 'Maze of Ith', type: 'Land', rank: 700, usd: 20, tags: ['utility-land'] },
  { name: 'Mountain', type: 'Basic Land — Mountain', identity: ['R'], produces: ['R'] },
  { name: 'Island', type: 'Basic Land — Island', identity: ['U'], produces: ['U'] },

  // Other colours, for what must stay out and for slot priority
  { name: 'Counterspell', cost: '{U}{U}', type: 'Instant', rank: 16, usd: 1, tags: ['counterspell'] },
  { name: 'Arcane Denial', cost: '{1}{U}', type: 'Instant', rank: 60, usd: 1, tags: ['counterspell', 'draw'] },
  { name: 'Path to Exile', cost: '{W}', type: 'Instant', rank: 8, usd: 2, tags: ['removal', 'spot-removal', 'ramp', 'land-ramp'] },
  { name: 'Craterhoof Behemoth', cost: '{5}{G}{G}{G}', type: 'Creature — Beast', rank: 295, usd: 30, tags: ['overrun'] },
  { name: 'Llanowar Elves', cost: '{G}', type: 'Creature — Elf Druid', rank: 30, usd: 1, tags: ['ramp', 'mana-dork'], produces: ['G'] },
  { name: 'Drogskol Captain', cost: '{1}{W}{U}', type: 'Creature — Spirit Soldier', rank: 5000, usd: 1, tags: ['typal', 'typal-spirit', 'anthem'] },
  { name: 'Spectral Sailor', cost: '{U}', type: 'Creature — Spirit Pirate', rank: 5000, usd: 1 },
  // Colourless, so legal anywhere, and useless where nobody casts blue spells.
  { name: 'Sapphire Medallion', cost: '{2}', type: 'Artifact', rank: 20, usd: 9, tags: ['cost-reducer', 'synergy-blue'] },
  { name: 'Black Lotus', cost: '{0}', type: 'Artifact', rank: 20000, legal: ['vintage'], tags: ['ramp'] },
  { name: 'Brawl Only Bolt', cost: '{R}', type: 'Instant', rank: 5000, legal: ['brawl'], tags: ['removal'] },

  // Filler, so every slot of a mono-red deck can be filled
  ...several(12, n => `Signet ${n}`, { cost: '{2}', type: 'Artifact', usd: 1, tags: ['ramp', 'mana-rock'], produces: ['R'] }, 200, 50),
  ...several(12, n => `Tormenting Voice ${n}`, { cost: '{1}{R}', type: 'Sorcery', usd: 1, tags: ['draw'] }, 300, 50),
  ...several(12, n => `Shock ${n}`, { cost: '{R}', type: 'Instant', usd: 1, tags: ['removal', 'burn'] }, 100, 12),
  ...several(6, n => `Mob Rule ${n}`, { cost: '{4}{R}{R}', type: 'Sorcery', usd: 1, tags: ['theft', 'theft-mass'] }, 4000, 100),
  ...several(30, n => `Goblin Grunt ${n}`, { cost: '{1}{R}', type: 'Creature — Goblin', usd: 1 }, 5000),
  ...several(30, n => `Trick ${n}`, { cost: '{R}', type: 'Instant', usd: 1 }, 5000),
  // More Ogres than any list has room for: the last ones are cards nothing recommends.
  ...several(60, n => `Hill Ogre ${n}`, { cost: '{1}{R}', type: 'Creature — Ogre', usd: 1 }, 5000),
  ...several(16, n => `Red Land ${n}`, { type: 'Land', usd: 1, identity: ['R'], produces: ['R'] }, 600, 100),
];

/** The shared pool as an index, with any extra cards a test needs. */
export function buildCommanderTestIndex(extra: FixtureCard[] = []): CardIndex {
  return buildFixtureIndex([...COMMANDER_POOL, ...extra]);
}

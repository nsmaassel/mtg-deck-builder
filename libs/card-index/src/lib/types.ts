export const RARITIES = ['common', 'uncommon', 'rare', 'mythic'] as const;
export type Rarity = (typeof RARITIES)[number];

/** Scryfall legality keys the index keeps. Order is the bit order in the index file: append only. */
export const FORMATS = [
  'standard',
  'alchemy',
  'historic',
  'timeless',
  'pioneer',
  'brawl',
  'standardbrawl',
  'commander',
  'modern',
  'legacy',
  'pauper',
  'vintage',
] as const;
export type Format = (typeof FORMATS)[number];

export interface IndexedCard {
  oracleId: string;
  /** Oracle name; multi-faced cards are `Front // Back`. */
  name: string;
  /** Other names this card is written as: face names, Arena-only names, flavour names. */
  aliases: string[];
  /** Front-face mana cost, e.g. `{1}{R}`. Empty for lands. */
  manaCost: string;
  cmc: number;
  typeLine: string;
  /** All faces, joined by a `//` line. */
  oracleText: string;
  /** Colours needed to cast the front face. */
  colors: string[];
  colorIdentity: string[];
  producedMana: string[];
  keywords: string[];
  /** Formats where the card may be played, including restricted. */
  legal: Format[];
  restricted: Format[];
  banned: Format[];
  /** True when at least one printing exists on MTG Arena. */
  onArena: boolean;
  /** Lowest rarity among Arena printings: the wildcard a craft costs. Undefined off Arena. */
  arenaRarity?: Rarity;
  arenaIds: number[];
  /** Name the Arena client uses when it differs from the oracle name. */
  arenaName?: string;
  /** Lowest rarity among all printings. */
  rarity: Rarity;
  /** Scryfall's EDHREC popularity rank (1 = most played). */
  edhrecRank?: number;
  /** Cheapest paper printing in USD. */
  usd?: number;
  /** Scryfall Tagger oracle tags, including ancestor tags. */
  tags: string[];
  isBasicLand: boolean;
  gameChanger: boolean;
}

export interface TagInfo {
  slug: string;
  /** Scryfall's permanent tag id; slugs can be renamed. */
  id: string;
}

/** One card as stored in the index file. Keys are short because there are ~30k of them. */
export interface SerializedCard {
  o: string;
  n: string;
  a?: string[];
  m?: string;
  c: number;
  t: string;
  x?: string;
  k?: string;
  i?: string;
  p?: string;
  w?: string[];
  /** Bit masks over FORMATS. */
  l: number;
  r?: number;
  b?: number;
  /** Index into RARITIES; absent off Arena. */
  ar?: number;
  ai?: number[];
  an?: string;
  y: number;
  e?: number;
  u?: number;
  /** Indices into the file's tag table. */
  g?: number[];
  /** 1 = basic land, 2 = game changer. */
  f?: number;
}

export interface CardIndexFile {
  version: 1;
  builtAt: string;
  /** Scryfall's `updated_at` for the bulk files the index was built from. */
  cardsUpdatedAt?: string;
  tagsUpdatedAt?: string;
  formats: readonly string[];
  tags: TagInfo[];
  cards: SerializedCard[];
}

/** The fields of a Scryfall card object the builder reads. */
export interface ScryfallPrinting {
  oracle_id?: string;
  name: string;
  printed_name?: string | null;
  flavor_name?: string | null;
  lang?: string;
  layout: string;
  set: string;
  set_type?: string;
  rarity: string;
  games?: string[];
  arena_id?: number | null;
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  oracle_text?: string;
  colors?: string[];
  color_identity?: string[];
  produced_mana?: string[];
  keywords?: string[];
  legalities: Record<string, string>;
  prices?: { usd?: string | null };
  edhrec_rank?: number | null;
  game_changer?: boolean;
  oversized?: boolean;
  card_faces?: Array<{
    oracle_id?: string;
    name: string;
    printed_name?: string | null;
    mana_cost?: string;
    type_line?: string;
    oracle_text?: string;
    colors?: string[];
  }>;
}

/** The fields of a Scryfall oracle-tag object the builder reads. */
export interface ScryfallTag {
  id: string;
  slug: string;
  parent_ids?: string[];
  taggings?: Array<{ oracle_id: string }>;
}

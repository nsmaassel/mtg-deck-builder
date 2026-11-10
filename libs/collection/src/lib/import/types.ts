/**
 * Collection import contract.
 *
 * MTG Arena has no built-in collection export, so players arrive with whatever
 * their tracker of choice writes. `importCollection` turns any of those into a
 * flat list of entries; `resolveCollection` maps the entries onto cards.
 */

export type CollectionSourceFormat =
  /** Arena-style text: `4 Lightning Bolt (M21) 161`, also `4x Name (SET) #24 [rare]` and bare `2 Name`. */
  | 'arena-text'
  /** JSON keyed by Arena grpId: mtga-tracker-daemon `/cards`, mtga-reader, MTGA Collection Reader, bare arrays, id→count maps. */
  | 'grpid-json'
  /** JSON rows with card names (MTGA Deck Advisor, NthPhantom10 exporter, MTGA Collection Reader rows). May carry wildcards. */
  | 'named-json'
  /** CSV with a header row: Moxfield, Archidekt, MTG Arena Tool, Deckbox, MTGGoldfish, Cardsphere, Untapped. */
  | 'csv'
  /** Player.log: wildcards and saved decks only. The log never contains the collection. */
  | 'player-log';

export interface CollectionEntry {
  count: number;
  /** Card name as written by the source. Absent for grpId-only sources. */
  name?: string;
  /**
   * Arena grpId. A grpId-keyed source has one row per printing, each with its own count, and each
   * becomes its own entry. A named row that lists several ids for one total count keeps the first.
   */
  arenaId?: number;
  /** Set code as written (not normalised). */
  set?: string;
  collectorNumber?: string;
}

export interface Wildcards {
  common: number;
  uncommon: number;
  rare: number;
  mythic: number;
}

export interface ImportedDeckCard {
  arenaId: number;
  count: number;
}

/** A deck saved in the Arena client, as found in Player.log. Cards are grpIds. */
export interface ImportedDeck {
  id: string;
  name: string;
  /** Arena's own format label, e.g. `Standard`, `HistoricBrawl`, `TraditionalHistoric`. */
  format?: string;
  /** Set when the client marks the deck as a precon or event-assigned list rather than one the player built. */
  isNetDeck?: boolean;
  mainDeck: ImportedDeckCard[];
  sideboard: ImportedDeckCard[];
  commandZone: ImportedDeckCard[];
  companions: ImportedDeckCard[];
}

export interface CollectionImport {
  format: CollectionSourceFormat;
  entries: CollectionEntry[];
  wildcards?: Wildcards;
  /** Vault progress in percent (0–100). */
  vaultProgress?: number;
  gems?: number;
  gold?: number;
  decks?: ImportedDeck[];
  /** Things the user should know, e.g. "Detailed Logs are disabled". */
  warnings: string[];
  /** Input lines (or rows) that could not be read. Capped by the parser. */
  unrecognizedLines: string[];
}

export interface CardRef {
  oracleId: string;
  name: string;
}

/** The slice of the card index that resolution needs. `@mtg/card-index` satisfies it. */
export interface CardLookup {
  byArenaId(arenaId: number): CardRef | undefined;
  /** Must tolerate case, accents, `A-` prefixes, front-face-only names and `///` separators. */
  byName(name: string): CardRef | undefined;
}

export interface ResolvedCollection {
  /** oracleId → copies owned, summed across printings. Not clamped to a deck limit. */
  owned: Map<string, number>;
  /** oracleId → display name, for every key of `owned`. */
  names: Map<string, string>;
  /** Entries that matched no card. */
  unresolved: CollectionEntry[];
  totalCards: number;
  uniqueCards: number;
}

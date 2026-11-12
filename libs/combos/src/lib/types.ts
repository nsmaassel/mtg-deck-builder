import type { Format } from '@mtg/card-index';

/** The combo data is Commander Spellbook's: credit them by name and link here wherever combos are shown. */
export const COMMANDER_SPELLBOOK_URL = 'https://commanderspellbook.com';

/** Commander Spellbook's page for a combo, which has the steps and prerequisites this library does not keep. */
export function comboUrl(id: string): string {
  return `${COMMANDER_SPELLBOOK_URL}/combo/${encodeURIComponent(id)}/`;
}

export interface Combo {
  /** Commander Spellbook variant id; the page is https://commanderspellbook.com/combo/<id>/ */
  id: string;
  /** Scryfall oracle ids of the specific cards the combo uses. */
  cards: string[];
  /** Copies needed, for the few cards that need more than one. Absent means one each. */
  copies?: Record<string, number>;
  /** Cards that must be the commander. */
  commanders: string[];
  /** Generic requirements ("a sacrifice outlet"): the combo also needs these, which card ids alone cannot check. */
  requirements: { name: string; quantity: number }[];
  /** What it does, in Commander Spellbook's words: "Infinite colorless mana". Results that win by themselves come first. */
  produces: string[];
  /** Colour identity letters in WUBRG order; empty for colourless. */
  identity: string[];
  /** Formats where every card is legal. A combo that needs a commander lists only formats that have one. */
  legal: Format[];
  /** Decks using it, per Commander Spellbook. */
  popularity: number;
  /** Commander Spellbook's bracket tag for the combo, as the one-letter code the bulk file carries. */
  bracketTag?: string;
}

export interface ComboQuery {
  /** Only combos legal here. */
  format?: Format;
  /** Only combos whose colour identity fits inside these colours. Omit for any. */
  identity?: readonly string[];
  /** Leave out combos that also need a generic requirement. Default false. */
  specificOnly?: boolean;
  /** Most popular first; default 50. */
  limit?: number;
}

export interface ComboMatch {
  combo: Combo;
  /** Oracle ids the player does not have; empty for a complete combo. */
  missing: string[];
}

/** One card that would finish combos the player is otherwise holding. */
export interface ComboCompleter {
  oracleId: string;
  /** Combos this card completes, most popular first (capped; `total` is the full count). */
  combos: Combo[];
  total: number;
}

/** Owned copies by oracle id, or just a set of oracle ids (one copy each). */
export type CardCounts = ReadonlyMap<string, number> | ReadonlySet<string>;

/** One combo as stored in the combos file. Keys are short because there are ~100k of them. */
export interface SerializedCombo {
  /** Commander Spellbook variant id. */
  i: string;
  /** Indices into the file's card table. */
  c: number[];
  /** Copies needed, as `position in c, copies` pairs laid end to end, for the cards that need more than one. */
  n?: number[];
  /** Positions in `c` of the cards that must be the commander. */
  m?: number[];
  /** Generic requirements, as `index into the requirement table, quantity` pairs laid end to end. */
  r?: number[];
  /** Indices into the file's feature table. */
  p: number[];
  /** Colour identity in WUBRG order; absent for colourless. */
  k?: string;
  /** Bit mask over the file's formats. */
  l: number;
  /** Popularity; absent for zero. */
  u?: number;
  /** Index into the file's bracket tag table. */
  b?: number;
}

export interface CombosFile {
  version: 1;
  builtAt: string;
  /** Commander Spellbook's own timestamp and version of the bulk file this was built from. */
  source: { timestamp: string; version: string };
  /** Bit order of each combo's legality mask. */
  formats: readonly string[];
  /** Scryfall oracle ids. */
  cards: string[];
  /** Names of generic requirements (Commander Spellbook's "templates"). */
  requirements: string[];
  /** Names of what combos produce. */
  features: string[];
  bracketTags: string[];
  /** Most popular first, then by id. */
  combos: SerializedCombo[];
}

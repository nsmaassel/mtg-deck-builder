import type { Format, IndexedCard, Rarity } from '@mtg/card-index';

export type Board = 'commander' | 'companion' | 'main' | 'sideboard';

export interface DeckLine {
  name: string;
  count: number;
}

/** A decklist as written, before card names are resolved. */
export interface DeckList {
  name?: string;
  commander: DeckLine[];
  companion: DeckLine[];
  main: DeckLine[];
  sideboard: DeckLine[];
  /** Lines that were not `<count> <card name>`. */
  unrecognized: string[];
}

export interface Wildcards {
  common: number;
  uncommon: number;
  rare: number;
  mythic: number;
}

/** What a player has: copies per card, and optionally wildcards to craft with. */
export interface Collection {
  /** oracleId → copies owned. */
  owned: ReadonlyMap<string, number>;
  wildcards?: Wildcards;
}

export type CardStatus =
  /** Every copy the deck needs is owned. */
  | 'owned'
  /** Some copies are owned, some must be crafted or replaced. */
  | 'partial'
  /** No copy is owned. */
  | 'missing'
  /** The card exists but not on MTG Arena, so it cannot be crafted there. */
  | 'not-on-arena'
  /** The card is not legal (or is banned) in the chosen format. */
  | 'not-legal'
  /** The name matched no card. */
  | 'unknown';

/** One card of a deck on one board, compared with the collection. */
export interface CardGap {
  name: string;
  board: Board;
  needed: number;
  owned: number;
  missing: number;
  status: CardStatus;
  /** Absent only for `unknown`. */
  card?: IndexedCard;
  /** The wildcard each missing copy costs. Absent off Arena. */
  craftRarity?: Rarity;
}

export interface DeckGap {
  format: Format;
  /** Colours the deck may play: the commander's identity, else the colours of its spells. */
  colors: string[];
  totalCards: number;
  ownedCards: number;
  /** ownedCards / totalCards. */
  completion: number;
  /** Wildcards to craft every missing copy that can be crafted. */
  wildcardsNeeded: Wildcards;
  /** Per rarity, how many more wildcards are needed than the collection holds. Absent without an inventory. */
  wildcardsShort?: Wildcards;
  /** True when nothing is missing or the inventory covers every craft. Absent when it cannot be told. */
  craftable?: boolean;
  cards: CardGap[];
}

export type SubstituteSource =
  /** A spare copy from the collection. */
  | 'owned'
  /** Not owned, but a cheaper wildcard than the card it stands in for. */
  | 'craft';

export type MatchQuality = 'close' | 'partial' | 'weak';

export interface ScoreBreakdown {
  /** Overlap of functional tags, weighted towards specific ones. */
  role: number;
  /** Similarity of rules text. */
  text: number;
  /** Card type compatibility. */
  type: number;
  /** Mana value closeness. */
  cost: number;
  /** How well it fits the deck's colours compared with the original. */
  color: number;
  /** Evidence that players of this deck's archetype run it. */
  meta: number;
}

export interface Substitute {
  card: IndexedCard;
  source: SubstituteSource;
  /** 0–1. Comparable across candidates for the same target only. */
  score: number;
  quality: MatchQuality;
  /** Copies that can go into this deck: spare owned copies, or the copy limit for crafts. */
  available: number;
  /** For `craft`: the wildcard one copy costs. */
  craftRarity?: Rarity;
  breakdown: ScoreBreakdown;
  /** Plain-language facts behind the score, most telling first. */
  reasons: string[];
}

/** How often an archetype's lists play a card, by oracle id. */
export interface ArchetypeUsage {
  archetype: string;
  /** Share of lists with the card in the main deck (0–1). */
  mainShare(oracleId: string): number;
  /** Share of lists with the card in the sideboard (0–1). */
  sideShare(oracleId: string): number;
}

export type PlanAction = 'craft' | 'substitute' | 'unfilled';

export interface PlanStep {
  action: PlanAction;
  board: Board;
  /** The card the list asks for. */
  target: string;
  /** Copies this step covers. */
  count: number;
  /** For `craft`: the wildcard spent per copy. */
  craftRarity?: Rarity;
  /** For `substitute`: the stand-in and why. */
  substitute?: Substitute;
  /** Why this action was chosen, in one sentence. */
  note: string;
}

export interface DeckPlan {
  format: Format;
  gap: DeckGap;
  steps: PlanStep[];
  /** The playable list after crafts and substitutions. */
  deck: Pick<DeckList, 'commander' | 'companion' | 'main' | 'sideboard'>;
  /** The list in MTG Arena import format. */
  arenaText: string;
  wildcardsSpent: Wildcards;
  /** Inventory left after the planned crafts. Absent without an inventory. */
  wildcardsLeft?: Wildcards;
  /**
   * 0–1: share of the original list that survives, counting an exact copy as 1
   * and a stand-in as its match score.
   */
  fidelity: number;
  /** Every stand-in found for each missing card of `gap.cards`, owned and craftable, best first. */
  standIns: ReadonlyMap<CardGap, Substitute[]>;
}

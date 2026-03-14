import type { ScryfallCard } from '@mtg/scryfall';
import type { EDHRecCard } from '@mtg/edhrec';
import type { CollectionMap } from '@mtg/collection';
import type { PowerLevelResult, Bracket } from '@mtg/power-level';

export interface DeckCard {
  name: string;
  quantity: 1;
  ownedInCollection: boolean;
  edhrec_inclusion: number;
  edhrec_synergy: number;
  score: number;
  slot: SlotName;
  cmc: number;
  type_line: string;
  usdPrice?: number | null;
}

export type SlotName = 'ramp' | 'draw' | 'interaction' | 'winConditions' | 'synergy' | 'lands' | 'flex';

export interface DeckList {
  commander: DeckCard;
  slots: Record<SlotName, DeckCard[]>;
  totalCards: number;
}

export interface DeckAnalysis {
  commanderName: string;
  manaCurve: Record<number, number>;
  colorDistribution: Record<string, number>;
  averageCmc: number;
  staplesCoveragePercent: number;
}

export interface MissingCard {
  name: string;
  edhrec_inclusion: number;
  usdPrice: number | null;
  wouldFillSlot: string;
}

export interface GapReport {
  missingStaples: MissingCard[];
  budgetUpgrades: MissingCard[];
  premiumUpgrades: MissingCard[];
}

/**
 * prefer-owned  — all EDHRec recommendations eligible; owned cards get a score boost
 * owned-only    — only cards already in the collection are used; nothing is recommended to buy
 * budget        — owned cards always in; unowned cards filtered to those at or below budgetMaxPrice
 */
export type BuildMode = 'prefer-owned' | 'owned-only' | 'budget';

export interface BuildDeckOptions {
  mode?: BuildMode;
  /** USD price ceiling per card when mode is 'budget'. Defaults to 5. */
  budgetMaxPrice?: number;
  /**
   * Target power bracket (1–5, Official Commander Brackets).
   * When provided, the result includes suggestions for reaching this bracket.
   */
  targetBracket?: Bracket;
}

export interface BuildDeckInput {
  commanderCard: ScryfallCard;
  edhrecCards: EDHRecCard[];
  collection: CollectionMap;
  collectionScryfallData: Map<string, ScryfallCard>;
  options?: BuildDeckOptions;
}

export interface BuildDeckResult {
  deck: DeckList;
  analysis: DeckAnalysis;
  gaps: GapReport;
  powerLevel: PowerLevelResult;
}

// Re-export so consumers can import from @mtg/deck-builder
export type { PowerLevelResult, Bracket } from '@mtg/power-level';

/** Slot targets per constitution spec */
export const SLOT_TARGETS: Record<SlotName, number> = {
  ramp: 10,
  draw: 10,
  interaction: 10,
  winConditions: 5,
  synergy: 25,
  lands: 36,
  flex: 3,
};

export const TOTAL_DECK_SIZE = 100;

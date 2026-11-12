import type { CommanderProfile, Recommendation } from '@mtg/commander-recs';
import type { PowerLevelResult, Bracket } from '@mtg/power-level';

export interface DeckCard {
  name: string;
  quantity: 1;
  ownedInCollection: boolean;
  /**
   * 0..1, from Scryfall's EDHREC rank: how widely the card is played across
   * Commander as a whole. It says nothing about this commander.
   */
  popularity: number;
  /** 0..1: how well the card works with what this commander does. */
  synergy: number;
  score: number;
  slot: SlotName;
  cmc: number;
  type_line: string;
  usdPrice?: number | null;
  /** Why the card is in the deck: one or two short statements that are true of the card. */
  reasons: string[];
}

export type SlotName = 'ramp' | 'draw' | 'interaction' | 'winConditions' | 'synergy' | 'lands' | 'flex';

export interface DeckList {
  commander: DeckCard;
  slots: Record<SlotName, DeckCard[]>;
  totalCards: number;
}

/** A theme the deck was built around, and what on the commander pointed at it. */
export interface DeckTheme {
  slug: string;
  name: string;
  /** Completes "a commander that …". */
  because: string;
}

export interface DeckAnalysis {
  commanderName: string;
  manaCurve: Record<number, number>;
  /** Cards per colour, by colour identity. */
  colorDistribution: Record<string, number>;
  averageCmc: number;
  /**
   * Of the cards we would pick for this commander with every card available,
   * the share that is in this deck, 0..100. A build with no collection and no
   * budget scores 100; one held back by either scores lower. It measures
   * closeness to our own picks, not how many decks play a card.
   */
  topPicksCoveragePercent: number;
  themes: DeckTheme[];
}

export interface MissingCard {
  name: string;
  popularity: number;
  synergy: number;
  reasons: string[];
  usdPrice: number | null;
  wouldFillSlot: string;
}

export interface GapReport {
  /** Cards in the deck that the collection lacks, the ones the deck leans on most first. */
  missingCards: MissingCard[];
  budgetUpgrades: MissingCard[];
  premiumUpgrades: MissingCard[];
}

/**
 * prefer-owned  — every recommendation is eligible; owned cards get a score boost
 * owned-only    — only cards already in the collection are used; nothing is recommended to buy
 * budget        — owned cards always eligible; unowned cards only at or below budgetMaxPrice
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
  /** The commander and what it is about. */
  profile: CommanderProfile;
  /** Every card that may go in the 99, owned or not. See `candidatesFor`. */
  recommendations: Recommendation[];
  /** Oracle ids of the cards in the collection. */
  owned: ReadonlySet<string>;
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
export { assessPowerLevelWithCombos } from '@mtg/power-level';

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

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
  /** On the Commander Game Changers list, per Scryfall's card data. */
  gameChanger?: boolean;
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
  /**
   * 0..100: how widely played the deck's spells are across Commander, on
   * average (Scryfall's EDHREC rank; lands and the commander left out). Unlike
   * the coverage above it is about the deck's own cards, which is why the
   * power assessment goes by it.
   */
  averagePopularityPercent: number;
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
   * Target power bracket (1–5, Official Commander Brackets). `buildDeckForBracket`
   * builds towards it; where it cannot get there, the result includes
   * suggestions for the rest of the way.
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

/** How a build aimed at a bracket steers the plain build. Oracle ids throughout. */
export interface BuildAdjustments {
  /** Cards kept out of the deck. */
  exclude?: ReadonlySet<string>;
  /** Cards that go in before anything else, when the build may use them at all. */
  include?: ReadonlySet<string>;
  /**
   * 0..2: how far being widely played stops counting for a card. Up to 1 it
   * stops counting for cards that do nothing for the commander; from 1 to 2
   * it stops counting for every card, until at 2 the build goes by synergy
   * and mana cost alone.
   */
  stapleDiscount?: number;
}

/** One card a build aimed at a bracket left out or put in, and why. */
export interface BracketChange {
  name: string;
  reason: string;
}

/** What a build did to land on the bracket it was asked for. */
export interface BracketTuning {
  target: Bracket;
  /** The bracket the deck is assessed at after tuning. Equal to `target` when the build got there. */
  reached: Bracket;
  /** The bracket the same build comes out at with no target. */
  untuned: Bracket;
  leftOut: BracketChange[];
  added: BracketChange[];
  /** True when widely played staples gave way to cards fewer decks play. */
  fewerStaples: boolean;
}

export interface BuildDeckResult {
  deck: DeckList;
  analysis: DeckAnalysis;
  gaps: GapReport;
  powerLevel: PowerLevelResult;
  /** Present when the build was aimed at a bracket. */
  bracketTuning?: BracketTuning;
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

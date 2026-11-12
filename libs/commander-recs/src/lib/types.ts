import type { Format, IndexedCard } from '@mtg/card-index';

export const RECOMMENDATION_SLOTS = ['ramp', 'draw', 'interaction', 'winConditions', 'synergy', 'lands'] as const;
export type RecommendationSlot = (typeof RECOMMENDATION_SLOTS)[number];

export interface Recommendation {
  oracleId: string;
  name: string;
  /** Which part of a deck the card fills. */
  slot: RecommendationSlot;
  /**
   * 0..1, from Scryfall's EDHREC rank: how widely the card is played across
   * Commander as a whole, NOT with this commander.
   */
  popularity: number;
  /** 0..1: how well the card works with what this commander does. */
  synergy: number;
  /** 0..1: how strongly the card is recommended for its slot. See `SLOT_WEIGHTS`. */
  score: number;
  /** Slugs of the commander's themes this card serves. */
  themes: string[];
  /** One or two short reasons, each literally true of the card. */
  reasons: string[];
  cmc: number;
  typeLine: string;
  colorIdentity: string[];
  /** Cheapest paper printing in USD, when Scryfall lists a price. */
  usd?: number;
  /** Lands only, 0..1: how much of the commander's colour identity the land provides. */
  colorFit?: number;
}

export interface ThemeInfo {
  slug: string;
  name: string;
  description: string;
}

/**
 * A test on one card. Every field given must hold; `tags` holds when the card
 * carries any one of them, and so does `andTags`.
 */
export interface CardTest {
  tags?: readonly string[];
  /** And any one of these as well, for tests that need two tags at once. */
  andTags?: readonly string[];
  notTags?: readonly string[];
  /** Tested against the front face's type line. */
  type?: RegExp;
  keyword?: string;
  text?: RegExp;
  minCmc?: number;
  maxCmc?: number;
}

/** Something on a commander that points at a theme. */
export interface ThemeSignal extends CardTest {
  /** Signal weights add up; a theme switches on at `THEME_THRESHOLD`. */
  weight: number;
  /** Completes "a commander that …". Must be true of every commander the test accepts. */
  says: string;
}

/** A kind of card a theme wants in the 99. */
export interface ThemeWant extends CardTest {
  /** 0..1: how much the theme wants a card that passes. */
  weight: number;
  /** Shown to people. Must be true of every card the test accepts. */
  reason: string;
}

export interface ThemeDefinition extends ThemeInfo {
  signals: readonly ThemeSignal[];
  wants: readonly ThemeWant[];
}

export interface ProfiledTheme extends ThemeInfo {
  /** 0..1: how strongly the commander points at this theme. */
  weight: number;
  /** What the commander does that switched the theme on; completes "a commander that …". */
  because: string;
  /** Typal only: the creature types the deck is built around. */
  creatureTypes?: string[];
  wants: readonly ThemeWant[];
}

export interface CommanderProfile {
  commander: IndexedCard;
  /** The commander's colour identity. */
  identity: string[];
  /** The format whose legality decides what may go in the deck. */
  format: Format;
  /** Strongest first. Empty when nothing on the commander points anywhere. */
  themes: ProfiledTheme[];
}

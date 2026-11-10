export { parseDeckText, formatArenaDeck } from './lib/deck-text';
export { FORMAT_RULES, parseFormat } from './lib/formats';
export type { FormatRules } from './lib/formats';
export {
  analyzeGap,
  castingCosts,
  deckBoards,
  deckColors,
  emptyWildcards,
  frontColors,
  isCastable,
  isLand,
  usableCopies,
} from './lib/gap';
export { tagOverlap, TextModel, tokenizeRulesText } from './lib/similarity';
export type { TagOverlap } from './lib/similarity';
export { suggestSubstitutes } from './lib/substitutes';
export type { SubstituteContext, SubstituteOptions } from './lib/substitutes';
export { planDeck, rankDecks, craftCost } from './lib/plan';
export type { PlanOptions, RankedDeck } from './lib/plan';
export type {
  ArchetypeUsage,
  Board,
  CardGap,
  CardStatus,
  Collection,
  DeckGap,
  DeckLine,
  DeckList,
  DeckPlan,
  MatchQuality,
  PlanAction,
  PlanStep,
  ScoreBreakdown,
  Substitute,
  SubstituteSource,
  Wildcards,
} from './lib/types';

export { parseDeckText, formatArenaDeck } from './lib/deck-text';
export { FORMAT_RULES, parseFormat } from './lib/formats';
export type { FormatRules } from './lib/formats';
export {
  analyzeGap,
  castingCosts,
  deckBoards,
  deckColors,
  deckCopies,
  emptyWildcards,
  frontColors,
  isCastable,
  isLand,
  usableCopies,
} from './lib/gap';
export { collectionCombos, deckCombos } from './lib/combos';
export type { CollectionCombos, ComboCardView, ComboCompleterView, ComboView, DeckCombos } from './lib/combos';
export { deckIssues } from './lib/issues';
export type { DeckIssue, DeckIssueKind } from './lib/issues';
export { nearestArchetype, tuneDeck } from './lib/tune';
export type { ArchetypeMatch, DeckTune, TuneCard } from './lib/tune';
export { tagOverlap, TextModel, tokenizeRulesText } from './lib/similarity';
export type { TagOverlap } from './lib/similarity';
export { SubstituteFinder, suggestSubstitutes } from './lib/substitutes';
export type { SubstituteContext, SubstituteOptions } from './lib/substitutes';
export { planDeck, craftCost } from './lib/plan';
export type { PlanOptions } from './lib/plan';
export { SAMPLE_PROFILES, sampleCollection } from './lib/sample-collection';
export type { SampleProfile } from './lib/sample-collection';
export {
  archetypeUsage,
  cardView,
  checkDeck,
  deckFromTournamentList,
  describeMeta,
  gapSummary,
} from './lib/service';
export type {
  AdvisorData,
  ArchetypeView,
  CardView,
  CheckDeckOptions,
  DeckCardView,
  DeckCheck,
  DeckTuneView,
  GapSummary,
  MetaView,
  PlanStepView,
  SubstituteView,
  TuneCardView,
} from './lib/service';
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
  DeckThemeView,
  PlanStep,
  ScoreBreakdown,
  Substitute,
  SubstituteSource,
  Wildcards,
} from './lib/types';

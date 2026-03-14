export { buildDeck } from './lib/builder';
export { scoreCard, labelToSlot, isColorLegal, basicLandForColor } from './lib/scoring';
export type {
  DeckCard,
  DeckList,
  DeckAnalysis,
  GapReport,
  MissingCard,
  BuildDeckInput,
  BuildDeckResult,
  SlotName,
} from './lib/types';
export { SLOT_TARGETS, TOTAL_DECK_SIZE } from './lib/types';

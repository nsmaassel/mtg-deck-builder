export { buildDeck } from './lib/builder';
export { candidatesFor, buildDeckForCommander } from './lib/candidates';
export { comboLines } from './lib/combo-lines';
export type { Candidates } from './lib/candidates';
export { OWNED_BOOST, scoreCard, isColorLegal, basicLandForColor, nonbasicLandLimit } from './lib/scoring';
export type {
  DeckCard,
  DeckList,
  DeckAnalysis,
  DeckTheme,
  GapReport,
  MissingCard,
  BuildDeckInput,
  BuildDeckOptions,
  BuildDeckResult,
  BuildMode,
  SlotName,
} from './lib/types';
export { SLOT_TARGETS, TOTAL_DECK_SIZE } from './lib/types';

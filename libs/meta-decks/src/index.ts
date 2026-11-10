export type {
  ArchetypeCard,
  DeckCardLine,
  MetaArchetype,
  MetaFormat,
  MetaSnapshot,
  MetaSource,
  TournamentDeck,
} from './lib/types';

export {
  META_FORMATS,
  DEFAULT_CACHE_SOURCES,
  cacheSparsePaths,
  dedupeTournaments,
  detectFormat,
  parseTournament,
  readTournamentCache,
  selectWindow,
  unifyCardNames,
} from './lib/cache-reader';
export type {
  CacheRead,
  FormatWindow,
  ReadCacheOptions,
  SparsePathOptions,
  Tournament,
  TournamentEvent,
  UnifyOptions,
  WindowOptions,
} from './lib/cache-reader';

export {
  CONDITION_TYPES,
  loadFormatRules,
  parseArchetypeRule,
  parseColorTable,
  parseFallbackRule,
  parseLenientJson,
} from './lib/archetype-rules';
export type {
  ArchetypeCondition,
  ArchetypeRule,
  ArchetypeVariant,
  ColorTable,
  ConditionType,
  FallbackRule,
  FormatRules,
} from './lib/archetype-rules';

export { classifyDeck, colorGroupName, deckColors, formatArchetypeName, otherClassification } from './lib/classify';
export type { ClassificationKind, ClassifyOptions, DeckClassification } from './lib/classify';

export { buildMetaSnapshot, cardFrequencies, finishRank } from './lib/aggregate';
export type { BuildMetaOptions } from './lib/aggregate';

export { cardKey, frontFaceKey, normalizeCardName, slugify } from './lib/names';

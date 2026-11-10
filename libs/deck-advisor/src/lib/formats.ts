import type { Format } from '@mtg/card-index';

export interface FormatRules {
  key: Format;
  label: string;
  /** Copies of one card allowed across main deck and sideboard. */
  maxCopies: number;
  mainDeckSize: number;
  /** Decks are led by a commander whose colour identity limits the rest. */
  hasCommander: boolean;
  /** Offered as a constructed queue in the MTG Arena client, so wildcards are the cost that matters. */
  onArena: boolean;
}

export const FORMAT_RULES: Record<Format, FormatRules> = {
  standard: { key: 'standard', label: 'Standard', maxCopies: 4, mainDeckSize: 60, hasCommander: false, onArena: true },
  alchemy: { key: 'alchemy', label: 'Alchemy', maxCopies: 4, mainDeckSize: 60, hasCommander: false, onArena: true },
  historic: { key: 'historic', label: 'Historic', maxCopies: 4, mainDeckSize: 60, hasCommander: false, onArena: true },
  timeless: { key: 'timeless', label: 'Timeless', maxCopies: 4, mainDeckSize: 60, hasCommander: false, onArena: true },
  pioneer: { key: 'pioneer', label: 'Pioneer', maxCopies: 4, mainDeckSize: 60, hasCommander: false, onArena: true },
  brawl: { key: 'brawl', label: 'Brawl', maxCopies: 1, mainDeckSize: 100, hasCommander: true, onArena: true },
  standardbrawl: { key: 'standardbrawl', label: 'Standard Brawl', maxCopies: 1, mainDeckSize: 60, hasCommander: true, onArena: true },
  commander: { key: 'commander', label: 'Commander', maxCopies: 1, mainDeckSize: 100, hasCommander: true, onArena: false },
  modern: { key: 'modern', label: 'Modern', maxCopies: 4, mainDeckSize: 60, hasCommander: false, onArena: false },
  legacy: { key: 'legacy', label: 'Legacy', maxCopies: 4, mainDeckSize: 60, hasCommander: false, onArena: false },
  pauper: { key: 'pauper', label: 'Pauper', maxCopies: 4, mainDeckSize: 60, hasCommander: false, onArena: false },
  vintage: { key: 'vintage', label: 'Vintage', maxCopies: 4, mainDeckSize: 60, hasCommander: false, onArena: false },
};

/** What Arena's deck export and Player.log call each format. */
const ARENA_FORMAT_NAMES: Record<string, Format> = {
  standard: 'standard',
  traditionalstandard: 'standard',
  alchemy: 'alchemy',
  traditionalalchemy: 'alchemy',
  historic: 'historic',
  traditionalhistoric: 'historic',
  timeless: 'timeless',
  traditionaltimeless: 'timeless',
  pioneer: 'pioneer',
  traditionalpioneer: 'pioneer',
  explorer: 'pioneer',
  traditionalexplorer: 'pioneer',
  brawl: 'brawl',
  historicbrawl: 'brawl',
  standardbrawl: 'standardbrawl',
  commander: 'commander',
  edh: 'commander',
  modern: 'modern',
  legacy: 'legacy',
  pauper: 'pauper',
  vintage: 'vintage',
};

/** Map a user- or client-supplied format name onto a format key. */
export function parseFormat(name: string | undefined): Format | undefined {
  if (!name) return undefined;
  return ARENA_FORMAT_NAMES[name.toLowerCase().replace(/[^a-z]/g, '')];
}

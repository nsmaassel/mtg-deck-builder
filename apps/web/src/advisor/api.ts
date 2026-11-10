import type { DeckCheck, MetaView, SampleProfile, Wildcards } from '@mtg/deck-advisor';
import type { ArchetypeCard, MetaSource } from '@mtg/meta-decks/types';
import { ApiError, request } from '../api';

export type { DeckCheck, MetaView, SampleProfile, Wildcards };
export type {
  ArchetypeView,
  DeckCardView,
  GapSummary,
  PlanStepView,
  SubstituteView,
  CardView,
} from '@mtg/deck-advisor';

/** The collection as the browser keeps it and sends it with each request. */
export interface StoredCollection {
  cards: Record<string, number>;
  wildcards?: Wildcards;
  /** Where it came from, for the summary line. */
  label: string;
  totalCards: number;
  uniqueCards: number;
  sample: boolean;
}

export interface AdvisorStatus {
  ready: boolean;
  cards?: { count: number; builtAt: string; sourceUpdatedAt?: string };
  formats: Array<{ key: string; label: string; onArena: boolean }>;
  meta: Array<{
    format: string;
    from: string;
    to: string;
    totalDecks: number;
    eventCount: number;
    generatedAt: string;
    sources: MetaSource[];
  }>;
}

export interface SavedDeck {
  id: string;
  name: string;
  format?: string;
  arenaFormat?: string;
  deckText: string;
  unknownCards: number;
}

export interface ImportResult {
  formats: string[];
  totalCards: number;
  uniqueCards: number;
  unresolved: { count: number; sample: string[] };
  wildcards?: Wildcards;
  vaultProgress?: number;
  decks: SavedDeck[];
  warnings: string[];
  unrecognizedLines: string[];
  collection: { cards: Record<string, number>; wildcards?: Wildcards };
}

export interface SampleResult {
  profile: SampleProfile;
  label: string;
  description: string;
  totalCards: number;
  uniqueCards: number;
  collection: { cards: Record<string, number>; wildcards: Wildcards };
}

export interface ListSummary {
  player: string;
  result: string;
  event: string;
  date: string;
  uri: string;
}

export interface ArchetypeCheck {
  archetype: {
    id: string;
    name: string;
    colors: string[];
    deckCount: number;
    metaShare: number;
    winRate?: number;
    matches: number;
    cards: ArchetypeCard[];
    lists: ListSummary[];
  };
  list: ListSummary;
  check: DeckCheck;
}

export type CraftMode = 'inventory' | 'none';

type CollectionPayload = Pick<StoredCollection, 'cards' | 'wildcards'> | undefined;

const post = <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) });
const payload = (c: StoredCollection | null): CollectionPayload => (c ? { cards: c.cards, wildcards: c.wildcards } : undefined);

export const advisorApi = {
  status: () => request<AdvisorStatus>('/advisor/status'),

  sample: (profile: SampleProfile) =>
    request<SampleResult>(`/advisor/collection/sample?profile=${encodeURIComponent(profile)}`),

  importCollection: (texts: string[]) => post<ImportResult>('/advisor/collection/import', { texts }),

  checkDeck: (deckText: string, format: string, collection: StoredCollection | null, craft: CraftMode) =>
    post<DeckCheck>('/advisor/deck/check', { deckText, format, collection: payload(collection), craft }),

  meta: (format: string, collection: StoredCollection | null) =>
    post<MetaView>('/advisor/meta', { format, collection: payload(collection) }),

  checkArchetype: (format: string, archetypeId: string, list: number, collection: StoredCollection | null, craft: CraftMode) =>
    post<ArchetypeCheck>('/advisor/meta/check', { format, archetypeId, list, collection: payload(collection), craft }),
};

/** The server's explanation when it gave one, else the error's own message. */
export function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    const body = err.body as { message?: string } | null;
    return body?.message ?? err.message;
  }
  return err instanceof Error ? err.message : 'Something went wrong.';
}

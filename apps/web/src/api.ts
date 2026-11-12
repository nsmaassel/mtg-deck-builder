const BASE_URL = import.meta.env['VITE_API_URL'] ?? '/api';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new ApiError((data as { error?: string }).error ?? res.statusText, res.status, data);
  }
  return data as T;
}

export type CommanderSearchResult = {
  commanders: Array<{ name: string; slug: string; colorIdentity: string[] }>;
};

export type CollectionParseResult = {
  cards: Array<{ name: string; quantity: number }>;
  commandersFound: string[];
  totalCards: number;
  unrecognizedLines: string[];
};

export type BuildMode = 'prefer-owned' | 'owned-only' | 'budget';
export type Bracket = 1 | 2 | 3 | 4 | 5;
export type BracketLabel = 'Exhibition' | 'Core' | 'Enhanced' | 'Optimized' | 'cEDH';

export type DeckCard = {
  name: string;
  slot: string;
  cmc: number;
  type_line: string;
  score: number;
  usdPrice: number | null;
  ownedInCollection: boolean;
  /** 0..1, from Scryfall's EDHREC rank: how widely played across Commander, not with this commander. */
  popularity: number;
  /** 0..1: how well the card works with this commander. */
  synergy: number;
  /** Why the card is in the deck. */
  reasons: string[];
};

export type MissingCard = {
  name: string;
  popularity: number;
  synergy: number;
  reasons: string[];
  usdPrice: number | null;
  wouldFillSlot: string;
};

export type BuildDeckResult = {
  deck: {
    commander: DeckCard;
    slots: Record<string, DeckCard[]>;
    totalCards: number;
  };
  analysis: {
    commanderName: string;
    manaCurve: Record<number, number>;
    colorDistribution: Record<string, number>;
    averageCmc: number;
    /** Of the cards we would pick with every card available, the share in this deck, 0..100. */
    topPicksCoveragePercent: number;
    /** What the deck was built around; `because` completes "a commander that …". */
    themes: Array<{ slug: string; name: string; because: string }>;
  };
  gaps: {
    missingCards: MissingCard[];
    budgetUpgrades: MissingCard[];
    premiumUpgrades: MissingCard[];
  };
  powerLevel: {
    bracket: Bracket;
    score: number;
    label: BracketLabel;
    signals: {
      gameChangers: string[];
      tierATutors: string[];
      tierBTutors: string[];
      avgCmc: number;
      interactionCount: number;
      topPicksCoverage: number;
      fastManaRatio: number;
      twoCardComboCount: number;
    };
    explanation: string[];
    targetBracket?: Bracket;
    targetSuggestions?: Array<{
      remove: string;
      removeReason: string;
      removeSlot: string;
      alternatives: Array<{ name: string; popularity: number; synergy?: number; slot: string }>;
    }>;
  };
};

export type ExplainResult = {
  explanation: string;
  keyCards: string[];
  suggestedUpgrades: string[];
};

export type Theme = { slug: string; displayName: string; description: string };

export const api = {
  searchCommanders: (q: string) =>
    request<CommanderSearchResult>(`/commanders/search?q=${encodeURIComponent(q)}`),

  parseCollection: (collectionText: string) =>
    request<CollectionParseResult>('/collection/parse', {
      method: 'POST',
      body: JSON.stringify({ collectionText }),
    }),

  buildDeck: (collectionText: string | undefined, commanderName: string, mode: BuildMode = 'prefer-owned', budgetMaxPrice?: number, targetBracket?: Bracket) =>
    request<BuildDeckResult>('/decks/build-from-commander', {
      method: 'POST',
      body: JSON.stringify({ collectionText, commanderName, options: { mode, budgetMaxPrice, targetBracket } }),
    }),

  explainDeck: (deck: BuildDeckResult['deck'], commanderName: string) =>
    request<ExplainResult>('/ai/explain-deck', {
      method: 'POST',
      body: JSON.stringify({ deck, commanderName }),
    }),

  getThemes: () =>
    request<{ themes: Theme[] }>('/themes'),
};

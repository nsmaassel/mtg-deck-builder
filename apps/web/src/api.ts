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

async function request<T>(path: string, options?: RequestInit): Promise<T> {
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

export type BuildDeckResult = {
  deck: {
    commander: { name: string; slot: string; cmc: number; type_line: string; usdPrice: number | null; ownedInCollection: boolean };
    slots: Record<string, Array<{ name: string; slot: string; cmc: number; type_line: string; score: number; usdPrice: number | null; ownedInCollection: boolean }>>;
    totalCards: number;
  };
  analysis: {
    commanderName: string;
    manaCurve: Record<number, number>;
    colorDistribution: Record<string, number>;
    averageCmc: number;
    staplesCoveragePercent: number;
  };
  gaps: {
    missingStaples: Array<{ name: string; edhrec_inclusion: number; usdPrice: number | null; wouldFillSlot: string }>;
    budgetUpgrades: Array<{ name: string; edhrec_inclusion: number; usdPrice: number | null; wouldFillSlot: string }>;
    premiumUpgrades: Array<{ name: string; edhrec_inclusion: number; usdPrice: number | null; wouldFillSlot: string }>;
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

  buildDeck: (collectionText: string, commanderName: string, mode: BuildMode = 'prefer-owned', budgetMaxPrice?: number) =>
    request<BuildDeckResult>('/decks/build-from-commander', {
      method: 'POST',
      body: JSON.stringify({ collectionText, commanderName, options: { mode, budgetMaxPrice } }),
    }),

  explainDeck: (deck: BuildDeckResult['deck'], commanderName: string) =>
    request<ExplainResult>('/ai/explain-deck', {
      method: 'POST',
      body: JSON.stringify({ deck, commanderName }),
    }),

  getThemes: () =>
    request<{ themes: Theme[] }>('/themes'),
};

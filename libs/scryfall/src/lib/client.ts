import type { ScryfallCard, ScryfallSearchResult } from './schemas';
import {
  ScryfallCardSchema,
  ScryfallSearchResultSchema,
  ScryfallError,
  ScryfallNotFoundError,
} from './schemas';

const BASE_URL = 'https://api.scryfall.com';
const RATE_LIMIT_MS = 100;

// Tracks when the next request is allowed. Each caller atomically reserves
// a time slot, preventing burst-fire 429s when Promise.allSettled fires many
// concurrent lookups (JavaScript is single-threaded so this increment is safe).
let nextAvailableAt = 0;

async function rateLimitedFetch(url: string): Promise<unknown> {
  const now = Date.now();
  let waitUntil: number;
  if (nextAvailableAt <= now) {
    waitUntil = now;
    nextAvailableAt = now + RATE_LIMIT_MS;
  } else {
    waitUntil = nextAvailableAt;
    nextAvailableAt += RATE_LIMIT_MS;
  }
  const wait = waitUntil - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));

  const res = await fetch(url, {
    headers: { 'User-Agent': 'mtg-deck-builder/1.0 (https://github.com/nsmaassel/mtg-deck-builder)' },
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new ScryfallError(`Scryfall API error: ${res.statusText}`, res.status);
  }
  return res.json();
}

/**
 * Look up a single card by name (fuzzy match).
 * Throws ScryfallNotFoundError if not found.
 */
export async function getCardByName(name: string): Promise<ScryfallCard> {
  const url = `${BASE_URL}/cards/named?fuzzy=${encodeURIComponent(name)}`;
  const raw = await rateLimitedFetch(url);
  if (raw === null) throw new ScryfallNotFoundError(name);
  const parsed = ScryfallCardSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ScryfallError(`Invalid card data for "${name}"`, undefined, parsed.error);
  }
  return parsed.data;
}

/**
 * Search Scryfall with a query string.
 * Returns all pages combined (handles has_more pagination).
 */
export async function searchCards(query: string, maxPages = 5): Promise<ScryfallCard[]> {
  const cards: ScryfallCard[] = [];
  let url: string | null = `${BASE_URL}/cards/search?q=${encodeURIComponent(query)}`;
  let pages = 0;

  while (url && pages < maxPages) {
    const raw = await rateLimitedFetch(url);
    if (raw === null) break;

    const parsed = ScryfallSearchResultSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ScryfallError('Invalid search result', undefined, parsed.error);
    }

    const result: ScryfallSearchResult = parsed.data;
    cards.push(...result.data);
    url = result.has_more
      ? `${BASE_URL}/cards/search?q=${encodeURIComponent(query)}&page=${pages + 2}`
      : null;
    pages++;
  }

  return cards;
}

/**
 * Fetch legal Commander cards for autocomplete / commander search.
 */
export async function searchCommanders(nameQuery: string): Promise<ScryfallCard[]> {
  const q = `is:commander legal:commander name:${nameQuery}`;
  return searchCards(q, 1);
}

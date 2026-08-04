import type { ScryfallCard, ScryfallSearchResult } from './schemas';
import {
  ScryfallCardSchema,
  ScryfallSearchResultSchema,
  ScryfallError,
  ScryfallNotFoundError,
} from './schemas';

const BASE_URL = 'https://api.scryfall.com';
const RATE_LIMIT_MS = 100;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;

// In-memory card cache keyed by lowercased name, lives for the server session.
// Commander staples (Sol Ring, Arcane Signet, Command Tower, ...) repeat across
// nearly every build, so caching eliminates most redundant Scryfall lookups.
const cardCache = new Map<string, ScryfallCard>();

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

  const headers = { 'User-Agent': 'mtg-deck-builder/1.0 (https://github.com/nsmaassel/mtg-deck-builder)' };

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers });

    if (res.status === 404) return null;

    // Transient failures (rate limit, upstream hiccups) are retried with
    // exponential backoff, honoring the server's Retry-After when provided.
    if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
      if (attempt >= MAX_RETRIES) {
        throw new ScryfallError(`Scryfall API error: ${res.statusText}`, res.status);
      }
      const retryAfter = Number(res.headers?.get?.('retry-after'));
      const hasRetryAfter = res.headers?.get?.('retry-after') != null;
      const delayMs = hasRetryAfter
        ? retryAfter * 1000
        : RETRY_BASE_DELAY_MS * 2 ** attempt;
      await new Promise(r => setTimeout(r, delayMs));
      continue;
    }

    if (!res.ok) {
      throw new ScryfallError(`Scryfall API error: ${res.statusText}`, res.status);
    }
    return res.json();
  }
}

/**
 * Look up a single card by name (fuzzy match).
 * Throws ScryfallNotFoundError if not found.
 */
export async function getCardByName(name: string): Promise<ScryfallCard> {
  const cacheKey = name.trim().toLowerCase();
  const cached = cardCache.get(cacheKey);
  if (cached) return cached;

  const url = `${BASE_URL}/cards/named?fuzzy=${encodeURIComponent(name)}`;
  const raw = await rateLimitedFetch(url);
  if (raw === null) throw new ScryfallNotFoundError(name);
  const parsed = ScryfallCardSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ScryfallError(`Invalid card data for "${name}"`, undefined, parsed.error);
  }
  cardCache.set(cacheKey, parsed.data);
  return parsed.data;
}

/** Clear the in-memory card cache (useful for tests). */
export function clearCardCache(): void {
  cardCache.clear();
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

/**
 * Commander Spellbook API client.
 * Detects known combo lines (infinite combos, game-winning sequences) in a deck.
 * API docs: https://commanderspellbook.com/api/docs/
 *
 * Two-card infinite combos in a deck are the clearest separator between Bracket 3
 * (synergy-focused) and Bracket 4 (optimized/combo) in the Commander Brackets system.
 */

const BASE_URL = 'https://backend.commanderspellbook.com';
const RATE_LIMIT_MS = 200;

let lastCallAt = 0;

/** A detected combo line from Commander Spellbook */
export interface ComboResult {
  /** Combo ID from Commander Spellbook */
  id: string;
  /** Cards required for this combo */
  uses: string[];
  /** Number of cards in this combo (2 = two-card infinite) */
  cardCount: number;
  /** Short description of what the combo produces */
  produces: string[];
}

/** Cached results keyed by a hash of the sorted card list */
const cache = new Map<string, ComboResult[]>();

function hashCards(cardNames: string[]): string {
  return cardNames
    .map(n => n.toLowerCase())
    .sort()
    .join('|');
}

async function rateLimitedFetch(url: string, options?: RequestInit): Promise<Response> {
  const now = Date.now();
  const wait = RATE_LIMIT_MS - (now - lastCallAt);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastCallAt = Date.now();
  return fetch(url, options);
}

/**
 * Finds combo lines present in a given set of card names using the
 * Commander Spellbook API. Returns empty array on any network failure
 * (combo detection is best-effort, never blocking).
 */
export async function findCombos(cardNames: string[]): Promise<ComboResult[]> {
  const key = hashCards(cardNames);
  if (cache.has(key)) return cache.get(key)!;

  try {
    // Commander Spellbook uses a query syntax similar to Scryfall.
    // We send all card names and ask for variants that use only cards in our deck.
    // The endpoint returns combos where every required card is in our list.
    const params = new URLSearchParams();
    // Build query: card:"name1" card:"name2" ...
    // Limit to the 80 non-land cards most likely to be combo pieces
    const nonLandCards = cardNames
      .filter(n => !n.toLowerCase().includes('basic land') && !isBasicLand(n))
      .slice(0, 80);

    const q = nonLandCards.map(n => `card:"${n}"`).join(' ');
    params.set('q', q);
    params.set('limit', '20');

    const res = await rateLimitedFetch(
      `${BASE_URL}/variants/?${params.toString()}`,
      { headers: { 'User-Agent': 'mtg-deck-builder/1.0' } },
    );

    if (!res.ok) {
      cache.set(key, []);
      return [];
    }

    const data = await res.json() as SpellbookResponse;
    const combos = parseResponse(data, nonLandCards);
    cache.set(key, combos);
    return combos;
  } catch {
    // Network error, API down, etc. — degrade gracefully
    cache.set(key, []);
    return [];
  }
}

const BASIC_LAND_NAMES = new Set([
  'plains', 'island', 'swamp', 'mountain', 'forest', 'wastes',
  'snow-covered plains', 'snow-covered island', 'snow-covered swamp',
  'snow-covered mountain', 'snow-covered forest',
]);

function isBasicLand(name: string): boolean {
  return BASIC_LAND_NAMES.has(name.toLowerCase());
}

// ── Commander Spellbook response shape (simplified) ──────────────────────────
interface SpellbookVariant {
  id: string;
  uses: Array<{ card: { name: string } }>;
  produces: Array<{ feature: { name: string } }>;
}

interface SpellbookResponse {
  count?: number;
  results?: SpellbookVariant[];
}

function parseResponse(data: SpellbookResponse, deckCardNames: string[]): ComboResult[] {
  if (!data.results) return [];

  const deckSet = new Set(deckCardNames.map(n => n.toLowerCase()));

  return data.results
    .map(variant => {
      const uses = variant.uses.map(u => u.card.name);
      // Only include if every card in the combo is actually in our deck
      const allPresent = uses.every(name => deckSet.has(name.toLowerCase()));
      if (!allPresent) return null;

      return {
        id: variant.id,
        uses,
        cardCount: uses.length,
        produces: variant.produces.map(p => p.feature.name),
      };
    })
    .filter((c): c is ComboResult => c !== null);
}

import type { EDHRecCard, EDHRecCommanderData, EDHRecThemeData } from './schemas';
import {
  EDHRecError,
  EDHRecNotFoundError,
} from './schemas';

const BASE_URL = 'https://json.edhrec.com/pages';
const RATE_LIMIT_MS = 300;

let lastCallAt = 0;

// In-memory cache: slug → data (lives for the server session)
const commanderCache = new Map<string, EDHRecCommanderData>();
const themeCache = new Map<string, EDHRecThemeData>();

/** Map EDHRec cardlist tag to our internal slot label */
const TAG_TO_LABEL: Record<string, string> = {
  highsynergycards: 'synergy',
  topcards: 'synergy',
  gamechangers: 'synergy',
  creatures: 'synergy',
  instants: 'interaction',
  sorceries: 'synergy',
  utilityartifacts: 'ramp',
  enchantments: 'synergy',
  planeswalkers: 'synergy',
  utilitylands: 'lands',
  manaartifacts: 'ramp',
  lands: 'lands',
  newcards: 'synergy',
};

/**
 * Convert a card name to an EDHRec URL slug.
 *
 * EDHRec's slug format: lowercase, non-alphanumeric runs → single hyphen, trim hyphens.
 * Example: "Don & Leo, Problem Solvers" → "don-leo-problem-solvers"
 *
 * NOTE: This is EDHRec-specific. Other MTG sites (Scryfall, MTGGoldfish, etc.)
 * use different identifier schemes — there is no community-wide slug standard.
 */
export function toEDHRecSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function rateLimitedFetch(url: string): Promise<unknown> {
  const now = Date.now();
  const wait = RATE_LIMIT_MS - (now - lastCallAt);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastCallAt = Date.now();

  const res = await fetch(url, {
    headers: { 'User-Agent': 'mtg-deck-builder/1.0 (contact: nsmaassel@github.com)' },
  });

  if (res.status === 404) return null;
  if (!res.ok) throw new EDHRecError(`EDHRec API error: ${res.statusText}`, res.status);
  return res.json();
}

/** Parse EDHRec cardlists into our EDHRecCard format */
function parseCardlists(
  cardlists: Array<{ tag: string; header: string; cardviews: Array<Record<string, unknown>> }>,
  potentialDecks: number,
): EDHRecCard[] {
  const seen = new Set<string>();
  const cards: EDHRecCard[] = [];

  for (const list of cardlists) {
    const label = TAG_TO_LABEL[list.tag] ?? 'synergy';
    for (const cv of list.cardviews) {
      const name = String(cv['name'] ?? '');
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());

      const rawInclusion = Number(cv['inclusion'] ?? cv['num_decks'] ?? 0);
      const inclusionPct = potentialDecks > 0
        ? Math.round((rawInclusion / potentialDecks) * 100)
        : 0;

      cards.push({
        name,
        inclusion: inclusionPct,       // normalized to 0–100%
        synergy: Number(cv['synergy'] ?? 0),
        label,
        cmc: Number(cv['cmc'] ?? 0),
      });
    }
  }

  return cards;
}

/**
 * Fetch card recommendations for a commander from EDHRec's JSON API.
 * Results are cached in memory by slug for the lifetime of the process.
 */
export async function getCommanderData(commanderName: string): Promise<EDHRecCommanderData> {
  const slug = toEDHRecSlug(commanderName);

  const cached = commanderCache.get(slug);
  if (cached) return cached;

  const raw = await rateLimitedFetch(`${BASE_URL}/commanders/${slug}.json`) as Record<string, unknown> | null;
  if (raw === null) throw new EDHRecNotFoundError(slug);

  const container = (raw['container'] as Record<string, unknown> | undefined);
  const jsonDict = (container?.['json_dict'] as Record<string, unknown> | undefined);
  const cardlists = (jsonDict?.['cardlists'] as Array<{ tag: string; header: string; cardviews: Array<Record<string, unknown>> }> | undefined) ?? [];

  // Get potential_decks from the first cardlist that has cardviews with it
  let potentialDecks = 0;
  for (const list of cardlists) {
    const first = list.cardviews[0];
    if (first?.['potential_decks']) {
      potentialDecks = Number(first['potential_decks']);
      break;
    }
  }

  const cards = parseCardlists(cardlists, potentialDecks);

  const data: EDHRecCommanderData = { commander: commanderName, slug, cardlist: cards };
  commanderCache.set(slug, data);
  return data;
}

/**
 * Fetch card recommendations for a theme/archetype.
 */
export async function getThemeData(theme: string): Promise<EDHRecThemeData> {
  const slug = toEDHRecSlug(theme);

  const cached = themeCache.get(slug);
  if (cached) return cached;

  const raw = await rateLimitedFetch(`${BASE_URL}/themes/${slug}.json`) as Record<string, unknown> | null;
  if (raw === null) throw new EDHRecNotFoundError(slug);

  const container = (raw['container'] as Record<string, unknown> | undefined);
  const jsonDict = (container?.['json_dict'] as Record<string, unknown> | undefined);
  const cardlists = (jsonDict?.['cardlists'] as Array<{ tag: string; header: string; cardviews: Array<Record<string, unknown>> }> | undefined) ?? [];

  let potentialDecks = 0;
  for (const list of cardlists) {
    const first = list.cardviews[0];
    if (first?.['potential_decks']) {
      potentialDecks = Number(first['potential_decks']);
      break;
    }
  }

  const cards = parseCardlists(cardlists, potentialDecks);

  const data: EDHRecThemeData = { theme, slug, cardlist: cards };
  themeCache.set(slug, data);
  return data;
}

/** Clear caches (useful for testing) */
export function clearCache(): void {
  commanderCache.clear();
  themeCache.clear();
}

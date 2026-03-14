import type { EDHRecCommanderData, EDHRecThemeData } from './schemas';
import {
  EDHRecCommanderDataSchema,
  EDHRecThemeDataSchema,
  EDHRecError,
  EDHRecNotFoundError,
} from './schemas';

const BASE_URL = 'https://edhrec.com/api';
const RATE_LIMIT_MS = 200;

let lastCallAt = 0;

// In-memory cache: slug → data (lives for the server session)
const commanderCache = new Map<string, EDHRecCommanderData>();
const themeCache = new Map<string, EDHRecThemeData>();

export function toSlug(name: string): string {
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

/**
 * Fetch card recommendations for a commander.
 * Results are cached in memory by slug for the lifetime of the process.
 */
export async function getCommanderData(commanderName: string): Promise<EDHRecCommanderData> {
  const slug = toSlug(commanderName);

  const cached = commanderCache.get(slug);
  if (cached) return cached;

  const raw = await rateLimitedFetch(`${BASE_URL}/commanders/${slug}`);
  if (raw === null) throw new EDHRecNotFoundError(slug);

  // EDHRec wraps their response; handle both direct and nested formats
  const payload = (raw as Record<string, unknown>).cardlist
    ? raw
    : { commander: commanderName, slug, cardlist: ((raw as Record<string, unknown>).cards ?? []) };

  const parsed = EDHRecCommanderDataSchema.safeParse(payload);
  if (!parsed.success) {
    throw new EDHRecError(`Invalid EDHRec data for "${commanderName}"`, undefined);
  }

  commanderCache.set(slug, parsed.data);
  return parsed.data;
}

/**
 * Fetch card recommendations for a theme/archetype.
 */
export async function getThemeData(theme: string): Promise<EDHRecThemeData> {
  const slug = toSlug(theme);

  const cached = themeCache.get(slug);
  if (cached) return cached;

  const raw = await rateLimitedFetch(`${BASE_URL}/themes/${slug}`);
  if (raw === null) throw new EDHRecNotFoundError(slug);

  const payload = (raw as Record<string, unknown>).cardlist
    ? raw
    : { theme, slug, cardlist: ((raw as Record<string, unknown>).cards ?? []) };

  const parsed = EDHRecThemeDataSchema.safeParse(payload);
  if (!parsed.success) {
    throw new EDHRecError(`Invalid EDHRec theme data for "${theme}"`, undefined);
  }

  themeCache.set(slug, parsed.data);
  return parsed.data;
}

/** Clear caches (useful for testing) */
export function clearCache(): void {
  commanderCache.clear();
  themeCache.clear();
}

import type { CollectionMap, OwnedCard, ParseResult } from './types';

// MTG Arena export format: `{quantity} {card name} ({set}) {collector#}`
// Example: `4 Lightning Bolt (M21) 161`
const ARENA_LINE_RE = /^(\d+)\s+(.+?)(?:\s+\(([A-Z0-9]+)\)\s+(\S+))?$/;

const BASIC_LANDS = new Set([
  'plains', 'island', 'swamp', 'mountain', 'forest',
  'snow-covered plains', 'snow-covered island', 'snow-covered swamp',
  'snow-covered mountain', 'snow-covered forest',
  'wastes',
]);

// Legendary creature / planeswalker-commander detection heuristic.
// Real validation happens via Scryfall; this is for quick commandersFound listing.
const KNOWN_COMMANDER_TYPES = ['legendary creature', 'legendary planeswalker'];

export function normalizeName(name: string): string {
  return name.toLowerCase().trim();
}

export function isBasicLand(normalizedName: string): boolean {
  return BASIC_LANDS.has(normalizedName);
}

/**
 * Parse an MTG Arena collection export into a CollectionMap.
 * Basic lands are always included regardless of quantity.
 */
export function parseArenaCollection(text: string): ParseResult {
  const collection: CollectionMap = new Map<string, OwnedCard>();
  const unrecognizedLines: string[] = [];
  let totalCards = 0;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//') || line.startsWith('#')) continue;

    // Arena exports sometimes have section headers like "Deck" or "Sideboard"
    if (/^(deck|sideboard|commander)$/i.test(line)) continue;

    const match = ARENA_LINE_RE.exec(line);
    if (!match) {
      unrecognizedLines.push(line);
      continue;
    }

    const quantity = parseInt(match[1]!, 10);
    const name = match[2]!.trim();
    const set = match[3];
    const collectorNumber = match[4];
    const normalizedName = normalizeName(name);

    totalCards += quantity;

    const existing = collection.get(normalizedName);
    if (existing) {
      existing.quantity += quantity;
    } else {
      const card: OwnedCard = { name, normalizedName, quantity, set, collectorNumber };
      collection.set(normalizedName, card);
    }
  }

  // Basic lands are always available — ensure they're in the map
  for (const land of BASIC_LANDS) {
    if (!collection.has(land)) {
      const name = land.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      collection.set(land, { name, normalizedName: land, quantity: 99 });
    }
  }

  const commandersFound = findCommanderCandidates(collection);

  return {
    collection,
    commandersFound,
    totalCards,
    uniqueCards: collection.size,
    unrecognizedLines,
  };
}

/**
 * Identify likely commander candidates from the collection.
 * This is a heuristic — definitive validation requires Scryfall type_line check.
 * We flag cards with names that match known legendary patterns for now;
 * the API layer does the authoritative check via Scryfall.
 */
function findCommanderCandidates(collection: CollectionMap): string[] {
  // Without Scryfall data here, we return all non-basic-land cards as potential candidates.
  // The API layer filters to actual legendary creatures via Scryfall.
  const candidates: string[] = [];
  for (const card of collection.values()) {
    if (!isBasicLand(card.normalizedName)) {
      candidates.push(card.name);
    }
  }
  return candidates;
}

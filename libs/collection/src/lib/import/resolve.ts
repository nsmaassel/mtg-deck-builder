import type { CardLookup, CardRef, CollectionEntry, CollectionImport, ResolvedCollection } from './types';

function resolveEntry(entry: CollectionEntry, lookup: CardLookup): CardRef | undefined {
  // A name says which card is meant; a bare number may be some other tool's own id that happens
  // to be a valid Arena id for a different card. So the name wins, and the id covers the rest.
  const byName = entry.name ? lookup.byName(entry.name) : undefined;
  if (byName) return byName;
  return entry.arenaId !== undefined ? lookup.byArenaId(entry.arenaId) : undefined;
}

/**
 * Maps import entries onto cards: by name when the entry has one that matches, otherwise by Arena
 * id. Copies are summed per oracle id across entries and printings and are not clamped to a deck
 * limit.
 */
export function resolveCollection(imp: CollectionImport, lookup: CardLookup): ResolvedCollection {
  const owned = new Map<string, number>();
  const names = new Map<string, string>();
  const unresolved: CollectionEntry[] = [];
  let totalCards = 0;

  for (const entry of imp.entries) {
    const card = resolveEntry(entry, lookup);
    if (!card) {
      unresolved.push(entry);
      continue;
    }
    owned.set(card.oracleId, (owned.get(card.oracleId) ?? 0) + entry.count);
    if (!names.has(card.oracleId)) names.set(card.oracleId, card.name);
    totalCards += entry.count;
  }

  return { owned, names, unresolved, totalCards, uniqueCards: owned.size };
}

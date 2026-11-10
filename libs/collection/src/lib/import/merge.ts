import { emptyImport } from './shared';
import type { CollectionImport, ImportedDeck } from './types';

function copyDeck(deck: ImportedDeck): ImportedDeck {
  return {
    ...deck,
    mainDeck: deck.mainDeck.map((card) => ({ ...card })),
    sideboard: deck.sideboard.map((card) => ({ ...card })),
    commandZone: deck.commandZone.map((card) => ({ ...card })),
    companions: deck.companions.map((card) => ({ ...card })),
  };
}

/**
 * Combines imports, e.g. a collection file with a Player.log. Entries are concatenated (not
 * summed: `resolveCollection` does that), the result takes the first import's `format`, and for
 * wildcards, gems, gold and vault progress the last import that has a value wins. Decks are
 * de-duplicated by id, the later copy replacing the earlier one in place.
 */
export function mergeImports(...imports: CollectionImport[]): CollectionImport {
  const merged = emptyImport(imports[0]?.format ?? 'arena-text');
  const decks = new Map<string, ImportedDeck>();
  let hasDecks = false;

  for (const imp of imports) {
    for (const entry of imp.entries) merged.entries.push({ ...entry });
    if (imp.wildcards !== undefined) merged.wildcards = { ...imp.wildcards };
    if (imp.gems !== undefined) merged.gems = imp.gems;
    if (imp.gold !== undefined) merged.gold = imp.gold;
    if (imp.vaultProgress !== undefined) merged.vaultProgress = imp.vaultProgress;
    if (imp.decks !== undefined) {
      hasDecks = true;
      for (const deck of imp.decks) decks.set(deck.id, copyDeck(deck));
    }
    merged.warnings.push(...imp.warnings);
    merged.unrecognizedLines.push(...imp.unrecognizedLines);
  }

  if (hasDecks) merged.decks = [...decks.values()];
  return merged;
}

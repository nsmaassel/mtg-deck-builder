import type { CardIndex, Format, IndexedCard, Rarity } from '@mtg/card-index';
import { comboUrl } from '@mtg/combos';
import type { Combo, ComboIndex } from '@mtg/combos';
import { deckBoards, deckColors, usableCopies } from './gap';
import type { Collection, DeckList } from './types';

/** A card of a combo: enough to name it and say what a craft costs. */
export interface ComboCardView {
  oracleId: string;
  name: string;
  /** The wildcard a craft costs. Absent off Arena. */
  arenaRarity?: Rarity;
}

export interface ComboView {
  id: string;
  /** Its page on Commander Spellbook, which has the steps. */
  url: string;
  cards: ComboCardView[];
  /** What it needs besides those cards, where any card of a kind will do: "2x Persist Creature". */
  alsoNeeds: string[];
  /** What it does, the results that win by themselves first. */
  produces: string[];
  /** Results left out of `produces`. */
  moreResults: number;
  colors: string[];
  /** Decks using it, per Commander Spellbook. */
  popularity: number;
}

/** One card the player or the deck lacks that would finish combos. */
export interface ComboCompleterView {
  card: ComboCardView;
  /** Copies owned, up to a playset. For a deck: owned but not in the list. */
  owned: number;
  /** Combos it would finish. */
  finishes: number;
  /** The most played of them. */
  combos: ComboView[];
}

export interface DeckCombos {
  /** Combos whose cards are all in the list, most played first. */
  inDeck: ComboView[];
  inDeckTotal: number;
  /** Cards outside the list that would finish a combo with cards in it; ones the player owns first. */
  oneCardAway: ComboCompleterView[];
}

export interface CollectionCombos {
  /** Combos the collection already holds every card of, most played first. */
  owned: ComboView[];
  ownedTotal: number;
  /** Cards not owned that would finish the most combos. */
  oneCardAway: ComboCompleterView[];
}

const RESULTS_SHOWN = 3;
const COMBOS_SHOWN = 6;
const COMPLETERS_SHOWN = 6;
const COMBOS_PER_COMPLETER = 2;
const PLAYSET = 4;
/** More than any list holds: the count shown is exact below it. */
const COUNT_UP_TO = 2_000;

function cardView(card: IndexedCard): ComboCardView {
  const view: ComboCardView = { oracleId: card.oracleId, name: card.name };
  if (card.arenaRarity) view.arenaRarity = card.arenaRarity;
  return view;
}

/** Undefined when the combo names a card this card index does not have (the two files were built apart). */
function comboView(combo: Combo, index: CardIndex): ComboView | undefined {
  const cards = combo.cards.map(id => index.get(id));
  if (cards.some(card => card === undefined)) return undefined;
  return {
    id: combo.id,
    url: comboUrl(combo.id),
    cards: (cards as IndexedCard[]).map(cardView),
    alsoNeeds: combo.requirements.map(r => (r.quantity > 1 ? `${r.quantity}x ${r.name}` : r.name)),
    produces: combo.produces.slice(0, RESULTS_SHOWN),
    moreResults: Math.max(0, combo.produces.length - RESULTS_SHOWN),
    colors: combo.identity,
    popularity: combo.popularity,
  };
}

const views = (combos: Combo[], index: CardIndex): ComboView[] =>
  combos.map(combo => comboView(combo, index)).filter((view): view is ComboView => view !== undefined);

/**
 * Combos in a list, and the single cards that would add one.
 *
 * Only combos legal in the format and inside the deck's colours count. A
 * combo that needs a card as the commander counts only when that card is the
 * list's commander: in the ninety-nine it does nothing.
 */
export function deckCombos(
  deck: DeckList,
  format: Format,
  collection: Collection,
  index: CardIndex,
  combos: ComboIndex,
): DeckCombos {
  const held = new Map<string, number>();
  for (const [, lines] of deckBoards(deck)) {
    for (const line of lines) {
      const card = index.byName(line.name);
      if (card) held.set(card.oracleId, (held.get(card.oracleId) ?? 0) + line.count);
    }
  }
  const commanders = new Set(deck.commander.map(line => index.byName(line.name)?.oracleId));
  const seated = (combo: Combo) => combo.commanders.every(id => commanders.has(id));
  const query = { format, identity: deckColors(deck, index) };

  const inDeck = combos.complete(held, { ...query, limit: COUNT_UP_TO }).filter(seated);

  // Grouped here rather than by the index, so the commander rule applies before anything is counted.
  const byCard = new Map<string, Combo[]>();
  for (const { combo, missing } of combos.near(held, { ...query, limit: COUNT_UP_TO })) {
    const [lacking] = missing;
    // A missing card that must sit in the command zone is no fix: adding it to the list would not put it there.
    if (!lacking || combo.commanders.includes(lacking) || !seated(combo)) continue;
    byCard.set(lacking, [...(byCard.get(lacking) ?? []), combo]);
  }
  const oneCardAway = [...byCard]
    .map(([oracleId, finished]) => completerView(oracleId, finished, collection, index))
    .filter((view): view is ComboCompleterView => view !== undefined)
    // A card already owned costs nothing to try; after that, the card that finishes the most.
    .sort((a, b) => Number(b.owned > 0) - Number(a.owned > 0) || b.finishes - a.finishes || b.combos[0]!.popularity - a.combos[0]!.popularity)
    .slice(0, COMPLETERS_SHOWN);

  return { inDeck: views(inDeck.slice(0, COMBOS_SHOWN), index), inDeckTotal: inDeck.length, oneCardAway };
}

function completerView(oracleId: string, finished: Combo[], collection: Collection, index: CardIndex): ComboCompleterView | undefined {
  const card = index.get(oracleId);
  const shown = views(finished.slice(0, COMBOS_PER_COMPLETER), index);
  if (!card || shown.length === 0) return undefined;
  return {
    card: cardView(card),
    owned: Math.min(PLAYSET, usableCopies(card, collection)),
    finishes: finished.length,
    combos: shown,
  };
}

/**
 * Combos a collection already holds, and the cards not in it that would
 * finish the most. `colors` narrows both to combos that fit those colours.
 */
export function collectionCombos(
  collection: Collection,
  format: Format,
  index: CardIndex,
  combos: ComboIndex,
  colors?: readonly string[],
): CollectionCombos {
  const query = { format, identity: colors };
  const owned = combos.complete(collection.owned, { ...query, limit: COUNT_UP_TO });
  const oneCardAway = combos
    .completers(collection.owned, { ...query, limit: COMPLETERS_SHOWN })
    .map(completer => {
      const card = index.get(completer.oracleId);
      const shown = views(completer.combos.slice(0, COMBOS_PER_COMPLETER), index);
      if (!card || shown.length === 0) return undefined;
      const view: ComboCompleterView = {
        card: cardView(card),
        owned: Math.min(PLAYSET, usableCopies(card, collection)),
        finishes: completer.total,
        combos: shown,
      };
      return view;
    })
    .filter((view): view is ComboCompleterView => view !== undefined);

  return { owned: views(owned.slice(0, COMBOS_SHOWN), index), ownedTotal: owned.length, oneCardAway };
}

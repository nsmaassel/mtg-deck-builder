import type { CardIndex } from '@mtg/card-index';
import type { ComboIndex } from '@mtg/combos';
import { cardName } from '@mtg/commander-recs';
import type { ComboResult } from '@mtg/power-level';
import type { DeckList } from './types';

/**
 * The combos a built deck holds every card of, in the shape the power
 * assessment takes.
 *
 * Only combos that need nothing but their named cards count: "two cards and
 * any sacrifice outlet" is not a two-card combo. A combo that needs a card in
 * the command zone counts only when that card is this deck's commander.
 */
export function comboLines(index: CardIndex, combos: ComboIndex, deck: DeckList): ComboResult[] {
  const commander = index.byName(deck.commander.name)?.oracleId;
  const held = new Set<string>();
  for (const card of [deck.commander, ...Object.values(deck.slots).flat()]) {
    const known = index.byName(card.name);
    if (known) held.add(known.oracleId);
  }

  return combos
    .complete(held, { format: 'commander', specificOnly: true, limit: Infinity })
    .filter(combo => combo.commanders.every(id => id === commander))
    .map(combo => ({
      id: combo.id,
      uses: combo.cards.map(id => {
        const card = index.get(id);
        return card ? cardName(card) : id;
      }),
      cardCount: combo.cards.length,
      produces: combo.produces,
    }));
}

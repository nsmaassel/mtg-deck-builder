/**
 * A combo whose cards are all in the deck.
 *
 * Two-card infinite combos are the clearest line between Bracket 3
 * (synergy-focused) and Bracket 4 (optimized) in the Commander Brackets. The
 * caller finds them (the API reads Commander Spellbook's bulk data through
 * `@mtg/combos`) and hands them in, so this library needs no network.
 */
export interface ComboResult {
  /** Combo ID from Commander Spellbook */
  id: string;
  /** Cards required for this combo */
  uses: string[];
  /** Number of cards in this combo (2 = two-card combo) */
  cardCount: number;
  /** Short description of what the combo produces */
  produces: string[];
}

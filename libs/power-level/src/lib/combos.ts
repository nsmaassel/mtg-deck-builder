/**
 * A combo whose cards are all in the deck.
 *
 * The Commander Brackets rule two-card infinite combos out of Brackets 1 and
 * 2 and allow them in Bracket 3 only late in the game. Which combos those
 * are is Commander Spellbook's call, not ours: their data gives every combo
 * a bracket of its own, from how many cards it needs, how much mana, and
 * whether what it produces wins the game. The caller finds the combos (the
 * API reads their bulk data through `@mtg/combos`) and hands them in, so this
 * library needs no network.
 */
export interface ComboResult {
  /** Combo ID from Commander Spellbook */
  id: string;
  /** Cards required for this combo */
  uses: string[];
  /** Number of cards in this combo (2 = two-card combo) */
  cardCount: number;
  /**
   * How many of those cards are not the deck's commander. A commander is
   * always to hand, so the brackets' "two-card combo" is two cards besides
   * it, as Commander Spellbook's estimator counts too. Absent means none of
   * the cards is the commander.
   */
  besidesCommander?: number;
  /** Short description of what the combo produces */
  produces: string[];
  /**
   * The lowest bracket Commander Spellbook puts this combo in: 4 for a fast
   * combo that wins, 3 for a slower one, 2 for a slow or minor one, 1 for a
   * loop that wins nothing. Absent when their data has no tag for it.
   */
  bracket?: 1 | 2 | 3 | 4;
}

/** Commander Spellbook's one-letter bracket tags, as the brackets their own estimator maps them to. */
const SPELLBOOK_TAG_BRACKET: Record<string, 1 | 2 | 3 | 4> = { R: 4, S: 3, P: 3, O: 2, C: 2, E: 1 };

export function bracketOfTag(tag: string | undefined): 1 | 2 | 3 | 4 | undefined {
  return tag === undefined ? undefined : SPELLBOOK_TAG_BRACKET[tag];
}

/**
 * The bracket a combo puts a deck in. Only two-card combos count, which is
 * all the brackets rule on. Among those, Commander Spellbook's tag decides;
 * without a tag a two-card combo counts as Bracket 3.
 */
export function comboBracket(combo: ComboResult): 1 | 2 | 3 | 4 {
  if ((combo.besidesCommander ?? combo.cardCount) > 2) return 1;
  return combo.bracket ?? 3;
}

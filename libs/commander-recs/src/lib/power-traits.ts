import type { IndexedCard } from '@mtg/card-index';

/**
 * What a card does that the Commander Brackets single out, read from
 * Scryfall's Tagger tags rather than from a list kept here.
 *
 * - `mass-land-denial` and `extra-turn`: Tagger's tags of those names.
 *   Planeswalkers are left out: Tagger tags them for an ultimate that is
 *   rarely reached.
 * - `tutor`: a spell that finds any card (`tutor-card`) for two mana or less. The brackets
 *   stopped limiting tutors in October 2025; our own estimate still counts
 *   the cheap ones that find anything.
 */
export type PowerTrait = 'mass-land-denial' | 'extra-turn' | 'tutor';

/** Mana value up to which a tutor that finds any card counts as cheap. */
export const CHEAP_TUTOR_MAX_CMC = 2;

export function powerTraits(card: IndexedCard): PowerTrait[] {
  const tags = new Set(card.tags);
  const traits: PowerTrait[] = [];
  const planeswalker = /\bPlaneswalker\b/.test(card.typeLine);
  if (tags.has('mass-land-denial') && !planeswalker) traits.push('mass-land-denial');
  if (tags.has('extra-turn') && !planeswalker) traits.push('extra-turn');
  if (tags.has('tutor-card') && card.cmc <= CHEAP_TUTOR_MAX_CMC && !/\bLand\b/.test(card.typeLine)) traits.push('tutor');
  return traits;
}

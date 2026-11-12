import type { IndexedCard } from '@mtg/card-index';
import type { CardTest } from './types';

/** Does the card pass the test? `tags` is the card's tags as a set, built once per card. */
export function matches(test: CardTest, card: IndexedCard, tags: ReadonlySet<string>): boolean {
  if (test.tags && !test.tags.some(tag => tags.has(tag))) return false;
  if (test.andTags && !test.andTags.some(tag => tags.has(tag))) return false;
  if (test.notTags && test.notTags.some(tag => tags.has(tag))) return false;
  if (test.minCmc !== undefined && card.cmc < test.minCmc) return false;
  if (test.maxCmc !== undefined && card.cmc > test.maxCmc) return false;
  if (test.keyword && !card.keywords.includes(test.keyword)) return false;
  if (test.type && !test.type.test(frontType(card))) return false;
  if (test.text && !test.text.test(card.oracleText)) return false;
  return true;
}

/** The front face's type line: what the card is when it is cast or played. */
export function frontType(card: IndexedCard): string {
  return card.typeLine.split(' // ')[0] ?? card.typeLine;
}

export function isLand(card: IndexedCard): boolean {
  return /\bLand\b/.test(frontType(card));
}

/**
 * The name to show. A reversible card prints the same face twice and Scryfall
 * names it `Front // Front`; every other multi-faced card keeps its full name.
 */
export function cardName(card: IndexedCard): string {
  const faces = card.name.split(' // ');
  return faces.every(face => face === faces[0]) ? faces[0]! : card.name;
}

/** A card that can lead a Commander deck. */
export function canBeCommander(card: IndexedCard): boolean {
  const type = frontType(card);
  if (/\bLegendary\b/.test(type) && /\b(Creature|Vehicle|Spacecraft)\b/.test(type)) return true;
  return /can be your commander/i.test(card.oracleText);
}

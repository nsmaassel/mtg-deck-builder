import { splitFaces } from '@mtg/card-index';
import type { CardIndex, IndexedCard } from '@mtg/card-index';

export interface TagOverlap {
  /** Weighted Jaccard overlap, 0–1. */
  score: number;
  /** Tags both cards carry, heaviest first. */
  shared: string[];
  /** Tags only the first card carries, heaviest first: what the second card fails to do. */
  missing: string[];
}

/**
 * The jobs a deck slot is usually chosen for. Sharing one of these says more
 * than sharing an incidental trait: a graveyard-hate artifact that also draws
 * a card is in the deck for the hate.
 */
export const PRIMARY_ROLE_PATTERN = /^(removal|spot-removal|sweeper|burn|counterspell|hate-|hand-disruption|discard|ramp|mana-(dork|rock|producer)|tutor|recursion|reanimate|regrowth|bounce|theft|protection|fog|extra-turn|prowess-like|anthem)/;
const PRIMARY_ROLE_BOOST = 2;

/** Weight of a tag when comparing cards: specific tags and primary roles count for more. */
export function roleWeight(tag: string, index: CardIndex): number {
  const weight = index.tagWeight(tag);
  return PRIMARY_ROLE_PATTERN.test(tag) ? weight * PRIMARY_ROLE_BOOST : weight;
}

/**
 * How much two cards do the same job, by Scryfall Tagger tags.
 *
 * Tags are weighted by rarity, so sharing `counterspell-tuck` counts for far
 * more than sharing `removal`.
 */
export function tagOverlap(a: IndexedCard, b: IndexedCard, index: CardIndex): TagOverlap {
  if (a.tags.length === 0 || b.tags.length === 0) return { score: 0, shared: [], missing: [] };
  const bTags = new Set(b.tags);
  let sharedWeight = 0;
  let unionWeight = 0;
  const shared: Array<[string, number]> = [];
  const missing: Array<[string, number]> = [];

  for (const tag of a.tags) {
    const weight = roleWeight(tag, index);
    unionWeight += weight;
    if (bTags.has(tag)) {
      sharedWeight += weight;
      shared.push([tag, weight]);
    } else {
      missing.push([tag, weight]);
    }
  }
  const aTags = new Set(a.tags);
  for (const tag of b.tags) {
    if (!aTags.has(tag)) unionWeight += roleWeight(tag, index);
  }

  const byWeight = (x: [string, number], y: [string, number]) => y[1] - x[1] || x[0].localeCompare(y[0]);
  return {
    score: unionWeight > 0 ? sharedWeight / unionWeight : 0,
    shared: shared.sort(byWeight).map(([tag]) => tag),
    missing: missing.sort(byWeight).map(([tag]) => tag),
  };
}

type SparseVector = Map<string, number>;

/** Turn rules text into terms that compare across cards: no card names, no reminder text, no specific numbers. */
export function tokenizeRulesText(card: Pick<IndexedCard, 'name' | 'oracleText'>): string[] {
  let text = card.oracleText;
  const names = [card.name, ...splitFaces(card.name)];
  // Legendary cards refer to themselves by the part of their name before the comma.
  for (const name of [...names]) {
    const short = name.split(',')[0];
    if (short && short !== name) names.push(short);
  }
  for (const name of names.sort((a, b) => b.length - a.length)) {
    text = text.split(name).join(' selfname ');
  }

  const words = text
    .replace(/\([^)]*\)/g, ' ')
    .toLowerCase()
    .replace(/[+-]?[\dx]+\/[+-]?[\dx]+/g, ' ptvalue ')
    .replace(/\{t\}/g, ' tapsymbol ')
    .replace(/\{[^}]+\}/g, ' manasymbol ')
    .replace(/\d+/g, ' num ')
    .split(/[^a-z']+/)
    .filter(w => w.length > 1);

  const terms = [...words];
  for (let i = 0; i + 1 < words.length; i++) terms.push(`${words[i]} ${words[i + 1]}`);
  return terms;
}

/**
 * TF-IDF over rules text, as a fallback signal for cards the community has not
 * tagged yet and a tie-breaker among cards with the same tags.
 */
export class TextModel {
  private readonly documentCount: number;
  private readonly documentFrequency = new Map<string, number>();
  private readonly vectors = new Map<string, SparseVector>();

  constructor(index: CardIndex) {
    const cards = index.all();
    this.documentCount = cards.length;
    for (const card of cards) {
      for (const term of new Set(tokenizeRulesText(card))) {
        this.documentFrequency.set(term, (this.documentFrequency.get(term) ?? 0) + 1);
      }
    }
  }

  /** Cosine similarity of two cards' rules text, 0–1. */
  similarity(a: IndexedCard, b: IndexedCard): number {
    const va = this.vector(a);
    const vb = this.vector(b);
    const [small, large] = va.size <= vb.size ? [va, vb] : [vb, va];
    let dot = 0;
    for (const [term, weight] of small) {
      const other = large.get(term);
      if (other !== undefined) dot += weight * other;
    }
    return Math.max(0, Math.min(1, dot));
  }

  private vector(card: IndexedCard): SparseVector {
    const cached = this.vectors.get(card.oracleId);
    if (cached) return cached;

    const counts = new Map<string, number>();
    for (const term of tokenizeRulesText(card)) counts.set(term, (counts.get(term) ?? 0) + 1);

    const vector: SparseVector = new Map();
    let norm = 0;
    for (const [term, count] of counts) {
      const df = this.documentFrequency.get(term) ?? 0;
      // Terms unseen at build time (a card outside the index) carry no weight.
      if (df === 0) continue;
      const weight = (1 + Math.log(count)) * Math.log(1 + this.documentCount / df);
      vector.set(term, weight);
      norm += weight * weight;
    }
    norm = Math.sqrt(norm);
    if (norm > 0) for (const [term, weight] of vector) vector.set(term, weight / norm);

    this.vectors.set(card.oracleId, vector);
    return vector;
  }
}

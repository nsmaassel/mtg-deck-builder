import { describe, it, expect } from 'vitest';
import { cosineSimilarity, hybridSearch, searchSimilarCards } from '../vector-engine';
import {
  commanderSidar,
  fillerKnight,
  mysticRemora,
  rhysticStudy,
  swordsToPlowshares,
} from './fixtures';

describe('vector-engine cosine similarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it('returns 0 for orthogonal, empty, mismatched, or zero vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0);
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([1, 2], [1])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe('vector-engine dense search', () => {
  it('ranks Rhystic Study neighbors by cosine', () => {
    const hits = searchSimilarCards(
      rhysticStudy,
      [rhysticStudy, mysticRemora, fillerKnight, swordsToPlowshares],
      3,
    );
    expect(hits[0]?.card.name).toBe('Mystic Remora');
    expect(hits[0]?.similarity ?? 0).toBeGreaterThan(0.95);
    expect(hits.every(h => h.card.name !== 'Rhystic Study')).toBe(true);
  });
});

describe('vector-engine hybrid search', () => {
  it('fuses keyword and dense ranks; Remora wins both signals', () => {
    const corpus = [commanderSidar, rhysticStudy, mysticRemora, fillerKnight, swordsToPlowshares];
    const results = hybridSearch(
      'opponent casts noncreature draw',
      [0.88, 0.12, 0.82, 0.28],
      corpus,
      3,
    );
    expect(results).toHaveLength(3);
    expect(results[0]?.card.name).toBe('Mystic Remora');
    expect(results[0]?.score ?? 0).toBeGreaterThan(0);
  });
});

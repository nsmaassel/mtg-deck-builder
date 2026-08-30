import type { MtgCard } from '../types';

/**
 * Calculates cosine similarity between two dense embedding vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0;
  }
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Simple BM25 / lexical scoring for keyword matching.
 */
export function lexicalScore(query: string, card: MtgCard): number {
  const qTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (qTerms.length === 0) return 0;
  const targetText = `${card.name} ${card.typeLine} ${card.oracleText}`.toLowerCase();
  let matches = 0;
  for (const term of qTerms) {
    if (targetText.includes(term)) {
      matches += 1;
    }
  }
  return matches / qTerms.length;
}

/**
 * Searches similar cards using dense cosine similarity with pre-filtering.
 */
export function searchSimilarCards(
  targetCard: MtgCard,
  corpus: MtgCard[],
  topK = 5,
  filterFn?: (card: MtgCard) => boolean
): Array<{ card: MtgCard; similarity: number }> {
  if (!targetCard.embedding) {
    return [];
  }
  const filtered = filterFn ? corpus.filter(filterFn) : corpus;
  const scored = filtered
    .filter((c) => c.id !== targetCard.id && c.embedding && c.embedding.length > 0)
    .map((c) => ({
      card: c,
      similarity: cosineSimilarity(targetCard.embedding!, c.embedding!),
    }));

  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, topK);
}

/**
 * Native Hybrid Search with Reciprocal Rank Fusion (RRF).
 */
export function hybridSearch(
  query: string,
  targetEmbedding: number[] | undefined,
  corpus: MtgCard[],
  topK = 5,
  kRrf = 60
): Array<{ card: MtgCard; score: number; rankDense: number; rankSparse: number }> {
  // 1. Sparse Rank
  const sparseScored = corpus.map((c) => ({
    card: c,
    score: lexicalScore(query, c),
  }));
  sparseScored.sort((a, b) => b.score - a.score);

  const sparseRankMap = new Map<string, number>();
  sparseScored.forEach((item, idx) => {
    sparseRankMap.set(item.card.id, idx + 1);
  });

  // 2. Dense Rank
  const denseScored = corpus.map((c) => ({
    card: c,
    score: targetEmbedding && c.embedding ? cosineSimilarity(targetEmbedding, c.embedding) : 0,
  }));
  denseScored.sort((a, b) => b.score - a.score);

  const denseRankMap = new Map<string, number>();
  denseScored.forEach((item, idx) => {
    denseRankMap.set(item.card.id, idx + 1);
  });

  // 3. RRF Score = 1 / (k + rankSparse) + 1 / (k + rankDense)
  const fused = corpus.map((c) => {
    const rSparse = sparseRankMap.get(c.id) ?? 999;
    const rDense = denseRankMap.get(c.id) ?? 999;
    const rrfScore = 1 / (kRrf + rSparse) + 1 / (kRrf + rDense);
    return {
      card: c,
      score: rrfScore,
      rankDense: rDense,
      rankSparse: rSparse,
    };
  });

  fused.sort((a, b) => b.score - a.score);
  return fused.slice(0, topK);
}

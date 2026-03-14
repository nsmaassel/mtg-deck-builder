import type { DeckList, DeckAnalysis } from '@mtg/deck-builder';
import { findGameChangers } from './game-changers.js';
import { findTutors } from './tutors.js';

export type Bracket = 1 | 2 | 3 | 4 | 5;
export type BracketLabel = 'Exhibition' | 'Core' | 'Enhanced' | 'Optimized' | 'cEDH';

export interface PowerLevelSignals {
  /** Cards present from the WotC Game Changers list */
  gameChangers: string[];
  /** Tier-A tutors (unconditional, low-cost) found in deck */
  tierATutors: string[];
  /** Tier-B tutors (conditional or higher-cost) found in deck */
  tierBTutors: string[];
  /** Average CMC of non-land cards with known mana cost */
  avgCmc: number;
  /** Number of interaction cards (removal + counterspells) */
  interactionCount: number;
  /** Percent of EDHRec top-50 staples included */
  staplesCoverage: number;
  /** Ratio of fast mana (0-1 CMC ramp) to total ramp */
  fastManaRatio: number;
}

export interface PowerLevelResult {
  /** Official WotC Commander Bracket (1–5) */
  bracket: Bracket;
  /** Derived 1–10 community scale (bracket × ~2, with nuance) */
  score: number;
  /** Plain-English bracket label */
  label: BracketLabel;
  /** Individual signals used to compute the bracket */
  signals: PowerLevelSignals;
  /**
   * Plain-English explanation of why the deck scored this bracket.
   * Each string is a single reason.
   */
  explanation: string[];
  /**
   * Suggestions for reaching `targetBracket` (only present when targetBracket
   * is provided and differs from the actual bracket).
   */
  targetSuggestions?: string[];
}

const BRACKET_LABELS: Record<Bracket, BracketLabel> = {
  1: 'Exhibition',
  2: 'Core',
  3: 'Enhanced',
  4: 'Optimized',
  5: 'cEDH',
};

/**
 * Maps bracket to a 1–10 community power level range.
 * Returns the midpoint of the range for display.
 */
const BRACKET_TO_SCORE: Record<Bracket, number> = {
  1: 2,
  2: 4,
  3: 6,
  4: 8,
  5: 10,
};

/**
 * Assesses the power level of a built deck using the Official Commander Brackets
 * framework (WotC, 2024). Returns bracket 1–5, a derived 1–10 score, and a
 * plain-English explanation of every signal that influenced the result.
 *
 * @param deck      The built deck list (100 cards)
 * @param analysis  The DeckAnalysis from buildDeck() — provides avgCmc + staples coverage
 * @param targetBracket  Optional target bracket — if provided, generates swap suggestions
 */
export function assessPowerLevel(
  deck: DeckList,
  analysis: DeckAnalysis,
  targetBracket?: Bracket,
): PowerLevelResult {
  const allCards = [deck.commander, ...Object.values(deck.slots).flat()];
  const cardNames = allCards.map(c => c.name);

  // --- Collect signals ---
  const gameChangers = findGameChangers(cardNames);
  const tutors = findTutors(cardNames);
  const tierATutors = tutors.filter(t => t.tier === 'A').map(t => t.name);
  const tierBTutors = tutors.filter(t => t.tier === 'B').map(t => t.name);

  const interactionCount = (deck.slots['interaction'] ?? []).length;

  // Fast mana = ramp cards with CMC 0 or 1
  const rampCards = deck.slots['ramp'] ?? [];
  const fastManaCount = rampCards.filter(c => c.cmc <= 1).length;
  const fastManaRatio = rampCards.length > 0 ? fastManaCount / rampCards.length : 0;

  const signals: PowerLevelSignals = {
    gameChangers,
    tierATutors,
    tierBTutors,
    avgCmc: analysis.averageCmc,
    interactionCount,
    staplesCoverage: analysis.staplesCoveragePercent,
    fastManaRatio,
  };

  // --- Determine bracket ---
  const explanation: string[] = [];
  let bracket = computeBracket(signals, explanation);

  // --- Target bracket suggestions ---
  let targetSuggestions: string[] | undefined;
  if (targetBracket !== undefined && targetBracket !== bracket) {
    targetSuggestions = buildSuggestions(signals, bracket, targetBracket);
  }

  return {
    bracket,
    score: BRACKET_TO_SCORE[bracket],
    label: BRACKET_LABELS[bracket],
    signals,
    explanation,
    targetSuggestions,
  };
}

function computeBracket(signals: PowerLevelSignals, explanation: string[]): Bracket {
  const gc = signals.gameChangers.length;
  const tierA = signals.tierATutors.length;
  const tierB = signals.tierBTutors.length;
  const { avgCmc, fastManaRatio, staplesCoverage } = signals;

  // --- Bracket 5 (cEDH): full optimization, combo density ---
  // Indicators: many game changers, tier-A tutors, very low CMC, high staples
  if (gc >= 6 && tierA >= 2 && avgCmc > 0 && avgCmc < 2.0) {
    explanation.push(`cEDH-level: ${gc} Game Changers, ${tierA} Tier-A tutors, avg CMC ${avgCmc}`);
    return 5;
  }
  if (gc >= 8) {
    explanation.push(`${gc} Game Changers present — exceeds typical Bracket 4 density`);
    return 5;
  }

  // --- Bracket 4 (Optimized): tuned deck, may have late-game combo ---
  if (gc >= 4) {
    explanation.push(`${gc} Game Changers (${signals.gameChangers.join(', ')}) — Bracket 4 territory`);
    if (tierA >= 1) {
      explanation.push(`${tierA} Tier-A tutor(s): ${signals.tierATutors.join(', ')}`);
    }
    return 4;
  }
  if (gc >= 2 && tierA >= 2) {
    explanation.push(`${gc} Game Changers + ${tierA} Tier-A tutors = consistent early power`);
    return 4;
  }
  if (avgCmc > 0 && avgCmc < 2.2 && gc >= 2) {
    explanation.push(`Very low avg CMC (${avgCmc}) with ${gc} Game Changers — likely optimized`);
    return 4;
  }

  // --- Bracket 3 (Enhanced): synergy-focused, some power staples ---
  if (gc >= 1) {
    explanation.push(`${gc} Game Changer(s) present: ${signals.gameChangers.join(', ')}`);
    explanation.push('At least one Game Changer pushes the deck to Bracket 3 minimum');
    if (tierA >= 1) {
      explanation.push(`Also contains Tier-A tutor(s): ${signals.tierATutors.join(', ')}`);
    }
    return 3;
  }
  if (tierA >= 2) {
    explanation.push(`${tierA} Tier-A tutors without Game Changers — consistent but not oppressive`);
    return 3;
  }
  if (fastManaRatio > 0.5 && staplesCoverage >= 50) {
    explanation.push(`Fast mana ratio ${Math.round(fastManaRatio * 100)}% + ${staplesCoverage}% staple coverage`);
    return 3;
  }
  if (staplesCoverage >= 65) {
    explanation.push(`High staple coverage (${staplesCoverage}%) indicates well-tuned synergies`);
    return 3;
  }

  // --- Bracket 2 (Core): precon-level, limited optimization ---
  if (tierB >= 1 || staplesCoverage >= 40) {
    const reasons: string[] = [];
    if (tierB >= 1) reasons.push(`${tierB} Tier-B tutor(s): ${signals.tierBTutors.join(', ')}`);
    if (staplesCoverage >= 40) reasons.push(`${staplesCoverage}% staple coverage`);
    explanation.push(reasons.join('; '));
    return 2;
  }

  // --- Bracket 1 (Exhibition): minimal optimization ---
  explanation.push('No Game Changers, no tutors, low staple coverage — casual / precon-level');
  return 1;
}

function buildSuggestions(
  signals: PowerLevelSignals,
  current: Bracket,
  target: Bracket,
): string[] {
  const suggestions: string[] = [];

  if (target < current) {
    // User wants to power DOWN
    if (signals.gameChangers.length > 0) {
      const toRemove = signals.gameChangers.slice(0, current - target + 1);
      suggestions.push(`Remove these Game Changers to lower bracket: ${toRemove.join(', ')}`);
    }
    if (signals.tierATutors.length > 0) {
      suggestions.push(`Replace Tier-A tutors with lower-impact ramp/draw: ${signals.tierATutors.join(', ')}`);
    }
    if (signals.fastManaRatio > 0.5) {
      suggestions.push('Swap 0-CMC mana rocks (Mana Crypt, etc.) for 2-mana alternatives (Arcane Signet, etc.)');
    }
  } else {
    // User wants to power UP
    if (target >= 3 && signals.gameChangers.length === 0) {
      suggestions.push('Add at least 1 Game Changer (e.g. Rhystic Study, Cyclonic Rift) to reach Bracket 3');
    }
    if (target >= 3 && signals.tierATutors.length === 0) {
      suggestions.push('Consider adding Demonic Tutor or Vampiric Tutor for consistency');
    }
    if (target >= 4 && signals.gameChangers.length < 4) {
      const needed = 4 - signals.gameChangers.length;
      suggestions.push(`Add ${needed} more Game Changers to reach Bracket 4 (e.g. Jeweled Lotus, Fierce Guardianship)`);
    }
    if (target === 5 && signals.avgCmc > 2.5) {
      suggestions.push(`Lower avg CMC below 2.2 (currently ${signals.avgCmc}) — optimize mana base and curve`);
    }
  }

  return suggestions;
}

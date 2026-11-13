import type { DeckList, DeckAnalysis } from '@mtg/deck-builder';
import { findTutors } from './tutors.js';
import type { ComboResult } from './combos.js';

/**
 * Minimal card shape needed for swap suggestions.
 * Callers pass this in; a `Recommendation` from @mtg/commander-recs fits as it is.
 */
export interface SwapCandidate {
  name: string;
  /** 0–1, from Scryfall's EDHREC rank: how widely played across Commander, not with this commander */
  popularity: number;
  /** 0–1: how well the card works with this commander */
  synergy?: number;
  /** Deck slot the card fills (e.g. 'ramp', 'draw', 'interaction', 'synergy') */
  slot: string;
  /** On the Commander Game Changers list, per Scryfall's card data */
  gameChanger?: boolean;
}

export type Bracket = 1 | 2 | 3 | 4 | 5;
export type BracketLabel = 'Exhibition' | 'Core' | 'Enhanced' | 'Optimized' | 'cEDH';

export interface PowerLevelSignals {
  /** Cards in the deck that are on the Commander Game Changers list, as Scryfall's card data marks them */
  gameChangers: string[];
  /** Tier-A tutors (unconditional, low-cost) found in deck */
  tierATutors: string[];
  /** Tier-B tutors (conditional or higher-cost) found in deck */
  tierBTutors: string[];
  /** Average CMC of non-land cards with known mana cost */
  avgCmc: number;
  /** Number of interaction cards (removal + counterspells) */
  interactionCount: number;
  /** Percent of the cards we would pick for this commander, with every card available, that the deck includes. Shown, not scored. */
  topPicksCoverage: number;
  /**
   * 0–100: how widely played the deck's spells are across Commander, on average
   * (Scryfall's EDHREC rank). A stand-in for how tuned a list is when it has no
   * Game Changers, tutors or combos to go by. It is about the deck's own cards,
   * so a strong list is not marked down for differing from our picks.
   */
  averagePopularity: number;
  /** Ratio of fast mana (0-1 CMC ramp) to total ramp */
  fastManaRatio: number;
  /** Combo lines in the deck, from Commander Spellbook's data (empty when the caller supplied none) */
  combos: ComboResult[];
  /** Number of 2-card combo lines detected */
  twoCardComboCount: number;
}

/** A ranked alternative to a card being removed to lower bracket */
export interface SwapAlternative {
  name: string;
  /** 0–1, from Scryfall's EDHREC rank — higher = more widely played across Commander */
  popularity: number;
  /** 0–1 — how well this card works with this commander */
  synergy?: number;
  slot: string;
}

/** One specific swap: remove a high-power card, add one of the alternatives */
export interface SwapSuggestion {
  /** The card to remove from the deck */
  remove: string;
  /** Human-readable reason why this card raises the bracket */
  removeReason: string;
  /** Which deck slot this card occupies */
  removeSlot: string;
  /**
   * Ranked replacement candidates (up to 3) from the recommendations for this commander.
   * Empty if no candidate pool was provided at assessment time.
   */
  alternatives: SwapAlternative[];
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
   * The bracket the user requested to target (may differ from actual bracket).
   * Present only when a target was provided.
   */
  targetBracket?: Bracket;
  /**
   * Specific swap suggestions for reaching `targetBracket`.
   * Each entry names a card to remove + ranked alternatives.
   * Only present when targetBracket differs from actual bracket.
   */
  targetSuggestions?: SwapSuggestion[];
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
 * @param deck             The built deck list (100 cards)
 * @param analysis         The DeckAnalysis from buildDeck()
 * @param targetBracket    Optional — if provided, generates swap suggestions
 * @param swapCandidates   Optional — recommended cards NOT in the deck, used to
 *                         populate swap alternatives in targetSuggestions
 * @param combos           Optional — combo lines whose cards are all in the deck.
 *                         Without them the assessment goes by the other signals.
 */
export function assessPowerLevel(
  deck: DeckList,
  analysis: DeckAnalysis,
  targetBracket?: Bracket,
  swapCandidates?: SwapCandidate[],
  combos: ComboResult[] = [],
): PowerLevelResult {
  return _assess(deck, analysis, combos, targetBracket, swapCandidates);
}

function _assess(
  deck: DeckList,
  analysis: DeckAnalysis,
  combos: ComboResult[],
  targetBracket?: Bracket,
  swapCandidates?: SwapCandidate[],
): PowerLevelResult {
  const allCards = [deck.commander, ...Object.values(deck.slots).flat()];
  const cardNames = allCards.map(c => c.name);

  // --- Collect signals ---
  const gameChangers = allCards.filter(c => c.gameChanger).map(c => c.name);
  const tutors = findTutors(cardNames);
  const tierATutors = tutors.filter(t => t.tier === 'A').map(t => t.name);
  const tierBTutors = tutors.filter(t => t.tier === 'B').map(t => t.name);

  const interactionCount = (deck.slots['interaction'] ?? []).length;

  // Fast mana = ramp cards with CMC 0 or 1
  const rampCards = deck.slots['ramp'] ?? [];
  const fastManaCount = rampCards.filter(c => c.cmc <= 1).length;
  const fastManaRatio = rampCards.length > 0 ? fastManaCount / rampCards.length : 0;

  const twoCardComboCount = combos.filter(c => c.cardCount <= 2).length;

  const signals: PowerLevelSignals = {
    gameChangers,
    tierATutors,
    tierBTutors,
    avgCmc: analysis.averageCmc,
    interactionCount,
    topPicksCoverage: analysis.topPicksCoveragePercent,
    averagePopularity: analysis.averagePopularityPercent,
    fastManaRatio,
    combos,
    twoCardComboCount,
  };

  // --- Determine bracket ---
  const explanation: string[] = [];
  let bracket = computeBracket(signals, explanation);

  // --- Target bracket suggestions ---
  let targetSuggestions: SwapSuggestion[] | undefined;
  if (targetBracket !== undefined && targetBracket !== bracket) {
    targetSuggestions = buildSuggestions(signals, deck, bracket, targetBracket, swapCandidates);
  }

  return {
    bracket,
    score: BRACKET_TO_SCORE[bracket],
    label: BRACKET_LABELS[bracket],
    signals,
    explanation,
    targetBracket,
    targetSuggestions,
  };
}

/** Average popularity (0–100) at or above which a list with nothing else to go by counts as well tuned. */
const STAPLES_WELL_TUNED = 40;
/** The same, for a list whose ramp is mostly fast mana. */
const STAPLES_WITH_FAST_MANA = 35;
/** Below this a list is casual. */
const STAPLES_CORE = 30;

function computeBracket(signals: PowerLevelSignals, explanation: string[]): Bracket {
  const gc = signals.gameChangers.length;
  const tierA = signals.tierATutors.length;
  const tierB = signals.tierBTutors.length;
  const { avgCmc, fastManaRatio, averagePopularity, twoCardComboCount } = signals;

  // --- Bracket 5 (cEDH): full optimization, combo density ---
  if (gc >= 6 && tierA >= 2 && avgCmc > 0 && avgCmc < 2.0) {
    explanation.push(`cEDH-level: ${gc} Game Changers, ${tierA} Tier-A tutors, avg CMC ${avgCmc}`);
    return 5;
  }
  if (gc >= 8) {
    explanation.push(`${gc} Game Changers present — exceeds typical Bracket 4 density`);
    return 5;
  }
  if (twoCardComboCount >= 2 && tierA >= 2 && avgCmc > 0 && avgCmc < 2.5) {
    explanation.push(`${twoCardComboCount} two-card infinite combos + ${tierA} Tier-A tutors — cEDH-adjacent`);
    return 5;
  }

  // --- Bracket 4 (Optimized): tuned deck, may have late-game combo ---
  // A confirmed two-card infinite combo pushes to Bracket 4 regardless of GC count
  if (twoCardComboCount >= 1 && gc >= 1) {
    explanation.push(`${twoCardComboCount} two-card combo line(s) detected + ${gc} Game Changer(s)`);
    return 4;
  }
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
  // A two-card combo without other cEDH signals is still Bracket 3 floor
  if (twoCardComboCount >= 1) {
    explanation.push(`${twoCardComboCount} two-card combo line(s) detected — Bracket 3 minimum`);
    if (gc >= 1) explanation.push(`Also has ${gc} Game Changer(s): ${signals.gameChangers.join(', ')}`);
    return 3;
  }
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
  // With no Game Changers, tutors or combos to go by, how widely played the
  // deck's spells are stands in for how tuned it is. Measured on real builds:
  // the best list for a commander averages 41–50, a list from a large
  // collection 33–45, from a starter collection 28–38.
  const played = `Its spells average ${averagePopularity} out of 100 for how widely they are played across Commander`;
  if (fastManaRatio > 0.5 && averagePopularity >= STAPLES_WITH_FAST_MANA) {
    explanation.push(`Fast mana ratio ${Math.round(fastManaRatio * 100)}%. ${played}`);
    return 3;
  }
  if (averagePopularity >= STAPLES_WELL_TUNED) {
    explanation.push(`${played} — a well-tuned list`);
    return 3;
  }

  // --- Bracket 2 (Core): precon-level, limited optimization ---
  if (tierB >= 1 || averagePopularity >= STAPLES_CORE) {
    const reasons: string[] = [];
    if (tierB >= 1) reasons.push(`${tierB} Tier-B tutor(s): ${signals.tierBTutors.join(', ')}`);
    if (averagePopularity >= STAPLES_CORE) reasons.push(played);
    explanation.push(reasons.join('; '));
    return 2;
  }

  // --- Bracket 1 (Exhibition): minimal optimization ---
  explanation.push(`No Game Changers, no tutors. ${played} — casual`);
  return 1;
}

function buildSuggestions(
  signals: PowerLevelSignals,
  deck: DeckList,
  current: Bracket,
  target: Bracket,
  candidates?: SwapCandidate[],
): SwapSuggestion[] {
  const suggestions: SwapSuggestion[] = [];
  const allDeckCards = [deck.commander, ...Object.values(deck.slots).flat()];

  // Build a lookup: card name (lower) → slot name
  const cardSlotMap = new Map(allDeckCards.map(c => [c.name.toLowerCase(), c.slot]));

  // Build candidate index: slot → ranked candidates (not in deck, not a GC)
  const candidatesBySlot = buildCandidateIndex(candidates ?? [], cardSlotMap);

  if (target < current) {
    // ── Power DOWN: remove Game Changers and Tier-A tutors ──────────────────
    const bracketDiff = current - target;
    // Prioritize removing Game Changers first (bigger bracket impact)
    const toRemoveGC = signals.gameChangers.slice(0, bracketDiff + 1);
    for (const cardName of toRemoveGC) {
      const slot = cardSlotMap.get(cardName.toLowerCase()) ?? 'synergy';
      suggestions.push({
        remove: cardName,
        removeReason: 'On the Commander Game Changers list: one of the cards that most warp casual play',
        removeSlot: slot,
        alternatives: candidatesBySlot.get(slot)?.slice(0, 3) ?? [],
      });
    }

    // Then Tier-A tutors if still above target after GC removal
    if (signals.tierATutors.length > 0 && suggestions.length < bracketDiff + 1) {
      for (const cardName of signals.tierATutors.slice(0, 1)) {
        const slot = cardSlotMap.get(cardName.toLowerCase()) ?? 'synergy';
        suggestions.push({
          remove: cardName,
          removeReason: 'Tier-A tutor — unconditional low-cost tutor that compresses variance',
          removeSlot: slot,
          alternatives: candidatesBySlot.get(slot)?.slice(0, 3) ?? [],
        });
      }
    }
  } else {
    // ── Power UP: suggest adding Game Changers / tutors from candidate pool ──
    // For power-up we suggest specific cards TO ADD (no forced remove — user decides what to cut)
    if (target >= 3) {
      const blended = (c: SwapCandidate) => c.popularity * 0.5 + (c.synergy ?? 0) * 0.5;

      const gcCandidates = (candidates ?? [])
        .filter(c => c.gameChanger)
        .sort((a, b) => blended(b) - blended(a))
        .slice(0, target >= 4 ? 4 : 2);

      for (const candidate of gcCandidates) {
        suggestions.push({
          remove: '(flex / lowest-synergy card in same slot)',
          removeReason: 'Cut to make room for this Game Changer',
          removeSlot: candidate.slot,
          alternatives: [{
            name: candidate.name,
            popularity: candidate.popularity,
            synergy: candidate.synergy,
            slot: candidate.slot,
          }],
        });
      }

      if (target >= 3 && signals.tierATutors.length === 0) {
        const tutorCandidates = (candidates ?? [])
          .filter(c => ['demonic tutor', 'vampiric tutor', 'diabolic intent', 'wishclaw talisman']
            .includes(c.name.toLowerCase()))
          .sort((a, b) => blended(b) - blended(a))
          .slice(0, 1);

        for (const candidate of tutorCandidates) {
          suggestions.push({
            remove: '(flex / lowest-synergy card in same slot)',
            removeReason: 'Cut to make room for this tutor',
            removeSlot: candidate.slot,
            alternatives: [{ name: candidate.name, popularity: candidate.popularity, synergy: candidate.synergy, slot: candidate.slot }],
          });
        }
      }
    }
  }

  return suggestions;
}

/**
 * Builds a slot-indexed map of candidate replacements.
 * Excludes: cards already in the deck, cards on the Game Changers list.
 * Ranks by blended score: 50% popularity (Commander-wide) + 50% synergy (commander fit).
 */
function buildCandidateIndex(
  candidates: SwapCandidate[],
  deckCardNames: Map<string, string>,
): Map<string, SwapAlternative[]> {
  const index = new Map<string, SwapAlternative[]>();

  for (const c of candidates) {
    const lower = c.name.toLowerCase();
    if (deckCardNames.has(lower)) continue;
    if (c.gameChanger) continue;

    const slot = c.slot || 'synergy';
    if (!index.has(slot)) index.set(slot, []);
    index.get(slot)!.push({ name: c.name, popularity: c.popularity, synergy: c.synergy, slot });
  }

  // Rank by blended score: popularity and synergy (both 0-1), weighted 50% each
  const blendedScore = (a: SwapAlternative) =>
    a.popularity * 0.5 + (a.synergy ?? 0) * 0.5;

  for (const [slot, alts] of index) {
    index.set(slot, alts.sort((a, b) => blendedScore(b) - blendedScore(a)));
  }

  return index;
}

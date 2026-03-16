import type { DeckList, DeckAnalysis } from '@mtg/deck-builder';
import { findGameChangers, GAME_CHANGERS } from './game-changers.js';
import { findTutors } from './tutors.js';
import { findCombos } from './combos.js';
import type { ComboResult } from './combos.js';

/**
 * Minimal EDHRec card shape needed for swap suggestions.
 * Callers pass this in; power-level doesn't import @mtg/edhrec directly.
 */
export interface EdhrecCandidate {
  name: string;
  /** Normalized inclusion rate 0–100 */
  inclusion: number;
  /** Synergy score 0–1 (how much this card over-indexes for this commander vs. avg) */
  synergy?: number;
  /** EDHRec section label (e.g. 'ramp', 'draw', 'interaction', 'synergy') */
  label: string;
}

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
  /** Known combo lines detected via Commander Spellbook (may be empty if not fetched) */
  combos: ComboResult[];
  /** Number of 2-card combo lines detected */
  twoCardComboCount: number;
}

/** A ranked alternative to a card being removed to lower bracket */
export interface SwapAlternative {
  name: string;
  /** EDHRec inclusion rate 0–100 — higher = more popular for this commander */
  inclusion: number;
  /** EDHRec synergy score 0–1 — how much this card over-indexes for this commander */
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
   * Ranked replacement candidates (up to 3) from EDHRec recommendations.
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
   * Each entry names a card to remove + ranked EDHRec alternatives.
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
 * This is the synchronous variant — combo detection is skipped (combos=[]).
 * Use assessPowerLevelWithCombos() when you need combo data.
 *
 * @param deck             The built deck list (100 cards)
 * @param analysis         The DeckAnalysis from buildDeck()
 * @param targetBracket    Optional — if provided, generates swap suggestions
 * @param edhrecCandidates Optional — EDHRec cards NOT in the deck, used to
 *                         populate swap alternatives in targetSuggestions
 */
export function assessPowerLevel(
  deck: DeckList,
  analysis: DeckAnalysis,
  targetBracket?: Bracket,
  edhrecCandidates?: EdhrecCandidate[],
): PowerLevelResult {
  return _assess(deck, analysis, [], targetBracket, edhrecCandidates);
}

/**
 * Async variant that also queries Commander Spellbook for combo lines.
 * Combo detection is best-effort — any network failure returns the same
 * result as assessPowerLevel() with combos=[].
 *
 * @param edhrecCandidates Optional EDHRec cards NOT in the deck, for swap suggestions
 */
export async function assessPowerLevelWithCombos(
  deck: DeckList,
  analysis: DeckAnalysis,
  targetBracket?: Bracket,
  edhrecCandidates?: EdhrecCandidate[],
): Promise<PowerLevelResult> {
  const allCards = [deck.commander, ...Object.values(deck.slots).flat()];
  const combos = await findCombos(allCards.map(c => c.name));
  return _assess(deck, analysis, combos, targetBracket, edhrecCandidates);
}

function _assess(
  deck: DeckList,
  analysis: DeckAnalysis,
  combos: ComboResult[],
  targetBracket?: Bracket,
  edhrecCandidates?: EdhrecCandidate[],
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

  const twoCardComboCount = combos.filter(c => c.cardCount <= 2).length;

  const signals: PowerLevelSignals = {
    gameChangers,
    tierATutors,
    tierBTutors,
    avgCmc: analysis.averageCmc,
    interactionCount,
    staplesCoverage: analysis.staplesCoveragePercent,
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
    targetSuggestions = buildSuggestions(signals, deck, bracket, targetBracket, edhrecCandidates);
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

function computeBracket(signals: PowerLevelSignals, explanation: string[]): Bracket {
  const gc = signals.gameChangers.length;
  const tierA = signals.tierATutors.length;
  const tierB = signals.tierBTutors.length;
  const { avgCmc, fastManaRatio, staplesCoverage, twoCardComboCount } = signals;

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
  deck: DeckList,
  current: Bracket,
  target: Bracket,
  candidates?: EdhrecCandidate[],
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
        removeReason: 'WotC Game Changer — one of the ~40 cards that most warp casual play',
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
      const blended = (c: EdhrecCandidate) => c.inclusion * 0.5 + (c.synergy ?? 0) * 100 * 0.5;

      const gcCandidates = (candidates ?? [])
        .filter(c => GAME_CHANGERS.has(c.name.toLowerCase()))
        .sort((a, b) => blended(b) - blended(a))
        .slice(0, target >= 4 ? 4 : 2);

      for (const candidate of gcCandidates) {
        suggestions.push({
          remove: '(flex / lowest-synergy card in same slot)',
          removeReason: 'Cut to make room for this Game Changer',
          removeSlot: candidate.label,
          alternatives: [{
            name: candidate.name,
            inclusion: candidate.inclusion,
            synergy: candidate.synergy,
            slot: candidate.label,
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
            removeSlot: candidate.label,
            alternatives: [{ name: candidate.name, inclusion: candidate.inclusion, synergy: candidate.synergy, slot: candidate.label }],
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
 * Ranks by blended score: 50% inclusion (popularity for this commander) + 50% synergy (commander fit).
 */
function buildCandidateIndex(
  candidates: EdhrecCandidate[],
  deckCardNames: Map<string, string>,
): Map<string, SwapAlternative[]> {
  const index = new Map<string, SwapAlternative[]>();

  for (const c of candidates) {
    const lower = c.name.toLowerCase();
    if (deckCardNames.has(lower)) continue;
    if (GAME_CHANGERS.has(lower)) continue;

    const slot = c.label || 'synergy';
    if (!index.has(slot)) index.set(slot, []);
    index.get(slot)!.push({ name: c.name, inclusion: c.inclusion, synergy: c.synergy, slot });
  }

  // Rank by blended score: inclusion (0-100) weighted 50%, synergy (0-1, scaled ×100) weighted 50%
  const blendedScore = (a: SwapAlternative) =>
    a.inclusion * 0.5 + (a.synergy ?? 0) * 100 * 0.5;

  for (const [slot, alts] of index) {
    index.set(slot, alts.sort((a, b) => blendedScore(b) - blendedScore(a)));
  }

  return index;
}

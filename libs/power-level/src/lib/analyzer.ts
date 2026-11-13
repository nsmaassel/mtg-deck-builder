import type { DeckCard, DeckList, DeckAnalysis } from '@mtg/deck-builder';
import type { BracketFinding } from './method.js';
import { comboBracket } from './combos.js';
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
  /** What the card does that the brackets single out, from Scryfall's Tagger tags */
  traits?: string[];
}

export type Bracket = 1 | 2 | 3 | 4 | 5;
export type BracketLabel = 'Exhibition' | 'Core' | 'Upgraded' | 'Optimized' | 'cEDH';

export interface PowerLevelSignals {
  /** Cards in the deck that are on the Commander Game Changers list, as Scryfall's card data marks them */
  gameChangers: string[];
  /** Cheap tutors that find any card (Scryfall's Tagger tag `tutor-card`, mana value 2 or less) */
  tutors: string[];
  /** Mass land denial, by Scryfall's Tagger tag of that name */
  massLandDenial: string[];
  /** Cards that take an extra turn, by Scryfall's Tagger tag */
  extraTurns: string[];
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
  /** Combos that count towards the bracket: the ones Commander Spellbook puts in Bracket 3 or 4 */
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
   * Each string is a single reason: the text of `findings`, in order.
   */
  explanation: string[];
  /**
   * The same reasons, each marked as a rule of the published brackets or as
   * our own estimate, with the bracket it puts the deck in.
   */
  findings: BracketFinding[];
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
  3: 'Upgraded',
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
 * framework (Wizards of the Coast; see `method.ts`). Returns bracket 1–5, a derived 1–10 score, and a
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

  // --- Collect signals ---
  const withTrait = (trait: NonNullable<DeckCard['traits']>[number]) =>
    allCards.filter(c => c.traits?.includes(trait)).map(c => c.name);
  const gameChangers = allCards.filter(c => c.gameChanger).map(c => c.name);

  const interactionCount = (deck.slots['interaction'] ?? []).length;

  // Fast mana = ramp cards with CMC 0 or 1
  const rampCards = deck.slots['ramp'] ?? [];
  const fastManaCount = rampCards.filter(c => c.cmc <= 1).length;
  const fastManaRatio = rampCards.length > 0 ? fastManaCount / rampCards.length : 0;

  const twoCardComboCount = combos.filter(c => comboBracket(c) >= 3).length;

  const signals: PowerLevelSignals = {
    gameChangers,
    tutors: withTrait('tutor'),
    massLandDenial: withTrait('mass-land-denial'),
    extraTurns: withTrait('extra-turn'),
    avgCmc: analysis.averageCmc,
    interactionCount,
    topPicksCoverage: analysis.topPicksCoveragePercent,
    averagePopularity: analysis.averagePopularityPercent,
    fastManaRatio,
    combos,
    twoCardComboCount,
  };

  // --- Determine bracket ---
  const findings = bracketFindings(signals);
  const bracket = findings.reduce<Bracket>((top, finding) => (finding.bracket > top ? finding.bracket : top), 1);

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
    explanation: findings.map(finding => finding.text),
    findings,
    targetBracket,
    targetSuggestions,
  };
}

/**
 * The numbers our own estimate goes by. `method.ts` prints them for people,
 * so what the app says about itself cannot drift from what it does.
 */
export const ESTIMATE = {
  /** Game Changers Bracket 3 allows, as published. */
  gameChangersAllowedAt3: 3,
  /** Extra-turn cards from which a deck counts as chaining turns. Commander Spellbook's estimator draws the line here too. */
  extraTurnsToChain: 2,
  /** Average popularity (0–100) at or above which a list with nothing else to go by counts as well tuned. */
  staplesWellTuned: 40,
  /** The same, for a list whose ramp is mostly fast mana. */
  staplesWithFastMana: 35,
  /**
   * Below this a list is casual. Set on Wizards' own preconstructed decks,
   * which they built as the Bracket 2 baseline (`scripts/eval-brackets.ts`):
   * the decks since 2023 average 20–39 with nine in ten at 24 or more; the
   * decks of 2011–2019 sit around 22 and mostly fall below.
   */
  staplesCore: 24,
  /** Game Changers from which a list reads as cEDH whatever else is in it. */
  gameChangersCedh: 8,
} as const;

/**
 * Every reason the deck has for sitting in a bracket. The deck's bracket is
 * the highest one named.
 *
 * Rules first: what the published brackets rule out below a certain bracket
 * (Game Changers, mass land denial, two-card combos). Then our own estimate,
 * for what the published brackets leave to the table: how tuned a list is,
 * how many extra turns make a chain, and where Bracket 4 ends and cEDH
 * begins. Of the estimates about how tuned the list is, one is reported,
 * the highest that holds.
 */
function bracketFindings(signals: PowerLevelSignals): BracketFinding[] {
  const gc = signals.gameChangers.length;
  const tutors = signals.tutors.length;
  const { avgCmc, fastManaRatio, averagePopularity, twoCardComboCount } = signals;
  const findings: BracketFinding[] = [];
  const names = (cards: string[]) => cards.join(', ');
  const s = (n: number) => (n === 1 ? '' : 's');

  // --- What the published brackets rule out ---
  if (gc > ESTIMATE.gameChangersAllowedAt3) {
    findings.push({
      basis: 'rule',
      bracket: 4,
      text: `${gc} Game Changers (${names(signals.gameChangers)}): Bracket 3 allows ${ESTIMATE.gameChangersAllowedAt3}`,
    });
  } else if (gc >= 1) {
    findings.push({
      basis: 'rule',
      bracket: 3,
      text: `${gc} Game Changer${s(gc)} (${names(signals.gameChangers)}): Brackets 1 and 2 allow none`,
    });
  }
  if (signals.massLandDenial.length > 0) {
    findings.push({
      basis: 'rule',
      bracket: 4,
      text: `Mass land denial (${names(signals.massLandDenial)}): Brackets 1 to 3 rule it out`,
    });
  }
  const fast = signals.combos.filter(combo => comboBracket(combo) === 4);
  const slow = signals.combos.filter(combo => comboBracket(combo) === 3);
  const minor = signals.combos.filter(combo => comboBracket(combo) === 2);
  const pieces = (combo: ComboResult) => combo.uses.join(' + ');
  if (fast.length > 0) {
    findings.push({
      basis: 'rule',
      bracket: 4,
      text: `${fast.length} fast two-card combo${s(fast.length)} (${pieces(fast[0]!)}${fast.length > 1 ? ', …' : ''}), Bracket 4 by Commander Spellbook's reckoning: Bracket 3 allows a two-card combo only late in the game`,
    });
  }
  if (slow.length > 0) {
    findings.push({
      basis: 'rule',
      bracket: 3,
      text: `${slow.length} two-card combo${s(slow.length)} (${pieces(slow[0]!)}${slow.length > 1 ? ', …' : ''}): Brackets 1 and 2 rule them out`,
    });
  }

  // --- Our own estimate ---
  const played = `Its spells average ${averagePopularity} out of 100 for how widely they are played across Commander`;
  const estimate = (bracket: Bracket, text: string) => findings.push({ basis: 'estimate', bracket, text });
  const lowCurve = (below: number) => avgCmc > 0 && avgCmc < below;

  // The published brackets say "no chained extra turns" and "no two-card infinite combos" without
  // saying how many cards chain or which loops count. Commander Spellbook's estimator draws those
  // lines, and we follow it.
  if (signals.extraTurns.length >= ESTIMATE.extraTurnsToChain) {
    estimate(4, `${signals.extraTurns.length} extra-turn cards (${names(signals.extraTurns)}): enough to chain turns, which Brackets 1 to 3 rule out`);
  } else if (signals.extraTurns.length === 1) {
    estimate(2, `An extra-turn card (${signals.extraTurns[0]}): fine from Bracket 2 up`);
  }
  if (minor.length > 0 && fast.length + slow.length === 0) {
    estimate(2, `${minor.length} slow or minor two-card combo${s(minor.length)} (${pieces(minor[0]!)}${minor.length > 1 ? ', …' : ''}): Bracket 2 by Commander Spellbook's reckoning`);
  }

  if (gc >= 6 && tutors >= 2 && lowCurve(2.0)) {
    estimate(5, `Reads as cEDH: ${gc} Game Changers, ${tutors} cheap tutors that find any card, average mana value ${avgCmc}`);
  } else if (gc >= ESTIMATE.gameChangersCedh) {
    estimate(5, `${gc} Game Changers: more than a Bracket 4 deck usually plays`);
  } else if (twoCardComboCount >= 2 && tutors >= 2 && lowCurve(2.5)) {
    estimate(5, `${twoCardComboCount} two-card combos with ${tutors} cheap tutors to find them, average mana value ${avgCmc}: reads as cEDH`);
  } else if (gc >= 2 && tutors >= 2) {
    estimate(4, `${gc} Game Changers with ${tutors} cheap tutors (${names(signals.tutors)}) to find them: consistent early power`);
  } else if (lowCurve(2.2) && gc >= 2) {
    estimate(4, `Very low average mana value (${avgCmc}) with ${gc} Game Changers: likely optimized`);
  } else if (tutors >= 2) {
    estimate(3, `${tutors} cheap tutors that find any card (${names(signals.tutors)}): the deck finds its best cards every game`);
  } else if (fastManaRatio > 0.5 && averagePopularity >= ESTIMATE.staplesWithFastMana) {
    estimate(3, `Fast mana is ${Math.round(fastManaRatio * 100)}% of its ramp. ${played}`);
  } else if (averagePopularity >= ESTIMATE.staplesWellTuned) {
    // With no Game Changers, tutors or combos to go by, how widely played the
    // deck's spells are stands in for how tuned it is. Measured on real builds:
    // the best list for a commander averages 41–50, a list from a large
    // collection 33–45, from a starter collection 28–38.
    estimate(3, `${played}: a well-tuned list`);
  } else if (averagePopularity >= ESTIMATE.staplesCore) {
    estimate(2, played);
  } else {
    estimate(1, `${played}: casual`);
  }

  // Rules first, then the estimate; within each, the reason that decides the bracket leads.
  return findings.sort(
    (a, b) => Number(b.basis === 'rule') - Number(a.basis === 'rule') || b.bracket - a.bracket,
  );
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
    // ── Power DOWN: remove Game Changers and cheap tutors ──────────────────
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

    // What Brackets 1 to 3 rule out goes whatever else is in the deck.
    if (target < 4) {
      const ruledOut: Array<[string, string]> = [
        ...signals.massLandDenial.map((name): [string, string] => [name, 'Mass land denial: Brackets 1 to 3 rule it out']),
        ...(signals.extraTurns.length >= ESTIMATE.extraTurnsToChain
          ? signals.extraTurns.slice(1).map((name): [string, string] => [name, 'One extra-turn card too many: together they can chain turns'])
          : []),
      ];
      const combo = signals.combos.find(line => comboBracket(line) > Math.max(target, 2));
      const piece = combo?.uses.find(name => name !== deck.commander.name);
      if (combo && piece) ruledOut.push([piece, `Part of a two-card combo (${combo.uses.join(' + ')})`]);
      for (const [cardName, removeReason] of ruledOut) {
        if (suggestions.some(suggestion => suggestion.remove === cardName)) continue;
        const slot = cardSlotMap.get(cardName.toLowerCase()) ?? 'synergy';
        suggestions.push({ remove: cardName, removeReason, removeSlot: slot, alternatives: candidatesBySlot.get(slot)?.slice(0, 3) ?? [] });
      }
    }

    // Then cheap tutors if still above target after GC removal
    if (signals.tutors.length > 0 && suggestions.length < bracketDiff + 1) {
      for (const cardName of signals.tutors.slice(0, 1)) {
        const slot = cardSlotMap.get(cardName.toLowerCase()) ?? 'synergy';
        suggestions.push({
          remove: cardName,
          removeReason: 'A cheap tutor that finds any card: it makes the deck play out the same way every game',
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

      if (target >= 3 && signals.tutors.length === 0) {
        const tutorCandidates = (candidates ?? [])
          .filter(c => c.traits?.includes('tutor'))
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

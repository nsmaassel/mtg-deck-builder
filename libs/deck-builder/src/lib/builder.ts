import { byScore, cardName, powerTraits, recommendationScore } from '@mtg/commander-recs';
import type { Recommendation } from '@mtg/commander-recs';
import type {
  BuildAdjustments,
  BuildDeckInput,
  BuildDeckResult,
  BuildMode,
  DeckCard,
  DeckList,
  DeckAnalysis,
  GapReport,
  MissingCard,
  SlotName,
} from './types';
import { SLOT_TARGETS, TOTAL_DECK_SIZE } from './types';
import { OWNED_BOOST, scoreCard, isColorLegal, basicLandForColor, nonbasicLandLimit } from './scoring';
import { assessPowerLevel } from '@mtg/power-level';

/** The slots a card is placed in for the job it does, filled before the rest. */
const STAPLE_SLOTS = ['ramp', 'draw', 'interaction', 'winConditions'] as const;

const COLORS = ['W', 'U', 'B', 'R', 'G'];

export interface Candidate {
  card: Recommendation;
  /** The card as the build ranks it: the same card, with its popularity marked down when staples are eased off. */
  ranked: Recommendation;
  owned: boolean;
  /** Whether owning the card counts for it. */
  boosted: boolean;
  /** Score for the card's own slot, owned boost included. */
  score: number;
}

interface Filled {
  slots: Record<SlotName, DeckCard[]>;
  /** Oracle ids of the cards placed. Basic lands are not among them. */
  used: Set<string>;
}

function toDeckCard({ card, owned }: Candidate, slot: SlotName, score: number): DeckCard {
  return {
    name: card.name,
    quantity: 1,
    ownedInCollection: owned,
    popularity: card.popularity,
    synergy: card.synergy,
    score,
    slot,
    cmc: card.cmc,
    type_line: card.typeLine,
    usdPrice: card.usd ?? null,
    reasons: card.reasons,
    ...(card.gameChanger ? { gameChanger: true } : {}),
    ...(card.traits ? { traits: card.traits } : {}),
  };
}

/**
 * The card as a build that eases off staples ranks it (see
 * `BuildAdjustments.stapleDiscount`). The card shown to people keeps its real
 * numbers.
 */
function rankedFor(card: Recommendation, discount: number): Recommendation {
  if (discount <= 0) return card;
  const offTheme = Math.min(1, discount);
  const everything = Math.min(1, Math.max(0, discount - 1));
  const popularity = card.popularity * (1 - offTheme * (1 - card.synergy)) * (1 - everything);
  return { ...card, popularity, score: recommendationScore({ ...card, popularity }) };
}

/** The cards a build may use, best first. An empty `owned` and mode `prefer-owned` give the unconstrained pool. */
export function eligible(
  recommendations: Recommendation[],
  commanderId: string,
  identity: readonly string[],
  owned: ReadonlySet<string>,
  mode: BuildMode,
  budgetMaxPrice: number,
  adjust: BuildAdjustments = {},
): Candidate[] {
  return recommendations
    .filter(card => card.oracleId !== commanderId && isColorLegal(card.colorIdentity, identity))
    .filter(card => !adjust.exclude?.has(card.oracleId))
    .map(card => {
      const isOwned = owned.has(card.oracleId);
      // In owned-only mode every candidate is owned, so the boost would only inflate the scores.
      const boosted = isOwned && mode !== 'owned-only';
      const ranked = rankedFor(card, adjust.stapleDiscount ?? 0);
      return { card, ranked, owned: isOwned, boosted, score: scoreCard(ranked, boosted) };
    })
    .filter(({ card, owned: isOwned }) => {
      if (isOwned) return true;
      if (mode === 'owned-only') return false;
      // Budget: a card to buy needs a known price at or below the ceiling.
      if (mode === 'budget') return card.usd !== undefined && card.usd <= budgetMaxPrice;
      return true;
    })
    .sort((a, b) => b.score - a.score || byScore(a.card, b.card));
}

/** Fill the slots from candidates sorted best first. Cards in `include` go in before anything else. */
function fillSlots(candidates: Candidate[], identity: readonly string[], include?: ReadonlySet<string>): Filled {
  const slots: Record<SlotName, DeckCard[]> = {
    ramp: [], draw: [], interaction: [], winConditions: [], synergy: [], lands: [], flex: [],
  };
  const used = new Set<string>();
  let nonlands = 0;
  const place = (candidate: Candidate, slot: SlotName, score = candidate.score) => {
    slots[slot].push(toDeckCard(candidate, slot, score));
    used.add(candidate.card.oracleId);
    if (slot !== 'lands') nonlands++;
  };
  const unplacedNonlands = () => candidates.filter(({ card }) => card.slot !== 'lands' && !used.has(card.oracleId));

  // Cards the build was told to play take their own slot while it has room, and a synergy slot after that.
  if (include?.size) {
    for (const candidate of candidates) {
      if (!include.has(candidate.card.oracleId)) continue;
      const own = candidate.card.slot;
      place(candidate, slots[own].length < SLOT_TARGETS[own] ? own : 'synergy');
    }
  }

  // Staples first: each of these slots takes the best cards that do its job.
  for (const slot of STAPLE_SLOTS) {
    for (const candidate of candidates) {
      if (slots[slot].length >= SLOT_TARGETS[slot]) break;
      if (candidate.card.slot === slot && !used.has(candidate.card.oracleId)) place(candidate, slot);
    }
  }

  // Synergy is open to every nonland card still unplaced, scored for how well
  // it fits the commander rather than for the job that lost it its own slot.
  const forSynergy = unplacedNonlands()
    .map(candidate => ({ candidate, score: scoreCard(candidate.ranked, candidate.boosted, 'synergy') }))
    .sort((a, b) => b.score - a.score || byScore(a.candidate.card, b.candidate.card));
  const synergyRoom = Math.max(0, SLOT_TARGETS.synergy - slots.synergy.length);
  for (const { candidate, score } of forSynergy.slice(0, synergyRoom)) place(candidate, 'synergy', score);

  // Lands: nonbasics up to what the colours can carry, basics for the rest.
  // Basics are exempt from the singleton rule, and everyone has them.
  const nonbasicLands = Math.min(SLOT_TARGETS.lands, nonbasicLandLimit(identity.length));
  for (const candidate of candidates) {
    if (slots.lands.length >= nonbasicLands) break;
    if (candidate.card.slot === 'lands' && !used.has(candidate.card.oracleId)) place(candidate, 'lands');
  }
  const basics = identity.length > 0 ? identity : ['C'];
  for (let i = 0; slots.lands.length < SLOT_TARGETS.lands; i++) {
    slots.lands.push({
      name: basicLandForColor(basics[i % basics.length]!),
      quantity: 1,
      ownedInCollection: true,
      popularity: 0,
      synergy: 0,
      score: 0,
      slot: 'lands',
      cmc: 0,
      type_line: 'Basic Land',
      usdPrice: 0,
      reasons: ['Basic land'],
    });
  }

  // Flex takes the most widely played cards that fit nowhere else, and grows
  // to cover any slot the candidates could not fill.
  const nonlandTarget = TOTAL_DECK_SIZE - 1 - SLOT_TARGETS.lands;
  const played = (candidate: Candidate) => candidate.ranked.popularity + (candidate.boosted ? OWNED_BOOST : 0);
  const leftovers = unplacedNonlands().sort((a, b) => played(b) - played(a) || byScore(a.card, b.card));
  for (const candidate of leftovers) {
    if (nonlands >= nonlandTarget) break;
    place(candidate, 'flex');
  }

  return { slots, used };
}

/**
 * Build the deck. `adjust` is how a build aimed at a bracket steers this one
 * (see `buildDeckForBracket`); a plain build passes none.
 */
export function buildDeck(input: BuildDeckInput, adjust: BuildAdjustments = {}): BuildDeckResult {
  const { profile, recommendations, owned } = input;
  const { commander, identity } = profile;
  const mode = input.options?.mode ?? 'prefer-owned';
  const budgetMaxPrice = input.options?.budgetMaxPrice ?? 5;

  const candidates = eligible(recommendations, commander.oracleId, identity, owned, mode, budgetMaxPrice, adjust);
  const { slots, used } = fillSlots(candidates, identity, adjust.include);

  const commanderTraits = powerTraits(commander);
  const commanderDeckCard: DeckCard = {
    name: cardName(commander),
    quantity: 1,
    ownedInCollection: true,
    popularity: 0,
    synergy: 0,
    score: 1,
    slot: 'synergy',
    cmc: commander.cmc,
    type_line: commander.typeLine,
    usdPrice: commander.usd ?? null,
    reasons: ['The commander'],
    ...(commander.gameChanger ? { gameChanger: true } : {}),
    ...(commanderTraits.length > 0 ? { traits: commanderTraits } : {}),
  };

  const totalCards = 1 + Object.values(slots).reduce((sum, s) => sum + s.length, 0);

  // The yardstick for `topPicksCoveragePercent`: the same build with every card available.
  const constrained = mode !== 'prefer-owned' || candidates.some(candidate => candidate.owned);
  const topPicks = constrained
    ? fillSlots(eligible(recommendations, commander.oracleId, identity, new Set(), 'prefer-owned', budgetMaxPrice), identity).used
    : used;

  const deck: DeckList = { commander: commanderDeckCard, slots, totalCards };
  const analysis: DeckAnalysis = {
    ...analyzeCurve(deck),
    commanderName: commanderDeckCard.name,
    colorDistribution: countColors(identity, recommendations, used, slots.lands),
    topPicksCoveragePercent: coverage(topPicks, used),
    averagePopularityPercent: averagePopularity(slots),
    themes: profile.themes.map(({ slug, name, because }) => ({ slug, name, because })),
  };
  const gaps = buildGapReport(deck);
  const powerLevel = assessPowerLevel(deck, analysis, input.options?.targetBracket);

  return { deck, analysis, gaps, powerLevel };
}

export function analyzeCurve(deck: DeckList): Pick<DeckAnalysis, 'manaCurve' | 'averageCmc'> {
  const manaCurve: Record<number, number> = {};
  let totalCmc = 0;
  let spells = 0;

  for (const card of [deck.commander, ...Object.values(deck.slots).flat()]) {
    if (card.slot === 'lands') continue;
    manaCurve[card.cmc] = (manaCurve[card.cmc] ?? 0) + 1;
    totalCmc += card.cmc;
    spells++;
  }

  return { manaCurve, averageCmc: spells > 0 ? Math.round((totalCmc / spells) * 100) / 100 : 0 };
}

/** Cards per colour, by colour identity: the commander, every card placed and the basics. */
function countColors(
  identity: readonly string[],
  recommendations: Recommendation[],
  used: ReadonlySet<string>,
  lands: DeckCard[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  const add = (color: string) => {
    counts[color] = (counts[color] ?? 0) + 1;
  };
  identity.forEach(add);
  for (const card of recommendations) {
    if (used.has(card.oracleId)) card.colorIdentity.forEach(add);
  }
  for (const land of lands) {
    const color = COLORS.find(c => basicLandForColor(c) === land.name);
    if (color && land.type_line === 'Basic Land') add(color);
  }
  return counts;
}

/** How widely played the deck's spells are across Commander, on average, 0..100. */
export function averagePopularity(slots: Record<SlotName, DeckCard[]>): number {
  const spells = Object.values(slots).flat().filter(card => card.slot !== 'lands');
  if (spells.length === 0) return 0;
  return Math.round((spells.reduce((sum, card) => sum + card.popularity, 0) / spells.length) * 100);
}

/**
 * Of the nonbasic cards we would pick with every card available, the share
 * that is in this deck, 0..100.
 */
function coverage(topPicks: ReadonlySet<string>, used: ReadonlySet<string>): number {
  if (topPicks.size === 0) return 0;
  let inDeck = 0;
  for (const id of topPicks) if (used.has(id)) inDeck++;
  return Math.round((inDeck / topPicks.size) * 100);
}

function buildGapReport(deck: DeckList): GapReport {
  // The acquisition list: cards in the deck that the collection lacks, the ones the deck leans on most first.
  const missing: MissingCard[] = Object.values(deck.slots)
    .flat()
    .filter(card => !card.ownedInCollection)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 10)
    .map(card => ({
      name: card.name,
      popularity: card.popularity,
      synergy: card.synergy,
      reasons: card.reasons,
      usdPrice: card.usdPrice ?? null,
      wouldFillSlot: card.slot,
    }));

  return {
    missingCards: missing,
    budgetUpgrades: missing.filter(c => c.usdPrice !== null && c.usdPrice < 5),
    premiumUpgrades: missing.filter(c => c.usdPrice !== null && c.usdPrice >= 5),
  };
}

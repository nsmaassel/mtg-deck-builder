import { byScore, cardName } from '@mtg/commander-recs';
import type { Recommendation } from '@mtg/commander-recs';
import type {
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

interface Candidate {
  card: Recommendation;
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
  };
}

/** The cards a build may use, best first. An empty `owned` and mode `prefer-owned` give the unconstrained pool. */
function eligible(
  recommendations: Recommendation[],
  commanderId: string,
  identity: readonly string[],
  owned: ReadonlySet<string>,
  mode: BuildMode,
  budgetMaxPrice: number,
): Candidate[] {
  return recommendations
    .filter(card => card.oracleId !== commanderId && isColorLegal(card.colorIdentity, identity))
    .map(card => {
      const isOwned = owned.has(card.oracleId);
      // In owned-only mode every candidate is owned, so the boost would only inflate the scores.
      const boosted = isOwned && mode !== 'owned-only';
      return { card, owned: isOwned, boosted, score: scoreCard(card, boosted) };
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

/** Fill the slots from candidates sorted best first. */
function fillSlots(candidates: Candidate[], identity: readonly string[]): Filled {
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

  // Staples first: each of these slots takes the best cards that do its job.
  for (const slot of STAPLE_SLOTS) {
    for (const candidate of candidates) {
      if (slots[slot].length >= SLOT_TARGETS[slot]) break;
      if (candidate.card.slot === slot) place(candidate, slot);
    }
  }

  // Synergy is open to every nonland card still unplaced, scored for how well
  // it fits the commander rather than for the job that lost it its own slot.
  const forSynergy = unplacedNonlands()
    .map(candidate => ({ candidate, score: scoreCard(candidate.card, candidate.boosted, 'synergy') }))
    .sort((a, b) => b.score - a.score || byScore(a.candidate.card, b.candidate.card));
  for (const { candidate, score } of forSynergy.slice(0, SLOT_TARGETS.synergy)) place(candidate, 'synergy', score);

  // Lands: nonbasics up to what the colours can carry, basics for the rest.
  // Basics are exempt from the singleton rule, and everyone has them.
  const nonbasicLands = Math.min(SLOT_TARGETS.lands, nonbasicLandLimit(identity.length));
  for (const candidate of candidates) {
    if (slots.lands.length >= nonbasicLands) break;
    if (candidate.card.slot === 'lands') place(candidate, 'lands');
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
  const played = (candidate: Candidate) => candidate.card.popularity + (candidate.boosted ? OWNED_BOOST : 0);
  const leftovers = unplacedNonlands().sort((a, b) => played(b) - played(a) || byScore(a.card, b.card));
  for (const candidate of leftovers) {
    if (nonlands >= nonlandTarget) break;
    place(candidate, 'flex');
  }

  return { slots, used };
}

export function buildDeck(input: BuildDeckInput): BuildDeckResult {
  const { profile, recommendations, owned } = input;
  const { commander, identity } = profile;
  const mode = input.options?.mode ?? 'prefer-owned';
  const budgetMaxPrice = input.options?.budgetMaxPrice ?? 5;

  const candidates = eligible(recommendations, commander.oracleId, identity, owned, mode, budgetMaxPrice);
  const { slots, used } = fillSlots(candidates, identity);

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
    themes: profile.themes.map(({ slug, name, because }) => ({ slug, name, because })),
  };
  const gaps = buildGapReport(deck);
  const powerLevel = assessPowerLevel(deck, analysis, input.options?.targetBracket);

  return { deck, analysis, gaps, powerLevel };
}

function analyzeCurve(deck: DeckList): Pick<DeckAnalysis, 'manaCurve' | 'averageCmc'> {
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

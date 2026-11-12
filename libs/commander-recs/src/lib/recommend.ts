import type { CardIndex, IndexedCard } from '@mtg/card-index';
import { landFit } from './lands';
import { cardName, frontType, matches } from './match';
import { assignSlot } from './slots';
import { RECOMMENDATION_SLOTS } from './types';
import type { CommanderProfile, ProfiledTheme, Recommendation, RecommendationSlot, ThemeWant } from './types';
import { titleFromSlug } from './words';

/**
 * How a recommendation's score is put together, per slot. Each row sums to 1:
 *
 *   score = popularity × w.popularity + synergy × w.synergy
 *         + cheapness × w.cheapness + colorFit × w.colorFit
 *
 * where cheapness = max(0, 1 − mana value / 10).
 *
 * Popularity is Commander-wide, not per commander, so it can only say "this is
 * a staple". It leads where staples belong (ramp, draw, interaction), which is
 * how Sol Ring and Swords to Plowshares keep their places, with enough synergy
 * weight that an on-theme mana creature beats a middling mana rock. Synergy
 * leads the synergy and win-condition slots, which is what makes two commanders
 * in the same colours get different decks. Lands are about colours first.
 */
export const SLOT_WEIGHTS: Readonly<
  Record<RecommendationSlot, { popularity: number; synergy: number; cheapness: number; colorFit: number }>
> = {
  ramp: { popularity: 0.65, synergy: 0.2, cheapness: 0.15, colorFit: 0 },
  draw: { popularity: 0.65, synergy: 0.2, cheapness: 0.15, colorFit: 0 },
  interaction: { popularity: 0.65, synergy: 0.2, cheapness: 0.15, colorFit: 0 },
  winConditions: { popularity: 0.3, synergy: 0.6, cheapness: 0.1, colorFit: 0 },
  synergy: { popularity: 0.35, synergy: 0.55, cheapness: 0.1, colorFit: 0 },
  lands: { popularity: 0.45, synergy: 0.15, cheapness: 0, colorFit: 0.4 },
};

/** How many cards `recommend` returns per slot: about four decks' worth of each. */
export const SLOT_LIMITS: Readonly<Record<RecommendationSlot, number>> = {
  ramp: 40,
  draw: 40,
  interaction: 40,
  winConditions: 20,
  synergy: 100,
  lands: 60,
};

/**
 * The format's most played cards are always among the candidates, whatever
 * their score: a builder's flex slots go to cards like Lightning Greaves that
 * fit every deck and no theme.
 */
const STAPLES = 60;

/** Scryfall ranks a little over 30,000 cards; anything this far down counts as unplayed. */
const RANK_FLOOR = 30_000;

/** A tag on more cards than this says too little to count as "does what the commander does". */
const RARE_TAG_MAX_CARDS = 400;
/** The most synergy a card can get from sharing tags with the commander alone. */
const SHARED_TAG_CAP = 0.3;

/** Tagger tags for cards that reward one colour or its basic land type. */
const COLOR_PAYOFFS: ReadonlyArray<readonly [tag: string, color: string]> = [
  ['synergy-white', 'W'], ['synergy-plains', 'W'],
  ['synergy-blue', 'U'], ['synergy-island', 'U'],
  ['synergy-black', 'B'], ['synergy-swamp', 'B'],
  ['synergy-red', 'R'], ['synergy-mountain', 'R'],
  ['synergy-green', 'G'], ['synergy-forest', 'G'],
];

/**
 * True for a card whose point is a colour the deck does not play. Ruby
 * Medallion is colourless, so it is legal in a mono-black deck, where it
 * makes nothing cheaper.
 */
function rewardsOnlyOtherColors(tags: ReadonlySet<string>, identity: readonly string[]): boolean {
  const rewarded = COLOR_PAYOFFS.filter(([tag]) => tags.has(tag));
  return rewarded.length > 0 && rewarded.every(([, color]) => !identity.includes(color));
}

/** Typal tags that name no particular creature type. */
const GENERIC_TYPAL = /^typal-(creature|choose|share|coupling|coupling-distinct|exclusion|each|non-.+)$/;
/** What is left of a theme's interest in a card that needs a creature type the deck is not built around. */
const OTHER_TYPE_FACTOR = 0.5;

/**
 * True when what the card does is tied to a creature type this deck is not
 * about: Skirk Prospector is a free sacrifice outlet, for Goblins. A card that
 * makes its own tokens of the type (Siege-Gang Commander) carries what it
 * needs and is not held back.
 */
function needsAnotherType(card: IndexedCard, profile: CommanderProfile): boolean {
  const typeTags = card.tags.filter(tag => tag.startsWith('typal-') && !GENERIC_TYPAL.test(tag));
  if (typeTags.length === 0) return false;
  const wanted = new Set(
    profile.themes.filter(theme => theme.creatureTypes).flatMap(theme => theme.wants.flatMap(want => want.tags ?? [])),
  );
  return typeTags.every(tag => {
    if (wanted.has(tag)) return false;
    const type = titleFromSlug(tag.slice('typal-'.length));
    return !new RegExp(`\\bcreates? [^.]*\\b${type}\\b[^.]*\\btokens?\\b`, 'i').test(card.oracleText);
  });
}

/** Card types that are legal in the format but never part of the 99. */
const NOT_IN_THE_DECK = /\b(Attraction|Stickers|Conspiracy|Dungeon)\b/;

/** 0..1 on a log scale: rank 1 → 1, rank 100 → about 0.55, rank 10,000 → about 0.1, unranked → 0. */
export function popularityFromRank(rank: number | undefined): number {
  if (!rank || rank < 1) return 0;
  return Math.max(0, 1 - Math.log(rank) / Math.log(RANK_FLOOR));
}

export function recommendationScore(parts: {
  slot: RecommendationSlot;
  popularity: number;
  synergy: number;
  cmc: number;
  colorFit?: number;
}): number {
  const w = SLOT_WEIGHTS[parts.slot];
  const cheapness = Math.max(0, 1 - parts.cmc / 10);
  const score =
    parts.popularity * w.popularity + parts.synergy * w.synergy + cheapness * w.cheapness + (parts.colorFit ?? 0) * w.colorFit;
  return Math.min(1, Math.max(0, score));
}

interface SharedTags {
  weights: ReadonlyMap<string, number>;
  total: number;
}

const sharedTagCache = new WeakMap<CommanderProfile, SharedTags>();

/** The commander's rarer tags, by how much each says. */
function commanderRareTags(index: CardIndex, profile: CommanderProfile): SharedTags {
  let shared = sharedTagCache.get(profile);
  if (!shared) {
    const weights = new Map<string, number>();
    let total = 0;
    for (const tag of profile.commander.tags) {
      if (index.tagCount(tag) > RARE_TAG_MAX_CARDS) continue;
      const weight = index.tagWeight(tag);
      weights.set(tag, weight);
      total += weight;
    }
    shared = { weights, total };
    sharedTagCache.set(profile, shared);
  }
  return shared;
}

interface ThemeHit {
  theme: ProfiledTheme;
  want: ThemeWant;
  value: number;
}

function themeReason(hit: ThemeHit): string {
  const { reason } = hit.want;
  const { because } = hit.theme;
  // "Cares about tokens for a commander that cares about tokens" says the same thing twice.
  if (reason.toLowerCase().endsWith(because.toLowerCase())) return `${reason}, like the commander`;
  return `${reason} for a commander that ${because}`;
}

/**
 * Score any one card for this commander; null when it cannot go in the 99:
 * outside the colour identity, not legal in the format, the commander itself,
 * or not a deck card at all. Two more kinds are null because recommending
 * them would be wrong rather than illegal: basic lands, which a deck takes as
 * many of as its mana needs (the builder's call), and cards whose point is a
 * colour the deck does not play.
 */
export function scoreFor(index: CardIndex, profile: CommanderProfile, card: IndexedCard): Recommendation | null {
  if (card.oracleId === profile.commander.oracleId) return null;
  if (card.isBasicLand) return null;
  if (!card.legal.includes(profile.format)) return null;
  if (!card.colorIdentity.every(color => profile.identity.includes(color))) return null;
  if (NOT_IN_THE_DECK.test(frontType(card))) return null;

  const tags = new Set(card.tags);
  if (rewardsOnlyOtherColors(tags, profile.identity)) return null;

  // Within a theme only the strongest want counts; across themes the values
  // combine as independent chances, so serving two themes beats serving one
  // and the total stays within 0..1.
  const hits: ThemeHit[] = [];
  const otherType = needsAnotherType(card, profile);
  let miss = 1;
  for (const theme of profile.themes) {
    let best: ThemeWant | undefined;
    for (const want of theme.wants) {
      if ((!best || want.weight > best.weight) && matches(want, card, tags)) best = want;
    }
    if (!best) continue;
    const value = theme.weight * best.weight * (otherType && !theme.creatureTypes ? OTHER_TYPE_FACTOR : 1);
    hits.push({ theme, want: best, value });
    miss *= 1 - value;
  }

  // A small fallback so a commander no theme catches still gets something.
  // Sharing tags means "does a similar job", which is weaker than working
  // together, hence the low cap.
  const rare = commanderRareTags(index, profile);
  let sharedWeight = 0;
  let heaviestShared: string | undefined;
  for (const tag of card.tags) {
    const weight = rare.weights.get(tag);
    if (weight === undefined) continue;
    sharedWeight += weight;
    if (!heaviestShared || weight > rare.weights.get(heaviestShared)!) heaviestShared = tag;
  }
  if (rare.total > 0) miss *= 1 - SHARED_TAG_CAP * (sharedWeight / rare.total);

  const synergy = 1 - miss;
  const popularity = popularityFromRank(card.edhrecRank);
  const assigned = assignSlot(card, tags);
  // Mana that only pays for one creature type is nearly unrestricted in a deck built around a type.
  const typalLand = tags.has('typal') && profile.themes.some(theme => theme.creatureTypes);
  const land = assigned.slot === 'lands' ? landFit(card, tags, profile.identity, typalLand) : undefined;
  const slotReason = land?.reason ?? assigned.reason;

  hits.sort((a, b) => b.value - a.value);
  // The slot's reason goes second unless a theme already says the same thing.
  const said = hits.some(hit => hit.want.reason === slotReason);
  const reasons = hits.slice(0, slotReason && !said ? 1 : 2).map(themeReason);
  if (slotReason && !said) reasons.push(slotReason);
  if (reasons.length === 0 && heaviestShared) {
    reasons.push(`Shares Scryfall's "${heaviestShared}" tag with the commander`);
  }
  if (reasons.length === 0) {
    reasons.push(
      card.edhrecRank
        ? `Scryfall's EDHREC rank #${card.edhrecRank} across Commander`
        : "Fits the commander's colour identity",
    );
  }

  const recommendation: Recommendation = {
    oracleId: card.oracleId,
    name: cardName(card),
    slot: assigned.slot,
    popularity,
    synergy,
    score: recommendationScore({ slot: assigned.slot, popularity, synergy, cmc: card.cmc, colorFit: land?.fit }),
    themes: hits.map(hit => hit.theme.slug),
    reasons,
    cmc: card.cmc,
    typeLine: card.typeLine,
    colorIdentity: [...card.colorIdentity],
  };
  if (card.usd !== undefined) recommendation.usd = card.usd;
  if (land) recommendation.colorFit = land.fit;
  return recommendation;
}

/** Best first; ties go to the more widely played card, then by name so the order never depends on the index. */
export function byScore(a: Recommendation, b: Recommendation): number {
  return b.score - a.score || b.popularity - a.popularity || a.name.localeCompare(b.name);
}

export interface RecommendOptions {
  /** Cards per slot. Defaults to `SLOT_LIMITS`. */
  limit?: number;
  /** Leave out cards with no known price or one above this, for budget builds. */
  maxUsd?: number;
}

/**
 * The best cards for this commander, enough of every slot to fill a deck
 * several times over, plus the format's most played nonland cards that fit.
 * Grouped by slot in `RECOMMENDATION_SLOTS` order, best first within each.
 */
export function recommend(index: CardIndex, profile: CommanderProfile, options: RecommendOptions = {}): Recommendation[] {
  const bySlot = new Map<RecommendationSlot, Recommendation[]>(RECOMMENDATION_SLOTS.map(slot => [slot, []]));
  for (const card of index.all()) {
    if (options.maxUsd !== undefined && (card.usd === undefined || card.usd > options.maxUsd)) continue;
    const recommendation = scoreFor(index, profile, card);
    if (recommendation) bySlot.get(recommendation.slot)!.push(recommendation);
  }
  for (const list of bySlot.values()) list.sort(byScore);

  const staples = new Set(
    [...bySlot.values()]
      .flat()
      .filter(recommendation => recommendation.slot !== 'lands')
      .sort((a, b) => b.popularity - a.popularity || byScore(a, b))
      .slice(0, STAPLES),
  );
  return RECOMMENDATION_SLOTS.flatMap(slot => {
    const limit = options.limit ?? SLOT_LIMITS[slot];
    return bySlot.get(slot)!.filter((recommendation, i) => i < limit || staples.has(recommendation));
  });
}

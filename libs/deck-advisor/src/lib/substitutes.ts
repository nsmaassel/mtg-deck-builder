import { RARITIES } from '@mtg/card-index';
import type { CardIndex, Format, IndexedCard } from '@mtg/card-index';
import { FORMAT_RULES } from './formats';
import { frontColors, isCastable, isLand, usableCopies } from './gap';
import { PRIMARY_ROLE_PATTERN, tagOverlap } from './similarity';
import type { TextModel } from './similarity';
import type {
  ArchetypeUsage,
  Collection,
  MatchQuality,
  ScoreBreakdown,
  Substitute,
  SubstituteSource,
} from './types';

export interface SubstituteContext {
  index: CardIndex;
  format: Format;
  collection: Collection;
  /** Colours the deck may play. */
  colors: readonly string[];
  /** oracleId → copies already in the deck being completed. */
  inDeck: ReadonlyMap<string, number>;
  /** How the deck's archetype uses cards, when the deck came from the meta. */
  usage?: ArchetypeUsage;
  text: TextModel;
}

export interface SubstituteOptions {
  /** Default 5. */
  limit?: number;
  /** Default both: spare owned copies and cheaper crafts. */
  sources?: SubstituteSource[];
  /** Candidates scoring below this are dropped. Default 0.3. */
  minScore?: number;
}

/** A spell must clear this to be called a close stand-in; below PARTIAL it is a stopgap. */
const CLOSE = 0.65;
const PARTIAL = 0.45;

/** Rules text is only compared for this many of the best candidates by every other signal. */
const TEXT_SHORTLIST = 60;

const SPELL_WEIGHTS: ScoreBreakdown = { role: 0.45, text: 0.15, type: 0.12, cost: 0.12, color: 0.04, meta: 0.12 };
// For a land, `color` is how much of the original's mana it makes and `cost` is whether it enters untapped.
const LAND_WEIGHTS: ScoreBreakdown = { role: 0.3, text: 0.05, type: 0, cost: 0.15, color: 0.4, meta: 0.1 };

/** Tagger's names for lands whose point is to make more than one colour. */
const FIXING_LAND_TAGS = ['dual-land', 'triland', 'triome', 'rainbow-land', 'fetchland'];

const CARD_TYPES = ['Creature', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Planeswalker', 'Battle', 'Land'];
const BASIC_FOR_COLOR: Record<string, string> = { W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest' };
const COLOR_NAMES: Record<string, string> = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' };

function cardTypes(card: IndexedCard): string[] {
  const front = card.typeLine.split('//')[0] ?? '';
  return CARD_TYPES.filter(type => front.includes(type));
}

function typeScore(target: IndexedCard, candidate: IndexedCard): number {
  const a = cardTypes(target);
  const b = cardTypes(candidate);
  if (a.length === b.length && a.every(t => b.includes(t))) return 1;
  if (a.includes('Creature') && b.includes('Creature')) return 0.9;
  if (a.some(t => b.includes(t))) return 0.7;
  const spell = (types: string[]) => types.includes('Instant') || types.includes('Sorcery');
  if (spell(a) && spell(b)) return 0.7;
  if (!spell(a) && !spell(b)) return 0.5;
  return 0.3;
}

function costScore(target: IndexedCard, candidate: IndexedCard): number {
  const diff = candidate.cmc - target.cmc;
  // A dearer stand-in hurts the curve more than a cheaper one hurts the effect.
  return Math.max(0, diff > 0 ? 1 - diff * 0.35 : 1 + diff * 0.25);
}

function colorScore(target: IndexedCard, candidate: IndexedCard): number {
  const wanted = frontColors(target);
  const asks = frontColors(candidate);
  if (asks.length === 0) return 0.85;
  if (asks.every(c => wanted.includes(c))) return 1;
  return asks.some(c => wanted.includes(c)) ? 0.7 : 0.5;
}

/** A rough "is this card generally good" prior from Scryfall's EDHREC rank, 0–1. */
function popularity(card: IndexedCard): number {
  if (!card.edhrecRank) return 0;
  return Math.max(0, 1 - Math.log10(card.edhrecRank) / 4.5);
}

function metaScore(candidate: IndexedCard, usage: ArchetypeUsage | undefined): { score: number; share: number } {
  if (!usage) return { score: popularity(candidate), share: 0 };
  const share = usage.mainShare(candidate.name) + 0.5 * usage.sideShare(candidate.name);
  if (share <= 0) return { score: 0.4 * popularity(candidate), share: 0 };
  // Half the archetype's lists playing a card is as strong as this evidence gets.
  return { score: Math.min(1, share / 0.5), share: usage.mainShare(candidate.name) };
}

/** 1 = always enters tapped, 0.5 = sometimes, 0 = untapped. */
function entersTapped(card: IndexedCard): number {
  if (card.tags.includes('tapland')) return 1;
  return card.tags.includes('conditional-tapland') ? 0.5 : 0;
}

/**
 * How freely a land's coloured mana can be spent, 0–1. Scryfall lists every
 * colour a land can ever make, including mana that only pays for one creature
 * type or that costs another mana to filter.
 */
function fixingQuality(card: IndexedCard): number {
  if (card.isBasicLand) return 1;
  if (card.tags.includes('restricted-mana')) return 0.4;
  if (card.tags.includes('mana-filter') || card.tags.includes('filterland')) return 0.5;
  return FIXING_LAND_TAGS.some(tag => card.tags.includes(tag)) ? 1 : 0.5;
}

/** One tag per family (`removal-bounce` and `removal-nonland` are one point, not two), heaviest first. */
function distinctRoles(tags: string[], limit: number): string[] {
  const families = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    const family = tag.split('-')[0]!;
    if (families.has(family)) continue;
    families.add(family);
    out.push(tagLabel(tag));
    if (out.length === limit) break;
  }
  return out;
}

function tagLabel(slug: string): string {
  return slug.replace(/-/g, ' ');
}

function manaLabel(colors: string[]): string {
  return colors.map(c => COLOR_NAMES[c] ?? 'colourless').join(' and ');
}

function quality(score: number): MatchQuality {
  if (score >= CLOSE) return 'close';
  return score >= PARTIAL ? 'partial' : 'weak';
}

interface Candidate {
  card: IndexedCard;
  source: SubstituteSource;
  available: number;
}

function withinColors(colors: readonly string[], allowed: readonly string[]): boolean {
  return colors.every(c => allowed.includes(c));
}

function isEligible(target: IndexedCard, card: IndexedCard, ctx: SubstituteContext): boolean {
  if (card.oracleId === target.oracleId) return false;
  const rules = FORMAT_RULES[ctx.format];
  if (!card.legal.includes(ctx.format)) return false;
  if (rules.onArena && !card.onArena) return false;

  const land = isLand(target);
  if (isLand(card) !== land) return false;
  if (card.isBasicLand && !land) return false;

  // Lands and commander decks answer to colour identity; a 60-card deck only has to cast the card.
  if (land || rules.hasCommander) return withinColors(card.colorIdentity, ctx.colors);
  return isCastable(card, ctx.colors);
}

function* candidates(target: IndexedCard, ctx: SubstituteContext, sources: SubstituteSource[]): Generator<Candidate> {
  const rules = FORMAT_RULES[ctx.format];
  const room = (card: IndexedCard): number =>
    card.isBasicLand ? Infinity : rules.maxCopies - (ctx.inDeck.get(card.oracleId) ?? 0);
  const spare = (card: IndexedCard): number =>
    usableCopies(card, ctx.collection) - (ctx.inDeck.get(card.oracleId) ?? 0);

  if (sources.includes('owned')) {
    const seen = new Set<string>();
    const offer = function* (card: IndexedCard | undefined): Generator<Candidate> {
      if (!card || seen.has(card.oracleId) || !isEligible(target, card, ctx)) return;
      seen.add(card.oracleId);
      const available = Math.min(spare(card), room(card));
      if (available >= 1) yield { card, source: 'owned', available };
    };
    for (const oracleId of ctx.collection.owned.keys()) yield* offer(ctx.index.get(oracleId));
    // Basic lands are free on Arena whether or not the import listed them.
    if (isLand(target)) {
      for (const color of ctx.colors) yield* offer(ctx.index.byName(BASIC_FOR_COLOR[color] ?? ''));
    }
  }

  if (sources.includes('craft') && rules.onArena && target.arenaRarity) {
    const targetRank = RARITIES.indexOf(target.arenaRarity);
    for (const card of ctx.index.all()) {
      if (!card.arenaRarity || RARITIES.indexOf(card.arenaRarity) >= targetRank) continue;
      if (spare(card) >= 1 || !isEligible(target, card, ctx)) continue;
      const available = room(card);
      if (available >= 1) yield { card, source: 'craft', available };
    }
  }
}

interface Scored extends Candidate {
  breakdown: ScoreBreakdown;
  weights: ScoreBreakdown;
  shared: string[];
  /** Primary roles of the target this candidate does not have. */
  uncovered: string[];
  metaShare: number;
  partial: number;
}

function weigh(breakdown: ScoreBreakdown, weights: ScoreBreakdown, skip: Array<keyof ScoreBreakdown> = []): number {
  let total = 0;
  let weightSum = 0;
  for (const key of Object.keys(weights) as Array<keyof ScoreBreakdown>) {
    if (skip.includes(key)) continue;
    total += breakdown[key] * weights[key];
    weightSum += weights[key];
  }
  return weightSum > 0 ? total / weightSum : 0;
}

function scoreCandidate(target: IndexedCard, candidate: Candidate, ctx: SubstituteContext): Scored {
  const { card } = candidate;
  const overlap = tagOverlap(target, card, ctx.index);
  const meta = metaScore(card, ctx.usage);
  const land = isLand(target);

  let breakdown: ScoreBreakdown;
  let weights: ScoreBreakdown;
  if (land) {
    const wanted = target.producedMana.filter(c => ctx.colors.includes(c));
    const made = wanted.filter(c => card.producedMana.includes(c));
    breakdown = {
      role: overlap.score,
      text: 0,
      type: 1,
      cost: 1 - Math.max(0, entersTapped(card) - entersTapped(target)),
      // A utility land asks for no colour, so any land of the deck's colours covers it.
      color: wanted.length ? (made.length / wanted.length) * fixingQuality(card) : 1,
      // Commander popularity says little about a land in another deck; only archetype evidence counts.
      meta: ctx.usage ? meta.score : 0,
    };
    weights = ctx.usage ? LAND_WEIGHTS : { ...LAND_WEIGHTS, meta: 0 };
  } else {
    breakdown = {
      role: overlap.score,
      text: 0,
      type: typeScore(target, card),
      cost: costScore(target, card),
      color: colorScore(target, card),
      meta: meta.score,
    };
    // Untagged cards (the newest set, usually) are judged on rules text instead.
    const untagged = target.tags.length === 0 || card.tags.length === 0;
    weights = untagged ? { ...SPELL_WEIGHTS, role: 0, text: SPELL_WEIGHTS.role + SPELL_WEIGHTS.text } : SPELL_WEIGHTS;
  }

  return {
    ...candidate,
    breakdown,
    weights,
    shared: overlap.shared,
    uncovered: overlap.missing.filter(tag => PRIMARY_ROLE_PATTERN.test(tag)),
    metaShare: meta.share,
    partial: weigh(breakdown, weights, ['text']),
  };
}

function describe(target: IndexedCard, scored: Scored, ctx: SubstituteContext): string[] {
  const { card, breakdown, shared } = scored;
  const reasons: string[] = [];

  if (isLand(target)) {
    const wanted = target.producedMana.filter(c => ctx.colors.includes(c));
    const made = wanted.filter(c => card.producedMana.includes(c));
    if (wanted.length === 0) reasons.push('A land in your colours for a utility land');
    else if (made.length === wanted.length) reasons.push(`Makes ${manaLabel(made)} mana, like the original`);
    else if (made.length) reasons.push(`Makes ${manaLabel(made)} mana only (the original also makes ${manaLabel(wanted.filter(c => !made.includes(c)))})`);
    if (fixingQuality(card) < 1) reasons.push('Its coloured mana comes with a restriction or a cost');
    if (breakdown.cost < 1) reasons.push(entersTapped(card) === 1 ? 'Enters tapped' : 'Sometimes enters tapped');
  } else {
    if (shared.length) reasons.push(`Same job: ${distinctRoles(shared, 3).join(', ')}`);
    else if (breakdown.text >= 0.3) reasons.push('Similar rules text');
    if (scored.uncovered.length) reasons.push(`Does not cover: ${distinctRoles(scored.uncovered, 2).join(', ')}`);

    const diff = card.cmc - target.cmc;
    if (diff === 0) reasons.push(`Same mana value (${target.cmc})`);
    else reasons.push(`${Math.abs(diff)} mana ${diff > 0 ? 'more' : 'less'} (${card.cmc} instead of ${target.cmc})`);

    if (breakdown.type < 0.9) {
      const types = cardTypes(card).join(' ').toLowerCase() || 'different card type';
      reasons.push(`${types.charAt(0).toUpperCase()}${types.slice(1)} instead of ${cardTypes(target).join(' ').toLowerCase()}`);
    }
  }

  if (ctx.usage && scored.metaShare >= 0.05) {
    reasons.push(`In ${Math.round(scored.metaShare * 100)}% of ${ctx.usage.archetype} main decks`);
  }
  if (scored.source === 'craft') {
    reasons.push(`Costs ${article(card.arenaRarity!)} wildcard instead of ${article(target.arenaRarity!)}`);
  }
  return reasons;
}

function article(rarity: string): string {
  return `${rarity === 'uncommon' ? 'an' : 'a'} ${rarity}`;
}

/**
 * Rank stand-ins for a card the player lacks: spare cards they own, and cards
 * that cost a cheaper wildcard. Every candidate is legal in the format and
 * castable in the deck's colours.
 */
export function suggestSubstitutes(
  target: IndexedCard,
  ctx: SubstituteContext,
  options: SubstituteOptions = {},
): Substitute[] {
  const limit = options.limit ?? 5;
  const minScore = options.minScore ?? 0.3;
  const sources = options.sources ?? ['owned', 'craft'];

  const shortlist = [...candidates(target, ctx, sources)]
    .map(candidate => scoreCandidate(target, candidate, ctx))
    .sort((a, b) => b.partial - a.partial || a.card.name.localeCompare(b.card.name))
    .slice(0, TEXT_SHORTLIST);

  return shortlist
    .map(scored => {
      scored.breakdown.text = ctx.text.similarity(target, scored.card);
      const score = weigh(scored.breakdown, scored.weights);
      // A card that does none of the jobs the original was picked for is a stopgap, however alike it looks.
      const offRole = scored.uncovered.length > 0 && !scored.shared.some(tag => PRIMARY_ROLE_PATTERN.test(tag));
      const substitute: Substitute = {
        card: scored.card,
        source: scored.source,
        score,
        quality: offRole ? 'weak' : quality(score),
        available: scored.available,
        breakdown: scored.breakdown,
        reasons: describe(target, scored, ctx),
      };
      if (scored.source === 'craft') substitute.craftRarity = scored.card.arenaRarity;
      return substitute;
    })
    .filter(s => s.score >= minScore)
    // An owned card beats a craft of equal merit: it is free.
    .sort((a, b) => b.score - a.score || (a.source === b.source ? 0 : a.source === 'owned' ? -1 : 1) || a.card.name.localeCompare(b.card.name))
    .slice(0, limit);
}

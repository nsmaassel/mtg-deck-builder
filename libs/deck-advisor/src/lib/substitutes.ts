import { RARITIES } from '@mtg/card-index';
import type { CardIndex, Format, IndexedCard } from '@mtg/card-index';
import { themeFit } from '@mtg/commander-recs';
import type { ProfiledTheme, ThemeFit } from '@mtg/commander-recs';
import { FORMAT_RULES } from './formats';
import { frontColors, isCastable, isLand, usableCopies } from './gap';
import { PRIMARY_ROLE_PATTERN, roleWeight, tagOverlap } from './similarity';
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
  /** What the deck is built around. A stand-in for a card that serves a theme is judged on serving it too. */
  themes?: readonly ProfiledTheme[];
  /** oracleId → the combo a card would finish with cards the player already has for this deck, in words. */
  finishesCombo?: ReadonlyMap<string, string>;
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
/** Doing one of the original's primary jobs earns "partial" from this score up. */
const PARTIAL_ON_ROLE = 0.35;

/**
 * Rules text and tag lists are only worked out for the best candidates by every
 * other signal, this many per source so crafts cannot crowd out owned cards.
 */
const SHORTLIST: Record<SubstituteSource, number> = { owned: 40, craft: 20 };

const SPELL_WEIGHTS: ScoreBreakdown = { role: 0.42, text: 0.13, type: 0.12, cost: 0.17, color: 0.04, meta: 0.12, fit: 0 };
/**
 * Added to the weights above when the missing card serves one of the deck's
 * themes: a sacrifice outlet's stand-in should be one too, however alike two
 * cards look otherwise. Where the original serves no theme, nothing changes.
 */
const THEME_FIT_WEIGHT = 0.18;
const UNTAGGED_SPELL_WEIGHTS: ScoreBreakdown = { ...SPELL_WEIGHTS, role: 0, text: SPELL_WEIGHTS.role + SPELL_WEIGHTS.text };
// For a land, `color` is how much of the original's mana it makes and `cost` is whether it enters untapped.
const LAND_WEIGHTS: ScoreBreakdown = { role: 0.3, text: 0.05, type: 0, cost: 0.15, color: 0.4, meta: 0.1, fit: 0 };

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
  const main = usage.mainShare(candidate.oracleId);
  const share = main + 0.5 * usage.sideShare(candidate.oracleId);
  if (share <= 0) return { score: 0.4 * popularity(candidate), share: 0 };
  // Half the archetype's lists playing a card is as strong as this evidence gets.
  return { score: Math.min(1, share / 0.5), share: main };
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

function quality(target: IndexedCard, scored: Scored, score: number, ctx: SubstituteContext): MatchQuality {
  const sharesPrimaryRole = scored.shared.some(tag => PRIMARY_ROLE_PATTERN.test(tag));
  // A card that does none of the jobs the original was picked for is a stopgap, however alike it looks.
  if (scored.uncovered.length > 0 && !sharesPrimaryRole) return 'weak';

  let grade: MatchQuality = 'weak';
  if (score >= CLOSE) grade = 'close';
  else if (score >= PARTIAL || (sharesPrimaryRole && score >= PARTIAL_ON_ROLE)) grade = 'partial';

  // Nothing is a close match for a utility land except a land that does what it does.
  if (grade === 'close' && isLand(target) && scored.breakdown.role < 0.5) {
    const makesColour = target.producedMana.some(c => ctx.colors.includes(c));
    if (!makesColour) grade = 'partial';
  }
  return grade;
}

const NO_THEME: ThemeFit = { fit: 0 };

interface Candidate {
  card: IndexedCard;
  source: SubstituteSource;
  available: number;
}

function withinColors(colors: readonly string[], allowed: readonly string[]): boolean {
  return colors.every(c => allowed.includes(c));
}

interface Scored extends Candidate {
  breakdown: ScoreBreakdown;
  weights: ScoreBreakdown;
  shared: string[];
  /** Primary roles of the target this candidate does not have. */
  uncovered: string[];
  metaShare: number;
  partial: number;
  /** The candidate's own place in the deck's themes. */
  themes: ThemeFit;
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

function lowerFirst(text: string): string {
  // "Blood Artist effect" keeps its capital; "Creature sacrifice outlet" does not need one.
  return /^[A-Z][a-z]+ [A-Z]/.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1);
}

function describe(target: IndexedCard, targetThemes: ThemeFit, scored: Scored, ctx: SubstituteContext): string[] {
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

  if (scored.themes.theme && scored.themes.want) {
    reasons.push(`Fits the deck's ${scored.themes.theme.name} theme: ${lowerFirst(scored.themes.want.reason)}`);
  } else if (targetThemes.theme) {
    reasons.push(`Does nothing for the deck's ${targetThemes.theme.name} theme, which the original serves`);
  }
  const combo = ctx.finishesCombo?.get(card.oracleId);
  if (combo) reasons.push(combo);

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

interface Pools {
  spells: Candidate[];
  lands: Candidate[];
}

/**
 * Finds stand-ins for the missing cards of one deck.
 *
 * Which cards may enter the deck at all (legal, castable, with a copy to
 * spare) depends on the deck, not on the card being replaced, so that is
 * worked out once here and reused for every missing card. A large collection
 * is tens of thousands of candidates per card otherwise.
 */
export class SubstituteFinder {
  private owned?: Pools;
  private craftable?: Pools;
  private readonly tagWeights = new Map<string, number>();
  private readonly cardWeights = new Map<string, number>();
  private readonly themeFits = new Map<string, ThemeFit>();

  constructor(private readonly ctx: SubstituteContext) {}

  /**
   * Rank stand-ins for a card the player lacks: spare cards they own, and
   * cards that cost a cheaper wildcard. Every candidate is legal in the
   * format and castable in the deck's colours.
   */
  suggest(target: IndexedCard, options: SubstituteOptions = {}): Substitute[] {
    const { ctx } = this;
    const limit = options.limit ?? 5;
    const minScore = options.minScore ?? 0.3;
    const sources = options.sources ?? ['owned', 'craft'];

    const targetTags = new Map(target.tags.map(tag => [tag, this.tagWeight(tag)]));
    const targetThemes = isLand(target) ? NO_THEME : this.themeFit(target);
    const finishes = (s: Substitute) => Number(ctx.finishesCombo?.has(s.card.oracleId) ?? false);
    const shortlist = sources.flatMap(source =>
      this.candidates(target, source)
        .map(candidate => this.scoreFast(target, targetTags, targetThemes, candidate))
        .sort((a, b) => b.partial - a.partial || a.card.name.localeCompare(b.card.name))
        .slice(0, SHORTLIST[source]),
    );

    return shortlist
      .map(scored => {
        // The shortlist is small enough for the costly signals: rules text, and which tags overlap.
        const overlap = tagOverlap(target, scored.card, ctx.index);
        scored.shared = overlap.shared;
        scored.uncovered = overlap.missing.filter(tag => PRIMARY_ROLE_PATTERN.test(tag));
        scored.breakdown.text = ctx.text.similarity(target, scored.card);
        const score = weigh(scored.breakdown, scored.weights);
        const substitute: Substitute = {
          card: scored.card,
          source: scored.source,
          score,
          quality: quality(target, scored, score, ctx),
          available: scored.available,
          breakdown: scored.breakdown,
          reasons: describe(target, targetThemes, scored, ctx),
        };
        if (scored.source === 'craft') substitute.craftRarity = scored.card.arenaRarity;
        return substitute;
      })
      .filter(s => s.score >= minScore)
      // An owned card beats a craft of equal merit: it is free.
      .sort((a, b) => b.score - a.score || (a.source === b.source ? 0 : a.source === 'owned' ? -1 : 1) || finishes(b) - finishes(a) || a.card.name.localeCompare(b.card.name))
      .slice(0, limit);
  }

  private candidates(target: IndexedCard, source: SubstituteSource): Candidate[] {
    const land = isLand(target);
    if (source === 'owned') {
      const pool = land ? this.ownedPools().lands : this.ownedPools().spells;
      return pool.filter(candidate => candidate.card.oracleId !== target.oracleId);
    }
    if (!FORMAT_RULES[this.ctx.format].onArena || !target.arenaRarity) return [];
    const targetRank = RARITIES.indexOf(target.arenaRarity);
    const pool = land ? this.craftPools().lands : this.craftPools().spells;
    return pool.filter(
      candidate =>
        candidate.card.oracleId !== target.oracleId && RARITIES.indexOf(candidate.card.arenaRarity!) < targetRank,
    );
  }

  /** May this card go into the deck at all, whatever it would replace? */
  private fitsDeck(card: IndexedCard): boolean {
    const { ctx } = this;
    const rules = FORMAT_RULES[ctx.format];
    if (!card.legal.includes(ctx.format)) return false;
    if (rules.onArena && !card.onArena) return false;
    // Lands and commander decks answer to colour identity; a 60-card deck only has to cast the card.
    if (isLand(card) || rules.hasCommander) return withinColors(card.colorIdentity, ctx.colors);
    return isCastable(card, ctx.colors);
  }

  private room(card: IndexedCard): number {
    if (card.isBasicLand) return Infinity;
    return FORMAT_RULES[this.ctx.format].maxCopies - (this.ctx.inDeck.get(card.oracleId) ?? 0);
  }

  private spare(card: IndexedCard): number {
    return usableCopies(card, this.ctx.collection) - (this.ctx.inDeck.get(card.oracleId) ?? 0);
  }

  private ownedPools(): Pools {
    if (this.owned) return this.owned;
    const { ctx } = this;
    const pools: Pools = { spells: [], lands: [] };
    const seen = new Set<string>();
    const offer = (card: IndexedCard | undefined) => {
      if (!card || seen.has(card.oracleId) || !this.fitsDeck(card)) return;
      seen.add(card.oracleId);
      const available = Math.min(this.spare(card), this.room(card));
      if (available < 1) return;
      // A basic land only ever stands in for a land.
      if (isLand(card)) pools.lands.push({ card, source: 'owned', available });
      else pools.spells.push({ card, source: 'owned', available });
    };
    for (const oracleId of ctx.collection.owned.keys()) offer(ctx.index.get(oracleId));
    // Basic lands are free on Arena whether or not the import listed them.
    for (const color of ctx.colors) offer(ctx.index.byName(BASIC_FOR_COLOR[color] ?? ''));
    return (this.owned = pools);
  }

  private craftPools(): Pools {
    if (this.craftable) return this.craftable;
    const { ctx } = this;
    const pools: Pools = { spells: [], lands: [] };
    for (const card of ctx.index.all()) {
      if (!card.arenaRarity || card.isBasicLand) continue;
      // Crafting more copies of a card the list already plays is a change of deck, not a stand-in.
      if (ctx.inDeck.has(card.oracleId)) continue;
      if (this.spare(card) >= 1 || !this.fitsDeck(card)) continue;
      const available = this.room(card);
      if (available < 1) continue;
      (isLand(card) ? pools.lands : pools.spells).push({ card, source: 'craft', available });
    }
    return (this.craftable = pools);
  }

  private tagWeight(tag: string): number {
    let weight = this.tagWeights.get(tag);
    if (weight === undefined) {
      weight = roleWeight(tag, this.ctx.index);
      this.tagWeights.set(tag, weight);
    }
    return weight;
  }

  private themeFit(card: IndexedCard): ThemeFit {
    const themes = this.ctx.themes;
    if (!themes || themes.length === 0) return NO_THEME;
    let fit = this.themeFits.get(card.oracleId);
    if (!fit) {
      fit = themeFit(themes, card);
      this.themeFits.set(card.oracleId, fit);
    }
    return fit;
  }

  /** Total weight of a card's tags, the candidate's side of the overlap ratio. */
  private cardWeight(card: IndexedCard): number {
    let weight = this.cardWeights.get(card.oracleId);
    if (weight === undefined) {
      weight = 0;
      for (const tag of card.tags) weight += this.tagWeight(tag);
      this.cardWeights.set(card.oracleId, weight);
    }
    return weight;
  }

  /** Same number as `tagOverlap(...).score`, without building the lists of tags. */
  private roleScore(target: IndexedCard, targetTags: Map<string, number>, card: IndexedCard): number {
    if (targetTags.size === 0 || card.tags.length === 0) return 0;
    let shared = 0;
    for (const tag of card.tags) shared += targetTags.get(tag) ?? 0;
    const union = this.cardWeight(target) + this.cardWeight(card) - shared;
    return union > 0 ? shared / union : 0;
  }

  /** Every signal except rules text, which is only compared for the shortlist. */
  private scoreFast(target: IndexedCard, targetTags: Map<string, number>, targetThemes: ThemeFit, candidate: Candidate): Scored {
    const { ctx } = this;
    const { card } = candidate;
    const role = this.roleScore(target, targetTags, card);
    const meta = metaScore(card, ctx.usage);

    let breakdown: ScoreBreakdown;
    let weights: ScoreBreakdown;
    let themes = NO_THEME;
    if (isLand(target)) {
      const wanted = target.producedMana.filter(c => ctx.colors.includes(c));
      const made = wanted.filter(c => card.producedMana.includes(c));
      breakdown = {
        role,
        text: 0,
        type: 1,
        cost: 1 - Math.max(0, entersTapped(card) - entersTapped(target)),
        // A utility land asks for no colour, so any land of the deck's colours covers it.
        color: wanted.length ? (made.length / wanted.length) * fixingQuality(card) : 1,
        // Commander popularity says little about a land in another deck; only archetype evidence counts.
        meta: ctx.usage ? meta.score : 0,
        fit: 0,
      };
      weights = ctx.usage ? LAND_WEIGHTS : { ...LAND_WEIGHTS, meta: 0 };
    } else {
      themes = this.themeFit(card);
      breakdown = {
        role,
        text: 0,
        type: typeScore(target, card),
        cost: costScore(target, card),
        color: colorScore(target, card),
        meta: meta.score,
        fit: targetThemes.fit > 0 ? Math.min(1, themes.fit / targetThemes.fit) : 0,
      };
      // Untagged cards (the newest set, usually) are judged on rules text instead.
      const untagged = target.tags.length === 0 || card.tags.length === 0;
      weights = untagged ? UNTAGGED_SPELL_WEIGHTS : SPELL_WEIGHTS;
      if (targetThemes.fit > 0) weights = { ...weights, fit: THEME_FIT_WEIGHT };
    }

    return {
      ...candidate,
      breakdown,
      weights,
      shared: [],
      uncovered: [],
      metaShare: meta.share,
      partial: weigh(breakdown, weights, ['text']),
      themes,
    };
  }
}

/** Stand-ins for one card. For several cards of the same deck, keep a `SubstituteFinder`. */
export function suggestSubstitutes(
  target: IndexedCard,
  ctx: SubstituteContext,
  options: SubstituteOptions = {},
): Substitute[] {
  return new SubstituteFinder(ctx).suggest(target, options);
}

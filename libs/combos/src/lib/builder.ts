import { FORMATS } from '@mtg/card-index';
import type { IndexedCard } from '@mtg/card-index';
import { byRank } from './order';
import type { CombosFile, SerializedCombo } from './types';

const COLOR_ORDER = 'WUBRG';

/** Formats played with a commander. A combo that needs its card in that seat cannot be put together anywhere else. */
const COMMANDER_FORMATS: readonly string[] = ['brawl', 'standardbrawl', 'commander'];

/**
 * Commander Spellbook's feature statuses, most telling first: standalone
 * ("Infinite damage"), contextual ("Infinite lifegain triggers"), helper
 * ("Infinite creature ETB"). A combo lists up to twenty results, so the ones
 * that win by themselves go to the front.
 */
const FEATURE_STATUS_ORDER = ['S', 'C', 'H'];

/** The fields of a Commander Spellbook variant the builder reads. */
export interface SpellbookVariant {
  id: string;
  /** `OK` for a published combo. The bulk file also carries `E` (example) entries, which have no steps and no popularity. */
  status: string;
  uses: Array<{
    card: { name?: string; oracleId?: string | null };
    quantity?: number;
    mustBeCommander?: boolean;
  }>;
  /** Generic requirements: any card that fits the template will do. */
  requires: Array<{ template: { name: string }; quantity?: number }>;
  produces: Array<{ feature: { name: string; status?: string } }>;
  /** Colour letters in upstream's own order (`GU`, `RWB`), or `C` for colourless. */
  identity: string;
  popularity?: number | null;
  bracketTag?: string | null;
}

/** Why a variant was left out. */
export type DropReason = 'status' | 'no-cards' | 'unknown-card';

/** The part of the card index the builder needs: whether a card exists and where it is legal. */
export interface CardLookup {
  get(oracleId: string): Pick<IndexedCard, 'legal'> | undefined;
}

export interface BuildCombosOptions {
  builtAt?: string;
  /** The bulk file's own `timestamp` and `version`. */
  timestamp: string;
  version: string;
}

/** Hands out one index per distinct string, in order of first use. */
class StringTable {
  readonly values: string[] = [];
  private readonly indices = new Map<string, number>();

  indexOf(value: string): number {
    let index = this.indices.get(value);
    if (index === undefined) {
      index = this.values.length;
      this.values.push(value);
      this.indices.set(value, index);
    }
    return index;
  }
}

/**
 * Folds Commander Spellbook variants into the combos file.
 *
 * Feed it every element of the bulk file's `variants` array, then call
 * `build`. Only what the lookups need is kept: the steps, prerequisites and
 * prices stay on Commander Spellbook, one link away.
 */
export class CombosBuilder {
  /** Variants left out, by reason. */
  readonly dropped: Record<DropReason, number> = { status: 0, 'no-cards': 0, 'unknown-card': 0 };
  /** Cards the card index does not have, by name, with the number of variants each one cost. */
  readonly unknownCards = new Map<string, number>();

  private variantsRead = 0;
  private readonly combos: SerializedCombo[] = [];
  private readonly cards = new StringTable();
  /** Legality mask per entry of the card table. */
  private readonly cardLegal: number[] = [];
  private readonly requirements = new StringTable();
  private readonly features = new StringTable();
  private readonly bracketTags = new StringTable();

  constructor(private readonly index: CardLookup) {}

  get read(): number {
    return this.variantsRead;
  }

  get kept(): number {
    return this.combos.length;
  }

  /** Takes one variant. Returns why it was left out, or undefined when it was kept. */
  add(variant: SpellbookVariant): DropReason | undefined {
    this.variantsRead++;
    const reason = this.compact(variant);
    if (reason) this.dropped[reason]++;
    return reason;
  }

  build(options: BuildCombosOptions): CombosFile {
    return {
      version: 1,
      builtAt: options.builtAt ?? new Date().toISOString(),
      source: { timestamp: options.timestamp, version: options.version },
      formats: FORMATS,
      cards: this.cards.values,
      requirements: this.requirements.values,
      features: this.features.values,
      bracketTags: this.bracketTags.values,
      combos: [...this.combos].sort(byRank),
    };
  }

  private compact(variant: SpellbookVariant): DropReason | undefined {
    if (variant.status !== 'OK') return 'status';
    if (variant.uses.length === 0) return 'no-cards';

    const unknown = variant.uses.filter(use => !use.card.oracleId || !this.index.get(use.card.oracleId));
    if (unknown.length > 0) {
      for (const { card } of unknown) {
        const name = card.name ?? card.oracleId ?? '(no name)';
        this.unknownCards.set(name, (this.unknownCards.get(name) ?? 0) + 1);
      }
      return 'unknown-card';
    }

    // Keyed by card so a card listed twice becomes one entry needing both copies.
    const copies = new Map<number, number>();
    const commanders = new Set<number>();
    let legal = (1 << FORMATS.length) - 1;
    for (const use of variant.uses) {
      const card = this.cardIndex(use.card.oracleId!);
      copies.set(card, (copies.get(card) ?? 0) + Math.max(1, use.quantity ?? 1));
      if (use.mustBeCommander) commanders.add(card);
      legal &= this.cardLegal[card]!;
    }
    if (commanders.size > 0) {
      FORMATS.forEach((format, bit) => {
        if (!COMMANDER_FORMATS.includes(format)) legal &= ~(1 << bit);
      });
    }

    const cards = [...copies.keys()];
    const combo: SerializedCombo = { i: variant.id, c: cards, p: this.featureIndices(variant), l: legal };

    const extraCopies = cards.flatMap((card, position) => (copies.get(card)! > 1 ? [position, copies.get(card)!] : []));
    if (extraCopies.length > 0) combo.n = extraCopies;
    if (commanders.size > 0) combo.m = cards.flatMap((card, position) => (commanders.has(card) ? [position] : []));

    const required = new Map<number, number>();
    for (const { template, quantity } of variant.requires) {
      const requirement = this.requirements.indexOf(template.name);
      required.set(requirement, (required.get(requirement) ?? 0) + Math.max(1, quantity ?? 1));
    }
    if (required.size > 0) combo.r = [...required].flat();

    const identity = [...COLOR_ORDER].filter(color => variant.identity.includes(color)).join('');
    if (identity) combo.k = identity;
    if (variant.popularity) combo.u = variant.popularity;
    if (variant.bracketTag) combo.b = this.bracketTags.indexOf(variant.bracketTag);

    this.combos.push(combo);
    return undefined;
  }

  private cardIndex(oracleId: string): number {
    const card = this.cards.indexOf(oracleId);
    if (card === this.cardLegal.length) {
      // Legality comes from our card index, not from upstream's `legalities`, which has no Historic or Timeless.
      const legal = this.index.get(oracleId)?.legal ?? [];
      this.cardLegal.push(FORMATS.reduce((mask, format, bit) => (legal.includes(format) ? mask | (1 << bit) : mask), 0));
    }
    return card;
  }

  private featureIndices(variant: SpellbookVariant): number[] {
    const rank = (status: string | undefined): number => {
      const position = FEATURE_STATUS_ORDER.indexOf(status ?? '');
      return position === -1 ? FEATURE_STATUS_ORDER.length : position;
    };
    const features = variant.produces
      .map(({ feature }) => feature)
      // Array.prototype.sort is stable, so upstream's order holds within a status.
      .sort((a, b) => rank(a.status) - rank(b.status));
    return [...new Set(features.map(feature => this.features.indexOf(feature.name)))];
  }
}

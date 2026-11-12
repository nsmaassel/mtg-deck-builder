import { FORMATS } from '@mtg/card-index';
import type { Format } from '@mtg/card-index';
import { byRank, compareIds } from './order';
import type { CardCounts, Combo, ComboCompleter, ComboMatch, ComboQuery, CombosFile } from './types';

const COLOR_ORDER = 'WUBRG';
const ALL_COLORS = (1 << COLOR_ORDER.length) - 1;
const KNOWN_FORMATS = new Set<string>(FORMATS);
const DEFAULT_LIMIT = 50;

/** How many combos a completer lists; its `total` is the full count. */
export const COMPLETER_COMBOS = 5;

function colorMask(colors: Iterable<string>): number {
  let mask = 0;
  for (const color of colors) {
    const bit = color.length === 1 ? COLOR_ORDER.indexOf(color) : -1;
    if (bit !== -1) mask |= 1 << bit;
  }
  return mask;
}

function limitOf(query: ComboQuery): number {
  const limit = query.limit ?? DEFAULT_LIMIT;
  return limit > 0 ? limit : 0;
}

function isCounted(cards: CardCounts): cards is ReadonlyMap<string, number> {
  return cards instanceof Map;
}

/** The narrowest array that holds indices into a table of `tableSize` entries. */
function indexArray(length: number, tableSize: number): Uint16Array | Uint32Array {
  return tableSize <= 0x10000 ? new Uint16Array(length) : new Uint32Array(length);
}

/**
 * Every combo, with the lookups a collection or a deck needs: which combos a
 * set of cards completes, and which it is one card short of.
 *
 * There are ~100k combos and a collection can hold 10k cards, so nothing here
 * is an object per combo. Combos are numbered most popular first and kept as
 * rows of typed arrays, with a list per card of the combos that use it. A
 * query walks the lists of the cards held, counting hits per combo, then
 * reads the answers off in number order, which is already popularity order.
 * `Combo` objects are only made for what a query returns.
 */
export class ComboIndex {
  readonly size: number;
  /** Where the data came from, for the credit line: upstream timestamp/version and build time. */
  readonly source: { timestamp: string; version: string; builtAt: string };

  private readonly formats: readonly string[];
  private readonly ids: string[];
  /** Combo numbers in id order, for `get`. */
  private readonly byId: Uint32Array;
  private readonly cardIds: string[];
  private readonly cardNumbers = new Map<string, number>();
  private readonly requirementNames: string[];
  private readonly featureNames: string[];
  private readonly bracketTags: string[];

  // One entry per combo.
  private readonly legal: Uint32Array;
  private readonly identity: Uint8Array;
  private readonly popularity: Uint32Array;
  /** Index into the bracket tag table plus one; zero for none. */
  private readonly bracket: Uint8Array;

  // A combo's cards, requirements and features are the entries from its start up to the next combo's start.
  private readonly slotStart: Uint32Array;
  private readonly slotCards: Uint16Array | Uint32Array;
  private readonly slotCopies: Uint8Array;
  private readonly commanderSlots = new Set<number>();
  private readonly requirementStart: Uint32Array;
  private readonly requirements: Uint16Array | Uint32Array;
  private readonly requirementQuantities: Uint8Array;
  private readonly featureStart: Uint32Array;
  private readonly features: Uint16Array | Uint32Array;

  // The other way round: per card, the combos that use it, most popular first, and the copies each needs.
  private readonly cardStart: Uint32Array;
  private readonly cardCombos: Uint32Array;
  private readonly cardComboCopies: Uint8Array;

  // Scratch space for one query, kept so a query allocates nothing of this size.
  private readonly owned: Uint8Array;
  private readonly hits: Uint16Array;

  static fromFile(file: CombosFile): ComboIndex {
    return new ComboIndex(file);
  }

  private constructor(file: CombosFile) {
    if (file.version !== 1) {
      throw new Error(`Unsupported combos file version ${String(file.version)}; rebuild it with scripts/data/build-combos.ts`);
    }
    // The builder already writes this order; sorting again costs little and makes any file safe to load.
    const combos = [...file.combos].sort(byRank);
    const cardCount = file.cards.length;

    this.size = combos.length;
    this.source = { timestamp: file.source.timestamp, version: file.source.version, builtAt: file.builtAt };
    this.formats = file.formats;
    this.cardIds = file.cards;
    file.cards.forEach((oracleId, card) => this.cardNumbers.set(oracleId, card));
    this.requirementNames = file.requirements;
    this.featureNames = file.features;
    this.bracketTags = file.bracketTags;

    let slots = 0;
    let required = 0;
    let produced = 0;
    for (const combo of combos) {
      slots += combo.c.length;
      required += (combo.r?.length ?? 0) / 2;
      produced += combo.p.length;
    }

    this.ids = new Array<string>(this.size);
    this.legal = new Uint32Array(this.size);
    this.identity = new Uint8Array(this.size);
    this.popularity = new Uint32Array(this.size);
    this.bracket = new Uint8Array(this.size);
    this.slotStart = new Uint32Array(this.size + 1);
    this.slotCards = indexArray(slots, cardCount);
    this.slotCopies = new Uint8Array(slots).fill(1);
    this.requirementStart = new Uint32Array(this.size + 1);
    this.requirements = indexArray(required, file.requirements.length);
    this.requirementQuantities = new Uint8Array(required);
    this.featureStart = new Uint32Array(this.size + 1);
    this.features = indexArray(produced, file.features.length);
    this.cardStart = new Uint32Array(cardCount + 1);
    this.cardCombos = new Uint32Array(slots);
    this.cardComboCopies = new Uint8Array(slots);
    this.owned = new Uint8Array(cardCount);
    this.hits = new Uint16Array(this.size);

    let slot = 0;
    let requirement = 0;
    let feature = 0;
    combos.forEach((combo, number) => {
      this.ids[number] = combo.i;
      this.legal[number] = combo.l;
      this.identity[number] = colorMask(combo.k ?? '');
      this.popularity[number] = combo.u ?? 0;
      this.bracket[number] = combo.b === undefined ? 0 : combo.b + 1;

      this.slotStart[number] = slot;
      for (const card of combo.c) {
        this.slotCards[slot++] = card;
        this.cardStart[card + 1]!++;
      }
      const copies = combo.n ?? [];
      for (let i = 0; i + 1 < copies.length; i += 2) {
        this.slotCopies[this.slotStart[number]! + copies[i]!] = Math.min(255, copies[i + 1]!);
      }
      for (const position of combo.m ?? []) this.commanderSlots.add(this.slotStart[number]! + position);

      this.requirementStart[number] = requirement;
      const requires = combo.r ?? [];
      for (let i = 0; i + 1 < requires.length; i += 2) {
        this.requirements[requirement] = requires[i]!;
        this.requirementQuantities[requirement++] = Math.min(255, requires[i + 1]!);
      }

      this.featureStart[number] = feature;
      for (const produces of combo.p) this.features[feature++] = produces;
    });
    this.slotStart[this.size] = slot;
    this.requirementStart[this.size] = requirement;
    this.featureStart[this.size] = feature;

    // Counts become start offsets, then each card's list fills in combo order, which leaves it most popular first.
    for (let card = 0; card < cardCount; card++) this.cardStart[card + 1]! += this.cardStart[card]!;
    const next = this.cardStart.slice(0, cardCount);
    for (let number = 0; number < this.size; number++) {
      for (let s = this.slotStart[number]!; s < this.slotStart[number + 1]!; s++) {
        const entry = next[this.slotCards[s]!]!++;
        this.cardCombos[entry] = number;
        this.cardComboCopies[entry] = this.slotCopies[s]!;
      }
    }

    this.byId = new Uint32Array(this.size);
    for (let number = 0; number < this.size; number++) this.byId[number] = number;
    this.byId.sort((a, b) => compareIds(this.ids[a]!, this.ids[b]!));
  }

  get(id: string): Combo | undefined {
    let low = 0;
    let high = this.size - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      const number = this.byId[middle]!;
      const order = compareIds(id, this.ids[number]!);
      if (order === 0) return this.combo(number);
      if (order < 0) high = middle - 1;
      else low = middle + 1;
    }
    return undefined;
  }

  /** Combos that use this card, most popular first. */
  withCard(oracleId: string, query: ComboQuery = {}): Combo[] {
    const card = this.cardNumbers.get(oracleId);
    if (card === undefined) return [];
    const accept = this.filter(query);
    const limit = limitOf(query);
    const found: Combo[] = [];
    for (let entry = this.cardStart[card]!; entry < this.cardStart[card + 1]! && found.length < limit; entry++) {
      const number = this.cardCombos[entry]!;
      if (accept(number)) found.push(this.combo(number));
    }
    return found;
  }

  /** Combos whose specific cards are all in `cards`. */
  complete(cards: CardCounts, query: ComboQuery = {}): Combo[] {
    this.tally(cards);
    return this.short(0, this.filter(query), limitOf(query)).map(number => this.combo(number));
  }

  /**
   * Combos missing exactly `missing` cards (default 1). The player must hold
   * at least one of a combo's cards: otherwise every one-card combo would
   * count as one card short for a player who has no part of it.
   */
  near(cards: CardCounts, query: ComboQuery & { missing?: number } = {}): ComboMatch[] {
    this.tally(cards);
    return this.short(query.missing ?? 1, this.filter(query), limitOf(query)).map(number => ({
      combo: this.combo(number),
      missing: this.missing(number).map(card => this.cardIds[card]!),
    }));
  }

  /**
   * Cards the player lacks, ranked by how many combos each would complete
   * (then by the popularity of the best one). Many variants differ by one
   * interchangeable card, so this is the short way to say "crafting X
   * finishes 14 combos". A card held in too few copies can be the missing one.
   */
  completers(cards: CardCounts, query: ComboQuery = {}): ComboCompleter[] {
    this.tally(cards);
    const accept = this.filter(query);
    const totals = new Uint32Array(this.cardIds.length);
    const found: number[] = [];
    for (const number of this.short(1, accept, Infinity)) {
      const card = this.missing(number)[0]!;
      if (totals[card]!++ === 0) found.push(card);
    }

    // Combos came most popular first, so `found` is in order of each card's best combo, and the sort,
    // being stable, keeps that order between cards that finish equally many.
    found.sort((a, b) => totals[b]! - totals[a]!);
    return found.slice(0, limitOf(query)).map(card => {
      const combos: Combo[] = [];
      for (let entry = this.cardStart[card]!; entry < this.cardStart[card + 1]! && combos.length < COMPLETER_COMBOS; entry++) {
        const number = this.cardCombos[entry]!;
        // The card must be the one this combo lacks: a combo that needs fewer copies of it may be short of another card.
        if (this.owned[card]! < this.cardComboCopies[entry]! && this.isShort(number, 1) && accept(number)) {
          combos.push(this.combo(number));
        }
      }
      return { oracleId: this.cardIds[card]!, combos, total: totals[card]! };
    });
  }

  /** Records what the player holds and counts, per combo, how many of its cards that covers. */
  private tally(cards: CardCounts): void {
    this.owned.fill(0);
    this.hits.fill(0);
    const hold = (oracleId: string, copies: number): void => {
      const card = this.cardNumbers.get(oracleId);
      if (card === undefined || !(copies >= 1)) return;
      const held = Math.min(255, Math.floor(copies));
      this.owned[card] = held;
      for (let entry = this.cardStart[card]!; entry < this.cardStart[card + 1]!; entry++) {
        if (this.cardComboCopies[entry]! <= held) this.hits[this.cardCombos[entry]!]!++;
      }
    };
    if (isCounted(cards)) for (const [oracleId, copies] of cards) hold(oracleId, copies);
    else for (const oracleId of cards) hold(oracleId, 1);
  }

  /** After a tally: is the combo short by exactly `missing` cards, with at least one of its cards held? */
  private isShort(number: number, missing: number): boolean {
    const hits = this.hits[number]!;
    return hits > 0 && this.slotStart[number + 1]! - this.slotStart[number]! - hits === missing;
  }

  /** After a tally: the combos short by exactly `missing` cards that pass the filter, most popular first. */
  private short(missing: number, accept: (number: number) => boolean, limit: number): number[] {
    const found: number[] = [];
    for (let number = 0; number < this.size && found.length < limit; number++) {
      if (this.isShort(number, missing) && accept(number)) found.push(number);
    }
    return found;
  }

  /** After a tally: the cards of a combo the player does not hold enough copies of. */
  private missing(number: number): number[] {
    const cards: number[] = [];
    for (let s = this.slotStart[number]!; s < this.slotStart[number + 1]!; s++) {
      const card = this.slotCards[s]!;
      if (this.owned[card]! < this.slotCopies[s]!) cards.push(card);
    }
    return cards;
  }

  private filter(query: ComboQuery): (number: number) => boolean {
    // Bits are read through the file's own format list, as the file may be older than this code's FORMATS.
    const bit = query.format === undefined ? -1 : this.formats.indexOf(query.format);
    if (query.format !== undefined && bit === -1) return () => false;
    const format = bit === -1 ? 0 : 1 << bit;
    const outside = query.identity === undefined ? 0 : ALL_COLORS & ~colorMask(query.identity);
    const specificOnly = query.specificOnly === true;
    return number =>
      (this.legal[number]! & format) === format &&
      (this.identity[number]! & outside) === 0 &&
      !(specificOnly && this.requirementStart[number + 1]! > this.requirementStart[number]!);
  }

  private combo(number: number): Combo {
    const cards: string[] = [];
    const commanders: string[] = [];
    let copies: Record<string, number> | undefined;
    for (let s = this.slotStart[number]!; s < this.slotStart[number + 1]!; s++) {
      const oracleId = this.cardIds[this.slotCards[s]!]!;
      cards.push(oracleId);
      if (this.slotCopies[s]! > 1) (copies ??= {})[oracleId] = this.slotCopies[s]!;
      if (this.commanderSlots.has(s)) commanders.push(oracleId);
    }

    const requirements: Combo['requirements'] = [];
    for (let r = this.requirementStart[number]!; r < this.requirementStart[number + 1]!; r++) {
      requirements.push({ name: this.requirementNames[this.requirements[r]!]!, quantity: this.requirementQuantities[r]! });
    }
    const produces: string[] = [];
    for (let f = this.featureStart[number]!; f < this.featureStart[number + 1]!; f++) {
      produces.push(this.featureNames[this.features[f]!]!);
    }

    const tag = this.bracketTags[this.bracket[number]! - 1];
    return {
      id: this.ids[number]!,
      cards,
      ...(copies ? { copies } : {}),
      commanders,
      requirements,
      produces,
      identity: [...COLOR_ORDER].filter((_, bit) => (this.identity[number]! & (1 << bit)) !== 0),
      legal: this.formats.filter(
        (format, bit) => (this.legal[number]! & (1 << bit)) !== 0 && KNOWN_FORMATS.has(format),
      ) as Format[],
      popularity: this.popularity[number]!,
      ...(tag === undefined ? {} : { bracketTag: tag }),
    };
  }
}

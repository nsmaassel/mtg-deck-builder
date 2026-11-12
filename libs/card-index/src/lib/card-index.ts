import { rarityFromRank } from './builder';
import { normalizeCardName, splitFaces } from './names';
import { FORMATS } from './types';
import type { CardIndexFile, Format, IndexedCard, SerializedCard } from './types';

function formatsFromMask(mask: number | undefined, formats: readonly string[]): Format[] {
  if (!mask) return [];
  const known = new Set<string>(FORMATS);
  return formats.filter((f, bit) => (mask & (1 << bit)) !== 0 && known.has(f)) as Format[];
}

function deserialize(card: SerializedCard, file: CardIndexFile): IndexedCard {
  return {
    oracleId: card.o,
    name: card.n,
    aliases: card.a ?? [],
    manaCost: card.m ?? '',
    cmc: card.c,
    typeLine: card.t,
    oracleText: card.x ?? '',
    colors: [...(card.k ?? '')],
    colorIdentity: [...(card.i ?? '')],
    producedMana: [...(card.p ?? '')],
    keywords: card.w ?? [],
    legal: formatsFromMask(card.l, file.formats),
    restricted: formatsFromMask(card.r, file.formats),
    banned: formatsFromMask(card.b, file.formats),
    onArena: card.ar !== undefined,
    arenaRarity: card.ar === undefined ? undefined : rarityFromRank(card.ar),
    arenaIds: card.ai ?? [],
    arenaName: card.an,
    rarity: rarityFromRank(card.y),
    edhrecRank: card.e,
    usd: card.u,
    tags: (card.g ?? []).map(i => file.tags[i]?.slug).filter((s): s is string => s !== undefined),
    isBasicLand: ((card.f ?? 0) & 1) !== 0,
    gameChanger: ((card.f ?? 0) & 2) !== 0,
  };
}

/** A name without its punctuation, so a dropped comma or apostrophe is no difference at all. */
function squash(key: string): string {
  return key.replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Edit distance counting a swap of two neighbouring letters as one edit, the
 * commonest typo. Gives up (returns `limit + 1`) once it must exceed `limit`.
 */
function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let beforeLast: number[] = [];
  let last = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(last[j]! + 1, row[j - 1]! + 1, last[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, beforeLast[j - 2]! + 1);
      row.push(value);
      if (value < best) best = value;
    }
    if (best > limit) return limit + 1;
    beforeLast = last;
    last = row;
  }
  return last[b.length]!;
}

/** In-memory card database with the lookups the advisor needs. */
export class CardIndex {
  readonly builtAt: string;
  readonly cardsUpdatedAt?: string;

  private readonly cards: IndexedCard[];
  private readonly byOracle = new Map<string, IndexedCard>();
  private readonly byNameKey = new Map<string, IndexedCard>();
  private readonly byArena = new Map<number, IndexedCard>();
  private readonly tagCounts = new Map<string, number>();

  constructor(file: CardIndexFile, options: { disabledTags?: Iterable<string> } = {}) {
    if (file.version !== 1) {
      throw new Error(`Unsupported card index version ${String(file.version)}; rebuild it with scripts/data/build-card-index.ts`);
    }
    this.builtAt = file.builtAt;
    this.cardsUpdatedAt = file.cardsUpdatedAt;

    const disabled = new Set(options.disabledTags ?? []);
    const hidden = new Set(
      file.tags.filter(t => disabled.has(t.slug) || disabled.has(t.id)).map(t => t.slug),
    );

    this.cards = file.cards.map(raw => {
      const card = deserialize(raw, file);
      if (hidden.size) card.tags = card.tags.filter(t => !hidden.has(t));
      return card;
    });

    for (const card of this.cards) {
      this.byOracle.set(card.oracleId, card);
      for (const id of card.arenaIds) this.byArena.set(id, card);
      for (const tag of card.tags) this.tagCounts.set(tag, (this.tagCounts.get(tag) ?? 0) + 1);
    }

    // Earlier passes win, so a full oracle name always beats another card's face or flavour name.
    const claim = (name: string | undefined, card: IndexedCard) => {
      if (!name) return;
      const key = normalizeCardName(name);
      if (key && !this.byNameKey.has(key)) this.byNameKey.set(key, card);
    };
    for (const card of this.cards) claim(card.name, card);
    for (const card of this.cards) claim(card.arenaName, card);
    for (const card of this.cards) claim(splitFaces(card.name)[0], card);
    for (const card of this.cards) for (const alias of card.aliases) claim(alias, card);
  }

  get size(): number {
    return this.cards.length;
  }

  all(): readonly IndexedCard[] {
    return this.cards;
  }

  get(oracleId: string): IndexedCard | undefined {
    return this.byOracle.get(oracleId);
  }

  byName(name: string): IndexedCard | undefined {
    return this.byNameKey.get(normalizeCardName(name));
  }

  byArenaId(arenaId: number): IndexedCard | undefined {
    return this.byArena.get(arenaId);
  }

  /**
   * Cards a name that matched nothing probably meant: a typo's nearest
   * spellings first, then cards whose name contains the words given, each
   * group most played first. Scans every name, so it is for the miss path.
   */
  closest(name: string, limit = 3): IndexedCard[] {
    const wanted = squash(normalizeCardName(name));
    if (wanted.length < 3) return [];
    const tolerance = Math.max(1, Math.floor(wanted.length / 5));

    const typos: Array<{ card: IndexedCard; distance: number }> = [];
    const partial = new Set<IndexedCard>();
    for (const [key, card] of this.byNameKey) {
      const candidate = squash(key);
      const distance = editDistance(wanted, candidate, tolerance);
      if (distance <= tolerance) typos.push({ card, distance });
      else if (` ${candidate} `.includes(` ${wanted} `)) partial.add(card);
    }

    const played = (card: IndexedCard) => card.edhrecRank ?? Number.MAX_SAFE_INTEGER;
    const byPlay = (a: IndexedCard, b: IndexedCard) => played(a) - played(b) || a.name.localeCompare(b.name);
    typos.sort((a, b) => a.distance - b.distance || byPlay(a.card, b.card));
    const ordered = [...typos.map(entry => entry.card), ...[...partial].sort(byPlay)];
    return [...new Set(ordered)].slice(0, limit);
  }

  /** How many cards carry the tag. */
  tagCount(tag: string): number {
    return this.tagCounts.get(tag) ?? 0;
  }

  /** Inverse document frequency: rare tags say more about what a card does than `removal` does. */
  tagWeight(tag: string): number {
    const count = this.tagCounts.get(tag);
    if (!count) return 0;
    return Math.log(1 + this.cards.length / count);
  }
}

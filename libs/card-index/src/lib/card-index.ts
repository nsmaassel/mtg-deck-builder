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

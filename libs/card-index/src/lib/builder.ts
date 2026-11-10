import { splitFaces } from './names';
import { NOISE_TAG_PATTERNS, NOISE_TAG_ROOTS, NOISE_TAGS } from './tag-filter';
import { FORMATS, RARITIES } from './types';
import type {
  CardIndexFile,
  Rarity,
  ScryfallPrinting,
  ScryfallTag,
  SerializedCard,
  TagInfo,
} from './types';

const NON_CARD_LAYOUTS = new Set([
  'token', 'double_faced_token', 'emblem', 'art_series', 'vanguard', 'scheme', 'planar',
]);

/**
 * Sets Arena carries that Scryfall does not flag with `games: ["arena"]`.
 * `om1` (Through the Omenpaths) is the Arena name-swapped Spider-Man set; its
 * Arena card names are in `printed_name`.
 */
const ARENA_SETS_UNFLAGGED = new Set(['om1']);

/** Tags carried by a single card say nothing about similarity; drop them to keep the file small. */
const MIN_TAG_CARDS = 2;

const RARITY_RANK: Record<string, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  special: 2,
  mythic: 3,
  bonus: 3,
};

const COLOR_ORDER = 'WUBRGC';

function sortColors(colors: Iterable<string>): string {
  return [...new Set(colors)]
    .filter(c => COLOR_ORDER.includes(c))
    .sort((a, b) => COLOR_ORDER.indexOf(a) - COLOR_ORDER.indexOf(b))
    .join('');
}

interface Draft {
  oracleId: string;
  name: string;
  aliases: Set<string>;
  manaCost: string;
  cmc: number;
  typeLine: string;
  oracleText: string;
  colors: string;
  colorIdentity: string;
  producedMana: string;
  keywords: string[];
  legalities: Record<string, string>;
  arenaRarity?: number;
  arenaIds: Set<number>;
  arenaName?: string;
  paperRarity?: number;
  anyRarity: number;
  edhrecRank?: number;
  usd?: number;
  gameChanger: boolean;
  tagIds: Set<string>;
}

export interface BuildOptions {
  builtAt?: string;
  cardsUpdatedAt?: string;
  tagsUpdatedAt?: string;
  /** Scryfall tag ids to leave out (their kill switch for a bad community tag). */
  disabledTagIds?: Iterable<string>;
  /** Keep trivia tags too. Only useful for inspecting the raw tag data. */
  keepNoiseTags?: boolean;
}

export interface BuildResult {
  file: CardIndexFile;
  /** Slugs named in the noise filter that the tag data no longer contains. */
  unknownNoiseSlugs: string[];
}

/**
 * Folds Scryfall printings into one record per oracle card.
 *
 * Feed it every object of the `default_cards` bulk file, then every object of
 * the `oracle_tags` bulk file, then call `build`.
 */
export class CardIndexBuilder {
  private readonly drafts = new Map<string, Draft>();
  private readonly tags = new Map<string, ScryfallTag>();

  addPrinting(p: ScryfallPrinting): void {
    if (NON_CARD_LAYOUTS.has(p.layout)) return;
    const oracleId = p.oracle_id ?? p.card_faces?.[0]?.oracle_id;
    if (!oracleId) return;
    if (!Object.values(p.legalities).some(v => v !== 'not_legal')) return;

    let draft = this.drafts.get(oracleId);
    if (!draft) {
      draft = this.newDraft(oracleId, p);
      this.drafts.set(oracleId, draft);
    }

    const rarity = RARITY_RANK[p.rarity] ?? RARITY_RANK['rare']!;
    const games = p.games ?? [];
    draft.anyRarity = Math.min(draft.anyRarity, rarity);
    if (games.includes('paper')) {
      draft.paperRarity = Math.min(draft.paperRarity ?? rarity, rarity);
    }

    if (games.includes('arena') || ARENA_SETS_UNFLAGGED.has(p.set)) {
      draft.arenaRarity = Math.min(draft.arenaRarity ?? rarity, rarity);
      if (typeof p.arena_id === 'number') draft.arenaIds.add(p.arena_id);
      if (p.printed_name && p.printed_name !== p.name && (p.lang ?? 'en') === 'en') {
        draft.arenaName = p.printed_name;
      }
    }

    if ((p.lang ?? 'en') === 'en') {
      for (const alias of [p.printed_name, p.flavor_name]) {
        if (alias && alias !== draft.name) draft.aliases.add(alias);
      }
    }

    const usd = p.prices?.usd ? Number.parseFloat(p.prices.usd) : NaN;
    if (Number.isFinite(usd) && !p.oversized && p.set_type !== 'memorabilia') {
      draft.usd = Math.min(draft.usd ?? usd, usd);
    }
  }

  addTag(tag: ScryfallTag): void {
    this.tags.set(tag.id, tag);
  }

  build(options: BuildOptions = {}): CardIndexFile {
    return this.buildWithReport(options).file;
  }

  buildWithReport(options: BuildOptions = {}): BuildResult {
    const killed = new Set(options.disabledTagIds ?? []);
    const noise = options.keepNoiseTags ? { ids: new Set<string>(), unknown: [] } : this.noiseTagIds();
    this.applyTags(killed, noise.ids);

    const tagCounts = new Map<string, number>();
    for (const draft of this.drafts.values()) {
      for (const id of draft.tagIds) tagCounts.set(id, (tagCounts.get(id) ?? 0) + 1);
    }
    const tagTable: TagInfo[] = [...tagCounts]
      .filter(([, count]) => count >= MIN_TAG_CARDS)
      .map(([id]) => ({ id, slug: this.tags.get(id)!.slug }))
      .sort((a, b) => a.slug.localeCompare(b.slug));
    const tagIndex = new Map(tagTable.map((t, i) => [t.id, i]));

    const cards = [...this.drafts.values()]
      .sort((a, b) => a.name.localeCompare(b.name) || a.oracleId.localeCompare(b.oracleId))
      .map(draft => serializeDraft(draft, tagIndex));

    return {
      file: {
        version: 1,
        builtAt: options.builtAt ?? new Date().toISOString(),
        cardsUpdatedAt: options.cardsUpdatedAt,
        tagsUpdatedAt: options.tagsUpdatedAt,
        formats: FORMATS,
        tags: tagTable,
        cards,
      },
      unknownNoiseSlugs: noise.unknown,
    };
  }

  /**
   * Trivia tags: the listed tags, pattern matches, and every tag whose root
   * ancestors are all trivia. `shockland` sits under both `cycle` and
   * `dual-land`, so it stays.
   */
  private noiseTagIds(): { ids: Set<string>; unknown: string[] } {
    const bySlug = new Map([...this.tags.values()].map(t => [t.slug, t.id]));
    const unknown = [...NOISE_TAG_ROOTS, ...NOISE_TAGS].filter(slug => !bySlug.has(slug));
    const noiseRoots = new Set(NOISE_TAG_ROOTS.map(slug => bySlug.get(slug)).filter(Boolean));
    const ids = new Set<string>(NOISE_TAGS.map(slug => bySlug.get(slug)).filter((id): id is string => !!id));

    const rootsOf = new Map<string, Set<string>>();
    const resolve = (id: string, trail: Set<string>): Set<string> => {
      const known = rootsOf.get(id);
      if (known) return known;
      const roots = new Set<string>();
      if (noiseRoots.has(id)) {
        roots.add(id);
      } else if (!trail.has(id)) {
        trail.add(id);
        const parents = (this.tags.get(id)?.parent_ids ?? []).filter(p => this.tags.has(p));
        if (parents.length === 0) roots.add(id);
        for (const parent of parents) for (const root of resolve(parent, trail)) roots.add(root);
        trail.delete(id);
      }
      rootsOf.set(id, roots);
      return roots;
    };

    for (const tag of this.tags.values()) {
      const roots = resolve(tag.id, new Set());
      const allNoise = roots.size > 0 && [...roots].every(root => noiseRoots.has(root));
      if (allNoise || NOISE_TAG_PATTERNS.some(pattern => pattern.test(tag.slug))) ids.add(tag.id);
    }
    return { ids, unknown };
  }

  private newDraft(oracleId: string, p: ScryfallPrinting): Draft {
    const faces = p.card_faces ?? [];
    const front = faces[0];
    const aliases = new Set<string>();
    const faceNames = splitFaces(p.name);
    if (faceNames.length > 1) for (const face of faceNames) aliases.add(face);

    return {
      oracleId,
      name: p.name,
      aliases,
      manaCost: p.mana_cost ?? front?.mana_cost ?? '',
      cmc: p.cmc ?? 0,
      typeLine: p.type_line ?? faces.map(f => f.type_line ?? '').join(' // '),
      oracleText: p.oracle_text ?? faces.map(f => f.oracle_text ?? '').join('\n//\n'),
      colors: sortColors(p.colors ?? front?.colors ?? []),
      colorIdentity: sortColors(p.color_identity ?? []),
      producedMana: sortColors(p.produced_mana ?? []),
      keywords: p.keywords ?? [],
      legalities: p.legalities,
      arenaIds: new Set(),
      anyRarity: RARITY_RANK[p.rarity] ?? RARITY_RANK['rare']!,
      edhrecRank: p.edhrec_rank ?? undefined,
      gameChanger: p.game_changer === true,
      tagIds: new Set(),
    };
  }

  /**
   * Give each card its direct tags plus every ancestor: a `removal-creature` card is also `removal`.
   * A killed tag contributes nothing. A trivia tag is left off the card but still passes its
   * taggings up: `cycle-rav-shockland` is trivia, its ancestor `shockland` is not.
   */
  private applyTags(killed: Set<string>, trivia: Set<string>): void {
    const ancestors = new Map<string, string[]>();
    const resolve = (id: string, trail: Set<string>): string[] => {
      const known = ancestors.get(id);
      if (known) return known;
      if (trail.has(id)) return [];
      trail.add(id);
      const out = new Set<string>();
      for (const parent of this.tags.get(id)?.parent_ids ?? []) {
        if (!this.tags.has(parent)) continue;
        out.add(parent);
        for (const grand of resolve(parent, trail)) out.add(grand);
      }
      trail.delete(id);
      const list = [...out];
      ancestors.set(id, list);
      return list;
    };

    for (const tag of this.tags.values()) {
      if (!tag.taggings?.length || killed.has(tag.id)) continue;
      const ids = [tag.id, ...resolve(tag.id, new Set())].filter(id => !killed.has(id) && !trivia.has(id));
      if (ids.length === 0) continue;
      for (const { oracle_id } of tag.taggings) {
        const draft = this.drafts.get(oracle_id);
        if (!draft) continue;
        for (const id of ids) draft.tagIds.add(id);
      }
    }
  }
}

function formatMask(legalities: Record<string, string>, ...statuses: string[]): number {
  let mask = 0;
  FORMATS.forEach((format, bit) => {
    if (statuses.includes(legalities[format] ?? 'not_legal')) mask |= 1 << bit;
  });
  return mask;
}

function serializeDraft(draft: Draft, tagIndex: Map<string, number>): SerializedCard {
  const card: SerializedCard = {
    o: draft.oracleId,
    n: draft.name,
    c: draft.cmc,
    t: draft.typeLine,
    l: formatMask(draft.legalities, 'legal', 'restricted'),
    y: draft.paperRarity ?? draft.anyRarity,
  };
  if (draft.aliases.size) card.a = [...draft.aliases].sort();
  if (draft.manaCost) card.m = draft.manaCost;
  if (draft.oracleText) card.x = draft.oracleText;
  if (draft.colors) card.k = draft.colors;
  if (draft.colorIdentity) card.i = draft.colorIdentity;
  if (draft.producedMana) card.p = draft.producedMana;
  if (draft.keywords.length) card.w = draft.keywords;

  const restricted = formatMask(draft.legalities, 'restricted');
  const banned = formatMask(draft.legalities, 'banned');
  if (restricted) card.r = restricted;
  if (banned) card.b = banned;

  if (draft.arenaRarity !== undefined) {
    card.ar = draft.arenaRarity;
    if (draft.arenaIds.size) card.ai = [...draft.arenaIds].sort((a, b) => a - b);
    if (draft.arenaName) card.an = draft.arenaName;
  }
  if (draft.edhrecRank !== undefined) card.e = draft.edhrecRank;
  if (draft.usd !== undefined) card.u = draft.usd;

  const tags = [...draft.tagIds]
    .map(id => tagIndex.get(id))
    .filter((i): i is number => i !== undefined)
    .sort((a, b) => a - b);
  if (tags.length) card.g = tags;

  const flags = (/\bBasic\b.*\bLand\b/.test(draft.typeLine) ? 1 : 0) | (draft.gameChanger ? 2 : 0);
  if (flags) card.f = flags;
  return card;
}

export function rarityFromRank(rank: number): Rarity {
  return RARITIES[Math.max(0, Math.min(RARITIES.length - 1, rank))]!;
}

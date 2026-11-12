import type { CardIndex, Format, IndexedCard } from '@mtg/card-index';
import { canBeCommander, cardName, matches } from './match';
import { MAX_THEMES, THEME_THRESHOLD, THEMES, TYPAL, TYPE_BATCHES, typalWants } from './themes';
import type { CommanderProfile, ProfiledTheme, ThemeInfo, ThemeSignal } from './types';
import { joinWords, pluralType, titleFromSlug } from './words';

/** Typal outranks whatever else the commander does: a Goblin commander's deck is Goblins first. */
const TYPAL_STRENGTH = 2;
/** A creature type read from rules text alone, on a commander Tagger has not tagged yet. */
const UNTAGGED_TYPAL_STRENGTH = 0.8;

const subtypeCache = new WeakMap<CardIndex, ReadonlySet<string>>();

/**
 * Every creature type in the index: the subtype words on creature cards that
 * no other kind of card carries. An enchantment creature can be a Shrine and
 * Dryad Arbor is a Forest; neither is a type of creature.
 */
function creatureSubtypes(index: CardIndex): ReadonlySet<string> {
  let known = subtypeCache.get(index);
  if (!known) {
    const onCreatures = new Set<string>();
    const elsewhere = new Set<string>();
    for (const card of index.all()) {
      for (const face of card.typeLine.split(' // ')) {
        const [types, subtypes] = face.split(' — ');
        if (!subtypes) continue;
        const words = /\b(Creature|Kindred)\b/.test(types ?? '') ? onCreatures : elsewhere;
        for (const word of subtypes.split(' ')) if (word) words.add(word);
      }
    }
    known = new Set([...onCreatures].filter(word => !elsewhere.has(word)));
    subtypeCache.set(index, known);
  }
  return known;
}

/** The commander's own creature types, front face. */
function ownSubtypes(commander: IndexedCard): string[] {
  const [, subtypes] = (commander.typeLine.split(' // ')[0] ?? '').split(' — ');
  return subtypes ? subtypes.split(' ').filter(Boolean) : [];
}

/**
 * Rules text with the parts that name a type without caring about it taken
 * out: the commander's own name and the description of tokens it makes.
 */
function textWithoutNamesAndTokens(commander: IndexedCard): string {
  let text = commander.oracleText;
  for (const name of [commander.name, ...commander.name.split(' // ')]) {
    text = text.split(name).join(' ');
    const short = name.split(',')[0];
    if (short) text = text.split(short).join(' ');
  }
  return text.replace(/\bcreates? [^.]*?\btokens?\b/gi, ' ');
}

function typalTheme(index: CardIndex, commander: IndexedCard): (ProfiledTheme & { strength: number }) | undefined {
  const known = creatureSubtypes(index);
  const isType = (name: string) => name.split(' ').every(word => known.has(word));

  /** Creature type → the Tagger tag for cards that care about it. */
  const types = new Map<string, string>();
  let tagged = false;
  for (const tag of commander.tags) {
    if (!tag.startsWith('typal-')) continue;
    tagged = true;
    const slug = tag.slice('typal-'.length);
    for (const name of TYPE_BATCHES[slug] ?? [titleFromSlug(slug)]) {
      if (isType(name)) types.set(name, tag);
    }
  }

  if (!tagged) {
    const text = textWithoutNamesAndTokens(commander);
    for (const type of ownSubtypes(commander).filter(isType)) {
      const mention = new RegExp(`\\b(${type}|${pluralType(type)})\\b`);
      if (mention.test(text)) types.set(type, `typal-${type.toLowerCase()}`);
    }
  }
  if (types.size === 0) return undefined;

  const names = [...types.keys()];
  const plurals = names.map(pluralType);
  const own = ownSubtypes(commander);
  const makesTokensOf = (type: string) =>
    new RegExp(`\\bcreates? [^.]*\\b${type}\\b[^.]*\\btokens?\\b`, 'i').test(commander.oracleText);
  return {
    ...TYPAL,
    name: `${joinWords(names)} Typal`,
    weight: tagged ? 1 : UNTAGGED_TYPAL_STRENGTH,
    strength: tagged ? TYPAL_STRENGTH : UNTAGGED_TYPAL_STRENGTH,
    because: `cares about ${joinWords(plurals)}`,
    creatureTypes: names,
    wants: names.flatMap((name, i) =>
      typalWants(types.get(name)!, name, plurals[i]!, !own.includes(name) && makesTokensOf(name)),
    ),
  };
}

/** What this commander is about, read from its tags, type line, keywords and rules text. */
export function profileCommander(
  index: CardIndex,
  commander: IndexedCard,
  options: { format?: Format } = {},
): CommanderProfile {
  const tags = new Set(commander.tags);
  const found: Array<ProfiledTheme & { strength: number }> = [];

  const typal = typalTheme(index, commander);
  if (typal) found.push(typal);

  for (const theme of THEMES) {
    let strength = 0;
    let strongest: ThemeSignal | undefined;
    for (const signal of theme.signals) {
      if (!matches(signal, commander, tags)) continue;
      strength += signal.weight;
      if (!strongest || signal.weight > strongest.weight) strongest = signal;
    }
    if (!strongest || strength < THEME_THRESHOLD) continue;
    found.push({
      slug: theme.slug,
      name: theme.name,
      description: theme.description,
      weight: Math.min(1, strength),
      strength,
      because: strongest.says,
      wants: theme.wants,
    });
  }

  // Array.sort is stable, so equally strong themes keep the table's order.
  const themes = found
    .sort((a, b) => b.strength - a.strength)
    .slice(0, MAX_THEMES)
    .map(({ strength: _strength, ...theme }) => theme);

  return {
    commander,
    identity: [...commander.colorIdentity],
    format: options.format ?? 'commander',
    themes,
  };
}

export function listThemes(): ThemeInfo[] {
  return [TYPAL, ...THEMES].map(({ slug, name, description }) => ({ slug, name, description }));
}

/** A commander is suggested for a theme it clearly has, not one it brushes against. */
const SUGGESTION_WEIGHT = 0.7;

/**
 * Legendary commanders whose profile has this theme, most played first.
 *
 * "Most played" is Scryfall's EDHREC rank of the card anywhere in a deck: the
 * bulk data has no rank for a card as a commander.
 */
export function commandersForTheme(
  index: CardIndex,
  slug: string,
  options: { format?: Format; limit?: number } = {},
): IndexedCard[] {
  const format = options.format ?? 'commander';
  return index
    .all()
    .filter(card => card.legal.includes(format) && canBeCommander(card))
    .filter(card =>
      profileCommander(index, card, { format }).themes.some(theme => theme.slug === slug && theme.weight >= SUGGESTION_WEIGHT),
    )
    .sort((a, b) => (a.edhrecRank ?? Infinity) - (b.edhrecRank ?? Infinity) || a.name.localeCompare(b.name))
    .slice(0, options.limit ?? 20);
}

/**
 * Commanders whose name contains the query, most played first. Matching
 * ignores case and punctuation, so `krenko mob` finds Krenko, Mob Boss.
 */
export function findCommanders(
  index: CardIndex,
  query: string,
  options: { format?: Format; limit?: number } = {},
): IndexedCard[] {
  const fold = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const wanted = fold(query);
  if (!wanted) return [];
  const format = options.format ?? 'commander';
  return index
    .all()
    .filter(card => card.legal.includes(format) && canBeCommander(card) && fold(cardName(card)).includes(wanted))
    .sort((a, b) => (a.edhrecRank ?? Infinity) - (b.edhrecRank ?? Infinity) || a.name.localeCompare(b.name))
    .slice(0, options.limit ?? 20);
}

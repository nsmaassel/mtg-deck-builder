import type { IndexedCard } from '@mtg/card-index';
import { isLand, matches } from './match';
import { THEMES, TYPAL, TYPE_BATCHES, typalWants } from './themes';
import type { ProfiledTheme, ThemeSignal, ThemeWant } from './types';
import { joinWords, pluralType, titleFromSlug } from './words';

/** A card of a list and how many copies it plays. */
export interface DeckCardCount {
  card: IndexedCard;
  count: number;
}

/**
 * A theme is on when this share of the list's spells points at it. Measured on
 * Standard and Pioneer tournament lists: the theme a deck is named for sits at
 * 0.3 and up (Jund Sacrifice, Izzet Prowess, Spirits), and under 0.18 the
 * matches are mostly incidental: one sacrifice outlet does not make a
 * sacrifice deck. Some incidental themes still get through (a midrange deck
 * with lifelink creatures reads as Lifegain), at a low weight.
 */
export const DECK_THEME_SHARE = 0.18;
/** From this share up the list is plainly built around the theme. */
const FULL_THEME_SHARE = 0.3;
/** A list about everything is about nothing: only the strongest themes are kept. */
export const MAX_DECK_THEMES = 3;
/** Typal tags that name no particular creature type. */
const GENERIC_TYPAL = /^typal-(creature|choose|share|coupling|coupling-distinct|exclusion|each|non-.+)$/;

interface Found extends ProfiledTheme {
  share: number;
}

/**
 * What a list is built around, read from the cards in it.
 *
 * A commander deck's themes come from its commander (`profileCommander`). A
 * list without one says what it is about through the cards that reward a
 * plan: the same signals, counted across the list by copies. The themes that
 * come back want the same cards a commander with that theme would.
 */
export function profileDeckThemes(cards: readonly DeckCardCount[]): ProfiledTheme[] {
  const spells = cards.filter(({ card }) => !isLand(card));
  const copies = spells.reduce((sum, { count }) => sum + count, 0);
  if (copies === 0) return [];
  const tagSets = new Map(spells.map(({ card }) => [card.oracleId, new Set(card.tags)]));

  const found: Found[] = [];
  const typal = typalTheme(spells, copies);
  if (typal) found.push(typal);

  for (const theme of THEMES) {
    let pointing = 0;
    const perSignal = new Map<ThemeSignal, number>();
    for (const { card, count } of spells) {
      const tags = tagSets.get(card.oracleId)!;
      let strength = 0;
      for (const signal of theme.signals) {
        if (!matches(signal, card, tags)) continue;
        strength += signal.weight;
        perSignal.set(signal, (perSignal.get(signal) ?? 0) + count);
      }
      pointing += Math.min(1, strength) * count;
    }
    const share = pointing / copies;
    if (share < DECK_THEME_SHARE) continue;
    // The signal most of the list's cards show says what the list does.
    const [commonest, shown] = [...perSignal].sort((a, b) => b[1] * b[0].weight - a[1] * a[0].weight)[0]!;
    found.push({
      slug: theme.slug,
      name: theme.name,
      description: theme.description,
      weight: Math.min(1, share / FULL_THEME_SHARE),
      because: `${shown} of its cards ${thirdPersonPlural(commonest.says)}`,
      wants: theme.wants,
      share,
    });
  }

  return found
    .sort((a, b) => b.share - a.share)
    .slice(0, MAX_DECK_THEMES)
    .map(({ share: _share, ...theme }) => theme);
}

/** `rewards sacrifices` → `reward sacrifices`: a signal's phrase is written for one commander. */
function thirdPersonPlural(says: string): string {
  const [verb, ...rest] = says.split(' ');
  if (!verb) return says;
  // "passes" and "taxes" lose two letters; "increases" and "uses" lose one.
  const plural = verb === 'has' ? 'have' : verb.endsWith('ies') ? `${verb.slice(0, -3)}y` : /(ss|x|ch|sh|zz)es$/.test(verb) ? verb.slice(0, -2) : verb.replace(/s$/, '');
  return [plural, ...rest].join(' ');
}

function typalTheme(spells: readonly DeckCardCount[], copies: number): Found | undefined {
  // Copies of cards that care about each creature type, by Tagger's tag for it.
  const caring = new Map<string, number>();
  for (const { card, count } of spells) {
    for (const tag of card.tags) {
      if (tag.startsWith('typal-') && !GENERIC_TYPAL.test(tag)) caring.set(tag, (caring.get(tag) ?? 0) + count);
    }
  }
  const [tag, count] = [...caring].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? [];
  if (!tag || !count || count / copies < DECK_THEME_SHARE) return undefined;

  const slug = tag.slice('typal-'.length);
  const names = [...(TYPE_BATCHES[slug] ?? [titleFromSlug(slug)])];
  const plurals = names.map(pluralType);
  const share = count / copies;
  return {
    ...TYPAL,
    name: `${joinWords(names)} Typal`,
    weight: Math.min(1, share / FULL_THEME_SHARE),
    because: `${count} of its cards care about ${joinWords(plurals)}`,
    creatureTypes: names,
    wants: names.flatMap((name, i) => typalWants(tag, name, plurals[i]!)),
    share,
  };
}

export interface ThemeFit {
  /** 0..1: how much the list's themes want the card. */
  fit: number;
  /** The theme that wants it most, and why. Absent when none does. */
  theme?: ProfiledTheme;
  want?: ThemeWant;
}

/**
 * How well one card serves a list's themes. Within a theme the strongest want
 * counts; across themes the values combine as independent chances, the same
 * arithmetic `scoreFor` uses for a commander.
 */
export function themeFit(themes: readonly ProfiledTheme[], card: IndexedCard): ThemeFit {
  const tags = new Set(card.tags);
  let miss = 1;
  let top: { theme: ProfiledTheme; want: ThemeWant; value: number } | undefined;
  for (const theme of themes) {
    let best: ThemeWant | undefined;
    for (const want of theme.wants) {
      if ((!best || want.weight > best.weight) && matches(want, card, tags)) best = want;
    }
    if (!best) continue;
    const value = theme.weight * best.weight;
    miss *= 1 - value;
    if (!top || value > top.value) top = { theme, want: best, value };
  }
  return top ? { fit: 1 - miss, theme: top.theme, want: top.want } : { fit: 0 };
}

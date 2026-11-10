/**
 * Archetype detection: a port of the matching rules of
 * Badaro/MTGOArchetypeParser (MIT) as its shipped settings run them
 * (conflicts resolved towards the simpler rule).
 *
 * Deliberate differences, all cosmetic or more forgiving: card names are
 * compared without case, accents or an appended back face; colour prefixes
 * read `Mono-Red`, `Four-Color`, `Five-Color` and are not repeated when the
 * rule name already starts with them; unmatched lists get a
 * `<Colours> Other` name instead of `Unknown`.
 */
import type { ArchetypeCondition, ArchetypeVariant, ColorTable, FallbackRule, FormatRules } from './archetype-rules';
import { cardKey, frontFaceKey, slugify } from './names';
import type { DeckCardLine, TournamentDeck } from './types';

export type ClassificationKind = 'archetype' | 'fallback' | 'other';

export interface DeckClassification {
  /** Slug of `name`. */
  id: string;
  name: string;
  /** The deck's own colours: WUBRG letters in WUBRG order. */
  colors: string[];
  /** Whether a rule matched, a fallback pile did, or nothing did. */
  kind: ClassificationKind;
}

export interface ClassifyOptions {
  /** A fallback must share more copies than this fraction of the deck's distinct cards (reference default 0.1). */
  minSimilarity?: number;
}

type DeckBoards = Pick<TournamentDeck, 'main' | 'side'>;

interface BoardLine {
  key: string;
  front: string;
  count: number;
}

interface RuleMatch {
  /** The rule that names the deck: the archetype, or its matching variant. */
  rule: ArchetypeVariant;
  /** Number of conditions that had to hold. */
  complexity: number;
}

const WUBRG = ['W', 'U', 'B', 'R', 'G'] as const;

const COLOR_GROUP_NAMES: Readonly<Record<string, string>> = {
  W: 'Mono-White',
  U: 'Mono-Blue',
  B: 'Mono-Black',
  R: 'Mono-Red',
  G: 'Mono-Green',
  WU: 'Azorius',
  WB: 'Orzhov',
  WR: 'Boros',
  WG: 'Selesnya',
  UB: 'Dimir',
  UR: 'Izzet',
  UG: 'Simic',
  BR: 'Rakdos',
  BG: 'Golgari',
  RG: 'Gruul',
  WUB: 'Esper',
  WUR: 'Jeskai',
  WUG: 'Bant',
  WBR: 'Mardu',
  WBG: 'Abzan',
  WRG: 'Naya',
  UBR: 'Grixis',
  UBG: 'Sultai',
  URG: 'Temur',
  BRG: 'Jund',
};

function inWubrgOrder(colors: readonly string[]): string[] {
  return WUBRG.filter((letter) => colors.includes(letter));
}

/** `Izzet`, `Mono-Red`, `Jeskai`, `Four-Color`, `Five-Color`, `Colorless`. */
export function colorGroupName(colors: readonly string[]): string {
  const letters = inWubrgOrder(colors);
  if (letters.length === 0) return 'Colorless';
  if (letters.length === 4) return 'Four-Color';
  if (letters.length === 5) return 'Five-Color';
  return COLOR_GROUP_NAMES[letters.join('')] ?? 'Colorless';
}

function lookupColors(table: Map<string, string>, name: string): string {
  return table.get(cardKey(name)) ?? table.get(frontFaceKey(name)) ?? '';
}

/**
 * A colour counts only when the deck (main and side) has both a land and a
 * non-land card of it, so neither a five-colour land nor an uncastable
 * off-colour card changes the result.
 */
export function deckColors(deck: DeckBoards, table: ColorTable): string[] {
  const inLands = new Set<string>();
  const inSpells = new Set<string>();
  for (const line of [...deck.main, ...deck.side]) {
    if (line.count <= 0) continue;
    for (const letter of lookupColors(table.lands, line.name)) inLands.add(letter);
    for (const letter of lookupColors(table.nonLands, line.name)) inSpells.add(letter);
  }
  return WUBRG.filter((letter) => inLands.has(letter) && inSpells.has(letter));
}

const WORD_BOUNDARY = /(?<=[A-Z])(?=[A-Z][a-z])|(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Za-z])(?=[0-9])/g;

/** Display name of a rule: `NeoformCombo` → `Neoform Combo`, with the colour group in front when the rule asks. */
export function formatArchetypeName(
  ruleName: string,
  includeColorInName: boolean,
  colors: readonly string[],
): string {
  const name = ruleName
    .replace(/Generic/g, '')
    .replace(WORD_BOUNDARY, ' ')
    .split(/\s+/)
    .filter((word) => word !== '')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    // Rules that hard-code their colour write `Mono Red`; one spelling keeps them with the prefixed names.
    .replace(/\bMono (White|Blue|Black|Red|Green)\b/g, 'Mono-$1');
  // A colourless deck gets no prefix, as in the reference parser.
  if (!includeColorInName || colors.length === 0) return name;
  const group = colorGroupName(colors);
  // Some rules ask for the prefix and also carry it in their name (`Temur Battlecrier`).
  if (`${name} `.toLowerCase().startsWith(`${group} `.toLowerCase())) return name;
  return name === '' ? group : `${group} ${name}`;
}

function classification(name: string, colors: readonly string[], kind: ClassificationKind): DeckClassification {
  return { id: slugify(name), name, colors: inWubrgOrder(colors), kind };
}

/** The bucket for lists no rule or fallback matches: `Izzet Other`, `Mono-Red Other`, `Colorless Other`. */
export function otherClassification(colors: readonly string[]): DeckClassification {
  return classification(`${colorGroupName(colors)} Other`, colors, 'other');
}

function toBoard(lines: readonly DeckCardLine[]): BoardLine[] {
  const byKey = new Map<string, BoardLine>();
  for (const line of lines) {
    if (line.count <= 0) continue;
    const key = cardKey(line.name);
    const existing = byKey.get(key);
    if (existing) existing.count += line.count;
    else byKey.set(key, { key, front: frontFaceKey(line.name), count: line.count });
  }
  return [...byKey.values()];
}

function matching(board: readonly BoardLine[], keys: ReadonlySet<string>): BoardLine[] {
  return board.filter((line) => keys.has(line.key) || keys.has(line.front));
}

function conditionHolds(
  condition: ArchetypeCondition,
  main: readonly BoardLine[],
  side: readonly BoardLine[],
): boolean {
  // The reference parser skips a condition without cards instead of failing the rule.
  if (condition.cards.length === 0) return true;
  const inMain = matching(main, condition.keys).length;
  const inSide = matching(side, condition.keys).length;
  switch (condition.type) {
    case 'InMainboard':
    case 'OneOrMoreInMainboard':
      return inMain >= 1;
    case 'InSideboard':
    case 'OneOrMoreInSideboard':
      return inSide >= 1;
    case 'InMainOrSideboard':
    case 'OneOrMoreInMainOrSideboard':
      return inMain + inSide >= 1;
    case 'TwoOrMoreInMainboard':
      return inMain >= 2;
    case 'TwoOrMoreInSideboard':
      return inSide >= 2;
    case 'TwoOrMoreInMainOrSideboard':
      return inMain + inSide >= 2;
    case 'DoesNotContain':
      return inMain + inSide === 0;
    case 'DoesNotContainMainboard':
      return inMain === 0;
    case 'DoesNotContainSideboard':
      return inSide === 0;
  }
}

function ruleHolds(rule: ArchetypeVariant, main: readonly BoardLine[], side: readonly BoardLine[]): boolean {
  return rule.conditions.every((condition) => conditionHolds(condition, main, side));
}

function simplestMatch(
  rules: FormatRules,
  main: readonly BoardLine[],
  side: readonly BoardLine[],
): ArchetypeVariant | undefined {
  const matches: RuleMatch[] = [];
  for (const archetype of rules.archetypes) {
    if (!ruleHolds(archetype, main, side)) continue;
    const variants = archetype.variants.filter((variant) => ruleHolds(variant, main, side));
    if (variants.length === 0) matches.push({ rule: archetype, complexity: archetype.conditions.length });
    for (const variant of variants) {
      matches.push({ rule: variant, complexity: archetype.conditions.length + variant.conditions.length });
    }
  }
  // Strictly simpler only: equally simple rules resolve to the first in file order.
  return matches.reduce<RuleMatch | undefined>(
    (best, match) => (best === undefined || match.complexity < best.complexity ? match : best),
    undefined,
  )?.rule;
}

function bestFallback(
  fallbacks: readonly FallbackRule[],
  main: readonly BoardLine[],
  side: readonly BoardLine[],
  minSimilarity: number,
): FallbackRule | undefined {
  const board = [...main, ...side];
  let best: FallbackRule | undefined;
  let bestCopies = 0;
  for (const fallback of fallbacks) {
    const copies = matching(board, fallback.keys).reduce((sum, line) => sum + line.count, 0);
    const smallerPile = best !== undefined && fallback.commonCards.length < best.commonCards.length;
    if (copies > bestCopies || (copies > 0 && copies === bestCopies && smallerPile)) {
      best = fallback;
      bestCopies = copies;
    }
  }
  // The reference divides shared copies by the number of distinct cards, not by deck size.
  return best !== undefined && bestCopies / board.length > minSimilarity ? best : undefined;
}

/** Names a list: the simplest matching archetype rule, else the closest fallback pile, else `<Colours> Other`. */
export function classifyDeck(deck: DeckBoards, rules: FormatRules, options: ClassifyOptions = {}): DeckClassification {
  const colors = deckColors(deck, rules.colors);
  const main = toBoard(deck.main);
  const side = toBoard(deck.side);

  const rule = simplestMatch(rules, main, side);
  if (rule) return classification(formatArchetypeName(rule.name, rule.includeColorInName, colors), colors, 'archetype');

  const fallback = bestFallback(rules.fallbacks, main, side, options.minSimilarity ?? 0.1);
  if (fallback) {
    return classification(formatArchetypeName(fallback.name, fallback.includeColorInName, colors), colors, 'fallback');
  }
  return otherClassification(colors);
}

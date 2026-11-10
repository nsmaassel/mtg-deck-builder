/**
 * Loader for the community archetype definitions (MTGOFormatData layout).
 *
 * The semantics are a port of Badaro/MTGOArchetypeParser (MIT), which is what
 * the rule authors test their files against. The rule data itself is read at
 * build time and never copied into this repository.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cardKey, frontFaceKey } from './names';
import type { MetaFormat } from './types';

export const CONDITION_TYPES = [
  'InMainboard',
  'InSideboard',
  'InMainOrSideboard',
  'OneOrMoreInMainboard',
  'OneOrMoreInSideboard',
  'OneOrMoreInMainOrSideboard',
  'TwoOrMoreInMainboard',
  'TwoOrMoreInSideboard',
  'TwoOrMoreInMainOrSideboard',
  'DoesNotContain',
  'DoesNotContainMainboard',
  'DoesNotContainSideboard',
] as const;

export type ConditionType = (typeof CONDITION_TYPES)[number];

// The reference parser reads only `Cards[0]` for these types, and rule authors
// rely on that: extra cards in such a condition are ignored.
const SINGLE_CARD_TYPES: ReadonlySet<ConditionType> = new Set<ConditionType>([
  'InMainboard',
  'InSideboard',
  'InMainOrSideboard',
  'DoesNotContain',
  'DoesNotContainMainboard',
  'DoesNotContainSideboard',
]);

export interface ArchetypeCondition {
  type: ConditionType;
  /** Card names as written in the rule file. */
  cards: string[];
  /** Comparison keys of the cards the condition tests. */
  keys: ReadonlySet<string>;
}

export interface ArchetypeVariant {
  name: string;
  includeColorInName: boolean;
  conditions: ArchetypeCondition[];
}

export interface ArchetypeRule extends ArchetypeVariant {
  /** Checked only once the archetype itself matches; a matching variant's name replaces the archetype's. */
  variants: ArchetypeVariant[];
}

/** A "pile": lists no archetype matches are tagged by overlap with these cards. */
export interface FallbackRule {
  name: string;
  includeColorInName: boolean;
  commonCards: string[];
  keys: ReadonlySet<string>;
}

/** Card key → colour letters in WUBRG order (empty for colourless). */
export interface ColorTable {
  lands: Map<string, string>;
  nonLands: Map<string, string>;
}

export interface FormatRules {
  /** In file-name order, which is the order ties between equally simple matches are resolved in. */
  archetypes: ArchetypeRule[];
  fallbacks: FallbackRule[];
  colors: ColorTable;
  /** Rule files that could not be used. */
  warnings: string[];
}

function skipComment(text: string, at: number): number {
  if (text[at] !== '/') return at;
  if (text[at + 1] === '/') {
    const end = text.indexOf('\n', at);
    return end === -1 ? text.length : end;
  }
  if (text[at + 1] === '*') {
    const end = text.indexOf('*/', at + 2);
    return end === -1 ? text.length : end + 2;
  }
  return at;
}

function skipTrivia(text: string, from: number): number {
  let at = from;
  for (;;) {
    while (at < text.length && /\s/.test(text[at]!)) at += 1;
    const next = skipComment(text, at);
    if (next === at) return at;
    at = next;
  }
}

/**
 * JSON as Json.NET reads it: the rule files are hand-edited and some carry
 * trailing commas, comments or a byte-order mark that `JSON.parse` rejects.
 */
export function parseLenientJson(text: string): unknown {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  let strict = '';
  let at = 0;
  while (at < source.length) {
    const char = source[at]!;
    if (char === '"') {
      let end = at + 1;
      while (end < source.length && source[end] !== '"') end += source[end] === '\\' ? 2 : 1;
      strict += source.slice(at, end + 1);
      at = end + 1;
      continue;
    }
    const afterComment = skipComment(source, at);
    if (afterComment !== at) {
      at = afterComment;
      continue;
    }
    if (char === ',') {
      const next = source[skipTrivia(source, at + 1)];
      if (next === '}' || next === ']') {
        at += 1;
        continue;
      }
    }
    strict += char;
    at += 1;
  }
  return JSON.parse(strict);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Json.NET binds property names case-insensitively, so `name` and `Name` are the same field. */
function field(record: Record<string, unknown>, name: string): unknown {
  if (name in record) return record[name];
  const wanted = name.toLowerCase();
  const key = Object.keys(record).find((k) => k.toLowerCase() === wanted);
  return key === undefined ? undefined : record[key];
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function requiredName(record: Record<string, unknown>): string {
  const name = field(record, 'Name');
  if (typeof name !== 'string' || name.trim() === '') throw new Error('rule has no name');
  return name;
}

function cardKeys(cards: string[]): Set<string> {
  const keys = new Set<string>();
  for (const card of cards) {
    keys.add(cardKey(card));
    keys.add(frontFaceKey(card));
  }
  return keys;
}

function parseCondition(json: unknown): ArchetypeCondition {
  if (!isRecord(json)) throw new Error('condition is not an object');
  const rawType = field(json, 'Type');
  const type =
    typeof rawType === 'string' ? CONDITION_TYPES.find((t) => t.toLowerCase() === rawType.toLowerCase()) : undefined;
  if (type === undefined) throw new Error(`unknown condition type ${JSON.stringify(rawType)}`);
  const cards = stringList(field(json, 'Cards'));
  return { type, cards, keys: cardKeys(SINGLE_CARD_TYPES.has(type) ? cards.slice(0, 1) : cards) };
}

function parseVariant(json: unknown): ArchetypeVariant {
  if (!isRecord(json)) throw new Error('rule is not an object');
  const conditions = field(json, 'Conditions');
  return {
    name: requiredName(json),
    includeColorInName: field(json, 'IncludeColorInName') === true,
    conditions: Array.isArray(conditions) ? conditions.map(parseCondition) : [],
  };
}

export function parseArchetypeRule(json: unknown): ArchetypeRule {
  const base = parseVariant(json);
  // Only the archetype itself needs conditions; a variant without any is a plain rename.
  if (base.conditions.length === 0) throw new Error(`${base.name}: no conditions declared`);
  const variants = isRecord(json) ? field(json, 'Variants') : undefined;
  return { ...base, variants: Array.isArray(variants) ? variants.map(parseVariant) : [] };
}

export function parseFallbackRule(json: unknown): FallbackRule {
  if (!isRecord(json)) throw new Error('rule is not an object');
  const name = requiredName(json);
  const commonCards = stringList(field(json, 'CommonCards'));
  if (commonCards.length === 0) throw new Error(`${name}: no common cards declared`);
  return {
    name,
    includeColorInName: field(json, 'IncludeColorInName') === true,
    commonCards,
    keys: cardKeys(commonCards),
  };
}

function orderedColors(color: string): string {
  const upper = color.toUpperCase();
  return [...'WUBRG'].filter((letter) => upper.includes(letter)).join('');
}

function addColors(target: Map<string, string>, aliases: Map<string, string>, section: unknown): void {
  if (!Array.isArray(section)) return;
  for (const entry of section) {
    if (!isRecord(entry)) continue;
    const name = field(entry, 'Name');
    const color = field(entry, 'Color');
    if (typeof name !== 'string' || typeof color !== 'string') continue;
    const colors = orderedColors(color);
    target.set(cardKey(name), colors);
    if (frontFaceKey(name) !== cardKey(name)) aliases.set(frontFaceKey(name), colors);
  }
}

/** Builds the colour lookup from `card_colors.json` followed by any override files; later files win. */
export function parseColorTable(...files: unknown[]): ColorTable {
  const lands = new Map<string, string>();
  const nonLands = new Map<string, string>();
  const landAliases = new Map<string, string>();
  const nonLandAliases = new Map<string, string>();
  for (const file of files) {
    if (!isRecord(file)) continue;
    addColors(lands, landAliases, field(file, 'Lands'));
    addColors(nonLands, nonLandAliases, field(file, 'NonLands'));
  }
  // A front-face alias must never shadow a real card of that name.
  for (const [key, colors] of landAliases) if (!lands.has(key)) lands.set(key, colors);
  for (const [key, colors] of nonLandAliases) if (!nonLands.has(key)) nonLands.set(key, colors);
  return { lands, nonLands };
}

function readJson(path: string): unknown {
  return parseLenientJson(readFileSync(path, 'utf8'));
}

// The reference parser takes files in directory order, which no file system promises; sorting by
// name makes the order, and with it the outcome of a tie between two rules, the same everywhere.
function byFileName(a: string, b: string): number {
  const [left, right] = [a.toUpperCase(), b.toUpperCase()];
  return left < right ? -1 : left > right ? 1 : 0;
}

function jsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith('.json'))
    .sort(byFileName);
}

function loadRules<T>(dir: string, label: string, parse: (json: unknown) => T, warnings: string[]): T[] {
  const rules: T[] = [];
  for (const name of jsonFiles(dir)) {
    try {
      rules.push(parse(readJson(join(dir, name))));
    } catch (error) {
      warnings.push(`${label}/${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return rules;
}

/**
 * Loads one format's rules from a `Formats` directory:
 * `<Format>/Archetypes/*.json`, `<Format>/Fallbacks/*.json`,
 * `card_colors.json` and `<Format>/color_overrides.json`.
 */
export function loadFormatRules(formatsDir: string, format: MetaFormat): FormatRules {
  const formatDirName = existsSync(formatsDir)
    ? readdirSync(formatsDir).find((name) => name.toLowerCase() === format)
    : undefined;
  if (formatDirName === undefined) throw new Error(`No archetype rules for format "${format}" in ${formatsDir}`);
  const formatDir = join(formatsDir, formatDirName);

  const warnings: string[] = [];
  const colorFiles: unknown[] = [];
  for (const path of [join(formatsDir, 'card_colors.json'), join(formatDir, 'color_overrides.json')]) {
    if (!existsSync(path)) {
      warnings.push(`${path}: missing, deck colours may be incomplete`);
      continue;
    }
    colorFiles.push(readJson(path));
  }

  return {
    archetypes: loadRules(join(formatDir, 'Archetypes'), 'Archetypes', parseArchetypeRule, warnings),
    fallbacks: loadRules(join(formatDir, 'Fallbacks'), 'Fallbacks', parseFallbackRule, warnings),
    colors: parseColorTable(...colorFiles),
    warnings,
  };
}

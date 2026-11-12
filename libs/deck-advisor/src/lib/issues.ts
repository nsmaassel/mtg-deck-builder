import type { CardIndex, Format, IndexedCard } from '@mtg/card-index';
import { FORMAT_RULES } from './formats';
import { deckBoards } from './gap';
import type { DeckLine, DeckList } from './types';

export type DeckIssueKind =
  /** Too few (or, with a commander, the wrong number of) cards. */
  | 'size'
  | 'sideboard'
  /** More copies of a card than the format allows. */
  | 'copies'
  /** Banned or not legal in the format. */
  | 'legality'
  /** Legal in the format but not available on MTG Arena. */
  | 'arena'
  /** A commander format without a commander. */
  | 'commander'
  /** Cards outside the commander's colour identity. */
  | 'identity'
  /** Names that match no card. */
  | 'unknown';

/** Something that stops a list from being a legal deck in its format. */
export interface DeckIssue {
  kind: DeckIssueKind;
  /** One sentence the player can act on. */
  message: string;
  /** The cards it is about. */
  cards: string[];
}

const SIDEBOARD_LIMIT = 15;
const NAMES_SHOWN = 6;
const NUMBER_WORDS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

const total = (lines: DeckLine[]): number => lines.reduce((sum, line) => sum + line.count, 0);

function listed(names: string[]): string {
  const shown = names.slice(0, NAMES_SHOWN).join(', ');
  return names.length > NAMES_SHOWN ? `${shown} and ${names.length - NAMES_SHOWN} more` : shown;
}

/** Copies of a card a deck may hold. A few cards set their own limit in their rules text. */
function copyLimit(card: IndexedCard, formatLimit: number): number {
  if (card.isBasicLand || /a deck can have any number of cards named/i.test(card.oracleText)) return Infinity;
  const upTo = /a deck can have up to (\w+) cards named/i.exec(card.oracleText);
  return (upTo && NUMBER_WORDS[upTo[1]!.toLowerCase()]) || formatLimit;
}

/**
 * What stops a list from being a legal deck in its format: size, copy limits,
 * legality, Arena availability, and the commander rules. The collection plays
 * no part in it.
 */
export function deckIssues(deck: DeckList, format: Format, index: CardIndex): DeckIssue[] {
  const rules = FORMAT_RULES[format];
  const issues: DeckIssue[] = [];
  const main = total(deck.main);
  const commanders = total(deck.commander);

  if (rules.hasCommander) {
    if (commanders === 0) {
      issues.push({
        kind: 'commander',
        message: `No commander is marked. Put the commander under a "Commander" line so the rest can be checked against its colours.`,
        cards: [],
      });
    }
    if (main + commanders !== rules.mainDeckSize) {
      issues.push({
        kind: 'size',
        message: `${main + commanders} cards, commander included. A ${rules.label} deck has exactly ${rules.mainDeckSize}.`,
        cards: [],
      });
    }
  } else {
    if (main < rules.mainDeckSize) {
      issues.push({ kind: 'size', message: `${main} cards in the main deck. ${rules.label} needs at least ${rules.mainDeckSize}.`, cards: [] });
    }
    const sideboard = total(deck.sideboard);
    if (sideboard > SIDEBOARD_LIMIT) {
      issues.push({ kind: 'sideboard', message: `${sideboard} cards in the sideboard. The limit is ${SIDEBOARD_LIMIT}.`, cards: [] });
    }
  }

  const copies = new Map<string, { card: IndexedCard; count: number }>();
  const unknown: string[] = [];
  for (const [, lines] of deckBoards(deck)) {
    for (const line of lines) {
      const card = index.byName(line.name);
      if (!card) {
        unknown.push(line.name);
        continue;
      }
      const entry = copies.get(card.oracleId) ?? { card, count: 0 };
      entry.count += line.count;
      copies.set(card.oracleId, entry);
    }
  }
  const cards = [...copies.values()];

  if (unknown.length) {
    const withGuess = unknown.map(name => {
      const [closest] = index.closest(name, 1);
      return closest ? `${name} (closest: ${closest.name})` : name;
    });
    issues.push({ kind: 'unknown', message: `No card matches: ${listed(withGuess)}.`, cards: unknown });
  }

  const banned = cards.filter(({ card }) => card.banned.includes(format)).map(({ card }) => card.name);
  if (banned.length) issues.push({ kind: 'legality', message: `Banned in ${rules.label}: ${listed(banned)}.`, cards: banned });

  const notLegal = cards
    .filter(({ card }) => !card.legal.includes(format) && !card.banned.includes(format))
    .map(({ card }) => card.name);
  if (notLegal.length) issues.push({ kind: 'legality', message: `Not legal in ${rules.label}: ${listed(notLegal)}.`, cards: notLegal });

  if (rules.onArena) {
    const offArena = cards.filter(({ card }) => card.legal.includes(format) && !card.onArena).map(({ card }) => card.name);
    if (offArena.length) issues.push({ kind: 'arena', message: `Not available on MTG Arena: ${listed(offArena)}.`, cards: offArena });
  }

  const over = cards.filter(({ card, count }) => count > copyLimit(card, rules.maxCopies));
  if (over.length) {
    const names = over.map(({ card, count }) => `${card.name} (${count})`);
    issues.push({
      kind: 'copies',
      message: rules.maxCopies === 1
        ? `A ${rules.label} deck plays one copy of each card: ${listed(names)}.`
        : `More than ${rules.maxCopies} copies: ${listed(names)}.`,
      cards: over.map(({ card }) => card.name),
    });
  }

  if (rules.hasCommander && commanders > 0) {
    const identity = new Set(deck.commander.flatMap(line => index.byName(line.name)?.colorIdentity ?? []));
    const commanderIds = new Set(deck.commander.map(line => index.byName(line.name)?.oracleId));
    const outside = cards
      .filter(({ card }) => !commanderIds.has(card.oracleId) && card.colorIdentity.some(color => !identity.has(color)))
      .map(({ card }) => card.name);
    if (outside.length) {
      const colors = [...'WUBRG'].filter(color => identity.has(color)).join('') || 'colourless';
      issues.push({
        kind: 'identity',
        message: `Outside the commander's colour identity (${colors}): ${listed(outside)}.`,
        cards: outside,
      });
    }
  }

  return issues;
}

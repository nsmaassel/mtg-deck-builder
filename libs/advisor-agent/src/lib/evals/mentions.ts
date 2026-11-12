import { normalizeCardName, splitFaces } from '@mtg/card-index';
import type { CardIndex, IndexedCard } from '@mtg/card-index';

export interface Mention {
  card: IndexedCard;
  /** The words as they stand in the text. */
  text: string;
}

interface NameEntry {
  card: IndexedCard;
  /** The card's whole name, as opposed to one face or an alias. */
  full: boolean;
  /** The name as the card spells it, capitals included. */
  spelling: string;
}

const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
const BOLD = /(\*\*|__)(.+?)\1/gs;
const SENTENCE_END = /[.!?:]$/;

/**
 * One-word card names that are also everyday game terms ("on Arena", "has
 * Lifelink"). They count as a card only in bold, where a card is clearly meant.
 */
const GAME_TERMS = new Set([
  'arena', 'brawl', 'counterspell', 'desert', 'exile', 'flash', 'flashback', 'library', 'lifelink', 'sacrifice', 'vigilance',
]);

/**
 * Finds the cards a piece of prose names, so an answer can be checked against
 * what the tools returned.
 *
 * Multi-word names are taken wherever they are capitalised as the card spells
 * them, which keeps "The core of the deck" from being read as the card face
 * `The Core`. One-word names
 * are the hard part, since `Opt`, `Shock` and `Consider` are cards and so are
 * the halves of split cards (`Fire`, `Life`, `Turn`): a single word counts only
 * when it is a card's whole name, and either set in bold on its own (a bold
 * deck name such as "Jund Sacrifice" names no card) or capitalised in the
 * middle of a sentence.
 */
export class CardMentions {
  private readonly names = new Map<string, NameEntry>();
  private maxWords = 1;

  constructor(index: CardIndex) {
    const claim = (name: string | undefined, card: IndexedCard, full: boolean) => {
      if (!name) return;
      const key = normalizeCardName(name);
      if (!key || this.names.has(key)) return;
      this.names.set(key, { card, full, spelling: name });
      this.maxWords = Math.max(this.maxWords, key.split(' ').length);
    };
    // Whole names first, so a face or alias never shadows another card's name.
    for (const card of index.all()) claim(card.name, card, true);
    for (const card of index.all()) {
      claim(card.arenaName, card, true);
      for (const face of splitFaces(card.name)) claim(face, card, false);
      for (const alias of card.aliases) claim(alias, card, false);
    }
  }

  /**
   * `loose` takes every capitalised one-word name as well. It is for reading
   * evidence (tool results, the player's own words), where missing a card is
   * the costly mistake; an answer is read strictly, where inventing one is.
   */
  find(text: string, options: { loose?: boolean } = {}): Mention[] {
    const bold = boldSpans(text);
    const words = [...text.matchAll(WORD)].map(match => ({ text: match[0], start: match.index, end: match.index + match[0].length }));
    const mentions: Mention[] = [];

    for (let i = 0; i < words.length; i++) {
      const first = words[i]!;
      if (!/^\p{Lu}/u.test(first.text)) continue;

      // Longest name first: "Sheoldred, the Apocalypse" before "Sheoldred".
      for (let j = Math.min(words.length, i + this.maxWords) - 1; j >= i; j--) {
        const last = words[j]!;
        const span = text.slice(first.start, last.end);
        // Bold markers inside the span belong to the markup, not to a name.
        const entry = this.names.get(normalizeCardName(span.replace(/\*\*|__/g, '')));
        if (!entry) continue;
        if (j === i && !(options.loose ? entry.full : this.singleWordCounts(entry, first, words[i - 1], text, bold))) continue;
        if (j > i && !options.loose && !capitalisedLike(span, entry.spelling)) continue;
        mentions.push({ card: entry.card, text: span });
        i = j;
        break;
      }
    }
    return mentions;
  }

  private singleWordCounts(
    entry: NameEntry,
    word: { text: string; start: number; end: number },
    previous: { end: number } | undefined,
    text: string,
    bold: [number, number][],
  ): boolean {
    if (!entry.full) return false;
    const emphasised = bold.find(([start, end]) => word.start >= start && word.end <= end);
    if (emphasised) {
      // "**Duress**" and "**4x Duress**" name the card; "**Jund Sacrifice**" names a deck.
      const inner = text.slice(emphasised[0] + 2, emphasised[1] - 2).trim().replace(/^\d+x?\s+/i, '');
      return inner === word.text;
    }
    if (!previous || GAME_TERMS.has(word.text.toLowerCase())) return false;
    // Capitalised mid-sentence: whatever lies between it and the previous word ends no sentence and starts no line.
    const gap = text.slice(previous.end, word.start);
    return !gap.includes('\n') && !SENTENCE_END.test(gap.trim());
  }
}

/** True unless a word the card capitalises is written in lower case. Spans that do not line up word for word pass. */
function capitalisedLike(span: string, spelling: string): boolean {
  const written = span.replace(/\*\*|__/g, '').split(/\s+/);
  const named = spelling.split(/\s+/);
  if (written.length !== named.length) return true;
  return named.every((word, i) => !/^\p{Lu}/u.test(word) || /^\p{Lu}/u.test(written[i]!));
}

function boldSpans(text: string): [number, number][] {
  return [...text.matchAll(BOLD)].map(match => [match.index, match.index + match[0].length]);
}

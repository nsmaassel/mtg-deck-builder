import type { DeckList, DeckLine, Board } from './types';

// `4 Lightning Bolt (M21) 161`, `4x Luminarch Aspirant (ZNR) #24 [rare]`, `2 Bonecrusher Giant`
const CARD_LINE = /^(\d+)\s*x?\s+(.+?)(?:\s+\(([A-Za-z0-9]{2,6})\)(?:\s+#?[\w\-★]+)?)?(?:\s+\[[a-z ]+\])?$/i;

const SECTION_HEADERS: Record<string, Board | 'skip'> = {
  deck: 'main',
  main: 'main',
  maindeck: 'main',
  mainboard: 'main',
  sideboard: 'sideboard',
  side: 'sideboard',
  commander: 'commander',
  companion: 'companion',
  about: 'skip',
  maybeboard: 'skip',
};

function addLine(lines: DeckLine[], name: string, count: number): void {
  const existing = lines.find(l => l.name.toLowerCase() === name.toLowerCase());
  if (existing) existing.count += count;
  else lines.push({ name, count });
}

/** A sideboard is at most this many cards. */
const SIDEBOARD_SIZE = 15;
/** The smallest main deck any format plays (Limited). */
const SMALLEST_MAIN_DECK = 40;

const total = (lines: DeckLine[]): number => lines.reduce((sum, line) => sum + line.count, 0);

/**
 * Read a decklist as people paste it: an MTG Arena export with `Deck` /
 * `Sideboard` / `Commander` / `Companion` sections, an MTGO-style list where a
 * blank line starts the sideboard, or `SB:`-prefixed sideboard lines.
 */
export function parseDeckText(text: string): DeckList {
  const deck: DeckList = { commander: [], companion: [], main: [], sideboard: [], unrecognized: [] };
  let board: Board | 'skip' = 'main';
  // Until a section header appears, blank lines split the cards into blocks that are sorted out below.
  let blocks: DeckLine[][] | undefined = [[]];

  const closeBlocks = () => {
    if (!blocks) return;
    const filled = blocks.filter(block => block.length > 0);
    blocks = undefined;
    // An MTGO export is the main deck, a blank line, then the sideboard. Lists grouped by card type
    // use blank lines too, so the last block is a sideboard only if it is the size of one and
    // what comes before it is a whole deck.
    const last = filled.at(-1);
    const before = filled.slice(0, -1).flat();
    const hasSideboard = last !== undefined && filled.length > 1
      && total(last) <= SIDEBOARD_SIZE && total(before) >= SMALLEST_MAIN_DECK;
    for (const line of hasSideboard ? before : filled.flat()) addLine(deck.main, line.name, line.count);
    if (hasSideboard) for (const line of last) addLine(deck.sideboard, line.name, line.count);
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      if (blocks && blocks.at(-1)!.length > 0) blocks.push([]);
      continue;
    }

    // `// Sideboard` is a header in some exports; any other comment is a note.
    const comment = /^(?:\/\/|#)\s*(.*)$/.exec(line);
    const header = SECTION_HEADERS[(comment ? comment[1]! : line).replace(/[:\s]/g, '').toLowerCase()];
    if (header) {
      closeBlocks();
      board = header;
      continue;
    }
    if (comment) continue;

    // Arena's `About` block carries the deck name on a `Name ...` line.
    if (board === 'skip') {
      const name = /^name\s+(.+)$/i.exec(line);
      if (name) deck.name = name[1]!.trim();
      continue;
    }

    const sideboardPrefix = /^sb:\s*/i.exec(line);
    const body = sideboardPrefix ? line.slice(sideboardPrefix[0].length) : line;
    const match = CARD_LINE.exec(body);
    if (!match) {
      deck.unrecognized.push(line);
      continue;
    }

    const count = Number.parseInt(match[1]!, 10);
    const name = match[2]!.trim();
    if (count <= 0 || !name) continue;

    if (sideboardPrefix) addLine(deck.sideboard, name, count);
    else if (blocks) addLine(blocks.at(-1)!, name, count);
    else addLine(deck[board], name, count);
  }

  closeBlocks();
  return deck;
}

/** Write a deck in the text format MTG Arena's "Import" button reads. */
export function formatArenaDeck(deck: Pick<DeckList, 'commander' | 'companion' | 'main' | 'sideboard'>): string {
  const section = (title: string, lines: DeckLine[]): string[] =>
    lines.length ? [title, ...lines.map(l => `${l.count} ${l.name}`), ''] : [];
  return [
    ...section('Commander', deck.commander),
    ...section('Companion', deck.companion),
    ...section('Deck', deck.main),
    ...section('Sideboard', deck.sideboard),
  ].join('\n').trimEnd() + '\n';
}

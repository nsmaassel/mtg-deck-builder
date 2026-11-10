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

/**
 * Read a decklist as people paste it: an MTG Arena export with `Deck` /
 * `Sideboard` / `Commander` / `Companion` sections, an MTGO-style list where a
 * blank line starts the sideboard, or `SB:`-prefixed sideboard lines.
 */
export function parseDeckText(text: string): DeckList {
  const deck: DeckList = { commander: [], companion: [], main: [], sideboard: [], unrecognized: [] };
  let board: Board | 'skip' = 'main';
  let sawHeader = false;
  let sawMainCard = false;
  let blankSinceCard = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      if (sawMainCard) blankSinceCard = true;
      continue;
    }
    if (line.startsWith('//') || line.startsWith('#')) continue;

    const header = SECTION_HEADERS[line.replace(/[:\s]/g, '').toLowerCase()];
    if (header) {
      board = header;
      sawHeader = true;
      blankSinceCard = false;
      continue;
    }

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

    // Without section headers, the first blank line after the main deck starts the sideboard.
    if (!sawHeader && blankSinceCard && board === 'main') board = 'sideboard';
    blankSinceCard = false;

    const count = Number.parseInt(match[1]!, 10);
    const name = match[2]!.trim();
    if (count <= 0 || !name) continue;

    const target: Board = sideboardPrefix ? 'sideboard' : board;
    addLine(deck[target], name, count);
    if (target === 'main') sawMainCard = true;
  }

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

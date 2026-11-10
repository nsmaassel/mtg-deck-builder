import { collectUnrecognized, eachLine, emptyImport, toInteger } from './shared';
import type { CollectionEntry, CollectionImport } from './types';

// Groups: count, name, set, collector number. Covers the Arena export (`4 Name (SET) 161`),
// NthPhantom10's `4x Name (SET) #24 [rare]`, bare `2 Name` and a trailing Moxfield foil mark (`*F*`).
const CARD_LINE_RE =
  /^(\d+)(?:[xX](?=\s))?\s+(.+?)(?:\s+\(([A-Za-z0-9]{2,6})\)(?:\s+#?([\w\-★†]+))?)?(?:\s+\*[A-Za-z]{1,8}\*)?(?:\s+\[[A-Za-z ]{1,24}\])?$/;

// No real card line comes close; the cap keeps the lazy name group from backtracking through junk.
const MAX_CARD_LINE_LENGTH = 300;

const SECTION_HEADER_RE = /^(?:deck|sideboard|commander|companion|about|name(?:\s.*)?)$/i;

// The five header lines NthPhantom10's MTGA-collection-exporter writes above its card list.
const EXPORTER_HEADER_RE = /^(?:MTGA Collection Export$|Exported:|Unique cards:|Total cards:|={4,}$)/i;

/** Parses one card line, or returns null when the line is not one. */
export function parseArenaTextLine(raw: string): CollectionEntry | null {
  if (raw.length > MAX_CARD_LINE_LENGTH * 4) return null;
  const line = raw.replace(/\s+/g, ' ').trim();
  if (line.length > MAX_CARD_LINE_LENGTH) return null;

  const match = CARD_LINE_RE.exec(line);
  if (!match) return null;

  const count = toInteger(match[1]);
  const name = match[2];
  if (count === undefined || name === undefined) return null;

  const entry: CollectionEntry = { count, name };
  if (match[3]) entry.set = match[3];
  if (match[4]) entry.collectorNumber = match[4];
  return entry;
}

export function parseArenaText(input: string): CollectionImport {
  const imp = emptyImport('arena-text');
  const unrecognized = collectUnrecognized();
  let exporterFile = false;

  for (const raw of eachLine(input)) {
    const line = raw.trim();
    if (!line || line.startsWith('//') || line.startsWith('#')) continue;
    if (SECTION_HEADER_RE.test(line)) continue;
    if (EXPORTER_HEADER_RE.test(line)) {
      exporterFile = true;
      continue;
    }
    // The exporter can put indented type and rules text under each card, and wrapped
    // rules text may start with a number ("3 damage to any target").
    if (exporterFile && /^\s/.test(raw)) continue;

    const entry = parseArenaTextLine(line);
    if (!entry) {
      unrecognized.add(line);
    } else if (entry.count > 0) {
      imp.entries.push(entry);
    }
  }

  unrecognized.writeTo(imp);
  if (imp.entries.length === 0) {
    imp.warnings.push('No card lines were found. Each line should look like "4 Lightning Bolt (M21) 161" or "4 Lightning Bolt".');
  }
  return imp;
}

/** True when at least one line of the input is a card line. Stops at the first hit. */
export function hasArenaTextLine(input: string): boolean {
  for (const raw of eachLine(input)) {
    if (parseArenaTextLine(raw)) return true;
  }
  return false;
}

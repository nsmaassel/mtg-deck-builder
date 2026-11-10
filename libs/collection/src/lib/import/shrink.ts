const START_HOOK = '<== StartHook(';
const INVENTORY_KEY = 'InventoryInfo"';

/** The importer falls back to an earlier login when the newest is cut off, so keep a few. */
const LOGINS_TO_KEEP = 3;
const HEADER_BYTES = 4000;

function lineStart(text: string, at: number): number {
  return text.lastIndexOf('\n', at - 1) + 1;
}

function lineEnd(text: string, at: number): number {
  const end = text.indexOf('\n', at);
  return end === -1 ? text.length : end;
}

/**
 * Cut a Player.log down to the lines the importer reads: the header, the last
 * few login snapshots, and inventory updates after them.
 *
 * A Player.log runs to tens of megabytes and names the account. This is what
 * lets a browser send a few hundred kilobytes instead, and nothing else of the
 * session. `importCollection` gives the same result for the shrunk text as for
 * the whole log.
 */
export function shrinkPlayerLog(log: string): string {
  // The header carries the `DETAILED LOGS:` line and the markers that identify the file.
  const header = log.slice(0, lineEnd(log, Math.min(HEADER_BYTES, log.length)));

  const hooks: number[] = [];
  let at = log.lastIndexOf(START_HOOK);
  while (at !== -1 && hooks.length < LOGINS_TO_KEEP) {
    hooks.unshift(at);
    at = at === 0 ? -1 : log.lastIndexOf(START_HOOK, at - 1);
  }
  if (hooks.length === 0) return header;

  const parts = [header];
  let cursor = header.length;
  for (const hook of hooks) {
    const markerEnd = lineEnd(log, hook);
    // The payload is the first non-empty line after the marker.
    let payloadStart = markerEnd + 1;
    while (log[payloadStart] === '\r' || log[payloadStart] === '\n') payloadStart += 1;
    const payloadEnd = lineEnd(log, payloadStart);
    const start = Math.max(lineStart(log, hook), cursor);
    if (payloadEnd > start) parts.push(log.slice(start, payloadEnd));
    cursor = Math.max(cursor, payloadEnd);
  }

  // Event joins and prize claims after the last login carry a newer inventory.
  for (let found = log.indexOf(INVENTORY_KEY, cursor); found !== -1; found = log.indexOf(INVENTORY_KEY, cursor)) {
    const end = lineEnd(log, found);
    parts.push(log.slice(Math.max(lineStart(log, found), cursor), end));
    cursor = end;
  }

  return parts.join('\n');
}

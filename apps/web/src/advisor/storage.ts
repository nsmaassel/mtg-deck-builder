import type { StoredCollection } from './api';

const KEY = 'mtg-advisor:collection:v1';

/** The collection stays in this browser only; the server keeps nothing between requests. */
export function loadCollection(): StoredCollection | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredCollection;
    return parsed && typeof parsed.cards === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function saveCollection(collection: StoredCollection | null): void {
  try {
    if (collection) localStorage.setItem(KEY, JSON.stringify(collection));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage full or disabled: the collection still works for this visit.
  }
}

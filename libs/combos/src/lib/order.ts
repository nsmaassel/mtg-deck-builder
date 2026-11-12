import type { SerializedCombo } from './types';

/** Plain code-unit order: the same on every machine, which `localeCompare` is not. */
export function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Most popular first, then by id, so equally popular combos always come out in the same order. */
export function byRank(a: SerializedCombo, b: SerializedCombo): number {
  return (b.u ?? 0) - (a.u ?? 0) || compareIds(a.i, b.i);
}

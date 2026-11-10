/**
 * Fold a card name to the key used for lookups.
 *
 * Sources disagree on spelling: Arena writes only the front face of a
 * double-faced card, MTGO writes `Fire/Ice`, some exporters write `Fire /// Ice`,
 * rebalanced Alchemy cards carry an `A-` prefix, and accents come and go.
 */
export function normalizeCardName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/^a-(?=\S)/, '')
    .replace(/\s*\/+\s*/g, ' // ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The face names of a `Front // Back` name; a single-faced name yields itself. */
export function splitFaces(name: string): string[] {
  return name.split(/\s+\/\/+\s+/).map(part => part.trim()).filter(Boolean);
}

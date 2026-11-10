const FACE_SEPARATOR = ' // ';

/**
 * `Wax/Wane`, `Wax//Wane`, `Wax /// Wane` and `Wax && Wane` are all the same
 * card; the decklist sources and the rule files disagree on the spelling.
 */
export function normalizeCardName(name: string): string {
  return name
    .replace(/\s*(?:\/+|&&)\s*/g, FACE_SEPARATOR)
    .replace(/\s+/g, ' ')
    .trim();
}

function stripAccents(text: string): string {
  // Decompose, then drop the combining marks: `ó` becomes `o`.
  return text.normalize('NFD').replace(/\p{M}/gu, '');
}

/**
 * Comparison key for a card name. The rule files, mtgo.com lists and melee.gg
 * lists differ in case and accents for the same card, so names are never
 * compared verbatim.
 */
export function cardKey(name: string): string {
  return stripAccents(normalizeCardName(name)).toLowerCase();
}

/** Key of the front face only: melee.gg appends the back face of double-faced cards, mtgo.com does not. */
export function frontFaceKey(name: string): string {
  const key = cardKey(name);
  const cut = key.indexOf(FACE_SEPARATOR);
  return cut === -1 ? key : key.slice(0, cut);
}

export function hasTwoFaces(name: string): boolean {
  return name.includes(FACE_SEPARATOR);
}

export function slugify(name: string): string {
  return stripAccents(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

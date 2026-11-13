/**
 * Known tutors grouped by efficiency tier.
 * Tutors dramatically compress deck variance — their presence raises power level
 * regardless of the specific target.
 *
 * Tier A: Unconditional, low-cost — find any card, minimal downside.
 * Tier B: Conditional or higher cost — find specific card types or cost 3+.
 */
export const TUTORS: {
  tierA: ReadonlySet<string>;
  tierB: ReadonlySet<string>;
} = {
  tierA: new Set([
    'demonic tutor',
    'vampiric tutor',
    'imperial seal',
    'diabolic intent',
    'wishclaw talisman',
    'scheming symmetry',
    'beseech the queen',
    'beseech the mirror',
  ]),
  tierB: new Set([
    'mystical tutor',
    'personal tutor',
    'enlightened tutor',
    'worldly tutor',
    'sylvan tutor',
    'survival of the fittest',
    'diabolic tutor',
    'cruel tutor',
    'rune-scarred demon',
    'razaketh, the foulblooded',
    'lim-dul the necromancer',
    'natural order',
    'chord of calling',
    'eldritch evolution',
    'finale of devastation',
    'fabricate',
    'idyllic tutor',
    'enlightened tutor',
    "rangers' captain",
  ]),
};

export type TutorTier = 'A' | 'B' | null;

/** Returns tutor tier for a card name, or null if not a tutor. */
export function getTutorTier(cardName: string): TutorTier {
  const lower = cardName.toLowerCase();
  if (TUTORS.tierA.has(lower)) return 'A';
  if (TUTORS.tierB.has(lower)) return 'B';
  return null;
}

/** Returns all tutors found in a list of card names, with their tier. */
export function findTutors(cardNames: string[]): Array<{ name: string; tier: TutorTier }> {
  return cardNames
    .map(name => ({ name, tier: getTutorTier(name) }))
    .filter((t): t is { name: string; tier: 'A' | 'B' } => t.tier !== null);
}

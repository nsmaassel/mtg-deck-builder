/**
 * WotC Official Game Changers list — cards flagged as format-warping in casual play.
 * Source: https://commander.wizards.com/en/game-changers (published 2024-03-04)
 *
 * Having ANY of these cards pushes a deck to Bracket 3+.
 * Having 4+ of these cards is a strong Bracket 4 signal.
 * The list is intentionally stable — WotC updates it infrequently.
 *
 * Card names are lowercased for case-insensitive matching.
 */
export const GAME_CHANGERS: ReadonlySet<string> = new Set([
  // Broken mana acceleration
  'jeweled lotus',
  'mana crypt',
  'mox diamond',
  'chrome mox',
  'grim monolith',
  'ancient tomb',
  "gaea's cradle",

  // Combo enablers / win conditions
  "thassa's oracle",
  'demonic consultation',
  'tainted pact',
  'dockside extortionist',
  'underworld breach',

  // Tutors that compress variance to near-zero
  'demonic tutor',
  'vampiric tutor',
  'imperial seal',

  // Free interaction
  'fierce guardianship',
  'deflecting swat',
  'deadly rollick',
  'obscuring haze',
  'flawless maneuver',

  // Mass resource / lockout
  'rhystic study',
  'mystic remora',
  'smothering tithe',
  'trouble in pairs',
  'necropotence',

  // High-powered draw / velocity
  'cyclonic rift',
  'windfall',
  'timetwister',

  // Extra turns (game-warping)
  'time walk',
  'time warp',
  'capture of jingzhou',
  'temporal manipulation',
  'expropriate',

  // Other format-warping staples
  'force of will',
  'mana drain',
  "sensei's divining top",
  'sylvan library',
  'doubling season',
  'craterhoof behemoth',
  'ad nauseam',
]);

/** Returns Game Changers found in a list of card names. */
export function findGameChangers(cardNames: string[]): string[] {
  return cardNames.filter(name => GAME_CHANGERS.has(name.toLowerCase()));
}

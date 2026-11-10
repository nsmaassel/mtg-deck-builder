/**
 * Which Scryfall Tagger tags are kept.
 *
 * Tagger is community-curated and covers far more than gameplay: naming
 * trivia, errata history, printing cycles, design notes. The advisor compares
 * cards by what they do, so anything that is not about function is left out.
 * A rare trivia tag shared by two cards would otherwise look like a strong
 * functional match.
 *
 * Slugs can be renamed upstream. A rename only means the tag comes back, and
 * the index build lists configured slugs it could not find.
 */

/** These tags and everything beneath them, unless a tag is also reachable from a kept root. */
export const NOISE_TAG_ROOTS: readonly string[] = [
  // Names and flavour
  'card-names', 'episode-name', 'vanity-card', 'multi-character-card', 'meme', 'anime', 'scene',
  'the-doctor', 'legends-retold', 'card-game-reference', 'cross-game-card', '40k-model', 'dnd',
  // Printing history, products and design process
  'cycle', 'draft-signpost', 'staple-with-set-s-mechanic', 'commander-set-booster-cards',
  'planeswalker-deck-staples', 'planeswalker-deck-face-card', 'face-commander', 'alt-commander',
  'guest-designer', 'invitational-card', 'great-designer-search-3', 'you-make-the-card',
  'player-spotlight', 'mechanical-foreshadow', 'fulfilled-futureshift', 'playtest-forecast',
  'potentially-black-border', 'un-design', 'unstable-variant', 'power-nine', 'legacy',
  'digital-to-paper', 'digital-replacement', 'paper-compatible', 'front-card', 'helper-card',
  // Rules text history and templating
  'type-errata', 'keyword-errata', 'token-errata', 'day-zero-errata', 'deprecated-card-types',
  'deprecated-mechanics', 'notorious-templating', 'old-banish-templating', 'rules-nightmare',
  'fun-ruling', 'restores-old-rule', 'that-s-how-the-game-works', 'cr-107-3f-x-card',
  'breaks-ktk-morph-rule', 'unnoted-tracked-information', 'noted-tracked-information',
  // Type-line and token trivia
  'mixed-subtypes', 'multiple-species-types', 'four-plus-creature-types', 'class-type-only',
  'no-creature-type', 'no-planeswalker-type', 'token-versions-of-cards', 'has-identical-token',
  'named-token', 'predefined-token', 'unprinted-token', 'phyrexian-token', 'embalm-token',
  'eternalize-token', 'token-without-a-card', 'aesthetic-counter',
  // Opinions about a card rather than what it does
  'weaker-in-singleton-formats', 'stronger-in-singleton-formats', 'uninspired', 'color-break',
  'minigame',
];

/**
 * How a card is cast, costed or templated, as opposed to what it does. Two
 * adventure cards share `castable-from-exile` and nothing else worth knowing.
 * Same rule as the trivia roots: the tag and everything beneath it.
 */
export const STRUCTURAL_TAG_ROOTS: readonly string[] = [
  'castable-from-nonhand', 'unexile', 'exile-self', 'alternative-cost', 'additional-cost',
  'cheaper-than-mv', 'more-expensive-than-mv', 'single-target-instant-sorcery', 'multiple-targets',
  'flavors-of-vanilla', 'indefinite-effect', 'repeatable-crime', 'characteristic-defining-ability',
  'self-replacement-effect', 'inverted-effects', 'offcolor-ability', 'out-of-color-token',
  'modal', 'drawback', 'symmetrical', 'faux-targeting', 'opponent-chooses', 'dilemma',
];

/** These tags only; their children stay (`counterspell` sits under `blue-effect`). */
export const NOISE_TAGS: readonly string[] = [
  'triggered-ability', 'activated-ability',
  'white-effect', 'blue-effect', 'black-effect', 'red-effect', 'green-effect',
];

/** Families of trivia tags that are easier to name by pattern than to list. */
export const NOISE_TAG_PATTERNS: readonly RegExp[] = [
  /^cycle-/,
  /^unique-/,
  /^creature-type-/,
  /-storyline-in-cards$/,
];

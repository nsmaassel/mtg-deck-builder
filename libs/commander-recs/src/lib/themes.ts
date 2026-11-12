import type { ThemeDefinition, ThemeInfo, ThemeWant } from './types';

/**
 * What Commander decks are built around, as data.
 *
 * Each theme says what on a commander switches it on (`signals`) and what it
 * then wants in the 99 (`wants`). Tags are Scryfall Tagger slugs as the card
 * index keeps them; a slug renamed upstream stops matching, nothing worse.
 *
 * Two rules keep the output honest, because the phrases are shown to people:
 * a signal's `says` must be true of every commander its test accepts, and a
 * want's `reason` must be true of every card its test accepts. Keep the
 * phrases as close to the tag's meaning as the words allow.
 *
 * Order matters only for ties: earlier themes win.
 */

/** Signal weights add up; a theme is on from here. */
export const THEME_THRESHOLD = 0.6;

/** A commander with more themes than this keeps the strongest: every extra theme dilutes the list. */
export const MAX_THEMES = 4;

const INSTANT_OR_SORCERY = /\b(Instant|Sorcery)\b/;
const CREATURE = /\bCreature\b/;
/** A creature whose own arrival does something: worth replaying. */
const ENTERS_ABILITY = /\bWhen(ever)? (this creature|[^.\n]{1,40}?) enters\b/;

/** Typal is parametric (one creature type per commander), so its wants are built per profile. */
export const TYPAL: ThemeInfo = {
  slug: 'typal',
  name: 'Typal',
  description: 'Build around one creature type and the cards that reward it',
};

/** Tagger batches several creature types under one tag; these are the types behind each. */
export const TYPE_BATCHES: Readonly<Record<string, readonly string[]>> = {
  'goblin-orc': ['Goblin', 'Orc'],
  lupine: ['Wolf', 'Werewolf'],
  outlaw: ['Assassin', 'Mercenary', 'Pirate', 'Rogue', 'Warlock'],
  'multi-sea-monster': ['Kraken', 'Leviathan', 'Octopus', 'Serpent'],
};

/**
 * What a typal commander wants, given a creature type it cares about.
 *
 * `tokensOnly` is for a type the commander makes tokens of without being one
 * itself (Kykar and its Spirits): the cards that reward the type are wanted,
 * every other creature of the type is not.
 */
export function typalWants(tag: string, type: string, plural: string, tokensOnly = false): ThemeWant[] {
  const ofType = new RegExp(`—.*\\b${type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  const payoffs: ThemeWant[] = [
    { tags: [tag], weight: 0.85, reason: `Cares about ${plural}` },
    { tags: ['typal-choose'], weight: 0.7, reason: 'Works for a creature type you choose' },
    { tags: ['typal-share'], weight: 0.6, reason: 'Rewards creatures that share a creature type' },
  ];
  if (tokensOnly) return payoffs;
  return [
    { tags: [tag], type: ofType, weight: 0.9, reason: `${type} that cares about ${plural}` },
    { type: ofType, weight: 0.7, reason: type },
    { keyword: 'Changeling', weight: 0.6, reason: 'Changeling: counts as every creature type' },
    ...payoffs,
  ];
}

export const THEMES: readonly ThemeDefinition[] = [
  {
    slug: 'tokens',
    name: 'Tokens',
    description: 'Go wide with creature tokens and anthems',
    signals: [
      { tags: ['token-doubler', 'token-increaser'], weight: 1, says: 'makes extra tokens' },
      { tags: ['synergy-token', 'synergy-token-creature'], weight: 1, says: 'cares about tokens' },
      { tags: ['creature-count-matters'], weight: 0.6, says: 'counts creatures' },
      { tags: ['creaturefall'], weight: 0.6, says: 'triggers when creatures enter' },
      // Plenty of commanders make a token now and then; alone that is not a token deck.
      { tags: ['repeatable-creature-tokens'], weight: 0.5, says: 'makes creature tokens' },
      { tags: ['anthem', 'power-boost-to-all'], weight: 0.4, says: 'boosts its creatures' },
      { tags: ['exponential'], weight: 0.3, says: 'multiplies what it makes' },
    ],
    wants: [
      { tags: ['token-doubler'], weight: 1, reason: 'Doubles the tokens you make' },
      {
        // Some increasers only count Treasure, Food or Clues.
        tags: ['token-increaser'],
        notTags: ['synergy-treasure', 'synergy-food', 'synergy-clue'],
        weight: 0.9,
        reason: 'Makes extra tokens',
      },
      { tags: ['impact-effect'], weight: 0.9, reason: 'Impact Tremors effect: damage as creatures enter' },
      { tags: ['synergy-token', 'synergy-token-creature'], weight: 0.85, reason: 'Cares about tokens' },
      { tags: ['overrun'], weight: 0.8, reason: 'Overrun effect: a big one-turn pump for attackers' },
      { tags: ['anthem'], weight: 0.75, reason: 'Anthem: a standing boost for creatures' },
      { tags: ['creature-count-matters'], weight: 0.75, reason: 'Counts creatures' },
      { tags: ['repeatable-creature-tokens'], weight: 0.7, reason: 'Makes creature tokens repeatedly' },
      { tags: ['creaturefall'], weight: 0.7, reason: 'Triggers when creatures enter' },
      { tags: ['convoke'], weight: 0.5, reason: 'Convoke: creatures help pay for it' },
      { tags: ['multiple-bodies', 'enters-in-company'], weight: 0.5, reason: 'Makes more than one body' },
    ],
  },
  {
    slug: 'aristocrats',
    name: 'Aristocrats',
    description: 'Sacrifice creatures for value and drain',
    signals: [
      { tags: ['your-sacrifice-matters'], weight: 1, says: 'rewards sacrifices' },
      { tags: ['sacrifice-matters'], notTags: ['opponent-sacrifice-matters'], weight: 1, says: 'rewards sacrifices' },
      { tags: ['blood-artist-ability', 'grave-pact'], weight: 1, says: 'punishes opponents when creatures die' },
      { tags: ['trigger-doubler'], text: /\b(dies|dying)\b/, weight: 1, says: 'doubles death triggers' },
      { tags: ['death-trigger'], notTags: ['death-trigger-self'], weight: 0.7, says: 'has a death trigger' },
      {
        text: /\bWhenever (another|a|one or more)( nontoken| other)? creatures?( tokens?)?( you control)? dies?\b/i,
        weight: 0.7,
        says: 'triggers when creatures die',
      },
      { tags: ['sacrifice-outlet-creature'], weight: 0.6, says: 'sacrifices creatures' },
    ],
    wants: [
      // Tagger's free outlets include ones that only take lands or artifacts.
      { tags: ['free-sacrifice-outlet'], andTags: ['sacrifice-outlet-creature'], weight: 1, reason: 'Free creature sacrifice outlet' },
      { tags: ['blood-artist-ability'], weight: 1, reason: 'Blood Artist effect: drains life as creatures die' },
      { tags: ['grave-pact'], weight: 0.9, reason: 'Makes opponents sacrifice when your creatures die' },
      { tags: ['sacrifice-matters', 'your-sacrifice-matters'], weight: 0.9, reason: 'Rewards sacrifices' },
      { tags: ['sacrifice-outlet-creature'], weight: 0.8, reason: 'Creature sacrifice outlet' },
      { tags: ['death-trigger'], weight: 0.65, reason: 'Has a death trigger' },
      { tags: ['reanimate-self'], type: CREATURE, weight: 0.6, reason: 'Creature that returns itself from the graveyard' },
      { tags: ['splits-on-death', 'leaves-body-behind'], weight: 0.55, reason: 'Leaves a body behind when it dies' },
      { tags: ['repeatable-creature-tokens'], weight: 0.55, reason: 'Makes creature tokens repeatedly' },
      { tags: ['morbid'], weight: 0.5, reason: 'Gets better when a creature has died' },
    ],
  },
  {
    slug: 'reanimator',
    name: 'Reanimator',
    description: 'Fill the graveyard and bring back fatties',
    signals: [
      {
        // Taking what opponents discard or sacrifice is tagged as reanimation and is a different deck.
        tags: ['reanimate-creature', 'mass-reanimation', 'reanimate-permanent', 'reanimate-matters'],
        notTags: ['opponent-discard-matters', 'opponent-sacrifice-matters'],
        weight: 0.9,
        says: 'returns cards from the graveyard to the battlefield',
      },
      {
        tags: ['reanimate'],
        notTags: ['reanimate-self', 'opponent-discard-matters', 'opponent-sacrifice-matters'],
        weight: 0.3,
        says: 'returns cards from the graveyard to the battlefield',
      },
    ],
    wants: [
      {
        tags: ['mass-reanimation'],
        andTags: ['reanimate-creature'],
        weight: 1,
        reason: 'Returns many creatures from the graveyard at once',
      },
      { tags: ['reanimate-creature'], weight: 0.9, reason: 'Puts a creature from a graveyard onto the battlefield' },
      { tags: ['tutor-to-graveyard'], weight: 0.9, reason: 'Searches a card straight into the graveyard' },
      {
        tags: ['reanimate'],
        notTags: ['reanimate-self', 'reanimate-land'],
        weight: 0.6,
        reason: 'Puts a card from a graveyard onto the battlefield',
      },
      { tags: ['mill-self'], weight: 0.6, reason: 'Fills your own graveyard' },
      { tags: ['titan-trigger'], weight: 0.5, reason: 'Has an enters-or-attacks trigger' },
      { tags: ['loot', 'rummage'], weight: 0.5, reason: 'Draws and discards' },
      { type: CREATURE, minCmc: 6, weight: 0.45, reason: 'Creature with mana value 6 or more' },
      { tags: ['discard-outlet'], weight: 0.45, reason: 'Discard outlet' },
    ],
  },
  {
    slug: 'graveyard',
    name: 'Graveyard',
    description: 'Treat the graveyard as a second hand',
    signals: [
      { tags: ['gives-castable-from-graveyard'], weight: 0.9, says: 'lets you play cards from the graveyard' },
      { tags: ['leaving-graveyard-matters'], weight: 0.9, says: 'rewards cards leaving the graveyard' },
      {
        tags: ['cards-in-graveyard-matter', 'card-types-in-graveyard-matter', 'lhurgoyf', 'undergrowth', 'threshold'],
        weight: 0.8,
        says: 'cares about cards in the graveyard',
      },
      { tags: ['mill-self'], weight: 0.6, says: 'fills its own graveyard' },
      { tags: ['recursion', 'regrowth'], weight: 0.3, says: 'gets cards back from the graveyard' },
    ],
    wants: [
      { tags: ['gives-castable-from-graveyard'], weight: 0.8, reason: 'Lets you play cards from the graveyard' },
      { tags: ['mill-self'], weight: 0.75, reason: 'Fills your own graveyard' },
      {
        tags: ['cards-in-graveyard-matter', 'card-types-in-graveyard-matter', 'lhurgoyf', 'undergrowth', 'threshold'],
        weight: 0.7,
        reason: 'Cares about cards in the graveyard',
      },
      { tags: ['mulch'], weight: 0.6, reason: 'Puts cards from your library into your graveyard' },
      // Tagger's `recursion-self` includes cards that shuffle themselves away instead of returning.
      { tags: ['regrowth', 'recursion'], notTags: ['recursion-self'], weight: 0.55, reason: 'Gets cards back from the graveyard' },
      { tags: ['activate-from-graveyard', 'reanimate-self'], weight: 0.5, reason: 'Works from the graveyard' },
      { tags: ['graveyard-fuel'], weight: 0.4, reason: 'Uses cards in the graveyard as fuel' },
      { tags: ['discard-outlet'], weight: 0.4, reason: 'Discard outlet' },
    ],
  },
  {
    slug: 'spellslinger',
    name: 'Spellslinger',
    description: 'Cast instants and sorceries for value',
    signals: [
      { tags: ['synergy-instant', 'synergy-sorcery'], weight: 0.9, says: 'cares about instants or sorceries' },
      { tags: ['copy-spell', 'copy-instant', 'copy-sorcery'], weight: 0.7, says: 'copies spells' },
      {
        tags: ['synergy-noncreature', 'prowess-like', 'magecraft', 'storm-count-matters', 'second-spell-matters'],
        weight: 0.7,
        says: 'rewards casting spells',
      },
      {
        tags: ['cost-reducer-instant', 'cost-reducer-sorcery', 'recursion-instant', 'recursion-sorcery'],
        weight: 0.6,
        says: 'makes instants or sorceries cheaper or reusable',
      },
    ],
    wants: [
      { tags: ['synergy-instant', 'synergy-sorcery'], weight: 0.9, reason: 'Cares about instants or sorceries' },
      { tags: ['cost-reducer-instant', 'cost-reducer-sorcery'], weight: 0.85, reason: 'Makes instants or sorceries cheaper' },
      { tags: ['copy-spell', 'copy-instant', 'copy-sorcery'], weight: 0.8, reason: 'Copies spells' },
      {
        tags: ['recursion-instant', 'recursion-sorcery', 'regrowth-instant', 'regrowth-sorcery'],
        weight: 0.75,
        reason: 'Gets instants or sorceries back from the graveyard',
      },
      {
        tags: ['synergy-noncreature', 'prowess-like', 'magecraft', 'storm-count-matters', 'second-spell-matters'],
        weight: 0.7,
        reason: 'Rewards casting spells',
      },
      { tags: ['cantrip'], type: INSTANT_OR_SORCERY, weight: 0.7, reason: 'Cantrip: an instant or sorcery that replaces itself' },
      { type: INSTANT_OR_SORCERY, maxCmc: 2, weight: 0.6, reason: 'Instant or sorcery with mana value 2 or less' },
      { type: INSTANT_OR_SORCERY, maxCmc: 3, weight: 0.45, reason: 'Instant or sorcery with mana value 3' },
      { type: INSTANT_OR_SORCERY, weight: 0.3, reason: 'Instant or sorcery' },
    ],
  },
  {
    slug: 'artifacts',
    name: 'Artifacts',
    description: 'Build an artifact engine to dominate',
    signals: [
      {
        tags: ['artifact-count-matters', 'artifactfall', 'affinity-for-artifacts', 'metalcraft'],
        weight: 1,
        says: 'rewards having artifacts',
      },
      { tags: ['synergy-artifact', 'synergy-artifact-creature'], weight: 0.6, says: 'cares about artifacts' },
      {
        tags: ['recursion-artifact', 'reanimate-artifact', 'tutor-artifact', 'cost-reducer-artifact', 'tap-fuel-artifact'],
        weight: 0.5,
        says: 'works with artifacts',
      },
      { tags: ['repeatable-artifact-tokens'], weight: 0.3, says: 'makes artifact tokens' },
    ],
    wants: [
      { tags: ['artifact-count-matters', 'affinity-for-artifacts', 'metalcraft'], weight: 0.9, reason: 'Rewards having artifacts' },
      { tags: ['artifactfall'], weight: 0.9, reason: 'Triggers when artifacts enter' },
      { tags: ['cost-reducer-artifact'], weight: 0.8, reason: 'Makes artifacts cheaper' },
      { tags: ['synergy-artifact', 'synergy-artifact-creature'], weight: 0.8, reason: 'Cares about artifacts' },
      { tags: ['repeatable-artifact-tokens'], weight: 0.7, reason: 'Makes artifact tokens repeatedly' },
      { tags: ['recursion-artifact', 'regrowth-artifact', 'reanimate-artifact'], weight: 0.7, reason: 'Gets artifacts back from the graveyard' },
      { tags: ['tutor-artifact'], weight: 0.7, reason: 'Searches for an artifact' },
      { type: /\bArtifact\b/, maxCmc: 2, weight: 0.55, reason: 'Artifact with mana value 2 or less' },
      { type: /\bArtifact\b/, weight: 0.4, reason: 'Artifact' },
    ],
  },
  {
    slug: 'enchantress',
    name: 'Enchantress',
    description: 'Draw cards and accrue value from enchantments',
    signals: [
      { tags: ['enchantment-engine', 'enchantmentfall'], weight: 1, says: 'rewards playing enchantments' },
      { tags: ['synergy-enchantment', 'synergy-enchantment-creature'], weight: 0.8, says: 'cares about enchantments' },
      {
        tags: ['recursion-enchantment', 'reanimate-enchantment', 'tutor-enchantment'],
        weight: 0.6,
        says: 'finds or returns enchantments',
      },
    ],
    wants: [
      { tags: ['enchantment-engine'], weight: 1, reason: 'Enchantress effect' },
      { tags: ['enchantmentfall'], weight: 0.9, reason: 'Triggers when enchantments enter' },
      { tags: ['synergy-enchantment', 'synergy-enchantment-creature'], weight: 0.85, reason: 'Cares about enchantments' },
      { tags: ['tutor-enchantment'], weight: 0.75, reason: 'Searches for an enchantment' },
      { tags: ['ethereal-armor'], weight: 0.7, reason: 'Grows with the enchantments you control' },
      {
        tags: ['recursion-enchantment', 'regrowth-enchantment', 'reanimate-enchantment'],
        weight: 0.7,
        reason: 'Gets enchantments back from the graveyard',
      },
      { type: /\bEnchantment\b/, maxCmc: 2, weight: 0.55, reason: 'Enchantment with mana value 2 or less' },
      { type: /\bEnchantment\b/, weight: 0.4, reason: 'Enchantment' },
    ],
  },
  {
    slug: 'voltron',
    name: 'Voltron',
    description: 'Stack equipment and auras on your commander',
    signals: [
      {
        tags: ['synergy-equipment', 'quick-equip', 'tutor-artifact-equipment', 'cost-reducer-equip-ability'],
        weight: 0.9,
        says: 'works with Equipment',
      },
      { tags: ['synergy-aura', 'tutor-enchantment-aura'], weight: 0.9, says: 'works with Auras' },
      { tags: ['synergy-modified'], weight: 0.7, says: 'rewards modified creatures' },
      { tags: ['synergy-solo-attack'], weight: 0.6, says: 'rewards a creature attacking alone' },
    ],
    wants: [
      { tags: ['synergy-equipment'], weight: 0.85, reason: 'Cares about Equipment' },
      { tags: ['synergy-aura'], weight: 0.85, reason: 'Cares about Auras' },
      { tags: ['tutor-artifact-equipment'], weight: 0.8, reason: 'Searches for Equipment' },
      { tags: ['tutor-enchantment-aura'], weight: 0.8, reason: 'Searches for an Aura' },
      { tags: ['quick-equip', 'auto-equip', 'cost-reducer-equip-ability'], weight: 0.8, reason: 'Attaches Equipment faster or cheaper' },
      { type: /\bEquipment\b/, weight: 0.7, reason: 'Equipment' },
      { tags: ['synergy-modified'], weight: 0.7, reason: 'Rewards modified creatures' },
      {
        // Auras meant for an opponent's creature are removal, not something to suit up with.
        type: /\bAura\b/,
        text: /\bEnchant creature\b/,
        notTags: ['removal', 'pacifism', 'lockdown', 'parasitic-aura', 'theft', 'tapper'],
        weight: 0.65,
        reason: 'Aura for a creature',
      },
      { tags: ['gives-double-strike'], weight: 0.55, reason: 'Gives double strike' },
      { tags: ['protects-creature'], weight: 0.5, reason: 'Protects a creature' },
    ],
  },
  {
    slug: 'control',
    name: 'Control',
    description: 'Counter spells and draw into a winning position',
    signals: [
      { tags: ['counterspell'], weight: 1, says: 'counters spells' },
      {
        // Tagger files ward under `tax`; a creature that is merely hard to target is not a control plan.
        tags: ['tax', 'hatebear', 'prevent-cast', 'prevent-activation', 'cost-increaser'],
        notTags: ['ward'],
        weight: 0.7,
        says: 'taxes or restricts opponents',
      },
      { tags: ['pillowfort', 'tax-attack'], weight: 0.7, says: 'discourages attacks' },
      { tags: ['sweeper'], weight: 0.6, says: 'wipes the board' },
    ],
    wants: [
      { tags: ['counterspell'], weight: 0.8, reason: 'Counterspell' },
      { tags: ['sweeper'], weight: 0.75, reason: 'Board wipe' },
      {
        tags: ['tax', 'hatebear', 'prevent-cast', 'prevent-activation', 'cost-increaser'],
        notTags: ['ward'],
        weight: 0.65,
        reason: 'Taxes or restricts opponents',
      },
      { tags: ['pillowfort', 'tax-attack'], weight: 0.65, reason: 'Discourages attacks' },
      { tags: ['repeatable-removal'], weight: 0.6, reason: 'Repeatable removal' },
      { tags: ['draw-engine'], weight: 0.5, reason: 'Draws cards again and again' },
      { tags: ['spot-removal'], weight: 0.45, reason: 'Spot removal' },
    ],
  },
  {
    slug: 'combo',
    name: 'Combo',
    description: 'Find the pieces and win on the spot: tutors, untappers, alternate win conditions',
    signals: [
      { tags: ['alternate-win-condition'], weight: 1, says: 'can win the game outright' },
      { tags: ['untapper', 'untaps-self', 'extra-untap'], weight: 0.6, says: 'untaps permanents' },
      { tags: ['tutor'], notTags: ['tutor-land'], weight: 0.6, says: 'searches its library' },
      { tags: ['mana-increaser'], weight: 0.6, says: 'makes extra mana' },
    ],
    wants: [
      { tags: ['alternate-win-condition'], weight: 0.8, reason: 'Alternate win condition' },
      { tags: ['tutor'], notTags: ['tutor-land'], weight: 0.75, reason: 'Tutor: searches your library for a card' },
      { tags: ['untapper', 'extra-untap'], weight: 0.6, reason: 'Untaps permanents' },
      { tags: ['adds-multiple-mana', 'ritual', 'mana-increaser'], weight: 0.5, reason: 'Makes mana in bulk' },
      { tags: ['cost-reducer'], weight: 0.5, reason: 'Makes spells cheaper' },
      { tags: ['free-cast-another'], weight: 0.5, reason: 'Casts another spell for free' },
    ],
  },
  {
    slug: 'stompy',
    name: 'Stompy',
    description: 'Play big creatures and win with combat',
    signals: [
      {
        // Crewing a Vehicle counts total power as well, which has nothing to do with big creatures.
        tags: ['power-matters-total', 'greatest-power-matters', 'power-doubler', 'overrun', 'ferocious', 'high-mana-value-matters'],
        notTags: ['crew', 'synergy-low-power'],
        weight: 0.9,
        says: 'rewards big creatures',
      },
      { tags: ['sneak-creature', 'cost-reducer-creature'], weight: 0.5, says: 'gets creatures out for less' },
      { tags: ['gives-trample'], weight: 0.4, says: 'gives trample' },
    ],
    wants: [
      { tags: ['power-doubler'], weight: 0.85, reason: 'Doubles power' },
      { tags: ['overrun'], weight: 0.85, reason: 'Overrun effect: a big one-turn pump for attackers' },
      { tags: ['power-matters-total', 'greatest-power-matters', 'ferocious'], notTags: ['crew'], weight: 0.8, reason: 'Rewards high power' },
      { tags: ['scales-with-power'], weight: 0.6, reason: "Scales with a creature's power" },
      { tags: ['removal-fight', 'one-sided-fight'], weight: 0.6, reason: "Removal that uses your creature's power" },
      { tags: ['sneak-creature'], weight: 0.6, reason: 'Puts creatures onto the battlefield without casting them' },
      { tags: ['cost-reducer-creature'], weight: 0.6, reason: 'Makes creatures cheaper' },
      { tags: ['gives-trample'], weight: 0.55, reason: 'Gives trample' },
      { type: CREATURE, minCmc: 6, weight: 0.5, reason: 'Creature with mana value 6 or more' },
    ],
  },
  {
    slug: 'counters',
    name: '+1/+1 Counters',
    description: 'Grow creatures with +1/+1 counters and the cards that multiply them',
    signals: [
      { tags: ['pp-counters-matter'], weight: 1, says: 'cares about +1/+1 counters' },
      { tags: ['counter-doubler', 'counter-increaser'], weight: 1, says: 'adds extra counters' },
      { tags: ['gives-pp-counters-to-all'], weight: 0.6, says: 'puts +1/+1 counters on many creatures at once' },
      { tags: ['gives-pp-counters'], notTags: ['gives-pp-counters-to-all'], weight: 0.5, says: 'puts +1/+1 counters on creatures' },
      { tags: ['move-counters', 'keyword-counter', 'synergy-modified'], weight: 0.4, says: 'works with counters' },
    ],
    wants: [
      { tags: ['counter-doubler', 'counter-increaser'], weight: 1, reason: 'Adds extra counters' },
      { tags: ['pp-counters-matter'], weight: 0.9, reason: 'Cares about +1/+1 counters' },
      { tags: ['gives-pp-counters-to-all'], weight: 0.8, reason: 'Puts +1/+1 counters on many creatures at once' },
      { tags: ['repeatable-proliferate', 'pseudo-proliferate'], weight: 0.75, reason: 'Adds more of the counters already there' },
      { tags: ['gives-pp-counters'], weight: 0.55, reason: 'Puts +1/+1 counters on creatures' },
      { tags: ['move-counters'], weight: 0.5, reason: 'Moves counters' },
      { tags: ['gains-pp-counters'], weight: 0.3, reason: 'Grows with +1/+1 counters' },
    ],
  },
  {
    slug: 'proliferate',
    name: 'Proliferate',
    description: 'Add counters of every kind: +1/+1, loyalty, poison',
    signals: [
      { tags: ['repeatable-proliferate', 'synergy-proliferate'], weight: 1, says: 'proliferates' },
      { keyword: 'Proliferate', weight: 0.6, says: 'proliferates' },
    ],
    wants: [
      { tags: ['repeatable-proliferate'], weight: 0.9, reason: 'Proliferates repeatedly' },
      { tags: ['counter-doubler', 'counter-increaser'], weight: 0.85, reason: 'Adds extra counters' },
      { keyword: 'Proliferate', weight: 0.75, reason: 'Proliferates' },
      { type: /\bPlaneswalker\b/, weight: 0.6, reason: 'Planeswalker with loyalty counters' },
      { tags: ['poison-mechanics'], weight: 0.6, reason: 'Uses poison counters' },
      { tags: ['gives-pp-counters-to-all'], weight: 0.6, reason: 'Puts +1/+1 counters on many creatures at once' },
      { tags: ['pp-counters-matter', 'keyword-counter'], weight: 0.5, reason: 'Cares about counters on creatures' },
      { tags: ['synergy-planeswalker'], weight: 0.5, reason: 'Cares about planeswalkers' },
    ],
  },
  {
    slug: 'lifegain',
    name: 'Lifegain',
    description: 'Gain life over and over and turn it into an advantage',
    signals: [
      { tags: ['lifegain-matters', 'pridemate', 'lifegain-to-damage'], weight: 1, says: 'rewards gaining life' },
      { tags: ['life-total-matters-self'], weight: 0.6, says: "cares about its controller's life total" },
      { tags: ['drain-life'], weight: 0.3, says: 'drains life' },
      { tags: ['repeatable-lifegain'], weight: 0.25, says: 'gains life repeatedly' },
    ],
    wants: [
      { tags: ['lifegain-to-damage'], weight: 1, reason: 'Turns life gain into damage' },
      { tags: ['lifegain-matters', 'pridemate'], weight: 0.9, reason: 'Rewards gaining life' },
      { tags: ['soul-warden-ability'], weight: 0.8, reason: 'Gains life whenever a creature enters' },
      { tags: ['drain-life'], weight: 0.6, reason: 'Drains life' },
      { tags: ['repeatable-lifegain'], weight: 0.6, reason: 'Gains life repeatedly' },
      { tags: ['life-total-matters-self'], weight: 0.6, reason: 'Cares about your life total' },
    ],
  },
  {
    slug: 'lands',
    name: 'Lands',
    description: 'Landfall, extra land drops and lands back from the graveyard',
    signals: [
      { tags: ['landfall'], weight: 1, says: 'has landfall' },
      {
        tags: ['extra-land', 'play-additional-land', 'recursion-land', 'reanimate-land', 'crucible-of-worlds'],
        weight: 0.7,
        says: 'plays extra lands or replays them',
      },
      {
        tags: ['lands-matter', 'land-count-matters', 'lands-in-graveyard-matter', 'synergy-land-graveyard'],
        weight: 0.7,
        says: 'cares about lands',
      },
    ],
    wants: [
      { tags: ['landfall'], weight: 0.9, reason: 'Landfall' },
      { tags: ['extra-land', 'play-additional-land'], weight: 0.9, reason: 'Lets you play extra lands' },
      {
        tags: ['recursion-land', 'reanimate-land', 'regrowth-land', 'crucible-of-worlds'],
        weight: 0.8,
        reason: 'Gets lands back from the graveyard',
      },
      { tags: ['land-ramp'], weight: 0.7, reason: 'Puts extra lands onto the battlefield' },
      { tags: ['land-count-matters', 'lands-matter'], weight: 0.7, reason: 'Cares about lands' },
      { tags: ['fetchland'], weight: 0.6, reason: 'Fetch land: sacrifices itself to find another land' },
      { tags: ['tutor-land'], weight: 0.5, reason: 'Searches for a land' },
    ],
  },
  {
    slug: 'mill',
    name: 'Mill',
    description: 'Empty libraries into graveyards',
    signals: [
      { tags: ['synergy-mill'], weight: 1, says: 'cares about milling' },
      // Exiling cards from the top of a library is tagged as milling but is a different deck.
      { tags: ['mill-opponent'], notTags: ['mill-exile'], weight: 0.9, says: 'mills opponents' },
      { tags: ['mill-each', 'mill-any'], notTags: ['mill-exile'], weight: 0.5, says: 'mills players' },
    ],
    wants: [
      { tags: ['synergy-mill'], weight: 0.95, reason: 'Cares about milling' },
      { tags: ['mill-opponent'], notTags: ['mill-exile'], weight: 0.85, reason: 'Mills opponents' },
      { tags: ['mill-each', 'mill-any'], notTags: ['mill-exile'], weight: 0.7, reason: 'Mills players' },
      { tags: ['reanimate-from-opponent'], weight: 0.5, reason: "Takes cards from opponents' graveyards" },
    ],
  },
  {
    slug: 'wheels',
    name: 'Wheels & Card Draw',
    description: 'Draw piles of cards, make the table discard and redraw, and get paid for it',
    signals: [
      { tags: ['draw-matters', 'second-draw-matters', 'third-draw-matters'], weight: 1, says: 'rewards drawing cards' },
      { tags: ['draw-hate'], weight: 0.9, says: 'punishes opponents for drawing' },
      { tags: ['wheel', 'force-draw'], weight: 0.7, says: 'makes players draw' },
      {
        tags: ['discard-matters', 'self-discard-matters'],
        notTags: ['opponent-discard-matters'],
        weight: 0.7,
        says: 'rewards discarding',
      },
      { tags: ['hand-size-matters'], weight: 0.5, says: 'cares about hand size' },
    ],
    wants: [
      { tags: ['wheel'], weight: 1, reason: 'Wheel: a hand discarded and drawn anew' },
      { tags: ['draw-matters', 'second-draw-matters', 'third-draw-matters'], weight: 0.9, reason: 'Rewards drawing cards' },
      { tags: ['draw-hate'], weight: 0.85, reason: 'Punishes opponents for drawing' },
      { tags: ['force-draw'], weight: 0.75, reason: 'Makes players draw' },
      { tags: ['discard-matters', 'self-discard-matters'], weight: 0.7, reason: 'Rewards discarding' },
      { tags: ['burst-draw'], weight: 0.6, reason: 'Draws several cards at once' },
      { tags: ['hand-size-increase'], weight: 0.55, reason: 'Raises or removes your maximum hand size' },
      { tags: ['hand-size-matters'], weight: 0.5, reason: 'Cares about hand size' },
      { tags: ['draw-engine'], weight: 0.45, reason: 'Draws cards again and again' },
    ],
  },
  {
    slug: 'blink',
    name: 'Blink',
    description: 'Flicker and replay creatures to reuse what they do on entering',
    signals: [
      { tags: ['flicker', 'flicker-creature'], weight: 1, says: 'flickers permanents' },
      { tags: ['trigger-doubler'], text: /\benter(s|ing)\b/, weight: 1, says: 'doubles triggers from permanents entering' },
      { tags: ['repeatable-rescue'], weight: 0.6, says: 'returns its own permanents to hand' },
    ],
    wants: [
      { tags: ['flicker', 'flicker-creature'], weight: 0.9, reason: 'Flicker effect' },
      { tags: ['trigger-doubler'], text: /\benter(s|ing)\b/, weight: 0.9, reason: 'Doubles triggers from permanents entering' },
      { type: CREATURE, text: ENTERS_ABILITY, weight: 0.55, reason: 'Creature that does something when it enters' },
      { tags: ['rescue-creature'], weight: 0.5, reason: 'Returns a creature to hand to replay' },
      { tags: ['copy-creature'], weight: 0.4, reason: 'Copies a creature' },
    ],
  },
  {
    slug: 'creatures',
    name: 'Creature Engine',
    description: 'Play creature after creature and get paid for each one',
    signals: [
      { tags: ['creature-engine'], weight: 1, says: 'rewards playing creatures' },
      { tags: ['creaturefall'], weight: 0.6, says: 'triggers when creatures enter' },
      { tags: ['cost-reducer-creature'], weight: 0.6, says: 'makes creatures cheaper' },
    ],
    wants: [
      { tags: ['creature-engine'], weight: 0.9, reason: 'Rewards playing creatures' },
      { tags: ['cost-reducer-creature'], weight: 0.75, reason: 'Makes creatures cheaper' },
      { tags: ['creaturefall'], weight: 0.7, reason: 'Triggers when creatures enter' },
      { tags: ['tutor-creature'], weight: 0.6, reason: 'Searches for a creature' },
      { type: CREATURE, text: ENTERS_ABILITY, weight: 0.5, reason: 'Creature that does something when it enters' },
      { type: CREATURE, maxCmc: 2, weight: 0.5, reason: 'Creature with mana value 2 or less' },
      { tags: ['rescue-creature'], weight: 0.5, reason: 'Returns a creature to hand to replay' },
    ],
  },
  {
    slug: 'combat',
    name: 'Combat',
    description: 'Attack every turn and stack up what attacking triggers',
    signals: [
      { tags: ['extra-combat-phase'], weight: 1, says: 'takes extra combat phases' },
      { tags: ['trigger-doubler'], text: /\battack/, weight: 1, says: 'doubles attack triggers' },
      { tags: ['attacking-matters'], weight: 0.7, says: 'rewards attacking' },
    ],
    wants: [
      { tags: ['extra-combat-phase'], weight: 0.9, reason: 'Gives an extra combat phase' },
      { tags: ['attacking-matters'], weight: 0.7, reason: 'Rewards attacking' },
      { tags: ['gives-double-strike'], weight: 0.6, reason: 'Gives double strike' },
      { tags: ['attack-trigger'], weight: 0.55, reason: 'Has an attack trigger' },
      { tags: ['gives-haste'], weight: 0.5, reason: 'Gives haste' },
      { tags: ['anthem'], weight: 0.5, reason: 'Anthem: a standing boost for creatures' },
      { tags: ['saboteur'], weight: 0.45, reason: 'Triggers on combat damage to a player' },
    ],
  },
  {
    slug: 'burn',
    name: 'Burn',
    description: 'Damage from everywhere but combat, multiplied',
    signals: [
      { tags: ['damage-multiplier', 'damage-increaser'], weight: 1, says: 'increases damage' },
      { tags: ['synergy-burn'], weight: 1, says: 'cares about noncombat damage' },
      { tags: ['pinger'], weight: 0.6, says: 'deals damage again and again' },
      { tags: ['group-slug'], weight: 0.3, says: 'hurts every opponent' },
    ],
    wants: [
      { tags: ['damage-multiplier', 'damage-increaser'], weight: 0.9, reason: 'Increases damage' },
      { tags: ['synergy-burn'], weight: 0.85, reason: 'Cares about noncombat damage' },
      { tags: ['impact-effect'], weight: 0.7, reason: 'Impact Tremors effect: damage as creatures enter' },
      { tags: ['pinger'], weight: 0.6, reason: 'Deals damage again and again' },
      { tags: ['group-slug'], weight: 0.55, reason: 'Hurts every opponent' },
    ],
  },
  {
    slug: 'discard',
    name: 'Discard',
    description: 'Empty opposing hands and profit from every card discarded',
    signals: [{ tags: ['opponent-discard-matters'], weight: 1, says: 'rewards making opponents discard' }],
    wants: [
      { tags: ['opponent-discard-matters'], weight: 0.9, reason: 'Rewards making opponents discard' },
      { tags: ['hand-disruption'], weight: 0.75, reason: 'Makes opponents discard' },
      { tags: ['wheel'], weight: 0.6, reason: 'Wheel: a hand discarded and drawn anew' },
    ],
  },
  {
    slug: 'superfriends',
    name: 'Superfriends',
    description: 'Planeswalkers and the cards that protect and power them',
    signals: [{ tags: ['synergy-planeswalker'], weight: 0.9, says: 'cares about planeswalkers' }],
    wants: [
      { tags: ['synergy-planeswalker'], weight: 0.85, reason: 'Cares about planeswalkers' },
      { type: /\bPlaneswalker\b/, weight: 0.7, reason: 'Planeswalker' },
      { tags: ['tutor-planeswalker'], weight: 0.7, reason: 'Searches for a planeswalker' },
      { tags: ['protects-planeswalker'], weight: 0.6, reason: 'Protects planeswalkers' },
      { tags: ['repeatable-proliferate'], weight: 0.6, reason: 'Proliferates repeatedly' },
      { tags: ['pillowfort', 'tax-attack'], weight: 0.5, reason: 'Discourages attacks' },
    ],
  },
  {
    slug: 'legends',
    name: 'Legends',
    description: 'Legendary permanents and the cards that reward them',
    signals: [{ tags: ['synergy-legendary', 'synergy-historic'], weight: 0.9, says: 'cares about legendary or historic cards' }],
    wants: [
      { tags: ['synergy-legendary', 'synergy-historic'], weight: 0.85, reason: 'Cares about legendary or historic cards' },
      { tags: ['tutor-legendary'], weight: 0.7, reason: 'Searches for a legendary card' },
      { type: /\bLegendary\b/, weight: 0.5, reason: 'Legendary' },
    ],
  },
  {
    slug: 'treasures',
    name: 'Treasures',
    description: 'Make Treasure tokens and spend or count them',
    signals: [
      { tags: ['synergy-treasure'], weight: 1, says: 'cares about Treasures' },
      { tags: ['repeatable-treasures'], weight: 0.6, says: 'makes Treasure tokens' },
    ],
    wants: [
      { tags: ['synergy-treasure'], weight: 0.9, reason: 'Cares about Treasures' },
      { tags: ['repeatable-treasures'], weight: 0.75, reason: 'Makes Treasure tokens repeatedly' },
      { tags: ['artifact-count-matters', 'artifactfall'], weight: 0.5, reason: 'Rewards having artifacts' },
    ],
  },
];

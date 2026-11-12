import type { ArchetypeCheck, DeckCardView, DeckCheck, MetaView, SubstituteView } from './api';

const card = (name: string, manaCost: string, arenaRarity: 'common' | 'uncommon' | 'rare' | 'mythic' = 'common') => ({
  oracleId: `id:${name}`, name, manaCost, manaValue: 2, typeLine: 'Creature', colors: ['R'], arenaRarity,
});

export const cyclops: SubstituteView = {
  card: card('Crackling Cyclops', '{2}{R}'),
  source: 'owned',
  score: 0.76,
  quality: 'close',
  available: 4,
  reasons: ['Same job: prowess like, cast trigger you', '1 mana more (3 instead of 2)', 'In 50% of Izzet Prowess main decks'],
};

export const archer: SubstituteView = {
  card: card('Firebrand Archer', '{1}{R}'),
  source: 'craft',
  score: 0.5,
  quality: 'partial',
  available: 4,
  craftRarity: 'common',
  reasons: ['Same job: cast trigger you', 'Costs a common wildcard instead of a rare'],
};

const row = (overrides: Partial<DeckCardView> & { name: string }): DeckCardView => ({
  board: 'main', needed: 4, owned: 4, missing: 0, status: 'owned', substitutes: [],
  card: card(overrides.name, '{1}{R}'), ...overrides,
});

export const incompleteCheck: DeckCheck = {
  format: 'standard',
  archetype: 'Izzet Prowess',
  colors: ['U', 'R'],
  summary: {
    totalCards: 20, ownedCards: 12, completion: 0.6, cost: 7,
    wildcardsNeeded: { common: 0, uncommon: 0, rare: 5, mythic: 1 },
    wildcardsShort: { common: 0, uncommon: 0, rare: 3, mythic: 1 },
    craftable: false,
  },
  cards: [
    row({ name: 'Slickshot Show-Off', owned: 0, missing: 4, status: 'missing', craftRarity: 'rare', substitutes: [cyclops, archer] }),
    row({ name: 'Shock' }),
    row({ name: 'Steam Vents', owned: 3, missing: 1, status: 'partial', craftRarity: 'rare', substitutes: [] }),
    row({ name: 'Hidden Strings', owned: 0, missing: 2, needed: 2, status: 'not-on-arena' }),
    row({ name: 'Negate', board: 'sideboard', needed: 2, owned: 2 }),
    row({ name: 'Sheoldred, the Apocalypse', board: 'sideboard', needed: 1, owned: 0, missing: 1, status: 'missing', craftRarity: 'mythic' }),
  ],
  plan: {
    steps: [
      { action: 'craft', board: 'main', target: 'Steam Vents', count: 1, craftRarity: 'rare', note: 'Worth the wildcard: nothing you own does this job.' },
      { action: 'substitute', board: 'main', target: 'Slickshot Show-Off', count: 4, substitute: cyclops, note: 'Same job: prowess like' },
      { action: 'unfilled', board: 'main', target: 'Hidden Strings', count: 2, note: 'Nothing in your collection does a similar job in these colours.' },
    ],
    arenaText: 'Deck\n4 Shock\n4 Crackling Cyclops\n',
    wildcardsSpent: { common: 0, uncommon: 0, rare: 1, mythic: 0 },
    wildcardsLeft: { common: 10, uncommon: 5, rare: 1, mythic: 0 },
    fidelity: 0.87,
  },
  issues: [],
  unrecognizedLines: [],
};

export const completeCheck: DeckCheck = {
  format: 'standard',
  deckName: 'Mono-Red Burn',
  colors: ['R'],
  summary: { totalCards: 8, ownedCards: 8, completion: 1, cost: 0, craftable: true, wildcardsNeeded: { common: 0, uncommon: 0, rare: 0, mythic: 0 } },
  cards: [row({ name: 'Shock' }), row({ name: 'Mountain' })],
  plan: { steps: [], arenaText: 'Deck\n4 Shock\n4 Mountain\n', wildcardsSpent: { common: 0, uncommon: 0, rare: 0, mythic: 0 }, fidelity: 1 },
  issues: [],
  unrecognizedLines: [],
};

const lists = [
  { player: 'alice', result: '1st Place', event: 'Standard Challenge 32', date: '2026-11-07', uri: 'https://example.test/alice' },
  { player: 'bob', result: '5-0', event: 'Standard League', date: '2026-11-05', uri: 'https://example.test/bob' },
];

export const archetypeCheck: ArchetypeCheck = {
  archetype: {
    id: 'izzet-prowess', name: 'Izzet Prowess', colors: ['U', 'R'], deckCount: 30, metaShare: 0.12, winRate: 0.55, matches: 210,
    cards: [], lists,
  },
  list: lists[0]!,
  check: incompleteCheck,
};

export const metaView: MetaView = {
  format: 'standard',
  generatedAt: '2026-11-09T00:00:00Z',
  from: '2026-10-01',
  to: '2026-11-08',
  eventCount: 40,
  totalDecks: 250,
  minMatchesForWinRate: 50,
  fieldWinRate: 0.556,
  sources: [{ name: 'MTGODecklistCache', url: 'https://example.test/cache', note: 'Community cache of published decklists.' }],
  archetypes: [
    {
      id: 'izzet-prowess', name: 'Izzet Prowess', colors: ['U', 'R'], isOther: false, isFringe: false, deckCount: 30, metaShare: 0.12,
      winRate: 0.55, matches: 210, keyCards: ['Slickshot Show-Off', 'Stormchaser\'s Talent'],
      gap: { totalCards: 75, ownedCards: 60, completion: 0.8, cost: 7, craftable: false,
        wildcardsNeeded: { common: 0, uncommon: 2, rare: 5, mythic: 1 }, wildcardsShort: { common: 0, uncommon: 0, rare: 3, mythic: 1 } },
    },
    {
      id: 'mono-red-aggro', name: 'Mono-Red Aggro', colors: ['R'], isOther: false, isFringe: false, deckCount: 20, metaShare: 0.08,
      matches: 12, keyCards: ['Monastery Swiftspear'],
      gap: { totalCards: 75, ownedCards: 75, completion: 1, cost: 0, craftable: true, wildcardsNeeded: { common: 0, uncommon: 0, rare: 0, mythic: 0 } },
    },
    {
      id: 'jeskai-convoke', name: 'Jeskai Convoke', colors: ['W', 'U', 'R'], isOther: false, isFringe: true, deckCount: 2, metaShare: 0.004,
      matches: 0, keyCards: ['Gleeful Demolition'],
      gap: { totalCards: 75, ownedCards: 70, completion: 0.93, cost: 2, craftable: false, wildcardsNeeded: { common: 0, uncommon: 0, rare: 2, mythic: 0 } },
    },
    {
      id: 'izzet-other', name: 'Izzet Other', colors: ['U', 'R'], isOther: true, isFringe: false, deckCount: 25, metaShare: 0.1,
      matches: 0, keyCards: [],
    },
  ],
};

import type { MtgCard } from '../types';

export const commanderSidar: MtgCard = {
  id: 'c-sidar',
  name: 'Sidar Jabari of Zhalfir',
  manaValue: 4,
  colors: ['W', 'U', 'B'],
  typeLine: 'Legendary Creature — Human Knight',
  oracleText: 'Flying, first strike. Whenever you attack with Knights, loot.',
  priceUsd: 8.5,
  roles: ['synergy', 'draw', 'wincon'],
  embedding: [0.1, 0.8, 0.4, 0.2],
};

export const rhysticStudy: MtgCard = {
  id: 'staple-rhystic',
  name: 'Rhystic Study',
  manaValue: 3,
  colors: ['U'],
  typeLine: 'Enchantment',
  oracleText: 'Whenever an opponent casts a spell, you may draw a card unless they pay 1.',
  priceUsd: 45,
  roles: ['draw'],
  embedding: [0.9, 0.1, 0.85, 0.3],
};

export const mysticRemora: MtgCard = {
  id: 'binder-remora',
  name: 'Mystic Remora',
  manaValue: 1,
  colors: ['U'],
  typeLine: 'Enchantment',
  oracleText: 'Cumulative upkeep 1. Whenever an opponent casts a noncreature spell, draw.',
  priceUsd: 7,
  roles: ['draw'],
  embedding: [0.88, 0.12, 0.82, 0.28],
};

export const fillerKnight: MtgCard = {
  id: 'precon-filler',
  name: 'Vanilla Knight',
  manaValue: 5,
  colors: ['W'],
  typeLine: 'Creature — Knight',
  oracleText: 'Vigilance.',
  priceUsd: 0.1,
  roles: ['synergy'],
  embedding: [0.05, 0.2, 0.1, 0.1],
};

export const ownedVodalian: MtgCard = {
  id: 'binder-vodalian',
  name: 'Vodalian Wave-Knight',
  manaValue: 4,
  colors: ['W', 'U'],
  typeLine: 'Creature — Merfolk Knight',
  oracleText: 'Whenever you draw a card, put a +1/+1 counter on each Knight you control.',
  priceUsd: 2.5,
  roles: ['synergy', 'wincon'],
  embedding: [0.2, 0.75, 0.5, 0.3],
};

export const swordsToPlowshares: MtgCard = {
  id: 'market-swords',
  name: 'Swords to Plowshares',
  manaValue: 1,
  colors: ['W'],
  typeLine: 'Instant',
  oracleText: 'Exile target creature. Its controller gains life equal to its power.',
  priceUsd: 1.75,
  roles: ['removal'],
  embedding: [0.3, 0.1, 0.2, 0.9],
};

export const lightningBolt: MtgCard = {
  id: 'illegal-bolt',
  name: 'Lightning Bolt',
  manaValue: 1,
  colors: ['R'],
  typeLine: 'Instant',
  oracleText: 'Deal 3 damage to any target.',
  priceUsd: 1,
  roles: ['removal'],
  embedding: [0.3, 0.1, 0.2, 0.9],
};

export const dockside: MtgCard = {
  id: 'illegal-dockside',
  name: 'Dockside Extortionist',
  manaValue: 2,
  colors: ['R'],
  typeLine: 'Creature — Goblin',
  oracleText: 'Create Treasure tokens equal to artifacts and enchantments opponents control.',
  priceUsd: 40,
  roles: ['ramp'],
  embedding: [0.4, 0.2, 0.1, 0.1],
};

/** 1 commander + 1 filler + 38 islands + 60 knight spells = 100 */
export function makeHundredCardPrecon(): MtgCard[] {
  return [
    commanderSidar,
    fillerKnight,
    ...Array.from({ length: 38 }, (_, i) => ({
      id: `land-${i}`,
      name: `Island ${i}`,
      manaValue: 0,
      colors: ['U' as const],
      typeLine: 'Basic Land — Island',
      oracleText: '{T}: Add {U}',
      priceUsd: 0.05,
      roles: ['land' as const],
    })),
    ...Array.from({ length: 60 }, (_, i) => ({
      id: `spell-${i}`,
      name: `Knight Spell ${i}`,
      manaValue: 3,
      colors: ['W' as const, 'U' as const],
      typeLine: 'Creature — Knight',
      oracleText: 'Knight synergy text',
      priceUsd: 0.5,
      roles: ['synergy' as const, 'draw' as const],
    })),
  ];
}

import type { CardIndex, Format, Rarity } from '@mtg/card-index';
import type { Collection, Wildcards } from './types';

export type SampleProfile = 'newcomer' | 'regular' | 'veteran';

interface ProfileShape {
  label: string;
  description: string;
  /** Chance of owning a card of each rarity at all. */
  owns: Record<Rarity, number>;
  wildcards: Wildcards;
}

export const SAMPLE_PROFILES: Record<SampleProfile, ProfileShape> = {
  newcomer: {
    label: 'Newcomer',
    description: 'A few months of free play: most commons, half the uncommons, a handful of rares.',
    owns: { common: 0.8, uncommon: 0.5, rare: 0.08, mythic: 0.03 },
    wildcards: { common: 25, uncommon: 15, rare: 4, mythic: 1 },
  },
  regular: {
    label: 'Regular',
    description: 'A year of steady play: nearly all commons and uncommons, about a quarter of the rares.',
    owns: { common: 1, uncommon: 0.85, rare: 0.25, mythic: 0.1 },
    wildcards: { common: 60, uncommon: 35, rare: 8, mythic: 3 },
  },
  veteran: {
    label: 'Veteran',
    description: 'Years of play: everything common and uncommon, most rares, half the mythics.',
    owns: { common: 1, uncommon: 1, rare: 0.7, mythic: 0.5 },
    wildcards: { common: 200, uncommon: 120, rare: 25, mythic: 12 },
  },
};

/** A stable number in [0, 1) from a string, so the same card is always owned or not in a profile. */
function unitHash(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

/**
 * A made-up collection for visitors who have none to hand: cards on Arena
 * that are legal in the format, owned at rates typical of the profile. The
 * same profile always yields the same collection.
 */
export function sampleCollection(index: CardIndex, profile: SampleProfile, format: Format = 'pioneer'): Collection {
  const shape = SAMPLE_PROFILES[profile];
  const owned = new Map<string, number>();
  for (const card of index.all()) {
    if (!card.arenaRarity || card.isBasicLand || !card.legal.includes(format)) continue;
    if (unitHash(`${profile}:${card.oracleId}`) >= shape.owns[card.arenaRarity]) continue;
    const playset = card.arenaRarity === 'common' || card.arenaRarity === 'uncommon';
    // Commons and uncommons pile up to a playset; rares and mythics arrive one at a time.
    owned.set(card.oracleId, playset ? 4 : 1 + Math.floor(unitHash(`copies:${card.oracleId}`) * 4));
  }
  return { owned, wildcards: { ...shape.wildcards } };
}

import type { CardIndex, IndexedCard } from '@mtg/card-index';
import { isBasicLand } from '@mtg/collection';
import type { CollectionMap } from '@mtg/collection';
import { profileCommander, recommend, scoreFor } from '@mtg/commander-recs';
import type { CommanderProfile, Recommendation } from '@mtg/commander-recs';
import { buildDeck } from './builder';
import type { BuildDeckOptions, BuildDeckResult } from './types';

export interface Candidates {
  /** Every card that may go in the 99: the best cards overall plus every owned card that fits. */
  recommendations: Recommendation[];
  /** Oracle ids of the collection's cards. */
  owned: Set<string>;
  /** Collection entries the card index does not know; they cannot be placed. */
  unknownNames: string[];
}

/**
 * The cards a deck for this commander may be built from.
 *
 * The index knows every card, so each owned card is scored on its own merits
 * rather than looked up on a top list: an owned-only build gets the best deck
 * the collection allows. Cards to acquire come from `recommend`; a budget
 * build also asks for the best cards under its ceiling, since the overall best
 * are often the expensive ones. An owned-only build buys nothing and still
 * gets them: they are what the builder measures the collection against.
 */
export function candidatesFor(
  index: CardIndex,
  profile: CommanderProfile,
  collection: CollectionMap,
  options: BuildDeckOptions = {},
): Candidates {
  const byId = new Map<string, Recommendation>();
  const owned = new Set<string>();
  const unknownNames: string[] = [];

  for (const entry of collection.values()) {
    // A parsed collection always lists the basics; the builder adds those by count.
    if (isBasicLand(entry.normalizedName)) continue;
    const card = index.byName(entry.name);
    if (!card) {
      unknownNames.push(entry.name);
      continue;
    }
    owned.add(card.oracleId);
    const recommendation = scoreFor(index, profile, card);
    if (recommendation) byId.set(card.oracleId, recommendation);
  }

  const add = (recommendations: Recommendation[]) => {
    for (const recommendation of recommendations) {
      if (!byId.has(recommendation.oracleId)) byId.set(recommendation.oracleId, recommendation);
    }
  };
  add(recommend(index, profile));
  if (options.mode === 'budget') add(recommend(index, profile, { maxUsd: options.budgetMaxPrice ?? 5 }));

  return { recommendations: [...byId.values()], owned, unknownNames };
}

/** Profile the commander, gather its candidates and build: the whole path from an index to a deck. */
export function buildDeckForCommander(
  index: CardIndex,
  commander: IndexedCard,
  collection: CollectionMap,
  options: BuildDeckOptions = {},
): BuildDeckResult {
  const profile = profileCommander(index, commander);
  const { recommendations, owned } = candidatesFor(index, profile, collection, options);
  return buildDeck({ profile, recommendations, owned, options });
}

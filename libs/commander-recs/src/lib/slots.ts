import type { IndexedCard } from '@mtg/card-index';
import { frontType, isLand } from './match';
import type { RecommendationSlot } from './types';

export interface SlotAssignment {
  slot: RecommendationSlot;
  /** Why the card is in that slot; true of the card whatever the commander. Absent for `synergy`. */
  reason?: string;
}

/** Tags of cards whose job is to end the game, with the phrase each one earns. */
const FINISHERS: ReadonlyArray<readonly [tag: string, reason: string]> = [
  ['alternate-win-condition', 'Alternate win condition'],
  ['overrun', 'Overrun effect: a big one-turn pump for attackers'],
  ['extra-turn', 'Takes an extra turn'],
  ['extra-combat-phase', 'Gives an extra combat phase'],
  ['theft-mass', 'Takes control of many permanents at once'],
  ['damage-multiplier', 'Multiplies damage'],
  ['power-doubler', 'Doubles power'],
];

const INTERACTION: ReadonlyArray<readonly [tag: string, reason: string]> = [
  ['counterspell', 'Counterspell'],
  ['sweeper', 'Board wipe'],
  ['removal', 'Removal'],
  ['protects-all', 'Protects many permanents at once'],
];

const RAMP: ReadonlyArray<readonly [tag: string, reason: string]> = [
  ['mana-rock', 'Mana rock'],
  ['mana-dork', 'Mana creature'],
  ['land-ramp', 'Puts extra lands onto the battlefield'],
  ['ritual', 'Ritual: a one-off burst of mana'],
  ['ramp', 'Ramp'],
  ['cost-reducer', 'Makes spells cheaper'],
];

const DRAW: ReadonlyArray<readonly [tag: string, reason: string]> = [
  ['draw-engine', 'Draws cards again and again'],
  ['draw', 'Card draw'],
  ['impulsive-draw', 'Exiles cards for you to play'],
  ['impulse', 'Card selection: digs for the best card'],
];

function first(table: ReadonlyArray<readonly [string, string]>, tags: ReadonlySet<string>): string | undefined {
  return table.find(([tag]) => tags.has(tag))?.[1];
}

/**
 * The one part of a deck a card fills. Priority, first match wins:
 *
 * 1. `lands`: the front face is a land.
 * 2. `winConditions`: it ends games (alternate wins, overruns, extra turns and
 *    combats, mass theft or reanimation, X spells that hit every opponent).
 * 3. `interaction`: removal, counterspells, sweepers, protection for a whole side.
 *    Before ramp and draw because a removal spell with a rider is still played
 *    as removal: Path to Exile hands an opponent a land and Tagger calls that ramp.
 * 4. `ramp`, then 5. `draw`: a mana rock that can be cashed in for a card is ramp.
 * 6. `winConditions` again for the remaining Game Changers: tutors and other
 *    cards the format singles out as game-warping.
 * 7. `synergy`: everything else.
 */
export function assignSlot(card: IndexedCard, tags: ReadonlySet<string>): SlotAssignment {
  if (isLand(card)) return { slot: 'lands' };

  const finisher = first(FINISHERS, tags);
  if (finisher) return { slot: 'winConditions', reason: finisher };
  if (tags.has('mass-reanimation') && tags.has('reanimate-creature')) {
    return { slot: 'winConditions', reason: 'Returns many creatures from the graveyard at once' };
  }
  if (tags.has('group-slug') && card.manaCost.includes('{X}') && /\b(Instant|Sorcery)\b/.test(frontType(card))) {
    return { slot: 'winConditions', reason: 'X spell that hits every opponent' };
  }

  const interaction = first(INTERACTION, tags);
  if (interaction) return { slot: 'interaction', reason: interaction };
  const ramp = first(RAMP, tags);
  if (ramp) return { slot: 'ramp', reason: ramp };
  const draw = first(DRAW, tags);
  if (draw) return { slot: 'draw', reason: draw };

  if (card.gameChanger) return { slot: 'winConditions', reason: 'On the Commander Game Changers list' };
  return { slot: 'synergy' };
}

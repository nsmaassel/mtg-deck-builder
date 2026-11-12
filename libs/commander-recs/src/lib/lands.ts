import type { IndexedCard } from '@mtg/card-index';
import { joinWords } from './words';

const COLOR_NAMES: Readonly<Record<string, string>> = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' };
const BASIC_TYPE_COLORS: Readonly<Record<string, string>> = { Plains: 'W', Island: 'U', Swamp: 'B', Mountain: 'R', Forest: 'G' };

export interface LandFit {
  /** 0..1: how much of the commander's colour identity the land provides. */
  fit: number;
  /** True of the land whatever the commander. */
  reason: string;
}

/**
 * How well a nonbasic land serves a colour identity.
 *
 * A land that makes every colour the deck plays fits fully, and one that
 * makes two of three most of the way (the square root of the share, since the
 * first colours a land adds matter most). Colourless-only lands cost more the
 * more colours a deck has to find. In a one-colour deck a land whose whole job
 * is fixing does nothing a basic would not, and a land whose coloured mana is
 * only for some spells (`restricted`) is half a land for everything else.
 *
 * `restrictionFits` says the deck is the kind the restriction is for: a typal
 * deck spends Cavern of Souls mana on nearly everything.
 */
export function landFit(
  card: IndexedCard,
  tags: ReadonlySet<string>,
  identity: readonly string[],
  restrictionFits = false,
): LandFit {
  const produced = card.producedMana.filter(color => color in COLOR_NAMES);
  const colors = identity.length;
  const restricted = tags.has('restricted-mana') && !restrictionFits ? 0.5 : 1;

  if (produced.length === 5) {
    const reason = restricted < 1 ? 'Land that makes any colour of mana for some spells' : 'Land that can make any colour of mana';
    return { fit: (colors <= 1 ? 0.3 : 1) * restricted, reason };
  }

  if (produced.length > 0) {
    const usable = produced.filter(color => identity.includes(color));
    const reason = `Land that makes ${joinWords(produced.map(color => COLOR_NAMES[color]!))} mana`;
    if (usable.length === 0) return { fit: 0.1, reason };
    return { fit: Math.sqrt(Math.min(1, usable.length / Math.max(1, colors))) * restricted, reason };
  }

  if (card.producedMana.includes('C')) {
    return { fit: colors === 0 ? 1 : Math.max(0.1, 0.9 - 0.2 * colors), reason: 'Land that makes colourless mana' };
  }

  if (tags.has('fetchland') || tags.has('tutor-land')) {
    const reason = 'Land that searches for another land';
    const named = Object.keys(BASIC_TYPE_COLORS).filter(type => new RegExp(`\\b${type}\\b`).test(card.oracleText));
    const reach = named.length === 0 ? [...identity] : named.map(type => BASIC_TYPE_COLORS[type]!).filter(color => identity.includes(color));
    if (colors <= 1) return { fit: reach.length > 0 || colors === 0 ? 0.4 : 0, reason };
    return { fit: 0.8 * Math.min(1, reach.length / 2), reason };
  }

  return { fit: 0.15, reason: 'Land that makes no mana itself' };
}

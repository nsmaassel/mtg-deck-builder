import type { EDHRecCard } from '@mtg/edhrec';
import type { SlotName } from './types';

const LABEL_TO_SLOT: Record<string, SlotName> = {
  ramp: 'ramp',
  'mana-rock': 'ramp',
  'mana-dork': 'ramp',
  acceleration: 'ramp',
  draw: 'draw',
  'card-draw': 'draw',
  'card draw': 'draw',
  removal: 'interaction',
  interaction: 'interaction',
  counterspell: 'interaction',
  wrath: 'interaction',
  boardwipe: 'interaction',
  'board-wipe': 'interaction',
  land: 'lands',
  lands: 'lands',
  'win-con': 'winConditions',
  wincon: 'winConditions',
  combo: 'winConditions',
  finisher: 'winConditions',
  flex: 'flex',
};

/** Map an EDHRec label to a deck slot. Falls back to 'synergy'. */
export function labelToSlot(label: string): SlotName {
  const normalized = label.toLowerCase().trim();
  return LABEL_TO_SLOT[normalized] ?? 'synergy';
}

/**
 * Score a card for deck inclusion.
 * Formula from spec: score = (inclusion_rate × 0.5) + (synergy_score × 0.3) + (1 - cmc/10) × 0.2
 * Clamped to [0, 1].
 */
export function scoreCard(card: EDHRecCard): number {
  const inclusionNorm = Math.min(card.inclusion, 100) / 100;
  const synergyNorm = (card.synergy + 1) / 2; // synergy is -1 to 1; normalize to 0–1
  const cmcFactor = Math.max(0, 1 - card.cmc / 10);

  return inclusionNorm * 0.5 + synergyNorm * 0.3 + cmcFactor * 0.2;
}

/** Check if a card's color identity is within the commander's color identity. */
export function isColorLegal(
  cardColorIdentity: string[],
  commanderColorIdentity: string[],
): boolean {
  if (cardColorIdentity.length === 0) return true; // Colorless is always legal
  const commanderColors = new Set(commanderColorIdentity);
  return cardColorIdentity.every(color => commanderColors.has(color));
}

/** Build the basic land for a given color. */
export function basicLandForColor(color: string): string {
  const COLOR_TO_BASIC: Record<string, string> = {
    W: 'Plains',
    U: 'Island',
    B: 'Swamp',
    R: 'Mountain',
    G: 'Forest',
  };
  return COLOR_TO_BASIC[color] ?? 'Wastes';
}

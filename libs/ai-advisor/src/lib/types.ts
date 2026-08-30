import type { DeckList } from '@mtg/deck-builder';
import { z } from 'zod';

export type CardColor = 'W' | 'U' | 'B' | 'R' | 'G' | 'C';
export type CardRole = 'ramp' | 'draw' | 'removal' | 'board_wipe' | 'wincon' | 'synergy' | 'land';

export interface MtgCard {
  id: string;
  name: string;
  manaValue: number;
  colors: CardColor[];
  typeLine: string;
  oracleText: string;
  priceUsd: number;
  roles: CardRole[];
  embedding?: number[];
}

export type SwapType = 'binder_free' | 'budget_buy' | 'staple_upgrade';

export interface UpgradeRecommendation {
  cutCard: MtgCard;
  addCard: MtgCard;
  swapType: SwapType;
  synergyScoreDelta: number; // 0.0 to 1.0
  costDeltaUsd: number;
  rationale: string;
}

export interface RoleDistribution {
  ramp: { before: number; after: number };
  draw: { before: number; after: number };
  removal: { before: number; after: number };
  board_wipe: { before: number; after: number };
  wincon: { before: number; after: number };
  land: { before: number; after: number };
}

export interface DeckUpgradeBlueprint {
  commander: string;
  currentTier: number;
  projectedTier: number;
  totalBudgetUsd: number;
  totalSpentUsd: number;
  binderSwaps: UpgradeRecommendation[];
  targetedBuys: UpgradeRecommendation[];
  stapleUpgrades: UpgradeRecommendation[];
  finalDeck: MtgCard[];
  roleDistribution: RoleDistribution;
}

export interface ExplainDeckInput {
  deck: DeckList;
  commanderName: string;
  missingStaples?: Array<{ name: string; wouldFillSlot: string }>;
}

export const ExplainDeckResultSchema = z.object({
  explanation: z.string(),
  keyCards: z.array(z.coerce.string()),
  suggestedUpgrades: z.array(z.coerce.string()),
});

export type ExplainDeckResult = z.infer<typeof ExplainDeckResultSchema>;

export type AiAdvisorProvider = 'anthropic' | 'gemini';

export interface AiAdvisorOptions {
  apiKey?: string;
  baseUrl?: string;
  provider?: AiAdvisorProvider;
}

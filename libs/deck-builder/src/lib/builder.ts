import type { ScryfallCard } from '@mtg/scryfall';
import type { EDHRecCard } from '@mtg/edhrec';
import type { CollectionMap } from '@mtg/collection';
import type {
  BuildDeckInput,
  BuildDeckResult,
  DeckCard,
  DeckList,
  DeckAnalysis,
  GapReport,
  MissingCard,
  SlotName,
} from './types';
import { SLOT_TARGETS, TOTAL_DECK_SIZE } from './types';
import { scoreCard, labelToSlot, isColorLegal, basicLandForColor } from './scoring';

const BASIC_LANDS = new Set(['plains', 'island', 'swamp', 'mountain', 'forest', 'wastes',
  'snow-covered plains', 'snow-covered island', 'snow-covered swamp',
  'snow-covered mountain', 'snow-covered forest']);

export function buildDeck(input: BuildDeckInput): BuildDeckResult {
  const { commanderCard, edhrecCards, collection, collectionScryfallData } = input;
  const mode = input.options?.mode ?? 'prefer-owned';
  const budgetMaxPrice = input.options?.budgetMaxPrice ?? 5;

  const commanderColorIdentity = commanderCard.color_identity;
  const usedNames = new Set<string>([commanderCard.name.toLowerCase()]);

  // Score all EDHRec recommendations and apply mode-specific filtering
  const scoredCards = edhrecCards
    .map(card => {
      const owned = collection.has(card.name.toLowerCase());
      return {
        edhrecCard: card,
        // In owned-only mode, no boost needed (all cards are owned anyway); skip boost to keep scores clean
        score: scoreCard(card, owned && mode !== 'owned-only'),
        slot: labelToSlot(card.label),
        owned,
      };
    })
    .filter(({ edhrecCard, owned }) => {
      const normalizedName = edhrecCard.name.toLowerCase();

      if (mode === 'owned-only') {
        // Strict: only cards in the collection (basics added separately)
        if (!owned && !BASIC_LANDS.has(normalizedName)) return false;
      } else if (mode === 'budget' && !owned) {
        // Budget: unowned cards must have a known price at or below the ceiling
        const sf = collectionScryfallData.get(normalizedName);
        if (sf) {
          const price = sf.prices.usd ? parseFloat(sf.prices.usd) : null;
          if (price === null || price > budgetMaxPrice) return false;
        }
        // No Scryfall data → include speculatively (price unknown)
      }

      // Color-identity check (skip basics; they're added in fillUnderfilled)
      const scryfallData = collectionScryfallData.get(normalizedName);
      if (scryfallData) {
        return isColorLegal(scryfallData.color_identity, commanderColorIdentity);
      }
      return true;
    })
    .sort((a, b) => b.score - a.score);

  // Fill slots in priority order
  const slots: Record<SlotName, DeckCard[]> = {
    ramp: [], draw: [], interaction: [], winConditions: [], synergy: [], lands: [], flex: [],
  };

  for (const { edhrecCard, score, slot } of scoredCards) {
    const normalizedName = edhrecCard.name.toLowerCase();
    if (usedNames.has(normalizedName)) continue;

    const target = SLOT_TARGETS[slot];
    if (slots[slot].length >= target) continue;

    const scryfallData = collectionScryfallData.get(normalizedName);
    const deckCard: DeckCard = {
      name: edhrecCard.name,
      quantity: 1,
      ownedInCollection: collection.has(normalizedName),
      edhrec_inclusion: edhrecCard.inclusion,
      edhrec_synergy: edhrecCard.synergy,
      score,
      slot,
      // Prefer Scryfall CMC (EDHRec cardviews don't include it)
      cmc: scryfallData?.cmc ?? edhrecCard.cmc,
      type_line: scryfallData?.type_line ?? '',
      usdPrice: scryfallData?.prices.usd ? parseFloat(scryfallData.prices.usd) : null,
    };

    slots[slot].push(deckCard);
    usedNames.add(normalizedName);
  }

  // Fill any underfilled slots from 'synergy' overflow, then basics
  fillUnderfilled(slots, scoredCards, usedNames, collectionScryfallData, commanderColorIdentity, collection);

  const commanderDeckCard: DeckCard = {
    name: commanderCard.name,
    quantity: 1,
    ownedInCollection: true,
    edhrec_inclusion: 0,
    edhrec_synergy: 0,
    score: 1,
    slot: 'synergy',
    cmc: commanderCard.cmc,
    type_line: commanderCard.type_line,
    usdPrice: commanderCard.prices.usd ? parseFloat(commanderCard.prices.usd) : null,
  };

  const totalCards = 1 + Object.values(slots).reduce((sum, s) => sum + s.length, 0);

  const deck: DeckList = { commander: commanderDeckCard, slots, totalCards };
  const analysis = analyzeDeck(deck, commanderCard.name, edhrecCards);
  const gaps = buildGapReport(edhrecCards, usedNames, collection, collectionScryfallData, commanderColorIdentity);

  return { deck, analysis, gaps };
}

function fillUnderfilled(
  slots: Record<SlotName, DeckCard[]>,
  scoredCards: Array<{ edhrecCard: EDHRecCard; score: number; slot: SlotName }>,
  usedNames: Set<string>,
  collectionScryfallData: Map<string, ScryfallCard>,
  commanderColorIdentity: string[],
  collection: CollectionMap,
): void {
  const slotOrder: SlotName[] = ['ramp', 'draw', 'interaction', 'winConditions', 'synergy', 'lands', 'flex'];

  // Try to fill from remaining scored cards (any slot)
  for (const slotName of slotOrder) {
    const target = SLOT_TARGETS[slotName];
    if (slots[slotName].length >= target) continue;

    for (const { edhrecCard, score } of scoredCards) {
      if (slots[slotName].length >= target) break;
      const normalizedName = edhrecCard.name.toLowerCase();
      if (usedNames.has(normalizedName)) continue;

      const scryfallData = collectionScryfallData.get(normalizedName);
      if (scryfallData && !isColorLegal(scryfallData.color_identity, commanderColorIdentity)) continue;

      const deckCard: DeckCard = {
        name: edhrecCard.name,
        quantity: 1,
        ownedInCollection: collection.has(normalizedName),
        edhrec_inclusion: edhrecCard.inclusion,
        edhrec_synergy: edhrecCard.synergy,
        score,
        slot: slotName,
        cmc: scryfallData?.cmc ?? edhrecCard.cmc,
        type_line: scryfallData?.type_line ?? '',
        usdPrice: scryfallData?.prices.usd ? parseFloat(scryfallData.prices.usd) : null,
      };

      slots[slotName].push(deckCard);
      usedNames.add(normalizedName);
    }
  }

  // Fill lands with basics if still underfilled
  // Basics are exempt from the singleton rule — multiple copies are legal in Commander
  const landsNeeded = SLOT_TARGETS.lands - slots.lands.length;
  if (landsNeeded > 0) {
    const basicsToAdd = commanderColorIdentity.length > 0
      ? commanderColorIdentity
      : ['W', 'U', 'B', 'R', 'G'];

    let added = 0;
    let colorIndex = 0;
    while (added < landsNeeded) {
      const color = basicsToAdd[colorIndex % basicsToAdd.length]!;
      const basicName = basicLandForColor(color);

      slots.lands.push({
        name: basicName,
        quantity: 1,
        ownedInCollection: true,
        edhrec_inclusion: 0,
        edhrec_synergy: 0,
        score: 0,
        slot: 'lands',
        cmc: 0,
        type_line: 'Basic Land',
        usdPrice: 0,
      });
      added++;
      colorIndex++;
    }
  }
}

function analyzeDeck(deck: DeckList, commanderName: string, edhrecTop50: EDHRecCard[]): DeckAnalysis {
  const allCards = [deck.commander, ...Object.values(deck.slots).flat()];

  const manaCurve: Record<number, number> = {};
  const colorDistribution: Record<string, number> = {};
  let totalCmc = 0;
  let knownCmcCount = 0; // only cards with Scryfall-sourced CMC (excludes EDHRec-only 0-defaults)

  for (const card of allCards) {
    if (card.slot !== 'lands') {
      // R-001: exclude CMC=0 non-land cards from the average — they are almost
      // certainly unowned EDHRec recommendations whose CMC defaulted to 0 because
      // EDHRec's cardview JSON doesn't include the cmc field. Including them would
      // pull the average to near-zero regardless of the actual deck curve.
      const hasCmc = card.cmc > 0;
      if (hasCmc) {
        manaCurve[card.cmc] = (manaCurve[card.cmc] ?? 0) + 1;
        totalCmc += card.cmc;
        knownCmcCount++;
      }
    }
    for (const char of card.type_line) {
      if (['W', 'U', 'B', 'R', 'G'].includes(char)) {
        colorDistribution[char] = (colorDistribution[char] ?? 0) + 1;
      }
    }
  }

  const deckNames = new Set(allCards.map(c => c.name.toLowerCase()));
  const top50 = edhrecTop50.slice(0, 50);
  const owned = top50.filter(c => deckNames.has(c.name.toLowerCase())).length;
  const staplesCoveragePercent = top50.length > 0 ? Math.round((owned / top50.length) * 100) : 0;

  return {
    commanderName,
    manaCurve,
    colorDistribution,
    averageCmc: knownCmcCount > 0 ? Math.round((totalCmc / knownCmcCount) * 100) / 100 : 0,
    staplesCoveragePercent,
  };
}

function buildGapReport(
  edhrecCards: EDHRecCard[],
  usedNames: Set<string>,
  collection: CollectionMap,
  collectionScryfallData: Map<string, ScryfallCard>,
  commanderColorIdentity: string[],
): GapReport {
  // missingStaples = highly-recommended cards IN the deck that the player doesn't own (acquisition list)
  const missing: MissingCard[] = edhrecCards
    .filter(card => {
      const norm = card.name.toLowerCase();
      if (!usedNames.has(norm)) return false; // only cards that made it into the deck
      if (collection.has(norm)) return false; // player already owns it
      const sf = collectionScryfallData.get(norm);
      if (sf && !isColorLegal(sf.color_identity, commanderColorIdentity)) return false;
      return true;
    })
    .sort((a, b) => b.inclusion - a.inclusion)
    .slice(0, 10)
    .map(card => {
      const sf = collectionScryfallData.get(card.name.toLowerCase());
      const price = sf?.prices.usd ? parseFloat(sf.prices.usd) : null;
      return {
        name: card.name,
        edhrec_inclusion: card.inclusion,
        usdPrice: price,
        wouldFillSlot: labelToSlot(card.label),
      };
    });

  return {
    missingStaples: missing,
    budgetUpgrades: missing.filter(c => c.usdPrice !== null && c.usdPrice < 5),
    premiumUpgrades: missing.filter(c => c.usdPrice !== null && c.usdPrice >= 5),
  };
}

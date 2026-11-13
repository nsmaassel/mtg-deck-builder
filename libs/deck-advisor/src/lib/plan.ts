import type { CardIndex, Format, IndexedCard } from '@mtg/card-index';
import type { Combo, ComboIndex } from '@mtg/combos';
import { profileCommander, profileDeckThemes } from '@mtg/commander-recs';
import type { ProfiledTheme } from '@mtg/commander-recs';
import { comboFinishers, comboPhrase, combosInDeck } from './combos';
import { formatArenaDeck } from './deck-text';
import { FORMAT_RULES } from './formats';
import { analyzeGap, deckCopies, emptyWildcards, isLand } from './gap';
import { SubstituteFinder } from './substitutes';
import type { TextModel } from './similarity';
import type {
  ArchetypeUsage,
  Board,
  CardGap,
  Collection,
  DeckLine,
  DeckList,
  DeckPlan,
  PlanStep,
  Substitute,
  Wildcards,
} from './types';

export interface PlanOptions {
  usage?: ArchetypeUsage;
  /**
   * `inventory` (default) crafts the cards that are hardest to replace until
   * the collection's wildcards run out. `none` keeps every wildcard and fills
   * the deck from the collection alone.
   */
  craft?: 'inventory' | 'none';
  /** Owned stand-ins the plan may draw on per missing card. Default 12. */
  candidatesPerCard?: number;
  /** Known combos. With them, a missing combo piece is crafted first and a stand-in that breaks or finishes a combo says so. */
  combos?: ComboIndex;
}

/** Stand-ins of both kinds kept per missing card, for callers that list them. */
const STAND_INS_KEPT = 30;

/** With a stand-in this good already owned, a wildcard is better spent elsewhere. */
const GOOD_ENOUGH_TO_SKIP_CRAFT = 0.8;

const BOARD_WEIGHT: Record<Board, number> = { commander: 3, main: 1, companion: 0.6, sideboard: 0.5 };

/** A combo needs the card itself: no stand-in keeps it, so a missing piece counts for this much more. */
const COMBO_PIECE_WEIGHT = 1.5;

interface Hole {
  gap: CardGap;
  card: IndexedCard;
  /** How much the deck depends on this card, before considering stand-ins. */
  importance: number;
  options: Substitute[];
  left: number;
  /** The most played combo in the list that the missing copies break. */
  combo?: Combo;
  /** True when the player holds the rest of that combo, so this card is all it lacks. */
  comboInReach?: boolean;
}

function importance(gap: CardGap, usage: ArchetypeUsage | undefined): number {
  const weight = BOARD_WEIGHT[gap.board];
  if (!usage) return weight;
  const id = gap.card?.oracleId ?? '';
  const share = gap.board === 'sideboard' ? usage.sideShare(id) : usage.mainShare(id);
  // A card every list plays is core; one a fifth of lists play is a flex slot.
  return weight * (0.4 + 0.6 * share);
}

function craftNote(best: Substitute | undefined, combo: string | undefined): string {
  if (combo) return `Worth the wildcard: it is part of the deck's combo ${combo}, and no other card keeps that.`;
  if (!best) return 'Worth the wildcard: nothing you own does this job.';
  if (best.quality === 'close') return `${best.card.name} would be a close stand-in, but the wildcard is there for the real card.`;
  if (best.quality === 'partial') return `Worth the wildcard: the closest card you own (${best.card.name}) is only a partial match.`;
  return `Worth the wildcard: nothing you own really replaces it (closest: ${best.card.name}).`;
}

function addTo(lines: DeckLine[], name: string, count: number): void {
  const line = lines.find(l => l.name === name);
  if (line) line.count += count;
  else lines.push({ name, count });
}

/**
 * What the list is built around: the commander's themes where there is one,
 * otherwise what the main deck's own cards point at.
 */
function deckThemes(deck: DeckList, index: CardIndex, format: Format): ProfiledTheme[] {
  const commander = FORMAT_RULES[format].hasCommander ? index.byName(deck.commander[0]?.name ?? '') : undefined;
  if (commander) {
    // A commander's `because` completes "a commander that …"; here it has to stand alone.
    return profileCommander(index, commander, { format }).themes.map(theme => ({ ...theme, because: `its commander ${theme.because}` }));
  }
  return profileDeckThemes(
    deck.main.flatMap(line => {
      const card = index.byName(line.name);
      return card ? [{ card, count: line.count }] : [];
    }),
  );
}

/**
 * Turn a decklist the player cannot fully build into one they can: craft what
 * is hardest to replace with the wildcards on hand, and fill the rest with the
 * closest cards they own.
 */
export function planDeck(
  deck: DeckList,
  collection: Collection,
  index: CardIndex,
  format: Format,
  text: TextModel,
  options: PlanOptions = {},
): DeckPlan {
  const rules = FORMAT_RULES[format];
  const gap = analyzeGap(deck, collection, index, format);
  const usage = options.usage;

  // What the player can sleeve up right now; holes are filled below.
  const built: Record<Board, DeckLine[]> = { commander: [], companion: [], main: [], sideboard: [] };
  for (const entry of gap.cards) {
    if (entry.owned > 0 && entry.card) addTo(built[entry.board], entry.card.arenaName ?? entry.card.name, entry.owned);
  }
  // Every copy the list asks for counts against the copy limit, owned or not,
  // or a stand-in could collide with a later craft of the same card.
  const reserved = deckCopies(gap);

  const themes = deckThemes(deck, index, format);
  const combos = options.combos;
  const inDeck = combos ? combosInDeck(deck, format, index, combos) : [];
  // What the player holds of this list already: a stand-in can only finish a combo with those.
  const kept = new Map<string, number>();
  for (const entry of gap.cards) {
    if (entry.card && entry.owned > 0) kept.set(entry.card.oracleId, (kept.get(entry.card.oracleId) ?? 0) + entry.owned);
  }
  const finishesCombo = new Map<string, string>();
  if (combos) {
    for (const [oracleId, combo] of comboFinishers(deck, kept, format, index, combos)) {
      finishesCombo.set(oracleId, `Finishes a combo ${comboPhrase(combo, oracleId, index)}`);
    }
  }

  const finder = new SubstituteFinder({
    index, format, collection, colors: gap.colors, inDeck: reserved, usage, text, themes, finishesCombo,
  });
  const standIns = new Map<CardGap, Substitute[]>();
  const holes: Hole[] = [];
  const steps: PlanStep[] = [];
  for (const entry of gap.cards) {
    if (entry.missing === 0) continue;
    if (!entry.card) {
      steps.push({
        action: 'unfilled', board: entry.board, target: entry.name, count: entry.missing,
        note: 'No card by this name was found, so it cannot be matched or replaced.',
      });
      continue;
    }
    // A commander defines the deck; nothing stands in for it.
    const ranked = entry.board === 'commander' ? [] : finder.suggest(entry.card, { limit: STAND_INS_KEPT });
    standIns.set(entry, ranked);
    const owned = ranked.filter(s => s.source === 'owned').slice(0, options.candidatesPerCard ?? 12);
    const card = entry.card;
    // Only a combo that needs nothing but its named cards: one that also wants "a sacrifice outlet"
    // may not come together in this list, and wildcards are too dear to spend on a maybe.
    // A playset with two copies owned still has its combo: only a combo short of the copies it needs is broken.
    const needs = (c: Combo, id: string) => c.copies?.[id] ?? 1;
    const combo = inDeck.find(
      c => c.requirements.length === 0 && c.cards.includes(card.oracleId) && entry.owned < needs(c, card.oracleId),
    );
    // A wildcard for half a combo is wasted when the other half is missing too.
    const comboInReach = combo?.cards.every(id => id === card.oracleId || (kept.get(id) ?? 0) >= needs(combo, id)) ?? false;
    const hole: Hole = {
      gap: entry, card, importance: importance(entry, usage) * (comboInReach ? COMBO_PIECE_WEIGHT : 1), options: owned, left: entry.missing,
    };
    if (combo) hole.combo = combo;
    if (comboInReach) hole.comboInReach = true;
    holes.push(hole);
  }

  // Crafts go where a wildcard buys the most: important cards with no good stand-in.
  const wildcardsSpent = emptyWildcards();
  const wildcardsLeft = collection.wildcards ? { ...collection.wildcards } : undefined;
  if (wildcardsLeft && rules.onArena && options.craft !== 'none') {
    const craftValue = (hole: Hole) => hole.importance * (hole.comboInReach ? 1 : 1 - (hole.options[0]?.score ?? 0));
    // Copies of a stand-in already counted on to cover one card cannot excuse skipping the craft of another.
    const spoken = new Map<string, number>();
    for (const hole of [...holes].sort((a, b) => craftValue(b) - craftValue(a))) {
      const rarity = hole.gap.craftRarity;
      if (!rarity) continue;
      const best = hole.options[0];
      // However alike a stand-in is, it does not keep a combo.
      if (best && best.score >= GOOD_ENOUGH_TO_SKIP_CRAFT && !hole.comboInReach) {
        const id = best.card.oracleId;
        const free = best.available - (spoken.get(id) ?? 0);
        if (free >= hole.left) {
          spoken.set(id, (spoken.get(id) ?? 0) + hole.left);
          continue;
        }
      }
      const count = Math.min(hole.left, wildcardsLeft[rarity]);
      if (count === 0) continue;
      wildcardsLeft[rarity] -= count;
      wildcardsSpent[rarity] += count;
      hole.left -= count;
      addTo(built[hole.gap.board], hole.card.arenaName ?? hole.card.name, count);
      steps.push({
        action: 'craft', board: hole.gap.board, target: hole.card.name, count, craftRarity: rarity,
        note: craftNote(best, hole.comboInReach && hole.combo ? comboPhrase(hole.combo, hole.card.oracleId, index) : undefined),
      });
    }
  }

  // Fill what is left from the collection, most important card first so it gets first pick.
  const used = new Map<string, number>();
  let substituteScore = 0;
  for (const hole of [...holes].sort((a, b) => b.importance - a.importance)) {
    // Crafts are done by now: a combo counts as lost only while the copies it needs are still not there.
    const have = hole.gap.needed - hole.left;
    const comboLost = hole.combo && have < (hole.combo.copies?.[hole.card.oracleId] ?? 1)
      ? `Without ${hole.card.name} the deck loses its combo ${comboPhrase(hole.combo, hole.card.oracleId, index)}.`
      : undefined;
    for (const option of hole.options) {
      if (hole.left === 0) break;
      const id = option.card.oracleId;
      const free = option.available - (used.get(id) ?? 0);
      if (free < 1) continue;
      const count = Math.min(hole.left, free);
      used.set(id, (used.get(id) ?? 0) + count);
      hole.left -= count;
      substituteScore += option.score * count;
      addTo(built[hole.gap.board], option.card.arenaName ?? option.card.name, count);
      steps.push({
        action: 'substitute', board: hole.gap.board, target: hole.card.name, count, substitute: option,
        note: option.reasons[0] ?? 'Closest card available in your collection.',
        ...(comboLost ? { comboLost } : {}),
      });
    }
    if (hole.left > 0) {
      steps.push({
        action: 'unfilled', board: hole.gap.board, target: hole.card.name, count: hole.left,
        note: hole.gap.board === 'commander'
          ? 'The commander has to be crafted; the deck does not work without it.'
          : isLand(hole.card)
            ? 'No spare land in these colours; add basic lands.'
            : 'Nothing in your collection does a similar job in these colours.',
        ...(comboLost ? { comboLost } : {}),
      });
    }
  }

  // Arena lists a companion under `Companion` and again in the sideboard. The gap counts it once,
  // as a sideboard card; the export names it as the companion again if it made the final sideboard.
  const companions = deck.companion.flatMap(line => {
    const card = index.byName(line.name);
    const name = card ? card.arenaName ?? card.name : line.name;
    const alreadyListed = built.companion.some(l => l.name === name);
    return !alreadyListed && built.sideboard.some(l => l.name === name) ? [{ name, count: 1 }] : [];
  });
  const finalDeck = {
    commander: built.commander,
    companion: [...built.companion, ...companions],
    main: built.main,
    sideboard: built.sideboard,
  };
  const crafted = Object.values(wildcardsSpent).reduce((sum, n) => sum + n, 0);
  const plan: DeckPlan = {
    format,
    gap,
    steps,
    deck: finalDeck,
    arenaText: formatArenaDeck(finalDeck),
    wildcardsSpent,
    fidelity: gap.totalCards > 0 ? (gap.ownedCards + crafted + substituteScore) / gap.totalCards : 0,
    standIns,
    themes: themes.map(({ slug, name, because }) => ({ slug, name, because })),
  };
  if (wildcardsLeft) plan.wildcardsLeft = wildcardsLeft;
  return plan;
}

/** Wildcards weighed by how hard they are to come by, in rare-wildcard equivalents. */
export function craftCost(wildcards: Wildcards): number {
  return wildcards.common * 0.05 + wildcards.uncommon * 0.15 + wildcards.rare + wildcards.mythic * 2;
}

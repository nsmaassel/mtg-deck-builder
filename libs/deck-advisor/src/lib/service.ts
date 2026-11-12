import type { CardIndex, Format, IndexedCard, Rarity } from '@mtg/card-index';
import type { MetaArchetype, MetaSnapshot, TournamentDeck } from '@mtg/meta-decks/types';
import { analyzeGap, isLand } from './gap';
import { deckIssues } from './issues';
import type { DeckIssue } from './issues';
import { craftCost, planDeck } from './plan';
import type { PlanOptions } from './plan';
import type { TextModel } from './similarity';
import { nearestArchetype, tuneDeck } from './tune';
import type { ArchetypeMatch, TuneCard } from './tune';
import type {
  ArchetypeUsage,
  Board,
  CardStatus,
  Collection,
  DeckGap,
  DeckList,
  MatchQuality,
  PlanAction,
  Substitute,
  SubstituteSource,
  Wildcards,
} from './types';

/** Everything the advisor reads: the card pool, its text model, and the meta snapshots on hand. */
export interface AdvisorData {
  index: CardIndex;
  text: TextModel;
  meta: ReadonlyMap<string, MetaSnapshot>;
}

/** A card as the API returns it: enough to show and link, without the rules text. */
export interface CardView {
  oracleId: string;
  name: string;
  manaCost: string;
  manaValue: number;
  typeLine: string;
  colors: string[];
  /** The wildcard a craft costs; absent off Arena. */
  arenaRarity?: Rarity;
}

export interface SubstituteView {
  card: CardView;
  source: SubstituteSource;
  score: number;
  quality: MatchQuality;
  available: number;
  craftRarity?: Rarity;
  reasons: string[];
}

export interface DeckCardView {
  name: string;
  board: Board;
  needed: number;
  owned: number;
  missing: number;
  status: CardStatus;
  craftRarity?: Rarity;
  card?: CardView;
  /** Stand-ins for the missing copies, best first. Empty when nothing is missing. */
  substitutes: SubstituteView[];
}

export interface GapSummary {
  totalCards: number;
  ownedCards: number;
  completion: number;
  wildcardsNeeded: Wildcards;
  wildcardsShort?: Wildcards;
  craftable?: boolean;
  /** `craftCost` of `wildcardsNeeded`: one number to sort decks by. */
  cost: number;
}

export interface PlanStepView {
  action: PlanAction;
  board: Board;
  target: string;
  count: number;
  craftRarity?: Rarity;
  substitute?: SubstituteView;
  note: string;
}

export interface TuneCardView {
  card: CardView;
  /** Share of the archetype's lists that play it on this board (0–1). */
  share: number;
  /** Mean copies among the lists that play it. */
  typicalCopies: number;
  /** Copies in this list, on this board. */
  inDeck: number;
  /** Copies the player owns, up to a playset. */
  owned: number;
  craftRarity?: Rarity;
}

/** A list read against the tournament lists of its archetype. */
export interface DeckTuneView {
  archetypeId: string;
  archetype: string;
  /** Tournament lists the shares are counted over. */
  lists: number;
  /** How closely a pasted list resembles the archetype (0–1). Absent for a list taken from the meta. */
  similarity?: number;
  missingStaples: TuneCardView[];
  unusual: TuneCardView[];
  sideboardStaples: TuneCardView[];
}

export interface DeckCheck {
  format: Format;
  deckName?: string;
  /** The archetype whose lists informed the suggestions, when the deck came from the meta. */
  archetype?: string;
  colors: string[];
  summary: GapSummary;
  /** What stops the list from being a legal deck in the format. Empty when nothing does. */
  issues: DeckIssue[];
  /** The list against its archetype's tournament lists. Absent where the format has no meta or nothing resembles it. */
  tune?: DeckTuneView;
  cards: DeckCardView[];
  plan: {
    steps: PlanStepView[];
    arenaText: string;
    wildcardsSpent: Wildcards;
    wildcardsLeft?: Wildcards;
    fidelity: number;
  };
  unrecognizedLines: string[];
}

export function cardView(card: IndexedCard): CardView {
  const view: CardView = {
    oracleId: card.oracleId,
    name: card.name,
    manaCost: card.manaCost,
    manaValue: card.cmc,
    typeLine: card.typeLine,
    colors: card.colors,
  };
  if (card.arenaRarity) view.arenaRarity = card.arenaRarity;
  return view;
}

function substituteView(substitute: Substitute): SubstituteView {
  const view: SubstituteView = {
    card: cardView(substitute.card),
    source: substitute.source,
    score: Math.round(substitute.score * 100) / 100,
    quality: substitute.quality,
    available: Number.isFinite(substitute.available) ? substitute.available : 99,
    reasons: substitute.reasons,
  };
  if (substitute.craftRarity) view.craftRarity = substitute.craftRarity;
  return view;
}

function tuneCardView(row: TuneCard): TuneCardView {
  const view: TuneCardView = {
    card: cardView(row.card),
    share: Math.round(row.share * 1000) / 1000,
    typicalCopies: Math.round(row.typicalCopies * 10) / 10,
    inDeck: row.inDeck,
    owned: row.owned,
  };
  if (row.craftRarity) view.craftRarity = row.craftRarity;
  return view;
}

export function gapSummary(gap: DeckGap): GapSummary {
  const summary: GapSummary = {
    totalCards: gap.totalCards,
    ownedCards: gap.ownedCards,
    completion: gap.completion,
    wildcardsNeeded: gap.wildcardsNeeded,
    cost: craftCost(gap.wildcardsNeeded),
  };
  if (gap.wildcardsShort) summary.wildcardsShort = gap.wildcardsShort;
  if (gap.craftable !== undefined) summary.craftable = gap.craftable;
  return summary;
}

/** Card usage across an archetype's lists, looked up by oracle id. */
export function archetypeUsage(archetype: MetaArchetype, index: CardIndex): ArchetypeUsage {
  const main = new Map<string, number>();
  const side = new Map<string, number>();
  for (const entry of archetype.cards) {
    const card = index.byName(entry.name);
    if (!card) continue;
    main.set(card.oracleId, entry.mainShare);
    side.set(card.oracleId, entry.sideShare);
  }
  return {
    archetype: archetype.name,
    mainShare: id => main.get(id) ?? 0,
    sideShare: id => side.get(id) ?? 0,
  };
}

export function deckFromTournamentList(list: TournamentDeck, name?: string): DeckList {
  return { name, commander: [], companion: [], main: list.main, sideboard: list.side, unrecognized: [] };
}

export interface CheckDeckOptions {
  /** The meta archetype the deck belongs to; its other lists inform the suggestions. */
  archetype?: MetaArchetype;
  craft?: PlanOptions['craft'];
  /** Stand-ins listed per missing card. Default 5. */
  substitutesPerCard?: number;
}

/**
 * The whole answer for one deck: what is owned, what is missing and what it
 * costs, what could stand in for each missing card, and a list the player can
 * build today.
 */
export function checkDeck(
  deck: DeckList,
  format: Format,
  collection: Collection,
  data: AdvisorData,
  options: CheckDeckOptions = {},
): DeckCheck {
  // A pasted list is read against the archetype it most resembles, when the format has a meta at all.
  const snapshot = data.meta.get(format);
  const match: ArchetypeMatch | undefined = options.archetype
    ? { archetype: options.archetype, similarity: 1 }
    : snapshot && nearestArchetype(deck, snapshot, data.index);
  const usage = match ? archetypeUsage(match.archetype, data.index) : undefined;
  const plan = planDeck(deck, collection, data.index, format, data.text, { usage, craft: options.craft });
  const { gap } = plan;
  const tune = match && tuneDeck(deck, match, collection, data.index);

  const cards: DeckCardView[] = gap.cards.map(entry => {
    const view: DeckCardView = {
      name: entry.name,
      board: entry.board,
      needed: entry.needed,
      owned: entry.owned,
      missing: entry.missing,
      status: entry.status,
      substitutes: [],
    };
    if (entry.craftRarity) view.craftRarity = entry.craftRarity;
    if (entry.card) view.card = cardView(entry.card);
    view.substitutes = (plan.standIns.get(entry) ?? []).slice(0, options.substitutesPerCard ?? 5).map(substituteView);
    return view;
  });

  const check: DeckCheck = {
    format,
    colors: gap.colors,
    summary: gapSummary(gap),
    issues: deckIssues(deck, format, data.index),
    cards,
    plan: {
      steps: plan.steps.map(step => {
        const view: PlanStepView = {
          action: step.action,
          board: step.board,
          target: step.target,
          count: step.count,
          note: step.note,
        };
        if (step.craftRarity) view.craftRarity = step.craftRarity;
        if (step.substitute) view.substitute = substituteView(step.substitute);
        return view;
      }),
      arenaText: plan.arenaText,
      wildcardsSpent: plan.wildcardsSpent,
      fidelity: Math.round(plan.fidelity * 1000) / 1000,
    },
    unrecognizedLines: deck.unrecognized,
  };
  if (deck.name) check.deckName = deck.name;
  if (options.archetype) check.archetype = options.archetype.name;
  if (plan.wildcardsLeft) check.plan.wildcardsLeft = plan.wildcardsLeft;
  if (tune) {
    check.tune = {
      archetypeId: tune.archetype.id,
      archetype: tune.archetype.name,
      lists: tune.archetype.deckCount,
      missingStaples: tune.missingStaples.map(tuneCardView),
      unusual: tune.unusual.map(tuneCardView),
      sideboardStaples: tune.sideboardStaples.map(tuneCardView),
    };
    if (!options.archetype) check.tune.similarity = Math.round(tune.similarity * 100) / 100;
  }
  return check;
}

/** Archetypes under this share of the meta are a handful of lists: shown on request, not by default. */
const FRINGE_SHARE = 0.01;

export interface ArchetypeView {
  id: string;
  name: string;
  colors: string[];
  isOther: boolean;
  /** Too few lists to say much about; kept out of the default view. */
  isFringe: boolean;
  deckCount: number;
  metaShare: number;
  winRate?: number;
  matches: number;
  /** The most-played main-deck cards, to recognise the deck by. */
  keyCards: string[];
  /** The collection against the archetype's representative list. Absent without a collection. */
  gap?: GapSummary;
}

export interface MetaView {
  format: string;
  generatedAt: string;
  from: string;
  to: string;
  eventCount: number;
  totalDecks: number;
  minMatchesForWinRate: number;
  /** Win rate across every published list with a record: the baseline to read an archetype's rate against. */
  fieldWinRate?: number;
  sources: MetaSnapshot['sources'];
  archetypes: ArchetypeView[];
}

function keyCards(archetype: MetaArchetype, index: CardIndex, limit = 4): string[] {
  const out: string[] = [];
  for (const entry of archetype.cards) {
    const card = index.byName(entry.name);
    // Lands say little about what a deck does.
    if (card && isLand(card)) continue;
    out.push(card?.name ?? entry.name);
    if (out.length === limit) break;
  }
  return out;
}

/**
 * A format's meta, optionally measured against a collection. With a
 * collection, archetypes the player is closest to building come first;
 * without one, the most played do.
 */
export function describeMeta(snapshot: MetaSnapshot, data: AdvisorData, collection?: Collection): MetaView {
  const format = snapshot.format as Format;
  const archetypes: ArchetypeView[] = snapshot.archetypes.map(archetype => {
    const view: ArchetypeView = {
      id: archetype.id,
      name: archetype.name,
      colors: archetype.colors,
      isOther: archetype.isOther === true,
      isFringe: archetype.metaShare < FRINGE_SHARE,
      deckCount: archetype.deckCount,
      metaShare: archetype.metaShare,
      matches: archetype.matchWins + archetype.matchLosses,
      keyCards: keyCards(archetype, data.index),
    };
    if (archetype.winRate !== undefined) view.winRate = archetype.winRate;
    if (collection) {
      view.gap = gapSummary(analyzeGap(deckFromTournamentList(archetype.representative), collection, data.index, format));
    }
    return view;
  });

  if (collection) {
    archetypes.sort((a, b) =>
      Number(b.gap!.craftable === true) - Number(a.gap!.craftable === true) ||
      a.gap!.cost - b.gap!.cost ||
      b.gap!.completion - a.gap!.completion ||
      b.metaShare - a.metaShare,
    );
  }

  const view: MetaView = {
    format: snapshot.format,
    generatedAt: snapshot.generatedAt,
    from: snapshot.from,
    to: snapshot.to,
    eventCount: snapshot.eventCount,
    totalDecks: snapshot.totalDecks,
    minMatchesForWinRate: snapshot.minMatchesForWinRate,
    sources: snapshot.sources,
    archetypes,
  };
  if (snapshot.fieldWinRate !== undefined) view.fieldWinRate = snapshot.fieldWinRate;
  return view;
}

/**
 * Meta snapshot contract.
 *
 * A snapshot is built offline from published tournament decklists and read by
 * the API at start-up. It answers "what is being played in this format, and
 * what does each archetype's card pool look like".
 */

export type MetaFormat = 'standard' | 'pioneer' | 'modern' | 'legacy' | 'pauper' | 'vintage';

export interface DeckCardLine {
  name: string;
  count: number;
}

/** One published decklist, normalised from the tournament cache. */
export interface TournamentDeck {
  player: string;
  /** Finish as published: `1st Place`, `5-0`, `17th Place`… */
  result: string;
  /** Link to the list on the publishing site. */
  uri: string;
  event: string;
  /** Link to the event on the publishing site; two events can share a name and a date, never this. */
  eventUri?: string;
  /** ISO date (YYYY-MM-DD) of the event. */
  date: string;
  main: DeckCardLine[];
  side: DeckCardLine[];
  /** Match record from the event standings, when the event publishes them. */
  wins?: number;
  losses?: number;
}

/** How often an archetype's lists play a card. */
export interface ArchetypeCard {
  name: string;
  /** Share of the archetype's lists with at least one copy in the main deck (0–1). */
  mainShare: number;
  /** Mean main-deck copies among the lists that play it. */
  mainAvg: number;
  /** Share of lists with at least one copy in the sideboard (0–1). */
  sideShare: number;
  /** Mean sideboard copies among the lists that sideboard it. */
  sideAvg: number;
}

export interface MetaArchetype {
  /** Stable slug, unique within the snapshot: `izzet-prowess`. */
  id: string;
  /** Display name with colours where the rules ask for them: `Izzet Prowess`. */
  name: string;
  /** WUBRG letters in WUBRG order; empty for colourless. */
  colors: string[];
  /** True for a `<Colours> Other` bucket: lists grouped by colours only, not one deck to copy. */
  isOther?: boolean;
  deckCount: number;
  /** deckCount / snapshot.totalDecks (0–1). */
  metaShare: number;
  /** Match record summed over lists from events that publish standings. */
  matchWins: number;
  matchLosses: number;
  /** matchWins / (matchWins + matchLosses); undefined below the snapshot's minimum match count. */
  winRate?: number;
  /** Cards sorted by mainShare, then sideShare, descending. */
  cards: ArchetypeCard[];
  /** The most typical well-placed list: what to copy. */
  representative: TournamentDeck;
  /** A few more lists (best finishes first), excluding the representative. */
  otherLists: TournamentDeck[];
}

export interface MetaSource {
  name: string;
  url: string;
  /** What the source is, in a sentence, for the attribution footer. */
  note: string;
}

export interface MetaSnapshot {
  format: MetaFormat;
  /** ISO timestamp of the build. */
  generatedAt: string;
  /** Inclusive ISO dates of the first and last event in the snapshot. */
  from: string;
  to: string;
  eventCount: number;
  totalDecks: number;
  /** Archetypes need at least this many matches before `winRate` is reported. */
  minMatchesForWinRate: number;
  /**
   * Win rate of every list with a match record. Some events publish only their top finishers' lists,
   * which lifts this above 0.5: read an archetype's `winRate` against it, not against 50%.
   */
  fieldWinRate?: number;
  /** Sorted by metaShare descending. Lists no rule matched are grouped by colours as `<Colours> Other`. */
  archetypes: MetaArchetype[];
  sources: MetaSource[];
}

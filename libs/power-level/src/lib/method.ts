import { ESTIMATE } from './analyzer.js';
import type { Bracket, BracketLabel } from './analyzer.js';

/** One reason a deck sits in a bracket. */
export interface BracketFinding {
  /** `rule`: the published brackets say so. `estimate`: our own reading, where they leave it to the table. */
  basis: 'rule' | 'estimate';
  /** The bracket this reason puts the deck in, or above. */
  bracket: Bracket;
  text: string;
}

export interface Reference {
  name: string;
  url: string;
}

/** Where the bracket rules and every signal come from, for the app to show and link. */
export interface BracketMethod {
  /** The brackets as Wizards of the Coast publishes them. */
  official: {
    sources: Reference[];
    /** Summary of what each bracket allows. The linked articles are the authority. */
    brackets: Array<{ bracket: Bracket; label: BracketLabel; allows: string }>;
    note: string;
  };
  /** What we look at in a deck, and whose data says so. */
  signals: Array<{ name: string; how: string; basis: 'rule' | 'estimate'; source: Reference }>;
  /** What our own estimate adds, in words, with the numbers it uses. */
  estimate: string[];
  /** What the assessment was checked against. */
  checkedAgainst: Array<{ what: string; source: Reference }>;
  /** Day the card data was built (ISO date), when known. */
  cardDataDate?: string;
  /** Cards flagged as Game Changers in that data. */
  gameChangerCount?: number;
}

const WIZARDS_OCTOBER_2025: Reference = {
  name: 'Wizards of the Coast: Commander Brackets beta update, October 21, 2025',
  url: 'https://magic.wizards.com/en/news/announcements/commander-brackets-beta-update-october-21-2025',
};
const WIZARDS_FEBRUARY_2026: Reference = {
  name: 'Wizards of the Coast: Commander Brackets beta update, February 9, 2026',
  url: 'https://magic.wizards.com/en/news/announcements/commander-brackets-beta-update-february-9-2026',
};
const scryfallSearch = (name: string, query: string): Reference => ({
  name,
  url: `https://scryfall.com/search?q=${encodeURIComponent(query)}`,
});
const SPELLBOOK: Reference = { name: 'Commander Spellbook', url: 'https://commanderspellbook.com/' };
const SPELLBOOK_ESTIMATOR: Reference = {
  name: "Commander Spellbook's bracket estimator (source code)",
  url: 'https://github.com/SpaceCowMedia/commander-spellbook-backend/blob/master/backend/spellbook/models/variant.py',
};
const MTGJSON: Reference = { name: 'MTGJSON: preconstructed Commander decks', url: 'https://mtgjson.com/' };

/**
 * How a bracket is worked out, as data. The numbers come from `ESTIMATE`, the
 * same constants the assessment runs on.
 */
export function bracketMethod(data: { cardDataDate?: string; gameChangerCount?: number } = {}): BracketMethod {
  return {
    official: {
      sources: [WIZARDS_OCTOBER_2025, WIZARDS_FEBRUARY_2026],
      brackets: [
        { bracket: 1, label: 'Exhibition', allows: 'A theme or an idea before power. No Game Changers, no mass land denial, no two-card infinite combos.' },
        { bracket: 2, label: 'Core', allows: 'Straightforward decks. No Game Changers, no mass land denial, no chained extra turns, no two-card infinite combos.' },
        {
          bracket: 3,
          label: 'Upgraded',
          allows: `Up to ${ESTIMATE.gameChangersAllowedAt3} Game Changers. No mass land denial, no chained extra turns, two-card infinite combos only late in the game.`,
        },
        { bracket: 4, label: 'Optimized', allows: 'Anything legal in Commander.' },
        { bracket: 5, label: 'cEDH', allows: 'Anything legal, built for the competitive metagame.' },
      ],
      note:
        'The brackets are in beta and Wizards revises them a few times a year. They describe what a table agrees to, ' +
        'so the line between Brackets 1 and 2, and between 4 and 5, is intent that no card count settles. ' +
        'Since October 2025 they no longer limit tutors and no longer tie Bracket 2 to preconstructed decks.',
    },
    signals: [
      {
        name: 'Game Changers',
        how: 'The list Wizards keeps of cards that warp a casual game. Scryfall flags each card on it; we read that flag from Scryfall\'s card data, so the list updates when the data does.',
        basis: 'rule',
        source: scryfallSearch('Scryfall: every Game Changer', 'is:gamechanger'),
      },
      {
        name: 'Mass land denial',
        how: 'Cards the Scryfall Tagger community tags as mass land denial. Planeswalkers are left out, since the tag is for an ultimate that rarely happens.',
        basis: 'rule',
        source: scryfallSearch('Scryfall Tagger: mass-land-denial', 'otag:mass-land-denial'),
      },
      {
        name: 'Two-card combos',
        how: 'Combos of two cards that are both in the deck and need nothing else, from Commander Spellbook\'s combo data. The commander does not count as one of the two. Their data also rates each combo, from how much mana it takes and whether it wins the game: a fast one means Bracket 4, a slower one Bracket 3, a slow or minor one Bracket 2, and a loop that wins nothing does not count.',
        basis: 'rule',
        source: SPELLBOOK,
      },
      {
        name: 'Extra turns',
        how: `Cards the Scryfall Tagger community tags as taking an extra turn, planeswalkers left out. The brackets rule out chaining them without saying how many make a chain; we follow Commander Spellbook\'s estimator, which draws the line at ${ESTIMATE.extraTurnsToChain}.`,
        basis: 'estimate',
        source: scryfallSearch('Scryfall Tagger: extra-turn', 'otag:extra-turn'),
      },
      {
        name: 'Cheap tutors',
        how: 'Cards tagged as finding any card, at mana value 2 or less. The brackets stopped limiting tutors in October 2025; we still count these because they make a deck play the same way every game.',
        basis: 'estimate',
        source: scryfallSearch('Scryfall Tagger: tutor-card', 'otag:tutor-card mv<=2'),
      },
      {
        name: 'How widely played the cards are',
        how: 'The average of Scryfall\'s EDHREC rank over the deck\'s spells, as a score out of 100. It stands in for how tuned a list is when nothing above applies.',
        basis: 'estimate',
        source: { name: 'Scryfall card data (edhrec_rank)', url: 'https://scryfall.com/docs/api/cards' },
      },
    ],
    estimate: [
      'A deck sits in the highest bracket any one reason puts it in. Rules of the published brackets come first; the rest is our estimate, and the reasons under a deck say which is which.',
      `With no Game Changers, combos or land denial, a deck whose spells average ${ESTIMATE.staplesWellTuned} or more out of 100 for how widely played they are reads as Bracket 3, ${ESTIMATE.staplesCore} or more as Bracket 2, and below that as Bracket 1.`,
      'Two or more Game Changers with two or more cheap tutors, or with a very low mana curve, read as Bracket 4.',
      `Bracket 5 is a decision a table makes, not a card count. We only say a deck reads as cEDH at ${ESTIMATE.gameChangersCedh} or more Game Changers, or when Game Changers or combos come with cheap tutors and an average mana value near 2.`,
    ],
    checkedAgainst: [
      {
        what: `Wizards' own preconstructed Commander decks, which they built as the Bracket 2 baseline. The line between Brackets 1 and 2 is set so that nine in ten of the decks since 2023 land in Bracket 2 or above, and none reaches Bracket 3 without a Game Changer, a combo or land denial in the box.`,
        source: MTGJSON,
      },
      {
        what: 'Commander Spellbook\'s open bracket estimator, asked about the same decks. It only reports what the rules rule out, so it calls a deck with nothing flagged Bracket 1 where we estimate 1 or 2.',
        source: SPELLBOOK_ESTIMATOR,
      },
    ],
    ...data,
  };
}

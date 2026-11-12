import { describe, it, expect } from 'vitest';
import { parseDeckText } from './deck-text';
import { deckIssues } from './issues';
import { buildTestIndex } from './testing/fixtures';

const index = buildTestIndex([
  { name: 'Rat Colony', cost: '{1}{B}', type: 'Creature — Rat', text: 'A deck can have any number of cards named Rat Colony.' },
  { name: 'Seven Dwarves', cost: '{1}{R}', type: 'Creature — Dwarf', text: 'A deck can have up to seven cards named Seven Dwarves.' },
  { name: 'Paper Only', cost: '{1}{R}', type: 'Instant', onArena: false, legal: ['pioneer', 'commander'] },
  { name: 'Hogaak, Arisen Necropolis', cost: '{5}{B/G}{B/G}', type: 'Legendary Creature — Avatar', legal: ['commander'], banned: ['brawl'] },
]);

const issues = (text: string, format: Parameters<typeof deckIssues>[1]) => deckIssues(parseDeckText(text), format, index);
const kinds = (text: string, format: Parameters<typeof deckIssues>[1]) => issues(text, format).map(issue => issue.kind);

describe('deckIssues', () => {
  it('finds nothing wrong with a legal 60-card deck', () => {
    expect(issues('4 Shock\n4 Opt\n4 Lightning Strike\n24 Island\n24 Mountain\n\nSideboard\n4 Negate', 'standard')).toEqual([]);
  });

  it('says how many cards a short main deck has and how many the format needs', () => {
    expect(issues('4 Shock\n4 Opt\n20 Island', 'standard')).toEqual([
      { kind: 'size', message: '28 cards in the main deck. Standard needs at least 60.', cards: [] },
    ]);
  });

  it('allows more than 60 cards, but not more than 15 in the sideboard', () => {
    expect(kinds('4 Shock\n60 Island', 'standard')).toEqual([]);
    expect(issues('60 Island\n\nSideboard\n16 Mountain', 'standard')).toEqual([
      { kind: 'sideboard', message: '16 cards in the sideboard. The limit is 15.', cards: [] },
    ]);
  });

  it('counts copies across main deck and sideboard, leaving basic lands alone', () => {
    expect(issues('3 Shock\n57 Mountain\n\nSideboard\n2 Shock', 'standard')).toEqual([
      { kind: 'copies', message: 'More than 4 copies: Shock (5).', cards: ['Shock'] },
    ]);
  });

  it('respects the cards that set their own copy limit', () => {
    expect(kinds('20 Rat Colony\n7 Seven Dwarves\n33 Swamp', 'standard')).toEqual([]);
    expect(issues('8 Seven Dwarves\n52 Mountain', 'standard')[0]).toMatchObject({ kind: 'copies', cards: ['Seven Dwarves'] });
  });

  it('tells a banned card from one that is simply not legal, and a legal card that is not on Arena', () => {
    const found = issues('4 Brainstorm\n4 Paper Only\n52 Island', 'pioneer');
    expect(found).toEqual([
      { kind: 'legality', message: 'Not legal in Pioneer: Brainstorm.', cards: ['Brainstorm'] },
      { kind: 'arena', message: 'Not available on MTG Arena: Paper Only.', cards: ['Paper Only'] },
    ]);
    expect(issues('Commander\n1 Niv-Mizzet, Parun\n\nDeck\n1 Hogaak, Arisen Necropolis\n98 Island', 'brawl')).toContainEqual(
      { kind: 'legality', message: 'Banned in Brawl: Hogaak, Arisen Necropolis.', cards: ['Hogaak, Arisen Necropolis'] },
    );
  });

  it('names the lines that match no card, with the nearest real name when there is one', () => {
    expect(issues('4 Shcok\n4 Zzyzx\n60 Mountain', 'standard')).toEqual([
      { kind: 'unknown', message: 'No card matches: Shcok (closest: Shock), Zzyzx.', cards: ['Shcok', 'Zzyzx'] },
    ]);
  });

  it('checks a commander deck for size, singleton and colour identity', () => {
    const found = issues('Commander\n1 Niv-Mizzet, Parun\n\nDeck\n2 Opt\n1 Duress\n40 Island\n40 Mountain', 'brawl');
    expect(found).toEqual([
      { kind: 'size', message: '84 cards, commander included. A Brawl deck has exactly 100.', cards: [] },
      { kind: 'copies', message: 'A Brawl deck plays one copy of each card: Opt (2).', cards: ['Opt'] },
      { kind: 'identity', message: "Outside the commander's colour identity (UR): Duress.", cards: ['Duress'] },
    ]);
  });

  it('asks for a commander when a commander deck has none', () => {
    expect(kinds('1 Opt\n99 Island', 'commander')).toEqual(['commander']);
  });

  it('shortens a long list of names', () => {
    const [issue] = issues(['Aaa', 'Bbb', 'Ccc', 'Ddd', 'Eee', 'Fff', 'Ggg', 'Hhh'].map(n => `1 ${n}`).join('\n') + '\n60 Island', 'standard');
    expect(issue!.message).toBe('No card matches: Aaa, Bbb, Ccc, Ddd, Eee, Fff and 2 more.');
    expect(issue!.cards).toHaveLength(8);
  });
});

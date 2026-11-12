import { describe, it, expect } from 'vitest';
import { buildTestIndex } from '@mtg/deck-advisor/testing';
import { AnswerChecker } from './checks';
import type { Evidence } from './checks';

const checker = new AnswerChecker(buildTestIndex());

const evidence = (results: unknown[], playerMessages: string[] = [], tools = ['check_meta_deck']): Evidence => ({
  tools: results.map((result, i) => ({ tool: tools[i] ?? tools[0]!, args: {}, result })),
  earlierResults: [],
  playerMessages,
});

const deckCheck = {
  deck: 'Izzet Prowess',
  ownedPercent: 64.04,
  missing: [{ card: 'Steam Vents', standIns: [{ card: 'Izzet Guildgate', match: 'partial', why: 'In 30% of Izzet Prowess main decks' }] }],
};

describe('AnswerChecker', () => {
  it('passes an answer built only from the tool result', () => {
    const reply = 'You own 64% of **Izzet Prowess**. Play **Izzet Guildgate** for Steam Vents (partial, in 30% of lists).';
    expect(checker.check(reply, { calls: [['check_meta_deck']] }, evidence([deckCheck]))).toEqual([]);
  });

  it('flags a card no tool returned', () => {
    const failures = checker.check('Play Spirebluff Canal for Steam Vents.', {}, evidence([deckCheck]));
    expect(failures).toEqual([{ check: 'cards', detail: 'named without a tool result: Spirebluff Canal' }]);
  });

  it('accepts cards the player named, cards from earlier in the conversation, and basic lands', () => {
    const reply = 'Opt is fine, keep Watery Grave from before, and add two Island.';
    const withHistory: Evidence = { tools: [], earlierResults: [{ card: 'Watery Grave' }], playerMessages: ['4 Opt\n20 Island'] };
    expect(checker.check(reply, {}, withHistory)).toEqual([]);
  });

  it('reads evidence more generously than the answer, so a card the player listed is never called invented', () => {
    // A bare name on its own line is no mention in an answer, but in a pasted list it is the card.
    const pasted: Evidence = { tools: [], earlierResults: [], playerMessages: ['Deck\nOpt\nDuress'] };
    expect(checker.check('Keep **Opt** and **Duress**.', {}, pasted)).toEqual([]);
  });

  it('flags a percentage no tool returned, allowing for rounding', () => {
    expect(checker.ungroundedPercentages('You own 64.0% of it.', evidence([deckCheck]))).toEqual([]);
    expect(checker.ungroundedPercentages('You own 64% of it.', evidence([deckCheck]))).toEqual([]);
    expect(checker.ungroundedPercentages('It wins 58.5% of matches.', evidence([deckCheck]))).toEqual(['58.5%']);
    expect(checker.ungroundedPercentages('You own 65% of it.', evidence([deckCheck]))).toEqual(['65%']);
  });

  it('leaves grounding alone when a case switches it off', () => {
    expect(checker.check('Play Spirebluff Canal, it wins 99% of games.', { grounded: false }, evidence([]))).toEqual([]);
  });

  it('checks tool choice: one of each group, none of the unwanted', () => {
    const ran = evidence([{}, {}], [], ['collection_summary', 'list_meta_decks']);
    expect(checker.check('ok', { calls: [['list_meta_decks', 'check_meta_deck']], grounded: false }, ran)).toEqual([]);
    expect(checker.check('ok', { calls: [['find_stand_ins']], grounded: false }, ran)).toEqual([
      { check: 'tools', detail: 'expected find_stand_ins; ran collection_summary, list_meta_decks' },
    ]);
    expect(checker.check('ok', { avoids: ['list_meta_decks'], grounded: false }, ran)).toEqual([
      { check: 'tools', detail: 'should not have run list_meta_decks' },
    ]);
    expect(checker.check('ok', { noTools: true, grounded: false }, ran)).toEqual([
      { check: 'tools', detail: 'needed no tool; ran collection_summary, list_meta_decks' },
    ]);
  });

  it('checks what the answer must and must not say, and its length', () => {
    const none = evidence([]);
    expect(checker.check('These are tournament results.', { says: [/tournament/i], grounded: false }, none)).toEqual([]);
    expect(checker.check('The best ladder deck.', { says: [/tournament/i], grounded: false }, none)).toEqual([
      { check: 'says', detail: 'nothing matches /tournament/i' },
    ]);
    expect(checker.check('You own 12 of them.', { neverSays: [/you own \d+/i], grounded: false }, none)).toEqual([
      { check: 'neverSays', detail: '"You own 12" matches /you own \\d+/i' },
    ]);
    expect(checker.check('x'.repeat(301), { maxChars: 300, grounded: false }, none)).toEqual([
      { check: 'length', detail: '301 characters, limit 300' },
    ]);
  });
});

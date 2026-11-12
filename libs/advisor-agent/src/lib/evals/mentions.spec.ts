import { describe, it, expect } from 'vitest';
import { buildTestIndex } from '@mtg/deck-advisor/testing';
import { CardMentions } from './mentions';

const mentions = new CardMentions(buildTestIndex());
const named = (text: string) => mentions.find(text).map(mention => mention.card.name);

describe('CardMentions', () => {
  it('finds multi-word names, punctuation and all', () => {
    expect(named('Craft Sheoldred, the Apocalypse first, then Go for the Throat.')).toEqual([
      'Sheoldred, the Apocalypse',
      'Go for the Throat',
    ]);
  });

  it('prefers the longest name and reads a face as its card', () => {
    expect(named('Swap in Callous Sell-Sword for now.')).toEqual(['Callous Sell-Sword // Burn Together']);
    expect(named('Callous Sell-Sword // Burn Together is the craft.')).toEqual(['Callous Sell-Sword // Burn Together']);
  });

  it('sees through list markup and bold', () => {
    expect(named('* **4x Steam Vents** -> 4x **Izzet Guildgate** (partial)')).toEqual(['Steam Vents', 'Izzet Guildgate']);
  });

  it('takes a one-word name in bold or capitalised mid-sentence', () => {
    expect(named('- **Duress** (close match)')).toEqual(['Duress']);
    expect(named('You could play Opt instead.')).toEqual(['Opt']);
  });

  it('does not take a one-word name out of a longer bold phrase', () => {
    expect(named('**Izzet Shock** is the most played deck.')).toEqual([]);
    expect(named('Play **4x Shock** in the main deck.')).toEqual(['Shock']);
  });

  it('does not take a one-word name that merely starts a sentence or a line', () => {
    expect(named('Consider crafting the lands first.')).toEqual([]);
    expect(named('Why it matters.\nConsider the mana base.')).toEqual([]);
    expect(named('My advice: Shock yourself less.')).toEqual([]);
  });

  it('ignores lower-case words that happen to be card names', () => {
    expect(named('It is a shock to the system, so consider your options and opt out.')).toEqual([]);
  });

  it('reads a game term that is also a card name as a card only in bold', () => {
    const withTerms = new CardMentions(buildTestIndex([{ name: 'Arena', type: 'Land' }, { name: 'Counterspell', cost: '{U}{U}', type: 'Instant' }]));
    const found = (text: string) => withTerms.find(text).map(mention => mention.card.name);
    expect(found('It is not on Arena, and any Counterspell effect stops it.')).toEqual([]);
    expect(found('Craft **Counterspell** first.')).toEqual(['Counterspell']);
  });

  it('does not read half of a split card as a mention', () => {
    // "Burn Together" is one face of a card; "Burn" alone is no card here, and a one-word face never counts.
    expect(named('This list is Burn through and through.')).toEqual([]);
  });
});

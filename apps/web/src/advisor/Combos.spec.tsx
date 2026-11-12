import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CombosPanel, DeckCombosSection } from './Combos';
import type { ComboCompleterView, ComboView, StoredCollection } from './api';

const mockCombos = vi.fn();

vi.mock('./api', () => ({
  advisorApi: { combos: (...args: unknown[]) => mockCombos(...args) },
  describeError: (err: unknown) => (err instanceof Error ? err.message : 'failed'),
}));

const card = (name: string, arenaRarity?: 'common' | 'rare') => ({ oracleId: `id:${name}`, name, arenaRarity });

const optShock: ComboView = {
  id: 'opt-shock',
  url: 'https://commanderspellbook.com/combo/opt-shock/',
  cards: [card('Opt', 'common'), card('Shock', 'common')],
  alsoNeeds: [],
  produces: ['Infinite damage', 'Infinite storm count'],
  moreResults: 2,
  colors: ['U', 'R'],
  popularity: 12500,
};
const shockStrike: ComboView = {
  id: 'shock-strike',
  url: 'https://commanderspellbook.com/combo/shock-strike/',
  cards: [card('Shock', 'common'), card('Lightning Strike', 'common')],
  alsoNeeds: ['2x Sacrifice outlet'],
  produces: ['Infinite damage'],
  moreResults: 0,
  colors: ['R'],
  popularity: 50,
};
const strike: ComboCompleterView = { card: card('Lightning Strike', 'rare'), owned: 0, finishes: 3, combos: [shockStrike] };
const duress: ComboCompleterView = { card: card('Duress', 'common'), owned: 2, finishes: 1, combos: [optShock] };

const collection: StoredCollection = { cards: { a: 4 }, label: 'Your collection', totalCards: 4, uniqueCards: 1, sample: false };
const formats = [
  { key: 'standard', label: 'Standard', onArena: true },
  { key: 'historic', label: 'Historic', onArena: true },
  { key: 'commander', label: 'Commander', onArena: false },
];

describe('DeckCombosSection', () => {
  it('lists the combos in the list with what they do and a link to the steps', () => {
    render(<DeckCombosSection combos={{ inDeck: [optShock], inDeckTotal: 1, oneCardAway: [] }} hasCollection />);
    const section = screen.getByRole('region', { name: 'Combos in this list' });
    const row = within(section).getByRole('listitem');
    expect(row).toHaveTextContent('Opt + Shock');
    expect(row).toHaveTextContent('Infinite damage · Infinite storm count · and 2 more');
    expect(row).toHaveTextContent('in 12,500 decks');
    expect(within(row).getByRole('link', { name: 'How Opt + Shock works, on Commander Spellbook' }))
      .toHaveAttribute('href', 'https://commanderspellbook.com/combo/opt-shock/');
    expect(within(section).getByRole('link', { name: 'Commander Spellbook' })).toHaveAttribute('href', 'https://commanderspellbook.com');
  });

  it('says when it shows only the most played of many', () => {
    render(<DeckCombosSection combos={{ inDeck: [optShock], inDeckTotal: 14, oneCardAway: [] }} hasCollection />);
    expect(screen.getByRole('heading', { name: 'In this list: 1 of 14, most played first' })).toBeInTheDocument();
  });

  it('names the cards that would add a combo, what each costs, and what the combo also needs', () => {
    render(<DeckCombosSection combos={{ inDeck: [], inDeckTotal: 0, oneCardAway: [duress, strike] }} hasCollection />);
    const [owned, craft] = screen.getAllByRole('listitem');
    expect(owned).toHaveTextContent('Duress you own 2');
    expect(owned).toHaveTextContent('finishes 1 combo:');
    expect(craft).toHaveTextContent('finishes 3 combos, the most played:');
    expect(within(craft!).getByTitle('rare wildcard')).toBeInTheDocument();
    expect(craft).toHaveTextContent('Also needs: 2x Sacrifice outlet');
    expect(screen.queryByRole('heading', { name: /In this list/ })).not.toBeInTheDocument();
  });

  it('does not claim ownership without a collection', () => {
    render(<DeckCombosSection combos={{ inDeck: [], inDeckTotal: 0, oneCardAway: [duress] }} hasCollection={false} />);
    expect(screen.queryByText(/you own/)).not.toBeInTheDocument();
  });

  it('renders nothing when the list has no combo and is not one card from any', () => {
    const { container } = render(<DeckCombosSection combos={{ inDeck: [], inDeckTotal: 0, oneCardAway: [] }} hasCollection />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('CombosPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('asks for a collection first, and does not call the server', () => {
    render(<CombosPanel collection={null} formats={formats} />);
    expect(screen.getByText(/Load a collection above/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Find them' })).toBeDisabled();
    expect(mockCombos).not.toHaveBeenCalled();
  });

  it('looks only once asked, starting with Historic, and shows what the collection holds', async () => {
    const user = userEvent.setup();
    mockCombos.mockResolvedValue({ format: 'historic', owned: [optShock], ownedTotal: 345, oneCardAway: [strike] });
    render(<CombosPanel collection={collection} formats={formats} />);
    expect(mockCombos).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Find them' }));

    expect(await screen.findByRole('heading', { name: 'You own every card of 345 combos in Historic. The most played:' })).toBeInTheDocument();
    expect(mockCombos).toHaveBeenCalledWith('historic', collection);
    const away = screen.getByRole('heading', { name: 'One card away' }).parentElement as HTMLElement;
    expect(within(away).getByRole('listitem')).toHaveTextContent('Lightning Strike');
  });

  it('looks again when the format changes', async () => {
    const user = userEvent.setup();
    mockCombos.mockImplementation((format: string) => Promise.resolve({ format, owned: [], ownedTotal: 0, oneCardAway: [] }));
    render(<CombosPanel collection={collection} formats={formats} />);
    await user.click(screen.getByRole('button', { name: 'Find them' }));
    await screen.findByRole('heading', { name: 'No combo is complete in Historic' });

    await user.selectOptions(screen.getByLabelText('Format'), 'commander');

    expect(await screen.findByRole('heading', { name: 'No combo is complete in Commander' })).toBeInTheDocument();
    expect(mockCombos).toHaveBeenLastCalledWith('commander', collection);
  });

  it('shows the server\'s explanation when the lookup fails', async () => {
    const user = userEvent.setup();
    mockCombos.mockRejectedValue(new Error('The combos file is missing on this server.'));
    render(<CombosPanel collection={collection} formats={formats} />);
    await user.click(screen.getByRole('button', { name: 'Find them' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('The combos file is missing on this server.'));
  });
});

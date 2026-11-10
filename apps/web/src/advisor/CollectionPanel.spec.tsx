import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CollectionPanel } from './CollectionPanel';
import type { ImportResult, StoredCollection } from './api';

const mockSample = vi.fn();
const mockImport = vi.fn();

vi.mock('./api', () => ({
  advisorApi: {
    sample: (...args: unknown[]) => mockSample(...args),
    importCollection: (...args: unknown[]) => mockImport(...args),
  },
  describeError: (err: unknown) => (err instanceof Error ? err.message : 'failed'),
}));

const imported = (overrides: Partial<ImportResult> = {}): ImportResult => ({
  formats: ['arena-text'],
  totalCards: 6,
  uniqueCards: 2,
  unresolved: { count: 0, sample: [] },
  decks: [],
  warnings: [],
  unrecognizedLines: [],
  collection: { cards: { a: 4, b: 2 } },
  ...overrides,
});

const loaded: StoredCollection = {
  cards: { a: 4, b: 2 }, wildcards: { common: 10, uncommon: 5, rare: 2, mythic: 1 },
  label: 'Your collection (card list)', totalCards: 6, uniqueCards: 2, sample: false,
};

function renderPanel(collection: StoredCollection | null = null) {
  const onChange = vi.fn();
  const onSavedDecks = vi.fn();
  render(<CollectionPanel collection={collection} onChange={onChange} onSavedDecks={onSavedDecks} />);
  return { onChange, onSavedDecks };
}

describe('CollectionPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('offers an import and a made-up collection when nothing is loaded', () => {
    renderPanel();
    expect(screen.getByLabelText('Paste a collection export')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Newcomer/ })).toBeInTheDocument();
    expect(screen.getByText('How do I get my collection out of Arena?')).toBeInTheDocument();
  });

  it('imports pasted text and hands the collection up', async () => {
    const user = userEvent.setup();
    mockImport.mockResolvedValue(imported());
    const { onChange, onSavedDecks } = renderPanel();

    await user.type(screen.getByLabelText('Paste a collection export'), '4 Shock');
    await user.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(mockImport).toHaveBeenCalledWith(['4 Shock']);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      cards: { a: 4, b: 2 }, totalCards: 6, uniqueCards: 2, sample: false, label: 'Your collection (card list)',
    }));
    expect(onSavedDecks).toHaveBeenCalledWith([]);
  });

  it('reports entries that matched no card and the importer\'s warnings', async () => {
    const user = userEvent.setup();
    mockImport.mockResolvedValue(imported({
      warnings: ['Detailed Logs are disabled.'],
      unresolved: { count: 2, sample: ['Blorp', 'Arena id 99999'] },
    }));
    renderPanel();
    await user.type(screen.getByLabelText('Paste a collection export'), 'x');
    await user.click(screen.getByRole('button', { name: 'Import' }));
    expect(await screen.findByText('Detailed Logs are disabled.')).toBeInTheDocument();
    expect(screen.getByText('2 entries matched no card: Blorp, Arena id 99999')).toBeInTheDocument();
  });

  it('adds wildcards from a Player.log without dropping the cards already loaded', async () => {
    const user = userEvent.setup();
    const decks = [{ id: 'd1', name: 'Izzet', format: 'standard', arenaFormat: 'Standard', deckText: 'Deck\n4 Shock\n', unknownCards: 0 }];
    mockImport.mockResolvedValue(imported({
      formats: ['player-log'], totalCards: 0, uniqueCards: 0,
      wildcards: { common: 1, uncommon: 2, rare: 3, mythic: 4 },
      collection: { cards: {}, wildcards: { common: 1, uncommon: 2, rare: 3, mythic: 4 } },
      decks,
    }));
    const { onChange, onSavedDecks } = renderPanel(loaded);

    await user.click(screen.getByRole('button', { name: 'Replace' }));
    await user.type(screen.getByLabelText('Paste a collection export'), 'log');
    await user.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      cards: { a: 4, b: 2 }, uniqueCards: 2, label: 'Your collection (card list)',
      wildcards: { common: 1, uncommon: 2, rare: 3, mythic: 4 },
    }));
    expect(onSavedDecks).toHaveBeenCalledWith(decks);
  });

  it('loads a made-up collection and marks it as one', async () => {
    const user = userEvent.setup();
    mockSample.mockResolvedValue({
      profile: 'regular', label: 'Regular', description: '', totalCards: 100, uniqueCards: 40,
      collection: { cards: { a: 4 }, wildcards: { common: 60, uncommon: 35, rare: 8, mythic: 3 } },
    });
    const { onChange } = renderPanel();
    await user.click(screen.getByRole('button', { name: /Regular/ }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(mockSample).toHaveBeenCalledWith('regular');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ sample: true, label: 'Sample collection: Regular' }));
  });

  it('shows the server\'s explanation when an import fails', async () => {
    const user = userEvent.setup();
    mockImport.mockRejectedValue(new Error('None of the input matched a known collection format or card name.'));
    const { onChange } = renderPanel();
    await user.type(screen.getByLabelText('Paste a collection export'), 'nonsense');
    await user.click(screen.getByRole('button', { name: 'Import' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('None of the input matched');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('summarises a loaded collection and lets the wildcards be edited', async () => {
    const user = userEvent.setup();
    const { onChange } = renderPanel(loaded);
    expect(screen.getByText('Your collection (card list)')).toBeInTheDocument();
    expect(screen.queryByText('made-up data')).toBeNull();
    expect(screen.queryByLabelText('Paste a collection export')).toBeNull();

    const rare = screen.getByRole('spinbutton', { name: /rare/i });
    expect(rare).toHaveValue(2);
    await user.clear(rare);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ wildcards: { common: 10, uncommon: 5, rare: 0, mythic: 1 } }));
  });

  it('flags a sample collection as made-up data', () => {
    renderPanel({ ...loaded, sample: true, label: 'Sample collection: Regular' });
    expect(screen.getByText('made-up data')).toBeInTheDocument();
  });

  it('prompts for wildcard counts when none are known', () => {
    renderPanel({ ...loaded, wildcards: undefined });
    expect(screen.getByText(/No wildcard counts yet/)).toBeInTheDocument();
  });

  it('clears the collection and the saved decks', async () => {
    const user = userEvent.setup();
    const { onChange, onSavedDecks } = renderPanel(loaded);
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onChange).toHaveBeenCalledWith(null);
    expect(onSavedDecks).toHaveBeenCalledWith([]);
  });
});

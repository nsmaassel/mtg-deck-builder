import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdvisorPage } from './AdvisorPage';
import type { AdvisorStatus } from './api';
import { archetypeCheck, completeCheck, metaView } from './fixtures';

const mockStatus = vi.fn();
const mockMeta = vi.fn();
const mockCheckArchetype = vi.fn();
const mockCheckDeck = vi.fn();
const mockSample = vi.fn();

vi.mock('./api', () => ({
  advisorApi: {
    status: () => mockStatus(),
    meta: (...args: unknown[]) => mockMeta(...args),
    checkArchetype: (...args: unknown[]) => mockCheckArchetype(...args),
    checkDeck: (...args: unknown[]) => mockCheckDeck(...args),
    sample: (...args: unknown[]) => mockSample(...args),
    importCollection: vi.fn(),
  },
  describeError: (err: unknown) => (err instanceof Error ? err.message : 'failed'),
}));

const status: AdvisorStatus = {
  ready: true,
  agent: { available: true, model: 'gemini-test' },
  cards: { count: 33000, builtAt: '2026-11-09T00:00:00Z', sourceUpdatedAt: '2026-11-09T22:06:00Z' },
  formats: [
    { key: 'standard', label: 'Standard', onArena: true },
    { key: 'brawl', label: 'Brawl', onArena: true },
    { key: 'commander', label: 'Commander', onArena: false },
  ],
  meta: [
    { format: 'standard', from: '2026-10-01', to: '2026-11-08', totalDecks: 250, eventCount: 40, generatedAt: '', sources: metaView.sources },
    { format: 'pioneer', from: '2026-10-01', to: '2026-11-08', totalDecks: 90, eventCount: 12, generatedAt: '', sources: [] },
  ],
};

describe('AdvisorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockStatus.mockResolvedValue(status);
    mockMeta.mockResolvedValue(metaView);
    mockCheckArchetype.mockResolvedValue(archetypeCheck);
    mockCheckDeck.mockResolvedValue(completeCheck);
  });

  it('opens on the Standard meta and credits its sources', async () => {
    render(<AdvisorPage recheckDelayMs={0} />);
    expect(await screen.findByText('Izzet Prowess')).toBeInTheDocument();
    expect(mockMeta).toHaveBeenCalledWith('standard', null);
    expect(screen.getByRole('link', { name: 'Scryfall' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'MTGODecklistCache' })).toHaveAttribute('href', 'https://example.test/cache');
    expect(screen.getByText(/Your collection stays in this browser/)).toBeInTheDocument();
  });

  it('offers the chat when the server has a model, and says so when it does not', async () => {
    const { unmount } = render(<AdvisorPage recheckDelayMs={0} />);
    await screen.findByText('Izzet Prowess');
    expect(screen.getByRole('textbox', { name: 'Your question' })).toBeInTheDocument();
    unmount();

    mockStatus.mockResolvedValue({ ...status, agent: { available: false } });
    render(<AdvisorPage recheckDelayMs={0} />);
    await screen.findByText('Izzet Prowess');
    expect(screen.getByText(/Chat is off on this server/)).toBeInTheDocument();
  });

  it('checks a meta deck when it is picked', async () => {
    const user = userEvent.setup();
    render(<AdvisorPage recheckDelayMs={0} />);
    await user.click(await screen.findByRole('button', { name: /Izzet Prowess/ }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Izzet Prowess' })).toBeInTheDocument();
    expect(mockCheckArchetype).toHaveBeenCalledWith('standard', 'izzet-prowess', 0, null, 'inventory');
    expect(screen.getByText(/No collection loaded/)).toBeInTheDocument();
  });

  it('re-checks with the other list, and without wildcards, on request', async () => {
    const user = userEvent.setup();
    render(<AdvisorPage recheckDelayMs={0} />);
    await user.click(await screen.findByRole('button', { name: /Izzet Prowess/ }));
    await screen.findByRole('heading', { level: 2, name: 'Izzet Prowess' });

    await user.click(within(screen.getByRole('navigation', { name: 'Other lists of this deck' })).getByRole('button', { name: /bob/ }));
    await waitFor(() => expect(mockCheckArchetype).toHaveBeenLastCalledWith('standard', 'izzet-prowess', 1, null, 'inventory'));

    await user.click(screen.getByRole('radio', { name: 'Keep them, swaps only' }));
    await waitFor(() => expect(mockCheckArchetype).toHaveBeenLastCalledWith('standard', 'izzet-prowess', 1, null, 'none'));
  });

  it('switches format', async () => {
    const user = userEvent.setup();
    render(<AdvisorPage recheckDelayMs={0} />);
    await screen.findByText('Izzet Prowess');
    await user.click(screen.getByRole('button', { name: 'Pioneer' }));
    await waitFor(() => expect(mockMeta).toHaveBeenLastCalledWith('pioneer', null));
  });

  it('checks a pasted list in the chosen format', async () => {
    const user = userEvent.setup();
    render(<AdvisorPage recheckDelayMs={0} />);
    await screen.findByText('Izzet Prowess');
    await user.click(screen.getByRole('tab', { name: /Paste a list/ }));
    await user.type(screen.getByLabelText(/Decklist/), '4 Shock');
    await user.selectOptions(screen.getByLabelText('Format'), 'brawl');
    await user.click(screen.getByRole('button', { name: 'Check this deck' }));

    expect(await screen.findByRole('heading', { level: 2, name: 'Mono-Red Burn' })).toBeInTheDocument();
    expect(mockCheckDeck).toHaveBeenCalledWith('4 Shock', 'brawl', null, 'inventory');
    expect(screen.getByRole('option', { name: 'Commander (paper)' })).toBeInTheDocument();
  });

  it('sends the loaded collection with every request and keeps it for the next visit', async () => {
    const user = userEvent.setup();
    mockSample.mockResolvedValue({
      profile: 'regular', label: 'Regular', description: '', totalCards: 100, uniqueCards: 40,
      collection: { cards: { a: 4 }, wildcards: { common: 60, uncommon: 35, rare: 8, mythic: 3 } },
    });
    render(<AdvisorPage recheckDelayMs={0} />);
    await screen.findByText('Izzet Prowess');
    await user.click(screen.getByRole('button', { name: /Regular/ }));

    await waitFor(() => expect(mockMeta).toHaveBeenLastCalledWith('standard', expect.objectContaining({ cards: { a: 4 }, sample: true })));
    expect(JSON.parse(localStorage.getItem('mtg-advisor:collection:v1') ?? '{}')).toMatchObject({ cards: { a: 4 } });
    expect(await screen.findByRole('columnheader', { name: 'You own' })).toBeInTheDocument();
  });

  it('restores a stored collection on load', async () => {
    localStorage.setItem('mtg-advisor:collection:v1', JSON.stringify({
      cards: { a: 4 }, label: 'Your collection (card list)', totalCards: 4, uniqueCards: 1, sample: false,
    }));
    render(<AdvisorPage recheckDelayMs={0} />);
    expect(await screen.findByText('Your collection (card list)')).toBeInTheDocument();
    await waitFor(() => expect(mockMeta).toHaveBeenCalledWith('standard', expect.objectContaining({ cards: { a: 4 } })));
  });

  it('goes straight to pasting a list when no meta data is built', async () => {
    mockStatus.mockResolvedValue({ ...status, meta: [] });
    render(<AdvisorPage recheckDelayMs={0} />);
    expect(await screen.findByLabelText(/Decklist/)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Meta decks' })).toBeDisabled();
    expect(mockMeta).not.toHaveBeenCalled();
  });

  it('explains itself when the server has no card data', async () => {
    mockStatus.mockResolvedValue({ ready: false, formats: [], meta: [] });
    render(<AdvisorPage recheckDelayMs={0} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('no card data on this server');
  });

  it('shows the error when a check fails', async () => {
    const user = userEvent.setup();
    mockCheckArchetype.mockRejectedValue(new Error('Archetype not found'));
    render(<AdvisorPage recheckDelayMs={0} />);
    await user.click(await screen.findByRole('button', { name: /Izzet Prowess/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Archetype not found');
  });
});

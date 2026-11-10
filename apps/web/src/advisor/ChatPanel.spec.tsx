import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatPanel } from './ChatPanel';
import type { StoredCollection } from './api';

const mockChat = vi.fn();

vi.mock('./api', () => ({
  advisorApi: { chat: (...args: unknown[]) => mockChat(...args) },
  describeError: (err: unknown) => (err instanceof Error ? err.message : 'failed'),
}));

const collection: StoredCollection = {
  cards: { a: 4 }, label: 'Your collection', totalCards: 4, uniqueCards: 1, sample: false,
};

describe('ChatPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('explains itself instead of offering an input when chat is off', () => {
    render(<ChatPanel collection={null} available={false} />);
    expect(screen.getByText(/Chat is off on this server/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /Which Standard deck/ })).toBeNull();
  });

  it('asks a suggested question and shows the answer with what the advisor ran', async () => {
    const user = userEvent.setup();
    mockChat.mockResolvedValue({
      sessionId: 's1',
      reply: 'Izzet Prowess: you own 80% of it.',
      steps: [{ tool: 'list_meta_decks', summary: 'Ranked the standard meta against your collection' }],
    });
    render(<ChatPanel collection={collection} available />);
    await user.click(screen.getByRole('button', { name: 'Which Standard deck am I closest to building?' }));

    const log = await screen.findByRole('log');
    expect(within(log).getByText('Which Standard deck am I closest to building?')).toBeInTheDocument();
    expect(await within(log).findByText('Izzet Prowess: you own 80% of it.')).toBeInTheDocument();
    expect(within(within(log).getByRole('list', { name: 'What the advisor ran' })).getByText(/Ranked the standard meta/)).toBeInTheDocument();
    expect(mockChat).toHaveBeenCalledWith('Which Standard deck am I closest to building?', undefined, collection);
  });

  it('continues the same conversation and sends the collection each time', async () => {
    const user = userEvent.setup();
    mockChat
      .mockResolvedValueOnce({ sessionId: 's1', reply: 'First.', steps: [] })
      .mockResolvedValueOnce({ sessionId: 's1', reply: 'Second.', steps: [] });
    render(<ChatPanel collection={collection} available />);

    await user.type(screen.getByRole('textbox', { name: 'Your question' }), 'one{Enter}');
    await screen.findByText('First.');
    await user.type(screen.getByRole('textbox', { name: 'Your question' }), 'two');
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    await screen.findByText('Second.');

    expect(mockChat).toHaveBeenNthCalledWith(1, 'one', undefined, collection);
    expect(mockChat).toHaveBeenNthCalledWith(2, 'two', 's1', collection);
    expect(screen.getByRole('textbox', { name: 'Your question' })).toHaveValue('');
  });

  it('starts over on request', async () => {
    const user = userEvent.setup();
    mockChat.mockResolvedValue({ sessionId: 's1', reply: 'Answer.', steps: [] });
    render(<ChatPanel collection={null} available />);
    await user.type(screen.getByRole('textbox', { name: 'Your question' }), 'hello{Enter}');
    await screen.findByText('Answer.');

    await user.click(screen.getByRole('button', { name: 'New conversation' }));
    expect(screen.queryByText('Answer.')).toBeNull();
    await user.type(screen.getByRole('textbox', { name: 'Your question' }), 'again{Enter}');
    await waitFor(() => expect(mockChat).toHaveBeenLastCalledWith('again', undefined, null));
  });

  it('shows the server\'s explanation when the advisor cannot answer, and keeps the question', async () => {
    const user = userEvent.setup();
    mockChat.mockRejectedValue(new Error('The advisor has answered as many questions as its daily budget allows.'));
    render(<ChatPanel collection={null} available />);
    await user.type(screen.getByRole('textbox', { name: 'Your question' }), 'hello{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('daily budget');
    expect(within(screen.getByRole('log')).getByText('hello')).toBeInTheDocument();
  });

  it('does not send an empty question', async () => {
    const user = userEvent.setup();
    render(<ChatPanel collection={null} available />);
    expect(screen.getByRole('button', { name: 'Ask' })).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: 'Your question' }), '   {Enter}');
    expect(mockChat).not.toHaveBeenCalled();
  });

  it('nudges a visitor without a collection towards loading one', () => {
    render(<ChatPanel collection={null} available />);
    expect(screen.getByPlaceholderText(/Load a collection above/)).toBeInTheDocument();
  });
});

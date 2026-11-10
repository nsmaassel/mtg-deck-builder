import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MetaBrowser } from './MetaBrowser';
import { metaView } from './fixtures';

const withoutGaps = { ...metaView, archetypes: metaView.archetypes.map(({ gap: _gap, ...rest }) => rest) };

describe('MetaBrowser', () => {
  it('lists named archetypes with share and win rate, and leaves the Other buckets out', () => {
    render(<MetaBrowser meta={withoutGaps} hasCollection={false} hasWildcards={false} onPick={vi.fn()} />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Izzet Prowess');
    expect(rows[0]).toHaveTextContent('12.0%');
    expect(rows[0]).toHaveTextContent('55.0%');
    expect(rows[0]).toHaveTextContent('210 matches');
    expect(screen.queryByText('Izzet Other')).toBeNull();
    expect(screen.getByText(/10% of lists fit no named archetype/)).toBeInTheDocument();
  });

  it('shows a dash instead of a win rate drawn from too few matches', () => {
    render(<MetaBrowser meta={withoutGaps} hasCollection={false} hasWildcards={false} onPick={vi.fn()} />);
    const aggro = screen.getByText('Mono-Red Aggro').closest('tr') as HTMLElement;
    expect(within(aggro).getByTitle('Fewer than 50 recorded matches')).toHaveTextContent('—');
  });

  it('says where the numbers come from and that they are not ladder results', () => {
    render(<MetaBrowser meta={withoutGaps} hasCollection={false} hasWildcards={false} onPick={vi.fn()} />);
    expect(screen.getByText(/250 tournament lists from 40 events, 2026-10-01 to 2026-11-08/)).toBeInTheDocument();
    expect(screen.getByText(/not Arena ladder results/)).toBeInTheDocument();
    // The baseline the rates should be read against.
    expect(screen.getByText(/55\.6% across all of them/)).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'You own' })).toBeNull();
  });

  it('adds ownership and wildcard columns once a collection is loaded', () => {
    render(<MetaBrowser meta={metaView} hasCollection hasWildcards onPick={vi.fn()} />);
    expect(screen.getByRole('columnheader', { name: 'You own' })).toBeInTheDocument();
    const prowess = screen.getByText('Izzet Prowess').closest('tr') as HTMLElement;
    expect(within(prowess).getByText('60 of 75 cards')).toBeInTheDocument();
    expect(within(prowess).getByTitle('5 rare wildcards')).toBeInTheDocument();
    expect(within(prowess).getByText(/short/)).toBeInTheDocument();

    const aggro = screen.getByText('Mono-Red Aggro').closest('tr') as HTMLElement;
    expect(within(aggro).getByText('You own it')).toBeInTheDocument();
    expect(within(aggro).getByText('Nothing to craft')).toBeInTheDocument();
  });

  it('does not claim a shortfall when no wildcard counts are known', () => {
    render(<MetaBrowser meta={metaView} hasCollection hasWildcards={false} onPick={vi.fn()} />);
    const prowess = screen.getByText('Izzet Prowess').closest('tr') as HTMLElement;
    expect(within(prowess).queryByText(/short/)).toBeNull();
  });

  it('keeps decks under 1% of the meta out of the way until asked', async () => {
    const user = userEvent.setup();
    render(<MetaBrowser meta={metaView} hasCollection hasWildcards onPick={vi.fn()} />);
    expect(screen.queryByText('Jeskai Convoke')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Show 1 deck under 1% of the meta' }));
    expect(screen.getByText('Jeskai Convoke')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hide 1 deck under 1% of the meta' }));
    expect(screen.queryByText('Jeskai Convoke')).toBeNull();
  });

  it('hands the picked archetype to the caller', async () => {
    const onPick = vi.fn();
    render(<MetaBrowser meta={metaView} hasCollection hasWildcards onPick={onPick} />);
    await userEvent.setup().click(screen.getByRole('button', { name: /Izzet Prowess/ }));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'izzet-prowess' }));
  });
});

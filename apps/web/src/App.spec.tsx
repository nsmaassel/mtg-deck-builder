import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App';

vi.mock('./api', () => ({
  api: {
    searchCommanders: vi.fn().mockResolvedValue({ commanders: [] }),
    parseCollection: vi.fn(),
    buildDeck: vi.fn(),
    explainDeck: vi.fn(),
    getThemes: vi.fn(),
  },
}));

vi.mock('./advisor/AdvisorPage', () => ({
  AdvisorPage: () => <div data-testid="advisor-page" />,
}));

describe('App', () => {
  beforeEach(() => {
    window.location.hash = '';
  });

  it('renders the page title and both tools in the navigation', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: /MTG Deck Builder/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Deck Advisor' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Commander Builder' })).not.toHaveAttribute('aria-current');
  });

  it('opens on the deck advisor', () => {
    render(<App />);
    expect(screen.getByTestId('advisor-page')).toBeInTheDocument();
  });

  it('renders the Commander build form at #/commander', () => {
    window.location.hash = '#/commander';
    render(<App />);
    expect(screen.getByLabelText(/MTG Arena Collection Export/i)).toBeDefined();
    expect(screen.getByLabelText(/Commander Name/i)).toBeDefined();
    expect(screen.queryByTestId('advisor-page')).toBeNull();
  });
});

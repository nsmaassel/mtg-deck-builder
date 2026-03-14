import React from 'react';
import { describe, it, expect, vi } from 'vitest';
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

describe('App', () => {
  it('renders the page title', () => {
    render(<App />);
    expect(screen.getByText(/MTG Commander Deck Builder/i)).toBeDefined();
  });

  it('renders the build form by default', () => {
    render(<App />);
    expect(screen.getByLabelText(/MTG Arena Collection Export/i)).toBeDefined();
    expect(screen.getByLabelText(/Commander Name/i)).toBeDefined();
  });
});

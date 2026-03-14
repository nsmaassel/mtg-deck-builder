import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BuildForm } from './BuildForm';

// ---------------------------------------------------------------------------
// Mock the api module
// ---------------------------------------------------------------------------
const mockBuildDeck = vi.fn();
const mockSearchCommanders = vi.fn();

vi.mock('../api', () => ({
  api: {
    buildDeck: (...args: unknown[]) => mockBuildDeck(...args),
    searchCommanders: (...args: unknown[]) => mockSearchCommanders(...args),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SAMPLE_COLLECTION = `1 Sol Ring
1 Arcane Signet
1 Command Tower
4 Plains
4 Island`;

function renderForm(onResult = vi.fn(), onError = vi.fn()) {
  return render(<BuildForm onResult={onResult} onError={onError} />);
}

describe('BuildForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchCommanders.mockResolvedValue({ commanders: [] });
  });

  // 1. Renders all expected elements
  it('renders collection textarea, commander input, mode select, bracket select and submit button', () => {
    renderForm();
    expect(screen.getByRole('textbox', { name: /collection/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /commander/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /build mode/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /target power level/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /build deck/i })).toBeInTheDocument();
  });

  // 2. Validation error when both fields empty
  it('calls onError when both collection and commander are empty on submit', async () => {
    const onError = vi.fn();
    renderForm(vi.fn(), onError);
    const submitBtn = screen.getByRole('button', { name: /build deck/i });
    await userEvent.click(submitBtn);
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/collection|commander/i));
    expect(mockBuildDeck).not.toHaveBeenCalled();
  });

  // 3. Budget input shown when mode = 'budget'
  it('reveals budget input when mode is changed to budget', async () => {
    renderForm();
    expect(screen.queryByLabelText(/max price/i)).not.toBeInTheDocument();

    const modeSelect = screen.getByRole('combobox', { name: /build mode/i });
    await userEvent.selectOptions(modeSelect, 'budget');

    expect(screen.getByLabelText(/max price/i)).toBeInTheDocument();
  });

  // 4. Budget input hidden when mode changes away from 'budget'
  it('hides budget input when mode changes away from budget', async () => {
    renderForm();
    const modeSelect = screen.getByRole('combobox', { name: /build mode/i });

    await userEvent.selectOptions(modeSelect, 'budget');
    expect(screen.getByLabelText(/max price/i)).toBeInTheDocument();

    await userEvent.selectOptions(modeSelect, 'prefer-owned');
    expect(screen.queryByLabelText(/max price/i)).not.toBeInTheDocument();
  });

  // 5. Submit calls api.buildDeck with correct args
  it('calls api.buildDeck with collectionText, commanderName and default mode on submit', async () => {
    mockBuildDeck.mockResolvedValue({
      deck: { commander: { name: 'Krenko, Mob Boss' }, slots: {}, totalCards: 100 },
      analysis: { averageCmc: 2.5, staplesCoveragePercent: 40, colorDistribution: {}, commanderName: 'Krenko', manaCurve: {} },
      gaps: { missingStaples: [], budgetUpgrades: [], premiumUpgrades: [] },
      powerLevel: { bracket: 2, score: 4, label: 'Core', signals: { gameChangers: [], tierATutors: [], tierBTutors: [], avgCmc: 2.5, interactionCount: 8, staplesCoverage: 40, fastManaRatio: 0.05, twoCardComboCount: 0 }, explanation: [], targetSuggestions: [] },
    });

    const onResult = vi.fn();
    renderForm(onResult);

    const collectionInput = screen.getByRole('textbox', { name: /collection/i });
    const commanderInput = screen.getByRole('textbox', { name: /commander/i });

    await userEvent.type(collectionInput, SAMPLE_COLLECTION);
    await userEvent.type(commanderInput, 'Krenko, Mob Boss');
    await userEvent.click(screen.getByRole('button', { name: /build deck/i }));

    await waitFor(() => {
      expect(mockBuildDeck).toHaveBeenCalledWith(
        expect.stringContaining('Sol Ring'),
        'Krenko, Mob Boss',
        'prefer-owned',
        undefined,
        undefined,
      );
    });
    expect(onResult).toHaveBeenCalled();
  });

  // 6. Loading state
  it('shows "Building deck..." on submit button while building', async () => {
    let resolvePromise!: (v: unknown) => void;
    mockBuildDeck.mockReturnValue(new Promise(res => { resolvePromise = res; }));

    renderForm();
    const collectionInput = screen.getByRole('textbox', { name: /collection/i });
    const commanderInput = screen.getByRole('textbox', { name: /commander/i });

    await userEvent.type(collectionInput, SAMPLE_COLLECTION);
    await userEvent.type(commanderInput, 'Krenko, Mob Boss');

    const submitBtn = screen.getByRole('button', { name: /build deck/i });
    await userEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /building deck/i })).toBeDisabled();
    });

    // Clean up — resolve the hanging promise
    resolvePromise(null);
  });
});

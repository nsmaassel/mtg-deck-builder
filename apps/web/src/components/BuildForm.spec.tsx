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
  it('renders skip-collection checkbox, commander input, mode select, bracket select and submit button', () => {
    renderForm();
    expect(screen.getByRole('checkbox', { name: /i'm new to commander/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /commander/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /build mode/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /target power level/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /build deck/i })).toBeInTheDocument();
  });

  // 2. Collection textarea is hidden when skip-collection is checked
  it('hides collection textarea when skip-collection is checked', () => {
    renderForm();
    expect(screen.getByRole('textbox', { name: /collection/i })).toBeInTheDocument();

    const checkbox = screen.getByRole('checkbox', { name: /i'm new to commander/i });
    fireEvent.click(checkbox);

    expect(screen.queryByRole('textbox', { name: /collection/i })).not.toBeInTheDocument();
  });

  // 3. Collection textarea shown when skip-collection is unchecked
  it('shows collection textarea when skip-collection is unchecked', () => {
    renderForm();
    const checkbox = screen.getByRole('checkbox', { name: /i'm new to commander/i });
    fireEvent.click(checkbox);
    expect(screen.queryByRole('textbox', { name: /collection/i })).not.toBeInTheDocument();

    fireEvent.click(checkbox);
    expect(screen.getByRole('textbox', { name: /collection/i })).toBeInTheDocument();
  });

  // 4. Validation error when skip-collection unchecked and both fields empty
  it('calls onError when collection and commander are empty on submit (no skip)', async () => {
    const onError = vi.fn();
    renderForm(vi.fn(), onError);
    const submitBtn = screen.getByRole('button', { name: /build deck/i });
    await userEvent.click(submitBtn);
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/collection|skip/i));
    expect(mockBuildDeck).not.toHaveBeenCalled();
  });

  // 5. Validation error when skip-collection checked but commander empty
  it('calls onError when commander is empty but skip-collection is checked', async () => {
    const onError = vi.fn();
    renderForm(vi.fn(), onError);
    const checkbox = screen.getByRole('checkbox', { name: /i'm new to commander/i });
    await userEvent.click(checkbox);

    const submitBtn = screen.getByRole('button', { name: /build deck/i });
    await userEvent.click(submitBtn);
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/commander/i));
    expect(mockBuildDeck).not.toHaveBeenCalled();
  });

  // 6. Budget input shown when mode = 'budget'
  it('reveals budget input when mode is changed to budget', async () => {
    renderForm();
    expect(screen.queryByLabelText(/max price/i)).not.toBeInTheDocument();

    const modeSelect = screen.getByRole('combobox', { name: /build mode/i });
    await userEvent.selectOptions(modeSelect, 'budget');

    expect(screen.getByLabelText(/max price/i)).toBeInTheDocument();
  });

  // 7. Budget input hidden when mode changes away from 'budget'
  it('hides budget input when mode changes away from budget', async () => {
    renderForm();
    const modeSelect = screen.getByRole('combobox', { name: /build mode/i });

    await userEvent.selectOptions(modeSelect, 'budget');
    expect(screen.getByLabelText(/max price/i)).toBeInTheDocument();

    await userEvent.selectOptions(modeSelect, 'prefer-owned');
    expect(screen.queryByLabelText(/max price/i)).not.toBeInTheDocument();
  });

  // 8. Submit calls api.buildDeck with collectionText when not skipping
  it('calls api.buildDeck with collectionText when not skipping collection', async () => {
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

  // 9. Submit calls api.buildDeck with empty string when skipping collection
  it('calls api.buildDeck with empty string when skipping collection', async () => {
    mockBuildDeck.mockResolvedValue({
      deck: { commander: { name: 'Krenko, Mob Boss' }, slots: {}, totalCards: 100 },
      analysis: { averageCmc: 2.5, staplesCoveragePercent: 0, colorDistribution: {}, commanderName: 'Krenko', manaCurve: {} },
      gaps: { missingStaples: [], budgetUpgrades: [], premiumUpgrades: [] },
      powerLevel: { bracket: 2, score: 4, label: 'Core', signals: { gameChangers: [], tierATutors: [], tierBTutors: [], avgCmc: 2.5, interactionCount: 8, staplesCoverage: 0, fastManaRatio: 0.05, twoCardComboCount: 0 }, explanation: [], targetSuggestions: [] },
    });

    const onResult = vi.fn();
    renderForm(onResult);

    const commanderInput = screen.getByRole('textbox', { name: /commander/i });
    const checkbox = screen.getByRole('checkbox', { name: /i'm new to commander/i });

    await userEvent.click(checkbox);
    await userEvent.type(commanderInput, 'Krenko, Mob Boss');
    await userEvent.click(screen.getByRole('button', { name: /build deck/i }));

    await waitFor(() => {
      expect(mockBuildDeck).toHaveBeenCalledWith(
        '',
        'Krenko, Mob Boss',
        'prefer-owned',
        undefined,
        undefined,
      );
    });
    expect(onResult).toHaveBeenCalled();
  });

  // 10. Loading state
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

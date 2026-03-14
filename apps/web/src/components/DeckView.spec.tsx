import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DeckView } from './DeckView';
import type { BuildDeckResult } from '../api';

// ---------------------------------------------------------------------------
// Fixture: realistic BuildDeckResult with all fields populated
// ---------------------------------------------------------------------------

function makeResult(overrides: Partial<BuildDeckResult> = {}): BuildDeckResult {
  return {
    deck: {
      commander: {
        name: 'Atraxa, Praetors\' Voice',
        slot: 'commander',
        cmc: 4,
        type_line: 'Legendary Creature — Phyrexian Angel Horror',
        usdPrice: 12.50,
        ownedInCollection: true,
      },
      slots: {
        ramp: [
          { name: 'Sol Ring', slot: 'ramp', cmc: 1, type_line: 'Artifact', score: 90, usdPrice: 1.50, ownedInCollection: true },
          { name: 'Arcane Signet', slot: 'ramp', cmc: 2, type_line: 'Artifact', score: 85, usdPrice: 0.50, ownedInCollection: true },
          { name: 'Cultivate', slot: 'ramp', cmc: 3, type_line: 'Sorcery', score: 80, usdPrice: 0.25, ownedInCollection: false },
        ],
        draw: [
          { name: 'Rhystic Study', slot: 'draw', cmc: 3, type_line: 'Enchantment', score: 92, usdPrice: 8.00, ownedInCollection: true },
          { name: 'Phyrexian Arena', slot: 'draw', cmc: 3, type_line: 'Enchantment', score: 78, usdPrice: 3.00, ownedInCollection: true },
        ],
        interaction: [
          { name: 'Counterspell', slot: 'interaction', cmc: 2, type_line: 'Instant', score: 88, usdPrice: 1.00, ownedInCollection: true },
          { name: 'Swords to Plowshares', slot: 'interaction', cmc: 1, type_line: 'Instant', score: 91, usdPrice: 2.00, ownedInCollection: false },
        ],
        lands: Array.from({ length: 36 }, (_, i) => ({
          name: i < 4 ? 'Plains' : i < 8 ? 'Island' : i < 12 ? 'Forest' : i < 16 ? 'Swamp' : `Land ${i}`,
          slot: 'lands', cmc: 0, type_line: 'Land', score: 50, usdPrice: 0.10, ownedInCollection: i < 20,
        })),
        winConditions: [
          { name: 'Doubling Season', slot: 'winConditions', cmc: 5, type_line: 'Enchantment', score: 95, usdPrice: 25.00, ownedInCollection: true },
        ],
        synergy: [
          { name: 'Seedborn Muse', slot: 'synergy', cmc: 5, type_line: 'Creature', score: 82, usdPrice: 5.00, ownedInCollection: true },
        ],
      },
      totalCards: 100,
    },
    analysis: {
      commanderName: 'Atraxa, Praetors\' Voice',
      manaCurve: { 0: 36, 1: 4, 2: 8, 3: 12, 4: 16, 5: 16, 6: 8 },
      colorDistribution: { W: 20, U: 20, B: 20, G: 20 },
      averageCmc: 2.8,
      staplesCoveragePercent: 62,
    },
    gaps: {
      missingStaples: [
        { name: 'Cyclonic Rift', edhrec_inclusion: 72, usdPrice: 15.00, wouldFillSlot: 'interaction' },
        { name: 'Demonic Tutor', edhrec_inclusion: 68, usdPrice: 30.00, wouldFillSlot: 'interaction' },
        { name: 'Vampiric Tutor', edhrec_inclusion: 65, usdPrice: 25.00, wouldFillSlot: 'interaction' },
      ],
      budgetUpgrades: [],
      premiumUpgrades: [],
    },
    powerLevel: {
      bracket: 3,
      score: 6,
      label: 'Enhanced',
      signals: {
        gameChangers: ['Rhystic Study', 'Cyclonic Rift'],
        tierATutors: ['Demonic Tutor'],
        tierBTutors: ['Mystical Tutor'],
        avgCmc: 2.8,
        interactionCount: 12,
        staplesCoverage: 62,
        fastManaRatio: 0.08,
        twoCardComboCount: 0,
      },
      explanation: ['Has 2 game changers.', 'Has Tier-A tutors.'],
      targetSuggestions: [
        {
          remove: 'Rhystic Study',
          removeReason: 'Game changer — too strong for Bracket 2',
          removeSlot: 'draw',
          alternatives: [
            { name: 'Harmonize', inclusion: 42, synergy: 0.05, slot: 'draw' },
            { name: 'Read the Bones', inclusion: 38, synergy: 0.03, slot: 'draw' },
          ],
        },
      ],
    },
    ...overrides,
  };
}

describe('DeckView', () => {
  // 1. Commander name in header
  it('renders commander name in deck header', () => {
    render(<DeckView result={makeResult()} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent("Atraxa, Praetors' Voice");
  });

  // 2. 100 cards in stats
  it('shows "100 cards" in stats', () => {
    render(<DeckView result={makeResult()} />);
    expect(screen.getByText(/100 cards/i)).toBeInTheDocument();
  });

  // 3. Power level badge with bracket and score
  it('shows power level badge with bracket label and score', () => {
    render(<DeckView result={makeResult()} />);
    const badge = document.querySelector('.power-level-badge');
    expect(badge).not.toBeNull();
    expect(screen.getByText(/Bracket 3/i)).toBeInTheDocument();
    expect(screen.getByText(/6\/10/i)).toBeInTheDocument();
  });

  // 4. Signal chips for game changers
  it('shows game changer signal chip when game changers are present', () => {
    render(<DeckView result={makeResult()} />);
    const chips = document.querySelectorAll('.signal-chip');
    const texts = Array.from(chips).map(c => c.textContent ?? '');
    expect(texts.some(t => /game changer/i.test(t))).toBe(true);
  });

  // 5. Target suggestions panel shown when targetSuggestions is present
  it('shows target suggestions panel when targetSuggestions contains items', () => {
    render(<DeckView result={makeResult()} />);
    expect(document.querySelector('.target-suggestions')).not.toBeNull();
    const swaps = document.querySelectorAll('.swap-suggestion');
    expect(swaps.length).toBeGreaterThanOrEqual(1);
  });

  // 6. No target suggestions panel when empty/undefined
  it('does NOT show target suggestions panel when targetSuggestions is empty', () => {
    const result = makeResult();
    result.powerLevel.targetSuggestions = [];
    render(<DeckView result={result} />);
    expect(document.querySelector('.target-suggestions')).toBeNull();
  });

  it('does NOT show target suggestions panel when targetSuggestions is undefined', () => {
    const result = makeResult();
    result.powerLevel.targetSuggestions = undefined;
    render(<DeckView result={result} />);
    expect(document.querySelector('.target-suggestions')).toBeNull();
  });

  // 7. Swap alternative chips with inclusion and synergy
  it('shows swap alternative chips with card names and inclusion %', () => {
    render(<DeckView result={makeResult()} />);
    const altChips = document.querySelectorAll('.swap-alt-chip');
    expect(altChips.length).toBeGreaterThanOrEqual(2);
    const chipTexts = Array.from(altChips).map(c => c.textContent ?? '');
    expect(chipTexts.some(t => t.includes('Harmonize'))).toBe(true);
    expect(chipTexts.some(t => t.includes('42'))).toBe(true); // inclusion %
  });

  // 8. Gaps section shown when missingStaples is non-empty
  it('shows gaps section when missingStaples are present', () => {
    render(<DeckView result={makeResult()} />);
    expect(document.querySelector('.gaps-section')).not.toBeNull();
    expect(screen.getByText(/Cyclonic Rift/)).toBeInTheDocument();
  });

  // 9. No gaps section when missingStaples empty
  it('does NOT show gaps section when missingStaples is empty', () => {
    const result = makeResult();
    result.gaps.missingStaples = [];
    render(<DeckView result={result} />);
    expect(document.querySelector('.gaps-section')).toBeNull();
  });

  // 10. AI explain button visible
  it('shows AI explain button', () => {
    render(<DeckView result={makeResult()} />);
    expect(document.querySelector('.explain-btn')).not.toBeNull();
    expect(screen.getByRole('button', { name: /explain/i })).toBeInTheDocument();
  });

  // 11. Unowned card items have card-unowned class
  it('marks cards not in collection with card-unowned class', () => {
    render(<DeckView result={makeResult()} />);
    const unownedItems = document.querySelectorAll('.card-item.card-unowned');
    expect(unownedItems.length).toBeGreaterThan(0);
    // Cultivate and Swords to Plowshares are marked ownedInCollection: false
    const names = Array.from(unownedItems).map(el => el.textContent ?? '');
    expect(names.some(t => t.includes('Cultivate') || t.includes('Swords'))).toBe(true);
  });

  // 12. Tutor signal chip shown
  it('shows tutor signal chip when tier-A tutors are present', () => {
    render(<DeckView result={makeResult()} />);
    const chips = document.querySelectorAll('.signal-chip');
    const texts = Array.from(chips).map(c => c.textContent ?? '');
    expect(texts.some(t => /tutor/i.test(t))).toBe(true);
  });

  // 13. onExplain callback is wired to explain button
  it('calls onExplain when explain button is clicked', async () => {
    const onExplain = vi.fn();
    render(<DeckView result={makeResult()} onExplain={onExplain} />);
    const btn = screen.getByRole('button', { name: /explain/i });
    btn.click();
    expect(onExplain).toHaveBeenCalledTimes(1);
  });

  // 14. Button shows "Analyzing..." when explaining prop is true
  it('shows "Analyzing..." and is disabled when explaining is true', () => {
    render(<DeckView result={makeResult()} explaining={true} />);
    const btn = screen.getByRole('button', { name: /analyzing/i });
    expect(btn).toBeDisabled();
  });

  // 15. Explanation text shown when explanation prop provided
  it('shows AI explanation text when explanation prop is provided', () => {
    render(<DeckView result={makeResult()} explanation="This deck uses proliferate synergies..." />);
    expect(screen.getByText(/proliferate synergies/i)).toBeInTheDocument();
  });
});

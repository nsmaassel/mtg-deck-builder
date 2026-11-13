import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DeckView } from './DeckView';
import type { BuildDeckResult, DeckCard } from '../api';

// ---------------------------------------------------------------------------
// Fixture: realistic BuildDeckResult with all fields populated
// ---------------------------------------------------------------------------

/** A deck card; popularity, synergy and reasons default to an unremarkable staple. */
function card(parts: Pick<DeckCard, 'name' | 'slot' | 'cmc' | 'type_line' | 'usdPrice' | 'ownedInCollection'> & Partial<DeckCard>): DeckCard {
  return { score: 0.5, popularity: 0.5, synergy: 0, reasons: ['Card draw'], ...parts };
}

function makeResult(overrides: Partial<BuildDeckResult> = {}): BuildDeckResult {
  return {
    deck: {
      commander: card({
        name: 'Atraxa, Praetors\' Voice',
        slot: 'commander',
        cmc: 4,
        type_line: 'Legendary Creature — Phyrexian Angel Horror',
        usdPrice: 12.50,
        ownedInCollection: true,
        reasons: ['The commander'],
      }),
      slots: {
        ramp: [
          card({ name: 'Sol Ring', slot: 'ramp', cmc: 1, type_line: 'Artifact', usdPrice: 1.50, ownedInCollection: true, popularity: 1, reasons: ['Mana rock'] }),
          card({ name: 'Arcane Signet', slot: 'ramp', cmc: 2, type_line: 'Artifact', usdPrice: 0.50, ownedInCollection: true }),
          card({ name: 'Cultivate', slot: 'ramp', cmc: 3, type_line: 'Sorcery', usdPrice: 0.25, ownedInCollection: false }),
        ],
        draw: [
          card({ name: 'Rhystic Study', slot: 'draw', cmc: 3, type_line: 'Enchantment', usdPrice: 8.00, ownedInCollection: true }),
          card({ name: 'Phyrexian Arena', slot: 'draw', cmc: 3, type_line: 'Enchantment', usdPrice: 3.00, ownedInCollection: true }),
        ],
        interaction: [
          card({ name: 'Counterspell', slot: 'interaction', cmc: 2, type_line: 'Instant', usdPrice: 1.00, ownedInCollection: true }),
          card({ name: 'Swords to Plowshares', slot: 'interaction', cmc: 1, type_line: 'Instant', usdPrice: 2.00, ownedInCollection: false }),
        ],
        lands: Array.from({ length: 36 }, (_, i) => card({
          name: i < 4 ? 'Plains' : i < 8 ? 'Island' : i < 12 ? 'Forest' : i < 16 ? 'Swamp' : `Land ${i}`,
          slot: 'lands', cmc: 0, type_line: 'Land', usdPrice: 0.10, ownedInCollection: i < 20,
        })),
        winConditions: [
          card({ name: 'Doubling Season', slot: 'winConditions', cmc: 5, type_line: 'Enchantment', usdPrice: 25.00, ownedInCollection: true }),
        ],
        synergy: [
          card({
            name: 'Evolution Sage', slot: 'synergy', cmc: 3, type_line: 'Creature — Elf Druid', usdPrice: 1.00, ownedInCollection: true,
            popularity: 0.42, synergy: 0.93,
            reasons: ['Proliferates repeatedly for a commander that proliferates', 'Landfall'],
          }),
        ],
      },
      totalCards: 100,
    },
    analysis: {
      commanderName: 'Atraxa, Praetors\' Voice',
      manaCurve: { 0: 36, 1: 4, 2: 8, 3: 12, 4: 16, 5: 16, 6: 8 },
      colorDistribution: { W: 20, U: 20, B: 20, G: 20 },
      averageCmc: 2.8,
      topPicksCoveragePercent: 62,
      averagePopularityPercent: 44,
      themes: [{ slug: 'proliferate', name: 'Proliferate', because: 'proliferates' }],
    },
    gaps: {
      missingCards: [
        { name: 'Cyclonic Rift', popularity: 0.61, synergy: 0, reasons: ['Board wipe'], usdPrice: 15.00, wouldFillSlot: 'interaction' },
        { name: 'Inexorable Tide', popularity: 0.3, synergy: 0.93, reasons: ['Proliferates repeatedly for a commander that proliferates'], usdPrice: 3.00, wouldFillSlot: 'synergy' },
        { name: 'Clockspinning', popularity: 0.19, synergy: 0.93, reasons: ['Proliferates repeatedly for a commander that proliferates'], usdPrice: 1.00, wouldFillSlot: 'synergy' },
      ],
      budgetUpgrades: [],
      premiumUpgrades: [],
    },
    powerLevel: {
      bracket: 3,
      targetBracket: 2,
      score: 6,
      label: 'Enhanced',
      signals: {
        gameChangers: ['Rhystic Study', 'Cyclonic Rift'],
        tierATutors: ['Demonic Tutor'],
        tierBTutors: ['Mystical Tutor'],
        avgCmc: 2.8,
        interactionCount: 12,
        topPicksCoverage: 62,
        averagePopularity: 44,
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
            { name: 'Harmonize', popularity: 0.5, synergy: 0.05, slot: 'draw' },
            { name: 'Inexorable Tide', popularity: 0.3, synergy: 0.93, slot: 'draw' },
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

  // 6. No target suggestions panel when no target bracket is set
  it('does NOT show target suggestions panel when targetBracket is undefined', () => {
    const result = makeResult();
    result.powerLevel.targetBracket = undefined;
    result.powerLevel.targetSuggestions = [];
    render(<DeckView result={result} />);
    expect(document.querySelector('.target-suggestions')).toBeNull();
  });

  it('does NOT show target suggestions panel when targetBracket equals actual bracket', () => {
    const result = makeResult();
    result.powerLevel.targetBracket = result.powerLevel.bracket;
    result.powerLevel.targetSuggestions = undefined;
    render(<DeckView result={result} />);
    expect(document.querySelector('.target-suggestions')).toBeNull();
  });

  it('says what a build aimed at a bracket left out, put in and eased off', () => {
    const result = makeResult({
      bracketTuning: {
        target: 2,
        reached: 2,
        untuned: 4,
        leftOut: [{ name: 'Rhystic Study', reason: 'On the Game Changers list' }],
        added: [],
        fewerStaples: true,
      },
    });
    render(<DeckView result={result} />);
    const tuning = document.querySelector('.bracket-tuning')!;
    expect(tuning.textContent).toContain('Built for Bracket 2');
    expect(tuning.querySelector('.tuning-left-out')!.textContent).toBe('Left out: Rhystic Study (On the Game Changers list)');
    expect(tuning.querySelector('.tuning-added')).toBeNull();
    expect(tuning.querySelector('.tuning-staples')).not.toBeNull();
  });

  it('says so when the build could not get to the bracket, and when it had nothing to change', () => {
    const short = makeResult({ bracketTuning: { target: 4, reached: 3, untuned: 3, leftOut: [], added: [], fewerStaples: false } });
    const { unmount } = render(<DeckView result={short} />);
    expect(document.querySelector('.bracket-tuning')!.textContent).toContain('Aimed at Bracket 4; the closest this build gets is Bracket 3');
    expect(document.querySelector('.bracket-tuning')!.textContent).toContain('nothing this build may use moves it up');
    unmount();

    const already = makeResult({ bracketTuning: { target: 3, reached: 3, untuned: 3, leftOut: [], added: [], fewerStaples: false } });
    render(<DeckView result={already} />);
    expect(document.querySelector('.bracket-tuning')!.textContent).toContain('nothing was changed');
  });

  it('shows no tuning box for a build with no target', () => {
    render(<DeckView result={makeResult()} />);
    expect(document.querySelector('.bracket-tuning')).toBeNull();
  });

  // 7. Swap alternative chips say how widely played and how well fitting, in words
  it('shows swap alternative chips with card names and how widely each is played', () => {
    render(<DeckView result={makeResult()} />);
    const altChips = Array.from(document.querySelectorAll('.swap-alt-chip'));
    expect(altChips.length).toBeGreaterThanOrEqual(2);
    const harmonize = altChips.find(c => c.textContent?.includes('Harmonize'))!;
    expect(harmonize.textContent).toContain('widely played');
    expect(harmonize.querySelector('em')).toHaveAttribute('title', expect.stringMatching(/not with this commander/));
    // Synergy is shown only where there is some.
    expect(harmonize.querySelector('.swap-alt-synergy')).toBeNull();
    const tide = altChips.find(c => c.textContent?.includes('Inexorable Tide'))!;
    expect(tide.textContent).toContain('often played');
    expect(tide.querySelector('.swap-alt-synergy')).toHaveTextContent('93%');
  });

  // 8. Gaps section shown when missingCards is non-empty
  it('shows the cards to get when some of the deck is not owned', () => {
    render(<DeckView result={makeResult()} />);
    const gaps = document.querySelector('.gaps-section')!;
    expect(gaps).not.toBeNull();
    expect(gaps).toHaveTextContent('Cards to Get (3)');
    expect(gaps).toHaveTextContent('Cyclonic Rift');
  });

  it('gives each card to get its reason, and its popularity as what it is', () => {
    render(<DeckView result={makeResult()} />);
    const rows = Array.from(document.querySelectorAll('.gaps-section li'));
    const rift = rows.find(row => row.textContent?.includes('Cyclonic Rift'))!;
    expect(rift.querySelector('.card-reason')).toHaveTextContent('Board wipe');
    expect(rift).toHaveTextContent('widely played · interaction');
    expect(rift.querySelector('[title]')).toHaveAttribute(
      'title',
      "Scryfall's EDHREC rank: how widely played across Commander, not with this commander",
    );
    const clockspinning = rows.find(row => row.textContent?.includes('Clockspinning'))!;
    expect(clockspinning).toHaveTextContent('rarely played · synergy');
    expect(clockspinning.querySelector('.card-reason')).toHaveTextContent('Proliferates repeatedly for a commander that proliferates');
  });

  // 9. No gaps section when missingCards empty
  it('does NOT show the cards to get when every card is owned', () => {
    const result = makeResult();
    result.gaps.missingCards = [];
    render(<DeckView result={result} />);
    expect(document.querySelector('.gaps-section')).toBeNull();
  });

  it('never claims a share of decks: no inclusion figure and no "staples" percentage', () => {
    render(<DeckView result={makeResult()} />);
    const text = document.querySelector('.deck-view')!.textContent ?? '';
    expect(text).not.toMatch(/inclusion/i);
    expect(text).not.toMatch(/staples/i);
    expect(text).not.toMatch(/% of decks/i);
  });

  it('labels the top-picks figure and says what it measures', () => {
    render(<DeckView result={makeResult()} />);
    const stat = screen.getByText('Top picks: 62%');
    expect(stat).toHaveAttribute('title', expect.stringMatching(/with every card available/));
  });

  it('shows what the bracket goes by when there is nothing else: how widely played the spells are', () => {
    render(<DeckView result={makeResult()} />);
    const chip = Array.from(document.querySelectorAll('.signal-chip')).find(c => c.textContent?.includes('Widely played'))!;
    expect(chip).toHaveTextContent('Widely played 44/100');
    expect(chip).toHaveAttribute('title', expect.stringMatching(/across Commander.*the bracket goes by this/));
  });

  it('says what the deck was built around', () => {
    render(<DeckView result={makeResult()} />);
    expect(screen.getByText(/Built around:/)).toHaveTextContent('Built around: Proliferate');
    expect(screen.getByText('Proliferate')).toHaveAttribute('title', 'A commander that proliferates');
  });

  it('leaves the themes line out for a commander with no theme', () => {
    const result = makeResult();
    result.analysis.themes = [];
    render(<DeckView result={result} />);
    expect(screen.queryByText(/Built around:/)).toBeNull();
  });

  it('gives every card in the deck its reasons on hover', () => {
    render(<DeckView result={makeResult()} />);
    const sage = Array.from(document.querySelectorAll('.card-item')).find(el => el.textContent?.includes('Evolution Sage'))!;
    expect(sage).toHaveAttribute('title', 'Proliferates repeatedly for a commander that proliferates · Landfall');
  });

  it('credits Scryfall for the card data and tags', () => {
    render(<DeckView result={makeResult()} />);
    const credit = document.querySelector('.data-credit')!;
    expect(credit).toHaveTextContent('Card data and tags: Scryfall');
    expect(credit.querySelector('a')).toHaveAttribute('href', 'https://scryfall.com');
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

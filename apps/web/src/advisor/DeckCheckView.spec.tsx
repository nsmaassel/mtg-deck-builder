import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeckCheckView } from './DeckCheckView';
import { archetypeCheck, completeCheck, incompleteCheck } from './fixtures';

function renderCheck(props: Partial<React.ComponentProps<typeof DeckCheckView>> = {}) {
  const onCraftChange = vi.fn();
  const onPickList = vi.fn();
  render(
    <DeckCheckView
      check={incompleteCheck}
      hasCollection
      craft="inventory"
      onCraftChange={onCraftChange}
      onPickList={onPickList}
      busy={false}
      {...props}
    />,
  );
  return { onCraftChange, onPickList };
}

describe('DeckCheckView', () => {
  it('summarises how much of the deck is owned and what the rest costs', () => {
    renderCheck();
    expect(screen.getByRole('heading', { level: 2, name: 'Izzet Prowess' })).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getByText('12 of 20 cards')).toBeInTheDocument();
    expect(screen.getByText('87%')).toBeInTheDocument();
    // Short 3 rare and 1 mythic of the 5 + 1 needed.
    expect(screen.getAllByTitle('5 rare wildcards').length).toBeGreaterThan(0);
    expect(screen.getAllByTitle('3 rare wildcards').length).toBeGreaterThan(0);
  });

  it('groups cards by board and marks each as owned or missing', () => {
    renderCheck();
    const main = screen.getByRole('heading', { name: /Main deck/ }).closest('.board') as HTMLElement;
    const side = screen.getByRole('heading', { name: /Sideboard/ }).closest('.board') as HTMLElement;
    expect(within(main).getByText('Shock').closest('li')).toHaveClass('is-owned');
    expect(within(main).getByText('Slickshot Show-Off').closest('li')).toHaveClass('is-missing');
    expect(within(main).getByText(/missing 4/)).toBeInTheDocument();
    expect(within(main).getByText('Not on Arena')).toBeInTheDocument();
    expect(within(side).getByText('Negate')).toBeInTheDocument();
  });

  it('reveals stand-ins with their match quality, source and reasons on demand', async () => {
    const user = userEvent.setup();
    renderCheck();
    const list = screen.getByRole('region', { name: 'Decklist' });
    expect(within(list).queryByText('Crackling Cyclops')).toBeNull();

    await user.click(within(list).getByRole('button', { name: 'Show 2 stand-ins' }));
    const cyclops = within(list).getByText('Crackling Cyclops').closest('li') as HTMLElement;
    expect(within(cyclops).getByText('Close match')).toBeInTheDocument();
    expect(within(cyclops).getByText('you own a playset')).toBeInTheDocument();
    expect(within(cyclops).getByText(/In 50% of Izzet Prowess main decks/)).toBeInTheDocument();

    const archer = within(list).getByText('Firebrand Archer').closest('li') as HTMLElement;
    expect(within(archer).getByText('Partial match')).toBeInTheDocument();
    expect(within(archer).getByText(/craft/)).toBeInTheDocument();

    await user.click(within(list).getByRole('button', { name: 'Hide 2 stand-ins' }));
    expect(within(list).queryByText('Firebrand Archer')).toBeNull();
  });

  it('says so when a missing card has no stand-in', () => {
    renderCheck();
    const vents = screen.getByRole('region', { name: 'Decklist' }).querySelectorAll('.no-subs');
    expect(vents.length).toBe(2); // Steam Vents and the sideboard Sheoldred
  });

  it('lists the plan as crafts, swaps and open slots', () => {
    renderCheck();
    const plan = screen.getByRole('complementary', { name: 'A version you can build' });
    const steps = within(plan).getAllByRole('listitem');
    expect(steps).toHaveLength(3);
    expect(steps[0]).toHaveTextContent(/Craft.*1× Steam Vents/);
    expect(steps[1]).toHaveTextContent(/Swap.*4× Slickshot Show-Off.*Crackling Cyclops/);
    expect(steps[2]).toHaveTextContent(/Open.*2× Hidden Strings/);
    expect(within(plan).getByText(/Spends/)).toBeInTheDocument();
  });

  it('lets the player keep their wildcards', async () => {
    const user = userEvent.setup();
    const { onCraftChange } = renderCheck();
    await user.click(screen.getByRole('radio', { name: 'Keep them, swaps only' }));
    expect(onCraftChange).toHaveBeenCalledWith('none');
  });

  it('hides the wildcard choice when no inventory is known', () => {
    renderCheck({ check: { ...incompleteCheck, plan: { ...incompleteCheck.plan, wildcardsLeft: undefined } } });
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByText(/Spends/)).toBeNull();
  });

  it('copies the playable list in Arena format', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderCheck();
    await user.click(screen.getByRole('button', { name: 'Copy for Arena import' }));
    expect(writeText).toHaveBeenCalledWith('Deck\n4 Shock\n4 Crackling Cyclops\n');
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('shows where a meta list was played and lets the player switch lists', async () => {
    const user = userEvent.setup();
    const { onPickList } = renderCheck({ context: archetypeCheck, activeList: 0 });
    expect(screen.getByRole('link', { name: 'alice, 1st Place' })).toHaveAttribute('href', 'https://example.test/alice');
    const picker = screen.getByRole('navigation', { name: 'Other lists of this deck' });
    await user.click(within(picker).getByRole('button', { name: /bob/ }));
    expect(onPickList).toHaveBeenCalledWith(1);
  });

  it('tells a visitor without a collection why everything is missing', () => {
    renderCheck({ hasCollection: false });
    expect(screen.getByText(/No collection loaded/)).toBeInTheDocument();
  });

  it('keeps it short when the deck is already complete', () => {
    renderCheck({ check: completeCheck });
    expect(screen.getByRole('heading', { name: 'You can build this deck' })).toBeInTheDocument();
    expect(screen.queryByText(/Playable today/)).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.getByRole('button', { name: 'Copy for Arena import' })).toBeInTheDocument();
  });
});

describe('DeckCheckView: problems and the tournament comparison', () => {
  const view = (name: string) => ({ oracleId: `id:${name}`, name, manaCost: '{1}{R}', manaValue: 2, typeLine: 'Instant', colors: ['R'] });
  const tune = {
    archetypeId: 'izzet-prowess',
    archetype: 'Izzet Prowess',
    lists: 212,
    similarity: 0.72,
    missingStaples: [
      { card: view('Steam Vents'), share: 0.9, typicalCopies: 4, inDeck: 0, owned: 0, craftRarity: 'rare' as const },
      { card: view('Shock'), share: 0.85, typicalCopies: 3.8, inDeck: 2, owned: 4 },
    ],
    unusual: [{ card: view('Hulking Raptor'), share: 0, typicalCopies: 0, inDeck: 4, owned: 4 }],
    sideboardStaples: [],
  };

  it('says what keeps the list from being a legal deck', () => {
    renderCheck({
      check: { ...incompleteCheck, issues: [{ kind: 'size', message: '28 cards in the main deck. Standard needs at least 60.', cards: [] }] },
    });
    const problems = screen.getByRole('note', { name: 'Problems with this list' });
    expect(within(problems).getByText('28 cards in the main deck. Standard needs at least 60.')).toBeInTheDocument();
  });

  it('says what the list is built around, and which combo a swap gives up', () => {
    const check = {
      ...incompleteCheck,
      themes: [{ slug: 'spellslinger', name: 'Spellslinger', because: '8 of its cards reward casting spells' }],
      plan: {
        ...incompleteCheck.plan,
        steps: incompleteCheck.plan.steps.map(step =>
          step.action === 'substitute' ? { ...step, comboLost: 'Without Slickshot Show-Off the deck loses its combo with Opt (infinite damage).' } : step,
        ),
      },
    };
    renderCheck({ check });
    expect(screen.getByText('Built around:').parentElement).toHaveTextContent('Spellslinger (8 of its cards reward casting spells)');
    expect(screen.getByText('Without Slickshot Show-Off the deck loses its combo with Opt (infinite damage).')).toBeInTheDocument();
  });

  it('says nothing about themes when the list has none', () => {
    renderCheck();
    expect(screen.queryByText('Built around:')).not.toBeInTheDocument();
  });

  it('shows no problems box for a legal deck', () => {
    renderCheck();
    expect(screen.queryByRole('note', { name: 'Problems with this list' })).not.toBeInTheDocument();
  });

  it('compares a pasted list with the archetype it resembles', () => {
    renderCheck({ check: { ...incompleteCheck, archetype: undefined, tune } });
    const panel = screen.getByRole('region', { name: 'Compared with tournament lists' });
    expect(within(panel).getByRole('heading', { name: 'Closest to Izzet Prowess: against its 212 tournament lists' })).toBeInTheDocument();
    expect(within(panel).getByText(/About 72% of the spells match/)).toBeInTheDocument();

    const lacking = within(panel).getByRole('heading', { name: 'Most lists play these, this one does not' }).parentElement as HTMLElement;
    const [vents, shock] = within(lacking).getAllByRole('listitem');
    expect(vents).toHaveTextContent('Steam Vents');
    expect(vents).toHaveTextContent('in 90% of lists, usually 4 copies');
    expect(within(vents!).getByTitle('rare wildcard')).toBeInTheDocument();
    expect(shock).toHaveTextContent('in 85% of lists, usually 3.8 copies · this list has 2');
    expect(shock).toHaveTextContent('you own a playset');

    const unusual = within(panel).getByRole('heading', { name: 'This one plays these, few lists do' }).parentElement as HTMLElement;
    expect(within(unusual).getByRole('listitem')).toHaveTextContent('Hulking Raptor in no list · this list has 4');
    expect(within(panel).queryByRole('heading', { name: 'Sideboard cards most lists bring' })).not.toBeInTheDocument();
  });

  it('words the comparison differently for a list picked from the meta, and leaves ownership out without a collection', () => {
    renderCheck({ check: { ...incompleteCheck, tune: { ...tune, similarity: undefined } }, hasCollection: false });
    const panel = screen.getByRole('region', { name: 'Compared with tournament lists' });
    expect(within(panel).getByRole('heading', { name: 'This list against all 212 Izzet Prowess lists' })).toBeInTheDocument();
    expect(within(panel).queryByText(/of the spells match/)).not.toBeInTheDocument();
    expect(within(panel).queryByText(/you own/)).not.toBeInTheDocument();
  });

  it('says so when a list plays what most lists play', () => {
    renderCheck({ check: { ...incompleteCheck, tune: { ...tune, missingStaples: [], unusual: [] } } });
    expect(screen.getByText('Nothing stands out: it plays what most of them play.')).toBeInTheDocument();
  });
});

import { describe, it, expect } from 'vitest';
import { buildCommanderTestIndex } from '@mtg/commander-recs/testing';
import { assessPowerLevel } from '@mtg/power-level';
import { listAsDeck } from './rate-list';

const index = buildCommanderTestIndex();
const krenko = index.byName('Krenko, Mob Boss')!;
const card = (name: string) => index.byName(name)!;

const rate = (names: string[]) => {
  const { deck, analysis } = listAsDeck(krenko, names.map(card));
  return assessPowerLevel(deck, analysis);
};

describe('listAsDeck', () => {
  it('sorts a list somebody else wrote into slots and keeps what the card data flags', () => {
    const { deck, analysis } = listAsDeck(krenko, [card('Sol Ring'), card('Underworld Breach'), card('Mountain')]);
    expect(deck.totalCards).toBe(4);
    expect(deck.slots.ramp.map(c => c.name)).toEqual(['Sol Ring']);
    expect(deck.slots.lands.map(c => c.name)).toEqual(['Mountain']);
    expect(Object.values(deck.slots).flat().find(c => c.name === 'Underworld Breach')!.gameChanger).toBe(true);
    expect(analysis.commanderName).toBe('Krenko, Mob Boss');
    expect(analysis.averagePopularityPercent).toBeGreaterThan(0);
  });

  it('gets the same assessment a built deck gets', () => {
    const plain = rate(['Sol Ring', 'Mountain']);
    const withChanger = rate(['Sol Ring', 'Underworld Breach', 'Mountain']);
    expect(withChanger.bracket).toBe(3);
    expect(withChanger.findings[0]).toMatchObject({ basis: 'rule', bracket: 3 });
    expect(plain.findings.every(finding => finding.basis === 'estimate')).toBe(true);
  });
});

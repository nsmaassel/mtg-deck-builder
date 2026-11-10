import { describe, it, expect } from 'vitest';
import { SAMPLE_PROFILES, sampleCollection } from './sample-collection';
import { buildTestIndex, oracleId } from './testing/fixtures';

const index = buildTestIndex();

describe('sampleCollection', () => {
  it('is the same every time for a profile', () => {
    const a = sampleCollection(index, 'regular');
    const b = sampleCollection(index, 'regular');
    expect([...a.owned]).toEqual([...b.owned]);
    expect(a.wildcards).toEqual(SAMPLE_PROFILES.regular.wildcards);
  });

  it('only holds cards that are on Arena and legal in the format, never basics', () => {
    const standard = sampleCollection(index, 'veteran', 'standard');
    expect(standard.owned.has(oracleId('Brainstorm'))).toBe(false);
    expect(standard.owned.has(oracleId('Mana Crypt'))).toBe(false);
    expect(standard.owned.has(oracleId('Island'))).toBe(false);
    expect(standard.owned.get(oracleId('Shock'))).toBe(4);
    // Pioneer-legal on paper only: never in an Arena collection.
    expect(sampleCollection(index, 'veteran').owned.has(oracleId('Hidden Strings'))).toBe(false);

    expect(sampleCollection(index, 'veteran', 'historic').owned.has(oracleId('Brainstorm'))).toBe(true);
  });

  it('grows with the profile', () => {
    const size = (profile: keyof typeof SAMPLE_PROFILES) => sampleCollection(index, profile).owned.size;
    expect(size('newcomer')).toBeLessThanOrEqual(size('regular'));
    expect(size('regular')).toBeLessThanOrEqual(size('veteran'));
  });

  it('keeps copies between one and four', () => {
    for (const count of sampleCollection(index, 'veteran').owned.values()) {
      expect(count).toBeGreaterThanOrEqual(1);
      expect(count).toBeLessThanOrEqual(4);
    }
  });
});

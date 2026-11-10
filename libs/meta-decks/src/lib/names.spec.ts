import { describe, it, expect } from 'vitest';
import { cardKey, frontFaceKey, normalizeCardName, slugify } from './names';

describe('normalizeCardName', () => {
  it('writes every two-face separator as " // "', () => {
    expect(normalizeCardName('Wax/Wane')).toBe('Wax // Wane');
    expect(normalizeCardName('Wax//Wane')).toBe('Wax // Wane');
    expect(normalizeCardName('Wax /// Wane')).toBe('Wax // Wane');
    expect(normalizeCardName('Wax // Wane')).toBe('Wax // Wane');
    expect(normalizeCardName('Wax && Wane')).toBe('Wax // Wane');
  });

  it('leaves a single ampersand in a name alone', () => {
    expect(normalizeCardName('Fox & Hound, Partners')).toBe('Fox & Hound, Partners');
  });

  it('trims and collapses whitespace', () => {
    expect(normalizeCardName('  Ember   Whelp ')).toBe('Ember Whelp');
  });
});

describe('cardKey', () => {
  it('ignores case and accents', () => {
    expect(cardKey('Lórien Sentry')).toBe('lorien sentry');
    expect(cardKey('EMBER whelp')).toBe(cardKey('Ember Whelp'));
  });

  it('gives both separator spellings the same key', () => {
    expect(cardKey('Wax/Wane')).toBe(cardKey('Wax // Wane'));
  });
});

describe('frontFaceKey', () => {
  it('keeps only the front face', () => {
    expect(frontFaceKey('Tide Scholar // Deep Study')).toBe('tide scholar');
    expect(frontFaceKey('Tide Scholar')).toBe('tide scholar');
  });
});

describe('slugify', () => {
  it('builds url-safe ids', () => {
    expect(slugify('Izzet Prowess')).toBe('izzet-prowess');
    expect(slugify('Mono-Red Aggro')).toBe('mono-red-aggro');
    expect(slugify('Death & Taxes')).toBe('death-taxes');
    expect(slugify("Lórien's Song!")).toBe('lorien-s-song');
  });
});

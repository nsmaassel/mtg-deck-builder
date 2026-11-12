import type { IndexedCard } from '@mtg/card-index';
import { landFit } from './lands';
import { profileCommander } from './profile';
import { SLOT_LIMITS, SLOT_WEIGHTS, popularityFromRank, recommend, recommendationScore, scoreFor } from './recommend';
import { assignSlot } from './slots';
import { buildCommanderTestIndex } from './testing/fixtures';
import { RECOMMENDATION_SLOTS } from './types';
import type { Recommendation } from './types';

const index = buildCommanderTestIndex();
const card = (name: string): IndexedCard => {
  const found = index.byName(name);
  if (!found) throw new Error(`fixture has no ${name}`);
  return found;
};
const profileOf = (name: string) => profileCommander(index, card(name));
const krenko = profileOf('Krenko, Mob Boss');
const zada = profileOf('Zada, Hedron Grinder');

/** Score a card that has to be allowed in the deck. */
const scored = (profile: ReturnType<typeof profileOf>, name: string): Recommendation => {
  const recommendation = scoreFor(index, profile, card(name));
  if (!recommendation) throw new Error(`${name} cannot go in this deck`);
  return recommendation;
};
const slotOf = (name: string) => assignSlot(card(name), new Set(card(name).tags)).slot;

describe('popularityFromRank', () => {
  it('runs from 1 for the most played card to 0 for an unranked one, on a log scale', () => {
    expect(popularityFromRank(1)).toBe(1);
    expect(popularityFromRank(undefined)).toBe(0);
    expect(popularityFromRank(100)).toBeCloseTo(0.553, 2);
    expect(popularityFromRank(10_000)).toBeCloseTo(0.107, 2);
    expect(popularityFromRank(1_000_000)).toBe(0);
    expect(popularityFromRank(10)).toBeGreaterThan(popularityFromRank(11));
  });
});

describe('recommendationScore', () => {
  it('weights every slot to a total of 1', () => {
    for (const slot of RECOMMENDATION_SLOTS) {
      const w = SLOT_WEIGHTS[slot];
      expect(w.popularity + w.synergy + w.cheapness + w.colorFit).toBeCloseTo(1, 10);
    }
  });

  it('lets popularity lead the staple slots and synergy lead the synergy and win-condition slots', () => {
    for (const slot of ['ramp', 'draw', 'interaction'] as const) {
      expect(SLOT_WEIGHTS[slot].popularity).toBeGreaterThan(SLOT_WEIGHTS[slot].synergy);
    }
    for (const slot of ['synergy', 'winConditions'] as const) {
      expect(SLOT_WEIGHTS[slot].synergy).toBeGreaterThan(SLOT_WEIGHTS[slot].popularity);
    }
  });

  it('is popularity, synergy, cheapness and colour fit, each times its weight', () => {
    // Ramp: 1 × 0.65 + 0 × 0.20 + (1 − 1/10) × 0.15
    expect(recommendationScore({ slot: 'ramp', popularity: 1, synergy: 0, cmc: 1 })).toBeCloseTo(0.785, 10);
    // Synergy: 0.2 × 0.35 + 0.9 × 0.55 + (1 − 3/10) × 0.10
    expect(recommendationScore({ slot: 'synergy', popularity: 0.2, synergy: 0.9, cmc: 3 })).toBeCloseTo(0.635, 10);
    // Lands: 0.5 × 0.45 + 0 × 0.15 + 1 × 0.40
    expect(recommendationScore({ slot: 'lands', popularity: 0.5, synergy: 0, cmc: 0, colorFit: 1 })).toBeCloseTo(0.625, 10);
    // A spell with mana value 10 or more gets nothing for cheapness, not a penalty.
    expect(recommendationScore({ slot: 'synergy', popularity: 0, synergy: 0, cmc: 15 })).toBe(0);
  });
});

describe('scoreFor: what may go in the deck', () => {
  it('returns null for the commander itself', () => {
    expect(scoreFor(index, krenko, card('Krenko, Mob Boss'))).toBeNull();
  });

  it('returns null outside the colour identity', () => {
    expect(scoreFor(index, krenko, card('Counterspell'))).toBeNull();
    // A land counts by identity too, not by what it happens to tap for.
    expect(scoreFor(index, krenko, card('Steam Vents'))).toBeNull();
    expect(scoreFor(index, profileOf('Niv-Mizzet, Parun'), card('Steam Vents'))).not.toBeNull();
  });

  it('returns null for a card that is not legal in the format', () => {
    expect(scoreFor(index, krenko, card('Black Lotus'))).toBeNull();
    expect(scoreFor(index, krenko, card('Brawl Only Bolt'))).toBeNull();
    const brawl = profileCommander(index, card('Krenko, Mob Boss'), { format: 'brawl' });
    expect(scoreFor(index, brawl, card('Brawl Only Bolt'))).not.toBeNull();
    expect(scoreFor(index, brawl, card('Sol Ring'))).toBeNull();
  });

  it('returns null for a card whose point is a colour the deck does not play, however popular', () => {
    // Sapphire Medallion is colourless and among the most played cards: legal in mono-red, and no use there.
    expect(card('Sapphire Medallion').colorIdentity).toEqual([]);
    expect(scoreFor(index, krenko, card('Sapphire Medallion'))).toBeNull();
    expect(recommend(index, krenko).map(pick => pick.name)).not.toContain('Sapphire Medallion');

    const inBlueRed = scored(profileOf('Niv-Mizzet, Parun'), 'Sapphire Medallion');
    expect(inBlueRed.slot).toBe('ramp');
    expect(inBlueRed.reasons).toEqual(['Makes spells cheaper']);
  });

  it('returns null for basic lands, which the builder adds by count', () => {
    expect(scoreFor(index, krenko, card('Mountain'))).toBeNull();
  });

  it('allows colourless cards in any deck', () => {
    expect(scoreFor(index, krenko, card('Sol Ring'))).not.toBeNull();
    expect(scoreFor(index, profileOf('Kozilek, the Great Distortion'), card('Sol Ring'))).not.toBeNull();
    expect(scoreFor(index, profileOf('Kozilek, the Great Distortion'), card('Lightning Bolt'))).toBeNull();
  });
});

describe('scoreFor: synergy', () => {
  it('ranks an on-theme card above an off-theme card of equal popularity', () => {
    const goblin = scored(krenko, 'Goblin Grunt 1');
    const ogre = scored(krenko, 'Hill Ogre 1');
    expect(goblin.popularity).toBe(ogre.popularity);
    expect(goblin.cmc).toBe(ogre.cmc);
    expect(goblin.slot).toBe(ogre.slot);
    expect(goblin.synergy).toBeGreaterThan(ogre.synergy);
    expect(goblin.score).toBeGreaterThan(ogre.score);
    expect(ogre.synergy).toBe(0);
  });

  it('depends on the commander, not on the card alone', () => {
    expect(scored(krenko, 'Goblin Grunt 1').synergy).toBeGreaterThan(scored(krenko, 'Trick 1').synergy);
    expect(scored(zada, 'Trick 1').synergy).toBeGreaterThan(scored(zada, 'Goblin Grunt 1').synergy);
    // Popularity is the same whoever the commander is.
    expect(scored(krenko, 'Trick 1').popularity).toBe(scored(zada, 'Trick 1').popularity);
  });

  it('ranks a card that rewards the type above one that is merely of the type', () => {
    expect(scored(krenko, 'Goblin Matron').synergy).toBeGreaterThan(scored(krenko, 'Mogg Fanatic').synergy);
  });

  it('adds up across themes without passing 1', () => {
    // Goblin Chieftain is a Goblin lord (typal) and an anthem (tokens); Goblin Matron serves typal only.
    const chieftain = scored(krenko, 'Goblin Chieftain');
    const matron = scored(krenko, 'Goblin Matron');
    expect(chieftain.themes).toEqual(['typal', 'tokens']);
    expect(matron.themes).toEqual(['typal']);
    expect(chieftain.synergy).toBeGreaterThan(matron.synergy);
    expect(chieftain.synergy).toBeLessThanOrEqual(1);
  });

  it('holds back a card that needs a creature type the deck is not built around', () => {
    const purphoros = profileOf('Purphoros, God of the Forge');
    expect(purphoros.themes.some(theme => theme.creatureTypes)).toBe(false);

    // Both are anthems. Coat of Arms works for any type; Goblin Chieftain only for Goblins.
    const coat = scored(purphoros, 'Coat of Arms');
    const chieftain = scored(purphoros, 'Goblin Chieftain');
    expect(chieftain.synergy).toBeCloseTo(coat.synergy / 2, 10);
    // In a Goblin deck the same card is wanted in full.
    expect(scored(krenko, 'Goblin Chieftain').synergy).toBeGreaterThan(0.9);
  });

  it('does not hold back a card that makes its own creatures of the type it needs', () => {
    const purphoros = profileOf('Purphoros, God of the Forge');
    const siegeGang = scored(purphoros, 'Siege-Gang Commander');
    // Two themes of weight 0.6 each want it at 0.5, with nothing taken off: 1 − (1 − 0.3)².
    expect(siegeGang.themes).toEqual(['tokens', 'creatures']);
    expect(siegeGang.synergy).toBeCloseTo(0.51, 10);
  });

  it('wants what rewards a token-only type, not other creatures of it', () => {
    const kykar = profileOf("Kykar, Wind's Fury");
    expect(scored(kykar, 'Drogskol Captain').themes).toContain('typal');
    expect(scored(kykar, 'Spectral Sailor').themes).not.toContain('typal');
  });

  it('falls back to rare shared tags when no theme catches the commander', () => {
    const squee = profileOf('Squee, Goblin Nabob');
    const phoenix = scored(squee, 'Flamewake Phoenix');
    expect(phoenix.themes).toEqual([]);
    expect(phoenix.synergy).toBeGreaterThan(0);
    // "Does a similar job" is weaker than working together: sharing every rare tag earns the cap and no more.
    expect(phoenix.synergy).toBeCloseTo(0.3, 10);
    expect(phoenix.reasons).toEqual([`Shares Scryfall's "recursion-self" tag with the commander`]);
    expect(scored(squee, 'Hill Ogre 1').synergy).toBe(0);
  });
});

describe('assignSlot', () => {
  it('gives each card one slot by what it mainly does', () => {
    expect(slotOf('Command Tower')).toBe('lands');
    expect(slotOf('Sol Ring')).toBe('ramp');
    expect(slotOf('Skirk Prospector')).toBe('ramp');
    expect(slotOf('Faithless Looting')).toBe('draw');
    expect(slotOf('Lightning Bolt')).toBe('interaction');
    expect(slotOf('Blasphemous Act')).toBe('interaction');
    expect(slotOf('Counterspell')).toBe('interaction');
    expect(slotOf('Insurrection')).toBe('winConditions');
    expect(slotOf('Craterhoof Behemoth')).toBe('winConditions');
    expect(slotOf('Goblin Matron')).toBe('synergy');
    expect(slotOf('Lightning Greaves')).toBe('synergy');
  });

  it('breaks ties by the stated priority', () => {
    // Removal first: Path to Exile gives an opponent a land and is tagged as ramp for it.
    expect(slotOf('Path to Exile')).toBe('interaction');
    // A counterspell that draws a card is still a counterspell.
    expect(slotOf('Arcane Denial')).toBe('interaction');
    // A mana rock that can be cashed in for a card is ramp.
    expect(slotOf('Mind Stone')).toBe('ramp');
  });

  it('files a Game Changer with no other job under win conditions', () => {
    expect(card('Underworld Breach').gameChanger).toBe(true);
    const assigned = assignSlot(card('Underworld Breach'), new Set(card('Underworld Breach').tags));
    expect(assigned).toEqual({ slot: 'winConditions', reason: 'On the Commander Game Changers list' });
  });
});

describe('scoreFor: reasons', () => {
  it('says what the card is and what on the commander wants it', () => {
    expect(scored(krenko, 'Mogg Fanatic').reasons).toEqual(['Goblin for a commander that cares about Goblins']);
    expect(scored(krenko, 'Impact Tremors').reasons).toEqual([
      'Impact Tremors effect: damage as creatures enter for a commander that makes creature tokens',
    ]);
    expect(scored(zada, 'Trick 1').reasons).toEqual([
      'Instant or sorcery with mana value 2 or less for a commander that cares about instants or sorceries',
    ]);
  });

  it('does not say the same thing twice', () => {
    expect(scored(krenko, 'Goblin Matron').reasons).toEqual(['Goblin that cares about Goblins, like the commander']);
    expect(scored(zada, 'Guttersnipe').reasons).toEqual(['Cares about instants or sorceries, like the commander']);
  });

  it('adds the reason for the slot after the reason for the theme', () => {
    expect(scored(krenko, 'Skirk Prospector').reasons).toEqual([
      'Goblin that cares about Goblins, like the commander',
      'Mana creature',
    ]);
    expect(scored(krenko, 'Sol Ring').reasons).toEqual(['Mana rock']);
    expect(scored(krenko, 'Chaos Warp').reasons).toEqual(['Removal']);
    expect(scored(krenko, 'Blasphemous Act').reasons).toEqual(['Board wipe']);
  });

  it('falls back to the rank when there is nothing else true to say', () => {
    expect(scored(krenko, 'Lightning Greaves').reasons).toEqual(["Scryfall's EDHREC rank #13 across Commander"]);
  });

  it('gives every recommendation one or two reasons', () => {
    for (const profile of [krenko, zada, profileOf('Isamaru, Hound of Konda')]) {
      for (const recommendation of recommend(index, profile)) {
        expect(recommendation.reasons.length).toBeGreaterThanOrEqual(1);
        expect(recommendation.reasons.length).toBeLessThanOrEqual(2);
        for (const reason of recommendation.reasons) expect(reason).not.toBe('');
      }
    }
  });

  it('only gives a reason the card has the tag or type for', () => {
    const tagFor: Record<string, string> = {
      'Mana rock': 'mana-rock',
      'Mana creature': 'mana-dork',
      Removal: 'removal',
      'Board wipe': 'sweeper',
      'Card draw': 'draw',
    };
    for (const recommendation of recommend(index, krenko)) {
      const tags = index.get(recommendation.oracleId)!.tags;
      for (const reason of recommendation.reasons) {
        const tag = tagFor[reason];
        if (tag) expect(tags).toContain(tag);
        if (reason.startsWith('Goblin ')) expect(recommendation.typeLine).toMatch(/— .*\bGoblin\b/);
      }
    }
  });
});

describe('lands', () => {
  const fit = (name: string, identity: string[], restrictionFits = false) =>
    landFit(card(name), new Set(card(name).tags), identity, restrictionFits).fit;

  it('fits a land fully when it makes every colour of the identity', () => {
    expect(fit('Steam Vents', ['U', 'R'])).toBe(1);
    expect(fit('Red Land 1', ['R'])).toBe(1);
    expect(fit('Command Tower', ['U', 'R'])).toBe(1);
  });

  it('favours lands that make more of the colours', () => {
    expect(fit('Steam Vents', ['W', 'U', 'R'])).toBeGreaterThan(fit('Red Land 1', ['W', 'U', 'R']));
    expect(fit('Command Tower', ['W', 'U', 'R'])).toBeGreaterThan(fit('Steam Vents', ['W', 'U', 'R']));
  });

  it('marks down colourless-only lands the more colours a deck has to find', () => {
    expect(fit('Reliquary Tower', ['R'])).toBeGreaterThan(fit('Reliquary Tower', ['W', 'U', 'R']));
    expect(fit('Reliquary Tower', ['R'])).toBeLessThan(fit('Red Land 1', ['R']));
    expect(fit('Reliquary Tower', [])).toBe(1);
  });

  it('does not rate a fixing land in a one-colour deck, which a basic would do as well', () => {
    expect(fit('Command Tower', ['R'])).toBeLessThan(fit('Red Land 1', ['R']));
  });

  it('fits a fetch land by the colours it can find', () => {
    expect(fit('Evolving Wilds', ['U', 'R'])).toBeGreaterThan(0);
    // Polluted Delta finds an Island or a Swamp: half of a blue-red deck, nothing for mono-red.
    expect(fit('Polluted Delta', ['U', 'R'])).toBeLessThan(fit('Evolving Wilds', ['U', 'R']));
    expect(fit('Polluted Delta', ['R'])).toBe(0);
  });

  it('halves a land whose coloured mana is restricted, unless the deck is what the restriction is for', () => {
    expect(fit('Cavern of Souls', ['U', 'R'])).toBe(0.5);
    expect(fit('Cavern of Souls', ['U', 'R'], true)).toBe(1);
    const niv = profileOf('Niv-Mizzet, Parun');
    const ezuriLike = profileOf("Kykar, Wind's Fury");
    expect(scored(niv, 'Cavern of Souls').colorFit).toBe(0.5);
    expect(scored(ezuriLike, 'Cavern of Souls').colorFit).toBe(1);
  });

  it('rates a land that makes no mana low', () => {
    expect(fit('Maze of Ith', ['R'])).toBeLessThan(fit('Reliquary Tower', ['R']));
  });

  it('recommends nonbasic lands with a reason about their mana, and never a basic', () => {
    const lands = recommend(index, krenko).filter(recommendation => recommendation.slot === 'lands');
    expect(lands.length).toBeGreaterThan(10);
    expect(lands.map(land => land.name)).not.toContain('Mountain');
    expect(lands.map(land => land.name)).not.toContain('Steam Vents');
    expect(scored(krenko, 'Red Land 1').reasons).toEqual(['Land that makes red mana']);
    expect(scored(krenko, 'Reliquary Tower').reasons).toEqual(['Land that makes colourless mana']);
    expect(scored(krenko, 'Evolving Wilds').reasons).toEqual(['Land that searches for another land']);
    for (const land of lands) expect(land.colorFit).toBeDefined();
  });

  it('puts a land that fits ahead of an equally played one that does not', () => {
    const lands = recommend(index, krenko).filter(recommendation => recommendation.slot === 'lands');
    const position = (name: string) => lands.findIndex(land => land.name === name);
    // Maze of Ith is as widely played as Red Land 2 and makes no mana.
    expect(position('Red Land 2')).toBeLessThan(position('Maze of Ith'));
    expect(position('Red Land 2')).toBeGreaterThanOrEqual(0);
  });
});

describe('recommend', () => {
  const recommendations = recommend(index, krenko);
  const inSlot = (slot: string) => recommendations.filter(recommendation => recommendation.slot === slot);

  it('returns every slot, best first, within the limits', () => {
    let previousSlot = -1;
    for (const slot of RECOMMENDATION_SLOTS) {
      const picks = inSlot(slot);
      expect(picks.length).toBeGreaterThan(0);
      const position = recommendations.indexOf(picks[0]!);
      expect(position).toBeGreaterThan(previousSlot);
      previousSlot = position;
    }
    const synergy = inSlot('synergy').slice(0, SLOT_LIMITS.synergy);
    for (let i = 1; i < synergy.length; i++) expect(synergy[i - 1]!.score).toBeGreaterThanOrEqual(synergy[i]!.score);
  });

  it('never recommends a card twice, the commander, or a card outside the identity', () => {
    const ids = recommendations.map(recommendation => recommendation.oracleId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(recommendations.map(recommendation => recommendation.name)).not.toContain('Krenko, Mob Boss');
    for (const recommendation of recommendations) {
      expect(recommendation.colorIdentity.every(color => color === 'R')).toBe(true);
    }
  });

  it('keeps universal staples at the top of the staple slots', () => {
    expect(inSlot('ramp').slice(0, 2).map(pick => pick.name)).toEqual(['Sol Ring', 'Arcane Signet']);
    expect(inSlot('interaction')[0]!.name).toBe('Chaos Warp');
    expect(inSlot('interaction').slice(0, 10).map(pick => pick.name)).toContain('Blasphemous Act');
    // A Goblin with a removal ability is on theme, and still behind the format's removal.
    expect(inSlot('interaction').slice(0, 10).map(pick => pick.name)).not.toContain('Siege-Gang Commander');
  });

  it('leads the synergy slot with what the commander is about', () => {
    const top = inSlot('synergy').slice(0, 5);
    for (const pick of top) expect(pick.themes.length).toBeGreaterThan(0);
    const zadaTop = recommend(index, zada).filter(pick => pick.slot === 'synergy').slice(0, 5);
    expect(zadaTop.map(pick => pick.name)).not.toEqual(top.map(pick => pick.name));
  });

  it('is the same list every time', () => {
    expect(recommend(index, krenko)).toEqual(recommendations);
  });

  it('honours a per-slot limit but always keeps the most played cards', () => {
    const few = recommend(index, krenko, { limit: 2 });
    // Lightning Greaves is nowhere near the top two synergy picks; it is here for being a staple.
    expect(few.map(pick => pick.name)).toContain('Lightning Greaves');
    expect(few.filter(pick => pick.slot === 'lands')).toHaveLength(2);
    expect(few.length).toBeLessThan(recommendations.length);
  });

  it('leaves out cards above a price ceiling, and cards with no known price', () => {
    const cheap = recommend(index, krenko, { maxUsd: 5 });
    const names = cheap.map(pick => pick.name);
    expect(names).toContain('Goblin Matron');
    expect(names).not.toContain('Goblin Chieftain');
    expect(names).not.toContain('Underworld Breach');
    for (const pick of cheap) expect(pick.usd).toBeLessThanOrEqual(5);
  });

  it('still recommends something for a commander with no theme', () => {
    const isamaru = recommend(index, profileOf('Isamaru, Hound of Konda'));
    expect(isamaru.map(pick => pick.name)).toEqual(expect.arrayContaining(['Sol Ring', 'Path to Exile', 'Command Tower']));
    for (const pick of isamaru) expect(pick.synergy).toBe(0);
  });
});

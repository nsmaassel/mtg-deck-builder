import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCommanderData, getThemeData, toEDHRecSlug, clearCache } from './client';
import { EDHRecNotFoundError, EDHRecError } from './schemas';

function makeEDHRecResponse(cardviews: Array<Record<string, unknown>>) {
  return {
    container: {
      json_dict: {
        cardlists: [
          {
            tag: 'highsynergycards',
            header: 'High Synergy Cards',
            cardviews,
          },
        ],
      },
    },
  };
}

const SAMPLE_CARDVIEWS = [
  { name: 'Sol Ring', inclusion: 36000, num_decks: 36000, potential_decks: 39000, synergy: 0.1, cmc: 1 },
  { name: 'Evolution Sage', inclusion: 23000, num_decks: 23000, potential_decks: 39000, synergy: 0.24, cmc: 3 },
  { name: 'Command Tower', inclusion: 38000, num_decks: 38000, potential_decks: 39000, synergy: 0.05, cmc: 0 },
];

const COMMANDER_FIXTURE = makeEDHRecResponse(SAMPLE_CARDVIEWS);
const THEME_FIXTURE = makeEDHRecResponse([
  { name: 'Doubling Season', inclusion: 33000, num_decks: 33000, potential_decks: 40000, synergy: 0.9, cmc: 5 },
]);

beforeEach(() => {
  vi.restoreAllMocks();
  clearCache();
});

describe('toEDHRecSlug', () => {
  it('converts commander name to EDHRec URL slug', () => {
    expect(toEDHRecSlug("Atraxa, Praetors' Voice")).toBe('atraxa-praetors-voice');
    expect(toEDHRecSlug('Rhys the Redeemed')).toBe('rhys-the-redeemed');
    expect(toEDHRecSlug('Adrix and Nev, Twincasters')).toBe('adrix-and-nev-twincasters');
    // TMNT-style names with & and special chars
    expect(toEDHRecSlug('Don & Leo, Problem Solvers')).toBe('don-leo-problem-solvers');
    expect(toEDHRecSlug('Heroes in a Half Shell')).toBe('heroes-in-a-half-shell');
  });
});

describe('getCommanderData', () => {
  it('returns parsed EDHRec commander data with normalized inclusion %', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => COMMANDER_FIXTURE,
    }));

    const data = await getCommanderData("Atraxa, Praetors' Voice");
    expect(data.slug).toBe('atraxa-praetors-voice');
    expect(data.cardlist).toHaveLength(3);
    expect(data.cardlist[0]!.name).toBe('Sol Ring');
    // 36000/39000 * 100 ≈ 92%
    expect(data.cardlist[0]!.inclusion).toBeGreaterThan(90);
    expect(data.cardlist[0]!.label).toBe('synergy'); // highsynergycards → synergy
  });

  it('returns cached result on second call (no extra fetch)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => COMMANDER_FIXTURE,
    });
    vi.stubGlobal('fetch', mockFetch);

    await getCommanderData("Atraxa, Praetors' Voice");
    await getCommanderData("Atraxa, Praetors' Voice");

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('throws EDHRecNotFoundError on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => null,
    }));

    await expect(getCommanderData('Unknown Commander')).rejects.toThrow(EDHRecNotFoundError);
  });

  it('throws EDHRecError on server error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({}),
    }));

    await expect(getCommanderData('Sol Ring')).rejects.toThrow(EDHRecError);
  });
});

describe('getThemeData', () => {
  it('returns parsed EDHRec theme data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => THEME_FIXTURE,
    }));

    const data = await getThemeData('tokens');
    expect(data.slug).toBe('tokens');
    expect(data.cardlist[0]!.name).toBe('Doubling Season');
    // 33000/40000 * 100 ≈ 82-83%
    expect(data.cardlist[0]!.inclusion).toBeGreaterThanOrEqual(82);
    expect(data.cardlist[0]!.inclusion).toBeLessThanOrEqual(83);
  });

  it('caches theme results', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => THEME_FIXTURE,
    });
    vi.stubGlobal('fetch', mockFetch);

    await getThemeData('tokens');
    await getThemeData('tokens');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

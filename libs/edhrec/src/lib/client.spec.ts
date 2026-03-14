import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCommanderData, getThemeData, toSlug, clearCache } from './client';
import { EDHRecNotFoundError, EDHRecError } from './schemas';

const COMMANDER_FIXTURE = {
  commander: "Atraxa, Praetors' Voice",
  slug: 'atraxa-praetors-voice',
  cardlist: [
    { name: 'Sol Ring', inclusion: 92, synergy: 0.1, label: 'ramp', cmc: 1 },
    { name: 'Proliferate', inclusion: 75, synergy: 0.8, label: 'synergy', cmc: 2 },
    { name: 'Command Tower', inclusion: 98, synergy: 0.05, label: 'land', cmc: 0 },
  ],
};

const THEME_FIXTURE = {
  theme: 'tokens',
  slug: 'tokens',
  cardlist: [
    { name: 'Doubling Season', inclusion: 85, synergy: 0.9, label: 'synergy', cmc: 5 },
  ],
  commanders: [
    { name: 'Rhys the Redeemed', slug: 'rhys-the-redeemed', colorIdentity: ['W', 'G'], edhrecRank: 42 },
  ],
};

beforeEach(() => {
  vi.restoreAllMocks();
  clearCache();
});

describe('toSlug', () => {
  it('converts commander name to slug', () => {
    expect(toSlug("Atraxa, Praetors' Voice")).toBe('atraxa-praetors-voice');
    expect(toSlug('Rhys the Redeemed')).toBe('rhys-the-redeemed');
    expect(toSlug('Adrix and Nev, Twincasters')).toBe('adrix-and-nev-twincasters');
  });
});

describe('getCommanderData', () => {
  it('returns parsed EDHRec commander data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => COMMANDER_FIXTURE,
    }));

    const data = await getCommanderData("Atraxa, Praetors' Voice");
    expect(data.slug).toBe('atraxa-praetors-voice');
    expect(data.cardlist).toHaveLength(3);
    expect(data.cardlist[0]!.name).toBe('Sol Ring');
    expect(data.cardlist[0]!.inclusion).toBe(92);
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
      json: async () => ({}),
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
  it('returns parsed EDHRec theme data with commanders', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => THEME_FIXTURE,
    }));

    const data = await getThemeData('tokens');
    expect(data.slug).toBe('tokens');
    expect(data.cardlist[0]!.name).toBe('Doubling Season');
    expect(data.commanders![0]!.name).toBe('Rhys the Redeemed');
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

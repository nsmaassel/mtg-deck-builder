import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCardByName, searchCards } from './client';
import { ScryfallNotFoundError, ScryfallError } from './schemas';

const ATRAXA_FIXTURE = {
  object: 'card',
  id: 'abc123',
  name: "Atraxa, Praetors' Voice",
  type_line: 'Legendary Creature — Phyrexian Angel Horror',
  color_identity: ['W', 'U', 'B', 'G'],
  cmc: 4,
  legalities: { commander: 'legal' },
  prices: { usd: '12.50' },
  edhrec_rank: 5,
};

const SEARCH_FIXTURE = {
  object: 'list',
  total_cards: 1,
  has_more: false,
  data: [ATRAXA_FIXTURE],
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('getCardByName', () => {
  it('returns a parsed ScryfallCard on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ATRAXA_FIXTURE,
    }));

    const card = await getCardByName("Atraxa, Praetors' Voice");
    expect(card.name).toBe("Atraxa, Praetors' Voice");
    expect(card.color_identity).toEqual(['W', 'U', 'B', 'G']);
    expect(card.legalities.commander).toBe('legal');
  });

  it('throws ScryfallNotFoundError on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    }));

    await expect(getCardByName('Nonexistent Card')).rejects.toThrow(ScryfallNotFoundError);
  });

  it('throws ScryfallError on non-404 HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      json: async () => ({}),
    }));

    await expect(getCardByName('Sol Ring')).rejects.toThrow(ScryfallError);
  });

  it('strips unknown fields via Zod passthrough (does not throw)', async () => {
    const withExtra = { ...ATRAXA_FIXTURE, some_future_field: 'ignored' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => withExtra,
    }));
    const card = await getCardByName("Atraxa, Praetors' Voice");
    expect(card.name).toBe("Atraxa, Praetors' Voice");
  });
});

describe('searchCards', () => {
  it('returns combined card array from search result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => SEARCH_FIXTURE,
    }));

    const cards = await searchCards('is:commander');
    expect(cards).toHaveLength(1);
    expect(cards[0]!.name).toBe("Atraxa, Praetors' Voice");
  });

  it('returns empty array when no results', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
    const cards = await searchCards('q=zzznomatch');
    expect(cards).toHaveLength(0);
  });
});

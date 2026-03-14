import { describe, it, expect } from 'vitest';
import { buildApp } from './app';

describe('API health', () => {
  it('GET /health returns 200 ok', async () => {
    const app = buildApp();
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { status: string };
    expect(body.status).toBe('ok');
  });
});

describe('POST /api/collection/parse', () => {
  it('returns 400 for empty collection', async () => {
    const app = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/collection/parse',
      payload: { collectionText: '' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('parses a valid Arena export', async () => {
    const app = buildApp();
    const collectionText = '1 Sol Ring\n1 Command Tower\n1 Atraxa, Praetors\' Voice';
    const response = await app.inject({
      method: 'POST',
      url: '/api/collection/parse',
      payload: { collectionText },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { totalCards: number };
    expect(body.totalCards).toBeGreaterThan(0);
  });
});

describe('GET /api/themes', () => {
  it('returns a list of themes', async () => {
    const app = buildApp();
    const response = await app.inject({ method: 'GET', url: '/api/themes' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { themes: unknown[] };
    expect(Array.isArray(body.themes)).toBe(true);
    expect(body.themes.length).toBeGreaterThan(0);
  });
});

import { describe, it, expect } from 'vitest';
import { TextModel } from '@mtg/deck-advisor';
import type { AdvisorData } from '@mtg/deck-advisor';
import { buildTestIndex, collectionOf } from '@mtg/deck-advisor/testing';
import type { MetaArchetype, MetaSnapshot, TournamentDeck } from '@mtg/meta-decks/types';
import { AdvisorChat, AdvisorChatError } from './chat';
import { ScriptedLlm, callTool, lastToolResult, say } from './testing';

const index = buildTestIndex();

function list(player: string, main: Record<string, number>, side: Record<string, number> = {}): TournamentDeck {
  const lines = (cards: Record<string, number>) => Object.entries(cards).map(([name, count]) => ({ name, count }));
  return { player, result: '1st Place', uri: 'https://example.test/list', event: 'Test Challenge', date: '2026-11-01', main: lines(main), side: lines(side) };
}

function archetype(id: string, name: string, colors: string[], representative: TournamentDeck, metaShare: number): MetaArchetype {
  return {
    id, name, colors, deckCount: Math.round(metaShare * 100), metaShare, matchWins: 60, matchLosses: 40, winRate: 0.6,
    cards: representative.main.map(l => ({ name: l.name, mainShare: 1, mainAvg: l.count, sideShare: 0, sideAvg: 0 })),
    representative, otherLists: [],
  };
}

const snapshot: MetaSnapshot = {
  format: 'standard', generatedAt: '2026-11-09T00:00:00Z', from: '2026-10-01', to: '2026-11-08',
  eventCount: 12, totalDecks: 100, minMatchesForWinRate: 50, fieldWinRate: 0.55,
  archetypes: [
    archetype('mono-black-midrange', 'Mono-Black Midrange', ['B'], list('bob', {
      'Sheoldred, the Apocalypse': 4, 'Go for the Throat': 4, 'Cut Down': 4, Swamp: 12,
    }), 0.5),
    archetype('izzet-prowess', 'Izzet Prowess', ['U', 'R'], list('alice', {
      'Slickshot Show-Off': 4, Shock: 4, Opt: 4, 'Steam Vents': 4, Island: 4, Mountain: 4,
    }), 0.3),
  ],
  sources: [],
};

const data: AdvisorData = { index, text: new TextModel(index), meta: new Map([['standard', snapshot]]) };
const owned = collectionOf({ Shock: 4, Opt: 4, 'Crackling Cyclops': 4 }, { common: 5, uncommon: 5, rare: 2, mythic: 0 });

/** Run one tool through a real agent turn and return what the model was handed back. */
async function toolResult(name: string, args: Record<string, unknown>, collection = owned as typeof owned | null) {
  let result: Record<string, unknown> = {};
  const model = new ScriptedLlm([
    callTool(name, args),
    request => {
      result = lastToolResult(request);
      return say('done');
    },
  ]);
  await new AdvisorChat({ data, model }).send({ message: 'go', collection });
  return result;
}

describe('AdvisorChat', () => {
  it('answers through the model, running the tools it asks for and reporting them as steps', async () => {
    const model = new ScriptedLlm([
      callTool('list_meta_decks', { format: 'standard' }),
      callTool('check_meta_deck', { format: 'standard', archetype: 'izzet-prowess' }),
      say('Build Izzet Prowess: you own most of it.'),
    ]);
    const chat = new AdvisorChat({ data, model });
    const turn = await chat.send({ message: 'Which deck am I closest to?', collection: owned });

    expect(turn.reply).toBe('Build Izzet Prowess: you own most of it.');
    expect(turn.steps).toEqual([
      { tool: 'list_meta_decks', summary: 'Looked up the standard meta against your collection' },
      { tool: 'check_meta_deck', summary: 'Checked izzet-prowess against your collection' },
    ]);
    expect(turn.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(model.requests).toHaveLength(3);
  });

  it('gives the model the instruction and every tool', async () => {
    const model = new ScriptedLlm([say('hello')]);
    await new AdvisorChat({ data, model }).send({ message: 'hi', collection: null });
    const request = model.requests[0]!;
    expect(JSON.stringify(request.config?.systemInstruction)).toContain('Every fact comes from a tool');
    expect(Object.keys(request.toolsDict).sort()).toEqual([
      'check_decklist', 'check_meta_deck', 'collection_summary', 'find_stand_ins', 'list_meta_decks', 'lookup_cards',
    ]);
  });

  it('remembers the conversation within a session and not across sessions', async () => {
    const model = new ScriptedLlm([say('first answer'), say('second answer'), say('fresh answer')]);
    const chat = new AdvisorChat({ data, model });
    const first = await chat.send({ message: 'remember the word pineapple', collection: null });
    const second = await chat.send({ sessionId: first.sessionId, message: 'what was the word?', collection: null });
    expect(second.sessionId).toBe(first.sessionId);
    expect(JSON.stringify(model.requests[1]!.contents)).toContain('pineapple');

    const other = await chat.send({ message: 'what was the word?', collection: null });
    expect(other.sessionId).not.toBe(first.sessionId);
    expect(JSON.stringify(model.requests[2]!.contents)).not.toContain('pineapple');
  });

  it('starts afresh, and says so, when the session id is unknown or has expired', async () => {
    let now = 0;
    const model = new ScriptedLlm([say('a'), say('b'), say('c'), say('d')]);
    const chat = new AdvisorChat({ data, model, sessionTtlMs: 1000, now: () => now });
    const first = await chat.send({ message: 'pineapple', collection: null });
    expect(first.restarted).toBeUndefined();

    const unknown = await chat.send({ sessionId: 'made-up-id', message: 'hi', collection: null });
    expect(unknown.sessionId).not.toBe('made-up-id');
    expect(unknown.restarted).toBe(true);

    now = 5000;
    const later = await chat.send({ sessionId: first.sessionId, message: 'still there?', collection: null });
    expect(later.sessionId).not.toBe(first.sessionId);
    expect(later.restarted).toBe(true);
    expect(JSON.stringify(model.requests[2]!.contents)).not.toContain('pineapple');

    const continued = await chat.send({ sessionId: later.sessionId, message: 'and now?', collection: null });
    expect(continued.restarted).toBeUndefined();
  });

  it('leaves no trace of a turn that failed, and does not count it', async () => {
    const model = new ScriptedLlm([
      say('first answer'),
      callTool('collection_summary'),
      { errorCode: '503', errorMessage: 'overloaded' },
      say('second answer'),
    ]);
    const chat = new AdvisorChat({ data, model, maxTurnsPerSession: 2 });
    const first = await chat.send({ message: 'alpha question', collection: null });

    await expect(chat.send({ sessionId: first.sessionId, message: 'bravo question', collection: null }))
      .rejects.toMatchObject({ kind: 'model' });

    // The retry is the conversation's second turn, not its third, and the model sees
    // the failed question once (now), not twice, and none of its orphaned tool calls.
    const retry = await chat.send({ sessionId: first.sessionId, message: 'bravo question', collection: null });
    expect(retry).toMatchObject({ sessionId: first.sessionId, reply: 'second answer' });
    const sent = JSON.stringify(model.requests.at(-1)!.contents);
    expect(sent).toContain('alpha question');
    expect(sent.split('bravo question')).toHaveLength(2);
    expect(sent).not.toContain('collection_summary');
  });

  it('refuses a second message while the first is still being answered, and keeps that conversation alive', async () => {
    let release: (value: string) => void = () => undefined;
    const held = new Promise<string>(resolve => { release = resolve; });
    let now = 0;
    const slow = new ScriptedLlm([say('warm-up'), say('other'), say('slow answer')]);
    const original = slow.generateContentAsync.bind(slow);
    let calls = 0;
    slow.generateContentAsync = async function* (request) {
      calls += 1;
      if (calls === 2) await held;
      yield* original(request);
    };

    const chat = new AdvisorChat({ data, model: slow, maxSessions: 1, sessionTtlMs: 10, now: () => now });
    const first = await chat.send({ message: 'warm-up', collection: null });
    const pending = chat.send({ sessionId: first.sessionId, message: 'slow one', collection: null });
    await new Promise(resolve => setTimeout(resolve, 0));

    await expect(chat.send({ sessionId: first.sessionId, message: 'impatient', collection: null }))
      .rejects.toMatchObject({ kind: 'busy' });

    // Another visitor arrives long after the TTL with the session table full:
    // the conversation that is mid-answer must not be evicted to make room.
    now = 1000;
    const other = chat.send({ message: 'someone else', collection: null });
    release('go');
    expect((await pending).sessionId).toBe(first.sessionId);
    await other;
  });

  it('forgets the longest-idle conversation when too many are open', async () => {
    let now = 0;
    const model = new ScriptedLlm([say('a'), say('b'), say('c'), say('d')]);
    const chat = new AdvisorChat({ data, model, maxSessions: 2, now: () => now });
    const first = await chat.send({ message: 'pineapple', collection: null });
    now = 1;
    await chat.send({ message: 'two', collection: null });
    now = 2;
    await chat.send({ message: 'three', collection: null });
    now = 3;
    const back = await chat.send({ sessionId: first.sessionId, message: 'again', collection: null });
    expect(back.sessionId).not.toBe(first.sessionId);
  });

  it('stops a conversation at its turn limit', async () => {
    const model = new ScriptedLlm([say('a'), say('b')]);
    const chat = new AdvisorChat({ data, model, maxTurnsPerSession: 1 });
    const first = await chat.send({ message: 'one', collection: null });
    await expect(chat.send({ sessionId: first.sessionId, message: 'two', collection: null }))
      .rejects.toMatchObject({ name: 'AdvisorChatError', kind: 'limit' });
  });

  it('reports a failing model as a model error', async () => {
    const failing = new ScriptedLlm([]);
    await expect(new AdvisorChat({ data, model: failing }).send({ message: 'hi', collection: null }))
      .rejects.toBeInstanceOf(AdvisorChatError);

    const erroring = new ScriptedLlm([{ errorCode: '429', errorMessage: 'quota exhausted' }]);
    await expect(new AdvisorChat({ data, model: erroring }).send({ message: 'hi', collection: null }))
      .rejects.toMatchObject({ kind: 'model', message: 'quota exhausted' });
  });

  it('refuses to hand back an empty answer', async () => {
    const model = new ScriptedLlm([say('   ')]);
    await expect(new AdvisorChat({ data, model }).send({ message: 'hi', collection: null }))
      .rejects.toMatchObject({ kind: 'model' });
  });

  it('names its model', () => {
    expect(new AdvisorChat({ data, model: 'gemini-test' }).modelName).toBe('gemini-test');
    expect(new AdvisorChat({ data, model: new ScriptedLlm([]) }).modelName).toBe('scripted');
  });
});

describe('advisor tools', () => {
  it('says when a check ran without a collection, in the result and in the step label', async () => {
    const without = await toolResult('check_meta_deck', { format: 'standard', archetype: 'izzet-prowess' }, null);
    expect(without['collectionLoaded']).toBe(false);
    expect(without['note']).toMatch(/No collection is loaded/);
    const withOne = await toolResult('check_meta_deck', { format: 'standard', archetype: 'izzet-prowess' });
    expect(withOne['collectionLoaded']).toBe(true);
    expect(withOne['note']).toBeUndefined();

    const standIns = await toolResult('find_stand_ins', { card: 'Slickshot Show-Off', format: 'standard' }, null);
    expect(standIns['collectionLoaded']).toBe(false);

    const model = new ScriptedLlm([callTool('check_meta_deck', { format: 'standard', archetype: 'izzet-prowess' }), say('ok')]);
    const turn = await new AdvisorChat({ data, model }).send({ message: 'go', collection: null });
    expect(turn.steps).toEqual([{ tool: 'check_meta_deck', summary: 'Checked izzet-prowess' }]);
  });

  it('describes spare copies the same way in every tool', async () => {
    const check = await toolResult('check_decklist', { deckText: '4 Steam Vents\n4 Shock\n4 Opt\n', format: 'standard' });
    const vents = (check['missing'] as Array<Record<string, unknown>>).find(m => m['card'] === 'Steam Vents')!;
    const fromCheck = (vents['standIns'] as Array<Record<string, string>>).find(s => s['card'] === 'Island')!;
    const direct = await toolResult('find_stand_ins', { card: 'Steam Vents', format: 'standard', deckColors: 'UR' });
    const fromDirect = (direct['standIns'] as Array<Record<string, string>>).find(s => s['card'] === 'Island')!;
    expect(fromCheck['source']).toBe('owned, any number spare');
    expect(fromDirect['source']).toBe('owned, any number spare');
  });

  it('collection_summary describes the collection, or says none is loaded', async () => {
    expect(await toolResult('collection_summary', {})).toMatchObject({
      loaded: true, differentCards: 3, copies: 12, wildcards: { common: 5, uncommon: 5, rare: 2, mythic: 0 },
    });
    expect(await toolResult('collection_summary', {}, null)).toEqual({ loaded: false });
  });

  it('list_meta_decks orders decks by the collection and says where the numbers come from', async () => {
    const result = await toolResult('list_meta_decks', { format: 'standard' });
    const decks = result['decks'] as Array<Record<string, unknown>>;
    expect(decks.map(d => d['archetype'])).toEqual(['izzet-prowess', 'mono-black-midrange']);
    expect(decks[0]).toMatchObject({ name: 'Izzet Prowess', colors: 'UR', metaSharePercent: 30, winRatePercent: 60 });
    expect(decks[0]?.['wildcardsNeeded']).toMatchObject({ rare: 8 });
    expect(result['source']).toMatch(/not Arena ladder results/);
    expect(result['fieldWinRatePercent']).toBe(55);
    expect(result['orderedBy']).toMatch(/closest/);
  });

  it('list_meta_decks falls back to popularity without a collection, and explains a format it has no data for', async () => {
    const result = await toolResult('list_meta_decks', { format: 'Standard' }, null);
    const decks = result['decks'] as Array<Record<string, unknown>>;
    expect(decks.map(d => d['archetype'])).toEqual(['mono-black-midrange', 'izzet-prowess']);
    expect(decks[0]?.['ownedPercent']).toBeUndefined();

    expect((await toolResult('list_meta_decks', { format: 'historic' }))['error']).toMatch(/Meta decks exist for: standard/);
  });

  it('check_meta_deck reports the gap, the stand-ins with their reasons, and the plan', async () => {
    const result = await toolResult('check_meta_deck', { format: 'standard', archetype: 'izzet-prowess' });
    expect(result).toMatchObject({ deck: 'Izzet Prowess', colors: 'UR', ownedCards: '16 of 24', list: 'alice, 1st Place, Test Challenge (2026-11-01)' });

    const missing = result['missing'] as Array<Record<string, unknown>>;
    const slickshot = missing.find(m => m['card'] === 'Slickshot Show-Off')!;
    expect(slickshot).toMatchObject({ copiesMissing: 4, wildcard: 'rare' });
    const standIns = slickshot['standIns'] as Array<Record<string, unknown>>;
    expect(standIns[0]).toMatchObject({ card: 'Crackling Cyclops', match: 'close', source: 'owned, 4 spare' });
    expect(standIns[0]?.['why']).toMatch(/Same job: prowess like/);

    const plan = result['buildableToday'] as { steps: Array<Record<string, unknown>>; wildcardsSpent: Record<string, number> };
    expect(plan.wildcardsSpent['rare']).toBe(2);
    expect(plan.steps.some(s => s['action'] === 'craft')).toBe(true);
  });

  it('check_meta_deck keeps the wildcards when asked, and rejects an archetype it does not know', async () => {
    const kept = await toolResult('check_meta_deck', { format: 'standard', archetype: 'izzet-prowess', spendWildcards: false });
    const plan = kept['buildableToday'] as { steps: Array<Record<string, unknown>> };
    expect(plan.steps.some(s => s['action'] === 'craft')).toBe(false);

    expect((await toolResult('check_meta_deck', { format: 'standard', archetype: 'nope' }))['error']).toMatch(/list_meta_decks/);
  });

  it('check_decklist reads a pasted list in any format', async () => {
    const result = await toolResult('check_decklist', {
      deckText: 'Commander\n1 Niv-Mizzet, Parun\n\nDeck\n1 Opt\n1 Shock\n', format: 'HistoricBrawl',
    });
    expect(result).toMatchObject({ format: 'brawl', colors: 'UR', ownedCards: '2 of 3' });

    expect((await toolResult('check_decklist', { deckText: 'no cards here', format: 'standard' }))['error']).toMatch(/No cards could be read/);
    expect((await toolResult('check_decklist', { deckText: '4 Shock', format: 'tiny-leaders' }))['error']).toMatch(/Unknown format/);
  });

  it('lookup_cards returns rules text and ownership, and flags names it cannot find', async () => {
    const result = await toolResult('lookup_cards', { names: ['shock', 'Not A Card'] });
    const [shock, unknown] = result['cards'] as Array<Record<string, unknown>>;
    expect(shock).toMatchObject({
      name: 'Shock', manaCost: '{R}', type: 'Instant', craftWildcard: 'common', copiesOwned: 4,
      text: 'Shock deals 2 damage to any target.',
    });
    expect(shock?.['roles']).toContain('burn');
    expect(unknown).toEqual({ name: 'Not A Card', error: 'No card by this name.' });
  });

  it('find_stand_ins works for a single card, in the card\'s own colours unless told otherwise', async () => {
    const result = await toolResult('find_stand_ins', { card: 'Slickshot Show-Off', format: 'standard' });
    expect(result).toMatchObject({ card: 'Slickshot Show-Off', colors: 'R' });
    const standIns = result['standIns'] as Array<Record<string, unknown>>;
    expect(standIns[0]).toMatchObject({ card: 'Crackling Cyclops', source: 'owned, 4 spare' });

    expect((await toolResult('find_stand_ins', { card: 'Blorp', format: 'standard' }))['error']).toMatch(/No card named/);
  });
});

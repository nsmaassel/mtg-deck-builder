import type { FastifyInstance, FastifyReply } from 'fastify';
// Types only: the agent library pulls in the ADK, which a server without a model never loads.
import type { AdvisorChat, AdvisorChatError } from '@mtg/advisor-agent';
import { FORMATS } from '@mtg/card-index';
import type { Format } from '@mtg/card-index';
import { importCollection, mergeImports, resolveCollection } from '@mtg/collection';
import type { CollectionImport, ImportedDeck } from '@mtg/collection';
import {
  FORMAT_RULES,
  SAMPLE_PROFILES,
  checkDeck,
  collectionCombos,
  deckFromTournamentList,
  describeMeta,
  formatArenaDeck,
  parseDeckText,
  parseFormat,
  sampleCollection,
} from '@mtg/deck-advisor';
import type { AdvisorData, Collection, DeckLine, SampleProfile, Wildcards } from '@mtg/deck-advisor';
import type { MetaArchetype, TournamentDeck } from '@mtg/meta-decks/types';
import type { ChatBudget } from '../chat-budget';

/** A full collection is a few hundred kilobytes of JSON; an export file can be several megabytes of text. */
const IMPORT_BODY_LIMIT = 8 * 1024 * 1024;
const COLLECTION_BODY_LIMIT = 2 * 1024 * 1024;
const MAX_COLLECTION_CARDS = 40_000;
const MAX_DECK_TEXT = 20_000;
const MAX_CHAT_MESSAGE = 2_000;

interface CollectionBody {
  cards?: Record<string, number>;
  wildcards?: Partial<Wildcards>;
}

const collectionSchema = {
  type: 'object',
  properties: {
    cards: { type: 'object', additionalProperties: { type: 'integer', minimum: 0, maximum: 9999 }, maxProperties: MAX_COLLECTION_CARDS },
    wildcards: {
      type: 'object',
      properties: {
        common: { type: 'integer', minimum: 0 },
        uncommon: { type: 'integer', minimum: 0 },
        rare: { type: 'integer', minimum: 0 },
        mythic: { type: 'integer', minimum: 0 },
      },
    },
  },
} as const;

function toCollection(body: CollectionBody | undefined): Collection {
  const owned = new Map<string, number>();
  for (const [oracleId, count] of Object.entries(body?.cards ?? {})) {
    if (count > 0) owned.set(oracleId, count);
  }
  const collection: Collection = { owned };
  if (body?.wildcards) {
    collection.wildcards = {
      common: body.wildcards.common ?? 0,
      uncommon: body.wildcards.uncommon ?? 0,
      rare: body.wildcards.rare ?? 0,
      mythic: body.wildcards.mythic ?? 0,
    };
  }
  return collection;
}

function unavailable(reply: FastifyReply) {
  return reply.status(503).send({
    error: 'Deck advisor data not built',
    message: 'The card index is missing on this server. Run `pnpm data:cards` (and `pnpm data:meta` for meta decks), then restart.',
  });
}

/** Turn a deck saved in the Arena client (grpIds) into deck text the checker reads. */
function savedDeckText(deck: ImportedDeck, data: AdvisorData): { text: string; unknownCards: number } {
  let unknownCards = 0;
  const lines = (cards: ImportedDeck['mainDeck']): DeckLine[] =>
    cards.flatMap(({ arenaId, count }) => {
      const card = data.index.byArenaId(arenaId);
      if (!card) {
        unknownCards += count;
        return [];
      }
      return [{ name: card.arenaName ?? card.name, count }];
    });
  const text = formatArenaDeck({
    commander: lines(deck.commandZone),
    companion: lines(deck.companions),
    main: lines(deck.mainDeck),
    sideboard: lines(deck.sideboard),
  });
  return { text, unknownCards };
}

/** Formats in the order players meet them on Arena, Standard first. */
function formatOrder(format: string): number {
  const index = (FORMATS as readonly string[]).indexOf(format);
  return index === -1 ? FORMATS.length : index;
}

/** Snapshot links come from third-party data and end up in an href: web links only. */
function webLink(uri: string): string {
  return /^https?:\/\//i.test(uri) ? uri : '';
}

function isChatError(err: unknown): err is AdvisorChatError {
  return err instanceof Error && err.name === 'AdvisorChatError' && 'kind' in err;
}

function listSummary(list: TournamentDeck) {
  return { player: list.player, result: list.result, event: list.event, date: list.date, uri: webLink(list.uri) };
}

export interface AdvisorRouteOptions {
  advisor: AdvisorData | null;
  /** The conversational agent. Absent when no model is configured; the rest of the advisor does not need it. */
  chat?: AdvisorChat | null;
  chatBudget?: ChatBudget | null;
}

export async function advisorRoutes(app: FastifyInstance, options: AdvisorRouteOptions): Promise<void> {
  const data = options.advisor;
  const chat = data ? (options.chat ?? null) : null;
  const chatBudget = options.chatBudget ?? null;

  app.get('/api/advisor/status', async () => {
    if (!data) return { ready: false, formats: [], meta: [], agent: { available: false } };
    return {
      ready: true,
      agent: chat ? { available: true, model: chat.modelName } : { available: false },
      cards: { count: data.index.size, builtAt: data.index.builtAt, sourceUpdatedAt: data.index.cardsUpdatedAt },
      combos: data.combos ? { count: data.combos.size, sourceUpdatedAt: data.combos.source.timestamp } : undefined,
      formats: FORMATS.map(key => ({ key, label: FORMAT_RULES[key].label, onArena: FORMAT_RULES[key].onArena })),
      meta: [...data.meta.values()].sort((a, b) => formatOrder(a.format) - formatOrder(b.format)).map(snapshot => ({
        format: snapshot.format,
        from: snapshot.from,
        to: snapshot.to,
        totalDecks: snapshot.totalDecks,
        eventCount: snapshot.eventCount,
        generatedAt: snapshot.generatedAt,
        sources: snapshot.sources,
      })),
    };
  });

  // A made-up collection so a visitor without an Arena export can still try the advisor.
  app.get<{ Querystring: { profile?: string; format?: string } }>('/api/advisor/collection/sample', {
    schema: {
      querystring: {
        type: 'object',
        properties: { profile: { type: 'string' }, format: { type: 'string' } },
      },
    },
    handler: async (request, reply) => {
      if (!data) return unavailable(reply);
      const profile = (request.query.profile ?? 'regular') as SampleProfile;
      if (!Object.hasOwn(SAMPLE_PROFILES, profile)) {
        return reply.status(400).send({ error: 'Unknown profile', message: `Choose one of: ${Object.keys(SAMPLE_PROFILES).join(', ')}.` });
      }
      // Pioneer by default: every Standard card is Pioneer-legal, so one sample serves both metas.
      const format = parseFormat(request.query.format ?? 'pioneer');
      if (!format) return reply.status(400).send({ error: 'Unknown format' });

      const collection = sampleCollection(data.index, profile, format);
      const totalCards = [...collection.owned.values()].reduce((sum, n) => sum + n, 0);
      return reply.send({
        profile,
        label: SAMPLE_PROFILES[profile].label,
        description: SAMPLE_PROFILES[profile].description,
        totalCards,
        uniqueCards: collection.owned.size,
        collection: { cards: Object.fromEntries(collection.owned), wildcards: collection.wildcards },
      });
    },
  });

  app.post<{ Body: { texts: string[] } }>('/api/advisor/collection/import', {
    bodyLimit: IMPORT_BODY_LIMIT,
    schema: {
      body: {
        type: 'object',
        required: ['texts'],
        properties: { texts: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'string' } } },
      },
    },
    handler: async (request, reply) => {
      if (!data) return unavailable(reply);

      const imports: CollectionImport[] = request.body.texts
        .filter(text => text.trim())
        .map(text => importCollection(text));
      if (imports.length === 0) {
        return reply.status(400).send({ error: 'Nothing to import', message: 'Paste or upload a collection export.' });
      }

      const merged = mergeImports(...imports);
      const resolved = resolveCollection(merged, data.index);
      if (resolved.uniqueCards === 0 && !merged.wildcards && !merged.decks?.length) {
        return reply.status(400).send({
          error: 'No cards recognised',
          message: 'None of the input matched a known collection format or card name.',
          warnings: merged.warnings,
          unrecognizedLines: merged.unrecognizedLines,
        });
      }

      return reply.send({
        formats: imports.map(i => i.format),
        totalCards: resolved.totalCards,
        uniqueCards: resolved.uniqueCards,
        unresolved: {
          count: resolved.unresolved.length,
          sample: resolved.unresolved.slice(0, 20).map(e => e.name ?? `Arena id ${String(e.arenaId)}`),
        },
        wildcards: merged.wildcards,
        vaultProgress: merged.vaultProgress,
        decks: (merged.decks ?? []).map(deck => {
          const { text, unknownCards } = savedDeckText(deck, data);
          return { id: deck.id, name: deck.name, format: parseFormat(deck.format), arenaFormat: deck.format, deckText: text, unknownCards };
        }),
        warnings: merged.warnings,
        unrecognizedLines: merged.unrecognizedLines,
        collection: { cards: Object.fromEntries(resolved.owned), wildcards: merged.wildcards },
      });
    },
  });

  app.post<{
    Body: {
      deckText: string;
      format: string;
      collection?: CollectionBody;
      archetype?: { id: string };
      craft?: 'inventory' | 'none';
    };
  }>('/api/advisor/deck/check', {
    bodyLimit: COLLECTION_BODY_LIMIT,
    schema: {
      body: {
        type: 'object',
        required: ['deckText', 'format'],
        properties: {
          deckText: { type: 'string', maxLength: MAX_DECK_TEXT },
          format: { type: 'string' },
          collection: collectionSchema,
          archetype: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
          craft: { type: 'string', enum: ['inventory', 'none'] },
        },
      },
    },
    handler: async (request, reply) => {
      if (!data) return unavailable(reply);
      const format = parseFormat(request.body.format);
      if (!format) {
        return reply.status(400).send({ error: 'Unknown format', message: `Choose one of: ${FORMATS.join(', ')}.` });
      }

      const deck = parseDeckText(request.body.deckText);
      const cardCount = [...deck.commander, ...deck.main, ...deck.sideboard].reduce((n, l) => n + l.count, 0);
      if (cardCount === 0) {
        return reply.status(400).send({
          error: 'No cards in the decklist',
          message: 'Paste a decklist with one "<count> <card name>" per line, or an MTG Arena deck export.',
          unrecognizedLines: deck.unrecognized.slice(0, 20),
        });
      }

      const archetype = request.body.archetype
        ? data.meta.get(format)?.archetypes.find(a => a.id === request.body.archetype!.id)
        : undefined;
      return reply.send(
        checkDeck(deck, format, toCollection(request.body.collection), data, { archetype, craft: request.body.craft }),
      );
    },
  });

  app.post<{ Body: { format: string; collection?: CollectionBody } }>('/api/advisor/meta', {
    bodyLimit: COLLECTION_BODY_LIMIT,
    schema: {
      body: {
        type: 'object',
        required: ['format'],
        properties: { format: { type: 'string' }, collection: collectionSchema },
      },
    },
    handler: async (request, reply) => {
      if (!data) return unavailable(reply);
      const format = parseFormat(request.body.format);
      const snapshot = format ? data.meta.get(format) : undefined;
      if (!snapshot) {
        return reply.status(404).send({
          error: 'No meta data for this format',
          message: `Meta decks are available for: ${[...data.meta.keys()].join(', ') || 'no formats yet'}. For any other format, paste a decklist.`,
        });
      }
      const collection = request.body.collection ? toCollection(request.body.collection) : undefined;
      return reply.send(describeMeta(snapshot, data, collection));
    },
  });

  app.post<{
    Body: { format: string; archetypeId: string; list?: number; collection?: CollectionBody; craft?: 'inventory' | 'none' };
  }>('/api/advisor/meta/check', {
    bodyLimit: COLLECTION_BODY_LIMIT,
    schema: {
      body: {
        type: 'object',
        required: ['format', 'archetypeId'],
        properties: {
          format: { type: 'string' },
          archetypeId: { type: 'string' },
          list: { type: 'integer', minimum: 0, maximum: 20 },
          collection: collectionSchema,
          craft: { type: 'string', enum: ['inventory', 'none'] },
        },
      },
    },
    handler: async (request, reply) => {
      if (!data) return unavailable(reply);
      const format = parseFormat(request.body.format) as Format | undefined;
      const archetype: MetaArchetype | undefined = format
        ? data.meta.get(format)?.archetypes.find(a => a.id === request.body.archetypeId)
        : undefined;
      if (!format || !archetype) {
        return reply.status(404).send({ error: 'Archetype not found', archetypeId: request.body.archetypeId });
      }

      const lists = [archetype.representative, ...archetype.otherLists];
      const list = lists[request.body.list ?? 0];
      if (!list) return reply.status(404).send({ error: 'List not found', list: request.body.list });

      const check = checkDeck(
        deckFromTournamentList(list, archetype.name),
        format,
        toCollection(request.body.collection),
        data,
        { archetype, craft: request.body.craft },
      );
      return reply.send({
        archetype: {
          id: archetype.id,
          name: archetype.name,
          colors: archetype.colors,
          deckCount: archetype.deckCount,
          metaShare: archetype.metaShare,
          winRate: archetype.winRate,
          matches: archetype.matchWins + archetype.matchLosses,
          // The cards most lists agree on, with how often each is played.
          cards: archetype.cards.slice(0, 60),
          lists: lists.map(listSummary),
        },
        list: listSummary(list),
        check,
      });
    },
  });

  // Combos the collection already holds, and the cards that would finish the most, in one format.
  app.post<{ Body: { format: string; colors?: string; collection?: CollectionBody } }>('/api/advisor/combos', {
    bodyLimit: COLLECTION_BODY_LIMIT,
    schema: {
      body: {
        type: 'object',
        required: ['format'],
        properties: {
          format: { type: 'string' },
          colors: { type: 'string', maxLength: 5, pattern: '^[WUBRGwubrg]*$' },
          collection: collectionSchema,
        },
      },
    },
    handler: async (request, reply) => {
      if (!data) return unavailable(reply);
      if (!data.combos) {
        return reply.status(503).send({
          error: 'Combo data not built',
          message: 'The combos file is missing on this server. Run `pnpm data:combos`, then restart.',
        });
      }
      const format = parseFormat(request.body.format);
      if (!format) return reply.status(400).send({ error: 'Unknown format', message: `Use one of: ${FORMATS.join(', ')}.` });
      const colors = request.body.colors ? [...request.body.colors.toUpperCase()] : undefined;
      return reply.send({
        format,
        ...collectionCombos(toCollection(request.body.collection), format, data.index, data.combos, colors),
      });
    },
  });

  app.post<{ Body: { sessionId?: string; message: string; collection?: CollectionBody } }>('/api/advisor/chat', {
    bodyLimit: COLLECTION_BODY_LIMIT,
    schema: {
      body: {
        type: 'object',
        required: ['message'],
        properties: {
          sessionId: { type: 'string', maxLength: 64 },
          message: { type: 'string', minLength: 1, maxLength: MAX_CHAT_MESSAGE },
          collection: collectionSchema,
        },
      },
    },
    handler: async (request, reply) => {
      if (!data) return unavailable(reply);
      if (!chat) {
        return reply.status(503).send({
          error: 'Chat not configured',
          message: 'The advisor\'s chat needs a model key on this server. Everything else on this page works without it.',
        });
      }
      const message = request.body.message.trim();
      if (!message) return reply.status(400).send({ error: 'Empty message' });

      const decision = chatBudget?.spend();
      if (decision && !decision.allowed) {
        return reply.status(429).send({
          error: 'Chat budget reached',
          message: decision.reason === 'day'
            ? 'The advisor has answered as many questions as its daily budget allows. The deck check on this page still works; chat is back tomorrow (UTC).'
            : 'The advisor is answering a lot of questions right now. Try again in a minute.',
        });
      }

      try {
        const collection = request.body.collection ? toCollection(request.body.collection) : null;
        const { usage, ...turn } = await chat.send({ sessionId: request.body.sessionId, message, collection });
        const usd = chatBudget?.charge(usage);
        request.log.info({ chat: { ...usage, tools: turn.steps.map(step => step.tool), usd } }, 'advisor chat turn');
        return reply.send(turn);
      } catch (err) {
        // No answer, so the message does not count against the day. The tokens it used before failing still do.
        chatBudget?.refund();
        if (isChatError(err) && err.usage) chatBudget?.charge(err.usage);
        if (isChatError(err) && err.kind !== 'model') {
          return reply.status(409).send({
            error: err.kind === 'limit' ? 'Conversation too long' : err.kind === 'turn' ? 'Question too large' : 'Still answering',
            message: err.message,
          });
        }
        // The provider's own error text can name projects and quotas: log it, do not send it.
        request.log.error({ err }, 'advisor chat failed');
        return reply.status(502).send({
          error: 'Chat unavailable',
          message: 'The advisor could not answer just now. The deck check on this page still works; try the question again in a moment.',
        });
      } finally {
        chatBudget?.done();
      }
    },
  });
}

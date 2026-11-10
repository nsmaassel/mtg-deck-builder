# MTG Deck Builder

Two tools for Magic: The Gathering players, in one app:

- **Deck Advisor** — play the top decks with the cards you have. Load your MTG Arena collection, pick a deck from the tournament meta or paste any list, and see how much of it you own, what the rest costs in wildcards, and the closest cards in your collection for everything you are missing.
- **Commander Builder** — pick a commander and get a full 100-card deck built from cards you own, scored by EDHRec data and assessed against the official Commander Brackets.

---

## Deck Advisor

Deck sites tell an Arena player which cards they are missing and stop there. The advisor answers the next question: what do I play instead?

| Feature | Description |
|---------|-------------|
| **Bring your collection** | Paste or upload what your tracker writes: Arena-style card lists, tracker JSON (mtga-tracker-daemon, MTGA Deck Advisor, collection exporters), CSV (Untapped.gg, Moxfield, Archidekt, MTG Arena Tool). A Player.log adds wildcards and your saved decks. No account, no upload of the log itself: the browser sends only the login snapshot. |
| **Meta decks, ranked by what you own** | Standard and Pioneer archetypes from published tournament lists, with meta share and match win rate. With a collection loaded they are ordered by the wildcards you still need. |
| **Any decklist** | Paste a list in any Arena format (Standard, Alchemy, Historic, Timeless, Pioneer, Brawl, Standard Brawl) or paper Commander. |
| **Stand-ins for missing cards** | For each card you lack: cards you own that do the same job, and cheaper crafts, each with its reasons and what it fails to cover. Always legal in the format and castable in the deck's colours. |
| **A list you can build today** | Wildcards go to the cards that are hardest to replace, everything else is swapped, and the result copies straight into Arena's deck import. |
| **Ask the advisor** | A Google ADK agent whose tools are the checks above. Ask which deck to build or where your wildcards should go; it runs the checks and explains them. Needs a Gemini key or Vertex AI on the server; the rest works without. |

Every recommendation is computed, not generated: stand-ins are scored on Scryfall Tagger's functional tags, rules text, card type, mana value, colour, and how often the deck's archetype actually plays the card. See [J-010](./specs/journeys/010-deck-check.feature.md) for the scoring table. The agent only chooses which checks to run and puts the results into words ([J-013](./specs/journeys/013-advisor-chat.feature.md)).

### What it does not know

- **Arena ladder results.** No open source of Arena win rates exists. The meta comes from MTGO and melee.gg tournaments; win rates are match records from events that publish standings, and published lists lean towards top finishers.
- **Historic, Timeless, Alchemy and Brawl metas.** No open tournament data. Paste a list instead.
- **Your collection, unless you bring it.** Arena has no collection export and its log stopped listing cards in 2021. See [J-011](./specs/journeys/011-collection-import.feature.md).

### Data

The advisor reads generated files from `data/generated/`, built from public sources and never committed:

```bash
pnpm data:cards   # card index from Scryfall bulk data (~90 MB download, cached; a few seconds to build)
pnpm data:meta    # Standard and Pioneer meta snapshots (shallow, sparse clones of two community repos)
pnpm data         # both
```

| Data | Source | Terms |
|------|--------|-------|
| Cards, legality, Arena rarity, functional tags | [Scryfall](https://scryfall.com/docs/api/bulk-data) bulk files `default_cards` and `oracle_tags` | Bulk use is what Scryfall asks for; fetched at most daily. Tags are community-curated: `MTG_DISABLED_TAGS` hides any tag at runtime. |
| Tournament decklists and standings | [Jiliac/MTGODecklistCache](https://github.com/Jiliac/MTGODecklistCache) | Community cache of lists published on mtgo.com and melee.gg. No licence file; read at build time, not redistributed. |
| Archetype definitions | [Jiliac/MTGOFormatData](https://github.com/Jiliac/MTGOFormatData) | Community rules; matching logic ported from MTGOArchetypeParser (MIT). No licence file on the data; read at build time, not redistributed. |

Untapped.gg, MTGGoldfish, AetherHub and Moxfield are not used: their terms forbid scraping. Without the card index the advisor routes answer 503 and the Commander Builder keeps working.

---

## Commander Builder

### Features

| Feature | Status | Description |
|---------|--------|-------------|
| 🃏 **Build from commander** | ✅ Shipped | Pick any legendary creature, get the best 99 from your collection + EDHRec top picks |
| ⚡ **Power level assessment** | ✅ Shipped | Official Commander Brackets 1–5: Game Changers, tutors, combo detection via Commander Spellbook |
| 🔄 **Bracket targeting** | ✅ Shipped | Target a bracket — get named swap suggestions with EDHRec-ranked alternatives |
| 📊 **Gap analysis** | ✅ Shipped | Missing staples with EDHRec inclusion %, Scryfall price, and slot info |
| 🤖 **AI explanations** | ✅ Shipped | Claude explains strategy, key synergies, and top upgrade targets |
| 🔒 **Owned-only mode** | ✅ Shipped | Build strictly from your collection — no unowned recommendations |
| 💰 **Budget mode** | ✅ Shipped | Fill gaps only with cards at or below a price cap |
| 🆕 **New player on-ramp** | ✅ Shipped | Build a full Commander deck from EDHRec recommendations — no MTG Arena export required |
| 🛡️ **External API resilience** | ✅ Shipped | Rate-limit throttling with exponential backoff + `Retry-After` handling on Scryfall/EDHRec |

---

## Architecture

```mermaid
graph TB
    subgraph Frontend
        WEB[apps/web<br/>React 18 + Vite]
    end

    subgraph API
        API[apps/api<br/>Fastify · port 3000]
    end

    subgraph Libraries
        COL[libs/collection<br/>Collection import]
        IDX[libs/card-index<br/>Local card database]
        ADV[libs/deck-advisor<br/>Gap, stand-ins, plan]
        AGT[libs/advisor-agent<br/>ADK agent + tools]
        META[libs/meta-decks<br/>Meta snapshots]
        SCR[libs/scryfall<br/>Card data + prices]
        EDH[libs/edhrec<br/>Meta rankings + synergy]
        DB[libs/deck-builder<br/>Scoring + slot filler]
        PL[libs/power-level<br/>Bracket assessment]
        AI[libs/ai-advisor<br/>Claude explanations]
    end

    subgraph External
        SCRYFALL[Scryfall API]
        EDHREC[EDHRec API]
        CSB[Commander Spellbook<br/>combo detection]
        CLAUDE[Anthropic Claude]
    end

    WEB -->|HTTP| API
    API --> COL & DB & AI & ADV & AGT
    AGT --> ADV
    ADV --> IDX & META
    API --> PL
    DB --> SCR & EDH
    PL --> CSB
    SCR --> SCRYFALL
    EDH --> EDHREC
    AI --> CLAUDE
```

### Deck Building Algorithm

Cards scored per-slot, filled in priority order. Scoring: `inclusion × 0.5 + synergy × 0.5` (both commander-specific from EDHRec). Owned cards get a 1.5× multiplier.

| Slot | Target | Notes |
|------|--------|-------|
| Commander | 1 | User-provided |
| Ramp | 10 | Mana rocks + ramp spells, color-legal |
| Card Draw | 10 | Draw spells |
| Interaction | 10 | Removal + counterspells |
| Win Conditions | 5 | Game Changers boosted |
| Synergy | 25 | Highest blended score remaining |
| Lands | 36 | Owned nonbasics + basics to fill |
| Flex | 3 | Best remaining |

### Power Level Assessment (Commander Brackets)

| Bracket | Label | Key Signals |
|---------|-------|-------------|
| 1 | Exhibition | No Game Changers, no tutors, <40% staples |
| 2 | Core | Tier-B tutors or 40–65% staples |
| 3 | Enhanced | 1+ Game Changer or 2+ Tier-A tutors |
| 4 | Optimized | 4+ Game Changers or 2-card combo + GC |
| 5 | cEDH | 6+ GC + 2 Tier-A tutors + avg CMC <2.0 |

Swap suggestions rank alternatives by blended score (50% inclusion + 50% synergy). Candidate pool comes from EDHRec for the specific commander — color identity is correct by construction.

---

## Local Development

### Prerequisites
- Node.js 20+
- pnpm 9+

```bash
pnpm install

pnpm data                # Build the card index and meta snapshots the Deck Advisor reads
pnpm serve:api           # Fastify on port 3000
pnpm serve:web           # Vite dev on port 4200
pnpm test                # All unit + component tests (Vitest)
pnpm typecheck           # tsc over every library and app, sources and specs

# Quality eval against 8 test commanders (needs API running)
npx tsx --tsconfig tsconfig.json scripts/eval-decks.ts
```

### Environment Variables

Create `.env` in `apps/api/`:
```env
ANTHROPIC_API_KEY=sk-ant-...   # Commander Builder: AI explanations
LOG_LEVEL=info

# Deck Advisor chat (optional). One of:
GOOGLE_API_KEY=...             # Gemini API key
# GOOGLE_GENAI_USE_VERTEXAI=true   # or Vertex AI with the machine's own credentials,
# GOOGLE_CLOUD_PROJECT=...         # which is how Cloud Run reaches it
# GOOGLE_CLOUD_LOCATION=us-central1

ADVISOR_AGENT_MODEL=gemini-3.8-flash   # default
ADVISOR_AGENT_DAILY_LIMIT=300          # chat messages per UTC day, all visitors
ADVISOR_AGENT_PER_MINUTE=20
```

---

## Testing Strategy

This project uses a **spec-first, BDD workflow**: write the journey spec, then the test, then the code.

### Test Pyramid

| Layer | Tool | Location | Runs on |
|-------|------|----------|---------|
| Unit | Vitest | `libs/*/src/**/*.spec.ts` | Every commit |
| Component | Vitest + RTL | `apps/web/src/**/*.spec.tsx` | Every commit |
| API Integration | Vitest + Fastify inject | `apps/api/src/**/*.integration.spec.ts` | Every commit |
| E2E | Playwright | `apps/web-e2e/src/journeys/` | Pre-deploy, nightly |

### User Journey Coverage

| ID | Journey | Tags | Spec |
|----|---------|------|------|
| J-001 | Happy path — 100-card deck build | `@smoke @regression` | [001-happy-path-build](./specs/journeys/001-happy-path-build.feature.md) |
| J-002 | Bracket targeting + swap suggestions | `@regression` | [002-bracket-targeting](./specs/journeys/002-bracket-targeting.feature.md) |
| J-003 | Owned-only mode | `@regression` | [003-owned-only](./specs/journeys/003-owned-only.feature.md) |
| J-005 | Gap analysis display | `@regression` | [005-gap-analysis](./specs/journeys/005-gap-analysis.feature.md) |
| J-008 | Error states + validation | `@smoke @regression` | [008-error-states](./specs/journeys/008-error-states.feature.md) |
| J-009 | New player onboarding — build without a collection | `@smoke @regression @onboarding` | [009-new-player-onboarding](./specs/journeys/009-new-player-onboarding.feature.md) |
| J-010 | Check a deck against my collection, with stand-ins | `@smoke @regression` | [010-deck-check](./specs/journeys/010-deck-check.feature.md) |
| J-011 | Bring my Arena collection | `@smoke @regression` | [011-collection-import](./specs/journeys/011-collection-import.feature.md) |
| J-012 | Find the meta deck I am closest to | `@regression` | [012-meta-decks](./specs/journeys/012-meta-decks.feature.md) |
| J-013 | Ask the advisor | `@regression` | [013-advisor-chat](./specs/journeys/013-advisor-chat.feature.md) |

E2E specs live in `apps/web-e2e/src/journeys/`: `happy-path`, `bracket-targeting`, `owned-only`, `error-states`, `gap-analysis`, `new-player-onboarding`. They cover the Commander Builder, which now lives at `/#/commander`. J-010 to J-012 are covered by unit, API integration and component tests.

### Running E2E Tests

```bash
# Both servers must be running
pnpm serve:api &
pnpm serve:web &

npx nx run web-e2e:e2e           # headless
npx nx run web-e2e:e2e:headed    # with browser visible
```

### Adding a New Feature (BDD Workflow)

1. **Write the spec first** — create or update `specs/journeys/NNN-name.feature.md`
2. **Write a failing test** — add a scenario to the appropriate `*.spec.ts`
3. **Implement** — make the test pass
4. **Update this README** — Features table + any architecture changes
5. **Commit together** — feature + test + spec + README in one PR

> No feature is "done" until the README and journey spec are updated.

---

## Project Structure

```
apps/
  api/          Fastify API server (port 3000)
  web/          React + Vite SPA (port 4200)
  web-e2e/      Playwright E2E tests
libs/
  collection/   Collection import: Arena text, tracker JSON, CSV, Player.log — pure TS, no HTTP
  card-index/   Local card database built from Scryfall bulk data: legality, Arena rarity, functional tags
  deck-advisor/ Deck gap, stand-in scoring, build plan, meta ranking
  advisor-agent/ Google ADK agent: the engine's checks as tools, the instruction, the chat runner
  meta-decks/   Meta snapshots from tournament decklists: archetype rules, shares, card frequencies
  scryfall/     Scryfall API client — card data, prices, commander search
  edhrec/       EDHRec API client — recommendations, synergy scores, caching
  deck-builder/ Scoring algorithm, slot filler, gap analysis, color identity
  power-level/  Commander Bracket assessment, combo detection, swap suggestions
  ai-advisor/   Anthropic Claude deck explanation wrapper
specs/
  journeys/     Gherkin user journey specs — source of truth for E2E tests
scripts/
  data/         Builders for data/generated: build-card-index.ts, build-meta.ts
  eval-decks.ts Quality harness — 8 test commanders against live API
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check `{ status: 'ok' }` |
| `POST` | `/api/collection/parse` | Parse MTG Arena export |
| `GET` | `/api/commanders/search?q=` | Search Scryfall for legendary creatures |
| `GET` | `/api/themes` | List supported archetypes |
| `POST` | `/api/decks/build-from-commander` | **Core:** Build 100-card Commander deck |
| `POST` | `/api/decks/build-from-theme` | Theme-based commander discovery (API only — no UI yet) |
| `POST` | `/api/ai/explain-deck` | AI strategy explanation via Claude |
| `GET` | `/api/advisor/status` | What data the advisor is running on: card count, meta formats, sources |
| `GET` | `/api/advisor/collection/sample?profile=` | A made-up collection (`newcomer`, `regular`, `veteran`) for trying the advisor |
| `POST` | `/api/advisor/collection/import` | `{ texts: string[] }` → collection keyed by card, wildcards, saved decks |
| `POST` | `/api/advisor/deck/check` | `{ deckText, format, collection?, craft? }` → gap, stand-ins, buildable list |
| `POST` | `/api/advisor/meta` | `{ format, collection? }` → archetypes, ranked by the collection when given |
| `POST` | `/api/advisor/meta/check` | `{ format, archetypeId, list?, collection?, craft? }` → check of an archetype's list |
| `POST` | `/api/advisor/chat` | `{ message, sessionId?, collection? }` → `{ sessionId, reply, steps }`. 503 without a model, 429 over the budget |

The API keeps nothing between requests. The collection lives in the browser and travels with each request as `{ cards: { <oracleId>: copies }, wildcards? }`.

#### Build from Commander — Request/Response Shape

```ts
// POST /api/decks/build-from-commander
{
  collectionText?: string,     // Optional: MTG Arena export. Omit or empty for new-player on-ramp (build from EDHRec only)
  commanderName: string,
  options?: {
    mode?: 'prefer-owned' | 'owned-only' | 'budget',
    budgetMaxPrice?: number,  // USD per card (budget mode only)
    targetBracket?: 1|2|3|4|5
  }
}

// 200 Response
{
  deck: {
    commander: DeckCard,
    slots: Record<'ramp'|'draw'|'interaction'|'winConditions'|'synergy'|'lands'|'flex', DeckCard[]>,
    totalCards: number        // always 100
  },
  analysis: { averageCmc: number, staplesCoveragePercent: number, colorDistribution: Record<string, number> },
  gaps: { missingStaples: Array<{ name, edhrec_inclusion, wouldFillSlot, usdPrice? }> },
  powerLevel: {
    bracket: 1|2|3|4|5,
    score: number,            // 1–10
    label: 'Exhibition'|'Core'|'Enhanced'|'Optimized'|'cEDH',
    signals: { gameChangers: string[], tierATutors: string[], twoCardComboCount: number, avgCmc: number, ... },
    explanation: string[],
    targetSuggestions?: Array<{
      remove: string, removeReason: string, removeSlot: string,
      alternatives: Array<{ name, inclusion, synergy?, slot }>
    }>
  }
}

// 400 — bad collection format
// 400 — owned-only mode with no usable collection
// 404 — commander not found in Scryfall
// 422 — commander not legal in Commander format
```

---

## Deployment

### Render (Free Tier)

This project includes a `Dockerfile` and `render.yaml` for one-click deployment to Render's free tier.

1. **Push to GitHub** (or connect your repo to Render)
2. **Create a new Web Service** on Render, select "Docker" as runtime
3. **Configure**:
   - Build Command: (handled by Dockerfile)
   - Start Command: (handled by Dockerfile `CMD`)
   - Port: 3000
4. **Add Environment Variables** in Render dashboard:
   - `ANTHROPIC_API_KEY` — optional, for AI deck explanations
   - `LOG_LEVEL=info`
   - `CORS_ORIGIN=*` (or your specific domain)
5. **Deploy** — Render will build the Docker image and start the service

The Dockerfile uses a multi-stage build:
- **Builder stage**: Installs all dependencies, runs `pnpm build` to compile TypeScript and build the React SPA
- **Data stage**: Builds the advisor's data (`pnpm data:cards`, `pnpm data:meta`). It copies only the files those scripts import, so an app change does not download Scryfall's bulk files again. The card index is required and fails the build if Scryfall cannot be reached; the meta snapshots are optional.
- **Runner stage**: Copies only `dist/`, `data/generated/` and `node_modules/`, runs the Fastify server which serves both the API (`/api/*`) and the SPA (all other routes)

The data is a snapshot taken when the data stage last ran. To refresh cards and the meta, pass a new `DATA_DATE`:

```bash
docker build --build-arg DATA_DATE=$(date +%F) -t mtg-deck-builder .
```

The process holds about 300 MB with the card index loaded.

**Local Docker test:**
```bash
docker build -t mtg-deck-builder .
docker run -p 3000:3000 -e ANTHROPIC_API_KEY=your_key mtg-deck-builder
```

Then visit `http://localhost:3000` — you'll see the full app served from a single container.

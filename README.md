# MTG Deck Builder

Two tools for Magic: The Gathering players, in one app:

- **Deck Advisor** — play the top decks with the cards you have. Load your MTG Arena collection, pick a deck from the tournament meta or paste any list, and see how much of it you own, what the rest costs in wildcards, and the closest cards in your collection for everything you are missing.
- **Commander Builder** — pick a commander and get a full 100-card deck built around what it does, from the cards you own first, assessed against the official Commander Brackets.

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
| **What is wrong with a list, and how it differs** | Rule problems (size, copy limits, legality, colour identity), and for Standard and Pioneer a comparison with the tournament lists of the archetype the list resembles: what most of them play that yours lacks, and what yours plays that few of them do. |
| **Combos** | The combos your collection already holds in a format, the cards that would finish the most, and for any list the combos in it and the single cards that would add one. From Commander Spellbook, with a link to the steps. |
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
pnpm data:combos  # combos from Commander Spellbook's bulk file (~32 MB download, cached for a day; needs the card index)
pnpm data         # all three
```

| Data | Source | Terms |
|------|--------|-------|
| Cards, legality, Arena rarity, functional tags | [Scryfall](https://scryfall.com/docs/api/bulk-data) bulk files `default_cards` and `oracle_tags` | Bulk use is what Scryfall asks for; fetched at most daily. Tags are community-curated: `MTG_DISABLED_TAGS` hides any tag at runtime. |
| Tournament decklists and standings | [Jiliac/MTGODecklistCache](https://github.com/Jiliac/MTGODecklistCache) | Community cache of lists published on mtgo.com and melee.gg. No licence file; read at build time, not redistributed. |
| Archetype definitions | [Jiliac/MTGOFormatData](https://github.com/Jiliac/MTGOFormatData) | Community rules; matching logic ported from MTGOArchetypeParser (MIT). No licence file on the data; read at build time, not redistributed. |
| Combos | [Commander Spellbook](https://commanderspellbook.com) bulk file `variants.json.gz` | Published for tools to read instead of their API. They ask for a named User-Agent, at most one fetch a day, credit and a link back: the page credits them and links each combo to its steps there. |

Untapped.gg, MTGGoldfish, AetherHub and Moxfield are not used: their terms forbid scraping. Without the card index the advisor routes answer 503. Meta snapshots and combos are optional: without them the advisor still checks pasted lists.

---

## Commander Builder

### Features

| Feature | Status | Description |
|---------|--------|-------------|
| 🃏 **Build from commander** | ✅ Shipped | Pick any legendary creature, get the best 99 from your collection plus the top picks for what that commander does |
| ⚡ **Power level assessment** | ✅ Shipped | Official Commander Brackets 1–5: Game Changers, tutors, combo detection via Commander Spellbook |
| 🔄 **Bracket targeting** | ✅ Shipped | Pick a bracket and the build is steered to it: it names the Game Changers, tutors and combo pieces it left out or put in, and suggests swaps for whatever distance is left |
| 📊 **Gap analysis** | ✅ Shipped | Cards the deck leans on that you do not own, with the reason each is there, its price and its slot |
| 🤖 **AI explanations** | ✅ Shipped | Claude explains strategy, key synergies, and top upgrade targets |
| 🔒 **Owned-only mode** | ✅ Shipped | Build strictly from your collection — no unowned recommendations |
| 💰 **Budget mode** | ✅ Shipped | Fill gaps only with cards at or below a price cap |
| 🆕 **New player on-ramp** | ✅ Shipped | Build a full Commander deck with no collection at all — no MTG Arena export required |
| 🧭 **Every pick explained** | ✅ Shipped | Each card carries one or two reasons that are true of it: what it does, and what on the commander asked for it |

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
        CMB[libs/combos<br/>Combos from Commander Spellbook]
        REC[libs/commander-recs<br/>Themes, synergy, slots]
        SCR[libs/scryfall<br/>Fuzzy name lookup]
        DB[libs/deck-builder<br/>Scoring + slot filler]
        PL[libs/power-level<br/>Bracket assessment]
        AI[libs/ai-advisor<br/>Claude explanations]
    end

    subgraph External
        SCRYFALL[Scryfall API]
        CLAUDE[Anthropic Claude]
    end

    WEB -->|HTTP| API
    API --> COL & DB & AI & ADV & AGT
    AGT --> ADV
    ADV --> IDX & META & CMB
    API --> PL
    DB --> REC
    REC --> IDX
    API --> SCR
    API --> CMB
    SCR --> SCRYFALL
    AI --> CLAUDE
```

### Deck Building Algorithm

Recommendations are computed from the local card index (`libs/commander-recs`); nothing is fetched from a recommendation site. The builder first works out what the commander is about: 27 themes read from Scryfall Tagger's tags, the type line, keywords and rules text, plus the creature type it cares about. Then every card in its colours gets:

- **Popularity** (0–1) from Scryfall's EDHREC rank on a log scale. It says how widely a card is played across Commander as a whole, not with this commander.
- **Synergy** (0–1) from how strongly the card serves the commander's themes.
- **A slot** from what the card does, and one or two **reasons** that are true of it.

`score = popularity × wp + synergy × ws + cheapness × wc + colour fit × wf`, plus 0.15 for a card you own.

| Slot | wp | ws | wc | wf |
|------|----|----|----|----|
| Ramp, draw, interaction | 0.65 | 0.20 | 0.15 | – |
| Synergy | 0.35 | 0.55 | 0.10 | – |
| Win conditions | 0.30 | 0.60 | 0.10 | – |
| Lands | 0.45 | 0.15 | – | 0.40 |

Staple slots lean on popularity, so Sol Ring keeps its place; synergy and win-condition slots lean on synergy, so two commanders in the same colours get different decks. Every owned card is scored on its own merits, so an owned-only build is the best deck the collection allows. `scripts/eval-commander-recs.ts` prints the themes and top picks for any commander.

What it cannot know: how often a card is played *with this commander*. No open data has that, so two commanders in the same colours share most of their ramp and removal.

| Slot | Target | Notes |
|------|--------|-------|
| Commander | 1 | User-provided |
| Ramp | 10 | Mana rocks, mana creatures, land ramp |
| Card Draw | 10 | Draw spells |
| Interaction | 10 | Removal + counterspells |
| Win Conditions | 5 | Finishers and Game Changers |
| Synergy | 25 | Best fit for the commander among everything still unplaced |
| Lands | 36 | Nonbasics that fit the colours, up to a cap by colour count, then basics |
| Flex | 3 | Most widely played cards left |

### Power Level Assessment (Commander Brackets)

A deck sits in the highest bracket any one reason puts it in. Each reason is either a rule of the brackets as Wizards of the Coast publishes them, or this project's own estimate where the published brackets leave it to the table; the app labels every reason as one or the other.

| Bracket | Label | Rule of the published brackets | Our estimate |
|---------|-------|--------------------------------|--------------|
| 1 | Exhibition | | Spells averaging under 24 for how widely played they are |
| 2 | Core | | Spells averaging 24–39; one extra-turn card; a slow or minor two-card combo |
| 3 | Upgraded | 1–3 Game Changers; a two-card combo (Commander Spellbook's Bracket 3) | 2+ cheap tutors, or spells averaging 40+ |
| 4 | Optimized | 4+ Game Changers; mass land denial; a fast two-card combo (Commander Spellbook's Bracket 4) | 2+ extra-turn cards; 2+ Game Changers with 2+ cheap tutors or a very low curve |
| 5 | cEDH | | 8+ Game Changers, or Game Changers or combos with cheap tutors and an average mana value near 2 |

Nothing in the assessment is a list kept in this repository:

| Signal | Where it comes from |
|--------|---------------------|
| Game Changers | Scryfall's `game_changer` flag on each card, so the list is as current as the card index |
| Mass land denial, extra turns | Scryfall Tagger's `mass-land-denial` and `extra-turn` tags (planeswalkers left out) |
| Cheap tutors | Tagger's `tutor-card` tag at mana value 2 or less. The brackets stopped limiting tutors in October 2025; this is estimate only |
| Two-card combos, and which bracket each belongs in | Commander Spellbook's bulk data and the bracket tag it gives every combo, read locally (`libs/combos`). The commander does not count as one of the two cards |
| "Spells averaging N" | Mean popularity of the deck's nonland cards, out of 100, from Scryfall's EDHREC rank |

The app shows all of this under "How brackets are worked out" below a deck's bracket, with links to Wizards' articles and to each source. The text and the numbers in it come from the API (`bracketMethod` in `libs/power-level`), which prints the same constants the assessment runs on.

**Checked against real decks.** No public set of decks labelled with a bracket exists. The closest thing is Wizards' own preconstructed Commander decks, which they built as the Bracket 2 baseline. `scripts/eval-brackets.ts` rates all of them from MTGJSON's decklists (186 decks, 2011–2026): 117 land in Bracket 2, 39 in Bracket 1 (mostly decks from before 2020, and brand-new ones whose cards have no play data yet), and every one of the 30 above Bracket 2 is there for something in the box: a Game Changer, a combo or land denial. The line between Brackets 1 and 2 was set on this run. The script can also ask Commander Spellbook's open bracket estimator about the same lists: on the 40 newest decks, every deck they place in Bracket 3 we place in 3, and every deck they place below it we place below it. Twelve of the decks are pinned as test fixtures (`libs/power-level/src/lib/__fixtures__/precons.json`).

**Building to a bracket.** With a target, the build changes one card at a time until the assessment above agrees with it (`buildDeckForBracket` in `libs/deck-builder`). To come down it leaves out a land-denial card, a piece of a combo, a Game Changer, a cheap tutor or an extra-turn card, whichever lowers the bracket; when nothing of that kind is left and the deck is still too strong on widely played cards alone, staples give way to cards fewer decks play, the ones that do nothing for the commander first. To go up it puts in Game Changers and cheap tutors the build may use (owned ones in an owned-only build). It never goes above the target, and it says so when it cannot get there. The bracket is this project's reading of the signals in the table, not a ruling: a pod's own sense of a deck still decides.

Swap suggestions rank alternatives by a blend of popularity and synergy. The candidates are this commander's own recommendations that did not make the deck, so colour identity is correct by construction.

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
ADVISOR_AGENT_THINKING=low             # default; minimal, low, medium, high, or "default" to send none (for a model that takes no level)
ADVISOR_AGENT_DAILY_USD=0.30           # model spend per UTC day, all visitors, at the prices below
ADVISOR_AGENT_MAX_OUTPUT_TOKENS=4096   # the most one model call may write, thinking included
ADVISOR_AGENT_PRICE_IN=1.50            # USD per million prompt tokens (default: gemini-3.8-flash from 2027-01-01)
ADVISOR_AGENT_PRICE_OUT=7.50           # USD per million output tokens
ADVISOR_AGENT_DAILY_LIMIT=100          # chat messages per UTC day, all visitors
ADVISOR_AGENT_PER_MINUTE=10
```

`pnpm eval:agent` puts 16 questions to the configured model and checks every answer against the tool results it was given; see [docs/evals/advisor-agent.md](./docs/evals/advisor-agent.md).

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
| J-014 | Combos I own, and combos one card away | `@regression` | [014-combos](./specs/journeys/014-combos.feature.md) |

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
  combos/       Combos from Commander Spellbook's bulk file: what a set of cards completes, and what one more card would
  commander-recs/ What a commander is about, and every card scored for it: themes, synergy, slots, reasons
  scryfall/     Scryfall API client — one fuzzy name lookup when the card index does not know a commander as typed
  deck-builder/ Scoring algorithm, slot filler, gap analysis, color identity
  power-level/  Commander Bracket assessment and swap suggestions; takes the deck's combos as an input
  ai-advisor/   Anthropic Claude deck explanation wrapper
specs/
  journeys/     Gherkin user journey specs — source of truth for E2E tests
scripts/
  data/         Builders for data/generated: build-card-index.ts, build-meta.ts, build-combos.ts
  evals/        advisor-agent.ts — the agent's eval against a real model
  eval-decks.ts Quality harness — 8 test commanders against a running API
  eval-commander-recs.ts  Themes and top picks for any commander, from the card index
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check `{ status: 'ok' }` |
| `POST` | `/api/collection/parse` | Parse MTG Arena export |
| `GET` | `/api/commanders/search?q=` | Search the card index for cards that can be a commander |
| `GET` | `/api/themes` | List supported archetypes |
| `POST` | `/api/decks/build-from-commander` | **Core:** Build 100-card Commander deck |
| `POST` | `/api/decks/build-from-theme` | Theme-based commander discovery (API only — no UI yet) |
| `POST` | `/api/ai/explain-deck` | AI strategy explanation via Gemini or Claude when a key is set; counts against the chat's daily ceiling |
| `GET` | `/api/advisor/status` | What data the advisor is running on: card count, meta formats, sources |
| `GET` | `/api/advisor/collection/sample?profile=` | A made-up collection (`newcomer`, `regular`, `veteran`) for trying the advisor |
| `POST` | `/api/advisor/collection/import` | `{ texts: string[] }` → collection keyed by card, wildcards, saved decks |
| `POST` | `/api/advisor/deck/check` | `{ deckText, format, collection?, craft? }` → gap, stand-ins, buildable list |
| `POST` | `/api/advisor/meta` | `{ format, collection? }` → archetypes, ranked by the collection when given |
| `POST` | `/api/advisor/meta/check` | `{ format, archetypeId, list?, collection?, craft? }` → check of an archetype's list |
| `POST` | `/api/advisor/combos` | `{ format, colors?, collection? }` → combos the collection holds and the cards that would finish the most |
| `POST` | `/api/advisor/chat` | `{ message, sessionId?, collection? }` → `{ sessionId, reply, steps }`. 503 without a model, 429 over the budget |

The API keeps nothing between requests. The collection lives in the browser and travels with each request as `{ cards: { <oracleId>: copies }, wildcards? }`.

#### Build from Commander — Request/Response Shape

```ts
// POST /api/decks/build-from-commander
{
  collectionText?: string,     // Optional: MTG Arena export. Omit or empty for new-player on-ramp (build from the top picks only)
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
  // DeckCard: { name, slot, score, popularity, synergy, reasons, ownedInCollection, cmc, type_line, usdPrice? }
  analysis: {
    averageCmc: number,
    topPicksCoveragePercent: number,   // share of our own unconstrained picks that made this deck; not "how many decks play it"
    averagePopularityPercent: number,  // how widely played the deck's spells are across Commander, on average; the bracket goes by this
    colorDistribution: Record<string, number>,
    themes: Array<{ slug, name, because }>   // what the deck is built around, and what on the commander says so
  },
  gaps: { missingCards: Array<{ name, popularity, synergy, reasons, wouldFillSlot, usdPrice }> },
  powerLevel: {
    bracket: 1|2|3|4|5,
    score: number,            // 1–10
    label: 'Exhibition'|'Core'|'Upgraded'|'Optimized'|'cEDH',
    signals: { gameChangers: string[], tutors: string[], massLandDenial: string[], extraTurns: string[], twoCardComboCount: number, avgCmc: number, ... },
    explanation: string[],
    findings: Array<{ basis: 'rule'|'estimate', bracket, text }>,   // the same reasons, each marked as a published rule or our estimate
    targetSuggestions?: Array<{
      remove: string, removeReason: string, removeSlot: string,
      alternatives: Array<{ name, popularity, synergy?, slot }>
    }>
  }
}

// 400 — bad collection format
// 400 — owned-only mode with no usable collection
// 404 — commander not found
// 422 — commander not legal in Commander format
// 503 — the card index is not built on this server (`pnpm data:cards`)
```

---

## Deployment

### Cloud Run

The app is one container. [`deploy/README.md`](./deploy/README.md) has the scripts and the guide for Google Cloud Run: a keyless identity with the Vertex AI role it needs to call Gemini, one instance at most, a first deploy that stays private until it has been checked, and the spending limits, of which Google's spend cap budgets are the hard stop.

### Render

`render.yaml` describes the same container on Render. As written it has no model access, so the advisor's chat is off there, nothing costs money per request, and everything else works. Give it a Gemini key and the chat and the Commander Builder's deck explanation turn on with the in-app limits only: there is no spend cap behind them on that route.

### The image

The Dockerfile uses a multi-stage build:
- **Builder stage**: Installs all dependencies, runs `pnpm build` to compile TypeScript and build the React SPA
- **Data stage**: Builds the advisor's data (`pnpm data:cards`, `pnpm data:meta`, `pnpm data:combos`). It copies only the files those scripts import, so an app change does not download Scryfall's bulk files again. The card index is required and fails the build if Scryfall cannot be reached; the meta snapshots and the combos are optional.
- **Runner stage**: Copies only `dist/`, `data/generated/` and `node_modules/`, runs the Fastify server which serves both the API (`/api/*`) and the SPA (all other routes)

The data is a snapshot taken when the data stage last ran. To refresh cards and the meta, pass a new `DATA_DATE`:

```bash
docker build --build-arg DATA_DATE=$(date +%F) -t mtg-deck-builder .
```

The process holds about 330 MB with the card index and the combos loaded; give it 1 GB.

**Local Docker test:**
```bash
docker build -t mtg-deck-builder .
docker run -p 3000:3000 -e ANTHROPIC_API_KEY=your_key mtg-deck-builder
```

Then visit `http://localhost:3000` — you'll see the full app served from a single container.

# MTG Commander Deck Builder

Build optimized Commander decks from your MTG Arena collection. Paste your collection export, pick a commander, and get a full 100-card deck built from cards you own — scored by EDHRec meta data, assessed for power level against the Official Commander Brackets, and explained by AI.

---

## Features

| Feature | Status | Description |
|---------|--------|-------------|
| 🃏 **Build from commander** | ✅ Shipped | Pick any legendary creature, get the best 99 from your collection + EDHRec top picks |
| 🎯 **Build from theme** | ✅ Shipped | Choose an archetype (tokens, dragons, stax…) — discover commanders in your collection |
| ⚡ **Power level assessment** | ✅ Shipped | Official Commander Brackets 1–5: Game Changers, tutors, combo detection via Commander Spellbook |
| 🔄 **Bracket targeting** | ✅ Shipped | Target a bracket — get named swap suggestions with EDHRec-ranked alternatives |
| 📊 **Gap analysis** | ✅ Shipped | Missing staples with EDHRec inclusion %, Scryfall price, and slot info |
| 🤖 **AI explanations** | ✅ Shipped | Claude explains strategy, key synergies, and top upgrade targets |
| 🔒 **Owned-only mode** | ✅ Shipped | Build strictly from your collection — no unowned recommendations |
| 💰 **Budget mode** | ✅ Shipped | Fill gaps only with cards at or below a price cap |

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
        COL[libs/collection<br/>Arena export parser]
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
    API --> COL & DB & AI
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

pnpm serve:api           # Fastify on port 3000
pnpm serve:web           # Vite dev on port 4200
pnpm test                # All unit + component tests (Vitest)

# Quality eval against 8 test commanders (needs API running)
npx tsx --tsconfig tsconfig.json scripts/eval-decks.ts
```

### Environment Variables

Create `.env` in `apps/api/`:
```env
ANTHROPIC_API_KEY=sk-ant-...   # Required for AI explanations
LOG_LEVEL=info
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
  collection/   MTG Arena export parser — pure TS, no HTTP
  scryfall/     Scryfall API client — card data, prices, commander search
  edhrec/       EDHRec API client — recommendations, synergy scores, caching
  deck-builder/ Scoring algorithm, slot filler, gap analysis, color identity
  power-level/  Commander Bracket assessment, combo detection, swap suggestions
  ai-advisor/   Anthropic Claude deck explanation wrapper
specs/
  journeys/     Gherkin user journey specs — source of truth for E2E tests
scripts/
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
| `POST` | `/api/decks/build-from-theme` | Theme-based build + commander suggestions |
| `POST` | `/api/ai/explain-deck` | AI strategy explanation via Claude |

#### Build from Commander — Request/Response Shape

```ts
// POST /api/decks/build-from-commander
{
  collectionText: string,     // MTG Arena export
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
// 404 — commander not found in Scryfall
```

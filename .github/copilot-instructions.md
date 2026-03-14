# GitHub Copilot Instructions — MTG Commander Deck Builder

> This file is read automatically by GitHub Copilot. It provides context about codebase conventions, architecture decisions, and development rules to keep the AI aligned with how this project works.

---

## What This Project Does

An NX monorepo that builds optimized 100-card Commander (MTG) decks from an MTG Arena collection export. Core flow: parse collection → fetch EDHRec recommendations for commander → score cards per slot → fill deck → assess power level (Commander Brackets 1–5) → return structured result with gap analysis and swap suggestions.

**Always read `README.md` first** for current feature status, architecture, and API contracts.

---

## Tech Stack

- **Monorepo:** NX 22, pnpm workspaces
- **Frontend:** React 18, TypeScript, Vite, plain CSS (no MUI)
- **Backend:** Fastify (Node.js), TypeScript
- **Testing:** Vitest (unit + component + integration), Playwright (E2E)
- **External APIs:** Scryfall (cards), EDHRec (meta), Commander Spellbook (combos), Anthropic Claude (AI)

---

## Code Conventions

### TypeScript
- Strict mode everywhere
- Explicit types on public API function signatures — no implicit `any`
- Use `import type` for type-only imports (critical: `libs/power-level` imports types from `libs/deck-builder` this way to avoid circular runtime deps)
- Path aliases (`@mtg/collection`, `@mtg/scryfall`, etc.) defined in `tsconfig.base.json` AND each lib's `vite.config.ts` `resolve.alias`

### Libraries (`libs/`)
- Pure TypeScript — no framework dependencies in libs
- Each lib has its own `vite.config.ts` for Vitest
- Libs never import from `apps/` — only `apps/` imports from `libs/`
- `libs/power-level` → can `import type` from `libs/deck-builder` but NOT runtime import (circular dep risk)

### React Components
- Functional components with hooks only — no class components
- Props interfaces defined inline above the component
- No CSS-in-JS — use `styles.css` classes
- All DOM IDs and class names used in tests must be stable (e.g., `id="collection"`, `id="commander"`, `.build-btn`)

### API Routes (Fastify)
- All routes live in `apps/api/src/routes/`
- Use `app.inject()` in integration tests — never start a real server in tests
- Errors return `{ error: string, message: string }` shape

---

## Testing Rules

### The BDD Workflow — Always Follow This Order

1. **Spec first:** Write or update `specs/journeys/NNN-name.feature.md` with Gherkin scenarios
2. **Test second:** Write a failing test in the appropriate `*.spec.ts`/`*.spec.tsx`
3. **Code third:** Make the test pass
4. **Docs:** Update `README.md` Features table and any changed architecture

> **Never ship a user-facing feature without a test and an updated README.**

### Test File Locations

| Layer | Pattern | Notes |
|-------|---------|-------|
| Unit (libs) | `libs/*/src/lib/*.spec.ts` | Co-located with source |
| Unit (API) | `apps/api/src/**/*.spec.ts` | Co-located with source |
| Integration (API) | `apps/api/src/routes/*.integration.spec.ts` | Fastify inject, mocked externals |
| Component (React) | `apps/web/src/components/*.spec.tsx` | Vitest + RTL |
| E2E | `apps/web-e2e/src/journeys/*.spec.ts` | Playwright, needs servers running |

### What to Mock in Tests

- `@mtg/edhrec` → `vi.mock('@mtg/edhrec', ...)` — never hit real EDHRec in tests
- `@mtg/scryfall` → `vi.mock('@mtg/scryfall', ...)` — never hit real Scryfall in tests
- `@mtg/power-level` → mock `assessPowerLevelWithCombos` in API route tests (it calls Commander Spellbook)
- Anthropic Claude → always mocked — no live API calls in tests

### DOM Selectors (Stable — Do Not Rename)

These are used in Playwright tests and component tests. If you rename them, update all test files:

| Selector | Element |
|----------|---------|
| `#collection` | Collection textarea |
| `#commander` | Commander name input |
| `#mode` | Build mode select |
| `#target-bracket` | Target bracket select |
| `#budget-price` | Budget price input |
| `.build-btn` | Submit button |
| `.suggestions li` | Commander autocomplete items |
| `.power-level-badge` | Power level badge container |
| `.bracket-label` | e.g. "Bracket 3 — Enhanced" |
| `.power-score` | e.g. "6/10" |
| `.signal-chip` | Individual signal badges |
| `.target-suggestions` | Swap suggestions panel |
| `.swap-suggestion` | Individual swap item |
| `.swap-alt-chip` | Alternative card chip |
| `.slot-section` | Deck slot (ramp/draw/etc.) |
| `.card-item` | Card list item |
| `.card-item.card-unowned` | Unowned card indicator |
| `.gaps-section` | Missing staples panel |
| `.explain-btn` | AI explain button |

---

## Architecture Decisions

### Why `import type` for cross-lib types

`libs/power-level/src/lib/analyzer.ts` does `import type { DeckList, DeckAnalysis } from '@mtg/deck-builder'`. Using `import type` means TypeScript strips this at compile time — no runtime circular dependency. Runtime deps flow only one way: `apps/api` → `libs/power-level` and `apps/api` → `libs/deck-builder`.

### Why EDHRec candidates are passed into `assessPowerLevelWithCombos`

Power-level lib intentionally does NOT import `@mtg/edhrec`. Instead, the API route builds an `EdhrecCandidate[]` from the EDHRec response (cards not in the final deck) and passes them in. This keeps `libs/power-level` independent of the EDHRec client.

### Why synergy + inclusion blended score (50/50)

Pure inclusion rate would rank universally-popular cards above cards that are specifically synergistic with your commander. The 50/50 blend ensures a card that's a perfect fit for your commander (high synergy) competes equally with broadly-popular staples.

### EDHRec slug generation

EDHRec slugs are generated by `toEDHRecSlug()` in `libs/edhrec`. The algorithm normalizes card names to EDHRec's specific URL pattern (lowercased, apostrophes removed, special chars → hyphens). This is intentionally aligned with EDHRec's own slug format — other sites may use different conventions.

### Commander Spellbook integration

- Endpoint: `https://backend.commanderspellbook.com/variants/?q=card:"Name1"...`
- Capped at 80 non-land cards per query
- In-memory cache keyed by sorted-name hash
- Any network failure returns `[]` — never blocks a deck build (graceful degradation)

---

## What NOT to Do

- **Don't add new docs files** beyond README, this file, and `specs/journeys/*.feature.md`
- **Don't use speckit** — this project moved away from speckit; use the BDD workflow described above
- **Don't commit secrets** — `ANTHROPIC_API_KEY` lives in `.env`, never in source
- **Don't start a real HTTP server in tests** — use `app.inject()` for API tests
- **Don't rename stable DOM selectors** without updating all test files
- **Don't add CMC=0 non-land cards to CMC average** — EDHRec cards default to `cmc: 0` when the field is missing; `analyzeDeck()` already skips these
- **Don't add a new lib** without registering its path alias in both `tsconfig.base.json` AND every `vite.config.ts` that needs it

---

## Running Everything

```bash
pnpm install           # install deps
pnpm serve:api         # Fastify on :3000
pnpm serve:web         # Vite on :4200
pnpm test              # all Vitest suites
npx nx run web-e2e:e2e # Playwright (needs both servers)
npx tsx --tsconfig tsconfig.json scripts/eval-decks.ts  # quality eval harness
```

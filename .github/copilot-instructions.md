# GitHub Copilot Instructions — MTG Commander Deck Builder

> This file is read automatically by GitHub Copilot. It provides context about codebase conventions, architecture decisions, and development rules to keep the AI aligned with how this project works.

---

## What This Project Does

An NX monorepo that builds optimized 100-card Commander (MTG) decks from an MTG Arena collection export. Core flow: parse collection → work out what the commander is about and score every card for it from the local card index (`libs/commander-recs`) → fill deck per slot → assess power level (Commander Brackets 1–5) → return structured result with gap analysis and swap suggestions.

**Always read `README.md` first** for current feature status, architecture, and API contracts.

---

## Tech Stack

- **Monorepo:** NX 22, pnpm workspaces
- **Frontend:** React 18, TypeScript, Vite, plain CSS (no MUI)
- **Backend:** Fastify (Node.js), TypeScript
- **Testing:** Vitest (unit + component + integration), Playwright (E2E)
- **External APIs:** Scryfall (one fuzzy name lookup; card data comes from bulk files built into `data/generated`), Anthropic Claude (AI), Gemini (advisor chat). Commander Spellbook's combos are a bulk file read at build time, not an API call. No requests to edhrec.com: its terms forbid automated access

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

- The card index → build a small one with `buildCommanderTestIndex()` from `@mtg/commander-recs/testing` or `buildTestIndex()` from `@mtg/deck-advisor/testing`; tests never need `data/generated`
- `@mtg/scryfall` → `vi.mock('@mtg/scryfall', ...)` — never hit real Scryfall in tests
- `@mtg/power-level` → mock `assessPowerLevel` in API route tests when the test is about what the route hands it
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
| `.bracket-label` | e.g. "Bracket 3 — Upgraded" |
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

### Why swap candidates are passed into `assessPowerLevelWithCombos`

Power-level lib intentionally does NOT import `@mtg/commander-recs`. Instead, the API route builds a `SwapCandidate[]` from the commander's recommendations that did not make the deck and passes them in. This keeps `libs/power-level` independent of how recommendations are made.

### Why popularity and synergy are weighted per slot

Popularity is Scryfall's EDHREC rank: Commander-wide, so it knows Sol Ring is a staple and nothing about this commander. It leads the ramp, draw and interaction slots, where staples belong. Synergy leads the synergy and win-condition slots, which is what makes two commanders in the same colours get different decks. The weights are `SLOT_WEIGHTS` in `libs/commander-recs`.

### Where recommendations come from

`libs/commander-recs` computes them from the local card index: themes read from Scryfall Tagger tags, type line, keywords and rules text. There is no per-commander inclusion percentage, and nothing may claim one. Do not add a source whose terms forbid automated access.

### Commander Spellbook integration

- Combos come from Commander Spellbook's bulk file, built into `data/generated/combos.json.gz` by `pnpm data:combos` and read through `libs/combos`. Nothing calls their API at request time.
- A deck build finds its combos with `comboLines()` in `libs/deck-builder` and hands them to `assessPowerLevel`; without the file the assessment goes by its other signals
- Credit Commander Spellbook and link to the combo's page wherever a combo is shown

---

## What NOT to Do

- **Don't add new docs files** beyond README, this file, and `specs/journeys/*.feature.md`
- **Don't use speckit** — this project moved away from speckit; use the BDD workflow described above
- **Don't commit secrets** — `ANTHROPIC_API_KEY` lives in `.env`, never in source
- **Don't start a real HTTP server in tests** — use `app.inject()` for API tests
- **Don't rename stable DOM selectors** without updating all test files
- **Don't label a number as something it is not** — `popularity` is Scryfall's EDHREC rank across Commander, not how often a card is played with this commander
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

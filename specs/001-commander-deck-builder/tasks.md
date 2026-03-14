# Tasks: MTG Commander Deck Builder

**Spec**: `specs/001-commander-deck-builder/spec.md`
**Constitution**: `.specify/memory/constitution.md`

## Phase 1: Foundation — Shared Types & Lib Scaffolds

- [x] T001 NX workspace with pnpm, TypeScript strict, Vitest _(done in scaffold)_
- [x] T002 Lib stubs: collection, scryfall, edhrec, deck-builder, ai-advisor _(done in scaffold)_
- [ ] T003 [P] `libs/collection` — Arena export parser (types + implementation + tests)
- [ ] T004 [P] `libs/scryfall` — Scryfall API client (Zod schemas + rate limiter + tests)
- [ ] T005 [P] `libs/edhrec` — EDHRec API client (Zod schemas + cache + tests)

---

## Phase 2: Core Algorithm

- [ ] T006 `libs/deck-builder` — scoring formula, slot filler, gap analysis, tests _(depends on T003–T005 types)_
- [ ] T007 `libs/ai-advisor` — Claude claude-haiku-4.5 wrapper, graceful fallback, fixture tests

---

## Phase 3: User Story 1 — Build deck from commander (P1) 🎯 MVP

**Independent Test**: POST `/api/decks/build-from-commander` with Atraxa fixture → valid 100-card deck

### Tests (write first, verify they FAIL)
- [ ] T008 [P] [US1] Unit: `libs/collection` parse fixture Arena export → CollectionMap
- [ ] T009 [P] [US1] Unit: `libs/deck-builder` slot filler with fixture EDHRec + collection data
- [ ] T010 [P] [US1] Unit: `libs/deck-builder` color identity filter (mono-green commander)
- [ ] T011 [P] [US1] Unit: `libs/deck-builder` gap analysis top-10 missing cards
- [ ] T012 [P] [US1] Unit: `libs/scryfall` mock HTTP — named card lookup + Zod validation
- [ ] T013 [P] [US1] Unit: `libs/edhrec` mock HTTP — commander slug lookup + cache hit

### Implementation
- [ ] T014 [US1] `apps/api` — scaffold Fastify app with health check, Zod error handler
- [ ] T015 [US1] `apps/api` — `POST /api/collection/parse` route
- [ ] T016 [US1] `apps/api` — `POST /api/decks/build-from-commander` route (wires libs)
- [ ] T017 [US1] `apps/api` — `GET /api/commanders/search` route
- [ ] T018 [US1] `apps/web` — scaffold React+Vite+Tailwind+React Query
- [ ] T019 [US1] `apps/web` — CollectionInput component (textarea paste + parse)
- [ ] T020 [US1] `apps/web` — CommanderSearch component (autocomplete from collection)
- [ ] T021 [US1] `apps/web` — DeckDisplay component (grouped by slot, EDHRec scores)
- [ ] T022 [US1] `apps/web` — GapAnalysis component (missing staples, budget/premium split)
- [ ] T023 [US1] `apps/web` — ExportButton component (Arena + Moxfield formats)

**Checkpoint**: P1 independently functional — paste collection → pick commander → get deck

---

## Phase 4: User Story 2 — Build from theme (P2)

**Independent Test**: POST `/api/decks/build-from-theme` with "tokens" + fixture collection → commanders + deck

### Tests (write first)
- [ ] T024 [P] [US2] Unit: `libs/edhrec` theme slug lookup + commander matching
- [ ] T025 [P] [US2] Unit: `libs/deck-builder` theme flow — commander ranking from collection

### Implementation
- [ ] T026 [US2] `apps/api` — `GET /api/themes` route
- [ ] T027 [US2] `apps/api` — `POST /api/decks/build-from-theme` route
- [ ] T028 [US2] `apps/web` — ThemeSelector component
- [ ] T029 [US2] `apps/web` — CommanderSuggestions component (ranked list, pick one to build)

**Checkpoint**: P1 + P2 both functional

---

## Phase 5: User Story 3 — AI deck explanation (P3)

**Independent Test**: POST `/api/ai/explain-deck` → explanation + keyCards + suggestedUpgrades

### Tests (write first)
- [ ] T030 [P] [US3] Unit: `libs/ai-advisor` fixture response parsing + graceful timeout fallback

### Implementation
- [ ] T031 [US3] `apps/api` — `POST /api/ai/explain-deck` route (non-blocking)
- [ ] T032 [US3] `apps/web` — ExplainDeck button + explanation panel (loads async, graceful error)

**Checkpoint**: All P1+P2+P3 functional

---

## Phase 6: CI + Deployment

- [ ] T033 `.github/workflows/build-api.yml` — test + build + push Docker image to ACR
- [ ] T034 `.github/workflows/build-web.yml` — test + build + deploy static assets
- [ ] T035 `k8s/` — Deployment + Service manifests for `portfolio` namespace on K3s

---

## Dependency Order

```
T003 ──┐
T004 ──┼──► T006 (deck-builder) ──► T014–T023 (apps/api + apps/web)
T005 ──┘
T007 (ai-advisor) ──► T031 (explain-deck route)
```

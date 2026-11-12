# MTG Deck Builder Constitution

## Core Principles

### I. Library-First (NON-NEGOTIABLE)

Every reusable piece of logic MUST live in `libs/`, not in `apps/`.

**Requirements:**
- `libs/collection` — Arena export parsing (zero external deps, pure TS)
- `libs/scryfall` — Scryfall API client (rate-limited, typed)
- `libs/card-index` — local card database built from Scryfall's bulk files
- `libs/commander-recs` — what a commander is about and every card scored for it (pure, no HTTP, reads the card index)
- `libs/deck-builder` — Scoring algorithm + slot filler (no HTTP deps — accepts typed data)
- `libs/ai-advisor` — Claude API wrapper for deck explanations
- Libraries MUST be independently buildable and testable
- `apps/api` and `apps/web` MUST NOT duplicate logic from libs
- Library public API defined via barrel exports in `src/index.ts`

**Rationale:** Deck building logic must be testable without running a server. The scoring algorithm and collection parser are the core product — they deserve isolation and unit test coverage.

### II. Test-First (NON-NEGOTIABLE)

Every acceptance scenario in `spec.md` MUST map to at least one automated test.

**Requirements:**
- `libs/collection`: Full unit tests with real Arena export format fixtures
- `libs/deck-builder` and `libs/commander-recs`: Scoring formula, theme detection + slot filler tested with fixture collections and a fixture card index
- `libs/scryfall`: Mock HTTP tests (no live API calls in CI)
- Tests MUST pass before any PR merges to main
- AI advisor tests use fixture responses (no live Claude calls in CI)

**Rationale:** The deck builder algorithm is the core value proposition. If it scores cards incorrectly or fills slots wrong, the product is broken. Unit tests are the only way to catch regressions confidently.

### III. External Data Contracts

Third-party data shapes MUST be typed and validated at the boundary, and a source MUST be used only in a way its terms allow.

**Requirements:**
- All Scryfall API responses MUST be parsed through Zod schemas
- Unknown fields MUST be stripped (`.strip()`) — API responses can have extra fields
- Invalid data MUST throw typed errors, not silently return undefined
- Rate limits respected: Scryfall ≥100ms between calls
- Bulk data (Scryfall, Commander Spellbook, tournament lists) is read at build time by `scripts/data/*`, at most daily, with a User-Agent that names this project
- No requests to edhrec.com: its terms forbid automated access (decided 2026-11-12, issue #10). Commander recommendations are computed locally from the card index. Check a site's terms before adding it as a source

**Rationale:** The data is third-party. Validating at the boundary prevents silent failures where a schema change breaks deck building, and staying inside each source's terms keeps the project publishable.

### IV. Stateless API (MVP)

The API server MUST be stateless — no database, no sessions, no persistent storage in the MVP.

**Requirements:**
- Collection passed per request as text; parsed server-side per call
- Deck output returned in the response; not stored
- No user accounts, no saved decks (v1)
- All state lives in the client (React app state)
- If caching is added, it MUST be in-memory (TTL: 1 session)

**Rationale:** Simplicity. The product value is the algorithm, not data persistence. Adding a database adds operational complexity and cost. Ship faster; add persistence in v2 when there's evidence it's needed.

### V. Transparent Deck Choices

Every card in the built deck MUST have a traceable reason for inclusion.

**Requirements:**
- Each slot category (ramp, draw, interaction, synergy, etc.) MUST be labeled in output
- Each card MUST carry its `popularity`, its `synergy` and at least one `reason` that is true of the card
- A number MUST be labelled as what it is: `popularity` is Scryfall's EDHREC rank across Commander, not how often a card is played with this commander
- Gap analysis MUST show the top-N cards NOT owned with the reason each is in the deck
- AI advisor explanations MUST reference specific cards from the decklist, not generic advice

**Rationale:** Users need to trust the output. "Why is this card here?" is the most important question to answer. A deck builder that produces unexplainable results will not be used.

## Technology Standards

### Runtime & Language
- Node.js 20 LTS, TypeScript 5 strict mode
- `noUncheckedIndexedAccess: true` — no silent undefined array access

### API Framework
- Fastify (not Express) — typed schemas, faster, better TypeScript support
- Zod for request/response validation at the API boundary

### Frontend
- React 18 + Vite 5
- Tailwind CSS for styling
- React Query for API data fetching and caching

### Testing
- Vitest (not Jest) — faster, native ESM, compatible with Vite
- `globals: true` — no explicit import needed in tests
- Unit tests colocated: `src/lib/foo.spec.ts` next to `src/lib/foo.ts`

### AI Integration
- Anthropic Claude `claude-haiku-4.5` (fast + cheap for deck explanation)
- API key via `ANTHROPIC_API_KEY` environment variable
- AI is additive — deck builds MUST work without AI (AI layer is optional enhancement)

### Deployment
- Docker images → Azure Container Registry (`maasselacr.azurecr.io`)
- K3s homelab: `portfolio` namespace (consistent with other portfolio workloads)
- CI: GitHub Actions, self-hosted ARC runner

## Compliance Validation

Before any PR to main:
- [ ] All lib unit tests pass (`nx run-many --target=test`)
- [ ] TypeScript compiles (`nx run-many --target=typecheck`)
- [ ] No direct HTTP calls in `libs/deck-builder` (algo is pure)
- [ ] New acceptance scenarios in spec.md have corresponding tests
- [ ] Scryfall responses validated through Zod at boundary
- [ ] No new data source whose terms forbid automated access

## Governance

This constitution supersedes all other practices. Amendments require:
1. A clear rationale for why the principle needs to change
2. Migration plan for existing code that violates the new rule
3. Update to this file committed to main

**Version**: 1.1.0 | **Ratified**: 2026-03-03 | **Amended**: 2026-11-12 (EDHRec replaced by local recommendations, issue #10)

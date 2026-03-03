# Feature Specification: MTG Commander Deck Builder from Collection

**Feature Branch**: `001-commander-deck-builder`  
**Created**: 2026-03-03  
**Status**: Draft  
**Input**: Build a web app that takes a user's MTG collection (MTG Arena export) and constructs an optimized Commander deck from cards they own, using EDHRec rankings + Scryfall data for scoring and AI for explanation.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Build a Commander deck from a commander I own (Priority: P1)

As an MTG player with a large Arena collection, I want to pick a commander I own and have the app build the best possible 99-card deck from the rest of my collection — so I can quickly put together a Commander deck without manually cross-referencing EDHRec for hours.

**Why this priority**: This is the core product. Everything else depends on this working well. A user with a collection and a commander in mind should get a complete, playable decklist in seconds.

**Independent Test**: Paste a fixture Arena collection export containing at least 200 cards (including a known commander like "Atraxa, Praetors' Voice"). POST to `/api/decks/build-from-commander`. Verify the response is a valid 100-card Commander deck where: (1) the commander is the submitted commander, (2) all 99 other cards are present in the collection, (3) each slot category (ramp, draw, interaction, synergy, lands) has at least one card, (4) all cards are legal in Commander, (5) color identity of all cards matches the commander's color identity.

**Acceptance Scenarios**:

1. **Given** a user pastes their Arena collection, **When** they search for a commander they own and click Build, **Then** the app returns a full 100-card decklist grouped by: Commander, Ramp, Card Draw, Interaction, Win Conditions, Synergy, Lands, and Flex slots
2. **Given** the deck is returned, **When** the user inspects any card, **Then** they can see its EDHRec inclusion rate for this commander and its synergy score
3. **Given** the deck is built, **When** the user views the gap analysis, **Then** they see the top 5 cards NOT in their collection with highest EDHRec inclusion rates, with USD prices from Scryfall
4. **Given** the user clicks "Export as Arena", **When** the export is copied, **Then** the format matches MTG Arena's import format (quantity + card name per line)
5. **Given** a commander with a narrow color identity (e.g., mono-green), **When** the deck is built, **Then** all 99 cards match the commander's color identity (no off-color cards)

---

### User Story 2 — Choose an archetype/theme and get commander suggestions (Priority: P2)

As an MTG player who knows they want to play a "tokens" or "stax" deck but doesn't have a specific commander in mind, I want to pick a playstyle and have the app suggest commanders from my collection and build the deck around one — so I can discover hidden options in my collection.

**Why this priority**: Builds on P1 (uses same deck-building engine). Unlocks collection discovery — a core reason someone would use this over just copying an EDHRec decklist.

**Independent Test**: POST `/api/decks/build-from-theme` with theme "tokens" and a fixture collection containing at least 3 known tokens commanders (e.g., "Rhys the Redeemed", "Teysa Karlov", "Adrix and Nev, Twincasters"). Verify response contains at least one suggested commander from the collection, each with an EDHRec rank, and that selecting one produces a valid 100-card deck.

**Acceptance Scenarios**:

1. **Given** a user selects the "tokens" theme, **When** the app processes their collection, **Then** it returns up to 5 commanders they own that support the theme, sorted by EDHRec rank
2. **Given** suggested commanders are shown, **When** the user picks one, **Then** the same deck building flow as User Story 1 runs and produces a full 100-card decklist
3. **Given** no commanders matching the theme are in the collection, **When** the theme is selected, **Then** the app shows a friendly message listing the top 3 commanders for that theme the user does NOT own, with Scryfall prices

---

### User Story 3 — Get AI explanation of why the deck was built this way (Priority: P3)

As someone who wants to learn, not just copy a decklist, I want the app to explain the deck's strategy, highlight key synergies, and tell me which upgrades would have the biggest impact — so I understand why each card is in the deck.

**Why this priority**: The rules-based deck builder has full value on its own (P1 + P2). AI is an enhancement that increases trust and learning value. It requires working API + deck builder.

**Independent Test**: POST `/api/ai/explain-deck` with a complete DeckList and commander name. Verify the response contains: (1) a natural language explanation of the deck's win condition or strategy, (2) at least 2 named synergy pairs or combos from the decklist, (3) at least 1 named upgrade suggestion with a specific card name and reason.

**Acceptance Scenarios**:

1. **Given** a deck has been built, **When** the user clicks "Explain this deck", **Then** within 10 seconds they receive a 3-4 paragraph explanation covering: deck strategy, key synergies, and top upgrade priorities
2. **Given** the AI explanation is returned, **When** the user reads it, **Then** all card names mentioned are actual cards in the built deck or the gap analysis list
3. **Given** the AI service is unavailable (rate limit / timeout), **When** the user clicks "Explain", **Then** the app shows a graceful error ("Explanation unavailable — try again") and the deck is still fully usable without it

---

### Edge Cases

- What happens when the collection has fewer than 100 unique legal cards for the commander's color identity? → Fill with basics (always available in Arena)
- What if the user submits a commander not in EDHRec? → Return a "commander not found" error with a suggestion to try a different name; do not crash
- What if EDHRec is down? → Cache last-known data in memory; if no cache, return an error with the collection parse result so the user knows their collection imported correctly
- What if a card name in the Arena export doesn't match Scryfall? → Skip the card, include it in a "unrecognized cards" list in the response
- What if the commander has fewer than 99 uniquely-legal cards in the collection? → Fill remaining slots with best-fit basics; note the count in the response

---

## Requirements *(mandatory)*

### Functional Requirements

**Collection Import**
- Accept MTG Arena collection export format: `{quantity} {card name} ({set}) {collector#}` per line
- Parse quantity, card name, set code, collector number
- Normalize card names (lowercase, trim) for matching
- Basic lands (Plains, Island, Swamp, Mountain, Forest, and their Snow variants) MUST be treated as always-available regardless of collection
- Return count of total cards, unique cards, and commanders found

**Deck Building — Commander Flow**
- Accept: (collectionText: string, commanderName: string, options?: { budget?: 'any' | 'budget' })
- Validate commander: must be a legendary creature (or planeswalker with commander rules text), legal in Commander format
- Fetch EDHRec data for the commander (card recommendations, inclusion rates, synergy scores)
- Filter collection to cards matching the commander's color identity
- Fill slots in order: Ramp (10) → Card Draw (10) → Interaction (10) → Win Conditions (5) → Synergy (25) → Lands (36) → Flex (3)
- Scoring formula: `score = (inclusion_rate × 0.5) + (synergy_score × 0.3) + (1 - cmc/10) × 0.2`
- Never include more than 1 copy of any card (Commander singleton rule)
- Return: deck (100 cards grouped by slot), analysis (curve, color distribution), gaps (top-N missing staples)

**Deck Building — Theme Flow**
- Accept: (collectionText: string, theme: string)
- Fetch EDHRec theme data for the archetype
- Identify commanders in collection that match the theme's color identities
- Rank suggested commanders by their EDHRec rank (lower = more popular)
- Return: suggestedCommanders[], plus a pre-built deck for the top suggestion

**Gap Analysis**
- Report top 10 EDHRec-recommended cards NOT in the collection for this commander
- Include: card name, EDHRec inclusion rate, Scryfall USD price, reason (which slot it would fill)
- Separate budget (<$5) and premium (>$5) upgrade lists

**Export**
- Arena format: `{quantity} {card name}` (1 per card for Commander)
- Moxfield format: `1 {card name}` (same, but Moxfield-compatible)
- Copy-to-clipboard in the UI

### Non-Functional Requirements

- Deck build response: ≤ 5 seconds (includes EDHRec + Scryfall API calls)
- Collection parse: ≤ 100ms for a 2,000-card collection
- AI explanation: ≤ 10 seconds, non-blocking (deck shown first)
- EDHRec API: 200ms rate limit between calls, in-memory cache per server session
- Scryfall API: 100ms rate limit between calls (per their guidelines)
- No authentication required for MVP
- Mobile-friendly UI (works on phone)

---

## Data Models

### CollectionMap
```typescript
type CollectionMap = Map<string, OwnedCard>; // key: normalized card name

interface OwnedCard {
  name: string;         // Original name from export
  normalizedName: string;
  quantity: number;
  set?: string;
  collectorNumber?: string;
}
```

### ScryfallCard (key fields)
```typescript
interface ScryfallCard {
  id: string;
  name: string;
  type_line: string;       // "Legendary Creature — Human Wizard"
  color_identity: string[]; // ["W", "U", "B", "R", "G"]
  cmc: number;
  legalities: { commander: 'legal' | 'not_legal' | 'banned' };
  prices: { usd: string | null };
  edhrec_rank: number | null;
}
```

### EDHRecCommanderData
```typescript
interface EDHRecCommanderData {
  commander: string;
  slug: string;
  cardlist: EDHRecCard[];
}

interface EDHRecCard {
  name: string;
  inclusion: number;   // 0-100 percent of decks that include this card
  synergy: number;     // -1 to 1, how much more/less this card appears vs. average
  label: string;       // "ramp", "draw", "removal", "staple", etc.
  cmc: number;
}
```

### DeckList (API response)
```typescript
interface DeckList {
  commander: DeckCard;
  slots: {
    ramp: DeckCard[];
    draw: DeckCard[];
    interaction: DeckCard[];
    winConditions: DeckCard[];
    synergy: DeckCard[];
    lands: DeckCard[];
    flex: DeckCard[];
  };
  totalCards: number; // Always 100
}

interface DeckCard {
  name: string;
  quantity: 1;
  ownedInCollection: boolean; // Always true in MVP (only owned cards included)
  edhrec_inclusion: number;
  edhrec_synergy: number;
  score: number;
  slot: string;
  cmc: number;
  type_line: string;
}
```

### DeckAnalysis
```typescript
interface DeckAnalysis {
  commanderName: string;
  manaCurve: Record<number, number>;  // cmc → card count
  colorDistribution: Record<string, number>; // "W" → count
  averageCmc: number;
  staplesCoveragePercent: number; // % of EDHRec top-50 that you own
}
```

### GapReport
```typescript
interface GapReport {
  missingStaples: MissingCard[];
  budgetUpgrades: MissingCard[];  // < $5
  premiumUpgrades: MissingCard[]; // >= $5
}

interface MissingCard {
  name: string;
  edhrec_inclusion: number;
  usdPrice: number | null;
  wouldFillSlot: string;
}
```

---

## API Contract

### POST `/api/decks/build-from-commander`
```
Body: {
  collectionText: string,    // Raw Arena export text
  commanderName: string,     // e.g. "Atraxa, Praetors' Voice"
  options?: { budget?: 'any' | 'budget' }
}
Response: {
  deck: DeckList,
  analysis: DeckAnalysis,
  gaps: GapReport
}
Errors:
  400 — invalid collection format
  404 — commander not found in EDHRec
  422 — commander not in collection
```

### POST `/api/decks/build-from-theme`
```
Body: { collectionText: string, theme: string }  // theme: "tokens", "voltron", etc.
Response: {
  suggestedCommanders: Array<{ name: string; edhrec_rank: number; colorIdentity: string[] }>,
  deck: DeckList,    // Built for top suggestion
  analysis: DeckAnalysis,
  gaps: GapReport
}
```

### POST `/api/ai/explain-deck`
```
Body: { deck: DeckList, commanderName: string }
Response: { explanation: string, keyCards: string[], suggestedUpgrades: string[] }
```

### GET `/api/commanders/search?q={query}`
```
Response: { commanders: Array<{ name: string; slug: string; colorIdentity: string[] }> }
```

### GET `/api/themes`
```
Response: { themes: Array<{ slug: string; displayName: string; description: string }> }
```

### POST `/api/collection/parse`
```
Body: { collectionText: string }
Response: {
  cards: OwnedCard[],
  commandersFound: string[],
  totalCards: number,
  unrecognizedLines: string[]
}
```

---

## Architecture

### Repo Structure
```
mtg-deck-builder/
├── apps/
│   ├── api/          Fastify API server (port 3001)
│   └── web/          React + Vite SPA (port 5173 dev)
├── libs/
│   ├── collection/   Arena export parser → CollectionMap (pure TS, no HTTP)
│   ├── scryfall/     Scryfall API client (rate-limited, Zod-validated)
│   ├── edhrec/       EDHRec API client + in-memory cache (Zod-validated)
│   ├── deck-builder/ Scoring + slot filler + gap analysis (pure — no HTTP deps)
│   └── ai-advisor/   Claude API wrapper for deck explanations
├── specs/
│   └── 001-commander-deck-builder/
│       ├── spec.md   (this file)
│       ├── plan.md   (populated by speckit.plan)
│       └── tasks.md  (populated by speckit.tasks)
├── k8s/              K3s deployment manifests
├── .specify/
│   ├── memory/constitution.md
│   └── templates/
└── .github/workflows/
    ├── build-api.yml
    └── build-web.yml
```

### Dependency Graph
```
apps/api ──── libs/collection
         ──── libs/scryfall
         ──── libs/edhrec
         ──── libs/deck-builder (depends on scryfall + edhrec types, not clients)
         ──── libs/ai-advisor

apps/web ──── (no lib deps — calls apps/api via HTTP)
```

### EDHRec API (Unofficial)
Base: `https://edhrec.com/api/`
- `GET /commanders/{slug}` — top cards for a commander (slug = lowercase name, spaces→hyphens)
- `GET /themes/{slug}` — top cards for a theme
- `GET /commanders` — full commander list for autocomplete
Rate limit: 200ms between requests; cache per commander slug in memory.

### Scryfall API
Base: `https://api.scryfall.com/`
- `GET /cards/named?fuzzy={name}` — single card lookup by name
- `GET /cards/search?q=is:commander+legal:commander` — commander list
Rate limit: 100ms between requests (per Scryfall guidelines).

### AI Advisor
- Model: `claude-haiku-4.5` (Anthropic)
- Single prompt: commander name + deck by slot + top missing staples
- Expected output: 3-4 paragraphs covering strategy, synergies, upgrades
- Non-blocking: deck returned immediately, AI response streamed/deferred

---

## Out of Scope (v1)

- Paper collection support (v2 — same algo, different input parser)
- Non-Commander formats: Standard, Modern, Pioneer, Draft (v2+)
- User accounts / saved decks (v2)
- Deck sharing via URL (v2)
- Proxy printing (v3)
- Price optimization / deck cost minimization (v2)
- Real-time collection sync (Arena API does not exist publicly)

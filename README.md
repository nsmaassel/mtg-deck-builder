# MTG Deck Builder

Build optimized Commander decks from your MTG collection. Paste your MTG Arena collection export, pick a commander or archetype, and get a full 100-card decklist built from cards you actually own — with EDHRec-powered scoring and AI explanations.

## Features

- 🃏 **Build from commander** — Pick any legendary creature you own, get the best possible 99 from your collection
- 🎯 **Build from theme** — Choose an archetype (tokens, stax, voltron, landfall...) and discover commanders in your collection
- 📊 **Gap analysis** — See which staples you're missing and their prices (budget + premium upgrades)
- 🤖 **AI explanations** — Claude explains your deck's strategy, key synergies, and top upgrade targets
- 📋 **Export** — Copy in Arena or Moxfield format

## Architecture

```mermaid
graph TB
    subgraph Frontend
        WEB[apps/web<br/>React + Vite]
    end

    subgraph API
        API[apps/api<br/>Fastify]
    end

    subgraph Libraries
        COL[libs/collection<br/>Arena parser]
        SCR[libs/scryfall<br/>Card data]
        EDH[libs/edhrec<br/>Meta rankings]
        DB[libs/deck-builder<br/>Scoring algorithm]
        AI[libs/ai-advisor<br/>Claude explanations]
    end

    subgraph External
        SCRYFALL[Scryfall API]
        EDHREC[EDHRec API]
        CLAUDE[Anthropic Claude]
    end

    WEB -->|HTTP| API
    API --> COL
    API --> DB
    API --> AI
    DB --> SCR
    DB --> EDH
    SCR --> SCRYFALL
    EDH --> EDHREC
    AI --> CLAUDE
```

## Local Development

### Prerequisites
- Node.js 20+
- pnpm 9+

```bash
# Install dependencies
pnpm install

# Start API (http://localhost:3001)
pnpm dev:api

# Start web (http://localhost:5173)
pnpm dev:web

# Run all tests
pnpm test
```

### Environment Variables

Create `.env` in `apps/api/`:
```env
ANTHROPIC_API_KEY=sk-ant-...   # For AI deck explanations (optional for MVP)
PORT=3001
```

## Spec-Kit Workflow

This repo uses [spec-kit](https://github.com/specify-cli/specify) for AI-assisted development.

```bash
# Generate implementation plan from spec
speckit.plan

# Generate tasks from plan
speckit.tasks

# Implement tasks
speckit.implement
```

The spec lives at `specs/001-commander-deck-builder/spec.md`.  
Constitution at `.specify/memory/constitution.md`.

## Deck Building Algorithm

Slots filled in priority order using EDHRec scoring:

| Slot | Count | Selection Logic |
|------|-------|----------------|
| Commander | 1 | Provided by user |
| Ramp | 10 | EDHRec-ranked mana rocks + ramp spells in color identity |
| Card Draw | 10 | EDHRec-ranked draw spells |
| Interaction | 10 | Removal + counterspells |
| Win Conditions | 5 | Archetype-specific win cons |
| Synergy | 25 | Highest EDHRec inclusion + synergy score |
| Lands | 36 | Nonbasics owned + basics to fill |
| Flex | 3 | Best remaining by score |

**Scoring**: `score = (inclusion_rate × 0.5) + (synergy_score × 0.3) + (1 - cmc/10) × 0.2`

## Deployment

K3s homelab (`portfolio` namespace):

```bash
kubectl apply -f k8s/
kubectl rollout status deployment/mtg-api -n portfolio
kubectl rollout status deployment/mtg-web -n portfolio
```

## Project Structure

```
apps/
  api/          Fastify API server
  web/          React + Vite SPA
libs/
  collection/   Arena export parser (pure TS, no HTTP)
  scryfall/     Scryfall API client
  edhrec/       EDHRec API client + cache
  deck-builder/ Scoring algorithm + slot filler
  ai-advisor/   Claude explanation wrapper
specs/
  001-commander-deck-builder/
    spec.md     Feature specification
    plan.md     Implementation plan (speckit.plan)
    tasks.md    Task breakdown (speckit.tasks)
k8s/            Kubernetes manifests
.specify/       Spec-kit constitution + templates
```

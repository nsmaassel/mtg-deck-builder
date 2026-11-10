# User Journey Specs

This directory contains BDD-style feature specifications for the MTG Deck Builder.
Each `.feature.md` file maps to one or more automated tests.

## Journey Index

| ID | Journey | Test File | Tags |
|----|---------|-----------|------|
| J-001 | [Happy Path Build](./001-happy-path-build.feature.md) | `apps/web-e2e/src/journeys/happy-path.spec.ts` | `@smoke @regression` |
| J-002 | [Bracket Targeting](./002-bracket-targeting.feature.md) | `apps/web-e2e/src/journeys/bracket-targeting.spec.ts` | `@regression` |
| J-003 | [Owned Cards Only](./003-owned-only.feature.md) | `apps/web-e2e/src/journeys/owned-only.spec.ts` | `@regression` |
| J-005 | [Gap Analysis](./005-gap-analysis.feature.md) | `apps/web-e2e/src/journeys/happy-path.spec.ts` | `@regression` |
| J-008 | [Error States](./008-error-states.feature.md) | `apps/web-e2e/src/journeys/error-states.spec.ts` | `@smoke @regression` |
| J-009 | [New Player Onboarding](./009-new-player-onboarding.feature.md) | `apps/web-e2e/src/journeys/new-player-onboarding.spec.ts` | `@smoke @regression @onboarding` |
| J-010 | [Check a Deck Against My Collection](./010-deck-check.feature.md) | `libs/deck-advisor/src/lib/*.spec.ts`, `apps/api/src/routes/advisor.integration.spec.ts` | `@smoke @regression` |
| J-011 | [Bring My Arena Collection](./011-collection-import.feature.md) | `libs/collection/src/lib/import/*.spec.ts` | `@smoke @regression` |
| J-012 | [Find the Meta Deck I Am Closest To](./012-meta-decks.feature.md) | `libs/meta-decks/src/lib/*.spec.ts` | `@regression` |

## Running Tests

```bash
# E2E (requires web + API running)
pnpm serve:api &
pnpm serve:web &
npx nx run web-e2e:e2e

# E2E headed (see browser)
npx nx run web-e2e:e2e:headed

# All unit + component tests
pnpm test

# API integration only
npx nx run api:test
```

## Tag Strategy

| Tag | Meaning | When to run |
|-----|---------|-------------|
| `@smoke` | Core flows only — fast subset | On every PR, pre-deploy |
| `@regression` | Full coverage | Nightly, before release |
| `@journey` | All E2E journeys | Full E2E run |

## BDD Workflow

1. **New feature** → Write/update `.feature.md` first (spec-first)
2. **Review** → Confirm scenarios with team before coding
3. **Implement** → Write failing test, then code, then pass
4. **Commit** → Feature + test together in one commit

This ensures tests document intent, not just implementation.

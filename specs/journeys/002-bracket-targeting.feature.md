# Feature: Power Level Bracket Targeting

**Journey ID:** J-002  
**Business Value:** Users want to tune deck power to match their play group's bracket. Key differentiator vs. generic deck builders.  
**Test File:** `apps/web-e2e/src/journeys/bracket-targeting.spec.ts`  
**Tags:** `@regression`

---

## Background

> The user builds a deck that ends up at a higher bracket than their casual play group uses. They want specific recommendations for which cards to swap to bring it down.

```gherkin
Background:
  Given I have a collection that includes WotC Game Changers (Rhystic Study, Cyclonic Rift, etc.)
  And my deck builds to Bracket 3 or higher by default
```

---

## Scenario 1: Swap Suggestions for Powering Down

```gherkin
Scenario: Build targeting a lower bracket shows named swap suggestions
  Given I build a deck for "Atraxa, Praetors' Voice"
  And I select "Target Bracket 1" before building
  When the deck builds successfully
  Then the "💡 Suggestions" panel should be visible
  And at least one swap suggestion should be shown
  And each suggestion should name a specific card to remove (e.g. "Rhystic Study")
  And each suggestion should give a reason (e.g. "WotC Game Changer")
  And each suggestion should offer 1–3 EDHRec alternatives with inclusion percentages
```

---

## Scenario 2: No Suggestions When No Target Set

```gherkin
Scenario: Building without a target bracket shows no swap panel
  Given I do NOT select a target bracket (leave it as "— No target (score only) —")
  When I build a deck
  Then the power level badge should show
  And the swap suggestions panel should NOT be visible
  # Scores the deck but doesn't generate swap suggestions without a target
```

---

## Scenario 3: Power-Up Suggestions

```gherkin
Scenario: Build targeting a higher bracket shows add suggestions
  Given I have a small collection with no Game Changers
  And my deck builds to Bracket 1 or 2
  And I select "Target Bracket 3"
  When the deck builds successfully
  Then the suggestions panel should recommend Game Changers from EDHRec to add
  And the alternatives should show EDHRec inclusion % and synergy score where available
```

---

## Signal to Bracket Mapping (for test expectations)

| Condition | Expected Bracket | Test Commander |
|-----------|-----------------|----------------|
| 0 Game Changers, 0 tutors, <40% staples | 1 | Any with minimal collection |
| 1+ Tier-B tutor OR 40%+ staples | 2 | Most collections |
| 1+ Game Changer OR 2+ Tier-A tutors | 3 | Collection with Rhystic Study |
| 4+ Game Changers OR 2-card combo + GC | 4 | Collection with Jeweled Lotus + combos |
| 6+ GC + 2 Tier-A + avg CMC <2.0 | 5 | cEDH collection |

---

## Acceptance Criteria

| Criterion | How Tested |
|-----------|-----------|
| Suggestions panel appears iff targetBracket !== actualBracket | E2E bracket-targeting.spec.ts |
| Each suggestion names a specific card (not generic text) | `.swap-remove strong` not empty |
| Alternatives include inclusion % | `.swap-alt-chip em` shows number |
| High-synergy alternatives show ⚡ badge | `.swap-alt-synergy` visible when synergy > 0.1 |
| Alternatives are commander-specific | Sourced from EDHRec for that commander — color-legal by construction |

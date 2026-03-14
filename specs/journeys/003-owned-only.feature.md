# Feature: Owned Cards Only Mode

**Journey ID:** J-003  
**Business Value:** Users who only want to play what they physically own need the app to respect hard collection constraints.  
**Test File:** `apps/web-e2e/src/journeys/owned-only.spec.ts`  
**Tags:** `@regression`

---

```gherkin
Feature: Owned-only deck build mode

  Scenario: All non-basic cards come from collection
    Given I have a collection of 80 non-basic cards
    And I select "🔒 Owned Only — use strictly what you own" build mode
    When I build a deck for "Krenko, Mob Boss"
    Then every non-land card in the deck should appear in my collection export
    And basic lands (Plains, Island, Swamp, Mountain, Forest) are always allowed
    # The deck may be under 100 cards if collection is too small — that is acceptable

  Scenario: Unowned indicator not shown in owned-only mode
    Given I build in owned-only mode with a 80-card collection
    When the deck is displayed
    Then cards should NOT show the unowned dot (○) indicator
    # All cards in the result are owned by definition

  Scenario: Prefer-owned mode fills gaps with recommendations
    Given I have a 15-card collection
    And I select "🃏 Prefer Owned — fill gaps with top recommendations" mode
    When I build a deck
    Then owned cards should appear in the deck
    And the remaining slots should be filled with EDHRec recommendations
    And unowned fill cards should show the ○ unowned indicator
```

---

## Mode Behaviors

| Mode | Collection cards used | Unowned cards | Notes |
|------|----------------------|---------------|-------|
| `prefer-owned` (default) | Boosted in scoring | Added from EDHRec top picks | Deck always reaches 100 |
| `owned-only` | Only source | Never used | Deck may be <100 if collection too small |
| `budget` | Boosted in scoring | Added if price ≤ budgetMaxPrice | Deck targets 100 |

---

## Acceptance Criteria

| Criterion | How Tested |
|-----------|-----------|
| owned-only mode produces no unowned non-basic cards | Count `.card-item.card-unowned` — should be 0 or only basics |
| prefer-owned mode shows unowned indicator on fill cards | `.card-item.card-unowned` visible with ○ dot |
| mode selector is visible and functional | `#mode` select exists, changing value works |

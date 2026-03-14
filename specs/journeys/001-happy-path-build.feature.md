# Feature: Build a Commander Deck from Collection

**Journey ID:** J-001  
**Business Value:** Core product feature. If this breaks, nothing else matters.  
**Test File:** `apps/web-e2e/src/journeys/happy-path.spec.ts`  
**API Test:** `apps/api/src/routes/decks.integration.spec.ts`  
**Tags:** `@smoke @regression`

---

## Background

> The user has exported their MTG Arena collection and wants to build an optimized 100-card Commander deck using their owned cards plus EDHRec recommendations.

```gherkin
Background:
  Given I have a valid MTG Arena collection export with 50+ cards
  And the MTG Deck Builder web app is loaded
```

---

## Scenario 1: Standard Deck Build

```gherkin
Scenario: Build a 100-card deck for a multi-color commander
  Given I paste my collection into the collection textarea
  And I enter "Atraxa, Praetors' Voice" as my commander
  When I click "⚔️ Build Deck"
  Then I should see the deck header showing "Atraxa"
  And the deck stats should show "100 cards"
  And the power level badge should be visible with a Bracket (1–5) and score (/10)
  And the deck should contain at least 6 slot sections (ramp, draw, interaction, win conditions, synergy, lands)
```

---

## Scenario 2: Deck Contains Only Color-Legal Cards

```gherkin
Scenario: Atraxa deck contains only WUBG cards
  Given I build a deck for "Atraxa, Praetors' Voice"
  When the deck is displayed
  Then no card in the deck should violate White/Blue/Black/Green color identity
  # Enforced by the deck builder's isColorLegal() filter applied to all EDHRec candidates
```

---

## Scenario 3: Power Level Signals Shown for Powerful Collection

```gherkin
Scenario: Collection with Game Changers shows signal chips
  Given my collection contains "Rhystic Study" and "Cyclonic Rift" (WotC Game Changers)
  When I build a deck for "Atraxa, Praetors' Voice"
  Then the power level badge should show at least one signal chip
  And the signal chip should mention "Game Changer" or "Tutor"
```

---

## Scenario 4: Gap Analysis Shows Missing Cards

```gherkin
Scenario: Small collection triggers gap analysis
  Given I have a minimal collection of only 10 cards
  When I build a deck for "Krenko, Mob Boss"
  Then the gap analysis section should be visible
  And it should list cards I don't own with EDHRec inclusion percentages
```

---

## Acceptance Criteria

| Criterion | How Tested |
|-----------|-----------|
| Deck is exactly 100 cards | Assert `"100 cards"` in `.deck-stats` |
| Commander identity respected | Color identity filter in `isColorLegal()` (unit tested) |
| Power level always shown | `.power-level-badge` visible after every successful build |
| Slots grouped correctly | At least 6 `.slot-section` elements |
| Owned vs unowned distinguished | `.card-item.card-unowned` shown with ○ dot |
| Gap analysis when applicable | `.gaps-section` visible when missingStaples.length > 0 |

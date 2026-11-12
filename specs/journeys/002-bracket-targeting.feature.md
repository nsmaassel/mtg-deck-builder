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
  And each suggestion should offer 1–3 alternatives from the recommendations for this commander
  And each alternative should say how widely it is played across Commander ("widely played", "often played", "rarely played")
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
  Then the suggestions panel should recommend Game Changers to add, from the recommendations for this commander
  And the alternatives should show how widely each is played and its synergy with the commander where there is some
```

---

## Scenario 4: No Actionable Swaps (A Bracket Reached on Widely Played Cards Alone)

```gherkin
Scenario: Targeting lower bracket with a deck that is simply full of widely played cards shows explanatory hint
  Given my deck reaches Bracket 3 only because its spells are widely played (no Game Changers, no tutors, no combos)
  And I select "Target Bracket 2"
  When the deck builds successfully
  Then the suggestions area should show an explanatory message
  # e.g. "no specific swaps needed — this deck reaches Bracket 3 on widely played cards alone"
  And the message should NOT be silently empty
```

---

## Signal to Bracket Mapping (for test expectations)

| Condition | Expected Bracket | Test Commander |
|-----------|-----------------|----------------|
| 0 Game Changers, 0 tutors, spells averaging under 30 | 1 | Any with minimal collection in owned-only mode |
| 1+ Tier-B tutor OR spells averaging 30+ | 2 | Most collections |
| 1+ Game Changer OR 2+ Tier-A tutors OR a two-card combo OR spells averaging 40+ | 3 | Collection with Rhystic Study; any build with no collection |
| 4+ Game Changers OR 2-card combo + GC | 4 | Collection with Jeweled Lotus + combos |
| 6+ GC + 2 Tier-A + avg CMC <2.0 | 5 | cEDH collection |

"Spells averaging N" is how widely played the deck's nonland cards are across Commander, on average, out of 100 (from Scryfall's EDHREC rank). It stands in for how tuned a list is when there are no Game Changers, tutors or combos to go by, and it is about the deck's own cards: measured on real builds, the best list for a commander averages 41–50, a list from a large collection 33–45, and from a starter collection 28–38.

Two-card combos come from Commander Spellbook's data, read locally: only combos that need nothing but their two named cards count.

"Top picks" is shown on the page but not scored: the share of the deck we would build with every card available that is in this deck.

---

## Acceptance Criteria

| Criterion | How Tested |
|-----------|-----------|
| Suggestions panel appears when targetBracket !== actualBracket | E2E bracket-targeting.spec.ts |
| Shows swap cards when Game Changers/tutors exist | `.swap-remove strong` not empty |
| Shows explanatory hint when no swaps possible (top-picks-only bracket) | `.no-suggestions-hint` visible |
| Alternatives say how widely played | `.swap-alt-chip em` shows a word, with a tooltip naming Scryfall's EDHREC rank |
| High-synergy alternatives show ⚡ badge | `.swap-alt-synergy` visible when synergy > 0.1 |
| Alternatives are commander-specific | The recommendations computed for that commander — color-legal by construction |

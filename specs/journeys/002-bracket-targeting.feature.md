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

## Scenario 1: A Build Aimed at a Lower Bracket

```gherkin
Scenario: Build targeting a lower bracket is steered to it and says what changed
  Given I build a deck for "Atraxa, Praetors' Voice"
  And I select "Target Bracket 2" before building
  When the deck builds successfully
  Then the power level badge should show Bracket 2
  And a "Built for Bracket 2" box should name each card left out (e.g. "Rhystic Study")
  And each card left out should give a reason (e.g. "On the Game Changers list", "Half of a two-card combo with …")
  And the deck should still have 100 cards
  # Where the build cannot reach the target, the box says "Aimed at Bracket N; the closest this build gets is Bracket M"
  # and the "💡 Suggestions" panel covers the rest, with 1–3 alternatives per swap and how widely each is played
```

---

## Scenario 2: No Suggestions When No Target Set

```gherkin
Scenario: Building without a target bracket shows no swap panel
  Given I do NOT select a target bracket (leave it as "— No target (best cards, score only) —")
  When I build a deck
  Then the power level badge should show
  And the swap suggestions panel should NOT be visible
  # Scores the deck but doesn't generate swap suggestions without a target
```

---

## Scenario 3: Aiming Higher

```gherkin
Scenario: Build targeting a higher bracket puts in what gets it there
  Given my deck builds to Bracket 2 with no target
  And I select "Target Bracket 3"
  When the deck builds successfully
  Then the tuning box should name each Game Changer or tutor put in, with its reason
  And the power level badge should show Bracket 3

Scenario: An owned-only build that cannot get there says so
  Given I build in "Owned Only" mode from a small collection with no Game Changers
  And I select "Target Bracket 3"
  When the deck builds successfully
  Then the tuning box should say "Aimed at Bracket 3; the closest this build gets is Bracket …"
  And the suggestions panel should recommend Game Changers to add, from the recommendations for this commander
  And the alternatives should show how widely each is played and its synergy with the commander where there is some
```

---

## Scenario 4: Too Strong on Widely Played Cards Alone

```gherkin
Scenario: Targeting a lower bracket with a deck that is simply full of widely played cards
  Given my deck reaches Bracket 3 only because its spells are widely played (no Game Changers, no tutors, no combos)
  And I select "Target Bracket 2"
  When the deck builds successfully
  Then the tuning box should say that widely played staples gave way to cards fewer decks play
  And the "Widely played" figure should be under 40
  # If even that does not get there, the suggestions area shows its explanatory message rather than nothing
```

---

## Signal to Bracket Mapping (for test expectations)

| Condition | Basis | Expected Bracket |
|-----------|-------|-----------------|
| Nothing below, spells averaging under 24 | our estimate | 1 |
| Spells averaging 24–39, one extra-turn card, or a slow or minor two-card combo | our estimate | 2 |
| 1–3 Game Changers (as Scryfall's card data marks them), or a two-card combo Commander Spellbook places in Bracket 3 | published rule | 3 |
| 2+ cheap tutors, or spells averaging 40+ | our estimate | 3 |
| 4+ Game Changers, mass land denial, or a fast two-card combo (Commander Spellbook's Bracket 4) | published rule | 4 |
| 2+ extra-turn cards, or 2+ Game Changers with 2+ cheap tutors or a very low curve | our estimate | 4 |
| 8+ Game Changers, or Game Changers or combos with cheap tutors and an average mana value near 2 | our estimate | 5 |

A deck sits in the highest bracket any row puts it in, and the page labels each reason "Bracket rule" or "Our estimate". "How brackets are worked out" under the bracket links every source.

"Spells averaging N" is how widely played the deck's nonland cards are across Commander, on average, out of 100 (from Scryfall's EDHREC rank). It stands in for how tuned a list is when there are no Game Changers, tutors or combos to go by, and it is about the deck's own cards: measured on real builds, the best list for a commander averages 41–50, a list from a large collection 33–45, and from a starter collection 28–38. Wizards' preconstructed decks since 2023 average 20–39, nine in ten at 24 or more, which is where the line between Brackets 1 and 2 sits.

Combos come from Commander Spellbook's data, read locally: only two-card combos that need nothing but their named cards count (the commander is not one of the two), each at the bracket their data gives it.

"Top picks" is shown on the page but not scored: the share of the deck we would build with every card available that is in this deck.

---

## Acceptance Criteria

| Criterion | How Tested |
|-----------|-----------|
| A build with a target is steered to it and lists what it left out or put in | `.bracket-tuning`; unit tests in `libs/deck-builder/src/lib/bracket-target.spec.ts` |
| Suggestions panel appears when the build could not reach the target | `.target-suggestions` when targetBracket !== actualBracket |
| Shows swap cards when Game Changers/tutors exist | `.swap-remove strong` not empty |
| Shows explanatory hint when no swaps possible (top-picks-only bracket) | `.no-suggestions-hint` visible |
| Alternatives say how widely played | `.swap-alt-chip em` shows a word, with a tooltip naming Scryfall's EDHREC rank |
| High-synergy alternatives show ⚡ badge | `.swap-alt-synergy` visible when synergy > 0.1 |
| Alternatives are commander-specific | The recommendations computed for that commander — color-legal by construction |

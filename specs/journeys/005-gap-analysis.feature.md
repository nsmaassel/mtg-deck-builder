# Feature: Gap Analysis — Cards to Buy

**Journey ID:** J-005  
**Business Value:** Shows users exactly what to buy to upgrade. Future monetization hook (affiliate/TCGPlayer links).  
**Test File:** `apps/web-e2e/src/journeys/happy-path.spec.ts` (J-001 Scenario 4)  
**Tags:** `@regression`

---

```gherkin
Feature: Gap analysis panel

  Scenario: Shows the cards to get after build
    Given I have a collection of only 15 cards
    When I build a deck for any commander
    Then the "📋 Cards to Get" section should be visible
    And each gap card should show:
      | Field            | Example                    |
      |------------------|----------------------------|
      | Card name        | "Rhystic Study"            |
      | Reason           | "Draws cards again and again" |
      | Popularity       | "widely played"            |
      | Would fill slot  | "draw"                     |
      | Price (if known) | "$4.50"                    |
    # Popularity is Scryfall's EDHREC rank, put in words: how widely the card is played across
    # Commander as a whole, not with this commander. No share of decks is shown anywhere.

  Scenario: No gap section when collection is comprehensive
    Given I have a collection of 200+ cards covering all slots
    When I build a deck
    Then the gap section may be hidden or empty
    # missingCards.length === 0 → section not rendered

  Scenario: Gap cards are sorted by how much the deck leans on them
    Given I view the gap analysis
    Then the cards with the highest score for their slot should appear first
    # Sorted by the builder's score descending; price is shown, not used for the order
```

---

## Gap Card Data Shape

```ts
interface GapCard {
  name: string;               // "Rhystic Study"
  popularity: number;         // 0..1, from Scryfall's EDHREC rank: Commander-wide, not per commander
  synergy: number;            // 0..1, fit with this commander
  reasons: string[];          // ["Draws cards again and again"]
  wouldFillSlot: string;      // "draw"
  usdPrice: number | null;    // Cheapest paper printing in the card index (null if unknown)
}
```

---

## Acceptance Criteria

| Criterion | How Tested |
|-----------|-----------|
| Gap section visible when missingCards > 0 | `.gaps-section` exists |
| Each gap card shows name, reason and popularity in words | `.card-reason` not empty; text contains "played" |
| No share of decks is claimed | `.gaps-section` does not contain "inclusion" |
| Slot shown for each gap card | `wouldFillSlot` text visible |
| Price shown when available (`usdPrice != null`) | `.card-price` visible in gaps section |
| Top 10 shown (not all) | UI slices to 10: `missingCards.slice(0, 10)` |

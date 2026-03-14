# Feature: Gap Analysis — Cards to Buy

**Journey ID:** J-005  
**Business Value:** Shows users exactly what to buy to upgrade. Future monetization hook (affiliate/TCGPlayer links).  
**Test File:** `apps/web-e2e/src/journeys/happy-path.spec.ts` (J-001 Scenario 4)  
**Tags:** `@regression`

---

```gherkin
Feature: Gap analysis panel

  Scenario: Shows top missing staples after build
    Given I have a collection of only 15 cards
    When I build a deck for any commander
    Then the "📋 Missing Staples" section should be visible
    And each gap card should show:
      | Field            | Example            |
      |------------------|--------------------|
      | Card name        | "Rhystic Study"    |
      | EDHRec inclusion | "72% inclusion"    |
      | Would fill slot  | "draw"             |

  Scenario: No gap section when collection is comprehensive
    Given I have a collection of 200+ cards covering all slots
    When I build a deck
    Then the gap section may be hidden or empty
    # missingStaples.length === 0 → section not rendered

  Scenario: Gap cards are sorted by value (inclusion × inverse price)
    Given I view the gap analysis
    Then higher-inclusion staples should appear before low-inclusion ones
    # Currently sorted by EDHRec inclusion % descending
```

---

## Gap Card Data Shape

```ts
interface GapCard {
  name: string;               // "Rhystic Study"
  edhrec_inclusion: number;   // 72 (percent)
  wouldFillSlot: string;      // "draw"
  usdPrice?: number;          // From Scryfall (may be null if unavailable)
}
```

---

## Acceptance Criteria

| Criterion | How Tested |
|-----------|-----------|
| Gap section visible when missingStaples > 0 | `.gaps-section` exists |
| Each gap card shows name and inclusion | Text content check |
| Slot shown for each gap card | `wouldFillSlot` text visible |
| Top 10 shown (not all) | UI slices to 10: `missingStaples.slice(0, 10)` |

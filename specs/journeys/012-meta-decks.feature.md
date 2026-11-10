# Feature: Find the Meta Deck I Am Closest To

**Journey ID:** J-012  
**Business Value:** A player with a partial collection wants to know which competitive deck their wildcards go furthest on, before spending any.  
**Test Files:** `libs/meta-decks/src/lib/*.spec.ts`, `libs/deck-advisor/src/lib/plan.spec.ts`, `apps/api/src/routes/advisor.integration.spec.ts`  
**Tags:** `@regression`

---

```gherkin
Feature: Meta decks ranked by my collection

  Scenario: Browse the meta without a collection
    Given meta snapshots exist for Standard and Pioneer
    When I open the meta decks for Standard
    Then archetypes are listed by meta share
    And each shows its share, list count, and match win rate where enough matches were recorded
    And I see which events and dates the numbers come from

  Scenario: Rank by what I can build
    Given I have loaded a collection with wildcards
    When I open the meta decks
    Then decks I already own or can craft today come first
    And the rest are ordered by the wildcards still needed, rares and mythics weighing most
    And each row shows how much of the deck I own and what I am short

  Scenario: Check a meta deck
    When I pick an archetype
    Then its most typical well-placed list is checked against my collection
    And stand-ins that other lists of the same archetype play are preferred
    And say so ("In 38% of Izzet Prowess main decks")
    And I can switch to the archetype's other lists

  Scenario: Formats without open data
    Given no open tournament data exists for Historic, Timeless, Alchemy or Brawl
    Then the meta view says so and points me to pasting a list
```

---

## Where the numbers come from

| What | Source | Caveat |
|------|--------|--------|
| Decklists and standings | Community cache of lists published on mtgo.com and melee.gg | Tournament play, not the Arena ladder |
| Archetype names | Community archetype definitions (MTGOFormatData) | Lists no rule matches are grouped as "Other" and left out of the table |
| Win rate | Match records from events that publish standings | Leagues publish only 5-0 lists and are excluded |

No source with open Arena ladder win rates was found. Untapped.gg has that data and its terms forbid scraping; this app does not use it.

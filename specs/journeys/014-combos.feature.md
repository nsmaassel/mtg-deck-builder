# Feature: Combos I Own, and Combos One Card Away

**Journey ID:** J-014  
**Business Value:** A player wants to know what their cards already do together, and which single craft would unlock the most, before reading a hundred combo pages.  
**Test Files:** `libs/combos/src/lib/*.spec.ts`, `libs/deck-advisor/src/lib/combos.spec.ts`, `apps/api/src/routes/advisor.integration.spec.ts`, `apps/web/src/advisor/Combos.spec.tsx`  
**Tags:** `@regression`

---

```gherkin
Feature: Combos from my collection and my lists

  Scenario: Combos my collection holds
    Given I have loaded a collection
    When I ask for the combos I own in a format
    Then I see how many combos I hold every card of, and the most played of them
    And each shows its cards, what it produces, and a link to how it works on Commander Spellbook

  Scenario: One card away
    Given I hold all but one card of some combos
    Then I see the missing cards that would finish the most combos, with the wildcard each costs
    And for each, the most played combo it finishes

  Scenario: Only what I can play
    Then every combo shown is legal in the chosen format, every one of its cards included
    And a combo that needs a card as its commander appears only in formats with a commander

  Scenario: Combos in a list
    Given I check a decklist
    Then I see the combos whose cards are all in the list
    And the cards outside it that would add a combo inside the deck's colours, ones I own first
    And a combo that needs its commander counts only when that card leads the list

  Scenario: What a combo also needs
    Given a combo needs something any card of a kind can provide, such as a sacrifice outlet
    Then that requirement is shown with the combo, since its named cards alone are not enough

  Scenario: Ask the advisor
    When I ask the advisor what combos I own
    Then it looks them up, names Commander Spellbook as the source, and passes on what each also needs
    And it does not explain the steps itself

  Scenario: No combo data on the server
    Given the combos file was not built
    Then the page shows no combos panel and deck checks carry no combos
    And everything else works
```

---

## Where the data comes from

Commander Spellbook publishes every combo variant as one file and asks tools to read it instead of calling their API: about 121,000 variants, 730 MB of JSON. `pnpm data:combos` reads it one variant at a time and keeps what the lookups need: the cards, what the combo produces, its colour identity, generic requirements, and how many decks use it. The steps, prerequisites and prices stay on Commander Spellbook, one link away, which is also the credit they ask for.

Legality comes from this repository's card index, not from the file: a combo is legal in a format when each of its cards is. Commander Spellbook has no Historic or Timeless legality, which is where most Arena combos live.

The deck count is Commander Spellbook's, and mostly Commander decks. It says how well known a combo is. It does not say how good it is in a 60-card format, and the page says so.

## Acceptance Criteria

| Criterion | How Tested |
|-----------|-----------|
| The 730 MB document is split one element at a time, across chunk boundaries inside strings and multi-byte characters | `json-array-splitter.spec.ts` |
| Legality is the intersection of the cards' legalities; a commander-only combo is legal only in commander formats | `builder.spec.ts` |
| A whole collection is searched without building an object per combo; results come most played first, ties by id | `combo-index.spec.ts` |
| "One card away" needs at least one card held, so a combo of a single card plus a requirement is not offered to everyone | `combo-index.spec.ts` |
| A list's combos stay inside its colours; the commander a combo needs is never offered as a card to add | `combos.spec.ts` (deck-advisor) |
| A damaged combos file is skipped with a warning; a missing one is silent | `load.spec.ts` (deck-advisor) |
| The page credits Commander Spellbook and links each combo to its steps | `Combos.spec.tsx` |

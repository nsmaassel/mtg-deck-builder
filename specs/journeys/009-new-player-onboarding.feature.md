# Journey: New Player Onboarding — Build a Commander Deck Without a Collection

**Tags:** `@smoke @regression @onboarding`

## Background

A new or returning MTG player wants to get into Commander but doesn't have an MTG Arena collection export — they might have no digital collection, or just want to explore deck ideas before committing. The app should let them pick a commander and immediately build a full 100-card deck using EDHRec's top recommendations, with optional budget constraints.

---

## Scenario: Build a deck with no collection — happy path

**Given** I am on the deck builder page
**And** I have not pasted a collection
**When** I select "I'm new to Commander / Skip collection"
**And** I enter "Krenko, Mob Boss" as the commander
**And** I click "Build Deck"
**Then** I should see a complete 100-card Commander deck
**And** The deck should be built from EDHRec top recommendations for Krenko
**And** All cards should be marked as unowned (since I provided no collection)
**And** No error should be shown

---

## Scenario: Build a budget deck with no collection

**Given** I am on the deck builder page
**And** I select "I'm new to Commander / Skip collection"
**And** I enter "Atraxa, Praetors' Voice" as the commander
**And** I select "Budget" build mode
**And** I set max price per card to $3.00
**When** I click "Build Deck"
**Then** I should see a complete 100-card Commander deck
**And** The deck should prioritize owned cards (none) and budget unowned cards under $3
**And** Unowned cards above $3 should be excluded from the deck
**And** Gaps analysis should show missing staples with their prices

---

## Scenario: Still require commander when skipping collection

**Given** I am on the deck builder page
**And** I select "I'm new to Commander / Skip collection"
**And** I leave the commander field empty
**When** I click "Build Deck"
**Then** I should see an error: "Please enter a commander name."

---

## Scenario: Toggle back to collection mode

**Given** I am on the deck builder page
**And** I select "I'm new to Commander / Skip collection"
**And** I then uncheck "I'm new to Commander / Skip collection"
**Then** The collection textarea should become required again
**And** The submit should validate both collection and commander are filled

---

## Scenario: Invalid collection text still rejected when provided

**Given** I am on the deck builder page
**And** I do NOT select "I'm new to Commander / Skip collection"
**And** I paste "this is not a valid collection!!!" into the collection textarea
**And** I enter "Krenko, Mob Boss" as the commander
**When** I click "Build Deck"
**Then** I should see an error about invalid collection format
**And** No deck should be built
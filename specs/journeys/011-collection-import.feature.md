# Feature: Bring My Arena Collection

**Journey ID:** J-011  
**Business Value:** MTG Arena has no collection export, so players arrive with whatever their tracker writes. Accepting those files as they are removes the biggest hurdle to using the advisor.  
**Test Files:** `libs/collection/src/lib/import/*.spec.ts`, `apps/api/src/routes/advisor.integration.spec.ts`  
**Tags:** `@smoke @regression`

---

```gherkin
Feature: Collection import

  Scenario: Paste an Arena-style card list
    Given I paste lines such as "4 Lightning Strike (FDN) 199"
    When I import
    Then the cards are matched by name and counted across printings
    And lines that match no card are reported, not silently dropped

  Scenario: Upload a tracker export
    Given I upload the JSON a collection reader wrote (Arena card ids and counts)
    When I import
    Then cards are matched by Arena id, falling back to name

  Scenario: Upload a spreadsheet export
    Given I upload a CSV from Untapped.gg, Moxfield, Archidekt or MTG Arena Tool
    When I import
    Then the count, name, set and number columns are found by their headers, in any order

  Scenario: Add wildcards and saved decks from Player.log
    Given I choose my Player.log with Detailed Logs enabled
    When I import
    Then only the login snapshot is sent to the server, not the whole log
    And my wildcard counts are filled in
    And the decks saved in my Arena client are listed, ready to check
    And I am told the log never contains the collection itself

  Scenario: Detailed Logs are off
    Given my Player.log says Detailed Logs are disabled
    When I import
    Then I am told how to turn them on

  Scenario: Try without a collection
    Given I have no export to hand
    When I pick a made-up collection profile
    Then a clearly labelled sample collection is loaded
    And I can edit the wildcard counts by hand

  Scenario: The collection stays with me
    When I reload the page
    Then my collection is still loaded from this browser's storage
    And the server has kept nothing between requests
```

---

## Why there is no "connect your Arena account"

The collection has not been in Arena's log file since August 2021. Every tool that shows a full collection reads it from the running game's memory, which means admin rights, antivirus friction, and access to the session token. This app reads files those tools write and never runs or ships a memory reader itself.

## Accepted inputs

| Input | Detected by | Carries |
|-------|-------------|---------|
| Arena-style text (`4 Name (SET) 123`, `4x Name (SET) #24 [rare]`, `2 Name`) | at least one line parses | cards |
| Tracker JSON keyed by Arena id (mtga-tracker-daemon, mtga-reader, MTGA Collection Reader) | numeric id rows or id→count map | cards |
| Tracker JSON with names (MTGA Deck Advisor, collection exporters) | rows with `name` | cards, wildcards |
| CSV with a header row | count-like and name-like headers | cards |
| Player.log | Unity log markers | wildcards, vault progress, saved decks |

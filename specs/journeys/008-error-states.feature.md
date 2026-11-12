# Feature: Error States and Validation

**Journey ID:** J-008  
**Business Value:** Clear error messaging prevents user frustration and support burden.  
**Test File:** `apps/web-e2e/src/journeys/error-states.spec.ts`  
**Tags:** `@smoke @regression`

---

```gherkin
Feature: Input validation and error handling

  Scenario: Submitting without collection shows validation error
    Given I have NOT pasted a collection
    And I have entered a commander name
    When I click "⚔️ Build Deck"
    Then I should see a validation error
    And the deck view should NOT appear
    And no API call should be made

  Scenario: Submitting without commander shows validation error
    Given I have pasted a valid collection
    And I have NOT entered a commander name
    When I click "⚔️ Build Deck"
    Then I should see a validation error
    And the deck view should NOT appear

  Scenario: Completely invalid collection text returns error
    Given I paste "this is not a valid collection at all"
    And I enter "Atraxa, Praetors' Voice" as commander
    When I click "⚔️ Build Deck"
    Then the API returns 400 with message about invalid collection format
    And the UI should display the error message
    And the deck view should NOT appear

  Scenario: Commander not found returns graceful error
    Given I paste a valid collection
    And I enter "Totally Fake Commander XYZ123" as commander
    When I click "⚔️ Build Deck"
    Then the API returns a not-found error
    And the UI should display a meaningful error message
    # The commander is looked up in the local card index; a name it does not know as typed
    # is passed to Scryfall's fuzzy search once, for its spelling
    # No stack traces or raw JSON shown to user

  Scenario: Card data not generated on the server
    Given the server was started without a card index
    When I search for a commander or build a deck
    Then the API returns 503 with a message telling the operator to run `pnpm data:cards`
    And the rest of the app keeps working
```

---

## Error Response Shapes

```ts
// 400 - Bad collection
{ error: 'Invalid collection format', message: 'Could not parse collection. Use MTG Arena export format.' }

// 404 - Commander not found
{ error: 'Commander not found', commanderName: '...' }

// 422 - Not legal in Commander
{ error: 'Commander not legal', message: '... is not legal in Commander format' }

// 502 - Scryfall unreachable while spelling a commander name
{ error: 'Deck data service temporarily unavailable', message: '...' }

// 503 - Card index not generated on this server
{ error: 'Commander Builder data not built', message: 'The card index is missing on this server. Run `pnpm data:cards`, then restart.' }
```

---

## Acceptance Criteria

| Criterion | How Tested |
|-----------|-----------|
| Client-side validation (empty fields) fires before API call | `api.buildDeck` mock should NOT be called |
| Server error messages displayed to user | `.error` or `[role="alert"]` element visible |
| No deck shown on error | `.deck-header h2` not visible |
| Error clears on next successful build | After fixing inputs and resubmitting, error goes away |
| Build button disabled during loading | `.build-btn[disabled]` during submit |

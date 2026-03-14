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

  Scenario: Commander not found in Scryfall returns graceful error
    Given I paste a valid collection
    And I enter "Totally Fake Commander XYZ123" as commander
    When I click "⚔️ Build Deck"
    Then the API returns a not-found error
    And the UI should display a meaningful error message
    # No stack traces or raw JSON shown to user
```

---

## Error Response Shapes

```ts
// 400 - Bad collection
{ error: 'Invalid collection format', message: 'Could not parse collection. Use MTG Arena export format.' }

// 404 / 422 - Commander not found  
{ error: 'Commander not found', message: 'No card named "..." found in Scryfall.' }

// 503 - External API down (graceful degradation)
{ error: 'Service unavailable', message: '...' }
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

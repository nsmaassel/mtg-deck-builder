# Feature: Ask the Advisor

**Journey ID:** J-013  
**Business Value:** A player's real question is rarely "check this list". It is "which deck should I build" or "where do my wildcards go". The agent picks the checks that answer it and explains the result.  
**Test Files:** `libs/advisor-agent/src/lib/chat.spec.ts`, `apps/api/src/routes/advisor.integration.spec.ts`, `apps/api/src/chat-budget.spec.ts`, `apps/web/src/advisor/ChatPanel.spec.tsx`  
**Tags:** `@regression`

---

```gherkin
Feature: Conversational deck advice

  Background:
    Given the server has a model configured
    And I have loaded a collection

  Scenario: Ask which deck to build
    When I ask "Which Standard deck am I closest to building?"
    Then the advisor ranks the meta against my collection
    And answers with a recommendation and the facts behind it
    And I see which checks it ran above the answer

  Scenario: Follow up
    Given the advisor has recommended a deck
    When I ask what to craft first
    Then it checks that deck against my collection
    And names the cards with no good stand-in first

  Scenario: The advisor does not guess
    When I ask what a card does or what could replace it
    Then every card fact and every stand-in in the answer came from a tool
    And a stand-in is described with the grade and reason the engine gave it

  Scenario: No collection loaded
    Given I have not loaded a collection
    When I ask about my cards
    Then the advisor tells me to load one, and answers what it can without it

  Scenario: The budget runs out
    Given the day's chat budget is spent
    When I ask a question
    Then I am told chat is back tomorrow, and that the deck check still works
    And the model is not called

  Scenario: A question that gets no answer costs nothing
    Given the model fails, or my conversation is at its length limit
    When I ask a question
    Then the day's budget is not charged
    And my conversation is left exactly as it was, so asking again is not asking twice

  Scenario: The server has forgotten my conversation
    Given my conversation expired or the server restarted
    When I ask a follow-up
    Then the answer is marked as starting a new conversation

  Scenario: No model configured
    Given the server has no model key
    Then the chat panel says so instead of offering an input
    And the rest of the page works as before
```

---

## Code decides, the model explains

The agent is a Google ADK `LlmAgent`. Its tools are the same engine the page calls; none of them reaches the network.

| Tool | Returns |
|------|---------|
| `collection_summary` | Whether a collection is loaded, its size, the wildcards on hand |
| `list_meta_decks` | Archetypes with meta share and win rate, ordered by the collection when one is loaded |
| `check_meta_deck` | Gap, wildcard cost, stand-ins with reasons and a buildable list for a meta archetype |
| `check_decklist` | The same for a pasted list, in any format |
| `lookup_cards` | Rules text, cost, legality, Arena rarity, roles and copies owned for up to 8 cards |
| `find_stand_ins` | Stand-ins for one card outside a full list |

The instruction forbids stating card text, legality, ownership, costs or meta numbers from memory, and forbids proposing a replacement no tool returned.

## What bounds the cost

| Limit | Default | Setting |
|-------|---------|---------|
| Chat messages per UTC day, all visitors | 300 | `ADVISOR_AGENT_DAILY_LIMIT` |
| Chat messages per minute, all visitors | 20 | `ADVISOR_AGENT_PER_MINUTE` |
| Model calls per message, tool round-trips included | 8 | code |
| Messages per conversation | 30 | code |
| Message length | 2,000 characters | code |

Counts are kept in memory, which fits a single instance. The collection travels with each message; conversations are kept in memory for an hour and nowhere else.

## Not covered by a test yet

The scenarios above are tested with a scripted model, which proves the wiring: tools run, results reach the model, limits hold. Whether a real model follows the instruction is a question for an eval run against one, which needs a model key.

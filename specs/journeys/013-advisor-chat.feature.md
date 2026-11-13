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

  Scenario: A question that gets no answer is not counted
    Given the model fails, or my conversation is at its length limit
    When I ask a question
    Then the message does not count against the day's messages
    But the tokens a failed turn used before it failed still count against the day's spend
    And my conversation is left exactly as it was, so asking again is not asking twice

  Scenario: A question that asks for too much at once
    When my question would take more tool runs than one message allows
    Then the tools past the limit answer that it is too many
    And the advisor answers from what it has and asks me to narrow it down

  Scenario: A conversation that has grown long
    Given the history sent to the model has grown past the context limit
    When I ask another question
    Then I am asked to start a new conversation

  Scenario: A card name that matches nothing
    When I ask about a card that does not exist or is misspelt
    Then the advisor says so, and offers only the nearest real names the lookup returned

  Scenario: Answers are formatted, never rendered as markup
    When the advisor answers with bold names and a list
    Then I see bold text and a list, and nothing in the answer becomes HTML or a link

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
| `find_combos` | Combos the collection holds in a format and the cards that would finish the most (Commander Spellbook) |

The instruction forbids stating card text, legality, ownership, costs or meta numbers from memory, and forbids proposing a replacement no tool returned.

## What bounds the cost

| Limit | Default | Setting |
|-------|---------|---------|
| Model spend per UTC day, all visitors | $0.30 | `ADVISOR_AGENT_DAILY_USD`, priced by `ADVISOR_AGENT_PRICE_IN` / `ADVISOR_AGENT_PRICE_OUT` |
| Chat messages per UTC day, all visitors | 100 | `ADVISOR_AGENT_DAILY_LIMIT` |
| Chat messages per minute, all visitors | 10 | `ADVISOR_AGENT_PER_MINUTE` |
| Answers under way at once, all visitors | 2 | code |
| Model calls per message, tool round-trips included | 8 | code |
| Output per model call, thinking included | 4,096 tokens | code (`ADVISOR_AGENT_MAX_OUTPUT_TOKENS`) |
| Prompt tokens per message, over all its model calls | 100,000, checked after each call | code |
| Tool runs per message | 6 | code |
| Conversation history | 40,000 tokens, then a new conversation | code |
| Messages per conversation | 30 | code |
| Message length | 2,000 characters | code |

Messages differ in cost by an order of magnitude, so the dollar ceiling is the one sized to the bill: every turn's tokens are priced and added to the day, including the tokens of a turn that failed part-way. A turn is checked when it starts and priced when it ends, so the turns under way when the ceiling is crossed are still answered: a day can end two turns over. $0.30 a day comes to about $9.30 a month, plus whatever the turns under way cost on the days the ceiling is reached. That can be far more than an average turn, because every tool result is sent again with each later model call of the turn. A turn stops once its calls have sent 100,000 prompt tokens between them. The check comes after each call, so a turn can end one call over: that call carries the history (40,000 tokens at most when the turn starts) and the turn's tool results, and the largest result measured, a deck check of a 60-line list, is about 9,000 tokens; six of them and the history are roughly another 100,000. So a turn's prompt comes to about 200,000 tokens at worst, 30 cents at the configured price. That last figure rests on a measured result size, not on a limit in the code. Each of the eight calls may also write up to 4,096 tokens, thinking included (`ADVISOR_AGENT_MAX_OUTPUT_TOKENS`), another 25 cents at most. Two such turns are about $1.10 over a 30-cent ceiling. The deployment's spend cap, not this, is the hard stop. The default prices are gemini-3.8-flash's list prices from 2027-01-01, twice what it costs until then, so the ceiling errs towards stopping early.

An answer costs a little over half a cent on the default model (measured: about 7,400 prompt and 240 output tokens on average), so the default ceiling is roughly 25 answers a day by the server's own conservative pricing, and about twice that at 2026 prices.

Counts are kept in memory, which fits a single instance and is lost on a restart: the deployment's spend caps, not this, are the last line of defence. The collection travels with each message; conversations are kept in memory for an hour and nowhere else.

## Evaluated against a real model

The scenarios above are tested with a scripted model, which proves the wiring: tools run, results reach the model, limits hold. Whether a real model follows the instruction is checked by `pnpm eval:agent`: 16 questions, each answer checked against the tool results of its conversation for tool choice, cards and percentages no tool returned, and the wording the instruction promises. Results and what they changed are in [docs/evals/advisor-agent.md](../../docs/evals/advisor-agent.md). It needs a model key and is not part of CI.

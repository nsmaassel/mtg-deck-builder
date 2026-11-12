# Advisor agent evals

The advisor agent is tested two ways. Unit tests drive it with a scripted model and prove the wiring: tools run, results reach the model, limits hold. They say nothing about whether a real model follows the instruction. That is what this eval is for.

```bash
GEMINI_API_KEY=... pnpm eval:agent                       # every case, model and thinking level from the environment
pnpm eval:agent -- --only ladder-honesty,unknown-card    # some cases
pnpm eval:agent -- --model gemini-3.5-flash-lite --price-in 0.30 --price-out 2.50
```

It needs the generated data (`pnpm data`) and costs about 10 cents a run on the default model. It is not part of CI.

## What is checked

The rule under test is "code decides, the model explains": every card, number and rules fact in an answer has to come from a tool result. Each of the 16 cases (`libs/advisor-agent/src/lib/evals/cases.ts`) asks a question through the same `AdvisorChat` the server uses and checks the answer against the tool results of its conversation. No second model grades anything.

| Check | How |
|-------|-----|
| Tool choice | The expected tool ran: the meta list for "which deck am I closest to", the stand-in search or a deck check for "what replaces X", the decklist check for a pasted list, none at all for an off-topic request. |
| Cards are grounded | Every card the answer names appears in a tool result of the conversation or in the player's own messages. Card names are found with the card index, so no list of names is hand-kept. |
| Numbers are grounded | Every percentage in the answer matches a number a tool returned, allowing for rounding. |
| Honesty about the data | Meta answers say "tournament"; a question about the ladder gets both words; with no collection loaded the answer says to load one; a format with no meta gets "paste a list". |
| Scope and safety | An off-topic request is declined in under 300 characters; a pasted list that asks for the system prompt does not get it. |

Finding card names in prose has one hard case: `Opt`, `Shock` and `Arena` are cards. A one-word name counts as a mention only in bold on its own or capitalised mid-sentence, and a short list of game terms that are also card names (`Arena`, `Brawl`, `Exile`, ...) counts only in bold. Evidence is read more generously than answers, so the check errs towards missing an invented one-word card, not towards false alarms.

## Results, 2026-11-12

`gemini-3.8-flash`, thinking level low, is what the server now defaults to.

| Model | Thinking | Cases passed | Median answer | Tokens per answer (prompt / output) | Cost per answer |
|-------|----------|--------------|---------------|--------------------------------------|-----------------|
| gemini-3.8-flash | low | 16 of 16, three runs in a row | 5.5 s | 7,400 / 240 | $0.006 |
| gemini-3.8-flash | model default | 13 of 14 | 11.6 s | 7,500 / 970 | $0.009 |
| gemini-3.5-flash-lite | none | 12 of 14 | 1.8 s | 4,600 / 120 | $0.002 |
| gemini-3.1-flash-lite | none | 11 of 14 | 2.1 s | 4,200 / 190 | $0.001 |

The rows with 14 cases were run before the `short-deck` and `combos-owned` cases existed, and the default-thinking row before two instruction changes, so read them as a comparison of models, not as exact scores. One earlier run of the first row lost a case to a limit in the chat, not to the model: a question that needed six deck checks ran out of model calls before it could answer. The limit is now two calls above the tool limit, and a test holds it there. Prices are Google's list prices on the day; gemini-3.8-flash doubles on 2027-01-01, to about one cent an answer.

What the runs showed:

- **Thinking buys nothing here.** At the model's default level two thirds of the output tokens were thinking and answers took twice as long. The tools do the reasoning that matters, so low loses nothing.
- **The cheaper models fail on exactly the rule that matters.** Asked for the best ladder deck, gemini-3.1-flash-lite ran no tool and wrote eight meta shares and win rates from memory. gemini-3.5-flash-lite skipped the meta lookup on the same question and dropped the match grades from a follow-up. They are four times cheaper and not usable for this.
- **The eval changed the product.** Failures led to: the tournament wording made explicit in the instruction; rule problems (deck size, copy limits, legality) computed by the deck check instead of recited by the model; the nearest real card names returned when a lookup misses, after the model offered a card of its own for a misspelt one; and the "same as original" figure renamed after the model read it as deck strength.

## What it does not show

- Sixteen questions are a sample. A pass says the model followed the instruction on these, on that day.
- Grounding is checked for cards and percentages. Plain counts ("13 rare wildcards short") and claims in prose ("the premier removal spell") are not.
- Nothing here measures whether the advice is good Magic. The stand-ins come from the engine, whose own tests and scoring table are in J-010.
- Models change under a fixed name. Re-run before trusting an old table.

# MTG Deck Builder — Decision Trees & Quality Rubric

## 1. Build Request Flow

```mermaid
flowchart TD
    A([User: collection + commander + mode]) --> B[Parse Arena collection]
    B --> C{Non-basic cards > 0?}
    C -- No --> ERR1[400: Invalid collection format]
    C -- Yes --> D[Scryfall: validate commander]
    D --> E{Commander found?}
    E -- No --> ERR2[404: Commander not found]
    E -- Yes --> F{Legal in Commander format?}
    F -- No --> ERR3[422: Not legal]
    F -- Yes --> G[EDHRec: fetch recommendations]
    G --> H{EDHRec page exists?}
    H -- No --> ERR4[404: Not found on EDHRec]
    H -- Yes --> I[~245 cards in 13 sections\nmanaartifacts · instants · creatures\nsorceries · enchantments · lands · etc]
    I --> J[Scryfall: look up owned cards\nfor CMC + price + color identity]
    J --> K{mode = budget?}
    K -- Yes --> L[Scryfall: look up top 80\nunowned recs for price data]
    K -- No --> M
    L --> M[buildDeck]
    M --> N[Score + filter EDHRec cards\nby mode]
    N --> O[Fill 7 slots in priority order]
    O --> P[fillUnderfilled: overflow → gaps]
    P --> Q[Fill remaining lands with basics]
    Q --> R[analyzeDeck + buildGapReport]
    R --> S([100-card deck + analysis + gap report])
```

## 2. Scoring & Mode Decision Logic

```mermaid
flowchart TD
    A([EDHRec card]) --> B[score = inclusion×0.5 + synergy×0.3 + cmcFactor×0.2]
    B --> C{Player owns card?}
    C -- Yes + mode ≠ owned-only --> D[score += 0.15 owned boost]
    C -- No or owned-only --> E[no boost]
    D --> F{mode?}
    E --> F
    F -- owned-only --> G{in collection?}
    G -- No --> SKIP([filtered out])
    G -- Yes --> PLACE
    F -- budget --> H{owned?}
    H -- Yes --> PLACE
    H -- No --> I{price ≤ ceiling?}
    I -- Yes --> PLACE
    I -- No or unknown --> SKIP
    F -- prefer-owned --> PLACE
    PLACE([card enters scored pool])
    PLACE --> J{color identity\nlegal for commander?}
    J -- No --> SKIP
    J -- Yes --> K([sorted by score desc\ninto slot queue])
```

## 3. Slot Fill Algorithm

```mermaid
flowchart TD
    A([scored + filtered card pool]) --> B[Fill slots in score order]
    B --> C{slot at target?}
    C -- Yes --> SKIP([skip card])
    C -- No --> D[Place card → mark used]
    D --> E{All slots at target?}
    E -- No --> F[fillUnderfilled:\nfor each underfilled slot,\ndraw from ANY unused card]
    F --> G{lands still short?}
    G -- Yes --> H[Add basics round-robin\nby commander color identity]
    G -- No --> I
    E -- Yes --> I([done: 99 non-commander slots])

    style F fill:#f9a,stroke:#c00
    style H fill:#adf,stroke:#06c
```

**Slot targets (spec-defined):**

| Slot | Target | Min | Max |
|------|--------|-----|-----|
| ramp | 10 | 8 | 14 |
| draw | 10 | 8 | 14 |
| interaction | 10 | 7 | 14 |
| winConditions | 5 | 3 | 8 |
| synergy | 25 | 18 | 30 |
| lands | 36 | 33 | 40 |
| flex | 3 | 0 | 5 |

## 4. Quality Rubric (community thresholds)

```mermaid
flowchart LR
    A([Built deck]) --> B{Total = 100?}
    B -- No --> FLAG1[🚩 Incomplete deck]
    B -- Yes --> C{Avg CMC 2.2–4.0?}
    C -- No --> FLAG2[🚩 Curve off\ntarget ~3.0]
    C -- Yes --> D{Staples coverage ≥ 40%?}
    D -- No --> FLAG3[🚩 Low staple coverage\nmay be off-meta]
    D -- Yes --> E{All slots ≥ min?}
    E -- No --> FLAG4[🚩 Underfilled slot\nEDHRec data sparse?]
    E -- Yes --> PASS([✅ Passes quality check])

    FLAG1 & FLAG2 & FLAG3 & FLAG4 --> SCORE[Deduct points\nproportionally]
    PASS --> SCORE
    SCORE --> FINAL([Score 0–100])
```

---

## 5. Eval Results (2026-03-14, prefer-owned mode, small collection)

| Commander | Score | CMC | Staples% | Notes |
|-----------|-------|-----|----------|-------|
| Krenko, Mob Boss | 85 | 0.11 ⚠ | 78% | Slots perfect |
| Atraxa, Praetors' Voice | 85 | 0.23 ⚠ | 66% | Slots perfect |
| The Ur-Dragon | 85 | 0.31 ⚠ | 68% | Slots perfect |
| Muldrotha, the Gravetide | 85 | 0.25 ⚠ | 64% | Slots perfect |
| Edgar Markov | 85 | 0.16 ⚠ | 70% | Slots perfect |
| Heroes in a Half Shell | 85 | 0.22 ⚠ | 80% | New set, slots perfect |
| Sol'Kanar the Swamp King | ERROR | — | — | EDHRec 403 (old card) |
| Rhys the Redeemed | ERROR | — | — | Scryfall rate limit in batch |

**All passing commanders scored 85/100. Uniform flag: avg CMC too low.**

---

## 6. Known Issues (from eval)

### 🔴 CMC always near-zero
**Root cause:** EDHRec's cardview JSON does not include `cmc`. Non-owned cards
(~90% of a build with a small collection) get `cmc: 0` by default. The 36
basic lands also have CMC 0, dragging the average down to 0.1–0.3.

**Impact:** `averageCmc` metric is unreliable. Scoring's `cmcFactor` is also
skewed — low-CMC cards get no penalty, medium-CMC cards get unfair penalty.

**Fix options (ranked):**
1. Exclude CMC-0 cards from average EXCEPT true 0-drops (check `type_line`
   for "Land" to exclude basics, treat others as unknowns)
2. Fetch Scryfall CMC for top-N non-owned cards asynchronously and cache
3. Accept inaccuracy; surface it as "CMC data unavailable for unowned cards"

### 🟡 EDHRec 403 on some old commanders
**Root cause:** EDHRec blocks some requests without a proper browser-like
User-Agent, or the commander slug doesn't match their URL structure.
Sol'Kanar predates EDHREC's modern data.

**Fix:** Add retry with browser User-Agent; fall back to theme-based
recommendations if commander page 404s/403s.

### 🟡 Scryfall rate limit under batch load
**Root cause:** Eval runs 8 commanders sequentially, each triggering 8+
Scryfall lookups. The 100ms rate limit between calls compounds.

**Fix:** Shared rate limiter + persistent CMC cache keyed by card name.
After first lookup, CMC never needs to be fetched again for that card.

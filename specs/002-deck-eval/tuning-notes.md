# Tuning Notes & Improvement Backlog

## How to use this file
Run `pnpm serve:api` then `npx tsx --tsconfig tsconfig.json scripts/eval-decks.ts`
to get fresh eval output. Paste findings here, add rules, track what improved.

---

## Round 1 findings (2026-03-14)

### Pattern: CMC metric is always wrong
Every commander scores 0.1–0.3 avg CMC because ~90% of placed cards are
non-owned EDHRec recommendations with no Scryfall data → default CMC 0.

**Proposed rule R-001:** Exclude CMC-0 non-land cards from average CMC calculation.
Use `type_line.includes('Land')` to identify lands (always legitimately 0).
All other 0-CMC cards are "unknown" — skip them from the average.
This gives an accurate curve from the ~10% of cards that do have CMC data,
until a CMC cache is built.

**Proposed rule R-002:** Add a persistent card CMC/price cache (Map in memory,
seeded from every Scryfall lookup). After first build, subsequent builds for
similar commanders reuse cached CMC data. Zero cold-start overhead.

### Pattern: Slots always fill perfectly to target (10/10/10/5/25/36)
This is actually correct behavior when EDHRec has enough data (~245 cards).
Only a risk with very new or obscure commanders.

**Monitoring:** If `slots.ramp < 8` or `slots.draw < 8`, that's a signal
EDHRec data is sparse. Consider a fallback to theme-based recommendations.

### Pattern: Staples coverage 64–80% (passes 40% threshold)
Healthy range. Heroes in a Half Shell scored 80% despite being 8 days old —
EDHRec already has 1,714 decks tracked.

**Watch:** If staples coverage drops below 50% consistently for a commander,
it may be very niche or the slot mapping is wrong.

### Pattern: Uniform 85/100 score for all passing commanders
The algorithm is "correct but untuned" — it always hits exact slot targets
and good staple coverage, but CMC flag knocks 15 points off everything.
Once R-001 is applied, baseline score should rise to ~95-100.

---

## Backlog (priority order)

| ID | Priority | Description | Expected Score Impact |
|----|----------|-------------|----------------------|
| R-001 | 🔴 High | Fix avg CMC: exclude 0-CMC non-lands from average | +15 pts on every build |
| R-002 | 🟡 Med | Add in-memory CMC cache across builds | Fixes rate limit errors in batch |
| R-003 | 🟡 Med | Handle EDHRec 403/old commanders with fallback | Unblocks Sol'Kanar class |
| R-004 | 🟡 Med | Add eval `--commander` flag for targeted testing | Dev workflow improvement |
| R-005 | 🟢 Low | Eval: add owned-only + budget mode columns to table | Better mode comparison |
| R-006 | 🟢 Low | Fetch Scryfall CMC for top-30 non-owned recs per build | Better CMC accuracy |
| R-007 | 🟢 Low | Slot mapping: `gamechangers` → `winConditions` | Win-con slot may undercount |
| R-008 | 🟢 Low | Add power-tier estimate (1–10) based on staples+curve | User-facing feature |

---

## Rules registry (builder heuristics)

These are codified patterns that improve deck quality. Add here when a rule
is implemented so we can track what the algorithm knows.

| Rule | Status | Where | Description |
|------|--------|-------|-------------|
| Basic land exemption | ✅ Implemented | builder.ts `fillUnderfilled` | Basics bypass singleton rule |
| Owned card boost | ✅ Implemented | scoring.ts `scoreCard` | +0.15 to score if owned |
| Color identity filter | ✅ Implemented | builder.ts filter | Off-color cards excluded |
| EDHRec tag → slot mapping | ✅ Implemented | edhrec/client.ts `TAG_TO_LABEL` | 13 tags → 4 slot labels |
| CMC clamp (synergy) | ✅ Implemented | scoring.ts | `synergy` already 0–1, clamp not shift |
| Prefer-owned / owned-only / budget modes | ✅ Implemented | builder.ts, decks.ts | Three build modes |
| CMC unknown exclusion | 🔲 Proposed R-001 | builder.ts `analyzeDeck` | Skip 0-CMC non-lands from avg |
| CMC cache | 🔲 Proposed R-002 | scryfall/client.ts | Reuse CMC across builds |
| `gamechangers` → winConditions | 🔲 Proposed R-007 | edhrec/client.ts | Re-map high-impact tag |

---

## How to run a targeted test

```bash
# Test one commander
curl -s -X POST http://localhost:3000/api/decks/build-from-commander \
  -H 'Content-Type: application/json' \
  -d '{"collectionText":"1 Sol Ring\n1 Command Tower","commanderName":"Krenko, Mob Boss"}' \
  | jq '{total: .deck.totalCards, cmc: .analysis.averageCmc, staples: .analysis.staplesCoveragePercent, slots: (.deck.slots | map_values(length))}'

# Run full eval
pnpm serve:api &
npx tsx --tsconfig tsconfig.json scripts/eval-decks.ts

# JSON output for diffing
npx tsx --tsconfig tsconfig.json scripts/eval-decks.ts --json > specs/002-deck-eval/latest-run.json
```

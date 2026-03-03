# Learning Log: [FEATURE NAME]

**Spec**: `[###-feature-name]`
**Started**: [DATE]
**Status**: [In Progress / Complete]

---

## How to Use This Log

**Agents**: Append a new entry at the END of this log after each session. Include:

- Date and session focus
- Any discoveries, decisions, gotchas, or patterns found
- Any blockers or risks identified
- What was learned that future sessions (or the retrospective) needs to know

**At Retrospective Time**: This log becomes the source material for filling out `retrospective.md`.

---

## Entry Format

```markdown
### [DATE] - Session: [Brief Focus Area]

**Phase/Task**: [Current phase or task being worked on]
**Duration**: [Approximate session length]

#### Discoveries 🔍

- [Things learned about the codebase, APIs, or requirements]

#### Decisions Made 🎯

- [What]: [Decision made]
- [Why]: [Rationale]
- [Alternatives considered]: [What else was evaluated]

#### Gotchas Found ⚠️

- [Issue encountered and how it was resolved]

#### Patterns Identified 🔄

- [Reusable approaches that worked well]

#### Blockers/Risks 🚧

- [Anything blocking progress or potential future issues]

#### Constitution Observations 📜

- [Did we follow/violate any principles? Gaps identified?]

#### Test Coverage Notes 🧪

- [Tests written, tests needed, test infrastructure issues]

#### Handoff Notes 📋

- [What the next session needs to know to continue]
```

---

## Session Log

<!--
  =============================================================================
  APPEND NEW ENTRIES BELOW THIS LINE
  Each session should add a new entry following the format above
  Entries are in CHRONOLOGICAL ORDER (oldest first, newest last)
  =============================================================================
-->

### [FIRST SESSION DATE] - Session: [Initial Setup / Planning]

**Phase/Task**: Phase 1 - Setup
**Duration**: [X hours]

#### Discoveries 🔍

- [Initial discoveries about the feature scope]

#### Decisions Made 🎯

- [What]: [First key decision]
- [Why]: [Rationale]

#### Gotchas Found ⚠️

- [None yet / Initial gotcha]

#### Patterns Identified 🔄

- [None yet / Initial pattern]

#### Blockers/Risks 🚧

- [None / Initial risks identified]

#### Constitution Observations 📜

- [Starting with clean slate / Initial compliance notes]

#### Test Coverage Notes 🧪

- [Test plan / Initial test setup]

#### Handoff Notes 📋

- [What the next session needs to start with]

---

<!--
  ADD NEW SESSIONS ABOVE THIS COMMENT
  Each session creates a new section with the same structure
-->

## Quick Reference: What to Log

### Always Log:

- 🔍 API shape surprises (field names, nesting, nullability)
- 🎯 Architectural decisions and their rationale
- ⚠️ Silent failures discovered
- 🔄 Patterns that saved time
- 🚧 Deferred work and why
- 📜 Constitution violations (even temporary ones)
- 🧪 Test gaps discovered

### Don't Log:

- Routine coding (commits capture this)
- Obvious decisions (no rationale needed)
- Temporary debugging steps

## Aggregation Helpers

### For Retrospective: Bugs Summary

When creating retrospective, search this log for:

- `⚠️ Gotchas Found` sections
- `🚧 Blockers/Risks` that became bugs
- `📜 Constitution Observations` violations

### For Memory Files: Decisions Summary

When updating `.memory.md` files, extract from:

- `🎯 Decisions Made` sections
- `🔄 Patterns Identified` sections
- `⚠️ Gotchas Found` that are reusable knowledge

### For Constitution: Amendment Proposals

When proposing constitution changes, reference:

- `📜 Constitution Observations` gaps
- `⚠️ Gotchas Found` that reveal missing principles
- Patterns that should become principles

---

**Log maintained by**: [Agent/Human]
**Total sessions**: [N]
**Last updated**: [DATE]

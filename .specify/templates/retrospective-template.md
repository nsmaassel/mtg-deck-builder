# Retrospective: [FEATURE NAME]

**Spec**: `[###-feature-name]`  
**Completed**: [DATE]  
**Duration**: [X days/sessions]  
**Total Sessions Logged**: [N entries in learning-log.md]  
**Final Status**: [Complete/Partial/Abandoned]

---

## Input: Learning Log Summary

**Source**: `specs/[###-feature-name]/learning-log.md`

| Session Date | Focus        | Key Discovery/Decision | Category    |
| ------------ | ------------ | ---------------------- | ----------- |
| [DATE]       | [Phase/Task] | [Most important item]  | 🎯/⚠️/🔄/📜 |

_Populate this table by scanning each session entry in the learning log_

---

## Executive Summary

[2-3 sentence summary: What was built, major successes, major challenges]

---

## What Went Well ✅

### Process Wins

- [What parts of the SpecKit flow worked smoothly?]
- [What saved time or prevented bugs?]

### Technical Wins

- [What technical decisions paid off?]
- [What patterns/approaches should we repeat?]

### Quality Wins

- [What tests caught real bugs?]
- [What quality gates prevented issues?]

---

## What Didn't Go Well ❌

### Bugs Found Post-Implementation

| Bug               | Root Cause        | Should Have Been Caught By         | Lesson                   |
| ----------------- | ----------------- | ---------------------------------- | ------------------------ |
| [Bug description] | [Why it happened] | [Test type/check that was missing] | [What to do differently] |

### Process Friction

- [What parts of SpecKit were cumbersome or skipped?]
- [What took longer than expected?]

### Technical Debt Incurred

- [What shortcuts were taken?]
- [What needs cleanup later?]

---

## Test Coverage Analysis

### Acceptance Scenarios → Tests Mapping

| Acceptance Scenario (from spec.md) | Test Created? | Test Passed? | Notes       |
| ---------------------------------- | ------------- | ------------ | ----------- |
| US1: Given X, When Y, Then Z       | ✅/❌         | ✅/❌        | [Any gaps?] |

### Test Categories Used

- [ ] Unit tests
- [ ] Integration tests (data transformation)
- [ ] Contract tests (API shape validation)
- [ ] Visual regression tests
- [ ] E2E tests

### Test Infrastructure Issues

- [Any test failures due to infrastructure, not bugs?]
- [Were these fixed or deferred?]

---

## Constitution Compliance Review

### Principle Adherence

| Principle                        | Compliant? | Notes      |
| -------------------------------- | ---------- | ---------- |
| I. Library-First                 | ✅/⚠️/❌   | [Evidence] |
| II. Test-First                   | ✅/⚠️/❌   | [Evidence] |
| III. Data Transformation Testing | ✅/⚠️/❌   | [Evidence] |
| IV. Observability                | ✅/⚠️/❌   | [Evidence] |
| V. Simplicity                    | ✅/⚠️/❌   | [Evidence] |
| VI. Quality Gates                | ✅/⚠️/❌   | [Evidence] |

### Constitution Gaps Identified

- [Did any bugs reveal missing principles?]
- [Should any principles be added or clarified?]

---

## Knowledge Transfer

### Key Decisions Made (Document in Memory Files)

| Decision           | Context          | Rationale         | Memory File                      |
| ------------------ | ---------------- | ----------------- | -------------------------------- |
| [What was decided] | [Why it came up] | [Why this choice] | `docs/memory/[domain].memory.md` |

### Patterns Discovered

```markdown
### [Pattern Name]

**Problem:** [What this solves]
**Solution:** [How to implement]
**Example:** [Code reference]
**When to use:** [Appropriate scenarios]
```

### Gotchas to Remember

```markdown
### [Gotcha Title]

**Symptom:** [How it manifests]
**Root Cause:** [Why it happens]  
**Solution:** [How to fix/avoid]
**Related:** [Links to issues, PRs, code]
```

---

## Action Items

### Generated from Learning Log (TRACE EACH TO SOURCE)

**Memory File Updates** (from 🎯 Decisions + 🔄 Patterns):
| Decision/Pattern | Source Session | Target Memory File | Status |
|-----------------|----------------|--------------------|---------|
| [Description] | [Date] | `docs/memory/[domain].memory.md` | ⬜/✅ |

**Constitution Amendments** (from 📜 Observations):
| Gap Identified | Source Session | Proposed Amendment | Issue # |
|----------------|----------------|--------------------|---------|
| [Description] | [Date] | [Change to make] | #XXX |

**Technical Debt / Deferred Work** (from 🚧 Blockers):
| Item | Source Session | Priority | Issue # |
|------|----------------|----------|---------|
| [Description] | [Date] | P1/P2/P3 | #XXX |

**Bugs to Prevent** (from ⚠️ Gotchas → Tests Needed):
| Bug Pattern | Source Session | Test to Add | Status |
|-------------|----------------|-------------|---------|
| [Description] | [Date] | [Test type + location] | ⬜/✅ |

### Immediate (Before Closing Spec)

- [ ] All Memory File Updates completed (table above)
- [ ] All Constitution Amendment issues created
- [ ] All Technical Debt issues created with proper labels
- [ ] All preventive tests written or issues created

### Verification Checklist

- [ ] Every 🎯 Decision from learning log → documented in memory file
- [ ] Every 🔄 Pattern from learning log → documented in memory file
- [ ] Every ⚠️ Gotcha from learning log → has preventive test OR is documented
- [ ] Every 📜 Constitution gap → has amendment issue OR documented exception
- [ ] Every 🚧 Blocker deferred → has GitHub issue with priority

---

## Metrics

| Metric                  | Target | Actual | Notes       |
| ----------------------- | ------ | ------ | ----------- |
| Tasks completed         | [X]    | [Y]    | [%]         |
| Test coverage           | [X%]   | [Y%]   | [By type]   |
| Bugs found post-merge   | 0      | [N]    | [List them] |
| Constitution violations | 0      | [N]    | [List them] |
| Build time impact       | <5%    | [X%]   |             |
| Bundle size impact      | <5%    | [X%]   |             |

---

## Session Handoff Notes

_Use this section if implementation spans multiple sessions_

### Last Session Summary

- **Date**: [DATE]
- **What was accomplished**: [Summary]
- **What's next**: [Immediate next steps]
- **Blockers**: [Any blocking issues]

### Context for Next Session

- [Key context that shouldn't be lost]
- [Files that were being worked on]
- [Decisions that were in progress]

---

## Final Checklist

Before closing this spec:

- [ ] All acceptance scenarios have passing tests
- [ ] No test infrastructure failures deferred
- [ ] Learnings documented in `.memory.md` files
- [ ] Constitution updated if gaps found
- [ ] Templates updated if process improvements identified
- [ ] GitHub issues created for future work
- [ ] Branch merged or cleanup documented

---

**Retrospective completed by**: [Agent/Human]  
**Reviewed by**: [If applicable]  
**Date**: [DATE]

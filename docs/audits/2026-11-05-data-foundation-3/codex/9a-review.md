OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b075-7a1d-7a42-8af2-00562c3551fc
--------
user
commit 0bf3b19
exec
/bin/zsh -lc 'git status --short; git show --stat --oneline 0bf3b19; cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; cat /Users/osborn/.agents/skills/using-agent-skills/SKILL.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-2GQeM5LP' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-jAUQy9NN' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/9a-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-cEzm5V8E' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-4eP9tAGm' (errno=Operation not permitted)
0bf3b19 feat(facts): FactsDb plan-3 extension in all three implementations (lineage, acceptance, adoption, restore, cursor, topology) (F3-4)
 src/app/api/facts/[ticker]/metrics/route.test.ts |   2 +-
 src/app/api/facts/[ticker]/route.test.ts         |   2 +-
 src/app/api/filings/[ticker]/route.test.ts       |   2 +-
 src/lib/dq/reconcile/types.ts                    |  27 +-
 src/lib/facts/db-contract.ts                     |   6 +-
 src/lib/facts/db.test.ts                         | 114 +++++-
 src/lib/facts/db.ts                              |  96 ++++-
 src/lib/facts/deps.test.ts                       |   2 +-
 src/lib/facts/derive.ts                          |   8 +-
 src/lib/facts/memory-facts-db.ts                 | 437 +++++++++++++++++++++--
 src/lib/facts/pg-facts-db.ts                     |  31 +-
 src/lib/facts/types.ts                           |  53 ++-
 12 files changed, 716 insertions(+), 64 deletions(-)
---
name: code-review-and-quality
description: Conducts multi-axis code review. Use before merging any change. Use when reviewing code written by yourself, another agent, or a human. Use when you need to assess code quality across multiple dimensions before it enters the main branch.
---

# Code Review and Quality

## Overview

Multi-dimensional code review with quality gates. Every change gets reviewed before merge — no exceptions. Review covers five axes: correctness, readability, architecture, security, and performance.

**The approval standard:** Approve a change when it definitely improves overall code health, even if it isn't perfect. Perfect code doesn't exist — the goal is continuous improvement. Don't block a change because it isn't exactly how you would have written it. If it improves the codebase and follows the project's conventions, approve it.

## When to Use

- Before merging any PR or change
- After completing a feature implementation
- When another agent or model produced code you need to evaluate
- When refactoring existing code
- After any bug fix (review both the fix and the regression test)

## The Five-Axis Review

Every review evaluates code across these dimensions:

### 1. Correctness

Does the code do what it claims to do?

- Does it match the spec or task requirements?
- Are edge cases handled (null, empty, boundary values)?
- Are error paths handled (not just the happy path)?
- Does it pass all tests? Are the tests actually testing the right things?
- Are there off-by-one errors, race conditions, or state inconsistencies?

### 2. Readability & Simplicity

Can another engineer (or agent) understand this code without the author explaining it?

- Are names descriptive and consistent with project conventions? (No `temp`, `data`, `result` without context)
- Is the control flow straightforward (avoid nested ternaries, deep callbacks)?
- Is the code organized logically (related code grouped, clear module boundaries)?
- Are there any "clever" tricks that should be simplified?
- **Could this be done in fewer lines?** (1000 lines where 100 suffice is a failure)
- **Are abstractions earning their complexity?** (Don't generalize until the third use case)
- Would comments help clarify non-obvious intent? (But don't comment obvious code.)
- Are there dead code artifacts: no-op variables (`_unused`), backwards-compat shims, or `// removed` comments?

### 3. Architecture

Does the change fit the system's design?

- Does it follow existing patterns or introduce a new one? If new, is it justified?
- Does it maintain clean module boundaries?
- Is there code duplication that should be shared?
- Are dependencies flowing in the right direction (no circular dependencies)?
- Is the abstraction level appropriate (not over-engineered, not too coupled)?

### 4. Security

For detailed security guidance, see `security-and-hardening`. Does the change introduce vulnerabilities?

- Is user input validated and sanitized?
- Are secrets kept out of code, logs, and version control?
- Is authentication/authorization checked where needed?
- Are SQL queries parameterized (no string concatenation)?
- Are outputs encoded to prevent XSS?
- Are dependencies from trusted sources with no known vulnerabilities?
- Is data from external sources (APIs, logs, user content, config files) treated as untrusted?
- Are external data flows validated at system boundaries before use in logic or rendering?

### 5. Performance

For detailed profiling and optimization, see `performance-optimization`. Does the change introduce performance problems?

- Any N+1 query patterns?
- Any unbounded loops or unconstrained data fetching?
- Any synchronous operations that should be async?
- Any unnecessary re-renders in UI components?
- Any missing pagination on list endpoints?
- Any large objects created in hot paths?

## Change Sizing

Small, focused changes are easier to review, faster to merge, and safer to deploy. Target these sizes:

```
~100 lines changed   → Good. Reviewable in one sitting.
~300 lines changed   → Acceptable if it's a single logical change.
~1000 lines changed  → Too large. Split it.
```

**What counts as "one change":** A single self-contained modification that addresses one thing, includes related tests, and keeps the system functional after submission. One part of a feature — not the whole feature.

**Splitting strategies when a change is too large:**

| Strategy | How | When |
|----------|-----|------|
| **Stack** | Submit a small change, start the next one based on it | Sequential dependencies |
| **By file group** | Separate changes for groups needing different reviewers | Cross-cutting concerns |
| **Horizontal** | Create shared code/stubs first, then consumers | Layered architecture |
| **Vertical** | Break into smaller full-stack slices of the feature | Feature work |

**When large changes are acceptable:** Complete file deletions and automated refactoring where the reviewer only needs to verify intent, not every line.

**Separate refactoring from feature work.** A change that refactors existing code and adds new behavior is two changes — submit them separately. Small cleanups (variable renaming) can be included at reviewer discretion.

## Change Descriptions

Every change needs a description that stands alone in version control history.

**First line:** Short, imperative, standalone. "Delete the FizzBuzz RPC" not "Deleting the FizzBuzz RPC." Must be informative enough that someone searching history can understand the change without reading the diff.

**Body:** What is changing and why. Include context, decisions, and reasoning not visible in the code itself. Link to bug numbers, benchmark results, or design docs where relevant. Acknowledge approach shortcomings when they exist.

**Anti-patterns:** "Fix bug," "Fix build," "Add patch," "Moving code from A to B," "Phase 1," "Add convenience functions."

## Review Process

### Step 1: Understand the Context

Before looking at code, understand the intent:

```
- What is this change trying to accomplish?
- What spec or task does it implement?
- What is the expected behavior change?
```

### Step 2: Review the Tests First

Tests reveal intent and coverage:

```
- Do tests exist for the change?
- Do they test behavior (not implementation details)?
- Are edge cases covered?
- Do tests have descriptive names?
- Would the tests catch a regression if the code changed?
```

### Step 3: Review the Implementation

Walk through the code with the five axes in mind:

```
For each file changed:
1. Correctness: Does this code do what the test says it should?
2. Readability: Can I understand this without help?
3. Architecture: Does this fit the system?
4. Security: Any vulnerabilities?
5. Performance: Any bottlenecks?
```

### Step 4: Categorize Findings

Label every comment with its severity so the author knows what's required vs optional:

| Prefix | Meaning | Author Action |
|--------|---------|---------------|
| *(no prefix)* | Required change | Must address before merge |
| **Critical:** | Blocks merge | Security vulnerability, data loss, broken functionality |
| **Nit:** | Minor, optional | Author may ignore — formatting, style preferences |
| **Optional:** / **Consider:** | Suggestion | Worth considering but not required |
| **FYI** | Informational only | No action needed — context for future reference |

This prevents authors from treating all feedback as mandatory and wasting time on optional suggestions.

### Step 5: Verify the Verification

Check the author's verification story:

```
- What tests were run?
- Did the build pass?
- Was the change tested manually?
- Are there screenshots for UI changes?
- Is there a before/after comparison?
```

## Multi-Model Review Pattern

Use different models for different review perspectives:

```
Model A writes the code
    │
    ▼
Model B reviews for correctness and architecture
    │
    ▼
Model A addresses the feedback
    │
    ▼
Human makes the final call
```

This catches issues that a single model might miss — different models have different blind spots.

**Example prompt for a review agent:**
```
Review this code change for correctness, security, and adherence to
our project conventions. The spec says [X]. The change should [Y].
Flag any issues as Critical, Important, or Suggestion.
```

## Dead Code Hygiene

After any refactoring or implementation change, check for orphaned code:

1. Identify code that is now unreachable or unused
2. List it explicitly
3. **Ask before deleting:** "Should I remove these now-unused elements: [list]?"

Don't leave dead code lying around — it confuses future readers and agents. But don't silently delete things you're not sure about. When in doubt, ask.

```
DEAD CODE IDENTIFIED:
- formatLegacyDate() in src/utils/date.ts — replaced by formatDate()
- OldTaskCard component in src/components/ — replaced by TaskCard
- LEGACY_API_URL constant in src/config.ts — no remaining references
→ Safe to remove these?
```

## Review Speed

Slow reviews block entire teams. The cost of context-switching to review is less than the waiting cost imposed on others.

- **Respond within one business day** — this is the maximum, not the target
- **Ideal cadence:** Respond shortly after a review request arrives, unless deep in focused coding. A typical change should complete multiple review rounds in a single day
- **Prioritize fast individual responses** over quick final approval. Quick feedback reduces frustration even if multiple rounds are needed
- **Large changes:** Ask the author to split them rather than reviewing one massive changeset

## Handling Disagreements

When resolving review disputes, apply this hierarchy:

1. **Technical facts and data** override opinions and preferences
2. **Style guides** are the absolute authority on style matters
3. **Software design** must be evaluated on engineering principles, not personal preference
4. **Codebase consistency** is acceptable if it doesn't degrade overall health

**Don't accept "I'll clean it up later."** Experience shows deferred cleanup rarely happens. Require cleanup before submission unless it's a genuine emergency. If surrounding issues can't be addressed in this change, require filing a bug with self-assignment.

## Honesty in Review

When reviewing code — whether written by you, another agent, or a human:

- **Don't rubber-stamp.** "LGTM" without evidence of review helps no one.
- **Don't soften real issues.** "This might be a minor concern" when it's a bug that will hit production is dishonest.
- **Quantify problems when possible.** "This N+1 query will add ~50ms per item in the list" is better than "this could be slow."
- **Push back on approaches with clear problems.** Sycophancy is a failure mode in reviews. If the implementation has issues, say so directly and propose alternatives.
- **Accept override gracefully.** If the author has full context and disagrees, defer to their judgment. Comment on code, not people — reframe personal critiques to focus on the code itself.

## Dependency Discipline

Part of code review is dependency review:

**Before adding any dependency:**
1. Does the existing stack solve this? (Often it does.)
2. How large is the dependency? (Check bundle impact.)
3. Is it actively maintained? (Check last commit, open issues.)
4. Does it have known vulnerabilities? (`npm audit`)
5. What's the license? (Must be compatible with the project.)

**Rule:** Prefer standard library and existing utilities over new dependencies. Every dependency is a liability.

## The Review Checklist

```markdown
## Review: [PR/Change title]

### Context
- [ ] I understand what this change does and why

### Correctness
- [ ] Change matches spec/task requirements
- [ ] Edge cases handled
- [ ] Error paths handled
- [ ] Tests cover the change adequately

### Readability
- [ ] Names are clear and consistent
- [ ] Logic is straightforward
- [ ] No unnecessary complexity

### Architecture
- [ ] Follows existing patterns
- [ ] No unnecessary coupling or dependencies
- [ ] Appropriate abstraction level

### Security
- [ ] No secrets in code
- [ ] Input validated at boundaries
- [ ] No injection vulnerabilities
- [ ] Auth checks in place
- [ ] External data sources treated as untrusted

### Performance
- [ ] No N+1 patterns
- [ ] No unbounded operations
- [ ] Pagination on list endpoints

### Verification
- [ ] Tests pass
- [ ] Build succeeds
- [ ] Manual verification done (if applicable)

### Verdict
- [ ] **Approve** — Ready to merge
- [ ] **Request changes** — Issues must be addressed
```
## See Also

- For detailed security review guidance, see `references/security-checklist.md`
- For performance review checks, see `references/performance-checklist.md`

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "It works, that's good enough" | Working code that's unreadable, insecure, or architecturally wrong creates debt that compounds. |
| "I wrote it, so I know it's correct" | Authors are blind to their own assumptions. Every change benefits from another set of eyes. |
| "We'll clean it up later" | Later never comes. The review is the quality gate — use it. Require cleanup before merge, not after. |
| "AI-generated code is probably fine" | AI code needs more scrutiny, not less. It's confident and plausible, even when wrong. |
| "The tests pass, so it's good" | Tests are necessary but not sufficient. They don't catch architecture problems, security issues, or readability concerns. |

## Red Flags

- PRs merged without any review
- Review that only checks if tests pass (ignoring other axes)
- "LGTM" without evidence of actual review
- Security-sensitive changes without security-focused review
- Large PRs that are "too big to review properly" (split them)
- No regression tests with bug fix PRs
- Review comments without severity labels — makes it unclear what's required vs optional
- Accepting "I'll fix it later" — it never happens

## Verification

After review is complete:

- [ ] All Critical issues are resolved
- [ ] All Important issues are resolved or explicitly deferred with justification
- [ ] Tests pass
- [ ] Build succeeds
- [ ] The verification story is documented (what changed, how it was verified)
---
name: using-agent-skills
description: Discovers and invokes agent skills. Use when starting a session or when you need to discover which skill applies to the current task. This is the meta-skill that governs how all other skills are discovered and invoked.
---

# Using Agent Skills

## Overview

Agent Skills is a collection of engineering workflow skills organized by development phase. Each skill encodes a specific process that senior engineers follow. This meta-skill helps you discover and apply the right skill for your current task.

## Skill Discovery

When a task arrives, identify the development phase and apply the corresponding skill:

```
Task arrives
    │
    ├── Vague idea/need refinement? ──→ idea-refine
    ├── New project/feature/change? ──→ spec-driven-development
    ├── Have a spec, need tasks? ──────→ planning-and-task-breakdown
    ├── Implementing code? ────────────→ incremental-implementation
    │   ├── UI work? ─────────────────→ frontend-ui-engineering
    │   ├── API work? ────────────────→ api-and-interface-design
    │   ├── Need better context? ─────→ context-engineering
    │   └── Need doc-verified code? ───→ source-driven-development
    ├── Writing/running tests? ────────→ test-driven-development
    │   └── Browser-based? ───────────→ browser-testing-with-devtools
    ├── Something broke? ──────────────→ debugging-and-error-recovery
    ├── Reviewing code? ───────────────→ code-review-and-quality
    │   ├── Security concerns? ───────→ security-and-hardening
    │   └── Performance concerns? ────→ performance-optimization
    ├── Committing/branching? ─────────→ git-workflow-and-versioning
    ├── CI/CD pipeline work? ──────────→ ci-cd-and-automation
    ├── Writing docs/ADRs? ───────────→ documentation-and-adrs
    └── Deploying/launching? ─────────→ shipping-and-launch
```

## Core Operating Behaviors

These behaviors apply at all times, across all skills. They are non-negotiable.

### 1. Surface Assumptions

Before implementing anything non-trivial, explicitly state your assumptions:

```
ASSUMPTIONS I'M MAKING:
1. [assumption about requirements]
2. [assumption about architecture]
3. [assumption about scope]
→ Correct me now or I'll proceed with these.
```

Don't silently fill in ambiguous requirements. The most common failure mode is making wrong assumptions and running with them unchecked. Surface uncertainty early — it's cheaper than rework.

### 2. Manage Confusion Actively

When you encounter inconsistencies, conflicting requirements, or unclear specifications:

1. **STOP.** Do not proceed with a guess.
2. Name the specific confusion.
3. Present the tradeoff or ask the clarifying question.
4. Wait for resolution before continuing.

**Bad:** Silently picking one interpretation and hoping it's right.
**Good:** "I see X in the spec but Y in the existing code. Which takes precedence?"

### 3. Push Back When Warranted

You are not a yes-machine. When an approach has clear problems:

- Point out the issue directly
- Explain the concrete downside (quantify when possible — "this adds ~200ms latency" not "this might be slower")
- Propose an alternative
- Accept the human's decision if they override with full information

Sycophancy is a failure mode. "Of course!" followed by implementing a bad idea helps no one. Honest technical disagreement is more valuable than false agreement.

### 4. Enforce Simplicity

Your natural tendency is to overcomplicate. Actively resist it.

Before finishing any implementation, ask:
- Can this be done in fewer lines?
- Are these abstractions earning their complexity?
- Would a staff engineer look at this and say "why didn't you just..."?

If you build 1000 lines and 100 would suffice, you have failed. Prefer the boring, obvious solution. Cleverness is expensive.

### 5. Maintain Scope Discipline

Touch only what you're asked to touch.

Do NOT:
- Remove comments you don't understand
- "Clean up" code orthogonal to the task
- Refactor adjacent systems as a side effect
- Delete code that seems unused without explicit approval
- Add features not in the spec because they "seem useful"

Your job is surgical precision, not unsolicited renovation.

### 6. Verify, Don't Assume

Every skill includes a verification step. A task is not complete until verification passes. "Seems right" is never sufficient — there must be evidence (passing tests, build output, runtime data).

## Failure Modes to Avoid

These are the subtle errors that look like productivity but create problems:

1. Making wrong assumptions without checking
2. Not managing your own confusion — plowing ahead when lost
3. Not surfacing inconsistencies you notice
4. Not presenting tradeoffs on non-obvious decisions
5. Being sycophantic ("Of course!") to approaches with clear problems
6. Overcomplicating code and APIs
7. Modifying code or comments orthogonal to the task
8. Removing things you don't fully understand
9. Building without a spec because "it's obvious"
10. Skipping verification because "it looks right"

## Skill Rules

1. **Check for an applicable skill before starting work.** Skills encode processes that prevent common mistakes.

2. **Skills are workflows, not suggestions.** Follow the steps in order. Don't skip verification steps.

3. **Multiple skills can apply.** A feature implementation might involve `idea-refine` → `spec-driven-development` → `planning-and-task-breakdown` → `incremental-implementation` → `test-driven-development` → `code-review-and-quality` → `shipping-and-launch` in sequence.

4. **When in doubt, start with a spec.** If the task is non-trivial and there's no spec, begin with `spec-driven-development`.

## Lifecycle Sequence

For a complete feature, the typical skill sequence is:

```
1. idea-refine                 → Refine vague ideas
2. spec-driven-development     → Define what we're building
3. planning-and-task-breakdown → Break into verifiable chunks
4. context-engineering         → Load the right context
5. source-driven-development   → Verify against official docs
6. incremental-implementation  → Build slice by slice
7. test-driven-development     → Prove each slice works
8. code-review-and-quality     → Review before merge
9. git-workflow-and-versioning → Clean commit history
10. documentation-and-adrs     → Document decisions
11. shipping-and-launch        → Deploy safely
```

Not every task needs every skill. A bug fix might only need: `debugging-and-error-recovery` → `test-driven-development` → `code-review-and-quality`.

## Quick Reference

| Phase | Skill | One-Line Summary |
|-------|-------|-----------------|
| Define | idea-refine | Refine ideas through structured divergent and convergent thinking |
| Define | spec-driven-development | Requirements and acceptance criteria before code |
| Plan | planning-and-task-breakdown | Decompose into small, verifiable tasks |
| Build | incremental-implementation | Thin vertical slices, test each before expanding |
| Build | source-driven-development | Verify against official docs before implementing |
| Build | context-engineering | Right context at the right time |
| Build | frontend-ui-engineering | Production-quality UI with accessibility |
| Build | api-and-interface-design | Stable interfaces with clear contracts |
| Verify | test-driven-development | Failing test first, then make it pass |
| Verify | browser-testing-with-devtools | Chrome DevTools MCP for runtime verification |
| Verify | debugging-and-error-recovery | Reproduce → localize → fix → guard |
| Review | code-review-and-quality | Five-axis review with quality gates |
| Review | security-and-hardening | OWASP prevention, input validation, least privilege |
| Review | performance-optimization | Measure first, optimize only what matters |
| Ship | git-workflow-and-versioning | Atomic commits, clean history |
| Ship | ci-cd-and-automation | Automated quality gates on every change |
| Ship | documentation-and-adrs | Document the why, not just the what |
| Ship | shipping-and-launch | Pre-launch checklist, monitoring, rollback plan |

exec
/bin/zsh -lc 'find .. -name AGENTS.md -o -name AGENTS.override.md; git show 0bf3b19 -- src/lib/facts/db.ts src/lib/facts/pg-facts-db.ts src/lib/facts/types.ts src/lib/dq/reconcile/types.ts src/lib/facts/derive.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 441ms:
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-yyuoG9zs' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-NGhNK5wM' (errno=Operation not permitted)
commit 0bf3b19e8362ec0ee9141d7f61416553a9c85f2b
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 02:43:53 2026 -0800

    feat(facts): FactsDb plan-3 extension in all three implementations (lineage, acceptance, adoption, restore, cursor, topology) (F3-4)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/dq/reconcile/types.ts b/src/lib/dq/reconcile/types.ts
index 69096f4..c8fc7d4 100644
--- a/src/lib/dq/reconcile/types.ts
+++ b/src/lib/dq/reconcile/types.ts
@@ -1,6 +1,29 @@
 // src/lib/dq/reconcile/types.ts
 // Reconciliation shared types (spec 3 §5; plan 3 contract C3). Task 2 lands only the pair registry
-// ids, which the dataset registry needs; Task 13 adds the rest of C3 to this file and must not change
-// these two exports.
+// ids, which the dataset registry needs; Task 9a adds the C3 subset FactsDb needs; Task 13 adds the rest
+// and must not change these names.
+import type {Market} from '../../facts/types';
 export const RECONCILE_PAIR_IDS=['us.companyfacts_vs_ixbrl','cn.tushare_vs_cninfo_pdf_gold','us.companyfacts_vs_gold','sec.filing_date_vs_submissions','sec.filer_category','entities.isin_hkex_vs_gleif','facts.lineage_same_day'] as const;
 export type ReconcilePairId=typeof RECONCILE_PAIR_IDS[number];
+/** Pairs run by the cycle runner; the other three are recorded inline by their producers (record.ts, cycle_id null). */
+export const CYCLE_PAIR_IDS=['us.companyfacts_vs_ixbrl','cn.tushare_vs_cninfo_pdf_gold','us.companyfacts_vs_gold','facts.lineage_same_day'] as const satisfies readonly ReconcilePairId[];
+export type CyclePairId=typeof CYCLE_PAIR_IDS[number];
+export type ReconcileKind='numeric'|'text'|'date';
+export type ReconcileOutcome='compared'|'left_missing'|'left_unlinked'|'left_ambiguous'|'right_missing'|'unsupported'|'right_ambiguous'|'incomplete_gold';
+export type ReconcileAction='record'|'quarantine_left'|'review_item'|'lineage_item';
+export interface Fence{pair:CyclePairId;cycle_id:string;issuer_id:string;market:Market;batch_id:string;attempt:number}
+/** One per expected key; values are canonical decimal strings (never Number). */
+export interface ReconcileResultInput{
+ natural_key:string;kind:ReconcileKind;outcome:ReconcileOutcome;passed:boolean;
+ left_value:string|null;right_value:string|null;abs_diff:string|null;rel_diff:string|null;tolerance:string;
+ left_source:string;right_source:string;detail:Record<string,unknown>;
+ action:ReconcileAction;left_fact_id?:string;inputs_hash?:string;
+ item?:{natural_key:string;payload:Record<string,unknown>;detail?:Record<string,unknown>};   // for review_item / lineage_item / quarantine_left
+}
+export interface ApplyReconcileOutcome{reused:boolean;reconciliationId:string;itemId:string|null;quarantined:0|1;materialize:{issuerId:string;market:Market}|null}
+export interface MemberCounts{compared_passed:number;compared_failed:number;not_compared:number}
+/** set_merge's registration of a merge target (plan audit Q2): one entry per (target, market, merged source). */
+export interface PendingMember{issuer_id:string;market:Market;source:string}
+/** open_reconcile_cycle input (plan audit Q2): members frozen with their expected keys (the {naturalKey, locator} shape Task 13a names ExpectedKey); pending = exactly the snapshot entries the runner resolved keys for. */
+export interface OpenCycleInput{pair:CyclePairId;cycleId:string;startedAt:string;members:{issuer_id:string;market:Market;expected_keys:{naturalKey:string;locator:Record<string,unknown>}[]}[];pending:PendingMember[]}
+export interface OpenCycleResult{created:boolean;cycle:Record<string,unknown>;transferred:PendingMember[]}
diff --git a/src/lib/facts/db.ts b/src/lib/facts/db.ts
index e54471d..3175224 100644
--- a/src/lib/facts/db.ts
+++ b/src/lib/facts/db.ts
@@ -2,6 +2,7 @@
 // FactsDb (spec §4.8): the only data access the facts layer uses. Writes are SQL functions
 // (rpc) because no role may touch the fact tables directly (§4.7); reads that need no snapshot
 // use .from() under RLS (factsByIds, openConflicts, filingsOfIssuer, scopeDue, metricsOfIssuer,
+// targetOf, lineageOf, findFilingBySourceRef, filingsForCalendar,
 // and the one column-level write updateFilingLink). The functions raise with the code as the
 // message (lease_lost 55P03; run_pending, run_published, mapping_gen_regression,
 // stale_computation P0001); toFactsDbError maps that, 23505 → duplicate_key, the rest → unknown.
@@ -13,7 +14,8 @@
 // page (audit round-1 #7); an explicit `limit` caps the total instead.
 import type {SupabaseClient} from '@supabase/supabase-js';
 import {FactsDbError} from './types';
-import type {ConflictItem,FactRow,FactsDb,FactsDbErrorCode,FilingInsert,FilingRow,Market,MetricRow,ReadFactsOptions,ReadFactsResult,ScopeRow} from './types';
+import type {CalendarFiling,ConflictItem,FactRow,FactsDb,FactsDbErrorCode,FilingFactRow,FilingInsert,FilingRow,LineageConflict,LineageRev,Market,MetricRow,ReadFactsLineageResult,ReadFactsOptions,ReadFactsResult,RunStatus,ScopeRow} from './types';
+import type {ApplyReconcileOutcome,CyclePairId,Fence,MemberCounts,OpenCycleResult} from '../dq/reconcile/types';
 export {FactsDbError} from './types';
 export type {FactsDb} from './types';
 
@@ -27,16 +29,18 @@ export const READ_PAGE=1000;
 export const IN_CHUNK=200;
 /** attempts of a metrics read before it fails as metrics_unstable. */
 export const METRICS_ATTEMPTS=3;
-const MESSAGE_CODES:readonly FactsDbErrorCode[]=['run_pending','run_published','mapping_gen_regression','stale_computation','stale_plan','run_abandoned','invalid_chosen','item_not_open'];
+const MESSAGE_CODES:readonly FactsDbErrorCode[]=['run_pending','run_published','mapping_gen_regression','stale_computation','stale_plan','run_abandoned','invalid_chosen','item_not_open',
+ 'fence_failed','member_incomplete','stale_evaluation','batch_mismatch','invalid_choice','invalid_candidate','generation_moved','duplicate','conflict_exists','replay_required',
+ 'filing_not_found','not_passing','lineage_changed','scope_missing','unresolved','acceptance_conflict','source_not_active','has_referrers','topology_write_forbidden','invalid_result','use_dedicated_resolver','target_not_active','invalid_members'];
 
 export interface PgErrorLike{message?:string;code?:string|null;details?:string|null;hint?:string|null}
-/** PostgreSQL / PostgREST error → FactsDbError (shared by the Supabase and pg adapters). */
+/** PostgreSQL / PostgREST error → FactsDbError (shared by the Supabase and pg adapters). 23505 is checked before the head word: "duplicate key value …" must stay duplicate_key, not the plan-3 code duplicate. */
 export function toFactsDbError(e:PgErrorLike):FactsDbError{
  const message=e.message??'';
  const head=message.split(/[\s:]/,1)[0];
  if(e.code==='55P03'||head==='lease_lost')return new FactsDbError('lease_lost',message||'lease_lost');
- if((MESSAGE_CODES as readonly string[]).includes(head))return new FactsDbError(head as FactsDbErrorCode,message);
  if(e.code==='23505')return new FactsDbError('duplicate_key',message);
+ if((MESSAGE_CODES as readonly string[]).includes(head))return new FactsDbError(head as FactsDbErrorCode,message);
  return new FactsDbError('unknown',message||'unknown');
 }
 
@@ -53,8 +57,19 @@ export const isoTs=(v:unknown):string=>new Date(String(v)).toISOString();
 const isoOrNull=(v:unknown):string|null=>v===null||v===undefined?null:isoTs(v);
 /** A financial_facts table row (PostgREST or pg) → FactRow; value comes from value_text, never from the numeric; created_at is ISO. */
 export function factRowFromTable(r:Record<string,unknown>):FactRow{return {...(r as unknown as FactRow),value:String(r.value_text),created_at:isoTs(r.created_at)};}
-/** A filings table row (PostgREST or pg) → FilingRow; created_at is ISO. */
-export function filingFromTable(r:Record<string,unknown>):FilingRow{return {...(r as unknown as FilingRow),created_at:isoTs(r.created_at)};}
+/** A filings table row (PostgREST or pg) → FilingRow; created_at and accepted_at are ISO. */
+export function filingFromTable(r:Record<string,unknown>):FilingRow{return {...(r as unknown as FilingRow),accepted_at:isoOrNull(r.accepted_at),acceptance_source:(r.acceptance_source??null) as FilingRow['acceptance_source'],created_at:isoTs(r.created_at)};}
+/** filingsForCalendar row: a filings row plus run_status. */
+export function calendarFilingFromRow(r:Record<string,unknown>):CalendarFiling{return {...filingFromTable(r),run_status:r.run_status as RunStatus};}
+/** LineageRev[] in the canonical order (issuer_id ascending; lowercase uuids compare like PostgreSQL's uuid order); state_rev as a number. */
+export function lineageRevsFrom(x:unknown):LineageRev[]{
+ if(!Array.isArray(x))return [];
+ return x.map(e=>({issuer_id:String((e as {issuer_id:unknown}).issuer_id),state_rev:Number((e as {state_rev:unknown}).state_rev)}))
+  .sort((a,b)=>a.issuer_id<b.issuer_id?-1:a.issuer_id>b.issuer_id?1:0);
+}
+export const lineageKey=(v:LineageRev[]):string=>lineageRevsFrom(v).map(r=>`${r.issuer_id}=${r.state_rev}`).join(',');
+/** The complete vector compared (T8): same members, same revs. */
+export const lineageRevsEqual=(a:LineageRev[],b:LineageRev[]):boolean=>lineageKey(a)===lineageKey(b);
 export function scopeFromTable(r:Record<string,unknown>):ScopeRow{
  return {issuer_id:String(r.issuer_id),market:r.market as Market,reasons:Array.isArray(r.reasons)?r.reasons as string[]:[],priority:Number(r.priority),fetch_key:String(r.fetch_key),
   next_due_at:isoTs(r.next_due_at),lease_until:isoOrNull(r.lease_until),lease_batch_id:r.lease_batch_id===null?null:String(r.lease_batch_id),state_rev:Number(r.state_rev),
@@ -62,13 +77,45 @@ export function scopeFromTable(r:Record<string,unknown>):ScopeRow{
 }
 export function metricFromTable(r:Record<string,unknown>):MetricRow{
  return {issuer_id:String(r.issuer_id),market:r.market as Market,metric:String(r.metric),period_start:String(r.period_start),period_end:String(r.period_end),duration:r.duration as MetricRow['duration'],
-  value:String(r.value_text),unit:String(r.unit),input_unit:String(r.input_unit),basis:String(r.basis),formula_version:String(r.formula_version),inputs:(Array.isArray(r.inputs)?r.inputs:[]) as MetricRow['inputs'],based_on_rev:Number(r.based_on_rev),as_of:String(r.as_of)};
+  value:String(r.value_text),unit:String(r.unit),input_unit:String(r.input_unit),basis:String(r.basis),formula_version:String(r.formula_version),inputs:(Array.isArray(r.inputs)?r.inputs:[]) as MetricRow['inputs'],based_on_rev:Number(r.based_on_rev),
+  based_on_lineage:lineageRevsFrom(r.based_on_lineage),as_of:String(r.as_of)};
 }
 /** MetricRow → replace_financial_metrics row (issuer/market come from the call). */
 export function metricArgs(m:MetricRow){return {metric:m.metric,period_start:m.period_start,period_end:m.period_end,duration:m.duration,value:m.value,unit:m.unit,input_unit:m.input_unit,basis:m.basis,formula_version:m.formula_version,inputs:m.inputs,as_of:m.as_of};}
 /** FilingInsert → stage_filings row (issuer/market come from the run). */
 export function filingArgs(rows:FilingInsert[]){return rows.map(r=>({filing_id:r.filing_id,source:r.source,origin:r.origin,form_type:r.formType,fiscal_year:r.fiscalYear,fiscal_period:r.fiscalPeriod,period_end:r.periodEnd,available_date:r.availableDate,source_ref:r.sourceRef,url:r.url}));}
 export function readArgs(issuer:string,market:Market,o:ReadFactsOptions){return {p_issuer:issuer,p_market:market,p_concepts:o.concepts,p_as_of:o.asOf,p_from:o.from??null,p_to:o.to??null,p_history:o.history===true,p_limit:o.limit??null,p_include_non_ok:o.includeNonOk===true};}
+export function readLineageArgs(issuers:string[],market:Market,o:ReadFactsOptions){return {p_issuers:issuers,p_market:market,p_concepts:o.concepts,p_as_of:o.asOf,p_from:o.from??null,p_to:o.to??null,p_history:o.history===true,p_limit:o.limit??null,p_include_non_ok:o.includeNonOk===true};}
+export interface ReadFactsLineageEnvelope{state_revs:unknown;lineage:unknown;rows:Record<string,unknown>[];conflicts:unknown;truncated:boolean;row_count:number}
+export function lineageResultFromEnvelope(env:ReadFactsLineageEnvelope):ReadFactsLineageResult{
+ const conflicts=(Array.isArray(env.conflicts)?env.conflicts:[]) as {key?:unknown;available_date?:unknown;fact_ids?:unknown}[];
+ return {stateRevs:lineageRevsFrom(env.state_revs),lineage:Array.isArray(env.lineage)?env.lineage.map(String):[],rows:(env.rows??[]).map(rowFromEnvelope),
+  conflicts:conflicts.map((c):LineageConflict=>({key:(c.key&&typeof c.key==='object'?c.key:{}) as Record<string,string|null>,available_date:String(c.available_date),fact_ids:Array.isArray(c.fact_ids)?c.fact_ids.map(String):[]})),
+  truncated:env.truncated===true};
+}
+/** read_filing_facts row → FilingFactRow (value from value_text, ISO created_at). */
+export function filingFactFromJson(r:Record<string,unknown>):FilingFactRow{return {...factRowFromTable(r),run_status:r.run_status as RunStatus};}
+export const fenceArgs=(f:Fence)=>({pair:f.pair,cycle_id:f.cycle_id,issuer_id:f.issuer_id,market:f.market,batch_id:f.batch_id,attempt:f.attempt});
+export function fenceFromJson(x:unknown):Fence|null{
+ if(x===null||x===undefined)return null;
+ const f=x as Record<string,unknown>;
+ return {pair:String(f.pair) as CyclePairId,cycle_id:String(f.cycle_id),issuer_id:String(f.issuer_id),market:f.market as Market,batch_id:String(f.batch_id),attempt:Number(f.attempt)};
+}
+export function applyOutcomeFromJson(x:unknown):ApplyReconcileOutcome{
+ const o=(x??{}) as Record<string,unknown>;const m=o.materialize as {issuer_id?:unknown;market?:unknown}|null|undefined;
+ return {reused:o.reused===true,reconciliationId:String(o.reconciliation_id),itemId:o.item_id===null||o.item_id===undefined?null:String(o.item_id),quarantined:Number(o.quarantined)===1?1:0,
+  materialize:m&&typeof m==='object'?{issuerId:String(m.issuer_id),market:m.market as Market}:null};
+}
+export const countsFromJson=(x:unknown):MemberCounts=>{const o=(x??{}) as Record<string,unknown>;return {compared_passed:Number(o.compared_passed),compared_failed:Number(o.compared_failed),not_compared:Number(o.not_compared)};};
+/** open_reconcile_cycle envelope → OpenCycleResult (plan audit Q2); the cycle row is passed through as stored (to_jsonb). */
+export function openCycleFromJson(x:unknown):OpenCycleResult{
+ const o=(x??{}) as {created?:unknown;cycle?:unknown;transferred?:unknown};
+ if(!o.cycle||typeof o.cycle!=='object')throw new FactsDbError('unknown','open_reconcile_cycle: no cycle');
+ return {created:o.created===true,cycle:o.cycle as Record<string,unknown>,
+  transferred:(Array.isArray(o.transferred)?o.transferred:[]).map(p=>{const e=p as Record<string,unknown>;return {issuer_id:String(e.issuer_id),market:e.market as Market,source:String(e.source)};})};
+}
+export const adoptFromJson=(x:unknown)=>{const o=(x??{}) as Record<string,unknown>;return {factId:String(o.fact_id),runId:String(o.run_id),issuerId:String(o.issuer_id),market:o.market as Market};};
+export const restoreFromJson=(x:unknown)=>{const o=(x??{}) as {promoted?:unknown;skipped?:unknown};return {promoted:Number(o.promoted),skipped:(Array.isArray(o.skipped)?o.skipped:[]).map(s=>({fact_id:String((s as {fact_id:unknown}).fact_id),reason:String((s as {reason:unknown}).reason)}))};};
 /** Only the three link columns service_role may update (§4.7); undefined keys are dropped. */
 export function linkPatch(p:{document_ref?:string|null;document_url?:string|null;link_attempts:number}):Record<string,unknown>{
  if(!Number.isInteger(p.link_attempts)||p.link_attempts<0)throw new FactsDbError('unknown','invalid_link_attempts');
@@ -169,7 +216,7 @@ export function supabaseFactsDb(client:SupabaseClient):FactsDb{
   async scopeAll(market){return (await pageAll<Record<string,unknown>>(()=>c.from('fact_sync_scope').select('*').eq('market',market).order('issuer_id'))).map(scopeFromTable);},
   async metricsOfIssuer(issuer,market,formulaVersion){
    // Pages may span a concurrent replace_financial_metrics: accept a read only when every row carries
-   // the same based_on_rev and the row count equals the first page's exact count; else retry, then fail.
+   // the same based_on_rev AND the same based_on_lineage vector (T8) and the row count equals the first page's exact count; else retry, then fail.
    for(let attempt=0;attempt<METRICS_ATTEMPTS;attempt++){
     const out:Record<string,unknown>[]=[];let total:number|null=null;
     for(let from=0;;from+=READ_PAGE){
@@ -181,10 +228,39 @@ export function supabaseFactsDb(client:SupabaseClient):FactsDb{
      out.push(...part);
      if(part.length<READ_PAGE)break;
     }
-    const rev=out[0]?.based_on_rev;
-    if(total===out.length&&out.every(r=>Number(r.based_on_rev)===Number(rev)))return out.map(metricFromTable);
+    const rev=out[0]?.based_on_rev;const vector=lineageKey(lineageRevsFrom(out[0]?.based_on_lineage));
+    if(total===out.length&&out.every(r=>Number(r.based_on_rev)===Number(rev)&&lineageKey(lineageRevsFrom(r.based_on_lineage))===vector))return out.map(metricFromTable);
    }
    throw new FactsDbError('unknown','metrics_unstable');
   },
+  async targetOf(issuer){const r=await rows<{merged_into:string|null}>(c.from('issuers').select('merged_into').eq('issuer_id',issuer).limit(1));return r[0]?.merged_into??issuer;},
+  async lineageOf(target){return [target,...(await pageAll<{issuer_id:string}>(()=>c.from('issuers').select('issuer_id').eq('merged_into',target).order('issuer_id'))).map(r=>String(r.issuer_id))];},
+  async stateRevs(issuers,market){
+   if(issuers.length===0)return [];
+   // read_facts_lineage with no concepts: the revs of every member in one snapshot (anon may call it)
+   return lineageRevsFrom((await call<ReadFactsLineageEnvelope>('read_facts_lineage',readLineageArgs(issuers,market,{concepts:[],asOf:'1900-01-01'}))).state_revs);
+  },
+  async readFactsLineage(issuers,market,opts){return lineageResultFromEnvelope(await call<ReadFactsLineageEnvelope>('read_facts_lineage',readLineageArgs(issuers,market,opts)));},
+  async readFilingFacts(filingId,includeNonOk){return ((await call<{rows?:Record<string,unknown>[]}|null>('read_filing_facts',{p_filing:filingId,p_include_non_ok:includeNonOk}))?.rows??[]).map(filingFactFromJson);},
+  async replaceMetricsLineage(issuer,market,basedOn,input){return Number(await call<unknown>('replace_financial_metrics_lineage',{p_issuer:issuer,p_market:market,p_based_on:basedOn,p_rows:input.map(metricArgs)}));},
+  async findFilingBySourceRef(source,sourceRef){const r=await rows<Record<string,unknown>>(c.from('filings').select('*').eq('source',source).eq('source_ref',sourceRef).limit(1));return r[0]?filingFromTable(r[0]):null;},
+  async filingsForCalendar(issuer,market,opts){
+   const list=await pageAll<Record<string,unknown>>(()=>c.from('filings').select('*').eq('issuer_id',issuer).eq('market',market).gte('period_end',opts.fromPeriodEnd).order('period_end').order('available_date').order('filing_id'));
+   const status=new Map<string,string>();
+   for(const part of chunkIds([...new Set(list.map(r=>String(r.run_id)))]))
+    for(const r of await pageAll<{run_id:string;status:string}>(()=>c.from('fact_sync_runs').select('run_id,status').in('run_id',part).order('run_id')))status.set(String(r.run_id),String(r.status));
+   return list.map(r=>{const s=status.get(String(r.run_id));if(s===undefined)throw new FactsDbError('unknown',`run_not_found:${String(r.run_id)}`);return calendarFilingFromRow({...r,run_status:s});});
+  },
+  async setFilingAcceptance(filingId,acceptedAt,source){return (await call<unknown>('set_filing_acceptance',{p_filing:filingId,p_accepted:acceptedAt,p_source:source}))===true;},
+  async adoptCandidate(item,index,batch,expectedRev,by){return adoptFromJson(await call<unknown>('adopt_candidate',{p_item:item,p_index:index,p_batch:batch,p_expected_rev:expectedRev,p_resolved_by:by}));},
+  async restoreReconciled(item,batch,hash,by){return restoreFromJson(await call<unknown>('restore_reconciled',{p_item:item,p_batch:batch,p_inputs_hash_now:hash,p_resolved_by:by}));},
+  async resolveLineageConflict(item,keep,batch,by){return {quarantined:Number((await call<{quarantined:unknown}>('resolve_lineage_conflict',{p_item:item,p_keep:keep,p_batch:batch,p_resolved_by:by})).quarantined)};},
+  async claimReconcileMember(pair,cycleId,issuer,market,batch){return fenceFromJson(await call<unknown>('claim_reconcile_member',{p_pair:pair,p_cycle_id:cycleId,p_issuer:issuer,p_market:market,p_batch:batch}));},
+  async applyReconcileResult(fence,result){return applyOutcomeFromJson(await call<unknown>('apply_reconcile_result',{p_fence:fenceArgs(fence),p_result:result}));},
+  async completeReconcileMember(fence){return countsFromJson(await call<unknown>('complete_reconcile_member',{p_fence:fenceArgs(fence)}));},
+  async failReconcileMember(fence,error){await call('fail_reconcile_member',{p_fence:fenceArgs(fence),p_error:error});},
+  async openReconcileCycle(i){return openCycleFromJson(await call<unknown>('open_reconcile_cycle',{p_pair:i.pair,p_cycle_id:i.cycleId,p_started_at:i.startedAt,p_members:i.members,p_pending:i.pending}));},
+  async setMerge(source,target,by){return {repointed:Number((await call<{repointed:unknown}>('set_merge',{p_source:source,p_target:target,p_resolved_by:by})).repointed)};},
+  async setDissolved(issuer,by){await call('set_dissolved',{p_issuer:issuer,p_resolved_by:by});},
  };
 }
diff --git a/src/lib/facts/derive.ts b/src/lib/facts/derive.ts
index eb68fcc..5b74662 100644
--- a/src/lib/facts/derive.ts
+++ b/src/lib/facts/derive.ts
@@ -13,7 +13,7 @@
 // non-positive average equity is missing. as_of is the UTC date for every market.
 // materialize() reads the envelope, refuses truncated reads (read_truncated), and replaces the
 // issuer's metrics under the envelope's state_rev with one retry on stale_computation.
-import type {Duration,FactRow,FactsDb,Market,MetricDuration,MetricRow} from './types';
+import type {Duration,FactRow,FactsDb,LineageRev,Market,MetricDuration,MetricRow} from './types';
 import {FactsDbError} from './types';
 import {canonicalDecimal} from './json-numbers';
 import {classifyDuration} from './classify';
@@ -33,7 +33,7 @@ const FIXED_METRICS=['gross_margin','net_margin','fcf','borrowings_total','reven
 export function metricNames(market:Market):string[]{
  return [...FIXED_METRICS,...Q_SINGLE_CONCEPTS[market].flatMap(c=>[`q_single_${c}`,`ttm_${c}`])];
 }
-export interface DeriveOptions{market:Market;asOf:string;basedOnRev?:number}
+export interface DeriveOptions{market:Market;asOf:string;basedOnRev?:number;/** complete lineage vector the rows derive from; default [{issuer_id, basedOnRev}] */basedOn?:LineageRev[]}
 
 // ---- exact decimal arithmetic (value = n / 10^s) ----
 interface Dec{n:bigint;s:number}
@@ -100,7 +100,7 @@ export function deriveMetrics(allRows:FactRow[],opts:DeriveOptions):MetricRow[]{
  let rows=allRows.filter(r=>r.consolidation==='consolidated');
  if(rows.length===0)return [];
  // as_of is a UTC calendar date for every market (accepted, spec §8).
- const {market,asOf}=opts;const issuerId=rows[0].issuer_id;const basedOnRev=opts.basedOnRev??0;
+ const {market,asOf}=opts;const issuerId=rows[0].issuer_id;const basedOnRev=opts.basedOnRev??0;const basedOn=opts.basedOn??[{issuer_id:issuerId,state_rev:basedOnRev}];
  const facts=currentFacts(rows);
  const of=(concept:string)=>facts.get(concept)??[];
  const unique=<T>(xs:T[])=>xs.length===1?xs[0]:null;
@@ -113,7 +113,7 @@ export function deriveMetrics(allRows:FactRow[],opts:DeriveOptions):MetricRow[]{
  const emit=(metric:string,start:string,end:string,duration:MetricDuration,value:Dec,unit:string,inputUnit:string,basis:string,inputs:Input[])=>{
   const seen=new Set<string>();
   out.push({issuer_id:issuerId,market,metric,period_start:start,period_end:end,duration,value:decToString(value),unit,input_unit:inputUnit,basis,formula_version:FORMULA_VERSION,
-   inputs:inputs.filter(i=>{const k=`${i.fact_id}|${i.quarter?.join('~')??''}`;return !seen.has(k)&&!!seen.add(k);}),based_on_rev:basedOnRev,as_of:asOf});
+   inputs:inputs.filter(i=>{const k=`${i.fact_id}|${i.quarter?.join('~')??''}`;return !seen.has(k)&&!!seen.add(k);}),based_on_rev:basedOnRev,based_on_lineage:basedOn.map(x=>({...x})),as_of:asOf});
  };
  const ratio=(metric:string,ref:Cur&{row:{period_start:string}},num:Dec,den:Dec,basis:string,inputs:Cur[])=>{
   const v=div(num,den);if(v)emit(metric,ref.row.period_start,ref.row.period_end,ref.row.duration,v,'pure',ref.row.unit,basis,inputs.map(x=>inputOf(x)));
diff --git a/src/lib/facts/pg-facts-db.ts b/src/lib/facts/pg-facts-db.ts
index d7c384e..ed7bc93 100644
--- a/src/lib/facts/pg-facts-db.ts
+++ b/src/lib/facts/pg-facts-db.ts
@@ -7,9 +7,9 @@
 // by the db.ts normalisers). Errors are mapped with toFactsDbError exactly like PostgREST errors.
 import type {Pool} from 'pg';
 import {ident,typeParsers} from '../db/pg-table-client';
-import {assertAllStaged,chunk,conflictFromItem,conflictPrefix,factRowFromTable,filingArgs,filingFromTable,linkPatch,metricArgs,metricFromTable,readArgs,resultFromEnvelope,scopeFromTable,toFactsDbError} from './db';
-import type {PgErrorLike,ReadFactsEnvelope} from './db';
-import type {FactsDb} from './types';
+import {adoptFromJson,applyOutcomeFromJson,assertAllStaged,calendarFilingFromRow,chunk,conflictFromItem,conflictPrefix,countsFromJson,factRowFromTable,fenceArgs,fenceFromJson,filingArgs,filingFactFromJson,filingFromTable,lineageResultFromEnvelope,lineageRevsFrom,linkPatch,metricArgs,metricFromTable,openCycleFromJson,readArgs,readLineageArgs,restoreFromJson,resultFromEnvelope,scopeFromTable,toFactsDbError} from './db';
+import type {PgErrorLike,ReadFactsEnvelope,ReadFactsLineageEnvelope} from './db';
+import type {FactsDb,Market,ReadFactsOptions} from './types';
 
 export function pgFactsDb(pool:Pool):FactsDb{
  const run=async(text:string,values:unknown[])=>{
@@ -18,6 +18,10 @@ export function pgFactsDb(pool:Pool):FactsDb{
  };
  const fn=async<T>(call:string,values:unknown[]):Promise<T>=>(await run(`select ${call} as v`,values)).rows[0].v as T;
  const rel=(table:string)=>`${ident('public')}.${ident(table)}`;
+ const readLineage=(issuers:string[],market:Market,o:ReadFactsOptions)=>{
+  const a=readLineageArgs(issuers,market,o);
+  return fn<ReadFactsLineageEnvelope>('public.read_facts_lineage($1::uuid[],$2,$3::text[],$4::date,$5::date,$6::date,$7,$8,$9)',[a.p_issuers,a.p_market,a.p_concepts,a.p_as_of,a.p_from,a.p_to,a.p_history,a.p_limit,a.p_include_non_ok]);
+ };
  return {
   claimLease:(issuer,market,batch,ttl)=>fn<boolean>('public.claim_fact_sync_lease($1,$2,$3,$4)',[issuer,market,batch,ttl]),
   beginRun:(issuer,market,batch,gen)=>fn<string>('public.begin_sync_run($1,$2,$3,$4)',[issuer,market,batch,gen]),
@@ -72,5 +76,26 @@ export function pgFactsDb(pool:Pool):FactsDb{
   async metricsOfIssuer(issuer,market,formulaVersion){
    return (await run(`select * from ${rel('financial_metrics')} where issuer_id = $1 and market = $2 and formula_version = $3 order by metric, period_end, period_start, input_unit, basis`,[issuer,market,formulaVersion])).rows.map(metricFromTable);
   },
+  async targetOf(issuer){return ((await run(`select merged_into from ${rel('issuers')} where issuer_id = $1`,[issuer])).rows[0]?.merged_into as string|null|undefined)??issuer;},
+  async lineageOf(target){return [target,...(await run(`select issuer_id from ${rel('issuers')} where merged_into = $1 order by issuer_id`,[target])).rows.map(r=>String(r.issuer_id))];},
+  async stateRevs(issuers,market){if(issuers.length===0)return [];return lineageRevsFrom((await readLineage(issuers,market,{concepts:[],asOf:'1900-01-01'})).state_revs);},
+  async readFactsLineage(issuers,market,opts){return lineageResultFromEnvelope(await readLineage(issuers,market,opts));},
+  async readFilingFacts(filingId,includeNonOk){return ((await fn<{rows?:Record<string,unknown>[]}>('public.read_filing_facts($1,$2)',[filingId,includeNonOk])).rows??[]).map(filingFactFromJson);},
+  async replaceMetricsLineage(issuer,market,basedOn,input){return Number(await fn<number>('public.replace_financial_metrics_lineage($1,$2,$3::jsonb,$4::jsonb)',[issuer,market,JSON.stringify(basedOn),JSON.stringify(input.map(metricArgs))]));},
+  async findFilingBySourceRef(source,sourceRef){const r=(await run(`select * from ${rel('filings')} where source = $1 and source_ref = $2`,[source,sourceRef])).rows[0];return r?filingFromTable(r):null;},
+  async filingsForCalendar(issuer,market,opts){
+   return (await run(`select g.*, r.status as run_status from ${rel('filings')} g join ${rel('fact_sync_runs')} r on r.run_id = g.run_id where g.issuer_id = $1 and g.market = $2 and g.period_end >= $3::date order by g.period_end, g.available_date, g.filing_id`,[issuer,market,opts.fromPeriodEnd])).rows.map(r=>calendarFilingFromRow(r));
+  },
+  async setFilingAcceptance(filingId,acceptedAt,source){return (await fn<boolean>('public.set_filing_acceptance($1,$2::timestamptz,$3)',[filingId,acceptedAt,source]))===true;},
+  async adoptCandidate(item,index,batch,expectedRev,by){return adoptFromJson(await fn<unknown>('public.adopt_candidate($1,$2,$3,$4::bigint,$5)',[item,index,batch,expectedRev,by]));},
+  async restoreReconciled(item,batch,hash,by){return restoreFromJson(await fn<unknown>('public.restore_reconciled($1,$2,$3,$4)',[item,batch,hash,by]));},
+  async resolveLineageConflict(item,keep,batch,by){return {quarantined:Number((await fn<{quarantined:unknown}>('public.resolve_lineage_conflict($1,$2,$3,$4)',[item,keep,batch,by])).quarantined)};},
+  async claimReconcileMember(pair,cycleId,issuer,market,batch){return fenceFromJson(await fn<unknown>('public.claim_reconcile_member($1,$2,$3,$4,$5)',[pair,cycleId,issuer,market,batch]));},
+  async applyReconcileResult(fence,result){return applyOutcomeFromJson(await fn<unknown>('public.apply_reconcile_result($1::jsonb,$2::jsonb)',[JSON.stringify(fenceArgs(fence)),JSON.stringify(result)]));},
+  async completeReconcileMember(fence){return countsFromJson(await fn<unknown>('public.complete_reconcile_member($1::jsonb)',[JSON.stringify(fenceArgs(fence))]));},
+  async failReconcileMember(fence,error){await fn('public.fail_reconcile_member($1::jsonb,$2)',[JSON.stringify(fenceArgs(fence)),error]);},
+  async openReconcileCycle(i){return openCycleFromJson(await fn<unknown>('public.open_reconcile_cycle($1,$2,$3::timestamptz,$4::jsonb,$5::jsonb)',[i.pair,i.cycleId,i.startedAt,JSON.stringify(i.members),JSON.stringify(i.pending)]));},
+  async setMerge(source,target,by){return {repointed:Number((await fn<{repointed:unknown}>('public.set_merge($1,$2,$3)',[source,target,by])).repointed)};},
+  async setDissolved(issuer,by){await fn('public.set_dissolved($1,$2)',[issuer,by]);},
  };
 }
diff --git a/src/lib/facts/types.ts b/src/lib/facts/types.ts
index 2ceb2e8..222341f 100644
--- a/src/lib/facts/types.ts
+++ b/src/lib/facts/types.ts
@@ -1,7 +1,9 @@
 // src/lib/facts/types.ts
-// Shared contract of the facts layer (plan 2 §共享契约, spec §4.8). Every task uses these names
-// verbatim. FactsDb has three implementations: supabaseFactsDb (db.ts, rpc), memoryFactsDb
-// (memory-facts-db.ts, unit tests), pgFactsDb (pg-facts-db.ts, integration tests).
+// Shared contract of the facts layer (plan 2 §共享契约, spec §4.8; plan 3 C4, spec §3.2). Every task
+// uses these names verbatim. FactsDb has three implementations: supabaseFactsDb (db.ts, rpc),
+// memoryFactsDb (memory-facts-db.ts, unit tests), pgFactsDb (pg-facts-db.ts, integration tests).
+// The reconciliation types are imported as types only (no runtime cycle with src/lib/dq).
+import type {ApplyReconcileOutcome,CyclePairId,Fence,MemberCounts,OpenCycleInput,OpenCycleResult,ReconcileResultInput} from '../dq/reconcile/types';
 export type Market='US'|'CN';
 export type Statement='IS'|'BS'|'CF'|'DEI';
 export type Duration='3M'|'6M'|'9M'|'12M'|'INSTANT';
@@ -48,15 +50,29 @@ export interface FilingRow{
  filing_id:string;issuer_id:string;market:Market;source:Source;origin:Origin;form_type:FormType;fiscal_year:number|null;fiscal_period:string|null;
  period_end:string|null;available_date:string;source_ref:string;url:string|null;document_ref:string|null;document_url:string|null;
  link_attempts:number;mapping_gen:number;run_id:string;created_at:string;
+ /** SEC acceptance time (ISO) written once by set_filing_acceptance (plan 3 §4.5) */
+ accepted_at:string|null;acceptance_source:'sec_submissions'|null;
 }
 export interface ScopeRow{issuer_id:string;market:Market;reasons:string[];priority:number;fetch_key:string;next_due_at:string;lease_until:string|null;lease_batch_id:string|null;state_rev:number;last_attempt_at:string|null;last_success_at:string|null;last_batch_id:string|null;last_status:'success'|'failed'|null}
-export interface MetricRow{issuer_id:string;market:Market;metric:string;period_start:string;period_end:string;duration:MetricDuration;value:string;unit:string;input_unit:string;basis:string;formula_version:string;inputs:{fact_id:string;concept:string;filing_id:string;available_date:string;ytd_rule?:'same_filing'|'never_revised';quarter?:[string,string]}[];based_on_rev:number;as_of:string}
+/** One member of a lineage and its fact-state version (plan 3 §4.4). */
+export interface LineageRev{issuer_id:string;state_rev:number}
+export interface MetricRow{issuer_id:string;market:Market;metric:string;period_start:string;period_end:string;duration:MetricDuration;value:string;unit:string;input_unit:string;basis:string;formula_version:string;inputs:{fact_id:string;concept:string;filing_id:string;available_date:string;ytd_rule?:'same_filing'|'never_revised';quarter?:[string,string]}[];based_on_rev:number;
+ /** the complete lineage state the row was derived from (issuer_id ascending); compared as a whole (T8) */
+ based_on_lineage:LineageRev[];as_of:string}
 export interface ConflictItem{id:string;natural_key:string;fact_ids:string[];available_date:string;key:Record<string,string|null>}
+export interface LineageConflict{key:Record<string,string|null>;available_date:string;fact_ids:string[]}
 
 export interface ReadFactsOptions{concepts:string[];asOf:string;from?:string;to?:string;history?:boolean;limit?:number;includeNonOk?:boolean}
 export interface ReadFactsResult{stateRev:number;rows:FactRow[];truncated:boolean}
+export interface ReadFactsLineageResult{stateRevs:LineageRev[];lineage:string[];rows:FactRow[];conflicts:LineageConflict[];truncated:boolean}
+export type FilingFactRow=FactRow&{run_status:RunStatus};
+export type CalendarFiling=FilingRow&{run_status:RunStatus;accepted_at:string|null};
 
-export type FactsDbErrorCode='lease_lost'|'run_pending'|'run_published'|'mapping_gen_regression'|'stale_computation'|'stale_plan'|'run_abandoned'|'read_truncated'|'duplicate_key'|'invalid_chosen'|'item_not_open'|'unknown';
+export type FactsDbErrorCode='lease_lost'|'run_pending'|'run_published'|'mapping_gen_regression'|'stale_computation'|'stale_plan'|'run_abandoned'|'read_truncated'|'duplicate_key'|'invalid_chosen'|'item_not_open'|'unknown'
+ |'fence_failed'|'member_incomplete'|'stale_evaluation'|'batch_mismatch'|'invalid_choice'|'invalid_candidate'|'generation_moved'
+ |'duplicate'|'conflict_exists'|'replay_required'|'filing_not_found'|'not_passing'|'lineage_changed'|'scope_missing'|'unresolved'
+ |'acceptance_conflict'|'source_not_active'|'has_referrers'|'topology_write_forbidden'|'invalid_result'
+ |'use_dedicated_resolver'|'target_not_active'|'invalid_members';
 export class FactsDbError extends Error{constructor(public code:FactsDbErrorCode,message?:string){super(message??code);this.name='FactsDbError';}}
 
 export interface FactsDb{
@@ -71,6 +87,7 @@ export interface FactsDb{
  abandonRun(run:string):Promise<void>;
  releaseLease(issuer:string,market:Market,batch:string,outcome:'success'|'failed',nextDue:string):Promise<void>;
  resolveFactsQuarantine(itemId:string,chosen:string[],resolvedBy:string):Promise<{promoted:number;skipped:number;chosenFactIds:string[]}>;
+ /** plan-2 wrapper of replaceMetricsLineage with the one-member vector [{issuer, basedOnRev}] */
  replaceMetrics(issuer:string,market:Market,basedOnRev:number,rows:MetricRow[]):Promise<number>;
  readFacts(issuer:string,market:Market,opts:ReadFactsOptions):Promise<ReadFactsResult>;
  /** Rows for the given ids: deduped, ordered by fact_id; unknown ids are omitted. */
@@ -86,6 +103,32 @@ export interface FactsDb{
  /** Every scope row of the market, priority 0 included, ordered by issuer_id (complete set, paged to exhaustion) */
  scopeAll(market:Market):Promise<ScopeRow[]>;
  metricsOfIssuer(issuer:string,market:Market,formulaVersion:string):Promise<MetricRow[]>;
+ // ---- plan 3 (C4)
+ /** materialisation target T(i) = i.merged_into ?? i (unknown issuer → itself) */
+ targetOf(issuer:string):Promise<string>;
+ /** [target, ...issuers whose merged_into = target, ascending] */
+ lineageOf(target:string):Promise<string[]>;
+ /** one snapshot; issuer_id ascending, deduped; no scope row ⇒ 0 */
+ stateRevs(issuers:string[],market:Market):Promise<LineageRev[]>;
+ readFactsLineage(issuers:string[],market:Market,opts:ReadFactsOptions):Promise<ReadFactsLineageResult>;
+ /** every generation and status of one filing (includeNonOk=false: ok only), with the run status; no binding */
+ readFilingFacts(filingId:string,includeNonOk:boolean):Promise<FilingFactRow[]>;
+ replaceMetricsLineage(issuer:string,market:Market,basedOn:LineageRev[],rows:MetricRow[]):Promise<number>;
+ findFilingBySourceRef(source:Source,sourceRef:string):Promise<FilingRow|null>;
+ /** every filing with period_end >= fromPeriodEnd (complete set, never cut by a row count, T9), ordered by period_end, available_date, filing_id */
+ filingsForCalendar(issuer:string,market:Market,opts:{fromPeriodEnd:string}):Promise<CalendarFiling[]>;
+ setFilingAcceptance(filingId:string,acceptedAt:string,source:'sec_submissions'):Promise<boolean>;
+ adoptCandidate(itemId:string,index:number,batchId:string,expectedRev:number,resolvedBy:string):Promise<{factId:string;runId:string;issuerId:string;market:Market}>;
+ restoreReconciled(itemId:string,batchId:string,inputsHashNow:string,resolvedBy:string):Promise<{promoted:number;skipped:{fact_id:string;reason:string}[]}>;
+ resolveLineageConflict(itemId:string,keepFactId:string,batchId:string,resolvedBy:string):Promise<{quarantined:number}>;
+ claimReconcileMember(pair:CyclePairId,cycleId:string,issuer:string,market:Market,batchId:string):Promise<Fence|null>;
+ applyReconcileResult(fence:Fence,result:ReconcileResultInput):Promise<ApplyReconcileOutcome>;
+ completeReconcileMember(fence:Fence):Promise<MemberCounts>;
+ failReconcileMember(fence:Fence,error:string):Promise<void>;
+ /** atomic cycle creation (open_reconcile_cycle, plan audit Q2): under the pair's cycle lock (shared with set_merge) a running cycle is returned unchanged (created:false); else the cycle row and one pending cursor per member are inserted and ONLY the listed pending entries leave the cycle rows' pending_members */
+ openReconcileCycle(input:OpenCycleInput):Promise<OpenCycleResult>;
+ setMerge(source:string,target:string,resolvedBy:string):Promise<{repointed:number}>;
+ setDissolved(issuer:string,resolvedBy:string):Promise<void>;
 }
 /** stageFilings 的输入行（写入端生成 filing_id） */
 export interface FilingInsert extends FilingCandidate{filing_id:string;issuer_id:string}

exec
/bin/zsh -lc 'ls -a | head -30; for p in /AGENTS.md /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do test ! -f "$p" || cat "$p"; done; git show 0bf3b19 -- src/lib/facts/memory-facts-db.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
.
..
.claude
.cursor
.edgeone
.env.example
.git
.gitattributes
.github
.gitignore
.osstack
.vercelignore
DESIGN.md
LICENSE
README.md
STITCH_PROMPTS.md
TODOS.md
config
data
docs
e2e
eslint.config.mjs
hermes
legacy-demo
messages
next.config.mjs
node_modules
ops
osstack-contracts.cjs
osstack.contracts.json
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-pOvMUj6Y' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-2rDIXwgk' (errno=Operation not permitted)
commit 0bf3b19e8362ec0ee9141d7f61416553a9c85f2b
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 02:43:53 2026 -0800

    feat(facts): FactsDb plan-3 extension in all three implementations (lineage, acceptance, adoption, restore, cursor, topology) (F3-4)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/facts/memory-facts-db.ts b/src/lib/facts/memory-facts-db.ts
index aa2cac8..8ac08f7 100644
--- a/src/lib/facts/memory-facts-db.ts
+++ b/src/lib/facts/memory-facts-db.ts
@@ -11,20 +11,31 @@
 // plan-1 quarantine() and this db see the same rows in one test. Validation of a stageFacts batch
 // happens before any row is written (one SQL statement). value_text = value as given (PostgreSQL
 // would normalise e.g. 1e5; callers pass canonical decimals, §6.2).
+// Plan 3: topology (setTopology / setMerge / setDissolved), lineage reads with cross-issuer suppression,
+// lineage metrics, acceptance, candidate adoption, restore, lineage verdicts and the reconcile cursor,
+// mirroring 20261107091000 (the cursor, cycles and results live in the TableClient so run.ts and this
+// db see the same rows). Known differences from SQL: the plan-1 "open securities" trigger is not modelled
+// (only pg tests it), no research_audit_log rows are written, unknown issuers count as active.
 import {randomUUID} from 'node:crypto';
 import {memoryTableClient} from '../db/memory-table-client';
 import type {Row,TableClient} from '../db/table-client';
-import {READ_FACTS_CAP,assertAllStaged,conflictFromItem,conflictPrefix,linkPatch} from './db';
+import {READ_FACTS_CAP,assertAllStaged,conflictFromItem,conflictPrefix,lineageRevsFrom,linkPatch} from './db';
+import {factKey} from './keys';
 import {FactsDbError} from './types';
-import type {FactRow,FactsDb,FilingRow,Market,MetricRow,RunStatus,ScopeRow} from './types';
+import type {FactCandidate,FactRow,FactsDb,FilingRow,LineageConflict,LineageRev,Market,MetricRow,ReadFactsLineageResult,ReadFactsOptions,RunStatus,ScopeRow} from './types';
+import type {ApplyReconcileOutcome,Fence,PendingMember,ReconcileResultInput} from '../dq/reconcile/types';
+import {DATASETS} from '../dq/datasets';   // dataset strings only from the registry (datasets.test.ts literal scan)
 
 export interface MemoryRun{run_id:string;issuer_id:string;market:Market;batch_id:string;mapping_gen:number;status:RunStatus;manifest:string[];started_at:string;published_at:string|null}
+export interface MemoryTopology{status:'active'|'merged'|'dissolved';merged_into:string|null}
 export interface MemoryFactsDb extends FactsDb{
  tables:TableClient;
  /** Fixes "now" for leases and timestamps; null returns to the wall clock. */
  setNow(iso:string|null):void;
  expireLease(issuer:string,market:Market):void;
  runs():MemoryRun[];filings():FilingRow[];facts():FactRow[];metrics():MetricRow[];scope():ScopeRow[];
+ /** Test helper: issuer topology (memory has no issuers table). Unknown issuers are active with no merged_into. */
+ setTopology(entries:Record<string,MemoryTopology>):void;
 }
 
 const canon=(s:string)=>{
@@ -38,7 +49,7 @@ const canon=(s:string)=>{
 /** numeric equality on decimal strings without exponent: sign of zero, leading and trailing zeros ignored. */
 export function numericEquals(a:string,b:string):boolean{return canon(a)===canon(b);}
 
-const ASYNC_METHODS=['claimLease','beginRun','stageFilings','stageFacts','quarantineFacts','publishRun','abandonRun','releaseLease','resolveFactsQuarantine','replaceMetrics','readFacts','factsByIds','openConflicts','filingsOfIssuer','updateFilingLink','reconcileScope','scopeDue','scopeRows','scopeAll','metricsOfIssuer'] as const satisfies readonly (keyof FactsDb)[];
+const ASYNC_METHODS=['claimLease','beginRun','stageFilings','stageFacts','quarantineFacts','publishRun','abandonRun','releaseLease','resolveFactsQuarantine','replaceMetrics','readFacts','factsByIds','openConflicts','filingsOfIssuer','updateFilingLink','reconcileScope','scopeDue','scopeRows','scopeAll','metricsOfIssuer','targetOf','lineageOf','stateRevs','readFactsLineage','readFilingFacts','replaceMetricsLineage','findFilingBySourceRef','filingsForCalendar','setFilingAcceptance','adoptCandidate','restoreReconciled','resolveLineageConflict','claimReconcileMember','applyReconcileResult','completeReconcileMember','failReconcileMember','openReconcileCycle','setMerge','setDissolved'] as const satisfies readonly (keyof FactsDb)[];
 /** Compile-time check: ASYNC_METHODS must cover every FactsDb method. */
 export type AsyncMethodsComplete=[Exclude<keyof FactsDb,typeof ASYNC_METHODS[number]>] extends [never]?true:never;
 export const asyncMethodsComplete:AsyncMethodsComplete=true;   // type error here ⇒ a FactsDb method is missing from ASYNC_METHODS
@@ -90,25 +101,152 @@ export function memoryFactsDb(tables:TableClient=memoryTableClient({dq_quarantin
   const k=(item.payload as {key?:Record<string,string|null>}|undefined)?.key;
   return !!k&&k.issuer_id===f.issuer_id&&k.market===f.market&&k.concept===f.concept&&(k.period_start??'')===(f.period_start??'')&&k.period_end===f.period_end&&k.consolidation===f.consolidation&&k.unit===f.unit&&k.available_date===f.available_date;
  };
- // promote_quarantined eligibility (§4.5): quarantined, run published, filing on the row's
- // generation, not referenced by any OPEN item, its (K, date) not disputed by any OPEN
- // same_day_conflict item, and chosen by every RESOLVED conflict that lists it.
+ // ---- plan 3 helpers
+ const topo=new Map<string,MemoryTopology>();
+ const topoOf=(id:string):MemoryTopology=>topo.get(id)??{status:'active',merged_into:null};
+ const referrers=(id:string)=>[...topo.entries()].filter(([,t])=>t.merged_into===id).map(([k])=>k).sort(cmp);
+ const lineageMembers=(t:string)=>[t,...referrers(t)];
+ const MARKETS:readonly Market[]=['CN','US'];
+ const ensureScope=(issuer:string,market:Market)=>{
+  const k=sk(issuer,market);if(scope.has(k))return;
+  scope.set(k,{issuer_id:issuer,market,reasons:[],priority:0,fetch_key:'topology',next_due_at:now(),lease_until:null,lease_batch_id:null,state_rev:0,last_attempt_at:null,last_success_at:null,last_batch_id:null,last_status:null});
+  scopeConfirmed.set(k,now());
+ };
+ const visible=(f:FactRow)=>filings.get(f.filing_id)?.mapping_gen===f.mapping_gen;
+ const detailOf=(row:Row)=>(row.detail??{}) as Record<string,unknown>;
+ const listOf=(v:unknown)=>Array.isArray(v)?v.filter((x):x is string=>typeof x==='string'):[];
+ const batchRow=async(id:string)=>(await tables.select('ingest_batches',{batch_id:id},{limit:1}))[0];
+ const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
+ const isDate=(s:unknown):s is string=>{if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(`${s}T00:00:00Z`);return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s;};
+ const NUMERIC=/^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/;
+ /** The persisted plan-2 FactCandidate (camelCase), validated like adopt_candidate; null = invalid_candidate. */
+ const candidateOf=(x:unknown):FactCandidate|null=>{
+  if(!x||typeof x!=='object'||Array.isArray(x))return null;
+  const c=x as Record<string,unknown>;
+  const str=(k:string,max:number)=>typeof c[k]==='string'&&(c[k] as string).length>=1&&(c[k] as string).length<=max;
+  if(!str('concept',64)||!str('sourceConcept',256)||!str('unit',16)||!str('rawHash',128)||!str('filingRef',100000))return null;
+  if(!['IS','BS','CF','DEI'].includes(String(c.statement))||!['3M','6M','9M','12M','INSTANT'].includes(String(c.duration))||!['consolidated','parent'].includes(String(c.consolidation)))return null;
+  if(!isDate(c.periodEnd)||!(c.periodStart===null||isDate(c.periodStart)))return null;
+  if(typeof c.value!=='string'||!/^-?[0-9]+(\.[0-9]+)?$/.test(c.value))return null;
+  if((c.periodStart===null)!==(c.duration==='INSTANT'))return null;
+  if(c.periodStart!==null&&!((c.periodStart as string)<(c.periodEnd as string)))return null;
+  return c as unknown as FactCandidate;
+ };
+ const disputesKey=(item:Row,lineage:string[],market:Market,k:KeyPart,date:string)=>{
+  const p=(item.payload as {key?:Record<string,string|null>}|undefined)?.key;
+  return !!p&&typeof p.issuer_id==='string'&&lineage.includes(p.issuer_id)&&p.market===market&&p.concept===k.concept&&(p.period_start??'')===(k.period_start??'')&&p.period_end===k.period_end&&p.consolidation===k.consolidation&&p.unit===k.unit&&p.available_date===date;
+ };
+ const OUTCOMES=['compared','left_missing','left_unlinked','left_ambiguous','right_missing','unsupported','right_ambiguous','incomplete_gold'];
+ const ACTIONS=['record','quarantine_left','review_item','lineage_item'];
+ const validResult=(r:ReconcileResultInput):boolean=>{
+  if(!r||typeof r!=='object'||typeof r.natural_key!=='string'||r.natural_key.length<1||r.natural_key.length>400)return false;
+  if(!['numeric','text','date'].includes(r.kind)||!OUTCOMES.includes(r.outcome)||typeof r.passed!=='boolean'||!ACTIONS.includes(r.action))return false;
+  if(typeof r.left_source!=='string'||typeof r.right_source!=='string'||!r.detail||typeof r.detail!=='object'||Array.isArray(r.detail))return false;
+  if(typeof r.tolerance!=='string'||!NUMERIC.test(r.tolerance)||[r.left_value,r.right_value,r.abs_diff,r.rel_diff].some(v=>v!==null&&v!==undefined&&!NUMERIC.test(v)))return false;
+  if(r.passed&&r.outcome!=='compared')return false;   // a pass is only meaningful for a compared pair of values
+  if(r.left_fact_id!==undefined&&!UUID.test(r.left_fact_id))return false;
+  if(r.action==='quarantine_left'&&r.left_fact_id===undefined)return false;
+  if((r.action==='review_item'||r.action==='lineage_item')&&(!r.item||typeof r.item.natural_key!=='string'||r.item.natural_key.length<1||r.item.natural_key.length>512||!r.item.payload||typeof r.item.payload!=='object'))return false;
+  return true;
+ };
+ const cursorKey=(f:{pair:string;cycle_id:string;issuer_id:string;market:Market})=>({pair:f.pair,cycle_id:f.cycle_id,issuer_id:f.issuer_id,market:f.market});
+ const fenceLock=async(f:Fence)=>{
+  const [c]=await tables.select('dq_reconcile_cursor',cursorKey(f),{limit:1});
+  if(!c||c.state!=='claimed'||c.claimed_by!==f.batch_id||Number(c.attempts)!==f.attempt||typeof c.claim_until!=='string'||c.claim_until<=now())throw new FactsDbError('fence_failed');
+  return c;
+ };
+ /** The member's frozen expected natural keys (cycle members[].expected_keys: {naturalKey,…} or bare strings); null when the member is not in the cycle. */
+ const frozenKeys=async(f:Fence):Promise<string[]|null>=>{
+  const [y]=await tables.select('dq_reconcile_cycles',{pair:f.pair,cycle_id:f.cycle_id},{limit:1});
+  const members=Array.isArray(y?.members)?y.members as {issuer_id?:unknown;market?:unknown;expected_keys?:unknown}[]:[];
+  const m=members.find(x=>typeof x.issuer_id==='string'&&UUID.test(x.issuer_id)&&x.issuer_id.toLowerCase()===f.issuer_id.toLowerCase()&&x.market===f.market&&Array.isArray(x.expected_keys));
+  if(!m)return null;
+  return (m.expected_keys as unknown[]).map(k=>typeof k==='string'?k:String((k as {naturalKey?:unknown}).naturalKey));
+ };
+ // set_merge's registration: one {issuer_id:T, market, source:S} per market (CN, US), deduped by the whole entry (plan audit Q2)
+ const registerPending=async(target:string,source:string)=>{
+  const cycles=(await tables.select('dq_reconcile_cycles',{pair:'facts.lineage_same_day'}))
+   .sort((a,b)=>Number(b.status==='running')-Number(a.status==='running')||cmp(String(b.started_at),String(a.started_at)));
+  const c=cycles[0];if(!c)return;
+  const d=detailOf(c);const list=Array.isArray(d.pending_members)?[...(d.pending_members as PendingMember[])]:[];
+  for(const m of MARKETS)if(!list.some(x=>x.issuer_id===target&&x.market===m&&x.source===source))list.push({issuer_id:target,market:m,source});
+  await tables.update('dq_reconcile_cycles',{pair:String(c.pair),cycle_id:String(c.cycle_id)},{detail:{...d,pending_members:list}});
+ };
+ const pendingKey=(p:{issuer_id:unknown;market:unknown;source?:unknown})=>`${String(p.issuer_id)}:${String(p.market)}:${String(p.source)}`;
+ // promote_quarantined eligibility (§4.5 + plan 3 T6): quarantined, run published, filing on the
+ // row's generation, not referenced by any OPEN item, its (K, date) not disputed by an OPEN
+ // same_day_conflict, chosen by every RESOLVED same_day_conflict and lineage_conflict that lists it
+ // (lineage: payload members and the rows it quarantined), and no reconcile_mismatch referencing it
+ // unless that one is resolved_accept with latest_result.passed = true.
  const promote=async(issuer:string,market:Market,ids:string[])=>{
-  const open=await items({status:'open'});
-  const resolvedConflicts=(await items({reason_code:'same_day_conflict'})).filter(i=>i.status!=='open');
+  const all=await items({});
+  const open=all.filter(i=>i.status==='open');
+  const resolvedConflicts=all.filter(i=>i.reason_code==='same_day_conflict'&&i.status!=='open');
+  const lineageVerdicts=all.filter(i=>i.reason_code==='lineage_conflict'&&i.status!=='open');
+  const mismatches=all.filter(i=>i.reason_code==='reconcile_mismatch');
+  const passing=(i:Row)=>i.status==='resolved_accept'&&(detailOf(i).latest_result as {passed?:unknown}|undefined)?.passed===true;
   let n=0;
   for(const id of new Set(ids)){
    const f=facts.get(id);
    if(!f||f.issuer_id!==issuer||f.market!==market||f.status!=='quarantined')continue;
    if(runs.get(f.run_id)?.status!=='published')continue;
-   if(filings.get(f.filing_id)?.mapping_gen!==f.mapping_gen)continue;
+   if(!visible(f))continue;
    if(open.some(i=>idsOf(i).includes(id)))continue;
    if(open.some(i=>i.reason_code==='same_day_conflict'&&disputes(i,f)))continue;
    if(resolvedConflicts.some(i=>idsOf(i).includes(id)&&!chosenOf(i).includes(id)))continue;
+   if(lineageVerdicts.some(i=>(idsOf(i).includes(id)||listOf(detailOf(i).quarantined_fact_ids).includes(id))&&!chosenOf(i).includes(id)))continue;
+   if(mismatches.some(i=>idsOf(i).includes(id)&&!passing(i)))continue;
    f.status='ok';n++;
   }
   return n;
  };
+ // read_facts_lineage: the read_facts rules over a member set; with more than one member, ok rows of
+ // one (K, available_date) from different issuers with different values leave the sequences and go to conflicts.
+ const readLineage=(members:string[],market:Market,o:ReadFactsOptions):ReadFactsLineageResult=>{
+  const set=[...new Set(members)].sort(cmp);const inSet=new Set(set);
+  const stateRevs:LineageRev[]=set.map(i=>({issuer_id:i,state_rev:scopeOf(i,market)?.state_rev??0}));
+  const base=[...facts.values()].filter(f=>inSet.has(f.issuer_id)&&f.market===market&&o.concepts.includes(f.concept)&&f.available_date<=o.asOf
+   &&(o.from===undefined||f.period_end>=o.from)&&(o.to===undefined||f.period_end<=o.to)&&(f.status==='ok'||o.includeNonOk===true)&&visible(f));
+  const conflicts:LineageConflict[]=[];const excluded=new Set<string>();
+  if(set.length>1){
+   const byDay=new Map<string,FactRow[]>();
+   for(const f of base)if(f.status==='ok'){const k=`${keyOf(f)}|${f.available_date}`;const g=byDay.get(k);if(g)g.push(f);else byDay.set(k,[f]);}
+   for(const g of byDay.values()){
+    if(new Set(g.map(f=>f.issuer_id)).size<2||g.every(f=>numericEquals(f.value,g[0].value)))continue;
+    for(const f of g)excluded.add(f.fact_id);
+    const f0=g[0];
+    conflicts.push({key:{concept:f0.concept,period_start:f0.period_start,period_end:f0.period_end,consolidation:f0.consolidation,unit:f0.unit},available_date:f0.available_date,fact_ids:g.map(f=>f.fact_id).sort(cmp)});
+   }
+   const s=(v:string|null|undefined)=>v??'';
+   conflicts.sort((a,b)=>cmp(a.available_date,b.available_date)||cmp(s(a.key.concept),s(b.key.concept))||cmp(s(a.key.period_end),s(b.key.period_end))||cmp(s(a.key.period_start),s(b.key.period_start))||cmp(s(a.key.consolidation),s(b.key.consolidation))||cmp(s(a.key.unit),s(b.key.unit)));
+  }
+  const eligible=base.filter(f=>!excluded.has(f.fact_id));
+  const groups=new Map<string,FactRow[]>();
+  for(const f of eligible)if(f.status==='ok'){const k=keyOf(f);if(!groups.has(k))groups.set(k,[]);groups.get(k)!.push(f);}
+  const out:FactRow[]=[];
+  for(const g of groups.values()){g.sort(byDisclosure);g.forEach((f,i)=>out.push({...clone(f),disclosure_seq:i+1,is_current:i===g.length-1,is_revision:i>0&&!numericEquals(f.value,g[i-1].value)}));}
+  for(const f of eligible)if(f.status!=='ok')out.push({...clone(f),disclosure_seq:undefined,is_current:false,is_revision:false});
+  const heads=new Map<string,FactRow>();for(const f of out)if(!heads.has(keyOf(f)))heads.set(keyOf(f),f);
+  const rank=new Map([...heads.entries()].sort((a,b)=>keyOrder(a[1],b[1])).map(([k],i)=>[k,i+1] as const));
+  const picked=out.filter(f=>(o.history===true||f.is_current===true)&&(o.limit===undefined||rank.get(keyOf(f))!<=o.limit));
+  picked.sort((a,b)=>rank.get(keyOf(a))!-rank.get(keyOf(b))!||byDisclosure(a,b));
+  if(picked.length>READ_FACTS_CAP)return {stateRevs,lineage:set,rows:[],conflicts,truncated:true};
+  return {stateRevs,lineage:set,rows:picked,conflicts,truncated:false};
+ };
+ // replace_financial_metrics_lineage: member set = current lineage, every rev equal, else stale_computation.
+ const replaceLineage=(issuer:string,market:Market,basedOn:LineageRev[],input:MetricRow[])=>{
+  const norm=lineageRevsFrom(basedOn);
+  if(norm.length===0||new Set(norm.map(x=>x.issuer_id)).size!==norm.length||!norm.some(x=>x.issuer_id===issuer)||norm.some(x=>!Number.isInteger(x.state_rev)||x.state_rev<0))throw unknown('invalid_based_on');
+  if(norm.some(x=>!scopeOf(x.issuer_id,market)))throw new FactsDbError('scope_missing');
+  if(topoOf(issuer).status!=='active')throw new FactsDbError('stale_computation');   // a merged / dissolved issuer is no materialisation target
+  if([...lineageMembers(issuer)].sort(cmp).join(',')!==norm.map(x=>x.issuer_id).join(','))throw new FactsDbError('stale_computation');
+  if(norm.some(x=>scopeOf(x.issuer_id,market)!.state_rev!==x.state_rev))throw new FactsDbError('stale_computation');
+  const pk=(m:MetricRow)=>[m.metric,m.period_start,m.period_end,m.input_unit,m.basis,m.formula_version].join('|');
+  if(new Set(input.map(pk)).size!==input.length)throw new FactsDbError('duplicate_key','financial_metrics_pkey');
+  const rev=scopeOf(issuer,market)!.state_rev;
+  metrics=metrics.filter(m=>!(m.issuer_id===issuer&&m.market===market)).concat(input.map(m=>({...clone(m),issuer_id:issuer,market,based_on_rev:rev,based_on_lineage:norm.map(x=>({...x}))})));
+  return input.length;
+ };
  const byDisclosure=(a:FactRow,b:FactRow)=>cmp(a.available_date,b.available_date)||cmp(a.created_at,b.created_at)||cmp(a.fact_id,b.fact_id);
  // key ranking of read_facts: period_end desc, concept, period_start desc nulls last, consolidation, unit
  const keyOrder=(a:KeyPart,b:KeyPart)=>cmp(b.period_end,a.period_end)||cmp(a.concept,b.concept)
@@ -146,7 +284,7 @@ export function memoryFactsDb(tables:TableClient=memoryTableClient({dq_quarantin
     const existing=[...filings.values()].find(same)??pending.find(same);
     if(existing){if(existing.issuer_id===r.issuer_id&&existing.market===r.market)out.set(row.sourceRef,existing.filing_id);continue;}
     if(filings.has(row.filing_id)||pending.some(g=>g.filing_id===row.filing_id))throw new FactsDbError('duplicate_key','filings_pkey');
-    pending.push({filing_id:row.filing_id,issuer_id:r.issuer_id,market:r.market,source:row.source,origin:row.origin,form_type:row.formType,fiscal_year:row.fiscalYear,fiscal_period:row.fiscalPeriod,period_end:row.periodEnd,available_date:row.availableDate,source_ref:row.sourceRef,url:row.url,document_ref:null,document_url:null,link_attempts:0,mapping_gen:0,run_id:run,created_at:now()});
+    pending.push({filing_id:row.filing_id,issuer_id:r.issuer_id,market:r.market,source:row.source,origin:row.origin,form_type:row.formType,fiscal_year:row.fiscalYear,fiscal_period:row.fiscalPeriod,period_end:row.periodEnd,available_date:row.availableDate,source_ref:row.sourceRef,url:row.url,document_ref:null,document_url:null,link_attempts:0,mapping_gen:0,run_id:run,created_at:now(),accepted_at:null,acceptance_source:null});
     out.set(row.sourceRef,row.filing_id);
    }
    for(const g of pending)filings.set(g.filing_id,g);
@@ -215,6 +353,8 @@ export function memoryFactsDb(tables:TableClient=memoryTableClient({dq_quarantin
   async resolveFactsQuarantine(itemId,chosen,resolvedBy){
    const [it]=await tables.select('dq_quarantine',{id:itemId},{limit:1});
    if(!it||it.status!=='open'||it.table_name!=='financial_facts')throw new FactsDbError('item_not_open');
+   // migration two: these two reasons close only through restoreReconciled / resolveLineageConflict
+   if(it.reason_code==='reconcile_mismatch'||it.reason_code==='lineage_conflict')throw new FactsDbError('use_dedicated_resolver');
    const ids=idsOf(it);
    const existing=ids.map(id=>facts.get(id)).filter((f):f is FactRow=>!!f);
    const runId=runIdOf(it);
@@ -235,29 +375,12 @@ export function memoryFactsDb(tables:TableClient=memoryTableClient({dq_quarantin
    return {promoted,skipped:picked.length-promoted,chosenFactIds:picked};
   },
   async replaceMetrics(issuer,market,basedOnRev,input){
-   const rev=scopeOf(issuer,market)?.state_rev??0;
-   if(rev!==basedOnRev)throw new FactsDbError('stale_computation');
-   const pk=(m:MetricRow)=>[m.metric,m.period_start,m.period_end,m.input_unit,m.basis,m.formula_version].join('|');
-   if(new Set(input.map(pk)).size!==input.length)throw new FactsDbError('duplicate_key','financial_metrics_pkey');
-   metrics=metrics.filter(m=>!(m.issuer_id===issuer&&m.market===market)).concat(input.map(m=>({...clone(m),issuer_id:issuer,market,based_on_rev:basedOnRev})));
-   return input.length;
-  },
-  async readFacts(issuer,market,o){
-   const stateRev=scopeOf(issuer,market)?.state_rev??0;
-   const base=[...facts.values()].filter(f=>f.issuer_id===issuer&&f.market===market&&o.concepts.includes(f.concept)&&f.available_date<=o.asOf
-    &&(o.from===undefined||f.period_end>=o.from)&&(o.to===undefined||f.period_end<=o.to)&&(f.status==='ok'||o.includeNonOk===true)&&filings.get(f.filing_id)?.mapping_gen===f.mapping_gen);
-   const groups=new Map<string,FactRow[]>();
-   for(const f of base)if(f.status==='ok'){const k=keyOf(f);if(!groups.has(k))groups.set(k,[]);groups.get(k)!.push(f);}
-   const out:FactRow[]=[];
-   for(const g of groups.values()){g.sort(byDisclosure);g.forEach((f,i)=>out.push({...clone(f),disclosure_seq:i+1,is_current:i===g.length-1,is_revision:i>0&&!numericEquals(f.value,g[i-1].value)}));}
-   for(const f of base)if(f.status!=='ok')out.push({...clone(f),disclosure_seq:undefined,is_current:false,is_revision:false});
-   const heads=new Map<string,FactRow>();for(const f of out)if(!heads.has(keyOf(f)))heads.set(keyOf(f),f);
-   const rank=new Map([...heads.entries()].sort((a,b)=>keyOrder(a[1],b[1])).map(([k],i)=>[k,i+1] as const));
-   const picked=out.filter(f=>(o.history===true||f.is_current===true)&&(o.limit===undefined||rank.get(keyOf(f))!<=o.limit));
-   picked.sort((a,b)=>rank.get(keyOf(a))!-rank.get(keyOf(b))!||byDisclosure(a,b));
-   if(picked.length>READ_FACTS_CAP)return {stateRev,rows:[],truncated:true};
-   return {stateRev,rows:picked,truncated:false};
+   // plan-2 contract: no scope row ⇒ rev 0 (a non-zero rev is stale); rev 0 without a row is scope_missing (as in SQL)
+   if(!scopeOf(issuer,market)){if(basedOnRev!==0)throw new FactsDbError('stale_computation');throw new FactsDbError('scope_missing');}
+   if(!Number.isInteger(basedOnRev)||basedOnRev<0)throw new FactsDbError('stale_computation');
+   return replaceLineage(issuer,market,[{issuer_id:issuer,state_rev:basedOnRev}],input);
   },
+  async readFacts(issuer,market,o){const r=readLineage([issuer],market,o);return {stateRev:r.stateRevs[0].state_rev,rows:r.rows,truncated:r.truncated};},
   async factsByIds(ids){return [...new Set(ids)].sort().map(id=>facts.get(id)).filter((f):f is FactRow=>!!f).map(f=>clone(f));},   // deduped, ordered by fact_id
   async openConflicts(issuer,market){
    const prefix=conflictPrefix(issuer,market);
@@ -306,6 +429,256 @@ export function memoryFactsDb(tables:TableClient=memoryTableClient({dq_quarantin
    rows.sort((a,b)=>cmp(a.metric,b.metric)||cmp(a.period_end,b.period_end)||cmp(a.period_start,b.period_start)||cmp(a.input_unit,b.input_unit)||cmp(a.basis,b.basis));
    return clone(rows);
   },
+  setTopology:entries=>{for(const [id,t] of Object.entries(entries))topo.set(id,{...t});},
+  async targetOf(issuer){return topoOf(issuer).merged_into??issuer;},
+  async lineageOf(target){return lineageMembers(target);},
+  async stateRevs(issuers,market){return [...new Set(issuers)].sort(cmp).map(i=>({issuer_id:i,state_rev:scopeOf(i,market)?.state_rev??0}));},
+  async readFactsLineage(issuers,market,o){return readLineage(issuers,market,o);},
+  async readFilingFacts(filingId,includeNonOk){
+   const rows=[...facts.values()].filter(f=>f.filing_id===filingId&&(f.status==='ok'||includeNonOk));
+   rows.sort((a,b)=>(a.mapping_gen-b.mapping_gen)||cmp(a.concept,b.concept)||cmp(a.period_end,b.period_end)||cmp(a.period_start??'',b.period_start??'')||cmp(a.unit,b.unit)||cmp(a.created_at,b.created_at)||cmp(a.fact_id,b.fact_id));
+   return rows.map(f=>({...clone(f),run_status:runs.get(f.run_id)?.status??'abandoned'}));
+  },
+  async replaceMetricsLineage(issuer,market,basedOn,input){return replaceLineage(issuer,market,basedOn,input);},
+  async findFilingBySourceRef(source,sourceRef){const g=[...filings.values()].find(x=>x.source===source&&x.source_ref===sourceRef);return g?clone(g):null;},
+  async filingsForCalendar(issuer,market,o){
+   const rows=[...filings.values()].filter(g=>g.issuer_id===issuer&&g.market===market&&g.period_end!==null&&g.period_end>=o.fromPeriodEnd);
+   rows.sort((a,b)=>cmp(a.period_end!,b.period_end!)||cmp(a.available_date,b.available_date)||cmp(a.filing_id,b.filing_id));
+   return rows.map(g=>({...clone(g),run_status:(runs.get(g.run_id)?.status??'abandoned') as RunStatus}));
+  },
+  async setFilingAcceptance(filingId,acceptedAt,source){
+   if(source!=='sec_submissions'||!acceptedAt||Number.isNaN(Date.parse(acceptedAt)))throw unknown('invalid_acceptance');
+   const g=filings.get(filingId);if(!g)throw new FactsDbError('filing_not_found');
+   if(g.source!=='edgar')throw unknown('invalid_acceptance');
+   const iso=new Date(acceptedAt).toISOString();
+   if(g.accepted_at===null){g.accepted_at=iso;g.acceptance_source=source;return true;}
+   if(g.accepted_at===iso&&g.acceptance_source===source)return false;
+   throw new FactsDbError('acceptance_conflict');
+  },
+  async adoptCandidate(itemId,index,batchId,expectedRev,resolvedBy){
+   if(!resolvedBy)throw unknown('invalid_resolver');
+   const [it]=await tables.select('dq_quarantine',{id:itemId},{limit:1});
+   if(!it||it.status!=='open')throw new FactsDbError('item_not_open');
+   if(it.table_name!=='financial_facts'||it.reason_code!=='ambiguous_value'||(it.dataset!==DATASETS.facts('US')&&it.dataset!==DATASETS.facts('CN')))throw new FactsDbError('invalid_choice');
+   const cands=(it.payload as {candidates?:unknown}|undefined)?.candidates;
+   if(!Array.isArray(cands)||!Number.isInteger(index)||index<0||index>=cands.length)throw new FactsDbError('invalid_choice');
+   const c=candidateOf(cands[index]);if(!c)throw new FactsDbError('invalid_candidate');
+   const market:Market=it.dataset===DATASETS.facts('US')?'US':'CN';const source=market==='US'?'edgar':'tushare';
+   const g=[...filings.values()].find(x=>x.source===source&&x.source_ref===c.filingRef);
+   if(!g||g.market!==market)throw new FactsDbError('filing_not_found');
+   const anchor=runIdOf(it);const r=anchor!==null&&UUID.test(anchor)?runs.get(anchor):undefined;
+   if(!r)throw new FactsDbError('generation_moved');
+   const gen=r.mapping_gen;const nkGen=Number(/:([0-9]+)$/.exec(String(it.natural_key))?.[1]??Number.NaN);
+   if(nkGen!==gen||g.mapping_gen!==gen||gen<=0||r.market!==g.market)throw new FactsDbError('generation_moved');
+   let versions=new Set([...facts.values()].filter(f=>f.run_id===r.run_id).map(f=>f.mapping_version));
+   if(versions.size===0)versions=new Set([...facts.values()].filter(f=>f.filing_id===g.filing_id&&f.mapping_gen===gen).map(f=>f.mapping_version));
+   if(versions.size!==1)throw new FactsDbError('replay_required');
+   const b=await batchRow(batchId);
+   if(!b||b.status!=='running'||b.dataset!==it.dataset)throw new FactsDbError('batch_mismatch');
+   const t=topoOf(g.issuer_id).merged_into??g.issuer_id;const lin=lineageMembers(t);
+   if(lin.some(i=>!scopeOf(i,g.market)))throw new FactsDbError('scope_missing');
+   if(!lin.includes(g.issuer_id)||topoOf(t).status!=='active')throw new FactsDbError('lineage_changed');
+   const s=scopeOf(g.issuer_id,g.market);if(!s)throw new FactsDbError('scope_missing');
+   if(s.state_rev!==expectedRev)throw new FactsDbError('stale_evaluation');
+   const k:KeyPart={concept:c.concept,period_start:c.periodStart,period_end:c.periodEnd,consolidation:c.consolidation,unit:c.unit};
+   if([...facts.values()].some(f=>f.issuer_id===g.issuer_id&&keyOf(f)===keyOf(k)&&f.filing_id===g.filing_id&&f.mapping_gen===gen))throw new FactsDbError('duplicate');
+   const open=await items({status:'open'});
+   const okClash=[...facts.values()].some(f=>lin.includes(f.issuer_id)&&f.market===g.market&&f.status==='ok'&&visible(f)&&keyOf(f)===keyOf(k)&&f.available_date===g.available_date&&!numericEquals(f.value,c.value));
+   const disputed=open.some(i=>i.reason_code==='same_day_conflict'&&disputesKey(i,lin,g.market,k,g.available_date))
+    ||open.some(i=>i.reason_code==='lineage_conflict'&&i.natural_key===`${t}:${factKey(k)}:${g.available_date}`);
+   if(okClash||disputed)throw new FactsDbError('conflict_exists');
+   const run_id=randomUUID(),fact_id=randomUUID(),t0=now();
+   runs.set(run_id,{run_id,issuer_id:g.issuer_id,market:g.market,batch_id:batchId,mapping_gen:gen,status:'published',manifest:[],started_at:t0,published_at:t0});
+   facts.set(fact_id,{fact_id,issuer_id:g.issuer_id,market:g.market,filing_id:g.filing_id,run_id,concept:c.concept,source_concept:c.sourceConcept,statement:c.statement,period_start:c.periodStart,period_end:c.periodEnd,duration:c.duration,
+    value:c.value,value_text:c.value,unit:c.unit,consolidation:c.consolidation,available_date:g.available_date,mapping_gen:gen,mapping_version:[...versions][0],status:'ok',raw_hash:c.rawHash,created_at:stamp()});
+   await tables.update('dq_quarantine',{id:itemId,status:'open'},{status:'resolved_accept',resolved_by:resolvedBy,resolved_at:t0,
+    detail:{...detailOf(it),chosen_candidate_index:index,adopted_fact_id:fact_id,run_id,issuer_id:g.issuer_id,market:g.market,batch_id:batchId,hook:{stage:'materialize',state:'pending',at:t0}}});
+   bump(g.issuer_id,g.market);
+   return {factId:fact_id,runId:run_id,issuerId:g.issuer_id,market:g.market};
+  },
+  async restoreReconciled(itemId,batchId,hashNow,resolvedBy){
+   if(!resolvedBy)throw unknown('invalid_resolver');
+   const [it]=await tables.select('dq_quarantine',{id:itemId},{limit:1});
+   if(!it||it.status!=='open'||it.table_name!=='financial_facts'||it.reason_code!=='reconcile_mismatch')throw new FactsDbError('item_not_open');
+   const b=await batchRow(batchId);if(!b||b.status!=='running')throw new FactsDbError('batch_mismatch');
+   const latest=(detailOf(it).latest_result??{}) as {passed?:unknown;inputs_hash?:unknown};
+   if(latest.passed!==true||!hashNow||latest.inputs_hash!==hashNow)throw new FactsDbError('not_passing');
+   const ids=idsOf(it);
+   const first=ids.map(id=>facts.get(id)).filter((f):f is FactRow=>!!f).sort((a,b)=>cmp(a.fact_id,b.fact_id))[0];
+   const d=detailOf(it);
+   const issuer=first?.issuer_id??(typeof d.issuer_id==='string'&&UUID.test(d.issuer_id)?d.issuer_id:null);
+   const market=(first?.market??d.market) as Market;
+   const t0=now();
+   await tables.update('dq_quarantine',{id:itemId,status:'open'},{status:'resolved_accept',resolved_by:resolvedBy,resolved_at:t0,detail:{...d,restored_by_batch:batchId,chosen_fact_ids:ids,hook:{stage:'materialize',state:'pending',at:t0}}});
+   const before=new Set(ids.filter(id=>facts.get(id)?.status==='quarantined'));
+   let promoted=0;
+   if(issuer!==null){promoted=await promote(issuer,market,ids);bump(issuer,market);}
+   const skipped=[...ids].sort(cmp).flatMap(id=>{const f=facts.get(id);if(!f)return [{fact_id:id,reason:'missing'}];if(!before.has(id))return [{fact_id:id,reason:'not_quarantined'}];return f.status==='ok'?[]:[{fact_id:id,reason:'ineligible'}];});
+   return {promoted,skipped};
+  },
+  async resolveLineageConflict(itemId,keep,batchId,resolvedBy){
+   if(!resolvedBy)throw unknown('invalid_resolver');
+   const [it]=await tables.select('dq_quarantine',{id:itemId},{limit:1});
+   if(!it||it.status!=='open')throw new FactsDbError('item_not_open');
+   if(it.table_name!=='financial_facts'||it.reason_code!=='lineage_conflict'||(it.dataset!==DATASETS.facts('US')&&it.dataset!==DATASETS.facts('CN')))throw new FactsDbError('invalid_choice');
+   const b=await batchRow(batchId);if(!b||b.status!=='running')throw new FactsDbError('batch_mismatch');
+   const parts=String(it.natural_key).split(':');
+   if(parts.length!==7)throw new FactsDbError('invalid_choice');
+   const [t,concept,ps,pe,cons,unit,date]=parts;
+   if(!UUID.test(t)||(ps!==''&&!isDate(ps))||!isDate(pe)||!isDate(date))throw new FactsDbError('invalid_choice');
+   const market:Market=it.dataset===DATASETS.facts('US')?'US':'CN';
+   const lin=lineageMembers(t);
+   if(lin.some(i=>!scopeOf(i,market)))throw new FactsDbError('scope_missing');
+   if(topoOf(t).status!=='active')throw new FactsDbError('target_not_active');
+   const ids=idsOf(it);
+   if(!ids.includes(keep))throw new FactsDbError('invalid_choice');
+   if(ids.some(id=>{const f=facts.get(id);return !!f&&!lin.includes(f.issuer_id);}))throw new FactsDbError('lineage_changed');
+   const k:KeyPart={concept,period_start:ps===''?null:ps,period_end:pe,consolidation:cons,unit};
+   const hit=[...facts.values()].filter(f=>lin.includes(f.issuer_id)&&f.market===market&&f.status==='ok'&&visible(f)&&keyOf(f)===keyOf(k)&&f.available_date===date);
+   if(!hit.some(f=>f.fact_id===keep))throw new FactsDbError('unresolved');                     // the kept row must be the one visible ok row left; nothing written
+   const others=hit.filter(f=>f.fact_id!==keep);
+   for(const f of others)f.status='quarantined';
+   const t0=now();
+   await tables.update('dq_quarantine',{id:itemId,status:'open'},{status:'resolved_accept',resolved_by:resolvedBy,resolved_at:t0,
+    detail:{...detailOf(it),chosen_fact_ids:[keep],quarantined_fact_ids:others.map(f=>f.fact_id).sort(cmp),issuer_id:t,market,batch_id:batchId,hook:{stage:'materialize',state:'pending',at:t0}}});
+   for(const i of lin)bump(i,market);
+   return {quarantined:others.length};
+  },
+  async claimReconcileMember(pair,cycleId,issuer,market,batchId){
+   const key={pair,cycle_id:cycleId,issuer_id:issuer,market};
+   const [c]=await tables.select('dq_reconcile_cursor',key,{limit:1});
+   const [y]=await tables.select('dq_reconcile_cycles',{pair,cycle_id:cycleId},{limit:1});
+   if(!c||!y||y.status!=='running')return null;
+   const t=now();const attempts=Number(c.attempts);
+   const claimable=c.state==='pending'||(c.state==='claimed'&&typeof c.claim_until==='string'&&c.claim_until<t)||(c.state==='failed'&&attempts<3);
+   if(!claimable)return null;
+   await tables.update('dq_reconcile_cursor',key,{state:'claimed',claimed_by:batchId,claim_until:new Date(Date.parse(t)+600_000).toISOString(),attempts:attempts+1,last_error:null});
+   return {pair,cycle_id:cycleId,issuer_id:issuer,market,batch_id:batchId,attempt:attempts+1};
+  },
+  async applyReconcileResult(fence,r){
+   const c=await fenceLock(fence);
+   if(!validResult(r))throw new FactsDbError('invalid_result');
+   const frozen=await frozenKeys(fence);
+   if(frozen===null||!frozen.includes(r.natural_key))throw new FactsDbError('invalid_result');   // the key must belong to the member's frozen expected set
+   const [existing]=await tables.select('dq_reconciliations',{pair:fence.pair,cycle_id:fence.cycle_id,natural_key:r.natural_key},{limit:1});
+   if(existing){
+    if(existing.issuer_id!==fence.issuer_id||existing.market!==fence.market)throw new FactsDbError('invalid_result');
+    const d=detailOf(existing);return {reused:true,reconciliationId:String(existing.id),itemId:typeof d.item_id==='string'?d.item_id:null,quarantined:0,materialize:null};
+   }
+   const rid=randomUUID();const t0=now();const dataset=DATASETS.facts(fence.market);
+   const latest={passed:r.passed,reconciliation_id:rid,at:t0,inputs_hash:r.inputs_hash??null};
+   const f=r.left_fact_id===undefined?undefined:facts.get(r.left_fact_id);
+   if(r.left_fact_id!==undefined&&(!f||f.issuer_id!==fence.issuer_id||f.market!==fence.market))throw new FactsDbError('invalid_result');
+   let itemId:string|null=null;let quarantined:0|1=0;let mat:ApplyReconcileOutcome['materialize']=null;
+   // a failing compare on a published left row that is ok OR already quarantined opens the reconcile_mismatch item (so a later
+   // generic promotion stays blocked); only an ok row changes visibility
+   if(r.action==='quarantine_left'&&r.outcome==='compared'&&r.passed===false&&f&&(f.status==='ok'||f.status==='quarantined')&&runs.get(f.run_id)?.status==='published'){
+    const nk=`${fence.pair}:${r.natural_key}:${f.fact_id}`;
+    if(nk.length>512)throw new FactsDbError('invalid_result');
+    const [hit]=await tables.select('dq_quarantine',{dataset,table_name:'financial_facts',natural_key:nk,reason_code:'reconcile_mismatch',status:'open'},{limit:1});
+    const wasOk=f.status==='ok';
+    const hook={stage:'materialize',state:'pending',at:t0};
+    if(hit){itemId=String(hit.id);await tables.update('dq_quarantine',{id:itemId},{detail:{...detailOf(hit),reconciliation_id:rid,latest_result:latest,...(wasOk?{hook}:{})}});}
+    else{
+     itemId=randomUUID();
+     await tables.insert('dq_quarantine',{id:itemId,dataset,table_name:'financial_facts',natural_key:nk,reason_code:'reconcile_mismatch',
+      detail:{pair:fence.pair,reconciliation_id:rid,inputs_hash:r.inputs_hash??null,latest_result:latest,issuer_id:fence.issuer_id,market:fence.market,...(wasOk?{hook}:{})},
+      payload:{key:{issuer_id:f.issuer_id,market:f.market,concept:f.concept,period_start:f.period_start,period_end:f.period_end,consolidation:f.consolidation,unit:f.unit,available_date:f.available_date},
+       fact_ids:[f.fact_id],left_value:r.left_value,right_value:r.right_value,right_locator:(r.detail.right as {locator?:unknown}|undefined)?.locator??null},
+      batch_id:fence.batch_id,status:'open',resolved_by:null,resolved_at:null,created_at:t0});
+    }
+    if(wasOk){f.status='quarantined';quarantined=1;bump(fence.issuer_id,fence.market);mat={issuerId:fence.issuer_id,market:fence.market};}
+   }else if(f&&f.status==='quarantined'&&r.outcome==='compared'){
+    const hits=(await items({status:'open',reason_code:'reconcile_mismatch'})).filter(i=>detailOf(i).pair===fence.pair&&idsOf(i).includes(f.fact_id)).sort((a,b)=>cmp(String(a.id),String(b.id)));
+    for(const i of hits)await tables.update('dq_quarantine',{id:String(i.id)},{detail:{...detailOf(i),latest_result:latest}});
+    itemId=hits[0]?String(hits[0].id):null;
+   }
+   if((r.action==='review_item'||r.action==='lineage_item')&&r.item){
+    const reason=r.action==='review_item'?'reconcile_review':'lineage_conflict';
+    const [hit]=await tables.select('dq_quarantine',{dataset,table_name:'financial_facts',natural_key:r.item.natural_key,reason_code:reason,status:'open'},{limit:1});
+    if(hit)itemId=String(hit.id);
+    else{
+     itemId=randomUUID();
+     await tables.insert('dq_quarantine',{id:itemId,dataset,table_name:'financial_facts',natural_key:r.item.natural_key,reason_code:reason,
+      detail:{...(r.item.detail??{}),pair:fence.pair,reconciliation_id:rid,issuer_id:fence.issuer_id,market:fence.market},payload:r.item.payload,
+      batch_id:fence.batch_id,status:'open',resolved_by:null,resolved_at:null,created_at:t0});
+    }
+   }
+   await tables.insert('dq_reconciliations',{id:rid,dataset:`reconcile.${fence.pair}`,left_source:r.left_source,right_source:r.right_source,natural_key:r.natural_key,left_value:r.left_value,right_value:r.right_value,
+    abs_diff:r.abs_diff,rel_diff:r.rel_diff,tolerance:r.tolerance,passed:r.passed,batch_id:fence.batch_id,pair:fence.pair,kind:r.kind,outcome:r.outcome,detail:{...r.detail,item_id:itemId,inputs_hash:r.inputs_hash??null},
+    cycle_id:fence.cycle_id,issuer_id:fence.issuer_id,market:fence.market,attempt:Number(c.attempts),created_at:t0});
+   return {reused:false,reconciliationId:rid,itemId,quarantined,materialize:mat};
+  },
+  async completeReconcileMember(fence){
+   const c=await fenceLock(fence);
+   const rows=await tables.select('dq_reconciliations',{pair:fence.pair,cycle_id:fence.cycle_id,issuer_id:fence.issuer_id,market:fence.market});
+   const counts={compared_passed:rows.filter(x=>x.outcome==='compared'&&x.passed===true).length,compared_failed:rows.filter(x=>x.outcome==='compared'&&x.passed!==true).length,not_compared:rows.filter(x=>x.outcome!=='compared').length};
+   if(counts.compared_passed+counts.compared_failed+counts.not_compared!==Number(c.expected))throw new FactsDbError('member_incomplete');
+   // exact coverage of the frozen key set: every frozen key has an accepted result and nothing else does
+   const keys=await frozenKeys(fence);const have=new Set(rows.map(x=>String(x.natural_key)));
+   if(keys===null||keys.some(k=>!have.has(k))||[...have].some(k=>!keys.includes(k)))throw new FactsDbError('member_incomplete');
+   await tables.update('dq_reconcile_cursor',cursorKey(fence),{state:'done',done_at:now(),claim_until:null,...counts});
+   return counts;
+  },
+  async failReconcileMember(fence,error){
+   await fenceLock(fence);
+   await tables.update('dq_reconcile_cursor',cursorKey(fence),{state:'failed',claim_until:null,last_error:String(error??'unknown').slice(0,2000)});
+  },
+  // mirrors open_reconcile_cycle (plan audit Q2): running cycle → returned unchanged; else validate, insert
+  // the cycle row and one pending cursor per member, and remove exactly the listed pending entries.
+  async openReconcileCycle(i){
+   const cycles=await tables.select('dq_reconcile_cycles',{pair:i.pair});
+   const running=cycles.find(c=>c.status==='running');
+   if(running)return {created:false,cycle:running,transferred:[]};
+   const mk=(x:{issuer_id:unknown;market:unknown})=>`${String(x.issuer_id)}:${String(x.market)}`;
+   if(!Array.isArray(i.members)||!Array.isArray(i.pending)||i.members.some(m=>typeof m.issuer_id!=='string'||!UUID.test(m.issuer_id)||(m.market!=='US'&&m.market!=='CN')||!Array.isArray(m.expected_keys))
+    ||i.pending.some(p=>typeof p.source!=='string'))throw new FactsDbError('invalid_members');
+   // issuer ids are frozen as canonical (lower-case) uuid text
+   const members=i.members.map(m=>({...m,issuer_id:m.issuer_id.toLowerCase()}));
+   const memberKeys=new Set(members.map(mk));
+   const nks=members.flatMap(m=>m.expected_keys.map(k=>typeof k==='string'?k:(k as {naturalKey?:unknown}).naturalKey));
+   // natural keys are unique across the whole cycle (results are accepted per pair, cycle, natural key)
+   if(memberKeys.size!==members.length||nks.some(k=>typeof k!=='string')||new Set(nks).size!==nks.length
+    ||i.pending.some(p=>!memberKeys.has(mk({issuer_id:String(p.issuer_id).toLowerCase(),market:p.market}))))throw new FactsDbError('invalid_members');
+   const row={pair:i.pair,cycle_id:i.cycleId,started_at:i.startedAt,finished_at:null,members,status:'running',
+    expected_total:members.reduce((n,m)=>n+m.expected_keys.length,0),compared_passed:0,compared_failed:0,not_compared:0,exec_failed_members:0,detail:{}};
+   await tables.insert('dq_reconcile_cycles',row);
+   for(const m of members)await tables.insert('dq_reconcile_cursor',{pair:i.pair,cycle_id:i.cycleId,issuer_id:m.issuer_id,market:m.market,expected:m.expected_keys.length,state:'pending',claimed_by:null,claim_until:null,attempts:0,last_error:null,done_at:null,compared_passed:null,compared_failed:null,not_compared:null});
+   const listed=new Set(i.pending.map(pendingKey));
+   const from:string[]=[];const moved:PendingMember[]=[];
+   for(const c of [...cycles].sort((a,b)=>cmp(String(a.cycle_id),String(b.cycle_id)))){
+    const d=detailOf(c);if(!Array.isArray(d.pending_members))continue;
+    const list=d.pending_members as PendingMember[];
+    const take=list.filter(p=>listed.has(pendingKey(p)));if(take.length===0)continue;
+    await tables.update('dq_reconcile_cycles',{pair:i.pair,cycle_id:String(c.cycle_id)},{detail:{...d,pending_members:list.filter(p=>!listed.has(pendingKey(p))),pending_consumed_by:i.cycleId}});
+    from.push(String(c.cycle_id));moved.push(...take);
+   }
+   const detail={pending_merged_from:from,pending_transferred:moved};
+   await tables.update('dq_reconcile_cycles',{pair:i.pair,cycle_id:i.cycleId},{detail});
+   return {created:true,cycle:{...row,detail},transferred:moved};
+  },
+  async setMerge(source,target,resolvedBy){
+   if(!source||!target||source===target)throw unknown('invalid_merge');
+   if(!resolvedBy)throw unknown('invalid_resolver');
+   if(topoOf(source).status!=='active')throw new FactsDbError('source_not_active');
+   if(topoOf(target).status!=='active')throw unknown('merge_target_not_active');
+   const set=[...new Set([source,target,...referrers(source),...referrers(target)])];
+   for(const i of set)for(const m of MARKETS)ensureScope(i,m);
+   const refs=referrers(source);
+   for(const r of refs)topo.set(r,{...topoOf(r),merged_into:target});
+   topo.set(source,{status:'merged',merged_into:target});
+   for(const i of set)for(const m of MARKETS)bump(i,m);
+   await registerPending(target,source);
+   return {repointed:refs.length};
+  },
+  async setDissolved(issuer,resolvedBy){
+   if(!resolvedBy)throw unknown('invalid_resolver');
+   if(referrers(issuer).length>0)throw new FactsDbError('has_referrers');
+   if(topoOf(issuer).status!=='active')throw new FactsDbError('source_not_active');
+   for(const m of MARKETS)ensureScope(issuer,m);
+   topo.set(issuer,{status:'dissolved',merged_into:null});
+   for(const m of MARKETS)bump(issuer,m);
+  },
  };
  // Every FactsDb method (reads included) runs through one promise chain per instance, so no operation
  // observes or interleaves with another's partial writes across awaits (SQL: one transaction each).

exec
/bin/zsh -lc "git show 0bf3b19 -- src/lib/facts/db.test.ts src/lib/facts/db-contract.ts; ls supabase/migrations | tail; find . -name '*AGENTS*' -not -path './node_modules/*'; cat .codex/config.toml 2>/dev/null" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 37ms:
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-NHPfneuh' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-UmAO4ltu' (errno=Operation not permitted)
commit 0bf3b19e8362ec0ee9141d7f61416553a9c85f2b
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 02:43:53 2026 -0800

    feat(facts): FactsDb plan-3 extension in all three implementations (lineage, acceptance, adoption, restore, cursor, topology) (F3-4)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/facts/db-contract.ts b/src/lib/facts/db-contract.ts
index ae7d487..891a541 100644
--- a/src/lib/facts/db-contract.ts
+++ b/src/lib/facts/db-contract.ts
@@ -185,7 +185,7 @@ export function factsDbContract(label:string,setup:()=>Promise<ContractHarness>)
    const run=await db.beginRun(iss,'US',b,1);
    expect((await code(db.stageFilings(run,[filingInsert(iss,{filing_id:f.filing_id})]))).startsWith('duplicate_key')).toBe(true);
    await db.abandonRun(run);
-   const row=(v:string):MetricRow=>({issuer_id:iss,market:'US',metric:'gross_margin',period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:v,unit:'ratio',input_unit:'USD',basis:'us_standard',formula_version:'facts-derive/1.0',inputs:[{fact_id:r,concept:'revenue',filing_id:'f',available_date:'2024-02-01'}],based_on_rev:0,as_of:'2024-03-01'});
+   const row=(v:string):MetricRow=>({issuer_id:iss,market:'US',metric:'gross_margin',period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:v,unit:'ratio',input_unit:'USD',basis:'us_standard',formula_version:'facts-derive/1.0',inputs:[{fact_id:r,concept:'revenue',filing_id:'f',available_date:'2024-02-01'}],based_on_rev:0,based_on_lineage:[{issuer_id:iss,state_rev:0}],as_of:'2024-03-01'});
    expect(await db.replaceMetrics(iss,'US',1,[row('0.5')])).toBe(1);
    expect((await code(db.replaceMetrics(iss,'US',1,[row('0.6'),row('0.7')]))).startsWith('duplicate_key')).toBe(true);
    expect((await db.metricsOfIssuer(iss,'US','facts-derive/1.0')).map(m=>m.value)).toEqual(['0.5']);
@@ -212,7 +212,7 @@ export function factsDbContract(label:string,setup:()=>Promise<ContractHarness>)
 
   it('metrics: stale based_on_rev is refused after publish; replacement is per issuer and atomic; metricsOfIssuer filters by formula version',async()=>{
    const {iss,b,r}=await published();
-   const row=(v:string,metric='gross_margin'):MetricRow=>({issuer_id:iss,market:'US',metric,period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:v,unit:'ratio',input_unit:'USD',basis:'us_standard',formula_version:'facts-derive/1.0',inputs:[{fact_id:r,concept:'revenue',filing_id:'f',available_date:'2024-02-01'}],based_on_rev:0,as_of:'2024-03-01'});
+   const row=(v:string,metric='gross_margin'):MetricRow=>({issuer_id:iss,market:'US',metric,period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:v,unit:'ratio',input_unit:'USD',basis:'us_standard',formula_version:'facts-derive/1.0',inputs:[{fact_id:r,concept:'revenue',filing_id:'f',available_date:'2024-02-01'}],based_on_rev:0,based_on_lineage:[{issuer_id:iss,state_rev:0}],as_of:'2024-03-01'});
    expect(await code(db.replaceMetrics(iss,'US',0,[row('0.5')]))).toBe('stale_computation:stale_computation');
    expect(await db.replaceMetrics(iss,'US',1,[row('0.5')])).toBe(1);
    const run=await db.beginRun(iss,'US',b,1);expect(await db.publishRun(run,[])).toBe(0);   // empty run still advances state_rev
@@ -347,7 +347,7 @@ export function factsDbContract(label:string,setup:()=>Promise<ContractHarness>)
    expect((await db.filingsOfIssuer(iss,'US',{limit:5})).length).toBe(5);
    expect((await db.filingsOfIssuer(iss,'US',{from:'2020-01-01',to:'2020-01-01'})).length).toBe(1001);
    const rev=(await current(iss)).stateRev;
-   const rows=Array.from({length:1001},(_,i):MetricRow=>({issuer_id:iss,market:'US',metric:`m${String(i).padStart(4,'0')}`,period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:String(i),unit:'ratio',input_unit:'USD',basis:'us_standard',formula_version:'facts-derive/1.0',inputs:[{fact_id:r,concept:'revenue',filing_id:'f',available_date:'2024-02-01'}],based_on_rev:rev,as_of:'2024-03-01'}));
+   const rows=Array.from({length:1001},(_,i):MetricRow=>({issuer_id:iss,market:'US',metric:`m${String(i).padStart(4,'0')}`,period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:String(i),unit:'ratio',input_unit:'USD',basis:'us_standard',formula_version:'facts-derive/1.0',inputs:[{fact_id:r,concept:'revenue',filing_id:'f',available_date:'2024-02-01'}],based_on_rev:rev,based_on_lineage:[{issuer_id:iss,state_rev:rev}],as_of:'2024-03-01'}));
    expect(await db.replaceMetrics(iss,'US',rev,rows)).toBe(1001);
    const got=await db.metricsOfIssuer(iss,'US','facts-derive/1.0');
    expect(got.length).toBe(1001);expect(got.at(-1)).toMatchObject({metric:'m1000',value:'1000'});
diff --git a/src/lib/facts/db.test.ts b/src/lib/facts/db.test.ts
index 7c5a971..72d2588 100644
--- a/src/lib/facts/db.test.ts
+++ b/src/lib/facts/db.test.ts
@@ -82,6 +82,11 @@ describe('toFactsDbError',()=>{
   expect(toFactsDbError({message:'item_not_open',code:'P0001'})).toMatchObject({code:'item_not_open',message:'item_not_open'});
   expect(toFactsDbError({message:undefined,code:undefined}).code).toBe('unknown');
   expect(toFactsDbError({message:'x'})).toBeInstanceOf(FactsDbError);
+  for(const c of ['fence_failed','member_incomplete','stale_evaluation','batch_mismatch','invalid_choice','invalid_candidate','generation_moved','duplicate','conflict_exists','replay_required','filing_not_found','not_passing','lineage_changed','scope_missing','unresolved','acceptance_conflict','source_not_active','has_referrers','invalid_result'])
+   expect(toFactsDbError({message:c,code:'P0001'}).code).toBe(c);
+  expect(toFactsDbError({message:'topology_write_forbidden: issuers.status/merged_into change only through set_merge/set_dissolved',code:'23514'}).code).toBe('topology_write_forbidden');
+  expect(toFactsDbError({message:'duplicate key value violates unique constraint "x"',code:'23505'}).code).toBe('duplicate_key');   // 23505 wins over the head word
+  expect(toFactsDbError({message:'invalid_based_on',code:'22023'})).toMatchObject({code:'unknown',message:'invalid_based_on'});
  });
 });
 
@@ -181,7 +186,7 @@ describe('supabaseFactsDb',()=>{
   expect(calls.at(-1)).toEqual({fn:'release_fact_sync_lease',args:{p_issuer:iss,p_market:'US',p_batch:'b',p_outcome:'success',p_next_due:'2030-01-01T00:00:00.000Z'}});
   await db.resolveFactsQuarantine('item',['a'],'admin');
   expect(calls.at(-1)).toEqual({fn:'resolve_facts_quarantine',args:{p_item:'item',p_chosen:['a'],p_resolved_by:'admin'}});
-  await db.replaceMetrics(iss,'US',3,[{issuer_id:iss,market:'US',metric:'m',period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:'1',unit:'u',input_unit:'USD',basis:'us_standard',formula_version:'v',inputs:[],based_on_rev:3,as_of:'2024-01-01'}]);
+  await db.replaceMetrics(iss,'US',3,[{issuer_id:iss,market:'US',metric:'m',period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:'1',unit:'u',input_unit:'USD',basis:'us_standard',formula_version:'v',inputs:[],based_on_rev:3,based_on_lineage:[{issuer_id:iss,state_rev:3}],as_of:'2024-01-01'}]);
   expect(calls.at(-1)!.args).toEqual({p_issuer:iss,p_market:'US',p_based_on_rev:3,p_rows:[{metric:'m',period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:'1',unit:'u',input_unit:'USD',basis:'us_standard',formula_version:'v',inputs:[],as_of:'2024-01-01'}]});
  });
  it('stageFilings treats a source_ref missing from the returned map (owned by another issuer) as an error',async()=>{
@@ -207,4 +212,111 @@ describe('supabaseFactsDb',()=>{
   await db.publishRun('r',['f']);await db.publishRun('r',['f'],4);
   expect(calls.map(c=>c.args)).toEqual([{p_run:'r',p_manifest:['f'],p_expected_rev:null},{p_run:'r',p_manifest:['f'],p_expected_rev:4}]);
  });
+ it('plan-3 RPCs: names and p_ arguments; envelopes normalised (lineage revs sorted and numeric, value from value_text, ISO timestamps)',async()=>{
+  const I1='11111111-1111-4111-8111-111111111111',I2='22222222-2222-4222-8222-222222222222';
+  const {calls,db}=stub(fn=>{
+   if(fn==='read_facts_lineage')return {data:{state_revs:[{issuer_id:I2,state_rev:'4'},{issuer_id:I1,state_rev:3}],lineage:[I1,I2],truncated:false,row_count:1,rows:[{fact_id:'a',issuer_id:I2,value:7,value_text:'7.0',disclosure_seq:null,is_current:false,is_revision:false}],conflicts:[{key:{concept:'revenue'},available_date:'2024-02-01',fact_ids:['x','y']}]}};
+   if(fn==='read_filing_facts')return {data:{rows:[{fact_id:'f',value:1,value_text:'1.50',run_status:'published',created_at:'2024-01-01 00:00:00+00'}]}};
+   if(fn==='adopt_candidate')return {data:{fact_id:'nf',run_id:'nr',issuer_id:I1,market:'US'}};
+   if(fn==='restore_reconciled')return {data:{promoted:'0',skipped:[{fact_id:'f',reason:'ineligible'}]}};
+   if(fn==='resolve_lineage_conflict')return {data:{quarantined:2}};
+   if(fn==='claim_reconcile_member')return {data:null};
+   if(fn==='apply_reconcile_result')return {data:{reused:false,reconciliation_id:'r1',item_id:null,quarantined:1,materialize:{issuer_id:I1,market:'US'}}};
+   if(fn==='complete_reconcile_member')return {data:{compared_passed:1,compared_failed:'0',not_compared:2}};
+   if(fn==='set_merge')return {data:{repointed:'1'}};
+   if(fn==='open_reconcile_cycle')return {data:{created:true,cycle:{pair:'facts.lineage_same_day',cycle_id:'c'},transferred:[{issuer_id:I1,market:'US',source:I2}]}};
+   if(fn==='set_filing_acceptance')return {data:true};
+   if(fn==='replace_financial_metrics_lineage')return {data:3};
+   return {data:null};
+  });
+  expect(await db.readFactsLineage([I2,I1],'US',{concepts:['revenue'],asOf:'2030-01-01',history:true})).toEqual({stateRevs:[{issuer_id:I1,state_rev:3},{issuer_id:I2,state_rev:4}],lineage:[I1,I2],
+   rows:[{fact_id:'a',issuer_id:I2,value:'7.0',value_text:'7.0',disclosure_seq:undefined,is_current:false,is_revision:false}],conflicts:[{key:{concept:'revenue'},available_date:'2024-02-01',fact_ids:['x','y']}],truncated:false});
+  expect(calls.at(-1)).toEqual({fn:'read_facts_lineage',args:{p_issuers:[I2,I1],p_market:'US',p_concepts:['revenue'],p_as_of:'2030-01-01',p_from:null,p_to:null,p_history:true,p_limit:null,p_include_non_ok:false}});
+  expect(await db.stateRevs([I1,I2],'US')).toEqual([{issuer_id:I1,state_rev:3},{issuer_id:I2,state_rev:4}]);
+  expect(calls.at(-1)!.args).toMatchObject({p_issuers:[I1,I2],p_concepts:[]});              // revs only: one snapshot, no rows
+  expect(await db.stateRevs([],'US')).toEqual([]);
+  expect(await db.readFilingFacts('g',true)).toEqual([{fact_id:'f',value:'1.50',value_text:'1.50',run_status:'published',created_at:'2024-01-01T00:00:00.000Z'}]);
+  expect(calls.at(-1)).toEqual({fn:'read_filing_facts',args:{p_filing:'g',p_include_non_ok:true}});
+  expect(await db.adoptCandidate('it',2,'b',5,'adm')).toEqual({factId:'nf',runId:'nr',issuerId:I1,market:'US'});
+  expect(calls.at(-1)).toEqual({fn:'adopt_candidate',args:{p_item:'it',p_index:2,p_batch:'b',p_expected_rev:5,p_resolved_by:'adm'}});
+  expect(await db.restoreReconciled('it','b','h','adm')).toEqual({promoted:0,skipped:[{fact_id:'f',reason:'ineligible'}]});
+  expect(calls.at(-1)).toEqual({fn:'restore_reconciled',args:{p_item:'it',p_batch:'b',p_inputs_hash_now:'h',p_resolved_by:'adm'}});
+  expect(await db.resolveLineageConflict('it','k','b','adm')).toEqual({quarantined:2});
+  expect(calls.at(-1)).toEqual({fn:'resolve_lineage_conflict',args:{p_item:'it',p_keep:'k',p_batch:'b',p_resolved_by:'adm'}});
+  expect(await db.claimReconcileMember('us.companyfacts_vs_ixbrl','c1',I1,'US','b')).toBeNull();
+  expect(calls.at(-1)).toEqual({fn:'claim_reconcile_member',args:{p_pair:'us.companyfacts_vs_ixbrl',p_cycle_id:'c1',p_issuer:I1,p_market:'US',p_batch:'b'}});
+  const fence={pair:'us.companyfacts_vs_ixbrl' as const,cycle_id:'c1',issuer_id:I1,market:'US' as const,batch_id:'b',attempt:1};
+  const result={natural_key:'k',kind:'numeric' as const,outcome:'compared' as const,passed:false,left_value:'1',right_value:'2',abs_diff:'1',rel_diff:'0.5',tolerance:'0',left_source:'l',right_source:'r',detail:{},action:'quarantine_left' as const,left_fact_id:'f',inputs_hash:'h'};
+  expect(await db.applyReconcileResult(fence,result)).toEqual({reused:false,reconciliationId:'r1',itemId:null,quarantined:1,materialize:{issuerId:I1,market:'US'}});
+  expect(calls.at(-1)).toEqual({fn:'apply_reconcile_result',args:{p_fence:fence,p_result:result}});
+  expect(await db.completeReconcileMember(fence)).toEqual({compared_passed:1,compared_failed:0,not_compared:2});
+  await db.failReconcileMember(fence,'boom');
+  expect(calls.at(-1)).toEqual({fn:'fail_reconcile_member',args:{p_fence:fence,p_error:'boom'}});
+  const open={pair:'facts.lineage_same_day' as const,cycleId:'c',startedAt:'2026-11-05T00:00:00.000Z',members:[{issuer_id:I1,market:'US' as const,expected_keys:[]}],pending:[{issuer_id:I1,market:'US' as const,source:I2}]};
+  expect(await db.openReconcileCycle(open)).toEqual({created:true,cycle:{pair:'facts.lineage_same_day',cycle_id:'c'},transferred:[{issuer_id:I1,market:'US',source:I2}]});
+  expect(calls.at(-1)).toEqual({fn:'open_reconcile_cycle',args:{p_pair:'facts.lineage_same_day',p_cycle_id:'c',p_started_at:'2026-11-05T00:00:00.000Z',p_members:open.members,p_pending:open.pending}});
+  expect(await db.setMerge('s','t','adm')).toEqual({repointed:1});
+  expect(calls.at(-1)).toEqual({fn:'set_merge',args:{p_source:'s',p_target:'t',p_resolved_by:'adm'}});
+  await db.setDissolved('s','adm');
+  expect(calls.at(-1)).toEqual({fn:'set_dissolved',args:{p_issuer:'s',p_resolved_by:'adm'}});
+  expect(await db.setFilingAcceptance('g','2024-02-01T21:05:00.000Z','sec_submissions')).toBe(true);
+  expect(calls.at(-1)).toEqual({fn:'set_filing_acceptance',args:{p_filing:'g',p_accepted:'2024-02-01T21:05:00.000Z',p_source:'sec_submissions'}});
+  const m={issuer_id:I1,market:'US' as const,metric:'m',period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M' as const,value:'1',unit:'u',input_unit:'USD',basis:'us_standard',formula_version:'v',inputs:[],based_on_rev:3,based_on_lineage:[{issuer_id:I1,state_rev:3}],as_of:'2024-01-01'};
+  expect(await db.replaceMetricsLineage(I1,'US',[{issuer_id:I1,state_rev:3}],[m])).toBe(3);
+  expect(calls.at(-1)).toEqual({fn:'replace_financial_metrics_lineage',args:{p_issuer:I1,p_market:'US',p_based_on:[{issuer_id:I1,state_rev:3}],p_rows:[{metric:'m',period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:'1',unit:'u',input_unit:'USD',basis:'us_standard',formula_version:'v',inputs:[],as_of:'2024-01-01'}]}});
+ });
+ it('plan-3 table reads: targetOf, lineageOf (target first, referrers ordered), findFilingBySourceRef, filingsForCalendar (complete set with run status, accepted_at ISO)',async()=>{
+  const {db}=stub(()=>({data:null}),(table,ops)=>{
+   if(table==='issuers'&&ops.some(o=>o[0]==='eq'&&o[1][0]==='issuer_id'))return [{merged_into:'T'}];
+   if(table==='issuers')return [{issuer_id:'A'},{issuer_id:'B'}];
+   if(table==='filings'&&ops.some(o=>o[0]==='eq'&&o[1][0]==='source_ref'))return [{filing_id:'g',accepted_at:'2024-02-01T21:05:00+00:00',acceptance_source:'sec_submissions',created_at:'2024-02-01T00:00:00+00:00'}];
+   if(table==='filings')return [{filing_id:'g1',run_id:'r1',period_end:'2024-03-31',accepted_at:null,created_at:'2024-02-01T00:00:00+00:00'}];
+   if(table==='fact_sync_runs')return [{run_id:'r1',status:'published'}];
+   return [];
+  });
+  expect(await db.targetOf('S')).toBe('T');
+  expect(await db.lineageOf('T')).toEqual(['T','A','B']);
+  expect(await db.findFilingBySourceRef('edgar','0000320193-24-000123')).toMatchObject({filing_id:'g',accepted_at:'2024-02-01T21:05:00.000Z',acceptance_source:'sec_submissions'});
+  expect(await db.filingsForCalendar('I','US',{fromPeriodEnd:'2024-01-01'})).toEqual([expect.objectContaining({filing_id:'g1',run_status:'published',accepted_at:null,acceptance_source:null})]);
+ });
+ it('metrics read compares the full based_on_lineage vector across pages: one rev but two vectors is unstable',async()=>{
+  const row=(i:number,lineage:unknown)=>({issuer_id:'iss',market:'US',metric:`m${String(i).padStart(4,'0')}`,period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:1,value_text:'1',unit:'u',input_unit:'USD',basis:'us_standard',formula_version:'v',inputs:[],based_on_rev:2,based_on_lineage:lineage,as_of:'2024-01-01'});
+  const a=[{issuer_id:'iss',state_rev:2}],b=[{issuer_id:'iss',state_rev:2},{issuer_id:'src',state_rev:5}];
+  const {db}=stub(()=>({data:null}),(_t,ops)=>{const [from,to]=ops.find(o=>o[0]==='range')![1] as [number,number];return Array.from({length:Math.min(1001,to+1)-from},(_,k)=>row(from+k,from+k<1000?a:b));},()=>1001);
+  await expect(db.metricsOfIssuer('iss','US','v')).rejects.toMatchObject({message:'metrics_unstable'});
+  const ok=stub(()=>({data:null}),(_t,ops)=>{const [from,to]=ops.find(o=>o[0]==='range')![1] as [number,number];return Array.from({length:Math.min(2,to+1)-from},(_,k)=>row(from+k,b));},()=>2);
+  expect((await ok.db.metricsOfIssuer('iss','US','v')).map(m=>m.based_on_lineage)).toEqual([[{issuer_id:'iss',state_rev:2},{issuer_id:'src',state_rev:5}],[{issuer_id:'iss',state_rev:2},{issuer_id:'src',state_rev:5}]]);
+ });
+});
+
+describe('memoryFactsDb plan-3 specifics',()=>{
+ it('topology helper, targetOf, stateRevs order; setMerge registers the target on the latest lineage cycle; the plan-2 wrapper keeps "no scope ⇒ rev 0"',async()=>{
+  const db=memoryFactsDb();const [a,b,c]=['a','b','c'].map(x=>`${x}0000000-0000-4000-8000-000000000000`);
+  db.setTopology({[a]:{status:'merged',merged_into:c},[b]:{status:'merged',merged_into:c}});
+  expect(await db.lineageOf(c)).toEqual([c,a,b]);expect(await db.targetOf(a)).toBe(c);expect(await db.targetOf(c)).toBe(c);expect(await db.targetOf('unknown')).toBe('unknown');
+  expect(await db.stateRevs([c,a,a],'US')).toEqual([{issuer_id:a,state_rev:0},{issuer_id:c,state_rev:0}]);
+  await db.tables.insert('dq_reconcile_cycles',{pair:'facts.lineage_same_day',cycle_id:'old',status:'complete',started_at:'2026-01-01T00:00:00.000Z',detail:{}});
+  await db.tables.insert('dq_reconcile_cycles',{pair:'facts.lineage_same_day',cycle_id:'new',status:'complete',started_at:'2026-02-01T00:00:00.000Z',detail:{pending_members:[{issuer_id:c,market:'US',source:'earlier-source'}]}});
+  const s=`d0000000-0000-4000-8000-000000000000`;
+  expect(await db.setMerge(s,c,'adm')).toEqual({repointed:0});
+  const cycles=await db.tables.select('dq_reconcile_cycles',{pair:'facts.lineage_same_day'});
+  expect(cycles.find(x=>x.cycle_id==='new')!.detail).toEqual({pending_members:[{issuer_id:c,market:'US',source:'earlier-source'},{issuer_id:c,market:'CN',source:s},{issuer_id:c,market:'US',source:s}]});   // one entry per merged source (plan audit Q2)
+  expect(cycles.find(x=>x.cycle_id==='old')!.detail).toEqual({});
+  expect(db.scope().filter(x=>x.issuer_id===s).map(x=>[x.market,x.priority,x.fetch_key,x.state_rev]).sort()).toEqual([['CN',0,'topology',1],['US',0,'topology',1]]);
+  const m={issuer_id:'z',market:'US' as const,metric:'m',period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M' as const,value:'1',unit:'u',input_unit:'USD',basis:'us_standard',formula_version:'v',inputs:[],based_on_rev:0,based_on_lineage:[{issuer_id:'z',state_rev:0}],as_of:'2024-01-01'};
+  await expect(db.replaceMetrics('z','US',0,[m])).rejects.toMatchObject({code:'scope_missing'});
+  await expect(db.replaceMetrics('z','US',1,[m])).rejects.toMatchObject({code:'stale_computation'});
+ });
+ it('filings carry accepted_at/acceptance_source = null until setFilingAcceptance; readFilingFacts lists every generation with the run status',async()=>{
+  const db=memoryFactsDb();const iss=randomUUID();const b=randomUUID();
+  await db.reconcileScope('US',[{issuer_id:iss,reasons:[],priority:1,fetch_key:'k'}]);await db.claimLease(iss,'US',b,60);
+  const run=await db.beginRun(iss,'US',b,1);const f=filingInsert(iss);await db.stageFilings(run,[f]);
+  expect((await db.filingsOfIssuer(iss,'US',{}))[0]).toMatchObject({accepted_at:null,acceptance_source:null});
+  const x=factInsert(iss,f);await db.stageFacts(run,[x]);
+  expect(await db.readFilingFacts(f.filing_id,true)).toEqual([expect.objectContaining({fact_id:x.fact_id,status:'staged',run_status:'staged'})]);
+  expect(await db.readFilingFacts(f.filing_id,false)).toEqual([]);
+  await expect(db.setFilingAcceptance(f.filing_id,'2024-02-01T21:05:00Z','other' as 'sec_submissions')).rejects.toMatchObject({message:'invalid_acceptance'});
+  expect(await db.setFilingAcceptance(f.filing_id,'2024-02-01T21:05:00Z','sec_submissions')).toBe(true);
+  expect((await db.findFilingBySourceRef('edgar',f.sourceRef))!.accepted_at).toBe('2024-02-01T21:05:00.000Z');
+ });
 });
20261017090000_analyst_scoring.sql
20261017120000_recommendations_append_only.sql
20261018090000_recommendation_scores_base_close.sql
20261018120000_anchor_runner.sql
20261018150000_anchor_runner_cache_read.sql
20261105090000_dq_foundation.sql
20261105091000_issuers.sql
20261106090000_financial_facts.sql
20261107090000_identifiers_and_dq.sql
20261107091000_facts_extensions.sql

exec
/bin/zsh -lc "grep -nE 'create or replace function|returns|reconciliation_id|materialize|state_revs|jsonb_build_object' supabase/migrations/20261107091000_facts_extensions.sql" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
48:create or replace function public.filings_limited_update() returns trigger
76:create or replace function public.set_filing_acceptance(p_filing uuid, p_accepted timestamptz, p_source text)
77:returns boolean language plpgsql security definer set search_path = public as $$
100:    update public.financial_metrics set based_on_lineage = jsonb_build_array(jsonb_build_object('issuer_id', issuer_id, 'state_rev', based_on_rev));
111:create or replace function public.replace_financial_metrics_lineage(p_issuer uuid, p_market text, p_based_on jsonb, p_rows jsonb)
112:returns int language plpgsql security definer set search_path = public as $$
127:         jsonb_agg(jsonb_build_object('issuer_id', (e ->> 'issuer_id')::uuid, 'state_rev', (e ->> 'state_rev')::bigint) order by (e ->> 'issuer_id')::uuid)
161:create or replace function public.replace_financial_metrics(p_issuer uuid, p_market text, p_based_on_rev bigint, p_rows jsonb)
162:returns int language plpgsql security definer set search_path = public as $$
171:  return public.replace_financial_metrics_lineage(p_issuer, p_market, jsonb_build_array(jsonb_build_object('issuer_id', p_issuer, 'state_rev', p_based_on_rev)), p_rows);
179:create or replace function public.read_filing_facts(p_filing uuid, p_include_non_ok boolean)
180:returns jsonb language sql stable security definer set search_path = public as $$
181:  select jsonb_build_object('rows', coalesce(jsonb_agg((to_jsonb(f) - 'value') || jsonb_build_object('value', f.value_text, 'run_status', r.status)
197:-- Envelope {state_revs (issuer_id asc), lineage (asc), rows, conflicts, truncated, row_count}.
198:create or replace function public.read_facts_lineage(
201:returns jsonb language sql stable security invoker set search_path = public as $$
251:select jsonb_build_object(
252:  'state_revs', (select coalesce(jsonb_agg(jsonb_build_object('issuer_id', m.issuer_id, 'state_rev', public.fact_state_rev(m.issuer_id, p_market)) order by m.issuer_id), '[]'::jsonb) from members m),
254:  'conflicts', (select coalesce(jsonb_agg(jsonb_build_object(
255:                   'key', jsonb_build_object('concept', c.concept, 'period_start', c.period_start, 'period_end', c.period_end, 'consolidation', c.consolidation, 'unit', c.unit),
261:               else coalesce((select jsonb_agg((to_jsonb(c) - 'key_rank' - 'value') || jsonb_build_object('value', c.value_text) order by c.key_rank, c.available_date, c.created_at, c.fact_id) from capped c), '[]'::jsonb) end)
268:create or replace function public.read_facts(
271:returns jsonb language sql stable security invoker set search_path = public as $$
272:  select jsonb_build_object(
273:    'state_rev', coalesce(x.v -> 'state_revs' -> 0 -> 'state_rev', to_jsonb(public.fact_state_rev(p_issuer, p_market))),
284:create or replace function public.fact_topology_lock(p_ids uuid[])
285:returns void language plpgsql security definer set search_path = public as $$
309:create or replace function public.fact_set_merge_body(p_source uuid, p_target uuid, p_resolved_by uuid)
310:returns jsonb language plpgsql security definer set search_path = public as $$
341:        || coalesce((select jsonb_agg(jsonb_build_object('issuer_id', p_target, 'market', mk.m, 'source', p_source) order by mk.m)
344:                                @> jsonb_build_array(jsonb_build_object('issuer_id', p_target, 'market', mk.m, 'source', p_source)))), '[]'::jsonb), true)
348:  values (p_resolved_by, 'user', 'entities.merge', 'issuer', p_source, jsonb_build_object('source', p_source, 'target', p_target, 'repointed', cardinality(v_refs)));
349:  return jsonb_build_object('repointed', cardinality(v_refs));
353:create or replace function public.set_merge(p_source uuid, p_target uuid, p_resolved_by uuid)
354:returns jsonb language plpgsql security definer set search_path = public as $$
377:create or replace function public.fact_set_dissolved_body(p_issuer uuid, p_resolved_by uuid)
378:returns void language plpgsql security definer set search_path = public as $$
394:  values (p_resolved_by, 'user', 'entities.dissolve', 'issuer', p_issuer, jsonb_build_object('issuer', p_issuer));
398:create or replace function public.set_dissolved(p_issuer uuid, p_resolved_by uuid)
399:returns void language plpgsql security definer set search_path = public as $$
422:create or replace function public.fact_promote_rows(p_issuer uuid, p_market text, p_fact_ids uuid[])
423:returns int language plpgsql security definer set search_path = public as $$
481:create or replace function public.adopt_candidate(p_item uuid, p_index int, p_batch uuid, p_expected_rev bigint, p_resolved_by uuid)
482:returns jsonb language plpgsql security definer set search_path = public as $$
592:      detail = detail || jsonb_build_object('chosen_candidate_index', p_index, 'adopted_fact_id', v_fact, 'run_id', v_run, 'issuer_id', g.issuer_id,
593:                                            'market', g.market, 'batch_id', p_batch, 'hook', jsonb_build_object('stage', 'materialize', 'state', 'pending', 'at', to_jsonb(now())))
596:  return jsonb_build_object('fact_id', v_fact, 'run_id', v_run, 'issuer_id', g.issuer_id, 'market', g.market);
609:create or replace function public.restore_reconciled(p_item uuid, p_batch uuid, p_inputs_hash_now text, p_resolved_by uuid)
610:returns jsonb language plpgsql security definer set search_path = public as $$
636:      detail = detail || jsonb_build_object('restored_by_batch', p_batch, 'chosen_fact_ids', to_jsonb(v_ids),
637:                                            'hook', jsonb_build_object('stage', 'materialize', 'state', 'pending', 'at', to_jsonb(now())))
644:  select coalesce(jsonb_agg(jsonb_build_object('fact_id', x.id,
649:  return jsonb_build_object('promoted', v_promoted, 'skipped', v_skipped);
664:create or replace function public.resolve_lineage_conflict(p_item uuid, p_keep uuid, p_batch uuid, p_resolved_by uuid)
665:returns jsonb language plpgsql security definer set search_path = public as $$
716:      detail = detail || jsonb_build_object('chosen_fact_ids', jsonb_build_array(p_keep), 'quarantined_fact_ids', to_jsonb(v_q), 'issuer_id', v_t,
717:                                            'market', v_market, 'batch_id', p_batch, 'hook', jsonb_build_object('stage', 'materialize', 'state', 'pending', 'at', to_jsonb(now())))
720:  return jsonb_build_object('quarantined', cardinality(v_q));
727:create or replace function public.resolve_facts_quarantine(p_item uuid, p_chosen uuid[], p_resolved_by uuid)
728:returns jsonb language plpgsql security definer set search_path = public as $$
767:      detail = detail || jsonb_build_object('chosen_fact_ids', to_jsonb(v_chosen))
769:                then jsonb_build_object('hook', jsonb_build_object('stage', 'materialize', 'state', 'pending', 'at', to_jsonb(now())))
776:  return jsonb_build_object('promoted', v_promoted, 'skipped', cardinality(v_chosen) - v_promoted, 'chosen_fact_ids', to_jsonb(v_chosen));
785:create or replace function public.reconcile_fence_lock(p_fence jsonb)
786:returns public.dq_reconcile_cursor language plpgsql security definer set search_path = public as $$
810:create or replace function public.reconcile_frozen_keys(p_pair text, p_cycle_id text, p_issuer uuid, p_market text)
811:returns text[] language sql stable security definer set search_path = public as $$
824:create or replace function public.claim_reconcile_member(p_pair text, p_cycle_id text, p_issuer uuid, p_market text, p_batch uuid)
825:returns jsonb language plpgsql security definer set search_path = public as $$
836:  return jsonb_build_object('pair', p_pair, 'cycle_id', p_cycle_id, 'issuer_id', p_issuer, 'market', p_market, 'batch_id', p_batch, 'attempt', v_attempt);
843:create or replace function public.complete_reconcile_member(p_fence jsonb)
844:returns jsonb language plpgsql security definer set search_path = public as $$
865:  return jsonb_build_object('compared_passed', v_p, 'compared_failed', v_f, 'not_compared', v_n);
870:create or replace function public.fail_reconcile_member(p_fence jsonb, p_error text)
871:returns void language plpgsql security definer set search_path = public as $$
890:--   left_value, right_value, right_locator} and detail {pair, reconciliation_id, inputs_hash,
892:--   materialize = {issuer_id, market}.
895:--   reconciliation_id, at, inputs_hash} — this is how a passing re-run makes an item restorable.
901:create or replace function public.apply_reconcile_result(p_fence jsonb, p_result jsonb)
902:returns jsonb language plpgsql security definer set search_path = public as $$
942:    return jsonb_build_object('reused', true, 'reconciliation_id', v_existing.id, 'item_id', coalesce(v_existing.detail -> 'item_id', 'null'::jsonb), 'quarantined', 0, 'materialize', 'null'::jsonb);
945:  v_latest := jsonb_build_object('passed', p_result -> 'passed', 'reconciliation_id', v_rid, 'at', to_jsonb(v_now), 'inputs_hash', coalesce(p_result -> 'inputs_hash', 'null'::jsonb));
954:  -- promotion; only an ok row changes visibility (status, state_rev, hook, materialize).
966:              jsonb_build_object('pair', c.pair, 'reconciliation_id', v_rid, 'inputs_hash', coalesce(p_result -> 'inputs_hash', 'null'::jsonb), 'latest_result', v_latest,
968:                || case when f.status = 'ok' then jsonb_build_object('hook', jsonb_build_object('stage', 'materialize', 'state', 'pending', 'at', to_jsonb(v_now))) else '{}'::jsonb end,
969:              jsonb_build_object('key', jsonb_build_object('issuer_id', f.issuer_id, 'market', f.market, 'concept', f.concept, 'period_start', f.period_start, 'period_end', f.period_end,
976:      set detail = detail || jsonb_build_object('reconciliation_id', v_rid, 'latest_result', v_latest)
977:        || case when f.status = 'ok' then jsonb_build_object('hook', jsonb_build_object('stage', 'materialize', 'state', 'pending', 'at', to_jsonb(v_now))) else '{}'::jsonb end
984:      v_mat := jsonb_build_object('issuer_id', c.issuer_id, 'market', c.market);
988:      update public.dq_quarantine q set detail = q.detail || jsonb_build_object('latest_result', v_latest)
1005:                || jsonb_build_object('pair', c.pair, 'reconciliation_id', v_rid, 'issuer_id', c.issuer_id, 'market', c.market),
1013:          (p_result -> 'detail') || jsonb_build_object('item_id', v_item, 'inputs_hash', coalesce(p_result -> 'inputs_hash', 'null'::jsonb)),
1015:  return jsonb_build_object('reused', false, 'reconciliation_id', v_rid, 'item_id', v_item, 'quarantined', v_q, 'materialize', coalesce(v_mat, 'null'::jsonb));
1035:create or replace function public.open_reconcile_cycle(p_pair text, p_cycle_id text, p_started_at timestamptz, p_members jsonb, p_pending jsonb)
1036:returns jsonb language plpgsql security definer set search_path = public as $$
1042:  if found then return jsonb_build_object('created', false, 'cycle', to_jsonb(v_row), 'transferred', '[]'::jsonb); end if;
1072:    if found then return jsonb_build_object('created', false, 'cycle', to_jsonb(v_row), 'transferred', '[]'::jsonb); end if;
1087:      set detail = jsonb_set(r.detail, '{pending_members}', v_keep) || jsonb_build_object('pending_consumed_by', p_cycle_id)
1093:  set detail = jsonb_build_object('pending_merged_from', to_jsonb(v_from), 'pending_transferred', v_moved)
1096:  return jsonb_build_object('created', true, 'cycle', to_jsonb(v_row), 'transferred', v_moved);

exec
/bin/zsh -lc "sed -n '55,105p' src/lib/facts/memory-facts-db.ts; sed -n '395,475p' src/lib/facts/memory-facts-db.ts; sed -n '195,265p' supabase/migrations/20261107091000_facts_extensions.sql; sed -n '240,262p' src/lib/facts/db.ts; cat package.json | head -70; cat src/lib/db/pg-table-client.ts | head -75" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
export const asyncMethodsComplete:AsyncMethodsComplete=true;   // type error here ⇒ a FactsDb method is missing from ASYNC_METHODS
const FACT_ROW_REASONS=['same_day_conflict','identity_bs','identity_gp'];
const sk=(issuer:string,market:Market)=>`${issuer}|${market}`;
type KeyPart=Pick<FactRow,'concept'|'period_start'|'period_end'|'consolidation'|'unit'>;
const keyOf=(f:KeyPart)=>[f.concept,f.period_start??'',f.period_end,f.consolidation,f.unit].join('|');
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
const clone=<T>(v:T):T=>structuredClone(v);
const unknown=(message:string)=>new FactsDbError('unknown',message);

export function memoryFactsDb(tables:TableClient=memoryTableClient({dq_quarantine:['id']})):MemoryFactsDb{
 const scope=new Map<string,ScopeRow>();
 const scopeConfirmed=new Map<string,string>();   // = fact_sync_scope.scope_confirmed_at: set only by reconcile (change or active confirmation)
 const runs=new Map<string,MemoryRun>();
 const filings=new Map<string,FilingRow>();
 const facts=new Map<string,FactRow>();
 let lastStamp='';
 let metrics:MetricRow[]=[];
 let fixedNow:string|null=null;
 const now=()=>fixedNow??new Date().toISOString();
 // created_at of one stageFacts call: one value per call (SQL now() = transaction start), strictly increasing across calls
 const stamp=()=>{const t=now();if(t>lastStamp){lastStamp=t;}else{lastStamp=new Date(Date.parse(lastStamp)+1).toISOString();}return lastStamp;};
 const scopeOf=(issuer:string,market:Market)=>scope.get(sk(issuer,market));
 const bump=(issuer:string,market:Market)=>{const s=scopeOf(issuer,market);if(s)s.state_rev+=1;};
 const leaseCheck=(issuer:string,market:Market,batch:string)=>{
  const s=scopeOf(issuer,market);
  if(!s||s.lease_batch_id!==batch||s.lease_until===null||s.lease_until<=now())throw new FactsDbError('lease_lost');
  return s;
 };
 const runLock=(runId:string)=>{
  const r=runs.get(runId);if(!r)throw unknown('run_not_found');
  leaseCheck(r.issuer_id,r.market,r.batch_id);
  if(r.status==='published')throw new FactsDbError('run_published');
  if(r.status==='abandoned')throw new FactsDbError('run_abandoned');
  return r;
 };
 const abandon=(r:MemoryRun,prune:boolean)=>{
  r.status='abandoned';
  for(const [id,f] of facts)if(f.run_id===r.run_id)facts.delete(id);
  if(prune)for(const [id,g] of filings)if(g.run_id===r.run_id&&g.mapping_gen===0&&![...facts.values()].some(f=>f.filing_id===id))filings.delete(id);
 };
 const items=(match:Row)=>tables.select('dq_quarantine',{table_name:'financial_facts',...match});
 const idsOf=(row:Row)=>{const p=row.payload as {fact_ids?:unknown}|undefined;return Array.isArray(p?.fact_ids)?p.fact_ids.filter((x):x is string=>typeof x==='string'):[];};
 const chosenOf=(row:Row)=>{const d=row.detail as {chosen_fact_ids?:unknown}|undefined;return Array.isArray(d?.chosen_fact_ids)?d.chosen_fact_ids.filter((x):x is string=>typeof x==='string'):[];};
 const runIdOf=(row:Row)=>{const p=row.payload as {run_id?:unknown}|undefined;return typeof p?.run_id==='string'?p.run_id:null;};
 /** Does this same_day_conflict item dispute the row's (K, available_date)? Matched on payload.key like the SQL (round-1 #3). */
 const disputes=(item:Row,f:FactRow)=>{
  const k=(item.payload as {key?:Record<string,string|null>}|undefined)?.key;
  return !!k&&k.issuer_id===f.issuer_id&&k.market===f.market&&k.concept===f.concept&&(k.period_start??'')===(f.period_start??'')&&k.period_end===f.period_end&&k.consolidation===f.consolidation&&k.unit===f.unit&&k.available_date===f.available_date;
 };
 // ---- plan 3 helpers
 const topo=new Map<string,MemoryTopology>();
  },
  async updateFilingLink(filingId,patch){
   const p=linkPatch(patch);const g=filings.get(filingId);if(!g)return;
   Object.assign(g,p);
  },
  async reconcileScope(market,input,snapshotAt){
   let n=0;const snap=snapshotAt===undefined?null:new Date(snapshotAt).toISOString();
   for(const row of input){
    const k=sk(row.issuer_id,market);const s=scope.get(k);
    if(!s){scopeConfirmed.set(k,now());scope.set(k,{issuer_id:row.issuer_id,market,reasons:[...row.reasons],priority:row.priority,fetch_key:row.fetch_key,next_due_at:now(),lease_until:null,lease_batch_id:null,state_rev:0,last_attempt_at:null,last_success_at:null,last_batch_id:null,last_status:null});n++;continue;}
    if(JSON.stringify(s.reasons)!==JSON.stringify(row.reasons)||s.priority!==row.priority||s.fetch_key!==row.fetch_key){
     // A retirement of a still-active row is refused when a newer reconcile changed it after the sources were read.
     if(snap!==null&&row.priority===0&&s.priority>0&&(scopeConfirmed.get(k)??'')>snap)continue;
     s.reasons=[...row.reasons];s.priority=row.priority;s.fetch_key=row.fetch_key;scopeConfirmed.set(k,now());n++;
    }
    else if(row.priority>0&&s.priority>0)scopeConfirmed.set(k,now());   // unchanged active row: confirmed, not counted
   }
   return n;
  },
  async scopeDue(market,at,limit){
   if(limit<1)return [];
   const rows=[...scope.values()].filter(s=>s.market===market&&s.priority>0&&s.next_due_at<=new Date(at).toISOString());
   rows.sort((a,b)=>cmp(a.next_due_at,b.next_due_at)||(b.priority-a.priority)||cmp(a.issuer_id,b.issuer_id));
   return clone(rows.slice(0,limit));
  },
  async scopeRows(market,issuerIds){
   const want=new Set(issuerIds);
   return clone([...scope.values()].filter(s=>s.market===market&&want.has(s.issuer_id)).sort((a,b)=>cmp(a.issuer_id,b.issuer_id)));
  },
  async scopeAll(market){
   return clone([...scope.values()].filter(s=>s.market===market).sort((a,b)=>cmp(a.issuer_id,b.issuer_id)));
  },
  async metricsOfIssuer(issuer,market,formulaVersion){
   const rows=metrics.filter(m=>m.issuer_id===issuer&&m.market===market&&m.formula_version===formulaVersion);
   rows.sort((a,b)=>cmp(a.metric,b.metric)||cmp(a.period_end,b.period_end)||cmp(a.period_start,b.period_start)||cmp(a.input_unit,b.input_unit)||cmp(a.basis,b.basis));
   return clone(rows);
  },
  setTopology:entries=>{for(const [id,t] of Object.entries(entries))topo.set(id,{...t});},
  async targetOf(issuer){return topoOf(issuer).merged_into??issuer;},
  async lineageOf(target){return lineageMembers(target);},
  async stateRevs(issuers,market){return [...new Set(issuers)].sort(cmp).map(i=>({issuer_id:i,state_rev:scopeOf(i,market)?.state_rev??0}));},
  async readFactsLineage(issuers,market,o){return readLineage(issuers,market,o);},
  async readFilingFacts(filingId,includeNonOk){
   const rows=[...facts.values()].filter(f=>f.filing_id===filingId&&(f.status==='ok'||includeNonOk));
   rows.sort((a,b)=>(a.mapping_gen-b.mapping_gen)||cmp(a.concept,b.concept)||cmp(a.period_end,b.period_end)||cmp(a.period_start??'',b.period_start??'')||cmp(a.unit,b.unit)||cmp(a.created_at,b.created_at)||cmp(a.fact_id,b.fact_id));
   return rows.map(f=>({...clone(f),run_status:runs.get(f.run_id)?.status??'abandoned'}));
  },
  async replaceMetricsLineage(issuer,market,basedOn,input){return replaceLineage(issuer,market,basedOn,input);},
  async findFilingBySourceRef(source,sourceRef){const g=[...filings.values()].find(x=>x.source===source&&x.source_ref===sourceRef);return g?clone(g):null;},
  async filingsForCalendar(issuer,market,o){
   const rows=[...filings.values()].filter(g=>g.issuer_id===issuer&&g.market===market&&g.period_end!==null&&g.period_end>=o.fromPeriodEnd);
   rows.sort((a,b)=>cmp(a.period_end!,b.period_end!)||cmp(a.available_date,b.available_date)||cmp(a.filing_id,b.filing_id));
   return rows.map(g=>({...clone(g),run_status:(runs.get(g.run_id)?.status??'abandoned') as RunStatus}));
  },
  async setFilingAcceptance(filingId,acceptedAt,source){
   if(source!=='sec_submissions'||!acceptedAt||Number.isNaN(Date.parse(acceptedAt)))throw unknown('invalid_acceptance');
   const g=filings.get(filingId);if(!g)throw new FactsDbError('filing_not_found');
   if(g.source!=='edgar')throw unknown('invalid_acceptance');
   const iso=new Date(acceptedAt).toISOString();
   if(g.accepted_at===null){g.accepted_at=iso;g.acceptance_source=source;return true;}
   if(g.accepted_at===iso&&g.acceptance_source===source)return false;
   throw new FactsDbError('acceptance_conflict');
  },
  async adoptCandidate(itemId,index,batchId,expectedRev,resolvedBy){
   if(!resolvedBy)throw unknown('invalid_resolver');
   const [it]=await tables.select('dq_quarantine',{id:itemId},{limit:1});
   if(!it||it.status!=='open')throw new FactsDbError('item_not_open');
   if(it.table_name!=='financial_facts'||it.reason_code!=='ambiguous_value'||(it.dataset!==DATASETS.facts('US')&&it.dataset!==DATASETS.facts('CN')))throw new FactsDbError('invalid_choice');
   const cands=(it.payload as {candidates?:unknown}|undefined)?.candidates;
   if(!Array.isArray(cands)||!Number.isInteger(index)||index<0||index>=cands.length)throw new FactsDbError('invalid_choice');
   const c=candidateOf(cands[index]);if(!c)throw new FactsDbError('invalid_candidate');
   const market:Market=it.dataset===DATASETS.facts('US')?'US':'CN';const source=market==='US'?'edgar':'tushare';
   const g=[...filings.values()].find(x=>x.source===source&&x.source_ref===c.filingRef);
   if(!g||g.market!==market)throw new FactsDbError('filing_not_found');
   const anchor=runIdOf(it);const r=anchor!==null&&UUID.test(anchor)?runs.get(anchor):undefined;
   if(!r)throw new FactsDbError('generation_moved');
   const gen=r.mapping_gen;const nkGen=Number(/:([0-9]+)$/.exec(String(it.natural_key))?.[1]??Number.NaN);
   if(nkGen!==gen||g.mapping_gen!==gen||gen<=0||r.market!==g.market)throw new FactsDbError('generation_moved');
   let versions=new Set([...facts.values()].filter(f=>f.run_id===r.run_id).map(f=>f.mapping_version));
   if(versions.size===0)versions=new Set([...facts.values()].filter(f=>f.filing_id===g.filing_id&&f.mapping_gen===gen).map(f=>f.mapping_version));
   if(versions.size!==1)throw new FactsDbError('replay_required');
-- with more than one member and only over ok rows: a (K, available_date) whose ok rows come from
-- different issuers with different values takes no part in sequences and is listed in conflicts.
-- Envelope {state_revs (issuer_id asc), lineage (asc), rows, conflicts, truncated, row_count}.
create or replace function public.read_facts_lineage(
  p_issuers uuid[], p_market text, p_concepts text[], p_as_of date,
  p_from date, p_to date, p_history boolean, p_limit int, p_include_non_ok boolean default false)
returns jsonb language sql stable security invoker set search_path = public as $$
with members as (
  select distinct u.m as issuer_id from unnest(coalesce(p_issuers, '{}'::uuid[])) as u(m) where u.m is not null
), base as (
  select f.fact_id, f.issuer_id, f.market, f.filing_id, f.run_id, f.concept, f.source_concept, f.statement,
         f.period_start, f.period_end, f.duration, f.value, f.value_text, f.unit, f.consolidation, f.available_date,
         f.mapping_gen, f.mapping_version, f.status, f.raw_hash, f.created_at
  from public.financial_facts f
  join public.filings g on g.filing_id = f.filing_id and g.mapping_gen = f.mapping_gen
  where f.issuer_id in (select issuer_id from members) and f.market = p_market
    and (p_concepts is null or f.concept = any(p_concepts))
    and f.available_date <= p_as_of
    and (p_from is null or f.period_end >= p_from)
    and (p_to is null or f.period_end <= p_to)
    and (f.status = 'ok' or coalesce(p_include_non_ok, false))
), clash as (
  select b.concept, b.period_start, b.period_end, b.consolidation, b.unit, b.available_date,
         jsonb_agg(to_jsonb(b.fact_id::text) order by b.fact_id) as fact_ids
  from base b
  where b.status = 'ok' and (select count(*) from members) > 1
  group by b.concept, b.period_start, b.period_end, b.consolidation, b.unit, b.available_date
  having count(distinct b.issuer_id) > 1 and count(distinct b.value) > 1
), eligible as (
  select b.* from base b
  where b.status <> 'ok' or not exists (
    select 1 from clash c
    where c.concept = b.concept and c.period_start is not distinct from b.period_start and c.period_end = b.period_end
      and c.consolidation = b.consolidation and c.unit = b.unit and c.available_date = b.available_date)
), seq as (
  select b.*,
         row_number() over w as disclosure_seq,
         (row_number() over w = count(*) over (partition by b.concept, b.period_start, b.period_end, b.consolidation, b.unit)) as is_current,
         (lag(b.value) over w is not null and b.value <> lag(b.value) over w) as is_revision
  from eligible b
  where b.status = 'ok'
  window w as (partition by b.concept, b.period_start, b.period_end, b.consolidation, b.unit order by b.available_date, b.created_at, b.fact_id)
  union all
  select b.*, null::bigint, false, false from eligible b where b.status <> 'ok'
), keyed as (
  select s.*,
         dense_rank() over (order by s.period_end desc, s.concept collate "C", s.period_start desc nulls last, s.consolidation collate "C", s.unit collate "C") as key_rank
  from seq s
), picked as (
  select * from keyed k
  where (coalesce(p_history, false) or k.is_current) and (p_limit is null or k.key_rank <= p_limit)
), capped as (
  select * from picked order by key_rank, available_date, created_at, fact_id limit 10001
), counted as (
  select count(*)::int as n from capped
)
select jsonb_build_object(
  'state_revs', (select coalesce(jsonb_agg(jsonb_build_object('issuer_id', m.issuer_id, 'state_rev', public.fact_state_rev(m.issuer_id, p_market)) order by m.issuer_id), '[]'::jsonb) from members m),
  'lineage', (select coalesce(jsonb_agg(to_jsonb(m.issuer_id::text) order by m.issuer_id), '[]'::jsonb) from members m),
  'conflicts', (select coalesce(jsonb_agg(jsonb_build_object(
                   'key', jsonb_build_object('concept', c.concept, 'period_start', c.period_start, 'period_end', c.period_end, 'consolidation', c.consolidation, 'unit', c.unit),
                   'available_date', c.available_date, 'fact_ids', c.fact_ids)
                 order by c.available_date, c.concept collate "C", c.period_end, c.period_start nulls first, c.consolidation collate "C", c.unit collate "C"), '[]'::jsonb) from clash c),
  'truncated', (select n from counted) > 10000,
  'row_count', case when (select n from counted) > 10000 then 0 else (select n from counted) end,
  'rows', case when (select n from counted) > 10000 then '[]'::jsonb
               else coalesce((select jsonb_agg((to_jsonb(c) - 'key_rank' - 'value') || jsonb_build_object('value', c.value_text) order by c.key_rank, c.available_date, c.created_at, c.fact_id) from capped c), '[]'::jsonb) end)
$$;
revoke execute on function public.read_facts_lineage(uuid[], text, text[], date, date, date, boolean, int, boolean) from public;
grant execute on function public.read_facts_lineage(uuid[], text, text[], date, date, date, boolean, int, boolean) to anon, authenticated, service_role;

   // read_facts_lineage with no concepts: the revs of every member in one snapshot (anon may call it)
   return lineageRevsFrom((await call<ReadFactsLineageEnvelope>('read_facts_lineage',readLineageArgs(issuers,market,{concepts:[],asOf:'1900-01-01'}))).state_revs);
  },
  async readFactsLineage(issuers,market,opts){return lineageResultFromEnvelope(await call<ReadFactsLineageEnvelope>('read_facts_lineage',readLineageArgs(issuers,market,opts)));},
  async readFilingFacts(filingId,includeNonOk){return ((await call<{rows?:Record<string,unknown>[]}|null>('read_filing_facts',{p_filing:filingId,p_include_non_ok:includeNonOk}))?.rows??[]).map(filingFactFromJson);},
  async replaceMetricsLineage(issuer,market,basedOn,input){return Number(await call<unknown>('replace_financial_metrics_lineage',{p_issuer:issuer,p_market:market,p_based_on:basedOn,p_rows:input.map(metricArgs)}));},
  async findFilingBySourceRef(source,sourceRef){const r=await rows<Record<string,unknown>>(c.from('filings').select('*').eq('source',source).eq('source_ref',sourceRef).limit(1));return r[0]?filingFromTable(r[0]):null;},
  async filingsForCalendar(issuer,market,opts){
   const list=await pageAll<Record<string,unknown>>(()=>c.from('filings').select('*').eq('issuer_id',issuer).eq('market',market).gte('period_end',opts.fromPeriodEnd).order('period_end').order('available_date').order('filing_id'));
   const status=new Map<string,string>();
   for(const part of chunkIds([...new Set(list.map(r=>String(r.run_id)))]))
    for(const r of await pageAll<{run_id:string;status:string}>(()=>c.from('fact_sync_runs').select('run_id,status').in('run_id',part).order('run_id')))status.set(String(r.run_id),String(r.status));
   return list.map(r=>{const s=status.get(String(r.run_id));if(s===undefined)throw new FactsDbError('unknown',`run_not_found:${String(r.run_id)}`);return calendarFilingFromRow({...r,run_status:s});});
  },
  async setFilingAcceptance(filingId,acceptedAt,source){return (await call<unknown>('set_filing_acceptance',{p_filing:filingId,p_accepted:acceptedAt,p_source:source}))===true;},
  async adoptCandidate(item,index,batch,expectedRev,by){return adoptFromJson(await call<unknown>('adopt_candidate',{p_item:item,p_index:index,p_batch:batch,p_expected_rev:expectedRev,p_resolved_by:by}));},
  async restoreReconciled(item,batch,hash,by){return restoreFromJson(await call<unknown>('restore_reconciled',{p_item:item,p_batch:batch,p_inputs_hash_now:hash,p_resolved_by:by}));},
  async resolveLineageConflict(item,keep,batch,by){return {quarantined:Number((await call<{quarantined:unknown}>('resolve_lineage_conflict',{p_item:item,p_keep:keep,p_batch:batch,p_resolved_by:by})).quarantined)};},
  async claimReconcileMember(pair,cycleId,issuer,market,batch){return fenceFromJson(await call<unknown>('claim_reconcile_member',{p_pair:pair,p_cycle_id:cycleId,p_issuer:issuer,p_market:market,p_batch:batch}));},
  async applyReconcileResult(fence,result){return applyOutcomeFromJson(await call<unknown>('apply_reconcile_result',{p_fence:fenceArgs(fence),p_result:result}));},
  async completeReconcileMember(fence){return countsFromJson(await call<unknown>('complete_reconcile_member',{p_fence:fenceArgs(fence)}));},
  async failReconcileMember(fence,error){await call('fail_reconcile_member',{p_fence:fenceArgs(fence),p_error:error});},
  async openReconcileCycle(i){return openCycleFromJson(await call<unknown>('open_reconcile_cycle',{p_pair:i.pair,p_cycle_id:i.cycleId,p_started_at:i.startedAt,p_members:i.members,p_pending:i.pending}));},
{
  "name": "stock-monitor",
  "version": "1.0.0",
  "private": true,
  "engines": {
    "node": ">=22.19.0 <23"
  },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint . --max-warnings=0",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test",
    "preflight:release": "tsx scripts/release-preflight.ts",
    "securities:sync": "tsx scripts/securities-sync.ts",
    "securities:reconcile": "tsx scripts/securities-reconcile.ts",
    "test:db": "tsx scripts/ci/research-db.ts",
    "test:migrations": "tsx scripts/ci/migration-rehearsal.ts",
    "supabase:types": "echo 'database.types.ts is hand-maintained; see docs/runbooks/data-foundation.md' && exit 1",
    "check:migration-history": "tsx scripts/ci/check-migration-history.ts",
    "test:runtime-privileges": "tsx scripts/s4/runtime-privileges-smoke.ts",
    "preflight:research": "tsx scripts/s4/runtime-preflight.ts",
    "test:runtime-tls": "tsx scripts/s4/runtime-tls-smoke.ts",
    "test:revocation-consumer": "tsx scripts/revocation/consumer-smoke.ts",
    "test:revocation-registration": "tsx scripts/revocation/registration-smoke.ts",
    "test:revocation-retention": "tsx scripts/revocation/retention-smoke.ts",
    "test:revocation-list": "tsx scripts/revocation/list-smoke.ts"
  },
  "dependencies": {
    "@supabase/ssr": "^0.5.2",
    "@supabase/supabase-js": "^2.46.1",
    "ajv": "8.20.0",
    "clsx": "^2.1.1",
    "dsh-trade-strategy-evaluator": "file:vendor/dsh-trade-strategy-evaluator-0.3.0.tgz",
    "geist": "^1.7.1",
    "iconv-lite": "^0.7.2",
    "lightweight-charts": "^4.2.1",
    "next": "15.5.28",
    "next-intl": "^4.13.1",
    "pg": "^8.23.0",
    "pinyin-pro": "^3.28.1",
    "react": "^19.2.7",
    "react-dom": "^19.2.7",
    "stripe": "^22.3.0",
    "svix": "^1.98.0",
    "tailwind-merge": "^2.5.4",
    "xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"
  },
  "devDependencies": {
    "@next/eslint-plugin-next": "^15.5.22",
    "@playwright/test": "^1.61.1",
    "@types/node": "^22.9.0",
    "@types/pg": "^8.23.1",
    "@types/react": "^19.2.17",
    "@types/react-dom": "^19.2.3",
    "autoprefixer": "^10.4.20",
    "eslint": "^10.8.0",
    "eslint-plugin-react-hooks": "^7.1.1",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.14",
    "tsx": "^4.23.1",
    "typescript": "^5.6.3",
    "typescript-eslint": "^8.65.0",
    "vitest": "^4.1.10"
  },
  "overrides": {
    "@swc/helpers": "0.5.23",
// TEST-ONLY TableClient over node-postgres, so integration tests drive the same entities/dq code
// against the real schema (constraints, triggers, exclusion indexes). Production uses the Supabase
// adapter (supabaseTableClient in table-client.ts); nothing in src/app or src/lib imports this.
// Semantics mirror the Supabase adapter: null match values use `is null`, update returns the
// matched row count, select/count honour gte/lt ranges and orderBy/desc/limit/offset; rpc calls
// public.<fn> with named arguments (objects / arrays / booleans as jsonb).
// date/timestamp/timestamptz values come back as the server's text (not JS Date) so they compare
// and round-trip exactly like the strings PostgREST returns. Plain objects and arrays are sent as
// JSON (jsonb columns); PostgreSQL array columns are not supported.
import {types} from 'pg';
import type {Pool,QueryConfig} from 'pg';
import {TableError,assertMatch,assertUpdateMatch,checkRangeOptions,checkSelectOptions} from './table-client';
import type {RangeOptions,Row,SelectOptions,TableClient} from './table-client';

const IDENT=/^[a-z_][a-z0-9_]*$/;
/** Validates a table/column name and returns it double-quoted. */
export function ident(name:string):string{
 if(typeof name!=='string'||!IDENT.test(name))throw new Error(`invalid_sql_identifier:${String(name)}`);
 return `"${name}"`;
}

const param=(v:unknown)=>v!==null&&typeof v==='object'&&!(v instanceof Date)&&!Buffer.isBuffer(v)?JSON.stringify(v):v;
const placeholders=(n:number,from=1)=>Array.from({length:n},(_,i)=>`$${from+i}`).join(', ');

/** ` where …` (or '') for an equality match plus optional ranges; pushes values onto `params`. */
export function whereSql(match:Row,range:RangeOptions,params:unknown[]):string{
 const parts:string[]=[];
 const bind=(v:unknown)=>{params.push(param(v));return `$${params.length}`;};
 for(const [k,v] of Object.entries(match))parts.push(v===null?`${ident(k)} is null`:`${ident(k)} = ${bind(v)}`);
 for(const [k,v] of Object.entries(range.gte??{}))parts.push(`${ident(k)} >= ${bind(v)}`);
 for(const [k,v] of Object.entries(range.lt??{}))parts.push(`${ident(k)} < ${bind(v)}`);
 return parts.length?` where ${parts.join(' and ')}`:'';
}

export function selectSql(rel:string,match:Row,opts:SelectOptions):{text:string;values:unknown[]}{
 const values:unknown[]=[];
 let text=`select * from ${rel}${whereSql(match,opts,values)}`;
 if(opts.orderBy)text+=` order by ${ident(opts.orderBy)} ${opts.desc?'desc':'asc'}`;
 if(opts.limit!==undefined)text+=` limit ${Number(opts.limit)}`;
 if(opts.offset!==undefined)text+=` offset ${Number(opts.offset)}`;
 return {text,values};
}

export function upsertSql(rel:string,row:Row,onConflict:string):{text:string;values:unknown[]}{
 const cols=Object.keys(row);
 const conflict=onConflict.split(',').map(s=>s.trim());
 if(!cols.length||!conflict.length)throw new Error('invalid_upsert');
 const rest=cols.filter(c=>!conflict.includes(c));
 const action=rest.length?`do update set ${rest.map(c=>`${ident(c)} = excluded.${ident(c)}`).join(', ')}`:'do nothing';
 return {
  text:`insert into ${rel} (${cols.map(ident).join(', ')}) values (${placeholders(cols.length)}) on conflict (${conflict.map(ident).join(', ')}) ${action}`,
  values:cols.map(c=>param(row[c])),
 };
}

const RAW_TEXT=new Set([1082,1114,1184]); // date, timestamp, timestamptz
const getTypeParser=types.getTypeParser as (oid:number,format?:string)=>unknown;
export const typeParsers={getTypeParser:(oid:number,format?:string)=>RAW_TEXT.has(oid)?(v:string)=>v:getTypeParser(oid,format)} as unknown as QueryConfig['types'];

interface PgErr{message?:string;code?:string;detail?:string;hint?:string}

export function pgTableClient(pool:Pool,schema='public'):TableClient{
 const rel=(table:string)=>`${ident(schema)}.${ident(table)}`;
 const run=async(op:string,table:string,text:string,values:unknown[])=>{
  try{return await pool.query({text,values,types:typeParsers});}
  catch(e){const err=e as PgErr;throw new TableError(op,table,err.message??String(e),err.code??null,{details:err.detail,hint:err.hint,cause:e});}
 };
 return {
  async insert(table,row){
   const cols=Object.keys(row);
   const text=cols.length
    ?`insert into ${rel(table)} (${cols.map(ident).join(', ')}) values (${placeholders(cols.length)}) returning *`
    :`insert into ${rel(table)} default values returning *`;
   return (await run('insert',table,text,cols.map(c=>param(row[c])))).rows[0] as Row;
  },

exec
/bin/zsh -lc 'git diff 0bf3b19''^ 0bf3b19 -- src/lib/facts/memory-facts-db.ts | sed -n '"'190,270p'; sed -n '905,946p' supabase/migrations/20261107091000_facts_extensions.sql; sed -n '1035,1078p' supabase/migrations/20261107091000_facts_extensions.sql; sed -n '360,395p' src/lib/facts/memory-facts-db.ts; ls -a .claude; git log -1 --oneline" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-wl2vL8MO' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-YUbX3uSg' (errno=Operation not permitted)
+ // replace_financial_metrics_lineage: member set = current lineage, every rev equal, else stale_computation.
+ const replaceLineage=(issuer:string,market:Market,basedOn:LineageRev[],input:MetricRow[])=>{
+  const norm=lineageRevsFrom(basedOn);
+  if(norm.length===0||new Set(norm.map(x=>x.issuer_id)).size!==norm.length||!norm.some(x=>x.issuer_id===issuer)||norm.some(x=>!Number.isInteger(x.state_rev)||x.state_rev<0))throw unknown('invalid_based_on');
+  if(norm.some(x=>!scopeOf(x.issuer_id,market)))throw new FactsDbError('scope_missing');
+  if(topoOf(issuer).status!=='active')throw new FactsDbError('stale_computation');   // a merged / dissolved issuer is no materialisation target
+  if([...lineageMembers(issuer)].sort(cmp).join(',')!==norm.map(x=>x.issuer_id).join(','))throw new FactsDbError('stale_computation');
+  if(norm.some(x=>scopeOf(x.issuer_id,market)!.state_rev!==x.state_rev))throw new FactsDbError('stale_computation');
+  const pk=(m:MetricRow)=>[m.metric,m.period_start,m.period_end,m.input_unit,m.basis,m.formula_version].join('|');
+  if(new Set(input.map(pk)).size!==input.length)throw new FactsDbError('duplicate_key','financial_metrics_pkey');
+  const rev=scopeOf(issuer,market)!.state_rev;
+  metrics=metrics.filter(m=>!(m.issuer_id===issuer&&m.market===market)).concat(input.map(m=>({...clone(m),issuer_id:issuer,market,based_on_rev:rev,based_on_lineage:norm.map(x=>({...x}))})));
+  return input.length;
+ };
  const byDisclosure=(a:FactRow,b:FactRow)=>cmp(a.available_date,b.available_date)||cmp(a.created_at,b.created_at)||cmp(a.fact_id,b.fact_id);
  // key ranking of read_facts: period_end desc, concept, period_start desc nulls last, consolidation, unit
  const keyOrder=(a:KeyPart,b:KeyPart)=>cmp(b.period_end,a.period_end)||cmp(a.concept,b.concept)
@@ -146,7 +284,7 @@ export function memoryFactsDb(tables:TableClient=memoryTableClient({dq_quarantin
     const existing=[...filings.values()].find(same)??pending.find(same);
     if(existing){if(existing.issuer_id===r.issuer_id&&existing.market===r.market)out.set(row.sourceRef,existing.filing_id);continue;}
     if(filings.has(row.filing_id)||pending.some(g=>g.filing_id===row.filing_id))throw new FactsDbError('duplicate_key','filings_pkey');
-    pending.push({filing_id:row.filing_id,issuer_id:r.issuer_id,market:r.market,source:row.source,origin:row.origin,form_type:row.formType,fiscal_year:row.fiscalYear,fiscal_period:row.fiscalPeriod,period_end:row.periodEnd,available_date:row.availableDate,source_ref:row.sourceRef,url:row.url,document_ref:null,document_url:null,link_attempts:0,mapping_gen:0,run_id:run,created_at:now()});
+    pending.push({filing_id:row.filing_id,issuer_id:r.issuer_id,market:r.market,source:row.source,origin:row.origin,form_type:row.formType,fiscal_year:row.fiscalYear,fiscal_period:row.fiscalPeriod,period_end:row.periodEnd,available_date:row.availableDate,source_ref:row.sourceRef,url:row.url,document_ref:null,document_url:null,link_attempts:0,mapping_gen:0,run_id:run,created_at:now(),accepted_at:null,acceptance_source:null});
     out.set(row.sourceRef,row.filing_id);
    }
    for(const g of pending)filings.set(g.filing_id,g);
@@ -215,6 +353,8 @@ export function memoryFactsDb(tables:TableClient=memoryTableClient({dq_quarantin
   async resolveFactsQuarantine(itemId,chosen,resolvedBy){
    const [it]=await tables.select('dq_quarantine',{id:itemId},{limit:1});
    if(!it||it.status!=='open'||it.table_name!=='financial_facts')throw new FactsDbError('item_not_open');
+   // migration two: these two reasons close only through restoreReconciled / resolveLineageConflict
+   if(it.reason_code==='reconcile_mismatch'||it.reason_code==='lineage_conflict')throw new FactsDbError('use_dedicated_resolver');
    const ids=idsOf(it);
    const existing=ids.map(id=>facts.get(id)).filter((f):f is FactRow=>!!f);
    const runId=runIdOf(it);
@@ -235,29 +375,12 @@ export function memoryFactsDb(tables:TableClient=memoryTableClient({dq_quarantin
    return {promoted,skipped:picked.length-promoted,chosenFactIds:picked};
   },
   async replaceMetrics(issuer,market,basedOnRev,input){
-   const rev=scopeOf(issuer,market)?.state_rev??0;
-   if(rev!==basedOnRev)throw new FactsDbError('stale_computation');
-   const pk=(m:MetricRow)=>[m.metric,m.period_start,m.period_end,m.input_unit,m.basis,m.formula_version].join('|');
-   if(new Set(input.map(pk)).size!==input.length)throw new FactsDbError('duplicate_key','financial_metrics_pkey');
-   metrics=metrics.filter(m=>!(m.issuer_id===issuer&&m.market===market)).concat(input.map(m=>({...clone(m),issuer_id:issuer,market,based_on_rev:basedOnRev})));
-   return input.length;
-  },
-  async readFacts(issuer,market,o){
-   const stateRev=scopeOf(issuer,market)?.state_rev??0;
-   const base=[...facts.values()].filter(f=>f.issuer_id===issuer&&f.market===market&&o.concepts.includes(f.concept)&&f.available_date<=o.asOf
-    &&(o.from===undefined||f.period_end>=o.from)&&(o.to===undefined||f.period_end<=o.to)&&(f.status==='ok'||o.includeNonOk===true)&&filings.get(f.filing_id)?.mapping_gen===f.mapping_gen);
-   const groups=new Map<string,FactRow[]>();
-   for(const f of base)if(f.status==='ok'){const k=keyOf(f);if(!groups.has(k))groups.set(k,[]);groups.get(k)!.push(f);}
-   const out:FactRow[]=[];
-   for(const g of groups.values()){g.sort(byDisclosure);g.forEach((f,i)=>out.push({...clone(f),disclosure_seq:i+1,is_current:i===g.length-1,is_revision:i>0&&!numericEquals(f.value,g[i-1].value)}));}
-   for(const f of base)if(f.status!=='ok')out.push({...clone(f),disclosure_seq:undefined,is_current:false,is_revision:false});
-   const heads=new Map<string,FactRow>();for(const f of out)if(!heads.has(keyOf(f)))heads.set(keyOf(f),f);
-   const rank=new Map([...heads.entries()].sort((a,b)=>keyOrder(a[1],b[1])).map(([k],i)=>[k,i+1] as const));
-   const picked=out.filter(f=>(o.history===true||f.is_current===true)&&(o.limit===undefined||rank.get(keyOf(f))!<=o.limit));
-   picked.sort((a,b)=>rank.get(keyOf(a))!-rank.get(keyOf(b))!||byDisclosure(a,b));
-   if(picked.length>READ_FACTS_CAP)return {stateRev,rows:[],truncated:true};
-   return {stateRev,rows:picked,truncated:false};
+   // plan-2 contract: no scope row ⇒ rev 0 (a non-zero rev is stale); rev 0 without a row is scope_missing (as in SQL)
+   if(!scopeOf(issuer,market)){if(basedOnRev!==0)throw new FactsDbError('stale_computation');throw new FactsDbError('scope_missing');}
+   if(!Number.isInteger(basedOnRev)||basedOnRev<0)throw new FactsDbError('stale_computation');
+   return replaceLineage(issuer,market,[{issuer_id:issuer,state_rev:basedOnRev}],input);
   },
+  async readFacts(issuer,market,o){const r=readLineage([issuer],market,o);return {stateRev:r.stateRevs[0].state_rev,rows:r.rows,truncated:r.truncated};},
   async factsByIds(ids){return [...new Set(ids)].sort().map(id=>facts.get(id)).filter((f):f is FactRow=>!!f).map(f=>clone(f));},   // deduped, ordered by fact_id
   async openConflicts(issuer,market){
    const prefix=conflictPrefix(issuer,market);
@@ -306,6 +429,256 @@ export function memoryFactsDb(tables:TableClient=memoryTableClient({dq_quarantin
    rows.sort((a,b)=>cmp(a.metric,b.metric)||cmp(a.period_end,b.period_end)||cmp(a.period_start,b.period_start)||cmp(a.input_unit,b.input_unit)||cmp(a.basis,b.basis));
    return clone(rows);
   },
+  setTopology:entries=>{for(const [id,t] of Object.entries(entries))topo.set(id,{...t});},
+  async targetOf(issuer){return topoOf(issuer).merged_into??issuer;},
+  async lineageOf(target){return lineageMembers(target);},
+  async stateRevs(issuers,market){return [...new Set(issuers)].sort(cmp).map(i=>({issuer_id:i,state_rev:scopeOf(i,market)?.state_rev??0}));},
+  async readFactsLineage(issuers,market,o){return readLineage(issuers,market,o);},
+  async readFilingFacts(filingId,includeNonOk){
+   const rows=[...facts.values()].filter(f=>f.filing_id===filingId&&(f.status==='ok'||includeNonOk));
        v_dataset text; v_nk_item text; v_latest jsonb; v_now timestamptz := now(); v_reason text;
        v_lv numeric; v_rv numeric; v_ad numeric; v_rd numeric; v_tol numeric; v_keys text[];
begin
  c := public.reconcile_fence_lock(p_fence);
  if p_result is null or jsonb_typeof(p_result) <> 'object'
     or coalesce(jsonb_typeof(p_result -> 'natural_key'), '') <> 'string'
     or coalesce(p_result ->> 'kind', '') not in ('numeric','text','date')
     or coalesce(p_result ->> 'outcome', '') not in ('compared','left_missing','left_unlinked','left_ambiguous','right_missing','unsupported','right_ambiguous','incomplete_gold')
     or coalesce(jsonb_typeof(p_result -> 'passed'), '') <> 'boolean'
     or coalesce(p_result ->> 'action', '') not in ('record','quarantine_left','review_item','lineage_item')
     or coalesce(jsonb_typeof(p_result -> 'left_source'), '') <> 'string' or coalesce(jsonb_typeof(p_result -> 'right_source'), '') <> 'string'
     or coalesce(jsonb_typeof(p_result -> 'detail'), '') <> 'object' or coalesce(jsonb_typeof(p_result -> 'tolerance'), '') <> 'string' then
    raise exception 'invalid_result' using errcode = '22023';
  end if;
  v_action := p_result ->> 'action'; v_nk := p_result ->> 'natural_key';
  if length(v_nk) not between 1 and 400 then raise exception 'invalid_result' using errcode = '22023'; end if;
  -- a pass is only meaningful for a compared pair of values
  if (p_result -> 'passed') = 'true'::jsonb and p_result ->> 'outcome' <> 'compared' then raise exception 'invalid_result' using errcode = '22023'; end if;
  -- the key must belong to the member's frozen expected set
  v_keys := public.reconcile_frozen_keys(c.pair, c.cycle_id, c.issuer_id, c.market);
  if v_keys is null or not (v_nk = any (v_keys)) then raise exception 'invalid_result' using errcode = '22023'; end if;
  begin
    v_lv := (p_result ->> 'left_value')::numeric; v_rv := (p_result ->> 'right_value')::numeric;
    v_ad := (p_result ->> 'abs_diff')::numeric; v_rd := (p_result ->> 'rel_diff')::numeric;
    v_tol := (p_result ->> 'tolerance')::numeric; v_left := (p_result ->> 'left_fact_id')::uuid;
  exception when others then
    raise exception 'invalid_result' using errcode = '22023';
  end;
  if (v_action = 'quarantine_left' and v_left is null)
     or (v_action in ('review_item','lineage_item')
         and (coalesce(jsonb_typeof(p_result -> 'item'), '') <> 'object' or coalesce(jsonb_typeof(p_result -> 'item' -> 'natural_key'), '') <> 'string'
              or coalesce(jsonb_typeof(p_result -> 'item' -> 'payload'), '') <> 'object' or length(p_result -> 'item' ->> 'natural_key') not between 1 and 512)) then
    raise exception 'invalid_result' using errcode = '22023';
  end if;
  select * into v_existing from public.dq_reconciliations where pair = c.pair and cycle_id = c.cycle_id and natural_key = v_nk;
  if found then
    if v_existing.issuer_id is distinct from c.issuer_id or v_existing.market is distinct from c.market then raise exception 'invalid_result' using errcode = '22023'; end if;
    return jsonb_build_object('reused', true, 'reconciliation_id', v_existing.id, 'item_id', coalesce(v_existing.detail -> 'item_id', 'null'::jsonb), 'quarantined', 0, 'materialize', 'null'::jsonb);
  end if;
  v_dataset := case c.market when 'US' then 'facts.us' else 'facts.cn' end;
  v_latest := jsonb_build_object('passed', p_result -> 'passed', 'reconciliation_id', v_rid, 'at', to_jsonb(v_now), 'inputs_hash', coalesce(p_result -> 'inputs_hash', 'null'::jsonb));
  if v_left is not null then
create or replace function public.open_reconcile_cycle(p_pair text, p_cycle_id text, p_started_at timestamptz, p_members jsonb, p_pending jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_row public.dq_reconcile_cycles; r record; v_members jsonb; v_keep jsonb; v_take jsonb; v_from text[] := '{}'; v_moved jsonb := '[]'::jsonb;
begin
  if p_pair is null or p_cycle_id is null or p_started_at is null then raise exception 'invalid_members' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('dq_reconcile_cycle:' || p_pair));
  select * into v_row from public.dq_reconcile_cycles where pair = p_pair and status = 'running';
  if found then return jsonb_build_object('created', false, 'cycle', to_jsonb(v_row), 'transferred', '[]'::jsonb); end if;
  if jsonb_typeof(p_members) is distinct from 'array' or jsonb_typeof(p_pending) is distinct from 'array'
     or exists (select 1 from jsonb_array_elements(p_members) m
                where jsonb_typeof(m) <> 'object' or coalesce(m ->> 'issuer_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                   or coalesce(m ->> 'market', '') not in ('US', 'CN')
                   or jsonb_typeof(m -> 'expected_keys') is distinct from 'array')
     or exists (select 1 from jsonb_array_elements(p_pending) p where jsonb_typeof(p) <> 'object' or (p ->> 'source') is null)
  then raise exception 'invalid_members' using errcode = '22023'; end if;
  -- freeze issuer_id as canonical (lower-case) uuid text
  select coalesce(jsonb_agg(jsonb_set(m, '{issuer_id}', to_jsonb(((m ->> 'issuer_id')::uuid)::text)) order by o), '[]'::jsonb)
    into v_members from jsonb_array_elements(p_members) with ordinality as t(m, o);
  if exists (select 1 from jsonb_array_elements(v_members) m
             where exists (select 1 from jsonb_array_elements(m -> 'expected_keys') k
                           where (case jsonb_typeof(k) when 'object' then k ->> 'naturalKey' when 'string' then k #>> '{}' end) is null))
     or (select count(*) from jsonb_array_elements(v_members))
        <> (select count(distinct (m ->> 'issuer_id', m ->> 'market')) from jsonb_array_elements(v_members) m)
     -- natural keys are unique across the whole cycle: results are accepted per (pair, cycle, natural_key)
     or (select count(*) from jsonb_array_elements(v_members) m, jsonb_array_elements(m -> 'expected_keys') k)
        <> (select count(distinct (case jsonb_typeof(k) when 'object' then k ->> 'naturalKey' else k #>> '{}' end))
            from jsonb_array_elements(v_members) m, jsonb_array_elements(m -> 'expected_keys') k)
     or exists (select 1 from jsonb_array_elements(p_pending) p
                where not exists (select 1 from jsonb_array_elements(v_members) m
                                  where m ->> 'issuer_id' = lower(p ->> 'issuer_id') and m ->> 'market' = p ->> 'market'))
  then raise exception 'invalid_members' using errcode = '22023'; end if;
  begin
    insert into public.dq_reconcile_cycles (pair, cycle_id, started_at, finished_at, members, status, expected_total, detail)
    values (p_pair, p_cycle_id, p_started_at, null, v_members, 'running',
            (select coalesce(sum(jsonb_array_length(m -> 'expected_keys')), 0) from jsonb_array_elements(v_members) m), '{}'::jsonb);
  exception when unique_violation then
    select * into v_row from public.dq_reconcile_cycles where pair = p_pair and status = 'running';
    if found then return jsonb_build_object('created', false, 'cycle', to_jsonb(v_row), 'transferred', '[]'::jsonb); end if;
    raise;
  end;
  insert into public.dq_reconcile_cursor (pair, cycle_id, issuer_id, market, expected)
  select p_pair, p_cycle_id, (m ->> 'issuer_id')::uuid, m ->> 'market', jsonb_array_length(m -> 'expected_keys')
  from jsonb_array_elements(v_members) m;
  for r in select c.cycle_id, c.detail from public.dq_reconcile_cycles c
   const runId=runIdOf(it);
   const anchor=existing[0]??(runId!==null?runs.get(runId):undefined);
   // run_pending: any member row's run still staged, or the anchor run itself (the only run an
   // item without fact rows has; spec §7.3, round-1 #10). Single-threaded, so no re-read is needed.
   if(existing.some(f=>runs.get(f.run_id)?.status==='staged'))throw new FactsDbError('run_pending');
   if(runId!==null&&runs.get(runId)?.status==='staged')throw new FactsDbError('run_pending');
   let picked:string[];
   if(it.reason_code==='same_day_conflict'){picked=[...chosen];if(picked.some(id=>!ids.includes(id)))throw new FactsDbError('invalid_chosen');
    // spec 7.3: the chosen rows (those still existing) must all carry the same numeric value
    const chosenRows=picked.map(id=>facts.get(id)).filter((f):f is FactRow=>!!f);
    if(chosenRows.some(f=>!numericEquals(f.value,chosenRows[0].value)))throw new FactsDbError('invalid_chosen');}
   else picked=ids;
   await tables.update('dq_quarantine',{id:itemId,status:'open'},{status:'resolved_accept',resolved_by:resolvedBy,resolved_at:now(),detail:{...((it.detail as Record<string,unknown>|undefined)??{}),chosen_fact_ids:picked,...(FACT_ROW_REASONS.includes(String(it.reason_code))?{hook:{stage:'materialize',state:'pending',at:now()}}:{})}});
   let promoted=0;
   if(anchor){promoted=await promote(anchor.issuer_id,anchor.market,picked);bump(anchor.issuer_id,anchor.market);}
   return {promoted,skipped:picked.length-promoted,chosenFactIds:picked};
  },
  async replaceMetrics(issuer,market,basedOnRev,input){
   // plan-2 contract: no scope row ⇒ rev 0 (a non-zero rev is stale); rev 0 without a row is scope_missing (as in SQL)
   if(!scopeOf(issuer,market)){if(basedOnRev!==0)throw new FactsDbError('stale_computation');throw new FactsDbError('scope_missing');}
   if(!Number.isInteger(basedOnRev)||basedOnRev<0)throw new FactsDbError('stale_computation');
   return replaceLineage(issuer,market,[{issuer_id:issuer,state_rev:basedOnRev}],input);
  },
  async readFacts(issuer,market,o){const r=readLineage([issuer],market,o);return {stateRev:r.stateRevs[0].state_rev,rows:r.rows,truncated:r.truncated};},
  async factsByIds(ids){return [...new Set(ids)].sort().map(id=>facts.get(id)).filter((f):f is FactRow=>!!f).map(f=>clone(f));},   // deduped, ordered by fact_id
  async openConflicts(issuer,market){
   const prefix=conflictPrefix(issuer,market);
   const rows=(await items({status:'open',reason_code:'same_day_conflict'})).filter(i=>String(i.natural_key).startsWith(prefix));
   rows.sort((a,b)=>cmp(String(a.created_at),String(b.created_at))||cmp(String(a.id),String(b.id)));
   return rows.map(i=>conflictFromItem({id:String(i.id),natural_key:String(i.natural_key),payload:(i.payload as Record<string,unknown>|undefined)??{}}));
  },
  async filingsOfIssuer(issuer,market,opts){
   const rows=[...filings.values()].filter(g=>g.issuer_id===issuer&&g.market===market&&(opts.from===undefined||g.available_date>=opts.from)&&(opts.to===undefined||g.available_date<=opts.to)&&(!opts.unlinkedOnly||g.document_ref===null));
   rows.sort((a,b)=>cmp(b.available_date,a.available_date)||cmp(a.filing_id,b.filing_id));
   return clone(opts.limit===undefined?rows:rows.slice(0,opts.limit));   // no implicit cap: complete-set read (round-1 #7)
  },
.
..
agents
launch.json
scratch
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-ToDVe4IP' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-l8uF3HSY' (errno=Operation not permitted)
0bf3b19 feat(facts): FactsDb plan-3 extension in all three implementations (lineage, acceptance, adoption, restore, cursor, topology) (F3-4)

exec
/bin/zsh -lc 'node node_modules/typescript/bin/tsc --noEmit --incremental false' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 6210ms:
exec
/bin/zsh -lc "sed -n '481,575p' supabase/migrations/20261107091000_facts_extensions.sql; sed -n '422,468p' supabase/migrations/20261107091000_facts_extensions.sql; sed -n '609,650p' supabase/migrations/20261107091000_facts_extensions.sql; cat vitest.config.*" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
create or replace function public.adopt_candidate(p_item uuid, p_index int, p_batch uuid, p_expected_rev bigint, p_resolved_by uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare q public.dq_quarantine; c jsonb; g public.filings; r public.fact_sync_runs; b public.ingest_batches;
        v_source text; v_market text; v_gen int; v_nk_gen int; v_versions text[]; v_rev bigint;
        v_ps date; v_pe date; v_value numeric; v_run uuid := gen_random_uuid(); v_fact uuid := gen_random_uuid(); v_t uuid; v_k text;
        v_lineage uuid[]; v_now uuid[]; v_locked int;
begin
  if p_resolved_by is null then raise exception 'invalid_resolver' using errcode = '22023'; end if;
  select * into q from public.dq_quarantine where id = p_item;
  if not found or q.status <> 'open' then raise exception 'item_not_open' using errcode = 'P0001'; end if;
  if q.table_name <> 'financial_facts' or q.reason_code <> 'ambiguous_value' or q.dataset not in ('facts.us','facts.cn') then
    raise exception 'invalid_choice' using errcode = '22023';
  end if;
  if coalesce(jsonb_typeof(q.payload -> 'candidates'), '') <> 'array' or p_index is null or p_index < 0 or p_index >= jsonb_array_length(q.payload -> 'candidates') then
    raise exception 'invalid_choice' using errcode = '22023';
  end if;
  c := q.payload -> 'candidates' -> p_index;
  if jsonb_typeof(c) <> 'object'
     or coalesce(jsonb_typeof(c -> 'concept'), '') <> 'string' or coalesce(jsonb_typeof(c -> 'sourceConcept'), '') <> 'string'
     or coalesce(jsonb_typeof(c -> 'unit'), '') <> 'string' or coalesce(jsonb_typeof(c -> 'filingRef'), '') <> 'string'
     or coalesce(jsonb_typeof(c -> 'rawHash'), '') <> 'string' or coalesce(jsonb_typeof(c -> 'value'), '') <> 'string'
     or coalesce(jsonb_typeof(c -> 'periodEnd'), '') <> 'string' or coalesce(jsonb_typeof(c -> 'periodStart'), 'missing') not in ('null', 'string')
     or coalesce(c ->> 'statement', '') not in ('IS','BS','CF','DEI')
     or coalesce(c ->> 'duration', '') not in ('3M','6M','9M','12M','INSTANT')
     or coalesce(c ->> 'consolidation', '') not in ('consolidated','parent') then
    raise exception 'invalid_candidate' using errcode = '22023';
  end if;
  if length(c ->> 'concept') not between 1 and 64 or length(c ->> 'sourceConcept') not between 1 and 256
     or length(c ->> 'unit') not between 1 and 16 or length(c ->> 'rawHash') not between 1 and 128
     or (c ->> 'value') !~ '^-?[0-9]+(\.[0-9]+)?$' or (c ->> 'periodEnd') !~ '^\d{4}-\d{2}-\d{2}$'
     or (jsonb_typeof(c -> 'periodStart') = 'string' and (c ->> 'periodStart') !~ '^\d{4}-\d{2}-\d{2}$')
     or ((jsonb_typeof(c -> 'periodStart') = 'null') <> ((c ->> 'duration') = 'INSTANT')) then
    raise exception 'invalid_candidate' using errcode = '22023';
  end if;
  begin
    v_pe := (c ->> 'periodEnd')::date;
    v_ps := (c ->> 'periodStart')::date;
    v_value := (c ->> 'value')::numeric;
  exception when others then
    raise exception 'invalid_candidate' using errcode = '22023';
  end;
  if v_ps is not null and not (v_ps < v_pe) then raise exception 'invalid_candidate' using errcode = '22023'; end if;
  v_market := case q.dataset when 'facts.us' then 'US' else 'CN' end;
  v_source := case q.dataset when 'facts.us' then 'edgar' else 'tushare' end;
  select * into g from public.filings where source = v_source and source_ref = c ->> 'filingRef';
  if not found or g.market <> v_market then raise exception 'filing_not_found' using errcode = 'P0001'; end if;
  if coalesce(q.payload ->> 'run_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'generation_moved' using errcode = 'P0001';
  end if;
  select * into r from public.fact_sync_runs where run_id = (q.payload ->> 'run_id')::uuid;
  if not found then raise exception 'generation_moved' using errcode = 'P0001'; end if;
  v_gen := r.mapping_gen;
  v_nk_gen := substring(q.natural_key from ':([0-9]+)$')::int;
  if v_nk_gen is distinct from v_gen or g.mapping_gen is distinct from v_gen or v_gen <= 0 or r.market <> g.market then
    raise exception 'generation_moved' using errcode = 'P0001';
  end if;
  select array_agg(distinct f.mapping_version) into v_versions from public.financial_facts f where f.run_id = r.run_id;
  if v_versions is null then
    select array_agg(distinct f.mapping_version) into v_versions from public.financial_facts f where f.filing_id = g.filing_id and f.mapping_gen = v_gen;
  end if;
  if v_versions is null or cardinality(v_versions) <> 1 then raise exception 'replay_required' using errcode = 'P0001'; end if;
  select * into b from public.ingest_batches where batch_id = p_batch;
  if not found or b.status <> 'running' or b.dataset <> q.dataset then raise exception 'batch_mismatch' using errcode = 'P0001'; end if;
  -- lock the whole lineage of the filing issuer's target (sorted by issuer_id; no cycle lock is taken here), then revalidate membership
  v_t := coalesce((select i.merged_into from public.issuers i where i.issuer_id = g.issuer_id), g.issuer_id);
  v_lineage := array(select l.i from (select v_t as i union select issuer_id from public.issuers where merged_into = v_t) l order by l.i);
  select count(*) into v_locked from (
    select 1 from public.fact_sync_scope s where s.issuer_id = any(v_lineage) and s.market = g.market order by s.issuer_id for update) x;
  if v_locked <> cardinality(v_lineage) then raise exception 'scope_missing' using errcode = 'P0001'; end if;
  v_now := array(select l.i from (select v_t as i union select issuer_id from public.issuers where merged_into = v_t) l order by l.i);
  if v_now <> v_lineage or not (g.issuer_id = any(v_now))
     or v_t is distinct from coalesce((select i.merged_into from public.issuers i where i.issuer_id = g.issuer_id), g.issuer_id)
     or not exists (select 1 from public.issuers i where i.issuer_id = v_t and i.status = 'active') then
    raise exception 'lineage_changed' using errcode = 'P0001';
  end if;
  select s.state_rev into v_rev from public.fact_sync_scope s where s.issuer_id = g.issuer_id and s.market = g.market;
  if not found then raise exception 'scope_missing' using errcode = 'P0001'; end if;
  if v_rev is distinct from p_expected_rev then raise exception 'stale_evaluation' using errcode = 'P0001'; end if;
  select * into q from public.dq_quarantine where id = p_item for update;
  if q.status <> 'open' then raise exception 'item_not_open' using errcode = 'P0001'; end if;
  if exists (select 1 from public.financial_facts f
             where f.issuer_id = g.issuer_id and f.concept = c ->> 'concept' and f.period_start is not distinct from v_ps and f.period_end = v_pe
               and f.consolidation = c ->> 'consolidation' and f.unit = c ->> 'unit' and f.filing_id = g.filing_id and f.mapping_gen = v_gen) then
    raise exception 'duplicate' using errcode = 'P0001';
  end if;
  v_k := (c ->> 'concept') || ':' || coalesce(c ->> 'periodStart', '') || ':' || (c ->> 'periodEnd') || ':' || (c ->> 'consolidation') || ':' || (c ->> 'unit');
  if exists (select 1 from public.financial_facts f join public.filings fg on fg.filing_id = f.filing_id and fg.mapping_gen = f.mapping_gen
             where f.issuer_id = any(v_lineage) and f.market = g.market and f.status = 'ok' and f.concept = c ->> 'concept'
               and f.period_start is not distinct from v_ps and f.period_end = v_pe and f.consolidation = c ->> 'consolidation' and f.unit = c ->> 'unit'
               and f.available_date = g.available_date and f.value <> v_value)
     or exists (select 1 from public.dq_quarantine d
                where d.table_name = 'financial_facts' and d.status = 'open' and d.reason_code = 'same_day_conflict'
                  and d.payload -> 'key' ->> 'issuer_id' in (select l::text from unnest(v_lineage) l) and d.payload -> 'key' ->> 'market' = g.market
                  and d.payload -> 'key' ->> 'concept' = c ->> 'concept'
                  and coalesce(d.payload -> 'key' ->> 'period_start', '') = coalesce(c ->> 'periodStart', '')
create or replace function public.fact_promote_rows(p_issuer uuid, p_market text, p_fact_ids uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.financial_facts f set status = 'ok'
  from public.fact_sync_runs r, public.filings g
  where f.fact_id = any(p_fact_ids) and f.issuer_id = p_issuer and f.market = p_market and f.status = 'quarantined'
    and r.run_id = f.run_id and r.status = 'published'
    and g.filing_id = f.filing_id and g.mapping_gen = f.mapping_gen
    and not exists (
      select 1 from public.dq_quarantine q
      where q.table_name = 'financial_facts' and q.status = 'open'
        and jsonb_typeof(q.payload -> 'fact_ids') = 'array' and q.payload -> 'fact_ids' ? f.fact_id::text)
    and not exists (
      select 1 from public.dq_quarantine q
      where q.table_name = 'financial_facts' and q.reason_code = 'same_day_conflict' and q.status = 'open'
        and q.payload -> 'key' ->> 'issuer_id' = f.issuer_id::text and q.payload -> 'key' ->> 'market' = f.market
        and q.payload -> 'key' ->> 'concept' = f.concept
        and f.period_start is not distinct from nullif(q.payload -> 'key' ->> 'period_start', '')::date
        and (q.payload -> 'key' ->> 'period_end')::date = f.period_end
        and q.payload -> 'key' ->> 'consolidation' = f.consolidation and q.payload -> 'key' ->> 'unit' = f.unit
        and (q.payload -> 'key' ->> 'available_date')::date = f.available_date)
    and not exists (
      select 1 from public.dq_quarantine q
      where q.table_name = 'financial_facts' and q.reason_code = 'same_day_conflict' and q.status <> 'open'
        and jsonb_typeof(q.payload -> 'fact_ids') = 'array' and q.payload -> 'fact_ids' ? f.fact_id::text
        and not (coalesce(q.detail -> 'chosen_fact_ids', '[]'::jsonb) ? f.fact_id::text))
    and not exists (
      select 1 from public.dq_quarantine q
      where q.table_name = 'financial_facts' and q.reason_code = 'lineage_conflict' and q.status <> 'open'
        and ((jsonb_typeof(q.payload -> 'fact_ids') = 'array' and q.payload -> 'fact_ids' ? f.fact_id::text)
             or (jsonb_typeof(q.detail -> 'quarantined_fact_ids') = 'array' and q.detail -> 'quarantined_fact_ids' ? f.fact_id::text))
        and not (coalesce(q.detail -> 'chosen_fact_ids', '[]'::jsonb) ? f.fact_id::text))
    and not exists (
      select 1 from public.dq_quarantine q
      where q.table_name = 'financial_facts' and q.reason_code = 'reconcile_mismatch'
        and jsonb_typeof(q.payload -> 'fact_ids') = 'array' and q.payload -> 'fact_ids' ? f.fact_id::text
        and (q.status <> 'resolved_accept' or (q.detail -> 'latest_result' -> 'passed') is distinct from 'true'::jsonb));
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.fact_promote_rows(uuid, text, uuid[]) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------- 8. adopt a quarantined candidate (spec §3.2 adopt_candidate, §4.6, T1, T5, U3)
-- The item is an open ambiguous_value of facts.us / facts.cn; the persisted candidate is the plan-2
-- FactCandidate (camelCase) and is mapped field by field (anything missing or ill-typed →
-- invalid_candidate). The filing comes from (source by market, source_ref = filingRef) and gives
create or replace function public.restore_reconciled(p_item uuid, p_batch uuid, p_inputs_hash_now text, p_resolved_by uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare q public.dq_quarantine; v_issuer uuid; v_market text; v_ids uuid[]; v_before uuid[]; v_promoted int := 0; v_skipped jsonb;
begin
  if p_resolved_by is null then raise exception 'invalid_resolver' using errcode = '22023'; end if;
  select * into q from public.dq_quarantine where id = p_item;
  if not found or q.status <> 'open' or q.table_name <> 'financial_facts' or q.reason_code <> 'reconcile_mismatch' then
    raise exception 'item_not_open' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.ingest_batches where batch_id = p_batch and status = 'running') then raise exception 'batch_mismatch' using errcode = 'P0001'; end if;
  v_ids := public.fact_item_members(q.payload);
  select f.issuer_id, f.market into v_issuer, v_market from public.financial_facts f where f.fact_id = any(v_ids) order by f.fact_id limit 1;
  if v_issuer is null and coalesce(q.detail ->> 'issuer_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_issuer := (q.detail ->> 'issuer_id')::uuid; v_market := q.detail ->> 'market';
  end if;
  if v_issuer is not null then
    perform 1 from public.fact_sync_scope where issuer_id = v_issuer and market = v_market for update;
  end if;
  select * into q from public.dq_quarantine where id = p_item for update;
  if q.status <> 'open' then raise exception 'item_not_open' using errcode = 'P0001'; end if;
  if (q.detail -> 'latest_result' -> 'passed') is distinct from 'true'::jsonb
     or p_inputs_hash_now is null or (q.detail -> 'latest_result' ->> 'inputs_hash') is distinct from p_inputs_hash_now then
    raise exception 'not_passing' using errcode = 'P0001';
  end if;
  v_ids := public.fact_item_members(q.payload);
  update public.dq_quarantine
  set status = 'resolved_accept', resolved_by = p_resolved_by, resolved_at = now(),
      detail = detail || jsonb_build_object('restored_by_batch', p_batch, 'chosen_fact_ids', to_jsonb(v_ids),
                                            'hook', jsonb_build_object('stage', 'materialize', 'state', 'pending', 'at', to_jsonb(now())))
  where id = p_item;
  v_before := array(select f.fact_id from public.financial_facts f where f.fact_id = any(v_ids) and f.status = 'quarantined');
  if v_issuer is not null then
    v_promoted := public.fact_promote_rows(v_issuer, v_market, v_ids);
    update public.fact_sync_scope set state_rev = state_rev + 1, updated_at = now() where issuer_id = v_issuer and market = v_market;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('fact_id', x.id,
           'reason', case when f.fact_id is null then 'missing' when not (x.id = any(v_before)) then 'not_quarantined' else 'ineligible' end) order by x.id), '[]'::jsonb)
    into v_skipped
  from unnest(v_ids) as x(id) left join public.financial_facts f on f.fact_id = x.id
  where f.fact_id is null or not (x.id = any(v_before)) or f.status <> 'ok';
  return jsonb_build_object('promoted', v_promoted, 'skipped', v_skipped);
end $$;
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});

exec
/bin/zsh -lc "cat src/lib/db/memory-table-client.ts | head -160; sed -n '685,735p' src/lib/facts/memory-facts-db.ts; sed -n '107,155p' supabase/migrations/20261107091000_facts_extensions.sql; grep -R -n 'filingsForCalendar\\|readFactsLineage\\|adoptCandidate' src --exclude='memory-facts-db.ts' --exclude='db.test.ts' --exclude='types.ts' --exclude='db.ts' --exclude='pg-facts-db.ts' | head -35" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 65ms:
// In-memory TableClient for unit tests. Optional `keys` declares ONE unique key (the primary key)
// per table so duplicate inserts, key-changing updates and upserts fail like PostgreSQL would
// (TableError code 23505); an upsert whose onConflict is not exactly that key set fails with
// 42P10 like PostgreSQL's "no unique constraint matching ON CONFLICT". Rows are deep-copied in
// and out so callers never share jsonb references with the store.
// Differences from PostgreSQL to keep in mind:
//  - no column defaults, generated values, triggers or check constraints: write every column;
//  - ordering and range filters (gte/lt) compare numbers numerically and everything else as
//    strings by UTF-16 code unit, which matches PostgreSQL only under C collation (ISO-8601
//    timestamps in one fixed format compare correctly; mixed offsets or locales do not).
//  - rpc emulates only the plan-3 row-locking functions (append_claim_evidence, patch_quarantine_detail, set_security_identifier, set_issuer_identifier, set_security_window, patch_security_provenance, close_security_absent); one synchronous JS turn stands for the row lock.
import {TableError,assertMatch,assertUpdateMatch,checkRangeOptions,checkSelectOptions} from './table-client';
import type {RangeOptions,Row,TableClient} from './table-client';

const matches=(row:Row,match:Row)=>Object.entries(match).every(([k,v])=>row[k]===v);
const clone=<T>(v:T):T=>structuredClone(v);
const cmp=(x:unknown,y:unknown)=>{
 if(typeof x==='number'&&typeof y==='number')return x<y?-1:x>y?1:0;
 const a=String(x),b=String(y);return a<b?-1:a>b?1:0;
};
// PostgreSQL default: NULLS LAST ascending, NULLS FIRST descending.
const compare=(k:string,desc:boolean)=>(a:Row,b:Row)=>{
 const x=a[k],y=b[k];
 if(x==null||y==null)return x==null&&y==null?0:x==null?(desc?-1:1):(desc?1:-1);
 const c=cmp(x,y);return desc?-c:c;
};
// SQL comparison with NULL is never true, so null/missing values are excluded.
const inRange=(row:Row,opts:RangeOptions)=>
 Object.entries(opts.gte??{}).every(([k,v])=>row[k]!=null&&cmp(row[k],v)>=0)&&
 Object.entries(opts.lt??{}).every(([k,v])=>row[k]!=null&&cmp(row[k],v)<0);

// Plan 3 row-locking functions (migration 20261107090000, Task 1b) with the SQL functions' answers
// and error codes; an unknown function fails like PostgreSQL (42883).
const isObj=(v:unknown):v is Row=>!!v&&typeof v==='object'&&!Array.isArray(v);
const sameEvidence=(a:unknown,b:Row)=>isObj(a)&&a.source===b.source&&a.evidence_sha256===b.evidence_sha256;
const SHA256=/^[0-9a-f]{64}$/;
const MEMORY_RPC:Record<string,(rowsOf:(t:string)=>Row[],a:Row)=>unknown>={
 append_claim_evidence(rowsOf,a){
  const e=a.p_evidence;
  if(!isObj(e)||typeof e.source!=='string'||e.source.length<1||e.source.length>64||typeof e.as_of!=='string'||typeof e.evidence_sha256!=='string'||!SHA256.test(e.evidence_sha256))
   throw new TableError('rpc','append_claim_evidence','invalid_evidence','22023');
  const row=rowsOf('issuer_identifier_claims').find(r=>r.status==='pending'&&r.issuer_id===a.p_issuer&&r.id_type===a.p_id_type&&r.value===a.p_value&&r.op===a.p_op&&r.target_key===a.p_target_key);
  if(!row)return 'not_found';
  const d=isObj(row.detail)?row.detail:{};
  const sources=Array.isArray(d.sources)?d.sources:[];
  if(sameEvidence(d.evidence,e)||sources.some(s=>sameEvidence(s,e)))return 'duplicate';
  row.detail={...d,sources:[...sources,clone(e)]};
  return 'appended';
 },
 patch_quarantine_detail(rowsOf,a){
  const key=a.p_key;
  if(key!=='hook'&&key!=='audit_written')throw new TableError('rpc','patch_quarantine_detail','invalid_detail_key','22023');
  if(a.p_value===null||a.p_value===undefined)throw new TableError('rpc','patch_quarantine_detail','invalid_detail_key','22023');
  const row=rowsOf('dq_quarantine').find(r=>r.id===a.p_id);
  if(!row)return false;
  row.detail={...(isObj(row.detail)?row.detail:{}),[key]:clone(a.p_value)};
  return true;
 },
 // plan audit round 3, R2: guarded ISIN/FIGI write + one provenance key merged (never replaced) in one step
 // Task 4b review P1: guarded issuers.cninfo_org_id write + one provenance key merged (never replaced)
 set_issuer_identifier(rowsOf,a){
  const pv=a.p_provenance,v=a.p_value;
  if(a.p_column!=='cninfo_org_id')throw new TableError('rpc','set_issuer_identifier','invalid_column','22023');
  // not mirrored: SQL claim_provenance_safe (credential-like key names, URLs, UUIDs); callers pass fixed-shape provenance and the DB suite covers rejection
  if(typeof v!=='string'||v.trim()===''||!isObj(pv))throw new TableError('rpc','set_issuer_identifier','invalid_identifier_write','22023');
  const row=rowsOf('issuers').find(r=>r.issuer_id===a.p_issuer);
  if(!row)return 'not_found';
  if(row.status!=='active')return 'not_active';
  if(row.cninfo_org_id!=null)return row.cninfo_org_id===v?'duplicate':'conflict';
  if(rowsOf('issuers').some(r=>r!==row&&r.cninfo_org_id===v))return 'conflict';   // issuers_cninfo_idx
  row.cninfo_org_id=v;
  row.provenance={...(isObj(row.provenance)?row.provenance:{}),cninfo_org_id:clone(pv)};
  row.updated_at=new Date().toISOString();
  return 'written';
 },
 // Task 5a: guarded evidenced-window write (date + method + one provenance key). Not mirrored: claim_provenance_safe and the no-overlap exclusion (DB suite).
 set_security_window(rowsOf,a){
  const side=a.p_side,pv=a.p_provenance,nd=a.p_new_date,tm='delisting';
  if((side!=='from'&&side!=='to')||typeof nd!=='string'||!isObj(pv)||Object.keys(pv).length!==1||!(`valid_${side}` in pv)|| 'p_to_method' in a)
   throw new TableError('rpc','set_security_window','invalid_window_write','22023');
  if(!rowsOf('issuers').some(r=>r.issuer_id===a.p_issuer))return 'not_found';
  const row=rowsOf('issuer_securities').find(r=>r.issuer_id===a.p_issuer&&r.ticker===a.p_ticker&&r.valid_from===a.p_valid_from);
  if(!row)return 'not_found';
  const prov=isObj(row.provenance)?row.provenance:{};
  if(side==='from'){
   if(row.valid_from_method==='listing_date'&&row.valid_from===nd&&'valid_from' in prov)return 'duplicate';
   if((row.valid_from_method!=='first_observed'&&row.valid_from_method!=='curated')||nd>String(row.valid_from))return 'conflict';
   if(rowsOf('issuer_securities').some(o=>o!==row&&o.ticker===a.p_ticker&&String(o.valid_from)<String(row.valid_from)))return 'conflict';   // not the ticker's earliest row
   row.valid_from=nd;row.valid_from_method='listing_date';
  }else{
   if(row.valid_to===nd&&row.valid_to_method===tm&&'valid_to' in prov)return 'duplicate';
   if(row.valid_to!=null||nd<=String(row.valid_from))return 'conflict';
   row.valid_to=nd;row.valid_to_method=tm;
  }
  row.provenance={...prov,...clone(pv)};
  return 'written';
 },
 // Review fix: conditional sec_file_absent close (pending marker must match what the run observed).
 close_security_absent(rowsOf,a){
  const pv=a.p_provenance;
  if(typeof a.p_valid_to!=='string'||typeof a.p_expected_first_missing_sha256!=='string'||!isObj(pv)||Object.keys(pv).length!==1||!('valid_to' in pv))
   throw new TableError('rpc','close_security_absent','invalid_window_write','22023');
  if(!rowsOf('issuers').some(r=>r.issuer_id===a.p_issuer))return 'not_found';
  const row=rowsOf('issuer_securities').find(r=>r.issuer_id===a.p_issuer&&r.ticker===a.p_ticker&&r.valid_from===a.p_valid_from);
  if(!row)return 'not_found';
  const prov=isObj(row.provenance)?row.provenance:{};
  const pc=isObj(prov.pending_change)?prov.pending_change:{};
  if(row.valid_to===a.p_valid_to&&row.valid_to_method==='sec_file_absent'&&'valid_to' in prov&&pc.first_missing_sha256===a.p_expected_first_missing_sha256)return 'duplicate';
  if(row.valid_to!=null||a.p_valid_to<=String(row.valid_from)||pc.first_missing_sha256!==a.p_expected_first_missing_sha256||pc.first_missing_as_of!==a.p_valid_to)return 'conflict';
  row.valid_to=a.p_valid_to;row.valid_to_method='sec_file_absent';row.provenance={...prov,...clone(pv)};
  return 'written';
 },
 // Task 6b: the only writer of provenance.pending_change; open rows only. claim_provenance_safe is not mirrored (DB suite).
 patch_security_provenance(rowsOf,a){
  const set=a.p_set,rm=a.p_remove;
  if(!isObj(set)||Object.keys(set).some(k=>k!=='pending_change')||!Array.isArray(rm)||rm.some(k=>k!=='pending_change'))
   throw new TableError('rpc','patch_security_provenance','invalid_provenance_patch','22023');
  if(!rowsOf('issuers').some(r=>r.issuer_id===a.p_issuer))return 'not_found';
  const row=rowsOf('issuer_securities').find(r=>r.issuer_id===a.p_issuer&&r.ticker===a.p_ticker&&r.valid_from===a.p_valid_from&&r.valid_to==null);
  if(!row)return 'not_found';
  const prov=isObj(row.provenance)?row.provenance:{};
  const next:Row={...prov};for(const k of rm)delete next[k];Object.assign(next,clone(set));
  if(JSON.stringify(Object.entries(next).sort())===JSON.stringify(Object.entries(prov).sort()))return 'duplicate';
  row.provenance=next;
  return 'written';
 },
 set_security_identifier(rowsOf,a){
  const col=a.p_column,v=a.p_value,pv=a.p_provenance;
  if((col!=='isin'&&col!=='figi')||typeof v!=='string'||v===''||!isObj(pv)||Object.keys(pv).length!==1||!(col in pv))
   throw new TableError('rpc','set_security_identifier','invalid_identifier_write','22023');
  const row=rowsOf('issuer_securities').find(r=>r.issuer_id===a.p_issuer&&r.ticker===a.p_ticker&&r.valid_from===a.p_valid_from&&r.valid_to==null);
  if(!row)return 'not_found';
  const prov=isObj(row.provenance)?row.provenance:{};
  const cur=row[col]==null?null:String(row[col]);
  if(cur!==null&&cur!==v)return 'conflict';
  if(cur===v&&col in prov)return 'duplicate';
  row.provenance={...prov,...clone(pv)};
  if(cur===null){row[col]=v;return 'written';}
  return 'duplicate';
 },
};

export function memoryTableClient(keys:Record<string,string[]>={}):TableClient&{rows(table:string):Row[];rpc(fn:string,args:Row):Promise<unknown>}{
 const tables=new Map<string,Row[]>();
 const rowsOf=(t:string)=>{if(!tables.has(t))tables.set(t,[]);return tables.get(t)!;};
 const keyOf=(t:string,row:Row)=>(keys[t]??[]).map(k=>String(row[k])).join('\u0000');
 const dup=(op:string,t:string)=>new TableError(op,t,`duplicate key value violates unique constraint "${t}_pkey"`,'23505');
 const clashes=(t:string,row:Row,except?:Row)=>!!keys[t]&&rowsOf(t).some(r=>r!==except&&keyOf(t,r)===keyOf(t,row));
 return {
  rows:(t)=>clone(rowsOf(t)),
  async insert(t,row){
   if(clashes(t,row))throw dup('insert',t);
   const copy=clone(row);rowsOf(t).push(copy);return clone(copy);
  },
  async update(t,match,patch){
   assertUpdateMatch(match);
   const rows=rowsOf(t);
   const next=rows.map(r=>matches(r,match)?{...r,...clone(patch)}:r);
   // Check every resulting key before mutating any row, so a clash leaves the table unchanged.
   if(keys[t]){const seen=new Set<string>();for(const r of next){const k=keyOf(t,r);if(seen.has(k))throw dup('update',t);seen.add(k);}}
 let chain:Promise<unknown>=Promise.resolve();
 const serialize=<A extends unknown[],T>(fn:(...a:A)=>Promise<T>)=>(...a:A):Promise<T>=>{const next=chain.then(()=>fn(...a));chain=next.catch(()=>undefined);return next;};
 const db={...raw} as MemoryFactsDb;
 for(const k of ASYNC_METHODS){
  const f=raw[k] as unknown as (...a:unknown[])=>Promise<unknown>;
  (db as unknown as Record<string,unknown>)[k]=serialize(f);
 }
 return db;
}
-- p_based_on = [{issuer_id, state_rev}]: issuer ids unique and containing p_issuer. Every member's
-- scope row is locked in (issuer_id, market) order (a missing one → scope_missing); under the
-- locks the lineage {p_issuer} ∪ {merged_into = p_issuer} must equal the member set and every
-- state_rev must match, else stale_computation. Stored vector: issuer_id ascending.
create or replace function public.replace_financial_metrics_lineage(p_issuer uuid, p_market text, p_based_on jsonb, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare v_members uuid[]; v_norm jsonb; v_locked int; v_lineage uuid[]; v_rev bigint; n int;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_rows' using errcode = '22023'; end if;
  if p_issuer is null or p_market is null or p_market not in ('US','CN') then raise exception 'invalid_based_on' using errcode = '22023'; end if;
  if p_based_on is null or jsonb_typeof(p_based_on) <> 'array' or jsonb_array_length(p_based_on) = 0
     or exists (select 1 from jsonb_array_elements(p_based_on) e
                where jsonb_typeof(e) <> 'object'
                   or coalesce(jsonb_typeof(e -> 'issuer_id'), '') <> 'string'
                   or coalesce(jsonb_typeof(e -> 'state_rev'), '') <> 'number'
                   or (e ->> 'issuer_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                   or (e ->> 'state_rev') !~ '^[0-9]+$') then
    raise exception 'invalid_based_on' using errcode = '22023';
  end if;
  select array_agg((e ->> 'issuer_id')::uuid order by (e ->> 'issuer_id')::uuid),
         jsonb_agg(jsonb_build_object('issuer_id', (e ->> 'issuer_id')::uuid, 'state_rev', (e ->> 'state_rev')::bigint) order by (e ->> 'issuer_id')::uuid)
    into v_members, v_norm
  from jsonb_array_elements(p_based_on) e;
  if cardinality(v_members) <> (select count(distinct m) from unnest(v_members) m) or not (p_issuer = any(v_members)) then
    raise exception 'invalid_based_on' using errcode = '22023';
  end if;
  select count(*) into v_locked from (
    select 1 from public.fact_sync_scope s where s.issuer_id = any(v_members) and s.market = p_market order by s.issuer_id for update) x;
  if v_locked <> cardinality(v_members) then raise exception 'scope_missing' using errcode = 'P0001'; end if;
  -- a merged / dissolved issuer is no longer a materialisation target: the caller re-resolves T(i) and retries
  if not exists (select 1 from public.issuers where issuer_id = p_issuer and status = 'active') then raise exception 'stale_computation' using errcode = 'P0001'; end if;
  select array_agg(l.i order by l.i) into v_lineage
  from (select p_issuer as i union select issuer_id from public.issuers where merged_into = p_issuer) l;
  if v_lineage is distinct from v_members then raise exception 'stale_computation' using errcode = 'P0001'; end if;
  if exists (select 1 from jsonb_array_elements(v_norm) e
             join public.fact_sync_scope s on s.issuer_id = (e ->> 'issuer_id')::uuid and s.market = p_market
             where s.state_rev <> (e ->> 'state_rev')::bigint) then
    raise exception 'stale_computation' using errcode = 'P0001';
  end if;
  select state_rev into v_rev from public.fact_sync_scope where issuer_id = p_issuer and market = p_market;
  delete from public.financial_metrics where issuer_id = p_issuer and market = p_market;
  insert into public.financial_metrics (issuer_id, market, metric, period_start, period_end, duration, value, unit, input_unit, basis, formula_version, inputs, based_on_rev, based_on_lineage, as_of)
  select p_issuer, p_market, x ->> 'metric', (x ->> 'period_start')::date, (x ->> 'period_end')::date, x ->> 'duration', (x ->> 'value')::numeric,
         x ->> 'unit', x ->> 'input_unit', x ->> 'basis', x ->> 'formula_version', coalesce(x -> 'inputs', '[]'::jsonb), v_rev, v_norm, (x ->> 'as_of')::date
  from jsonb_array_elements(p_rows) x;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.replace_financial_metrics_lineage(uuid, text, jsonb, jsonb) from public, anon, authenticated;

exec
/bin/zsh -lc 'node node_modules/vitest/vitest.mjs run src/lib/facts/db.test.ts src/lib/facts/derive.test.ts --configLoader runner --no-cache' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 172ms:
failed to load config from /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/vitest.config.ts

⎯⎯⎯⎯⎯⎯⎯ Startup Error ⎯⎯⎯⎯⎯⎯⎯⎯
ReferenceError: __dirname is not defined
    at eval (/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/vitest.config.ts:10:65)
    at async ESModulesEvaluator.runInlinedModule (file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/node_modules/vite/dist/node/module-runner.js:809:3)
    at async ModuleRunner.directRequest (file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/node_modules/vite/dist/node/module-runner.js:1270:59)
    at async ModuleRunner.cachedRequest (file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/node_modules/vite/dist/node/module-runner.js:1177:73)
    at async ModuleRunner.import (file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/node_modules/vite/dist/node/module-runner.js:1132:10)
    at async runnerImport (file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/node_modules/vite/dist/node/chunks/node.js:36558:18)
    at async runnerImportConfigFile (file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/node_modules/vite/dist/node/chunks/node.js:37336:35)
    at async loadConfigFromFile (file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/node_modules/vite/dist/node/chunks/node.js:37305:42)
    at async resolveConfig (file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/node_modules/vite/dist/node/chunks/node.js:36906:22)
    at async _createServer (file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/node_modules/vite/dist/node/chunks/node.js:24268:65)




exec
/bin/zsh -lc "node --input-type=module -e 'import {startVitest} from \"vitest/node\"; const v=await startVitest(\"test\",[\"src/lib/facts/db.test.ts\",\"src/lib/facts/derive.test.ts\"],{config:false,watch:false,cache:false},{resolve:{alias:{\"@\":process.cwd()+\"/src\"}}}); await v?.close();'" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 252ms:

 RUN  v4.1.11 /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61

 ❯ src/lib/facts/derive.test.ts (0 test)
 ❯ src/lib/facts/db.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/lib/facts/db.test.ts [ src/lib/facts/db.test.ts ]
 FAIL  src/lib/facts/derive.test.ts [ src/lib/facts/derive.test.ts ]
Error: EPERM: operation not permitted, mkdir '/var/folders/97/wmwg4qzx02j74c3n73nh438w0000gn/T/5vb7ujRt9LjNVojM0NNoL/ssr'
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯


 Test Files  2 failed (2)
      Tests  no tests
   Start at  02:45:22
   Duration  172ms (transform 0ms, setup 0ms, import 0ms, tests 0ms, environment 0ms)


codex
No actionable regressions were identified in the changes or their alignment with the SQL implementations. Type checking passed; test execution was blocked by the read-only sandbox.
No actionable regressions were identified in the changes or their alignment with the SQL implementations. Type checking passed; test execution was blocked by the read-only sandbox.

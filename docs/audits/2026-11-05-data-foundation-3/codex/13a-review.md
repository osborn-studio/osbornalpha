OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b0b9-5929-7581-886a-5e19f2bd9841
--------
user
commit 4bf500b
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; cat /Users/osborn/.agents/skills/using-agent-skills/SKILL.md; git status --short; git show --stat 4bf500b; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 4178ms:
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
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-oKbjKkuR' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-MN3hvhWr' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/13a-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-S8yHT6RU' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-cGKKyVvy' (errno=Operation not permitted)
commit 4bf500b3f762f7f6a06e9c63397e1bcc3e12ad14
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 03:57:57 2026 -0800

    feat(dq): reconcile contract types, exact decimal comparison, inputs_hash, out-of-cycle record
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

 src/lib/dq/reconcile/decimal.test.ts     | 54 +++++++++++++++++++++++++++++++
 src/lib/dq/reconcile/decimal.ts          | 55 ++++++++++++++++++++++++++++++++
 src/lib/dq/reconcile/inputs-hash.test.ts | 23 +++++++++++++
 src/lib/dq/reconcile/inputs-hash.ts      | 16 ++++++++++
 src/lib/dq/reconcile/record.test.ts      | 38 ++++++++++++++++++++++
 src/lib/dq/reconcile/record.ts           | 35 ++++++++++++++++++++
 src/lib/dq/reconcile/types.ts            | 26 ++++++++++++---
 7 files changed, 243 insertions(+), 4 deletions(-)

exec
/bin/zsh -lc 'pwd; ls -a | head -30; for p in /AGENTS.md /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do if [ -f "$p" ]; then echo "$p"; cat "$p"; fi; done; git show 4bf500b; find . -name '"'AGENTS*' -o -name 'CLAUDE.md'" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 332ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
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
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-vVN7zZPI' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-lLmPH3hd' (errno=Operation not permitted)
commit 4bf500b3f762f7f6a06e9c63397e1bcc3e12ad14
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 03:57:57 2026 -0800

    feat(dq): reconcile contract types, exact decimal comparison, inputs_hash, out-of-cycle record
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/dq/reconcile/decimal.test.ts b/src/lib/dq/reconcile/decimal.test.ts
new file mode 100644
index 0000000..2514be4
--- /dev/null
+++ b/src/lib/dq/reconcile/decimal.test.ts
@@ -0,0 +1,54 @@
+// src/lib/dq/reconcile/decimal.test.ts
+import {describe,expect,it} from 'vitest';
+import {absDecimal,addDecimal,compareDecimal,divDecimal,formatDecimal,isDecimalText,maxAbsDecimal,mulDecimal,parseDecimal,relDiff,subDecimal,withinRadius} from './decimal';
+
+describe('decimal (scaled BigInt, spec §5.1)',()=>{
+ it('parses canonical decimals into units/scale and formats them back',()=>{
+  expect(parseDecimal('383285000000')).toEqual({units:383285000000n,scale:0});
+  expect(parseDecimal('-6.160')).toEqual({units:-616n,scale:2});
+  expect(parseDecimal('1e-3')).toEqual({units:1n,scale:3});
+  expect(formatDecimal({units:-616n,scale:2})).toBe('-6.16');
+  expect(formatDecimal({units:5n,scale:3})).toBe('0.005');
+  expect(()=>parseDecimal('')).toThrow(/invalid_decimal/);
+  expect(()=>parseDecimal('1,000')).toThrow(/invalid_decimal/);
+  expect(isDecimalText('12.5')).toBe(true);expect(isDecimalText('NaN')).toBe(false);
+ });
+ it('compares 20-digit integers exactly where Number would not',()=>{
+  const a='12345678901234567890',b='12345678901234567891';
+  expect(Number(a)).toBe(Number(b));              // the reason BigInt is used
+  expect(compareDecimal(a,b)).toBe(-1);expect(compareDecimal(b,a)).toBe(1);
+  expect(compareDecimal('1.10','1.1')).toBe(0);expect(compareDecimal('-0','0')).toBe(0);
+  expect(subDecimal(b,a)).toBe('1');
+ });
+ it('adds, subtracts, multiplies and takes absolute values without rounding',()=>{
+  expect(addDecimal('0.1','0.2')).toBe('0.3');
+  expect(subDecimal('100','100.005')).toBe('-0.005');
+  expect(absDecimal('-22354000000')).toBe('22354000000');
+  expect(mulDecimal('1.25','10000')).toBe('12500');
+  expect(mulDecimal('0.005','1000000')).toBe('5000');
+  expect(maxAbsDecimal('-7','3','1')).toBe('7');
+ });
+ it('divides with half-away-from-zero rounding and refuses a zero divisor',()=>{
+  expect(divDecimal('2','3',4)).toBe('0.6667');
+  expect(divDecimal('-2','3',4)).toBe('-0.6667');
+  expect(divDecimal('1','8',2)).toBe('0.13');
+  expect(divDecimal('-1','8',2)).toBe('-0.13');
+  expect(divDecimal('1','4',1)).toBe('0.3');
+  expect(()=>divDecimal('1','0')).toThrow('division_by_zero');
+ });
+ it('rel_diff = |l−r| / max(|l|,|r|,1)',()=>{
+  expect(relDiff('100','101')).toBe('0.0099009901');
+  expect(relDiff('0','0.5')).toBe('0.5');          // denominator floor of 1
+  expect(relDiff('-5','5')).toBe('2');
+  expect(relDiff('383285000000','383285000000')).toBe('0');
+ });
+ it('withinRadius is |value − center| <= radius by cross-multiplication (inclusive)',()=>{
+  expect(withinRadius('383285000000.004','383285000000','0.005')).toBe(true);
+  expect(withinRadius('383285000000.005','383285000000','0.005')).toBe(true);
+  expect(withinRadius('383285000000.006','383285000000','0.005')).toBe(false);
+  expect(withinRadius('1234504999','1234500000','5000')).toBe(true);
+  expect(withinRadius('1234505001','1234500000','5000')).toBe(false);
+  expect(withinRadius('-1','1','2')).toBe(true);
+  expect(()=>withinRadius('1','1','-1')).toThrow('negative_radius');
+ });
+});
diff --git a/src/lib/dq/reconcile/decimal.ts b/src/lib/dq/reconcile/decimal.ts
new file mode 100644
index 0000000..dd79f35
--- /dev/null
+++ b/src/lib/dq/reconcile/decimal.ts
@@ -0,0 +1,55 @@
+// src/lib/dq/reconcile/decimal.ts
+// Exact decimal arithmetic for reconciliation (spec §5.1). A decimal string becomes a scaled BigInt
+// {units, scale} (value = units / 10^scale). Comparisons align the two scales by multiplying with
+// powers of ten (cross-multiplication) and never divide; the only division is the reported ratio
+// (rel_diff, tolerance), rounded half away from zero at a fixed number of places. Every input goes
+// through plan 2's canonicalDecimal first, so exponents and leading/trailing zeros are accepted and
+// anything else throws invalid_decimal. Number() is never applied to a value.
+import {canonicalDecimal} from '../../facts/json-numbers';
+
+export interface ScaledDecimal{units:bigint;scale:number}
+const pow10=(k:number)=>10n**BigInt(k);
+const babs=(x:bigint)=>x<0n?-x:x;
+
+export function parseDecimal(s:string):ScaledDecimal{
+ const c=canonicalDecimal(s);
+ const neg=c.startsWith('-');const body=neg?c.slice(1):c;const [i,f='']=body.split('.');
+ const u=BigInt(i+f);
+ return {units:neg?-u:u,scale:f.length};
+}
+export function formatDecimal(d:ScaledDecimal):string{
+ const neg=d.units<0n;let digits=babs(d.units).toString();
+ if(d.scale>0){digits=digits.padStart(d.scale+1,'0');digits=`${digits.slice(0,-d.scale)}.${digits.slice(-d.scale)}`;}
+ return canonicalDecimal((neg?'-':'')+digits);
+}
+export const isDecimalText=(s:string):boolean=>{try{canonicalDecimal(s);return true;}catch{return false;}};
+function align(a:ScaledDecimal,b:ScaledDecimal):[bigint,bigint,number]{const s=Math.max(a.scale,b.scale);return [a.units*pow10(s-a.scale),b.units*pow10(s-b.scale),s];}
+
+export function compareDecimal(a:string,b:string):-1|0|1{const [x,y]=align(parseDecimal(a),parseDecimal(b));return x<y?-1:x>y?1:0;}
+export function addDecimal(a:string,b:string):string{const [x,y,s]=align(parseDecimal(a),parseDecimal(b));return formatDecimal({units:x+y,scale:s});}
+export function subDecimal(a:string,b:string):string{const [x,y,s]=align(parseDecimal(a),parseDecimal(b));return formatDecimal({units:x-y,scale:s});}
+export function absDecimal(a:string):string{const d=parseDecimal(a);return formatDecimal({units:babs(d.units),scale:d.scale});}
+export function mulDecimal(a:string,b:string):string{const x=parseDecimal(a),y=parseDecimal(b);return formatDecimal({units:x.units*y.units,scale:x.scale+y.scale});}
+/** max(|x|) over the arguments (at least one). */
+export function maxAbsDecimal(...xs:string[]):string{
+ if(xs.length===0)throw new Error('empty_max');
+ return xs.map(absDecimal).reduce((m,x)=>compareDecimal(x,m)>0?x:m);
+}
+/** a / b rounded half away from zero to `scale` places (one guard digit on the truncated absolute quotient). */
+export function divDecimal(a:string,b:string,scale=10):string{
+ if(!Number.isInteger(scale)||scale<0||scale>40)throw new Error('invalid_scale');
+ const [x,y]=align(parseDecimal(a),parseDecimal(b));
+ if(y===0n)throw new Error('division_by_zero');
+ const q=(babs(x)*pow10(scale+1))/babs(y);
+ const r=(q+5n)/10n;
+ return formatDecimal({units:(x<0n)!==(y<0n)?-r:r,scale});
+}
+/** |l − r| / max(|l|, |r|, 1) (spec §5.1). */
+export function relDiff(l:string,r:string,scale=10):string{return divDecimal(absDecimal(subDecimal(l,r)),maxAbsDecimal(l,r,'1'),scale);}
+/** |value − center| <= radius, by aligning scales (no division). */
+export function withinRadius(value:string,center:string,radius:string):boolean{
+ const rad=parseDecimal(radius);if(rad.units<0n)throw new Error('negative_radius');
+ const d=parseDecimal(subDecimal(value,center));
+ const [x,y]=align({units:babs(d.units),scale:d.scale},rad);
+ return x<=y;
+}
diff --git a/src/lib/dq/reconcile/inputs-hash.test.ts b/src/lib/dq/reconcile/inputs-hash.test.ts
new file mode 100644
index 0000000..465298b
--- /dev/null
+++ b/src/lib/dq/reconcile/inputs-hash.test.ts
@@ -0,0 +1,23 @@
+// src/lib/dq/reconcile/inputs-hash.test.ts
+import {createHash} from 'node:crypto';
+import {describe,expect,it} from 'vitest';
+import {computeInputsHash} from './inputs-hash';
+
+const base={left_raw_hash:'aa',right_sha256:'bb',gold_or_sample_sha256:'cc',parser_version:'ixbrl/1'};
+describe('computeInputsHash (spec §5.6)',()=>{
+ it('is sha256 hex of the four fields joined by \\n in the fixed order',()=>{
+  expect(computeInputsHash(base)).toBe(createHash('sha256').update('aa\nbb\ncc\nixbrl/1').digest('hex'));
+ });
+ it('changes when any one input changes, and when two inputs swap',()=>{
+  const h=computeInputsHash(base);
+  for(const k of Object.keys(base) as (keyof typeof base)[])expect(computeInputsHash({...base,[k]:`${base[k]}x`}),k).not.toBe(h);
+  expect(computeInputsHash({...base,left_raw_hash:'bb',right_sha256:'aa'})).not.toBe(h);
+ });
+ it('rejects a field containing a newline (the separator) or a non-string',()=>{
+  expect(()=>computeInputsHash({...base,right_sha256:'b\nb'})).toThrow('invalid_inputs:right_sha256');
+  expect(()=>computeInputsHash({...base,parser_version:undefined as unknown as string})).toThrow('invalid_inputs:parser_version');
+ });
+ it('accepts empty strings (a side that does not exist)',()=>{
+  expect(computeInputsHash({...base,left_raw_hash:''})).toMatch(/^[0-9a-f]{64}$/);
+ });
+});
diff --git a/src/lib/dq/reconcile/inputs-hash.ts b/src/lib/dq/reconcile/inputs-hash.ts
new file mode 100644
index 0000000..0e78cee
--- /dev/null
+++ b/src/lib/dq/reconcile/inputs-hash.ts
@@ -0,0 +1,16 @@
+// src/lib/dq/reconcile/inputs-hash.ts
+// inputs_hash of one reconciliation result (spec §5.6): sha256 hex of
+// left_raw_hash \n right_sha256 \n gold_or_sample_sha256 \n parser_version, in exactly this order. The
+// runner writes it with every result (and apply_reconcile_result copies it into latest_result); the
+// restore path recomputes it from the CURRENT inputs, so any input that changed after the last passing
+// run makes the two differ and restore_reconciled answers not_passing. A side that does not exist is
+// the empty string; a newline inside a field would make two different inputs collide and is refused.
+import {createHash} from 'node:crypto';
+
+export interface ReconcileInputs{left_raw_hash:string;right_sha256:string;gold_or_sample_sha256:string;parser_version:string}
+const FIELDS=['left_raw_hash','right_sha256','gold_or_sample_sha256','parser_version'] as const;
+
+export function computeInputsHash(inputs:ReconcileInputs):string{
+ const parts=FIELDS.map(k=>{const v=inputs[k];if(typeof v!=='string'||v.includes('\n'))throw new Error(`invalid_inputs:${k}`);return v;});
+ return createHash('sha256').update(parts.join('\n')).digest('hex');
+}
diff --git a/src/lib/dq/reconcile/record.test.ts b/src/lib/dq/reconcile/record.test.ts
new file mode 100644
index 0000000..47599cc
--- /dev/null
+++ b/src/lib/dq/reconcile/record.test.ts
@@ -0,0 +1,38 @@
+// src/lib/dq/reconcile/record.test.ts
+import {describe,expect,it} from 'vitest';
+import {memoryTableClient} from '../../db/memory-table-client';
+import {recordReconciliation} from './record';
+import type {ReconcileResultInput} from './types';
+
+const text=(over:Partial<ReconcileResultInput>={}):ReconcileResultInput=>({natural_key:'320193:0000320193-23-000106',kind:'text',outcome:'compared',passed:true,left_value:null,right_value:null,abs_diff:null,rel_diff:null,tolerance:'0',left_source:'sec.submissions',right_source:'edgar.ixbrl.dei',detail:{left_text:'Large accelerated filer',right_text:'Large Accelerated Filer'},action:'record',...over});
+
+describe('recordReconciliation (out-of-cycle rows, spec §5.1)',()=>{
+ it('writes one row with dataset reconcile.<pair>, the four cycle columns null and inputs_hash in detail',async()=>{
+  const t=memoryTableClient({dq_reconciliations:['id']});
+  const id=await recordReconciliation(t,{...text({inputs_hash:'h'}),pair:'sec.filer_category',batch_id:null});
+  const [row]=t.rows('dq_reconciliations');
+  expect(row).toMatchObject({id,dataset:'reconcile.sec.filer_category',pair:'sec.filer_category',kind:'text',outcome:'compared',passed:true,left_value:null,right_value:null,tolerance:'0',cycle_id:null,issuer_id:null,market:null,attempt:null,batch_id:null});
+  expect(row.detail).toEqual({left_text:'Large accelerated filer',right_text:'Large Accelerated Filer',inputs_hash:'h'});
+  expect(typeof row.created_at).toBe('string');
+ });
+ it('accepts a numeric compared row and a date row',async()=>{
+  const t=memoryTableClient({dq_reconciliations:['id']});
+  await recordReconciliation(t,{...text({kind:'numeric',left_value:'1',right_value:'2',abs_diff:'1',rel_diff:'0.5',passed:false}),pair:'entities.isin_hkex_vs_gleif',batch_id:'b'});
+  await recordReconciliation(t,{...text({kind:'date',passed:false,detail:{left_text:'2024-02-01',right_text:'2024-02-02'}}),pair:'sec.filing_date_vs_submissions',batch_id:'b'});
+  expect(t.rows('dq_reconciliations')).toHaveLength(2);
+ });
+ it('refuses cycle pairs, non-record actions, items, and rows that break the kind constraints',async()=>{
+  const t=memoryTableClient({dq_reconciliations:['id']});
+  const put=(over:Partial<ReconcileResultInput>,pair:Parameters<typeof recordReconciliation>[1]['pair']='sec.filer_category')=>recordReconciliation(t,{...text(over),pair,batch_id:null});
+  await expect(put({},'us.companyfacts_vs_ixbrl')).rejects.toThrow('cycle_pair_requires_runner');
+  await expect(put({action:'quarantine_left'})).rejects.toThrow('record_action_only');
+  await expect(put({item:{natural_key:'k',payload:{}}})).rejects.toThrow('record_has_no_item');
+  await expect(put({kind:'numeric',left_value:'1',right_value:null})).rejects.toThrow('numeric_sides_required');
+  await expect(put({left_value:'1'})).rejects.toThrow('nonnumeric_sides_must_be_null');
+  await expect(put({outcome:'right_missing',passed:true})).rejects.toThrow('passed_requires_compared');
+  await expect(put({kind:'numeric',left_value:'1,0',right_value:'1'})).rejects.toThrow('invalid_decimal_field');
+  await expect(put({tolerance:'-1'})).rejects.toThrow('invalid_tolerance');
+  await expect(put({},'bogus' as never)).rejects.toThrow('invalid_pair');
+  expect(t.rows('dq_reconciliations')).toHaveLength(0);
+ });
+});
diff --git a/src/lib/dq/reconcile/record.ts b/src/lib/dq/reconcile/record.ts
new file mode 100644
index 0000000..2e8042c
--- /dev/null
+++ b/src/lib/dq/reconcile/record.ts
@@ -0,0 +1,35 @@
+// src/lib/dq/reconcile/record.ts
+// Out-of-cycle reconciliation rows (spec §5.1): sec.filing_date_vs_submissions, sec.filer_category and
+// entities.isin_hkex_vs_gleif are recorded inline by their producers. Only action 'record' exists here:
+// no work item, no visibility change, and cycle_id/issuer_id/market/attempt all null (constraint
+// dq_reconciliations_cycle_cols). Cycle pairs must go through run.ts / apply_reconcile_result. The kind
+// rules mirror the two table constraints (numeric compared needs both sides; text/date keep the values in
+// detail.left_text/right_text and leave every numeric column null) so a bad row fails here with a code.
+import {randomUUID} from 'node:crypto';
+import type {TableClient} from '../../db/table-client';
+import {DATASETS} from '../datasets';
+import {compareDecimal,isDecimalText} from './decimal';
+import {CYCLE_PAIR_IDS,RECONCILE_PAIR_IDS} from './types';
+import type {ReconcilePairId,ReconcileResultInput} from './types';
+
+export async function recordReconciliation(tables:TableClient,input:ReconcileResultInput&{pair:ReconcilePairId;batch_id:string|null}):Promise<string>{
+ if(!(RECONCILE_PAIR_IDS as readonly string[]).includes(input.pair))throw new Error('invalid_pair');
+ if((CYCLE_PAIR_IDS as readonly string[]).includes(input.pair))throw new Error('cycle_pair_requires_runner');
+ if(input.action!=='record')throw new Error('record_action_only');
+ if(input.item!==undefined)throw new Error('record_has_no_item');
+ const numeric=input.kind==='numeric';
+ if(numeric&&input.outcome==='compared'&&(input.left_value===null||input.right_value===null))throw new Error('numeric_sides_required');
+ if(!numeric&&(input.left_value!==null||input.right_value!==null||input.abs_diff!==null||input.rel_diff!==null))throw new Error('nonnumeric_sides_must_be_null');
+ for(const v of [input.left_value,input.right_value,input.abs_diff,input.rel_diff,input.tolerance])if(v!==null&&!isDecimalText(v))throw new Error('invalid_decimal_field');
+ if(compareDecimal(input.tolerance,'0')<0)throw new Error('invalid_tolerance');
+ if(input.outcome!=='compared'&&input.passed)throw new Error('passed_requires_compared');
+ const id=randomUUID();
+ await tables.insert('dq_reconciliations',{
+  id,dataset:DATASETS.reconcile(input.pair),pair:input.pair,kind:input.kind,outcome:input.outcome,natural_key:input.natural_key,
+  left_source:input.left_source,right_source:input.right_source,left_value:input.left_value,right_value:input.right_value,
+  abs_diff:input.abs_diff,rel_diff:input.rel_diff,tolerance:input.tolerance,passed:input.passed,
+  detail:{...input.detail,...(input.inputs_hash===undefined?{}:{inputs_hash:input.inputs_hash})},
+  batch_id:input.batch_id,cycle_id:null,issuer_id:null,market:null,attempt:null,created_at:new Date().toISOString(),
+ });
+ return id;
+}
diff --git a/src/lib/dq/reconcile/types.ts b/src/lib/dq/reconcile/types.ts
index c8fc7d4..35baee0 100644
--- a/src/lib/dq/reconcile/types.ts
+++ b/src/lib/dq/reconcile/types.ts
@@ -1,8 +1,11 @@
 // src/lib/dq/reconcile/types.ts
-// Reconciliation shared types (spec 3 §5; plan 3 contract C3). Task 2 lands only the pair registry
-// ids, which the dataset registry needs; Task 9a adds the C3 subset FactsDb needs; Task 13 adds the rest
-// and must not change these names.
-import type {Market} from '../../facts/types';
+// Shared reconciliation contract (plan 3 C3; spec §3.1 dq_reconciliations / dq_reconcile_cycles /
+// dq_reconcile_cursor, §5.1 pairs, §5.5 runner). Task 2a: RECONCILE_PAIR_IDS / ReconcilePairId; Task 9a:
+// the FactsDb-facing subset (CYCLE_PAIR_IDS … MemberCounts); Task 13a: the runner/pair remainder below.
+// Values are canonical decimal strings everywhere (never Number). Type-only imports from the facts layer.
+import type {Budget,FactsDb,Market} from '../../facts/types';
+import type {TableClient} from '../../db/table-client';
+import type {RawStore} from '../raw-store';
 export const RECONCILE_PAIR_IDS=['us.companyfacts_vs_ixbrl','cn.tushare_vs_cninfo_pdf_gold','us.companyfacts_vs_gold','sec.filing_date_vs_submissions','sec.filer_category','entities.isin_hkex_vs_gleif','facts.lineage_same_day'] as const;
 export type ReconcilePairId=typeof RECONCILE_PAIR_IDS[number];
 /** Pairs run by the cycle runner; the other three are recorded inline by their producers (record.ts, cycle_id null). */
@@ -27,3 +30,18 @@ export interface PendingMember{issuer_id:string;market:Market;source:string}
 /** open_reconcile_cycle input (plan audit Q2): members frozen with their expected keys (the {naturalKey, locator} shape Task 13a names ExpectedKey); pending = exactly the snapshot entries the runner resolved keys for. */
 export interface OpenCycleInput{pair:CyclePairId;cycleId:string;startedAt:string;members:{issuer_id:string;market:Market;expected_keys:{naturalKey:string;locator:Record<string,unknown>}[]}[];pending:PendingMember[]}
 export interface OpenCycleResult{created:boolean;cycle:Record<string,unknown>;transferred:PendingMember[]}
+export const RECONCILE_OUTCOMES:readonly ReconcileOutcome[]=['compared','left_missing','left_unlinked','left_ambiguous','right_missing','unsupported','right_ambiguous','incomplete_gold'];
+export type CycleStatus='running'|'complete'|'complete_with_gaps';
+export type CursorState='pending'|'claimed'|'done'|'failed';
+/** A cursor whose attempts reached this value in state 'failed' is terminal (spec §5.5, S4). */
+export const MAX_CURSOR_ATTEMPTS=3;
+export interface ExpectedKey{naturalKey:string;locator:Record<string,unknown>}
+export interface MemberPlan{issuerId:string;market:Market;expectedKeys:ExpectedKey[]}
+export interface PairContext{db:FactsDb;tables:TableClient;raw:RawStore;now:()=>Date;budget:Budget;fetch:typeof fetch;readRepoFile:(path:string)=>Promise<Uint8Array>}
+export interface ReconcilePair{
+ id:CyclePairId;kind:ReconcileKind;left:string;right:string;
+ /** frozen at cycle creation (pending_members merged by the runner) */
+ members(ctx:PairContext):Promise<MemberPlan[]>;
+ /** exactly one result per member.expectedKeys entry, same order; never throws for data problems (outcome encodes them) */
+ evaluate(ctx:PairContext,member:MemberPlan):Promise<ReconcileResultInput[]>;
+}

exec
/bin/zsh -lc "cat src/lib/facts/json-numbers.ts; cat src/lib/db/table-client.ts; cat src/lib/dq/reconcile/types.ts; rg -n 'dq_reconciliations|recordReconciliation|computeInputsHash|relDiff' src supabase | head -100; cat package.json; ls .claude; ls /Users/osborn/.codex/config.toml" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
// src/lib/facts/json-numbers.ts
// Lossless numeric decoding (spec §6.2, audit N8/R3-7). JSON.parse would turn a 20-digit integer
// or 1e5 into a double, so scanJsonNumbers first rewrites every numeric literal outside strings
// into {"__num":"<literal>"} and parses that. decodeWithSchema then decodes by field name:
// control fields (cik, fy, code, has_more, report_type, …) → integer JS number; decimal fields
// (val, statement value columns) → canonicalDecimal string, inserted into numeric as text;
// any other numeric field → JS number. Equality of values is always on the canonical form.
export interface NumToken{__num:string}
export const isNumToken=(v:unknown):v is NumToken=>typeof v==='object'&&v!==null&&typeof (v as NumToken).__num==='string'&&Object.keys(v as object).length===1;

const TOKEN=/"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
const JSON_INT=/^-?(?:0|[1-9]\d*)(?![\d])/;
/** True when the string token at [end) is followed by optional JSON whitespace and ':' (i.e. it is an object key). */
function isKeyAt(text:string,end:number):boolean{
 for(let i=end;i<text.length;i++){
  const c=text.charCodeAt(i);
  if(c===32||c===9||c===10||c===13)continue;
  return c===58;
 }
 return false;
}
/**
 * JSON.parse with every numeric literal wrapped as {__num:'<original text>'}. Strings are left intact.
 * The input is first validated with a plain JSON.parse (malformed text fails fast, before the regex pass), and
 * fails closed if an object key decodes to the reserved marker `__num` (also in escaped spellings).
 */
export function scanJsonNumbers(input:Uint8Array|string):unknown{
 const text=typeof input==='string'?input:new TextDecoder('utf-8',{fatal:true}).decode(input);
 JSON.parse(text);
 const rewritten=text.replace(TOKEN,(m,offset:number)=>{
  if(m.charCodeAt(0)===34){
   // only a string that could decode to '__num' (7..64 chars, starts with '"_' or has an escape) is parsed
   if(m.length>=7&&m.length<=64&&(m.charCodeAt(1)===95||m.includes('\\'))&&isKeyAt(text,offset+m.length)&&JSON.parse(m)==='__num')throw new Error('reserved_key:__num');
   return m;
  }
  if(!JSON_INT.test(m))throw new Error(`invalid_json_number:${m.slice(0,40)}`);
  return `{"__num":"${m}"}`;
 });
 return JSON.parse(rewritten);
}

const DECIMAL=/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;
/** Raw-input cap, exponent cap and output cap are chosen together: every accepted output is <= MAX_LITERAL chars, so canonicalDecimal is idempotent. */
const MAX_LITERAL=512;
const MAX_EXPONENT=200;
/** Canonical decimal text: no exponent, no leading/trailing zeros, '-0' → '0'. Throws invalid_decimal. */
export function canonicalDecimal(raw:string):string{
 if(raw.length>MAX_LITERAL)throw new Error('invalid_decimal:length');
 const m=DECIMAL.exec(raw);
 if(!m)throw new Error(`invalid_decimal:${raw.slice(0,40)}`);
 const exp=m[4]===undefined?0:Number(m[4]);
 if(!Number.isSafeInteger(exp)||Math.abs(exp)>MAX_EXPONENT)throw new Error('invalid_decimal:exponent');
 const digits=m[2]+(m[3]??'');
 const point=m[2].length+exp;
 let intPart:string,fracPart:string;
 if(point<=0){intPart='0';fracPart='0'.repeat(-point)+digits;}
 else if(point>=digits.length){intPart=digits+'0'.repeat(point-digits.length);fracPart='';}
 else{intPart=digits.slice(0,point);fracPart=digits.slice(point);}
 intPart=intPart.replace(/^0+(?=\d)/,'');
 let end=fracPart.length;
 while(end>0&&fracPart.charCodeAt(end-1)===48)end--;
 fracPart=fracPart.slice(0,end);
 const zero=intPart==='0'&&fracPart==='';
 const out=`${m[1]==='-'&&!zero?'-':''}${intPart}${fracPart?`.${fracPart}`:''}`;
 if(out.length>MAX_LITERAL)throw new Error('invalid_decimal:length');
 return out;
}
export const decimalEquals=(a:string,b:string):boolean=>canonicalDecimal(a)===canonicalDecimal(b);

export interface NumberSchema{control:readonly string[];decimal:readonly string[]}
export const EDGAR_NUMBER_SCHEMA:NumberSchema={control:['cik','fy'],decimal:['val']};
/** Tushare control columns; the adapter adds the statement's value columns as `decimal`. */
export const TUSHARE_CONTROL_FIELDS:readonly string[]=['code','has_more','report_type','comp_type','is_calc','update_flag','end_type'];

export function decodeNumber(raw:string,mode:'control'|'decimal'|'number',field:string|null):string|number{
 if(mode==='decimal')return canonicalDecimal(raw);
 if(mode==='control'){
  // integrality on the exact decimal text first; Number() would round 1.00000000000000001 to 1 and 1e-400 to 0
  let canon:string;
  try{canon=canonicalDecimal(raw);}catch{throw new Error(`invalid_control_field:${field??''}`);}
  const n=Number(canon);
  if(!/^-?\d+$/.test(canon)||!Number.isSafeInteger(n))throw new Error(`invalid_control_field:${field??''}`);
  return n;
 }
 return Number(raw);
}
const modeOf=(schema:NumberSchema,field:string|null)=>field!==null&&schema.decimal.includes(field)?'decimal':field!==null&&schema.control.includes(field)?'control':'number';

/** Walks a scanJsonNumbers result and decodes every NumToken by the name of its nearest enclosing field. */
export function decodeWithSchema(value:unknown,schema:NumberSchema,field:string|null=null):unknown{
 if(isNumToken(value))return decodeNumber(value.__num,modeOf(schema,field),field);
 if(Array.isArray(value))return value.map(v=>decodeWithSchema(v,schema,field));
 if(value!==null&&typeof value==='object'){
  // fromEntries defines own properties, so a '__proto__' key stays data and never touches the prototype
  return Object.fromEntries(Object.entries(value as Record<string,unknown>).map(([k,v])=>[k,decodeWithSchema(v,schema,k)]));
 }
 return value;
}

/** Positional rows (Tushare items) → objects keyed by `fields`, each cell decoded by its column name. */
export function decodeColumns(fields:string[],items:unknown[][],schema:NumberSchema):Record<string,unknown>[]{
 return items.map(row=>{
  if(row.length!==fields.length)throw new Error(`invalid_row_width:${row.length}`);
  return Object.fromEntries(fields.map((f,i)=>[f,decodeWithSchema(row[i],schema,f)]));
 });
}
// Minimal table access used by dq/* and entities/* so logic is unit-testable with an
// in-memory client and runs in production over the service-role Supabase client.
// PostgREST caps every response (max_rows, default 1000), so select() returns at most one
// page. Reads that may exceed one page must use selectAll(), which pages in a fixed order.
import type {SupabaseClient} from '@supabase/supabase-js';

export type Row=Record<string,unknown>;
/** Inclusive lower (`gte`) and exclusive upper (`lt`) bounds per column. ISO timestamp strings compare as text, numbers numerically. */
export interface RangeOptions{gte?:Record<string,string|number>;lt?:Record<string,string|number>}
// offset requires orderBy: unordered pages are not stable across requests.
// limit is an integer 1..MAX_PAGE; offset a non-negative safe integer.
export interface SelectOptions extends RangeOptions{limit?:number;offset?:number;orderBy?:string;desc?:boolean}

/** Largest page PostgREST returns by default; also the limit and selectAll page-size ceiling. */
export const MAX_PAGE=1000;

/** Table operation failure; `code` is the PostgreSQL SQLSTATE when known (e.g. '23505' unique violation). */
export class TableError extends Error{
 readonly details?:string;
 readonly hint?:string;
 constructor(readonly op:string,readonly table:string,message:string,readonly code:string|null=null,extra:{details?:string|null;hint?:string|null;cause?:unknown}={}){
  super(`${table} ${op}: ${message}`,extra.cause===undefined?undefined:{cause:extra.cause});
  this.name='TableError';
  if(extra.details)this.details=extra.details;
  if(extra.hint)this.hint=extra.hint;
 }
}

export interface TableClient{
 insert(table:string,row:Row):Promise<Row>;
 /** Returns the number of rows the match hit. An empty match is rejected (no whole-table updates). */
 update(table:string,match:Row,patch:Row):Promise<number>;
 select(table:string,match:Row,opts?:SelectOptions):Promise<Row[]>;
 upsert(table:string,row:Row,onConflict:string):Promise<void>;
 count(table:string,match:Row,opts?:RangeOptions):Promise<number>;
 /**
  * Calls a service-role SQL function and returns its result (plan 3: the row-locking jsonb patches
  * append_claim_evidence / patch_quarantine_detail / set_security_identifier of migration 20261107090000). Optional so the landed
  * test stubs stay valid; callers go through callRpc, which fails loudly when it is missing.
  */
 rpc?(fn:string,args:Row):Promise<unknown>;
}

/** Calls `fn` through client.rpc. A client without rpc is a wiring error (rpc_unavailable:<fn>), never a silent no-op. */
export async function callRpc(client:TableClient,fn:string,args:Row):Promise<unknown>{
 if(!client.rpc)throw new Error(`rpc_unavailable:${fn}`);
 return client.rpc(fn,args);
}

/** Rejects `undefined` match values: they would otherwise be dropped or match nothing silently. */
export function assertMatch(match:Row):void{
 if(!match||typeof match!=='object')throw new Error('undefined_match_value');
 for(const v of Object.values(match))if(v===undefined)throw new Error('undefined_match_value');
}

export function assertUpdateMatch(match:Row):void{
 assertMatch(match);
 if(Object.keys(match).length===0)throw new Error('empty_update_match');
}

const okBound=(v:unknown)=>typeof v==='string'||(typeof v==='number'&&Number.isFinite(v));
function checkRange(opts:RangeOptions):void{
 for(const r of [opts.gte,opts.lt]){
  if(r===undefined)continue;
  if(!r||typeof r!=='object'||Object.values(r).some(v=>!okBound(v)))throw new Error('invalid_select_options');
 }
}

export function checkSelectOptions(opts:SelectOptions):void{
 if(opts.limit!==undefined&&(!Number.isSafeInteger(opts.limit)||opts.limit<1||opts.limit>MAX_PAGE))throw new Error('invalid_select_options');
 if(opts.offset!==undefined&&(!Number.isSafeInteger(opts.offset)||opts.offset<0))throw new Error('invalid_select_options');
 if(opts.offset!==undefined&&!opts.orderBy)throw new Error('offset_requires_orderBy');
 checkRange(opts);
}

export function checkRangeOptions(opts:RangeOptions):void{checkRange(opts);}

/**
 * Reads every matching row, paging by `offset` in `orderBy` order and stopping only on an empty
 * page, so a server max_rows below pageSize cannot truncate the result. `orderBy` must be a
 * unique column (ties make offset pages overlap or skip). Pages are separate requests, so the
 * result is not a snapshot: concurrent writes can be missed or seen twice.
 */
export async function selectAll(client:TableClient,table:string,match:Row,orderBy:string,pageSize=MAX_PAGE):Promise<Row[]>{
 if(!Number.isInteger(pageSize)||pageSize<1||pageSize>MAX_PAGE)throw new Error(`selectAll pageSize must be 1..${MAX_PAGE}`);
 const out:Row[]=[];
 for(let offset=0;;){
  const page=await client.select(table,match,{orderBy,offset,limit:pageSize});
  if(page.length===0)return out;
  out.push(...page);offset+=page.length;
 }
}

// `.eq(k,null)` renders `k=eq.null`, which never matches in SQL; null must use `.is`.
const applyMatch=(q:any,match:Row)=>{for(const [k,v] of Object.entries(match))q=v===null?q.is(k,null):q.eq(k,v);return q;};
const applyRange=(q:any,opts:RangeOptions)=>{
 for(const [k,v] of Object.entries(opts.gte??{}))q=q.gte(k,v);
 for(const [k,v] of Object.entries(opts.lt??{}))q=q.lt(k,v);
 return q;
};

interface PgError{message:string;code?:string;details?:string|null;hint?:string|null}

export function supabaseTableClient(client:SupabaseClient):TableClient{
 // The hand-maintained Database type does describe the dq/issuer tables, but TableClient takes
 // table names as plain strings so the same callers run over the in-memory client too; the
 // loosely typed handle keeps that parity instead of casting at every call site.
 const db=client as unknown as {from:(t:string)=>any};
 const fail=(op:string,table:string,error:PgError):never=>{throw new TableError(op,table,error.message,error.code??null,{details:error.details,hint:error.hint,cause:error});};
 return {
  async insert(table,row){const {data,error}=await db.from(table).insert(row).select().single();if(error)fail('insert',table,error);return data as Row;},
  // Exact count from Content-Range; no rows are returned. A missing count fails closed.
  async update(table,match,patch){
   assertUpdateMatch(match);
   const {count,error}=await applyMatch(db.from(table).update(patch,{count:'exact'}),match);
   if(error)fail('update',table,error);
   if(count===null||count===undefined)throw new Error('update_count_unavailable');
   return count as number;
  },
  async select(table,match,opts={}){
   assertMatch(match);checkSelectOptions(opts);
   let q=applyRange(applyMatch(db.from(table).select('*'),match),opts);
   if(opts.orderBy)q=q.order(opts.orderBy,{ascending:!opts.desc});
   if(opts.limit!==undefined||opts.offset!==undefined){const from=opts.offset??0;q=q.range(from,from+(opts.limit??MAX_PAGE)-1);}
   const {data,error}=await q;if(error)fail('select',table,error);return (data??[]) as Row[];
  },
  async upsert(table,row,onConflict){const {error}=await db.from(table).upsert(row,{onConflict});if(error)fail('upsert',table,error);},
  async count(table,match,opts={}){
   assertMatch(match);checkRangeOptions(opts);
   const {count,error}=await applyRange(applyMatch(db.from(table).select('*',{count:'exact',head:true}),match),opts);
   if(error)fail('count',table,error);
   if(count===null||count===undefined)throw new Error('count_unavailable');
   return count as number;
  },
  async rpc(fn,args){
   const {data,error}=await (client as unknown as {rpc:(f:string,a:Row)=>PromiseLike<{data:unknown;error:PgError|null}>}).rpc(fn,args);
   if(error)fail('rpc',fn,error);
   return data;
  },
 };
}
// src/lib/dq/reconcile/types.ts
// Shared reconciliation contract (plan 3 C3; spec §3.1 dq_reconciliations / dq_reconcile_cycles /
// dq_reconcile_cursor, §5.1 pairs, §5.5 runner). Task 2a: RECONCILE_PAIR_IDS / ReconcilePairId; Task 9a:
// the FactsDb-facing subset (CYCLE_PAIR_IDS … MemberCounts); Task 13a: the runner/pair remainder below.
// Values are canonical decimal strings everywhere (never Number). Type-only imports from the facts layer.
import type {Budget,FactsDb,Market} from '../../facts/types';
import type {TableClient} from '../../db/table-client';
import type {RawStore} from '../raw-store';
export const RECONCILE_PAIR_IDS=['us.companyfacts_vs_ixbrl','cn.tushare_vs_cninfo_pdf_gold','us.companyfacts_vs_gold','sec.filing_date_vs_submissions','sec.filer_category','entities.isin_hkex_vs_gleif','facts.lineage_same_day'] as const;
export type ReconcilePairId=typeof RECONCILE_PAIR_IDS[number];
/** Pairs run by the cycle runner; the other three are recorded inline by their producers (record.ts, cycle_id null). */
export const CYCLE_PAIR_IDS=['us.companyfacts_vs_ixbrl','cn.tushare_vs_cninfo_pdf_gold','us.companyfacts_vs_gold','facts.lineage_same_day'] as const satisfies readonly ReconcilePairId[];
export type CyclePairId=typeof CYCLE_PAIR_IDS[number];
export type ReconcileKind='numeric'|'text'|'date';
export type ReconcileOutcome='compared'|'left_missing'|'left_unlinked'|'left_ambiguous'|'right_missing'|'unsupported'|'right_ambiguous'|'incomplete_gold';
export type ReconcileAction='record'|'quarantine_left'|'review_item'|'lineage_item';
export interface Fence{pair:CyclePairId;cycle_id:string;issuer_id:string;market:Market;batch_id:string;attempt:number}
/** One per expected key; values are canonical decimal strings (never Number). */
export interface ReconcileResultInput{
 natural_key:string;kind:ReconcileKind;outcome:ReconcileOutcome;passed:boolean;
 left_value:string|null;right_value:string|null;abs_diff:string|null;rel_diff:string|null;tolerance:string;
 left_source:string;right_source:string;detail:Record<string,unknown>;
 action:ReconcileAction;left_fact_id?:string;inputs_hash?:string;
 item?:{natural_key:string;payload:Record<string,unknown>;detail?:Record<string,unknown>};   // for review_item / lineage_item / quarantine_left
}
export interface ApplyReconcileOutcome{reused:boolean;reconciliationId:string;itemId:string|null;quarantined:0|1;materialize:{issuerId:string;market:Market}|null}
export interface MemberCounts{compared_passed:number;compared_failed:number;not_compared:number}
/** set_merge's registration of a merge target (plan audit Q2): one entry per (target, market, merged source). */
export interface PendingMember{issuer_id:string;market:Market;source:string}
/** open_reconcile_cycle input (plan audit Q2): members frozen with their expected keys (the {naturalKey, locator} shape Task 13a names ExpectedKey); pending = exactly the snapshot entries the runner resolved keys for. */
export interface OpenCycleInput{pair:CyclePairId;cycleId:string;startedAt:string;members:{issuer_id:string;market:Market;expected_keys:{naturalKey:string;locator:Record<string,unknown>}[]}[];pending:PendingMember[]}
export interface OpenCycleResult{created:boolean;cycle:Record<string,unknown>;transferred:PendingMember[]}
export const RECONCILE_OUTCOMES:readonly ReconcileOutcome[]=['compared','left_missing','left_unlinked','left_ambiguous','right_missing','unsupported','right_ambiguous','incomplete_gold'];
export type CycleStatus='running'|'complete'|'complete_with_gaps';
export type CursorState='pending'|'claimed'|'done'|'failed';
/** A cursor whose attempts reached this value in state 'failed' is terminal (spec §5.5, S4). */
export const MAX_CURSOR_ATTEMPTS=3;
export interface ExpectedKey{naturalKey:string;locator:Record<string,unknown>}
export interface MemberPlan{issuerId:string;market:Market;expectedKeys:ExpectedKey[]}
export interface PairContext{db:FactsDb;tables:TableClient;raw:RawStore;now:()=>Date;budget:Budget;fetch:typeof fetch;readRepoFile:(path:string)=>Promise<Uint8Array>}
export interface ReconcilePair{
 id:CyclePairId;kind:ReconcileKind;left:string;right:string;
 /** frozen at cycle creation (pending_members merged by the runner) */
 members(ctx:PairContext):Promise<MemberPlan[]>;
 /** exactly one result per member.expectedKeys entry, same order; never throws for data problems (outcome encodes them) */
 evaluate(ctx:PairContext,member:MemberPlan):Promise<ReconcileResultInput[]>;
}
supabase/migrations/20261105090000_dq_foundation.sql:55:create table if not exists public.dq_reconciliations (
supabase/migrations/20261105090000_dq_foundation.sql:70:create index if not exists dq_reconciliations_failed_idx on public.dq_reconciliations(dataset, created_at desc) where passed = false;
supabase/migrations/20261105090000_dq_foundation.sql:71:create index if not exists dq_reconciliations_batch_idx on public.dq_reconciliations(batch_id);
supabase/migrations/20261105090000_dq_foundation.sql:72:comment on column public.dq_reconciliations.tolerance is 'Relative tolerance: |left-right| <= tolerance * max(|left|,|right|,1)';
supabase/migrations/20261105090000_dq_foundation.sql:89:  foreach t in array array['ingest_batches','dq_quarantine','dq_reconciliations','dq_freshness'] loop
supabase/migrations/20261107090000_identifiers_and_dq.sql:4:-- the claim/1 review queue (op, target_key, detail, resolution columns); dq_reconciliations gains
supabase/migrations/20261107090000_identifiers_and_dq.sql:69:-- ---------------------------------------------------------------- dq_reconciliations: pairs, kinds, outcomes, cycle rows (§3.1, T2)
supabase/migrations/20261107090000_identifiers_and_dq.sql:71:  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'dq_reconciliations' and column_name = 'pair') then
supabase/migrations/20261107090000_identifiers_and_dq.sql:72:    alter table public.dq_reconciliations
supabase/migrations/20261107090000_identifiers_and_dq.sql:82:    update public.dq_reconciliations set outcome = 'legacy';
supabase/migrations/20261107090000_identifiers_and_dq.sql:85:alter table public.dq_reconciliations
supabase/migrations/20261107090000_identifiers_and_dq.sql:86:  drop constraint if exists dq_reconciliations_pair_check,
supabase/migrations/20261107090000_identifiers_and_dq.sql:87:  drop constraint if exists dq_reconciliations_kind_check,
supabase/migrations/20261107090000_identifiers_and_dq.sql:88:  drop constraint if exists dq_reconciliations_outcome_check,
supabase/migrations/20261107090000_identifiers_and_dq.sql:89:  drop constraint if exists dq_reconciliations_detail_object,
supabase/migrations/20261107090000_identifiers_and_dq.sql:90:  drop constraint if exists dq_reconciliations_market_check,
supabase/migrations/20261107090000_identifiers_and_dq.sql:91:  drop constraint if exists dq_reconciliations_attempt_check,
supabase/migrations/20261107090000_identifiers_and_dq.sql:92:  drop constraint if exists dq_reconciliations_cycle_cols,
supabase/migrations/20261107090000_identifiers_and_dq.sql:93:  drop constraint if exists dq_reconciliations_numeric_sides,
supabase/migrations/20261107090000_identifiers_and_dq.sql:94:  drop constraint if exists dq_reconciliations_nonnumeric_sides,
supabase/migrations/20261107090000_identifiers_and_dq.sql:95:  add constraint dq_reconciliations_pair_check check (length(pair) between 1 and 64),
supabase/migrations/20261107090000_identifiers_and_dq.sql:96:  add constraint dq_reconciliations_kind_check check (kind in ('numeric','text','date')),
supabase/migrations/20261107090000_identifiers_and_dq.sql:97:  add constraint dq_reconciliations_outcome_check check (outcome in ('compared','left_missing','left_unlinked','left_ambiguous','right_missing','unsupported','right_ambiguous','incomplete_gold','legacy')),
supabase/migrations/20261107090000_identifiers_and_dq.sql:98:  add constraint dq_reconciliations_detail_object check (jsonb_typeof(detail) = 'object'),
supabase/migrations/20261107090000_identifiers_and_dq.sql:99:  add constraint dq_reconciliations_market_check check (market is null or market in ('US','CN')),
supabase/migrations/20261107090000_identifiers_and_dq.sql:100:  add constraint dq_reconciliations_attempt_check check (attempt is null or attempt >= 1),
supabase/migrations/20261107090000_identifiers_and_dq.sql:102:  add constraint dq_reconciliations_cycle_cols check ((cycle_id is null) = (issuer_id is null) and (cycle_id is null) = (market is null) and (cycle_id is null) = (attempt is null)),
supabase/migrations/20261107090000_identifiers_and_dq.sql:103:  add constraint dq_reconciliations_numeric_sides check (kind <> 'numeric' or outcome <> 'compared' or (left_value is not null and right_value is not null)),
supabase/migrations/20261107090000_identifiers_and_dq.sql:105:  add constraint dq_reconciliations_nonnumeric_sides check (kind = 'numeric' or (left_value is null and right_value is null and rel_diff is null and abs_diff is null));
supabase/migrations/20261107090000_identifiers_and_dq.sql:106:create index if not exists dq_reconciliations_pair_created_idx on public.dq_reconciliations(pair, created_at desc);
supabase/migrations/20261107090000_identifiers_and_dq.sql:108:create unique index if not exists dq_reconciliations_cycle_key on public.dq_reconciliations(pair, cycle_id, natural_key) where cycle_id is not null;
src/lib/dq/dashboard.test.ts:93:   if(table==='dq_reconciliations')return 2;
supabase/migrations/20261107091000_facts_extensions.sql:850:  from public.dq_reconciliations r
supabase/migrations/20261107091000_facts_extensions.sql:856:     or exists (select 1 from unnest(v_keys) k where not exists (select 1 from public.dq_reconciliations r
supabase/migrations/20261107091000_facts_extensions.sql:858:     or exists (select 1 from public.dq_reconciliations r
supabase/migrations/20261107091000_facts_extensions.sql:903:declare c public.dq_reconcile_cursor; v_existing public.dq_reconciliations; f public.financial_facts; v_run text;
supabase/migrations/20261107091000_facts_extensions.sql:939:  -- mirror dq_reconciliations_numeric_sides / _nonnumeric_sides as invalid_result (22023) before anything is read or written
supabase/migrations/20261107091000_facts_extensions.sql:945:  select * into v_existing from public.dq_reconciliations where pair = c.pair and cycle_id = c.cycle_id and natural_key = v_nk;
supabase/migrations/20261107091000_facts_extensions.sql:1015:  insert into public.dq_reconciliations (id, dataset, left_source, right_source, natural_key, left_value, right_value, abs_diff, rel_diff, tolerance, passed, batch_id,
src/lib/dq/dq-extensions.integration.test.ts:676:  const resultRows=(pair:string)=>q(`select natural_key,outcome,passed,attempt,issuer_id,market,cycle_id,dataset,batch_id,detail->>'item_id' item_id from public.dq_reconciliations where pair=$1 order by natural_key`,[pair]);
src/lib/dq/dq-extensions.integration.test.ts:744:   // dq_reconciliations_numeric_sides / _nonnumeric_sides surface as invalid_result (22023), not 23514, and write nothing
src/lib/dq/dq-extensions.integration.test.ts:767:   const kinds=await q(`select natural_key,kind,outcome from public.dq_reconciliations where pair=$1 order by natural_key`,[pair]);
src/lib/dq/rules.ts:36: const relDiff=Math.abs(left/scale-right/scale-expected/scale);
src/lib/dq/rules.ts:37: if(relDiff<=tolerance)return {ruleId,passed:true};
src/lib/dq/rules.ts:38: const diff=relDiff*scale;
src/lib/dq/rules.ts:39: return {ruleId,passed:false,detail:{left,right,expected,diff:Number.isFinite(diff)?diff:null,relDiff,tolerance}};
src/lib/dq/dashboard.ts:111:   client.count('dq_reconciliations',{passed:false}),
src/lib/dq/dashboard.ts:112:   client.select('dq_reconciliations',{passed:false},{orderBy:'created_at',desc:true,limit:DQ_RECENT_RECONCILIATIONS}),
src/lib/dq/dq-foundation.integration.test.ts:9:const TABLES=['ingest_batches','dq_quarantine','dq_reconciliations','dq_freshness'];
src/lib/dq/dq-foundation.integration.test.ts:49:   await admin.query(`delete from public.dq_reconciliations where dataset=any($1) or batch_id=any($2::uuid[])`,[datasets,batches]);
src/lib/dq/dq-foundation.integration.test.ts:114:  await admin.query(`insert into public.dq_reconciliations(id,dataset,left_source,right_source,natural_key,left_value,right_value,tolerance,passed,batch_id) values($1,$2,'a','b','k',1,1,0,true,$3)`,[recId,d,reconciled]);
src/lib/dq/dq-foundation.integration.test.ts:116:  const rec=(await admin.query(`select batch_id from public.dq_reconciliations where id=$1`,[recId])).rows[0];
src/lib/dq/facts-resolver.ts:63:/** Hash of the CURRENT reconciliation inputs of a reconcile_mismatch item (computeInputsHash over left raw_hash, the pair's CURRENT right evidence sha256, gold/sample sha256, parser version), or why it cannot be computed now. */
src/lib/dq/reconcile/inputs-hash.ts:13:export function computeInputsHash(inputs:ReconcileInputs):string{
src/lib/dq/reconcile/decimal.test.ts:3:import {absDecimal,addDecimal,compareDecimal,divDecimal,formatDecimal,isDecimalText,maxAbsDecimal,mulDecimal,parseDecimal,relDiff,subDecimal,withinRadius} from './decimal';
src/lib/dq/reconcile/decimal.test.ts:40:  expect(relDiff('100','101')).toBe('0.0099009901');
src/lib/dq/reconcile/decimal.test.ts:41:  expect(relDiff('0','0.5')).toBe('0.5');          // denominator floor of 1
src/lib/dq/reconcile/decimal.test.ts:42:  expect(relDiff('-5','5')).toBe('2');
src/lib/dq/reconcile/decimal.test.ts:43:  expect(relDiff('383285000000','383285000000')).toBe('0');
src/lib/dq/reconcile/decimal.ts:48:export function relDiff(l:string,r:string,scale=10):string{return divDecimal(absDecimal(subDecimal(l,r)),maxAbsDecimal(l,r,'1'),scale);}
src/lib/dq/reconcile/types.ts:2:// Shared reconciliation contract (plan 3 C3; spec §3.1 dq_reconciliations / dq_reconcile_cycles /
src/lib/dq/reconcile/record.ts:5:// dq_reconciliations_cycle_cols). Cycle pairs must go through run.ts / apply_reconcile_result. The kind
src/lib/dq/reconcile/record.ts:15:export async function recordReconciliation(tables:TableClient,input:ReconcileResultInput&{pair:ReconcilePairId;batch_id:string|null}):Promise<string>{
src/lib/dq/reconcile/record.ts:27: await tables.insert('dq_reconciliations',{
src/lib/entities/identifiers/apply.test.ts:20: const c=memoryTableClient({issuer_identifier_claims:['id'],dq_quarantine:['id'],dq_reconciliations:['id']});
src/lib/entities/identifiers/apply.test.ts:74:  const [recon]=c.rows('dq_reconciliations');
src/lib/dq/reconcile/inputs-hash.test.ts:4:import {computeInputsHash} from './inputs-hash';
src/lib/dq/reconcile/inputs-hash.test.ts:7:describe('computeInputsHash (spec §5.6)',()=>{
src/lib/dq/reconcile/inputs-hash.test.ts:9:  expect(computeInputsHash(base)).toBe(createHash('sha256').update('aa\nbb\ncc\nixbrl/1').digest('hex'));
src/lib/dq/reconcile/inputs-hash.test.ts:12:  const h=computeInputsHash(base);
src/lib/dq/reconcile/inputs-hash.test.ts:13:  for(const k of Object.keys(base) as (keyof typeof base)[])expect(computeInputsHash({...base,[k]:`${base[k]}x`}),k).not.toBe(h);
src/lib/dq/reconcile/inputs-hash.test.ts:14:  expect(computeInputsHash({...base,left_raw_hash:'bb',right_sha256:'aa'})).not.toBe(h);
src/lib/dq/reconcile/inputs-hash.test.ts:17:  expect(()=>computeInputsHash({...base,right_sha256:'b\nb'})).toThrow('invalid_inputs:right_sha256');
src/lib/dq/reconcile/inputs-hash.test.ts:18:  expect(()=>computeInputsHash({...base,parser_version:undefined as unknown as string})).toThrow('invalid_inputs:parser_version');
src/lib/dq/reconcile/inputs-hash.test.ts:21:  expect(computeInputsHash({...base,left_raw_hash:''})).toMatch(/^[0-9a-f]{64}$/);
src/lib/dq/reconcile/record.test.ts:4:import {recordReconciliation} from './record';
src/lib/dq/reconcile/record.test.ts:9:describe('recordReconciliation (out-of-cycle rows, spec §5.1)',()=>{
src/lib/dq/reconcile/record.test.ts:11:  const t=memoryTableClient({dq_reconciliations:['id']});
src/lib/dq/reconcile/record.test.ts:12:  const id=await recordReconciliation(t,{...text({inputs_hash:'h'}),pair:'sec.filer_category',batch_id:null});
src/lib/dq/reconcile/record.test.ts:13:  const [row]=t.rows('dq_reconciliations');
src/lib/dq/reconcile/record.test.ts:19:  const t=memoryTableClient({dq_reconciliations:['id']});
src/lib/dq/reconcile/record.test.ts:20:  await recordReconciliation(t,{...text({kind:'numeric',left_value:'1',right_value:'2',abs_diff:'1',rel_diff:'0.5',passed:false}),pair:'entities.isin_hkex_vs_gleif',batch_id:'b'});
src/lib/dq/reconcile/record.test.ts:21:  await recordReconciliation(t,{...text({kind:'date',passed:false,detail:{left_text:'2024-02-01',right_text:'2024-02-02'}}),pair:'sec.filing_date_vs_submissions',batch_id:'b'});
src/lib/dq/reconcile/record.test.ts:22:  expect(t.rows('dq_reconciliations')).toHaveLength(2);
src/lib/dq/reconcile/record.test.ts:25:  const t=memoryTableClient({dq_reconciliations:['id']});
src/lib/dq/reconcile/record.test.ts:26:  const put=(over:Partial<ReconcileResultInput>,pair:Parameters<typeof recordReconciliation>[1]['pair']='sec.filer_category')=>recordReconciliation(t,{...text(over),pair,batch_id:null});
src/lib/dq/reconcile/record.test.ts:36:  expect(t.rows('dq_reconciliations')).toHaveLength(0);
src/lib/dq/rules.test.ts:75:  expect(r.detail).toMatchObject({diff:null,relDiff:2});
src/lib/entities/identifiers/apply.ts:80:   await tables.insert('dq_reconciliations',{
src/lib/entities/identifiers.integration.test.ts:123:   ('dq_reconciliations','pair'),('dq_reconciliations','kind'),('dq_reconciliations','outcome'),('dq_reconciliations','detail'),
src/lib/entities/identifiers.integration.test.ts:124:   ('dq_reconciliations','cycle_id'),('dq_reconciliations','issuer_id'),('dq_reconciliations','market'),('dq_reconciliations','attempt'))`);
src/lib/entities/identifiers.integration.test.ts:186:   await db.query(`insert into public.dq_reconciliations(id,dataset,left_source,right_source,natural_key,left_value,right_value,tolerance,passed) values($1,'legacy.test','a','b','k',1,2,0,false)`,[rec]);
src/lib/entities/identifiers.integration.test.ts:202:   const recRow=async()=>(await db.query(`select pair,kind,outcome,detail,cycle_id from public.dq_reconciliations where id=$1`,[rec])).rows[0];
src/lib/entities/identifiers.integration.test.ts:207:   await db.query(`update public.dq_reconciliations set outcome='compared' where id=$1`,[rec]);
src/lib/entities/identifiers.integration.test.ts:267: it('dq_reconciliations: kind/outcome checks, side constraints, cycle columns all-or-none, one result per cycle key',async()=>{
src/lib/entities/identifiers.integration.test.ts:268:  const rec=(over:Record<string,unknown>)=>insertRow('dq_reconciliations',{id:randomUUID(),dataset:'reconcile.test',left_source:'l',right_source:'r',natural_key:'k:'+randomUUID(),tolerance:0,passed:true,pair:'us.companyfacts_vs_ixbrl',kind:'numeric',outcome:'compared',left_value:'10',right_value:'10',...over});
src/lib/entities/identifiers.integration.test.ts:270:  expect((await fails(rec({kind:'percent'}))).message).toMatch(/dq_reconciliations_kind_check/);
src/lib/entities/identifiers.integration.test.ts:271:  expect((await fails(rec({outcome:'skipped'}))).message).toMatch(/dq_reconciliations_outcome_check/);
src/lib/entities/identifiers.integration.test.ts:273:  expect((await fails(rec({left_value:null}))).message).toMatch(/dq_reconciliations_numeric_sides/);
src/lib/entities/identifiers.integration.test.ts:274:  expect((await fails(rec({kind:'text'}))).message).toMatch(/dq_reconciliations_nonnumeric_sides/);
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
    "brace-expansion": "5.0.9",
    "nanoid": "3.3.18",
    "source-map-js": "1.2.2",
    "next": {
      "postcss": "8.5.26",
      "sharp": "0.35.5"
    }
  }
}
agents
launch.json
scratch
/Users/osborn/.codex/config.toml

exec
/bin/zsh -lc "cat src/lib/dq/reconcile/types.ts; rg -n 'dq_reconciliations_(numeric|nonnumeric|cycle)|alter table public.dq_reconciliations' supabase/migrations/20261107090000*; rg -n '13a|recordReconciliation|PairContext' docs | head -35; cat vitest.config.*; for d in . .. ../.. ../../..; do for f in AGENTS.override.md AGENTS.md; do test "'! -f "$d/$f" || cat "$d/$f"; done; done; rg '"'project_doc_fallback' /Users/osborn/.codex/config.toml; node --version; ./node_modules/.bin/vitest run src/lib/dq/reconcile --no-file-parallelism" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 2735ms:
// src/lib/dq/reconcile/types.ts
// Shared reconciliation contract (plan 3 C3; spec §3.1 dq_reconciliations / dq_reconcile_cycles /
// dq_reconcile_cursor, §5.1 pairs, §5.5 runner). Task 2a: RECONCILE_PAIR_IDS / ReconcilePairId; Task 9a:
// the FactsDb-facing subset (CYCLE_PAIR_IDS … MemberCounts); Task 13a: the runner/pair remainder below.
// Values are canonical decimal strings everywhere (never Number). Type-only imports from the facts layer.
import type {Budget,FactsDb,Market} from '../../facts/types';
import type {TableClient} from '../../db/table-client';
import type {RawStore} from '../raw-store';
export const RECONCILE_PAIR_IDS=['us.companyfacts_vs_ixbrl','cn.tushare_vs_cninfo_pdf_gold','us.companyfacts_vs_gold','sec.filing_date_vs_submissions','sec.filer_category','entities.isin_hkex_vs_gleif','facts.lineage_same_day'] as const;
export type ReconcilePairId=typeof RECONCILE_PAIR_IDS[number];
/** Pairs run by the cycle runner; the other three are recorded inline by their producers (record.ts, cycle_id null). */
export const CYCLE_PAIR_IDS=['us.companyfacts_vs_ixbrl','cn.tushare_vs_cninfo_pdf_gold','us.companyfacts_vs_gold','facts.lineage_same_day'] as const satisfies readonly ReconcilePairId[];
export type CyclePairId=typeof CYCLE_PAIR_IDS[number];
export type ReconcileKind='numeric'|'text'|'date';
export type ReconcileOutcome='compared'|'left_missing'|'left_unlinked'|'left_ambiguous'|'right_missing'|'unsupported'|'right_ambiguous'|'incomplete_gold';
export type ReconcileAction='record'|'quarantine_left'|'review_item'|'lineage_item';
export interface Fence{pair:CyclePairId;cycle_id:string;issuer_id:string;market:Market;batch_id:string;attempt:number}
/** One per expected key; values are canonical decimal strings (never Number). */
export interface ReconcileResultInput{
 natural_key:string;kind:ReconcileKind;outcome:ReconcileOutcome;passed:boolean;
 left_value:string|null;right_value:string|null;abs_diff:string|null;rel_diff:string|null;tolerance:string;
 left_source:string;right_source:string;detail:Record<string,unknown>;
 action:ReconcileAction;left_fact_id?:string;inputs_hash?:string;
 item?:{natural_key:string;payload:Record<string,unknown>;detail?:Record<string,unknown>};   // for review_item / lineage_item / quarantine_left
}
export interface ApplyReconcileOutcome{reused:boolean;reconciliationId:string;itemId:string|null;quarantined:0|1;materialize:{issuerId:string;market:Market}|null}
export interface MemberCounts{compared_passed:number;compared_failed:number;not_compared:number}
/** set_merge's registration of a merge target (plan audit Q2): one entry per (target, market, merged source). */
export interface PendingMember{issuer_id:string;market:Market;source:string}
/** open_reconcile_cycle input (plan audit Q2): members frozen with their expected keys (the {naturalKey, locator} shape Task 13a names ExpectedKey); pending = exactly the snapshot entries the runner resolved keys for. */
export interface OpenCycleInput{pair:CyclePairId;cycleId:string;startedAt:string;members:{issuer_id:string;market:Market;expected_keys:{naturalKey:string;locator:Record<string,unknown>}[]}[];pending:PendingMember[]}
export interface OpenCycleResult{created:boolean;cycle:Record<string,unknown>;transferred:PendingMember[]}
export const RECONCILE_OUTCOMES:readonly ReconcileOutcome[]=['compared','left_missing','left_unlinked','left_ambiguous','right_missing','unsupported','right_ambiguous','incomplete_gold'];
export type CycleStatus='running'|'complete'|'complete_with_gaps';
export type CursorState='pending'|'claimed'|'done'|'failed';
/** A cursor whose attempts reached this value in state 'failed' is terminal (spec §5.5, S4). */
export const MAX_CURSOR_ATTEMPTS=3;
export interface ExpectedKey{naturalKey:string;locator:Record<string,unknown>}
export interface MemberPlan{issuerId:string;market:Market;expectedKeys:ExpectedKey[]}
export interface PairContext{db:FactsDb;tables:TableClient;raw:RawStore;now:()=>Date;budget:Budget;fetch:typeof fetch;readRepoFile:(path:string)=>Promise<Uint8Array>}
export interface ReconcilePair{
 id:CyclePairId;kind:ReconcileKind;left:string;right:string;
 /** frozen at cycle creation (pending_members merged by the runner) */
 members(ctx:PairContext):Promise<MemberPlan[]>;
 /** exactly one result per member.expectedKeys entry, same order; never throws for data problems (outcome encodes them) */
 evaluate(ctx:PairContext,member:MemberPlan):Promise<ReconcileResultInput[]>;
}
72:    alter table public.dq_reconciliations
85:alter table public.dq_reconciliations
92:  drop constraint if exists dq_reconciliations_cycle_cols,
93:  drop constraint if exists dq_reconciliations_numeric_sides,
94:  drop constraint if exists dq_reconciliations_nonnumeric_sides,
102:  add constraint dq_reconciliations_cycle_cols check ((cycle_id is null) = (issuer_id is null) and (cycle_id is null) = (market is null) and (cycle_id is null) = (attempt is null)),
103:  add constraint dq_reconciliations_numeric_sides check (kind <> 'numeric' or outcome <> 'compared' or (left_value is not null and right_value is not null)),
105:  add constraint dq_reconciliations_nonnumeric_sides check (kind = 'numeric' or (left_value is null and right_value is null and rel_diff is null and abs_diff is null));
108:create unique index if not exists dq_reconciliations_cycle_key on public.dq_reconciliations(pair, cycle_id, natural_key) where cycle_id is not null;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:87:src/lib/dq/reconcile/types.ts        对账共享类型（共享契约原样；Task 2a 两行、Task 9a C3 子集、Task 13a 其余）
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:88:src/lib/dq/reconcile/decimal.ts      精确十进制（Task 13a）
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:89:src/lib/dq/reconcile/inputs-hash.ts  computeInputsHash（Task 13a）
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:91:src/lib/dq/reconcile/record.ts       recordReconciliation（周期外 record 动作；Task 13a）
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:136:`src/lib/dq/reconcile/types.ts` 的 `RECONCILE_PAIR_IDS` 在 Task 2a 以**仅含该常量与类型**的最小文件创建；Task 9a 逐字追加 C3 的 `CYCLE_PAIR_IDS`、`CyclePairId`、`ReconcileKind`、`ReconcileOutcome`、`ReconcileAction`、`Fence`、`ReconcileResultInput`、`ApplyReconcileOutcome`、`MemberCounts`、`PendingMember`、`OpenCycleInput`、`OpenCycleResult`（`FactsDb` 需要；后三者计划审计 Q2）；Task 13a 只追加其余（`ExpectedKey`、`MemberPlan`、`PairContext`、`ReconcilePair` 与 Part D 新增的 `RECONCILE_OUTCOMES`/`CycleStatus`/`CursorState`/`MAX_CURSOR_ATTEMPTS`），不得重复声明或改动前两任务的名字（接口对齐记录 #2）。
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:154:### C3 · 对账（`src/lib/dq/reconcile/types.ts`：Task 2a 前两行 → Task 9a 至 `OpenCycleResult`（`PendingMember`/`OpenCycleInput`/`OpenCycleResult` 为计划审计 Q2 新增）→ Task 13a 其余）
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:180:/** open_reconcile_cycle input (plan audit Q2): members frozen with their expected keys (the {naturalKey, locator} shape Task 13a names ExpectedKey); pending = exactly the snapshot entries the runner resolved keys for. */
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:183:export interface PairContext{db:FactsDb;tables:TableClient;raw:RawStore;now:()=>Date;budget:Budget;fetch:typeof fetch;readRepoFile:(path:string)=>Promise<Uint8Array>}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:187: members(ctx:PairContext):Promise<MemberPlan[]>;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:189: evaluate(ctx:PairContext,member:MemberPlan):Promise<ReconcileResultInput[]>;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:193:`decimal.ts`：`parseDecimal(s:string):{units:bigint;scale:number}`、`compareDecimal(a,b):-1|0|1`、`subDecimal(a,b):string`、`absDecimal(a)`、`relDiff(l,r,scale=10):string`（`|l−r| / max(|l|,|r|,1)`，四舍五入远离零）、`withinRadius(value,center,radius):boolean`（交叉相乘，不除）。`inputs-hash.ts`：`computeInputsHash({left_raw_hash,right_sha256,gold_or_sample_sha256,parser_version}):string`（sha256 hex，字段按此顺序以 `\n` 拼接）。`ixbrl.ts`：`IXBRL_PARSER_VERSION='ixbrl/1'`、`parseInlineXbrl(doc:string):IxbrlDocument`、`IxbrlDocument={facts:IxFact[];nonNumeric:Record<string,string>;unsupported:{reason:string;name?:string}[]}`、`IxFact={name:string;periodStart:string|null;periodEnd:string;unit:string;value:string;decimals:string|null;scale:number}`。`record.ts`：`recordReconciliation(tables:TableClient,input:ReconcileResultInput&{pair:ReconcilePairId;batch_id:string|null}):Promise<string>`（只允许 `action:'record'`，`cycle_id` 为空；三个周期外对的生产者：`sec.filing_date_vs_submissions` = Task 12 `enrichAcceptance`（记录器由 Task 14c 接上），`sec.filer_category` = Task 17b `syncFilerCategories`（唯一生产者），`entities.isin_hkex_vs_gleif` = Task 4a `applyIdentifierPlan`（直接插入同形状行，不改用 `record.ts`））。`quarantine_left` 语义（接口对齐记录 #5）：只在 `outcome='compared' && passed=false && 左侧 ok 且运行 published` 时隔离；其他情况（通过、未比较、左侧已隔离）只更新引用该左侧事实的 open `reconcile_mismatch` 项的 `detail.latest_result`（左侧已隔离时）或只写结果行。`lineage_conflict` 项：`natural_key=<T>:<factKey>:<available_date>`，`payload.values=[{fact_id, issuer_id, filing, value}]`（接口对齐记录 #10）。
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:324:| §5.1–§5.6 对账 | Task 13a（类型、十进制、哈希、record）、13b（iXBRL 解析）、13c（裁剪与录制）、14a（对登记、lineage 与 US gold 对、`inputsHashNow`）、14b（运行器）、14c（cron 与接线）、15a/15b/15c（美股 iXBRL、样本、集成）、16a/16b（A 股） |
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:330:| §10 工作包 | F3-0 = Task 1a–2b；F3-1 = 3a–4b；F3-2 = 5a–6b；F3-3 = 7a–7b（面板在 19b）；F3-4 = 8a–12；F3-5 = 13a–15c；F3-6 = 16a–16b；F3-7 = 17a–18b；F3-8 = 19a–20 |
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:348:| 8 | Task 13a → 13b → 13c | Task 9a（types.ts 的 C3 子集）、12 |
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:351:| 11 | Task 17a → 17b → 18a → 18b | Task 13b（filer-categories 用 iXBRL 解析器）、13a（`record.ts`）、6a、9a |
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:354:任何任务都不得修改比它晚执行的任务创建的文件（较晚任务修改较早任务创建的文件是允许的，例如 14c 改 11/12 的文件、19a 改落地 admin 路由）。Part 划分：Part A = Task 1a–2b；Part B = Task 3a–7b；Part C = Task 8a–12；Part D = Task 13a–16b；Part E = Task 17a–20。共 40 个任务。
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:362:| 1 | 恢复所需的当前输入哈希与 `sec.filing_date_vs_submissions` 记录器都晚于使用方落地（C7、D1） | 注入式：`ResolveFactsInput.inputsHashNow?:(item:Row)=>Promise<string\|InputsUnavailable>`（类型 `InputsHashNow`，替代 Part C 原稿的 `inputsHashOf` 与 `restore_unavailable` outcome）。未注入 → `{outcome:'conflict',code:'not_passing',restoreNote:'reconcile_wiring_missing'}`（HTTP 409，永不提升）；答 `{unavailable}` → `restoreNote` = `'inputs_unavailable'` 或 `'current_evidence_unavailable'`（计划审计 P2）。Task 14c 新增 `reconcile/deps.ts::restoreInputsHashNow(admin?)`（包装 14a `pairs.ts::inputsHashNow`，`pair_not_registered/left_fact_missing/no_latest_result` → `{unavailable:'inputs_unavailable'}`，`current_evidence_unavailable` → `{unavailable:'current_evidence_unavailable'}`，其余重抛），并修改 Task 11 的隔离路由与测试注入它。Task 12 的 `AcceptanceDeps.recordDateMismatch?` 保持可选；Task 14c 在 `src/lib/facts/deps.ts::productionSyncDeps`（`batch_id:null`）与 `scripts/facts/enrich-acceptance.ts`（仅 `--apply`，`batch_id`=该批次）接上 `recordReconciliation(…, pair:DATE_MISMATCH_PAIR)` | Task 11 正文首段、Step 1 用例、`facts-resolver.ts` 类型与 `restore()`、Step 7 路由与路由测试；Task 14c Files、Step 1 `deps.test.ts`、Step 3 `deps.ts`、新增 Step 3b、Step 4/6 |
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:363:| 2 | C3 类型在 Task 9 已被 `FactsDb` 需要，而骨架让 Task 13 才落地（C1） | Task 9a 逐字追加 `CYCLE_PAIR_IDS`、`CyclePairId`、`ReconcileKind`、`ReconcileOutcome`、`ReconcileAction`、`Fence`、`ReconcileResultInput`、`ApplyReconcileOutcome`、`MemberCounts`；Task 13a 只改 import 行并追加 `RECONCILE_OUTCOMES`、`CycleStatus`、`CursorState`、`MAX_CURSOR_ATTEMPTS`、`ExpectedKey`、`MemberPlan`、`PairContext`、`ReconcilePair`，不得重复声明（13a 加 grep 计数核对 = 9） | 骨架 C1 注、C3 标题；Task 9a Step 3；Task 13a Files 与 types.ts 段 |
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:386:| 25 | `entities.isin_hkex_vs_gleif` 行写入早于 `record.ts`（B7） | Task 4a 经 `TableClient` 直接插入与 `recordReconciliation` 同形状的行（`kind='text'`、两侧值 null、`detail.left_text/right_text`、周期四列 null）；Task 13a 不回改 `apply.ts` | Task 4a（原稿）；骨架 C3 `record.ts` 注 |
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:398:| 37 | `PairContext` 缺批次/dry-run；`ReconcilePair` 缺输入配方（D4、D5） | 新增 `PairRunContext`、`runContextOf`、`RegisteredPair{inputs:{repoFile, parserVersion, goldSchema}}` | Task 14a（原稿） |
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:412:| 51 | `recordReconciliation` 对 text 行（E5） | 两侧值与差值必须 null，文本在 `detail.left_text/right_text` | 无改动（核对通过） |
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:425:| 64 | 建周期可能丢失并发登记的合并成员、或让新目标零键冻结（计划审计 Q2） | `pending_members` 元素改为 `{issuer_id, market, source}`（`PendingMember`，按整条去重）；`set_merge` 登记前取 `pg_advisory_xact_lock(hashtext('dq_reconcile_cycle:facts.lineage_same_day'))`；迁移二第 13 节新增 `open_reconcile_cycle(p_pair, p_cycle_id, p_started_at, p_members, p_pending) returns jsonb`（同一把锁；已有 running → 原样返回；否则一个事务插周期行 + 全部游标、只删 `p_pending` 所列条目；`invalid_members`）；`FactsDb.openReconcileCycle(OpenCycleInput):Promise<OpenCycleResult>` 三实现 + `db.ts::openCycleFromJson`；`RegisteredPair.memberFor?(ctx, issuerId, market)`（谱系对实现）。运行器设计：先读 pending 快照，**之后**才解析预期键（`members()`，再对快照中未列出的目标调 `memberFor`），把成员与快照一起交给函数——快照里的合并对解析器已可见，快照之后的登记不被消费、进下一周期；运行器不再整列改写周期行 `detail`，读 pending 时不再看 `pending_consumed_by`（仅审计） | C3/C4/C5；Task 8a `set_merge` 与用例；Task 8c 第 13 节与 4 个用例；Task 9a 类型、三实现、`openCycleFromJson`、存根与内存用例；Task 9b 第 8 个契约用例；Task 13a grep 计数 12；Task 14a `memberFor`；Task 14b 第 1 点、`openCycle`、5 个用例 |
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:4141:7. **`entities.isin_hkex_vs_gleif` 对账行**：`record.ts::recordReconciliation` 属 Task 13（更晚）。Task 4a 在 `apply.ts` 内直接经 `TableClient` 插入 `dq_reconciliations`（`kind='text'`、`outcome='compared'`、`cycle_id` 等四列为空、`action` 等价 `record`）；Task 13 可把它改为调用 `recordReconciliation`，行形状不变。 **→ 已裁决：接口对齐记录 #25。**
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:8805:1. **C3 类型的时序**：C4 的 `FactsDb` 方法用到 `Fence`、`CyclePairId`、`ReconcileResultInput`、`ApplyReconcileOutcome`、`MemberCounts`，而 Task 9 早于 Task 13（Task 2 只建 `RECONCILE_PAIR_IDS`/`ReconcilePairId`）。本 Part 的处理：**Task 9a 把上表列出的 C3 类型子集原文追加进 `src/lib/dq/reconcile/types.ts`**（逐字照抄 C3，不改名不改形）；Task 13 只追加其余部分（`ExpectedKey`、`MemberPlan`、`PairContext`、`ReconcilePair`），不得重复声明 Task 9a 已加的名字。Task 12 也 `import type {ReconcileResultInput}`。 **→ 已裁决：接口对齐记录 #2。**
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:8811:7. **注入与后置接线（Part D 必须完成）**：(a) Task 11 的恢复分支用注入的 `inputsHashOf:(item)=>Promise<string>`；路由在 Task 11 不传（`reconcile_mismatch` 接受 → 409 `restore_unavailable`）。**Part D（建议 Task 15，桶 `meta.json` 与样本清单落地后）必须修改 `src/app/api/admin/dq/quarantine/[id]/route.ts`，给 `resolveFactsItem` 传 `inputsHashOf`**（用 `computeInputsHash`）。(b) Task 12 的日期不一致结果用注入的 `recordDateMismatch:(r:ReconcileResultInput)=>Promise<void>`；Task 12 的 `deps.ts`/脚本不接线（不一致只计数并在回执里列出）。**Part D Task 13 落地 `record.ts` 后必须在 `src/lib/facts/deps.ts::productionSyncDeps` 与 `scripts/facts/enrich-acceptance.ts` 接上 `recordDateMismatch:(r)=>recordReconciliation(tables,{...r,pair:'sec.filing_date_vs_submissions',batch_id})`**。 **→ 已裁决：接口对齐记录 #1。**
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10955:在 `src/lib/dq/reconcile/types.ts`（Task 2 已含 `RECONCILE_PAIR_IDS`、`ReconcilePairId`）文件顶部确保有 `import type {Market} from '../../facts/types';`，在现有导出之后追加（逐字照抄 C3；Task 13a 只追加 `RECONCILE_OUTCOMES`/`CycleStatus`/`CursorState`/`MAX_CURSOR_ATTEMPTS`/`ExpectedKey`/`MemberPlan`/`PairContext`/`ReconcilePair`，不得重复这些名字——接口对齐记录 #2）：
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10977:/** open_reconcile_cycle input (plan audit Q2): members frozen with their expected keys (the {naturalKey, locator} shape Task 13a names ExpectedKey); pending = exactly the snapshot entries the runner resolved keys for. */
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:13517:**日期不一致结果的写入（契约问题 7b 的选择）**：`record.ts::recordReconciliation` 在 Part D Task 13 才落地，本任务**按注入实现**：`AcceptanceDeps.recordDateMismatch?:(r:ReconcileResultInput)=>Promise<void>`；`enrichAcceptance` 总是构造完整的 `sec.filing_date_vs_submissions` 结果（`kind='date'`、`outcome='compared'`、`passed=false`、`detail.left_text/right_text`、`action='record'`），有注入就交给它，没有就放进返回值 `mismatches` 并在回执记 `skipped_summary`（`filing_date_mismatch_unrecorded`）。两种情况都**不写**受理时刻。Part D 接线点：`deps.ts::productionSyncDeps` 与 `scripts/facts/enrich-acceptance.ts` 的 `enrichAcceptance({…})` 调用里加 `recordDateMismatch`。
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:13971:**任务拆分（相对骨架）**：Task 13 → 13a/13b/13c；Task 14 → 14a/14b/14c；Task 15 → 15a/15b/15c；Task 16 → 16a/16b。编号仍在 13–16 内，执行顺序即字母顺序。
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:13982:| `PairInputs`、`RegisteredPair`（= `ReconcilePair & {inputs; currentRight; memberFor?}`，`memberFor` 计划审计 Q2）、`CurrentRight`（`(ctx,rec:Row)=>Promise<string\|null>`，计划审计 P2）、`PairRunContext`（= `PairContext & {batchId;dryRun}`）、`runContextOf`、`ReconcileConfigError`/`ReconcileConfigCode`、`sha256Hex`、`todayOf`、`readRepoJson`、`activeRows`、`factKeyOf`、`fractionDigits`、`mismatchItemKey`、`OpenMismatch`/`openMismatches`、`Sides`/`ResultExtras`、`notCompared`、`comparedNumeric`、`actionFor`、`mismatchItem` | 见 Task 14a | `reconcile/pair-support.ts` |
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:13994:1. **恢复路由需要的 `inputs_hash_now` 无法由 Task 11 计算**：`computeInputsHash` 在 Task 13、各对的输入配方在 Task 14–16，均晚于 Task 11（`quarantine/[id]` 路由与 `facts-resolver.ts` 的恢复分支）。本 Part 在 `pairs.ts` 导出 `inputsHashNow(ctx:PairContext,item:Row):Promise<string>`（左 `raw_hash` 取 `factsByIds(payload.fact_ids[0])`；右 sha256 取 `latest_result.reconciliation_id` 那一行 `detail.right.sha256`；黄金/样本 sha256 取仓库**当前**文件；解析器版本取**当前**代码）。建议 Task 11 的恢复分支接受注入的 `inputsHashNow` 函数，由集成者在 Task 14c 之后接线（本 Part 不改 Task 11 的文件，因为其代码未知）。集成测试直接调用 `inputsHashNow` + `db.restoreReconciled`。 **→ 已裁决：接口对齐记录 #1。**
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:13997:4. **`PairContext` 无批次号与 dry-run 标志**：`sec.filer_category` 的周期外记录要 `batch_id`。新增 `PairRunContext extends PairContext{batchId:string|null;dryRun:boolean}`，运行器总是传它；对的实现用 `runContextOf(ctx)` 读取。 **→ 已裁决：接口对齐记录 #37。**
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:14014:### Task 13a: 对账共享类型、精确十进制、`inputs_hash`、周期外记录（§3.1、§5.1、§5.6）
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:14112:import {recordReconciliation} from './record';
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:14117:describe('recordReconciliation (out-of-cycle rows, spec §5.1)',()=>{
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>v26.5.0
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v4.1.11 /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61

 ❯ src/lib/dq/reconcile/inputs-hash.test.ts (0 test)
 ❯ src/lib/dq/reconcile/record.test.ts (0 test)
 ❯ src/lib/dq/reconcile/decimal.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 3 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/lib/dq/reconcile/decimal.test.ts [ src/lib/dq/reconcile/decimal.test.ts ]
 FAIL  src/lib/dq/reconcile/inputs-hash.test.ts [ src/lib/dq/reconcile/inputs-hash.test.ts ]
 FAIL  src/lib/dq/reconcile/record.test.ts [ src/lib/dq/reconcile/record.test.ts ]
Error: EPERM: operation not permitted, mkdir '/var/folders/97/wmwg4qzx02j74c3n73nh438w0000gn/T/6YvPbhYObvmTVGRTjvaj8/ssr'
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯


 Test Files  3 failed (3)
      Tests  no tests
   Start at  03:58:54
   Duration  1.66s (transform 0ms, setup 0ms, import 0ms, tests 0ms, environment 0ms)


codex
No actionable defects were found in the decimal arithmetic, input hashing, reconciliation recording, or shared types. Test execution was blocked by filesystem sandbox permissions, so this assessment relies on code inspection.
No actionable defects were found in the decimal arithmetic, input hashing, reconciliation recording, or shared types. Test execution was blocked by filesystem sandbox permissions, so this assessment relies on code inspection.

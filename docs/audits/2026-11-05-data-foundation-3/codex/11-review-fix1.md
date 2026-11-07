OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b0a3-10b3-7a23-a584-5906e4b59a7e
--------
user
commit d513043
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline d513043; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 2502ms:
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
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-Zaj2rrrp' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-bZLRoS2K' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/11-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/11-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/11-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-I8vE56D3' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-o9fVInJh' (errno=Operation not permitted)
d513043 fix(dq): hook compare-and-set, persisted recovery choices, scanner write accounting, batch_mismatch stays 500 (Task 11 review)
 scripts/facts/materialize.ts                       |  6 ++--
 src/app/api/admin/dq/quarantine/[id]/route.test.ts | 22 +++++++++---
 src/app/api/admin/dq/quarantine/[id]/route.ts      | 10 +++---
 src/lib/db/memory-table-client.ts                  |  8 ++++-
 src/lib/dq/facts-resolver.test.ts                  | 23 +++++++++++-
 src/lib/dq/facts-resolver.ts                       | 41 +++++++++++++++++-----
 src/lib/dq/pending-hooks.test.ts                   | 25 +++++++++++++
 src/lib/dq/pending-hooks.ts                        | 18 ++++++----
 src/lib/dq/quarantine.ts                           |  8 +++--
 src/lib/entities/identifiers.integration.test.ts   | 19 +++++++++-
 supabase/migrations.lock.json                      |  2 +-
 .../20261107090000_identifiers_and_dq.sql          | 21 +++++++----
 12 files changed, 164 insertions(+), 39 deletions(-)

exec
/bin/zsh -lc 'pwd; for d in . .. ../.. ../../.. ../../../.. ../../../../..; do for f in AGENTS.override.md AGENTS.md; do test ! -f "$d/$f" || { echo "$d/$f"; cat "$d/$f"; }; done; done; git show d513043 --' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
../../../AGENTS.md
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-gYr2OOxA' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-YISn9Kuy' (errno=Operation not permitted)
commit d51304327ebba6fe0e4f3a90e077fd028dcc6e01
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 03:32:54 2026 -0800

    fix(dq): hook compare-and-set, persisted recovery choices, scanner write accounting, batch_mismatch stays 500 (Task 11 review)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/scripts/facts/materialize.ts b/scripts/facts/materialize.ts
index db33c19..899de3d 100644
--- a/scripts/facts/materialize.ts
+++ b/scripts/facts/materialize.ts
@@ -10,7 +10,7 @@
  * issuer failed, 2 on bad arguments.
  *
  * --pending-hooks (alone): finish every unfinished materialisation (src/lib/dq/pending-hooks.ts, spec §4.6 U2): one JSON line
- * per target, then a summary; exit 1 when a target failed or an item has no target.
+ * per target, then a summary; exit 1 when a target failed, a hook write was rejected or an item has no target (items superseded by a newer pending hook are only counted as skippedStale).
  */
 import {selectAll,supabaseTableClient} from '../../src/lib/db/table-client';
 import {runPendingHooks} from '../../src/lib/dq/pending-hooks';
@@ -29,8 +29,8 @@ async function main(){
   const sb=getAdminSupabase();
   const r=await runPendingHooks({db:supabaseFactsDb(sb),tables:supabaseTableClient(sb)});
   for(const t of r.targets)console.log(JSON.stringify(t));
-  console.log(JSON.stringify({items:r.items,targets:r.targets.length,failed:r.failed,untargeted:r.untargeted}));
-  process.exit(r.failed>0||r.untargeted.length>0?1:0);
+  console.log(JSON.stringify({items:r.items,targets:r.targets.length,failed:r.failed,hookWriteFailed:r.hookWriteFailed,skippedStale:r.skippedStale,untargeted:r.untargeted}));
+  process.exit(r.failed>0||r.hookWriteFailed>0||r.untargeted.length>0?1:0);
  }
  for(let i=0;i<argv.length;i++){
   const x=argv[i],v=argv[i+1];
diff --git a/src/app/api/admin/dq/quarantine/[id]/route.test.ts b/src/app/api/admin/dq/quarantine/[id]/route.test.ts
index 3adbe73..f66d98f 100644
--- a/src/app/api/admin/dq/quarantine/[id]/route.test.ts
+++ b/src/app/api/admin/dq/quarantine/[id]/route.test.ts
@@ -231,7 +231,7 @@ describe('POST /api/admin/dq/quarantine/[id]', () => {
   it('passes chosen_candidate_index (ambiguous_value) and keep_fact_id (lineage_conflict) through, and audits the index and the adopted fact', async () => {
     mocks.requireAdmin.mockResolvedValue({ id: ADMIN });
     await facts3('ambiguous_value');
-    mocks.resolveFacts.mockResolvedValueOnce({ outcome: 'resolved', hook: HOOK, adoptedFactId: FACT_B, chosenFactIds: [FACT_B] });
+    mocks.resolveFacts.mockResolvedValueOnce({ outcome: 'resolved', hook: HOOK, adoptedFactId: FACT_B, chosenCandidateIndex: 1, chosenFactIds: [FACT_B] });
     const res = await json({ status: 'resolved_accept', chosen_candidate_index: 1 });
     expect(res.status).toBe(200);
     expect(await res.json()).toEqual({ id: ID, outcome: 'resolved', hook: HOOK, promoted: null, skipped: null, chosen_fact_ids: [FACT_B], adopted_fact_id: FACT_B, chosen_candidate_index: 1 });
@@ -269,7 +269,7 @@ describe('POST /api/admin/dq/quarantine/[id]', () => {
   });
   it('maps SQL codes thrown past the resolver: conflict codes 409, choice codes 400, body {id, outcome, error}; unknown codes stay a 500', async () => {
     await facts3('lineage_conflict');
-    for (const code of ['use_dedicated_resolver', 'target_not_active', 'lineage_changed', 'scope_missing', 'conflict_exists', 'replay_required', 'filing_not_found', 'generation_moved', 'duplicate', 'stale_evaluation', 'batch_mismatch', 'not_passing', 'unresolved'] as const) {
+    for (const code of ['use_dedicated_resolver', 'target_not_active', 'lineage_changed', 'scope_missing', 'conflict_exists', 'replay_required', 'filing_not_found', 'generation_moved', 'duplicate', 'stale_evaluation', 'not_passing', 'unresolved'] as const) {
       mocks.resolveFacts.mockRejectedValueOnce(new FactsDbError(code));
       const res = await json({ status: 'resolved_accept', keep_fact_id: FACT_A });
       expect(res.status).toBe(409);
@@ -283,8 +283,22 @@ describe('POST /api/admin/dq/quarantine/[id]', () => {
     }
     expect(mocks.insert).not.toHaveBeenCalled();
     const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
-    mocks.resolveFacts.mockRejectedValueOnce(new FactsDbError('unknown', 'boom'));
-    expect((await json({ status: 'resolved_accept', keep_fact_id: FACT_A })).status).toBe(500);
+    for (const code of ['unknown', 'batch_mismatch'] as const) {
+      mocks.resolveFacts.mockRejectedValueOnce(new FactsDbError(code, 'boom'));
+      expect((await json({ status: 'resolved_accept', keep_fact_id: FACT_A })).status).toBe(500);
+    }
     spy.mockRestore();
   });
+  it('review: a recovery retry reports and audits the PERSISTED index / adopted fact / keep, not the retry body', async () => {
+    mocks.requireAdmin.mockResolvedValue({ id: 'retrying-admin' });
+    await facts3('ambiguous_value');
+    mocks.resolveFacts.mockResolvedValueOnce({
+      outcome: 'hook_retried', hook: HOOK, adoptedFactId: FACT_B, chosenCandidateIndex: 0, chosenFactIds: [FACT_B], auditAs: 'resolved',
+      recovered: { resolvedBy: ADMIN, status: 'resolved_accept', chosenFactIds: [FACT_B], recoveredBy: 'retrying-admin', recoveredAt: HOOK.at },
+    });
+    const res = await json({ status: 'resolved_accept', chosen_candidate_index: 7 });
+    expect(await res.json()).toMatchObject({ chosen_candidate_index: 0, adopted_fact_id: FACT_B });
+    expect(mocks.insert.mock.calls[0][0]).toMatchObject({ user_id: ADMIN, detail: { chosen_candidate_index: 0, adopted_fact_id: FACT_B, recovered_by: 'retrying-admin' } });
+    expect(mocks.insert.mock.calls[0][0].detail.chosen_candidate_index).not.toBe(7);
+  });
 });
diff --git a/src/app/api/admin/dq/quarantine/[id]/route.ts b/src/app/api/admin/dq/quarantine/[id]/route.ts
index a909a4c..50b2ca5 100644
--- a/src/app/api/admin/dq/quarantine/[id]/route.ts
+++ b/src/app/api/admin/dq/quarantine/[id]/route.ts
@@ -24,7 +24,7 @@ type Outcome = ResolveOutcome | FactsResolveOutcome | 'run_pending';
 // facts.* items (spec §7.3): run_pending and already_resolved are 409 (retry later / nothing to do),
 // hook_retried is a successful re-run of materialize on an already accepted item; a retry whose
 // materialize fails again answers 502 (the verdict is committed, the derived layer is not refreshed).
-// plan 3 (§4.6): rule_failed / invalid_choice 400; conflict (generation_moved, conflict_exists, duplicate, replay_required, filing_not_found, not_passing, lineage_changed, scope_missing, unresolved, stale_evaluation, target_not_active, use_dedicated_resolver, read_truncated) 409; refusal bodies are {id, outcome, error:<code>, detail?:{restore_note}} (plan 3 接口对齐记录 #9).
+// plan 3 (§4.6): rule_failed / invalid_choice 400; conflict (generation_moved, conflict_exists, duplicate, replay_required, filing_not_found, not_passing, lineage_changed, scope_missing, unresolved, stale_evaluation, target_not_active, use_dedicated_resolver, read_truncated) 409; batch_mismatch is a 500; refusal bodies are {id, outcome, error:<code>, detail?:{restore_note}} (plan 3 接口对齐记录 #9).
 const HTTP_STATUS: Record<Outcome, number> = { resolved: 200, hook_retried: 200, not_found: 404, already_resolved: 409, run_pending: 409, invalid_choice: 400, rule_failed: 400, conflict: 409 };
 const MAX_CANDIDATE_INDEX = 999;
 const AUDITED: readonly Outcome[] = ['resolved', 'hook_retried'];
@@ -32,8 +32,8 @@ const AUDITED: readonly Outcome[] = ['resolved', 'hook_retried'];
 // The SQL function resolve_facts_quarantine is the final authority; its non-coded errors arrive as
 // FactsDbError('unknown', '<message>').
 // Codes of the plan-3 SQL verdict functions that reach the route without passing through the resolver's own refusal mapping
-// (the resolver maps them itself; this is the defence in depth, and the only mapping for batch_mismatch, which the resolver throws).
-const SQL_CONFLICT_CODES: readonly string[] = ['use_dedicated_resolver', 'target_not_active', 'lineage_changed', 'scope_missing', 'conflict_exists', 'replay_required', 'filing_not_found', 'generation_moved', 'duplicate', 'stale_evaluation', 'batch_mismatch', 'not_passing', 'unresolved', 'read_truncated'];
+// (the resolver maps them itself; this is defence in depth). batch_mismatch is deliberately absent: a programming error (spec §4.6/§8) that stays a 500.
+const SQL_CONFLICT_CODES: readonly string[] = ['use_dedicated_resolver', 'target_not_active', 'lineage_changed', 'scope_missing', 'conflict_exists', 'replay_required', 'filing_not_found', 'generation_moved', 'duplicate', 'stale_evaluation', 'not_passing', 'unresolved', 'read_truncated'];
 const SQL_CHOICE_CODES: readonly string[] = ['invalid_choice', 'invalid_candidate'];
 function factsOutcome(e: unknown): { outcome: Outcome; code?: string } | null {
   if (!(e instanceof FactsDbError)) return null;
@@ -115,7 +115,9 @@ export async function POST(request: Request, { params }: Ctx) {
         extra = {
           hook: r.hook ?? null, promoted: r.promoted ?? null, skipped: r.skipped ?? null, chosen_fact_ids: r.chosenFactIds ?? null,
           ...(r.adoptedFactId !== undefined ? { adopted_fact_id: r.adoptedFactId } : {}),
-          ...(index !== undefined ? { chosen_candidate_index: index } : {}),
+          // the PERSISTED choices (a retry's body may differ from what was committed)
+          ...(r.chosenCandidateIndex !== undefined ? { chosen_candidate_index: r.chosenCandidateIndex } : {}),
+          ...(r.keepFactId !== undefined ? { keep_fact_id: r.keepFactId } : {}),
           ...(r.restore !== undefined ? { restore: r.restore } : {}),
           ...(r.quarantined !== undefined ? { quarantined: r.quarantined } : {}),
         };
diff --git a/src/lib/db/memory-table-client.ts b/src/lib/db/memory-table-client.ts
index 82235c4..d601d06 100644
--- a/src/lib/db/memory-table-client.ts
+++ b/src/lib/db/memory-table-client.ts
@@ -53,7 +53,13 @@ const MEMORY_RPC:Record<string,(rowsOf:(t:string)=>Row[],a:Row)=>unknown>={
   if(a.p_value===null||a.p_value===undefined)throw new TableError('rpc','patch_quarantine_detail','invalid_detail_key','22023');
   const row=rowsOf('dq_quarantine').find(r=>r.id===a.p_id);
   if(!row)return false;
-  row.detail={...(isObj(row.detail)?row.detail:{}),[key]:clone(a.p_value)};
+  const cur=isObj(row.detail)?row.detail:{};
+  // compare-and-set (Task 11 review, Codex P2): a given p_expect_hook_at must equal detail.hook.at, else nothing is written
+  if(a.p_expect_hook_at!==undefined&&a.p_expect_hook_at!==null){
+   const hook=isObj(cur.hook)?cur.hook:{};
+   if(hook.at===undefined||hook.at===null||String(hook.at)!==String(a.p_expect_hook_at))return 'stale';
+  }
+  row.detail={...cur,[key]:clone(a.p_value)};
   return true;
  },
  // plan audit round 3, R2: guarded ISIN/FIGI write + one provenance key merged (never replaced) in one step
diff --git a/src/lib/dq/facts-resolver.test.ts b/src/lib/dq/facts-resolver.test.ts
index d78cf44..31c4e92 100644
--- a/src/lib/dq/facts-resolver.test.ts
+++ b/src/lib/dq/facts-resolver.test.ts
@@ -211,7 +211,7 @@ describe('resolveFactsItem — plan 3 dispatch (spec §4.6, §5.6, T10)',()=>{
   expect(batch).toMatchObject({producer:'dq-resolver',dataset:'facts.us',status:'success',triggered_by:'manual'});
   expect(db.adoptCandidate).toHaveBeenCalledWith(it_.id,1,batch.batch_id,4,ADMIN);
   expect(mocks.materialize).toHaveBeenCalledWith(db,ISSUER,'US');
-  expect(r).toEqual({outcome:'resolved',hook:{stage:'done',state:'done',at:'2026-11-04T09:00:00.000Z'},adoptedFactId:'50000000-0000-4000-8000-000000000005',chosenFactIds:['50000000-0000-4000-8000-000000000005']});
+  expect(r).toEqual({outcome:'resolved',hook:{stage:'done',state:'done',at:'2026-11-04T09:00:00.000Z'},adoptedFactId:'50000000-0000-4000-8000-000000000005',chosenCandidateIndex:1,chosenFactIds:['50000000-0000-4000-8000-000000000005']});
  });
  it('rule_failed: the candidate breaks a statement identity with the ok rows → 400-class outcome, nothing written, no batch',async()=>{
   const {tables,db,item}=h3({readRows:[okRow({concept:'liabilities_and_equity',statement:'BS',period_start:null,duration:'INSTANT',value:'200',value_text:'200'})]});
@@ -374,4 +374,25 @@ describe('resolveFactsItem — plan 3 dispatch (spec §4.6, §5.6, T10)',()=>{
    expect(await resolveFactsItem(db,tables,it_,{status:'resolved_accept',keepFactId:KEEP,resolvedBy:ADMIN,now:NOW})).toEqual({outcome:'conflict',code:c});
   }
  });
+
+ it('review (Codex P3): a recovery retry reports the PERSISTED candidate index / adopted fact / keep, whatever the retry carries; a superseded hook is not overwritten',async()=>{
+  const {tables,db,item}=h3();
+  const unfinishedItem=async(reason:string,detail:Record<string,unknown>,naturalKey?:string)=>{
+   const it_=await item(reason,{fact_ids:[A]},{naturalKey,detail});
+   await tables.update('dq_quarantine',{id:it_.id},{status:'resolved_accept',resolved_by:ADMIN,resolved_at:'2026-11-04T08:00:00.000Z'});
+   return (await tables.select('dq_quarantine',{id:it_.id},{limit:1}))[0];
+  };
+  const adopted=await unfinishedItem('ambiguous_value',{adopted_fact_id:'f-persisted',chosen_candidate_index:2,issuer_id:ISSUER,market:'US',hook:{stage:'materialize',state:'pending',at:'2026-11-04T08:00:00.000Z'}});
+  const r1=await resolveFactsItem(db,tables,adopted,{status:'resolved_accept',chosenCandidateIndex:9,resolvedBy:'1a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',now:NOW});
+  expect(r1).toMatchObject({outcome:'hook_retried',adoptedFactId:'f-persisted',chosenCandidateIndex:2,chosenFactIds:['f-persisted']});
+  const lin=await unfinishedItem('lineage_conflict',{chosen_fact_ids:[KEEP],issuer_id:T,market:'US',hook:{stage:'materialize',state:'pending',at:'2026-11-04T08:00:00.000Z'}});
+  expect(await resolveFactsItem(db,tables,lin,{status:'resolved_accept',keepFactId:'20000000-0000-4000-8000-0000000000dd',resolvedBy:ADMIN,now:NOW})).toMatchObject({outcome:'hook_retried',keepFactId:KEEP});
+  // a newer pending hook committed while the retry materialised: the done-write is stale and the item keeps its pending hook
+  const racy=await unfinishedItem('lineage_conflict',{chosen_fact_ids:[KEEP],issuer_id:T,market:'US',hook:{stage:'materialize',state:'pending',at:'2026-11-04T08:00:00.000Z'}});
+  const NEWER={stage:'materialize',state:'pending',at:'2026-11-04T08:30:00.000Z'};
+  mocks.materialize.mockImplementationOnce(async()=>{const [cur]=await tables.select('dq_quarantine',{id:racy.id});await tables.update('dq_quarantine',{id:racy.id},{detail:{...(cur.detail as Record<string,unknown>),hook:NEWER}});return 1;});
+  const r=await resolveFactsItem(db,tables,racy,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW});
+  expect(r.hook).toMatchObject({state:'failed',message:'hook_superseded'});
+  expect(((await tables.select('dq_quarantine',{id:racy.id}))[0].detail as {hook:unknown}).hook).toEqual(NEWER);
+ });
 });
diff --git a/src/lib/dq/facts-resolver.ts b/src/lib/dq/facts-resolver.ts
index b197550..f1995f8 100644
--- a/src/lib/dq/facts-resolver.ts
+++ b/src/lib/dq/facts-resolver.ts
@@ -52,6 +52,8 @@ export interface FactsResolveResult{outcome:FactsResolveOutcome;hook?:HookState;
  adoptedFactId?:string;
  restore?:{promoted:number;skipped:{fact_id:string;reason:string}[];restore_note?:'no_rows_promoted'};
  quarantined?:number;
+ /** the verdict's persisted choices (a retry reports these, never the retrying request's body) */
+ chosenCandidateIndex?:number;keepFactId?:string;
  /** What the route should audit: undefined = the outcome itself; null = nothing (retry of an already audited item). */
  auditAs?:'resolved'|'hook_retried'|null;
  /** Set when auditAs='resolved' on a retry: the audit row describes the PERSISTED resolution (original resolver, accept, committed ids); the retrying admin is recorded separately. */
@@ -100,18 +102,34 @@ function unfinished(item:Row):boolean{
 }
 
 /** Sets detail.hook alone through patchQuarantineDetail (row lock; plan audit P4): a concurrent verdict or result written meanwhile is kept. Never throws. */
-export async function writeHook(tables:TableClient,id:string,hook:HookState):Promise<HookState>{
+export async function writeHook(tables:TableClient,id:string,hook:HookState,expectAt?:string):Promise<HookState>{
+ return (await writeHookCas(tables,id,hook,expectAt)).hook;
+}
+/**
+ * writeHook with the compare-and-set outcome (Task 11 review, Codex P2). expectAt = the hook.at the caller observed before it
+ * materialised: when the item's hook.at has moved on (a restore / adoption / lineage verdict committed a newer pending hook meanwhile),
+ * nothing is written ('stale': the newer hook belongs to its own owner or the next scan) and the returned hook is a failed
+ * 'hook_superseded' that was NOT persisted.
+ */
+export async function writeHookCas(tables:TableClient,id:string,hook:HookState,expectAt?:string):Promise<{hook:HookState;result:'written'|'stale'|'write_failed'}>{
  try{
-  await patchQuarantineDetail(tables,id,'hook',hook);
-  return hook;
+  const r=await patchQuarantineDetail(tables,id,'hook',hook,expectAt);
+  if(r==='stale')return {hook:{stage:'materialize',state:'failed',at:hook.at,message:'hook_superseded'},result:'stale'};
+  return {hook,result:'written'};
  }catch(e){
   console.error('[admin/dq] hook write',e instanceof Error?e.message:String(e));
-  return hook.state==='done'?{stage:hook.stage,state:'failed',at:hook.at,message:'hook_write_failed'}:hook;
+  return {hook:hook.state==='done'?{stage:hook.stage,state:'failed',at:hook.at,message:'hook_write_failed'}:hook,result:'write_failed'};
  }
 }
 
 async function runHook(db:FactsDb,tables:TableClient,id:string,where:{issuer:string;market:Market}|null,now:()=>Date):Promise<HookState>{
  let hook:HookState;
+ // observe the item's pending hook BEFORE materialising; the done / failed write is fenced on it (writeHookCas)
+ let observed:string|undefined;
+ try{
+  const at=((((await tables.select(TABLE,{id},{limit:1}))[0]?.detail??{}) as {hook?:{at?:unknown}}).hook?.at);
+  if(typeof at==='string')observed=at;
+ }catch(e){console.error('[admin/dq] hook observe',e instanceof Error?e.message:String(e));}
  if(where===null)hook={stage:'materialize',state:'failed',at:now().toISOString(),message:'no_target'};
  else{
   try{await materialize(db,where.issuer,where.market);hook={stage:'done',state:'done',at:now().toISOString()};}
@@ -120,7 +138,7 @@ async function runHook(db:FactsDb,tables:TableClient,id:string,where:{issuer:str
    hook={stage:'materialize',state:'failed',at:now().toISOString(),message:e instanceof FactsDbError?e.code:'materialize_failed'};
   }
  }
- return writeHook(tables,id,hook);
+ return writeHook(tables,id,hook,observed);
 }
 
 /** Marks that the audit row of this resolution was written: detail.audit_written alone, through patchQuarantineDetail (plan audit P4). Best-effort; a missing mark only causes one extra audit row on retry. */
@@ -205,7 +223,7 @@ async function adopt(db:FactsDb,tables:TableClient,item:Row,input:ResolveFactsIn
  }catch(e){const m=mapRefusal(e);if(m)return m;throw e;}
  // committed: nothing below may throw
  const hook=await runHook(db,tables,id,{issuer:out.issuerId,market:out.market},now);
- return {outcome:'resolved',hook,adoptedFactId:out.factId,chosenFactIds:[out.factId]};
+ return {outcome:'resolved',hook,adoptedFactId:out.factId,chosenCandidateIndex:index,chosenFactIds:[out.factId]};
 }
 
 async function restore(db:FactsDb,tables:TableClient,item:Row,input:ResolveFactsInput,now:()=>Date):Promise<FactsResolveResult>{
@@ -227,7 +245,7 @@ async function lineageVerdict(db:FactsDb,tables:TableClient,item:Row,input:Resol
  catch(e){const m=mapRefusal(e);if(m)return m;throw e;}
  const target=String(item.natural_key).split(':')[0];
  const hook=await runHook(db,tables,id,market?{issuer:target,market}:null,now);
- return {outcome:'resolved',hook,quarantined:r.quarantined,chosenFactIds:[keep]};
+ return {outcome:'resolved',hook,quarantined:r.quarantined,keepFactId:keep,chosenFactIds:[keep]};
 }
 
 /**
@@ -244,7 +262,14 @@ export async function resolveFactsItem(db:FactsDb,tables:TableClient,item:Row,in
    const ran=await runHook(db,tables,id,where,now);
    const persisted=detailOf(item).chosen_fact_ids;
    const chosenFactIds=Array.isArray(persisted)?persisted.map(String):typeof detailOf(item).adopted_fact_id==='string'?[String(detailOf(item).adopted_fact_id)]:[];
-   const base:FactsResolveResult={outcome:'hook_retried',hook:ran,chosenFactIds,auditAs:audited?(ran.state==='done'?'hook_retried':null):'resolved'};
+   const d=detailOf(item);const reason=String(item.reason_code);
+   // persisted verdict facts (Task 11 review, Codex P2): the response and the recovery audit describe what was committed, not this retry's body
+   const persistedChoice:Partial<FactsResolveResult>={
+    ...(reason==='ambiguous_value'&&typeof d.adopted_fact_id==='string'?{adoptedFactId:d.adopted_fact_id}:{}),
+    ...(reason==='ambiguous_value'&&Number.isInteger(d.chosen_candidate_index)?{chosenCandidateIndex:d.chosen_candidate_index as number}:{}),
+    ...(reason==='lineage_conflict'&&chosenFactIds.length===1?{keepFactId:chosenFactIds[0]}:{}),
+   };
+   const base:FactsResolveResult={outcome:'hook_retried',hook:ran,chosenFactIds,...persistedChoice,auditAs:audited?(ran.state==='done'?'hook_retried':null):'resolved'};
    if(audited)return base;
    return {...base,recovered:{resolvedBy:String(item.resolved_by),status:'resolved_accept',chosenFactIds,recoveredBy:input.resolvedBy,recoveredAt:now().toISOString()}};
   }
diff --git a/src/lib/dq/pending-hooks.test.ts b/src/lib/dq/pending-hooks.test.ts
index 6588db2..0b89da5 100644
--- a/src/lib/dq/pending-hooks.test.ts
+++ b/src/lib/dq/pending-hooks.test.ts
@@ -74,4 +74,29 @@ describe('findPendingHooks / runPendingHooks (spec §4.6, U2)',()=>{
   expect(item.status).toBe('open');expect((item.detail as {hook:unknown}).hook).toEqual({stage:'done',state:'done',at:'2026-11-05T09:00:00.000Z'});
   expect((await db.factsByIds([x.fact_id]))[0].status).toBe('quarantined');
  });
+
+ it('review (Codex P2): a restore committing a newer pending hook while the scan materialises makes the done-write stale — the item stays pending and is counted skippedStale',async()=>{
+  const db=memoryFactsDb();
+  const id=await quarantine(db.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:'k:race',reasonCode:'reconcile_mismatch',batchId:BATCH,payload:{fact_ids:[]},detail:{issuer_id:ISSUER,market:'US',hook:{stage:'materialize',state:'pending',at:'2026-11-05T01:00:00.000Z'}}});
+  const NEWER={stage:'materialize',state:'pending',at:'2026-11-05T02:00:00.000Z'};
+  const mat=vi.fn(async()=>{
+   const [cur]=await db.tables.select('dq_quarantine',{id});
+   await db.tables.update('dq_quarantine',{id},{detail:{...(cur.detail as Record<string,unknown>),hook:NEWER}});   // the restore's SQL commit
+   return {rows:0,stateRev:0,retried:false,target:ISSUER,basedOn:[]};
+  });
+  const report=await runPendingHooks({db,tables:db.tables,now:NOW,materialize:mat as never});
+  expect(report).toMatchObject({items:1,failed:0,hookWriteFailed:0,skippedStale:1});
+  expect(((await db.tables.select('dq_quarantine',{id}))[0].detail as {hook:unknown}).hook).toEqual(NEWER);
+ });
+ it('review (Codex P2): materialization succeeds but the patch rpc is rejected → hookWriteFailed counted (not silently done)',async()=>{
+  const db=memoryFactsDb();
+  await quarantine(db.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:'k:rpc',reasonCode:'reconcile_mismatch',batchId:BATCH,payload:{fact_ids:[]},detail:{issuer_id:ISSUER,market:'US',hook:{stage:'materialize',state:'pending',at:'2026-11-05T01:00:00.000Z'}}});
+  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
+  const rpc=vi.spyOn(db.tables,'rpc').mockRejectedValue(new Error('db gone'));
+  const mat=vi.fn(async()=>({rows:0,stateRev:0,retried:false,target:ISSUER,basedOn:[]}));
+  const report=await runPendingHooks({db,tables:db.tables,now:NOW,materialize:mat as never});
+  rpc.mockRestore();spy.mockRestore();
+  expect(mat).toHaveBeenCalledTimes(1);
+  expect(report).toMatchObject({items:1,failed:0,hookWriteFailed:1,skippedStale:0});
+ });
 });
diff --git a/src/lib/dq/pending-hooks.ts b/src/lib/dq/pending-hooks.ts
index eb0fef9..4395218 100644
--- a/src/lib/dq/pending-hooks.ts
+++ b/src/lib/dq/pending-hooks.ts
@@ -12,11 +12,14 @@ import type {Row,TableClient} from '../db/table-client';
 import {materialize as realMaterialize} from '../facts/derive';
 import {FactsDbError} from '../facts/types';
 import type {FactsDb,Market} from '../facts/types';
-import {FACT_ROW_REASONS,VERDICT_REASONS,hookTarget,writeHook} from './facts-resolver';
+import {FACT_ROW_REASONS,VERDICT_REASONS,hookTarget,writeHookCas} from './facts-resolver';
 import type {HookState} from './facts-resolver';
 
-export interface PendingHookItem{id:string;reason:string;status:string;issuer:string;market:Market}
-export interface PendingHookReport{items:number;targets:{target:string;market:Market;state:'done'|'failed';message?:string;items:string[]}[];failed:number;untargeted:string[]}
+export interface PendingHookItem{id:string;reason:string;status:string;issuer:string;market:Market;
+ /** hook.at the scan observed (the compare-and-set fence of the done / failed write); null = the item had no hook */
+ hookAt:string|null}
+/** failed = targets whose materialize failed; hookWriteFailed = items whose hook write was rejected (materialization may have succeeded); skippedStale = items a newer pending hook superseded while we materialised (left to their owner / the next scan) */
+export interface PendingHookReport{items:number;targets:{target:string;market:Market;state:'done'|'failed';message?:string;items:string[]}[];failed:number;hookWriteFailed:number;skippedStale:number;untargeted:string[]}
 export interface PendingHookDeps{db:FactsDb;tables:TableClient;now?:()=>Date;materialize?:typeof realMaterialize}
 
 const hookState=(r:Row)=>((r.detail??{}) as {hook?:{state?:unknown}}).hook?.state;
@@ -28,7 +31,7 @@ const isVerdict=(r:Row)=>{
 
 export async function findPendingHooks(tables:TableClient):Promise<{items:PendingHookItem[];untargeted:string[]}>{
  const items:PendingHookItem[]=[];const untargeted:string[]=[];
- const take=(r:Row)=>{const t=hookTarget(r);if(!t){untargeted.push(String(r.id));return;}items.push({id:String(r.id),reason:String(r.reason_code),status:String(r.status),issuer:t.issuer,market:t.market});};
+ const take=(r:Row)=>{const t=hookTarget(r);if(!t){untargeted.push(String(r.id));return;}const at=((r.detail??{}) as {hook?:{at?:unknown}}).hook?.at;items.push({id:String(r.id),reason:String(r.reason_code),status:String(r.status),issuer:t.issuer,market:t.market,hookAt:typeof at==='string'?at:null});};
  for(const reason of [...FACT_ROW_REASONS,...VERDICT_REASONS])for(const status of ['resolved_accept','resolved_reject']){
   for(const r of await selectAll(tables,'dq_quarantine',{table_name:'financial_facts',reason_code:reason,status},'id')){
    const st=hookState(r);
@@ -49,7 +52,7 @@ export async function runPendingHooks(deps:PendingHookDeps):Promise<PendingHookR
   const target=await deps.db.targetOf(it.issuer);
   const k=`${target}|${it.market}`;const g=groups.get(k)??{target,market:it.market,items:[]};g.items.push(it);groups.set(k,g);
  }
- const report:PendingHookReport={items:items.length,targets:[],failed:0,untargeted};
+ const report:PendingHookReport={items:items.length,targets:[],failed:0,hookWriteFailed:0,skippedStale:0,untargeted};
  const ordered=[...groups.values()].sort((a,b)=>a.target<b.target?-1:a.target>b.target?1:a.market<b.market?-1:a.market>b.market?1:0);
  for(const g of ordered){
   let hook:HookState;
@@ -58,7 +61,10 @@ export async function runPendingHooks(deps:PendingHookDeps):Promise<PendingHookR
    console.error('[pending-hooks] materialize',e instanceof Error?e.message:String(e));
    hook={stage:'materialize',state:'failed',at:now().toISOString(),message:e instanceof FactsDbError?e.code:'materialize_failed'};
   }
-  for(const it of g.items)await writeHook(deps.tables,it.id,hook);
+  for(const it of g.items){
+   const w=await writeHookCas(deps.tables,it.id,hook,it.hookAt??undefined);
+   if(w.result==='stale')report.skippedStale++;else if(w.result==='write_failed')report.hookWriteFailed++;
+  }
   if(hook.state==='failed')report.failed++;
   report.targets.push({target:g.target,market:g.market,state:hook.state,...(hook.message!==undefined?{message:hook.message}:{}),items:g.items.map(i=>i.id)});
  }
diff --git a/src/lib/dq/quarantine.ts b/src/lib/dq/quarantine.ts
index 11dbef7..7318411 100644
--- a/src/lib/dq/quarantine.ts
+++ b/src/lib/dq/quarantine.ts
@@ -75,8 +75,10 @@ export async function listOpenQuarantine(client:TableClient,dataset?:string,limi
  * Sets ONE key of an item's detail — 'hook' or 'audit_written' — through the row-locking SQL function
  * patch_quarantine_detail (migration 20261107090000; plan audit round 1, P4). Every other detail key
  * (latest_result, chosen ids, …) and the resolution columns stay as the latest committed writer left
- * them. false = no such item. Needs client.rpc (callRpc: rpc_unavailable otherwise).
+ * them. false = no such item. With expectHookAt (compare-and-set, Task 11 review): 'stale' = detail.hook.at is no longer that value (a newer pending hook
+ * was committed), nothing written. Needs client.rpc (callRpc: rpc_unavailable otherwise).
  */
-export async function patchQuarantineDetail(client:TableClient,id:string,key:'hook'|'audit_written',value:unknown):Promise<boolean>{
- return (await callRpc(client,'patch_quarantine_detail',{p_id:id,p_key:key,p_value:value}))===true;
+export async function patchQuarantineDetail(client:TableClient,id:string,key:'hook'|'audit_written',value:unknown,expectHookAt?:string):Promise<boolean|'stale'>{
+ const r=await callRpc(client,'patch_quarantine_detail',{p_id:id,p_key:key,p_value:value,...(expectHookAt!==undefined?{p_expect_hook_at:expectHookAt}:{})});
+ return r==='stale'?'stale':r===true;
 }
diff --git a/src/lib/entities/identifiers.integration.test.ts b/src/lib/entities/identifiers.integration.test.ts
index 436b9bd..d41b67c 100644
--- a/src/lib/entities/identifiers.integration.test.ts
+++ b/src/lib/entities/identifiers.integration.test.ts
@@ -709,7 +709,7 @@ describe.skipIf(!enabled)('plan 3 migration one: resolve_identifier_claim',()=>{
 
  it('grants the functions to service_role only, keeps the helpers private and has one replace_filing_expectations signature',async()=>{
   const FNS=['public.resolve_identifier_claim(uuid,text,uuid,jsonb)','public.replace_filing_expectations(uuid,text,jsonb,jsonb)','public.claim_calendar_pass(text,uuid)','public.fail_calendar_member(jsonb,uuid,text)','public.finish_calendar_pass(jsonb)',
-   'public.append_claim_evidence(uuid,text,text,text,text,jsonb)','public.patch_quarantine_detail(uuid,text,jsonb)','public.set_security_identifier(uuid,text,date,text,text,jsonb)','public.set_issuer_identifier(uuid,text,text,jsonb)','public.set_security_window(uuid,text,date,text,date,jsonb)','public.patch_security_provenance(uuid,text,date,jsonb,text[])','public.close_security_absent(uuid,text,date,date,text,jsonb)'];
+   'public.append_claim_evidence(uuid,text,text,text,text,jsonb)','public.patch_quarantine_detail(uuid,text,jsonb,text)','public.set_security_identifier(uuid,text,date,text,text,jsonb)','public.set_issuer_identifier(uuid,text,text,jsonb)','public.set_security_window(uuid,text,date,text,date,jsonb)','public.patch_security_provenance(uuid,text,date,jsonb,text[])','public.close_security_absent(uuid,text,date,date,text,jsonb)'];
   const HELPERS=['public.claim_text_is_date(text)','public.claim_keys_within(jsonb,text[])','public.claim_evidence_ok(jsonb)','public.identifier_claim_target_key(text,jsonb)','public.identifier_claim_problem(text,text,text,uuid,jsonb)','public.dq_calendar_lock_pass(jsonb)','public.claim_provenance_safe(jsonb,integer)'];
   for(const fn of [...FNS,...HELPERS])for(const role of ['anon','authenticated','service_role']){
    const ok=(await q(`select has_function_privilege($1,$2,'EXECUTE') ok`,[role,fn]))[0].ok;
@@ -959,6 +959,23 @@ describe.skipIf(!enabled)('plan 3 migration one: row-locked jsonb patches (appen
   expect((await fails(patch('latest_result',{passed:false}))).message).toBe('invalid_detail_key');
   expect(await admin.query(`select public.patch_quarantine_detail($1,'hook','{}'::jsonb) v`,[randomUUID()]).then(r=>r.rows[0].v)).toBe(false);
  });
+ it('patch_quarantine_detail compare-and-set (Task 11 review): a hook write expecting a superseded hook.at answers stale and writes nothing; the current at, and no expectation, write',async()=>{
+  const id=randomUUID();const b=await batch('facts.us','dq-resolver');
+  const OLD='2026-11-05T00:00:00+00:00',NEW='2026-11-05T01:00:00+00:00';
+  await q(`insert into public.dq_quarantine(id,dataset,table_name,natural_key,reason_code,batch_id,payload,detail) values($1,'facts.us','financial_facts',$2,'reconcile_mismatch',$3,'{}'::jsonb,$4::jsonb)`,
+   [id,`test:${id}`,b,JSON.stringify({hook:{stage:'materialize',state:'pending',at:OLD}})]);
+  const done=(at:string)=>({stage:'done',state:'done',at});
+  const patch=(value:unknown,expect:string|null)=>admin.query(`select public.patch_quarantine_detail($1,'hook',$2::jsonb,$3) v`,[id,JSON.stringify(value),expect]).then(r=>r.rows[0].v as unknown);
+  const hook=async()=>(await q(`select detail->'hook' h from public.dq_quarantine where id=$1`,[id]))[0].h;
+  // a restore commits a newer pending hook after the scanner observed OLD
+  await q(`update public.dq_quarantine set detail=detail||$2::jsonb where id=$1`,[id,JSON.stringify({hook:{stage:'materialize',state:'pending',at:NEW}})]);
+  expect(await patch(done('x'),OLD)).toBe('stale');
+  expect(await hook()).toEqual({stage:'materialize',state:'pending',at:NEW});
+  expect(await patch(done('y'),NEW)).toBe(true);
+  expect(await hook()).toEqual(done('y'));
+  expect(await patch({stage:'materialize',state:'failed',at:'z'},null)).toBe(true);        // no expectation → unconditional
+  expect(await admin.query(`select public.patch_quarantine_detail($1,'hook','{}'::jsonb,'x') v`,[randomUUID()]).then(r=>r.rows[0].v)).toBe(false);
+ });
 
  // Plan audit round 3, R2: the guarded identifier write and its provenance key land in one locked UPDATE.
  const setId=(k:{issuer:string;ticker:string},col:string,value:string,prov:unknown,on:Pool|PoolClient=admin)=>
diff --git a/supabase/migrations.lock.json b/supabase/migrations.lock.json
index 35204ff..175ed53 100644
--- a/supabase/migrations.lock.json
+++ b/supabase/migrations.lock.json
@@ -203,7 +203,7 @@
     },
     {
       "file": "20261107090000_identifiers_and_dq.sql",
-      "sha256": "6457ecff0c498b03d10665e9f56c811b026d9ef3cabee58b8017c32ff3799ee0"
+      "sha256": "733db2675c1f2fb28491facd160317d8cd452004aeff9338adc971570bd9f896"
     },
     {
       "file": "20261107091000_facts_extensions.sql",
diff --git a/supabase/migrations/20261107090000_identifiers_and_dq.sql b/supabase/migrations/20261107090000_identifiers_and_dq.sql
index a585565..b4d37f2 100644
--- a/supabase/migrations/20261107090000_identifiers_and_dq.sql
+++ b/supabase/migrations/20261107090000_identifiers_and_dq.sql
@@ -741,20 +741,27 @@ grant execute on function public.append_claim_evidence(uuid, text, text, text, t
 -- materialize hook state and the audit mark; quarantine.ts::patchQuarantineDetail). It locks the item and
 -- replaces ONLY the named key, so a concurrent apply_reconcile_result / restore_reconciled / adoption that
 -- rewrote latest_result, the chosen ids or the resolution columns is never rolled back to an older read.
--- Two keys only: 'hook' and 'audit_written'. false = no such item.
-create or replace function public.patch_quarantine_detail(p_id uuid, p_key text, p_value jsonb)
-returns boolean language plpgsql security definer set search_path = public as $$
+-- Two keys only: 'hook' and 'audit_written'. Returns jsonb: true = written, false = no such item, 'stale'
+-- = compare-and-set refused (Task 11 review, Codex P2): when p_expect_hook_at is given and the item's
+-- detail->'hook'->>'at' is distinct from it, a newer pending hook (a restore / adoption / lineage verdict
+-- committed after the caller observed the item) belongs to its own owner and nothing is written.
+create or replace function public.patch_quarantine_detail(p_id uuid, p_key text, p_value jsonb, p_expect_hook_at text default null)
+returns jsonb language plpgsql security definer set search_path = public as $$
 begin
   if p_key is null or p_key not in ('hook', 'audit_written') or p_value is null then
     raise exception 'invalid_detail_key' using errcode = '22023';
   end if;
   perform 1 from public.dq_quarantine where id = p_id for update;
-  if not found then return false; end if;
+  if not found then return to_jsonb(false); end if;
+  if p_expect_hook_at is not null
+     and (select detail->'hook'->>'at' from public.dq_quarantine where id = p_id) is distinct from p_expect_hook_at then
+    return to_jsonb('stale'::text);
+  end if;
   update public.dq_quarantine set detail = detail || jsonb_build_object(p_key, p_value) where id = p_id;
-  return true;
+  return to_jsonb(true);
 end $$;
-revoke execute on function public.patch_quarantine_detail(uuid, text, jsonb) from public, anon, authenticated;
-grant execute on function public.patch_quarantine_detail(uuid, text, jsonb) to service_role;
+revoke execute on function public.patch_quarantine_detail(uuid, text, jsonb, text) from public, anon, authenticated;
+grant execute on function public.patch_quarantine_detail(uuid, text, jsonb, text) to service_role;
 
 -- ---------------------------------------------------------------- guarded identifier write (plan audit round 3, R2)
 -- set_security_identifier is the only writer of issuer_securities.isin/figi outside resolve_identifier_claim

exec
/bin/zsh -lc "cat src/lib/dq/pending-hooks.ts; sed -n '65,160p' src/app/api/admin/dq/quarantine/\\[id\\]/route.ts; sed -n '65,105p' src/lib/dq/facts-resolver.ts; sed -n '250,350p' src/lib/dq/facts-resolver.ts; cat package.json | head -65; find . -iname '*agents*' -o -name CLAUDE.md | head -40" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 175ms:
// src/lib/dq/pending-hooks.ts
// Unfinished materialisations (plan 3 spec §4.6, U2): (a) RESOLVED facts.* items whose hook is
// pending or failed, plus accepted plan-3 visibility verdicts (adoption, restore, lineage) with no
// hook at all; (b) OPEN reconcile_mismatch items whose hook is pending or failed (a reconciliation
// quarantine stays open until a human decides). The target is the item's persisted issuer/market
// (hookTarget); the CURRENT topology maps it to T(i), so a merge after the verdict still lands on
// the right target; one materialize per (T, market), then every item's hook is written done /
// failed. Items without a usable target are reported (untargeted), never guessed. Read-complete
// (selectAll pages to exhaustion); never throws per target.
import {selectAll} from '../db/table-client';
import type {Row,TableClient} from '../db/table-client';
import {materialize as realMaterialize} from '../facts/derive';
import {FactsDbError} from '../facts/types';
import type {FactsDb,Market} from '../facts/types';
import {FACT_ROW_REASONS,VERDICT_REASONS,hookTarget,writeHookCas} from './facts-resolver';
import type {HookState} from './facts-resolver';

export interface PendingHookItem{id:string;reason:string;status:string;issuer:string;market:Market;
 /** hook.at the scan observed (the compare-and-set fence of the done / failed write); null = the item had no hook */
 hookAt:string|null}
/** failed = targets whose materialize failed; hookWriteFailed = items whose hook write was rejected (materialization may have succeeded); skippedStale = items a newer pending hook superseded while we materialised (left to their owner / the next scan) */
export interface PendingHookReport{items:number;targets:{target:string;market:Market;state:'done'|'failed';message?:string;items:string[]}[];failed:number;hookWriteFailed:number;skippedStale:number;untargeted:string[]}
export interface PendingHookDeps{db:FactsDb;tables:TableClient;now?:()=>Date;materialize?:typeof realMaterialize}

const hookState=(r:Row)=>((r.detail??{}) as {hook?:{state?:unknown}}).hook?.state;
const hasHook=(r:Row)=>((r.detail??{}) as {hook?:unknown}).hook!==undefined;
const isVerdict=(r:Row)=>{
 const d=(r.detail??{}) as Record<string,unknown>;const reason=String(r.reason_code);
 return reason==='ambiguous_value'?typeof d.adopted_fact_id==='string':reason==='reconcile_mismatch'?typeof d.restored_by_batch==='string':reason==='lineage_conflict'?Array.isArray(d.chosen_fact_ids):false;
};

export async function findPendingHooks(tables:TableClient):Promise<{items:PendingHookItem[];untargeted:string[]}>{
 const items:PendingHookItem[]=[];const untargeted:string[]=[];
 const take=(r:Row)=>{const t=hookTarget(r);if(!t){untargeted.push(String(r.id));return;}const at=((r.detail??{}) as {hook?:{at?:unknown}}).hook?.at;items.push({id:String(r.id),reason:String(r.reason_code),status:String(r.status),issuer:t.issuer,market:t.market,hookAt:typeof at==='string'?at:null});};
 for(const reason of [...FACT_ROW_REASONS,...VERDICT_REASONS])for(const status of ['resolved_accept','resolved_reject']){
  for(const r of await selectAll(tables,'dq_quarantine',{table_name:'financial_facts',reason_code:reason,status},'id')){
   const st=hookState(r);
   if(st==='pending'||st==='failed'||(!hasHook(r)&&status==='resolved_accept'&&isVerdict(r)))take(r);
  }
 }
 for(const r of await selectAll(tables,'dq_quarantine',{table_name:'financial_facts',reason_code:'reconcile_mismatch',status:'open'},'id')){
  const st=hookState(r);if(st==='pending'||st==='failed')take(r);
 }
 return {items,untargeted};
}

export async function runPendingHooks(deps:PendingHookDeps):Promise<PendingHookReport>{
 const now=deps.now??(()=>new Date());const run=deps.materialize??realMaterialize;
 const {items,untargeted}=await findPendingHooks(deps.tables);
 const groups=new Map<string,{target:string;market:Market;items:PendingHookItem[]}>();
 for(const it of items){
  const target=await deps.db.targetOf(it.issuer);
  const k=`${target}|${it.market}`;const g=groups.get(k)??{target,market:it.market,items:[]};g.items.push(it);groups.set(k,g);
 }
 const report:PendingHookReport={items:items.length,targets:[],failed:0,hookWriteFailed:0,skippedStale:0,untargeted};
 const ordered=[...groups.values()].sort((a,b)=>a.target<b.target?-1:a.target>b.target?1:a.market<b.market?-1:a.market>b.market?1:0);
 for(const g of ordered){
  let hook:HookState;
  try{await run(deps.db,g.target,g.market);hook={stage:'done',state:'done',at:now().toISOString()};}
  catch(e){
   console.error('[pending-hooks] materialize',e instanceof Error?e.message:String(e));
   hook={stage:'materialize',state:'failed',at:now().toISOString(),message:e instanceof FactsDbError?e.code:'materialize_failed'};
  }
  for(const it of g.items){
   const w=await writeHookCas(deps.tables,it.id,hook,it.hookAt??undefined);
   if(w.result==='stale')report.skippedStale++;else if(w.result==='write_failed')report.hookWriteFailed++;
  }
  if(hook.state==='failed')report.failed++;
  report.targets.push({target:g.target,market:g.market,state:hook.state,...(hook.message!==undefined?{message:hook.message}:{}),items:g.items.map(i=>i.id)});
 }
 return report;
}
      return NextResponse.json({ error: 'invalid_status' }, { status: 400 });
    }
    const chosen = (body as { chosen_fact_ids?: unknown } | null)?.chosen_fact_ids;
    if (chosen !== undefined && (!Array.isArray(chosen) || chosen.length > MAX_CHOSEN || chosen.some((v) => typeof v !== 'string' || !UUID_RE.test(v)))) {
      return NextResponse.json({ error: 'invalid_chosen_fact_ids' }, { status: 400 });
    }

    const index = (body as { chosen_candidate_index?: unknown } | null)?.chosen_candidate_index;
    if (index !== undefined && (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index > MAX_CANDIDATE_INDEX)) {
      return NextResponse.json({ error: 'invalid_chosen_candidate_index' }, { status: 400 });
    }
    const keep = (body as { keep_fact_id?: unknown } | null)?.keep_fact_id;
    if (keep !== undefined && (typeof keep !== 'string' || !UUID_RE.test(keep))) {
      return NextResponse.json({ error: 'invalid_keep_fact_id' }, { status: 400 });
    }

    const admin = getAdminSupabase();
    const client = supabaseTableClient(admin);
    const [item] = await client.select('dq_quarantine', { id }, { limit: 1 });
    if (!item) return NextResponse.json({ id, outcome: 'not_found' }, { status: 404 });

    // chosen_fact_ids is a verdict on a same_day_conflict accept and nothing else
    if (chosen !== undefined && (status !== 'resolved_accept' || item.reason_code !== 'same_day_conflict')) {
      return NextResponse.json({ error: 'chosen_fact_ids_not_applicable' }, { status: 400 });
    }
    // chosen_candidate_index adopts a candidate of an ambiguous_value item; keep_fact_id settles a lineage_conflict (plan 3 §4.4, §4.6)
    if (index !== undefined && (status !== 'resolved_accept' || item.reason_code !== 'ambiguous_value')) {
      return NextResponse.json({ error: 'chosen_candidate_index_not_applicable' }, { status: 400 });
    }
    if (keep !== undefined && (status !== 'resolved_accept' || item.reason_code !== 'lineage_conflict')) {
      return NextResponse.json({ error: 'keep_fact_id_not_applicable' }, { status: 400 });
    }

    let outcome: Outcome;
    let auditAs: Outcome | null | undefined;
    let hookFailed = false;
    let isFacts = false;
    let recovered: Awaited<ReturnType<typeof resolveFactsItem>>['recovered'];
    let extra: Record<string, unknown> = {};
    if (String(item.dataset).startsWith('facts.')) {
      isFacts = true;
      try {
        const r = await resolveFactsItem(supabaseFactsDb(admin), client, item, {
          status: status as Resolution, chosenFactIds: chosen as string[] | undefined,
          chosenCandidateIndex: index as number | undefined, keepFactId: keep as string | undefined, resolvedBy: user.id,
        });
        outcome = r.outcome;
        auditAs = r.auditAs;
        recovered = r.recovered;
        hookFailed = r.hook?.state === 'failed';
        extra = {
          hook: r.hook ?? null, promoted: r.promoted ?? null, skipped: r.skipped ?? null, chosen_fact_ids: r.chosenFactIds ?? null,
          ...(r.adoptedFactId !== undefined ? { adopted_fact_id: r.adoptedFactId } : {}),
          // the PERSISTED choices (a retry's body may differ from what was committed)
          ...(r.chosenCandidateIndex !== undefined ? { chosen_candidate_index: r.chosenCandidateIndex } : {}),
          ...(r.keepFactId !== undefined ? { keep_fact_id: r.keepFactId } : {}),
          ...(r.restore !== undefined ? { restore: r.restore } : {}),
          ...(r.quarantined !== undefined ? { quarantined: r.quarantined } : {}),
        };
        // refusals carry only {error:<code>, detail?} (no hook/promoted/... nulls); same body shape as the claims route (接口对齐记录 #9)
        if (r.outcome === 'rule_failed' || r.outcome === 'invalid_choice' || r.outcome === 'conflict') extra = r.code !== undefined ? { error: r.code, ...(r.restoreNote !== undefined ? { detail: { restore_note: r.restoreNote } } : {}) } : {};
      } catch (e) {
        const mapped = factsOutcome(e);
        if (mapped === null) throw e;
        outcome = mapped.outcome;
        if (mapped.code !== undefined) extra = { error: mapped.code };
      }
    } else {
      outcome = await resolveQuarantine(client, id, { status: status as Resolution, resolvedBy: user.id });
    }
    const auditOutcome = auditAs === undefined ? (AUDITED.includes(outcome) ? outcome : null) : auditAs;
    if (auditOutcome !== null) {
      // Audit trail through the shared research_audit_log helper (service role, scoped to the
      // resolving admin). The resolution is already committed, so an audit failure is logged
      // rather than turned into a 500 that would invite a retry answered with 409.
      try {
        // A recovered 'resolved' row describes the persisted resolution (original resolver, accept,
        // committed ids); the retrying admin is recorded separately.
        if (recovered) {
          await audit({ supabase: admin as unknown as ResearchSupabase, userId: recovered.resolvedBy }, 'dq.quarantine_resolve', id, {
            id, status: recovered.status, outcome: auditOutcome, ...extra, chosen_fact_ids: recovered.chosenFactIds, recovered_by: recovered.recoveredBy, recovered_at: recovered.recoveredAt,
          });
        } else {
          await audit({ supabase: admin as unknown as ResearchSupabase, userId: user.id }, 'dq.quarantine_resolve', id, { id, status, outcome: auditOutcome, ...extra });
        }
        if (isFacts) await markAudited(client, id);
      } catch (auditError) {
        console.error('[admin/dq] audit failed', auditError instanceof Error ? auditError.message : auditError);
      }
    }
    return NextResponse.json({ id, outcome, ...extra }, { status: outcome === 'hook_retried' && hookFailed ? 502 : HTTP_STATUS[outcome] });
  } catch (error) {
    if (error instanceof AdminUnauthenticated) {
      return NextResponse.json({ error: 'authentication required' }, { status: 401 });
    }
    if (error instanceof AdminForbidden) {
export interface ResolveFactsInput{status:Exclude<QuarantineStatus,'open'>;chosenFactIds?:string[];chosenCandidateIndex?:number;keepFactId?:string;resolvedBy:string;now?:()=>Date;
 /** the evaluation date of an adoption (default: now's UTC date) */
 today?:string;
 inputsHashNow?:InputsHashNow}
/** Reason codes whose plan-2 items reference fact rows; the other three (ambiguous_value, odd_duration, missing_available_date) have none. */
export const FACT_ROW_REASONS:readonly string[]=['same_day_conflict','identity_bs','identity_gp'];
/** Reasons with a plan-3 visibility verdict (adopt / restore / lineage). */
export const VERDICT_REASONS:readonly string[]=['ambiguous_value','reconcile_mismatch','lineage_conflict'];
const TABLE='dq_quarantine';
const MARKETS:readonly string[]=['US','CN'];
const CHOICE_CODES:readonly string[]=['invalid_choice','invalid_candidate'];
const CONFLICT_CODES:readonly string[]=['generation_moved','conflict_exists','duplicate','replay_required','filing_not_found','not_passing','lineage_changed','scope_missing','unresolved','stale_evaluation','read_truncated','target_not_active','use_dedicated_resolver'];
const PROBE_ID='00000000-0000-4000-8000-000000000000';

interface Payload{key?:Record<string,string|null>;fact_ids?:string[];candidates?:unknown}
const payloadOf=(item:Row):Payload=>(item.payload??{}) as Payload;
const detailOf=(item:Row):Record<string,unknown>=>(item.detail??{}) as Record<string,unknown>;
const hookOf=(item:Row):HookState|undefined=>detailOf(item).hook as HookState|undefined;
const marketOfDataset=(d:unknown):Market|null=>d===DATASETS.facts('US')?'US':d===DATASETS.facts('CN')?'CN':null;
class RuleFailed extends Error{constructor(public rule:string){super(rule);this.name='RuleFailed';}}

/** Where an item materialises: the persisted detail.issuer_id/market (plan-3 verdicts and reconciliation items), else payload.key (plan-2 items). */
export function hookTarget(item:Row):{issuer:string;market:Market}|null{
 const d=detailOf(item);
 if(typeof d.issuer_id==='string'&&typeof d.market==='string'&&MARKETS.includes(d.market))return {issuer:d.issuer_id,market:d.market as Market};
 const key=payloadOf(item).key;const issuer=key?.issuer_id;const market=key?.market;
 return typeof issuer==='string'&&typeof market==='string'&&MARKETS.includes(market)?{issuer,market:market as Market}:null;
}
/** An accepted item whose materialisation is not done: plan-2 fact-row reasons, or a plan-3 verdict that actually changed visibility. */
function unfinished(item:Row):boolean{
 if(item.status!=='resolved_accept'||hookOf(item)?.state==='done')return false;
 const reason=String(item.reason_code);const d=detailOf(item);
 if(FACT_ROW_REASONS.includes(reason))return true;
 if(reason==='ambiguous_value')return typeof d.adopted_fact_id==='string';
 if(reason==='reconcile_mismatch')return typeof d.restored_by_batch==='string';
 if(reason==='lineage_conflict')return Array.isArray(d.chosen_fact_ids);
 return false;
}

/** Sets detail.hook alone through patchQuarantineDetail (row lock; plan audit P4): a concurrent verdict or result written meanwhile is kept. Never throws. */
export async function writeHook(tables:TableClient,id:string,hook:HookState,expectAt?:string):Promise<HookState>{

/**
 * Resolves one facts.* item (dispatch in the header). Throws FactsDbError('run_pending') straight
 * from the FactsDb when any member row's run is still staged (the route answers 409 and the item
 * stays open), and item_not_open / batch_mismatch / unknown errors likewise.
 */
export async function resolveFactsItem(db:FactsDb,tables:TableClient,item:Row,input:ResolveFactsInput):Promise<FactsResolveResult>{
 const now=input.now??(()=>new Date());const id=String(item.id);const where=hookTarget(item);
 if(item.status!=='open'){
  const hook=hookOf(item);
  if(input.status==='resolved_accept'&&unfinished(item)&&where!==null){
   const audited=detailOf(item).audit_written===true;
   const ran=await runHook(db,tables,id,where,now);
   const persisted=detailOf(item).chosen_fact_ids;
   const chosenFactIds=Array.isArray(persisted)?persisted.map(String):typeof detailOf(item).adopted_fact_id==='string'?[String(detailOf(item).adopted_fact_id)]:[];
   const d=detailOf(item);const reason=String(item.reason_code);
   // persisted verdict facts (Task 11 review, Codex P2): the response and the recovery audit describe what was committed, not this retry's body
   const persistedChoice:Partial<FactsResolveResult>={
    ...(reason==='ambiguous_value'&&typeof d.adopted_fact_id==='string'?{adoptedFactId:d.adopted_fact_id}:{}),
    ...(reason==='ambiguous_value'&&Number.isInteger(d.chosen_candidate_index)?{chosenCandidateIndex:d.chosen_candidate_index as number}:{}),
    ...(reason==='lineage_conflict'&&chosenFactIds.length===1?{keepFactId:chosenFactIds[0]}:{}),
   };
   const base:FactsResolveResult={outcome:'hook_retried',hook:ran,chosenFactIds,...persistedChoice,auditAs:audited?(ran.state==='done'?'hook_retried':null):'resolved'};
   if(audited)return base;
   return {...base,recovered:{resolvedBy:String(item.resolved_by),status:'resolved_accept',chosenFactIds,recoveredBy:input.resolvedBy,recoveredAt:now().toISOString()}};
  }
  return hook===undefined?{outcome:'already_resolved'}:{outcome:'already_resolved',hook};
 }
 if(input.status==='resolved_reject')return {outcome:await resolveQuarantine(tables,id,{status:'resolved_reject',resolvedBy:input.resolvedBy})};
 const reason=String(item.reason_code);
 if(reason==='reconcile_review')return {outcome:await resolveQuarantine(tables,id,{status:'resolved_accept',resolvedBy:input.resolvedBy})};
 if(reason==='ambiguous_value'&&input.chosenCandidateIndex!==undefined)return adopt(db,tables,item,input,now);
 if(reason==='reconcile_mismatch')return restore(db,tables,item,input,now);
 if(reason==='lineage_conflict')return lineageVerdict(db,tables,item,input,now);
 const members=payloadOf(item).fact_ids??[];
 let chosen:string[]=[];
 if(reason==='same_day_conflict'){
  chosen=[...new Set(input.chosenFactIds??[])];
  if(chosen.some(f=>!members.includes(f)))return {outcome:'invalid_choice'};
  if(chosen.length>1){
   const rows=await db.factsByIds(chosen);
   // rows that no longer exist (abandoned / deleted members) are ignored here; the SQL function decides
   if(rows.some(r=>!decimalEquals(r.value,rows[0].value)))return {outcome:'invalid_choice'};
  }
 }else if(FACT_ROW_REASONS.includes(reason))chosen=[...members];
 const {promoted,skipped,chosenFactIds}=await db.resolveFactsQuarantine(id,chosen,input.resolvedBy);
 // from here on the resolution is committed: nothing below may throw
 const hook=FACT_ROW_REASONS.includes(reason)?await runHook(db,tables,id,where,now):await writeHook(tables,id,{stage:'done',state:'done',at:now().toISOString()});
 return {outcome:'resolved',hook,promoted,skipped,chosenFactIds};
}
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
./node_modules/dsh-trade-strategy-evaluator/agents
./node_modules/playwright/lib/agents
./node_modules/playwright/lib/agents/generateAgents.js
./node_modules/caniuse-lite/dist/unpacker/agents.js
./node_modules/caniuse-lite/data/agents.js
./.claude/agents

exec
/bin/zsh -lc "rg 'patch_quarantine_detail|hookAt|findPendingHooks|quarantined:.*chosenFactIds|keep_fact_id' src/lib/dq/*.test.ts src/app/api/admin/dq/quarantine/\\[id\\]/route.test.ts src/types; ls -a | head -25; rg '20261107090000|unapplied|unreleased' docs/runbooks/data-foundation.md scripts/ci/check-migration-history.ts; sed -n '1,80p' src/lib/dq/pending-hooks.test.ts" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
rg: src/types: No such file or directory (os error 2)
src/lib/dq/facts-resolver.test.ts: it('lineage_conflict: keep_fact_id is required; resolveLineageConflict, then materialize of T from the natural key',async()=>{
src/lib/dq/facts-resolver.test.ts:  expect(await resolveFactsItem(db,tables,it_,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW})).toEqual({outcome:'invalid_choice',code:'keep_fact_id_required'});
src/lib/dq/facts-resolver.test.ts:  expect(r).toMatchObject({outcome:'resolved',quarantined:1,chosenFactIds:[KEEP],hook:{state:'done'}});
src/lib/dq/facts-resolver.test.ts:   async rpc(fn,a){if(fn==='patch_quarantine_detail'&&!fired){fired=true;await newer();}return tables.rpc(fn,a);}};
src/lib/dq/quarantine.test.ts: it('sets only the named key through patch_quarantine_detail; an unknown item answers false',async()=>{
src/lib/dq/pending-hooks.test.ts:import {findPendingHooks,runPendingHooks} from './pending-hooks';
src/lib/dq/pending-hooks.test.ts:describe('findPendingHooks / runPendingHooks (spec §4.6, U2)',()=>{
src/lib/dq/pending-hooks.test.ts:  const {items,untargeted}=await findPendingHooks(db.tables);
src/lib/dq/pending-hooks.test.ts:  expect((await findPendingHooks(db.tables)).items.map(i=>i.id)).toEqual([ids.lineagePending]);      // only the failed one is left
src/app/api/admin/dq/quarantine/[id]/route.test.ts:  it('passes chosen_candidate_index (ambiguous_value) and keep_fact_id (lineage_conflict) through, and audits the index and the adopted fact', async () => {
src/app/api/admin/dq/quarantine/[id]/route.test.ts:    await json({ status: 'resolved_accept', keep_fact_id: FACT_A });
src/app/api/admin/dq/quarantine/[id]/route.test.ts:    expect(await (await json({ status: 'resolved_accept', keep_fact_id: FACT_A })).json()).toEqual({ error: 'keep_fact_id_not_applicable' });
src/app/api/admin/dq/quarantine/[id]/route.test.ts:    expect((await json({ status: 'resolved_accept', keep_fact_id: 'not-a-uuid' })).status).toBe(400);
src/app/api/admin/dq/quarantine/[id]/route.test.ts:      const res = await json({ status: 'resolved_accept', keep_fact_id: FACT_A });
src/app/api/admin/dq/quarantine/[id]/route.test.ts:      const res = await json({ status: 'resolved_accept', keep_fact_id: FACT_A });
src/app/api/admin/dq/quarantine/[id]/route.test.ts:      expect((await json({ status: 'resolved_accept', keep_fact_id: FACT_A })).status).toBe(500);
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
// src/lib/dq/pending-hooks.test.ts
import {describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {memoryFactsDb} from '../facts/memory-facts-db';
import {factInsert,filingInsert} from '../facts/db-contract';
import {quarantine} from './quarantine';
import {findPendingHooks,runPendingHooks} from './pending-hooks';

const ISSUER='00000000-0000-4000-8000-000000000001',SRC='00000000-0000-4000-8000-000000000002',T='00000000-0000-4000-8000-000000000003';
const ADMIN='9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',BATCH='55555555-0000-4000-8000-000000000001';
const NOW=()=>new Date('2026-11-05T09:00:00.000Z');

async function seed(db:ReturnType<typeof memoryFactsDb>){
 const t=db.tables;
 const add=async(reason:string,o:{status?:string;detail?:Record<string,unknown>;payload?:Record<string,unknown>;naturalKey?:string}={})=>{
  const id=await quarantine(t,{dataset:'facts.us',table:'financial_facts',naturalKey:o.naturalKey??`k:${reason}:${randomUUID()}`,reasonCode:reason,batchId:BATCH,payload:o.payload??{fact_ids:[]},detail:o.detail});
  if(o.status&&o.status!=='open')await t.update('dq_quarantine',{id},{status:o.status,resolved_by:ADMIN,resolved_at:'2026-11-05T08:00:00.000Z'});
  return id;
 };
 const key={issuer_id:ISSUER,market:'US'};
 return {
  sameDayFailed:await add('same_day_conflict',{status:'resolved_accept',payload:{key,fact_ids:[]},detail:{hook:{stage:'materialize',state:'failed'}}}),
  adoptedNoHook:await add('ambiguous_value',{status:'resolved_accept',detail:{adopted_fact_id:'f',issuer_id:SRC,market:'US'}}),
  restoredPending:await add('reconcile_mismatch',{status:'resolved_accept',detail:{restored_by_batch:'b',issuer_id:ISSUER,market:'US',hook:{stage:'materialize',state:'pending'}}}),
  lineagePending:await add('lineage_conflict',{status:'resolved_accept',detail:{chosen_fact_ids:['k'],issuer_id:T,market:'US',hook:{stage:'materialize',state:'pending'}}}),
  openMismatch:await add('reconcile_mismatch',{detail:{issuer_id:ISSUER,market:'US',hook:{stage:'materialize',state:'pending'}}}),
  rejectedPendingMismatch:await add('reconcile_mismatch',{status:'resolved_reject',detail:{issuer_id:ISSUER,market:'US',hook:{stage:'materialize',state:'pending'}}}),
  untargeted:await add('identity_bs',{status:'resolved_accept',payload:{key:{},fact_ids:[]},detail:{hook:{stage:'materialize',state:'pending'}}}),
  // excluded
  done:await add('identity_gp',{status:'resolved_accept',payload:{key,fact_ids:[]},detail:{hook:{stage:'done',state:'done'}}}),
  ack:await add('ambiguous_value',{status:'resolved_accept',detail:{hook:{stage:'done',state:'done'}}}),
  openSameDay:await add('same_day_conflict',{payload:{key,fact_ids:[]},detail:{hook:{stage:'materialize',state:'pending'}}}),
  rejectNoHook:await add('lineage_conflict',{status:'resolved_reject'}),
  openMismatchDone:await add('reconcile_mismatch',{detail:{issuer_id:ISSUER,market:'US',hook:{stage:'done',state:'done'}}}),
 };
}

describe('findPendingHooks / runPendingHooks (spec §4.6, U2)',()=>{
 it('selects (a) resolved items with a pending/failed hook and accepted verdicts without one, (b) open reconcile_mismatch items with a pending/failed hook',async()=>{
  const db=memoryFactsDb();const ids=await seed(db);
  const {items,untargeted}=await findPendingHooks(db.tables);
  expect(items.map(i=>i.id).sort()).toEqual([ids.sameDayFailed,ids.adoptedNoHook,ids.restoredPending,ids.lineagePending,ids.openMismatch,ids.rejectedPendingMismatch].sort());
  expect(untargeted).toEqual([ids.untargeted]);
  expect(items.find(i=>i.id===ids.adoptedNoHook)).toMatchObject({issuer:SRC,market:'US',reason:'ambiguous_value'});
 });
 it('materialises each target T once (merged sources fold into their target) and writes done / failed on every item',async()=>{
  const db=memoryFactsDb();const ids=await seed(db);
  db.setTopology({[SRC]:{status:'merged',merged_into:ISSUER}});
  const mat=vi.fn(async(_db:unknown,issuer:string)=>{if(issuer===T)throw new Error('boom');return {rows:0,stateRev:0,retried:false,target:issuer,basedOn:[]};});
  const report=await runPendingHooks({db,tables:db.tables,now:NOW,materialize:mat as never});
  expect(mat.mock.calls.map(c=>c[1]).sort()).toEqual([ISSUER,T].sort());
  expect(report).toMatchObject({items:6,failed:1,untargeted:[ids.untargeted]});
  expect(report.targets.find(t=>t.target===ISSUER)!.items.sort()).toEqual([ids.sameDayFailed,ids.adoptedNoHook,ids.restoredPending,ids.openMismatch,ids.rejectedPendingMismatch].sort());
  const hook=async(id:string)=>((await db.tables.select('dq_quarantine',{id}))[0].detail as {hook:unknown}).hook;
  expect(await hook(ids.openMismatch)).toEqual({stage:'done',state:'done',at:'2026-11-05T09:00:00.000Z'});
  expect(await hook(ids.lineagePending)).toMatchObject({stage:'materialize',state:'failed',message:'materialize_failed'});
  expect((await db.tables.select('dq_quarantine',{id:ids.openMismatch}))[0].status).toBe('open');   // the reconciliation item stays open for a human
  expect((await findPendingHooks(db.tables)).items.map(i=>i.id)).toEqual([ids.lineagePending]);      // only the failed one is left
 });
 it('a crash right after applyReconcileResult (item open, hook pending) is completed by the scan with the real materialize',async()=>{
  const db=memoryFactsDb();const iss=randomUUID();const b=randomUUID();
  await db.tables.insert('ingest_batches',{batch_id:b,producer:'reconcile',dataset:'reconcile.us.companyfacts_vs_ixbrl',status:'running'});
  await db.reconcileScope('US',[{issuer_id:iss,reasons:['t'],priority:1,fetch_key:'k'}]);await db.claimLease(iss,'US',b,600);
  const run=await db.beginRun(iss,'US',b,1);const f=filingInsert(iss);await db.stageFilings(run,[f]);const x=factInsert(iss,f);await db.stageFacts(run,[x]);await db.publishRun(run,[f.filing_id]);
  const pair='us.companyfacts_vs_ixbrl' as const;
  await db.tables.insert('dq_reconcile_cycles',{pair,cycle_id:'c1',status:'running',started_at:NOW().toISOString(),members:[{issuer_id:iss,market:'US',expected_keys:[{naturalKey:'k1',locator:{}}]}],expected_total:1,detail:{}});
  await db.tables.insert('dq_reconcile_cursor',{pair,cycle_id:'c1',issuer_id:iss,market:'US',expected:1,state:'pending',claimed_by:null,claim_until:null,attempts:0,last_error:null,done_at:null,compared_passed:null,compared_failed:null,not_compared:null});
  const fence=(await db.claimReconcileMember(pair,'c1',iss,'US',b))!;
  const a=await db.applyReconcileResult(fence,{natural_key:'k1',kind:'numeric',outcome:'compared',passed:false,left_value:'100',right_value:'99',abs_diff:'1',rel_diff:'0.01',tolerance:'0',left_source:'l',right_source:'r',detail:{},action:'quarantine_left',left_fact_id:x.fact_id,inputs_hash:'h'});
  // … the runner dies here, before materialize
  const report=await runPendingHooks({db,tables:db.tables,now:NOW});
  expect(report).toMatchObject({items:1,failed:0});
  const [item]=await db.tables.select('dq_quarantine',{id:a.itemId!});
  expect(item.status).toBe('open');expect((item.detail as {hook:unknown}).hook).toEqual({stage:'done',state:'done',at:'2026-11-05T09:00:00.000Z'});
  expect((await db.factsByIds([x.fact_id]))[0].status).toBe('quarantined');
 });

 it('review (Codex P2): a restore committing a newer pending hook while the scan materialises makes the done-write stale — the item stays pending and is counted skippedStale',async()=>{
  const db=memoryFactsDb();
  const id=await quarantine(db.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:'k:race',reasonCode:'reconcile_mismatch',batchId:BATCH,payload:{fact_ids:[]},detail:{issuer_id:ISSUER,market:'US',hook:{stage:'materialize',state:'pending',at:'2026-11-05T01:00:00.000Z'}}});

codex
No actionable regressions were identified in the commit. The compare-and-set handling, persisted recovery choices, scanner accounting, and HTTP error mapping are consistent with the surrounding code and added tests. Tests were not executed.
No actionable regressions were identified in the commit. The compare-and-set handling, persisted recovery choices, scanner accounting, and HTTP error mapping are consistent with the surrounding code and added tests. Tests were not executed.

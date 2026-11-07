OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b129-b50a-7593-8b69-8d572150bd67
--------
user
commit 39ab62e
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 39ab62e; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 1263ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-UjwJqAbW' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-f4na7Kps' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/14c-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/14c-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/14c-review-fix2.md
?? docs/audits/2026-11-05-data-foundation-3/codex/14c-review-fix3.md
?? docs/audits/2026-11-05-data-foundation-3/codex/14c-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-K6sMeyVc' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-wrQYIWd0' (errno=Operation not permitted)
39ab62e fix(dq): recorder dedupe compares exact detail strings, documents best-effort concurrency
 src/lib/dq/reconcile/record.test.ts | 11 +++++++++++
 src/lib/dq/reconcile/record.ts      | 10 ++++++++--
 2 files changed, 19 insertions(+), 2 deletions(-)

exec
/bin/zsh -lc 'pwd; for d in / /Volumes /Volumes/AIMATE_WORK /Volumes/AIMATE_WORK/Developer /Volumes/AIMATE_WORK/Developer/CodeX /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees; do for f in AGENTS.override.md AGENTS.md; do if [ -f "$d/$f" ]; then echo ==== $d/$f; cat "$d/$f"; fi; done; done; git show 39ab62e; cat src/lib/dq/reconcile/record.ts; cat src/lib/dq/reconcile/record.test.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
zsh:1: === not found

exec
/bin/zsh -lc 'for d in / /Volumes /Volumes/AIMATE_WORK /Volumes/AIMATE_WORK/Developer /Volumes/AIMATE_WORK/Developer/CodeX /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees; do for f in AGENTS.override.md AGENTS.md; do if [ -f "$d/$f" ]; then printf '"'\\n%s\\n' \""'$d/$f"; cat "$d/$f"; fi; done; done; git show 39ab62e; cat src/lib/dq/reconcile/record.ts; cat src/lib/dq/reconcile/record.test.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:

/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-NRaph5h3' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-hLH75h5j' (errno=Operation not permitted)
commit 39ab62e9621f3486dd2b4fba7a06d6327c6d82e5
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 06:00:53 2026 -0800

    fix(dq): recorder dedupe compares exact detail strings, documents best-effort concurrency
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/dq/reconcile/record.test.ts b/src/lib/dq/reconcile/record.test.ts
index 3c23300..e27866f 100644
--- a/src/lib/dq/reconcile/record.test.ts
+++ b/src/lib/dq/reconcile/record.test.ts
@@ -60,4 +60,15 @@ describe('recordReconciliation (out-of-cycle rows, spec §5.1)',()=>{
   expect((await recordReconciliationDetailed(t,d('2024-02-01','2024-02-03'))).duplicate).toBe(false);
   expect(t.rows('dq_reconciliations')).toHaveLength(2);
  });
+ it('numeric dedupe compares the exact strings in detail, never the numeric columns (PostgREST returns numbers)',async()=>{
+  const t=memoryTableClient({dq_reconciliations:['id']});
+  const num=(l:string,r:string)=>({...text({kind:'numeric',left_value:l,right_value:r,abs_diff:'1',rel_diff:'0.5',passed:false}),pair:'entities.isin_hkex_vs_gleif' as const,batch_id:null});
+  const first=await recordReconciliationDetailed(t,num('123456789012345678.5','2'));
+  expect(t.rows('dq_reconciliations')[0].detail).toMatchObject({left_exact:'123456789012345678.5',right_exact:'2'});
+  // a store that hands numeric columns back as JSON numbers (lossy)
+  const lossy={...t,select:async(table:string,match:Record<string,unknown>)=>(await t.select(table,match)).map(r=>({...r,left_value:Number(r.left_value),right_value:Number(r.right_value)}))} as typeof t;
+  expect((await recordReconciliationDetailed(lossy,num('123456789012345678.5','2'))).duplicate).toBe(true);
+  expect((await recordReconciliationDetailed(lossy,num('123456789012345678.6','2'))).duplicate).toBe(false);   // Number() would collapse these two
+  expect(first.duplicate).toBe(false);expect(t.rows('dq_reconciliations')).toHaveLength(2);
+ });
 });
diff --git a/src/lib/dq/reconcile/record.ts b/src/lib/dq/reconcile/record.ts
index 6bc076f..789f850 100644
--- a/src/lib/dq/reconcile/record.ts
+++ b/src/lib/dq/reconcile/record.ts
@@ -5,6 +5,11 @@
 // dq_reconciliations_cycle_cols). Cycle pairs must go through run.ts / apply_reconcile_result. The kind
 // rules mirror the two table constraints (numeric compared needs both sides; text/date keep the values in
 // detail.left_text/right_text and leave every numeric column null) so a bad row fails here with a code.
+// Dedupe is best-effort: re-recording identical evidence for the same (pair, natural_key) writes nothing, judged
+// on the exact strings kept in detail (left_exact/right_exact, left_text/right_text) — never on the numeric
+// columns, which PostgREST returns as JSON numbers. There is no unique constraint for out-of-cycle rows and
+// they have no business effect, so concurrent writers may each insert one row. Readers (the /admin/dq
+// dashboard read model, Task 19a) must therefore count DISTINCT (pair, natural_key), not rows.
 import {randomUUID} from 'node:crypto';
 import type {TableClient} from '../../db/table-client';
 import {DATASETS} from '../datasets';
@@ -37,15 +42,16 @@ export async function recordReconciliationDetailed(tables:TableClient,input:Reco
  const c=(v:string|null)=>v===null?null:canonicalDecimal(v);
  const tolerance=canonicalDecimal(input.tolerance),abs=c(input.abs_diff);
  const text=(d:unknown,k:string)=>{const v=(d as Record<string,unknown>|null|undefined)?.[k];return v===undefined?null:v;};
+ const lx=c(input.left_value),rx=c(input.right_value);
  const lt=text(input.detail,'left_text'),rt=text(input.detail,'right_text');
  for(const e of await tables.select('dq_reconciliations',{pair:input.pair,natural_key:input.natural_key}))
-  if(e.outcome===input.outcome&&e.passed===input.passed&&e.left_value===c(input.left_value)&&e.right_value===c(input.right_value)&&text(e.detail,'left_text')===lt&&text(e.detail,'right_text')===rt)return {id:String(e.id),duplicate:true};
+  if(e.outcome===input.outcome&&e.passed===input.passed&&text(e.detail,'left_exact')===lx&&text(e.detail,'right_exact')===rx&&text(e.detail,'left_text')===lt&&text(e.detail,'right_text')===rt)return {id:String(e.id),duplicate:true};
  const id=randomUUID();
  await tables.insert('dq_reconciliations',{
   id,dataset:DATASETS.reconcile(input.pair),pair:input.pair,kind:input.kind,outcome:input.outcome,natural_key:input.natural_key,
   left_source:input.left_source,right_source:input.right_source,left_value:c(input.left_value),right_value:c(input.right_value),
   abs_diff:abs,rel_diff:c(input.rel_diff),tolerance,passed:input.passed,
-  detail:{...input.detail,tolerance_exact:tolerance,...(abs===null?{}:{abs_diff_exact:abs}),...(input.inputs_hash===undefined?{}:{inputs_hash:input.inputs_hash})},
+  detail:{...input.detail,tolerance_exact:tolerance,...(abs===null?{}:{abs_diff_exact:abs}),...(lx===null?{}:{left_exact:lx}),...(rx===null?{}:{right_exact:rx}),...(input.inputs_hash===undefined?{}:{inputs_hash:input.inputs_hash})},
   batch_id:input.batch_id,cycle_id:null,issuer_id:null,market:null,attempt:null,created_at:(opts.now??(()=>new Date()))().toISOString(),
  });
  return {id,duplicate:false};
// src/lib/dq/reconcile/record.ts
// Out-of-cycle reconciliation rows (spec §5.1): sec.filing_date_vs_submissions, sec.filer_category and
// entities.isin_hkex_vs_gleif are recorded inline by their producers. Only action 'record' exists here:
// no work item, no visibility change, and cycle_id/issuer_id/market/attempt all null (constraint
// dq_reconciliations_cycle_cols). Cycle pairs must go through run.ts / apply_reconcile_result. The kind
// rules mirror the two table constraints (numeric compared needs both sides; text/date keep the values in
// detail.left_text/right_text and leave every numeric column null) so a bad row fails here with a code.
// Dedupe is best-effort: re-recording identical evidence for the same (pair, natural_key) writes nothing, judged
// on the exact strings kept in detail (left_exact/right_exact, left_text/right_text) — never on the numeric
// columns, which PostgREST returns as JSON numbers. There is no unique constraint for out-of-cycle rows and
// they have no business effect, so concurrent writers may each insert one row. Readers (the /admin/dq
// dashboard read model, Task 19a) must therefore count DISTINCT (pair, natural_key), not rows.
import {randomUUID} from 'node:crypto';
import type {TableClient} from '../../db/table-client';
import {DATASETS} from '../datasets';
import {compareDecimal,isDecimalText} from './decimal';
import {canonicalDecimal} from '../../facts/json-numbers';
import {CYCLE_PAIR_IDS,RECONCILE_OUTCOMES,RECONCILE_PAIR_IDS} from './types';
import type {ReconcilePairId,ReconcileResultInput} from './types';

const isStr=(v:unknown):v is string=>typeof v==='string';
/** Numeric columns are written canonical; ratio columns (rel_diff) are derived/display, pass/fail is `passed`, decided by exact comparison.
 * detail.tolerance_exact / abs_diff_exact keep the exact values next to the columns. */
export type RecordInput=ReconcileResultInput&{pair:ReconcilePairId;batch_id:string|null};
export async function recordReconciliation(tables:TableClient,input:RecordInput,opts:{now?:()=>Date}={}):Promise<string>{return (await recordReconciliationDetailed(tables,input,opts)).id;}
/** Re-recording the same (pair, natural_key) with identical outcome, values and text sides writes nothing and answers the existing row: {duplicate:true} (a re-run over unchanged evidence adds no rows). */
export async function recordReconciliationDetailed(tables:TableClient,input:RecordInput,opts:{now?:()=>Date}={}):Promise<{id:string;duplicate:boolean}>{
 if(!(RECONCILE_PAIR_IDS as readonly string[]).includes(input.pair))throw new Error('invalid_pair');
 if((CYCLE_PAIR_IDS as readonly string[]).includes(input.pair))throw new Error('cycle_pair_requires_runner');
 if(input.action!=='record')throw new Error('record_action_only');
 if(input.item!==undefined)throw new Error('record_has_no_item');
 if(!(['numeric','text','date'] as readonly unknown[]).includes(input.kind))throw new Error('invalid_kind');
 if(!(RECONCILE_OUTCOMES as readonly unknown[]).includes(input.outcome))throw new Error('invalid_outcome');
 const numeric=input.kind==='numeric';
 if(numeric&&input.outcome==='compared'&&(input.left_value===null||input.right_value===null))throw new Error('numeric_sides_required');
 if(!numeric&&(input.left_value!==null||input.right_value!==null||input.abs_diff!==null||input.rel_diff!==null))throw new Error('nonnumeric_sides_must_be_null');
 for(const v of [input.left_value,input.right_value,input.abs_diff,input.rel_diff])if(v!==null&&(!isStr(v)||!isDecimalText(v)))throw new Error('invalid_decimal_field');
 if(!isStr(input.tolerance)||!isDecimalText(input.tolerance)||compareDecimal(input.tolerance,'0')<0)throw new Error('invalid_tolerance');
 if(input.abs_diff!==null&&compareDecimal(input.abs_diff,'0')<0)throw new Error('negative_abs_diff');
 if(input.rel_diff!==null&&compareDecimal(input.rel_diff,'0')<0)throw new Error('negative_rel_diff');
 if(input.outcome!=='compared'&&input.passed)throw new Error('passed_requires_compared');
 const c=(v:string|null)=>v===null?null:canonicalDecimal(v);
 const tolerance=canonicalDecimal(input.tolerance),abs=c(input.abs_diff);
 const text=(d:unknown,k:string)=>{const v=(d as Record<string,unknown>|null|undefined)?.[k];return v===undefined?null:v;};
 const lx=c(input.left_value),rx=c(input.right_value);
 const lt=text(input.detail,'left_text'),rt=text(input.detail,'right_text');
 for(const e of await tables.select('dq_reconciliations',{pair:input.pair,natural_key:input.natural_key}))
  if(e.outcome===input.outcome&&e.passed===input.passed&&text(e.detail,'left_exact')===lx&&text(e.detail,'right_exact')===rx&&text(e.detail,'left_text')===lt&&text(e.detail,'right_text')===rt)return {id:String(e.id),duplicate:true};
 const id=randomUUID();
 await tables.insert('dq_reconciliations',{
  id,dataset:DATASETS.reconcile(input.pair),pair:input.pair,kind:input.kind,outcome:input.outcome,natural_key:input.natural_key,
  left_source:input.left_source,right_source:input.right_source,left_value:c(input.left_value),right_value:c(input.right_value),
  abs_diff:abs,rel_diff:c(input.rel_diff),tolerance,passed:input.passed,
  detail:{...input.detail,tolerance_exact:tolerance,...(abs===null?{}:{abs_diff_exact:abs}),...(lx===null?{}:{left_exact:lx}),...(rx===null?{}:{right_exact:rx}),...(input.inputs_hash===undefined?{}:{inputs_hash:input.inputs_hash})},
  batch_id:input.batch_id,cycle_id:null,issuer_id:null,market:null,attempt:null,created_at:(opts.now??(()=>new Date()))().toISOString(),
 });
 return {id,duplicate:false};
}
// src/lib/dq/reconcile/record.test.ts
import {describe,expect,it} from 'vitest';
import {memoryTableClient} from '../../db/memory-table-client';
import {recordReconciliation,recordReconciliationDetailed} from './record';
import type {ReconcileResultInput} from './types';

const text=(over:Partial<ReconcileResultInput>={}):ReconcileResultInput=>({natural_key:'320193:0000320193-23-000106',kind:'text',outcome:'compared',passed:true,left_value:null,right_value:null,abs_diff:null,rel_diff:null,tolerance:'0',left_source:'sec.submissions',right_source:'edgar.ixbrl.dei',detail:{left_text:'Large accelerated filer',right_text:'Large Accelerated Filer'},action:'record',...over});

describe('recordReconciliation (out-of-cycle rows, spec §5.1)',()=>{
 it('writes one row with dataset reconcile.<pair>, the four cycle columns null and inputs_hash in detail',async()=>{
  const t=memoryTableClient({dq_reconciliations:['id']});
  const id=await recordReconciliation(t,{...text({inputs_hash:'h'}),pair:'sec.filer_category',batch_id:null});
  const [row]=t.rows('dq_reconciliations');
  expect(row).toMatchObject({id,dataset:'reconcile.sec.filer_category',pair:'sec.filer_category',kind:'text',outcome:'compared',passed:true,left_value:null,right_value:null,tolerance:'0',cycle_id:null,issuer_id:null,market:null,attempt:null,batch_id:null});
  expect(row.detail).toEqual({left_text:'Large accelerated filer',right_text:'Large Accelerated Filer',tolerance_exact:'0',inputs_hash:'h'});
  expect(typeof row.created_at).toBe('string');
 });
 it('accepts a numeric compared row and a date row',async()=>{
  const t=memoryTableClient({dq_reconciliations:['id']});
  await recordReconciliation(t,{...text({kind:'numeric',left_value:'1',right_value:'2',abs_diff:'1',rel_diff:'0.5',passed:false}),pair:'entities.isin_hkex_vs_gleif',batch_id:'b'});
  await recordReconciliation(t,{...text({kind:'date',passed:false,detail:{left_text:'2024-02-01',right_text:'2024-02-02'}}),pair:'sec.filing_date_vs_submissions',batch_id:'b'});
  expect(t.rows('dq_reconciliations')).toHaveLength(2);
 });
 it('refuses cycle pairs, non-record actions, items, and rows that break the kind constraints',async()=>{
  const t=memoryTableClient({dq_reconciliations:['id']});
  const put=(over:Partial<ReconcileResultInput>,pair:Parameters<typeof recordReconciliation>[1]['pair']='sec.filer_category')=>recordReconciliation(t,{...text(over),pair,batch_id:null});
  await expect(put({},'us.companyfacts_vs_ixbrl')).rejects.toThrow('cycle_pair_requires_runner');
  await expect(put({action:'quarantine_left'})).rejects.toThrow('record_action_only');
  await expect(put({item:{natural_key:'k',payload:{}}})).rejects.toThrow('record_has_no_item');
  await expect(put({kind:'numeric',left_value:'1',right_value:null})).rejects.toThrow('numeric_sides_required');
  await expect(put({left_value:'1'})).rejects.toThrow('nonnumeric_sides_must_be_null');
  await expect(put({outcome:'right_missing',passed:true})).rejects.toThrow('passed_requires_compared');
  await expect(put({kind:'numeric',left_value:'1,0',right_value:'1'})).rejects.toThrow('invalid_decimal_field');
  await expect(put({tolerance:'-1'})).rejects.toThrow('invalid_tolerance');
  await expect(put({},'bogus' as never)).rejects.toThrow('invalid_pair');
  await expect(put({kind:'bogus' as never})).rejects.toThrow('invalid_kind');
  await expect(put({outcome:'bogus' as never,passed:false})).rejects.toThrow('invalid_outcome');
  await expect(put({outcome:'legacy' as never,passed:false})).rejects.toThrow('invalid_outcome');
  await expect(put({kind:'numeric',left_value:1 as never,right_value:'1'})).rejects.toThrow('invalid_decimal_field');
  await expect(put({tolerance:0 as never})).rejects.toThrow('invalid_tolerance');
  await expect(put({kind:'numeric',left_value:'1',right_value:'2',abs_diff:'-1'})).rejects.toThrow('negative_abs_diff');
  await expect(put({kind:'numeric',left_value:'1',right_value:'2',abs_diff:'1',rel_diff:'-0.5'})).rejects.toThrow('negative_rel_diff');
  expect(t.rows('dq_reconciliations')).toHaveLength(0);
 });
 it('writes canonical numeric fields, exact tolerance/abs_diff in detail, and uses the injected clock',async()=>{
  const t=memoryTableClient({dq_reconciliations:['id']});
  await recordReconciliation(t,{...text({kind:'numeric',left_value:'1.10',right_value:'1e0',abs_diff:'0.100',rel_diff:'0.0',tolerance:'0.0050'}),pair:'sec.filer_category',batch_id:null},{now:()=>new Date('2026-01-02T03:04:05.000Z')});
  const [row]=t.rows('dq_reconciliations');
  expect(row).toMatchObject({left_value:'1.1',right_value:'1',abs_diff:'0.1',rel_diff:'0',tolerance:'0.005',created_at:'2026-01-02T03:04:05.000Z'});
  expect(row.detail).toMatchObject({tolerance_exact:'0.005',abs_diff_exact:'0.1'});
 });
 it('is idempotent per (pair, natural_key) over identical values; a changed side or another pair writes a new row',async()=>{
  const t=memoryTableClient({dq_reconciliations:['id']});
  const d=(l:string,r:string)=>({...text({kind:'date',passed:false,detail:{left_text:l,right_text:r}}),pair:'sec.filing_date_vs_submissions' as const,batch_id:'b'});
  const a=await recordReconciliationDetailed(t,d('2024-02-01','2024-02-02'));
  const b=await recordReconciliationDetailed(t,{...d('2024-02-01','2024-02-02'),batch_id:'b2'});
  expect(a.duplicate).toBe(false);expect(b).toEqual({id:a.id,duplicate:true});
  expect(await recordReconciliation(t,d('2024-02-01','2024-02-02'))).toBe(a.id);
  expect(t.rows('dq_reconciliations')).toHaveLength(1);
  expect((await recordReconciliationDetailed(t,d('2024-02-01','2024-02-03'))).duplicate).toBe(false);
  expect(t.rows('dq_reconciliations')).toHaveLength(2);
 });
 it('numeric dedupe compares the exact strings in detail, never the numeric columns (PostgREST returns numbers)',async()=>{
  const t=memoryTableClient({dq_reconciliations:['id']});
  const num=(l:string,r:string)=>({...text({kind:'numeric',left_value:l,right_value:r,abs_diff:'1',rel_diff:'0.5',passed:false}),pair:'entities.isin_hkex_vs_gleif' as const,batch_id:null});
  const first=await recordReconciliationDetailed(t,num('123456789012345678.5','2'));
  expect(t.rows('dq_reconciliations')[0].detail).toMatchObject({left_exact:'123456789012345678.5',right_exact:'2'});
  // a store that hands numeric columns back as JSON numbers (lossy)
  const lossy={...t,select:async(table:string,match:Record<string,unknown>)=>(await t.select(table,match)).map(r=>({...r,left_value:Number(r.left_value),right_value:Number(r.right_value)}))} as typeof t;
  expect((await recordReconciliationDetailed(lossy,num('123456789012345678.5','2'))).duplicate).toBe(true);
  expect((await recordReconciliationDetailed(lossy,num('123456789012345678.6','2'))).duplicate).toBe(false);   // Number() would collapse these two
  expect(first.duplicate).toBe(false);expect(t.rows('dq_reconciliations')).toHaveLength(2);
 });
});

exec
/bin/zsh -lc "rg 'recordReconciliation|left_exact|right_exact' src/lib/dq/reconcile src/lib --glob '*.ts' | head -100; cat src/lib/db/table-client.ts; cat src/lib/db/memory-table-client.ts; cat package.json; find . -name AGENTS.override.md -o -name AGENTS.md; ls -a | head -30" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 138ms:
src/lib/dq/reconcile/record.ts:// on the exact strings kept in detail (left_exact/right_exact, left_text/right_text) — never on the numeric
src/lib/dq/reconcile/record.ts:export async function recordReconciliation(tables:TableClient,input:RecordInput,opts:{now?:()=>Date}={}):Promise<string>{return (await recordReconciliationDetailed(tables,input,opts)).id;}
src/lib/dq/reconcile/record.ts:export async function recordReconciliationDetailed(tables:TableClient,input:RecordInput,opts:{now?:()=>Date}={}):Promise<{id:string;duplicate:boolean}>{
src/lib/dq/reconcile/record.ts:  if(e.outcome===input.outcome&&e.passed===input.passed&&text(e.detail,'left_exact')===lx&&text(e.detail,'right_exact')===rx&&text(e.detail,'left_text')===lt&&text(e.detail,'right_text')===rt)return {id:String(e.id),duplicate:true};
src/lib/dq/reconcile/record.ts:  detail:{...input.detail,tolerance_exact:tolerance,...(abs===null?{}:{abs_diff_exact:abs}),...(lx===null?{}:{left_exact:lx}),...(rx===null?{}:{right_exact:rx}),...(input.inputs_hash===undefined?{}:{inputs_hash:input.inputs_hash})},
src/lib/dq/reconcile/record.test.ts:import {recordReconciliation,recordReconciliationDetailed} from './record';
src/lib/dq/reconcile/record.test.ts:describe('recordReconciliation (out-of-cycle rows, spec §5.1)',()=>{
src/lib/dq/reconcile/record.test.ts:  const id=await recordReconciliation(t,{...text({inputs_hash:'h'}),pair:'sec.filer_category',batch_id:null});
src/lib/dq/reconcile/record.test.ts:  await recordReconciliation(t,{...text({kind:'numeric',left_value:'1',right_value:'2',abs_diff:'1',rel_diff:'0.5',passed:false}),pair:'entities.isin_hkex_vs_gleif',batch_id:'b'});
src/lib/dq/reconcile/record.test.ts:  await recordReconciliation(t,{...text({kind:'date',passed:false,detail:{left_text:'2024-02-01',right_text:'2024-02-02'}}),pair:'sec.filing_date_vs_submissions',batch_id:'b'});
src/lib/dq/reconcile/record.test.ts:  const put=(over:Partial<ReconcileResultInput>,pair:Parameters<typeof recordReconciliation>[1]['pair']='sec.filer_category')=>recordReconciliation(t,{...text(over),pair,batch_id:null});
src/lib/dq/reconcile/record.test.ts:  await recordReconciliation(t,{...text({kind:'numeric',left_value:'1.10',right_value:'1e0',abs_diff:'0.100',rel_diff:'0.0',tolerance:'0.0050'}),pair:'sec.filer_category',batch_id:null},{now:()=>new Date('2026-01-02T03:04:05.000Z')});
src/lib/dq/reconcile/record.test.ts:  const a=await recordReconciliationDetailed(t,d('2024-02-01','2024-02-02'));
src/lib/dq/reconcile/record.test.ts:  const b=await recordReconciliationDetailed(t,{...d('2024-02-01','2024-02-02'),batch_id:'b2'});
src/lib/dq/reconcile/record.test.ts:  expect(await recordReconciliation(t,d('2024-02-01','2024-02-02'))).toBe(a.id);
src/lib/dq/reconcile/record.test.ts:  expect((await recordReconciliationDetailed(t,d('2024-02-01','2024-02-03'))).duplicate).toBe(false);
src/lib/dq/reconcile/record.test.ts:  const first=await recordReconciliationDetailed(t,num('123456789012345678.5','2'));
src/lib/dq/reconcile/record.test.ts:  expect(t.rows('dq_reconciliations')[0].detail).toMatchObject({left_exact:'123456789012345678.5',right_exact:'2'});
src/lib/dq/reconcile/record.test.ts:  expect((await recordReconciliationDetailed(lossy,num('123456789012345678.5','2'))).duplicate).toBe(true);
src/lib/dq/reconcile/record.test.ts:  expect((await recordReconciliationDetailed(lossy,num('123456789012345678.6','2'))).duplicate).toBe(false);   // Number() would collapse these two
src/lib/dq/reconcile/record.ts:// on the exact strings kept in detail (left_exact/right_exact, left_text/right_text) — never on the numeric
src/lib/dq/reconcile/record.ts:export async function recordReconciliation(tables:TableClient,input:RecordInput,opts:{now?:()=>Date}={}):Promise<string>{return (await recordReconciliationDetailed(tables,input,opts)).id;}
src/lib/dq/reconcile/record.ts:export async function recordReconciliationDetailed(tables:TableClient,input:RecordInput,opts:{now?:()=>Date}={}):Promise<{id:string;duplicate:boolean}>{
src/lib/dq/reconcile/record.ts:  if(e.outcome===input.outcome&&e.passed===input.passed&&text(e.detail,'left_exact')===lx&&text(e.detail,'right_exact')===rx&&text(e.detail,'left_text')===lt&&text(e.detail,'right_text')===rt)return {id:String(e.id),duplicate:true};
src/lib/dq/reconcile/record.ts:  detail:{...input.detail,tolerance_exact:tolerance,...(abs===null?{}:{abs_diff_exact:abs}),...(lx===null?{}:{left_exact:lx}),...(rx===null?{}:{right_exact:rx}),...(input.inputs_hash===undefined?{}:{inputs_hash:input.inputs_hash})},
src/lib/dq/reconcile/record.test.ts:import {recordReconciliation,recordReconciliationDetailed} from './record';
src/lib/dq/reconcile/record.test.ts:describe('recordReconciliation (out-of-cycle rows, spec §5.1)',()=>{
src/lib/dq/reconcile/record.test.ts:  const id=await recordReconciliation(t,{...text({inputs_hash:'h'}),pair:'sec.filer_category',batch_id:null});
src/lib/dq/reconcile/record.test.ts:  await recordReconciliation(t,{...text({kind:'numeric',left_value:'1',right_value:'2',abs_diff:'1',rel_diff:'0.5',passed:false}),pair:'entities.isin_hkex_vs_gleif',batch_id:'b'});
src/lib/dq/reconcile/record.test.ts:  await recordReconciliation(t,{...text({kind:'date',passed:false,detail:{left_text:'2024-02-01',right_text:'2024-02-02'}}),pair:'sec.filing_date_vs_submissions',batch_id:'b'});
src/lib/dq/reconcile/record.test.ts:  const put=(over:Partial<ReconcileResultInput>,pair:Parameters<typeof recordReconciliation>[1]['pair']='sec.filer_category')=>recordReconciliation(t,{...text(over),pair,batch_id:null});
src/lib/dq/reconcile/record.test.ts:  await recordReconciliation(t,{...text({kind:'numeric',left_value:'1.10',right_value:'1e0',abs_diff:'0.100',rel_diff:'0.0',tolerance:'0.0050'}),pair:'sec.filer_category',batch_id:null},{now:()=>new Date('2026-01-02T03:04:05.000Z')});
src/lib/dq/reconcile/record.test.ts:  const a=await recordReconciliationDetailed(t,d('2024-02-01','2024-02-02'));
src/lib/dq/reconcile/record.test.ts:  const b=await recordReconciliationDetailed(t,{...d('2024-02-01','2024-02-02'),batch_id:'b2'});
src/lib/dq/reconcile/record.test.ts:  expect(await recordReconciliation(t,d('2024-02-01','2024-02-02'))).toBe(a.id);
src/lib/dq/reconcile/record.test.ts:  expect((await recordReconciliationDetailed(t,d('2024-02-01','2024-02-03'))).duplicate).toBe(false);
src/lib/dq/reconcile/record.test.ts:  const first=await recordReconciliationDetailed(t,num('123456789012345678.5','2'));
src/lib/dq/reconcile/record.test.ts:  expect(t.rows('dq_reconciliations')[0].detail).toMatchObject({left_exact:'123456789012345678.5',right_exact:'2'});
src/lib/dq/reconcile/record.test.ts:  expect((await recordReconciliationDetailed(lossy,num('123456789012345678.5','2'))).duplicate).toBe(true);
src/lib/dq/reconcile/record.test.ts:  expect((await recordReconciliationDetailed(lossy,num('123456789012345678.6','2'))).duplicate).toBe(false);   // Number() would collapse these two
src/lib/facts/deps.ts:import {recordReconciliation} from '../dq/reconcile/record';
src/lib/facts/deps.ts:   recordDateMismatch:async r=>{await recordReconciliation(tables,{...r,pair:DATE_MISMATCH_PAIR,batch_id:null});}},{issuerId:issuer,cik10},b),
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
//  - rpc emulates only the plan-3 row-locking functions (append_claim_evidence, patch_quarantine_detail, set_security_identifier, set_issuer_identifier, set_security_window, patch_security_provenance, close_security_absent, settle_reconcile_cycle, record_cycle_freshness); one synchronous JS turn stands for the row lock.
import {CADENCES,computeFreshness} from '../dq/freshness';
import type {Cadence} from '../dq/freshness';
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
 // Task 14b review: twins of settle_reconcile_cycle / record_cycle_freshness (migration 20261107091000 section 14); detail is only ever
 // touched at the freshness key, so a pending_members entry registered meanwhile survives.
 settle_reconcile_cycle(rowsOf,a){
  const c=a.p_counts,f=a.p_freshness;
  if(!isObj(c)||!isObj(f)||typeof f.ok!=='boolean'||f.status!=='pending'||(a.p_status!=='complete'&&a.p_status!=='complete_with_gaps'))throw new TableError('rpc','settle_reconcile_cycle','invalid_settlement','22023');
  const row=rowsOf('dq_reconcile_cycles').find(r=>r.pair===a.p_pair&&r.cycle_id===a.p_cycle_id&&r.status==='running');
  if(!row)return false;
  Object.assign(row,{status:a.p_status,finished_at:typeof c.finished_at==='string'?c.finished_at:new Date().toISOString(),compared_passed:c.compared_passed,compared_failed:c.compared_failed,not_compared:c.not_compared,exec_failed_members:c.exec_failed_members,detail:{...(isObj(row.detail)?row.detail:{}),freshness:clone(f)}});
  return true;
 },
 record_cycle_freshness(rowsOf,a){
  const cadence=a.p_cadence as Cadence;
  if(typeof a.p_dataset!=='string'||a.p_dataset.length<1||a.p_dataset.length>64||!CADENCES.includes(cadence)||typeof a.p_at!=='string'||!Number.isFinite(Date.parse(a.p_at)))throw new TableError('rpc','record_cycle_freshness','invalid_freshness','22023');
  const row=rowsOf('dq_reconcile_cycles').find(r=>r.pair===a.p_pair&&r.cycle_id===a.p_cycle_id);
  if(!row)return 'not_found';
  if(row.status==='running')return 'not_terminal';
  const d=isObj(row.detail)?row.detail:{};const f=d.freshness;
  if(!isObj(f)||typeof f.ok!=='boolean')return 'no_freshness';
  if(f.status==='recorded')return 'already';
  const at=new Date(a.p_at);
  const rows=rowsOf('dq_freshness');const ex=rows.find(r=>r.dataset===a.p_dataset);
  const prevOk=ex?.last_ok_at?new Date(String(ex.last_ok_at)):null;
  const errs=f.ok?0:Number(ex?.consecutive_errors??0)+1;
  const lastOk=f.ok?at:prevOk;
  const next={dataset:a.p_dataset,expected_cadence:cadence,last_ok_at:lastOk?lastOk.toISOString():null,last_attempt_at:at.toISOString(),consecutive_errors:errs,status:computeFreshness({cadence,lastOkAt:lastOk,consecutiveErrors:errs,now:at}),detail:isObj(f.detail)?clone(f.detail):{},updated_at:at.toISOString()};
  if(ex)Object.assign(ex,next);else rows.push(next);
  row.detail={...d,freshness:{...f,status:'recorded'}};
  return 'recorded';
 },
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
  const cur=isObj(row.detail)?row.detail:{};
  // compare-and-set (Task 11 review, Codex P2): a given p_expect_hook_at must equal detail.hook.at, else nothing is written
  if(a.p_expect_hook_at!==undefined&&a.p_expect_hook_at!==null){
   const hook=isObj(cur.hook)?cur.hook:{};
   if(hook.at===undefined||hook.at===null||String(hook.at)!==String(a.p_expect_hook_at))return 'stale';
  }
  row.detail={...cur,[key]:clone(a.p_value)};
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
   let n=0;
   rows.forEach((r,i)=>{if(next[i]!==r){Object.assign(r,next[i]);n++;}});
   return n;
  },
  async select(t,match,opts={}){
   assertMatch(match);checkSelectOptions(opts);
   let out=rowsOf(t).filter(r=>matches(r,match)&&inRange(r,opts));
   if(opts.orderBy)out=[...out].sort(compare(opts.orderBy,!!opts.desc));
   if(opts.offset)out=out.slice(opts.offset);
   if(opts.limit!==undefined)out=out.slice(0,opts.limit);
   return clone(out);
  },
  async count(t,match,opts={}){
   assertMatch(match);checkRangeOptions(opts);
   return rowsOf(t).filter(r=>matches(r,match)&&inRange(r,opts)).length;
  },
  async upsert(t,row,onConflict){
   const cols=onConflict.split(',').map(s=>s.trim());
   if(keys[t]){
    const declared=new Set(keys[t]);
    if(cols.length!==declared.size||!cols.every(c=>declared.has(c)))
     throw new TableError('upsert',t,'there is no unique or exclusion constraint matching the ON CONFLICT specification','42P10');
   }
   const rows=rowsOf(t);const hit=rows.find(r=>cols.every(c=>r[c]===row[c]));
   if(clashes(t,{...hit,...row},hit))throw dup('upsert',t);
   if(hit)Object.assign(hit,clone(row));else rows.push(clone(row));
  },
  async rpc(fn,args){
   const impl=MEMORY_RPC[fn];
   if(!impl)throw new TableError('rpc',fn,`function public.${fn} does not exist`,'42883');
   return clone(impl(rowsOf,clone(args)));
  },
 };
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

codex
The change correctly uses canonical decimal strings stored in detail for deduplication, avoiding precision loss from numeric JSON responses. The added regression test covers this behavior; no actionable regressions were identified. Tests were not executed.
The change correctly uses canonical decimal strings stored in detail for deduplication, avoiding precision loss from numeric JSON responses. The added regression test covers this behavior; no actionable regressions were identified. Tests were not executed.

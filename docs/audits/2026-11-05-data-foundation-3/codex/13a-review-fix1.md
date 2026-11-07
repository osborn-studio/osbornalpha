OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b0bf-8a25-7cf0-9184-2f10b318a925
--------
user
commit e1220d8
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat e1220d8; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 2500ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-SFCDqs70' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-JQ7v7sB7' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/13a-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/13a-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/13a-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-DsHTdsd1' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-Q2Z5tQeR' (errno=Operation not permitted)
commit e1220d8bc15ca63648d9f2b0bf32c314cdcdbd63
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 04:04:49 2026 -0800

    fix(dq): reconcile ratios keep significance, strict record validation, decimal_overflow, injectable clock (Task 13a review)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

 src/lib/dq/reconcile/decimal.test.ts | 12 +++++++++++-
 src/lib/dq/reconcile/decimal.ts      | 17 ++++++++++++++---
 src/lib/dq/reconcile/record.test.ts  | 16 +++++++++++++++-
 src/lib/dq/reconcile/record.ts       | 26 ++++++++++++++++++--------
 src/lib/dq/reconcile/types.ts        |  4 +++-
 5 files changed, 61 insertions(+), 14 deletions(-)

exec
/bin/zsh -lc 'pwd; ls -a | head -35; for d in /Volumes /Volumes/AIMATE_WORK /Volumes/AIMATE_WORK/Developer /Volumes/AIMATE_WORK/Developer/CodeX /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees; do for f in AGENTS.override.md AGENTS.md; do test ! -f "$d/$f" || { echo "$d/$f"; cat "$d/$f"; }; done; done; git show e1220d8 --; cat src/lib/dq/reconcile/{decimal,record,types}.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
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
package-lock.json
package.json
playwright.config.ts
postcss.config.mjs
public
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-Him6EYES' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-c0BfxJCd' (errno=Operation not permitted)
commit e1220d8bc15ca63648d9f2b0bf32c314cdcdbd63
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 04:04:49 2026 -0800

    fix(dq): reconcile ratios keep significance, strict record validation, decimal_overflow, injectable clock (Task 13a review)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/dq/reconcile/decimal.test.ts b/src/lib/dq/reconcile/decimal.test.ts
index 2514be4..e35748e 100644
--- a/src/lib/dq/reconcile/decimal.test.ts
+++ b/src/lib/dq/reconcile/decimal.test.ts
@@ -37,10 +37,20 @@ describe('decimal (scaled BigInt, spec §5.1)',()=>{
   expect(()=>divDecimal('1','0')).toThrow('division_by_zero');
  });
  it('rel_diff = |l−r| / max(|l|,|r|,1)',()=>{
-  expect(relDiff('100','101')).toBe('0.0099009901');
+  expect(relDiff('100','101')).toBe('0.009900990099');       // scale = 10 + 3 integer digits
   expect(relDiff('0','0.5')).toBe('0.5');          // denominator floor of 1
   expect(relDiff('-5','5')).toBe('2');
   expect(relDiff('383285000000','383285000000')).toBe('0');
+  expect(relDiff('383285000000.005','383285000000')).not.toBe('0');   // 0.005 on 3.8e11 keeps significance
+  expect(compareDecimal(relDiff('383285000000.005','383285000000'),'0')).toBe(1);
+ });
+ it('overflow beyond the 512-character literal cap is a distinct decimal_overflow code',()=>{
+  const big='9'.repeat(512);
+  expect(addDecimal(big,'0')).toBe(big);
+  expect(()=>addDecimal(big,'1')).toThrow('decimal_overflow');
+  expect(()=>subDecimal(`-${'9'.repeat(511)}`,'9'.repeat(511))).toThrow('decimal_overflow');
+  expect(()=>mulDecimal('9'.repeat(300),'9'.repeat(300))).toThrow('decimal_overflow');
+  expect(()=>addDecimal('1,0','1')).toThrow('invalid_decimal');
  });
  it('withinRadius is |value − center| <= radius by cross-multiplication (inclusive)',()=>{
   expect(withinRadius('383285000000.004','383285000000','0.005')).toBe(true);
diff --git a/src/lib/dq/reconcile/decimal.ts b/src/lib/dq/reconcile/decimal.ts
index dd79f35..e9a0c60 100644
--- a/src/lib/dq/reconcile/decimal.ts
+++ b/src/lib/dq/reconcile/decimal.ts
@@ -5,6 +5,10 @@
 // (rel_diff, tolerance), rounded half away from zero at a fixed number of places. Every input goes
 // through plan 2's canonicalDecimal first, so exponents and leading/trailing zeros are accepted and
 // anything else throws invalid_decimal. Number() is never applied to a value.
+// Cap: every result is formatted through canonicalDecimal, whose literal limit is 512 characters; a sum,
+// difference or product that would exceed it throws decimal_overflow (distinct from invalid_decimal, which
+// means malformed input). Ratios (relDiff/divDecimal) are DERIVED/DISPLAY values: pass/fail must always be
+// decided by exact comparison (compareDecimal/withinRadius), never by the rounded ratio.
 import {canonicalDecimal} from '../../facts/json-numbers';
 
 export interface ScaledDecimal{units:bigint;scale:number}
@@ -17,9 +21,12 @@ export function parseDecimal(s:string):ScaledDecimal{
  const u=BigInt(i+f);
  return {units:neg?-u:u,scale:f.length};
 }
+const MAX_LITERAL=512;
 export function formatDecimal(d:ScaledDecimal):string{
  const neg=d.units<0n;let digits=babs(d.units).toString();
+ if(digits.length>MAX_LITERAL||d.scale>MAX_LITERAL)throw new Error('decimal_overflow');
  if(d.scale>0){digits=digits.padStart(d.scale+1,'0');digits=`${digits.slice(0,-d.scale)}.${digits.slice(-d.scale)}`;}
+ if(digits.length+(neg?1:0)>MAX_LITERAL)throw new Error('decimal_overflow');
  return canonicalDecimal((neg?'-':'')+digits);
 }
 export const isDecimalText=(s:string):boolean=>{try{canonicalDecimal(s);return true;}catch{return false;}};
@@ -37,15 +44,19 @@ export function maxAbsDecimal(...xs:string[]):string{
 }
 /** a / b rounded half away from zero to `scale` places (one guard digit on the truncated absolute quotient). */
 export function divDecimal(a:string,b:string,scale=10):string{
- if(!Number.isInteger(scale)||scale<0||scale>40)throw new Error('invalid_scale');
+ if(!Number.isInteger(scale)||scale<0||scale>MAX_LITERAL)throw new Error('invalid_scale');
  const [x,y]=align(parseDecimal(a),parseDecimal(b));
  if(y===0n)throw new Error('division_by_zero');
  const q=(babs(x)*pow10(scale+1))/babs(y);
  const r=(q+5n)/10n;
  return formatDecimal({units:(x<0n)!==(y<0n)?-r:r,scale});
 }
-/** |l − r| / max(|l|, |r|, 1) (spec §5.1). */
-export function relDiff(l:string,r:string,scale=10):string{return divDecimal(absDecimal(subDecimal(l,r)),maxAbsDecimal(l,r,'1'),scale);}
+/** |l − r| / max(|l|, |r|, 1) (spec §5.1). Derived/display value. The default scale is 10 plus the digit count of the
+ * denominator's integer part, so a 0.005 difference on a 3.8e11 base is not rounded to "0". */
+export function relDiff(l:string,r:string,scale?:number):string{
+ const den=maxAbsDecimal(l,r,'1');
+ return divDecimal(absDecimal(subDecimal(l,r)),den,scale??10+den.split('.')[0].length);
+}
 /** |value − center| <= radius, by aligning scales (no division). */
 export function withinRadius(value:string,center:string,radius:string):boolean{
  const rad=parseDecimal(radius);if(rad.units<0n)throw new Error('negative_radius');
diff --git a/src/lib/dq/reconcile/record.test.ts b/src/lib/dq/reconcile/record.test.ts
index 47599cc..857a610 100644
--- a/src/lib/dq/reconcile/record.test.ts
+++ b/src/lib/dq/reconcile/record.test.ts
@@ -12,7 +12,7 @@ describe('recordReconciliation (out-of-cycle rows, spec §5.1)',()=>{
   const id=await recordReconciliation(t,{...text({inputs_hash:'h'}),pair:'sec.filer_category',batch_id:null});
   const [row]=t.rows('dq_reconciliations');
   expect(row).toMatchObject({id,dataset:'reconcile.sec.filer_category',pair:'sec.filer_category',kind:'text',outcome:'compared',passed:true,left_value:null,right_value:null,tolerance:'0',cycle_id:null,issuer_id:null,market:null,attempt:null,batch_id:null});
-  expect(row.detail).toEqual({left_text:'Large accelerated filer',right_text:'Large Accelerated Filer',inputs_hash:'h'});
+  expect(row.detail).toEqual({left_text:'Large accelerated filer',right_text:'Large Accelerated Filer',tolerance_exact:'0',inputs_hash:'h'});
   expect(typeof row.created_at).toBe('string');
  });
  it('accepts a numeric compared row and a date row',async()=>{
@@ -33,6 +33,20 @@ describe('recordReconciliation (out-of-cycle rows, spec §5.1)',()=>{
   await expect(put({kind:'numeric',left_value:'1,0',right_value:'1'})).rejects.toThrow('invalid_decimal_field');
   await expect(put({tolerance:'-1'})).rejects.toThrow('invalid_tolerance');
   await expect(put({},'bogus' as never)).rejects.toThrow('invalid_pair');
+  await expect(put({kind:'bogus' as never})).rejects.toThrow('invalid_kind');
+  await expect(put({outcome:'bogus' as never,passed:false})).rejects.toThrow('invalid_outcome');
+  await expect(put({outcome:'legacy' as never,passed:false})).rejects.toThrow('invalid_outcome');
+  await expect(put({kind:'numeric',left_value:1 as never,right_value:'1'})).rejects.toThrow('invalid_decimal_field');
+  await expect(put({tolerance:0 as never})).rejects.toThrow('invalid_tolerance');
+  await expect(put({kind:'numeric',left_value:'1',right_value:'2',abs_diff:'-1'})).rejects.toThrow('negative_abs_diff');
+  await expect(put({kind:'numeric',left_value:'1',right_value:'2',abs_diff:'1',rel_diff:'-0.5'})).rejects.toThrow('negative_rel_diff');
   expect(t.rows('dq_reconciliations')).toHaveLength(0);
  });
+ it('writes canonical numeric fields, exact tolerance/abs_diff in detail, and uses the injected clock',async()=>{
+  const t=memoryTableClient({dq_reconciliations:['id']});
+  await recordReconciliation(t,{...text({kind:'numeric',left_value:'1.10',right_value:'1e0',abs_diff:'0.100',rel_diff:'0.0',tolerance:'0.0050'}),pair:'sec.filer_category',batch_id:null},{now:()=>new Date('2026-01-02T03:04:05.000Z')});
+  const [row]=t.rows('dq_reconciliations');
+  expect(row).toMatchObject({left_value:'1.1',right_value:'1',abs_diff:'0.1',rel_diff:'0',tolerance:'0.005',created_at:'2026-01-02T03:04:05.000Z'});
+  expect(row.detail).toMatchObject({tolerance_exact:'0.005',abs_diff_exact:'0.1'});
+ });
 });
diff --git a/src/lib/dq/reconcile/record.ts b/src/lib/dq/reconcile/record.ts
index 2e8042c..02b5217 100644
--- a/src/lib/dq/reconcile/record.ts
+++ b/src/lib/dq/reconcile/record.ts
@@ -9,27 +9,37 @@ import {randomUUID} from 'node:crypto';
 import type {TableClient} from '../../db/table-client';
 import {DATASETS} from '../datasets';
 import {compareDecimal,isDecimalText} from './decimal';
-import {CYCLE_PAIR_IDS,RECONCILE_PAIR_IDS} from './types';
+import {canonicalDecimal} from '../../facts/json-numbers';
+import {CYCLE_PAIR_IDS,RECONCILE_OUTCOMES,RECONCILE_PAIR_IDS} from './types';
 import type {ReconcilePairId,ReconcileResultInput} from './types';
 
-export async function recordReconciliation(tables:TableClient,input:ReconcileResultInput&{pair:ReconcilePairId;batch_id:string|null}):Promise<string>{
+const isStr=(v:unknown):v is string=>typeof v==='string';
+/** Numeric columns are written canonical; ratio columns (rel_diff) are derived/display, pass/fail is `passed`, decided by exact comparison.
+ * detail.tolerance_exact / abs_diff_exact keep the exact values next to the columns. */
+export async function recordReconciliation(tables:TableClient,input:ReconcileResultInput&{pair:ReconcilePairId;batch_id:string|null},opts:{now?:()=>Date}={}):Promise<string>{
  if(!(RECONCILE_PAIR_IDS as readonly string[]).includes(input.pair))throw new Error('invalid_pair');
  if((CYCLE_PAIR_IDS as readonly string[]).includes(input.pair))throw new Error('cycle_pair_requires_runner');
  if(input.action!=='record')throw new Error('record_action_only');
  if(input.item!==undefined)throw new Error('record_has_no_item');
+ if(!(['numeric','text','date'] as readonly unknown[]).includes(input.kind))throw new Error('invalid_kind');
+ if(!(RECONCILE_OUTCOMES as readonly unknown[]).includes(input.outcome))throw new Error('invalid_outcome');
  const numeric=input.kind==='numeric';
  if(numeric&&input.outcome==='compared'&&(input.left_value===null||input.right_value===null))throw new Error('numeric_sides_required');
  if(!numeric&&(input.left_value!==null||input.right_value!==null||input.abs_diff!==null||input.rel_diff!==null))throw new Error('nonnumeric_sides_must_be_null');
- for(const v of [input.left_value,input.right_value,input.abs_diff,input.rel_diff,input.tolerance])if(v!==null&&!isDecimalText(v))throw new Error('invalid_decimal_field');
- if(compareDecimal(input.tolerance,'0')<0)throw new Error('invalid_tolerance');
+ for(const v of [input.left_value,input.right_value,input.abs_diff,input.rel_diff])if(v!==null&&(!isStr(v)||!isDecimalText(v)))throw new Error('invalid_decimal_field');
+ if(!isStr(input.tolerance)||!isDecimalText(input.tolerance)||compareDecimal(input.tolerance,'0')<0)throw new Error('invalid_tolerance');
+ if(input.abs_diff!==null&&compareDecimal(input.abs_diff,'0')<0)throw new Error('negative_abs_diff');
+ if(input.rel_diff!==null&&compareDecimal(input.rel_diff,'0')<0)throw new Error('negative_rel_diff');
  if(input.outcome!=='compared'&&input.passed)throw new Error('passed_requires_compared');
+ const c=(v:string|null)=>v===null?null:canonicalDecimal(v);
+ const tolerance=canonicalDecimal(input.tolerance),abs=c(input.abs_diff);
  const id=randomUUID();
  await tables.insert('dq_reconciliations',{
   id,dataset:DATASETS.reconcile(input.pair),pair:input.pair,kind:input.kind,outcome:input.outcome,natural_key:input.natural_key,
-  left_source:input.left_source,right_source:input.right_source,left_value:input.left_value,right_value:input.right_value,
-  abs_diff:input.abs_diff,rel_diff:input.rel_diff,tolerance:input.tolerance,passed:input.passed,
-  detail:{...input.detail,...(input.inputs_hash===undefined?{}:{inputs_hash:input.inputs_hash})},
-  batch_id:input.batch_id,cycle_id:null,issuer_id:null,market:null,attempt:null,created_at:new Date().toISOString(),
+  left_source:input.left_source,right_source:input.right_source,left_value:c(input.left_value),right_value:c(input.right_value),
+  abs_diff:abs,rel_diff:c(input.rel_diff),tolerance,passed:input.passed,
+  detail:{...input.detail,tolerance_exact:tolerance,...(abs===null?{}:{abs_diff_exact:abs}),...(input.inputs_hash===undefined?{}:{inputs_hash:input.inputs_hash})},
+  batch_id:input.batch_id,cycle_id:null,issuer_id:null,market:null,attempt:null,created_at:(opts.now??(()=>new Date()))().toISOString(),
  });
  return id;
 }
diff --git a/src/lib/dq/reconcile/types.ts b/src/lib/dq/reconcile/types.ts
index 35baee0..2aca4c8 100644
--- a/src/lib/dq/reconcile/types.ts
+++ b/src/lib/dq/reconcile/types.ts
@@ -30,7 +30,9 @@ export interface PendingMember{issuer_id:string;market:Market;source:string}
 /** open_reconcile_cycle input (plan audit Q2): members frozen with their expected keys (the {naturalKey, locator} shape Task 13a names ExpectedKey); pending = exactly the snapshot entries the runner resolved keys for. */
 export interface OpenCycleInput{pair:CyclePairId;cycleId:string;startedAt:string;members:{issuer_id:string;market:Market;expected_keys:{naturalKey:string;locator:Record<string,unknown>}[]}[];pending:PendingMember[]}
 export interface OpenCycleResult{created:boolean;cycle:Record<string,unknown>;transferred:PendingMember[]}
-export const RECONCILE_OUTCOMES:readonly ReconcileOutcome[]=['compared','left_missing','left_unlinked','left_ambiguous','right_missing','unsupported','right_ambiguous','incomplete_gold'];
+export const RECONCILE_OUTCOMES=['compared','left_missing','left_unlinked','left_ambiguous','right_missing','unsupported','right_ambiguous','incomplete_gold'] as const satisfies readonly ReconcileOutcome[];
+/** Compile-time exhaustiveness: fails to typecheck if ReconcileOutcome gains a member missing from RECONCILE_OUTCOMES. */
+export const OUTCOMES_EXHAUSTIVE:[Exclude<ReconcileOutcome,typeof RECONCILE_OUTCOMES[number]>] extends [never]?true:never=true;
 export type CycleStatus='running'|'complete'|'complete_with_gaps';
 export type CursorState='pending'|'claimed'|'done'|'failed';
 /** A cursor whose attempts reached this value in state 'failed' is terminal (spec §5.5, S4). */
// src/lib/dq/reconcile/decimal.ts
// Exact decimal arithmetic for reconciliation (spec §5.1). A decimal string becomes a scaled BigInt
// {units, scale} (value = units / 10^scale). Comparisons align the two scales by multiplying with
// powers of ten (cross-multiplication) and never divide; the only division is the reported ratio
// (rel_diff, tolerance), rounded half away from zero at a fixed number of places. Every input goes
// through plan 2's canonicalDecimal first, so exponents and leading/trailing zeros are accepted and
// anything else throws invalid_decimal. Number() is never applied to a value.
// Cap: every result is formatted through canonicalDecimal, whose literal limit is 512 characters; a sum,
// difference or product that would exceed it throws decimal_overflow (distinct from invalid_decimal, which
// means malformed input). Ratios (relDiff/divDecimal) are DERIVED/DISPLAY values: pass/fail must always be
// decided by exact comparison (compareDecimal/withinRadius), never by the rounded ratio.
import {canonicalDecimal} from '../../facts/json-numbers';

export interface ScaledDecimal{units:bigint;scale:number}
const pow10=(k:number)=>10n**BigInt(k);
const babs=(x:bigint)=>x<0n?-x:x;

export function parseDecimal(s:string):ScaledDecimal{
 const c=canonicalDecimal(s);
 const neg=c.startsWith('-');const body=neg?c.slice(1):c;const [i,f='']=body.split('.');
 const u=BigInt(i+f);
 return {units:neg?-u:u,scale:f.length};
}
const MAX_LITERAL=512;
export function formatDecimal(d:ScaledDecimal):string{
 const neg=d.units<0n;let digits=babs(d.units).toString();
 if(digits.length>MAX_LITERAL||d.scale>MAX_LITERAL)throw new Error('decimal_overflow');
 if(d.scale>0){digits=digits.padStart(d.scale+1,'0');digits=`${digits.slice(0,-d.scale)}.${digits.slice(-d.scale)}`;}
 if(digits.length+(neg?1:0)>MAX_LITERAL)throw new Error('decimal_overflow');
 return canonicalDecimal((neg?'-':'')+digits);
}
export const isDecimalText=(s:string):boolean=>{try{canonicalDecimal(s);return true;}catch{return false;}};
function align(a:ScaledDecimal,b:ScaledDecimal):[bigint,bigint,number]{const s=Math.max(a.scale,b.scale);return [a.units*pow10(s-a.scale),b.units*pow10(s-b.scale),s];}

export function compareDecimal(a:string,b:string):-1|0|1{const [x,y]=align(parseDecimal(a),parseDecimal(b));return x<y?-1:x>y?1:0;}
export function addDecimal(a:string,b:string):string{const [x,y,s]=align(parseDecimal(a),parseDecimal(b));return formatDecimal({units:x+y,scale:s});}
export function subDecimal(a:string,b:string):string{const [x,y,s]=align(parseDecimal(a),parseDecimal(b));return formatDecimal({units:x-y,scale:s});}
export function absDecimal(a:string):string{const d=parseDecimal(a);return formatDecimal({units:babs(d.units),scale:d.scale});}
export function mulDecimal(a:string,b:string):string{const x=parseDecimal(a),y=parseDecimal(b);return formatDecimal({units:x.units*y.units,scale:x.scale+y.scale});}
/** max(|x|) over the arguments (at least one). */
export function maxAbsDecimal(...xs:string[]):string{
 if(xs.length===0)throw new Error('empty_max');
 return xs.map(absDecimal).reduce((m,x)=>compareDecimal(x,m)>0?x:m);
}
/** a / b rounded half away from zero to `scale` places (one guard digit on the truncated absolute quotient). */
export function divDecimal(a:string,b:string,scale=10):string{
 if(!Number.isInteger(scale)||scale<0||scale>MAX_LITERAL)throw new Error('invalid_scale');
 const [x,y]=align(parseDecimal(a),parseDecimal(b));
 if(y===0n)throw new Error('division_by_zero');
 const q=(babs(x)*pow10(scale+1))/babs(y);
 const r=(q+5n)/10n;
 return formatDecimal({units:(x<0n)!==(y<0n)?-r:r,scale});
}
/** |l − r| / max(|l|, |r|, 1) (spec §5.1). Derived/display value. The default scale is 10 plus the digit count of the
 * denominator's integer part, so a 0.005 difference on a 3.8e11 base is not rounded to "0". */
export function relDiff(l:string,r:string,scale?:number):string{
 const den=maxAbsDecimal(l,r,'1');
 return divDecimal(absDecimal(subDecimal(l,r)),den,scale??10+den.split('.')[0].length);
}
/** |value − center| <= radius, by aligning scales (no division). */
export function withinRadius(value:string,center:string,radius:string):boolean{
 const rad=parseDecimal(radius);if(rad.units<0n)throw new Error('negative_radius');
 const d=parseDecimal(subDecimal(value,center));
 const [x,y]=align({units:babs(d.units),scale:d.scale},rad);
 return x<=y;
}
// src/lib/dq/reconcile/record.ts
// Out-of-cycle reconciliation rows (spec §5.1): sec.filing_date_vs_submissions, sec.filer_category and
// entities.isin_hkex_vs_gleif are recorded inline by their producers. Only action 'record' exists here:
// no work item, no visibility change, and cycle_id/issuer_id/market/attempt all null (constraint
// dq_reconciliations_cycle_cols). Cycle pairs must go through run.ts / apply_reconcile_result. The kind
// rules mirror the two table constraints (numeric compared needs both sides; text/date keep the values in
// detail.left_text/right_text and leave every numeric column null) so a bad row fails here with a code.
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
export async function recordReconciliation(tables:TableClient,input:ReconcileResultInput&{pair:ReconcilePairId;batch_id:string|null},opts:{now?:()=>Date}={}):Promise<string>{
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
 const id=randomUUID();
 await tables.insert('dq_reconciliations',{
  id,dataset:DATASETS.reconcile(input.pair),pair:input.pair,kind:input.kind,outcome:input.outcome,natural_key:input.natural_key,
  left_source:input.left_source,right_source:input.right_source,left_value:c(input.left_value),right_value:c(input.right_value),
  abs_diff:abs,rel_diff:c(input.rel_diff),tolerance,passed:input.passed,
  detail:{...input.detail,tolerance_exact:tolerance,...(abs===null?{}:{abs_diff_exact:abs}),...(input.inputs_hash===undefined?{}:{inputs_hash:input.inputs_hash})},
  batch_id:input.batch_id,cycle_id:null,issuer_id:null,market:null,attempt:null,created_at:(opts.now??(()=>new Date()))().toISOString(),
 });
 return id;
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
export const RECONCILE_OUTCOMES=['compared','left_missing','left_unlinked','left_ambiguous','right_missing','unsupported','right_ambiguous','incomplete_gold'] as const satisfies readonly ReconcileOutcome[];
/** Compile-time exhaustiveness: fails to typecheck if ReconcileOutcome gains a member missing from RECONCILE_OUTCOMES. */
export const OUTCOMES_EXHAUSTIVE:[Exclude<ReconcileOutcome,typeof RECONCILE_OUTCOMES[number]>] extends [never]?true:never=true;
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

exec
/bin/zsh -lc "cat src/lib/facts/json-numbers.ts; rg 'relDiff|RECONCILE_OUTCOMES' src --glob '*.ts'; cat package.json | head -65; find . -name AGENTS.md -o -name AGENTS.override.md; git log -3 --oneline" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 306ms:
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
src/lib/dq/rules.ts: const relDiff=Math.abs(left/scale-right/scale-expected/scale);
src/lib/dq/rules.ts: if(relDiff<=tolerance)return {ruleId,passed:true};
src/lib/dq/rules.ts: const diff=relDiff*scale;
src/lib/dq/rules.ts: return {ruleId,passed:false,detail:{left,right,expected,diff:Number.isFinite(diff)?diff:null,relDiff,tolerance}};
src/lib/dq/reconcile/decimal.test.ts:import {absDecimal,addDecimal,compareDecimal,divDecimal,formatDecimal,isDecimalText,maxAbsDecimal,mulDecimal,parseDecimal,relDiff,subDecimal,withinRadius} from './decimal';
src/lib/dq/reconcile/decimal.test.ts:  expect(relDiff('100','101')).toBe('0.009900990099');       // scale = 10 + 3 integer digits
src/lib/dq/reconcile/decimal.test.ts:  expect(relDiff('0','0.5')).toBe('0.5');          // denominator floor of 1
src/lib/dq/reconcile/decimal.test.ts:  expect(relDiff('-5','5')).toBe('2');
src/lib/dq/reconcile/decimal.test.ts:  expect(relDiff('383285000000','383285000000')).toBe('0');
src/lib/dq/reconcile/decimal.test.ts:  expect(relDiff('383285000000.005','383285000000')).not.toBe('0');   // 0.005 on 3.8e11 keeps significance
src/lib/dq/reconcile/decimal.test.ts:  expect(compareDecimal(relDiff('383285000000.005','383285000000'),'0')).toBe(1);
src/lib/dq/reconcile/decimal.ts:// means malformed input). Ratios (relDiff/divDecimal) are DERIVED/DISPLAY values: pass/fail must always be
src/lib/dq/reconcile/decimal.ts:export function relDiff(l:string,r:string,scale?:number):string{
src/lib/dq/reconcile/types.ts:export const RECONCILE_OUTCOMES=['compared','left_missing','left_unlinked','left_ambiguous','right_missing','unsupported','right_ambiguous','incomplete_gold'] as const satisfies readonly ReconcileOutcome[];
src/lib/dq/reconcile/types.ts:/** Compile-time exhaustiveness: fails to typecheck if ReconcileOutcome gains a member missing from RECONCILE_OUTCOMES. */
src/lib/dq/reconcile/types.ts:export const OUTCOMES_EXHAUSTIVE:[Exclude<ReconcileOutcome,typeof RECONCILE_OUTCOMES[number]>] extends [never]?true:never=true;
src/lib/dq/reconcile/record.ts:import {CYCLE_PAIR_IDS,RECONCILE_OUTCOMES,RECONCILE_PAIR_IDS} from './types';
src/lib/dq/reconcile/record.ts: if(!(RECONCILE_OUTCOMES as readonly unknown[]).includes(input.outcome))throw new Error('invalid_outcome');
src/lib/dq/rules.test.ts:  expect(r.detail).toMatchObject({diff:null,relDiff:2});
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
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-2ZEjzR9Z' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-eOubNRMX' (errno=Operation not permitted)
e1220d8 fix(dq): reconcile ratios keep significance, strict record validation, decimal_overflow, injectable clock (Task 13a review)
4bf500b feat(dq): reconcile contract types, exact decimal comparison, inputs_hash, out-of-cycle record
cd8d267 docs(audit): plan 3 log and Codex reports for Task 12 (Part C complete)

exec
/bin/zsh -lc "node -e 'const ts=require(\"typescript\"),fs=require(\"fs\"),vm=require(\"vm\");function load(p,req){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(p,\"utf8\"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:req});return exports}const j=load(\"src/lib/facts/json-numbers.ts\");const d=load(\"src/lib/dq/reconcile/decimal.ts\",()=>j);for(const n of [499,500,501,502,503,512]){let x=\"9\".repeat(n);try{console.log(n,d.relDiff(x,x))}catch(e){console.log(n,e.message)}}'" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 217ms:
499 0
500 0
501 decimal_overflow
502 decimal_overflow
503 invalid_scale
512 invalid_scale

codex
The adaptive relative-difference precision introduces a reproducible failure for valid inputs near the supported decimal length limit. The remaining changes show no clear introduced defects.

Review comment:

- [P2] Bound the automatically selected relative-difference scale — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/reconcile/decimal.ts:59-59
  For accepted decimal inputs with 501–512 integer digits, the new default scale makes `relDiff` throw even when both inputs are identical and the result should be `0`. For example, `relDiff('9'.repeat(501), '9'.repeat(501))` throws `decimal_overflow`; at 503 digits it throws `invalid_scale`. These calls succeeded before this change. Bound the derived precision to the formatter's available literal budget and add boundary tests so valid inputs do not fail solely because of automatically chosen display precision.
The adaptive relative-difference precision introduces a reproducible failure for valid inputs near the supported decimal length limit. The remaining changes show no clear introduced defects.

Review comment:

- [P2] Bound the automatically selected relative-difference scale — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/reconcile/decimal.ts:59-59
  For accepted decimal inputs with 501–512 integer digits, the new default scale makes `relDiff` throw even when both inputs are identical and the result should be `0`. For example, `relDiff('9'.repeat(501), '9'.repeat(501))` throws `decimal_overflow`; at 503 digits it throws `invalid_scale`. These calls succeeded before this change. Bound the derived precision to the formatter's available literal budget and add boundary tests so valid inputs do not fail solely because of automatically chosen display precision.

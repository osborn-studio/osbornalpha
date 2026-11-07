OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b0eb-6182-79a2-afa9-53c456bdde4d
--------
user
commit 9f4eb18
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 9f4eb18; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 5759ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-XrsdInVL' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-gUoGgAR6' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/14a-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-XWzuaztm' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-ypRL5hJ2' (errno=Operation not permitted)
9f4eb18 feat(dq): reconcile pair registry with lineage same-day and plan-2 US gold pairs
 src/lib/dq/datasets.test.ts          |  11 ++-
 src/lib/dq/reconcile/pair-lineage.ts |  84 ++++++++++++++++
 src/lib/dq/reconcile/pair-support.ts | 102 +++++++++++++++++++
 src/lib/dq/reconcile/pair-us-gold.ts | 109 +++++++++++++++++++++
 src/lib/dq/reconcile/pairs.test.ts   | 185 +++++++++++++++++++++++++++++++++++
 src/lib/dq/reconcile/pairs.ts        |  41 ++++++++
 src/lib/dq/reconcile/testing.ts      |  26 +++++
 7 files changed, 557 insertions(+), 1 deletion(-)

exec
/bin/zsh -lc 'pwd; ls -a | head -30; for d in /Volumes /Volumes/AIMATE_WORK /Volumes/AIMATE_WORK/Developer /Volumes/AIMATE_WORK/Developer/CodeX /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees; do for n in AGENTS.override.md AGENTS.md; do test ! -f "$d/$n" || { echo "$d/$n"; cat "$d/$n"; }; done; done; git show 9f4eb18 -- src/lib/dq' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 367ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-RTpPAjv8' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-aIMxsjBs' (errno=Operation not permitted)
commit 9f4eb18032caeaddc475356a9b50a64caddc7bde
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 04:52:30 2026 -0800

    feat(dq): reconcile pair registry with lineage same-day and plan-2 US gold pairs
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/dq/datasets.test.ts b/src/lib/dq/datasets.test.ts
index b01ea92..7cf9866 100644
--- a/src/lib/dq/datasets.test.ts
+++ b/src/lib/dq/datasets.test.ts
@@ -4,7 +4,8 @@ import {join} from 'node:path';
 import {describe,it,expect} from 'vitest';
 import {CADENCES} from './freshness';
 import {DATASETS,DQ_DATASET_INVENTORY,DQ_DATASET_NAMES,inventoryEntry} from './datasets';
-import {RECONCILE_PAIR_IDS} from './reconcile/types';
+import {RECONCILE_PAIRS} from './reconcile/pairs';
+import {CYCLE_PAIR_IDS,RECONCILE_PAIR_IDS} from './reconcile/types';
 
 // A dataset literal anywhere but the registry means a producer bypassed DATASETS (spec 3 §6.3).
 const LITERAL=/(['"`])(entities\.(?:sec|research-link|identifiers|cninfo|ah-link|windows|sec-submissions)|facts\.(?:us|cn|acceptance)|dq\.(?:calendar\.(?:us|cn)|filer-categories)|reconcile\.[a-z][a-z_.]*)\1/;
@@ -62,3 +63,11 @@ describe('DATASETS / DQ_DATASET_INVENTORY',()=>{
   expect(hits).toEqual([]);
  });
 });
+
+describe('ReconcilePairId ↔ pairs.ts (spec §6.3)',()=>{
+ it('every registered pair is a cycle pair id, every cycle pair id is a ReconcilePairId, and each has an inventory entry',()=>{
+  for(const id of Object.keys(RECONCILE_PAIRS))expect(CYCLE_PAIR_IDS as readonly string[]).toContain(id);
+  for(const id of CYCLE_PAIR_IDS)expect(RECONCILE_PAIR_IDS as readonly string[]).toContain(id);
+  for(const id of RECONCILE_PAIR_IDS)expect(DQ_DATASET_INVENTORY.map(e=>e.dataset)).toContain(DATASETS.reconcile(id));
+ });
+});
diff --git a/src/lib/dq/reconcile/pair-lineage.ts b/src/lib/dq/reconcile/pair-lineage.ts
new file mode 100644
index 0000000..8046c45
--- /dev/null
+++ b/src/lib/dq/reconcile/pair-lineage.ts
@@ -0,0 +1,84 @@
+// src/lib/dq/reconcile/pair-lineage.ts
+// facts.lineage_same_day (spec §4.4, §5.1). Members: every target T that has referrers
+// (issuers.status='merged' rows' merged_into, deduplicated) × each market where readFactsLineage over
+// lineageOf(T) reports conflicts; expected keys = those conflicts at cycle creation, keyed
+// <T>:<K>:<available_date> (K = facts/keys factKey). opts.targets restricts the enumeration (tests and
+// targeted script runs); the registry instance has none. Evaluation re-reads the lineage: a conflict
+// still present → compared, passed=false, action lineage_item (one lineage_conflict item per key, payload
+// {fact_ids, values, key, available_date, target}; never auto-chosen); a conflict that is gone → the
+// frozen fact_ids still ok are compared (equal values → passed, reason conflict_cleared), none ok →
+// left_missing. A truncated lineage read is an execution failure (member retried), never a result.
+import {selectAll} from '../../db/table-client';
+import {CONCEPT_IDS} from '../../facts/concepts';
+import {factKey} from '../../facts/keys';
+import type {FactRow,LineageConflict,Market} from '../../facts/types';
+import {compareDecimal} from './decimal';
+import {ReconcileConfigError,comparedNumeric,notCompared,todayOf} from './pair-support';
+import type {RegisteredPair} from './pair-support';
+import type {ExpectedKey,MemberPlan,PairContext,ReconcileResultInput} from './types';
+
+const MARKETS:readonly Market[]=['US','CN'];
+const s=(v:unknown)=>v===null||v===undefined?null:String(v);
+export const lineageNaturalKey=(target:string,c:Pick<LineageConflict,'key'|'available_date'>):string=>
+ `${target}:${factKey({concept:String(c.key.concept),period_start:s(c.key.period_start),period_end:String(c.key.period_end),consolidation:String(c.key.consolidation),unit:String(c.key.unit)})}:${c.available_date}`;
+const byIssuerThenId=(a:FactRow,b:FactRow)=>a.issuer_id<b.issuer_id?-1:a.issuer_id>b.issuer_id?1:a.fact_id<b.fact_id?-1:a.fact_id>b.fact_id?1:0;
+
+async function conflictsOf(ctx:PairContext,target:string,market:Market):Promise<LineageConflict[]>{
+ const env=await ctx.db.readFactsLineage(await ctx.db.lineageOf(target),market,{concepts:[...CONCEPT_IDS],asOf:todayOf(ctx)});
+ if(env.truncated)throw new ReconcileConfigError('lineage_read_truncated',`${target}/${market}`);
+ return env.conflicts;
+}
+
+async function planOf(ctx:PairContext,target:string,market:Market):Promise<MemberPlan>{
+ const keys=new Map<string,ExpectedKey>();
+ for(const c of await conflictsOf(ctx,target,market)){const nk=lineageNaturalKey(target,c);if(!keys.has(nk))keys.set(nk,{naturalKey:nk,locator:{key:c.key,available_date:c.available_date,fact_ids:c.fact_ids}});}
+ return {issuerId:target,market,expectedKeys:[...keys.values()]};
+}
+
+export function lineageSameDayPair(opts:{targets?:readonly string[]}={}):RegisteredPair{
+ return {
+  id:'facts.lineage_same_day',kind:'numeric',left:'facts.lineage',right:'facts.lineage',
+  inputs:{repoFile:null,parserVersion:'lineage/1',goldSchema:null},
+  async currentRight(){return null;},   // never produces reconcile_mismatch items (lineage verdicts are lineage_conflict items)
+  async members(ctx){
+   const merged=await selectAll(ctx.tables,'issuers',{status:'merged'},'issuer_id');
+   const targets=[...new Set(merged.map(r=>r.merged_into).filter((x):x is string=>typeof x==='string'))]
+    .filter(t=>opts.targets===undefined||opts.targets.includes(t)).sort();
+   const out:MemberPlan[]=[];
+   for(const target of targets)for(const market of MARKETS){
+    const plan=await planOf(ctx,target,market);
+    if(plan.expectedKeys.length>0)out.push(plan);
+   }
+   return out;
+  },
+  /** one pending target (plan audit Q2): the same keys members() would give it now; zero conflicts → zero keys */
+  async memberFor(ctx,issuerId,market){return planOf(ctx,issuerId,market);},
+  async evaluate(ctx,member){
+   let live:Map<string,LineageConflict>;
+   try{live=new Map((await conflictsOf(ctx,member.issuerId,member.market)).map(c=>[lineageNaturalKey(member.issuerId,c),c]));}
+   catch(e){if(e instanceof ReconcileConfigError)throw new Error(`lineage_read_truncated:${member.issuerId}`);throw e;}
+   const out:ReconcileResultInput[]=[];
+   for(const k of member.expectedKeys){
+    const c=live.get(k.naturalKey);
+    const ids=c?c.fact_ids:(Array.isArray(k.locator.fact_ids)?k.locator.fact_ids.map(String):[]);
+    const rows=(await ctx.db.factsByIds(ids)).sort(byIssuerThenId);
+    const sides=(l:FactRow,r:FactRow)=>({left_source:`facts.lineage:${l.issuer_id}`,right_source:`facts.lineage:${r.issuer_id}`});
+    const values=rows.map(r=>({issuer_id:r.issuer_id,filing:r.filing_id,fact_id:r.fact_id,value:r.value,status:r.status}));
+    if(c){
+     const left=rows[0];const right=left?(rows.find(r=>compareDecimal(r.value,left.value)!==0)??rows[1]):undefined;
+     if(!left||!right){out.push(notCompared(k.naturalKey,'numeric','left_missing',{left_source:'facts.lineage',right_source:'facts.lineage'},{target:member.issuerId,reason:'conflict_rows_missing',fact_ids:ids}));continue;}
+     out.push(comparedNumeric(k.naturalKey,left.value,right.value,{passed:false,tolerance:'0',sides:sides(left,right),action:'lineage_item',
+      detail:{target:member.issuerId,available_date:c.available_date,key:c.key,values,tolerance_rule:'exact/1'},
+      item:{natural_key:k.naturalKey,payload:{fact_ids:c.fact_ids,values:values.map(({issuer_id,filing,fact_id,value})=>({issuer_id,filing,fact_id,value})),key:c.key,available_date:c.available_date,target:member.issuerId},detail:{target:member.issuerId,market:member.market}}}));
+     continue;
+    }
+    const ok=rows.filter(r=>r.status==='ok');
+    if(ok.length===0){out.push(notCompared(k.naturalKey,'numeric','left_missing',{left_source:'facts.lineage',right_source:'facts.lineage'},{target:member.issuerId,reason:'no_ok_value',values}));continue;}
+    const first=ok[0],other=ok.find(r=>compareDecimal(r.value,first.value)!==0);
+    out.push(comparedNumeric(k.naturalKey,first.value,(other??ok[ok.length-1]).value,{passed:other===undefined,tolerance:'0',sides:sides(first,other??ok[ok.length-1]),action:'record',
+     detail:{target:member.issuerId,reason:other===undefined?'conflict_cleared':'conflict_not_reported',values,tolerance_rule:'exact/1'}}));
+   }
+   return out;
+  },
+ };
+}
diff --git a/src/lib/dq/reconcile/pair-support.ts b/src/lib/dq/reconcile/pair-support.ts
new file mode 100644
index 0000000..f087005
--- /dev/null
+++ b/src/lib/dq/reconcile/pair-support.ts
@@ -0,0 +1,102 @@
+// src/lib/dq/reconcile/pair-support.ts
+// Pieces shared by the cycle pairs (spec §5.1–§5.6). RegisteredPair = C3 ReconcilePair plus its input
+// recipe (repo file, parser version, gold schema) used for batch tool_versions and inputs_hash.
+// PairRunContext = PairContext plus the batch id and dry-run flag the runner passes (record.ts side rows
+// need the batch; dry runs must not write). ReconcileConfigError refuses a run (invalid gold/sample file,
+// unresolvable issuer) — the runner finishes the batch failed with the code. activeRows is the T1/S2
+// binding filter over read_filing_facts rows. openMismatches is the explicit re-check binding: an OPEN
+// reconcile_mismatch item of this pair (natural_key '<pair>:<result natural_key>:<fact_id>') pins its key
+// to payload.fact_ids[0] whatever the generation or status. Result builders keep the dq_reconciliations
+// kind/side rules; actionFor is the one action rule every fact-backed pair uses (contract note 2).
+import {createHash} from 'node:crypto';
+import {selectAll} from '../../db/table-client';
+import type {Row,TableClient} from '../../db/table-client';
+import {keyComponents} from '../../facts/keys';
+import type {FactRow,FactStatus,FilingFactRow,FilingRow,Market} from '../../facts/types';
+import {DATASETS} from '../datasets';
+import {absDecimal,relDiff,subDecimal} from './decimal';
+import type {CyclePairId,MemberPlan,PairContext,ReconcileAction,ReconcileKind,ReconcileOutcome,ReconcilePair,ReconcileResultInput} from './types';
+
+export interface PairInputs{repoFile:string|null;parserVersion:string;goldSchema:string|null}
+/**
+ * The CURRENT right-side evidence of one stored result (restore, spec §3.2 / §5.6; plan audit P2): the
+ * sha256 the pair would read NOW for `rec` (its dq_reconciliations row, keyed by rec.natural_key) — iXBRL:
+ * the current primary document fetched and hashed now; gold pairs: the current manifest's evidence for the
+ * key — or null when it cannot be obtained now (fetch failed, entry gone or pending). Never the sha256 the
+ * last run recorded (rec.detail.right.sha256).
+ */
+export type CurrentRight=(ctx:PairContext,rec:Row)=>Promise<string|null>;
+export interface RegisteredPair extends ReconcilePair{
+ inputs:PairInputs;currentRight:CurrentRight;
+ /**
+  * Expected keys of ONE target (plan audit Q2): the runner calls it for every pending_members target that
+  * members(ctx) did not list, after its pending snapshot, so the merge is already visible. Its answer is
+  * final for the cycle (a zero-key plan is a resolved answer). Only pairs that receive pending members
+  * (facts.lineage_same_day) implement it; a pending entry for a pair without it fails the run.
+  */
+ memberFor?(ctx:PairContext,issuerId:string,market:Market):Promise<MemberPlan>;
+}
+export interface PairRunContext extends PairContext{batchId:string|null;dryRun:boolean}
+/** The run context behind a PairContext; a context without the flags counts as a dry run (no side writes). */
+export const runContextOf=(ctx:PairContext):PairRunContext=>{const c=ctx as Partial<PairRunContext>;return {...ctx,batchId:c.batchId??null,dryRun:c.dryRun??true};};
+
+export type ReconcileConfigCode='invalid_gold_file'|'invalid_sample_file'|'issuer_unresolved'|'lineage_read_truncated';
+export class ReconcileConfigError extends Error{constructor(public readonly code:ReconcileConfigCode,message?:string){super(message??code);this.name='ReconcileConfigError';}}
+
+export const sha256Hex=(b:Uint8Array|string):string=>createHash('sha256').update(b).digest('hex');
+export const todayOf=(ctx:PairContext):string=>ctx.now().toISOString().slice(0,10);
+/** Repo JSON with the sha256 of its exact bytes; unreadable or malformed → ReconcileConfigError(code). */
+export async function readRepoJson(ctx:PairContext,path:string,code:'invalid_gold_file'|'invalid_sample_file'):Promise<{json:unknown;sha256:string}>{
+ let bytes:Uint8Array;
+ try{bytes=await ctx.readRepoFile(path);}catch(e){throw new ReconcileConfigError(code,`read ${path}: ${e instanceof Error?e.message:String(e)}`);}
+ try{return {json:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),sha256:sha256Hex(bytes)};}
+ catch{throw new ReconcileConfigError(code,`json ${path}`);}
+}
+
+/** T1 binding filter: rows of the filing's ACTIVE generation (> 0) from published runs, ok or quarantined. */
+export function activeRows(rows:readonly FilingFactRow[],filing:FilingRow):FilingFactRow[]{
+ if(!(filing.mapping_gen>0))return [];
+ return rows.filter(r=>r.mapping_gen===filing.mapping_gen&&r.run_status==='published'&&(r.status==='ok'||r.status==='quarantined'));
+}
+export const factKeyOf=(r:{concept:string;period_start:string|null;period_end:string;unit:string})=>`${r.concept}|${r.period_start??''}|${r.period_end}|${r.unit}`;
+export const fractionDigits=(v:string):number=>{const i=v.indexOf('.');return i<0?0:v.length-i-1;};
+export const mismatchItemKey=(pair:CyclePairId,naturalKey:string,factId:string)=>`${pair}:${naturalKey}:${factId}`;
+
+export interface OpenMismatch{itemId:string;factIds:string[]}
+export async function openMismatches(tables:TableClient,pair:CyclePairId,market:Market):Promise<Map<string,OpenMismatch>>{
+ const rows=await selectAll(tables,'dq_quarantine',{dataset:DATASETS.facts(market),reason_code:'reconcile_mismatch',status:'open'},'id');
+ const out=new Map<string,OpenMismatch>();const prefix=`${pair}:`;
+ for(const r of rows){
+  if(((r.detail??{}) as {pair?:unknown}).pair!==pair)continue;
+  const raw=((r.payload??{}) as {fact_ids?:unknown}).fact_ids;
+  const factIds=Array.isArray(raw)?raw.filter((x):x is string=>typeof x==='string'):[];
+  const nk=String(r.natural_key);
+  if(factIds.length===0||!nk.startsWith(prefix)||!nk.endsWith(`:${factIds[0]}`))continue;
+  out.set(nk.slice(prefix.length,nk.length-factIds[0].length-1),{itemId:String(r.id),factIds});
+ }
+ return out;
+}
+
+export interface Sides{left_source:string;right_source:string}
+export interface ResultExtras{left_fact_id?:string;inputs_hash?:string;action?:ReconcileAction;item?:ReconcileResultInput['item']}
+const extras=(x:ResultExtras)=>({...(x.left_fact_id!==undefined?{left_fact_id:x.left_fact_id}:{}),...(x.inputs_hash!==undefined?{inputs_hash:x.inputs_hash}:{}),...(x.item!==undefined?{item:x.item}:{})});
+/** A non-compared result: every value column null, passed false, detail.reason defaults to the outcome. */
+export function notCompared(natural_key:string,kind:ReconcileKind,outcome:Exclude<ReconcileOutcome,'compared'>,sides:Sides,detail:Record<string,unknown>,x:ResultExtras={}):ReconcileResultInput{
+ return {natural_key,kind,outcome,passed:false,left_value:null,right_value:null,abs_diff:null,rel_diff:null,tolerance:'0',...sides,detail:{reason:outcome,...detail},action:x.action??'record',...extras(x)};
+}
+/** A compared numeric result with exact abs_diff and rel_diff. */
+export function comparedNumeric(natural_key:string,left:string,right:string,o:{passed:boolean;tolerance:string;sides:Sides;detail:Record<string,unknown>}&ResultExtras):ReconcileResultInput{
+ return {natural_key,kind:'numeric',outcome:'compared',passed:o.passed,left_value:left,right_value:right,abs_diff:absDecimal(subDecimal(left,right)),rel_diff:relDiff(left,right),tolerance:o.tolerance,...o.sides,detail:o.detail,action:o.action??'record',...extras(o)};
+}
+/** Contract note 2: bound through an open item → back to it; failed compare of an ok row → onFail; else record. */
+export function actionFor(o:{bound:boolean;leftStatus:FactStatus|null;compared:boolean;passed:boolean;onFail:'quarantine_left'|'review_item'}):ReconcileAction{
+ if(o.bound)return 'quarantine_left';
+ if(o.compared&&!o.passed&&o.leftStatus==='ok')return o.onFail;
+ return 'record';
+}
+/** The work item of a fact-backed mismatch (spec §5.6 payload); apply_reconcile_result adds reconciliation_id, latest_result and hook. */
+export function mismatchItem(pair:CyclePairId,naturalKey:string,left:FactRow,rightValue:string|null,rightLocator:Record<string,unknown>,inputsHash:string):NonNullable<ReconcileResultInput['item']>{
+ return {natural_key:mismatchItemKey(pair,naturalKey,left.fact_id),
+  payload:{key:keyComponents(left.issuer_id,left.market,left),fact_ids:[left.fact_id],left_value:left.value,right_value:rightValue,right_locator:rightLocator},
+  detail:{pair,inputs_hash:inputsHash,issuer_id:left.issuer_id,market:left.market}};
+}
diff --git a/src/lib/dq/reconcile/pair-us-gold.ts b/src/lib/dq/reconcile/pair-us-gold.ts
new file mode 100644
index 0000000..e8fcdf7
--- /dev/null
+++ b/src/lib/dq/reconcile/pair-us-gold.ts
@@ -0,0 +1,109 @@
+// src/lib/dq/reconcile/pair-us-gold.ts
+// us.companyfacts_vs_gold (spec §5.1, T15). Left = the published US facts, right = the US entries of plan
+// 2's gold file src/lib/facts/fixtures/gold/plan2.json. An entry whose recorded_by or value is '<pending>'
+// (the landed gate's isPending rule) is NEVER compared: each gets exactly one incomplete_gold result, so
+// the cycle shows gaps and the gold is never reported complete while ready:false. natural_key =
+// <ticker>:<concept>:<period_end>:<duration>:<unit>; duration defaults like the plan-2 gate (instant
+// concept → INSTANT, else 12M). Binding: an open reconcile_mismatch item of the key pins its fact;
+// otherwise the CURRENT ok row as of the entry's as_of (the row the gold asserts). Tolerance 0 (exact
+// decimal). inputs_hash: left raw_hash, right = gold file sha256 (also the gold_or_sample part), parser
+// 'gold-us/1'. The member issuer is the ticker's resolved issuer (resolveIssuer follows a merge).
+import {resolveIssuer} from '../../entities/resolve';
+import {conceptById} from '../../facts/concepts';
+import {canonicalDecimal} from '../../facts/json-numbers';
+import type {FactRow} from '../../facts/types';
+import {DATASETS} from '../datasets';
+import {compareDecimal} from './decimal';
+import {computeInputsHash} from './inputs-hash';
+import {ReconcileConfigError,actionFor,comparedNumeric,fractionDigits,mismatchItem,notCompared,openMismatches,readRepoJson,todayOf} from './pair-support';
+import type {RegisteredPair} from './pair-support';
+import type {MemberPlan,ReconcileResultInput} from './types';
+
+export const US_GOLD_PATH='src/lib/facts/fixtures/gold/plan2.json';
+export const US_GOLD_PARSER='gold-us/1';
+const PAIR='us.companyfacts_vs_gold' as const;
+const SIDES={left_source:DATASETS.facts('US'),right_source:'gold.plan2'};
+const DATE=/^\d{4}-\d{2}-\d{2}$/;
+const str=(v:unknown)=>typeof v==='string'?v:null;
+
+export interface UsGoldEntry{index:number;ticker:string;concept:string;period_end:string;unit:string;duration:string;value:string|null;as_of:string|null;pending:boolean;source:Record<string,unknown>}
+export const usGoldKey=(e:Pick<UsGoldEntry,'ticker'|'concept'|'period_end'|'duration'|'unit'>)=>`${e.ticker}:${e.concept}:${e.period_end}:${e.duration}:${e.unit}`;
+
+/** The US entries of the gold file in file order; throws invalid_gold_file on shape errors or duplicate keys. */
+export function usGoldEntries(json:unknown):{ready:boolean;entries:UsGoldEntry[]}{
+ const bad=(m:string):never=>{throw new ReconcileConfigError('invalid_gold_file',m);};
+ if(!json||typeof json!=='object'||!Array.isArray((json as {entries?:unknown}).entries))bad('entries');
+ const j=json as {ready?:unknown;entries:unknown[]};
+ const out:UsGoldEntry[]=[];const seen=new Set<string>();
+ j.entries.forEach((raw,index)=>{
+  const e=(raw??{}) as Record<string,unknown>;const iss=(e.issuer??{}) as Record<string,unknown>;
+  if(iss.market!=='US')return;
+  const ticker=str(iss.ticker),concept=str(e.concept),periodEnd=str(e.period_end),unit=str(e.unit),value=str(e.value),recordedBy=str(e.recorded_by);
+  if(ticker===null||concept===null||periodEnd===null||!DATE.test(periodEnd)||unit===null||value===null||recordedBy===null)return bad(`entry ${index}: shape`);
+  const def=conceptById(concept);if(!def)return bad(`entry ${index}: unknown concept ${concept}`);
+  const pending=recordedBy==='<pending>'||value==='<pending>';
+  let canonical:string|null=null;
+  if(!pending){try{canonical=canonicalDecimal(value);}catch{return bad(`entry ${index}: value`);}}
+  const asOf=e.as_of===null||e.as_of===undefined?null:str(e.as_of);
+  if(asOf!==null&&!DATE.test(asOf))return bad(`entry ${index}: as_of`);
+  if(e.as_of!==null&&e.as_of!==undefined&&asOf===null)return bad(`entry ${index}: as_of`);
+  const entry:UsGoldEntry={index,ticker,concept,period_end:periodEnd,unit,duration:str(e.duration)??(def.nature==='instant'?'INSTANT':'12M'),value:canonical,as_of:asOf,pending,source:(e.source??{}) as Record<string,unknown>};
+  const k=usGoldKey(entry);if(seen.has(k))return bad(`duplicate ${k}`);
+  seen.add(k);out.push(entry);
+ });
+ return {ready:j.ready===true,entries:out};
+}
+
+export function usCompanyfactsVsGoldPair():RegisteredPair{
+ return {
+  id:PAIR,kind:'numeric',left:DATASETS.facts('US'),right:'gold.plan2',
+  inputs:{repoFile:US_GOLD_PATH,parserVersion:US_GOLD_PARSER,goldSchema:'plan2-gold/1'},
+  // the current gold file is this pair's right evidence; its entry for the key must still exist and be recorded (plan audit P2)
+  async currentRight(ctx,rec){
+   try{
+    const {json,sha256}=await readRepoJson(ctx,US_GOLD_PATH,'invalid_gold_file');
+    const e=usGoldEntries(json).entries.find(x=>usGoldKey(x)===String(rec.natural_key));
+    return e&&!e.pending&&e.value!==null?sha256:null;
+   }catch(err){if(err instanceof ReconcileConfigError)return null;throw err;}
+  },
+  async members(ctx){
+   const {json}=await readRepoJson(ctx,US_GOLD_PATH,'invalid_gold_file');
+   const byTicker=new Map<string,UsGoldEntry[]>();
+   for(const e of usGoldEntries(json).entries)byTicker.set(e.ticker,[...(byTicker.get(e.ticker)??[]),e]);
+   const out:MemberPlan[]=[];
+   for(const [ticker,list] of [...byTicker.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0)){
+    const r=await resolveIssuer(ctx.tables,{ticker},{today:todayOf(ctx)});
+    if(!r)throw new ReconcileConfigError('issuer_unresolved',ticker);
+    out.push({issuerId:r.issuer_id,market:'US',expectedKeys:list.map(e=>({naturalKey:usGoldKey(e),locator:{index:e.index,ticker:e.ticker,concept:e.concept,period_end:e.period_end,unit:e.unit,duration:e.duration,as_of:e.as_of,pending:e.pending}}))});
+   }
+   return out;
+  },
+  async evaluate(ctx,member){
+   const {json,sha256:goldSha}=await readRepoJson(ctx,US_GOLD_PATH,'invalid_gold_file');
+   const current=new Map(usGoldEntries(json).entries.map(e=>[usGoldKey(e),e]));
+   const open=await openMismatches(ctx.tables,PAIR,'US');
+   const out:ReconcileResultInput[]=[];
+   for(const k of member.expectedKeys){
+    const e=current.get(k.naturalKey);
+    if(!e){out.push(notCompared(k.naturalKey,'numeric','incomplete_gold',SIDES,{reason:'entry_removed'}));continue;}
+    if(e.pending||e.value===null){out.push(notCompared(k.naturalKey,'numeric','incomplete_gold',SIDES,{reason:'pending',gold_index:e.index}));continue;}
+    const bound=open.get(k.naturalKey);
+    let rows:FactRow[];
+    if(bound)rows=(await ctx.db.factsByIds([bound.factIds[0]])).slice(0,1);
+    else rows=(await ctx.db.readFacts(member.issuerId,'US',{concepts:[e.concept],asOf:e.as_of??todayOf(ctx),from:e.period_end,to:e.period_end})).rows
+     .filter(r=>r.period_end===e.period_end&&r.unit===e.unit&&r.duration===e.duration&&r.is_current===true);
+    if(rows.length>1){out.push(notCompared(k.naturalKey,'numeric','left_ambiguous',SIDES,{gold_index:e.index,fact_ids:rows.map(r=>r.fact_id)}));continue;}
+    const left=rows[0];
+    if(!left){out.push(notCompared(k.naturalKey,'numeric','left_missing',SIDES,{gold_index:e.index,as_of:e.as_of}));continue;}
+    const passed=compareDecimal(left.value,e.value)===0;
+    const inputs_hash=computeInputsHash({left_raw_hash:left.raw_hash,right_sha256:goldSha,gold_or_sample_sha256:goldSha,parser_version:US_GOLD_PARSER});
+    const action=actionFor({bound:bound!==undefined,leftStatus:left.status,compared:true,passed,onFail:'quarantine_left'});
+    const locator={document:US_GOLD_PATH,index:e.index,source:e.source};
+    out.push(comparedNumeric(k.naturalKey,left.value,e.value,{passed,tolerance:'0',sides:SIDES,inputs_hash,left_fact_id:left.fact_id,action,
+     detail:{left:{fact_id:left.fact_id,raw_hash:left.raw_hash,precision:{decimals:fractionDigits(left.value_text)}},right:{document:US_GOLD_PATH,sha256:goldSha,locator,precision:{exact:true}},unit:e.unit,tolerance_rule:'exact/1',inputs_hash,as_of:e.as_of},
+     ...(action==='record'?{}:{item:mismatchItem(PAIR,k.naturalKey,left,e.value,locator,inputs_hash)})}));
+   }
+   return out;
+  },
+ };
+}
diff --git a/src/lib/dq/reconcile/pairs.test.ts b/src/lib/dq/reconcile/pairs.test.ts
new file mode 100644
index 0000000..66bd9cc
--- /dev/null
+++ b/src/lib/dq/reconcile/pairs.test.ts
@@ -0,0 +1,185 @@
+// src/lib/dq/reconcile/pairs.test.ts
+import {randomUUID} from 'node:crypto';
+import {readFileSync} from 'node:fs';
+import {describe,expect,it} from 'vitest';
+import type {TableClient} from '../../db/table-client';
+import {memoryFactsDb} from '../../facts/memory-facts-db';
+import {makeBudget} from '../../facts/sync';
+import type {FilingFactRow,FilingRow} from '../../facts/types';
+import {memoryRawStore} from '../raw-store';
+import {computeInputsHash} from './inputs-hash';
+import {ReconcileConfigError,actionFor,activeRows,openMismatches,sha256Hex} from './pair-support';
+import {lineageSameDayPair} from './pair-lineage';
+import {US_GOLD_PARSER,US_GOLD_PATH,usCompanyfactsVsGoldPair,usGoldEntries,usGoldKey} from './pair-us-gold';
+import {RECONCILE_PAIRS,inputsHashNow} from './pairs';
+import {reconcileTables,seedPublished} from './testing';
+import {CYCLE_PAIR_IDS} from './types';
+import type {MemberPlan,PairContext} from './types';
+
+const enc=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v));
+function setup(){
+ const tables=reconcileTables();const db=memoryFactsDb(tables);
+ const files=new Map<string,Uint8Array>();
+ const ctx:PairContext={db,tables,raw:memoryRawStore(),now:()=>new Date('2026-11-05T00:00:00Z'),budget:makeBudget(null),
+  fetch:(async()=>{throw new Error('no network in unit tests');}) as unknown as typeof fetch,
+  readRepoFile:async p=>{const b=files.get(p);if(!b)throw new Error(`missing ${p}`);return b;}};
+ return {tables,db,ctx,files};
+}
+async function issuer(tables:TableClient,ticker:string,o:{status?:string;merged_into?:string|null}={}){
+ const id=randomUUID();
+ await tables.insert('issuers',{issuer_id:id,status:o.status??'active',merged_into:o.merged_into??null,cik:null,lei:null,usci:null,canonical_name_en:ticker,canonical_name_zh:null});
+ await tables.insert('issuer_securities',{issuer_id:id,ticker,valid_from:'2000-01-01',valid_to:null,is_primary:true,share_class:'common',isin:null,figi:null});
+ return id;
+}
+const goldFile=(entries:object[])=>({version:1,ready:false,required:{US:true,CN:false},entries});
+const entry=(o:{ticker?:string;concept?:string;period_end?:string;value?:string;recorded_by?:string;as_of?:string}={})=>({issuer:{ticker:o.ticker??'ZGOLD',market:'US'},concept:o.concept??'revenue',period_end:o.period_end??'2023-12-31',unit:'USD',value:o.value??'1000',as_of:o.as_of??'2024-03-01',source:{document:'ZGOLD 10-K FY2023',page_or_row:'p. 40',url:'https://example.invalid/zgold'},recorded_by:o.recorded_by??'R1',recorded_at:'2026-11-01T00:00:00Z'});
+const FY23={period_start:'2023-01-01',period_end:'2023-12-31'};
+
+describe('registry',()=>{
+ it('holds only cycle pairs, keyed by their own id, with lineage and US gold registered by Task 14',()=>{
+  for(const [id,p] of Object.entries(RECONCILE_PAIRS)){expect(CYCLE_PAIR_IDS as readonly string[]).toContain(id);expect(p!.id).toBe(id);expect(typeof p!.currentRight).toBe('function');}
+  expect(RECONCILE_PAIRS['facts.lineage_same_day']).toBeDefined();
+  expect(RECONCILE_PAIRS['us.companyfacts_vs_gold']?.inputs).toEqual({repoFile:US_GOLD_PATH,parserVersion:US_GOLD_PARSER,goldSchema:'plan2-gold/1'});
+ });
+ it('actionFor: bound → quarantine_left; failed ok row → onFail; everything else record',()=>{
+  expect(actionFor({bound:true,leftStatus:'quarantined',compared:true,passed:true,onFail:'quarantine_left'})).toBe('quarantine_left');
+  expect(actionFor({bound:true,leftStatus:'quarantined',compared:false,passed:false,onFail:'quarantine_left'})).toBe('quarantine_left');
+  expect(actionFor({bound:false,leftStatus:'ok',compared:true,passed:false,onFail:'quarantine_left'})).toBe('quarantine_left');
+  expect(actionFor({bound:false,leftStatus:'ok',compared:true,passed:false,onFail:'review_item'})).toBe('review_item');
+  expect(actionFor({bound:false,leftStatus:'quarantined',compared:true,passed:false,onFail:'quarantine_left'})).toBe('record');
+  expect(actionFor({bound:false,leftStatus:'ok',compared:true,passed:true,onFail:'quarantine_left'})).toBe('record');
+  expect(actionFor({bound:false,leftStatus:null,compared:false,passed:false,onFail:'quarantine_left'})).toBe('record');
+ });
+ it('activeRows keeps the active generation of published runs, ok or quarantined (T1)',()=>{
+  const filing={mapping_gen:2} as FilingRow;
+  const r=(o:Partial<FilingFactRow>)=>({fact_id:randomUUID(),mapping_gen:2,run_status:'published',status:'ok',...o}) as FilingFactRow;
+  const rows=[r({}),r({status:'quarantined'}),r({mapping_gen:1}),r({run_status:'staged'}),r({status:'staged'})];
+  expect(activeRows(rows,filing)).toEqual(rows.slice(0,2));
+  expect(activeRows(rows,{mapping_gen:0} as FilingRow)).toEqual([]);
+ });
+});
+
+describe('us.companyfacts_vs_gold (T15)',()=>{
+ it('the landed plan2.json has two US entries, both <pending> (ready:false)',()=>{
+  const json=JSON.parse(readFileSync(US_GOLD_PATH,'utf8'));
+  const g=usGoldEntries(json);
+  expect(g.ready).toBe(false);
+  expect(g.entries.map(e=>[e.ticker,e.pending])).toEqual([['AAPL',true],['MSFT',true]]);
+ });
+ it('every <pending> entry yields exactly one incomplete_gold result and is never compared',async()=>{
+  const {tables,ctx,files}=setup();await issuer(tables,'ZGOLD');
+  files.set(US_GOLD_PATH,enc(goldFile([entry({recorded_by:'<pending>'}),entry({concept:'net_income_parent',value:'<pending>'})])));
+  const pair=usCompanyfactsVsGoldPair();
+  const [m]=await pair.members(ctx);
+  const res=await pair.evaluate(ctx,m);
+  expect(res.map(r=>[r.outcome,r.passed,r.left_value,r.right_value,r.action])).toEqual([['incomplete_gold',false,null,null,'record'],['incomplete_gold',false,null,null,'record']]);
+ });
+ it('compares recorded entries exactly against the current ok row; a mismatch quarantines with a mismatch item; a missing fact is left_missing',async()=>{
+  const {tables,db,ctx,files}=setup();const id=await issuer(tables,'ZGOLD');
+  const seeded=await seedPublished(db,{issuer:id,market:'US',sourceRef:'0009990100-24-000001',availableDate:'2024-02-01',facts:[{concept:'revenue',value:'1000',...FY23},{concept:'net_income_parent',value:'100',...FY23}]});
+  const bytes=enc(goldFile([entry(),entry({concept:'net_income_parent',value:'101'}),entry({concept:'total_assets',value:'5'})]));files.set(US_GOLD_PATH,bytes);
+  const pair=usCompanyfactsVsGoldPair();
+  const [m]=await pair.members(ctx);
+  expect(m.expectedKeys.map(k=>k.naturalKey)).toEqual(['ZGOLD:revenue:2023-12-31:12M:USD','ZGOLD:net_income_parent:2023-12-31:12M:USD','ZGOLD:total_assets:2023-12-31:INSTANT:USD']);
+  const [ok,bad,missing]=await pair.evaluate(ctx,m);
+  const [revRow,niRow]=await db.factsByIds(seeded.factIds).then(rs=>[rs.find(r=>r.concept==='revenue')!,rs.find(r=>r.concept==='net_income_parent')!]);
+  expect(ok).toMatchObject({outcome:'compared',passed:true,left_value:'1000',right_value:'1000',abs_diff:'0',rel_diff:'0',tolerance:'0',action:'record',left_fact_id:revRow.fact_id});
+  expect(ok.inputs_hash).toBe(computeInputsHash({left_raw_hash:revRow.raw_hash,right_sha256:sha256Hex(bytes),gold_or_sample_sha256:sha256Hex(bytes),parser_version:US_GOLD_PARSER}));
+  expect(bad).toMatchObject({outcome:'compared',passed:false,left_value:'100',right_value:'101',abs_diff:'1',action:'quarantine_left',left_fact_id:niRow.fact_id});
+  expect(bad.item?.natural_key).toBe(`us.companyfacts_vs_gold:ZGOLD:net_income_parent:2023-12-31:12M:USD:${niRow.fact_id}`);
+  expect(bad.item?.payload).toMatchObject({fact_ids:[niRow.fact_id],left_value:'100',right_value:'101',key:{issuer_id:id,market:'US',concept:'net_income_parent'}});
+  expect(bad.item?.detail).toMatchObject({pair:'us.companyfacts_vs_gold',issuer_id:id,market:'US'});
+  expect(missing).toMatchObject({outcome:'left_missing',passed:false,action:'record'});
+ });
+ it('an open reconcile_mismatch item binds the key to its fact and a now-passing result goes back to the item (quarantine_left, passed)',async()=>{
+  const {tables,db,ctx,files}=setup();const id=await issuer(tables,'ZGOLD');
+  const seeded=await seedPublished(db,{issuer:id,market:'US',sourceRef:'0009990100-24-000002',availableDate:'2024-02-01',facts:[{concept:'net_income_parent',value:'100',...FY23}]});
+  const nk='ZGOLD:net_income_parent:2023-12-31:12M:USD';
+  await tables.insert('dq_quarantine',{id:randomUUID(),dataset:'facts.us',table_name:'financial_facts',natural_key:`us.companyfacts_vs_gold:${nk}:${seeded.factIds[0]}`,reason_code:'reconcile_mismatch',detail:{pair:'us.companyfacts_vs_gold'},payload:{fact_ids:[seeded.factIds[0]]},batch_id:randomUUID(),status:'open',resolved_by:null,resolved_at:null,created_at:'2026-11-05T00:00:00Z'});
+  expect([...(await openMismatches(tables,'us.companyfacts_vs_gold','US')).keys()]).toEqual([nk]);
+  files.set(US_GOLD_PATH,enc(goldFile([entry({concept:'net_income_parent',value:'100'})])));
+  const pair=usCompanyfactsVsGoldPair();const [m]=await pair.members(ctx);
+  const [r]=await pair.evaluate(ctx,m);
+  expect(r).toMatchObject({outcome:'compared',passed:true,action:'quarantine_left',left_fact_id:seeded.factIds[0]});
+  expect(r.item?.natural_key).toBe(`us.companyfacts_vs_gold:${nk}:${seeded.factIds[0]}`);
+ });
+ it('refuses a gold file with duplicate keys or an unresolvable ticker',async()=>{
+  const {tables,ctx,files}=setup();await issuer(tables,'ZGOLD');
+  const pair=usCompanyfactsVsGoldPair();
+  files.set(US_GOLD_PATH,enc(goldFile([entry(),entry()])));
+  await expect(pair.members(ctx)).rejects.toMatchObject({code:'invalid_gold_file'});
+  files.set(US_GOLD_PATH,enc(goldFile([entry({ticker:'NOPE'})])));
+  await expect(pair.members(ctx)).rejects.toBeInstanceOf(ReconcileConfigError);
+  await expect(pair.members(ctx)).rejects.toMatchObject({code:'issuer_unresolved'});
+  files.delete(US_GOLD_PATH);
+  await expect(pair.members(ctx)).rejects.toMatchObject({code:'invalid_gold_file'});
+ });
+});
+
+describe('facts.lineage_same_day (§4.4)',()=>{
+ async function merged(){
+  const s=setup();
+  const target=await issuer(s.tables,'ZTGT');const source=await issuer(s.tables,'ZSRC',{status:'merged'});
+  await s.tables.update('issuers',{issuer_id:source},{merged_into:target});
+  s.db.setTopology({[source]:{status:'merged',merged_into:target}});
+  const t=await seedPublished(s.db,{issuer:target,market:'US',sourceRef:'0009990200-24-000001',availableDate:'2024-02-15',facts:[{concept:'revenue',value:'1200',...FY23},{concept:'net_income_parent',value:'50',...FY23}]});
+  const src=await seedPublished(s.db,{issuer:source,market:'US',sourceRef:'0009990201-24-000001',availableDate:'2024-02-15',facts:[{concept:'revenue',value:'1000',...FY23},{concept:'net_income_parent',value:'50',...FY23}]});
+  return {...s,target,source,t,src};
+ }
+ it('freezes one member per target and market with a conflict, keyed <T>:<K>:<available_date>',async()=>{
+  const {ctx,target}=await merged();
+  const members=await lineageSameDayPair().members(ctx);
+  expect(members).toEqual([{issuerId:target,market:'US',expectedKeys:[{naturalKey:`${target}:revenue:2023-01-01:2023-12-31:consolidated:USD:2024-02-15`,locator:expect.objectContaining({available_date:'2024-02-15'})}]}]);
+  expect(await lineageSameDayPair({targets:[]}).members(ctx)).toEqual([]);
+  // plan audit Q2: the per-target resolver gives a pending target the same keys, and zero keys when it has no conflict
+  expect(await lineageSameDayPair({targets:[]}).memberFor!(ctx,target,'US')).toEqual(members[0]);
+  expect(await lineageSameDayPair().memberFor!(ctx,target,'CN')).toEqual({issuerId:target,market:'CN',expectedKeys:[]});
+ });
+ it('a live conflict is compared, failed, and becomes a lineage_item with every value',async()=>{
+  const {ctx,target,source,t,src}=await merged();
+  const pair=lineageSameDayPair();const [m]=await pair.members(ctx);
+  const [r]=await pair.evaluate(ctx,m);
+  expect(r).toMatchObject({kind:'numeric',outcome:'compared',passed:false,tolerance:'0',action:'lineage_item'});
+  expect(new Set([r.left_value,r.right_value])).toEqual(new Set(['1000','1200']));
+  expect(r.item?.natural_key).toBe(m.expectedKeys[0].naturalKey);
+  expect(new Set(r.item?.payload.fact_ids as string[])).toEqual(new Set([t.factIds[0],src.factIds[0]]));
+  expect((r.item?.payload.values as {issuer_id:string}[]).map(v=>v.issuer_id).sort()).toEqual([source,target].sort());
+  expect(r.item?.detail).toEqual({target,market:'US'});
+ });
+ it('a frozen key whose conflict is gone compares the remaining ok values (conflict_cleared) or is left_missing',async()=>{
+  const {ctx,target,t,src}=await merged();
+  const pair=lineageSameDayPair();
+  const plan:MemberPlan={issuerId:target,market:'US',expectedKeys:[
+   {naturalKey:`${target}:net_income_parent:2023-01-01:2023-12-31:consolidated:USD:2024-02-15`,locator:{fact_ids:[t.factIds[1],src.factIds[1]]}},
+   {naturalKey:`${target}:net_income_parent:2022-01-01:2022-12-31:consolidated:USD:2023-02-15`,locator:{fact_ids:[]}},
+  ]};
+  const [cleared,gone]=await pair.evaluate(ctx,plan);
+  expect(cleared).toMatchObject({outcome:'compared',passed:true,left_value:'50',right_value:'50',action:'record',detail:expect.objectContaining({reason:'conflict_cleared'})});
+  expect(gone).toMatchObject({outcome:'left_missing',passed:false,action:'record'});
+ });
+});
+
+describe('inputsHashNow (restore-side recomputation, spec §5.6)',()=>{
+ it('recomputes from the current fact raw_hash, the pair\'s CURRENT right evidence for the key (never the recorded right sha256), the CURRENT gold file and parser version (plan audit P2)',async()=>{
+  const {tables,db,ctx,files}=setup();const id=await issuer(tables,'ZGOLD');
+  const seeded=await seedPublished(db,{issuer:id,market:'US',sourceRef:'0009990100-24-000003',availableDate:'2024-02-01',facts:[{concept:'revenue',value:'1000',...FY23}]});
+  const [fact]=await db.factsByIds(seeded.factIds);
+  const nk=usGoldKey(usGoldEntries(goldFile([entry()])).entries[0]);
+  const rec=randomUUID();
+  await tables.insert('dq_reconciliations',{id:rec,dataset:'reconcile.us.companyfacts_vs_gold',pair:'us.companyfacts_vs_gold',natural_key:nk,detail:{right:{sha256:'recorded-by-the-last-run'}}});
+  const item={id:randomUUID(),reason_code:'reconcile_mismatch',status:'open',payload:{fact_ids:[fact.fact_id]},detail:{pair:'us.companyfacts_vs_gold',latest_result:{passed:true,reconciliation_id:rec}}};
+  const at=(gold:Uint8Array)=>computeInputsHash({left_raw_hash:fact.raw_hash,right_sha256:sha256Hex(gold),gold_or_sample_sha256:sha256Hex(gold),parser_version:US_GOLD_PARSER});
+  const v1=enc(goldFile([entry()]));files.set(US_GOLD_PATH,v1);
+  expect(await inputsHashNow(ctx,item)).toBe(at(v1));
+  const v2=enc(goldFile([entry({value:'1001'})]));files.set(US_GOLD_PATH,v2);
+  expect(await inputsHashNow(ctx,item)).toBe(at(v2));                                     // changed evidence → a different hash
+  files.set(US_GOLD_PATH,enc(goldFile([entry({recorded_by:'<pending>'})])));
+  await expect(inputsHashNow(ctx,item)).rejects.toThrow('current_evidence_unavailable');  // the entry is pending again
+  files.set(US_GOLD_PATH,enc(goldFile([entry({concept:'net_income_parent'})])));
+  await expect(inputsHashNow(ctx,item)).rejects.toThrow('current_evidence_unavailable');  // the key left the manifest
+  files.set(US_GOLD_PATH,v1);
+  await expect(inputsHashNow(ctx,{...item,detail:{pair:'us.companyfacts_vs_gold'}})).rejects.toThrow('no_latest_result');
+  await expect(inputsHashNow(ctx,{...item,detail:{pair:'sec.filer_category',latest_result:{reconciliation_id:rec}}})).rejects.toThrow('pair_not_registered');
+  await expect(inputsHashNow(ctx,{...item,payload:{fact_ids:[randomUUID()]}})).rejects.toThrow('left_fact_missing');
+ });
+});
diff --git a/src/lib/dq/reconcile/pairs.ts b/src/lib/dq/reconcile/pairs.ts
new file mode 100644
index 0000000..f2a8a3f
--- /dev/null
+++ b/src/lib/dq/reconcile/pairs.ts
@@ -0,0 +1,41 @@
+// src/lib/dq/reconcile/pairs.ts
+// Registry of the cycle pairs run by run.ts (spec §5.1; contract C3). Task 14 registers
+// facts.lineage_same_day and us.companyfacts_vs_gold; Task 15 adds us.companyfacts_vs_ixbrl; Task 16 adds
+// cn.tushare_vs_cninfo_pdf_gold. The three non-cycle pairs (sec.filing_date_vs_submissions,
+// sec.filer_category, entities.isin_hkex_vs_gleif) are recorded inline through record.ts and are
+// deliberately absent. inputsHashNow recomputes a reconcile_mismatch item's inputs_hash from CURRENT
+// inputs for restore_reconciled (spec §5.6): left raw_hash from the item's fact, the pair's CURRENT right
+// evidence for the natural key of the result row named by latest_result (RegisteredPair.currentRight —
+// iXBRL fetches and hashes the primary document now, gold pairs resolve the current manifest entry; never
+// the sha256 that run recorded; unobtainable → current_evidence_unavailable, plan audit P2), the CURRENT
+// gold or sample file bytes, the CURRENT parser version. Any change since the last passing run → a different hash.
+import type {Row} from '../../db/table-client';
+import {computeInputsHash} from './inputs-hash';
+import {lineageSameDayPair} from './pair-lineage';
+import {sha256Hex} from './pair-support';
+import type {RegisteredPair} from './pair-support';
+import {usCompanyfactsVsGoldPair} from './pair-us-gold';
+import type {CyclePairId,PairContext} from './types';
+
+export const RECONCILE_PAIRS:Partial<Record<CyclePairId,RegisteredPair>>={
+ 'facts.lineage_same_day':lineageSameDayPair(),
+ 'us.companyfacts_vs_gold':usCompanyfactsVsGoldPair(),
+};
+
+export async function inputsHashNow(ctx:PairContext,item:Row):Promise<string>{
+ const detail=(item.detail??{}) as {pair?:unknown;latest_result?:{reconciliation_id?:unknown}};
+ const pair=typeof detail.pair==='string'?RECONCILE_PAIRS[detail.pair as CyclePairId]:undefined;
+ if(!pair)throw new Error('pair_not_registered');
+ const factIds=((item.payload??{}) as {fact_ids?:unknown}).fact_ids;
+ const factId=Array.isArray(factIds)&&typeof factIds[0]==='string'?factIds[0]:null;
+ const [fact]=factId===null?[]:await ctx.db.factsByIds([factId]);
+ if(!fact)throw new Error('left_fact_missing');
+ const recId=detail.latest_result?.reconciliation_id;
+ if(typeof recId!=='string')throw new Error('no_latest_result');
+ const [rec]=await ctx.tables.select('dq_reconciliations',{id:recId},{limit:1});
+ if(!rec)throw new Error('no_latest_result');
+ const right=await pair.currentRight(ctx,rec);   // what the right side says NOW (plan audit P2)
+ if(right===null)throw new Error('current_evidence_unavailable');
+ const file=pair.inputs.repoFile===null?'':sha256Hex(await ctx.readRepoFile(pair.inputs.repoFile));
+ return computeInputsHash({left_raw_hash:fact.raw_hash,right_sha256:right,gold_or_sample_sha256:file,parser_version:pair.inputs.parserVersion});
+}
diff --git a/src/lib/dq/reconcile/testing.ts b/src/lib/dq/reconcile/testing.ts
new file mode 100644
index 0000000..235b051
--- /dev/null
+++ b/src/lib/dq/reconcile/testing.ts
@@ -0,0 +1,26 @@
+// src/lib/dq/reconcile/testing.ts
+// TEST-ONLY helpers for the reconcile unit tests (nothing in src/app imports this file). reconcileTables
+// declares the primary keys the in-memory TableClient enforces for the tables the runner and memoryFactsDb
+// share; seedPublished drives the real FactsDb API (scope → lease → run → filing → facts → publish →
+// release) so seeded rows are exactly what a sync would have published (generation 1, status ok).
+import {randomUUID} from 'node:crypto';
+import {memoryTableClient} from '../../db/memory-table-client';
+import type {Duration,FactInsert,FormType,Market,Source,Statement} from '../../facts/types';
+import type {MemoryFactsDb} from '../../facts/memory-facts-db';
+
+export const reconcileTables=()=>memoryTableClient({dq_quarantine:['id'],dq_reconciliations:['id'],dq_reconcile_cycles:['pair','cycle_id'],dq_reconcile_cursor:['pair','cycle_id','issuer_id','market'],ingest_batches:['batch_id'],dq_freshness:['dataset'],issuers:['issuer_id']});
+
+export interface SeedFact{concept:string;value:string;period_start:string|null;period_end:string;unit?:string;source_concept?:string;statement?:Statement;duration?:Duration}
+export async function seedPublished(db:MemoryFactsDb,o:{issuer:string;market:Market;sourceRef:string;availableDate:string;facts:SeedFact[];formType?:FormType;source?:Source;mappingGen?:number}):Promise<{filingId:string;runId:string;factIds:string[]}>{
+ const batch=randomUUID();
+ if((await db.scopeRows(o.market,[o.issuer])).length===0)await db.reconcileScope(o.market,[{issuer_id:o.issuer,reasons:['test'],priority:1,fetch_key:o.market==='US'?'0000000001':'600000.SH'}]);
+ if(!(await db.claimLease(o.issuer,o.market,batch,600)))throw new Error('seed_lease_not_acquired');
+ const run=await db.beginRun(o.issuer,o.market,batch,o.mappingGen??1);
+ const map=await db.stageFilings(run,[{filing_id:randomUUID(),issuer_id:o.issuer,sourceRef:o.sourceRef,market:o.market,source:o.source??(o.market==='US'?'edgar':'tushare'),origin:o.market==='US'?'sec':'sse',formType:o.formType??(o.market==='US'?'10-K':'annual'),fiscalYear:null,fiscalPeriod:null,periodEnd:null,availableDate:o.availableDate,url:null}]);
+ const filingId=map.get(o.sourceRef)!;
+ const rows:FactInsert[]=o.facts.map(f=>({fact_id:randomUUID(),issuer_id:o.issuer,market:o.market,filing_id:filingId,concept:f.concept,source_concept:f.source_concept??`us-gaap:${f.concept}`,statement:f.statement??(f.period_start===null?'BS':'IS'),period_start:f.period_start,period_end:f.period_end,duration:f.duration??(f.period_start===null?'INSTANT':'12M'),value:f.value,unit:f.unit??(o.market==='US'?'USD':'CNY'),consolidation:'consolidated',available_date:o.availableDate,mapping_gen:o.mappingGen??1,mapping_version:'facts-map/1',raw_hash:`raw:${o.sourceRef}:${f.concept}:${f.period_end}`}));
+ await db.stageFacts(run,rows);
+ await db.publishRun(run,[filingId]);
+ await db.releaseLease(o.issuer,o.market,batch,'success',new Date(Date.now()+86_400_000).toISOString());
+ return {filingId,runId:run,factIds:rows.map(r=>r.fact_id)};
+}

exec
/bin/zsh -lc 'cat src/lib/dq/reconcile/pair-us-gold.ts; cat src/lib/entities/resolve.ts; cat src/lib/dq/reconcile/types.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 38ms:
// src/lib/dq/reconcile/pair-us-gold.ts
// us.companyfacts_vs_gold (spec §5.1, T15). Left = the published US facts, right = the US entries of plan
// 2's gold file src/lib/facts/fixtures/gold/plan2.json. An entry whose recorded_by or value is '<pending>'
// (the landed gate's isPending rule) is NEVER compared: each gets exactly one incomplete_gold result, so
// the cycle shows gaps and the gold is never reported complete while ready:false. natural_key =
// <ticker>:<concept>:<period_end>:<duration>:<unit>; duration defaults like the plan-2 gate (instant
// concept → INSTANT, else 12M). Binding: an open reconcile_mismatch item of the key pins its fact;
// otherwise the CURRENT ok row as of the entry's as_of (the row the gold asserts). Tolerance 0 (exact
// decimal). inputs_hash: left raw_hash, right = gold file sha256 (also the gold_or_sample part), parser
// 'gold-us/1'. The member issuer is the ticker's resolved issuer (resolveIssuer follows a merge).
import {resolveIssuer} from '../../entities/resolve';
import {conceptById} from '../../facts/concepts';
import {canonicalDecimal} from '../../facts/json-numbers';
import type {FactRow} from '../../facts/types';
import {DATASETS} from '../datasets';
import {compareDecimal} from './decimal';
import {computeInputsHash} from './inputs-hash';
import {ReconcileConfigError,actionFor,comparedNumeric,fractionDigits,mismatchItem,notCompared,openMismatches,readRepoJson,todayOf} from './pair-support';
import type {RegisteredPair} from './pair-support';
import type {MemberPlan,ReconcileResultInput} from './types';

export const US_GOLD_PATH='src/lib/facts/fixtures/gold/plan2.json';
export const US_GOLD_PARSER='gold-us/1';
const PAIR='us.companyfacts_vs_gold' as const;
const SIDES={left_source:DATASETS.facts('US'),right_source:'gold.plan2'};
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const str=(v:unknown)=>typeof v==='string'?v:null;

export interface UsGoldEntry{index:number;ticker:string;concept:string;period_end:string;unit:string;duration:string;value:string|null;as_of:string|null;pending:boolean;source:Record<string,unknown>}
export const usGoldKey=(e:Pick<UsGoldEntry,'ticker'|'concept'|'period_end'|'duration'|'unit'>)=>`${e.ticker}:${e.concept}:${e.period_end}:${e.duration}:${e.unit}`;

/** The US entries of the gold file in file order; throws invalid_gold_file on shape errors or duplicate keys. */
export function usGoldEntries(json:unknown):{ready:boolean;entries:UsGoldEntry[]}{
 const bad=(m:string):never=>{throw new ReconcileConfigError('invalid_gold_file',m);};
 if(!json||typeof json!=='object'||!Array.isArray((json as {entries?:unknown}).entries))bad('entries');
 const j=json as {ready?:unknown;entries:unknown[]};
 const out:UsGoldEntry[]=[];const seen=new Set<string>();
 j.entries.forEach((raw,index)=>{
  const e=(raw??{}) as Record<string,unknown>;const iss=(e.issuer??{}) as Record<string,unknown>;
  if(iss.market!=='US')return;
  const ticker=str(iss.ticker),concept=str(e.concept),periodEnd=str(e.period_end),unit=str(e.unit),value=str(e.value),recordedBy=str(e.recorded_by);
  if(ticker===null||concept===null||periodEnd===null||!DATE.test(periodEnd)||unit===null||value===null||recordedBy===null)return bad(`entry ${index}: shape`);
  const def=conceptById(concept);if(!def)return bad(`entry ${index}: unknown concept ${concept}`);
  const pending=recordedBy==='<pending>'||value==='<pending>';
  let canonical:string|null=null;
  if(!pending){try{canonical=canonicalDecimal(value);}catch{return bad(`entry ${index}: value`);}}
  const asOf=e.as_of===null||e.as_of===undefined?null:str(e.as_of);
  if(asOf!==null&&!DATE.test(asOf))return bad(`entry ${index}: as_of`);
  if(e.as_of!==null&&e.as_of!==undefined&&asOf===null)return bad(`entry ${index}: as_of`);
  const entry:UsGoldEntry={index,ticker,concept,period_end:periodEnd,unit,duration:str(e.duration)??(def.nature==='instant'?'INSTANT':'12M'),value:canonical,as_of:asOf,pending,source:(e.source??{}) as Record<string,unknown>};
  const k=usGoldKey(entry);if(seen.has(k))return bad(`duplicate ${k}`);
  seen.add(k);out.push(entry);
 });
 return {ready:j.ready===true,entries:out};
}

export function usCompanyfactsVsGoldPair():RegisteredPair{
 return {
  id:PAIR,kind:'numeric',left:DATASETS.facts('US'),right:'gold.plan2',
  inputs:{repoFile:US_GOLD_PATH,parserVersion:US_GOLD_PARSER,goldSchema:'plan2-gold/1'},
  // the current gold file is this pair's right evidence; its entry for the key must still exist and be recorded (plan audit P2)
  async currentRight(ctx,rec){
   try{
    const {json,sha256}=await readRepoJson(ctx,US_GOLD_PATH,'invalid_gold_file');
    const e=usGoldEntries(json).entries.find(x=>usGoldKey(x)===String(rec.natural_key));
    return e&&!e.pending&&e.value!==null?sha256:null;
   }catch(err){if(err instanceof ReconcileConfigError)return null;throw err;}
  },
  async members(ctx){
   const {json}=await readRepoJson(ctx,US_GOLD_PATH,'invalid_gold_file');
   const byTicker=new Map<string,UsGoldEntry[]>();
   for(const e of usGoldEntries(json).entries)byTicker.set(e.ticker,[...(byTicker.get(e.ticker)??[]),e]);
   const out:MemberPlan[]=[];
   for(const [ticker,list] of [...byTicker.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0)){
    const r=await resolveIssuer(ctx.tables,{ticker},{today:todayOf(ctx)});
    if(!r)throw new ReconcileConfigError('issuer_unresolved',ticker);
    out.push({issuerId:r.issuer_id,market:'US',expectedKeys:list.map(e=>({naturalKey:usGoldKey(e),locator:{index:e.index,ticker:e.ticker,concept:e.concept,period_end:e.period_end,unit:e.unit,duration:e.duration,as_of:e.as_of,pending:e.pending}}))});
   }
   return out;
  },
  async evaluate(ctx,member){
   const {json,sha256:goldSha}=await readRepoJson(ctx,US_GOLD_PATH,'invalid_gold_file');
   const current=new Map(usGoldEntries(json).entries.map(e=>[usGoldKey(e),e]));
   const open=await openMismatches(ctx.tables,PAIR,'US');
   const out:ReconcileResultInput[]=[];
   for(const k of member.expectedKeys){
    const e=current.get(k.naturalKey);
    if(!e){out.push(notCompared(k.naturalKey,'numeric','incomplete_gold',SIDES,{reason:'entry_removed'}));continue;}
    if(e.pending||e.value===null){out.push(notCompared(k.naturalKey,'numeric','incomplete_gold',SIDES,{reason:'pending',gold_index:e.index}));continue;}
    const bound=open.get(k.naturalKey);
    let rows:FactRow[];
    if(bound)rows=(await ctx.db.factsByIds([bound.factIds[0]])).slice(0,1);
    else rows=(await ctx.db.readFacts(member.issuerId,'US',{concepts:[e.concept],asOf:e.as_of??todayOf(ctx),from:e.period_end,to:e.period_end})).rows
     .filter(r=>r.period_end===e.period_end&&r.unit===e.unit&&r.duration===e.duration&&r.is_current===true);
    if(rows.length>1){out.push(notCompared(k.naturalKey,'numeric','left_ambiguous',SIDES,{gold_index:e.index,fact_ids:rows.map(r=>r.fact_id)}));continue;}
    const left=rows[0];
    if(!left){out.push(notCompared(k.naturalKey,'numeric','left_missing',SIDES,{gold_index:e.index,as_of:e.as_of}));continue;}
    const passed=compareDecimal(left.value,e.value)===0;
    const inputs_hash=computeInputsHash({left_raw_hash:left.raw_hash,right_sha256:goldSha,gold_or_sample_sha256:goldSha,parser_version:US_GOLD_PARSER});
    const action=actionFor({bound:bound!==undefined,leftStatus:left.status,compared:true,passed,onFail:'quarantine_left'});
    const locator={document:US_GOLD_PATH,index:e.index,source:e.source};
    out.push(comparedNumeric(k.naturalKey,left.value,e.value,{passed,tolerance:'0',sides:SIDES,inputs_hash,left_fact_id:left.fact_id,action,
     detail:{left:{fact_id:left.fact_id,raw_hash:left.raw_hash,precision:{decimals:fractionDigits(left.value_text)}},right:{document:US_GOLD_PATH,sha256:goldSha,locator,precision:{exact:true}},unit:e.unit,tolerance_rule:'exact/1',inputs_hash,as_of:e.as_of},
     ...(action==='record'?{}:{item:mismatchItem(PAIR,k.naturalKey,left,e.value,locator,inputs_hash)})}));
   }
   return out;
  },
 };
}
// Read-side issuer resolution: exactly one of ticker / ISIN / CIK / LEI → canonical issuer with
// its securities. Zero identifiers → 'empty_query'; more than one → 'ambiguous_query' (callers
// must not rely on an implicit precedence between conflicting identifiers).
// Effective dates: validity windows are DATE-level and evaluated against a UTC calendar date
// (`asOf`, default = current UTC date; `today` is the deprecated synonym, spec 3 §4.3.5);
// exchange-local trading dates are out of scope. A security row is current at `asOf` iff
// valid_from <= asOf and (valid_to is null or valid_to > asOf). Each security carries its window
// methods (observation bounds vs evidenced dates, spec 3 §4.3.1) so callers can judge the ends.
// `date` columns arrive from PostgREST as 'YYYY-MM-DD' strings, so ISO strings compare
// lexicographically; the in-memory client used in tests must be fed the same string form.
// Merges: one merged_into hop is followed (result carries redirected_from); a merged target
// returns null rather than walking a chain, so cycles and stale chains surface as not-found.
// Provenance (source) and identifier claims are deliberately not part of the response.
import type {Row,TableClient} from '../db/table-client';
import {inferCoreMarket,normalizeSecurityTicker} from '../securities/ticker';
import {isValidIsin,isValidLei,normalizeCik} from '../research/entity-keys/identifiers';
import type {ValidFromMethod,ValidToMethod} from './types';
import {VALID_FROM_METHODS,VALID_TO_METHODS} from './securities';

export interface ResolveQuery{ticker?:string;isin?:string;cik?:string;lei?:string}
export interface ResolvedSecurity{ticker:string;isin:string|null;figi:string|null;share_class:string|null;is_primary:boolean;valid_from:string;valid_to:string|null;valid_from_method:ValidFromMethod|null;valid_to_method:ValidToMethod|null}
export interface ResolvedIssuer{
 issuer_id:string;status:string;redirected_from?:string;
 names:{zh:string|null;en:string|null};
 identifiers:{cik:string|null;lei:string|null;usci:string|null};
 securities:ResolvedSecurity[];
}
export interface ResolveOptions{
 includeExpired?:boolean;
 /** Evaluation date 'YYYY-MM-DD' (UTC calendar date); default = current UTC date. */
 asOf?:string;
 /** @deprecated use asOf (same meaning). Both given and different → invalid_as_of. */
 today?:string;
}
/** Cache-Control for a resolve evaluated at a past date (spec 3 §4.3.5). */
export const HISTORICAL_CACHE_CONTROL='public, max-age=600, s-maxage=3600';

const str=(v:unknown)=>typeof v==='string'?v:null;
const isCurrent=(r:Row,today:string)=>{const from=str(r.valid_from),to=str(r.valid_to);return from!==null&&from<=today&&(to===null||to>today);};
/** The one validity predicate (valid_from <= today && (valid_to is null || valid_to > today)); reused by the facts scope (plan 2 Task 14). */
export const isCurrentSecurity=isCurrent;
const toSecurity=(r:Row):ResolvedSecurity=>({
 ticker:String(r.ticker),isin:str(r.isin),figi:str(r.figi),share_class:str(r.share_class),is_primary:r.is_primary===true,valid_from:String(r.valid_from),valid_to:str(r.valid_to),
 valid_from_method:typeof r.valid_from_method==='string'&&(VALID_FROM_METHODS as readonly string[]).includes(r.valid_from_method)?r.valid_from_method as ValidFromMethod:null,
 valid_to_method:typeof r.valid_to_method==='string'&&(VALID_TO_METHODS as readonly string[]).includes(r.valid_to_method)?r.valid_to_method as ValidToMethod:null,
});

/** A real calendar date in the exact form 'YYYY-MM-DD' (2026-02-30 and ' 2026-11-05' are rejected). */
export function isCalendarDate(s:string):boolean{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
 const ms=Date.parse(`${s}T00:00:00Z`);
 return !Number.isNaN(ms)&&new Date(ms).toISOString().slice(0,10)===s;
}

/** asOf wins; today is its deprecated synonym (invalid_today kept for callers that still pass it). */
function resolveAsOf(opts:ResolveOptions):string{
 if(opts.asOf!==undefined&&opts.today!==undefined&&opts.asOf!==opts.today)throw new Error('invalid_as_of');
 if(opts.asOf!==undefined){if(!isCalendarDate(opts.asOf))throw new Error('invalid_as_of');return opts.asOf;}
 if(opts.today!==undefined){if(!isCalendarDate(opts.today))throw new Error('invalid_today');return opts.today;}
 return new Date().toISOString().slice(0,10);
}

/**
 * Ticker candidates in lookup order. The exact (trimmed, upper-cased, '/'→'.') form comes first:
 * the shared normalizer strips Wind suffixes (.A/.N/.O/...), which would turn BRK.A into BRK.
 * The normalized form is only a fallback when the exact form has NO rows at all: a ticker the
 * schema knows (even if only expired or future rows exist) is authoritative, so XYZ.A with only
 * expired rows resolves to null rather than to whoever holds XYZ today.
 */
function tickerCandidates(raw:string):string[]{
 const exact=raw.trim().toUpperCase().replace(/\//g,'.');
 const market=inferCoreMarket(raw);
 const normalized=(market&&normalizeSecurityTicker(raw,market))||exact;
 return normalized===exact?[exact]:[exact,normalized];
}

type Lookup={column:'lei'|'cik'|'isin';value:string}|{column:'ticker';values:string[]};

/** Requires exactly one non-blank identifier and validates it. */
function parseQuery(q:ResolveQuery):Lookup{
 const t=(v?:string)=>v?.trim()||undefined;
 const given=(['ticker','isin','cik','lei'] as const).filter(k=>t(q[k])!==undefined);
 if(given.length===0)throw new Error('empty_query');
 if(given.length>1)throw new Error('ambiguous_query');
 const key=given[0],raw=t(q[key])!;
 switch(key){
  case 'lei':{const v=raw.toUpperCase();if(!isValidLei(v))throw new Error('invalid_identifier:lei');return {column:'lei',value:v};}
  case 'isin':{const v=raw.toUpperCase();if(!isValidIsin(v))throw new Error('invalid_identifier:isin');return {column:'isin',value:v};}
  case 'cik':{try{return {column:'cik',value:normalizeCik(raw)};}catch{throw new Error('invalid_identifier:cik');}}
  case 'ticker':return {column:'ticker',values:tickerCandidates(raw)};
 }
}

/** The single issuer owning a current row among `rows`; null if none; 'ambiguous_owner' if several. */
function currentOwner(rows:Row[],today:string):string|null{
 const owners=new Set(rows.filter(r=>isCurrent(r,today)).map(r=>str(r.issuer_id)).filter((v):v is string=>v!==null));
 // Prevented by the schema for both lookups (issuer_securities_no_overlap per ticker,
 // issuer_securities_isin_no_overlap per ISIN); kept as defense against non-conforming data.
 if(owners.size>1)throw new Error('ambiguous_owner');
 return owners.values().next().value??null;
}

export async function resolveIssuer(client:TableClient,q:ResolveQuery,opts:ResolveOptions={}):Promise<ResolvedIssuer|null>{
 const lookup=parseQuery(q);
 const today=resolveAsOf(opts);
 let issuerId:string|null=null;
 if(lookup.column==='lei'||lookup.column==='cik'){
  issuerId=str((await client.select('issuers',{[lookup.column]:lookup.value},{limit:1}))[0]?.issuer_id);
 }else if(lookup.column==='ticker'){
  // Fall back to the next candidate only when this one has no rows at all (see tickerCandidates).
  for(const v of lookup.values){
   const rows=await client.select('issuer_securities',{ticker:v});
   if(rows.length===0)continue;
   issuerId=currentOwner(rows,today);
   break;
  }
 }else{
  issuerId=currentOwner(await client.select('issuer_securities',{isin:lookup.value}),today);
 }
 if(!issuerId)return null;
 let issuer=(await client.select('issuers',{issuer_id:issuerId},{limit:1}))[0];
 if(!issuer)return null;
 let redirectedFrom:string|undefined;
 if(issuer.status==='merged'){
  const target=str(issuer.merged_into);
  if(!target)return null;
  redirectedFrom=issuerId;
  issuer=(await client.select('issuers',{issuer_id:target},{limit:1}))[0];
  if(!issuer||issuer.status==='merged')return null;
 }
 const id=String(issuer.issuer_id);
 // Single page: PostgREST caps responses at 1000 rows, far above any one issuer's listings.
 const secs=await client.select('issuer_securities',{issuer_id:id},{orderBy:'valid_from'});
 return {
  issuer_id:id,status:String(issuer.status),...(redirectedFrom?{redirected_from:redirectedFrom}:{}),
  names:{zh:str(issuer.canonical_name_zh),en:str(issuer.canonical_name_en)},
  identifiers:{cik:str(issuer.cik),lei:str(issuer.lei),usci:str(issuer.usci)},
  securities:(opts.includeExpired?secs:secs.filter(r=>isCurrent(r,today))).map(toSecurity),
 };
}

/**
 * Cache-Control for a successful resolve. Validity windows flip at UTC date boundaries, so a
 * shared cache may hold a response at most until the next UTC midnight (clamped to [60, 3600]s);
 * stale-while-revalidate is kept short, so a pre-midnight answer can still be served after the
 * flip: worst case ≈ 11 minutes past midnight (the 60s floor plus the 600s revalidate window).
 */
export function successCacheControl(now:Date):string{
 const nextMidnight=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1);
 const secs=Math.min(3600,Math.max(60,Math.floor((nextMidnight-now.getTime())/1000)));
 return `public, s-maxage=${secs}, stale-while-revalidate=600`;
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
/bin/zsh -lc "rg -n 'is_current|readFacts\\(' src/lib/facts/read* src/lib/facts/memory-facts-db*; ls src/lib/dq/reconcile; rg -n 'duplicate|members|expected_keys' src/lib/facts/memory*recon*; rg -n 'isPending|as_of|is_current' scripts/*gold* src/lib/facts/*gold*; find . -name '*AGENTS*' -not -path './node_modules/*'; cat package.json | head -70" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 2515ms:
src/lib/facts/read.test.ts:22:  expect(at2024[0]).toMatchObject({fact_id:fy23.fact_id,filing_id:F1,disclosure_seq:1,is_current:true,is_revision:false});
src/lib/facts/read.test.ts:24:  expect(at2025.map(r=>[r.filing_id,r.disclosure_seq,r.is_current,r.is_revision])).toEqual([[F1,1,false,false],[F2,2,true,false]]);
src/lib/facts/read.test.ts:44:  expect(all.map(r=>[r.status,r.disclosure_seq??null,r.is_current,r.is_revision])).toEqual([['ok',1,true,false],['quarantined',null,false,false],['staged',null,false,false]]);
src/lib/facts/read.test.ts:58:  const shape=(rs:FactRow[])=>rs.map(r=>[r.fact_id,r.status,r.disclosure_seq??null,r.is_current,r.is_revision]).sort((a,b)=>cmpS(String(a[0]),String(b[0])));
src/lib/facts/read.test.ts:60:   const fromDb=(await db.readFacts(iss,'US',{concepts:['revenue'],asOf:'2030-01-01',history,includeNonOk:true})).rows;
src/lib/facts/read.test.ts:64:   expect(pure.filter(r=>r.status!=='ok').map(r=>[r.disclosure_seq??null,r.is_current])).toEqual(history?[[null,false]]:[]);
src/lib/facts/read.test.ts:91:  expect(out.map(r=>[r.issuer_id,r.market,r.disclosure_seq,r.is_current,r.is_revision])).toEqual([['A','CN',1,true,false],['A','US',1,true,false],['B','US',1,true,false]]);
src/lib/facts/read.test.ts:120:  const shape=(rs:FactRow[])=>rs.map(r=>[r.fact_id,r.disclosure_seq??null,r.is_current,r.is_revision]).sort((x,y)=>cmpS(String(x[0]),String(y[0])));
src/lib/facts/read.test.ts:122:   const fromDb=(await db.readFacts(iss,'US',{concepts:['revenue','cash'],asOf:'2030-01-01',history})).rows;
src/lib/facts/read.ts:5:// (available_date, created_at, fact_id); disclosure_seq is the position, is_current marks the
src/lib/facts/read.ts:8:// undefined, is_current false, is_revision false) exactly like the SQL window and memoryFactsDb
src/lib/facts/read.ts:52:   out.push({...r,disclosure_seq:i+1,is_current:i===g.length-1,is_revision:prev!==null&&!decimalEquals(prev.value,r.value)});
src/lib/facts/read.ts:55: for(const r of visible)if(r.status!=='ok')out.push({...r,disclosure_seq:undefined,is_current:false,is_revision:false});
src/lib/facts/read.ts:56: const kept=opts.history?out:out.filter(r=>r.is_current);
src/lib/facts/memory-facts-db.ts:9:// disclosure_seq / is_current / is_revision over ok rows, key ranking and limit, 10,000-row cap).
src/lib/facts/memory-facts-db.ts:233:  for(const g of groups.values()){g.sort(byDisclosure);g.forEach((f,i)=>out.push({...clone(f),disclosure_seq:i+1,is_current:i===g.length-1,is_revision:i>0&&!numericEquals(f.value,g[i-1].value)}));}
src/lib/facts/memory-facts-db.ts:234:  for(const f of eligible)if(f.status!=='ok')out.push({...clone(f),disclosure_seq:undefined,is_current:false,is_revision:false});
src/lib/facts/memory-facts-db.ts:237:  const picked=out.filter(f=>(o.history===true||f.is_current===true)&&(o.limit===undefined||rank.get(keyOf(f))!<=o.limit));
src/lib/facts/memory-facts-db.ts:390:  async readFacts(issuer,market,o){const r=readLineage([issuer],market,o);return {stateRev:r.stateRevs[0].state_rev,rows:r.rows,truncated:r.truncated};},
decimal.test.ts
decimal.ts
inputs-hash.test.ts
inputs-hash.ts
ixbrl-trim.test.ts
ixbrl-trim.ts
ixbrl.test.ts
ixbrl.ts
pair-lineage.ts
pair-support.ts
pair-us-gold.ts
pairs.test.ts
pairs.ts
record.test.ts
record.ts
testing.ts
types.ts
zsh:1: no matches found: src/lib/facts/memory*recon*
zsh:1: no matches found: scripts/*gold*
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

exec
/bin/zsh -lc "rg -n 'openReconcileCycle|duplicate.*member|expected_keys|members' src/lib/facts/memory-dq*; rg -n 'isPending|as_of' scripts/facts* scripts/ci/*gold* 2>/dev/null; sed -n '200,245p' src/lib/facts/memory-facts-db.ts; rg -n 'conflicts|history' src/lib/facts/lineage.ts; rg -n 'open_reconcile_cycle|duplicate_member' supabase/migrations/* | tail -15" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 104ms:
zsh:1: no matches found: src/lib/facts/memory-dq*
zsh:1: no matches found: scripts/ci/*gold*
   if(open.some(i=>idsOf(i).includes(id)))continue;
   if(open.some(i=>i.reason_code==='same_day_conflict'&&disputes(i,f)))continue;
   if(resolvedConflicts.some(i=>idsOf(i).includes(id)&&!chosenOf(i).includes(id)))continue;
   if(lineageVerdicts.some(i=>(idsOf(i).includes(id)||listOf(detailOf(i).quarantined_fact_ids).includes(id))&&!chosenOf(i).includes(id)))continue;
   if(mismatches.some(i=>idsOf(i).includes(id)&&!passing(i)))continue;
   f.status='ok';n++;
  }
  return n;
 };
 // read_facts_lineage: the read_facts rules over a member set; with more than one member, ok rows of
 // one (K, available_date) from different issuers with different values leave the sequences and go to conflicts.
 const readLineage=(members:string[],market:Market,o:ReadFactsOptions):ReadFactsLineageResult=>{
  const set=[...new Set(members.map(m=>m.toLowerCase()))].sort(cmp);const inSet=new Set(set);
  const stateRevs:LineageRev[]=set.map(i=>({issuer_id:i,state_rev:scopeOf(i,market)?.state_rev??0}));
  const base=[...facts.values()].filter(f=>inSet.has(f.issuer_id)&&f.market===market&&o.concepts.includes(f.concept)&&f.available_date<=o.asOf
   &&(o.from===undefined||f.period_end>=o.from)&&(o.to===undefined||f.period_end<=o.to)&&(f.status==='ok'||o.includeNonOk===true)&&visible(f));
  const conflicts:LineageConflict[]=[];const excluded=new Set<string>();
  if(set.length>1){
   const byDay=new Map<string,FactRow[]>();
   for(const f of base)if(f.status==='ok'){const k=`${keyOf(f)}|${f.available_date}`;const g=byDay.get(k);if(g)g.push(f);else byDay.set(k,[f]);}
   for(const g of byDay.values()){
    if(new Set(g.map(f=>f.issuer_id)).size<2||g.every(f=>numericEquals(f.value,g[0].value)))continue;
    for(const f of g)excluded.add(f.fact_id);
    const f0=g[0];
    conflicts.push({key:{concept:f0.concept,period_start:f0.period_start,period_end:f0.period_end,consolidation:f0.consolidation,unit:f0.unit},available_date:f0.available_date,fact_ids:g.map(f=>f.fact_id).sort(cmp)});
   }
   const s=(v:string|null|undefined)=>v??'';
   conflicts.sort((a,b)=>cmp(a.available_date,b.available_date)||cmp(s(a.key.concept),s(b.key.concept))||cmp(s(a.key.period_end),s(b.key.period_end))||cmp(s(a.key.period_start),s(b.key.period_start))||cmp(s(a.key.consolidation),s(b.key.consolidation))||cmp(s(a.key.unit),s(b.key.unit)));
  }
  const eligible=base.filter(f=>!excluded.has(f.fact_id));
  const groups=new Map<string,FactRow[]>();
  for(const f of eligible)if(f.status==='ok'){const k=keyOf(f);if(!groups.has(k))groups.set(k,[]);groups.get(k)!.push(f);}
  const out:FactRow[]=[];
  for(const g of groups.values()){g.sort(byDisclosure);g.forEach((f,i)=>out.push({...clone(f),disclosure_seq:i+1,is_current:i===g.length-1,is_revision:i>0&&!numericEquals(f.value,g[i-1].value)}));}
  for(const f of eligible)if(f.status!=='ok')out.push({...clone(f),disclosure_seq:undefined,is_current:false,is_revision:false});
  const heads=new Map<string,FactRow>();for(const f of out)if(!heads.has(keyOf(f)))heads.set(keyOf(f),f);
  const rank=new Map([...heads.entries()].sort((a,b)=>keyOrder(a[1],b[1])).map(([k],i)=>[k,i+1] as const));
  const picked=out.filter(f=>(o.history===true||f.is_current===true)&&(o.limit===undefined||rank.get(keyOf(f))!<=o.limit));
  picked.sort((a,b)=>rank.get(keyOf(a))!-rank.get(keyOf(b))!||byDisclosure(a,b));
  if(picked.length>READ_FACTS_CAP)return {stateRevs,lineage:set,rows:[],conflicts,truncated:true};
  return {stateRevs,lineage:set,rows:picked,conflicts,truncated:false};
 };
 // replace_financial_metrics_lineage: member set = current lineage, every rev equal, else stale_computation.
 const replaceLineage=(issuer0:string,market:Market,basedOn:LineageRev[],input:MetricRow[])=>{
  const issuer=issuer0.toLowerCase();   // SQL compares uuids, not text
  const norm=lineageRevsFrom(basedOn.map(x=>({...x,issuer_id:String(x.issuer_id).toLowerCase()})));
rg: src/lib/facts/lineage.ts: IO error for operation on src/lib/facts/lineage.ts: No such file or directory (os error 2)
supabase/migrations/20261107091000_facts_extensions.sql:20:-- Lock order everywhere: the pair's cycle advisory lock first (set_merge, open_reconcile_cycle: any
supabase/migrations/20261107091000_facts_extensions.sql:301:-- source:S} appended under the cycle lock open_reconcile_cycle also takes (plan audit Q2), so a cycle
supabase/migrations/20261107091000_facts_extensions.sql:304:-- (fact_topology_lock) and the issuers rows. open_reconcile_cycle holds the same advisory lock while
supabase/migrations/20261107091000_facts_extensions.sql:319:  perform pg_advisory_xact_lock(hashtext('dq_reconcile_cycle:facts.lineage_same_day'));   -- FIRST, before any row lock (plan audit R1); serialises with open_reconcile_cycle (plan audit Q2)
supabase/migrations/20261107091000_facts_extensions.sql:374:-- lock, so it never waits for anything open_reconcile_cycle holds — a creator inserting a cursor for
supabase/migrations/20261107091000_facts_extensions.sql:1041:create or replace function public.open_reconcile_cycle(p_pair text, p_cycle_id text, p_started_at timestamptz, p_members jsonb, p_pending jsonb)
supabase/migrations/20261107091000_facts_extensions.sql:1104:revoke execute on function public.open_reconcile_cycle(text, text, timestamptz, jsonb, jsonb) from public, anon, authenticated;
supabase/migrations/20261107091000_facts_extensions.sql:1105:grant execute on function public.open_reconcile_cycle(text, text, timestamptz, jsonb, jsonb) to service_role;

exec
/bin/zsh -lc "sed -n '1041,1104p' supabase/migrations/20261107091000_facts_extensions.sql; rg -n 'isPending|plan2.json' scripts src/lib/facts | head -30; cat src/lib/facts/fixtures/gold/plan2.json; sed -n '1,90p' src/lib/facts/json-numbers.ts; rg -n 'factsByIds' src/lib/facts/memory-facts-db.ts src/lib/facts/types.ts" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
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
           where c.pair = p_pair and c.cycle_id <> p_cycle_id and jsonb_typeof(c.detail -> 'pending_members') = 'array'
           order by c.cycle_id for update loop
    select coalesce(jsonb_agg(e) filter (where not (p_pending @> jsonb_build_array(e))), '[]'::jsonb),
           coalesce(jsonb_agg(e) filter (where p_pending @> jsonb_build_array(e)), '[]'::jsonb)
      into v_keep, v_take
    from jsonb_array_elements(r.detail -> 'pending_members') e;
    if jsonb_array_length(v_take) > 0 then
      update public.dq_reconcile_cycles
      set detail = jsonb_set(r.detail, '{pending_members}', v_keep) || jsonb_build_object('pending_consumed_by', p_cycle_id)
      where pair = p_pair and cycle_id = r.cycle_id;
      v_from := v_from || r.cycle_id::text; v_moved := v_moved || v_take;
    end if;
  end loop;
  update public.dq_reconcile_cycles
  set detail = jsonb_build_object('pending_merged_from', to_jsonb(v_from), 'pending_transferred', v_moved)
  where pair = p_pair and cycle_id = p_cycle_id
  returning * into v_row;
  return jsonb_build_object('created', true, 'cycle', to_jsonb(v_row), 'transferred', v_moved);
end $$;
revoke execute on function public.open_reconcile_cycle(text, text, timestamptz, jsonb, jsonb) from public, anon, authenticated;
src/lib/facts/sync-us.integration.test.ts:8:// (fixtures/gold/plan2.json, round-1 #19). Two cases beyond the plan close review carry-overs:
src/lib/facts/sync-us.integration.test.ts:49:const isPending=(e:GoldEntry)=>e.recorded_by==='<pending>'||e.value==='<pending>';
src/lib/facts/sync-us.integration.test.ts:304:  const gold=JSON.parse(readFileSync(new URL('./fixtures/gold/plan2.json',import.meta.url),'utf8')) as GoldFile;
src/lib/facts/sync-us.integration.test.ts:308:  const missing=Object.keys(CIK).filter(t=>!us.some(e=>e.issuer.ticker===t&&!isPending(e)));
src/lib/facts/sync-us.integration.test.ts:311:   console.warn(`GOLD INCOMPLETE (ready:false, not failing): ${gold.entries.filter(isPending).length}/${gold.entries.length} entries still <pending>; no recorded entry for ${missing.join(', ')||'-'}; incomplete provenance: ${gaps.join(' | ')||'-'}. Owner step (runbook 8.11-6) blocks F2-7.`);
src/lib/facts/sync-us.integration.test.ts:314:   if(gold.required.US)for(const t of Object.keys(CIK))expect(us.some(e=>e.issuer.ticker===t&&!isPending(e)),`gold entry for ${t} is still <pending> — owner step (runbook 8.11-6) blocks F2-7`).toBe(true);
src/lib/facts/sync-us.integration.test.ts:316:   expect(gold.entries.filter(isPending).map(e=>`${e.issuer.ticker}/${e.concept}/${e.period_end}`),'pending entries in a ready gold file').toEqual([]);
src/lib/facts/sync-us.integration.test.ts:321:   const counted=gold.entries.filter(e=>!isPending(e)&&(e.issuer.market==='US'?e.issuer.ticker in CIK:CN_REPLAY_SUITE&&gold.required.CN));
src/lib/facts/sync-us.integration.test.ts:331:  for(const e of us.filter(e=>!isPending(e))){
{
 "version": 1,
 "note": "Plan 2 §11.4 gold assertions (round-1 #19). A human transcribes value/page from the primary document. STATUS: ready=false means INCOMPLETE and the owner has not transcribed yet; sync-us.integration.test.ts reports it with a loud warning but does NOT fail while ready is false (commander decision 2026-11-04; the plan originally made it a designed red). Recorded (non-'<pending>') entries are still replayed against the published facts even while ready is false. Once the owner sets ready=true the suite enforces everything: required.US (every fixture-backed US issuer, AAPL and MSFT, has at least one recorded entry), no '<pending>' anywhere, every asserted US issuer present in FIXTURE_ISSUERS with a recorded fixture, and the §11.4 matrix (>= 6 issuers, each >= 2 period_ends that each carry >= 6 concepts). required.CN flips to true when the A-share fixtures are recorded. as_of is the asOf used to read the fact (defaults to today).",
 "ready": false,
 "required": {"US": true, "CN": false},
 "entries": [
  {"issuer": {"ticker": "AAPL", "market": "US"}, "concept": "revenue", "period_end": "2023-09-30", "unit": "USD", "value": "383285000000", "as_of": "2023-11-03",
   "source": {"document": "Apple Inc. Form 10-K for the fiscal year ended September 30, 2023 (accession 0000320193-23-000106)", "page_or_row": "<pending>", "url": "https://www.sec.gov/Archives/edgar/data/320193/000032019323000106/"},
   "recorded_by": "<pending>", "recorded_at": null},
  {"issuer": {"ticker": "MSFT", "market": "US"}, "concept": "revenue", "period_end": "2023-06-30", "unit": "USD", "value": "211915000000", "as_of": "2023-07-27",
   "source": {"document": "Microsoft Corp. Form 10-K for the fiscal year ended June 30, 2023", "page_or_row": "<pending>", "url": "<pending>"},
   "recorded_by": "<pending>", "recorded_at": null},
  {"issuer": {"ticker": "600519.SH", "market": "CN"}, "concept": "revenue", "period_end": "2023-12-31", "unit": "CNY", "value": "<pending>", "as_of": null,
   "source": {"document": "贵州茅台 2023 年年度报告（巨潮公告）", "page_or_row": "<pending>", "url": "<pending>"},
   "recorded_by": "<pending>", "recorded_at": null}
 ]
}
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
src/lib/facts/types.ts:94: factsByIds(ids:string[]):Promise<FactRow[]>;
src/lib/facts/memory-facts-db.ts:52:const ASYNC_METHODS=['claimLease','beginRun','stageFilings','stageFacts','quarantineFacts','publishRun','abandonRun','releaseLease','resolveFactsQuarantine','replaceMetrics','readFacts','factsByIds','openConflicts','filingsOfIssuer','updateFilingLink','reconcileScope','scopeDue','scopeRows','scopeAll','metricsOfIssuer','targetOf','lineageOf','stateRevs','readFactsLineage','readFilingFacts','replaceMetricsLineage','findFilingBySourceRef','filingsForCalendar','setFilingAcceptance','adoptCandidate','restoreReconciled','resolveLineageConflict','claimReconcileMember','applyReconcileResult','completeReconcileMember','failReconcileMember','openReconcileCycle','setMerge','setDissolved'] as const satisfies readonly (keyof FactsDb)[];
src/lib/facts/memory-facts-db.ts:391:  async factsByIds(ids){return [...new Set(ids)].sort().map(id=>facts.get(id)).filter((f):f is FactRow=>!!f).map(f=>clone(f));},   // deduped, ordered by fact_id

codex
The gold pair can generate duplicate cycle members for valid multi-ticker issuers, violating the existing database cycle contract and preventing reconciliation from starting.

Review comment:

- [P2] Combine gold entries by resolved issuer before creating members — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/reconcile/pair-us-gold.ts:71-74
  When two gold tickers resolve to the same issuer (for example, multiple share classes or tickers redirected after a merge), this loop emits duplicate `(issuerId, market)` members. `open_reconcile_cycle` explicitly rejects duplicate issuer/market pairs with `invalid_members`, so otherwise valid gold entries prevent the entire cycle from starting. Group the resolved entries by issuer and market, combining their expected keys into one member.
The gold pair can generate duplicate cycle members for valid multi-ticker issuers, violating the existing database cycle contract and preventing reconciliation from starting.

Review comment:

- [P2] Combine gold entries by resolved issuer before creating members — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/reconcile/pair-us-gold.ts:71-74
  When two gold tickers resolve to the same issuer (for example, multiple share classes or tickers redirected after a merge), this loop emits duplicate `(issuerId, market)` members. `open_reconcile_cycle` explicitly rejects duplicate issuer/market pairs with `invalid_members`, so otherwise valid gold entries prevent the entire cycle from starting. Group the resolved entries by issuer and market, combining their expected keys into one member.

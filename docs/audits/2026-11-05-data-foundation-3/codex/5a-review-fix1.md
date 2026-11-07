OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b00e-c073-7762-8cae-4077d576b542
--------
user
commit 3181d65
exec
/bin/zsh -lc 'pwd; git status --short; git show --stat --oneline 3181d65; cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-7DQUaQmU' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-gfjkUJtX' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/5a-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/5a-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/5a-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-wycZe1fK' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-0mKySJr7' (errno=Operation not permitted)
3181d65 fix(entities): window backfill review fixes (current-key conflicts, aggregated conflict item, paging past short pages, BJ in E2, earliest-row guard, window freshness policy)
 scripts/entity-keys/backfill-windows.ts            |  6 +--
 src/lib/db/memory-table-client.ts                  |  2 +-
 src/lib/db/table-client.test.ts                    | 21 +++++++++
 src/lib/entities/backfill-windows.test.ts          | 54 +++++++++++++++++++++-
 src/lib/entities/coverage.test.ts                  |  8 ++++
 src/lib/entities/coverage.ts                       |  2 +-
 src/lib/entities/identifiers.integration.test.ts   | 23 +++++++--
 src/lib/entities/windows.ts                        | 47 ++++++++++++-------
 supabase/migrations.lock.json                      |  2 +-
 .../20261107090000_identifiers_and_dq.sql          |  8 +++-
 10 files changed, 143 insertions(+), 30 deletions(-)
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

exec
/bin/zsh -lc 'find .. -name AGENTS.md -o -name AGENTS.override.md; git show 3181d65 --; cat AGENTS.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 507ms:
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-miM31uaR' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-bo8kqHXb' (errno=Operation not permitted)
commit 3181d657ad4aaa9b529d95eff844a1a46f5980b7
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 00:51:46 2026 -0800

    fix(entities): window backfill review fixes (current-key conflicts, aggregated conflict item, paging past short pages, BJ in E2, earliest-row guard, window freshness policy)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/scripts/entity-keys/backfill-windows.ts b/scripts/entity-keys/backfill-windows.ts
index dc5568f..e2162e9 100644
--- a/scripts/entity-keys/backfill-windows.ts
+++ b/scripts/entity-keys/backfill-windows.ts
@@ -11,8 +11,8 @@ import {selectAll,supabaseTableClient,type TableClient} from '../../src/lib/db/t
 import {emptyCounts,finishBatch,startBatch,type BatchError,type BatchStatus} from '../../src/lib/dq/batches';
 import {DATASETS,DQ_DATASET_INVENTORY} from '../../src/lib/dq/datasets';
 import {recordAttempt} from '../../src/lib/dq/freshness';
-import {errorMessage,loaderOutcome} from '../../src/lib/entities/load-sec';
-import {SEC_ROW_KEY,WINDOWS_RULES_VERSION,applyWindowBackfill,keysetAll,planWindowBackfill,type UniverseDates,type WindowRow} from '../../src/lib/entities/windows';
+import {errorMessage} from '../../src/lib/entities/load-sec';
+import {SEC_ROW_KEY,WINDOWS_RULES_VERSION,applyWindowBackfill,keysetAll,planWindowBackfill,windowsOutcome,type UniverseDates,type WindowRow} from '../../src/lib/entities/windows';
 import {getAdminSupabase} from '../../src/lib/supabase/admin';
 
 const DATASET=DATASETS.entities.windows;
@@ -54,7 +54,7 @@ async function main(){
   try{status=await finishBatch(tables,batchId,{counts,errors});}
   catch(e){console.error(`finishBatch failed: ${errorMessage(e)}`);status='failed';}
  }
- const outcome=loaderOutcome(status,counts);
+ const outcome=windowsOutcome(status,counts);
  await recordAttempt(tables,DATASET,{ok:outcome.ok,cadence:cadenceOf(DATASET)});
  console.log(JSON.stringify({batchId,status,counts,errors:errors.slice(0,20)},null,1));
  process.exitCode=outcome.exitCode;
diff --git a/src/lib/db/memory-table-client.ts b/src/lib/db/memory-table-client.ts
index 471e623..3c71712 100644
--- a/src/lib/db/memory-table-client.ts
+++ b/src/lib/db/memory-table-client.ts
@@ -84,7 +84,7 @@ const MEMORY_RPC:Record<string,(rowsOf:(t:string)=>Row[],a:Row)=>unknown>={
   if(side==='from'){
    if(row.valid_from_method==='listing_date'&&row.valid_from===nd&&'valid_from' in prov)return 'duplicate';
    if((row.valid_from_method!=='first_observed'&&row.valid_from_method!=='curated')||nd>String(row.valid_from))return 'conflict';
-   if(row.valid_to!=null&&nd>=String(row.valid_to))return 'conflict';
+   if(rowsOf('issuer_securities').some(o=>o!==row&&o.ticker===a.p_ticker&&String(o.valid_from)<String(row.valid_from)))return 'conflict';   // not the ticker's earliest row
    row.valid_from=nd;row.valid_from_method='listing_date';
   }else{
    if(row.valid_to===nd&&row.valid_to_method==='delisting'&&'valid_to' in prov)return 'duplicate';
diff --git a/src/lib/db/table-client.test.ts b/src/lib/db/table-client.test.ts
index 9b1ba96..0e41083 100644
--- a/src/lib/db/table-client.test.ts
+++ b/src/lib/db/table-client.test.ts
@@ -243,6 +243,27 @@ describe('rpc (plan 3 row-locking functions; plan audit P3/P4/R2)',()=>{
   expect(await callRpc(c,'set_security_identifier',{...args('isin','X',PI),p_ticker:'NOPE'})).toBe('not_found');
   await expect(callRpc(c,'set_security_identifier',args('isin','X',PF))).rejects.toMatchObject({code:'22023'});
  });
+ it('memoryTableClient emulates set_security_window: from/to written, duplicate, conflict (state, earliest row), not_found, invalid_window_write',async()=>{
+  const c=memoryTableClient();
+  await c.insert('issuer_securities',{issuer_id:'i',ticker:'X',valid_from:'2024-03-01',valid_to:null,valid_from_method:'first_observed',valid_to_method:null,provenance:{exchange:'SSE'}});
+  const args=(side:string,from:string,date:string,pv:unknown)=>({p_issuer:'i',p_ticker:'X',p_valid_from:from,p_side:side,p_new_date:date,p_provenance:pv});
+  const WF={valid_from:{source:'u'}},WT={valid_to:{source:'u'}};
+  expect(await callRpc(c,'set_security_window',args('from','2024-03-01','2025-01-01',WF))).toBe('conflict');
+  expect(await callRpc(c,'set_security_window',args('from','2024-03-01','2001-08-27',WF))).toBe('written');
+  expect(await callRpc(c,'set_security_window',args('from','2001-08-27','2001-08-27',WF))).toBe('duplicate');
+  expect(await callRpc(c,'set_security_window',args('from','2001-08-27','2000-01-01',WF))).toBe('conflict');
+  expect(await callRpc(c,'set_security_window',args('to','2001-08-27','2001-08-27',WT))).toBe('conflict');
+  expect(await callRpc(c,'set_security_window',args('to','2001-08-27','2026-06-30',WT))).toBe('written');
+  expect(await callRpc(c,'set_security_window',args('to','2001-08-27','2026-06-30',WT))).toBe('duplicate');
+  expect(await callRpc(c,'set_security_window',args('to','2001-08-27','2026-07-01',WT))).toBe('conflict');
+  expect(c.rows('issuer_securities')[0]).toMatchObject({valid_from:'2001-08-27',valid_to:'2026-06-30',valid_from_method:'listing_date',valid_to_method:'delisting',provenance:{exchange:'SSE',...WF,...WT}});
+  expect(await callRpc(c,'set_security_window',args('from','1999-01-01','1990-01-01',WF))).toBe('not_found');
+  await c.insert('issuer_securities',{issuer_id:'j',ticker:'X',valid_from:'1995-01-01',valid_to:'1996-01-01',valid_from_method:'first_observed',valid_to_method:'unrecorded',provenance:{}});
+  await c.update('issuer_securities',{issuer_id:'i',ticker:'X'},{valid_from_method:'first_observed'});
+  expect(await callRpc(c,'set_security_window',args('from','2001-08-27','1998-01-01',WF))).toBe('conflict');   // an earlier holding exists
+  for(const bad of [args('from','2001-08-27','1998-01-01',WT),args('x','2001-08-27','1998-01-01',WF),args('from','2001-08-27','1998-01-01',{...WF,...WT})])
+   await expect(callRpc(c,'set_security_window',bad)).rejects.toThrow(/invalid_window_write/);
+ });
  it('callRpc refuses a client without rpc; an unknown function fails like PostgreSQL (42883)',async()=>{
   const c=memoryTableClient();
   const {rpc:_rpc,...noRpc}=c;
diff --git a/src/lib/entities/backfill-windows.test.ts b/src/lib/entities/backfill-windows.test.ts
index b52bc07..9a5da81 100644
--- a/src/lib/entities/backfill-windows.test.ts
+++ b/src/lib/entities/backfill-windows.test.ts
@@ -2,7 +2,8 @@
 import {describe,it,expect} from 'vitest';
 import {TableError,type TableClient} from '../db/table-client';
 import {memoryTableClient} from '../db/memory-table-client';
-import {applyWindowBackfill,planWindowBackfill,type UniverseDates,type WindowRow} from './windows';
+import {coverageE2} from './coverage';
+import {applyWindowBackfill,keysetAll,planWindowBackfill,windowsOutcome,type UniverseDates,type WindowRow} from './windows';
 
 const ASOF='2026-11-05',BATCH='33333333-3333-4333-8333-333333333333',DATASET='entities.windows';
 const w=(o:Partial<WindowRow>):WindowRow=>({issuer_id:'i1',ticker:'600519.SH',valid_from:'2024-03-01',valid_to:null,valid_from_method:'first_observed',valid_to_method:null,provenance:{source:'curated'},...o});
@@ -38,7 +39,7 @@ describe('planWindowBackfill',()=>{
   const bad=planWindowBackfill([w({valid_from:'2024-03-01'})],new Map([u('600519.SH',{list_date:null,delist_date:'2024-03-01'})]),ASOF);
   expect(bad.conflicts.map(c=>c.reason)).toEqual(['delist_on_or_before_valid_from']);
  });
- it('a single row gets both changes; the close uses the new valid_from and keeps the listing provenance',()=>{
+ it('a single row gets both changes; the close uses the new valid_from and each change carries only its own single provenance key',()=>{
   const p=planWindowBackfill([w({})],new Map([u('600519.SH',{delist_date:'2026-06-30'})]),ASOF);
   expect(p.changes.map(c=>c.kind)).toEqual(['from','to']);
   const to=p.changes[1] as Extract<typeof p.changes[number],{kind:'to'}>;
@@ -78,3 +79,52 @@ describe('applyWindowBackfill',()=>{
   expect(res.errors.map(e=>e.code)).toEqual(['ownership_conflict','blocked_by_from_change']);
  });
 });
+
+describe('conflicts after a backdate, aggregation, paging, freshness',()=>{
+ const row=(o:Partial<WindowRow>={})=>({...w(o),isin:null,figi:null,share_class:'A',is_primary:true,source:'curated'});
+ it('a conflict on a row whose backdate landed is parked under the CURRENT key with the original snapshot, and E2 counts it',async()=>{
+  const c=memoryTableClient({dq_quarantine:['id']});
+  await c.insert('issuer_securities',row({}));
+  const u1=new Map([u('600519.SH',{delist_date:'2000-01-01'})]);
+  const plan=planWindowBackfill([w({})],u1,ASOF);
+  expect(plan.changes.map(x=>x.kind)).toEqual(['from']);
+  const res=await applyWindowBackfill(c,plan,{batchId:BATCH,dataset:DATASET});
+  expect(res.counts).toMatchObject({versioned:1,quarantined:1,failed:0});
+  const q=c.rows('dq_quarantine');
+  expect(q).toHaveLength(1);
+  expect(q[0]).toMatchObject({natural_key:'600519.SH:2001-08-27',reason_code:'window_evidence_conflict',
+   payload:{issuer_id:'i1',ticker:'600519.SH',valid_from:'2024-03-01',valid_from_method:'first_observed',current_valid_from:'2001-08-27'}});
+  const rows=c.rows('issuer_securities');
+  const e2=coverageE2({rows,listDates:new Map([['600519.SH','2001-08-27']]),queueIssuers:new Set(['i1']),openQuarantineKeys:new Set(q.map(x=>String(x.natural_key)))});
+  expect(e2).toMatchObject({open_quarantine:1,passes:false});
+ });
+ it('two conflicts on one row persist as ONE item carrying both reasons and both evidence rows',async()=>{
+  const c=memoryTableClient({dq_quarantine:['id']});
+  await c.insert('issuer_securities',row({valid_from:'2000-01-01'}));
+  const plan=planWindowBackfill([w({valid_from:'2000-01-01'})],new Map([u('600519.SH',{list_date:'2001-08-27',delist_date:'1999-12-31'})]),ASOF);
+  expect(plan.conflicts.map(x=>x.reason)).toEqual(['list_date_after_first_observed','delist_on_or_before_valid_from']);
+  const res=await applyWindowBackfill(c,plan,{batchId:BATCH,dataset:DATASET});
+  const q=c.rows('dq_quarantine');
+  expect(q).toHaveLength(1);
+  expect(q[0].detail).toEqual({reason:'list_date_after_first_observed',reasons:['list_date_after_first_observed','delist_on_or_before_valid_from'],conflicts:[
+   {reason:'list_date_after_first_observed',list_date:'2001-08-27',valid_from:'2000-01-01',source:'tushare_stock_basic'},
+   {reason:'delist_on_or_before_valid_from',delist_date:'1999-12-31',valid_from:'2000-01-01',source:'tushare_stock_basic'}]});
+  expect(res.counts).toMatchObject({quarantined:1,failed:0});
+ });
+ it('keysetAll continues past a short page when the server caps pages below MAX_PAGE',async()=>{
+  const c=memoryTableClient();
+  const tickers=['A','B','B','C','D','E','F','F','G'];
+  let i=0;for(const t of tickers)await c.insert('t',{ticker:t,issuer_id:`i${i++}`,valid_from:'2020-01-01'});
+  const capped:TableClient={...c,select:(t,m,o)=>c.select(t,m,{...o,limit:Math.min(o?.limit??3,3)})};
+  const got=await keysetAll(capped,'t',{},{},'ticker',['issuer_id','ticker','valid_from']);
+  expect(got).toHaveLength(9);
+  expect(await keysetAll(capped,'empty',{},{},'ticker',['ticker'])).toEqual([]);
+ });
+ it('freshness counts backfilled rows as landed: a partial run with versioned + quarantined only is ok; quarantine only is not',()=>{
+  const base={fetched:0,inserted:0,duplicates:0,versioned:0,quarantined:0,failed:0};
+  expect(windowsOutcome('partial',{...base,versioned:3,quarantined:2})).toEqual({ok:true,exitCode:0});
+  expect(windowsOutcome('partial',{...base,quarantined:2})).toEqual({ok:false,exitCode:0});
+  expect(windowsOutcome('partial',{...base,versioned:3,failed:1})).toMatchObject({ok:false,exitCode:1});
+  expect(windowsOutcome('success',{...base,versioned:3})).toEqual({ok:true,exitCode:0});
+ });
+});
diff --git a/src/lib/entities/coverage.test.ts b/src/lib/entities/coverage.test.ts
index 004b6d1..c081587 100644
--- a/src/lib/entities/coverage.test.ts
+++ b/src/lib/entities/coverage.test.ts
@@ -46,3 +46,11 @@ describe('coverageE2',()=>{
   expect(r).toEqual({backfillable:{num:1,den:2,pct:'50.00'},not_backfillable:2,open_quarantine:1,passes:false});
  });
 });
+
+describe('coverageE2 Beijing',()=>{
+ it('counts an unbackfilled .BJ row as backfillable work',()=>{
+  const rows=[{issuer_id:'q',ticker:'430047.BJ',valid_from:'2024-01-01',valid_from_method:'first_observed'}];
+  const r=coverageE2({rows,listDates:new Map([['430047.BJ','2020-07-27']]),queueIssuers:new Set(['q']),openQuarantineKeys:new Set()});
+  expect(r).toEqual({backfillable:{num:0,den:1,pct:'0.00'},not_backfillable:0,open_quarantine:0,passes:false});
+ });
+});
diff --git a/src/lib/entities/coverage.ts b/src/lib/entities/coverage.ts
index 06a00ac..ee723ae 100644
--- a/src/lib/entities/coverage.ts
+++ b/src/lib/entities/coverage.ts
@@ -35,7 +35,7 @@ export function coverageE2(input:{rows:readonly Row[];listDates:ReadonlyMap<stri
  const earliest=new Map<string,string>();
  for(const r of input.rows){const t=String(r.ticker),vf=String(r.valid_from);const e=earliest.get(t);if(e===undefined||vf<e)earliest.set(t,vf);}
  const key=(r:Row)=>`${r.ticker}:${r.valid_from}`;
- const ah=input.rows.filter(r=>/\.(SH|SZ|HK)$/.test(String(r.ticker))&&input.queueIssuers.has(String(r.issuer_id)));
+ const ah=input.rows.filter(r=>/\.(SH|SZ|BJ|HK)$/.test(String(r.ticker))&&input.queueIssuers.has(String(r.issuer_id)));
  const back=ah.filter(r=>earliest.get(String(r.ticker))===String(r.valid_from)&&!!input.listDates.get(String(r.ticker))&&!input.openQuarantineKeys.has(key(r)));
  const backfillable=ratio(back.filter(r=>r.valid_from_method==='listing_date').length,back.length);
  return {backfillable,not_backfillable:ah.length-back.length,open_quarantine:ah.filter(r=>input.openQuarantineKeys.has(key(r))).length,passes:backfillable.den>0&&backfillable.num===backfillable.den};
diff --git a/src/lib/entities/identifiers.integration.test.ts b/src/lib/entities/identifiers.integration.test.ts
index 7b6b549..a48ee88 100644
--- a/src/lib/entities/identifiers.integration.test.ts
+++ b/src/lib/entities/identifiers.integration.test.ts
@@ -1046,7 +1046,7 @@ describe.skipIf(!enabled)('plan 3 migration one: row-locked jsonb patches (appen
   expect(await winState(t)).toEqual({valid_from:'2001-08-27',valid_to:'2026-06-30',valid_from_method:'listing_date',valid_to_method:'delisting',provenance:{exchange:'SSE',...WF,...WT}});
   const c=await ticker();
   await sec(a,c,'2024-03-01','2025-01-01',{valid_to_method:'unrecorded'});
-  expect(await setWin(a,c,'2024-03-01','from','2025-01-01',WF)).toBe('conflict');          // new from would not precede valid_to
+  expect(await setWin(a,c,'2024-03-01','from','2025-01-01',WF)).toBe('conflict');          // listing date after valid_from
   await q(`update public.issuer_securities set valid_from_method='ticker_change' where ticker=$1`,[c]);
   expect(await setWin(a,c,'2024-03-01','from','2020-01-01',WF)).toBe('conflict');          // method not first_observed/curated
   expect(await setWin(a,await ticker(),'2024-03-01','from','2001-08-27',WF)).toBe('not_found');
@@ -1074,12 +1074,27 @@ describe.skipIf(!enabled)('plan 3 migration one: row-locked jsonb patches (appen
    expect((await secState(t)).isin).toBe(isinFirst?isin:null);
   }
  });
- it('set_security_window surfaces an overlap as the exclusion violation 23P01',async()=>{
+ it('set_security_window from: an earlier non-overlapping holding of the ticker (any issuer) that appeared after planning makes it conflict; the advisory lock serialises window writers',async()=>{
+  const a=await issuer(),b=await issuer();const t=await ticker();
+  await sec(a,t,'2024-03-01',null);
+  await sec(b,t,'1990-01-01','1995-01-01',{valid_to_method:'unrecorded'});     // appears between planning and applying
+  expect(await setWin(a,t,'2024-03-01','from','2001-08-27',WF)).toBe('conflict');
+  expect((await q(`select to_char(valid_from,'YYYY-MM-DD') f from public.issuer_securities where issuer_id=$1 and ticker=$2`,[a,t]))[0].f).toBe('2024-03-01');
+  const t2=await ticker();
+  await sec(a,t2,'2024-03-01',null);
+  await inTx(admin,async tx=>{
+   await tx.c.query(`select pg_advisory_xact_lock(hashtext('issuer_securities_ticker:'||$1::text))`,[t2]);
+   const second=setWin(a,t2,'2024-03-01','from','2001-08-27',WF);
+   await stillBlockedBehind(admin,tx.pid,second);
+   await tx.commit();
+   expect(await second).toBe('written');
+  });
+ });
+ it('set_security_window refuses a backdate into an earlier holding of the same ticker (earliest-row guard, before the exclusion constraint)',async()=>{
   const a=await issuer();const t=await ticker();
   await sec(a,t,'2010-01-01','2015-01-01',{valid_to_method:'unrecorded'});
   await sec(a,t,'2015-01-01',null);
-  const err=await fails(setWin(a,t,'2015-01-01','from','2012-01-01',WF));
-  expect(['23P01','23505']).toContain(err.code);
+  expect(await setWin(a,t,'2015-01-01','from','2012-01-01',WF)).toBe('conflict');
   expect((await q(`select to_char(valid_from,'YYYY-MM-DD') f from public.issuer_securities where ticker=$1 order by valid_from`,[t])).map(r=>r.f)).toEqual(['2010-01-01','2015-01-01']);
  });
  // Task 4b review P1: the orgId write and its provenance key land in one locked UPDATE.
diff --git a/src/lib/entities/windows.ts b/src/lib/entities/windows.ts
index f5bfc7e..bb98c5c 100644
--- a/src/lib/entities/windows.ts
+++ b/src/lib/entities/windows.ts
@@ -8,9 +8,9 @@
 // (quarantined, row unchanged). US tickers carry no list_date and are left as first_observed.
 // applyWindowBackfill writes through the guarded RPC set_security_window; exclusion/unique violations become ownership_conflict.
 import {MAX_PAGE,callRpc,type RangeOptions,type Row,type TableClient} from '../db/table-client';
-import {emptyCounts,type BatchError} from '../dq/batches';
+import {emptyCounts,type BatchCounts,type BatchError,type BatchStatus} from '../dq/batches';
 import {isUnique} from './claims';
-import {errorMessage,parkConflict,withSkippedSummary,type ApplyResult} from './load-sec';
+import {errorMessage,loaderOutcome,parkConflict,withSkippedSummary,type ApplyResult} from './load-sec';
 import {sanitizeProvenance} from './provenance';
 
 export const WINDOWS_RULES_VERSION='windows/1';
@@ -25,8 +25,9 @@ export interface WindowPlan{changes:WindowChange[];conflicts:WindowConflict[];un
 
 /**
  * Pages a table by a NON-unique order column with gte cursors, de-duplicating on keyCols (same
- * approach as the private helper in facts/scope.ts). A single order value with more than MAX_PAGE
- * rows cannot be paged and throws keyset_tie_group_overflow.
+ * approach as the private helper in facts/scope.ts). The server may cap a page below MAX_PAGE, so
+ * a short page is NOT the end: paging continues until a page adds no unseen row. Assumes no single
+ * order value has more rows than the server cap (a ticker has a handful of holding rows).
  */
 export async function keysetAll(tables:TableClient,table:string,match:Row,range:RangeOptions,orderBy:string,keyCols:readonly string[]):Promise<Row[]>{
  const seen=new Set<string>(),out:Row[]=[];
@@ -34,11 +35,10 @@ export async function keysetAll(tables:TableClient,table:string,match:Row,range:
  for(;;){
   const gte={...range.gte,...(cursor===null?{}:{[orderBy]:cursor})};
   const page=await tables.select(table,match,{...range,gte,orderBy,limit:MAX_PAGE});
-  for(const r of page){const k=keyCols.map(c=>String(r[c])).join('\u0000');if(!seen.has(k)){seen.add(k);out.push(r);}}
-  if(page.length<MAX_PAGE)return out;
-  const last=String(page[page.length-1][orderBy]);
-  if(last===cursor)throw new Error('keyset_tie_group_overflow');
-  cursor=last;
+  let added=0;
+  for(const r of page){const k=keyCols.map(c=>String(r[c])).join('\u0000');if(!seen.has(k)){seen.add(k);out.push(r);added++;}}
+  if(page.length===0||added===0)return out;
+  cursor=String(page[page.length-1][orderBy]);
  }
 }
 
@@ -73,24 +73,36 @@ export function planWindowBackfill(rows:readonly WindowRow[],universe:ReadonlyMa
  return plan;
 }
 
+/** Freshness/exit policy of the window backfill: rows moved by a backfill (versioned) are landed rows, so a partial run that backfilled and only quarantined conflicts is still a good attempt. */
+export function windowsOutcome(status:BatchStatus,counts:BatchCounts):{ok:boolean;exitCode:0|1}{
+ return loaderOutcome(status,{...counts,duplicates:counts.duplicates+counts.versioned});
+}
+
 export async function applyWindowBackfill(tables:TableClient,plan:WindowPlan,opts:{batchId:string;dataset:string}):Promise<ApplyResult>{
  const counts=emptyCounts();const errors:BatchError[]=[];
  counts.duplicates=plan.unchanged;
- const keyOf=(r:WindowRow)=>`${r.ticker}:${r.valid_from}`;
+ const idOf=(r:WindowRow)=>`${r.issuer_id}|${r.ticker}|${r.valid_from}`;
+ // a row's CURRENT valid_from (its natural key), which moves when its backdate lands
+ const current=new Map<string,string>();
+ const fromOf=(r:WindowRow)=>current.get(idOf(r))??r.valid_from;
+ const keyOf=(r:WindowRow)=>`${r.ticker}:${fromOf(r)}`;
+ const snapshot=(r:WindowRow)=>({issuer_id:r.issuer_id,ticker:r.ticker,valid_from:r.valid_from,valid_to:r.valid_to,valid_from_method:r.valid_from_method,current_valid_from:fromOf(r)});
  const park=(r:WindowRow,reason:'ownership_conflict'|'window_evidence_conflict',detail:Record<string,unknown>)=>parkConflict(tables,{
-  dataset:opts.dataset,table:'issuer_securities',naturalKey:keyOf(r),reasonCode:reason,detail,
-  payload:{issuer_id:r.issuer_id,ticker:r.ticker,valid_from:r.valid_from,valid_to:r.valid_to,valid_from_method:r.valid_from_method},batchId:opts.batchId,
+  dataset:opts.dataset,table:'issuer_securities',naturalKey:keyOf(r),reasonCode:reason,detail,payload:snapshot(r),batchId:opts.batchId,
  },counts,errors,{code:reason,key:keyOf(r)});
  const blocked=new Set<string>();
  for(const c of plan.changes){
-  const id=`${c.row.issuer_id}|${keyOf(c.row)}`;
+  const id=idOf(c.row);
   if(c.kind==='to'&&blocked.has(id)){counts.failed++;errors.push({code:'blocked_by_from_change',key:keyOf(c.row)});continue;}
   try{
    const out=await callRpc(tables,'set_security_window',c.kind==='from'
     ?{p_issuer:c.row.issuer_id,p_ticker:c.row.ticker,p_valid_from:c.row.valid_from,p_side:'from',p_new_date:c.newValidFrom,p_provenance:c.provenance}
     :{p_issuer:c.row.issuer_id,p_ticker:c.row.ticker,p_valid_from:c.validFrom,p_side:'to',p_new_date:c.newValidTo,p_provenance:c.provenance});
-   if(out==='written'){counts.versioned++;continue;}
-   if(out==='duplicate'){counts.duplicates++;continue;}
+   if(out==='written'||out==='duplicate'){
+    if(c.kind==='from')current.set(id,c.newValidFrom);
+    if(out==='written')counts.versioned++;else counts.duplicates++;
+    continue;
+   }
    if(c.kind==='from')blocked.add(id);
    counts.failed++;errors.push({code:'row_changed',key:keyOf(c.row),message:`${c.kind}:${String(out)}`});
   }catch(e){
@@ -99,7 +111,10 @@ export async function applyWindowBackfill(tables:TableClient,plan:WindowPlan,opt
    counts.failed++;errors.push({code:'window_write_error',key:keyOf(c.row),message:errorMessage(e)});
   }
  }
- for(const x of plan.conflicts)await park(x.row,'window_evidence_conflict',{reason:x.reason,...x.detail});
+ // one quarantine item per row, carrying every conflict reason and its evidence row
+ const byRow=new Map<string,WindowConflict[]>();
+ for(const x of plan.conflicts){const l=byRow.get(idOf(x.row))??[];l.push(x);byRow.set(idOf(x.row),l);}
+ for(const xs of byRow.values())await park(xs[0].row,'window_evidence_conflict',{reason:xs[0].reason,reasons:xs.map(x=>x.reason),conflicts:xs.map(x=>({reason:x.reason,...x.detail}))});
  counts.fetched=counts.inserted+counts.duplicates+counts.versioned+counts.quarantined+counts.failed;
  const skippedSummary:Record<string,number>={};
  for(const s of plan.skipped)skippedSummary[s]=(skippedSummary[s]??0)+1;
diff --git a/supabase/migrations.lock.json b/supabase/migrations.lock.json
index 70561de..f1e8af1 100644
--- a/supabase/migrations.lock.json
+++ b/supabase/migrations.lock.json
@@ -203,7 +203,7 @@
     },
     {
       "file": "20261107090000_identifiers_and_dq.sql",
-      "sha256": "268530d58e8372dcd47eaa140e0f6d83950fa853a2c2ee367d327c28066c3b0b"
+      "sha256": "cfacdaa428d9bdede32bae861716865169d719ace3f0858d93c15f00c576d39e"
     }
   ]
 }
diff --git a/supabase/migrations/20261107090000_identifiers_and_dq.sql b/supabase/migrations/20261107090000_identifiers_and_dq.sql
index 5175c09..dd38796 100644
--- a/supabase/migrations/20261107090000_identifiers_and_dq.sql
+++ b/supabase/migrations/20261107090000_identifiers_and_dq.sql
@@ -799,7 +799,7 @@ grant execute on function public.set_security_identifier(uuid, text, date, text,
 -- set_security_window is the only writer of an evidenced valid_from / valid_to (windows.ts, backfill-windows).
 -- Lock order of set_security_identifier / resolve_identifier_claim: issuer FOR SHARE, then the row FOR UPDATE.
 -- p_side 'from': the row (issuer, ticker, p_valid_from) must still have method first_observed or curated and
---   p_new_date <= valid_from; ONE UPDATE sets valid_from = p_new_date, valid_from_method = 'listing_date'.
+--   p_new_date <= valid_from and no other row of the ticker starting earlier; ONE UPDATE sets valid_from = p_new_date, valid_from_method = 'listing_date'.
 -- p_side 'to': the row (issuer, ticker, p_valid_from) must still be open and p_new_date > valid_from; ONE UPDATE
 --   sets valid_to, valid_to_method = 'delisting'.
 -- Both merge `provenance || p_provenance` (never a whole-object replacement); p_provenance must be public-safe
@@ -824,7 +824,11 @@ begin
   if p_side = 'from' then
     if v_row.valid_from_method = 'listing_date' and v_row.valid_from = p_new_date and v_row.provenance ? 'valid_from' then return 'duplicate'; end if;
     if v_row.valid_from_method not in ('first_observed', 'curated') or p_new_date > v_row.valid_from then return 'conflict'; end if;
-    if v_row.valid_to is not null and p_new_date >= v_row.valid_to then return 'conflict'; end if;
+    -- the listing date belongs to the ticker's EARLIEST holding row: serialise window writers per ticker, then recheck
+    -- that no other row (any issuer) of the ticker starts earlier (an earlier non-overlapping holding appeared since planning).
+    -- Overlaps themselves are refused by the no-overlap exclusion constraint (23P01), not here.
+    perform pg_advisory_xact_lock(hashtext('issuer_securities_ticker:' || p_ticker));
+    if exists (select 1 from public.issuer_securities o where o.ticker = p_ticker and o.valid_from < p_valid_from) then return 'conflict'; end if;
     update public.issuer_securities set valid_from = p_new_date, valid_from_method = 'listing_date', provenance = provenance || p_provenance
     where issuer_id = p_issuer and ticker = p_ticker and valid_from = p_valid_from and valid_from_method in ('first_observed', 'curated');
   else
cat: AGENTS.md: No such file or directory

exec
/bin/zsh -lc 'for d in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees; do ls "$d"/AGENTS* 2>/dev/null; done; find . -name CLAUDE.md -not -path '"'./node_modules/*'; cat src/lib/entities/windows.ts; cat scripts/entity-keys/backfill-windows.ts; sed -n '795,850p' supabase/migrations/20261107090000_identifiers_and_dq.sql; rg 'issuer_securities_ticker|keysetAll' src scripts supabase/migrations; cat src/lib/db/table-client.ts" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 89ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md
zsh:1: no matches found: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/AGENTS*
zsh:1: no matches found: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/AGENTS*
// src/lib/entities/windows.ts
// Evidenced holding windows (spec §4.3.1–§4.3.2). planWindowBackfill is pure: per ticker it lifts
// the EARLIEST holding row's valid_from to stocks_universe.list_date (method listing_date) and
// closes the LATEST open row at delist_date (method delisting), copying the exact source-row
// values into a SINGLE provenance key (never a reference to the mutable universe table, never a whole-object
// copy: the database merges the key atomically in set_security_window). A listing date after
// the first observation, or a delisting on/before valid_from, is a window_evidence_conflict
// (quarantined, row unchanged). US tickers carry no list_date and are left as first_observed.
// applyWindowBackfill writes through the guarded RPC set_security_window; exclusion/unique violations become ownership_conflict.
import {MAX_PAGE,callRpc,type RangeOptions,type Row,type TableClient} from '../db/table-client';
import {emptyCounts,type BatchCounts,type BatchError,type BatchStatus} from '../dq/batches';
import {isUnique} from './claims';
import {errorMessage,loaderOutcome,parkConflict,withSkippedSummary,type ApplyResult} from './load-sec';
import {sanitizeProvenance} from './provenance';

export const WINDOWS_RULES_VERSION='windows/1';
export const SEC_ROW_KEY=['issuer_id','ticker','valid_from'] as const;
export interface UniverseDates{ticker:string;list_date:string|null;delist_date:string|null;source:string|null;source_updated_at:string|null}
export interface WindowRow{issuer_id:string;ticker:string;valid_from:string;valid_to:string|null;valid_from_method:string;valid_to_method:string|null;provenance:Record<string,unknown>}
export type WindowChange=
 |{kind:'from';row:WindowRow;newValidFrom:string;provenance:Record<string,unknown>}
 |{kind:'to';row:WindowRow;validFrom:string;newValidTo:string;provenance:Record<string,unknown>};
export interface WindowConflict{row:WindowRow;reason:'list_date_after_first_observed'|'delist_on_or_before_valid_from';detail:Record<string,unknown>}
export interface WindowPlan{changes:WindowChange[];conflicts:WindowConflict[];unchanged:number;skipped:string[]}

/**
 * Pages a table by a NON-unique order column with gte cursors, de-duplicating on keyCols (same
 * approach as the private helper in facts/scope.ts). The server may cap a page below MAX_PAGE, so
 * a short page is NOT the end: paging continues until a page adds no unseen row. Assumes no single
 * order value has more rows than the server cap (a ticker has a handful of holding rows).
 */
export async function keysetAll(tables:TableClient,table:string,match:Row,range:RangeOptions,orderBy:string,keyCols:readonly string[]):Promise<Row[]>{
 const seen=new Set<string>(),out:Row[]=[];
 let cursor:string|null=null;
 for(;;){
  const gte={...range.gte,...(cursor===null?{}:{[orderBy]:cursor})};
  const page=await tables.select(table,match,{...range,gte,orderBy,limit:MAX_PAGE});
  let added=0;
  for(const r of page){const k=keyCols.map(c=>String(r[c])).join('\u0000');if(!seen.has(k)){seen.add(k);out.push(r);added++;}}
  if(page.length===0||added===0)return out;
  cursor=String(page[page.length-1][orderBy]);
 }
}

const byFrom=(a:WindowRow,b:WindowRow)=>a.valid_from<b.valid_from?-1:a.valid_from>b.valid_from?1:0;

export function planWindowBackfill(rows:readonly WindowRow[],universe:ReadonlyMap<string,UniverseDates>,asOf:string):WindowPlan{
 const byTicker=new Map<string,WindowRow[]>();
 for(const r of rows){const l=byTicker.get(r.ticker)??[];l.push(r);byTicker.set(r.ticker,l);}
 const plan:WindowPlan={changes:[],conflicts:[],unchanged:0,skipped:[]};
 for(const ticker of [...byTicker.keys()].sort()){
  const list=[...byTicker.get(ticker)!].sort(byFrom);
  const u=universe.get(ticker);
  if(!u){plan.skipped.push('not_in_universe');continue;}
  const first=list[0],last=list[list.length-1];
  let firstFrom=first.valid_from;
  if(u.list_date===null)plan.skipped.push('no_list_date');
  else if(first.valid_from_method==='listing_date')plan.unchanged++;
  else if(first.valid_from_method!=='first_observed'&&first.valid_from_method!=='curated')plan.skipped.push(`method_${first.valid_from_method}`);
  else if(u.list_date>first.valid_from)plan.conflicts.push({row:first,reason:'list_date_after_first_observed',detail:{list_date:u.list_date,valid_from:first.valid_from,source:u.source}});
  else{
   const provenance=sanitizeProvenance({valid_from:{source:'stocks_universe.list_date',provider:u.source,as_of:asOf,row:{list_date:u.list_date,source:u.source,source_updated_at:u.source_updated_at}}});
   firstFrom=u.list_date;
   plan.changes.push({kind:'from',row:first,newValidFrom:firstFrom,provenance});
  }
  if(u.delist_date!==null&&last.valid_to===null){
   const vf=last===first?firstFrom:last.valid_from;
   if(u.delist_date<=vf)plan.conflicts.push({row:last,reason:'delist_on_or_before_valid_from',detail:{delist_date:u.delist_date,valid_from:vf,source:u.source}});
   else plan.changes.push({kind:'to',row:last,validFrom:vf,newValidTo:u.delist_date,provenance:sanitizeProvenance({valid_to:{source:'stocks_universe.delist_date',provider:u.source,as_of:asOf,row:{delist_date:u.delist_date,source:u.source,source_updated_at:u.source_updated_at}}})});
  }
 }
 plan.skipped.sort();
 return plan;
}

/** Freshness/exit policy of the window backfill: rows moved by a backfill (versioned) are landed rows, so a partial run that backfilled and only quarantined conflicts is still a good attempt. */
export function windowsOutcome(status:BatchStatus,counts:BatchCounts):{ok:boolean;exitCode:0|1}{
 return loaderOutcome(status,{...counts,duplicates:counts.duplicates+counts.versioned});
}

export async function applyWindowBackfill(tables:TableClient,plan:WindowPlan,opts:{batchId:string;dataset:string}):Promise<ApplyResult>{
 const counts=emptyCounts();const errors:BatchError[]=[];
 counts.duplicates=plan.unchanged;
 const idOf=(r:WindowRow)=>`${r.issuer_id}|${r.ticker}|${r.valid_from}`;
 // a row's CURRENT valid_from (its natural key), which moves when its backdate lands
 const current=new Map<string,string>();
 const fromOf=(r:WindowRow)=>current.get(idOf(r))??r.valid_from;
 const keyOf=(r:WindowRow)=>`${r.ticker}:${fromOf(r)}`;
 const snapshot=(r:WindowRow)=>({issuer_id:r.issuer_id,ticker:r.ticker,valid_from:r.valid_from,valid_to:r.valid_to,valid_from_method:r.valid_from_method,current_valid_from:fromOf(r)});
 const park=(r:WindowRow,reason:'ownership_conflict'|'window_evidence_conflict',detail:Record<string,unknown>)=>parkConflict(tables,{
  dataset:opts.dataset,table:'issuer_securities',naturalKey:keyOf(r),reasonCode:reason,detail,payload:snapshot(r),batchId:opts.batchId,
 },counts,errors,{code:reason,key:keyOf(r)});
 const blocked=new Set<string>();
 for(const c of plan.changes){
  const id=idOf(c.row);
  if(c.kind==='to'&&blocked.has(id)){counts.failed++;errors.push({code:'blocked_by_from_change',key:keyOf(c.row)});continue;}
  try{
   const out=await callRpc(tables,'set_security_window',c.kind==='from'
    ?{p_issuer:c.row.issuer_id,p_ticker:c.row.ticker,p_valid_from:c.row.valid_from,p_side:'from',p_new_date:c.newValidFrom,p_provenance:c.provenance}
    :{p_issuer:c.row.issuer_id,p_ticker:c.row.ticker,p_valid_from:c.validFrom,p_side:'to',p_new_date:c.newValidTo,p_provenance:c.provenance});
   if(out==='written'||out==='duplicate'){
    if(c.kind==='from')current.set(id,c.newValidFrom);
    if(out==='written')counts.versioned++;else counts.duplicates++;
    continue;
   }
   if(c.kind==='from')blocked.add(id);
   counts.failed++;errors.push({code:'row_changed',key:keyOf(c.row),message:`${c.kind}:${String(out)}`});
  }catch(e){
   if(c.kind==='from')blocked.add(id);
   if(isUnique(e)){await park(c.row,'ownership_conflict',{reason:'window_overlaps_other_row',change:c.kind,new_value:c.kind==='from'?c.newValidFrom:c.newValidTo});continue;}
   counts.failed++;errors.push({code:'window_write_error',key:keyOf(c.row),message:errorMessage(e)});
  }
 }
 // one quarantine item per row, carrying every conflict reason and its evidence row
 const byRow=new Map<string,WindowConflict[]>();
 for(const x of plan.conflicts){const l=byRow.get(idOf(x.row))??[];l.push(x);byRow.set(idOf(x.row),l);}
 for(const xs of byRow.values())await park(xs[0].row,'window_evidence_conflict',{reason:xs[0].reason,reasons:xs.map(x=>x.reason),conflicts:xs.map(x=>({reason:x.reason,...x.detail}))});
 counts.fetched=counts.inserted+counts.duplicates+counts.versioned+counts.quarantined+counts.failed;
 const skippedSummary:Record<string,number>={};
 for(const s of plan.skipped)skippedSummary[s]=(skippedSummary[s]??0)+1;
 return {counts,errors:withSkippedSummary(errors,skippedSummary),skippedSummary,rejectedSummary:{}};
}
/**
 * Evidenced holding windows (spec §4.3.2): earliest row per ticker → stocks_universe.list_date,
 * latest open row → delist_date; conflicts are quarantined. A-share and HK universe rows only
 * (US carries no list_date).
 *   npx tsx scripts/entity-keys/backfill-windows.ts [--apply]
 * Dry run (default): prints the plan, writes nothing. --apply records an ingest batch (dataset
 * entities.windows) and a freshness attempt.
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
import {selectAll,supabaseTableClient,type TableClient} from '../../src/lib/db/table-client';
import {emptyCounts,finishBatch,startBatch,type BatchError,type BatchStatus} from '../../src/lib/dq/batches';
import {DATASETS,DQ_DATASET_INVENTORY} from '../../src/lib/dq/datasets';
import {recordAttempt} from '../../src/lib/dq/freshness';
import {errorMessage} from '../../src/lib/entities/load-sec';
import {SEC_ROW_KEY,WINDOWS_RULES_VERSION,applyWindowBackfill,keysetAll,planWindowBackfill,windowsOutcome,type UniverseDates,type WindowRow} from '../../src/lib/entities/windows';
import {getAdminSupabase} from '../../src/lib/supabase/admin';

const DATASET=DATASETS.entities.windows;
const cadenceOf=(dataset:string)=>{const e=DQ_DATASET_INVENTORY.find(x=>x.dataset===dataset);if(!e)throw new Error(`unregistered_dataset:${dataset}`);return e.cadence;};
const str=(v:unknown)=>typeof v==='string'&&v!==''?v:null;

async function load(tables:TableClient){
 const rows:WindowRow[]=(await keysetAll(tables,'issuer_securities',{},{},'ticker',SEC_ROW_KEY)).map(r=>({
  issuer_id:String(r.issuer_id),ticker:String(r.ticker),valid_from:String(r.valid_from),valid_to:str(r.valid_to),
  valid_from_method:String(r.valid_from_method),valid_to_method:str(r.valid_to_method),
  provenance:(r.provenance&&typeof r.provenance==='object'?r.provenance:{}) as Record<string,unknown>,
 }));
 const universe=new Map<string,UniverseDates>();
 for(const market of ['A','HK'])for(const r of await selectAll(tables,'stocks_universe',{market},'ticker'))
  universe.set(String(r.ticker),{ticker:String(r.ticker),list_date:str(r.list_date),delist_date:str(r.delist_date),source:str(r.source),source_updated_at:str(r.source_updated_at)});
 return {rows:rows.filter(r=>universe.has(r.ticker)),universe};
}

async function main(){
 const argv=process.argv.slice(2);
 if(argv.some(a=>a!=='--apply')){console.error('usage: backfill-windows.ts [--apply]');process.exit(2);}
 const tables=supabaseTableClient(getAdminSupabase());
 const asOf=new Date().toISOString().slice(0,10);
 if(!argv.includes('--apply')){
  const {rows,universe}=await load(tables);
  const plan=planWindowBackfill(rows,universe,asOf);
  console.log(JSON.stringify({mode:'dry-run (nothing written; pass --apply)',rows:rows.length,
   changes:{from:plan.changes.filter(c=>c.kind==='from').length,to:plan.changes.filter(c=>c.kind==='to').length},
   conflicts:plan.conflicts.length,unchanged:plan.unchanged,firstConflicts:plan.conflicts.slice(0,10).map(c=>({ticker:c.row.ticker,valid_from:c.row.valid_from,reason:c.reason}))},null,1));
  return;
 }
 const {batchId}=await startBatch(tables,{producer:'backfill-windows',dataset:DATASET,toolVersions:{rules:WINDOWS_RULES_VERSION,as_of:asOf}});
 let counts=emptyCounts(),errors:BatchError[]=[],status:BatchStatus='failed';
 try{
  const {rows,universe}=await load(tables);
  ({counts,errors}=await applyWindowBackfill(tables,planWindowBackfill(rows,universe,asOf),{batchId,dataset:DATASET}));
 }catch(e){errors=[...errors,{code:'exception',message:errorMessage(e)}];}
 finally{
  try{status=await finishBatch(tables,batchId,{counts,errors});}
  catch(e){console.error(`finishBatch failed: ${errorMessage(e)}`);status='failed';}
 }
 const outcome=windowsOutcome(status,counts);
 await recordAttempt(tables,DATASET,{ok:outcome.ok,cadence:cadenceOf(DATASET)});
 console.log(JSON.stringify({batchId,status,counts,errors:errors.slice(0,20)},null,1));
 process.exitCode=outcome.exitCode;
}
main().catch(e=>{console.error(errorMessage(e));process.exit(1);});
revoke execute on function public.set_security_identifier(uuid, text, date, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.set_security_identifier(uuid, text, date, text, text, jsonb) to service_role;

-- ---------------------------------------------------------------- guarded evidenced-window write (Task 5a)
-- set_security_window is the only writer of an evidenced valid_from / valid_to (windows.ts, backfill-windows).
-- Lock order of set_security_identifier / resolve_identifier_claim: issuer FOR SHARE, then the row FOR UPDATE.
-- p_side 'from': the row (issuer, ticker, p_valid_from) must still have method first_observed or curated and
--   p_new_date <= valid_from and no other row of the ticker starting earlier; ONE UPDATE sets valid_from = p_new_date, valid_from_method = 'listing_date'.
-- p_side 'to': the row (issuer, ticker, p_valid_from) must still be open and p_new_date > valid_from; ONE UPDATE
--   sets valid_to, valid_to_method = 'delisting'.
-- Both merge `provenance || p_provenance` (never a whole-object replacement); p_provenance must be public-safe
-- (claim_provenance_safe) and hold exactly the key valid_from / valid_to matching p_side.
-- Outcomes: 'written', 'duplicate' (already evidenced at p_new_date with the key present), 'conflict' (state moved
-- or date rule violated; nothing written), 'not_found'. Exclusion / unique violations (23P01 / 23505) pass through.
create or replace function public.set_security_window(p_issuer uuid, p_ticker text, p_valid_from date, p_side text, p_new_date date, p_provenance jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare v_row public.issuer_securities%rowtype; n int;
begin
  if p_side is null or p_side not in ('from', 'to') or p_new_date is null or p_ticker is null or p_valid_from is null
     or p_provenance is null or jsonb_typeof(p_provenance) <> 'object'
     or (select array_agg(k) from jsonb_object_keys(p_provenance) k) is distinct from array['valid_' || p_side]
     or not public.claim_provenance_safe(p_provenance) then
    raise exception 'invalid_window_write' using errcode = '22023';
  end if;
  perform 1 from public.issuers where issuer_id = p_issuer for share;
  if not found then return 'not_found'; end if;
  select * into v_row from public.issuer_securities s
  where s.issuer_id = p_issuer and s.ticker = p_ticker and s.valid_from = p_valid_from for update;
  if not found then return 'not_found'; end if;
  if p_side = 'from' then
    if v_row.valid_from_method = 'listing_date' and v_row.valid_from = p_new_date and v_row.provenance ? 'valid_from' then return 'duplicate'; end if;
    if v_row.valid_from_method not in ('first_observed', 'curated') or p_new_date > v_row.valid_from then return 'conflict'; end if;
    -- the listing date belongs to the ticker's EARLIEST holding row: serialise window writers per ticker, then recheck
    -- that no other row (any issuer) of the ticker starts earlier (an earlier non-overlapping holding appeared since planning).
    -- Overlaps themselves are refused by the no-overlap exclusion constraint (23P01), not here.
    perform pg_advisory_xact_lock(hashtext('issuer_securities_ticker:' || p_ticker));
    if exists (select 1 from public.issuer_securities o where o.ticker = p_ticker and o.valid_from < p_valid_from) then return 'conflict'; end if;
    update public.issuer_securities set valid_from = p_new_date, valid_from_method = 'listing_date', provenance = provenance || p_provenance
    where issuer_id = p_issuer and ticker = p_ticker and valid_from = p_valid_from and valid_from_method in ('first_observed', 'curated');
  else
    if v_row.valid_to = p_new_date and v_row.valid_to_method = 'delisting' and v_row.provenance ? 'valid_to' then return 'duplicate'; end if;
    if v_row.valid_to is not null or p_new_date <= v_row.valid_from then return 'conflict'; end if;
    update public.issuer_securities set valid_to = p_new_date, valid_to_method = 'delisting', provenance = provenance || p_provenance
    where issuer_id = p_issuer and ticker = p_ticker and valid_from = p_valid_from and valid_to is null;
  end if;
  get diagnostics n = row_count;
  if n <> 1 then return 'conflict'; end if;
  return 'written';
end $$;
revoke execute on function public.set_security_window(uuid, text, date, text, date, jsonb) from public, anon, authenticated;
grant execute on function public.set_security_window(uuid, text, date, text, date, jsonb) to service_role;

-- ---------------------------------------------------------------- guarded issuer identifier write (Task 4b review, P1)
-- set_issuer_identifier is the only writer of issuers.cninfo_org_id outside resolve_identifier_claim
-- (cninfo-org-id.ts). It locks the issuer row FOR NO KEY UPDATE (the order and lock level of
-- resolve_identifier_claim), requires status 'active' and, in ONE UPDATE, writes the column (only when
supabase/migrations/20261107090000_identifiers_and_dq.sql:    perform pg_advisory_xact_lock(hashtext('issuer_securities_ticker:' || p_ticker));
scripts/entity-keys/coverage.ts:import {SEC_ROW_KEY,keysetAll} from '../../src/lib/entities/windows';
scripts/entity-keys/coverage.ts: const rows=await keysetAll(tables,'issuer_securities',{},{},'ticker',SEC_ROW_KEY);
scripts/entity-keys/coverage.ts: const queue=new Set((await keysetAll(tables,'research_entity_keys',{in_scope:true},{},'entity_id',['user_id','entity_id'])).map(r=>r.issuer_id).filter((v):v is string=>typeof v==='string'));
scripts/entity-keys/backfill-windows.ts:import {SEC_ROW_KEY,WINDOWS_RULES_VERSION,applyWindowBackfill,keysetAll,planWindowBackfill,windowsOutcome,type UniverseDates,type WindowRow} from '../../src/lib/entities/windows';
scripts/entity-keys/backfill-windows.ts: const rows:WindowRow[]=(await keysetAll(tables,'issuer_securities',{},{},'ticker',SEC_ROW_KEY)).map(r=>({
src/lib/entities/windows.ts:export async function keysetAll(tables:TableClient,table:string,match:Row,range:RangeOptions,orderBy:string,keyCols:readonly string[]):Promise<Row[]>{
src/lib/entities/issuers.integration.test.ts:  await expect(sec(b,us,'2020-01-01',null)).rejects.toThrow(/issuer_securities_ticker_valid_from_key/);
src/lib/entities/issuers.integration.test.ts:  await expect(sec(a,'ZZNOPE'+hex(4),'2020-01-01',null)).rejects.toThrow(/issuer_securities_ticker_fkey/);
src/lib/entities/issuers.integration.test.ts:  await expect(admin.query(`delete from public.stocks_universe where ticker=$1`,[cn])).rejects.toThrow(/issuer_securities_ticker_fkey/);
src/lib/entities/backfill-windows.test.ts:import {applyWindowBackfill,keysetAll,planWindowBackfill,windowsOutcome,type UniverseDates,type WindowRow} from './windows';
src/lib/entities/backfill-windows.test.ts: it('keysetAll continues past a short page when the server caps pages below MAX_PAGE',async()=>{
src/lib/entities/backfill-windows.test.ts:  const got=await keysetAll(capped,'t',{},{},'ticker',['issuer_id','ticker','valid_from']);
src/lib/entities/backfill-windows.test.ts:  expect(await keysetAll(capped,'empty',{},{},'ticker',['ticker'])).toEqual([]);
src/lib/entities/identifiers.integration.test.ts:   await tx.c.query(`select pg_advisory_xact_lock(hashtext('issuer_securities_ticker:'||$1::text))`,[t2]);
src/lib/facts/scope.ts:async function keysetAll(tables:TableClient,table:string,match:Row,range:RangeOptions,orderBy:string,keyCols:string[]):Promise<Row[]>{
src/lib/facts/scope.ts: const ending=await keysetAll(tables,'issuer_securities',{},{gte:{valid_to:today}},'ticker',SEC_KEY);
src/lib/facts/scope.ts: const keys=await keysetAll(tables,'research_entity_keys',{in_scope:true},{},'entity_id',['user_id','entity_id']);
src/lib/facts/scope.ts: const secs=market==='CN'?(await keysetAll(tables,'issuer_securities',{issuer_id:issuerId},{},'ticker',SEC_KEY)).filter(r=>isCurrentSecurity(r,today)):[];   // DB errors propagate
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

exec
/bin/zsh -lc "cat /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; cat scripts/entity-keys/coverage.ts; rg -n 'function loaderOutcome|function parkConflict' src/lib/entities/load-sec.ts; ls -a | head -30; cat package.json | head -65; for p in /AGENTS.md /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md; do test "'! -f "$p" || cat "$p"; done' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>/**
 * Success-criteria measurements (spec §1.1). Read-only.
 *   npx tsx scripts/entity-keys/coverage.ts [--segment e1|windows|all] [--out <file.md>]
 * E1: FIGI/ISIN coverage of open security rows of US in-scope issuers (targets 95% / 90%).
 * windows (E2): research-queue A/H rows — backfillable rows at listing_date (target 100%), with the
 * non-backfillable and open-quarantine counts reported separately. The research queue is
 * research_entity_keys with in_scope = true and a linked issuer_id (Part B contract issue 10).
 * --out writes a markdown table (e.g. docs/audits/2026-11-05-data-foundation-3/coverage-<date>.md).
 */
import {writeFileSync} from 'node:fs';
import {selectAll,supabaseTableClient,type TableClient} from '../../src/lib/db/table-client';
import {DATASETS} from '../../src/lib/dq/datasets';
import {coverageE1,coverageE2,type E1Result,type E2Result} from '../../src/lib/entities/coverage';
import {errorMessage} from '../../src/lib/entities/load-sec';
import {SEC_ROW_KEY,keysetAll} from '../../src/lib/entities/windows';
import {getAdminSupabase} from '../../src/lib/supabase/admin';

const USAGE='usage: coverage.ts [--segment e1|windows|all] [--out <file.md>]';
function args(argv:string[]){
 let segment='all',out:string|null=null;
 for(let i=0;i<argv.length;i++){
  if(argv[i]==='--segment')segment=argv[++i]??'';
  else if(argv[i]==='--out')out=argv[++i]??'';
  else{console.error(USAGE);process.exit(2);}
 }
 if(!['e1','windows','all'].includes(segment)||out===''){console.error(USAGE);process.exit(2);}
 return {segment,out};
}

async function e1(tables:TableClient){
 return coverageE1({
  scope:await selectAll(tables,'fact_sync_scope',{market:'US'},'issuer_id'),
  securities:await selectAll(tables,'issuer_securities',{valid_to:null},'ticker'),
  issuers:await selectAll(tables,'issuers',{},'issuer_id'),
 });
}
async function windows(tables:TableClient){
 const rows=await keysetAll(tables,'issuer_securities',{},{},'ticker',SEC_ROW_KEY);
 const listDates=new Map<string,string|null>();
 for(const market of ['A','HK'])for(const r of await selectAll(tables,'stocks_universe',{market},'ticker'))listDates.set(String(r.ticker),typeof r.list_date==='string'?r.list_date:null);
 const queue=new Set((await keysetAll(tables,'research_entity_keys',{in_scope:true},{},'entity_id',['user_id','entity_id'])).map(r=>r.issuer_id).filter((v):v is string=>typeof v==='string'));
 const open=await selectAll(tables,'dq_quarantine',{status:'open',dataset:DATASETS.entities.windows},'id');
 const keys=new Set(open.filter(q=>q.reason_code==='window_evidence_conflict'||q.reason_code==='ownership_conflict').map(q=>String(q.natural_key)));
 return coverageE2({rows,listDates,queueIssuers:queue,openQuarantineKeys:keys});
}
const md=(at:string,a:E1Result|null,b:E2Result|null)=>[
 `# 覆盖度量（${at}）`,'',
 ...(a?['## E1 · 标识符覆盖','','| 指标 | 分子 | 分母 | 百分比 | 目标 | 达标 |','|---|---|---|---|---|---|',
  `| FIGI（美股范围发行人未关闭行） | ${a.figi.num} | ${a.figi.den} | ${a.figi.pct??'—'} | 95% | ${a.passes.figi?'是':'否'} |`,
  `| ISIN（其中发行人有 LEI 的行） | ${a.isin.num} | ${a.isin.den} | ${a.isin.pct??'—'} | 90% | ${a.passes.isin?'是':'否'} |`,'']:[]),
 ...(b?['## E2 · 持有区间（研究队列 A/H 行）','','| 指标 | 值 |','|---|---|',
  `| 可回填行中 listing_date | ${b.backfillable.num} / ${b.backfillable.den}（${b.backfillable.pct??'—'}%，目标 100%，${b.passes?'达标':'未达标'}） |`,
  `| 不可回填行 | ${b.not_backfillable} |`,`| open 隔离项（window_evidence_conflict / ownership_conflict） | ${b.open_quarantine} |`,'']:[]),
].join('\n');

async function main(){
 const {segment,out}=args(process.argv.slice(2));
 const tables=supabaseTableClient(getAdminSupabase());
 const at=new Date().toISOString();
 const a=segment==='windows'?null:await e1(tables);
 const b=segment==='e1'?null:await windows(tables);
 console.log(JSON.stringify({at,e1:a,windows:b},null,1));
 if(out)writeFileSync(out,md(at,a,b));
}
main().catch(e=>{console.error(errorMessage(e));process.exit(1);});
88:export function loaderOutcome(status:BatchStatus,counts:BatchCounts,rejected:Record<string,number>={}):{ok:boolean;exitCode:0|1}{
98:export async function parkConflict(client:TableClient,input:QuarantineInput,counts:BatchCounts,errors:BatchError[],error:BatchError):Promise<void>{
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

codex
The pagination change can silently return incomplete data where the previous implementation raised an error, affecting backfills and coverage measurements.

Review comment:

- [P2] Fail closed when a cursor tie group fills the page — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/entities/windows.ts:40-41
  When one order value fills the server's page cap, the inclusive cursor repeats that page and `added === 0` returns successfully even if later values remain. For example, with a cap of 3, rows ordered as A,A,A,B return only the A rows. This replaces the previous overflow error with silent truncation. Besides security holdings, `scripts/entity-keys/coverage.ts` uses this helper for research keys ordered by `entity_id`, where multiple users can share an entity, so the coverage report can silently omit later issuers. Preserve an explicit overflow failure or implement pagination that advances through ties rather than treating no unseen rows as proof of exhaustion.
The pagination change can silently return incomplete data where the previous implementation raised an error, affecting backfills and coverage measurements.

Review comment:

- [P2] Fail closed when a cursor tie group fills the page — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/entities/windows.ts:40-41
  When one order value fills the server's page cap, the inclusive cursor repeats that page and `added === 0` returns successfully even if later values remain. For example, with a cap of 3, rows ordered as A,A,A,B return only the A rows. This replaces the previous overflow error with silent truncation. Besides security holdings, `scripts/entity-keys/coverage.ts` uses this helper for research keys ordered by `entity_id`, where multiple users can share an entity, so the coverage report can silently omit later issuers. Preserve an explicit overflow failure or implement pagination that advances through ties rather than treating no unseen rows as proof of exhaustion.

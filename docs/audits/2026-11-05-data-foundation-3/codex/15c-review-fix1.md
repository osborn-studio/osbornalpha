OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b149-55ce-7f70-b12e-7ed3961a15bd
--------
user
commit f4854e1
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat f4854e1; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 1321ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-uAZyC8AL' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-r78c3On6' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/15c-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/15c-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/15c-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-iTFnTODL' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-kHUfkJan' (errno=Operation not permitted)
commit f4854e1530d78e504e8a091022df6fd6213f16e0
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 06:35:24 2026 -0800

    test(dq): independent key-set check, lineage lock order, stricter 15c assertions
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

 src/lib/dq/dq-extensions.integration.test.ts        |  1 +
 src/lib/dq/reconcile/ixbrl-pair.integration.test.ts | 17 ++++++++++++-----
 src/lib/dq/reconcile/lineage.integration.test.ts    |  1 +
 3 files changed, 14 insertions(+), 5 deletions(-)

exec
/bin/zsh -lc 'pwd; for p in /AGENTS.md /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do if [ -f "$p" ]; then echo "$p"; cat "$p"; fi; done; git show f4854e1 --; cat src/lib/dq/reconcile/ixbrl-pair.integration.test.ts; cat src/lib/dq/reconcile/lineage.integration.test.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-BuZ6AelO' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-pKjtGsAK' (errno=Operation not permitted)
commit f4854e1530d78e504e8a091022df6fd6213f16e0
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 06:35:24 2026 -0800

    test(dq): independent key-set check, lineage lock order, stricter 15c assertions
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/dq/dq-extensions.integration.test.ts b/src/lib/dq/dq-extensions.integration.test.ts
index 64a10fce..c85e4a21 100644
--- a/src/lib/dq/dq-extensions.integration.test.ts
+++ b/src/lib/dq/dq-extensions.integration.test.ts
@@ -919,6 +919,7 @@ describe.skipIf(!enabled)('F3-4 facts extensions migration on real PostgreSQL',(
   const lid=()=>`${LINEAGE}-${randomUUID().slice(0,8)}`;
   /** inside a rolled-back transaction only: no running lineage cycle from another suite, plus a "latest" row set_merge writes to */
   const lineageStage=async(c:PoolClient,pending:unknown[])=>{
+   await c.query(`select pg_advisory_xact_lock(hashtext('dq_reconcile_cycle:'||$1))`,[LINEAGE]);   // pair cycle lock FIRST, then cycle rows (same order as the runner / open_reconcile_cycle; avoids deadlock with the real lineage pair run in lineage.integration.test.ts)
    await c.query(`update public.dq_reconcile_cycles set status='complete', finished_at=now() where pair=$1 and status='running'`,[LINEAGE]);
    const id=`${LINEAGE}-old-${randomUUID().slice(0,8)}`;
    await c.query(`insert into public.dq_reconcile_cycles(pair,cycle_id,started_at,finished_at,members,status,expected_total,detail) values($1,$2,now()+interval '100 years',now()+interval '100 years','[]','complete',0,$3::jsonb)`,[LINEAGE,id,JSON.stringify({pending_members:pending})]);
diff --git a/src/lib/dq/reconcile/ixbrl-pair.integration.test.ts b/src/lib/dq/reconcile/ixbrl-pair.integration.test.ts
index bcfb5c96..c1c21eb2 100644
--- a/src/lib/dq/reconcile/ixbrl-pair.integration.test.ts
+++ b/src/lib/dq/reconcile/ixbrl-pair.integration.test.ts
@@ -34,7 +34,7 @@ import {inputsHashNow} from './pairs';
 import {runReconcile} from './run';
 import type {ReconcileDeps} from './run';
 import type {PairContext} from './types';
-import {US_SAMPLE_PATH,buildSampleFiling} from './us-sample';
+import {US_SAMPLE_PATH,buildSampleFiling,usNaturalKey} from './us-sample';
 import type {UsSample} from './us-sample';
 
 const enabled=!!process.env.S4_TEST_STATE;
@@ -100,7 +100,7 @@ describe.skipIf(!enabled)('us.companyfacts_vs_ixbrl on real PostgreSQL (§9.3)',
   return enc(JSON.stringify({...v1,issuers:[...issuers,{cik:ZZ.cik,ticker:ZZ.ticker,regime:'10-K',filings:[zz]}]}));
  }
  const revFactId=async()=>(await q(`select fact_id from public.financial_facts where issuer_id=$1 and concept='revenue'`,[ids.ZZ]))[0].fact_id as string;
- const zzItem=async()=>(await q(`select id,status,dataset,detail,payload from public.dq_quarantine where reason_code='reconcile_mismatch' and detail->>'pair'=$1 and payload->'fact_ids'->>0=$2`,[PAIR,await revFactId()]))[0] as {id:string;status:string;dataset:string;detail:Record<string,any>;payload:Record<string,any>};
+ const zzItem=async()=>{const r=await q(`select id,status,dataset,detail,payload from public.dq_quarantine where reason_code='reconcile_mismatch' and detail->>'pair'=$1 and payload->'fact_ids'->>0=$2`,[PAIR,await revFactId()]);expect(r).toHaveLength(1);return r[0] as {id:string;status:string;dataset:string;detail:Record<string,any>;payload:Record<string,any>};};
  const netMargin=async()=>(await db.metricsOfIssuer(ids.ZZ,'US',FORMULA_VERSION)).find(m=>m.metric==='net_margin'&&m.duration==='12M');
 
  beforeAll(async()=>{
@@ -120,6 +120,7 @@ describe.skipIf(!enabled)('us.companyfacts_vs_ixbrl on real PostgreSQL (§9.3)',
   ids.ZZ=await provision(ZZ.ticker,ZZ.cik,ZZ.name);fixtures.set(ZZ.cik.padStart(10,'0'),zzCompanyfacts());
   scope=Object.entries(ids).map(([t,id])=>({issuer_id:id,fetch_key:(t==='ZZ'?ZZ.cik:rekeyCik(REAL.find(r=>r.ticker===t)!.cik)).padStart(10,'0')}));
   await db.reconcileScope('US',scope.map(x=>({...x,reasons:['test'],priority:10})));
+  // isolation rests on issuerIds filtering in runFactsSync and priority 0 / no reasons after the suite (a sync's lease release overwrites next_due_at)
   await q(`update public.fact_sync_scope set next_due_at='2999-01-01' where issuer_id = any($1::uuid[])`,[Object.values(ids)]);
   const deps:SyncDeps={db,tables,storage:memorySnapshotStore(),
    fetchUs:async(cik10:string):Promise<RawSnapshot>=>{const b=fixtures.get(cik10);if(!b)throw new ProviderError('no_companyfacts',cik10);return snapshotOf(b,{source:'edgar',url:companyFactsUrl(cik10)});},
@@ -151,6 +152,12 @@ describe.skipIf(!enabled)('us.companyfacts_vs_ixbrl on real PostgreSQL (§9.3)',
   expect(r1.members.every(m=>m.outcome==='done')).toBe(true);
   const rows=await q(`select natural_key,outcome,passed,issuer_id from public.dq_reconciliations where pair=$1 and cycle_id=$2`,[PAIR,firstCycle]) as {natural_key:string;outcome:string;passed:boolean;issuer_id:string}[];
   expect(rows.length).toBe(r1.cycle!.expectedTotal);
+  // independent derivation: the complete (natural key → owning issuer) set from the injected, re-keyed manifest
+  const injected=JSON.parse(new TextDecoder().decode(sampleBytes)) as UsSample;
+  const ownerOf=(cik:string)=>cik===ZZ.cik?ids.ZZ:ids[REAL.find(r=>rekeyCik(r.cik)===cik)!.ticker];
+  const expectedPairs=injected.issuers.flatMap(i=>i.filings.flatMap(f=>f.expected_keys.map(k=>`${usNaturalKey(i.cik,f.accn,k)}@${ownerOf(i.cik)}`))).sort();
+  expect(expectedPairs.length).toBeGreaterThan(0);
+  expect(rows.map(r=>`${r.natural_key}@${r.issuer_id}`).sort()).toEqual(expectedPairs);
   expect(new Set(rows.map(r=>r.natural_key)).size).toBe(rows.length);
   const byKey=(a:{natural_key:string},b:{natural_key:string})=>a.natural_key<b.natural_key?-1:1;
   const realFailures=rows.filter(r=>r.issuer_id!==ids.ZZ&&!r.passed).map(r=>({natural_key:unkey(r.natural_key),outcome:r.outcome==='compared'?'compared_failed':r.outcome})).sort(byKey);
@@ -167,9 +174,9 @@ describe.skipIf(!enabled)('us.companyfacts_vs_ixbrl on real PostgreSQL (§9.3)',
   const visible=await db.readFacts(ids.ZZ,'US',{concepts:['revenue'],asOf:today()});
   expect(visible.rows.filter(r=>r.period_end==='2024-12-31')).toEqual([]);
   expect(await netMargin()).toBeUndefined();
-  const [rev]=await db.stateRevs([ids.ZZ],'US');
-  const metric=(await db.metricsOfIssuer(ids.ZZ,'US',FORMULA_VERSION))[0];
-  if(metric)expect(metric.based_on_lineage).toEqual([{issuer_id:ids.ZZ,state_rev:rev.state_rev}]);
+  const metrics=await db.metricsOfIssuer(ids.ZZ,'US',FORMULA_VERSION);
+  // the quarantine hook rematerialized: without revenue no metric of ZZ is left (net_margin was present before)
+  expect(metrics).toEqual([]);
  },300_000);
 
  it('restore is refused while the latest result is not passing',async()=>{
diff --git a/src/lib/dq/reconcile/lineage.integration.test.ts b/src/lib/dq/reconcile/lineage.integration.test.ts
index 28b94926..fe3ad682 100644
--- a/src/lib/dq/reconcile/lineage.integration.test.ts
+++ b/src/lib/dq/reconcile/lineage.integration.test.ts
@@ -55,6 +55,7 @@ describe.skipIf(!enabled)('facts.lineage_same_day on real PostgreSQL (§9.3)',()
   };
   s=await provision(S);t=await provision(T);
   await db.reconcileScope('US',[{issuer_id:s,reasons:['test'],priority:10,fetch_key:S.cik.padStart(10,'0')},{issuer_id:t,reasons:['test'],priority:10,fetch_key:T.cik.padStart(10,'0')}]);
+  // isolation rests on issuerIds filtering in runFactsSync and priority 0 / no reasons after the suite (a sync's lease release overwrites next_due_at)
   await q(`update public.fact_sync_scope set next_due_at='2999-01-01' where issuer_id = any($1::uuid[])`,[[s,t]]);
   const bytes=new Map([[S.cik.padStart(10,'0'),doc(S,false)],[T.cik.padStart(10,'0'),doc(T,true)]]);
   const sync=await runFactsSync({db,tables,storage:memorySnapshotStore(),
// src/lib/dq/reconcile/ixbrl-pair.integration.test.ts
// Spec §9.3 (critical): us.companyfacts_vs_ixbrl on real PostgreSQL with pgFactsDb + pgTableClient.
//  1. AAPL and MSFT FY2023 10-K fixtures (plan-2 companyfacts + recorded trimmed primary documents, re-keyed onto
//     synthetic CIKs/accessions) are synced and reconciled: every expected key has exactly one result row and
//     every key passes except the registered, explained exceptions (us-ixbrl-sample-v1.exceptions.json);
//  2. a synthetic issuer ZQZZ whose companyfacts revenue is injected (1001 vs the document's 1000): mismatch →
//     reconcile_mismatch item + left quarantined (one transaction) → invisible to read_facts → materialized
//     metrics drop the dependent ratio;
//  3. restore before a passing re-run → not_passing;
//  4. the right document is corrected (1001), a new cycle passes, latest_result.passed with inputs_hash equal to
//     the restore-side recomputation; a changed sample or a changed / missing primary document after the pass
//     → not_passing / current_evidence_unavailable (plan audit P2); then restore_reconciled
//     promotes the row, it is current again and the metric comes back after materialize.
// The cases share state and run in order.
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {pgTableClient} from '../../db/pg-table-client';
import type {TableClient} from '../../db/table-client';
import {MAPPING_GEN} from '../../facts/concepts';
import {FORMULA_VERSION,materialize} from '../../facts/derive';
import {pgFactsDb} from '../../facts/pg-facts-db';
import {companyFactsUrl,parseCompanyFacts} from '../../facts/providers/edgar-companyfacts';
import {ProviderError,snapshotOf} from '../../facts/providers/shared';
import {memorySnapshotStore} from '../../facts/snapshot-store';
import {makeBudget,runFactsSync} from '../../facts/sync';
import type {SyncDeps} from '../../facts/sync';
import type {FactsDb,RawSnapshot} from '../../facts/types';
import {startBatch} from '../batches';
import {memoryRawStore} from '../raw-store';
import {usCompanyfactsVsIxbrlPair} from './pair-us-ixbrl';
import {inputsHashNow} from './pairs';
import {runReconcile} from './run';
import type {ReconcileDeps} from './run';
import type {PairContext} from './types';
import {US_SAMPLE_PATH,buildSampleFiling,usNaturalKey} from './us-sample';
import type {UsSample} from './us-sample';

const enabled=!!process.env.S4_TEST_STATE;
const PAIR='us.companyfacts_vs_ixbrl' as const;
const ADMIN=randomUUID();
const enc=(s:string)=>new TextEncoder().encode(s);
const today=()=>new Date().toISOString().slice(0,10);

// ---- identity re-keying (bijective; keeps this suite disjoint from sync-us.integration.test.ts) ----
const rekeyCik=(cik:string)=>`99${cik}`;
const rekeyAccn=(a:string)=>{if(!/^00\d{8}-\d{2}-\d{6}$/.test(a))throw new Error(`unexpected accession ${a}`);return `99${a.slice(2)}`;};
const unkey=(nk:string)=>nk.replace(/^99(\d+):99(\d{8}-\d{2}-\d{6})/,(_m,c:string,a:string)=>`${c}:00${a}`);
function rekeyCompanyfacts(path:string,cik:string):Uint8Array{
 let t=readFileSync(path,'utf8');
 t=t.replace(/"accn"(\s*):(\s*)"(\d{10}-\d{2}-\d{6})"/g,(_m,a:string,b:string,accn:string)=>`"accn"${a}:${b}"${rekeyAccn(accn)}"`);
 const before=t;t=t.replace(new RegExp(`"cik"(\\s*):(\\s*)${cik}\\b`),(_m,a:string,b:string)=>`"cik"${a}:${b}${rekeyCik(cik)}`);
 if(t===before)throw new Error(`cik ${cik} not found in ${path}`);
 return enc(t);
}
const rekeyDoc=(path:string,cik:string)=>enc(readFileSync(path,'utf8').replaceAll(`>${cik.padStart(10,'0')}<`,`>${rekeyCik(cik).padStart(10,'0')}<`));

const REAL=[
 {ticker:'ZQAA',cik:'320193',companyfacts:'src/lib/facts/fixtures/edgar/CIK0000320193.trimmed.json',doc:'src/lib/dq/fixtures/ixbrl/aapl-20230930.trimmed.htm'},
 {ticker:'ZQMS',cik:'789019',companyfacts:'src/lib/facts/fixtures/edgar/CIK0000789019.trimmed.json',doc:'src/lib/dq/fixtures/ixbrl/msft-20230630.trimmed.htm'},
] as const;
interface Exception{natural_key:string;outcome:string;explanation:string}
const EXCEPTIONS=JSON.parse(readFileSync('src/lib/dq/fixtures/gold/us-ixbrl-sample-v1.exceptions.json','utf8')) as Exception[];

// ---- synthetic issuer with an injected companyfacts value ----
const ZZ={ticker:'ZQZZ',cik:'9990003',name:'ZQ Reconcile Co'};
const ZZ_ACCN='0009990003-25-000001';
const ZZ_URL=`https://www.sec.gov/Archives/edgar/data/${ZZ.cik}/${ZZ_ACCN.replace(/-/g,'')}/zq-20241231.htm`;
const cfe=(start:string|undefined,end:string,val:number)=>({...(start?{start}:{}),end,val,accn:ZZ_ACCN,fy:2024,fp:'FY',form:'10-K',filed:'2025-02-15'});
const zzCompanyfacts=()=>enc(JSON.stringify({cik:Number(ZZ.cik),entityName:ZZ.name,facts:{'us-gaap':{
 Revenues:{units:{USD:[cfe('2024-01-01','2024-12-31',1001)]}},            // injected: the filed document says 1000
 NetIncomeLoss:{units:{USD:[cfe('2024-01-01','2024-12-31',100)]}},
 Assets:{units:{USD:[cfe(undefined,'2024-12-31',5000)]}},
 StockholdersEquity:{units:{USD:[cfe(undefined,'2024-12-31',2000)]}},
}}}));
const H='<html xmlns="http://www.w3.org/1999/xhtml" xmlns:ix="http://www.xbrl.org/2013/inlineXBRL" xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:iso4217="http://www.xbrl.org/2003/iso4217" xmlns:us-gaap="http://fasb.org/us-gaap/2024" xmlns:dei="http://xbrl.sec.gov/dei/2024">';
const zctx=(id:string,period:string)=>`<xbrli:context id="${id}"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">000${ZZ.cik}</xbrli:identifier></xbrli:entity><xbrli:period>${period}</xbrli:period></xbrli:context>`;
const znf=(name:string,c:string,v:string)=>`<ix:nonFraction name="us-gaap:${name}" contextRef="${c}" unitRef="usd">${v}</ix:nonFraction>`;
const zzDoc=(revenue:string)=>enc(`${H}<body><ix:header><ix:resources>${zctx('d','<xbrli:startDate>2024-01-01</xbrli:startDate><xbrli:endDate>2024-12-31</xbrli:endDate>')}${zctx('i','<xbrli:instant>2024-12-31</xbrli:instant>')}<xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit></ix:resources></ix:header>`
 +'<ix:nonNumeric name="dei:EntityFilerCategory" contextRef="d">Non-accelerated Filer</ix:nonNumeric>'
 +znf('Revenues','d',revenue)+znf('NetIncomeLoss','d','100')+znf('Assets','i','5,000')+znf('StockholdersEquity','i','2,000')+'</body></html>');

describe.skipIf(!enabled)('us.companyfacts_vs_ixbrl on real PostgreSQL (§9.3)',()=>{
 let admin:Pool;let db:FactsDb;let tables:TableClient;
 const ids:Record<string,string>={};
 const docs=new Map<string,Uint8Array>();
 let sampleBytes:Uint8Array=new Uint8Array();let firstCycle='';let scope:{issuer_id:string;fetch_key:string}[]=[];   // widened: buildSample returns Uint8Array (plan audit P10)
 const fakeFetch=(async(url:string|URL)=>{const b=docs.get(String(url));return b?new Response(new Uint8Array(b),{status:200}):new Response('',{status:404});}) as unknown as typeof fetch;   // owned copy = DOM BodyInit
 const readRepoFile=async(p:string)=>p===US_SAMPLE_PATH?sampleBytes:new Uint8Array(readFileSync(p));
 const rdeps=():ReconcileDeps=>({db,tables,raw:memoryRawStore(),fetch:fakeFetch,readRepoFile,now:()=>new Date(),deadline:null,codeVersion:'test',pairs:{[PAIR]:usCompanyfactsVsIxbrlPair()}});
 const pairCtx=(over:Partial<PairContext>={}):PairContext=>({db,tables,raw:memoryRawStore(),now:()=>new Date(),budget:makeBudget(null),fetch:fakeFetch,readRepoFile,...over});
 const q=(text:string,values:unknown[]=[])=>admin.query(text,values).then(r=>r.rows);
 function buildSample(zzRevenue:string):Uint8Array{
  const v1=JSON.parse(readFileSync(US_SAMPLE_PATH,'utf8')) as UsSample;
  const issuers=v1.issuers.filter(i=>REAL.some(r=>r.cik===i.cik)).map(i=>({...i,cik:rekeyCik(i.cik),
   filings:i.filings.map(f=>({...f,accn:rekeyAccn(f.accn),doc_url:f.doc_url.replace(`/data/${i.cik}/`,`/data/${rekeyCik(i.cik)}/`).replace(f.accn.replace(/-/g,''),rekeyAccn(f.accn).replace(/-/g,''))}))}));
  const zz=buildSampleFiling({cik:ZZ.cik,accn:ZZ_ACCN,form:'10-K',period_end:'2024-12-31',primary_document:'zq-20241231.htm',doc_url:ZZ_URL,is_inline_xbrl:true,submissions_category:'Non-accelerated filer',
   companyfacts:snapshotOf(zzCompanyfacts(),{source:'edgar'}),doc:zzDoc(zzRevenue),sinceYear:2016});
  return enc(JSON.stringify({...v1,issuers:[...issuers,{cik:ZZ.cik,ticker:ZZ.ticker,regime:'10-K',filings:[zz]}]}));
 }
 const revFactId=async()=>(await q(`select fact_id from public.financial_facts where issuer_id=$1 and concept='revenue'`,[ids.ZZ]))[0].fact_id as string;
 const zzItem=async()=>{const r=await q(`select id,status,dataset,detail,payload from public.dq_quarantine where reason_code='reconcile_mismatch' and detail->>'pair'=$1 and payload->'fact_ids'->>0=$2`,[PAIR,await revFactId()]);expect(r).toHaveLength(1);return r[0] as {id:string;status:string;dataset:string;detail:Record<string,any>;payload:Record<string,any>};};
 const netMargin=async()=>(await db.metricsOfIssuer(ids.ZZ,'US',FORMULA_VERSION)).find(m=>m.metric==='net_margin'&&m.duration==='12M');

 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  admin=new Pool({connectionString:state.adminUrl});db=pgFactsDb(admin);tables=pgTableClient(admin);
  expect((await q(`select count(*)::int as n from public.dq_reconcile_cycles where pair=$1 and status='running'`,[PAIR]))[0].n,'a foreign running cycle of this pair (contract note 14)').toBe(0);
  await q(`insert into auth.users(id,email) values($1,$2) on conflict (id) do nothing`,[ADMIN,`${ADMIN}@ixbrl.test`]);
  const provision=async(ticker:string,cik:string,name:string)=>{
   await q(`insert into public.stocks_universe(ticker,name,market) values($1,$2,'US') on conflict (ticker) do nothing`,[ticker,name]);
   await q(`insert into public.issuers(issuer_id,canonical_name_en,country_code,cik) values($1,$2,'US',$3) on conflict do nothing`,[randomUUID(),name,cik]);
   const id=(await q(`select issuer_id from public.issuers where cik=$1`,[cik]))[0].issuer_id as string;
   await q(`insert into public.issuer_securities(issuer_id,ticker,share_class,is_primary,valid_from,source) values($1,$2,'common',true,'2000-01-01','test') on conflict do nothing`,[id,ticker]);
   return id;
  };
  const fixtures=new Map<string,Uint8Array>();
  for(const r of REAL){ids[r.ticker]=await provision(r.ticker,rekeyCik(r.cik),`${r.ticker} fixture copy`);fixtures.set(rekeyCik(r.cik).padStart(10,'0'),rekeyCompanyfacts(r.companyfacts,r.cik));}
  ids.ZZ=await provision(ZZ.ticker,ZZ.cik,ZZ.name);fixtures.set(ZZ.cik.padStart(10,'0'),zzCompanyfacts());
  scope=Object.entries(ids).map(([t,id])=>({issuer_id:id,fetch_key:(t==='ZZ'?ZZ.cik:rekeyCik(REAL.find(r=>r.ticker===t)!.cik)).padStart(10,'0')}));
  await db.reconcileScope('US',scope.map(x=>({...x,reasons:['test'],priority:10})));
  // isolation rests on issuerIds filtering in runFactsSync and priority 0 / no reasons after the suite (a sync's lease release overwrites next_due_at)
  await q(`update public.fact_sync_scope set next_due_at='2999-01-01' where issuer_id = any($1::uuid[])`,[Object.values(ids)]);
  const deps:SyncDeps={db,tables,storage:memorySnapshotStore(),
   fetchUs:async(cik10:string):Promise<RawSnapshot>=>{const b=fixtures.get(cik10);if(!b)throw new ProviderError('no_companyfacts',cik10);return snapshotOf(b,{source:'edgar',url:companyFactsUrl(cik10)});},
   fetchCn:async()=>{throw new ProviderError('tushare_unavailable','not in this suite');},
   parseUs:(snapshot,o)=>parseCompanyFacts(snapshot,{sinceYear:o.sinceYear}),
   parseCn:()=>{throw new ProviderError('parse_error','not in this suite');},
   now:()=>new Date(),deadline:null,codeVersion:'test'};
  const sync=await runFactsSync(deps,{market:'US',limit:10,issuerIds:Object.values(ids),dryRun:false,triggeredBy:'script',mappingGen:MAPPING_GEN});
  expect(sync.detail).toMatchObject({published:Object.keys(ids).length,failed:0});
  for(const r of REAL){
   const meta=JSON.parse(readFileSync(`${r.doc}.meta.json`,'utf8')) as {source_url:string};
   const accn=meta.source_url.split('/')[7];   // 10+2+6 digits without dashes
   docs.set(meta.source_url.replace(`/data/${r.cik}/`,`/data/${rekeyCik(r.cik)}/`).replace(accn,`99${accn.slice(2)}`),rekeyDoc(r.doc,r.cik));
  }
  docs.set(ZZ_URL,zzDoc('1,000'));
  sampleBytes=buildSample('1,000');
 },180_000);
 afterAll(async()=>{
  if(db&&scope.length>0)await db.reconcileScope('US',scope.map(x=>({...x,reasons:[],priority:0}))).catch(()=>{});
  await admin?.end();
 });

 it('every expected key gets exactly one result; AAPL/MSFT copies pass except registered exceptions; the injected ZZ revenue is quarantined, invisible and rematerialized',async()=>{
  await materialize(db,ids.ZZ,'US');
  expect((await netMargin())?.value).toBe('0.0999000999');   // 100 / 1001 before reconciliation
  const r1=await runReconcile(rdeps(),{pair:PAIR,triggeredBy:'script'});
  firstCycle=r1.cycle!.cycleId;
  expect(r1.cycle).toMatchObject({created:true,settled:true});
  expect(r1.members.every(m=>m.outcome==='done')).toBe(true);
  const rows=await q(`select natural_key,outcome,passed,issuer_id from public.dq_reconciliations where pair=$1 and cycle_id=$2`,[PAIR,firstCycle]) as {natural_key:string;outcome:string;passed:boolean;issuer_id:string}[];
  expect(rows.length).toBe(r1.cycle!.expectedTotal);
  // independent derivation: the complete (natural key → owning issuer) set from the injected, re-keyed manifest
  const injected=JSON.parse(new TextDecoder().decode(sampleBytes)) as UsSample;
  const ownerOf=(cik:string)=>cik===ZZ.cik?ids.ZZ:ids[REAL.find(r=>rekeyCik(r.cik)===cik)!.ticker];
  const expectedPairs=injected.issuers.flatMap(i=>i.filings.flatMap(f=>f.expected_keys.map(k=>`${usNaturalKey(i.cik,f.accn,k)}@${ownerOf(i.cik)}`))).sort();
  expect(expectedPairs.length).toBeGreaterThan(0);
  expect(rows.map(r=>`${r.natural_key}@${r.issuer_id}`).sort()).toEqual(expectedPairs);
  expect(new Set(rows.map(r=>r.natural_key)).size).toBe(rows.length);
  const byKey=(a:{natural_key:string},b:{natural_key:string})=>a.natural_key<b.natural_key?-1:1;
  const realFailures=rows.filter(r=>r.issuer_id!==ids.ZZ&&!r.passed).map(r=>({natural_key:unkey(r.natural_key),outcome:r.outcome==='compared'?'compared_failed':r.outcome})).sort(byKey);
  expect(realFailures).toEqual(EXCEPTIONS.map(({natural_key,outcome})=>({natural_key,outcome})).sort(byKey));
  expect(rows.filter(r=>r.issuer_id!==ids.ZZ).length).toBeGreaterThan(REAL.length*20);
  expect(r1.cycle!.status).toBe(EXCEPTIONS.some(e=>e.outcome!=='compared_failed')?'complete_with_gaps':'complete');
  const zzRows=rows.filter(r=>r.issuer_id===ids.ZZ).sort(byKey);
  expect(zzRows.map(r=>[r.natural_key.split(':')[2],r.outcome,r.passed])).toEqual([['equity_parent','compared',true],['net_income_parent','compared',true],['revenue','compared',false],['total_assets','compared',true]]);
  const item=await zzItem();
  expect(item).toMatchObject({status:'open',dataset:'facts.us'});
  expect(item.detail.hook.state).toBe('done');
  expect(item.detail.latest_result).toMatchObject({passed:false});
  expect((await q(`select status from public.financial_facts where fact_id=$1`,[await revFactId()]))[0].status).toBe('quarantined');
  const visible=await db.readFacts(ids.ZZ,'US',{concepts:['revenue'],asOf:today()});
  expect(visible.rows.filter(r=>r.period_end==='2024-12-31')).toEqual([]);
  expect(await netMargin()).toBeUndefined();
  const metrics=await db.metricsOfIssuer(ids.ZZ,'US',FORMULA_VERSION);
  // the quarantine hook rematerialized: without revenue no metric of ZZ is left (net_margin was present before)
  expect(metrics).toEqual([]);
 },300_000);

 it('restore is refused while the latest result is not passing',async()=>{
  const item=await zzItem();
  const {batchId}=await startBatch(tables,{producer:'dq-resolver',dataset:'facts.us'});
  await expect(db.restoreReconciled(item.id,batchId,await inputsHashNow(pairCtx(),item),ADMIN)).rejects.toMatchObject({code:'not_passing'});
  expect((await zzItem()).status).toBe('open');
 });

 it('a corrected right document passes in a new cycle; restore needs the current inputs hash, promotes the row and the metric returns',async()=>{
  docs.set(ZZ_URL,zzDoc('1,001'));sampleBytes=buildSample('1,001');
  const r2=await runReconcile(rdeps(),{pair:PAIR,triggeredBy:'script'});
  expect(r2.cycle).toMatchObject({created:true,settled:true});expect(r2.cycle!.cycleId).not.toBe(firstCycle);
  const item=await zzItem();
  expect(item.status).toBe('open');
  expect(item.detail.latest_result).toMatchObject({passed:true});
  const hashNow=await inputsHashNow(pairCtx(),item);
  expect(item.detail.latest_result.inputs_hash).toBe(hashNow);
  const changed=await inputsHashNow(pairCtx({readRepoFile:async p=>p===US_SAMPLE_PATH?enc(`${new TextDecoder().decode(sampleBytes)} `):new Uint8Array(readFileSync(p))}),item);
  expect(changed).not.toBe(hashNow);
  const {batchId}=await startBatch(tables,{producer:'dq-resolver',dataset:'facts.us'});
  await expect(db.restoreReconciled(item.id,batchId,changed,ADMIN)).rejects.toMatchObject({code:'not_passing'});
  // plan audit P2: the primary document changes after the pass while the sample bytes stay → a different current hash, restore refused
  const passedDoc=docs.get(ZZ_URL)!;docs.set(ZZ_URL,zzDoc('1,002'));
  const docChanged=await inputsHashNow(pairCtx(),item);
  expect(docChanged).not.toBe(hashNow);
  await expect(db.restoreReconciled(item.id,batchId,docChanged,ADMIN)).rejects.toMatchObject({code:'not_passing'});
  docs.delete(ZZ_URL);
  await expect(inputsHashNow(pairCtx(),item)).rejects.toThrow('current_evidence_unavailable');   // 404 now → restore stays disabled
  docs.set(ZZ_URL,passedDoc);
  expect(await inputsHashNow(pairCtx(),item)).toBe(hashNow);
  const res=await db.restoreReconciled(item.id,batchId,hashNow,ADMIN);
  expect(res).toEqual({promoted:1,skipped:[]});
  expect((await zzItem()).status).toBe('resolved_accept');
  const visible=await db.readFacts(ids.ZZ,'US',{concepts:['revenue'],asOf:today()});
  expect(visible.rows.filter(r=>r.period_end==='2024-12-31'&&r.is_current).map(r=>r.value)).toEqual(['1001']);
  await materialize(db,ids.ZZ,'US');
  expect((await netMargin())?.value).toBe('0.0999000999');
 },300_000);
});
// src/lib/dq/reconcile/lineage.integration.test.ts
// Spec §9.3 (critical): facts.lineage_same_day on real PostgreSQL. Two synthetic issuers disclose FY2023
// revenue on the same day with different values; after set_merge(source → target) the lineage read reports the
// conflict and suppresses the current value; the pair writes a failed result and a lineage_conflict item;
// resolve_lineage_conflict keeps the target's row (the other is quarantined), the conflict disappears, the kept
// value is current again with its recorded issuer, and materialize writes metrics whose based_on_lineage holds
// both members' state revisions.
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {pgTableClient} from '../../db/pg-table-client';
import type {TableClient} from '../../db/table-client';
import {MAPPING_GEN} from '../../facts/concepts';
import {FORMULA_VERSION,materialize} from '../../facts/derive';
import {pgFactsDb} from '../../facts/pg-facts-db';
import {companyFactsUrl,parseCompanyFacts} from '../../facts/providers/edgar-companyfacts';
import {ProviderError,snapshotOf} from '../../facts/providers/shared';
import {memorySnapshotStore} from '../../facts/snapshot-store';
import {runFactsSync} from '../../facts/sync';
import type {FactsDb,RawSnapshot} from '../../facts/types';
import {startBatch} from '../batches';
import {memoryRawStore} from '../raw-store';
import {lineageSameDayPair} from './pair-lineage';
import {runReconcile} from './run';

const enabled=!!process.env.S4_TEST_STATE;
const PAIR='facts.lineage_same_day' as const;
const ADMIN=randomUUID();
const S={ticker:'ZQLS',cik:'9990011',name:'ZQ Lineage Source',accn:'0009990011-24-000001',revenue:1000};
const T={ticker:'ZQLT',cik:'9990012',name:'ZQ Lineage Target',accn:'0009990012-24-000001',revenue:1200};
const doc=(x:typeof S,withNetIncome:boolean)=>new TextEncoder().encode(JSON.stringify({cik:Number(x.cik),entityName:x.name,facts:{'us-gaap':{
 Revenues:{units:{USD:[{start:'2023-01-01',end:'2023-12-31',val:x.revenue,accn:x.accn,fy:2023,fp:'FY',form:'10-K',filed:'2024-02-15'}]}},
 ...(withNetIncome?{NetIncomeLoss:{units:{USD:[{start:'2023-01-01',end:'2023-12-31',val:120,accn:x.accn,fy:2023,fp:'FY',form:'10-K',filed:'2024-02-15'}]}}}:{}),
}}}));
const K='revenue:2023-01-01:2023-12-31:consolidated:USD';

describe.skipIf(!enabled)('facts.lineage_same_day on real PostgreSQL (§9.3)',()=>{
 let admin:Pool;let db:FactsDb;let tables:TableClient;let s='';let t='';
 const q=(text:string,values:unknown[]=[])=>admin.query(text,values).then(r=>r.rows);
 const today=()=>new Date().toISOString().slice(0,10);
 const factOf=async(issuer:string)=>(await q(`select fact_id from public.financial_facts where issuer_id=$1 and concept='revenue'`,[issuer]))[0].fact_id as string;
 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  admin=new Pool({connectionString:state.adminUrl});db=pgFactsDb(admin);tables=pgTableClient(admin);
  expect((await q(`select count(*)::int as n from public.dq_reconcile_cycles where pair=$1 and status='running'`,[PAIR]))[0].n,'a foreign running cycle of this pair (contract note 14)').toBe(0);
  // set_merge audits into research_audit_log, whose user_id references auth.users: the resolver must exist (Task 8a's user fixture; plan audit P11)
  await q(`insert into auth.users(id,email) values($1,$2) on conflict (id) do nothing`,[ADMIN,`${ADMIN}@lineage.test`]);
  const provision=async(x:typeof S)=>{
   await q(`insert into public.stocks_universe(ticker,name,market) values($1,$2,'US') on conflict (ticker) do nothing`,[x.ticker,x.name]);
   await q(`insert into public.issuers(issuer_id,canonical_name_en,country_code,cik) values($1,$2,'US',$3) on conflict do nothing`,[randomUUID(),x.name,x.cik]);
   const id=(await q(`select issuer_id from public.issuers where cik=$1`,[x.cik]))[0].issuer_id as string;
   await q(`insert into public.issuer_securities(issuer_id,ticker,share_class,is_primary,valid_from,source) values($1,$2,'common',true,'2000-01-01','test') on conflict do nothing`,[id,x.ticker]);
   return id;
  };
  s=await provision(S);t=await provision(T);
  await db.reconcileScope('US',[{issuer_id:s,reasons:['test'],priority:10,fetch_key:S.cik.padStart(10,'0')},{issuer_id:t,reasons:['test'],priority:10,fetch_key:T.cik.padStart(10,'0')}]);
  // isolation rests on issuerIds filtering in runFactsSync and priority 0 / no reasons after the suite (a sync's lease release overwrites next_due_at)
  await q(`update public.fact_sync_scope set next_due_at='2999-01-01' where issuer_id = any($1::uuid[])`,[[s,t]]);
  const bytes=new Map([[S.cik.padStart(10,'0'),doc(S,false)],[T.cik.padStart(10,'0'),doc(T,true)]]);
  const sync=await runFactsSync({db,tables,storage:memorySnapshotStore(),
   fetchUs:async(cik10:string):Promise<RawSnapshot>=>{const b=bytes.get(cik10);if(!b)throw new ProviderError('no_companyfacts',cik10);return snapshotOf(b,{source:'edgar',url:companyFactsUrl(cik10)});},
   fetchCn:async()=>{throw new ProviderError('tushare_unavailable','not in this suite');},
   parseUs:(snapshot,o)=>parseCompanyFacts(snapshot,{sinceYear:o.sinceYear}),
   parseCn:()=>{throw new ProviderError('parse_error','not in this suite');},
   now:()=>new Date(),deadline:null,codeVersion:'test'},{market:'US',limit:10,issuerIds:[s,t],dryRun:false,triggeredBy:'script',mappingGen:MAPPING_GEN});
  expect(sync.detail).toMatchObject({published:2,failed:0});
 },120_000);
 afterAll(async()=>{
  if(db&&s&&t)await db.reconcileScope('US',[{issuer_id:s,reasons:[],priority:0,fetch_key:S.cik.padStart(10,'0')},{issuer_id:t,reasons:[],priority:0,fetch_key:T.cik.padStart(10,'0')}]).catch(()=>{});
  await admin?.end();
 });

 it('set_merge → the lineage read reports the same-day conflict and suppresses the current value',async()=>{
  await q(`update public.issuer_securities set valid_to=current_date, valid_to_method='curated' where issuer_id=$1 and valid_to is null`,[s]);
  expect(await db.setMerge(s,t,ADMIN)).toEqual({repointed:0});
  const lineage=await db.lineageOf(t);
  expect(lineage).toEqual([t,s]);
  const env=await db.readFactsLineage(lineage,'US',{concepts:['revenue','net_income_parent'],asOf:today()});
  expect(env.conflicts).toHaveLength(1);
  expect(new Set(env.conflicts[0].fact_ids)).toEqual(new Set([await factOf(s),await factOf(t)]));
  expect(env.rows.filter(r=>r.concept==='revenue'&&r.is_current)).toEqual([]);
  expect(env.rows.filter(r=>r.concept==='net_income_parent'&&r.is_current).map(r=>r.value)).toEqual(['120']);
 });

 it('the pair writes a failed numeric result and one lineage_conflict item; resolve_lineage_conflict restores one current value; metrics carry both lineage revisions',async()=>{
  const r=await runReconcile({db,tables,raw:memoryRawStore(),fetch:(async()=>{throw new Error('no network');}) as unknown as typeof fetch,readRepoFile:async()=>{throw new Error('no repo file');},
   now:()=>new Date(),deadline:null,codeVersion:'test',pairs:{[PAIR]:lineageSameDayPair({targets:[t]})}},{pair:PAIR,triggeredBy:'script',issuerIds:[t]});
  expect(r.members).toEqual([expect.objectContaining({issuerId:t,market:'US',outcome:'done',counts:{compared_passed:0,compared_failed:1,not_compared:0}})]);
  const nk=`${t}:${K}:2024-02-15`;
  const [row]=await q(`select kind,outcome,passed,left_value::text as l,right_value::text as r from public.dq_reconciliations where pair=$1 and natural_key=$2`,[PAIR,nk]);
  expect(row).toMatchObject({kind:'numeric',outcome:'compared',passed:false});
  expect(new Set([row.l,row.r])).toEqual(new Set(['1000','1200']));
  const items=await q(`select id,status,dataset,payload from public.dq_quarantine where reason_code='lineage_conflict' and natural_key=$1`,[nk]);
  expect(items).toHaveLength(1);expect(items[0]).toMatchObject({status:'open',dataset:'facts.us'});
  const keep=await factOf(t);
  const {batchId}=await startBatch(tables,{producer:'dq-resolver',dataset:'facts.us'});
  expect(await db.resolveLineageConflict(items[0].id,keep,batchId,ADMIN)).toEqual({quarantined:1});
  expect((await q(`select status,detail from public.dq_quarantine where id=$1`,[items[0].id]))[0]).toMatchObject({status:'resolved_accept',detail:expect.objectContaining({chosen_fact_ids:[keep]})});
  expect((await q(`select status from public.financial_facts where fact_id=$1`,[await factOf(s)]))[0].status).toBe('quarantined');
  const env=await db.readFactsLineage([t,s],'US',{concepts:['revenue'],asOf:today()});
  expect(env.conflicts).toEqual([]);
  expect(env.rows.filter(x=>x.is_current).map(x=>[x.issuer_id,x.value])).toEqual([[t,'1200']]);
  await materialize(db,t,'US');
  const revs=(await db.stateRevs([t,s],'US')).sort((a,b)=>a.issuer_id<b.issuer_id?-1:1);
  const metrics=await db.metricsOfIssuer(t,'US',FORMULA_VERSION);
  expect(metrics.find(m=>m.metric==='net_margin'&&m.duration==='12M')?.value).toBe('0.1');
  for(const m of metrics)expect([...m.based_on_lineage].sort((a,b)=>a.issuer_id<b.issuer_id?-1:1)).toEqual(revs);
 },120_000);
});

exec
/bin/zsh -lc "cat src/lib/facts/derive.ts | head -220; sed -n '900,1030p' src/lib/dq/dq-extensions.integration.test.ts; rg -n 'dq_reconcile_cycle:|usNaturalKey' src/lib/dq/reconcile/us-sample.ts supabase/migrations | tail -35; find . -name '*AGENTS*'; ls -a | head -30" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 100ms:
// src/lib/facts/derive.ts
// Derived metrics (spec §8). deriveMetrics is pure: it takes the readFacts history rows of one
// issuer/market (status ok, available_date <= asOf, with disclosure_seq/is_current/is_revision)
// and emits MetricRow[] for FORMULA_VERSION. Rules: exact period matching; missing input, unit
// mismatch, zero denominator or non-unique match → no row ("missing stays missing"); YTD
// differencing only across compatible disclosure versions — (a) both current disclosures from the
// same filing, or (b) both sequences never revised — the rule is recoverable from `inputs`
// (equal filing_id ⇒ a); TTM = four adjacent single quarters; YoY prior = the unique same-duration
// fact ending 350–380 days earlier; ROE opening equity = the instant fact dated exactly one day
// before the TTM window. Arithmetic is exact decimal on BigInt; ratios are rounded half away from
// zero to RATIO_SCALE places; INSTANT metrics carry period_start = period_end (column is not null).
// Differenced quarters are order-independent: a direct 3M fact wins; conflicting differences = no quarter. ROE with a
// non-positive average equity is missing. as_of is the UTC date for every market.
// materialize() follows the plan-3 lineage contract (spec §4.4, T9): target T = targetOf(issuer); the
// current lineage of T; read_facts_lineage (truncated → read_truncated); every row must belong to the
// lineage and market; derive for T; replace_financial_metrics_lineage under the envelope's rev
// vector, one retry on stale_computation (a rev or the lineage moved).
import type {Duration,FactRow,FactsDb,LineageRev,Market,MetricDuration,MetricRow} from './types';
import {FactsDbError} from './types';
import {canonicalDecimal} from './json-numbers';
import {classifyDuration} from './classify';

export const FORMULA_VERSION='facts-derive/1.0';
export const RATIO_SCALE=10;
export const Q_SINGLE_CONCEPTS:Record<Market,readonly string[]>={
 US:['revenue','net_income_parent','operating_income','operating_cash_flow','capex'],
 CN:['revenue','net_income_parent','operating_income','operating_cash_flow','capex_incl_intangibles'],
};
/** Concepts to read per market: the readFacts `concepts` list for materialize and the live metrics route. */
export const DERIVE_CONCEPTS:Record<Market,readonly string[]>={
 US:['revenue','gross_profit','cost_of_revenue','net_income_parent','operating_income','operating_cash_flow','capex','short_term_borrowings','long_term_borrowings','equity_parent'],
 CN:['revenue','revenue_operating','cost_of_revenue','net_income_parent','operating_income','operating_cash_flow','capex_incl_intangibles','short_term_borrowings','long_term_borrowings','bonds_payable','equity_parent'],
};
const FIXED_METRICS=['gross_margin','net_margin','fcf','borrowings_total','revenue_yoy','net_income_yoy','roe'] as const;
export function metricNames(market:Market):string[]{
 return [...FIXED_METRICS,...Q_SINGLE_CONCEPTS[market].flatMap(c=>[`q_single_${c}`,`ttm_${c}`])];
}
export interface DeriveOptions{market:Market;asOf:string;basedOnRev?:number;/** complete lineage vector the rows derive from; default [{issuer_id, basedOnRev}] */basedOn?:LineageRev[]}

// ---- exact decimal arithmetic (value = n / 10^s) ----
interface Dec{n:bigint;s:number}
const DEC_RE=/^-?\d+(\.\d+)?$/;
const pow10=(k:number)=>10n**BigInt(k);
function parseDec(v:string):Dec|null{
 if(!DEC_RE.test(v))return null;
 const neg=v.startsWith('-'),body=neg?v.slice(1):v,[i,f='']=body.split('.');
 const n=BigInt(i+f);return {n:neg?-n:n,s:f.length};
}
function align(a:Dec,b:Dec):[bigint,bigint,number]{const s=Math.max(a.s,b.s);return [a.n*pow10(s-a.s),b.n*pow10(s-b.s),s];}
const add=(a:Dec,b:Dec):Dec=>{const [x,y,s]=align(a,b);return {n:x+y,s};};
const sub=(a:Dec,b:Dec):Dec=>{const [x,y,s]=align(a,b);return {n:x-y,s};};
const sameNumber=(x:string,y:string)=>{const a=parseDec(x),b=parseDec(y);if(!a||!b)return x===y;const [p,q]=align(a,b);return p===q;};
const isZero=(d:Dec)=>d.n===0n;
const abs=(d:Dec):Dec=>({n:d.n<0n?-d.n:d.n,s:d.s});
const times=(d:Dec,k:bigint):Dec=>({n:d.n*k,s:d.s});
/** a / b rounded half away from zero to RATIO_SCALE places; null when b is zero. */
function div(a:Dec,b:Dec):Dec|null{
 if(isZero(b))return null;
 const [x,y]=align(a,b);
 const q=(x*pow10(RATIO_SCALE+1))/y;      // one guard digit; BigInt division truncates toward zero
 const r=q<0n?-((-q+5n)/10n):(q+5n)/10n;
 return {n:r,s:RATIO_SCALE};
}
function decToString(d:Dec):string{
 const neg=d.n<0n;let digits=(neg?-d.n:d.n).toString();
 if(d.s>0){digits=digits.padStart(d.s+1,'0');digits=`${digits.slice(0,-d.s)}.${digits.slice(-d.s)}`;}
 return canonicalDecimal((neg?'-':'')+digits);
}

// ---- calendar days (UTC) ----
const DAY_MS=86_400_000;
const dayMs=(d:string)=>Date.parse(`${d}T00:00:00Z`);
export const addDays=(d:string,n:number)=>new Date(dayMs(d)+n*DAY_MS).toISOString().slice(0,10);
const daysBetween=(from:string,to:string)=>Math.round((dayMs(to)-dayMs(from))/DAY_MS);

// ---- current disclosure per natural key ----
interface Cur{row:FactRow;dec:Dec;revised:boolean}
type Input=MetricRow['inputs'][number];
const inputOf=(c:Cur,extra:Partial<Input>={}):Input=>({fact_id:c.row.fact_id,concept:c.row.concept,filing_id:c.row.filing_id,available_date:c.row.available_date,...extra});
const cmpStr=(a:string,b:string)=>a<b?-1:a>b?1:0;
function currentFacts(rows:FactRow[]):Map<string,Cur[]>{
 const groups=new Map<string,FactRow[]>();
 for(const r of rows){const k=`${r.concept}|${r.period_start??''}|${r.period_end}|${r.consolidation}|${r.unit}`;(groups.get(k)??groups.set(k,[]).get(k)!).push(r);}
 const out=new Map<string,Cur[]>();
 for(const g of groups.values()){
  g.sort((a,b)=>(a.disclosure_seq??0)-(b.disclosure_seq??0)||cmpStr(a.available_date,b.available_date)||cmpStr(a.created_at,b.created_at)||cmpStr(a.fact_id,b.fact_id));
  const currents=g.filter(r=>r.is_current===true);
  if(currents.length>1)throw new Error(`derive_multiple_current:${g[0].concept}|${g[0].period_end}`);
  const row=currents[0]??g[g.length-1];
  const dec=parseDec(row.value);if(!dec)continue;
  const revised=g.some((r,i)=>r.is_revision===true||(r.is_revision===undefined&&i>0&&!sameNumber(r.value,g[i-1].value)));
  (out.get(row.concept)??out.set(row.concept,[]).get(row.concept)!).push({row,dec,revised});
 }
 return out;
}

export function deriveMetrics(allRows:FactRow[],opts:DeriveOptions):MetricRow[]{
 // Consolidated rows only: the metric vocabulary is consolidated-only and financial_metrics has no consolidation column in its key,
 // so mixing bases would pair a consolidated revenue with a parent gross profit or collide on the primary key.
 // Scope guard: one issuer and market per call, and the market must be the one being derived.
 if(allRows.some(r=>r.issuer_id!==allRows[0].issuer_id||r.market!==allRows[0].market||r.market!==opts.market))throw new Error('derive_mixed_scope');
 let rows=allRows.filter(r=>r.consolidation==='consolidated');
 if(rows.length===0)return [];
 // as_of is a UTC calendar date for every market (accepted, spec §8).
 const {market,asOf}=opts;const issuerId=rows[0].issuer_id;const basedOnRev=opts.basedOnRev??0;const basedOn=opts.basedOn??[{issuer_id:issuerId,state_rev:basedOnRev}];
 const facts=currentFacts(rows);
 const of=(concept:string)=>facts.get(concept)??[];
 const unique=<T>(xs:T[])=>xs.length===1?xs[0]:null;
 const same=(concept:string,ref:Cur)=>unique(of(concept).filter(c=>c.row.period_start===ref.row.period_start&&c.row.period_end===ref.row.period_end&&c.row.unit===ref.row.unit));
 const instant=(concept:string,end:string,unit:string)=>unique(of(concept).filter(c=>c.row.duration==='INSTANT'&&c.row.period_end===end&&c.row.unit===unit));
 const isDuration=(c:Cur):c is Cur&{row:FactRow&{period_start:string}}=>c.row.period_start!==null&&c.row.duration!=='INSTANT';
 const std=market==='US'?'us_standard':'cn_standard';
 const basisQ=(c:string)=>market==='CN'&&c==='capex_incl_intangibles'?'cn_incl_intangibles':std;
 const out:MetricRow[]=[];
 const emit=(metric:string,start:string,end:string,duration:MetricDuration,value:Dec,unit:string,inputUnit:string,basis:string,inputs:Input[])=>{
  const seen=new Set<string>();
  out.push({issuer_id:issuerId,market,metric,period_start:start,period_end:end,duration,value:decToString(value),unit,input_unit:inputUnit,basis,formula_version:FORMULA_VERSION,
   inputs:inputs.filter(i=>{const k=`${i.fact_id}|${i.quarter?.join('~')??''}`;return !seen.has(k)&&!!seen.add(k);}),based_on_rev:basedOnRev,based_on_lineage:basedOn.map(x=>({...x})),as_of:asOf});
 };
 const ratio=(metric:string,ref:Cur&{row:{period_start:string}},num:Dec,den:Dec,basis:string,inputs:Cur[])=>{
  const v=div(num,den);if(v)emit(metric,ref.row.period_start,ref.row.period_end,ref.row.duration,v,'pure',ref.row.unit,basis,inputs.map(x=>inputOf(x)));
 };
 // margins
 const revC=market==='US'?'revenue':'revenue_operating';
 for(const rev of of(revC)){
  if(!isDuration(rev)||isZero(rev.dec))continue;
  const gp=market==='US'?same('gross_profit',rev):null;
  if(gp)ratio('gross_margin',rev,gp.dec,rev.dec,std,[gp,rev]);
  else{const cor=same('cost_of_revenue',rev);if(cor)ratio('gross_margin',rev,sub(rev.dec,cor.dec),rev.dec,std,[cor,rev]);}
  const ni=same('net_income_parent',rev);
  if(ni)ratio('net_margin',rev,ni.dec,rev.dec,std,[ni,rev]);
 }
 // free cash flow
 const capexC=market==='US'?'capex':'capex_incl_intangibles';
 for(const ocf of of('operating_cash_flow')){
  if(!isDuration(ocf))continue;
  const cx=same(capexC,ocf);if(!cx)continue;
  emit('fcf',ocf.row.period_start,ocf.row.period_end,ocf.row.duration,sub(ocf.dec,cx.dec),ocf.row.unit,ocf.row.unit,market==='US'?'us_standard':'cn_incl_intangibles',[inputOf(ocf),inputOf(cx)]);
 }
 // borrowings_total (INSTANT; period_start = period_end)
 for(const st of of('short_term_borrowings')){
  if(st.row.duration!=='INSTANT')continue;
  const lt=instant('long_term_borrowings',st.row.period_end,st.row.unit);if(!lt)continue;
  const bonds=market==='CN'?instant('bonds_payable',st.row.period_end,st.row.unit):null;
  if(market==='CN'&&!bonds)continue;
  const total=bonds?add(add(st.dec,lt.dec),bonds.dec):add(st.dec,lt.dec);
  emit('borrowings_total',st.row.period_end,st.row.period_end,'INSTANT',total,st.row.unit,st.row.unit,market==='US'?'us_standard':'cn_incl_bonds',[st,lt,...(bonds?[bonds]:[])].map(x=>inputOf(x)));
 }
 // year over year
 for(const [metric,concept] of [['revenue_yoy','revenue'],['net_income_yoy','net_income_parent']] as const){
  for(const cur of of(concept)){
   if(!isDuration(cur))continue;
   const prior=unique(of(concept).filter(p=>{if(p.row.duration!==cur.row.duration||p.row.unit!==cur.row.unit)return false;const d=daysBetween(p.row.period_end,cur.row.period_end);return d>=350&&d<=380;}));
   if(!prior||isZero(prior.dec))continue;
   ratio(metric,cur,sub(cur.dec,prior.dec),abs(prior.dec),std,[cur,prior]);
  }
 }
 // single quarters and TTM
 const STEP:Partial<Record<Duration,Duration>>={'6M':'3M','9M':'6M','12M':'9M'};
 const compatible=(a:Cur,b:Cur)=>a.row.filing_id===b.row.filing_id||(!a.revised&&!b.revised);
 interface Q{start:string;end:string;unit:string;dec:Dec;inputs:Input[]}
 const ttmNetIncome:Q[]=[];
 for(const c of Q_SINGLE_CONCEPTS[market]){
  const quarters=new Map<string,Q>();
  // A direct 3M fact wins outright. Derived candidates for one (start,end,unit) are order-independent: differing values
  // are ambiguous (no quarter); equal values keep the candidate with the smallest sorted input fact_ids.
  const derived=new Map<string,Q[]>();
  const qk=(q:Q)=>`${q.start}|${q.end}|${q.unit}`;
  const put=(q:Q)=>{quarters.set(qk(q),q);};
  const all=of(c).filter(isDuration);
  for(const f of all)if(f.row.duration==='3M')put({start:f.row.period_start,end:f.row.period_end,unit:f.row.unit,dec:f.dec,inputs:[inputOf(f,{quarter:[f.row.period_start,f.row.period_end]})]});
  for(const a of all){
   const bDur=STEP[a.row.duration];if(!bDur)continue;
   const b=unique(all.filter(x=>x.row.duration===bDur&&x.row.period_start===a.row.period_start&&x.row.unit===a.row.unit));
   if(!b||!compatible(a,b))continue;
   const start=addDays(b.row.period_end,1),end=a.row.period_end;
   if(classifyDuration(start,end)!=='3M')continue;   // the difference must itself be a single quarter
   const tag:Partial<Input>={ytd_rule:a.row.filing_id===b.row.filing_id?'same_filing':'never_revised',quarter:[start,end]};
   const cand:Q={start,end,unit:a.row.unit,dec:sub(a.dec,b.dec),inputs:[inputOf(a,tag),inputOf(b,tag)]};
   (derived.get(qk(cand))??derived.set(qk(cand),[]).get(qk(cand))!).push(cand);
  }
  const ids=(q:Q)=>q.inputs.map(i=>i.fact_id).sort().join('|');
  for(const [k,cands] of derived){
   if(quarters.has(k))continue;
   const [first,...rest]=cands;
   if(rest.some(x=>{const [p,q]=align(first.dec,x.dec);return p!==q;}))continue;
   put(cands.reduce((m,x)=>cmpStr(ids(x),ids(m))<0?x:m,first));
  }
  const qs=[...quarters.values()].sort((x,y)=>cmpStr(x.unit,y.unit)||cmpStr(x.end,y.end)||cmpStr(x.start,y.start));
  for(const q of qs)emit(`q_single_${c}`,q.start,q.end,'3M',q.dec,q.unit,q.unit,basisQ(c),q.inputs);
  const byEnd=new Map<string,Q[]>();
  for(const q of qs){const k=`${q.unit}|${q.end}`;(byEnd.get(k)??byEnd.set(k,[]).get(k)!).push(q);}
  for(const last of qs){
   // exactly-adjacent quarters, each unique by (unit, period_end); any ambiguity skips this window
   const w=[last];let ok=(byEnd.get(`${last.unit}|${last.end}`)?.length??0)===1;
   for(let j=1;ok&&j<4;j++){const prev=byEnd.get(`${last.unit}|${addDays(w[0].start,-1)}`)??[];if(prev.length!==1)ok=false;else w.unshift(prev[0]);}
   if(!ok)continue;
   const t:Q={start:w[0].start,end:last.end,unit:last.unit,dec:w.slice(1).reduce((acc,q)=>add(acc,q.dec),w[0].dec),inputs:w.flatMap(q=>q.inputs)};
   emit(`ttm_${c}`,t.start,t.end,'TTM',t.dec,t.unit,t.unit,basisQ(c),t.inputs);
   if(c==='net_income_parent')ttmNetIncome.push(t);
  }
 }
 // ROE = TTM net income / avg(opening equity, closing equity) = 2·TTM / (e0 + e1)
 for(const t of ttmNetIncome){
  const e0=instant('equity_parent',addDays(t.start,-1),t.unit),e1=instant('equity_parent',t.end,t.unit);
  if(!e0||!e1)continue;
  const eq=add(e0.dec,e1.dec);if(eq.n<=0n)continue;   // non-positive average equity: ROE is not meaningful → missing
  const v=div(times(t.dec,2n),eq);if(!v)continue;
  emit('roe',t.start,t.end,'TTM',v,'pure',t.unit,std,[...t.inputs,inputOf(e0),inputOf(e1)]);
 }
 const key=(m:MetricRow)=>`${m.metric}|${m.period_end}|${m.period_start}|${m.input_unit}|${m.basis}`;
 return out.sort((a,b)=>cmpStr(key(a),key(b)));
}

export type MaterializeDb=Pick<FactsDb,'targetOf'|'lineageOf'|'readFactsLineage'|'replaceMetricsLineage'>;
export interface MaterializeResult{rows:number;stateRev:number;retried:boolean;target:string;basedOn:LineageRev[]}
/**
 * Rows of a lineage derived for its target T: every row must belong to the lineage and the market
 * (replaces plan 2's "rows of this issuer only"); issuer ids are relabelled to T so the
 * single-issuer derivation applies — the recorded issuer stays traceable through inputs[].fact_id.
  it('open_reconcile_cycle freezes issuer_id as canonical uuid text (upper-case input works end to end); a non-uuid issuer_id and a natural key repeated across members are invalid_members',async()=>{
   const {iss}=await published();const pair=newPair();const cy=`${pair}-c`;
   const out=await openC(admin,pair,cy,[{issuer_id:iss.toUpperCase(),market:'US',expected_keys:[{naturalKey:'k1',locator:{}}]}],[]);
   expect(out.cycle.members).toEqual([{issuer_id:iss,market:'US',expected_keys:[{naturalKey:'k1',locator:{}}]}]);
   const w=await batch(`reconcile.${pair}`);const fence=(await claimM(pair,cy,iss,w))!;
   expect(await apply(fence,res('k1',{passed:true,right_value:'100',abs_diff:'0',rel_diff:'0'}))).toMatchObject({reused:false});
   expect(await complete(fence)).toEqual({compared_passed:1,compared_failed:0,not_compared:0});
   const p2=newPair(),other=await issuer();
   expect(await fails(openC(admin,p2,`${p2}-x`,[{issuer_id:'not-a-uuid',market:'US',expected_keys:[]}],[]))).toMatchObject({message:'invalid_members'});
   expect(await fails(openC(admin,p2,`${p2}-x`,[{issuer_id:iss,market:'US',expected_keys:[]},{issuer_id:iss.toUpperCase(),market:'US',expected_keys:[]}],[]))).toMatchObject({message:'invalid_members'});
   expect(await fails(openC(admin,p2,`${p2}-x`,[{issuer_id:iss,market:'US',expected_keys:[{naturalKey:'dup',locator:{}}]},{issuer_id:other,market:'US',expected_keys:['dup']}],[]))).toMatchObject({message:'invalid_members'});
   expect(await q(`select 1 from public.dq_reconcile_cycles where pair=$1`,[p2])).toEqual([]);
  });

  // ---- open_reconcile_cycle (section 13, plan audit Q2): atomic creation, per-entry consumption, the lock shared with set_merge
  type Opened={created:boolean;cycle:Record<string,any>;transferred:unknown[]};
  const openC=(c:Pool|PoolClient,pair:string,id:string,members:unknown[],pending:unknown[])=>
   c.query(`select public.open_reconcile_cycle($1,$2,now(),$3::jsonb,$4::jsonb) v`,[pair,id,JSON.stringify(members),JSON.stringify(pending)]).then(r=>r.rows[0].v as Opened);
  const LINEAGE='facts.lineage_same_day';
  const lid=()=>`${LINEAGE}-${randomUUID().slice(0,8)}`;
  /** inside a rolled-back transaction only: no running lineage cycle from another suite, plus a "latest" row set_merge writes to */
  const lineageStage=async(c:PoolClient,pending:unknown[])=>{
   await c.query(`select pg_advisory_xact_lock(hashtext('dq_reconcile_cycle:'||$1))`,[LINEAGE]);   // pair cycle lock FIRST, then cycle rows (same order as the runner / open_reconcile_cycle; avoids deadlock with the real lineage pair run in lineage.integration.test.ts)
   await c.query(`update public.dq_reconcile_cycles set status='complete', finished_at=now() where pair=$1 and status='running'`,[LINEAGE]);
   const id=`${LINEAGE}-old-${randomUUID().slice(0,8)}`;
   await c.query(`insert into public.dq_reconcile_cycles(pair,cycle_id,started_at,finished_at,members,status,expected_total,detail) values($1,$2,now()+interval '100 years',now()+interval '100 years','[]','complete',0,$3::jsonb)`,[LINEAGE,id,JSON.stringify({pending_members:pending})]);
   return id;
  };
  const pendingIn=async(c:Pool|PoolClient,pair:string,id:string)=>(await c.query(`select detail from public.dq_reconcile_cycles where pair=$1 and cycle_id=$2`,[pair,id])).rows[0].detail as Record<string,unknown>;

  it('open_reconcile_cycle: cycle row and every cursor in one call; only the listed pending entries are consumed; a running cycle is returned unchanged',async()=>{
   const t1=await issuer(),t2=await issuer();
   const e1={issuer_id:t1,market:'US',source:randomUUID()},e2={issuer_id:t2,market:'US',source:randomUUID()};
   await inRolledBackTx(admin,async c=>{
    const old=await lineageStage(c,[e1,e2]);
    const id=lid();
    const out=await openC(c,LINEAGE,id,[{issuer_id:t1,market:'US',expected_keys:[{naturalKey:'k1',locator:{}},{naturalKey:'k2',locator:{}}]}],[e1]);
    expect(out).toMatchObject({created:true,transferred:[e1],cycle:{cycle_id:id,status:'running',expected_total:2,detail:{pending_merged_from:[old],pending_transferred:[e1]}}});
    expect((await c.query(`select issuer_id,market,expected,state from public.dq_reconcile_cursor where pair=$1 and cycle_id=$2`,[LINEAGE,id])).rows).toEqual([{issuer_id:t1,market:'US',expected:2,state:'pending'}]);
    expect(await pendingIn(c,LINEAGE,old)).toEqual({pending_members:[e2],pending_consumed_by:id});    // e2 was not listed: it waits for the next cycle
    const again=await openC(c,LINEAGE,lid(),[{issuer_id:t2,market:'US',expected_keys:[]}],[e2]);
    expect(again).toMatchObject({created:false,transferred:[],cycle:{cycle_id:id}});
    expect((await pendingIn(c,LINEAGE,old)).pending_members).toEqual([e2]);                        // nothing consumed by the loser
   });
  });

  it('open_reconcile_cycle: a merge registered after the runner snapshot survives creation — neither overwritten nor consumed (stale-snapshot interleaving)',async()=>{
   const s=await issuer(),t=await issuer(),t0=await issuer(),by=await user();
   const e0={issuer_id:t0,market:'US',source:randomUUID()};
   await inRolledBackTx(admin,async c=>{
    const old=await lineageStage(c,[e0]);
    const snapshot=[e0];                                                          // the runner read pending_members here
    await c.query(`select public.set_merge($1,$2,$3)`,[s,t,by]);                  // a merge lands before the function runs
    const out=await openC(c,LINEAGE,lid(),[{issuer_id:t0,market:'US',expected_keys:[]}],snapshot);
    expect(out.transferred).toEqual([e0]);
    expect((out.cycle.members as {issuer_id:string}[]).map(m=>m.issuer_id)).toEqual([t0]);
    expect((await pendingIn(c,LINEAGE,old)).pending_members).toEqual([{issuer_id:t,market:'CN',source:s},{issuer_id:t,market:'US',source:s}]);
   });
  });

  it('open_reconcile_cycle and set_merge serialise on the cycle lock, both ways',async()=>{
   const s1=await issuer(),t1=await issuer(),s2=await issuer(),t2=await issuer(),by=await user();
   let waiter:Promise<void>|undefined;
   await inTx(admin,async({c,pid})=>{
    await c.query(`select public.set_merge($1,$2,$3)`,[s1,t1,by]);                // holds the cycle lock until this transaction ends
    waiter=inRolledBackTx(admin,async c2=>{await openC(c2,LINEAGE,lid(),[],[]);},1);waiter.catch(()=>{});
    await stillBlockedBehind(admin,pid,waiter);
   });                                                                              // rolled back: the merge never happened, the waiter proceeds
   await expect(waiter).resolves.toBeUndefined();
   let merger:Promise<unknown>|undefined;
   await inTx(admin,async({c,pid})=>{
    await openC(c,LINEAGE,lid(),[],[]);                                             // takes the cycle lock (created or not)
    merger=one(`select public.set_merge($1,$2,$3) v`,[s2,t2,by]);merger.catch(()=>{});
    await stillBlockedBehind(admin,pid,merger);
   });                                                                              // rolled back: no cycle was created
   await expect(merger).resolves.toEqual({repointed:0});
  });

  it('lock order (plan audit R1): a creator whose cycle contains the merge target and a concurrent set_merge into that target both complete, in either order — no deadlock',async()=>{
   const s1=await issuer(),t1=await issuer(),s2=await issuer(),t2=await issuer(),by=await user();
   const lockSql=`select pg_advisory_xact_lock(hashtext('dq_reconcile_cycle:'||$1))`;
   // (a) the creator already holds the cycle lock and has not inserted its cursors yet; the merge arrives now.
   //     Fixed order: the merge waits on the advisory lock holding NO scope/issuer row; the creator's cursor
   //     insert for t1 (KEY SHARE on issuers via the FK) does not wait; both finish. Old order: the merge held
   //     t1 FOR UPDATE while waiting → 40P01 on one side.
   let merger:Promise<unknown>|undefined;let opened:Opened|undefined;
   await inTx(admin,async({c,pid})=>{
    await lineageStage(c,[]);
    await c.query(lockSql,[LINEAGE]);                                              // what open_reconcile_cycle takes first
    merger=inRolledBackTx(admin,async c2=>{
     expect((await c2.query(`select public.set_merge($1,$2,$3) v`,[s1,t1,by])).rows[0].v).toEqual({repointed:0});
    },1);merger.catch(()=>{});
    await stillBlockedBehind(admin,pid,merger);
    expect(await q(`select distinct l.locktype from pg_locks l join pg_stat_activity a on a.pid=l.pid where not l.granted and $1 = any(pg_blocking_pids(a.pid))`,[pid])).toEqual([{locktype:'advisory'}]);   // the merge waits on the advisory lock, not on a row
    opened=await openC(c,LINEAGE,lid(),[{issuer_id:t1,market:'US',expected_keys:[{naturalKey:'k',locator:{}}]}],[]);   // re-entrant advisory lock; cursor insert on t1
   });                                                                              // rolled back
   expect(opened).toMatchObject({created:true});
   await expect(merger).resolves.toBeUndefined();
   // (b) the merge into t2 runs first and holds every lock; the creator for a cycle containing t2 waits, then finishes.
   let creator:Promise<void>|undefined;
   await inTx(admin,async({c,pid})=>{
    expect((await c.query(`select public.set_merge($1,$2,$3) v`,[s2,t2,by])).rows[0].v).toEqual({repointed:0});
    creator=inRolledBackTx(admin,async c2=>{
     await lineageStage(c2,[]);
     expect(await openC(c2,LINEAGE,lid(),[{issuer_id:t2,market:'US',expected_keys:[{naturalKey:'k',locator:{}}]}],[])).toMatchObject({created:true});
    },1);creator.catch(()=>{});
    await stillBlockedBehind(admin,pid,creator);
   });                                                                              // rolled back: the creator proceeds
   await expect(creator).resolves.toBeUndefined();
  });

  it('open_reconcile_cycle: invalid members are refused; a creator that dies before commit leaves pending, cycle and cursors untouched, and the rerun consumes once (crash recovery)',async()=>{
   const t1=await issuer();const pair=newPair();
   const e1={issuer_id:t1,market:'US',source:randomUUID()};
   expect(await fails(openC(admin,pair,`${pair}-x`,[],[e1]))).toMatchObject({message:'invalid_members',code:'22023'});              // a pending entry without its resolved member
   expect(await fails(openC(admin,pair,`${pair}-x`,[{issuer_id:t1,market:'US',expected_keys:[]},{issuer_id:t1,market:'US',expected_keys:[]}],[]))).toMatchObject({message:'invalid_members'});
   expect(await fails(openC(admin,pair,`${pair}-x`,[{issuer_id:t1,market:'US'}],[]))).toMatchObject({message:'invalid_members'});   // keys not resolved
   const old=`${pair}-old`;
   await q(`insert into public.dq_reconcile_cycles(pair,cycle_id,started_at,finished_at,members,status,expected_total,detail) values($1,$2,now(),now(),'[]','complete',0,$3::jsonb)`,[pair,old,JSON.stringify({pending_members:[e1]})]);
   await inRolledBackTx(admin,async c=>{await openC(c,pair,`${pair}-dead`,[{issuer_id:t1,market:'US',expected_keys:[]}],[e1]);});   // the creator dies before commit
   expect(await q(`select cycle_id from public.dq_reconcile_cycles where pair=$1`,[pair])).toEqual([{cycle_id:old}]);
   expect(await q(`select count(*)::int n from public.dq_reconcile_cursor where pair=$1`,[pair])).toEqual([{n:0}]);
   expect((await pendingIn(admin,pair,old)).pending_members).toEqual([e1]);
   expect(await openC(admin,pair,`${pair}-live`,[{issuer_id:t1,market:'US',expected_keys:[{naturalKey:'k',locator:{}}]}],[e1])).toMatchObject({created:true,transferred:[e1]});
   expect((await pendingIn(admin,pair,old)).pending_members).toEqual([]);
   expect(await q(`select count(*)::int n from public.dq_reconcile_cursor where pair=$1 and cycle_id=$2`,[pair,`${pair}-live`])).toEqual([{n:1}]);
  });

  // ---- Task 14b review: settle_reconcile_cycle / record_cycle_freshness
  const COUNTS={compared_passed:1,compared_failed:0,not_compared:0,exec_failed_members:0};
  const settleC=(pair:string,id:string,ok:boolean,status='complete')=>one(`select public.settle_reconcile_cycle($1,$2,$3,$4::jsonb,$5::jsonb) v`,[pair,id,status,JSON.stringify(COUNTS),JSON.stringify({status:'pending',ok,detail:{cycle_id:id}})]) as Promise<boolean>;
src/lib/dq/reconcile/us-sample.ts:33:export const usNaturalKey=(cik:string,accn:string,k:Pick<SampleKey,'concept'|'period_start'|'period_end'|'unit'>)=>`${cik}:${accn}:${k.concept}:${k.period_start??''}:${k.period_end}:${k.unit}`;
src/lib/dq/reconcile/us-sample.ts:122:    const nk=usNaturalKey(String(iss.cik),String(f.accn),k);
supabase/migrations/20261107091000_facts_extensions.sql:21:-- function taking a dq_reconcile_cycle:* advisory lock takes it before every row lock) → reconcile
supabase/migrations/20261107091000_facts_extensions.sql:308:-- function that takes a dq_reconcile_cycle:* advisory lock takes it before any row lock.
supabase/migrations/20261107091000_facts_extensions.sql:319:  perform pg_advisory_xact_lock(hashtext('dq_reconcile_cycle:facts.lineage_same_day'));   -- FIRST, before any row lock (plan audit R1); serialises with open_reconcile_cycle (plan audit Q2)
supabase/migrations/20261107091000_facts_extensions.sql:1046:  perform pg_advisory_xact_lock(hashtext('dq_reconcile_cycle:' || p_pair));
supabase/migrations/20261107091000_facts_extensions.sql:1127:  perform pg_advisory_xact_lock(hashtext('dq_reconcile_cycle:' || p_pair));
supabase/migrations/20261107091000_facts_extensions.sql:1155:  perform pg_advisory_xact_lock(hashtext('dq_reconcile_cycle:' || p_pair));
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
The additional assertions match the fixture data and metric derivation behavior, and the advisory lock follows the existing reconciliation lock order. No actionable regressions were identified. Database integration tests were not run in the read-only environment.
The additional assertions match the fixture data and metric derivation behavior, and the advisory lock follows the existing reconciliation lock order. No actionable regressions were identified. Database integration tests were not run in the read-only environment.

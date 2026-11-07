OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b128-3637-7040-a3da-e68cfc95195c
--------
user
commit 577486e
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 577486e; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 1405ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-Qx7lrLG5' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-gpnidhf3' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/14c-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/14c-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/14c-review-fix2.md
?? docs/audits/2026-11-05-data-foundation-3/codex/14c-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-oC8EXcsB' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-p0pg6Q6y' (errno=Operation not permitted)
577486e refactor(dq): pure reconcile arg parsing, route uses cnPairEnabled, idempotent out-of-cycle recorder
 scripts/dq/reconcile.ts                  | 23 +++++------------------
 scripts/facts/enrich-acceptance.ts       |  8 ++++----
 src/app/api/cron/reconcile/route.test.ts |  2 +-
 src/app/api/cron/reconcile/route.ts      |  6 +++---
 src/lib/dq/reconcile/deps.test.ts        | 24 +++++++++++++-----------
 src/lib/dq/reconcile/deps.ts             | 23 +++++++++++++++++++++--
 src/lib/dq/reconcile/record.test.ts      | 13 ++++++++++++-
 src/lib/dq/reconcile/record.ts           | 11 +++++++++--
 src/lib/facts/deps.test.ts               |  3 +++
 9 files changed, 71 insertions(+), 42 deletions(-)

exec
/bin/zsh -lc 'pwd; for d in . .. ../.. ../../.. ../../../..; do for f in AGENTS.override.md AGENTS.md CLAUDE.md; do test ! -f "$d/$f" || { echo ==== "$d/$f"; cat "$d/$f"; }; done; done; git show 577486e --; ' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
zsh:1: === not found

exec
/bin/zsh -lc 'for d in . .. ../.. ../../.. ../../../..; do for f in AGENTS.override.md AGENTS.md CLAUDE.md; do if test -f "$d/$f"; then printf '"'\\n%s\\n' \""'$d/$f"; cat "$d/$f"; fi; done; done; git show 577486e --' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:

../../../AGENTS.md
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-DFRDrkRX' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-sm4qA3eR' (errno=Operation not permitted)
commit 577486e707f33bac8c466c6e7236676f2162a10d
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 05:59:13 2026 -0800

    refactor(dq): pure reconcile arg parsing, route uses cnPairEnabled, idempotent out-of-cycle recorder
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/scripts/dq/reconcile.ts b/scripts/dq/reconcile.ts
index af3886b..c957716 100644
--- a/scripts/dq/reconcile.ts
+++ b/scripts/dq/reconcile.ts
@@ -16,27 +16,14 @@ import {supabaseTableClient} from '../../src/lib/db/table-client';
 import {resolveIssuer} from '../../src/lib/entities/resolve';
 import {resolveCodeVersion} from '../../src/lib/facts/deps';
 import {memoryRawStore} from '../../src/lib/dq/raw-store';
-import {cnPairEnabled,productionReconcileDeps} from '../../src/lib/dq/reconcile/deps';
-import {RECONCILE_PAIRS} from '../../src/lib/dq/reconcile/pairs';
+import {parseReconcileArgs,productionReconcileDeps} from '../../src/lib/dq/reconcile/deps';
 import {runReconcile} from '../../src/lib/dq/reconcile/run';
-import {CYCLE_PAIR_IDS} from '../../src/lib/dq/reconcile/types';
-import type {CyclePairId} from '../../src/lib/dq/reconcile/types';
 import {getAdminSupabase} from '../../src/lib/supabase/admin';
 
-const USAGE='usage: reconcile.ts --pair <cycle pair id> [--issuer <ticker>...] [--apply]';
-
 async function main(){
- const argv=process.argv.slice(2);let pair='',apply=false;const tickers:string[]=[];
- for(let i=0;i<argv.length;i++){
-  const x=argv[i],v=argv[i+1];
-  if(x==='--pair'&&v){pair=v;i++;}
-  else if(x==='--issuer'&&v){tickers.push(v);i++;}
-  else if(x==='--apply')apply=true;
-  else{console.error(USAGE);process.exit(2);}
- }
- if(!(CYCLE_PAIR_IDS as readonly string[]).includes(pair)){console.error(USAGE);process.exit(2);}
- if(apply&&!cnPairEnabled(pair)){console.error('cn_disabled: --apply for cn.* pairs needs FACTS_CN_ENABLED=1');process.exit(2);}   // before any production deps
- if(!RECONCILE_PAIRS[pair as CyclePairId]){console.error(`${USAGE}\nregistered: ${Object.keys(RECONCILE_PAIRS).join(', ')}`);process.exit(2);}
+ const args=parseReconcileArgs(process.argv.slice(2));
+ if('exit' in args){console.error(args.message);process.exit(args.exit);}
+ const {pair,apply,tickers}=args;
  const sb=getAdminSupabase();const tables=supabaseTableClient(sb);const today=new Date().toISOString().slice(0,10);
  const issuerIds:string[]=[];
  for(const t of tickers){const r=await resolveIssuer(tables,{ticker:t},{today});if(!r){console.error(`unknown ticker: ${t}`);process.exit(2);}issuerIds.push(r.issuer_id);}
@@ -44,7 +31,7 @@ async function main(){
  if(!codeVersion){console.error('code_version unavailable (VERCEL_GIT_COMMIT_SHA or git HEAD): refusing to apply');process.exit(2);}
  const base=productionReconcileDeps({deadline:null,codeVersion,admin:sb});
  const deps=apply?base:{...base,raw:memoryRawStore()};
- const receipt=await runReconcile(deps,{pair:pair as CyclePairId,triggeredBy:'script',dryRun:!apply,...(issuerIds.length?{issuerIds}:{})});
+ const receipt=await runReconcile(deps,{pair,triggeredBy:'script',dryRun:!apply,...(issuerIds.length?{issuerIds}:{})});
  if(!apply){
   let n=0;
   for(const m of receipt.dryRun??[])for(const r of m.results){n++;console.log(JSON.stringify({issuer:m.issuerId,market:m.market,natural_key:r.natural_key,outcome:r.outcome,passed:r.passed,action:r.action}));}
diff --git a/scripts/facts/enrich-acceptance.ts b/scripts/facts/enrich-acceptance.ts
index 88da62b..c226478 100644
--- a/scripts/facts/enrich-acceptance.ts
+++ b/scripts/facts/enrich-acceptance.ts
@@ -26,7 +26,7 @@ import {memoryRawStore,supabaseRawStore} from '../../src/lib/dq/raw-store';
 import {fetchSubmissions} from '../../src/lib/entities/identifiers/sec-submissions';
 import {resolveIssuer} from '../../src/lib/entities/resolve';
 import {supabaseFactsDb} from '../../src/lib/facts/db';
-import {recordReconciliation} from '../../src/lib/dq/reconcile/record';
+import {recordReconciliationDetailed} from '../../src/lib/dq/reconcile/record';
 import type {ReconcileResultInput} from '../../src/lib/dq/reconcile/types';
 import {DATE_MISMATCH_PAIR,enrichAcceptance} from '../../src/lib/facts/providers/sec-acceptance';
 import type {AcceptanceDeps} from '../../src/lib/facts/providers/sec-acceptance';
@@ -77,12 +77,12 @@ async function main():Promise<void>{
   if(!codeVersion){console.error('code version unavailable (VERCEL_GIT_COMMIT_SHA or a git checkout)');process.exit(1);}
   batchId=(await startBatch(tables,{producer:'enrich-acceptance',dataset:DATASETS.acceptance,toolVersions:{source:'sec_submissions'},codeVersion,triggeredBy:'script'})).batchId;
  }
- const counts:BatchCounts=emptyCounts();const errors:BatchError[]=[];let mismatches=0,issuerFailures=0;
+ const counts:BatchCounts=emptyCounts();const errors:BatchError[]=[];let mismatches=0,mismatchDuplicates=0,issuerFailures=0;
  const budget=makeBudget(null);
  for(const it of issuers){
   try{
    const out=await enrichAcceptance({db:writes,submissions:(c,b,coverFrom)=>fetchSubmissions(c,{fetch,userAgent:process.env.EDGAR_USER_AGENT,raw,budget:b},{coverFrom}),
-    ...(apply?{recordDateMismatch:async(r:ReconcileResultInput)=>{await recordReconciliation(tables,{...r,pair:DATE_MISMATCH_PAIR,batch_id:batchId});}}:{})},{issuerId:it.issuerId,cik10:it.cik10},budget,{fullHistory});
+    ...(apply?{recordDateMismatch:async(r:ReconcileResultInput)=>{if((await recordReconciliationDetailed(tables,{...r,pair:DATE_MISMATCH_PAIR,batch_id:batchId})).duplicate)mismatchDuplicates++;}}:{})},{issuerId:it.issuerId,cik10:it.cik10},budget,{fullHistory});
    for(const k of Object.keys(counts) as (keyof BatchCounts)[])counts[k]+=out.counts[k];
    errors.push(...out.errors);mismatches+=out.mismatches.length;
    if(out.counts.failed>0||out.errors.some(e=>!isInfoError(e)))issuerFailures++;
@@ -98,7 +98,7 @@ async function main():Promise<void>{
   status=await finishBatch(tables,batchId,{counts,errors});
   await recordAttempt(tables,DATASETS.acceptance,{ok:status==='success',cadence:'daily',detail:{issuers:issuers.length,...counts,date_mismatches:mismatches}});
  }
- console.log(JSON.stringify({status,issuers:issuers.length,counts,date_mismatches:mismatches}));
+ console.log(JSON.stringify({status,issuers:issuers.length,counts,date_mismatches:mismatches,...(apply?{date_mismatch_duplicates:mismatchDuplicates}:{})}));
  process.exit((batchId!==null&&(status==='failed'||status==='partial'))||(batchId===null&&issuerFailures>0)?1:0);
 }
 
diff --git a/src/app/api/cron/reconcile/route.test.ts b/src/app/api/cron/reconcile/route.test.ts
index a27358d..ed72d66 100644
--- a/src/app/api/cron/reconcile/route.test.ts
+++ b/src/app/api/cron/reconcile/route.test.ts
@@ -3,7 +3,7 @@ import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
 
 const mocks=vi.hoisted(()=>({run:vi.fn(),deps:vi.fn(),codeVersion:vi.fn()}));
 vi.mock('@/lib/dq/reconcile/run',async importOriginal=>({...(await importOriginal<typeof import('@/lib/dq/reconcile/run')>()),runReconcile:mocks.run}));
-vi.mock('@/lib/dq/reconcile/deps',()=>({productionReconcileDeps:mocks.deps}));
+vi.mock('@/lib/dq/reconcile/deps',()=>({productionReconcileDeps:mocks.deps,cnPairEnabled:(pair:string)=>!pair.startsWith('cn.')||process.env.FACTS_CN_ENABLED==='1'}));
 vi.mock('@/lib/dq/reconcile/pairs',async importOriginal=>{const o=await importOriginal<typeof import('@/lib/dq/reconcile/pairs')>();return {...o,RECONCILE_PAIRS:{...o.RECONCILE_PAIRS,'cn.tushare_vs_cninfo_pdf_gold':{id:'cn.tushare_vs_cninfo_pdf_gold'}}};});   // a CN pair registered (as Task 16a will) so the gate is reached
 vi.mock('@/lib/facts/deps',()=>({resolveCodeVersion:mocks.codeVersion}));
 
diff --git a/src/app/api/cron/reconcile/route.ts b/src/app/api/cron/reconcile/route.ts
index f936914..32bdd12 100644
--- a/src/app/api/cron/reconcile/route.ts
+++ b/src/app/api/cron/reconcile/route.ts
@@ -3,13 +3,13 @@
 // /api/cron/facts-sync: CRON_SECRET bearer (constant-time), maxDuration 300 with a 240 s deadline handed to
 // the runner (which starts a member only with >= 60 s left), a missing code_version refuses the run. The pair
 // must be given once and be a REGISTERED cycle pair; cn.* pairs are refused unless FACTS_CN_ENABLED=1 (no
-// Tushare token, no verified gold yet; vercel.json schedules US iXBRL 02:00 and lineage 04:00 UTC only).
+// Tushare token, no verified gold yet; vercel.json schedules lineage 04:00 UTC only; the US iXBRL entry (02:00) is added with its pair in Task 15a).
 // A duplicate cron delivery is harmless: cursor claims are fenced, a second worker finds nothing claimable.
 // The HTTP receipt carries codes, keys and counts only — never error messages or dry-run results.
 import {timingSafeEqual} from 'node:crypto';
 import {NextResponse} from 'next/server';
 import {resolveCodeVersion} from '@/lib/facts/deps';
-import {productionReconcileDeps} from '@/lib/dq/reconcile/deps';
+import {cnPairEnabled,productionReconcileDeps} from '@/lib/dq/reconcile/deps';
 import {ReconcileConfigError} from '@/lib/dq/reconcile/pair-support';
 import {RECONCILE_PAIRS} from '@/lib/dq/reconcile/pairs';
 import {ReconcileError,runReconcile} from '@/lib/dq/reconcile/run';
@@ -38,7 +38,7 @@ async function run(request:Request):Promise<NextResponse>{
  const pairs=new URL(request.url).searchParams.getAll('pair');
  const pair=pairs.length===1?pairs[0]:'';
  if(!(CYCLE_PAIR_IDS as readonly string[]).includes(pair)||!RECONCILE_PAIRS[pair as CyclePairId])return err('invalid_parameter:pair','pair must be one registered cycle pair',400);
- if(pair.startsWith('cn.')&&process.env.FACTS_CN_ENABLED!=='1')return err('cn_disabled','CN reconciliation is not enabled (FACTS_CN_ENABLED)',403);
+ if(!cnPairEnabled(pair))return err('cn_disabled','CN reconciliation is not enabled (FACTS_CN_ENABLED)',403);
  const codeVersion=resolveCodeVersion({allowGit:false});
  if(!codeVersion)return err('code_version_unavailable','VERCEL_GIT_COMMIT_SHA not set',503);
  const started=new Date();
diff --git a/src/lib/dq/reconcile/deps.test.ts b/src/lib/dq/reconcile/deps.test.ts
index 9b098ab..993c4ce 100644
--- a/src/lib/dq/reconcile/deps.test.ts
+++ b/src/lib/dq/reconcile/deps.test.ts
@@ -3,8 +3,7 @@ import {describe,expect,it,vi} from 'vitest';
 import type {SupabaseClient} from '@supabase/supabase-js';
 const mocks=vi.hoisted(()=>({hash:vi.fn()}));
 vi.mock('./pairs',async importOriginal=>({...(await importOriginal<typeof import('./pairs')>()),inputsHashNow:mocks.hash}));
-import {spawnSync} from 'node:child_process';
-import {REPO_FILE_PREFIXES,cnPairEnabled,readRepoFileFromDisk,restoreInputsHashNow} from './deps';
+import {REPO_FILE_PREFIXES,cnPairEnabled,parseReconcileArgs,readRepoFileFromDisk,restoreInputsHashNow} from './deps';
 
 describe('restoreInputsHashNow (quarantine route + admin dashboard, spec §5.6)',()=>{
  it('passes the hash through; known data gaps become inputs_unavailable, an unobtainable current right side current_evidence_unavailable (plan audit P2); anything else is rethrown',async()=>{
@@ -36,13 +35,16 @@ describe('CN gate (FACTS_CN_ENABLED)',()=>{
   expect(cnPairEnabled('cn.tushare_vs_cninfo_pdf_gold',{FACTS_CN_ENABLED:'true'})).toBe(false);
   expect(cnPairEnabled('cn.tushare_vs_cninfo_pdf_gold',{FACTS_CN_ENABLED:'1'})).toBe(true);
  });
- const run=(env:Record<string,string>,args:string[])=>spawnSync('npx',['tsx','scripts/dq/reconcile.ts',...args],{encoding:'utf8',env:{...process.env,FACTS_CN_ENABLED:'',...env},timeout:60_000});
- it('scripts/dq/reconcile.ts refuses --apply for a cn.* pair unless enabled, before building production deps; the enabled run gets past the gate',()=>{
-  const off=run({},['--pair','cn.tushare_vs_cninfo_pdf_gold','--apply']);
-  expect(off.status).toBe(2);expect(off.stderr).toContain('cn_disabled');
-  const on=run({FACTS_CN_ENABLED:'1'},['--pair','cn.tushare_vs_cninfo_pdf_gold','--apply']);
-  expect(on.status).toBe(2);expect(on.stderr).not.toContain('cn_disabled');expect(on.stderr).toContain('registered:');   // CN pair is not registered until Task 16a: the next check answers
-  const dry=run({},['--pair','cn.tushare_vs_cninfo_pdf_gold']);
-  expect(dry.stderr).not.toContain('cn_disabled');   // a dry run needs no gate
- },120_000);
+ it('parseReconcileArgs: --apply of a cn.* pair is refused unless enabled; enabled and dry runs pass the gate; bad arguments exit 2',()=>{
+  const cn='cn.tushare_vs_cninfo_pdf_gold';
+  const reg={[cn]:{},'facts.lineage_same_day':{}};
+  expect(parseReconcileArgs(['--pair',cn,'--apply'],{},reg)).toEqual({exit:2,message:expect.stringContaining('cn_disabled')});
+  expect(parseReconcileArgs(['--pair',cn,'--apply'],{FACTS_CN_ENABLED:'0'},reg)).toMatchObject({exit:2});
+  expect(parseReconcileArgs(['--pair',cn,'--apply'],{FACTS_CN_ENABLED:'1'},reg)).toEqual({pair:cn,apply:true,tickers:[]});
+  expect(parseReconcileArgs(['--pair',cn],{},reg)).toEqual({pair:cn,apply:false,tickers:[]});   // dry run: no gate
+  expect(parseReconcileArgs(['--pair','facts.lineage_same_day','--issuer','AAPL','--issuer','MSFT','--apply'],{},reg)).toEqual({pair:'facts.lineage_same_day',apply:true,tickers:['AAPL','MSFT']});
+  for(const argv of [[],['--pair'],['--pair','bogus'],['--pair','facts.lineage_same_day','--wat'],['--issuer','AAPL']])expect(parseReconcileArgs(argv,{},reg),argv.join(' ')).toEqual({exit:2,message:expect.stringContaining('usage:')});
+  const unreg=parseReconcileArgs(['--pair','us.companyfacts_vs_gold'],{},{});
+  expect(unreg).toEqual({exit:2,message:expect.stringContaining('registered:')});
+ });
 });
diff --git a/src/lib/dq/reconcile/deps.ts b/src/lib/dq/reconcile/deps.ts
index 477ce4f..1162e1c 100644
--- a/src/lib/dq/reconcile/deps.ts
+++ b/src/lib/dq/reconcile/deps.ts
@@ -14,9 +14,10 @@ import {supabaseRawStore} from '../raw-store';
 import type {Row} from '../../db/table-client';
 import {makeBudget} from '../../facts/sync';
 import type {InputsHashNow} from '../facts-resolver';
-import {inputsHashNow} from './pairs';
+import {RECONCILE_PAIRS,inputsHashNow} from './pairs';
 import type {ReconcileDeps} from './run';
-import type {PairContext} from './types';
+import {CYCLE_PAIR_IDS} from './types';
+import type {CyclePairId,PairContext} from './types';
 
 export const REPO_FILE_PREFIXES:readonly string[]=['src/lib/dq/fixtures/gold/','src/lib/facts/fixtures/gold/'];
 export async function readRepoFileFromDisk(path:string):Promise<Uint8Array>{
@@ -50,6 +51,24 @@ export function restoreInputsHashNow(admin?:SupabaseClient):InputsHashNow{
 /** CN pairs run only with FACTS_CN_ENABLED=1 (no Tushare token / unverified gold: spec T15). Shared by the cron route and the script. */
 export const cnPairEnabled=(pair:string,env:Record<string,string|undefined>=process.env):boolean=>!pair.startsWith('cn.')||env.FACTS_CN_ENABLED==='1';
 
+export const RECONCILE_USAGE='usage: reconcile.ts --pair <cycle pair id> [--issuer <ticker>...] [--apply]';
+export type ReconcileArgs={pair:CyclePairId;apply:boolean;tickers:string[]}|{exit:2;message:string};
+/** Argument parsing and gates of scripts/dq/reconcile.ts (pure): bad arguments, unknown / unregistered pair, and --apply of a cn.* pair without FACTS_CN_ENABLED=1 (checked before any production deps exist; a dry run needs no gate). */
+export function parseReconcileArgs(argv:readonly string[],env:Record<string,string|undefined>=process.env,registry:Partial<Record<CyclePairId,unknown>>=RECONCILE_PAIRS):ReconcileArgs{
+ let pair='',apply=false;const tickers:string[]=[];
+ for(let i=0;i<argv.length;i++){
+  const x=argv[i],v=argv[i+1];
+  if(x==='--pair'&&v){pair=v;i++;}
+  else if(x==='--issuer'&&v){tickers.push(v);i++;}
+  else if(x==='--apply')apply=true;
+  else return {exit:2,message:RECONCILE_USAGE};
+ }
+ if(!(CYCLE_PAIR_IDS as readonly string[]).includes(pair))return {exit:2,message:RECONCILE_USAGE};
+ if(apply&&!cnPairEnabled(pair,env))return {exit:2,message:'cn_disabled: --apply for cn.* pairs needs FACTS_CN_ENABLED=1'};
+ if(!registry[pair as CyclePairId])return {exit:2,message:`${RECONCILE_USAGE}\nregistered: ${Object.keys(registry).join(', ')}`};
+ return {pair:pair as CyclePairId,apply,tickers};
+}
+
 export interface ProductionReconcileOptions{deadline:Date|null;codeVersion:string;admin?:SupabaseClient}
 export function productionReconcileDeps(opts:ProductionReconcileOptions):ReconcileDeps{
  const sb=opts.admin??getAdminSupabase();
diff --git a/src/lib/dq/reconcile/record.test.ts b/src/lib/dq/reconcile/record.test.ts
index 857a610..3c23300 100644
--- a/src/lib/dq/reconcile/record.test.ts
+++ b/src/lib/dq/reconcile/record.test.ts
@@ -1,7 +1,7 @@
 // src/lib/dq/reconcile/record.test.ts
 import {describe,expect,it} from 'vitest';
 import {memoryTableClient} from '../../db/memory-table-client';
-import {recordReconciliation} from './record';
+import {recordReconciliation,recordReconciliationDetailed} from './record';
 import type {ReconcileResultInput} from './types';
 
 const text=(over:Partial<ReconcileResultInput>={}):ReconcileResultInput=>({natural_key:'320193:0000320193-23-000106',kind:'text',outcome:'compared',passed:true,left_value:null,right_value:null,abs_diff:null,rel_diff:null,tolerance:'0',left_source:'sec.submissions',right_source:'edgar.ixbrl.dei',detail:{left_text:'Large accelerated filer',right_text:'Large Accelerated Filer'},action:'record',...over});
@@ -49,4 +49,15 @@ describe('recordReconciliation (out-of-cycle rows, spec §5.1)',()=>{
   expect(row).toMatchObject({left_value:'1.1',right_value:'1',abs_diff:'0.1',rel_diff:'0',tolerance:'0.005',created_at:'2026-01-02T03:04:05.000Z'});
   expect(row.detail).toMatchObject({tolerance_exact:'0.005',abs_diff_exact:'0.1'});
  });
+ it('is idempotent per (pair, natural_key) over identical values; a changed side or another pair writes a new row',async()=>{
+  const t=memoryTableClient({dq_reconciliations:['id']});
+  const d=(l:string,r:string)=>({...text({kind:'date',passed:false,detail:{left_text:l,right_text:r}}),pair:'sec.filing_date_vs_submissions' as const,batch_id:'b'});
+  const a=await recordReconciliationDetailed(t,d('2024-02-01','2024-02-02'));
+  const b=await recordReconciliationDetailed(t,{...d('2024-02-01','2024-02-02'),batch_id:'b2'});
+  expect(a.duplicate).toBe(false);expect(b).toEqual({id:a.id,duplicate:true});
+  expect(await recordReconciliation(t,d('2024-02-01','2024-02-02'))).toBe(a.id);
+  expect(t.rows('dq_reconciliations')).toHaveLength(1);
+  expect((await recordReconciliationDetailed(t,d('2024-02-01','2024-02-03'))).duplicate).toBe(false);
+  expect(t.rows('dq_reconciliations')).toHaveLength(2);
+ });
 });
diff --git a/src/lib/dq/reconcile/record.ts b/src/lib/dq/reconcile/record.ts
index 02b5217..6bc076f 100644
--- a/src/lib/dq/reconcile/record.ts
+++ b/src/lib/dq/reconcile/record.ts
@@ -16,7 +16,10 @@ import type {ReconcilePairId,ReconcileResultInput} from './types';
 const isStr=(v:unknown):v is string=>typeof v==='string';
 /** Numeric columns are written canonical; ratio columns (rel_diff) are derived/display, pass/fail is `passed`, decided by exact comparison.
  * detail.tolerance_exact / abs_diff_exact keep the exact values next to the columns. */
-export async function recordReconciliation(tables:TableClient,input:ReconcileResultInput&{pair:ReconcilePairId;batch_id:string|null},opts:{now?:()=>Date}={}):Promise<string>{
+export type RecordInput=ReconcileResultInput&{pair:ReconcilePairId;batch_id:string|null};
+export async function recordReconciliation(tables:TableClient,input:RecordInput,opts:{now?:()=>Date}={}):Promise<string>{return (await recordReconciliationDetailed(tables,input,opts)).id;}
+/** Re-recording the same (pair, natural_key) with identical outcome, values and text sides writes nothing and answers the existing row: {duplicate:true} (a re-run over unchanged evidence adds no rows). */
+export async function recordReconciliationDetailed(tables:TableClient,input:RecordInput,opts:{now?:()=>Date}={}):Promise<{id:string;duplicate:boolean}>{
  if(!(RECONCILE_PAIR_IDS as readonly string[]).includes(input.pair))throw new Error('invalid_pair');
  if((CYCLE_PAIR_IDS as readonly string[]).includes(input.pair))throw new Error('cycle_pair_requires_runner');
  if(input.action!=='record')throw new Error('record_action_only');
@@ -33,6 +36,10 @@ export async function recordReconciliation(tables:TableClient,input:ReconcileRes
  if(input.outcome!=='compared'&&input.passed)throw new Error('passed_requires_compared');
  const c=(v:string|null)=>v===null?null:canonicalDecimal(v);
  const tolerance=canonicalDecimal(input.tolerance),abs=c(input.abs_diff);
+ const text=(d:unknown,k:string)=>{const v=(d as Record<string,unknown>|null|undefined)?.[k];return v===undefined?null:v;};
+ const lt=text(input.detail,'left_text'),rt=text(input.detail,'right_text');
+ for(const e of await tables.select('dq_reconciliations',{pair:input.pair,natural_key:input.natural_key}))
+  if(e.outcome===input.outcome&&e.passed===input.passed&&e.left_value===c(input.left_value)&&e.right_value===c(input.right_value)&&text(e.detail,'left_text')===lt&&text(e.detail,'right_text')===rt)return {id:String(e.id),duplicate:true};
  const id=randomUUID();
  await tables.insert('dq_reconciliations',{
   id,dataset:DATASETS.reconcile(input.pair),pair:input.pair,kind:input.kind,outcome:input.outcome,natural_key:input.natural_key,
@@ -41,5 +48,5 @@ export async function recordReconciliation(tables:TableClient,input:ReconcileRes
   detail:{...input.detail,tolerance_exact:tolerance,...(abs===null?{}:{abs_diff_exact:abs}),...(input.inputs_hash===undefined?{}:{inputs_hash:input.inputs_hash})},
   batch_id:input.batch_id,cycle_id:null,issuer_id:null,market:null,attempt:null,created_at:(opts.now??(()=>new Date()))().toISOString(),
  });
- return id;
+ return {id,duplicate:false};
 }
diff --git a/src/lib/facts/deps.test.ts b/src/lib/facts/deps.test.ts
index 7f561b6..153795d 100644
--- a/src/lib/facts/deps.test.ts
+++ b/src/lib/facts/deps.test.ts
@@ -132,5 +132,8 @@ describe('productionSyncDeps step 9b date-mismatch recording (plan 3 Task 14c)',
   expect(rows).toHaveLength(1);
   expect(rows[0]).toMatchObject({dataset:'reconcile.sec.filing_date_vs_submissions',kind:'date',outcome:'compared',passed:false,batch_id:null,cycle_id:null,issuer_id:null,natural_key:`320193:${filing.source_ref}`});
   expect(rows[0].detail).toMatchObject({left_text:availableDate,right_text:'2020-01-02'});
+  // a second run over the same evidence adds no row (recorder dedupe)
+  await productionSyncDeps({deadline:null,codeVersion:SHA,admin:{} as never}).enrichAcceptance!('I','0000320193',budget);
+  expect(await tables.select('dq_reconciliations',{pair:'sec.filing_date_vs_submissions'})).toHaveLength(1);
  });
 });

exec
/bin/zsh -lc "cat src/lib/db/table-client.ts; cat src/lib/dq/reconcile/record.ts; rg 'recordReconciliation|dq_reconciliations|numeric' supabase/migrations -n | tail -60; cat src/lib/dq/reconcile/types.ts | head -140; find src scripts -iname '*agents*' -o -name CLAUDE.md" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
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
 const lt=text(input.detail,'left_text'),rt=text(input.detail,'right_text');
 for(const e of await tables.select('dq_reconciliations',{pair:input.pair,natural_key:input.natural_key}))
  if(e.outcome===input.outcome&&e.passed===input.passed&&e.left_value===c(input.left_value)&&e.right_value===c(input.right_value)&&text(e.detail,'left_text')===lt&&text(e.detail,'right_text')===rt)return {id:String(e.id),duplicate:true};
 const id=randomUUID();
 await tables.insert('dq_reconciliations',{
  id,dataset:DATASETS.reconcile(input.pair),pair:input.pair,kind:input.kind,outcome:input.outcome,natural_key:input.natural_key,
  left_source:input.left_source,right_source:input.right_source,left_value:c(input.left_value),right_value:c(input.right_value),
  abs_diff:abs,rel_diff:c(input.rel_diff),tolerance,passed:input.passed,
  detail:{...input.detail,tolerance_exact:tolerance,...(abs===null?{}:{abs_diff_exact:abs}),...(input.inputs_hash===undefined?{}:{inputs_hash:input.inputs_hash})},
  batch_id:input.batch_id,cycle_id:null,issuer_id:null,market:null,attempt:null,created_at:(opts.now??(()=>new Date()))().toISOString(),
 });
 return {id,duplicate:false};
}
supabase/migrations/20260728140000_cap_exempt_platform_audit.sql:279:  allowed := v_used + p_requested_micrormb::numeric
supabase/migrations/20260728140000_cap_exempt_platform_audit.sql:280:    <= p_daily_limit_micrormb::numeric;
supabase/migrations/20260728140000_cap_exempt_platform_audit.sql:284:      when v_used > 9223372036854775807::numeric
supabase/migrations/20260728140000_cap_exempt_platform_audit.sql:285:        then 9223372036854775807::numeric
supabase/migrations/20260728140000_cap_exempt_platform_audit.sql:359:     or p_cache_hit_input_tokens::numeric + p_cache_miss_input_tokens::numeric
supabase/migrations/20260728140000_cap_exempt_platform_audit.sql:360:       <> p_input_tokens::numeric then
supabase/migrations/20260515000000_initial_schema.sql:25:  last_price    numeric,
supabase/migrations/20260515000000_initial_schema.sql:41:  revenue       numeric,
supabase/migrations/20260515000000_initial_schema.sql:42:  net_income    numeric,
supabase/migrations/20260515000000_initial_schema.sql:43:  roe           numeric,
supabase/migrations/20260515000000_initial_schema.sql:44:  gross_margin  numeric,
supabase/migrations/20260515000000_initial_schema.sql:45:  free_cash_flow numeric,
supabase/migrations/20260515000000_initial_schema.sql:59:  weight        numeric default 1.0,
supabase/migrations/20260515000000_initial_schema.sql:100:  ai_confidence numeric check (ai_confidence between 0 and 10),
supabase/migrations/20260515000000_initial_schema.sql:104:  total_cost_usd numeric,
supabase/migrations/20260515000000_initial_schema.sql:123:  score         numeric check (score between 0 and 10),
supabase/migrations/20260515000000_initial_schema.sql:142:  confidence    numeric check (confidence between 0 and 10),
supabase/migrations/20260515000000_initial_schema.sql:161:  sentiment     numeric,
supabase/migrations/20260515000000_initial_schema.sql:179:  target_change_pct numeric,
supabase/migrations/20260728130000_usage_run_lifecycle.sql:182:     or p_cache_hit_input_tokens::numeric + p_cache_miss_input_tokens::numeric
supabase/migrations/20260728130000_usage_run_lifecycle.sql:183:       <> p_input_tokens::numeric
supabase/migrations/20260728130000_usage_run_lifecycle.sql:366:     or p_cache_hit_input_tokens::numeric + p_cache_miss_input_tokens::numeric
supabase/migrations/20260728130000_usage_run_lifecycle.sql:367:       <> p_input_tokens::numeric then
supabase/migrations/20260728130000_usage_run_lifecycle.sql:489:     or p_cache_hit_input_tokens::numeric + p_cache_miss_input_tokens::numeric
supabase/migrations/20260728130000_usage_run_lifecycle.sql:490:       <> p_input_tokens::numeric then
supabase/migrations/20260728130000_usage_run_lifecycle.sql:606:     or p_cache_hit_input_tokens::numeric + p_cache_miss_input_tokens::numeric
supabase/migrations/20260728130000_usage_run_lifecycle.sql:607:       <> p_input_tokens::numeric then
supabase/migrations/20261107090000_identifiers_and_dq.sql:4:-- the claim/1 review queue (op, target_key, detail, resolution columns); dq_reconciliations gains
supabase/migrations/20261107090000_identifiers_and_dq.sql:69:-- ---------------------------------------------------------------- dq_reconciliations: pairs, kinds, outcomes, cycle rows (§3.1, T2)
supabase/migrations/20261107090000_identifiers_and_dq.sql:71:  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'dq_reconciliations' and column_name = 'pair') then
supabase/migrations/20261107090000_identifiers_and_dq.sql:72:    alter table public.dq_reconciliations
supabase/migrations/20261107090000_identifiers_and_dq.sql:74:      add column kind text not null default 'numeric',
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
supabase/migrations/20261106090000_financial_facts.sql:79:  value            numeric not null,
supabase/migrations/20261106090000_financial_facts.sql:109:  value            numeric not null,
supabase/migrations/20261106090000_financial_facts.sql:421:         (x ->> 'period_start')::date, (x ->> 'period_end')::date, x ->> 'duration', (x ->> 'value')::numeric, x ->> 'unit',
supabase/migrations/20261106090000_financial_facts.sql:603:    -- spec 7.3: the chosen rows (those still existing) must all carry the same numeric value
supabase/migrations/20261106090000_financial_facts.sql:637:  select p_issuer, p_market, x ->> 'metric', (x ->> 'period_start')::date, (x ->> 'period_end')::date, x ->> 'duration', (x ->> 'value')::numeric,
supabase/migrations/20261106090000_financial_facts.sql:663:-- disclosure, numeric compare); non-ok rows carry null/false. p_history=false keeps current rows
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
/bin/zsh -lc "rg -n 'recordReconciliation\\(' src scripts; rg -n 'dq_reconciliations|left_value' supabase/migrations/202611050*; cat src/lib/facts/providers/sec-acceptance.ts | tail -110; rg -n 'recordDateMismatch|recordReconciliation' src/lib/facts/deps.ts; cat package.json | head -65; git status --short" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
src/lib/dq/reconcile/record.ts:20:export async function recordReconciliation(tables:TableClient,input:RecordInput,opts:{now?:()=>Date}={}):Promise<string>{return (await recordReconciliationDetailed(tables,input,opts)).id;}
src/lib/dq/reconcile/record.test.ts:12:  const id=await recordReconciliation(t,{...text({inputs_hash:'h'}),pair:'sec.filer_category',batch_id:null});
src/lib/dq/reconcile/record.test.ts:20:  await recordReconciliation(t,{...text({kind:'numeric',left_value:'1',right_value:'2',abs_diff:'1',rel_diff:'0.5',passed:false}),pair:'entities.isin_hkex_vs_gleif',batch_id:'b'});
src/lib/dq/reconcile/record.test.ts:21:  await recordReconciliation(t,{...text({kind:'date',passed:false,detail:{left_text:'2024-02-01',right_text:'2024-02-02'}}),pair:'sec.filing_date_vs_submissions',batch_id:'b'});
src/lib/dq/reconcile/record.test.ts:26:  const put=(over:Partial<ReconcileResultInput>,pair:Parameters<typeof recordReconciliation>[1]['pair']='sec.filer_category')=>recordReconciliation(t,{...text(over),pair,batch_id:null});
src/lib/dq/reconcile/record.test.ts:47:  await recordReconciliation(t,{...text({kind:'numeric',left_value:'1.10',right_value:'1e0',abs_diff:'0.100',rel_diff:'0.0',tolerance:'0.0050'}),pair:'sec.filer_category',batch_id:null},{now:()=>new Date('2026-01-02T03:04:05.000Z')});
src/lib/dq/reconcile/record.test.ts:58:  expect(await recordReconciliation(t,d('2024-02-01','2024-02-02'))).toBe(a.id);
src/lib/facts/deps.ts:78:   recordDateMismatch:async r=>{await recordReconciliation(tables,{...r,pair:DATE_MISMATCH_PAIR,batch_id:null});}},{issuerId:issuer,cik10},b),
supabase/migrations/20261105090000_dq_foundation.sql:55:create table if not exists public.dq_reconciliations (
supabase/migrations/20261105090000_dq_foundation.sql:61:  left_value   numeric,
supabase/migrations/20261105090000_dq_foundation.sql:70:create index if not exists dq_reconciliations_failed_idx on public.dq_reconciliations(dataset, created_at desc) where passed = false;
supabase/migrations/20261105090000_dq_foundation.sql:71:create index if not exists dq_reconciliations_batch_idx on public.dq_reconciliations(batch_id);
supabase/migrations/20261105090000_dq_foundation.sql:72:comment on column public.dq_reconciliations.tolerance is 'Relative tolerance: |left-right| <= tolerance * max(|left|,|right|,1)';
supabase/migrations/20261105090000_dq_foundation.sql:89:  foreach t in array array['ingest_batches','dq_quarantine','dq_reconciliations','dq_freshness'] loop
import type {SubmissionFiling,SubmissionsSnapshot} from '../../entities/identifiers/sec-submissions';
import {FactsDbError} from '../types';
import type {Budget,FactsDb,FilingRow} from '../types';

/** Pending filings older than this (days before today) are not looked up unless fullHistory. */
export const ACCEPTANCE_LOOKBACK_DAYS=3*365;
export const ACCEPTANCE_SOURCE='sec_submissions' as const;
export const DATE_MISMATCH_PAIR='sec.filing_date_vs_submissions' as const;
/** page = the SubmissionFiling page ('recent' = the main document, else the files[] page name), kept per entry for mismatch evidence. */
export interface AcceptanceEntry{accessionNumber:string;filingDate:string;form:string;acceptedAt:string|null;page:string}
/** Margin before the earliest pending available_date: a mismatching filingDate may precede it. */
export const ACCEPTANCE_COVER_MARGIN_DAYS=7;
export interface AcceptanceDeps{
 db:Pick<FactsDb,'filingsOfIssuer'|'setFilingAcceptance'>;
 /** coverFrom ('YYYY-MM-DD') is passed to fetchSubmissions: every files[] page with filingTo >= coverFrom is fetched (plan audit R3). */
 submissions:(cik10:string,b:Budget,coverFrom:string)=>Promise<SubmissionsSnapshot>;
 /** records one sec.filing_date_vs_submissions result (record.ts, plan-3 Part D); absent → returned in `mismatches` only */
 recordDateMismatch?:(r:ReconcileResultInput)=>Promise<void>;
 /** clock for the lookback window (default: real time) */
 now?:()=>Date;
}
export interface AcceptanceOptions{/** lift the ACCEPTANCE_LOOKBACK_DAYS bound (script --full-history) */fullHistory?:boolean}
export interface AcceptanceOutcome{issuerId:string;counts:BatchCounts;errors:BatchError[];mismatches:ReconcileResultInput[];snapshotSha256:string|null}

const SEC_TS=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
/** SEC acceptanceDateTime ('2024-11-01T06:01:36.000Z', UTC) → ISO; anything else (incl. rolled-over dates) → null. */
export function parseAcceptanceDateTime(v:unknown):string|null{
 if(typeof v!=='string'||!SEC_TS.test(v))return null;
 const ms=Date.parse(v);if(!Number.isFinite(ms))return null;
 const iso=new Date(ms).toISOString();
 return iso.slice(0,19)===v.slice(0,19)?iso:null;
}
/** accessionNumber → entry. An accession listed twice with different filing dates or acceptance times is ambiguous and left out. */
export function acceptanceIndex(entries:readonly SubmissionFiling[]):{index:Map<string,AcceptanceEntry>;ambiguous:string[]}{
 const index=new Map<string,AcceptanceEntry>();const bad=new Set<string>();
 for(const e of entries){
  const x:AcceptanceEntry={accessionNumber:e.accessionNumber,filingDate:e.filingDate,form:e.form,acceptedAt:parseAcceptanceDateTime(e.acceptanceDateTime),page:e.page};
  const seen=index.get(x.accessionNumber);
  if(seen&&(seen.filingDate!==x.filingDate||seen.acceptedAt!==x.acceptedAt))bad.add(x.accessionNumber);
  else if(!seen)index.set(x.accessionNumber,x);
 }
 for(const a of bad)index.delete(a);
 return {index,ambiguous:[...bad].sort()};
}
/** earliest pending available_date − ACCEPTANCE_COVER_MARGIN_DAYS, as YYYY-MM-DD. */
export function acceptanceCoverFrom(pending:readonly Pick<FilingRow,'available_date'>[]):string{
 const min=pending.map(f=>f.available_date).sort()[0];
 const d=new Date(`${min}T00:00:00Z`);d.setUTCDate(d.getUTCDate()-ACCEPTANCE_COVER_MARGIN_DAYS);
 return d.toISOString().slice(0,10);
}
/** sha256 of the document an entry came from: the main document for 'recent', else that files[] page (null if not fetched). */
export const pageSha256=(snap:SubmissionsSnapshot,page:string):string|null=>page==='recent'?snap.main.sha256:snap.pages.find(p=>p.name===page)?.sha256??null;
/** The sec.filing_date_vs_submissions result of one filing (natural key <cik>:<accession>, dates compared as text); the right side cites the entry's own page and hash. */
export function filingDateMismatch(cik:string,f:FilingRow,e:AcceptanceEntry,pageSha:string|null):ReconcileResultInput{
 return {natural_key:`${cik}:${f.source_ref}`,kind:'date',outcome:'compared',passed:false,left_value:null,right_value:null,abs_diff:null,rel_diff:null,tolerance:'0',
  left_source:'filings.available_date',right_source:'sec_submissions.filingDate',action:'record',
  detail:{left_text:f.available_date,right_text:e.filingDate,left:{filing_id:f.filing_id,source_ref:f.source_ref},right:e.page==='recent'
   ?{document:'submissions',sha256:pageSha,locator:`filings.recent[accessionNumber=${e.accessionNumber}]`}
   :{document:e.page,sha256:pageSha,locator:`${e.page}[accessionNumber=${e.accessionNumber}]`}}};
}

export async function enrichAcceptance(deps:AcceptanceDeps,issuer:{issuerId:string;cik10:string},budget:Budget,opts:AcceptanceOptions={}):Promise<AcceptanceOutcome>{
 const out:AcceptanceOutcome={issuerId:issuer.issuerId,counts:emptyCounts(),errors:[],mismatches:[],snapshotSha256:null};
 const all=(await deps.db.filingsOfIssuer(issuer.issuerId,'US',{})).filter(f=>f.source==='edgar'&&f.accepted_at===null);
 const cutoff=new Date((deps.now?.()??new Date()).getTime()-ACCEPTANCE_LOOKBACK_DAYS*86_400_000).toISOString().slice(0,10);
 const pending=opts.fullHistory?all:all.filter(f=>f.available_date>=cutoff);
 const outOfWindow=all.length-pending.length;
 const outSummary=()=>{if(outOfWindow>0)out.errors.push({code:'skipped_summary',key:`${issuer.issuerId}:acceptance`,message:JSON.stringify({acceptance_out_of_window:outOfWindow})});return out;};
 if(pending.length===0)return outSummary();
 let snap:SubmissionsSnapshot;
 try{snap=await deps.submissions(issuer.cik10,budget,acceptanceCoverFrom(pending));}
 catch(e){out.errors.push({code:'sec_unavailable',key:issuer.issuerId,message:(e instanceof Error?e.message:String(e)).slice(0,200)});return out;}
 out.snapshotSha256=snap.main.sha256;
 const {index,ambiguous}=acceptanceIndex(snap.parsed.filings);
 const cik=issuer.cik10.replace(/^0+(?=\d)/,'');
 const amb=new Set(ambiguous);
 let notFound=0,unrecorded=0,ambiguousHit=0,mismatch=0;
 for(let i=0;i<pending.length;i++){
  const f=pending[i];
  if(budget.signal.aborted||budget.remainingMs()<=0){
   out.errors.push({code:'deadline_hit',key:`${issuer.issuerId}:acceptance`,message:JSON.stringify({remaining:pending.length-i})});break;
  }
  if(amb.has(f.source_ref)){ambiguousHit++;continue;}   // conflicting copies: never guess
  const e=index.get(f.source_ref);
  if(!e){notFound++;continue;}
  if(e.filingDate!==f.available_date){
   const r=filingDateMismatch(cik,f,e,pageSha256(snap,e.page));out.mismatches.push(r);mismatch++;
   if(deps.recordDateMismatch){
    try{await deps.recordDateMismatch(r);}
    catch(err){out.errors.push({code:'reconcile_record_failed',key:f.source_ref,message:(err instanceof Error?err.message:String(err)).slice(0,200)});}
   }else unrecorded++;
   continue;
  }
  if(e.acceptedAt===null){notFound++;continue;}
  out.counts.fetched++;
  try{if(await deps.db.setFilingAcceptance(f.filing_id,e.acceptedAt,ACCEPTANCE_SOURCE))out.counts.inserted++;else out.counts.duplicates++;}
  catch(err){
   if(!(err instanceof FactsDbError)||err.code!=='acceptance_conflict')throw err;
   out.counts.failed++;out.errors.push({code:'acceptance_conflict',key:f.source_ref});
  }
 }
 const summary:Record<string,number>={};
 if(notFound>0)summary.acceptance_not_found=notFound;
 if(ambiguousHit>0)summary.acceptance_ambiguous=ambiguousHit;
 if(mismatch>0)summary.acceptance_mismatch=mismatch;
 if(unrecorded>0)summary.filing_date_mismatch_unrecorded=unrecorded;
 if(outOfWindow>0)summary.acceptance_out_of_window=outOfWindow;
 if(Object.keys(summary).length>0)out.errors.push({code:'skipped_summary',key:`${issuer.issuerId}:acceptance`,message:JSON.stringify(summary)});
 return out;
}
17:import {recordReconciliation} from '../dq/reconcile/record';
78:   recordDateMismatch:async r=>{await recordReconciliation(tables,{...r,pair:DATE_MISMATCH_PAIR,batch_id:null});}},{issuerId:issuer,cik10},b),
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
git: error: couldn't create cache file '/tmp/xcrun_db-UVwORuE5' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-DAlQSEhA' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/14c-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/14c-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/14c-review-fix2.md
?? docs/audits/2026-11-05-data-foundation-3/codex/14c-review.md

codex
The argument-parsing and route refactors preserve existing behavior, but the new recorder does not reliably provide idempotency for production numeric values or concurrent writers.

Full review comments:

- [P2] Normalize database numeric values before duplicate comparison — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/reconcile/record.ts:42-42
  For numeric reconciliations, Supabase returns PostgreSQL `numeric` columns as JSON numbers, while `canonicalDecimal()` returns strings. Consequently, `e.left_value === c(input.left_value)` fails even for identical values, so production reruns keep inserting rows although the in-memory tests pass. Compare losslessly preserved canonical values or perform the numeric equality check in PostgreSQL, and cover the production response shape in a test.

- [P2] Make duplicate detection and insertion atomic — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/reconcile/record.ts:41-44
  When facts-sync and the acceptance-enrichment script process the same mismatch concurrently, both calls can complete this SELECT before either inserts, then write distinct UUID rows and report `duplicate:false`. The existing unique index only covers non-null cycle IDs, so it cannot protect these out-of-cycle records. Enforce the deduplication identity with a database constraint or an atomic, serialized database operation, and test concurrent calls.
The argument-parsing and route refactors preserve existing behavior, but the new recorder does not reliably provide idempotency for production numeric values or concurrent writers.

Full review comments:

- [P2] Normalize database numeric values before duplicate comparison — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/reconcile/record.ts:42-42
  For numeric reconciliations, Supabase returns PostgreSQL `numeric` columns as JSON numbers, while `canonicalDecimal()` returns strings. Consequently, `e.left_value === c(input.left_value)` fails even for identical values, so production reruns keep inserting rows although the in-memory tests pass. Compare losslessly preserved canonical values or perform the numeric equality check in PostgreSQL, and cover the production response shape in a test.

- [P2] Make duplicate detection and insertion atomic — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/reconcile/record.ts:41-44
  When facts-sync and the acceptance-enrichment script process the same mismatch concurrently, both calls can complete this SELECT before either inserts, then write distinct UUID rows and report `duplicate:false`. The existing unique index only covers non-null cycle IDs, so it cannot protect these out-of-cycle records. Enforce the deduplication identity with a database constraint or an atomic, serialized database operation, and test concurrent calls.

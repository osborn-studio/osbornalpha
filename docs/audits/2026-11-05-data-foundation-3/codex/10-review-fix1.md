OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b095-2d83-7411-8dc3-f8eaa0846ed3
--------
user
commit 51ecae3
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 51ecae3; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 1067ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-M8AldDIA' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-xmOwHUQ6' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/10-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/10-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/10-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-y8MAOY2b' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-bwQ8rES3' (errno=Operation not permitted)
51ecae3 fix(facts): re-resolve materialize target per attempt; metrics guard on empty reads; metrics conflicts (Task 10 Codex)
 src/app/api/facts/[ticker]/metrics/route.test.ts | 25 ++++++++++++++++++++++-
 src/app/api/facts/[ticker]/metrics/route.ts      | 26 +++++++++++++++---------
 src/lib/facts/derive.test.ts                     | 16 +++++++++++++++
 src/lib/facts/derive.ts                          |  3 ++-
 4 files changed, 58 insertions(+), 12 deletions(-)

exec
/bin/zsh -lc 'pwd; for d in . .. ../.. ../../.. ../../../.. ../../../../..; do for f in AGENTS.override.md AGENTS.md CLAUDE.md; do if [ -f "$d/$f" ]; then echo ==== $d/$f; cat "$d/$f"; fi; done; done; git show 51ecae3 --; cat '"'src/app/api/facts/[ticker]/metrics/route.ts'" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
zsh:1: === not found

exec
/bin/zsh -lc 'for d in . .. ../.. ../../.. ../../../.. ../../../../..; do for f in AGENTS.override.md AGENTS.md CLAUDE.md; do if [ -f "$d/$f" ]; then printf '"'\\n%s\\n' \""'$d/$f"; cat "$d/$f"; fi; done; done; git show 51ecae3 --; cat '"'src/app/api/facts/[ticker]/metrics/route.ts'" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:

../../../AGENTS.md
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-VVhoox1e' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-xDOfiBdV' (errno=Operation not permitted)
commit 51ecae30fd9dea5d674abee8ca98691fd39de168
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 03:18:36 2026 -0800

    fix(facts): re-resolve materialize target per attempt; metrics guard on empty reads; metrics conflicts (Task 10 Codex)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/app/api/facts/[ticker]/metrics/route.test.ts b/src/app/api/facts/[ticker]/metrics/route.test.ts
index d5aa041..feacfbe 100644
--- a/src/app/api/facts/[ticker]/metrics/route.test.ts
+++ b/src/app/api/facts/[ticker]/metrics/route.test.ts
@@ -35,7 +35,8 @@ describe('GET /api/facts/[ticker]/metrics',()=>{
   expect(body).toMatchObject({issuerId:ISSUER,ticker:'AAPL',market:'US',asOf:null,mappingGen:1,formulaVersion:FORMULA_VERSION,truncated:false,stale:false,lineage:[ISSUER],resolution:{tickerAsOf:expect.any(String),issuerId:ISSUER,validFromMethod:null}});
   expect(body.metrics).toEqual([{metric:'gross_margin',periodStart:'2024-01-01',periodEnd:'2024-03-31',duration:'3M',value:'0.4',unit:'pure',inputUnit:'USD',basis:'us_standard',inputs:[{fact_id:'f1',concept:'gross_profit',filing_id:'g',available_date:'2024-05-01'}],basedOnRev:3,basedOnLineage:V3}]);
   expect(mocks.metricsOfIssuer).toHaveBeenCalledWith(ISSUER,'US',FORMULA_VERSION);
-  expect(mocks.readFactsLineage).not.toHaveBeenCalled();
+  expect(mocks.readFactsLineage).toHaveBeenCalledTimes(1);   // conflicts only, inside the bracket
+  expect(body.conflicts).toEqual([]);
   expect(mocks.lineageOf).toHaveBeenCalledTimes(2);expect(mocks.stateRevs).toHaveBeenCalledTimes(2);
   expect(mocks.stateRevs).toHaveBeenCalledWith([ISSUER],'US');
   expect(res.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=60');
@@ -116,4 +117,26 @@ describe('GET /api/facts/[ticker]/metrics',()=>{
   mocks.resolve.mockResolvedValue(null);
   expect((await get('AAPL','')).status).toBe(404);
  });
+ it('T8: the after-guard also runs for an empty read: moving membership or revs make it stale with the short cache',async()=>{
+  mocks.metricsOfIssuer.mockResolvedValue([]);
+  mocks.stateRevs.mockResolvedValueOnce(V3).mockResolvedValue([{issuer_id:ISSUER,state_rev:4}]);
+  const a=await get('AAPL','');
+  expect(await a.json()).toMatchObject({stale:true,metrics:[]});
+  expect(a.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=30');
+  mocks.lineageOf.mockResolvedValueOnce([ISSUER]).mockResolvedValue([ISSUER,SRC]);
+  mocks.stateRevs.mockReset();mocks.stateRevs.mockResolvedValue(V3);
+  const b=await get('AAPL','');
+  expect(await b.json()).toMatchObject({stale:true,metrics:[],conflicts:[]});
+  expect(b.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=30');
+ });
+ it('conflicts: exposed on the materialized read (from the bracketed lineage read) and on the live asOf read, in the facts-route shape; dropped when stale',async()=>{
+  const c={key:{concept:'revenue',period_end:'2024-03-31'},available_date:'2024-05-01',fact_ids:['x','y']};
+  mocks.readFactsLineage.mockResolvedValue({stateRevs:V3,lineage:[ISSUER],conflicts:[c],truncated:false,rows:[]});
+  const m=await (await get('AAPL','')).json();
+  expect(m.conflicts).toEqual([{key:c.key,availableDate:'2024-05-01',factIds:['x','y']}]);
+  const live=await (await get('AAPL','asOf=2024-06-30')).json();
+  expect(live.conflicts).toEqual([{key:c.key,availableDate:'2024-05-01',factIds:['x','y']}]);
+  mocks.stateRevs.mockResolvedValueOnce(V3).mockResolvedValue([{issuer_id:ISSUER,state_rev:4}]);
+  expect(await (await get('AAPL','')).json()).toMatchObject({stale:true,conflicts:[]});
+ });
 });
diff --git a/src/app/api/facts/[ticker]/metrics/route.ts b/src/app/api/facts/[ticker]/metrics/route.ts
index 21b58e0..99fbba9 100644
--- a/src/app/api/facts/[ticker]/metrics/route.ts
+++ b/src/app/api/facts/[ticker]/metrics/route.ts
@@ -6,14 +6,16 @@
 // metrics:[], stale:true, STALE_CACHE_CONTROL (never recomputed inline: the visibility paths
 // re-materialise). With asOf: a live deriveLineageMetrics over the read_facts_lineage envelope
 // (asOf replay), basedOnRev = T's rev, basedOnLineage = the envelope vector. Metric names are
-// validated per market; tickerAsOf picks the ticker's owner at that date.
+// validated per market; tickerAsOf picks the ticker's owner at that date. `conflicts` = the cross-issuer
+// conflicts withheld from current values (same shape as the facts route), read from a
+// read_facts_lineage call inside the same before/after bracket (live branch: the envelope itself).
 import {NextResponse} from 'next/server';
 import {MAPPING_GEN} from '@/lib/facts/concepts';
 import {lineageRevsEqual} from '@/lib/facts/db';
 import {DERIVE_CONCEPTS,FORMULA_VERSION,deriveLineageMetrics,metricNames} from '@/lib/facts/derive';
-import {FRESH_METRICS_CACHE_CONTROL,STALE_CACHE_CONTROL,QueryError,TICKER_RE,dateParam,decodeTicker,errorResponse,failureResponse,intParam,listParam,paramErrorResponse,publicClients,publicResolution,readParams,resolvePublicIssuer,successHeaders,tickerAsOfParam,utcDate} from '@/lib/facts/public-route';
+import {FRESH_METRICS_CACHE_CONTROL,STALE_CACHE_CONTROL,QueryError,TICKER_RE,dateParam,decodeTicker,errorResponse,failureResponse,intParam,listParam,paramErrorResponse,publicClients,publicConflict,publicResolution,readParams,resolvePublicIssuer,successHeaders,tickerAsOfParam,utcDate} from '@/lib/facts/public-route';
 import {FactsDbError} from '@/lib/facts/types';
-import type {MetricRow} from '@/lib/facts/types';
+import type {LineageConflict,MetricRow} from '@/lib/facts/types';
 
 export const dynamic='force-dynamic';
 const PARAMS=['metrics','from','to','asOf','limit','tickerAsOf'] as const;
@@ -39,24 +41,28 @@ export async function GET(req:Request,{params}:{params:Promise<{ticker:string}>}
   catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
   const target=issuer.issuerId;
   const lineage=await db.lineageOf(target);
-  let rows:MetricRow[],truncated=false,stale=false;
+  let rows:MetricRow[],truncated=false,stale=false,conflicts:LineageConflict[]=[];
   if(asOf===undefined){
    const before=await db.stateRevs(lineage,issuer.market);
-   try{rows=await db.metricsOfIssuer(target,issuer.market,FORMULA_VERSION);}
-   catch(e){if(e instanceof FactsDbError&&e.message==='metrics_unstable'){rows=[];stale=true;}else throw e;}
-   if(!stale&&rows.length>0){
+   try{
+    rows=await db.metricsOfIssuer(target,issuer.market,FORMULA_VERSION);
+    // conflicts withheld from current values, read inside the same before/after bracket
+    const env=await db.readFactsLineage(lineage,issuer.market,{concepts:[...DERIVE_CONCEPTS[issuer.market]],asOf:today});
+    conflicts=env.conflicts;if(env.truncated)truncated=true;
+   }catch(e){if(e instanceof FactsDbError&&e.message==='metrics_unstable'){rows=[];stale=true;}else throw e;}
+   if(!stale){   // the guard runs for an empty read too: a lineage or rev that moved during it is stale, never an empty answer
     const lineageAfter=await db.lineageOf(target);
     const after=await db.stateRevs(lineageAfter,issuer.market);
-    if(lineageAfter.join(',')!==lineage.join(',')||!lineageRevsEqual(before,after)||rows.some(m=>!lineageRevsEqual(m.based_on_lineage,before))){rows=[];stale=true;}
+    if(lineageAfter.join(',')!==lineage.join(',')||!lineageRevsEqual(before,after)||rows.some(m=>!lineageRevsEqual(m.based_on_lineage,before))){rows=[];conflicts=[];stale=true;}
    }
   }else{
    const env=await db.readFactsLineage(lineage,issuer.market,{concepts:[...DERIVE_CONCEPTS[issuer.market]],asOf,history:true});
-   truncated=env.truncated;
+   truncated=env.truncated;conflicts=env.conflicts;
    rows=truncated?[]:deriveLineageMetrics(env.rows,target,lineage,{market:issuer.market,asOf,basedOn:env.stateRevs});
   }
   const wanted=metrics?new Set(metrics):null;
   rows=rows.filter(m=>(!wanted||wanted.has(m.metric))&&(from===undefined||m.period_end>=from)&&(to===undefined||m.period_end<=to)).slice(0,limit);
-  const body={issuerId:target,ticker:issuer.ticker,market:issuer.market,asOf:asOf??null,mappingGen:MAPPING_GEN,formulaVersion:FORMULA_VERSION,truncated,stale,lineage,resolution:publicResolution(issuer),metrics:rows.map(publicMetric)};
+  const body={issuerId:target,ticker:issuer.ticker,market:issuer.market,asOf:asOf??null,mappingGen:MAPPING_GEN,formulaVersion:FORMULA_VERSION,truncated,stale,lineage,resolution:publicResolution(issuer),conflicts:conflicts.map(publicConflict),metrics:rows.map(publicMetric)};
   return NextResponse.json(body,{headers:stale?{'Cache-Control':STALE_CACHE_CONTROL}:asOf===undefined&&rows.length>0?{'Cache-Control':FRESH_METRICS_CACHE_CONTROL}:successHeaders(now,asOf,rows.length===0||truncated)});
  }catch(e){return failureResponse(e,'facts/metrics','metrics read failed');}
 }
diff --git a/src/lib/facts/derive.test.ts b/src/lib/facts/derive.test.ts
index d27bd2c..8b9a19d 100644
--- a/src/lib/facts/derive.test.ts
+++ b/src/lib/facts/derive.test.ts
@@ -4,6 +4,7 @@ import {FactsDbError} from './types';
 import type {Duration,FactRow,LineageRev,Market,MetricRow,ReadFactsLineageResult} from './types';
 import {FORMULA_VERSION,deriveLineageMetrics,deriveMetrics,materialize,metricNames} from './derive';
 import type {MaterializeDb} from './derive';
+import {memoryFactsDb} from './memory-facts-db';
 
 let n=0;
 type P=Partial<FactRow>&{concept:string;period_end:string;value:string;duration:Duration};
@@ -298,4 +299,19 @@ describe('materialize (lineage contract, spec §4.4 / T9)',()=>{
   await expect(materialize(db,'I','US')).rejects.toMatchObject({code:'read_truncated'});
   expect(calls).toEqual([]);
  });
+ it('re-resolves the target inside the retry: a merge of T into U before the first replace makes the retry materialise U',async()=>{
+  const mem=memoryFactsDb();
+  await mem.setMerge('00000000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-00000000000b','00000000-0000-4000-8000-0000000000ff');   // a→b: scopes for both exist
+  const T='00000000-0000-4000-8000-00000000000b',U='00000000-0000-4000-8000-00000000000c',A='00000000-0000-4000-8000-00000000000a';
+  mem.setTopology({[U]:{status:'active',merged_into:null}});
+  let merged=false;const replaced:string[]=[];
+  const db:MaterializeDb={targetOf:i=>mem.targetOf(i),lineageOf:t=>mem.lineageOf(t),readFactsLineage:(i,m,o)=>mem.readFactsLineage(i,m,o),
+   async replaceMetricsLineage(i,m,b,r){
+    if(!merged){merged=true;await mem.setMerge(T,U,'00000000-0000-4000-8000-0000000000ff');}   // T becomes merged into U before the first replace lands
+    replaced.push(i);return mem.replaceMetricsLineage(i,m,b,r);
+   }};
+  const res=await materialize(db,A,'US',{today:'2025-01-01'});
+  expect(res).toMatchObject({retried:true,target:U});
+  expect(replaced).toEqual([T,U]);
+ });
 });
diff --git a/src/lib/facts/derive.ts b/src/lib/facts/derive.ts
index fdeaded..c0cd8cc 100644
--- a/src/lib/facts/derive.ts
+++ b/src/lib/facts/derive.ts
@@ -229,8 +229,9 @@ export function deriveLineageMetrics(rows:FactRow[],target:string,lineage:readon
 /** as_of = today; materialises T(issuer) over its current lineage (see the header). */
 export async function materialize(db:MaterializeDb,issuer:string,market:Market,opts:{today?:string}={}):Promise<MaterializeResult>{
  const asOf=opts.today??new Date().toISOString().slice(0,10);
- const target=await db.targetOf(issuer);
  for(let attempt=0;;attempt++){
+  // the target is resolved inside each attempt: a merge that makes the first replace stale moves T, and the retry must follow it
+  const target=await db.targetOf(issuer);
   const lineage=await db.lineageOf(target);
   const env=await db.readFactsLineage(lineage,market,{concepts:[...DERIVE_CONCEPTS[market]],asOf,history:true});
   if(env.truncated)throw new FactsDbError('read_truncated',`read_facts_lineage truncated for ${target}/${market}`);
// src/app/api/facts/[ticker]/metrics/route.ts
// Public derived metrics (spec §9; plan 3 §4.4, T8). Without asOf: the materialized
// financial_metrics rows of the lineage target T for the current FORMULA_VERSION, served only when
// the lineage members and their state_revs read before and after the metrics read are identical
// and every row's based_on_lineage equals that vector; any mismatch or an unstable read →
// metrics:[], stale:true, STALE_CACHE_CONTROL (never recomputed inline: the visibility paths
// re-materialise). With asOf: a live deriveLineageMetrics over the read_facts_lineage envelope
// (asOf replay), basedOnRev = T's rev, basedOnLineage = the envelope vector. Metric names are
// validated per market; tickerAsOf picks the ticker's owner at that date. `conflicts` = the cross-issuer
// conflicts withheld from current values (same shape as the facts route), read from a
// read_facts_lineage call inside the same before/after bracket (live branch: the envelope itself).
import {NextResponse} from 'next/server';
import {MAPPING_GEN} from '@/lib/facts/concepts';
import {lineageRevsEqual} from '@/lib/facts/db';
import {DERIVE_CONCEPTS,FORMULA_VERSION,deriveLineageMetrics,metricNames} from '@/lib/facts/derive';
import {FRESH_METRICS_CACHE_CONTROL,STALE_CACHE_CONTROL,QueryError,TICKER_RE,dateParam,decodeTicker,errorResponse,failureResponse,intParam,listParam,paramErrorResponse,publicClients,publicConflict,publicResolution,readParams,resolvePublicIssuer,successHeaders,tickerAsOfParam,utcDate} from '@/lib/facts/public-route';
import {FactsDbError} from '@/lib/facts/types';
import type {LineageConflict,MetricRow} from '@/lib/facts/types';

export const dynamic='force-dynamic';
const PARAMS=['metrics','from','to','asOf','limit','tickerAsOf'] as const;
const DEFAULT_LIMIT=200,MAX_LIMIT=1000;
const publicMetric=(m:MetricRow)=>({metric:m.metric,periodStart:m.period_start,periodEnd:m.period_end,duration:m.duration,value:m.value,unit:m.unit,inputUnit:m.input_unit,basis:m.basis,inputs:m.inputs,basedOnRev:m.based_on_rev,basedOnLineage:m.based_on_lineage});

export async function GET(req:Request,{params}:{params:Promise<{ticker:string}>}){
 const now=new Date();const today=utcDate(now);
 const {ticker:raw}=await params;const ticker=decodeTicker(raw);
 if(ticker===null||!TICKER_RE.test(ticker))return errorResponse('invalid_parameter:ticker','invalid ticker',400);
 let p:Map<string,string>,from:string|undefined,to:string|undefined,asOf:string|undefined,limit:number,tickerAsOf:string;
 try{
  p=readParams(new URL(req.url),PARAMS);
  from=dateParam(p,'from');to=dateParam(p,'to');asOf=dateParam(p,'asOf');limit=intParam(p,'limit',DEFAULT_LIMIT,MAX_LIMIT);tickerAsOf=tickerAsOfParam(p,today);
  if(asOf!==undefined&&asOf>today)throw new QueryError('asOf');
 }catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
 try{
  const {tables,db}=publicClients();
  const issuer=await resolvePublicIssuer(tables,ticker,today,tickerAsOf);
  if(!issuer)return errorResponse('unknown_ticker','no issuer for ticker',404);
  let metrics:string[]|undefined;
  try{metrics=listParam(p,'metrics',new Set(metricNames(issuer.market)),metricNames(issuer.market).length);}
  catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
  const target=issuer.issuerId;
  const lineage=await db.lineageOf(target);
  let rows:MetricRow[],truncated=false,stale=false,conflicts:LineageConflict[]=[];
  if(asOf===undefined){
   const before=await db.stateRevs(lineage,issuer.market);
   try{
    rows=await db.metricsOfIssuer(target,issuer.market,FORMULA_VERSION);
    // conflicts withheld from current values, read inside the same before/after bracket
    const env=await db.readFactsLineage(lineage,issuer.market,{concepts:[...DERIVE_CONCEPTS[issuer.market]],asOf:today});
    conflicts=env.conflicts;if(env.truncated)truncated=true;
   }catch(e){if(e instanceof FactsDbError&&e.message==='metrics_unstable'){rows=[];stale=true;}else throw e;}
   if(!stale){   // the guard runs for an empty read too: a lineage or rev that moved during it is stale, never an empty answer
    const lineageAfter=await db.lineageOf(target);
    const after=await db.stateRevs(lineageAfter,issuer.market);
    if(lineageAfter.join(',')!==lineage.join(',')||!lineageRevsEqual(before,after)||rows.some(m=>!lineageRevsEqual(m.based_on_lineage,before))){rows=[];conflicts=[];stale=true;}
   }
  }else{
   const env=await db.readFactsLineage(lineage,issuer.market,{concepts:[...DERIVE_CONCEPTS[issuer.market]],asOf,history:true});
   truncated=env.truncated;conflicts=env.conflicts;
   rows=truncated?[]:deriveLineageMetrics(env.rows,target,lineage,{market:issuer.market,asOf,basedOn:env.stateRevs});
  }
  const wanted=metrics?new Set(metrics):null;
  rows=rows.filter(m=>(!wanted||wanted.has(m.metric))&&(from===undefined||m.period_end>=from)&&(to===undefined||m.period_end<=to)).slice(0,limit);
  const body={issuerId:target,ticker:issuer.ticker,market:issuer.market,asOf:asOf??null,mappingGen:MAPPING_GEN,formulaVersion:FORMULA_VERSION,truncated,stale,lineage,resolution:publicResolution(issuer),conflicts:conflicts.map(publicConflict),metrics:rows.map(publicMetric)};
  return NextResponse.json(body,{headers:stale?{'Cache-Control':STALE_CACHE_CONTROL}:asOf===undefined&&rows.length>0?{'Cache-Control':FRESH_METRICS_CACHE_CONTROL}:successHeaders(now,asOf,rows.length===0||truncated)});
 }catch(e){return failureResponse(e,'facts/metrics','metrics read failed');}
}

exec
/bin/zsh -lc "find src -name 'AGENTS*' -o -name CLAUDE.md; sed -n '160,280p' src/lib/facts/derive.ts; rg -n 'readFactsLineage|conflicts|history' src/lib/facts/db.ts | tail -35; rg -n 'conflict|history' supabase/migrations/*lineage*" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 0ms:
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
 * based_on_rev = T's rev in basedOn; based_on_lineage = basedOn.
 */
export function deriveLineageMetrics(rows:FactRow[],target:string,lineage:readonly string[],opts:{market:Market;asOf:string;basedOn:LineageRev[]}):MetricRow[]{
 const members=new Set(lineage);
 if(!members.has(target)||rows.some(r=>!members.has(r.issuer_id)||r.market!==opts.market))throw new Error(`derive_scope_mismatch:${target}/${opts.market}`);
 const basedOnRev=opts.basedOn.find(x=>x.issuer_id===target)?.state_rev??0;
 return deriveMetrics(rows.map(r=>r.issuer_id===target?r:{...r,issuer_id:target}),{market:opts.market,asOf:opts.asOf,basedOnRev,basedOn:opts.basedOn});
}
/** as_of = today; materialises T(issuer) over its current lineage (see the header). */
export async function materialize(db:MaterializeDb,issuer:string,market:Market,opts:{today?:string}={}):Promise<MaterializeResult>{
 const asOf=opts.today??new Date().toISOString().slice(0,10);
 for(let attempt=0;;attempt++){
  // the target is resolved inside each attempt: a merge that makes the first replace stale moves T, and the retry must follow it
  const target=await db.targetOf(issuer);
  const lineage=await db.lineageOf(target);
  const env=await db.readFactsLineage(lineage,market,{concepts:[...DERIVE_CONCEPTS[market]],asOf,history:true});
  if(env.truncated)throw new FactsDbError('read_truncated',`read_facts_lineage truncated for ${target}/${market}`);
  const rows=deriveLineageMetrics(env.rows,target,lineage,{market,asOf,basedOn:env.stateRevs});
  const stateRev=env.stateRevs.find(x=>x.issuer_id===target)?.state_rev??0;
  try{const n=await db.replaceMetricsLineage(target,market,env.stateRevs,rows);return {rows:n,stateRev,retried:attempt>0,target,basedOn:env.stateRevs};}
  catch(e){if(attempt===0&&e instanceof FactsDbError&&e.code==='stale_computation')continue;throw e;}
 }
}
88:export function readArgs(issuer:string,market:Market,o:ReadFactsOptions){return {p_issuer:issuer,p_market:market,p_concepts:o.concepts,p_as_of:o.asOf,p_from:o.from??null,p_to:o.to??null,p_history:o.history===true,p_limit:o.limit??null,p_include_non_ok:o.includeNonOk===true};}
89:export function readLineageArgs(issuers:string[],market:Market,o:ReadFactsOptions){return {p_issuers:issuers,p_market:market,p_concepts:o.concepts,p_as_of:o.asOf,p_from:o.from??null,p_to:o.to??null,p_history:o.history===true,p_limit:o.limit??null,p_include_non_ok:o.includeNonOk===true};}
90:export interface ReadFactsLineageEnvelope{state_revs:unknown;lineage:unknown;rows:Record<string,unknown>[];conflicts:unknown;truncated:boolean;row_count:number}
92: const conflicts=(Array.isArray(env.conflicts)?env.conflicts:[]) as {key?:unknown;available_date?:unknown;fact_ids?:unknown}[];
94:  conflicts:conflicts.map((c):LineageConflict=>({key:(c.key&&typeof c.key==='object'?c.key:{}) as Record<string,string|null>,available_date:String(c.available_date),fact_ids:Array.isArray(c.fact_ids)?c.fact_ids.map(String):[]})),
250:  async readFactsLineage(issuers,market,opts){return lineageResultFromEnvelope(await call<ReadFactsLineageEnvelope>('read_facts_lineage',readLineageArgs(issuers,market,opts)));},
zsh:1: no matches found: supabase/migrations/*lineage*

exec
/bin/zsh -lc "rg -n 'CREATE.*read_facts_lineage|create.*read_facts_lineage' .; cat 'src/app/api/facts/[ticker]/route.ts' | tail -55; rg -n 'conflict|history' src/lib/facts/memory-facts-db.ts | tail -35; ls -a | head -25" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
./supabase/migrations/20261107091000_facts_extensions.sql:198:create or replace function public.read_facts_lineage(
./docs/audits/2026-11-05-data-foundation-3/codex/8a-review.md:629:+create or replace function public.read_facts_lineage(
./docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:9390:create or replace function public.read_facts_lineage(
./docs/audits/2026-11-05-data-foundation-3/codex/8b-review.md:1884:  For a merged issuer, this query only checks competitors belonging to the candidate's filing issuer. If another member of its lineage already has a visible, different value for the same key and date, and the reconciliation runner has not yet created an open `lineage_conflict`, adoption succeeds. `read_facts_lineage` then reports a conflict and excludes the affected current value instead of exposing the adopted fact. Check the full current lineage for competing values, with appropriate scope locks, rather than relying on an already-created quarantine item.
./docs/audits/2026-11-05-data-foundation-3/codex/8b-review.md:1893:  For a merged issuer, this query only checks competitors belonging to the candidate's filing issuer. If another member of its lineage already has a visible, different value for the same key and date, and the reconciliation runner has not yet created an open `lineage_conflict`, adoption succeeds. `read_facts_lineage` then reports a conflict and excludes the affected current value instead of exposing the adopted fact. Check the full current lineage for competing values, with appropriate scope locks, rather than relying on an already-created quarantine item.
./docs/audits/2026-11-05-data-foundation-3/codex/9a-review.md:1742:198:create or replace function public.read_facts_lineage(
./docs/audits/2026-11-05-data-foundation-3/codex/9a-review.md:1967:create or replace function public.read_facts_lineage(
./docs/audits/2026-11-05-data-foundation-3/codex/10-review.md:1445:/bin/zsh -lc "rg -l 'create or replace function public.read_facts_lineage|CREATE OR REPLACE FUNCTION public.read_facts_lineage' . --glob '*.sql'; rg -n 'conflicts|is_current' src/lib/facts/memory*.ts; find . -name '*plan*3*' -o -name '*foundation*3*'" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
./docs/audits/2026-11-05-data-foundation-3/codex/10-review.md:1686:create or replace function public.read_facts_lineage(
./docs/audits/2026-11-05-data-foundation-3/codex/8a-review-fix2.md:720:create or replace function public.read_facts_lineage(
import type {Duration,FactRow,LineageConflict} from '@/lib/facts/types';

export const dynamic='force-dynamic';
const PARAMS=['concepts','factIds','from','to','asOf','durations','history','limit','tickerAsOf'] as const;
const CONCEPT_IDS=new Set(CONCEPT_ID_LIST);
const DURATIONS=new Set<string>(['3M','6M','9M','12M','INSTANT']);
const MAX_FACT_IDS=100,DEFAULT_LIMIT=200,MAX_LIMIT=1000;

export async function GET(req:Request,{params}:{params:Promise<{ticker:string}>}){
 const now=new Date();const today=utcDate(now);
 const {ticker:raw}=await params;const ticker=decodeTicker(raw);
 if(ticker===null||!TICKER_RE.test(ticker))return errorResponse('invalid_parameter:ticker','invalid ticker',400);
 let q:{concepts?:string[];factIds?:string[];from?:string;to?:string;asOf:string;durations?:Set<string>;history:boolean;limit:number;tickerAsOf:string};
 try{
  const p=readParams(new URL(req.url),PARAMS);
  const concepts=listParam(p,'concepts',CONCEPT_IDS,MAX_READ_CONCEPTS);
  const factIds=listParam(p,'factIds',null,MAX_FACT_IDS);
  if(factIds&&factIds.some(id=>!UUID_RE.test(id)))throw new QueryError('factIds');
  if((concepts===undefined)===(factIds===undefined))throw new QueryError(concepts?'factIds':'concepts');   // exactly one mode
  const durations=listParam(p,'durations',DURATIONS,DURATIONS.size);
  q={concepts,factIds,from:dateParam(p,'from'),to:dateParam(p,'to'),asOf:asOfParam(p,today),durations:durations?new Set(durations):undefined,history:flagParam(p,'history'),limit:intParam(p,'limit',DEFAULT_LIMIT,MAX_LIMIT),tickerAsOf:tickerAsOfParam(p,today)};
 }catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
 try{
  const {tables,db}=publicClients();
  const issuer=await resolvePublicIssuer(tables,ticker,today,q.tickerAsOf);
  if(!issuer)return errorResponse('unknown_ticker','no issuer for ticker',404);
  const lineage=await db.lineageOf(issuer.issuerId);
  const members=new Set(lineage);
  let rows:FactRow[],truncated=false,conflicts:LineageConflict[]=[];
  const filingsAll=await lineageFilings(db,lineage,issuer.market);   // published only, before any use
  const publishedIds=new Set(filingsAll.map(f=>f.filing_id));
  if(q.factIds){
   rows=(await db.factsByIds(q.factIds)).filter(r=>members.has(r.issuer_id)&&r.market===issuer.market&&publishedIds.has(r.filing_id));
  }else{
   // durations are applied BEFORE the natural-key limit: read without the limit (the 10,000-row cap still
   // applies → truncated), filter, then keep the first `limit` natural keys (rows arrive grouped by key in rank order).
   const env=await db.readFactsLineage(lineage,issuer.market,{concepts:q.concepts!,asOf:q.asOf,from:q.from,to:q.to,history:q.history,limit:q.durations?undefined:q.limit});
   truncated=env.truncated;rows=env.rows;conflicts=env.conflicts;
   if(q.durations){
    const kept=new Set<string>();
    rows=rows.filter(r=>{
     if(!q.durations!.has(r.duration as Duration))return false;
     const k=[r.concept,r.period_start??'',r.period_end,r.consolidation,r.unit].join('|');
     if(!kept.has(k)){if(kept.size>=q.limit)return false;kept.add(k);}
     return true;
    });
   }
  }
  const wanted=new Set(rows.map(r=>r.filing_id));
  const filings=filingsAll.filter(f=>wanted.has(f.filing_id));
  const body={issuerId:issuer.issuerId,ticker:issuer.ticker,market:issuer.market,asOf:q.factIds?null:q.asOf,mappingGen:MAPPING_GEN,truncated,lineage,resolution:publicResolution(issuer),
   conflicts:conflicts.map(publicConflict),facts:rows.map(publicFact),filings:filings.map(publicFiling)};
  return NextResponse.json(body,{headers:successHeaders(now,q.factIds?undefined:q.asOf,rows.length===0||truncated)});
 }catch(e){return failureResponse(e,'facts','facts read failed');}
}
6:// (staged→ok, conflict disposition derived from OPEN same_day_conflict items, mapping_gen
22:import {READ_FACTS_CAP,assertAllStaged,conflictFromItem,conflictPrefix,lineageRevsFrom,linkPatch} from './db';
56:const FACT_ROW_REASONS=['same_day_conflict','identity_bs','identity_gp'];
101: /** Does this same_day_conflict item dispute the row's (K, available_date)? Matched on payload.key like the SQL (round-1 #3). */
184: // same_day_conflict, chosen by every RESOLVED same_day_conflict and lineage_conflict that lists it
190:  const resolvedConflicts=all.filter(i=>i.reason_code==='same_day_conflict'&&i.status!=='open');
191:  const lineageVerdicts=all.filter(i=>i.reason_code==='lineage_conflict'&&i.status!=='open');
201:   if(open.some(i=>i.reason_code==='same_day_conflict'&&disputes(i,f)))continue;
210: // one (K, available_date) from different issuers with different values leave the sequences and go to conflicts.
216:  const conflicts:LineageConflict[]=[];const excluded=new Set<string>();
224:    conflicts.push({key:{concept:f0.concept,period_start:f0.period_start,period_end:f0.period_end,consolidation:f0.consolidation,unit:f0.unit},available_date:f0.available_date,fact_ids:g.map(f=>f.fact_id).sort(cmp)});
227:   conflicts.sort((a,b)=>cmp(a.available_date,b.available_date)||cmp(s(a.key.concept),s(b.key.concept))||cmp(s(a.key.period_end),s(b.key.period_end))||cmp(s(a.key.period_start),s(b.key.period_start))||cmp(s(a.key.consolidation),s(b.key.consolidation))||cmp(s(a.key.unit),s(b.key.unit)));
237:  const picked=out.filter(f=>(o.history===true||f.is_current===true)&&(o.limit===undefined||rank.get(keyOf(f))!<=o.limit));
239:  if(picked.length>READ_FACTS_CAP)return {stateRevs,lineage:set,rows:[],conflicts,truncated:true};
240:  return {stateRevs,lineage:set,rows:picked,conflicts,truncated:false};
337:   for(const it of await items({status:'open',reason_code:'same_day_conflict'})){
364:   if(it.reason_code==='reconcile_mismatch'||it.reason_code==='lineage_conflict')throw new FactsDbError('use_dedicated_resolver');
374:   if(it.reason_code==='same_day_conflict'){picked=[...chosen];if(picked.some(id=>!ids.includes(id)))throw new FactsDbError('invalid_chosen');
393:   const prefix=conflictPrefix(issuer,market);
394:   const rows=(await items({status:'open',reason_code:'same_day_conflict'})).filter(i=>String(i.natural_key).startsWith(prefix));
396:   return rows.map(i=>conflictFromItem({id:String(i.id),natural_key:String(i.natural_key),payload:(i.payload as Record<string,unknown>|undefined)??{}}));
464:   throw new FactsDbError('acceptance_conflict');
495:   const disputed=open.some(i=>i.reason_code==='same_day_conflict'&&disputesKey(i,lin,g.market,k,g.available_date))
496:    ||open.some(i=>i.reason_code==='lineage_conflict'&&i.natural_key===`${t}:${factKey(k)}:${g.available_date}`);
497:   if(okClash||disputed)throw new FactsDbError('conflict_exists');
531:   if(it.table_name!=='financial_facts'||it.reason_code!=='lineage_conflict'||(it.dataset!==DATASETS.facts('US')&&it.dataset!==DATASETS.facts('CN')))throw new FactsDbError('invalid_choice');
605:    const reason=r.action==='review_item'?'reconcile_review':'lineage_conflict';
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

exec
/bin/zsh -lc "sed -n '198,320p' supabase/migrations/20261107091000_facts_extensions.sql; sed -n '1,85p' 'src/app/api/facts/[ticker]/metrics/route.test.ts'; rg -n 'DERIVE_CONCEPTS' src/lib/facts/derive.ts; git status --short" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
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

-- Plan-2 signature and envelope {state_rev, rows, truncated, row_count}: one member, so the
-- suppression never applies and the output is that of the plan-2 statement.
create or replace function public.read_facts(
  p_issuer uuid, p_market text, p_concepts text[], p_as_of date,
  p_from date, p_to date, p_history boolean, p_limit int, p_include_non_ok boolean default false)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'state_rev', coalesce(x.v -> 'state_revs' -> 0 -> 'state_rev', to_jsonb(public.fact_state_rev(p_issuer, p_market))),
    'truncated', x.v -> 'truncated', 'row_count', x.v -> 'row_count', 'rows', x.v -> 'rows')
  from (select public.read_facts_lineage(array[p_issuer], p_market, p_concepts, p_as_of, p_from, p_to, p_history, p_limit, p_include_non_ok) as v) x
$$;
revoke execute on function public.read_facts(uuid, text, text[], date, date, date, boolean, int, boolean) from public;
grant execute on function public.read_facts(uuid, text, text[], date, date, date, boolean, int, boolean) to anon, authenticated, service_role;

-- ---------------------------------------------------------------- 6. topology writers (spec §3.1 guard, §3.2 set_merge / set_dissolved, R3, T12)
-- Placeholder scope rows (priority 0, reasons [], fetch_key 'topology' — the plan-2 check needs
-- 1..32 characters) for every issuer of the set in both markets, never overwriting an existing row,
-- then every scope row of the set locked in (issuer_id, market) order.
create or replace function public.fact_topology_lock(p_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.fact_sync_scope (issuer_id, market, reasons, priority, fetch_key)
  select i, mk.m, '[]'::jsonb, 0, 'topology'
  from unnest(p_ids) as i cross join (values ('US'), ('CN')) as mk(m)
  on conflict (issuer_id, market) do nothing;
  perform 1 from public.fact_sync_scope s where s.issuer_id = any(p_ids) order by s.issuer_id, s.market for update;
end $$;
revoke execute on function public.fact_topology_lock(uuid[]) from public, anon, authenticated, service_role;

-- Body of set_merge (runs with entities.allow_topology_write on). Affected set = {source, target}
-- ∪ referrers of both; scope rows locked; issuers rows locked; the set re-read under the locks
-- (changed → lineage_changed); referrers of the source re-pointed to the target (row_count = n);
-- the source retired (row_count = 1, else source_not_active); the plan-1 triggers check the target
-- is active and the source holds no open security (errors pass through); every affected scope
-- state_rev + 1; the target joins the next facts.lineage_same_day cycle — entry {issuer_id:T, market,
-- source:S} appended under the cycle lock open_reconcile_cycle also takes (plan audit Q2), so a cycle
-- creation never overwrites or half-consumes it; audit row.
-- Lock order (plan audit R1): the cycle advisory lock is taken FIRST, before the scope rows
-- (fact_topology_lock) and the issuers rows. open_reconcile_cycle holds the same advisory lock while
-- its cursor inserts take KEY SHARE on issuers rows (cursor → issuers FK); taking the advisory lock
-- after the issuer locks would let a merge hold FOR UPDATE on the target while waiting for the
-- advisory lock that a creator holds while waiting for that row — a deadlock. Global rule: any
-- function that takes a dq_reconcile_cycle:* advisory lock takes it before any row lock.
create or replace function public.fact_set_merge_body(p_source uuid, p_target uuid, p_resolved_by uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_set uuid[]; v_now uuid[]; v_refs uuid[]; n int;
begin
  if p_source is null or p_target is null or p_source = p_target then raise exception 'invalid_merge' using errcode = '22023'; end if;
  if p_resolved_by is null then raise exception 'invalid_resolver' using errcode = '22023'; end if;
  if not exists (select 1 from public.issuers where issuer_id = p_source) then raise exception 'source_not_active' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.issuers where issuer_id = p_target) then
    raise exception 'merge_target_not_active: issuer % cannot merge into % (status missing)', p_source, p_target using errcode = '23514';
  end if;
  perform pg_advisory_xact_lock(hashtext('dq_reconcile_cycle:facts.lineage_same_day'));   -- FIRST, before any row lock (plan audit R1); serialises with open_reconcile_cycle (plan audit Q2)
  v_set := array(select distinct x from unnest(array[p_source, p_target] || array(select issuer_id from public.issuers where merged_into in (p_source, p_target))) as x order by x);
// src/app/api/facts/[ticker]/metrics/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {FactRow,LineageRev,MetricRow} from '@/lib/facts/types';
import {FORMULA_VERSION} from '@/lib/facts/derive';
import {FactsDbError} from '@/lib/facts/types';

const mocks=vi.hoisted(()=>({resolve:vi.fn(),readFactsLineage:vi.fn(),metricsOfIssuer:vi.fn(),lineageOf:vi.fn(),stateRevs:vi.fn()}));
vi.mock('@/lib/supabase/anon',()=>({getAnonSupabase:()=>({rpc:()=>Promise.resolve({data:null,error:{message:'unexpected rpc'}})})}));
vi.mock('@/lib/entities/resolve',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/entities/resolve')>(),resolveIssuer:mocks.resolve}));
vi.mock('@/lib/facts/db',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/facts/db')>(),
 supabaseFactsDb:()=>({readFactsLineage:mocks.readFactsLineage,metricsOfIssuer:mocks.metricsOfIssuer,lineageOf:mocks.lineageOf,stateRevs:mocks.stateRevs})}));

import {GET} from './route';

const ISSUER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',SRC='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const V3:LineageRev[]=[{issuer_id:ISSUER,state_rev:3}];
const metric=(p:Partial<MetricRow>={}):MetricRow=>({issuer_id:ISSUER,market:'US',metric:'gross_margin',period_start:'2024-01-01',period_end:'2024-03-31',duration:'3M',value:'0.4',unit:'pure',input_unit:'USD',basis:'us_standard',formula_version:FORMULA_VERSION,
 inputs:[{fact_id:'f1',concept:'gross_profit',filing_id:'g',available_date:'2024-05-01'}],based_on_rev:3,based_on_lineage:V3,as_of:'2024-06-01',...p});
const fact=(p:Partial<FactRow>):FactRow=>({fact_id:'f',issuer_id:ISSUER,market:'US',filing_id:'g',run_id:'r',concept:'revenue',source_concept:'Revenues',statement:'IS',period_start:'2024-01-01',period_end:'2024-03-31',duration:'3M',value:'10',value_text:'10',unit:'USD',consolidation:'consolidated',available_date:'2024-05-01',mapping_gen:1,mapping_version:'facts-map/1',status:'ok',raw_hash:'h',created_at:'2024-05-01T00:00:00Z',disclosure_seq:1,is_current:true,is_revision:false,...p});
const get=(ticker:string,qs:string)=>GET(new Request(`https://alpha.example/api/facts/${ticker}/metrics?${qs}`),{params:Promise.resolve({ticker})});

describe('GET /api/facts/[ticker]/metrics',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  mocks.resolve.mockImplementation(async(_c:unknown,q:{ticker:string})=>({issuer_id:ISSUER,status:'active',names:{zh:null,en:null},identifiers:{cik:null,lei:null,usci:null},securities:[{ticker:q.ticker,isin:null,figi:null,share_class:null,is_primary:true,valid_from:'2000-01-01',valid_to:null}]}));
  mocks.lineageOf.mockImplementation(async(t:string)=>[t]);
  mocks.stateRevs.mockResolvedValue(V3);
  mocks.metricsOfIssuer.mockResolvedValue([metric(),metric({metric:'net_margin',value:'0.1',period_end:'2024-06-30',period_start:'2024-04-01'})]);
  mocks.readFactsLineage.mockResolvedValue({stateRevs:[{issuer_id:ISSUER,state_rev:9}],lineage:[ISSUER],conflicts:[],truncated:false,rows:[fact({fact_id:'f1'}),fact({fact_id:'f2',concept:'gross_profit',source_concept:'GrossProfit',value:'4',value_text:'4'})]});
 });
 it('without asOf serves the materialized rows of the target when lineage and revs agree before and after and every row carries that vector',async()=>{
  const res=await get('AAPL','metrics=gross_margin&from=2024-01-01&to=2024-03-31');
  expect(res.status).toBe(200);
  const body=await res.json();
  expect(body).toMatchObject({issuerId:ISSUER,ticker:'AAPL',market:'US',asOf:null,mappingGen:1,formulaVersion:FORMULA_VERSION,truncated:false,stale:false,lineage:[ISSUER],resolution:{tickerAsOf:expect.any(String),issuerId:ISSUER,validFromMethod:null}});
  expect(body.metrics).toEqual([{metric:'gross_margin',periodStart:'2024-01-01',periodEnd:'2024-03-31',duration:'3M',value:'0.4',unit:'pure',inputUnit:'USD',basis:'us_standard',inputs:[{fact_id:'f1',concept:'gross_profit',filing_id:'g',available_date:'2024-05-01'}],basedOnRev:3,basedOnLineage:V3}]);
  expect(mocks.metricsOfIssuer).toHaveBeenCalledWith(ISSUER,'US',FORMULA_VERSION);
  expect(mocks.readFactsLineage).toHaveBeenCalledTimes(1);   // conflicts only, inside the bracket
  expect(body.conflicts).toEqual([]);
  expect(mocks.lineageOf).toHaveBeenCalledTimes(2);expect(mocks.stateRevs).toHaveBeenCalledTimes(2);
  expect(mocks.stateRevs).toHaveBeenCalledWith([ISSUER],'US');
  expect(res.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=60');
 });
 it('a merged target: lineage [T, S] with both revs in every row is served',async()=>{
  const V=[{issuer_id:ISSUER,state_rev:3},{issuer_id:SRC,state_rev:7}];
  mocks.lineageOf.mockResolvedValue([ISSUER,SRC]);mocks.stateRevs.mockResolvedValue(V);
  mocks.metricsOfIssuer.mockResolvedValue([metric({based_on_lineage:V})]);
  const body=await (await get('AAPL','')).json();
  expect(body).toMatchObject({stale:false,lineage:[ISSUER,SRC]});
  expect(body.metrics[0].basedOnLineage).toEqual(V);
  expect(mocks.stateRevs).toHaveBeenCalledWith([ISSUER,SRC],'US');
 });
 it('T8: revs that move while the metrics are read are stale (no rows, short cache)',async()=>{
  mocks.stateRevs.mockResolvedValueOnce(V3).mockResolvedValue([{issuer_id:ISSUER,state_rev:4}]);
  const res=await get('AAPL','metrics=gross_margin');
  expect(await res.json()).toMatchObject({stale:true,metrics:[]});
  expect(res.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=30');
 });
 it('T8: rows whose based_on_lineage is not the current vector are stale even when based_on_rev matches the target',async()=>{
  const V=[{issuer_id:ISSUER,state_rev:3},{issuer_id:SRC,state_rev:7}];
  mocks.lineageOf.mockResolvedValue([ISSUER,SRC]);mocks.stateRevs.mockResolvedValue(V);
  mocks.metricsOfIssuer.mockResolvedValue([metric()]);                                   // materialized before the merge: [T@3] only
  expect(await (await get('AAPL','')).json()).toMatchObject({stale:true,metrics:[]});
 });
 it('T8: a lineage that changes membership between the two reads is stale',async()=>{
  mocks.lineageOf.mockResolvedValueOnce([ISSUER]).mockResolvedValue([ISSUER,SRC]);
  mocks.stateRevs.mockResolvedValueOnce(V3).mockResolvedValue([{issuer_id:ISSUER,state_rev:3},{issuer_id:SRC,state_rev:1}]);
  expect(await (await get('AAPL','')).json()).toMatchObject({stale:true,metrics:[]});
 });
 it('a stateRevs failure is a 500 (never reported as stale); an unstable metrics read is stale; no rows yet is an empty non-stale answer',async()=>{
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  mocks.stateRevs.mockRejectedValueOnce(new Error('rpc down'));
  const res=await get('AAPL','');
  expect(res.status).toBe(500);expect((await res.json()).error.code).toBe('internal');
  spy.mockRestore();
  mocks.metricsOfIssuer.mockRejectedValueOnce(new FactsDbError('unknown','metrics_unstable'));
  expect(await (await get('AAPL','')).json()).toMatchObject({stale:true,metrics:[]});
  mocks.metricsOfIssuer.mockResolvedValueOnce([]);
  const empty=await get('AAPL','');
  expect(await empty.json()).toMatchObject({stale:false,metrics:[]});
  expect(empty.headers.get('cache-control')).toBe('no-store');
 });
 it('internal errors give a code only, no message',async()=>{
  mocks.metricsOfIssuer.mockRejectedValue(new Error('secret db detail'));
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
30:export const DERIVE_CONCEPTS:Record<Market,readonly string[]>={
236:  const env=await db.readFactsLineage(lineage,market,{concepts:[...DERIVE_CONCEPTS[market]],asOf,history:true});
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-y4ts8voB' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-39t6SI2Y' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/10-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/10-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/10-review.md

codex
The retry now re-resolves the materialization target, and the metrics route checks stability even for empty results while exposing lineage conflicts. Reviewing the changed code, regression tests, and underlying database behavior revealed no actionable regressions. Tests were not executed.
The retry now re-resolves the materialization target, and the metrics route checks stability even for empty results while exposing lineage conflicts. Reviewing the changed code, regression tests, and underlying database behavior revealed no actionable regressions. Tests were not executed.

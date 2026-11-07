OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b097-c760-73e2-9d2c-27e4e3aa1a30
--------
user
commit 1683104
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 1683104; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 769ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-jnMKdOqj' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-OIkwGgTI' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/10-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/10-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/10-review-fix2.md
?? docs/audits/2026-11-05-data-foundation-3/codex/10-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-4OstPwjR' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-hohLPwKc' (errno=Operation not permitted)
1683104 fix(facts): metrics conflicts limit and truncation, early metrics validation, basedOn target check (Task 10 review)
 src/app/api/facts/[ticker]/metrics/route.test.ts | 12 ++++++++++++
 src/app/api/facts/[ticker]/metrics/route.ts      |  7 +++++--
 src/lib/facts/derive.test.ts                     |  1 +
 src/lib/facts/derive.ts                          |  4 +++-
 src/lib/facts/public-route.ts                    |  2 ++
 5 files changed, 23 insertions(+), 3 deletions(-)

exec
/bin/zsh -lc 'pwd; ls -a | head -35; for p in /AGENTS.md /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do if [ -f "$p" ]; then echo "$p"; cat "$p"; fi; done; git show 1683104; cat src/lib/facts/public-route.ts; cat src/lib/facts/derive.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
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
git: error: couldn't create cache file '/tmp/xcrun_db-jRGJH9yO' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-4bJZ0twO' (errno=Operation not permitted)
commit 1683104ad47105ff17062b137d4bd1316393c47e
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 03:21:28 2026 -0800

    fix(facts): metrics conflicts limit and truncation, early metrics validation, basedOn target check (Task 10 review)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/app/api/facts/[ticker]/metrics/route.test.ts b/src/app/api/facts/[ticker]/metrics/route.test.ts
index feacfbe..fa7017a 100644
--- a/src/app/api/facts/[ticker]/metrics/route.test.ts
+++ b/src/app/api/facts/[ticker]/metrics/route.test.ts
@@ -139,4 +139,16 @@ describe('GET /api/facts/[ticker]/metrics',()=>{
   mocks.stateRevs.mockResolvedValueOnce(V3).mockResolvedValue([{issuer_id:ISSUER,state_rev:4}]);
   expect(await (await get('AAPL','')).json()).toMatchObject({stale:true,conflicts:[]});
  });
+ it('conflicts read passes limit:1 and its truncated flag is not the response\'s: fresh cache, truncated:false',async()=>{
+  mocks.readFactsLineage.mockResolvedValue({stateRevs:V3,lineage:[ISSUER],conflicts:[],truncated:true,rows:[]});
+  const res=await get('AAPL','');
+  expect(await res.json()).toMatchObject({truncated:false,stale:false});
+  expect(res.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=60');
+  expect(mocks.readFactsLineage.mock.calls[0][2]).toMatchObject({limit:1});
+ });
+ it('a bad metrics value is 400 even for an unknown ticker (validated before resolution)',async()=>{
+  mocks.resolve.mockResolvedValue(null);
+  expect((await get('ZZZZ','metrics=not_a_metric')).status).toBe(400);
+  expect((await get('ZZZZ','metrics=gross_margin')).status).toBe(404);
+ });
 });
diff --git a/src/app/api/facts/[ticker]/metrics/route.ts b/src/app/api/facts/[ticker]/metrics/route.ts
index 99fbba9..59b4913 100644
--- a/src/app/api/facts/[ticker]/metrics/route.ts
+++ b/src/app/api/facts/[ticker]/metrics/route.ts
@@ -19,6 +19,7 @@ import type {LineageConflict,MetricRow} from '@/lib/facts/types';
 
 export const dynamic='force-dynamic';
 const PARAMS=['metrics','from','to','asOf','limit','tickerAsOf'] as const;
+const ALL_METRICS=new Set<string>([...metricNames('US'),...metricNames('CN')]);
 const DEFAULT_LIMIT=200,MAX_LIMIT=1000;
 const publicMetric=(m:MetricRow)=>({metric:m.metric,periodStart:m.period_start,periodEnd:m.period_end,duration:m.duration,value:m.value,unit:m.unit,inputUnit:m.input_unit,basis:m.basis,inputs:m.inputs,basedOnRev:m.based_on_rev,basedOnLineage:m.based_on_lineage});
 
@@ -31,6 +32,7 @@ export async function GET(req:Request,{params}:{params:Promise<{ticker:string}>}
   p=readParams(new URL(req.url),PARAMS);
   from=dateParam(p,'from');to=dateParam(p,'to');asOf=dateParam(p,'asOf');limit=intParam(p,'limit',DEFAULT_LIMIT,MAX_LIMIT);tickerAsOf=tickerAsOfParam(p,today);
   if(asOf!==undefined&&asOf>today)throw new QueryError('asOf');
+  listParam(p,'metrics',ALL_METRICS,ALL_METRICS.size);   // syntax and vocabulary of either market first: a bad value is 400 even for an unknown ticker
  }catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
  try{
   const {tables,db}=publicClients();
@@ -47,8 +49,9 @@ export async function GET(req:Request,{params}:{params:Promise<{ticker:string}>}
    try{
     rows=await db.metricsOfIssuer(target,issuer.market,FORMULA_VERSION);
     // conflicts withheld from current values, read inside the same before/after bracket
-    const env=await db.readFactsLineage(lineage,issuer.market,{concepts:[...DERIVE_CONCEPTS[issuer.market]],asOf:today});
-    conflicts=env.conflicts;if(env.truncated)truncated=true;
+    // limit:1 — the clash CTE ignores p_limit, so conflicts are complete; this read's `truncated` is not the response's (rows come from the metrics table)
+    const env=await db.readFactsLineage(lineage,issuer.market,{concepts:[...DERIVE_CONCEPTS[issuer.market]],asOf:today,limit:1});
+    conflicts=env.conflicts;
    }catch(e){if(e instanceof FactsDbError&&e.message==='metrics_unstable'){rows=[];stale=true;}else throw e;}
    if(!stale){   // the guard runs for an empty read too: a lineage or rev that moved during it is stale, never an empty answer
     const lineageAfter=await db.lineageOf(target);
diff --git a/src/lib/facts/derive.test.ts b/src/lib/facts/derive.test.ts
index 8b9a19d..22699f5 100644
--- a/src/lib/facts/derive.test.ts
+++ b/src/lib/facts/derive.test.ts
@@ -292,6 +292,7 @@ describe('materialize (lineage contract, spec §4.4 / T9)',()=>{
   const other=fakeDb([env([{issuer_id:'I',state_rev:5}],[dur('revenue','2024-01-01','2024-03-31','1',{issuer_id:'OTHER'})])]);
   await expect(materialize(other.db,'I','US')).rejects.toThrow('derive_scope_mismatch');
   expect(other.calls).toEqual([]);
+  expect(()=>deriveLineageMetrics([],'I',['I'],{market:'US',asOf:'2025-01-01',basedOn:[]})).toThrow('derive_scope_mismatch');
   expect(()=>deriveLineageMetrics([dur('revenue','2024-01-01','2024-03-31','1',{market:'CN'})],'I',['I'],{market:'US',asOf:'2025-01-01',basedOn:[]})).toThrow('derive_scope_mismatch');
  });
  it('refuses a truncated envelope with read_truncated and writes nothing',async()=>{
diff --git a/src/lib/facts/derive.ts b/src/lib/facts/derive.ts
index c0cd8cc..5d6a996 100644
--- a/src/lib/facts/derive.ts
+++ b/src/lib/facts/derive.ts
@@ -223,7 +223,9 @@ export interface MaterializeResult{rows:number;stateRev:number;retried:boolean;t
 export function deriveLineageMetrics(rows:FactRow[],target:string,lineage:readonly string[],opts:{market:Market;asOf:string;basedOn:LineageRev[]}):MetricRow[]{
  const members=new Set(lineage);
  if(!members.has(target)||rows.some(r=>!members.has(r.issuer_id)||r.market!==opts.market))throw new Error(`derive_scope_mismatch:${target}/${opts.market}`);
- const basedOnRev=opts.basedOn.find(x=>x.issuer_id===target)?.state_rev??0;
+ const own=opts.basedOn.find(x=>x.issuer_id===target);
+ if(!own)throw new Error(`derive_scope_mismatch:${target}/basedOn`);   // the vector must carry the target's rev
+ const basedOnRev=own.state_rev;
  return deriveMetrics(rows.map(r=>r.issuer_id===target?r:{...r,issuer_id:target}),{market:opts.market,asOf:opts.asOf,basedOnRev,basedOn:opts.basedOn});
 }
 /** as_of = today; materialises T(issuer) over its current lineage (see the header). */
diff --git a/src/lib/facts/public-route.ts b/src/lib/facts/public-route.ts
index cfcc339..d3c6e6f 100644
--- a/src/lib/facts/public-route.ts
+++ b/src/lib/facts/public-route.ts
@@ -8,6 +8,8 @@
 // Plan 3 (spec §4.3.5, §4.4): tickerAsOf (default today, future → 400) picks the ticker's owner at
 // that date; the answer names the lineage target T (issuerId), its lineage, the cross-issuer
 // conflicts withheld from current values, each row's recordedIssuerId and each filing's acceptedAt.
+// Note: a past asOf answer is cached for 1h (s-maxage=3600) and can change after a LATER merge (the
+// lineage grows); that cache bounds the staleness.
 import {NextResponse} from 'next/server';
 import {getAnonSupabase} from '../supabase/anon';
 import {supabaseTableClient} from '../db/table-client';
// src/lib/facts/public-route.ts
// Conventions shared by the public read routes (spec §9): anon clients (read_facts is security
// invoker, RLS shows anon only status='ok'), the ticker syntax of /api/entities/resolve, issuer
// resolution by TODAY's ownership (asOf applies to facts only), market from the ticker suffix,
// strict parameter parsing (repeated parameter → 400 invalid_parameter:<name>), error bodies
// {error:{code,message}} with no-store, cache headers (past asOf → long shared cache; otherwise
// bounded by the next UTC midnight like the resolve route), and the public row shapes.
// Plan 3 (spec §4.3.5, §4.4): tickerAsOf (default today, future → 400) picks the ticker's owner at
// that date; the answer names the lineage target T (issuerId), its lineage, the cross-issuer
// conflicts withheld from current values, each row's recordedIssuerId and each filing's acceptedAt.
// Note: a past asOf answer is cached for 1h (s-maxage=3600) and can change after a LATER merge (the
// lineage grows); that cache bounds the staleness.
import {NextResponse} from 'next/server';
import {getAnonSupabase} from '../supabase/anon';
import {supabaseTableClient} from '../db/table-client';
import type {TableClient} from '../db/table-client';
import {isCurrentSecurity,resolveIssuer,successCacheControl} from '../entities/resolve';
import {inferCoreMarket,normalizeSecurityTicker} from '../securities/ticker';
import {supabaseFactsDb} from './db';
import type {FactRow,FactsDb,FilingRow,LineageConflict,Market} from './types';

export const TICKER_RE=/^[A-Za-z0-9.\/\-]{1,24}$/;
export const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const utcDate=(d:Date)=>d.toISOString().slice(0,10);
const isCalendarDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&(()=>{const ms=Date.parse(`${s}T00:00:00Z`);return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===s;})();
export const marketOfTicker=(t:string):Market=>/\.(SH|SZ|BJ)$/i.test(t)?'CN':'US';

export class QueryError extends Error{constructor(public readonly param:string){super(`invalid_parameter:${param}`);this.name='QueryError';}}
/** Collects the allowed parameters; any of them given twice is an error. Unknown parameters are ignored. */
export function readParams(url:URL,allowed:readonly string[]):Map<string,string>{
 const out=new Map<string,string>();
 for(const k of allowed){const all=url.searchParams.getAll(k);if(all.length>1)throw new QueryError(k);if(all.length===1)out.set(k,all[0]);}
 return out;
}
export function dateParam(p:Map<string,string>,name:string):string|undefined{
 const v=p.get(name);if(v===undefined)return undefined;
 if(!isCalendarDate(v))throw new QueryError(name);return v;
}
export function intParam(p:Map<string,string>,name:string,def:number,max:number):number{
 const v=p.get(name);if(v===undefined)return def;
 if(!/^\d{1,5}$/.test(v)||Number(v)<1||Number(v)>max)throw new QueryError(name);return Number(v);
}
/** Comma list: trimmed, non-empty, unique, each in `allowed` (when given), at most `max` items. */
export function listParam(p:Map<string,string>,name:string,allowed:ReadonlySet<string>|null,max:number):string[]|undefined{
 const v=p.get(name);if(v===undefined)return undefined;
 const items=v.split(',').map(s=>s.trim());
 if(items.length===0||items.length>max||items.some(s=>s===''||(allowed&&!allowed.has(s)))||new Set(items).size!==items.length)throw new QueryError(name);
 return items;
}
/** asOf defaults to today and may not be in the future. */
export function asOfParam(p:Map<string,string>,today:string):string{
 const v=dateParam(p,'asOf');if(v===undefined)return today;
 if(v>today)throw new QueryError('asOf');return v;
}
/** tickerAsOf defaults to today and may not be in the future. */
export function tickerAsOfParam(p:Map<string,string>,today:string):string{
 const v=dateParam(p,'tickerAsOf');if(v===undefined)return today;
 if(v>today)throw new QueryError('tickerAsOf');return v;
}
export function flagParam(p:Map<string,string>,name:string):boolean{
 const v=p.get(name);if(v===undefined)return false;
 if(v!=='1')throw new QueryError(name);return true;
}

export const errorResponse=(code:string,message:string,status:number)=>NextResponse.json({error:{code,message}},{status,headers:{'Cache-Control':'no-store'}});
export const paramErrorResponse=(e:unknown)=>e instanceof QueryError?errorResponse(e.message,`invalid ${e.param}`,400):null;

export interface PublicIssuer{issuerId:string;ticker:string;market:Market;tickerAsOf:string;validFromMethod:string|null}
/** Percent-decoded path segment, or null when malformed. */
export function decodeTicker(raw:string):string|null{try{return decodeURIComponent(raw);}catch{return null;}}
/** US forms (incl. dotted share classes such as BRK.A) and CN .SH/.SZ/.BJ are public; anything else (HK, ...) is not. */
export function publicMarketOf(ticker:string):Market|null{
 if(/\.(SH|SZ|BJ)$/.test(ticker))return 'CN';
 return inferCoreMarket(ticker)==='US'?'US':null;
}
/**
 * Ticker → issuer by ownership AT tickerAsOf (default today; one merge hop is followed by
 * resolveIssuer, so issuerId is the lineage target). resolveIssuer matches the exact upper-cased
 * ticker first and falls back to the normalised one (so BRK.A is never BRK, and 600519 / SH600519 /
 * 600519.SS find 600519.SH). Market, echoed ticker and validFromMethod come from the security row
 * that matches one of those two forms (exact first; for a merged issuer, the source row read
 * directly, current at tickerAsOf); none matching, or a market the facts layer does not serve (HK),
 * is null (→ 404 unknown_ticker). Throws Error('ambiguous_owner') through.
 */
export async function resolvePublicIssuer(tables:TableClient,rawTicker:string,today:string,tickerAsOf:string=today):Promise<PublicIssuer|null>{
 const given=rawTicker.trim().toUpperCase().replace(/\//g,'.');
 const r=await resolveIssuer(tables,{ticker:given},{asOf:tickerAsOf});
 if(!r)return null;
 const core=inferCoreMarket(given);
 const normalised=core?normalizeSecurityTicker(given,core):null;
 const sec=r.securities.find(x=>x.ticker.toUpperCase()===given)??(normalised?r.securities.find(x=>x.ticker.toUpperCase()===normalised):undefined);
 let ticker=sec?.ticker;let validFromMethod:string|null=sec?.valid_from_method??null;
 if(ticker===undefined){
  // Merged issuer: resolveIssuer returned the TARGET's securities. Read the source row directly
  // (exact ticker first; the first form with any rows is authoritative, like the resolver).
  for(const t of normalised&&normalised!==given?[given,normalised]:[given]){
   const rows=await tables.select('issuer_securities',{ticker:t});
   if(rows.length===0)continue;
   const cur=rows.find(x=>isCurrentSecurity(x,tickerAsOf));
   if(cur){ticker=t;validFromMethod=typeof cur.valid_from_method==='string'?cur.valid_from_method:null;}
   break;
  }
 }
 if(ticker===undefined)return null;
 const market=publicMarketOf(ticker);
 return market?{issuerId:r.issuer_id,ticker,market,tickerAsOf,validFromMethod}:null;
}
/** Failure → response: ambiguous ownership is the caller's 409, everything else a logged, code-only 500. */
export function failureResponse(e:unknown,tag:string,internalMessage:string){
 if(e instanceof Error&&e.message==='ambiguous_owner')return errorResponse('ambiguous_ticker','ticker maps to several issuers',409);
 console.error(`[${tag}]`,e instanceof Error?e.message:e);
 return errorResponse('internal',internalMessage,500);
}
/** Only published filings (active generation) are public; staged ones (mapping_gen 0) never are. */
export const isPublished=(f:FilingRow)=>f.mapping_gen>0;

/** anon clients; stateRev = fact_state_rev(issuer, market) (anon may execute it; only the version number leaves fact_sync_scope). */
export function publicClients():{tables:TableClient;db:FactsDb;stateRev:(issuer:string,market:Market)=>Promise<number>}{
 const sb=getAnonSupabase();
 const rpc=(fn:string,args:Record<string,unknown>)=>(sb as unknown as {rpc:(fn:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{message?:string}|null}>}).rpc(fn,args);
 return {tables:supabaseTableClient(sb),db:supabaseFactsDb(sb),stateRev:async(issuer,market)=>{
  const {data,error}=await rpc('fact_state_rev',{p_issuer:issuer,p_market:market});
  if(error)throw new Error('fact_state_rev_failed');
  const n=Number(data);if(!Number.isFinite(n))throw new Error('fact_state_rev_invalid');return n;
 }};
}

export function successHeaders(now:Date,asOf:string|undefined,empty:boolean):Record<string,string>{
 if(empty)return {'Cache-Control':'no-store'};
 if(asOf!==undefined&&asOf<utcDate(now))return {'Cache-Control':'public, max-age=600, s-maxage=3600'};
 return {'Cache-Control':successCacheControl(now)};
}

/** Metrics whose facts changed visibility since materialisation: nothing is served, shared caches keep it only briefly. */
export const STALE_CACHE_CONTROL='public, max-age=0, s-maxage=30';
/** Fresh materialised metrics can go stale at the next publish: short shared cache only. */
export const FRESH_METRICS_CACHE_CONTROL='public, max-age=0, s-maxage=60';

export type Citation='edgar'|'linked'|'pending';
export const citationOf=(f:FilingRow):Citation=>f.market==='US'?'edgar':f.document_ref?'linked':'pending';
export const publicFiling=(f:FilingRow)=>({filingId:f.filing_id,formType:f.form_type,periodEnd:f.period_end,availableDate:f.available_date,sourceRef:f.source_ref,url:f.url,documentRef:f.document_ref,documentUrl:f.document_url,citation:citationOf(f),acceptedAt:f.accepted_at??null,recordedIssuerId:f.issuer_id});
export const publicFact=(r:FactRow)=>({factId:r.fact_id,concept:r.concept,sourceConcept:r.source_concept,statement:r.statement,periodStart:r.period_start,periodEnd:r.period_end,duration:r.duration,value:r.value_text,unit:r.unit,availableDate:r.available_date,filingId:r.filing_id,disclosureSeq:r.disclosure_seq??null,isCurrent:r.is_current??null,isRevision:r.is_revision??null,mappingGen:r.mapping_gen,rawHash:r.raw_hash,recordedIssuerId:r.issuer_id});
export const publicConflict=(c:LineageConflict)=>({key:c.key,availableDate:c.available_date,factIds:c.fact_ids});
export const publicResolution=(i:PublicIssuer)=>({tickerAsOf:i.tickerAsOf,issuerId:i.issuerId,validFromMethod:i.validFromMethod});
/** Published filings of every lineage member (spec §4.4), newest available_date first, then filing_id (the order filingsOfIssuer gives one issuer). */
export async function lineageFilings(db:FactsDb,lineage:readonly string[],market:Market,opts:{from?:string;to?:string}={}):Promise<FilingRow[]>{
 const all=(await Promise.all(lineage.map(i=>db.filingsOfIssuer(i,market,opts)))).flat().filter(isPublished);
 return all.sort((a,b)=>a.available_date<b.available_date?1:a.available_date>b.available_date?-1:a.filing_id<b.filing_id?-1:a.filing_id>b.filing_id?1:0);
}
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
 * based_on_rev = T's rev in basedOn; based_on_lineage = basedOn.
 */
export function deriveLineageMetrics(rows:FactRow[],target:string,lineage:readonly string[],opts:{market:Market;asOf:string;basedOn:LineageRev[]}):MetricRow[]{
 const members=new Set(lineage);
 if(!members.has(target)||rows.some(r=>!members.has(r.issuer_id)||r.market!==opts.market))throw new Error(`derive_scope_mismatch:${target}/${opts.market}`);
 const own=opts.basedOn.find(x=>x.issuer_id===target);
 if(!own)throw new Error(`derive_scope_mismatch:${target}/basedOn`);   // the vector must carry the target's rev
 const basedOnRev=own.state_rev;
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

exec
/bin/zsh -lc "cat 'src/app/api/facts/[ticker]/metrics/route.ts'; rg -n 'readFactsLineage|state_revs|clash|p_limit' src/lib/facts/db.ts supabase/migrations/*lineage*; find . -iname '*agents*' -o -name CLAUDE.md; cat src/lib/facts/metrics.ts 2>/dev/null; rg -n 'deriveLineageMetrics\\(' src" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 106ms:
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
const ALL_METRICS=new Set<string>([...metricNames('US'),...metricNames('CN')]);
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
  listParam(p,'metrics',ALL_METRICS,ALL_METRICS.size);   // syntax and vocabulary of either market first: a bad value is 400 even for an unknown ticker
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
    // limit:1 — the clash CTE ignores p_limit, so conflicts are complete; this read's `truncated` is not the response's (rows come from the metrics table)
    const env=await db.readFactsLineage(lineage,issuer.market,{concepts:[...DERIVE_CONCEPTS[issuer.market]],asOf:today,limit:1});
    conflicts=env.conflicts;
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
zsh:1: no matches found: supabase/migrations/*lineage*
./node_modules/dsh-trade-strategy-evaluator/agents
./node_modules/playwright/lib/agents
./node_modules/playwright/lib/agents/generateAgents.js
./node_modules/caniuse-lite/dist/unpacker/agents.js
./node_modules/caniuse-lite/data/agents.js
./.claude/agents
src/lib/facts/derive.test.ts:295:  expect(()=>deriveLineageMetrics([],'I',['I'],{market:'US',asOf:'2025-01-01',basedOn:[]})).toThrow('derive_scope_mismatch');
src/lib/facts/derive.test.ts:296:  expect(()=>deriveLineageMetrics([dur('revenue','2024-01-01','2024-03-31','1',{market:'CN'})],'I',['I'],{market:'US',asOf:'2025-01-01',basedOn:[]})).toThrow('derive_scope_mismatch');
src/lib/facts/derive.ts:223:export function deriveLineageMetrics(rows:FactRow[],target:string,lineage:readonly string[],opts:{market:Market;asOf:string;basedOn:LineageRev[]}):MetricRow[]{
src/lib/facts/derive.ts:240:  const rows=deriveLineageMetrics(env.rows,target,lineage,{market,asOf,basedOn:env.stateRevs});
src/app/api/facts/[ticker]/metrics/route.ts:64:   rows=truncated?[]:deriveLineageMetrics(env.rows,target,lineage,{market:issuer.market,asOf,basedOn:env.stateRevs});

exec
/bin/zsh -lc "rg -n 'readFactsLineage|stateRevs' src/lib/facts/db.ts; rg -n 'clash as|p_limit|state_revs' supabase | tail -55; ls supabase; sed -n '180,260p' src/lib/facts/db.ts; head -38 src/lib/facts/derive.ts; find /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude -maxdepth 2 -name 'AGENTS*'" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
93: return {stateRevs:lineageRevsFrom(env.state_revs),lineage:Array.isArray(env.lineage)?env.lineage.map(String):[],rows:(env.rows??[]).map(rowFromEnvelope),
245:  async stateRevs(issuers,market){
250:  async readFactsLineage(issuers,market,opts){return lineageResultFromEnvelope(await call<ReadFactsLineageEnvelope>('read_facts_lineage',readLineageArgs(issuers,market,opts)));},
supabase/migrations/20261106090000_financial_facts.sql:664:-- only; p_limit caps the number of natural keys (ranked period_end desc, then concept,
supabase/migrations/20261106090000_financial_facts.sql:670:  p_from date, p_to date, p_history boolean, p_limit int, p_include_non_ok boolean default false)
supabase/migrations/20261106090000_financial_facts.sql:700:  where (coalesce(p_history, false) or k.is_current) and (p_limit is null or k.key_rank <= p_limit)
supabase/migrations/20260904090000_watchlist_decision_sync.sql:456:create or replace function public.claim_watchlist_alert_events(p_limit integer default 200)
supabase/migrations/20260904090000_watchlist_decision_sync.sql:475:    limit least(greatest(coalesce(p_limit, 200), 1), 500)
supabase/migrations/20260904090000_watchlist_decision_sync.sql:492:  p_limit_per_kind integer default 50
supabase/migrations/20260904090000_watchlist_decision_sync.sql:515:        limit least(greatest(coalesce(p_limit_per_kind, 50), 1), 100)
supabase/migrations/20260904090000_watchlist_decision_sync.sql:525:        limit least(greatest(coalesce(p_limit_per_kind, 50), 1), 100)
supabase/migrations/20260904090000_watchlist_decision_sync.sql:823:  p_limit integer default 10,
supabase/migrations/20260904090000_watchlist_decision_sync.sql:864:    limit least(greatest(coalesce(p_limit, 10), 1), 25)
supabase/migrations/20260904090000_watchlist_decision_sync.sql:893:  p_limit integer default 30,
supabase/migrations/20260904090000_watchlist_decision_sync.sql:906:  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 200);
supabase/migrations/20260715130000_security_master_data.sql:193:  p_limit integer default 10
supabase/migrations/20260715130000_security_master_data.sql:213:           greatest(1, least(coalesce(p_limit, 10), 30)) as result_limit
supabase/migrations/20260715130000_security_master_data.sql:293:  p_limit integer,
supabase/migrations/20260715130000_security_master_data.sql:304:  if nullif(trim(p_subject_hash), '') is null or p_limit < 1 or p_window_seconds < 1 then
supabase/migrations/20260715130000_security_master_data.sql:325:  return v_attempts <= p_limit;
supabase/migrations/20260728130000_usage_run_lifecycle.sql:258:  p_limit integer default 100
supabase/migrations/20260728130000_usage_run_lifecycle.sql:269:     or p_limit < 1 or p_limit > 1000 then
supabase/migrations/20260728130000_usage_run_lifecycle.sql:281:    limit p_limit
supabase/migrations/20261018120000_anchor_runner.sql:142:create function public.research_s4_anchor_read_outbox(p_owner uuid, p_generation bigint, p_after bigint, p_limit integer)
supabase/migrations/20261018120000_anchor_runner.sql:146:  if p_limit is null or p_limit < 1 or p_limit > 500 or p_after is null or p_after < 0 then raise exception 'input_limit' using errcode = '22023'; end if;
supabase/migrations/20261018120000_anchor_runner.sql:149:    from public.research_s4_outbox o where o.user_id = p_owner and o.sequence > p_after order by o.sequence limit p_limit;
supabase/migrations/20261107091000_facts_extensions.sql:197:-- Envelope {state_revs (issuer_id asc), lineage (asc), rows, conflicts, truncated, row_count}.
supabase/migrations/20261107091000_facts_extensions.sql:200:  p_from date, p_to date, p_history boolean, p_limit int, p_include_non_ok boolean default false)
supabase/migrations/20261107091000_facts_extensions.sql:216:), clash as (
supabase/migrations/20261107091000_facts_extensions.sql:245:  where (coalesce(p_history, false) or k.is_current) and (p_limit is null or k.key_rank <= p_limit)
supabase/migrations/20261107091000_facts_extensions.sql:252:  'state_revs', (select coalesce(jsonb_agg(jsonb_build_object('issuer_id', m.issuer_id, 'state_rev', public.fact_state_rev(m.issuer_id, p_market)) order by m.issuer_id), '[]'::jsonb) from members m),
supabase/migrations/20261107091000_facts_extensions.sql:270:  p_from date, p_to date, p_history boolean, p_limit int, p_include_non_ok boolean default false)
supabase/migrations/20261107091000_facts_extensions.sql:273:    'state_rev', coalesce(x.v -> 'state_revs' -> 0 -> 'state_rev', to_jsonb(public.fact_state_rev(p_issuer, p_market))),
supabase/migrations/20261107091000_facts_extensions.sql:275:  from (select public.read_facts_lineage(array[p_issuer], p_market, p_concepts, p_as_of, p_from, p_to, p_history, p_limit, p_include_non_ok) as v) x
config.toml
migrations
migrations.lock.json
seed.sql
tests
  async claimLease(issuer,market,batch,ttl){return (await call<unknown>('claim_fact_sync_lease',{p_issuer:issuer,p_market:market,p_batch:batch,p_ttl_seconds:ttl}))===true;},
  beginRun:(issuer,market,batch,gen)=>call<string>('begin_sync_run',{p_issuer:issuer,p_market:market,p_batch:batch,p_mapping_gen:gen}),
  async stageFilings(run,input){
   const out=new Map<string,string>();
   for(const part of chunk(input)){const m=await call<Record<string,string>|null>('stage_filings',{p_run:run,p_rows:filingArgs(part)});for(const [k,v] of Object.entries(m??{}))out.set(k,v);}
   return assertAllStaged(input,out);
  },
  async stageFacts(run,input){let n=0;for(const part of chunk(input))n+=Number(await call<number>('stage_facts',{p_run:run,p_rows:part}));return n;},
  async quarantineFacts(run,ids,item){return Number(await call<unknown>('quarantine_facts',{p_run:run,p_fact_ids:ids,p_item:item}));},
  async publishRun(run,manifest,expectedRev){return Number(await call<unknown>('publish_sync_run',{p_run:run,p_manifest:manifest,p_expected_rev:expectedRev??null}));},
  async abandonRun(run){await call('abandon_sync_run',{p_run:run});},
  async releaseLease(issuer,market,batch,outcome,nextDue){await call('release_fact_sync_lease',{p_issuer:issuer,p_market:market,p_batch:batch,p_outcome:outcome,p_next_due:nextDue});},
  async resolveFactsQuarantine(item,chosen,by){const x=await call<{promoted:unknown;skipped:unknown;chosen_fact_ids?:unknown}>('resolve_facts_quarantine',{p_item:item,p_chosen:chosen,p_resolved_by:by});return {promoted:Number(x.promoted),skipped:Number(x.skipped),chosenFactIds:Array.isArray(x.chosen_fact_ids)?x.chosen_fact_ids.map(String):[]};},
  async replaceMetrics(issuer,market,rev,input){return Number(await call<unknown>('replace_financial_metrics',{p_issuer:issuer,p_market:market,p_based_on_rev:rev,p_rows:input.map(metricArgs)}));},
  async readFacts(issuer,market,opts){return resultFromEnvelope(await call<ReadFactsEnvelope>('read_facts',readArgs(issuer,market,opts)));},
  async factsByIds(ids){
   const out:FactRow[]=[];
   for(const part of chunkIds([...new Set(ids)]))out.push(...(await pageAll<Record<string,unknown>>(()=>c.from('financial_facts').select('*').in('fact_id',part).order('fact_id'))).map(factRowFromTable));
   return out.sort((a,b)=>a.fact_id<b.fact_id?-1:a.fact_id>b.fact_id?1:0);   // deduped, ordered by fact_id across chunks
  },
  async openConflicts(issuer,market){
   return (await pageAll<{id:string;natural_key:string;payload:Record<string,unknown>}>(()=>c.from('dq_quarantine').select('id,natural_key,payload').eq('table_name','financial_facts').eq('reason_code','same_day_conflict').eq('status','open').like('natural_key',`${conflictPrefix(issuer,market)}%`).order('created_at').order('id'))).map(conflictFromItem);
  },
  async filingsOfIssuer(issuer,market,opts){
   return (await pageAll<Record<string,unknown>>(()=>{
    let q=c.from('filings').select('*').eq('issuer_id',issuer).eq('market',market);
    if(opts.from!==undefined)q=q.gte('available_date',opts.from);
    if(opts.to!==undefined)q=q.lte('available_date',opts.to);
    if(opts.unlinkedOnly)q=q.is('document_ref',null);
    return q.order('available_date',{ascending:false}).order('filing_id');
   },opts.limit)).map(filingFromTable);
  },
  async updateFilingLink(filingId,patch){const {error}=await c.from('filings').update(linkPatch(patch)).eq('filing_id',filingId);if(error)throw toFactsDbError(error);},
  async reconcileScope(market,input,snapshotAt){return Number(await call<unknown>('reconcile_fact_sync_scope',{p_market:market,p_rows:input,p_snapshot_at:snapshotAt??null}));},
  async scopeDue(market,now,limit){
   if(limit<1)return [];
   return (await pageAll<Record<string,unknown>>(()=>c.from('fact_sync_scope').select('*').eq('market',market).gt('priority',0).lte('next_due_at',now).order('next_due_at').order('priority',{ascending:false}).order('issuer_id'),limit)).map(scopeFromTable);
  },
  async scopeRows(market,issuerIds){
   const out:ScopeRow[]=[];
   for(const part of chunkIds(issuerIds))out.push(...(await pageAll<Record<string,unknown>>(()=>c.from('fact_sync_scope').select('*').eq('market',market).in('issuer_id',part).order('issuer_id'))).map(scopeFromTable));
   return out;
  },
  async scopeAll(market){return (await pageAll<Record<string,unknown>>(()=>c.from('fact_sync_scope').select('*').eq('market',market).order('issuer_id'))).map(scopeFromTable);},
  async metricsOfIssuer(issuer,market,formulaVersion){
   // Pages may span a concurrent replace_financial_metrics: accept a read only when every row carries
   // the same based_on_rev AND the same based_on_lineage vector (T8) and the row count equals the first page's exact count; else retry, then fail.
   for(let attempt=0;attempt<METRICS_ATTEMPTS;attempt++){
    const out:Record<string,unknown>[]=[];let total:number|null=null;
    for(let from=0;;from+=READ_PAGE){
     const q=c.from('financial_metrics').select('*',from===0?{count:'exact'}:undefined).eq('issuer_id',issuer).eq('market',market).eq('formula_version',formulaVersion).order('metric').order('period_end').order('period_start').order('input_unit').order('basis') as Query;
     const {data,error,count}=await q.range(from,from+READ_PAGE-1);
     if(error)throw toFactsDbError(error);
     if(from===0)total=count??null;
     const part=(data??[]) as Record<string,unknown>[];
     out.push(...part);
     if(part.length<READ_PAGE)break;
    }
    const rev=out[0]?.based_on_rev;const vector=lineageKey(lineageRevsFrom(out[0]?.based_on_lineage));
    if(total===out.length&&out.every(r=>Number(r.based_on_rev)===Number(rev)&&lineageKey(lineageRevsFrom(r.based_on_lineage))===vector))return out.map(metricFromTable);
   }
   throw new FactsDbError('unknown','metrics_unstable');
  },
  async targetOf(issuer){const r=await rows<{merged_into:string|null}>(c.from('issuers').select('merged_into').eq('issuer_id',issuer).limit(1));return r[0]?.merged_into??issuer;},
  async lineageOf(target){return [target,...(await pageAll<{issuer_id:string}>(()=>c.from('issuers').select('issuer_id').eq('merged_into',target).order('issuer_id'))).map(r=>String(r.issuer_id))];},
  async stateRevs(issuers,market){
   if(issuers.length===0)return [];
   // read_facts_lineage with no concepts: the revs of every member in one snapshot (anon may call it)
   return lineageRevsFrom((await call<ReadFactsLineageEnvelope>('read_facts_lineage',readLineageArgs(issuers,market,{concepts:[],asOf:'1900-01-01'}))).state_revs);
  },
  async readFactsLineage(issuers,market,opts){return lineageResultFromEnvelope(await call<ReadFactsLineageEnvelope>('read_facts_lineage',readLineageArgs(issuers,market,opts)));},
  async readFilingFacts(filingId,includeNonOk){return ((await call<{rows?:Record<string,unknown>[]}|null>('read_filing_facts',{p_filing:filingId,p_include_non_ok:includeNonOk}))?.rows??[]).map(filingFactFromJson);},
  async replaceMetricsLineage(issuer,market,basedOn,input){return Number(await call<unknown>('replace_financial_metrics_lineage',{p_issuer:issuer,p_market:market,p_based_on:basedOn,p_rows:input.map(metricArgs)}));},
  async findFilingBySourceRef(source,sourceRef){const r=await rows<Record<string,unknown>>(c.from('filings').select('*').eq('source',source).eq('source_ref',sourceRef).limit(1));return r[0]?filingFromTable(r[0]):null;},
  async filingsForCalendar(issuer,market,opts){
   // keyset paging on filing_id (stable under concurrent inserts, unlike offsets), deduped, then ordered like pg
   const byId=new Map<string,Record<string,unknown>>();
   for(let after:string|null=null;;){
    const part:Record<string,unknown>[]=await rows<Record<string,unknown>>((()=>{let q=c.from('filings').select('*').eq('issuer_id',issuer).eq('market',market).gte('period_end',opts.fromPeriodEnd);if(after!==null)q=q.gt('filing_id',after);return q.order('filing_id').limit(READ_PAGE);})());
    for(const r of part)byId.set(String(r.filing_id),r);
    if(part.length<READ_PAGE)break;
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

exec
/bin/zsh -lc "sed -n '197,263p' supabase/migrations/20261107091000_facts_extensions.sql; sed -n '72,103p' src/lib/facts/db.ts; ls -a /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees | head; git status --short" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
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
/** The complete vector compared (T8): same members, same revs. */
export const lineageRevsEqual=(a:LineageRev[],b:LineageRev[]):boolean=>lineageKey(a)===lineageKey(b);
export function scopeFromTable(r:Record<string,unknown>):ScopeRow{
 return {issuer_id:String(r.issuer_id),market:r.market as Market,reasons:Array.isArray(r.reasons)?r.reasons as string[]:[],priority:Number(r.priority),fetch_key:String(r.fetch_key),
  next_due_at:isoTs(r.next_due_at),lease_until:isoOrNull(r.lease_until),lease_batch_id:r.lease_batch_id===null?null:String(r.lease_batch_id),state_rev:Number(r.state_rev),
  last_attempt_at:isoOrNull(r.last_attempt_at),last_success_at:isoOrNull(r.last_success_at),last_batch_id:r.last_batch_id===null?null:String(r.last_batch_id),last_status:(r.last_status??null) as ScopeRow['last_status']};
}
export function metricFromTable(r:Record<string,unknown>):MetricRow{
 return {issuer_id:String(r.issuer_id),market:r.market as Market,metric:String(r.metric),period_start:String(r.period_start),period_end:String(r.period_end),duration:r.duration as MetricRow['duration'],
  value:String(r.value_text),unit:String(r.unit),input_unit:String(r.input_unit),basis:String(r.basis),formula_version:String(r.formula_version),inputs:(Array.isArray(r.inputs)?r.inputs:[]) as MetricRow['inputs'],based_on_rev:Number(r.based_on_rev),
  based_on_lineage:lineageRevsFrom(r.based_on_lineage),as_of:String(r.as_of)};
}
/** MetricRow → replace_financial_metrics row (issuer/market come from the call). */
export function metricArgs(m:MetricRow){return {metric:m.metric,period_start:m.period_start,period_end:m.period_end,duration:m.duration,value:m.value,unit:m.unit,input_unit:m.input_unit,basis:m.basis,formula_version:m.formula_version,inputs:m.inputs,as_of:m.as_of};}
/** FilingInsert → stage_filings row (issuer/market come from the run). */
export function filingArgs(rows:FilingInsert[]){return rows.map(r=>({filing_id:r.filing_id,source:r.source,origin:r.origin,form_type:r.formType,fiscal_year:r.fiscalYear,fiscal_period:r.fiscalPeriod,period_end:r.periodEnd,available_date:r.availableDate,source_ref:r.sourceRef,url:r.url}));}
export function readArgs(issuer:string,market:Market,o:ReadFactsOptions){return {p_issuer:issuer,p_market:market,p_concepts:o.concepts,p_as_of:o.asOf,p_from:o.from??null,p_to:o.to??null,p_history:o.history===true,p_limit:o.limit??null,p_include_non_ok:o.includeNonOk===true};}
export function readLineageArgs(issuers:string[],market:Market,o:ReadFactsOptions){return {p_issuers:issuers,p_market:market,p_concepts:o.concepts,p_as_of:o.asOf,p_from:o.from??null,p_to:o.to??null,p_history:o.history===true,p_limit:o.limit??null,p_include_non_ok:o.includeNonOk===true};}
export interface ReadFactsLineageEnvelope{state_revs:unknown;lineage:unknown;rows:Record<string,unknown>[];conflicts:unknown;truncated:boolean;row_count:number}
export function lineageResultFromEnvelope(env:ReadFactsLineageEnvelope):ReadFactsLineageResult{
 const conflicts=(Array.isArray(env.conflicts)?env.conflicts:[]) as {key?:unknown;available_date?:unknown;fact_ids?:unknown}[];
 return {stateRevs:lineageRevsFrom(env.state_revs),lineage:Array.isArray(env.lineage)?env.lineage.map(String):[],rows:(env.rows??[]).map(rowFromEnvelope),
  conflicts:conflicts.map((c):LineageConflict=>({key:(c.key&&typeof c.key==='object'?c.key:{}) as Record<string,string|null>,available_date:String(c.available_date),fact_ids:Array.isArray(c.fact_ids)?c.fact_ids.map(String):[]})),
  truncated:env.truncated===true};
}
/** read_filing_facts row → FilingFactRow (value from value_text, ISO created_at). */
export function filingFactFromJson(r:Record<string,unknown>):FilingFactRow{return {...factRowFromTable(r),run_status:r.run_status as RunStatus};}
export const fenceArgs=(f:Fence)=>({pair:f.pair,cycle_id:f.cycle_id,issuer_id:f.issuer_id,market:f.market,batch_id:f.batch_id,attempt:f.attempt});
export function fenceFromJson(x:unknown):Fence|null{
 if(x===null||x===undefined)return null;
 const f=x as Record<string,unknown>;
 return {pair:String(f.pair) as CyclePairId,cycle_id:String(f.cycle_id),issuer_id:String(f.issuer_id),market:f.market as Market,batch_id:String(f.batch_id),attempt:Number(f.attempt)};
.
..
data-foundation-2
data-foundation-3-18bc61
document-pipeline-3cfbb4
evals-gold-sets-75bfc9
industry-research-fa303d
judgment-framework-50f9e1
product-demo-video
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-fqZICr8o' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-JElQB5yM' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/10-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/10-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/10-review-fix2.md
?? docs/audits/2026-11-05-data-foundation-3/codex/10-review.md

codex
No actionable regressions were identified. The conflict query preserves complete conflicts independently of its row limit, and the validation changes are consistent with the existing callers and database envelope contract. Tests were inspected but not executed.
No actionable regressions were identified. The conflict query preserves complete conflicts independently of its row limit, and the validation changes are consistent with the existing callers and database envelope contract. Tests were inspected but not executed.

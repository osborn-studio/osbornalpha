OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1afef-9afd-70e3-9741-50c53e44fb4a
--------
user
commit a6a9212
exec
/bin/zsh -lc 'pwd; git status --short; git show --stat --oneline a6a9212; cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-FoOjbt9t' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-hfBrVHug' (errno=Operation not permitted)
 M docs/audits/2026-11-05-data-foundation-3/implementation-log.md
?? docs/audits/2026-11-05-data-foundation-3/codex/3a-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/3a-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/3a-review-fix2.md
?? docs/audits/2026-11-05-data-foundation-3/codex/3a-review.md
?? docs/audits/2026-11-05-data-foundation-3/codex/3b-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/3b-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/3b-review-fix2.md
?? docs/audits/2026-11-05-data-foundation-3/codex/3b-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-YXbQsHI1' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-QpcUzMuK' (errno=Operation not permitted)
a6a9212 fix(entities): OpenFIGI landed pacer reuse, budget-aware back-off shared across callers, body-read retry, record schema checks
 src/lib/entities/identifiers/openfigi.test.ts | 41 ++++++++++-
 src/lib/entities/identifiers/openfigi.ts      | 99 ++++++++++++++++++---------
 2 files changed, 103 insertions(+), 37 deletions(-)
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
/bin/zsh -lc 'find .. -name AGENTS.md -o -name AGENTS.override.md; git show a6a9212 --; cat AGENTS.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 500ms:
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-rzXuARUM' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-J698k1O8' (errno=Operation not permitted)
commit a6a9212de737acd7447dc4f8acbf369d739df427
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 00:17:44 2026 -0800

    fix(entities): OpenFIGI landed pacer reuse, budget-aware back-off shared across callers, body-read retry, record schema checks
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/entities/identifiers/openfigi.test.ts b/src/lib/entities/identifiers/openfigi.test.ts
index dc51aaf..c7a342b 100644
--- a/src/lib/entities/identifiers/openfigi.test.ts
+++ b/src/lib/entities/identifiers/openfigi.test.ts
@@ -5,7 +5,7 @@ import {describe,it,expect} from 'vitest';
 import {memoryRawStore} from '../../dq/raw-store';
 import {
  ALLOWED_SECURITY_TYPES,BACKOFF_MS,EXCH_MAP,EXCH_MAP_VERSION,OPENFIGI_URL,OpenFigiError,
- exchCodeFor,groupFigiResults,mapIsins,mapJobs,mapTickers,openFigiLimits,securityTickerFor,type FigiRecord,
+ createFigiLimiter,exchCodeFor,groupFigiResults,mapIsins,mapJobs,mapTickers,openFigiLimits,securityTickerFor,type FigiRecord,
 } from './openfigi';
 
 const eq=(o:Partial<FigiRecord>):FigiRecord=>({figi:'BBG000B9XRY4',compositeFIGI:'BBG000B9XRY4',ticker:'AAPL',exchCode:'US',securityType:'Common Stock',marketSector:'Equity',...o});
@@ -24,7 +24,7 @@ function harness(replies:Reply[]){
  const calls:{url:string;init:RequestInit}[]=[];const sleeps:number[]=[];let t=0;
  const fetch=(async(url:string|URL|Request,init?:RequestInit)=>{calls.push({url:String(url),init:init??{}});const r=replies.shift();if(!r)throw new Error('unexpected fetch');return r();}) as typeof globalThis.fetch;
  const raw=memoryRawStore();
- return {calls,sleeps,raw,deps:{fetch,raw,now:()=>t,sleep:async(ms:number)=>{sleeps.push(ms);t+=ms;}}};
+ return {calls,sleeps,raw,deps:{fetch,raw,limiter:createFigiLimiter(),now:()=>t,sleep:async(ms:number)=>{sleeps.push(ms);t+=ms;}}};
 }
 const isinItems=(n:number)=>Array.from({length:n},()=>({data:AAPL}));
 
@@ -191,9 +191,44 @@ describe('failure evidence, shared throttling, own-property lookups',()=>{
  });
 });
 
+describe('round 2: body read, budget, shared back-off, schema',()=>{
+ const bad=():Response=>{const r=new Response('{}',{status:429});Object.defineProperty(r,'arrayBuffer',{value:()=>Promise.reject(new TypeError('terminated'))});return r;};
+ const budgetOf=(ms:number,signal=new AbortController().signal)=>({remainingMs:()=>ms,signal});
+ it('retries when the body read fails, recording body_read_failed',async()=>{
+  const h=harness([bad,ok([{data:TENCENT}])]);
+  const out=await mapJobs([{idType:'ID_ISIN',idValue:'A'}],h.deps);
+  expect(h.sleeps).toContain(BACKOFF_MS);expect(out.exhausted).toBe(false);
+  expect(out.failures).toEqual([{status:429,request_sha256:expect.any(String),response_sha256:null,error:'body_read_failed'}]);
+  const h2=harness([bad,bad]);
+  expect((await mapJobs([{idType:'ID_ISIN',idValue:'A'}],h2.deps)).exhausted).toBe(true);
+ });
+ it('rejects an aborted budget and a budget too short for the back-off without sleeping',async()=>{
+  const ctl=new AbortController();ctl.abort();
+  const h=harness([ok([{data:TENCENT}])]);
+  await expect(mapJobs([{idType:'ID_ISIN',idValue:'A'}],{...h.deps,budget:budgetOf(1e9,ctl.signal)})).rejects.toMatchObject({code:'budget_aborted'});
+  expect(h.calls).toHaveLength(0);
+  const h2=harness([status(429),ok([{data:TENCENT}])]);
+  const out=await mapJobs([{idType:'ID_ISIN',idValue:'A'}],{...h2.deps,budget:budgetOf(BACKOFF_MS+500),reserveMs:1000});
+  expect(out.exhausted).toBe(true);expect(h2.sleeps).toEqual([]);expect(h2.calls).toHaveLength(1);
+ });
+ it('makes concurrent callers wait out a back-off started by another',async()=>{
+  const h=harness([status(429),ok([{data:TENCENT}]),ok([{data:TENCENT}])]);
+  await Promise.all([mapIsins(['A'],h.deps),mapIsins(['B'],h.deps)]);
+  expect(h.calls).toHaveLength(3);
+  expect(h.sleeps.filter(ms=>ms===BACKOFF_MS).length).toBeGreaterThanOrEqual(1);
+  expect(h.deps.now()).toBeGreaterThanOrEqual(BACKOFF_MS);
+  expect(h.sleeps.reduce((a,b)=>a+b,0)).toBeLessThan(BACKOFF_MS*2);
+ });
+ it('rejects non-string ticker/exchCode/compositeFIGI/securityType',async()=>{
+  for(const k of ['ticker','exchCode','compositeFIGI','securityType'])
+   await expect(mapJobs([{idType:'ID_ISIN',idValue:'A'}],harness([ok([{data:[{...eq({}),[k]:700}]}])]).deps)).rejects.toThrow('invalid_schema');
+ });
+});
+
 const RECORDED=new URL('../fixtures/openfigi/recorded-probe-isin.json',import.meta.url);
 describe('recorded probe (Task 3b Step 8)',()=>{
- it.skipIf(!existsSync(RECORDED))('maps AAPL, 600519 and 0700 to exactly one group per ticker (Tencent ISIN also lists 80700.HK and the OTC line TCTZF)',()=>{
+ it('maps AAPL, 600519 and 0700 to exactly one group per ticker (Tencent ISIN also lists 80700.HK and the OTC line TCTZF)',()=>{
+  expect(existsSync(RECORDED)).toBe(true);
   const items=JSON.parse(readFileSync(RECORDED,'utf8')) as {data?:FigiRecord[]}[];
   const tickers=items.map(i=>groupFigiResults(i.data??[]).candidates.map(c=>`${c.ticker}:${c.groups.length}`));
   expect(tickers).toEqual([['AAPL:1'],['600519.SH:1'],['00700.HK:1','80700.HK:1','TCTZF:1']]);
diff --git a/src/lib/entities/identifiers/openfigi.ts b/src/lib/entities/identifiers/openfigi.ts
index 3f6a2a8..b90786f 100644
--- a/src/lib/entities/identifiers/openfigi.ts
+++ b/src/lib/entities/identifiers/openfigi.ts
@@ -8,6 +8,7 @@
 // or figi (venue level), sorted so the order of API results never changes the outcome. No venue
 // preference is invented: several groups for one ticker means "do not write, file claims".
 import type {Budget} from '../../facts/types';
+import {PacerError,createPacer,sleep as abortableSleep,type Pacer} from '../../facts/providers/shared';
 import type {RawStore} from '../../dq/raw-store';
 import {normalizeSecurityTicker} from '../../securities/ticker';
 
@@ -30,12 +31,17 @@ export interface FigiEvidence{request_sha256:string;response_sha256:string;index
 export type FigiJobResult=
  |{job:FigiJob;status:'ok';records:FigiRecord[];evidence:FigiEvidence}
  |{job:FigiJob;status:'not_found'|'error';message:string;evidence:FigiEvidence};
-export interface FigiFailure{status:number|null;request_sha256:string;response_sha256:string|null}
+export interface FigiFailure{status:number|null;request_sha256:string;response_sha256:string|null;error?:'body_read_failed'}
 export interface MapResult{results:(FigiJobResult|null)[];exhausted:boolean;requests:number;failures:FigiFailure[]}
 export interface MappedBy{byKey:Map<string,FigiJobResult>;exhausted:boolean;unprocessed:string[];unsupported:string[];requests:number;failures:FigiFailure[]}
-export interface OpenFigiDeps{fetch:typeof fetch;raw:RawStore;apiKey?:string|null;sleep?:(ms:number)=>Promise<void>;now?:()=>number;budget?:Budget}
+/** Shared pacing state for one quota identity: the landed serialized pacer plus a back-off horizon every caller honours. */
+export interface FigiLimiter{pacer:Pacer;blockedUntil:number}
+export const createFigiLimiter=():FigiLimiter=>({pacer:createPacer(3000),blockedUntil:-Infinity});
+export interface OpenFigiDeps{fetch:typeof fetch;raw:RawStore;apiKey?:string|null;sleep?:(ms:number,signal?:AbortSignal)=>Promise<void>;now?:()=>number;budget?:Budget;
+ /** Cleanup reserve kept free of back-off waits (default 0). */reserveMs?:number;
+ /** Default: one process-wide limiter per quota identity (key vs no key), shared by all mapJobs calls. Tests inject their own for isolation. */limiter?:FigiLimiter}
 export class OpenFigiError extends Error{
- constructor(readonly code:'invalid_schema'|'openfigi_http',detail?:string,readonly evidence?:FigiFailure){super(detail?`${code}: ${detail}`:code);this.name='OpenFigiError';}
+ constructor(readonly code:'invalid_schema'|'openfigi_http'|'budget_aborted',detail?:string,readonly evidence?:FigiFailure){super(detail?`${code}: ${detail}`:code);this.name='OpenFigiError';}
 }
 
 export function openFigiLimits(apiKey?:string|null):{jobsPerRequest:number;minIntervalMs:number}{
@@ -50,6 +56,7 @@ function parseItem(job:FigiJob,item:unknown,evidence:FigiEvidence):FigiJobResult
  if(Array.isArray(o.data)){
   const records=o.data.map(r=>{
    if(!r||typeof r!=='object'||typeof (r as FigiRecord).figi!=='string')throw new OpenFigiError('invalid_schema','record');
+   for(const k of ['ticker','exchCode','compositeFIGI','securityType'] as const){const v=(r as Record<string,unknown>)[k];if(v!==undefined&&v!==null&&typeof v!=='string')throw new OpenFigiError('invalid_schema',`record.${k}`);}
    return r as FigiRecord;
   });
   return records.length?{job,status:'ok',records,evidence}:{job,status:'not_found',message:'empty data',evidence};
@@ -59,32 +66,24 @@ function parseItem(job:FigiJob,item:unknown,evidence:FigiEvidence):FigiJobResult
  throw new OpenFigiError('invalid_schema','job result');
 }
 
-/** One serialized pacer per (fetch, quota identity): every mapJobs call sharing them queues behind the same clock. */
-interface Pacer{last:number|null;tail:Promise<void>}
-const PACERS=new WeakMap<object,Map<string,Pacer>>();
-function pacerFor(deps:OpenFigiDeps):Pacer{
- let m=PACERS.get(deps.fetch);
- if(!m){m=new Map();PACERS.set(deps.fetch,m);}
+// Process-wide limiters keyed on quota identity only (key vs no key), not on the fetch function.
+const LIMITERS=new Map<string,FigiLimiter>();
+function limiterFor(deps:OpenFigiDeps):FigiLimiter{
+ if(deps.limiter)return deps.limiter;
  const id=deps.apiKey?`key:${deps.apiKey}`:'anon';
- let p=m.get(id);
- if(!p){p={last:null,tail:Promise.resolve()};m.set(id,p);}
- return p;
-}
-async function pace(p:Pacer,interval:number,now:()=>number,sleep:(ms:number)=>Promise<void>):Promise<void>{
- const prev=p.tail;let release!:()=>void;
- p.tail=new Promise<void>(r=>{release=r;});
- await prev;
- try{
-  if(p.last!==null){const wait=p.last+interval-now();if(wait>0)await sleep(wait);}
-  p.last=now();
- }finally{release();}
+ let l=LIMITERS.get(id);
+ if(!l){l=createFigiLimiter();LIMITERS.set(id,l);}
+ return l;
 }
+const NO_LIMIT:Budget={remainingMs:()=>Infinity,signal:new AbortController().signal};
 
 export async function mapJobs(jobs:readonly FigiJob[],deps:OpenFigiDeps):Promise<MapResult>{
  const {jobsPerRequest,minIntervalMs}=openFigiLimits(deps.apiKey);
- const sleep=deps.sleep??((ms:number)=>new Promise<void>(r=>setTimeout(r,ms)));
+ const wait=deps.sleep??abortableSleep;
  const now=deps.now??Date.now;
- const pacer=pacerFor(deps);
+ const budget=deps.budget??NO_LIMIT;
+ const reserveMs=deps.reserveMs??0;
+ const limiter=limiterFor(deps);
  const results:(FigiJobResult|null)[]=jobs.map(()=>null);
  const failures:FigiFailure[]=[];
  const headers:Record<string,string>={'Content-Type':'application/json'};
@@ -95,33 +94,65 @@ export async function mapJobs(jobs:readonly FigiJob[],deps:OpenFigiDeps):Promise
   try{JSON.parse(new TextDecoder().decode(bytes));}catch{json=false;}
   return deps.raw.put({kind:'openfigi',bytes,contentType:json?'application/json':'text/html',meta},deps.budget);
  };
+ const done=(exhausted:boolean):MapResult=>({results,exhausted,requests,failures});
+ /** false = the budget cannot afford the wait (caller reports exhausted). Aborts become OpenFigiError('budget_aborted'). */
+ const waitUntilUnblocked=async():Promise<boolean>=>{
+  const gap=limiter.blockedUntil-now();
+  if(gap<=0)return true;
+  if(budget.remainingMs()-gap<=reserveMs)return false;
+  try{await wait(gap,budget.signal);}catch{throw new OpenFigiError('budget_aborted');}
+  return true;
+ };
  /** The request is stored before it is sent; every received response is stored before anything else happens. */
- const send=async(body:string,reqSha:string):Promise<{res:Response|null;bytes:Uint8Array|null;sha:string|null}>=>{
-  await pace(pacer,minIntervalMs,now,sleep);
+ const send=async(body:string,reqSha:string):Promise<{res:Response|null;bytes:Uint8Array|null;sha:string|null}|'exhausted'>=>{
+  if(!(await waitUntilUnblocked()))return 'exhausted';
+  try{await limiter.pacer.admit({budget,reserveMs,now,sleep:wait,minIntervalMs});}
+  catch(e){
+   if(e instanceof PacerError)return e.code==='budget_exhausted'?'exhausted':(()=>{throw new OpenFigiError('budget_aborted');})();
+   throw e;
+  }
   requests++;
   let res:Response;
-  try{res=await deps.fetch(OPENFIGI_URL,{method:'POST',headers,body,signal:deps.budget?.signal});}
-  catch(e){if(deps.budget?.signal.aborted)throw e;failures.push({status:null,request_sha256:reqSha,response_sha256:null});return {res:null,bytes:null,sha:null};}
-  const bytes=new Uint8Array(await res.arrayBuffer());
+  try{res=await deps.fetch(OPENFIGI_URL,{method:'POST',headers,body,signal:budget.signal});}
+  catch(e){
+   if(budget.signal.aborted)throw new OpenFigiError('budget_aborted',e instanceof Error?e.name:undefined);
+   failures.push({status:null,request_sha256:reqSha,response_sha256:null});return {res:null,bytes:null,sha:null};
+  }
+  let bytes:Uint8Array;
+  try{bytes=new Uint8Array(await res.arrayBuffer());}
+  catch{
+   if(budget.signal.aborted)throw new OpenFigiError('budget_aborted');
+   failures.push({status:res.status,request_sha256:reqSha,response_sha256:null,error:'body_read_failed'});return {res:null,bytes:null,sha:null};
+  }
   const stored=await store(bytes,{role:'response',request_sha256:reqSha,http_status:res.status});
   if(!res.ok)failures.push({status:res.status,request_sha256:reqSha,response_sha256:stored.sha256});
   return {res,bytes,sha:stored.sha256};
  };
  const retryable=(r:Response|null)=>r===null||r.status===429||r.status>=500;
+ /** Every caller sharing the limiter backs off, not only this one. */
+ const backoff=()=>{limiter.blockedUntil=Math.max(limiter.blockedUntil,now()+BACKOFF_MS);};
  for(let start=0;start<jobs.length;start+=jobsPerRequest){
+  if(budget.signal.aborted)throw new OpenFigiError('budget_aborted');
   const chunk=jobs.slice(start,start+jobsPerRequest);
   const body=JSON.stringify(chunk);
   const req=await store(new TextEncoder().encode(body),{role:'request',jobs:chunk.length});
   let out=await send(body,req.sha256);
-  if(retryable(out.res)){await sleep(BACKOFF_MS);out=await send(body,req.sha256);}
-  if(out.res===null||retryable(out.res))return {results,exhausted:true,requests,failures};
-  if(!out.res.ok)throw new OpenFigiError('openfigi_http',String(out.res.status),failures[failures.length-1]);
+  if(out==='exhausted')return done(true);
+  if(retryable(out.res)){
+   if(budget.remainingMs()-BACKOFF_MS<=reserveMs)return done(true);
+   backoff();
+   out=await send(body,req.sha256);
+   if(out==='exhausted')return done(true);
+  }
+  if(retryable(out.res)){backoff();return done(true);}
+  const res=out.res!;
+  if(!res.ok)throw new OpenFigiError('openfigi_http',String(res.status),failures[failures.length-1]);
   let parsed:unknown;
-  try{parsed=JSON.parse(new TextDecoder().decode(out.bytes!));}catch{throw new OpenFigiError('invalid_schema','response is not JSON',{status:out.res.status,request_sha256:req.sha256,response_sha256:out.sha});}
-  if(!Array.isArray(parsed)||parsed.length!==chunk.length)throw new OpenFigiError('invalid_schema','response length',{status:out.res.status,request_sha256:req.sha256,response_sha256:out.sha});
+  try{parsed=JSON.parse(new TextDecoder().decode(out.bytes!));}catch{throw new OpenFigiError('invalid_schema','response is not JSON',{status:res.status,request_sha256:req.sha256,response_sha256:out.sha});}
+  if(!Array.isArray(parsed)||parsed.length!==chunk.length)throw new OpenFigiError('invalid_schema','response length',{status:res.status,request_sha256:req.sha256,response_sha256:out.sha});
   parsed.forEach((item,i)=>{results[start+i]=parseItem(chunk[i],item,{request_sha256:req.sha256,response_sha256:out.sha!,index:i});});
  }
- return {results,exhausted:false,requests,failures};
+ return done(false);
 }
 
 function keyed(keys:readonly string[],jobs:FigiJob[],out:MapResult,unsupported:string[]):MappedBy{
cat: AGENTS.md: No such file or directory

exec
/bin/zsh -lc "cat src/lib/facts/providers/shared.ts; sed -n '1,240p' src/lib/entities/identifiers/openfigi.ts; cat package.json; for d in /Volumes /Volumes/AIMATE_WORK /Volumes/AIMATE_WORK/Developer /Volumes/AIMATE_WORK/Developer/CodeX /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude; do for n in AGENTS.override.md AGENTS.md; do test "'! -f "$d/$n" || { echo "$d/$n"; cat "$d/$n"; }; done; done' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
// src/lib/facts/providers/shared.ts
// Provider plumbing shared by the EDGAR and Tushare adapters (spec §6.2/§6.3; §4.7 raw_hash rule):
// typed provider failures (ProviderError IS SyncError from ../errors, so sync.ts reads `code` as the
// batch error code without re-wrapping), snapshot construction with sha256, the raw_hash locator rule
// sha256(snapshot.sha256 + "\n" + locator), and a number-preserving JSON serialiser used by the
// fixture recorder (never JSON.parse → stringify a financial value).
import {createHash} from 'node:crypto';
import {SyncError} from '../errors';
import type {SyncErrorCode} from '../errors';
import type {Budget,Duration,RawSnapshot} from '../types';

export type ProviderErrorCode=SyncErrorCode;
export const ProviderError=SyncError;
export type ProviderError=SyncError;

export const sha256Hex=(data:Uint8Array|string)=>createHash('sha256').update(data).digest('hex');
export const rawHashOf=(snapshotSha256:string,locator:string)=>sha256Hex(`${snapshotSha256}\n${locator}`);
export function snapshotOf(bytes:Uint8Array,meta:Partial<RawSnapshot['meta']>&{source:RawSnapshot['meta']['source']}):RawSnapshot{
 return {bytes,sha256:sha256Hex(bytes),meta:{fetched_at:new Date().toISOString(),http_status:200,...meta}};
}
export const padCik=(cik:string|number)=>String(cik).replace(/^0+/,'').padStart(10,'0');
export const ymd=(d:string)=>/^\d{8}$/.test(d)?`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`:d;
const BUCKETS:[number,Duration][]=[[90,'3M'],[182,'6M'],[273,'9M'],[365,'12M']];
/** Closest duration bucket for an odd period length; only used to type oddDuration candidates (never written as facts). */
export const nearestDuration=(days:number):Duration=>BUCKETS.reduce((best,cur)=>Math.abs(cur[0]-days)<Math.abs(best[0]-days)?cur:best)[1];
export function sleep(ms:number,signal:AbortSignal):Promise<void>{
 return new Promise((resolve,reject)=>{
  if(signal.aborted)return reject(signal.reason);
  const onAbort=()=>{clearTimeout(t);reject(signal.reason);};
  const t=setTimeout(()=>{signal.removeEventListener('abort',onAbort);resolve();},ms);
  signal.addEventListener('abort',onAbort,{once:true});
 });
}
/** Thrown by Pacer.admit; the message is the fixed code. Adapters map it to their own ProviderError code. */
export class PacerError extends Error{constructor(public readonly code:'budget_aborted'|'budget_exhausted'){super(code);this.name='PacerError';}}
export interface AdmitOptions{budget:Budget;reserveMs:number;now?:()=>number;sleep?:typeof sleep;minIntervalMs?:number}
export interface Pacer{admit(o:AdmitOptions):Promise<void>;reset():void}
/**
 * One process-wide request pacer per upstream. Admissions are SERIALISED (a promise chain), and each wait is computed from the
 * previous ACTUAL dispatch time recorded when admit() resolves, so a timer delayed by the event loop can never let two requests
 * start closer than the interval. A wait that would end inside the cleanup reserve (remaining - wait <= reserveMs) is rejected
 * up front with budget_exhausted instead of sleeping; an aborted budget gives budget_aborted (a queued caller is released as soon
 * as its own signal aborts, and its entry is skipped when its turn comes). The caller issues its request
 * right after admit() resolves.
 */
export function createPacer(defaultIntervalMs:number):Pacer{
 let chain:Promise<void>=Promise.resolve();let lastStart=-Infinity;
 const run=async(o:AdmitOptions)=>{
  const now=o.now??Date.now,wait=o.sleep??sleep,interval=o.minIntervalMs??defaultIntervalMs;
  const check=()=>{if(o.budget.signal.aborted)throw new PacerError('budget_aborted');if(o.budget.remainingMs()<=o.reserveMs)throw new PacerError('budget_exhausted');};
  check();
  const gap=lastStart+interval-now();
  if(gap>0){
   if(o.budget.remainingMs()-gap<=o.reserveMs)throw new PacerError('budget_exhausted');
   try{await wait(gap,o.budget.signal);}catch{throw new PacerError('budget_aborted');}
   check();                                  // the budget may have run out or been cancelled while waiting
  }
  lastStart=now();
 };
 return {
  admit(o){
   // The internal chain keeps serialising; the caller-facing promise also races its OWN signal, so an aborted caller is released
   // at once instead of waiting behind earlier admissions. When its turn comes the cancelled entry is skipped by run()'s first
   // check (no dispatch, lastStart unchanged).
   const p=chain.then(()=>run(o));chain=p.catch(()=>undefined);
   const signal=o.budget.signal;
   if(signal.aborted)return Promise.reject(new PacerError('budget_aborted'));
   return new Promise<void>((resolve,reject)=>{
    const onAbort=()=>reject(new PacerError('budget_aborted'));
    signal.addEventListener('abort',onAbort,{once:true});
    p.then(resolve,reject).finally(()=>signal.removeEventListener('abort',onAbort));
   });
  },
  reset(){chain=Promise.resolve();lastStart=-Infinity;},
 };
}
export function budgetFor(ms:number,parent?:AbortSignal):Budget{
 const until=Date.now()+ms;const ctl=new AbortController();
 parent?.addEventListener('abort',()=>ctl.abort(parent.reason),{once:true});
 return {remainingMs:()=>until-Date.now(),signal:ctl.signal};
}
/** JSON text of a scanJsonNumbers() tree with every {__num:'<literal>'} written back as the literal. */
export function stringifyPreservingNumbers(value:unknown,indent?:number):string{
 const text=JSON.stringify(value,(_k,v)=>v&&typeof v==='object'&&typeof (v as {__num?:unknown}).__num==='string'?`\u0000${(v as {__num:string}).__num}\u0000`:v,indent);
 return text.replace(/"\\u0000(-?[0-9.eE+]+)\\u0000"/g,'$1');
}
// src/lib/entities/identifiers/openfigi.ts
// Stage B/C (spec §4.1.2–§4.1.3): OpenFIGI v3 mapping adapter. mapJobs throttles to 80% of the
// documented limits (no key: 25 requests/min and 10 jobs/request; key: 250/min and 100 jobs),
// backs off BACKOFF_MS once on 429/5xx/network failure and then gives up the rest of the run
// (exhausted → the caller records quota_exhausted). Each request's job array and the exact
// response bytes go to reconcile-raw; the API key travels only in a header and is never stored.
// groupFigiResults is pure: equity filter, EXCH_MAP, grouping by compositeFIGI (composite level)
// or figi (venue level), sorted so the order of API results never changes the outcome. No venue
// preference is invented: several groups for one ticker means "do not write, file claims".
import type {Budget} from '../../facts/types';
import {PacerError,createPacer,sleep as abortableSleep,type Pacer} from '../../facts/providers/shared';
import type {RawStore} from '../../dq/raw-store';
import {normalizeSecurityTicker} from '../../securities/ticker';

export const OPENFIGI_URL='https://api.openfigi.com/v3/mapping';
export const OPENFIGI_VERSION='v3';
export const EXCH_MAP_VERSION='exch-map/1';
/** True only after the Task 3b live check (verification.md). fill-identifiers/link-ah --apply refuse while false. */
export const EXCH_MAP_VERIFIED:boolean=true;
/** openfigi.com/about/exchange-codes. CG→.SH, CS→.SZ, CH (China composite) by code prefix (6/9→.SH, 0/3→.SZ). */
export const EXCH_MAP:Readonly<Record<string,'US'|'SH'|'SZ'|'CH'|'HK'>>={US:'US',UN:'US',UW:'US',UA:'US',UR:'US',UP:'US',UQ:'US',CG:'SH',CS:'SZ',CH:'CH',HK:'HK'};
/** Spec §4.1.2 set; extend only with values observed in the live check (contract issue 1). */
export const ALLOWED_SECURITY_TYPES:ReadonlySet<string>=new Set(['Common Stock','ADR','GDR']);
export const BACKOFF_MS=60_000;
const FIGI=/^BBG[A-Z0-9]{9}$/;

export type FigiMarket='US'|'CN'|'HK';
export interface FigiJob{idType:'ID_ISIN'|'TICKER';idValue:string;exchCode?:string}
export interface FigiRecord{figi:string;compositeFIGI?:string|null;ticker?:string|null;exchCode?:string|null;securityType?:string|null;securityType2?:string|null;marketSector?:string|null;name?:string|null;shareClassFIGI?:string|null}
export interface FigiEvidence{request_sha256:string;response_sha256:string;index:number}
export type FigiJobResult=
 |{job:FigiJob;status:'ok';records:FigiRecord[];evidence:FigiEvidence}
 |{job:FigiJob;status:'not_found'|'error';message:string;evidence:FigiEvidence};
export interface FigiFailure{status:number|null;request_sha256:string;response_sha256:string|null;error?:'body_read_failed'}
export interface MapResult{results:(FigiJobResult|null)[];exhausted:boolean;requests:number;failures:FigiFailure[]}
export interface MappedBy{byKey:Map<string,FigiJobResult>;exhausted:boolean;unprocessed:string[];unsupported:string[];requests:number;failures:FigiFailure[]}
/** Shared pacing state for one quota identity: the landed serialized pacer plus a back-off horizon every caller honours. */
export interface FigiLimiter{pacer:Pacer;blockedUntil:number}
export const createFigiLimiter=():FigiLimiter=>({pacer:createPacer(3000),blockedUntil:-Infinity});
export interface OpenFigiDeps{fetch:typeof fetch;raw:RawStore;apiKey?:string|null;sleep?:(ms:number,signal?:AbortSignal)=>Promise<void>;now?:()=>number;budget?:Budget;
 /** Cleanup reserve kept free of back-off waits (default 0). */reserveMs?:number;
 /** Default: one process-wide limiter per quota identity (key vs no key), shared by all mapJobs calls. Tests inject their own for isolation. */limiter?:FigiLimiter}
export class OpenFigiError extends Error{
 constructor(readonly code:'invalid_schema'|'openfigi_http'|'budget_aborted',detail?:string,readonly evidence?:FigiFailure){super(detail?`${code}: ${detail}`:code);this.name='OpenFigiError';}
}

export function openFigiLimits(apiKey?:string|null):{jobsPerRequest:number;minIntervalMs:number}{
 const keyed=!!apiKey;
 const perMinute=Math.floor((keyed?250:25)*0.8);
 return {jobsPerRequest:keyed?100:10,minIntervalMs:Math.ceil(60_000/perMinute)};
}

function parseItem(job:FigiJob,item:unknown,evidence:FigiEvidence):FigiJobResult{
 if(!item||typeof item!=='object'||Array.isArray(item))throw new OpenFigiError('invalid_schema','job result');
 const o=item as {data?:unknown;error?:unknown;warning?:unknown};
 if(Array.isArray(o.data)){
  const records=o.data.map(r=>{
   if(!r||typeof r!=='object'||typeof (r as FigiRecord).figi!=='string')throw new OpenFigiError('invalid_schema','record');
   for(const k of ['ticker','exchCode','compositeFIGI','securityType'] as const){const v=(r as Record<string,unknown>)[k];if(v!==undefined&&v!==null&&typeof v!=='string')throw new OpenFigiError('invalid_schema',`record.${k}`);}
   return r as FigiRecord;
  });
  return records.length?{job,status:'ok',records,evidence}:{job,status:'not_found',message:'empty data',evidence};
 }
 if(typeof o.warning==='string')return {job,status:'not_found',message:o.warning,evidence};
 if(typeof o.error==='string')return {job,status:'error',message:o.error,evidence};
 throw new OpenFigiError('invalid_schema','job result');
}

// Process-wide limiters keyed on quota identity only (key vs no key), not on the fetch function.
const LIMITERS=new Map<string,FigiLimiter>();
function limiterFor(deps:OpenFigiDeps):FigiLimiter{
 if(deps.limiter)return deps.limiter;
 const id=deps.apiKey?`key:${deps.apiKey}`:'anon';
 let l=LIMITERS.get(id);
 if(!l){l=createFigiLimiter();LIMITERS.set(id,l);}
 return l;
}
const NO_LIMIT:Budget={remainingMs:()=>Infinity,signal:new AbortController().signal};

export async function mapJobs(jobs:readonly FigiJob[],deps:OpenFigiDeps):Promise<MapResult>{
 const {jobsPerRequest,minIntervalMs}=openFigiLimits(deps.apiKey);
 const wait=deps.sleep??abortableSleep;
 const now=deps.now??Date.now;
 const budget=deps.budget??NO_LIMIT;
 const reserveMs=deps.reserveMs??0;
 const limiter=limiterFor(deps);
 const results:(FigiJobResult|null)[]=jobs.map(()=>null);
 const failures:FigiFailure[]=[];
 const headers:Record<string,string>={'Content-Type':'application/json'};
 if(deps.apiKey)headers['X-OPENFIGI-APIKEY']=deps.apiKey;
 let requests=0;
 const store=async(bytes:Uint8Array,meta:Record<string,string|number>)=>{
  let json=true;
  try{JSON.parse(new TextDecoder().decode(bytes));}catch{json=false;}
  return deps.raw.put({kind:'openfigi',bytes,contentType:json?'application/json':'text/html',meta},deps.budget);
 };
 const done=(exhausted:boolean):MapResult=>({results,exhausted,requests,failures});
 /** false = the budget cannot afford the wait (caller reports exhausted). Aborts become OpenFigiError('budget_aborted'). */
 const waitUntilUnblocked=async():Promise<boolean>=>{
  const gap=limiter.blockedUntil-now();
  if(gap<=0)return true;
  if(budget.remainingMs()-gap<=reserveMs)return false;
  try{await wait(gap,budget.signal);}catch{throw new OpenFigiError('budget_aborted');}
  return true;
 };
 /** The request is stored before it is sent; every received response is stored before anything else happens. */
 const send=async(body:string,reqSha:string):Promise<{res:Response|null;bytes:Uint8Array|null;sha:string|null}|'exhausted'>=>{
  if(!(await waitUntilUnblocked()))return 'exhausted';
  try{await limiter.pacer.admit({budget,reserveMs,now,sleep:wait,minIntervalMs});}
  catch(e){
   if(e instanceof PacerError)return e.code==='budget_exhausted'?'exhausted':(()=>{throw new OpenFigiError('budget_aborted');})();
   throw e;
  }
  requests++;
  let res:Response;
  try{res=await deps.fetch(OPENFIGI_URL,{method:'POST',headers,body,signal:budget.signal});}
  catch(e){
   if(budget.signal.aborted)throw new OpenFigiError('budget_aborted',e instanceof Error?e.name:undefined);
   failures.push({status:null,request_sha256:reqSha,response_sha256:null});return {res:null,bytes:null,sha:null};
  }
  let bytes:Uint8Array;
  try{bytes=new Uint8Array(await res.arrayBuffer());}
  catch{
   if(budget.signal.aborted)throw new OpenFigiError('budget_aborted');
   failures.push({status:res.status,request_sha256:reqSha,response_sha256:null,error:'body_read_failed'});return {res:null,bytes:null,sha:null};
  }
  const stored=await store(bytes,{role:'response',request_sha256:reqSha,http_status:res.status});
  if(!res.ok)failures.push({status:res.status,request_sha256:reqSha,response_sha256:stored.sha256});
  return {res,bytes,sha:stored.sha256};
 };
 const retryable=(r:Response|null)=>r===null||r.status===429||r.status>=500;
 /** Every caller sharing the limiter backs off, not only this one. */
 const backoff=()=>{limiter.blockedUntil=Math.max(limiter.blockedUntil,now()+BACKOFF_MS);};
 for(let start=0;start<jobs.length;start+=jobsPerRequest){
  if(budget.signal.aborted)throw new OpenFigiError('budget_aborted');
  const chunk=jobs.slice(start,start+jobsPerRequest);
  const body=JSON.stringify(chunk);
  const req=await store(new TextEncoder().encode(body),{role:'request',jobs:chunk.length});
  let out=await send(body,req.sha256);
  if(out==='exhausted')return done(true);
  if(retryable(out.res)){
   if(budget.remainingMs()-BACKOFF_MS<=reserveMs)return done(true);
   backoff();
   out=await send(body,req.sha256);
   if(out==='exhausted')return done(true);
  }
  if(retryable(out.res)){backoff();return done(true);}
  const res=out.res!;
  if(!res.ok)throw new OpenFigiError('openfigi_http',String(res.status),failures[failures.length-1]);
  let parsed:unknown;
  try{parsed=JSON.parse(new TextDecoder().decode(out.bytes!));}catch{throw new OpenFigiError('invalid_schema','response is not JSON',{status:res.status,request_sha256:req.sha256,response_sha256:out.sha});}
  if(!Array.isArray(parsed)||parsed.length!==chunk.length)throw new OpenFigiError('invalid_schema','response length',{status:res.status,request_sha256:req.sha256,response_sha256:out.sha});
  parsed.forEach((item,i)=>{results[start+i]=parseItem(chunk[i],item,{request_sha256:req.sha256,response_sha256:out.sha!,index:i});});
 }
 return done(false);
}

function keyed(keys:readonly string[],jobs:FigiJob[],out:MapResult,unsupported:string[]):MappedBy{
 const byKey=new Map<string,FigiJobResult>();const unprocessed:string[]=[];
 keys.forEach((k,i)=>{const r=out.results[i];if(r)byKey.set(k,r);else unprocessed.push(k);});
 return {byKey,exhausted:out.exhausted,unprocessed,unsupported,requests:out.requests,failures:out.failures};
}

export async function mapIsins(isins:readonly string[],deps:OpenFigiDeps):Promise<MappedBy>{
 const keys=[...new Set(isins)];
 const jobs=keys.map(idValue=>({idType:'ID_ISIN' as const,idValue}));
 return keyed(keys,jobs,await mapJobs(jobs,deps),[]);
}

/** Reverse lookup for TICKER jobs (spec §4.1.3); null = no OpenFIGI exchange code for this ticker. */
export function exchCodeFor(ticker:string):{exchCode:string;idValue:string}|null{
 const cn=/^(\d{6})\.(SH|SZ)$/.exec(ticker);
 if(cn)return {exchCode:cn[2]==='SH'?'CG':'CS',idValue:cn[1]};
 const hk=/^(\d{5})\.HK$/.exec(ticker);
 if(hk)return {exchCode:'HK',idValue:hk[1].replace(/^0+(?=\d)/,'')};
 if(/^[A-Z][A-Z0-9.]{0,7}$/.test(ticker)&&!/\.(SH|SZ|BJ|HK)$/.test(ticker))return {exchCode:'US',idValue:ticker.replace(/\./g,'/')};
 return null;
}

export async function mapTickers(tickers:readonly string[],deps:OpenFigiDeps):Promise<MappedBy>{
 const keys:string[]=[],jobs:FigiJob[]=[],unsupported:string[]=[];
 for(const t of [...new Set(tickers)]){
  const x=exchCodeFor(t);
  if(!x){unsupported.push(t);continue;}
  keys.push(t);jobs.push({idType:'TICKER',idValue:x.idValue,exchCode:x.exchCode});
 }
 return keyed(keys,jobs,await mapJobs(jobs,deps),unsupported);
}

export function securityTickerFor(exchCode:string|null|undefined,ticker:string|null|undefined):{ok:true;market:FigiMarket;ticker:string}|{ok:false;reason:string}{
 const kind=exchCode&&Object.hasOwn(EXCH_MAP,exchCode)?EXCH_MAP[exchCode]:undefined;
 if(!kind)return {ok:false,reason:`exch_unknown:${exchCode??'null'}`};
 const raw=(ticker??'').trim().toUpperCase();
 if(kind==='US'){const t=normalizeSecurityTicker(raw,'US');return t?{ok:true,market:'US',ticker:t}:{ok:false,reason:'ticker_invalid'};}
 if(kind==='HK'){const t=normalizeSecurityTicker(raw,'HK');return t?{ok:true,market:'HK',ticker:t}:{ok:false,reason:'ticker_invalid'};}
 if(!/^\d{6}$/.test(raw))return {ok:false,reason:'ticker_invalid'};
 const suffix=kind==='SH'?'SH':kind==='SZ'?'SZ':kind==='CH'?(/^[69]/.test(raw)?'SH':/^[03]/.test(raw)?'SZ':null):null;
 if(!suffix)return {ok:false,reason:`exch_unknown:CH:${raw[0]}`};
 return {ok:true,market:'CN',ticker:`${raw}.${suffix}`};
}

export interface FigiGroup{figi:string;level:'composite'|'venue';exchCodes:string[];securityType:string}
export interface FigiCandidate{market:FigiMarket;ticker:string;groups:FigiGroup[]}
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;

export function groupFigiResults(records:readonly FigiRecord[]):{candidates:FigiCandidate[];skipped:string[]}{
 const sorted=[...records].sort((a,b)=>cmp(a.compositeFIGI??a.figi,b.compositeFIGI??b.figi)||cmp(a.exchCode??'',b.exchCode??'')||cmp(a.figi,b.figi));
 const byTicker=new Map<string,{market:FigiMarket;ticker:string;groups:Map<string,FigiGroup>}>();
 const skipped:string[]=[];
 for(const r of sorted){
  if(r.marketSector!=='Equity'){skipped.push(`market_sector:${r.marketSector??'null'}`);continue;}
  if(!r.securityType||!ALLOWED_SECURITY_TYPES.has(r.securityType)){skipped.push(`security_type:${r.securityType??'null'}`);continue;}
  const composite=typeof r.compositeFIGI==='string'&&r.compositeFIGI!=='';
  const figi=composite?r.compositeFIGI!:r.figi;
  if(!FIGI.test(figi)){skipped.push('invalid_figi');continue;}
  const t=securityTickerFor(r.exchCode,r.ticker);
  if(!t.ok){skipped.push(t.reason);continue;}
  const key=`${t.market}|${t.ticker}`;
  const entry=byTicker.get(key)??{market:t.market,ticker:t.ticker,groups:new Map<string,FigiGroup>()};
  byTicker.set(key,entry);
  const gk=`${composite?'c':'v'}:${figi}`;
  const g=entry.groups.get(gk)??{figi,level:composite?'composite':'venue',exchCodes:[],securityType:r.securityType};
  if(r.exchCode&&!g.exchCodes.includes(r.exchCode))g.exchCodes.push(r.exchCode);
  entry.groups.set(gk,g);
 }
 const candidates=[...byTicker.values()]
  .sort((a,b)=>cmp(`${a.market}|${a.ticker}`,`${b.market}|${b.ticker}`))
  .map(e=>({market:e.market,ticker:e.ticker,groups:[...e.groups.values()].map(g=>({...g,exchCodes:[...g.exchCodes].sort()})).sort((a,b)=>cmp(a.figi,b.figi))}));
 return {candidates,skipped:skipped.sort()};
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
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>
exec
/bin/zsh -lc "nl -ba src/lib/entities/identifiers/openfigi.ts | sed -n '96,161p'; ls src/lib/entities/fixtures/openfigi/recorded-probe-isin.json; git ls-tree a6a9212 src/lib/entities/fixtures/openfigi/recorded-probe-isin.json; test "'! -f /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/AGENTS.md || cat /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/AGENTS.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
    96	 };
    97	 const done=(exhausted:boolean):MapResult=>({results,exhausted,requests,failures});
    98	 /** false = the budget cannot afford the wait (caller reports exhausted). Aborts become OpenFigiError('budget_aborted'). */
    99	 const waitUntilUnblocked=async():Promise<boolean>=>{
   100	  const gap=limiter.blockedUntil-now();
   101	  if(gap<=0)return true;
   102	  if(budget.remainingMs()-gap<=reserveMs)return false;
   103	  try{await wait(gap,budget.signal);}catch{throw new OpenFigiError('budget_aborted');}
   104	  return true;
   105	 };
   106	 /** The request is stored before it is sent; every received response is stored before anything else happens. */
   107	 const send=async(body:string,reqSha:string):Promise<{res:Response|null;bytes:Uint8Array|null;sha:string|null}|'exhausted'>=>{
   108	  if(!(await waitUntilUnblocked()))return 'exhausted';
   109	  try{await limiter.pacer.admit({budget,reserveMs,now,sleep:wait,minIntervalMs});}
   110	  catch(e){
   111	   if(e instanceof PacerError)return e.code==='budget_exhausted'?'exhausted':(()=>{throw new OpenFigiError('budget_aborted');})();
   112	   throw e;
   113	  }
   114	  requests++;
   115	  let res:Response;
   116	  try{res=await deps.fetch(OPENFIGI_URL,{method:'POST',headers,body,signal:budget.signal});}
   117	  catch(e){
   118	   if(budget.signal.aborted)throw new OpenFigiError('budget_aborted',e instanceof Error?e.name:undefined);
   119	   failures.push({status:null,request_sha256:reqSha,response_sha256:null});return {res:null,bytes:null,sha:null};
   120	  }
   121	  let bytes:Uint8Array;
   122	  try{bytes=new Uint8Array(await res.arrayBuffer());}
   123	  catch{
   124	   if(budget.signal.aborted)throw new OpenFigiError('budget_aborted');
   125	   failures.push({status:res.status,request_sha256:reqSha,response_sha256:null,error:'body_read_failed'});return {res:null,bytes:null,sha:null};
   126	  }
   127	  const stored=await store(bytes,{role:'response',request_sha256:reqSha,http_status:res.status});
   128	  if(!res.ok)failures.push({status:res.status,request_sha256:reqSha,response_sha256:stored.sha256});
   129	  return {res,bytes,sha:stored.sha256};
   130	 };
   131	 const retryable=(r:Response|null)=>r===null||r.status===429||r.status>=500;
   132	 /** Every caller sharing the limiter backs off, not only this one. */
   133	 const backoff=()=>{limiter.blockedUntil=Math.max(limiter.blockedUntil,now()+BACKOFF_MS);};
   134	 for(let start=0;start<jobs.length;start+=jobsPerRequest){
   135	  if(budget.signal.aborted)throw new OpenFigiError('budget_aborted');
   136	  const chunk=jobs.slice(start,start+jobsPerRequest);
   137	  const body=JSON.stringify(chunk);
   138	  const req=await store(new TextEncoder().encode(body),{role:'request',jobs:chunk.length});
   139	  let out=await send(body,req.sha256);
   140	  if(out==='exhausted')return done(true);
   141	  if(retryable(out.res)){
   142	   if(budget.remainingMs()-BACKOFF_MS<=reserveMs)return done(true);
   143	   backoff();
   144	   out=await send(body,req.sha256);
   145	   if(out==='exhausted')return done(true);
   146	  }
   147	  if(retryable(out.res)){backoff();return done(true);}
   148	  const res=out.res!;
   149	  if(!res.ok)throw new OpenFigiError('openfigi_http',String(res.status),failures[failures.length-1]);
   150	  let parsed:unknown;
   151	  try{parsed=JSON.parse(new TextDecoder().decode(out.bytes!));}catch{throw new OpenFigiError('invalid_schema','response is not JSON',{status:res.status,request_sha256:req.sha256,response_sha256:out.sha});}
   152	  if(!Array.isArray(parsed)||parsed.length!==chunk.length)throw new OpenFigiError('invalid_schema','response length',{status:res.status,request_sha256:req.sha256,response_sha256:out.sha});
   153	  parsed.forEach((item,i)=>{results[start+i]=parseItem(chunk[i],item,{request_sha256:req.sha256,response_sha256:out.sha!,index:i});});
   154	 }
   155	 return done(false);
   156	}
   157	
   158	function keyed(keys:readonly string[],jobs:FigiJob[],out:MapResult,unsupported:string[]):MappedBy{
   159	 const byKey=new Map<string,FigiJobResult>();const unprocessed:string[]=[];
   160	 keys.forEach((k,i)=>{const r=out.results[i];if(r)byKey.set(k,r);else unprocessed.push(k);});
   161	 return {byKey,exhausted:out.exhausted,unprocessed,unsupported,requests:out.requests,failures:out.failures};
src/lib/entities/fixtures/openfigi/recorded-probe-isin.json
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-YPFqli1z' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-nQa0XRNT' (errno=Operation not permitted)
100644 blob 3c87a76780b01c8a53803a9c80b7e3711ba9373c	src/lib/entities/fixtures/openfigi/recorded-probe-isin.json

codex
The shared back-off implementation allows queued requests and callers following a budget-exhausted request to bypass the cooldown. Both paths undermine the new cross-caller throttling behavior.

Full review comments:

- [P2] Recheck the shared back-off before dispatch — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/entities/identifiers/openfigi.ts:108-109
  With concurrent callers, a request can pass `waitUntilUnblocked()` and then wait inside `pacer.admit()` while another request receives a 429 and extends `blockedUntil`. The queued request still dispatches after the normal 300/3000 ms interval, ignoring the new 60-second back-off. Likewise, the horizon can be extended during the back-off sleep itself. Revalidate the horizon before dispatch and repeat admission as necessary while preserving request spacing.

- [P2] Publish back-off even when the current budget is exhausted — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/entities/identifiers/openfigi.ts:141-143
  When the first attempt receives a 429 but the caller cannot afford the back-off, this early return skips `backoff()`. A subsequent caller sharing the quota identity therefore sends after ordinary pacing instead of honoring the upstream cooldown. Set the shared horizon before checking whether this caller has enough budget to retry; recording the cooldown should not depend on its remaining budget.
The shared back-off implementation allows queued requests and callers following a budget-exhausted request to bypass the cooldown. Both paths undermine the new cross-caller throttling behavior.

Full review comments:

- [P2] Recheck the shared back-off before dispatch — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/entities/identifiers/openfigi.ts:108-109
  With concurrent callers, a request can pass `waitUntilUnblocked()` and then wait inside `pacer.admit()` while another request receives a 429 and extends `blockedUntil`. The queued request still dispatches after the normal 300/3000 ms interval, ignoring the new 60-second back-off. Likewise, the horizon can be extended during the back-off sleep itself. Revalidate the horizon before dispatch and repeat admission as necessary while preserving request spacing.

- [P2] Publish back-off even when the current budget is exhausted — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/entities/identifiers/openfigi.ts:141-143
  When the first attempt receives a 429 but the caller cannot afford the back-off, this early return skips `backoff()`. A subsequent caller sharing the quota identity therefore sends after ordinary pacing instead of honoring the upstream cooldown. Set the shared horizon before checking whether this caller has enough budget to retry; recording the cooldown should not depend on its remaining budget.

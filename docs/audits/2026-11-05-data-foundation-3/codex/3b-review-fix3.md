OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1aff1-a225-75e2-a5cb-2135341ab596
--------
user
commit 39d7e3f
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 39d7e3f; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 253ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-xc5pwD5E' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-WhFVlaS2' (errno=Operation not permitted)
 M docs/audits/2026-11-05-data-foundation-3/implementation-log.md
?? docs/audits/2026-11-05-data-foundation-3/codex/3a-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/3a-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/3a-review-fix2.md
?? docs/audits/2026-11-05-data-foundation-3/codex/3a-review.md
?? docs/audits/2026-11-05-data-foundation-3/codex/3b-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/3b-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/3b-review-fix2.md
?? docs/audits/2026-11-05-data-foundation-3/codex/3b-review-fix3.md
?? docs/audits/2026-11-05-data-foundation-3/codex/3b-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-MtUgqXSI' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-cxywjfIC' (errno=Operation not permitted)
39d7e3f fix(entities): OpenFIGI recheck back-off horizon before dispatch and publish it before the budget decision
 src/lib/entities/identifiers/openfigi.test.ts | 28 +++++++++++++++++++++++++++
 src/lib/entities/identifiers/openfigi.ts      | 16 +++++++++------
 2 files changed, 38 insertions(+), 6 deletions(-)

exec
/bin/zsh -lc 'pwd; for p in /AGENTS.md /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do if [ -f "$p" ]; then echo "$p"; cat "$p"; fi; done; git show 39d7e3f --; cat src/lib/entities/identifiers/openfigi.ts; ls -a | head -35' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-Wt11ysYv' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-Q8NvP4F1' (errno=Operation not permitted)
commit 39d7e3fc808fda8c289ede875856be52a5c61958
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 00:19:58 2026 -0800

    fix(entities): OpenFIGI recheck back-off horizon before dispatch and publish it before the budget decision
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/entities/identifiers/openfigi.test.ts b/src/lib/entities/identifiers/openfigi.test.ts
index c7a342b..48d851b 100644
--- a/src/lib/entities/identifiers/openfigi.test.ts
+++ b/src/lib/entities/identifiers/openfigi.test.ts
@@ -225,6 +225,34 @@ describe('round 2: body read, budget, shared back-off, schema',()=>{
  });
 });
 
+describe('round 3: back-off horizon races',()=>{
+ const flush=()=>new Promise<void>(r=>setTimeout(r,0));
+ it('does not dispatch a caller queued in admit before a horizon published meanwhile',async()=>{
+  let t=0;const gates:{ms:number;release:()=>void}[]=[];const fetchTimes:number[]=[];
+  const sleep=(ms:number)=>ms===3000||ms===BACKOFF_MS?new Promise<void>(r=>gates.push({ms,release:()=>{t+=ms;r();}})):(t+=ms,Promise.resolve());
+  let release429!:()=>void;let n=0;
+  const fetch=(async()=>{fetchTimes.push(t);n++;if(n===1)await new Promise<void>(r=>{release429=r;});return n===1?new Response('{}',{status:429}):new Response(JSON.stringify([{data:TENCENT}]),{status:200});}) as typeof globalThis.fetch;
+  const deps={fetch,raw:memoryRawStore(),limiter:createFigiLimiter(),now:()=>t,sleep};
+  const a=mapIsins(['A'],deps);await flush();
+  const b=mapIsins(['B'],deps);await flush();
+  expect(gates.map(g=>g.ms)).toEqual([3000]);                 // B is parked in admit behind the spacing wait
+  release429();await flush();                                  // A gets its 429: horizon = 60000
+  gates.find(g=>g.ms===3000)!.release();await flush();         // B's spacing wait ends at t=3000
+  expect(fetchTimes.slice(1).every(x=>x>=BACKOFF_MS)).toBe(true);  // B never dispatched inside the horizon
+  gates.find(g=>g.ms===BACKOFF_MS)?.release();
+  await Promise.all([a,b]);
+  expect(fetchTimes[1]).toBeGreaterThanOrEqual(BACKOFF_MS);
+  expect(fetchTimes[2]).toBeGreaterThanOrEqual(BACKOFF_MS);
+ });
+ it('publishes the horizon even when the failing caller cannot afford the retry',async()=>{
+  const h=harness([status(429),ok([{data:TENCENT}])]);
+  const a=await mapJobs([{idType:'ID_ISIN',idValue:'A'}],{...h.deps,budget:{remainingMs:()=>BACKOFF_MS+500,signal:new AbortController().signal},reserveMs:1000});
+  expect(a.exhausted).toBe(true);expect(h.sleeps).toEqual([]);
+  const b=await mapJobs([{idType:'ID_ISIN',idValue:'B'}],h.deps);
+  expect(b.exhausted).toBe(false);expect(h.sleeps).toContain(BACKOFF_MS);expect(h.deps.now()).toBeGreaterThanOrEqual(BACKOFF_MS);
+ });
+});
+
 const RECORDED=new URL('../fixtures/openfigi/recorded-probe-isin.json',import.meta.url);
 describe('recorded probe (Task 3b Step 8)',()=>{
  it('maps AAPL, 600519 and 0700 to exactly one group per ticker (Tencent ISIN also lists 80700.HK and the OTC line TCTZF)',()=>{
diff --git a/src/lib/entities/identifiers/openfigi.ts b/src/lib/entities/identifiers/openfigi.ts
index b90786f..0f55866 100644
--- a/src/lib/entities/identifiers/openfigi.ts
+++ b/src/lib/entities/identifiers/openfigi.ts
@@ -105,11 +105,15 @@ export async function mapJobs(jobs:readonly FigiJob[],deps:OpenFigiDeps):Promise
  };
  /** The request is stored before it is sent; every received response is stored before anything else happens. */
  const send=async(body:string,reqSha:string):Promise<{res:Response|null;bytes:Uint8Array|null;sha:string|null}|'exhausted'>=>{
-  if(!(await waitUntilUnblocked()))return 'exhausted';
-  try{await limiter.pacer.admit({budget,reserveMs,now,sleep:wait,minIntervalMs});}
-  catch(e){
-   if(e instanceof PacerError)return e.code==='budget_exhausted'?'exhausted':(()=>{throw new OpenFigiError('budget_aborted');})();
-   throw e;
+  // The horizon can move while this caller waits in the queue: recheck right before dispatch, then re-admit (keeps spacing).
+  for(;;){
+   if(!(await waitUntilUnblocked()))return 'exhausted';
+   try{await limiter.pacer.admit({budget,reserveMs,now,sleep:wait,minIntervalMs});}
+   catch(e){
+    if(e instanceof PacerError)return e.code==='budget_exhausted'?'exhausted':(()=>{throw new OpenFigiError('budget_aborted');})();
+    throw e;
+   }
+   if(limiter.blockedUntil-now()<=0)break;
   }
   requests++;
   let res:Response;
@@ -139,8 +143,8 @@ export async function mapJobs(jobs:readonly FigiJob[],deps:OpenFigiDeps):Promise
   let out=await send(body,req.sha256);
   if(out==='exhausted')return done(true);
   if(retryable(out.res)){
+   backoff();   // published first: other callers back off even when this caller cannot afford the retry
    if(budget.remainingMs()-BACKOFF_MS<=reserveMs)return done(true);
-   backoff();
    out=await send(body,req.sha256);
    if(out==='exhausted')return done(true);
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
  // The horizon can move while this caller waits in the queue: recheck right before dispatch, then re-admit (keeps spacing).
  for(;;){
   if(!(await waitUntilUnblocked()))return 'exhausted';
   try{await limiter.pacer.admit({budget,reserveMs,now,sleep:wait,minIntervalMs});}
   catch(e){
    if(e instanceof PacerError)return e.code==='budget_exhausted'?'exhausted':(()=>{throw new OpenFigiError('budget_aborted');})();
    throw e;
   }
   if(limiter.blockedUntil-now()<=0)break;
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
   backoff();   // published first: other callers back off even when this caller cannot afford the retry
   if(budget.remainingMs()-BACKOFF_MS<=reserveMs)return done(true);
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

exec
/bin/zsh -lc "find src .claude -name 'AGENTS*'; for d in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees; do for n in AGENTS.override.md AGENTS.md; do test "'! -f "$d/$n" || cat "$d/$n"; done; done; cat src/lib/facts/providers/shared.ts; cat package.json | head -65; sed -n '"'1,60p' src/lib/entities/identifiers/openfigi.test.ts" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>// src/lib/facts/providers/shared.ts
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
// src/lib/entities/identifiers/openfigi.test.ts
import {existsSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {memoryRawStore} from '../../dq/raw-store';
import {
 ALLOWED_SECURITY_TYPES,BACKOFF_MS,EXCH_MAP,EXCH_MAP_VERSION,OPENFIGI_URL,OpenFigiError,
 createFigiLimiter,exchCodeFor,groupFigiResults,mapIsins,mapJobs,mapTickers,openFigiLimits,securityTickerFor,type FigiRecord,
} from './openfigi';

const eq=(o:Partial<FigiRecord>):FigiRecord=>({figi:'BBG000B9XRY4',compositeFIGI:'BBG000B9XRY4',ticker:'AAPL',exchCode:'US',securityType:'Common Stock',marketSector:'Equity',...o});
// Trimmed ID_ISIN result shapes (spec §9.1): AAPL composite + US venues + a German line; Moutai CG/CH; Tencent HK.
const AAPL:FigiRecord[]=[eq({}),eq({figi:'BBG000B9XVV8',exchCode:'UW'}),eq({figi:'BBG000B9Y5X2',exchCode:'UN'}),eq({figi:'BBG000BG9JS1',compositeFIGI:'BBG000BG9DH4',exchCode:'GR'})];
const MOUTAI:FigiRecord[]=[eq({figi:'BBG000MOUTA1',compositeFIGI:'BBG000MOUTA1',ticker:'600519',exchCode:'CH'}),eq({figi:'BBG000MOUTA2',compositeFIGI:'BBG000MOUTA1',ticker:'600519',exchCode:'CG'})];
const TENCENT:FigiRecord[]=[eq({figi:'BBG000TENCT1',compositeFIGI:'BBG000TENCT1',ticker:'700',exchCode:'HK'})];
const BOND:FigiRecord[]=[eq({figi:'BBG00BOND001',compositeFIGI:null,ticker:'AAPL 2.4 05/03/23',exchCode:null,securityType:'GLOBAL',marketSector:'Corp'})];
const VENUES:FigiRecord[]=[eq({figi:'BBG000VENUE1',compositeFIGI:null,ticker:'ZZX'}),eq({figi:'BBG000VENUE2',compositeFIGI:null,ticker:'ZZX'})];

type Reply=()=>Response;
const ok=(body:unknown):Reply=>()=>new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});
const status=(s:number):Reply=>()=>new Response('{}',{status:s});
const boom:Reply=()=>{throw new TypeError('fetch failed');};
function harness(replies:Reply[]){
 const calls:{url:string;init:RequestInit}[]=[];const sleeps:number[]=[];let t=0;
 const fetch=(async(url:string|URL|Request,init?:RequestInit)=>{calls.push({url:String(url),init:init??{}});const r=replies.shift();if(!r)throw new Error('unexpected fetch');return r();}) as typeof globalThis.fetch;
 const raw=memoryRawStore();
 return {calls,sleeps,raw,deps:{fetch,raw,limiter:createFigiLimiter(),now:()=>t,sleep:async(ms:number)=>{sleeps.push(ms);t+=ms;}}};
}
const isinItems=(n:number)=>Array.from({length:n},()=>({data:AAPL}));

describe('limits and EXCH_MAP',()=>{
 it('throttles to 80% of the documented limits',()=>{
  expect(openFigiLimits(null)).toEqual({jobsPerRequest:10,minIntervalMs:3000});
  expect(openFigiLimits('k')).toEqual({jobsPerRequest:100,minIntervalMs:300});
  expect(EXCH_MAP_VERSION).toBe('exch-map/1');
  expect(Object.keys(EXCH_MAP).sort()).toEqual(['CG','CH','CS','HK','UA','UN','UP','UQ','UR','US','UW']);
  expect([...ALLOWED_SECURITY_TYPES].sort()).toEqual(['ADR','Common Stock','GDR']);
 });
 it('maps exchange codes to security tickers and back',()=>{
  expect(securityTickerFor('UW','AAPL')).toEqual({ok:true,market:'US',ticker:'AAPL'});
  expect(securityTickerFor('US','BRK/B')).toEqual({ok:true,market:'US',ticker:'BRK.B'});
  expect(securityTickerFor('CG','600519')).toEqual({ok:true,market:'CN',ticker:'600519.SH'});
  expect(securityTickerFor('CS','000001')).toEqual({ok:true,market:'CN',ticker:'000001.SZ'});
  expect(securityTickerFor('CH','600519')).toEqual({ok:true,market:'CN',ticker:'600519.SH'});
  expect(securityTickerFor('CH','300750')).toEqual({ok:true,market:'CN',ticker:'300750.SZ'});
  expect(securityTickerFor('CH','430047')).toEqual({ok:false,reason:'exch_unknown:CH:4'});
  expect(securityTickerFor('HK','700')).toEqual({ok:true,market:'HK',ticker:'00700.HK'});
  expect(securityTickerFor('GR','AAPL')).toEqual({ok:false,reason:'exch_unknown:GR'});
  expect(securityTickerFor(null,'AAPL')).toEqual({ok:false,reason:'exch_unknown:null'});
  expect(exchCodeFor('AAPL')).toEqual({exchCode:'US',idValue:'AAPL'});
  expect(exchCodeFor('BRK.B')).toEqual({exchCode:'US',idValue:'BRK/B'});
  expect(exchCodeFor('600519.SH')).toEqual({exchCode:'CG',idValue:'600519'});
  expect(exchCodeFor('000001.SZ')).toEqual({exchCode:'CS',idValue:'000001'});
  expect(exchCodeFor('00700.HK')).toEqual({exchCode:'HK',idValue:'700'});
  expect(exchCodeFor('430047.BJ')).toBeNull();
 });
});

describe('groupFigiResults',()=>{
 it('groups by compositeFIGI, drops unknown venues and non-equity lines',()=>{

exec
/bin/zsh -lc './node_modules/.bin/vitest run src/lib/entities/identifiers/openfigi.test.ts --configLoader runner' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 303ms:
failed to load config from /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/vitest.config.ts

⎯⎯⎯⎯⎯⎯⎯ Startup Error ⎯⎯⎯⎯⎯⎯⎯⎯
ReferenceError: __dirname is not defined
    at eval (/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/vitest.config.ts:10:65)
    at async ESModulesEvaluator.runInlinedModule (file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/node_modules/vite/dist/node/module-runner.js:809:3)
    at async ModuleRunner.directRequest (file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/node_modules/vite/dist/node/module-runner.js:1270:59)
    at async ModuleRunner.cachedRequest (file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/node_modules/vite/dist/node/module-runner.js:1177:73)
    at async ModuleRunner.import (file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/node_modules/vite/dist/node/module-runner.js:1132:10)
    at async runnerImport (file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/node_modules/vite/dist/node/chunks/node.js:36558:18)
    at async runnerImportConfigFile (file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/node_modules/vite/dist/node/chunks/node.js:37336:35)
    at async loadConfigFromFile (file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/node_modules/vite/dist/node/chunks/node.js:37305:42)
    at async resolveConfig (file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/node_modules/vite/dist/node/chunks/node.js:36906:22)
    at async _createServer (file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/node_modules/vite/dist/node/chunks/node.js:24268:65)




codex
The changes correctly recheck shared back-off before dispatch and publish the horizon before rejecting an unaffordable retry. No actionable regressions were identified. Test execution was blocked by a Vitest configuration-loading error.
The changes correctly recheck shared back-off before dispatch and publish the horizon before rejecting an unaffordable retry. No actionable regressions were identified. Test execution was blocked by a Vitest configuration-loading error.

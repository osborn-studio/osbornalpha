OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b394-2695-76a3-81f9-4a8b5e24e562
--------
user
commit 86394d3
2026-11-07T01:16:35.265115Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when AuthRequired(AuthRequiredError { www_authenticate_header: "Bearer realm=\"OAuth\", resource_metadata=\"https://mcp.notion.com/.well-known/oauth-protected-resource/mcp\", scope=\"default\"" })
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 86394d3; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 3006ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-mNO2OED0' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-wJ6xd3v8' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/18a-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/18a-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/18a-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-4QmyyTpJ' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-iZ7MnGfp' (errno=Operation not permitted)
86394d3c fix(dq): calendar-sync review fixes (batch finished on abort, fenced profile write, per-page evidence, raw_upload_failed, real fiscal_year_end days)
 src/lib/dq/calendar-sync.test.ts                   | 108 ++++++++++++++++++++-
 src/lib/dq/calendar-sync.ts                        |  80 +++++++++++----
 src/lib/dq/filer-categories.test.ts                |  11 ++-
 src/lib/dq/filer-categories.ts                     |  15 ++-
 src/lib/entities/identifiers.integration.test.ts   |  32 +++++-
 supabase/migrations.lock.json                      |   2 +-
 .../20261107090000_identifiers_and_dq.sql          |  30 ++++--
 7 files changed, 240 insertions(+), 38 deletions(-)

exec
/bin/zsh -lc 'pwd; ls -a | head -30; for p in /AGENTS.md /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do if test -f "$p"; then echo "$p"; cat "$p"; fi; done; git show 86394d3 -- src/lib/dq/calendar-sync.ts src/lib/dq/filer-categories.ts supabase/migrations/20261107090000_identifiers_and_dq.sql' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
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
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-qausdHlt' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-EiHir1AI' (errno=Operation not permitted)
commit 86394d3c1fdd7c5650131e2cc52a9295ce65c320
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 17:16:16 2026 -0800

    fix(dq): calendar-sync review fixes (batch finished on abort, fenced profile write, per-page evidence, raw_upload_failed, real fiscal_year_end days)
    
    replace_filing_expectations gains p_profile jsonb default null (5-arg; 4-arg dropped) so the issuer profile is written under the pass fence.
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/dq/calendar-sync.ts b/src/lib/dq/calendar-sync.ts
index d7fee329..52ad882d 100644
--- a/src/lib/dq/calendar-sync.ts
+++ b/src/lib/dq/calendar-sync.ts
@@ -4,8 +4,9 @@
 // market's pass (claim_calendar_pass: a new pass freezes its members; an expired lease is taken over;
 // a lease held by another worker → this run does nothing, skipped_summary(pass_claimed)). Within the
 // budget it processes pending members, then failed members with attempts < 3, in issuer_id order:
-// profile write (issuer_filing_profiles), inputs (profile + issuer_filer_categories + filingsForCalendar
-// + upstream list) → computeExpectations → replace_filing_expectations (atomic replace + member done).
+// inputs (profile + issuer_filer_categories + filingsForCalendar + upstream list) → computeExpectations →
+// replace_filing_expectations (atomic: rows replaced + the issuer profile upserted under the same fence + member done;
+// a stale worker therefore writes neither rows nor profile).
 // A member whose inputs fail → fail_calendar_member. Any fence_failed stops this worker at once.
 // With nothing left to process the pass is settled by finish_calendar_pass (from persisted state only)
 // and freshness is recorded: complete → ok, complete_with_failures or a pass older than 2 days → not ok.
@@ -23,6 +24,7 @@ import {emptyCounts,finishBatch,startBatch} from './batches';
 import type {BatchCounts,BatchError,BatchStatus,TriggeredBy} from './batches';
 import {recordAttempt} from './freshness';
 import {DATASETS} from './datasets';
+import {RawStoreError} from './raw-store';
 import type {RawStore} from './raw-store';
 import {CALENDAR_RULES_VERSION,computeExpectations,filingsWindowStart} from './calendar';
 import type {CalendarUpstream,CnScheduleRow,ExpectationRow,FilerCategoryRow,FilingProfile,UsUpstreamEntry} from './calendar';
@@ -47,18 +49,21 @@ export function toCalendarPassError(e:{message?:string}):CalendarPassError{
 }
 export interface CalendarPassDb{
  claimPass(market:Market,batchId:string):Promise<CalendarPassToken|null>;
- replaceExpectations(issuer:string,market:Market,rows:ExpectationRow[],token:CalendarPassToken):Promise<number>;
+ /** `profile` is upserted in the same fenced transaction (replace_filing_expectations.p_profile); null leaves the stored profile untouched. */
+ replaceExpectations(issuer:string,market:Market,rows:ExpectationRow[],token:CalendarPassToken,profile:FilingProfile|null):Promise<number>;
  failMember(token:CalendarPassToken,issuer:string,error:string):Promise<void>;
  finishPass(token:CalendarPassToken):Promise<'complete'|'complete_with_failures'>;
 }
 /** p_rows payload: every dq_filing_expectations column except issuer_id/market (the function's own args) and computed_at/batch_id (set by the function from now() and the token). */
 export const expectationArgs=(rows:ExpectationRow[])=>rows.map(({issuer_id:_i,market:_m,...r})=>r);
+/** p_profile payload: the issuer_filing_profiles columns except issuer_id/market (the function's own args). */
+export const profileArgs=(p:FilingProfile|null)=>p?(({issuer_id:_i,market:_m,...r})=>r)(p):null;
 export function supabaseCalendarPassDb(client:SupabaseClient):CalendarPassDb{
  const c=client as unknown as {rpc:(fn:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{message?:string}|null}>};
  const call=async<T>(fn:string,args:Record<string,unknown>):Promise<T>=>{const {data,error}=await c.rpc(fn,args);if(error)throw toCalendarPassError(error);return data as T;};
  return {
   claimPass:(market,batch)=>call<CalendarPassToken|null>('claim_calendar_pass',{p_market:market,p_batch:batch}),
-  replaceExpectations:(issuer,market,rows,token)=>call<number>('replace_filing_expectations',{p_issuer:issuer,p_market:market,p_rows:expectationArgs(rows),p_pass_token:token}).then(Number),
+  replaceExpectations:(issuer,market,rows,token,profile)=>call<number>('replace_filing_expectations',{p_issuer:issuer,p_market:market,p_rows:expectationArgs(rows),p_pass_token:token,p_profile:profileArgs(profile)}).then(Number),
   failMember:async(token,issuer,error)=>{await call('fail_calendar_member',{p_pass_token:token,p_issuer:issuer,p_error:error.slice(0,500)});},
   finishPass:(token)=>call<'complete'|'complete_with_failures'>('finish_calendar_pass',{p_pass_token:token}),
  };
@@ -82,11 +87,17 @@ const ymd=(s:unknown)=>typeof s==='string'&&/^\d{8}$/.test(s)?`${s.slice(0,4)}-$
 const bump=(m:Record<string,number>,k:string)=>{m[k]=(m[k]??0)+1;};
 const errText=(e:unknown)=>(e instanceof Error?e.message:String(e)).slice(0,200);
 
+/** MMDD against a leap-year calendar (0229 allowed; 0231 / 0431 are not days). */
+const validMmdd=(s:string|null):s is string=>{
+ if(s===null||!/^\d{4}$/.test(s))return false;
+ const m=+s.slice(0,2),d=+s.slice(2);
+ return m>=1&&m<=12&&d>=1&&d<=new Date(Date.UTC(2000,m,0)).getUTCDate();   // 2000 is a leap year
+};
 /** Profile from SEC submissions: regime = latest original annual form; week52 when the fiscal year end is not a month end or a recent annual period end is not one. */
 export function profileFromSubmissions(issuerId:string,v:SubmissionsView,today:string):FilingProfile|null{
  const annual=v.entries.filter(e=>e.form==='10-K'||e.form==='20-F'||e.form==='40-F').sort((a,b)=>b.filingDate.localeCompare(a.filingDate));
  if(annual.length===0)return null;
- const fye=v.fiscalYearEnd!==null&&/^(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])$/.test(v.fiscalYearEnd)?v.fiscalYearEnd:null;
+ const fye=validMmdd(v.fiscalYearEnd)?v.fiscalYearEnd:null;
  const lastDay=(mm:number)=>new Date(Date.UTC(2001,mm,0)).getUTCDate();   // 2001: Feb 28 (29 checked below)
  const fyeIsMonthEnd=fye===null||+fye.slice(2)===lastDay(+fye.slice(0,2))||fye==='0229';
  const reportEndsOff=annual.slice(0,3).some(e=>{if(!e.reportDate)return false;const d=new Date(`${e.reportDate}T00:00:00Z`);return new Date(d.getTime()+86_400_000).getUTCDate()!==1;});
@@ -124,7 +135,7 @@ export function applyUpstreamCoverage(rows:ExpectationRow[],entries:readonly UsU
  });
 }
 
-interface MemberResult{rows:ExpectationRow[];upstreamUnavailable:boolean;noProfile:boolean;noFye:boolean;noCategory:boolean;errors:BatchError[];scheduleReason?:string}
+interface MemberResult{profile:FilingProfile|null;rows:ExpectationRow[];upstreamUnavailable:boolean;noProfile:boolean;noFye:boolean;noCategory:boolean;errors:BatchError[];scheduleReason?:string}
 async function display(tables:TableClient,issuerId:string,scope:Row|undefined,market:Market,today:string):Promise<{ticker:string|null;name:string|null}>{
  const [issuer]=await tables.select('issuers',{issuer_id:issuerId},{limit:1});
  let ticker:string|null=market==='CN'?(scope?.fetch_key==null?null:String(scope.fetch_key)):null;
@@ -133,52 +144,79 @@ async function display(tables:TableClient,issuerId:string,scope:Row|undefined,ma
  return {ticker,name};
 }
 
-async function computeMember(deps:CalendarSyncDeps,market:Market,issuerId:string,today:string,nowIso:string,write=true):Promise<MemberResult>{
+async function computeMember(deps:CalendarSyncDeps,market:Market,issuerId:string,today:string):Promise<MemberResult>{
  const [scope]=await deps.tables.select('fact_sync_scope',{issuer_id:issuerId,market},{limit:1});
  const fetchKey=scope?.fetch_key==null?'':String(scope.fetch_key);
  const errors:BatchError[]=[];
  let profile:FilingProfile|null=null;let upstream:CalendarUpstream;let scheduleReason:string|undefined;
+ let fresh:FilingProfile|null=null;   // written with the fenced replace call only when computed from a live fetch (stored profile reuse → null)
+ let view:SubmissionsView|null=null;
  if(market==='US'){
-  let view:SubmissionsView|null=null;
   try{if(!/^\d{10}$/.test(fetchKey))throw new Error('no_cik');view=await deps.submissions(fetchKey,deps.budget);}
   catch(e){errors.push({code:'sec_unavailable',key:issuerId,message:errText(e)});}
   if(view){
    profile=profileFromSubmissions(issuerId,view,today);
-   if(profile&&write)await deps.tables.upsert('issuer_filing_profiles',{...profile,updated_at:nowIso},'issuer_id,market');
+   fresh=profile;
    upstream={lookup:'ok',us:view.entries.map(e=>({form:e.form,reportDate:e.reportDate,filingDate:e.filingDate,accessionNumber:e.accessionNumber})),sha256:view.sha256};
   }else upstream={lookup:'unavailable'};
   if(!profile){const [stored]=await deps.tables.select('issuer_filing_profiles',{issuer_id:issuerId,market},{limit:1});if(stored)profile=profileFromRow(stored);}
  }else{
-  profile=cnProfile(issuerId,today);
-  if(write)await deps.tables.upsert('issuer_filing_profiles',{...profile,updated_at:nowIso},'issuer_id,market');
+  profile=fresh=cnProfile(issuerId,today);
   upstream={lookup:'unavailable'};
   try{
    if(!/^\d{6}\.(SH|SZ|BJ)$/.test(fetchKey))throw new Error('no_ts_code');
    const raw=await deps.disclosureDate(fetchKey,deps.budget);
    if(raw.code!==0)scheduleReason=`api_code_${raw.code}`;
    else{
-    const stored=await deps.raw.put({kind:'tushare-disclosure',bytes:raw.bytes,contentType:'application/json',meta:{api:'disclosure_date',ts_code:fetchKey}},deps.budget);
+    // a storage failure is a real error (member failed, retryable), not an informational upstream gap
+    const stored=await deps.raw.put({kind:'tushare-disclosure',bytes:raw.bytes,contentType:'application/json',meta:{api:'disclosure_date',ts_code:fetchKey}},deps.budget).catch((e:unknown)=>{throw e instanceof RawStoreError?e:new RawStoreError('raw_upload_failed',errText(e));});
     if(CN_DISCLOSURE_VERIFIED)upstream={lookup:'ok',cn:parseDisclosureDate(raw),sha256:stored.sha256};
     else{upstream={lookup:'unavailable',sha256:stored.sha256};scheduleReason='unverified';}
    }
-  }catch(e){scheduleReason=e instanceof TushareError&&e.code===-1?'no_token':e instanceof Error&&(e.message==='no_ts_code')?'no_ts_code':'error';}
+  }catch(e){if(e instanceof RawStoreError)throw e;scheduleReason=e instanceof TushareError&&e.code===-1?'no_token':e instanceof Error&&(e.message==='no_ts_code')?'no_ts_code':'error';}
  }
- if(!profile)return {rows:[],upstreamUnavailable:upstream.lookup==='unavailable',noProfile:true,noFye:false,noCategory:false,errors,scheduleReason};
+ if(!profile)return {profile:null,rows:[],upstreamUnavailable:upstream.lookup==='unavailable',noProfile:true,noFye:false,noCategory:false,errors,scheduleReason};
  const categories=market==='US'?(await selectAll(deps.tables,'issuer_filer_categories',{issuer_id:issuerId},'fiscal_year')).map(categoryFromRow):[];
  const filings=await deps.db.filingsForCalendar(issuerId,market,{fromPeriodEnd:filingsWindowStart(today)});
  let rows=computeExpectations({profile,categories,filings,upstream,today});
  // US: coverage is per expected period (plan audit Q1); positive evidence is never discarded.
  if(upstream.lookup==='ok'&&market==='US')rows=applyUpstreamCoverage(rows,upstream.us??[]);
  const shown=await display(deps.tables,issuerId,scope,market,today);
- rows=rows.map(r=>({...r,detail:{...r.detail,display:shown,...(upstream.sha256?{upstream_sha256:upstream.sha256}:{}),...(scheduleReason?{schedule_unavailable:scheduleReason}:{})}}));
- return {rows,upstreamUnavailable:rows.some(r=>r.upstream_lookup==='unavailable'),noProfile:false,noFye:profile.fiscal_year_end===null,noCategory:rows.some(r=>r.detail.no_category===true),errors,scheduleReason};
+ // US: a positive-evidence row cites the submissions page that holds its entry (historical pages have their own bytes); the manifest lists every page used
+ const pageOf=new Map((view?.entries??[]).map(e=>[e.accessionNumber,e]));
+ const manifest=view?(view.pages??[{name:'recent',sha256:view.sha256}]):null;
+ rows=rows.map(r=>{
+  const hit=typeof r.detail.upstream_accession==='string'?pageOf.get(r.detail.upstream_accession):undefined;
+  const cite=hit&&hit.pageSha256?{upstream_sha256:hit.pageSha256,upstream_page:hit.page}:upstream.sha256?{upstream_sha256:upstream.sha256,...(manifest?{upstream_page:manifest[0]?.name??'recent'}:{})}:{};
+  return {...r,detail:{...r.detail,display:shown,...cite,...(manifest?{upstream_pages:manifest}:{}),...(scheduleReason?{schedule_unavailable:scheduleReason}:{})}};
+ });
+ return {profile:fresh,rows,upstreamUnavailable:rows.some(r=>r.upstream_lookup==='unavailable'),noProfile:false,noFye:profile.fiscal_year_end===null,noCategory:rows.some(r=>r.detail.no_category===true),errors,scheduleReason};
 }
 
+/**
+ * Any throw after startBatch (claim RPC, member-list read, failMember/finishPass storage errors, freshness
+ * write) must not leave the batch 'running': the error is recorded as run_aborted, the batch is finished
+ * (best effort: the storage that failed may be the batch table itself) and the error rethrown. The pass is
+ * never finished on an infrastructure error — it stays leased/resumable and the next run takes it over.
+ */
 export async function runCalendarSync(deps:CalendarSyncDeps,opts:CalendarSyncOptions):Promise<CalendarReceipt>{
+ const aborted:{counts:BatchCounts;errors:BatchError[];batchId:string|null}={counts:emptyCounts(),errors:[],batchId:null};
+ try{return await runCalendarSyncInner(deps,opts,aborted);}
+ catch(e){
+  if(aborted.batchId){
+   aborted.errors.push({code:'run_aborted',message:errText(e)});
+   try{await finishBatch(deps.tables,aborted.batchId,{counts:aborted.counts,errors:aborted.errors},deps.now());}catch{/* batch already finished or storage down: the original error wins */}
+  }
+  throw e;
+ }
+}
+async function runCalendarSyncInner(deps:CalendarSyncDeps,opts:CalendarSyncOptions,shared:{counts:BatchCounts;errors:BatchError[];batchId:string|null}):Promise<CalendarReceipt>{
  const {market}=opts;
- const counts=emptyCounts();const errors:BatchError[]=[];const schedule:Record<string,number>={};
+
+ const {counts,errors}=shared;const schedule:Record<string,number>={};
  const detail:CalendarDetail={pass_id:null,issuers_done:0,issuers_failed:0,rows:0,by_deadline_state:{},by_disclosure_state:{},upstream_unavailable:0,no_fiscal_year_end:0,no_category:0,no_profile:0};
  const {batchId}=await startBatch(deps.tables,{producer:'filing-calendar',dataset:DATASETS.calendar(market),toolVersions:{rules:CALENDAR_RULES_VERSION,market},codeVersion:deps.codeVersion??undefined,triggeredBy:opts.triggeredBy});
+ shared.batchId=batchId;
  const finish=async(passId:string|null,passStatus:CalendarReceipt['passStatus']):Promise<CalendarReceipt>=>{
   if(Object.keys(schedule).length)errors.push({code:'skipped_summary',key:'schedule_unavailable',message:JSON.stringify(schedule)});
   const status=await finishBatch(deps.tables,batchId,{counts,errors},deps.now());
@@ -195,14 +233,14 @@ export async function runCalendarSync(deps:CalendarSyncDeps,opts:CalendarSyncOpt
   if(deps.budget.remainingMs()<MIN_MEMBER_MS){errors.push({code:'deadline_hit',message:JSON.stringify({not_started:todo.length-i})});break;}
   counts.fetched++;
   let result:MemberResult;
-  try{result=await computeMember(deps,market,issuer,today,now.toISOString());}
+  try{result=await computeMember(deps,market,issuer,today);}
   catch(e){
-   counts.failed++;detail.issuers_failed++;errors.push({code:'member_failed',key:issuer,message:errText(e)});
+   counts.failed++;detail.issuers_failed++;errors.push({code:e instanceof RawStoreError?'raw_upload_failed':'member_failed',key:issuer,message:errText(e)});
    try{await deps.passes.failMember(token,issuer,errText(e));}
    catch(f){if(f instanceof CalendarPassError&&f.code==='fence_failed'){fenced=true;errors.push({code:'fence_failed',key:issuer});break;}throw f;}
    continue;
   }
-  try{await deps.passes.replaceExpectations(issuer,market,result.rows,token);}
+  try{await deps.passes.replaceExpectations(issuer,market,result.rows,token,result.profile);}
   catch(e){
    if(e instanceof CalendarPassError&&e.code==='fence_failed'){fenced=true;errors.push({code:'fence_failed',key:issuer});break;}
    counts.failed++;detail.issuers_failed++;errors.push({code:'member_failed',key:issuer,message:errText(e)});
@@ -238,7 +276,7 @@ export async function previewCalendar(deps:CalendarSyncDeps,opts:{market:Market;
  const scope=(await selectAll(deps.tables,'fact_sync_scope',{market:opts.market},'issuer_id')).filter(r=>opts.issuerIds?opts.issuerIds.includes(String(r.issuer_id)):Number(r.priority)>0);
  const out:{issuerId:string;rows:ExpectationRow[];errors:BatchError[]}[]=[];
  for(const r of scope.slice(0,opts.issuerIds?undefined:opts.limit)){
-  const m=await computeMember(deps,opts.market,String(r.issuer_id),iso(now),now.toISOString(),false);
+  const m=await computeMember(deps,opts.market,String(r.issuer_id),iso(now));
   out.push({issuerId:String(r.issuer_id),rows:m.rows,errors:m.errors});
  }
  return out;
diff --git a/src/lib/dq/filer-categories.ts b/src/lib/dq/filer-categories.ts
index a3b738c3..b4084496 100644
--- a/src/lib/dq/filer-categories.ts
+++ b/src/lib/dq/filer-categories.ts
@@ -25,13 +25,20 @@ import {DEFAULT_USER_AGENT} from '../research/ingest/collectors/shared';
 import type {SubmissionsSnapshot} from '../entities/identifiers/sec-submissions';
 
 /** The submissions fields the calendar and this module read. Built only by submissionsView (one adaptation point to Task 6's snapshot). */
-export interface SubmissionsEntryView{accessionNumber:string;filingDate:string;reportDate:string|null;form:string;primaryDocument:string;isInlineXBRL:boolean}
-export interface SubmissionsView{cik10:string;sha256:string;category:string|null;fiscalYearEnd:string|null;entries:SubmissionsEntryView[]}
+export interface SubmissionsEntryView{accessionNumber:string;filingDate:string;reportDate:string|null;form:string;primaryDocument:string;isInlineXBRL:boolean;
+ /** the submissions page (name) holding this entry and that page's sha256 (null: page not among the fetched documents) — evidence must cite these bytes, not the main document's */
+ page?:string;pageSha256?:string|null}
+export interface SubmissionsView{cik10:string;sha256:string;category:string|null;fiscalYearEnd:string|null;entries:SubmissionsEntryView[];
+ /** manifest of the fetched documents ('recent' = main document) */
+ pages?:{name:string;sha256:string}[]}
 // Task 6a shape (Part B): SubmissionsSnapshot{cik, fetchedAt, main:StoredDoc, pages, parsed:ParsedSubmissions, complete};
 // parsed.filings already merges recent with the fetched files[] pages; primaryDocument / isInlineXBRL may be null.
 export function submissionsView(s:SubmissionsSnapshot):SubmissionsView{
- return {cik10:s.cik.padStart(10,'0'),sha256:s.main.sha256,category:s.parsed.category,fiscalYearEnd:s.parsed.fiscalYearEnd,
-  entries:s.parsed.filings.map(e=>({accessionNumber:e.accessionNumber,filingDate:e.filingDate,reportDate:e.reportDate||null,form:e.form,primaryDocument:e.primaryDocument??'',isInlineXBRL:e.isInlineXBRL===true}))};
+ const pages=[{name:'recent',sha256:s.main.sha256},...s.pages.map(p=>({name:p.name,sha256:p.sha256}))];
+ // the parser tags main-document entries 'recent' (submissionsEvidenceClaims.shaOf); 'main' and the document's own name are accepted too
+ const shaOf=(page:string)=>page==='recent'||page==='main'||page===s.main.name?s.main.sha256:s.pages.find(p=>p.name===page)?.sha256??null;
+ return {cik10:s.cik.padStart(10,'0'),sha256:s.main.sha256,category:s.parsed.category,fiscalYearEnd:s.parsed.fiscalYearEnd,pages,
+  entries:s.parsed.filings.map(e=>({accessionNumber:e.accessionNumber,filingDate:e.filingDate,reportDate:e.reportDate||null,form:e.form,primaryDocument:e.primaryDocument??'',isInlineXBRL:e.isInlineXBRL===true,page:e.page,pageSha256:shaOf(e.page)}))};
 }
 
 /**
diff --git a/supabase/migrations/20261107090000_identifiers_and_dq.sql b/supabase/migrations/20261107090000_identifiers_and_dq.sql
index 1950ca03..a2858be6 100644
--- a/supabase/migrations/20261107090000_identifiers_and_dq.sql
+++ b/supabase/migrations/20261107090000_identifiers_and_dq.sql
@@ -630,10 +630,14 @@ end $$;
 revoke execute on function public.claim_calendar_pass(text, uuid) from public, anon, authenticated;
 grant execute on function public.claim_calendar_pass(text, uuid) to service_role;
 
--- The only signature (no 3-arg overload). The member must belong to the pass and be pending, or
--- failed with attempts < 3; its rows for (issuer, market) are replaced atomically and it becomes done.
--- Rows carry the ExpectationRow columns (src/lib/dq/calendar.ts); computed_at and batch_id are set here.
-create or replace function public.replace_filing_expectations(p_issuer uuid, p_market text, p_rows jsonb, p_pass_token jsonb)
+-- The only signature (the 4-arg draft is dropped so named calls cannot be ambiguous). The member must
+-- belong to the pass and be pending, or failed with attempts < 3; its rows for (issuer, market) are
+-- replaced atomically and it becomes done. Rows carry the ExpectationRow columns (src/lib/dq/calendar.ts);
+-- computed_at and batch_id are set here. p_profile (Task 18a review): the issuer's issuer_filing_profiles
+-- row is upserted in the same transaction, only after the token/lease/member checks pass, so a stale
+-- worker can never write a profile; null leaves the stored profile untouched.
+drop function if exists public.replace_filing_expectations(uuid, text, jsonb, jsonb);
+create or replace function public.replace_filing_expectations(p_issuer uuid, p_market text, p_rows jsonb, p_pass_token jsonb, p_profile jsonb default null)
 returns int language plpgsql security definer set search_path = public as $$
 declare p public.dq_calendar_passes; m public.dq_calendar_pass_members; n int;
 begin
@@ -661,6 +665,20 @@ begin
       (x ->> 'profile_as_of')::date, coalesce(x -> 'detail', '{}'::jsonb), clock_timestamp(), p.claimed_by
     from jsonb_array_elements(p_rows) x;
     get diagnostics n = row_count;
+    if p_profile is not null then
+      if jsonb_typeof(p_profile) <> 'object'
+         or (p_profile ? 'issuer_id' and p_profile ->> 'issuer_id' is distinct from p_issuer::text)
+         or (p_profile ? 'market' and p_profile ->> 'market' is distinct from p_market) then
+        raise exception 'invalid_rows' using errcode = '22023';
+      end if;
+      insert into public.issuer_filing_profiles(issuer_id, market, category_raw_current, regime, fiscal_year_end, week52_pattern, source, source_sha256, as_of, updated_at)
+      values (p_issuer, p_market, p_profile ->> 'category_raw_current', p_profile ->> 'regime', p_profile ->> 'fiscal_year_end',
+              coalesce((p_profile ->> 'week52_pattern')::boolean, false), p_profile ->> 'source', p_profile ->> 'source_sha256',
+              (p_profile ->> 'as_of')::date, clock_timestamp())
+      on conflict (issuer_id, market) do update set category_raw_current = excluded.category_raw_current, regime = excluded.regime,
+        fiscal_year_end = excluded.fiscal_year_end, week52_pattern = excluded.week52_pattern, source = excluded.source,
+        source_sha256 = excluded.source_sha256, as_of = excluded.as_of, updated_at = excluded.updated_at;
+    end if;
   exception when check_violation or not_null_violation or unique_violation or foreign_key_violation
               or invalid_text_representation or invalid_datetime_format or datetime_field_overflow or invalid_parameter_value then
     raise exception 'invalid_rows' using errcode = '22023';
@@ -670,8 +688,8 @@ begin
   update public.dq_calendar_passes set claim_until = clock_timestamp() + interval '10 minutes' where market = p.market and pass_id = p.pass_id;
   return n;
 end $$;
-revoke execute on function public.replace_filing_expectations(uuid, text, jsonb, jsonb) from public, anon, authenticated;
-grant execute on function public.replace_filing_expectations(uuid, text, jsonb, jsonb) to service_role;
+revoke execute on function public.replace_filing_expectations(uuid, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
+grant execute on function public.replace_filing_expectations(uuid, text, jsonb, jsonb, jsonb) to service_role;
 
 create or replace function public.fail_calendar_member(p_pass_token jsonb, p_issuer uuid, p_error text)
 returns void language plpgsql security definer set search_path = public as $$

exec
/bin/zsh -lc "git show 86394d3 -- src/lib/dq/calendar-sync.test.ts src/lib/entities/identifiers.integration.test.ts src/lib/dq/filer-categories.test.ts; cat src/lib/dq/batches.ts; sed -n '215,280p' src/lib/dq/calendar-sync.ts; cat src/lib/entities/identifiers/sec-submissions.ts" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-jGW4VrFk' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-iLaLbsDQ' (errno=Operation not permitted)
commit 86394d3c1fdd7c5650131e2cc52a9295ce65c320
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 17:16:16 2026 -0800

    fix(dq): calendar-sync review fixes (batch finished on abort, fenced profile write, per-page evidence, raw_upload_failed, real fiscal_year_end days)
    
    replace_filing_expectations gains p_profile jsonb default null (5-arg; 4-arg dropped) so the issuer profile is written under the pass fence.
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/dq/calendar-sync.test.ts b/src/lib/dq/calendar-sync.test.ts
index 06378378..0efefeac 100644
--- a/src/lib/dq/calendar-sync.test.ts
+++ b/src/lib/dq/calendar-sync.test.ts
@@ -4,9 +4,9 @@ import {memoryTableClient} from '../db/memory-table-client';
 import {TushareError} from '../data/sources/tushare';
 import type {TushareRaw} from '../data/sources/tushare';
 import type {Budget,CalendarFiling,Market} from '../facts/types';
-import {memoryRawStore} from './raw-store';
+import {RawStoreError,memoryRawStore} from './raw-store';
 import type {ExpectationRow} from './calendar';
-import {CalendarPassError,applyUpstreamCoverage,expectationArgs,parseDisclosureDate,previewCalendar,profileFromSubmissions,runCalendarSync,toCalendarPassError} from './calendar-sync';
+import {CalendarPassError,applyUpstreamCoverage,expectationArgs,parseDisclosureDate,previewCalendar,profileFromSubmissions,runCalendarSync,supabaseCalendarPassDb,toCalendarPassError} from './calendar-sync';
 import type {CalendarPassDb,CalendarPassToken,CalendarSyncDeps} from './calendar-sync';
 import type {SubmissionsView} from './filer-categories';
 
@@ -32,9 +32,11 @@ function memoryPasses(tables:ReturnType<typeof memoryTableClient>,scope:()=>stri
    for(const issuer_id of scope())await tables.insert('dq_calendar_pass_members',{market,pass_id,issuer_id,state:'pending',attempts:0});
    return {market,pass_id,batch_id:batch};
   },
-  async replaceExpectations(issuer,market,rows,t){
+  async replaceExpectations(issuer,market,rows,t,profile){
    fence(t);const m=await member(t,issuer);
    if(!m||!(m.state==='pending'||(m.state==='failed'&&Number(m.attempts)<3)))throw new CalendarPassError('member_not_claimable');
+   // the profile is written in the same fenced call (SQL: replace_filing_expectations.p_profile), never before the fence check
+   if(profile)await tables.upsert('issuer_filing_profiles',{...profile,issuer_id:issuer,market},'issuer_id,market');
    for(const r of tables.rows('dq_filing_expectations').filter(r=>r.issuer_id===issuer&&r.market===market))await tables.update('dq_filing_expectations',{issuer_id:issuer,market,report_kind:r.report_kind,period_end:r.period_end},{deleted:true});
    for(const r of rows)await tables.insert('dq_filing_expectations',{...r,batch_id:t.batch_id});
    await tables.update('dq_calendar_pass_members',{market:t.market,pass_id:t.pass_id,issuer_id:issuer},{state:'done'});
@@ -191,6 +193,102 @@ describe('runCalendarSync (US)',()=>{
  });
 });
 
+describe('review fixes (Task 18a)',()=>{
+ const batchStatuses=(h:Awaited<ReturnType<typeof harness>>)=>h.tables.rows('ingest_batches').map(b=>b.status);
+ it('a claim failure finishes the batch (not left running) and rethrows',async()=>{
+  const h=await harness();
+  h.deps.passes={...h.passes,claimPass:async()=>{throw new Error('rpc down');}};
+  await expect(runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'})).rejects.toThrow('rpc down');
+  expect(batchStatuses(h)).toEqual(['failed']);
+  expect(h.tables.rows('ingest_batches')[0].errors).toContainEqual(expect.objectContaining({code:'run_aborted'}));
+ });
+ it('a failure after the pass settled (freshness write) still finishes the batch; the pass stays settled',async()=>{
+  const h=await harness();
+  const real=h.tables;
+  h.deps.tables={...real,upsert:(async(t:string,...a:unknown[])=>{if(t==='dq_freshness')throw new Error('storage down');return (real.upsert as (...x:unknown[])=>unknown)(t,...a);}) as typeof real.upsert} as typeof real;
+  await expect(runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'})).rejects.toThrow('storage down');
+  expect(batchStatuses(h)).toEqual(['partial']);   // rows landed before the abort
+  expect(h.passes.passes[0]).toMatchObject({finished:true,status:'complete'});
+ });
+ it('a failMember storage error (non-fence) finishes the batch and leaves the pass resumable',async()=>{
+  const h=await harness();
+  h.deps.db={filingsForCalendar:async()=>{throw new Error('boom');}};
+  h.deps.passes={...h.passes,failMember:async()=>{throw new CalendarPassError('unknown','db gone');}};
+  await expect(runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'})).rejects.toThrow('db gone');
+  expect(batchStatuses(h)).toEqual(['failed']);
+  expect(h.passes.passes[0].finished).toBe(false);
+ });
+ it('a stale worker never writes a profile: the profile travels in the fenced replace call',async()=>{
+  const h=await harness({members:[A]});
+  const real=h.passes.replaceExpectations;
+  h.passes.replaceExpectations=async(...a)=>{h.passes.expire();return real(...a);};
+  await runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'});
+  expect(h.tables.rows('issuer_filing_profiles')).toHaveLength(0);
+  expect(h.tables.rows('dq_filing_expectations')).toHaveLength(0);
+ });
+ it('a reused stored profile (SEC unavailable) is not rewritten: null profile is passed',async()=>{
+  const h=await harness({members:[A],submissions:async()=>{throw new Error('sec_unavailable');}});
+  await h.tables.upsert('issuer_filing_profiles',{issuer_id:A,market:'US',category_raw_current:null,regime:'10-K',fiscal_year_end:'1231',week52_pattern:false,source:'sec_submissions',source_sha256:'old',as_of:'2026-10-01'},'issuer_id,market');
+  const seen:unknown[]=[];const real=h.passes.replaceExpectations;
+  h.passes.replaceExpectations=async(i,m,r,t,p)=>{seen.push(p);return real(i,m,r,t,p);};
+  await runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'});
+  expect(seen).toEqual([null]);
+  expect(h.tables.rows('issuer_filing_profiles')[0].as_of).toBe('2026-10-01');
+ });
+ it('positive-evidence rows cite the page that holds the entry; the page manifest is kept in the row detail',async()=>{
+  const PAGE='CIK0000000001-submissions-001.json';
+  const v=view();
+  const entries=v.entries.slice(0,2).map((e,i)=>({...e,page:i===0?'recent':PAGE,pageSha256:i===0?'sub-sha':'page-sha'}));
+  const pages=[{name:'recent',sha256:'sub-sha'},{name:PAGE,sha256:'page-sha'}];
+  const h=await harness({members:[A],submissions:async()=>({...v,entries,pages})});
+  await runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'});
+  const rows=rowsOf(h.tables,A);
+  const old=rows.find(x=>x.period_end==='2025-12-31')!;
+  expect(old).toMatchObject({disclosure_state:'filed_not_ingested'});
+  expect(old.detail).toMatchObject({upstream_sha256:'page-sha',upstream_page:PAGE,upstream_pages:pages});
+  const recent=rows.find(x=>x.period_end==='2026-06-30')!;
+  expect(recent.detail).toMatchObject({upstream_sha256:'sub-sha',upstream_page:'recent',upstream_pages:pages});
+  expect(rows.find(x=>x.disclosure_state==='pending')!.detail).toMatchObject({upstream_sha256:'sub-sha',upstream_pages:pages});
+ });
+ it('a CN raw-store failure is a real error: member failed (retryable), raw_upload_failed, never success',async()=>{
+  const h=await harness({market:'CN',members:[C],disclosure:async()=>({bytes:new Uint8Array([1]),sha256:'x',httpStatus:200,requestId:null,code:0,msg:'',fields:[],items:[],hasMore:false})});
+  h.deps.raw={...h.raw,put:async()=>{throw new RawStoreError('raw_upload_failed','503');}};
+  const r=await runCalendarSync(h.deps,{market:'CN',limit:100,triggeredBy:'cron'});
+  expect(r.errors).toContainEqual({code:'raw_upload_failed',key:C,message:'raw_upload_failed: 503'});
+  expect(r.status).not.toBe('success');
+  expect(r).toMatchObject({passStatus:'running',counts:{failed:1,inserted:0}});
+  expect(h.tables.rows('dq_calendar_pass_members')[0]).toMatchObject({state:'failed',attempts:1});
+  expect(h.tables.rows('dq_filing_expectations')).toHaveLength(0);
+  expect(h.tables.rows('dq_freshness')).toHaveLength(0);
+ });
+});
+
+describe('supabaseCalendarPassDb',()=>{
+ it('maps each port method to its RPC with the C5 argument names; row payload drops issuer_id/market; errors map to pass codes',async()=>{
+  const calls:{fn:string;args:Record<string,unknown>}[]=[];
+  let fail:string|null=null;
+  const client={rpc:async(fn:string,args:Record<string,unknown>)=>{calls.push({fn,args});return fail?{data:null,error:{message:fail}}:{data:fn==='replace_filing_expectations'?'2':fn==='finish_calendar_pass'?'complete':fn==='claim_calendar_pass'?{market:'US',pass_id:'p',batch_id:'b'}:null,error:null};}};
+  const db=supabaseCalendarPassDb(client as never);
+  const tok={market:'US' as const,pass_id:'p',batch_id:'b'};
+  expect(await db.claimPass('US','b')).toEqual(tok);
+  const row={issuer_id:A,market:'US',report_kind:'10-K',period_end:'2025-12-31'} as unknown as ExpectationRow;
+  const profile={issuer_id:A,market:'US' as const,category_raw_current:null,regime:'10-K' as const,fiscal_year_end:'1231',week52_pattern:false,source:'sec_submissions',source_sha256:null,as_of:'2026-11-05'};
+  expect(await db.replaceExpectations(A,'US',[row],tok,profile)).toBe(2);
+  expect(await db.replaceExpectations(A,'US',[row],tok,null)).toBe(2);
+  await db.failMember(tok,A,'x'.repeat(900));
+  expect(await db.finishPass(tok)).toBe('complete');
+  const {issuer_id:_i,market:_m,...p}=profile;
+  expect(calls.map(c=>c.fn)).toEqual(['claim_calendar_pass','replace_filing_expectations','replace_filing_expectations','fail_calendar_member','finish_calendar_pass']);
+  expect(calls[0].args).toEqual({p_market:'US',p_batch:'b'});
+  expect(calls[1].args).toEqual({p_issuer:A,p_market:'US',p_rows:[{report_kind:'10-K',period_end:'2025-12-31'}],p_pass_token:tok,p_profile:p});
+  expect(calls[2].args.p_profile).toBeNull();
+  expect(calls[3].args).toEqual({p_pass_token:tok,p_issuer:A,p_error:'x'.repeat(500)});
+  expect(calls[4].args).toEqual({p_pass_token:tok});
+  fail='fence_failed';
+  await expect(db.finishPass(tok)).rejects.toMatchObject({code:'fence_failed'});
+ });
+});
+
 describe('runCalendarSync (CN)',()=>{
  it('without TUSHARE_TOKEN every unreceived row is unknown_upstream and the reason is summarised',async()=>{
   const h=await harness({market:'CN',members:[C]});
@@ -244,6 +342,10 @@ describe('helpers',()=>{
   expect(parseDisclosureDate({fields:['ts_code','ann_date','end_date','pre_date','actual_date','modify_date'],items:[['600519.SH','20260115','20251231','20260403','20260403',null],['600519.SH',null,'bad',null,null,null]]}))
    .toEqual([{end_date:'2025-12-31',ann_date:'2026-01-15',pre_date:'2026-04-03',actual_date:'2026-04-03',modify_date:null}]);
  });
+ it('fiscal_year_end must be a real calendar day (leap-year calendar): 0231/0431/0631 → null, 0229 kept',()=>{
+  for(const bad of ['0231','0431','0631','0931','1131','0230','0000','0100'])expect(profileFromSubmissions(A,view({fiscalYearEnd:bad}),'2026-11-05')?.fiscal_year_end).toBeNull();
+  for(const ok of ['0229','0131','0430','1231'])expect(profileFromSubmissions(A,view({fiscalYearEnd:ok}),'2026-11-05')?.fiscal_year_end).toBe(ok);
+ });
  it('profile: regime from the latest annual form, 52/53-week detection, no annual form → null',()=>{
   expect(profileFromSubmissions(A,view(),'2026-11-05')).toMatchObject({regime:'10-K',fiscal_year_end:'1231',week52_pattern:false});
   expect(profileFromSubmissions(A,view({fiscalYearEnd:'0927',entries:[{accessionNumber:'k',filingDate:'2025-10-31',reportDate:'2025-09-27',form:'10-K',primaryDocument:'k',isInlineXBRL:true}]}),'2026-11-05')?.week52_pattern).toBe(true);
diff --git a/src/lib/dq/filer-categories.test.ts b/src/lib/dq/filer-categories.test.ts
index 46b3948e..4e9f5e75 100644
--- a/src/lib/dq/filer-categories.test.ts
+++ b/src/lib/dq/filer-categories.test.ts
@@ -121,8 +121,15 @@ describe('syncFilerCategories',()=>{
    filings:[{accessionNumber:'a',filingDate:'2025-08-01',reportDate:'',acceptanceDateTime:null,form:'10-K',primaryDocument:'a.htm',isInlineXBRL:true,page:'main'},
     {accessionNumber:'b',filingDate:'2025-05-01',reportDate:null,acceptanceDateTime:null,form:'10-Q',primaryDocument:null,isInlineXBRL:null,page:'main'}]};
   expect(submissionsView({cik:'1',fetchedAt:'2026-11-05T00:00:00.000Z',main:{name:'main',sha256:'s',path:'sec-submissions/s.json'},pages:[],parsed,complete:true}))
-   .toEqual({cik10:'0000000001',sha256:'s',category:'Accelerated filer',fiscalYearEnd:'0630',entries:[{accessionNumber:'a',filingDate:'2025-08-01',reportDate:null,form:'10-K',primaryDocument:'a.htm',isInlineXBRL:true},
-    {accessionNumber:'b',filingDate:'2025-05-01',reportDate:null,form:'10-Q',primaryDocument:'',isInlineXBRL:false}]});
+   .toEqual({cik10:'0000000001',sha256:'s',category:'Accelerated filer',fiscalYearEnd:'0630',pages:[{name:'recent',sha256:'s'}],entries:[{accessionNumber:'a',filingDate:'2025-08-01',reportDate:null,form:'10-K',primaryDocument:'a.htm',isInlineXBRL:true,page:'main',pageSha256:'s'},
+    {accessionNumber:'b',filingDate:'2025-05-01',reportDate:null,form:'10-Q',primaryDocument:'',isInlineXBRL:false,page:'main',pageSha256:'s'}]});
+ });
+ it('submissionsView carries each entry\'s page name and sha256 (historical pages cite their own bytes) and a page manifest',()=>{
+  const f=(accessionNumber:string,page:string)=>({accessionNumber,filingDate:'2020-01-01',reportDate:'2019-12-31',acceptanceDateTime:null,form:'10-K',primaryDocument:'k.htm',isInlineXBRL:true,page});
+  const parsed={cik:'1',name:'X',category:null,fiscalYearEnd:'1231',tickers:[],tickerPositions:[],exchanges:[],formerNames:[],files:[],filings:[f('a','recent'),f('b','CIK0000000001-submissions-001.json'),f('c','missing-page.json')]};
+  const v=submissionsView({cik:'1',fetchedAt:'2026-11-05T00:00:00.000Z',main:{name:'CIK0000000001.json',sha256:'m',path:'x'},pages:[{name:'CIK0000000001-submissions-001.json',sha256:'p1',path:'y'}],parsed,complete:true});
+  expect(v.pages).toEqual([{name:'recent',sha256:'m'},{name:'CIK0000000001-submissions-001.json',sha256:'p1'}]);
+  expect(v.entries.map(e=>[e.page,e.pageSha256])).toEqual([['recent','m'],['CIK0000000001-submissions-001.json','p1'],['missing-page.json',null]]);
  });
 });
 
diff --git a/src/lib/entities/identifiers.integration.test.ts b/src/lib/entities/identifiers.integration.test.ts
index 2ef28f05..93d9a954 100644
--- a/src/lib/entities/identifiers.integration.test.ts
+++ b/src/lib/entities/identifiers.integration.test.ts
@@ -708,7 +708,7 @@ describe.skipIf(!enabled)('plan 3 migration one: resolve_identifier_claim',()=>{
  });
 
  it('grants the functions to service_role only, keeps the helpers private and has one replace_filing_expectations signature',async()=>{
-  const FNS=['public.resolve_identifier_claim(uuid,text,uuid,jsonb)','public.replace_filing_expectations(uuid,text,jsonb,jsonb)','public.claim_calendar_pass(text,uuid)','public.fail_calendar_member(jsonb,uuid,text)','public.finish_calendar_pass(jsonb)',
+  const FNS=['public.resolve_identifier_claim(uuid,text,uuid,jsonb)','public.replace_filing_expectations(uuid,text,jsonb,jsonb,jsonb)','public.claim_calendar_pass(text,uuid)','public.fail_calendar_member(jsonb,uuid,text)','public.finish_calendar_pass(jsonb)',
    'public.append_claim_evidence(uuid,text,text,text,text,jsonb)','public.patch_quarantine_detail(uuid,text,jsonb,text)','public.set_security_identifier(uuid,text,date,text,text,jsonb)','public.set_issuer_identifier(uuid,text,text,jsonb)','public.set_security_window(uuid,text,date,text,date,jsonb)','public.patch_security_provenance(uuid,text,date,jsonb,text[])','public.close_security_absent(uuid,text,date,date,text,jsonb)'];
   const HELPERS=['public.claim_text_is_date(text)','public.claim_keys_within(jsonb,text[])','public.claim_evidence_ok(jsonb)','public.identifier_claim_target_key(text,jsonb)','public.identifier_claim_problem(text,text,text,uuid,jsonb)','public.dq_calendar_lock_pass(jsonb)','public.claim_provenance_safe(jsonb,integer)'];
   for(const fn of [...FNS,...HELPERS])for(const role of ['anon','authenticated','service_role']){
@@ -867,6 +867,36 @@ describe.skipIf(!enabled)('plan 3 migration one: calendar pass functions',()=>{
   });
  },60000);
 
+ it('replace_filing_expectations writes the issuer profile in the same fenced transaction (stale token → profile unchanged)',async()=>{
+  await withCalendarLock(admin,async()=>{
+   const i=await issuer();await scopeRow(i);
+   const b=await batch();
+   const tok=(await claimPass(b))!;
+   const profile=(over:Record<string,unknown>={})=>({category_raw_current:'Large accelerated filer',regime:'cn',fiscal_year_end:'1231',week52_pattern:false,source:'cn_statutory',source_sha256:null,as_of:'2026-11-05',...over});
+   const withProfile=async(t:unknown,iss:string,p:unknown,rows:unknown=[])=>(await q(`select public.replace_filing_expectations($1,$2,$3::jsonb,$4::jsonb,$5::jsonb) v`,[iss,CAL,JSON.stringify(rows),JSON.stringify(t),p===null?null:JSON.stringify(p)]))[0].v as number;
+   const stored=()=>q(`select regime,fiscal_year_end,source,as_of::text from public.issuer_filing_profiles where issuer_id=$1 and market=$2`,[i,CAL]);
+   // a token for another batch fails the fence: nothing is written, not even the profile
+   expect((await fails(withProfile({...tok,batch_id:randomUUID()},i,profile()))).message).toBe('fence_failed');
+   expect(await stored()).toEqual([]);
+   // invalid profile (check violation / another issuer) → invalid_rows, nothing written, member still pending
+   expect((await fails(withProfile(tok,i,profile({regime:'bogus'})))).message).toBe('invalid_rows');
+   expect((await fails(withProfile(tok,i,{...profile(),issuer_id:randomUUID()}))).message).toBe('invalid_rows');
+   expect(await stored()).toEqual([]);
+   expect(await member(tok.pass_id,i)).toMatchObject({state:'pending'});
+   // valid → rows and profile in one go
+   expect(await withProfile(tok,i,profile(),[expRow()])).toBe(1);
+   expect(await stored()).toEqual([{regime:'cn',fiscal_year_end:'1231',source:'cn_statutory',as_of:'2026-11-05'}]);
+   await drain(tok);expect(await finish(tok)).toBe('complete');
+   // next pass: a null profile leaves the stored one untouched; a finished (stale) token cannot change it
+   const tok2=(await claimPass(b))!;
+   expect(await withProfile(tok2,i,null)).toBe(0);
+   expect(await stored()).toEqual([{regime:'cn',fiscal_year_end:'1231',source:'cn_statutory',as_of:'2026-11-05'}]);
+   await drain(tok2);await finish(tok2);
+   expect((await fails(withProfile(tok2,i,profile({fiscal_year_end:'0630'})))).message).toBe('fence_failed');   // pass finished
+   expect(await stored()).toEqual([{regime:'cn',fiscal_year_end:'1231',source:'cn_statutory',as_of:'2026-11-05'}]);
+  });
+ },60000);
+
  it('fail_calendar_member retries up to three attempts; finish_calendar_pass settles only from persisted state',async()=>{
   await withCalendarLock(admin,async()=>{
    const i=await issuer(),k=await issuer();await scopeRow(i);await scopeRow(k);
// Ingest receipts (spec §5.1 ingest_batches). Every producer starts a batch, writes rows that
// reference batch_id, and finishes with counts + errors. Status is derived from counts and
// errors so dashboards never guess: success = no failures and no non-informational errors;
// quarantined rows and informational entries (INFO_CODES) do not degrade status. The row is written with finished_at:null so the DB invariant
// (status='running' iff finished_at is null) holds. Only a running batch can be finished.
import {randomUUID} from 'node:crypto';
import type {TableClient} from '../db/table-client';

export type BatchStatus='running'|'success'|'partial'|'failed'|'rejected';
export type TriggeredBy='cron'|'manual'|'script';
/**
 * Receipt counters, all non-negative safe integers:
 * - fetched: rows read from the source;
 * - inserted: new rows written; duplicates: rows already present unchanged (no write);
 * - versioned: rows that superseded an existing version; quarantined: rows parked in dq_quarantine;
 * - failed: rows that could not be processed at all.
 * inserted+duplicates+versioned+quarantined+failed is the number of rows with an outcome; it may
 * be below fetched (rows filtered out by design), but fetched > 0 with no outcome at all means the
 * producer lost track of its rows and the batch finishes as failed ('unaccounted').
 */
export interface BatchCounts{fetched:number;inserted:number;duplicates:number;versioned:number;quarantined:number;failed:number}
export interface BatchError{code:string;key?:string;message?:string}
export interface StartBatchInput{producer:string;dataset:string;toolVersions?:Record<string,string>;codeVersion?:string;triggeredBy?:TriggeredBy}

const TRIGGERS:readonly TriggeredBy[]=['cron','manual','script'];
export const emptyCounts=():BatchCounts=>({fetched:0,inserted:0,duplicates:0,versioned:0,quarantined:0,failed:0});

const COUNTERS:readonly (keyof BatchCounts)[]=['fetched','inserted','duplicates','versioned','quarantined','failed'];
const MAX_ERRORS=100,MAX_MESSAGE=500;

function assertCounts(counts:BatchCounts):void{
 if(!counts||COUNTERS.some(k=>!Number.isSafeInteger(counts[k])||counts[k]<0))throw new Error('invalid_counts');
}

/** First MAX_ERRORS errors with messages capped, plus a `truncated` marker for the rest. */
function capErrors(errors:BatchError[]):BatchError[]{
 const kept=errors.slice(0,MAX_ERRORS).map(e=>e.message!==undefined&&e.message.length>MAX_MESSAGE?{...e,message:e.message.slice(0,MAX_MESSAGE)}:e);
 return errors.length>MAX_ERRORS?[...kept,{code:'truncated',message:`${errors.length-MAX_ERRORS} more`}]:kept;
}

/**
 * Error codes that only inform the receipt reader: `skipped_summary` (input rows left out by
 * expected filtering, e.g. not in the universe or not promotable yet) and `relink` (a research
 * entity re-pointed to another issuer), `rule_warning_summary` (one per warning rule per batch, facts spec §7.2),
 * `coverage_summary` (Tushare coverage summary, §6.3), `deadline_hit` (issuers not started after the deadline, §6.1) and `claims_summary` (identifier claims filed per op, data foundation 3 §4.2.2/§8). They stay in `errors` but never make a batch partial or
 * failed. `rejected_summary` (malformed or invalid input rows) is deliberately NOT informational:
 * it makes the batch partial, or failed when nothing landed.
 */
export const INFO_CODES=['skipped_summary','relink','rule_warning_summary','coverage_summary','deadline_hit','claims_summary'] as const;
export type InfoCode=typeof INFO_CODES[number];
export const isInfoError=(e:BatchError)=>(INFO_CODES as readonly string[]).includes(e.code);

const accounted=(c:BatchCounts)=>c.inserted+c.duplicates+c.versioned+c.quarantined+c.failed;
export const UNACCOUNTED_ERROR:BatchError={code:'unaccounted',message:'fetched rows without outcomes'};

/**
 * Pure status: rejected flag wins; fetched rows with no outcome → failed; any failure or
 * non-informational error → partial if something landed, else failed. Errors whose code is in
 * INFO_CODES are ignored here (a run whose only entries are skips/relinks is a success).
 */
export function batchStatusFromCounts(counts:BatchCounts,errors:BatchError[],flags:{rejected?:boolean}={}):BatchStatus{
 assertCounts(counts);
 if(flags.rejected)return 'rejected';
 if(counts.fetched>0&&accounted(counts)===0)return 'failed';
 const landed=counts.inserted+counts.duplicates+counts.versioned+counts.quarantined;
 if(counts.failed>0||errors.some(e=>!isInfoError(e)))return landed>0?'partial':'failed';
 return 'success';
}

export async function startBatch(client:TableClient,input:StartBatchInput):Promise<{batchId:string}>{
 const ok=(s:unknown)=>typeof s==='string'&&s.length>=1&&s.length<=64;
 const trigger=input.triggeredBy??'script';
 if(!ok(input.producer)||!ok(input.dataset)||!TRIGGERS.includes(trigger))throw new Error('invalid_batch');
 const batchId=randomUUID();
 await client.insert('ingest_batches',{
  batch_id:batchId,producer:input.producer,dataset:input.dataset,status:'running',
  started_at:new Date().toISOString(),finished_at:null,counts:emptyCounts(),errors:[],
  tool_versions:input.toolVersions??{},code_version:input.codeVersion??null,triggered_by:trigger,
 });
 return {batchId};
}

/**
 * Finishes a running batch. An unaccounted receipt (fetched > 0, no outcomes) finishes as failed
 * with an appended {code:'unaccounted'} error. Throws invalid_now when `now` or the stored
 * started_at is not a valid date, rather than writing a NaN finished_at.
 */
export async function finishBatch(client:TableClient,batchId:string,result:{counts:BatchCounts;errors:BatchError[];rejected?:boolean},now=new Date()):Promise<BatchStatus>{
 const status=batchStatusFromCounts(result.counts,result.errors,{rejected:result.rejected});
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw new Error('invalid_now');
 const unaccounted=!result.rejected&&result.counts.fetched>0&&accounted(result.counts)===0;
 const errors=unaccounted?[UNACCOUNTED_ERROR,...result.errors]:result.errors;
 const [batch]=await client.select('ingest_batches',{batch_id:batchId},{limit:1});
 if(!batch||batch.status!=='running')throw new Error('batch_not_running');
 const startedAt=Date.parse(String(batch.started_at));
 if(!Number.isFinite(startedAt))throw new Error('invalid_now');
 // Never before started_at (DB check finished_after_started), even under clock skew.
 const finishedAt=new Date(Math.max(now.getTime(),startedAt));
 // Matching on status='running' keeps a concurrent finish from being overwritten.
 const n=await client.update('ingest_batches',{batch_id:batchId,status:'running'},{status,counts:result.counts,errors:capErrors(errors),finished_at:finishedAt.toISOString()});
 if(n!==1)throw new Error('batch_not_running');
 return status;
}

 const {counts,errors}=shared;const schedule:Record<string,number>={};
 const detail:CalendarDetail={pass_id:null,issuers_done:0,issuers_failed:0,rows:0,by_deadline_state:{},by_disclosure_state:{},upstream_unavailable:0,no_fiscal_year_end:0,no_category:0,no_profile:0};
 const {batchId}=await startBatch(deps.tables,{producer:'filing-calendar',dataset:DATASETS.calendar(market),toolVersions:{rules:CALENDAR_RULES_VERSION,market},codeVersion:deps.codeVersion??undefined,triggeredBy:opts.triggeredBy});
 shared.batchId=batchId;
 const finish=async(passId:string|null,passStatus:CalendarReceipt['passStatus']):Promise<CalendarReceipt>=>{
  if(Object.keys(schedule).length)errors.push({code:'skipped_summary',key:'schedule_unavailable',message:JSON.stringify(schedule)});
  const status=await finishBatch(deps.tables,batchId,{counts,errors},deps.now());
  return {batchId,status,passId,passStatus,counts,errors,detail};
 };
 const token=await deps.passes.claimPass(market,batchId);
 if(!token){errors.push({code:'skipped_summary',key:'pass',message:JSON.stringify({pass_claimed:1})});return finish(null,null);}
 detail.pass_id=token.pass_id;
 const now=deps.now();const today=iso(now);
 const members=await selectAll(deps.tables,'dq_calendar_pass_members',{market,pass_id:token.pass_id},'issuer_id');
 const todo=[...members.filter(m=>m.state==='pending'),...members.filter(m=>m.state==='failed'&&Number(m.attempts)<MAX_MEMBER_ATTEMPTS)].map(m=>String(m.issuer_id)).slice(0,opts.limit);
 let fenced=false;
 for(const [i,issuer] of todo.entries()){
  if(deps.budget.remainingMs()<MIN_MEMBER_MS){errors.push({code:'deadline_hit',message:JSON.stringify({not_started:todo.length-i})});break;}
  counts.fetched++;
  let result:MemberResult;
  try{result=await computeMember(deps,market,issuer,today);}
  catch(e){
   counts.failed++;detail.issuers_failed++;errors.push({code:e instanceof RawStoreError?'raw_upload_failed':'member_failed',key:issuer,message:errText(e)});
   try{await deps.passes.failMember(token,issuer,errText(e));}
   catch(f){if(f instanceof CalendarPassError&&f.code==='fence_failed'){fenced=true;errors.push({code:'fence_failed',key:issuer});break;}throw f;}
   continue;
  }
  try{await deps.passes.replaceExpectations(issuer,market,result.rows,token,result.profile);}
  catch(e){
   if(e instanceof CalendarPassError&&e.code==='fence_failed'){fenced=true;errors.push({code:'fence_failed',key:issuer});break;}
   counts.failed++;detail.issuers_failed++;errors.push({code:'member_failed',key:issuer,message:errText(e)});
   try{await deps.passes.failMember(token,issuer,errText(e));}
   catch(f){if(f instanceof CalendarPassError&&f.code==='fence_failed'){fenced=true;errors.push({code:'fence_failed',key:issuer});break;}throw f;}
   continue;
  }
  counts.inserted++;detail.issuers_done++;detail.rows+=result.rows.length;
  errors.push(...result.errors);
  if(result.scheduleReason)bump(schedule,result.scheduleReason);
  if(result.upstreamUnavailable)detail.upstream_unavailable++;
  if(result.noProfile)detail.no_profile++;
  if(result.noFye)detail.no_fiscal_year_end++;
  if(result.noCategory)detail.no_category++;
  for(const r of result.rows){bump(detail.by_deadline_state,r.deadline_state);bump(detail.by_disclosure_state,r.disclosure_state);}
 }
 if(fenced)return finish(token.pass_id,'running');
 const after=await selectAll(deps.tables,'dq_calendar_pass_members',{market,pass_id:token.pass_id},'issuer_id');
 if(after.some(m=>m.state==='pending'||(m.state==='failed'&&Number(m.attempts)<MAX_MEMBER_ATTEMPTS)))return finish(token.pass_id,'running');
 let passStatus:'complete'|'complete_with_failures';
 try{passStatus=await deps.passes.finishPass(token);}
 catch(e){if(e instanceof CalendarPassError&&(e.code==='fence_failed'||e.code==='pass_incomplete')){errors.push({code:e.code,key:token.pass_id});return finish(token.pass_id,'running');}throw e;}
 const [pass]=await deps.tables.select('dq_calendar_passes',{market,pass_id:token.pass_id},{limit:1});
 const startedAt=String(pass?.started_at??now.toISOString()),finishedAt=String(pass?.finished_at??deps.now().toISOString());
 const tooLong=Date.parse(finishedAt)-Date.parse(startedAt)>PASS_MAX_AGE_MS;
 await recordAttempt(deps.tables,DATASETS.calendar(market),{ok:passStatus==='complete'&&!tooLong,cadence:'daily',now:deps.now(),detail:{pass_id:token.pass_id,started_at:startedAt,finished_at:finishedAt,status:passStatus,...(tooLong?{pass_too_long:true}:{})}});
 return finish(token.pass_id,passStatus);
}

/** Read-only preview for scripts (no batch, no pass, no profile write; deps.raw should be a memory store): the rows each scope member would get. */
export async function previewCalendar(deps:CalendarSyncDeps,opts:{market:Market;issuerIds?:string[];limit:number}):Promise<{issuerId:string;rows:ExpectationRow[];errors:BatchError[]}[]>{
 const now=deps.now();
 const scope=(await selectAll(deps.tables,'fact_sync_scope',{market:opts.market},'issuer_id')).filter(r=>opts.issuerIds?opts.issuerIds.includes(String(r.issuer_id)):Number(r.priority)>0);
 const out:{issuerId:string;rows:ExpectationRow[];errors:BatchError[]}[]=[];
 for(const r of scope.slice(0,opts.issuerIds?undefined:opts.limit)){
  const m=await computeMember(deps,opts.market,String(r.issuer_id),iso(now));
  out.push({issuerId:String(r.issuer_id),rows:m.rows,errors:m.errors});
// src/lib/entities/identifiers/sec-submissions.ts
// SEC submissions (spec §4.3.3; reused by acceptance times §4.5 and the filing calendar §6.1).
// One fetch per CIK serves several consumers. submissionsClient paces requests (declared
// User-Agent; at least SEC_MIN_INTERVAL_MS apart within one client), stores the exact bytes of the
// main document and of each fetched filings.files[] page in reconcile-raw, and returns the parsed,
// merged snapshot. An accession repeated across pages is kept once when the copies agree; copies that
// disagree on filingDate/acceptanceDateTime are ALL kept (consumers see the conflict: filingsByAccession
// leaves such an accession out, acceptance enrichment skips it). Parsers are pure and strict about the columnar `filings.recent` shape (every
// column has one entry per accession). 8-A12B/8-A12G/25/25-NSE become evidence_only claims that
// never prefill a security or an effective date (the reviewer reads the filing, spec §4.2.1).
import type {Budget} from '../../facts/types';
import type {Pacer} from '../../facts/providers/shared';
import {PacerError,SEC_MIN_INTERVAL_MS as SHARED_INTERVAL,secPacer} from '../../facts/providers/shared';
import type {RawStore} from '../../dq/raw-store';
import {normalizeCik} from '../../research/entity-keys/identifiers';
import {DEFAULT_USER_AGENT} from '../../research/ingest/collectors/shared';
import type {ClaimInput} from '../claims';
import type {ClaimEvidence} from '../types';

export const SEC_SUBMISSIONS_BASE='https://data.sec.gov/submissions/';
export const SEC_MIN_INTERVAL_MS=SHARED_INTERVAL;
export const SUBMISSIONS_PARSER_VERSION='sec-submissions/1';
const PAGE_NAME=/^CIK\d{10}-submissions-\d{3}\.json$/;
export const submissionsUrl=(cik:string)=>`${SEC_SUBMISSIONS_BASE}CIK${normalizeCik(cik).padStart(10,'0')}.json`;

export interface SubmissionFiling{accessionNumber:string;filingDate:string;reportDate:string|null;acceptanceDateTime:string|null;form:string;primaryDocument:string|null;isInlineXBRL:boolean|null;page:string}
export interface SubmissionsPageRef{name:string;filingCount:number|null;filingFrom:string|null;filingTo:string|null}
export interface FormerName{name:string;from:string|null;to:string|null}
export interface ParsedSubmissions{cik:string;name:string|null;category:string|null;fiscalYearEnd:string|null;tickers:string[];/** index of each tickers[] entry in the raw document (blank entries are dropped, positions kept) */tickerPositions:number[];exchanges:string[];formerNames:FormerName[];filings:SubmissionFiling[];files:SubmissionsPageRef[]}
export interface StoredDoc{name:string;sha256:string;path:string}
export interface SubmissionsSnapshot{cik:string;fetchedAt:string;main:StoredDoc;pages:StoredDoc[];parsed:ParsedSubmissions;complete:boolean}
export class SecSubmissionsError extends Error{
 constructor(readonly code:'sec_unavailable'|'invalid_schema',detail?:string,readonly raw?:{sha256:string;path:string}){super(detail?`${code}: ${detail}`:code);this.name='SecSubmissionsError';}
}
export type FilerAcceleration='large_accelerated'|'accelerated'|'non_accelerated'|'unknown';

/** Acceleration named in submissions `category` (reference only; deadlines use the 10-K cover, spec §6.1). Only "Smaller reporting company" → unknown. */
export function submissionsCategory(raw:string|null|undefined):FilerAcceleration{
 const s=(raw??'').toLowerCase();
 if(s.includes('non-accelerated'))return 'non_accelerated';
 if(s.includes('large accelerated'))return 'large_accelerated';
 if(s.includes('accelerated filer'))return 'accelerated';
 return 'unknown';
}

const text=(v:unknown)=>typeof v==='string'&&v.trim()!==''?v:null;
const invalid=(detail:string)=>new SecSubmissionsError('invalid_schema',detail);

function columnar(o:unknown,page:string):SubmissionFiling[]{
 if(!o||typeof o!=='object'||Array.isArray(o))throw invalid(`${page}: not an object`);
 const c=o as Record<string,unknown>;
 const acc=c.accessionNumber;
 if(!Array.isArray(acc))throw invalid(`${page}: accessionNumber`);
 const col=(k:string,required:boolean):unknown[]|null=>{
  const v=c[k];
  if(v===undefined&&!required)return null;
  if(!Array.isArray(v)||v.length!==acc.length)throw invalid(`${page}: ${k}`);
  return v;
 };
 const fd=col('filingDate',true)!,form=col('form',true)!;
 const rd=col('reportDate',false),ad=col('acceptanceDateTime',false),pd=col('primaryDocument',false),ix=col('isInlineXBRL',false);
 return acc.map((a,i)=>{
  if(typeof a!=='string'||typeof fd[i]!=='string'||typeof form[i]!=='string')throw invalid(`${page}: row ${i}`);
  const x=ix?.[i];
  return {accessionNumber:a,filingDate:fd[i] as string,reportDate:text(rd?.[i]),acceptanceDateTime:text(ad?.[i]),form:form[i] as string,
   primaryDocument:text(pd?.[i]),isInlineXBRL:x===1||x===true?true:x===0||x===false?false:null,page};
 });
}
const parseJson=(json:string,what:string)=>{try{return JSON.parse(json) as unknown;}catch{throw invalid(`${what}: not JSON`);}};

export function parseSubmissionsPage(json:string,name:string):SubmissionFiling[]{return columnar(parseJson(json,name),name);}

export function parseSubmissions(json:string):ParsedSubmissions{
 const doc=parseJson(json,'main');
 if(!doc||typeof doc!=='object'||Array.isArray(doc))throw invalid('main: not an object');
 const d=doc as Record<string,unknown>;
 let cik:string;
 try{cik=normalizeCik(d.cik);}catch{throw invalid('cik');}
 const filings=d.filings as {recent?:unknown;files?:unknown}|undefined;
 if(!filings||typeof filings!=='object')throw invalid('filings');
 // Absent or malformed tickers / files are NOT empty lists: consumers read [] as "SEC lists none", so they fail instead.
 const requiredArray=(v:unknown,what:string):unknown[]=>{if(!Array.isArray(v))throw invalid(what);return v;};
 const requiredStrings=(v:unknown,what:string)=>requiredArray(v,what).map(x=>{if(typeof x!=='string')throw invalid(what);return x;});
 const tickerList=(v:unknown)=>{
  const all=requiredStrings(v,'tickers').map(t=>t.trim().toUpperCase());
  const tickerPositions=all.flatMap((t,i)=>t===''?[]:[i]);
  return {tickers:tickerPositions.map(i=>all[i]),tickerPositions};
 };
 const strings=(v:unknown)=>Array.isArray(v)?v.filter((x):x is string=>typeof x==='string'&&x.trim()!==''):[];
 const fye=text(d.fiscalYearEnd);
 return {
  cik,name:text(d.name),category:text(d.category),
  fiscalYearEnd:fye&&/^(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(fye)?fye:null,
  ...tickerList(d.tickers),exchanges:strings(d.exchanges),
  formerNames:(Array.isArray(d.formerNames)?d.formerNames:[]).flatMap(f=>{
   const o=(f&&typeof f==='object'?f:{}) as Record<string,unknown>;const n=text(o.name);
   return n?[{name:n,from:text(o.from),to:text(o.to)}]:[];
  }),
  filings:columnar(filings.recent,'recent'),
  files:requiredArray(filings.files,'filings.files').map(f=>{
   const o=(f&&typeof f==='object'?f:{}) as Record<string,unknown>;const n=text(o.name);
   if(!n||!PAGE_NAME.test(n))throw invalid('files[].name');
   return {name:n,filingCount:typeof o.filingCount==='number'?o.filingCount:null,filingFrom:text(o.filingFrom),filingTo:text(o.filingTo)};
  }),
 };
}

export interface FetchSubmissionsDeps{fetch:typeof fetch;raw:RawStore;userAgent?:string;sleep?:(ms:number,signal?:AbortSignal)=>Promise<void>;now?:()=>number;clock?:()=>Date;budget?:Budget;
 /** Default: one process-wide SEC pacer shared by every client and fetchSubmissions call. Tests inject their own for isolation. */pacer?:Pacer}

const FETCH_TIMEOUT_MS=30_000;
/** Runs a parse of stored bytes; a schema failure carries the stored document's sha256/path so the evidence can be found. */
function parseStored<T>(doc:StoredDoc,parse:()=>T):T{
 try{return parse();}
 catch(e){
  if(e instanceof SecSubmissionsError&&!e.raw)throw new SecSubmissionsError(e.code,e.message.replace(/^[a-z_]+: ?/,''),{sha256:doc.sha256,path:doc.path});
  throw e;
 }
}
// Process-wide: SEC's limit is per source address, so every SEC caller (also companyfacts) shares secPacer.
const SEC_PACER:Pacer=secPacer;
const unlimited=():Budget=>({remainingMs:()=>Number.POSITIVE_INFINITY,signal:new AbortController().signal});

export function submissionsClient(deps:FetchSubmissionsDeps){
 const ua=deps.userAgent??process.env.EDGAR_USER_AGENT??DEFAULT_USER_AGENT;
 const clock=deps.clock??(()=>new Date());
 const budget=deps.budget??unlimited();
 const pacer=deps.pacer??SEC_PACER;
 // The User-Agent may contain a contact address: it goes on the request only, never into raw metadata.
 const get=async(url:string,cik:string,name:string):Promise<{bytes:Uint8Array;doc:StoredDoc}>=>{
  try{
   await pacer.admit({budget,reserveMs:0,now:deps.now,sleep:deps.sleep as never});
  }catch(e){
   if(e instanceof PacerError)throw new SecSubmissionsError('sec_unavailable',`${name}: ${e.code}`);
   throw e;
  }
  let res:Response;
  try{res=await deps.fetch(url,{headers:{'User-Agent':ua,Accept:'application/json'},signal:AbortSignal.any([budget.signal,AbortSignal.timeout(FETCH_TIMEOUT_MS)])});}
  catch(e){throw new SecSubmissionsError('sec_unavailable',`${name}: ${e instanceof Error?e.message:String(e)}`);}
  let bytes:Uint8Array;
  try{bytes=new Uint8Array(await res.arrayBuffer());}
  catch(e){throw new SecSubmissionsError('sec_unavailable',`${name}: ${e instanceof Error?e.message:String(e)}`);}
  const contentType=(res.headers.get('content-type')??'').includes('html')?'text/html' as const:'application/json' as const;
  if(!res.ok){
   // Evidence first: the failure body is kept as received (an aborted budget starts no upload), then the failure is reported with its sha256/path.
   let stored:{sha256:string;path:string};
   try{stored=await deps.raw.put({kind:'sec-submissions',bytes,contentType,meta:{cik,name,http_status:res.status}},budget);}
   catch(e){throw new SecSubmissionsError('sec_unavailable',`${name}: HTTP ${res.status} (raw not stored: ${e instanceof Error?e.message:String(e)})`);}
   throw new SecSubmissionsError('sec_unavailable',`${name}: HTTP ${res.status}`,{sha256:stored.sha256,path:stored.path});
  }
  const stored=await deps.raw.put({kind:'sec-submissions',bytes,contentType,meta:{cik,name,http_status:res.status}},budget);
  return {bytes,doc:{name,sha256:stored.sha256,path:stored.path}};
 };
 return {
  /** coverFrom: also fetch every files[] page whose filingTo >= coverFrom ('YYYY-MM-DD'); null/undefined: main document only. */
  async fetch(cik:string,opts:{coverFrom?:string|null}={}):Promise<SubmissionsSnapshot>{
   const c=normalizeCik(cik);
   const fetchedAt=clock().toISOString();
   const main=await get(submissionsUrl(c),c,'main');
   const parsed=parseStored(main.doc,()=>{const x=parseSubmissions(new TextDecoder().decode(main.bytes));if(x.cik!==c)throw invalid(`cik ${x.cik} != ${c}`);return x;});
   const from=opts.coverFrom??null;
   const wanted=from===null?[]:parsed.files.filter(f=>f.filingTo===null||f.filingTo>=from);
   const pages:StoredDoc[]=[];
   const filings=[...parsed.filings];
   // An accession repeated across pages is kept once only when the copies agree; a copy with a different filingDate/acceptanceDateTime is KEPT so consumers can see the conflict (additive: plan 3 Task 12).
   const sig=(f:SubmissionFiling)=>`${f.accessionNumber}|${f.filingDate}|${f.acceptanceDateTime??''}`;
   const seen=new Set(filings.map(sig));
   for(const f of wanted){
    const p=await get(`${SEC_SUBMISSIONS_BASE}${f.name}`,c,f.name);
    pages.push(p.doc);
    for(const x of parseStored(p.doc,()=>parseSubmissionsPage(new TextDecoder().decode(p.bytes),f.name)))if(!seen.has(sig(x))){seen.add(sig(x));filings.push(x);}
   }
   return {cik:c,fetchedAt,main:main.doc,pages,parsed:{...parsed,filings},complete:wanted.length===parsed.files.length};
  },
 };
}

export const fetchSubmissions=(cik:string,deps:FetchSubmissionsDeps,opts:{coverFrom?:string|null}={})=>submissionsClient(deps).fetch(cik,opts);
/** Accessions whose kept copies disagree on filingDate or acceptanceDateTime. */
export function conflictingAccessions(filings:readonly SubmissionFiling[]):Set<string>{
 const first=new Map<string,SubmissionFiling>();const bad=new Set<string>();
 for(const f of filings){const s=first.get(f.accessionNumber);if(!s)first.set(f.accessionNumber,f);else if(s.filingDate!==f.filingDate||s.acceptanceDateTime!==f.acceptanceDateTime)bad.add(f.accessionNumber);}
 return bad;
}
/** accession → filing; an accession with conflicting copies is left out (never last-wins). */
export function filingsByAccession(parsed:ParsedSubmissions):Map<string,SubmissionFiling>{
 const bad=conflictingAccessions(parsed.filings);
 const m=new Map<string,SubmissionFiling>();
 for(const f of parsed.filings)if(!bad.has(f.accessionNumber)&&!m.has(f.accessionNumber))m.set(f.accessionNumber,f);
 return m;
}

export const EVIDENCE_FORMS:Readonly<Record<string,{suggested_op:'backdate_window'|'close_security';note:string}>>={
 '8-A12B':{suggested_op:'backdate_window',note:'12(b) 交易所注册；所指证券类别与生效日须核对原文'},
 '8-A12G':{suggested_op:'backdate_window',note:'12(g) 注册，非交易所上市'},
 '25':{suggested_op:'close_security',note:'Rule 12d2-2(d) 下退市于申报后 10 日生效，须核对原文所指类别'},
 '25-NSE':{suggested_op:'close_security',note:'Rule 12d2-2(d) 下退市于申报后 10 日生效，须核对原文所指类别'},
};

/** One evidence_only claim per 8-A/25 filing; value = accession number (Part B contract issue 6). */
export function submissionsEvidenceClaims(issuerId:string,snap:SubmissionsSnapshot,asOf:string):ClaimInput[]{
 const shaOf=(page:string)=>page==='recent'?snap.main.sha256:snap.pages.find(p=>p.name===page)?.sha256??null;
 const done=new Set<string>();
 return snap.parsed.filings.flatMap(f=>{
  if(done.has(f.accessionNumber))return [];   // conflicting copies of one accession: one claim
  const rule=Object.prototype.hasOwnProperty.call(EVIDENCE_FORMS,f.form)?EVIDENCE_FORMS[f.form]:null;
  const sha=rule?shaOf(f.page):null;
  if(!rule||!sha)return [];
  done.add(f.accessionNumber);
  const evidence:ClaimEvidence={source:'sec_submissions',as_of:asOf,evidence_sha256:sha,locator:`${f.page}#accessionNumber=${f.accessionNumber}`,note:rule.note};
  return [{issuer_id:issuerId,id_type:'ticker' as const,value:f.accessionNumber,source:'sec_submissions',op:'evidence_only' as const,detail:{
   schema:'claim/1' as const,evidence_kind:'filing_form' as const,target:{issuer_id:issuerId},
   params:{suggested_op:rule.suggested_op,accession:f.accessionNumber,form:f.form,filing_date:f.filingDate,note:rule.note},evidence,sources:[evidence],
  }}];
 });
}

exec
/bin/zsh -lc "cat src/lib/dq/batches.ts; rg -n 'upstream_accession|upstream.*find|upstream.us' src/lib/dq/calendar.ts; find . -name '*AGENTS*' -not -path './node_modules/*'; ls .claude; sed -n '635,690p' supabase/migrations/20261107090000_identifiers_and_dq.sql; rg -n 'replaceExpectations\\(' src scripts | head -25; cat package.json | grep -A15 scripts" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 767ms:
// Ingest receipts (spec §5.1 ingest_batches). Every producer starts a batch, writes rows that
// reference batch_id, and finishes with counts + errors. Status is derived from counts and
// errors so dashboards never guess: success = no failures and no non-informational errors;
// quarantined rows and informational entries (INFO_CODES) do not degrade status. The row is written with finished_at:null so the DB invariant
// (status='running' iff finished_at is null) holds. Only a running batch can be finished.
import {randomUUID} from 'node:crypto';
import type {TableClient} from '../db/table-client';

export type BatchStatus='running'|'success'|'partial'|'failed'|'rejected';
export type TriggeredBy='cron'|'manual'|'script';
/**
 * Receipt counters, all non-negative safe integers:
 * - fetched: rows read from the source;
 * - inserted: new rows written; duplicates: rows already present unchanged (no write);
 * - versioned: rows that superseded an existing version; quarantined: rows parked in dq_quarantine;
 * - failed: rows that could not be processed at all.
 * inserted+duplicates+versioned+quarantined+failed is the number of rows with an outcome; it may
 * be below fetched (rows filtered out by design), but fetched > 0 with no outcome at all means the
 * producer lost track of its rows and the batch finishes as failed ('unaccounted').
 */
export interface BatchCounts{fetched:number;inserted:number;duplicates:number;versioned:number;quarantined:number;failed:number}
export interface BatchError{code:string;key?:string;message?:string}
export interface StartBatchInput{producer:string;dataset:string;toolVersions?:Record<string,string>;codeVersion?:string;triggeredBy?:TriggeredBy}

const TRIGGERS:readonly TriggeredBy[]=['cron','manual','script'];
export const emptyCounts=():BatchCounts=>({fetched:0,inserted:0,duplicates:0,versioned:0,quarantined:0,failed:0});

const COUNTERS:readonly (keyof BatchCounts)[]=['fetched','inserted','duplicates','versioned','quarantined','failed'];
const MAX_ERRORS=100,MAX_MESSAGE=500;

function assertCounts(counts:BatchCounts):void{
 if(!counts||COUNTERS.some(k=>!Number.isSafeInteger(counts[k])||counts[k]<0))throw new Error('invalid_counts');
}

/** First MAX_ERRORS errors with messages capped, plus a `truncated` marker for the rest. */
function capErrors(errors:BatchError[]):BatchError[]{
 const kept=errors.slice(0,MAX_ERRORS).map(e=>e.message!==undefined&&e.message.length>MAX_MESSAGE?{...e,message:e.message.slice(0,MAX_MESSAGE)}:e);
 return errors.length>MAX_ERRORS?[...kept,{code:'truncated',message:`${errors.length-MAX_ERRORS} more`}]:kept;
}

/**
 * Error codes that only inform the receipt reader: `skipped_summary` (input rows left out by
 * expected filtering, e.g. not in the universe or not promotable yet) and `relink` (a research
 * entity re-pointed to another issuer), `rule_warning_summary` (one per warning rule per batch, facts spec §7.2),
 * `coverage_summary` (Tushare coverage summary, §6.3), `deadline_hit` (issuers not started after the deadline, §6.1) and `claims_summary` (identifier claims filed per op, data foundation 3 §4.2.2/§8). They stay in `errors` but never make a batch partial or
 * failed. `rejected_summary` (malformed or invalid input rows) is deliberately NOT informational:
 * it makes the batch partial, or failed when nothing landed.
 */
export const INFO_CODES=['skipped_summary','relink','rule_warning_summary','coverage_summary','deadline_hit','claims_summary'] as const;
export type InfoCode=typeof INFO_CODES[number];
export const isInfoError=(e:BatchError)=>(INFO_CODES as readonly string[]).includes(e.code);

const accounted=(c:BatchCounts)=>c.inserted+c.duplicates+c.versioned+c.quarantined+c.failed;
export const UNACCOUNTED_ERROR:BatchError={code:'unaccounted',message:'fetched rows without outcomes'};

/**
 * Pure status: rejected flag wins; fetched rows with no outcome → failed; any failure or
 * non-informational error → partial if something landed, else failed. Errors whose code is in
 * INFO_CODES are ignored here (a run whose only entries are skips/relinks is a success).
 */
export function batchStatusFromCounts(counts:BatchCounts,errors:BatchError[],flags:{rejected?:boolean}={}):BatchStatus{
 assertCounts(counts);
 if(flags.rejected)return 'rejected';
 if(counts.fetched>0&&accounted(counts)===0)return 'failed';
 const landed=counts.inserted+counts.duplicates+counts.versioned+counts.quarantined;
 if(counts.failed>0||errors.some(e=>!isInfoError(e)))return landed>0?'partial':'failed';
 return 'success';
}

export async function startBatch(client:TableClient,input:StartBatchInput):Promise<{batchId:string}>{
 const ok=(s:unknown)=>typeof s==='string'&&s.length>=1&&s.length<=64;
 const trigger=input.triggeredBy??'script';
 if(!ok(input.producer)||!ok(input.dataset)||!TRIGGERS.includes(trigger))throw new Error('invalid_batch');
 const batchId=randomUUID();
 await client.insert('ingest_batches',{
  batch_id:batchId,producer:input.producer,dataset:input.dataset,status:'running',
  started_at:new Date().toISOString(),finished_at:null,counts:emptyCounts(),errors:[],
  tool_versions:input.toolVersions??{},code_version:input.codeVersion??null,triggered_by:trigger,
 });
 return {batchId};
}

/**
 * Finishes a running batch. An unaccounted receipt (fetched > 0, no outcomes) finishes as failed
 * with an appended {code:'unaccounted'} error. Throws invalid_now when `now` or the stored
 * started_at is not a valid date, rather than writing a NaN finished_at.
 */
export async function finishBatch(client:TableClient,batchId:string,result:{counts:BatchCounts;errors:BatchError[];rejected?:boolean},now=new Date()):Promise<BatchStatus>{
 const status=batchStatusFromCounts(result.counts,result.errors,{rejected:result.rejected});
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw new Error('invalid_now');
 const unaccounted=!result.rejected&&result.counts.fetched>0&&accounted(result.counts)===0;
 const errors=unaccounted?[UNACCOUNTED_ERROR,...result.errors]:result.errors;
 const [batch]=await client.select('ingest_batches',{batch_id:batchId},{limit:1});
 if(!batch||batch.status!=='running')throw new Error('batch_not_running');
 const startedAt=Date.parse(String(batch.started_at));
 if(!Number.isFinite(startedAt))throw new Error('invalid_now');
 // Never before started_at (DB check finished_after_started), even under clock skew.
 const finishedAt=new Date(Math.max(now.getTime(),startedAt));
 // Matching on status='running' keeps a concurrent finish from being overwritten.
 const n=await client.update('ingest_batches',{batch_id:batchId,status:'running'},{status,counts:result.counts,errors:capErrors(errors),finished_at:finishedAt.toISOString()});
 if(n!==1)throw new Error('batch_not_running');
 return status;
}
166: const usEntries=upstream.lookup==='ok'?upstream.us??[]:[];
215:   if(up){state='filed_not_ingested';upstreamFiled=up.date;if(up.accession)detail.upstream_accession=up.accession;}
agents
launch.json
scratch
-- replaced atomically and it becomes done. Rows carry the ExpectationRow columns (src/lib/dq/calendar.ts);
-- computed_at and batch_id are set here. p_profile (Task 18a review): the issuer's issuer_filing_profiles
-- row is upserted in the same transaction, only after the token/lease/member checks pass, so a stale
-- worker can never write a profile; null leaves the stored profile untouched.
drop function if exists public.replace_filing_expectations(uuid, text, jsonb, jsonb);
create or replace function public.replace_filing_expectations(p_issuer uuid, p_market text, p_rows jsonb, p_pass_token jsonb, p_profile jsonb default null)
returns int language plpgsql security definer set search_path = public as $$
declare p public.dq_calendar_passes; m public.dq_calendar_pass_members; n int;
begin
  p := public.dq_calendar_lock_pass(p_pass_token);
  if p_market is distinct from p.market then raise exception 'fence_failed' using errcode = 'P0001'; end if;
  select * into m from public.dq_calendar_pass_members where market = p.market and pass_id = p.pass_id and issuer_id = p_issuer for update;
  if not found or not (m.state = 'pending' or (m.state = 'failed' and m.attempts < 3)) then
    raise exception 'member_not_claimable' using errcode = 'P0001';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array'
     or exists (select 1 from jsonb_array_elements(p_rows) x
                where jsonb_typeof(x) <> 'object'
                   or (x ? 'issuer_id' and x ->> 'issuer_id' is distinct from p_issuer::text)
                   or (x ? 'market' and x ->> 'market' is distinct from p_market)) then
    raise exception 'invalid_rows' using errcode = '22023';
  end if;
  begin
    delete from public.dq_filing_expectations where issuer_id = p_issuer and market = p_market;
    insert into public.dq_filing_expectations(issuer_id, market, report_kind, period_end, period_end_estimated, deadline_state,
      due_date, due_rule, expected_date, upstream_lookup, upstream_filed_date, disclosure_state, received_filing_id, received_date,
      profile_as_of, detail, computed_at, batch_id)
    select p_issuer, p_market, x ->> 'report_kind', (x ->> 'period_end')::date, coalesce((x ->> 'period_end_estimated')::boolean, false),
      x ->> 'deadline_state', (x ->> 'due_date')::date, x ->> 'due_rule', (x ->> 'expected_date')::date, x ->> 'upstream_lookup',
      (x ->> 'upstream_filed_date')::date, x ->> 'disclosure_state', (x ->> 'received_filing_id')::uuid, (x ->> 'received_date')::date,
      (x ->> 'profile_as_of')::date, coalesce(x -> 'detail', '{}'::jsonb), clock_timestamp(), p.claimed_by
    from jsonb_array_elements(p_rows) x;
    get diagnostics n = row_count;
    if p_profile is not null then
      if jsonb_typeof(p_profile) <> 'object'
         or (p_profile ? 'issuer_id' and p_profile ->> 'issuer_id' is distinct from p_issuer::text)
         or (p_profile ? 'market' and p_profile ->> 'market' is distinct from p_market) then
        raise exception 'invalid_rows' using errcode = '22023';
      end if;
      insert into public.issuer_filing_profiles(issuer_id, market, category_raw_current, regime, fiscal_year_end, week52_pattern, source, source_sha256, as_of, updated_at)
      values (p_issuer, p_market, p_profile ->> 'category_raw_current', p_profile ->> 'regime', p_profile ->> 'fiscal_year_end',
              coalesce((p_profile ->> 'week52_pattern')::boolean, false), p_profile ->> 'source', p_profile ->> 'source_sha256',
              (p_profile ->> 'as_of')::date, clock_timestamp())
      on conflict (issuer_id, market) do update set category_raw_current = excluded.category_raw_current, regime = excluded.regime,
        fiscal_year_end = excluded.fiscal_year_end, week52_pattern = excluded.week52_pattern, source = excluded.source,
        source_sha256 = excluded.source_sha256, as_of = excluded.as_of, updated_at = excluded.updated_at;
    end if;
  exception when check_violation or not_null_violation or unique_violation or foreign_key_violation
              or invalid_text_representation or invalid_datetime_format or datetime_field_overflow or invalid_parameter_value then
    raise exception 'invalid_rows' using errcode = '22023';
  end;
  update public.dq_calendar_pass_members set state = 'done', done_at = clock_timestamp()
  where market = p.market and pass_id = p.pass_id and issuer_id = p_issuer;
  update public.dq_calendar_passes set claim_until = clock_timestamp() + interval '10 minutes' where market = p.market and pass_id = p.pass_id;
  return n;
end $$;
src/lib/dq/calendar-sync.ts:53: replaceExpectations(issuer:string,market:Market,rows:ExpectationRow[],token:CalendarPassToken,profile:FilingProfile|null):Promise<number>;
src/lib/dq/calendar-sync.ts:243:  try{await deps.passes.replaceExpectations(issuer,market,result.rows,token,result.profile);}
src/lib/dq/calendar-sync.test.ts:35:  async replaceExpectations(issuer,market,rows,t,profile){
src/lib/dq/calendar-sync.test.ts:276:  expect(await db.replaceExpectations(A,'US',[row],tok,profile)).toBe(2);
src/lib/dq/calendar-sync.test.ts:277:  expect(await db.replaceExpectations(A,'US',[row],tok,null)).toBe(2);
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

exec
/bin/zsh -lc "rg -n 'upstream_accession|upstream.us|usHit' src/lib/dq/calendar.ts; sed -n '220,290p' src/lib/dq/calendar.ts; find . -maxdepth 4 \\( -name CLAUDE.md -o -name AGENTS.override.md -o -name AGENTS.md \\); git status --short; nl -ba src/lib/dq/calendar-sync.ts | sed -n '187,200p'" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 76ms:
166: const usEntries=upstream.lookup==='ok'?upstream.us??[]:[];
215:   if(up){state='filed_not_ingested';upstreamFiled=up.date;if(up.accession)detail.upstream_accession=up.accession;}
  }
  rows.push({issuer_id:profile.issuer_id,market:profile.market,report_kind:p.kind,period_end:p.periodEnd,period_end_estimated:p.estimated,
   deadline_state:dl.state,due_date:dl.due,due_rule:dl.rule,expected_date:expected,upstream_lookup:upstream.lookup,upstream_filed_date:upstreamFiled,
   disclosure_state:state,received_filing_id:p.received?.filing_id??null,received_date:p.received?.available_date??null,profile_as_of:profile.as_of,detail});
 }
 return rows;
}
const earliest=(fs:CalendarFiling[])=>[...fs].sort((a,b)=>a.available_date.localeCompare(b.available_date)||a.filing_id.localeCompare(b.filing_id))[0]??null;
const earliestEntry=(es:UsUpstreamEntry[])=>{const e=[...es].sort((a,b)=>a.filingDate.localeCompare(b.filingDate))[0];return e?{date:e.filingDate,accession:e.accessionNumber}:null;};
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-MJrR0lZM' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-62Kt3NtV' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/18a-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/18a-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/18a-review.md
   187	 const manifest=view?(view.pages??[{name:'recent',sha256:view.sha256}]):null;
   188	 rows=rows.map(r=>{
   189	  const hit=typeof r.detail.upstream_accession==='string'?pageOf.get(r.detail.upstream_accession):undefined;
   190	  const cite=hit&&hit.pageSha256?{upstream_sha256:hit.pageSha256,upstream_page:hit.page}:upstream.sha256?{upstream_sha256:upstream.sha256,...(manifest?{upstream_page:manifest[0]?.name??'recent'}:{})}:{};
   191	  return {...r,detail:{...r.detail,display:shown,...cite,...(manifest?{upstream_pages:manifest}:{}),...(scheduleReason?{schedule_unavailable:scheduleReason}:{})}};
   192	 });
   193	 return {profile:fresh,rows,upstreamUnavailable:rows.some(r=>r.upstream_lookup==='unavailable'),noProfile:false,noFye:profile.fiscal_year_end===null,noCategory:rows.some(r=>r.detail.no_category===true),errors,scheduleReason};
   194	}
   195	
   196	/**
   197	 * Any throw after startBatch (claim RPC, member-list read, failMember/finishPass storage errors, freshness
   198	 * write) must not leave the batch 'running': the error is recorded as run_aborted, the batch is finished
   199	 * (best effort: the storage that failed may be the batch table itself) and the error rethrown. The pass is
   200	 * never finished on an infrastructure error — it stays leased/resumable and the next run takes it over.

codex
The changes largely address their intended failure modes, but the new evidence lookup can associate a calendar result with the wrong SEC page when conflicting accession copies exist.

Review comment:

- [P2] Preserve the selected filing when resolving its evidence page — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/calendar-sync.ts:186-190
  When SEC pages contain conflicting copies of an accession, `submissionsClient` deliberately retains both entries. This map keeps the last copy, whereas `computeExpectations` selects the earliest filing date. Consequently, a row can cite a historical page whose filing date differs from its `upstream_filed_date`, undermining the new per-page evidence tracking. Carry the selected entry's page through computation, or resolve evidence using the selected accession and filing date rather than accession alone.
The changes largely address their intended failure modes, but the new evidence lookup can associate a calendar result with the wrong SEC page when conflicting accession copies exist.

Review comment:

- [P2] Preserve the selected filing when resolving its evidence page — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/calendar-sync.ts:186-190
  When SEC pages contain conflicting copies of an accession, `submissionsClient` deliberately retains both entries. This map keeps the last copy, whereas `computeExpectations` selects the earliest filing date. Consequently, a row can cite a historical page whose filing date differs from its `upstream_filed_date`, undermining the new per-page evidence tracking. Carry the selected entry's page through computation, or resolve evidence using the selected accession and filing date rather than accession alone.

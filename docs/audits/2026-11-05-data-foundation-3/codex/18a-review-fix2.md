OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b396-f14e-7441-a014-c28a89074dd0
--------
user
commit aec0f18
2026-11-07T01:19:38.289490Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when AuthRequired(AuthRequiredError { www_authenticate_header: "Bearer realm=\"OAuth\", resource_metadata=\"https://mcp.notion.com/.well-known/oauth-protected-resource/mcp\", scope=\"default\"" })
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline aec0f18; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 2266ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-QepyJ6Xh' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-IHH8EXaT' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/18a-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/18a-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/18a-review-fix2.md
?? docs/audits/2026-11-05-data-foundation-3/codex/18a-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-ZBgHcOVJ' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-uZuLqtBb' (errno=Operation not permitted)
aec0f186 fix(dq): calendar evidence page resolved by (accession, filingDate) of the selected upstream entry
 src/lib/dq/calendar-sync.test.ts | 12 ++++++++++++
 src/lib/dq/calendar-sync.ts      |  6 ++++--
 2 files changed, 16 insertions(+), 2 deletions(-)

exec
/bin/zsh -lc 'pwd; for d in /Volumes /Volumes/AIMATE_WORK /Volumes/AIMATE_WORK/Developer /Volumes/AIMATE_WORK/Developer/CodeX /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees; do for f in AGENTS.override.md AGENTS.md; do [ ! -f "$d/$f" ] || { echo "$d/$f"; cat "$d/$f"; }; done; done; ls -a; git show aec0f18 --; cat src/lib/dq/calendar-sync.ts; cat src/lib/dq/calendar-sync.test.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>.
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
reports
scripts
skills
src
supabase
tailwind.config.ts
tsconfig.json
tsconfig.tsbuildinfo
vendor
vercel.json
vitest.config.ts
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-Fo6xjwuR' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-H26W3b7U' (errno=Operation not permitted)
commit aec0f186a373a0908c3757ae26c0b2854fddb3df
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 17:19:24 2026 -0800

    fix(dq): calendar evidence page resolved by (accession, filingDate) of the selected upstream entry
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/dq/calendar-sync.test.ts b/src/lib/dq/calendar-sync.test.ts
index 0efefeac..68e90587 100644
--- a/src/lib/dq/calendar-sync.test.ts
+++ b/src/lib/dq/calendar-sync.test.ts
@@ -250,6 +250,18 @@ describe('review fixes (Task 18a)',()=>{
   expect(recent.detail).toMatchObject({upstream_sha256:'sub-sha',upstream_page:'recent',upstream_pages:pages});
   expect(rows.find(x=>x.disclosure_state==='pending')!.detail).toMatchObject({upstream_sha256:'sub-sha',upstream_pages:pages});
  });
+ it('conflicting copies of one accession on two pages: the row cites the page whose filingDate is the selected upstream_filed_date',async()=>{
+  const v=view();
+  const k=v.entries[1];   // 10-K for 2025-12-31, filed 2026-02-20
+  const early={...k,filingDate:'2026-02-18',page:'old-page.json',pageSha256:'old-sha'};
+  const late={...k,page:'recent',pageSha256:'sub-sha'};
+  const pages=[{name:'recent',sha256:'sub-sha'},{name:'old-page.json',sha256:'old-sha'}];
+  const h=await harness({members:[A],submissions:async()=>({...v,entries:[v.entries[0],early,late],pages})});
+  await runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'});
+  const row=rowsOf(h.tables,A).find(x=>x.period_end==='2025-12-31')!;
+  expect(row.upstream_filed_date).toBe('2026-02-18');   // the earliest copy is selected
+  expect(row.detail).toMatchObject({upstream_page:'old-page.json',upstream_sha256:'old-sha'});
+ });
  it('a CN raw-store failure is a real error: member failed (retryable), raw_upload_failed, never success',async()=>{
   const h=await harness({market:'CN',members:[C],disclosure:async()=>({bytes:new Uint8Array([1]),sha256:'x',httpStatus:200,requestId:null,code:0,msg:'',fields:[],items:[],hasMore:false})});
   h.deps.raw={...h.raw,put:async()=>{throw new RawStoreError('raw_upload_failed','503');}};
diff --git a/src/lib/dq/calendar-sync.ts b/src/lib/dq/calendar-sync.ts
index 52ad882d..5909fcba 100644
--- a/src/lib/dq/calendar-sync.ts
+++ b/src/lib/dq/calendar-sync.ts
@@ -183,10 +183,12 @@ async function computeMember(deps:CalendarSyncDeps,market:Market,issuerId:string
  if(upstream.lookup==='ok'&&market==='US')rows=applyUpstreamCoverage(rows,upstream.us??[]);
  const shown=await display(deps.tables,issuerId,scope,market,today);
  // US: a positive-evidence row cites the submissions page that holds its entry (historical pages have their own bytes); the manifest lists every page used
- const pageOf=new Map((view?.entries??[]).map(e=>[e.accessionNumber,e]));
+ // keyed by (accession, filingDate): conflicting copies of one accession can sit on different pages and the selected copy is the one whose date is upstream_filed_date
+ const pageOf=new Map<string,SubmissionsView['entries'][number]>();
+ for(const e of view?.entries??[]){const k=`${e.accessionNumber}|${e.filingDate}`;if(!pageOf.has(k))pageOf.set(k,e);}
  const manifest=view?(view.pages??[{name:'recent',sha256:view.sha256}]):null;
  rows=rows.map(r=>{
-  const hit=typeof r.detail.upstream_accession==='string'?pageOf.get(r.detail.upstream_accession):undefined;
+  const hit=typeof r.detail.upstream_accession==='string'?pageOf.get(`${r.detail.upstream_accession}|${r.upstream_filed_date}`):undefined;
   const cite=hit&&hit.pageSha256?{upstream_sha256:hit.pageSha256,upstream_page:hit.page}:upstream.sha256?{upstream_sha256:upstream.sha256,...(manifest?{upstream_page:manifest[0]?.name??'recent'}:{})}:{};
   return {...r,detail:{...r.detail,display:shown,...cite,...(manifest?{upstream_pages:manifest}:{}),...(scheduleReason?{schedule_unavailable:scheduleReason}:{})}};
  });
// src/lib/dq/calendar-sync.ts
// Filing-calendar writer (spec §6.2; pass protocol T3/U1 via the migration-one functions). One
// ingest_batches row per run (producer filing-calendar, dataset dq.calendar.us|cn). A run claims the
// market's pass (claim_calendar_pass: a new pass freezes its members; an expired lease is taken over;
// a lease held by another worker → this run does nothing, skipped_summary(pass_claimed)). Within the
// budget it processes pending members, then failed members with attempts < 3, in issuer_id order:
// inputs (profile + issuer_filer_categories + filingsForCalendar + upstream list) → computeExpectations →
// replace_filing_expectations (atomic: rows replaced + the issuer profile upserted under the same fence + member done;
// a stale worker therefore writes neither rows nor profile).
// A member whose inputs fail → fail_calendar_member. Any fence_failed stops this worker at once.
// With nothing left to process the pass is settled by finish_calendar_pass (from persisted state only)
// and freshness is recorded: complete → ok, complete_with_failures or a pass older than 2 days → not ok.
// Upstream: US = SEC submissions (raw kept by the fetcher, Task 6); CN = Tushare disclosure_date via
// tushareCallRaw, response bytes into reconcile-raw (T15). Until the disclosure_date semantics are
// verified against a real response (CN_DISCLOSURE_VERIFIED), CN rows keep upstream_lookup='unavailable'.
import type {SupabaseClient} from '@supabase/supabase-js';
import {selectAll} from '../db/table-client';
import type {Row,TableClient} from '../db/table-client';
import {isCurrentSecurity} from '../entities/resolve';
import {TushareError} from '../data/sources/tushare';
import type {TushareRaw} from '../data/sources/tushare';
import type {Budget,FactsDb,Market} from '../facts/types';
import {emptyCounts,finishBatch,startBatch} from './batches';
import type {BatchCounts,BatchError,BatchStatus,TriggeredBy} from './batches';
import {recordAttempt} from './freshness';
import {DATASETS} from './datasets';
import {RawStoreError} from './raw-store';
import type {RawStore} from './raw-store';
import {CALENDAR_RULES_VERSION,computeExpectations,filingsWindowStart} from './calendar';
import type {CalendarUpstream,CnScheduleRow,ExpectationRow,FilerCategoryRow,FilingProfile,UsUpstreamEntry} from './calendar';
import type {SubmissionsView} from './filer-categories';

/** Flip only after docs/audits/2026-11-05-data-foundation-3/verification.md records a real disclosure_date response check (spec §6.1 T15). */
export const CN_DISCLOSURE_VERIFIED=false;
export const DISCLOSURE_FIELDS='ts_code,ann_date,end_date,pre_date,actual_date,modify_date';
export const MIN_MEMBER_MS=60_000;
export const MAX_MEMBER_ATTEMPTS=3;
export const PASS_MAX_AGE_MS=2*86_400_000;

// ---------------------------------------------------------------- pass functions (C5)
export interface CalendarPassToken{market:Market;pass_id:string;batch_id:string}
export type CalendarPassErrorCode='fence_failed'|'pass_incomplete'|'member_not_claimable'|'invalid_rows'|'unknown';
export class CalendarPassError extends Error{constructor(public readonly code:CalendarPassErrorCode,message?:string){super(message??code);this.name='CalendarPassError';}}
const PASS_CODES:readonly CalendarPassErrorCode[]=['fence_failed','pass_incomplete','member_not_claimable','invalid_rows'];
/** SQL raises the code as the message (C5); PostgREST and node-postgres both surface it as error.message. */
export function toCalendarPassError(e:{message?:string}):CalendarPassError{
 const head=(e.message??'').split(/[\s:]/,1)[0];
 return new CalendarPassError((PASS_CODES as readonly string[]).includes(head)?head as CalendarPassErrorCode:'unknown',e.message);
}
export interface CalendarPassDb{
 claimPass(market:Market,batchId:string):Promise<CalendarPassToken|null>;
 /** `profile` is upserted in the same fenced transaction (replace_filing_expectations.p_profile); null leaves the stored profile untouched. */
 replaceExpectations(issuer:string,market:Market,rows:ExpectationRow[],token:CalendarPassToken,profile:FilingProfile|null):Promise<number>;
 failMember(token:CalendarPassToken,issuer:string,error:string):Promise<void>;
 finishPass(token:CalendarPassToken):Promise<'complete'|'complete_with_failures'>;
}
/** p_rows payload: every dq_filing_expectations column except issuer_id/market (the function's own args) and computed_at/batch_id (set by the function from now() and the token). */
export const expectationArgs=(rows:ExpectationRow[])=>rows.map(({issuer_id:_i,market:_m,...r})=>r);
/** p_profile payload: the issuer_filing_profiles columns except issuer_id/market (the function's own args). */
export const profileArgs=(p:FilingProfile|null)=>p?(({issuer_id:_i,market:_m,...r})=>r)(p):null;
export function supabaseCalendarPassDb(client:SupabaseClient):CalendarPassDb{
 const c=client as unknown as {rpc:(fn:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{message?:string}|null}>};
 const call=async<T>(fn:string,args:Record<string,unknown>):Promise<T>=>{const {data,error}=await c.rpc(fn,args);if(error)throw toCalendarPassError(error);return data as T;};
 return {
  claimPass:(market,batch)=>call<CalendarPassToken|null>('claim_calendar_pass',{p_market:market,p_batch:batch}),
  replaceExpectations:(issuer,market,rows,token,profile)=>call<number>('replace_filing_expectations',{p_issuer:issuer,p_market:market,p_rows:expectationArgs(rows),p_pass_token:token,p_profile:profileArgs(profile)}).then(Number),
  failMember:async(token,issuer,error)=>{await call('fail_calendar_member',{p_pass_token:token,p_issuer:issuer,p_error:error.slice(0,500)});},
  finishPass:(token)=>call<'complete'|'complete_with_failures'>('finish_calendar_pass',{p_pass_token:token}),
 };
}

// ---------------------------------------------------------------- deps and receipt
export interface CalendarSyncDeps{
 tables:TableClient;db:Pick<FactsDb,'filingsForCalendar'>;passes:CalendarPassDb;raw:RawStore;
 /** US upstream + profile source; the production fetcher (Task 6 fetchSubmissions) stores the raw JSON and pages. */
 submissions:(cik10:string,b:Budget)=>Promise<SubmissionsView>;
 /** CN upstream: tushareCallRaw('disclosure_date', {ts_code}, DISCLOSURE_FIELDS). */
 disclosureDate:(tsCode:string,b:Budget)=>Promise<TushareRaw>;
 now:()=>Date;budget:Budget;codeVersion:string|null;
}
export interface CalendarSyncOptions{market:Market;limit:number;triggeredBy:TriggeredBy}
export interface CalendarDetail{pass_id:string|null;issuers_done:number;issuers_failed:number;rows:number;by_deadline_state:Record<string,number>;by_disclosure_state:Record<string,number>;upstream_unavailable:number;no_fiscal_year_end:number;no_category:number;no_profile:number}
export interface CalendarReceipt{batchId:string;status:BatchStatus;passId:string|null;passStatus:'running'|'complete'|'complete_with_failures'|null;counts:BatchCounts;errors:BatchError[];detail:CalendarDetail}

const iso=(d:Date)=>d.toISOString().slice(0,10);
const ymd=(s:unknown)=>typeof s==='string'&&/^\d{8}$/.test(s)?`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`:null;
const bump=(m:Record<string,number>,k:string)=>{m[k]=(m[k]??0)+1;};
const errText=(e:unknown)=>(e instanceof Error?e.message:String(e)).slice(0,200);

/** MMDD against a leap-year calendar (0229 allowed; 0231 / 0431 are not days). */
const validMmdd=(s:string|null):s is string=>{
 if(s===null||!/^\d{4}$/.test(s))return false;
 const m=+s.slice(0,2),d=+s.slice(2);
 return m>=1&&m<=12&&d>=1&&d<=new Date(Date.UTC(2000,m,0)).getUTCDate();   // 2000 is a leap year
};
/** Profile from SEC submissions: regime = latest original annual form; week52 when the fiscal year end is not a month end or a recent annual period end is not one. */
export function profileFromSubmissions(issuerId:string,v:SubmissionsView,today:string):FilingProfile|null{
 const annual=v.entries.filter(e=>e.form==='10-K'||e.form==='20-F'||e.form==='40-F').sort((a,b)=>b.filingDate.localeCompare(a.filingDate));
 if(annual.length===0)return null;
 const fye=validMmdd(v.fiscalYearEnd)?v.fiscalYearEnd:null;
 const lastDay=(mm:number)=>new Date(Date.UTC(2001,mm,0)).getUTCDate();   // 2001: Feb 28 (29 checked below)
 const fyeIsMonthEnd=fye===null||+fye.slice(2)===lastDay(+fye.slice(0,2))||fye==='0229';
 const reportEndsOff=annual.slice(0,3).some(e=>{if(!e.reportDate)return false;const d=new Date(`${e.reportDate}T00:00:00Z`);return new Date(d.getTime()+86_400_000).getUTCDate()!==1;});
 return {issuer_id:issuerId,market:'US',category_raw_current:v.category,regime:annual[0].form as FilingProfile['regime'],fiscal_year_end:fye,week52_pattern:!fyeIsMonthEnd||reportEndsOff,source:'sec_submissions',source_sha256:v.sha256,as_of:today};
}
export const cnProfile=(issuerId:string,today:string):FilingProfile=>({issuer_id:issuerId,market:'CN',category_raw_current:null,regime:'cn',fiscal_year_end:'1231',week52_pattern:false,source:'cn_statutory',source_sha256:null,as_of:today});
const profileFromRow=(r:Row):FilingProfile=>({issuer_id:String(r.issuer_id),market:r.market as Market,category_raw_current:r.category_raw_current==null?null:String(r.category_raw_current),regime:r.regime as FilingProfile['regime'],fiscal_year_end:r.fiscal_year_end==null?null:String(r.fiscal_year_end),week52_pattern:r.week52_pattern===true,source:String(r.source),source_sha256:r.source_sha256==null?null:String(r.source_sha256),as_of:String(r.as_of)});
const categoryFromRow=(r:Row):FilerCategoryRow=>({issuer_id:String(r.issuer_id),fiscal_year:Number(r.fiscal_year),acceleration:r.acceleration as FilerCategoryRow['acceleration'],smaller_reporting:r.smaller_reporting==null?null:r.smaller_reporting===true,category_raw:String(r.category_raw),source:'ixbrl_dei',accession:String(r.accession),evidence_sha256:String(r.evidence_sha256),as_of:String(r.as_of)});
/** disclosure_date rows from a raw response (field order from the response, dates → ISO). */
export function parseDisclosureDate(raw:Pick<TushareRaw,'fields'|'items'>):CnScheduleRow[]{
 const at=(name:string)=>raw.fields.indexOf(name);
 const [e,a,p,ac,mo]=['end_date','ann_date','pre_date','actual_date','modify_date'].map(at);
 if(e<0)return [];
 return raw.items.flatMap(it=>{const end=ymd(it[e]);return end?[{end_date:end,ann_date:a<0?null:ymd(it[a]),pre_date:p<0?null:ymd(it[p]),actual_date:ac<0?null:ymd(it[ac]),modify_date:mo<0?null:ymd(it[mo])}]:[];});
}

/**
 * Per-period US upstream coverage (plan audit Q1; spec §6.1 "recent 最早条目早于 period_end").
 * The submissions list can prove "nothing filed" for a period only when its earliest entry is before that
 * period's end (every filing for the period comes after the period ends). For each row:
 * - covered (earliest filingDate < period_end) → kept as computed;
 * - positive evidence (received / received_late / filed_not_ingested, i.e. a matching filing or a matching
 *   upstream entry) → kept as computed, whatever the coverage;
 * - otherwise (pending / overdue without coverage) → unknown_upstream, upstream_lookup 'unavailable',
 *   detail.upstream_incomplete=true, detail.upstream_covered_from=earliest filingDate (null for an empty list).
 * Only those rows change; one uncovered old period never rewrites a recent row.
 */
export function applyUpstreamCoverage(rows:ExpectationRow[],entries:readonly UsUpstreamEntry[]):ExpectationRow[]{
 const earliest=entries.map(e=>e.filingDate).sort()[0]??null;
 return rows.map((r):ExpectationRow=>{
  if(earliest!==null&&earliest<r.period_end)return r;
  if(r.disclosure_state!=='pending'&&r.disclosure_state!=='overdue')return r;
  const {estimated_due_passed:_e,...detail}=r.detail;
  return {...r,upstream_lookup:'unavailable',upstream_filed_date:null,disclosure_state:'unknown_upstream',detail:{...detail,upstream_incomplete:true,upstream_covered_from:earliest}};
 });
}

interface MemberResult{profile:FilingProfile|null;rows:ExpectationRow[];upstreamUnavailable:boolean;noProfile:boolean;noFye:boolean;noCategory:boolean;errors:BatchError[];scheduleReason?:string}
async function display(tables:TableClient,issuerId:string,scope:Row|undefined,market:Market,today:string):Promise<{ticker:string|null;name:string|null}>{
 const [issuer]=await tables.select('issuers',{issuer_id:issuerId},{limit:1});
 let ticker:string|null=market==='CN'?(scope?.fetch_key==null?null:String(scope.fetch_key)):null;
 if(market==='US'){const secs=(await selectAll(tables,'issuer_securities',{issuer_id:issuerId},'ticker')).filter(r=>isCurrentSecurity(r,today));ticker=String((secs.find(r=>r.is_primary===true)??secs[0])?.ticker??'')||null;}
 const name=issuer?(issuer.canonical_name_en??issuer.canonical_name_zh??null) as string|null:null;
 return {ticker,name};
}

async function computeMember(deps:CalendarSyncDeps,market:Market,issuerId:string,today:string):Promise<MemberResult>{
 const [scope]=await deps.tables.select('fact_sync_scope',{issuer_id:issuerId,market},{limit:1});
 const fetchKey=scope?.fetch_key==null?'':String(scope.fetch_key);
 const errors:BatchError[]=[];
 let profile:FilingProfile|null=null;let upstream:CalendarUpstream;let scheduleReason:string|undefined;
 let fresh:FilingProfile|null=null;   // written with the fenced replace call only when computed from a live fetch (stored profile reuse → null)
 let view:SubmissionsView|null=null;
 if(market==='US'){
  try{if(!/^\d{10}$/.test(fetchKey))throw new Error('no_cik');view=await deps.submissions(fetchKey,deps.budget);}
  catch(e){errors.push({code:'sec_unavailable',key:issuerId,message:errText(e)});}
  if(view){
   profile=profileFromSubmissions(issuerId,view,today);
   fresh=profile;
   upstream={lookup:'ok',us:view.entries.map(e=>({form:e.form,reportDate:e.reportDate,filingDate:e.filingDate,accessionNumber:e.accessionNumber})),sha256:view.sha256};
  }else upstream={lookup:'unavailable'};
  if(!profile){const [stored]=await deps.tables.select('issuer_filing_profiles',{issuer_id:issuerId,market},{limit:1});if(stored)profile=profileFromRow(stored);}
 }else{
  profile=fresh=cnProfile(issuerId,today);
  upstream={lookup:'unavailable'};
  try{
   if(!/^\d{6}\.(SH|SZ|BJ)$/.test(fetchKey))throw new Error('no_ts_code');
   const raw=await deps.disclosureDate(fetchKey,deps.budget);
   if(raw.code!==0)scheduleReason=`api_code_${raw.code}`;
   else{
    // a storage failure is a real error (member failed, retryable), not an informational upstream gap
    const stored=await deps.raw.put({kind:'tushare-disclosure',bytes:raw.bytes,contentType:'application/json',meta:{api:'disclosure_date',ts_code:fetchKey}},deps.budget).catch((e:unknown)=>{throw e instanceof RawStoreError?e:new RawStoreError('raw_upload_failed',errText(e));});
    if(CN_DISCLOSURE_VERIFIED)upstream={lookup:'ok',cn:parseDisclosureDate(raw),sha256:stored.sha256};
    else{upstream={lookup:'unavailable',sha256:stored.sha256};scheduleReason='unverified';}
   }
  }catch(e){if(e instanceof RawStoreError)throw e;scheduleReason=e instanceof TushareError&&e.code===-1?'no_token':e instanceof Error&&(e.message==='no_ts_code')?'no_ts_code':'error';}
 }
 if(!profile)return {profile:null,rows:[],upstreamUnavailable:upstream.lookup==='unavailable',noProfile:true,noFye:false,noCategory:false,errors,scheduleReason};
 const categories=market==='US'?(await selectAll(deps.tables,'issuer_filer_categories',{issuer_id:issuerId},'fiscal_year')).map(categoryFromRow):[];
 const filings=await deps.db.filingsForCalendar(issuerId,market,{fromPeriodEnd:filingsWindowStart(today)});
 let rows=computeExpectations({profile,categories,filings,upstream,today});
 // US: coverage is per expected period (plan audit Q1); positive evidence is never discarded.
 if(upstream.lookup==='ok'&&market==='US')rows=applyUpstreamCoverage(rows,upstream.us??[]);
 const shown=await display(deps.tables,issuerId,scope,market,today);
 // US: a positive-evidence row cites the submissions page that holds its entry (historical pages have their own bytes); the manifest lists every page used
 // keyed by (accession, filingDate): conflicting copies of one accession can sit on different pages and the selected copy is the one whose date is upstream_filed_date
 const pageOf=new Map<string,SubmissionsView['entries'][number]>();
 for(const e of view?.entries??[]){const k=`${e.accessionNumber}|${e.filingDate}`;if(!pageOf.has(k))pageOf.set(k,e);}
 const manifest=view?(view.pages??[{name:'recent',sha256:view.sha256}]):null;
 rows=rows.map(r=>{
  const hit=typeof r.detail.upstream_accession==='string'?pageOf.get(`${r.detail.upstream_accession}|${r.upstream_filed_date}`):undefined;
  const cite=hit&&hit.pageSha256?{upstream_sha256:hit.pageSha256,upstream_page:hit.page}:upstream.sha256?{upstream_sha256:upstream.sha256,...(manifest?{upstream_page:manifest[0]?.name??'recent'}:{})}:{};
  return {...r,detail:{...r.detail,display:shown,...cite,...(manifest?{upstream_pages:manifest}:{}),...(scheduleReason?{schedule_unavailable:scheduleReason}:{})}};
 });
 return {profile:fresh,rows,upstreamUnavailable:rows.some(r=>r.upstream_lookup==='unavailable'),noProfile:false,noFye:profile.fiscal_year_end===null,noCategory:rows.some(r=>r.detail.no_category===true),errors,scheduleReason};
}

/**
 * Any throw after startBatch (claim RPC, member-list read, failMember/finishPass storage errors, freshness
 * write) must not leave the batch 'running': the error is recorded as run_aborted, the batch is finished
 * (best effort: the storage that failed may be the batch table itself) and the error rethrown. The pass is
 * never finished on an infrastructure error — it stays leased/resumable and the next run takes it over.
 */
export async function runCalendarSync(deps:CalendarSyncDeps,opts:CalendarSyncOptions):Promise<CalendarReceipt>{
 const aborted:{counts:BatchCounts;errors:BatchError[];batchId:string|null}={counts:emptyCounts(),errors:[],batchId:null};
 try{return await runCalendarSyncInner(deps,opts,aborted);}
 catch(e){
  if(aborted.batchId){
   aborted.errors.push({code:'run_aborted',message:errText(e)});
   try{await finishBatch(deps.tables,aborted.batchId,{counts:aborted.counts,errors:aborted.errors},deps.now());}catch{/* batch already finished or storage down: the original error wins */}
  }
  throw e;
 }
}
async function runCalendarSyncInner(deps:CalendarSyncDeps,opts:CalendarSyncOptions,shared:{counts:BatchCounts;errors:BatchError[];batchId:string|null}):Promise<CalendarReceipt>{
 const {market}=opts;

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
 }
 return out;
}
// src/lib/dq/calendar-sync.test.ts
import {describe,expect,it} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {TushareError} from '../data/sources/tushare';
import type {TushareRaw} from '../data/sources/tushare';
import type {Budget,CalendarFiling,Market} from '../facts/types';
import {RawStoreError,memoryRawStore} from './raw-store';
import type {ExpectationRow} from './calendar';
import {CalendarPassError,applyUpstreamCoverage,expectationArgs,parseDisclosureDate,previewCalendar,profileFromSubmissions,runCalendarSync,supabaseCalendarPassDb,toCalendarPassError} from './calendar-sync';
import type {CalendarPassDb,CalendarPassToken,CalendarSyncDeps} from './calendar-sync';
import type {SubmissionsView} from './filer-categories';

const A='00000000-0000-4000-8000-0000000000a1',B='00000000-0000-4000-8000-0000000000a2',C='00000000-0000-4000-8000-0000000000a3';
const NOW=new Date('2026-11-05T01:00:00Z');
const budget=(ms=300_000):Budget=>({remainingMs:()=>ms,signal:new AbortController().signal});

/** In-memory model of the four pass functions (same rules as the SQL: one unfinished pass per market, lease, fence on every write). */
function memoryPasses(tables:ReturnType<typeof memoryTableClient>,scope:()=>string[]){
 let leaseValid=true;
 const passes:{market:Market;pass_id:string;claimed_by:string;finished:boolean;status:string}[]=[];
 const fence=(t:CalendarPassToken)=>{const p=passes.find(x=>x.market===t.market&&x.pass_id===t.pass_id);if(!p||p.finished||p.claimed_by!==t.batch_id||!leaseValid)throw new CalendarPassError('fence_failed');return p;};
 const member=async(t:CalendarPassToken,issuer:string)=>(await tables.select('dq_calendar_pass_members',{market:t.market,pass_id:t.pass_id,issuer_id:issuer}))[0];
 const db:CalendarPassDb&{expire():void;holdBy(market:Market,batch:string):Promise<void>;passes:typeof passes}={
  passes,
  expire(){leaseValid=false;},
  async holdBy(market,batch){await db.claimPass(market,batch);},
  async claimPass(market,batch){
   const open=passes.find(p=>p.market===market&&!p.finished);
   if(open){if(leaseValid&&open.claimed_by!==batch)return null;if(!leaseValid){open.claimed_by=batch;leaseValid=true;return {market,pass_id:open.pass_id,batch_id:batch};}return null;}
   const pass_id=`p${passes.length+1}`;passes.push({market,pass_id,claimed_by:batch,finished:false,status:'running'});leaseValid=true;
   await tables.insert('dq_calendar_passes',{market,pass_id,started_at:NOW.toISOString(),finished_at:null,status:'running'});
   for(const issuer_id of scope())await tables.insert('dq_calendar_pass_members',{market,pass_id,issuer_id,state:'pending',attempts:0});
   return {market,pass_id,batch_id:batch};
  },
  async replaceExpectations(issuer,market,rows,t,profile){
   fence(t);const m=await member(t,issuer);
   if(!m||!(m.state==='pending'||(m.state==='failed'&&Number(m.attempts)<3)))throw new CalendarPassError('member_not_claimable');
   // the profile is written in the same fenced call (SQL: replace_filing_expectations.p_profile), never before the fence check
   if(profile)await tables.upsert('issuer_filing_profiles',{...profile,issuer_id:issuer,market},'issuer_id,market');
   for(const r of tables.rows('dq_filing_expectations').filter(r=>r.issuer_id===issuer&&r.market===market))await tables.update('dq_filing_expectations',{issuer_id:issuer,market,report_kind:r.report_kind,period_end:r.period_end},{deleted:true});
   for(const r of rows)await tables.insert('dq_filing_expectations',{...r,batch_id:t.batch_id});
   await tables.update('dq_calendar_pass_members',{market:t.market,pass_id:t.pass_id,issuer_id:issuer},{state:'done'});
   return rows.length;
  },
  async failMember(t,issuer,error){fence(t);const m=await member(t,issuer);await tables.update('dq_calendar_pass_members',{market:t.market,pass_id:t.pass_id,issuer_id:issuer},{state:'failed',attempts:Number(m.attempts)+1,last_error:error});},
  async finishPass(t){
   const p=fence(t);const ms=await tables.select('dq_calendar_pass_members',{market:t.market,pass_id:t.pass_id});
   if(ms.some(m=>m.state==='pending'||(m.state==='failed'&&Number(m.attempts)<3)))throw new CalendarPassError('pass_incomplete');
   p.finished=true;p.status=ms.every(m=>m.state==='done')?'complete':'complete_with_failures';
   await tables.update('dq_calendar_passes',{market:t.market,pass_id:t.pass_id},{status:p.status,finished_at:NOW.toISOString()});
   return p.status as 'complete'|'complete_with_failures';
  },
 };
 return db;
}

const view=(p:Partial<SubmissionsView>={}):SubmissionsView=>({cik10:'0000000001',sha256:'sub-sha',category:'Large accelerated filer',fiscalYearEnd:'1231',entries:[
 {accessionNumber:'0000000001-26-000020',filingDate:'2026-08-04',reportDate:'2026-06-30',form:'10-Q',primaryDocument:'q2.htm',isInlineXBRL:true},
 {accessionNumber:'0000000001-26-000005',filingDate:'2026-02-20',reportDate:'2025-12-31',form:'10-K',primaryDocument:'k.htm',isInlineXBRL:true},
 {accessionNumber:'0000000001-24-000001',filingDate:'2024-01-10',reportDate:'2023-09-30',form:'10-Q',primaryDocument:'old.htm',isInlineXBRL:true}],...p});
// complete C4 CalendarFiling (FilingRow incl. acceptance_source) before the override spread (plan audit P9)
const published=(issuer:string,form:CalendarFiling['form_type'],periodEnd:string,available:string,p:Partial<CalendarFiling>={}):CalendarFiling=>({filing_id:`f-${issuer.slice(-2)}-${periodEnd}`,issuer_id:issuer,market:'US',source:'edgar',origin:'sec',form_type:form,fiscal_year:null,fiscal_period:null,period_end:periodEnd,available_date:available,source_ref:`ref-${periodEnd}`,url:null,document_ref:null,document_url:null,link_attempts:0,mapping_gen:1,run_id:'r',created_at:`${available}T00:00:00Z`,run_status:'published',accepted_at:null,acceptance_source:null,...p});

async function harness(o:{market?:Market;members?:string[];filings?:Record<string,CalendarFiling[]>;submissions?:(cik:string)=>Promise<SubmissionsView>;disclosure?:(ts:string)=>Promise<TushareRaw>;budgetMs?:number}={}){
 const market=o.market??'US';const members=o.members??[A,B];
 const tables=memoryTableClient({issuer_filing_profiles:['issuer_id','market'],dq_freshness:['dataset'],ingest_batches:['batch_id']});
 for(const [i,id] of members.entries()){
  await tables.insert('issuers',{issuer_id:id,canonical_name_en:`Issuer ${i}`,status:'active'});
  await tables.insert('fact_sync_scope',{issuer_id:id,market,priority:10,fetch_key:market==='US'?`000000000${i+1}`:`60000${i}.SH`});
  if(market==='US')await tables.insert('issuer_securities',{issuer_id:id,ticker:`T${i}`,is_primary:true,valid_from:'2020-01-01',valid_to:null});
  await tables.insert('issuer_filer_categories',{issuer_id:id,fiscal_year:2024,acceleration:'large_accelerated',smaller_reporting:null,category_raw:'Large Accelerated Filer',source:'ixbrl_dei',accession:'x',evidence_sha256:'e',as_of:'2026-11-01'});
  await tables.insert('issuer_filer_categories',{issuer_id:id,fiscal_year:2025,acceleration:'large_accelerated',smaller_reporting:null,category_raw:'Large Accelerated Filer',source:'ixbrl_dei',accession:'y',evidence_sha256:'e',as_of:'2026-11-01'});
 }
 const passes=memoryPasses(tables,()=>members);
 const raw=memoryRawStore();
 const deps:CalendarSyncDeps={tables,passes,raw,
  db:{filingsForCalendar:async(issuer,_m,opts)=>{expect(opts.fromPeriodEnd).toBe('2017-11-23');return o.filings?.[issuer]??[];}},
  submissions:o.submissions??(async()=>view()),
  disclosureDate:o.disclosure??(async()=>{throw new TushareError(-1,'TUSHARE_TOKEN not configured');}),
  now:()=>NOW,budget:budget(o.budgetMs),codeVersion:'c'.repeat(40)};
 return {deps,tables,passes,raw,market};
}
const rowsOf=(tables:ReturnType<typeof memoryTableClient>,issuer:string)=>tables.rows('dq_filing_expectations').filter(r=>r.issuer_id===issuer&&!r.deleted) as unknown as ExpectationRow[];

describe('runCalendarSync (US)',()=>{
 it('claims a pass, writes profiles and rows for every member, settles complete and records fresh',async()=>{
  const h=await harness({filings:{[A]:[published(A,'10-Q','2026-06-30','2026-08-03')]}});
  const r=await runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'});
  expect(r).toMatchObject({status:'success',passId:'p1',passStatus:'complete',counts:{fetched:2,inserted:2,failed:0}});
  expect(h.tables.rows('issuer_filing_profiles').map(p=>[p.issuer_id,p.regime,p.fiscal_year_end,p.week52_pattern,p.category_raw_current,p.source_sha256])).toEqual([[A,'10-K','1231',false,'Large accelerated filer','sub-sha'],[B,'10-K','1231',false,'Large accelerated filer','sub-sha']]);
  const a=rowsOf(h.tables,A);
  expect(a).toHaveLength(6);
  expect(a.find(x=>x.period_end==='2026-06-30')).toMatchObject({disclosure_state:'received',upstream_lookup:'ok'});
  expect(rowsOf(h.tables,B).find(x=>x.period_end==='2026-06-30')).toMatchObject({disclosure_state:'filed_not_ingested',upstream_filed_date:'2026-08-04'});
  expect(a[0].detail).toMatchObject({display:{ticker:'T0',name:'Issuer 0'},upstream_sha256:'sub-sha',rules_version:'filing-calendar/1'});
  expect(r.detail).toMatchObject({pass_id:'p1',issuers_done:2,rows:12,upstream_unavailable:0,no_category:0,no_fiscal_year_end:0,no_profile:0});
  expect(r.detail.by_disclosure_state.received).toBe(1);
  expect(h.tables.rows('dq_freshness')[0]).toMatchObject({dataset:'dq.calendar.us',expected_cadence:'daily',status:'fresh'});
  expect(h.tables.rows('ingest_batches')[0]).toMatchObject({producer:'filing-calendar',dataset:'dq.calendar.us',triggered_by:'cron',tool_versions:{rules:'filing-calendar/1',market:'US'}});
 });
 it('a lease held by another worker → nothing is processed, skipped_summary(pass_claimed), success',async()=>{
  const h=await harness();
  await h.passes.holdBy('US','other-batch');
  const r=await runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'});
  expect(r).toMatchObject({passId:null,passStatus:null,status:'success',counts:{fetched:0}});
  expect(r.errors).toEqual([{code:'skipped_summary',key:'pass',message:JSON.stringify({pass_claimed:1})}]);
  expect(h.tables.rows('dq_filing_expectations')).toHaveLength(0);
  h.passes.expire();
  const again=await runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'});
  expect(again).toMatchObject({passId:'p1',passStatus:'complete'});   // expired lease taken over
 });
 it('SEC unavailable → unknown_upstream rows from the stored profile, sec_unavailable makes the batch partial; no profile at all → no rows',async()=>{
  const h=await harness({submissions:async()=>{throw new Error('sec_unavailable: http_503');}});
  await h.tables.upsert('issuer_filing_profiles',{issuer_id:A,market:'US',category_raw_current:null,regime:'10-K',fiscal_year_end:'1231',week52_pattern:false,source:'sec_submissions',source_sha256:'old',as_of:'2026-10-01'},'issuer_id,market');
  const r=await runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'});
  expect(r.status).toBe('partial');expect(r.passStatus).toBe('complete');
  expect(rowsOf(h.tables,A).every(x=>x.disclosure_state==='unknown_upstream'&&x.profile_as_of==='2026-10-01')).toBe(true);
  expect(rowsOf(h.tables,B)).toHaveLength(0);
  expect(r.detail).toMatchObject({no_profile:1,upstream_unavailable:2});
  expect(r.errors.filter(e=>e.code==='sec_unavailable').map(e=>e.key)).toEqual([A,B]);
 });
 it('upstream coverage is per period: only uncovered periods without evidence read as unavailable (plan audit Q1)',async()=>{
  // earliest entry 2026-02-20: periods ending after it are covered; older ones are not
  const h=await harness({members:[A],submissions:async()=>view({entries:view().entries.slice(0,2)})});
  await runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'});
  const rows=rowsOf(h.tables,A);
  const at=(pe:string)=>rows.find(x=>x.period_end===pe)!;
  expect(at('2026-06-30')).toMatchObject({upstream_lookup:'ok',disclosure_state:'filed_not_ingested',upstream_filed_date:'2026-08-04'});
  expect(at('2026-09-30')).toMatchObject({upstream_lookup:'ok',disclosure_state:'pending'});          // covered, nothing filed yet
  expect(at('2026-09-30').detail.upstream_incomplete).toBeUndefined();
  expect(at('2025-12-31')).toMatchObject({upstream_lookup:'ok',disclosure_state:'filed_not_ingested',upstream_filed_date:'2026-02-20'});   // uncovered, positive evidence kept
  const old=rows.filter(x=>x.period_end<'2025-12-31');
  expect(old.length).toBeGreaterThan(0);
  expect(old.every(x=>x.upstream_lookup==='unavailable'&&x.disclosure_state==='unknown_upstream'&&x.detail.upstream_incomplete===true&&x.detail.upstream_covered_from==='2026-02-20')).toBe(true);
 });
 it('20-F with known 2025/2024 filings and incomplete older history keeps the 2025 and 2024 evidence (plan audit Q1 regression)',async()=>{
  const f20=view({fiscalYearEnd:'1231',category:null,entries:[
   {accessionNumber:'0000000001-26-000003',filingDate:'2026-04-15',reportDate:'2025-12-31',form:'20-F',primaryDocument:'f25.htm',isInlineXBRL:true},
   {accessionNumber:'0000000001-25-000004',filingDate:'2025-04-20',reportDate:'2024-12-31',form:'20-F',primaryDocument:'f24.htm',isInlineXBRL:true}]});
  const h=await harness({members:[A],submissions:async()=>f20});
  await runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'});
  const rows=rowsOf(h.tables,A);
  expect(rows.map(x=>x.period_end)).toEqual(['2025-12-31','2024-12-31','2023-12-31','2022-12-31','2021-12-31','2020-12-31']);   // six annual periods reach 2020
  expect(rows.every(x=>x.report_kind==='20-F')).toBe(true);
  expect(rows[0]).toMatchObject({upstream_lookup:'ok',disclosure_state:'filed_not_ingested',upstream_filed_date:'2026-04-15'});   // was unknown_upstream before Q1
  expect(rows[1]).toMatchObject({upstream_lookup:'ok',disclosure_state:'filed_not_ingested',upstream_filed_date:'2025-04-20'});
  expect(rows.slice(2).every(x=>x.disclosure_state==='unknown_upstream'&&x.upstream_lookup==='unavailable'&&x.detail.upstream_incomplete===true)).toBe(true);
  expect(rows.some(x=>x.disclosure_state==='overdue')).toBe(false);
 });
 it('applyUpstreamCoverage: received rows and covered rows unchanged; an empty list leaves only evidence-bearing rows',()=>{
  const row=(pe:string,state:ExpectationRow['disclosure_state'],o:Partial<ExpectationRow>={}):ExpectationRow=>({issuer_id:A,market:'US',report_kind:'10-Q',period_end:pe,period_end_estimated:false,deadline_state:'statutory',due_date:null,due_rule:'r',expected_date:null,upstream_lookup:'ok',upstream_filed_date:null,disclosure_state:state,received_filing_id:null,received_date:null,profile_as_of:null,detail:{estimated_due_passed:true},...o});
  const rows=[row('2026-06-30','overdue'),row('2025-06-30','received',{received_filing_id:'f',received_date:'2025-08-01'}),row('2025-03-31','overdue')];
  const out=applyUpstreamCoverage(rows,[{form:'10-Q',reportDate:'2025-12-31',filingDate:'2026-02-01',accessionNumber:'a'}]);
  expect(out[0]).toBe(rows[0]);expect(out[1]).toBe(rows[1]);
  expect(out[2]).toMatchObject({disclosure_state:'unknown_upstream',upstream_lookup:'unavailable',detail:{upstream_incomplete:true,upstream_covered_from:'2026-02-01'}});
  expect(out[2].detail.estimated_due_passed).toBeUndefined();
  expect(applyUpstreamCoverage(rows,[]).map(r=>r.disclosure_state)).toEqual(['unknown_upstream','received','unknown_upstream']);
 });
 it('budget and limit: unprocessed members keep the pass running; a later run finishes it',async()=>{
  const h=await harness();
  const first=await runCalendarSync(h.deps,{market:'US',limit:1,triggeredBy:'cron'});
  expect(first).toMatchObject({passStatus:'running',counts:{fetched:1,inserted:1}});
  expect(h.tables.rows('dq_freshness')).toHaveLength(0);
  const low=await harness({budgetMs:59_000});
  const none=await runCalendarSync(low.deps,{market:'US',limit:100,triggeredBy:'cron'});
  expect(none.errors).toContainEqual({code:'deadline_hit',message:JSON.stringify({not_started:2})});
  h.passes.expire();   // the first run's lease lapses before the next run (cron is hours apart)
  const second=await runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'});
  expect(second).toMatchObject({passId:'p1',passStatus:'complete',counts:{fetched:1}});
 });
 it('a failing member is failed (attempts+1), retried by later runs, and the pass ends complete_with_failures after 3 attempts',async()=>{
  let calls=0;
  const h=await harness({members:[A,B]});
  h.deps.db={filingsForCalendar:async(issuer)=>{if(issuer===B){calls++;throw new Error('boom');}return [];}};
  const r1=await runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'});
  expect(r1).toMatchObject({passStatus:'running',status:'partial',counts:{fetched:2,inserted:1,failed:1}});
  expect(r1.errors).toContainEqual({code:'member_failed',key:B,message:'boom'});
  h.passes.expire();const r2=await runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'});
  expect(r2.counts.fetched).toBe(1);
  h.passes.expire();const r3=await runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'});
  expect(r3.passStatus).toBe('complete_with_failures');
  expect(calls).toBe(3);
  expect(h.tables.rows('dq_freshness')[0]).toMatchObject({dataset:'dq.calendar.us',consecutive_errors:1});
 });
 it('fence_failed on a write stops the worker immediately',async()=>{
  const h=await harness();
  const real=h.passes.replaceExpectations;
  h.passes.replaceExpectations=async(...a)=>{h.passes.expire();return real(...a);};
  const r=await runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'});
  expect(r.passStatus).toBe('running');
  expect(r.errors).toContainEqual({code:'fence_failed',key:A});
  expect(r.counts.fetched).toBe(1);
 });
});

describe('review fixes (Task 18a)',()=>{
 const batchStatuses=(h:Awaited<ReturnType<typeof harness>>)=>h.tables.rows('ingest_batches').map(b=>b.status);
 it('a claim failure finishes the batch (not left running) and rethrows',async()=>{
  const h=await harness();
  h.deps.passes={...h.passes,claimPass:async()=>{throw new Error('rpc down');}};
  await expect(runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'})).rejects.toThrow('rpc down');
  expect(batchStatuses(h)).toEqual(['failed']);
  expect(h.tables.rows('ingest_batches')[0].errors).toContainEqual(expect.objectContaining({code:'run_aborted'}));
 });
 it('a failure after the pass settled (freshness write) still finishes the batch; the pass stays settled',async()=>{
  const h=await harness();
  const real=h.tables;
  h.deps.tables={...real,upsert:(async(t:string,...a:unknown[])=>{if(t==='dq_freshness')throw new Error('storage down');return (real.upsert as (...x:unknown[])=>unknown)(t,...a);}) as typeof real.upsert} as typeof real;
  await expect(runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'})).rejects.toThrow('storage down');
  expect(batchStatuses(h)).toEqual(['partial']);   // rows landed before the abort
  expect(h.passes.passes[0]).toMatchObject({finished:true,status:'complete'});
 });
 it('a failMember storage error (non-fence) finishes the batch and leaves the pass resumable',async()=>{
  const h=await harness();
  h.deps.db={filingsForCalendar:async()=>{throw new Error('boom');}};
  h.deps.passes={...h.passes,failMember:async()=>{throw new CalendarPassError('unknown','db gone');}};
  await expect(runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'})).rejects.toThrow('db gone');
  expect(batchStatuses(h)).toEqual(['failed']);
  expect(h.passes.passes[0].finished).toBe(false);
 });
 it('a stale worker never writes a profile: the profile travels in the fenced replace call',async()=>{
  const h=await harness({members:[A]});
  const real=h.passes.replaceExpectations;
  h.passes.replaceExpectations=async(...a)=>{h.passes.expire();return real(...a);};
  await runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'});
  expect(h.tables.rows('issuer_filing_profiles')).toHaveLength(0);
  expect(h.tables.rows('dq_filing_expectations')).toHaveLength(0);
 });
 it('a reused stored profile (SEC unavailable) is not rewritten: null profile is passed',async()=>{
  const h=await harness({members:[A],submissions:async()=>{throw new Error('sec_unavailable');}});
  await h.tables.upsert('issuer_filing_profiles',{issuer_id:A,market:'US',category_raw_current:null,regime:'10-K',fiscal_year_end:'1231',week52_pattern:false,source:'sec_submissions',source_sha256:'old',as_of:'2026-10-01'},'issuer_id,market');
  const seen:unknown[]=[];const real=h.passes.replaceExpectations;
  h.passes.replaceExpectations=async(i,m,r,t,p)=>{seen.push(p);return real(i,m,r,t,p);};
  await runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'});
  expect(seen).toEqual([null]);
  expect(h.tables.rows('issuer_filing_profiles')[0].as_of).toBe('2026-10-01');
 });
 it('positive-evidence rows cite the page that holds the entry; the page manifest is kept in the row detail',async()=>{
  const PAGE='CIK0000000001-submissions-001.json';
  const v=view();
  const entries=v.entries.slice(0,2).map((e,i)=>({...e,page:i===0?'recent':PAGE,pageSha256:i===0?'sub-sha':'page-sha'}));
  const pages=[{name:'recent',sha256:'sub-sha'},{name:PAGE,sha256:'page-sha'}];
  const h=await harness({members:[A],submissions:async()=>({...v,entries,pages})});
  await runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'});
  const rows=rowsOf(h.tables,A);
  const old=rows.find(x=>x.period_end==='2025-12-31')!;
  expect(old).toMatchObject({disclosure_state:'filed_not_ingested'});
  expect(old.detail).toMatchObject({upstream_sha256:'page-sha',upstream_page:PAGE,upstream_pages:pages});
  const recent=rows.find(x=>x.period_end==='2026-06-30')!;
  expect(recent.detail).toMatchObject({upstream_sha256:'sub-sha',upstream_page:'recent',upstream_pages:pages});
  expect(rows.find(x=>x.disclosure_state==='pending')!.detail).toMatchObject({upstream_sha256:'sub-sha',upstream_pages:pages});
 });
 it('conflicting copies of one accession on two pages: the row cites the page whose filingDate is the selected upstream_filed_date',async()=>{
  const v=view();
  const k=v.entries[1];   // 10-K for 2025-12-31, filed 2026-02-20
  const early={...k,filingDate:'2026-02-18',page:'old-page.json',pageSha256:'old-sha'};
  const late={...k,page:'recent',pageSha256:'sub-sha'};
  const pages=[{name:'recent',sha256:'sub-sha'},{name:'old-page.json',sha256:'old-sha'}];
  const h=await harness({members:[A],submissions:async()=>({...v,entries:[v.entries[0],early,late],pages})});
  await runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'});
  const row=rowsOf(h.tables,A).find(x=>x.period_end==='2025-12-31')!;
  expect(row.upstream_filed_date).toBe('2026-02-18');   // the earliest copy is selected
  expect(row.detail).toMatchObject({upstream_page:'old-page.json',upstream_sha256:'old-sha'});
 });
 it('a CN raw-store failure is a real error: member failed (retryable), raw_upload_failed, never success',async()=>{
  const h=await harness({market:'CN',members:[C],disclosure:async()=>({bytes:new Uint8Array([1]),sha256:'x',httpStatus:200,requestId:null,code:0,msg:'',fields:[],items:[],hasMore:false})});
  h.deps.raw={...h.raw,put:async()=>{throw new RawStoreError('raw_upload_failed','503');}};
  const r=await runCalendarSync(h.deps,{market:'CN',limit:100,triggeredBy:'cron'});
  expect(r.errors).toContainEqual({code:'raw_upload_failed',key:C,message:'raw_upload_failed: 503'});
  expect(r.status).not.toBe('success');
  expect(r).toMatchObject({passStatus:'running',counts:{failed:1,inserted:0}});
  expect(h.tables.rows('dq_calendar_pass_members')[0]).toMatchObject({state:'failed',attempts:1});
  expect(h.tables.rows('dq_filing_expectations')).toHaveLength(0);
  expect(h.tables.rows('dq_freshness')).toHaveLength(0);
 });
});

describe('supabaseCalendarPassDb',()=>{
 it('maps each port method to its RPC with the C5 argument names; row payload drops issuer_id/market; errors map to pass codes',async()=>{
  const calls:{fn:string;args:Record<string,unknown>}[]=[];
  let fail:string|null=null;
  const client={rpc:async(fn:string,args:Record<string,unknown>)=>{calls.push({fn,args});return fail?{data:null,error:{message:fail}}:{data:fn==='replace_filing_expectations'?'2':fn==='finish_calendar_pass'?'complete':fn==='claim_calendar_pass'?{market:'US',pass_id:'p',batch_id:'b'}:null,error:null};}};
  const db=supabaseCalendarPassDb(client as never);
  const tok={market:'US' as const,pass_id:'p',batch_id:'b'};
  expect(await db.claimPass('US','b')).toEqual(tok);
  const row={issuer_id:A,market:'US',report_kind:'10-K',period_end:'2025-12-31'} as unknown as ExpectationRow;
  const profile={issuer_id:A,market:'US' as const,category_raw_current:null,regime:'10-K' as const,fiscal_year_end:'1231',week52_pattern:false,source:'sec_submissions',source_sha256:null,as_of:'2026-11-05'};
  expect(await db.replaceExpectations(A,'US',[row],tok,profile)).toBe(2);
  expect(await db.replaceExpectations(A,'US',[row],tok,null)).toBe(2);
  await db.failMember(tok,A,'x'.repeat(900));
  expect(await db.finishPass(tok)).toBe('complete');
  const {issuer_id:_i,market:_m,...p}=profile;
  expect(calls.map(c=>c.fn)).toEqual(['claim_calendar_pass','replace_filing_expectations','replace_filing_expectations','fail_calendar_member','finish_calendar_pass']);
  expect(calls[0].args).toEqual({p_market:'US',p_batch:'b'});
  expect(calls[1].args).toEqual({p_issuer:A,p_market:'US',p_rows:[{report_kind:'10-K',period_end:'2025-12-31'}],p_pass_token:tok,p_profile:p});
  expect(calls[2].args.p_profile).toBeNull();
  expect(calls[3].args).toEqual({p_pass_token:tok,p_issuer:A,p_error:'x'.repeat(500)});
  expect(calls[4].args).toEqual({p_pass_token:tok});
  fail='fence_failed';
  await expect(db.finishPass(tok)).rejects.toMatchObject({code:'fence_failed'});
 });
});

describe('runCalendarSync (CN)',()=>{
 it('without TUSHARE_TOKEN every unreceived row is unknown_upstream and the reason is summarised',async()=>{
  const h=await harness({market:'CN',members:[C]});
  const r=await runCalendarSync(h.deps,{market:'CN',limit:100,triggeredBy:'cron'});
  expect(r).toMatchObject({status:'success',passStatus:'complete'});
  const rows=rowsOf(h.tables,C);
  expect(rows.map(x=>x.report_kind)).toEqual(['q3','semiannual','q1','annual','q3','semiannual']);
  expect(rows.every(x=>x.disclosure_state==='unknown_upstream'&&x.upstream_lookup==='unavailable'&&x.deadline_state==='statutory'&&x.expected_date===null)).toBe(true);
  expect(rows[0].detail).toMatchObject({schedule_unavailable:'no_token',display:{ticker:'600000.SH',name:'Issuer 0'}});
  expect(r.errors).toContainEqual({code:'skipped_summary',key:'schedule_unavailable',message:JSON.stringify({no_token:1})});
  expect(h.tables.rows('issuer_filing_profiles')[0]).toMatchObject({regime:'cn',fiscal_year_end:'1231',source:'cn_statutory'});
 });
 it('a real response is kept in the bucket with its sha256 but stays unavailable until the semantics are verified',async()=>{
  const bytes=new TextEncoder().encode('{"code":0}');
  const h=await harness({market:'CN',members:[C],disclosure:async(ts)=>{expect(ts).toBe('600000.SH');return {bytes,sha256:'x',httpStatus:200,requestId:null,code:0,msg:'',fields:['ts_code','ann_date','end_date','pre_date','actual_date','modify_date'],items:[['600000.SH','20260701','20260930','20261028',null,null]],hasMore:false};}});
  await runCalendarSync(h.deps,{market:'CN',limit:100,triggeredBy:'cron'});
  expect([...h.raw.objects.keys()].filter(k=>!k.endsWith('.meta.json'))).toHaveLength(1);   // landed raw-store also writes a .meta.json sidecar
  const rows=rowsOf(h.tables,C);
  expect(rows.every(x=>x.upstream_lookup==='unavailable'&&x.detail.schedule_unavailable==='unverified'&&typeof x.detail.upstream_sha256==='string')).toBe(true);
 });
 it('a Tushare API error code (积分不足) is unavailable with the code as reason',async()=>{
  const h=await harness({market:'CN',members:[C],disclosure:async()=>({bytes:new Uint8Array(),sha256:'x',httpStatus:200,requestId:null,code:40203,msg:'',fields:[],items:[],hasMore:false})});
  const r=await runCalendarSync(h.deps,{market:'CN',limit:100,triggeredBy:'cron'});
  expect(r.errors).toContainEqual({code:'skipped_summary',key:'schedule_unavailable',message:JSON.stringify({api_code_40203:1})});
  expect(h.raw.objects.size).toBe(0);
 });
});

describe('previewCalendar',()=>{
 it('computes rows for scope members without a batch, a pass or a profile write',async()=>{
  const h=await harness();
  const out=await previewCalendar(h.deps,{market:'US',limit:1});
  expect(out.map(o=>[o.issuerId,o.rows.length])).toEqual([[A,6]]);
  expect(h.tables.rows('ingest_batches')).toHaveLength(0);
  expect(h.tables.rows('issuer_filing_profiles')).toHaveLength(0);
  expect(h.tables.rows('dq_calendar_passes')).toHaveLength(0);
 });
});

describe('helpers',()=>{
 it('maps SQL messages to pass error codes',()=>{
  expect(toCalendarPassError({message:'fence_failed'}).code).toBe('fence_failed');
  expect(toCalendarPassError({message:'pass_incomplete'}).code).toBe('pass_incomplete');
  expect(toCalendarPassError({message:'permission denied'}).code).toBe('unknown');
 });
 it('expectationArgs drops issuer_id/market only',()=>{
  const row={issuer_id:A,market:'US',report_kind:'10-K',period_end:'2025-12-31'} as unknown as ExpectationRow;
  expect(expectationArgs([row])).toEqual([{report_kind:'10-K',period_end:'2025-12-31'}]);
 });
 it('parses disclosure_date rows by field name, dates to ISO',()=>{
  expect(parseDisclosureDate({fields:['ts_code','ann_date','end_date','pre_date','actual_date','modify_date'],items:[['600519.SH','20260115','20251231','20260403','20260403',null],['600519.SH',null,'bad',null,null,null]]}))
   .toEqual([{end_date:'2025-12-31',ann_date:'2026-01-15',pre_date:'2026-04-03',actual_date:'2026-04-03',modify_date:null}]);
 });
 it('fiscal_year_end must be a real calendar day (leap-year calendar): 0231/0431/0631 → null, 0229 kept',()=>{
  for(const bad of ['0231','0431','0631','0931','1131','0230','0000','0100'])expect(profileFromSubmissions(A,view({fiscalYearEnd:bad}),'2026-11-05')?.fiscal_year_end).toBeNull();
  for(const ok of ['0229','0131','0430','1231'])expect(profileFromSubmissions(A,view({fiscalYearEnd:ok}),'2026-11-05')?.fiscal_year_end).toBe(ok);
 });
 it('profile: regime from the latest annual form, 52/53-week detection, no annual form → null',()=>{
  expect(profileFromSubmissions(A,view(),'2026-11-05')).toMatchObject({regime:'10-K',fiscal_year_end:'1231',week52_pattern:false});
  expect(profileFromSubmissions(A,view({fiscalYearEnd:'0927',entries:[{accessionNumber:'k',filingDate:'2025-10-31',reportDate:'2025-09-27',form:'10-K',primaryDocument:'k',isInlineXBRL:true}]}),'2026-11-05')?.week52_pattern).toBe(true);
  expect(profileFromSubmissions(A,view({fiscalYearEnd:'0930',entries:[{accessionNumber:'k',filingDate:'2025-10-31',reportDate:'2025-09-27',form:'10-K',primaryDocument:'k',isInlineXBRL:true}]}),'2026-11-05')?.week52_pattern).toBe(true);
  expect(profileFromSubmissions(A,view({entries:[{accessionNumber:'f',filingDate:'2026-04-01',reportDate:'2025-12-31',form:'20-F',primaryDocument:'f',isInlineXBRL:true},{accessionNumber:'k',filingDate:'2025-03-01',reportDate:'2024-12-31',form:'10-K',primaryDocument:'k',isInlineXBRL:true}]}),'2026-11-05')?.regime).toBe('20-F');
  expect(profileFromSubmissions(A,view({entries:[]}),'2026-11-05')).toBeNull();
  expect(profileFromSubmissions(A,view({fiscalYearEnd:'1331'}),'2026-11-05')?.fiscal_year_end).toBeNull();
 });
});

exec
/bin/zsh -lc "rg -n 'upstream_accession|upstream_filed_date|upstream.us|SubmissionsView' src/lib/dq/calendar.ts src/lib/dq/filer-categories.ts; cat vitest.config.ts; sed -n '200,310p' src/lib/dq/calendar.ts; rg -n 'pageSha256|entries.*push|accessionNumber' src/lib/data/sources/sec*" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 0ms:
src/lib/dq/calendar.ts:22:export interface ExpectationRow{issuer_id:string;market:Market;report_kind:ReportKind;period_end:string;period_end_estimated:boolean;deadline_state:DeadlineState;due_date:string|null;due_rule:string;expected_date:string|null;upstream_lookup:'ok'|'unavailable'|'not_applicable';upstream_filed_date:string|null;disclosure_state:DisclosureState;received_filing_id:string|null;received_date:string|null;profile_as_of:string|null;detail:Record<string,unknown>}
src/lib/dq/calendar.ts:166: const usEntries=upstream.lookup==='ok'?upstream.us??[]:[];
src/lib/dq/calendar.ts:215:   if(up){state='filed_not_ingested';upstreamFiled=up.date;if(up.accession)detail.upstream_accession=up.accession;}
src/lib/dq/calendar.ts:222:   deadline_state:dl.state,due_date:dl.due,due_rule:dl.rule,expected_date:expected,upstream_lookup:upstream.lookup,upstream_filed_date:upstreamFiled,
src/lib/dq/filer-categories.ts:31:export interface SubmissionsView{cik10:string;sha256:string;category:string|null;fiscalYearEnd:string|null;entries:SubmissionsEntryView[];
src/lib/dq/filer-categories.ts:36:export function submissionsView(s:SubmissionsSnapshot):SubmissionsView{
src/lib/dq/filer-categories.ts:56:export const latestTenKs=(v:SubmissionsView,n=3)=>v.entries.filter(e=>e.form==='10-K'&&e.primaryDocument!=='').sort((a,b)=>b.filingDate.localeCompare(a.filingDate)||b.accessionNumber.localeCompare(a.accessionNumber)).slice(0,n);
src/lib/dq/filer-categories.ts:91: submissions:(cik10:string,b:Budget)=>Promise<SubmissionsView>;
src/lib/dq/filer-categories.ts:112:  let view:SubmissionsView;
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
  const fiscalYear=+monthEnd(+p.grid.slice(0,4),p.month+monthsAhead).slice(0,4);
  let dl=deadlineOf(regime,p.kind,p.periodEnd,fiscalYear,categories);
  const detail:Record<string,unknown>={...base,...dl.detail};
  if(p.basis)detail[p.estimated?'estimate_basis':'estimate']=p.basis;
  if(p.estimated&&dl.state==='statutory')dl={...dl,state:'estimated',rule:`${dl.rule}/est`};
  let expected:string|null=null,upstreamFiled:string|null=null,state:DisclosureState;
  const cnRow=regime==='cn'?cnRows.filter(r=>r.end_date===p.periodEnd).sort((a,b)=>(b.ann_date??'').localeCompare(a.ann_date??''))[0]:undefined;
  if(cnRow){expected=cnRow.pre_date;if(cnRow.modify_date)detail.schedule_modified=true;}
  if(p.received){
   state=dl.due!==null&&p.received.available_date>dl.due?'received_late':'received';
  }else if(upstream.lookup==='unavailable'){
   state='unknown_upstream';
  }else{
   const up=regime==='cn'?(cnRow?.actual_date?{date:cnRow.actual_date,accession:null}:null)
    :earliestEntry(usEntries.filter(e=>e.form===p.kind&&e.reportDate!==null&&Math.abs(diffDays(e.reportDate,p.periodEnd))<=MATCH_DAYS));
   if(up){state='filed_not_ingested';upstreamFiled=up.date;if(up.accession)detail.upstream_accession=up.accession;}
   else if(dl.due!==null&&today>dl.due){
    if(dl.state==='statutory')state='overdue';
    else{state='pending';if(dl.state==='estimated')detail.estimated_due_passed=true;}
   }else state='pending';
  }
  rows.push({issuer_id:profile.issuer_id,market:profile.market,report_kind:p.kind,period_end:p.periodEnd,period_end_estimated:p.estimated,
   deadline_state:dl.state,due_date:dl.due,due_rule:dl.rule,expected_date:expected,upstream_lookup:upstream.lookup,upstream_filed_date:upstreamFiled,
   disclosure_state:state,received_filing_id:p.received?.filing_id??null,received_date:p.received?.available_date??null,profile_as_of:profile.as_of,detail});
 }
 return rows;
}
const earliest=(fs:CalendarFiling[])=>[...fs].sort((a,b)=>a.available_date.localeCompare(b.available_date)||a.filing_id.localeCompare(b.filing_id))[0]??null;
const earliestEntry=(es:UsUpstreamEntry[])=>{const e=[...es].sort((a,b)=>a.filingDate.localeCompare(b.filingDate))[0];return e?{date:e.filingDate,accession:e.accessionNumber}:null;};
zsh:1: no matches found: src/lib/data/sources/sec*

exec
/bin/zsh -lc "sed -n '24,55p' src/lib/dq/filer-categories.ts; git rev-parse HEAD; find src -name AGENTS.md -o -name AGENTS.override.md; node node_modules/vitest/vitest.mjs run src/lib/dq/calendar-sync.test.ts --configLoader runner" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 242ms:
import {DEFAULT_USER_AGENT} from '../research/ingest/collectors/shared';
import type {SubmissionsSnapshot} from '../entities/identifiers/sec-submissions';

/** The submissions fields the calendar and this module read. Built only by submissionsView (one adaptation point to Task 6's snapshot). */
export interface SubmissionsEntryView{accessionNumber:string;filingDate:string;reportDate:string|null;form:string;primaryDocument:string;isInlineXBRL:boolean;
 /** the submissions page (name) holding this entry and that page's sha256 (null: page not among the fetched documents) — evidence must cite these bytes, not the main document's */
 page?:string;pageSha256?:string|null}
export interface SubmissionsView{cik10:string;sha256:string;category:string|null;fiscalYearEnd:string|null;entries:SubmissionsEntryView[];
 /** manifest of the fetched documents ('recent' = main document) */
 pages?:{name:string;sha256:string}[]}
// Task 6a shape (Part B): SubmissionsSnapshot{cik, fetchedAt, main:StoredDoc, pages, parsed:ParsedSubmissions, complete};
// parsed.filings already merges recent with the fetched files[] pages; primaryDocument / isInlineXBRL may be null.
export function submissionsView(s:SubmissionsSnapshot):SubmissionsView{
 const pages=[{name:'recent',sha256:s.main.sha256},...s.pages.map(p=>({name:p.name,sha256:p.sha256}))];
 // the parser tags main-document entries 'recent' (submissionsEvidenceClaims.shaOf); 'main' and the document's own name are accepted too
 const shaOf=(page:string)=>page==='recent'||page==='main'||page===s.main.name?s.main.sha256:s.pages.find(p=>p.name===page)?.sha256??null;
 return {cik10:s.cik.padStart(10,'0'),sha256:s.main.sha256,category:s.parsed.category,fiscalYearEnd:s.parsed.fiscalYearEnd,pages,
  entries:s.parsed.filings.map(e=>({accessionNumber:e.accessionNumber,filingDate:e.filingDate,reportDate:e.reportDate||null,form:e.form,primaryDocument:e.primaryDocument??'',isInlineXBRL:e.isInlineXBRL===true,page:e.page,pageSha256:shaOf(e.page)}))};
}

/**
 * Cover text → category. The non-accelerated test runs first because "Non-accelerated Filer" also
 * contains "accelerated filer" (spec §6.1 lists large → accelerated → non; same outcomes). Smaller
 * reporting status is only ever `true` (the words appear) or null (unknown) — never inferred false.
 */
export function parseFilerCategory(raw:string):{acceleration:Acceleration;smaller_reporting:boolean|null}|null{
 const acceleration=filerClass(raw.replace(/\s+/g,' ').trim());   // the one classifier (pair-us-ixbrl.ts), shared with the reconcile pair
 if(acceleration===null)return null;
 return {acceleration,smaller_reporting:raw.toLowerCase().includes('smaller reporting')?true:null};
}
const norm=(s:string)=>s.replace(/\s+/g,' ').trim().toLowerCase();
/** Latest n original 10-Ks by filing date (amendments never: a 10-K/A cover restates, it does not determine status). */
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-McBVDo5C' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-YIokiQoZ' (errno=Operation not permitted)
aec0f186a373a0908c3757ae26c0b2854fddb3df
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
The composite lookup correctly associates evidence with the selected accession and filing date, and the regression test covers conflicting dates across pages. No actionable regressions were identified. Test execution was blocked by a configuration-loading error.
The composite lookup correctly associates evidence with the selected accession and filing date, and the regression test covers conflicting dates across pages. No actionable regressions were identified. Test execution was blocked by a configuration-loading error.

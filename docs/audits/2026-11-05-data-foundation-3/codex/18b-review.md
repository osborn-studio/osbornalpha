OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b39f-1966-7bb1-9b96-e637c68df52c
--------
user
commit 363f207
2026-11-07T01:28:32.548048Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when AuthRequired(AuthRequiredError { www_authenticate_header: "Bearer realm=\"OAuth\", resource_metadata=\"https://mcp.notion.com/.well-known/oauth-protected-resource/mcp\", scope=\"default\"" })
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 363f207; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 2615ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-lvsblivR' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-XDJrs6na' (errno=Operation not permitted)
 M src/lib/db/memory-table-client.ts
 M src/lib/dq/dashboard-blocks.test.ts
 M src/lib/dq/dashboard-blocks.ts
 M src/lib/dq/dashboard.test.ts
 M src/lib/dq/dashboard.ts
 M src/lib/entities/identifiers.integration.test.ts
 M supabase/migrations.lock.json
 M supabase/migrations/20261107090000_identifiers_and_dq.sql
?? docs/audits/2026-11-05-data-foundation-3/codex/18b-review.md
?? docs/audits/2026-11-05-data-foundation-3/codex/19a-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/19a-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-pqpCUHdW' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-8IKYTL60' (errno=Operation not permitted)
363f207b feat(dq): CN_DISCLOSURE_VERIFIED=true after real Tushare disclosure_date check
 src/lib/dq/calendar-sync.test.ts | 8 +++++---
 src/lib/dq/calendar-sync.ts      | 8 ++++----
 2 files changed, 9 insertions(+), 7 deletions(-)

exec
/bin/zsh -lc "rg -n 'CN_DISCLOSURE|disclosure|cnSchedule|schedule' src/lib/dq/calendar-sync.ts; cat src/lib/dq/calendar.ts; rg -n -A65 -B5 'CN disclosure_date 真实响应核对' docs/audits/2026-11-05-data-foundation-3/verification.md; find . -name AGENTS.override.md -o -name AGENTS.md" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 282ms:
13:// Upstream: US = SEC submissions (raw kept by the fetcher, Task 6); CN = Tushare disclosure_date via
14:// tushareCallRaw, response bytes into reconcile-raw (T15). The disclosure_date semantics are verified against
15:// real responses (CN_DISCLOSURE_VERIFIED); with the flag false CN rows would keep upstream_lookup='unavailable'.
33:/** Verified 2026-11-06 against real disclosure_date responses (600519.SH, 000333.SZ; docs/audits/2026-11-05-data-foundation-3/verification.md "CN disclosure_date 真实响应核对"): actual_date = periodic-report disclosure date, null while only scheduled. */
34:export const CN_DISCLOSURE_VERIFIED=true;
77: /** CN upstream: tushareCallRaw('disclosure_date', {ts_code}, DISCLOSURE_FIELDS). */
78: disclosureDate:(tsCode:string,b:Budget)=>Promise<TushareRaw>;
82:export interface CalendarDetail{pass_id:string|null;issuers_done:number;issuers_failed:number;rows:number;by_deadline_state:Record<string,number>;by_disclosure_state:Record<string,number>;upstream_unavailable:number;no_fiscal_year_end:number;no_category:number;no_profile:number}
109:/** disclosure_date rows from a raw response (field order from the response, dates → ISO). */
132:  if(r.disclosure_state!=='pending'&&r.disclosure_state!=='overdue')return r;
134:  return {...r,upstream_lookup:'unavailable',upstream_filed_date:null,disclosure_state:'unknown_upstream',detail:{...detail,upstream_incomplete:true,upstream_covered_from:earliest}};
138:interface MemberResult{profile:FilingProfile|null;rows:ExpectationRow[];upstreamUnavailable:boolean;noProfile:boolean;noFye:boolean;noCategory:boolean;errors:BatchError[];scheduleReason?:string}
151: let profile:FilingProfile|null=null;let upstream:CalendarUpstream;let scheduleReason:string|undefined;
168:   const raw=await deps.disclosureDate(fetchKey,deps.budget);
169:   if(raw.code!==0)scheduleReason=`api_code_${raw.code}`;
172:    const stored=await deps.raw.put({kind:'tushare-disclosure',bytes:raw.bytes,contentType:'application/json',meta:{api:'disclosure_date',ts_code:fetchKey}},deps.budget).catch((e:unknown)=>{throw e instanceof RawStoreError?e:new RawStoreError('raw_upload_failed',errText(e));});
173:    if(CN_DISCLOSURE_VERIFIED)upstream={lookup:'ok',cn:parseDisclosureDate(raw),sha256:stored.sha256};
174:    else{upstream={lookup:'unavailable',sha256:stored.sha256};scheduleReason='unverified';}
176:  }catch(e){if(e instanceof RawStoreError)throw e;scheduleReason=e instanceof TushareError&&e.code===-1?'no_token':e instanceof Error&&(e.message==='no_ts_code')?'no_ts_code':'error';}
178: if(!profile)return {profile:null,rows:[],upstreamUnavailable:upstream.lookup==='unavailable',noProfile:true,noFye:false,noCategory:false,errors,scheduleReason};
193:  return {...r,detail:{...r.detail,display:shown,...cite,...(manifest?{upstream_pages:manifest}:{}),...(scheduleReason?{schedule_unavailable:scheduleReason}:{})}};
195: return {profile:fresh,rows,upstreamUnavailable:rows.some(r=>r.upstream_lookup==='unavailable'),noProfile:false,noFye:profile.fiscal_year_end===null,noCategory:rows.some(r=>r.detail.no_category===true),errors,scheduleReason};
218: const {counts,errors}=shared;const schedule:Record<string,number>={};
219: const detail:CalendarDetail={pass_id:null,issuers_done:0,issuers_failed:0,rows:0,by_deadline_state:{},by_disclosure_state:{},upstream_unavailable:0,no_fiscal_year_end:0,no_category:0,no_profile:0};
223:  if(Object.keys(schedule).length)errors.push({code:'skipped_summary',key:'schedule_unavailable',message:JSON.stringify(schedule)});
255:  if(result.scheduleReason)bump(schedule,result.scheduleReason);
260:  for(const r of result.rows){bump(detail.by_deadline_state,r.deadline_state);bump(detail.by_disclosure_state,r.disclosure_state);}
// src/lib/dq/calendar.ts
// Filing-calendar rules (spec §6.1, plan 3 C7; CALENDAR_RULES_VERSION 'filing-calendar/1'). Pure:
// profile + per-fiscal-year filer categories + calendar filings + upstream list + today → one
// expectation row per expected report period. deadline_state (is the due date known?) and
// disclosure_state (was it received / filed upstream?) are orthogonal. Missing stays missing:
// no category for FY N−1 → no_rule; an estimated (52/53-week) period end never counts as overdue;
// an unavailable upstream lookup gives unknown_upstream, never overdue.
// Dates are ISO 'YYYY-MM-DD' strings, compared as text, computed in UTC.
import type {CalendarFiling,Market} from '../facts/types';

export const CALENDAR_RULES_VERSION='filing-calendar/1';
export type ReportKind='10-K'|'10-Q'|'20-F'|'40-F'|'annual'|'semiannual'|'q1'|'q3';
export type DeadlineState='statutory'|'estimated'|'no_rule';
export type DisclosureState='pending'|'overdue'|'filed_not_ingested'|'received'|'received_late'|'unknown_upstream';
export type Acceleration='large_accelerated'|'accelerated'|'non_accelerated';
export interface FilingProfile{issuer_id:string;market:Market;category_raw_current:string|null;regime:'10-K'|'20-F'|'40-F'|'cn';fiscal_year_end:string|null;week52_pattern:boolean;source:string;source_sha256:string|null;as_of:string}
export interface FilerCategoryRow{issuer_id:string;fiscal_year:number;acceleration:Acceleration;smaller_reporting:boolean|null;category_raw:string;source:'ixbrl_dei';accession:string;evidence_sha256:string;as_of:string}
export interface UsUpstreamEntry{form:string;reportDate:string|null;filingDate:string;accessionNumber:string}
/** Dates ISO (calendar-sync converts Tushare YYYYMMDD with ymd()). */
export interface CnScheduleRow{end_date:string;ann_date:string|null;pre_date:string|null;actual_date:string|null;modify_date:string|null}
export interface CalendarUpstream{lookup:'ok'|'unavailable'|'not_applicable';us?:UsUpstreamEntry[];cn?:CnScheduleRow[];sha256?:string}
export interface ExpectationRow{issuer_id:string;market:Market;report_kind:ReportKind;period_end:string;period_end_estimated:boolean;deadline_state:DeadlineState;due_date:string|null;due_rule:string;expected_date:string|null;upstream_lookup:'ok'|'unavailable'|'not_applicable';upstream_filed_date:string|null;disclosure_state:DisclosureState;received_filing_id:string|null;received_date:string|null;profile_as_of:string|null;detail:Record<string,unknown>}

// ---------------------------------------------------------------- dates
const DAY=86_400_000;
const ISO=/^\d{4}-\d{2}-\d{2}$/;
const toMs=(iso:string)=>{if(!ISO.test(iso))throw new Error(`invalid_date:${iso}`);return Date.UTC(+iso.slice(0,4),+iso.slice(5,7)-1,+iso.slice(8,10));};
const fromMs=(ms:number)=>new Date(ms).toISOString().slice(0,10);
export const addDays=(iso:string,n:number)=>fromMs(toMs(iso)+n*DAY);
export const diffDays=(a:string,b:string)=>Math.round((toMs(a)-toMs(b))/DAY);
/** Last day of month m (1..12; values outside 1..12 roll over years). */
export const monthEnd=(y:number,m:number)=>fromMs(Date.UTC(y,m,0));
const ym=(iso:string)=>({y:+iso.slice(0,4),m:+iso.slice(5,7)});
export const isMonthEnd=(iso:string)=>{const {y,m}=ym(iso);return monthEnd(y,m)===iso;};
/** The month end closest to the date (52/53-week period ends fall within a week of one). */
export function nearestMonthEnd(iso:string):string{
 const {y,m}=ym(iso);const cur=monthEnd(y,m),prev=monthEnd(y,m-1);
 return Math.abs(diffDays(iso,prev))<Math.abs(diffDays(cur,iso))?prev:cur;
}
/** n months later; a month-end stays a month-end, any other day is clamped to the target month's length. */
export function addMonthsAnchored(iso:string,n:number):string{
 const {y,m}=ym(iso);
 if(isMonthEnd(iso))return monthEnd(y,m+n);
 const last=monthEnd(y,m+n);
 return +iso.slice(8,10)>+last.slice(8,10)?last:`${last.slice(0,8)}${iso.slice(8,10)}`;
}
/** Fiscal year label = calendar year of the month end nearest the fiscal-year-end date (shared with filer-categories). */
export const fiscalYearOfPeriodEnd=(periodEnd:string)=>+nearestMonthEnd(periodEnd).slice(0,4);
/** Rule 12b-2 applicability: periods of fiscal year N use the category from the FY N−1 10-K cover; none → null (no_rule). */
export const applicableCategory=(categories:readonly FilerCategoryRow[],fiscalYear:number):FilerCategoryRow|null=>categories.find(c=>c.fiscal_year===fiscalYear-1)??null;

// ---------------------------------------------------------------- Rule 0-3 roll-forward
/**
 * Federal holidays (5 U.S.C. 6103) as observed — OPM "Federal Holidays" schedule
 * (https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/, checked 2026-11-05).
 * 17 CFR 240.0-3(a): papers due on a Saturday, Sunday or holiday may be filed on the first
 * business day following. 2027-12-31 is the observed New Year's Day 2028 (Jan 1 2028 is a Saturday).
 * Maintained per year; a year without an entry throws (the row becomes no_rule, never a guessed date).
 */
export const SEC_HOLIDAYS:Readonly<Record<number,readonly string[]>>={
 // 2021–2023 per the OPM schedules as published (Juneteenth from 2021; New Year 2022 observed 2021-12-31, Veterans Day 2023 observed Fri 11-10).
 2021:['2021-01-01','2021-01-18','2021-02-15','2021-05-31','2021-06-18','2021-07-05','2021-09-06','2021-10-11','2021-11-11','2021-11-25','2021-12-24','2021-12-31'],
 2022:['2022-01-17','2022-02-21','2022-05-30','2022-06-20','2022-07-04','2022-09-05','2022-10-10','2022-11-11','2022-11-24','2022-12-26'],
 2023:['2023-01-02','2023-01-16','2023-02-20','2023-05-29','2023-06-19','2023-07-04','2023-09-04','2023-10-09','2023-11-10','2023-11-23','2023-12-25'],
 2024:['2024-01-01','2024-01-15','2024-02-19','2024-05-27','2024-06-19','2024-07-04','2024-09-02','2024-10-14','2024-11-11','2024-11-28','2024-12-25'],
 2025:['2025-01-01','2025-01-20','2025-02-17','2025-05-26','2025-06-19','2025-07-04','2025-09-01','2025-10-13','2025-11-11','2025-11-27','2025-12-25'],
 2026:['2026-01-01','2026-01-19','2026-02-16','2026-05-25','2026-06-19','2026-07-03','2026-09-07','2026-10-12','2026-11-11','2026-11-26','2026-12-25'],
 2027:['2027-01-01','2027-01-18','2027-02-15','2027-05-31','2027-06-18','2027-07-05','2027-09-06','2027-10-11','2027-11-11','2027-11-25','2027-12-24','2027-12-31'],
};
/**
 * Additional days EDGAR was closed and the SEC announced filings due that day are timely on the next
 * operational business day: 2024-12-24 (sec.gov/newsroom/whats-new/edgar-closed-24-25-december-2024),
 * 2025-01-09 (national day of mourning), 2025-12-24 and 2025-12-26
 * (sec.gov/newsroom/whats-new/edgar-will-be-closed-december-24-2025-through-december-26-2025).
 */
export const SEC_CLOSURES:Readonly<Record<number,readonly string[]>>={2021:[],2022:[],2023:[],2024:['2024-12-24'],2025:['2025-01-09','2025-12-24','2025-12-26'],2026:[],2027:[]};
export class HolidayTableMissing extends Error{constructor(public readonly year:number){super(`holiday_table_missing:${year}`);this.name='HolidayTableMissing';}}
export function isSecBusinessDay(iso:string):boolean{
 const dow=new Date(toMs(iso)).getUTCDay();
 if(dow===0||dow===6)return false;
 const y=+iso.slice(0,4);const h=SEC_HOLIDAYS[y];
 if(!h)throw new HolidayTableMissing(y);
 return !h.includes(iso)&&!(SEC_CLOSURES[y]??[]).includes(iso);
}
/** Rule 0-3: a due date on a weekend, holiday or closure moves to the next SEC business day. */
export function rollForward(iso:string):string{
 let d=iso;
 for(let i=0;i<=15;i++){if(isSecBusinessDay(d))return d;d=addDays(d,1);}
 throw new Error(`roll_forward_exhausted:${iso}`);
}

// ---------------------------------------------------------------- deadlines
const US_DAYS:Record<Acceleration,{annual:number;quarterly:number;rule:string}>={
 large_accelerated:{annual:60,quarterly:40,rule:'us.laf/1'},accelerated:{annual:75,quarterly:40,rule:'us.acc/1'},non_accelerated:{annual:90,quarterly:45,rule:'us.non/1'},
};
const CN_DUE:Record<'annual'|'q1'|'semiannual'|'q3',(y:number)=>string>={annual:y=>`${y+1}-04-30`,q1:y=>`${y}-04-30`,semiannual:y=>`${y}-08-31`,q3:y=>`${y}-10-31`};
interface Deadline{state:DeadlineState;due:string|null;rule:string;detail:Record<string,unknown>}
const noRule=(rule:string,detail:Record<string,unknown>={}):Deadline=>({state:'no_rule',due:null,rule,detail});
function statutory(rule:string,raw:string,roll:boolean,detail:Record<string,unknown>={}):Deadline{
 if(!roll)return {state:'statutory',due:raw,rule,detail};
 try{return {state:'statutory',due:rollForward(raw),rule,detail};}
 catch(e){if(e instanceof HolidayTableMissing)return noRule('none.holiday_table_missing/1',{...detail,holiday_year:e.year});throw e;}
}
function deadlineOf(regime:FilingProfile['regime'],kind:ReportKind,periodEnd:string,fiscalYear:number,categories:readonly FilerCategoryRow[]):Deadline{
 if(regime==='cn')return statutory(`cn.${kind}/1`,CN_DUE[kind as keyof typeof CN_DUE](+periodEnd.slice(0,4)),false);
 if(regime==='40-F')return noRule('none.40f/1');
 if(regime==='20-F')return statutory('us.20f/1',addMonthsAnchored(periodEnd,4),true);
 const cat=applicableCategory(categories,fiscalYear);
 if(!cat)return noRule('none.no_category_for_fy/1',{fiscal_year:fiscalYear,no_category:true});
 const d=US_DAYS[cat.acceleration];
 return statutory(d.rule,addDays(periodEnd,kind==='10-K'?d.annual:d.quarterly),true,{fiscal_year:fiscalYear,category_fiscal_year:cat.fiscal_year,acceleration:cat.acceleration});
}

// ---------------------------------------------------------------- periods
const ANNUAL:Record<FilingProfile['regime'],ReportKind>={'10-K':'10-K','20-F':'20-F','40-F':'40-F',cn:'annual'};
const CN_KIND:Record<number,ReportKind>={3:'q1',6:'semiannual',9:'q3',12:'annual'};
function kindOf(regime:FilingProfile['regime'],month:number,anchor:number):ReportKind|null{
 if(regime==='cn')return CN_KIND[month]??null;
 if(month===anchor)return ANNUAL[regime];
 return regime==='10-K'?'10-Q':null;
}
/** A filing counts as received only when its run is published and its mapping generation is active (> 0); amendments never match (form_type exact). */
const counts=(f:CalendarFiling,kind:ReportKind)=>f.form_type===kind&&f.run_status==='published'&&f.mapping_gen>0&&f.period_end!==null;
export const MATCH_DAYS=7;
export const PERIODS=6;
/** Slots generated before filtering: PERIODS ended ones plus the current slot and one whose 52/53-week end may still lie after today. */
const SLOT_COUNT=PERIODS+2;
/** Months between slots: 20-F / 40-F issuers file only the annual report, so their slots are a year apart (plan audit P6). */
const strideOf=(regime:FilingProfile['regime'])=>regime==='20-F'||regime==='40-F'?12:3;
/** Earliest period_end the rules can look at (the oldest slot at the widest stride, its ±7-day match window, and one year of 52/53-week estimation basis): calendar-sync passes it as filingsForCalendar fromPeriodEnd and as the submissions coverFrom. */
export function filingsWindowStart(today:string):string{const {y,m}=ym(today);return addDays(monthEnd(y,m-12*SLOT_COUNT-12),-MATCH_DAYS);}

interface Estimate{periodEnd:string;basis:Record<string,unknown>}
/** 52/53-week estimate for the slot ending in grid month-end `grid`: latest observed actual of the same position + 364 days per year, +7 when that lands nearer the anchor month end; no observation → the grid month end. */
export function estimatePeriodEnd(grid:string,observed:readonly {date:string;source:string}[]):Estimate{
 const month=ym(grid).m;
 const prior=observed.filter(o=>ym(nearestMonthEnd(o.date)).m===month&&nearestMonthEnd(o.date)<grid).sort((a,b)=>b.date.localeCompare(a.date))[0];
 if(!prior)return {periodEnd:grid,basis:{source:'month_end'}};
 let e=prior.date;
 for(let i=0;i<10&&nearestMonthEnd(e)<grid;i++){
  const c=addDays(e,364),y=ym(c).y;
  // anchor month end nearest the candidate (a period ending in the first days of the next month belongs to the previous anchor)
  const t=[y-1,y,y+1].map(yy=>monthEnd(yy,month)).sort((a,b)=>Math.abs(diffDays(c,a))-Math.abs(diffDays(c,b)))[0];
  const c7=addDays(c,7);
  e=Math.abs(diffDays(c7,t))<Math.abs(diffDays(c,t))?c7:c;   // ties keep +364
 }
 if(nearestMonthEnd(e)!==grid)return {periodEnd:grid,basis:{source:'month_end',fallback_from:prior.date}};
 return {periodEnd:e,basis:{source:prior.source,from:prior.date}};
}

export function computeExpectations(input:{profile:FilingProfile;categories:FilerCategoryRow[];filings:CalendarFiling[];upstream:CalendarUpstream;today:string}):ExpectationRow[]{
 const {profile,categories,filings,upstream,today}=input;
 const regime=profile.regime;
 const fye=regime==='cn'?'1231':profile.fiscal_year_end;
 if(fye===null)return [];   // spec §8: no fiscal_year_end → no rows (calendar-sync counts no_fiscal_year_end)
 const week52=regime!=='cn'&&profile.week52_pattern;
 const base:Record<string,unknown>={rules_version:CALENDAR_RULES_VERSION};
 // Anchor month: the latest received annual report's actual period end wins over submissions fiscalYearEnd (§6.1).
 let anchor=ym(nearestMonthEnd(`2000-${fye.slice(0,2)}-${fye.slice(2,4)}`)).m;   // '0203' → January, '0102' → December (D2)
 const latestAnnual=filings.filter(f=>counts(f,ANNUAL[regime])).sort((a,b)=>b.period_end!.localeCompare(a.period_end!))[0];
 if(latestAnnual&&regime!=='cn'){
  const pe=latestAnnual.period_end!;const m=ym(nearestMonthEnd(pe)).m;
  if(m!==anchor||(!week52&&pe.slice(5).replace('-','')!==fye))base.fye_mismatch=true;
  anchor=m;
 }
 const usEntries=upstream.lookup==='ok'?upstream.us??[]:[];
 const cnRows=upstream.lookup==='ok'?upstream.cn??[]:[];
 // slot grid, newest first: quarter months around the anchor, or the anchor month only for annual-only regimes
 const stride=strideOf(regime);
 const slots:{grid:string;month:number}[]=[];
 for(let {y,m}=ym(today),i=0;slots.length<SLOT_COUNT&&i<SLOT_COUNT*stride+12;i++,m--){
  if(m<1){m+=12;y--;}
  if(((m-anchor)%stride+stride)%stride===0)slots.push({grid:monthEnd(y,m),month:m});
 }
 const rows:ExpectationRow[]=[];
 const planned:{grid:string;month:number;kind:ReportKind|null;periodEnd:string;estimated:boolean;received:CalendarFiling|null;basis?:Record<string,unknown>;evidenceEnd?:string}[]=[];
 for(const s of slots){
  const kind=kindOf(regime,s.month,anchor);
  if(!kind||!week52){
   const received=kind?earliest(filings.filter(f=>counts(f,kind)&&f.period_end===s.grid)):null;
   planned.push({...s,kind,periodEnd:s.grid,estimated:false,received});
   continue;
  }
  const observed=[...filings.filter(f=>counts(f,kind)).map(f=>({date:f.period_end!,source:'filing'})),...usEntries.filter(e=>e.form===kind&&e.reportDate).map(e=>({date:e.reportDate!,source:'sec_submissions'}))];
  const est=estimatePeriodEnd(s.grid,observed);
  const matches=filings.filter(f=>counts(f,kind)&&Math.abs(diffDays(f.period_end!,est.periodEnd))<=MATCH_DAYS);
  const received=earliest(matches);
  if(received)planned.push({...s,kind,periodEnd:received.period_end!,estimated:false,received,basis:{replaced_estimate:est.periodEnd}});
  else{
   // upstream evidence is matched before the ended-slot cut: an actual report date before today makes the slot ended (D3)
   const evidence=usEntries.filter(e=>e.form===kind&&e.reportDate!==null&&Math.abs(diffDays(e.reportDate,est.periodEnd))<=MATCH_DAYS).map(e=>e.reportDate!).sort()[0];
   planned.push({...s,kind,periodEnd:est.periodEnd,estimated:true,received:null,basis:est.basis,evidenceEnd:evidence});
  }
 }
 // applicable report kinds first, THEN the PERIODS limit (plan audit P6: a slot without a kind never takes a place)
 const ended=planned.filter(p=>p.kind!==null&&(p.periodEnd<today||(p.evidenceEnd!==undefined&&p.evidenceEnd<today))).slice(0,PERIODS);
 for(const p of ended){
  if(!p.kind)continue;
  const monthsAhead=((anchor-p.month)%12+12)%12;
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
97-- 联邦假日（5 U.S.C. 6103，按 OPM 公布的观察日）：https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/ ，2026-11-06 抓取 200，页面只列当前及后续年份：2026 与 2027 两张表逐日与 `SEC_HOLIDAYS` 一致（2026：01-01、01-19、02-16、05-25、06-19、07-03、09-07、10-12、11-11、11-26、12-25；2027：01-01、01-18、02-15、05-31、06-18、07-05、09-06、10-11、11-11、11-25、12-24）。OPM 2028 表首行 "Friday, December 31 * New Year's Day" 即 2027-12-31（2028 元旦周六的观察日），与 `SEC_HOLIDAYS[2027]` 第 12 项一致。
98-- 2021–2025（审查 D4 把表扩到 2021）：OPM 页面不含这些年份，**未能联网复核**，取自规划时核对与实施者对 5 U.S.C. 6103 观察日规则的推算：2021 为 12 项（含首次的 Juneteenth 观察日 06-18，及 2022 元旦周六的观察日 2021-12-31）、2022 为 10 项（元旦已观察在 2021-12-31；Juneteenth 周日→06-20；圣诞周日→12-26）、2023 为 11 项（元旦周日→01-02；老兵节周六→11-10）、2024 与 2025 各 11 项。
99-- EDGAR 额外关闭日（SEC 公告：到期申报顺延至下一个运营营业日）：2026-11-06 用默认 SEC User-Agent（`DEFAULT_USER_AGENT`，`src/lib/research/ingest/collectors/shared.ts`）各抓取一次，均 HTTP 200。`edgar-closed-24-25-december-2024`：EDGAR 于 2024-12-24 与 12-25 关闭，"Filings required to be made on Tuesday, December 24 and Wednesday, December 25 will be considered timely if filed on December 26, 2024"，与 `SEC_CLOSURES[2024]` 一致。`edgar-will-be-closed-december-24-2025-through-december-26-2025`：2025-12-24 与 12-26（及 12-25）关闭，12-29 恢复，与 `SEC_CLOSURES[2025]` 一致。2025-01-09（卡特总统国丧日）无单独链接，**未复核**（取自规划时核对）。此前同日首次抓取（描述性 User-Agent、无邮箱）两页均 403，已被本次结果取代。
100-- 维护：`src/lib/dq/calendar.ts::SEC_HOLIDAYS/SEC_CLOSURES` 每年 12 月补次年；临时关闭按 SEC 公告补入 `SEC_CLOSURES`；表外年份的期限行为 `no_rule`（`none.holiday_table_missing/1`），不猜；`rollForward` 在 15 天内找不到营业日则抛错。
101-
102:## CN disclosure_date 真实响应核对 (2026-11-06)
103-
104-目的：规格 §6.1 T15 要求 `CN_DISCLOSURE_VERIFIED` 翻 `true` 之前用真实响应核对 `disclosure_date` 的语义。owner 提供了 `TUSHARE_TOKEN`（`~/.config/osbornalpha/secrets.env`，不入库、不打印、不进夹具），本次取代计划的"无 token 降级"步骤。
105-
106-**请求与夹具。** 经已落地的 `tushareCallRaw('disclosure_date', {ts_code}, DISCLOSURE_FIELDS)`（`DISCLOSURE_FIELDS='ts_code,ann_date,end_date,pre_date,actual_date,modify_date'`）各取一次，字节原样存为 `src/lib/dq/fixtures/tushare/disclosure_date.<ts_code>.json`，旁带 `.meta.json`（api、params、fields、sha256、fetched_at、http_status、code、msg、request_id；无 token，已对夹具全文检索 token 值：0 处命中）。
107-
108-| ts_code | 行数 | sha256 | fetched_at |
109-|---|---|---|---|
110-| 600519.SH | 101（2001-06-30 … 2026-09-30，每个季末一行，无重复 end_date） | `a873400c9d8cd5a762dfbb87923987c0a57d12cc03e89e3bef48f06859fbc825` | 2026-11-07T01:24Z |
111-| 000333.SZ | 53（2013-09-30 … 2026-09-30） | `f69c95b7db4dd242c1af2c3b7b08c99293aa3e9157ebba342893739fe0872a51` | 2026-11-07T01:24Z |
112-
113-**权限/积分。** 两次均 HTTP 200、`code=0`、`msg=""`；没有积分或权限错误。返回字段与 `DISCLOSURE_FIELDS` 完全一致、顺序一致。单个 ts_code 一次返回全部历史（`has_more=false`），日期均为 `YYYYMMDD` 字符串，缺失为 JSON `null`。
114-
115-**字段语义（实测）。**
116-
117-- `end_date`：报告期末，恒为 0331/0630/0930/1231。与 `CnScheduleRow.end_date` 一致。
118-- `actual_date`：**该期定期报告的实际披露日**。与计划二夹具 `src/lib/facts/fixtures/tushare/<ts_code>.*.income.rt1.p1.json` 的 `ann_date`（利润表原始披露公告日）逐期比对：夹具覆盖的 44 期里 600519.SH 44/44、000333.SZ 44/44 相等（其余期间早于夹具 `start_date=20160101`，无法比对），同样 44/44 也等于 `f_ann_date`；零不一致。该比对固化为单测 `src/lib/dq/disclosure-fixtures.test.ts`。
119-- `pre_date`：交易所预约披露日。两只样本里 `pre_date` 与 `actual_date` 在每一行都相同（提前或推迟披露的情形在样本外出现，见下）。
120-- `ann_date`：**不是**报告披露日，而是预约披露记录的公告日（不晚于 `actual_date`；很多行等于 `end_date`，如 000333.SZ 26/53 行；也有早到数周的，如 600519.SH 20251231 期 `ann_date=20251225`）。`computeExpectations` 只用它给同一 `end_date` 的多行排序，不用作披露日。
121-- `modify_date`：预约披露日被修改时的记录日期，绝大多数行为 `null`（两只样本各 2 行非空）；非空时该日期可晚于 `actual_date`（000333.SZ 2013 年报：`pre/actual=20140329`、`modify=20140403`），所以它是修订记录的时间戳，不是披露日。`computeExpectations` 只据其非空打 `detail.schedule_modified`，与实测一致。
122-- 全市场补充探测（`end_date` 参数、不带 `ts_code`，不存夹具）核对 `actual_date` 在未披露时的取值：`end_date=20260930` 返回 5587 行，其中 `actual_date=null` 6 行（均有 `pre_date`，如 `pre_date=20261029`）、`actual_date≠pre_date` 16 行（提前/推迟披露，如 `pre=20261023 actual=20261017`）、`modify_date` 非空 13 行；`end_date=20260630` 5561 行，null 11、不等 5、modify 19；没有任何 `actual_date` 晚于核对日 2026-11-06 的行；`end_date=20261231`（尚未到期的期间）0 行。结论：已披露 → `actual_date` 为实际披露日；已预约未披露 → `actual_date=null` 且 `pre_date` 为预约日，正是 `computeExpectations` 的用法（`actual_date` 非空 → `filed_not_ingested`，否则 `expected_date=pre_date`）。
123-
124-**结论。** 语义与计划一致：`actual_date` = 定期报告实际披露日，`end_date` = 报告期末，`modify_date` = 预约日修订记录，`ann_date` = 预约记录公告日。`parseDisclosureDate` 解析两份夹具全部行。据此 `CN_DISCLOSURE_VERIFIED` 翻 `true`（独立提交）。
125-
126-**保留事项（不阻塞翻开关）。** (1) Tushare 对尚无预约记录的期间不返回行（`end_date=20261231` 为 0 行；记录在期末当日即出现，`ann_date=end_date`），所以"上游成功但该期无行"= 暂无预约，日历按法定期限给 `pending`/`overdue`，若 Tushare 回填滞后可能把一个期限已过但行未到的期间标 `overdue`；这是 CN 数据延迟的固有风险，已由 `detail.schedule_*` 之外的行级 `upstream_sha256` 留证。(2) 只核对了两只 A 股的整历史与两个报告期的全市场形状；北交所（`.BJ`）未单独抽查。

exec
/bin/zsh -lc "sed -n '100,195p' src/lib/dq/calendar-sync.ts; cat src/lib/dq/disclosure-fixtures.test.ts; cat package.json | grep -A20 scripts; for d in .claude .claude/worktrees src src/lib src/lib/dq; do for f in AGENTS.md AGENTS.override.md; do test "'! -f "$d/$f" || cat "$d/$f"; done; done; git log -4 --oneline 363f207' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
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
// Recorded real Tushare disclosure_date responses (2026-11-06, verification.md "CN disclosure_date 真实响应核对"):
// parseDisclosureDate must read every recorded row, and actual_date must equal the announcement date the plan-2
// income rt1 fixtures record for the same period (the semantic check behind CN_DISCLOSURE_VERIFIED).
import {createHash} from 'node:crypto';
import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';
import {DISCLOSURE_FIELDS,parseDisclosureDate} from './calendar-sync';

const DIR=join(__dirname,'fixtures/tushare');
const FACTS=join(__dirname,'../facts/fixtures/tushare');
const load=(ts:string)=>{
 const bytes=readFileSync(join(DIR,`disclosure_date.${ts}.json`));
 const meta=JSON.parse(readFileSync(join(DIR,`disclosure_date.${ts}.meta.json`),'utf8')) as {api:string;params:{ts_code:string};fields:string;sha256:string;code:number};
 const data=(JSON.parse(bytes.toString('utf8')) as {data:{fields:string[];items:unknown[][]}}).data;
 return {bytes,meta,data};
};
const iso=(s:string)=>`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
/** income rt1 (original publication) ann_date by end_date, from the plan-2 fixture. */
function incomeAnn(ts:string):Map<string,string[]>{
 const file=readdirSync(FACTS).sort().find(f=>f.startsWith(`${ts}.`)&&f.includes('.income.rt1.')&&!f.endsWith('.meta.json'))!;
 const d=(JSON.parse(readFileSync(join(FACTS,file),'utf8')) as {data:{fields:string[];items:unknown[][]}}).data;
 const e=d.fields.indexOf('end_date'),a=d.fields.indexOf('ann_date');
 const m=new Map<string,string[]>();
 for(const it of d.items)m.set(String(it[e]),[...(m.get(String(it[e]))??[]),String(it[a])]);
 return m;
}

describe.each(['600519.SH','000333.SZ'])('recorded disclosure_date %s',ts=>{
 const {bytes,meta,data}=load(ts);
 it('is a verbatim recording: sha256 matches the meta, field list is DISCLOSURE_FIELDS, no secrets',()=>{
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(meta.sha256);
  expect(meta).toMatchObject({api:'disclosure_date',params:{ts_code:ts},fields:DISCLOSURE_FIELDS,code:0});
  expect(data.fields.join(',')).toBe(DISCLOSURE_FIELDS);
  expect(JSON.stringify(meta)).not.toMatch(/token/i);
 });
 it('parseDisclosureDate reads every recorded row into ISO dates',()=>{
  const rows=parseDisclosureDate(data);
  expect(rows).toHaveLength(data.items.length);
  expect(rows.length).toBeGreaterThan(40);
  for(const r of rows){
   expect(r.end_date).toMatch(/^\d{4}-(03-31|06-30|09-30|12-31)$/);
   expect(r.pre_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
   expect(r.actual_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
   expect(r.ann_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
   if(r.modify_date!==null)expect(r.modify_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  }
  expect(new Set(rows.map(r=>r.end_date)).size).toBe(rows.length);   // one row per period end
 });
 it('actual_date is the announcement date of the periodic report: equals income rt1 ann_date for every period both files cover',()=>{
  const ann=incomeAnn(ts);
  const rows=parseDisclosureDate(data);
  let compared=0;
  for(const r of rows){
   const a=ann.get(r.end_date.replaceAll('-',''));
   if(!a)continue;
   compared++;
   expect(a.map(iso),r.end_date).toContain(r.actual_date);
  }
  expect(compared).toBeGreaterThanOrEqual(40);
 });
});
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
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-LzZ3w9Dx' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-qiSUEz6E' (errno=Operation not permitted)
363f207b feat(dq): CN_DISCLOSURE_VERIFIED=true after real Tushare disclosure_date check
f82be60a test(dq): record real Tushare disclosure_date responses and verify their semantics
46c5b70f feat(dq): filing-calendar cron, script, production wiring and critical integration suite
f272c11c feat(admin/dq): calendar, claims and per-pair reconciliation blocks with a market filter, server-computed restorable

codex
The flag enables existing CN disclosure handling after the preceding commit recorded and verified real response semantics. The updated test matches that behavior; no actionable regressions were identified.
The flag enables existing CN disclosure handling after the preceding commit recorded and verified real response semantics. The updated test matches that behavior; no actionable regressions were identified.

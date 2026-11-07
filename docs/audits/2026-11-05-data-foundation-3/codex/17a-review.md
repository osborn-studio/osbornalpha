OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b157-1b7f-7f73-8fdc-602bd6800118
--------
user
commit 8081cb1
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 8081cb1; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 1400ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-VeGXtbOY' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-Ewjxr2Bu' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/17a-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-uR48ZeBV' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-a5SwU2jF' (errno=Operation not permitted)
8081cb1c feat(dq): filing-calendar rules (deadline table, Rule 0-3 roll-forward, 52/53-week estimates, status matrix)
 .../2026-11-05-data-foundation-3/verification.md   |   7 +
 src/lib/dq/calendar.test.ts                        | 233 +++++++++++++++++++++
 src/lib/dq/calendar.ts                             | 213 +++++++++++++++++++
 3 files changed, 453 insertions(+)

exec
/bin/zsh -lc 'pwd; for p in . .. ../.. ../../.. ../../../..; do ls "$p"/AGENTS* "$p"/CLAUDE.md 2>/dev/null; done; cat src/lib/dq/calendar.ts; cat src/lib/dq/calendar.test.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
zsh:1: no matches found: ./AGENTS*
zsh:1: no matches found: ../AGENTS*
zsh:1: no matches found: ../../AGENTS*
../../../AGENTS.md
zsh:1: no matches found: ../../../../AGENTS*
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
export const SEC_CLOSURES:Readonly<Record<number,readonly string[]>>={2024:['2024-12-24'],2025:['2025-01-09','2025-12-24','2025-12-26'],2026:[],2027:[]};
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
 let d=iso;for(let i=0;i<15&&!isSecBusinessDay(d);i++)d=addDays(d,1);
 return d;
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
/** 52/53-week estimate for the slot ending in grid month-end `grid`: latest observed actual of the same position + 364 days per year (+7 when the result leaves the anchor month); no observation → the grid month end. */
export function estimatePeriodEnd(grid:string,observed:readonly {date:string;source:string}[]):Estimate{
 const month=ym(grid).m;
 const prior=observed.filter(o=>ym(nearestMonthEnd(o.date)).m===month&&nearestMonthEnd(o.date)<grid).sort((a,b)=>b.date.localeCompare(a.date))[0];
 if(!prior)return {periodEnd:grid,basis:{source:'month_end'}};
 let e=prior.date;
 for(let i=0;i<10&&nearestMonthEnd(e)<grid;i++){e=addDays(e,364);if(ym(e).m!==month)e=addDays(e,7);}
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
 let anchor=+fye.slice(0,2);
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
 const planned:{grid:string;month:number;kind:ReportKind|null;periodEnd:string;estimated:boolean;received:CalendarFiling|null;basis?:Record<string,unknown>}[]=[];
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
  else planned.push({...s,kind,periodEnd:est.periodEnd,estimated:true,received:null,basis:est.basis});
 }
 // applicable report kinds first, THEN the PERIODS limit (plan audit P6: a slot without a kind never takes a place)
 const ended=planned.filter(p=>p.kind!==null&&p.periodEnd<today).slice(0,PERIODS);
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
// src/lib/dq/calendar.test.ts
import {describe,expect,it} from 'vitest';
import {SEC_HOLIDAYS,addMonthsAnchored,applicableCategory,computeExpectations,estimatePeriodEnd,filingsWindowStart,fiscalYearOfPeriodEnd,isSecBusinessDay,nearestMonthEnd,rollForward} from './calendar';
import type {CalendarUpstream,ExpectationRow,FilerCategoryRow,FilingProfile} from './calendar';
import type {CalendarFiling} from '../facts/types';

const ISSUER='00000000-0000-4000-8000-0000000000c1';
const profile=(p:Partial<FilingProfile>={}):FilingProfile=>({issuer_id:ISSUER,market:'US',category_raw_current:'Large accelerated filer',regime:'10-K',fiscal_year_end:'1231',week52_pattern:false,source:'sec_submissions',source_sha256:'s'.repeat(64),as_of:'2026-11-01',...p});
const cat=(fy:number,acceleration:FilerCategoryRow['acceleration']):FilerCategoryRow=>({issuer_id:ISSUER,fiscal_year:fy,acceleration,smaller_reporting:null,category_raw:acceleration,source:'ixbrl_dei',accession:`0000000000-${fy}-000001`,evidence_sha256:'e'.repeat(64),as_of:'2026-11-01'});
let n=0;
// complete C4 CalendarFiling (FilingRow incl. acceptance_source) before the override spread (plan audit P9)
const filing=(form:CalendarFiling['form_type'],periodEnd:string,available:string,p:Partial<CalendarFiling>={}):CalendarFiling=>({filing_id:`10000000-0000-4000-8000-${String(++n).padStart(12,'0')}`,issuer_id:ISSUER,market:'US',source:'edgar',origin:'sec',form_type:form,fiscal_year:null,fiscal_period:null,period_end:periodEnd,available_date:available,source_ref:`acc-${n}`,url:null,document_ref:null,document_url:null,link_attempts:0,mapping_gen:1,run_id:'r',created_at:`${available}T00:00:00Z`,run_status:'published',accepted_at:null,acceptance_source:null,...p});
const OK:CalendarUpstream={lookup:'ok',us:[]};
const run=(o:{profile?:Partial<FilingProfile>;categories?:FilerCategoryRow[];filings?:CalendarFiling[];upstream?:CalendarUpstream;today?:string})=>
 computeExpectations({profile:profile(o.profile),categories:o.categories??[cat(2024,'accelerated'),cat(2025,'large_accelerated')],filings:o.filings??[],upstream:o.upstream??OK,today:o.today??'2026-11-05'});
const at=(rows:ExpectationRow[],periodEnd:string)=>{const r=rows.find(x=>x.period_end===periodEnd);if(!r)throw new Error(`no row ${periodEnd}: ${rows.map(x=>x.period_end).join(',')}`);return r;};

describe('Rule 0-3 roll-forward',()=>{
 it.each([
  ['2026-03-01','2026-03-02','Sunday → Monday'],
  ['2026-02-28','2026-03-02','Saturday → Monday'],
  ['2025-11-27','2025-11-28','Thanksgiving → Friday'],
  ['2026-07-03','2026-07-06','observed Independence Day (Fri) + weekend → Monday'],
  ['2025-12-24','2025-12-29','EDGAR closures 12-24 and 12-26 around Christmas → Monday'],
  ['2024-12-24','2024-12-26','EDGAR closure + Christmas → Thursday'],
  ['2025-01-09','2025-01-10','national day of mourning closure → Friday'],
  ['2027-12-31','2028-01-03','observed New Year 2028 on 2027-12-31 → next year (needs 2028 table)'],
  ['2026-03-16','2026-03-16','business day unchanged'],
 ])('%s → %s (%s)',(d,want)=>{
  if(want.startsWith('2028'))expect(()=>rollForward(d)).toThrow('holiday_table_missing:2028');
  else expect(rollForward(d)).toBe(want);
 });
 it('covers 2024–2027 with 11 federal holidays each (12 in 2027 with the observed New Year 2028) and refuses other years',()=>{
  expect(Object.keys(SEC_HOLIDAYS)).toEqual(['2024','2025','2026','2027']);
  expect([2024,2025,2026].map(y=>SEC_HOLIDAYS[y].length)).toEqual([11,11,11]);
  expect(SEC_HOLIDAYS[2027]).toHaveLength(12);
  for(const y of [2024,2025,2026,2027])for(const d of SEC_HOLIDAYS[y]){expect(d.startsWith(String(y))).toBe(true);expect(isSecBusinessDay(d)).toBe(false);}
  expect(()=>isSecBusinessDay('2023-12-29')).toThrow('holiday_table_missing:2023');
 });
});

describe('date helpers',()=>{
 it('nearest month end, anchored months and fiscal-year labels',()=>{
  expect(nearestMonthEnd('2025-09-27')).toBe('2025-09-30');
  expect(nearestMonthEnd('2025-10-02')).toBe('2025-09-30');
  expect(nearestMonthEnd('2025-01-02')).toBe('2024-12-31');
  expect(addMonthsAnchored('2025-12-31',4)).toBe('2026-04-30');
  expect(addMonthsAnchored('2025-06-30',4)).toBe('2025-10-31');
  expect(addMonthsAnchored('2025-09-27',4)).toBe('2026-01-27');
  expect(addMonthsAnchored('2025-10-31',4)).toBe('2026-02-28');
  expect(fiscalYearOfPeriodEnd('2025-01-02')).toBe(2024);
  expect(fiscalYearOfPeriodEnd('2025-09-27')).toBe(2025);
 });
 it('applies the FY N−1 cover category to fiscal year N and nothing else',()=>{
  const cs=[cat(2024,'accelerated'),cat(2025,'large_accelerated')];
  expect(applicableCategory(cs,2026)?.acceleration).toBe('large_accelerated');
  expect(applicableCategory(cs,2025)?.acceleration).toBe('accelerated');
  expect(applicableCategory(cs,2024)).toBeNull();
 });
});

describe('deadline table (10-K regime, FYE 12-31, today 2026-11-05)',()=>{
 const rows=run({});
 it('expects the 6 most recent ended quarter periods, newest first, 10-K at the fiscal year end',()=>{
  expect(rows.map(r=>[r.period_end,r.report_kind])).toEqual([['2026-09-30','10-Q'],['2026-06-30','10-Q'],['2026-03-31','10-Q'],['2025-12-31','10-K'],['2025-09-30','10-Q'],['2025-06-30','10-Q']]);
 });
 it.each([
  ['2026-09-30','2026-11-09','us.laf/1','FY2026 uses the FY2025 cover (large accelerated): +40 = Mon 11-09'],
  ['2026-06-30','2026-08-10','us.laf/1','+40 = Sun 08-09 → Mon 08-10'],
  ['2026-03-31','2026-05-11','us.laf/1','+40 = Sun 05-10 → Mon 05-11'],
  ['2025-12-31','2026-03-16','us.acc/1','the FY2025 10-K uses the FY2024 cover (accelerated): +75 = Mon 03-16'],
  ['2025-09-30','2025-11-10','us.acc/1','+40 = Sun 11-09 → Mon 11-10'],
  ['2025-06-30','2025-08-11','us.acc/1','+40 = Sat 08-09 → Mon 08-11'],
 ])('%s due %s by %s (%s)',(pe,due,rule)=>{
  const r=at(rows,pe);
  expect(r).toMatchObject({deadline_state:'statutory',due_date:due,due_rule:rule,period_end_estimated:false});
 });
 it('large accelerated 10-K is +60 rolled past a Sunday; non-accelerated is +90 / +45',()=>{
  const laf=run({categories:[cat(2024,'large_accelerated'),cat(2025,'large_accelerated')]});
  expect(at(laf,'2025-12-31')).toMatchObject({due_date:'2026-03-02',due_rule:'us.laf/1'});
  const non=run({categories:[cat(2024,'non_accelerated'),cat(2025,'non_accelerated')]});
  expect(at(non,'2025-12-31')).toMatchObject({due_date:'2026-03-31',due_rule:'us.non/1'});
  expect(at(non,'2026-09-30')).toMatchObject({due_date:'2026-11-16',due_rule:'us.non/1'});   // +45 = Sat 11-14 → Mon 11-16
 });
 it('a fiscal year without an FY N−1 cover category has no rule and no due date',()=>{
  const r=run({categories:[cat(2025,'large_accelerated')]});
  expect(at(r,'2025-12-31')).toMatchObject({deadline_state:'no_rule',due_date:null,due_rule:'none.no_category_for_fy/1',disclosure_state:'pending'});
  expect(at(r,'2025-12-31').detail).toMatchObject({no_category:true,fiscal_year:2025});
  expect(at(r,'2026-09-30').deadline_state).toBe('statutory');
 });
 it('20-F: six ended annual periods (annual-only slots a year apart, plan audit P6), due 4 months later; years without a holiday table are no_rule; no quarterly rows',()=>{
  const r=run({profile:{regime:'20-F'}});
  expect(r.map(x=>[x.report_kind,x.period_end,x.due_date,x.due_rule])).toEqual([
   ['20-F','2025-12-31','2026-04-30','us.20f/1'],['20-F','2024-12-31','2025-04-30','us.20f/1'],['20-F','2023-12-31','2024-04-30','us.20f/1'],
   ['20-F','2022-12-31',null,'none.holiday_table_missing/1'],['20-F','2021-12-31',null,'none.holiday_table_missing/1'],['20-F','2020-12-31',null,'none.holiday_table_missing/1']]);
  expect(r[3].detail).toMatchObject({holiday_year:2023});
 });
 it('40-F: six ended annual periods, no rule, and can still be received (plan audit P6)',()=>{
  const f=filing('40-F','2025-12-31','2026-03-20');
  const r=run({profile:{regime:'40-F'},filings:[f]});
  expect(r).toHaveLength(6);
  expect(r.map(x=>[x.report_kind,x.period_end,x.deadline_state,x.disclosure_state])).toEqual(['2025','2024','2023','2022','2021','2020'].map((y,i)=>['40-F',`${y}-12-31`,'no_rule',i===0?'received':'pending']));
  expect(r[0]).toMatchObject({deadline_state:'no_rule',due_rule:'none.40f/1',due_date:null,disclosure_state:'received',received_filing_id:f.filing_id,received_date:'2026-03-20'});
 });
 it('filingsWindowStart covers the oldest annual slot, its match window and one year of 52/53-week basis (plan audit P6)',()=>{
  expect(filingsWindowStart('2026-11-05')).toBe('2017-11-23');   // month end 108 months back (2017-11-30) − 7 days
  const oldest=run({profile:{regime:'20-F'}}).at(-1)!.period_end;
  expect(filingsWindowStart('2026-11-05')<oldest).toBe(true);
 });
 it('no fiscal_year_end → no rows',()=>{expect(run({profile:{fiscal_year_end:null}})).toEqual([]);});
 it('a fiscal year end that differs from the latest received 10-K: anchor on the 10-K and flag fye_mismatch',()=>{
  const r=run({profile:{fiscal_year_end:'1231'},filings:[filing('10-K','2025-09-30','2025-11-20')]});
  expect(r.map(x=>[x.period_end,x.report_kind])).toEqual([['2026-09-30','10-K'],['2026-06-30','10-Q'],['2026-03-31','10-Q'],['2025-12-31','10-Q'],['2025-09-30','10-K'],['2025-06-30','10-Q']]);
  expect(r.every(x=>x.detail.fye_mismatch===true)).toBe(true);
 });
});

describe('status matrix',()=>{
 const today='2026-11-05';
 it('received on time, received late, and amendments / staged / inactive generations never count',()=>{
  const onTime=filing('10-Q','2026-06-30','2026-08-03');
  const late=filing('10-Q','2026-03-31','2026-05-20');
  const amended=filing('10-Q/A','2025-09-30','2025-11-01');
  const staged=filing('10-Q','2025-06-30','2025-08-01',{run_status:'staged'});
  const gen0=filing('10-K','2025-12-31','2026-02-20',{mapping_gen:0});
  const r=run({filings:[onTime,late,amended,staged,gen0],today});
  expect(at(r,'2026-06-30')).toMatchObject({disclosure_state:'received',received_filing_id:onTime.filing_id,received_date:'2026-08-03'});
  expect(at(r,'2026-03-31')).toMatchObject({disclosure_state:'received_late',received_date:'2026-05-20'});
  expect(at(r,'2025-09-30')).toMatchObject({disclosure_state:'overdue',received_filing_id:null});
  expect(at(r,'2025-06-30')).toMatchObject({disclosure_state:'overdue',received_filing_id:null});
  expect(at(r,'2025-12-31')).toMatchObject({disclosure_state:'overdue',received_filing_id:null});
 });
 it('the first disclosure wins when two filings report the same period',()=>{
  const a=filing('10-Q','2026-06-30','2026-08-05'),b=filing('10-Q','2026-06-30','2026-08-01');
  expect(at(run({filings:[a,b]}),'2026-06-30').received_filing_id).toBe(b.filing_id);
 });
 it('filed upstream but not ingested (reportDate within ±7 days, exact form) beats overdue',()=>{
  const up:CalendarUpstream={lookup:'ok',us:[{form:'10-Q',reportDate:'2026-06-30',filingDate:'2026-08-04',accessionNumber:'0000000001-26-000010'},{form:'10-Q/A',reportDate:'2026-03-31',filingDate:'2026-05-01',accessionNumber:'x'}]};
  const r=run({upstream:up});
  expect(at(r,'2026-06-30')).toMatchObject({disclosure_state:'filed_not_ingested',upstream_filed_date:'2026-08-04',upstream_lookup:'ok'});
  expect(at(r,'2026-06-30').detail.upstream_accession).toBe('0000000001-26-000010');
  expect(at(r,'2026-03-31').disclosure_state).toBe('overdue');
 });
 it('pending before the due date, overdue after it; unknown_upstream when the lookup is unavailable, never overdue',()=>{
  const r=run({});
  expect(at(r,'2026-09-30')).toMatchObject({disclosure_state:'pending',due_date:'2026-11-09'});
  expect(at(r,'2026-06-30').disclosure_state).toBe('overdue');
  const u=run({upstream:{lookup:'unavailable'}});
  expect(u.every(x=>x.disclosure_state==='unknown_upstream'&&x.upstream_lookup==='unavailable')).toBe(true);
  const f=filing('10-Q','2026-06-30','2026-08-03');
  expect(at(run({upstream:{lookup:'unavailable'},filings:[f]}),'2026-06-30')).toMatchObject({disclosure_state:'received',upstream_lookup:'unavailable'});
 });
 it('a no_rule row past any date stays pending',()=>{
  const r=run({categories:[]});
  expect(r.every(x=>x.deadline_state==='no_rule'&&x.disclosure_state==='pending'&&x.due_date===null)).toBe(true);
 });
 it('rows carry the profile as_of and the rules version',()=>{
  const r=run({});
  expect(r.every(x=>x.profile_as_of==='2026-11-01'&&x.detail.rules_version==='filing-calendar/1'&&x.market==='US'&&x.issuer_id===ISSUER)).toBe(true);
 });
 it('a due date in a year without a holiday table becomes no_rule (no guessed date)',()=>{
  const r=run({today:'2027-12-01',categories:[cat(2026,'non_accelerated'),cat(2027,'non_accelerated')]});
  expect(at(r,'2027-09-30')).toMatchObject({deadline_state:'statutory',due_date:'2027-11-15'});   // +45 = Sun 11-14 → Mon 11-15
  const late=run({today:'2028-02-15',categories:[cat(2026,'non_accelerated'),cat(2027,'non_accelerated')]});
  expect(at(late,'2027-12-31')).toMatchObject({deadline_state:'no_rule',due_rule:'none.holiday_table_missing/1',due_date:null});
  expect(at(late,'2027-12-31').detail.holiday_year).toBe(2028);
 });
});

describe('52/53-week filers',()=>{
 const wk=(p:Partial<FilingProfile>={})=>({fiscal_year_end:'0927',week52_pattern:true,...p});
 const history=[filing('10-K','2025-09-27','2025-10-31'),filing('10-Q','2025-06-28','2025-08-01'),filing('10-Q','2025-03-29','2025-05-02'),filing('10-Q','2024-12-28','2025-01-31')];
 it('estimates unreceived periods from the latest actual of the same position (+364), marks them estimated, never overdue',()=>{
  const r=run({profile:wk(),filings:history,categories:[cat(2024,'large_accelerated'),cat(2025,'large_accelerated')]});
  expect(r.map(x=>[x.period_end,x.report_kind,x.period_end_estimated])).toEqual([
   ['2026-09-26','10-K',true],['2026-06-27','10-Q',true],['2026-03-28','10-Q',true],['2025-12-27','10-Q',true],['2025-09-27','10-K',false],['2025-06-28','10-Q',false]]);
  const est=at(r,'2026-06-27');
  expect(est).toMatchObject({deadline_state:'estimated',due_rule:'us.laf/1/est',due_date:'2026-08-06',disclosure_state:'pending'});
  expect(est.detail).toMatchObject({estimated_due_passed:true,estimate_basis:{source:'filing',from:'2025-06-28'}});
  expect(r.some(x=>x.disclosure_state==='overdue')).toBe(false);
  expect(at(r,'2025-09-27')).toMatchObject({deadline_state:'statutory',disclosure_state:'received'});
 });
 it('a received filing within ±7 days of the estimate replaces it with the actual period end',()=>{
  const actual=filing('10-Q','2026-06-27','2026-07-31');
  const r=run({profile:wk(),filings:[...history,actual],categories:[cat(2024,'large_accelerated'),cat(2025,'large_accelerated')]});
  expect(at(r,'2026-06-27')).toMatchObject({period_end_estimated:false,deadline_state:'statutory',due_rule:'us.laf/1',disclosure_state:'received',received_filing_id:actual.filing_id});
  const off=filing('10-Q','2026-07-06','2026-08-01');   // 9 days off the estimate: not this period
  expect(at(run({profile:wk(),filings:[...history,off]}),'2026-06-27').period_end_estimated).toBe(true);
 });
 it('+364 per missing year, +7 when the step leaves the anchor month; no observation → the month end',()=>{
  expect(estimatePeriodEnd('2023-09-30',[{date:'2022-09-24',source:'filing'}])).toEqual({periodEnd:'2023-09-23',basis:{source:'filing',from:'2022-09-24'}});
  expect(estimatePeriodEnd('2026-09-30',[{date:'2024-09-28',source:'filing'}]).periodEnd).toBe('2026-09-26');
  expect(estimatePeriodEnd('2025-01-31',[{date:'2024-02-03',source:'filing'}]).periodEnd).toBe('2025-02-08');
  expect(estimatePeriodEnd('2026-03-31',[])).toEqual({periodEnd:'2026-03-31',basis:{source:'month_end'}});
 });
 it('uses SEC submissions reportDate as an estimation basis when no filing is stored',()=>{
  const up:CalendarUpstream={lookup:'ok',us:[{form:'10-Q',reportDate:'2025-06-28',filingDate:'2025-08-01',accessionNumber:'a1'}]};
  const r=run({profile:wk(),upstream:up});
  expect(at(r,'2026-06-27').detail.estimate_basis).toEqual({source:'sec_submissions',from:'2025-06-28'});
  expect(at(r,'2025-06-30')).toMatchObject({disclosure_state:'filed_not_ingested',period_end_estimated:true,upstream_filed_date:'2025-08-01'});   // no earlier June observation: month-end estimate, upstream entry within ±7 days
 });
});

describe('CN statutory nodes',()=>{
 const cn=(o:{filings?:CalendarFiling[];upstream?:CalendarUpstream;today?:string}={})=>computeExpectations({profile:profile({market:'CN',regime:'cn',fiscal_year_end:'1231',category_raw_current:null,source:'cn_statutory',source_sha256:null}),categories:[],filings:o.filings??[],upstream:o.upstream??{lookup:'ok',cn:[]},today:o.today??'2026-11-05'});
 it('annual by 04-30 of the next year, Q1 04-30, H1 08-31, Q3 10-31, never rolled forward',()=>{
  expect(cn().map(r=>[r.period_end,r.report_kind,r.due_date,r.due_rule])).toEqual([
   ['2026-09-30','q3','2026-10-31','cn.q3/1'],['2026-06-30','semiannual','2026-08-31','cn.semiannual/1'],['2026-03-31','q1','2026-04-30','cn.q1/1'],
   ['2025-12-31','annual','2026-04-30','cn.annual/1'],['2025-09-30','q3','2025-10-31','cn.q3/1'],['2025-06-30','semiannual','2025-08-31','cn.semiannual/1']]);
 });
 it('expected_date from the latest-announced schedule row of the same end_date; actual_date → filed_not_ingested; modify_date flagged',()=>{
  const up:CalendarUpstream={lookup:'ok',cn:[
   {end_date:'2026-09-30',ann_date:'2026-07-01',pre_date:'2026-10-20',actual_date:null,modify_date:null},
   {end_date:'2026-09-30',ann_date:'2026-09-01',pre_date:'2026-10-28',actual_date:'2026-10-28',modify_date:'2026-09-01'},
   {end_date:'2026-06-30',ann_date:'2026-05-01',pre_date:'2026-08-25',actual_date:null,modify_date:null}]};
  const r=cn({upstream:up});
  expect(at(r,'2026-09-30')).toMatchObject({expected_date:'2026-10-28',disclosure_state:'filed_not_ingested',upstream_filed_date:'2026-10-28'});
  expect(at(r,'2026-09-30').detail.schedule_modified).toBe(true);
  expect(at(r,'2026-06-30')).toMatchObject({expected_date:'2026-08-25',disclosure_state:'overdue'});
 });
 it('without the disclosure_date lookup every unreceived CN row is unknown_upstream, received rows stay received',()=>{
  const f=filing('annual','2025-12-31','2026-03-28',{market:'CN',source:'tushare',origin:'sse'});
  const r=cn({upstream:{lookup:'unavailable'},filings:[f]});
  expect(at(r,'2025-12-31')).toMatchObject({disclosure_state:'received',expected_date:null});
  expect(r.filter(x=>x.period_end!=='2025-12-31').every(x=>x.disclosure_state==='unknown_upstream')).toBe(true);
 });
 it('acceptance case: the 2025 annual not ingested on 2026-05-01',()=>{
  const sched=(actual:string|null):CalendarUpstream=>({lookup:'ok',cn:[{end_date:'2025-12-31',ann_date:'2025-12-20',pre_date:'2026-04-25',actual_date:actual,modify_date:null}]});
  expect(at(cn({upstream:sched('2026-04-25'),today:'2026-05-01'}),'2025-12-31').disclosure_state).toBe('filed_not_ingested');
  expect(at(cn({upstream:sched(null),today:'2026-05-01'}),'2025-12-31').disclosure_state).toBe('overdue');
  expect(at(cn({upstream:{lookup:'unavailable'},today:'2026-05-01'}),'2025-12-31').disclosure_state).toBe('unknown_upstream');
 });
});

exec
/bin/zsh -lc "cat ../../../AGENTS.md; find src docs -name AGENTS.md -o -name AGENTS.override.md; rg -n '52/53|52-week|calendar|filing-calendar' docs/spec* docs/plans* | head -75; cat package.json; git show 8081cb1 -- docs/audits/2026-11-05-data-foundation-3/verification.md" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>zsh:1: no matches found: docs/spec*
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
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-JhLhtTQw' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-hkjLceJd' (errno=Operation not permitted)
commit 8081cb1cd6b1006198f23369b540b69d3e2922e4
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 06:50:26 2026 -0800

    feat(dq): filing-calendar rules (deadline table, Rule 0-3 roll-forward, 52/53-week estimates, status matrix)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/docs/audits/2026-11-05-data-foundation-3/verification.md b/docs/audits/2026-11-05-data-foundation-3/verification.md
index 646b7e22..abdd0648 100644
--- a/docs/audits/2026-11-05-data-foundation-3/verification.md
+++ b/docs/audits/2026-11-05-data-foundation-3/verification.md
@@ -90,3 +90,10 @@
 - 有意未做：`gold-cn.integration.test.ts` 未创建、未登记 `criticalSuites`；`vercel.json` 无 CN 对账 cron（`pair=cn.` 计数 0）；路由对 `cn.*` 在 `FACTS_CN_ENABLED!=='1'` 时 403。
 - 脚本冒烟（无 `.env.local`，不连库）：`select-cn-sample.ts --count 0` 与无参 `gold-pdf.ts` 均打印用法、退出码 2；`gold-pdf.ts` 对合成 PDF + 三行（一行匹配、一行缺失、一行 `<pending>`）的黄金文件输出 `found` 与 `missing_locally`，汇总 `distinct_pdfs=2, pending_rows=1, failed=1`，退出码 1。`select-cn-sample.ts` 的真实库运行（需 `fact_sync_scope` 的 CN 行）与 `gold-pdf.ts --upload`（需 `reconcile-raw` 桶）是 owner 动作，未在本环境执行。
 - 解除降级的 owner 步骤：(1) 指定 R1/R2（决策 C）；(2) 运行 `select-cn-sample.ts` 得到模板，按抄录指引抄录、复核、下载并上传 PDF；(3) 抄录完成后，据已有 Tushare 夹具与新录的 `disclosure_date` 响应另开任务创建并登记 `gold-cn.integration.test.ts`（N 家夹具 → CN 同步 → 本对账对 → 每黄金行恰一结果、`passed/expected >= 95%`、非 passed 全部在 `exceptions.json`），通过后再加 CN cron 并设 `FACTS_CN_ENABLED=1`。
+
+## SEC 假日与 Rule 0-3（Task 17a，2026-11-06 核对）
+
+- 规则：17 CFR 240.0-3(a)——最后一日为周六、周日或假日时，可在其后第一个营业日申报（https://www.law.cornell.edu/cfr/text/17/240.0-3 ，实施时抓取 200，原文含 "may be filed on the first business day following"）。
+- 联邦假日（5 U.S.C. 6103，按 OPM 公布的观察日）：https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/ ，实施时抓取 200，2026 与 2027 两张表逐日与 `SEC_HOLIDAYS` 一致（2026：01-01、01-19、02-16、05-25、06-19、07-03、09-07、10-12、11-11、11-26、12-25；2027：01-01、01-18、02-15、05-31、06-18、07-05、09-06、10-11、11-11、11-25、12-24）。OPM 2028 表首行 "Friday, December 31 * New Year's Day" 即 2027-12-31（2028 元旦周六的观察日），与 `SEC_HOLIDAYS[2027]` 第 12 项一致。2024、2025 两年未在页面上复核（页面只列当前及后续年份），取自规划时核对。
+- EDGAR 额外关闭日（SEC 公告：到期申报顺延至下一个运营营业日）：2024-12-24、2025-01-09（卡特总统国丧日）、2025-12-24 与 2025-12-26。两个 sec.gov 公告页（`edgar-closed-24-25-december-2024`、`edgar-will-be-closed-december-24-2025-through-december-26-2025`）实施时用描述性 User-Agent（无邮箱）各抓取一次，均返回 HTTP 403（1,924 字节，被 sec.gov 拦截），**未能联网复核**，日期取自规划时核对；未重试。2025-01-09 无单独链接，同样未复核。
+- 维护：`src/lib/dq/calendar.ts::SEC_HOLIDAYS/SEC_CLOSURES` 每年 12 月补次年；临时关闭按 SEC 公告补入 `SEC_CLOSURES`；表外年份的期限行为 `no_rule`（`none.holiday_table_missing/1`），不猜。

exec
/bin/zsh -lc "rg -n '52/53|§6.1|fye_mismatch|week52|fiscal_year_end|received_late' docs | head -85; rg -n 'CalendarFiling' src/lib/facts/types.ts; ls -d node_modules 2>/dev/null; nl -ba src/lib/dq/calendar.ts | tail -90" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
docs/earnings-quality-adoption.md:19:不自动判定，52/53周、跨口径和负分母须保留提示。CFO−capex不是FCFF。
docs/superpowers/specs/2026-09-26-wl-judge-design.md:3:日期：2026-09-26。来源：总纲 §6.1 WL 问题、WP-B3。Brain 侧 lint 与文件契约见 Osborn-brain `docs/superpowers/specs/2026-09-26-wiki-lint-design.md`、`config/wiki-wl-pairs.schema.json`、`config/wiki-wl-answers.schema.json`。分支 `codex/wp-b3-wl-judge`，基于 `main`。常设授权下按默认方案执行。
docs/superpowers/specs/2026-11-04-foreign-research-design.md:131:`broker_report_upload_intents(intent_id PK, sha256 not null, byte_size bigint > 0, licence_id FK, original_filename, created_by not null, created_at, expires_at not null, status check in ('open','validating','validated','promoting','committed','expired','abandoned'), staging_path text not null = 'staging/{intent_id}.pdf', document_id null FK, error_code text null, checkpoint_at timestamptz)`。每个意向有自己的暂存路径；提交是一台带持久检查点的状态机（§6.1），任何一步崩溃后重试同一 `intent_id` 都从检查点续作；`committed` 时直接返回 `document_id`。
docs/superpowers/specs/2026-11-04-foreign-research-design.md:146:| `promotion_pending` boolean not null default false | 上传提交的检查点：对象尚未从暂存路径移到正式路径（§6.1） |
docs/superpowers/specs/2026-11-04-foreign-research-design.md:538:| `POST …/documents/intent`、`POST …/documents/commit`、`POST …/documents/orphan-cleanup` | §6.1 |
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:290:export type DisclosureState='pending'|'overdue'|'filed_not_ingested'|'received'|'received_late'|'unknown_upstream';
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:292:export interface FilingProfile{issuer_id:string;market:Market;category_raw_current:string|null;regime:'10-K'|'20-F'|'40-F'|'cn';fiscal_year_end:string|null;week52_pattern:boolean;source:string;source_sha256:string|null;as_of:string}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:325:| §6.1–§6.3 日历与数据集 | Task 2a（datasets）、17a、17b、18a、18b |
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:406:| 45 | 申报人类别文本匹配与 `sec.filer_category` 生产者（D13） | 规则统一为不区分大小写、先 non-accelerated 再 large、再 accelerated（D `filerClass` 与 E `parseFilerCategory` 一致）。`sec.filer_category` **唯一生产者**是 Task 17b `syncFilerCategories`（规格 §6.1）；Task 15a 的 iXBRL 对不再记录它（删 `recordFilerCategory` 及其调用、相关断言） | Task 15a 标题、`pair-us-ixbrl.ts` 注释/import/实现、单测断言；Task 15c 集成断言 |
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:426:| 65 | 一个未覆盖的老期间让 US 全部日历行变 `unknown_upstream`（计划审计 Q1） | `calendar-sync.ts::applyUpstreamCoverage(rows, entries)`（导出）逐期判定：`最早 filingDate < period_end` 为已覆盖；未覆盖但有正证据（`received`/`received_late`/`filed_not_ingested`）保持原行；只有未覆盖且无证据的 `pending`/`overdue` 行改为 `unknown_upstream` + `upstream_lookup='unavailable'` + `detail.upstream_incomplete=true` + `detail.upstream_covered_from` | Task 18a 协议、`computeMember`、3 个用例（含 20-F 回归）；顺带把夹具里过期的 `fromPeriodEnd` 期望 `2022-11-23` 改为 P6 后的 `2017-11-23` |
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:846:  await exp({disclosure_state:'received_late',received_filing_id:randomUUID(),received_date:'2027-03-05'});
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:858:  await bad({deadline_state:'no_rule',due_date:null,disclosure_state:'received_late',...filed()},/dfe_late_requires_due/);
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:883:  const prof=(over:Record<string,unknown>)=>insertRow('issuer_filing_profiles',{issuer_id:iss,market:'US',category_raw_current:'Large accelerated filer',regime:'10-K',fiscal_year_end:'0927',week52_pattern:true,source:'sec_submissions',source_sha256:SHA,as_of:'2026-11-05',...over});
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:885:  await prof({market:'CN',category_raw_current:null,regime:'cn',fiscal_year_end:'1231',week52_pattern:false,source:'tushare_stock_basic',source_sha256:null});
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:888:  expect((await fails(prof({issuer_id:other,fiscal_year_end:'1332'}))).message).toMatch(/issuer_filing_profiles_fiscal_year_end_check/);
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:889:  expect((await fails(prof({issuer_id:other,fiscal_year_end:'927'}))).message).toMatch(/issuer_filing_profiles_fiscal_year_end_check/);
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:893:  await prof({issuer_id:other,fiscal_year_end:null});                                              // unknown fiscal year end stays missing
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:1133:-- ---------------------------------------------------------------- filer categories, expectations, profiles (§3.1, §6.1)
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:1160:  disclosure_state     text not null check (disclosure_state in ('pending','overdue','filed_not_ingested','received','received_late','unknown_upstream')),
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:1171:  constraint dfe_received_iff check ((disclosure_state in ('received','received_late')) = (received_filing_id is not null and received_date is not null)),
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:1172:  constraint dfe_late_requires_due check (disclosure_state <> 'received_late' or due_date is not null),
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:1184:  fiscal_year_end       text check (fiscal_year_end ~ '^(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])$'),
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:1185:  week52_pattern        boolean not null default false,
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:1358:  disclosure_state: 'pending' | 'overdue' | 'filed_not_ingested' | 'received' | 'received_late' | 'unknown_upstream';
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:1371:  fiscal_year_end: string | null;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:1372:  week52_pattern: boolean;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:7052:// SEC submissions (spec §4.3.3; reused by acceptance times §4.5 and the filing calendar §6.1).
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:7083:/** Acceleration named in submissions `category` (reference only; deadlines use the 10-K cover, spec §6.1). Only "Smaller reporting company" → unknown. */
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:14006:13. **申报人类别文本的匹配**：§6.1 的字面规则（区分大小写的 "Accelerated filer"）对 dei 枚举值 "Non-accelerated Filer"/"Accelerated Filer" 不稳。本 Part 的 `filerClass` 不区分大小写且先判 "non-accelerated" 再判 "accelerated"；Part E（Task 17 `filer-categories.ts`）宜采用同一规则或直接 import `filerClass`。 **→ 已裁决：接口对齐记录 #45。**
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:17234:// spec §6.1; plan 3 接口对齐记录). filerClass stays exported for select-us-sample.ts.
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:17275:/** §6.1 categories, case-insensitive; 'non-accelerated' is tested before 'accelerated'; SRC alone or unparseable → null. */
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:18729:规格条目：§6.1、§6.2、§6.3（消费）、§7（`GET /api/admin/dq` 行、cron 行）、§7.2、§8（日历、看板相关行）、§9.1（`calendar.test.ts`、`filer-categories.test.ts`、路由测试、parity）、§9.3（`calendar.integration.test.ts`）、§10 F3-7/F3-8、§11、§13、§15；规格一 §3.2；规格二 §15。
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:18785:- 期望期间：最近 **6 个已结束**（期末 < today）且**有适用报告种类**的槽（先按种类过滤、再取 6 个，计划审计 P6）。10-K 与 CN 用以年报月为锚的季度月末网格；20-F/40-F 只有年报，槽距 12 个月（即最近 6 个已结束财年末）；生成 `PERIODS+2` 个槽（当前未结束的槽与 52/53 周期末可能晚于 today 的槽）。CN 锚 12 月。`filingsWindowStart(today)` 覆盖最宽槽距的最老槽、±7 天匹配窗与一年 52/53 周估计依据（= today 所在月往前 `12×(PERIODS+2)+12` 个月的月末再减 7 天）。锚月：最近一份已收到年报的实际期末（最近月末的月份）优先于 submissions `fiscalYearEnd`，不一致 → 每行 `detail.fye_mismatch=true`。无 `fiscal_year_end` → 不出行。
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:18786:- 52/53 周（`week52_pattern`）：每个槽的期末 = 同位置（同锚月）最近一次观测到的实际期末（已收到的 filing ∪ SEC submissions `reportDate`）+ 364 天，若结果不在锚月再 +7；逐年推进；无观测 → 该槽月末。`period_end_estimated=true`、`deadline_state='estimated'`、`due_rule` 加 `/est`；估计行**永不 `overdue`**，到期未收到为 `pending` + `detail.estimated_due_passed=true`。收到的 filing 与估计期末相差 ≤ 7 天 → 以实际期末替换该行（非估计、按法定）。
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:18787:- 状态：`received` = 存在 `form_type` 恰为该种类（修订件 `/A` 不算）、所属运行 `published`、`mapping_gen>0`、期末匹配的 filing，取最早 `available_date`；`> due_date` → `received_late`；`no_rule` 行收到即 `received`。未收到：`upstream_lookup='unavailable'` → `unknown_upstream`；上游有（US：同 `form`、`reportDate` 与期末相差 ≤ 7 天，取最早 `filingDate`；CN：同 `end_date` 中 `ann_date` 最大行的 `actual_date` 非空）→ `filed_not_ingested`（`upstream_filed_date`）；否则 `today > due_date` 且 `statutory` → `overdue`，其余 `pending`。CN `expected_date` = 同 `end_date` 中 `ann_date` 最大行的 `pre_date`，`modify_date` 非空 → `detail.schedule_modified=true`。
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:18799:const profile=(p:Partial<FilingProfile>={}):FilingProfile=>({issuer_id:ISSUER,market:'US',category_raw_current:'Large accelerated filer',regime:'10-K',fiscal_year_end:'1231',week52_pattern:false,source:'sec_submissions',source_sha256:'s'.repeat(64),as_of:'2026-11-01',...p});
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:18896: it('filingsWindowStart covers the oldest annual slot, its match window and one year of 52/53-week basis (plan audit P6)',()=>{
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:18901: it('no fiscal_year_end → no rows',()=>{expect(run({profile:{fiscal_year_end:null}})).toEqual([]);});
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:18902: it('a fiscal year end that differs from the latest received 10-K: anchor on the 10-K and flag fye_mismatch',()=>{
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:18903:  const r=run({profile:{fiscal_year_end:'1231'},filings:[filing('10-K','2025-09-30','2025-11-20')]});
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:18905:  expect(r.every(x=>x.detail.fye_mismatch===true)).toBe(true);
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:18919:  expect(at(r,'2026-03-31')).toMatchObject({disclosure_state:'received_late',received_date:'2026-05-20'});
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:18961:describe('52/53-week filers',()=>{
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:18962: const wk=(p:Partial<FilingProfile>={})=>({fiscal_year_end:'0927',week52_pattern:true,...p});
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:18996: const cn=(o:{filings?:CalendarFiling[];upstream?:CalendarUpstream;today?:string}={})=>computeExpectations({profile:profile({market:'CN',regime:'cn',fiscal_year_end:'1231',category_raw_current:null,source:'cn_statutory',source_sha256:null}),categories:[],filings:o.filings??[],upstream:o.upstream??{lookup:'ok',cn:[]},today:o.today??'2026-11-05'});
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:19036:// Filing-calendar rules (spec §6.1, plan 3 C7; CALENDAR_RULES_VERSION 'filing-calendar/1'). Pure:
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:19040:// no category for FY N−1 → no_rule; an estimated (52/53-week) period end never counts as overdue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:19048:export type DisclosureState='pending'|'overdue'|'filed_not_ingested'|'received'|'received_late'|'unknown_upstream';
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:19050:export interface FilingProfile{issuer_id:string;market:Market;category_raw_current:string|null;regime:'10-K'|'20-F'|'40-F'|'cn';fiscal_year_end:string|null;week52_pattern:boolean;source:string;source_sha256:string|null;as_of:string}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:19069:/** The month end closest to the date (52/53-week period ends fall within a week of one). */
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:19155:/** Slots generated before filtering: PERIODS ended ones plus the current slot and one whose 52/53-week end may still lie after today. */
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:19159:/** Earliest period_end the rules can look at (the oldest slot at the widest stride, its ±7-day match window, and one year of 52/53-week estimation basis): calendar-sync passes it as filingsForCalendar fromPeriodEnd and as the submissions coverFrom. */
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:19163:/** 52/53-week estimate for the slot ending in grid month-end `grid`: latest observed actual of the same position + 364 days per year (+7 when the result leaves the anchor month); no observation → the grid month end. */
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:19177: const fye=regime==='cn'?'1231':profile.fiscal_year_end;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:19178: if(fye===null)return [];   // spec §8: no fiscal_year_end → no rows (calendar-sync counts no_fiscal_year_end)
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:19179: const week52=regime!=='cn'&&profile.week52_pattern;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:19181: // Anchor month: the latest received annual report's actual period end wins over submissions fiscalYearEnd (§6.1).
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:19186:  if(m!==anchor||(!week52&&pe.slice(5).replace('-','')!==fye))base.fye_mismatch=true;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:19202:  if(!kind||!week52){
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:19228:   state=dl.due!==null&&p.received.available_date>dl.due?'received_late':'received';
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:19286:git commit -m "feat(dq): filing-calendar rules (deadline table, Rule 0-3 roll-forward, 52/53-week estimates, status matrix)
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:19363:  const rows=computeExpectations({profile:{issuer_id:ISSUER,market:'US',category_raw_current:null,regime:'10-K',fiscal_year_end:'1231',week52_pattern:false,source:'sec_submissions',source_sha256:null,as_of:'2026-11-01'},categories:[row(2026,'large_accelerated')],filings:[],upstream:{lookup:'ok',us:[]},today:'2026-11-05'});
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:19443:// Per-fiscal-year filer categories from 10-K covers (spec §6.1 申报人类别, §3.1 issuer_filer_categories).
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:19479: * contains "accelerated filer" (spec §6.1 lists large → accelerated → non; same outcomes). Smaller
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:19595: * Filer categories from 10-K covers (spec §6.1). Dry run by default.
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:19711:- 每个成员：US 抓 submissions（失败 → `sec_unavailable` 错误项、`upstream_lookup='unavailable'`，档案退回已存的 `issuer_filing_profiles` 行；都没有 → 不出行，`no_profile` 计数）→ 由 submissions 写档案（`regime` = 最近原始年报 form；`fiscal_year_end` 合法才写；`week52_pattern` = 财年末日不是月末，或最近 3 份年报期末有不是月末者）；CN 档案固定 `regime='cn'`、`'1231'`、`source='cn_statutory'`，上游经 `tushareCallRaw('disclosure_date', …)`：无 token（`TushareError` code −1）→ `no_token`；`code≠0`（积分不足等）→ `api_code_<n>`；成功 → 原始字节入桶 `kind:'tushare-disclosure'` 记 sha256，但 `CN_DISCLOSURE_VERIFIED=false` 时仍 `upstream_lookup='unavailable'`（`schedule_unavailable:'unverified'`）。以上原因汇总为一条 `skipped_summary(schedule_unavailable)`。
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:19712:- US 上游覆盖**逐期判定**（计划审计 Q1，`applyUpstreamCoverage`）：某期 `period_end` 晚于 submissions 最早 `filingDate` → 该期已覆盖，行不变；未覆盖但有正证据（`received`/`received_late`/`filed_not_ingested`：匹配的 filing 或匹配的上游条目）→ 行不变；只有未覆盖且无证据的 `pending`/`overdue` 行改为 `unknown_upstream`、`upstream_lookup='unavailable'`、`detail.upstream_incomplete=true`、`detail.upstream_covered_from=<最早 filingDate|null>`（规格"recent 最早条目早于 period_end 否则补抓分页；仍失败 → unavailable"，分页由 Task 6 抓取器合并）。一个未覆盖的老期间不再改写近期行。
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:19715:- 回执 `detail={pass_id, issuers_done, issuers_failed, rows, by_deadline_state, by_disclosure_state, upstream_unavailable, no_fiscal_year_end, no_category, no_profile}`（E6 的计数来源）；计数：每个处理的成员 `fetched+1`，完成 `inserted+1`，失败 `failed+1`。
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:19808:  expect(h.tables.rows('issuer_filing_profiles').map(p=>[p.issuer_id,p.regime,p.fiscal_year_end,p.week52_pattern,p.category_raw_current,p.source_sha256])).toEqual([[A,'10-K','1231',false,'Large accelerated filer','sub-sha'],[B,'10-K','1231',false,'Large accelerated filer','sub-sha']]);
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:19814:  expect(r.detail).toMatchObject({pass_id:'p1',issuers_done:2,rows:12,upstream_unavailable:0,no_category:0,no_fiscal_year_end:0,no_profile:0});
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:19832:  await h.tables.upsert('issuer_filing_profiles',{issuer_id:A,market:'US',category_raw_current:null,regime:'10-K',fiscal_year_end:'1231',week52_pattern:false,source:'sec_submissions',source_sha256:'old',as_of:'2026-10-01'},'issuer_id,market');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:19924:  expect(h.tables.rows('issuer_filing_profiles')[0]).toMatchObject({regime:'cn',fiscal_year_end:'1231',source:'cn_statutory'});
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:19967: it('profile: regime from the latest annual form, 52/53-week detection, no annual form → null',()=>{
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:19968:  expect(profileFromSubmissions(A,view(),'2026-11-05')).toMatchObject({regime:'10-K',fiscal_year_end:'1231',week52_pattern:false});
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:19969:  expect(profileFromSubmissions(A,view({fiscalYearEnd:'0927',entries:[{accessionNumber:'k',filingDate:'2025-10-31',reportDate:'2025-09-27',form:'10-K',primaryDocument:'k',isInlineXBRL:true}]}),'2026-11-05')?.week52_pattern).toBe(true);
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:19970:  expect(profileFromSubmissions(A,view({fiscalYearEnd:'0930',entries:[{accessionNumber:'k',filingDate:'2025-10-31',reportDate:'2025-09-27',form:'10-K',primaryDocument:'k',isInlineXBRL:true}]}),'2026-11-05')?.week52_pattern).toBe(true);
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:19973:  expect(profileFromSubmissions(A,view({fiscalYearEnd:'1331'}),'2026-11-05')?.fiscal_year_end).toBeNull();
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:20016:/** Flip only after docs/audits/2026-11-05-data-foundation-3/verification.md records a real disclosure_date response check (spec §6.1 T15). */
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:20062:export interface CalendarDetail{pass_id:string|null;issuers_done:number;issuers_failed:number;rows:number;by_deadline_state:Record<string,number>;by_disclosure_state:Record<string,number>;upstream_unavailable:number;no_fiscal_year_end:number;no_category:number;no_profile:number}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:20070:/** Profile from SEC submissions: regime = latest original annual form; week52 when the fiscal year end is not a month end or a recent annual period end is not one. */
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:20078: return {issuer_id:issuerId,market:'US',category_raw_current:v.category,regime:annual[0].form as FilingProfile['regime'],fiscal_year_end:fye,week52_pattern:!fyeIsMonthEnd||reportEndsOff,source:'sec_submissions',source_sha256:v.sha256,as_of:today};
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:20080:export const cnProfile=(issuerId:string,today:string):FilingProfile=>({issuer_id:issuerId,market:'CN',category_raw_current:null,regime:'cn',fiscal_year_end:'1231',week52_pattern:false,source:'cn_statutory',source_sha256:null,as_of:today});
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:20081:const profileFromRow=(r:Row):FilingProfile=>({issuer_id:String(r.issuer_id),market:r.market as Market,category_raw_current:r.category_raw_current==null?null:String(r.category_raw_current),regime:r.regime as FilingProfile['regime'],fiscal_year_end:r.fiscal_year_end==null?null:String(r.fiscal_year_end),week52_pattern:r.week52_pattern===true,source:String(r.source),source_sha256:r.source_sha256==null?null:String(r.source_sha256),as_of:String(r.as_of)});
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:20092: * Per-period US upstream coverage (plan audit Q1; spec §6.1 "recent 最早条目早于 period_end").
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:20096: * - positive evidence (received / received_late / filed_not_ingested, i.e. a matching filing or a matching
69:export type CalendarFiling=FilingRow&{run_status:RunStatus};
119: filingsForCalendar(issuer:string,market:Market,opts:{fromPeriodEnd:string}):Promise<CalendarFiling[]>;
node_modules
   124	const strideOf=(regime:FilingProfile['regime'])=>regime==='20-F'||regime==='40-F'?12:3;
   125	/** Earliest period_end the rules can look at (the oldest slot at the widest stride, its ±7-day match window, and one year of 52/53-week estimation basis): calendar-sync passes it as filingsForCalendar fromPeriodEnd and as the submissions coverFrom. */
   126	export function filingsWindowStart(today:string):string{const {y,m}=ym(today);return addDays(monthEnd(y,m-12*SLOT_COUNT-12),-MATCH_DAYS);}
   127	
   128	interface Estimate{periodEnd:string;basis:Record<string,unknown>}
   129	/** 52/53-week estimate for the slot ending in grid month-end `grid`: latest observed actual of the same position + 364 days per year (+7 when the result leaves the anchor month); no observation → the grid month end. */
   130	export function estimatePeriodEnd(grid:string,observed:readonly {date:string;source:string}[]):Estimate{
   131	 const month=ym(grid).m;
   132	 const prior=observed.filter(o=>ym(nearestMonthEnd(o.date)).m===month&&nearestMonthEnd(o.date)<grid).sort((a,b)=>b.date.localeCompare(a.date))[0];
   133	 if(!prior)return {periodEnd:grid,basis:{source:'month_end'}};
   134	 let e=prior.date;
   135	 for(let i=0;i<10&&nearestMonthEnd(e)<grid;i++){e=addDays(e,364);if(ym(e).m!==month)e=addDays(e,7);}
   136	 if(nearestMonthEnd(e)!==grid)return {periodEnd:grid,basis:{source:'month_end',fallback_from:prior.date}};
   137	 return {periodEnd:e,basis:{source:prior.source,from:prior.date}};
   138	}
   139	
   140	export function computeExpectations(input:{profile:FilingProfile;categories:FilerCategoryRow[];filings:CalendarFiling[];upstream:CalendarUpstream;today:string}):ExpectationRow[]{
   141	 const {profile,categories,filings,upstream,today}=input;
   142	 const regime=profile.regime;
   143	 const fye=regime==='cn'?'1231':profile.fiscal_year_end;
   144	 if(fye===null)return [];   // spec §8: no fiscal_year_end → no rows (calendar-sync counts no_fiscal_year_end)
   145	 const week52=regime!=='cn'&&profile.week52_pattern;
   146	 const base:Record<string,unknown>={rules_version:CALENDAR_RULES_VERSION};
   147	 // Anchor month: the latest received annual report's actual period end wins over submissions fiscalYearEnd (§6.1).
   148	 let anchor=+fye.slice(0,2);
   149	 const latestAnnual=filings.filter(f=>counts(f,ANNUAL[regime])).sort((a,b)=>b.period_end!.localeCompare(a.period_end!))[0];
   150	 if(latestAnnual&&regime!=='cn'){
   151	  const pe=latestAnnual.period_end!;const m=ym(nearestMonthEnd(pe)).m;
   152	  if(m!==anchor||(!week52&&pe.slice(5).replace('-','')!==fye))base.fye_mismatch=true;
   153	  anchor=m;
   154	 }
   155	 const usEntries=upstream.lookup==='ok'?upstream.us??[]:[];
   156	 const cnRows=upstream.lookup==='ok'?upstream.cn??[]:[];
   157	 // slot grid, newest first: quarter months around the anchor, or the anchor month only for annual-only regimes
   158	 const stride=strideOf(regime);
   159	 const slots:{grid:string;month:number}[]=[];
   160	 for(let {y,m}=ym(today),i=0;slots.length<SLOT_COUNT&&i<SLOT_COUNT*stride+12;i++,m--){
   161	  if(m<1){m+=12;y--;}
   162	  if(((m-anchor)%stride+stride)%stride===0)slots.push({grid:monthEnd(y,m),month:m});
   163	 }
   164	 const rows:ExpectationRow[]=[];
   165	 const planned:{grid:string;month:number;kind:ReportKind|null;periodEnd:string;estimated:boolean;received:CalendarFiling|null;basis?:Record<string,unknown>}[]=[];
   166	 for(const s of slots){
   167	  const kind=kindOf(regime,s.month,anchor);
   168	  if(!kind||!week52){
   169	   const received=kind?earliest(filings.filter(f=>counts(f,kind)&&f.period_end===s.grid)):null;
   170	   planned.push({...s,kind,periodEnd:s.grid,estimated:false,received});
   171	   continue;
   172	  }
   173	  const observed=[...filings.filter(f=>counts(f,kind)).map(f=>({date:f.period_end!,source:'filing'})),...usEntries.filter(e=>e.form===kind&&e.reportDate).map(e=>({date:e.reportDate!,source:'sec_submissions'}))];
   174	  const est=estimatePeriodEnd(s.grid,observed);
   175	  const matches=filings.filter(f=>counts(f,kind)&&Math.abs(diffDays(f.period_end!,est.periodEnd))<=MATCH_DAYS);
   176	  const received=earliest(matches);
   177	  if(received)planned.push({...s,kind,periodEnd:received.period_end!,estimated:false,received,basis:{replaced_estimate:est.periodEnd}});
   178	  else planned.push({...s,kind,periodEnd:est.periodEnd,estimated:true,received:null,basis:est.basis});
   179	 }
   180	 // applicable report kinds first, THEN the PERIODS limit (plan audit P6: a slot without a kind never takes a place)
   181	 const ended=planned.filter(p=>p.kind!==null&&p.periodEnd<today).slice(0,PERIODS);
   182	 for(const p of ended){
   183	  if(!p.kind)continue;
   184	  const monthsAhead=((anchor-p.month)%12+12)%12;
   185	  const fiscalYear=+monthEnd(+p.grid.slice(0,4),p.month+monthsAhead).slice(0,4);
   186	  let dl=deadlineOf(regime,p.kind,p.periodEnd,fiscalYear,categories);
   187	  const detail:Record<string,unknown>={...base,...dl.detail};
   188	  if(p.basis)detail[p.estimated?'estimate_basis':'estimate']=p.basis;
   189	  if(p.estimated&&dl.state==='statutory')dl={...dl,state:'estimated',rule:`${dl.rule}/est`};
   190	  let expected:string|null=null,upstreamFiled:string|null=null,state:DisclosureState;
   191	  const cnRow=regime==='cn'?cnRows.filter(r=>r.end_date===p.periodEnd).sort((a,b)=>(b.ann_date??'').localeCompare(a.ann_date??''))[0]:undefined;
   192	  if(cnRow){expected=cnRow.pre_date;if(cnRow.modify_date)detail.schedule_modified=true;}
   193	  if(p.received){
   194	   state=dl.due!==null&&p.received.available_date>dl.due?'received_late':'received';
   195	  }else if(upstream.lookup==='unavailable'){
   196	   state='unknown_upstream';
   197	  }else{
   198	   const up=regime==='cn'?(cnRow?.actual_date?{date:cnRow.actual_date,accession:null}:null)
   199	    :earliestEntry(usEntries.filter(e=>e.form===p.kind&&e.reportDate!==null&&Math.abs(diffDays(e.reportDate,p.periodEnd))<=MATCH_DAYS));
   200	   if(up){state='filed_not_ingested';upstreamFiled=up.date;if(up.accession)detail.upstream_accession=up.accession;}
   201	   else if(dl.due!==null&&today>dl.due){
   202	    if(dl.state==='statutory')state='overdue';
   203	    else{state='pending';if(dl.state==='estimated')detail.estimated_due_passed=true;}
   204	   }else state='pending';
   205	  }
   206	  rows.push({issuer_id:profile.issuer_id,market:profile.market,report_kind:p.kind,period_end:p.periodEnd,period_end_estimated:p.estimated,
   207	   deadline_state:dl.state,due_date:dl.due,due_rule:dl.rule,expected_date:expected,upstream_lookup:upstream.lookup,upstream_filed_date:upstreamFiled,
   208	   disclosure_state:state,received_filing_id:p.received?.filing_id??null,received_date:p.received?.available_date??null,profile_as_of:profile.as_of,detail});
   209	 }
   210	 return rows;
   211	}
   212	const earliest=(fs:CalendarFiling[])=>[...fs].sort((a,b)=>a.available_date.localeCompare(b.available_date)||a.filing_id.localeCompare(b.filing_id))[0]??null;
   213	const earliestEntry=(es:UsUpstreamEntry[])=>{const e=[...es].sort((a,b)=>a.filingDate.localeCompare(b.filingDate))[0];return e?{date:e.filingDate,accession:e.accessionNumber}:null;};

exec
/bin/zsh -lc "node -e \"const ts=require('typescript'),fs=require('fs'),Module=require('module');const m=new Module('cal');m._compile(ts.transpileModule(fs.readFileSync('src/lib/dq/calendar.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,'cal.js');console.log(m.exports.computeExpectations({profile:{issuer_id:'a',market:'US',regime:'10-K',fiscal_year_end:'0201',week52_pattern:true,as_of:'2026-11-05'},categories:[],filings:[],upstream:{lookup:'ok',us:[{form:'10-K',reportDate:'2025-02-01',filingDate:'2025-03-20',accessionNumber:'a'}]},today:'2026-11-05'}).map(r=>[r.report_kind,r.period_end,r.disclosure_state]));\"" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 65ms:
[
  [ '10-Q', '2026-08-31', 'pending' ],
  [ '10-Q', '2026-05-31', 'pending' ],
  [ '10-K', '2026-02-28', 'pending' ],
  [ '10-Q', '2025-11-30', 'pending' ],
  [ '10-Q', '2025-08-31', 'pending' ],
  [ '10-Q', '2025-05-31', 'pending' ]
]

codex
The fallback anchor misaligns periods for 52/53-week issuers whose fiscal year ends early in the following month. This produces incorrect calendar expectations before an annual filing is ingested.

Review comment:

- [P2] Normalize the fiscal-year-end anchor for 52/53-week issuers — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/calendar.ts:148-149
  When no published annual filing is stored, a 52/53-week issuer with `fiscal_year_end='0201'` gets February/May/August/November slots, although February 1 belongs to the January month-end anchor used by `estimatePeriodEnd`. Consequently, even available SEC observations cannot supply the estimation basis or match the resulting periods: the annual estimate becomes February 28 instead of approximately January 31, and upstream filings can remain unrecognized. Normalize the fallback fiscal-year-end anchor to its nearest month end, consistently with observed annual period ends.
The fallback anchor misaligns periods for 52/53-week issuers whose fiscal year ends early in the following month. This produces incorrect calendar expectations before an annual filing is ingested.

Review comment:

- [P2] Normalize the fiscal-year-end anchor for 52/53-week issuers — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/calendar.ts:148-149
  When no published annual filing is stored, a 52/53-week issuer with `fiscal_year_end='0201'` gets February/May/August/November slots, although February 1 belongs to the January month-end anchor used by `estimatePeriodEnd`. Consequently, even available SEC observations cannot supply the estimation basis or match the resulting periods: the annual estimate becomes February 28 instead of approximately January 31, and upstream filings can remain unrecognized. Normalize the fallback fiscal-year-end anchor to its nearest month end, consistently with observed annual period ends.

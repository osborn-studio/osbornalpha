OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b388-7ee7-7681-a69f-693ee0b3e4db
--------
user
commit e15e7da
2026-11-07T01:03:51.807968Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when AuthRequired(AuthRequiredError { www_authenticate_header: "Bearer realm=\"OAuth\", resource_metadata=\"https://mcp.notion.com/.well-known/oauth-protected-resource/mcp\", scope=\"default\"" })
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat e15e7da; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 3111ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-FtMF9GfP' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-S9TWZtQn' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/17a-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/17a-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/17a-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-oCxfsRoQ' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-xdHCXJsg' (errno=Operation not permitted)
commit e15e7da08c788a529c69015e223efbc609e5e8b5
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 17:03:22 2026 -0800

    fix(dq): calendar 52/53-week nearest-step estimate, fiscal_year_end anchor normalisation, upstream-evidence slots, 2021-2023 holidays, rollForward exhaustion (17a review)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

 .../2026-11-05-data-foundation-3/verification.md   |  7 +--
 src/lib/dq/calendar.test.ts                        | 51 +++++++++++++++++-----
 src/lib/dq/calendar.ts                             | 33 ++++++++++----
 3 files changed, 67 insertions(+), 24 deletions(-)

exec
/bin/zsh -lc 'pwd; ls -a | head -30; for p in /AGENTS.md /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md; do [ ! -f "$p" ] || cat "$p"; done; git show e15e7da -- src/lib/dq/calendar.ts src/lib/dq/calendar.test.ts; cat src/lib/dq/calendar.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
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
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-FTRizDeC' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-P4aEQM1y' (errno=Operation not permitted)
commit e15e7da08c788a529c69015e223efbc609e5e8b5
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 17:03:22 2026 -0800

    fix(dq): calendar 52/53-week nearest-step estimate, fiscal_year_end anchor normalisation, upstream-evidence slots, 2021-2023 holidays, rollForward exhaustion (17a review)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/dq/calendar.test.ts b/src/lib/dq/calendar.test.ts
index 1cff60bd..f96afb54 100644
--- a/src/lib/dq/calendar.test.ts
+++ b/src/lib/dq/calendar.test.ts
@@ -30,12 +30,18 @@ describe('Rule 0-3 roll-forward',()=>{
   if(want.startsWith('2028'))expect(()=>rollForward(d)).toThrow('holiday_table_missing:2028');
   else expect(rollForward(d)).toBe(want);
  });
- it('covers 2024–2027 with 11 federal holidays each (12 in 2027 with the observed New Year 2028) and refuses other years',()=>{
-  expect(Object.keys(SEC_HOLIDAYS)).toEqual(['2024','2025','2026','2027']);
-  expect([2024,2025,2026].map(y=>SEC_HOLIDAYS[y].length)).toEqual([11,11,11]);
+ it('covers 2021–2027 (12 holidays in 2021 and 2027 for the observed New Year of the next year) and refuses other years',()=>{
+  expect(rollForward('2021-06-19')).toBe('2021-06-21');   // Juneteenth 2021 observed Fri 06-18, then the weekend
+  expect(rollForward('2023-01-01')).toBe('2023-01-03');   // Sunday New Year observed Mon 01-02
+  expect(Object.keys(SEC_HOLIDAYS)).toEqual(['2021','2022','2023','2024','2025','2026','2027']);
+  expect([2022,2023,2024,2025,2026].map(y=>SEC_HOLIDAYS[y].length)).toEqual([10,11,11,11,11]);   // 2022: New Year 2022 was observed 2021-12-31
+  expect(SEC_HOLIDAYS[2021]).toHaveLength(12);
   expect(SEC_HOLIDAYS[2027]).toHaveLength(12);
-  for(const y of [2024,2025,2026,2027])for(const d of SEC_HOLIDAYS[y]){expect(d.startsWith(String(y))).toBe(true);expect(isSecBusinessDay(d)).toBe(false);}
-  expect(()=>isSecBusinessDay('2023-12-29')).toThrow('holiday_table_missing:2023');
+  const SAVED=SEC_HOLIDAYS as Record<number,readonly string[]>;
+  SAVED[2030]=Array.from({length:20},(_,i)=>`2030-01-${String(i+1).padStart(2,'0')}`);
+  try{expect(()=>rollForward('2030-01-01')).toThrow();}finally{delete SAVED[2030];}   // D5: never silently stops rolling
+  for(const y of [2021,2022,2023,2024,2025,2026,2027])for(const d of SEC_HOLIDAYS[y]){expect(d.startsWith(String(y))).toBe(true);expect(isSecBusinessDay(d)).toBe(false);}
+  expect(()=>isSecBusinessDay('2020-12-29')).toThrow('holiday_table_missing:2020');
  });
 });
 
@@ -88,12 +94,11 @@ describe('deadline table (10-K regime, FYE 12-31, today 2026-11-05)',()=>{
   expect(at(r,'2025-12-31').detail).toMatchObject({no_category:true,fiscal_year:2025});
   expect(at(r,'2026-09-30').deadline_state).toBe('statutory');
  });
- it('20-F: six ended annual periods (annual-only slots a year apart, plan audit P6), due 4 months later; years without a holiday table are no_rule; no quarterly rows',()=>{
+ it('20-F: six ended annual periods (annual-only slots a year apart, plan audit P6), due 4 months later; due dates roll over the 2021+ holiday tables; no quarterly rows',()=>{
   const r=run({profile:{regime:'20-F'}});
   expect(r.map(x=>[x.report_kind,x.period_end,x.due_date,x.due_rule])).toEqual([
    ['20-F','2025-12-31','2026-04-30','us.20f/1'],['20-F','2024-12-31','2025-04-30','us.20f/1'],['20-F','2023-12-31','2024-04-30','us.20f/1'],
-   ['20-F','2022-12-31',null,'none.holiday_table_missing/1'],['20-F','2021-12-31',null,'none.holiday_table_missing/1'],['20-F','2020-12-31',null,'none.holiday_table_missing/1']]);
-  expect(r[3].detail).toMatchObject({holiday_year:2023});
+   ['20-F','2022-12-31','2023-05-01','us.20f/1'],['20-F','2021-12-31','2022-05-02','us.20f/1'],['20-F','2020-12-31','2021-04-30','us.20f/1']]);
  });
  it('40-F: six ended annual periods, no rule, and can still be received (plan audit P6)',()=>{
   const f=filing('40-F','2025-12-31','2026-03-20');
@@ -173,7 +178,7 @@ describe('52/53-week filers',()=>{
  it('estimates unreceived periods from the latest actual of the same position (+364), marks them estimated, never overdue',()=>{
   const r=run({profile:wk(),filings:history,categories:[cat(2024,'large_accelerated'),cat(2025,'large_accelerated')]});
   expect(r.map(x=>[x.period_end,x.report_kind,x.period_end_estimated])).toEqual([
-   ['2026-09-26','10-K',true],['2026-06-27','10-Q',true],['2026-03-28','10-Q',true],['2025-12-27','10-Q',true],['2025-09-27','10-K',false],['2025-06-28','10-Q',false]]);
+   ['2026-10-03','10-K',true],['2026-06-27','10-Q',true],['2026-03-28','10-Q',true],['2026-01-03','10-Q',true],['2025-09-27','10-K',false],['2025-06-28','10-Q',false]]);
   const est=at(r,'2026-06-27');
   expect(est).toMatchObject({deadline_state:'estimated',due_rule:'us.laf/1/est',due_date:'2026-08-06',disclosure_state:'pending'});
   expect(est.detail).toMatchObject({estimated_due_passed:true,estimate_basis:{source:'filing',from:'2025-06-28'}});
@@ -188,11 +193,33 @@ describe('52/53-week filers',()=>{
   expect(at(run({profile:wk(),filings:[...history,off]}),'2026-06-27').period_end_estimated).toBe(true);
  });
  it('+364 per missing year, +7 when the step leaves the anchor month; no observation → the month end',()=>{
-  expect(estimatePeriodEnd('2023-09-30',[{date:'2022-09-24',source:'filing'}])).toEqual({periodEnd:'2023-09-23',basis:{source:'filing',from:'2022-09-24'}});
-  expect(estimatePeriodEnd('2026-09-30',[{date:'2024-09-28',source:'filing'}]).periodEnd).toBe('2026-09-26');
-  expect(estimatePeriodEnd('2025-01-31',[{date:'2024-02-03',source:'filing'}]).periodEnd).toBe('2025-02-08');
+  const est=(grid:string,d:string)=>estimatePeriodEnd(grid,[{date:d,source:'filing'}]).periodEnd;
+  expect(estimatePeriodEnd('2023-09-30',[{date:'2022-09-24',source:'filing'}])).toEqual({periodEnd:'2023-09-30',basis:{source:'filing',from:'2022-09-24'}});   // 53-week year: +364 = 09-23 is 7 days from 09-30, +371 is 0
+  expect(est('2025-01-31','2024-02-03')).toBe('2025-02-01');   // D1: +364 is 1 day from 01-31, +371 would be 8
+  expect(est('2024-08-31','2023-09-03')).toBe('2024-09-01');   // Costco-style first Sunday after Aug 31
+  expect(est('2025-12-31','2025-01-03')).toBe('2026-01-02');   // Friday nearest Dec 31
+  expect(est('2024-01-31','2023-01-28')).toBe('2024-02-03');   // Saturday nearest Jan 31: +364 = 01-27 (4 days), +371 = 02-03 (3 days)
+  expect(est('2026-09-30','2024-09-28')).toBe('2026-10-03');   // two steps: 2025-09-27, then 09-26 (4) vs 10-03 (3)
   expect(estimatePeriodEnd('2026-03-31',[])).toEqual({periodEnd:'2026-03-31',basis:{source:'month_end'}});
  });
+ it('D2: a fiscal_year_end near a month boundary anchors on the nearest month end (0203 → January) and matches the submissions report',()=>{
+  const up:CalendarUpstream={lookup:'ok',us:[{form:'10-K',reportDate:'2026-01-31',filingDate:'2026-03-20',accessionNumber:'k1'}]};
+  const r=run({profile:{fiscal_year_end:'0203',week52_pattern:true},upstream:up,today:'2026-11-05',categories:[cat(2024,'large_accelerated'),cat(2025,'large_accelerated')]});
+  expect(at(r,'2026-01-31')).toMatchObject({report_kind:'10-K',disclosure_state:'filed_not_ingested',upstream_filed_date:'2026-03-20'});
+  expect(r.some(x=>x.period_end==='2026-02-28')).toBe(false);
+  const dec=run({profile:{fiscal_year_end:'0102',week52_pattern:true}});
+  expect(dec.filter(x=>x.report_kind==='10-K').every(x=>nearestMonthEnd(x.period_end).slice(5,7)==='12')).toBe(true);expect(dec.some(x=>x.report_kind==='10-K')).toBe(true);   // '0102' anchors on December
+ });
+ it('D3: a slot whose upstream report ended before today is expected even when its estimate is still ahead',()=>{
+  const up:CalendarUpstream={lookup:'ok',us:[{form:'10-K',reportDate:'2025-02-01',filingDate:'2025-02-04',accessionNumber:'k2'}]};
+  const r=run({profile:{fiscal_year_end:'0201',week52_pattern:true},filings:[filing('10-K','2024-02-03','2024-03-20')],upstream:up,today:'2025-02-05',categories:[cat(2023,'large_accelerated'),cat(2024,'large_accelerated')]});
+  expect(r[0]).toMatchObject({report_kind:'10-K',disclosure_state:'filed_not_ingested',upstream_filed_date:'2025-02-04'});
+  expect(r).toHaveLength(6);
+  const late:CalendarUpstream={lookup:'ok',us:[{form:'10-K',reportDate:'2025-02-01',filingDate:'2025-02-04',accessionNumber:'k2'}]};
+  const r2=run({profile:{fiscal_year_end:'0201',week52_pattern:true},filings:[filing('10-K','2024-02-08','2024-03-20')],upstream:late,today:'2025-02-05',categories:[cat(2023,'large_accelerated'),cat(2024,'large_accelerated')]});
+  expect(r2[0]).toMatchObject({period_end:'2025-02-06',period_end_estimated:true,disclosure_state:'filed_not_ingested'});   // estimate 02-06 is after today, actual 02-01 is not
+  expect(r2[0].detail.estimate_basis).toMatchObject({source:'filing',from:'2024-02-08'});
+ });
  it('uses SEC submissions reportDate as an estimation basis when no filing is stored',()=>{
   const up:CalendarUpstream={lookup:'ok',us:[{form:'10-Q',reportDate:'2025-06-28',filingDate:'2025-08-01',accessionNumber:'a1'}]};
   const r=run({profile:wk(),upstream:up});
diff --git a/src/lib/dq/calendar.ts b/src/lib/dq/calendar.ts
index 4ef92cdc..7dcc56d9 100644
--- a/src/lib/dq/calendar.ts
+++ b/src/lib/dq/calendar.ts
@@ -58,6 +58,10 @@ export const applicableCategory=(categories:readonly FilerCategoryRow[],fiscalYe
  * Maintained per year; a year without an entry throws (the row becomes no_rule, never a guessed date).
  */
 export const SEC_HOLIDAYS:Readonly<Record<number,readonly string[]>>={
+ // 2021–2023 per the OPM schedules as published (Juneteenth from 2021; New Year 2022 observed 2021-12-31, Veterans Day 2023 observed Fri 11-10).
+ 2021:['2021-01-01','2021-01-18','2021-02-15','2021-05-31','2021-06-18','2021-07-05','2021-09-06','2021-10-11','2021-11-11','2021-11-25','2021-12-24','2021-12-31'],
+ 2022:['2022-01-17','2022-02-21','2022-05-30','2022-06-20','2022-07-04','2022-09-05','2022-10-10','2022-11-11','2022-11-24','2022-12-26'],
+ 2023:['2023-01-02','2023-01-16','2023-02-20','2023-05-29','2023-06-19','2023-07-04','2023-09-04','2023-10-09','2023-11-10','2023-11-23','2023-12-25'],
  2024:['2024-01-01','2024-01-15','2024-02-19','2024-05-27','2024-06-19','2024-07-04','2024-09-02','2024-10-14','2024-11-11','2024-11-28','2024-12-25'],
  2025:['2025-01-01','2025-01-20','2025-02-17','2025-05-26','2025-06-19','2025-07-04','2025-09-01','2025-10-13','2025-11-11','2025-11-27','2025-12-25'],
  2026:['2026-01-01','2026-01-19','2026-02-16','2026-05-25','2026-06-19','2026-07-03','2026-09-07','2026-10-12','2026-11-11','2026-11-26','2026-12-25'],
@@ -69,7 +73,7 @@ export const SEC_HOLIDAYS:Readonly<Record<number,readonly string[]>>={
  * 2025-01-09 (national day of mourning), 2025-12-24 and 2025-12-26
  * (sec.gov/newsroom/whats-new/edgar-will-be-closed-december-24-2025-through-december-26-2025).
  */
-export const SEC_CLOSURES:Readonly<Record<number,readonly string[]>>={2024:['2024-12-24'],2025:['2025-01-09','2025-12-24','2025-12-26'],2026:[],2027:[]};
+export const SEC_CLOSURES:Readonly<Record<number,readonly string[]>>={2021:[],2022:[],2023:[],2024:['2024-12-24'],2025:['2025-01-09','2025-12-24','2025-12-26'],2026:[],2027:[]};
 export class HolidayTableMissing extends Error{constructor(public readonly year:number){super(`holiday_table_missing:${year}`);this.name='HolidayTableMissing';}}
 export function isSecBusinessDay(iso:string):boolean{
  const dow=new Date(toMs(iso)).getUTCDay();
@@ -80,8 +84,9 @@ export function isSecBusinessDay(iso:string):boolean{
 }
 /** Rule 0-3: a due date on a weekend, holiday or closure moves to the next SEC business day. */
 export function rollForward(iso:string):string{
- let d=iso;for(let i=0;i<15&&!isSecBusinessDay(d);i++)d=addDays(d,1);
- return d;
+ let d=iso;
+ for(let i=0;i<=15;i++){if(isSecBusinessDay(d))return d;d=addDays(d,1);}
+ throw new Error(`roll_forward_exhausted:${iso}`);
 }
 
 // ---------------------------------------------------------------- deadlines
@@ -126,13 +131,19 @@ const strideOf=(regime:FilingProfile['regime'])=>regime==='20-F'||regime==='40-F
 export function filingsWindowStart(today:string):string{const {y,m}=ym(today);return addDays(monthEnd(y,m-12*SLOT_COUNT-12),-MATCH_DAYS);}
 
 interface Estimate{periodEnd:string;basis:Record<string,unknown>}
-/** 52/53-week estimate for the slot ending in grid month-end `grid`: latest observed actual of the same position + 364 days per year (+7 when the result leaves the anchor month); no observation → the grid month end. */
+/** 52/53-week estimate for the slot ending in grid month-end `grid`: latest observed actual of the same position + 364 days per year, +7 when that lands nearer the anchor month end; no observation → the grid month end. */
 export function estimatePeriodEnd(grid:string,observed:readonly {date:string;source:string}[]):Estimate{
  const month=ym(grid).m;
  const prior=observed.filter(o=>ym(nearestMonthEnd(o.date)).m===month&&nearestMonthEnd(o.date)<grid).sort((a,b)=>b.date.localeCompare(a.date))[0];
  if(!prior)return {periodEnd:grid,basis:{source:'month_end'}};
  let e=prior.date;
- for(let i=0;i<10&&nearestMonthEnd(e)<grid;i++){e=addDays(e,364);if(ym(e).m!==month)e=addDays(e,7);}
+ for(let i=0;i<10&&nearestMonthEnd(e)<grid;i++){
+  const c=addDays(e,364),y=ym(c).y;
+  // anchor month end nearest the candidate (a period ending in the first days of the next month belongs to the previous anchor)
+  const t=[y-1,y,y+1].map(yy=>monthEnd(yy,month)).sort((a,b)=>Math.abs(diffDays(c,a))-Math.abs(diffDays(c,b)))[0];
+  const c7=addDays(c,7);
+  e=Math.abs(diffDays(c7,t))<Math.abs(diffDays(c,t))?c7:c;   // ties keep +364
+ }
  if(nearestMonthEnd(e)!==grid)return {periodEnd:grid,basis:{source:'month_end',fallback_from:prior.date}};
  return {periodEnd:e,basis:{source:prior.source,from:prior.date}};
 }
@@ -145,7 +156,7 @@ export function computeExpectations(input:{profile:FilingProfile;categories:File
  const week52=regime!=='cn'&&profile.week52_pattern;
  const base:Record<string,unknown>={rules_version:CALENDAR_RULES_VERSION};
  // Anchor month: the latest received annual report's actual period end wins over submissions fiscalYearEnd (§6.1).
- let anchor=+fye.slice(0,2);
+ let anchor=ym(nearestMonthEnd(`2000-${fye.slice(0,2)}-${fye.slice(2,4)}`)).m;   // '0203' → January, '0102' → December (D2)
  const latestAnnual=filings.filter(f=>counts(f,ANNUAL[regime])).sort((a,b)=>b.period_end!.localeCompare(a.period_end!))[0];
  if(latestAnnual&&regime!=='cn'){
   const pe=latestAnnual.period_end!;const m=ym(nearestMonthEnd(pe)).m;
@@ -162,7 +173,7 @@ export function computeExpectations(input:{profile:FilingProfile;categories:File
   if(((m-anchor)%stride+stride)%stride===0)slots.push({grid:monthEnd(y,m),month:m});
  }
  const rows:ExpectationRow[]=[];
- const planned:{grid:string;month:number;kind:ReportKind|null;periodEnd:string;estimated:boolean;received:CalendarFiling|null;basis?:Record<string,unknown>}[]=[];
+ const planned:{grid:string;month:number;kind:ReportKind|null;periodEnd:string;estimated:boolean;received:CalendarFiling|null;basis?:Record<string,unknown>;evidenceEnd?:string}[]=[];
  for(const s of slots){
   const kind=kindOf(regime,s.month,anchor);
   if(!kind||!week52){
@@ -175,10 +186,14 @@ export function computeExpectations(input:{profile:FilingProfile;categories:File
   const matches=filings.filter(f=>counts(f,kind)&&Math.abs(diffDays(f.period_end!,est.periodEnd))<=MATCH_DAYS);
   const received=earliest(matches);
   if(received)planned.push({...s,kind,periodEnd:received.period_end!,estimated:false,received,basis:{replaced_estimate:est.periodEnd}});
-  else planned.push({...s,kind,periodEnd:est.periodEnd,estimated:true,received:null,basis:est.basis});
+  else{
+   // upstream evidence is matched before the ended-slot cut: an actual report date before today makes the slot ended (D3)
+   const evidence=usEntries.filter(e=>e.form===kind&&e.reportDate!==null&&Math.abs(diffDays(e.reportDate,est.periodEnd))<=MATCH_DAYS).map(e=>e.reportDate!).sort()[0];
+   planned.push({...s,kind,periodEnd:est.periodEnd,estimated:true,received:null,basis:est.basis,evidenceEnd:evidence});
+  }
  }
  // applicable report kinds first, THEN the PERIODS limit (plan audit P6: a slot without a kind never takes a place)
- const ended=planned.filter(p=>p.kind!==null&&p.periodEnd<today).slice(0,PERIODS);
+ const ended=planned.filter(p=>p.kind!==null&&(p.periodEnd<today||(p.evidenceEnd!==undefined&&p.evidenceEnd<today))).slice(0,PERIODS);
  for(const p of ended){
   if(!p.kind)continue;
   const monthsAhead=((anchor-p.month)%12+12)%12;
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

exec
/bin/zsh -lc "find /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha -maxdepth 2 \\( -name AGENTS.md -o -name AGENTS.override.md -o -name CLAUDE.md \\) -print; ls .claude; git show e15e7da -- docs; rg 'fiscal_year_end|364|371|nearest' docs/plans -n | head -50; head -30 src/lib/dq/calendar.test.ts; cat package.json | head -65; find src docs -name CLAUDE.md -o -name AGENTS.md -o -name AGENTS.override.md" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 38ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md
agents
launch.json
scratch
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-YdVzeTtv' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-lM1YrSuz' (errno=Operation not permitted)
commit e15e7da08c788a529c69015e223efbc609e5e8b5
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 17:03:22 2026 -0800

    fix(dq): calendar 52/53-week nearest-step estimate, fiscal_year_end anchor normalisation, upstream-evidence slots, 2021-2023 holidays, rollForward exhaustion (17a review)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/docs/audits/2026-11-05-data-foundation-3/verification.md b/docs/audits/2026-11-05-data-foundation-3/verification.md
index abdd0648..083f2598 100644
--- a/docs/audits/2026-11-05-data-foundation-3/verification.md
+++ b/docs/audits/2026-11-05-data-foundation-3/verification.md
@@ -94,6 +94,7 @@
 ## SEC 假日与 Rule 0-3（Task 17a，2026-11-06 核对）
 
 - 规则：17 CFR 240.0-3(a)——最后一日为周六、周日或假日时，可在其后第一个营业日申报（https://www.law.cornell.edu/cfr/text/17/240.0-3 ，实施时抓取 200，原文含 "may be filed on the first business day following"）。
-- 联邦假日（5 U.S.C. 6103，按 OPM 公布的观察日）：https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/ ，实施时抓取 200，2026 与 2027 两张表逐日与 `SEC_HOLIDAYS` 一致（2026：01-01、01-19、02-16、05-25、06-19、07-03、09-07、10-12、11-11、11-26、12-25；2027：01-01、01-18、02-15、05-31、06-18、07-05、09-06、10-11、11-11、11-25、12-24）。OPM 2028 表首行 "Friday, December 31 * New Year's Day" 即 2027-12-31（2028 元旦周六的观察日），与 `SEC_HOLIDAYS[2027]` 第 12 项一致。2024、2025 两年未在页面上复核（页面只列当前及后续年份），取自规划时核对。
-- EDGAR 额外关闭日（SEC 公告：到期申报顺延至下一个运营营业日）：2024-12-24、2025-01-09（卡特总统国丧日）、2025-12-24 与 2025-12-26。两个 sec.gov 公告页（`edgar-closed-24-25-december-2024`、`edgar-will-be-closed-december-24-2025-through-december-26-2025`）实施时用描述性 User-Agent（无邮箱）各抓取一次，均返回 HTTP 403（1,924 字节，被 sec.gov 拦截），**未能联网复核**，日期取自规划时核对；未重试。2025-01-09 无单独链接，同样未复核。
-- 维护：`src/lib/dq/calendar.ts::SEC_HOLIDAYS/SEC_CLOSURES` 每年 12 月补次年；临时关闭按 SEC 公告补入 `SEC_CLOSURES`；表外年份的期限行为 `no_rule`（`none.holiday_table_missing/1`），不猜。
+- 联邦假日（5 U.S.C. 6103，按 OPM 公布的观察日）：https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/ ，2026-11-06 抓取 200，页面只列当前及后续年份：2026 与 2027 两张表逐日与 `SEC_HOLIDAYS` 一致（2026：01-01、01-19、02-16、05-25、06-19、07-03、09-07、10-12、11-11、11-26、12-25；2027：01-01、01-18、02-15、05-31、06-18、07-05、09-06、10-11、11-11、11-25、12-24）。OPM 2028 表首行 "Friday, December 31 * New Year's Day" 即 2027-12-31（2028 元旦周六的观察日），与 `SEC_HOLIDAYS[2027]` 第 12 项一致。
+- 2021–2025（审查 D4 把表扩到 2021）：OPM 页面不含这些年份，**未能联网复核**，取自规划时核对与实施者对 5 U.S.C. 6103 观察日规则的推算：2021 为 12 项（含首次的 Juneteenth 观察日 06-18，及 2022 元旦周六的观察日 2021-12-31）、2022 为 10 项（元旦已观察在 2021-12-31；Juneteenth 周日→06-20；圣诞周日→12-26）、2023 为 11 项（元旦周日→01-02；老兵节周六→11-10）、2024 与 2025 各 11 项。
+- EDGAR 额外关闭日（SEC 公告：到期申报顺延至下一个运营营业日）：2026-11-06 用默认 SEC User-Agent（`DEFAULT_USER_AGENT`，`src/lib/research/ingest/collectors/shared.ts`）各抓取一次，均 HTTP 200。`edgar-closed-24-25-december-2024`：EDGAR 于 2024-12-24 与 12-25 关闭，"Filings required to be made on Tuesday, December 24 and Wednesday, December 25 will be considered timely if filed on December 26, 2024"，与 `SEC_CLOSURES[2024]` 一致。`edgar-will-be-closed-december-24-2025-through-december-26-2025`：2025-12-24 与 12-26（及 12-25）关闭，12-29 恢复，与 `SEC_CLOSURES[2025]` 一致。2025-01-09（卡特总统国丧日）无单独链接，**未复核**（取自规划时核对）。此前同日首次抓取（描述性 User-Agent、无邮箱）两页均 403，已被本次结果取代。
+- 维护：`src/lib/dq/calendar.ts::SEC_HOLIDAYS/SEC_CLOSURES` 每年 12 月补次年；临时关闭按 SEC 公告补入 `SEC_CLOSURES`；表外年份的期限行为 `no_rule`（`none.holiday_table_missing/1`），不猜；`rollForward` 在 15 天内找不到营业日则抛错。
rg: docs/plans: IO error for operation on docs/plans: No such file or directory (os error 2)
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

exec
/bin/zsh -lc "cat /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; rg 'fiscal_year_end|week52_pattern' src/lib/dq -n | head -45; cat vitest.config.*; git show e15e7da --format= -- src/lib/dq/calendar.ts | tail -22" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>src/lib/dq/filer-categories.test.ts:59:  const rows=computeExpectations({profile:{issuer_id:ISSUER,market:'US',category_raw_current:null,regime:'10-K',fiscal_year_end:'1231',week52_pattern:false,source:'sec_submissions',source_sha256:null,as_of:'2026-11-01'},categories:[row(2026,'large_accelerated')],filings:[],upstream:{lookup:'ok',us:[]},today:'2026-11-05'});
src/lib/dq/calendar.test.ts:8:const profile=(p:Partial<FilingProfile>={}):FilingProfile=>({issuer_id:ISSUER,market:'US',category_raw_current:'Large accelerated filer',regime:'10-K',fiscal_year_end:'1231',week52_pattern:false,source:'sec_submissions',source_sha256:'s'.repeat(64),as_of:'2026-11-01',...p});
src/lib/dq/calendar.test.ts:115: it('no fiscal_year_end → no rows',()=>{expect(run({profile:{fiscal_year_end:null}})).toEqual([]);});
src/lib/dq/calendar.test.ts:117:  const r=run({profile:{fiscal_year_end:'1231'},filings:[filing('10-K','2025-09-30','2025-11-20')]});
src/lib/dq/calendar.test.ts:176: const wk=(p:Partial<FilingProfile>={})=>({fiscal_year_end:'0927',week52_pattern:true,...p});
src/lib/dq/calendar.test.ts:205: it('D2: a fiscal_year_end near a month boundary anchors on the nearest month end (0203 → January) and matches the submissions report',()=>{
src/lib/dq/calendar.test.ts:207:  const r=run({profile:{fiscal_year_end:'0203',week52_pattern:true},upstream:up,today:'2026-11-05',categories:[cat(2024,'large_accelerated'),cat(2025,'large_accelerated')]});
src/lib/dq/calendar.test.ts:210:  const dec=run({profile:{fiscal_year_end:'0102',week52_pattern:true}});
src/lib/dq/calendar.test.ts:215:  const r=run({profile:{fiscal_year_end:'0201',week52_pattern:true},filings:[filing('10-K','2024-02-03','2024-03-20')],upstream:up,today:'2025-02-05',categories:[cat(2023,'large_accelerated'),cat(2024,'large_accelerated')]});
src/lib/dq/calendar.test.ts:219:  const r2=run({profile:{fiscal_year_end:'0201',week52_pattern:true},filings:[filing('10-K','2024-02-08','2024-03-20')],upstream:late,today:'2025-02-05',categories:[cat(2023,'large_accelerated'),cat(2024,'large_accelerated')]});
src/lib/dq/calendar.test.ts:232: const cn=(o:{filings?:CalendarFiling[];upstream?:CalendarUpstream;today?:string}={})=>computeExpectations({profile:profile({market:'CN',regime:'cn',fiscal_year_end:'1231',category_raw_current:null,source:'cn_statutory',source_sha256:null}),categories:[],filings:o.filings??[],upstream:o.upstream??{lookup:'ok',cn:[]},today:o.today??'2026-11-05'});
src/lib/dq/calendar.ts:16:export interface FilingProfile{issuer_id:string;market:Market;category_raw_current:string|null;regime:'10-K'|'20-F'|'40-F'|'cn';fiscal_year_end:string|null;week52_pattern:boolean;source:string;source_sha256:string|null;as_of:string}
src/lib/dq/calendar.ts:154: const fye=regime==='cn'?'1231':profile.fiscal_year_end;
src/lib/dq/calendar.ts:155: if(fye===null)return [];   // spec §8: no fiscal_year_end → no rows (calendar-sync counts no_fiscal_year_end)
src/lib/dq/calendar.ts:156: const week52=regime!=='cn'&&profile.week52_pattern;
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-frY5L5Bd' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-Uo713j2M' (errno=Operation not permitted)
- const planned:{grid:string;month:number;kind:ReportKind|null;periodEnd:string;estimated:boolean;received:CalendarFiling|null;basis?:Record<string,unknown>}[]=[];
+ const planned:{grid:string;month:number;kind:ReportKind|null;periodEnd:string;estimated:boolean;received:CalendarFiling|null;basis?:Record<string,unknown>;evidenceEnd?:string}[]=[];
  for(const s of slots){
   const kind=kindOf(regime,s.month,anchor);
   if(!kind||!week52){
@@ -175,10 +186,14 @@ export function computeExpectations(input:{profile:FilingProfile;categories:File
   const matches=filings.filter(f=>counts(f,kind)&&Math.abs(diffDays(f.period_end!,est.periodEnd))<=MATCH_DAYS);
   const received=earliest(matches);
   if(received)planned.push({...s,kind,periodEnd:received.period_end!,estimated:false,received,basis:{replaced_estimate:est.periodEnd}});
-  else planned.push({...s,kind,periodEnd:est.periodEnd,estimated:true,received:null,basis:est.basis});
+  else{
+   // upstream evidence is matched before the ended-slot cut: an actual report date before today makes the slot ended (D3)
+   const evidence=usEntries.filter(e=>e.form===kind&&e.reportDate!==null&&Math.abs(diffDays(e.reportDate,est.periodEnd))<=MATCH_DAYS).map(e=>e.reportDate!).sort()[0];
+   planned.push({...s,kind,periodEnd:est.periodEnd,estimated:true,received:null,basis:est.basis,evidenceEnd:evidence});
+  }
  }
  // applicable report kinds first, THEN the PERIODS limit (plan audit P6: a slot without a kind never takes a place)
- const ended=planned.filter(p=>p.kind!==null&&p.periodEnd<today).slice(0,PERIODS);
+ const ended=planned.filter(p=>p.kind!==null&&(p.periodEnd<today||(p.evidenceEnd!==undefined&&p.evidenceEnd<today))).slice(0,PERIODS);
  for(const p of ended){
   if(!p.kind)continue;
   const monthsAhead=((anchor-p.month)%12+12)%12;

exec
/bin/zsh -lc 'node node_modules/vitest/vitest.mjs run src/lib/dq/calendar.test.ts --configLoader runner --no-cache' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 350ms:
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




exec
/bin/zsh -lc "node --input-type=module -e \"import {startVitest} from 'vitest/node'; const v=await startVitest('test',['src/lib/dq/calendar.test.ts'],{config:false,watch:false,cache:false}); await v?.close();\"" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 830ms:

 RUN  v4.1.11 /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61

 ❯ src/lib/dq/calendar.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/lib/dq/calendar.test.ts [ src/lib/dq/calendar.test.ts ]
Error: EPERM: operation not permitted, mkdir '/var/folders/97/wmwg4qzx02j74c3n73nh438w0000gn/T/5b_e20qaZaT8Mn4seqzkq/ssr'

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

 Test Files  1 failed (1)
      Tests  no tests
   Start at  17:04:26
   Duration  313ms (transform 0ms, setup 0ms, import 0ms, tests 0ms, environment 0ms)


codex
No actionable regressions were identified in the changed calendar logic or tests. Test execution was blocked by the read-only sandbox, so this verdict is based on static review.
No actionable regressions were identified in the changed calendar logic or tests. Test execution was blocked by the read-only sandbox, so this verdict is based on static review.

OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b14c-8a79-7703-86d1-ce2bd0555aa9
--------
user
commit 4c24061
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 4c24061; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 2963ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-K3Oy1zQ5' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-93wvVngK' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/16a-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-tdATBLpB' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-IHnEF49J' (errno=Operation not permitted)
4c240617 feat(dq): A-share gold-set validator and Tushare-vs-annual-report pair with printed-precision intervals
 src/lib/dq/reconcile/gold-cn.schema.test.ts |  79 +++++++++++++++++++++
 src/lib/dq/reconcile/gold-cn.ts             | 105 ++++++++++++++++++++++++++++
 src/lib/dq/reconcile/pair-cn-gold.test.ts   |  91 ++++++++++++++++++++++++
 src/lib/dq/reconcile/pair-cn-gold.ts        |  88 +++++++++++++++++++++++
 src/lib/dq/reconcile/pairs.ts               |   2 +
 src/lib/dq/reconcile/testing.ts             |   6 ++
 6 files changed, 371 insertions(+)

exec
/bin/zsh -lc 'pwd; ls -a | head -30; for p in /AGENTS.md /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do test ! -f "$p" || cat "$p"; done; git show 4c24061 --; cat src/lib/dq/reconcile/{types.ts,pairs.ts,testing.ts}; find . -name '"'*AGENTS*' -o -name CLAUDE.md" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 245ms:
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
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-csnFw2wo' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-zgfY4PSQ' (errno=Operation not permitted)
commit 4c2406174a4a2c0a320234cd0e242ecc463a6db6
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 06:38:56 2026 -0800

    feat(dq): A-share gold-set validator and Tushare-vs-annual-report pair with printed-precision intervals
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/dq/reconcile/gold-cn.schema.test.ts b/src/lib/dq/reconcile/gold-cn.schema.test.ts
new file mode 100644
index 00000000..bc10e39b
--- /dev/null
+++ b/src/lib/dq/reconcile/gold-cn.schema.test.ts
@@ -0,0 +1,79 @@
+// src/lib/dq/reconcile/gold-cn.schema.test.ts
+import {describe,expect,it} from 'vitest';
+import {CN_GOLD_CONCEPTS,GOLD_CN_SCHEMA,autoQuarantinable,cnGoldKey,cnPeriodOf,goldTemplate,pickCnSample,printedInterval,validateGoldCn} from './gold-cn';
+import {goldRow} from './testing';
+
+const TICKERS=['000001.SZ','600519.SH'];
+const YEARS=[2022,2023,2024,2025];
+const product=(tickers=TICKERS)=>tickers.flatMap(t=>YEARS.flatMap(fy=>CN_GOLD_CONCEPTS.map(c=>goldRow(t,fy,c))));
+const file=(rows=product(),o:Record<string,unknown>={})=>({schema:GOLD_CN_SCHEMA,tickers:TICKERS,fiscal_years:YEARS,concepts:[...CN_GOLD_CONCEPTS],recorded_by:'R1',reviewed_by:'R2',rows,...o});
+const errorsOf=(j:unknown)=>{const r=validateGoldCn(j);return r.ok?[]:r.errors;};
+
+describe('validateGoldCn (spec §5.4 validator)',()=>{
+ it('accepts the exact tickers × 4 years × 6 concepts product',()=>{
+  const r=validateGoldCn(file());
+  expect(r.ok).toBe(true);
+  if(r.ok)expect(r.file.rows).toHaveLength(2*4*6);
+ });
+ it.each([
+  ['a missing combination',()=>file(product().slice(1))],
+  ['a duplicate row',()=>file([...product(),goldRow('600519.SH',2024,'total_assets')])],
+  ['an extra ticker row',()=>file([...product(),goldRow('600000.SH',2024,'total_assets')])],
+  ['empty tickers',()=>file([],{tickers:[]})],
+  ['an invalid ticker',()=>file(product(),{tickers:['600519','000001.SZ']})],
+  ['fiscal years other than FY2022–FY2025',()=>file(product(),{fiscal_years:[2023,2024,2025]})],
+  ['concepts other than the fixed six',()=>file(product(),{concepts:[...CN_GOLD_CONCEPTS.slice(1),'revenue']})],
+  ['recorded_by == reviewed_by',()=>file(product(),{reviewed_by:'R1'})],
+  ['a printed value with thousands separators',()=>file(product().map((r,i)=>i===0?{...r,printed_value:'1,234,567.89'}:r))],
+  ['decimals not matching printed_decimals',()=>file(product().map((r,i)=>i===0?{...r,printed_value:'1234567.8'}:r))],
+  ['eps with a multiplier',()=>file(product().map(r=>r.concept==='eps_basic'?{...r,printed_unit_multiplier:10000}:r))],
+  ['an unknown multiplier',()=>file(product().map((r,i)=>i===0?{...r,printed_unit_multiplier:100}:r))],
+  ['column other than 本期',()=>file(product().map((r,i)=>i===0?{...r,column:'上期' as '本期'}:r))],
+  ['a missing page',()=>file(product().map((r,i)=>i===0?{...r,source:{...r.source,page:0}}:r))],
+  ['a malformed pdf sha256',()=>file(product().map((r,i)=>i===0?{...r,source:{...r.source,pdf_sha256:'abc'}}:r))],
+  ['a missing announcement id',()=>file(product().map((r,i)=>i===0?{...r,source:{...r.source,cninfo_announcement_id:''}}:r))],
+  ['a missing announcement date',()=>file(product().map((r,i)=>i===0?{...r,source:{...r.source,announcement_date:'2025/04/03'}}:r))],
+  ['a missing tushare_source_ref',()=>file(product().map((r,i)=>i===0?{...r,tushare_source_ref:''}:r))],
+  ['a source ref of another ticker',()=>file(product().map((r,i)=>i===0?{...r,tushare_source_ref:r.tushare_source_ref.replace(/^\d{6}\.\w{2}/,'600000.SH')}:r))],
+  ['a source ref of another period',()=>file(product().map((r,i)=>i===0?{...r,tushare_source_ref:r.tushare_source_ref.replace(/:\d{8}:/,':20230630:')}:r))],
+  ['a report_type segment that differs from the row',()=>file(product().map((r,i)=>i===0?{...r,report_type:5}:r))],
+ ])('rejects %s',(_n,make)=>{expect(errorsOf(make()).length).toBeGreaterThan(0);});
+ it('natural key is <ticker>:<fy>:<concept>:<report_type>',()=>{
+  expect(cnGoldKey(goldRow('600519.SH',2024,'revenue_operating'))).toBe('600519.SH:2024:revenue_operating:1');
+ });
+});
+
+describe('printed-precision interval and the review/quarantine boundary',()=>{
+ it.each([
+  ['1234567.89',1,2,'1234567.89','0.005'],
+  ['123.46',10000,2,'1234600','50'],
+  ['1235',1000000,0,'1235000000','500000'],
+  ['-12.3',1000,1,'-12300','50'],
+  ['49.93',1,2,'49.93','0.005'],
+ ])('%s × %d (%d decimals) → center %s radius %s',(v,m,d,center,radius)=>{
+  expect(printedInterval({printed_value:v,printed_unit_multiplier:m,printed_decimals:d})).toEqual({center,radius});
+ });
+ it('only exact printing (multiplier 1, two decimals) may quarantine automatically',()=>{
+  expect(autoQuarantinable({printed_unit_multiplier:1,printed_decimals:2})).toBe(true);
+  expect(autoQuarantinable({printed_unit_multiplier:10000,printed_decimals:2})).toBe(false);
+  expect(autoQuarantinable({printed_unit_multiplier:1,printed_decimals:0})).toBe(false);
+ });
+ it('periods and units per concept: BS instant, IS/CF 12M from Jan 1, eps per share',()=>{
+  expect(cnPeriodOf(2024,'total_assets')).toEqual({period_start:null,period_end:'2024-12-31',duration:'INSTANT',unit:'CNY'});
+  expect(cnPeriodOf(2024,'revenue_operating')).toEqual({period_start:'2024-01-01',period_end:'2024-12-31',duration:'12M',unit:'CNY'});
+  expect(cnPeriodOf(2024,'eps_basic')).toEqual({period_start:'2024-01-01',period_end:'2024-12-31',duration:'12M',unit:'CNY/share'});
+ });
+});
+
+describe('sample selection and transcription template',()=>{
+ it('pickCnSample: valid unique tickers ascending, first min(n, N)',()=>{
+  expect(pickCnSample(['600519.SH','000001.SZ',null,'600519.SH','bad','300750.SZ'],2)).toEqual(['000001.SZ','300750.SZ']);
+  expect(pickCnSample([],30)).toEqual([]);
+ });
+ it('goldTemplate is the exact product with <pending> fields and fails validation until transcribed',()=>{
+  const t=goldTemplate(['600519.SH']);
+  expect(t.rows).toHaveLength(4*6);
+  expect(t.rows[0]).toMatchObject({ticker:'600519.SH',fiscal_year:2022,concept:CN_GOLD_CONCEPTS[0],printed_value:'<pending>',tushare_source_ref:'<pending>'});
+  expect(validateGoldCn(t).ok).toBe(false);
+ });
+});
diff --git a/src/lib/dq/reconcile/gold-cn.ts b/src/lib/dq/reconcile/gold-cn.ts
new file mode 100644
index 00000000..de2c1567
--- /dev/null
+++ b/src/lib/dq/reconcile/gold-cn.ts
@@ -0,0 +1,105 @@
+// src/lib/dq/reconcile/gold-cn.ts
+// A-share annual-report gold set (spec §5.4, T14; schema 'gold/cn-annual/1'), validator and the printed-precision
+// rules. Fixed: the six concepts of the annual report table 主要会计数据和财务指标 (BS concepts INSTANT, IS/CF 12M,
+// eps CNY/share with multiplier 1), fiscal years FY2022–FY2025 (owner decision E), only the 本期 column, recorder
+// and reviewer as code names that must differ. The validator rejects anything that is not the EXACT product
+// tickers × fiscal_years × concepts. Every row carries tushare_source_ref = <ts_code>:<end_date>:<report_type>:<ann_date>,
+// independently verified by recorder and reviewer to be the same version as the PDF (pdf_sha256); the pair binds the
+// left side ONLY through it (filings.document_ref is a cross-check). Interval: center = printed × multiplier,
+// radius = 0.5 × 10^-decimals × multiplier; automatic quarantine only for exact printing (multiplier 1, two
+// decimals), rounded printing gets a review item. goldTemplate builds the transcription template (every printed and
+// source field '<pending>', so it fails validation until transcribed); pickCnSample is §5.4's sample rule.
+import {conceptById} from '../../facts/concepts';
+import {canonicalDecimal} from '../../facts/json-numbers';
+import {mulDecimal} from './decimal';
+
+export const GOLD_CN_SCHEMA='gold/cn-annual/1';
+export const CN_GOLD_PATH='src/lib/dq/fixtures/gold/cn-annual-v1.json';
+export const CN_GOLD_PARSER='gold-cn/1';
+export const CN_GOLD_CONCEPTS=['revenue_operating','net_income_parent','total_assets','equity_parent','operating_cash_flow','eps_basic'] as const;
+export type CnGoldConcept=typeof CN_GOLD_CONCEPTS[number];
+export const CN_GOLD_FISCAL_YEARS:readonly number[]=[2022,2023,2024,2025];
+export const CN_GOLD_MULTIPLIERS:readonly number[]=[1,1000,10000,1000000,100000000];
+export interface GoldCnSource{document:string;cninfo_announcement_id:string;announcement_date:string;pdf_url:string;pdf_sha256:string;page:number;table:string}
+export interface GoldCnRow{ticker:string;fiscal_year:number;concept:CnGoldConcept;printed_value:string;printed_unit_multiplier:number;printed_decimals:number;column:'本期';report_type?:number;source:GoldCnSource;tushare_source_ref:string;recorded_at:string}
+export interface GoldCnFile{schema:typeof GOLD_CN_SCHEMA;tickers:string[];fiscal_years:number[];concepts:string[];recorded_by:string;reviewed_by:string;rows:GoldCnRow[]}
+
+const TICKER=/^\d{6}\.(SH|SZ|BJ)$/,CODE=/^[A-Za-z0-9_-]{1,32}$/,DATE=/^\d{4}-\d{2}-\d{2}$/,SHA=/^[0-9a-f]{64}$/,PRINTED=/^-?\d+(\.\d+)?$/;
+const REF=/^(\d{6}\.(?:SH|SZ|BJ)):(\d{8}):(\d+):(\d{8})$/;
+const str=(v:unknown):v is string=>typeof v==='string'&&v.trim()!=='';
+const fraction=(v:string)=>{const i=v.indexOf('.');return i<0?0:v.length-i-1;};
+
+export const cnGoldKey=(r:Pick<GoldCnRow,'ticker'|'fiscal_year'|'concept'|'tushare_source_ref'>)=>`${r.ticker}:${r.fiscal_year}:${r.concept}:${r.tushare_source_ref.split(':')[2]??''}`;
+
+export function validateGoldCn(json:unknown):{ok:true;file:GoldCnFile}|{ok:false;errors:string[]}{
+ const errors:string[]=[];const e=(m:string)=>{errors.push(m);};
+ const f=json as Partial<GoldCnFile>|null;
+ if(!f||typeof f!=='object')return {ok:false,errors:['not_an_object']};
+ if(f.schema!==GOLD_CN_SCHEMA)e('schema');
+ const tickers=Array.isArray(f.tickers)?f.tickers:[];
+ if(tickers.length===0)e('tickers: empty');
+ if(tickers.some(t=>typeof t!=='string'||!TICKER.test(t)))e('tickers: invalid ticker');
+ if(new Set(tickers).size!==tickers.length)e('tickers: duplicate');
+ const years=Array.isArray(f.fiscal_years)?f.fiscal_years:[];
+ if(JSON.stringify([...years].sort())!==JSON.stringify([...CN_GOLD_FISCAL_YEARS]))e('fiscal_years: must be FY2022–FY2025');
+ const concepts=Array.isArray(f.concepts)?f.concepts:[];
+ if(concepts.length!==CN_GOLD_CONCEPTS.length||!CN_GOLD_CONCEPTS.every(c=>concepts.includes(c)))e('concepts: must be the fixed six');
+ if(!str(f.recorded_by)||!CODE.test(f.recorded_by))e('recorded_by: code name');
+ if(!str(f.reviewed_by)||!CODE.test(f.reviewed_by))e('reviewed_by: code name');
+ if(f.recorded_by===f.reviewed_by)e('recorded_by == reviewed_by');
+ const rows=Array.isArray(f.rows)?f.rows:[];
+ const seen=new Set<string>();
+ rows.forEach((r,i)=>{
+  const at=`rows[${i}]`;
+  if(!r||typeof r!=='object'){e(`${at}: not an object`);return;}
+  const combo=`${r.ticker}|${r.fiscal_year}|${r.concept}`;
+  if(!tickers.includes(r.ticker)||!years.includes(r.fiscal_year)||!(CN_GOLD_CONCEPTS as readonly string[]).includes(r.concept))e(`${at}: ${combo} outside the product`);
+  if(seen.has(combo))e(`${at}: duplicate ${combo}`);seen.add(combo);
+  if(typeof r.printed_value!=='string'||!PRINTED.test(r.printed_value))e(`${at}.printed_value`);
+  else if(!Number.isInteger(r.printed_decimals)||r.printed_decimals<0||r.printed_decimals>6||fraction(r.printed_value)!==r.printed_decimals)e(`${at}.printed_decimals`);
+  if(!CN_GOLD_MULTIPLIERS.includes(r.printed_unit_multiplier))e(`${at}.printed_unit_multiplier`);
+  if(r.concept==='eps_basic'&&r.printed_unit_multiplier!==1)e(`${at}: eps multiplier must be 1`);
+  if(r.column!=='本期')e(`${at}.column`);
+  const s=(r.source??{}) as Partial<GoldCnSource>;
+  if(!Number.isInteger(s.page)||(s.page as number)<1)e(`${at}.source.page`);
+  if(typeof s.pdf_sha256!=='string'||!SHA.test(s.pdf_sha256))e(`${at}.source.pdf_sha256`);
+  if(!str(s.cninfo_announcement_id))e(`${at}.source.cninfo_announcement_id`);
+  if(typeof s.announcement_date!=='string'||!DATE.test(s.announcement_date))e(`${at}.source.announcement_date`);
+  if(!str(s.document))e(`${at}.source.document`);
+  if(!str(s.table))e(`${at}.source.table`);
+  if(typeof s.pdf_url!=='string'||!/^https?:\/\//.test(s.pdf_url))e(`${at}.source.pdf_url`);
+  const m=typeof r.tushare_source_ref==='string'?REF.exec(r.tushare_source_ref):null;
+  if(!m)e(`${at}.tushare_source_ref`);
+  else{
+   if(m[1]!==r.ticker)e(`${at}.tushare_source_ref: ts_code ${m[1]} != ${r.ticker}`);
+   if(m[2]!==`${r.fiscal_year}1231`)e(`${at}.tushare_source_ref: end_date ${m[2]} != ${r.fiscal_year}1231`);
+   if(m[3]!==String(r.report_type??1))e(`${at}.tushare_source_ref: report_type ${m[3]} != ${r.report_type??1}`);
+  }
+  if(typeof r.recorded_at!=='string'||Number.isNaN(Date.parse(r.recorded_at)))e(`${at}.recorded_at`);
+ });
+ for(const t of tickers)for(const y of years)for(const c of CN_GOLD_CONCEPTS)if(!seen.has(`${t}|${y}|${c}`))e(`missing ${t}|${y}|${c}`);
+ return errors.length>0?{ok:false,errors}:{ok:true,file:f as GoldCnFile};
+}
+
+export function printedInterval(r:Pick<GoldCnRow,'printed_value'|'printed_unit_multiplier'|'printed_decimals'>):{center:string;radius:string}{
+ const mult=String(r.printed_unit_multiplier);
+ return {center:mulDecimal(canonicalDecimal(r.printed_value),mult),radius:mulDecimal(canonicalDecimal(`5e-${r.printed_decimals+1}`),mult)};
+}
+export const autoQuarantinable=(r:Pick<GoldCnRow,'printed_unit_multiplier'|'printed_decimals'>):boolean=>r.printed_unit_multiplier===1&&r.printed_decimals===2;
+export function cnPeriodOf(fy:number,concept:string):{period_start:string|null;period_end:string;duration:'12M'|'INSTANT';unit:'CNY'|'CNY/share'}{
+ const def=conceptById(concept);if(!def)throw new Error(`unknown_concept:${concept}`);
+ const instant=def.nature==='instant';
+ return {period_start:instant?null:`${fy}-01-01`,period_end:`${fy}-12-31`,duration:instant?'INSTANT':'12M',unit:def.unitKind==='per_share'?'CNY/share':'CNY'};
+}
+
+/** §5.4 sample: valid unique tickers ascending, the first min(n, N). */
+export function pickCnSample(tickers:readonly (string|null)[],n=30):string[]{
+ return [...new Set(tickers.filter((t):t is string=>typeof t==='string'&&TICKER.test(t)))].sort().slice(0,Math.max(0,n));
+}
+/** Transcription template: the exact product, every printed/source field '<pending>' (fails validateGoldCn until filled). */
+export function goldTemplate(tickers:readonly string[]):Omit<GoldCnFile,'rows'>&{rows:Record<string,unknown>[]}{
+ const P='<pending>';
+ return {schema:GOLD_CN_SCHEMA,tickers:[...tickers],fiscal_years:[...CN_GOLD_FISCAL_YEARS],concepts:[...CN_GOLD_CONCEPTS],recorded_by:P,reviewed_by:P,
+  rows:tickers.flatMap(ticker=>CN_GOLD_FISCAL_YEARS.flatMap(fiscal_year=>CN_GOLD_CONCEPTS.map(concept=>({ticker,fiscal_year,concept,printed_value:P,printed_unit_multiplier:concept==='eps_basic'?1:P,printed_decimals:P,column:'本期',
+   source:{document:P,cninfo_announcement_id:P,announcement_date:P,pdf_url:P,pdf_sha256:P,page:P,table:'主要会计数据和财务指标'},tushare_source_ref:P,recorded_at:P}))))};
+}
diff --git a/src/lib/dq/reconcile/pair-cn-gold.test.ts b/src/lib/dq/reconcile/pair-cn-gold.test.ts
new file mode 100644
index 00000000..a832080c
--- /dev/null
+++ b/src/lib/dq/reconcile/pair-cn-gold.test.ts
@@ -0,0 +1,91 @@
+// src/lib/dq/reconcile/pair-cn-gold.test.ts
+import {randomUUID} from 'node:crypto';
+import {describe,expect,it} from 'vitest';
+import {memoryFactsDb} from '../../facts/memory-facts-db';
+import {makeBudget} from '../../facts/sync';
+import {memoryRawStore} from '../raw-store';
+import {divDecimal} from './decimal';
+import {computeInputsHash} from './inputs-hash';
+import {CN_GOLD_CONCEPTS,CN_GOLD_PARSER,CN_GOLD_PATH,GOLD_CN_SCHEMA} from './gold-cn';
+import type {GoldCnRow} from './gold-cn';
+import {sha256Hex} from './pair-support';
+import {cnTushareVsGoldPair} from './pair-cn-gold';
+import {RECONCILE_PAIRS} from './pairs';
+import {goldRow,reconcileTables,seedPublished} from './testing';
+import type {PairContext,ReconcileResultInput} from './types';
+
+const TICKER='600519.SH',REF='600519.SH:20241231:1:20250403';
+const D={period_start:'2024-01-01',period_end:'2024-12-31'},I={period_start:null,period_end:'2024-12-31'};
+const OVERRIDE:Record<string,Partial<GoldCnRow>>={
+ revenue_operating:{printed_value:'1234567.89'},                                         // exact, equal → passed
+ net_income_parent:{printed_value:'1234567.89'},                                         // exact, left .90 → quarantine_left
+ total_assets:{printed_value:'123.46',printed_unit_multiplier:10000},                    // 万元: |1234567.89 − 1234600| = 32.11 ≤ 50 → passed
+ equity_parent:{printed_value:'123.46',printed_unit_multiplier:10000},                   // 万元: |1234700 − 1234600| = 100 > 50 → review_item
+ operating_cash_flow:{printed_value:'1.00'},                                             // no fact → left_missing
+ eps_basic:{printed_value:'49.93'},
+};
+function goldBytes(){
+ const rows=[2022,2023,2024,2025].flatMap(fy=>CN_GOLD_CONCEPTS.map(c=>goldRow(TICKER,fy,c,fy===2024?OVERRIDE[c]:{})));
+ return new TextEncoder().encode(JSON.stringify({schema:GOLD_CN_SCHEMA,tickers:[TICKER],fiscal_years:[2022,2023,2024,2025],concepts:[...CN_GOLD_CONCEPTS],recorded_by:'R1',reviewed_by:'R2',rows}));
+}
+async function setup(){
+ const tables=reconcileTables();const db=memoryFactsDb(tables);const issuer=randomUUID();
+ await tables.insert('issuers',{issuer_id:issuer,status:'active',merged_into:null,cik:null,lei:null,usci:null,canonical_name_en:null,canonical_name_zh:'贵州茅台'});
+ await tables.insert('issuer_securities',{issuer_id:issuer,ticker:TICKER,valid_from:'2001-08-27',valid_to:null,is_primary:true,share_class:'A',isin:null,figi:null});
+ const seeded=await seedPublished(db,{issuer,market:'CN',sourceRef:REF,availableDate:'2025-04-03',facts:[
+  {concept:'revenue_operating',value:'1234567.89',...D},{concept:'net_income_parent',value:'1234567.9',...D},
+  {concept:'total_assets',value:'1234567.89',...I},{concept:'equity_parent',value:'1234700',...I},
+  {concept:'eps_basic',value:'49.93',...D,unit:'CNY/share'}]});
+ const bytes=goldBytes();
+ const ctx:PairContext={db,tables,raw:memoryRawStore(),now:()=>new Date('2026-11-05T00:00:00Z'),budget:makeBudget(null),fetch:(async()=>{throw new Error('no network');}) as unknown as typeof fetch,
+  readRepoFile:async p=>{if(p!==CN_GOLD_PATH)throw new Error(`missing ${p}`);return bytes;}};
+ const facts=new Map((await db.factsByIds(seeded.factIds)).map(f=>[f.concept,f]));
+ return {db,tables,ctx,issuer,seeded,facts,goldSha:sha256Hex(bytes)};
+}
+const byKey=(res:ReconcileResultInput[],concept:string,fy=2024)=>res.find(r=>r.natural_key===`${TICKER}:${fy}:${concept}:1`)!;
+
+describe('cn.tushare_vs_cninfo_pdf_gold',()=>{
+ it('is registered with the gold file and parser version',()=>{
+  expect(RECONCILE_PAIRS['cn.tushare_vs_cninfo_pdf_gold']?.inputs).toEqual({repoFile:CN_GOLD_PATH,parserVersion:CN_GOLD_PARSER,goldSchema:GOLD_CN_SCHEMA});
+ });
+ it('one result per gold row: printed-precision interval, quarantine only for exact printing, review item for rounded printing',async()=>{
+  const s=await setup();
+  const pair=cnTushareVsGoldPair();
+  const [m]=await pair.members(s.ctx);
+  expect(m).toMatchObject({issuerId:s.issuer,market:'CN'});expect(m.expectedKeys).toHaveLength(24);
+  const res=await pair.evaluate(s.ctx,m);
+  expect(res).toHaveLength(24);
+  const rev=byKey(res,'revenue_operating');
+  expect(rev).toMatchObject({outcome:'compared',passed:true,action:'record',left_value:'1234567.89',right_value:'1234567.89',tolerance:divDecimal('0.005','1234567.89',20)});
+  expect(rev.detail).toMatchObject({tolerance_rule:'printed_precision/1',interval:{center:'1234567.89',radius:'0.005'},document_ref_mismatch:true});
+  expect(rev.inputs_hash).toBe(computeInputsHash({left_raw_hash:s.facts.get('revenue_operating')!.raw_hash,right_sha256:'c'.repeat(64),gold_or_sample_sha256:s.goldSha,parser_version:CN_GOLD_PARSER}));
+  const ni=byKey(res,'net_income_parent');
+  expect(ni).toMatchObject({outcome:'compared',passed:false,action:'quarantine_left',left_value:'1234567.9',right_value:'1234567.89',left_fact_id:s.facts.get('net_income_parent')!.fact_id});
+  expect(ni.item?.natural_key).toBe(`cn.tushare_vs_cninfo_pdf_gold:${TICKER}:2024:net_income_parent:1:${s.facts.get('net_income_parent')!.fact_id}`);
+  expect(byKey(res,'total_assets')).toMatchObject({outcome:'compared',passed:true,action:'record',right_value:'1234600',tolerance:divDecimal('50','1234600',20)});
+  const eq=byKey(res,'equity_parent');
+  expect(eq).toMatchObject({outcome:'compared',passed:false,action:'review_item',left_value:'1234700',right_value:'1234600'});
+  expect(eq.item?.payload).toMatchObject({fact_ids:[s.facts.get('equity_parent')!.fact_id]});
+  expect(eq.detail.auto_quarantine).toBe(false);
+  expect(byKey(res,'operating_cash_flow')).toMatchObject({outcome:'left_missing',action:'record'});
+  expect(byKey(res,'eps_basic')).toMatchObject({outcome:'compared',passed:true});
+  expect(byKey(res,'total_assets',2023)).toMatchObject({outcome:'left_unlinked',passed:false});
+  expect(res.filter(r=>r.outcome==='left_unlinked')).toHaveLength(18);
+ });
+ it('binds by the verified tushare_source_ref only: a matching document_ref clears the mismatch flag, a different one never rebinds',async()=>{
+  const s=await setup();
+  await s.db.updateFilingLink(s.seeded.filingId,{document_ref:`ann-${TICKER}-2024`,document_url:null,link_attempts:1});
+  const pair=cnTushareVsGoldPair();const [m]=await pair.members(s.ctx);
+  const rev=byKey(await pair.evaluate(s.ctx,m),'revenue_operating');
+  expect(rev.detail.document_ref_mismatch).toBeUndefined();
+  await s.db.updateFilingLink(s.seeded.filingId,{document_ref:'some-correction-announcement',document_url:null,link_attempts:2});
+  const again=byKey(await pair.evaluate(s.ctx,m),'revenue_operating');
+  expect(again).toMatchObject({outcome:'compared',passed:true,left_fact_id:s.facts.get('revenue_operating')!.fact_id,detail:expect.objectContaining({document_ref_mismatch:true})});
+ });
+ it('a missing or invalid gold file refuses the run (degraded path: the file does not exist yet)',async()=>{
+  const s=await setup();
+  const pair=cnTushareVsGoldPair();
+  await expect(pair.members({...s.ctx,readRepoFile:async()=>{throw new Error('ENOENT');}})).rejects.toMatchObject({code:'invalid_gold_file'});
+  await expect(pair.members({...s.ctx,readRepoFile:async()=>new TextEncoder().encode(JSON.stringify({schema:GOLD_CN_SCHEMA,tickers:[],rows:[]}))})).rejects.toMatchObject({code:'invalid_gold_file'});
+ });
+});
diff --git a/src/lib/dq/reconcile/pair-cn-gold.ts b/src/lib/dq/reconcile/pair-cn-gold.ts
new file mode 100644
index 00000000..92174b77
--- /dev/null
+++ b/src/lib/dq/reconcile/pair-cn-gold.ts
@@ -0,0 +1,88 @@
+// src/lib/dq/reconcile/pair-cn-gold.ts
+// cn.tushare_vs_cninfo_pdf_gold (spec §5.4, T14, owner decision D). Members = the gold file's tickers resolved to
+// issuers (CN); expected keys = its rows (<ticker>:<fy>:<concept>:<report_type>). Left binding ONLY through the
+// verified tushare_source_ref: filings(source tushare, source_ref) — absent → left_unlinked; a document_ref that
+// differs from cninfo_announcement_id is recorded as detail.document_ref_mismatch and never rebinds or substitutes
+// (the plan-2 linker may point type-1 filings at a correction or the next year's report). Facts: read_filing_facts
+// filtered by activeRows and by the concept's period/duration/unit; an open reconcile_mismatch item pins its fact.
+// passed ⇔ left ∈ [center − radius, center + radius] (cross-multiplication); tolerance = radius / max(|l|,|center|,1).
+// A failure quarantines the ok left row only for exact printing (multiplier 1, two decimals); rounded printing opens a
+// reconcile_review item and the fact stays ok — whether a difference is rounding or data is a human call.
+// Degraded path (no TUSHARE_TOKEN, no transcriber yet): the gold file does not exist, members() → invalid_gold_file;
+// no CN cron (vercel.json) and the route refuses cn.* without FACTS_CN_ENABLED=1.
+import {resolveIssuer} from '../../entities/resolve';
+import type {FactRow} from '../../facts/types';
+import {divDecimal,maxAbsDecimal,withinRadius} from './decimal';
+import {CN_GOLD_PARSER,CN_GOLD_PATH,GOLD_CN_SCHEMA,autoQuarantinable,cnGoldKey,cnPeriodOf,printedInterval,validateGoldCn} from './gold-cn';
+import type {GoldCnFile} from './gold-cn';
+import {computeInputsHash} from './inputs-hash';
+import {ReconcileConfigError,actionFor,activeRows,comparedNumeric,fractionDigits,mismatchItem,notCompared,openMismatches,readRepoJson,todayOf} from './pair-support';
+import type {RegisteredPair} from './pair-support';
+import type {MemberPlan,PairContext,ReconcileResultInput} from './types';
+
+const PAIR='cn.tushare_vs_cninfo_pdf_gold' as const;
+const SIDES={left_source:'tushare',right_source:'cninfo.pdf.gold'};
+
+async function loadGold(ctx:PairContext):Promise<{file:GoldCnFile;sha256:string}>{
+ const {json,sha256}=await readRepoJson(ctx,CN_GOLD_PATH,'invalid_gold_file');
+ const v=validateGoldCn(json);
+ if(!v.ok)throw new ReconcileConfigError('invalid_gold_file',v.errors.slice(0,5).join('; '));
+ return {file:v.file,sha256};
+}
+
+export function cnTushareVsGoldPair():RegisteredPair{
+ return {
+  id:PAIR,kind:'numeric',left:'tushare',right:'cninfo.pdf.gold',
+  inputs:{repoFile:CN_GOLD_PATH,parserVersion:CN_GOLD_PARSER,goldSchema:GOLD_CN_SCHEMA},
+  // the current gold manifest row of the key names the PDF evidence (source.pdf_sha256); gone → null (plan audit P2)
+  async currentRight(ctx,rec){
+   try{const {file}=await loadGold(ctx);return file.rows.find(r=>cnGoldKey(r)===String(rec.natural_key))?.source.pdf_sha256??null;}
+   catch(e){if(e instanceof ReconcileConfigError)return null;throw e;}
+  },
+  async members(ctx){
+   const {file}=await loadGold(ctx);
+   const out:MemberPlan[]=[];
+   for(const ticker of [...file.tickers].sort()){
+    const r=await resolveIssuer(ctx.tables,{ticker},{today:todayOf(ctx)});
+    if(!r)throw new ReconcileConfigError('issuer_unresolved',ticker);
+    const rows=file.rows.filter(x=>x.ticker===ticker).sort((a,b)=>a.fiscal_year-b.fiscal_year||a.concept.localeCompare(b.concept));
+    out.push({issuerId:r.issuer_id,market:'CN',expectedKeys:rows.map(x=>({naturalKey:cnGoldKey(x),locator:{ticker,fiscal_year:x.fiscal_year,concept:x.concept,tushare_source_ref:x.tushare_source_ref}}))});
+   }
+   return out;
+  },
+  async evaluate(ctx,member){
+   const {file,sha256:goldSha}=await loadGold(ctx);
+   const current=new Map(file.rows.map(r=>[cnGoldKey(r),r]));
+   const open=await openMismatches(ctx.tables,PAIR,'CN');
+   const out:ReconcileResultInput[]=[];
+   for(const k of member.expectedKeys){
+    const row=current.get(k.naturalKey);
+    if(!row){out.push(notCompared(k.naturalKey,'numeric','incomplete_gold',SIDES,{reason:'row_removed'}));continue;}
+    const filing=await ctx.db.findFilingBySourceRef('tushare',row.tushare_source_ref);
+    if(!filing){out.push(notCompared(k.naturalKey,'numeric','left_unlinked',SIDES,{tushare_source_ref:row.tushare_source_ref}));continue;}
+    const docMismatch=filing.document_ref!==row.source.cninfo_announcement_id;
+    const p=cnPeriodOf(row.fiscal_year,row.concept);
+    const bound=open.get(k.naturalKey);
+    const rows:FactRow[]=bound?(await ctx.db.factsByIds([bound.factIds[0]])).slice(0,1)
+     :activeRows(await ctx.db.readFilingFacts(filing.filing_id,true),filing).filter(f=>f.concept===row.concept&&f.period_end===p.period_end&&f.period_start===p.period_start&&f.duration===p.duration&&f.unit===p.unit);
+    const flag=docMismatch?{document_ref_mismatch:true}:{};
+    if(rows.length===0){out.push(notCompared(k.naturalKey,'numeric','left_missing',SIDES,{filing_id:filing.filing_id,...flag}));continue;}
+    if(rows.length>1){out.push(notCompared(k.naturalKey,'numeric','left_ambiguous',SIDES,{fact_ids:rows.map(r=>r.fact_id),...flag}));continue;}
+    const left=rows[0];
+    const {center,radius}=printedInterval(row);
+    const passed=withinRadius(left.value,center,radius);
+    const tolerance=divDecimal(radius,maxAbsDecimal(left.value,center,'1'),20);
+    const auto=autoQuarantinable(row);
+    const action=actionFor({bound:bound!==undefined,leftStatus:left.status,compared:true,passed,onFail:auto?'quarantine_left':'review_item'});
+    const inputs_hash=computeInputsHash({left_raw_hash:left.raw_hash,right_sha256:row.source.pdf_sha256,gold_or_sample_sha256:goldSha,parser_version:CN_GOLD_PARSER});
+    const locator={document:row.source.document,cninfo_announcement_id:row.source.cninfo_announcement_id,pdf_url:row.source.pdf_url,page:row.source.page,table:row.source.table,column:row.column};
+    out.push(comparedNumeric(k.naturalKey,left.value,center,{passed,tolerance,sides:SIDES,inputs_hash,left_fact_id:left.fact_id,action,
+     detail:{left:{fact_id:left.fact_id,raw_hash:left.raw_hash,status:left.status,precision:{decimals:fractionDigits(left.value_text)}},
+      right:{document:row.source.document,sha256:row.source.pdf_sha256,locator,precision:{printed_decimals:row.printed_decimals,multiplier:row.printed_unit_multiplier}},
+      unit:p.unit,interval:{center,radius},tolerance_rule:'printed_precision/1',auto_quarantine:auto,inputs_hash,report_type:row.report_type??1,...flag},
+     ...(action==='record'?{}:{item:mismatchItem(PAIR,k.naturalKey,left,center,locator,inputs_hash)})}));
+   }
+   return out;
+  },
+ };
+}
diff --git a/src/lib/dq/reconcile/pairs.ts b/src/lib/dq/reconcile/pairs.ts
index 2344b8d6..6f15d1dc 100644
--- a/src/lib/dq/reconcile/pairs.ts
+++ b/src/lib/dq/reconcile/pairs.ts
@@ -11,6 +11,7 @@
 // gold or sample file bytes, the CURRENT parser version. Any change since the last passing run → a different hash.
 import type {Row} from '../../db/table-client';
 import {computeInputsHash} from './inputs-hash';
+import {cnTushareVsGoldPair} from './pair-cn-gold';
 import {lineageSameDayPair} from './pair-lineage';
 import {sha256Hex} from './pair-support';
 import type {RegisteredPair} from './pair-support';
@@ -22,6 +23,7 @@ export const RECONCILE_PAIRS:Partial<Record<CyclePairId,RegisteredPair>>={
  'facts.lineage_same_day':lineageSameDayPair(),
  'us.companyfacts_vs_gold':usCompanyfactsVsGoldPair(),
  'us.companyfacts_vs_ixbrl':usCompanyfactsVsIxbrlPair(),
+ 'cn.tushare_vs_cninfo_pdf_gold':cnTushareVsGoldPair(),
 };
 
 export async function inputsHashNow(ctx:PairContext,item:Row):Promise<string>{
diff --git a/src/lib/dq/reconcile/testing.ts b/src/lib/dq/reconcile/testing.ts
index 235b0517..fa707bce 100644
--- a/src/lib/dq/reconcile/testing.ts
+++ b/src/lib/dq/reconcile/testing.ts
@@ -7,6 +7,7 @@ import {randomUUID} from 'node:crypto';
 import {memoryTableClient} from '../../db/memory-table-client';
 import type {Duration,FactInsert,FormType,Market,Source,Statement} from '../../facts/types';
 import type {MemoryFactsDb} from '../../facts/memory-facts-db';
+import type {GoldCnRow} from './gold-cn';
 
 export const reconcileTables=()=>memoryTableClient({dq_quarantine:['id'],dq_reconciliations:['id'],dq_reconcile_cycles:['pair','cycle_id'],dq_reconcile_cursor:['pair','cycle_id','issuer_id','market'],ingest_batches:['batch_id'],dq_freshness:['dataset'],issuers:['issuer_id']});
 
@@ -24,3 +25,8 @@ export async function seedPublished(db:MemoryFactsDb,o:{issuer:string;market:Mar
  await db.releaseLease(o.issuer,o.market,batch,'success',new Date(Date.now()+86_400_000).toISOString());
  return {filingId,runId:run,factIds:rows.map(r=>r.fact_id)};
 }
+/** One transcribed A-share gold row with valid defaults (annual report FY<fy>, exact printing, report_type 1). */
+export const goldRow=(ticker:string,fy:number,concept:string,o:Partial<GoldCnRow>={}):GoldCnRow=>({ticker,fiscal_year:fy,concept:concept as GoldCnRow['concept'],
+ printed_value:concept==='eps_basic'?'49.93':'1234567.89',printed_unit_multiplier:1,printed_decimals:2,column:'本期',
+ source:{document:`${ticker} ${fy} 年年度报告`,cninfo_announcement_id:`ann-${ticker}-${fy}`,announcement_date:`${fy+1}-04-03`,pdf_url:'https://static.cninfo.com.cn/finalpage/x.PDF',pdf_sha256:'c'.repeat(64),page:12,table:'主要会计数据和财务指标'},
+ tushare_source_ref:`${ticker}:${fy}1231:1:${fy+1}0403`,recorded_at:'2026-11-05T00:00:00Z',...o});
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
// src/lib/dq/reconcile/pairs.ts
// Registry of the cycle pairs run by run.ts (spec §5.1; contract C3). Task 14 registers
// facts.lineage_same_day and us.companyfacts_vs_gold; us.companyfacts_vs_ixbrl (Task 15); Task 16 adds
// cn.tushare_vs_cninfo_pdf_gold. The three non-cycle pairs (sec.filing_date_vs_submissions,
// sec.filer_category, entities.isin_hkex_vs_gleif) are recorded inline through record.ts and are
// deliberately absent. inputsHashNow recomputes a reconcile_mismatch item's inputs_hash from CURRENT
// inputs for restore_reconciled (spec §5.6): left raw_hash from the item's fact, the pair's CURRENT right
// evidence for the natural key of the result row named by latest_result (RegisteredPair.currentRight —
// iXBRL fetches and hashes the primary document now, gold pairs resolve the current manifest entry; never
// the sha256 that run recorded; unobtainable → current_evidence_unavailable, plan audit P2), the CURRENT
// gold or sample file bytes, the CURRENT parser version. Any change since the last passing run → a different hash.
import type {Row} from '../../db/table-client';
import {computeInputsHash} from './inputs-hash';
import {cnTushareVsGoldPair} from './pair-cn-gold';
import {lineageSameDayPair} from './pair-lineage';
import {sha256Hex} from './pair-support';
import type {RegisteredPair} from './pair-support';
import {usCompanyfactsVsGoldPair} from './pair-us-gold';
import {usCompanyfactsVsIxbrlPair} from './pair-us-ixbrl';
import type {CyclePairId,PairContext} from './types';

export const RECONCILE_PAIRS:Partial<Record<CyclePairId,RegisteredPair>>={
 'facts.lineage_same_day':lineageSameDayPair(),
 'us.companyfacts_vs_gold':usCompanyfactsVsGoldPair(),
 'us.companyfacts_vs_ixbrl':usCompanyfactsVsIxbrlPair(),
 'cn.tushare_vs_cninfo_pdf_gold':cnTushareVsGoldPair(),
};

export async function inputsHashNow(ctx:PairContext,item:Row):Promise<string>{
 const detail=(item.detail??{}) as {pair?:unknown;latest_result?:{reconciliation_id?:unknown}};
 const pair=typeof detail.pair==='string'?RECONCILE_PAIRS[detail.pair as CyclePairId]:undefined;
 if(!pair)throw new Error('pair_not_registered');
 const factIds=((item.payload??{}) as {fact_ids?:unknown}).fact_ids;
 const factId=Array.isArray(factIds)&&typeof factIds[0]==='string'?factIds[0]:null;
 const [fact]=factId===null?[]:await ctx.db.factsByIds([factId]);
 if(!fact)throw new Error('left_fact_missing');
 const recId=detail.latest_result?.reconciliation_id;
 if(typeof recId!=='string')throw new Error('no_latest_result');
 const [rec]=await ctx.tables.select('dq_reconciliations',{id:recId},{limit:1});
 if(!rec)throw new Error('no_latest_result');
 const right=await pair.currentRight(ctx,rec);   // what the right side says NOW (plan audit P2)
 if(right===null)throw new Error('current_evidence_unavailable');
 const file=pair.inputs.repoFile===null?'':sha256Hex(await ctx.readRepoFile(pair.inputs.repoFile));
 return computeInputsHash({left_raw_hash:fact.raw_hash,right_sha256:right,gold_or_sample_sha256:file,parser_version:pair.inputs.parserVersion});
}
// src/lib/dq/reconcile/testing.ts
// TEST-ONLY helpers for the reconcile unit tests (nothing in src/app imports this file). reconcileTables
// declares the primary keys the in-memory TableClient enforces for the tables the runner and memoryFactsDb
// share; seedPublished drives the real FactsDb API (scope → lease → run → filing → facts → publish →
// release) so seeded rows are exactly what a sync would have published (generation 1, status ok).
import {randomUUID} from 'node:crypto';
import {memoryTableClient} from '../../db/memory-table-client';
import type {Duration,FactInsert,FormType,Market,Source,Statement} from '../../facts/types';
import type {MemoryFactsDb} from '../../facts/memory-facts-db';
import type {GoldCnRow} from './gold-cn';

export const reconcileTables=()=>memoryTableClient({dq_quarantine:['id'],dq_reconciliations:['id'],dq_reconcile_cycles:['pair','cycle_id'],dq_reconcile_cursor:['pair','cycle_id','issuer_id','market'],ingest_batches:['batch_id'],dq_freshness:['dataset'],issuers:['issuer_id']});

export interface SeedFact{concept:string;value:string;period_start:string|null;period_end:string;unit?:string;source_concept?:string;statement?:Statement;duration?:Duration}
export async function seedPublished(db:MemoryFactsDb,o:{issuer:string;market:Market;sourceRef:string;availableDate:string;facts:SeedFact[];formType?:FormType;source?:Source;mappingGen?:number}):Promise<{filingId:string;runId:string;factIds:string[]}>{
 const batch=randomUUID();
 if((await db.scopeRows(o.market,[o.issuer])).length===0)await db.reconcileScope(o.market,[{issuer_id:o.issuer,reasons:['test'],priority:1,fetch_key:o.market==='US'?'0000000001':'600000.SH'}]);
 if(!(await db.claimLease(o.issuer,o.market,batch,600)))throw new Error('seed_lease_not_acquired');
 const run=await db.beginRun(o.issuer,o.market,batch,o.mappingGen??1);
 const map=await db.stageFilings(run,[{filing_id:randomUUID(),issuer_id:o.issuer,sourceRef:o.sourceRef,market:o.market,source:o.source??(o.market==='US'?'edgar':'tushare'),origin:o.market==='US'?'sec':'sse',formType:o.formType??(o.market==='US'?'10-K':'annual'),fiscalYear:null,fiscalPeriod:null,periodEnd:null,availableDate:o.availableDate,url:null}]);
 const filingId=map.get(o.sourceRef)!;
 const rows:FactInsert[]=o.facts.map(f=>({fact_id:randomUUID(),issuer_id:o.issuer,market:o.market,filing_id:filingId,concept:f.concept,source_concept:f.source_concept??`us-gaap:${f.concept}`,statement:f.statement??(f.period_start===null?'BS':'IS'),period_start:f.period_start,period_end:f.period_end,duration:f.duration??(f.period_start===null?'INSTANT':'12M'),value:f.value,unit:f.unit??(o.market==='US'?'USD':'CNY'),consolidation:'consolidated',available_date:o.availableDate,mapping_gen:o.mappingGen??1,mapping_version:'facts-map/1',raw_hash:`raw:${o.sourceRef}:${f.concept}:${f.period_end}`}));
 await db.stageFacts(run,rows);
 await db.publishRun(run,[filingId]);
 await db.releaseLease(o.issuer,o.market,batch,'success',new Date(Date.now()+86_400_000).toISOString());
 return {filingId,runId:run,factIds:rows.map(r=>r.fact_id)};
}
/** One transcribed A-share gold row with valid defaults (annual report FY<fy>, exact printing, report_type 1). */
export const goldRow=(ticker:string,fy:number,concept:string,o:Partial<GoldCnRow>={}):GoldCnRow=>({ticker,fiscal_year:fy,concept:concept as GoldCnRow['concept'],
 printed_value:concept==='eps_basic'?'49.93':'1234567.89',printed_unit_multiplier:1,printed_decimals:2,column:'本期',
 source:{document:`${ticker} ${fy} 年年度报告`,cninfo_announcement_id:`ann-${ticker}-${fy}`,announcement_date:`${fy+1}-04-03`,pdf_url:'https://static.cninfo.com.cn/finalpage/x.PDF',pdf_sha256:'c'.repeat(64),page:12,table:'主要会计数据和财务指标'},
 tushare_source_ref:`${ticker}:${fy}1231:1:${fy+1}0403`,recorded_at:'2026-11-05T00:00:00Z',...o});

exec
/bin/zsh -lc "cat src/lib/dq/reconcile/pair-cn-gold.test.ts; cat src/lib/dq/reconcile/pair-us-gold.ts; cat src/lib/dq/reconcile/pair-support.ts; rg -n '5.4|document_ref_mismatch|tushare_source_ref' docs/spec* docs/plans* | head -60; ls src/lib/dq/fixtures/gold; " in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
// src/lib/dq/reconcile/pair-cn-gold.test.ts
import {randomUUID} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {memoryFactsDb} from '../../facts/memory-facts-db';
import {makeBudget} from '../../facts/sync';
import {memoryRawStore} from '../raw-store';
import {divDecimal} from './decimal';
import {computeInputsHash} from './inputs-hash';
import {CN_GOLD_CONCEPTS,CN_GOLD_PARSER,CN_GOLD_PATH,GOLD_CN_SCHEMA} from './gold-cn';
import type {GoldCnRow} from './gold-cn';
import {sha256Hex} from './pair-support';
import {cnTushareVsGoldPair} from './pair-cn-gold';
import {RECONCILE_PAIRS} from './pairs';
import {goldRow,reconcileTables,seedPublished} from './testing';
import type {PairContext,ReconcileResultInput} from './types';

const TICKER='600519.SH',REF='600519.SH:20241231:1:20250403';
const D={period_start:'2024-01-01',period_end:'2024-12-31'},I={period_start:null,period_end:'2024-12-31'};
const OVERRIDE:Record<string,Partial<GoldCnRow>>={
 revenue_operating:{printed_value:'1234567.89'},                                         // exact, equal → passed
 net_income_parent:{printed_value:'1234567.89'},                                         // exact, left .90 → quarantine_left
 total_assets:{printed_value:'123.46',printed_unit_multiplier:10000},                    // 万元: |1234567.89 − 1234600| = 32.11 ≤ 50 → passed
 equity_parent:{printed_value:'123.46',printed_unit_multiplier:10000},                   // 万元: |1234700 − 1234600| = 100 > 50 → review_item
 operating_cash_flow:{printed_value:'1.00'},                                             // no fact → left_missing
 eps_basic:{printed_value:'49.93'},
};
function goldBytes(){
 const rows=[2022,2023,2024,2025].flatMap(fy=>CN_GOLD_CONCEPTS.map(c=>goldRow(TICKER,fy,c,fy===2024?OVERRIDE[c]:{})));
 return new TextEncoder().encode(JSON.stringify({schema:GOLD_CN_SCHEMA,tickers:[TICKER],fiscal_years:[2022,2023,2024,2025],concepts:[...CN_GOLD_CONCEPTS],recorded_by:'R1',reviewed_by:'R2',rows}));
}
async function setup(){
 const tables=reconcileTables();const db=memoryFactsDb(tables);const issuer=randomUUID();
 await tables.insert('issuers',{issuer_id:issuer,status:'active',merged_into:null,cik:null,lei:null,usci:null,canonical_name_en:null,canonical_name_zh:'贵州茅台'});
 await tables.insert('issuer_securities',{issuer_id:issuer,ticker:TICKER,valid_from:'2001-08-27',valid_to:null,is_primary:true,share_class:'A',isin:null,figi:null});
 const seeded=await seedPublished(db,{issuer,market:'CN',sourceRef:REF,availableDate:'2025-04-03',facts:[
  {concept:'revenue_operating',value:'1234567.89',...D},{concept:'net_income_parent',value:'1234567.9',...D},
  {concept:'total_assets',value:'1234567.89',...I},{concept:'equity_parent',value:'1234700',...I},
  {concept:'eps_basic',value:'49.93',...D,unit:'CNY/share'}]});
 const bytes=goldBytes();
 const ctx:PairContext={db,tables,raw:memoryRawStore(),now:()=>new Date('2026-11-05T00:00:00Z'),budget:makeBudget(null),fetch:(async()=>{throw new Error('no network');}) as unknown as typeof fetch,
  readRepoFile:async p=>{if(p!==CN_GOLD_PATH)throw new Error(`missing ${p}`);return bytes;}};
 const facts=new Map((await db.factsByIds(seeded.factIds)).map(f=>[f.concept,f]));
 return {db,tables,ctx,issuer,seeded,facts,goldSha:sha256Hex(bytes)};
}
const byKey=(res:ReconcileResultInput[],concept:string,fy=2024)=>res.find(r=>r.natural_key===`${TICKER}:${fy}:${concept}:1`)!;

describe('cn.tushare_vs_cninfo_pdf_gold',()=>{
 it('is registered with the gold file and parser version',()=>{
  expect(RECONCILE_PAIRS['cn.tushare_vs_cninfo_pdf_gold']?.inputs).toEqual({repoFile:CN_GOLD_PATH,parserVersion:CN_GOLD_PARSER,goldSchema:GOLD_CN_SCHEMA});
 });
 it('one result per gold row: printed-precision interval, quarantine only for exact printing, review item for rounded printing',async()=>{
  const s=await setup();
  const pair=cnTushareVsGoldPair();
  const [m]=await pair.members(s.ctx);
  expect(m).toMatchObject({issuerId:s.issuer,market:'CN'});expect(m.expectedKeys).toHaveLength(24);
  const res=await pair.evaluate(s.ctx,m);
  expect(res).toHaveLength(24);
  const rev=byKey(res,'revenue_operating');
  expect(rev).toMatchObject({outcome:'compared',passed:true,action:'record',left_value:'1234567.89',right_value:'1234567.89',tolerance:divDecimal('0.005','1234567.89',20)});
  expect(rev.detail).toMatchObject({tolerance_rule:'printed_precision/1',interval:{center:'1234567.89',radius:'0.005'},document_ref_mismatch:true});
  expect(rev.inputs_hash).toBe(computeInputsHash({left_raw_hash:s.facts.get('revenue_operating')!.raw_hash,right_sha256:'c'.repeat(64),gold_or_sample_sha256:s.goldSha,parser_version:CN_GOLD_PARSER}));
  const ni=byKey(res,'net_income_parent');
  expect(ni).toMatchObject({outcome:'compared',passed:false,action:'quarantine_left',left_value:'1234567.9',right_value:'1234567.89',left_fact_id:s.facts.get('net_income_parent')!.fact_id});
  expect(ni.item?.natural_key).toBe(`cn.tushare_vs_cninfo_pdf_gold:${TICKER}:2024:net_income_parent:1:${s.facts.get('net_income_parent')!.fact_id}`);
  expect(byKey(res,'total_assets')).toMatchObject({outcome:'compared',passed:true,action:'record',right_value:'1234600',tolerance:divDecimal('50','1234600',20)});
  const eq=byKey(res,'equity_parent');
  expect(eq).toMatchObject({outcome:'compared',passed:false,action:'review_item',left_value:'1234700',right_value:'1234600'});
  expect(eq.item?.payload).toMatchObject({fact_ids:[s.facts.get('equity_parent')!.fact_id]});
  expect(eq.detail.auto_quarantine).toBe(false);
  expect(byKey(res,'operating_cash_flow')).toMatchObject({outcome:'left_missing',action:'record'});
  expect(byKey(res,'eps_basic')).toMatchObject({outcome:'compared',passed:true});
  expect(byKey(res,'total_assets',2023)).toMatchObject({outcome:'left_unlinked',passed:false});
  expect(res.filter(r=>r.outcome==='left_unlinked')).toHaveLength(18);
 });
 it('binds by the verified tushare_source_ref only: a matching document_ref clears the mismatch flag, a different one never rebinds',async()=>{
  const s=await setup();
  await s.db.updateFilingLink(s.seeded.filingId,{document_ref:`ann-${TICKER}-2024`,document_url:null,link_attempts:1});
  const pair=cnTushareVsGoldPair();const [m]=await pair.members(s.ctx);
  const rev=byKey(await pair.evaluate(s.ctx,m),'revenue_operating');
  expect(rev.detail.document_ref_mismatch).toBeUndefined();
  await s.db.updateFilingLink(s.seeded.filingId,{document_ref:'some-correction-announcement',document_url:null,link_attempts:2});
  const again=byKey(await pair.evaluate(s.ctx,m),'revenue_operating');
  expect(again).toMatchObject({outcome:'compared',passed:true,left_fact_id:s.facts.get('revenue_operating')!.fact_id,detail:expect.objectContaining({document_ref_mismatch:true})});
 });
 it('a missing or invalid gold file refuses the run (degraded path: the file does not exist yet)',async()=>{
  const s=await setup();
  const pair=cnTushareVsGoldPair();
  await expect(pair.members({...s.ctx,readRepoFile:async()=>{throw new Error('ENOENT');}})).rejects.toMatchObject({code:'invalid_gold_file'});
  await expect(pair.members({...s.ctx,readRepoFile:async()=>new TextEncoder().encode(JSON.stringify({schema:GOLD_CN_SCHEMA,tickers:[],rows:[]}))})).rejects.toMatchObject({code:'invalid_gold_file'});
 });
});
// src/lib/dq/reconcile/pair-us-gold.ts
// us.companyfacts_vs_gold (spec §5.1, T15). Left = the published US facts, right = the US entries of plan
// 2's gold file src/lib/facts/fixtures/gold/plan2.json. An entry whose recorded_by or value is '<pending>'
// (the landed gate's isPending rule) is NEVER compared: each gets exactly one incomplete_gold result, so
// the cycle shows gaps and the gold is never reported complete while ready:false. natural_key =
// <ticker>:<concept>:<period_end>:<duration>:<unit>; duration defaults like the plan-2 gate (instant
// concept → INSTANT, else 12M). Binding: an open reconcile_mismatch item of the key pins its fact;
// otherwise the CURRENT ok row as of the entry's as_of (the row the gold asserts). Tolerance 0 (exact
// decimal). inputs_hash: left raw_hash, right = gold file sha256 (also the gold_or_sample part), parser
// 'gold-us/1'. The member issuer is the ticker's resolved issuer (resolveIssuer follows a merge).
import {resolveIssuer} from '../../entities/resolve';
import {conceptById} from '../../facts/concepts';
import {canonicalDecimal} from '../../facts/json-numbers';
import type {FactRow} from '../../facts/types';
import {DATASETS} from '../datasets';
import {compareDecimal} from './decimal';
import {computeInputsHash} from './inputs-hash';
import {ReconcileConfigError,actionFor,comparedNumeric,fractionDigits,mismatchItem,notCompared,openMismatches,readRepoJson,todayOf} from './pair-support';
import type {RegisteredPair} from './pair-support';
import type {MemberPlan,PairContext,ReconcileResultInput} from './types';

export const US_GOLD_PATH='src/lib/facts/fixtures/gold/plan2.json';
export const US_GOLD_PARSER='gold-us/1';
const PAIR='us.companyfacts_vs_gold' as const;
const SIDES={left_source:DATASETS.facts('US'),right_source:'gold.plan2'};
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const str=(v:unknown)=>typeof v==='string'?v:null;

export interface UsGoldEntry{index:number;ticker:string;concept:string;period_end:string;unit:string;duration:string;value:string|null;as_of:string|null;pending:boolean;source:Record<string,unknown>}
export const usGoldKey=(e:Pick<UsGoldEntry,'ticker'|'concept'|'period_end'|'duration'|'unit'>)=>`${e.ticker}:${e.concept}:${e.period_end}:${e.duration}:${e.unit}`;

/** The US entries of the gold file in file order; throws invalid_gold_file on shape errors or duplicate keys. */
export function usGoldEntries(json:unknown):{ready:boolean;entries:UsGoldEntry[]}{
 const bad=(m:string):never=>{throw new ReconcileConfigError('invalid_gold_file',m);};
 if(!json||typeof json!=='object'||!Array.isArray((json as {entries?:unknown}).entries))bad('entries');
 const j=json as {ready?:unknown;entries:unknown[]};
 const out:UsGoldEntry[]=[];const seen=new Set<string>();
 j.entries.forEach((raw,index)=>{
  const e=(raw??{}) as Record<string,unknown>;const iss=(e.issuer??{}) as Record<string,unknown>;
  if(iss.market!=='US')return;
  const ticker=str(iss.ticker),concept=str(e.concept),periodEnd=str(e.period_end),unit=str(e.unit),value=str(e.value),recordedBy=str(e.recorded_by);
  if(ticker===null||concept===null||periodEnd===null||!DATE.test(periodEnd)||unit===null||value===null||recordedBy===null)return bad(`entry ${index}: shape`);
  const def=conceptById(concept);if(!def)return bad(`entry ${index}: unknown concept ${concept}`);
  const pending=recordedBy==='<pending>'||value==='<pending>';
  let canonical:string|null=null;
  if(!pending){try{canonical=canonicalDecimal(value);}catch{return bad(`entry ${index}: value`);}}
  const asOf=e.as_of===null||e.as_of===undefined?null:str(e.as_of);
  if(asOf!==null&&!DATE.test(asOf))return bad(`entry ${index}: as_of`);
  if(e.as_of!==null&&e.as_of!==undefined&&asOf===null)return bad(`entry ${index}: as_of`);
  const entry:UsGoldEntry={index,ticker,concept,period_end:periodEnd,unit,duration:str(e.duration)??(def.nature==='instant'?'INSTANT':'12M'),value:canonical,as_of:asOf,pending,source:(e.source??{}) as Record<string,unknown>};
  const k=usGoldKey(entry);if(seen.has(k))return bad(`duplicate ${k}`);
  seen.add(k);out.push(entry);
 });
 return {ready:j.ready===true,entries:out};
}

/** One date rule for owner resolution and the fact read: the entry's as_of, else today (an as_of-less entry is a current-value comparison). */
const entryDate=(ctx:PairContext,e:Pick<UsGoldEntry,'as_of'>)=>e.as_of??todayOf(ctx);
/** Is the entry's key reported in conflicts by the lineage read of the member's current target? */
async function inLineageConflict(ctx:PairContext,issuerId:string,e:UsGoldEntry,left:FactRow):Promise<boolean>{
 const target=await ctx.db.targetOf(issuerId);
 const env=await ctx.db.readFactsLineage(await ctx.db.lineageOf(target),'US',{concepts:[e.concept],asOf:todayOf(ctx)});
 if(env.truncated)throw new ReconcileConfigError('lineage_read_truncated',`${target}/US`);
 return env.conflicts.some(c=>String(c.key.concept)===e.concept&&String(c.key.period_end)===e.period_end&&String(c.key.unit)===e.unit&&(c.key.period_start??null)===(left.period_start??null)&&c.fact_ids.includes(left.fact_id));
}

export function usCompanyfactsVsGoldPair():RegisteredPair{
 return {
  id:PAIR,kind:'numeric',left:DATASETS.facts('US'),right:'gold.plan2',
  inputs:{repoFile:US_GOLD_PATH,parserVersion:US_GOLD_PARSER,goldSchema:'plan2-gold/1'},
  // the current gold file is this pair's right evidence; its entry for the key must still exist and be recorded (plan audit P2)
  async currentRight(ctx,rec){
   try{
    const {json,sha256}=await readRepoJson(ctx,US_GOLD_PATH,'invalid_gold_file');
    const e=usGoldEntries(json).entries.find(x=>usGoldKey(x)===String(rec.natural_key));
    return e&&!e.pending&&e.value!==null?sha256:null;
   }catch(err){if(err instanceof ReconcileConfigError)return null;throw err;}
  },
  async members(ctx){
   const {json}=await readRepoJson(ctx,US_GOLD_PATH,'invalid_gold_file');
   const byOwner=new Map<string,MemberPlan>();
   const entries=[...usGoldEntries(json).entries].sort((x,y)=>x.ticker<y.ticker?-1:x.ticker>y.ticker?1:x.index-y.index);
   for(const e of entries){
    // the ticker's owner AT the entry's own date, never today; a merged owner stays the recorded owner (no redirect)
    const r=await resolveIssuer(ctx.tables,{ticker:e.ticker},{asOf:entryDate(ctx,e)});
    if(!r)throw new ReconcileConfigError('issuer_unresolved',e.ticker);
    const owner=r.redirected_from??r.issuer_id;
    const plan=byOwner.get(owner)??{issuerId:owner,market:'US' as const,expectedKeys:[]};
    plan.expectedKeys.push({naturalKey:usGoldKey(e),locator:{index:e.index,ticker:e.ticker,concept:e.concept,period_end:e.period_end,unit:e.unit,duration:e.duration,as_of:e.as_of,pending:e.pending,owner_issuer_id:owner}});
    byOwner.set(owner,plan);
   }
   return [...byOwner.values()];
  },
  async evaluate(ctx,member){
   const {json,sha256:goldSha}=await readRepoJson(ctx,US_GOLD_PATH,'invalid_gold_file');
   const current=new Map(usGoldEntries(json).entries.map(e=>[usGoldKey(e),e]));
   const open=await openMismatches(ctx.tables,PAIR,'US');
   const out:ReconcileResultInput[]=[];
   for(const k of member.expectedKeys){
    const e=current.get(k.naturalKey);
    if(!e){out.push(notCompared(k.naturalKey,'numeric','incomplete_gold',SIDES,{reason:'entry_removed'}));continue;}
    if(e.pending||e.value===null){out.push(notCompared(k.naturalKey,'numeric','incomplete_gold',SIDES,{reason:'pending',gold_index:e.index}));continue;}
    const frozenOwner=k.locator.owner_issuer_id;
    if(k.locator.as_of!==e.as_of||(frozenOwner!==undefined&&frozenOwner!==member.issuerId)){out.push(notCompared(k.naturalKey,'numeric','incomplete_gold',SIDES,{reason:'entry_changed',gold_index:e.index,frozen_as_of:k.locator.as_of??null,as_of:e.as_of}));continue;}
    const bound=open.get(k.naturalKey);
    let rows:FactRow[];
    if(bound)rows=(await ctx.db.factsByIds([bound.factIds[0]])).filter(r=>r.issuer_id===member.issuerId).slice(0,1);   // fenced issuer's facts only
    else rows=(await ctx.db.readFacts(member.issuerId,'US',{concepts:[e.concept],asOf:entryDate(ctx,e),from:e.period_end,to:e.period_end})).rows
     .filter(r=>r.period_end===e.period_end&&r.unit===e.unit&&r.duration===e.duration&&r.is_current===true);
    if(rows.length>1){out.push(notCompared(k.naturalKey,'numeric','left_ambiguous',SIDES,{gold_index:e.index,fact_ids:rows.map(r=>r.fact_id)}));continue;}
    const left=rows[0];
    if(!left){out.push(notCompared(k.naturalKey,'numeric','left_missing',SIDES,{gold_index:e.index,as_of:e.as_of}));continue;}
    const passed=compareDecimal(left.value,e.value)===0;
    // a same-day lineage conflict on this key belongs to facts.lineage_same_day: record only, never quarantine here
    const lineageConflict=bound===undefined&&!passed&&left.status==='ok'&&await inLineageConflict(ctx,member.issuerId,e,left);
    const inputs_hash=computeInputsHash({left_raw_hash:left.raw_hash,right_sha256:goldSha,gold_or_sample_sha256:goldSha,parser_version:US_GOLD_PARSER});
    const asOfMissing=e.as_of===null;   // a restated current value must not be quarantined against an original-filing gold value
    const action=lineageConflict||(asOfMissing&&bound===undefined)?'record' as const:actionFor({bound:bound!==undefined,leftStatus:left.status,compared:true,passed,onFail:'quarantine_left'});
    const locator={document:US_GOLD_PATH,index:e.index,source:e.source};
    out.push(comparedNumeric(k.naturalKey,left.value,e.value,{passed,tolerance:'0',sides:SIDES,inputs_hash,left_fact_id:left.fact_id,action,
     detail:{left:{fact_id:left.fact_id,raw_hash:left.raw_hash,precision:{decimals:fractionDigits(left.value_text)}},right:{document:US_GOLD_PATH,sha256:goldSha,locator,precision:{exact:true}},unit:e.unit,tolerance_rule:'exact/1',inputs_hash,as_of:e.as_of,...(lineageConflict?{lineage_conflict:true}:{}),...(asOfMissing?{as_of_missing:true}:{})},
     ...(action==='record'?{}:{item:mismatchItem(PAIR,k.naturalKey,left,e.value,locator,inputs_hash)})}));
   }
   return out;
  },
 };
}
// src/lib/dq/reconcile/pair-support.ts
// Pieces shared by the cycle pairs (spec §5.1–§5.6). RegisteredPair = C3 ReconcilePair plus its input
// recipe (repo file, parser version, gold schema) used for batch tool_versions and inputs_hash.
// PairRunContext = PairContext plus the batch id and dry-run flag the runner passes (record.ts side rows
// need the batch; dry runs must not write). ReconcileConfigError refuses a run (invalid gold/sample file,
// unresolvable issuer) — the runner finishes the batch failed with the code. activeRows is the T1/S2
// binding filter over read_filing_facts rows. openMismatches is the explicit re-check binding: an OPEN
// reconcile_mismatch item of this pair (natural_key '<pair>:<result natural_key>:<fact_id>') pins its key
// to payload.fact_ids[0] whatever the generation or status. Result builders keep the dq_reconciliations
// kind/side rules; actionFor is the one action rule every fact-backed pair uses (contract note 2).
import {createHash} from 'node:crypto';
import {selectAll} from '../../db/table-client';
import type {Row,TableClient} from '../../db/table-client';
import {keyComponents} from '../../facts/keys';
import type {FactRow,FactStatus,FilingFactRow,FilingRow,Market} from '../../facts/types';
import {DATASETS} from '../datasets';
import {absDecimal,relDiff,subDecimal} from './decimal';
import type {CyclePairId,MemberPlan,PairContext,ReconcileAction,ReconcileKind,ReconcileOutcome,ReconcilePair,ReconcileResultInput} from './types';

export interface PairInputs{repoFile:string|null;parserVersion:string;goldSchema:string|null}
/**
 * The CURRENT right-side evidence of one stored result (restore, spec §3.2 / §5.6; plan audit P2): the
 * sha256 the pair would read NOW for `rec` (its dq_reconciliations row, keyed by rec.natural_key) — iXBRL:
 * the current primary document fetched and hashed now; gold pairs: the current manifest's evidence for the
 * key — or null when it cannot be obtained now (fetch failed, entry gone or pending). Never the sha256 the
 * last run recorded (rec.detail.right.sha256).
 */
export type CurrentRight=(ctx:PairContext,rec:Row)=>Promise<string|null>;
export interface RegisteredPair extends ReconcilePair{
 inputs:PairInputs;currentRight:CurrentRight;
 /**
  * Expected keys of ONE target (plan audit Q2): the runner calls it for every pending_members target that
  * members(ctx) did not list, after its pending snapshot, so the merge is already visible. Its answer is
  * final for the cycle (a zero-key plan is a resolved answer). Only pairs that receive pending members
  * (facts.lineage_same_day) implement it; a pending entry for a pair without it fails the run.
  */
 memberFor?(ctx:PairContext,issuerId:string,market:Market):Promise<MemberPlan>;
}
export interface PairRunContext extends PairContext{batchId:string|null;dryRun:boolean}
/** The run context behind a PairContext; a context without the flags counts as a dry run (no side writes). */
export const runContextOf=(ctx:PairContext):PairRunContext=>{const c=ctx as Partial<PairRunContext>;return {...ctx,batchId:c.batchId??null,dryRun:c.dryRun??true};};

export type ReconcileConfigCode='invalid_gold_file'|'invalid_sample_file'|'issuer_unresolved'|'lineage_read_truncated'|'lineage_key_collision';
export class ReconcileConfigError extends Error{constructor(public readonly code:ReconcileConfigCode,message?:string){super(message??code);this.name='ReconcileConfigError';}}

export const sha256Hex=(b:Uint8Array|string):string=>createHash('sha256').update(b).digest('hex');
export const todayOf=(ctx:PairContext):string=>ctx.now().toISOString().slice(0,10);
/** Repo JSON with the sha256 of its exact bytes; unreadable or malformed → ReconcileConfigError(code). */
export async function readRepoJson(ctx:PairContext,path:string,code:'invalid_gold_file'|'invalid_sample_file'):Promise<{json:unknown;sha256:string}>{
 let bytes:Uint8Array;
 try{bytes=await ctx.readRepoFile(path);}catch(e){throw new ReconcileConfigError(code,`read ${path}: ${e instanceof Error?e.message:String(e)}`);}
 try{return {json:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),sha256:sha256Hex(bytes)};}
 catch{throw new ReconcileConfigError(code,`json ${path}`);}
}

/** T1 binding filter: rows of the filing's ACTIVE generation (> 0) from published runs, ok or quarantined. */
export function activeRows(rows:readonly FilingFactRow[],filing:FilingRow):FilingFactRow[]{
 if(!(filing.mapping_gen>0))return [];
 return rows.filter(r=>r.mapping_gen===filing.mapping_gen&&r.run_status==='published'&&(r.status==='ok'||r.status==='quarantined'));
}
export const factKeyOf=(r:{concept:string;period_start:string|null;period_end:string;unit:string})=>`${r.concept}|${r.period_start??''}|${r.period_end}|${r.unit}`;
export const fractionDigits=(v:string):number=>{const i=v.indexOf('.');return i<0?0:v.length-i-1;};
export const mismatchItemKey=(pair:CyclePairId,naturalKey:string,factId:string)=>`${pair}:${naturalKey}:${factId}`;

export interface OpenMismatch{itemId:string;factIds:string[]}
export async function openMismatches(tables:TableClient,pair:CyclePairId,market:Market):Promise<Map<string,OpenMismatch>>{
 const rows=await selectAll(tables,'dq_quarantine',{dataset:DATASETS.facts(market),reason_code:'reconcile_mismatch',status:'open'},'id');
 const out=new Map<string,OpenMismatch>();const prefix=`${pair}:`;
 for(const r of rows){
  if(((r.detail??{}) as {pair?:unknown}).pair!==pair)continue;
  const raw=((r.payload??{}) as {fact_ids?:unknown}).fact_ids;
  const factIds=Array.isArray(raw)?raw.filter((x):x is string=>typeof x==='string'):[];
  const nk=String(r.natural_key);
  if(factIds.length===0||!nk.startsWith(prefix)||!nk.endsWith(`:${factIds[0]}`))continue;
  out.set(nk.slice(prefix.length,nk.length-factIds[0].length-1),{itemId:String(r.id),factIds});
 }
 return out;
}

export interface Sides{left_source:string;right_source:string}
export interface ResultExtras{left_fact_id?:string;inputs_hash?:string;action?:ReconcileAction;item?:ReconcileResultInput['item']}
const extras=(x:ResultExtras)=>({...(x.left_fact_id!==undefined?{left_fact_id:x.left_fact_id}:{}),...(x.inputs_hash!==undefined?{inputs_hash:x.inputs_hash}:{}),...(x.item!==undefined?{item:x.item}:{})});
/** A non-compared result: every value column null, passed false, detail.reason defaults to the outcome. */
export function notCompared(natural_key:string,kind:ReconcileKind,outcome:Exclude<ReconcileOutcome,'compared'>,sides:Sides,detail:Record<string,unknown>,x:ResultExtras={}):ReconcileResultInput{
 return {natural_key,kind,outcome,passed:false,left_value:null,right_value:null,abs_diff:null,rel_diff:null,tolerance:'0',...sides,detail:{reason:outcome,...detail},action:x.action??'record',...extras(x)};
}
/** A compared numeric result with exact abs_diff and rel_diff. */
export function comparedNumeric(natural_key:string,left:string,right:string,o:{passed:boolean;tolerance:string;sides:Sides;detail:Record<string,unknown>}&ResultExtras):ReconcileResultInput{
 return {natural_key,kind:'numeric',outcome:'compared',passed:o.passed,left_value:left,right_value:right,abs_diff:absDecimal(subDecimal(left,right)),rel_diff:relDiff(left,right),tolerance:o.tolerance,...o.sides,detail:o.detail,action:o.action??'record',...extras(o)};
}
/** Contract note 2: bound through an open item → back to it; failed compare of an ok row → onFail; else record. */
export function actionFor(o:{bound:boolean;leftStatus:FactStatus|null;compared:boolean;passed:boolean;onFail:'quarantine_left'|'review_item'}):ReconcileAction{
 if(o.bound)return 'quarantine_left';
 if(o.compared&&!o.passed&&o.leftStatus==='ok')return o.onFail;
 return 'record';
}
/** The work item of a fact-backed mismatch (spec §5.6 payload); apply_reconcile_result adds reconciliation_id, latest_result and hook. */
export function mismatchItem(pair:CyclePairId,naturalKey:string,left:FactRow,rightValue:string|null,rightLocator:Record<string,unknown>,inputsHash:string):NonNullable<ReconcileResultInput['item']>{
 return {natural_key:mismatchItemKey(pair,naturalKey,left.fact_id),
  payload:{key:keyComponents(left.issuer_id,left.market,left),fact_ids:[left.fact_id],left_value:left.value,right_value:rightValue,right_locator:rightLocator},
  detail:{pair,inputs_hash:inputsHash,issuer_id:left.issuer_id,market:left.market}};
}
zsh:1: no matches found: docs/spec*
us-ixbrl-sample-v1.exceptions.json
us-ixbrl-sample-v1.json

exec
/bin/zsh -lc "rg -n 'quarantine_left|review_item' src/lib/facts/memory* supabase/migrations/* | tail -45; rg -n 'report_type|consolidation' src/lib/facts/tushare*; nl -ba src/lib/dq/reconcile/pair-cn-gold.ts | tail -50; rg -n 'printed|tushare_source_ref' docs --glob '*spec*' | head -30" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
src/lib/facts/memory-facts-db.ts:142: const ACTIONS=['record','quarantine_left','review_item','lineage_item'];
src/lib/facts/memory-facts-db.ts:154:  if(r.action==='quarantine_left'&&r.left_fact_id===undefined)return false;
src/lib/facts/memory-facts-db.ts:155:  if((r.action==='review_item'||r.action==='lineage_item')&&(!r.item||typeof r.item.natural_key!=='string'||r.item.natural_key.length<1||r.item.natural_key.length>512||!r.item.payload||typeof r.item.payload!=='object'))return false;
src/lib/facts/memory-facts-db.ts:583:   if(r.action==='quarantine_left'&&r.outcome==='compared'&&r.passed===false&&f&&(f.status==='ok'||f.status==='quarantined')&&runs.get(f.run_id)?.status==='published'){
src/lib/facts/memory-facts-db.ts:604:   if((r.action==='review_item'||r.action==='lineage_item')&&r.item){
src/lib/facts/memory-facts-db.ts:605:    const reason=r.action==='review_item'?'reconcile_review':'lineage_conflict';
supabase/migrations/20261107091000_facts_extensions.sql:886:--  quarantine_left (left_fact_id of the fence member required; any outcome / passed — 接口对齐记录 #5):
supabase/migrations/20261107091000_facts_extensions.sql:896:--  quarantine_left otherwise (passed, or not compared, left ok): the result row only.
supabase/migrations/20261107091000_facts_extensions.sql:897:--  review_item / lineage_item: an open reconcile_review / lineage_conflict item (reused by natural
supabase/migrations/20261107091000_facts_extensions.sql:914:     or coalesce(p_result ->> 'action', '') not in ('record','quarantine_left','review_item','lineage_item')
supabase/migrations/20261107091000_facts_extensions.sql:933:  if (v_action = 'quarantine_left' and v_left is null)
supabase/migrations/20261107091000_facts_extensions.sql:934:     or (v_action in ('review_item','lineage_item')
supabase/migrations/20261107091000_facts_extensions.sql:961:  if v_action = 'quarantine_left' and f.status in ('ok', 'quarantined') and v_run = 'published'
supabase/migrations/20261107091000_facts_extensions.sql:1000:  if v_action in ('review_item','lineage_item') then
supabase/migrations/20261107091000_facts_extensions.sql:1001:    v_reason := case v_action when 'review_item' then 'reconcile_review' else 'lineage_conflict' end;
zsh:1: no matches found: src/lib/facts/tushare*
    39	   try{const {file}=await loadGold(ctx);return file.rows.find(r=>cnGoldKey(r)===String(rec.natural_key))?.source.pdf_sha256??null;}
    40	   catch(e){if(e instanceof ReconcileConfigError)return null;throw e;}
    41	  },
    42	  async members(ctx){
    43	   const {file}=await loadGold(ctx);
    44	   const out:MemberPlan[]=[];
    45	   for(const ticker of [...file.tickers].sort()){
    46	    const r=await resolveIssuer(ctx.tables,{ticker},{today:todayOf(ctx)});
    47	    if(!r)throw new ReconcileConfigError('issuer_unresolved',ticker);
    48	    const rows=file.rows.filter(x=>x.ticker===ticker).sort((a,b)=>a.fiscal_year-b.fiscal_year||a.concept.localeCompare(b.concept));
    49	    out.push({issuerId:r.issuer_id,market:'CN',expectedKeys:rows.map(x=>({naturalKey:cnGoldKey(x),locator:{ticker,fiscal_year:x.fiscal_year,concept:x.concept,tushare_source_ref:x.tushare_source_ref}}))});
    50	   }
    51	   return out;
    52	  },
    53	  async evaluate(ctx,member){
    54	   const {file,sha256:goldSha}=await loadGold(ctx);
    55	   const current=new Map(file.rows.map(r=>[cnGoldKey(r),r]));
    56	   const open=await openMismatches(ctx.tables,PAIR,'CN');
    57	   const out:ReconcileResultInput[]=[];
    58	   for(const k of member.expectedKeys){
    59	    const row=current.get(k.naturalKey);
    60	    if(!row){out.push(notCompared(k.naturalKey,'numeric','incomplete_gold',SIDES,{reason:'row_removed'}));continue;}
    61	    const filing=await ctx.db.findFilingBySourceRef('tushare',row.tushare_source_ref);
    62	    if(!filing){out.push(notCompared(k.naturalKey,'numeric','left_unlinked',SIDES,{tushare_source_ref:row.tushare_source_ref}));continue;}
    63	    const docMismatch=filing.document_ref!==row.source.cninfo_announcement_id;
    64	    const p=cnPeriodOf(row.fiscal_year,row.concept);
    65	    const bound=open.get(k.naturalKey);
    66	    const rows:FactRow[]=bound?(await ctx.db.factsByIds([bound.factIds[0]])).slice(0,1)
    67	     :activeRows(await ctx.db.readFilingFacts(filing.filing_id,true),filing).filter(f=>f.concept===row.concept&&f.period_end===p.period_end&&f.period_start===p.period_start&&f.duration===p.duration&&f.unit===p.unit);
    68	    const flag=docMismatch?{document_ref_mismatch:true}:{};
    69	    if(rows.length===0){out.push(notCompared(k.naturalKey,'numeric','left_missing',SIDES,{filing_id:filing.filing_id,...flag}));continue;}
    70	    if(rows.length>1){out.push(notCompared(k.naturalKey,'numeric','left_ambiguous',SIDES,{fact_ids:rows.map(r=>r.fact_id),...flag}));continue;}
    71	    const left=rows[0];
    72	    const {center,radius}=printedInterval(row);
    73	    const passed=withinRadius(left.value,center,radius);
    74	    const tolerance=divDecimal(radius,maxAbsDecimal(left.value,center,'1'),20);
    75	    const auto=autoQuarantinable(row);
    76	    const action=actionFor({bound:bound!==undefined,leftStatus:left.status,compared:true,passed,onFail:auto?'quarantine_left':'review_item'});
    77	    const inputs_hash=computeInputsHash({left_raw_hash:left.raw_hash,right_sha256:row.source.pdf_sha256,gold_or_sample_sha256:goldSha,parser_version:CN_GOLD_PARSER});
    78	    const locator={document:row.source.document,cninfo_announcement_id:row.source.cninfo_announcement_id,pdf_url:row.source.pdf_url,page:row.source.page,table:row.source.table,column:row.column};
    79	    out.push(comparedNumeric(k.naturalKey,left.value,center,{passed,tolerance,sides:SIDES,inputs_hash,left_fact_id:left.fact_id,action,
    80	     detail:{left:{fact_id:left.fact_id,raw_hash:left.raw_hash,status:left.status,precision:{decimals:fractionDigits(left.value_text)}},
    81	      right:{document:row.source.document,sha256:row.source.pdf_sha256,locator,precision:{printed_decimals:row.printed_decimals,multiplier:row.printed_unit_multiplier}},
    82	      unit:p.unit,interval:{center,radius},tolerance_rule:'printed_precision/1',auto_quarantine:auto,inputs_hash,report_type:row.report_type??1,...flag},
    83	     ...(action==='record'?{}:{item:mismatchItem(PAIR,k.naturalKey,left,center,locator,inputs_hash)})}));
    84	   }
    85	   return out;
    86	  },
    87	 };
    88	}

exec
/bin/zsh -lc "cat src/lib/entities/resolve.ts | head -150; sed -n '940,965p' supabase/migrations/20261107091000_facts_extensions.sql; rg -n 'duplicate|members|issuerId' src/lib/dq/reconcile/run.ts | head -35; head -25 src/lib/dq/reconcile/pair-cn-gold.ts; rg -n 'cn.tushare|printed_unit_multiplier' docs | head -25" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
// Read-side issuer resolution: exactly one of ticker / ISIN / CIK / LEI → canonical issuer with
// its securities. Zero identifiers → 'empty_query'; more than one → 'ambiguous_query' (callers
// must not rely on an implicit precedence between conflicting identifiers).
// Effective dates: validity windows are DATE-level and evaluated against a UTC calendar date
// (`asOf`, default = current UTC date; `today` is the deprecated synonym, spec 3 §4.3.5);
// exchange-local trading dates are out of scope. A security row is current at `asOf` iff
// valid_from <= asOf and (valid_to is null or valid_to > asOf). Each security carries its window
// methods (observation bounds vs evidenced dates, spec 3 §4.3.1) so callers can judge the ends.
// `date` columns arrive from PostgREST as 'YYYY-MM-DD' strings, so ISO strings compare
// lexicographically; the in-memory client used in tests must be fed the same string form.
// Merges: one merged_into hop is followed (result carries redirected_from); a merged target
// returns null rather than walking a chain, so cycles and stale chains surface as not-found.
// Provenance (source) and identifier claims are deliberately not part of the response.
import type {Row,TableClient} from '../db/table-client';
import {inferCoreMarket,normalizeSecurityTicker} from '../securities/ticker';
import {isValidIsin,isValidLei,normalizeCik} from '../research/entity-keys/identifiers';
import type {ValidFromMethod,ValidToMethod} from './types';
import {VALID_FROM_METHODS,VALID_TO_METHODS} from './securities';

export interface ResolveQuery{ticker?:string;isin?:string;cik?:string;lei?:string}
export interface ResolvedSecurity{ticker:string;isin:string|null;figi:string|null;share_class:string|null;is_primary:boolean;valid_from:string;valid_to:string|null;valid_from_method:ValidFromMethod|null;valid_to_method:ValidToMethod|null}
export interface ResolvedIssuer{
 issuer_id:string;status:string;redirected_from?:string;
 names:{zh:string|null;en:string|null};
 identifiers:{cik:string|null;lei:string|null;usci:string|null};
 securities:ResolvedSecurity[];
}
export interface ResolveOptions{
 includeExpired?:boolean;
 /** Evaluation date 'YYYY-MM-DD' (UTC calendar date); default = current UTC date. */
 asOf?:string;
 /** @deprecated use asOf (same meaning). Both given and different → invalid_as_of. */
 today?:string;
}
/** Cache-Control for a resolve evaluated at a past date (spec 3 §4.3.5). */
export const HISTORICAL_CACHE_CONTROL='public, max-age=600, s-maxage=3600';

const str=(v:unknown)=>typeof v==='string'?v:null;
const isCurrent=(r:Row,today:string)=>{const from=str(r.valid_from),to=str(r.valid_to);return from!==null&&from<=today&&(to===null||to>today);};
/** The one validity predicate (valid_from <= today && (valid_to is null || valid_to > today)); reused by the facts scope (plan 2 Task 14). */
export const isCurrentSecurity=isCurrent;
const toSecurity=(r:Row):ResolvedSecurity=>({
 ticker:String(r.ticker),isin:str(r.isin),figi:str(r.figi),share_class:str(r.share_class),is_primary:r.is_primary===true,valid_from:String(r.valid_from),valid_to:str(r.valid_to),
 valid_from_method:typeof r.valid_from_method==='string'&&(VALID_FROM_METHODS as readonly string[]).includes(r.valid_from_method)?r.valid_from_method as ValidFromMethod:null,
 valid_to_method:typeof r.valid_to_method==='string'&&(VALID_TO_METHODS as readonly string[]).includes(r.valid_to_method)?r.valid_to_method as ValidToMethod:null,
});

/** A real calendar date in the exact form 'YYYY-MM-DD' (2026-02-30 and ' 2026-11-05' are rejected). */
export function isCalendarDate(s:string):boolean{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
 const ms=Date.parse(`${s}T00:00:00Z`);
 return !Number.isNaN(ms)&&new Date(ms).toISOString().slice(0,10)===s;
}

/** asOf wins; today is its deprecated synonym (invalid_today kept for callers that still pass it). */
function resolveAsOf(opts:ResolveOptions):string{
 if(opts.asOf!==undefined&&opts.today!==undefined&&opts.asOf!==opts.today)throw new Error('invalid_as_of');
 if(opts.asOf!==undefined){if(!isCalendarDate(opts.asOf))throw new Error('invalid_as_of');return opts.asOf;}
 if(opts.today!==undefined){if(!isCalendarDate(opts.today))throw new Error('invalid_today');return opts.today;}
 return new Date().toISOString().slice(0,10);
}

/**
 * Ticker candidates in lookup order. The exact (trimmed, upper-cased, '/'→'.') form comes first:
 * the shared normalizer strips Wind suffixes (.A/.N/.O/...), which would turn BRK.A into BRK.
 * The normalized form is only a fallback when the exact form has NO rows at all: a ticker the
 * schema knows (even if only expired or future rows exist) is authoritative, so XYZ.A with only
 * expired rows resolves to null rather than to whoever holds XYZ today.
 */
function tickerCandidates(raw:string):string[]{
 const exact=raw.trim().toUpperCase().replace(/\//g,'.');
 const market=inferCoreMarket(raw);
 const normalized=(market&&normalizeSecurityTicker(raw,market))||exact;
 return normalized===exact?[exact]:[exact,normalized];
}

type Lookup={column:'lei'|'cik'|'isin';value:string}|{column:'ticker';values:string[]};

/** Requires exactly one non-blank identifier and validates it. */
function parseQuery(q:ResolveQuery):Lookup{
 const t=(v?:string)=>v?.trim()||undefined;
 const given=(['ticker','isin','cik','lei'] as const).filter(k=>t(q[k])!==undefined);
 if(given.length===0)throw new Error('empty_query');
 if(given.length>1)throw new Error('ambiguous_query');
 const key=given[0],raw=t(q[key])!;
 switch(key){
  case 'lei':{const v=raw.toUpperCase();if(!isValidLei(v))throw new Error('invalid_identifier:lei');return {column:'lei',value:v};}
  case 'isin':{const v=raw.toUpperCase();if(!isValidIsin(v))throw new Error('invalid_identifier:isin');return {column:'isin',value:v};}
  case 'cik':{try{return {column:'cik',value:normalizeCik(raw)};}catch{throw new Error('invalid_identifier:cik');}}
  case 'ticker':return {column:'ticker',values:tickerCandidates(raw)};
 }
}

/** The single issuer owning a current row among `rows`; null if none; 'ambiguous_owner' if several. */
function currentOwner(rows:Row[],today:string):string|null{
 const owners=new Set(rows.filter(r=>isCurrent(r,today)).map(r=>str(r.issuer_id)).filter((v):v is string=>v!==null));
 // Prevented by the schema for both lookups (issuer_securities_no_overlap per ticker,
 // issuer_securities_isin_no_overlap per ISIN); kept as defense against non-conforming data.
 if(owners.size>1)throw new Error('ambiguous_owner');
 return owners.values().next().value??null;
}

export async function resolveIssuer(client:TableClient,q:ResolveQuery,opts:ResolveOptions={}):Promise<ResolvedIssuer|null>{
 const lookup=parseQuery(q);
 const today=resolveAsOf(opts);
 let issuerId:string|null=null;
 if(lookup.column==='lei'||lookup.column==='cik'){
  issuerId=str((await client.select('issuers',{[lookup.column]:lookup.value},{limit:1}))[0]?.issuer_id);
 }else if(lookup.column==='ticker'){
  // Fall back to the next candidate only when this one has no rows at all (see tickerCandidates).
  for(const v of lookup.values){
   const rows=await client.select('issuer_securities',{ticker:v});
   if(rows.length===0)continue;
   issuerId=currentOwner(rows,today);
   break;
  }
 }else{
  issuerId=currentOwner(await client.select('issuer_securities',{isin:lookup.value}),today);
 }
 if(!issuerId)return null;
 let issuer=(await client.select('issuers',{issuer_id:issuerId},{limit:1}))[0];
 if(!issuer)return null;
 let redirectedFrom:string|undefined;
 if(issuer.status==='merged'){
  const target=str(issuer.merged_into);
  if(!target)return null;
  redirectedFrom=issuerId;
  issuer=(await client.select('issuers',{issuer_id:target},{limit:1}))[0];
  if(!issuer||issuer.status==='merged')return null;
 }
 const id=String(issuer.issuer_id);
 // Single page: PostgREST caps responses at 1000 rows, far above any one issuer's listings.
 const secs=await client.select('issuer_securities',{issuer_id:id},{orderBy:'valid_from'});
 return {
  issuer_id:id,status:String(issuer.status),...(redirectedFrom?{redirected_from:redirectedFrom}:{}),
  names:{zh:str(issuer.canonical_name_zh),en:str(issuer.canonical_name_en)},
  identifiers:{cik:str(issuer.cik),lei:str(issuer.lei),usci:str(issuer.usci)},
  securities:(opts.includeExpired?secs:secs.filter(r=>isCurrent(r,today))).map(toSecurity),
 };
}

/**
 * Cache-Control for a successful resolve. Validity windows flip at UTC date boundaries, so a
 * shared cache may hold a response at most until the next UTC midnight (clamped to [60, 3600]s);
 * stale-while-revalidate is kept short, so a pre-midnight answer can still be served after the
 * flip: worst case ≈ 11 minutes past midnight (the 60s floor plus the 600s revalidate window).
 */
export function successCacheControl(now:Date):string{
 const nextMidnight=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1);
 const secs=Math.min(3600,Math.max(60,Math.floor((nextMidnight-now.getTime())/1000)));
  if p_result ->> 'kind' = 'numeric' then
    if p_result ->> 'outcome' = 'compared' and (v_lv is null or v_rv is null) then raise exception 'invalid_result' using errcode = '22023'; end if;
  elsif v_lv is not null or v_rv is not null or v_ad is not null or v_rd is not null then
    raise exception 'invalid_result' using errcode = '22023';
  end if;
  select * into v_existing from public.dq_reconciliations where pair = c.pair and cycle_id = c.cycle_id and natural_key = v_nk;
  if found then
    if v_existing.issuer_id is distinct from c.issuer_id or v_existing.market is distinct from c.market then raise exception 'invalid_result' using errcode = '22023'; end if;
    return jsonb_build_object('reused', true, 'reconciliation_id', v_existing.id, 'item_id', coalesce(v_existing.detail -> 'item_id', 'null'::jsonb), 'quarantined', 0, 'materialize', 'null'::jsonb);
  end if;
  v_dataset := case c.market when 'US' then 'facts.us' else 'facts.cn' end;
  v_latest := jsonb_build_object('passed', p_result -> 'passed', 'reconciliation_id', v_rid, 'at', to_jsonb(v_now), 'inputs_hash', coalesce(p_result -> 'inputs_hash', 'null'::jsonb));
  if v_left is not null then
    perform 1 from public.fact_sync_scope where issuer_id = c.issuer_id and market = c.market for update;
    select * into f from public.financial_facts where fact_id = v_left;
    if not found or f.issuer_id <> c.issuer_id or f.market <> c.market then raise exception 'invalid_result' using errcode = '22023'; end if;
    select r.status into v_run from public.fact_sync_runs r where r.run_id = f.run_id;
  end if;
  -- a failing compare on a published left row that is ok OR already quarantined (for another reason, with no
  -- open item of this pair yet) opens the reconcile_mismatch item, so fact_promote_rows blocks a later generic
  -- promotion; only an ok row changes visibility (status, state_rev, hook, materialize).
  if v_action = 'quarantine_left' and f.status in ('ok', 'quarantined') and v_run = 'published'
     and p_result ->> 'outcome' = 'compared' and (p_result -> 'passed') = 'false'::jsonb then
    v_nk_item := c.pair || ':' || v_nk || ':' || v_left::text;
    if length(v_nk_item) > 512 then raise exception 'invalid_result' using errcode = '22023'; end if;
    select q.id into v_item from public.dq_quarantine q
6://  1. cycle: the pair's running cycle, else (plan audit Q2) snapshot pending_members → resolve keys AFTER
7://     the snapshot (pair.members, then pair.memberFor for each snapshot target members() missed) →
11://  2. members in (issuer_id, market) order whose cursor is claimable; a member starts only with >= 60 s of
14://     final: they count as duplicates and are NEVER re-evaluated; evaluate runs only for the missing keys,
17://     visibility, atomic); a reused key is a duplicate; fence_failed stops this worker at once (committed
25://     detail.freshness={status:'pending',ok,detail}; only that key of detail, so pending_members written by
31:// a thrown evaluate does; after MAX_CURSOR_ATTEMPTS (3) claims the member is terminal (exec_failed_members).
34:// Batch counts (§5.5): fetched = keys applied; inserted = passed; duplicates = reused; quarantined =
37:// batch with its code and creates no cycle. Dry run: members + evaluate only, no writes by the runner.
67:export interface ReconcileOptions{pair:CyclePairId;triggeredBy:TriggeredBy;issuerIds?:string[];dryRun?:boolean}
69:export interface MemberReport{issuerId:string;market:Market;outcome:MemberOutcome;counts?:MemberCounts;code?:string}
71:export interface ReconcileReceipt{batchId:string|null;status:BatchStatus|'dry_run';counts:BatchCounts;errors:BatchError[];cycle:CycleReport|null;members:MemberReport[];hooks:{retried:number;failed:number};dryRun?:{issuerId:string;market:Market;results:ReconcileResultInput[]}[]}
76:interface HookItem{itemId:string|null;issuerId:string;market:Market;hookAt?:string|null}
82: if(!Array.isArray(row.members))throw new ReconcileError('cycle_members_invalid');
83: return row.members.map(m=>{
85:  if(typeof x.issuer_id!=='string'||(x.market!=='US'&&x.market!=='CN')||!Array.isArray(x.expected_keys))throw new ReconcileError('cycle_members_invalid');
91: const d=(row.detail??{}) as {pending_members?:unknown};
92: if(!Array.isArray(d.pending_members))return [];
93: return d.pending_members.filter((p):p is PendingMember=>!!p&&typeof (p as Row).issuer_id==='string'&&typeof (p as Row).source==='string'&&((p as Row).market==='US'||(p as Row).market==='CN'));
98:  const k=mkey(p.issuerId,p.market);if(byKey.has(k))throw new ReconcileError('duplicate_member',k);
99:  if(new Set(p.expectedKeys.map(e=>e.naturalKey)).size!==p.expectedKeys.length)throw new ReconcileError('duplicate_expected_key',k);
100:  byKey.set(k,{issuer_id:p.issuerId,market:p.market,expected_keys:p.expectedKeys});
108: *  2. resolve expected keys AFTER the snapshot — pair.members(ctx), then pair.memberFor for each snapshot
109: *     target members() did not list — so every merge in the snapshot is visible to the resolver (a zero-key
121: const plans=[...await pair.members(ctx)];
122: const listed=new Set(plans.map(p=>mkey(p.issuerId,p.market)));
127:  if(plan.issuerId!==p.issuer_id||plan.market!==p.market)throw new ReconcileError('evaluate_contract',k);
130: const members=freeze(plans);
133: const out=await deps.db.openReconcileCycle({pair:pair.id,cycleId,startedAt:startedAt.toISOString(),members,pending});
142:async function ensureCursors(tables:TableClient,pair:CyclePairId,cycleId:string,members:FrozenMember[]):Promise<void>{
144: for(const m of members){
174:  try{target=await targetOf(deps.tables,x.issuerId);}
177:   errors.push({code:'materialize_error',key:mkey(x.issuerId,x.market),message:`target_unresolved:${code}`});failed++;
207: const failed=await runHooks(deps,rows.map(r=>{const d=r.detail as {issuer_id:string;market:Market};return {itemId:String(r.id),issuerId:d.issuer_id,market:d.market,hookAt:((r.detail as {hook?:{at?:unknown}}).hook?.at as string|undefined)??null};}),errors);
221: if(out.reused){c.duplicates++;return;}
// src/lib/dq/reconcile/pair-cn-gold.ts
// cn.tushare_vs_cninfo_pdf_gold (spec §5.4, T14, owner decision D). Members = the gold file's tickers resolved to
// issuers (CN); expected keys = its rows (<ticker>:<fy>:<concept>:<report_type>). Left binding ONLY through the
// verified tushare_source_ref: filings(source tushare, source_ref) — absent → left_unlinked; a document_ref that
// differs from cninfo_announcement_id is recorded as detail.document_ref_mismatch and never rebinds or substitutes
// (the plan-2 linker may point type-1 filings at a correction or the next year's report). Facts: read_filing_facts
// filtered by activeRows and by the concept's period/duration/unit; an open reconcile_mismatch item pins its fact.
// passed ⇔ left ∈ [center − radius, center + radius] (cross-multiplication); tolerance = radius / max(|l|,|center|,1).
// A failure quarantines the ok left row only for exact printing (multiplier 1, two decimals); rounded printing opens a
// reconcile_review item and the fact stays ok — whether a difference is rounding or data is a human call.
// Degraded path (no TUSHARE_TOKEN, no transcriber yet): the gold file does not exist, members() → invalid_gold_file;
// no CN cron (vercel.json) and the route refuses cn.* without FACTS_CN_ENABLED=1.
import {resolveIssuer} from '../../entities/resolve';
import type {FactRow} from '../../facts/types';
import {divDecimal,maxAbsDecimal,withinRadius} from './decimal';
import {CN_GOLD_PARSER,CN_GOLD_PATH,GOLD_CN_SCHEMA,autoQuarantinable,cnGoldKey,cnPeriodOf,printedInterval,validateGoldCn} from './gold-cn';
import type {GoldCnFile} from './gold-cn';
import {computeInputsHash} from './inputs-hash';
import {ReconcileConfigError,actionFor,activeRows,comparedNumeric,fractionDigits,mismatchItem,notCompared,openMismatches,readRepoJson,todayOf} from './pair-support';
import type {RegisteredPair} from './pair-support';
import type {MemberPlan,PairContext,ReconcileResultInput} from './types';

const PAIR='cn.tushare_vs_cninfo_pdf_gold' as const;
const SIDES={left_source:'tushare',right_source:'cninfo.pdf.gold'};

docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:157:export const RECONCILE_PAIR_IDS=['us.companyfacts_vs_ixbrl','cn.tushare_vs_cninfo_pdf_gold','us.companyfacts_vs_gold','sec.filing_date_vs_submissions','sec.filer_category','entities.isin_hkex_vs_gleif','facts.lineage_same_day'] as const;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:160:export const CYCLE_PAIR_IDS=['us.companyfacts_vs_ixbrl','cn.tushare_vs_cninfo_pdf_gold','us.companyfacts_vs_gold','facts.lineage_same_day'] as const satisfies readonly ReconcilePairId[];
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:2590:  for(const p of ['us.companyfacts_vs_ixbrl','cn.tushare_vs_cninfo_pdf_gold','us.companyfacts_vs_gold','facts.lineage_same_day'] as const)
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:2758:export const RECONCILE_PAIR_IDS=['us.companyfacts_vs_ixbrl','cn.tushare_vs_cninfo_pdf_gold','us.companyfacts_vs_gold','sec.filing_date_vs_submissions','sec.filer_category','entities.isin_hkex_vs_gleif','facts.lineage_same_day'] as const;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:2786: 'cn.tushare_vs_cninfo_pdf_gold':{producer:'reconcile',cadence:'weekly'},
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10959:export const CYCLE_PAIR_IDS=['us.companyfacts_vs_ixbrl','cn.tushare_vs_cninfo_pdf_gold','us.companyfacts_vs_gold','facts.lineage_same_day'] as const satisfies readonly ReconcilePairId[];
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:15691:// cn.tushare_vs_cninfo_pdf_gold. The three non-cycle pairs (sec.filing_date_vs_submissions,
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:16493:  const res=await GET(req('pair=cn.tushare_vs_cninfo_pdf_gold',AUTH));
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:18059:### Task 16a: A 股黄金集校验器与 `cn.tushare_vs_cninfo_pdf_gold` 对（§5.4、T14、决策 D）
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:18064:- Modify: `src/lib/dq/reconcile/pairs.ts`（登记 `cn.tushare_vs_cninfo_pdf_gold`）
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:18070:- 校验器拒绝：`rows` 不是 `tickers × fiscal_years × concepts` 的**精确乘积**（每组合恰一行、无多余行、无重复）；`tickers` 空或含非法 ticker（`^\d{6}\.(SH|SZ|BJ)$`）或重复；`fiscal_years` 不是 FY2022–FY2025（决策 E）；`concepts` 不是固定六科目；`printed_value` 不匹配 `^-?\d+(\.\d+)?$` 或小数位 ≠ `printed_decimals`；`printed_unit_multiplier ∉ {1, 1000, 10000, 1000000, 100000000}`；`eps_basic` 的 multiplier ≠ 1；`column ≠ '本期'`；缺/错 `source.page`（正整数）、`pdf_sha256`（64 hex）、`cninfo_announcement_id`、`announcement_date`、`document`、`table`、`pdf_url`；`tushare_source_ref` 不是 `<ts_code>:<YYYYMMDD>:<report_type>:<YYYYMMDD>`，或 `ts_code ≠ ticker`，或 `end_date ≠ <fy>1231`，或 `report_type` 段 ≠ 行的 `report_type`（缺省 1，契约问题 15）；`recorded_by == reviewed_by` 或不是代号（`^[A-Za-z0-9_-]{1,32}$`）；`recorded_at` 不是时间戳。
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:18108:  ['eps with a multiplier',()=>file(product().map(r=>r.concept==='eps_basic'?{...r,printed_unit_multiplier:10000}:r))],
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:18109:  ['an unknown multiplier',()=>file(product().map((r,i)=>i===0?{...r,printed_unit_multiplier:100}:r))],
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:18133:  expect(printedInterval({printed_value:v,printed_unit_multiplier:m,printed_decimals:d})).toEqual({center,radius});
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:18136:  expect(autoQuarantinable({printed_unit_multiplier:1,printed_decimals:2})).toBe(true);
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:18137:  expect(autoQuarantinable({printed_unit_multiplier:10000,printed_decimals:2})).toBe(false);
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:18138:  expect(autoQuarantinable({printed_unit_multiplier:1,printed_decimals:0})).toBe(false);
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:18183: total_assets:{printed_value:'123.46',printed_unit_multiplier:10000},                    // 万元: |1234567.89 − 1234600| = 32.11 ≤ 50 → passed
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:18184: equity_parent:{printed_value:'123.46',printed_unit_multiplier:10000},                   // 万元: |1234700 − 1234600| = 100 > 50 → review_item
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:18208:describe('cn.tushare_vs_cninfo_pdf_gold',()=>{
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:18210:  expect(RECONCILE_PAIRS['cn.tushare_vs_cninfo_pdf_gold']?.inputs).toEqual({repoFile:CN_GOLD_PATH,parserVersion:CN_GOLD_PARSER,goldSchema:GOLD_CN_SCHEMA});
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:18225:  expect(ni.item?.natural_key).toBe(`cn.tushare_vs_cninfo_pdf_gold:${TICKER}:2024:net_income_parent:1:${s.facts.get('net_income_parent')!.fact_id}`);
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:18261: printed_value:concept==='eps_basic'?'49.93':'1234567.89',printed_unit_multiplier:1,printed_decimals:2,column:'本期',
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:18299:export interface GoldCnRow{ticker:string;fiscal_year:number;concept:CnGoldConcept;printed_value:string;printed_unit_multiplier:number;printed_decimals:number;column:'本期';report_type?:number;source:GoldCnSource;tushare_source_ref:string;recorded_at:string}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:18335:  if(!CN_GOLD_MULTIPLIERS.includes(r.printed_unit_multiplier))e(`${at}.printed_unit_multiplier`);

exec
/bin/zsh -lc "sed -n '935,955p' supabase/migrations/20261107091000_facts_extensions.sql; sed -n '65,105p' src/lib/dq/reconcile/run.ts; rg -n 'duplicate_member|members.*Map|mkey\\(' src/lib/dq/reconcile/run.ts; rg -n 'set_merge|immutable|issuer_id' src/lib/entities/merge.ts | head" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
         and (coalesce(jsonb_typeof(p_result -> 'item'), '') <> 'object' or coalesce(jsonb_typeof(p_result -> 'item' -> 'natural_key'), '') <> 'string'
              or coalesce(jsonb_typeof(p_result -> 'item' -> 'payload'), '') <> 'object' or length(p_result -> 'item' ->> 'natural_key') not between 1 and 512)) then
    raise exception 'invalid_result' using errcode = '22023';
  end if;
  -- mirror dq_reconciliations_numeric_sides / _nonnumeric_sides as invalid_result (22023) before anything is read or written
  if p_result ->> 'kind' = 'numeric' then
    if p_result ->> 'outcome' = 'compared' and (v_lv is null or v_rv is null) then raise exception 'invalid_result' using errcode = '22023'; end if;
  elsif v_lv is not null or v_rv is not null or v_ad is not null or v_rd is not null then
    raise exception 'invalid_result' using errcode = '22023';
  end if;
  select * into v_existing from public.dq_reconciliations where pair = c.pair and cycle_id = c.cycle_id and natural_key = v_nk;
  if found then
    if v_existing.issuer_id is distinct from c.issuer_id or v_existing.market is distinct from c.market then raise exception 'invalid_result' using errcode = '22023'; end if;
    return jsonb_build_object('reused', true, 'reconciliation_id', v_existing.id, 'item_id', coalesce(v_existing.detail -> 'item_id', 'null'::jsonb), 'quarantined', 0, 'materialize', 'null'::jsonb);
  end if;
  v_dataset := case c.market when 'US' then 'facts.us' else 'facts.cn' end;
  v_latest := jsonb_build_object('passed', p_result -> 'passed', 'reconciliation_id', v_rid, 'at', to_jsonb(v_now), 'inputs_hash', coalesce(p_result -> 'inputs_hash', 'null'::jsonb));
  if v_left is not null then
    perform 1 from public.fact_sync_scope where issuer_id = c.issuer_id and market = c.market for update;
    select * into f from public.financial_facts where fact_id = v_left;
    if not found or f.issuer_id <> c.issuer_id or f.market <> c.market then raise exception 'invalid_result' using errcode = '22023'; end if;
 materialize?:(db:FactsDb,issuer:string,market:Market)=>Promise<unknown>;
}
export interface ReconcileOptions{pair:CyclePairId;triggeredBy:TriggeredBy;issuerIds?:string[];dryRun?:boolean}
export type MemberOutcome='done'|'failed'|'claimed_elsewhere'|'fence_lost'|'not_started';
export interface MemberReport{issuerId:string;market:Market;outcome:MemberOutcome;counts?:MemberCounts;code?:string}
export interface CycleReport{cycleId:string;status:CycleStatus;created:boolean;settled:boolean;expectedTotal:number}
export interface ReconcileReceipt{batchId:string|null;status:BatchStatus|'dry_run';counts:BatchCounts;errors:BatchError[];cycle:CycleReport|null;members:MemberReport[];hooks:{retried:number;failed:number};dryRun?:{issuerId:string;market:Market;results:ReconcileResultInput[]}[]}
export class ReconcileError extends Error{constructor(public readonly code:string,message?:string){super(message??code);this.name='ReconcileError';}}

interface FrozenMember{issuer_id:string;market:Market;expected_keys:ExpectedKey[]}
type Hook=HookState;
interface HookItem{itemId:string|null;issuerId:string;market:Market;hookAt?:string|null}
const mkey=(issuer:string,market:string)=>`${issuer}:${market}`;
const isFence=(e:unknown)=>e instanceof FactsDbError&&e.code==='fence_failed';
const codeOf=(e:unknown):string=>e instanceof FactsDbError||e instanceof ReconcileError||e instanceof ReconcileConfigError?e.code:`exception:${(e instanceof Error?e.message:String(e)).slice(0,200)}`;

function frozenOf(row:Row):FrozenMember[]{
 if(!Array.isArray(row.members))throw new ReconcileError('cycle_members_invalid');
 return row.members.map(m=>{
  const x=m as Partial<FrozenMember>;
  if(typeof x.issuer_id!=='string'||(x.market!=='US'&&x.market!=='CN')||!Array.isArray(x.expected_keys))throw new ReconcileError('cycle_members_invalid');
  return {issuer_id:x.issuer_id,market:x.market,expected_keys:x.expected_keys};
 });
}
/** set_merge registrations still waiting in a cycle row; an entry leaves only through open_reconcile_cycle (plan audit Q2). */
const pendingOf=(row:Row):PendingMember[]=>{
 const d=(row.detail??{}) as {pending_members?:unknown};
 if(!Array.isArray(d.pending_members))return [];
 return d.pending_members.filter((p):p is PendingMember=>!!p&&typeof (p as Row).issuer_id==='string'&&typeof (p as Row).source==='string'&&((p as Row).market==='US'||(p as Row).market==='CN'));
};
function freeze(plans:MemberPlan[]):FrozenMember[]{
 const byKey=new Map<string,FrozenMember>();
 for(const p of plans){
  const k=mkey(p.issuerId,p.market);if(byKey.has(k))throw new ReconcileError('duplicate_member',k);
  if(new Set(p.expectedKeys.map(e=>e.naturalKey)).size!==p.expectedKeys.length)throw new ReconcileError('duplicate_expected_key',k);
  byKey.set(k,{issuer_id:p.issuerId,market:p.market,expected_keys:p.expectedKeys});
 }
 return [...byKey.values()].sort((a,b)=>a.issuer_id<b.issuer_id?-1:a.issuer_id>b.issuer_id?1:a.market<b.market?-1:a.market>b.market?1:0);
}

/**
98:  const k=mkey(p.issuerId,p.market);if(byKey.has(k))throw new ReconcileError('duplicate_member',k);
122: const listed=new Set(plans.map(p=>mkey(p.issuerId,p.market)));
124:  const k=mkey(p.issuer_id,p.market);if(listed.has(k))continue;
143: const have=new Set((await readCursors(tables,pair,cycleId)).map(c=>mkey(String(c.issuer_id),String(c.market))));
145:  if(have.has(mkey(m.issuer_id,m.market)))continue;
177:   errors.push({code:'materialize_error',key:mkey(x.issuerId,x.market),message:`target_unresolved:${code}`});failed++;
181:  const k=mkey(target,x.market);
192:   errors.push({code:'materialize_error',key:mkey(g.target,g.market),message:code});failed+=g.items.length;
228: const key=mkey(fence.issuer_id,fence.market);
290:  if(v.some(x=>x===null||!Number.isSafeInteger(x)||x<0)||(v[0]!+v[1]!+v[2]!)!==Number(c.expected))throw new ReconcileError('cursor_unaccounted',mkey(String(c.issuer_id),String(c.market)));
339:  const plans=new Map<string,MemberPlan>(frozen.map(m=>[mkey(m.issuer_id,m.market),{issuerId:m.issuer_id,market:m.market,expectedKeys:m.expected_keys}]));
341:   const issuerId=String(c.issuer_id),market=c.market as Market,key=mkey(issuerId,market);
9:export type MatchResult={kind:'same';issuer_id:string}|{kind:'new'}|{kind:'conflict';issuer_ids:string[];reason:ConflictReason};
11:export function matchIssuer(candidates:(IssuerIdentifiers&{issuer_id:string})[],incoming:IssuerIdentifiers):MatchResult{
15: for(const c of candidates)for(const k of present)if(c[k]&&c[k]===incoming[k])hits.add(c.issuer_id);
17: if(hits.size>1)return {kind:'conflict',issuer_ids:[...hits].sort(),reason:'identifiers_split'};
18: const [id]=hits;const hit=candidates.find(c=>c.issuer_id===id)!;
19: for(const k of present)if(hit[k]&&hit[k]!==incoming[k])return {kind:'conflict',issuer_ids:[id],reason:'hard_id_mismatch'};
20: return {kind:'same',issuer_id:id};

codex
Member construction does not respect the runner's issuer ownership and uniqueness requirements. Merged issuers and multiple tickers belonging to one issuer can therefore prevent otherwise valid reconciliation runs.

Full review comments:

- [P2] Preserve the filing owner's identity when resolving merged issuers — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/reconcile/pair-cn-gold.ts:46-49
  When a sampled issuer has been merged, `resolveIssuer` returns the merge target, but the source filing and its facts retain their original issuer ID. Evaluation still reads those original facts by source reference, so `apply_reconcile_result` rejects every compared result with `invalid_result` because the fact's issuer differs from the cursor's issuer. Preserve the original owner (`redirected_from`) when constructing the member, and ensure selected facts belong to that fenced owner.

- [P2] Combine ticker keys into one member per issuer — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/reconcile/pair-cn-gold.ts:49-49
  If multiple gold-set tickers resolve to the same issuer, this loop produces multiple members with the same issuer/market pair. The runner's `freeze()` explicitly rejects that input with `duplicate_member`, preventing the entire reconciliation cycle from starting despite a valid gold file. Accumulate expected keys by issuer and market instead of emitting a member for each ticker.
Member construction does not respect the runner's issuer ownership and uniqueness requirements. Merged issuers and multiple tickers belonging to one issuer can therefore prevent otherwise valid reconciliation runs.

Full review comments:

- [P2] Preserve the filing owner's identity when resolving merged issuers — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/reconcile/pair-cn-gold.ts:46-49
  When a sampled issuer has been merged, `resolveIssuer` returns the merge target, but the source filing and its facts retain their original issuer ID. Evaluation still reads those original facts by source reference, so `apply_reconcile_result` rejects every compared result with `invalid_result` because the fact's issuer differs from the cursor's issuer. Preserve the original owner (`redirected_from`) when constructing the member, and ensure selected facts belong to that fenced owner.

- [P2] Combine ticker keys into one member per issuer — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/reconcile/pair-cn-gold.ts:49-49
  If multiple gold-set tickers resolve to the same issuer, this loop produces multiple members with the same issuer/market pair. The runner's `freeze()` explicitly rejects that input with `duplicate_member`, preventing the entire reconciliation cycle from starting despite a valid gold file. Accumulate expected keys by issuer and market instead of emitting a member for each ticker.

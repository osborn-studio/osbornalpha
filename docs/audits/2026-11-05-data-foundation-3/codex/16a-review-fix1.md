OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b153-0cfb-7a83-8c1a-8df419da6cb0
--------
user
commit 34d5f6d
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 34d5f6d; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 1284ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-rOTwbcw5' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-NAmWD9O7' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/16a-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/16a-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/16a-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-1OxQ2pvk' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-q2mpfiRF' (errno=Operation not permitted)
34d5f6dc fix(dq): CN gold pair binds pins to the verified filing, groups by recorded owner, validates dates strictly
 src/lib/dq/reconcile/gold-cn.schema.test.ts | 57 +++++++++++-------
 src/lib/dq/reconcile/gold-cn.ts             | 10 +++-
 src/lib/dq/reconcile/pair-cn-gold.test.ts   | 90 ++++++++++++++++++++++++++++-
 src/lib/dq/reconcile/pair-cn-gold.ts        | 26 +++++++--
 4 files changed, 152 insertions(+), 31 deletions(-)

exec
/bin/zsh -lc 'pwd; ls -a | head -35; for d in /Volumes /Volumes/AIMATE_WORK /Volumes/AIMATE_WORK/Developer /Volumes/AIMATE_WORK/Developer/CodeX /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees; do for f in AGENTS.md AGENTS.override.md; do test ! -f "$d/$f" || { echo "$d/$f"; cat "$d/$f"; }; done; done; git show 34d5f6d --' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
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
git: error: couldn't create cache file '/tmp/xcrun_db-5OMyG6Jk' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-f73NbdcD' (errno=Operation not permitted)
commit 34d5f6dc34bd0ffeb4f9cc237dae1a0d7b4a0f36
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 06:45:58 2026 -0800

    fix(dq): CN gold pair binds pins to the verified filing, groups by recorded owner, validates dates strictly
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/dq/reconcile/gold-cn.schema.test.ts b/src/lib/dq/reconcile/gold-cn.schema.test.ts
index bc10e39b..a5b2ca32 100644
--- a/src/lib/dq/reconcile/gold-cn.schema.test.ts
+++ b/src/lib/dq/reconcile/gold-cn.schema.test.ts
@@ -16,28 +16,41 @@ describe('validateGoldCn (spec §5.4 validator)',()=>{
   if(r.ok)expect(r.file.rows).toHaveLength(2*4*6);
  });
  it.each([
-  ['a missing combination',()=>file(product().slice(1))],
-  ['a duplicate row',()=>file([...product(),goldRow('600519.SH',2024,'total_assets')])],
-  ['an extra ticker row',()=>file([...product(),goldRow('600000.SH',2024,'total_assets')])],
-  ['empty tickers',()=>file([],{tickers:[]})],
-  ['an invalid ticker',()=>file(product(),{tickers:['600519','000001.SZ']})],
-  ['fiscal years other than FY2022–FY2025',()=>file(product(),{fiscal_years:[2023,2024,2025]})],
-  ['concepts other than the fixed six',()=>file(product(),{concepts:[...CN_GOLD_CONCEPTS.slice(1),'revenue']})],
-  ['recorded_by == reviewed_by',()=>file(product(),{reviewed_by:'R1'})],
-  ['a printed value with thousands separators',()=>file(product().map((r,i)=>i===0?{...r,printed_value:'1,234,567.89'}:r))],
-  ['decimals not matching printed_decimals',()=>file(product().map((r,i)=>i===0?{...r,printed_value:'1234567.8'}:r))],
-  ['eps with a multiplier',()=>file(product().map(r=>r.concept==='eps_basic'?{...r,printed_unit_multiplier:10000}:r))],
-  ['an unknown multiplier',()=>file(product().map((r,i)=>i===0?{...r,printed_unit_multiplier:100}:r))],
-  ['column other than 本期',()=>file(product().map((r,i)=>i===0?{...r,column:'上期' as '本期'}:r))],
-  ['a missing page',()=>file(product().map((r,i)=>i===0?{...r,source:{...r.source,page:0}}:r))],
-  ['a malformed pdf sha256',()=>file(product().map((r,i)=>i===0?{...r,source:{...r.source,pdf_sha256:'abc'}}:r))],
-  ['a missing announcement id',()=>file(product().map((r,i)=>i===0?{...r,source:{...r.source,cninfo_announcement_id:''}}:r))],
-  ['a missing announcement date',()=>file(product().map((r,i)=>i===0?{...r,source:{...r.source,announcement_date:'2025/04/03'}}:r))],
-  ['a missing tushare_source_ref',()=>file(product().map((r,i)=>i===0?{...r,tushare_source_ref:''}:r))],
-  ['a source ref of another ticker',()=>file(product().map((r,i)=>i===0?{...r,tushare_source_ref:r.tushare_source_ref.replace(/^\d{6}\.\w{2}/,'600000.SH')}:r))],
-  ['a source ref of another period',()=>file(product().map((r,i)=>i===0?{...r,tushare_source_ref:r.tushare_source_ref.replace(/:\d{8}:/,':20230630:')}:r))],
-  ['a report_type segment that differs from the row',()=>file(product().map((r,i)=>i===0?{...r,report_type:5}:r))],
- ])('rejects %s',(_n,make)=>{expect(errorsOf(make()).length).toBeGreaterThan(0);});
+  ['a missing combination',()=>file(product().slice(1)),'missing '],
+  ['a duplicate row',()=>file([...product(),goldRow('600519.SH',2024,'total_assets')]),'duplicate 600519.SH|2024|total_assets'],
+  ['an extra ticker row',()=>file([...product(),goldRow('600000.SH',2024,'total_assets')]),'outside the product'],
+  ['empty tickers',()=>file([],{tickers:[]}),'tickers: empty'],
+  ['an invalid ticker',()=>file(product(),{tickers:['600519','000001.SZ']}),'tickers: invalid ticker'],
+  ['duplicate tickers',()=>file(product(),{tickers:['600519.SH','600519.SH']}),'tickers: duplicate'],
+  ['fiscal years other than FY2022–FY2025',()=>file(product().filter(r=>r.fiscal_year!==2022),{fiscal_years:[2023,2024,2025]}),'fiscal_years: must be FY2022–FY2025'],
+  ['concepts other than the fixed six',()=>file(product(),{concepts:[...CN_GOLD_CONCEPTS.slice(1),'revenue']}),'concepts: must be the fixed six'],
+  ['a wrong schema',()=>file(product(),{schema:'gold/cn-annual/2'}),'schema'],
+  ['recorded_by == reviewed_by',()=>file(product(),{reviewed_by:'R1'}),'recorded_by == reviewed_by'],
+  ['a recorder that is not a code name',()=>file(product(),{recorded_by:'张 三'}),'recorded_by: code name'],
+  ['a reviewer that is not a code name',()=>file(product(),{reviewed_by:''}),'reviewed_by: code name'],
+  ['a printed value with thousands separators',()=>file(product().map((r,i)=>i===0?{...r,printed_value:'1,234,567.89'}:r)),'printed_value'],
+  ['decimals not matching printed_decimals',()=>file(product().map((r,i)=>i===0?{...r,printed_value:'1234567.8'}:r)),'printed_decimals'],
+  ['eps with a multiplier',()=>file(product().map(r=>r.concept==='eps_basic'?{...r,printed_unit_multiplier:10000}:r)),'eps multiplier must be 1'],
+  ['an unknown multiplier',()=>file(product().map((r,i)=>i===0?{...r,printed_unit_multiplier:100}:r)),'printed_unit_multiplier'],
+  ['column other than 本期',()=>file(product().map((r,i)=>i===0?{...r,column:'上期' as '本期'}:r)),'.column'],
+  ['a missing page',()=>file(product().map((r,i)=>i===0?{...r,source:{...r.source,page:0}}:r)),'source.page'],
+  ['a malformed pdf sha256',()=>file(product().map((r,i)=>i===0?{...r,source:{...r.source,pdf_sha256:'abc'}}:r)),'source.pdf_sha256'],
+  ['a missing announcement id',()=>file(product().map((r,i)=>i===0?{...r,source:{...r.source,cninfo_announcement_id:''}}:r)),'source.cninfo_announcement_id'],
+  ['a slash-formatted announcement date',()=>file(product().map((r,i)=>i===0?{...r,source:{...r.source,announcement_date:'2025/04/03'}}:r)),'source.announcement_date'],
+  ['a non-calendar announcement date',()=>file(product().map((r,i)=>i===0?{...r,source:{...r.source,announcement_date:'2025-99-99'}}:r)),'source.announcement_date'],
+  ['a missing document',()=>file(product().map((r,i)=>i===0?{...r,source:{...r.source,document:''}}:r)),'source.document'],
+  ['a missing table',()=>file(product().map((r,i)=>i===0?{...r,source:{...r.source,table:' '}}:r)),'source.table'],
+  ['a missing pdf_url',()=>file(product().map((r,i)=>i===0?{...r,source:{...r.source,pdf_url:''}}:r)),'source.pdf_url'],
+  ['a missing tushare_source_ref',()=>file(product().map((r,i)=>i===0?{...r,tushare_source_ref:''}:r)),'tushare_source_ref'],
+  ['a source ref of another ticker',()=>file(product().map((r,i)=>i===0?{...r,tushare_source_ref:r.tushare_source_ref.replace(/^\d{6}\.\w{2}/,'600000.SH')}:r)),'ts_code'],
+  ['a source ref of another period',()=>file(product().map((r,i)=>i===0?{...r,tushare_source_ref:r.tushare_source_ref.replace(/:\d{8}:/,':20230630:')}:r)),'end_date'],
+  ['a source ref with a non-calendar announcement date',()=>file(product().map((r,i)=>i===0?{...r,tushare_source_ref:r.tushare_source_ref.replace(/:\d{8}$/,':20259999')}:r)),'ann_date'],
+  ['a report_type segment that differs from the row',()=>file(product().map((r,i)=>i===0?{...r,report_type:5}:r)),'report_type'],
+  ['a string report_type',()=>file(product().map((r,i)=>i===0?{...r,report_type:'1' as unknown as number}:r)),'.report_type'],
+  ['a bare-year recorded_at',()=>file(product().map((r,i)=>i===0?{...r,recorded_at:'2026'}:r)),'recorded_at'],
+  ['a date-only recorded_at',()=>file(product().map((r,i)=>i===0?{...r,recorded_at:'2026-11-05'}:r)),'recorded_at'],
+  ['a non-calendar recorded_at',()=>file(product().map((r,i)=>i===0?{...r,recorded_at:'2026-13-45T00:00:00Z'}:r)),'recorded_at'],
+ ])('rejects %s',(_n,make,expected)=>{expect(errorsOf(make()).some(e=>e.includes(expected))).toBe(true);});
  it('natural key is <ticker>:<fy>:<concept>:<report_type>',()=>{
   expect(cnGoldKey(goldRow('600519.SH',2024,'revenue_operating'))).toBe('600519.SH:2024:revenue_operating:1');
  });
diff --git a/src/lib/dq/reconcile/gold-cn.ts b/src/lib/dq/reconcile/gold-cn.ts
index de2c1567..27284ad4 100644
--- a/src/lib/dq/reconcile/gold-cn.ts
+++ b/src/lib/dq/reconcile/gold-cn.ts
@@ -27,6 +27,9 @@ export interface GoldCnFile{schema:typeof GOLD_CN_SCHEMA;tickers:string[];fiscal
 const TICKER=/^\d{6}\.(SH|SZ|BJ)$/,CODE=/^[A-Za-z0-9_-]{1,32}$/,DATE=/^\d{4}-\d{2}-\d{2}$/,SHA=/^[0-9a-f]{64}$/,PRINTED=/^-?\d+(\.\d+)?$/;
 const REF=/^(\d{6}\.(?:SH|SZ|BJ)):(\d{8}):(\d+):(\d{8})$/;
 const str=(v:unknown):v is string=>typeof v==='string'&&v.trim()!=='';
+const TS=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
+/** A real calendar date: YYYY-MM-DD or YYYYMMDD (round-trips through Date.UTC). */
+const calendar=(v:string):boolean=>{const m=/^(\d{4})-?(\d{2})-?(\d{2})$/.exec(v);if(!m)return false;const [y,mo,d]=[Number(m[1]),Number(m[2]),Number(m[3])];const t=new Date(Date.UTC(y,mo-1,d));return t.getUTCFullYear()===y&&t.getUTCMonth()===mo-1&&t.getUTCDate()===d;};
 const fraction=(v:string)=>{const i=v.indexOf('.');return i<0?0:v.length-i-1;};
 
 export const cnGoldKey=(r:Pick<GoldCnRow,'ticker'|'fiscal_year'|'concept'|'tushare_source_ref'>)=>`${r.ticker}:${r.fiscal_year}:${r.concept}:${r.tushare_source_ref.split(':')[2]??''}`;
@@ -64,7 +67,7 @@ export function validateGoldCn(json:unknown):{ok:true;file:GoldCnFile}|{ok:false
   if(!Number.isInteger(s.page)||(s.page as number)<1)e(`${at}.source.page`);
   if(typeof s.pdf_sha256!=='string'||!SHA.test(s.pdf_sha256))e(`${at}.source.pdf_sha256`);
   if(!str(s.cninfo_announcement_id))e(`${at}.source.cninfo_announcement_id`);
-  if(typeof s.announcement_date!=='string'||!DATE.test(s.announcement_date))e(`${at}.source.announcement_date`);
+  if(typeof s.announcement_date!=='string'||!DATE.test(s.announcement_date)||!calendar(s.announcement_date))e(`${at}.source.announcement_date`);
   if(!str(s.document))e(`${at}.source.document`);
   if(!str(s.table))e(`${at}.source.table`);
   if(typeof s.pdf_url!=='string'||!/^https?:\/\//.test(s.pdf_url))e(`${at}.source.pdf_url`);
@@ -73,9 +76,12 @@ export function validateGoldCn(json:unknown):{ok:true;file:GoldCnFile}|{ok:false
   else{
    if(m[1]!==r.ticker)e(`${at}.tushare_source_ref: ts_code ${m[1]} != ${r.ticker}`);
    if(m[2]!==`${r.fiscal_year}1231`)e(`${at}.tushare_source_ref: end_date ${m[2]} != ${r.fiscal_year}1231`);
+   if(!calendar(m[2]))e(`${at}.tushare_source_ref: end_date not a calendar date`);
+   if(!calendar(m[4]))e(`${at}.tushare_source_ref: ann_date ${m[4]} not a calendar date`);
    if(m[3]!==String(r.report_type??1))e(`${at}.tushare_source_ref: report_type ${m[3]} != ${r.report_type??1}`);
   }
-  if(typeof r.recorded_at!=='string'||Number.isNaN(Date.parse(r.recorded_at)))e(`${at}.recorded_at`);
+  if(r.report_type!==undefined&&(!Number.isInteger(r.report_type)||r.report_type<1))e(`${at}.report_type`);
+  if(typeof r.recorded_at!=='string'||!TS.test(r.recorded_at)||Number.isNaN(Date.parse(r.recorded_at)))e(`${at}.recorded_at`);
  });
  for(const t of tickers)for(const y of years)for(const c of CN_GOLD_CONCEPTS)if(!seen.has(`${t}|${y}|${c}`))e(`missing ${t}|${y}|${c}`);
  return errors.length>0?{ok:false,errors}:{ok:true,file:f as GoldCnFile};
diff --git a/src/lib/dq/reconcile/pair-cn-gold.test.ts b/src/lib/dq/reconcile/pair-cn-gold.test.ts
index a832080c..55c396bc 100644
--- a/src/lib/dq/reconcile/pair-cn-gold.test.ts
+++ b/src/lib/dq/reconcile/pair-cn-gold.test.ts
@@ -1,8 +1,10 @@
 // src/lib/dq/reconcile/pair-cn-gold.test.ts
 import {randomUUID} from 'node:crypto';
+import type {Row} from '../../db/table-client';
 import {describe,expect,it} from 'vitest';
 import {memoryFactsDb} from '../../facts/memory-facts-db';
 import {makeBudget} from '../../facts/sync';
+import type {FilingFactRow} from '../../facts/types';
 import {memoryRawStore} from '../raw-store';
 import {divDecimal} from './decimal';
 import {computeInputsHash} from './inputs-hash';
@@ -35,7 +37,8 @@ async function setup(){
  const seeded=await seedPublished(db,{issuer,market:'CN',sourceRef:REF,availableDate:'2025-04-03',facts:[
   {concept:'revenue_operating',value:'1234567.89',...D},{concept:'net_income_parent',value:'1234567.9',...D},
   {concept:'total_assets',value:'1234567.89',...I},{concept:'equity_parent',value:'1234700',...I},
-  {concept:'eps_basic',value:'49.93',...D,unit:'CNY/share'}]});
+  {concept:'eps_basic',value:'49.93',...D,unit:'CNY/share'},
+  {concept:'operating_cash_flow',value:'1.00',...D,unit:'USD'},{concept:'operating_cash_flow',value:'1.00',...D,duration:'6M'}]});   // decoys: wrong unit, wrong duration
  const bytes=goldBytes();
  const ctx:PairContext={db,tables,raw:memoryRawStore(),now:()=>new Date('2026-11-05T00:00:00Z'),budget:makeBudget(null),fetch:(async()=>{throw new Error('no network');}) as unknown as typeof fetch,
   readRepoFile:async p=>{if(p!==CN_GOLD_PATH)throw new Error(`missing ${p}`);return bytes;}};
@@ -89,3 +92,88 @@ describe('cn.tushare_vs_cninfo_pdf_gold',()=>{
   await expect(pair.members({...s.ctx,readRepoFile:async()=>new TextEncoder().encode(JSON.stringify({schema:GOLD_CN_SCHEMA,tickers:[],rows:[]}))})).rejects.toMatchObject({code:'invalid_gold_file'});
  });
 });
+
+const PAIR='cn.tushare_vs_cninfo_pdf_gold';
+const rowsFor=(tickers:string[],over:(t:string,fy:number,c:string)=>Partial<GoldCnRow>=()=>({}))=>tickers.flatMap(t=>[2022,2023,2024,2025].flatMap(fy=>CN_GOLD_CONCEPTS.map(c=>goldRow(t,fy,c,fy===2024&&t===TICKER?{...OVERRIDE[c],...over(t,fy,c)}:over(t,fy,c)))));
+const bytesOf=(tickers:string[],over?:(t:string,fy:number,c:string)=>Partial<GoldCnRow>)=>new TextEncoder().encode(JSON.stringify({schema:GOLD_CN_SCHEMA,tickers,fiscal_years:[2022,2023,2024,2025],concepts:[...CN_GOLD_CONCEPTS],recorded_by:'R1',reviewed_by:'R2',rows:rowsFor(tickers,over)}));
+const withGold=(ctx:PairContext,bytes:Uint8Array):PairContext=>({...ctx,readRepoFile:async p=>{if(p!==CN_GOLD_PATH)throw new Error(`missing ${p}`);return bytes;}});
+async function pin(s:Awaited<ReturnType<typeof setup>>,concept:string,fy=2024){
+ const fact=s.facts.get(concept)!;
+ await s.tables.insert('dq_quarantine',{id:randomUUID(),dataset:'facts.cn',reason_code:'reconcile_mismatch',status:'open',natural_key:`${PAIR}:${TICKER}:${fy}:${concept}:1:${fact.fact_id}`,payload:{fact_ids:[fact.fact_id]},detail:{pair:PAIR}});
+ return fact;
+}
+
+describe('review findings',()=>{
+ it('T14: a pinned open item from another filing never substitutes when the gold row now names a different tushare_source_ref',async()=>{
+  const s=await setup();
+  const pinned=await pin(s,'revenue_operating');
+  const REF2='600519.SH:20241231:1:20250410';
+  await seedPublished(s.db,{issuer:s.issuer,market:'CN',sourceRef:REF2,availableDate:'2025-04-10',facts:[{concept:'revenue_operating',value:'1234567.89',...D}]});
+  const ctx=withGold(s.ctx,bytesOf([TICKER],(t,fy,c)=>fy===2024&&c==='revenue_operating'?{tushare_source_ref:REF2}:{}));
+  const pair=cnTushareVsGoldPair();const [m]=await pair.members(ctx);
+  const rev=byKey(await pair.evaluate(ctx,m),'revenue_operating');
+  expect(rev).toMatchObject({passed:false,outcome:'incomplete_gold',action:'record',detail:expect.objectContaining({binding_changed:true})});
+  expect(rev.left_fact_id).toBeUndefined();
+  expect(pinned.fact_id).toBeTruthy();
+ });
+ it('a pinned open item of the verified filing keeps its fact and routes back to the item',async()=>{
+  const s=await setup();
+  const pinned=await pin(s,'revenue_operating');
+  const pair=cnTushareVsGoldPair();const [m]=await pair.members(s.ctx);
+  expect(byKey(await pair.evaluate(s.ctx,m),'revenue_operating')).toMatchObject({outcome:'compared',passed:true,action:'quarantine_left',left_fact_id:pinned.fact_id});
+ });
+ it('merged issuer: the member is the recorded owner of the filing, and its facts are compared',async()=>{
+  const s=await setup();
+  const target=randomUUID();
+  await s.tables.insert('issuers',{issuer_id:target,status:'active',merged_into:null,cik:null,lei:null,usci:null,canonical_name_en:null,canonical_name_zh:'target'});
+  await s.tables.update('issuers',{issuer_id:s.issuer},{status:'merged',merged_into:target});
+  s.db.setTopology({[s.issuer]:{status:'merged',merged_into:target}});
+  const pair=cnTushareVsGoldPair();const members=await pair.members(s.ctx);
+  expect(members).toHaveLength(1);expect(members[0]).toMatchObject({issuerId:s.issuer,market:'CN'});
+  expect(byKey(await pair.evaluate(s.ctx,members[0]),'revenue_operating')).toMatchObject({outcome:'compared',passed:true});
+ });
+ it('two tickers of one issuer make one member with all keys',async()=>{
+  const s=await setup();
+  await s.tables.insert('issuer_securities',{issuer_id:s.issuer,ticker:'000001.SZ',valid_from:'2001-08-27',valid_to:null,is_primary:false,share_class:'A',isin:null,figi:null});
+  const ctx=withGold(s.ctx,bytesOf([TICKER,'000001.SZ']));
+  const members=await cnTushareVsGoldPair().members(ctx);
+  expect(members).toHaveLength(1);expect(members[0].expectedKeys).toHaveLength(48);
+  expect(new Set(members[0].expectedKeys.map(k=>k.naturalKey)).size).toBe(48);
+ });
+ it('a filing of another issuer than the member is not compared (binding changed)',async()=>{
+  const s=await setup();
+  const pair=cnTushareVsGoldPair();const [m]=await pair.members(s.ctx);
+  const other=randomUUID();
+  const res=await pair.evaluate(s.ctx,{...m,issuerId:other});
+  expect(byKey(res,'revenue_operating')).toMatchObject({outcome:'incomplete_gold',passed:false,detail:expect.objectContaining({binding_changed:true})});
+ });
+ it('binds by source_ref even when another tushare filing carries the matching document_ref and other values',async()=>{
+  const s=await setup();
+  const REF3='600519.SH:20241231:1:20250501';
+  const other=await seedPublished(s.db,{issuer:s.issuer,market:'CN',sourceRef:REF3,availableDate:'2025-05-01',facts:[{concept:'revenue_operating',value:'9999',...D}]});
+  await s.db.updateFilingLink(other.filingId,{document_ref:`ann-${TICKER}-2024`,document_url:null,link_attempts:1});
+  const pair=cnTushareVsGoldPair();const [m]=await pair.members(s.ctx);
+  const rev=byKey(await pair.evaluate(s.ctx,m),'revenue_operating');
+  expect(rev).toMatchObject({passed:true,left_value:'1234567.89',left_fact_id:s.facts.get('revenue_operating')!.fact_id});
+ });
+ it('left_ambiguous when two active facts match the key',async()=>{
+  const s=await setup();
+  const db={...s.db,readFilingFacts:async(id:string,inc:boolean)=>{const r=await s.db.readFilingFacts(id,inc);return [...r,...r.filter(x=>x.concept==='revenue_operating').map(x=>({...x,fact_id:randomUUID()}) as FilingFactRow)];}} as typeof s.db;
+  const ctx={...s.ctx,db};
+  const pair=cnTushareVsGoldPair();const [m]=await pair.members(ctx);
+  expect(byKey(await pair.evaluate(ctx,m),'revenue_operating')).toMatchObject({outcome:'left_ambiguous',passed:false,action:'record'});
+ });
+ it('a changed gold file mid-cycle is incomplete_gold (one gold sha per cycle)',async()=>{
+  const s=await setup();
+  const pair=cnTushareVsGoldPair();const [m]=await pair.members(s.ctx);
+  const res=await pair.evaluate(withGold(s.ctx,new TextEncoder().encode(JSON.stringify({schema:GOLD_CN_SCHEMA,tickers:[TICKER],fiscal_years:[2022,2023,2024,2025],concepts:[...CN_GOLD_CONCEPTS],recorded_by:'R1',reviewed_by:'R3',rows:rowsFor([TICKER])}))),m);
+  expect(res).toHaveLength(24);
+  expect(res.every(r=>r.outcome==='incomplete_gold'&&r.passed===false&&r.detail.reason==='gold_changed')).toBe(true);
+ });
+ it('currentRight: the pdf sha of the current manifest row; null when the key or the file is gone',async()=>{
+  const s=await setup();const pair=cnTushareVsGoldPair();
+  expect(await pair.currentRight(s.ctx,{natural_key:`${TICKER}:2024:revenue_operating:1`} as Row)).toBe('c'.repeat(64));
+  expect(await pair.currentRight(s.ctx,{natural_key:`${TICKER}:2019:revenue_operating:1`} as Row)).toBeNull();
+  expect(await pair.currentRight({...s.ctx,readRepoFile:async()=>{throw new Error('ENOENT');}},{natural_key:`${TICKER}:2024:revenue_operating:1`} as Row)).toBeNull();
+ });
+});
diff --git a/src/lib/dq/reconcile/pair-cn-gold.ts b/src/lib/dq/reconcile/pair-cn-gold.ts
index 92174b77..2d227534 100644
--- a/src/lib/dq/reconcile/pair-cn-gold.ts
+++ b/src/lib/dq/reconcile/pair-cn-gold.ts
@@ -40,19 +40,30 @@ export function cnTushareVsGoldPair():RegisteredPair{
    catch(e){if(e instanceof ReconcileConfigError)return null;throw e;}
   },
   async members(ctx){
-   const {file}=await loadGold(ctx);
-   const out:MemberPlan[]=[];
+   const {file,sha256}=await loadGold(ctx);
+   // one member per RECORDED OWNER (the issuer of the verified filing; a merged source stays the owner), keys of several
+   // tickers of one owner grouped; without a filing the ticker's resolved owner (redirected_from ?? issuer) is used
+   const byOwner=new Map<string,MemberPlan>();
    for(const ticker of [...file.tickers].sort()){
     const r=await resolveIssuer(ctx.tables,{ticker},{today:todayOf(ctx)});
     if(!r)throw new ReconcileConfigError('issuer_unresolved',ticker);
     const rows=file.rows.filter(x=>x.ticker===ticker).sort((a,b)=>a.fiscal_year-b.fiscal_year||a.concept.localeCompare(b.concept));
-    out.push({issuerId:r.issuer_id,market:'CN',expectedKeys:rows.map(x=>({naturalKey:cnGoldKey(x),locator:{ticker,fiscal_year:x.fiscal_year,concept:x.concept,tushare_source_ref:x.tushare_source_ref}}))});
+    for(const x of rows){
+     const filing=await ctx.db.findFilingBySourceRef('tushare',x.tushare_source_ref);
+     const owner=filing?.issuer_id??r.redirected_from??r.issuer_id;
+     const plan=byOwner.get(owner)??{issuerId:owner,market:'CN' as const,expectedKeys:[]};
+     plan.expectedKeys.push({naturalKey:cnGoldKey(x),locator:{ticker,fiscal_year:x.fiscal_year,concept:x.concept,tushare_source_ref:x.tushare_source_ref,owner_issuer_id:owner,gold_sha256:sha256}});
+     byOwner.set(owner,plan);
+    }
    }
-   return out;
+   return [...byOwner.values()];
   },
   async evaluate(ctx,member){
    const {file,sha256:goldSha}=await loadGold(ctx);
    const current=new Map(file.rows.map(r=>[cnGoldKey(r),r]));
+   // the gold bytes seen by members() are the only ones this cycle may compare against
+   const frozen=member.expectedKeys.find(k=>typeof k.locator.gold_sha256==='string')?.locator.gold_sha256;
+   if(frozen!==undefined&&frozen!==goldSha)return member.expectedKeys.map(k=>notCompared(k.naturalKey,'numeric','incomplete_gold',SIDES,{reason:'gold_changed',frozen_sha256:frozen,gold_sha256:goldSha}));
    const open=await openMismatches(ctx.tables,PAIR,'CN');
    const out:ReconcileResultInput[]=[];
    for(const k of member.expectedKeys){
@@ -60,11 +71,14 @@ export function cnTushareVsGoldPair():RegisteredPair{
     if(!row){out.push(notCompared(k.naturalKey,'numeric','incomplete_gold',SIDES,{reason:'row_removed'}));continue;}
     const filing=await ctx.db.findFilingBySourceRef('tushare',row.tushare_source_ref);
     if(!filing){out.push(notCompared(k.naturalKey,'numeric','left_unlinked',SIDES,{tushare_source_ref:row.tushare_source_ref}));continue;}
+    if(filing.issuer_id!==member.issuerId){out.push(notCompared(k.naturalKey,'numeric','incomplete_gold',SIDES,{reason:'entry_changed',binding_changed:true,filing_id:filing.filing_id}));continue;}
     const docMismatch=filing.document_ref!==row.source.cninfo_announcement_id;
     const p=cnPeriodOf(row.fiscal_year,row.concept);
     const bound=open.get(k.naturalKey);
-    const rows:FactRow[]=bound?(await ctx.db.factsByIds([bound.factIds[0]])).slice(0,1)
-     :activeRows(await ctx.db.readFilingFacts(filing.filing_id,true),filing).filter(f=>f.concept===row.concept&&f.period_end===p.period_end&&f.period_start===p.period_start&&f.duration===p.duration&&f.unit===p.unit);
+    // an open item pins its fact, but only while that fact still belongs to the verified filing and the member
+    const pinned=bound?(await ctx.db.factsByIds([bound.factIds[0]])).slice(0,1):null;
+    if(pinned!==null&&(pinned.length===0||pinned[0].filing_id!==filing.filing_id||pinned[0].issuer_id!==member.issuerId)){out.push(notCompared(k.naturalKey,'numeric','incomplete_gold',SIDES,{reason:'entry_changed',binding_changed:true,filing_id:filing.filing_id,pinned_fact_ids:bound!.factIds}));continue;}
+    const rows:FactRow[]=pinned??activeRows(await ctx.db.readFilingFacts(filing.filing_id,true),filing).filter(f=>f.concept===row.concept&&f.period_end===p.period_end&&f.period_start===p.period_start&&f.duration===p.duration&&f.unit===p.unit);
     const flag=docMismatch?{document_ref_mismatch:true}:{};
     if(rows.length===0){out.push(notCompared(k.naturalKey,'numeric','left_missing',SIDES,{filing_id:filing.filing_id,...flag}));continue;}
     if(rows.length>1){out.push(notCompared(k.naturalKey,'numeric','left_ambiguous',SIDES,{fact_ids:rows.map(r=>r.fact_id),...flag}));continue;}

exec
/bin/zsh -lc "cat src/lib/dq/reconcile/pair-cn-gold.ts; cat src/lib/dq/reconcile/gold-cn.ts; rg -n 'expectedKeys|locator|members\\(' src/lib/dq/reconcile/{runner*,types*,registry*}; cat src/lib/issuers/resolve* 2>/dev/null; find . -iname '*agents*' -o -name CLAUDE.md; cat package.json" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 58ms:
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

async function loadGold(ctx:PairContext):Promise<{file:GoldCnFile;sha256:string}>{
 const {json,sha256}=await readRepoJson(ctx,CN_GOLD_PATH,'invalid_gold_file');
 const v=validateGoldCn(json);
 if(!v.ok)throw new ReconcileConfigError('invalid_gold_file',v.errors.slice(0,5).join('; '));
 return {file:v.file,sha256};
}

export function cnTushareVsGoldPair():RegisteredPair{
 return {
  id:PAIR,kind:'numeric',left:'tushare',right:'cninfo.pdf.gold',
  inputs:{repoFile:CN_GOLD_PATH,parserVersion:CN_GOLD_PARSER,goldSchema:GOLD_CN_SCHEMA},
  // the current gold manifest row of the key names the PDF evidence (source.pdf_sha256); gone → null (plan audit P2)
  async currentRight(ctx,rec){
   try{const {file}=await loadGold(ctx);return file.rows.find(r=>cnGoldKey(r)===String(rec.natural_key))?.source.pdf_sha256??null;}
   catch(e){if(e instanceof ReconcileConfigError)return null;throw e;}
  },
  async members(ctx){
   const {file,sha256}=await loadGold(ctx);
   // one member per RECORDED OWNER (the issuer of the verified filing; a merged source stays the owner), keys of several
   // tickers of one owner grouped; without a filing the ticker's resolved owner (redirected_from ?? issuer) is used
   const byOwner=new Map<string,MemberPlan>();
   for(const ticker of [...file.tickers].sort()){
    const r=await resolveIssuer(ctx.tables,{ticker},{today:todayOf(ctx)});
    if(!r)throw new ReconcileConfigError('issuer_unresolved',ticker);
    const rows=file.rows.filter(x=>x.ticker===ticker).sort((a,b)=>a.fiscal_year-b.fiscal_year||a.concept.localeCompare(b.concept));
    for(const x of rows){
     const filing=await ctx.db.findFilingBySourceRef('tushare',x.tushare_source_ref);
     const owner=filing?.issuer_id??r.redirected_from??r.issuer_id;
     const plan=byOwner.get(owner)??{issuerId:owner,market:'CN' as const,expectedKeys:[]};
     plan.expectedKeys.push({naturalKey:cnGoldKey(x),locator:{ticker,fiscal_year:x.fiscal_year,concept:x.concept,tushare_source_ref:x.tushare_source_ref,owner_issuer_id:owner,gold_sha256:sha256}});
     byOwner.set(owner,plan);
    }
   }
   return [...byOwner.values()];
  },
  async evaluate(ctx,member){
   const {file,sha256:goldSha}=await loadGold(ctx);
   const current=new Map(file.rows.map(r=>[cnGoldKey(r),r]));
   // the gold bytes seen by members() are the only ones this cycle may compare against
   const frozen=member.expectedKeys.find(k=>typeof k.locator.gold_sha256==='string')?.locator.gold_sha256;
   if(frozen!==undefined&&frozen!==goldSha)return member.expectedKeys.map(k=>notCompared(k.naturalKey,'numeric','incomplete_gold',SIDES,{reason:'gold_changed',frozen_sha256:frozen,gold_sha256:goldSha}));
   const open=await openMismatches(ctx.tables,PAIR,'CN');
   const out:ReconcileResultInput[]=[];
   for(const k of member.expectedKeys){
    const row=current.get(k.naturalKey);
    if(!row){out.push(notCompared(k.naturalKey,'numeric','incomplete_gold',SIDES,{reason:'row_removed'}));continue;}
    const filing=await ctx.db.findFilingBySourceRef('tushare',row.tushare_source_ref);
    if(!filing){out.push(notCompared(k.naturalKey,'numeric','left_unlinked',SIDES,{tushare_source_ref:row.tushare_source_ref}));continue;}
    if(filing.issuer_id!==member.issuerId){out.push(notCompared(k.naturalKey,'numeric','incomplete_gold',SIDES,{reason:'entry_changed',binding_changed:true,filing_id:filing.filing_id}));continue;}
    const docMismatch=filing.document_ref!==row.source.cninfo_announcement_id;
    const p=cnPeriodOf(row.fiscal_year,row.concept);
    const bound=open.get(k.naturalKey);
    // an open item pins its fact, but only while that fact still belongs to the verified filing and the member
    const pinned=bound?(await ctx.db.factsByIds([bound.factIds[0]])).slice(0,1):null;
    if(pinned!==null&&(pinned.length===0||pinned[0].filing_id!==filing.filing_id||pinned[0].issuer_id!==member.issuerId)){out.push(notCompared(k.naturalKey,'numeric','incomplete_gold',SIDES,{reason:'entry_changed',binding_changed:true,filing_id:filing.filing_id,pinned_fact_ids:bound!.factIds}));continue;}
    const rows:FactRow[]=pinned??activeRows(await ctx.db.readFilingFacts(filing.filing_id,true),filing).filter(f=>f.concept===row.concept&&f.period_end===p.period_end&&f.period_start===p.period_start&&f.duration===p.duration&&f.unit===p.unit);
    const flag=docMismatch?{document_ref_mismatch:true}:{};
    if(rows.length===0){out.push(notCompared(k.naturalKey,'numeric','left_missing',SIDES,{filing_id:filing.filing_id,...flag}));continue;}
    if(rows.length>1){out.push(notCompared(k.naturalKey,'numeric','left_ambiguous',SIDES,{fact_ids:rows.map(r=>r.fact_id),...flag}));continue;}
    const left=rows[0];
    const {center,radius}=printedInterval(row);
    const passed=withinRadius(left.value,center,radius);
    const tolerance=divDecimal(radius,maxAbsDecimal(left.value,center,'1'),20);
    const auto=autoQuarantinable(row);
    const action=actionFor({bound:bound!==undefined,leftStatus:left.status,compared:true,passed,onFail:auto?'quarantine_left':'review_item'});
    const inputs_hash=computeInputsHash({left_raw_hash:left.raw_hash,right_sha256:row.source.pdf_sha256,gold_or_sample_sha256:goldSha,parser_version:CN_GOLD_PARSER});
    const locator={document:row.source.document,cninfo_announcement_id:row.source.cninfo_announcement_id,pdf_url:row.source.pdf_url,page:row.source.page,table:row.source.table,column:row.column};
    out.push(comparedNumeric(k.naturalKey,left.value,center,{passed,tolerance,sides:SIDES,inputs_hash,left_fact_id:left.fact_id,action,
     detail:{left:{fact_id:left.fact_id,raw_hash:left.raw_hash,status:left.status,precision:{decimals:fractionDigits(left.value_text)}},
      right:{document:row.source.document,sha256:row.source.pdf_sha256,locator,precision:{printed_decimals:row.printed_decimals,multiplier:row.printed_unit_multiplier}},
      unit:p.unit,interval:{center,radius},tolerance_rule:'printed_precision/1',auto_quarantine:auto,inputs_hash,report_type:row.report_type??1,...flag},
     ...(action==='record'?{}:{item:mismatchItem(PAIR,k.naturalKey,left,center,locator,inputs_hash)})}));
   }
   return out;
  },
 };
}
// src/lib/dq/reconcile/gold-cn.ts
// A-share annual-report gold set (spec §5.4, T14; schema 'gold/cn-annual/1'), validator and the printed-precision
// rules. Fixed: the six concepts of the annual report table 主要会计数据和财务指标 (BS concepts INSTANT, IS/CF 12M,
// eps CNY/share with multiplier 1), fiscal years FY2022–FY2025 (owner decision E), only the 本期 column, recorder
// and reviewer as code names that must differ. The validator rejects anything that is not the EXACT product
// tickers × fiscal_years × concepts. Every row carries tushare_source_ref = <ts_code>:<end_date>:<report_type>:<ann_date>,
// independently verified by recorder and reviewer to be the same version as the PDF (pdf_sha256); the pair binds the
// left side ONLY through it (filings.document_ref is a cross-check). Interval: center = printed × multiplier,
// radius = 0.5 × 10^-decimals × multiplier; automatic quarantine only for exact printing (multiplier 1, two
// decimals), rounded printing gets a review item. goldTemplate builds the transcription template (every printed and
// source field '<pending>', so it fails validation until transcribed); pickCnSample is §5.4's sample rule.
import {conceptById} from '../../facts/concepts';
import {canonicalDecimal} from '../../facts/json-numbers';
import {mulDecimal} from './decimal';

export const GOLD_CN_SCHEMA='gold/cn-annual/1';
export const CN_GOLD_PATH='src/lib/dq/fixtures/gold/cn-annual-v1.json';
export const CN_GOLD_PARSER='gold-cn/1';
export const CN_GOLD_CONCEPTS=['revenue_operating','net_income_parent','total_assets','equity_parent','operating_cash_flow','eps_basic'] as const;
export type CnGoldConcept=typeof CN_GOLD_CONCEPTS[number];
export const CN_GOLD_FISCAL_YEARS:readonly number[]=[2022,2023,2024,2025];
export const CN_GOLD_MULTIPLIERS:readonly number[]=[1,1000,10000,1000000,100000000];
export interface GoldCnSource{document:string;cninfo_announcement_id:string;announcement_date:string;pdf_url:string;pdf_sha256:string;page:number;table:string}
export interface GoldCnRow{ticker:string;fiscal_year:number;concept:CnGoldConcept;printed_value:string;printed_unit_multiplier:number;printed_decimals:number;column:'本期';report_type?:number;source:GoldCnSource;tushare_source_ref:string;recorded_at:string}
export interface GoldCnFile{schema:typeof GOLD_CN_SCHEMA;tickers:string[];fiscal_years:number[];concepts:string[];recorded_by:string;reviewed_by:string;rows:GoldCnRow[]}

const TICKER=/^\d{6}\.(SH|SZ|BJ)$/,CODE=/^[A-Za-z0-9_-]{1,32}$/,DATE=/^\d{4}-\d{2}-\d{2}$/,SHA=/^[0-9a-f]{64}$/,PRINTED=/^-?\d+(\.\d+)?$/;
const REF=/^(\d{6}\.(?:SH|SZ|BJ)):(\d{8}):(\d+):(\d{8})$/;
const str=(v:unknown):v is string=>typeof v==='string'&&v.trim()!=='';
const TS=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
/** A real calendar date: YYYY-MM-DD or YYYYMMDD (round-trips through Date.UTC). */
const calendar=(v:string):boolean=>{const m=/^(\d{4})-?(\d{2})-?(\d{2})$/.exec(v);if(!m)return false;const [y,mo,d]=[Number(m[1]),Number(m[2]),Number(m[3])];const t=new Date(Date.UTC(y,mo-1,d));return t.getUTCFullYear()===y&&t.getUTCMonth()===mo-1&&t.getUTCDate()===d;};
const fraction=(v:string)=>{const i=v.indexOf('.');return i<0?0:v.length-i-1;};

export const cnGoldKey=(r:Pick<GoldCnRow,'ticker'|'fiscal_year'|'concept'|'tushare_source_ref'>)=>`${r.ticker}:${r.fiscal_year}:${r.concept}:${r.tushare_source_ref.split(':')[2]??''}`;

export function validateGoldCn(json:unknown):{ok:true;file:GoldCnFile}|{ok:false;errors:string[]}{
 const errors:string[]=[];const e=(m:string)=>{errors.push(m);};
 const f=json as Partial<GoldCnFile>|null;
 if(!f||typeof f!=='object')return {ok:false,errors:['not_an_object']};
 if(f.schema!==GOLD_CN_SCHEMA)e('schema');
 const tickers=Array.isArray(f.tickers)?f.tickers:[];
 if(tickers.length===0)e('tickers: empty');
 if(tickers.some(t=>typeof t!=='string'||!TICKER.test(t)))e('tickers: invalid ticker');
 if(new Set(tickers).size!==tickers.length)e('tickers: duplicate');
 const years=Array.isArray(f.fiscal_years)?f.fiscal_years:[];
 if(JSON.stringify([...years].sort())!==JSON.stringify([...CN_GOLD_FISCAL_YEARS]))e('fiscal_years: must be FY2022–FY2025');
 const concepts=Array.isArray(f.concepts)?f.concepts:[];
 if(concepts.length!==CN_GOLD_CONCEPTS.length||!CN_GOLD_CONCEPTS.every(c=>concepts.includes(c)))e('concepts: must be the fixed six');
 if(!str(f.recorded_by)||!CODE.test(f.recorded_by))e('recorded_by: code name');
 if(!str(f.reviewed_by)||!CODE.test(f.reviewed_by))e('reviewed_by: code name');
 if(f.recorded_by===f.reviewed_by)e('recorded_by == reviewed_by');
 const rows=Array.isArray(f.rows)?f.rows:[];
 const seen=new Set<string>();
 rows.forEach((r,i)=>{
  const at=`rows[${i}]`;
  if(!r||typeof r!=='object'){e(`${at}: not an object`);return;}
  const combo=`${r.ticker}|${r.fiscal_year}|${r.concept}`;
  if(!tickers.includes(r.ticker)||!years.includes(r.fiscal_year)||!(CN_GOLD_CONCEPTS as readonly string[]).includes(r.concept))e(`${at}: ${combo} outside the product`);
  if(seen.has(combo))e(`${at}: duplicate ${combo}`);seen.add(combo);
  if(typeof r.printed_value!=='string'||!PRINTED.test(r.printed_value))e(`${at}.printed_value`);
  else if(!Number.isInteger(r.printed_decimals)||r.printed_decimals<0||r.printed_decimals>6||fraction(r.printed_value)!==r.printed_decimals)e(`${at}.printed_decimals`);
  if(!CN_GOLD_MULTIPLIERS.includes(r.printed_unit_multiplier))e(`${at}.printed_unit_multiplier`);
  if(r.concept==='eps_basic'&&r.printed_unit_multiplier!==1)e(`${at}: eps multiplier must be 1`);
  if(r.column!=='本期')e(`${at}.column`);
  const s=(r.source??{}) as Partial<GoldCnSource>;
  if(!Number.isInteger(s.page)||(s.page as number)<1)e(`${at}.source.page`);
  if(typeof s.pdf_sha256!=='string'||!SHA.test(s.pdf_sha256))e(`${at}.source.pdf_sha256`);
  if(!str(s.cninfo_announcement_id))e(`${at}.source.cninfo_announcement_id`);
  if(typeof s.announcement_date!=='string'||!DATE.test(s.announcement_date)||!calendar(s.announcement_date))e(`${at}.source.announcement_date`);
  if(!str(s.document))e(`${at}.source.document`);
  if(!str(s.table))e(`${at}.source.table`);
  if(typeof s.pdf_url!=='string'||!/^https?:\/\//.test(s.pdf_url))e(`${at}.source.pdf_url`);
  const m=typeof r.tushare_source_ref==='string'?REF.exec(r.tushare_source_ref):null;
  if(!m)e(`${at}.tushare_source_ref`);
  else{
   if(m[1]!==r.ticker)e(`${at}.tushare_source_ref: ts_code ${m[1]} != ${r.ticker}`);
   if(m[2]!==`${r.fiscal_year}1231`)e(`${at}.tushare_source_ref: end_date ${m[2]} != ${r.fiscal_year}1231`);
   if(!calendar(m[2]))e(`${at}.tushare_source_ref: end_date not a calendar date`);
   if(!calendar(m[4]))e(`${at}.tushare_source_ref: ann_date ${m[4]} not a calendar date`);
   if(m[3]!==String(r.report_type??1))e(`${at}.tushare_source_ref: report_type ${m[3]} != ${r.report_type??1}`);
  }
  if(r.report_type!==undefined&&(!Number.isInteger(r.report_type)||r.report_type<1))e(`${at}.report_type`);
  if(typeof r.recorded_at!=='string'||!TS.test(r.recorded_at)||Number.isNaN(Date.parse(r.recorded_at)))e(`${at}.recorded_at`);
 });
 for(const t of tickers)for(const y of years)for(const c of CN_GOLD_CONCEPTS)if(!seen.has(`${t}|${y}|${c}`))e(`missing ${t}|${y}|${c}`);
 return errors.length>0?{ok:false,errors}:{ok:true,file:f as GoldCnFile};
}

export function printedInterval(r:Pick<GoldCnRow,'printed_value'|'printed_unit_multiplier'|'printed_decimals'>):{center:string;radius:string}{
 const mult=String(r.printed_unit_multiplier);
 return {center:mulDecimal(canonicalDecimal(r.printed_value),mult),radius:mulDecimal(canonicalDecimal(`5e-${r.printed_decimals+1}`),mult)};
}
export const autoQuarantinable=(r:Pick<GoldCnRow,'printed_unit_multiplier'|'printed_decimals'>):boolean=>r.printed_unit_multiplier===1&&r.printed_decimals===2;
export function cnPeriodOf(fy:number,concept:string):{period_start:string|null;period_end:string;duration:'12M'|'INSTANT';unit:'CNY'|'CNY/share'}{
 const def=conceptById(concept);if(!def)throw new Error(`unknown_concept:${concept}`);
 const instant=def.nature==='instant';
 return {period_start:instant?null:`${fy}-01-01`,period_end:`${fy}-12-31`,duration:instant?'INSTANT':'12M',unit:def.unitKind==='per_share'?'CNY/share':'CNY'};
}

/** §5.4 sample: valid unique tickers ascending, the first min(n, N). */
export function pickCnSample(tickers:readonly (string|null)[],n=30):string[]{
 return [...new Set(tickers.filter((t):t is string=>typeof t==='string'&&TICKER.test(t)))].sort().slice(0,Math.max(0,n));
}
/** Transcription template: the exact product, every printed/source field '<pending>' (fails validateGoldCn until filled). */
export function goldTemplate(tickers:readonly string[]):Omit<GoldCnFile,'rows'>&{rows:Record<string,unknown>[]}{
 const P='<pending>';
 return {schema:GOLD_CN_SCHEMA,tickers:[...tickers],fiscal_years:[...CN_GOLD_FISCAL_YEARS],concepts:[...CN_GOLD_CONCEPTS],recorded_by:P,reviewed_by:P,
  rows:tickers.flatMap(ticker=>CN_GOLD_FISCAL_YEARS.flatMap(fiscal_year=>CN_GOLD_CONCEPTS.map(concept=>({ticker,fiscal_year,concept,printed_value:P,printed_unit_multiplier:concept==='eps_basic'?1:P,printed_decimals:P,column:'本期',
   source:{document:P,cninfo_announcement_id:P,announcement_date:P,pdf_url:P,pdf_sha256:P,page:P,table:'主要会计数据和财务指标'},tushare_source_ref:P,recorded_at:P}))))};
}
zsh:1: no matches found: src/lib/dq/reconcile/runner*
zsh:1: no matches found: src/lib/issuers/resolve*
./node_modules/dsh-trade-strategy-evaluator/agents
./node_modules/playwright/lib/agents
./node_modules/playwright/lib/agents/generateAgents.js
./node_modules/caniuse-lite/dist/unpacker/agents.js
./node_modules/caniuse-lite/data/agents.js
./.claude/agents
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

exec
/bin/zsh -lc "rg -n 'members\\(|expectedKeys|locator' src/lib/dq/reconcile | head -65; cat src/lib/entities/resolve.ts | head -200; rg -n 'findFilingBySourceRef' src/lib/facts; ls src/lib/dq/reconcile; cat vitest.config.*" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 1ms:
src/lib/dq/reconcile/run.ts:7://     the snapshot (pair.members, then pair.memberFor for each snapshot target members() missed) →
src/lib/dq/reconcile/run.ts:99:  if(new Set(p.expectedKeys.map(e=>e.naturalKey)).size!==p.expectedKeys.length)throw new ReconcileError('duplicate_expected_key',k);
src/lib/dq/reconcile/run.ts:100:  byKey.set(k,{issuer_id:p.issuerId,market:p.market,expected_keys:p.expectedKeys});
src/lib/dq/reconcile/run.ts:108: *  2. resolve expected keys AFTER the snapshot — pair.members(ctx), then pair.memberFor for each snapshot
src/lib/dq/reconcile/run.ts:109: *     target members() did not list — so every merge in the snapshot is visible to the resolver (a zero-key
src/lib/dq/reconcile/run.ts:121: const plans=[...await pair.members(ctx)];
src/lib/dq/reconcile/run.ts:217: if(results.length!==plan.expectedKeys.length||results.some((r,i)=>r.natural_key!==plan.expectedKeys[i].naturalKey))throw new ReconcileError('evaluate_contract');
src/lib/dq/reconcile/run.ts:237:  const missing:MemberPlan={...plan,expectedKeys:plan.expectedKeys.filter(k=>!accepted.has(k.naturalKey))};
src/lib/dq/reconcile/run.ts:238:  const reused=plan.expectedKeys.length-missing.expectedKeys.length;
src/lib/dq/reconcile/run.ts:240:  const results=missing.expectedKeys.length===0?[]:await pair.evaluate(ctx,missing);   // all keys committed → no upstream read at all
src/lib/dq/reconcile/run.ts:313:  for(const plan of await pair.members(ctx)){
src/lib/dq/reconcile/run.ts:339:  const plans=new Map<string,MemberPlan>(frozen.map(m=>[mkey(m.issuer_id,m.market),{issuerId:m.issuer_id,market:m.market,expectedKeys:m.expected_keys}]));
src/lib/dq/reconcile/pairs.test.ts:73:  const [m]=await pair.members(ctx);
src/lib/dq/reconcile/pairs.test.ts:82:  const [m]=await pair.members(ctx);
src/lib/dq/reconcile/pairs.test.ts:83:  expect(m.expectedKeys.map(k=>k.naturalKey)).toEqual(['ZGOLD:revenue:2023-12-31:12M:USD','ZGOLD:net_income_parent:2023-12-31:12M:USD','ZGOLD:total_assets:2023-12-31:INSTANT:USD']);
src/lib/dq/reconcile/pairs.test.ts:101:  const pair=usCompanyfactsVsGoldPair();const [m]=await pair.members(ctx);
src/lib/dq/reconcile/pairs.test.ts:110:  await expect(pair.members(ctx)).rejects.toMatchObject({code:'invalid_gold_file'});
src/lib/dq/reconcile/pairs.test.ts:112:  await expect(pair.members(ctx)).rejects.toBeInstanceOf(ReconcileConfigError);
src/lib/dq/reconcile/pairs.test.ts:113:  await expect(pair.members(ctx)).rejects.toMatchObject({code:'issuer_unresolved'});
src/lib/dq/reconcile/pairs.test.ts:115:  await expect(pair.members(ctx)).rejects.toMatchObject({code:'invalid_gold_file'});
src/lib/dq/reconcile/pairs.test.ts:127:  const members=await usCompanyfactsVsGoldPair().members(ctx);
src/lib/dq/reconcile/pairs.test.ts:128:  expect(members.map(m=>[m.issuerId,m.expectedKeys.map(k=>k.naturalKey)]).sort()).toEqual([[a,['ZREUSE:revenue:2023-12-31:12M:USD']],[b,['ZREUSE:revenue:2024-12-31:12M:USD']]].sort());
src/lib/dq/reconcile/pairs.test.ts:129:  expect(members.find(m=>m.issuerId===a)!.expectedKeys[0].locator.owner_issuer_id).toBe(a);
src/lib/dq/reconcile/pairs.test.ts:135:  const members=await usCompanyfactsVsGoldPair().members(ctx);
src/lib/dq/reconcile/pairs.test.ts:136:  expect(members).toHaveLength(1);expect(members[0].expectedKeys).toHaveLength(2);
src/lib/dq/reconcile/pairs.test.ts:137:  const r=await db.openReconcileCycle({pair:'us.companyfacts_vs_gold',cycleId:randomUUID(),startedAt:'2026-11-05T00:00:00Z',members:members.map(m=>({issuer_id:m.issuerId,market:m.market,expected_keys:m.expectedKeys})),pending:[]});
src/lib/dq/reconcile/pairs.test.ts:152:  const pair=usCompanyfactsVsGoldPair();const [m]=await pair.members(ctx);
src/lib/dq/reconcile/pairs.test.ts:163:  const pair=usCompanyfactsVsGoldPair();const [m]=await pair.members(ctx);
src/lib/dq/reconcile/pairs.test.ts:186:  const pair=usCompanyfactsVsGoldPair();const [m]=await pair.members(ctx);
src/lib/dq/reconcile/pairs.test.ts:195:  const pair=usCompanyfactsVsGoldPair();const [m]=await pair.members(ctx);
src/lib/dq/reconcile/pairs.test.ts:202:  const pair=usCompanyfactsVsGoldPair();const [m]=await pair.members(ctx);
src/lib/dq/reconcile/pairs.test.ts:210:  const pair=usCompanyfactsVsGoldPair();const [m]=await pair.members(ctx);
src/lib/dq/reconcile/pairs.test.ts:218:  const pair=usCompanyfactsVsGoldPair();const [m]=await pair.members(ctx);
src/lib/dq/reconcile/pairs.test.ts:220:  await db.openReconcileCycle({pair:pair.id,cycleId,startedAt:'2026-11-05T00:00:00Z',members:[{issuer_id:m.issuerId,market:m.market,expected_keys:m.expectedKeys}],pending:[]});
src/lib/dq/reconcile/pairs.test.ts:241:  const members=await lineageSameDayPair().members(ctx);
src/lib/dq/reconcile/pairs.test.ts:242:  expect(members).toEqual([{issuerId:target,market:'US',expectedKeys:[{naturalKey:`${target}:revenue:2023-01-01:2023-12-31:consolidated:USD:2024-02-15`,locator:expect.objectContaining({available_date:'2024-02-15'})}]}]);
src/lib/dq/reconcile/pairs.test.ts:243:  expect(await lineageSameDayPair({targets:[]}).members(ctx)).toEqual([]);
src/lib/dq/reconcile/pairs.test.ts:246:  expect(await lineageSameDayPair().memberFor!(ctx,target,'CN')).toEqual({issuerId:target,market:'CN',expectedKeys:[]});
src/lib/dq/reconcile/pairs.test.ts:248: it('fails members() when one target would carry the same key in both markets (lineage_key_collision)',async()=>{
src/lib/dq/reconcile/pairs.test.ts:252:  await expect(lineageSameDayPair().members(ctx)).rejects.toMatchObject({code:'lineage_key_collision'});
src/lib/dq/reconcile/pairs.test.ts:253:  await expect(lineageSameDayPair().members(ctx)).rejects.toThrow(`${target}:revenue:2023-01-01:2023-12-31:consolidated:USD:2024-02-15`);
src/lib/dq/reconcile/pairs.test.ts:257:  const pair=lineageSameDayPair();const [m]=await pair.members(ctx);
src/lib/dq/reconcile/pairs.test.ts:261:  expect(r.item?.natural_key).toBe(m.expectedKeys[0].naturalKey);
src/lib/dq/reconcile/pairs.test.ts:269:  const plan:MemberPlan={issuerId:target,market:'US',expectedKeys:[
src/lib/dq/reconcile/pairs.test.ts:270:   {naturalKey:`${target}:net_income_parent:2023-01-01:2023-12-31:consolidated:USD:2024-02-15`,locator:{fact_ids:[t.factIds[1],src.factIds[1]]}},
src/lib/dq/reconcile/pairs.test.ts:271:   {naturalKey:`${target}:net_income_parent:2022-01-01:2022-12-31:consolidated:USD:2023-02-15`,locator:{fact_ids:[]}},
src/lib/dq/reconcile/pair-support.ts:33:  * members(ctx) did not list, after its pending snapshot, so the merge is already visible. Its answer is
src/lib/dq/reconcile/pair-support.ts:100:  payload:{key:keyComponents(left.issuer_id,left.market,left),fact_ids:[left.fact_id],left_value:left.value,right_value:rightValue,right_locator:rightLocator},
src/lib/dq/reconcile/pair-us-ixbrl.test.ts:66:  const pair=usCompanyfactsVsIxbrlPair();const [m]=await pair.members(s.c);
src/lib/dq/reconcile/pair-us-ixbrl.test.ts:84:  const [m]=await pair.members(s.c);
src/lib/dq/reconcile/pair-us-ixbrl.test.ts:86:  expect(m.expectedKeys.map(x=>x.naturalKey)).toEqual(KEYS.map(x=>`${CIK}:${ACCN}:${x.concept}:${x.period_start??''}:${x.period_end}:USD`));
src/lib/dq/reconcile/pair-us-ixbrl.test.ts:93:  expect(res[0]).toMatchObject({left_value:'1000',right_value:'1000',left_fact_id:rev.fact_id,detail:expect.objectContaining({tag_mismatch:true,right:expect.objectContaining({sha256:docSha,locator:expect.objectContaining({name:'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax'})})})});
src/lib/dq/reconcile/pair-us-ixbrl.test.ts:98:  expect(res[2].item?.natural_key).toBe(`us.companyfacts_vs_ixbrl:${m.expectedKeys[2].naturalKey}:${assets.fact_id}`);
src/lib/dq/reconcile/pair-us-ixbrl.test.ts:110:  const pair=usCompanyfactsVsIxbrlPair();const [m]=await pair.members(s.c);
src/lib/dq/reconcile/pair-us-ixbrl.test.ts:118:  const [m]=await pair.members(dry);
src/lib/dq/reconcile/pair-us-ixbrl.test.ts:128:  const pair=usCompanyfactsVsIxbrlPair();const [m]=await pair.members(s.c);
src/lib/dq/reconcile/pair-us-ixbrl.test.ts:132:  await expect(pair.members(bad.c)).rejects.toMatchObject({code:'invalid_sample_file'});
src/lib/dq/reconcile/pair-us-ixbrl.test.ts:136:  const pair=usCompanyfactsVsIxbrlPair();const [m]=await pair.members(s.c);
src/lib/dq/reconcile/pair-us-ixbrl.test.ts:142:  const pair=usCompanyfactsVsIxbrlPair();const [m]=await pair.members(s.c);
src/lib/dq/reconcile/pair-us-ixbrl.test.ts:151:  const pair=usCompanyfactsVsIxbrlPair();const [m]=await pair.members(s.c);
src/lib/dq/reconcile/pair-us-ixbrl.test.ts:158:  const [m]=await pair.members(dry);
src/lib/dq/reconcile/pair-us-ixbrl.test.ts:191:  const pair=usCompanyfactsVsIxbrlPair();const [m]=await pair.members(s.c);
src/lib/dq/reconcile/pair-us-ixbrl.test.ts:199:  const pair=usCompanyfactsVsIxbrlPair();const [m]=await pair.members(s.c);
src/lib/dq/reconcile/pair-us-ixbrl.test.ts:206:  const pair=usCompanyfactsVsIxbrlPair();const [m]=await pair.members(big);
src/lib/dq/reconcile/pair-cn-gold.ts:11:// Degraded path (no TUSHARE_TOKEN, no transcriber yet): the gold file does not exist, members() → invalid_gold_file;
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
 return `public, s-maxage=${secs}, stale-while-revalidate=600`;
}
src/lib/facts/types.ts:117: findFilingBySourceRef(source:Source,sourceRef:string):Promise<FilingRow|null>;
src/lib/facts/db.ts:5:// targetOf, lineageOf, findFilingBySourceRef, filingsForCalendar (reads fact_sync_runs, which anon cannot see:
src/lib/facts/db.ts:253:  async findFilingBySourceRef(source,sourceRef){const r=await rows<Record<string,unknown>>(c.from('filings').select('*').eq('source',source).eq('source_ref',sourceRef).limit(1));return r[0]?filingFromTable(r[0]):null;},
src/lib/facts/db.test.ts:273: it('plan-3 table reads: targetOf, lineageOf (target first, referrers ordered), findFilingBySourceRef, filingsForCalendar (complete set with run status, accepted_at ISO)',async()=>{
src/lib/facts/db.test.ts:284:  expect(await db.findFilingBySourceRef('edgar','0000320193-24-000123')).toMatchObject({filing_id:'g',accepted_at:'2024-02-01T21:05:00.000Z',acceptance_source:'sec_submissions'});
src/lib/facts/db.test.ts:368:  expect((await db.findFilingBySourceRef('edgar',f.sourceRef))!.accepted_at).toBe('2024-02-01T21:05:00.000Z');
src/lib/facts/memory-facts-db.ts:52:const ASYNC_METHODS=['claimLease','beginRun','stageFilings','stageFacts','quarantineFacts','publishRun','abandonRun','releaseLease','resolveFactsQuarantine','replaceMetrics','readFacts','factsByIds','openConflicts','filingsOfIssuer','updateFilingLink','reconcileScope','scopeDue','scopeRows','scopeAll','metricsOfIssuer','targetOf','lineageOf','stateRevs','readFactsLineage','readFilingFacts','replaceMetricsLineage','findFilingBySourceRef','filingsForCalendar','setFilingAcceptance','adoptCandidate','restoreReconciled','resolveLineageConflict','claimReconcileMember','applyReconcileResult','completeReconcileMember','failReconcileMember','openReconcileCycle','setMerge','setDissolved'] as const satisfies readonly (keyof FactsDb)[];
src/lib/facts/memory-facts-db.ts:450:  async findFilingBySourceRef(source,sourceRef){const g=[...filings.values()].find(x=>x.source===source&&x.source_ref===sourceRef);return g?clone(g):null;},
src/lib/facts/db-contract.ts:435:  it('plan 3 filings: readFilingFacts (every generation and status + run status), findFilingBySourceRef, filingsForCalendar, setFilingAcceptance once',async()=>{
src/lib/facts/db-contract.ts:441:   expect(await db.findFilingBySourceRef('edgar',f.sourceRef)).toMatchObject({filing_id:f.filing_id,accepted_at:null,acceptance_source:null});
src/lib/facts/db-contract.ts:442:   expect(await db.findFilingBySourceRef('tushare',f.sourceRef)).toBeNull();
src/lib/facts/db-contract.ts:449:   expect(await db.findFilingBySourceRef('edgar',f.sourceRef)).toMatchObject({accepted_at:'2024-02-01T21:05:00.000Z',acceptance_source:'sec_submissions'});
src/lib/facts/providers/sec-acceptance.test.ts:65:  expect((await db.findFilingBySourceRef('edgar',ok.sourceRef))!.accepted_at).toBe('2024-02-01T21:05:00.000Z');
src/lib/facts/providers/sec-acceptance.test.ts:66:  expect((await db.findFilingBySourceRef('edgar',mismatch.sourceRef))!.accepted_at).toBeNull();
src/lib/facts/providers/sec-acceptance.test.ts:82:  expect((await db.findFilingBySourceRef('edgar',absent.sourceRef))!.accepted_at).toBe('2024-08-02T20:30:00.000Z');
src/lib/facts/providers/sec-acceptance.test.ts:148:  expect((await db.findFilingBySourceRef('edgar',ok.sourceRef))!.accepted_at).toBeNull();
src/lib/facts/providers/sec-acceptance.test.ts:163:  expect((await db.findFilingBySourceRef('edgar',old.sourceRef))!.accepted_at).toBeNull();
src/lib/facts/providers/sec-acceptance.test.ts:168:  expect((await db.findFilingBySourceRef('edgar',old.sourceRef))!.accepted_at).toBe('2020-01-01T10:00:00.000Z');
src/lib/facts/pg-facts-db.ts:85:  async findFilingBySourceRef(source,sourceRef){const r=(await run(`select * from ${rel('filings')} where source = $1 and source_ref = $2`,[source,sourceRef])).rows[0];return r?filingFromTable(r):null;},
decimal.test.ts
decimal.ts
deps.test.ts
deps.ts
gold-cn.schema.test.ts
gold-cn.ts
inputs-hash.test.ts
inputs-hash.ts
ixbrl-pair.integration.test.ts
ixbrl-trim.test.ts
ixbrl-trim.ts
ixbrl.test.ts
ixbrl.ts
lineage.integration.test.ts
pair-cn-gold.test.ts
pair-cn-gold.ts
pair-lineage.ts
pair-support.ts
pair-us-gold.ts
pair-us-ixbrl.test.ts
pair-us-ixbrl.ts
pairs.test.ts
pairs.ts
record.test.ts
record.ts
run.test.ts
run.ts
testing.ts
types.ts
us-sample-live.test.ts
us-sample-live.ts
us-sample-v1.test.ts
us-sample.test.ts
us-sample.ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});

exec
/bin/zsh -lc './node_modules/.bin/vitest run src/lib/dq/reconcile/gold-cn.schema.test.ts src/lib/dq/reconcile/pair-cn-gold.test.ts --configLoader runner' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 207ms:
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
No actionable regressions were identified in the changed binding, owner grouping, or validation logic. Test execution was blocked by a configuration-loading error, so this assessment is based on code inspection.
No actionable regressions were identified in the changed binding, owner grouping, or validation logic. Test execution was blocked by a configuration-loading error, so this assessment is based on code inspection.

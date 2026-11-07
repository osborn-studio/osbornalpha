OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1aff4-b166-73b1-8a40-f9b2ec904fcd
--------
user
commit 3f28c93
exec
/bin/zsh -lc 'pwd; git status --short; git show --stat --oneline 3f28c93; cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-z5WCqizm' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-OofyRNxw' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/4a-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-Z8KjbDtz' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-4aeaeJZF' (errno=Operation not permitted)
3f28c93 feat(entities): plan and apply ISIN/FIGI writes with guarded updates, claim/1 claims, ownership quarantine and HKEX-vs-GLEIF text reconciliation
 src/lib/dq/batches.test.ts                 |   2 +-
 src/lib/dq/batches.ts                      |   4 +-
 src/lib/entities/identifiers/apply.test.ts |  96 +++++++++++++++
 src/lib/entities/identifiers/apply.ts      |  91 ++++++++++++++
 src/lib/entities/identifiers/plan.test.ts  | 112 +++++++++++++++++
 src/lib/entities/identifiers/plan.ts       | 189 +++++++++++++++++++++++++++++
 src/lib/facts/rules.test.ts                |   2 +-
 7 files changed, 492 insertions(+), 4 deletions(-)
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
/bin/zsh -lc 'find .. -name AGENTS.md -o -name AGENTS.override.md; git show 3f28c93 --; cat AGENTS.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 273ms:
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-M2MUA78e' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-PGqvBkGQ' (errno=Operation not permitted)
commit 3f28c9367d4123820f2dcda3118f51ba79690549
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 00:23:17 2026 -0800

    feat(entities): plan and apply ISIN/FIGI writes with guarded updates, claim/1 claims, ownership quarantine and HKEX-vs-GLEIF text reconciliation
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/dq/batches.test.ts b/src/lib/dq/batches.test.ts
index dbf6b0b..635b255 100644
--- a/src/lib/dq/batches.test.ts
+++ b/src/lib/dq/batches.test.ts
@@ -13,7 +13,7 @@ describe('batchStatusFromCounts',()=>{
   expect(batchStatusFromCounts({...emptyCounts(),inserted:5},[],{rejected:true})).toBe('rejected');
  });
  it('ignores informational codes (skips, relinks) when deciding status but keeps them in errors',()=>{
-  expect(INFO_CODES).toEqual(['skipped_summary','relink','rule_warning_summary','coverage_summary','deadline_hit']);
+  expect(INFO_CODES).toEqual(['skipped_summary','relink','rule_warning_summary','coverage_summary','deadline_hit','claims_summary']);
   const info=[{code:'skipped_summary',message:'{"not_in_universe":3}'},{code:'relink',key:'k',message:'a->b'}];
   expect(batchStatusFromCounts({...emptyCounts(),fetched:4,inserted:1},info)).toBe('success');
   expect(batchStatusFromCounts({...emptyCounts(),fetched:4,inserted:1},[...info,{code:'range'}])).toBe('partial');
diff --git a/src/lib/dq/batches.ts b/src/lib/dq/batches.ts
index 2f3e8c1..0ec8732 100644
--- a/src/lib/dq/batches.ts
+++ b/src/lib/dq/batches.ts
@@ -42,11 +42,11 @@ function capErrors(errors:BatchError[]):BatchError[]{
  * Error codes that only inform the receipt reader: `skipped_summary` (input rows left out by
  * expected filtering, e.g. not in the universe or not promotable yet) and `relink` (a research
  * entity re-pointed to another issuer), `rule_warning_summary` (one per warning rule per batch, facts spec §7.2),
- * `coverage_summary` (Tushare coverage summary, §6.3) and `deadline_hit` (issuers not started after the deadline, §6.1). They stay in `errors` but never make a batch partial or
+ * `coverage_summary` (Tushare coverage summary, §6.3), `deadline_hit` (issuers not started after the deadline, §6.1) and `claims_summary` (identifier claims filed per op, data foundation 3 §4.2.2/§8). They stay in `errors` but never make a batch partial or
  * failed. `rejected_summary` (malformed or invalid input rows) is deliberately NOT informational:
  * it makes the batch partial, or failed when nothing landed.
  */
-export const INFO_CODES=['skipped_summary','relink','rule_warning_summary','coverage_summary','deadline_hit'] as const;
+export const INFO_CODES=['skipped_summary','relink','rule_warning_summary','coverage_summary','deadline_hit','claims_summary'] as const;
 export type InfoCode=typeof INFO_CODES[number];
 export const isInfoError=(e:BatchError)=>(INFO_CODES as readonly string[]).includes(e.code);
 
diff --git a/src/lib/entities/identifiers/apply.test.ts b/src/lib/entities/identifiers/apply.test.ts
new file mode 100644
index 0000000..28ff786
--- /dev/null
+++ b/src/lib/entities/identifiers/apply.test.ts
@@ -0,0 +1,96 @@
+// src/lib/entities/identifiers/apply.test.ts
+import {describe,it,expect,vi} from 'vitest';
+import {TableError,type TableClient} from '../../db/table-client';
+import {memoryTableClient} from '../../db/memory-table-client';
+import {batchStatusFromCounts} from '../../dq/batches';
+import {applyIdentifierPlan} from './apply';
+import type {FigiJob,FigiRecord} from './openfigi';
+import {planIdentifierWrites,type PlanInput} from './plan';
+
+const ASOF='2026-11-05',BATCH='33333333-3333-4333-8333-333333333333',DATASET='entities.identifiers';
+const I1='10000000-0000-4000-8000-000000000001';
+const LEI1='HWUPKR0MPOU8FGXBT394';
+const job:FigiJob={idType:'ID_ISIN',idValue:'US0378331005'};
+const rec=(o:Partial<FigiRecord>={}):FigiRecord=>({figi:'BBG000B9XRY4',compositeFIGI:'BBG000B9XRY4',ticker:'AAPL',exchCode:'US',securityType:'Common Stock',marketSector:'Equity',...o});
+// Explicit row type: inferred from the literal, isin/figi/valid_to would be `null` only and Partial<…> would
+// reject setup({figi:'BBG000OTHER1'}) under strict TS (plan audit P8).
+interface SecFixture{issuer_id:string;ticker:string;isin:string|null;figi:string|null;share_class:string;is_primary:boolean;valid_from:string;valid_to:string|null;valid_from_method:string;valid_to_method:string|null;source:string;provenance:Record<string,unknown>}
+const secRow:SecFixture={issuer_id:I1,ticker:'AAPL',isin:null,figi:null,share_class:'unknown',is_primary:true,valid_from:'2026-01-02',valid_to:null,valid_from_method:'first_observed',valid_to_method:null,source:'sec_company_tickers_exchange',provenance:{exchange:'Nasdaq'}};
+async function setup(over:Partial<SecFixture>={}){
+ const c=memoryTableClient({issuer_identifier_claims:['id'],dq_quarantine:['id'],dq_reconciliations:['id']});
+ await c.insert('issuer_securities',{...secRow,...over});
+ return c;
+}
+const input=(c:{isin:string|null;figi:string|null},o:Partial<PlanInput>={}):PlanInput=>({
+ asOf:ASOF,stages:new Set(['A','B']),issuers:[{issuer_id:I1,lei:LEI1,usci:null}],
+ openRows:[{issuer_id:I1,ticker:'AAPL',valid_from:'2026-01-02',isin:c.isin,figi:c.figi,provenance:{exchange:'Nasdaq'}}],
+ universe:new Set(['AAPL']),gleif:{sha256:'a'.repeat(64),byLei:new Map([[LEI1,['US0378331005']]])},
+ isinResults:new Map([['US0378331005',{job,status:'ok',records:[rec()],evidence:{request_sha256:'b'.repeat(64),response_sha256:'c'.repeat(64),index:0}}]]),
+ tickerResults:new Map(),hkex:null,...o,
+});
+const opts={batchId:BATCH,dataset:DATASET};
+
+describe('applyIdentifierPlan',()=>{
+ it('lands guarded sets, merging each provenance key into the stored object, and replays as duplicates',async()=>{
+  const c=await setup();
+  const first=await applyIdentifierPlan(c,planIdentifierWrites(input({isin:null,figi:null})),opts);
+  expect(first.counts).toMatchObject({fetched:2,inserted:2,duplicates:0,failed:0});
+  const [r]=c.rows('issuer_securities');
+  expect(r).toMatchObject({isin:'US0378331005',figi:'BBG000B9XRY4'});
+  expect(Object.keys(r.provenance as object).sort()).toEqual(['exchange','figi','isin']);
+  // a stale plan (built before the first apply) only finds filled columns: duplicates, nothing rewritten
+  const again=await applyIdentifierPlan(c,planIdentifierWrites(input({isin:null,figi:null})),opts);
+  expect(again.counts).toMatchObject({inserted:0,duplicates:2,failed:0});
+  expect(batchStatusFromCounts(again.counts,again.errors)).toBe('success');
+ });
+ it('a column filled with another value between plan and apply becomes a correct_identifier claim',async()=>{
+  const c=await setup({figi:'BBG000OTHER1'});
+  const res=await applyIdentifierPlan(c,planIdentifierWrites(input({isin:null,figi:null})),opts);
+  const claims=c.rows('issuer_identifier_claims');
+  expect(claims.map(x=>[x.op,x.id_type,x.value,x.status])).toEqual([['correct_identifier','figi','BBG000B9XRY4','pending']]);
+  expect((claims[0].detail as {params:unknown}).params).toEqual({expected_current:'BBG000OTHER1',new_value:'BBG000B9XRY4'});
+  expect(res.errors.map(e=>e.code)).toEqual(['claims_summary','identifier_mismatch']);
+  expect(batchStatusFromCounts(res.counts,res.errors)).toBe('partial');
+ });
+ it('an ISIN exclusion violation files a set_identifier claim and quarantines ownership_conflict',async()=>{
+  const c=await setup();
+  const failing:TableClient={...c,rpc:async(fn,a)=>{
+   if(fn==='set_security_identifier'&&a.p_column==='isin')throw new TableError('rpc','set_security_identifier','conflicting key value violates exclusion constraint "issuer_securities_isin_no_overlap"','23P01');
+   return c.rpc(fn,a);
+  }};
+  const res=await applyIdentifierPlan(failing,planIdentifierWrites(input({isin:null,figi:null})),opts);
+  expect(res.counts).toMatchObject({inserted:1,quarantined:1,failed:0});
+  expect(c.rows('issuer_identifier_claims').map(x=>[x.op,x.id_type,x.value])).toEqual([['set_identifier','isin','US0378331005']]);
+  expect(c.rows('dq_quarantine')).toEqual([expect.objectContaining({dataset:DATASET,table_name:'issuer_securities',natural_key:'isin:US0378331005',reason_code:'ownership_conflict',batch_id:BATCH,status:'open'})]);
+ });
+ it('files plan claims once, writes HKEX-vs-GLEIF text reconciliations, and summarises skips and claims',async()=>{
+  const c=await setup({ticker:'00700.HK'});
+  const hkRes={job,status:'ok' as const,records:[rec({ticker:'700',exchCode:'HK',figi:'BBG000TENCT1',compositeFIGI:'BBG000TENCT1'})],evidence:{request_sha256:'b'.repeat(64),response_sha256:'c'.repeat(64),index:0}};
+  const plan=planIdentifierWrites(input({isin:null,figi:null},{stages:new Set(['A','B','D']),universe:new Set(['00700.HK']),
+   openRows:[{issuer_id:I1,ticker:'00700.HK',valid_from:'2026-01-02',isin:null,figi:null,provenance:{}}],
+   isinResults:new Map([['US0378331005',hkRes]]),hkex:new Map([['00700',{isin:'KYG875721634',file:'list_of_securities',sha256:'d'.repeat(64),row:5}]])}));
+  const res=await applyIdentifierPlan(c,plan,opts);
+  expect(c.rows('issuer_securities')[0]).toMatchObject({isin:'KYG875721634',figi:'BBG000TENCT1'});
+  const [recon]=c.rows('dq_reconciliations');
+  expect(recon).toMatchObject({dataset:'reconcile.entities.isin_hkex_vs_gleif',pair:'entities.isin_hkex_vs_gleif',kind:'text',outcome:'compared',passed:false,
+   left_value:null,right_value:null,abs_diff:null,rel_diff:null,tolerance:0,left_source:'gleif_openfigi',right_source:'hkex_list_of_securities',
+   natural_key:'00700.HK:2026-01-02',batch_id:BATCH,cycle_id:null,issuer_id:null,market:null,attempt:null});
+  expect(recon.detail).toMatchObject({left_text:'US0378331005',right_text:'KYG875721634'});
+  expect(res.claimsSummary).toEqual({correct_identifier:1});
+  const again=await applyIdentifierPlan(c,plan,opts);
+  expect(again.claimsSummary).toEqual({correct_identifier_appended:1});
+  expect(c.rows('issuer_identifier_claims')).toHaveLength(1);
+ });
+ it('concurrent ISIN and FIGI applies on one row keep both values and both provenance keys (plan audit R2)',async()=>{
+  const c=await setup();
+  const p=planIdentifierWrites(input({isin:null,figi:null}));
+  const only=(col:'isin'|'figi')=>({...p,writes:p.writes.filter(w=>w.column===col),claims:[],quarantines:[],recons:[],duplicates:0,skipped:[]});
+  const spy=vi.spyOn(c,'rpc');
+  const [a,b]=await Promise.all([applyIdentifierPlan(c,only('isin'),opts),applyIdentifierPlan(c,only('figi'),opts)]);
+  expect([a.counts.inserted,b.counts.inserted]).toEqual([1,1]);
+  expect(spy.mock.calls.map(x=>x[0])).toEqual(['set_security_identifier','set_security_identifier']);   // no read-merge-replace update
+  const [r]=c.rows('issuer_securities');
+  expect(r).toMatchObject({isin:'US0378331005',figi:'BBG000B9XRY4'});
+  expect(Object.keys(r.provenance as object).sort()).toEqual(['exchange','figi','isin']);
+ });
+});
diff --git a/src/lib/entities/identifiers/apply.ts b/src/lib/entities/identifiers/apply.ts
new file mode 100644
index 0000000..4050e09
--- /dev/null
+++ b/src/lib/entities/identifiers/apply.ts
@@ -0,0 +1,91 @@
+// src/lib/entities/identifiers/apply.ts
+// Writes an IdentifierPlan (spec §4.1.2 "写入"): guarded column sets (only an empty column of an open
+// row), provenance-only completions, claim/1 claims, ownership quarantines and the
+// entities.isin_hkex_vs_gleif text reconciliations (written directly until record.ts exists;
+// contract issue 7). Each column write goes through the migration-one function set_security_identifier
+// (plan audit R2): under the security-row lock it writes the empty column and merges its ONE provenance
+// key with `||` in the same UPDATE, so a concurrent write of the other column or a claim resolution never
+// loses its evidence key, and a failed sibling write never leaves provenance describing a value that is
+// not stored. fetched =
+// rows with a table outcome; claims-only outcomes are reported in claims_summary (informational),
+// a correct_identifier also as identifier_mismatch (degrades the batch to partial).
+import {randomUUID} from 'node:crypto';
+import {TableError,callRpc,type TableClient} from '../../db/table-client';
+import {emptyCounts,type BatchCounts,type BatchError} from '../../dq/batches';
+import {DATASETS} from '../../dq/datasets';
+import {fileClaim,type ClaimInput} from '../claims';
+import {errorMessage,parkConflict,withSkippedSummary} from '../load-sec';
+import {ISIN_RECON_PAIR,type IdentifierPlan,type SecurityWrite} from './plan';
+
+export interface IdentifierApplyResult{counts:BatchCounts;errors:BatchError[];skippedSummary:Record<string,number>;claimsSummary:Record<string,number>}
+
+const violates=(e:unknown)=>e instanceof TableError&&(e.code==='23505'||e.code==='23P01');
+type SetOutcome='written'|'duplicate'|'conflict'|'not_found';
+const claimFor=(w:SecurityWrite,op:'set_identifier'|'correct_identifier',current:string|null):ClaimInput=>({
+ issuer_id:w.issuer_id,id_type:w.column,value:w.value,source:w.source,op,detail:{
+  schema:'claim/1',evidence_kind:w.evidenceKind,target:{issuer_id:w.issuer_id,ticker:w.ticker,valid_from:w.valid_from},
+  params:op==='set_identifier'?{}:{expected_current:current,new_value:w.value},evidence:w.evidence,sources:[w.evidence],provenance_written:w.patch,
+ },
+});
+
+export async function applyIdentifierPlan(tables:TableClient,plan:IdentifierPlan,opts:{batchId:string;dataset:string}):Promise<IdentifierApplyResult>{
+ const counts=emptyCounts();
+ const errors:BatchError[]=[];
+ const claimsSummary:Record<string,number>={};
+ counts.duplicates=plan.duplicates;
+ const fileOne=async(c:ClaimInput)=>{
+  try{
+   const created=await fileClaim(tables,c);
+   const k=created?c.op:`${c.op}_appended`;
+   claimsSummary[k]=(claimsSummary[k]??0)+1;
+   if(c.op==='correct_identifier')errors.push({code:'identifier_mismatch',key:`${c.detail.target.ticker??c.issuer_id}:${c.id_type}`,message:`${String(c.detail.params.expected_current)} -> ${c.value}`});
+  }catch(e){counts.failed++;errors.push({code:'claim_error',key:`${c.issuer_id}:${c.id_type}:${c.value}`,message:errorMessage(e)});}
+ };
+
+ for(const w of plan.writes){
+  const key={issuer_id:w.issuer_id,ticker:w.ticker,valid_from:w.valid_from};
+  const where=`${w.ticker}:${w.valid_from}:${w.column}`;
+  try{
+   const outcome=await callRpc(tables,'set_security_identifier',{p_issuer:w.issuer_id,p_ticker:w.ticker,p_valid_from:w.valid_from,p_column:w.column,p_value:w.value,p_provenance:w.patch}) as SetOutcome;
+   if(outcome==='written'){counts.inserted++;continue;}
+   if(outcome==='duplicate'){counts.duplicates++;continue;}
+   if(outcome==='conflict'){
+    // another value is stored: read it for the claim's expected_current (resolution re-checks it under its own guard)
+    const [cur]=await tables.select('issuer_securities',{...key,valid_to:null},{limit:1});
+    const stored=cur?.[w.column]==null?null:String(cur[w.column]);
+    if(stored===null||stored===w.value){counts.failed++;errors.push({code:'row_changed',key:where,message:'stored value changed after conflict'});continue;}
+    await fileOne(claimFor(w,'correct_identifier',stored));continue;
+   }
+   counts.failed++;errors.push({code:'row_changed',key:where,message:outcome==='not_found'?'row missing or closed':`unexpected outcome ${String(outcome)}`});
+  }catch(e){
+   if(w.column==='isin'&&violates(e)){
+    await fileOne(claimFor(w,'set_identifier',null));
+    await parkConflict(tables,{dataset:opts.dataset,table:'issuer_securities',naturalKey:`isin:${w.value}`,reasonCode:'ownership_conflict',
+     detail:{reason:'isin_held_by_other_row',ticker:w.ticker,valid_from:w.valid_from},payload:{issuer_id:w.issuer_id,ticker:w.ticker,valid_from:w.valid_from,isin:w.value},batchId:opts.batchId},
+     counts,errors,{code:'ownership_conflict',key:`isin:${w.value}`});
+    continue;
+   }
+   counts.failed++;errors.push({code:'identifier_write_error',key:where,message:errorMessage(e)});
+  }
+ }
+ for(const q of plan.quarantines){
+  await parkConflict(tables,{dataset:opts.dataset,table:'issuer_securities',naturalKey:q.naturalKey,reasonCode:q.reasonCode,detail:q.detail,payload:q.payload,batchId:opts.batchId},
+   counts,errors,{code:q.reasonCode,key:q.naturalKey});
+ }
+ for(const c of plan.claims)await fileOne(c);
+ for(const r of plan.recons){
+  try{
+   await tables.insert('dq_reconciliations',{
+    id:randomUUID(),dataset:DATASETS.reconcile(ISIN_RECON_PAIR),pair:ISIN_RECON_PAIR,kind:'text',outcome:'compared',
+    left_source:r.leftSource,right_source:r.rightSource,natural_key:r.naturalKey,left_value:null,right_value:null,abs_diff:null,rel_diff:null,tolerance:0,passed:r.passed,
+    detail:{left_text:r.leftText,right_text:r.rightText,...r.detail,tolerance_rule:'text_equal'},batch_id:opts.batchId,
+    cycle_id:null,issuer_id:null,market:null,attempt:null,created_at:new Date().toISOString(),
+   });
+  }catch(e){errors.push({code:'reconciliation_error',key:r.naturalKey,message:errorMessage(e)});}
+ }
+ counts.fetched=counts.inserted+counts.duplicates+counts.versioned+counts.quarantined+counts.failed;
+ const skippedSummary:Record<string,number>={};
+ for(const s of plan.skipped)skippedSummary[s]=(skippedSummary[s]??0)+1;
+ const lead:BatchError[]=Object.keys(claimsSummary).length?[{code:'claims_summary',message:JSON.stringify(claimsSummary)}]:[];
+ return {counts,errors:withSkippedSummary([...lead,...errors],skippedSummary),skippedSummary,claimsSummary};
+}
diff --git a/src/lib/entities/identifiers/plan.test.ts b/src/lib/entities/identifiers/plan.test.ts
new file mode 100644
index 0000000..f73d40f
--- /dev/null
+++ b/src/lib/entities/identifiers/plan.test.ts
@@ -0,0 +1,112 @@
+// src/lib/entities/identifiers/plan.test.ts
+import {describe,it,expect} from 'vitest';
+import type {FigiEvidence,FigiJob,FigiJobResult,FigiRecord} from './openfigi';
+import {planIdentifierWrites,type PlanInput,type SecRow} from './plan';
+
+const ASOF='2026-11-05';
+const I1='10000000-0000-4000-8000-000000000001',I2='10000000-0000-4000-8000-000000000002';
+const LEI1='HWUPKR0MPOU8FGXBT394';
+const GSHA='a'.repeat(64),RSHA='c'.repeat(64);
+const ev=(index:number):FigiEvidence=>({request_sha256:'b'.repeat(64),response_sha256:RSHA,index});
+const okR=(job:FigiJob,records:FigiRecord[],i=0):FigiJobResult=>({job,status:'ok',records,evidence:ev(i)});
+const rec=(o:Partial<FigiRecord>):FigiRecord=>({figi:'BBG000B9XRY4',compositeFIGI:'BBG000B9XRY4',ticker:'AAPL',exchCode:'US',securityType:'Common Stock',marketSector:'Equity',...o});
+const row=(o:Partial<SecRow>):SecRow=>({issuer_id:I1,ticker:'AAPL',valid_from:'2026-01-02',isin:null,figi:null,provenance:{exchange:'Nasdaq'},...o});
+const AAPL_JOB:FigiJob={idType:'ID_ISIN',idValue:'US0378331005'};
+const base=(o:Partial<PlanInput>={}):PlanInput=>({
+ asOf:ASOF,stages:new Set(['A','B']),issuers:[{issuer_id:I1,lei:LEI1,usci:null}],openRows:[row({})],
+ universe:new Set(['AAPL','AAPLW','00700.HK']),
+ gleif:{sha256:GSHA,byLei:new Map([[LEI1,['US0378331005']]])},
+ isinResults:new Map([['US0378331005',okR(AAPL_JOB,[rec({}),rec({figi:'BBG000B9XVV8',exchCode:'UW'})])]]),
+ tickerResults:new Map(),hkex:null,...o,
+});
+const ISIN_PROV={source:'gleif_openfigi',as_of:ASOF,evidence_sha256:GSHA,locator:`gleif:${LEI1},US0378331005;openfigi:${RSHA}#0`};
+const FIGI_PROV={source:'openfigi',as_of:ASOF,evidence_sha256:RSHA,job:{idType:'ID_ISIN',idValue:'US0378331005'},level:'composite'};
+
+describe('planIdentifierWrites · stage B',()=>{
+ it('writes an empty ISIN and FIGI as guarded sets carrying one sanitized provenance key each',()=>{
+  const p=planIdentifierWrites(base());
+  expect(p.writes.map(w=>[w.kind,w.column,w.value,w.patch])).toEqual([['set','isin','US0378331005',{isin:ISIN_PROV}],['set','figi','BBG000B9XRY4',{figi:FIGI_PROV}]]);
+  expect(p.writes[0]).toMatchObject({issuer_id:I1,ticker:'AAPL',valid_from:'2026-01-02',source:'gleif_openfigi',evidenceKind:'provider_mapping'});
+  expect(p.claims).toEqual([]);expect(p.duplicates).toBe(0);expect(p.figiMissing).toEqual([]);
+ });
+ it('same value: provenance-only write when the key is missing, duplicate when present',()=>{
+  const p=planIdentifierWrites(base({openRows:[row({isin:'US0378331005',figi:'BBG000B9XRY4',provenance:{figi:{source:'openfigi'}}})]}));
+  expect(p.writes.map(w=>[w.kind,w.column])).toEqual([['provenance','isin']]);
+  expect(p.duplicates).toBe(1);
+ });
+ it('a different stored value becomes correct_identifier and is never overwritten',()=>{
+  const p=planIdentifierWrites(base({openRows:[row({figi:'BBG000OLD001'})]}));
+  expect(p.writes.map(w=>w.column)).toEqual(['isin']);
+  expect(p.claims).toHaveLength(1);
+  expect(p.claims[0]).toMatchObject({issuer_id:I1,id_type:'figi',value:'BBG000B9XRY4',source:'openfigi',op:'correct_identifier',detail:{
+   schema:'claim/1',evidence_kind:'provider_mapping',target:{issuer_id:I1,ticker:'AAPL',valid_from:'2026-01-02'},
+   params:{expected_current:'BBG000OLD001',new_value:'BBG000B9XRY4'},provenance_written:{figi:FIGI_PROV},
+  }});
+  expect(p.claims[0].detail.sources).toEqual([p.claims[0].detail.evidence]);
+ });
+ it('several FIGI groups for one ticker: one set_identifier claim per group, ISIN still written',()=>{
+  const two=okR(AAPL_JOB,[rec({figi:'BBG000VENUE1',compositeFIGI:null}),rec({figi:'BBG000VENUE2',compositeFIGI:null})]);
+  const p=planIdentifierWrites(base({isinResults:new Map([['US0378331005',two]])}));
+  expect(p.writes.map(w=>w.column)).toEqual(['isin']);
+  const candidates=[{figi:'BBG000VENUE1',level:'venue'},{figi:'BBG000VENUE2',level:'venue'}];
+  expect(p.claims.map(c=>[c.op,c.id_type,c.value,c.detail.params])).toEqual([['set_identifier','figi','BBG000VENUE1',{candidates}],['set_identifier','figi','BBG000VENUE2',{candidates}]]);
+  expect(p.claims[0].detail.evidence.note).toBe('one of 2 candidate FIGIs: BBG000VENUE1(venue), BBG000VENUE2(venue)');
+  expect(p.skipped).toContain('figi_multiple_groups');
+ });
+ it('attach claims, ownership quarantines, universe skips and A+H candidates for tickers the issuer does not hold',()=>{
+  const res=okR(AAPL_JOB,[rec({ticker:'AAPLW',figi:'BBG000ZZZZ01',compositeFIGI:'BBG000ZZZZ01'}),rec({ticker:'ZZNOPE',figi:'BBG000ZZZZ02',compositeFIGI:'BBG000ZZZZ02'}),rec({ticker:'700',exchCode:'HK',figi:'BBG000TENCT1',compositeFIGI:'BBG000TENCT1'})]);
+  const p=planIdentifierWrites(base({openRows:[row({ticker:'600000.SH'})],isinResults:new Map([['US0378331005',res]])}));
+  expect(p.claims.map(c=>[c.op,c.id_type,c.value])).toEqual([['attach_security','ticker','AAPLW']]);
+  expect(p.claims[0].detail.params).toEqual({share_class:'unknown',valid_from:ASOF,valid_from_method:'first_observed',source:'gleif_openfigi',isin:'US0378331005'});
+  expect(p.claims[0].detail.target).toEqual({issuer_id:I1});
+  expect(p.skipped).toEqual(expect.arrayContaining(['ticker_not_in_universe','ah_link_candidate']));
+  expect(p.ahCandidates).toEqual([{issuer_id:I1,ticker:'00700.HK',isin:'US0378331005',evidence:{source:'gleif_openfigi',as_of:ASOF,evidence_sha256:GSHA,locator:`gleif:${LEI1},US0378331005;openfigi:${RSHA}#0`}}]);
+  const owned=planIdentifierWrites(base({openRows:[row({ticker:'600000.SH'}),row({issuer_id:I2,ticker:'AAPLW'})],isinResults:new Map([['US0378331005',res]])}));
+  expect(owned.claims.map(c=>c.value)).toEqual(['AAPLW']);
+  expect(owned.quarantines).toEqual([{naturalKey:`AAPLW:${ASOF}`,reasonCode:'ownership_conflict',detail:{reason:'ticker_owned_by_other_issuer',stage:'B',owner_issuer_id:I2},payload:{issuer_id:I1,ticker:'AAPLW',isin:'US0378331005'}}]);
+ });
+ it('two ISINs pointing at the same row are ambiguous: claims only',()=>{
+  const p=planIdentifierWrites(base({
+   gleif:{sha256:GSHA,byLei:new Map([[LEI1,['US0378331005','US5949181045']]])},
+   isinResults:new Map([['US0378331005',okR(AAPL_JOB,[rec({})])],['US5949181045',okR({idType:'ID_ISIN',idValue:'US5949181045'},[rec({})],1)]]),
+  }));
+  expect(p.writes.map(w=>w.column)).toEqual(['figi']);
+  expect(p.claims.map(c=>[c.op,c.value])).toEqual([['set_identifier','US0378331005'],['set_identifier','US5949181045']]);
+  expect(p.skipped).toContain('ambiguous_isin');
+ });
+ it('records why nothing was queried or found',()=>{
+  const p=planIdentifierWrites(base({isinResults:new Map([['US0378331005',{job:AAPL_JOB,status:'not_found',message:'No identifier found.',evidence:ev(0)}]])}));
+  expect(p.skipped).toEqual(['openfigi_not_found']);
+  expect(planIdentifierWrites(base({isinResults:new Map()})).skipped).toEqual(['figi_not_queried']);
+  expect(planIdentifierWrites(base({stages:new Set(['D'])})).writes).toEqual([]);
+ });
+});
+
+describe('planIdentifierWrites · stages C and D',()=>{
+ it('lists rows still without a FIGI for stage C, then writes the single TICKER group',()=>{
+  const input=base({openRows:[row({}),row({ticker:'00700.HK',valid_from:'2026-02-01'})],stages:new Set(['A','B','C'])});
+  expect(planIdentifierWrites(input).figiMissing).toEqual(['00700.HK']);
+  const job:FigiJob={idType:'TICKER',idValue:'700',exchCode:'HK'};
+  const p=planIdentifierWrites({...input,tickerResults:new Map([['00700.HK',okR(job,[rec({ticker:'700',exchCode:'HK',figi:'BBG000TENCT1',compositeFIGI:'BBG000TENCT1'})],2)]])});
+  expect(p.figiMissing).toEqual([]);
+  const w=p.writes.find(x=>x.ticker==='00700.HK')!;
+  expect(w).toMatchObject({column:'figi',value:'BBG000TENCT1',patch:{figi:{source:'openfigi',as_of:ASOF,evidence_sha256:RSHA,job:{idType:'TICKER',idValue:'700',exchCode:'HK'},level:'composite'}}});
+  const nf=planIdentifierWrites({...input,tickerResults:new Map([['00700.HK',{job,status:'not_found',message:'x',evidence:ev(0)}]])});
+  expect(nf.skipped).toContain('figi_not_found');expect(nf.figiMissing).toEqual([]);
+ });
+ it('HKEX ISIN is the primary source for .HK rows; a disagreeing stage-B ISIN becomes a text reconciliation and a claim',()=>{
+  const HK=row({ticker:'00700.HK'});
+  const res=okR(AAPL_JOB,[rec({ticker:'700',exchCode:'HK',figi:'BBG000TENCT1',compositeFIGI:'BBG000TENCT1'})]);
+  const hkex=new Map([['00700',{isin:'KYG875721634',file:'list_of_securities' as const,sha256:'d'.repeat(64),row:5}]]);
+  const p=planIdentifierWrites(base({stages:new Set(['A','B','D']),openRows:[HK],isinResults:new Map([['US0378331005',res]]),hkex}));
+  const isin=p.writes.find(w=>w.column==='isin')!;
+  expect(isin).toMatchObject({value:'KYG875721634',source:'hkex_list_of_securities',evidenceKind:'official_list',patch:{isin:{source:'hkex_list_of_securities',as_of:ASOF,evidence_sha256:'d'.repeat(64),locator:'list_of_securities:row:5'}}});
+  expect(p.recons).toEqual([{naturalKey:'00700.HK:2026-01-02',passed:false,leftText:'US0378331005',rightText:'KYG875721634',leftSource:'gleif_openfigi',rightSource:'hkex_list_of_securities',
+   detail:{left:{evidence_sha256:GSHA,locator:`gleif:${LEI1},US0378331005;openfigi:${RSHA}#0`},right:{document:'list_of_securities',sha256:'d'.repeat(64),locator:'row:5'}}}]);
+  expect(p.claims.map(c=>[c.op,c.value,c.detail.params])).toEqual([['correct_identifier','US0378331005',{expected_current:'KYG875721634',new_value:'US0378331005'}]]);
+  const agree=planIdentifierWrites(base({stages:new Set(['A','B','D']),openRows:[HK],gleif:{sha256:GSHA,byLei:new Map([[LEI1,['KYG875721634']]])},
+   isinResults:new Map([['KYG875721634',okR({idType:'ID_ISIN',idValue:'KYG875721634'},[rec({ticker:'700',exchCode:'HK',figi:'BBG000TENCT1',compositeFIGI:'BBG000TENCT1'})])]]),hkex}));
+  expect(agree.recons.map(r=>r.passed)).toEqual([true]);expect(agree.claims).toEqual([]);
+  expect(planIdentifierWrites(base({stages:new Set(['D']),openRows:[HK],hkex:new Map()})).skipped).toEqual(['hkex_no_isin']);
+ });
+});
diff --git a/src/lib/entities/identifiers/plan.ts b/src/lib/entities/identifiers/plan.ts
new file mode 100644
index 0000000..dda815c
--- /dev/null
+++ b/src/lib/entities/identifiers/plan.ts
@@ -0,0 +1,189 @@
+// src/lib/entities/identifiers/plan.ts
+// Pure planning of ISIN/FIGI writes (spec §4.1.2–§4.1.4). Inputs: the run's evidence (GLEIF subset,
+// OpenFIGI job results by ISIN and by ticker, merged HKEX lists) and the current open security rows.
+// Output: guarded column writes (one sanitized provenance key each), claim/1 claims, ownership
+// quarantines and HKEX-vs-GLEIF text reconciliations. A stored value is never overwritten: a
+// different value becomes correct_identifier. Several candidate values for one row/column are
+// ambiguous and only produce claims. HK tickers found for an issuer that holds A shares are left
+// to link-ah (spec §4.2.2 rule 1; contract issue 5).
+import type {ClaimInput} from '../claims';
+import {sanitizeProvenance} from '../provenance';
+import type {ClaimDetail,ClaimEvidence,ClaimIdType,ClaimOp,EvidenceKind} from '../types';
+import type {HkexIsin} from './hkex-list';
+import {groupFigiResults,type FigiGroup,type FigiJob,type FigiJobResult} from './openfigi';
+
+export const ISIN_RECON_PAIR='entities.isin_hkex_vs_gleif' as const;
+export type Stage='A'|'B'|'C'|'D';
+export interface SecRow{issuer_id:string;ticker:string;valid_from:string;isin:string|null;figi:string|null;provenance:Record<string,unknown>}
+export interface IssuerRow{issuer_id:string;lei:string|null;usci:string|null}
+export interface PlanInput{
+ asOf:string;stages:ReadonlySet<Stage>;
+ /** the run's active issuers */
+ issuers:readonly IssuerRow[];
+ /** ALL open (valid_to null) security rows: ownership lookups use every issuer's rows */
+ openRows:readonly SecRow[];
+ universe:ReadonlySet<string>;
+ gleif:{sha256:string;byLei:ReadonlyMap<string,readonly string[]>}|null;
+ isinResults:ReadonlyMap<string,FigiJobResult>;
+ tickerResults:ReadonlyMap<string,FigiJobResult>;
+ /** 5-digit stock code → ISIN (mergeHkexIsins); null or empty = no HKEX ISIN source this run */
+ hkex:ReadonlyMap<string,HkexIsin>|null;
+}
+export type IdColumn='isin'|'figi';
+export interface SecurityWrite{
+ kind:'set'|'provenance';issuer_id:string;ticker:string;valid_from:string;column:IdColumn;value:string;
+ /** exactly one sanitized provenance key ({isin:…} or {figi:…}); apply merges it into the stored object */
+ patch:Record<string,unknown>;source:string;evidenceKind:EvidenceKind;evidence:ClaimEvidence;
+}
+export interface PlannedQuarantine{naturalKey:string;reasonCode:'ownership_conflict';detail:Record<string,unknown>;payload:Record<string,unknown>}
+export interface PlannedRecon{naturalKey:string;passed:boolean;leftText:string;rightText:string;leftSource:string;rightSource:string;detail:Record<string,unknown>}
+export interface AhCandidate{issuer_id:string;ticker:string;isin:string;evidence:ClaimEvidence}
+export interface IdentifierPlan{writes:SecurityWrite[];claims:ClaimInput[];quarantines:PlannedQuarantine[];recons:PlannedRecon[];duplicates:number;skipped:string[];figiMissing:string[];ahCandidates:AhCandidate[]}
+
+interface Proposal{value:string;source:string;kind:EvidenceKind;evidence:ClaimEvidence;prov:Record<string,unknown>}
+type Op=Exclude<ClaimOp,'legacy'>;
+const keyOf=(r:{issuer_id:string;ticker:string;valid_from:string})=>`${r.issuer_id}|${r.ticker}|${r.valid_from}`;
+const targetOf=(r:SecRow)=>({issuer_id:r.issuer_id,ticker:r.ticker,valid_from:r.valid_from});
+const jobOf=(j:FigiJob)=>j.exchCode?{idType:j.idType,idValue:j.idValue,exchCode:j.exchCode}:{idType:j.idType,idValue:j.idValue};
+
+export function planIdentifierWrites(input:PlanInput):IdentifierPlan{
+ const {asOf,stages}=input;
+ const out:IdentifierPlan={writes:[],claims:[],quarantines:[],recons:[],duplicates:0,skipped:[],figiMissing:[],ahCandidates:[]};
+ const runIds=new Set(input.issuers.map(i=>i.issuer_id));
+ const runRows=input.openRows.filter(r=>runIds.has(r.issuer_id));
+ const openOwner=new Map(input.openRows.map(r=>[r.ticker,r.issuer_id]));
+ const holdsA=new Set(input.openRows.filter(r=>/\.(SH|SZ)$/.test(r.ticker)).map(r=>r.issuer_id));
+ const proposals=new Map<string,{row:SecRow;col:IdColumn;list:Proposal[]}>();
+ const figiClaimed=new Set<string>();
+ const propose=(row:SecRow,col:IdColumn,p:Proposal)=>{
+  const k=`${keyOf(row)}|${col}`;
+  const e=proposals.get(k)??{row,col,list:[]};
+  if(!e.list.some(x=>x.value===p.value))e.list.push(p);
+  proposals.set(k,e);
+ };
+ const claim=(c:{issuer_id:string;id_type:ClaimIdType;value:string;source:string;op:Op;kind:EvidenceKind;target:ClaimDetail['target'];params:Record<string,unknown>;evidence:ClaimEvidence;written?:Record<string,unknown>})=>{
+  out.claims.push({issuer_id:c.issuer_id,id_type:c.id_type,value:c.value,source:c.source,op:c.op,detail:{
+   schema:'claim/1',evidence_kind:c.kind,target:c.target,params:c.params,evidence:c.evidence,sources:[c.evidence],...(c.written?{provenance_written:c.written}:{}),
+  }});
+ };
+ const figiProposal=(r:Extract<FigiJobResult,{status:'ok'}>,g:FigiGroup):Proposal=>({
+  value:g.figi,source:'openfigi',kind:'provider_mapping',
+  evidence:{source:'openfigi',as_of:asOf,evidence_sha256:r.evidence.response_sha256,locator:`openfigi:${r.evidence.response_sha256}#${r.evidence.index}`},
+  prov:{source:'openfigi',as_of:asOf,evidence_sha256:r.evidence.response_sha256,job:jobOf(r.job),level:g.level},
+ });
+ const multiFigi=(row:SecRow,r:Extract<FigiJobResult,{status:'ok'}>,groups:FigiGroup[])=>{
+  figiClaimed.add(keyOf(row));
+  out.skipped.push('figi_multiple_groups');
+  if(groups.some(g=>g.figi===row.figi)){out.duplicates++;return;}
+  const note=`one of ${groups.length} candidate FIGIs: ${groups.map(g=>`${g.figi}(${g.level})`).join(', ')}`;
+  // spec §4.1.2 "detail.candidates 全部列出": every per-group claim carries the full sorted list in params.candidates
+  // (Part A validateClaimDetail/identifier_claim_problem allow params.candidates for set_identifier/correct_identifier).
+  const candidates=groups.map(g=>({figi:g.figi,level:g.level}));
+  for(const g of groups){
+   const p=figiProposal(r,g);
+   const op:Op=row.figi===null?'set_identifier':'correct_identifier';
+   claim({issuer_id:row.issuer_id,id_type:'figi',value:g.figi,source:'openfigi',op,kind:'provider_mapping',target:targetOf(row),
+    params:op==='set_identifier'?{candidates}:{expected_current:row.figi,new_value:g.figi,candidates},evidence:{...p.evidence,note},written:sanitizeProvenance({figi:p.prov})});
+  }
+ };
+
+ // Stage B: ISIN (from GLEIF, stage A) → OpenFIGI → (issuer via LEI, normalized ticker).
+ if(stages.has('B')&&input.gleif){
+  for(const iss of input.issuers){
+   if(!iss.lei)continue;
+   for(const isin of input.gleif.byLei.get(iss.lei)??[]){
+    const r=input.isinResults.get(isin);
+    if(!r){out.skipped.push('figi_not_queried');continue;}
+    if(r.status!=='ok'){out.skipped.push(`openfigi_${r.status}`);continue;}
+    const g=groupFigiResults(r.records);
+    out.skipped.push(...g.skipped);
+    const locator=`gleif:${iss.lei},${isin};openfigi:${r.evidence.response_sha256}#${r.evidence.index}`;
+    const evidence:ClaimEvidence={source:'gleif_openfigi',as_of:asOf,evidence_sha256:input.gleif.sha256,locator};
+    const isinProposal:Proposal={value:isin,source:'gleif_openfigi',kind:'provider_mapping',evidence,prov:{source:'gleif_openfigi',as_of:asOf,evidence_sha256:input.gleif.sha256,locator}};
+    for(const c of g.candidates){
+     const own=runRows.find(x=>x.issuer_id===iss.issuer_id&&x.ticker===c.ticker);
+     if(own){
+      propose(own,'isin',isinProposal);
+      if(c.groups.length===1)propose(own,'figi',figiProposal(r,c.groups[0]));
+      else multiFigi(own,r,c.groups);
+      continue;
+     }
+     if(!input.universe.has(c.ticker)){out.skipped.push('ticker_not_in_universe');continue;}
+     const owner=openOwner.get(c.ticker);
+     if(owner===undefined&&c.market==='HK'&&holdsA.has(iss.issuer_id)){
+      out.ahCandidates.push({issuer_id:iss.issuer_id,ticker:c.ticker,isin,evidence});out.skipped.push('ah_link_candidate');continue;
+     }
+     claim({issuer_id:iss.issuer_id,id_type:'ticker',value:c.ticker,source:'gleif_openfigi',op:'attach_security',kind:'provider_mapping',target:{issuer_id:iss.issuer_id},
+      params:{share_class:'unknown',valid_from:asOf,valid_from_method:'first_observed',source:'gleif_openfigi',isin},
+      // an ISIN can map to several tickers (Tencent: 00700.HK, 80700.HK, TCTZF): this one is only a co-mapping, so the reviewer must confirm it is the issuer's own listing
+      evidence:{...evidence,note:`ticker ${c.ticker} co-mapped by ISIN ${isin}; listing not confirmed`}});
+     if(owner!==undefined)out.quarantines.push({naturalKey:`${c.ticker}:${asOf}`,reasonCode:'ownership_conflict',
+      detail:{reason:'ticker_owned_by_other_issuer',stage:'B',owner_issuer_id:owner},payload:{issuer_id:iss.issuer_id,ticker:c.ticker,isin}});
+    }
+   }
+  }
+ }
+
+ // Stage D: HKEX is the primary ISIN source for .HK rows; stage-B values are compared, not written.
+ if(stages.has('D')){
+  if(!input.hkex||input.hkex.size===0)out.skipped.push('hkex_no_isin');
+  else for(const row of runRows){
+   const m=/^(\d{5})\.HK$/.exec(row.ticker);
+   if(!m)continue;
+   const hk=input.hkex.get(m[1]);
+   if(!hk){out.skipped.push('hkex_code_not_listed');continue;}
+   const source=`hkex_${hk.file}`,locator=`${hk.file}:row:${hk.row}`;
+   const evidence:ClaimEvidence={source,as_of:asOf,evidence_sha256:hk.sha256,locator};
+   const k=`${keyOf(row)}|isin`;
+   for(const b of proposals.get(k)?.list??[]){
+    out.recons.push({naturalKey:`${row.ticker}:${row.valid_from}`,passed:b.value===hk.isin,leftText:b.value,rightText:hk.isin,leftSource:b.source,rightSource:source,
+     detail:{left:{evidence_sha256:b.evidence.evidence_sha256,locator:b.evidence.locator},right:{document:hk.file,sha256:hk.sha256,locator:`row:${hk.row}`}}});
+    if(b.value!==hk.isin)claim({issuer_id:row.issuer_id,id_type:'isin',value:b.value,source:b.source,op:'correct_identifier',kind:b.kind,target:targetOf(row),
+     params:{expected_current:hk.isin,new_value:b.value},evidence:b.evidence,written:sanitizeProvenance({isin:b.prov})});
+   }
+   proposals.set(k,{row,col:'isin',list:[{value:hk.isin,source,kind:'official_list',evidence,prov:{source,as_of:asOf,evidence_sha256:hk.sha256,locator}}]});
+  }
+ }
+
+ // Stage C: TICKER → FIGI for rows that still have none.
+ const hasFigi=(row:SecRow)=>row.figi!==null||proposals.has(`${keyOf(row)}|figi`)||figiClaimed.has(keyOf(row));
+ if(stages.has('C')){
+  for(const row of runRows){
+   if(hasFigi(row))continue;
+   const r=input.tickerResults.get(row.ticker);
+   if(!r)continue;
+   if(r.status!=='ok'){out.skipped.push(r.status==='not_found'?'figi_not_found':'openfigi_error');continue;}
+   const g=groupFigiResults(r.records);
+   out.skipped.push(...g.skipped);
+   const c=g.candidates.find(x=>x.ticker===row.ticker);
+   if(!c){out.skipped.push('figi_not_found');continue;}
+   if(c.groups.length===1)propose(row,'figi',figiProposal(r,c.groups[0]));
+   else multiFigi(row,r,c.groups);
+  }
+ }
+ out.figiMissing=[...new Set(runRows.filter(r=>!hasFigi(r)&&!input.tickerResults.has(r.ticker)).map(r=>r.ticker))].sort();
+
+ // Resolve proposals against the stored values.
+ for(const {row,col,list} of proposals.values()){
+  const current=row[col];
+  if(list.length>1){
+   out.skipped.push(`ambiguous_${col}`);
+   for(const p of list){
+    if(current===p.value)continue;
+    const op:Op=current===null?'set_identifier':'correct_identifier';
+    claim({issuer_id:row.issuer_id,id_type:col,value:p.value,source:p.source,op,kind:p.kind,target:targetOf(row),
+     params:op==='set_identifier'?{}:{expected_current:current,new_value:p.value},evidence:p.evidence,written:sanitizeProvenance({[col]:p.prov})});
+   }
+   continue;
+  }
+  const p=list[0];
+  const patch=sanitizeProvenance({[col]:p.prov});
+  const write=(kind:SecurityWrite['kind'])=>out.writes.push({kind,...targetOf(row),column:col,value:p.value,patch,source:p.source,evidenceKind:p.kind,evidence:p.evidence});
+  if(current===null){write('set');continue;}
+  if(current===p.value){if(col in row.provenance)out.duplicates++;else write('provenance');continue;}
+  claim({issuer_id:row.issuer_id,id_type:col,value:p.value,source:p.source,op:'correct_identifier',kind:p.kind,target:targetOf(row),
+   params:{expected_current:current,new_value:p.value},evidence:p.evidence,written:patch});
+ }
+ out.skipped.sort();
+ return out;
+}
diff --git a/src/lib/facts/rules.test.ts b/src/lib/facts/rules.test.ts
index 3fef0c9..cd74304 100644
--- a/src/lib/facts/rules.test.ts
+++ b/src/lib/facts/rules.test.ts
@@ -61,7 +61,7 @@ describe('evaluateFactRules',()=>{
    {code:'rule_warning_summary',key:'gross_margin_range',message:JSON.stringify({count:2,keys:['k1','k2']})},
    {code:'rule_warning_summary',key:'revenue_jump',message:JSON.stringify({count:1,keys:['k3']})},
   ]);
-  expect(INFO_CODES).toEqual(['skipped_summary','relink','rule_warning_summary','coverage_summary','deadline_hit']);
+  expect(INFO_CODES).toEqual(['skipped_summary','relink','rule_warning_summary','coverage_summary','deadline_hit','claims_summary']);
   expect(batchStatusFromCounts({...emptyCounts(),inserted:1},errors)).toBe('success');
   expect(summarizeWarnings(new Map([['x',[]]]))).toEqual([]);
  });
cat: AGENTS.md: No such file or directory

exec
/bin/zsh -lc "ls -a; find /Volumes/AIMATE_WORK/Developer/CodeX -maxdepth 2 -name 'AGENTS*'; cat src/lib/entities/claims.ts; rg -n 'set_security_identifier|4.1.2|HKEX.*主' supabase docs src/lib/db/memory-table-client.ts | head -70" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 176ms:
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
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-PA-invitee-ux/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/OS-CRM/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/vox-agent-neat2/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/FounderOS/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-PA-mcp/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/osstack/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/OSedit/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/vox-agent-ci-fix/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-PA-w11/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/vox-agent-publish/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-PA-ci2/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/01_vibecoding/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-PA-w1/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-PA-w6/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-PA-p3e/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-PA-p0b2c/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/mattpocock-skills-source/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/vox-agents/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-brain-ops/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-PA-p0b2b/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-PA-p3d/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-PA-invfix/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornHub/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-PA-w7/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/yuanzhou/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/osborn-fund/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/vox-agents-windows-v428-l0b1/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/tokenman/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-PA-p1/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/dingmeng/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-PA-p2a/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/firstmate/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-PA-gd/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornModel/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-PA-gc/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/vox-agent-install-docs/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-brain-w8/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-PA-gb/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-PA/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-PA-m5/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-brain-w9/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-PA-specs23/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/ihiking-me/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/EyEu-clean/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-brain-source-quality/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-PA-w13/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-PA-w14/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/OS-ERP/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Insight Pipeline OS/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/vox-agent-public/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/osvox/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/vox-agent/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-PA-brainpack/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-brain-ledger-managed/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-PA-ci/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/OScut/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-PA-w5/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-PA-w2/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-PA-p0b2/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-PA-p0h/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/OSbot/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-PA-p0b2a/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-PA-w3/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-PA-w4/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/vox-agent-win-installer/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-brain-p3crecord/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-PA-cidocs/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/vox-agent-win-composer/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/osborn-money/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/vox-agents-feishu-conversations/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/DSH plugin rep/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-PA-padmin/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-brain-p3c/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-brain-p3d/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/vox-agent-neat-readme/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-brain/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-PA-p1-invite/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-PA-p2b/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-brain-ci/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-brain-studio/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/OStag/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/vox-agent-win-backend/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/rakazo/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/EyEu/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/GithubRadar/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-PA-p3ab/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/vox-agents-feishu-backup/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-PA-ga/AGENTS.md
/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-PA-reconcile/AGENTS.md
// src/lib/entities/claims.ts
// Pending issuer_identifier_claims in the claim/1 shape (spec 3 §4.2.1; plan 3 contract C2): the review
// queue for identifier and window changes that contradict stored data or need a human decision.
// validateClaimDetail mirrors the SQL check identifier_claim_problem that resolve_identifier_claim
// runs again on acceptance: keep the two in step (migration 20261107090000). A claim is keyed by
// (issuer_id, id_type, value, op, target_key) while pending (partial unique index); filing the same key
// again only appends new evidence to detail.sources and never changes target or params.
import {createHash,randomUUID} from 'node:crypto';
import {TableError,callRpc} from '../db/table-client';
import type {Row,TableClient} from '../db/table-client';
import {ProvenanceError,sanitizeProvenance} from './provenance';
import type {ClaimDetail,ClaimEvidence,ClaimIdType,ClaimOp,ClaimTarget,EvidenceKind} from './types';

/** Unique (23505) or exclusion (23P01) violation, i.e. another row already holds the key. */
export const isUnique=(e:unknown)=>e instanceof TableError&&(e.code==='23505'||e.code==='23P01');

export interface ClaimInput{issuer_id:string;id_type:ClaimIdType;value:string;source:string;op:Exclude<ClaimOp,'legacy'>;detail:ClaimDetail}
export const CLAIM_SCHEMA='claim/1';
export const EVIDENCE_KINDS:readonly EvidenceKind[]=['hard_identifier','official_list','name_match','filing_form','provider_mapping'];
const ISSUER_COLUMNS:readonly string[]=['lei','cik','usci','cninfo_org_id'];
const SECURITY_COLUMNS:readonly string[]=['isin','figi'];
const SHARE_CLASSES:readonly string[]=['A','H','ADR','common','preferred','other','unknown'];
const FROM_METHODS:readonly string[]=['first_observed','listing_date','ticker_change','curated'];
const TO_METHODS:readonly string[]=['delisting','ticker_change','sec_file_absent','curated','merge_close','unrecorded'];
const BACKDATE_METHODS:readonly string[]=['listing_date','ticker_change','curated'];
const SUGGESTED_OPS:readonly string[]=['attach_security','close_security','backdate_window'];
const ISIN=/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
const TICKER=/^[A-Z0-9][A-Z0-9.-]{0,31}$/;
const SHA256=/^[0-9a-f]{64}$/;

const isObj=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const str=(v:unknown,max=64):v is string=>typeof v==='string'&&v.length>=1&&v.length<=max;
const onlyKeys=(o:Record<string,unknown>,allowed:readonly string[])=>Object.keys(o).every(k=>allowed.includes(k));

/** A real calendar day as YYYY-MM-DD (2026-02-30 is not). */
export function isIsoDate(v:unknown):v is string{
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
 const d=new Date(`${v}T00:00:00Z`);
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;
}
const validEvidence=(e:unknown):e is ClaimEvidence=>isObj(e)&&str(e.source)&&isIsoDate(e.as_of)&&typeof e.evidence_sha256==='string'&&SHA256.test(e.evidence_sha256 as string)
 &&(e.locator===undefined||typeof e.locator==='string')&&(e.note===undefined||typeof e.note==='string');

/** op ':' issuer_id, or op ':' issuer_id '|' ticker '|' valid_from (= SQL identifier_claim_target_key). */
export function claimTargetKey(op:ClaimOp,target:ClaimTarget):string{
 return target.ticker!==undefined?`${op}:${target.issuer_id}|${target.ticker}|${target.valid_from}`:`${op}:${target.issuer_id}`;
}

/** Provenance keys an accepted claim may write to its target row (detail.provenance_written). */
export function provenanceKeysFor(op:ClaimOp,idType:ClaimIdType):readonly string[]{
 if(op==='set_identifier'||op==='correct_identifier')return [idType];
 if(op==='attach_security')return ['isin','figi','valid_from'];
 if(op==='close_security')return ['valid_to'];
 if(op==='backdate_window')return ['valid_from'];
 return [];
}

type Verdict={ok:true}|{ok:false;error:string};
const bad=(field:string):Verdict=>({ok:false,error:`invalid_claim:${field}`});

/**
 * claim/1 check for (op, id_type, detail) per spec 3 §4.2.1; with `value`, also that the claim's value
 * column agrees (correct_identifier new_value, close/backdate target.ticker). Unknown top-level detail
 * keys are allowed (amend bookkeeping); unknown params keys are not, except for evidence_only.
 */
export function validateClaimDetail(op:ClaimOp,idType:ClaimIdType,detail:unknown,value?:string):Verdict{
 if(op==='legacy')return {ok:false,error:'legacy_claim'};
 if(!isObj(detail)||detail.schema!==CLAIM_SCHEMA)return bad('schema');
 if(!EVIDENCE_KINDS.includes(detail.evidence_kind as EvidenceKind))return bad('evidence_kind');
 const t=detail.target,pa=detail.params;
 if(!isObj(t)||!str(t.issuer_id))return bad('target.issuer_id');
 if(!isObj(pa))return bad('params');
 if(!validEvidence(detail.evidence))return bad('evidence');
 if(!Array.isArray(detail.sources)||!detail.sources.every(validEvidence))return bad('sources');
 if(detail.provenance_written!==undefined&&!isObj(detail.provenance_written))return bad('provenance_written');
 const full='ticker' in t||'valid_from' in t;
 if(full){if(!str(t.ticker,32)||!isIsoDate(t.valid_from)||Object.keys(t).length!==3)return bad('target');}
 else if(Object.keys(t).length!==1)return bad('target');
 switch(op){
  case 'set_identifier':
  case 'correct_identifier':
   if(ISSUER_COLUMNS.includes(idType)){if(full)return bad('target');}
   else if(SECURITY_COLUMNS.includes(idType)){if(!full)return bad('target');}
   else return bad('op_id_type');
   if(op==='set_identifier'){
    if(!onlyKeys(pa,['candidates','note'])||(pa.candidates!==undefined&&!Array.isArray(pa.candidates))||(pa.note!==undefined&&typeof pa.note!=='string'))return bad('params');
   }else{
    if(!onlyKeys(pa,['expected_current','new_value','candidates','note'])||!str(pa.expected_current)||!str(pa.new_value)||pa.expected_current===pa.new_value)return bad('params');
    if(value!==undefined&&pa.new_value!==value)return bad('params.new_value');
   }
   break;
  case 'attach_security':
   if(idType!=='ticker'||full)return bad('op_id_type');
   if(!onlyKeys(pa,['share_class','valid_from','valid_from_method','source','isin','note','ticker'])||(pa.ticker!==undefined&&!(typeof pa.ticker==='string'&&TICKER.test(pa.ticker)))||!SHARE_CLASSES.includes(pa.share_class as string)
    ||!isIsoDate(pa.valid_from)||!FROM_METHODS.includes(pa.valid_from_method as string)||!str(pa.source)
    ||(pa.isin!==undefined&&pa.isin!==null&&!(typeof pa.isin==='string'&&ISIN.test(pa.isin as string))))return bad('params');
   // the inserted ticker is params.ticker, else the claim value (SQL: params.ticker)
   if(pa.ticker===undefined&&value!==undefined&&!TICKER.test(value))return bad('params.ticker');
   break;
  case 'close_security':
  case 'backdate_window':
   if(idType!=='ticker'||!full)return bad('op_id_type');
   if(value!==undefined&&t.ticker!==value)return bad('target.ticker');
   if(op==='close_security'){
    if(!onlyKeys(pa,['valid_to','valid_to_method','note'])||!isIsoDate(pa.valid_to)||!TO_METHODS.includes(pa.valid_to_method as string)||(pa.valid_to as string)<=(t.valid_from as string))return bad('params');
   }else if(!onlyKeys(pa,['new_valid_from','valid_from_method','note'])||!isIsoDate(pa.new_valid_from)||!BACKDATE_METHODS.includes(pa.valid_from_method as string)||(pa.new_valid_from as string)>=(t.valid_from as string))return bad('params');
   break;
  case 'evidence_only':
   if(idType!=='ticker'||full)return bad('op_id_type');
   if('suggested_op' in pa&&!(typeof pa.suggested_op==='string'&&SUGGESTED_OPS.includes(pa.suggested_op)))return bad('params.suggested_op');
   break;
  default:
   return bad('op');
 }
 if(detail.provenance_written!==undefined){
  try{sanitizeProvenance(detail.provenance_written,provenanceKeysFor(op,idType));}
  catch(e){if(e instanceof ProvenanceError)return bad(`provenance_written:${e.code}`);throw e;}
  // SQL: it must carry the op's own provenance key (the one resolve_identifier_claim merges)
  const own=op==='close_security'?'valid_to':op==='set_identifier'||op==='correct_identifier'?idType:'valid_from';
  if(provenanceKeysFor(op,idType).length>0&&!(own in detail.provenance_written))return bad('provenance_written');
 }
 return {ok:true};
}

/** Canonical JSON (keys sorted at every level, undefined dropped): the bytes whose sha256 names a record. */
export function canonicalJson(v:unknown):string{
 if(Array.isArray(v))return `[${v.map(canonicalJson).join(',')}]`;
 if(isObj(v))return `{${Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>`${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(',')}}`;
 return JSON.stringify(v??null);
}

/** Evidence for a claim derived from an input record: sha256 over its canonical JSON; as_of is the record's date (first 10 chars) or today (UTC). */
export function claimEvidence(input:{source:string;asOf?:unknown;record:unknown;locator?:string;note?:string}):ClaimEvidence{
 const day=typeof input.asOf==='string'?input.asOf.slice(0,10):'';
 return {
  source:input.source,as_of:isIsoDate(day)?day:new Date().toISOString().slice(0,10),
  evidence_sha256:createHash('sha256').update(canonicalJson(input.record)).digest('hex'),
  ...(input.locator?{locator:input.locator}:{}),...(input.note?{note:input.note}:{}),
 };
}

export function buildClaimDetail(input:{evidence_kind:EvidenceKind;target:ClaimTarget;params?:Record<string,unknown>;evidence:ClaimEvidence;sources?:ClaimEvidence[];provenance_written?:Record<string,unknown>}):ClaimDetail{
 return {schema:CLAIM_SCHEMA,evidence_kind:input.evidence_kind,target:input.target,params:input.params??{},evidence:input.evidence,sources:input.sources??[],
  ...(input.provenance_written?{provenance_written:input.provenance_written}:{})};
}

/**
 * Appends every evidence item of the incoming claim (detail.evidence plus each of detail.sources) to the
 * pending claim matching `key` through the row-locking SQL function append_claim_evidence (migration
 * 20261107090000, Task 1b; plan audit round 1, P3): it dedupes against the claim's evidence and sources
 * and patches detail.sources only, so concurrent filers never lose each other's evidence and target /
 * params / the first evidence are never touched. 'not_found' = the claim was resolved meanwhile.
 * Needs client.rpc (callRpc: rpc_unavailable otherwise).
 */
async function appendEvidence(client:TableClient,key:Row,detail:ClaimDetail):Promise<'ok'|'not_found'>{
 for(const evidence of [detail.evidence,...(detail.sources??[])]){
  const r=await callRpc(client,'append_claim_evidence',{p_issuer:key.issuer_id,p_id_type:key.id_type,p_value:key.value,p_op:key.op,p_target_key:key.target_key,p_evidence:evidence});
  if(r==='not_found')return 'not_found';
 }
 return 'ok';
}

/** detail.sources without repeats by (source, evidence_sha256), and without the primary evidence itself. */
function dedupeSources(detail:ClaimDetail):ClaimEvidence[]{
 const seen=new Set([`${detail.evidence.source}\u0000${detail.evidence.evidence_sha256}`]);
 return (detail.sources??[]).filter(e=>{const k=`${e.source}\u0000${e.evidence_sha256}`;if(seen.has(k))return false;seen.add(k);return true;});
}

/**
 * Files a pending claim/1 claim. Validates first (throws invalid_claim:<field> / legacy_claim, no DB
 * access). The same pending (issuer_id, id_type, value, op, target_key) → every incoming evidence item
 * is appended to detail.sources and false is returned; a concurrent duplicate (23505 on the partial
 * unique index) is treated the same way. If the pending claim was resolved between the lookup and the
 * append ('not_found'), the whole step is retried once against the current state (a new pending claim
 * is inserted when none is pending); when that still persists nothing the call throws
 * claim_not_persisted (retryable) — it never returns false without having persisted the evidence.
 * Returns whether a new claim row was written.
 */
export async function fileClaim(client:TableClient,c:ClaimInput):Promise<boolean>{
 const v=validateClaimDetail(c.op,c.id_type,c.detail,c.value);
 if(!v.ok)throw new Error(v.error);
 if(c.detail.target.issuer_id!==c.issuer_id)throw new Error('invalid_claim:target.issuer_id');
 if(!str(c.source))throw new Error('invalid_claim:source');
 if(!str(c.value))throw new Error('invalid_claim:value');
 const target_key=claimTargetKey(c.op,c.detail.target);
 const key:Row={issuer_id:c.issuer_id,id_type:c.id_type,value:c.value,op:c.op,target_key,status:'pending'};
 for(let attempt=0;attempt<2;attempt++){
  if((await client.select('issuer_identifier_claims',key,{limit:1})).length){
   if(await appendEvidence(client,key,c.detail)==='ok')return false;
   continue;
  }
  try{
   await client.insert('issuer_identifier_claims',{
    id:randomUUID(),issuer_id:c.issuer_id,id_type:c.id_type,value:c.value,source:c.source,confidence:null,status:'pending',
    op:c.op,target_key,detail:{...c.detail,sources:dedupeSources(c.detail)},resolved_by:null,resolved_at:null,created_at:new Date().toISOString(),
   });
   return true;
  }catch(e){
   if(!isUnique(e))throw e;
   if(await appendEvidence(client,key,c.detail)==='ok')return false;
  }
 }
 throw new Error('claim_not_persisted');
}
src/lib/db/memory-table-client.ts:11://  - rpc emulates only the plan-3 row-locking functions (append_claim_evidence, patch_quarantine_detail, set_security_identifier); one synchronous JS turn stands for the row lock.
src/lib/db/memory-table-client.ts:60: set_security_identifier(rowsOf,a){
src/lib/db/memory-table-client.ts:63:   throw new TableError('rpc','set_security_identifier','invalid_identifier_write','22023');
docs/verification/2026-10-17-pool-teardown-guard.md:83:- The quote-service-alert workflow failures on 2026-10-17 04:17 UTC (HTTP 402 `DEPLOYMENT_DISABLED` from Vercel, cleared by 07:05 UTC when the same routes answered 401/200 from this session) and its ongoing `preferred_source: degraded` classification (DataGateway/Wind unreachable from Vercel, eastmoney fallback serving) are unrelated to this change and are recorded in the session report, not fixed here.
docs/handoffs/alpha-a4/collect-2026-09-26.json:11:      "finished_at": "2026-09-26T03:27:44.192Z",
docs/handoffs/alpha-a4/collect-2026-09-26.json:79:      "url": "http://static.cninfo.com.cn/finalpage/2026-09-24/1225579911.PDF",
docs/handoffs/alpha-a4/collect-2026-09-26.json:97:      "url": "http://static.cninfo.com.cn/finalpage/2026-09-24/1225579351.PDF",
docs/CLAUDE_EDGEONE_OSBORNALPHA_HANDOFF.md:52:Account ID: 100044132677
docs/handoffs/alpha-s4/contract-hashes.json:19:      "file_sha256": "b77245ceea44162c3f392cbccf49ebf6c7c8467661d7f270bb8a31359244a592"
docs/handoffs/alpha-s7/manifest.json:67:      "sha256": "b77245ceea44162c3f392cbccf49ebf6c7c8467661d7f270bb8a31359244a592"
docs/research/chaosai-integration-2026-11-04/PAGE_INVENTORY.csv:29:https://www.chaosaiagent.com/research/dario-interview,200,页面框架/来源/入口；动态或嵌入内容仅部分核查,Dario Amodei 70 分钟访谈,760,2026-11-04T20:25:47+08:00,5ea556a9d276107003f9cc4961b834317287af846529b0c992e970ea7a55ce59
docs/release/2026-09-27-research-os-rollout.md:38:- `scripts/entity-keys/seed.ts`: upserted 21 companies, 21 securities; `entity_table_version=f6e6472627500e98c970a441c2d04203a7cdfed05b6241a7e491a7cd034e5d38`.
docs/research/chaosai-integration-2026-11-04/EVIDENCE.json:222:      "sha256": "5ea556a9d276107003f9cc4961b834317287af846529b0c992e970ea7a55ce59"
docs/audits/2026-11-05-data-foundation-3-plan/05-codex-plan-audit-round4.md:8:| R2 | RESOLVED | Setter locks the security row and atomically merges one provenance key; apply uses the RPC (`2431–2455`, `5421–5432`). Concurrent writes and claim-resolution interleavings are covered. |
docs/audits/2026-11-05-data-foundation-3-plan/02-round1-disposition.md:42:| R2 | P2 | Applied. New migration-one function `set_security_identifier(p_issuer uuid, p_ticker text, p_valid_from date, p_column text, p_value text, p_provenance jsonb) returns text`, granted to service_role only. Its outcomes are `written`, `duplicate` (same value; a missing key is completed), `conflict` and `not_found`; it raises `invalid_identifier_write` 22023 on bad input. It locks the open row with `FOR UPDATE` and, in one UPDATE, writes the empty column and sets `provenance = provenance \|\| p_provenance`. `p_provenance` must contain exactly the `p_column` key. ISIN 23505/23P01 errors pass through. The memory `rpc` emulates it. `apply.ts` now writes only through `callRpc`; on `conflict` it re-reads the stored value for the `correct_identifier` claim. Tests: Task 1b has 3 integration cases (outcome semantics; concurrent ISIN/FIGI writes where the second waits on the row lock and both values and keys survive; interleaving with `resolve_identifier_claim` in both orders, keeping both values and both evidence keys). Task 2b adds a memory emulation case. Task 4a adds a concurrent-apply case, and its exclusion case now spies on `rpc`. Checked: `resolve_identifier_claim` already merges per key (`provenance \|\| v_pw`) in every branch, so it is unchanged. | C5; Part A exports; Task 1b SQL, grants case, 3 cases, count 35; Task 2b memory client and `table-client.test.ts`; Task 4a `apply.ts` and `apply.test.ts`; spec §15 deviation row |
docs/handoffs/alpha-s7/evidence/validation-pair.json:22:      "sha256": "0666dcbad5a50d64c57961c1f2c242f93411628088f8ae9c4a1d18f1602ec0e6"
docs/audits/2026-11-04-data-foundation-3/02-codex-round2.md:11:| 7 | N7 | PARTIAL | §4.1.2 fixes `ticker` selection and normally uses composite FIGI; missing-composite fallback still lacks deterministic grouping and venue selection. |
docs/audits/2026-11-04-data-foundation-3/02-codex-round2.md:46:| M2 | P1 | §§3.1, 4.2.1, 4.3.3, 7.1 | **Claim producers and the operation table disagree on their payload.** The operation table puts `new_valid_from`, closure dates/methods, and evidence inside `detail.target`; SEC producers put several at the outer level and omit required methods. §4.1.2 also emits a security target without the table’s `issuer_id`. The route accepts only status, so users cannot repair these claims. | Define one validated discriminated payload schema, use it in every producer and SQL branch, and provide a reviewed amendment path before acceptance. |
docs/audits/2026-11-04-data-foundation-3/02-codex-round2.md:49:| M5 | P2 | §§4.1.2, 4.2.1 | **The claim queue cannot complete its advertised conflict workflow.** Different existing identifiers produce `set_identifier` claims, but acceptance only writes null columns, so those claims always conflict. Deduplication ignores target window and operation; a later claim for another window can be merged into the old target, while a different operation is merely recorded as `op_conflict`. | Distinguish enrichment from correction. Define guarded correction using an expected old value, and include operation plus stable target identity in deduplication. |
docs/audits/2026-11-04-data-foundation-3/02-codex-round2.md:51:| M7 | P2 | §4.1.2 | **Venue fallback reintroduces order dependence.** Results lacking `compositeFIGI` are grouped by that missing field, yet their differing venue FIGIs are eligible for storage. Sorting by the missing composite does not choose a deterministic venue. | Group fallback results by explicit venue identity and define a verified venue preference, or treat multiple fallback FIGIs as ambiguous. |
docs/superpowers/specs/2026-09-26-collectors-design.md:3:日期：2026-09-26。来源：《实施总纲 2026-09-22》§5.1、§8.2 WP-A4、§14.1。基于 main（含 A1 Source 扩展、A2 实体键）。用户已确认：第一切片只做官方三源 EDGAR、巨潮、HKEX；公告正文多为 PDF，第一切片存标题 + 元数据 + 链接，EDGAR 取主文档 HTML 转文本；财联社/东财新闻与招标平台放第二切片。设计已批准。
docs/audits/2026-11-04-data-foundation-3/03-disposition.md:18:| N7 OpenFIGI mapping order-dependent | ACCEPT | §4.1.2: `ticker` field, composite/venue grouping, permuted-order fixture. |
docs/audits/2026-11-04-data-foundation-3/01-codex-round1.md:13:| N7 | P1 | §4.1.2–4.1.3 | **OpenFIGI mapping is incorrect and order-dependent.** The US rule explicitly normalizes response `name` rather than `ticker`. Multiple venue results collapse onto one ticker, yet the spec stores the first `figi` and treats subsequent venue FIGIs as conflicts. It never chooses between venue, composite, and share-class identity. The official code table distinguishes US composite from individual venues. [OpenFIGI exchange codes](https://www.openfigi.com/about/exchange-codes) | Use `ticker`; define the identifier level stored in the column, deterministic selection, and ambiguity handling before any write. Test permuted multi-result responses and share-class tickers. |
docs/audits/2026-11-04-data-foundation-3/04-codex-round3.md:11:| M7 | RESOLVED | §4.1.2 groups missing-composite results by venue FIGI and treats multiple groups as ambiguous. |
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:273:#### 4.1.2 阶段 B · OpenFIGI（ISIN → ticker/exchCode/FIGI）
docs/audits/2026-11-05-data-foundation-3/verification.md:23:## Task 3b · OpenFIGI 实测（规格 §4.1.2、§14-2；无 key；日期 2026-11-06）
docs/superpowers/specs/2026-11-04-document-pipeline-design.md:149:一次申报的附属文件（EDGAR 申报索引 JSON、XBRL 实例；巨潮/HKEX 暂无）。与主文档在同一函数调用内写入（§4.8 `insert_document_version`），不存在"有文档无资产"的中间态。
docs/audits/2026-11-05-data-foundation-3/codex/3b-challenge.md:3:| 1 | P2 | `src/lib/entities/identifiers/openfigi.ts:79` | Failed HTTP evidence is discarded before storage. Reproducing two 429 responses returns `exhausted:true` with **zero stored objects**; 5xx retries and terminal 4xx responses likewise lose their bodies. This violates §4.1.2’s requirement to retain every request and raw response, preventing replay of the failure. | Store the request before sending and retain each received response, including failures, before retrying or throwing. Test failure-body hashes and request retention. |
docs/audits/2026-11-05-data-foundation-3/codex/3b-review-fix3.md:485:// Stage B/C (spec §4.1.2–§4.1.3): OpenFIGI v3 mapping adapter. mapJobs throttles to 80% of the
docs/audits/2026-11-05-data-foundation-3/codex/3b-review-fix3.md:505:/** Spec §4.1.2 set; extend only with values observed in the live check (contract issue 1). */
docs/audits/2026-11-05-data-foundation-3/codex/3b-review.md:542:+## Task 3b · OpenFIGI 实测（规格 §4.1.2、§14-2；无 key；日期 2026-11-06）
docs/audits/2026-11-05-data-foundation-3/codex/3b-review.md:596: /** Spec §4.1.2 set; extend only with values observed in the live check (contract issue 1). */
docs/audits/2026-11-05-data-foundation-3/codex/3b-review.md:598:// Stage B/C (spec §4.1.2–§4.1.3): OpenFIGI v3 mapping adapter. mapJobs throttles to 80% of the
docs/audits/2026-11-05-data-foundation-3/codex/3b-review.md:617:/** Spec §4.1.2 set; extend only with values observed in the live check (contract issue 1). */
docs/audits/2026-11-05-data-foundation-3/codex/3b-review.md:788:+## Task 3b · OpenFIGI 实测（规格 §4.1.2、§14-2；无 key；日期 2026-11-06）
docs/audits/2026-11-05-data-foundation-3/codex/3b-review.md:967:docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:1. **`securityType` 过滤可能排除 A 股与 H 股**（规格 §4.1.2 `{'Common Stock','ADR','GDR'}`）。Bloomberg 证券类型里 A 股常见为 `China-A`、H 股常见为 `H-Shares`（未核实）。本部分把集合放进单一常量 `ALLOWED_SECURITY_TYPES`，并在 Task 3b 核对步骤给出决策规则：实测 600519/0700 的 `securityType` 若不在集合内，只把**实测观察到的确切字符串**加入集合、`EXCH_MAP_VERSION` 升为 `'exch-map/2'`、在核对记录里登记为规格 §15 偏差；未核对前 `EXCH_MAP_VERIFIED=false`，`fill-identifiers --apply` 与 `link-ah --apply` 拒绝执行。 **→ 已裁决：接口对齐记录 #22。**
docs/handoffs/alpha-s6/evidence/s5-node22-tests.log:243:  duration_ms: 6.461125
docs/handoffs/alpha-s6/evidence/s5-node22-tests.log:719:  duration_ms: 411.291917
docs/handoffs/alpha-s6/evidence/s5-node22-tests.log:1735:  duration_ms: 3.431625
docs/audits/2026-11-05-data-foundation-3/codex/1b-challenge.md:4:| 2 | P2 | `supabase/migrations/20261107090000_identifiers_and_dq.sql:718` | **Identifier writes and claim resolution can deadlock.** `set_security_identifier` locks the security first; its subsequent UPDATE invokes the landed `issuer_securities_owner_active` trigger, which locks the issuer `FOR SHARE`. Resolution locks the issuer `FOR UPDATE` first (line 448), then the security. Interleaving these acquisitions produces a cycle and aborts one operation. The new concurrency test finishes the first function before starting the second, missing this window. | Acquire the issuer lock before the security lock consistently. Add a two-session regression that interleaves the lock acquisitions, rather than only holding locks after a completed function call. |
docs/audits/2026-11-05-data-foundation-3/codex/3a-review-fix1.md:542:-      "sha256": "b335217d9f253d52f1bab9953a5191c2f07fcc349a32cec1309b441d29800d5e"
docs/audits/2026-11-05-data-foundation-3/codex/1b-review-fix2.md:575:+      "sha256": "b335217d9f253d52f1bab9953a5191c2f07fcc349a32cec1309b441d29800d5e"
docs/audits/2026-11-05-data-foundation-3/codex/1b-review-fix2.md:671: -- set_security_identifier is the only writer of issuer_securities.isin/figi outside resolve_identifier_claim
docs/audits/2026-11-05-data-foundation-3/codex/1b-review-fix2.md:680: create or replace function public.set_security_identifier(p_issuer uuid, p_ticker text, p_valid_from date, p_column text, p_value text, p_provenance jsonb)
docs/audits/2026-11-05-data-foundation-3/codex/1b-review-fix2.md:702: revoke execute on function public.set_security_identifier(uuid, text, date, text, text, jsonb) from public, anon, authenticated;
docs/audits/2026-11-05-data-foundation-3/codex/1b-review-fix2.md:1008:create or replace function public.set_security_identifier(p_issuer uuid, p_ticker text, p_valid_from date, p_column text, p_value text, p_provenance jsonb)
docs/audits/2026-11-05-data-foundation-3/codex/1b-review-fix2.md:1038:revoke execute on function public.set_security_identifier(uuid, text, date, text, text, jsonb) from public, anon, authenticated;
docs/audits/2026-11-05-data-foundation-3/codex/1b-review-fix2.md:1039:grant execute on function public.set_security_identifier(uuid, text, date, text, text, jsonb) to service_role;
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:5732:  await expect(fetchCompanyFacts('0000000001',budget(300_000),{fetch:async()=>new Response('{}',{status:200,headers:{'content-length':String(51*1024*1024)}}),sleep})).rejects.toMatchObject({code:'snapshot_too_large'});
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:5868:export const MAX_SNAPSHOT_BYTES=50*1024*1024;
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:6586:["600519.SH","20240803","20240803","20230630",4,1,2,0,70900000000,69500000000,5400000000,47000000000,37000000000,35980000000,28.64,28.64,null,2100000000,4300000000,null,null,12000000000],
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:6599:["600519.SH","20240403","20240403","20231231",1,1,4,1,272000000000,51000000000,215000000000,221000000000,69000000000,null,null,null,1256197800]
docs/audits/2026-11-05-data-foundation-3/codex/3b-review-fix1.md:618:// Stage B/C (spec §4.1.2–§4.1.3): OpenFIGI v3 mapping adapter. mapJobs throttles to 80% of the
docs/audits/2026-11-05-data-foundation-3/codex/3b-review-fix1.md:637:/** Spec §4.1.2 set; extend only with values observed in the live check (contract issue 1). */
docs/audits/2026-11-05-data-foundation-3/codex/3b-review-fix2.md:725:// Stage B/C (spec §4.1.2–§4.1.3): OpenFIGI v3 mapping adapter. mapJobs throttles to 80% of the
docs/audits/2026-11-05-data-foundation-3/codex/3b-review-fix2.md:745:/** Spec §4.1.2 set; extend only with values observed in the live check (contract issue 1). */
docs/audits/2026-11-05-data-foundation-3/codex/1b-review-fix1.md:462:    'public.append_claim_evidence(uuid,text,text,text,text,jsonb)','public.patch_quarantine_detail(uuid,text,jsonb)','public.set_security_identifier(uuid,text,date,text,text,jsonb)'];
docs/audits/2026-11-05-data-foundation-3/codex/1b-review-fix1.md:472:+ it('set_security_identifier locks the issuer before the security row: it waits behind an issuer lock held by a claim-resolution-order writer, with no deadlock',async()=>{
docs/audits/2026-11-05-data-foundation-3/codex/1b-review-fix1.md:1107:940: it('set_security_identifier: written / duplicate (completing a missing key) / conflict / not_found; exactly one provenance key; other keys kept',async()=>{
docs/audits/2026-11-05-data-foundation-3/codex/1b-review.md:865:+-- set_security_identifier is the only writer of issuer_securities.isin/figi outside resolve_identifier_claim
docs/audits/2026-11-05-data-foundation-3/codex/1b-review.md:874:+create or replace function public.set_security_identifier(p_issuer uuid, p_ticker text, p_valid_from date, p_column text, p_value text, p_provenance jsonb)
docs/audits/2026-11-05-data-foundation-3/codex/1b-review.md:899:+revoke execute on function public.set_security_identifier(uuid, text, date, text, text, jsonb) from public, anon, authenticated;
docs/audits/2026-11-05-data-foundation-3/codex/1b-review.md:900:+grant execute on function public.set_security_identifier(uuid, text, date, text, text, jsonb) to service_role;
docs/audits/2026-11-05-data-foundation-3/codex/1b-review.md:1434:/bin/zsh -lc "cat src/lib/entities/identifiers.integration.test.ts; rg -n 'provenance_written|resolve_identifier_claim|set_security_identifier' docs | head -65; find . -iname '*agents*' -o -name CLAUDE.md | head -30" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
docs/audits/2026-11-05-data-foundation-3/codex/1b-review.md:2076:   'public.append_claim_evidence(uuid,text,text,text,text,jsonb)','public.patch_quarantine_detail(uuid,text,jsonb)','public.set_security_identifier(uuid,text,date,text,text,jsonb)'];
docs/audits/2026-11-05-data-foundation-3/codex/1b-review.md:2323:  on.query(`select public.set_security_identifier($1,$2,'2020-01-01'::date,$3,$4,$5::jsonb) v`,[k.issuer,k.ticker,col,value,JSON.stringify(prov)]).then(r=>r.rows[0].v as string);
docs/audits/2026-11-05-data-foundation-3/codex/1b-review.md:2327: it('set_security_identifier: written / duplicate (completing a missing key) / conflict / not_found; exactly one provenance key; other keys kept',async()=>{
docs/audits/2026-11-05-data-foundation-3/codex/1b-review.md:2378:docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:57:src/lib/db/table-client.ts、memory-table-client.ts、pg-table-client.ts   TableClient.rpc? / callRpc；内存实现模拟迁移一三个行锁函数（Task 2b；`set_security_identifier` 为计划审计 R2）
docs/audits/2026-11-05-data-foundation-3/codex/1b-review.md:2381:docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:249:| `set_security_identifier`（1） | `(p_issuer uuid, p_ticker text, p_valid_from date, p_column text, p_value text, p_provenance jsonb) returns text` → `'written'\|'duplicate'\|'conflict'\|'not_found'`；`p_column ∈ {isin, figi}`、`p_provenance` 恰含 `p_column` 一个键；`for update` 锁住开放行后**同一条 UPDATE** 写列（仅空列）并 `provenance = provenance \|\| p_provenance`（只合并该键，不整体替换）；同值缺键 → 补键并答 `duplicate`；ISIN 唯一/互斥违反（23505/23P01）原样抛出；TS 入口 `identifiers/apply.ts` → `callRpc`（Task 4a；计划审计 R2） | `invalid_identifier_write`（22023） |
docs/audits/2026-11-05-data-foundation-3/codex/1b-review.md:2383:docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:428:| 67 | 并发写 ISIN/FIGI 会互相抹掉 provenance（计划审计 R2） | 迁移一新函数 `set_security_identifier(p_issuer uuid, p_ticker text, p_valid_from date, p_column text, p_value text, p_provenance jsonb) returns text`（`'written'\|'duplicate'\|'conflict'\|'not_found'`；`for update` 锁开放行，同一 UPDATE 写空列并 `provenance = provenance \|\| p_provenance`；`p_provenance` 恰含 `p_column` 键；`invalid_identifier_write` 22023；ISIN 唯一/互斥违反原样抛出；仅 `service_role`）；内存实现模拟；`apply.ts` 每个列写入只经 `callRpc(tables,'set_security_identifier',…)`，`conflict` 时再读当前值建 `correct_identifier`。核对：`resolve_identifier_claim` 已是按键 `provenance \|\| v_pw`（不改） | C5；Part A 新增导出；Task 1b SQL、授权用例、3 个集成用例（结果语义、并发 ISIN/FIGI、与声明解析两种交错）、计数 35；Task 2b `memory-table-client.ts`、`table-client.test.ts` +1；Task 4a `apply.ts`、`apply.test.ts`（互斥违反用例改 spy `rpc`、新增并发用例）；规格 §15 偏差行 |

exec
/bin/zsh -lc "cat /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; find . -name CLAUDE.md -not -path './node_modules/*'; sed -n '700,755p' supabase/migrations/20261107090000_identifiers_and_dq.sql; ls docs/superpowers/specs/*foundation-3*; cat src/lib/dq/batches.ts | sed -n '48,85p'; sed -n '150,260p' src/lib/entities/identifiers/openfigi.ts" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 54ms:
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>  update public.dq_calendar_passes set status = v_status, finished_at = clock_timestamp() where market = p.market and pass_id = p.pass_id;
  return v_status;
end $$;
revoke execute on function public.finish_calendar_pass(jsonb) from public, anon, authenticated;
grant execute on function public.finish_calendar_pass(jsonb) to service_role;

-- ---------------------------------------------------------------- row-locked jsonb patches (plan audit round 1, P3/P4)
-- append_claim_evidence is the only writer of a pending claim's detail.sources after filing (claims.ts
-- fileClaim). It locks the pending row of the five-column key, drops evidence that already is the claim's
-- evidence or one of its sources (same source + evidence_sha256) and appends the rest with jsonb_set on
-- detail.sources alone: two concurrent filers both keep their evidence (the old read-then-replace lost
-- one). 'not_found' = no pending row any more (resolved meanwhile); nothing is written then.
create or replace function public.append_claim_evidence(p_issuer uuid, p_id_type text, p_value text, p_op text, p_target_key text, p_evidence jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_detail jsonb; v_sources jsonb;
begin
  if not public.claim_evidence_ok(p_evidence) then
    raise exception 'invalid_evidence' using errcode = '22023';
  end if;
  select id, detail into v_id, v_detail from public.issuer_identifier_claims
  where issuer_id = p_issuer and id_type = p_id_type and value = p_value and op = p_op and target_key = p_target_key and status = 'pending'
  for update;
  if not found then return 'not_found'; end if;
  v_sources := case when jsonb_typeof(v_detail -> 'sources') = 'array' then v_detail -> 'sources' else '[]'::jsonb end;
  if coalesce(v_detail -> 'evidence' ->> 'source' = p_evidence ->> 'source' and v_detail -> 'evidence' ->> 'evidence_sha256' = p_evidence ->> 'evidence_sha256', false)
     or exists (select 1 from jsonb_array_elements(v_sources) s
                where s ->> 'source' = p_evidence ->> 'source' and s ->> 'evidence_sha256' = p_evidence ->> 'evidence_sha256') then
    return 'duplicate';
  end if;
  update public.issuer_identifier_claims set detail = jsonb_set(detail, '{sources}', v_sources || jsonb_build_array(p_evidence), true) where id = v_id;
  return 'appended';
end $$;
revoke execute on function public.append_claim_evidence(uuid, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.append_claim_evidence(uuid, text, text, text, text, jsonb) to service_role;

-- patch_quarantine_detail is the only TS-side writer of dq_quarantine.detail once an item exists (the
-- materialize hook state and the audit mark; quarantine.ts::patchQuarantineDetail). It locks the item and
-- replaces ONLY the named key, so a concurrent apply_reconcile_result / restore_reconciled / adoption that
-- rewrote latest_result, the chosen ids or the resolution columns is never rolled back to an older read.
-- Two keys only: 'hook' and 'audit_written'. false = no such item.
create or replace function public.patch_quarantine_detail(p_id uuid, p_key text, p_value jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_key is null or p_key not in ('hook', 'audit_written') or p_value is null then
    raise exception 'invalid_detail_key' using errcode = '22023';
  end if;
  perform 1 from public.dq_quarantine where id = p_id for update;
  if not found then return false; end if;
  update public.dq_quarantine set detail = detail || jsonb_build_object(p_key, p_value) where id = p_id;
  return true;
end $$;
revoke execute on function public.patch_quarantine_detail(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.patch_quarantine_detail(uuid, text, jsonb) to service_role;

-- ---------------------------------------------------------------- guarded identifier write (plan audit round 3, R2)
-- set_security_identifier is the only writer of issuer_securities.isin/figi outside resolve_identifier_claim
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md
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

exec
/bin/zsh -lc "sed -n '110,240p' docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md; sed -n '755,805p' supabase/migrations/20261107090000_identifiers_and_dq.sql; nl -ba src/lib/entities/identifiers/plan.ts | sed -n '72,185p'; cat package.json | head -45" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
cycle_id text, issuer_id uuid, market text, attempt int          -- 周期结果行（T2）：四列同为空（旧行/非周期写入）或同为非空
index (pair, created_at desc)
unique index dq_reconciliations_cycle_key on (pair, cycle_id, natural_key) where cycle_id is not null   -- 已接受结果标记：每周期每键至多一行
constraint dq_reconciliations_cycle_cols check ((cycle_id is null) = (issuer_id is null) and (cycle_id is null) = (market is null) and (cycle_id is null) = (attempt is null))
constraint dq_reconciliations_numeric_sides check (kind <> 'numeric' or outcome <> 'compared' or (left_value is not null and right_value is not null))
constraint dq_reconciliations_nonnumeric_sides check (kind = 'numeric' or (left_value is null and right_value is null and rel_diff is null and abs_diff is null))
```

该表目前无写入者、生产为空；首次加列时仍把既有行（若有）标 `outcome='legacy'`。`kind='text'|'date'` 的两侧值在 `detail.left_text/right_text`，`passed` 为字符串/日期相等。`detail` 还存：`{left:{fact_id, raw_hash, locator, precision}, right:{document, sha256, locator, precision}, unit, scale, tolerance_rule, inputs_hash, reason?}`。每次运行追加，不更新。

**`dq_reconcile_cycles` 与 `dq_reconcile_cursor`**（§5.5）

```
dq_reconcile_cycles
  pair text not null, cycle_id text not null, started_at timestamptz not null, finished_at timestamptz,
  members jsonb not null check (jsonb_typeof(members)='array'),     -- 冻结的 [{issuer_id, market, expected_keys}]
  status text not null check (status in ('running','complete','complete_with_gaps')),
  expected_total int not null, compared_passed int not null default 0, compared_failed int not null default 0,
  not_compared int not null default 0, exec_failed_members int not null default 0,
  detail jsonb not null default '{}' check (jsonb_typeof(detail)='object'),   -- pending_members（§3.2 set_merge 写入）等
  primary key (pair, cycle_id)
  unique index (pair) where status = 'running'                       -- 同一 pair 同时只有一个运行中周期
dq_reconcile_cursor
  pair text not null, cycle_id text not null, issuer_id uuid not null references issuers on delete restrict, market text not null,
  expected int not null,                                               -- 该成员的预期键数（冻结）
  state text not null default 'pending' check (state in ('pending','claimed','done','failed')),
  claimed_by uuid references ingest_batches(batch_id) on delete set null, claim_until timestamptz,
  attempts int not null default 0, last_error text, done_at timestamptz,
  compared_passed int, compared_failed int, not_compared int,          -- 完成时写入；done 行三者之和必须 = expected
  primary key (pair, cycle_id, issuer_id, market),
  foreign key (pair, cycle_id) references dq_reconcile_cycles(pair, cycle_id) on delete restrict,
  index (pair, cycle_id, state),
  constraint drc_expected_nonneg check (expected >= 0),
  constraint drc_counters_nonneg check ((compared_passed is null or compared_passed >= 0) and (compared_failed is null or compared_failed >= 0) and (not_compared is null or not_compared >= 0)),
  constraint drc_done_accounted check (state <> 'done' or (compared_passed is not null and compared_failed is not null and not_compared is not null and compared_passed + compared_failed + not_compared = expected))
```

（S5 规定修法）`done` 行三个计数都必须非空且和等于 `expected`；结算前再断言每个 `done` 成员满足该不变式，**不得**把无效计数 coalesce 为 0。

游标的认领与完成都要求所有权（§5.5）。**围栏令牌**：`fence = {pair, cycle_id, issuer_id, market, batch_id, attempt}`。**逐键原子提交（T2 规定修法，取代第 5 稿的"分步写入 + 作废"）**：对账派生的全部写入只经 `apply_reconcile_result(p_fence, p_result)`（§3.2），每次调用处理**一个预期键**，在**同一事务**内：锁游标行并校验 `claimed_by = fence.batch_id and attempts = fence.attempt and claim_until > clock_timestamp()`（否则 `raise 'fence_failed'`，无任何写入）→ 若该 `(pair, cycle_id, natural_key)` 已有结果行（已接受结果标记）→ 原样返回该行（幂等复用，不重复写入）→ 否则写 `dq_reconciliations` 结果行（带 `cycle_id/issuer_id/market/attempt`）+ 需要的工作项（`reconcile_mismatch`/`reconcile_review`/`lineage_conflict`）+ 可见性变化（左侧 `ok` → `quarantined`，持 scope 锁、`state_rev+1`，并在项上写 `detail.hook={stage:'materialize', state:'pending'}`）+ 已隔离左侧的 `latest_result` 更新。**租约丢失后，此前已提交的键仍然有效**（它们是被接受时的有效结果），接手的工作者对这些键直接复用；只有尚未提交的工作被丢弃。成员完成 `complete_reconcile_member(p_fence)` 的三个计数**从该成员本周期已接受的结果行推导**（`compared` 且 `passed` / `compared` 且非 `passed` / 其他 outcome），三者之和必须 = `expected`，否则 `raise 'member_incomplete'`；不存在"标记 superseded"的步骤。

**`dq_calendar_passes` 与 `dq_calendar_pass_members`**（§6.2；T3 规定修法：每个冻结成员有持久化状态，全部遍写入经锁与租约校验）

```
dq_calendar_passes
  market text not null, pass_id uuid not null, started_at timestamptz not null, finished_at timestamptz,
  claimed_by uuid references ingest_batches(batch_id) on delete set null, claim_until timestamptz,   -- 每市场/每遍同一时刻一个持租工作者
  status text not null default 'running' check (status in ('running','complete','complete_with_failures')),
  primary key (market, pass_id)
  unique index (market) where finished_at is null
  constraint dcp_finished_iff_terminal check ((finished_at is null) = (status = 'running'))
dq_calendar_pass_members                                         -- 创建遍时冻结（范围内发行人）；遍进行中范围的增减进入下一遍
  market text not null, pass_id uuid not null, issuer_id uuid not null references issuers on delete restrict,
  state text not null default 'pending' check (state in ('pending','done','failed')),
  attempts int not null default 0 check (attempts >= 0), last_error text, done_at timestamptz,
  primary key (market, pass_id, issuer_id),
  foreign key (market, pass_id) references dq_calendar_passes(market, pass_id) on delete restrict
```

遍函数（`security definer`，仅 service_role）。**认领有自己的原子协议（U1）**：`claim_calendar_pass(p_market, p_batch) returns jsonb` 先 `pg_advisory_xact_lock(hashtext('dq_calendar_pass:'||p_market))` 串行化创建；锁住该市场未完成的遍（`for update`）；没有 → 建遍、冻结成员、租给 `p_batch`；有且租约空闲或已过期（`claim_until is null or claim_until < clock_timestamp()`）→ 接管（`claimed_by=p_batch`、`claim_until=clock_timestamp()+10 min`）；否则返回 null；成功返回令牌 `{market, pass_id, batch_id}`。**其余三个函数**先 `select … from dq_calendar_passes where (market, pass_id) = token for update` 并校验 `claimed_by = token.batch_id and claim_until > clock_timestamp() and finished_at is null`，否则 `raise 'fence_failed'`，无写入：`replace_filing_expectations(p_issuer, p_market, p_rows jsonb, p_pass_token jsonb)`（**唯一签名**，无三参数重载）：要求该成员属于本遍且 `state='pending'` 或 (`state='failed' and attempts < 3`)，原子替换该发行人该市场的期望行并把成员置 `done`（重试成功即移出失败，不存在第二次推进）；`fail_calendar_member(p_pass_token, p_issuer, p_error)`：`attempts+1`、`state='failed'`、`last_error`；`finish_calendar_pass(p_pass_token)`：只从持久化状态结算——无 `pending` 且无 `failed and attempts < 3` 时，全部 `done` → `complete`，否则 `complete_with_failures`，两种终态都写 `finished_at`；否则 `raise 'pass_incomplete'`。

**`issuer_filer_categories`**（§6.1：按财年的申报人类别，来自该财年 10-K 封面）

```
issuer_id uuid not null references issuers on delete restrict, fiscal_year int not null,
acceleration text not null check (acceleration in ('large_accelerated','accelerated','non_accelerated')),
smaller_reporting boolean, category_raw text not null,
source text not null check (source in ('ixbrl_dei')), accession text not null, evidence_sha256 text not null,
as_of date not null, primary key (issuer_id, fiscal_year)
```

**`dq_filing_expectations`**

```
issuer_id            uuid not null references issuers on delete restrict
market               text not null check (market in ('US','CN'))
report_kind          text not null check (report_kind in ('10-K','10-Q','20-F','40-F','annual','semiannual','q1','q3'))
period_end           date not null
period_end_estimated boolean not null default false
deadline_state       text not null check (deadline_state in ('statutory','estimated','no_rule'))
due_date             date
due_rule             text not null
expected_date        date                                  -- CN 预约日（同报告期）
upstream_lookup      text not null check (upstream_lookup in ('ok','unavailable','not_applicable'))
upstream_filed_date  date
disclosure_state     text not null check (disclosure_state in ('pending','overdue','filed_not_ingested','received','received_late','unknown_upstream'))
received_filing_id   uuid
received_date        date
profile_as_of        date
detail               jsonb not null default '{}' check (jsonb_typeof(detail)='object')
computed_at          timestamptz not null
batch_id             uuid not null references ingest_batches on delete restrict
primary key (issuer_id, market, report_kind, period_end)
index (market, disclosure_state, due_date)
constraint dfe_due_iff_known check ((due_date is null) = (deadline_state = 'no_rule'))
constraint dfe_received_iff check ((disclosure_state in ('received','received_late')) = (received_filing_id is not null and received_date is not null))
constraint dfe_late_requires_due check (disclosure_state <> 'received_late' or due_date is not null)
constraint dfe_overdue_requires_statutory check (disclosure_state <> 'overdue' or deadline_state = 'statutory')
constraint dfe_unknown_upstream_iff check ((disclosure_state = 'unknown_upstream') = (upstream_lookup = 'unavailable' and received_filing_id is null))
```

`deadline_state` 与 `disclosure_state` 正交：`no_rule` 行照样可以 `received`。`estimated` 行永不 `overdue`（约束），到期未收到显示为 `pending` 加 `detail.estimated_due_passed=true`。

**`issuer_filing_profiles`**

```
issuer_id uuid not null references issuers on delete restrict, market text not null check (market in ('US','CN')),
category_raw_current text,               -- submissions.category 原文，仅供参考与 sec.filer_category 对账，不决定期限
regime text not null check (regime in ('10-K','20-F','40-F','cn')),
fiscal_year_end text check (fiscal_year_end ~ '^(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])$'),
week52_pattern boolean not null default false, source text not null, source_sha256 text, as_of date not null, updated_at timestamptz not null default now(),
primary key (issuer_id, market)
```

**`dq_freshness`**：`expected_cadence` 枚举加 `'weekly'`（`alter table … drop constraint … add constraint … check (expected_cadence in ('daily','weekly','monthly','quarterly','event'))`）；`freshness.ts` 的 `WINDOW_MS.weekly = 7d`、`GRACE_MS.weekly = 2d`。

**函数 `resolve_identifier_claim(p_id uuid, p_status text, p_resolved_by uuid, p_amend jsonb default null) returns jsonb`**（`security definer set search_path = public`，仅 service_role）：`select … for update` 声明行；非 `pending` → `raise 'already_resolved'`；`op='legacy'` → `raise 'legacy_claim'`；`op='evidence_only'` 且 `p_status='accepted'` → 要求 `p_amend` 把它改写为可执行 op（§4.2.1 修订规则），否则 `raise 'amend_required'`；校验 `detail` 符合 `claim/1` 模式、`detail.target.issuer_id = issuer_id`、`(op, id_type)` 配对合法（表 §4.2.1）；`rejected` → 只改状态；`accepted` → 在同一事务按 op 执行业务写入（每个分支为静态 SQL，目标发行人必须 `status='active'`；每个写入要求 `get diagnostics row_count = 1`，否则抛对应码回滚）并把 `detail.provenance_written`（白名单键）同时写入目标行的 `provenance`；成功写 `status/resolved_by/resolved_at`，返回 `{op, applied}`。

**拓扑写入的唯一入口**：`issuers.status/merged_into` 的任何改变只能经迁移二的 `set_merge`/`set_dissolved`（§3.2）。迁移一先加触发器 `issuers_topology_guard`（`before update of status, merged_into`）：**`current_setting('entities.allow_topology_write', true) IS DISTINCT FROM 'on'` 时抛 `23514 topology_write_forbidden`**（S1 规定修法：设置缺失返回 NULL 也必须拒绝）；两个拓扑函数在进入时保存原值 `prev := current_setting('entities.allow_topology_write', true)`，`set_config('entities.allow_topology_write','on',true)`，并在**所有返回路径**（正常返回与 `exception … when others` 块内）恢复 `set_config('entities.allow_topology_write', coalesce(prev,''), true)` 后再返回或重新抛出。测试（§9.2）：在全新连接上直接 `update issuers set merged_into=…` 被拒；在同一事务内先成功调用 `set_merge` 再直接 update 也被拒。计划一的 `issuers_merge_target_active` 与 `issuers_retire_requires_closed_securities` 触发器保持不变，仍在函数内生效。runbook §1.1 的手工 SQL 合并改为：手工关闭/转移证券 → `set_merge`。在迁移二落地前（无 `fact_sync_scope` 表），迁移一只装触发器，合并暂不可执行（计划二落地前本来也没有事实需要谱系）。

本迁移的全部新表（`dq_reconcile_cycles`、`dq_reconcile_cursor`、`dq_calendar_passes`、`dq_filing_expectations`、`issuer_filing_profiles`、`issuer_filer_categories`）与 `issuer_identifier_claims` 为 service-role only。

**桶 `reconcile-raw`**：MIME 加 `application/pdf`；`upsert:false`，`409` 视为已存在（内容寻址，不可变）；上传失败 → 该发行人/该文件的处理 `failed`，不写依赖它的行。存：主文档、submissions JSON 与分页、HKEX 名单、GLEIF 子集（记原文件 sha256/大小）、OpenFIGI 请求与响应、Tushare `disclosure_date` 响应、黄金集引用的年报 PDF（抄录人用 `scripts/dq/gold-pdf.ts --upload` 上传，脚本校验 sha256 与 json 一致）。集成测试：anon/authenticated 不能读写该桶。

### 3.2 `20261107091000_facts_extensions.sql`（依赖规格二 `20261106090000`）

**`filings` 新列**：`accepted_at timestamptz`、`acceptance_source text check (… in ('sec_submissions'))`，`(accepted_at is null) = (acceptance_source is null)`；`filings_limited_update` 允许集加这两列且只允许 `null → 非 null`；**任何应用角色都不得直接 update `accepted_at`/`acceptance_source`**（只经 `set_filing_acceptance`）；保留 service_role 对 `document_ref/document_url/link_attempts` 的列级 update（计划二 `updateFilingLink`）与 `mapping_gen` 只经函数、只增（T11）。

**`financial_metrics`**：`based_on_lineage jsonb not null default '[]'`；首次加列时 `update financial_metrics set based_on_lineage = jsonb_build_array(jsonb_build_object('issuer_id', issuer_id, 'state_rev', based_on_rev))`；约束 `jsonb_array_length(based_on_lineage) >= 1`（加约束前回填）。规格二的 `replace_financial_metrics(uuid,text,bigint,jsonb)` 保留为兼容包装：`select replace_financial_metrics_lineage(issuer, market, jsonb_build_array({issuer, based_on_rev}), rows)`，签名不变，`based_on_lineage` 因此总是一致。`MetricRow`、`metricFromTable`、三种 `FactsDb` 实现与分页指标读取的一致性检查都保留并比较**完整** `based_on_lineage` 向量（不只 `based_on_rev`）（T8）。

**资格谓词加在共享助手 `fact_promote_rows(uuid,text,uuid[])`**（T6 规定修法；`create or replace`，保留落地的全部谓词与其 `revoke execute … from public, anon, authenticated, service_role`）：若该行曾属于某个已处理的 `lineage_conflict` 项，则必须在该项 `detail.chosen_fact_ids` 内；若该行有 open 的、或已处理但 `(detail->'latest_result'->>'passed')::boolean IS DISTINCT FROM true` 的 `reconcile_mismatch` 项引用，则不提升（恢复只能经 `restore_reconciled`；缺 `latest_result` 视为未通过）。`promote_quarantined` 保持为加锁/递增 rev 的包装；`resolve_facts_quarantine`、`restore_reconciled` 都经该助手提升。集成测试覆盖每个提升入口（`promote_quarantined`、`resolve_facts_quarantine`、`restore_reconciled`）。
-- set_security_identifier is the only writer of issuer_securities.isin/figi outside resolve_identifier_claim
-- (identifiers/apply.ts, Task 4a). It share-locks the issuer (resolve_identifier_claim's order: issuer, then
-- security), locks the open row (issuer, ticker, valid_from, valid_to null) and
-- in ONE UPDATE writes the column (only when empty) and merges the single provenance key with
-- `provenance || p_provenance` — never a whole-object replacement — so a concurrent write of the other
-- column, or a claim resolution (which also merges with ||), keeps its key. p_provenance must carry
-- exactly the key p_column. Outcomes: 'written' (the column was empty), 'duplicate' (the same value is
-- stored; a missing provenance key is completed in the same UPDATE), 'conflict' (another value is
-- stored; nothing written — the caller files correct_identifier), 'not_found' (no open row). ISIN
-- uniqueness / no-overlap violations (23505 / 23P01) pass through unchanged.
create or replace function public.set_security_identifier(p_issuer uuid, p_ticker text, p_valid_from date, p_column text, p_value text, p_provenance jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare v_cur text; v_prov jsonb; n int;
begin
  if p_column is null or p_column not in ('isin', 'figi') or coalesce(p_value, '') = ''
     or p_provenance is null or jsonb_typeof(p_provenance) <> 'object'
     or (select array_agg(k) from jsonb_object_keys(p_provenance) k) is distinct from array[p_column] then
    raise exception 'invalid_identifier_write' using errcode = '22023';
  end if;
  -- Same order as resolve_identifier_claim (issuer, then security row): FOR SHARE conflicts with its FOR UPDATE.
  perform 1 from public.issuers where issuer_id = p_issuer for share;
  if not found then return 'not_found'; end if;
  select case when p_column = 'isin' then s.isin else s.figi end, s.provenance into v_cur, v_prov
  from public.issuer_securities s
  where s.issuer_id = p_issuer and s.ticker = p_ticker and s.valid_from = p_valid_from and s.valid_to is null
  for update;
  if not found then return 'not_found'; end if;
  if v_cur is not null and v_cur <> p_value then return 'conflict'; end if;
  if v_cur = p_value and coalesce(v_prov ? p_column, false) then return 'duplicate'; end if;
  if p_column = 'isin' then
    update public.issuer_securities set isin = p_value, provenance = provenance || p_provenance
    where issuer_id = p_issuer and ticker = p_ticker and valid_from = p_valid_from and valid_to is null and isin is not distinct from v_cur;
  else
    update public.issuer_securities set figi = p_value, provenance = provenance || p_provenance
    where issuer_id = p_issuer and ticker = p_ticker and valid_from = p_valid_from and valid_to is null and figi is not distinct from v_cur;
  end if;
  get diagnostics n = row_count;
  if n <> 1 then return 'conflict'; end if;   -- the value moved between the read and the write
  return case when v_cur is null then 'written' else 'duplicate' end;
end $$;
revoke execute on function public.set_security_identifier(uuid, text, date, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.set_security_identifier(uuid, text, date, text, text, jsonb) to service_role;

-- ---------------------------------------------------------------- topology guard (§3.1, S1)
-- issuers.status/merged_into change only inside set_merge/set_dissolved (migration two), which switch
-- the transaction-local setting on and restore it on every exit path. A never-defined setting reads
-- NULL and the '' left after such a transaction both differ from 'on' and are refused (IS DISTINCT
-- FROM). The WHEN clause skips same-value writes. Named so it fires after the plan-1 lifecycle
-- triggers (BEFORE triggers run in name order), which keep reporting their own errors. A tripwire,
-- not a privilege boundary: any role can set the GUC. Inserts are guarded too (plan 3 接口对齐记录 #7):
-- an issuer born with status <> 'active' or merged_into set would add a lineage member without
    72	  prov:{source:'openfigi',as_of:asOf,evidence_sha256:r.evidence.response_sha256,job:jobOf(r.job),level:g.level},
    73	 });
    74	 const multiFigi=(row:SecRow,r:Extract<FigiJobResult,{status:'ok'}>,groups:FigiGroup[])=>{
    75	  figiClaimed.add(keyOf(row));
    76	  out.skipped.push('figi_multiple_groups');
    77	  if(groups.some(g=>g.figi===row.figi)){out.duplicates++;return;}
    78	  const note=`one of ${groups.length} candidate FIGIs: ${groups.map(g=>`${g.figi}(${g.level})`).join(', ')}`;
    79	  // spec §4.1.2 "detail.candidates 全部列出": every per-group claim carries the full sorted list in params.candidates
    80	  // (Part A validateClaimDetail/identifier_claim_problem allow params.candidates for set_identifier/correct_identifier).
    81	  const candidates=groups.map(g=>({figi:g.figi,level:g.level}));
    82	  for(const g of groups){
    83	   const p=figiProposal(r,g);
    84	   const op:Op=row.figi===null?'set_identifier':'correct_identifier';
    85	   claim({issuer_id:row.issuer_id,id_type:'figi',value:g.figi,source:'openfigi',op,kind:'provider_mapping',target:targetOf(row),
    86	    params:op==='set_identifier'?{candidates}:{expected_current:row.figi,new_value:g.figi,candidates},evidence:{...p.evidence,note},written:sanitizeProvenance({figi:p.prov})});
    87	  }
    88	 };
    89	
    90	 // Stage B: ISIN (from GLEIF, stage A) → OpenFIGI → (issuer via LEI, normalized ticker).
    91	 if(stages.has('B')&&input.gleif){
    92	  for(const iss of input.issuers){
    93	   if(!iss.lei)continue;
    94	   for(const isin of input.gleif.byLei.get(iss.lei)??[]){
    95	    const r=input.isinResults.get(isin);
    96	    if(!r){out.skipped.push('figi_not_queried');continue;}
    97	    if(r.status!=='ok'){out.skipped.push(`openfigi_${r.status}`);continue;}
    98	    const g=groupFigiResults(r.records);
    99	    out.skipped.push(...g.skipped);
   100	    const locator=`gleif:${iss.lei},${isin};openfigi:${r.evidence.response_sha256}#${r.evidence.index}`;
   101	    const evidence:ClaimEvidence={source:'gleif_openfigi',as_of:asOf,evidence_sha256:input.gleif.sha256,locator};
   102	    const isinProposal:Proposal={value:isin,source:'gleif_openfigi',kind:'provider_mapping',evidence,prov:{source:'gleif_openfigi',as_of:asOf,evidence_sha256:input.gleif.sha256,locator}};
   103	    for(const c of g.candidates){
   104	     const own=runRows.find(x=>x.issuer_id===iss.issuer_id&&x.ticker===c.ticker);
   105	     if(own){
   106	      propose(own,'isin',isinProposal);
   107	      if(c.groups.length===1)propose(own,'figi',figiProposal(r,c.groups[0]));
   108	      else multiFigi(own,r,c.groups);
   109	      continue;
   110	     }
   111	     if(!input.universe.has(c.ticker)){out.skipped.push('ticker_not_in_universe');continue;}
   112	     const owner=openOwner.get(c.ticker);
   113	     if(owner===undefined&&c.market==='HK'&&holdsA.has(iss.issuer_id)){
   114	      out.ahCandidates.push({issuer_id:iss.issuer_id,ticker:c.ticker,isin,evidence});out.skipped.push('ah_link_candidate');continue;
   115	     }
   116	     claim({issuer_id:iss.issuer_id,id_type:'ticker',value:c.ticker,source:'gleif_openfigi',op:'attach_security',kind:'provider_mapping',target:{issuer_id:iss.issuer_id},
   117	      params:{share_class:'unknown',valid_from:asOf,valid_from_method:'first_observed',source:'gleif_openfigi',isin},
   118	      // an ISIN can map to several tickers (Tencent: 00700.HK, 80700.HK, TCTZF): this one is only a co-mapping, so the reviewer must confirm it is the issuer's own listing
   119	      evidence:{...evidence,note:`ticker ${c.ticker} co-mapped by ISIN ${isin}; listing not confirmed`}});
   120	     if(owner!==undefined)out.quarantines.push({naturalKey:`${c.ticker}:${asOf}`,reasonCode:'ownership_conflict',
   121	      detail:{reason:'ticker_owned_by_other_issuer',stage:'B',owner_issuer_id:owner},payload:{issuer_id:iss.issuer_id,ticker:c.ticker,isin}});
   122	    }
   123	   }
   124	  }
   125	 }
   126	
   127	 // Stage D: HKEX is the primary ISIN source for .HK rows; stage-B values are compared, not written.
   128	 if(stages.has('D')){
   129	  if(!input.hkex||input.hkex.size===0)out.skipped.push('hkex_no_isin');
   130	  else for(const row of runRows){
   131	   const m=/^(\d{5})\.HK$/.exec(row.ticker);
   132	   if(!m)continue;
   133	   const hk=input.hkex.get(m[1]);
   134	   if(!hk){out.skipped.push('hkex_code_not_listed');continue;}
   135	   const source=`hkex_${hk.file}`,locator=`${hk.file}:row:${hk.row}`;
   136	   const evidence:ClaimEvidence={source,as_of:asOf,evidence_sha256:hk.sha256,locator};
   137	   const k=`${keyOf(row)}|isin`;
   138	   for(const b of proposals.get(k)?.list??[]){
   139	    out.recons.push({naturalKey:`${row.ticker}:${row.valid_from}`,passed:b.value===hk.isin,leftText:b.value,rightText:hk.isin,leftSource:b.source,rightSource:source,
   140	     detail:{left:{evidence_sha256:b.evidence.evidence_sha256,locator:b.evidence.locator},right:{document:hk.file,sha256:hk.sha256,locator:`row:${hk.row}`}}});
   141	    if(b.value!==hk.isin)claim({issuer_id:row.issuer_id,id_type:'isin',value:b.value,source:b.source,op:'correct_identifier',kind:b.kind,target:targetOf(row),
   142	     params:{expected_current:hk.isin,new_value:b.value},evidence:b.evidence,written:sanitizeProvenance({isin:b.prov})});
   143	   }
   144	   proposals.set(k,{row,col:'isin',list:[{value:hk.isin,source,kind:'official_list',evidence,prov:{source,as_of:asOf,evidence_sha256:hk.sha256,locator}}]});
   145	  }
   146	 }
   147	
   148	 // Stage C: TICKER → FIGI for rows that still have none.
   149	 const hasFigi=(row:SecRow)=>row.figi!==null||proposals.has(`${keyOf(row)}|figi`)||figiClaimed.has(keyOf(row));
   150	 if(stages.has('C')){
   151	  for(const row of runRows){
   152	   if(hasFigi(row))continue;
   153	   const r=input.tickerResults.get(row.ticker);
   154	   if(!r)continue;
   155	   if(r.status!=='ok'){out.skipped.push(r.status==='not_found'?'figi_not_found':'openfigi_error');continue;}
   156	   const g=groupFigiResults(r.records);
   157	   out.skipped.push(...g.skipped);
   158	   const c=g.candidates.find(x=>x.ticker===row.ticker);
   159	   if(!c){out.skipped.push('figi_not_found');continue;}
   160	   if(c.groups.length===1)propose(row,'figi',figiProposal(r,c.groups[0]));
   161	   else multiFigi(row,r,c.groups);
   162	  }
   163	 }
   164	 out.figiMissing=[...new Set(runRows.filter(r=>!hasFigi(r)&&!input.tickerResults.has(r.ticker)).map(r=>r.ticker))].sort();
   165	
   166	 // Resolve proposals against the stored values.
   167	 for(const {row,col,list} of proposals.values()){
   168	  const current=row[col];
   169	  if(list.length>1){
   170	   out.skipped.push(`ambiguous_${col}`);
   171	   for(const p of list){
   172	    if(current===p.value)continue;
   173	    const op:Op=current===null?'set_identifier':'correct_identifier';
   174	    claim({issuer_id:row.issuer_id,id_type:col,value:p.value,source:p.source,op,kind:p.kind,target:targetOf(row),
   175	     params:op==='set_identifier'?{}:{expected_current:current,new_value:p.value},evidence:p.evidence,written:sanitizeProvenance({[col]:p.prov})});
   176	   }
   177	   continue;
   178	  }
   179	  const p=list[0];
   180	  const patch=sanitizeProvenance({[col]:p.prov});
   181	  const write=(kind:SecurityWrite['kind'])=>out.writes.push({kind,...targetOf(row),column:col,value:p.value,patch,source:p.source,evidenceKind:p.kind,evidence:p.evidence});
   182	  if(current===null){write('set');continue;}
   183	  if(current===p.value){if(col in row.provenance)out.duplicates++;else write('provenance');continue;}
   184	  claim({issuer_id:row.issuer_id,id_type:col,value:p.value,source:p.source,op:'correct_identifier',kind:p.kind,target:targetOf(row),
   185	   params:{expected_current:current,new_value:p.value},evidence:p.evidence,written:patch});
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

codex
The planner can automatically write an ambiguous FIGI and generate correction claims whose expected value was never stored. Both defects undermine the guarded identifier-review workflow.

Full review comments:

- [P2] Combine FIGI candidates across all ISIN results before writing — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/entities/identifiers/plan.ts:105-108
  When two ISINs map to the same security, one result can propose a single FIGI while another supplies multiple conflicting FIGIs. `multiFigi` files claims but does not invalidate the single-value proposal, so the final resolution still automatically writes that FIGI. This bypasses the ambiguity safeguard and leaves the other `set_identifier` claims immediately unresolvable against the now-filled column. Aggregate candidates across results, or suppress automatic FIGI writes for rows marked ambiguous.

- [P2] Base HKEX disagreement claims on the actual stored ISIN — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/entities/identifiers/plan.ts:141-142
  When a Hong Kong row already contains an ISIN different from HKEX's, the guarded writer will not replace it, but this claim nevertheless assumes HKEX's value is stored. For example, if the stored value already equals the GLEIF value, this creates an unnecessary reverse correction alongside the legitimate HKEX correction; accepting the former fails with `value_conflict`. The same invalid expectation occurs if an initially empty row's HKEX write fails ownership validation. Build correction claims against the actual stored value after applying the preferred proposal, and avoid filing corrections to an already-stored value.
The planner can automatically write an ambiguous FIGI and generate correction claims whose expected value was never stored. Both defects undermine the guarded identifier-review workflow.

Full review comments:

- [P2] Combine FIGI candidates across all ISIN results before writing — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/entities/identifiers/plan.ts:105-108
  When two ISINs map to the same security, one result can propose a single FIGI while another supplies multiple conflicting FIGIs. `multiFigi` files claims but does not invalidate the single-value proposal, so the final resolution still automatically writes that FIGI. This bypasses the ambiguity safeguard and leaves the other `set_identifier` claims immediately unresolvable against the now-filled column. Aggregate candidates across results, or suppress automatic FIGI writes for rows marked ambiguous.

- [P2] Base HKEX disagreement claims on the actual stored ISIN — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/entities/identifiers/plan.ts:141-142
  When a Hong Kong row already contains an ISIN different from HKEX's, the guarded writer will not replace it, but this claim nevertheless assumes HKEX's value is stored. For example, if the stored value already equals the GLEIF value, this creates an unnecessary reverse correction alongside the legitimate HKEX correction; accepting the former fails with `value_conflict`. The same invalid expectation occurs if an initially empty row's HKEX write fails ownership validation. Build correction claims against the actual stored value after applying the preferred proposal, and avoid filing corrections to an already-stored value.

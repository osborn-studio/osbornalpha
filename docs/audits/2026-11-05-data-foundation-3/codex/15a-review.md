OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b12e-e952-7ac3-8416-2c048a1a83b9
--------
user
commit 46a40f3
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 46a40f3; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 2384ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-wFr2SX4U' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-5PSQunOk' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/15a-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-EocL9LhK' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-RFQUQJPm' (errno=Operation not permitted)
46a40f3 feat(dq): US iXBRL sample manifest and companyfacts-vs-iXBRL pair, 02:00 UTC reconcile cron
 src/app/api/cron/reconcile/route.test.ts   |  15 ++-
 src/app/api/cron/reconcile/route.ts        |   2 +-
 src/lib/dq/reconcile/pair-us-ixbrl.test.ts | 152 +++++++++++++++++++++++
 src/lib/dq/reconcile/pair-us-ixbrl.ts      | 186 +++++++++++++++++++++++++++++
 src/lib/dq/reconcile/pairs.ts              |   4 +-
 src/lib/dq/reconcile/us-sample.test.ts     |  81 +++++++++++++
 src/lib/dq/reconcile/us-sample.ts          | 144 ++++++++++++++++++++++
 vercel.json                                |   4 +
 8 files changed, 582 insertions(+), 6 deletions(-)

exec
/bin/zsh -lc 'pwd; ls -a | head -35; for p in /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do if test -f "$p"; then echo "$p"; cat "$p"; fi; done; git show 46a40f3 -- src/lib/dq/reconcile src/app/api/cron/reconcile vercel.json' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
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
git: error: couldn't create cache file '/tmp/xcrun_db-NspFtIko' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-rDbpLw00' (errno=Operation not permitted)
commit 46a40f3ae64ab54dc4434ba8d4e0d628c0b8fa2e
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 06:06:27 2026 -0800

    feat(dq): US iXBRL sample manifest and companyfacts-vs-iXBRL pair, 02:00 UTC reconcile cron
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/app/api/cron/reconcile/route.test.ts b/src/app/api/cron/reconcile/route.test.ts
index ed72d66..cc138f8 100644
--- a/src/app/api/cron/reconcile/route.test.ts
+++ b/src/app/api/cron/reconcile/route.test.ts
@@ -1,12 +1,13 @@
 // src/app/api/cron/reconcile/route.test.ts
 import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
 
-const mocks=vi.hoisted(()=>({run:vi.fn(),deps:vi.fn(),codeVersion:vi.fn()}));
+const mocks=vi.hoisted(()=>({run:vi.fn(),deps:vi.fn(),codeVersion:vi.fn(),hidden:new Set<string>()}));
 vi.mock('@/lib/dq/reconcile/run',async importOriginal=>({...(await importOriginal<typeof import('@/lib/dq/reconcile/run')>()),runReconcile:mocks.run}));
 vi.mock('@/lib/dq/reconcile/deps',()=>({productionReconcileDeps:mocks.deps,cnPairEnabled:(pair:string)=>!pair.startsWith('cn.')||process.env.FACTS_CN_ENABLED==='1'}));
-vi.mock('@/lib/dq/reconcile/pairs',async importOriginal=>{const o=await importOriginal<typeof import('@/lib/dq/reconcile/pairs')>();return {...o,RECONCILE_PAIRS:{...o.RECONCILE_PAIRS,'cn.tushare_vs_cninfo_pdf_gold':{id:'cn.tushare_vs_cninfo_pdf_gold'}}};});   // a CN pair registered (as Task 16a will) so the gate is reached
+vi.mock('@/lib/dq/reconcile/pairs',async importOriginal=>{const o=await importOriginal<typeof import('@/lib/dq/reconcile/pairs')>();return {...o,RECONCILE_PAIRS:new Proxy({...o.RECONCILE_PAIRS,'cn.tushare_vs_cninfo_pdf_gold':{id:'cn.tushare_vs_cninfo_pdf_gold'}} as Record<string,unknown>,{get:(t,k)=>typeof k==='string'&&mocks.hidden.has(k)?undefined:t[k as string]})};});   // a CN pair registered (as Task 16a will) so the gate is reached
 vi.mock('@/lib/facts/deps',()=>({resolveCodeVersion:mocks.codeVersion}));
 
+import {readFileSync} from 'node:fs';
 import {GET,POST} from './route';
 import {ReconcileError} from '@/lib/dq/reconcile/run';
 
@@ -17,7 +18,7 @@ const receipt={batchId:'b',status:'success',counts:{fetched:2,inserted:2,duplica
 
 describe('reconcile cron',()=>{
  beforeEach(()=>{
-  vi.clearAllMocks();process.env.CRON_SECRET='cron-secret';delete process.env.FACTS_CN_ENABLED;
+  vi.clearAllMocks();mocks.hidden.clear();process.env.CRON_SECRET='cron-secret';delete process.env.FACTS_CN_ENABLED;
   mocks.codeVersion.mockReturnValue('abc123');mocks.deps.mockReturnValue({tag:'deps'});mocks.run.mockResolvedValue(receipt);
  });
  afterEach(()=>{
@@ -39,11 +40,17 @@ describe('reconcile cron',()=>{
   }
   expect(mocks.run).not.toHaveBeenCalled();
  });
- it('answers 400 for a cycle pair that is not registered yet (US iXBRL until Task 15a) and does not run it',async()=>{
+ it('answers 400 for a cycle pair that is not registered and does not run it',async()=>{
+  mocks.hidden.add('us.companyfacts_vs_ixbrl');
   const res=await GET(req('pair=us.companyfacts_vs_ixbrl',AUTH));
   expect(res.status).toBe(400);expect((await res.json()).error.code).toBe('invalid_parameter:pair');
   expect(mocks.run).not.toHaveBeenCalled();
  });
+ it('vercel.json schedules the US iXBRL pair at 02:00 UTC and never a CN pair',()=>{
+  const crons=(JSON.parse(readFileSync('vercel.json','utf8')) as {crons:{path:string;schedule:string}[]}).crons;
+  expect(crons).toContainEqual({path:'/api/cron/reconcile?pair=us.companyfacts_vs_ixbrl',schedule:'0 2 * * *'});
+  expect(crons.some(c=>c.path.includes('pair=cn.'))).toBe(false);
+ });
  it('refuses a registered CN pair with exactly 403 cn_disabled unless FACTS_CN_ENABLED=1, then runs it',async()=>{
   for(const v of [undefined,'0','true']){
    if(v===undefined)delete process.env.FACTS_CN_ENABLED;else process.env.FACTS_CN_ENABLED=v;
diff --git a/src/app/api/cron/reconcile/route.ts b/src/app/api/cron/reconcile/route.ts
index 32bdd12..4d2db19 100644
--- a/src/app/api/cron/reconcile/route.ts
+++ b/src/app/api/cron/reconcile/route.ts
@@ -3,7 +3,7 @@
 // /api/cron/facts-sync: CRON_SECRET bearer (constant-time), maxDuration 300 with a 240 s deadline handed to
 // the runner (which starts a member only with >= 60 s left), a missing code_version refuses the run. The pair
 // must be given once and be a REGISTERED cycle pair; cn.* pairs are refused unless FACTS_CN_ENABLED=1 (no
-// Tushare token, no verified gold yet; vercel.json schedules lineage 04:00 UTC only; the US iXBRL entry (02:00) is added with its pair in Task 15a).
+// Tushare token, no verified gold yet; vercel.json schedules US iXBRL 02:00 and lineage 04:00 UTC).
 // A duplicate cron delivery is harmless: cursor claims are fenced, a second worker finds nothing claimable.
 // The HTTP receipt carries codes, keys and counts only — never error messages or dry-run results.
 import {timingSafeEqual} from 'node:crypto';
diff --git a/src/lib/dq/reconcile/pair-us-ixbrl.test.ts b/src/lib/dq/reconcile/pair-us-ixbrl.test.ts
new file mode 100644
index 0000000..ce36c9f
--- /dev/null
+++ b/src/lib/dq/reconcile/pair-us-ixbrl.test.ts
@@ -0,0 +1,152 @@
+// src/lib/dq/reconcile/pair-us-ixbrl.test.ts
+import {randomUUID} from 'node:crypto';
+import {describe,expect,it,vi} from 'vitest';
+import {memoryFactsDb} from '../../facts/memory-facts-db';
+import {makeBudget} from '../../facts/sync';
+import {memoryRawStore} from '../raw-store';
+import {computeInputsHash} from './inputs-hash';
+import {IXBRL_PARSER_VERSION} from './ixbrl';
+import {sha256Hex} from './pair-support';
+import type {PairRunContext} from './pair-support';
+import {filerClass,usCompanyfactsVsIxbrlPair} from './pair-us-ixbrl';
+import {RECONCILE_PAIRS,inputsHashNow} from './pairs';
+import {reconcileTables,seedPublished} from './testing';
+import {US_SAMPLE_PATH,US_SAMPLE_SCHEMA} from './us-sample';
+import type {SampleKey,UsSample} from './us-sample';
+
+const CIK='9990300',ACCN='0009990300-25-000001',UNLINKED='0009990300-25-000009';
+const URL1=`https://www.sec.gov/Archives/edgar/data/${CIK}/000999030025000001/zix-20241231.htm`,URL2=`https://www.sec.gov/Archives/edgar/data/${CIK}/000999030025000009/zix-q.htm`;
+const D={period_start:'2024-01-01',period_end:'2024-12-31'},I={period_start:null,period_end:'2024-12-31'};
+const k=(concept:string,p:{period_start:string|null;period_end:string},source_concept:string,origin:SampleKey['origin']):SampleKey=>({concept,...p,unit:'USD',source_concept,origin});
+const KEYS:SampleKey[]=[
+ k('revenue',D,'us-gaap:Revenues','both'),               // tag fallback in the document → passed, tag_mismatch
+ k('net_income_parent',D,'us-gaap:NetIncomeLoss','both'), // equal → passed
+ k('total_assets',I,'us-gaap:Assets','both'),            // 5000 vs 5001 → quarantine_left
+ k('equity_parent',I,'us-gaap:StockholdersEquity','both'),// two values in the document → right_ambiguous
+ k('operating_income',D,'us-gaap:OperatingIncomeLoss','left'),   // xsi:nil in the document → unsupported(nil)
+ k('cost_of_revenue',D,'us-gaap:CostOfRevenue','right'), // only in the document → left_missing
+ k('rd_expense',D,'us-gaap:ResearchAndDevelopmentExpense','left'),// only in companyfacts → right_missing
+];
+const filing=(accn:string,url:string,keys:SampleKey[],o:Partial<UsSample['issuers'][0]['filings'][0]>={})=>({accn,form:'10-K',period_end:'2024-12-31',primary_document:url.split('/').pop()!,doc_url:url,is_inline_xbrl:true,submissions_category:'Large accelerated filer',raw_sha256:'a'.repeat(64),doc_sha256:'b'.repeat(64),expected_keys:keys,...o});
+const sample=(filings:ReturnType<typeof filing>[]):UsSample=>({schema:US_SAMPLE_SCHEMA,generated_at:'2026-11-05T00:00:00Z',selection:'fixture/1',issuers:[{cik:CIK,ticker:'ZIX',regime:'10-K',filings}]});
+const H='<html xmlns="http://www.w3.org/1999/xhtml" xmlns:ix="http://www.xbrl.org/2013/inlineXBRL" xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:iso4217="http://www.xbrl.org/2003/iso4217" xmlns:us-gaap="http://fasb.org/us-gaap/2024" xmlns:dei="http://xbrl.sec.gov/dei/2024" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">';
+const ctx=(id:string,period:string)=>`<xbrli:context id="${id}"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">000${CIK}</xbrli:identifier></xbrli:entity><xbrli:period>${period}</xbrli:period></xbrli:context>`;
+const nf=(name:string,c:string,v:string,extra='')=>`<ix:nonFraction name="us-gaap:${name}" contextRef="${c}" unitRef="usd" ${extra}>${v}</ix:nonFraction>`;
+const docOf=(assets:string)=>new TextEncoder().encode(`${H}<body><ix:header><ix:resources>${ctx('d','<xbrli:startDate>2024-01-01</xbrli:startDate><xbrli:endDate>2024-12-31</xbrli:endDate>')}${ctx('i','<xbrli:instant>2024-12-31</xbrli:instant>')}${ctx('i2','<xbrli:instant>2024-12-31</xbrli:instant>')}<xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit></ix:resources></ix:header>`
+ +'<ix:nonNumeric name="dei:EntityFilerCategory" contextRef="d">Large Accelerated Filer</ix:nonNumeric>'
+ +nf('RevenueFromContractWithCustomerExcludingAssessedTax','d','1,000')+nf('NetIncomeLoss','d','100')+nf('Assets','i',assets)+nf('StockholdersEquity','i','2,000')+nf('StockholdersEquity','i2','2,001')
+ +nf('OperatingIncomeLoss','d','','xsi:nil="true"')+nf('CostOfRevenue','d','700')+'</body></html>');
+
+async function setup(o:{sample:UsSample;docs:Record<string,Uint8Array|number>}){
+ const tables=reconcileTables();const db=memoryFactsDb(tables);
+ const issuer=randomUUID();
+ await tables.insert('issuers',{issuer_id:issuer,status:'active',merged_into:null,cik:CIK});
+ // generation 1 carries a stale revenue; generation 2 (active) carries the full set → binding uses generation 2 only (T1)
+ await seedPublished(db,{issuer,market:'US',sourceRef:ACCN,availableDate:'2025-02-15',facts:[{concept:'revenue',value:'999',...D,source_concept:'us-gaap:Revenues'}]});
+ const g2=await seedPublished(db,{issuer,market:'US',sourceRef:ACCN,availableDate:'2025-02-15',mappingGen:2,facts:[
+  {concept:'revenue',value:'1000',...D,source_concept:'us-gaap:Revenues'},{concept:'net_income_parent',value:'100',...D,source_concept:'us-gaap:NetIncomeLoss'},
+  {concept:'total_assets',value:'5000',...I,source_concept:'us-gaap:Assets'},{concept:'equity_parent',value:'2000',...I,source_concept:'us-gaap:StockholdersEquity'},
+  {concept:'operating_income',value:'300',...D,source_concept:'us-gaap:OperatingIncomeLoss'},{concept:'rd_expense',value:'50',...D,source_concept:'us-gaap:ResearchAndDevelopmentExpense'}]});
+ const sampleBytes=new TextEncoder().encode(JSON.stringify(o.sample));
+ const fetch=vi.fn(async(url:string)=>{const d=o.docs[url];return typeof d==='number'?new Response('',{status:d}):d?new Response(new Uint8Array(d),{status:200}):new Response('',{status:404});});   // an owned Uint8Array<ArrayBuffer> is a DOM BodyInit (TS 5.9; plan audit P10)
+ const raw=memoryRawStore();
+ const c:PairRunContext={db,tables,raw,now:()=>new Date('2026-11-05T00:00:00Z'),budget:makeBudget(null),fetch:fetch as unknown as typeof globalThis.fetch,
+  readRepoFile:async p=>{if(p!==US_SAMPLE_PATH)throw new Error(p);return sampleBytes;},batchId:randomUUID(),dryRun:false};
+ const facts=new Map((await db.factsByIds(g2.factIds)).map(f=>[f.concept,f]));
+ return {tables,db,issuer,c,fetch,raw,facts,sampleSha:sha256Hex(sampleBytes)};
+}
+
+describe('us.companyfacts_vs_ixbrl',()=>{
+ it('is registered with its sample and parser version',()=>{
+  expect(RECONCILE_PAIRS['us.companyfacts_vs_ixbrl']?.inputs).toEqual({repoFile:US_SAMPLE_PATH,parserVersion:IXBRL_PARSER_VERSION,goldSchema:US_SAMPLE_SCHEMA});
+ });
+ it('plan audit P2: restore inputs hash the CURRENT primary document — a changed document with unchanged sample bytes changes the hash; an unobtainable document is current_evidence_unavailable',async()=>{
+  const docs:Record<string,Uint8Array|number>={[URL1]:docOf('5,001')};
+  const s=await setup({sample:sample([filing(ACCN,URL1,KEYS)]),docs});
+  const pair=usCompanyfactsVsIxbrlPair();const [m]=await pair.members(s.c);
+  const res=await pair.evaluate(s.c,m);
+  const assets=s.facts.get('total_assets')!;
+  const rec=randomUUID();
+  await s.tables.insert('dq_reconciliations',{id:rec,dataset:'reconcile.us.companyfacts_vs_ixbrl',pair:'us.companyfacts_vs_ixbrl',natural_key:res[2].natural_key,detail:res[2].detail});
+  const item={id:randomUUID(),reason_code:'reconcile_mismatch',status:'open',payload:{fact_ids:[assets.fact_id]},detail:{pair:'us.companyfacts_vs_ixbrl',latest_result:{passed:false,reconciliation_id:rec,inputs_hash:res[2].inputs_hash}}};
+  expect(await inputsHashNow(s.c,item)).toBe(res[2].inputs_hash);                     // same document, same sample → same hash
+  docs[URL1]=docOf('5,000');                                                           // the document changes, the sample bytes do not
+  const changed=await inputsHashNow(s.c,item);
+  expect(changed).not.toBe(res[2].inputs_hash);
+  expect(changed).toBe(computeInputsHash({left_raw_hash:assets.raw_hash,right_sha256:sha256Hex(docOf('5,000')),gold_or_sample_sha256:s.sampleSha,parser_version:IXBRL_PARSER_VERSION}));
+  docs[URL1]=404;
+  await expect(inputsHashNow(s.c,item)).rejects.toThrow('current_evidence_unavailable');
+ });
+ it('one result per expected key: passed, tag fallback, mismatch → quarantine_left, right_ambiguous, unsupported(nil), left_missing, right_missing',async()=>{
+  const docBytes=docOf('5,001');
+  const s=await setup({sample:sample([filing(ACCN,URL1,KEYS)]),docs:{[URL1]:docBytes}});
+  const pair=usCompanyfactsVsIxbrlPair();
+  const [m]=await pair.members(s.c);
+  expect(m.issuerId).toBe(s.issuer);
+  expect(m.expectedKeys.map(x=>x.naturalKey)).toEqual(KEYS.map(x=>`${CIK}:${ACCN}:${x.concept}:${x.period_start??''}:${x.period_end}:USD`));
+  const res=await pair.evaluate(s.c,m);
+  expect(res.map(r=>[r.outcome,r.passed,r.action])).toEqual([
+   ['compared',true,'record'],['compared',true,'record'],['compared',false,'quarantine_left'],
+   ['right_ambiguous',false,'record'],['unsupported',false,'record'],['left_missing',false,'record'],['right_missing',false,'record']]);
+  const docSha=sha256Hex(docBytes);
+  const rev=s.facts.get('revenue')!;
+  expect(res[0]).toMatchObject({left_value:'1000',right_value:'1000',left_fact_id:rev.fact_id,detail:expect.objectContaining({tag_mismatch:true,right:expect.objectContaining({sha256:docSha,locator:expect.objectContaining({name:'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax'})})})});
+  expect(res[0].inputs_hash).toBe(computeInputsHash({left_raw_hash:rev.raw_hash,right_sha256:docSha,gold_or_sample_sha256:s.sampleSha,parser_version:IXBRL_PARSER_VERSION}));
+  expect(res[1].detail.tag_mismatch).toBeUndefined();
+  const assets=s.facts.get('total_assets')!;
+  expect(res[2]).toMatchObject({left_value:'5000',right_value:'5001',abs_diff:'1',left_fact_id:assets.fact_id});
+  expect(res[2].item?.natural_key).toBe(`us.companyfacts_vs_ixbrl:${m.expectedKeys[2].naturalKey}:${assets.fact_id}`);
+  expect(res[3].detail).toMatchObject({right:expect.objectContaining({values:['2000','2001']})});
+  expect(res[4].detail.reason).toBe('nil');
+  expect(s.fetch).toHaveBeenCalledTimes(1);
+  expect([...s.raw.objects.keys()].some(p=>p.includes(docSha))).toBe(true);
+  expect(await s.tables.select('dq_reconciliations',{pair:'sec.filer_category'})).toEqual([]);   // single producer: Task 17b
+ });
+ it('an open reconcile_mismatch item pins its fact; a corrected document passes and goes back to the item',async()=>{
+  const s=await setup({sample:sample([filing(ACCN,URL1,KEYS)]),docs:{[URL1]:docOf('5,000')}});
+  const assets=s.facts.get('total_assets')!;
+  const nk=`${CIK}:${ACCN}:total_assets::2024-12-31:USD`;
+  await s.tables.insert('dq_quarantine',{id:randomUUID(),dataset:'facts.us',table_name:'financial_facts',natural_key:`us.companyfacts_vs_ixbrl:${nk}:${assets.fact_id}`,reason_code:'reconcile_mismatch',detail:{pair:'us.companyfacts_vs_ixbrl'},payload:{fact_ids:[assets.fact_id]},batch_id:randomUUID(),status:'open',resolved_by:null,resolved_at:null,created_at:'2026-11-05T00:00:00Z'});
+  const pair=usCompanyfactsVsIxbrlPair();const [m]=await pair.members(s.c);
+  const res=await pair.evaluate(s.c,m);
+  expect(res[2]).toMatchObject({outcome:'compared',passed:true,action:'quarantine_left',left_fact_id:assets.fact_id});
+ });
+ it('an accession without a local filing is left_unlinked without fetching; 404 → unsupported(document_not_found); dry run records nothing',async()=>{
+  const unlinkedKeys=KEYS.slice(0,4);
+  const s=await setup({sample:sample([filing(ACCN,URL1,KEYS),filing(UNLINKED,URL2,unlinkedKeys)]),docs:{}});
+  const pair=usCompanyfactsVsIxbrlPair();const dry:PairRunContext={...s.c,dryRun:true};
+  const [m]=await pair.members(dry);
+  const res=await pair.evaluate(dry,m);
+  expect(res.slice(0,KEYS.length).every(r=>r.outcome==='unsupported'&&r.detail.reason==='document_not_found')).toBe(true);
+  expect(res.slice(KEYS.length).map(r=>r.outcome)).toEqual(['left_unlinked','left_unlinked','left_unlinked','left_unlinked']);
+  expect(s.fetch.mock.calls.map(c=>c[0])).toEqual([URL1]);
+  expect(await s.tables.select('dq_reconciliations',{})).toEqual([]);
+ });
+ it('is_inline_xbrl=false → every key unsupported(not_inline_xbrl), no fetch; an invalid sample refuses the run',async()=>{
+  const s=await setup({sample:sample([filing(ACCN,URL1,KEYS,{is_inline_xbrl:false})]),docs:{}});
+  const pair=usCompanyfactsVsIxbrlPair();const [m]=await pair.members(s.c);
+  expect((await pair.evaluate(s.c,m)).every(r=>r.outcome==='unsupported'&&r.detail.reason==='not_inline_xbrl')).toBe(true);
+  expect(s.fetch).not.toHaveBeenCalled();
+  const bad=await setup({sample:{...sample([filing(ACCN,URL1,KEYS.slice(0,2))])},docs:{}});
+  await expect(pair.members(bad.c)).rejects.toMatchObject({code:'invalid_sample_file'});
+ });
+ it('a 503 after retries is an execution failure (thrown, the runner fails the member), not a result',async()=>{
+  const s=await setup({sample:sample([filing(ACCN,URL1,KEYS)]),docs:{[URL1]:503}});
+  const pair=usCompanyfactsVsIxbrlPair();const [m]=await pair.members(s.c);
+  await expect(pair.evaluate(s.c,m)).rejects.toThrow('sec_unavailable:http_503');
+  expect(s.fetch).toHaveBeenCalledTimes(3);
+ },15_000);
+ it('failure bodies are stored as raw evidence without query strings in metadata',async()=>{
+  const s=await setup({sample:sample([filing(ACCN,URL1,KEYS)]),docs:{}});
+  const pair=usCompanyfactsVsIxbrlPair();const [m]=await pair.members(s.c);
+  await pair.evaluate(s.c,m);
+  expect(s.raw.objects.size).toBe(2);   // the (empty) 404 body, content-addressed, plus its metadata sidecar
+  const meta=[...s.raw.objects.entries()].filter(([p])=>p.endsWith('.meta.json')||p.includes('meta')).map(([,b])=>new TextDecoder().decode(b)).join('');
+  expect(meta).toContain('"http_status":404');expect(meta).not.toContain('?');
+  expect(JSON.stringify(s.fetch.mock.calls.map(c=>c[0]))).not.toContain('?');
+ });
+ it('filerClass: case-insensitive, non-accelerated before accelerated, SRC alone is unknown',()=>{
+  expect([filerClass('Large Accelerated Filer'),filerClass('Accelerated Filer'),filerClass('Non-accelerated Filer'),filerClass('Non-accelerated filer<br>Smaller reporting company'),filerClass('Smaller reporting company'),filerClass(null)])
+   .toEqual(['large_accelerated','accelerated','non_accelerated','non_accelerated',null,null]);
+ });
+});
diff --git a/src/lib/dq/reconcile/pair-us-ixbrl.ts b/src/lib/dq/reconcile/pair-us-ixbrl.ts
new file mode 100644
index 0000000..aeae766
--- /dev/null
+++ b/src/lib/dq/reconcile/pair-us-ixbrl.ts
@@ -0,0 +1,186 @@
+// src/lib/dq/reconcile/pair-us-ixbrl.ts
+// us.companyfacts_vs_ixbrl (spec §5.2, §5.3, T1). Members and expected keys come ONLY from the frozen sample
+// manifest (US_SAMPLE_PATH). Per accession, in this order:
+//  1. no local filing (edgar, accn) → every key left_unlinked (the document is not fetched);
+//  2. right document: is_inline_xbrl=false → unsupported(not_inline_xbrl); else GET doc_url with the shared process-wide SEC pacer
+//     (secPacer, 120 ms, User-Agent EDGAR_USER_AGENT/default, 429/5xx retried twice then THROWN = execution failure),
+//     404 → unsupported(document_not_found), > 50 MB → unsupported(document_too_large); accepted bytes go to
+//     reconcile-raw (content-addressed, sha256 = right_sha256) and are parsed; IxbrlParseError →
+//     unsupported(parse_error:<code>); no ix element → unsupported(not_inline_xbrl);
+//  3. left: read_filing_facts(filing, includeNonOk) filtered by activeRows (active generation, published,
+//     ok|quarantined); an OPEN reconcile_mismatch item of the key pins its fact instead (explicit re-check,
+//     any generation); 0 rows → left_missing, > 1 → left_ambiguous;
+//  4. right match on the filer's facts (entity = CIK): the left row's source_concept in the same period and
+//     unit, else the plan 2 fallback order (tagsOf) — first present tag, detail.tag_mismatch=true; none →
+//     unsupported when the parser reported an unsupported fact of those tags for that period, else
+//     right_missing; several distinct values → right_ambiguous (never quarantines);
+//  5. exact comparison (tolerance 0: the iXBRL value is the filed value); action by actionFor (quarantine
+//     only an ok left row, bound keys go back to their item). detail: left {fact_id, raw_hash, status,
+//     precision.decimals = fraction digits of value_text}, right {document, sha256, path, locator {name,
+//     contextRef, unitRef}, precision {decimals, scale}}, inputs_hash = computeInputsHash(left raw_hash, right
+//     sha256, sample sha256, IXBRL_PARSER_VERSION).
+// currentRight (restore, plan audit P2): the sample filing that holds the result's natural key, its primary
+// document fetched NOW and hashed; unobtainable (sample gone, not inline, 404, too large, SEC down) → null.
+// sec.filer_category is NOT recorded here: its single producer is scripts/dq/filer-categories.ts (Task 17b,
+// spec §6.1; plan 3 接口对齐记录). filerClass stays exported for select-us-sample.ts.
+import {conceptById} from '../../facts/concepts';
+import {tagsOf} from '../../facts/providers/edgar-companyfacts';
+import {secPacer,sleep} from '../../facts/providers/shared';
+import type {FactRow} from '../../facts/types';
+import {DEFAULT_USER_AGENT} from '../../research/ingest/collectors/shared';
+import {compareDecimal} from './decimal';
+import {computeInputsHash} from './inputs-hash';
+import {IXBRL_PARSER_VERSION,IxbrlParseError,MAX_IXBRL_BYTES,indexIxFacts,ixFactKey,parseInlineXbrl} from './ixbrl';
+import type {IxbrlDocument,IxFact} from './ixbrl';
+import {ReconcileConfigError,actionFor,activeRows,comparedNumeric,factKeyOf,fractionDigits,mismatchItem,notCompared,openMismatches,readRepoJson,sha256Hex} from './pair-support';
+import type {RegisteredPair} from './pair-support';
+import type {MemberPlan,PairContext,ReconcileOutcome,ReconcileResultInput} from './types';
+import {US_SAMPLE_PATH,US_SAMPLE_SCHEMA,entityIs,usNaturalKey,validateUsSample} from './us-sample';
+import type {SampleFiling,UsSample} from './us-sample';
+
+const PAIR='us.companyfacts_vs_ixbrl' as const;
+const SIDES={left_source:'edgar.companyfacts',right_source:'edgar.ixbrl'};
+const RESERVE_MS=10_000;
+
+export type DocFetch={status:'ok';bytes:Uint8Array}|{status:'not_found'}|{status:'too_large'};
+/** Raw-evidence metadata never carries a query string, fragment or credentials: scheme, host and path only. */
+const evidenceUrl=(u:string):string=>{try{const x=new URL(u);return `${x.protocol}//${x.host}${x.pathname}`;}catch{return '';}};
+const FAILURE_BODY_CAP=1024*1024;
+/** A non-accepted response body is evidence too (404 page, SEC error page): stored content-addressed, capped, best effort on read. */
+async function storeFailure(ctx:PairContext,res:Response,url:string):Promise<void>{
+ let bytes:Uint8Array;
+ try{bytes=new Uint8Array(await res.arrayBuffer()).slice(0,FAILURE_BODY_CAP);}catch{bytes=new Uint8Array();}
+ await ctx.raw.put({kind:'sec-document',bytes,contentType:'text/html',meta:{url:evidenceUrl(url),http_status:res.status,outcome:'failure'}},ctx.budget);
+}
+export async function fetchSecDocument(url:string,ctx:PairContext):Promise<DocFetch>{
+ const ua=process.env.EDGAR_USER_AGENT??DEFAULT_USER_AGENT;
+ for(let attempt=0;;attempt++){
+  await secPacer.admit({budget:ctx.budget,reserveMs:RESERVE_MS});
+  const timeout=Math.min(60_000,ctx.budget.remainingMs()-RESERVE_MS);
+  if(!(timeout>0))throw new Error('sec_unavailable:budget_exhausted');
+  const res=await ctx.fetch(url,{headers:{'User-Agent':ua,Accept:'text/html,application/xhtml+xml'},signal:AbortSignal.any([ctx.budget.signal,AbortSignal.timeout(timeout)])});
+  if(res.status===404){await storeFailure(ctx,res,url);return {status:'not_found'};}
+  if(res.status===429||res.status>=500){
+   await storeFailure(ctx,res,url);
+   if(attempt<2){await sleep(1000*2**attempt,ctx.budget.signal);continue;}
+   throw new Error(`sec_unavailable:http_${res.status}`);
+  }
+  if(!res.ok){await storeFailure(ctx,res,url);throw new Error(`sec_unavailable:http_${res.status}`);}
+  if(Number(res.headers.get('content-length')??'0')>MAX_IXBRL_BYTES)return {status:'too_large'};
+  const bytes=new Uint8Array(await res.arrayBuffer());
+  return bytes.byteLength>MAX_IXBRL_BYTES?{status:'too_large'}:{status:'ok',bytes};
+ }
+}
+
+/** §6.1 categories, case-insensitive; 'non-accelerated' is tested before 'accelerated'; SRC alone or unparseable → null. */
+export function filerClass(text:string|null|undefined):'large_accelerated'|'accelerated'|'non_accelerated'|null{
+ if(!text)return null;
+ const t=text.toLowerCase();
+ if(t.includes('large accelerated'))return 'large_accelerated';
+ if(t.includes('non-accelerated')||t.includes('non accelerated'))return 'non_accelerated';
+ if(t.includes('accelerated filer'))return 'accelerated';
+ return null;
+}
+
+async function loadSample(ctx:PairContext):Promise<{sample:UsSample;sha256:string}>{
+ const {json,sha256}=await readRepoJson(ctx,US_SAMPLE_PATH,'invalid_sample_file');
+ const v=validateUsSample(json);
+ if(!v.ok)throw new ReconcileConfigError('invalid_sample_file',v.errors.slice(0,5).join('; '));
+ return {sample:v.sample,sha256};
+}
+
+type Right={kind:'ok';sha256:string;path:string;doc:IxbrlDocument;index:Map<string,{values:string[];facts:IxFact[]}>;shaMismatch:boolean}|{kind:'unsupported';reason:string;sha256:string};
+async function rightSide(ctx:PairContext,f:SampleFiling,cik:string):Promise<Right>{
+ if(f.is_inline_xbrl===false)return {kind:'unsupported',reason:'not_inline_xbrl',sha256:''};
+ const got=await fetchSecDocument(f.doc_url,ctx);
+ if(got.status!=='ok')return {kind:'unsupported',reason:got.status==='not_found'?'document_not_found':'document_too_large',sha256:''};
+ const stored=await ctx.raw.put({kind:'sec-document',bytes:got.bytes,contentType:'text/html',meta:{url:evidenceUrl(f.doc_url),accn:f.accn,http_status:200}},ctx.budget);
+ let doc:IxbrlDocument;
+ try{doc=parseInlineXbrl(new TextDecoder('utf-8').decode(got.bytes));}
+ catch(e){if(e instanceof IxbrlParseError)return {kind:'unsupported',reason:`parse_error:${e.code}`,sha256:stored.sha256};throw e;}
+ if(doc.unsupported.some(u=>u.reason==='not_inline_xbrl'))return {kind:'unsupported',reason:'not_inline_xbrl',sha256:stored.sha256};
+ const filer=doc.facts.filter(x=>entityIs(x.entity,cik)).map(x=>({...x,entity:'filer'}));
+ return {kind:'ok',sha256:stored.sha256,path:stored.path,doc,index:indexIxFacts(filer),shaMismatch:stored.sha256!==f.doc_sha256};
+}
+
+interface KeyLoc{cik:string;accn:string;concept:string;period_start:string|null;period_end:string;unit:string;source_concept:string;origin:string}
+
+export function usCompanyfactsVsIxbrlPair():RegisteredPair{
+ return {
+  id:PAIR,kind:'numeric',left:'edgar.companyfacts',right:'edgar.ixbrl',
+  inputs:{repoFile:US_SAMPLE_PATH,parserVersion:IXBRL_PARSER_VERSION,goldSchema:US_SAMPLE_SCHEMA},
+  async currentRight(ctx,rec){
+   let sample:UsSample;
+   try{sample=(await loadSample(ctx)).sample;}catch(e){if(e instanceof ReconcileConfigError)return null;throw e;}
+   const nk=String(rec.natural_key);
+   const entry=sample.issuers.flatMap(i=>i.filings.map(f=>({cik:i.cik,f}))).find(x=>x.f.expected_keys.some(k=>usNaturalKey(x.cik,x.f.accn,k)===nk))?.f;
+   if(!entry||entry.is_inline_xbrl===false)return null;
+   try{const got=await fetchSecDocument(entry.doc_url,ctx);return got.status==='ok'?sha256Hex(got.bytes):null;}
+   catch(e){console.error('[reconcile] current right document',e instanceof Error?e.message:String(e));return null;}
+  },
+  async members(ctx){
+   const {sample}=await loadSample(ctx);
+   const out:MemberPlan[]=[];
+   for(const iss of sample.issuers){
+    const [row]=await ctx.tables.select('issuers',{cik:iss.cik},{limit:1});
+    if(!row)throw new ReconcileConfigError('issuer_unresolved',`cik ${iss.cik}`);
+    out.push({issuerId:String(row.issuer_id),market:'US',expectedKeys:iss.filings.flatMap(f=>f.expected_keys.map(k=>({naturalKey:usNaturalKey(iss.cik,f.accn,k),locator:{cik:iss.cik,accn:f.accn,concept:k.concept,period_start:k.period_start,period_end:k.period_end,unit:k.unit,source_concept:k.source_concept,origin:k.origin}})))});
+   }
+   return out;
+  },
+  async evaluate(ctx,member){
+   const {sample,sha256:sampleSha}=await loadSample(ctx);
+   const open=await openMismatches(ctx.tables,PAIR,'US');
+   const results:ReconcileResultInput[]=new Array(member.expectedKeys.length);
+   const groups=new Map<string,number[]>();
+   member.expectedKeys.forEach((k,i)=>{const loc=k.locator as unknown as KeyLoc;const g=`${loc.cik}|${loc.accn}`;groups.set(g,[...(groups.get(g)??[]),i]);});
+   for(const [g,idxs] of groups){
+    const [cik,accn]=g.split('|');
+    const entry=sample.issuers.find(x=>x.cik===cik)?.filings.find(f=>f.accn===accn);
+    const every=(outcome:Exclude<ReconcileOutcome,'compared'>,detail:Record<string,unknown>)=>{for(const i of idxs)results[i]=notCompared(member.expectedKeys[i].naturalKey,'numeric',outcome,SIDES,{accn,...detail});};
+    if(!entry){every('unsupported',{reason:'sample_changed'});continue;}
+    const filing=await ctx.db.findFilingBySourceRef('edgar',accn);
+    if(!filing){every('left_unlinked',{});continue;}
+    const right=await rightSide(ctx,entry,cik);
+    const byKey=new Map<string,FactRow[]>();
+    if(right.kind==='ok'||open.size>0)for(const r of activeRows(await ctx.db.readFilingFacts(filing.filing_id,true),filing)){const kf=factKeyOf(r);byKey.set(kf,[...(byKey.get(kf)??[]),r]);}
+    for(const i of idxs){
+     const k=member.expectedKeys[i];const loc=k.locator as unknown as KeyLoc;const nk=k.naturalKey;
+     const bound=open.get(nk);
+     const rows=bound?(await ctx.db.factsByIds([bound.factIds[0]])).slice(0,1):(byKey.get(factKeyOf(loc))??[]);
+     const left=rows.length===1?rows[0]:null;
+     const rightSha=right.sha256;
+     const inputs_hash=computeInputsHash({left_raw_hash:left?.raw_hash??'',right_sha256:rightSha,gold_or_sample_sha256:sampleSha,parser_version:IXBRL_PARSER_VERSION});
+     const base={accn,origin:loc.origin,unit:loc.unit,tolerance_rule:'exact/1',inputs_hash,
+      left:left?{fact_id:left.fact_id,raw_hash:left.raw_hash,status:left.status,precision:{decimals:fractionDigits(left.value_text)}}:null};
+     const backToItem=bound!==undefined&&left!==null;
+     const nc=(outcome:Exclude<ReconcileOutcome,'compared'>,detail:Record<string,unknown>)=>notCompared(nk,'numeric',outcome,SIDES,{...base,...detail},{inputs_hash,...(left?{left_fact_id:left.fact_id}:{}),...(backToItem?{action:'quarantine_left' as const,item:mismatchItem(PAIR,nk,left!,null,{document:entry.doc_url,accn},inputs_hash)}:{})});
+     if(right.kind==='unsupported'){results[i]=nc('unsupported',{reason:right.reason,right:{document:entry.doc_url,sha256:rightSha}});continue;}
+     const rightBase={document:entry.doc_url,sha256:rightSha,path:right.path,...(right.shaMismatch?{doc_sha_mismatch:true}:{})};
+     if(rows.length===0){results[i]=nc('left_missing',{right:rightBase});continue;}
+     if(rows.length>1){results[i]=nc('left_ambiguous',{fact_ids:rows.map(r=>r.fact_id),right:rightBase});continue;}
+     const l=left!;
+     const def=conceptById(loc.concept);
+     const tags=[l.source_concept,...(def?tagsOf(def):[]).filter(t=>t!==l.source_concept)];
+     let hit:{values:string[];facts:IxFact[]}|undefined;let tag:string|undefined;
+     for(const t of tags){const h=right.index.get(ixFactKey({name:t,entity:'filer',periodStart:loc.period_start,periodEnd:loc.period_end,unit:loc.unit}));if(h){hit=h;tag=t;break;}}
+     if(!hit||tag===undefined){
+      const u=right.doc.unsupported.find(x=>x.name!==undefined&&tags.includes(x.name)&&x.periodEnd===loc.period_end&&(x.periodStart??null)===loc.period_start);
+      results[i]=u?nc('unsupported',{reason:u.reason,right:{...rightBase,locator:{name:u.name,contextRef:u.contextRef}}}):nc('right_missing',{right:rightBase});
+      continue;
+     }
+     const first=hit.facts[0];
+     const locator={name:tag,contextRef:first.contextRef,unitRef:first.unitRef};
+     if(hit.values.length>1){results[i]=nc('right_ambiguous',{right:{...rightBase,locator,values:hit.values}});continue;}
+     const rv=hit.values[0];
+     const passed=compareDecimal(l.value,rv)===0;
+     const action=actionFor({bound:bound!==undefined,leftStatus:l.status,compared:true,passed,onFail:'quarantine_left'});
+     results[i]=comparedNumeric(nk,l.value,rv,{passed,tolerance:'0',sides:SIDES,inputs_hash,left_fact_id:l.fact_id,action,
+      detail:{...base,right:{...rightBase,locator,precision:{decimals:first.decimals,scale:first.scale}},scale:first.scale,...(tag!==l.source_concept?{tag_mismatch:true}:{})},
+      ...(action==='record'?{}:{item:mismatchItem(PAIR,nk,l,rv,{...locator,document:entry.doc_url},inputs_hash)})});
+    }
+   }
+   return results;
+  },
+ };
+}
diff --git a/src/lib/dq/reconcile/pairs.ts b/src/lib/dq/reconcile/pairs.ts
index f2a8a3f..2344b8d 100644
--- a/src/lib/dq/reconcile/pairs.ts
+++ b/src/lib/dq/reconcile/pairs.ts
@@ -1,6 +1,6 @@
 // src/lib/dq/reconcile/pairs.ts
 // Registry of the cycle pairs run by run.ts (spec §5.1; contract C3). Task 14 registers
-// facts.lineage_same_day and us.companyfacts_vs_gold; Task 15 adds us.companyfacts_vs_ixbrl; Task 16 adds
+// facts.lineage_same_day and us.companyfacts_vs_gold; us.companyfacts_vs_ixbrl (Task 15); Task 16 adds
 // cn.tushare_vs_cninfo_pdf_gold. The three non-cycle pairs (sec.filing_date_vs_submissions,
 // sec.filer_category, entities.isin_hkex_vs_gleif) are recorded inline through record.ts and are
 // deliberately absent. inputsHashNow recomputes a reconcile_mismatch item's inputs_hash from CURRENT
@@ -15,11 +15,13 @@ import {lineageSameDayPair} from './pair-lineage';
 import {sha256Hex} from './pair-support';
 import type {RegisteredPair} from './pair-support';
 import {usCompanyfactsVsGoldPair} from './pair-us-gold';
+import {usCompanyfactsVsIxbrlPair} from './pair-us-ixbrl';
 import type {CyclePairId,PairContext} from './types';
 
 export const RECONCILE_PAIRS:Partial<Record<CyclePairId,RegisteredPair>>={
  'facts.lineage_same_day':lineageSameDayPair(),
  'us.companyfacts_vs_gold':usCompanyfactsVsGoldPair(),
+ 'us.companyfacts_vs_ixbrl':usCompanyfactsVsIxbrlPair(),
 };
 
 export async function inputsHashNow(ctx:PairContext,item:Row):Promise<string>{
diff --git a/src/lib/dq/reconcile/us-sample.test.ts b/src/lib/dq/reconcile/us-sample.test.ts
new file mode 100644
index 0000000..d604831
--- /dev/null
+++ b/src/lib/dq/reconcile/us-sample.test.ts
@@ -0,0 +1,81 @@
+// src/lib/dq/reconcile/us-sample.test.ts
+import {describe,expect,it} from 'vitest';
+import {snapshotOf} from '../../facts/providers/shared';
+import {MIN_KEYS_PER_SIDE,US_SAMPLE_SCHEMA,buildSampleFiling,entityIs,pickSample,usNaturalKey,validateUsSample} from './us-sample';
+import type {SampleCandidate,UsSample} from './us-sample';
+
+const CIK='9990300',ACCN='0009990300-25-000001';
+const e=(start:string|undefined,end:string,val:number,accn=ACCN)=>({...(start?{start}:{}),end,val,accn,fy:2024,fp:'FY',form:'10-K',filed:'2025-02-15'});
+const companyfacts=()=>snapshotOf(new TextEncoder().encode(JSON.stringify({cik:Number(CIK),entityName:'ZIX',facts:{'us-gaap':{
+ Revenues:{units:{USD:[e('2024-01-01','2024-12-31',1000)]}},
+ NetIncomeLoss:{units:{USD:[e('2024-01-01','2024-12-31',100),e('2023-01-01','2023-12-31',90,'0009990300-24-000001')]}},
+ Assets:{units:{USD:[e(undefined,'2024-12-31',5000)]}},
+ StockholdersEquity:{units:{USD:[e(undefined,'2024-12-31',2000)]}},
+ ResearchAndDevelopmentExpense:{units:{USD:[e('2024-01-01','2024-12-31',50)]}},
+}}})),{source:'edgar'});
+const H='<html xmlns="http://www.w3.org/1999/xhtml" xmlns:ix="http://www.xbrl.org/2013/inlineXBRL" xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:iso4217="http://www.xbrl.org/2003/iso4217" xmlns:us-gaap="http://fasb.org/us-gaap/2024">';
+const ctx=(id:string,period:string,ident=`000${CIK}`)=>`<xbrli:context id="${id}"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">${ident}</xbrli:identifier></xbrli:entity><xbrli:period>${period}</xbrli:period></xbrli:context>`;
+const nf=(name:string,c:string,v:string)=>`<ix:nonFraction name="us-gaap:${name}" contextRef="${c}" unitRef="usd">${v}</ix:nonFraction>`;
+const doc=new TextEncoder().encode(`${H}<body><ix:header><ix:resources>${ctx('d','<xbrli:startDate>2024-01-01</xbrli:startDate><xbrli:endDate>2024-12-31</xbrli:endDate>')}${ctx('i','<xbrli:instant>2024-12-31</xbrli:instant>')}${ctx('other','<xbrli:instant>2024-12-31</xbrli:instant>','0000000042')}${ctx('old','<xbrli:instant>2009-12-31</xbrli:instant>')}<xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit></ix:resources></ix:header>`
+ +nf('RevenueFromContractWithCustomerExcludingAssessedTax','d','1,000')+nf('NetIncomeLoss','d','100')+nf('Assets','i','5,000')+nf('StockholdersEquity','i','2,000')+nf('CostOfRevenue','d','700')+nf('Assets','other','1')+nf('Assets','old','1')+nf('Revenues','i','3')+'</body></html>');
+const input={cik:CIK,accn:ACCN,form:'10-K',period_end:'2024-12-31',primary_document:'zix-20241231.htm',doc_url:`https://www.sec.gov/Archives/edgar/data/${CIK}/000999030025000001/zix-20241231.htm`,is_inline_xbrl:true,submissions_category:'Non-accelerated filer',companyfacts:companyfacts(),doc,sinceYear:2015};
+
+describe('buildSampleFiling (expected keys = union of two independent sources)',()=>{
+ it('unions companyfacts keys of the accession and iXBRL keys of the filer, with origins',()=>{
+  const f=buildSampleFiling(input);
+  expect(f.expected_keys.map(k=>[k.concept,k.period_start,k.period_end,k.unit,k.source_concept,k.origin])).toEqual([
+   ['cost_of_revenue','2024-01-01','2024-12-31','USD','us-gaap:CostOfRevenue','right'],
+   ['equity_parent',null,'2024-12-31','USD','us-gaap:StockholdersEquity','both'],
+   ['net_income_parent','2024-01-01','2024-12-31','USD','us-gaap:NetIncomeLoss','both'],
+   ['rd_expense','2024-01-01','2024-12-31','USD','us-gaap:ResearchAndDevelopmentExpense','left'],
+   ['revenue','2024-01-01','2024-12-31','USD','us-gaap:Revenues','both'],
+   ['total_assets',null,'2024-12-31','USD','us-gaap:Assets','both'],
+  ]);   // NetIncomeLoss 2023 belongs to another accession; Assets of entity 42, the 2009 Assets and the instant-context Revenues are not keys
+  expect(f).toMatchObject({accn:ACCN,raw_sha256:input.companyfacts.sha256,is_inline_xbrl:true,submissions_category:'Non-accelerated filer'});
+  expect(f.doc_sha256).toMatch(/^[0-9a-f]{64}$/);
+  expect(usNaturalKey(CIK,ACCN,f.expected_keys[0])).toBe(`${CIK}:${ACCN}:cost_of_revenue:2024-01-01:2024-12-31:USD`);
+ });
+ it(`refuses a filing with fewer than ${MIN_KEYS_PER_SIDE} keys on either side`,()=>{
+  expect(()=>buildSampleFiling({...input,doc:new TextEncoder().encode(`${H}<body><ix:header><ix:resources>${ctx('d','<xbrli:startDate>2024-01-01</xbrli:startDate><xbrli:endDate>2024-12-31</xbrli:endDate>')}<xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit></ix:resources></ix:header>${nf('NetIncomeLoss','d','100')}</body></html>`)})).toThrow(/sample_side_too_small:.*right=1/);
+ });
+ it('entityIs compares the SEC CIK identifier without leading zeros',()=>{
+  expect(entityIs('http://www.sec.gov/CIK#0000320193','320193')).toBe(true);
+  expect(entityIs('http://www.sec.gov/CIK#0000320194','320193')).toBe(false);
+  expect(entityIs('http://example.com#320193','320193')).toBe(false);
+ });
+});
+
+describe('validateUsSample',()=>{
+ const good=():UsSample=>({schema:US_SAMPLE_SCHEMA,generated_at:'2026-11-05T00:00:00Z',selection:'fixture/1',issuers:[{cik:CIK,ticker:'ZIX',regime:'10-K',filings:[buildSampleFiling(input)]}]});
+ it('accepts a well-formed manifest',()=>{expect(validateUsSample(good())).toEqual({ok:true,sample:good()});});
+ it.each([
+  ['schema',(s:UsSample)=>{(s as {schema:string}).schema='x';}],
+  ['accn',(s:UsSample)=>{s.issuers[0].filings[0].accn='123';}],
+  ['cik',(s:UsSample)=>{s.issuers[0].cik='0320193';}],
+  ['duplicate key',(s:UsSample)=>{s.issuers[0].filings[0].expected_keys.push({...s.issuers[0].filings[0].expected_keys[0]});}],
+  ['unknown concept',(s:UsSample)=>{s.issuers[0].filings[0].expected_keys[0].concept='nope';}],
+  ['side too small',(s:UsSample)=>{s.issuers[0].filings[0].expected_keys=s.issuers[0].filings[0].expected_keys.slice(0,3);}],
+  ['doc_url host',(s:UsSample)=>{s.issuers[0].filings[0].doc_url='https://evil.example/x.htm';}],
+  ['doc_url query',(s:UsSample)=>{s.issuers[0].filings[0].doc_url+='?token=x';}],
+  ['sha',(s:UsSample)=>{s.issuers[0].filings[0].raw_sha256='abc';}],
+  ['no filings',(s:UsSample)=>{s.issuers[0].filings=[];}],
+ ])('rejects: %s',(_n,mutate)=>{const s=good();mutate(s);const r=validateUsSample(s);expect(r.ok).toBe(false);});
+});
+
+describe('pickSample (spec §5.3 sample rule)',()=>{
+ const cand=(i:number,o:Partial<SampleCandidate>={}):SampleCandidate=>({ticker:`T${String(i).padStart(3,'0')}`,cik:String(1000+i),exchange:'NYSE',fiscalYearEnd:'1231',acceleration:'large_accelerated',...o});
+ it('keeps required tickers, fills the rest at equal steps in ticker order, and meets every quota by swapping',()=>{
+  const all=[...Array.from({length:60},(_,i)=>cand(i)),cand(100,{ticker:'AAPL',exchange:'Nasdaq',fiscalYearEnd:'0930'}),cand(101,{ticker:'MSFT',exchange:'Nasdaq',fiscalYearEnd:'0630'}),cand(102,{ticker:'ZNAS',exchange:'Nasdaq'}),cand(103,{ticker:'ZACC',acceleration:'accelerated'}),cand(104,{ticker:'ZNON',acceleration:'non_accelerated'})];
+  const {picked,unmet}=pickSample(all,['AAPL','MSFT'],30);
+  expect(picked).toHaveLength(30);expect(unmet).toEqual([]);
+  expect(picked.map(p=>p.ticker)).toEqual(expect.arrayContaining(['AAPL','MSFT','ZNAS','ZACC','ZNON']));
+  expect(picked.filter(p=>p.exchange==='NYSE').length).toBeGreaterThanOrEqual(3);
+  expect(new Set(picked.map(p=>p.ticker)).size).toBe(30);
+  expect(picked.map(p=>p.ticker)).toEqual([...picked.map(p=>p.ticker)].sort());
+ });
+ it('reports a quota that cannot be met instead of inventing candidates',()=>{
+  const {picked,unmet}=pickSample(Array.from({length:10},(_,i)=>cand(i)),[],30);
+  expect(picked).toHaveLength(10);
+  expect(unmet).toEqual(['nasdaq','fye_not_1231','not_large_accelerated']);
+ });
+});
diff --git a/src/lib/dq/reconcile/us-sample.ts b/src/lib/dq/reconcile/us-sample.ts
new file mode 100644
index 0000000..92202fc
--- /dev/null
+++ b/src/lib/dq/reconcile/us-sample.ts
@@ -0,0 +1,144 @@
+// src/lib/dq/reconcile/us-sample.ts
+// US iXBRL sample manifest (spec §5.3; schema 'us-ixbrl-sample/1'). The manifest freezes members and expected
+// keys of us.companyfacts_vs_ixbrl. Expected keys are the UNION of two independent sources: (a) plan 2's
+// companyfacts adapter on the accession's raw snapshot (candidates, ambiguous and odd-duration entries of that
+// accession), (b) the iXBRL parser on the primary document (filer entity only, tag in FACT_CONCEPTS, unit kind
+// and period nature matching the concept, period end >= sinceYear-01-01, highest-priority tag per key). A key
+// from one source only is still expected — at run time it becomes left_missing or right_missing and exposes
+// the adapter's or parser's gap instead of shrinking the denominator. Each side needs >= 4 keys. pickSample is
+// the §5.3 selection: required (plan-2 gold) tickers, the rest at equal steps in ticker order up to n, then
+// quota swaps (>= 3 NYSE, >= 3 Nasdaq, >= 2 fiscal year end not 12-31, >= 2 not large accelerated); a quota
+// that cannot be met is reported, never faked.
+import {FACT_CONCEPTS,conceptById} from '../../facts/concepts';
+import {parseCompanyFacts,tagsOf} from '../../facts/providers/edgar-companyfacts';
+import type {ConceptDef,FactCandidate,ParseResult,RawSnapshot} from '../../facts/types';
+import {unitKindOf} from '../../facts/units';
+import {parseInlineXbrl} from './ixbrl';
+import type {IxbrlDocument} from './ixbrl';
+import {sha256Hex} from './pair-support';
+
+export const US_SAMPLE_SCHEMA='us-ixbrl-sample/1';
+export const US_SAMPLE_PATH='src/lib/dq/fixtures/gold/us-ixbrl-sample-v1.json';
+export const MIN_KEYS_PER_SIDE=4;
+export type KeyOrigin='left'|'right'|'both';
+export interface SampleKey{concept:string;period_start:string|null;period_end:string;unit:string;source_concept:string;origin:KeyOrigin}
+export interface SampleFiling{accn:string;form:string;period_end:string|null;primary_document:string;doc_url:string;is_inline_xbrl:boolean|null;submissions_category:string|null;raw_sha256:string;doc_sha256:string;expected_keys:SampleKey[]}
+export interface SampleIssuer{cik:string;ticker:string;regime:'10-K'|'20-F';filings:SampleFiling[]}
+export interface UsSample{schema:typeof US_SAMPLE_SCHEMA;generated_at:string;selection:string;issuers:SampleIssuer[]}
+type KeyCore=Omit<SampleKey,'origin'>;
+
+export const usNaturalKey=(cik:string,accn:string,k:Pick<SampleKey,'concept'|'period_start'|'period_end'|'unit'>)=>`${cik}:${accn}:${k.concept}:${k.period_start??''}:${k.period_end}:${k.unit}`;
+const kk=(k:Pick<SampleKey,'concept'|'period_start'|'period_end'|'unit'>)=>`${k.concept}|${k.period_start??''}|${k.period_end}|${k.unit}`;
+const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
+const TAG_CONCEPT=(()=>{const m=new Map<string,ConceptDef>();for(const c of FACT_CONCEPTS)for(const t of tagsOf(c))if(!m.has(t))m.set(t,c);return m;})();
+
+/** The context entity is the SEC CIK of the filer (identifier compared without leading zeros). */
+export const entityIs=(entity:string,cik:string):boolean=>entity.startsWith('http://www.sec.gov/CIK#')&&entity.slice(entity.indexOf('#')+1).replace(/^0+/,'')===cik.replace(/^0+/,'');
+
+export function companyfactsKeys(parse:ParseResult,accn:string):Map<string,KeyCore>{
+ const out=new Map<string,KeyCore>();
+ const add=(c:FactCandidate)=>{if(c.filingRef!==accn)return;const k={concept:c.concept,period_start:c.periodStart,period_end:c.periodEnd,unit:c.unit,source_concept:c.sourceConcept};if(!out.has(kk(k)))out.set(kk(k),k);};
+ parse.candidates.forEach(add);parse.ambiguous.forEach(a=>a.candidates.forEach(add));parse.oddDuration.forEach(add);
+ return out;
+}
+export function ixbrlKeys(doc:IxbrlDocument,cik:string,sinceDate:string):Map<string,KeyCore>{
+ const out=new Map<string,KeyCore>();
+ for(const f of doc.facts){
+  if(!entityIs(f.entity,cik))continue;
+  const c=TAG_CONCEPT.get(f.name);
+  if(!c||unitKindOf(f.unit)!==c.unitKind||(c.nature==='duration')!==(f.periodStart!==null)||f.periodEnd<sinceDate)continue;
+  const k={concept:c.id,period_start:f.periodStart,period_end:f.periodEnd,unit:f.unit,source_concept:f.name};
+  const prev=out.get(kk(k));
+  if(!prev||tagsOf(c).indexOf(f.name)<tagsOf(c).indexOf(prev.source_concept))out.set(kk(k),k);
+ }
+ return out;
+}
+
+export interface BuildFilingInput{cik:string;accn:string;form:string;period_end:string|null;primary_document:string;doc_url:string;is_inline_xbrl:boolean|null;submissions_category:string|null;companyfacts:RawSnapshot;doc:Uint8Array;doc_sha256?:string;sinceYear:number}
+export function buildSampleFiling(i:BuildFilingInput):SampleFiling{
+ const left=companyfactsKeys(parseCompanyFacts(i.companyfacts,{sinceYear:i.sinceYear}),i.accn);
+ const right=ixbrlKeys(parseInlineXbrl(new TextDecoder('utf-8').decode(i.doc)),i.cik,`${i.sinceYear}-01-01`);
+ const keys:SampleKey[]=[];
+ for(const [k,v] of left)keys.push({...v,origin:right.has(k)?'both':'left'});
+ for(const [k,v] of right)if(!left.has(k))keys.push({...v,origin:'right'});
+ keys.sort((a,b)=>cmp(kk(a),kk(b)));
+ const nLeft=keys.filter(k=>k.origin!=='right').length,nRight=keys.filter(k=>k.origin!=='left').length;
+ if(nLeft<MIN_KEYS_PER_SIDE||nRight<MIN_KEYS_PER_SIDE)throw new Error(`sample_side_too_small:${i.accn}:left=${nLeft}:right=${nRight}`);
+ return {accn:i.accn,form:i.form,period_end:i.period_end,primary_document:i.primary_document,doc_url:i.doc_url,is_inline_xbrl:i.is_inline_xbrl,submissions_category:i.submissions_category,raw_sha256:i.companyfacts.sha256,doc_sha256:i.doc_sha256??sha256Hex(i.doc),expected_keys:keys};
+}
+
+const DATE=/^\d{4}-\d{2}-\d{2}$/,SHA=/^[0-9a-f]{64}$/,ACCN=/^\d{10}-\d{2}-\d{6}$/;
+export function validateUsSample(json:unknown):{ok:true;sample:UsSample}|{ok:false;errors:string[]}{
+ const errors:string[]=[];const e=(m:string)=>{errors.push(m);};
+ const s=json as Partial<UsSample>|null;
+ if(!s||typeof s!=='object')return {ok:false,errors:['not_an_object']};
+ if(s.schema!==US_SAMPLE_SCHEMA)e('schema');
+ if(typeof s.generated_at!=='string'||Number.isNaN(Date.parse(s.generated_at)))e('generated_at');
+ if(typeof s.selection!=='string'||s.selection==='')e('selection');
+ if(!Array.isArray(s.issuers)||s.issuers.length===0)return {ok:false,errors:[...errors,'issuers']};
+ const nks=new Set<string>();
+ s.issuers.forEach((iss,ii)=>{
+  const at=`issuers[${ii}]`;
+  if(typeof iss?.cik!=='string'||!/^[1-9]\d{0,9}$/.test(iss.cik))e(`${at}.cik`);
+  if(typeof iss?.ticker!=='string'||iss.ticker==='')e(`${at}.ticker`);
+  if(iss?.regime!=='10-K'&&iss?.regime!=='20-F')e(`${at}.regime`);
+  if(!Array.isArray(iss?.filings)||iss.filings.length===0){e(`${at}.filings`);return;}
+  iss.filings.forEach((f,fi)=>{
+   const fa=`${at}.filings[${fi}]`;
+   if(typeof f?.accn!=='string'||!ACCN.test(f.accn))e(`${fa}.accn`);
+   if(typeof f?.form!=='string'||f.form==='')e(`${fa}.form`);
+   if(f?.period_end!==null&&!(typeof f?.period_end==='string'&&DATE.test(f.period_end)))e(`${fa}.period_end`);
+   if(typeof f?.primary_document!=='string'||f.primary_document==='')e(`${fa}.primary_document`);
+   if(typeof f?.doc_url!=='string'||!f.doc_url.startsWith(`https://www.sec.gov/Archives/edgar/data/${iss.cik}/`)||/[?#@]/.test(f.doc_url))e(`${fa}.doc_url`);
+   if(f?.is_inline_xbrl!==null&&typeof f?.is_inline_xbrl!=='boolean')e(`${fa}.is_inline_xbrl`);
+   if(f?.submissions_category!==null&&typeof f?.submissions_category!=='string')e(`${fa}.submissions_category`);
+   if(typeof f?.raw_sha256!=='string'||!SHA.test(f.raw_sha256))e(`${fa}.raw_sha256`);
+   if(typeof f?.doc_sha256!=='string'||!SHA.test(f.doc_sha256))e(`${fa}.doc_sha256`);
+   if(!Array.isArray(f?.expected_keys)){e(`${fa}.expected_keys`);return;}
+   let nl=0,nr=0;
+   f.expected_keys.forEach((k,ki)=>{
+    const ka=`${fa}.expected_keys[${ki}]`;
+    const def=typeof k?.concept==='string'?conceptById(k.concept):undefined;
+    if(!def)e(`${ka}.concept`);
+    if(k?.period_start!==null&&!(typeof k?.period_start==='string'&&DATE.test(k.period_start)))e(`${ka}.period_start`);
+    if(typeof k?.period_end!=='string'||!DATE.test(k.period_end))e(`${ka}.period_end`);
+    if(typeof k?.unit!=='string'||k.unit==='')e(`${ka}.unit`);
+    if(typeof k?.source_concept!=='string'||k.source_concept==='')e(`${ka}.source_concept`);
+    if(k?.origin!=='left'&&k?.origin!=='right'&&k?.origin!=='both')e(`${ka}.origin`);
+    if(k?.origin!=='right')nl++;if(k?.origin!=='left')nr++;
+    const nk=usNaturalKey(String(iss.cik),String(f.accn),k);
+    if(nks.has(nk))e(`${ka}: duplicate ${nk}`);nks.add(nk);
+   });
+   if(nl<MIN_KEYS_PER_SIDE||nr<MIN_KEYS_PER_SIDE)e(`${fa}: fewer than ${MIN_KEYS_PER_SIDE} keys per side (left=${nl}, right=${nr})`);
+  });
+ });
+ return errors.length>0?{ok:false,errors}:{ok:true,sample:s as UsSample};
+}
+
+export interface SampleCandidate{ticker:string;cik:string;exchange:string|null;fiscalYearEnd:string|null;acceleration:'large_accelerated'|'accelerated'|'non_accelerated'|null}
+const QUOTAS:readonly {name:string;min:number;test:(c:SampleCandidate)=>boolean}[]=[
+ {name:'nyse',min:3,test:c=>c.exchange==='NYSE'},
+ {name:'nasdaq',min:3,test:c=>c.exchange!==null&&c.exchange.toLowerCase()==='nasdaq'},
+ {name:'fye_not_1231',min:2,test:c=>c.fiscalYearEnd!==null&&c.fiscalYearEnd!=='1231'},
+ {name:'not_large_accelerated',min:2,test:c=>c.acceleration!==null&&c.acceleration!=='large_accelerated'},
+];
+export function pickSample(candidates:readonly SampleCandidate[],required:readonly string[],n=30):{picked:SampleCandidate[];unmet:string[]}{
+ const sorted=[...candidates].sort((a,b)=>cmp(a.ticker,b.ticker));
+ const req=new Set(required);
+ const picked=sorted.filter(c=>req.has(c.ticker));
+ const others=sorted.filter(c=>!req.has(c.ticker));
+ const k=Math.max(0,Math.min(n-picked.length,others.length));
+ for(let i=0;i<k;i++)picked.push(others[Math.floor(i*others.length/k)]);
+ const count=(q:typeof QUOTAS[number])=>picked.filter(q.test).length;
+ for(const q of QUOTAS){
+  while(count(q)<q.min){
+   const incoming=sorted.find(c=>!picked.includes(c)&&q.test(c));
+   if(!incoming)break;
+   if(picked.length<n){picked.push(incoming);continue;}
+   const out=[...picked.keys()].reverse().find(i=>!req.has(picked[i].ticker)&&!q.test(picked[i])&&QUOTAS.every(o=>o===q||!o.test(picked[i])||count(o)>o.min));
+   if(out===undefined)break;
+   picked.splice(out,1,incoming);
+  }
+ }
+ return {picked:picked.sort((a,b)=>cmp(a.ticker,b.ticker)),unmet:QUOTAS.filter(q=>count(q)<q.min).map(q=>q.name)};
+}
diff --git a/vercel.json b/vercel.json
index 87257e1..009bb64 100644
--- a/vercel.json
+++ b/vercel.json
@@ -30,6 +30,10 @@
       "path": "/api/cron/facts-sync?market=US",
       "schedule": "5 */4 * * *"
     },
+    {
+      "path": "/api/cron/reconcile?pair=us.companyfacts_vs_ixbrl",
+      "schedule": "0 2 * * *"
+    },
     {
       "path": "/api/cron/reconcile?pair=facts.lineage_same_day",
       "schedule": "0 4 * * *"

exec
/bin/zsh -lc "cat src/lib/dq/reconcile/pair-us-ixbrl.ts; cat src/lib/dq/reconcile/pair-support.ts; cat src/lib/dq/reconcile/pairs.ts; ls src/lib/dq/fixtures/gold; find . -iname '*agents*' -o -name CLAUDE.md; cat next.config.mjs" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 58ms:
// src/lib/dq/reconcile/pair-us-ixbrl.ts
// us.companyfacts_vs_ixbrl (spec §5.2, §5.3, T1). Members and expected keys come ONLY from the frozen sample
// manifest (US_SAMPLE_PATH). Per accession, in this order:
//  1. no local filing (edgar, accn) → every key left_unlinked (the document is not fetched);
//  2. right document: is_inline_xbrl=false → unsupported(not_inline_xbrl); else GET doc_url with the shared process-wide SEC pacer
//     (secPacer, 120 ms, User-Agent EDGAR_USER_AGENT/default, 429/5xx retried twice then THROWN = execution failure),
//     404 → unsupported(document_not_found), > 50 MB → unsupported(document_too_large); accepted bytes go to
//     reconcile-raw (content-addressed, sha256 = right_sha256) and are parsed; IxbrlParseError →
//     unsupported(parse_error:<code>); no ix element → unsupported(not_inline_xbrl);
//  3. left: read_filing_facts(filing, includeNonOk) filtered by activeRows (active generation, published,
//     ok|quarantined); an OPEN reconcile_mismatch item of the key pins its fact instead (explicit re-check,
//     any generation); 0 rows → left_missing, > 1 → left_ambiguous;
//  4. right match on the filer's facts (entity = CIK): the left row's source_concept in the same period and
//     unit, else the plan 2 fallback order (tagsOf) — first present tag, detail.tag_mismatch=true; none →
//     unsupported when the parser reported an unsupported fact of those tags for that period, else
//     right_missing; several distinct values → right_ambiguous (never quarantines);
//  5. exact comparison (tolerance 0: the iXBRL value is the filed value); action by actionFor (quarantine
//     only an ok left row, bound keys go back to their item). detail: left {fact_id, raw_hash, status,
//     precision.decimals = fraction digits of value_text}, right {document, sha256, path, locator {name,
//     contextRef, unitRef}, precision {decimals, scale}}, inputs_hash = computeInputsHash(left raw_hash, right
//     sha256, sample sha256, IXBRL_PARSER_VERSION).
// currentRight (restore, plan audit P2): the sample filing that holds the result's natural key, its primary
// document fetched NOW and hashed; unobtainable (sample gone, not inline, 404, too large, SEC down) → null.
// sec.filer_category is NOT recorded here: its single producer is scripts/dq/filer-categories.ts (Task 17b,
// spec §6.1; plan 3 接口对齐记录). filerClass stays exported for select-us-sample.ts.
import {conceptById} from '../../facts/concepts';
import {tagsOf} from '../../facts/providers/edgar-companyfacts';
import {secPacer,sleep} from '../../facts/providers/shared';
import type {FactRow} from '../../facts/types';
import {DEFAULT_USER_AGENT} from '../../research/ingest/collectors/shared';
import {compareDecimal} from './decimal';
import {computeInputsHash} from './inputs-hash';
import {IXBRL_PARSER_VERSION,IxbrlParseError,MAX_IXBRL_BYTES,indexIxFacts,ixFactKey,parseInlineXbrl} from './ixbrl';
import type {IxbrlDocument,IxFact} from './ixbrl';
import {ReconcileConfigError,actionFor,activeRows,comparedNumeric,factKeyOf,fractionDigits,mismatchItem,notCompared,openMismatches,readRepoJson,sha256Hex} from './pair-support';
import type {RegisteredPair} from './pair-support';
import type {MemberPlan,PairContext,ReconcileOutcome,ReconcileResultInput} from './types';
import {US_SAMPLE_PATH,US_SAMPLE_SCHEMA,entityIs,usNaturalKey,validateUsSample} from './us-sample';
import type {SampleFiling,UsSample} from './us-sample';

const PAIR='us.companyfacts_vs_ixbrl' as const;
const SIDES={left_source:'edgar.companyfacts',right_source:'edgar.ixbrl'};
const RESERVE_MS=10_000;

export type DocFetch={status:'ok';bytes:Uint8Array}|{status:'not_found'}|{status:'too_large'};
/** Raw-evidence metadata never carries a query string, fragment or credentials: scheme, host and path only. */
const evidenceUrl=(u:string):string=>{try{const x=new URL(u);return `${x.protocol}//${x.host}${x.pathname}`;}catch{return '';}};
const FAILURE_BODY_CAP=1024*1024;
/** A non-accepted response body is evidence too (404 page, SEC error page): stored content-addressed, capped, best effort on read. */
async function storeFailure(ctx:PairContext,res:Response,url:string):Promise<void>{
 let bytes:Uint8Array;
 try{bytes=new Uint8Array(await res.arrayBuffer()).slice(0,FAILURE_BODY_CAP);}catch{bytes=new Uint8Array();}
 await ctx.raw.put({kind:'sec-document',bytes,contentType:'text/html',meta:{url:evidenceUrl(url),http_status:res.status,outcome:'failure'}},ctx.budget);
}
export async function fetchSecDocument(url:string,ctx:PairContext):Promise<DocFetch>{
 const ua=process.env.EDGAR_USER_AGENT??DEFAULT_USER_AGENT;
 for(let attempt=0;;attempt++){
  await secPacer.admit({budget:ctx.budget,reserveMs:RESERVE_MS});
  const timeout=Math.min(60_000,ctx.budget.remainingMs()-RESERVE_MS);
  if(!(timeout>0))throw new Error('sec_unavailable:budget_exhausted');
  const res=await ctx.fetch(url,{headers:{'User-Agent':ua,Accept:'text/html,application/xhtml+xml'},signal:AbortSignal.any([ctx.budget.signal,AbortSignal.timeout(timeout)])});
  if(res.status===404){await storeFailure(ctx,res,url);return {status:'not_found'};}
  if(res.status===429||res.status>=500){
   await storeFailure(ctx,res,url);
   if(attempt<2){await sleep(1000*2**attempt,ctx.budget.signal);continue;}
   throw new Error(`sec_unavailable:http_${res.status}`);
  }
  if(!res.ok){await storeFailure(ctx,res,url);throw new Error(`sec_unavailable:http_${res.status}`);}
  if(Number(res.headers.get('content-length')??'0')>MAX_IXBRL_BYTES)return {status:'too_large'};
  const bytes=new Uint8Array(await res.arrayBuffer());
  return bytes.byteLength>MAX_IXBRL_BYTES?{status:'too_large'}:{status:'ok',bytes};
 }
}

/** §6.1 categories, case-insensitive; 'non-accelerated' is tested before 'accelerated'; SRC alone or unparseable → null. */
export function filerClass(text:string|null|undefined):'large_accelerated'|'accelerated'|'non_accelerated'|null{
 if(!text)return null;
 const t=text.toLowerCase();
 if(t.includes('large accelerated'))return 'large_accelerated';
 if(t.includes('non-accelerated')||t.includes('non accelerated'))return 'non_accelerated';
 if(t.includes('accelerated filer'))return 'accelerated';
 return null;
}

async function loadSample(ctx:PairContext):Promise<{sample:UsSample;sha256:string}>{
 const {json,sha256}=await readRepoJson(ctx,US_SAMPLE_PATH,'invalid_sample_file');
 const v=validateUsSample(json);
 if(!v.ok)throw new ReconcileConfigError('invalid_sample_file',v.errors.slice(0,5).join('; '));
 return {sample:v.sample,sha256};
}

type Right={kind:'ok';sha256:string;path:string;doc:IxbrlDocument;index:Map<string,{values:string[];facts:IxFact[]}>;shaMismatch:boolean}|{kind:'unsupported';reason:string;sha256:string};
async function rightSide(ctx:PairContext,f:SampleFiling,cik:string):Promise<Right>{
 if(f.is_inline_xbrl===false)return {kind:'unsupported',reason:'not_inline_xbrl',sha256:''};
 const got=await fetchSecDocument(f.doc_url,ctx);
 if(got.status!=='ok')return {kind:'unsupported',reason:got.status==='not_found'?'document_not_found':'document_too_large',sha256:''};
 const stored=await ctx.raw.put({kind:'sec-document',bytes:got.bytes,contentType:'text/html',meta:{url:evidenceUrl(f.doc_url),accn:f.accn,http_status:200}},ctx.budget);
 let doc:IxbrlDocument;
 try{doc=parseInlineXbrl(new TextDecoder('utf-8').decode(got.bytes));}
 catch(e){if(e instanceof IxbrlParseError)return {kind:'unsupported',reason:`parse_error:${e.code}`,sha256:stored.sha256};throw e;}
 if(doc.unsupported.some(u=>u.reason==='not_inline_xbrl'))return {kind:'unsupported',reason:'not_inline_xbrl',sha256:stored.sha256};
 const filer=doc.facts.filter(x=>entityIs(x.entity,cik)).map(x=>({...x,entity:'filer'}));
 return {kind:'ok',sha256:stored.sha256,path:stored.path,doc,index:indexIxFacts(filer),shaMismatch:stored.sha256!==f.doc_sha256};
}

interface KeyLoc{cik:string;accn:string;concept:string;period_start:string|null;period_end:string;unit:string;source_concept:string;origin:string}

export function usCompanyfactsVsIxbrlPair():RegisteredPair{
 return {
  id:PAIR,kind:'numeric',left:'edgar.companyfacts',right:'edgar.ixbrl',
  inputs:{repoFile:US_SAMPLE_PATH,parserVersion:IXBRL_PARSER_VERSION,goldSchema:US_SAMPLE_SCHEMA},
  async currentRight(ctx,rec){
   let sample:UsSample;
   try{sample=(await loadSample(ctx)).sample;}catch(e){if(e instanceof ReconcileConfigError)return null;throw e;}
   const nk=String(rec.natural_key);
   const entry=sample.issuers.flatMap(i=>i.filings.map(f=>({cik:i.cik,f}))).find(x=>x.f.expected_keys.some(k=>usNaturalKey(x.cik,x.f.accn,k)===nk))?.f;
   if(!entry||entry.is_inline_xbrl===false)return null;
   try{const got=await fetchSecDocument(entry.doc_url,ctx);return got.status==='ok'?sha256Hex(got.bytes):null;}
   catch(e){console.error('[reconcile] current right document',e instanceof Error?e.message:String(e));return null;}
  },
  async members(ctx){
   const {sample}=await loadSample(ctx);
   const out:MemberPlan[]=[];
   for(const iss of sample.issuers){
    const [row]=await ctx.tables.select('issuers',{cik:iss.cik},{limit:1});
    if(!row)throw new ReconcileConfigError('issuer_unresolved',`cik ${iss.cik}`);
    out.push({issuerId:String(row.issuer_id),market:'US',expectedKeys:iss.filings.flatMap(f=>f.expected_keys.map(k=>({naturalKey:usNaturalKey(iss.cik,f.accn,k),locator:{cik:iss.cik,accn:f.accn,concept:k.concept,period_start:k.period_start,period_end:k.period_end,unit:k.unit,source_concept:k.source_concept,origin:k.origin}})))});
   }
   return out;
  },
  async evaluate(ctx,member){
   const {sample,sha256:sampleSha}=await loadSample(ctx);
   const open=await openMismatches(ctx.tables,PAIR,'US');
   const results:ReconcileResultInput[]=new Array(member.expectedKeys.length);
   const groups=new Map<string,number[]>();
   member.expectedKeys.forEach((k,i)=>{const loc=k.locator as unknown as KeyLoc;const g=`${loc.cik}|${loc.accn}`;groups.set(g,[...(groups.get(g)??[]),i]);});
   for(const [g,idxs] of groups){
    const [cik,accn]=g.split('|');
    const entry=sample.issuers.find(x=>x.cik===cik)?.filings.find(f=>f.accn===accn);
    const every=(outcome:Exclude<ReconcileOutcome,'compared'>,detail:Record<string,unknown>)=>{for(const i of idxs)results[i]=notCompared(member.expectedKeys[i].naturalKey,'numeric',outcome,SIDES,{accn,...detail});};
    if(!entry){every('unsupported',{reason:'sample_changed'});continue;}
    const filing=await ctx.db.findFilingBySourceRef('edgar',accn);
    if(!filing){every('left_unlinked',{});continue;}
    const right=await rightSide(ctx,entry,cik);
    const byKey=new Map<string,FactRow[]>();
    if(right.kind==='ok'||open.size>0)for(const r of activeRows(await ctx.db.readFilingFacts(filing.filing_id,true),filing)){const kf=factKeyOf(r);byKey.set(kf,[...(byKey.get(kf)??[]),r]);}
    for(const i of idxs){
     const k=member.expectedKeys[i];const loc=k.locator as unknown as KeyLoc;const nk=k.naturalKey;
     const bound=open.get(nk);
     const rows=bound?(await ctx.db.factsByIds([bound.factIds[0]])).slice(0,1):(byKey.get(factKeyOf(loc))??[]);
     const left=rows.length===1?rows[0]:null;
     const rightSha=right.sha256;
     const inputs_hash=computeInputsHash({left_raw_hash:left?.raw_hash??'',right_sha256:rightSha,gold_or_sample_sha256:sampleSha,parser_version:IXBRL_PARSER_VERSION});
     const base={accn,origin:loc.origin,unit:loc.unit,tolerance_rule:'exact/1',inputs_hash,
      left:left?{fact_id:left.fact_id,raw_hash:left.raw_hash,status:left.status,precision:{decimals:fractionDigits(left.value_text)}}:null};
     const backToItem=bound!==undefined&&left!==null;
     const nc=(outcome:Exclude<ReconcileOutcome,'compared'>,detail:Record<string,unknown>)=>notCompared(nk,'numeric',outcome,SIDES,{...base,...detail},{inputs_hash,...(left?{left_fact_id:left.fact_id}:{}),...(backToItem?{action:'quarantine_left' as const,item:mismatchItem(PAIR,nk,left!,null,{document:entry.doc_url,accn},inputs_hash)}:{})});
     if(right.kind==='unsupported'){results[i]=nc('unsupported',{reason:right.reason,right:{document:entry.doc_url,sha256:rightSha}});continue;}
     const rightBase={document:entry.doc_url,sha256:rightSha,path:right.path,...(right.shaMismatch?{doc_sha_mismatch:true}:{})};
     if(rows.length===0){results[i]=nc('left_missing',{right:rightBase});continue;}
     if(rows.length>1){results[i]=nc('left_ambiguous',{fact_ids:rows.map(r=>r.fact_id),right:rightBase});continue;}
     const l=left!;
     const def=conceptById(loc.concept);
     const tags=[l.source_concept,...(def?tagsOf(def):[]).filter(t=>t!==l.source_concept)];
     let hit:{values:string[];facts:IxFact[]}|undefined;let tag:string|undefined;
     for(const t of tags){const h=right.index.get(ixFactKey({name:t,entity:'filer',periodStart:loc.period_start,periodEnd:loc.period_end,unit:loc.unit}));if(h){hit=h;tag=t;break;}}
     if(!hit||tag===undefined){
      const u=right.doc.unsupported.find(x=>x.name!==undefined&&tags.includes(x.name)&&x.periodEnd===loc.period_end&&(x.periodStart??null)===loc.period_start);
      results[i]=u?nc('unsupported',{reason:u.reason,right:{...rightBase,locator:{name:u.name,contextRef:u.contextRef}}}):nc('right_missing',{right:rightBase});
      continue;
     }
     const first=hit.facts[0];
     const locator={name:tag,contextRef:first.contextRef,unitRef:first.unitRef};
     if(hit.values.length>1){results[i]=nc('right_ambiguous',{right:{...rightBase,locator,values:hit.values}});continue;}
     const rv=hit.values[0];
     const passed=compareDecimal(l.value,rv)===0;
     const action=actionFor({bound:bound!==undefined,leftStatus:l.status,compared:true,passed,onFail:'quarantine_left'});
     results[i]=comparedNumeric(nk,l.value,rv,{passed,tolerance:'0',sides:SIDES,inputs_hash,left_fact_id:l.fact_id,action,
      detail:{...base,right:{...rightBase,locator,precision:{decimals:first.decimals,scale:first.scale}},scale:first.scale,...(tag!==l.source_concept?{tag_mismatch:true}:{})},
      ...(action==='record'?{}:{item:mismatchItem(PAIR,nk,l,rv,{...locator,document:entry.doc_url},inputs_hash)})});
    }
   }
   return results;
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
ls: src/lib/dq/fixtures/gold: No such file or directory
./node_modules/dsh-trade-strategy-evaluator/agents
./node_modules/playwright/lib/agents
./node_modules/playwright/lib/agents/generateAgents.js
./node_modules/caniuse-lite/dist/unpacker/agents.js
./node_modules/caniuse-lite/data/agents.js
./.claude/agents
import createNextIntlPlugin from 'next-intl/plugin';

const RECONCILE_MANIFESTS = ['./src/lib/dq/fixtures/gold/**/*.json', './src/lib/facts/fixtures/gold/*.json'];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
  outputFileTracingRoot: process.cwd(),
  // The reconcile cron reads the sample and gold manifests at runtime (src/lib/dq/reconcile/deps.ts); so do the
  // quarantine restore route and the admin dq dashboard (restoreInputsHashNow recomputes the current inputs hash).
  outputFileTracingIncludes: {
    '/api/cron/reconcile': RECONCILE_MANIFESTS,
    '/api/admin/dq/quarantine/[id]': RECONCILE_MANIFESTS,
    '/api/admin/dq': RECONCILE_MANIFESTS,
  },
  // Ignore the archived static demo
  webpack: (config) => {
    config.watchOptions = { ...config.watchOptions, ignored: ['**/legacy-demo/**'] };
    return config;
  },
  async redirects() {
    return [{ source: '/dashboard', destination: '/today', permanent: true }];
  },
};

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default withNextIntl(nextConfig);

exec
/bin/zsh -lc "cat src/lib/dq/reconcile/ixbrl.ts | grep -n -E 'dimension|segment|scenario|unsupported|entity'; cat src/lib/dq/reconcile/deps.ts; cat src/lib/dq/reconcile/run.ts | grep -n -E 'repoFile|members|invalid|catch'; git ls-tree -r --name-only 46a40f3 | grep -E '(AGENTS|CLAUDE|sample|select-us)'; nl -ba vercel.json | tail -18; cat src/lib/dq/reconcile/pair-us-ixbrl.test.ts | tail -28; cat src/lib/facts/providers/edgar-companyfacts.ts | grep -n -E 'duration|round|decimals|value'" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
8:// Supported subset (each has a test); everything else lands in `unsupported` and is never merged:
9://  - xbrli:context: entity/identifier; period startDate+endDate | instant, dates YYYY-MM-DD. ANY child
10://    element inside segment or scenario marks the context dimensional and its facts are skipped (out of
11://    scope by design, not reported). Facts carry (entity, period), so equal contexts with different ids
15://    'USD/share'); anything else → unsupported(unit).
22://    any other format or no match → unsupported(format); xsi:nil = true|1 → unsupported(nil).
26://    (whitespace-collapsed raw text; a second, different text → unsupported(nonnumeric_conflict)).
27://  - ix:fraction, ix:tuple and facts with tupleRef → unsupported. No ix element at all → not_inline_xbrl.
28:// Malformed XML throws IxbrlParseError(code); the pair turns that into unsupported results.
38:export interface IxFact{name:string;periodStart:string|null;periodEnd:string;unit:string;value:string;decimals:string|null;scale:number;entity:string;contextRef:string;unitRef:string}
40:export interface IxbrlDocument{facts:IxFact[];nonNumeric:Record<string,string>;unsupported:IxUnsupported[]}
86:  if(doc.startsWith('<!',lt)){const e=doc.indexOf('>',lt+2);if(e<0)fail('unterminated_declaration');if(doc.slice(lt,e).includes('['))fail('dtd_unsupported');i=e+1;continue;}
170:/** Right-side key of a fact: (concept, canonical context = entity + period, unit). */
171:export const ixFactKey=(f:Pick<IxFact,'name'|'entity'|'periodStart'|'periodEnd'|'unit'>)=>[f.name,f.entity,f.periodStart??'',f.periodEnd,f.unit].join('|');
185:interface RawCtx{id:string;scheme:string;ident:string;start:string;end:string;instant:string;forever:boolean;dimensional:boolean}
216: const out:IxbrlDocument={facts:[],nonNumeric:{},unsupported:[]};
225:  if(st.ctx!==null&&st.segDepth>=0){st.ctx.dimensional=true;return;}   // any element inside segment / scenario
230:    if(member)out.unsupported.push({reason:'tuple_member',name:attrOf(attrs,'name')});
235:    out.unsupported.push({reason:`ix_${f.local}`,name:attrOf(attrs,'name')});
240:  if(f.local==='context'){st.ctx={id:attrOf(attrs,'id')??'',scheme:'',ident:'',start:'',end:'',instant:'',forever:false,dimensional:false};return;}
242:   if(f.local==='segment'||f.local==='scenario'){st.segDepth=stack.length;return;}
273:   if((f.local==='segment'||f.local==='scenario')&&st.segDepth===stack.length){st.segDepth=-1;return;}
314: if(!st.sawIx)return {facts:[],nonNumeric:{},unsupported:[{reason:'not_inline_xbrl'}]};
318:  if(!nameQ){out.unsupported.push({reason:'name'});continue;}
322:   if(attrOf(f.attrs,'continuedAt')!==undefined){out.unsupported.push({reason:'continuation',name});continue;}
327:   else if(prev!==text){delete out.nonNumeric[name];conflicted.add(name);out.unsupported.push({reason:'nonnumeric_conflict',name});}
331:  if(attrOf(f.attrs,'continuedAt')!==undefined){out.unsupported.push({reason:'continuation',name});continue;}
334:  if(!c){out.unsupported.push({reason:'context',name,contextRef});continue;}
335:  if(dupCtx.has(contextRef)){out.unsupported.push({reason:'context_duplicate',name,contextRef});continue;}
336:  if(c.dimensional)continue;
337:  if(c.ident.trim()===''||c.scheme.trim()===''){out.unsupported.push({reason:'entity',name,contextRef});continue;}
339:  if(!period){out.unsupported.push({reason:'period',name,contextRef});continue;}
342:  if(nil==='true'||nil==='1'){out.unsupported.push({reason:'nil',...where});continue;}
345:  if(unitNorm===null){out.unsupported.push({reason:'unit',...where});continue;}
347:  if(!/^-?\d{1,2}$/.test(scaleRaw)){out.unsupported.push({reason:'scale',...where});continue;}
349:  if(decimalsRaw!==undefined&&!/^(INF|[+-]?\d+)$/.test(decimalsRaw)){out.unsupported.push({reason:'decimals',...where});continue;}
351:  if(sign!==undefined&&sign!=='-'){out.unsupported.push({reason:'sign',...where});continue;}
354:  if(digits===null){out.unsupported.push({reason:'format',...where});continue;}
355:  if(digits.startsWith('-')){out.unsupported.push({reason:'sign',...where});continue;}   // the sign belongs in the sign attribute
358:  try{value=canonicalDecimal(`${digits}e${scale}`);}catch{out.unsupported.push({reason:'decimal_bounds',...where});continue;}
360:  out.facts.push({name,periodStart:period.start,periodEnd:period.end,unit:unitNorm,value,decimals:decimalsRaw===undefined?null:decimalsRaw.replace(/^\+/,''),scale,entity:`${c.scheme}#${c.ident.trim()}`,contextRef,unitRef});
// src/lib/dq/reconcile/deps.ts
// Production wiring of ReconcileDeps (plan 3 Task 14c) shared by /api/cron/reconcile and
// scripts/dq/reconcile.ts: Supabase FactsDb / TableClient / RawStore (bucket reconcile-raw), the global
// fetch (the pairs pace SEC themselves), and readRepoFileFromDisk, which reads ONLY JSON files under the two
// gold fixture directories (the sample and gold manifests; next.config.mjs traces them into the cron
// function). Anything else — absolute paths, '..', other directories or extensions — is refused.
import {readFile} from 'node:fs/promises';
import {join,normalize} from 'node:path';
import type {SupabaseClient} from '@supabase/supabase-js';
import {supabaseTableClient} from '../../db/table-client';
import {supabaseFactsDb} from '../../facts/db';
import {getAdminSupabase} from '../../supabase/admin';
import {supabaseRawStore} from '../raw-store';
import type {Row} from '../../db/table-client';
import {makeBudget} from '../../facts/sync';
import type {InputsHashNow} from '../facts-resolver';
import {RECONCILE_PAIRS,inputsHashNow} from './pairs';
import type {ReconcileDeps} from './run';
import {CYCLE_PAIR_IDS} from './types';
import type {CyclePairId,PairContext} from './types';

export const REPO_FILE_PREFIXES:readonly string[]=['src/lib/dq/fixtures/gold/','src/lib/facts/fixtures/gold/'];
export async function readRepoFileFromDisk(path:string):Promise<Uint8Array>{
 const n=normalize(path).replace(/\\/g,'/');
 if(path.startsWith('/')||n!==path||n.includes('..')||!n.endsWith('.json')||!REPO_FILE_PREFIXES.some(p=>n.startsWith(p)))throw new Error('repo_file_not_allowed');
 return new Uint8Array(await readFile(join(process.cwd(),n)));
}

/** Data gaps of pairs.ts::inputsHashNow that mean "cannot restore now" (→ {unavailable:'inputs_unavailable'} → 409 not_passing / restorable=false), not a bug. */
const RESTORE_GAP_CODES:readonly string[]=['pair_not_registered','left_fact_missing','no_latest_result'];
/**
 * The CURRENT inputs hash of a reconcile_mismatch item (spec §5.6), injected into the quarantine route
 * (resolveFactsItem.inputsHashNow, Task 11) and the admin dashboard's server-computed `restorable` (Task 19a).
 */
export function restoreInputsHashNow(admin?:SupabaseClient):InputsHashNow{
 const sb=admin??getAdminSupabase();
 const now=()=>new Date();
 const ctx:PairContext={db:supabaseFactsDb(sb),tables:supabaseTableClient(sb),raw:supabaseRawStore(sb),now,budget:makeBudget(null,now),
  fetch:globalThis.fetch.bind(globalThis),readRepoFile:readRepoFileFromDisk};
 return async(item:Row)=>{
  try{return await inputsHashNow(ctx,item);}
  catch(e){
   // the pair's CURRENT right evidence cannot be obtained now (plan audit P2): restore stays disabled
   if(e instanceof Error&&e.message==='current_evidence_unavailable')return {unavailable:'current_evidence_unavailable'};
   if(e instanceof Error&&RESTORE_GAP_CODES.includes(e.message))return {unavailable:'inputs_unavailable'};
   throw e;
  }
 };
}

/** CN pairs run only with FACTS_CN_ENABLED=1 (no Tushare token / unverified gold: spec T15). Shared by the cron route and the script. */
export const cnPairEnabled=(pair:string,env:Record<string,string|undefined>=process.env):boolean=>!pair.startsWith('cn.')||env.FACTS_CN_ENABLED==='1';

export const RECONCILE_USAGE='usage: reconcile.ts --pair <cycle pair id> [--issuer <ticker>...] [--apply]';
export type ReconcileArgs={pair:CyclePairId;apply:boolean;tickers:string[]}|{exit:2;message:string};
/** Argument parsing and gates of scripts/dq/reconcile.ts (pure): bad arguments, unknown / unregistered pair, and --apply of a cn.* pair without FACTS_CN_ENABLED=1 (checked before any production deps exist; a dry run needs no gate). */
export function parseReconcileArgs(argv:readonly string[],env:Record<string,string|undefined>=process.env,registry:Partial<Record<CyclePairId,unknown>>=RECONCILE_PAIRS):ReconcileArgs{
 let pair='',apply=false;const tickers:string[]=[];
 for(let i=0;i<argv.length;i++){
  const x=argv[i],v=argv[i+1];
  if(x==='--pair'&&v){pair=v;i++;}
  else if(x==='--issuer'&&v){tickers.push(v);i++;}
  else if(x==='--apply')apply=true;
  else return {exit:2,message:RECONCILE_USAGE};
 }
 if(!(CYCLE_PAIR_IDS as readonly string[]).includes(pair))return {exit:2,message:RECONCILE_USAGE};
 if(apply&&!cnPairEnabled(pair,env))return {exit:2,message:'cn_disabled: --apply for cn.* pairs needs FACTS_CN_ENABLED=1'};
 if(!registry[pair as CyclePairId])return {exit:2,message:`${RECONCILE_USAGE}\nregistered: ${Object.keys(registry).join(', ')}`};
 return {pair:pair as CyclePairId,apply,tickers};
}

export interface ProductionReconcileOptions{deadline:Date|null;codeVersion:string;admin?:SupabaseClient}
export function productionReconcileDeps(opts:ProductionReconcileOptions):ReconcileDeps{
 const sb=opts.admin??getAdminSupabase();
 return {db:supabaseFactsDb(sb),tables:supabaseTableClient(sb),raw:supabaseRawStore(sb),fetch:globalThis.fetch.bind(globalThis),
  readRepoFile:readRepoFileFromDisk,now:()=>new Date(),deadline:opts.deadline,codeVersion:opts.codeVersion};
}
6://  1. cycle: the pair's running cycle, else (plan audit Q2) snapshot pending_members → resolve keys AFTER
7://     the snapshot (pair.members, then pair.memberFor for each snapshot target members() missed) →
11://  2. members in (issuer_id, market) order whose cursor is claimable; a member starts only with >= 60 s of
25://     detail.freshness={status:'pending',ok,detail}; only that key of detail, so pending_members written by
31:// a thrown evaluate does; after MAX_CURSOR_ATTEMPTS (3) claims the member is terminal (exec_failed_members).
32:// Everything after startBatch runs inside one try/catch like runFactsSync: an unexpected exception is pushed
37:// batch with its code and creates no cycle. Dry run: members + evaluate only, no writes by the runner.
71:export interface ReconcileReceipt{batchId:string|null;status:BatchStatus|'dry_run';counts:BatchCounts;errors:BatchError[];cycle:CycleReport|null;members:MemberReport[];hooks:{retried:number;failed:number};dryRun?:{issuerId:string;market:Market;results:ReconcileResultInput[]}[]}
82: if(!Array.isArray(row.members))throw new ReconcileError('cycle_members_invalid');
83: return row.members.map(m=>{
85:  if(typeof x.issuer_id!=='string'||(x.market!=='US'&&x.market!=='CN')||!Array.isArray(x.expected_keys))throw new ReconcileError('cycle_members_invalid');
91: const d=(row.detail??{}) as {pending_members?:unknown};
92: if(!Array.isArray(d.pending_members))return [];
93: return d.pending_members.filter((p):p is PendingMember=>!!p&&typeof (p as Row).issuer_id==='string'&&typeof (p as Row).source==='string'&&((p as Row).market==='US'||(p as Row).market==='CN'));
108: *  2. resolve expected keys AFTER the snapshot — pair.members(ctx), then pair.memberFor for each snapshot
109: *     target members() did not list — so every merge in the snapshot is visible to the resolver (a zero-key
121: const plans=[...await pair.members(ctx)];
130: const members=freeze(plans);
133: const out=await deps.db.openReconcileCycle({pair:pair.id,cycleId,startedAt:startedAt.toISOString(),members,pending});
142:async function ensureCursors(tables:TableClient,pair:CyclePairId,cycleId:string,members:FrozenMember[]):Promise<void>{
144: for(const m of members){
148:  }catch(e){if(!(e instanceof TableError&&e.code==='23505'))throw e;}
166: catch(e){console.error('[reconcile] hook observe',e instanceof Error?e.message:String(e));return undefined;}
175:  catch(e){   // an unresolvable target fails only this item's hook; the next run's step 0 retries it
189:  catch(e){
233:  try{await runHooks(deps,hooks.splice(0),errors);}catch(e){errors.push({code:'materialize_error',key,message:`hook_flush:${e instanceof Error?e.message.slice(0,100):'unknown'}`});}
245:   catch(e){if(isFence(e)){errors.push({code:'fence_failed',key});await flush();return report('fence_lost');}throw e;}
251:  catch(e){if(isFence(e)){errors.push({code:'fence_failed',key});return report('fence_lost');}throw e;}
252: }catch(e){
257:  catch(f){if(isFence(f)){errors.push({code:'fence_failed',key});return report('fence_lost',{code});}throw f;}
274: }catch(e){errors.push({code:'freshness_pending',key:cycleId,message:e instanceof Error?e.message:String(e)});return false;}
294: const fdetail={cycle_id:cycleId,compared_passed:passed,compared_failed:failedCmp,not_compared:notCompared,exec_failed_members:failedMembers};
295: // one locked SQL step: status/counters + detail.freshness (pending) only; it never rewrites other detail keys (pending_members)
297:  p_counts:{compared_passed:passed,compared_failed:failedCmp,not_compared:notCompared,exec_failed_members:failedMembers,finished_at:deps.now().toISOString()},
313:  for(const plan of await pair.members(ctx)){
318:  return {batchId:null,status:'dry_run',counts:emptyCounts(),errors:[],cycle:null,members:[],hooks:{retried:0,failed:0},dryRun:out};
320: const counts=emptyCounts();const errors:BatchError[]=[];const outcomes=new Map<string,number>();const members:MemberReport[]=[];
323: const sample=pair.inputs.repoFile===null?'':await deps.readRepoFile(pair.inputs.repoFile).then(sha256Hex,()=>'');
329:  return {batchId,status,counts,errors,cycle,members,hooks} satisfies ReconcileReceipt;
335:  catch(e){if(e instanceof ReconcileConfigError){errors.push({code:e.code,message:e.message});return finish(null);}throw e;}
346:   if(budget.remainingMs()<MIN_MEMBER_MS){errors.push({code:'deadline_hit',key});members.push({issuerId,market,outcome:'not_started'});continue;}
348:   if(!fence){errors.push({code:'skipped_summary',key:`${key}:claimed`});members.push({issuerId,market,outcome:'claimed_elsewhere'});continue;}
350:   members.push(r);
355:  catch(e){if(e instanceof ReconcileError&&e.code==='cursor_unaccounted')errors.push({code:'cursor_unaccounted',key:e.message});else throw e;}
357: }catch(e){
360:  try{await finishBatch(deps.tables,batchId,{counts,errors},deps.now());}catch{/* left running; the runbook marks it failed */}
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-NPEDhD3v' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-VWpZ5iu0' (errno=Operation not permitted)
docs/CLAUDE_EDGEONE_OSBORNALPHA_HANDOFF.md
docs/handoffs/alpha-a5/sample-2026-09-26.csv
scripts/cluster-sample.ts
src/lib/dq/reconcile/us-sample.test.ts
src/lib/dq/reconcile/us-sample.ts
supabase/migrations/20261006212400_quote_alert_window_samples.sql
    25	    {
    26	      "path": "/api/cron/securities-sync?region=us",
    27	      "schedule": "30 0 * * *"
    28	    },
    29	    {
    30	      "path": "/api/cron/facts-sync?market=US",
    31	      "schedule": "5 */4 * * *"
    32	    },
    33	    {
    34	      "path": "/api/cron/reconcile?pair=us.companyfacts_vs_ixbrl",
    35	      "schedule": "0 2 * * *"
    36	    },
    37	    {
    38	      "path": "/api/cron/reconcile?pair=facts.lineage_same_day",
    39	      "schedule": "0 4 * * *"
    40	    }
    41	  ]
    42	}
 it('is_inline_xbrl=false → every key unsupported(not_inline_xbrl), no fetch; an invalid sample refuses the run',async()=>{
  const s=await setup({sample:sample([filing(ACCN,URL1,KEYS,{is_inline_xbrl:false})]),docs:{}});
  const pair=usCompanyfactsVsIxbrlPair();const [m]=await pair.members(s.c);
  expect((await pair.evaluate(s.c,m)).every(r=>r.outcome==='unsupported'&&r.detail.reason==='not_inline_xbrl')).toBe(true);
  expect(s.fetch).not.toHaveBeenCalled();
  const bad=await setup({sample:{...sample([filing(ACCN,URL1,KEYS.slice(0,2))])},docs:{}});
  await expect(pair.members(bad.c)).rejects.toMatchObject({code:'invalid_sample_file'});
 });
 it('a 503 after retries is an execution failure (thrown, the runner fails the member), not a result',async()=>{
  const s=await setup({sample:sample([filing(ACCN,URL1,KEYS)]),docs:{[URL1]:503}});
  const pair=usCompanyfactsVsIxbrlPair();const [m]=await pair.members(s.c);
  await expect(pair.evaluate(s.c,m)).rejects.toThrow('sec_unavailable:http_503');
  expect(s.fetch).toHaveBeenCalledTimes(3);
 },15_000);
 it('failure bodies are stored as raw evidence without query strings in metadata',async()=>{
  const s=await setup({sample:sample([filing(ACCN,URL1,KEYS)]),docs:{}});
  const pair=usCompanyfactsVsIxbrlPair();const [m]=await pair.members(s.c);
  await pair.evaluate(s.c,m);
  expect(s.raw.objects.size).toBe(2);   // the (empty) 404 body, content-addressed, plus its metadata sidecar
  const meta=[...s.raw.objects.entries()].filter(([p])=>p.endsWith('.meta.json')||p.includes('meta')).map(([,b])=>new TextDecoder().decode(b)).join('');
  expect(meta).toContain('"http_status":404');expect(meta).not.toContain('?');
  expect(JSON.stringify(s.fetch.mock.calls.map(c=>c[0]))).not.toContain('?');
 });
 it('filerClass: case-insensitive, non-accelerated before accelerated, SRC alone is unknown',()=>{
  expect([filerClass('Large Accelerated Filer'),filerClass('Accelerated Filer'),filerClass('Non-accelerated Filer'),filerClass('Non-accelerated filer<br>Smaller reporting company'),filerClass('Smaller reporting company'),filerClass(null)])
   .toEqual(['large_accelerated','accelerated','non_accelerated','non_accelerated',null,null]);
 });
});
7:// → ambiguous_value (frame only there), filings.period_end = max end of the accn's duration entries,
14:// (3) odd durations: disagreement → ambiguous, otherwise every entry is parked. (4) SEC pacing reserves request
78: for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>max){await reader.cancel();throw new ProviderError('snapshot_too_large',`>${max}`);}chunks.push(value);}
100:export interface ParseOptions{concepts?:readonly ConceptDef[];sinceYear?:number;today?:Date}   // readonly: FACT_CONCEPTS is readonly (round-1 #4)
114: type Ent={e:CompanyFactsEntry;index:number;rawUnit:string;unit:string;dated:boolean;value:string};
135:     if(isDuration!==(concept.nature==='duration')){bump(`nature_mismatch:${qualified}`);return;}
139:     const list=groups.get(key)??[];list.push({e,index,rawUnit,unit,dated:isDate(e.filed),value:canonicalDecimal(e.val)});groups.set(key,list);
146:    const build=(x:Ent,duration:Duration):FactCandidate&{locator:string}=>({concept:concept.id,sourceConcept:qualified,statement:tax==='dei'?'DEI':concept.statement,periodStart:x.e.start??null,periodEnd:x.e.end,duration,value:x.value,unit,consolidation:'consolidated',filingRef:x.e.accn,rawHash:rawHashOf(snapshot.sha256,locator(x)),locator:locator(x)});
147:    const duration=first.start?classifyDuration(first.start,first.end):'INSTANT';
149:    const asDuration:Duration=duration==='odd'?nearestDuration(days):duration;
150:    if(new Set(g.map(x=>x.value)).size>1){
154:    if(duration==='odd'){for(const x of g)out.oddDuration.push(Object.assign(build(x,asDuration),{periodDays:days}));continue;}
157:     for(const x of g)out.missingAvailableDate.push({accn:x.e.accn,tag:qualified,start:x.e.start??null,end:x.e.end,unit:x.rawUnit,form:x.e.form??null,value:x.value,frame:x.e.frame??null,snapshot_sha256:snapshot.sha256,locator:locator(x)});
160:    out.candidates.push(build(dated,duration));
164: for(const {maxDurationEnd,...row} of filings.values())out.filings.push({...row,periodEnd:maxDurationEnd});

codex
The new production cron cannot run successfully because its required sample manifest is missing. The injected test fixtures do not verify that deployment prerequisite.

Review comment:

- [P1] Include the sample manifest before enabling the cron — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/vercel.json:33-36
  The scheduled pair requires `src/lib/dq/fixtures/gold/us-ixbrl-sample-v1.json`, but that file is absent from this commit's tree. Production reads it directly from disk, so every scheduled invocation fails with `invalid_sample_file` during member discovery and performs no reconciliation. Commit a valid manifest before enabling this schedule, or defer the cron until the manifest is available; the tests currently hide this failure by injecting sample bytes.
The new production cron cannot run successfully because its required sample manifest is missing. The injected test fixtures do not verify that deployment prerequisite.

Review comment:

- [P1] Include the sample manifest before enabling the cron — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/vercel.json:33-36
  The scheduled pair requires `src/lib/dq/fixtures/gold/us-ixbrl-sample-v1.json`, but that file is absent from this commit's tree. Production reads it directly from disk, so every scheduled invocation fails with `invalid_sample_file` during member discovery and performs no reconciliation. Commit a valid manifest before enabling this schedule, or defer the cron until the manifest is available; the tests currently hide this failure by injecting sample bytes.

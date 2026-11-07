OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b091-a2f2-7471-8a1b-107bb2b843d9
--------
user
commit f47981b
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline f47981b; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 1128ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-XyQoJlZx' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-kGoU7B8p' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/10-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-Ax1qtOcB' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-pNbYFfQF' (errno=Operation not permitted)
f47981b feat(facts): lineage materialisation contract and public reads (tickerAsOf, lineage, conflicts, recordedIssuerId, acceptedAt, metrics vector guard) (F3-4)
 src/app/api/facts/[ticker]/metrics/route.test.ts | 105 +++++++++++++----------
 src/app/api/facts/[ticker]/metrics/route.ts      |  49 ++++++-----
 src/app/api/facts/[ticker]/route.test.ts         |  35 +++++++-
 src/app/api/facts/[ticker]/route.ts              |  37 ++++----
 src/app/api/filings/[ticker]/route.test.ts       |  26 +++---
 src/app/api/filings/[ticker]/route.ts            |  20 +++--
 src/lib/facts/derive.test.ts                     |  68 +++++++++------
 src/lib/facts/derive.ts                          |  36 +++++---
 src/lib/facts/public-route.test.ts               |  22 +++--
 src/lib/facts/public-route.ts                    |  48 +++++++----
 src/lib/facts/sync-us.integration.test.ts        |   6 +-
 11 files changed, 286 insertions(+), 166 deletions(-)

exec
/bin/zsh -lc 'pwd; ls -a | head -30; for d in . .. ../.. ../../..; do for f in AGENTS.override.md AGENTS.md CLAUDE.md; do test ! -f "$d/$f" || { echo ==== $d/$f; cat "$d/$f"; }; done; done; git show f47981b -- src/lib/facts/derive.ts src/lib/facts/public-route.ts '"'src/app/api/*'" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 0ms:
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
zsh:1: === not found

exec
/bin/zsh -lc 'for d in . .. ../.. ../../..; do for f in AGENTS.override.md AGENTS.md CLAUDE.md; do if test -f "$d/$f"; then printf '"'\\nFILE %s\\n' \""'$d/$f"; cat "$d/$f"; fi; done; done; git show f47981b -- src/lib/facts/derive.ts src/lib/facts/public-route.ts '"'src/app/api/*'" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:

FILE ../../../AGENTS.md
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-PoZkTiOJ' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-B2Z28fv4' (errno=Operation not permitted)
commit f47981b27e43465e39d16a2d3265df2b51c1676c
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 03:14:43 2026 -0800

    feat(facts): lineage materialisation contract and public reads (tickerAsOf, lineage, conflicts, recordedIssuerId, acceptedAt, metrics vector guard) (F3-4)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/app/api/facts/[ticker]/metrics/route.test.ts b/src/app/api/facts/[ticker]/metrics/route.test.ts
index ac92ea5..d5aa041 100644
--- a/src/app/api/facts/[ticker]/metrics/route.test.ts
+++ b/src/app/api/facts/[ticker]/metrics/route.test.ts
@@ -1,73 +1,83 @@
 // src/app/api/facts/[ticker]/metrics/route.test.ts
 import {beforeEach,describe,expect,it,vi} from 'vitest';
-import type {FactRow,MetricRow} from '@/lib/facts/types';
+import type {FactRow,LineageRev,MetricRow} from '@/lib/facts/types';
 import {FORMULA_VERSION} from '@/lib/facts/derive';
 import {FactsDbError} from '@/lib/facts/types';
 
-const mocks=vi.hoisted(()=>({resolve:vi.fn(),readFacts:vi.fn(),metricsOfIssuer:vi.fn(),rev:vi.fn(),revArgs:vi.fn(),revError:vi.fn((): {message:string}|null=>null)}));
-vi.mock('@/lib/supabase/anon',()=>({getAnonSupabase:()=>({rpc:(fn:string,args:unknown)=>Promise.resolve(fn==='fact_state_rev'?(mocks.revArgs(args),mocks.revError()?{data:null,error:mocks.revError()}:{data:mocks.rev(),error:null}):{data:null,error:{message:'unexpected'}})})}));
+const mocks=vi.hoisted(()=>({resolve:vi.fn(),readFactsLineage:vi.fn(),metricsOfIssuer:vi.fn(),lineageOf:vi.fn(),stateRevs:vi.fn()}));
+vi.mock('@/lib/supabase/anon',()=>({getAnonSupabase:()=>({rpc:()=>Promise.resolve({data:null,error:{message:'unexpected rpc'}})})}));
 vi.mock('@/lib/entities/resolve',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/entities/resolve')>(),resolveIssuer:mocks.resolve}));
-vi.mock('@/lib/facts/db',()=>({supabaseFactsDb:()=>({readFacts:mocks.readFacts,metricsOfIssuer:mocks.metricsOfIssuer})}));
+vi.mock('@/lib/facts/db',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/facts/db')>(),
+ supabaseFactsDb:()=>({readFactsLineage:mocks.readFactsLineage,metricsOfIssuer:mocks.metricsOfIssuer,lineageOf:mocks.lineageOf,stateRevs:mocks.stateRevs})}));
 
 import {GET} from './route';
 
-const ISSUER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
-const metric=(p:Partial<MetricRow>={}):MetricRow=>({issuer_id:ISSUER,market:'US',metric:'gross_margin',period_start:'2024-01-01',period_end:'2024-03-31',duration:'3M',value:'0.4',unit:'pure',input_unit:'USD',basis:'us_standard',formula_version:FORMULA_VERSION,inputs:[{fact_id:'f1',concept:'gross_profit',filing_id:'g',available_date:'2024-05-01'}],based_on_rev:3,based_on_lineage:[{issuer_id:ISSUER,state_rev:3}],as_of:'2024-06-01',...p});
+const ISSUER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',SRC='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
+const V3:LineageRev[]=[{issuer_id:ISSUER,state_rev:3}];
+const metric=(p:Partial<MetricRow>={}):MetricRow=>({issuer_id:ISSUER,market:'US',metric:'gross_margin',period_start:'2024-01-01',period_end:'2024-03-31',duration:'3M',value:'0.4',unit:'pure',input_unit:'USD',basis:'us_standard',formula_version:FORMULA_VERSION,
+ inputs:[{fact_id:'f1',concept:'gross_profit',filing_id:'g',available_date:'2024-05-01'}],based_on_rev:3,based_on_lineage:V3,as_of:'2024-06-01',...p});
 const fact=(p:Partial<FactRow>):FactRow=>({fact_id:'f',issuer_id:ISSUER,market:'US',filing_id:'g',run_id:'r',concept:'revenue',source_concept:'Revenues',statement:'IS',period_start:'2024-01-01',period_end:'2024-03-31',duration:'3M',value:'10',value_text:'10',unit:'USD',consolidation:'consolidated',available_date:'2024-05-01',mapping_gen:1,mapping_version:'facts-map/1',status:'ok',raw_hash:'h',created_at:'2024-05-01T00:00:00Z',disclosure_seq:1,is_current:true,is_revision:false,...p});
 const get=(ticker:string,qs:string)=>GET(new Request(`https://alpha.example/api/facts/${ticker}/metrics?${qs}`),{params:Promise.resolve({ticker})});
 
 describe('GET /api/facts/[ticker]/metrics',()=>{
  beforeEach(()=>{
   vi.clearAllMocks();
-  mocks.revError.mockReturnValue(null);
-  mocks.rev.mockReturnValue(3);
   mocks.resolve.mockImplementation(async(_c:unknown,q:{ticker:string})=>({issuer_id:ISSUER,status:'active',names:{zh:null,en:null},identifiers:{cik:null,lei:null,usci:null},securities:[{ticker:q.ticker,isin:null,figi:null,share_class:null,is_primary:true,valid_from:'2000-01-01',valid_to:null}]}));
+  mocks.lineageOf.mockImplementation(async(t:string)=>[t]);
+  mocks.stateRevs.mockResolvedValue(V3);
   mocks.metricsOfIssuer.mockResolvedValue([metric(),metric({metric:'net_margin',value:'0.1',period_end:'2024-06-30',period_start:'2024-04-01'})]);
-  mocks.readFacts.mockResolvedValue({stateRev:9,rows:[fact({fact_id:'f1'}),fact({fact_id:'f2',concept:'gross_profit',source_concept:'GrossProfit',value:'4',value_text:'4'})],truncated:false});
+  mocks.readFactsLineage.mockResolvedValue({stateRevs:[{issuer_id:ISSUER,state_rev:9}],lineage:[ISSUER],conflicts:[],truncated:false,rows:[fact({fact_id:'f1'}),fact({fact_id:'f2',concept:'gross_profit',source_concept:'GrossProfit',value:'4',value_text:'4'})]});
  });
- it('without asOf reads the materialized table for the current formula version, filtered and shaped',async()=>{
+ it('without asOf serves the materialized rows of the target when lineage and revs agree before and after and every row carries that vector',async()=>{
   const res=await get('AAPL','metrics=gross_margin&from=2024-01-01&to=2024-03-31');
   expect(res.status).toBe(200);
   const body=await res.json();
-  expect(body).toMatchObject({issuerId:ISSUER,ticker:'AAPL',market:'US',asOf:null,mappingGen:1,formulaVersion:FORMULA_VERSION,truncated:false,stale:false});
-  expect(body.metrics).toEqual([{metric:'gross_margin',periodStart:'2024-01-01',periodEnd:'2024-03-31',duration:'3M',value:'0.4',unit:'pure',inputUnit:'USD',basis:'us_standard',inputs:[{fact_id:'f1',concept:'gross_profit',filing_id:'g',available_date:'2024-05-01'}],basedOnRev:3}]);
+  expect(body).toMatchObject({issuerId:ISSUER,ticker:'AAPL',market:'US',asOf:null,mappingGen:1,formulaVersion:FORMULA_VERSION,truncated:false,stale:false,lineage:[ISSUER],resolution:{tickerAsOf:expect.any(String),issuerId:ISSUER,validFromMethod:null}});
+  expect(body.metrics).toEqual([{metric:'gross_margin',periodStart:'2024-01-01',periodEnd:'2024-03-31',duration:'3M',value:'0.4',unit:'pure',inputUnit:'USD',basis:'us_standard',inputs:[{fact_id:'f1',concept:'gross_profit',filing_id:'g',available_date:'2024-05-01'}],basedOnRev:3,basedOnLineage:V3}]);
   expect(mocks.metricsOfIssuer).toHaveBeenCalledWith(ISSUER,'US',FORMULA_VERSION);
-  expect(mocks.readFacts).not.toHaveBeenCalled();
+  expect(mocks.readFactsLineage).not.toHaveBeenCalled();
+  expect(mocks.lineageOf).toHaveBeenCalledTimes(2);expect(mocks.stateRevs).toHaveBeenCalledTimes(2);
+  expect(mocks.stateRevs).toHaveBeenCalledWith([ISSUER],'US');
   expect(res.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=60');
-  expect(mocks.rev).toHaveBeenCalledTimes(2);
-  expect(mocks.revArgs).toHaveBeenCalledWith({p_issuer:ISSUER,p_market:'US'});
  });
- it('stale metrics (based_on_rev behind the current fact state) are not served: stale:true, no rows, short cache',async()=>{
-  mocks.rev.mockReturnValue(4);
+ it('a merged target: lineage [T, S] with both revs in every row is served',async()=>{
+  const V=[{issuer_id:ISSUER,state_rev:3},{issuer_id:SRC,state_rev:7}];
+  mocks.lineageOf.mockResolvedValue([ISSUER,SRC]);mocks.stateRevs.mockResolvedValue(V);
+  mocks.metricsOfIssuer.mockResolvedValue([metric({based_on_lineage:V})]);
+  const body=await (await get('AAPL','')).json();
+  expect(body).toMatchObject({stale:false,lineage:[ISSUER,SRC]});
+  expect(body.metrics[0].basedOnLineage).toEqual(V);
+  expect(mocks.stateRevs).toHaveBeenCalledWith([ISSUER,SRC],'US');
+ });
+ it('T8: revs that move while the metrics are read are stale (no rows, short cache)',async()=>{
+  mocks.stateRevs.mockResolvedValueOnce(V3).mockResolvedValue([{issuer_id:ISSUER,state_rev:4}]);
   const res=await get('AAPL','metrics=gross_margin');
-  expect(res.status).toBe(200);
   expect(await res.json()).toMatchObject({stale:true,metrics:[]});
   expect(res.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=30');
  });
- it('rev that moves while the metrics are being read is stale too',async()=>{
-  mocks.rev.mockReturnValueOnce(3).mockReturnValue(4);
-  const body=await (await get('AAPL','')).json();
-  expect(body).toMatchObject({stale:true,metrics:[]});
+ it('T8: rows whose based_on_lineage is not the current vector are stale even when based_on_rev matches the target',async()=>{
+  const V=[{issuer_id:ISSUER,state_rev:3},{issuer_id:SRC,state_rev:7}];
+  mocks.lineageOf.mockResolvedValue([ISSUER,SRC]);mocks.stateRevs.mockResolvedValue(V);
+  mocks.metricsOfIssuer.mockResolvedValue([metric()]);                                   // materialized before the merge: [T@3] only
+  expect(await (await get('AAPL','')).json()).toMatchObject({stale:true,metrics:[]});
  });
- it('a fact_state_rev RPC error is a 500, never reported as stale',async()=>{
-  mocks.revError.mockReturnValue({message:'rpc down'});
+ it('T8: a lineage that changes membership between the two reads is stale',async()=>{
+  mocks.lineageOf.mockResolvedValueOnce([ISSUER]).mockResolvedValue([ISSUER,SRC]);
+  mocks.stateRevs.mockResolvedValueOnce(V3).mockResolvedValue([{issuer_id:ISSUER,state_rev:3},{issuer_id:SRC,state_rev:1}]);
+  expect(await (await get('AAPL','')).json()).toMatchObject({stale:true,metrics:[]});
+ });
+ it('a stateRevs failure is a 500 (never reported as stale); an unstable metrics read is stale; no rows yet is an empty non-stale answer',async()=>{
   const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
+  mocks.stateRevs.mockRejectedValueOnce(new Error('rpc down'));
   const res=await get('AAPL','');
+  expect(res.status).toBe(500);expect((await res.json()).error.code).toBe('internal');
   spy.mockRestore();
-  expect(res.status).toBe(500);
-  expect((await res.json()).error.code).toBe('internal');
- });
- it('an unstable metrics read is stale, not a 500',async()=>{
-  mocks.metricsOfIssuer.mockRejectedValue(new FactsDbError('unknown','metrics_unstable'));
-  const res=await get('AAPL','');
-  expect(res.status).toBe(200);
-  expect(await res.json()).toMatchObject({stale:true,metrics:[]});
- });
- it('current metrics with no rows yet are an empty, non-stale answer',async()=>{
-  mocks.metricsOfIssuer.mockResolvedValue([]);
-  const res=await get('AAPL','');
-  expect(await res.json()).toMatchObject({stale:false,metrics:[]});
-  expect(res.headers.get('cache-control')).toBe('no-store');
+  mocks.metricsOfIssuer.mockRejectedValueOnce(new FactsDbError('unknown','metrics_unstable'));
+  expect(await (await get('AAPL','')).json()).toMatchObject({stale:true,metrics:[]});
+  mocks.metricsOfIssuer.mockResolvedValueOnce([]);
+  const empty=await get('AAPL','');
+  expect(await empty.json()).toMatchObject({stale:false,metrics:[]});
+  expect(empty.headers.get('cache-control')).toBe('no-store');
  });
  it('internal errors give a code only, no message',async()=>{
   mocks.metricsOfIssuer.mockRejectedValue(new Error('secret db detail'));
@@ -77,25 +87,32 @@ describe('GET /api/facts/[ticker]/metrics',()=>{
   expect(res.status).toBe(500);
   expect(JSON.stringify(await res.json())).not.toContain('secret');
  });
- it('with asOf derives live from the read_facts envelope and stamps basedOnRev with its state_rev',async()=>{
+ it('with asOf derives live over the lineage envelope: basedOnRev = the target rev, basedOnLineage = the envelope vector',async()=>{
+  const V=[{issuer_id:ISSUER,state_rev:9},{issuer_id:SRC,state_rev:2}];
+  mocks.lineageOf.mockResolvedValue([ISSUER,SRC]);
+  mocks.readFactsLineage.mockResolvedValue({stateRevs:V,lineage:[ISSUER,SRC],conflicts:[],truncated:false,rows:[fact({fact_id:'f1',issuer_id:SRC}),fact({fact_id:'f2',concept:'gross_profit',source_concept:'GrossProfit',value:'4',value_text:'4'})]});
   const res=await get('AAPL','asOf=2024-06-30&metrics=gross_margin');
   const body=await res.json();
   expect(body.asOf).toBe('2024-06-30');
-  expect(body.metrics).toEqual([expect.objectContaining({metric:'gross_margin',value:'0.4',basedOnRev:9})]);
-  expect(mocks.readFacts.mock.calls[0][2]).toMatchObject({asOf:'2024-06-30',history:true});
+  expect(body.metrics).toEqual([expect.objectContaining({metric:'gross_margin',value:'0.4',basedOnRev:9,basedOnLineage:V})]);
+  expect(mocks.readFactsLineage.mock.calls[0][0]).toEqual([ISSUER,SRC]);
+  expect(mocks.readFactsLineage.mock.calls[0][2]).toMatchObject({asOf:'2024-06-30',history:true});
   expect(res.headers.get('cache-control')).toBe('public, max-age=600, s-maxage=3600');
  });
  it('passes truncated through with no rows and no-store',async()=>{
-  mocks.readFacts.mockResolvedValue({stateRev:1,rows:[],truncated:true});
+  mocks.readFactsLineage.mockResolvedValue({stateRevs:V3,lineage:[ISSUER],conflicts:[],rows:[],truncated:true});
   const res=await get('AAPL','asOf=2024-06-30');
   expect(await res.json()).toMatchObject({truncated:true,metrics:[]});
   expect(res.headers.get('cache-control')).toBe('no-store');
  });
- it('validates metrics against the market vocabulary, limit and dates; 404 unknown ticker',async()=>{
-  expect((await get('AAPL','metrics=ttm_capex_incl_intangibles')).status).toBe(400);   // CN-only name on a US ticker
+ it('validates metrics against the market vocabulary, limit, dates and tickerAsOf; 404 unknown ticker',async()=>{
+  expect((await get('AAPL','metrics=ttm_capex_incl_intangibles')).status).toBe(400);
   expect((await get('600519.SH','metrics=ttm_capex_incl_intangibles')).status).toBe(200);
   expect((await get('AAPL','limit=1001')).status).toBe(400);
   expect((await get('AAPL','asOf=2024-02-30')).status).toBe(400);
+  expect((await get('AAPL','tickerAsOf=2999-01-01')).status).toBe(400);
+  await get('AAPL','tickerAsOf=2021-01-04');
+  expect(mocks.resolve).toHaveBeenLastCalledWith(expect.anything(),{ticker:'AAPL'},{asOf:'2021-01-04'});
   mocks.resolve.mockResolvedValue(null);
   expect((await get('AAPL','')).status).toBe(404);
  });
diff --git a/src/app/api/facts/[ticker]/metrics/route.ts b/src/app/api/facts/[ticker]/metrics/route.ts
index f5745f9..21b58e0 100644
--- a/src/app/api/facts/[ticker]/metrics/route.ts
+++ b/src/app/api/facts/[ticker]/metrics/route.ts
@@ -1,53 +1,62 @@
 // src/app/api/facts/[ticker]/metrics/route.ts
-// Public derived metrics (spec §9): without asOf the materialized financial_metrics rows of the
-// current FORMULA_VERSION; with asOf a live deriveMetrics over the read_facts envelope (asOf
-// replay), basedOnRev = the envelope's state_rev. Metric names are validated per market.
+// Public derived metrics (spec §9; plan 3 §4.4, T8). Without asOf: the materialized
+// financial_metrics rows of the lineage target T for the current FORMULA_VERSION, served only when
+// the lineage members and their state_revs read before and after the metrics read are identical
+// and every row's based_on_lineage equals that vector; any mismatch or an unstable read →
+// metrics:[], stale:true, STALE_CACHE_CONTROL (never recomputed inline: the visibility paths
+// re-materialise). With asOf: a live deriveLineageMetrics over the read_facts_lineage envelope
+// (asOf replay), basedOnRev = T's rev, basedOnLineage = the envelope vector. Metric names are
+// validated per market; tickerAsOf picks the ticker's owner at that date.
 import {NextResponse} from 'next/server';
 import {MAPPING_GEN} from '@/lib/facts/concepts';
-import {DERIVE_CONCEPTS,FORMULA_VERSION,deriveMetrics,metricNames} from '@/lib/facts/derive';
-import {FRESH_METRICS_CACHE_CONTROL,STALE_CACHE_CONTROL,QueryError,TICKER_RE,dateParam,decodeTicker,errorResponse,failureResponse,intParam,listParam,paramErrorResponse,publicClients,readParams,resolvePublicIssuer,successHeaders,utcDate} from '@/lib/facts/public-route';
+import {lineageRevsEqual} from '@/lib/facts/db';
+import {DERIVE_CONCEPTS,FORMULA_VERSION,deriveLineageMetrics,metricNames} from '@/lib/facts/derive';
+import {FRESH_METRICS_CACHE_CONTROL,STALE_CACHE_CONTROL,QueryError,TICKER_RE,dateParam,decodeTicker,errorResponse,failureResponse,intParam,listParam,paramErrorResponse,publicClients,publicResolution,readParams,resolvePublicIssuer,successHeaders,tickerAsOfParam,utcDate} from '@/lib/facts/public-route';
 import {FactsDbError} from '@/lib/facts/types';
 import type {MetricRow} from '@/lib/facts/types';
 
 export const dynamic='force-dynamic';
-const PARAMS=['metrics','from','to','asOf','limit'] as const;
+const PARAMS=['metrics','from','to','asOf','limit','tickerAsOf'] as const;
 const DEFAULT_LIMIT=200,MAX_LIMIT=1000;
-const publicMetric=(m:MetricRow)=>({metric:m.metric,periodStart:m.period_start,periodEnd:m.period_end,duration:m.duration,value:m.value,unit:m.unit,inputUnit:m.input_unit,basis:m.basis,inputs:m.inputs,basedOnRev:m.based_on_rev});
+const publicMetric=(m:MetricRow)=>({metric:m.metric,periodStart:m.period_start,periodEnd:m.period_end,duration:m.duration,value:m.value,unit:m.unit,inputUnit:m.input_unit,basis:m.basis,inputs:m.inputs,basedOnRev:m.based_on_rev,basedOnLineage:m.based_on_lineage});
 
 export async function GET(req:Request,{params}:{params:Promise<{ticker:string}>}){
  const now=new Date();const today=utcDate(now);
  const {ticker:raw}=await params;const ticker=decodeTicker(raw);
  if(ticker===null||!TICKER_RE.test(ticker))return errorResponse('invalid_parameter:ticker','invalid ticker',400);
- let p:Map<string,string>,from:string|undefined,to:string|undefined,asOf:string|undefined,limit:number;
+ let p:Map<string,string>,from:string|undefined,to:string|undefined,asOf:string|undefined,limit:number,tickerAsOf:string;
  try{
   p=readParams(new URL(req.url),PARAMS);
-  from=dateParam(p,'from');to=dateParam(p,'to');asOf=dateParam(p,'asOf');limit=intParam(p,'limit',DEFAULT_LIMIT,MAX_LIMIT);
+  from=dateParam(p,'from');to=dateParam(p,'to');asOf=dateParam(p,'asOf');limit=intParam(p,'limit',DEFAULT_LIMIT,MAX_LIMIT);tickerAsOf=tickerAsOfParam(p,today);
   if(asOf!==undefined&&asOf>today)throw new QueryError('asOf');
  }catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
  try{
-  const {tables,db,stateRev}=publicClients();
-  const issuer=await resolvePublicIssuer(tables,ticker,today);
+  const {tables,db}=publicClients();
+  const issuer=await resolvePublicIssuer(tables,ticker,today,tickerAsOf);
   if(!issuer)return errorResponse('unknown_ticker','no issuer for ticker',404);
   let metrics:string[]|undefined;
   try{metrics=listParam(p,'metrics',new Set(metricNames(issuer.market)),metricNames(issuer.market).length);}
   catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
+  const target=issuer.issuerId;
+  const lineage=await db.lineageOf(target);
   let rows:MetricRow[],truncated=false,stale=false;
   if(asOf===undefined){
-   // Serve materialised rows only if they were derived from the CURRENT fact state: rev before,
-   // rows (one consistent based_on_rev, enforced by metricsOfIssuer), rev after. Any mismatch (or
-   // an unstable metrics read) means facts changed visibility since materialisation: no rows.
-   const rev=await stateRev(issuer.issuerId,issuer.market);
-   try{rows=await db.metricsOfIssuer(issuer.issuerId,issuer.market,FORMULA_VERSION);}
+   const before=await db.stateRevs(lineage,issuer.market);
+   try{rows=await db.metricsOfIssuer(target,issuer.market,FORMULA_VERSION);}
    catch(e){if(e instanceof FactsDbError&&e.message==='metrics_unstable'){rows=[];stale=true;}else throw e;}
-   if(!stale&&rows.length>0&&(rows.some(m=>m.based_on_rev!==rev)||await stateRev(issuer.issuerId,issuer.market)!==rev)){rows=[];stale=true;}
+   if(!stale&&rows.length>0){
+    const lineageAfter=await db.lineageOf(target);
+    const after=await db.stateRevs(lineageAfter,issuer.market);
+    if(lineageAfter.join(',')!==lineage.join(',')||!lineageRevsEqual(before,after)||rows.some(m=>!lineageRevsEqual(m.based_on_lineage,before))){rows=[];stale=true;}
+   }
   }else{
-   const env=await db.readFacts(issuer.issuerId,issuer.market,{concepts:[...DERIVE_CONCEPTS[issuer.market]],asOf,history:true});
+   const env=await db.readFactsLineage(lineage,issuer.market,{concepts:[...DERIVE_CONCEPTS[issuer.market]],asOf,history:true});
    truncated=env.truncated;
-   rows=truncated?[]:deriveMetrics(env.rows,{market:issuer.market,asOf,basedOnRev:env.stateRev});
+   rows=truncated?[]:deriveLineageMetrics(env.rows,target,lineage,{market:issuer.market,asOf,basedOn:env.stateRevs});
   }
   const wanted=metrics?new Set(metrics):null;
   rows=rows.filter(m=>(!wanted||wanted.has(m.metric))&&(from===undefined||m.period_end>=from)&&(to===undefined||m.period_end<=to)).slice(0,limit);
-  const body={issuerId:issuer.issuerId,ticker:issuer.ticker,market:issuer.market,asOf:asOf??null,mappingGen:MAPPING_GEN,formulaVersion:FORMULA_VERSION,truncated,stale,metrics:rows.map(publicMetric)};
+  const body={issuerId:target,ticker:issuer.ticker,market:issuer.market,asOf:asOf??null,mappingGen:MAPPING_GEN,formulaVersion:FORMULA_VERSION,truncated,stale,lineage,resolution:publicResolution(issuer),metrics:rows.map(publicMetric)};
   return NextResponse.json(body,{headers:stale?{'Cache-Control':STALE_CACHE_CONTROL}:asOf===undefined&&rows.length>0?{'Cache-Control':FRESH_METRICS_CACHE_CONTROL}:successHeaders(now,asOf,rows.length===0||truncated)});
  }catch(e){return failureResponse(e,'facts/metrics','metrics read failed');}
 }
diff --git a/src/app/api/facts/[ticker]/route.test.ts b/src/app/api/facts/[ticker]/route.test.ts
index 85da537..2436502 100644
--- a/src/app/api/facts/[ticker]/route.test.ts
+++ b/src/app/api/facts/[ticker]/route.test.ts
@@ -2,10 +2,12 @@
 import {beforeEach,describe,expect,it,vi} from 'vitest';
 import type {FactRow,FilingRow} from '@/lib/facts/types';
 
-const mocks=vi.hoisted(()=>({resolve:vi.fn(),readFacts:vi.fn(),factsByIds:vi.fn(),filingsOfIssuer:vi.fn()}));
+const mocks=vi.hoisted(()=>({resolve:vi.fn(),readFacts:vi.fn(),factsByIds:vi.fn(),filingsOfIssuer:vi.fn(),lineageOf:vi.fn()}));
 vi.mock('@/lib/supabase/anon',()=>({getAnonSupabase:()=>({})}));
 vi.mock('@/lib/entities/resolve',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/entities/resolve')>(),resolveIssuer:mocks.resolve}));
-vi.mock('@/lib/facts/db',()=>({supabaseFactsDb:()=>({readFacts:mocks.readFacts,factsByIds:mocks.factsByIds,filingsOfIssuer:mocks.filingsOfIssuer})}));
+vi.mock('@/lib/facts/db',()=>({supabaseFactsDb:()=>({factsByIds:mocks.factsByIds,filingsOfIssuer:mocks.filingsOfIssuer,lineageOf:mocks.lineageOf,
+ // the route reads the lineage envelope; tests keep asserting on readFacts-shaped mocks (first member, same options)
+ readFactsLineage:async(issuers:string[],market:string,opts:unknown)=>{const r=await mocks.readFacts(issuers[0],market,opts);return {stateRevs:issuers.map(i=>({issuer_id:i,state_rev:r.stateRev})),lineage:issuers,rows:r.rows,conflicts:r.conflicts??[],truncated:r.truncated};}})}));
 
 import {GET} from './route';
 
@@ -19,6 +21,7 @@ const TODAY=new Date().toISOString().slice(0,10);
 describe('GET /api/facts/[ticker]',()=>{
  beforeEach(()=>{
   vi.clearAllMocks();
+  mocks.lineageOf.mockImplementation(async(t:string)=>[t]);
   mocks.resolve.mockImplementation(async(_c:unknown,q:{ticker:string})=>({issuer_id:ISSUER,status:'active',names:{zh:null,en:'Apple'},identifiers:{cik:'320193',lei:null,usci:null},securities:[{ticker:q.ticker,isin:null,figi:null,share_class:null,is_primary:true,valid_from:'2000-01-01',valid_to:null}]}));
   mocks.readFacts.mockResolvedValue({stateRev:5,rows:[fact()],truncated:false});
   mocks.filingsOfIssuer.mockResolvedValue([filing()]);
@@ -29,8 +32,8 @@ describe('GET /api/facts/[ticker]',()=>{
   expect(res.status).toBe(200);
   const body=await res.json();
   expect(body).toMatchObject({issuerId:ISSUER,ticker:'AAPL',market:'US',asOf:'2024-06-30',mappingGen:1,truncated:false});
-  expect(body.facts[0]).toMatchObject({factId:F1,concept:'revenue',sourceConcept:'Revenues',value:'383285000000',availableDate:'2023-11-03',disclosureSeq:1,isCurrent:true,isRevision:false,mappingGen:1,filingId:FID});
-  expect(body.filings).toEqual([{filingId:FID,formType:'10-K',periodEnd:'2023-09-30',availableDate:'2023-11-03',sourceRef:'0000320193-23-000106',url:'https://www.sec.gov/x',documentRef:null,documentUrl:null,citation:'edgar'}]);
+  expect(body.facts[0]).toMatchObject({factId:F1,concept:'revenue',sourceConcept:'Revenues',value:'383285000000',availableDate:'2023-11-03',disclosureSeq:1,isCurrent:true,isRevision:false,mappingGen:1,filingId:FID,recordedIssuerId:ISSUER});
+  expect(body.filings).toEqual([{filingId:FID,formType:'10-K',periodEnd:'2023-09-30',availableDate:'2023-11-03',sourceRef:'0000320193-23-000106',url:'https://www.sec.gov/x',documentRef:null,documentUrl:null,citation:'edgar',acceptedAt:null,recordedIssuerId:ISSUER}]);
   expect(res.headers.get('cache-control')).toBe('public, max-age=600, s-maxage=3600');
   expect(mocks.readFacts).toHaveBeenCalledWith(ISSUER,'US',{concepts:['revenue'],asOf:'2024-06-30',from:undefined,to:undefined,history:false,limit:200});
   expect(mocks.resolve).toHaveBeenCalledWith(expect.anything(),{ticker:'AAPL'},{asOf:TODAY});
@@ -118,4 +121,28 @@ describe('GET /api/facts/[ticker]',()=>{
   expect(err.status).toBe(500);expect(err.headers.get('cache-control')).toBe('no-store');
   spy.mockRestore();
  });
+ it('lineage: the target answers with every member\'s rows (recordedIssuerId), the conflicts withheld from current values, and the filings of every member',async()=>{
+  const SRC='dddddddd-dddd-4ddd-8ddd-dddddddddddd',G2='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
+  mocks.lineageOf.mockResolvedValue([ISSUER,SRC]);
+  mocks.readFacts.mockResolvedValue({stateRev:3,truncated:false,rows:[fact(),fact({fact_id:'f2',issuer_id:SRC,filing_id:G2})],conflicts:[{key:{concept:'revenue'},available_date:'2023-11-03',fact_ids:['x','y']}]});
+  mocks.filingsOfIssuer.mockImplementation(async(i:string)=>i===SRC?[filing({filing_id:G2,issuer_id:SRC,accepted_at:'2023-11-03T21:00:00.000Z',acceptance_source:'sec_submissions'})]:[filing()]);
+  const body=await (await get('AAPL','concepts=revenue')).json();
+  expect(body).toMatchObject({issuerId:ISSUER,lineage:[ISSUER,SRC],resolution:{tickerAsOf:TODAY,issuerId:ISSUER,validFromMethod:null},conflicts:[{key:{concept:'revenue'},availableDate:'2023-11-03',factIds:['x','y']}]});
+  expect(body.facts.map((f:{recordedIssuerId:string})=>f.recordedIssuerId)).toEqual([ISSUER,SRC]);
+  expect(body.filings.map((f:{filingId:string;acceptedAt:string|null;recordedIssuerId:string})=>[f.filingId,f.acceptedAt,f.recordedIssuerId])).toEqual([[FID,null,ISSUER],[G2,'2023-11-03T21:00:00.000Z',SRC]]);
+  expect(mocks.filingsOfIssuer.mock.calls.map(c=>c[0]).sort()).toEqual([ISSUER,SRC].sort());
+ });
+ it('tickerAsOf: passed to resolveIssuer as asOf and echoed; validFromMethod from the resolved row; a future tickerAsOf is 400; factIds keep lineage members only',async()=>{
+  mocks.resolve.mockImplementationOnce(async(_c:unknown,q:{ticker:string})=>({issuer_id:ISSUER,status:'active',names:{zh:null,en:null},identifiers:{cik:null,lei:null,usci:null},securities:[{ticker:q.ticker,isin:null,figi:null,share_class:null,is_primary:true,valid_from:'2000-01-01',valid_to:null,valid_from_method:'listing_date',valid_to_method:null}]}));
+  const res=await get('AAPL','concepts=revenue&tickerAsOf=2020-01-01');
+  expect(res.status).toBe(200);
+  expect(mocks.resolve).toHaveBeenLastCalledWith(expect.anything(),{ticker:'AAPL'},{asOf:'2020-01-01'});
+  expect((await res.json()).resolution).toEqual({tickerAsOf:'2020-01-01',issuerId:ISSUER,validFromMethod:'listing_date'});
+  const bad=await get('AAPL','concepts=revenue&tickerAsOf=2999-01-01');
+  expect(bad.status).toBe(400);expect((await bad.json()).error.code).toBe('invalid_parameter:tickerAsOf');
+  mocks.lineageOf.mockResolvedValue([ISSUER,'other']);
+  mocks.factsByIds.mockResolvedValue([fact(),fact({fact_id:OTHER,issuer_id:'other'}),fact({fact_id:'99999999-9999-4999-8999-999999999998',issuer_id:'stranger'})]);
+  const ev=await (await get('AAPL',`factIds=${F1},${OTHER}`)).json();
+  expect(ev.facts.map((f:{factId:string})=>f.factId)).toEqual([F1,OTHER]);
+ });
 });
diff --git a/src/app/api/facts/[ticker]/route.ts b/src/app/api/facts/[ticker]/route.ts
index fc9fe59..3b1e363 100644
--- a/src/app/api/facts/[ticker]/route.ts
+++ b/src/app/api/facts/[ticker]/route.ts
@@ -1,14 +1,17 @@
 // src/app/api/facts/[ticker]/route.ts
-// Public disclosure-log read (spec §9): concepts mode (read_facts envelope, asOf replay, history,
-// durations, limit = natural keys) or factIds evidence mode (≤ 100 ids, any mapping generation,
-// RLS limits to status ok). Filings returned are exactly those referenced by the returned facts.
+// Public disclosure-log read (spec §9; plan 3 §4.4): concepts mode (read_facts_lineage envelope over
+// the issuer's lineage, asOf replay, history, durations, limit = natural keys) or factIds evidence
+// mode (≤ 100 ids, any mapping generation, RLS limits to status ok, rows of lineage members only).
+// tickerAsOf picks the ticker's owner at that date. The body names the lineage target (issuerId),
+// its lineage, the cross-issuer conflicts withheld from current values, and every row's
+// recordedIssuerId; filings returned are exactly those referenced by the returned facts.
 import {NextResponse} from 'next/server';
 import {CONCEPT_IDS as CONCEPT_ID_LIST,MAPPING_GEN,MAX_READ_CONCEPTS} from '@/lib/facts/concepts';
-import {QueryError,TICKER_RE,UUID_RE,asOfParam,dateParam,decodeTicker,errorResponse,failureResponse,flagParam,intParam,isPublished,listParam,paramErrorResponse,publicClients,publicFact,publicFiling,readParams,resolvePublicIssuer,successHeaders,utcDate} from '@/lib/facts/public-route';
-import type {Duration,FactRow} from '@/lib/facts/types';
+import {QueryError,TICKER_RE,UUID_RE,asOfParam,dateParam,decodeTicker,errorResponse,failureResponse,flagParam,intParam,lineageFilings,listParam,paramErrorResponse,publicClients,publicConflict,publicFact,publicFiling,publicResolution,readParams,resolvePublicIssuer,successHeaders,tickerAsOfParam,utcDate} from '@/lib/facts/public-route';
+import type {Duration,FactRow,LineageConflict} from '@/lib/facts/types';
 
 export const dynamic='force-dynamic';
-const PARAMS=['concepts','factIds','from','to','asOf','durations','history','limit'] as const;
+const PARAMS=['concepts','factIds','from','to','asOf','durations','history','limit','tickerAsOf'] as const;
 const CONCEPT_IDS=new Set(CONCEPT_ID_LIST);
 const DURATIONS=new Set<string>(['3M','6M','9M','12M','INSTANT']);
 const MAX_FACT_IDS=100,DEFAULT_LIMIT=200,MAX_LIMIT=1000;
@@ -17,7 +20,7 @@ export async function GET(req:Request,{params}:{params:Promise<{ticker:string}>}
  const now=new Date();const today=utcDate(now);
  const {ticker:raw}=await params;const ticker=decodeTicker(raw);
  if(ticker===null||!TICKER_RE.test(ticker))return errorResponse('invalid_parameter:ticker','invalid ticker',400);
- let q:{concepts?:string[];factIds?:string[];from?:string;to?:string;asOf:string;durations?:Set<string>;history:boolean;limit:number};
+ let q:{concepts?:string[];factIds?:string[];from?:string;to?:string;asOf:string;durations?:Set<string>;history:boolean;limit:number;tickerAsOf:string};
  try{
   const p=readParams(new URL(req.url),PARAMS);
   const concepts=listParam(p,'concepts',CONCEPT_IDS,MAX_READ_CONCEPTS);
@@ -25,23 +28,24 @@ export async function GET(req:Request,{params}:{params:Promise<{ticker:string}>}
   if(factIds&&factIds.some(id=>!UUID_RE.test(id)))throw new QueryError('factIds');
   if((concepts===undefined)===(factIds===undefined))throw new QueryError(concepts?'factIds':'concepts');   // exactly one mode
   const durations=listParam(p,'durations',DURATIONS,DURATIONS.size);
-  q={concepts,factIds,from:dateParam(p,'from'),to:dateParam(p,'to'),asOf:asOfParam(p,today),durations:durations?new Set(durations):undefined,history:flagParam(p,'history'),limit:intParam(p,'limit',DEFAULT_LIMIT,MAX_LIMIT)};
+  q={concepts,factIds,from:dateParam(p,'from'),to:dateParam(p,'to'),asOf:asOfParam(p,today),durations:durations?new Set(durations):undefined,history:flagParam(p,'history'),limit:intParam(p,'limit',DEFAULT_LIMIT,MAX_LIMIT),tickerAsOf:tickerAsOfParam(p,today)};
  }catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
  try{
   const {tables,db}=publicClients();
-  const issuer=await resolvePublicIssuer(tables,ticker,today);
+  const issuer=await resolvePublicIssuer(tables,ticker,today,q.tickerAsOf);
   if(!issuer)return errorResponse('unknown_ticker','no issuer for ticker',404);
-  let rows:FactRow[],truncated=false;
-  const filingsAll=(await db.filingsOfIssuer(issuer.issuerId,issuer.market,{})).filter(isPublished);   // published only, before any use
+  const lineage=await db.lineageOf(issuer.issuerId);
+  const members=new Set(lineage);
+  let rows:FactRow[],truncated=false,conflicts:LineageConflict[]=[];
+  const filingsAll=await lineageFilings(db,lineage,issuer.market);   // published only, before any use
   const publishedIds=new Set(filingsAll.map(f=>f.filing_id));
   if(q.factIds){
-   rows=(await db.factsByIds(q.factIds)).filter(r=>r.issuer_id===issuer.issuerId&&r.market===issuer.market&&publishedIds.has(r.filing_id));
+   rows=(await db.factsByIds(q.factIds)).filter(r=>members.has(r.issuer_id)&&r.market===issuer.market&&publishedIds.has(r.filing_id));
   }else{
    // durations are applied BEFORE the natural-key limit: read without the limit (the 10,000-row cap still
    // applies → truncated), filter, then keep the first `limit` natural keys (rows arrive grouped by key in rank order).
-   const env=await db.readFacts(issuer.issuerId,issuer.market,{concepts:q.concepts!,asOf:q.asOf,from:q.from,to:q.to,history:q.history,limit:q.durations?undefined:q.limit});
-   truncated=env.truncated;
-   rows=env.rows;
+   const env=await db.readFactsLineage(lineage,issuer.market,{concepts:q.concepts!,asOf:q.asOf,from:q.from,to:q.to,history:q.history,limit:q.durations?undefined:q.limit});
+   truncated=env.truncated;rows=env.rows;conflicts=env.conflicts;
    if(q.durations){
     const kept=new Set<string>();
     rows=rows.filter(r=>{
@@ -54,7 +58,8 @@ export async function GET(req:Request,{params}:{params:Promise<{ticker:string}>}
   }
   const wanted=new Set(rows.map(r=>r.filing_id));
   const filings=filingsAll.filter(f=>wanted.has(f.filing_id));
-  const body={issuerId:issuer.issuerId,ticker:issuer.ticker,market:issuer.market,asOf:q.factIds?null:q.asOf,mappingGen:MAPPING_GEN,truncated,facts:rows.map(publicFact),filings:filings.map(publicFiling)};
+  const body={issuerId:issuer.issuerId,ticker:issuer.ticker,market:issuer.market,asOf:q.factIds?null:q.asOf,mappingGen:MAPPING_GEN,truncated,lineage,resolution:publicResolution(issuer),
+   conflicts:conflicts.map(publicConflict),facts:rows.map(publicFact),filings:filings.map(publicFiling)};
   return NextResponse.json(body,{headers:successHeaders(now,q.factIds?undefined:q.asOf,rows.length===0||truncated)});
  }catch(e){return failureResponse(e,'facts','facts read failed');}
 }
diff --git a/src/app/api/filings/[ticker]/route.test.ts b/src/app/api/filings/[ticker]/route.test.ts
index 7c6a583..5ca2962 100644
--- a/src/app/api/filings/[ticker]/route.test.ts
+++ b/src/app/api/filings/[ticker]/route.test.ts
@@ -2,14 +2,14 @@
 import {beforeEach,describe,expect,it,vi} from 'vitest';
 import type {FilingRow} from '@/lib/facts/types';
 
-const mocks=vi.hoisted(()=>({resolve:vi.fn(),filingsOfIssuer:vi.fn()}));
+const mocks=vi.hoisted(()=>({resolve:vi.fn(),filingsOfIssuer:vi.fn(),lineageOf:vi.fn()}));
 vi.mock('@/lib/supabase/anon',()=>({getAnonSupabase:()=>({})}));
 vi.mock('@/lib/entities/resolve',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/entities/resolve')>(),resolveIssuer:mocks.resolve}));
-vi.mock('@/lib/facts/db',()=>({supabaseFactsDb:()=>({filingsOfIssuer:mocks.filingsOfIssuer})}));
+vi.mock('@/lib/facts/db',()=>({supabaseFactsDb:()=>({filingsOfIssuer:mocks.filingsOfIssuer,lineageOf:mocks.lineageOf})}));
 
 import {GET} from './route';
 
-const ISSUER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
+const ISSUER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',SRC='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 const filing=(p:Partial<FilingRow>={}):FilingRow=>({filing_id:'g',issuer_id:ISSUER,market:'CN',source:'tushare',origin:'sse',form_type:'annual',fiscal_year:2024,fiscal_period:'FY',period_end:'2024-12-31',available_date:'2025-04-01',source_ref:'600519.SH:20241231:1:20250401',url:null,document_ref:'1222',document_url:'https://static.cninfo.com.cn/x.pdf',link_attempts:1,mapping_gen:1,run_id:'r',created_at:'2025-04-01T00:00:00Z',accepted_at:null,acceptance_source:null,...p});
 const get=(ticker:string,qs:string)=>GET(new Request(`https://alpha.example/api/filings/${ticker}?${qs}`),{params:Promise.resolve({ticker})});
 
@@ -17,25 +17,31 @@ describe('GET /api/filings/[ticker]',()=>{
  beforeEach(()=>{
   vi.clearAllMocks();
   mocks.resolve.mockImplementation(async(_c:unknown,q:{ticker:string})=>({issuer_id:ISSUER,status:'active',names:{zh:null,en:null},identifiers:{cik:null,lei:null,usci:null},securities:[{ticker:q.ticker,isin:null,figi:null,share_class:null,is_primary:true,valid_from:'2000-01-01',valid_to:null}]}));
+  mocks.lineageOf.mockImplementation(async(t:string)=>[t]);
   mocks.filingsOfIssuer.mockResolvedValue([filing(),filing({filing_id:'h',form_type:'q1',document_ref:null,document_url:null,link_attempts:5,available_date:'2025-04-29'})]);
  });
- it('lists filings in the available_date window with citation and caches until midnight',async()=>{
+ it('lists filings in the available_date window with citation, acceptedAt and recordedIssuerId, newest first, and caches until midnight',async()=>{
   const res=await get('600519.SH','from=2025-01-01&to=2025-12-31&limit=50');
   expect(res.status).toBe(200);
   const body=await res.json();
-  expect(body).toMatchObject({issuerId:ISSUER,ticker:'600519.SH',market:'CN'});
-  expect(body.filings.map((f:{filingId:string;citation:string})=>[f.filingId,f.citation])).toEqual([['g','linked'],['h','pending']]);
+  expect(body).toMatchObject({issuerId:ISSUER,ticker:'600519.SH',market:'CN',lineage:[ISSUER],resolution:{issuerId:ISSUER,validFromMethod:null}});
+  expect(body.filings.map((f:{filingId:string;citation:string;acceptedAt:string|null;recordedIssuerId:string})=>[f.filingId,f.citation,f.acceptedAt,f.recordedIssuerId])).toEqual([['h','pending',null,ISSUER],['g','linked',null,ISSUER]]);
   expect(mocks.filingsOfIssuer).toHaveBeenCalledWith(ISSUER,'CN',{from:'2025-01-01',to:'2025-12-31'});
   expect(res.headers.get('cache-control')).toMatch(/^public, s-maxage=/);
  });
- it('exposes only published filings (mapping_gen > 0), filtered before the limit',async()=>{
-  mocks.filingsOfIssuer.mockResolvedValue([filing({filing_id:'s1',mapping_gen:0}),filing({filing_id:'s2',mapping_gen:0}),filing({filing_id:'p1'}),filing({filing_id:'p2'})]);
+ it('a merged target lists the filings of every lineage member, published only, filtered before the limit',async()=>{
+  mocks.lineageOf.mockResolvedValue([ISSUER,SRC]);
+  mocks.filingsOfIssuer.mockImplementation(async(i:string)=>i===SRC?[filing({filing_id:'s1',issuer_id:SRC,available_date:'2025-05-01'}),filing({filing_id:'s0',issuer_id:SRC,mapping_gen:0})]:[filing({filing_id:'p1'}),filing({filing_id:'x0',mapping_gen:0})]);
   const body=await (await get('600519.SH','limit=2')).json();
-  expect(body.filings.map((f:{filingId:string})=>f.filingId)).toEqual(['p1','p2']);
+  expect(body.filings.map((f:{filingId:string;recordedIssuerId:string})=>[f.filingId,f.recordedIssuerId])).toEqual([['s1',SRC],['p1',ISSUER]]);
+  expect(body.lineage).toEqual([ISSUER,SRC]);
  });
- it('answers 400 for a malformed percent escape and 409 for ambiguous owners',async()=>{
+ it('answers 400 for a malformed percent escape, a future tickerAsOf, and 409 for ambiguous owners; tickerAsOf goes to resolveIssuer as asOf',async()=>{
   const mal=await GET(new Request('https://alpha.example/api/filings/%E0%A4%A'),{params:Promise.resolve({ticker:'%E0%A4%A'})});
   expect(mal.status).toBe(400);expect((await mal.json()).error.code).toBe('invalid_parameter:ticker');
+  expect((await get('600519.SH','tickerAsOf=2999-01-01')).status).toBe(400);
+  await get('600519.SH','tickerAsOf=2020-01-02');
+  expect(mocks.resolve).toHaveBeenLastCalledWith(expect.anything(),{ticker:'600519.SH'},{asOf:'2020-01-02'});
   mocks.resolve.mockRejectedValue(new Error('ambiguous_owner'));
   const amb=await get('AAPL','');
   expect(amb.status).toBe(409);expect((await amb.json()).error.code).toBe('ambiguous_ticker');
diff --git a/src/app/api/filings/[ticker]/route.ts b/src/app/api/filings/[ticker]/route.ts
index c47c73e..9f4ad75 100644
--- a/src/app/api/filings/[ticker]/route.ts
+++ b/src/app/api/filings/[ticker]/route.ts
@@ -1,26 +1,28 @@
 // src/app/api/filings/[ticker]/route.ts
-// Public filings list (spec §9): the issuer's filings by available_date window, with the
-// citation state (edgar | linked | pending).
+// Public filings list (spec §9; plan 3 §4.4, §4.5): the published filings of every member of the
+// issuer's lineage by available_date window, newest first, with the citation state
+// (edgar | linked | pending), acceptedAt and recordedIssuerId. tickerAsOf picks the owner at that date.
 import {NextResponse} from 'next/server';
-import {TICKER_RE,dateParam,decodeTicker,errorResponse,failureResponse,intParam,isPublished,paramErrorResponse,publicClients,publicFiling,readParams,resolvePublicIssuer,successHeaders,utcDate} from '@/lib/facts/public-route';
+import {TICKER_RE,dateParam,decodeTicker,errorResponse,failureResponse,intParam,lineageFilings,paramErrorResponse,publicClients,publicFiling,publicResolution,readParams,resolvePublicIssuer,successHeaders,tickerAsOfParam,utcDate} from '@/lib/facts/public-route';
 
 export const dynamic='force-dynamic';
-const PARAMS=['from','to','limit'] as const;
+const PARAMS=['from','to','limit','tickerAsOf'] as const;
 const DEFAULT_LIMIT=200,MAX_LIMIT=1000;
 
 export async function GET(req:Request,{params}:{params:Promise<{ticker:string}>}){
  const now=new Date();const today=utcDate(now);
  const {ticker:raw}=await params;const ticker=decodeTicker(raw);
  if(ticker===null||!TICKER_RE.test(ticker))return errorResponse('invalid_parameter:ticker','invalid ticker',400);
- let from:string|undefined,to:string|undefined,limit:number;
- try{const p=readParams(new URL(req.url),PARAMS);from=dateParam(p,'from');to=dateParam(p,'to');limit=intParam(p,'limit',DEFAULT_LIMIT,MAX_LIMIT);}
+ let from:string|undefined,to:string|undefined,limit:number,tickerAsOf:string;
+ try{const p=readParams(new URL(req.url),PARAMS);from=dateParam(p,'from');to=dateParam(p,'to');limit=intParam(p,'limit',DEFAULT_LIMIT,MAX_LIMIT);tickerAsOf=tickerAsOfParam(p,today);}
  catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
  try{
   const {tables,db}=publicClients();
-  const issuer=await resolvePublicIssuer(tables,ticker,today);
+  const issuer=await resolvePublicIssuer(tables,ticker,today,tickerAsOf);
   if(!issuer)return errorResponse('unknown_ticker','no issuer for ticker',404);
+  const lineage=await db.lineageOf(issuer.issuerId);
   // published only, filtered BEFORE the limit (so staged filings never consume page slots)
-  const filings=(await db.filingsOfIssuer(issuer.issuerId,issuer.market,{from,to})).filter(isPublished).slice(0,limit);
-  return NextResponse.json({issuerId:issuer.issuerId,ticker:issuer.ticker,market:issuer.market,filings:filings.map(publicFiling)},{headers:successHeaders(now,undefined,filings.length===0)});
+  const filings=(await lineageFilings(db,lineage,issuer.market,{from,to})).slice(0,limit);
+  return NextResponse.json({issuerId:issuer.issuerId,ticker:issuer.ticker,market:issuer.market,lineage,resolution:publicResolution(issuer),filings:filings.map(publicFiling)},{headers:successHeaders(now,undefined,filings.length===0)});
  }catch(e){return failureResponse(e,'filings','filings read failed');}
 }
diff --git a/src/lib/facts/derive.ts b/src/lib/facts/derive.ts
index 5b74662..fdeaded 100644
--- a/src/lib/facts/derive.ts
+++ b/src/lib/facts/derive.ts
@@ -11,8 +11,10 @@
 // zero to RATIO_SCALE places; INSTANT metrics carry period_start = period_end (column is not null).
 // Differenced quarters are order-independent: a direct 3M fact wins; conflicting differences = no quarter. ROE with a
 // non-positive average equity is missing. as_of is the UTC date for every market.
-// materialize() reads the envelope, refuses truncated reads (read_truncated), and replaces the
-// issuer's metrics under the envelope's state_rev with one retry on stale_computation.
+// materialize() follows the plan-3 lineage contract (spec §4.4, T9): target T = targetOf(issuer); the
+// current lineage of T; read_facts_lineage (truncated → read_truncated); every row must belong to the
+// lineage and market; derive for T; replace_financial_metrics_lineage under the envelope's rev
+// vector, one retry on stale_computation (a rev or the lineage moved).
 import type {Duration,FactRow,FactsDb,LineageRev,Market,MetricDuration,MetricRow} from './types';
 import {FactsDbError} from './types';
 import {canonicalDecimal} from './json-numbers';
@@ -210,17 +212,31 @@ export function deriveMetrics(allRows:FactRow[],opts:DeriveOptions):MetricRow[]{
  return out.sort((a,b)=>cmpStr(key(a),key(b)));
 }
 
-export type MaterializeDb=Pick<FactsDb,'readFacts'|'replaceMetrics'>;
-export interface MaterializeResult{rows:number;stateRev:number;retried:boolean}
-/** as_of = today; the envelope's state_rev guards replace_financial_metrics; stale_computation → re-read and recompute once. */
+export type MaterializeDb=Pick<FactsDb,'targetOf'|'lineageOf'|'readFactsLineage'|'replaceMetricsLineage'>;
+export interface MaterializeResult{rows:number;stateRev:number;retried:boolean;target:string;basedOn:LineageRev[]}
+/**
+ * Rows of a lineage derived for its target T: every row must belong to the lineage and the market
+ * (replaces plan 2's "rows of this issuer only"); issuer ids are relabelled to T so the
+ * single-issuer derivation applies — the recorded issuer stays traceable through inputs[].fact_id.
+ * based_on_rev = T's rev in basedOn; based_on_lineage = basedOn.
+ */
+export function deriveLineageMetrics(rows:FactRow[],target:string,lineage:readonly string[],opts:{market:Market;asOf:string;basedOn:LineageRev[]}):MetricRow[]{
+ const members=new Set(lineage);
+ if(!members.has(target)||rows.some(r=>!members.has(r.issuer_id)||r.market!==opts.market))throw new Error(`derive_scope_mismatch:${target}/${opts.market}`);
+ const basedOnRev=opts.basedOn.find(x=>x.issuer_id===target)?.state_rev??0;
+ return deriveMetrics(rows.map(r=>r.issuer_id===target?r:{...r,issuer_id:target}),{market:opts.market,asOf:opts.asOf,basedOnRev,basedOn:opts.basedOn});
+}
+/** as_of = today; materialises T(issuer) over its current lineage (see the header). */
 export async function materialize(db:MaterializeDb,issuer:string,market:Market,opts:{today?:string}={}):Promise<MaterializeResult>{
  const asOf=opts.today??new Date().toISOString().slice(0,10);
+ const target=await db.targetOf(issuer);
  for(let attempt=0;;attempt++){
-  const env=await db.readFacts(issuer,market,{concepts:[...DERIVE_CONCEPTS[market]],asOf,history:true});
-  if(env.truncated)throw new FactsDbError('read_truncated',`read_facts truncated for ${issuer}/${market}`);
-  if(env.rows.some(r=>r.issuer_id!==issuer||r.market!==market))throw new Error(`derive_scope_mismatch:${issuer}/${market}`);
-  const rows=deriveMetrics(env.rows,{market,asOf,basedOnRev:env.stateRev});
-  try{const n=await db.replaceMetrics(issuer,market,env.stateRev,rows);return {rows:n,stateRev:env.stateRev,retried:attempt>0};}
+  const lineage=await db.lineageOf(target);
+  const env=await db.readFactsLineage(lineage,market,{concepts:[...DERIVE_CONCEPTS[market]],asOf,history:true});
+  if(env.truncated)throw new FactsDbError('read_truncated',`read_facts_lineage truncated for ${target}/${market}`);
+  const rows=deriveLineageMetrics(env.rows,target,lineage,{market,asOf,basedOn:env.stateRevs});
+  const stateRev=env.stateRevs.find(x=>x.issuer_id===target)?.state_rev??0;
+  try{const n=await db.replaceMetricsLineage(target,market,env.stateRevs,rows);return {rows:n,stateRev,retried:attempt>0,target,basedOn:env.stateRevs};}
   catch(e){if(attempt===0&&e instanceof FactsDbError&&e.code==='stale_computation')continue;throw e;}
  }
 }
diff --git a/src/lib/facts/public-route.ts b/src/lib/facts/public-route.ts
index 7f5bd95..cfcc339 100644
--- a/src/lib/facts/public-route.ts
+++ b/src/lib/facts/public-route.ts
@@ -5,6 +5,9 @@
 // strict parameter parsing (repeated parameter → 400 invalid_parameter:<name>), error bodies
 // {error:{code,message}} with no-store, cache headers (past asOf → long shared cache; otherwise
 // bounded by the next UTC midnight like the resolve route), and the public row shapes.
+// Plan 3 (spec §4.3.5, §4.4): tickerAsOf (default today, future → 400) picks the ticker's owner at
+// that date; the answer names the lineage target T (issuerId), its lineage, the cross-issuer
+// conflicts withheld from current values, each row's recordedIssuerId and each filing's acceptedAt.
 import {NextResponse} from 'next/server';
 import {getAnonSupabase} from '../supabase/anon';
 import {supabaseTableClient} from '../db/table-client';
@@ -12,7 +15,7 @@ import type {TableClient} from '../db/table-client';
 import {isCurrentSecurity,resolveIssuer,successCacheControl} from '../entities/resolve';
 import {inferCoreMarket,normalizeSecurityTicker} from '../securities/ticker';
 import {supabaseFactsDb} from './db';
-import type {FactRow,FactsDb,FilingRow,Market} from './types';
+import type {FactRow,FactsDb,FilingRow,LineageConflict,Market} from './types';
 
 export const TICKER_RE=/^[A-Za-z0-9.\/\-]{1,24}$/;
 export const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
@@ -47,6 +50,11 @@ export function asOfParam(p:Map<string,string>,today:string):string{
  const v=dateParam(p,'asOf');if(v===undefined)return today;
  if(v>today)throw new QueryError('asOf');return v;
 }
+/** tickerAsOf defaults to today and may not be in the future. */
+export function tickerAsOfParam(p:Map<string,string>,today:string):string{
+ const v=dateParam(p,'tickerAsOf');if(v===undefined)return today;
+ if(v>today)throw new QueryError('tickerAsOf');return v;
+}
 export function flagParam(p:Map<string,string>,name:string):boolean{
  const v=p.get(name);if(v===undefined)return false;
  if(v!=='1')throw new QueryError(name);return true;
@@ -55,7 +63,7 @@ export function flagParam(p:Map<string,string>,name:string):boolean{
 export const errorResponse=(code:string,message:string,status:number)=>NextResponse.json({error:{code,message}},{status,headers:{'Cache-Control':'no-store'}});
 export const paramErrorResponse=(e:unknown)=>e instanceof QueryError?errorResponse(e.message,`invalid ${e.param}`,400):null;
 
-export interface PublicIssuer{issuerId:string;ticker:string;market:Market}
+export interface PublicIssuer{issuerId:string;ticker:string;market:Market;tickerAsOf:string;validFromMethod:string|null}
 /** Percent-decoded path segment, or null when malformed. */
 export function decodeTicker(raw:string):string|null{try{return decodeURIComponent(raw);}catch{return null;}}
 /** US forms (incl. dotted share classes such as BRK.A) and CN .SH/.SZ/.BJ are public; anything else (HK, ...) is not. */
@@ -64,33 +72,36 @@ export function publicMarketOf(ticker:string):Market|null{
  return inferCoreMarket(ticker)==='US'?'US':null;
 }
 /**
- * Ticker → issuer by today's ownership (one merge hop is followed by resolveIssuer). resolveIssuer
- * matches the exact upper-cased ticker first and falls back to the normalised one (so BRK.A is never
- * BRK, and 600519 / SH600519 / 600519.SS find 600519.SH). Market and echoed ticker come from the
- * issuer's security row that matches one of those two forms (exact first; for a merged issuer, the source row read directly); none matching, or a
- * market the facts layer does not serve (HK), is null (→ 404 unknown_ticker).
- * Throws Error('ambiguous_owner') through.
+ * Ticker → issuer by ownership AT tickerAsOf (default today; one merge hop is followed by
+ * resolveIssuer, so issuerId is the lineage target). resolveIssuer matches the exact upper-cased
+ * ticker first and falls back to the normalised one (so BRK.A is never BRK, and 600519 / SH600519 /
+ * 600519.SS find 600519.SH). Market, echoed ticker and validFromMethod come from the security row
+ * that matches one of those two forms (exact first; for a merged issuer, the source row read
+ * directly, current at tickerAsOf); none matching, or a market the facts layer does not serve (HK),
+ * is null (→ 404 unknown_ticker). Throws Error('ambiguous_owner') through.
  */
-export async function resolvePublicIssuer(tables:TableClient,rawTicker:string,today:string):Promise<PublicIssuer|null>{
+export async function resolvePublicIssuer(tables:TableClient,rawTicker:string,today:string,tickerAsOf:string=today):Promise<PublicIssuer|null>{
  const given=rawTicker.trim().toUpperCase().replace(/\//g,'.');
- const r=await resolveIssuer(tables,{ticker:given},{asOf:today});
+ const r=await resolveIssuer(tables,{ticker:given},{asOf:tickerAsOf});
  if(!r)return null;
  const core=inferCoreMarket(given);
  const normalised=core?normalizeSecurityTicker(given,core):null;
- let ticker=(r.securities.find(x=>x.ticker.toUpperCase()===given)??(normalised?r.securities.find(x=>x.ticker.toUpperCase()===normalised):undefined))?.ticker;
+ const sec=r.securities.find(x=>x.ticker.toUpperCase()===given)??(normalised?r.securities.find(x=>x.ticker.toUpperCase()===normalised):undefined);
+ let ticker=sec?.ticker;let validFromMethod:string|null=sec?.valid_from_method??null;
  if(ticker===undefined){
   // Merged issuer: resolveIssuer returned the TARGET's securities. Read the source row directly
   // (exact ticker first; the first form with any rows is authoritative, like the resolver).
   for(const t of normalised&&normalised!==given?[given,normalised]:[given]){
    const rows=await tables.select('issuer_securities',{ticker:t});
    if(rows.length===0)continue;
-   if(rows.some(x=>isCurrentSecurity(x,today)))ticker=t;
+   const cur=rows.find(x=>isCurrentSecurity(x,tickerAsOf));
+   if(cur){ticker=t;validFromMethod=typeof cur.valid_from_method==='string'?cur.valid_from_method:null;}
    break;
   }
  }
  if(ticker===undefined)return null;
  const market=publicMarketOf(ticker);
- return market?{issuerId:r.issuer_id,ticker,market}:null;
+ return market?{issuerId:r.issuer_id,ticker,market,tickerAsOf,validFromMethod}:null;
 }
 /** Failure → response: ambiguous ownership is the caller's 409, everything else a logged, code-only 500. */
 export function failureResponse(e:unknown,tag:string,internalMessage:string){
@@ -125,5 +136,12 @@ export const FRESH_METRICS_CACHE_CONTROL='public, max-age=0, s-maxage=60';
 
 export type Citation='edgar'|'linked'|'pending';
 export const citationOf=(f:FilingRow):Citation=>f.market==='US'?'edgar':f.document_ref?'linked':'pending';
-export const publicFiling=(f:FilingRow)=>({filingId:f.filing_id,formType:f.form_type,periodEnd:f.period_end,availableDate:f.available_date,sourceRef:f.source_ref,url:f.url,documentRef:f.document_ref,documentUrl:f.document_url,citation:citationOf(f)});
-export const publicFact=(r:FactRow)=>({factId:r.fact_id,concept:r.concept,sourceConcept:r.source_concept,statement:r.statement,periodStart:r.period_start,periodEnd:r.period_end,duration:r.duration,value:r.value_text,unit:r.unit,availableDate:r.available_date,filingId:r.filing_id,disclosureSeq:r.disclosure_seq??null,isCurrent:r.is_current??null,isRevision:r.is_revision??null,mappingGen:r.mapping_gen,rawHash:r.raw_hash});
+export const publicFiling=(f:FilingRow)=>({filingId:f.filing_id,formType:f.form_type,periodEnd:f.period_end,availableDate:f.available_date,sourceRef:f.source_ref,url:f.url,documentRef:f.document_ref,documentUrl:f.document_url,citation:citationOf(f),acceptedAt:f.accepted_at??null,recordedIssuerId:f.issuer_id});
+export const publicFact=(r:FactRow)=>({factId:r.fact_id,concept:r.concept,sourceConcept:r.source_concept,statement:r.statement,periodStart:r.period_start,periodEnd:r.period_end,duration:r.duration,value:r.value_text,unit:r.unit,availableDate:r.available_date,filingId:r.filing_id,disclosureSeq:r.disclosure_seq??null,isCurrent:r.is_current??null,isRevision:r.is_revision??null,mappingGen:r.mapping_gen,rawHash:r.raw_hash,recordedIssuerId:r.issuer_id});
+export const publicConflict=(c:LineageConflict)=>({key:c.key,availableDate:c.available_date,factIds:c.fact_ids});
+export const publicResolution=(i:PublicIssuer)=>({tickerAsOf:i.tickerAsOf,issuerId:i.issuerId,validFromMethod:i.validFromMethod});
+/** Published filings of every lineage member (spec §4.4), newest available_date first, then filing_id (the order filingsOfIssuer gives one issuer). */
+export async function lineageFilings(db:FactsDb,lineage:readonly string[],market:Market,opts:{from?:string;to?:string}={}):Promise<FilingRow[]>{
+ const all=(await Promise.all(lineage.map(i=>db.filingsOfIssuer(i,market,opts)))).flat().filter(isPublished);
+ return all.sort((a,b)=>a.available_date<b.available_date?1:a.available_date>b.available_date?-1:a.filing_id<b.filing_id?-1:a.filing_id>b.filing_id?1:0);
+}

exec
/bin/zsh -lc "cat 'src/app/api/facts/[ticker]/route.ts' 'src/app/api/facts/[ticker]/metrics/route.ts'; cat src/lib/facts/lineage.ts; rg -n 'readFactsLineage|lineageOf|targetOf|replaceMetricsLineage' src/lib/facts/db.ts; sed -n '1,115p' src/lib/facts/derive.ts; find src -iname '*agents*'; cat package.json" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
// src/app/api/facts/[ticker]/route.ts
// Public disclosure-log read (spec §9; plan 3 §4.4): concepts mode (read_facts_lineage envelope over
// the issuer's lineage, asOf replay, history, durations, limit = natural keys) or factIds evidence
// mode (≤ 100 ids, any mapping generation, RLS limits to status ok, rows of lineage members only).
// tickerAsOf picks the ticker's owner at that date. The body names the lineage target (issuerId),
// its lineage, the cross-issuer conflicts withheld from current values, and every row's
// recordedIssuerId; filings returned are exactly those referenced by the returned facts.
import {NextResponse} from 'next/server';
import {CONCEPT_IDS as CONCEPT_ID_LIST,MAPPING_GEN,MAX_READ_CONCEPTS} from '@/lib/facts/concepts';
import {QueryError,TICKER_RE,UUID_RE,asOfParam,dateParam,decodeTicker,errorResponse,failureResponse,flagParam,intParam,lineageFilings,listParam,paramErrorResponse,publicClients,publicConflict,publicFact,publicFiling,publicResolution,readParams,resolvePublicIssuer,successHeaders,tickerAsOfParam,utcDate} from '@/lib/facts/public-route';
import type {Duration,FactRow,LineageConflict} from '@/lib/facts/types';

export const dynamic='force-dynamic';
const PARAMS=['concepts','factIds','from','to','asOf','durations','history','limit','tickerAsOf'] as const;
const CONCEPT_IDS=new Set(CONCEPT_ID_LIST);
const DURATIONS=new Set<string>(['3M','6M','9M','12M','INSTANT']);
const MAX_FACT_IDS=100,DEFAULT_LIMIT=200,MAX_LIMIT=1000;

export async function GET(req:Request,{params}:{params:Promise<{ticker:string}>}){
 const now=new Date();const today=utcDate(now);
 const {ticker:raw}=await params;const ticker=decodeTicker(raw);
 if(ticker===null||!TICKER_RE.test(ticker))return errorResponse('invalid_parameter:ticker','invalid ticker',400);
 let q:{concepts?:string[];factIds?:string[];from?:string;to?:string;asOf:string;durations?:Set<string>;history:boolean;limit:number;tickerAsOf:string};
 try{
  const p=readParams(new URL(req.url),PARAMS);
  const concepts=listParam(p,'concepts',CONCEPT_IDS,MAX_READ_CONCEPTS);
  const factIds=listParam(p,'factIds',null,MAX_FACT_IDS);
  if(factIds&&factIds.some(id=>!UUID_RE.test(id)))throw new QueryError('factIds');
  if((concepts===undefined)===(factIds===undefined))throw new QueryError(concepts?'factIds':'concepts');   // exactly one mode
  const durations=listParam(p,'durations',DURATIONS,DURATIONS.size);
  q={concepts,factIds,from:dateParam(p,'from'),to:dateParam(p,'to'),asOf:asOfParam(p,today),durations:durations?new Set(durations):undefined,history:flagParam(p,'history'),limit:intParam(p,'limit',DEFAULT_LIMIT,MAX_LIMIT),tickerAsOf:tickerAsOfParam(p,today)};
 }catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
 try{
  const {tables,db}=publicClients();
  const issuer=await resolvePublicIssuer(tables,ticker,today,q.tickerAsOf);
  if(!issuer)return errorResponse('unknown_ticker','no issuer for ticker',404);
  const lineage=await db.lineageOf(issuer.issuerId);
  const members=new Set(lineage);
  let rows:FactRow[],truncated=false,conflicts:LineageConflict[]=[];
  const filingsAll=await lineageFilings(db,lineage,issuer.market);   // published only, before any use
  const publishedIds=new Set(filingsAll.map(f=>f.filing_id));
  if(q.factIds){
   rows=(await db.factsByIds(q.factIds)).filter(r=>members.has(r.issuer_id)&&r.market===issuer.market&&publishedIds.has(r.filing_id));
  }else{
   // durations are applied BEFORE the natural-key limit: read without the limit (the 10,000-row cap still
   // applies → truncated), filter, then keep the first `limit` natural keys (rows arrive grouped by key in rank order).
   const env=await db.readFactsLineage(lineage,issuer.market,{concepts:q.concepts!,asOf:q.asOf,from:q.from,to:q.to,history:q.history,limit:q.durations?undefined:q.limit});
   truncated=env.truncated;rows=env.rows;conflicts=env.conflicts;
   if(q.durations){
    const kept=new Set<string>();
    rows=rows.filter(r=>{
     if(!q.durations!.has(r.duration as Duration))return false;
     const k=[r.concept,r.period_start??'',r.period_end,r.consolidation,r.unit].join('|');
     if(!kept.has(k)){if(kept.size>=q.limit)return false;kept.add(k);}
     return true;
    });
   }
  }
  const wanted=new Set(rows.map(r=>r.filing_id));
  const filings=filingsAll.filter(f=>wanted.has(f.filing_id));
  const body={issuerId:issuer.issuerId,ticker:issuer.ticker,market:issuer.market,asOf:q.factIds?null:q.asOf,mappingGen:MAPPING_GEN,truncated,lineage,resolution:publicResolution(issuer),
   conflicts:conflicts.map(publicConflict),facts:rows.map(publicFact),filings:filings.map(publicFiling)};
  return NextResponse.json(body,{headers:successHeaders(now,q.factIds?undefined:q.asOf,rows.length===0||truncated)});
 }catch(e){return failureResponse(e,'facts','facts read failed');}
}
// src/app/api/facts/[ticker]/metrics/route.ts
// Public derived metrics (spec §9; plan 3 §4.4, T8). Without asOf: the materialized
// financial_metrics rows of the lineage target T for the current FORMULA_VERSION, served only when
// the lineage members and their state_revs read before and after the metrics read are identical
// and every row's based_on_lineage equals that vector; any mismatch or an unstable read →
// metrics:[], stale:true, STALE_CACHE_CONTROL (never recomputed inline: the visibility paths
// re-materialise). With asOf: a live deriveLineageMetrics over the read_facts_lineage envelope
// (asOf replay), basedOnRev = T's rev, basedOnLineage = the envelope vector. Metric names are
// validated per market; tickerAsOf picks the ticker's owner at that date.
import {NextResponse} from 'next/server';
import {MAPPING_GEN} from '@/lib/facts/concepts';
import {lineageRevsEqual} from '@/lib/facts/db';
import {DERIVE_CONCEPTS,FORMULA_VERSION,deriveLineageMetrics,metricNames} from '@/lib/facts/derive';
import {FRESH_METRICS_CACHE_CONTROL,STALE_CACHE_CONTROL,QueryError,TICKER_RE,dateParam,decodeTicker,errorResponse,failureResponse,intParam,listParam,paramErrorResponse,publicClients,publicResolution,readParams,resolvePublicIssuer,successHeaders,tickerAsOfParam,utcDate} from '@/lib/facts/public-route';
import {FactsDbError} from '@/lib/facts/types';
import type {MetricRow} from '@/lib/facts/types';

export const dynamic='force-dynamic';
const PARAMS=['metrics','from','to','asOf','limit','tickerAsOf'] as const;
const DEFAULT_LIMIT=200,MAX_LIMIT=1000;
const publicMetric=(m:MetricRow)=>({metric:m.metric,periodStart:m.period_start,periodEnd:m.period_end,duration:m.duration,value:m.value,unit:m.unit,inputUnit:m.input_unit,basis:m.basis,inputs:m.inputs,basedOnRev:m.based_on_rev,basedOnLineage:m.based_on_lineage});

export async function GET(req:Request,{params}:{params:Promise<{ticker:string}>}){
 const now=new Date();const today=utcDate(now);
 const {ticker:raw}=await params;const ticker=decodeTicker(raw);
 if(ticker===null||!TICKER_RE.test(ticker))return errorResponse('invalid_parameter:ticker','invalid ticker',400);
 let p:Map<string,string>,from:string|undefined,to:string|undefined,asOf:string|undefined,limit:number,tickerAsOf:string;
 try{
  p=readParams(new URL(req.url),PARAMS);
  from=dateParam(p,'from');to=dateParam(p,'to');asOf=dateParam(p,'asOf');limit=intParam(p,'limit',DEFAULT_LIMIT,MAX_LIMIT);tickerAsOf=tickerAsOfParam(p,today);
  if(asOf!==undefined&&asOf>today)throw new QueryError('asOf');
 }catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
 try{
  const {tables,db}=publicClients();
  const issuer=await resolvePublicIssuer(tables,ticker,today,tickerAsOf);
  if(!issuer)return errorResponse('unknown_ticker','no issuer for ticker',404);
  let metrics:string[]|undefined;
  try{metrics=listParam(p,'metrics',new Set(metricNames(issuer.market)),metricNames(issuer.market).length);}
  catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
  const target=issuer.issuerId;
  const lineage=await db.lineageOf(target);
  let rows:MetricRow[],truncated=false,stale=false;
  if(asOf===undefined){
   const before=await db.stateRevs(lineage,issuer.market);
   try{rows=await db.metricsOfIssuer(target,issuer.market,FORMULA_VERSION);}
   catch(e){if(e instanceof FactsDbError&&e.message==='metrics_unstable'){rows=[];stale=true;}else throw e;}
   if(!stale&&rows.length>0){
    const lineageAfter=await db.lineageOf(target);
    const after=await db.stateRevs(lineageAfter,issuer.market);
    if(lineageAfter.join(',')!==lineage.join(',')||!lineageRevsEqual(before,after)||rows.some(m=>!lineageRevsEqual(m.based_on_lineage,before))){rows=[];stale=true;}
   }
  }else{
   const env=await db.readFactsLineage(lineage,issuer.market,{concepts:[...DERIVE_CONCEPTS[issuer.market]],asOf,history:true});
   truncated=env.truncated;
   rows=truncated?[]:deriveLineageMetrics(env.rows,target,lineage,{market:issuer.market,asOf,basedOn:env.stateRevs});
  }
  const wanted=metrics?new Set(metrics):null;
  rows=rows.filter(m=>(!wanted||wanted.has(m.metric))&&(from===undefined||m.period_end>=from)&&(to===undefined||m.period_end<=to)).slice(0,limit);
  const body={issuerId:target,ticker:issuer.ticker,market:issuer.market,asOf:asOf??null,mappingGen:MAPPING_GEN,formulaVersion:FORMULA_VERSION,truncated,stale,lineage,resolution:publicResolution(issuer),metrics:rows.map(publicMetric)};
  return NextResponse.json(body,{headers:stale?{'Cache-Control':STALE_CACHE_CONTROL}:asOf===undefined&&rows.length>0?{'Cache-Control':FRESH_METRICS_CACHE_CONTROL}:successHeaders(now,asOf,rows.length===0||truncated)});
 }catch(e){return failureResponse(e,'facts/metrics','metrics read failed');}
}
cat: src/lib/facts/lineage.ts: No such file or directory
5:// targetOf, lineageOf, findFilingBySourceRef, filingsForCalendar (reads fact_sync_runs, which anon cannot see:
243:  async targetOf(issuer){const r=await rows<{merged_into:string|null}>(c.from('issuers').select('merged_into').eq('issuer_id',issuer).limit(1));return r[0]?.merged_into??issuer;},
244:  async lineageOf(target){return [target,...(await pageAll<{issuer_id:string}>(()=>c.from('issuers').select('issuer_id').eq('merged_into',target).order('issuer_id'))).map(r=>String(r.issuer_id))];},
250:  async readFactsLineage(issuers,market,opts){return lineageResultFromEnvelope(await call<ReadFactsLineageEnvelope>('read_facts_lineage',readLineageArgs(issuers,market,opts)));},
252:  async replaceMetricsLineage(issuer,market,basedOn,input){return Number(await call<unknown>('replace_financial_metrics_lineage',{p_issuer:issuer,p_market:market,p_based_on:basedOn,p_rows:input.map(metricArgs)}));},
// src/lib/facts/derive.ts
// Derived metrics (spec §8). deriveMetrics is pure: it takes the readFacts history rows of one
// issuer/market (status ok, available_date <= asOf, with disclosure_seq/is_current/is_revision)
// and emits MetricRow[] for FORMULA_VERSION. Rules: exact period matching; missing input, unit
// mismatch, zero denominator or non-unique match → no row ("missing stays missing"); YTD
// differencing only across compatible disclosure versions — (a) both current disclosures from the
// same filing, or (b) both sequences never revised — the rule is recoverable from `inputs`
// (equal filing_id ⇒ a); TTM = four adjacent single quarters; YoY prior = the unique same-duration
// fact ending 350–380 days earlier; ROE opening equity = the instant fact dated exactly one day
// before the TTM window. Arithmetic is exact decimal on BigInt; ratios are rounded half away from
// zero to RATIO_SCALE places; INSTANT metrics carry period_start = period_end (column is not null).
// Differenced quarters are order-independent: a direct 3M fact wins; conflicting differences = no quarter. ROE with a
// non-positive average equity is missing. as_of is the UTC date for every market.
// materialize() follows the plan-3 lineage contract (spec §4.4, T9): target T = targetOf(issuer); the
// current lineage of T; read_facts_lineage (truncated → read_truncated); every row must belong to the
// lineage and market; derive for T; replace_financial_metrics_lineage under the envelope's rev
// vector, one retry on stale_computation (a rev or the lineage moved).
import type {Duration,FactRow,FactsDb,LineageRev,Market,MetricDuration,MetricRow} from './types';
import {FactsDbError} from './types';
import {canonicalDecimal} from './json-numbers';
import {classifyDuration} from './classify';

export const FORMULA_VERSION='facts-derive/1.0';
export const RATIO_SCALE=10;
export const Q_SINGLE_CONCEPTS:Record<Market,readonly string[]>={
 US:['revenue','net_income_parent','operating_income','operating_cash_flow','capex'],
 CN:['revenue','net_income_parent','operating_income','operating_cash_flow','capex_incl_intangibles'],
};
/** Concepts to read per market: the readFacts `concepts` list for materialize and the live metrics route. */
export const DERIVE_CONCEPTS:Record<Market,readonly string[]>={
 US:['revenue','gross_profit','cost_of_revenue','net_income_parent','operating_income','operating_cash_flow','capex','short_term_borrowings','long_term_borrowings','equity_parent'],
 CN:['revenue','revenue_operating','cost_of_revenue','net_income_parent','operating_income','operating_cash_flow','capex_incl_intangibles','short_term_borrowings','long_term_borrowings','bonds_payable','equity_parent'],
};
const FIXED_METRICS=['gross_margin','net_margin','fcf','borrowings_total','revenue_yoy','net_income_yoy','roe'] as const;
export function metricNames(market:Market):string[]{
 return [...FIXED_METRICS,...Q_SINGLE_CONCEPTS[market].flatMap(c=>[`q_single_${c}`,`ttm_${c}`])];
}
export interface DeriveOptions{market:Market;asOf:string;basedOnRev?:number;/** complete lineage vector the rows derive from; default [{issuer_id, basedOnRev}] */basedOn?:LineageRev[]}

// ---- exact decimal arithmetic (value = n / 10^s) ----
interface Dec{n:bigint;s:number}
const DEC_RE=/^-?\d+(\.\d+)?$/;
const pow10=(k:number)=>10n**BigInt(k);
function parseDec(v:string):Dec|null{
 if(!DEC_RE.test(v))return null;
 const neg=v.startsWith('-'),body=neg?v.slice(1):v,[i,f='']=body.split('.');
 const n=BigInt(i+f);return {n:neg?-n:n,s:f.length};
}
function align(a:Dec,b:Dec):[bigint,bigint,number]{const s=Math.max(a.s,b.s);return [a.n*pow10(s-a.s),b.n*pow10(s-b.s),s];}
const add=(a:Dec,b:Dec):Dec=>{const [x,y,s]=align(a,b);return {n:x+y,s};};
const sub=(a:Dec,b:Dec):Dec=>{const [x,y,s]=align(a,b);return {n:x-y,s};};
const sameNumber=(x:string,y:string)=>{const a=parseDec(x),b=parseDec(y);if(!a||!b)return x===y;const [p,q]=align(a,b);return p===q;};
const isZero=(d:Dec)=>d.n===0n;
const abs=(d:Dec):Dec=>({n:d.n<0n?-d.n:d.n,s:d.s});
const times=(d:Dec,k:bigint):Dec=>({n:d.n*k,s:d.s});
/** a / b rounded half away from zero to RATIO_SCALE places; null when b is zero. */
function div(a:Dec,b:Dec):Dec|null{
 if(isZero(b))return null;
 const [x,y]=align(a,b);
 const q=(x*pow10(RATIO_SCALE+1))/y;      // one guard digit; BigInt division truncates toward zero
 const r=q<0n?-((-q+5n)/10n):(q+5n)/10n;
 return {n:r,s:RATIO_SCALE};
}
function decToString(d:Dec):string{
 const neg=d.n<0n;let digits=(neg?-d.n:d.n).toString();
 if(d.s>0){digits=digits.padStart(d.s+1,'0');digits=`${digits.slice(0,-d.s)}.${digits.slice(-d.s)}`;}
 return canonicalDecimal((neg?'-':'')+digits);
}

// ---- calendar days (UTC) ----
const DAY_MS=86_400_000;
const dayMs=(d:string)=>Date.parse(`${d}T00:00:00Z`);
export const addDays=(d:string,n:number)=>new Date(dayMs(d)+n*DAY_MS).toISOString().slice(0,10);
const daysBetween=(from:string,to:string)=>Math.round((dayMs(to)-dayMs(from))/DAY_MS);

// ---- current disclosure per natural key ----
interface Cur{row:FactRow;dec:Dec;revised:boolean}
type Input=MetricRow['inputs'][number];
const inputOf=(c:Cur,extra:Partial<Input>={}):Input=>({fact_id:c.row.fact_id,concept:c.row.concept,filing_id:c.row.filing_id,available_date:c.row.available_date,...extra});
const cmpStr=(a:string,b:string)=>a<b?-1:a>b?1:0;
function currentFacts(rows:FactRow[]):Map<string,Cur[]>{
 const groups=new Map<string,FactRow[]>();
 for(const r of rows){const k=`${r.concept}|${r.period_start??''}|${r.period_end}|${r.consolidation}|${r.unit}`;(groups.get(k)??groups.set(k,[]).get(k)!).push(r);}
 const out=new Map<string,Cur[]>();
 for(const g of groups.values()){
  g.sort((a,b)=>(a.disclosure_seq??0)-(b.disclosure_seq??0)||cmpStr(a.available_date,b.available_date)||cmpStr(a.created_at,b.created_at)||cmpStr(a.fact_id,b.fact_id));
  const currents=g.filter(r=>r.is_current===true);
  if(currents.length>1)throw new Error(`derive_multiple_current:${g[0].concept}|${g[0].period_end}`);
  const row=currents[0]??g[g.length-1];
  const dec=parseDec(row.value);if(!dec)continue;
  const revised=g.some((r,i)=>r.is_revision===true||(r.is_revision===undefined&&i>0&&!sameNumber(r.value,g[i-1].value)));
  (out.get(row.concept)??out.set(row.concept,[]).get(row.concept)!).push({row,dec,revised});
 }
 return out;
}

export function deriveMetrics(allRows:FactRow[],opts:DeriveOptions):MetricRow[]{
 // Consolidated rows only: the metric vocabulary is consolidated-only and financial_metrics has no consolidation column in its key,
 // so mixing bases would pair a consolidated revenue with a parent gross profit or collide on the primary key.
 // Scope guard: one issuer and market per call, and the market must be the one being derived.
 if(allRows.some(r=>r.issuer_id!==allRows[0].issuer_id||r.market!==allRows[0].market||r.market!==opts.market))throw new Error('derive_mixed_scope');
 let rows=allRows.filter(r=>r.consolidation==='consolidated');
 if(rows.length===0)return [];
 // as_of is a UTC calendar date for every market (accepted, spec §8).
 const {market,asOf}=opts;const issuerId=rows[0].issuer_id;const basedOnRev=opts.basedOnRev??0;const basedOn=opts.basedOn??[{issuer_id:issuerId,state_rev:basedOnRev}];
 const facts=currentFacts(rows);
 const of=(concept:string)=>facts.get(concept)??[];
 const unique=<T>(xs:T[])=>xs.length===1?xs[0]:null;
 const same=(concept:string,ref:Cur)=>unique(of(concept).filter(c=>c.row.period_start===ref.row.period_start&&c.row.period_end===ref.row.period_end&&c.row.unit===ref.row.unit));
 const instant=(concept:string,end:string,unit:string)=>unique(of(concept).filter(c=>c.row.duration==='INSTANT'&&c.row.period_end===end&&c.row.unit===unit));
 const isDuration=(c:Cur):c is Cur&{row:FactRow&{period_start:string}}=>c.row.period_start!==null&&c.row.duration!=='INSTANT';
 const std=market==='US'?'us_standard':'cn_standard';
 const basisQ=(c:string)=>market==='CN'&&c==='capex_incl_intangibles'?'cn_incl_intangibles':std;
 const out:MetricRow[]=[];
 const emit=(metric:string,start:string,end:string,duration:MetricDuration,value:Dec,unit:string,inputUnit:string,basis:string,inputs:Input[])=>{
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
/bin/zsh -lc "rg -l 'create or replace function public.read_facts_lineage|CREATE OR REPLACE FUNCTION public.read_facts_lineage' . --glob '*.sql'; rg -n 'conflicts|is_current' src/lib/facts/memory*.ts; find . -name '*plan*3*' -o -name '*foundation*3*'" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 658ms:
./supabase/migrations/20261107091000_facts_extensions.sql
9:// disclosure_seq / is_current / is_revision over ok rows, key ranking and limit, 10,000-row cap).
210: // one (K, available_date) from different issuers with different values leave the sequences and go to conflicts.
216:  const conflicts:LineageConflict[]=[];const excluded=new Set<string>();
224:    conflicts.push({key:{concept:f0.concept,period_start:f0.period_start,period_end:f0.period_end,consolidation:f0.consolidation,unit:f0.unit},available_date:f0.available_date,fact_ids:g.map(f=>f.fact_id).sort(cmp)});
227:   conflicts.sort((a,b)=>cmp(a.available_date,b.available_date)||cmp(s(a.key.concept),s(b.key.concept))||cmp(s(a.key.period_end),s(b.key.period_end))||cmp(s(a.key.period_start),s(b.key.period_start))||cmp(s(a.key.consolidation),s(b.key.consolidation))||cmp(s(a.key.unit),s(b.key.unit)));
233:  for(const g of groups.values()){g.sort(byDisclosure);g.forEach((f,i)=>out.push({...clone(f),disclosure_seq:i+1,is_current:i===g.length-1,is_revision:i>0&&!numericEquals(f.value,g[i-1].value)}));}
234:  for(const f of eligible)if(f.status!=='ok')out.push({...clone(f),disclosure_seq:undefined,is_current:false,is_revision:false});
237:  const picked=out.filter(f=>(o.history===true||f.is_current===true)&&(o.limit===undefined||rank.get(keyOf(f))!<=o.limit));
239:  if(picked.length>READ_FACTS_CAP)return {stateRevs,lineage:set,rows:[],conflicts,truncated:true};
240:  return {stateRevs,lineage:set,rows:picked,conflicts,truncated:false};
./.claude/scratch/plan3-parts
./docs/audits/2026-11-05-data-foundation-3
./docs/audits/2026-11-04-data-foundation-3
./docs/audits/2026-11-05-data-foundation-3-plan
./docs/audits/2026-11-05-data-foundation-3-plan/04-codex-plan-audit-round3.md
./docs/audits/2026-11-04-data-foundation-2-plan/04-codex-plan-audit-round3.md
./docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md
./docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md

exec
/bin/zsh -lc "sed -n '200,243p' src/lib/facts/memory-db.ts; rg -n 'read_facts_lineage|replace_financial_metrics_lineage|status|conflict' supabase/migrations/20261107091000_facts_extensions.sql | tail -65; rg -n 'materialize\\(' src/lib | head -35; sed -n '80,180p' src/lib/entities/resolve.ts; rg -n 'conflict|retry|targetOf' docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md | head -30" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 10ms:
sed: src/lib/facts/memory-db.ts: No such file or directory
446:      where q.table_name = 'financial_facts' and q.reason_code = 'same_day_conflict' and q.status <> 'open'
451:      where q.table_name = 'financial_facts' and q.reason_code = 'lineage_conflict' and q.status <> 'open'
459:        and (q.status <> 'resolved_accept' or (q.detail -> 'latest_result' -> 'passed') is distinct from 'true'::jsonb));
475:-- (K + filing + generation) in any status → duplicate (an old generation alone is no duplicate);
476:-- a visible ok row of (K, available_date) with another value OR an open same_day_conflict /
477:-- lineage_conflict on it → conflict_exists. Then one transaction: a management run (published, no
490:  if not found or q.status <> 'open' then raise exception 'item_not_open' using errcode = 'P0001'; end if;
543:  if not found or b.status <> 'running' or b.dataset <> q.dataset then raise exception 'batch_mismatch' using errcode = 'P0001'; end if;
553:     or not exists (select 1 from public.issuers i where i.issuer_id = v_t and i.status = 'active') then
560:  if q.status <> 'open' then raise exception 'item_not_open' using errcode = 'P0001'; end if;
568:             where f.issuer_id = any(v_lineage) and f.market = g.market and f.status = 'ok' and f.concept = c ->> 'concept'
572:                where d.table_name = 'financial_facts' and d.status = 'open' and d.reason_code = 'same_day_conflict'
580:                where d.table_name = 'financial_facts' and d.status = 'open' and d.reason_code = 'lineage_conflict'
582:    raise exception 'conflict_exists' using errcode = 'P0001';
584:  insert into public.fact_sync_runs (run_id, issuer_id, market, batch_id, mapping_gen, status, manifest, started_at, published_at)
589:  update public.financial_facts set status = 'ok' where fact_id = v_fact;
591:  set status = 'resolved_accept', resolved_by = p_resolved_by, resolved_at = now(),
615:  if not found or q.status <> 'open' or q.table_name <> 'financial_facts' or q.reason_code <> 'reconcile_mismatch' then
618:  if not exists (select 1 from public.ingest_batches where batch_id = p_batch and status = 'running') then raise exception 'batch_mismatch' using errcode = 'P0001'; end if;
628:  if q.status <> 'open' then raise exception 'item_not_open' using errcode = 'P0001'; end if;
635:  set status = 'resolved_accept', resolved_by = p_resolved_by, resolved_at = now(),
639:  v_before := array(select f.fact_id from public.financial_facts f where f.fact_id = any(v_ids) and f.status = 'quarantined');
648:  where f.fact_id is null or not (x.id = any(v_before)) or f.status <> 'ok';
654:-- ---------------------------------------------------------------- 10. lineage verdict (spec §3.2 resolve_lineage_conflict, §4.4)
664:create or replace function public.resolve_lineage_conflict(p_item uuid, p_keep uuid, p_batch uuid, p_resolved_by uuid)
671:  if not found or q.status <> 'open' then raise exception 'item_not_open' using errcode = 'P0001'; end if;
672:  if q.table_name <> 'financial_facts' or q.reason_code <> 'lineage_conflict' or q.dataset not in ('facts.us','facts.cn') then
675:  if not exists (select 1 from public.ingest_batches where batch_id = p_batch and status = 'running') then raise exception 'batch_mismatch' using errcode = 'P0001'; end if;
689:  if not exists (select 1 from public.issuers i where i.issuer_id = v_t and i.status = 'active') then raise exception 'target_not_active' using errcode = 'P0001'; end if;
693:  if q.status <> 'open' then raise exception 'item_not_open' using errcode = 'P0001'; end if;
700:    update public.financial_facts f set status = 'quarantined'
703:      and f.issuer_id = any(v_lineage) and f.market = v_market and f.status = 'ok' and f.fact_id <> p_keep
710:  where f.issuer_id = any(v_lineage) and f.market = v_market and f.status = 'ok'
715:  set status = 'resolved_accept', resolved_by = p_resolved_by, resolved_at = now(),
722:revoke execute on function public.resolve_lineage_conflict(uuid, uuid, uuid, uuid) from public, anon, authenticated;
723:grant execute on function public.resolve_lineage_conflict(uuid, uuid, uuid, uuid) to service_role;
726:-- The plan-2 body verbatim plus one guard: reconcile_mismatch and lineage_conflict items never close here.
733:  if not found or q.status <> 'open' or q.table_name <> 'financial_facts' then raise exception 'item_not_open' using errcode = 'P0001'; end if;
734:  -- migration two: these two reasons close only through restore_reconciled / resolve_lineage_conflict
735:  if q.reason_code in ('reconcile_mismatch', 'lineage_conflict') then raise exception 'use_dedicated_resolver' using errcode = '22023'; end if;
747:  if not found or q.status <> 'open' then raise exception 'item_not_open' using errcode = 'P0001'; end if;
750:  if exists (select 1 from public.financial_facts f join public.fact_sync_runs r on r.run_id = f.run_id where f.fact_id = any(v_ids) and r.status = 'staged') then
754:  if v_run is not null and exists (select 1 from public.fact_sync_runs r where r.run_id = v_run and r.status = 'staged') then
757:  if q.reason_code = 'same_day_conflict' then
766:  set status = 'resolved_accept', resolved_by = p_resolved_by, resolved_at = now(),
768:        || case when q.reason_code in ('same_day_conflict', 'identity_bs', 'identity_gp')
833:    and exists (select 1 from public.dq_reconcile_cycles y where y.pair = c.pair and y.cycle_id = c.cycle_id and y.status = 'running')
897:--  review_item / lineage_item: an open reconcile_review / lineage_conflict item (reused by natural
956:    select r.status into v_run from public.fact_sync_runs r where r.run_id = f.run_id;
960:  -- promotion; only an ok row changes visibility (status, state_rev, hook, materialize).
961:  if v_action = 'quarantine_left' and f.status in ('ok', 'quarantined') and v_run = 'published'
966:    where q.dataset = v_dataset and q.table_name = 'financial_facts' and q.natural_key = v_nk_item and q.reason_code = 'reconcile_mismatch' and q.status = 'open'
970:      insert into public.dq_quarantine (id, dataset, table_name, natural_key, reason_code, detail, payload, batch_id, status)
974:                || case when f.status = 'ok' then jsonb_build_object('hook', jsonb_build_object('stage', 'materialize', 'state', 'pending', 'at', to_jsonb(v_now))) else '{}'::jsonb end,
983:        || case when f.status = 'ok' then jsonb_build_object('hook', jsonb_build_object('stage', 'materialize', 'state', 'pending', 'at', to_jsonb(v_now))) else '{}'::jsonb end
986:    if f.status = 'ok' then
987:      update public.financial_facts set status = 'quarantined' where fact_id = v_left and status = 'ok';
992:  elsif v_left is not null and f.status = 'quarantined' and p_result ->> 'outcome' = 'compared' then
995:      where q.table_name = 'financial_facts' and q.reason_code = 'reconcile_mismatch' and q.status = 'open' and q.detail ->> 'pair' = c.pair
1001:    v_reason := case v_action when 'review_item' then 'reconcile_review' else 'lineage_conflict' end;
1005:    where q.dataset = v_dataset and q.table_name = 'financial_facts' and q.natural_key = p_result -> 'item' ->> 'natural_key' and q.reason_code = v_reason and q.status = 'open';
1008:      insert into public.dq_quarantine (id, dataset, table_name, natural_key, reason_code, detail, payload, batch_id, status)
1047:  select * into v_row from public.dq_reconcile_cycles where pair = p_pair and status = 'running';
1073:    insert into public.dq_reconcile_cycles (pair, cycle_id, started_at, finished_at, members, status, expected_total, detail)
1077:    select * into v_row from public.dq_reconcile_cycles where pair = p_pair and status = 'running';
src/lib/dq/facts-resolver.ts:63:  try{await materialize(db,where.issuer,where.market);hook={stage:'done',state:'done',at:now().toISOString()};}
src/lib/facts/sync.ts:285:  try{await materialize(db,issuer,market);}
src/lib/facts/derive.test.ts:266:  expect(await materialize(db,'I','US',{today:'2025-01-01'})).toEqual({rows:2,stateRev:8,retried:true,target:'I',basedOn:[{issuer_id:'I',state_rev:8}]});
src/lib/facts/derive.test.ts:276:  expect(await materialize(db,'S','US',{today:'2025-01-01'})).toMatchObject({target:'T',stateRev:5,basedOn:lin,retried:false});
src/lib/facts/derive.test.ts:285:  await expect(materialize(db,'I','US')).rejects.toMatchObject({code:'stale_computation'});
src/lib/facts/derive.test.ts:289:  expect(await materialize(db,'I','US',{today:'2025-01-01'})).toEqual({rows:0,stateRev:5,retried:false,target:'I',basedOn:[{issuer_id:'I',state_rev:5}]});
src/lib/facts/derive.test.ts:292:  await expect(materialize(other.db,'I','US')).rejects.toThrow('derive_scope_mismatch');
src/lib/facts/derive.test.ts:298:  await expect(materialize(db,'I','US')).rejects.toMatchObject({code:'read_truncated'});
src/lib/facts/sync-us.integration.test.ts:210:  const first=await materialize(db,issuers.AAPL,'US');
src/lib/facts/sync-us.integration.test.ts:213:  const second=await materialize(db,issuers.AAPL,'US');
src/lib/facts/sync-us.integration.test.ts:234:  await materialize(db,zz,'US');
src/lib/facts/sync-us.integration.test.ts:248:  const m=await materialize(db,zz,'US');
src/lib/facts/sync-us.integration.test.ts:279:  const m=await materialize(racing,zz,'US');
src/lib/facts/derive.ts:14:// materialize() follows the plan-3 lineage contract (spec §4.4, T9): target T = targetOf(issuer); the
src/lib/facts/derive.ts:230:export async function materialize(db:MaterializeDb,issuer:string,market:Market,opts:{today?:string}={}):Promise<MaterializeResult>{
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
25:| E2 | 研究队列 A/H 证券行中**可回填行**（该 ticker 在本库最早的持有行，且 `stocks_universe.list_date` 非空，且无 open 的 `window_evidence_conflict`/`ownership_conflict` 隔离项）`valid_from_method='listing_date'` 100%；不可回填行数与隔离项数单列 | 同脚本 `windows` 段，三个计数 |
40:- 规格二 `same_day_conflict` 的选定；`odd_duration`、`missing_available_date` 的人工选定（继续只能确认知晓）。
149:游标的认领与完成都要求所有权（§5.5）。**围栏令牌**：`fence = {pair, cycle_id, issuer_id, market, batch_id, attempt}`。**逐键原子提交（T2 规定修法，取代第 5 稿的"分步写入 + 作废"）**：对账派生的全部写入只经 `apply_reconcile_result(p_fence, p_result)`（§3.2），每次调用处理**一个预期键**，在**同一事务**内：锁游标行并校验 `claimed_by = fence.batch_id and attempts = fence.attempt and claim_until > clock_timestamp()`（否则 `raise 'fence_failed'`，无任何写入）→ 若该 `(pair, cycle_id, natural_key)` 已有结果行（已接受结果标记）→ 原样返回该行（幂等复用，不重复写入）→ 否则写 `dq_reconciliations` 结果行（带 `cycle_id/issuer_id/market/attempt`）+ 需要的工作项（`reconcile_mismatch`/`reconcile_review`/`lineage_conflict`）+ 可见性变化（左侧 `ok` → `quarantined`，持 scope 锁、`state_rev+1`，并在项上写 `detail.hook={stage:'materialize', state:'pending'}`）+ 已隔离左侧的 `latest_result` 更新。**租约丢失后，此前已提交的键仍然有效**（它们是被接受时的有效结果），接手的工作者对这些键直接复用；只有尚未提交的工作被丢弃。成员完成 `complete_reconcile_member(p_fence)` 的三个计数**从该成员本周期已接受的结果行推导**（`compared` 且 `passed` / `compared` 且非 `passed` / 其他 outcome），三者之和必须 = `expected`，否则 `raise 'member_incomplete'`；不存在"标记 superseded"的步骤。
240:**资格谓词加在共享助手 `fact_promote_rows(uuid,text,uuid[])`**（T6 规定修法；`create or replace`，保留落地的全部谓词与其 `revoke execute … from public, anon, authenticated, service_role`）：若该行曾属于某个已处理的 `lineage_conflict` 项，则必须在该项 `detail.chosen_fact_ids` 内；若该行有 open 的、或已处理但 `(detail->'latest_result'->>'passed')::boolean IS DISTINCT FROM true` 的 `reconcile_mismatch` 项引用，则不提升（恢复只能经 `restore_reconciled`；缺 `latest_result` 视为未通过）。`promote_quarantined` 保持为加锁/递增 rev 的包装；`resolve_facts_quarantine`、`restore_reconciled` 都经该助手提升。集成测试覆盖每个提升入口（`promote_quarantined`、`resolve_facts_quarantine`、`restore_reconciled`）。
246:| `set_filing_acceptance(p_filing, p_accepted, p_source) returns boolean` | `accepted_at is null` 时写入 true；相同 false；不同 `raise 'acceptance_conflict'` |
247:| `apply_reconcile_result(p_fence jsonb, p_result jsonb) returns jsonb` | **对账派生写入的唯一入口（T2 规定修法；取代第 5 稿的 `reconcile_quarantine` 与多动作版 `apply_reconcile_result`）**。`p_result = {natural_key, kind, outcome, passed, left_value, right_value, abs_diff, rel_diff, tolerance, left_source, right_source, detail, action, left_fact_id?, item?}`，`action ∈ {'record','quarantine_left','review_item','lineage_item'}`。一个事务内：锁 `p_fence` 指向的游标行并校验所有权/尝试号/未过期（失败 `fence_failed`，无写入）→ `(pair, cycle_id, natural_key)` 已有结果行 → 返回 `{reused:true, reconciliation_id}`（幂等）→ 写结果行（`cycle_id/issuer_id/market/attempt` 取自围栏）→ 按 `action`：`quarantine_left` 且左侧 `ok`、属于 `fence.issuer_id/market`、所属运行 `published`：持该 scope 行锁，建（或复用同自然键 open 的）`reconcile_mismatch` 项（`dataset = DATASETS.facts(market)`，`payload={key, fact_ids:[left], left_value, right_value, right_locator}`，`detail={pair, reconciliation_id, inputs_hash, latest_result, issuer_id, market, hook:{stage:'materialize', state:'pending', at}}`——物化目标与钩子同事务持久化，U2），左侧行置 `quarantined`，`state_rev+1`；左侧已 `quarantined` 且有引用它的 open `reconcile_mismatch` 项 → 只更新该项 `detail.latest_result={passed, reconciliation_id, at, inputs_hash}`；`review_item` → 建非隔离 `reconcile_review` 项；`lineage_item` → 建 `lineage_conflict` 项（§4.4）；`record` → 只写结果行。返回 `{reused:false, reconciliation_id, item_id?, quarantined:0|1, materialize:{issuer_id, market}?}`。物化由运行器在调用之后做（`T(issuer)`）；崩溃于提交与物化之间 → 项上 `hook.state='pending'`，由下一次运行或 `scripts/facts/materialize.ts --pending-hooks` 完成（§4.6） |
250:| `adopt_candidate(p_item uuid, p_index int, p_batch uuid, p_expected_rev bigint, p_resolved_by uuid) returns jsonb` | **候选适配（T5 规定修法）**：项 `open` 且 `reason_code='ambiguous_value'`，`dataset ∈ {'facts.us','facts.cn'}`（T4，落地小写）；`p_index` 越界 → `invalid_choice`。持久化候选是计划二 `FactCandidate`（`concept, sourceConcept, statement, periodStart, periodEnd, duration, value, unit, consolidation, filingRef, rawHash`），函数显式映射到插入字段：`source_concept←sourceConcept`、`period_start←periodStart`、`period_end←periodEnd`、`raw_hash←rawHash`；任一字段缺失或类型不对 → `invalid_candidate`。**filing**：`source` 由项的市场决定（`facts.us → edgar`、`facts.cn → tushare`），`filings(source, source_ref=filingRef)` 唯一定位，不存在 → `filing_not_found`；发行人与市场**取自该 filing 行**（不信任 payload）。**代**：取自项的锚定运行 `payload.run_id` 的 `fact_sync_runs.mapping_gen`，并须等于 `natural_key` 末段的代与 `filings.mapping_gen`（且 `> 0`），否则 `generation_moved`。**映射版本**：取该锚定运行（无则同 filing 同代）的事实行留存的 `mapping_version`，恰一个不同值才用；零个或多个 → `replay_required`（409，需重放原始快照，绝不取当前默认值）。`p_batch` 必须存在、`status='running'`、`dataset = 项.dataset`（否则 `batch_mismatch`）；持该 (filing.issuer_id, filing.market) 的 scope 行锁；`state_rev <> p_expected_rev` → `stale_evaluation`。**重复（T1）**：规格二完整候选键（K + `filing_id` + `mapping_gen`）在任何状态下已存在 → `duplicate`；仅旧代存在同键**不**构成重复。在 scope 锁下检查，**任一**成立即 `conflict_exists`（U3）：同 K 同日存在值不同的 `ok` 行；**或**存在适用的 open 争议项（同 K 同日的 `same_day_conflict`/`lineage_conflict`）。测试：有 open 争议、无剩余 `ok` 竞争者时采用被拒。同一事务：生成 `run_id` 与 `fact_id`；插入 `fact_sync_runs(run_id, issuer_id=filing.issuer_id, market=filing.market, batch_id=p_batch, mapping_gen=该代, status='published', manifest='[]', started_at=now(), published_at=now())`（管理运行：不激活映射代，不改 `filings.mapping_gen`）；插入事实（`issuer_id`、`market`、`filing_id`、`available_date = filing.available_date`、`mapping_gen`、核实的 `mapping_version`）`staged` 再 `→ok`；项 `resolved_accept`、`resolved_by/at`、`detail.chosen_candidate_index/adopted_fact_id/run_id/issuer_id/market`、`detail.hook={stage:'materialize', state:'pending', at}`；`state_rev + 1`；返回 `{fact_id, run_id, issuer_id, market}` |
251:| `resolve_lineage_conflict(p_item uuid, p_keep uuid, p_batch uuid, p_resolved_by uuid) returns jsonb` | 项 `open`、`reason_code='lineage_conflict'`；从 `natural_key` 取目标 T；在事务内先计算 **T 的当前完整谱系**（T ∪ 所有 `merged_into = T`）并按 `(issuer_id, market)` 排序锁定谱系每个成员的 scope 行（缺失 → `scope_missing`）；payload 中行的发行人必须 ⊆ 谱系（否则 `lineage_changed`）；`p_keep ∈ payload.fact_ids`；把谱系内该 (K, 日期) 除 `p_keep` 外仍 `ok` 的行（不限于 payload，锁下重新查询）置 `quarantined`；结束后该 (K, 日期) 在谱系内恰有一个 `ok` 值（否则回滚 `unresolved`）；项 `resolved_accept`、`detail.chosen_fact_ids=[p_keep]`、`detail.quarantined_fact_ids`；谱系每个 scope `state_rev + 1`；返回 `{quarantined}` |
252:| `read_facts_lineage(p_issuers uuid[], p_market, p_concepts, p_as_of, p_from, p_to, p_history, p_limit, p_include_non_ok default false) returns jsonb` | 规格二 `read_facts` 的同一语句模板，`f.issuer_id = any(p_issuers)`，分区键去掉 `issuer_id`。**跨发行人冲突抑制只在 `array_length(p_issuers,1) > 1` 时生效，且只看 `ok` 行**：同 K 同 `available_date` 来自不同发行人且值不同的 `ok` 行不参与当前值，列入 `conflicts`；**保留落地的九参数签名与信封语义（T7 规定修法）**：只有合格的 `ok` 行参与序列窗口；非 `ok` 行带 `disclosure_seq=NULL`、`is_current=false`、`is_revision=false`，且只在 `p_history=true` 时返回；保留激活代过滤、概念键限额、10,000 行截断时空结果、十进制字符串与 RLS；非 `ok` 行不参与抑制。信封 `{state_revs:[{issuer_id, state_rev}], lineage:[…], rows:[…含 issuer_id…], conflicts:[{key, available_date, fact_ids}], truncated, row_count}`。规格二 `read_facts(p_issuer, …)` 改为对单元素数组调用后映射：`state_rev = state_revs[0].state_rev`，去掉 `lineage/conflicts`；单发行人时抑制不生效，因此输出与第 8 稿语义**完全一致**（集成测试对 `ok`/`includeNonOk`/`history` 三种模式逐字段比较）。`security invoker`，`grant execute to anon, authenticated, service_role` |
280:- 写入（`apply.ts`，目标行 `(issuer_id, ticker, valid_from)`）：列为空 → 守卫更新写值 + provenance；已有且相同 → 若 provenance 缺该键则只补 provenance（`duplicates`）；已有且不同 → claim `correct_identifier`（`params.expected_current=<旧值>`，`params.new_value`），不覆盖。ISIN 唯一/互斥冲突 → claim + 隔离 `ownership_conflict`。
307:| `set_identifier` | lei/cik/usci/cninfo_org_id | `{issuer_id}` | `{}` | `update issuers set <col>=value, provenance=provenance||{<col>:prov} where issuer_id and status='active' and <col> is null`；唯一冲突/0 行 → `value_conflict` |
309:| `correct_identifier` | 同上两组 | 同上 | `{expected_current, new_value}` | `where <col> = expected_current` 的守卫更新；0 行 → `value_conflict`；`value` 列 = `new_value` |
310:| `attach_security` | ticker | `{issuer_id}` | `{share_class, valid_from, valid_from_method, source, isin?}` | 插入 `issuer_securities`（`source` 必填；冲突分类同 `attachSecurity` → `ownership_conflict`） |
312:| `backdate_window` | ticker | `{issuer_id, ticker, valid_from}` | `{new_valid_from, valid_from_method}` | `update … set valid_from=new where … and valid_from=target.valid_from`；0 行 → `value_conflict`；23505/23P01 → `ownership_conflict` |
320:1. **同 LEI**（自动，`hard_identifier`）：阶段 B 对该 LEI 返回 `HK` ticker，且该 ticker 在 `stocks_universe` 且无持有人 → `attachSecurity({issuer_id, ticker, isin, share_class, valid_from: stocks_universe.list_date ?? as_of, valid_from_method: list_date ? 'listing_date' : 'first_observed', source:'gleif_openfigi', provenance})`；已被别的发行人持有 → `ownership_conflict` 隔离。`share_class='H'` 只在该发行人同时持有 `.SH/.SZ` 行或有 USCI 时判定，否则 `unknown`。
336:  - `list_date <= valid_from` → `update … set valid_from=list_date, valid_from_method='listing_date', provenance=provenance||{valid_from:{source:'stocks_universe.list_date', provider:<source>, as_of, row:{list_date, source, source_updated_at}}} where issuer_id and ticker and valid_from=<旧>`（相等时只改方法与 provenance）。23P01/23505 → 隔离 `ownership_conflict`。
337:  - `list_date > valid_from` → 隔离 `window_evidence_conflict`，不改。
357:  - 该 ticker 在文件中归另一 CIK → `ownership_conflict` 隔离，不关闭。
367:- 谱系 = `{T} ∪ {i | i.merged_into = T}`（一跳）。事实行保留原 `issuer_id`。读取用 `read_facts_lineage`；跨发行人同 K 同日不同值的 `ok` 行不参与当前值、进 `conflicts`。
369:- 冲突处置：对账对 `facts.lineage_same_day`（游标：合并时登记 + 每周）对每个 `conflicts` 条目写对账行（`kind='numeric'`，`outcome='compared'`，`passed=false`）并建隔离项 `lineage_conflict`（`natural_key=<T>:<K>:<available_date>`，`payload={fact_ids, values:[{issuer_id, filing, value}]}`）。管理员 POST 体 `keep_fact_id` → `resolve_lineage_conflict`（原子、排序锁、结束后恰一个 `ok` 值、裁决持久化并被 `promote_quarantined` 附加条款遵守）。不自动择一。
372:- 读接口：`issuerId`=T，`lineage`，`conflicts`，每行 `recordedIssuerId`。**`/metrics` 无 `asOf`（T8 规定修法，保留落地的前后两次读取守卫）**：读指标前后各读一次谱系成员与 `stateRevs(lineage)`；两次的成员与 rev 向量必须相同，且每个返回行的 `based_on_lineage` 等于该向量；任何不一致或读取不稳定 → `metrics:[]`、`stale:true`，沿用落地的 stale 缓存策略（`STALE_CACHE_CONTROL`）；不内联重算（由上述操作路径重算）。
376:规格二美股路第 9 步后加 9b `enrichAcceptance(issuer)`；脚本 `scripts/facts/enrich-acceptance.ts [--issuer …] [--apply] [--report]`。用 §4.3.3 同一份 submissions；按 `accessionNumber` 索引（含分页）；`accepted_at is null` 的 edgar filing 逐个 `set_filing_acceptance`；未命中 → `skipped_summary(acceptance_not_found)`。`filingDate ≠ available_date` → 对账对 `sec.filing_date_vs_submissions`（`kind='date'`，failed），不写。计数：写入 `inserted`，相同 `duplicates`，`acceptance_conflict` → `failed`。
380:规格二 §7.3 规定 `facts.*` 项的接受全部经 `resolve_facts_quarantine`。**落地的分派点是 `src/lib/dq/facts-resolver.ts::resolveFactsItem`（由 `/api/admin/dq/quarantine/[id]` 调用），本规格扩展它（T10 规定修法）**，接受分支：`ambiguous_value` 带 `chosen_candidate_index` → `adopt_candidate`；`reconcile_mismatch` → `restore_reconciled`；`lineage_conflict` 带 `keep_fact_id` → `resolve_lineage_conflict`；`reconcile_review` → 计划一通用的守卫状态翻转（接受与拒绝都只改状态，不提升、不物化）；其余 `facts.*` 原因 → 落地路径（`resolve_facts_quarantine`）。拒绝分支保持落地的通用翻转（行保持 `quarantined`）。保留落地语义：持久化的 `chosen_fact_ids`、持久化的裁决人归属（`recovered`）、失败重试的 HTTP 502。**每个新的可见性变化裁决**（`adopt_candidate`、`restore_reconciled`、`resolve_lineage_conflict`）都在其 SQL 函数的同一事务内写 `detail.hook={stage:'materialize', state:'pending', at}` 与物化目标（`detail.issuer_id/market`）；恢复按持久化的目标与裁决处理缺失/pending/failed 钩子（`FACT_ROW_REASONS` 扩展为包含这三个原因的恢复判定）。新增 `scripts/facts/materialize.ts --pending-hooks`（落地脚本目前没有该参数）：扫描 (a) 全部 `facts.*` **已处理**项中 `hook.state ∈ {pending, failed}` 或缺失钩子的可见性裁决（采用、恢复、谱系），以及 (b) **open** 的 `reconcile_mismatch` 项中 `hook.state ∈ {pending, failed}` 者（对账隔离，项在人工处理前一直 open）；按项上持久化的 `detail.issuer_id/market` 取发行人，恢复时按当前拓扑重新求物化目标 `T(i)`（U2）。测试：`apply_reconcile_result` 提交后立即崩溃、项仍 open → 扫描完成物化。分派表与其测试必须穷举以上分支。
405:| `facts.lineage_same_day` | numeric | 谱系 `conflicts` | `<T>:<K>:<available_date>` | 0 | `lineage_item` |
520:| `GET /api/facts/[ticker]`、`/metrics`、`/api/filings/[ticker]` | `tickerAsOf`；响应 `lineage`、`resolution`、`conflicts`、`recordedIssuerId`、`acceptedAt`；`/metrics` 加 `stale` |
528:顺序：`requireAdminUser()`（401/403）→ `Content-Type`（415）→ Origin（403）→ UUID（400）→ body `{status:'accepted'|'rejected', amend?:{op, target, params}}`（400；`amend` 经 `validateClaimDetail`）→ `rpc('resolve_identifier_claim', {p_id, p_status, p_resolved_by, p_amend})`。错误映射：`already_resolved`→409；`legacy_claim`/`amend_required`→409；`value_conflict`/`ownership_conflict`/`already_closed`→409（项保持 pending）；其他→500。成功写 `research_audit_log(action='dq.claim_resolve', detail={id, status, op, applied, amended})`。
537:- **隔离面板**：`ambiguous_value` 候选单选 → "接受并采用候选 n"；`lineage_conflict` 显示各发行人的值并单选"保留此行"；`reconcile_mismatch` 显示 `latest_result`（通过且输入未变时"恢复"可用，否则禁用并说明）。
554:| 映射 ticker 属他人 / ISIN 已被持有 | claim + 隔离 | `ownership_conflict` | partial |
558:| 回填：上市日晚于观测 / 退市早于上市 | 隔离 | `window_evidence_conflict` | partial |
559:| 回填：23P01/23505 | 隔离 | `ownership_conflict` | partial |

exec
/bin/zsh -lc "sed -n '170,320p' supabase/migrations/20261107091000_facts_extensions.sql; cat src/lib/entities/resolve.ts | head -100; sed -n '365,373p' docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 57ms:
  if p_based_on_rev < 0 then raise exception 'stale_computation' using errcode = 'P0001'; end if;
  return public.replace_financial_metrics_lineage(p_issuer, p_market, jsonb_build_array(jsonb_build_object('issuer_id', p_issuer, 'state_rev', p_based_on_rev)), p_rows);
end $$;
revoke execute on function public.replace_financial_metrics(uuid, text, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.replace_financial_metrics(uuid, text, bigint, jsonb) to service_role;

-- ---------------------------------------------------------------- 4. evidence reader (spec §3.2 read_filing_facts, S2/T1)
-- Every generation and status of one filing (p_include_non_ok = false: ok only), no window
-- computation; binding to the active generation / published runs is the caller's job.
create or replace function public.read_filing_facts(p_filing uuid, p_include_non_ok boolean)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('rows', coalesce(jsonb_agg((to_jsonb(f) - 'value') || jsonb_build_object('value', f.value_text, 'run_status', r.status)
           order by f.mapping_gen, f.concept collate "C", f.period_end, f.period_start nulls first, f.unit collate "C", f.created_at, f.fact_id), '[]'::jsonb))
  from public.financial_facts f
  join public.fact_sync_runs r on r.run_id = f.run_id
  where f.filing_id = p_filing and (f.status = 'ok' or coalesce(p_include_non_ok, false))
$$;
revoke execute on function public.read_filing_facts(uuid, boolean) from public, anon, authenticated;
grant execute on function public.read_filing_facts(uuid, boolean) to service_role;

-- ---------------------------------------------------------------- 5. lineage read (spec §3.2 read_facts_lineage, §4.4, T7)
-- The plan-2 read_facts statement over a member set: partitions carry no issuer_id; only qualified
-- ok rows take part in sequences; non-ok rows carry disclosure_seq null / false flags and appear only
-- with p_history; active-generation filter, key ranking and limit, the 10,000-row cap (truncated ⇒
-- no rows), decimal strings and RLS (security invoker) are unchanged. Cross-issuer suppression only
-- with more than one member and only over ok rows: a (K, available_date) whose ok rows come from
-- different issuers with different values takes no part in sequences and is listed in conflicts.
-- Envelope {state_revs (issuer_id asc), lineage (asc), rows, conflicts, truncated, row_count}.
create or replace function public.read_facts_lineage(
  p_issuers uuid[], p_market text, p_concepts text[], p_as_of date,
  p_from date, p_to date, p_history boolean, p_limit int, p_include_non_ok boolean default false)
returns jsonb language sql stable security invoker set search_path = public as $$
with members as (
  select distinct u.m as issuer_id from unnest(coalesce(p_issuers, '{}'::uuid[])) as u(m) where u.m is not null
), base as (
  select f.fact_id, f.issuer_id, f.market, f.filing_id, f.run_id, f.concept, f.source_concept, f.statement,
         f.period_start, f.period_end, f.duration, f.value, f.value_text, f.unit, f.consolidation, f.available_date,
         f.mapping_gen, f.mapping_version, f.status, f.raw_hash, f.created_at
  from public.financial_facts f
  join public.filings g on g.filing_id = f.filing_id and g.mapping_gen = f.mapping_gen
  where f.issuer_id in (select issuer_id from members) and f.market = p_market
    and (p_concepts is null or f.concept = any(p_concepts))
    and f.available_date <= p_as_of
    and (p_from is null or f.period_end >= p_from)
    and (p_to is null or f.period_end <= p_to)
    and (f.status = 'ok' or coalesce(p_include_non_ok, false))
), clash as (
  select b.concept, b.period_start, b.period_end, b.consolidation, b.unit, b.available_date,
         jsonb_agg(to_jsonb(b.fact_id::text) order by b.fact_id) as fact_ids
  from base b
  where b.status = 'ok' and (select count(*) from members) > 1
  group by b.concept, b.period_start, b.period_end, b.consolidation, b.unit, b.available_date
  having count(distinct b.issuer_id) > 1 and count(distinct b.value) > 1
), eligible as (
  select b.* from base b
  where b.status <> 'ok' or not exists (
    select 1 from clash c
    where c.concept = b.concept and c.period_start is not distinct from b.period_start and c.period_end = b.period_end
      and c.consolidation = b.consolidation and c.unit = b.unit and c.available_date = b.available_date)
), seq as (
  select b.*,
         row_number() over w as disclosure_seq,
         (row_number() over w = count(*) over (partition by b.concept, b.period_start, b.period_end, b.consolidation, b.unit)) as is_current,
         (lag(b.value) over w is not null and b.value <> lag(b.value) over w) as is_revision
  from eligible b
  where b.status = 'ok'
  window w as (partition by b.concept, b.period_start, b.period_end, b.consolidation, b.unit order by b.available_date, b.created_at, b.fact_id)
  union all
  select b.*, null::bigint, false, false from eligible b where b.status <> 'ok'
), keyed as (
  select s.*,
         dense_rank() over (order by s.period_end desc, s.concept collate "C", s.period_start desc nulls last, s.consolidation collate "C", s.unit collate "C") as key_rank
  from seq s
), picked as (
  select * from keyed k
  where (coalesce(p_history, false) or k.is_current) and (p_limit is null or k.key_rank <= p_limit)
), capped as (
  select * from picked order by key_rank, available_date, created_at, fact_id limit 10001
), counted as (
  select count(*)::int as n from capped
)
select jsonb_build_object(
  'state_revs', (select coalesce(jsonb_agg(jsonb_build_object('issuer_id', m.issuer_id, 'state_rev', public.fact_state_rev(m.issuer_id, p_market)) order by m.issuer_id), '[]'::jsonb) from members m),
  'lineage', (select coalesce(jsonb_agg(to_jsonb(m.issuer_id::text) order by m.issuer_id), '[]'::jsonb) from members m),
  'conflicts', (select coalesce(jsonb_agg(jsonb_build_object(
                   'key', jsonb_build_object('concept', c.concept, 'period_start', c.period_start, 'period_end', c.period_end, 'consolidation', c.consolidation, 'unit', c.unit),
                   'available_date', c.available_date, 'fact_ids', c.fact_ids)
                 order by c.available_date, c.concept collate "C", c.period_end, c.period_start nulls first, c.consolidation collate "C", c.unit collate "C"), '[]'::jsonb) from clash c),
  'truncated', (select n from counted) > 10000,
  'row_count', case when (select n from counted) > 10000 then 0 else (select n from counted) end,
  'rows', case when (select n from counted) > 10000 then '[]'::jsonb
               else coalesce((select jsonb_agg((to_jsonb(c) - 'key_rank' - 'value') || jsonb_build_object('value', c.value_text) order by c.key_rank, c.available_date, c.created_at, c.fact_id) from capped c), '[]'::jsonb) end)
$$;
revoke execute on function public.read_facts_lineage(uuid[], text, text[], date, date, date, boolean, int, boolean) from public;
grant execute on function public.read_facts_lineage(uuid[], text, text[], date, date, date, boolean, int, boolean) to anon, authenticated, service_role;

-- Plan-2 signature and envelope {state_rev, rows, truncated, row_count}: one member, so the
-- suppression never applies and the output is that of the plan-2 statement.
create or replace function public.read_facts(
  p_issuer uuid, p_market text, p_concepts text[], p_as_of date,
  p_from date, p_to date, p_history boolean, p_limit int, p_include_non_ok boolean default false)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'state_rev', coalesce(x.v -> 'state_revs' -> 0 -> 'state_rev', to_jsonb(public.fact_state_rev(p_issuer, p_market))),
    'truncated', x.v -> 'truncated', 'row_count', x.v -> 'row_count', 'rows', x.v -> 'rows')
  from (select public.read_facts_lineage(array[p_issuer], p_market, p_concepts, p_as_of, p_from, p_to, p_history, p_limit, p_include_non_ok) as v) x
$$;
revoke execute on function public.read_facts(uuid, text, text[], date, date, date, boolean, int, boolean) from public;
grant execute on function public.read_facts(uuid, text, text[], date, date, date, boolean, int, boolean) to anon, authenticated, service_role;

-- ---------------------------------------------------------------- 6. topology writers (spec §3.1 guard, §3.2 set_merge / set_dissolved, R3, T12)
-- Placeholder scope rows (priority 0, reasons [], fetch_key 'topology' — the plan-2 check needs
-- 1..32 characters) for every issuer of the set in both markets, never overwriting an existing row,
-- then every scope row of the set locked in (issuer_id, market) order.
create or replace function public.fact_topology_lock(p_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.fact_sync_scope (issuer_id, market, reasons, priority, fetch_key)
  select i, mk.m, '[]'::jsonb, 0, 'topology'
  from unnest(p_ids) as i cross join (values ('US'), ('CN')) as mk(m)
  on conflict (issuer_id, market) do nothing;
  perform 1 from public.fact_sync_scope s where s.issuer_id = any(p_ids) order by s.issuer_id, s.market for update;
end $$;
revoke execute on function public.fact_topology_lock(uuid[]) from public, anon, authenticated, service_role;

-- Body of set_merge (runs with entities.allow_topology_write on). Affected set = {source, target}
-- ∪ referrers of both; scope rows locked; issuers rows locked; the set re-read under the locks
-- (changed → lineage_changed); referrers of the source re-pointed to the target (row_count = n);
-- the source retired (row_count = 1, else source_not_active); the plan-1 triggers check the target
-- is active and the source holds no open security (errors pass through); every affected scope
-- state_rev + 1; the target joins the next facts.lineage_same_day cycle — entry {issuer_id:T, market,
-- source:S} appended under the cycle lock open_reconcile_cycle also takes (plan audit Q2), so a cycle
-- creation never overwrites or half-consumes it; audit row.
-- Lock order (plan audit R1): the cycle advisory lock is taken FIRST, before the scope rows
-- (fact_topology_lock) and the issuers rows. open_reconcile_cycle holds the same advisory lock while
-- its cursor inserts take KEY SHARE on issuers rows (cursor → issuers FK); taking the advisory lock
-- after the issuer locks would let a merge hold FOR UPDATE on the target while waiting for the
-- advisory lock that a creator holds while waiting for that row — a deadlock. Global rule: any
-- function that takes a dq_reconcile_cycle:* advisory lock takes it before any row lock.
create or replace function public.fact_set_merge_body(p_source uuid, p_target uuid, p_resolved_by uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_set uuid[]; v_now uuid[]; v_refs uuid[]; n int;
begin
  if p_source is null or p_target is null or p_source = p_target then raise exception 'invalid_merge' using errcode = '22023'; end if;
  if p_resolved_by is null then raise exception 'invalid_resolver' using errcode = '22023'; end if;
  if not exists (select 1 from public.issuers where issuer_id = p_source) then raise exception 'source_not_active' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.issuers where issuer_id = p_target) then
    raise exception 'merge_target_not_active: issuer % cannot merge into % (status missing)', p_source, p_target using errcode = '23514';
  end if;
  perform pg_advisory_xact_lock(hashtext('dq_reconcile_cycle:facts.lineage_same_day'));   -- FIRST, before any row lock (plan audit R1); serialises with open_reconcile_cycle (plan audit Q2)
  v_set := array(select distinct x from unnest(array[p_source, p_target] || array(select issuer_id from public.issuers where merged_into in (p_source, p_target))) as x order by x);
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
### 4.4 合并后发行人的事实归属（读时谱系）

- 谱系 = `{T} ∪ {i | i.merged_into = T}`（一跳）。事实行保留原 `issuer_id`。读取用 `read_facts_lineage`；跨发行人同 K 同日不同值的 `ok` 行不参与当前值、进 `conflicts`。
- 拓扑写入只经 `set_merge`/`set_dissolved`（§3.2；触发器 `issuers_topology_guard` 挡住其他路径）：持源、目标与两者全部引用方的 scope 锁、改指引用方、递增 `state_rev`、登记谱系对账成员。
- 冲突处置：对账对 `facts.lineage_same_day`（游标：合并时登记 + 每周）对每个 `conflicts` 条目写对账行（`kind='numeric'`，`outcome='compared'`，`passed=false`）并建隔离项 `lineage_conflict`（`natural_key=<T>:<K>:<available_date>`，`payload={fact_ids, values:[{issuer_id, filing, value}]}`）。管理员 POST 体 `keep_fact_id` → `resolve_lineage_conflict`（原子、排序锁、结束后恰一个 `ok` 值、裁决持久化并被 `promote_quarantined` 附加条款遵守）。不自动择一。
- `fact_sync_scope`：`merged` 发行人 `priority=0`、`reasons=[]`。
- 物化目标：对发行人 i 的任何可见性操作（发布、提升、对账隔离、采用候选、谱系裁决、恢复）后，物化 `T(i) = i.merged_into ?? i`。**扩展落地的 `materialize(db, issuer, market, opts)` 契约（T9）**：读 T 的当前谱系 → `readFactsLineage(lineage, market, …)`（`truncated` → 拒绝，不写）→ 校验每行 `issuer_id ∈ 谱系`（替代落地的"行必须属于本发行人"检查）→ 为 T 派生 → `replaceMetricsLineage(T, market, state_revs, rows)`；`stale_computation` → 重读重算一次（保留落地的一次重试）。
- 读接口：`issuerId`=T，`lineage`，`conflicts`，每行 `recordedIssuerId`。**`/metrics` 无 `asOf`（T8 规定修法，保留落地的前后两次读取守卫）**：读指标前后各读一次谱系成员与 `stateRevs(lineage)`；两次的成员与 rev 向量必须相同，且每个返回行的 `based_on_lineage` 等于该向量；任何不一致或读取不稳定 → `metrics:[]`、`stale:true`，沿用落地的 stale 缓存策略（`STALE_CACHE_CONTROL`）；不内联重算（由上述操作路径重算）。


exec
/bin/zsh -lc "sed -n '65,115p' supabase/migrations/20261107091000_facts_extensions.sql; nl -ba src/lib/facts/derive.ts | tail -24; git diff f47981b"'^ f47981b --stat; git rev-parse HEAD' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
    if old.accepted_at is not null or old.acceptance_source is not null then
      raise exception 'append_only: filings.accepted_at is set once (null -> value)' using errcode = '23514';
    end if;
    if current_setting('facts.allow_acceptance_write', true) is distinct from 'on' then
      raise exception 'append_only: filings.accepted_at is written only by set_filing_acceptance' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

-- accepted_at is null → write, true; the same value and source → false; another value → acceptance_conflict.
create or replace function public.set_filing_acceptance(p_filing uuid, p_accepted timestamptz, p_source text)
returns boolean language plpgsql security definer set search_path = public as $$
declare g public.filings;
begin
  if p_accepted is null or p_source is distinct from 'sec_submissions' then raise exception 'invalid_acceptance' using errcode = '22023'; end if;
  select * into g from public.filings where filing_id = p_filing for update;
  if not found then raise exception 'filing_not_found' using errcode = 'P0001'; end if;
  if g.source <> 'edgar' then raise exception 'invalid_acceptance' using errcode = '22023'; end if;
  if g.accepted_at is null then
    perform set_config('facts.allow_acceptance_write', 'on', true);
    update public.filings set accepted_at = p_accepted, acceptance_source = p_source where filing_id = p_filing;
    perform set_config('facts.allow_acceptance_write', 'off', true);
    return true;
  end if;
  if g.accepted_at = p_accepted and g.acceptance_source = p_source then return false; end if;
  raise exception 'acceptance_conflict' using errcode = 'P0001';
end $$;
revoke execute on function public.set_filing_acceptance(uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public.set_filing_acceptance(uuid, timestamptz, text) to service_role;

-- ---------------------------------------------------------------- 2. financial_metrics.based_on_lineage (spec §3.2)
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'financial_metrics' and column_name = 'based_on_lineage') then
    alter table public.financial_metrics add column based_on_lineage jsonb not null default '[]';
    update public.financial_metrics set based_on_lineage = jsonb_build_array(jsonb_build_object('issuer_id', issuer_id, 'state_rev', based_on_rev));
    alter table public.financial_metrics add constraint financial_metrics_lineage_nonempty
      check (jsonb_typeof(based_on_lineage) = 'array' and jsonb_array_length(based_on_lineage) >= 1);
  end if;
end $$;

-- ---------------------------------------------------------------- 3. lineage materialisation (spec §3.2, §4.4)
-- p_based_on = [{issuer_id, state_rev}]: issuer ids unique and containing p_issuer. Every member's
-- scope row is locked in (issuer_id, market) order (a missing one → scope_missing); under the
-- locks the lineage {p_issuer} ∪ {merged_into = p_issuer} must equal the member set and every
-- state_rev must match, else stale_computation. Stored vector: issuer_id ascending.
create or replace function public.replace_financial_metrics_lineage(p_issuer uuid, p_market text, p_based_on jsonb, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare v_members uuid[]; v_norm jsonb; v_locked int; v_lineage uuid[]; v_rev bigint; n int;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_rows' using errcode = '22023'; end if;
   219	 * (replaces plan 2's "rows of this issuer only"); issuer ids are relabelled to T so the
   220	 * single-issuer derivation applies — the recorded issuer stays traceable through inputs[].fact_id.
   221	 * based_on_rev = T's rev in basedOn; based_on_lineage = basedOn.
   222	 */
   223	export function deriveLineageMetrics(rows:FactRow[],target:string,lineage:readonly string[],opts:{market:Market;asOf:string;basedOn:LineageRev[]}):MetricRow[]{
   224	 const members=new Set(lineage);
   225	 if(!members.has(target)||rows.some(r=>!members.has(r.issuer_id)||r.market!==opts.market))throw new Error(`derive_scope_mismatch:${target}/${opts.market}`);
   226	 const basedOnRev=opts.basedOn.find(x=>x.issuer_id===target)?.state_rev??0;
   227	 return deriveMetrics(rows.map(r=>r.issuer_id===target?r:{...r,issuer_id:target}),{market:opts.market,asOf:opts.asOf,basedOnRev,basedOn:opts.basedOn});
   228	}
   229	/** as_of = today; materialises T(issuer) over its current lineage (see the header). */
   230	export async function materialize(db:MaterializeDb,issuer:string,market:Market,opts:{today?:string}={}):Promise<MaterializeResult>{
   231	 const asOf=opts.today??new Date().toISOString().slice(0,10);
   232	 const target=await db.targetOf(issuer);
   233	 for(let attempt=0;;attempt++){
   234	  const lineage=await db.lineageOf(target);
   235	  const env=await db.readFactsLineage(lineage,market,{concepts:[...DERIVE_CONCEPTS[market]],asOf,history:true});
   236	  if(env.truncated)throw new FactsDbError('read_truncated',`read_facts_lineage truncated for ${target}/${market}`);
   237	  const rows=deriveLineageMetrics(env.rows,target,lineage,{market,asOf,basedOn:env.stateRevs});
   238	  const stateRev=env.stateRevs.find(x=>x.issuer_id===target)?.state_rev??0;
   239	  try{const n=await db.replaceMetricsLineage(target,market,env.stateRevs,rows);return {rows:n,stateRev,retried:attempt>0,target,basedOn:env.stateRevs};}
   240	  catch(e){if(attempt===0&&e instanceof FactsDbError&&e.code==='stale_computation')continue;throw e;}
   241	 }
   242	}
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-VRiZri6o' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-NdrfKajI' (errno=Operation not permitted)
 src/app/api/facts/[ticker]/metrics/route.test.ts | 105 +++++++++++++----------
 src/app/api/facts/[ticker]/metrics/route.ts      |  49 ++++++-----
 src/app/api/facts/[ticker]/route.test.ts         |  35 +++++++-
 src/app/api/facts/[ticker]/route.ts              |  37 ++++----
 src/app/api/filings/[ticker]/route.test.ts       |  26 +++---
 src/app/api/filings/[ticker]/route.ts            |  20 +++--
 src/lib/facts/derive.test.ts                     |  68 +++++++++------
 src/lib/facts/derive.ts                          |  36 +++++---
 src/lib/facts/public-route.test.ts               |  22 +++--
 src/lib/facts/public-route.ts                    |  48 +++++++----
 src/lib/facts/sync-us.integration.test.ts        |   6 +-
 11 files changed, 286 insertions(+), 166 deletions(-)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-Mbl28e4f' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-TbOYhiGC' (errno=Operation not permitted)
f47981b27e43465e39d16a2d3265df2b51c1676c

exec
/bin/zsh -lc "sed -n '115,145p' supabase/migrations/20261107091000_facts_extensions.sql; find /Volumes/AIMATE_WORK/Developer -maxdepth 2 -name AGENTS.md -o -name AGENTS.override.md" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_rows' using errcode = '22023'; end if;
  if p_issuer is null or p_market is null or p_market not in ('US','CN') then raise exception 'invalid_based_on' using errcode = '22023'; end if;
  if p_based_on is null or jsonb_typeof(p_based_on) <> 'array' or jsonb_array_length(p_based_on) = 0
     or exists (select 1 from jsonb_array_elements(p_based_on) e
                where jsonb_typeof(e) <> 'object'
                   or coalesce(jsonb_typeof(e -> 'issuer_id'), '') <> 'string'
                   or coalesce(jsonb_typeof(e -> 'state_rev'), '') <> 'number'
                   or (e ->> 'issuer_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                   or (e ->> 'state_rev') !~ '^[0-9]+$') then
    raise exception 'invalid_based_on' using errcode = '22023';
  end if;
  select array_agg((e ->> 'issuer_id')::uuid order by (e ->> 'issuer_id')::uuid),
         jsonb_agg(jsonb_build_object('issuer_id', (e ->> 'issuer_id')::uuid, 'state_rev', (e ->> 'state_rev')::bigint) order by (e ->> 'issuer_id')::uuid)
    into v_members, v_norm
  from jsonb_array_elements(p_based_on) e;
  if cardinality(v_members) <> (select count(distinct m) from unnest(v_members) m) or not (p_issuer = any(v_members)) then
    raise exception 'invalid_based_on' using errcode = '22023';
  end if;
  select count(*) into v_locked from (
    select 1 from public.fact_sync_scope s where s.issuer_id = any(v_members) and s.market = p_market order by s.issuer_id for update) x;
  if v_locked <> cardinality(v_members) then raise exception 'scope_missing' using errcode = 'P0001'; end if;
  -- a merged / dissolved issuer is no longer a materialisation target: the caller re-resolves T(i) and retries
  if not exists (select 1 from public.issuers where issuer_id = p_issuer and status = 'active') then raise exception 'stale_computation' using errcode = 'P0001'; end if;
  select array_agg(l.i order by l.i) into v_lineage
  from (select p_issuer as i union select issuer_id from public.issuers where merged_into = p_issuer) l;
  if v_lineage is distinct from v_members then raise exception 'stale_computation' using errcode = 'P0001'; end if;
  if exists (select 1 from jsonb_array_elements(v_norm) e
             join public.fact_sync_scope s on s.issuer_id = (e ->> 'issuer_id')::uuid and s.market = p_market
             where s.state_rev <> (e ->> 'state_rev')::bigint) then
    raise exception 'stale_computation' using errcode = 'P0001';
  end if;
/Volumes/AIMATE_WORK/Developer/osstack/AGENTS.md
/Volumes/AIMATE_WORK/Developer/伴元科技/AGENTS.md

codex
The lineage materialization retry does not refresh its target after a concurrent merge, so it cannot recover from that supported topology change.

Review comment:

- [P2] Re-resolve the materialization target on retry — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/facts/derive.ts:232-234
  If the target merges into another issuer during materialization, `replace_financial_metrics_lineage` rejects the now-inactive target with `stale_computation`. Because `targetOf(issuer)` runs outside the retry loop, the retry still writes to the old target and necessarily fails again, leaving the new target's metrics unrefreshed. Move target resolution inside the loop so the retry recomputes over the current target and its lineage.
The lineage materialization retry does not refresh its target after a concurrent merge, so it cannot recover from that supported topology change.

Review comment:

- [P2] Re-resolve the materialization target on retry — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/facts/derive.ts:232-234
  If the target merges into another issuer during materialization, `replace_financial_metrics_lineage` rejects the now-inactive target with `stale_computation`. Because `targetOf(issuer)` runs outside the retry loop, the retry still writes to the old target and necessarily fails again, leaving the new target's metrics unrefreshed. Move target resolution inside the loop so the retry recomputes over the current target and its lineage.

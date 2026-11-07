OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b088-e8bd-7102-930b-b7080c57f440
--------
user
commit 7535a0d
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 7535a0d; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 607ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-AKkDJjWP' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-em2VLqiX' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/9b-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-AiC06qd7' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-JUmDHCGZ' (errno=Operation not permitted)
7535a0d test(facts): plan-3 FactsDb contract cases on memory and pg (F3-4)
 src/lib/facts/db-contract.ts            | 300 +++++++++++++++++++++++++++++++-
 src/lib/facts/db.test.ts                |   6 +-
 src/lib/facts/facts.integration.test.ts |   2 +
 3 files changed, 306 insertions(+), 2 deletions(-)

exec
/bin/zsh -lc 'pwd; for d in . .. ../.. ../../.. ../../../..; do ls "$d"/AGENTS* "$d"/CLAUDE.md 2>/dev/null; done; git show 7535a0d --; cat package.json; ls -a | head -30' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
zsh:1: no matches found: ./AGENTS*
zsh:1: no matches found: ../AGENTS*
zsh:1: no matches found: ../../AGENTS*
../../../AGENTS.md
zsh:1: no matches found: ../../../../AGENTS*
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-uKPATvd1' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-cVZFy1o2' (errno=Operation not permitted)
commit 7535a0dabb05cf78d092204607e0f2e2020147e2
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 03:05:10 2026 -0800

    test(facts): plan-3 FactsDb contract cases on memory and pg (F3-4)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/facts/db-contract.ts b/src/lib/facts/db-contract.ts
index 891a541..74dc4ec 100644
--- a/src/lib/facts/db-contract.ts
+++ b/src/lib/facts/db-contract.ts
@@ -7,14 +7,20 @@
 import {randomUUID} from 'node:crypto';
 import {afterAll,beforeAll,describe,expect,it} from 'vitest';
 import type {TableClient} from '../db/table-client';
+import type {CyclePairId,ReconcileResultInput} from '../dq/reconcile/types';
 import {quarantine} from '../dq/quarantine';
 import {FactsDbError} from './types';
 import type {FactInsert,FactsDb,FilingInsert,Market,MetricRow} from './types';
 
 export interface ContractHarness{
  db:FactsDb;tables:TableClient;
- issuer():Promise<string>;batch():Promise<string>;
+ issuer():Promise<string>;
+ /** a RUNNING ingest batch of dataset facts.us (memory: a row in tables.ingest_batches) */
+ batch():Promise<string>;
+ /** a resolver id that research_audit_log accepts (pg: an auth.users row) */
+ user():Promise<string>;
  expireLease(issuer:string,market:Market):Promise<void>;
+ expireReconcileClaim(pair:string,cycleId:string,issuer:string,market:Market):Promise<void>;
  close?():Promise<void>;
 }
 export function filingInsert(issuer:string,o:Partial<FilingInsert>={}):FilingInsert{
@@ -352,5 +358,297 @@ export function factsDbContract(label:string,setup:()=>Promise<ContractHarness>)
    const got=await db.metricsOfIssuer(iss,'US','facts-derive/1.0');
    expect(got.length).toBe(1001);expect(got.at(-1)).toMatchObject({metric:'m1000',value:'1000'});
   },60000);
+
+  // ---- plan 3 (C4, spec §3.2): the same scenarios on memoryFactsDb and on the 20261107091000 functions
+  const newPair=()=>`test.${randomUUID().slice(0,8)}` as CyclePairId;   // one pair per test (a running cycle is unique per pair)
+  /** A running cycle whose members carry frozen expected natural keys (apply/complete check against them). */
+  const cycle=async(pair:CyclePairId,members:{issuer_id:string;keys:string[]}[])=>{
+   const cycle_id=`${pair}-${randomUUID().slice(0,8)}`;
+   await h.tables.insert('dq_reconcile_cycles',{pair,cycle_id,started_at:new Date().toISOString(),finished_at:null,members:members.map(m=>({issuer_id:m.issuer_id,market:'US',expected_keys:m.keys.map(naturalKey=>({naturalKey,locator:{}}))})),status:'running',
+    expected_total:members.reduce((n,m)=>n+m.keys.length,0),compared_passed:0,compared_failed:0,not_compared:0,exec_failed_members:0,detail:{}});
+   for(const m of members)await h.tables.insert('dq_reconcile_cursor',{pair,cycle_id,issuer_id:m.issuer_id,market:'US',expected:m.keys.length,state:'pending',claimed_by:null,claim_until:null,attempts:0,last_error:null,done_at:null,compared_passed:null,compared_failed:null,not_compared:null});
+   return cycle_id;
+  };
+  const closeCycle=(pair:CyclePairId,cycle_id:string)=>h.tables.update('dq_reconcile_cycles',{pair,cycle_id},{status:'complete',finished_at:new Date().toISOString()});
+  const res=(nk:string,o:Partial<ReconcileResultInput>={}):ReconcileResultInput=>({natural_key:nk,kind:'numeric',outcome:'compared',passed:false,left_value:'100',right_value:'99',abs_diff:'1',rel_diff:'0.01',tolerance:'0',
+   left_source:'companyfacts',right_source:'ixbrl',detail:{right:{locator:'ix#1'}},action:'record',inputs_hash:'h1',...o});
+  /** Another leased issuer with a published revenue row on 2024-02-01 for the published() key. */
+  const sibling=async(value:string,o:Partial<FactInsert>={})=>{
+   const {iss,b}=await ready();const run=await db.beginRun(iss,'US',b,1);
+   const f=filingInsert(iss);await db.stageFilings(run,[f]);const x=factInsert(iss,f,{value,...o});await db.stageFacts(run,[x]);await db.publishRun(run,[f.filing_id]);
+   return {iss,b,x:x.fact_id};
+  };
+
+  it('plan 3 topology: setMerge re-points referrers (A→B then B→C), lineageOf/targetOf follow, every affected scope bumps; setDissolved refuses referrers and non-active issuers',async()=>{
+   const a=await h.issuer(),b=await h.issuer(),c=await h.issuer(),by=await h.user();
+   expect(await db.setMerge(a,b,by)).toEqual({repointed:0});
+   expect(await db.lineageOf(b)).toEqual([b,a]);expect(await db.targetOf(a)).toBe(b);expect(await db.targetOf(b)).toBe(b);
+   const before=await db.stateRevs([a,b,c],'US');
+   expect(await db.setMerge(b,c,by)).toEqual({repointed:1});
+   expect(await db.lineageOf(c)).toEqual([c,...[a,b].sort()]);expect(await db.targetOf(a)).toBe(c);
+   expect((await db.stateRevs([a,b,c],'US')).map(r=>r.state_rev)).toEqual(before.map(r=>r.state_rev+1));
+   expect(await code(db.setMerge(b,c,by))).toBe('source_not_active:source_not_active');
+   expect(await code(db.setDissolved(c,by))).toBe('has_referrers:has_referrers');
+   const d=await h.issuer();await db.setDissolved(d,by);
+   expect(await code(db.setDissolved(d,by))).toBe('source_not_active:source_not_active');
+   expect((await code(db.setMerge(await h.issuer(),d,by))).startsWith('unknown:merge_target_not_active')).toBe(true);
+  });
+
+  it('plan 3 readFactsLineage: one member equals readFacts in every mode; two members move a cross-issuer same-day disagreement into conflicts (the earlier disclosure becomes current); equal values are no conflict',async()=>{
+   const {iss:t,r0,r}=await published();
+   for(const o of [{history:false},{history:true},{history:true,includeNonOk:true}]){
+    const one=await db.readFactsLineage([t],'US',{concepts:['revenue'],asOf:'2030-01-01',...o});
+    const legacy=await db.readFacts(t,'US',{concepts:['revenue'],asOf:'2030-01-01',...o});
+    expect(one).toEqual({stateRevs:[{issuer_id:t,state_rev:legacy.stateRev}],lineage:[t],rows:legacy.rows,conflicts:[],truncated:false});
+   }
+   const {iss:s,x}=await sibling('200');
+   const two=await db.readFactsLineage([t,s],'US',{concepts:['revenue'],asOf:'2030-01-01',history:true});
+   expect(two.conflicts).toEqual([{key:{concept:'revenue',period_start:'2023-10-01',period_end:'2023-12-31',consolidation:'consolidated',unit:'USD'},available_date:'2024-02-01',fact_ids:[r,x].sort()}]);
+   expect(two.rows.map(y=>[y.fact_id,y.disclosure_seq,y.is_current])).toEqual([[r0,1,true]]);
+   expect(two.lineage).toEqual([s,t].sort());expect(two.stateRevs.map(v=>v.issuer_id)).toEqual([s,t].sort());
+   const {iss:u,x:ux}=await sibling('100');
+   const same=await db.readFactsLineage([t,u],'US',{concepts:['revenue'],asOf:'2030-01-01',history:true});
+   expect(same.conflicts).toEqual([]);expect(same.rows.map(y=>y.fact_id)).toEqual([r0,r,ux]);expect(same.rows.at(-1)!.is_current).toBe(true);
+  });
+
+  it('plan 3 replaceMetricsLineage: the vector is checked against the current lineage and every rev; metricsOfIssuer returns it; the plan-2 wrapper fits a one-member lineage only',async()=>{
+   const {iss:t,r}=await published();const by=await h.user();const s=await h.issuer();
+   const row=(v:string):MetricRow=>({issuer_id:t,market:'US',metric:'gross_margin',period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:v,unit:'ratio',input_unit:'USD',basis:'us_standard',formula_version:'facts-derive/1.0',
+    inputs:[{fact_id:r,concept:'revenue',filing_id:'f',available_date:'2024-02-01'}],based_on_rev:0,based_on_lineage:[],as_of:'2024-03-01'});
+   const one=await db.stateRevs([t],'US');
+   expect(await db.replaceMetricsLineage(t,'US',one,[row('0.5')])).toBe(1);
+   expect((await db.metricsOfIssuer(t,'US','facts-derive/1.0')).map(m=>[m.based_on_rev,m.based_on_lineage])).toEqual([[1,[{issuer_id:t,state_rev:1}]]]);
+   await db.setMerge(s,t,by);
+   expect(await code(db.replaceMetricsLineage(t,'US',one,[row('0.6')]))).toBe('stale_computation:stale_computation');   // lineage grew
+   const lin=await db.stateRevs(await db.lineageOf(t),'US');
+   expect(await code(db.replaceMetricsLineage(t,'US',lin.map(x=>({...x,state_rev:x.state_rev+1})),[row('0.6')]))).toBe('stale_computation:stale_computation');
+   expect(await db.replaceMetricsLineage(t,'US',lin,[row('0.6')])).toBe(1);
+   expect((await db.metricsOfIssuer(t,'US','facts-derive/1.0'))[0]).toMatchObject({value:'0.6',based_on_rev:lin.find(x=>x.issuer_id===t)!.state_rev,based_on_lineage:lin});
+   expect(await code(db.replaceMetrics(t,'US',lin.find(x=>x.issuer_id===t)!.state_rev,[row('0.7')]))).toBe('stale_computation:stale_computation');
+   const lone=await h.issuer();
+   expect(await code(db.replaceMetricsLineage(lone,'CN',[{issuer_id:lone,state_rev:0}],[]))).toBe('scope_missing:scope_missing');
+  });
+
+  it('plan 3 filings: readFilingFacts (every generation and status + run status), findFilingBySourceRef, filingsForCalendar, setFilingAcceptance once',async()=>{
+   const {iss,b,f0,f,r}=await published();
+   const run2=await db.beginRun(iss,'US',b,2);const a2=factInsert(iss,f,{value:'101'});await db.stageFacts(run2,[a2]);await db.publishRun(run2,[f.filing_id]);
+   const run3=await db.beginRun(iss,'US',b,2);const st=factInsert(iss,f,{concept:'net_income',value:'5'});await db.stageFacts(run3,[st]);
+   expect((await db.readFilingFacts(f.filing_id,true)).map(x=>[x.fact_id,x.mapping_gen,x.status,x.run_status,x.value])).toEqual([[r,1,'ok','published','100'],[st.fact_id,2,'staged','staged','5'],[a2.fact_id,2,'ok','published','101']]);
+   expect((await db.readFilingFacts(f.filing_id,false)).map(x=>x.fact_id)).toEqual([r,a2.fact_id]);
+   expect(await db.findFilingBySourceRef('edgar',f.sourceRef)).toMatchObject({filing_id:f.filing_id,accepted_at:null,acceptance_source:null});
+   expect(await db.findFilingBySourceRef('tushare',f.sourceRef)).toBeNull();
+   expect((await db.filingsForCalendar(iss,'US',{fromPeriodEnd:'2023-12-31'})).map(g=>[g.filing_id,g.run_status])).toEqual([[f0.filing_id,'published'],[f.filing_id,'published']]);
+   expect(await db.filingsForCalendar(iss,'US',{fromPeriodEnd:'2024-01-01'})).toEqual([]);
+   expect(await db.setFilingAcceptance(f.filing_id,'2024-02-01T21:05:00.000Z','sec_submissions')).toBe(true);
+   expect(await db.setFilingAcceptance(f.filing_id,'2024-02-01T21:05:00.000Z','sec_submissions')).toBe(false);
+   expect(await code(db.setFilingAcceptance(f.filing_id,'2024-02-01T21:06:00.000Z','sec_submissions'))).toBe('acceptance_conflict:acceptance_conflict');
+   expect(await code(db.setFilingAcceptance(randomUUID(),'2024-02-01T21:05:00.000Z','sec_submissions'))).toBe('filing_not_found:filing_not_found');
+   expect(await db.findFilingBySourceRef('edgar',f.sourceRef)).toMatchObject({accepted_at:'2024-02-01T21:05:00.000Z',acceptance_source:'sec_submissions'});
+  });
+
+  it('plan 3 adoptCandidate: invalid_choice and stale_evaluation leave the item open; adoption writes an ok row from the camelCase candidate on the filing generation, resolves the item with the hook, bumps state_rev',async()=>{
+   const {iss,b,run,f}=await published();
+   const cand=(value:string)=>({concept:'revenue',sourceConcept:'us-gaap:Revenues',statement:'IS',periodStart:'2023-07-01',periodEnd:'2023-09-30',duration:'3M',value,unit:'USD',consolidation:'consolidated',filingRef:f.sourceRef,rawHash:`h-${value}`});
+   const item=await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${iss}:US:revenue:2023-07-01:2023-09-30:consolidated:USD:${f.sourceRef}:1`,reasonCode:'ambiguous_value',batchId:b,
+    payload:{key:{issuer_id:iss,market:'US',concept:'revenue',period_start:'2023-07-01',period_end:'2023-09-30',consolidation:'consolidated',unit:'USD'},candidates:[cand('110'),cand('111')],run_id:run}});
+   const by=await h.user();const ab=await h.batch();
+   expect(await code(db.adoptCandidate(item,2,ab,1,by))).toBe('invalid_choice:invalid_choice');
+   expect(await code(db.adoptCandidate(item,0,ab,0,by))).toBe('stale_evaluation:stale_evaluation');
+   const out=await db.adoptCandidate(item,1,ab,1,by);
+   expect(out).toMatchObject({issuerId:iss,market:'US'});
+   expect((await db.factsByIds([out.factId]))[0]).toMatchObject({value:'111',status:'ok',filing_id:f.filing_id,mapping_gen:1,mapping_version:'facts-map/1',available_date:'2024-02-01',source_concept:'us-gaap:Revenues',raw_hash:'h-111',run_id:out.runId});
+   expect((await current(iss)).stateRev).toBe(2);
+   const [it]=await h.tables.select('dq_quarantine',{id:item});
+   expect(it.status).toBe('resolved_accept');
+   expect(it.detail).toMatchObject({chosen_candidate_index:1,adopted_fact_id:out.factId,run_id:out.runId,issuer_id:iss,market:'US',hook:{stage:'materialize',state:'pending'}});
+   expect(await code(db.adoptCandidate(item,0,ab,2,by))).toBe('item_not_open:item_not_open');
+  });
+
+  it('plan 3 reconcile cursor + restore: claim / fence / apply (quarantine, reuse) / complete; a quarantined left gets latest_result; restoreReconciled needs the current passing hash',async()=>{
+   const {iss,r}=await published();const by=await h.user();const pair=newPair();
+   const c1=await cycle(pair,[{issuer_id:iss,keys:['k1','k2']}]);const w=await h.batch();
+   const fence=(await db.claimReconcileMember(pair,c1,iss,'US',w))!;
+   expect(fence).toEqual({pair,cycle_id:c1,issuer_id:iss,market:'US',batch_id:w,attempt:1});
+   expect(await db.claimReconcileMember(pair,c1,iss,'US',await h.batch())).toBeNull();
+   const q1=await db.applyReconcileResult(fence,res('k1',{action:'quarantine_left',left_fact_id:r}));
+   expect(q1).toMatchObject({reused:false,quarantined:1,materialize:{issuerId:iss,market:'US'}});
+   expect(await statusOf(r)).toBe('quarantined');
+   expect(await db.applyReconcileResult(fence,res('k1',{action:'quarantine_left',left_fact_id:r}))).toEqual({...q1,reused:true,quarantined:0,materialize:null});
+   expect(await code(db.completeReconcileMember(fence))).toBe('member_incomplete:member_incomplete');
+   await db.applyReconcileResult(fence,res('k2',{outcome:'right_missing',left_value:null,right_value:null,abs_diff:null,rel_diff:null}));
+   expect(await db.completeReconcileMember(fence)).toEqual({compared_passed:0,compared_failed:1,not_compared:1});
+   expect(await code(db.applyReconcileResult(fence,res('k3')))).toBe('fence_failed:fence_failed');
+   const [item]=await h.tables.select('dq_quarantine',{id:q1.itemId!});
+   expect(item).toMatchObject({status:'open',reason_code:'reconcile_mismatch',dataset:'facts.us',natural_key:`${pair}:k1:${r}`});
+   expect(item.detail).toMatchObject({pair,issuer_id:iss,market:'US',latest_result:{passed:false,inputs_hash:'h1'},hook:{stage:'materialize',state:'pending'}});
+   expect(await code(db.restoreReconciled(q1.itemId!,w,'h1',by))).toBe('not_passing:not_passing');
+   await closeCycle(pair,c1);
+   const c2=await cycle(pair,[{issuer_id:iss,keys:['k1']}]);
+   const f2=(await db.claimReconcileMember(pair,c2,iss,'US',w))!;
+   await db.applyReconcileResult(f2,res('k1',{left_fact_id:r,passed:true,right_value:'100',abs_diff:'0',rel_diff:'0',inputs_hash:'h2'}));
+   expect(((await h.tables.select('dq_quarantine',{id:q1.itemId!}))[0].detail as {latest_result:unknown}).latest_result).toMatchObject({passed:true,inputs_hash:'h2'});
+   expect(await code(db.restoreReconciled(q1.itemId!,w,'h1',by))).toBe('not_passing:not_passing');
+   expect(await db.restoreReconciled(q1.itemId!,w,'h2',by)).toEqual({promoted:1,skipped:[]});
+   expect(await statusOf(r)).toBe('ok');
+   await h.expireReconcileClaim(pair,c2,iss,'US');
+   expect(await code(db.completeReconcileMember(f2))).toBe('fence_failed:fence_failed');
+   const f3=(await db.claimReconcileMember(pair,c2,iss,'US',w))!;expect(f3.attempt).toBe(2);
+   await db.failReconcileMember(f3,'boom');
+   expect((await db.claimReconcileMember(pair,c2,iss,'US',w))!.attempt).toBe(3);
+  });
+
+  it('plan 3 openReconcileCycle (plan audit Q2): cycle + cursors in one call; only the listed pending entries are consumed; a running cycle is returned unchanged; unresolved pending is refused',async()=>{
+   const pair=newPair();const t1=await h.issuer(),t2=await h.issuer();const at=()=>new Date().toISOString();
+   const e1={issuer_id:t1,market:'US' as const,source:randomUUID()},e2={issuer_id:t2,market:'US' as const,source:randomUUID()};
+   await h.tables.insert('dq_reconcile_cycles',{pair,cycle_id:`${pair}-old`,started_at:at(),finished_at:at(),members:[],status:'complete',expected_total:0,compared_passed:0,compared_failed:0,not_compared:0,exec_failed_members:0,detail:{pending_members:[e1,e2]}});
+   const out=await db.openReconcileCycle({pair,cycleId:`${pair}-new`,startedAt:at(),members:[{issuer_id:t1,market:'US',expected_keys:[{naturalKey:'k',locator:{}}]}],pending:[e1]});
+   expect(out).toMatchObject({created:true,transferred:[e1],cycle:{cycle_id:`${pair}-new`,status:'running',expected_total:1,detail:{pending_merged_from:[`${pair}-old`],pending_transferred:[e1]}}});
+   expect((await h.tables.select('dq_reconcile_cursor',{pair,cycle_id:`${pair}-new`})).map(c=>[c.issuer_id,c.market,Number(c.expected),c.state])).toEqual([[t1,'US',1,'pending']]);
+   expect((await h.tables.select('dq_reconcile_cycles',{pair,cycle_id:`${pair}-old`}))[0].detail).toEqual({pending_members:[e2],pending_consumed_by:`${pair}-new`});
+   const again=await db.openReconcileCycle({pair,cycleId:`${pair}-other`,startedAt:at(),members:[{issuer_id:t2,market:'US',expected_keys:[]}],pending:[e2]});
+   expect(again).toMatchObject({created:false,transferred:[],cycle:{cycle_id:`${pair}-new`}});
+   expect(await code(db.openReconcileCycle({pair:newPair(),cycleId:'x',startedAt:at(),members:[],pending:[e1]}))).toMatch(/invalid_members/);
+  });
+
+  it('plan 3 resolveLineageConflict: after setMerge the disagreement is a conflict; keeping one row quarantines the others of the lineage and clears it',async()=>{
+   const {iss:t,r}=await published();const by=await h.user();
+   const {iss:s,b:bs,x}=await sibling('200');
+   await db.setMerge(s,t,by);
+   const lin=await db.lineageOf(t);
+   expect((await db.readFactsLineage(lin,'US',{concepts:['revenue'],asOf:'2030-01-01'})).conflicts.map(cf=>cf.fact_ids)).toEqual([[r,x].sort()]);
+   const item=await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${t}:revenue:2023-10-01:2023-12-31:consolidated:USD:2024-02-01`,reasonCode:'lineage_conflict',batchId:bs,payload:{fact_ids:[r,x],values:[]}});
+   const ab=await h.batch();
+   expect(await code(db.resolveLineageConflict(item,randomUUID(),ab,by))).toBe('invalid_choice:invalid_choice');
+   expect(await db.resolveLineageConflict(item,r,ab,by)).toEqual({quarantined:1});
+   expect(await statusOf(x)).toBe('quarantined');
+   const after=await db.readFactsLineage(lin,'US',{concepts:['revenue'],asOf:'2030-01-01'});
+   expect(after.conflicts).toEqual([]);expect(after.rows.map(y=>y.fact_id)).toEqual([r]);
+   expect(((await h.tables.select('dq_quarantine',{id:item}))[0].detail as Record<string,unknown>)).toMatchObject({chosen_fact_ids:[r],quarantined_fact_ids:[x],issuer_id:t,market:'US'});
+  });
+
+  // ---- plan 3, review round: landed behaviours pinned on both implementations
+  it('plan 3 adoptCandidate lineage checks: a different value on the same key and date in the lineage, or an open lineage_conflict / same_day_conflict item for it, is conflict_exists; an equal value adopts; a dissolved target is lineage_changed',async()=>{
+   const {iss:t,b,run,f}=await published();const by=await h.user();
+   const closed={status:'resolved_reject',resolved_by:by,resolved_at:new Date().toISOString()};
+   const cand=(value:string)=>({concept:'revenue',sourceConcept:'us-gaap:Revenues',statement:'IS',periodStart:'2023-07-01',periodEnd:'2023-09-30',duration:'3M',value,unit:'USD',consolidation:'consolidated',filingRef:f.sourceRef,rawHash:`h-${value}`});
+   const mk=(value:string)=>quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${t}:US:revenue:2023-07-01:2023-09-30:consolidated:USD:${f.sourceRef}:1`,reasonCode:'ambiguous_value',batchId:b,
+    payload:{key:{issuer_id:t,market:'US',concept:'revenue',period_start:'2023-07-01',period_end:'2023-09-30',consolidation:'consolidated',unit:'USD'},candidates:[cand(value)],run_id:run}});
+   // a sibling in the lineage with an ok row on the same key and the filing's available_date, value 200
+   const s=await sibling('200',{period_start:'2023-07-01',period_end:'2023-09-30'});await db.setMerge(s.iss,t,by);
+   const rev=async()=>(await db.stateRevs([t],'US'))[0].state_rev;
+   const ab=await h.batch();
+   const i1=await mk('110');
+   expect(await code(db.adoptCandidate(i1,0,ab,await rev(),by))).toBe('conflict_exists:conflict_exists');
+   expect((await h.tables.select('dq_quarantine',{id:i1}))[0].status).toBe('open');
+   expect(await statusOf(s.x)).toBe('ok');
+   // an open lineage_conflict item for the key and date blocks even an equal value
+   const lc=await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${t}:revenue:2023-07-01:2023-09-30:consolidated:USD:2024-02-01`,reasonCode:'lineage_conflict',batchId:b,payload:{fact_ids:[],values:[]}});
+   await h.tables.update('dq_quarantine',{id:i1},closed);   // same natural key: the open item would be reused
+   const i2=await mk('200');
+   expect(await code(db.adoptCandidate(i2,0,ab,await rev(),by))).toBe('conflict_exists:conflict_exists');
+   await h.tables.update('dq_quarantine',{id:lc},closed);
+   // equal value, no open item: adopted
+   const out=await db.adoptCandidate(i2,0,ab,await rev(),by);
+   expect((await db.factsByIds([out.factId]))[0]).toMatchObject({value:'200',status:'ok'});
+   // target dissolved: the lineage no longer has an active target
+   const {iss:d,b:bd,run:rd,f:fd}=await published();await db.setDissolved(d,by);
+   const cd={concept:'revenue',sourceConcept:'us-gaap:Revenues',statement:'IS',periodStart:'2023-07-01',periodEnd:'2023-09-30',duration:'3M',value:'5',unit:'USD',consolidation:'consolidated',filingRef:fd.sourceRef,rawHash:'h-5'};
+   const i3=await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${d}:US:revenue:2023-07-01:2023-09-30:consolidated:USD:${fd.sourceRef}:1`,reasonCode:'ambiguous_value',batchId:bd,payload:{key:{issuer_id:d},candidates:[cd],run_id:rd}});
+   expect(await code(db.adoptCandidate(i3,0,ab,(await db.stateRevs([d],'US'))[0].state_rev,by))).toBe('lineage_changed:lineage_changed');
+  });
+
+  it('plan 3 resolveLineageConflict: target_not_active, unresolved (the kept row is not a current ok row; nothing written), invalid_choice for a malformed key, batch_mismatch, item_not_open on a second call',async()=>{
+   const by=await h.user();const ab=await h.batch();
+   // unresolved: the kept fact belongs to a superseded generation, so no visible ok row is left after the others are quarantined
+   const {iss:t,b,r,f}=await published();
+   const run2=await db.beginRun(t,'US',b,2);const a2=factInsert(t,f,{concept:'net_income',value:'5'});await db.stageFacts(run2,[a2]);await db.publishRun(run2,[f.filing_id]);
+   const s=await sibling('200');await db.setMerge(s.iss,t,by);
+   const nk=`${t}:revenue:2023-10-01:2023-12-31:consolidated:USD:2024-02-01`;
+   const item=await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:nk,reasonCode:'lineage_conflict',batchId:b,payload:{fact_ids:[r,s.x],values:[]}});
+   expect(await code(db.resolveLineageConflict(item,r,ab,by))).toBe('unresolved:unresolved');
+   expect(await statusOf(s.x)).toBe('ok');expect((await h.tables.select('dq_quarantine',{id:item}))[0].status).toBe('open');   // the quarantine of the others was rolled back
+   expect(await code(db.resolveLineageConflict(item,s.x,await h.batch().then(async x=>{await h.tables.update('ingest_batches',{batch_id:x},{status:'success',finished_at:new Date(Date.now()+60000).toISOString()});return x;}),by))).toBe('batch_mismatch:batch_mismatch');
+   // malformed natural key
+   const bad=await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${t}:revenue:2023-10-01`,reasonCode:'lineage_conflict',batchId:b,payload:{fact_ids:[r,s.x],values:[]}});
+   expect(await code(db.resolveLineageConflict(bad,r,ab,by))).toBe('invalid_choice:invalid_choice');
+   // keeping the live row works once; the item is then closed
+   expect(await db.resolveLineageConflict(item,s.x,ab,by)).toEqual({quarantined:0});   // r is a superseded-generation row: nothing visible left to quarantine
+   expect(await code(db.resolveLineageConflict(item,s.x,ab,by))).toBe('item_not_open:item_not_open');
+   // a dissolved target
+   const {iss:d,b:bd,r:rd}=await published();await db.setDissolved(d,by);
+   const di=await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${d}:revenue:2023-10-01:2023-12-31:consolidated:USD:2024-02-01`,reasonCode:'lineage_conflict',batchId:bd,payload:{fact_ids:[rd],values:[]}});
+   expect(await code(db.resolveLineageConflict(di,rd,ab,by))).toBe('target_not_active:target_not_active');
+  });
+
+  it('plan 3 generic resolver: reconcile_mismatch and lineage_conflict items are use_dedicated_resolver and stay open',async()=>{
+   const {iss,b,r}=await published();
+   for(const reason of ['reconcile_mismatch','lineage_conflict']){
+    const id=await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${iss}:${reason}:${randomUUID()}`,reasonCode:reason,batchId:b,payload:{key:{},fact_ids:[r],values:[]}});
+    expect(await code(db.resolveFactsQuarantine(id,[r],randomUUID()))).toBe('use_dedicated_resolver:use_dedicated_resolver');
+    expect((await h.tables.select('dq_quarantine',{id}))[0].status).toBe('open');
+   }
+  });
+
+  it('plan 3 applyReconcileResult checks: a key outside the frozen set, a pass without a comparison, text values on a non-numeric kind, a missing left fact id and a foreign left fact are invalid_result and write nothing; complete needs exact frozen-key coverage',async()=>{
+   const {iss,r}=await published();const other=await published();const pair=newPair();
+   const c1=await cycle(pair,[{issuer_id:iss,keys:['k1','k2']}]);const w=await h.batch();
+   const fence=(await db.claimReconcileMember(pair,c1,iss,'US',w))!;
+   const bad=[res('zz'),res('k1',{outcome:'right_missing',passed:true}),res('k1',{kind:'text',left_value:'a'}),res('k1',{action:'quarantine_left'}),res('k1',{left_fact_id:other.r})];
+   for(const x of bad)expect(await code(db.applyReconcileResult(fence,x))).toBe('invalid_result:invalid_result');
+   expect(await h.tables.select('dq_reconciliations',{pair,cycle_id:c1})).toEqual([]);
+   expect(await statusOf(r)).toBe('ok');
+   await db.applyReconcileResult(fence,res('k1',{kind:'text',left_value:null,right_value:null,abs_diff:null,rel_diff:null,outcome:'unsupported'}));
+   expect(await code(db.completeReconcileMember(fence))).toBe('member_incomplete:member_incomplete');   // k2 has no accepted result
+   await db.applyReconcileResult(fence,res('k2',{outcome:'left_missing',left_value:null,right_value:null,abs_diff:null,rel_diff:null}));
+   expect(await db.completeReconcileMember(fence)).toEqual({compared_passed:0,compared_failed:0,not_compared:2});
+  });
+
+  it('plan 3 applyReconcileResult on a left row already quarantined for another reason: a failing compare opens the reconcile_mismatch item without a hook and without changing visibility; a second cycle reuses the item',async()=>{
+   const {iss,b}=await ready();const run=await db.beginRun(iss,'US',b,1);const f=filingInsert(iss);await db.stageFilings(run,[f]);
+   const ok=factInsert(iss,f),qd=factInsert(iss,f,{concept:'total_assets',statement:'BS',period_start:null,duration:'INSTANT'});
+   await db.stageFacts(run,[ok,qd]);
+   const gen=await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${iss}:US:BS:${randomUUID()}`,reasonCode:'identity_bs',batchId:b,payload:{key:{},fact_ids:[qd.fact_id],run_id:run}});
+   await db.quarantineFacts(run,[qd.fact_id],gen);await db.publishRun(run,[f.filing_id]);
+   const rev0=(await db.stateRevs([iss],'US'))[0].state_rev;
+   const pair=newPair();const w=await h.batch();
+   const c1=await cycle(pair,[{issuer_id:iss,keys:['k1']}]);const f1=(await db.claimReconcileMember(pair,c1,iss,'US',w))!;
+   const o1=await db.applyReconcileResult(f1,res('k1',{action:'quarantine_left',left_fact_id:qd.fact_id}));
+   expect(o1).toMatchObject({reused:false,quarantined:0,materialize:null});expect(o1.itemId).not.toBeNull();
+   expect((await db.stateRevs([iss],'US'))[0].state_rev).toBe(rev0);
+   const [it]=await h.tables.select('dq_quarantine',{id:o1.itemId!});
+   expect(it).toMatchObject({status:'open',reason_code:'reconcile_mismatch',natural_key:`${pair}:k1:${qd.fact_id}`});
+   expect((it.detail as Record<string,unknown>).hook).toBeUndefined();
+   await db.completeReconcileMember(f1);await closeCycle(pair,c1);
+   const c2=await cycle(pair,[{issuer_id:iss,keys:['k1']}]);const f2=(await db.claimReconcileMember(pair,c2,iss,'US',w))!;
+   const o2=await db.applyReconcileResult(f2,res('k1',{action:'quarantine_left',left_fact_id:qd.fact_id,inputs_hash:'h9'}));
+   expect(o2.itemId).toBe(o1.itemId);expect(o2.quarantined).toBe(0);
+   expect(((await h.tables.select('dq_quarantine',{id:o1.itemId!}))[0].detail as {latest_result:{inputs_hash:string}}).latest_result.inputs_hash).toBe('h9');
+  });
+
+  it('plan 3 openReconcileCycle pending transfer: entries from several finished cycles move once, an unlisted entry stays, duplicate keys / non-uuid ids / pending outside the members are invalid_members and write nothing',async()=>{
+   const pair=newPair();const t1=await h.issuer(),t2=await h.issuer(),t3=await h.issuer();const at=()=>new Date().toISOString();
+   const mk=(i:string,source=randomUUID())=>({issuer_id:i,market:'US' as const,source});
+   const e1=mk(t1),e1b=mk(t1),e2=mk(t2),e3=mk(t3);
+   const old=(id:string,pend:object[])=>h.tables.insert('dq_reconcile_cycles',{pair,cycle_id:`${pair}-${id}`,started_at:at(),finished_at:at(),members:[],status:'complete',expected_total:0,compared_passed:0,compared_failed:0,not_compared:0,exec_failed_members:0,detail:{pending_members:pend}});
+   await old('a',[e1,e2]);await old('b',[e1b,e3]);
+   const m=(i:string,keys:string[])=>({issuer_id:i,market:'US' as const,expected_keys:keys.map(naturalKey=>({naturalKey,locator:{}}))});
+   // refused: duplicate natural key across members, non-uuid id, pending entry whose member is absent
+   for(const input of [
+    {members:[m(t1,['k']),m(t2,['k'])],pending:[e1]},
+    {members:[{...m(t1,['k']),issuer_id:'not-a-uuid'}],pending:[]},
+    {members:[m(t1,['k'])],pending:[e2]}]){
+    expect(await code(db.openReconcileCycle({pair,cycleId:`${pair}-bad`,startedAt:at(),...input}))).toMatch(/^invalid_members/);
+   }
+   expect(await h.tables.select('dq_reconcile_cycles',{pair,cycle_id:`${pair}-bad`})).toEqual([]);
+   expect((await h.tables.select('dq_reconcile_cycles',{pair,cycle_id:`${pair}-a`}))[0].detail).toEqual({pending_members:[e1,e2]});
+   // accepted: e1 (cycle a), e1b and e3 (cycle b); e2 is not listed and stays
+   const out=await db.openReconcileCycle({pair,cycleId:`${pair}-new`,startedAt:at(),members:[m(t1,['x1']),m(t3,['x2'])],pending:[e1,e1b,e3]});
+   expect(out.created).toBe(true);expect(out.transferred).toHaveLength(3);
+   expect(out.cycle).toMatchObject({expected_total:2,detail:{pending_merged_from:[`${pair}-a`,`${pair}-b`]}});
+   expect((await h.tables.select('dq_reconcile_cycles',{pair,cycle_id:`${pair}-a`}))[0].detail).toEqual({pending_members:[e2],pending_consumed_by:`${pair}-new`});
+   expect((await h.tables.select('dq_reconcile_cycles',{pair,cycle_id:`${pair}-b`}))[0].detail).toEqual({pending_members:[],pending_consumed_by:`${pair}-new`});
+   expect((await h.tables.select('dq_reconcile_cursor',{pair,cycle_id:`${pair}-new`})).map(c=>c.issuer_id).sort()).toEqual([t1,t3].sort());
+  });
+
  });
 }
diff --git a/src/lib/facts/db.test.ts b/src/lib/facts/db.test.ts
index ff15f43..3009ceb 100644
--- a/src/lib/facts/db.test.ts
+++ b/src/lib/facts/db.test.ts
@@ -12,7 +12,11 @@ import {memoryFactsDb,numericEquals} from './memory-facts-db';
 
 factsDbContract('memoryFactsDb contract',async()=>{
  const db=memoryFactsDb();
- return {db,tables:db.tables,issuer:async()=>randomUUID(),batch:async()=>randomUUID(),expireLease:async(i,m)=>db.expireLease(i,m)};
+ return {db,tables:db.tables,issuer:async()=>randomUUID(),
+  batch:async()=>{const id=randomUUID();await db.tables.insert('ingest_batches',{batch_id:id,producer:'facts-sync',dataset:'facts.us',status:'running'});return id;},
+  user:async()=>randomUUID(),
+  expireLease:async(i,m)=>db.expireLease(i,m),
+  expireReconcileClaim:async(pair,cycleId,issuer,market)=>{await db.tables.update('dq_reconcile_cursor',{pair,cycle_id:cycleId,issuer_id:issuer,market},{claim_until:'1970-01-01T00:00:00.000Z'});}};
 });
 
 describe('memoryFactsDb specifics',()=>{
diff --git a/src/lib/facts/facts.integration.test.ts b/src/lib/facts/facts.integration.test.ts
index 9f78c0d..2197262 100644
--- a/src/lib/facts/facts.integration.test.ts
+++ b/src/lib/facts/facts.integration.test.ts
@@ -517,6 +517,8 @@ async function pgHarness():Promise<PgHarness>{
   issuer:async()=>{const id=randomUUID();await pool.query(`insert into public.issuers(issuer_id,canonical_name_en) values($1,'ZZ Facts Contract')`,[id]);return id;},
   batch:async()=>{const id=randomUUID();await pool.query(`insert into public.ingest_batches(batch_id,producer,dataset) values($1,'facts-sync','facts.us')`,[id]);return id;},
   expireLease:async(issuer,market)=>{await pool.query(`update public.fact_sync_scope set lease_until=now()-interval '1 second' where issuer_id=$1 and market=$2`,[issuer,market]);},
+  user:async()=>{const id=randomUUID();await pool.query(`insert into auth.users(id,email) values($1,$2)`,[id,`${id}@contract.test`]);return id;},
+  expireReconcileClaim:async(pair,cycleId,issuer,market)=>{await pool.query(`update public.dq_reconcile_cursor set claim_until=clock_timestamp()-interval '1 second' where pair=$1 and cycle_id=$2 and issuer_id=$3 and market=$4`,[pair,cycleId,issuer,market]);},
   close:async()=>{await pool.end();},
  };
 }
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

exec
/bin/zsh -lc "cat ../../../AGENTS.md; find src -name AGENTS.md -o -name AGENTS.override.md; sed -n '1,105p' src/lib/facts/db-contract.ts; sed -n '1,80p' src/lib/facts/facts.integration.test.ts; sed -n '470,530p' src/lib/facts/facts.integration.test.ts; rg -n 'readFactsLineage|fact_id.*sort|available_date.*localeCompare' src/lib/facts/memory-facts-db.ts" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>// src/lib/facts/db-contract.ts
// Shared FactsDb contract (spec §4.5–§4.8, §5.3, §5.4): the same scenarios run against
// memoryFactsDb (db.test.ts) and pgFactsDb (facts.integration.test.ts), so the in-memory rules the
// unit tests rely on are exactly the SQL functions' rules. Not a test file: it registers
// describe/it only when called. dq_quarantine items are created with plan-1 quarantine() on the
// harness TableClient, the way sync.ts will.
import {randomUUID} from 'node:crypto';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import type {TableClient} from '../db/table-client';
import type {CyclePairId,ReconcileResultInput} from '../dq/reconcile/types';
import {quarantine} from '../dq/quarantine';
import {FactsDbError} from './types';
import type {FactInsert,FactsDb,FilingInsert,Market,MetricRow} from './types';

export interface ContractHarness{
 db:FactsDb;tables:TableClient;
 issuer():Promise<string>;
 /** a RUNNING ingest batch of dataset facts.us (memory: a row in tables.ingest_batches) */
 batch():Promise<string>;
 /** a resolver id that research_audit_log accepts (pg: an auth.users row) */
 user():Promise<string>;
 expireLease(issuer:string,market:Market):Promise<void>;
 expireReconcileClaim(pair:string,cycleId:string,issuer:string,market:Market):Promise<void>;
 close?():Promise<void>;
}
export function filingInsert(issuer:string,o:Partial<FilingInsert>={}):FilingInsert{
 return {filing_id:randomUUID(),issuer_id:issuer,sourceRef:randomUUID(),market:'US',source:'edgar',origin:'sec',formType:'10-K',fiscalYear:2023,fiscalPeriod:'FY',periodEnd:'2023-12-31',availableDate:'2024-02-01',url:null,...o};
}
export function factInsert(issuer:string,filing:FilingInsert,o:Partial<FactInsert>={}):FactInsert{
 return {fact_id:randomUUID(),issuer_id:issuer,market:'US',filing_id:filing.filing_id,concept:'revenue',source_concept:'Revenues',statement:'IS',period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:'100',unit:'USD',consolidation:'consolidated',available_date:filing.availableDate,mapping_gen:1,mapping_version:'facts-map/1',raw_hash:'h',...o};
}
/** 'code:message' of a FactsDbError rejection, 'resolved' when it did not reject. */
const code=(p:Promise<unknown>)=>p.then(()=>'resolved',e=>e instanceof FactsDbError?`${e.code}:${e.message}`:`not_facts_db_error:${String(e)}`);

export function factsDbContract(label:string,setup:()=>Promise<ContractHarness>):void{
 describe(label,()=>{
  let h:ContractHarness;let db:FactsDb;
  beforeAll(async()=>{h=await setup();db=h.db;},60000);
  afterAll(async()=>{await h?.close?.();},30000);
  const ready=async()=>{
   const iss=await h.issuer();const b=await h.batch();
   expect(await db.reconcileScope('US',[{issuer_id:iss,reasons:['test'],priority:10,fetch_key:'0000000001'}])).toBe(1);
   expect(await db.claimLease(iss,'US',b,600)).toBe(true);
   return {iss,b};
  };
  const conflict=(iss:string,b:string,run:string,ids:string[],date='2024-02-01')=>quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${iss}:US:revenue:2023-10-01:2023-12-31:consolidated:USD:${date}`,reasonCode:'same_day_conflict',batchId:b,
   payload:{key:{issuer_id:iss,market:'US',concept:'revenue',period_start:'2023-10-01',period_end:'2023-12-31',consolidation:'consolidated',unit:'USD',available_date:date},fact_ids:ids,values:[],run_id:run}});
  const item=async(id:string)=>{const [r]=await h.tables.select('dq_quarantine',{id});return {status:r.status,fact_ids:(r.payload as {fact_ids:string[]}).fact_ids,chosen:(r.detail as {chosen_fact_ids?:string[]}).chosen_fact_ids??null};};
  const statusOf=async(id:string)=>(await db.factsByIds([id]))[0]?.status??null;
  const current=(iss:string,concepts=['revenue'],history=true)=>db.readFacts(iss,'US',{concepts,asOf:'2030-01-01',history});
  /** A published run: f0 (2024-01-01) carries r0 = 90, f (2024-02-01) carries r = 100, same key. state_rev 1. */
  const published=async()=>{
   const {iss,b}=await ready();const run=await db.beginRun(iss,'US',b,1);
   const f0=filingInsert(iss,{availableDate:'2024-01-01'});const f=filingInsert(iss);
   const m=await db.stageFilings(run,[f0,f]);
   expect(m.get(f0.sourceRef)).toBe(f0.filing_id);expect(m.get(f.sourceRef)).toBe(f.filing_id);expect(m.size).toBe(2);
   const r0=factInsert(iss,f0,{value:'90'});const r=factInsert(iss,f);
   expect(await db.stageFacts(run,[r0,r])).toBe(2);
   expect(await db.publishRun(run,[f0.filing_id,f.filing_id])).toBe(2);
   return {iss,b,run,f0,f,r0:r0.fact_id,r:r.fact_id};
  };

  it('lease: exclusive, renewable by the holder, lost after expiry; release needs the holder and sets the schedule',async()=>{
   const {iss,b}=await ready();const b2=await h.batch();
   expect(await db.claimLease(randomUUID(),'US',b,600)).toBe(false);          // no scope row
   expect(await db.claimLease(iss,'US',b2,600)).toBe(false);
   expect(await db.claimLease(iss,'US',b,600)).toBe(true);                     // renew
   await h.expireLease(iss,'US');
   expect(await db.claimLease(iss,'US',b2,600)).toBe(true);
   expect(await code(db.beginRun(iss,'US',b,1))).toBe('lease_lost:lease_lost');
   expect(await code(db.releaseLease(iss,'US',b,'failed','2030-01-01T00:00:00.000Z'))).toBe('lease_lost:lease_lost');
   await db.releaseLease(iss,'US',b2,'success','2030-01-01T00:00:00.000Z');
   const due=(at:string)=>db.scopeDue('US',at,1000).then(rows=>rows.find(x=>x.issuer_id===iss));
   expect(await due('2029-12-31T23:59:59.000Z')).toBeUndefined();
   expect(await due('2030-01-01T00:00:00.000Z')).toMatchObject({issuer_id:iss,market:'US',lease_until:null,lease_batch_id:null,last_status:'success',last_batch_id:b2,state_rev:0,priority:10});
   expect(await db.claimLease(iss,'US',b,600)).toBe(true);                     // released → claimable again
  });

  it('runs: begin abandons staged runs and prunes empty gen-0 filings; stage dedupes; abandon refuses published runs; closed runs refuse writes',async()=>{
   const {iss,b,run,f0,f,r0,r}=await published();
   const run2=await db.beginRun(iss,'US',b,1);
   const f2=filingInsert(iss);const m=await db.stageFilings(run2,[f,f2]);
   expect(m.get(f.sourceRef)).toBe(f.filing_id);expect(m.get(f2.sourceRef)).toBe(f2.filing_id);
   expect(await db.stageFacts(run2,[factInsert(iss,f)])).toBe(0);              // same candidate key → not written
   const x=factInsert(iss,f2,{value:'7'});expect(await db.stageFacts(run2,[x])).toBe(1);
   expect(await statusOf(x.fact_id)).toBe('staged');
   expect((await current(iss)).rows.map(y=>y.fact_id)).toEqual([r0,r]);
   const run3=await db.beginRun(iss,'US',b,1);                                  // abandons run2
   expect(await statusOf(x.fact_id)).toBeNull();
   expect((await db.filingsOfIssuer(iss,'US',{})).map(g=>g.filing_id).sort()).toEqual([f0.filing_id,f.filing_id].sort());
   expect(await code(db.abandonRun(run))).toBe('run_published:run_published');
   await db.abandonRun(run3);await db.abandonRun(run3);
   expect(await code(db.stageFacts(run3,[]))).toBe('run_abandoned:run_abandoned');
   expect(await code(db.stageFacts(run,[]))).toBe('run_published:run_published');
   expect(await code(db.publishRun(randomUUID(),[]))).toBe('unknown:run_not_found');
   expect((await db.readFacts(iss,'US',{concepts:['revenue'],asOf:'2024-01-15'})).rows.map(y=>[y.fact_id,y.disclosure_seq,y.is_current])).toEqual([[r0,1,true]]);
   expect((await current(iss)).rows.map(y=>[y.fact_id,y.disclosure_seq,y.is_current,y.is_revision])).toEqual([[r0,1,false,false],[r,2,true,true]]);
   expect((await current(iss,['revenue'],false)).rows.map(y=>y.fact_id)).toEqual([r]);
   expect((await current(iss)).stateRev).toBe(1);
  });

  it('generations: publish activates manifest filings, refuses a regression, keeps old-generation rows as evidence',async()=>{
   const {iss,b,f,r0,r}=await published();
   const run2=await db.beginRun(iss,'US',b,2);const a2=factInsert(iss,f,{value:'101'});
   expect(await db.stageFacts(run2,[a2])).toBe(1);expect(await db.publishRun(run2,[f.filing_id])).toBe(1);
// src/lib/facts/facts.integration.test.ts
// F2-0 (spec §4, §5.4, §11.2): the financial_facts migration on real PostgreSQL — five tables, the
// disclosure-raw bucket, constraints, both triggers, every SQL function (lease, run lifecycle,
// publish with conflict disposition and mapping_gen activation, resolve/promote, metrics,
// read_facts envelope, scope reconcile), real role privileges, and (Task 3) the pgFactsDb contract.
// Rows are never cleaned up: filings and published facts are append-only by design and test:db
// creates a fresh database for every run; every test uses its own issuer.
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import type {PoolClient} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {pgTableClient} from '../db/pg-table-client';
import {quarantine} from '../dq/quarantine';
import {factInsert,factsDbContract,filingInsert} from './db-contract';
import type {ContractHarness} from './db-contract';
import {pgFactsDb} from './pg-facts-db';

const enabled=!!process.env.S4_TEST_STATE;
const MIGRATION='supabase/migrations/20261106090000_financial_facts.sql';
// Plan 3 (20261107091000) redefines fact_promote_rows, filings_limited_update, read_facts and
// replace_financial_metrics: replaying the plan-2 file alone would expose the plan-2 versions to
// suites running in parallel, so both files replay in one transaction.
const EXTENSIONS='supabase/migrations/20261107091000_facts_extensions.sql';
const TABLES=['fact_sync_runs','filings','financial_facts','financial_metrics','fact_sync_scope'];

// Same replay policy as dq-foundation.integration.test.ts (not exported there): one transaction,
// short lock_timeout, retry on lock timeout (55P03) and deadlock (40P01).
const RETRYABLE=new Set(['55P03','40P01']);
async function replayMigration(pool:Pool,sql:string,attempts=10):Promise<void>{
 for(let attempt=1;;attempt++){
  const c=await pool.connect();
  try{
   await c.query(`begin; set local lock_timeout='3s'; set local deadlock_timeout='50ms'; select pg_advisory_xact_lock(hashtext('test:migration-replay'));\n${sql}\n;commit;`);
   return;
  }catch(e){
   await c.query('rollback').catch(()=>{});
   const code=(e as {code?:string}).code;
   if(attempt>=attempts||!code||!RETRYABLE.has(code))throw e;
   await new Promise(r=>setTimeout(r,250*attempt+Math.floor(Math.random()*250)));   // jittered backoff: other suites hold locks on the shared DB
  }finally{c.release();}
 }
}

/** Runs body inside one transaction on its own connection (pid known); rolls back only if still open, and discards the connection if even that fails. */
interface Tx{c:PoolClient;pid:number;commit():Promise<void>}
async function inTx(pool:Pool,body:(tx:Tx)=>Promise<void>):Promise<void>{
 const c=await pool.connect();let open=false;let broken:Error|undefined;
 try{
  await c.query('begin');open=true;
  const pid=Number((await c.query('select pg_backend_pid() p')).rows[0].p);
  await body({c,pid,commit:async()=>{await c.query('commit');open=false;}});
 }finally{
  if(open)await c.query('rollback').catch(e=>{broken=e as Error;});
  c.release(broken);
 }
}
/** Deterministic "is blocked": polls (20 ms, <= 3 s) until some backend waits on `pid`, then asserts p is still pending. */
async function stillBlockedBehind(pool:Pool,pid:number,p:Promise<unknown>):Promise<void>{
 let settled=false;p.then(()=>{settled=true;},()=>{settled=true;});
 for(const deadline=Date.now()+3000;;){
  const n=Number((await pool.query(`select count(*)::int n from pg_stat_activity where $1 = any(pg_blocking_pids(pid))`,[pid])).rows[0].n);
  if(n>=1)break;
  if(settled||Date.now()>deadline)throw new Error(`no backend blocked behind pid ${pid} (settled=${settled})`);
  await new Promise(r=>setTimeout(r,20));
 }
 expect(settled).toBe(false);
}

type PgErr={message:string;code?:string};
/** Resolves with the rejection (message + SQLSTATE) so tests can assert both. */
const fails=(p:Promise<unknown>)=>p.then(()=>{throw new Error('expected rejection');},e=>e as PgErr);
type FactSpec={filing_id:string;fact_id?:string;concept?:string;period_start?:string|null;period_end?:string;duration?:string;value?:string;unit?:string;available_date?:string};
type Envelope={state_rev:number;rows:Record<string,unknown>[];truncated:boolean;row_count:number};

describe.skipIf(!enabled)('F2-0 financial facts migration on real PostgreSQL',()=>{
 let admin:Pool;
 const q=async(text:string,values:unknown[]=[])=>(await admin.query(text,values)).rows as Record<string,any>[];
 const one=async(text:string,values:unknown[]=[])=>(await q(text,values))[0]?.v;
 const issuer=async()=>{const id=randomUUID();await q(`insert into public.issuers(issuer_id,canonical_name_en) values($1,'ZZ Facts Test')`,[id]);return id;};
  const iss=await issuer();
  const call=(p:number,snap:string|null)=>one(`select public.reconcile_fact_sync_scope('US',$1::jsonb,$2::timestamptz) v`,[JSON.stringify([{issuer_id:iss,reasons:['r'],priority:p,fetch_key:'0000000004'}]),snap]);
  expect(await call(10,null)).toBe(1);
  const snap=(await q(`select now()::text t`))[0].t as string;   // run A reads its sources here
  await q(`select pg_sleep(0.05)`);
  expect(await call(10,null)).toBe(0);                          // run B confirms the row unchanged (not counted)
  expect(await call(0,snap)).toBe(0);                           // A's stale retirement is refused
  expect((await q(`select priority from public.fact_sync_scope where issuer_id=$1`,[iss]))[0].priority).toBe(10);
 });

 it('roles: no role writes the fact tables directly; service_role updates link columns only; anon and authenticated cannot call write functions',async()=>{
  const {iss,f,r,r0}=await published();
  const c=await admin.connect();
  try{
   await c.query('set role service_role');
   await expect(c.query(`insert into public.financial_facts(fact_id,issuer_id,market,filing_id,run_id,concept,source_concept,statement,period_start,period_end,duration,value,unit,available_date,mapping_gen,mapping_version,raw_hash) select gen_random_uuid(),issuer_id,market,filing_id,run_id,'x',source_concept,statement,period_start,period_end,duration,value,unit,available_date,mapping_gen,mapping_version,raw_hash from public.financial_facts where fact_id=$1`,[r])).rejects.toThrow(/permission denied/);
   await expect(c.query(`update public.financial_facts set status='quarantined' where fact_id=$1`,[r])).rejects.toThrow(/permission denied/);
   await expect(c.query(`delete from public.financial_facts where fact_id=$1`,[r])).rejects.toThrow(/permission denied/);
   await expect(c.query(`update public.filings set mapping_gen=9 where filing_id=$1`,[f])).rejects.toThrow(/permission denied/);
   await expect(c.query(`update public.filings set url='x' where filing_id=$1`,[f])).rejects.toThrow(/permission denied/);
   await expect(c.query(`insert into public.fact_sync_scope(issuer_id,market,fetch_key) values($1,'CN','x')`,[iss])).rejects.toThrow(/permission denied/);
   await expect(c.query(`update public.fact_sync_scope set state_rev=99 where issuer_id=$1`,[iss])).rejects.toThrow(/permission denied/);
   await expect(c.query(`delete from public.financial_metrics where issuer_id=$1`,[iss])).rejects.toThrow(/permission denied/);
   expect((await c.query(`update public.filings set document_ref='doc',document_url='https://example.test/doc',link_attempts=1 where filing_id=$1`,[f])).rowCount).toBe(1);
   expect((await c.query(`select count(*)::int n from public.fact_sync_runs where issuer_id=$1`,[iss])).rows[0].n).toBe(1);
   expect((await read(iss,{concepts:['revenue'],nonOk:true},c)).rows).toHaveLength(2);
   for(const role of ['anon','authenticated']){
    await c.query('reset role');await c.query(`set role ${role}`);
    await expect(c.query(`select * from public.fact_sync_runs`)).rejects.toThrow(/permission denied/);
    await expect(c.query(`select public.begin_sync_run($1,'US',$2,1)`,[iss,randomUUID()])).rejects.toThrow(/permission denied/);
    await expect(c.query(`select public.resolve_facts_quarantine($1,'{}'::uuid[],$1)`,[randomUUID()])).rejects.toThrow(/permission denied/);
    await expect(c.query(`select public.replace_financial_metrics($1,'US',1,'[]'::jsonb)`,[iss])).rejects.toThrow(/permission denied/);
    await expect(c.query(`update public.filings set document_ref='x' where filing_id=$1`,[f])).rejects.toThrow(/permission denied/);
    expect(Number((await c.query(`select public.fact_state_rev($1,'US') v`,[iss])).rows[0].v)).toBe(1);
    expect((await read(iss,{concepts:['revenue']},c)).rows.map(x=>x.fact_id)).toEqual([r0,r]);
    expect((await c.query(`select document_ref from public.filings where filing_id=$1`,[f])).rows[0].document_ref).toBe('doc');
   }
  }finally{await c.query('reset role').catch(()=>{});c.release();}
 });
});

interface PgHarness extends ContractHarness{pool:Pool;close():Promise<void>}
async function pgHarness():Promise<PgHarness>{
 const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
 const pool=new Pool({connectionString:state.adminUrl,statement_timeout:4000});   // a regression that blocks fails cleanly instead of hanging afterAll
 return {
  pool,db:pgFactsDb(pool),tables:pgTableClient(pool),
  issuer:async()=>{const id=randomUUID();await pool.query(`insert into public.issuers(issuer_id,canonical_name_en) values($1,'ZZ Facts Contract')`,[id]);return id;},
  batch:async()=>{const id=randomUUID();await pool.query(`insert into public.ingest_batches(batch_id,producer,dataset) values($1,'facts-sync','facts.us')`,[id]);return id;},
  expireLease:async(issuer,market)=>{await pool.query(`update public.fact_sync_scope set lease_until=now()-interval '1 second' where issuer_id=$1 and market=$2`,[issuer,market]);},
  user:async()=>{const id=randomUUID();await pool.query(`insert into auth.users(id,email) values($1,$2)`,[id,`${id}@contract.test`]);return id;},
  expireReconcileClaim:async(pair,cycleId,issuer,market)=>{await pool.query(`update public.dq_reconcile_cursor set claim_until=clock_timestamp()-interval '1 second' where pair=$1 and cycle_id=$2 and issuer_id=$3 and market=$4`,[pair,cycleId,issuer,market]);},
  close:async()=>{await pool.end();},
 };
}

describe.skipIf(!enabled)('pgFactsDb on real PostgreSQL',()=>{
 // The same scenarios memoryFactsDb passes in db.test.ts, now against the SQL functions.
 factsDbContract('pgFactsDb contract',pgHarness);

 describe('concurrency',()=>{
52:const ASYNC_METHODS=['claimLease','beginRun','stageFilings','stageFacts','quarantineFacts','publishRun','abandonRun','releaseLease','resolveFactsQuarantine','replaceMetrics','readFacts','factsByIds','openConflicts','filingsOfIssuer','updateFilingLink','reconcileScope','scopeDue','scopeRows','scopeAll','metricsOfIssuer','targetOf','lineageOf','stateRevs','readFactsLineage','readFilingFacts','replaceMetricsLineage','findFilingBySourceRef','filingsForCalendar','setFilingAcceptance','adoptCandidate','restoreReconciled','resolveLineageConflict','claimReconcileMember','applyReconcileResult','completeReconcileMember','failReconcileMember','openReconcileCycle','setMerge','setDissolved'] as const satisfies readonly (keyof FactsDb)[];
224:    conflicts.push({key:{concept:f0.concept,period_start:f0.period_start,period_end:f0.period_end,consolidation:f0.consolidation,unit:f0.unit},available_date:f0.available_date,fact_ids:g.map(f=>f.fact_id).sort(cmp)});
443:  async readFactsLineage(issuers,market,o){return readLineage(issuers,market,o);},
551:    detail:{...detailOf(it),chosen_fact_ids:[keep],quarantined_fact_ids:others.map(f=>f.fact_id).sort(cmp),issuer_id:t,market,batch_id:batchId,hook:{stage:'materialize',state:'pending',at:t0}}});
600:    const hits=(await items({status:'open',reason_code:'reconcile_mismatch'})).filter(i=>detailOf(i).pair===fence.pair&&idsOf(i).includes(f.fact_id)).sort((a,b)=>cmp(String(a.id),String(b.id)));
703:  stateRevs:arr(0),readFactsLineage:arr(0),scopeRows:arr(1),

exec
/bin/zsh -lc "sed -n '185,245p' src/lib/facts/memory-facts-db.ts; rg -n 'filingsForCalendar|readFilingFacts|sortRows|sort\\(' src/lib/facts/memory-facts-db.ts | head -25; cat vitest.config.*; node_modules/.bin/vitest run src/lib/facts/db.test.ts --no-cache" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 489ms:
 // (lineage: payload members and the rows it quarantined), and no reconcile_mismatch referencing it
 // unless that one is resolved_accept with latest_result.passed = true.
 const promote=async(issuer:string,market:Market,ids:string[])=>{
  const all=await items({});
  const open=all.filter(i=>i.status==='open');
  const resolvedConflicts=all.filter(i=>i.reason_code==='same_day_conflict'&&i.status!=='open');
  const lineageVerdicts=all.filter(i=>i.reason_code==='lineage_conflict'&&i.status!=='open');
  const mismatches=all.filter(i=>i.reason_code==='reconcile_mismatch');
  const passing=(i:Row)=>i.status==='resolved_accept'&&(detailOf(i).latest_result as {passed?:unknown}|undefined)?.passed===true;
  let n=0;
  for(const id of new Set(ids)){
   const f=facts.get(id);
   if(!f||f.issuer_id!==issuer||f.market!==market||f.status!=='quarantined')continue;
   if(runs.get(f.run_id)?.status!=='published')continue;
   if(!visible(f))continue;
   if(open.some(i=>idsOf(i).includes(id)))continue;
   if(open.some(i=>i.reason_code==='same_day_conflict'&&disputes(i,f)))continue;
   if(resolvedConflicts.some(i=>idsOf(i).includes(id)&&!chosenOf(i).includes(id)))continue;
   if(lineageVerdicts.some(i=>(idsOf(i).includes(id)||listOf(detailOf(i).quarantined_fact_ids).includes(id))&&!chosenOf(i).includes(id)))continue;
   if(mismatches.some(i=>idsOf(i).includes(id)&&!passing(i)))continue;
   f.status='ok';n++;
  }
  return n;
 };
 // read_facts_lineage: the read_facts rules over a member set; with more than one member, ok rows of
 // one (K, available_date) from different issuers with different values leave the sequences and go to conflicts.
 const readLineage=(members:string[],market:Market,o:ReadFactsOptions):ReadFactsLineageResult=>{
  const set=[...new Set(members.map(m=>m.toLowerCase()))].sort(cmp);const inSet=new Set(set);
  const stateRevs:LineageRev[]=set.map(i=>({issuer_id:i,state_rev:scopeOf(i,market)?.state_rev??0}));
  const base=[...facts.values()].filter(f=>inSet.has(f.issuer_id)&&f.market===market&&o.concepts.includes(f.concept)&&f.available_date<=o.asOf
   &&(o.from===undefined||f.period_end>=o.from)&&(o.to===undefined||f.period_end<=o.to)&&(f.status==='ok'||o.includeNonOk===true)&&visible(f));
  const conflicts:LineageConflict[]=[];const excluded=new Set<string>();
  if(set.length>1){
   const byDay=new Map<string,FactRow[]>();
   for(const f of base)if(f.status==='ok'){const k=`${keyOf(f)}|${f.available_date}`;const g=byDay.get(k);if(g)g.push(f);else byDay.set(k,[f]);}
   for(const g of byDay.values()){
    if(new Set(g.map(f=>f.issuer_id)).size<2||g.every(f=>numericEquals(f.value,g[0].value)))continue;
    for(const f of g)excluded.add(f.fact_id);
    const f0=g[0];
    conflicts.push({key:{concept:f0.concept,period_start:f0.period_start,period_end:f0.period_end,consolidation:f0.consolidation,unit:f0.unit},available_date:f0.available_date,fact_ids:g.map(f=>f.fact_id).sort(cmp)});
   }
   const s=(v:string|null|undefined)=>v??'';
   conflicts.sort((a,b)=>cmp(a.available_date,b.available_date)||cmp(s(a.key.concept),s(b.key.concept))||cmp(s(a.key.period_end),s(b.key.period_end))||cmp(s(a.key.period_start),s(b.key.period_start))||cmp(s(a.key.consolidation),s(b.key.consolidation))||cmp(s(a.key.unit),s(b.key.unit)));
  }
  const eligible=base.filter(f=>!excluded.has(f.fact_id));
  const groups=new Map<string,FactRow[]>();
  for(const f of eligible)if(f.status==='ok'){const k=keyOf(f);if(!groups.has(k))groups.set(k,[]);groups.get(k)!.push(f);}
  const out:FactRow[]=[];
  for(const g of groups.values()){g.sort(byDisclosure);g.forEach((f,i)=>out.push({...clone(f),disclosure_seq:i+1,is_current:i===g.length-1,is_revision:i>0&&!numericEquals(f.value,g[i-1].value)}));}
  for(const f of eligible)if(f.status!=='ok')out.push({...clone(f),disclosure_seq:undefined,is_current:false,is_revision:false});
  const heads=new Map<string,FactRow>();for(const f of out)if(!heads.has(keyOf(f)))heads.set(keyOf(f),f);
  const rank=new Map([...heads.entries()].sort((a,b)=>keyOrder(a[1],b[1])).map(([k],i)=>[k,i+1] as const));
  const picked=out.filter(f=>(o.history===true||f.is_current===true)&&(o.limit===undefined||rank.get(keyOf(f))!<=o.limit));
  picked.sort((a,b)=>rank.get(keyOf(a))!-rank.get(keyOf(b))!||byDisclosure(a,b));
  if(picked.length>READ_FACTS_CAP)return {stateRevs,lineage:set,rows:[],conflicts,truncated:true};
  return {stateRevs,lineage:set,rows:picked,conflicts,truncated:false};
 };
 // replace_financial_metrics_lineage: member set = current lineage, every rev equal, else stale_computation.
 const replaceLineage=(issuer0:string,market:Market,basedOn:LineageRev[],input:MetricRow[])=>{
  const issuer=issuer0.toLowerCase();   // SQL compares uuids, not text
  const norm=lineageRevsFrom(basedOn.map(x=>({...x,issuer_id:String(x.issuer_id).toLowerCase()})));
52:const ASYNC_METHODS=['claimLease','beginRun','stageFilings','stageFacts','quarantineFacts','publishRun','abandonRun','releaseLease','resolveFactsQuarantine','replaceMetrics','readFacts','factsByIds','openConflicts','filingsOfIssuer','updateFilingLink','reconcileScope','scopeDue','scopeRows','scopeAll','metricsOfIssuer','targetOf','lineageOf','stateRevs','readFactsLineage','readFilingFacts','replaceMetricsLineage','findFilingBySourceRef','filingsForCalendar','setFilingAcceptance','adoptCandidate','restoreReconciled','resolveLineageConflict','claimReconcileMember','applyReconcileResult','completeReconcileMember','failReconcileMember','openReconcileCycle','setMerge','setDissolved'] as const satisfies readonly (keyof FactsDb)[];
109: const referrers=(id:string)=>[...topo.entries()].filter(([,t])=>t.merged_into===id).map(([k])=>k).sort(cmp);
175:   .sort((a,b)=>Number(b.status==='running')-Number(a.status==='running')||cmp(String(b.started_at),String(a.started_at)));
212:  const set=[...new Set(members.map(m=>m.toLowerCase()))].sort(cmp);const inSet=new Set(set);
224:    conflicts.push({key:{concept:f0.concept,period_start:f0.period_start,period_end:f0.period_end,consolidation:f0.consolidation,unit:f0.unit},available_date:f0.available_date,fact_ids:g.map(f=>f.fact_id).sort(cmp)});
227:   conflicts.sort((a,b)=>cmp(a.available_date,b.available_date)||cmp(s(a.key.concept),s(b.key.concept))||cmp(s(a.key.period_end),s(b.key.period_end))||cmp(s(a.key.period_start),s(b.key.period_start))||cmp(s(a.key.consolidation),s(b.key.consolidation))||cmp(s(a.key.unit),s(b.key.unit)));
233:  for(const g of groups.values()){g.sort(byDisclosure);g.forEach((f,i)=>out.push({...clone(f),disclosure_seq:i+1,is_current:i===g.length-1,is_revision:i>0&&!numericEquals(f.value,g[i-1].value)}));}
236:  const rank=new Map([...heads.entries()].sort((a,b)=>keyOrder(a[1],b[1])).map(([k],i)=>[k,i+1] as const));
238:  picked.sort((a,b)=>rank.get(keyOf(a))!-rank.get(keyOf(b))!||byDisclosure(a,b));
249:  if([...lineageMembers(issuer)].sort(cmp).join(',')!==norm.map(x=>x.issuer_id).join(','))throw new FactsDbError('stale_computation');
391:  async factsByIds(ids){return [...new Set(ids)].sort().map(id=>facts.get(id)).filter((f):f is FactRow=>!!f).map(f=>clone(f));},   // deduped, ordered by fact_id
395:   rows.sort((a,b)=>cmp(String(a.created_at),String(b.created_at))||cmp(String(a.id),String(b.id)));
400:   rows.sort((a,b)=>cmp(b.available_date,a.available_date)||cmp(a.filing_id,b.filing_id));
424:   rows.sort((a,b)=>cmp(a.next_due_at,b.next_due_at)||(b.priority-a.priority)||cmp(a.issuer_id,b.issuer_id));
429:   return clone([...scope.values()].filter(s=>s.market===market&&want.has(s.issuer_id)).sort((a,b)=>cmp(a.issuer_id,b.issuer_id)));
432:   return clone([...scope.values()].filter(s=>s.market===market).sort((a,b)=>cmp(a.issuer_id,b.issuer_id)));
436:   rows.sort((a,b)=>cmp(a.metric,b.metric)||cmp(a.period_end,b.period_end)||cmp(a.period_start,b.period_start)||cmp(a.input_unit,b.input_unit)||cmp(a.basis,b.basis));
442:  async stateRevs(issuers,market){return [...new Set(issuers.map(i=>i.toLowerCase()))].sort(cmp).map(i=>({issuer_id:i,state_rev:scopeOf(i,market)?.state_rev??0}));},
444:  async readFilingFacts(filingId,includeNonOk){
446:   rows.sort((a,b)=>(a.mapping_gen-b.mapping_gen)||cmp(a.concept,b.concept)||cmp(a.period_end,b.period_end)||cmp(a.period_start??'',b.period_start??'')||cmp(a.unit,b.unit)||cmp(a.created_at,b.created_at)||cmp(a.fact_id,b.fact_id));
451:  async filingsForCalendar(issuer,market,o){
453:   rows.sort((a,b)=>cmp(a.period_end!,b.period_end!)||cmp(a.available_date,b.available_date)||cmp(a.filing_id,b.filing_id));
515:   const first=ids.map(id=>facts.get(id)).filter((f):f is FactRow=>!!f).sort((a,b)=>cmp(a.fact_id,b.fact_id))[0];
524:   const skipped=[...ids].sort(cmp).flatMap(id=>{const f=facts.get(id);if(!f)return [{fact_id:id,reason:'missing'}];if(!before.has(id))return [{fact_id:id,reason:'not_quarantined'}];return f.status==='ok'?[]:[{fact_id:id,reason:'ineligible'}];});
551:    detail:{...detailOf(it),chosen_fact_ids:[keep],quarantined_fact_ids:others.map(f=>f.fact_id).sort(cmp),issuer_id:t,market,batch_id:batchId,hook:{stage:'materialize',state:'pending',at:t0}}});
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v4.1.11 /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61

 ❯ src/lib/facts/db.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/lib/facts/db.test.ts [ src/lib/facts/db.test.ts ]
Error: EPERM: operation not permitted, mkdir '/var/folders/97/wmwg4qzx02j74c3n73nh438w0000gn/T/LITOrvP-0Gy-utW3kau5y/ssr'
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  no tests
   Start at  03:05:47
   Duration  319ms (transform 0ms, setup 0ms, import 0ms, tests 0ms, environment 0ms)


exec
/bin/zsh -lc "rg -n 'byDisclosure|created_at:|now=' src/lib/facts/memory-facts-db.ts; sed -n '650,695p' src/lib/facts/memory-facts-db.ts; rg -n 'pending_merged_from|order by.*started_at|setMerge|set_merge' supabase/migrations/20261107091000_facts_extensions.sql; nl -ba src/lib/facts/db-contract.ts | sed -n '398,412p'; rg -n 'create.*dq_reconcile|pair.*check' supabase/migrations/*reconcile* supabase/migrations/*facts* " in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 0ms:
75: const now=()=>fixedNow??new Date().toISOString();
233:  for(const g of groups.values()){g.sort(byDisclosure);g.forEach((f,i)=>out.push({...clone(f),disclosure_seq:i+1,is_current:i===g.length-1,is_revision:i>0&&!numericEquals(f.value,g[i-1].value)}));}
238:  picked.sort((a,b)=>rank.get(keyOf(a))!-rank.get(keyOf(b))!||byDisclosure(a,b));
257: const byDisclosure=(a:FactRow,b:FactRow)=>cmp(a.available_date,b.available_date)||cmp(a.created_at,b.created_at)||cmp(a.fact_id,b.fact_id);
294:    pending.push({filing_id:row.filing_id,issuer_id:r.issuer_id,market:r.market,source:row.source,origin:row.origin,form_type:row.formType,fiscal_year:row.fiscalYear,fiscal_period:row.fiscalPeriod,period_end:row.periodEnd,available_date:row.availableDate,source_ref:row.sourceRef,url:row.url,document_ref:null,document_url:null,link_attempts:0,mapping_gen:0,run_id:run,created_at:now(),accepted_at:null,acceptance_source:null});
314:    fresh.push({fact_id:row.fact_id,issuer_id:r.issuer_id,market:r.market,filing_id:row.filing_id,run_id:run,concept:row.concept,source_concept:row.source_concept,statement:row.statement,period_start:row.period_start,period_end:row.period_end,duration:row.duration,value:row.value,value_text:row.value,unit:row.unit,consolidation:row.consolidation,available_date:row.available_date,mapping_gen:r.mapping_gen,mapping_version:row.mapping_version,status:'staged',raw_hash:row.raw_hash,created_at:at});
501:    value:c.value,value_text:c.value,unit:c.unit,consolidation:c.consolidation,available_date:g.available_date,mapping_gen:gen,mapping_version:[...versions][0],status:'ok',raw_hash:c.rawHash,created_at:stamp()});
596:      batch_id:fence.batch_id,status:'open',resolved_by:null,resolved_at:null,created_at:t0});
612:      batch_id:fence.batch_id,status:'open',resolved_by:null,resolved_at:null,created_at:t0});
617:    cycle_id:fence.cycle_id,issuer_id:fence.issuer_id,market:fence.market,attempt:Number(c.attempts),created_at:t0});
    ||i.pending.some(p=>!memberKeys.has(mk({issuer_id:String(p.issuer_id).toLowerCase(),market:p.market}))))throw new FactsDbError('invalid_members');
   const row={pair:i.pair,cycle_id:i.cycleId,started_at:i.startedAt,finished_at:null,members,status:'running',
    expected_total:members.reduce((n,m)=>n+m.expected_keys.length,0),compared_passed:0,compared_failed:0,not_compared:0,exec_failed_members:0,detail:{}};
   await tables.insert('dq_reconcile_cycles',row);
   for(const m of members)await tables.insert('dq_reconcile_cursor',{pair:i.pair,cycle_id:i.cycleId,issuer_id:m.issuer_id,market:m.market,expected:m.expected_keys.length,state:'pending',claimed_by:null,claim_until:null,attempts:0,last_error:null,done_at:null,compared_passed:null,compared_failed:null,not_compared:null});
   const listed=new Set(i.pending.map(pendingKey));
   const from:string[]=[];const moved:PendingMember[]=[];
   for(const c of [...cycles].sort((a,b)=>cmp(String(a.cycle_id),String(b.cycle_id)))){
    const d=detailOf(c);if(!Array.isArray(d.pending_members))continue;
    const list=d.pending_members as PendingMember[];
    const take=list.filter(p=>listed.has(pendingKey(p)));if(take.length===0)continue;
    await tables.update('dq_reconcile_cycles',{pair:i.pair,cycle_id:String(c.cycle_id)},{detail:{...d,pending_members:list.filter(p=>!listed.has(pendingKey(p))),pending_consumed_by:i.cycleId}});
    from.push(String(c.cycle_id));moved.push(...take);
   }
   const detail={pending_merged_from:from,pending_transferred:moved};
   await tables.update('dq_reconcile_cycles',{pair:i.pair,cycle_id:i.cycleId},{detail});
   return {created:true,cycle:{...row,detail},transferred:moved};
  },
  async setMerge(source,target,resolvedBy){
   if(!source||!target||source===target)throw unknown('invalid_merge');
   if(!resolvedBy)throw unknown('invalid_resolver');
   if(topoOf(source).status!=='active')throw new FactsDbError('source_not_active');
   if(topoOf(target).status!=='active')throw unknown('merge_target_not_active');
   const set=[...new Set([source,target,...referrers(source),...referrers(target)])];
   for(const i of set)for(const m of MARKETS)ensureScope(i,m);
   const refs=referrers(source);
   for(const r of refs)topo.set(r,{...topoOf(r),merged_into:target});
   topo.set(source,{status:'merged',merged_into:target});
   for(const i of set)for(const m of MARKETS)bump(i,m);
   await registerPending(target,source);
   return {repointed:refs.length};
  },
  async setDissolved(issuer,resolvedBy){
   if(!resolvedBy)throw unknown('invalid_resolver');
   if(referrers(issuer).length>0)throw new FactsDbError('has_referrers');
   if(topoOf(issuer).status!=='active')throw new FactsDbError('source_not_active');
   for(const m of MARKETS)ensureScope(issuer,m);
   topo.set(issuer,{status:'dissolved',merged_into:null});
   for(const m of MARKETS)bump(issuer,m);
  },
 };
 // Every FactsDb method (reads included) runs through one promise chain per instance, so no operation
 // observes or interleaves with another's partial writes across awaits (SQL: one transaction each).
 let chain:Promise<unknown>=Promise.resolve();
 const serialize=<A extends unknown[],T>(fn:(...a:A)=>Promise<T>)=>(...a:A):Promise<T>=>{const next=chain.then(()=>fn(...a));chain=next.catch(()=>undefined);return next;};
 const db={...raw} as MemoryFactsDb;
15:--  6. set_merge / set_dissolved: the only topology writers. They switch the transaction-local
20:-- Lock order everywhere: the pair's cycle advisory lock first (set_merge, open_reconcile_cycle: any
280:-- ---------------------------------------------------------------- 6. topology writers (spec §3.1 guard, §3.2 set_merge / set_dissolved, R3, T12)
295:-- Body of set_merge (runs with entities.allow_topology_write on). Affected set = {source, target}
309:create or replace function public.fact_set_merge_body(p_source uuid, p_target uuid, p_resolved_by uuid)
346:    and c.cycle_id = (select y.cycle_id from public.dq_reconcile_cycles y where y.pair = 'facts.lineage_same_day' order by (y.status = 'running') desc, y.started_at desc limit 1);
351:revoke execute on function public.fact_set_merge_body(uuid, uuid, uuid) from public, anon, authenticated, service_role;
353:create or replace function public.set_merge(p_source uuid, p_target uuid, p_resolved_by uuid)
359:    v_out := public.fact_set_merge_body(p_source, p_target, p_resolved_by);
367:revoke execute on function public.set_merge(uuid, uuid, uuid) from public, anon, authenticated;
368:grant execute on function public.set_merge(uuid, uuid, uuid) to service_role;
371:-- them with set_merge first); active → dissolved (row_count = 1, else source_not_active); the
376:-- lock, it must take it first, as set_merge does.
1028:-- set_merge takes right before it registers a pending member (section 8a) — in one transaction:
1035:--  snapshot stays and joins the next cycle); the new row's detail records pending_merged_from /
1038:--  inserts (KEY SHARE on issuers via the FK), then cycle rows; set_merge takes the same advisory lock
1099:  set detail = jsonb_build_object('pending_merged_from', to_jsonb(v_from), 'pending_transferred', v_moved)
   398	   const {iss:t,r0,r}=await published();
   399	   for(const o of [{history:false},{history:true},{history:true,includeNonOk:true}]){
   400	    const one=await db.readFactsLineage([t],'US',{concepts:['revenue'],asOf:'2030-01-01',...o});
   401	    const legacy=await db.readFacts(t,'US',{concepts:['revenue'],asOf:'2030-01-01',...o});
   402	    expect(one).toEqual({stateRevs:[{issuer_id:t,state_rev:legacy.stateRev}],lineage:[t],rows:legacy.rows,conflicts:[],truncated:false});
   403	   }
   404	   const {iss:s,x}=await sibling('200');
   405	   const two=await db.readFactsLineage([t,s],'US',{concepts:['revenue'],asOf:'2030-01-01',history:true});
   406	   expect(two.conflicts).toEqual([{key:{concept:'revenue',period_start:'2023-10-01',period_end:'2023-12-31',consolidation:'consolidated',unit:'USD'},available_date:'2024-02-01',fact_ids:[r,x].sort()}]);
   407	   expect(two.rows.map(y=>[y.fact_id,y.disclosure_seq,y.is_current])).toEqual([[r0,1,true]]);
   408	   expect(two.lineage).toEqual([s,t].sort());expect(two.stateRevs.map(v=>v.issuer_id)).toEqual([s,t].sort());
   409	   const {iss:u,x:ux}=await sibling('100');
   410	   const same=await db.readFactsLineage([t,u],'US',{concepts:['revenue'],asOf:'2030-01-01',history:true});
   411	   expect(same.conflicts).toEqual([]);expect(same.rows.map(y=>y.fact_id)).toEqual([r0,r,ux]);expect(same.rows.at(-1)!.is_current).toBe(true);
   412	  });
zsh:1: no matches found: supabase/migrations/*reconcile*

codex
No actionable defects were identified in the added contract tests or harness changes. Test execution was blocked by the read-only sandbox, so runtime verification remains incomplete.
No actionable defects were identified in the added contract tests or harness changes. Test execution was blocked by the read-only sandbox, so runtime verification remains incomplete.

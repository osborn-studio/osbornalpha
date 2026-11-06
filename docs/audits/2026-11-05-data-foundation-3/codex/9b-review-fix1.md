OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b08b-a7eb-7392-aa26-939f985ad0d0
--------
user
commit a56c7bf
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline a56c7bf; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 665ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-xyFz70nl' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-VT4NMCRO' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/9b-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/9b-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/9b-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-H2inEPAK' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-mR7iwILv' (errno=Operation not permitted)
a56c7bf test(facts): strengthen includeNonOk, non-target stale rev and adopt conflict contract cases (9b Codex)
 src/lib/facts/db-contract.ts | 60 ++++++++++++++++++++++++++++++++++++++++++++
 1 file changed, 60 insertions(+)

exec
/bin/zsh -lc 'pwd; for p in . .. ../.. ../../.. ../../../..; do ls -a "$p" | grep -E '"'AGENTS|CLAUDE'; done; git show a56c7bf --; cat src/lib/facts/db-contract.ts" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
AGENTS.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-enTbQkv0' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-xfyoEOiD' (errno=Operation not permitted)
commit a56c7bfdba639be1ac1d7dd5f641efacbf2697c7
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 03:08:11 2026 -0800

    test(facts): strengthen includeNonOk, non-target stale rev and adopt conflict contract cases (9b Codex)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/facts/db-contract.ts b/src/lib/facts/db-contract.ts
index 74dc4ec..360afc5 100644
--- a/src/lib/facts/db-contract.ts
+++ b/src/lib/facts/db-contract.ts
@@ -650,5 +650,65 @@ export function factsDbContract(label:string,setup:()=>Promise<ContractHarness>)
    expect((await h.tables.select('dq_reconcile_cursor',{pair,cycle_id:`${pair}-new`})).map(c=>c.issuer_id).sort()).toEqual([t1,t3].sort());
   });
 
+
+  // ---- plan 3, Codex round: strengthened cases (hard-coded expectations, no readFacts oracle)
+  it('plan 3 readFactsLineage includeNonOk: quarantined rows appear only with includeNonOk AND history, never as current, without sequence; staged rows never appear',async()=>{
+   const {iss:t,b,r0,r}=await published();
+   const run=await db.beginRun(t,'US',b,1);const fq=filingInsert(t,{availableDate:'2024-03-01'});await db.stageFilings(run,[fq]);
+   const q=factInsert(t,fq,{value:'300'});await db.stageFacts(run,[q]);
+   const item=await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${t}:US:IS:${randomUUID()}`,reasonCode:'identity_gp',batchId:b,payload:{key:{},fact_ids:[q.fact_id],run_id:run}});
+   expect(await db.quarantineFacts(run,[q.fact_id],item)).toBe(1);expect(await db.publishRun(run,[fq.filing_id])).toBe(0);   // the only fact is quarantined
+   const run2=await db.beginRun(t,'US',b,1);const fs=filingInsert(t,{availableDate:'2024-04-01'});await db.stageFilings(run2,[fs]);
+   const st=factInsert(t,fs,{value:'400'});await db.stageFacts(run2,[st]);   // left staged
+   const rd=async(o:{history:boolean;includeNonOk:boolean})=>(await db.readFactsLineage([t],'US',{concepts:['revenue'],asOf:'2030-01-01',...o})).rows.map(y=>[y.fact_id,y.disclosure_seq??null,y.is_current,y.is_revision]);
+   expect(await rd({history:false,includeNonOk:false})).toEqual([[r,2,true,true]]);
+   expect(await rd({history:false,includeNonOk:true})).toEqual([[r,2,true,true]]);
+   expect(await rd({history:true,includeNonOk:false})).toEqual([[r0,1,false,false],[r,2,true,true]]);
+   expect(await rd({history:true,includeNonOk:true})).toEqual([[r0,1,false,false],[r,2,true,true],[q.fact_id,null,false,false]]);
+   expect((await db.readFactsLineage([t],'US',{concepts:['revenue'],asOf:'2030-01-01',history:true,includeNonOk:true})).rows.map(y=>y.status)).toEqual(['ok','ok','quarantined']);
+  });
+
+  it('plan 3 replaceMetricsLineage: a stale revision of ONLY the non-target member is stale_computation and the stored metrics stay',async()=>{
+   const {iss:t,r}=await published();const by=await h.user();const s=await h.issuer();await db.setMerge(s,t,by);
+   const row=(v:string):MetricRow=>({issuer_id:t,market:'US',metric:'gross_margin',period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:v,unit:'ratio',input_unit:'USD',basis:'us_standard',formula_version:'facts-derive/1.0',
+    inputs:[{fact_id:r,concept:'revenue',filing_id:'f',available_date:'2024-02-01'}],based_on_rev:0,based_on_lineage:[],as_of:'2024-03-01'});
+   const lin=await db.stateRevs(await db.lineageOf(t),'US');
+   expect(await db.replaceMetricsLineage(t,'US',lin,[row('0.5')])).toBe(1);
+   const before=await db.metricsOfIssuer(t,'US','facts-derive/1.0');
+   const skew=lin.map(x=>x.issuer_id===t?x:{...x,state_rev:x.state_rev+1});
+   expect(skew.find(x=>x.issuer_id===t)).toEqual(lin.find(x=>x.issuer_id===t));
+   expect(await code(db.replaceMetricsLineage(t,'US',skew,[row('0.9')]))).toBe('stale_computation:stale_computation');
+   expect(await db.metricsOfIssuer(t,'US','facts-derive/1.0')).toEqual(before);
+  });
+
+  /** An ambiguous_value item for a 2023-07-01..09-30 revenue candidate on the published filing, plus the pieces to dispute its key. */
+  const adoptSetup=async()=>{
+   const {iss:t,b,run,f}=await published();const by=await h.user();const ab=await h.batch();
+   const cand={concept:'revenue',sourceConcept:'us-gaap:Revenues',statement:'IS',periodStart:'2023-07-01',periodEnd:'2023-09-30',duration:'3M',value:'110',unit:'USD',consolidation:'consolidated',filingRef:f.sourceRef,rawHash:'h-110'};
+   const item=await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${t}:US:revenue:2023-07-01:2023-09-30:consolidated:USD:${f.sourceRef}:1`,reasonCode:'ambiguous_value',batchId:b,
+    payload:{key:{issuer_id:t,market:'US',concept:'revenue',period_start:'2023-07-01',period_end:'2023-09-30',consolidation:'consolidated',unit:'USD'},candidates:[cand],run_id:run}});
+   const rev=(await db.stateRevs([t],'US'))[0].state_rev;
+   const expectRefused=async()=>{
+    expect(await code(db.adoptCandidate(item,0,ab,rev,by))).toBe('conflict_exists:conflict_exists');
+    expect((await h.tables.select('dq_quarantine',{id:item}))[0].status).toBe('open');
+    expect((await db.stateRevs([t],'US'))[0].state_rev).toBe(rev);
+    expect((await db.readFactsLineage([t],'US',{concepts:['revenue'],asOf:'2030-01-01',history:true,includeNonOk:true,from:'2023-09-30',to:'2023-09-30'})).rows).toEqual([]);   // no fact inserted
+   };
+   return {t,b,expectRefused};
+  };
+
+  it('plan 3 adoptCandidate: an open same_day_conflict for the key and date refuses adoption although no ok competitor remains',async()=>{
+   const {t,b,expectRefused}=await adoptSetup();
+   await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${t}:US:revenue:2023-07-01:2023-09-30:consolidated:USD:2024-02-01`,reasonCode:'same_day_conflict',batchId:b,
+    payload:{key:{issuer_id:t,market:'US',concept:'revenue',period_start:'2023-07-01',period_end:'2023-09-30',consolidation:'consolidated',unit:'USD',available_date:'2024-02-01'},fact_ids:[],values:[]}});
+   await expectRefused();
+  });
+
+  it('plan 3 adoptCandidate: an open lineage_conflict for the key and date refuses adoption although no ok competitor remains',async()=>{
+   const {t,b,expectRefused}=await adoptSetup();
+   await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${t}:revenue:2023-07-01:2023-09-30:consolidated:USD:2024-02-01`,reasonCode:'lineage_conflict',batchId:b,payload:{fact_ids:[],values:[]}});
+   await expectRefused();
+  });
+
  });
 }
// src/lib/facts/db-contract.ts
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
   expect((await current(iss)).rows.map(y=>[y.fact_id,y.is_revision])).toEqual([[r0,false],[a2.fact_id,true]]);
   expect((await db.factsByIds([r,a2.fact_id])).map(y=>y.status)).toEqual(['ok','ok']);
   const run3=await db.beginRun(iss,'US',b,1);const a3=factInsert(iss,f,{concept:'total_assets',statement:'BS',period_start:null,duration:'INSTANT'});
   expect(await db.stageFacts(run3,[a3])).toBe(1);
   expect(await code(db.publishRun(run3,[f.filing_id]))).toBe('mapping_gen_regression:mapping_gen_regression');
   expect(await statusOf(a3.fact_id)).toBe('staged');
   expect((await current(iss)).stateRev).toBe(2);
  });

  it('publish with expectedRev: a promotion after planning makes the plan stale (stale_plan, nothing published); the current rev publishes (round-3 P1)',async()=>{
   const {iss,b}=await published();
   const run2=await db.beginRun(iss,'US',b,1);const fq=filingInsert(iss,{availableDate:'2024-03-01'});await db.stageFilings(run2,[fq]);
   const qd=factInsert(iss,fq,{value:'100'});await db.stageFacts(run2,[qd]);
   const itemId=await conflict(iss,b,run2,[qd.fact_id],'2024-03-01');await db.quarantineFacts(run2,[qd.fact_id],itemId);
   expect(await db.publishRun(run2,[fq.filing_id],1)).toBe(0);                          // matching rev publishes; the parked row stays out
   const planned=(await current(iss)).stateRev;expect(planned).toBe(2);                 // the plan is made here: qd is not ok, so a different same-day value looks conflict-free
   const run3=await db.beginRun(iss,'US',b,1);const f3=filingInsert(iss,{availableDate:'2024-03-01'});await db.stageFilings(run3,[f3]);
   const a3=factInsert(iss,f3,{value:'200'});await db.stageFacts(run3,[a3]);
   expect(await db.resolveFactsQuarantine(itemId,[qd.fact_id],randomUUID())).toMatchObject({promoted:1,skipped:0});   // admin promotes qd after planning
   expect(await code(db.publishRun(run3,[f3.filing_id],planned))).toBe('stale_plan:stale_plan');
   expect(await statusOf(a3.fact_id)).toBe('staged');expect(await statusOf(qd.fact_id)).toBe('ok');
   expect(await db.publishRun(run3,[f3.filing_id],planned+1)).toBe(1);
  });

  it('same-day conflict: register, abandon, retry, publish; resolve is run_pending until publish; the verdict promotes chosen rows and binds the rest',async()=>{
   const {iss,b,r0,r}=await published();
   const runB=await db.beginRun(iss,'US',b,1);const fb=filingInsert(iss);await db.stageFilings(runB,[fb]);
   const c=factInsert(iss,fb,{value:'200'});await db.stageFacts(runB,[c]);
   const itemId=await conflict(iss,b,runB,[c.fact_id,r]);
   expect(await db.quarantineFacts(runB,[c.fact_id],itemId)).toBe(1);
   expect((await db.openConflicts(iss,'US')).map(i=>({id:i.id,fact_ids:i.fact_ids,available_date:i.available_date,concept:i.key.concept}))).toEqual([{id:itemId,fact_ids:[c.fact_id,r],available_date:'2024-02-01',concept:'revenue'}]);
   await db.abandonRun(runB);
   expect(await statusOf(r)).toBe('ok');expect(await statusOf(c.fact_id)).toBeNull();expect((await item(itemId)).status).toBe('open');
   const runC=await db.beginRun(iss,'US',b,1);const fc=filingInsert(iss);await db.stageFilings(runC,[fc]);
   const c2=factInsert(iss,fc,{value:'200'});await db.stageFacts(runC,[c2]);
   expect(await code(db.quarantineFacts(runC,[c2.fact_id],randomUUID()))).toBe('item_not_open:item_not_open');
   expect(await db.quarantineFacts(runC,[c2.fact_id,c2.fact_id],itemId)).toBe(1);
   expect((await item(itemId)).fact_ids).toEqual([c.fact_id,r,c2.fact_id]);
   expect(await code(db.resolveFactsQuarantine(itemId,[r],randomUUID()))).toBe('run_pending:run_pending');
   expect((await item(itemId)).status).toBe('open');
   expect(await db.publishRun(runC,[fc.filing_id])).toBe(0);
   expect(await statusOf(r)).toBe('quarantined');expect(await statusOf(c2.fact_id)).toBe('quarantined');
   expect((await current(iss,['revenue'],false)).rows.map(y=>[y.fact_id,y.value])).toEqual([[r0,'90']]);
   expect(await code(db.resolveFactsQuarantine(itemId,[randomUUID()],randomUUID()))).toBe('invalid_chosen:invalid_chosen');
   expect(await db.resolveFactsQuarantine(itemId,[r],randomUUID())).toMatchObject({promoted:1,skipped:0});
   expect(await item(itemId)).toEqual({status:'resolved_accept',fact_ids:[c.fact_id,r,c2.fact_id],chosen:[r]});
   expect((await current(iss,['revenue'],false)).rows.map(y=>y.fact_id)).toEqual([r]);
   expect((await current(iss)).stateRev).toBe(3);
   expect(await db.openConflicts(iss,'US')).toEqual([]);
   const other=await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${iss}:US:IS:${randomUUID()}`,reasonCode:'identity_gp',batchId:b,payload:{key:{},fact_ids:[c2.fact_id],run_id:runC}});
   expect(await db.resolveFactsQuarantine(other,[],randomUUID())).toMatchObject({promoted:0,skipped:1});
   expect(await statusOf(c2.fact_id)).toBe('quarantined');
   expect(await code(db.resolveFactsQuarantine(other,[],randomUUID()))).toBe('item_not_open:item_not_open');
  });

  it('resolve: chosen rows with differing values are invalid_chosen; an item of another table is not open',async()=>{
   const {iss,b,r}=await published();
   const runB=await db.beginRun(iss,'US',b,1);const fb=filingInsert(iss);await db.stageFilings(runB,[fb]);
   const c=factInsert(iss,fb,{value:'200'});await db.stageFacts(runB,[c]);
   const itemId=await conflict(iss,b,runB,[c.fact_id,r]);await db.quarantineFacts(runB,[c.fact_id],itemId);
   expect(await db.publishRun(runB,[fb.filing_id])).toBe(0);
   expect(await code(db.resolveFactsQuarantine(itemId,[c.fact_id,r],randomUUID()))).toBe('invalid_chosen:invalid_chosen');   // 200 vs 100
   expect((await item(itemId)).status).toBe('open');
   expect(await db.resolveFactsQuarantine(itemId,[c.fact_id],randomUUID())).toMatchObject({promoted:1,skipped:0,chosenFactIds:[c.fact_id]});
   // the committed verdict and a durable pending hook land in the same transaction (review round: Codex P1)
   const [done]=await h.tables.select('dq_quarantine',{id:itemId});
   expect((done.detail as {chosen_fact_ids:string[]}).chosen_fact_ids).toEqual([c.fact_id]);
   expect((done.detail as {hook:{stage:string;state:string;at:string}}).hook).toMatchObject({stage:'materialize',state:'pending'});
   const foreign=await quarantine(h.tables,{dataset:'facts.us',table:'other_table',naturalKey:`${iss}:US:${randomUUID()}`,reasonCode:'same_day_conflict',batchId:b,payload:{key:{},fact_ids:[],run_id:runB}});
   expect(await code(db.resolveFactsQuarantine(foreign,[],randomUUID()))).toBe('item_not_open:item_not_open');
   expect((await item(foreign)).status).toBe('open');
  });

  it('ordering: equal-day disclosures tie-break by created_at then fact_id (rows of one stageFacts call share created_at, so the larger fact_id is current)',async()=>{
   const {iss,b}=await ready();const run=await db.beginRun(iss,'US',b,1);
   const fa=filingInsert(iss);const fb=filingInsert(iss);await db.stageFilings(run,[fa,fb]);
   const [lo,hi]=[randomUUID(),randomUUID()].sort();
   const opts={concept:'net_income',value:'5'};
   expect(await db.stageFacts(run,[factInsert(iss,fa,{...opts,fact_id:hi}),factInsert(iss,fb,{...opts,fact_id:lo})])).toBe(2);   // larger id inserted first
   expect(await db.publishRun(run,[fa.filing_id,fb.filing_id])).toBe(2);
   expect((await current(iss,['net_income'])).rows.map(y=>[y.fact_id,y.disclosure_seq,y.is_current,y.is_revision])).toEqual([[lo,1,false,false],[hi,2,true,false]]);
  });

  it('duplicate keys: a filing_id reused with another source_ref and a repeated metric primary key are duplicate_key and leave state unchanged',async()=>{
   const {iss,b,f,r}=await (async()=>{const x=await published();return {...x};})();
   const run=await db.beginRun(iss,'US',b,1);
   expect((await code(db.stageFilings(run,[filingInsert(iss,{filing_id:f.filing_id})]))).startsWith('duplicate_key')).toBe(true);
   await db.abandonRun(run);
   const row=(v:string):MetricRow=>({issuer_id:iss,market:'US',metric:'gross_margin',period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:v,unit:'ratio',input_unit:'USD',basis:'us_standard',formula_version:'facts-derive/1.0',inputs:[{fact_id:r,concept:'revenue',filing_id:'f',available_date:'2024-02-01'}],based_on_rev:0,based_on_lineage:[{issuer_id:iss,state_rev:0}],as_of:'2024-03-01'});
   expect(await db.replaceMetrics(iss,'US',1,[row('0.5')])).toBe(1);
   expect((await code(db.replaceMetrics(iss,'US',1,[row('0.6'),row('0.7')]))).startsWith('duplicate_key')).toBe(true);
   expect((await db.metricsOfIssuer(iss,'US','facts-derive/1.0')).map(m=>m.value)).toEqual(['0.5']);
  });

  it('stageFilings: a source_ref already owned by another issuer is an error, never a silent skip, and the owner keeps its row',async()=>{
   const {iss,f}=await published();
   const {iss:other,b:bo}=await ready();
   const run=await db.beginRun(other,'US',bo,1);
   expect((await code(db.stageFilings(run,[filingInsert(other,{sourceRef:f.sourceRef})]))).startsWith('unknown:filing_not_staged')).toBe(true);
   expect((await db.filingsOfIssuer(iss,'US',{})).map(g=>g.filing_id)).toContain(f.filing_id);
   expect((await db.filingsOfIssuer(other,'US',{})).filter(g=>g.source_ref===f.sourceRef)).toEqual([]);
  });

  it('stageFilings validates the whole batch: a reused filing_id with a new source_ref rejects the call and writes nothing; factsByIds is deduped and ordered',async()=>{
   const {iss,b,f,r0,r}=await published();
   const run=await db.beginRun(iss,'US',b,1);
   const fresh=filingInsert(iss);
   expect((await code(db.stageFilings(run,[fresh,filingInsert(iss,{filing_id:f.filing_id})]))).startsWith('duplicate_key')).toBe(true);
   expect((await db.filingsOfIssuer(iss,'US',{})).some(g=>g.filing_id===fresh.filing_id)).toBe(false);
   const ids=[r0,r].sort();
   expect((await db.factsByIds([ids[1],ids[0],ids[1],randomUUID()])).map(y=>y.fact_id)).toEqual(ids);
  });

  it('metrics: stale based_on_rev is refused after publish; replacement is per issuer and atomic; metricsOfIssuer filters by formula version',async()=>{
   const {iss,b,r}=await published();
   const row=(v:string,metric='gross_margin'):MetricRow=>({issuer_id:iss,market:'US',metric,period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:v,unit:'ratio',input_unit:'USD',basis:'us_standard',formula_version:'facts-derive/1.0',inputs:[{fact_id:r,concept:'revenue',filing_id:'f',available_date:'2024-02-01'}],based_on_rev:0,based_on_lineage:[{issuer_id:iss,state_rev:0}],as_of:'2024-03-01'});
   expect(await code(db.replaceMetrics(iss,'US',0,[row('0.5')]))).toBe('stale_computation:stale_computation');
   expect(await db.replaceMetrics(iss,'US',1,[row('0.5')])).toBe(1);
   const run=await db.beginRun(iss,'US',b,1);expect(await db.publishRun(run,[])).toBe(0);   // empty run still advances state_rev
   expect(await code(db.replaceMetrics(iss,'US',1,[row('0.6')]))).toBe('stale_computation:stale_computation');
   expect(await db.replaceMetrics(iss,'US',2,[row('0.6'),row('0.7','net_margin')])).toBe(2);
   expect((await db.metricsOfIssuer(iss,'US','facts-derive/1.0')).map(m=>[m.metric,m.value,m.based_on_rev,m.inputs[0].fact_id,m.as_of])).toEqual([['gross_margin','0.6',2,r,'2024-03-01'],['net_margin','0.7',2,r,'2024-03-01']]);
   expect(await db.metricsOfIssuer(iss,'US','facts-derive/0.9')).toEqual([]);
   expect(await db.replaceMetrics(iss,'US',2,[])).toBe(0);
   expect(await db.metricsOfIssuer(iss,'US','facts-derive/1.0')).toEqual([]);
   expect(await code(db.replaceMetrics(randomUUID(),'US',1,[]))).toBe('stale_computation:stale_computation');   // no scope row ⇒ rev 0
  });

  it('reads: key ranking and limit, from/to, asOf, non-ok rows without sequence, factsByIds, filings and links, scope reconcile and due',async()=>{
   const {iss,b,run,f0,f,r0,r}=await published();
   const run1=await db.beginRun(iss,'US',b,1);
   const t1=factInsert(iss,f,{concept:'total_assets',statement:'BS',period_start:null,duration:'INSTANT',period_end:'2023-12-31',value:'1'});
   const t2=factInsert(iss,f,{concept:'total_assets',statement:'BS',period_start:null,duration:'INSTANT',period_end:'2023-09-30',value:'2'});
   expect(await db.stageFacts(run1,[t1,t2])).toBe(2);await db.publishRun(run1,[f.filing_id]);
   const all=await db.readFacts(iss,'US',{concepts:['revenue','total_assets'],asOf:'2030-01-01',history:true});
   expect(all.rows.map(y=>y.fact_id)).toEqual([r0,r,t1.fact_id,t2.fact_id]);                       // period_end desc, concept asc, then disclosure order
   expect((await db.readFacts(iss,'US',{concepts:['revenue','total_assets'],asOf:'2030-01-01',history:true,limit:2})).rows.map(y=>y.fact_id)).toEqual([r0,r,t1.fact_id]);
   expect((await db.readFacts(iss,'US',{concepts:['total_assets'],asOf:'2030-01-01',from:'2023-10-01'})).rows.map(y=>y.fact_id)).toEqual([t1.fact_id]);
   expect((await db.readFacts(iss,'US',{concepts:['total_assets'],asOf:'2030-01-01',to:'2023-09-30'})).rows.map(y=>y.fact_id)).toEqual([t2.fact_id]);
   expect((await db.readFacts(iss,'US',{concepts:['revenue'],asOf:'2023-12-31'})).rows).toEqual([]);
   expect((await db.readFacts(iss,'US',{concepts:['nope'],asOf:'2030-01-01'})).rows).toEqual([]);
   const [row]=(await db.readFacts(iss,'US',{concepts:['revenue'],asOf:'2030-01-01',history:false})).rows;
   expect(row).toMatchObject({fact_id:r,issuer_id:iss,market:'US',run_id:run,filing_id:f.filing_id,concept:'revenue',source_concept:'Revenues',statement:'IS',period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:'100',value_text:'100',unit:'USD',consolidation:'consolidated',available_date:'2024-02-01',mapping_gen:1,mapping_version:'facts-map/1',status:'ok',raw_hash:'h',disclosure_seq:2,is_current:true,is_revision:true});
   expect(typeof row.created_at).toBe('string');
   const run2=await db.beginRun(iss,'US',b,1);const fq=filingInsert(iss,{availableDate:'2024-03-01'});await db.stageFilings(run2,[fq]);
   const qd=factInsert(iss,fq,{value:'105'});await db.stageFacts(run2,[qd]);
   const itemId=await conflict(iss,b,run2,[qd.fact_id],'2024-03-01');await db.quarantineFacts(run2,[qd.fact_id],itemId);await db.publishRun(run2,[fq.filing_id]);
   const withNonOk=await db.readFacts(iss,'US',{concepts:['revenue'],asOf:'2030-01-01',history:true,includeNonOk:true});
   expect(withNonOk.rows.map(y=>[y.fact_id,y.status,y.disclosure_seq??null,y.is_current])).toEqual([[r0,'ok',1,false],[r,'ok',2,true],[qd.fact_id,'quarantined',null,false]]);
   expect(withNonOk.stateRev).toBe(3);
   expect((await db.readFacts(iss,'US',{concepts:['revenue'],asOf:'2030-01-01',history:false,includeNonOk:true})).rows.map(y=>y.fact_id)).toEqual([r]);
   expect((await db.factsByIds([qd.fact_id,randomUUID()])).map(y=>[y.fact_id,y.status,y.value])).toEqual([[qd.fact_id,'quarantined','105']]);
   expect(await db.factsByIds([])).toEqual([]);
   const list=await db.filingsOfIssuer(iss,'US',{});
   expect(list.map(g=>g.filing_id)).toEqual([fq.filing_id,f.filing_id,f0.filing_id]);                 // available_date desc
   expect(list[1]).toMatchObject({issuer_id:iss,market:'US',source:'edgar',origin:'sec',source_ref:f.sourceRef,form_type:'10-K',fiscal_year:2023,fiscal_period:'FY',period_end:'2023-12-31',available_date:'2024-02-01',url:null,document_ref:null,document_url:null,link_attempts:0,mapping_gen:1,run_id:run});
   expect((await db.filingsOfIssuer(iss,'US',{from:'2024-02-01',to:'2024-02-28'})).map(g=>g.filing_id)).toEqual([f.filing_id]);
   expect((await db.filingsOfIssuer(iss,'US',{limit:1})).map(g=>g.filing_id)).toEqual([fq.filing_id]);
   await db.updateFilingLink(f.filing_id,{document_ref:'doc-1',document_url:'https://example.test/doc-1',link_attempts:1});
   await db.updateFilingLink(f0.filing_id,{link_attempts:3});
   expect((await db.filingsOfIssuer(iss,'US',{unlinkedOnly:true})).map(g=>[g.filing_id,g.link_attempts])).toEqual([[fq.filing_id,0],[f0.filing_id,3]]);
   expect((await db.filingsOfIssuer(iss,'US',{})).find(g=>g.filing_id===f.filing_id)).toMatchObject({document_ref:'doc-1',document_url:'https://example.test/doc-1',link_attempts:1,mapping_gen:1});
   expect(await db.reconcileScope('US',[{issuer_id:iss,reasons:['test'],priority:10,fetch_key:'0000000001'}])).toBe(0);
   expect(await db.reconcileScope('US',[{issuer_id:iss,reasons:['sp500'],priority:0,fetch_key:'0000000001'}])).toBe(1);
   expect((await db.scopeDue('US','2100-01-01T00:00:00.000Z',1000)).find(x=>x.issuer_id===iss)).toBeUndefined();   // priority 0 is out of scope
   expect(await db.reconcileScope('US',[{issuer_id:iss,reasons:['sp500'],priority:5,fetch_key:'0000000001'}])).toBe(1);
   expect((await db.scopeDue('US','2100-01-01T00:00:00.000Z',1000)).find(x=>x.issuer_id===iss)).toMatchObject({market:'US',reasons:['sp500'],priority:5,fetch_key:'0000000001',lease_batch_id:b,state_rev:3,last_status:null,last_batch_id:null});
   expect(await db.scopeDue('US','2100-01-01T00:00:00.000Z',0)).toEqual([]);
   expect((await db.scopeRows('US',[iss,randomUUID()])).map(x=>[x.issuer_id,x.priority,x.fetch_key])).toEqual([[iss,5,'0000000001']]);   // by id, whatever priority / next_due_at
   expect(await db.reconcileScope('US',[{issuer_id:iss,reasons:[],priority:0,fetch_key:'0000000001'}])).toBe(1);
   expect((await db.scopeRows('US',[iss])).map(x=>x.priority)).toEqual([0]);
   expect(await db.scopeRows('CN',[iss])).toEqual([]);
   expect(await db.scopeRows('US',[])).toEqual([]);
   expect((await db.scopeAll('US')).find(x=>x.issuer_id===iss)).toMatchObject({priority:0,fetch_key:'0000000001'});   // scopeAll keeps priority 0 rows
   expect((await db.scopeAll('CN')).find(x=>x.issuer_id===iss)).toBeUndefined();
  });

  it('reconcileScope snapshotAt: a retirement from an older snapshot does not undo a newer activation; activations and later snapshots apply',async()=>{
   const iss=await h.issuer();
   const row=(priority:number)=>[{issuer_id:iss,reasons:priority>0?['r']:[],priority,fetch_key:'0000000007'}];
   const older=new Date(Date.now()-3_600_000).toISOString(),newer=new Date(Date.now()+3_600_000).toISOString();
   expect(await db.reconcileScope('US',row(10))).toBe(1);                       // activation just now
   expect(await db.reconcileScope('US',row(0),older)).toBe(0);                  // stale retirement refused
   expect((await db.scopeRows('US',[iss]))[0].priority).toBe(10);
   expect(await db.reconcileScope('US',row(0),newer)).toBe(1);                  // snapshot taken after the last change: retires
   expect((await db.scopeRows('US',[iss]))[0].priority).toBe(0);
   expect(await db.reconcileScope('US',row(10),older)).toBe(1);                 // activation applies whatever the snapshot
   expect((await db.scopeRows('US',[iss]))[0].priority).toBe(10);
  });

  it('reconcileScope snapshotAt: an unchanged active confirmation by a newer reconcile also blocks an older retirement (and is not counted as a change)',async()=>{
   const iss=await h.issuer();
   const row=(priority:number)=>[{issuer_id:iss,reasons:priority>0?['r']:[],priority,fetch_key:'0000000008'}];
   expect(await db.reconcileScope('US',row(10))).toBe(1);
   const snap=new Date().toISOString();                                         // run A read its sources here
   await new Promise(r=>setTimeout(r,40));
   expect(await db.reconcileScope('US',row(10))).toBe(0);                       // run B confirms, unchanged
   expect(await db.reconcileScope('US',row(0),snap)).toBe(0);                   // A's retirement is refused
   expect((await db.scopeRows('US',[iss]))[0].priority).toBe(10);
  });

  it("promotion blocks on an OPEN same_day_conflict for the row's (K, date) even when the row is not in that item's member list (round-1 #3)",async()=>{
   const {iss,b,r}=await published();                                                     // r: revenue 100 on 2024-02-01, ok
   const runB=await db.beginRun(iss,'US',b,1);const fb=filingInsert(iss);await db.stageFilings(runB,[fb]);
   const c=factInsert(iss,fb,{value:'200'});await db.stageFacts(runB,[c]);
   const dispute=await conflict(iss,b,runB,[c.fact_id,r]);                                // open dispute on (K, 2024-02-01): members c, r
   await db.quarantineFacts(runB,[c.fact_id],dispute);
   expect(await db.publishRun(runB,[fb.filing_id])).toBe(0);                              // r disposed
   // Run C discloses the same K on the same day (value 100) from a third filing, parked by an
   // identity item only: it is NOT a member of the dispute.
   const runC=await db.beginRun(iss,'US',b,1);const fc=filingInsert(iss);await db.stageFilings(runC,[fc]);
   const c3=factInsert(iss,fc,{value:'100'});await db.stageFacts(runC,[c3]);
   const identity=await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${iss}:US:IS:${randomUUID()}`,reasonCode:'identity_gp',batchId:b,payload:{key:{issuer_id:iss,market:'US'},fact_ids:[c3.fact_id],run_id:runC}});
   await db.quarantineFacts(runC,[c3.fact_id],identity);
   expect(await db.publishRun(runC,[fc.filing_id])).toBe(0);
   expect(await db.resolveFactsQuarantine(identity,[],randomUUID())).toMatchObject({promoted:0,skipped:1});   // (K, 2024-02-01) is still disputed
   expect(await statusOf(c3.fact_id)).toBe('quarantined');
   expect((await current(iss,['revenue'],false)).rows.map(y=>y.value)).toEqual(['90']);                  // the day still has no ok value
   expect(await db.resolveFactsQuarantine(dispute,[r],randomUUID())).toMatchObject({promoted:1,skipped:0});
   expect(await statusOf(r)).toBe('ok');expect(await statusOf(c3.fact_id)).toBe('quarantined');       // c3 waits for promote_quarantined (§7.3), the dispute no longer blocks it
   expect((await current(iss,['revenue'],false)).rows.map(y=>y.fact_id)).toEqual([r]);
  });

  it('an item without fact rows is run_pending while its anchor run is staged; acknowledged once that run is published or abandoned (round-1 #10)',async()=>{
   const {iss,b}=await published();
   const run=await db.beginRun(iss,'US',b,1);
   const parked=await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${iss}:US:cash::2023-09-30:consolidated:USD:acc-9:1`,reasonCode:'ambiguous_value',batchId:b,payload:{key:{issuer_id:iss,market:'US'},fact_ids:[],run_id:run}});
   expect(await code(db.resolveFactsQuarantine(parked,[],randomUUID()))).toBe('run_pending:run_pending');
   expect((await item(parked)).status).toBe('open');
   expect(await db.publishRun(run,[])).toBe(0);
   expect(await db.resolveFactsQuarantine(parked,[],randomUUID())).toMatchObject({promoted:0,skipped:0});
   expect((await item(parked)).status).toBe('resolved_accept');
   expect((await current(iss)).stateRev).toBe(3);                                         // publish + resolution
   const run2=await db.beginRun(iss,'US',b,1);
   const parked2=await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${iss}:US:cash::2023-06-30:consolidated:USD:acc-9:1`,reasonCode:'odd_duration',batchId:b,payload:{key:{issuer_id:iss,market:'US'},fact_ids:[],run_id:run2}});
   expect(await code(db.resolveFactsQuarantine(parked2,[],randomUUID()))).toBe('run_pending:run_pending');
   await db.abandonRun(run2);
   expect(await db.resolveFactsQuarantine(parked2,[],randomUUID())).toMatchObject({promoted:0,skipped:0});
  });

  it('complete-set reads return every row past 1,000: filingsOfIssuer without limit, metricsOfIssuer, scopeRows (round-1 #7)',async()=>{
   const {iss,b,r}=await published();
   const run=await db.beginRun(iss,'US',b,1);
   const many=Array.from({length:1001},(_,i)=>filingInsert(iss,{availableDate:'2020-01-01',sourceRef:`bulk-${iss}-${String(i).padStart(4,'0')}`}));   // (source, source_ref) is globally unique
   expect((await db.stageFilings(run,many)).size).toBe(1001);
   expect(await db.publishRun(run,many.map(f=>f.filing_id))).toBe(0);
   expect((await db.filingsOfIssuer(iss,'US',{})).length).toBe(1003);
   expect((await db.filingsOfIssuer(iss,'US',{limit:5})).length).toBe(5);
   expect((await db.filingsOfIssuer(iss,'US',{from:'2020-01-01',to:'2020-01-01'})).length).toBe(1001);
   const rev=(await current(iss)).stateRev;
   const rows=Array.from({length:1001},(_,i):MetricRow=>({issuer_id:iss,market:'US',metric:`m${String(i).padStart(4,'0')}`,period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:String(i),unit:'ratio',input_unit:'USD',basis:'us_standard',formula_version:'facts-derive/1.0',inputs:[{fact_id:r,concept:'revenue',filing_id:'f',available_date:'2024-02-01'}],based_on_rev:rev,based_on_lineage:[{issuer_id:iss,state_rev:rev}],as_of:'2024-03-01'}));
   expect(await db.replaceMetrics(iss,'US',rev,rows)).toBe(1001);
   const got=await db.metricsOfIssuer(iss,'US','facts-derive/1.0');
   expect(got.length).toBe(1001);expect(got.at(-1)).toMatchObject({metric:'m1000',value:'1000'});
  },60000);

  // ---- plan 3 (C4, spec §3.2): the same scenarios on memoryFactsDb and on the 20261107091000 functions
  const newPair=()=>`test.${randomUUID().slice(0,8)}` as CyclePairId;   // one pair per test (a running cycle is unique per pair)
  /** A running cycle whose members carry frozen expected natural keys (apply/complete check against them). */
  const cycle=async(pair:CyclePairId,members:{issuer_id:string;keys:string[]}[])=>{
   const cycle_id=`${pair}-${randomUUID().slice(0,8)}`;
   await h.tables.insert('dq_reconcile_cycles',{pair,cycle_id,started_at:new Date().toISOString(),finished_at:null,members:members.map(m=>({issuer_id:m.issuer_id,market:'US',expected_keys:m.keys.map(naturalKey=>({naturalKey,locator:{}}))})),status:'running',
    expected_total:members.reduce((n,m)=>n+m.keys.length,0),compared_passed:0,compared_failed:0,not_compared:0,exec_failed_members:0,detail:{}});
   for(const m of members)await h.tables.insert('dq_reconcile_cursor',{pair,cycle_id,issuer_id:m.issuer_id,market:'US',expected:m.keys.length,state:'pending',claimed_by:null,claim_until:null,attempts:0,last_error:null,done_at:null,compared_passed:null,compared_failed:null,not_compared:null});
   return cycle_id;
  };
  const closeCycle=(pair:CyclePairId,cycle_id:string)=>h.tables.update('dq_reconcile_cycles',{pair,cycle_id},{status:'complete',finished_at:new Date().toISOString()});
  const res=(nk:string,o:Partial<ReconcileResultInput>={}):ReconcileResultInput=>({natural_key:nk,kind:'numeric',outcome:'compared',passed:false,left_value:'100',right_value:'99',abs_diff:'1',rel_diff:'0.01',tolerance:'0',
   left_source:'companyfacts',right_source:'ixbrl',detail:{right:{locator:'ix#1'}},action:'record',inputs_hash:'h1',...o});
  /** Another leased issuer with a published revenue row on 2024-02-01 for the published() key. */
  const sibling=async(value:string,o:Partial<FactInsert>={})=>{
   const {iss,b}=await ready();const run=await db.beginRun(iss,'US',b,1);
   const f=filingInsert(iss);await db.stageFilings(run,[f]);const x=factInsert(iss,f,{value,...o});await db.stageFacts(run,[x]);await db.publishRun(run,[f.filing_id]);
   return {iss,b,x:x.fact_id};
  };

  it('plan 3 topology: setMerge re-points referrers (A→B then B→C), lineageOf/targetOf follow, every affected scope bumps; setDissolved refuses referrers and non-active issuers',async()=>{
   const a=await h.issuer(),b=await h.issuer(),c=await h.issuer(),by=await h.user();
   expect(await db.setMerge(a,b,by)).toEqual({repointed:0});
   expect(await db.lineageOf(b)).toEqual([b,a]);expect(await db.targetOf(a)).toBe(b);expect(await db.targetOf(b)).toBe(b);
   const before=await db.stateRevs([a,b,c],'US');
   expect(await db.setMerge(b,c,by)).toEqual({repointed:1});
   expect(await db.lineageOf(c)).toEqual([c,...[a,b].sort()]);expect(await db.targetOf(a)).toBe(c);
   expect((await db.stateRevs([a,b,c],'US')).map(r=>r.state_rev)).toEqual(before.map(r=>r.state_rev+1));
   expect(await code(db.setMerge(b,c,by))).toBe('source_not_active:source_not_active');
   expect(await code(db.setDissolved(c,by))).toBe('has_referrers:has_referrers');
   const d=await h.issuer();await db.setDissolved(d,by);
   expect(await code(db.setDissolved(d,by))).toBe('source_not_active:source_not_active');
   expect((await code(db.setMerge(await h.issuer(),d,by))).startsWith('unknown:merge_target_not_active')).toBe(true);
  });

  it('plan 3 readFactsLineage: one member equals readFacts in every mode; two members move a cross-issuer same-day disagreement into conflicts (the earlier disclosure becomes current); equal values are no conflict',async()=>{
   const {iss:t,r0,r}=await published();
   for(const o of [{history:false},{history:true},{history:true,includeNonOk:true}]){
    const one=await db.readFactsLineage([t],'US',{concepts:['revenue'],asOf:'2030-01-01',...o});
    const legacy=await db.readFacts(t,'US',{concepts:['revenue'],asOf:'2030-01-01',...o});
    expect(one).toEqual({stateRevs:[{issuer_id:t,state_rev:legacy.stateRev}],lineage:[t],rows:legacy.rows,conflicts:[],truncated:false});
   }
   const {iss:s,x}=await sibling('200');
   const two=await db.readFactsLineage([t,s],'US',{concepts:['revenue'],asOf:'2030-01-01',history:true});
   expect(two.conflicts).toEqual([{key:{concept:'revenue',period_start:'2023-10-01',period_end:'2023-12-31',consolidation:'consolidated',unit:'USD'},available_date:'2024-02-01',fact_ids:[r,x].sort()}]);
   expect(two.rows.map(y=>[y.fact_id,y.disclosure_seq,y.is_current])).toEqual([[r0,1,true]]);
   expect(two.lineage).toEqual([s,t].sort());expect(two.stateRevs.map(v=>v.issuer_id)).toEqual([s,t].sort());
   const {iss:u,x:ux}=await sibling('100');
   const same=await db.readFactsLineage([t,u],'US',{concepts:['revenue'],asOf:'2030-01-01',history:true});
   expect(same.conflicts).toEqual([]);expect(same.rows.map(y=>y.fact_id)).toEqual([r0,r,ux]);expect(same.rows.at(-1)!.is_current).toBe(true);
  });

  it('plan 3 replaceMetricsLineage: the vector is checked against the current lineage and every rev; metricsOfIssuer returns it; the plan-2 wrapper fits a one-member lineage only',async()=>{
   const {iss:t,r}=await published();const by=await h.user();const s=await h.issuer();
   const row=(v:string):MetricRow=>({issuer_id:t,market:'US',metric:'gross_margin',period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:v,unit:'ratio',input_unit:'USD',basis:'us_standard',formula_version:'facts-derive/1.0',
    inputs:[{fact_id:r,concept:'revenue',filing_id:'f',available_date:'2024-02-01'}],based_on_rev:0,based_on_lineage:[],as_of:'2024-03-01'});
   const one=await db.stateRevs([t],'US');
   expect(await db.replaceMetricsLineage(t,'US',one,[row('0.5')])).toBe(1);
   expect((await db.metricsOfIssuer(t,'US','facts-derive/1.0')).map(m=>[m.based_on_rev,m.based_on_lineage])).toEqual([[1,[{issuer_id:t,state_rev:1}]]]);
   await db.setMerge(s,t,by);
   expect(await code(db.replaceMetricsLineage(t,'US',one,[row('0.6')]))).toBe('stale_computation:stale_computation');   // lineage grew
   const lin=await db.stateRevs(await db.lineageOf(t),'US');
   expect(await code(db.replaceMetricsLineage(t,'US',lin.map(x=>({...x,state_rev:x.state_rev+1})),[row('0.6')]))).toBe('stale_computation:stale_computation');
   expect(await db.replaceMetricsLineage(t,'US',lin,[row('0.6')])).toBe(1);
   expect((await db.metricsOfIssuer(t,'US','facts-derive/1.0'))[0]).toMatchObject({value:'0.6',based_on_rev:lin.find(x=>x.issuer_id===t)!.state_rev,based_on_lineage:lin});
   expect(await code(db.replaceMetrics(t,'US',lin.find(x=>x.issuer_id===t)!.state_rev,[row('0.7')]))).toBe('stale_computation:stale_computation');
   const lone=await h.issuer();
   expect(await code(db.replaceMetricsLineage(lone,'CN',[{issuer_id:lone,state_rev:0}],[]))).toBe('scope_missing:scope_missing');
  });

  it('plan 3 filings: readFilingFacts (every generation and status + run status), findFilingBySourceRef, filingsForCalendar, setFilingAcceptance once',async()=>{
   const {iss,b,f0,f,r}=await published();
   const run2=await db.beginRun(iss,'US',b,2);const a2=factInsert(iss,f,{value:'101'});await db.stageFacts(run2,[a2]);await db.publishRun(run2,[f.filing_id]);
   const run3=await db.beginRun(iss,'US',b,2);const st=factInsert(iss,f,{concept:'net_income',value:'5'});await db.stageFacts(run3,[st]);
   expect((await db.readFilingFacts(f.filing_id,true)).map(x=>[x.fact_id,x.mapping_gen,x.status,x.run_status,x.value])).toEqual([[r,1,'ok','published','100'],[st.fact_id,2,'staged','staged','5'],[a2.fact_id,2,'ok','published','101']]);
   expect((await db.readFilingFacts(f.filing_id,false)).map(x=>x.fact_id)).toEqual([r,a2.fact_id]);
   expect(await db.findFilingBySourceRef('edgar',f.sourceRef)).toMatchObject({filing_id:f.filing_id,accepted_at:null,acceptance_source:null});
   expect(await db.findFilingBySourceRef('tushare',f.sourceRef)).toBeNull();
   expect((await db.filingsForCalendar(iss,'US',{fromPeriodEnd:'2023-12-31'})).map(g=>[g.filing_id,g.run_status])).toEqual([[f0.filing_id,'published'],[f.filing_id,'published']]);
   expect(await db.filingsForCalendar(iss,'US',{fromPeriodEnd:'2024-01-01'})).toEqual([]);
   expect(await db.setFilingAcceptance(f.filing_id,'2024-02-01T21:05:00.000Z','sec_submissions')).toBe(true);
   expect(await db.setFilingAcceptance(f.filing_id,'2024-02-01T21:05:00.000Z','sec_submissions')).toBe(false);
   expect(await code(db.setFilingAcceptance(f.filing_id,'2024-02-01T21:06:00.000Z','sec_submissions'))).toBe('acceptance_conflict:acceptance_conflict');
   expect(await code(db.setFilingAcceptance(randomUUID(),'2024-02-01T21:05:00.000Z','sec_submissions'))).toBe('filing_not_found:filing_not_found');
   expect(await db.findFilingBySourceRef('edgar',f.sourceRef)).toMatchObject({accepted_at:'2024-02-01T21:05:00.000Z',acceptance_source:'sec_submissions'});
  });

  it('plan 3 adoptCandidate: invalid_choice and stale_evaluation leave the item open; adoption writes an ok row from the camelCase candidate on the filing generation, resolves the item with the hook, bumps state_rev',async()=>{
   const {iss,b,run,f}=await published();
   const cand=(value:string)=>({concept:'revenue',sourceConcept:'us-gaap:Revenues',statement:'IS',periodStart:'2023-07-01',periodEnd:'2023-09-30',duration:'3M',value,unit:'USD',consolidation:'consolidated',filingRef:f.sourceRef,rawHash:`h-${value}`});
   const item=await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${iss}:US:revenue:2023-07-01:2023-09-30:consolidated:USD:${f.sourceRef}:1`,reasonCode:'ambiguous_value',batchId:b,
    payload:{key:{issuer_id:iss,market:'US',concept:'revenue',period_start:'2023-07-01',period_end:'2023-09-30',consolidation:'consolidated',unit:'USD'},candidates:[cand('110'),cand('111')],run_id:run}});
   const by=await h.user();const ab=await h.batch();
   expect(await code(db.adoptCandidate(item,2,ab,1,by))).toBe('invalid_choice:invalid_choice');
   expect(await code(db.adoptCandidate(item,0,ab,0,by))).toBe('stale_evaluation:stale_evaluation');
   const out=await db.adoptCandidate(item,1,ab,1,by);
   expect(out).toMatchObject({issuerId:iss,market:'US'});
   expect((await db.factsByIds([out.factId]))[0]).toMatchObject({value:'111',status:'ok',filing_id:f.filing_id,mapping_gen:1,mapping_version:'facts-map/1',available_date:'2024-02-01',source_concept:'us-gaap:Revenues',raw_hash:'h-111',run_id:out.runId});
   expect((await current(iss)).stateRev).toBe(2);
   const [it]=await h.tables.select('dq_quarantine',{id:item});
   expect(it.status).toBe('resolved_accept');
   expect(it.detail).toMatchObject({chosen_candidate_index:1,adopted_fact_id:out.factId,run_id:out.runId,issuer_id:iss,market:'US',hook:{stage:'materialize',state:'pending'}});
   expect(await code(db.adoptCandidate(item,0,ab,2,by))).toBe('item_not_open:item_not_open');
  });

  it('plan 3 reconcile cursor + restore: claim / fence / apply (quarantine, reuse) / complete; a quarantined left gets latest_result; restoreReconciled needs the current passing hash',async()=>{
   const {iss,r}=await published();const by=await h.user();const pair=newPair();
   const c1=await cycle(pair,[{issuer_id:iss,keys:['k1','k2']}]);const w=await h.batch();
   const fence=(await db.claimReconcileMember(pair,c1,iss,'US',w))!;
   expect(fence).toEqual({pair,cycle_id:c1,issuer_id:iss,market:'US',batch_id:w,attempt:1});
   expect(await db.claimReconcileMember(pair,c1,iss,'US',await h.batch())).toBeNull();
   const q1=await db.applyReconcileResult(fence,res('k1',{action:'quarantine_left',left_fact_id:r}));
   expect(q1).toMatchObject({reused:false,quarantined:1,materialize:{issuerId:iss,market:'US'}});
   expect(await statusOf(r)).toBe('quarantined');
   expect(await db.applyReconcileResult(fence,res('k1',{action:'quarantine_left',left_fact_id:r}))).toEqual({...q1,reused:true,quarantined:0,materialize:null});
   expect(await code(db.completeReconcileMember(fence))).toBe('member_incomplete:member_incomplete');
   await db.applyReconcileResult(fence,res('k2',{outcome:'right_missing',left_value:null,right_value:null,abs_diff:null,rel_diff:null}));
   expect(await db.completeReconcileMember(fence)).toEqual({compared_passed:0,compared_failed:1,not_compared:1});
   expect(await code(db.applyReconcileResult(fence,res('k3')))).toBe('fence_failed:fence_failed');
   const [item]=await h.tables.select('dq_quarantine',{id:q1.itemId!});
   expect(item).toMatchObject({status:'open',reason_code:'reconcile_mismatch',dataset:'facts.us',natural_key:`${pair}:k1:${r}`});
   expect(item.detail).toMatchObject({pair,issuer_id:iss,market:'US',latest_result:{passed:false,inputs_hash:'h1'},hook:{stage:'materialize',state:'pending'}});
   expect(await code(db.restoreReconciled(q1.itemId!,w,'h1',by))).toBe('not_passing:not_passing');
   await closeCycle(pair,c1);
   const c2=await cycle(pair,[{issuer_id:iss,keys:['k1']}]);
   const f2=(await db.claimReconcileMember(pair,c2,iss,'US',w))!;
   await db.applyReconcileResult(f2,res('k1',{left_fact_id:r,passed:true,right_value:'100',abs_diff:'0',rel_diff:'0',inputs_hash:'h2'}));
   expect(((await h.tables.select('dq_quarantine',{id:q1.itemId!}))[0].detail as {latest_result:unknown}).latest_result).toMatchObject({passed:true,inputs_hash:'h2'});
   expect(await code(db.restoreReconciled(q1.itemId!,w,'h1',by))).toBe('not_passing:not_passing');
   expect(await db.restoreReconciled(q1.itemId!,w,'h2',by)).toEqual({promoted:1,skipped:[]});
   expect(await statusOf(r)).toBe('ok');
   await h.expireReconcileClaim(pair,c2,iss,'US');
   expect(await code(db.completeReconcileMember(f2))).toBe('fence_failed:fence_failed');
   const f3=(await db.claimReconcileMember(pair,c2,iss,'US',w))!;expect(f3.attempt).toBe(2);
   await db.failReconcileMember(f3,'boom');
   expect((await db.claimReconcileMember(pair,c2,iss,'US',w))!.attempt).toBe(3);
  });

  it('plan 3 openReconcileCycle (plan audit Q2): cycle + cursors in one call; only the listed pending entries are consumed; a running cycle is returned unchanged; unresolved pending is refused',async()=>{
   const pair=newPair();const t1=await h.issuer(),t2=await h.issuer();const at=()=>new Date().toISOString();
   const e1={issuer_id:t1,market:'US' as const,source:randomUUID()},e2={issuer_id:t2,market:'US' as const,source:randomUUID()};
   await h.tables.insert('dq_reconcile_cycles',{pair,cycle_id:`${pair}-old`,started_at:at(),finished_at:at(),members:[],status:'complete',expected_total:0,compared_passed:0,compared_failed:0,not_compared:0,exec_failed_members:0,detail:{pending_members:[e1,e2]}});
   const out=await db.openReconcileCycle({pair,cycleId:`${pair}-new`,startedAt:at(),members:[{issuer_id:t1,market:'US',expected_keys:[{naturalKey:'k',locator:{}}]}],pending:[e1]});
   expect(out).toMatchObject({created:true,transferred:[e1],cycle:{cycle_id:`${pair}-new`,status:'running',expected_total:1,detail:{pending_merged_from:[`${pair}-old`],pending_transferred:[e1]}}});
   expect((await h.tables.select('dq_reconcile_cursor',{pair,cycle_id:`${pair}-new`})).map(c=>[c.issuer_id,c.market,Number(c.expected),c.state])).toEqual([[t1,'US',1,'pending']]);
   expect((await h.tables.select('dq_reconcile_cycles',{pair,cycle_id:`${pair}-old`}))[0].detail).toEqual({pending_members:[e2],pending_consumed_by:`${pair}-new`});
   const again=await db.openReconcileCycle({pair,cycleId:`${pair}-other`,startedAt:at(),members:[{issuer_id:t2,market:'US',expected_keys:[]}],pending:[e2]});
   expect(again).toMatchObject({created:false,transferred:[],cycle:{cycle_id:`${pair}-new`}});
   expect(await code(db.openReconcileCycle({pair:newPair(),cycleId:'x',startedAt:at(),members:[],pending:[e1]}))).toMatch(/invalid_members/);
  });

  it('plan 3 resolveLineageConflict: after setMerge the disagreement is a conflict; keeping one row quarantines the others of the lineage and clears it',async()=>{
   const {iss:t,r}=await published();const by=await h.user();
   const {iss:s,b:bs,x}=await sibling('200');
   await db.setMerge(s,t,by);
   const lin=await db.lineageOf(t);
   expect((await db.readFactsLineage(lin,'US',{concepts:['revenue'],asOf:'2030-01-01'})).conflicts.map(cf=>cf.fact_ids)).toEqual([[r,x].sort()]);
   const item=await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${t}:revenue:2023-10-01:2023-12-31:consolidated:USD:2024-02-01`,reasonCode:'lineage_conflict',batchId:bs,payload:{fact_ids:[r,x],values:[]}});
   const ab=await h.batch();
   expect(await code(db.resolveLineageConflict(item,randomUUID(),ab,by))).toBe('invalid_choice:invalid_choice');
   expect(await db.resolveLineageConflict(item,r,ab,by)).toEqual({quarantined:1});
   expect(await statusOf(x)).toBe('quarantined');
   const after=await db.readFactsLineage(lin,'US',{concepts:['revenue'],asOf:'2030-01-01'});
   expect(after.conflicts).toEqual([]);expect(after.rows.map(y=>y.fact_id)).toEqual([r]);
   expect(((await h.tables.select('dq_quarantine',{id:item}))[0].detail as Record<string,unknown>)).toMatchObject({chosen_fact_ids:[r],quarantined_fact_ids:[x],issuer_id:t,market:'US'});
  });

  // ---- plan 3, review round: landed behaviours pinned on both implementations
  it('plan 3 adoptCandidate lineage checks: a different value on the same key and date in the lineage, or an open lineage_conflict / same_day_conflict item for it, is conflict_exists; an equal value adopts; a dissolved target is lineage_changed',async()=>{
   const {iss:t,b,run,f}=await published();const by=await h.user();
   const closed={status:'resolved_reject',resolved_by:by,resolved_at:new Date().toISOString()};
   const cand=(value:string)=>({concept:'revenue',sourceConcept:'us-gaap:Revenues',statement:'IS',periodStart:'2023-07-01',periodEnd:'2023-09-30',duration:'3M',value,unit:'USD',consolidation:'consolidated',filingRef:f.sourceRef,rawHash:`h-${value}`});
   const mk=(value:string)=>quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${t}:US:revenue:2023-07-01:2023-09-30:consolidated:USD:${f.sourceRef}:1`,reasonCode:'ambiguous_value',batchId:b,
    payload:{key:{issuer_id:t,market:'US',concept:'revenue',period_start:'2023-07-01',period_end:'2023-09-30',consolidation:'consolidated',unit:'USD'},candidates:[cand(value)],run_id:run}});
   // a sibling in the lineage with an ok row on the same key and the filing's available_date, value 200
   const s=await sibling('200',{period_start:'2023-07-01',period_end:'2023-09-30'});await db.setMerge(s.iss,t,by);
   const rev=async()=>(await db.stateRevs([t],'US'))[0].state_rev;
   const ab=await h.batch();
   const i1=await mk('110');
   expect(await code(db.adoptCandidate(i1,0,ab,await rev(),by))).toBe('conflict_exists:conflict_exists');
   expect((await h.tables.select('dq_quarantine',{id:i1}))[0].status).toBe('open');
   expect(await statusOf(s.x)).toBe('ok');
   // an open lineage_conflict item for the key and date blocks even an equal value
   const lc=await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${t}:revenue:2023-07-01:2023-09-30:consolidated:USD:2024-02-01`,reasonCode:'lineage_conflict',batchId:b,payload:{fact_ids:[],values:[]}});
   await h.tables.update('dq_quarantine',{id:i1},closed);   // same natural key: the open item would be reused
   const i2=await mk('200');
   expect(await code(db.adoptCandidate(i2,0,ab,await rev(),by))).toBe('conflict_exists:conflict_exists');
   await h.tables.update('dq_quarantine',{id:lc},closed);
   // equal value, no open item: adopted
   const out=await db.adoptCandidate(i2,0,ab,await rev(),by);
   expect((await db.factsByIds([out.factId]))[0]).toMatchObject({value:'200',status:'ok'});
   // target dissolved: the lineage no longer has an active target
   const {iss:d,b:bd,run:rd,f:fd}=await published();await db.setDissolved(d,by);
   const cd={concept:'revenue',sourceConcept:'us-gaap:Revenues',statement:'IS',periodStart:'2023-07-01',periodEnd:'2023-09-30',duration:'3M',value:'5',unit:'USD',consolidation:'consolidated',filingRef:fd.sourceRef,rawHash:'h-5'};
   const i3=await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${d}:US:revenue:2023-07-01:2023-09-30:consolidated:USD:${fd.sourceRef}:1`,reasonCode:'ambiguous_value',batchId:bd,payload:{key:{issuer_id:d},candidates:[cd],run_id:rd}});
   expect(await code(db.adoptCandidate(i3,0,ab,(await db.stateRevs([d],'US'))[0].state_rev,by))).toBe('lineage_changed:lineage_changed');
  });

  it('plan 3 resolveLineageConflict: target_not_active, unresolved (the kept row is not a current ok row; nothing written), invalid_choice for a malformed key, batch_mismatch, item_not_open on a second call',async()=>{
   const by=await h.user();const ab=await h.batch();
   // unresolved: the kept fact belongs to a superseded generation, so no visible ok row is left after the others are quarantined
   const {iss:t,b,r,f}=await published();
   const run2=await db.beginRun(t,'US',b,2);const a2=factInsert(t,f,{concept:'net_income',value:'5'});await db.stageFacts(run2,[a2]);await db.publishRun(run2,[f.filing_id]);
   const s=await sibling('200');await db.setMerge(s.iss,t,by);
   const nk=`${t}:revenue:2023-10-01:2023-12-31:consolidated:USD:2024-02-01`;
   const item=await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:nk,reasonCode:'lineage_conflict',batchId:b,payload:{fact_ids:[r,s.x],values:[]}});
   expect(await code(db.resolveLineageConflict(item,r,ab,by))).toBe('unresolved:unresolved');
   expect(await statusOf(s.x)).toBe('ok');expect((await h.tables.select('dq_quarantine',{id:item}))[0].status).toBe('open');   // the quarantine of the others was rolled back
   expect(await code(db.resolveLineageConflict(item,s.x,await h.batch().then(async x=>{await h.tables.update('ingest_batches',{batch_id:x},{status:'success',finished_at:new Date(Date.now()+60000).toISOString()});return x;}),by))).toBe('batch_mismatch:batch_mismatch');
   // malformed natural key
   const bad=await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${t}:revenue:2023-10-01`,reasonCode:'lineage_conflict',batchId:b,payload:{fact_ids:[r,s.x],values:[]}});
   expect(await code(db.resolveLineageConflict(bad,r,ab,by))).toBe('invalid_choice:invalid_choice');
   // keeping the live row works once; the item is then closed
   expect(await db.resolveLineageConflict(item,s.x,ab,by)).toEqual({quarantined:0});   // r is a superseded-generation row: nothing visible left to quarantine
   expect(await code(db.resolveLineageConflict(item,s.x,ab,by))).toBe('item_not_open:item_not_open');
   // a dissolved target
   const {iss:d,b:bd,r:rd}=await published();await db.setDissolved(d,by);
   const di=await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${d}:revenue:2023-10-01:2023-12-31:consolidated:USD:2024-02-01`,reasonCode:'lineage_conflict',batchId:bd,payload:{fact_ids:[rd],values:[]}});
   expect(await code(db.resolveLineageConflict(di,rd,ab,by))).toBe('target_not_active:target_not_active');
  });

  it('plan 3 generic resolver: reconcile_mismatch and lineage_conflict items are use_dedicated_resolver and stay open',async()=>{
   const {iss,b,r}=await published();
   for(const reason of ['reconcile_mismatch','lineage_conflict']){
    const id=await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${iss}:${reason}:${randomUUID()}`,reasonCode:reason,batchId:b,payload:{key:{},fact_ids:[r],values:[]}});
    expect(await code(db.resolveFactsQuarantine(id,[r],randomUUID()))).toBe('use_dedicated_resolver:use_dedicated_resolver');
    expect((await h.tables.select('dq_quarantine',{id}))[0].status).toBe('open');
   }
  });

  it('plan 3 applyReconcileResult checks: a key outside the frozen set, a pass without a comparison, text values on a non-numeric kind, a missing left fact id and a foreign left fact are invalid_result and write nothing; complete needs exact frozen-key coverage',async()=>{
   const {iss,r}=await published();const other=await published();const pair=newPair();
   const c1=await cycle(pair,[{issuer_id:iss,keys:['k1','k2']}]);const w=await h.batch();
   const fence=(await db.claimReconcileMember(pair,c1,iss,'US',w))!;
   const bad=[res('zz'),res('k1',{outcome:'right_missing',passed:true}),res('k1',{kind:'text',left_value:'a'}),res('k1',{action:'quarantine_left'}),res('k1',{left_fact_id:other.r})];
   for(const x of bad)expect(await code(db.applyReconcileResult(fence,x))).toBe('invalid_result:invalid_result');
   expect(await h.tables.select('dq_reconciliations',{pair,cycle_id:c1})).toEqual([]);
   expect(await statusOf(r)).toBe('ok');
   await db.applyReconcileResult(fence,res('k1',{kind:'text',left_value:null,right_value:null,abs_diff:null,rel_diff:null,outcome:'unsupported'}));
   expect(await code(db.completeReconcileMember(fence))).toBe('member_incomplete:member_incomplete');   // k2 has no accepted result
   await db.applyReconcileResult(fence,res('k2',{outcome:'left_missing',left_value:null,right_value:null,abs_diff:null,rel_diff:null}));
   expect(await db.completeReconcileMember(fence)).toEqual({compared_passed:0,compared_failed:0,not_compared:2});
  });

  it('plan 3 applyReconcileResult on a left row already quarantined for another reason: a failing compare opens the reconcile_mismatch item without a hook and without changing visibility; a second cycle reuses the item',async()=>{
   const {iss,b}=await ready();const run=await db.beginRun(iss,'US',b,1);const f=filingInsert(iss);await db.stageFilings(run,[f]);
   const ok=factInsert(iss,f),qd=factInsert(iss,f,{concept:'total_assets',statement:'BS',period_start:null,duration:'INSTANT'});
   await db.stageFacts(run,[ok,qd]);
   const gen=await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${iss}:US:BS:${randomUUID()}`,reasonCode:'identity_bs',batchId:b,payload:{key:{},fact_ids:[qd.fact_id],run_id:run}});
   await db.quarantineFacts(run,[qd.fact_id],gen);await db.publishRun(run,[f.filing_id]);
   const rev0=(await db.stateRevs([iss],'US'))[0].state_rev;
   const pair=newPair();const w=await h.batch();
   const c1=await cycle(pair,[{issuer_id:iss,keys:['k1']}]);const f1=(await db.claimReconcileMember(pair,c1,iss,'US',w))!;
   const o1=await db.applyReconcileResult(f1,res('k1',{action:'quarantine_left',left_fact_id:qd.fact_id}));
   expect(o1).toMatchObject({reused:false,quarantined:0,materialize:null});expect(o1.itemId).not.toBeNull();
   expect((await db.stateRevs([iss],'US'))[0].state_rev).toBe(rev0);
   const [it]=await h.tables.select('dq_quarantine',{id:o1.itemId!});
   expect(it).toMatchObject({status:'open',reason_code:'reconcile_mismatch',natural_key:`${pair}:k1:${qd.fact_id}`});
   expect((it.detail as Record<string,unknown>).hook).toBeUndefined();
   await db.completeReconcileMember(f1);await closeCycle(pair,c1);
   const c2=await cycle(pair,[{issuer_id:iss,keys:['k1']}]);const f2=(await db.claimReconcileMember(pair,c2,iss,'US',w))!;
   const o2=await db.applyReconcileResult(f2,res('k1',{action:'quarantine_left',left_fact_id:qd.fact_id,inputs_hash:'h9'}));
   expect(o2.itemId).toBe(o1.itemId);expect(o2.quarantined).toBe(0);
   expect(((await h.tables.select('dq_quarantine',{id:o1.itemId!}))[0].detail as {latest_result:{inputs_hash:string}}).latest_result.inputs_hash).toBe('h9');
  });

  it('plan 3 openReconcileCycle pending transfer: entries from several finished cycles move once, an unlisted entry stays, duplicate keys / non-uuid ids / pending outside the members are invalid_members and write nothing',async()=>{
   const pair=newPair();const t1=await h.issuer(),t2=await h.issuer(),t3=await h.issuer();const at=()=>new Date().toISOString();
   const mk=(i:string,source=randomUUID())=>({issuer_id:i,market:'US' as const,source});
   const e1=mk(t1),e1b=mk(t1),e2=mk(t2),e3=mk(t3);
   const old=(id:string,pend:object[])=>h.tables.insert('dq_reconcile_cycles',{pair,cycle_id:`${pair}-${id}`,started_at:at(),finished_at:at(),members:[],status:'complete',expected_total:0,compared_passed:0,compared_failed:0,not_compared:0,exec_failed_members:0,detail:{pending_members:pend}});
   await old('a',[e1,e2]);await old('b',[e1b,e3]);
   const m=(i:string,keys:string[])=>({issuer_id:i,market:'US' as const,expected_keys:keys.map(naturalKey=>({naturalKey,locator:{}}))});
   // refused: duplicate natural key across members, non-uuid id, pending entry whose member is absent
   for(const input of [
    {members:[m(t1,['k']),m(t2,['k'])],pending:[e1]},
    {members:[{...m(t1,['k']),issuer_id:'not-a-uuid'}],pending:[]},
    {members:[m(t1,['k'])],pending:[e2]}]){
    expect(await code(db.openReconcileCycle({pair,cycleId:`${pair}-bad`,startedAt:at(),...input}))).toMatch(/^invalid_members/);
   }
   expect(await h.tables.select('dq_reconcile_cycles',{pair,cycle_id:`${pair}-bad`})).toEqual([]);
   expect((await h.tables.select('dq_reconcile_cycles',{pair,cycle_id:`${pair}-a`}))[0].detail).toEqual({pending_members:[e1,e2]});
   // accepted: e1 (cycle a), e1b and e3 (cycle b); e2 is not listed and stays
   const out=await db.openReconcileCycle({pair,cycleId:`${pair}-new`,startedAt:at(),members:[m(t1,['x1']),m(t3,['x2'])],pending:[e1,e1b,e3]});
   expect(out.created).toBe(true);expect(out.transferred).toHaveLength(3);
   expect(out.cycle).toMatchObject({expected_total:2,detail:{pending_merged_from:[`${pair}-a`,`${pair}-b`]}});
   expect((await h.tables.select('dq_reconcile_cycles',{pair,cycle_id:`${pair}-a`}))[0].detail).toEqual({pending_members:[e2],pending_consumed_by:`${pair}-new`});
   expect((await h.tables.select('dq_reconcile_cycles',{pair,cycle_id:`${pair}-b`}))[0].detail).toEqual({pending_members:[],pending_consumed_by:`${pair}-new`});
   expect((await h.tables.select('dq_reconcile_cursor',{pair,cycle_id:`${pair}-new`})).map(c=>c.issuer_id).sort()).toEqual([t1,t3].sort());
  });


  // ---- plan 3, Codex round: strengthened cases (hard-coded expectations, no readFacts oracle)
  it('plan 3 readFactsLineage includeNonOk: quarantined rows appear only with includeNonOk AND history, never as current, without sequence; staged rows never appear',async()=>{
   const {iss:t,b,r0,r}=await published();
   const run=await db.beginRun(t,'US',b,1);const fq=filingInsert(t,{availableDate:'2024-03-01'});await db.stageFilings(run,[fq]);
   const q=factInsert(t,fq,{value:'300'});await db.stageFacts(run,[q]);
   const item=await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${t}:US:IS:${randomUUID()}`,reasonCode:'identity_gp',batchId:b,payload:{key:{},fact_ids:[q.fact_id],run_id:run}});
   expect(await db.quarantineFacts(run,[q.fact_id],item)).toBe(1);expect(await db.publishRun(run,[fq.filing_id])).toBe(0);   // the only fact is quarantined
   const run2=await db.beginRun(t,'US',b,1);const fs=filingInsert(t,{availableDate:'2024-04-01'});await db.stageFilings(run2,[fs]);
   const st=factInsert(t,fs,{value:'400'});await db.stageFacts(run2,[st]);   // left staged
   const rd=async(o:{history:boolean;includeNonOk:boolean})=>(await db.readFactsLineage([t],'US',{concepts:['revenue'],asOf:'2030-01-01',...o})).rows.map(y=>[y.fact_id,y.disclosure_seq??null,y.is_current,y.is_revision]);
   expect(await rd({history:false,includeNonOk:false})).toEqual([[r,2,true,true]]);
   expect(await rd({history:false,includeNonOk:true})).toEqual([[r,2,true,true]]);
   expect(await rd({history:true,includeNonOk:false})).toEqual([[r0,1,false,false],[r,2,true,true]]);
   expect(await rd({history:true,includeNonOk:true})).toEqual([[r0,1,false,false],[r,2,true,true],[q.fact_id,null,false,false]]);
   expect((await db.readFactsLineage([t],'US',{concepts:['revenue'],asOf:'2030-01-01',history:true,includeNonOk:true})).rows.map(y=>y.status)).toEqual(['ok','ok','quarantined']);
  });

  it('plan 3 replaceMetricsLineage: a stale revision of ONLY the non-target member is stale_computation and the stored metrics stay',async()=>{
   const {iss:t,r}=await published();const by=await h.user();const s=await h.issuer();await db.setMerge(s,t,by);
   const row=(v:string):MetricRow=>({issuer_id:t,market:'US',metric:'gross_margin',period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:v,unit:'ratio',input_unit:'USD',basis:'us_standard',formula_version:'facts-derive/1.0',
    inputs:[{fact_id:r,concept:'revenue',filing_id:'f',available_date:'2024-02-01'}],based_on_rev:0,based_on_lineage:[],as_of:'2024-03-01'});
   const lin=await db.stateRevs(await db.lineageOf(t),'US');
   expect(await db.replaceMetricsLineage(t,'US',lin,[row('0.5')])).toBe(1);
   const before=await db.metricsOfIssuer(t,'US','facts-derive/1.0');
   const skew=lin.map(x=>x.issuer_id===t?x:{...x,state_rev:x.state_rev+1});
   expect(skew.find(x=>x.issuer_id===t)).toEqual(lin.find(x=>x.issuer_id===t));
   expect(await code(db.replaceMetricsLineage(t,'US',skew,[row('0.9')]))).toBe('stale_computation:stale_computation');
   expect(await db.metricsOfIssuer(t,'US','facts-derive/1.0')).toEqual(before);
  });

  /** An ambiguous_value item for a 2023-07-01..09-30 revenue candidate on the published filing, plus the pieces to dispute its key. */
  const adoptSetup=async()=>{
   const {iss:t,b,run,f}=await published();const by=await h.user();const ab=await h.batch();
   const cand={concept:'revenue',sourceConcept:'us-gaap:Revenues',statement:'IS',periodStart:'2023-07-01',periodEnd:'2023-09-30',duration:'3M',value:'110',unit:'USD',consolidation:'consolidated',filingRef:f.sourceRef,rawHash:'h-110'};
   const item=await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${t}:US:revenue:2023-07-01:2023-09-30:consolidated:USD:${f.sourceRef}:1`,reasonCode:'ambiguous_value',batchId:b,
    payload:{key:{issuer_id:t,market:'US',concept:'revenue',period_start:'2023-07-01',period_end:'2023-09-30',consolidation:'consolidated',unit:'USD'},candidates:[cand],run_id:run}});
   const rev=(await db.stateRevs([t],'US'))[0].state_rev;
   const expectRefused=async()=>{
    expect(await code(db.adoptCandidate(item,0,ab,rev,by))).toBe('conflict_exists:conflict_exists');
    expect((await h.tables.select('dq_quarantine',{id:item}))[0].status).toBe('open');
    expect((await db.stateRevs([t],'US'))[0].state_rev).toBe(rev);
    expect((await db.readFactsLineage([t],'US',{concepts:['revenue'],asOf:'2030-01-01',history:true,includeNonOk:true,from:'2023-09-30',to:'2023-09-30'})).rows).toEqual([]);   // no fact inserted
   };
   return {t,b,expectRefused};
  };

  it('plan 3 adoptCandidate: an open same_day_conflict for the key and date refuses adoption although no ok competitor remains',async()=>{
   const {t,b,expectRefused}=await adoptSetup();
   await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${t}:US:revenue:2023-07-01:2023-09-30:consolidated:USD:2024-02-01`,reasonCode:'same_day_conflict',batchId:b,
    payload:{key:{issuer_id:t,market:'US',concept:'revenue',period_start:'2023-07-01',period_end:'2023-09-30',consolidation:'consolidated',unit:'USD',available_date:'2024-02-01'},fact_ids:[],values:[]}});
   await expectRefused();
  });

  it('plan 3 adoptCandidate: an open lineage_conflict for the key and date refuses adoption although no ok competitor remains',async()=>{
   const {t,b,expectRefused}=await adoptSetup();
   await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${t}:revenue:2023-07-01:2023-09-30:consolidated:USD:2024-02-01`,reasonCode:'lineage_conflict',batchId:b,payload:{fact_ids:[],values:[]}});
   await expectRefused();
  });

 });
}

exec
/bin/zsh -lc 'for p in /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do test ! -f "$p" || { echo "$p"; cat "$p"; }; done; cat package.json; rg -n '"'stateRevs|readFactsLineage|replaceMetricsLineage' src/lib/facts/db.ts; ls src/lib/facts/*db*; find src -name '*AGENTS*'; git status --short" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>{
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
93: return {stateRevs:lineageRevsFrom(env.state_revs),lineage:Array.isArray(env.lineage)?env.lineage.map(String):[],rows:(env.rows??[]).map(rowFromEnvelope),
245:  async stateRevs(issuers,market){
250:  async readFactsLineage(issuers,market,opts){return lineageResultFromEnvelope(await call<ReadFactsLineageEnvelope>('read_facts_lineage',readLineageArgs(issuers,market,opts)));},
252:  async replaceMetricsLineage(issuer,market,basedOn,input){return Number(await call<unknown>('replace_financial_metrics_lineage',{p_issuer:issuer,p_market:market,p_based_on:basedOn,p_rows:input.map(metricArgs)}));},
src/lib/facts/db-contract.ts
src/lib/facts/db.test.ts
src/lib/facts/db.ts
src/lib/facts/memory-facts-db.ts
src/lib/facts/pg-facts-db.ts
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-BVEpPLuH' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-Yke7Q2iP' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/9b-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/9b-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/9b-review.md

exec
/bin/zsh -lc "rg -n 'stateRevs|replaceMetricsLineage|includeNonOk|conflict_exists' src/lib/facts/memory-facts-db.ts; sed -n '1,85p' src/lib/facts/db.test.ts; rg -n 'state_revs|replace_financial_metrics_lineage' supabase/migrations/* | tail -18; ls node_modules/.bin/vitest; cat vitest.config.*" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
52:const ASYNC_METHODS=['claimLease','beginRun','stageFilings','stageFacts','quarantineFacts','publishRun','abandonRun','releaseLease','resolveFactsQuarantine','replaceMetrics','readFacts','factsByIds','openConflicts','filingsOfIssuer','updateFilingLink','reconcileScope','scopeDue','scopeRows','scopeAll','metricsOfIssuer','targetOf','lineageOf','stateRevs','readFactsLineage','readFilingFacts','replaceMetricsLineage','findFilingBySourceRef','filingsForCalendar','setFilingAcceptance','adoptCandidate','restoreReconciled','resolveLineageConflict','claimReconcileMember','applyReconcileResult','completeReconcileMember','failReconcileMember','openReconcileCycle','setMerge','setDissolved'] as const satisfies readonly (keyof FactsDb)[];
213:  const stateRevs:LineageRev[]=set.map(i=>({issuer_id:i,state_rev:scopeOf(i,market)?.state_rev??0}));
215:   &&(o.from===undefined||f.period_end>=o.from)&&(o.to===undefined||f.period_end<=o.to)&&(f.status==='ok'||o.includeNonOk===true)&&visible(f));
239:  if(picked.length>READ_FACTS_CAP)return {stateRevs,lineage:set,rows:[],conflicts,truncated:true};
240:  return {stateRevs,lineage:set,rows:picked,conflicts,truncated:false};
390:  async readFacts(issuer,market,o){const r=readLineage([issuer],market,o);return {stateRev:r.stateRevs[0].state_rev,rows:r.rows,truncated:r.truncated};},
442:  async stateRevs(issuers,market){return [...new Set(issuers.map(i=>i.toLowerCase()))].sort(cmp).map(i=>({issuer_id:i,state_rev:scopeOf(i,market)?.state_rev??0}));},
444:  async readFilingFacts(filingId,includeNonOk){
445:   const rows=[...facts.values()].filter(f=>f.filing_id===filingId&&(f.status==='ok'||includeNonOk));
449:  async replaceMetricsLineage(issuer,market,basedOn,input){return replaceLineage(issuer,market,basedOn,input);},
497:   if(okClash||disputed)throw new FactsDbError('conflict_exists');
702:  replaceMetrics:at(0),replaceMetricsLineage:at(0),filingsForCalendar:at(0),setDissolved:at(0),setMerge:at(0,1),claimReconcileMember:at(2),
703:  stateRevs:arr(0),readFactsLineage:arr(0),scopeRows:arr(1),
// src/lib/facts/db.test.ts
// memoryFactsDb against the shared contract, memory-only rules (clock, atomic validation), and the
// supabaseFactsDb wiring (rpc names/args, chunking, envelope normalisation, error mapping) over a
// stub client.
import {randomUUID} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {describe,expect,it} from 'vitest';
import {quarantine} from '../dq/quarantine';
import {FactsDbError,supabaseFactsDb,toFactsDbError} from './db';
import {factInsert,factsDbContract,filingInsert} from './db-contract';
import {memoryFactsDb,numericEquals} from './memory-facts-db';

factsDbContract('memoryFactsDb contract',async()=>{
 const db=memoryFactsDb();
 return {db,tables:db.tables,issuer:async()=>randomUUID(),
  batch:async()=>{const id=randomUUID();await db.tables.insert('ingest_batches',{batch_id:id,producer:'facts-sync',dataset:'facts.us',status:'running'});return id;},
  user:async()=>randomUUID(),
  expireLease:async(i,m)=>db.expireLease(i,m),
  expireReconcileClaim:async(pair,cycleId,issuer,market)=>{await db.tables.update('dq_reconcile_cursor',{pair,cycle_id:cycleId,issuer_id:issuer,market},{claim_until:'1970-01-01T00:00:00.000Z'});}};
});

describe('memoryFactsDb specifics',()=>{
 it('expires leases against the injected clock',async()=>{
  const db=memoryFactsDb();const iss=randomUUID();const b1=randomUUID();const b2=randomUUID();
  db.setNow('2026-01-01T00:00:00.000Z');
  await db.reconcileScope('US',[{issuer_id:iss,reasons:[],priority:1,fetch_key:'k'}]);
  expect(await db.claimLease(iss,'US',b1,60)).toBe(true);
  db.setNow('2026-01-01T00:00:59.000Z');expect(await db.claimLease(iss,'US',b2,60)).toBe(false);
  db.setNow('2026-01-01T00:01:00.000Z');expect(await db.claimLease(iss,'US',b2,60)).toBe(true);
  await expect(db.beginRun(iss,'US',b1,1)).rejects.toMatchObject({code:'lease_lost'});
  expect(db.scope()[0]).toMatchObject({lease_batch_id:b2,lease_until:'2026-01-01T00:02:00.000Z'});
 });
 it('validates a stageFacts batch before writing any row, like one SQL statement',async()=>{
  const db=memoryFactsDb();const iss=randomUUID();const b=randomUUID();
  await db.reconcileScope('US',[{issuer_id:iss,reasons:[],priority:1,fetch_key:'k'}]);await db.claimLease(iss,'US',b,60);
  const run=await db.beginRun(iss,'US',b,1);const f=filingInsert(iss);await db.stageFilings(run,[f]);
  const good=factInsert(iss,f);
  await expect(db.stageFacts(run,[good,factInsert(iss,f,{period_start:'2023-12-31'})])).rejects.toMatchObject({code:'unknown',message:'financial_facts_period'});
  await expect(db.stageFacts(run,[factInsert(iss,f,{duration:'INSTANT'})])).rejects.toMatchObject({message:'financial_facts_instant'});
  await expect(db.stageFacts(run,[factInsert(iss,f,{available_date:'2024-02-02'})])).rejects.toMatchObject({message:'financial_facts_filing_date_fkey'});
  await expect(db.stageFacts(run,[factInsert(iss,f,{filing_id:randomUUID()})])).rejects.toMatchObject({message:'financial_facts_filing_fkey'});
  expect(db.facts()).toEqual([]);
  expect(await db.stageFacts(run,[good])).toBe(1);
  await expect(db.stageFacts(run,[{...factInsert(iss,f,{concept:'net_income'}),fact_id:good.fact_id}])).rejects.toMatchObject({code:'duplicate_key'});
 });
 it('serializes operations: concurrent quarantineFacts keep both members; a read during publish never sees new rows with the old state_rev',async()=>{
  const db=memoryFactsDb();const iss=randomUUID();const b=randomUUID();
  await db.reconcileScope('US',[{issuer_id:iss,reasons:[],priority:1,fetch_key:'k'}]);await db.claimLease(iss,'US',b,60);
  const run=await db.beginRun(iss,'US',b,1);const f=filingInsert(iss);await db.stageFilings(run,[f]);
  const c1=factInsert(iss,f,{value:'1'});const c2=factInsert(iss,f,{concept:'net_income',value:'2'});await db.stageFacts(run,[c1,c2]);
  const item=await quarantine(db.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${iss}:US:x:2024-02-01`,reasonCode:'same_day_conflict',batchId:b,payload:{key:{},fact_ids:[],run_id:run}});
  expect(await Promise.all([db.quarantineFacts(run,[c1.fact_id],item),db.quarantineFacts(run,[c2.fact_id],item)])).toEqual([1,1]);
  expect(((await db.tables.select('dq_quarantine',{id:item}))[0].payload as {fact_ids:string[]}).fact_ids.sort()).toEqual([c1.fact_id,c2.fact_id].sort());
  const run2=await db.beginRun(iss,'US',b,1);const g=filingInsert(iss);await db.stageFilings(run2,[g]);
  await db.stageFacts(run2,[factInsert(iss,g,{concept:'net_income',value:'9'})]);
  const [n,seen]=await Promise.all([db.publishRun(run2,[g.filing_id]),db.readFacts(iss,'US',{concepts:['net_income'],asOf:'2030-01-01'})]);
  expect(n).toBe(1);expect(seen.rows.length).toBe(seen.stateRev);   // (0 rows, rev 0) or (1 row, rev 1)
  expect((await db.readFacts(iss,'US',{concepts:['net_income'],asOf:'2030-01-01'})).stateRev).toBe(1);
 });
 it('shares dq_quarantine with the TableClient it was given',async()=>{
  const db=memoryFactsDb();
  await db.tables.insert('dq_quarantine',{id:'i1',dataset:'facts.us',table_name:'financial_facts',natural_key:'a:US:x',reason_code:'same_day_conflict',status:'open',payload:{key:{available_date:'2024-01-01'},fact_ids:['f1']},detail:{},batch_id:'b',created_at:'2026-01-01T00:00:00.000Z'});
  expect(await db.openConflicts('a','US')).toEqual([{id:'i1',natural_key:'a:US:x',fact_ids:['f1'],available_date:'2024-01-01',key:{available_date:'2024-01-01'}}]);
  expect(await db.openConflicts('b','US')).toEqual([]);
 });
});

describe('numericEquals',()=>{
 it('compares canonical decimal strings as numeric would',()=>{
  expect(numericEquals('100','100.000')).toBe(true);
  expect(numericEquals('-0','0')).toBe(true);
  expect(numericEquals('0100','100')).toBe(true);
  expect(numericEquals('1.50','1.5')).toBe(true);
  expect(numericEquals('12345678901234567890','12345678901234567891')).toBe(false);
  expect(numericEquals('1','2')).toBe(false);
  expect(numericEquals('-1','1')).toBe(false);
 });
});

describe('toFactsDbError',()=>{
 it('maps SQLSTATE and the code-as-message convention',()=>{
  expect(toFactsDbError({message:'lease_lost',code:'55P03'})).toMatchObject({name:'FactsDbError',code:'lease_lost'});
  expect(toFactsDbError({message:'canceling statement due to lock timeout',code:'55P03'}).code).toBe('lease_lost');
  for(const c of ['run_pending','run_published','mapping_gen_regression','stale_computation','stale_plan'])expect(toFactsDbError({message:c,code:'P0001'}).code).toBe(c);
  expect(toFactsDbError({message:'duplicate key value violates unique constraint "filings_pkey"',code:'23505'}).code).toBe('duplicate_key');
supabase/migrations/20261107091000_facts_extensions.sql:8:--  3. replace_financial_metrics_lineage: locks every member scope row in (issuer_id, market) order,
supabase/migrations/20261107091000_facts_extensions.sql:111:create or replace function public.replace_financial_metrics_lineage(p_issuer uuid, p_market text, p_based_on jsonb, p_rows jsonb)
supabase/migrations/20261107091000_facts_extensions.sql:155:revoke execute on function public.replace_financial_metrics_lineage(uuid, text, jsonb, jsonb) from public, anon, authenticated;
supabase/migrations/20261107091000_facts_extensions.sql:156:grant execute on function public.replace_financial_metrics_lineage(uuid, text, jsonb, jsonb) to service_role;
supabase/migrations/20261107091000_facts_extensions.sql:171:  return public.replace_financial_metrics_lineage(p_issuer, p_market, jsonb_build_array(jsonb_build_object('issuer_id', p_issuer, 'state_rev', p_based_on_rev)), p_rows);
supabase/migrations/20261107091000_facts_extensions.sql:197:-- Envelope {state_revs (issuer_id asc), lineage (asc), rows, conflicts, truncated, row_count}.
supabase/migrations/20261107091000_facts_extensions.sql:252:  'state_revs', (select coalesce(jsonb_agg(jsonb_build_object('issuer_id', m.issuer_id, 'state_rev', public.fact_state_rev(m.issuer_id, p_market)) order by m.issuer_id), '[]'::jsonb) from members m),
supabase/migrations/20261107091000_facts_extensions.sql:273:    'state_rev', coalesce(x.v -> 'state_revs' -> 0 -> 'state_rev', to_jsonb(public.fact_state_rev(p_issuer, p_market))),
node_modules/.bin/vitest
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});

exec
/bin/zsh -lc "sed -n '111,155p' supabase/migrations/20261107091000_facts_extensions.sql; sed -n '208,240p' src/lib/facts/memory-facts-db.ts; sed -n '474,500p' src/lib/facts/memory-facts-db.ts; sed -n '215,252p' supabase/migrations/20261107091000_facts_extensions.sql" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
create or replace function public.replace_financial_metrics_lineage(p_issuer uuid, p_market text, p_based_on jsonb, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare v_members uuid[]; v_norm jsonb; v_locked int; v_lineage uuid[]; v_rev bigint; n int;
begin
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
  select state_rev into v_rev from public.fact_sync_scope where issuer_id = p_issuer and market = p_market;
  delete from public.financial_metrics where issuer_id = p_issuer and market = p_market;
  insert into public.financial_metrics (issuer_id, market, metric, period_start, period_end, duration, value, unit, input_unit, basis, formula_version, inputs, based_on_rev, based_on_lineage, as_of)
  select p_issuer, p_market, x ->> 'metric', (x ->> 'period_start')::date, (x ->> 'period_end')::date, x ->> 'duration', (x ->> 'value')::numeric,
         x ->> 'unit', x ->> 'input_unit', x ->> 'basis', x ->> 'formula_version', coalesce(x -> 'inputs', '[]'::jsonb), v_rev, v_norm, (x ->> 'as_of')::date
  from jsonb_array_elements(p_rows) x;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.replace_financial_metrics_lineage(uuid, text, jsonb, jsonb) from public, anon, authenticated;
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
   const market:Market=it.dataset===DATASETS.facts('US')?'US':'CN';const source=market==='US'?'edgar':'tushare';
   const g=[...filings.values()].find(x=>x.source===source&&x.source_ref===c.filingRef);
   if(!g||g.market!==market)throw new FactsDbError('filing_not_found');
   const anchor=runIdOf(it);const r=anchor!==null&&UUID.test(anchor)?runs.get(anchor):undefined;
   if(!r)throw new FactsDbError('generation_moved');
   const gen=r.mapping_gen;const nkGen=Number(/:([0-9]+)$/.exec(String(it.natural_key))?.[1]??Number.NaN);
   if(nkGen!==gen||g.mapping_gen!==gen||gen<=0||r.market!==g.market)throw new FactsDbError('generation_moved');
   let versions=new Set([...facts.values()].filter(f=>f.run_id===r.run_id).map(f=>f.mapping_version));
   if(versions.size===0)versions=new Set([...facts.values()].filter(f=>f.filing_id===g.filing_id&&f.mapping_gen===gen).map(f=>f.mapping_version));
   if(versions.size!==1)throw new FactsDbError('replay_required');
   const b=await batchRow(batchId);
   if(!b||b.status!=='running'||b.dataset!==it.dataset)throw new FactsDbError('batch_mismatch');
   const t=topoOf(g.issuer_id).merged_into??g.issuer_id;const lin=lineageMembers(t);
   if(lin.some(i=>!scopeOf(i,g.market)))throw new FactsDbError('scope_missing');
   if(!lin.includes(g.issuer_id)||topoOf(t).status!=='active')throw new FactsDbError('lineage_changed');
   const s=scopeOf(g.issuer_id,g.market);if(!s)throw new FactsDbError('scope_missing');
   if(s.state_rev!==expectedRev)throw new FactsDbError('stale_evaluation');
   const k:KeyPart={concept:c.concept,period_start:c.periodStart,period_end:c.periodEnd,consolidation:c.consolidation,unit:c.unit};
   if([...facts.values()].some(f=>f.issuer_id===g.issuer_id&&keyOf(f)===keyOf(k)&&f.filing_id===g.filing_id&&f.mapping_gen===gen))throw new FactsDbError('duplicate');
   const open=await items({status:'open'});
   const okClash=[...facts.values()].some(f=>lin.includes(f.issuer_id)&&f.market===g.market&&f.status==='ok'&&visible(f)&&keyOf(f)===keyOf(k)&&f.available_date===g.available_date&&!numericEquals(f.value,c.value));
   const disputed=open.some(i=>i.reason_code==='same_day_conflict'&&disputesKey(i,lin,g.market,k,g.available_date))
    ||open.some(i=>i.reason_code==='lineage_conflict'&&i.natural_key===`${t}:${factKey(k)}:${g.available_date}`);
   if(okClash||disputed)throw new FactsDbError('conflict_exists');
   const run_id=randomUUID(),fact_id=randomUUID(),t0=now();
   runs.set(run_id,{run_id,issuer_id:g.issuer_id,market:g.market,batch_id:batchId,mapping_gen:gen,status:'published',manifest:[],started_at:t0,published_at:t0});
   facts.set(fact_id,{fact_id,issuer_id:g.issuer_id,market:g.market,filing_id:g.filing_id,run_id,concept:c.concept,source_concept:c.sourceConcept,statement:c.statement,period_start:c.periodStart,period_end:c.periodEnd,duration:c.duration,
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

exec
/bin/zsh -lc "rg -n -A24 'async setMerge' src/lib/facts/memory-facts-db.ts; rg -n 'insert into public.fact_sync_scope' supabase/migrations/2026110709*; git rev-parse HEAD" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
668:  async setMerge(source,target,resolvedBy){
669-   if(!source||!target||source===target)throw unknown('invalid_merge');
670-   if(!resolvedBy)throw unknown('invalid_resolver');
671-   if(topoOf(source).status!=='active')throw new FactsDbError('source_not_active');
672-   if(topoOf(target).status!=='active')throw unknown('merge_target_not_active');
673-   const set=[...new Set([source,target,...referrers(source),...referrers(target)])];
674-   for(const i of set)for(const m of MARKETS)ensureScope(i,m);
675-   const refs=referrers(source);
676-   for(const r of refs)topo.set(r,{...topoOf(r),merged_into:target});
677-   topo.set(source,{status:'merged',merged_into:target});
678-   for(const i of set)for(const m of MARKETS)bump(i,m);
679-   await registerPending(target,source);
680-   return {repointed:refs.length};
681-  },
682-  async setDissolved(issuer,resolvedBy){
683-   if(!resolvedBy)throw unknown('invalid_resolver');
684-   if(referrers(issuer).length>0)throw new FactsDbError('has_referrers');
685-   if(topoOf(issuer).status!=='active')throw new FactsDbError('source_not_active');
686-   for(const m of MARKETS)ensureScope(issuer,m);
687-   topo.set(issuer,{status:'dissolved',merged_into:null});
688-   for(const m of MARKETS)bump(issuer,m);
689-  },
690- };
691- // Every FactsDb method (reads included) runs through one promise chain per instance, so no operation
692- // observes or interleaves with another's partial writes across awaits (SQL: one transaction each).
supabase/migrations/20261107091000_facts_extensions.sql:287:  insert into public.fact_sync_scope (issuer_id, market, reasons, priority, fetch_key)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-zsakwi2L' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-F8lIKfsT' (errno=Operation not permitted)
a56c7bfdba639be1ac1d7dd5f641efacbf2697c7

codex
The added contract tests match the existing memory and PostgreSQL implementation semantics. No actionable defects were identified. Tests were not executed in the read-only environment.
The added contract tests match the existing memory and PostgreSQL implementation semantics. No actionable defects were identified. Tests were not executed in the read-only environment.

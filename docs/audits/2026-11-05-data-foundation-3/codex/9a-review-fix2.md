OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b080-bf8f-7b63-b814-1c66fb360845
--------
user
commit fe4d167
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline fe4d167; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 530ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-UpCpNvUF' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-OVuE8qMk' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/9a-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/9a-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/9a-review-fix2.md
?? docs/audits/2026-11-05-data-foundation-3/codex/9a-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-c3rbthan' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-JXrGPVj9' (errno=Operation not permitted)
fe4d167 fix(facts): apply_reconcile_result side checks as invalid_result; keyset calendar read; memory parity (9a quality review)
 src/lib/dq/dq-extensions.integration.test.ts       |  7 ++++++
 src/lib/facts/db.test.ts                           | 26 +++++++++++++++++----
 src/lib/facts/db.ts                                | 27 ++++++++++++++++++----
 src/lib/facts/memory-facts-db.ts                   | 14 ++++++-----
 src/lib/facts/types.ts                             |  2 +-
 supabase/migrations.lock.json                      |  2 +-
 .../migrations/20261107091000_facts_extensions.sql |  6 +++++
 7 files changed, 66 insertions(+), 18 deletions(-)

exec
/bin/zsh -lc 'git show fe4d167; for p in /AGENTS.md /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do if [ -f "$p" ]; then echo "$p"; cat "$p"; fi; done; ls -a | head -30' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-wFshwqGj' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-QW5YlNsA' (errno=Operation not permitted)
commit fe4d167b2c7fcce2df27103867d1d6ab5bddb16c
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 02:56:17 2026 -0800

    fix(facts): apply_reconcile_result side checks as invalid_result; keyset calendar read; memory parity (9a quality review)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/dq/dq-extensions.integration.test.ts b/src/lib/dq/dq-extensions.integration.test.ts
index 7f6cb74..1568c61 100644
--- a/src/lib/dq/dq-extensions.integration.test.ts
+++ b/src/lib/dq/dq-extensions.integration.test.ts
@@ -737,6 +737,13 @@ describe.skipIf(!enabled)('F3-4 facts extensions migration on real PostgreSQL',(
    expect(await fails(apply(fence,res('k0',{action:'quarantine_left'})))).toMatchObject({message:'invalid_result'});      // left_fact_id required
    expect(await fails(apply(fence,res('k0',{action:'review_item'})))).toMatchObject({message:'invalid_result'});          // item required
    expect(await fails(apply(fence,res('k0',{left_value:'1e5x'})))).toMatchObject({message:'invalid_result'});
+   // dq_reconciliations_numeric_sides / _nonnumeric_sides surface as invalid_result (22023), not 23514, and write nothing
+   expect(await fails(apply(fence,res('k0',{right_value:null})))).toMatchObject({message:'invalid_result',code:'22023'});
+   expect(await fails(apply(fence,res('k0',{left_value:null})))).toMatchObject({message:'invalid_result',code:'22023'});
+   expect(await fails(apply(fence,res('k0',{kind:'text'})))).toMatchObject({message:'invalid_result',code:'22023'});           // numeric fields on a text compare
+   expect(await fails(apply(fence,res('k0',{kind:'date',left_value:null,right_value:null,abs_diff:'1',rel_diff:null})))).toMatchObject({message:'invalid_result',code:'22023'});
+   expect(await fails(apply(fence,res('k0',{kind:'text',left_value:null,right_value:null,abs_diff:null,rel_diff:'0',action:'quarantine_left',left_fact_id:r})))).toMatchObject({message:'invalid_result',code:'22023'});
+   expect(await status(r)).toBe('ok');
    expect(await resultRows(pair)).toEqual([]);
    const run2=await begin(iss,b);const g=await filing(run2);const [st]=await stage(run2,[{filing_id:g.id,concept:'net_income',value:'3'}]);
    expect(await apply(fence,res('k1',{action:'quarantine_left',left_fact_id:st}))).toMatchObject({quarantined:0,item_id:null,materialize:null});   // staged: recorded only
diff --git a/src/lib/facts/db.test.ts b/src/lib/facts/db.test.ts
index d9b13b9..294234b 100644
--- a/src/lib/facts/db.test.ts
+++ b/src/lib/facts/db.test.ts
@@ -284,14 +284,17 @@ describe('supabaseFactsDb',()=>{
   const N=1250;const status=(i:number)=>['published','staged','abandoned'][i%3];
   const mk=(i:number,over:Record<string,unknown>={})=>({filing_id:`g${String(i).padStart(5,'0')}`,issuer_id:'I',market:'US',run_id:`r${i}`,period_end:`2024-${String(1+i%12).padStart(2,'0')}-28`,available_date:'2024-06-01',mapping_gen:i%4,created_at:'2024-06-01T00:00:00+00:00',accepted_at:null,...over});
   const all=[...Array.from({length:N},(_,i)=>mk(i)),mk(5000,{issuer_id:'OTHER'}),mk(5001,{market:'CN'}),mk(5002,{period_end:'2023-12-31'})];
-  const runIn:number[]=[];
+  const runIn:number[]=[];let filingPages=0;
   const {db}=stub(()=>({data:null}),(table,ops)=>{
    const eq=(c:string)=>ops.filter(o=>o[0]==='eq'&&o[1][0]===c).map(o=>o[1][1]);
    if(table==='filings'){
-    const rows=all.filter(r=>eq('issuer_id').every(v=>r.issuer_id===v)&&eq('market').every(v=>r.market===v)&&ops.filter(o=>o[0]==='gte').every(o=>String(r.period_end)>=String(o[1][1])))
-     .sort((a,b)=>a.period_end<b.period_end?-1:a.period_end>b.period_end?1:a.filing_id<b.filing_id?-1:1);
-    const [from,to]=ops.find(o=>o[0]==='range')![1] as [number,number];
-    return rows.slice(from,to+1);
+    const after=ops.filter(o=>o[0]==='gt'&&o[1][0]==='filing_id').map(o=>String(o[1][1]));
+    const limit=Number(ops.find(o=>o[0]==='limit')![1][0]);
+    expect(ops.some(o=>o[0]==='order'&&o[1][0]==='filing_id')).toBe(true);
+    const rows=all.filter(r=>eq('issuer_id').every(v=>r.issuer_id===v)&&eq('market').every(v=>r.market===v)&&ops.filter(o=>o[0]==='gte').every(o=>String(r.period_end)>=String(o[1][1]))&&after.every(a=>r.filing_id>a))
+     .sort((a,b)=>a.filing_id<b.filing_id?-1:1);
+    filingPages++;
+    return rows.slice(0,limit);
    }
    if(table==='fact_sync_runs'){
     const ids=ops.find(o=>o[0]==='in')![1][1] as string[];runIn.push(ids.length);
@@ -304,9 +307,22 @@ describe('supabaseFactsDb',()=>{
   expect(out).toHaveLength(N);
   expect(new Set(out.map(f=>f.filing_id)).size).toBe(N);
   expect(out.some(f=>f.issuer_id!=='I'||f.market!=='US'||(f.period_end??'')<'2024-01-01')).toBe(false);
+  expect(filingPages).toBe(2);                                                          // 1,000 + 250: keyset pages
+  expect(out.map(f=>[f.period_end,f.available_date,f.filing_id])).toEqual([...out.map(f=>[f.period_end,f.available_date,f.filing_id])].sort());
   expect(runIn.length).toBeGreaterThan(1);expect(Math.max(...runIn)).toBeLessThanOrEqual(200);
   for(const f of out){const i=Number(f.filing_id.slice(1));expect(f.run_status).toBe(status(i));expect(f.mapping_gen).toBe(i%4);expect(f.run_id).toBe(`r${i}`);}
  });
+ it('filingsForCalendar omits a filing whose run row is missing; a keyset page that repeats a row is deduped',async()=>{
+  const g=(id:string,run:string)=>({filing_id:id,issuer_id:'I',market:'US',run_id:run,period_end:'2024-03-31',available_date:'2024-05-01',created_at:'2024-05-01T00:00:00+00:00'});
+  const {db}=stub(()=>({data:null}),table=>table==='filings'?[g('g1','r1'),g('g1','r1'),g('g2','gone')]:table==='fact_sync_runs'?[{run_id:'r1',status:'published'}]:[]);
+  expect((await db.filingsForCalendar('I','US',{fromPeriodEnd:'2024-01-01'})).map(f=>[f.filing_id,f.run_status])).toEqual([['g1','published']]);
+ });
+ it('malformed reconcile envelopes throw instead of becoming NaN / undefined fields',async()=>{
+  const {db}=stub(fn=>({data:fn==='apply_reconcile_result'?{reused:false}:fn==='complete_reconcile_member'?{compared_passed:'x',compared_failed:0,not_compared:0}:null}));
+  const fence={pair:'us.companyfacts_vs_ixbrl' as const,cycle_id:'c',issuer_id:'i',market:'US' as const,batch_id:'b',attempt:1};
+  await expect(db.applyReconcileResult(fence,{} as never)).rejects.toMatchObject({code:'unknown',message:expect.stringContaining('malformed')});
+  await expect(db.completeReconcileMember(fence)).rejects.toMatchObject({code:'unknown',message:expect.stringContaining('malformed')});
+ });
  it('metrics read compares the full based_on_lineage vector across pages: one rev but two vectors is unstable',async()=>{
   const row=(i:number,lineage:unknown)=>({issuer_id:'iss',market:'US',metric:`m${String(i).padStart(4,'0')}`,period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:1,value_text:'1',unit:'u',input_unit:'USD',basis:'us_standard',formula_version:'v',inputs:[],based_on_rev:2,based_on_lineage:lineage,as_of:'2024-01-01'});
   const a=[{issuer_id:'iss',state_rev:2}],b=[{issuer_id:'iss',state_rev:2},{issuer_id:'src',state_rev:5}];
diff --git a/src/lib/facts/db.ts b/src/lib/facts/db.ts
index 3175224..a2409fb 100644
--- a/src/lib/facts/db.ts
+++ b/src/lib/facts/db.ts
@@ -2,7 +2,8 @@
 // FactsDb (spec §4.8): the only data access the facts layer uses. Writes are SQL functions
 // (rpc) because no role may touch the fact tables directly (§4.7); reads that need no snapshot
 // use .from() under RLS (factsByIds, openConflicts, filingsOfIssuer, scopeDue, metricsOfIssuer,
-// targetOf, lineageOf, findFilingBySourceRef, filingsForCalendar,
+// targetOf, lineageOf, findFilingBySourceRef, filingsForCalendar (reads fact_sync_runs, which anon cannot see:
+// it needs a service-role client),
 // and the one column-level write updateFilingLink). The functions raise with the code as the
 // message (lease_lost 55P03; run_pending, run_published, mapping_gen_regression,
 // stale_computation P0001); toFactsDbError maps that, 23505 → duplicate_key, the rest → unknown.
@@ -102,11 +103,17 @@ export function fenceFromJson(x:unknown):Fence|null{
  return {pair:String(f.pair) as CyclePairId,cycle_id:String(f.cycle_id),issuer_id:String(f.issuer_id),market:f.market as Market,batch_id:String(f.batch_id),attempt:Number(f.attempt)};
 }
 export function applyOutcomeFromJson(x:unknown):ApplyReconcileOutcome{
- const o=(x??{}) as Record<string,unknown>;const m=o.materialize as {issuer_id?:unknown;market?:unknown}|null|undefined;
+ if(!x||typeof x!=='object'||Array.isArray(x)||typeof (x as Record<string,unknown>).reconciliation_id!=='string')throw new FactsDbError('unknown','malformed apply_reconcile_result envelope');
+ const o=x as Record<string,unknown>;const m=o.materialize as {issuer_id?:unknown;market?:unknown}|null|undefined;
  return {reused:o.reused===true,reconciliationId:String(o.reconciliation_id),itemId:o.item_id===null||o.item_id===undefined?null:String(o.item_id),quarantined:Number(o.quarantined)===1?1:0,
   materialize:m&&typeof m==='object'?{issuerId:String(m.issuer_id),market:m.market as Market}:null};
 }
-export const countsFromJson=(x:unknown):MemberCounts=>{const o=(x??{}) as Record<string,unknown>;return {compared_passed:Number(o.compared_passed),compared_failed:Number(o.compared_failed),not_compared:Number(o.not_compared)};};
+export const countsFromJson=(x:unknown):MemberCounts=>{
+ const o=(x&&typeof x==='object'&&!Array.isArray(x)?x:{}) as Record<string,unknown>;
+ const n=[o.compared_passed,o.compared_failed,o.not_compared].map(Number);
+ if(n.some(v=>!Number.isInteger(v)||v<0)||o.compared_passed===null||o.compared_failed===null||o.not_compared===null)throw new FactsDbError('unknown','malformed complete_reconcile_member envelope');
+ return {compared_passed:n[0],compared_failed:n[1],not_compared:n[2]};
+};
 /** open_reconcile_cycle envelope → OpenCycleResult (plan audit Q2); the cycle row is passed through as stored (to_jsonb). */
 export function openCycleFromJson(x:unknown):OpenCycleResult{
  const o=(x??{}) as {created?:unknown;cycle?:unknown;transferred?:unknown};
@@ -245,11 +252,21 @@ export function supabaseFactsDb(client:SupabaseClient):FactsDb{
   async replaceMetricsLineage(issuer,market,basedOn,input){return Number(await call<unknown>('replace_financial_metrics_lineage',{p_issuer:issuer,p_market:market,p_based_on:basedOn,p_rows:input.map(metricArgs)}));},
   async findFilingBySourceRef(source,sourceRef){const r=await rows<Record<string,unknown>>(c.from('filings').select('*').eq('source',source).eq('source_ref',sourceRef).limit(1));return r[0]?filingFromTable(r[0]):null;},
   async filingsForCalendar(issuer,market,opts){
-   const list=await pageAll<Record<string,unknown>>(()=>c.from('filings').select('*').eq('issuer_id',issuer).eq('market',market).gte('period_end',opts.fromPeriodEnd).order('period_end').order('available_date').order('filing_id'));
+   // keyset paging on filing_id (stable under concurrent inserts, unlike offsets), deduped, then ordered like pg
+   const byId=new Map<string,Record<string,unknown>>();
+   for(let after:string|null=null;;){
+    const part:Record<string,unknown>[]=await rows<Record<string,unknown>>((()=>{let q=c.from('filings').select('*').eq('issuer_id',issuer).eq('market',market).gte('period_end',opts.fromPeriodEnd);if(after!==null)q=q.gt('filing_id',after);return q.order('filing_id').limit(READ_PAGE);})());
+    for(const r of part)byId.set(String(r.filing_id),r);
+    if(part.length<READ_PAGE)break;
+    after=String(part[part.length-1].filing_id);
+   }
+   const str=(v:unknown)=>v===null||v===undefined?'':String(v);
+   const list=[...byId.values()].sort((a,b)=>str(a.period_end)<str(b.period_end)?-1:str(a.period_end)>str(b.period_end)?1:str(a.available_date)<str(b.available_date)?-1:str(a.available_date)>str(b.available_date)?1:str(a.filing_id)<str(b.filing_id)?-1:1);
    const status=new Map<string,string>();
    for(const part of chunkIds([...new Set(list.map(r=>String(r.run_id)))]))
     for(const r of await pageAll<{run_id:string;status:string}>(()=>c.from('fact_sync_runs').select('run_id,status').in('run_id',part).order('run_id')))status.set(String(r.run_id),String(r.status));
-   return list.map(r=>{const s=status.get(String(r.run_id));if(s===undefined)throw new FactsDbError('unknown',`run_not_found:${String(r.run_id)}`);return calendarFilingFromRow({...r,run_status:s});});
+   // a filing whose run row is missing is omitted (pg inner-joins the run; memory drops it the same way)
+   return list.flatMap(r=>{const s=status.get(String(r.run_id));return s===undefined?[]:[calendarFilingFromRow({...r,run_status:s})];});
   },
   async setFilingAcceptance(filingId,acceptedAt,source){return (await call<unknown>('set_filing_acceptance',{p_filing:filingId,p_accepted:acceptedAt,p_source:source}))===true;},
   async adoptCandidate(item,index,batch,expectedRev,by){return adoptFromJson(await call<unknown>('adopt_candidate',{p_item:item,p_index:index,p_batch:batch,p_expected_rev:expectedRev,p_resolved_by:by}));},
diff --git a/src/lib/facts/memory-facts-db.ts b/src/lib/facts/memory-facts-db.ts
index 0eebbd1..60e04cf 100644
--- a/src/lib/facts/memory-facts-db.ts
+++ b/src/lib/facts/memory-facts-db.ts
@@ -61,7 +61,7 @@ const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
 const clone=<T>(v:T):T=>structuredClone(v);
 const unknown=(message:string)=>new FactsDbError('unknown',message);
 
-export function memoryFactsDb(tables:TableClient=memoryTableClient({dq_quarantine:['id']})):MemoryFactsDb{
+export function memoryFactsDb(tables:TableClient=memoryTableClient({dq_quarantine:['id'],dq_reconcile_cycles:['pair','cycle_id'],dq_reconcile_cursor:['pair','cycle_id','issuer_id','market']})):MemoryFactsDb{
  const scope=new Map<string,ScopeRow>();
  const scopeConfirmed=new Map<string,string>();   // = fact_sync_scope.scope_confirmed_at: set only by reconcile (change or active confirmation)
  const runs=new Map<string,MemoryRun>();
@@ -207,7 +207,7 @@ export function memoryFactsDb(tables:TableClient=memoryTableClient({dq_quarantin
  // read_facts_lineage: the read_facts rules over a member set; with more than one member, ok rows of
  // one (K, available_date) from different issuers with different values leave the sequences and go to conflicts.
  const readLineage=(members:string[],market:Market,o:ReadFactsOptions):ReadFactsLineageResult=>{
-  const set=[...new Set(members)].sort(cmp);const inSet=new Set(set);
+  const set=[...new Set(members.map(m=>m.toLowerCase()))].sort(cmp);const inSet=new Set(set);
   const stateRevs:LineageRev[]=set.map(i=>({issuer_id:i,state_rev:scopeOf(i,market)?.state_rev??0}));
   const base=[...facts.values()].filter(f=>inSet.has(f.issuer_id)&&f.market===market&&o.concepts.includes(f.concept)&&f.available_date<=o.asOf
    &&(o.from===undefined||f.period_end>=o.from)&&(o.to===undefined||f.period_end<=o.to)&&(f.status==='ok'||o.includeNonOk===true)&&visible(f));
@@ -238,8 +238,9 @@ export function memoryFactsDb(tables:TableClient=memoryTableClient({dq_quarantin
   return {stateRevs,lineage:set,rows:picked,conflicts,truncated:false};
  };
  // replace_financial_metrics_lineage: member set = current lineage, every rev equal, else stale_computation.
- const replaceLineage=(issuer:string,market:Market,basedOn:LineageRev[],input:MetricRow[])=>{
-  const norm=lineageRevsFrom(basedOn);
+ const replaceLineage=(issuer0:string,market:Market,basedOn:LineageRev[],input:MetricRow[])=>{
+  const issuer=issuer0.toLowerCase();   // SQL compares uuids, not text
+  const norm=lineageRevsFrom(basedOn.map(x=>({...x,issuer_id:String(x.issuer_id).toLowerCase()})));
   if(norm.length===0||new Set(norm.map(x=>x.issuer_id)).size!==norm.length||!norm.some(x=>x.issuer_id===issuer)||norm.some(x=>!Number.isInteger(x.state_rev)||x.state_rev<0))throw unknown('invalid_based_on');
   if(norm.some(x=>!scopeOf(x.issuer_id,market)))throw new FactsDbError('scope_missing');
   if(topoOf(issuer).status!=='active')throw new FactsDbError('stale_computation');   // a merged / dissolved issuer is no materialisation target
@@ -436,7 +437,7 @@ export function memoryFactsDb(tables:TableClient=memoryTableClient({dq_quarantin
   setTopology:entries=>{for(const [id,t] of Object.entries(entries))topo.set(id,{...t});},
   async targetOf(issuer){return topoOf(issuer).merged_into??issuer;},
   async lineageOf(target){return lineageMembers(target);},
-  async stateRevs(issuers,market){return [...new Set(issuers)].sort(cmp).map(i=>({issuer_id:i,state_rev:scopeOf(i,market)?.state_rev??0}));},
+  async stateRevs(issuers,market){return [...new Set(issuers.map(i=>i.toLowerCase()))].sort(cmp).map(i=>({issuer_id:i,state_rev:scopeOf(i,market)?.state_rev??0}));},
   async readFactsLineage(issuers,market,o){return readLineage(issuers,market,o);},
   async readFilingFacts(filingId,includeNonOk){
    const rows=[...facts.values()].filter(f=>f.filing_id===filingId&&(f.status==='ok'||includeNonOk));
@@ -448,7 +449,8 @@ export function memoryFactsDb(tables:TableClient=memoryTableClient({dq_quarantin
   async filingsForCalendar(issuer,market,o){
    const rows=[...filings.values()].filter(g=>g.issuer_id===issuer&&g.market===market&&g.period_end!==null&&g.period_end>=o.fromPeriodEnd);
    rows.sort((a,b)=>cmp(a.period_end!,b.period_end!)||cmp(a.available_date,b.available_date)||cmp(a.filing_id,b.filing_id));
-   return rows.map(g=>({...clone(g),run_status:(runs.get(g.run_id)?.status??'abandoned') as RunStatus}));
+   // a filing whose run row is missing is omitted (pg inner-joins the run; supabaseFactsDb drops it the same way)
+   return rows.filter(g=>runs.has(g.run_id)).map(g=>({...clone(g),run_status:runs.get(g.run_id)!.status as RunStatus}));
   },
   async setFilingAcceptance(filingId,acceptedAt,source){
    if(source!=='sec_submissions'||!acceptedAt||Number.isNaN(Date.parse(acceptedAt)))throw unknown('invalid_acceptance');
diff --git a/src/lib/facts/types.ts b/src/lib/facts/types.ts
index 222341f..c5f02b3 100644
--- a/src/lib/facts/types.ts
+++ b/src/lib/facts/types.ts
@@ -66,7 +66,7 @@ export interface ReadFactsOptions{concepts:string[];asOf:string;from?:string;to?
 export interface ReadFactsResult{stateRev:number;rows:FactRow[];truncated:boolean}
 export interface ReadFactsLineageResult{stateRevs:LineageRev[];lineage:string[];rows:FactRow[];conflicts:LineageConflict[];truncated:boolean}
 export type FilingFactRow=FactRow&{run_status:RunStatus};
-export type CalendarFiling=FilingRow&{run_status:RunStatus;accepted_at:string|null};
+export type CalendarFiling=FilingRow&{run_status:RunStatus};
 
 export type FactsDbErrorCode='lease_lost'|'run_pending'|'run_published'|'mapping_gen_regression'|'stale_computation'|'stale_plan'|'run_abandoned'|'read_truncated'|'duplicate_key'|'invalid_chosen'|'item_not_open'|'unknown'
  |'fence_failed'|'member_incomplete'|'stale_evaluation'|'batch_mismatch'|'invalid_choice'|'invalid_candidate'|'generation_moved'
diff --git a/supabase/migrations.lock.json b/supabase/migrations.lock.json
index 766be6c..35204ff 100644
--- a/supabase/migrations.lock.json
+++ b/supabase/migrations.lock.json
@@ -207,7 +207,7 @@
     },
     {
       "file": "20261107091000_facts_extensions.sql",
-      "sha256": "68fa70515220a4e0b7f0d760efea56ac58f66109d9129bd9d6267da8469de145"
+      "sha256": "9401030a2c62f380a23e01e3e779b78e729a5ceec75ed5ba8f8bab9022534d6a"
     }
   ]
 }
diff --git a/supabase/migrations/20261107091000_facts_extensions.sql b/supabase/migrations/20261107091000_facts_extensions.sql
index 31879c6..3fdedba 100644
--- a/supabase/migrations/20261107091000_facts_extensions.sql
+++ b/supabase/migrations/20261107091000_facts_extensions.sql
@@ -936,6 +936,12 @@ begin
               or coalesce(jsonb_typeof(p_result -> 'item' -> 'payload'), '') <> 'object' or length(p_result -> 'item' ->> 'natural_key') not between 1 and 512)) then
     raise exception 'invalid_result' using errcode = '22023';
   end if;
+  -- mirror dq_reconciliations_numeric_sides / _nonnumeric_sides as invalid_result (22023) before anything is read or written
+  if p_result ->> 'kind' = 'numeric' then
+    if p_result ->> 'outcome' = 'compared' and (v_lv is null or v_rv is null) then raise exception 'invalid_result' using errcode = '22023'; end if;
+  elsif v_lv is not null or v_rv is not null or v_ad is not null or v_rd is not null then
+    raise exception 'invalid_result' using errcode = '22023';
+  end if;
   select * into v_existing from public.dq_reconciliations where pair = c.pair and cycle_id = c.cycle_id and natural_key = v_nk;
   if found then
     if v_existing.issuer_id is distinct from c.issuer_id or v_existing.market is distinct from c.market then raise exception 'invalid_result' using errcode = '22023'; end if;
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>.
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
/bin/zsh -lc "sed -n '60,115p' src/lib/facts/memory-facts-db.ts; sed -n '235,265p' src/lib/facts/memory-facts-db.ts; rg -n \"issuer.*['\\\"](I|A|B)|issuer_id:.*[A-Z]|stateRevs\\(|readFactsLineage\\(\" src/lib/facts/*test* | head -65; cat package.json | head -75; find . -name CLAUDE.md -not -path './node_modules/*'; sed -n '860,960p' supabase/migrations/20261107091000_facts_extensions.sql" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 66ms:
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
const clone=<T>(v:T):T=>structuredClone(v);
const unknown=(message:string)=>new FactsDbError('unknown',message);

export function memoryFactsDb(tables:TableClient=memoryTableClient({dq_quarantine:['id'],dq_reconcile_cycles:['pair','cycle_id'],dq_reconcile_cursor:['pair','cycle_id','issuer_id','market']})):MemoryFactsDb{
 const scope=new Map<string,ScopeRow>();
 const scopeConfirmed=new Map<string,string>();   // = fact_sync_scope.scope_confirmed_at: set only by reconcile (change or active confirmation)
 const runs=new Map<string,MemoryRun>();
 const filings=new Map<string,FilingRow>();
 const facts=new Map<string,FactRow>();
 let lastStamp='';
 let metrics:MetricRow[]=[];
 let fixedNow:string|null=null;
 const now=()=>fixedNow??new Date().toISOString();
 // created_at of one stageFacts call: one value per call (SQL now() = transaction start), strictly increasing across calls
 const stamp=()=>{const t=now();if(t>lastStamp){lastStamp=t;}else{lastStamp=new Date(Date.parse(lastStamp)+1).toISOString();}return lastStamp;};
 const scopeOf=(issuer:string,market:Market)=>scope.get(sk(issuer,market));
 const bump=(issuer:string,market:Market)=>{const s=scopeOf(issuer,market);if(s)s.state_rev+=1;};
 const leaseCheck=(issuer:string,market:Market,batch:string)=>{
  const s=scopeOf(issuer,market);
  if(!s||s.lease_batch_id!==batch||s.lease_until===null||s.lease_until<=now())throw new FactsDbError('lease_lost');
  return s;
 };
 const runLock=(runId:string)=>{
  const r=runs.get(runId);if(!r)throw unknown('run_not_found');
  leaseCheck(r.issuer_id,r.market,r.batch_id);
  if(r.status==='published')throw new FactsDbError('run_published');
  if(r.status==='abandoned')throw new FactsDbError('run_abandoned');
  return r;
 };
 const abandon=(r:MemoryRun,prune:boolean)=>{
  r.status='abandoned';
  for(const [id,f] of facts)if(f.run_id===r.run_id)facts.delete(id);
  if(prune)for(const [id,g] of filings)if(g.run_id===r.run_id&&g.mapping_gen===0&&![...facts.values()].some(f=>f.filing_id===id))filings.delete(id);
 };
 const items=(match:Row)=>tables.select('dq_quarantine',{table_name:'financial_facts',...match});
 const idsOf=(row:Row)=>{const p=row.payload as {fact_ids?:unknown}|undefined;return Array.isArray(p?.fact_ids)?p.fact_ids.filter((x):x is string=>typeof x==='string'):[];};
 const chosenOf=(row:Row)=>{const d=row.detail as {chosen_fact_ids?:unknown}|undefined;return Array.isArray(d?.chosen_fact_ids)?d.chosen_fact_ids.filter((x):x is string=>typeof x==='string'):[];};
 const runIdOf=(row:Row)=>{const p=row.payload as {run_id?:unknown}|undefined;return typeof p?.run_id==='string'?p.run_id:null;};
 /** Does this same_day_conflict item dispute the row's (K, available_date)? Matched on payload.key like the SQL (round-1 #3). */
 const disputes=(item:Row,f:FactRow)=>{
  const k=(item.payload as {key?:Record<string,string|null>}|undefined)?.key;
  return !!k&&k.issuer_id===f.issuer_id&&k.market===f.market&&k.concept===f.concept&&(k.period_start??'')===(f.period_start??'')&&k.period_end===f.period_end&&k.consolidation===f.consolidation&&k.unit===f.unit&&k.available_date===f.available_date;
 };
 // ---- plan 3 helpers
 const topo=new Map<string,MemoryTopology>();
 const topoOf=(id:string):MemoryTopology=>topo.get(id)??{status:'active',merged_into:null};
 const referrers=(id:string)=>[...topo.entries()].filter(([,t])=>t.merged_into===id).map(([k])=>k).sort(cmp);
 const lineageMembers=(t:string)=>[t,...referrers(t)];
 const MARKETS:readonly Market[]=['CN','US'];
 const ensureScope=(issuer:string,market:Market)=>{
  const k=sk(issuer,market);if(scope.has(k))return;
  scope.set(k,{issuer_id:issuer,market,reasons:[],priority:0,fetch_key:'topology',next_due_at:now(),lease_until:null,lease_batch_id:null,state_rev:0,last_attempt_at:null,last_success_at:null,last_batch_id:null,last_status:null});
  scopeConfirmed.set(k,now());
 };
 const visible=(f:FactRow)=>filings.get(f.filing_id)?.mapping_gen===f.mapping_gen;
  const picked=out.filter(f=>(o.history===true||f.is_current===true)&&(o.limit===undefined||rank.get(keyOf(f))!<=o.limit));
  picked.sort((a,b)=>rank.get(keyOf(a))!-rank.get(keyOf(b))!||byDisclosure(a,b));
  if(picked.length>READ_FACTS_CAP)return {stateRevs,lineage:set,rows:[],conflicts,truncated:true};
  return {stateRevs,lineage:set,rows:picked,conflicts,truncated:false};
 };
 // replace_financial_metrics_lineage: member set = current lineage, every rev equal, else stale_computation.
 const replaceLineage=(issuer0:string,market:Market,basedOn:LineageRev[],input:MetricRow[])=>{
  const issuer=issuer0.toLowerCase();   // SQL compares uuids, not text
  const norm=lineageRevsFrom(basedOn.map(x=>({...x,issuer_id:String(x.issuer_id).toLowerCase()})));
  if(norm.length===0||new Set(norm.map(x=>x.issuer_id)).size!==norm.length||!norm.some(x=>x.issuer_id===issuer)||norm.some(x=>!Number.isInteger(x.state_rev)||x.state_rev<0))throw unknown('invalid_based_on');
  if(norm.some(x=>!scopeOf(x.issuer_id,market)))throw new FactsDbError('scope_missing');
  if(topoOf(issuer).status!=='active')throw new FactsDbError('stale_computation');   // a merged / dissolved issuer is no materialisation target
  if([...lineageMembers(issuer)].sort(cmp).join(',')!==norm.map(x=>x.issuer_id).join(','))throw new FactsDbError('stale_computation');
  if(norm.some(x=>scopeOf(x.issuer_id,market)!.state_rev!==x.state_rev))throw new FactsDbError('stale_computation');
  const pk=(m:MetricRow)=>[m.metric,m.period_start,m.period_end,m.input_unit,m.basis,m.formula_version].join('|');
  if(new Set(input.map(pk)).size!==input.length)throw new FactsDbError('duplicate_key','financial_metrics_pkey');
  const rev=scopeOf(issuer,market)!.state_rev;
  metrics=metrics.filter(m=>!(m.issuer_id===issuer&&m.market===market)).concat(input.map(m=>({...clone(m),issuer_id:issuer,market,based_on_rev:rev,based_on_lineage:norm.map(x=>({...x}))})));
  return input.length;
 };
 const byDisclosure=(a:FactRow,b:FactRow)=>cmp(a.available_date,b.available_date)||cmp(a.created_at,b.created_at)||cmp(a.fact_id,b.fact_id);
 // key ranking of read_facts: period_end desc, concept, period_start desc nulls last, consolidation, unit
 const keyOrder=(a:KeyPart,b:KeyPart)=>cmp(b.period_end,a.period_end)||cmp(a.concept,b.concept)
  ||(a.period_start===b.period_start?0:a.period_start===null?1:b.period_start===null?-1:cmp(b.period_start,a.period_start))
  ||cmp(a.consolidation,b.consolidation)||cmp(a.unit,b.unit);

 const raw:MemoryFactsDb={
  tables,
  setNow:iso=>{fixedNow=iso===null?null:new Date(iso).toISOString();},
  expireLease:(issuer,market)=>{const s=scopeOf(issuer,market);if(s&&s.lease_until!==null)s.lease_until='1970-01-01T00:00:00.000Z';},
  // Inspection helpers below are test-only and bypass the mutex (they read the maps synchronously).
src/lib/facts/public-route.test.ts:8:const issuer=(n:number)=>({issuer_id:id(n),status:'active',merged_into:null,lei:null,cik:null,usci:null,cninfo_org_id:null,hkex_stock_code_primary:null,canonical_name_zh:null,canonical_name_en:`Co ${n}`,country_code:null,provenance:{},created_at:'2020-01-01T00:00:00.000Z',updated_at:'2020-01-01T00:00:00.000Z'});
src/lib/facts/public-route.test.ts:22:  expect(await resolvePublicIssuer(c,'BRK.A',TODAY)).toEqual({issuerId:id(2),ticker:'BRK.A',market:'US'});
src/lib/facts/public-route.test.ts:23:  expect(await resolvePublicIssuer(c,'brk/b',TODAY)).toEqual({issuerId:id(3),ticker:'BRK.B',market:'US'});
src/lib/facts/public-route.test.ts:24:  expect(await resolvePublicIssuer(c,'BRK',TODAY)).toEqual({issuerId:id(1),ticker:'BRK',market:'US'});
src/lib/facts/public-route.test.ts:25:  expect(await resolvePublicIssuer(c,'AAPL',TODAY)).toEqual({issuerId:id(6),ticker:'AAPL',market:'US'});
src/lib/facts/deps.test.ts:27: const filing=(p:Partial<FilingRow>={}):FilingRow=>({filing_id:'g',issuer_id:'I',market:'CN',source:'tushare',origin:'sse',form_type:'annual',fiscal_year:2024,fiscal_period:'FY',period_end:'2024-12-31',available_date:'2025-04-03',source_ref:'600519.SH:20241231:1:20250403',url:null,document_ref:null,document_url:null,link_attempts:0,mapping_gen:1,run_id:'r',created_at:'2025-04-03T00:00:00Z',accepted_at:null,acceptance_source:null,...p});
src/lib/facts/deps.test.ts:31:  await tables.insert('issuers',{issuer_id:'I',cninfo_org_id:'9900000227',status:'active'});
src/lib/facts/deps.test.ts:32:  await tables.insert('issuer_securities',{issuer_id:'I',ticker:'600519.SH',is_primary:true,valid_from:'2001-08-27',valid_to:null});
src/lib/facts/deps.test.ts:33:  await tables.insert('issuer_securities',{issuer_id:'I',ticker:'600519.OLD',is_primary:true,valid_from:'1990-01-01',valid_to:'2001-08-26'});
src/lib/facts/deps.test.ts:48:  await tables.insert('issuers',{issuer_id:'U',cninfo_org_id:null,status:'active'});
src/lib/facts/deps.test.ts:51:  expect(await link(filing({issuer_id:'U'}),budget())).toBe('unlinkable');
src/lib/facts/deps.test.ts:57:   await t.insert('issuers',{issuer_id:'I',cninfo_org_id:'9900000227',status:'active'});
src/lib/facts/deps.test.ts:58:   for(const x of secs)await t.insert('issuer_securities',{issuer_id:'I',valid_from:'2001-08-27',valid_to:null,...x});
src/lib/facts/deps.test.ts:75:  await tables.insert('issuers',{issuer_id:'I',cninfo_org_id:'9900000227',status:'active'});
src/lib/facts/deps.test.ts:76:  await tables.insert('issuer_securities',{issuer_id:'I',ticker:'600519.SH',is_primary:true,valid_from:'2001-08-27',valid_to:'2030-12-31'});
src/lib/facts/plan.test.ts:14:const row=(filingId:string,value:string,availableDate:string,over:Partial<FactRow>={}):FactRow=>({fact_id:`20000000-0000-4000-8000-${String(++n).padStart(12,'0')}`,issuer_id:ISSUER,market:'US',filing_id:filingId,run_id:'r',concept:'revenue',source_concept:'Revenues',statement:'IS',period_start:'2022-10-01',period_end:'2023-09-30',duration:'12M',value,value_text:value,unit:'USD',consolidation:'consolidated',available_date:availableDate,mapping_gen:1,mapping_version:'facts-map/1',status:'ok',raw_hash:'h',created_at:`2024-01-01T00:00:00.${String(n).padStart(3,'0')}Z`,...over});
src/lib/facts/plan.test.ts:24:  expect(out.inserts[0]).toMatchObject({issuer_id:ISSUER,market:'US',filing_id:F1,concept:'revenue',value:'383285000000',available_date:'2023-11-03',mapping_gen:1,mapping_version:'facts-map/1',period_start:'2022-10-01',period_end:'2023-09-30'});
src/lib/facts/plan.test.ts:41:  expect(amb.ambiguous[0]).toMatchObject({naturalKey:`${ISSUER}:US:revenue:2022-10-01:2023-09-30:consolidated:USD:acc-1:1`,key:{issuer_id:ISSUER,market:'US',concept:'revenue',unit:'USD'}});
src/lib/facts/plan.test.ts:63:  expect(c.key).toEqual({issuer_id:ISSUER,market:'US',concept:'revenue',period_start:'2022-10-01',period_end:'2023-09-30',consolidation:'consolidated',unit:'USD',available_date:'2023-11-03'});
src/lib/facts/read.test.ts:12:const row=(filingId:string,value:string,availableDate:string,over:Partial<FactRow>={}):FactRow=>({fact_id:`20000000-0000-4000-8000-${String(++n).padStart(12,'0')}`,issuer_id:'i',market:'US',filing_id:filingId,run_id:'r',concept:'revenue',source_concept:'Revenues',statement:'IS',period_start:'2022-10-01',period_end:'2023-09-30',duration:'12M',value,value_text:value,unit:'USD',consolidation:'consolidated',available_date:availableDate,mapping_gen:1,mapping_version:'facts-map/1',status:'ok',raw_hash:'h',created_at:`2024-01-01T00:00:00.${String(n).padStart(3,'0')}Z`,...over});
src/lib/facts/read.test.ts:49:  await db.reconcileScope('US',[{issuer_id:iss,reasons:[],priority:1,fetch_key:'k'}]);await db.claimLease(iss,'US',b,600);
src/lib/facts/read.test.ts:55:  await db.tables.insert('dq_quarantine',{id:itemId,dataset:'facts.us',table_name:'financial_facts',natural_key:`${iss}:US:IS:x`,reason_code:'identity_gp',status:'open',payload:{key:{issuer_id:iss,market:'US'},fact_ids:[],run_id:run},detail:{},batch_id:b,resolved_by:null,resolved_at:null,created_at:'2026-01-01T00:00:00.000Z'});
src/lib/facts/read.test.ts:89:  const a=row(F1,'1','2023-11-03',{issuer_id:'A'});const b=row(F1,'2','2024-11-03',{issuer_id:'B'});const c=row(F1,'3','2024-11-04',{issuer_id:'A',market:'CN'});
src/lib/facts/read.test.ts:91:  expect(out.map(r=>[r.issuer_id,r.market,r.disclosure_seq,r.is_current,r.is_revision])).toEqual([['A','CN',1,true,false],['A','US',1,true,false],['B','US',1,true,false]]);
src/lib/facts/read.test.ts:116:  await db.reconcileScope('US',[{issuer_id:iss,reasons:[],priority:1,fetch_key:'k'}]);await db.claimLease(iss,'US',b,600);
src/lib/facts/db.test.ts:31:  await db.reconcileScope('US',[{issuer_id:iss,reasons:[],priority:1,fetch_key:'k'}]);await db.claimLease(iss,'US',b,60);
src/lib/facts/db.test.ts:44:  await db.reconcileScope('US',[{issuer_id:iss,reasons:[],priority:1,fetch_key:'k'}]);await db.claimLease(iss,'US',b,60);
src/lib/facts/db.test.ts:112:  const metric=(i:number)=>({issuer_id:'iss',market:'US',metric:`m${String(i).padStart(4,'0')}`,period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:1,value_text:'1',unit:'u',input_unit:'USD',basis:'us_standard',formula_version:'v',inputs:[],based_on_rev:'2',as_of:'2024-01-01'});
src/lib/facts/db.test.ts:113:  const scope=(i:number)=>({issuer_id:`i${i}`,market:'US',reasons:[],priority:10,fetch_key:'k',next_due_at:'2026-01-01T00:00:00+00:00',lease_until:null,lease_batch_id:null,state_rev:'0',last_attempt_at:null,last_success_at:null,last_batch_id:null,last_status:null});
src/lib/facts/db.test.ts:148:   :[{issuer_id:'i',market:'US',reasons:[],priority:1,fetch_key:'k',next_due_at:'2030-01-01T00:00:00+00:00',lease_until:'2030-01-01T01:02:03.5+00:00',lease_batch_id:null,state_rev:'0',last_attempt_at:'2030-01-01T00:00:00.000001+00:00',last_success_at:null,last_batch_id:null,last_status:null}]);
src/lib/facts/db.test.ts:155:  const row=(i:number,rev:number)=>({issuer_id:'iss',market:'US',metric:`m${String(i).padStart(4,'0')}`,period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:1,value_text:'1',unit:'u',input_unit:'USD',basis:'us_standard',formula_version:'v',inputs:[],based_on_rev:rev,as_of:'2024-01-01'});
src/lib/facts/db.test.ts:190:  await db.replaceMetrics(iss,'US',3,[{issuer_id:iss,market:'US',metric:'m',period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:'1',unit:'u',input_unit:'USD',basis:'us_standard',formula_version:'v',inputs:[],based_on_rev:3,based_on_lineage:[{issuer_id:iss,state_rev:3}],as_of:'2024-01-01'}]);
src/lib/facts/db.test.ts:219:   if(fn==='read_facts_lineage')return {data:{state_revs:[{issuer_id:I2,state_rev:'4'},{issuer_id:I1,state_rev:3}],lineage:[I1,I2],truncated:false,row_count:1,rows:[{fact_id:'a',issuer_id:I2,value:7,value_text:'7.0',disclosure_seq:null,is_current:false,is_revision:false}],conflicts:[{key:{concept:'revenue'},available_date:'2024-02-01',fact_ids:['x','y']}]}};
src/lib/facts/db.test.ts:221:   if(fn==='adopt_candidate')return {data:{fact_id:'nf',run_id:'nr',issuer_id:I1,market:'US'}};
src/lib/facts/db.test.ts:225:   if(fn==='apply_reconcile_result')return {data:{reused:false,reconciliation_id:'r1',item_id:null,quarantined:1,materialize:{issuer_id:I1,market:'US'}}};
src/lib/facts/db.test.ts:228:   if(fn==='open_reconcile_cycle')return {data:{created:true,cycle:{pair:'facts.lineage_same_day',cycle_id:'c'},transferred:[{issuer_id:I1,market:'US',source:I2}]}};
src/lib/facts/db.test.ts:233:  expect(await db.readFactsLineage([I2,I1],'US',{concepts:['revenue'],asOf:'2030-01-01',history:true})).toEqual({stateRevs:[{issuer_id:I1,state_rev:3},{issuer_id:I2,state_rev:4}],lineage:[I1,I2],
src/lib/facts/db.test.ts:234:   rows:[{fact_id:'a',issuer_id:I2,value:'7.0',value_text:'7.0',disclosure_seq:undefined,is_current:false,is_revision:false}],conflicts:[{key:{concept:'revenue'},available_date:'2024-02-01',fact_ids:['x','y']}],truncated:false});
src/lib/facts/db.test.ts:236:  expect(await db.stateRevs([I1,I2],'US')).toEqual([{issuer_id:I1,state_rev:3},{issuer_id:I2,state_rev:4}]);
src/lib/facts/db.test.ts:238:  expect(await db.stateRevs([],'US')).toEqual([]);
src/lib/facts/db.test.ts:249:  const fence={pair:'us.companyfacts_vs_ixbrl' as const,cycle_id:'c1',issuer_id:I1,market:'US' as const,batch_id:'b',attempt:1};
src/lib/facts/db.test.ts:256:  const open={pair:'facts.lineage_same_day' as const,cycleId:'c',startedAt:'2026-11-05T00:00:00.000Z',members:[{issuer_id:I1,market:'US' as const,expected_keys:[]}],pending:[{issuer_id:I1,market:'US' as const,source:I2}]};
src/lib/facts/db.test.ts:257:  expect(await db.openReconcileCycle(open)).toEqual({created:true,cycle:{pair:'facts.lineage_same_day',cycle_id:'c'},transferred:[{issuer_id:I1,market:'US',source:I2}]});
src/lib/facts/db.test.ts:265:  const m={issuer_id:I1,market:'US' as const,metric:'m',period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M' as const,value:'1',unit:'u',input_unit:'USD',basis:'us_standard',formula_version:'v',inputs:[],based_on_rev:3,based_on_lineage:[{issuer_id:I1,state_rev:3}],as_of:'2024-01-01'};
src/lib/facts/db.test.ts:266:  expect(await db.replaceMetricsLineage(I1,'US',[{issuer_id:I1,state_rev:3}],[m])).toBe(3);
src/lib/facts/db.test.ts:267:  expect(calls.at(-1)).toEqual({fn:'replace_financial_metrics_lineage',args:{p_issuer:I1,p_market:'US',p_based_on:[{issuer_id:I1,state_rev:3}],p_rows:[{metric:'m',period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:'1',unit:'u',input_unit:'USD',basis:'us_standard',formula_version:'v',inputs:[],as_of:'2024-01-01'}]}});
src/lib/facts/db.test.ts:272:   if(table==='issuers')return [{issuer_id:'A'},{issuer_id:'B'}];
src/lib/facts/db.test.ts:285:  const mk=(i:number,over:Record<string,unknown>={})=>({filing_id:`g${String(i).padStart(5,'0')}`,issuer_id:'I',market:'US',run_id:`r${i}`,period_end:`2024-${String(1+i%12).padStart(2,'0')}-28`,available_date:'2024-06-01',mapping_gen:i%4,created_at:'2024-06-01T00:00:00+00:00',accepted_at:null,...over});
src/lib/facts/db.test.ts:286:  const all=[...Array.from({length:N},(_,i)=>mk(i)),mk(5000,{issuer_id:'OTHER'}),mk(5001,{market:'CN'}),mk(5002,{period_end:'2023-12-31'})];
src/lib/facts/db.test.ts:309:  expect(out.some(f=>f.issuer_id!=='I'||f.market!=='US'||(f.period_end??'')<'2024-01-01')).toBe(false);
src/lib/facts/db.test.ts:316:  const g=(id:string,run:string)=>({filing_id:id,issuer_id:'I',market:'US',run_id:run,period_end:'2024-03-31',available_date:'2024-05-01',created_at:'2024-05-01T00:00:00+00:00'});
src/lib/facts/db.test.ts:322:  const fence={pair:'us.companyfacts_vs_ixbrl' as const,cycle_id:'c',issuer_id:'i',market:'US' as const,batch_id:'b',attempt:1};
src/lib/facts/db.test.ts:327:  const row=(i:number,lineage:unknown)=>({issuer_id:'iss',market:'US',metric:`m${String(i).padStart(4,'0')}`,period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:1,value_text:'1',unit:'u',input_unit:'USD',basis:'us_standard',formula_version:'v',inputs:[],based_on_rev:2,based_on_lineage:lineage,as_of:'2024-01-01'});
src/lib/facts/db.test.ts:341:  expect(await db.stateRevs([c,a,a],'US')).toEqual([{issuer_id:a,state_rev:0},{issuer_id:c,state_rev:0}]);
src/lib/facts/db.test.ts:343:  await db.tables.insert('dq_reconcile_cycles',{pair:'facts.lineage_same_day',cycle_id:'new',status:'complete',started_at:'2026-02-01T00:00:00.000Z',detail:{pending_members:[{issuer_id:c,market:'US',source:'earlier-source'}]}});
src/lib/facts/db.test.ts:347:  expect(cycles.find(x=>x.cycle_id==='new')!.detail).toEqual({pending_members:[{issuer_id:c,market:'US',source:'earlier-source'},{issuer_id:c,market:'CN',source:s},{issuer_id:c,market:'US',source:s}]});   // one entry per merged source (plan audit Q2)
src/lib/facts/db.test.ts:350:  const m={issuer_id:'z',market:'US' as const,metric:'m',period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M' as const,value:'1',unit:'u',input_unit:'USD',basis:'us_standard',formula_version:'v',inputs:[],based_on_rev:0,based_on_lineage:[{issuer_id:'z',state_rev:0}],as_of:'2024-01-01'};
src/lib/facts/db.test.ts:356:  await db.reconcileScope('US',[{issuer_id:iss,reasons:[],priority:1,fetch_key:'k'}]);await db.claimLease(iss,'US',b,60);
src/lib/facts/db.test.ts:371:  await db.reconcileScope('US',[{issuer_id:iss,reasons:[],priority:1,fetch_key:'k'}]);await db.claimLease(iss,'US',b,60);
src/lib/facts/db.test.ts:376:  await db.openReconcileCycle({pair,cycleId:'c1',startedAt:'2026-01-01T00:00:00.000Z',members:[{issuer_id:iss,market:'US',expected_keys:keys.map(naturalKey=>({naturalKey,locator:{}}))}],pending:[]});
src/lib/facts/rules.test.ts:11:const ins=(concept:string,value:string,over:Partial<FactInsert>={}):FactInsert=>({fact_id:`30000000-0000-4000-8000-${String(++n).padStart(12,'0')}`,issuer_id:ISSUER,market:'US',filing_id:F1,concept,source_concept:concept,statement:'BS',period_start:null,period_end:'2023-09-30',duration:'INSTANT',value,unit:'USD',consolidation:'consolidated',available_date:'2023-11-03',mapping_gen:1,mapping_version:'facts-map/1',raw_hash:'h',...over});
src/lib/facts/derive.test.ts:9:const f=(p:P):FactRow=>({fact_id:`f${++n}`,issuer_id:'I',market:'US',filing_id:'F1',run_id:'R',source_concept:p.concept,statement:'IS',period_start:null,unit:'USD',consolidation:'consolidated',available_date:'2024-01-01',mapping_gen:1,mapping_version:'facts-map/1',status:'ok',raw_hash:'h',created_at:'2024-01-01T00:00:00Z',value_text:p.value,disclosure_seq:1,is_current:true,is_revision:false,...p});
src/lib/facts/derive.test.ts:205:  expect(()=>deriveMetrics([dur('revenue','2024-01-01','2024-03-31','1'),dur('revenue','2024-04-01','2024-06-30','1',{issuer_id:'J'})],opts)).toThrow('derive_mixed_scope');
src/lib/facts/derive.test.ts:280:  const other=fakeDb([env(5,[dur('revenue','2024-01-01','2024-03-31','1',{issuer_id:'OTHER'})])]);
src/lib/facts/facts.integration.test.ts:105:   [id,`${iss}:US:revenue:2023-10-01:2023-12-31:consolidated:USD:${date}`,b,JSON.stringify({key:{issuer_id:iss,market:'US',concept:'revenue',period_start:'2023-10-01',period_end:'2023-12-31',consolidation:'consolidated',unit:'USD',available_date:date},fact_ids:factIds,values:[],run_id:run})]);
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
    raise exception 'member_incomplete' using errcode = 'P0001';
  end if;
  update public.dq_reconcile_cursor
  set state = 'done', done_at = clock_timestamp(), claim_until = null, compared_passed = v_p, compared_failed = v_f, not_compared = v_n
  where pair = c.pair and cycle_id = c.cycle_id and issuer_id = c.issuer_id and market = c.market;
  return jsonb_build_object('compared_passed', v_p, 'compared_failed', v_f, 'not_compared', v_n);
end $$;
revoke execute on function public.complete_reconcile_member(jsonb) from public, anon, authenticated;
grant execute on function public.complete_reconcile_member(jsonb) to service_role;

create or replace function public.fail_reconcile_member(p_fence jsonb, p_error text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.dq_reconcile_cursor;
begin
  c := public.reconcile_fence_lock(p_fence);
  update public.dq_reconcile_cursor
  set state = 'failed', claim_until = null, last_error = left(coalesce(p_error, 'unknown'), 2000)
  where pair = c.pair and cycle_id = c.cycle_id and issuer_id = c.issuer_id and market = c.market;
end $$;
revoke execute on function public.fail_reconcile_member(jsonb, text) from public, anon, authenticated;
grant execute on function public.fail_reconcile_member(jsonb, text) to service_role;

-- ---------------------------------------------------------------- 13. per-key atomic reconciliation write (spec §3.2 apply_reconcile_result, §5.6, T2, U2)
-- The only entry for reconciliation-derived writes; one expected key per call, one transaction:
-- fence check → (pair, cycle_id, natural_key) already accepted → that row is returned (reused,
-- nothing written) → else, by action:
--  quarantine_left (left_fact_id of the fence member required; any outcome / passed — 接口对齐记录 #5):
--   opens the item only when outcome = 'compared' AND passed = false AND the left row is ok or already
--   quarantined (another reason) and its run published; only an ok row is quarantined by it: under the member's scope lock, open reconcile_mismatch
--   item (reused by natural key <pair>:<natural_key>:<fact_id>) with payload {key, fact_ids,
--   left_value, right_value, right_locator} and detail {pair, reconciliation_id, inputs_hash,
--   latest_result, issuer_id, market, hook pending}; the row → quarantined; state_rev + 1;
--   materialize = {issuer_id, market}.
--  any action with a left_fact_id whose row is already quarantined and a COMPARED result (passed or not): the
--   OPEN reconcile_mismatch items of this pair that reference it get detail.latest_result = {passed,
--   reconciliation_id, at, inputs_hash} — this is how a passing re-run makes an item restorable.
--  quarantine_left otherwise (passed, or not compared, left ok): the result row only.
--  review_item / lineage_item: an open reconcile_review / lineage_conflict item (reused by natural
--   key) from result.item; no visibility change.
--  record: the result row only.
-- The result row carries cycle_id / issuer_id / market / attempt from the fence and detail.item_id.
create or replace function public.apply_reconcile_result(p_fence jsonb, p_result jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.dq_reconcile_cursor; v_existing public.dq_reconciliations; f public.financial_facts; v_run text;
        v_rid uuid := gen_random_uuid(); v_item uuid; v_q int := 0; v_mat jsonb; v_action text; v_nk text; v_left uuid;
        v_dataset text; v_nk_item text; v_latest jsonb; v_now timestamptz := now(); v_reason text;
        v_lv numeric; v_rv numeric; v_ad numeric; v_rd numeric; v_tol numeric; v_keys text[];
begin
  c := public.reconcile_fence_lock(p_fence);
  if p_result is null or jsonb_typeof(p_result) <> 'object'
     or coalesce(jsonb_typeof(p_result -> 'natural_key'), '') <> 'string'
     or coalesce(p_result ->> 'kind', '') not in ('numeric','text','date')
     or coalesce(p_result ->> 'outcome', '') not in ('compared','left_missing','left_unlinked','left_ambiguous','right_missing','unsupported','right_ambiguous','incomplete_gold')
     or coalesce(jsonb_typeof(p_result -> 'passed'), '') <> 'boolean'
     or coalesce(p_result ->> 'action', '') not in ('record','quarantine_left','review_item','lineage_item')
     or coalesce(jsonb_typeof(p_result -> 'left_source'), '') <> 'string' or coalesce(jsonb_typeof(p_result -> 'right_source'), '') <> 'string'
     or coalesce(jsonb_typeof(p_result -> 'detail'), '') <> 'object' or coalesce(jsonb_typeof(p_result -> 'tolerance'), '') <> 'string' then
    raise exception 'invalid_result' using errcode = '22023';
  end if;
  v_action := p_result ->> 'action'; v_nk := p_result ->> 'natural_key';
  if length(v_nk) not between 1 and 400 then raise exception 'invalid_result' using errcode = '22023'; end if;
  -- a pass is only meaningful for a compared pair of values
  if (p_result -> 'passed') = 'true'::jsonb and p_result ->> 'outcome' <> 'compared' then raise exception 'invalid_result' using errcode = '22023'; end if;
  -- the key must belong to the member's frozen expected set
  v_keys := public.reconcile_frozen_keys(c.pair, c.cycle_id, c.issuer_id, c.market);
  if v_keys is null or not (v_nk = any (v_keys)) then raise exception 'invalid_result' using errcode = '22023'; end if;
  begin
    v_lv := (p_result ->> 'left_value')::numeric; v_rv := (p_result ->> 'right_value')::numeric;
    v_ad := (p_result ->> 'abs_diff')::numeric; v_rd := (p_result ->> 'rel_diff')::numeric;
    v_tol := (p_result ->> 'tolerance')::numeric; v_left := (p_result ->> 'left_fact_id')::uuid;
  exception when others then
    raise exception 'invalid_result' using errcode = '22023';
  end;
  if (v_action = 'quarantine_left' and v_left is null)
     or (v_action in ('review_item','lineage_item')
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
    select r.status into v_run from public.fact_sync_runs r where r.run_id = f.run_id;
  end if;
  -- a failing compare on a published left row that is ok OR already quarantined (for another reason, with no
  -- open item of this pair yet) opens the reconcile_mismatch item, so fact_promote_rows blocks a later generic
  -- promotion; only an ok row changes visibility (status, state_rev, hook, materialize).

exec
/bin/zsh -lc "tail -90 src/lib/facts/memory-facts-db.ts; rg -n \"numeric_sides|nonnumeric_sides\" supabase/migrations/*; rg -n 'readFactsLineage|stateRevs|replaceMetricsLineage' src/lib/facts/*test.ts | tail -35; rg -n 'reconcileScope|toLowerCase' src/lib/facts/memory-facts-db.ts; ls -a .codex .claude 2>/dev/null" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 0ms:
      batch_id:fence.batch_id,status:'open',resolved_by:null,resolved_at:null,created_at:t0});
    }
   }
   await tables.insert('dq_reconciliations',{id:rid,dataset:`reconcile.${fence.pair}`,left_source:r.left_source,right_source:r.right_source,natural_key:r.natural_key,left_value:r.left_value,right_value:r.right_value,
    abs_diff:r.abs_diff,rel_diff:r.rel_diff,tolerance:r.tolerance,passed:r.passed,batch_id:fence.batch_id,pair:fence.pair,kind:r.kind,outcome:r.outcome,detail:{...r.detail,item_id:itemId,inputs_hash:r.inputs_hash??null},
    cycle_id:fence.cycle_id,issuer_id:fence.issuer_id,market:fence.market,attempt:Number(c.attempts),created_at:t0});
   return {reused:false,reconciliationId:rid,itemId,quarantined,materialize:mat};
  },
  async completeReconcileMember(fence){
   const c=await fenceLock(fence);
   const rows=await tables.select('dq_reconciliations',{pair:fence.pair,cycle_id:fence.cycle_id,issuer_id:fence.issuer_id,market:fence.market});
   const counts={compared_passed:rows.filter(x=>x.outcome==='compared'&&x.passed===true).length,compared_failed:rows.filter(x=>x.outcome==='compared'&&x.passed!==true).length,not_compared:rows.filter(x=>x.outcome!=='compared').length};
   if(counts.compared_passed+counts.compared_failed+counts.not_compared!==Number(c.expected))throw new FactsDbError('member_incomplete');
   // exact coverage of the frozen key set: every frozen key has an accepted result and nothing else does
   const keys=await frozenKeys(fence);const have=new Set(rows.map(x=>String(x.natural_key)));
   if(keys===null||keys.some(k=>!have.has(k))||[...have].some(k=>!keys.includes(k)))throw new FactsDbError('member_incomplete');
   await tables.update('dq_reconcile_cursor',cursorKey(fence),{state:'done',done_at:now(),claim_until:null,...counts});
   return counts;
  },
  async failReconcileMember(fence,error){
   await fenceLock(fence);
   await tables.update('dq_reconcile_cursor',cursorKey(fence),{state:'failed',claim_until:null,last_error:String(error??'unknown').slice(0,2000)});
  },
  // mirrors open_reconcile_cycle (plan audit Q2): running cycle → returned unchanged; else validate, insert
  // the cycle row and one pending cursor per member, and remove exactly the listed pending entries.
  async openReconcileCycle(i){
   const cycles=await tables.select('dq_reconcile_cycles',{pair:i.pair});
   const running=cycles.find(c=>c.status==='running');
   if(running)return {created:false,cycle:running,transferred:[]};
   const mk=(x:{issuer_id:unknown;market:unknown})=>`${String(x.issuer_id)}:${String(x.market)}`;
   if(!Array.isArray(i.members)||!Array.isArray(i.pending)||i.members.some(m=>typeof m.issuer_id!=='string'||!UUID.test(m.issuer_id)||(m.market!=='US'&&m.market!=='CN')||!Array.isArray(m.expected_keys))
    ||i.pending.some(p=>typeof p.source!=='string'))throw new FactsDbError('invalid_members');
   // issuer ids are frozen as canonical (lower-case) uuid text
   const members=i.members.map(m=>({...m,issuer_id:m.issuer_id.toLowerCase()}));
   const memberKeys=new Set(members.map(mk));
   const nks=members.flatMap(m=>m.expected_keys.map(k=>typeof k==='string'?k:(k as {naturalKey?:unknown}).naturalKey));
   // natural keys are unique across the whole cycle (results are accepted per pair, cycle, natural key)
   if(memberKeys.size!==members.length||nks.some(k=>typeof k!=='string')||new Set(nks).size!==nks.length
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
 for(const k of ASYNC_METHODS){
  const f=raw[k] as unknown as (...a:unknown[])=>Promise<unknown>;
  (db as unknown as Record<string,unknown>)[k]=serialize(f);
 }
 return db;
}
supabase/migrations/20261107091000_facts_extensions.sql:939:  -- mirror dq_reconciliations_numeric_sides / _nonnumeric_sides as invalid_result (22023) before anything is read or written
supabase/migrations/20261107090000_identifiers_and_dq.sql:93:  drop constraint if exists dq_reconciliations_numeric_sides,
supabase/migrations/20261107090000_identifiers_and_dq.sql:94:  drop constraint if exists dq_reconciliations_nonnumeric_sides,
supabase/migrations/20261107090000_identifiers_and_dq.sql:103:  add constraint dq_reconciliations_numeric_sides check (kind <> 'numeric' or outcome <> 'compared' or (left_value is not null and right_value is not null)),
supabase/migrations/20261107090000_identifiers_and_dq.sql:105:  add constraint dq_reconciliations_nonnumeric_sides check (kind = 'numeric' or (left_value is null and right_value is null and rel_diff is null and abs_diff is null));
src/lib/facts/db.test.ts:233:  expect(await db.readFactsLineage([I2,I1],'US',{concepts:['revenue'],asOf:'2030-01-01',history:true})).toEqual({stateRevs:[{issuer_id:I1,state_rev:3},{issuer_id:I2,state_rev:4}],lineage:[I1,I2],
src/lib/facts/db.test.ts:236:  expect(await db.stateRevs([I1,I2],'US')).toEqual([{issuer_id:I1,state_rev:3},{issuer_id:I2,state_rev:4}]);
src/lib/facts/db.test.ts:238:  expect(await db.stateRevs([],'US')).toEqual([]);
src/lib/facts/db.test.ts:266:  expect(await db.replaceMetricsLineage(I1,'US',[{issuer_id:I1,state_rev:3}],[m])).toBe(3);
src/lib/facts/db.test.ts:337: it('topology helper, targetOf, stateRevs order; setMerge registers the target on the latest lineage cycle; the plan-2 wrapper keeps "no scope ⇒ rev 0"',async()=>{
src/lib/facts/db.test.ts:341:  expect(await db.stateRevs([c,a,a],'US')).toEqual([{issuer_id:a,state_rev:0},{issuer_id:c,state_rev:0}]);
52:const ASYNC_METHODS=['claimLease','beginRun','stageFilings','stageFacts','quarantineFacts','publishRun','abandonRun','releaseLease','resolveFactsQuarantine','replaceMetrics','readFacts','factsByIds','openConflicts','filingsOfIssuer','updateFilingLink','reconcileScope','scopeDue','scopeRows','scopeAll','metricsOfIssuer','targetOf','lineageOf','stateRevs','readFactsLineage','readFilingFacts','replaceMetricsLineage','findFilingBySourceRef','filingsForCalendar','setFilingAcceptance','adoptCandidate','restoreReconciled','resolveLineageConflict','claimReconcileMember','applyReconcileResult','completeReconcileMember','failReconcileMember','openReconcileCycle','setMerge','setDissolved'] as const satisfies readonly (keyof FactsDb)[];
166:  const m=members.find(x=>typeof x.issuer_id==='string'&&UUID.test(x.issuer_id)&&x.issuer_id.toLowerCase()===f.issuer_id.toLowerCase()&&x.market===f.market&&Array.isArray(x.expected_keys));
210:  const set=[...new Set(members.map(m=>m.toLowerCase()))].sort(cmp);const inSet=new Set(set);
242:  const issuer=issuer0.toLowerCase();   // SQL compares uuids, not text
243:  const norm=lineageRevsFrom(basedOn.map(x=>({...x,issuer_id:String(x.issuer_id).toLowerCase()})));
405:  async reconcileScope(market,input,snapshotAt){
440:  async stateRevs(issuers,market){return [...new Set(issuers.map(i=>i.toLowerCase()))].sort(cmp).map(i=>({issuer_id:i,state_rev:scopeOf(i,market)?.state_rev??0}));},
643:   const members=i.members.map(m=>({...m,issuer_id:m.issuer_id.toLowerCase()}));
648:    ||i.pending.some(p=>!memberKeys.has(mk({issuer_id:String(p.issuer_id).toLowerCase(),market:p.market}))))throw new FactsDbError('invalid_members');
.claude:
.
..
agents
launch.json
scratch

exec
/bin/zsh -lc "sed -n '335,365p' src/lib/facts/db.test.ts; sed -n '400,430p' src/lib/facts/memory-facts-db.ts; rg -n 'replaceMetrics\\(' src/lib/facts/memory-facts-db.ts; find /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude -maxdepth 2 -name 'AGENTS*'; git status --short; sed -n '1,50p' src/lib/facts/memory-facts-db.ts" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:

describe('memoryFactsDb plan-3 specifics',()=>{
 it('topology helper, targetOf, stateRevs order; setMerge registers the target on the latest lineage cycle; the plan-2 wrapper keeps "no scope ⇒ rev 0"',async()=>{
  const db=memoryFactsDb();const [a,b,c]=['a','b','c'].map(x=>`${x}0000000-0000-4000-8000-000000000000`);
  db.setTopology({[a]:{status:'merged',merged_into:c},[b]:{status:'merged',merged_into:c}});
  expect(await db.lineageOf(c)).toEqual([c,a,b]);expect(await db.targetOf(a)).toBe(c);expect(await db.targetOf(c)).toBe(c);expect(await db.targetOf('unknown')).toBe('unknown');
  expect(await db.stateRevs([c,a,a],'US')).toEqual([{issuer_id:a,state_rev:0},{issuer_id:c,state_rev:0}]);
  await db.tables.insert('dq_reconcile_cycles',{pair:'facts.lineage_same_day',cycle_id:'old',status:'complete',started_at:'2026-01-01T00:00:00.000Z',detail:{}});
  await db.tables.insert('dq_reconcile_cycles',{pair:'facts.lineage_same_day',cycle_id:'new',status:'complete',started_at:'2026-02-01T00:00:00.000Z',detail:{pending_members:[{issuer_id:c,market:'US',source:'earlier-source'}]}});
  const s=`d0000000-0000-4000-8000-000000000000`;
  expect(await db.setMerge(s,c,'adm')).toEqual({repointed:0});
  const cycles=await db.tables.select('dq_reconcile_cycles',{pair:'facts.lineage_same_day'});
  expect(cycles.find(x=>x.cycle_id==='new')!.detail).toEqual({pending_members:[{issuer_id:c,market:'US',source:'earlier-source'},{issuer_id:c,market:'CN',source:s},{issuer_id:c,market:'US',source:s}]});   // one entry per merged source (plan audit Q2)
  expect(cycles.find(x=>x.cycle_id==='old')!.detail).toEqual({});
  expect(db.scope().filter(x=>x.issuer_id===s).map(x=>[x.market,x.priority,x.fetch_key,x.state_rev]).sort()).toEqual([['CN',0,'topology',1],['US',0,'topology',1]]);
  const m={issuer_id:'z',market:'US' as const,metric:'m',period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M' as const,value:'1',unit:'u',input_unit:'USD',basis:'us_standard',formula_version:'v',inputs:[],based_on_rev:0,based_on_lineage:[{issuer_id:'z',state_rev:0}],as_of:'2024-01-01'};
  await expect(db.replaceMetrics('z','US',0,[m])).rejects.toMatchObject({code:'scope_missing'});
  await expect(db.replaceMetrics('z','US',1,[m])).rejects.toMatchObject({code:'stale_computation'});
 });
 it('filings carry accepted_at/acceptance_source = null until setFilingAcceptance; readFilingFacts lists every generation with the run status',async()=>{
  const db=memoryFactsDb();const iss=randomUUID();const b=randomUUID();
  await db.reconcileScope('US',[{issuer_id:iss,reasons:[],priority:1,fetch_key:'k'}]);await db.claimLease(iss,'US',b,60);
  const run=await db.beginRun(iss,'US',b,1);const f=filingInsert(iss);await db.stageFilings(run,[f]);
  expect((await db.filingsOfIssuer(iss,'US',{}))[0]).toMatchObject({accepted_at:null,acceptance_source:null});
  const x=factInsert(iss,f);await db.stageFacts(run,[x]);
  expect(await db.readFilingFacts(f.filing_id,true)).toEqual([expect.objectContaining({fact_id:x.fact_id,status:'staged',run_status:'staged'})]);
  expect(await db.readFilingFacts(f.filing_id,false)).toEqual([]);
  await expect(db.setFilingAcceptance(f.filing_id,'2024-02-01T21:05:00Z','other' as 'sec_submissions')).rejects.toMatchObject({message:'invalid_acceptance'});
  expect(await db.setFilingAcceptance(f.filing_id,'2024-02-01T21:05:00Z','sec_submissions')).toBe(true);
  expect((await db.findFilingBySourceRef('edgar',f.sourceRef))!.accepted_at).toBe('2024-02-01T21:05:00.000Z');
 });
  },
  async updateFilingLink(filingId,patch){
   const p=linkPatch(patch);const g=filings.get(filingId);if(!g)return;
   Object.assign(g,p);
  },
  async reconcileScope(market,input,snapshotAt){
   let n=0;const snap=snapshotAt===undefined?null:new Date(snapshotAt).toISOString();
   for(const row of input){
    const k=sk(row.issuer_id,market);const s=scope.get(k);
    if(!s){scopeConfirmed.set(k,now());scope.set(k,{issuer_id:row.issuer_id,market,reasons:[...row.reasons],priority:row.priority,fetch_key:row.fetch_key,next_due_at:now(),lease_until:null,lease_batch_id:null,state_rev:0,last_attempt_at:null,last_success_at:null,last_batch_id:null,last_status:null});n++;continue;}
    if(JSON.stringify(s.reasons)!==JSON.stringify(row.reasons)||s.priority!==row.priority||s.fetch_key!==row.fetch_key){
     // A retirement of a still-active row is refused when a newer reconcile changed it after the sources were read.
     if(snap!==null&&row.priority===0&&s.priority>0&&(scopeConfirmed.get(k)??'')>snap)continue;
     s.reasons=[...row.reasons];s.priority=row.priority;s.fetch_key=row.fetch_key;scopeConfirmed.set(k,now());n++;
    }
    else if(row.priority>0&&s.priority>0)scopeConfirmed.set(k,now());   // unchanged active row: confirmed, not counted
   }
   return n;
  },
  async scopeDue(market,at,limit){
   if(limit<1)return [];
   const rows=[...scope.values()].filter(s=>s.market===market&&s.priority>0&&s.next_due_at<=new Date(at).toISOString());
   rows.sort((a,b)=>cmp(a.next_due_at,b.next_due_at)||(b.priority-a.priority)||cmp(a.issuer_id,b.issuer_id));
   return clone(rows.slice(0,limit));
  },
  async scopeRows(market,issuerIds){
   const want=new Set(issuerIds);
   return clone([...scope.values()].filter(s=>s.market===market&&want.has(s.issuer_id)).sort((a,b)=>cmp(a.issuer_id,b.issuer_id)));
  },
  async scopeAll(market){
   return clone([...scope.values()].filter(s=>s.market===market).sort((a,b)=>cmp(a.issuer_id,b.issuer_id)));
382:  async replaceMetrics(issuer,market,basedOnRev,input){
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-j8kPGjHm' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-LpvFNj62' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/9a-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/9a-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/9a-review-fix2.md
?? docs/audits/2026-11-05-data-foundation-3/codex/9a-review.md
// src/lib/facts/memory-facts-db.ts
// In-memory FactsDb for unit tests (spec §4.8, §11.1). It reproduces the SQL functions' rules so
// sync/plan/derive unit tests see the same behaviour as the database: scope rows and leases
// (claim / renew / expiry against an injectable clock), run lifecycle (begin abandons staged runs:
// mark → delete facts → prune empty gen-0 filings), the append-only status transitions, publish
// (staged→ok, conflict disposition derived from OPEN same_day_conflict items, mapping_gen
// activation with regression check, state_rev + 1), quarantine membership merge, resolve/promote
// eligibility, stale metric rejection, and the read_facts envelope (generation filter per filing,
// disclosure_seq / is_current / is_revision over ok rows, key ranking and limit, 10,000-row cap).
// dq_quarantine items live in the TableClient passed in (default: a fresh memoryTableClient) so
// plan-1 quarantine() and this db see the same rows in one test. Validation of a stageFacts batch
// happens before any row is written (one SQL statement). value_text = value as given (PostgreSQL
// would normalise e.g. 1e5; callers pass canonical decimals, §6.2).
// Plan 3: topology (setTopology / setMerge / setDissolved), lineage reads with cross-issuer suppression,
// lineage metrics, acceptance, candidate adoption, restore, lineage verdicts and the reconcile cursor,
// mirroring 20261107091000 (the cursor, cycles and results live in the TableClient so run.ts and this
// db see the same rows). Known differences from SQL: the plan-1 "open securities" trigger is not modelled
// (only pg tests it), no research_audit_log rows are written, unknown issuers count as active.
import {randomUUID} from 'node:crypto';
import {memoryTableClient} from '../db/memory-table-client';
import type {Row,TableClient} from '../db/table-client';
import {READ_FACTS_CAP,assertAllStaged,conflictFromItem,conflictPrefix,lineageRevsFrom,linkPatch} from './db';
import {factKey} from './keys';
import {FactsDbError} from './types';
import type {FactCandidate,FactRow,FactsDb,FilingRow,LineageConflict,LineageRev,Market,MetricRow,ReadFactsLineageResult,ReadFactsOptions,RunStatus,ScopeRow} from './types';
import type {ApplyReconcileOutcome,Fence,PendingMember,ReconcileResultInput} from '../dq/reconcile/types';
import {DATASETS} from '../dq/datasets';   // dataset strings only from the registry (datasets.test.ts literal scan)

export interface MemoryRun{run_id:string;issuer_id:string;market:Market;batch_id:string;mapping_gen:number;status:RunStatus;manifest:string[];started_at:string;published_at:string|null}
export interface MemoryTopology{status:'active'|'merged'|'dissolved';merged_into:string|null}
export interface MemoryFactsDb extends FactsDb{
 tables:TableClient;
 /** Fixes "now" for leases and timestamps; null returns to the wall clock. */
 setNow(iso:string|null):void;
 expireLease(issuer:string,market:Market):void;
 runs():MemoryRun[];filings():FilingRow[];facts():FactRow[];metrics():MetricRow[];scope():ScopeRow[];
 /** Test helper: issuer topology (memory has no issuers table). Unknown issuers are active with no merged_into. */
 setTopology(entries:Record<string,MemoryTopology>):void;
}

const canon=(s:string)=>{
 let t=s.trim();let neg=false;
 if(t.startsWith('-')){neg=true;t=t.slice(1);}else if(t.startsWith('+'))t=t.slice(1);
 const [i0,f0='']=t.split('.');
 const i=i0.replace(/^0+(?=\d)/,'')||'0';const f=f0.replace(/0+$/,'');
 const out=f?`${i}.${f}`:i;
 return out==='0'?'0':(neg?'-':'')+out;
};
/** numeric equality on decimal strings without exponent: sign of zero, leading and trailing zeros ignored. */
export function numericEquals(a:string,b:string):boolean{return canon(a)===canon(b);}

exec
/bin/zsh -lc "node -e 'const ts=require(\"typescript\"),fs=require(\"fs\");require.extensions[\".ts\"]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,\"utf8\"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);const {memoryFactsDb}=require(\"./src/lib/facts/memory-facts-db.ts\");(async()=>{const db=memoryFactsDb(),id=\"A0000000-0000-4000-8000-000000000000\";await db.reconcileScope(\"US\",[{issuer_id:id,reasons:[],priority:1,fetch_key:\"k\"}]);try{console.log(await db.replaceMetricsLineage(id,\"US\",[{issuer_id:id,state_rev:0}],[]))}catch(e){console.log(e.code)}await db.setDissolved(id,\"admin\");console.log(db.scope().map(r=>[r.issuer_id,r.state_rev]));console.log(await db.stateRevs([id],\"US\"))})()'" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 105ms:
scope_missing
[
  [ 'A0000000-0000-4000-8000-000000000000', 1 ],
  [ 'A0000000-0000-4000-8000-000000000000', 1 ]
]
[ { issuer_id: 'a0000000-0000-4000-8000-000000000000', state_rev: 0 } ]

codex
Partial UUID normalization introduces a confirmed regression in the memory adapter: existing uppercase-keyed scopes become inaccessible to lineage operations.

Review comment:

- [P2] Normalize issuer IDs consistently across memory writes and reads — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/facts/memory-facts-db.ts:242-245
  When an issuer is registered using an uppercase UUID, `reconcileScope`, fact staging, and topology setters still store the original casing, but these new lineage operations lowercase lookup keys. Consequently, `replaceMetricsLineage` now throws `scope_missing` for an existing scope, `stateRevs` returns zero for a nonzero revision, and lineage reads omit that issuer's facts. This is reproducible with `A0000000-0000-4000-8000-000000000000`. Normalize IDs at all storage and lookup boundaries together rather than only in these methods.
Partial UUID normalization introduces a confirmed regression in the memory adapter: existing uppercase-keyed scopes become inaccessible to lineage operations.

Review comment:

- [P2] Normalize issuer IDs consistently across memory writes and reads — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/facts/memory-facts-db.ts:242-245
  When an issuer is registered using an uppercase UUID, `reconcileScope`, fact staging, and topology setters still store the original casing, but these new lineage operations lowercase lookup keys. Consequently, `replaceMetricsLineage` now throws `scope_missing` for an existing scope, `stateRevs` returns zero for a nonzero revision, and lineage reads omit that issuer's facts. This is reproducible with `A0000000-0000-4000-8000-000000000000`. Normalize IDs at all storage and lookup boundaries together rather than only in these methods.

OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b11e-04b7-70b1-b73d-31a706f3ecf0
--------
user
commit 6769050
exec
/bin/zsh -lc 'pwd; git status --short; git show --stat --oneline 6769050; cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-jxANsXNP' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-JQkcQmeF' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/14b-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/14b-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/14b-review-fix2.md
?? docs/audits/2026-11-05-data-foundation-3/codex/14b-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-eKap8D1v' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-aBEBJjJM' (errno=Operation not permitted)
6769050 fix(dq): settle and record reconcile freshness through locked SQL functions; batch wrap, hook guards
 src/lib/db/memory-table-client.ts                  |  33 +++++-
 src/lib/dq/dq-extensions.integration.test.ts       |  73 ++++++++++++-
 src/lib/dq/reconcile/run.test.ts                   |  47 ++++++++-
 src/lib/dq/reconcile/run.ts                        | 113 ++++++++++++---------
 supabase/migrations.lock.json                      |   2 +-
 .../migrations/20261107091000_facts_extensions.sql |  85 ++++++++++++++++
 6 files changed, 303 insertions(+), 50 deletions(-)
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
/bin/zsh -lc 'find .. -name AGENTS.md -o -name AGENTS.override.md; cat AGENTS.md; git show 6769050 --' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 2169ms:
cat: AGENTS.md: No such file or directory
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-2YxsgSdC' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-69w69dlZ' (errno=Operation not permitted)
commit 6769050dde0c4a5242a39e684f99407bfdf41448
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 05:48:00 2026 -0800

    fix(dq): settle and record reconcile freshness through locked SQL functions; batch wrap, hook guards
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/db/memory-table-client.ts b/src/lib/db/memory-table-client.ts
index d601d06..381de04 100644
--- a/src/lib/db/memory-table-client.ts
+++ b/src/lib/db/memory-table-client.ts
@@ -8,7 +8,9 @@
 //  - ordering and range filters (gte/lt) compare numbers numerically and everything else as
 //    strings by UTF-16 code unit, which matches PostgreSQL only under C collation (ISO-8601
 //    timestamps in one fixed format compare correctly; mixed offsets or locales do not).
-//  - rpc emulates only the plan-3 row-locking functions (append_claim_evidence, patch_quarantine_detail, set_security_identifier, set_issuer_identifier, set_security_window, patch_security_provenance, close_security_absent); one synchronous JS turn stands for the row lock.
+//  - rpc emulates only the plan-3 row-locking functions (append_claim_evidence, patch_quarantine_detail, set_security_identifier, set_issuer_identifier, set_security_window, patch_security_provenance, close_security_absent, settle_reconcile_cycle, record_cycle_freshness); one synchronous JS turn stands for the row lock.
+import {CADENCES,computeFreshness} from '../dq/freshness';
+import type {Cadence} from '../dq/freshness';
 import {TableError,assertMatch,assertUpdateMatch,checkRangeOptions,checkSelectOptions} from './table-client';
 import type {RangeOptions,Row,TableClient} from './table-client';
 
@@ -35,6 +37,35 @@ const isObj=(v:unknown):v is Row=>!!v&&typeof v==='object'&&!Array.isArray(v);
 const sameEvidence=(a:unknown,b:Row)=>isObj(a)&&a.source===b.source&&a.evidence_sha256===b.evidence_sha256;
 const SHA256=/^[0-9a-f]{64}$/;
 const MEMORY_RPC:Record<string,(rowsOf:(t:string)=>Row[],a:Row)=>unknown>={
+ // Task 14b review: twins of settle_reconcile_cycle / record_cycle_freshness (migration 20261107091000 section 14); detail is only ever
+ // touched at the freshness key, so a pending_members entry registered meanwhile survives.
+ settle_reconcile_cycle(rowsOf,a){
+  const c=a.p_counts,f=a.p_freshness;
+  if(!isObj(c)||!isObj(f)||typeof f.ok!=='boolean'||f.status!=='pending'||(a.p_status!=='complete'&&a.p_status!=='complete_with_gaps'))throw new TableError('rpc','settle_reconcile_cycle','invalid_settlement','22023');
+  const row=rowsOf('dq_reconcile_cycles').find(r=>r.pair===a.p_pair&&r.cycle_id===a.p_cycle_id&&r.status==='running');
+  if(!row)return false;
+  Object.assign(row,{status:a.p_status,finished_at:typeof c.finished_at==='string'?c.finished_at:new Date().toISOString(),compared_passed:c.compared_passed,compared_failed:c.compared_failed,not_compared:c.not_compared,exec_failed_members:c.exec_failed_members,detail:{...(isObj(row.detail)?row.detail:{}),freshness:clone(f)}});
+  return true;
+ },
+ record_cycle_freshness(rowsOf,a){
+  const cadence=a.p_cadence as Cadence;
+  if(typeof a.p_dataset!=='string'||a.p_dataset.length<1||a.p_dataset.length>64||!CADENCES.includes(cadence)||typeof a.p_at!=='string'||!Number.isFinite(Date.parse(a.p_at)))throw new TableError('rpc','record_cycle_freshness','invalid_freshness','22023');
+  const row=rowsOf('dq_reconcile_cycles').find(r=>r.pair===a.p_pair&&r.cycle_id===a.p_cycle_id);
+  if(!row)return 'not_found';
+  if(row.status==='running')return 'not_terminal';
+  const d=isObj(row.detail)?row.detail:{};const f=d.freshness;
+  if(!isObj(f)||typeof f.ok!=='boolean')return 'no_freshness';
+  if(f.status==='recorded')return 'already';
+  const at=new Date(a.p_at);
+  const rows=rowsOf('dq_freshness');const ex=rows.find(r=>r.dataset===a.p_dataset);
+  const prevOk=ex?.last_ok_at?new Date(String(ex.last_ok_at)):null;
+  const errs=f.ok?0:Number(ex?.consecutive_errors??0)+1;
+  const lastOk=f.ok?at:prevOk;
+  const next={dataset:a.p_dataset,expected_cadence:cadence,last_ok_at:lastOk?lastOk.toISOString():null,last_attempt_at:at.toISOString(),consecutive_errors:errs,status:computeFreshness({cadence,lastOkAt:lastOk,consecutiveErrors:errs,now:at}),detail:isObj(f.detail)?clone(f.detail):{},updated_at:at.toISOString()};
+  if(ex)Object.assign(ex,next);else rows.push(next);
+  row.detail={...d,freshness:{...f,status:'recorded'}};
+  return 'recorded';
+ },
  append_claim_evidence(rowsOf,a){
   const e=a.p_evidence;
   if(!isObj(e)||typeof e.source!=='string'||e.source.length<1||e.source.length>64||typeof e.as_of!=='string'||typeof e.evidence_sha256!=='string'||!SHA256.test(e.evidence_sha256))
diff --git a/src/lib/dq/dq-extensions.integration.test.ts b/src/lib/dq/dq-extensions.integration.test.ts
index 7ef998d..64a10fc 100644
--- a/src/lib/dq/dq-extensions.integration.test.ts
+++ b/src/lib/dq/dq-extensions.integration.test.ts
@@ -16,6 +16,8 @@ import {pgTableClient} from '../db/pg-table-client';
 import {pgFactsDb} from '../facts/pg-facts-db';
 import {FORMULA_VERSION,materialize} from '../facts/derive';
 import {resolveFactsItem} from './facts-resolver';
+import {computeFreshness} from './freshness';
+import type {Cadence} from './freshness';
 
 const enabled=!!process.env.S4_TEST_STATE;
 const MIGRATION='supabase/migrations/20261107091000_facts_extensions.sql';
@@ -1022,9 +1024,78 @@ describe.skipIf(!enabled)('F3-4 facts extensions migration on real PostgreSQL',(
    expect(await q(`select count(*)::int n from public.dq_reconcile_cursor where pair=$1 and cycle_id=$2`,[pair,`${pair}-live`])).toEqual([{n:1}]);
   });
 
+  // ---- Task 14b review: settle_reconcile_cycle / record_cycle_freshness
+  const COUNTS={compared_passed:1,compared_failed:0,not_compared:0,exec_failed_members:0};
+  const settleC=(pair:string,id:string,ok:boolean,status='complete')=>one(`select public.settle_reconcile_cycle($1,$2,$3,$4::jsonb,$5::jsonb) v`,[pair,id,status,JSON.stringify(COUNTS),JSON.stringify({status:'pending',ok,detail:{cycle_id:id}})]) as Promise<boolean>;
+  const recordF=(pair:string,id:string,dataset:string,cadence:string,at:string)=>one(`select public.record_cycle_freshness($1,$2,$3,$4,$5::timestamptz) v`,[pair,id,dataset,cadence,at]) as Promise<string>;
+  const freshRow=async(dataset:string)=>(await q(`select * from public.dq_freshness where dataset=$1`,[dataset]))[0];
+
+  it('settle_reconcile_cycle: a pending_members entry committed while settlement waits on the cycle lock survives; only detail.freshness is added; a settled cycle answers false',async()=>{
+   const pair=newPair(),i1=await issuer();const id=await cycle(pair,[{issuer_id:i1,expected:1}]);
+   const entry={issuer_id:i1,market:'US',source:randomUUID()};
+   let settling:Promise<boolean>|undefined;
+   await inTx(admin,async({c,pid,commit})=>{
+    await c.query(`select pg_advisory_xact_lock(hashtext('dq_reconcile_cycle:'||$1))`,[pair]);   // what set_merge holds while it registers
+    settling=settleC(pair,id,true);settling.catch(()=>{});
+    await stillBlockedBehind(admin,pid,settling);
+    await c.query(`update public.dq_reconcile_cycles set detail = jsonb_set(detail,'{pending_members}',$3::jsonb) where pair=$1 and cycle_id=$2`,[pair,id,JSON.stringify([entry])]);
+    await commit();
+   });
+   await expect(settling).resolves.toBe(true);
+   const [row]=await q(`select status,finished_at,detail,compared_passed from public.dq_reconcile_cycles where pair=$1 and cycle_id=$2`,[pair,id]);
+   expect(row).toMatchObject({status:'complete',compared_passed:1,detail:{pending_members:[entry],freshness:{status:'pending',ok:true}}});
+   expect(row.finished_at).not.toBeNull();
+   expect(await settleC(pair,id,true)).toBe(false);
+   expect(await fails(one(`select public.settle_reconcile_cycle($1,$2,'running','{}'::jsonb,'{}'::jsonb) v`,[pair,id]))).toMatchObject({message:'invalid_settlement',code:'22023'});
+  });
+
+  it('record_cycle_freshness: idempotent per cycle — the second call answers already and consecutive_errors moved once; running / unknown / unsettled-freshness cycles are refused softly',async()=>{
+   const pair=newPair(),i1=await issuer(),i2=await issuer();const ds=`reconcile.${pair}`;
+   const id=await cycle(pair,[{issuer_id:i1,expected:1}]);
+   expect(await recordF(pair,id,ds,'weekly','2026-11-05T00:00:00Z')).toBe('not_terminal');
+   expect(await recordF(pair,'nope',ds,'weekly','2026-11-05T00:00:00Z')).toBe('not_found');
+   expect(await settleC(pair,id,false,'complete_with_gaps')).toBe(true);
+   expect(await recordF(pair,id,ds,'weekly','2026-11-05T00:00:00Z')).toBe('recorded');
+   expect(await recordF(pair,id,ds,'weekly','2026-11-05T00:00:00Z')).toBe('already');
+   expect(await freshRow(ds)).toMatchObject({consecutive_errors:1,status:'missing',expected_cadence:'weekly',detail:{cycle_id:id}});
+   expect((await q(`select detail from public.dq_reconcile_cycles where pair=$1 and cycle_id=$2`,[pair,id]))[0].detail).toMatchObject({freshness:{status:'recorded',ok:false}});
+   // a terminal cycle without a freshness marker (legacy rows)
+   const legacy=await cycle(pair,[{issuer_id:i2,expected:1}],'complete');
+   expect(await recordF(pair,legacy,ds,'weekly','2026-11-06T00:00:00Z')).toBe('no_freshness');
+   expect(await fails(recordF(pair,id,ds,'hourly','2026-11-05T00:00:00Z'))).toMatchObject({message:'invalid_freshness',code:'22023'});
+   // two failed cycles recorded in order give the second consecutive error → error
+   const id2=await cycle(pair,[{issuer_id:i2,expected:1}]);await settleC(pair,id2,false,'complete_with_gaps');
+   expect(await recordF(pair,id2,ds,'weekly','2026-11-12T00:00:00Z')).toBe('recorded');
+   expect(await freshRow(ds)).toMatchObject({consecutive_errors:2,status:'error'});
+  });
+
+  it('record_cycle_freshness: the SQL status / counters / last_ok_at equal the TS recordAttempt + computeFreshness on a table of cases',async()=>{
+   const day=86_400_000,at=new Date('2026-11-20T00:00:00Z');
+   const cases:{cadence:Cadence;ok:boolean;prior?:{lastOkAgeDays:number|null;errors:number}}[]=[
+    {cadence:'weekly',ok:true},{cadence:'weekly',ok:false},{cadence:'weekly',ok:false,prior:{lastOkAgeDays:null,errors:1}},
+    {cadence:'weekly',ok:false,prior:{lastOkAgeDays:8,errors:0}},{cadence:'weekly',ok:false,prior:{lastOkAgeDays:9,errors:0}},{cadence:'weekly',ok:false,prior:{lastOkAgeDays:10,errors:0}},
+    {cadence:'daily',ok:false,prior:{lastOkAgeDays:3,errors:0}},{cadence:'daily',ok:false,prior:{lastOkAgeDays:4,errors:0}},
+    {cadence:'monthly',ok:false,prior:{lastOkAgeDays:34,errors:0}},{cadence:'monthly',ok:false,prior:{lastOkAgeDays:35,errors:0}},
+    {cadence:'quarterly',ok:false,prior:{lastOkAgeDays:95,errors:0}},{cadence:'quarterly',ok:false,prior:{lastOkAgeDays:96,errors:0}},
+    {cadence:'event',ok:false,prior:{lastOkAgeDays:400,errors:0}},{cadence:'event',ok:false},
+    {cadence:'weekly',ok:true,prior:{lastOkAgeDays:30,errors:5}},
+   ];
+   for(const [n,k] of cases.entries()){
+    const pair=newPair(),i1=await issuer();const ds=`reconcile.${pair}`;const id=await cycle(pair,[{issuer_id:i1,expected:1}]);
+    const prevOk=k.prior&&k.prior.lastOkAgeDays!==null?new Date(at.getTime()-k.prior.lastOkAgeDays*day):null;
+    if(k.prior)await q(`insert into public.dq_freshness(dataset,expected_cadence,last_ok_at,last_attempt_at,consecutive_errors,status) values($1,$2,$3,$3,$4,$5)`,[ds,k.cadence,prevOk,k.prior.errors,prevOk?'fresh':'missing']);
+    await settleC(pair,id,k.ok,k.ok?'complete':'complete_with_gaps');
+    expect(await recordF(pair,id,ds,k.cadence,at.toISOString())).toBe('recorded');
+    const errors=k.ok?0:(k.prior?.errors??0)+1,lastOk=k.ok?at:prevOk;
+    const want=computeFreshness({cadence:k.cadence,lastOkAt:lastOk,consecutiveErrors:errors,now:at});
+    const got=await freshRow(ds);
+    expect({n,status:got.status,errors:got.consecutive_errors,lastOk:got.last_ok_at?new Date(got.last_ok_at).toISOString():null}).toEqual({n,status:want,errors,lastOk:lastOk?lastOk.toISOString():null});
+   }
+  });
+
   it('grants: cursor functions, apply_reconcile_result and open_reconcile_cycle are service_role only; the fence helper is closed to every role; replays',async()=>{
    const fn=(role:string,sig:string)=>one(`select has_function_privilege($1,$2,'EXECUTE') v`,[role,sig]);
-   for(const sig of ['public.claim_reconcile_member(text,text,uuid,text,uuid)','public.complete_reconcile_member(jsonb)','public.fail_reconcile_member(jsonb,text)','public.apply_reconcile_result(jsonb,jsonb)','public.open_reconcile_cycle(text,text,timestamptz,jsonb,jsonb)']){
+   for(const sig of ['public.claim_reconcile_member(text,text,uuid,text,uuid)','public.complete_reconcile_member(jsonb)','public.fail_reconcile_member(jsonb,text)','public.apply_reconcile_result(jsonb,jsonb)','public.open_reconcile_cycle(text,text,timestamptz,jsonb,jsonb)','public.settle_reconcile_cycle(text,text,text,jsonb,jsonb)','public.record_cycle_freshness(text,text,text,text,timestamptz)']){
     for(const role of ['anon','authenticated'])expect({sig,role,ok:await fn(role,sig)}).toEqual({sig,role,ok:false});
     expect(await fn('service_role',sig)).toBe(true);
    }
diff --git a/src/lib/dq/reconcile/run.test.ts b/src/lib/dq/reconcile/run.test.ts
index 2ae7bbc..4881a8a 100644
--- a/src/lib/dq/reconcile/run.test.ts
+++ b/src/lib/dq/reconcile/run.test.ts
@@ -308,7 +308,7 @@ describe('runReconcile — review P1/P2 (hook CAS, durable freshness)',()=>{
   expect(r.errors).toContainEqual({code:'skipped_summary',key:`${id}:hook_stale`});
  });
  const failingFreshness=(t:TableClient,state:{fail:boolean}):TableClient=>({...t,
-  async upsert(tb,row,key){if(tb==='dq_freshness'&&state.fail)throw new Error('freshness_down');return t.upsert(tb,row,key);}
+  async rpc(fn,a){if(fn==='record_cycle_freshness'&&state.fail)throw new Error('freshness_down');return t.rpc!(fn,a);}
   } as TableClient);
  it('P2: an interruption after the settling update (recordAttempt throws) leaves freshness pending; the next run start records it',async()=>{
   const h=harness(stubPair([{issuerId:A,market:'US',expectedKeys:keys('k1')}],()=>[miss('k1')]));
@@ -333,4 +333,49 @@ describe('runReconcile — review P1/P2 (hook CAS, durable freshness)',()=>{
   expect(await freshness(h.tables)).toMatchObject({consecutive_errors:2});
   for(const id of ['a-older','b-newer']){const [c]=await h.tables.select(CYCLE_TABLE,{pair:PAIR,cycle_id:id});expect((c.detail as {freshness:Row}).freshness.status).toBe('recorded');}
  });
+
+ it('review: a pending_members entry registered while the cycle runs survives settlement (settle touches only detail.freshness)',async()=>{
+  let h:ReturnType<typeof harness>;
+  const entry={issuer_id:B,market:'US',source:'src-b'};
+  h=harness(stubPair([{issuerId:A,market:'US',expectedKeys:keys('k1')}],async()=>{   // set_merge commits during the member
+   const [c]=await h.tables.select(CYCLE_TABLE,{pair:PAIR,status:'running'});
+   await h.tables.update(CYCLE_TABLE,{pair:PAIR,cycle_id:c.cycle_id},{detail:{...(c.detail as Row),pending_members:[entry]}});
+   return [rec('k1')];}));
+  const r=await runReconcile(h.deps,{pair:PAIR,triggeredBy:'cron'});
+  expect(r.cycle).toMatchObject({settled:true});
+  const [c]=await h.tables.select(CYCLE_TABLE,{pair:PAIR});
+  expect(c.detail).toMatchObject({pending_members:[entry],freshness:{status:'recorded',ok:true}});
+ });
+ it('review: after a successful settle an older pending cycle is recorded first (ordered replay), not the new cycle directly',async()=>{
+  const h=harness(stubPair([{issuerId:A,market:'US',expectedKeys:keys('k1')}],()=>[rec('k1')]));
+  await h.tables.insert(CYCLE_TABLE,{pair:PAIR,cycle_id:'older',started_at:'2026-11-01T00:00:00.000Z',finished_at:'2026-11-01T00:00:00.000Z',members:[],status:'complete_with_gaps',expected_total:0,compared_passed:0,compared_failed:0,not_compared:0,exec_failed_members:0,detail:{freshness:{status:'pending',ok:false,detail:{}}}});
+  let calls=0;
+  const flaky:TableClient={...h.tables,async rpc(fn,a){if(fn==='record_cycle_freshness'&&calls++===0)throw new Error('freshness_down');return h.tables.rpc!(fn,a);}};
+  const r=await runReconcile({...h.deps,tables:flaky},{pair:PAIR,triggeredBy:'cron'});   // run-start replay fails once; the post-settle replay must do older then new
+  expect(r.cycle).toMatchObject({settled:true,status:'complete'});
+  expect(await freshness(h.tables)).toMatchObject({consecutive_errors:0,status:'fresh'});   // old failure first, then the success
+  const [o]=await h.tables.select(CYCLE_TABLE,{pair:PAIR,cycle_id:'older'});
+  expect((o.detail as {freshness:Row}).freshness.status).toBe('recorded');
+ });
+ it('review: an exception after startBatch closes the batch with code unknown and is rethrown',async()=>{
+  const h=harness(stubPair([{issuerId:A,market:'US',expectedKeys:keys('k1')}],()=>[rec('k1')]));
+  const broken:TableClient={...h.tables,async update(t,m,p){if(t==='ingest_batches'&&'tool_versions' in p)throw new Error('db_down');return h.tables.update(t,m,p);}};
+  await expect(runReconcile({...h.deps,tables:broken},{pair:PAIR,triggeredBy:'cron'})).rejects.toThrow('db_down');
+  const [b]=await h.tables.select('ingest_batches',{});
+  expect(b.status).not.toBe('running');
+  expect(JSON.stringify(b.errors)).toContain('"unknown"');
+ });
+ it('review: an unresolvable merge target fails only that hook (target_unresolved) and the member still completes',async()=>{
+  const h=harness(stubPair([],()=>[]));
+  const seeded=await seedPublished(h.db,{issuer:A,market:'US',sourceRef:'acc-a',availableDate:'2024-02-01',facts:[{concept:'revenue',value:'100',period_start:'2023-01-01',period_end:'2023-12-31'}]});
+  const [fact]=await h.db.factsByIds(seeded.factIds);
+  const pair=stubPair([{issuerId:A,market:'US',expectedKeys:keys('k2')}],()=>[rec('k2',{passed:false,left_value:'100',right_value:'101',abs_diff:'1',rel_diff:'0.01',action:'quarantine_left',left_fact_id:fact.fact_id,inputs_hash:'h',
+   item:{natural_key:`${PAIR}:k2:${fact.fact_id}`,payload:{key:{issuer_id:A,market:'US',concept:'revenue'},fact_ids:[fact.fact_id],left_value:'100',right_value:'101',right_locator:{}},detail:{pair:PAIR,inputs_hash:'h',issuer_id:A,market:'US'}}})]);
+  const broken:TableClient={...h.tables,async select(t,m,o){if(t==='issuers')throw new Error('issuers_down');return h.tables.select(t,m,o);}};
+  const r=await runReconcile({...h.deps,tables:broken,pairs:{[PAIR]:pair}},{pair:PAIR,triggeredBy:'cron'});
+  expect(r.members[0]).toMatchObject({outcome:'done'});
+  expect(r.errors).toContainEqual(expect.objectContaining({code:'materialize_error',message:expect.stringContaining('target_unresolved')}));
+  const [item]=await h.tables.select('dq_quarantine',{reason_code:'reconcile_mismatch'});
+  expect((item.detail as {hook:{state:string;message:string}}).hook).toMatchObject({state:'failed',message:'target_unresolved'});
+ });
 });
diff --git a/src/lib/dq/reconcile/run.ts b/src/lib/dq/reconcile/run.ts
index 713bd84..0b10d20 100644
--- a/src/lib/dq/reconcile/run.ts
+++ b/src/lib/dq/reconcile/run.ts
@@ -21,13 +21,22 @@
 //     fail_reconcile_member (the third failure is terminal);
 //  4. settlement when every cursor is done or terminally failed: each done cursor must satisfy
 //     drc_done_accounted (never coalesced); complete iff not_compared = 0 and no failed member; freshness
-//     reconcile.<pair> (weekly) is recorded ONLY by the worker whose guarded update settled the cycle.
+//     reconcile.<pair> (weekly) is made durable in the settling update itself (settle_reconcile_cycle writes
+//     detail.freshness={status:'pending',ok,detail}; only that key of detail, so pending_members written by
+//     set_merge are never clobbered) and recorded by record_cycle_freshness, which is idempotent per cycle
+//     (a cycle increments consecutive_errors at most once). Recording is ALWAYS done by replayFreshness:
+//     at run start and again right after a successful settle, oldest finished cycle first, stopping at the
+//     first failure so the order is kept.
+// cursor.attempts counts CLAIMS, not failures: a lease timeout or a lost fence consumes an attempt just like
+// a thrown evaluate does; after MAX_CURSOR_ATTEMPTS (3) claims the member is terminal (exec_failed_members).
+// Everything after startBatch runs inside one try/catch like runFactsSync: an unexpected exception is pushed
+// as {code:'unknown'}, the batch is finished best-effort and the error is rethrown (no batch left running).
 // Batch counts (§5.5): fetched = keys applied; inserted = passed; duplicates = reused; quarantined =
 // mismatches that went to (or back to) an item; failed = non-compared results + mismatches recorded without
 // an item + member failures. A ReconcileConfigError (bad gold/sample file, unresolvable issuer) fails the
 // batch with its code and creates no cycle. Dry run: members + evaluate only, no writes by the runner.
 import {randomUUID} from 'node:crypto';
-import {TableError,selectAll} from '../../db/table-client';
+import {TableError,callRpc,selectAll} from '../../db/table-client';
 import type {Row,TableClient} from '../../db/table-client';
 import {materialize as materializeFacts} from '../../facts/derive';
 import {makeBudget} from '../../facts/sync';
@@ -36,7 +45,6 @@ import type {FactsDb,Market} from '../../facts/types';
 import {emptyCounts,finishBatch,startBatch} from '../batches';
 import type {BatchCounts,BatchError,BatchStatus,TriggeredBy} from '../batches';
 import {DATASETS} from '../datasets';
-import {recordAttempt} from '../freshness';
 import {writeHookCas} from '../facts-resolver';
 import type {HookState} from '../facts-resolver';
 import type {RawStore} from '../raw-store';
@@ -159,14 +167,22 @@ async function observedHookAt(tables:TableClient,id:string):Promise<string|undef
 }
 async function runHooks(deps:ReconcileDeps,list:HookItem[],errors:BatchError[]):Promise<number>{
  const mat=deps.materialize??((db:FactsDb,issuer:string,market:Market)=>materializeFacts(db,issuer,market));
+ let failed=0;
  const groups=new Map<string,{target:string;market:Market;items:{id:string;at:string|undefined}[]}>();
  for(const x of list){
-  const target=await targetOf(deps.tables,x.issuerId);const k=mkey(target,x.market);
+  let target:string;
+  try{target=await targetOf(deps.tables,x.issuerId);}
+  catch(e){   // an unresolvable target fails only this item's hook; the next run's step 0 retries it
+   const code=e instanceof Error?e.message.slice(0,100):'target_unresolved';
+   errors.push({code:'materialize_error',key:mkey(x.issuerId,x.market),message:`target_unresolved:${code}`});failed++;
+   if(x.itemId)await writeHookCas(deps.tables,x.itemId,{stage:'materialize',state:'failed',at:deps.now().toISOString(),message:'target_unresolved'},typeof x.hookAt==='string'?x.hookAt:await observedHookAt(deps.tables,x.itemId));
+   continue;
+  }
+  const k=mkey(target,x.market);
   const g=groups.get(k)??{target,market:x.market,items:[] as {id:string;at:string|undefined}[]};
   // the hook.at the item carries BEFORE we materialize: the done/failed write is compare-and-set on it (Task 14b review P1)
   if(x.itemId)g.items.push({id:x.itemId,at:typeof x.hookAt==='string'?x.hookAt:await observedHookAt(deps.tables,x.itemId)});groups.set(k,g);
  }
- let failed=0;
  for(const g of groups.values()){
   let hook:Hook;
   try{await mat(deps.db,g.target,g.market);hook={stage:'done',state:'done',at:deps.now().toISOString()};}
@@ -212,7 +228,10 @@ async function processMember(deps:ReconcileDeps,pair:RegisteredPair,ctx:PairRunC
  const key=mkey(fence.issuer_id,fence.market);
  const report=(outcome:MemberOutcome,extra:{counts?:MemberCounts;code?:string}={}):MemberReport=>({issuerId:fence.issuer_id,market:fence.market,outcome,...extra});
  const hooks:HookItem[]=[];
- const flush=async()=>{if(hooks.length>0){await runHooks(deps,hooks.splice(0),errors);}};
+ const flush=async()=>{   // never throws: a hook problem must not keep failReconcileMember from running
+  if(hooks.length===0)return;
+  try{await runHooks(deps,hooks.splice(0),errors);}catch(e){errors.push({code:'materialize_error',key,message:`hook_flush:${e instanceof Error?e.message.slice(0,100):'unknown'}`});}
+ };
  try{
   const accepted=await acceptedKeys(deps.tables,fence);
   const missing:MemberPlan={...plan,expectedKeys:plan.expectedKeys.filter(k=>!accepted.has(k.naturalKey))};
@@ -245,20 +264,16 @@ const freshnessOf=(row:Row):Freshness|null=>{
  const f=((row.detail??{}) as {freshness?:Partial<Freshness>}).freshness;
  return f&&(f.status==='pending'||f.status==='recorded')&&typeof f.ok==='boolean'?{status:f.status,ok:f.ok,detail:(f.detail??{}) as Record<string,unknown>}:null;
 };
-/** recordAttempt for one settled cycle, then flag it recorded (durable, ordered; Task 14b review P2). Never throws: false = still pending. */
+/** record_cycle_freshness for one settled cycle (idempotent per cycle). Never throws: false = still pending. */
 async function recordFreshness(deps:ReconcileDeps,pair:CyclePairId,row:Row,errors:BatchError[]):Promise<boolean>{
- const f=freshnessOf(row);if(!f)return true;
  const cycleId=String(row.cycle_id);
  try{
-  if(f.status==='pending'){
-   await recordAttempt(deps.tables,DATASETS.reconcile(pair),{ok:f.ok,cadence:'weekly',now:row.finished_at?new Date(String(row.finished_at)):deps.now(),detail:f.detail});
-  }
-  const [cur]=await deps.tables.select(CYCLE_TABLE,{pair,cycle_id:cycleId},{limit:1});
-  await deps.tables.update(CYCLE_TABLE,{pair,cycle_id:cycleId},{detail:{...((cur?.detail??{}) as Row),freshness:{...f,status:'recorded'}}});
-  return true;
+  const r=await callRpc(deps.tables,'record_cycle_freshness',{p_pair:pair,p_cycle_id:cycleId,p_dataset:DATASETS.reconcile(pair),p_cadence:'weekly',p_at:row.finished_at?new Date(String(row.finished_at)).toISOString():deps.now().toISOString()});
+  if(r==='recorded'||r==='already'||r==='no_freshness')return true;
+  errors.push({code:'freshness_pending',key:cycleId,message:String(r)});return false;
  }catch(e){errors.push({code:'freshness_pending',key:cycleId,message:e instanceof Error?e.message:String(e)});return false;}
 }
-/** Run start: terminal cycles of this pair whose freshness is still pending, oldest finished first; stops at the first failure to keep the order. */
+/** Terminal cycles of this pair whose freshness is still pending, oldest finished first; stops at the first failure to keep the order. */
 async function replayFreshness(deps:ReconcileDeps,pair:CyclePairId,errors:BatchError[]):Promise<void>{
  const rows=(await selectAll(deps.tables,CYCLE_TABLE,{pair},'cycle_id')).filter(r=>r.status!=='running'&&freshnessOf(r)?.status==='pending')
   .sort((a,b)=>String(a.finished_at)<String(b.finished_at)?-1:String(a.finished_at)>String(b.finished_at)?1:String(a.cycle_id)<String(b.cycle_id)?-1:1);
@@ -276,14 +291,13 @@ async function settle(deps:ReconcileDeps,pair:CyclePairId,cycleId:string,errors:
   passed+=v[0]!;failedCmp+=v[1]!;notCompared+=v[2]!;
  }
  const status:CycleStatus=notCompared===0&&failedMembers===0?'complete':'complete_with_gaps';
- const now=deps.now();
- const [cur]=await deps.tables.select(CYCLE_TABLE,{pair,cycle_id:cycleId},{limit:1});
  const fdetail={cycle_id:cycleId,compared_passed:passed,compared_failed:failedCmp,not_compared:notCompared,exec_failed_members:failedMembers};
- // freshness is written pending IN the settling update, so a crash before recordAttempt is replayed at the next run start (review P2)
- const n=await deps.tables.update(CYCLE_TABLE,{pair,cycle_id:cycleId,status:'running'},{status,finished_at:now.toISOString(),compared_passed:passed,compared_failed:failedCmp,not_compared:notCompared,exec_failed_members:failedMembers,detail:{...((cur?.detail??{}) as Row),freshness:{status:'pending',ok:status==='complete',detail:fdetail}}});
- if(n!==1)return {settled:false,status};
- const [settledRow]=await deps.tables.select(CYCLE_TABLE,{pair,cycle_id:cycleId},{limit:1});
- if(settledRow)await recordFreshness(deps,pair,settledRow,errors);
+ // one locked SQL step: status/counters + detail.freshness (pending) only; it never rewrites other detail keys (pending_members)
+ const ok=await callRpc(deps.tables,'settle_reconcile_cycle',{p_pair:pair,p_cycle_id:cycleId,p_status:status,
+  p_counts:{compared_passed:passed,compared_failed:failedCmp,not_compared:notCompared,exec_failed_members:failedMembers,finished_at:deps.now().toISOString()},
+  p_freshness:{status:'pending',ok:status==='complete',detail:fdetail}});
+ if(ok!==true)return {settled:false,status};
+ await replayFreshness(deps,pair,errors);   // ordered: an older pending cycle is recorded before this one
  return {settled:true,status};
 }
 
@@ -314,29 +328,36 @@ export async function runReconcile(deps:ReconcileDeps,opts:ReconcileOptions):Pro
   const status=await finishBatch(deps.tables,batchId,{counts,errors},deps.now());
   return {batchId,status,counts,errors,cycle,members,hooks} satisfies ReconcileReceipt;
  };
- const ctx:PairRunContext={...base,batchId,dryRun:false};
- let opened:{row:Row;created:boolean};
- try{opened=await openCycle(deps,pair,ctx);}
- catch(e){if(e instanceof ReconcileConfigError){errors.push({code:e.code,message:e.message});return finish(null);}throw e;}
- const cycleId=String(opened.row.cycle_id);const frozen=frozenOf(opened.row);
- await deps.tables.update('ingest_batches',{batch_id:batchId,status:'running'},{tool_versions:tool(cycleId)});
- await ensureCursors(deps.tables,pair.id,cycleId,frozen);
- const plans=new Map<string,MemberPlan>(frozen.map(m=>[mkey(m.issuer_id,m.market),{issuerId:m.issuer_id,market:m.market,expectedKeys:m.expected_keys}]));
- for(const c of await readCursors(deps.tables,pair.id,cycleId)){
-  const issuerId=String(c.issuer_id),market=c.market as Market,key=mkey(issuerId,market);
-  if(want&&!want.has(issuerId))continue;
-  if(!claimable(c,deps.now()))continue;
-  const plan=plans.get(key);
-  if(!plan){errors.push({code:'member_failed',key,message:'cursor_without_member'});continue;}
-  if(budget.remainingMs()<MIN_MEMBER_MS){errors.push({code:'deadline_hit',key});members.push({issuerId,market,outcome:'not_started'});continue;}
-  const fence=await deps.db.claimReconcileMember(pair.id,cycleId,issuerId,market,batchId);
-  if(!fence){errors.push({code:'skipped_summary',key:`${key}:claimed`});members.push({issuerId,market,outcome:'claimed_elsewhere'});continue;}
-  const r=await processMember(deps,pair,ctx,fence,plan,counts,errors,outcomes);
-  members.push(r);
-  if(r.outcome==='fence_lost')break;
+ try{
+  const ctx:PairRunContext={...base,batchId,dryRun:false};
+  let opened:{row:Row;created:boolean};
+  try{opened=await openCycle(deps,pair,ctx);}
+  catch(e){if(e instanceof ReconcileConfigError){errors.push({code:e.code,message:e.message});return finish(null);}throw e;}
+  const cycleId=String(opened.row.cycle_id);const frozen=frozenOf(opened.row);
+  await deps.tables.update('ingest_batches',{batch_id:batchId,status:'running'},{tool_versions:tool(cycleId)});
+  await ensureCursors(deps.tables,pair.id,cycleId,frozen);
+  const plans=new Map<string,MemberPlan>(frozen.map(m=>[mkey(m.issuer_id,m.market),{issuerId:m.issuer_id,market:m.market,expectedKeys:m.expected_keys}]));
+  for(const c of await readCursors(deps.tables,pair.id,cycleId)){
+   const issuerId=String(c.issuer_id),market=c.market as Market,key=mkey(issuerId,market);
+   if(want&&!want.has(issuerId))continue;
+   if(!claimable(c,deps.now()))continue;
+   const plan=plans.get(key);
+   if(!plan){errors.push({code:'member_failed',key,message:'cursor_without_member'});continue;}
+   if(budget.remainingMs()<MIN_MEMBER_MS){errors.push({code:'deadline_hit',key});members.push({issuerId,market,outcome:'not_started'});continue;}
+   const fence=await deps.db.claimReconcileMember(pair.id,cycleId,issuerId,market,batchId);
+   if(!fence){errors.push({code:'skipped_summary',key:`${key}:claimed`});members.push({issuerId,market,outcome:'claimed_elsewhere'});continue;}
+   const r=await processMember(deps,pair,ctx,fence,plan,counts,errors,outcomes);
+   members.push(r);
+   if(r.outcome==='fence_lost')break;
+  }
+  let settled:{settled:boolean;status:CycleStatus}={settled:false,status:'running'};
+  try{settled=await settle(deps,pair.id,cycleId,errors);}
+  catch(e){if(e instanceof ReconcileError&&e.code==='cursor_unaccounted')errors.push({code:'cursor_unaccounted',key:e.message});else throw e;}
+  return finish({cycleId,status:settled.status,created:opened.created,settled:settled.settled,expectedTotal:Number(opened.row.expected_total)});
+ }catch(e){
+  // infrastructure failure after the batch started: close the receipt so no running batch dangles, then rethrow (like runFactsSync)
+  errors.push({code:'unknown',message:e instanceof Error?e.message:String(e)});
+  try{await finishBatch(deps.tables,batchId,{counts,errors},deps.now());}catch{/* left running; the runbook marks it failed */}
+  throw e;
  }
- let settled:{settled:boolean;status:CycleStatus}={settled:false,status:'running'};
- try{settled=await settle(deps,pair.id,cycleId,errors);}
- catch(e){if(e instanceof ReconcileError&&e.code==='cursor_unaccounted')errors.push({code:'cursor_unaccounted',key:e.message});else throw e;}
- return finish({cycleId,status:settled.status,created:opened.created,settled:settled.settled,expectedTotal:Number(opened.row.expected_total)});
 }
diff --git a/supabase/migrations.lock.json b/supabase/migrations.lock.json
index a5b25f8..e54d889 100644
--- a/supabase/migrations.lock.json
+++ b/supabase/migrations.lock.json
@@ -207,7 +207,7 @@
     },
     {
       "file": "20261107091000_facts_extensions.sql",
-      "sha256": "9401030a2c62f380a23e01e3e779b78e729a5ceec75ed5ba8f8bab9022534d6a"
+      "sha256": "cc9c4a3263f18a394f636dfbe87fb739401e407804dd5b7041161e82dbd26349"
     }
   ]
 }
diff --git a/supabase/migrations/20261107091000_facts_extensions.sql b/supabase/migrations/20261107091000_facts_extensions.sql
index 3fdedba..5799f4f 100644
--- a/supabase/migrations/20261107091000_facts_extensions.sql
+++ b/supabase/migrations/20261107091000_facts_extensions.sql
@@ -1103,3 +1103,88 @@ begin
 end $$;
 revoke execute on function public.open_reconcile_cycle(text, text, timestamptz, jsonb, jsonb) from public, anon, authenticated;
 grant execute on function public.open_reconcile_cycle(text, text, timestamptz, jsonb, jsonb) to service_role;
+
+-- ---------------------------------------------------------------- 14. settle_reconcile_cycle, record_cycle_freshness (Task 14b review)
+-- The runner never read-modify-writes a cycle row's detail: pending_members (set_merge, open_reconcile_cycle) and the freshness
+-- marker are separate jsonb keys written only through jsonb_set under the row lock. Lock order = header rule: the pair's cycle
+-- advisory lock first, then (record only) the per-dataset advisory lock, then the cycle row.
+--  settle_reconcile_cycle(pair, cycle, status, counts, freshness): running -> complete|complete_with_gaps with the counters,
+--    finished_at (counts.finished_at, else now()) and detail.freshness = p_freshness ({status:'pending', ok, detail}); no other
+--    detail key is touched. false = the cycle is not running (someone else settled it / unknown).
+--  record_cycle_freshness(pair, cycle, dataset, cadence, at): idempotent per cycle. 'already' when detail.freshness.status is
+--    'recorded'; otherwise it ports src/lib/dq/freshness.ts::recordAttempt + computeFreshness exactly (read-then-upsert of
+--    dq_freshness: consecutive_errors, last_ok_at, last_attempt_at, status, detail, updated_at) and marks the cycle recorded in
+--    the same transaction, so a cycle can increment consecutive_errors at most once. The per-dataset advisory lock stops
+--    concurrent writers losing an increment. 'not_found' | 'not_terminal' | 'no_freshness' otherwise.
+create or replace function public.settle_reconcile_cycle(p_pair text, p_cycle_id text, p_status text, p_counts jsonb, p_freshness jsonb)
+returns boolean language plpgsql security definer set search_path = public as $$
+declare v_row public.dq_reconcile_cycles; v_n int;
+begin
+  if p_pair is null or p_cycle_id is null or p_status not in ('complete', 'complete_with_gaps')
+     or jsonb_typeof(p_counts) is distinct from 'object' or jsonb_typeof(p_freshness) is distinct from 'object'
+     or jsonb_typeof(p_freshness -> 'ok') is distinct from 'boolean' or (p_freshness ->> 'status') is distinct from 'pending'
+  then raise exception 'invalid_settlement' using errcode = '22023'; end if;
+  perform pg_advisory_xact_lock(hashtext('dq_reconcile_cycle:' || p_pair));
+  select * into v_row from public.dq_reconcile_cycles where pair = p_pair and cycle_id = p_cycle_id and status = 'running' for update;
+  if not found then return false; end if;
+  update public.dq_reconcile_cycles
+  set status = p_status,
+      finished_at = coalesce((p_counts ->> 'finished_at')::timestamptz, now()),
+      compared_passed = (p_counts ->> 'compared_passed')::int,
+      compared_failed = (p_counts ->> 'compared_failed')::int,
+      not_compared = (p_counts ->> 'not_compared')::int,
+      exec_failed_members = (p_counts ->> 'exec_failed_members')::int,
+      detail = jsonb_set(detail, '{freshness}', p_freshness)
+  where pair = p_pair and cycle_id = p_cycle_id;
+  get diagnostics v_n = row_count;
+  return v_n = 1;
+end $$;
+revoke execute on function public.settle_reconcile_cycle(text, text, text, jsonb, jsonb) from public, anon, authenticated;
+grant execute on function public.settle_reconcile_cycle(text, text, text, jsonb, jsonb) to service_role;
+
+create or replace function public.record_cycle_freshness(p_pair text, p_cycle_id text, p_dataset text, p_cadence text, p_at timestamptz)
+returns text language plpgsql security definer set search_path = public as $$
+declare
+  v_row public.dq_reconcile_cycles; v_fresh jsonb; v_ok boolean; v_ex public.dq_freshness;
+  v_prev_ok timestamptz; v_prev_err int; v_err int; v_last_ok timestamptz; v_status text;
+  v_window interval; v_grace interval;
+begin
+  if p_pair is null or p_cycle_id is null or p_at is null or p_dataset is null or length(p_dataset) not between 1 and 64
+     or p_cadence is null or p_cadence not in ('daily', 'weekly', 'monthly', 'quarterly', 'event')
+  then raise exception 'invalid_freshness' using errcode = '22023'; end if;
+  perform pg_advisory_xact_lock(hashtext('dq_reconcile_cycle:' || p_pair));
+  perform pg_advisory_xact_lock(hashtext('dq_freshness:' || p_dataset));
+  select * into v_row from public.dq_reconcile_cycles where pair = p_pair and cycle_id = p_cycle_id for update;
+  if not found then return 'not_found'; end if;
+  if v_row.status = 'running' then return 'not_terminal'; end if;
+  v_fresh := v_row.detail -> 'freshness';
+  if jsonb_typeof(v_fresh) is distinct from 'object' or jsonb_typeof(v_fresh -> 'ok') is distinct from 'boolean' then return 'no_freshness'; end if;
+  if v_fresh ->> 'status' = 'recorded' then return 'already'; end if;
+  v_ok := (v_fresh ->> 'ok')::boolean;
+  select * into v_ex from public.dq_freshness where dataset = p_dataset;
+  v_prev_ok := case when found then v_ex.last_ok_at end;
+  v_prev_err := case when found then v_ex.consecutive_errors else 0 end;
+  v_err := case when v_ok then 0 else v_prev_err + 1 end;
+  v_last_ok := case when v_ok then p_at else v_prev_ok end;
+  -- computeFreshness
+  if v_err >= 2 then v_status := 'error';
+  elsif v_last_ok is null then v_status := 'missing';
+  elsif p_cadence = 'event' then v_status := 'fresh';
+  else
+    v_window := case p_cadence when 'daily' then interval '1 day' when 'weekly' then interval '7 days' when 'monthly' then interval '31 days' else interval '92 days' end;
+    v_grace := case p_cadence when 'daily' then interval '2 days' when 'weekly' then interval '2 days' else interval '3 days' end;
+    v_status := case when p_at - v_last_ok <= v_window + v_grace then 'fresh' else 'stale' end;
+  end if;
+  insert into public.dq_freshness (dataset, expected_cadence, last_ok_at, last_attempt_at, consecutive_errors, status, detail, updated_at)
+  values (p_dataset, p_cadence, v_last_ok, p_at, v_err, v_status,
+          case when jsonb_typeof(v_fresh -> 'detail') = 'object' then v_fresh -> 'detail' else '{}'::jsonb end, p_at)
+  on conflict (dataset) do update
+  set expected_cadence = excluded.expected_cadence, last_ok_at = excluded.last_ok_at, last_attempt_at = excluded.last_attempt_at,
+      consecutive_errors = excluded.consecutive_errors, status = excluded.status, detail = excluded.detail, updated_at = excluded.updated_at;
+  update public.dq_reconcile_cycles
+  set detail = jsonb_set(detail, '{freshness,status}', '"recorded"')
+  where pair = p_pair and cycle_id = p_cycle_id;
+  return 'recorded';
+end $$;
+revoke execute on function public.record_cycle_freshness(text, text, text, text, timestamptz) from public, anon, authenticated;
+grant execute on function public.record_cycle_freshness(text, text, text, text, timestamptz) to service_role;

exec
/bin/zsh -lc 'for d in / /Volumes /Volumes/AIMATE_WORK /Volumes/AIMATE_WORK/Developer /Volumes/AIMATE_WORK/Developer/CodeX /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees; do for f in AGENTS.md AGENTS.override.md; do test ! -f "$d/$f" || { echo "$d/$f"; cat "$d/$f"; }; done; done; cat src/lib/dq/reconcile/run.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>// src/lib/dq/reconcile/run.ts
// Reconciliation cycle runner (spec §5.5; §3.1 cycles/cursor; §3.2 apply_reconcile_result and the cursor
// functions; §5.6; §8). One call = one batch for one pair:
//  0. pending hooks: open reconcile_mismatch items of this pair whose detail.hook is pending/failed are
//     materialized first, at T(i) = issuers.merged_into ?? i (crash between apply and materialize, U2);
//  1. cycle: the pair's running cycle, else (plan audit Q2) snapshot pending_members → resolve keys AFTER
//     the snapshot (pair.members, then pair.memberFor for each snapshot target members() missed) →
//     db.openReconcileCycle: under the cycle lock set_merge also takes, cycle row + cursors + removal of
//     exactly the snapshot entries in one transaction (later registrations wait for the next cycle; a
//     concurrent creator's running cycle is returned). Cursor rows are still ensured on every run (heal);
//  2. members in (issuer_id, market) order whose cursor is claimable; a member starts only with >= 60 s of
//     budget; every claim goes through claim_reconcile_member (fence);
//  3. keys this member already committed in this cycle (an earlier attempt) are read back first and are
//     final: they count as duplicates and are NEVER re-evaluated; evaluate runs only for the missing keys,
//     and a member whose keys all exist completes without any upstream read (spec T2; plan audit P5; their
//     pending hooks are step 0's job). One apply_reconcile_result per remaining key (result row + item +
//     visibility, atomic); a reused key is a duplicate; fence_failed stops this worker at once (committed
//     keys stay valid, the next claimer reuses them); visibility changes are materialized once per target at
//     the end of the member and the item hooks set done/failed — detail.hook alone, through
//     patchQuarantineDetail (row lock; a concurrent latest_result is never rolled back, plan audit P4); complete_reconcile_member derives the counts; any other exception →
//     fail_reconcile_member (the third failure is terminal);
//  4. settlement when every cursor is done or terminally failed: each done cursor must satisfy
//     drc_done_accounted (never coalesced); complete iff not_compared = 0 and no failed member; freshness
//     reconcile.<pair> (weekly) is made durable in the settling update itself (settle_reconcile_cycle writes
//     detail.freshness={status:'pending',ok,detail}; only that key of detail, so pending_members written by
//     set_merge are never clobbered) and recorded by record_cycle_freshness, which is idempotent per cycle
//     (a cycle increments consecutive_errors at most once). Recording is ALWAYS done by replayFreshness:
//     at run start and again right after a successful settle, oldest finished cycle first, stopping at the
//     first failure so the order is kept.
// cursor.attempts counts CLAIMS, not failures: a lease timeout or a lost fence consumes an attempt just like
// a thrown evaluate does; after MAX_CURSOR_ATTEMPTS (3) claims the member is terminal (exec_failed_members).
// Everything after startBatch runs inside one try/catch like runFactsSync: an unexpected exception is pushed
// as {code:'unknown'}, the batch is finished best-effort and the error is rethrown (no batch left running).
// Batch counts (§5.5): fetched = keys applied; inserted = passed; duplicates = reused; quarantined =
// mismatches that went to (or back to) an item; failed = non-compared results + mismatches recorded without
// an item + member failures. A ReconcileConfigError (bad gold/sample file, unresolvable issuer) fails the
// batch with its code and creates no cycle. Dry run: members + evaluate only, no writes by the runner.
import {randomUUID} from 'node:crypto';
import {TableError,callRpc,selectAll} from '../../db/table-client';
import type {Row,TableClient} from '../../db/table-client';
import {materialize as materializeFacts} from '../../facts/derive';
import {makeBudget} from '../../facts/sync';
import {FactsDbError} from '../../facts/types';
import type {FactsDb,Market} from '../../facts/types';
import {emptyCounts,finishBatch,startBatch} from '../batches';
import type {BatchCounts,BatchError,BatchStatus,TriggeredBy} from '../batches';
import {DATASETS} from '../datasets';
import {writeHookCas} from '../facts-resolver';
import type {HookState} from '../facts-resolver';
import type {RawStore} from '../raw-store';
import {ReconcileConfigError,sha256Hex} from './pair-support';
import type {PairRunContext,RegisteredPair} from './pair-support';
import {RECONCILE_PAIRS} from './pairs';
import {MAX_CURSOR_ATTEMPTS} from './types';
import type {ApplyReconcileOutcome,CyclePairId,CycleStatus,ExpectedKey,Fence,MemberCounts,MemberPlan,PendingMember,ReconcileResultInput} from './types';

export const MIN_MEMBER_MS=60_000;
export const CYCLE_TABLE='dq_reconcile_cycles',CURSOR_TABLE='dq_reconcile_cursor';
const MARKETS:readonly Market[]=['US','CN'];

export interface ReconcileDeps{
 db:FactsDb;tables:TableClient;raw:RawStore;fetch:typeof fetch;readRepoFile:(path:string)=>Promise<Uint8Array>;
 now:()=>Date;deadline:Date|null;codeVersion:string;
 pairs?:Partial<Record<CyclePairId,RegisteredPair>>;
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
 * A new cycle without a window (plan audit Q2):
 *  1. snapshot the pending entries (plain read);
 *  2. resolve expected keys AFTER the snapshot — pair.members(ctx), then pair.memberFor for each snapshot
 *     target members() did not list — so every merge in the snapshot is visible to the resolver (a zero-key
 *     member is a resolved answer, never a placeholder);
 *  3. db.openReconcileCycle: under the cycle lock set_merge also takes, the cycle row, its cursors and the
 *     removal of exactly the snapshot entries commit together. An entry registered after the snapshot is not
 *     consumed and joins the next cycle; a running cycle created meanwhile is returned (created:false).
 * The runner never rewrites a cycle row's detail. A crash before 3 leaves nothing; after 3 the cycle and
 * cursors exist and the next run uses them.
 */
async function openCycle(deps:ReconcileDeps,pair:RegisteredPair,ctx:PairRunContext):Promise<{row:Row;created:boolean}>{
 const [existing]=await deps.tables.select(CYCLE_TABLE,{pair:pair.id,status:'running'},{limit:1});
 if(existing)return {row:existing,created:false};
 const pending=(await selectAll(deps.tables,CYCLE_TABLE,{pair:pair.id},'cycle_id')).flatMap(pendingOf);
 const plans=[...await pair.members(ctx)];
 const listed=new Set(plans.map(p=>mkey(p.issuerId,p.market)));
 for(const p of pending){
  const k=mkey(p.issuer_id,p.market);if(listed.has(k))continue;
  if(!pair.memberFor)throw new ReconcileError('pending_without_resolver',`${pair.id}:${k}`);
  const plan=await pair.memberFor(ctx,p.issuer_id,p.market);
  if(plan.issuerId!==p.issuer_id||plan.market!==p.market)throw new ReconcileError('evaluate_contract',k);
  plans.push(plan);listed.add(k);
 }
 const members=freeze(plans);
 const startedAt=deps.now();
 const cycleId=`${pair.id}-${startedAt.toISOString().slice(0,10)}-${randomUUID().slice(0,8)}`;
 const out=await deps.db.openReconcileCycle({pair:pair.id,cycleId,startedAt:startedAt.toISOString(),members,pending});
 return {row:out.cycle as Row,created:out.created};
}

async function readCursors(tables:TableClient,pair:CyclePairId,cycleId:string):Promise<Row[]>{
 const out:Row[]=[];
 for(const market of MARKETS)out.push(...await selectAll(tables,CURSOR_TABLE,{pair,cycle_id:cycleId,market},'issuer_id'));
 return out.sort((a,b)=>String(a.issuer_id)<String(b.issuer_id)?-1:String(a.issuer_id)>String(b.issuer_id)?1:String(a.market)<String(b.market)?-1:1);
}
async function ensureCursors(tables:TableClient,pair:CyclePairId,cycleId:string,members:FrozenMember[]):Promise<void>{
 const have=new Set((await readCursors(tables,pair,cycleId)).map(c=>mkey(String(c.issuer_id),String(c.market))));
 for(const m of members){
  if(have.has(mkey(m.issuer_id,m.market)))continue;
  try{
   await tables.insert(CURSOR_TABLE,{pair,cycle_id:cycleId,issuer_id:m.issuer_id,market:m.market,expected:m.expected_keys.length,state:'pending',claimed_by:null,claim_until:null,attempts:0,last_error:null,done_at:null,compared_passed:null,compared_failed:null,not_compared:null});
  }catch(e){if(!(e instanceof TableError&&e.code==='23505'))throw e;}
 }
}
function claimable(c:Row,now:Date):boolean{
 const until=c.claim_until===null||c.claim_until===undefined?null:Date.parse(String(c.claim_until));
 if(c.state==='pending')return true;
 if(c.state==='claimed')return until!==null&&until<now.getTime();
 if(c.state==='failed')return Number(c.attempts)<MAX_CURSOR_ATTEMPTS;
 return false;
}

async function targetOf(tables:TableClient,issuer:string):Promise<string>{
 const [r]=await tables.select('issuers',{issuer_id:issuer},{limit:1});
 return typeof r?.merged_into==='string'?r.merged_into:issuer;
}
/** Materializes each distinct target once and writes every listed item's hook; never throws. Returns the number of failed targets' items. */
async function observedHookAt(tables:TableClient,id:string):Promise<string|undefined>{
 try{const at=((((await tables.select('dq_quarantine',{id},{limit:1}))[0]?.detail??{}) as {hook?:{at?:unknown}}).hook?.at);return typeof at==='string'?at:undefined;}
 catch(e){console.error('[reconcile] hook observe',e instanceof Error?e.message:String(e));return undefined;}
}
async function runHooks(deps:ReconcileDeps,list:HookItem[],errors:BatchError[]):Promise<number>{
 const mat=deps.materialize??((db:FactsDb,issuer:string,market:Market)=>materializeFacts(db,issuer,market));
 let failed=0;
 const groups=new Map<string,{target:string;market:Market;items:{id:string;at:string|undefined}[]}>();
 for(const x of list){
  let target:string;
  try{target=await targetOf(deps.tables,x.issuerId);}
  catch(e){   // an unresolvable target fails only this item's hook; the next run's step 0 retries it
   const code=e instanceof Error?e.message.slice(0,100):'target_unresolved';
   errors.push({code:'materialize_error',key:mkey(x.issuerId,x.market),message:`target_unresolved:${code}`});failed++;
   if(x.itemId)await writeHookCas(deps.tables,x.itemId,{stage:'materialize',state:'failed',at:deps.now().toISOString(),message:'target_unresolved'},typeof x.hookAt==='string'?x.hookAt:await observedHookAt(deps.tables,x.itemId));
   continue;
  }
  const k=mkey(target,x.market);
  const g=groups.get(k)??{target,market:x.market,items:[] as {id:string;at:string|undefined}[]};
  // the hook.at the item carries BEFORE we materialize: the done/failed write is compare-and-set on it (Task 14b review P1)
  if(x.itemId)g.items.push({id:x.itemId,at:typeof x.hookAt==='string'?x.hookAt:await observedHookAt(deps.tables,x.itemId)});groups.set(k,g);
 }
 for(const g of groups.values()){
  let hook:Hook;
  try{await mat(deps.db,g.target,g.market);hook={stage:'done',state:'done',at:deps.now().toISOString()};}
  catch(e){
   const code=e instanceof FactsDbError?e.code:'materialize_failed';
   hook={stage:'materialize',state:'failed',at:deps.now().toISOString(),message:code};
   errors.push({code:'materialize_error',key:mkey(g.target,g.market),message:code});failed+=g.items.length;
  }
  for(const it of g.items){
   const w=await writeHookCas(deps.tables,it.id,hook,it.at);
   if(w.result==='stale')errors.push({code:'skipped_summary',key:`${it.id}:hook_stale`});   // a newer pending hook committed meanwhile wins
  }
 }
 return failed;
}
async function retryPendingHooks(deps:ReconcileDeps,pair:CyclePairId,errors:BatchError[]):Promise<{retried:number;failed:number}>{
 const rows=(await selectAll(deps.tables,'dq_quarantine',{reason_code:'reconcile_mismatch',status:'open'},'id')).filter(r=>{
  const d=(r.detail??{}) as {pair?:unknown;hook?:{state?:unknown};issuer_id?:unknown;market?:unknown};
  return d.pair===pair&&(d.hook?.state==='pending'||d.hook?.state==='failed')&&typeof d.issuer_id==='string'&&(d.market==='US'||d.market==='CN');
 });
 if(rows.length===0)return {retried:0,failed:0};
 const failed=await runHooks(deps,rows.map(r=>{const d=r.detail as {issuer_id:string;market:Market};return {itemId:String(r.id),issuerId:d.issuer_id,market:d.market,hookAt:((r.detail as {hook?:{at?:unknown}}).hook?.at as string|undefined)??null};}),errors);
 return {retried:rows.length,failed};
}

/** Natural keys this member already committed in this cycle (any earlier attempt); final, never re-evaluated (spec T2; plan audit P5). */
async function acceptedKeys(tables:TableClient,fence:Fence):Promise<Set<string>>{
 const rows=await selectAll(tables,'dq_reconciliations',{pair:fence.pair,cycle_id:fence.cycle_id,issuer_id:fence.issuer_id,market:fence.market},'natural_key');
 return new Set(rows.map(r=>String(r.natural_key)));
}
function assertOnePerKey(plan:MemberPlan,results:ReconcileResultInput[]):void{
 if(results.length!==plan.expectedKeys.length||results.some((r,i)=>r.natural_key!==plan.expectedKeys[i].naturalKey))throw new ReconcileError('evaluate_contract');
}
function tally(r:ReconcileResultInput,out:ApplyReconcileOutcome,c:BatchCounts,outcomes:Map<string,number>):void{
 c.fetched++;
 if(out.reused){c.duplicates++;return;}
 if(r.outcome!=='compared'){c.failed++;outcomes.set(r.outcome,(outcomes.get(r.outcome)??0)+1);return;}
 if(r.passed){c.inserted++;return;}
 if(r.action==='record')c.failed++;else c.quarantined++;
}

async function processMember(deps:ReconcileDeps,pair:RegisteredPair,ctx:PairRunContext,fence:Fence,plan:MemberPlan,counts:BatchCounts,errors:BatchError[],outcomes:Map<string,number>):Promise<MemberReport>{
 const key=mkey(fence.issuer_id,fence.market);
 const report=(outcome:MemberOutcome,extra:{counts?:MemberCounts;code?:string}={}):MemberReport=>({issuerId:fence.issuer_id,market:fence.market,outcome,...extra});
 const hooks:HookItem[]=[];
 const flush=async()=>{   // never throws: a hook problem must not keep failReconcileMember from running
  if(hooks.length===0)return;
  try{await runHooks(deps,hooks.splice(0),errors);}catch(e){errors.push({code:'materialize_error',key,message:`hook_flush:${e instanceof Error?e.message.slice(0,100):'unknown'}`});}
 };
 try{
  const accepted=await acceptedKeys(deps.tables,fence);
  const missing:MemberPlan={...plan,expectedKeys:plan.expectedKeys.filter(k=>!accepted.has(k.naturalKey))};
  const reused=plan.expectedKeys.length-missing.expectedKeys.length;
  counts.fetched+=reused;counts.duplicates+=reused;
  const results=missing.expectedKeys.length===0?[]:await pair.evaluate(ctx,missing);   // all keys committed → no upstream read at all
  assertOnePerKey(missing,results);
  for(const result of results){
   let out:ApplyReconcileOutcome;
   try{out=await deps.db.applyReconcileResult(fence,result);}
   catch(e){if(isFence(e)){errors.push({code:'fence_failed',key});await flush();return report('fence_lost');}throw e;}
   tally(result,out,counts,outcomes);
   if(out.materialize)hooks.push({itemId:out.itemId,issuerId:out.materialize.issuerId,market:out.materialize.market});
  }
  await flush();
  try{return report('done',{counts:await deps.db.completeReconcileMember(fence)});}
  catch(e){if(isFence(e)){errors.push({code:'fence_failed',key});return report('fence_lost');}throw e;}
 }catch(e){
  await flush();
  const code=codeOf(e);
  counts.failed++;errors.push({code:'member_failed',key,message:code});
  try{await deps.db.failReconcileMember(fence,code);}
  catch(f){if(isFence(f)){errors.push({code:'fence_failed',key});return report('fence_lost',{code});}throw f;}
  return report('failed',{code});
 }
}

interface Freshness{status:'pending'|'recorded';ok:boolean;detail:Record<string,unknown>}
const freshnessOf=(row:Row):Freshness|null=>{
 const f=((row.detail??{}) as {freshness?:Partial<Freshness>}).freshness;
 return f&&(f.status==='pending'||f.status==='recorded')&&typeof f.ok==='boolean'?{status:f.status,ok:f.ok,detail:(f.detail??{}) as Record<string,unknown>}:null;
};
/** record_cycle_freshness for one settled cycle (idempotent per cycle). Never throws: false = still pending. */
async function recordFreshness(deps:ReconcileDeps,pair:CyclePairId,row:Row,errors:BatchError[]):Promise<boolean>{
 const cycleId=String(row.cycle_id);
 try{
  const r=await callRpc(deps.tables,'record_cycle_freshness',{p_pair:pair,p_cycle_id:cycleId,p_dataset:DATASETS.reconcile(pair),p_cadence:'weekly',p_at:row.finished_at?new Date(String(row.finished_at)).toISOString():deps.now().toISOString()});
  if(r==='recorded'||r==='already'||r==='no_freshness')return true;
  errors.push({code:'freshness_pending',key:cycleId,message:String(r)});return false;
 }catch(e){errors.push({code:'freshness_pending',key:cycleId,message:e instanceof Error?e.message:String(e)});return false;}
}
/** Terminal cycles of this pair whose freshness is still pending, oldest finished first; stops at the first failure to keep the order. */
async function replayFreshness(deps:ReconcileDeps,pair:CyclePairId,errors:BatchError[]):Promise<void>{
 const rows=(await selectAll(deps.tables,CYCLE_TABLE,{pair},'cycle_id')).filter(r=>r.status!=='running'&&freshnessOf(r)?.status==='pending')
  .sort((a,b)=>String(a.finished_at)<String(b.finished_at)?-1:String(a.finished_at)>String(b.finished_at)?1:String(a.cycle_id)<String(b.cycle_id)?-1:1);
 for(const r of rows)if(!await recordFreshness(deps,pair,r,errors))return;
}

async function settle(deps:ReconcileDeps,pair:CyclePairId,cycleId:string,errors:BatchError[]):Promise<{settled:boolean;status:CycleStatus}>{
 const rows=await readCursors(deps.tables,pair,cycleId);
 if(!rows.every(c=>c.state==='done'||(c.state==='failed'&&Number(c.attempts)>=MAX_CURSOR_ATTEMPTS)))return {settled:false,status:'running'};
 let passed=0,failedCmp=0,notCompared=0,failedMembers=0;
 for(const c of rows){
  if(c.state==='failed'){failedMembers++;continue;}
  const v=[c.compared_passed,c.compared_failed,c.not_compared].map(x=>x===null||x===undefined?null:Number(x));
  if(v.some(x=>x===null||!Number.isSafeInteger(x)||x<0)||(v[0]!+v[1]!+v[2]!)!==Number(c.expected))throw new ReconcileError('cursor_unaccounted',mkey(String(c.issuer_id),String(c.market)));
  passed+=v[0]!;failedCmp+=v[1]!;notCompared+=v[2]!;
 }
 const status:CycleStatus=notCompared===0&&failedMembers===0?'complete':'complete_with_gaps';
 const fdetail={cycle_id:cycleId,compared_passed:passed,compared_failed:failedCmp,not_compared:notCompared,exec_failed_members:failedMembers};
 // one locked SQL step: status/counters + detail.freshness (pending) only; it never rewrites other detail keys (pending_members)
 const ok=await callRpc(deps.tables,'settle_reconcile_cycle',{p_pair:pair,p_cycle_id:cycleId,p_status:status,
  p_counts:{compared_passed:passed,compared_failed:failedCmp,not_compared:notCompared,exec_failed_members:failedMembers,finished_at:deps.now().toISOString()},
  p_freshness:{status:'pending',ok:status==='complete',detail:fdetail}});
 if(ok!==true)return {settled:false,status};
 await replayFreshness(deps,pair,errors);   // ordered: an older pending cycle is recorded before this one
 return {settled:true,status};
}

export async function runReconcile(deps:ReconcileDeps,opts:ReconcileOptions):Promise<ReconcileReceipt>{
 const pair=(deps.pairs??RECONCILE_PAIRS)[opts.pair];
 if(!pair)throw new ReconcileError('pair_not_registered',opts.pair);
 const budget=makeBudget(deps.deadline,deps.now);
 const base={db:deps.db,tables:deps.tables,raw:deps.raw,now:deps.now,budget,fetch:deps.fetch,readRepoFile:deps.readRepoFile};
 const want=opts.issuerIds?new Set(opts.issuerIds):null;
 if(opts.dryRun){
  const ctx:PairRunContext={...base,batchId:null,dryRun:true};
  const out:{issuerId:string;market:Market;results:ReconcileResultInput[]}[]=[];
  for(const plan of await pair.members(ctx)){
   if(want&&!want.has(plan.issuerId))continue;
   const results=await pair.evaluate(ctx,plan);assertOnePerKey(plan,results);
   out.push({issuerId:plan.issuerId,market:plan.market,results});
  }
  return {batchId:null,status:'dry_run',counts:emptyCounts(),errors:[],cycle:null,members:[],hooks:{retried:0,failed:0},dryRun:out};
 }
 const counts=emptyCounts();const errors:BatchError[]=[];const outcomes=new Map<string,number>();const members:MemberReport[]=[];
 await replayFreshness(deps,pair.id,errors);
 const hooks=await retryPendingHooks(deps,pair.id,errors);
 const sample=pair.inputs.repoFile===null?'':await deps.readRepoFile(pair.inputs.repoFile).then(sha256Hex,()=>'');
 const tool=(cycleId:string)=>({pair:pair.id,cycle_id:cycleId,parser:pair.inputs.parserVersion,gold_schema:pair.inputs.goldSchema??'',sample_sha256:sample,code_version:deps.codeVersion});
 const {batchId}=await startBatch(deps.tables,{producer:'reconcile',dataset:DATASETS.reconcile(pair.id),toolVersions:tool(''),codeVersion:deps.codeVersion,triggeredBy:opts.triggeredBy});
 const finish=async(cycle:CycleReport|null)=>{
  if(outcomes.size>0)errors.push({code:'outcome_summary',message:JSON.stringify(Object.fromEntries([...outcomes.entries()].sort(([a],[b])=>a<b?-1:1)))});
  const status=await finishBatch(deps.tables,batchId,{counts,errors},deps.now());
  return {batchId,status,counts,errors,cycle,members,hooks} satisfies ReconcileReceipt;
 };
 try{
  const ctx:PairRunContext={...base,batchId,dryRun:false};
  let opened:{row:Row;created:boolean};
  try{opened=await openCycle(deps,pair,ctx);}
  catch(e){if(e instanceof ReconcileConfigError){errors.push({code:e.code,message:e.message});return finish(null);}throw e;}
  const cycleId=String(opened.row.cycle_id);const frozen=frozenOf(opened.row);
  await deps.tables.update('ingest_batches',{batch_id:batchId,status:'running'},{tool_versions:tool(cycleId)});
  await ensureCursors(deps.tables,pair.id,cycleId,frozen);
  const plans=new Map<string,MemberPlan>(frozen.map(m=>[mkey(m.issuer_id,m.market),{issuerId:m.issuer_id,market:m.market,expectedKeys:m.expected_keys}]));
  for(const c of await readCursors(deps.tables,pair.id,cycleId)){
   const issuerId=String(c.issuer_id),market=c.market as Market,key=mkey(issuerId,market);
   if(want&&!want.has(issuerId))continue;
   if(!claimable(c,deps.now()))continue;
   const plan=plans.get(key);
   if(!plan){errors.push({code:'member_failed',key,message:'cursor_without_member'});continue;}
   if(budget.remainingMs()<MIN_MEMBER_MS){errors.push({code:'deadline_hit',key});members.push({issuerId,market,outcome:'not_started'});continue;}
   const fence=await deps.db.claimReconcileMember(pair.id,cycleId,issuerId,market,batchId);
   if(!fence){errors.push({code:'skipped_summary',key:`${key}:claimed`});members.push({issuerId,market,outcome:'claimed_elsewhere'});continue;}
   const r=await processMember(deps,pair,ctx,fence,plan,counts,errors,outcomes);
   members.push(r);
   if(r.outcome==='fence_lost')break;
  }
  let settled:{settled:boolean;status:CycleStatus}={settled:false,status:'running'};
  try{settled=await settle(deps,pair.id,cycleId,errors);}
  catch(e){if(e instanceof ReconcileError&&e.code==='cursor_unaccounted')errors.push({code:'cursor_unaccounted',key:e.message});else throw e;}
  return finish({cycleId,status:settled.status,created:opened.created,settled:settled.settled,expectedTotal:Number(opened.row.expected_total)});
 }catch(e){
  // infrastructure failure after the batch started: close the receipt so no running batch dangles, then rethrow (like runFactsSync)
  errors.push({code:'unknown',message:e instanceof Error?e.message:String(e)});
  try{await finishBatch(deps.tables,batchId,{counts,errors},deps.now());}catch{/* left running; the runbook marks it failed */}
  throw e;
 }
}

exec
/bin/zsh -lc "cat src/lib/db/pg-table-client.ts; cat src/lib/dq/freshness.ts; cat src/lib/dq/batches.ts; rg -n 'rpc|settle_reconcile|record_cycle' src/lib/db; ls -a | head -35; cat CLAUDE.md 2>/dev/null" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 0ms:
// TEST-ONLY TableClient over node-postgres, so integration tests drive the same entities/dq code
// against the real schema (constraints, triggers, exclusion indexes). Production uses the Supabase
// adapter (supabaseTableClient in table-client.ts); nothing in src/app or src/lib imports this.
// Semantics mirror the Supabase adapter: null match values use `is null`, update returns the
// matched row count, select/count honour gte/lt ranges and orderBy/desc/limit/offset; rpc calls
// public.<fn> with named arguments (objects / arrays / booleans as jsonb).
// date/timestamp/timestamptz values come back as the server's text (not JS Date) so they compare
// and round-trip exactly like the strings PostgREST returns. Plain objects and arrays are sent as
// JSON (jsonb columns); PostgreSQL array columns are not supported.
import {types} from 'pg';
import type {Pool,QueryConfig} from 'pg';
import {TableError,assertMatch,assertUpdateMatch,checkRangeOptions,checkSelectOptions} from './table-client';
import type {RangeOptions,Row,SelectOptions,TableClient} from './table-client';

const IDENT=/^[a-z_][a-z0-9_]*$/;
/** Validates a table/column name and returns it double-quoted. */
export function ident(name:string):string{
 if(typeof name!=='string'||!IDENT.test(name))throw new Error(`invalid_sql_identifier:${String(name)}`);
 return `"${name}"`;
}

const param=(v:unknown)=>v!==null&&typeof v==='object'&&!(v instanceof Date)&&!Buffer.isBuffer(v)?JSON.stringify(v):v;
const placeholders=(n:number,from=1)=>Array.from({length:n},(_,i)=>`$${from+i}`).join(', ');

/** ` where …` (or '') for an equality match plus optional ranges; pushes values onto `params`. */
export function whereSql(match:Row,range:RangeOptions,params:unknown[]):string{
 const parts:string[]=[];
 const bind=(v:unknown)=>{params.push(param(v));return `$${params.length}`;};
 for(const [k,v] of Object.entries(match))parts.push(v===null?`${ident(k)} is null`:`${ident(k)} = ${bind(v)}`);
 for(const [k,v] of Object.entries(range.gte??{}))parts.push(`${ident(k)} >= ${bind(v)}`);
 for(const [k,v] of Object.entries(range.lt??{}))parts.push(`${ident(k)} < ${bind(v)}`);
 return parts.length?` where ${parts.join(' and ')}`:'';
}

export function selectSql(rel:string,match:Row,opts:SelectOptions):{text:string;values:unknown[]}{
 const values:unknown[]=[];
 let text=`select * from ${rel}${whereSql(match,opts,values)}`;
 if(opts.orderBy)text+=` order by ${ident(opts.orderBy)} ${opts.desc?'desc':'asc'}`;
 if(opts.limit!==undefined)text+=` limit ${Number(opts.limit)}`;
 if(opts.offset!==undefined)text+=` offset ${Number(opts.offset)}`;
 return {text,values};
}

export function upsertSql(rel:string,row:Row,onConflict:string):{text:string;values:unknown[]}{
 const cols=Object.keys(row);
 const conflict=onConflict.split(',').map(s=>s.trim());
 if(!cols.length||!conflict.length)throw new Error('invalid_upsert');
 const rest=cols.filter(c=>!conflict.includes(c));
 const action=rest.length?`do update set ${rest.map(c=>`${ident(c)} = excluded.${ident(c)}`).join(', ')}`:'do nothing';
 return {
  text:`insert into ${rel} (${cols.map(ident).join(', ')}) values (${placeholders(cols.length)}) on conflict (${conflict.map(ident).join(', ')}) ${action}`,
  values:cols.map(c=>param(row[c])),
 };
}

const RAW_TEXT=new Set([1082,1114,1184]); // date, timestamp, timestamptz
const getTypeParser=types.getTypeParser as (oid:number,format?:string)=>unknown;
export const typeParsers={getTypeParser:(oid:number,format?:string)=>RAW_TEXT.has(oid)?(v:string)=>v:getTypeParser(oid,format)} as unknown as QueryConfig['types'];

interface PgErr{message?:string;code?:string;detail?:string;hint?:string}

export function pgTableClient(pool:Pool,schema='public'):TableClient{
 const rel=(table:string)=>`${ident(schema)}.${ident(table)}`;
 const run=async(op:string,table:string,text:string,values:unknown[])=>{
  try{return await pool.query({text,values,types:typeParsers});}
  catch(e){const err=e as PgErr;throw new TableError(op,table,err.message??String(e),err.code??null,{details:err.detail,hint:err.hint,cause:e});}
 };
 return {
  async insert(table,row){
   const cols=Object.keys(row);
   const text=cols.length
    ?`insert into ${rel(table)} (${cols.map(ident).join(', ')}) values (${placeholders(cols.length)}) returning *`
    :`insert into ${rel(table)} default values returning *`;
   return (await run('insert',table,text,cols.map(c=>param(row[c])))).rows[0] as Row;
  },
  async update(table,match,patch){
   assertUpdateMatch(match);
   const cols=Object.keys(patch);
   if(!cols.length)throw new Error('empty_update_patch');
   const values=cols.map(c=>param(patch[c]));
   const set=cols.map((c,i)=>`${ident(c)} = $${i+1}`).join(', ');
   const res=await run('update',table,`update ${rel(table)} set ${set}${whereSql(match,{},values)}`,values);
   return res.rowCount??0;
  },
  async select(table,match,opts={}){
   assertMatch(match);checkSelectOptions(opts);
   const {text,values}=selectSql(rel(table),match,opts);
   return (await run('select',table,text,values)).rows as Row[];
  },
  async upsert(table,row,onConflict){
   const {text,values}=upsertSql(rel(table),row,onConflict);
   await run('upsert',table,text,values);
  },
  async count(table,match,opts={}){
   assertMatch(match);checkRangeOptions(opts);
   const values:unknown[]=[];
   const res=await run('count',table,`select count(*)::int as n from ${rel(table)}${whereSql(match,opts,values)}`,values);
   return Number(res.rows[0].n);
  },
  async rpc(fn,args){
   const names=Object.keys(args);
   const text=`select ${ident(schema)}.${ident(fn)}(${names.map((k,i)=>`${ident(k)} => $${i+1}`).join(', ')}) as result`;
   return (await run('rpc',fn,text,names.map(k=>param(args[k])))).rows[0]?.result;
  },
 };
}
// Freshness registry (spec §5.1 dq_freshness). Status is a pure function of cadence window
// and grace; writers store it, readers recompute it with `now` (freshnessOf) because a
// producer that stops running never calls recordAttempt again. Fails closed, never fresh: an
// unknown stored cadence reads as error, an unparseable lastOkAt as missing, and an invalid `now`
// throws invalid_now (validated before the event-cadence shortcut).
import {selectAll} from '../db/table-client';
import type {Row,TableClient} from '../db/table-client';

export type Cadence='daily'|'weekly'|'monthly'|'quarterly'|'event';
export type FreshnessStatus='fresh'|'stale'|'error'|'missing';
const DAY=86_400_000;
const WINDOW_MS:Record<Cadence,number|null>={daily:1*DAY,weekly:7*DAY,monthly:31*DAY,quarterly:92*DAY,event:null};
// Daily grace of 2d lets a weekday-only feed survive a weekend (Fri ok -> Mon is 3d <= 1d+2d); weekly
// (reconcile cycles, spec 3 §3.1) gets the same 2d so one late cron run does not flip it to stale.
const GRACE_MS:Record<Cadence,number>={daily:2*DAY,weekly:2*DAY,monthly:3*DAY,quarterly:3*DAY,event:0};
export const CADENCES:readonly Cadence[]=['daily','weekly','monthly','quarterly','event'];

const validDate=(d:unknown):d is Date=>d instanceof Date&&Number.isFinite(d.getTime());

export function computeFreshness(input:{cadence:Cadence;lastOkAt:Date|null;consecutiveErrors:number;now:Date}):FreshnessStatus{
 if(!validDate(input.now))throw new Error('invalid_now');
 const lastOkAt=validDate(input.lastOkAt)?input.lastOkAt:null;
 if(input.consecutiveErrors>=2)return 'error';
 if(!lastOkAt)return 'missing';
 const window=WINDOW_MS[input.cadence];
 if(window===null)return 'fresh';
 const age=input.now.getTime()-lastOkAt.getTime();
 return age<=window+GRACE_MS[input.cadence]?'fresh':'stale';
}

/**
 * Records one producer attempt as a read-then-upsert. Assumes a single producer per dataset:
 * concurrent attempts for the same dataset can lose a consecutive_errors increment.
 */
export async function recordAttempt(client:TableClient,dataset:string,input:{ok:boolean;cadence:Cadence;now?:Date;detail?:Record<string,unknown>}):Promise<FreshnessStatus>{
 if(typeof dataset!=='string'||dataset.length<1||dataset.length>64)throw new Error('invalid_dataset');
 if(!CADENCES.includes(input.cadence))throw new Error('invalid_cadence');
 const now=input.now??new Date();
 if(!validDate(now))throw new Error('invalid_now');
 const existing=(await client.select('dq_freshness',{dataset}))[0];
 const storedOk=existing?.last_ok_at?new Date(existing.last_ok_at as string):null;
 const prevOk=validDate(storedOk)?storedOk:null; // unparseable stored value is dropped, not re-written
 const prevErrors=Number(existing?.consecutive_errors??0);
 const consecutiveErrors=input.ok?0:prevErrors+1;
 const lastOkAt=input.ok?now:prevOk;
 const status=computeFreshness({cadence:input.cadence,lastOkAt,consecutiveErrors,now});
 await client.upsert('dq_freshness',{
  dataset,expected_cadence:input.cadence,last_ok_at:lastOkAt?lastOkAt.toISOString():null,last_attempt_at:now.toISOString(),
  consecutive_errors:consecutiveErrors,status,detail:input.detail??{},updated_at:now.toISOString(),
 },'dataset');
 return status;
}

/** All freshness rows with status recomputed at `now`; `stored_status` keeps what the writer last stored. */
export async function freshnessOf(client:TableClient,now=new Date()):Promise<(Row&{stored_status:string;status:FreshnessStatus})[]>{
 const rows=await selectAll(client,'dq_freshness',{},'dataset');
 return rows.map(r=>({...r,stored_status:String(r.status),status:CADENCES.includes(r.expected_cadence as Cadence)?computeFreshness({
  cadence:r.expected_cadence as Cadence,lastOkAt:r.last_ok_at?new Date(r.last_ok_at as string):null,
  consecutiveErrors:Number(r.consecutive_errors??0),now}):'error'}));
}
// Ingest receipts (spec §5.1 ingest_batches). Every producer starts a batch, writes rows that
// reference batch_id, and finishes with counts + errors. Status is derived from counts and
// errors so dashboards never guess: success = no failures and no non-informational errors;
// quarantined rows and informational entries (INFO_CODES) do not degrade status. The row is written with finished_at:null so the DB invariant
// (status='running' iff finished_at is null) holds. Only a running batch can be finished.
import {randomUUID} from 'node:crypto';
import type {TableClient} from '../db/table-client';

export type BatchStatus='running'|'success'|'partial'|'failed'|'rejected';
export type TriggeredBy='cron'|'manual'|'script';
/**
 * Receipt counters, all non-negative safe integers:
 * - fetched: rows read from the source;
 * - inserted: new rows written; duplicates: rows already present unchanged (no write);
 * - versioned: rows that superseded an existing version; quarantined: rows parked in dq_quarantine;
 * - failed: rows that could not be processed at all.
 * inserted+duplicates+versioned+quarantined+failed is the number of rows with an outcome; it may
 * be below fetched (rows filtered out by design), but fetched > 0 with no outcome at all means the
 * producer lost track of its rows and the batch finishes as failed ('unaccounted').
 */
export interface BatchCounts{fetched:number;inserted:number;duplicates:number;versioned:number;quarantined:number;failed:number}
export interface BatchError{code:string;key?:string;message?:string}
export interface StartBatchInput{producer:string;dataset:string;toolVersions?:Record<string,string>;codeVersion?:string;triggeredBy?:TriggeredBy}

const TRIGGERS:readonly TriggeredBy[]=['cron','manual','script'];
export const emptyCounts=():BatchCounts=>({fetched:0,inserted:0,duplicates:0,versioned:0,quarantined:0,failed:0});

const COUNTERS:readonly (keyof BatchCounts)[]=['fetched','inserted','duplicates','versioned','quarantined','failed'];
const MAX_ERRORS=100,MAX_MESSAGE=500;

function assertCounts(counts:BatchCounts):void{
 if(!counts||COUNTERS.some(k=>!Number.isSafeInteger(counts[k])||counts[k]<0))throw new Error('invalid_counts');
}

/** First MAX_ERRORS errors with messages capped, plus a `truncated` marker for the rest. */
function capErrors(errors:BatchError[]):BatchError[]{
 const kept=errors.slice(0,MAX_ERRORS).map(e=>e.message!==undefined&&e.message.length>MAX_MESSAGE?{...e,message:e.message.slice(0,MAX_MESSAGE)}:e);
 return errors.length>MAX_ERRORS?[...kept,{code:'truncated',message:`${errors.length-MAX_ERRORS} more`}]:kept;
}

/**
 * Error codes that only inform the receipt reader: `skipped_summary` (input rows left out by
 * expected filtering, e.g. not in the universe or not promotable yet) and `relink` (a research
 * entity re-pointed to another issuer), `rule_warning_summary` (one per warning rule per batch, facts spec §7.2),
 * `coverage_summary` (Tushare coverage summary, §6.3), `deadline_hit` (issuers not started after the deadline, §6.1) and `claims_summary` (identifier claims filed per op, data foundation 3 §4.2.2/§8). They stay in `errors` but never make a batch partial or
 * failed. `rejected_summary` (malformed or invalid input rows) is deliberately NOT informational:
 * it makes the batch partial, or failed when nothing landed.
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
 * started_at is not a valid date, rather than writing a NaN finished_at.
 */
export async function finishBatch(client:TableClient,batchId:string,result:{counts:BatchCounts;errors:BatchError[];rejected?:boolean},now=new Date()):Promise<BatchStatus>{
 const status=batchStatusFromCounts(result.counts,result.errors,{rejected:result.rejected});
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw new Error('invalid_now');
 const unaccounted=!result.rejected&&result.counts.fetched>0&&accounted(result.counts)===0;
 const errors=unaccounted?[UNACCOUNTED_ERROR,...result.errors]:result.errors;
 const [batch]=await client.select('ingest_batches',{batch_id:batchId},{limit:1});
 if(!batch||batch.status!=='running')throw new Error('batch_not_running');
 const startedAt=Date.parse(String(batch.started_at));
 if(!Number.isFinite(startedAt))throw new Error('invalid_now');
 // Never before started_at (DB check finished_after_started), even under clock skew.
 const finishedAt=new Date(Math.max(now.getTime(),startedAt));
 // Matching on status='running' keeps a concurrent finish from being overwritten.
 const n=await client.update('ingest_batches',{batch_id:batchId,status:'running'},{status,counts:result.counts,errors:capErrors(errors),finished_at:finishedAt.toISOString()});
 if(n!==1)throw new Error('batch_not_running');
 return status;
}
src/lib/db/table-client.ts:41: rpc?(fn:string,args:Row):Promise<unknown>;
src/lib/db/table-client.ts:44:/** Calls `fn` through client.rpc. A client without rpc is a wiring error (rpc_unavailable:<fn>), never a silent no-op. */
src/lib/db/table-client.ts:46: if(!client.rpc)throw new Error(`rpc_unavailable:${fn}`);
src/lib/db/table-client.ts:47: return client.rpc(fn,args);
src/lib/db/table-client.ts:135:  async rpc(fn,args){
src/lib/db/table-client.ts:136:   const {data,error}=await (client as unknown as {rpc:(f:string,a:Row)=>PromiseLike<{data:unknown;error:PgError|null}>}).rpc(fn,args);
src/lib/db/table-client.ts:137:   if(error)fail('rpc',fn,error);
src/lib/db/memory-table-client.ts:11://  - rpc emulates only the plan-3 row-locking functions (append_claim_evidence, patch_quarantine_detail, set_security_identifier, set_issuer_identifier, set_security_window, patch_security_provenance, close_security_absent, settle_reconcile_cycle, record_cycle_freshness); one synchronous JS turn stands for the row lock.
src/lib/db/memory-table-client.ts:40: // Task 14b review: twins of settle_reconcile_cycle / record_cycle_freshness (migration 20261107091000 section 14); detail is only ever
src/lib/db/memory-table-client.ts:42: settle_reconcile_cycle(rowsOf,a){
src/lib/db/memory-table-client.ts:44:  if(!isObj(c)||!isObj(f)||typeof f.ok!=='boolean'||f.status!=='pending'||(a.p_status!=='complete'&&a.p_status!=='complete_with_gaps'))throw new TableError('rpc','settle_reconcile_cycle','invalid_settlement','22023');
src/lib/db/memory-table-client.ts:50: record_cycle_freshness(rowsOf,a){
src/lib/db/memory-table-client.ts:52:  if(typeof a.p_dataset!=='string'||a.p_dataset.length<1||a.p_dataset.length>64||!CADENCES.includes(cadence)||typeof a.p_at!=='string'||!Number.isFinite(Date.parse(a.p_at)))throw new TableError('rpc','record_cycle_freshness','invalid_freshness','22023');
src/lib/db/memory-table-client.ts:72:   throw new TableError('rpc','append_claim_evidence','invalid_evidence','22023');
src/lib/db/memory-table-client.ts:83:  if(key!=='hook'&&key!=='audit_written')throw new TableError('rpc','patch_quarantine_detail','invalid_detail_key','22023');
src/lib/db/memory-table-client.ts:84:  if(a.p_value===null||a.p_value===undefined)throw new TableError('rpc','patch_quarantine_detail','invalid_detail_key','22023');
src/lib/db/memory-table-client.ts:100:  if(a.p_column!=='cninfo_org_id')throw new TableError('rpc','set_issuer_identifier','invalid_column','22023');
src/lib/db/memory-table-client.ts:102:  if(typeof v!=='string'||v.trim()===''||!isObj(pv))throw new TableError('rpc','set_issuer_identifier','invalid_identifier_write','22023');
src/lib/db/memory-table-client.ts:117:   throw new TableError('rpc','set_security_window','invalid_window_write','22023');
src/lib/db/memory-table-client.ts:139:   throw new TableError('rpc','close_security_absent','invalid_window_write','22023');
src/lib/db/memory-table-client.ts:154:   throw new TableError('rpc','patch_security_provenance','invalid_provenance_patch','22023');
src/lib/db/memory-table-client.ts:167:   throw new TableError('rpc','set_security_identifier','invalid_identifier_write','22023');
src/lib/db/memory-table-client.ts:180:export function memoryTableClient(keys:Record<string,string[]>={}):TableClient&{rows(table:string):Row[];rpc(fn:string,args:Row):Promise<unknown>}{
src/lib/db/memory-table-client.ts:225:  async rpc(fn,args){
src/lib/db/memory-table-client.ts:227:   if(!impl)throw new TableError('rpc',fn,`function public.${fn} does not exist`,'42883');
src/lib/db/pg-table-client.ts:5:// matched row count, select/count honour gte/lt ranges and orderBy/desc/limit/offset; rpc calls
src/lib/db/pg-table-client.ts:100:  async rpc(fn,args){
src/lib/db/pg-table-client.ts:103:   return (await run('rpc',fn,text,names.map(k=>param(args[k])))).rows[0]?.result;
src/lib/db/table-client.test.ts:210:describe('rpc (plan 3 row-locking functions; plan audit P3/P4/R2)',()=>{
src/lib/db/table-client.test.ts:269: it('callRpc refuses a client without rpc; an unknown function fails like PostgreSQL (42883)',async()=>{
src/lib/db/table-client.test.ts:271:  const {rpc:_rpc,...noRpc}=c;
src/lib/db/table-client.test.ts:272:  await expect(callRpc(noRpc,'append_claim_evidence',{})).rejects.toThrow('rpc_unavailable:append_claim_evidence');
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

codex
No actionable regressions introduced by this commit were identified. The locked settlement and freshness functions preserve unrelated cycle details and make freshness recording atomic and idempotent. Tests were inspected but not executed.
No actionable regressions introduced by this commit were identified. The locked settlement and freshness functions preserve unrelated cycle details and make freshness recording atomic and idempotent. Tests were inspected but not executed.

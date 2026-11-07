OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b111-a104-70e3-9069-9b70c7e45ba2
--------
user
commit c2c8d84
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat c2c8d84; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 6306ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-m8QN20bK' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-3keE9Isl' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/14b-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/14b-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/14b-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-ZH2RpJgO' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-OaM6gWVc' (errno=Operation not permitted)
commit c2c8d84f5c71ce6bbd90c93ec4c8a88244c581e9
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 05:34:25 2026 -0800

    fix(dq): reconcile hook completion is compare-and-set; settlement freshness is durable and replayed in order
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

 src/lib/dq/reconcile/run.test.ts | 41 +++++++++++++++++++++++
 src/lib/dq/reconcile/run.ts      | 70 ++++++++++++++++++++++++++++++----------
 2 files changed, 94 insertions(+), 17 deletions(-)

exec
/bin/zsh -lc 'pwd; for p in /AGENTS.md /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do test ! -f "$p" || { echo "$p"; cat "$p"; }; done; ls -a | head -40; git show c2c8d84 --; cat src/lib/dq/reconcile/run.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
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
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-uOjA3mQW' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-642L2USx' (errno=Operation not permitted)
commit c2c8d84f5c71ce6bbd90c93ec4c8a88244c581e9
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 05:34:25 2026 -0800

    fix(dq): reconcile hook completion is compare-and-set; settlement freshness is durable and replayed in order
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/dq/reconcile/run.test.ts b/src/lib/dq/reconcile/run.test.ts
index 2563346..2ae7bbc 100644
--- a/src/lib/dq/reconcile/run.test.ts
+++ b/src/lib/dq/reconcile/run.test.ts
@@ -293,3 +293,44 @@ describe('runReconcile — hooks and dry run',()=>{
   expect(await h.tables.select(CYCLE_TABLE,{})).toEqual([]);
  });
 });
+
+describe('runReconcile — review P1/P2 (hook CAS, durable freshness)',()=>{
+ it('P1: a restore that commits a newer pending hook while the runner materializes wins — the runner done-write is stale and the hook stays pending',async()=>{
+  const id=randomUUID();let h:ReturnType<typeof harness>;
+  h=harness(stubPair([],()=>[]),{materialize:async()=>{
+   const [cur]=await h.tables.select('dq_quarantine',{id});
+   await h.tables.update('dq_quarantine',{id},{detail:{...(cur.detail as Row),hook:{stage:'materialize',state:'pending',at:'2026-11-05T03:00:00.000Z'}}});   // a restore commits a newer hook
+   return {rows:0,stateRev:0,retried:false};}});
+  await h.tables.insert('dq_quarantine',{id,dataset:'facts.us',table_name:'financial_facts',natural_key:`${PAIR}:k:cas`,reason_code:'reconcile_mismatch',detail:{pair:PAIR,issuer_id:A,market:'US',hook:{stage:'materialize',state:'pending',at:T0}},payload:{},batch_id:randomUUID(),status:'open',resolved_by:null,resolved_at:null,created_at:T0});
+  const r=await runReconcile(h.deps,{pair:PAIR,triggeredBy:'cron'});
+  const [row]=await h.tables.select('dq_quarantine',{id});
+  expect((row.detail as {hook:Row}).hook).toMatchObject({state:'pending',at:'2026-11-05T03:00:00.000Z'});
+  expect(r.errors).toContainEqual({code:'skipped_summary',key:`${id}:hook_stale`});
+ });
+ const failingFreshness=(t:TableClient,state:{fail:boolean}):TableClient=>({...t,
+  async upsert(tb,row,key){if(tb==='dq_freshness'&&state.fail)throw new Error('freshness_down');return t.upsert(tb,row,key);}
+  } as TableClient);
+ it('P2: an interruption after the settling update (recordAttempt throws) leaves freshness pending; the next run start records it',async()=>{
+  const h=harness(stubPair([{issuerId:A,market:'US',expectedKeys:keys('k1')}],()=>[miss('k1')]));
+  const st={fail:true};
+  const r1=await runReconcile({...h.deps,tables:failingFreshness(h.tables,st)},{pair:PAIR,triggeredBy:'cron'});
+  expect(r1.cycle).toMatchObject({settled:true,status:'complete_with_gaps'});
+  expect(await freshness(h.tables)).toBeUndefined();
+  const [c1]=await h.tables.select(CYCLE_TABLE,{pair:PAIR});
+  expect((c1.detail as {freshness:Row}).freshness).toMatchObject({status:'pending',ok:false});
+  st.fail=false;h.advance(60_000);
+  await runReconcile(h.deps,{pair:PAIR,triggeredBy:'cron',issuerIds:[B]});   // processes nothing: only the replay can have written freshness
+  expect(await freshness(h.tables)).toMatchObject({consecutive_errors:1});
+  const [c2]=await h.tables.select(CYCLE_TABLE,{pair:PAIR,cycle_id:c1.cycle_id});
+  expect((c2.detail as {freshness:Row}).freshness).toMatchObject({status:'recorded'});
+ });
+ it('P2: two pending cycles are recorded oldest first, so two consecutive gaps give two errors',async()=>{
+  const h=harness(stubPair([{issuerId:A,market:'US',expectedKeys:keys('k1')}],()=>[miss('k1')]));
+  const cyc=(id:string,fin:string,fresh:boolean)=>({pair:PAIR,cycle_id:id,started_at:fin,finished_at:fin,members:[],status:'complete_with_gaps',expected_total:0,compared_passed:0,compared_failed:0,not_compared:0,exec_failed_members:0,detail:{freshness:{status:'pending',ok:fresh,detail:{cycle_id:id}}}});
+  await h.tables.insert(CYCLE_TABLE,cyc('b-newer','2026-11-03T00:00:00.000Z',false));
+  await h.tables.insert(CYCLE_TABLE,cyc('a-older','2026-11-01T00:00:00.000Z',false));
+  await runReconcile(h.deps,{pair:PAIR,triggeredBy:'cron',issuerIds:[B]});
+  expect(await freshness(h.tables)).toMatchObject({consecutive_errors:2});
+  for(const id of ['a-older','b-newer']){const [c]=await h.tables.select(CYCLE_TABLE,{pair:PAIR,cycle_id:id});expect((c.detail as {freshness:Row}).freshness.status).toBe('recorded');}
+ });
+});
diff --git a/src/lib/dq/reconcile/run.ts b/src/lib/dq/reconcile/run.ts
index 8b51ee6..713bd84 100644
--- a/src/lib/dq/reconcile/run.ts
+++ b/src/lib/dq/reconcile/run.ts
@@ -37,7 +37,8 @@ import {emptyCounts,finishBatch,startBatch} from '../batches';
 import type {BatchCounts,BatchError,BatchStatus,TriggeredBy} from '../batches';
 import {DATASETS} from '../datasets';
 import {recordAttempt} from '../freshness';
-import {patchQuarantineDetail} from '../quarantine';
+import {writeHookCas} from '../facts-resolver';
+import type {HookState} from '../facts-resolver';
 import type {RawStore} from '../raw-store';
 import {ReconcileConfigError,sha256Hex} from './pair-support';
 import type {PairRunContext,RegisteredPair} from './pair-support';
@@ -63,7 +64,8 @@ export interface ReconcileReceipt{batchId:string|null;status:BatchStatus|'dry_ru
 export class ReconcileError extends Error{constructor(public readonly code:string,message?:string){super(message??code);this.name='ReconcileError';}}
 
 interface FrozenMember{issuer_id:string;market:Market;expected_keys:ExpectedKey[]}
-interface Hook{stage:'materialize'|'done';state:'done'|'failed';at:string;message?:string}
+type Hook=HookState;
+interface HookItem{itemId:string|null;issuerId:string;market:Market;hookAt?:string|null}
 const mkey=(issuer:string,market:string)=>`${issuer}:${market}`;
 const isFence=(e:unknown)=>e instanceof FactsDbError&&e.code==='fence_failed';
 const codeOf=(e:unknown):string=>e instanceof FactsDbError||e instanceof ReconcileError||e instanceof ReconcileConfigError?e.code:`exception:${(e instanceof Error?e.message:String(e)).slice(0,200)}`;
@@ -150,18 +152,19 @@ async function targetOf(tables:TableClient,issuer:string):Promise<string>{
  const [r]=await tables.select('issuers',{issuer_id:issuer},{limit:1});
  return typeof r?.merged_into==='string'?r.merged_into:issuer;
 }
-/** detail.hook alone, through the row-locking patch (plan audit P4); a missing item is a no-op. Never throws. */
-async function setHook(tables:TableClient,id:string,hook:Hook):Promise<void>{
- try{await patchQuarantineDetail(tables,id,'hook',hook);}
- catch(e){console.error('[reconcile] hook write',e instanceof Error?e.message:String(e));}
-}
 /** Materializes each distinct target once and writes every listed item's hook; never throws. Returns the number of failed targets' items. */
-async function runHooks(deps:ReconcileDeps,list:{itemId:string|null;issuerId:string;market:Market}[],errors:BatchError[]):Promise<number>{
+async function observedHookAt(tables:TableClient,id:string):Promise<string|undefined>{
+ try{const at=((((await tables.select('dq_quarantine',{id},{limit:1}))[0]?.detail??{}) as {hook?:{at?:unknown}}).hook?.at);return typeof at==='string'?at:undefined;}
+ catch(e){console.error('[reconcile] hook observe',e instanceof Error?e.message:String(e));return undefined;}
+}
+async function runHooks(deps:ReconcileDeps,list:HookItem[],errors:BatchError[]):Promise<number>{
  const mat=deps.materialize??((db:FactsDb,issuer:string,market:Market)=>materializeFacts(db,issuer,market));
- const groups=new Map<string,{target:string;market:Market;items:string[]}>();
+ const groups=new Map<string,{target:string;market:Market;items:{id:string;at:string|undefined}[]}>();
  for(const x of list){
   const target=await targetOf(deps.tables,x.issuerId);const k=mkey(target,x.market);
-  const g=groups.get(k)??{target,market:x.market,items:[]};if(x.itemId)g.items.push(x.itemId);groups.set(k,g);
+  const g=groups.get(k)??{target,market:x.market,items:[] as {id:string;at:string|undefined}[]};
+  // the hook.at the item carries BEFORE we materialize: the done/failed write is compare-and-set on it (Task 14b review P1)
+  if(x.itemId)g.items.push({id:x.itemId,at:typeof x.hookAt==='string'?x.hookAt:await observedHookAt(deps.tables,x.itemId)});groups.set(k,g);
  }
  let failed=0;
  for(const g of groups.values()){
@@ -172,7 +175,10 @@ async function runHooks(deps:ReconcileDeps,list:{itemId:string|null;issuerId:str
    hook={stage:'materialize',state:'failed',at:deps.now().toISOString(),message:code};
    errors.push({code:'materialize_error',key:mkey(g.target,g.market),message:code});failed+=g.items.length;
   }
-  for(const id of g.items)await setHook(deps.tables,id,hook);
+  for(const it of g.items){
+   const w=await writeHookCas(deps.tables,it.id,hook,it.at);
+   if(w.result==='stale')errors.push({code:'skipped_summary',key:`${it.id}:hook_stale`});   // a newer pending hook committed meanwhile wins
+  }
  }
  return failed;
 }
@@ -182,7 +188,7 @@ async function retryPendingHooks(deps:ReconcileDeps,pair:CyclePairId,errors:Batc
   return d.pair===pair&&(d.hook?.state==='pending'||d.hook?.state==='failed')&&typeof d.issuer_id==='string'&&(d.market==='US'||d.market==='CN');
  });
  if(rows.length===0)return {retried:0,failed:0};
- const failed=await runHooks(deps,rows.map(r=>{const d=r.detail as {issuer_id:string;market:Market};return {itemId:String(r.id),issuerId:d.issuer_id,market:d.market};}),errors);
+ const failed=await runHooks(deps,rows.map(r=>{const d=r.detail as {issuer_id:string;market:Market};return {itemId:String(r.id),issuerId:d.issuer_id,market:d.market,hookAt:((r.detail as {hook?:{at?:unknown}}).hook?.at as string|undefined)??null};}),errors);
  return {retried:rows.length,failed};
 }
 
@@ -205,7 +211,7 @@ function tally(r:ReconcileResultInput,out:ApplyReconcileOutcome,c:BatchCounts,ou
 async function processMember(deps:ReconcileDeps,pair:RegisteredPair,ctx:PairRunContext,fence:Fence,plan:MemberPlan,counts:BatchCounts,errors:BatchError[],outcomes:Map<string,number>):Promise<MemberReport>{
  const key=mkey(fence.issuer_id,fence.market);
  const report=(outcome:MemberOutcome,extra:{counts?:MemberCounts;code?:string}={}):MemberReport=>({issuerId:fence.issuer_id,market:fence.market,outcome,...extra});
- const hooks:{itemId:string|null;issuerId:string;market:Market}[]=[];
+ const hooks:HookItem[]=[];
  const flush=async()=>{if(hooks.length>0){await runHooks(deps,hooks.splice(0),errors);}};
  try{
   const accepted=await acceptedKeys(deps.tables,fence);
@@ -234,7 +240,32 @@ async function processMember(deps:ReconcileDeps,pair:RegisteredPair,ctx:PairRunC
  }
 }
 
-async function settle(deps:ReconcileDeps,pair:CyclePairId,cycleId:string):Promise<{settled:boolean;status:CycleStatus}>{
+interface Freshness{status:'pending'|'recorded';ok:boolean;detail:Record<string,unknown>}
+const freshnessOf=(row:Row):Freshness|null=>{
+ const f=((row.detail??{}) as {freshness?:Partial<Freshness>}).freshness;
+ return f&&(f.status==='pending'||f.status==='recorded')&&typeof f.ok==='boolean'?{status:f.status,ok:f.ok,detail:(f.detail??{}) as Record<string,unknown>}:null;
+};
+/** recordAttempt for one settled cycle, then flag it recorded (durable, ordered; Task 14b review P2). Never throws: false = still pending. */
+async function recordFreshness(deps:ReconcileDeps,pair:CyclePairId,row:Row,errors:BatchError[]):Promise<boolean>{
+ const f=freshnessOf(row);if(!f)return true;
+ const cycleId=String(row.cycle_id);
+ try{
+  if(f.status==='pending'){
+   await recordAttempt(deps.tables,DATASETS.reconcile(pair),{ok:f.ok,cadence:'weekly',now:row.finished_at?new Date(String(row.finished_at)):deps.now(),detail:f.detail});
+  }
+  const [cur]=await deps.tables.select(CYCLE_TABLE,{pair,cycle_id:cycleId},{limit:1});
+  await deps.tables.update(CYCLE_TABLE,{pair,cycle_id:cycleId},{detail:{...((cur?.detail??{}) as Row),freshness:{...f,status:'recorded'}}});
+  return true;
+ }catch(e){errors.push({code:'freshness_pending',key:cycleId,message:e instanceof Error?e.message:String(e)});return false;}
+}
+/** Run start: terminal cycles of this pair whose freshness is still pending, oldest finished first; stops at the first failure to keep the order. */
+async function replayFreshness(deps:ReconcileDeps,pair:CyclePairId,errors:BatchError[]):Promise<void>{
+ const rows=(await selectAll(deps.tables,CYCLE_TABLE,{pair},'cycle_id')).filter(r=>r.status!=='running'&&freshnessOf(r)?.status==='pending')
+  .sort((a,b)=>String(a.finished_at)<String(b.finished_at)?-1:String(a.finished_at)>String(b.finished_at)?1:String(a.cycle_id)<String(b.cycle_id)?-1:1);
+ for(const r of rows)if(!await recordFreshness(deps,pair,r,errors))return;
+}
+
+async function settle(deps:ReconcileDeps,pair:CyclePairId,cycleId:string,errors:BatchError[]):Promise<{settled:boolean;status:CycleStatus}>{
  const rows=await readCursors(deps.tables,pair,cycleId);
  if(!rows.every(c=>c.state==='done'||(c.state==='failed'&&Number(c.attempts)>=MAX_CURSOR_ATTEMPTS)))return {settled:false,status:'running'};
  let passed=0,failedCmp=0,notCompared=0,failedMembers=0;
@@ -246,9 +277,13 @@ async function settle(deps:ReconcileDeps,pair:CyclePairId,cycleId:string):Promis
  }
  const status:CycleStatus=notCompared===0&&failedMembers===0?'complete':'complete_with_gaps';
  const now=deps.now();
- const n=await deps.tables.update(CYCLE_TABLE,{pair,cycle_id:cycleId,status:'running'},{status,finished_at:now.toISOString(),compared_passed:passed,compared_failed:failedCmp,not_compared:notCompared,exec_failed_members:failedMembers});
+ const [cur]=await deps.tables.select(CYCLE_TABLE,{pair,cycle_id:cycleId},{limit:1});
+ const fdetail={cycle_id:cycleId,compared_passed:passed,compared_failed:failedCmp,not_compared:notCompared,exec_failed_members:failedMembers};
+ // freshness is written pending IN the settling update, so a crash before recordAttempt is replayed at the next run start (review P2)
+ const n=await deps.tables.update(CYCLE_TABLE,{pair,cycle_id:cycleId,status:'running'},{status,finished_at:now.toISOString(),compared_passed:passed,compared_failed:failedCmp,not_compared:notCompared,exec_failed_members:failedMembers,detail:{...((cur?.detail??{}) as Row),freshness:{status:'pending',ok:status==='complete',detail:fdetail}}});
  if(n!==1)return {settled:false,status};
- await recordAttempt(deps.tables,DATASETS.reconcile(pair),{ok:status==='complete',cadence:'weekly',now,detail:{cycle_id:cycleId,compared_passed:passed,compared_failed:failedCmp,not_compared:notCompared,exec_failed_members:failedMembers}});
+ const [settledRow]=await deps.tables.select(CYCLE_TABLE,{pair,cycle_id:cycleId},{limit:1});
+ if(settledRow)await recordFreshness(deps,pair,settledRow,errors);
  return {settled:true,status};
 }
 
@@ -269,6 +304,7 @@ export async function runReconcile(deps:ReconcileDeps,opts:ReconcileOptions):Pro
   return {batchId:null,status:'dry_run',counts:emptyCounts(),errors:[],cycle:null,members:[],hooks:{retried:0,failed:0},dryRun:out};
  }
  const counts=emptyCounts();const errors:BatchError[]=[];const outcomes=new Map<string,number>();const members:MemberReport[]=[];
+ await replayFreshness(deps,pair.id,errors);
  const hooks=await retryPendingHooks(deps,pair.id,errors);
  const sample=pair.inputs.repoFile===null?'':await deps.readRepoFile(pair.inputs.repoFile).then(sha256Hex,()=>'');
  const tool=(cycleId:string)=>({pair:pair.id,cycle_id:cycleId,parser:pair.inputs.parserVersion,gold_schema:pair.inputs.goldSchema??'',sample_sha256:sample,code_version:deps.codeVersion});
@@ -300,7 +336,7 @@ export async function runReconcile(deps:ReconcileDeps,opts:ReconcileOptions):Pro
   if(r.outcome==='fence_lost')break;
  }
  let settled:{settled:boolean;status:CycleStatus}={settled:false,status:'running'};
- try{settled=await settle(deps,pair.id,cycleId);}
+ try{settled=await settle(deps,pair.id,cycleId,errors);}
  catch(e){if(e instanceof ReconcileError&&e.code==='cursor_unaccounted')errors.push({code:'cursor_unaccounted',key:e.message});else throw e;}
  return finish({cycleId,status:settled.status,created:opened.created,settled:settled.settled,expectedTotal:Number(opened.row.expected_total)});
 }
// src/lib/dq/reconcile/run.ts
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
//     reconcile.<pair> (weekly) is recorded ONLY by the worker whose guarded update settled the cycle.
// Batch counts (§5.5): fetched = keys applied; inserted = passed; duplicates = reused; quarantined =
// mismatches that went to (or back to) an item; failed = non-compared results + mismatches recorded without
// an item + member failures. A ReconcileConfigError (bad gold/sample file, unresolvable issuer) fails the
// batch with its code and creates no cycle. Dry run: members + evaluate only, no writes by the runner.
import {randomUUID} from 'node:crypto';
import {TableError,selectAll} from '../../db/table-client';
import type {Row,TableClient} from '../../db/table-client';
import {materialize as materializeFacts} from '../../facts/derive';
import {makeBudget} from '../../facts/sync';
import {FactsDbError} from '../../facts/types';
import type {FactsDb,Market} from '../../facts/types';
import {emptyCounts,finishBatch,startBatch} from '../batches';
import type {BatchCounts,BatchError,BatchStatus,TriggeredBy} from '../batches';
import {DATASETS} from '../datasets';
import {recordAttempt} from '../freshness';
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
 const groups=new Map<string,{target:string;market:Market;items:{id:string;at:string|undefined}[]}>();
 for(const x of list){
  const target=await targetOf(deps.tables,x.issuerId);const k=mkey(target,x.market);
  const g=groups.get(k)??{target,market:x.market,items:[] as {id:string;at:string|undefined}[]};
  // the hook.at the item carries BEFORE we materialize: the done/failed write is compare-and-set on it (Task 14b review P1)
  if(x.itemId)g.items.push({id:x.itemId,at:typeof x.hookAt==='string'?x.hookAt:await observedHookAt(deps.tables,x.itemId)});groups.set(k,g);
 }
 let failed=0;
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
 const flush=async()=>{if(hooks.length>0){await runHooks(deps,hooks.splice(0),errors);}};
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
/** recordAttempt for one settled cycle, then flag it recorded (durable, ordered; Task 14b review P2). Never throws: false = still pending. */
async function recordFreshness(deps:ReconcileDeps,pair:CyclePairId,row:Row,errors:BatchError[]):Promise<boolean>{
 const f=freshnessOf(row);if(!f)return true;
 const cycleId=String(row.cycle_id);
 try{
  if(f.status==='pending'){
   await recordAttempt(deps.tables,DATASETS.reconcile(pair),{ok:f.ok,cadence:'weekly',now:row.finished_at?new Date(String(row.finished_at)):deps.now(),detail:f.detail});
  }
  const [cur]=await deps.tables.select(CYCLE_TABLE,{pair,cycle_id:cycleId},{limit:1});
  await deps.tables.update(CYCLE_TABLE,{pair,cycle_id:cycleId},{detail:{...((cur?.detail??{}) as Row),freshness:{...f,status:'recorded'}}});
  return true;
 }catch(e){errors.push({code:'freshness_pending',key:cycleId,message:e instanceof Error?e.message:String(e)});return false;}
}
/** Run start: terminal cycles of this pair whose freshness is still pending, oldest finished first; stops at the first failure to keep the order. */
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
 const now=deps.now();
 const [cur]=await deps.tables.select(CYCLE_TABLE,{pair,cycle_id:cycleId},{limit:1});
 const fdetail={cycle_id:cycleId,compared_passed:passed,compared_failed:failedCmp,not_compared:notCompared,exec_failed_members:failedMembers};
 // freshness is written pending IN the settling update, so a crash before recordAttempt is replayed at the next run start (review P2)
 const n=await deps.tables.update(CYCLE_TABLE,{pair,cycle_id:cycleId,status:'running'},{status,finished_at:now.toISOString(),compared_passed:passed,compared_failed:failedCmp,not_compared:notCompared,exec_failed_members:failedMembers,detail:{...((cur?.detail??{}) as Row),freshness:{status:'pending',ok:status==='complete',detail:fdetail}}});
 if(n!==1)return {settled:false,status};
 const [settledRow]=await deps.tables.select(CYCLE_TABLE,{pair,cycle_id:cycleId},{limit:1});
 if(settledRow)await recordFreshness(deps,pair,settledRow,errors);
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
}

exec
/bin/zsh -lc "cat src/lib/dq/freshness.ts; rg -n 'writeHookCas' src/lib/dq/facts-resolver.ts; sed -n '1,150p' src/lib/dq/facts-resolver.ts; rg -n 'pending_members|jsonb_set.*detail' supabase/migrations/* | tail -45; find . -name '*AGENTS*' -not -path './node_modules/*'; ls .claude; cat package.json | tail -45" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 621ms:
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
106: return (await writeHookCas(tables,id,hook,expectAt)).hook;
114:export async function writeHookCas(tables:TableClient,id:string,hook:HookState,expectAt?:string):Promise<{hook:HookState;result:'written'|'stale'|'write_failed'}>{
127: // observe the item's pending hook BEFORE materialising; the done / failed write is fenced on it (writeHookCas)
// src/lib/dq/facts-resolver.ts
// Admin hook for facts.* quarantine items (plan 2 spec §7.3; plan 3 spec §4.6, §5.6, T10).
// Accept dispatch (exhaustive; tests mirror this table):
//  ambiguous_value + chosenCandidateIndex → adopt: the filing comes from the candidate's filingRef
//   (findFilingBySourceRef, source by market; the payload is not trusted); readFacts of that issuer
//   at `today` for the candidate's period (every concept, history:true so a later disclosure cannot
//   hide the filing's own rows; truncated → conflict read_truncated) gives stateRev and the rows of the
//   candidate's filing at its active generation that the plan-2 §7 statement rules check together
//   with the candidate (failure → rule_failed, nothing written; plan audit P1); then a batch (producer dq-resolver, dataset = item.dataset) and adoptCandidate under
//   stateRev (stale_evaluation → re-read and re-evaluate once, then 409); materialize T(issuer).
//  reconcile_mismatch → restore: inputsHashNow(item) is injected (the hash of the CURRENT inputs,
//   plan 3 Task 14c); absent → conflict not_passing + restoreNote 'reconcile_wiring_missing', an
//   {unavailable} answer → that note ('inputs_unavailable' | 'current_evidence_unavailable', plan audit
//   P2); nothing written, never promotes. restoreReconciled → materialize
//   the persisted target; promoted 0 → restoreNote 'no_rows_promoted' (the route's detail.restore_note, success and refusal alike) with the skipped reasons in restore.
//  lineage_conflict + keepFactId → resolveLineageConflict → materialize T (natural key's first
//   segment); without keepFactId → invalid_choice (keep_fact_id_required): the generic resolver
//   would promote every member.
//  reconcile_review → the plan-1 status flip (accept and reject alike): no promotion, no hook.
//  every other reason → the plan-2 path (resolve_facts_quarantine; ambiguous_value without an index
//   is an acknowledgement).
// Reject is the plan-1 flip for every reason; fact rows stay quarantined. The three new visibility
// verdicts write detail.hook = pending and the target (detail.issuer_id/market) in their SQL
// transaction; every later hook / audit write patches ONLY its key through patchQuarantineDetail
// (row lock, plan audit P4), never a read-then-replace of detail; an accepted item whose hook is missing / pending / failed is UNFINISHED and a later
// POST re-runs materialize only, on the persisted target (materialize re-derives T(i) then).
// Code → outcome: invalid_choice / invalid_candidate → invalid_choice (400); generation_moved /
// conflict_exists / duplicate / replay_required / filing_not_found / not_passing / lineage_changed
// / scope_missing / unresolved / stale_evaluation (after the retry) / read_truncated → conflict (409);
// item_not_open, batch_mismatch and anything else are thrown (the route: 409 already_resolved /
// 500). Everything after a verdict commits is best-effort and never throws. Client-visible hook
// messages are codes only; full errors go to the server log.
import type {Row,TableClient} from '../db/table-client';
import {CONCEPT_IDS,MAPPING_VERSION} from '../facts/concepts';
import {materialize} from '../facts/derive';
import {decimalEquals} from '../facts/json-numbers';
import {evaluateFactRules} from '../facts/rules';
import {FactsDbError} from '../facts/types';
import type {FactCandidate,FactInsert,FactRow,FactsDb,FilingRow,Market} from '../facts/types';
import {emptyCounts,finishBatch,startBatch} from './batches';
import {DATASETS} from './datasets';
import {patchQuarantineDetail,resolveQuarantine} from './quarantine';
import type {QuarantineStatus} from './quarantine';

export interface HookState{stage:'materialize'|'done';state:'done'|'failed';at:string;message?:string}
export type FactsResolveOutcome='resolved'|'not_found'|'already_resolved'|'hook_retried'|'invalid_choice'|'rule_failed'|'conflict';
export interface FactsResolveResult{outcome:FactsResolveOutcome;hook?:HookState;promoted?:number;skipped?:number;chosenFactIds?:string[];
 /** machine code of a refusal (rule id, SQL code) */
 code?:string;
 /** why a reconcile_mismatch restore was refused before reaching SQL (route: detail.restore_note) */
 restoreNote?:'reconcile_wiring_missing'|'no_rows_promoted'|InputsUnavailable['unavailable'];
 adoptedFactId?:string;
 restore?:{promoted:number;skipped:{fact_id:string;reason:string}[]};
 quarantined?:number;
 /** the verdict's persisted choices (a retry reports these, never the retrying request's body) */
 chosenCandidateIndex?:number;keepFactId?:string;
 /** What the route should audit: undefined = the outcome itself; null = nothing (retry of an already audited item). */
 auditAs?:'resolved'|'hook_retried'|null;
 /** Set when auditAs='resolved' on a retry: the audit row describes the PERSISTED resolution (original resolver, accept, committed ids); the retrying admin is recorded separately. */
 recovered?:{resolvedBy:string;status:'resolved_accept';chosenFactIds:string[];recoveredBy:string;recoveredAt:string}}
/** Why the current inputs of a reconcile_mismatch item cannot be hashed now (restore stays refused). */
export interface InputsUnavailable{unavailable:'inputs_unavailable'|'current_evidence_unavailable'}
/** Hash of the CURRENT reconciliation inputs of a reconcile_mismatch item (computeInputsHash over left raw_hash, the pair's CURRENT right evidence sha256, gold/sample sha256, parser version), or why it cannot be computed now. */
export type InputsHashNow=(item:Row)=>Promise<string|InputsUnavailable>;
export interface ResolveFactsInput{status:Exclude<QuarantineStatus,'open'>;chosenFactIds?:string[];chosenCandidateIndex?:number;keepFactId?:string;resolvedBy:string;now?:()=>Date;
 /** the evaluation date of an adoption (default: now's UTC date) */
 today?:string;
 inputsHashNow?:InputsHashNow}
/** Reason codes whose plan-2 items reference fact rows; the other three (ambiguous_value, odd_duration, missing_available_date) have none. */
export const FACT_ROW_REASONS:readonly string[]=['same_day_conflict','identity_bs','identity_gp'];
/** Reasons with a plan-3 visibility verdict (adopt / restore / lineage). */
export const VERDICT_REASONS:readonly string[]=['ambiguous_value','reconcile_mismatch','lineage_conflict'];
const TABLE='dq_quarantine';
const MARKETS:readonly string[]=['US','CN'];
const CHOICE_CODES:readonly string[]=['invalid_choice','invalid_candidate'];
const CONFLICT_CODES:readonly string[]=['generation_moved','conflict_exists','duplicate','replay_required','filing_not_found','not_passing','lineage_changed','scope_missing','unresolved','stale_evaluation','read_truncated','target_not_active','use_dedicated_resolver'];
const PROBE_ID='00000000-0000-4000-8000-000000000000';

interface Payload{key?:Record<string,string|null>;fact_ids?:string[];candidates?:unknown}
const payloadOf=(item:Row):Payload=>(item.payload??{}) as Payload;
const detailOf=(item:Row):Record<string,unknown>=>(item.detail??{}) as Record<string,unknown>;
const hookOf=(item:Row):HookState|undefined=>detailOf(item).hook as HookState|undefined;
const marketOfDataset=(d:unknown):Market|null=>d===DATASETS.facts('US')?'US':d===DATASETS.facts('CN')?'CN':null;
class RuleFailed extends Error{constructor(public rule:string){super(rule);this.name='RuleFailed';}}

/** Where an item materialises: the persisted detail.issuer_id/market (plan-3 verdicts and reconciliation items), else payload.key (plan-2 items). */
export function hookTarget(item:Row):{issuer:string;market:Market}|null{
 const d=detailOf(item);
 if(typeof d.issuer_id==='string'&&typeof d.market==='string'&&MARKETS.includes(d.market))return {issuer:d.issuer_id,market:d.market as Market};
 const key=payloadOf(item).key;const issuer=key?.issuer_id;const market=key?.market;
 return typeof issuer==='string'&&typeof market==='string'&&MARKETS.includes(market)?{issuer,market:market as Market}:null;
}
/** An accepted item whose materialisation is not done: plan-2 fact-row reasons, or a plan-3 verdict that actually changed visibility. */
function unfinished(item:Row):boolean{
 if(item.status!=='resolved_accept'||hookOf(item)?.state==='done')return false;
 const reason=String(item.reason_code);const d=detailOf(item);
 if(FACT_ROW_REASONS.includes(reason))return true;
 if(reason==='ambiguous_value')return typeof d.adopted_fact_id==='string';
 if(reason==='reconcile_mismatch')return typeof d.restored_by_batch==='string';
 if(reason==='lineage_conflict')return Array.isArray(d.chosen_fact_ids);
 return false;
}

/** Sets detail.hook alone through patchQuarantineDetail (row lock; plan audit P4): a concurrent verdict or result written meanwhile is kept. Never throws. */
export async function writeHook(tables:TableClient,id:string,hook:HookState,expectAt?:string):Promise<HookState>{
 return (await writeHookCas(tables,id,hook,expectAt)).hook;
}
/**
 * writeHook with the compare-and-set outcome (Task 11 review, Codex P2). expectAt = the hook.at the caller observed before it
 * materialised: when the item's hook.at has moved on (a restore / adoption / lineage verdict committed a newer pending hook meanwhile),
 * nothing is written ('stale': the newer hook belongs to its own owner or the next scan) and the returned hook is a failed
 * 'hook_superseded' that was NOT persisted.
 */
export async function writeHookCas(tables:TableClient,id:string,hook:HookState,expectAt?:string):Promise<{hook:HookState;result:'written'|'stale'|'write_failed'}>{
 try{
  const r=await patchQuarantineDetail(tables,id,'hook',hook,expectAt);
  if(r==='stale')return {hook:{stage:'materialize',state:'failed',at:hook.at,message:'hook_superseded'},result:'stale'};
  return {hook,result:'written'};
 }catch(e){
  console.error('[admin/dq] hook write',e instanceof Error?e.message:String(e));
  return {hook:hook.state==='done'?{stage:hook.stage,state:'failed',at:hook.at,message:'hook_write_failed'}:hook,result:'write_failed'};
 }
}

async function runHook(db:FactsDb,tables:TableClient,id:string,where:{issuer:string;market:Market}|null,now:()=>Date):Promise<HookState>{
 let hook:HookState;
 // observe the item's pending hook BEFORE materialising; the done / failed write is fenced on it (writeHookCas)
 let observed:string|undefined;
 try{
  const at=((((await tables.select(TABLE,{id},{limit:1}))[0]?.detail??{}) as {hook?:{at?:unknown}}).hook?.at);
  if(typeof at==='string')observed=at;
 }catch(e){console.error('[admin/dq] hook observe',e instanceof Error?e.message:String(e));}
 if(where===null)hook={stage:'materialize',state:'failed',at:now().toISOString(),message:'no_target'};
 else{
  try{await materialize(db,where.issuer,where.market);hook={stage:'done',state:'done',at:now().toISOString()};}
  catch(e){
   console.error('[admin/dq] materialize',e instanceof Error?e.message:String(e));
   hook={stage:'materialize',state:'failed',at:now().toISOString(),message:e instanceof FactsDbError?e.code:'materialize_failed'};
  }
 }
 return writeHook(tables,id,hook,observed);
}

/** Marks that the audit row of this resolution was written: detail.audit_written alone, through patchQuarantineDetail (plan audit P4). Best-effort; a missing mark only causes one extra audit row on retry. */
export async function markAudited(tables:TableClient,id:string):Promise<void>{
 try{await patchQuarantineDetail(tables,id,'audit_written',true);}
 catch(e){console.error('[admin/dq] audit mark',e instanceof Error?e.message:String(e));}
}

/** A verdict under its own dq-resolver batch; the batch is finished whatever happens (best-effort after success). */
supabase/migrations/20261107090000_identifiers_and_dq.sql:128:  detail              jsonb not null default '{}',                   -- pending_members (set_merge, migration two) and settlement notes
supabase/migrations/20261107090000_identifiers_and_dq.sql:734:  update public.issuer_identifier_claims set detail = jsonb_set(detail, '{sources}', v_sources || jsonb_build_array(p_evidence), true) where id = v_id;
supabase/migrations/20261107091000_facts_extensions.sql:339:  set detail = jsonb_set(c.detail, '{pending_members}',
supabase/migrations/20261107091000_facts_extensions.sql:340:        coalesce(case when jsonb_typeof(c.detail -> 'pending_members') = 'array' then c.detail -> 'pending_members' end, '[]'::jsonb)
supabase/migrations/20261107091000_facts_extensions.sql:343:                     where not (coalesce(case when jsonb_typeof(c.detail -> 'pending_members') = 'array' then c.detail -> 'pending_members' end, '[]'::jsonb)
supabase/migrations/20261107091000_facts_extensions.sql:1034:--  p_pending entries leave every cycle row's detail.pending_members (an entry registered after the
supabase/migrations/20261107091000_facts_extensions.sql:1085:           where c.pair = p_pair and c.cycle_id <> p_cycle_id and jsonb_typeof(c.detail -> 'pending_members') = 'array'
supabase/migrations/20261107091000_facts_extensions.sql:1090:    from jsonb_array_elements(r.detail -> 'pending_members') e;
supabase/migrations/20261107091000_facts_extensions.sql:1093:      set detail = jsonb_set(r.detail, '{pending_members}', v_keep) || jsonb_build_object('pending_consumed_by', p_cycle_id)
agents
launch.json
scratch
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
/bin/zsh -lc "nl -ba src/lib/dq/reconcile/run.ts | sed -n '246,290p'; sed -n '310,350p' supabase/migrations/20261107091000_facts_extensions.sql; for d in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees; do ls \""'$d"/AGENTS* 2>/dev/null; done; git status --short' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 8ms:
   246	 return f&&(f.status==='pending'||f.status==='recorded')&&typeof f.ok==='boolean'?{status:f.status,ok:f.ok,detail:(f.detail??{}) as Record<string,unknown>}:null;
   247	};
   248	/** recordAttempt for one settled cycle, then flag it recorded (durable, ordered; Task 14b review P2). Never throws: false = still pending. */
   249	async function recordFreshness(deps:ReconcileDeps,pair:CyclePairId,row:Row,errors:BatchError[]):Promise<boolean>{
   250	 const f=freshnessOf(row);if(!f)return true;
   251	 const cycleId=String(row.cycle_id);
   252	 try{
   253	  if(f.status==='pending'){
   254	   await recordAttempt(deps.tables,DATASETS.reconcile(pair),{ok:f.ok,cadence:'weekly',now:row.finished_at?new Date(String(row.finished_at)):deps.now(),detail:f.detail});
   255	  }
   256	  const [cur]=await deps.tables.select(CYCLE_TABLE,{pair,cycle_id:cycleId},{limit:1});
   257	  await deps.tables.update(CYCLE_TABLE,{pair,cycle_id:cycleId},{detail:{...((cur?.detail??{}) as Row),freshness:{...f,status:'recorded'}}});
   258	  return true;
   259	 }catch(e){errors.push({code:'freshness_pending',key:cycleId,message:e instanceof Error?e.message:String(e)});return false;}
   260	}
   261	/** Run start: terminal cycles of this pair whose freshness is still pending, oldest finished first; stops at the first failure to keep the order. */
   262	async function replayFreshness(deps:ReconcileDeps,pair:CyclePairId,errors:BatchError[]):Promise<void>{
   263	 const rows=(await selectAll(deps.tables,CYCLE_TABLE,{pair},'cycle_id')).filter(r=>r.status!=='running'&&freshnessOf(r)?.status==='pending')
   264	  .sort((a,b)=>String(a.finished_at)<String(b.finished_at)?-1:String(a.finished_at)>String(b.finished_at)?1:String(a.cycle_id)<String(b.cycle_id)?-1:1);
   265	 for(const r of rows)if(!await recordFreshness(deps,pair,r,errors))return;
   266	}
   267	
   268	async function settle(deps:ReconcileDeps,pair:CyclePairId,cycleId:string,errors:BatchError[]):Promise<{settled:boolean;status:CycleStatus}>{
   269	 const rows=await readCursors(deps.tables,pair,cycleId);
   270	 if(!rows.every(c=>c.state==='done'||(c.state==='failed'&&Number(c.attempts)>=MAX_CURSOR_ATTEMPTS)))return {settled:false,status:'running'};
   271	 let passed=0,failedCmp=0,notCompared=0,failedMembers=0;
   272	 for(const c of rows){
   273	  if(c.state==='failed'){failedMembers++;continue;}
   274	  const v=[c.compared_passed,c.compared_failed,c.not_compared].map(x=>x===null||x===undefined?null:Number(x));
   275	  if(v.some(x=>x===null||!Number.isSafeInteger(x)||x<0)||(v[0]!+v[1]!+v[2]!)!==Number(c.expected))throw new ReconcileError('cursor_unaccounted',mkey(String(c.issuer_id),String(c.market)));
   276	  passed+=v[0]!;failedCmp+=v[1]!;notCompared+=v[2]!;
   277	 }
   278	 const status:CycleStatus=notCompared===0&&failedMembers===0?'complete':'complete_with_gaps';
   279	 const now=deps.now();
   280	 const [cur]=await deps.tables.select(CYCLE_TABLE,{pair,cycle_id:cycleId},{limit:1});
   281	 const fdetail={cycle_id:cycleId,compared_passed:passed,compared_failed:failedCmp,not_compared:notCompared,exec_failed_members:failedMembers};
   282	 // freshness is written pending IN the settling update, so a crash before recordAttempt is replayed at the next run start (review P2)
   283	 const n=await deps.tables.update(CYCLE_TABLE,{pair,cycle_id:cycleId,status:'running'},{status,finished_at:now.toISOString(),compared_passed:passed,compared_failed:failedCmp,not_compared:notCompared,exec_failed_members:failedMembers,detail:{...((cur?.detail??{}) as Row),freshness:{status:'pending',ok:status==='complete',detail:fdetail}}});
   284	 if(n!==1)return {settled:false,status};
   285	 const [settledRow]=await deps.tables.select(CYCLE_TABLE,{pair,cycle_id:cycleId},{limit:1});
   286	 if(settledRow)await recordFreshness(deps,pair,settledRow,errors);
   287	 return {settled:true,status};
   288	}
   289	
   290	export async function runReconcile(deps:ReconcileDeps,opts:ReconcileOptions):Promise<ReconcileReceipt>{
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
  perform public.fact_topology_lock(v_set);
  perform 1 from public.issuers where issuer_id = any(v_set) order by issuer_id for update;
  v_now := array(select distinct x from unnest(array[p_source, p_target] || array(select issuer_id from public.issuers where merged_into in (p_source, p_target))) as x order by x);
  if v_now <> v_set then raise exception 'lineage_changed' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.issuers where issuer_id = p_source and status = 'active') then raise exception 'source_not_active' using errcode = 'P0001'; end if;
  v_refs := array(select issuer_id from public.issuers where merged_into = p_source order by issuer_id);
  update public.issuers set merged_into = p_target, updated_at = now() where merged_into = p_source;
  get diagnostics n = row_count;
  if n <> cardinality(v_refs) then raise exception 'lineage_changed' using errcode = 'P0001'; end if;
  update public.issuers set status = 'merged', merged_into = p_target, updated_at = now() where issuer_id = p_source and status = 'active';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'source_not_active' using errcode = 'P0001'; end if;
  update public.fact_sync_scope set state_rev = state_rev + 1, updated_at = now() where issuer_id = any(v_set);
  -- the cycle advisory lock is already held (taken first, above)
  -- Registration is best effort: with no facts.lineage_same_day cycle row the UPDATE below affects 0 rows and
  -- nothing else happens (no cycle row is created here). Alignment decision #6: the runner's first cycle
  -- re-enumerates every issuer with merged_into not null, so no merge target is lost.
  update public.dq_reconcile_cycles c
  set detail = jsonb_set(c.detail, '{pending_members}',
        coalesce(case when jsonb_typeof(c.detail -> 'pending_members') = 'array' then c.detail -> 'pending_members' end, '[]'::jsonb)
        || coalesce((select jsonb_agg(jsonb_build_object('issuer_id', p_target, 'market', mk.m, 'source', p_source) order by mk.m)
                     from (values ('CN'), ('US')) as mk(m)
                     where not (coalesce(case when jsonb_typeof(c.detail -> 'pending_members') = 'array' then c.detail -> 'pending_members' end, '[]'::jsonb)
                                @> jsonb_build_array(jsonb_build_object('issuer_id', p_target, 'market', mk.m, 'source', p_source)))), '[]'::jsonb), true)
  where c.pair = 'facts.lineage_same_day'
    and c.cycle_id = (select y.cycle_id from public.dq_reconcile_cycles y where y.pair = 'facts.lineage_same_day' order by (y.status = 'running') desc, y.started_at desc limit 1);
  insert into public.research_audit_log (user_id, actor, action, object_type, object_id, detail)
  values (p_resolved_by, 'user', 'entities.merge', 'issuer', p_source, jsonb_build_object('source', p_source, 'target', p_target, 'repointed', cardinality(v_refs)));
  return jsonb_build_object('repointed', cardinality(v_refs));
end $$;
zsh:1: no matches found: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/AGENTS*
zsh:1: no matches found: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/AGENTS*
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-KaiaTEJC' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-DSIoEMn4' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/14b-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/14b-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/14b-review.md

codex
The new freshness persistence can overwrite concurrent merge registrations, duplicate attempts after interruptions, and replay attempts out of order. These undermine both reconciliation scheduling and freshness accuracy.

Full review comments:

- [P1] Patch cycle freshness without replacing concurrent detail updates — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/reconcile/run.ts:280-283
  If `set_merge` commits a `detail.pending_members` registration between this read and update, the replacement `detail` silently deletes it. The same race exists in `recordFreshness`, and can also restore entries already consumed by `open_reconcile_cycle`. These functions explicitly coordinate pending registrations in SQL, but the new read-then-replace writes bypass that coordination. Update only the freshness key against the current row inside a locked database transaction, including during settlement.

- [P2] Make freshness recording idempotent per cycle — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/reconcile/run.ts:253-257
  If `recordAttempt` succeeds but the subsequent cycle update fails or the process stops, the next replay records the same attempt again. Because `recordAttempt` unconditionally increments `consecutive_errors` for a failed cycle, one cycle with gaps becomes two errors and incorrectly triggers error status. Concurrent runners reading the same pending cycle can likewise duplicate the attempt. Atomically record freshness and acknowledge the cycle, or add durable per-cycle deduplication with concurrency protection.

- [P2] Keep new settlements behind failed freshness replays — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/reconcile/run.ts:285-286
  When replaying an older cycle fails, `replayFreshness` returns but `runReconcile` continues and settlement directly records the new cycle. If the transient failure clears before settlement, the newer attempt is recorded first and the older pending attempt is replayed on the next run. This can move `last_ok_at` and `last_attempt_at` backward or count an old failure after a newer success. Route settlement through the ordered pending queue, and preserve the ordering across concurrent runners rather than recording the newly settled row directly.
The new freshness persistence can overwrite concurrent merge registrations, duplicate attempts after interruptions, and replay attempts out of order. These undermine both reconciliation scheduling and freshness accuracy.

Full review comments:

- [P1] Patch cycle freshness without replacing concurrent detail updates — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/reconcile/run.ts:280-283
  If `set_merge` commits a `detail.pending_members` registration between this read and update, the replacement `detail` silently deletes it. The same race exists in `recordFreshness`, and can also restore entries already consumed by `open_reconcile_cycle`. These functions explicitly coordinate pending registrations in SQL, but the new read-then-replace writes bypass that coordination. Update only the freshness key against the current row inside a locked database transaction, including during settlement.

- [P2] Make freshness recording idempotent per cycle — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/reconcile/run.ts:253-257
  If `recordAttempt` succeeds but the subsequent cycle update fails or the process stops, the next replay records the same attempt again. Because `recordAttempt` unconditionally increments `consecutive_errors` for a failed cycle, one cycle with gaps becomes two errors and incorrectly triggers error status. Concurrent runners reading the same pending cycle can likewise duplicate the attempt. Atomically record freshness and acknowledge the cycle, or add durable per-cycle deduplication with concurrency protection.

- [P2] Keep new settlements behind failed freshness replays — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/reconcile/run.ts:285-286
  When replaying an older cycle fails, `replayFreshness` returns but `runReconcile` continues and settlement directly records the new cycle. If the transient failure clears before settlement, the newer attempt is recorded first and the older pending attempt is replayed on the next run. This can move `last_ok_at` and `last_attempt_at` backward or count an old failure after a newer success. Route settlement through the ordered pending queue, and preserve the ordering across concurrent runners rather than recording the newly settled row directly.

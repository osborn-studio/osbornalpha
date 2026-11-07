OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b0f1-ddc1-7950-a4ad-758112a030d4
--------
user
commit e5e8a30
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat e5e8a30; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 3424ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-1dM4184f' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-5nGkeJSI' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/14a-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/14a-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/14a-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-XCgEeACK' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-kcZUyndC' (errno=Operation not permitted)
commit e5e8a30c653e66a41c29d31cfcacc8fd2ec68d5f
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 04:59:46 2026 -0800

    fix(dq): US gold pair resolves owners at entry date, keeps recorded owner, defers lineage conflicts, aggregates members
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

 src/lib/dq/reconcile/pair-us-gold.ts | 37 ++++++++++++++++---------
 src/lib/dq/reconcile/pairs.test.ts   | 52 ++++++++++++++++++++++++++++++++++++
 2 files changed, 77 insertions(+), 12 deletions(-)

exec
/bin/zsh -lc 'pwd; for p in /AGENTS.md /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do test ! -f "$p" || cat "$p"; done; ls -a | head -30; git show e5e8a30; cat src/lib/dq/reconcile/pair-us-gold.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
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
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-FCX6pNQ0' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-00tOFqIo' (errno=Operation not permitted)
commit e5e8a30c653e66a41c29d31cfcacc8fd2ec68d5f
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 04:59:46 2026 -0800

    fix(dq): US gold pair resolves owners at entry date, keeps recorded owner, defers lineage conflicts, aggregates members
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/dq/reconcile/pair-us-gold.ts b/src/lib/dq/reconcile/pair-us-gold.ts
index e8fcdf7..491a5e0 100644
--- a/src/lib/dq/reconcile/pair-us-gold.ts
+++ b/src/lib/dq/reconcile/pair-us-gold.ts
@@ -17,7 +17,7 @@ import {compareDecimal} from './decimal';
 import {computeInputsHash} from './inputs-hash';
 import {ReconcileConfigError,actionFor,comparedNumeric,fractionDigits,mismatchItem,notCompared,openMismatches,readRepoJson,todayOf} from './pair-support';
 import type {RegisteredPair} from './pair-support';
-import type {MemberPlan,ReconcileResultInput} from './types';
+import type {MemberPlan,PairContext,ReconcileResultInput} from './types';
 
 export const US_GOLD_PATH='src/lib/facts/fixtures/gold/plan2.json';
 export const US_GOLD_PARSER='gold-us/1';
@@ -54,6 +54,14 @@ export function usGoldEntries(json:unknown):{ready:boolean;entries:UsGoldEntry[]
  return {ready:j.ready===true,entries:out};
 }
 
+/** Is the entry's key reported in conflicts by the lineage read of the member's current target? */
+async function inLineageConflict(ctx:PairContext,issuerId:string,e:UsGoldEntry,left:FactRow):Promise<boolean>{
+ const target=await ctx.db.targetOf(issuerId);
+ const env=await ctx.db.readFactsLineage(await ctx.db.lineageOf(target),'US',{concepts:[e.concept],asOf:todayOf(ctx)});
+ if(env.truncated)throw new ReconcileConfigError('lineage_read_truncated',`${target}/US`);
+ return env.conflicts.some(c=>String(c.key.concept)===e.concept&&String(c.key.period_end)===e.period_end&&String(c.key.unit)===e.unit&&(c.key.period_start??null)===(left.period_start??null));
+}
+
 export function usCompanyfactsVsGoldPair():RegisteredPair{
  return {
   id:PAIR,kind:'numeric',left:DATASETS.facts('US'),right:'gold.plan2',
@@ -68,15 +76,18 @@ export function usCompanyfactsVsGoldPair():RegisteredPair{
   },
   async members(ctx){
    const {json}=await readRepoJson(ctx,US_GOLD_PATH,'invalid_gold_file');
-   const byTicker=new Map<string,UsGoldEntry[]>();
-   for(const e of usGoldEntries(json).entries)byTicker.set(e.ticker,[...(byTicker.get(e.ticker)??[]),e]);
-   const out:MemberPlan[]=[];
-   for(const [ticker,list] of [...byTicker.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0)){
-    const r=await resolveIssuer(ctx.tables,{ticker},{today:todayOf(ctx)});
-    if(!r)throw new ReconcileConfigError('issuer_unresolved',ticker);
-    out.push({issuerId:r.issuer_id,market:'US',expectedKeys:list.map(e=>({naturalKey:usGoldKey(e),locator:{index:e.index,ticker:e.ticker,concept:e.concept,period_end:e.period_end,unit:e.unit,duration:e.duration,as_of:e.as_of,pending:e.pending}}))});
+   const byOwner=new Map<string,MemberPlan>();
+   const entries=[...usGoldEntries(json).entries].sort((x,y)=>x.ticker<y.ticker?-1:x.ticker>y.ticker?1:x.index-y.index);
+   for(const e of entries){
+    // the ticker's owner AT the entry's own date, never today; a merged owner stays the recorded owner (no redirect)
+    const r=await resolveIssuer(ctx.tables,{ticker:e.ticker},{asOf:e.as_of??e.period_end});
+    if(!r)throw new ReconcileConfigError('issuer_unresolved',e.ticker);
+    const owner=r.redirected_from??r.issuer_id;
+    const plan=byOwner.get(owner)??{issuerId:owner,market:'US' as const,expectedKeys:[]};
+    plan.expectedKeys.push({naturalKey:usGoldKey(e),locator:{index:e.index,ticker:e.ticker,concept:e.concept,period_end:e.period_end,unit:e.unit,duration:e.duration,as_of:e.as_of,pending:e.pending,owner_issuer_id:owner}});
+    byOwner.set(owner,plan);
    }
-   return out;
+   return [...byOwner.values()];
   },
   async evaluate(ctx,member){
    const {json,sha256:goldSha}=await readRepoJson(ctx,US_GOLD_PATH,'invalid_gold_file');
@@ -89,18 +100,20 @@ export function usCompanyfactsVsGoldPair():RegisteredPair{
     if(e.pending||e.value===null){out.push(notCompared(k.naturalKey,'numeric','incomplete_gold',SIDES,{reason:'pending',gold_index:e.index}));continue;}
     const bound=open.get(k.naturalKey);
     let rows:FactRow[];
-    if(bound)rows=(await ctx.db.factsByIds([bound.factIds[0]])).slice(0,1);
+    if(bound)rows=(await ctx.db.factsByIds([bound.factIds[0]])).filter(r=>r.issuer_id===member.issuerId).slice(0,1);   // fenced issuer's facts only
     else rows=(await ctx.db.readFacts(member.issuerId,'US',{concepts:[e.concept],asOf:e.as_of??todayOf(ctx),from:e.period_end,to:e.period_end})).rows
      .filter(r=>r.period_end===e.period_end&&r.unit===e.unit&&r.duration===e.duration&&r.is_current===true);
     if(rows.length>1){out.push(notCompared(k.naturalKey,'numeric','left_ambiguous',SIDES,{gold_index:e.index,fact_ids:rows.map(r=>r.fact_id)}));continue;}
     const left=rows[0];
     if(!left){out.push(notCompared(k.naturalKey,'numeric','left_missing',SIDES,{gold_index:e.index,as_of:e.as_of}));continue;}
     const passed=compareDecimal(left.value,e.value)===0;
+    // a same-day lineage conflict on this key belongs to facts.lineage_same_day: record only, never quarantine here
+    const lineageConflict=bound===undefined&&await inLineageConflict(ctx,member.issuerId,e,left);
     const inputs_hash=computeInputsHash({left_raw_hash:left.raw_hash,right_sha256:goldSha,gold_or_sample_sha256:goldSha,parser_version:US_GOLD_PARSER});
-    const action=actionFor({bound:bound!==undefined,leftStatus:left.status,compared:true,passed,onFail:'quarantine_left'});
+    const action=lineageConflict?'record' as const:actionFor({bound:bound!==undefined,leftStatus:left.status,compared:true,passed,onFail:'quarantine_left'});
     const locator={document:US_GOLD_PATH,index:e.index,source:e.source};
     out.push(comparedNumeric(k.naturalKey,left.value,e.value,{passed,tolerance:'0',sides:SIDES,inputs_hash,left_fact_id:left.fact_id,action,
-     detail:{left:{fact_id:left.fact_id,raw_hash:left.raw_hash,precision:{decimals:fractionDigits(left.value_text)}},right:{document:US_GOLD_PATH,sha256:goldSha,locator,precision:{exact:true}},unit:e.unit,tolerance_rule:'exact/1',inputs_hash,as_of:e.as_of},
+     detail:{left:{fact_id:left.fact_id,raw_hash:left.raw_hash,precision:{decimals:fractionDigits(left.value_text)}},right:{document:US_GOLD_PATH,sha256:goldSha,locator,precision:{exact:true}},unit:e.unit,tolerance_rule:'exact/1',inputs_hash,as_of:e.as_of,...(lineageConflict?{lineage_conflict:true}:{})},
      ...(action==='record'?{}:{item:mismatchItem(PAIR,k.naturalKey,left,e.value,locator,inputs_hash)})}));
    }
    return out;
diff --git a/src/lib/dq/reconcile/pairs.test.ts b/src/lib/dq/reconcile/pairs.test.ts
index 66bd9cc..c3bc4d6 100644
--- a/src/lib/dq/reconcile/pairs.test.ts
+++ b/src/lib/dq/reconcile/pairs.test.ts
@@ -116,6 +116,58 @@ describe('us.companyfacts_vs_gold (T15)',()=>{
  });
 });
 
+describe('us.companyfacts_vs_gold identity (Codex review)',()=>{
+ const sec=(tables:TableClient,issuer_id:string,ticker:string,valid_from:string,valid_to:string|null)=>tables.insert('issuer_securities',{issuer_id,ticker,valid_from,valid_to,is_primary:true,share_class:'common',isin:null,figi:null});
+ const newIssuer=async(tables:TableClient,name:string,status='active')=>{const id=randomUUID();await tables.insert('issuers',{issuer_id:id,status,merged_into:null,cik:null,lei:null,usci:null,canonical_name_en:name,canonical_name_zh:null});return id;};
+ it('resolves each entry at its own date: A owns the ticker in 2024, B from 2025 (not today)',async()=>{
+  const {tables,ctx,files}=setup();
+  const a=await newIssuer(tables,'A'),b=await newIssuer(tables,'B');
+  await sec(tables,a,'ZREUSE','2000-01-01','2025-01-01');await sec(tables,b,'ZREUSE','2025-01-01',null);
+  files.set(US_GOLD_PATH,enc(goldFile([entry({ticker:'ZREUSE',period_end:'2023-12-31',as_of:'2024-03-01'}),entry({ticker:'ZREUSE',period_end:'2024-12-31',as_of:'2025-03-01'})])));
+  const members=await usCompanyfactsVsGoldPair().members(ctx);
+  expect(members.map(m=>[m.issuerId,m.expectedKeys.map(k=>k.naturalKey)]).sort()).toEqual([[a,['ZREUSE:revenue:2023-12-31:12M:USD']],[b,['ZREUSE:revenue:2024-12-31:12M:USD']]].sort());
+  expect(members.find(m=>m.issuerId===a)!.expectedKeys[0].locator.owner_issuer_id).toBe(a);
+ });
+ it('aggregates two share-class tickers of one issuer into one member that openReconcileCycle accepts',async()=>{
+  const {tables,db,ctx,files}=setup();
+  const id=await newIssuer(tables,'Dual');await sec(tables,id,'ZDUALA','2000-01-01',null);await sec(tables,id,'ZDUALB','2000-01-01',null);
+  files.set(US_GOLD_PATH,enc(goldFile([entry({ticker:'ZDUALA'}),entry({ticker:'ZDUALB'})])));
+  const members=await usCompanyfactsVsGoldPair().members(ctx);
+  expect(members).toHaveLength(1);expect(members[0].expectedKeys).toHaveLength(2);
+  const r=await db.openReconcileCycle({pair:'us.companyfacts_vs_gold',cycleId:randomUUID(),startedAt:'2026-11-05T00:00:00Z',members:members.map(m=>({issuer_id:m.issuerId,market:m.market,expected_keys:m.expectedKeys})),pending:[]});
+  expect(r.created).toBe(true);
+ });
+ async function mergedSource(sourceValue:string){
+  const s=setup();
+  const target=await issuer(s.tables,'ZTGT2');const source=await issuer(s.tables,'ZSRC2',{status:'merged'});
+  await s.tables.update('issuers',{issuer_id:source},{merged_into:target});
+  s.db.setTopology({[source]:{status:'merged',merged_into:target}});
+  const t=await seedPublished(s.db,{issuer:target,market:'US',sourceRef:'0009990300-24-000001',availableDate:'2024-02-15',facts:[{concept:'revenue',value:'1200',...FY23}]});
+  const src=await seedPublished(s.db,{issuer:source,market:'US',sourceRef:'0009990301-24-000001',availableDate:'2024-02-15',facts:[{concept:'revenue',value:sourceValue,...FY23}]});
+  return {...s,target,source,t,src};
+ }
+ it('keeps a merged source as the recorded owner and reads its own facts; a lineage-conflicting key is recorded, never quarantined',async()=>{
+  const {ctx,files,source,src}=await mergedSource('1000');
+  files.set(US_GOLD_PATH,enc(goldFile([entry({ticker:'ZSRC2',value:'999'})])));
+  const pair=usCompanyfactsVsGoldPair();const [m]=await pair.members(ctx);
+  expect(m.issuerId).toBe(source);
+  const [r]=await pair.evaluate(ctx,m);
+  expect(r).toMatchObject({outcome:'compared',passed:false,left_value:'1000',right_value:'999',action:'record',left_fact_id:src.factIds[0],detail:expect.objectContaining({lineage_conflict:true})});
+  expect(r.item).toBeUndefined();
+ });
+ it('a bound item whose fact belongs to another issuer is left_missing (record), never an invalid result',async()=>{
+  const {tables,ctx,files,source,t}=await mergedSource('1200');
+  const nk='ZSRC2:revenue:2023-12-31:12M:USD';
+  await tables.insert('dq_quarantine',{id:randomUUID(),dataset:'facts.us',table_name:'financial_facts',natural_key:`us.companyfacts_vs_gold:${nk}:${t.factIds[0]}`,reason_code:'reconcile_mismatch',detail:{pair:'us.companyfacts_vs_gold'},payload:{fact_ids:[t.factIds[0]]},batch_id:randomUUID(),status:'open',resolved_by:null,resolved_at:null,created_at:'2026-11-05T00:00:00Z'});
+  files.set(US_GOLD_PATH,enc(goldFile([entry({ticker:'ZSRC2',value:'1200'})])));
+  const pair=usCompanyfactsVsGoldPair();const [m]=await pair.members(ctx);
+  expect(m.issuerId).toBe(source);
+  const [r]=await pair.evaluate(ctx,m);
+  expect(r).toMatchObject({outcome:'left_missing',action:'record'});
+  expect(r.left_fact_id).toBeUndefined();
+ });
+});
+
 describe('facts.lineage_same_day (§4.4)',()=>{
  async function merged(){
   const s=setup();
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

/** Is the entry's key reported in conflicts by the lineage read of the member's current target? */
async function inLineageConflict(ctx:PairContext,issuerId:string,e:UsGoldEntry,left:FactRow):Promise<boolean>{
 const target=await ctx.db.targetOf(issuerId);
 const env=await ctx.db.readFactsLineage(await ctx.db.lineageOf(target),'US',{concepts:[e.concept],asOf:todayOf(ctx)});
 if(env.truncated)throw new ReconcileConfigError('lineage_read_truncated',`${target}/US`);
 return env.conflicts.some(c=>String(c.key.concept)===e.concept&&String(c.key.period_end)===e.period_end&&String(c.key.unit)===e.unit&&(c.key.period_start??null)===(left.period_start??null));
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
    const r=await resolveIssuer(ctx.tables,{ticker:e.ticker},{asOf:e.as_of??e.period_end});
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
    const bound=open.get(k.naturalKey);
    let rows:FactRow[];
    if(bound)rows=(await ctx.db.factsByIds([bound.factIds[0]])).filter(r=>r.issuer_id===member.issuerId).slice(0,1);   // fenced issuer's facts only
    else rows=(await ctx.db.readFacts(member.issuerId,'US',{concepts:[e.concept],asOf:e.as_of??todayOf(ctx),from:e.period_end,to:e.period_end})).rows
     .filter(r=>r.period_end===e.period_end&&r.unit===e.unit&&r.duration===e.duration&&r.is_current===true);
    if(rows.length>1){out.push(notCompared(k.naturalKey,'numeric','left_ambiguous',SIDES,{gold_index:e.index,fact_ids:rows.map(r=>r.fact_id)}));continue;}
    const left=rows[0];
    if(!left){out.push(notCompared(k.naturalKey,'numeric','left_missing',SIDES,{gold_index:e.index,as_of:e.as_of}));continue;}
    const passed=compareDecimal(left.value,e.value)===0;
    // a same-day lineage conflict on this key belongs to facts.lineage_same_day: record only, never quarantine here
    const lineageConflict=bound===undefined&&await inLineageConflict(ctx,member.issuerId,e,left);
    const inputs_hash=computeInputsHash({left_raw_hash:left.raw_hash,right_sha256:goldSha,gold_or_sample_sha256:goldSha,parser_version:US_GOLD_PARSER});
    const action=lineageConflict?'record' as const:actionFor({bound:bound!==undefined,leftStatus:left.status,compared:true,passed,onFail:'quarantine_left'});
    const locator={document:US_GOLD_PATH,index:e.index,source:e.source};
    out.push(comparedNumeric(k.naturalKey,left.value,e.value,{passed,tolerance:'0',sides:SIDES,inputs_hash,left_fact_id:left.fact_id,action,
     detail:{left:{fact_id:left.fact_id,raw_hash:left.raw_hash,precision:{decimals:fractionDigits(left.value_text)}},right:{document:US_GOLD_PATH,sha256:goldSha,locator,precision:{exact:true}},unit:e.unit,tolerance_rule:'exact/1',inputs_hash,as_of:e.as_of,...(lineageConflict?{lineage_conflict:true}:{})},
     ...(action==='record'?{}:{item:mismatchItem(PAIR,k.naturalKey,left,e.value,locator,inputs_hash)})}));
   }
   return out;
  },
 };
}

exec
/bin/zsh -lc "cat src/lib/entities/resolve.ts; cat src/lib/dq/reconcile/pair-lineage.ts; rg -n 'readFactsLineage|targetOf\\(|lineageOf\\(' src/lib/facts src/lib/dq | head -65; find . -name '*AGENTS*' -not -path './node_modules/*'; ls .claude; cat src/lib/dq/reconcile/pair-support.ts" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 701ms:
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
// src/lib/dq/reconcile/pair-lineage.ts
// facts.lineage_same_day (spec §4.4, §5.1). Members: every target T that has referrers
// (issuers.status='merged' rows' merged_into, deduplicated) × each market where readFactsLineage over
// lineageOf(T) reports conflicts; expected keys = those conflicts at cycle creation, keyed
// <T>:<K>:<available_date> (K = facts/keys factKey). opts.targets restricts the enumeration (tests and
// targeted script runs); the registry instance has none. Evaluation re-reads the lineage: a conflict
// still present → compared, passed=false, action lineage_item (one lineage_conflict item per key, payload
// {fact_ids, values, key, available_date, target}; never auto-chosen); a conflict that is gone → the
// frozen fact_ids still ok are compared (equal values → passed, reason conflict_cleared), none ok →
// left_missing. A truncated lineage read is an execution failure (member retried), never a result.
import {selectAll} from '../../db/table-client';
import {CONCEPT_IDS} from '../../facts/concepts';
import {factKey} from '../../facts/keys';
import type {FactRow,LineageConflict,Market} from '../../facts/types';
import {compareDecimal} from './decimal';
import {ReconcileConfigError,comparedNumeric,notCompared,todayOf} from './pair-support';
import type {RegisteredPair} from './pair-support';
import type {ExpectedKey,MemberPlan,PairContext,ReconcileResultInput} from './types';

const MARKETS:readonly Market[]=['US','CN'];
const s=(v:unknown)=>v===null||v===undefined?null:String(v);
export const lineageNaturalKey=(target:string,c:Pick<LineageConflict,'key'|'available_date'>):string=>
 `${target}:${factKey({concept:String(c.key.concept),period_start:s(c.key.period_start),period_end:String(c.key.period_end),consolidation:String(c.key.consolidation),unit:String(c.key.unit)})}:${c.available_date}`;
const byIssuerThenId=(a:FactRow,b:FactRow)=>a.issuer_id<b.issuer_id?-1:a.issuer_id>b.issuer_id?1:a.fact_id<b.fact_id?-1:a.fact_id>b.fact_id?1:0;

async function conflictsOf(ctx:PairContext,target:string,market:Market):Promise<LineageConflict[]>{
 const env=await ctx.db.readFactsLineage(await ctx.db.lineageOf(target),market,{concepts:[...CONCEPT_IDS],asOf:todayOf(ctx)});
 if(env.truncated)throw new ReconcileConfigError('lineage_read_truncated',`${target}/${market}`);
 return env.conflicts;
}

async function planOf(ctx:PairContext,target:string,market:Market):Promise<MemberPlan>{
 const keys=new Map<string,ExpectedKey>();
 for(const c of await conflictsOf(ctx,target,market)){const nk=lineageNaturalKey(target,c);if(!keys.has(nk))keys.set(nk,{naturalKey:nk,locator:{key:c.key,available_date:c.available_date,fact_ids:c.fact_ids}});}
 return {issuerId:target,market,expectedKeys:[...keys.values()]};
}

export function lineageSameDayPair(opts:{targets?:readonly string[]}={}):RegisteredPair{
 return {
  id:'facts.lineage_same_day',kind:'numeric',left:'facts.lineage',right:'facts.lineage',
  inputs:{repoFile:null,parserVersion:'lineage/1',goldSchema:null},
  async currentRight(){return null;},   // never produces reconcile_mismatch items (lineage verdicts are lineage_conflict items)
  async members(ctx){
   const merged=await selectAll(ctx.tables,'issuers',{status:'merged'},'issuer_id');
   const targets=[...new Set(merged.map(r=>r.merged_into).filter((x):x is string=>typeof x==='string'))]
    .filter(t=>opts.targets===undefined||opts.targets.includes(t)).sort();
   const out:MemberPlan[]=[];
   for(const target of targets)for(const market of MARKETS){
    const plan=await planOf(ctx,target,market);
    if(plan.expectedKeys.length>0)out.push(plan);
   }
   return out;
  },
  /** one pending target (plan audit Q2): the same keys members() would give it now; zero conflicts → zero keys */
  async memberFor(ctx,issuerId,market){return planOf(ctx,issuerId,market);},
  async evaluate(ctx,member){
   let live:Map<string,LineageConflict>;
   try{live=new Map((await conflictsOf(ctx,member.issuerId,member.market)).map(c=>[lineageNaturalKey(member.issuerId,c),c]));}
   catch(e){if(e instanceof ReconcileConfigError)throw new Error(`lineage_read_truncated:${member.issuerId}`);throw e;}
   const out:ReconcileResultInput[]=[];
   for(const k of member.expectedKeys){
    const c=live.get(k.naturalKey);
    const ids=c?c.fact_ids:(Array.isArray(k.locator.fact_ids)?k.locator.fact_ids.map(String):[]);
    const rows=(await ctx.db.factsByIds(ids)).sort(byIssuerThenId);
    const sides=(l:FactRow,r:FactRow)=>({left_source:`facts.lineage:${l.issuer_id}`,right_source:`facts.lineage:${r.issuer_id}`});
    const values=rows.map(r=>({issuer_id:r.issuer_id,filing:r.filing_id,fact_id:r.fact_id,value:r.value,status:r.status}));
    if(c){
     const left=rows[0];const right=left?(rows.find(r=>compareDecimal(r.value,left.value)!==0)??rows[1]):undefined;
     if(!left||!right){out.push(notCompared(k.naturalKey,'numeric','left_missing',{left_source:'facts.lineage',right_source:'facts.lineage'},{target:member.issuerId,reason:'conflict_rows_missing',fact_ids:ids}));continue;}
     out.push(comparedNumeric(k.naturalKey,left.value,right.value,{passed:false,tolerance:'0',sides:sides(left,right),action:'lineage_item',
      detail:{target:member.issuerId,available_date:c.available_date,key:c.key,values,tolerance_rule:'exact/1'},
      item:{natural_key:k.naturalKey,payload:{fact_ids:c.fact_ids,values:values.map(({issuer_id,filing,fact_id,value})=>({issuer_id,filing,fact_id,value})),key:c.key,available_date:c.available_date,target:member.issuerId},detail:{target:member.issuerId,market:member.market}}}));
     continue;
    }
    const ok=rows.filter(r=>r.status==='ok');
    if(ok.length===0){out.push(notCompared(k.naturalKey,'numeric','left_missing',{left_source:'facts.lineage',right_source:'facts.lineage'},{target:member.issuerId,reason:'no_ok_value',values}));continue;}
    const first=ok[0],other=ok.find(r=>compareDecimal(r.value,first.value)!==0);
    out.push(comparedNumeric(k.naturalKey,first.value,(other??ok[ok.length-1]).value,{passed:other===undefined,tolerance:'0',sides:sides(first,other??ok[ok.length-1]),action:'record',
     detail:{target:member.issuerId,reason:other===undefined?'conflict_cleared':'conflict_not_reported',values,tolerance_rule:'exact/1'}}));
   }
   return out;
  },
 };
}
src/lib/facts/types.ts:108: targetOf(issuer:string):Promise<string>;
src/lib/facts/types.ts:110: lineageOf(target:string):Promise<string[]>;
src/lib/facts/types.ts:113: readFactsLineage(issuers:string[],market:Market,opts:ReadFactsOptions):Promise<ReadFactsLineageResult>;
src/lib/facts/db.ts:243:  async targetOf(issuer){const r=await rows<{merged_into:string|null}>(c.from('issuers').select('merged_into').eq('issuer_id',issuer).limit(1));return r[0]?.merged_into??issuer;},
src/lib/facts/db.ts:244:  async lineageOf(target){return [target,...(await pageAll<{issuer_id:string}>(()=>c.from('issuers').select('issuer_id').eq('merged_into',target).order('issuer_id'))).map(r=>String(r.issuer_id))];},
src/lib/facts/db.ts:250:  async readFactsLineage(issuers,market,opts){return lineageResultFromEnvelope(await call<ReadFactsLineageEnvelope>('read_facts_lineage',readLineageArgs(issuers,market,opts)));},
src/lib/facts/db.test.ts:237:  expect(await db.readFactsLineage([I2,I1],'US',{concepts:['revenue'],asOf:'2030-01-01',history:true})).toEqual({stateRevs:[{issuer_id:I1,state_rev:3},{issuer_id:I2,state_rev:4}],lineage:[I1,I2],
src/lib/facts/db.test.ts:282:  expect(await db.targetOf('S')).toBe('T');
src/lib/facts/db.test.ts:283:  expect(await db.lineageOf('T')).toEqual(['T','A','B']);
src/lib/facts/db.test.ts:344:  expect(await db.lineageOf(c)).toEqual([c,a,b]);expect(await db.targetOf(a)).toBe(c);expect(await db.targetOf(c)).toBe(c);expect(await db.targetOf('unknown')).toBe('unknown');
src/lib/facts/db.test.ts:406: it('an uppercase issuer uuid is the same issuer at every boundary: reconcileScope → stage → publish → replaceMetricsLineage → stateRevs → readFactsLineage',async()=>{
src/lib/facts/db.test.ts:415:  const r=await db.readFactsLineage([UP],'US',{concepts:['revenue'],asOf:'2030-01-01'});
src/lib/facts/db.test.ts:419:  expect(await db.lineageOf(UP)).toEqual([lo]);expect(await db.targetOf(UP)).toBe(lo);
src/lib/dq/reconcile/pair-lineage.ts:3:// (issuers.status='merged' rows' merged_into, deduplicated) × each market where readFactsLineage over
src/lib/dq/reconcile/pair-lineage.ts:4:// lineageOf(T) reports conflicts; expected keys = those conflicts at cycle creation, keyed
src/lib/dq/reconcile/pair-lineage.ts:27: const env=await ctx.db.readFactsLineage(await ctx.db.lineageOf(target),market,{concepts:[...CONCEPT_IDS],asOf:todayOf(ctx)});
src/lib/dq/pending-hooks.ts:53:  try{target=await deps.db.targetOf(it.issuer);}
src/lib/facts/pg-facts-db.ts:79:  async targetOf(issuer){return ((await run(`select merged_into from ${rel('issuers')} where issuer_id = $1`,[issuer])).rows[0]?.merged_into as string|null|undefined)??issuer;},
src/lib/facts/pg-facts-db.ts:80:  async lineageOf(target){return [target,...(await run(`select issuer_id from ${rel('issuers')} where merged_into = $1 order by issuer_id`,[target])).rows.map(r=>String(r.issuer_id))];},
src/lib/facts/pg-facts-db.ts:82:  async readFactsLineage(issuers,market,opts){return lineageResultFromEnvelope(await readLineage(issuers,market,opts));},
src/lib/dq/reconcile/pair-us-gold.ts:59: const target=await ctx.db.targetOf(issuerId);
src/lib/dq/reconcile/pair-us-gold.ts:60: const env=await ctx.db.readFactsLineage(await ctx.db.lineageOf(target),'US',{concepts:[e.concept],asOf:todayOf(ctx)});
src/lib/facts/sync-us.integration.test.ts:270:   readFactsLineage:async(i,m,o)=>{
src/lib/facts/sync-us.integration.test.ts:271:    const env=await db.readFactsLineage(i,m,o);reads++;
src/lib/facts/derive.ts:14:// materialize() follows the plan-3 lineage contract (spec §4.4, T9): target T = targetOf(issuer); the
src/lib/facts/derive.ts:215:export type MaterializeDb=Pick<FactsDb,'targetOf'|'lineageOf'|'readFactsLineage'|'replaceMetricsLineage'>;
src/lib/facts/derive.ts:236:  const target=await db.targetOf(issuer);
src/lib/facts/derive.ts:237:  const lineage=await db.lineageOf(target);
src/lib/facts/derive.ts:238:  const env=await db.readFactsLineage(lineage,market,{concepts:[...DERIVE_CONCEPTS[market]],asOf,history:true});
src/lib/facts/derive.test.ts:257:   async targetOf(i){return o.target??i;},
src/lib/facts/derive.test.ts:258:   async lineageOf(t){return o.lineage??[t];},
src/lib/facts/derive.test.ts:259:   async readFactsLineage(issuers){readArgs.push(issuers);return envs[Math.min(reads++,envs.length-1)];},
src/lib/facts/derive.test.ts:309:  const db:MaterializeDb={targetOf:i=>mem.targetOf(i),lineageOf:t=>mem.lineageOf(t),readFactsLineage:(i,m,o)=>mem.readFactsLineage(i,m,o),
src/lib/facts/db-contract.ts:387:   expect(await db.lineageOf(b)).toEqual([b,a]);expect(await db.targetOf(a)).toBe(b);expect(await db.targetOf(b)).toBe(b);
src/lib/facts/db-contract.ts:390:   expect(await db.lineageOf(c)).toEqual([c,...[a,b].sort()]);expect(await db.targetOf(a)).toBe(c);
src/lib/facts/db-contract.ts:400:  it('plan 3 readFactsLineage: one member equals readFacts in every mode; two members move a cross-issuer same-day disagreement into conflicts (the earlier disclosure becomes current); equal values are no conflict',async()=>{
src/lib/facts/db-contract.ts:403:    const one=await db.readFactsLineage([t],'US',{concepts:['revenue'],asOf:'2030-01-01',...o});
src/lib/facts/db-contract.ts:408:   const two=await db.readFactsLineage([t,s],'US',{concepts:['revenue'],asOf:'2030-01-01',history:true});
src/lib/facts/db-contract.ts:413:   const same=await db.readFactsLineage([t,u],'US',{concepts:['revenue'],asOf:'2030-01-01',history:true});
src/lib/facts/db-contract.ts:426:   const lin=await db.stateRevs(await db.lineageOf(t),'US');
src/lib/facts/db-contract.ts:526:   const lin=await db.lineageOf(t);
src/lib/facts/db-contract.ts:527:   expect((await db.readFactsLineage(lin,'US',{concepts:['revenue'],asOf:'2030-01-01'})).conflicts.map(cf=>cf.fact_ids)).toEqual([[r,x].sort()]);
src/lib/facts/db-contract.ts:533:   const after=await db.readFactsLineage(lin,'US',{concepts:['revenue'],asOf:'2030-01-01'});
src/lib/facts/db-contract.ts:666:  it('plan 3 readFactsLineage includeNonOk: quarantined rows appear only with includeNonOk AND history, never as current, without sequence; staged rows never appear',async()=>{
src/lib/facts/db-contract.ts:674:   const rd=async(o:{history:boolean;includeNonOk:boolean})=>(await db.readFactsLineage([t],'US',{concepts:['revenue'],asOf:'2030-01-01',...o})).rows.map(y=>[y.fact_id,y.disclosure_seq??null,y.is_current,y.is_revision]);
src/lib/facts/db-contract.ts:679:   expect((await db.readFactsLineage([t],'US',{concepts:['revenue'],asOf:'2030-01-01',history:true,includeNonOk:true})).rows.map(y=>y.status)).toEqual(['ok','ok','quarantined']);
src/lib/facts/db-contract.ts:686:   const lin=await db.stateRevs(await db.lineageOf(t),'US');
src/lib/facts/db-contract.ts:706:    expect((await db.readFactsLineage([t],'US',{concepts:['revenue'],asOf:'2030-01-01',history:true,includeNonOk:true,from:'2023-09-30',to:'2023-09-30'})).rows).toEqual([]);   // no fact inserted
src/lib/facts/memory-facts-db.ts:52:const ASYNC_METHODS=['claimLease','beginRun','stageFilings','stageFacts','quarantineFacts','publishRun','abandonRun','releaseLease','resolveFactsQuarantine','replaceMetrics','readFacts','factsByIds','openConflicts','filingsOfIssuer','updateFilingLink','reconcileScope','scopeDue','scopeRows','scopeAll','metricsOfIssuer','targetOf','lineageOf','stateRevs','readFactsLineage','readFilingFacts','replaceMetricsLineage','findFilingBySourceRef','filingsForCalendar','setFilingAcceptance','adoptCandidate','restoreReconciled','resolveLineageConflict','claimReconcileMember','applyReconcileResult','completeReconcileMember','failReconcileMember','openReconcileCycle','setMerge','setDissolved'] as const satisfies readonly (keyof FactsDb)[];
src/lib/facts/memory-facts-db.ts:440:  async targetOf(issuer){return topoOf(issuer).merged_into??issuer;},
src/lib/facts/memory-facts-db.ts:441:  async lineageOf(target){return lineageMembers(target);},
src/lib/facts/memory-facts-db.ts:443:  async readFactsLineage(issuers,market,o){return readLineage(issuers,market,o);},
src/lib/facts/memory-facts-db.ts:703:  stateRevs:arr(0),readFactsLineage:arr(0),scopeRows:arr(1),
agents
launch.json
scratch
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

export type ReconcileConfigCode='invalid_gold_file'|'invalid_sample_file'|'issuer_unresolved'|'lineage_read_truncated';
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

exec
/bin/zsh -lc "rg -n 'conflicts|history' src/lib/facts/lineage*; cat src/lib/facts/lineage.ts; rg -n 'readLineage|conflicts.push' src/lib/facts/memory-facts-db.ts; cat package.json | tail -60; find /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude -maxdepth 2 -name 'AGENTS*'; rg -n 'consolidation' src/lib/facts/types.ts src/lib/facts/read*" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
zsh:1: no matches found: src/lib/facts/lineage*
cat: src/lib/facts/lineage.ts: No such file or directory
211: const readLineage=(members:string[],market:Market,o:ReadFactsOptions):ReadFactsLineageResult=>{
224:    conflicts.push({key:{concept:f0.concept,period_start:f0.period_start,period_end:f0.period_end,consolidation:f0.consolidation,unit:f0.unit},available_date:f0.available_date,fact_ids:g.map(f=>f.fact_id).sort(cmp)});
390:  async readFacts(issuer,market,o){const r=readLineage([issuer],market,o);return {stateRev:r.stateRevs[0].state_rev,rows:r.rows,truncated:r.truncated};},
443:  async readFactsLineage(issuers,market,o){return readLineage(issuers,market,o);},
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
src/lib/facts/read.ts:38:const keyOrder=(a:FactRow,b:FactRow)=>cmp(a.concept,b.concept)||cmp(a.period_end,b.period_end)||cmp(a.period_start??'',b.period_start??'')||cmp(a.unit,b.unit)||cmp(a.consolidation,b.consolidation)||cmp(a.issuer_id,b.issuer_id)||cmp(a.market,b.market);
src/lib/facts/read.test.ts:12:const row=(filingId:string,value:string,availableDate:string,over:Partial<FactRow>={}):FactRow=>({fact_id:`20000000-0000-4000-8000-${String(++n).padStart(12,'0')}`,issuer_id:'i',market:'US',filing_id:filingId,run_id:'r',concept:'revenue',source_concept:'Revenues',statement:'IS',period_start:'2022-10-01',period_end:'2023-09-30',duration:'12M',value,value_text:value,unit:'USD',consolidation:'consolidated',available_date:availableDate,mapping_gen:1,mapping_version:'facts-map/1',status:'ok',raw_hash:'h',created_at:`2024-01-01T00:00:00.${String(n).padStart(3,'0')}Z`,...over});
src/lib/facts/read.test.ts:100: it('separates units and consolidations, keeps null period_start rows in one sequence, flags A to B to A as revisions',()=>{
src/lib/facts/read.test.ts:101:  const usd=row(F1,'1','2023-11-03');const eur=row(F1,'1','2023-11-03',{unit:'EUR'});const other=row(F1,'1','2023-11-03',{consolidation:'parent'});
src/lib/facts/types.ts:29: value:string;unit:string;consolidation:'consolidated';
src/lib/facts/types.ts:45: period_start:string|null;period_end:string;duration:Duration;value:string;value_text:string;unit:string;consolidation:string;
src/lib/facts/types.ts:136:export interface FactInsert{fact_id:string;issuer_id:string;market:Market;filing_id:string;concept:string;source_concept:string;statement:Statement;period_start:string|null;period_end:string;duration:Duration;value:string;unit:string;consolidation:'consolidated';available_date:string;mapping_gen:number;mapping_version:string;raw_hash:string}

exec
/bin/zsh -lc "sed -n '205,250p' src/lib/facts/memory-facts-db.ts; rg -n 'lineage.*(gold|quarantine)|gold.*lineage|recorded owner|entry.*date' docs/specs docs/plans 2>/dev/null | head -45; sed -n '1,120p' src/lib/dq/reconcile/pairs.test.ts; git log -3 --oneline; rg -n 'valid_from' src/lib/entities/seed* scripts/*seed* 2>/dev/null; head -55 src/lib/facts/fixtures/gold/plan2.json" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 11ms:
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
  if(norm.length===0||new Set(norm.map(x=>x.issuer_id)).size!==norm.length||!norm.some(x=>x.issuer_id===issuer)||norm.some(x=>!Number.isInteger(x.state_rev)||x.state_rev<0))throw unknown('invalid_based_on');
  if(norm.some(x=>!scopeOf(x.issuer_id,market)))throw new FactsDbError('scope_missing');
  if(topoOf(issuer).status!=='active')throw new FactsDbError('stale_computation');   // a merged / dissolved issuer is no materialisation target
  if([...lineageMembers(issuer)].sort(cmp).join(',')!==norm.map(x=>x.issuer_id).join(','))throw new FactsDbError('stale_computation');
  if(norm.some(x=>scopeOf(x.issuer_id,market)!.state_rev!==x.state_rev))throw new FactsDbError('stale_computation');
// src/lib/dq/reconcile/pairs.test.ts
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import type {TableClient} from '../../db/table-client';
import {memoryFactsDb} from '../../facts/memory-facts-db';
import {makeBudget} from '../../facts/sync';
import type {FilingFactRow,FilingRow} from '../../facts/types';
import {memoryRawStore} from '../raw-store';
import {computeInputsHash} from './inputs-hash';
import {ReconcileConfigError,actionFor,activeRows,openMismatches,sha256Hex} from './pair-support';
import {lineageSameDayPair} from './pair-lineage';
import {US_GOLD_PARSER,US_GOLD_PATH,usCompanyfactsVsGoldPair,usGoldEntries,usGoldKey} from './pair-us-gold';
import {RECONCILE_PAIRS,inputsHashNow} from './pairs';
import {reconcileTables,seedPublished} from './testing';
import {CYCLE_PAIR_IDS} from './types';
import type {MemberPlan,PairContext} from './types';

const enc=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v));
function setup(){
 const tables=reconcileTables();const db=memoryFactsDb(tables);
 const files=new Map<string,Uint8Array>();
 const ctx:PairContext={db,tables,raw:memoryRawStore(),now:()=>new Date('2026-11-05T00:00:00Z'),budget:makeBudget(null),
  fetch:(async()=>{throw new Error('no network in unit tests');}) as unknown as typeof fetch,
  readRepoFile:async p=>{const b=files.get(p);if(!b)throw new Error(`missing ${p}`);return b;}};
 return {tables,db,ctx,files};
}
async function issuer(tables:TableClient,ticker:string,o:{status?:string;merged_into?:string|null}={}){
 const id=randomUUID();
 await tables.insert('issuers',{issuer_id:id,status:o.status??'active',merged_into:o.merged_into??null,cik:null,lei:null,usci:null,canonical_name_en:ticker,canonical_name_zh:null});
 await tables.insert('issuer_securities',{issuer_id:id,ticker,valid_from:'2000-01-01',valid_to:null,is_primary:true,share_class:'common',isin:null,figi:null});
 return id;
}
const goldFile=(entries:object[])=>({version:1,ready:false,required:{US:true,CN:false},entries});
const entry=(o:{ticker?:string;concept?:string;period_end?:string;value?:string;recorded_by?:string;as_of?:string}={})=>({issuer:{ticker:o.ticker??'ZGOLD',market:'US'},concept:o.concept??'revenue',period_end:o.period_end??'2023-12-31',unit:'USD',value:o.value??'1000',as_of:o.as_of??'2024-03-01',source:{document:'ZGOLD 10-K FY2023',page_or_row:'p. 40',url:'https://example.invalid/zgold'},recorded_by:o.recorded_by??'R1',recorded_at:'2026-11-01T00:00:00Z'});
const FY23={period_start:'2023-01-01',period_end:'2023-12-31'};

describe('registry',()=>{
 it('holds only cycle pairs, keyed by their own id, with lineage and US gold registered by Task 14',()=>{
  for(const [id,p] of Object.entries(RECONCILE_PAIRS)){expect(CYCLE_PAIR_IDS as readonly string[]).toContain(id);expect(p!.id).toBe(id);expect(typeof p!.currentRight).toBe('function');}
  expect(RECONCILE_PAIRS['facts.lineage_same_day']).toBeDefined();
  expect(RECONCILE_PAIRS['us.companyfacts_vs_gold']?.inputs).toEqual({repoFile:US_GOLD_PATH,parserVersion:US_GOLD_PARSER,goldSchema:'plan2-gold/1'});
 });
 it('actionFor: bound → quarantine_left; failed ok row → onFail; everything else record',()=>{
  expect(actionFor({bound:true,leftStatus:'quarantined',compared:true,passed:true,onFail:'quarantine_left'})).toBe('quarantine_left');
  expect(actionFor({bound:true,leftStatus:'quarantined',compared:false,passed:false,onFail:'quarantine_left'})).toBe('quarantine_left');
  expect(actionFor({bound:false,leftStatus:'ok',compared:true,passed:false,onFail:'quarantine_left'})).toBe('quarantine_left');
  expect(actionFor({bound:false,leftStatus:'ok',compared:true,passed:false,onFail:'review_item'})).toBe('review_item');
  expect(actionFor({bound:false,leftStatus:'quarantined',compared:true,passed:false,onFail:'quarantine_left'})).toBe('record');
  expect(actionFor({bound:false,leftStatus:'ok',compared:true,passed:true,onFail:'quarantine_left'})).toBe('record');
  expect(actionFor({bound:false,leftStatus:null,compared:false,passed:false,onFail:'quarantine_left'})).toBe('record');
 });
 it('activeRows keeps the active generation of published runs, ok or quarantined (T1)',()=>{
  const filing={mapping_gen:2} as FilingRow;
  const r=(o:Partial<FilingFactRow>)=>({fact_id:randomUUID(),mapping_gen:2,run_status:'published',status:'ok',...o}) as FilingFactRow;
  const rows=[r({}),r({status:'quarantined'}),r({mapping_gen:1}),r({run_status:'staged'}),r({status:'staged'})];
  expect(activeRows(rows,filing)).toEqual(rows.slice(0,2));
  expect(activeRows(rows,{mapping_gen:0} as FilingRow)).toEqual([]);
 });
});

describe('us.companyfacts_vs_gold (T15)',()=>{
 it('the landed plan2.json has two US entries, both <pending> (ready:false)',()=>{
  const json=JSON.parse(readFileSync(US_GOLD_PATH,'utf8'));
  const g=usGoldEntries(json);
  expect(g.ready).toBe(false);
  expect(g.entries.map(e=>[e.ticker,e.pending])).toEqual([['AAPL',true],['MSFT',true]]);
 });
 it('every <pending> entry yields exactly one incomplete_gold result and is never compared',async()=>{
  const {tables,ctx,files}=setup();await issuer(tables,'ZGOLD');
  files.set(US_GOLD_PATH,enc(goldFile([entry({recorded_by:'<pending>'}),entry({concept:'net_income_parent',value:'<pending>'})])));
  const pair=usCompanyfactsVsGoldPair();
  const [m]=await pair.members(ctx);
  const res=await pair.evaluate(ctx,m);
  expect(res.map(r=>[r.outcome,r.passed,r.left_value,r.right_value,r.action])).toEqual([['incomplete_gold',false,null,null,'record'],['incomplete_gold',false,null,null,'record']]);
 });
 it('compares recorded entries exactly against the current ok row; a mismatch quarantines with a mismatch item; a missing fact is left_missing',async()=>{
  const {tables,db,ctx,files}=setup();const id=await issuer(tables,'ZGOLD');
  const seeded=await seedPublished(db,{issuer:id,market:'US',sourceRef:'0009990100-24-000001',availableDate:'2024-02-01',facts:[{concept:'revenue',value:'1000',...FY23},{concept:'net_income_parent',value:'100',...FY23}]});
  const bytes=enc(goldFile([entry(),entry({concept:'net_income_parent',value:'101'}),entry({concept:'total_assets',value:'5'})]));files.set(US_GOLD_PATH,bytes);
  const pair=usCompanyfactsVsGoldPair();
  const [m]=await pair.members(ctx);
  expect(m.expectedKeys.map(k=>k.naturalKey)).toEqual(['ZGOLD:revenue:2023-12-31:12M:USD','ZGOLD:net_income_parent:2023-12-31:12M:USD','ZGOLD:total_assets:2023-12-31:INSTANT:USD']);
  const [ok,bad,missing]=await pair.evaluate(ctx,m);
  const [revRow,niRow]=await db.factsByIds(seeded.factIds).then(rs=>[rs.find(r=>r.concept==='revenue')!,rs.find(r=>r.concept==='net_income_parent')!]);
  expect(ok).toMatchObject({outcome:'compared',passed:true,left_value:'1000',right_value:'1000',abs_diff:'0',rel_diff:'0',tolerance:'0',action:'record',left_fact_id:revRow.fact_id});
  expect(ok.inputs_hash).toBe(computeInputsHash({left_raw_hash:revRow.raw_hash,right_sha256:sha256Hex(bytes),gold_or_sample_sha256:sha256Hex(bytes),parser_version:US_GOLD_PARSER}));
  expect(bad).toMatchObject({outcome:'compared',passed:false,left_value:'100',right_value:'101',abs_diff:'1',action:'quarantine_left',left_fact_id:niRow.fact_id});
  expect(bad.item?.natural_key).toBe(`us.companyfacts_vs_gold:ZGOLD:net_income_parent:2023-12-31:12M:USD:${niRow.fact_id}`);
  expect(bad.item?.payload).toMatchObject({fact_ids:[niRow.fact_id],left_value:'100',right_value:'101',key:{issuer_id:id,market:'US',concept:'net_income_parent'}});
  expect(bad.item?.detail).toMatchObject({pair:'us.companyfacts_vs_gold',issuer_id:id,market:'US'});
  expect(missing).toMatchObject({outcome:'left_missing',passed:false,action:'record'});
 });
 it('an open reconcile_mismatch item binds the key to its fact and a now-passing result goes back to the item (quarantine_left, passed)',async()=>{
  const {tables,db,ctx,files}=setup();const id=await issuer(tables,'ZGOLD');
  const seeded=await seedPublished(db,{issuer:id,market:'US',sourceRef:'0009990100-24-000002',availableDate:'2024-02-01',facts:[{concept:'net_income_parent',value:'100',...FY23}]});
  const nk='ZGOLD:net_income_parent:2023-12-31:12M:USD';
  await tables.insert('dq_quarantine',{id:randomUUID(),dataset:'facts.us',table_name:'financial_facts',natural_key:`us.companyfacts_vs_gold:${nk}:${seeded.factIds[0]}`,reason_code:'reconcile_mismatch',detail:{pair:'us.companyfacts_vs_gold'},payload:{fact_ids:[seeded.factIds[0]]},batch_id:randomUUID(),status:'open',resolved_by:null,resolved_at:null,created_at:'2026-11-05T00:00:00Z'});
  expect([...(await openMismatches(tables,'us.companyfacts_vs_gold','US')).keys()]).toEqual([nk]);
  files.set(US_GOLD_PATH,enc(goldFile([entry({concept:'net_income_parent',value:'100'})])));
  const pair=usCompanyfactsVsGoldPair();const [m]=await pair.members(ctx);
  const [r]=await pair.evaluate(ctx,m);
  expect(r).toMatchObject({outcome:'compared',passed:true,action:'quarantine_left',left_fact_id:seeded.factIds[0]});
  expect(r.item?.natural_key).toBe(`us.companyfacts_vs_gold:${nk}:${seeded.factIds[0]}`);
 });
 it('refuses a gold file with duplicate keys or an unresolvable ticker',async()=>{
  const {tables,ctx,files}=setup();await issuer(tables,'ZGOLD');
  const pair=usCompanyfactsVsGoldPair();
  files.set(US_GOLD_PATH,enc(goldFile([entry(),entry()])));
  await expect(pair.members(ctx)).rejects.toMatchObject({code:'invalid_gold_file'});
  files.set(US_GOLD_PATH,enc(goldFile([entry({ticker:'NOPE'})])));
  await expect(pair.members(ctx)).rejects.toBeInstanceOf(ReconcileConfigError);
  await expect(pair.members(ctx)).rejects.toMatchObject({code:'issuer_unresolved'});
  files.delete(US_GOLD_PATH);
  await expect(pair.members(ctx)).rejects.toMatchObject({code:'invalid_gold_file'});
 });
});

describe('us.companyfacts_vs_gold identity (Codex review)',()=>{
 const sec=(tables:TableClient,issuer_id:string,ticker:string,valid_from:string,valid_to:string|null)=>tables.insert('issuer_securities',{issuer_id,ticker,valid_from,valid_to,is_primary:true,share_class:'common',isin:null,figi:null});
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-pNtWj59V' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-mDKCkvvH' (errno=Operation not permitted)
e5e8a30 fix(dq): US gold pair resolves owners at entry date, keeps recorded owner, defers lineage conflicts, aggregates members
9f4eb18 feat(dq): reconcile pair registry with lineage same-day and plan-2 US gold pairs
5a3b00c docs(audit): plan 3 log and Codex reports for Task 13c
zsh:1: no matches found: src/lib/entities/seed*
{
 "version": 1,
 "note": "Plan 2 §11.4 gold assertions (round-1 #19). A human transcribes value/page from the primary document. STATUS: ready=false means INCOMPLETE and the owner has not transcribed yet; sync-us.integration.test.ts reports it with a loud warning but does NOT fail while ready is false (commander decision 2026-11-04; the plan originally made it a designed red). Recorded (non-'<pending>') entries are still replayed against the published facts even while ready is false. Once the owner sets ready=true the suite enforces everything: required.US (every fixture-backed US issuer, AAPL and MSFT, has at least one recorded entry), no '<pending>' anywhere, every asserted US issuer present in FIXTURE_ISSUERS with a recorded fixture, and the §11.4 matrix (>= 6 issuers, each >= 2 period_ends that each carry >= 6 concepts). required.CN flips to true when the A-share fixtures are recorded. as_of is the asOf used to read the fact (defaults to today).",
 "ready": false,
 "required": {"US": true, "CN": false},
 "entries": [
  {"issuer": {"ticker": "AAPL", "market": "US"}, "concept": "revenue", "period_end": "2023-09-30", "unit": "USD", "value": "383285000000", "as_of": "2023-11-03",
   "source": {"document": "Apple Inc. Form 10-K for the fiscal year ended September 30, 2023 (accession 0000320193-23-000106)", "page_or_row": "<pending>", "url": "https://www.sec.gov/Archives/edgar/data/320193/000032019323000106/"},
   "recorded_by": "<pending>", "recorded_at": null},
  {"issuer": {"ticker": "MSFT", "market": "US"}, "concept": "revenue", "period_end": "2023-06-30", "unit": "USD", "value": "211915000000", "as_of": "2023-07-27",
   "source": {"document": "Microsoft Corp. Form 10-K for the fiscal year ended June 30, 2023", "page_or_row": "<pending>", "url": "<pending>"},
   "recorded_by": "<pending>", "recorded_at": null},
  {"issuer": {"ticker": "600519.SH", "market": "CN"}, "concept": "revenue", "period_end": "2023-12-31", "unit": "CNY", "value": "<pending>", "as_of": null,
   "source": {"document": "贵州茅台 2023 年年度报告（巨潮公告）", "page_or_row": "<pending>", "url": "<pending>"},
   "recorded_by": "<pending>", "recorded_at": null}
 ]
}

exec
/bin/zsh -lc "rg -n 'valid_from.*(today|2026|now)|valid_from:' src/lib/entities scripts | head -45; find . -maxdepth 2 -iname '*claude.md'; rg -n 'lineage_same_day|us.companyfacts_vs_gold' docs | head -25; nl -ba src/lib/dq/reconcile/pair-us-gold.ts | sed -n '54,65p'" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
src/lib/entities/issuers-write.integration.test.ts:60: const sec=(issuer_id:string,ticker:string,valid_from:string,valid_to:string|null=null)=>({issuer_id,ticker,share_class:'common' as const,valid_from,valid_to,valid_to_method:valid_to===null?null:'unrecorded' as const,source:'test',claimEvidence:EV});
src/lib/entities/issuers-write.integration.test.ts:163:  const rows=(await admin.query(`select issuer_id,valid_from::text,valid_to::text from public.issuer_securities where ticker=$1 order by valid_from`,[t])).rows;
src/lib/entities/issuers-write.integration.test.ts:164:  expect(rows).toEqual([{issuer_id:b,valid_from:'2000-01-01',valid_to:'2005-01-01'},{issuer_id:c,valid_from:'2005-01-01',valid_to:'2010-01-01'},{issuer_id:a,valid_from:'2010-01-01',valid_to:null}]);
src/lib/entities/provenance.test.ts:13:   valid_from:{source:'stocks_universe.list_date',provider:'tushare',as_of:'2026-11-05',row:{list_date:'2001-08-27',source:'tushare',source_updated_at:'2026-11-04T00:00:00Z'}},
src/lib/entities/provenance.test.ts:26:  expect(code({valid_from:{source:'x',api_key:'k'}})).toBe('secret_key@$.valid_from.api_key');
src/lib/entities/provenance.test.ts:27:  expect(code({valid_from:{source:'x',row:{user_id:'u'}}})).toBe('secret_key@$.valid_from.row.user_id');
src/lib/entities/provenance.test.ts:28:  for(const k of ['auth','session_id','email','apikey'])expect(code({valid_from:{[k]:'x'}})).toBe(`secret_key@$.valid_from.${k}`);
src/lib/entities/provenance.test.ts:34:  expect(code({valid_from:{source:'curated',entity:'5f0c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f'}})).toBe('uuid_value@$.valid_from.entity');
src/lib/entities/provenance.test.ts:39:  expect(code({valid_from:{a:{b:{c:{d:{e:{f:{g:1}}}}}}}})).toBe('too_deep@$.valid_from.a.b.c.d');
src/lib/entities/provenance.test.ts:76:   const r=validateClaimDetail('set_identifier','isin',{schema:'claim/1',evidence_kind:'hard_identifier',target:{issuer_id:'i',ticker:'T',valid_from:'2020-01-01'},params:{},
src/lib/entities/submissions-evidence.test.ts:15:const sec=(issuer_id:string,ticker:string,o:Record<string,unknown>={})=>({issuer_id,ticker,isin:null,figi:null,share_class:'unknown',is_primary:true,valid_from:'2020-01-01',valid_to:null,valid_from_method:'first_observed',valid_to_method:null,source:'sec_company_tickers_exchange',provenance:{},...o});
src/lib/entities/submissions-evidence.test.ts:26:  expect(c.rows('issuer_securities').find(r=>r.ticker==='ZZFX')).toMatchObject({issuer_id:ISSUER,valid_from:'2026-11-05',valid_from_method:'first_observed',source:'sec_submissions',share_class:'unknown',is_primary:false});
src/lib/entities/submissions-evidence.test.ts:27:  expect(c.rows('issuer_securities').find(r=>r.ticker==='ZZFX')?.provenance).toEqual({valid_from:{source:'sec_submissions',as_of:'2026-11-05',evidence_sha256:expect.stringMatching(/^[0-9a-f]{64}$/)}});
src/lib/entities/submissions-evidence.test.ts:55:  await own.insert('issuer_securities',sec(ISSUER,'ZZFX',{valid_from:'2026-11-05',valid_to:'2026-12-01',valid_to_method:'curated'}));
src/lib/entities/identifiers.integration.test.ts:109:const sec=(iss:string,t:string,from:string,to:string|null,extra:Record<string,unknown>={})=>insertRow('issuer_securities',{issuer_id:iss,ticker:t,valid_from:from,valid_to:to,source:'test',...extra});
src/lib/entities/identifiers.integration.test.ts:162:  const prov={valid_from:{source:'stocks_universe.list_date',as_of:'2026-11-05'}};
src/lib/entities/identifiers.integration.test.ts:205:   await db.query(`update public.issuer_securities set valid_from_method='listing_date',provenance=provenance||'{"valid_from":{"source":"stocks_universe.list_date","as_of":"2026-11-05"}}'::jsonb where ticker='ZZUPA'`);
src/lib/entities/identifiers.integration.test.ts:217:   expect((await db.query(`select provenance from public.issuer_securities where ticker='ZZUPA'`)).rows[0].provenance).toEqual({valid_from:{source:'stocks_universe.list_date',as_of:'2026-11-05'}});
src/lib/entities/identifiers.integration.test.ts:240:  expect(await q(`select valid_from::text,valid_from_method,valid_to_method from public.issuer_securities where ticker=$1 order by valid_from`,[t])).toEqual([
src/lib/entities/identifiers.integration.test.ts:241:   {valid_from:'2020-01-01',valid_from_method:'first_observed',valid_to_method:'sec_file_absent'},
src/lib/entities/identifiers.integration.test.ts:242:   {valid_from:'2021-01-01',valid_from_method:'ticker_change',valid_to_method:null},
src/lib/entities/identifiers.integration.test.ts:507:  const target={issuer_id:a,ticker:t,valid_from:'2020-01-01'};
src/lib/entities/identifiers.integration.test.ts:512:  const dup=await newClaim({issuer:b,id_type:'isin',value:isin,op:'set_identifier',target:{issuer_id:b,ticker:t2,valid_from:'2021-01-01'}});
src/lib/entities/identifiers.integration.test.ts:525:  const ghost=await newClaim({issuer:a,id_type:'figi',value:randomFigi(),op:'set_identifier',target:{issuer_id:a,ticker:t,valid_from:'1999-01-01'}});
src/lib/entities/identifiers.integration.test.ts:559:  const attach=(over:Record<string,unknown>)=>({op:'attach_security',target:{issuer_id:a},params:{share_class:'common',valid_from:'2026-02-20',valid_from_method:'listing_date',source:'sec_8a',...over}});
src/lib/entities/identifiers.integration.test.ts:567:  expect(await q(`select issuer_id,valid_from::text,valid_from_method from public.issuer_securities where ticker=$1`,[t])).toEqual([{issuer_id:a,valid_from:'2026-02-20',valid_from_method:'listing_date'}]);
src/lib/entities/identifiers.integration.test.ts:573:  expect(await resolve(await newClaim({issuer:a,id_type:'ticker',value:t2,op:'attach_security',target:{issuer_id:a},params:{share_class:'H',valid_from:'2026-01-01',valid_from_method:'curated',source:'x'}}),'accepted')).toMatchObject({applied:true});
src/lib/entities/identifiers.integration.test.ts:591:   ['wrong key',newClaim({issuer:b,id_type:'isin',value:randomIsin(),op:'set_identifier',target:{issuer_id:b,ticker:t,valid_from:'2020-01-01'},over:{provenance_written:{figi:EVIDENCE}}})],
src/lib/entities/identifiers.integration.test.ts:592:   ['attach without valid_from',newClaim({issuer:b,id_type:'ticker',value:await ticker(),op:'attach_security',target:{issuer_id:b},params:{share_class:'H',valid_from:'2021-01-01',valid_from_method:'curated',source:'x'},over:{provenance_written:{isin:EVIDENCE}}})],
src/lib/entities/identifiers.integration.test.ts:599:  const params={share_class:'H',valid_from:'2004-06-16',valid_from_method:'listing_date',source:'gleif_openfigi',isin:randomIsin()};
src/lib/entities/identifiers.integration.test.ts:602:  expect(await q(`select issuer_id,share_class,valid_from::text,valid_to,valid_from_method,valid_to_method,source,isin,is_primary,provenance from public.issuer_securities where ticker=$1`,[t])).toEqual([
src/lib/entities/identifiers.integration.test.ts:603:   {issuer_id:a,share_class:'H',valid_from:'2004-06-16',valid_to:null,valid_from_method:'listing_date',valid_to_method:null,source:'gleif_openfigi',isin:params.isin,is_primary:false,provenance:{valid_from:EVIDENCE,isin:EVIDENCE}},
src/lib/entities/identifiers.integration.test.ts:605:  const held=await newClaim({issuer:b,id_type:'ticker',value:t,op:'attach_security',target:{issuer_id:b},params:{...params,isin:null,valid_from:'2026-01-01'}});
src/lib/entities/identifiers.integration.test.ts:613:  const target={issuer_id:a,ticker:t,valid_from:'2020-01-01'};
src/lib/entities/identifiers.integration.test.ts:626:  const target={issuer_id:a,ticker:t,valid_from:'2010-01-01'};
src/lib/entities/identifiers.integration.test.ts:627:  const ok=await newClaim({issuer:a,id_type:'ticker',value:t,op:'backdate_window',target,params:{new_valid_from:'2006-03-01',valid_from_method:'listing_date'}});
src/lib/entities/identifiers.integration.test.ts:629:  expect(await q(`select valid_from::text,valid_from_method,provenance->'valid_from' p from public.issuer_securities where issuer_id=$1 and ticker=$2`,[a,t])).toEqual([{valid_from:'2006-03-01',valid_from_method:'listing_date',p:EVIDENCE}]);
src/lib/entities/identifiers.integration.test.ts:631:  const stale=await newClaim({issuer:a,id_type:'ticker',value:t,op:'backdate_window',target,params:{new_valid_from:'2007-01-01',valid_from_method:'curated'}});
src/lib/entities/identifiers.integration.test.ts:634:  const over=await newClaim({issuer:a,id_type:'ticker',value:t,op:'backdate_window',target:{issuer_id:a,ticker:t,valid_from:'2006-03-01'},params:{new_valid_from:'2004-01-01',valid_from_method:'curated'}});
src/lib/entities/identifiers.integration.test.ts:636:  expect(await q(`select valid_from::text from public.issuer_securities where issuer_id=$1 and ticker=$2`,[a,t])).toEqual([{valid_from:'2006-03-01'}]);
src/lib/entities/identifiers.integration.test.ts:649:  const amend={op:'close_security',target:{issuer_id:a,ticker:t,valid_from:'2020-01-01'},params:{valid_to:'2026-03-02',valid_to_method:'delisting'}};
src/lib/entities/identifiers.integration.test.ts:676:  const pairing=await newClaim({issuer:a,id_type:'lei',value:randomLei(),op:'attach_security',target:{issuer_id:a},params:{share_class:'A',valid_from:'2020-01-01',valid_from_method:'listing_date',source:'x'}});
src/lib/entities/identifiers.integration.test.ts:1020:   const id=await newClaim({issuer:a,id_type:'figi',value:figi,op:'set_identifier',target:{issuer_id:a,ticker:t,valid_from:'2020-01-01'}});   // provenance = {figi: EVIDENCE}
src/lib/entities/identifiers.integration.test.ts:1052: const WF={valid_from:{source:'stocks_universe.list_date',provider:'tushare_stock_basic',as_of:'2026-11-05',row:{list_date:'2001-08-27'}}};
src/lib/entities/identifiers.integration.test.ts:1065:  expect(await winState(t)).toEqual({valid_from:'2001-08-27',valid_to:'2026-06-30',valid_from_method:'listing_date',valid_to_method:'delisting',provenance:{exchange:'SSE',...WF,...WT}});
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:254:| `set_merge(p_source uuid, p_target uuid, p_resolved_by uuid) returns jsonb` | **拓扑写入（含改指）**。事务内 `set_config('entities.allow_topology_write','on',true)`；受影响集合 = `{p_source, p_target} ∪ 当前 merged_into = p_source 的全部引用方 ∪ 当前 merged_into = p_target 的全部引用方`；为集合中每个发行人在两市场确保 scope 行存在（缺失则插入 `priority=0, reasons='[]', fetch_key=''`），按 `(issuer_id, market)` 排序 `for update`；锁下重新读取引用方集合（`for update` 读 `issuers` 行），期望行数 n；`update issuers set merged_into = p_target where merged_into = p_source` 要求 `row_count = n`；`update issuers set status='merged', merged_into=p_target where issuer_id=p_source and status='active'` 要求 `row_count = 1`（否则 `source_not_active`）；计划一触发器此时校验目标活跃且源无开放证券（失败即回滚，错误原样抛出）；集合中每个 scope `state_rev + 1`；为 pair `facts.lineage_same_day` 把 `p_target` 加入下个周期成员（写 `dq_reconcile_cycles.members` 的待加入列表 `detail.pending_members`，由运行器开新周期时合并）；`research_audit_log(action='entities.merge', detail={source, target, repointed:n})`；返回 `{repointed:n}`。A→B 后 B→C：`set_merge(B, C)` 先把 A 改指 C 再退役 B，一跳不变式保持。无谱系（无事实）时同样经此函数 |
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:369:- 冲突处置：对账对 `facts.lineage_same_day`（游标：合并时登记 + 每周）对每个 `conflicts` 条目写对账行（`kind='numeric'`，`outcome='compared'`，`passed=false`）并建隔离项 `lineage_conflict`（`natural_key=<T>:<K>:<available_date>`，`payload={fact_ids, values:[{issuer_id, filing, value}]}`）。管理员 POST 体 `keep_fact_id` → `resolve_lineage_conflict`（原子、排序锁、结束后恰一个 `ok` 值、裁决持久化并被 `promote_quarantined` 附加条款遵守）。不自动择一。
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:401:| `us.companyfacts_vs_gold` | numeric | 规格二 `plan2.json` 美股部分（只取非 `<pending>` 条目；`ready:false` 时每个 `<pending>` 条目一行 `incomplete_gold`，绝不比较占位值，也不宣称黄金完成，T15） | 同上 | 0 | 隔离左侧 |
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:405:| `facts.lineage_same_day` | numeric | 谱系 `conflicts` | `<T>:<K>:<available_date>` | 0 | `lineage_item` |
docs/audits/2026-11-05-data-foundation-3-plan/02-round1-disposition.md:41:| R1 | P2 | Applied. `fact_set_merge_body` now takes `pg_advisory_xact_lock(hashtext('dq_reconcile_cycle:facts.lineage_same_day'))` first, right after argument validation and before `fact_topology_lock` and the issuers `FOR UPDATE`. The later acquisition was removed. A new rule applies everywhere: a function that takes a `dq_reconcile_cycle:*` lock takes it before any row lock. The rule is registered in the repository conventions. `open_reconcile_cycle` already takes the advisory lock first and then the cursor FK's KEY SHARE; its lock-order comment was wrong and has been corrected. `set_dissolved` takes no cycle lock, so its waits only go one way; this is now documented in SQL and in C5. New two-connection regression with a nonempty cycle that contains the merge target, run in both orders. (a) The creator holds the cycle lock, `set_merge` arrives and waits on the advisory lock (asserted with `pg_locks.locktype='advisory'`), and the creator then inserts the cursor for the target. (b) The merge holds everything and the creator waits. Both orders complete without 40P01. | 仓库约定 lock registry; C5 `set_merge`/`set_dissolved` rows; Task 8a §6 SQL and comments; Task 8c §13 comment, new case, Step 5 count 8c 13 |
docs/audits/2026-11-04-data-foundation-3/03-disposition.md:150:| T15 evidence baseline | P2 | ACCEPT | E5; §5.1 `us.companyfacts_vs_gold` `incomplete_gold`; §5.4 CI gate creation + deploy gate; §6.1 CN `disclosure_date` raw retention, `unknown_upstream` until verified |
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:103:vercel.json                          + reconcile?pair=us.companyfacts_vs_ixbrl、reconcile?pair=facts.lineage_same_day、filing-calendar?market=US/CN（Task 14c、18b；CN 对账不加；CN 日历不受 FACTS_CN_ENABLED 门控）
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:157:export const RECONCILE_PAIR_IDS=['us.companyfacts_vs_ixbrl','cn.tushare_vs_cninfo_pdf_gold','us.companyfacts_vs_gold','sec.filing_date_vs_submissions','sec.filer_category','entities.isin_hkex_vs_gleif','facts.lineage_same_day'] as const;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:160:export const CYCLE_PAIR_IDS=['us.companyfacts_vs_ixbrl','cn.tushare_vs_cninfo_pdf_gold','us.companyfacts_vs_gold','facts.lineage_same_day'] as const satisfies readonly ReconcilePairId[];
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:264:| `set_merge`（2） | `(p_source uuid, p_target uuid, p_resolved_by uuid) returns jsonb` → `{repointed}`；缺失的 scope 行插入占位 `priority=0, reasons='[]', fetch_key='topology'`（`on conflict do nothing`）；**最先**（在 scope/发行人行锁之前，计划审计 R1）取 `pg_advisory_xact_lock(hashtext('dq_reconcile_cycle:facts.lineage_same_day'))`（与 `open_reconcile_cycle` 同一把锁，计划审计 Q2），之后把 `{issuer_id:T, market, source:S}`×2（按整条去重）追加进 `facts.lineage_same_day` 最新一行周期（running 优先）的 `detail.pending_members`，无周期行则不写 | `source_not_active` `invalid_merge` + 计划一触发器原样错误 |
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:367:| 6 | `pending_members` 的存放位置（C9、D3） | 存在 `dq_reconcile_cycles.detail.pending_members`（元素 `{issuer_id, market}`）：`set_merge` 写进该 pair 最新一行周期（running 优先，否则最近一行）；无任何周期行则不写——运行器的 `facts.lineage_same_day.members()` 每周期都从 `issuers.merged_into` 重新枚举全部谱系，这是兜底。运行器建新周期时并入所有未带 `detail.pending_consumed_by` 的行的 `pending_members`，并给这些行写 `pending_consumed_by=<新 cycle_id>`。不新建表。**计划审计 Q2 修订（#64）：元素带 `source`；合并与消费都经 `open_reconcile_cycle` 原子完成，只消费快照条目** | Task 8a（原稿）；Task 14b（原稿）；骨架 C5 `set_merge` 行 |
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:403:| 42 | `us.companyfacts_vs_gold` 自然键（D10） | `<ticker>:<concept>:<period_end>:<duration>:<unit>` | Task 14a（原稿） |
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:407:| 46 | 跨 Part 测试隔离（D14） | Part C 周期函数测试用 `test.<hex>` pair 或回滚事务，不给 `us.companyfacts_vs_ixbrl`/`facts.lineage_same_day` 留 running 周期 | 无改动（核对通过） |
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:425:| 64 | 建周期可能丢失并发登记的合并成员、或让新目标零键冻结（计划审计 Q2） | `pending_members` 元素改为 `{issuer_id, market, source}`（`PendingMember`，按整条去重）；`set_merge` 登记前取 `pg_advisory_xact_lock(hashtext('dq_reconcile_cycle:facts.lineage_same_day'))`；迁移二第 13 节新增 `open_reconcile_cycle(p_pair, p_cycle_id, p_started_at, p_members, p_pending) returns jsonb`（同一把锁；已有 running → 原样返回；否则一个事务插周期行 + 全部游标、只删 `p_pending` 所列条目；`invalid_members`）；`FactsDb.openReconcileCycle(OpenCycleInput):Promise<OpenCycleResult>` 三实现 + `db.ts::openCycleFromJson`；`RegisteredPair.memberFor?(ctx, issuerId, market)`（谱系对实现）。运行器设计：先读 pending 快照，**之后**才解析预期键（`members()`，再对快照中未列出的目标调 `memberFor`），把成员与快照一起交给函数——快照里的合并对解析器已可见，快照之后的登记不被消费、进下一周期；运行器不再整列改写周期行 `detail`，读 pending 时不再看 `pending_consumed_by`（仅审计） | C3/C4/C5；Task 8a `set_merge` 与用例；Task 8c 第 13 节与 4 个用例；Task 9a 类型、三实现、`openCycleFromJson`、存根与内存用例；Task 9b 第 8 个契约用例；Task 13a grep 计数 12；Task 14a `memberFor`；Task 14b 第 1 点、`openCycle`、5 个用例 |
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:427:| 66 | 建周期与合并可能死锁（计划审计 R1） | `fact_set_merge_body` 在参数校验后、`fact_topology_lock` 与发行人 `for update` 之前**最先**取 `pg_advisory_xact_lock(hashtext('dq_reconcile_cycle:facts.lineage_same_day'))`（原登记前的取锁删除）；规则：取 `dq_reconcile_cycle:*` 锁的函数必须先取它、再取任何行锁（仓库约定 advisory lock 登记）。`open_reconcile_cycle` 本就先取锁再插游标（游标外键对发行人行取 KEY SHARE），注释改正；`set_dissolved` 不取周期锁（只有单向等待），注释写明 | 仓库约定锁登记；C5 `set_merge`/`set_dissolved` 行；Task 8a `fact_set_merge_body`、`fact_set_dissolved_body` 注释；Task 8c 第 13 节注释、新增双连接用例（周期成员含合并目标，两种先后都完成，等待在 advisory 锁上）、Step 5 计数 8c 13 |
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:2590:  for(const p of ['us.companyfacts_vs_ixbrl','cn.tushare_vs_cninfo_pdf_gold','us.companyfacts_vs_gold','facts.lineage_same_day'] as const)
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:2643:  expect(out.datasets).toEqual(expect.arrayContaining(['entities.sec','dq.calendar.cn','reconcile.facts.lineage_same_day','facts.us']));
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:2758:export const RECONCILE_PAIR_IDS=['us.companyfacts_vs_ixbrl','cn.tushare_vs_cninfo_pdf_gold','us.companyfacts_vs_gold','sec.filing_date_vs_submissions','sec.filer_category','entities.isin_hkex_vs_gleif','facts.lineage_same_day'] as const;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:2787: 'us.companyfacts_vs_gold':{producer:'reconcile',cadence:'weekly'},
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:2788: 'facts.lineage_same_day':{producer:'reconcile',cadence:'weekly'},
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:8813:9. **`pending_members` 的形状与位置**：`set_merge` 把 `{issuer_id:T, market:'CN'|'US'}`（两个市场，去重）追加到 pair `facts.lineage_same_day` **最新一行周期**（`order by (status='running') desc, started_at desc limit 1`）的 `detail.pending_members`；该 pair 还没有任何周期行时不写。Part D 运行器建新周期时读最新周期的 `pending_members`、合并去重；运行器本身也须按拓扑（有引用方的目标）发现成员，不能只靠 `pending_members`。 **→ 已裁决：接口对齐记录 #6；元素形状与登记锁按 #64 修订（计划审计 Q2）。**
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:9138:  it('set_merge registers the target as a pending member of the latest facts.lineage_same_day cycle',async()=>{
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:9141:    await c.query(`insert into public.dq_reconcile_cycles(pair,cycle_id,started_at,finished_at,members,status,expected_total) values('facts.lineage_same_day',$1,now()+interval '100 years',now()+interval '100 years','[]','complete',0)`,[`facts.lineage_same_day-test-${randomUUID().slice(0,8)}`]);
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:9143:    const [latest]=(await c.query(`select detail from public.dq_reconcile_cycles where pair='facts.lineage_same_day' order by (status='running') desc, started_at desc limit 1`)).rows;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:9492:-- state_rev + 1; the target joins the next facts.lineage_same_day cycle — entry {issuer_id:T, market,
    54	 return {ready:j.ready===true,entries:out};
    55	}
    56	
    57	/** Is the entry's key reported in conflicts by the lineage read of the member's current target? */
    58	async function inLineageConflict(ctx:PairContext,issuerId:string,e:UsGoldEntry,left:FactRow):Promise<boolean>{
    59	 const target=await ctx.db.targetOf(issuerId);
    60	 const env=await ctx.db.readFactsLineage(await ctx.db.lineageOf(target),'US',{concepts:[e.concept],asOf:todayOf(ctx)});
    61	 if(env.truncated)throw new ReconcileConfigError('lineage_read_truncated',`${target}/US`);
    62	 return env.conflicts.some(c=>String(c.key.concept)===e.concept&&String(c.key.period_end)===e.period_end&&String(c.key.unit)===e.unit&&(c.key.period_start??null)===(left.period_start??null));
    63	}
    64	
    65	export function usCompanyfactsVsGoldPair():RegisteredPair{

codex
The ownership and member aggregation changes are reasonable, but conflict detection can suppress legitimate gold-mismatch quarantines for facts that do not participate in a lineage conflict.

Review comment:

- [P2] Limit conflict deferral to the compared fact — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/reconcile/pair-us-gold.ts:62-62
  When a lineage contains a same-day disagreement for another disclosure of the same period, this predicate also suppresses quarantine of the selected, non-conflicting fact. `readFactsLineage` returns conflicts across disclosure dates, but this check ignores both `available_date` and `fact_ids`. For example, a February fact compared against March gold is incorrectly deferred because two April disclosures conflict; the lineage reconciliation handles those April facts, not the February mismatch. Check whether `left.fact_id` participates in the conflict before replacing its action with `record`.
The ownership and member aggregation changes are reasonable, but conflict detection can suppress legitimate gold-mismatch quarantines for facts that do not participate in a lineage conflict.

Review comment:

- [P2] Limit conflict deferral to the compared fact — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/reconcile/pair-us-gold.ts:62-62
  When a lineage contains a same-day disagreement for another disclosure of the same period, this predicate also suppresses quarantine of the selected, non-conflicting fact. `readFactsLineage` returns conflicts across disclosure dates, but this check ignores both `available_date` and `fact_ids`. For example, a February fact compared against March gold is incorrectly deferred because two April disclosures conflict; the lineage reconciliation handles those April facts, not the February mismatch. Check whether `left.fact_id` participates in the conflict before replacing its action with `record`.

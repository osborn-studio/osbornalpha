OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b052-3dcc-7350-b15a-540bc5e8c92d
--------
user
commit 51647ff
exec
/bin/zsh -lc 'git status --short; git show --stat --oneline 51647ff; cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-2M0OcRQ2' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-vDeSTzlw' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/8a-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/8a-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/8a-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-B85OCGyc' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-RWKGcFt0' (errno=Operation not permitted)
51647ff fix(facts): set_merge registration fallback documented and tested; explicit sync treats topology placeholder scope rows as missing
 src/lib/dq/dq-extensions.integration.test.ts            | 11 +++++++++++
 src/lib/facts/sync.test.ts                              | 13 +++++++++++++
 src/lib/facts/sync.ts                                   |  3 ++-
 supabase/migrations/20261107091000_facts_extensions.sql |  3 +++
 4 files changed, 29 insertions(+), 1 deletion(-)
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
/bin/zsh -lc 'find .. -name AGENTS.md -o -name AGENTS.override.md; git show 51647ff; cat AGENTS.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 204ms:
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-7a6o6lFT' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-SmJe7b1l' (errno=Operation not permitted)
commit 51647ffc1ed91beb1103ab78a1d6f8da51cc6be5
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 02:05:24 2026 -0800

    fix(facts): set_merge registration fallback documented and tested; explicit sync treats topology placeholder scope rows as missing
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/dq/dq-extensions.integration.test.ts b/src/lib/dq/dq-extensions.integration.test.ts
index 5e99752..3ca6afe 100644
--- a/src/lib/dq/dq-extensions.integration.test.ts
+++ b/src/lib/dq/dq-extensions.integration.test.ts
@@ -311,6 +311,17 @@ describe.skipIf(!enabled)('F3-4 facts extensions migration on real PostgreSQL',(
    });
   });
 
+  it('set_merge with an empty dq_reconcile_cycles table commits and leaves no cycle row (registration falls back to the runner re-enumerating merged_into, decision #6)',async()=>{
+   const s=await issuer(),t=await issuer(),by=await user();
+   await inRolledBackTx(admin,async c=>{
+    await c.query(`delete from public.dq_reconcile_cursor where pair='facts.lineage_same_day'`);
+    await c.query(`delete from public.dq_reconcile_cycles where pair='facts.lineage_same_day'`);
+    expect((await c.query(`select public.set_merge($1,$2,$3) v`,[s,t,by])).rows[0].v).toEqual({repointed:0});
+    expect((await c.query(`select count(*)::int n from public.dq_reconcile_cycles where pair='facts.lineage_same_day'`)).rows[0].n).toBe(0);
+    expect((await c.query(`select status,merged_into from public.issuers where issuer_id=$1`,[s])).rows).toEqual([{status:'merged',merged_into:t}]);
+   });
+  });
+
   it('set_merge serialises with materialisation: a lineage write that waits behind it is refused as stale_computation',async()=>{
    const {iss:t}=await published();const {iss:s}=await sibling('100');const by=await user();
    await inTx(admin,async({c,pid,commit})=>{
diff --git a/src/lib/facts/sync.test.ts b/src/lib/facts/sync.test.ts
index 30bf5de..aeea985 100644
--- a/src/lib/facts/sync.test.ts
+++ b/src/lib/facts/sync.test.ts
@@ -307,6 +307,19 @@ describe('runFactsSync — round-1 audit cases',()=>{
   const both=await run(deps,{dryRun:true,issuerIds:[ISSUER,ISSUER2],limit:1});            // limit never drops a requested issuer (round-2 #13)
   expect(both.issuers.map(i=>i.issuerId)).toEqual([ISSUER,ISSUER2]);
  });
+ it('a set_merge placeholder scope row (fetch_key topology) is treated as missing: explicit run derives and persists the real key; dry-run plans on it; underivable → scope_unresolved',async()=>{
+  const fetchUs=vi.fn(async(_k:string)=>snap('{"facts":{}}'));
+  const {db,deps}=harness(FY23,{fetchUs},[{issuer_id:ISSUER,fetch_key:'0000320193'}]);
+  await db.reconcileScope('US',[{issuer_id:ISSUER,reasons:[],priority:0,fetch_key:'topology'},{issuer_id:ISSUER2,reasons:[],priority:0,fetch_key:'topology'}]);
+  await run(deps,{dryRun:true,issuerIds:[ISSUER]});
+  expect(fetchUs.mock.calls[0][0]).toBe('0000320193');
+  expect(db.scope().find(x=>x.issuer_id===ISSUER)).toMatchObject({fetch_key:'topology'});   // dry run wrote nothing
+  fetchUs.mockClear();
+  const r=await run(deps,{issuerIds:[ISSUER,ISSUER2]});
+  expect(r.issuers.map(i=>[i.issuerId,i.outcome,i.code??null])).toEqual([[ISSUER,'published',null],[ISSUER2,'failed','scope_unresolved']]);
+  expect(fetchUs.mock.calls.map(c=>c[0])).toEqual(['0000320193']);
+  expect(db.scope().find(x=>x.issuer_id===ISSUER)).toMatchObject({fetch_key:'0000320193',last_status:'success'});
+ });
  it('a thrown cninfo request still counts as a persisted link attempt, capped at MAX_LINK_ATTEMPTS; a request cut by the budget counts too; a budget too low BEFORE the request counts nothing (#21)',async()=>{
   const linkCn=vi.fn(async()=>{throw new Error('cninfo 500');});
   const {db,deps}=harness(parsed([cnFiling()],[cnRevenue()]),{linkCn},CN_SCOPE);
diff --git a/src/lib/facts/sync.ts b/src/lib/facts/sync.ts
index f59de38..9941be4 100644
--- a/src/lib/facts/sync.ts
+++ b/src/lib/facts/sync.ts
@@ -354,7 +354,8 @@ async function selectScopes(deps:SyncDeps,opts:SyncOptions):Promise<Selected[]>{
  // Every explicitly requested issuer gets an outcome: `limit` bounds the scheduled path only and is
  // never used to silently drop requested ids (round-2 #13).
  const ids=[...new Set(opts.issuerIds)];
- const have=new Map((await deps.db.scopeRows(opts.market,ids)).map(s=>[s.issuer_id,s]));
+ // A set_merge placeholder (fetch_key 'topology', priority 0) is not a usable schedule row: treat it as missing and derive the real key.
+ const have=new Map((await deps.db.scopeRows(opts.market,ids)).filter(s=>s.fetch_key!=='topology').map(s=>[s.issuer_id,s]));
  const today=isoDate(deps.now());const seed:ScopeInputRow[]=[];
  for(const id of ids){
   if(have.has(id))continue;
diff --git a/supabase/migrations/20261107091000_facts_extensions.sql b/supabase/migrations/20261107091000_facts_extensions.sql
index 8f140eb..a1858e6 100644
--- a/supabase/migrations/20261107091000_facts_extensions.sql
+++ b/supabase/migrations/20261107091000_facts_extensions.sql
@@ -326,6 +326,9 @@ begin
   if n <> 1 then raise exception 'source_not_active' using errcode = 'P0001'; end if;
   update public.fact_sync_scope set state_rev = state_rev + 1, updated_at = now() where issuer_id = any(v_set);
   -- the cycle advisory lock is already held (taken first, above)
+  -- Registration is best effort: with no facts.lineage_same_day cycle row the UPDATE below affects 0 rows and
+  -- nothing else happens (no cycle row is created here). Alignment decision #6: the runner's first cycle
+  -- re-enumerates every issuer with merged_into not null, so no merge target is lost.
   update public.dq_reconcile_cycles c
   set detail = jsonb_set(c.detail, '{pending_members}',
         coalesce(case when jsonb_typeof(c.detail -> 'pending_members') = 'array' then c.detail -> 'pending_members' end, '[]'::jsonb)
cat: AGENTS.md: No such file or directory

exec
/bin/zsh -lc "sed -n '315,420p' src/lib/facts/sync.ts; rg -n 'deriveScope|reconcileScope|topology' src/lib/facts supabase/migrations/20261107091000_facts_extensions.sql; ls -a | head -35; for d in /Volumes/AIMATE_WORK/Developer/CodeX /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees; do for f in AGENTS.md AGENTS.override.md; do test "'! -f "$d/$f" || cat "$d/$f"; done; done' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
 return {parsed,filingIds,filingRows};
}

async function linkFilings(deps:SyncDeps,issuer:string,market:Market,budget:Budget,out:IssuerOutcome,renew:()=>Promise<void>):Promise<void>{
 const pending=(await deps.db.filingsOfIssuer(issuer,market,{unlinkedOnly:true})).filter(f=>f.link_attempts<MAX_LINK_ATTEMPTS&&f.origin!=='bse'&&LINKABLE_FORMS.has(f.form_type));
 let failed=0,unlinkable=0;
 for(const f of pending){
  // Cancellation BEFORE a request starts is not an attempt: link_attempts stays untouched (round-1 #21).
  if(budget.signal.aborted||budget.remainingMs()<MIN_ISSUER_MS/3)break;
  await renew();                                         // lease_lost propagates: the issuer stays published
  let patch:{document_ref?:string;document_url?:string;link_attempts:number}={link_attempts:f.link_attempts+1};
  let cut=false;
  try{
   const r=await deps.linkCn!(f,budget);
   if(r==='unlinkable'){unlinkable++;continue;}   // no request was possible: nothing persisted, no attempt consumed
   if(typeof r!=='string')patch={...r,link_attempts:f.link_attempts+1};
  }catch(e){
   if(dbCode(e)==='lease_lost')throw e;
   failed++;                                             // transport/HTTP failure OR a request cut by the budget: a started request is an attempt (§6.3; round-2 #21)
   cut=budget.signal.aborted;
  }
  await deps.db.updateFilingLink(f.filing_id,patch);     // none / ambiguous / success / thrown / cut — every STARTED request is persisted
  if(cut)break;                                          // no budget left for the next request
 }
 if(failed>0)out.errors.push({code:'skipped_summary',key:`${issuer}:cninfo_link`,message:JSON.stringify({link_failed:failed})});
 if(unlinkable>0)out.errors.push({code:'skipped_summary',key:`${issuer}:cninfo_unlinkable`,message:JSON.stringify({unlinkable})});
}

type Selected={scope:ScopeRow}|{unresolved:string};
const unresolvedOutcome=(issuerId:string):IssuerOutcome=>({issuerId,fetchKey:'',runId:null,outcome:'failed',code:'scope_unresolved',counts:{...emptyCounts(),failed:1},errors:[{code:'scope_unresolved',key:issuerId}],warnings:new Map(),snapshotSha256:[]});
/**
 * Scheduled path: the due rows. Explicit issuers (round-1 #13): their scope rows by id, in the
 * order given; a missing row is computed from the issuer tables (scopeRowFor) — seeded through
 * reconcileScope when applying (reasons ['explicit'], priority SCOPE_PRIORITY; the next cron
 * reconcile retires it to priority 0 unless a source lists the issuer), constructed read-only for
 * a dry run — and an issuer whose fetch_key cannot be derived is reported, never silently dropped.
 */
async function selectScopes(deps:SyncDeps,opts:SyncOptions):Promise<Selected[]>{
 if(opts.issuerIds===undefined)return (await deps.db.scopeDue(opts.market,deps.now().toISOString(),opts.limit)).map(scope=>({scope}));
 // Every explicitly requested issuer gets an outcome: `limit` bounds the scheduled path only and is
 // never used to silently drop requested ids (round-2 #13).
 const ids=[...new Set(opts.issuerIds)];
 // A set_merge placeholder (fetch_key 'topology', priority 0) is not a usable schedule row: treat it as missing and derive the real key.
 const have=new Map((await deps.db.scopeRows(opts.market,ids)).filter(s=>s.fetch_key!=='topology').map(s=>[s.issuer_id,s]));
 const today=isoDate(deps.now());const seed:ScopeInputRow[]=[];
 for(const id of ids){
  if(have.has(id))continue;
  const row=await scopeRowFor(deps.tables,opts.market,id,{today});
  if(row===null)continue;
  if(opts.dryRun)have.set(id,{...row,market:opts.market,next_due_at:deps.now().toISOString(),lease_until:null,lease_batch_id:null,state_rev:0,last_attempt_at:null,last_success_at:null,last_batch_id:null,last_status:null});
  else seed.push(row);
 }
 if(seed.length>0){
  await deps.db.reconcileScope(opts.market,seed);
  for(const s of await deps.db.scopeRows(opts.market,seed.map(r=>r.issuer_id)))have.set(s.issuer_id,s);
 }
 return ids.map(id=>{const scope=have.get(id);return scope?{scope}:{unresolved:id};});
}

/** Dry run: fetch, parse and plan against the current rows, write nothing (no batch, lease, snapshot or run). Planned issuers report outcome 'planned'. */
async function dryRun(deps:SyncDeps,opts:SyncOptions,sinceYear:number,gen:number,budget:Budget):Promise<SyncReceipt> {
 const counts=emptyCounts();const errors:BatchError[]=[];const issuers:IssuerOutcome[]=[];
 const selected=await selectScopes(deps,opts);
 let failed=0;
 for(const sel of selected){
  if('unresolved' in sel){const u=unresolvedOutcome(sel.unresolved);failed++;issuers.push(u);counts.failed+=1;errors.push(...u.errors);continue;}
  const scope=sel.scope;
  const out:IssuerOutcome={issuerId:scope.issuer_id,fetchKey:scope.fetch_key,runId:null,outcome:'skipped',counts:emptyCounts(),errors:[],warnings:new Map(),snapshotSha256:[]};
  try{
   const {parsed,sha256s}=await fetchAndParse(deps,opts.market,scope.issuer_id,scope.fetch_key,sinceYear,budget,false);
   out.snapshotSha256=sha256s;
   const known=new Map((await deps.db.filingsOfIssuer(scope.issuer_id,opts.market,{})).map(f=>[f.source_ref,f.filing_id]));
   const filings=new Map(parsed.filings.map(f=>[f.sourceRef,known.get(f.sourceRef)??randomUUID()]));
   const read=await deps.db.readFacts(scope.issuer_id,opts.market,{concepts:ALL_CONCEPTS,asOf:isoDate(deps.now()),history:true,includeNonOk:true});
   if(read.truncated)throw new FactsDbError('read_truncated');
   const plan=planFactWrites({existing:read.rows,openConflicts:await deps.db.openConflicts(scope.issuer_id,opts.market),candidates:parsed.candidates,filingCandidates:parsed.filings,filings,issuerId:scope.issuer_id,market:opts.market,mappingGen:gen,mappingVersion:MAPPING_VERSION});
   Object.assign(out.counts,{fetched:parsed.candidates.length,...plan.counts});out.outcome='planned';
  }catch(e){failed++;out.outcome='failed';out.code=e instanceof SyncError?e.code:dbCode(e)??'unknown';out.errors.push({code:out.code,key:scope.issuer_id,message:e instanceof SyncError&&e.code==='parse_error'?safeParseMessage(e.message):errMsg(e)});}
  issuers.push(out);for(const k of COUNTERS)counts[k]+=out.counts[k];errors.push(...out.errors);
 }
 const idle=selected.length===0;
 return {batchId:null,status:'dry_run',counts,errors,issuers,idle,detail:{attempted:selected.length,published:0,failed,skipped:0,idle}};
}

export async function runFactsSync(deps:SyncDeps,opts:SyncOptions):Promise<SyncReceipt>{
 const {market}=opts;const dataset=datasetOf(market);
 const sinceYear=opts.sinceYear??deps.now().getUTCFullYear()-10;const gen=opts.mappingGen??MAPPING_GEN;
 const budget=makeBudget(deps.deadline,deps.now);
 if(opts.dryRun)return dryRun(deps,opts,sinceYear,gen,budget);
 if(deps.codeVersion===null||deps.codeVersion==='')throw new SyncError('code_version_unavailable');
 const {batchId}=await startBatch(deps.tables,{producer:'facts-sync',dataset,toolVersions:{mapping_gen:String(gen),rules:RULES_VERSION,formula:FORMULA_VERSION,source:sourceOf(market)},codeVersion:deps.codeVersion,triggeredBy:opts.triggeredBy});
 const counts=emptyCounts();const errors:BatchError[]=[];const issuers:IssuerOutcome[]=[];const warnings=new Map<string,string[]>();
 let attempted=0,published=0,failed=0,skipped=0,quota=false,idle=false;
 try{
  // Scheduled path (cron): reconcile the scope first (spec §6.1). Explicit issuers (scripts, replay
  // tests) skip it: their scope rows were put there by the caller and must not be retired by sources
  // the caller does not control.
  if(opts.issuerIds===undefined)await reconcileScope({db:deps.db,tables:deps.tables},market);
  const selected=await selectScopes(deps,opts);
  idle=selected.length===0;
  for(let i=0;i<selected.length;i++){
   const sel=selected[i];
   if('unresolved' in sel){const u=unresolvedOutcome(sel.unresolved);attempted++;failed++;issuers.push(u);counts.failed+=1;errors.push(...u.errors);continue;}
   const scope=sel.scope;
   if(quota){skipped++;errors.push(summary(scope.issuer_id,'quota_exhausted'));continue;}
   if(budget.remainingMs()<MIN_ISSUER_MS){errors.push({code:'deadline_hit',message:JSON.stringify({not_started:selected.length-i})});break;}
supabase/migrations/20261107091000_facts_extensions.sql:15:--  6. set_merge / set_dissolved: the only topology writers. They switch the transaction-local
supabase/migrations/20261107091000_facts_extensions.sql:16:--     entities.allow_topology_write that the migration-one trigger issuers_topology_guard requires,
supabase/migrations/20261107091000_facts_extensions.sql:274:-- ---------------------------------------------------------------- 6. topology writers (spec §3.1 guard, §3.2 set_merge / set_dissolved, R3, T12)
supabase/migrations/20261107091000_facts_extensions.sql:275:-- Placeholder scope rows (priority 0, reasons [], fetch_key 'topology' — the plan-2 check needs
supabase/migrations/20261107091000_facts_extensions.sql:278:create or replace function public.fact_topology_lock(p_ids uuid[])
supabase/migrations/20261107091000_facts_extensions.sql:282:  select i, mk.m, '[]'::jsonb, 0, 'topology'
supabase/migrations/20261107091000_facts_extensions.sql:287:revoke execute on function public.fact_topology_lock(uuid[]) from public, anon, authenticated, service_role;
supabase/migrations/20261107091000_facts_extensions.sql:289:-- Body of set_merge (runs with entities.allow_topology_write on). Affected set = {source, target}
supabase/migrations/20261107091000_facts_extensions.sql:298:-- (fact_topology_lock) and the issuers rows. open_reconcile_cycle holds the same advisory lock while
supabase/migrations/20261107091000_facts_extensions.sql:315:  perform public.fact_topology_lock(v_set);
supabase/migrations/20261107091000_facts_extensions.sql:349:declare v_prev text := current_setting('entities.allow_topology_write', true); v_out jsonb;
supabase/migrations/20261107091000_facts_extensions.sql:351:  perform set_config('entities.allow_topology_write', 'on', true);
supabase/migrations/20261107091000_facts_extensions.sql:355:    perform set_config('entities.allow_topology_write', coalesce(v_prev, ''), true);
supabase/migrations/20261107091000_facts_extensions.sql:358:  perform set_config('entities.allow_topology_write', coalesce(v_prev, ''), true);
supabase/migrations/20261107091000_facts_extensions.sql:378:  perform public.fact_topology_lock(v_set);
supabase/migrations/20261107091000_facts_extensions.sql:394:declare v_prev text := current_setting('entities.allow_topology_write', true);
supabase/migrations/20261107091000_facts_extensions.sql:396:  perform set_config('entities.allow_topology_write', 'on', true);
supabase/migrations/20261107091000_facts_extensions.sql:400:    perform set_config('entities.allow_topology_write', coalesce(v_prev, ''), true);
supabase/migrations/20261107091000_facts_extensions.sql:403:  perform set_config('entities.allow_topology_write', coalesce(v_prev, ''), true);
src/lib/facts/sync.ts:26:import {reconcileScope,scopeRowFor} from './scope';
src/lib/facts/sync.ts:46: * issuerIds given (scripts, replay tests): those issuers run directly — no reconcileScope first,
src/lib/facts/sync.ts:48: * tables (scopeRowFor): seeded through reconcileScope with reasons ['explicit'] when applying,
src/lib/facts/sync.ts:348: * reconcileScope when applying (reasons ['explicit'], priority SCOPE_PRIORITY; the next cron
src/lib/facts/sync.ts:357: // A set_merge placeholder (fetch_key 'topology', priority 0) is not a usable schedule row: treat it as missing and derive the real key.
src/lib/facts/sync.ts:358: const have=new Map((await deps.db.scopeRows(opts.market,ids)).filter(s=>s.fetch_key!=='topology').map(s=>[s.issuer_id,s]));
src/lib/facts/sync.ts:368:  await deps.db.reconcileScope(opts.market,seed);
src/lib/facts/sync.ts:412:  if(opts.issuerIds===undefined)await reconcileScope({db:deps.db,tables:deps.tables},market);
src/lib/facts/facts.integration.test.ts:532:  const ready=async()=>{const iss=await h.issuer();const b=await h.batch();await h.db.reconcileScope('US',[{issuer_id:iss,reasons:['t'],priority:1,fetch_key:'k'}]);expect(await h.db.claimLease(iss,'US',b,600)).toBe(true);return {iss,b};};
src/lib/facts/facts.integration.test.ts:535:   const iss=await h.issuer();await h.db.reconcileScope('US',[{issuer_id:iss,reasons:['t'],priority:1,fetch_key:'k'}]);
src/lib/facts/facts.integration.test.ts:628:   await db.reconcileScope('US',[{issuer_id:iss,reasons:['t'],priority:1,fetch_key:'k'}]);
src/lib/facts/db.ts:159:  async reconcileScope(market,input,snapshotAt){return Number(await call<unknown>('reconcile_fact_sync_scope',{p_market:market,p_rows:input,p_snapshot_at:snapshotAt??null}));},
src/lib/facts/sync.test.ts:5:const mocks=vi.hoisted(()=>({reconcileScope:vi.fn(),scopeRowFor:vi.fn(),materialize:vi.fn()}));
src/lib/facts/sync.test.ts:6:vi.mock('./scope',()=>({reconcileScope:mocks.reconcileScope,scopeRowFor:mocks.scopeRowFor}));
src/lib/facts/sync.test.ts:32: mocks.reconcileScope.mockImplementation(async(d:{db:FactsDb},market:Market)=>d.db.reconcileScope(market,scopes.filter(s=>(s.market??'US')===market).map(s=>({issuer_id:s.issuer_id,reasons:['sp500'],priority:10,fetch_key:s.fetch_key}))));
src/lib/facts/sync.test.ts:69:  expect(mocks.reconcileScope).toHaveBeenCalledWith({db,tables},'US');
src/lib/facts/sync.test.ts:142:  await mocks.reconcileScope(deps,'US');
src/lib/facts/sync.test.ts:249:  mocks.reconcileScope.mockRejectedValueOnce(new Error('db down'));
src/lib/facts/sync.test.ts:304:  expect(mocks.reconcileScope).not.toHaveBeenCalled();                                   // explicit issuers never reconcile the whole market
src/lib/facts/sync.test.ts:310: it('a set_merge placeholder scope row (fetch_key topology) is treated as missing: explicit run derives and persists the real key; dry-run plans on it; underivable → scope_unresolved',async()=>{
src/lib/facts/sync.test.ts:313:  await db.reconcileScope('US',[{issuer_id:ISSUER,reasons:[],priority:0,fetch_key:'topology'},{issuer_id:ISSUER2,reasons:[],priority:0,fetch_key:'topology'}]);
src/lib/facts/sync.test.ts:316:  expect(db.scope().find(x=>x.issuer_id===ISSUER)).toMatchObject({fetch_key:'topology'});   // dry run wrote nothing
src/lib/facts/sync.test.ts:352:  await mocks.reconcileScope(deps,'US');
src/lib/facts/sync.test.ts:443:  await mocks.reconcileScope(deps,'US');
src/lib/facts/db-contract.ts:36:   expect(await db.reconcileScope('US',[{issuer_id:iss,reasons:['test'],priority:10,fetch_key:'0000000001'}])).toBe(1);
src/lib/facts/db-contract.ts:262:   expect(await db.reconcileScope('US',[{issuer_id:iss,reasons:['test'],priority:10,fetch_key:'0000000001'}])).toBe(0);
src/lib/facts/db-contract.ts:263:   expect(await db.reconcileScope('US',[{issuer_id:iss,reasons:['sp500'],priority:0,fetch_key:'0000000001'}])).toBe(1);
src/lib/facts/db-contract.ts:265:   expect(await db.reconcileScope('US',[{issuer_id:iss,reasons:['sp500'],priority:5,fetch_key:'0000000001'}])).toBe(1);
src/lib/facts/db-contract.ts:269:   expect(await db.reconcileScope('US',[{issuer_id:iss,reasons:[],priority:0,fetch_key:'0000000001'}])).toBe(1);
src/lib/facts/db-contract.ts:277:  it('reconcileScope snapshotAt: a retirement from an older snapshot does not undo a newer activation; activations and later snapshots apply',async()=>{
src/lib/facts/db-contract.ts:281:   expect(await db.reconcileScope('US',row(10))).toBe(1);                       // activation just now
src/lib/facts/db-contract.ts:282:   expect(await db.reconcileScope('US',row(0),older)).toBe(0);                  // stale retirement refused
src/lib/facts/db-contract.ts:284:   expect(await db.reconcileScope('US',row(0),newer)).toBe(1);                  // snapshot taken after the last change: retires
src/lib/facts/db-contract.ts:286:   expect(await db.reconcileScope('US',row(10),older)).toBe(1);                 // activation applies whatever the snapshot
src/lib/facts/db-contract.ts:290:  it('reconcileScope snapshotAt: an unchanged active confirmation by a newer reconcile also blocks an older retirement (and is not counted as a change)',async()=>{
src/lib/facts/db-contract.ts:293:   expect(await db.reconcileScope('US',row(10))).toBe(1);
src/lib/facts/db-contract.ts:296:   expect(await db.reconcileScope('US',row(10))).toBe(0);                       // run B confirms, unchanged
src/lib/facts/db-contract.ts:297:   expect(await db.reconcileScope('US',row(0),snap)).toBe(0);                   // A's retirement is refused
src/lib/facts/sync-us.integration.test.ts:98:  await db.reconcileScope('US',[...FIXTURE_ISSUERS.map(i=>({issuer_id:issuers[i.ticker],reasons:['test'],priority:10,fetch_key:i.cik.padStart(10,'0')})),{issuer_id:zz,reasons:['test'],priority:10,fetch_key:ZZ_CIK10}]);
src/lib/facts/sync-us.integration.test.ts:112:  if(db&&Object.keys(issuers).length>0)await db.reconcileScope('US',[...FIXTURE_ISSUERS.filter(i=>issuers[i.ticker]).map(i=>({issuer_id:issuers[i.ticker],reasons:[],priority:0,fetch_key:i.cik.padStart(10,'0')})),...(zz?[{issuer_id:zz,reasons:[],priority:0,fetch_key:ZZ_CIK10}]:[])]).catch(()=>{});
src/lib/facts/pg-facts-db.ts:60:  reconcileScope:(market,input,snapshotAt)=>fn<number>('public.reconcile_fact_sync_scope($1,$2::jsonb,$3::timestamptz)',[market,JSON.stringify(input),snapshotAt??null]),
src/lib/facts/types.ts:82: reconcileScope(market:Market,rows:{issuer_id:string;reasons:string[];priority:number;fetch_key:string}[],snapshotAt?:string):Promise<number>;
src/lib/facts/read.test.ts:49:  await db.reconcileScope('US',[{issuer_id:iss,reasons:[],priority:1,fetch_key:'k'}]);await db.claimLease(iss,'US',b,600);
src/lib/facts/read.test.ts:116:  await db.reconcileScope('US',[{issuer_id:iss,reasons:[],priority:1,fetch_key:'k'}]);await db.claimLease(iss,'US',b,600);
src/lib/facts/db.test.ts:22:  await db.reconcileScope('US',[{issuer_id:iss,reasons:[],priority:1,fetch_key:'k'}]);
src/lib/facts/db.test.ts:31:  await db.reconcileScope('US',[{issuer_id:iss,reasons:[],priority:1,fetch_key:'k'}]);await db.claimLease(iss,'US',b,60);
src/lib/facts/db.test.ts:44:  await db.reconcileScope('US',[{issuer_id:iss,reasons:[],priority:1,fetch_key:'k'}]);await db.claimLease(iss,'US',b,60);
src/lib/facts/memory-facts-db.ts:41:const ASYNC_METHODS=['claimLease','beginRun','stageFilings','stageFacts','quarantineFacts','publishRun','abandonRun','releaseLease','resolveFactsQuarantine','replaceMetrics','readFacts','factsByIds','openConflicts','filingsOfIssuer','updateFilingLink','reconcileScope','scopeDue','scopeRows','scopeAll','metricsOfIssuer'] as const satisfies readonly (keyof FactsDb)[];
src/lib/facts/memory-facts-db.ts:277:  async reconcileScope(market,input,snapshotAt){
src/lib/facts/scope.test.ts:5:import {SNAPSHOT_SKEW_MARGIN_MS,currentSecurities,fetchKey,reconcileScope,scopeRowFor} from './scope';
src/lib/facts/scope.test.ts:31:/** memoryFactsDb on the frozen clock plus a recorder of what reconcileScope received. */
src/lib/facts/scope.test.ts:33: const db=memoryFactsDb();db.setNow(NOW_ISO);const calls:{market:Market;rows:Parameters<FactsDb['reconcileScope']>[1];snapshot?:string}[]=[];
src/lib/facts/scope.test.ts:34: const wrapped:FactsDb={...db,reconcileScope:(market,rows,snapshot)=>{calls.push({market,rows,snapshot});return db.reconcileScope(market,rows,snapshot);}};
src/lib/facts/scope.test.ts:47:describe('reconcileScope',()=>{
src/lib/facts/scope.test.ts:50:  const r=await reconcileScope({tables,db},'US',{today:TODAY});
src/lib/facts/scope.test.ts:57:  const r=await reconcileScope({tables,db},'CN',{today:TODAY});
src/lib/facts/scope.test.ts:63:  await reconcileScope({tables,db},'US',{today:TODAY});
src/lib/facts/scope.test.ts:64:  await reconcileScope({tables,db},'US',{today:TODAY});
src/lib/facts/scope.test.ts:68:  const r=await reconcileScope({tables,db},'US',{today:TODAY});
src/lib/facts/scope.test.ts:76:  expect(await reconcileScope({tables,db},'US',{today:TODAY})).toMatchObject({desired:1,retired:0});
src/lib/facts/scope.test.ts:80:  expect((await reconcileScope({tables,db},'US',{today:TODAY})).skipped).toMatchObject({unknown_ticker:2});
src/lib/facts/scope.test.ts:99:describe('reconcileScope: snapshot guard',()=>{
src/lib/facts/scope.test.ts:103:  await reconcileScope({tables,db},'US',{today:TODAY,now:()=>t});
src/lib/facts/scope.test.ts:109:  await reconcileScope({tables,db},'US',{today:TODAY});          // activates the desired issuers now
src/lib/facts/scope.test.ts:115:  const r=await reconcileScope({tables:empty,db},'US',{today:TODAY,snapshotAt:'2000-01-01T00:00:00.000Z'});
src/lib/facts/scope.test.ts:121:describe('reconcileScope: CN ticker choice, skips and paging',()=>{
src/lib/facts/scope.test.ts:134:  const r=await reconcileScope({tables,db},'CN',{today:TODAY});
src/lib/facts/scope.test.ts:146:  const r=await reconcileScope({tables,db},'US',{today:TODAY});
src/lib/facts/scope.test.ts:159:  const r=await reconcileScope({tables,db},'CN',{today:TODAY});
src/lib/facts/scope.test.ts:181:  await db.reconcileScope('CN',[{issuer_id:'99999999-9999-4999-8999-999999999999',reasons:['cohort'],priority:10,fetch_key:'688001.SH'}]);
src/lib/facts/scope.test.ts:182:  const r=await reconcileScope({tables,db},'CN',{today:TODAY});
src/lib/facts/scope.ts:2:// Sync scope (spec §6.4). reconcileScope is idempotent: it computes the desired set for one market
src/lib/facts/scope.ts:4:// FactsDb.reconcileScope (SQL reconcile_fact_sync_scope), which only touches reasons/priority/
src/lib/facts/scope.ts:41:export interface ScopeDeps{tables:TableClient;db:Pick<FactsDb,'reconcileScope'|'scopeAll'>}
src/lib/facts/scope.ts:186:export async function reconcileScope(deps:ScopeDeps,market:Market,opts:{today?:string;snapshotAt?:string;now?:()=>number}={}):Promise<ScopeReconcileResult>{
src/lib/facts/scope.ts:197: const changed=rows.length===0?0:await deps.db.reconcileScope(market,rows,snapshotAt);
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
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>
exec
/bin/zsh -lc "sed -n '195,245p' src/lib/facts/scope.ts; sed -n '270,312p' src/lib/facts/memory-facts-db.ts; rg -n 'reconcile_fact_sync_scope' supabase/migrations/*; cat package.json | grep -A14 scripts; find . -name 'AGENTS*' -not -path './node_modules/*'; sed -n '1,90p' src/lib/dq/dq-extensions.integration.test.ts" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 48ms:
  .map(r=>({issuer_id:String(r.issuer_id),reasons:[],priority:0,fetch_key:String(r.fetch_key)}));
 const rows=[...desired,...retired].sort((a,b)=>a.issuer_id<b.issuer_id?-1:a.issuer_id>b.issuer_id?1:0);
 const changed=rows.length===0?0:await deps.db.reconcileScope(market,rows,snapshotAt);
 return {desired:desired.length,retired:retired.length,changed,skipped};
}
   rows.sort((a,b)=>cmp(b.available_date,a.available_date)||cmp(a.filing_id,b.filing_id));
   return clone(opts.limit===undefined?rows:rows.slice(0,opts.limit));   // no implicit cap: complete-set read (round-1 #7)
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
  },
  async metricsOfIssuer(issuer,market,formulaVersion){
   const rows=metrics.filter(m=>m.issuer_id===issuer&&m.market===market&&m.formula_version===formulaVersion);
   rows.sort((a,b)=>cmp(a.metric,b.metric)||cmp(a.period_end,b.period_end)||cmp(a.period_start,b.period_start)||cmp(a.input_unit,b.input_unit)||cmp(a.basis,b.basis));
   return clone(rows);
  },
 };
 // Every FactsDb method (reads included) runs through one promise chain per instance, so no operation
 // observes or interleaves with another's partial writes across awaits (SQL: one transaction each).
 let chain:Promise<unknown>=Promise.resolve();
supabase/migrations/20261106090000_financial_facts.sql:14:-- call reconcile_fact_sync_scope (schedule inputs, no lease).
supabase/migrations/20261106090000_financial_facts.sql:139:  scope_confirmed_at timestamptz not null default now(),   -- last time reconcile_fact_sync_scope saw the row active in its sources or changed it (retirement guard)
supabase/migrations/20261106090000_financial_facts.sql:318:drop function if exists public.reconcile_fact_sync_scope(text, jsonb);
supabase/migrations/20261106090000_financial_facts.sql:323:create or replace function public.reconcile_fact_sync_scope(p_market text, p_rows jsonb, p_snapshot_at timestamptz default null)
supabase/migrations/20261106090000_financial_facts.sql:344:revoke execute on function public.reconcile_fact_sync_scope(text, jsonb, timestamptz) from public, anon, authenticated;
supabase/migrations/20261106090000_financial_facts.sql:345:grant execute on function public.reconcile_fact_sync_scope(text, jsonb, timestamptz) to service_role;
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
// src/lib/dq/dq-extensions.integration.test.ts
// F3-4 (plan 3 spec §3.2, §9.2): migration 20261107091000 on real PostgreSQL — filings acceptance
// columns and set_filing_acceptance, financial_metrics.based_on_lineage (upgrade + replay),
// read_filing_facts, read_facts_lineage (and read_facts as a wrapper with identical output),
// replace_financial_metrics_lineage (and its wrapper), set_merge / set_dissolved with the topology
// guard (S1, R3), fact_promote_rows predicates on every promotion entry (T6), adopt_candidate (T1,
// T5, U3), restore_reconciled (R1), resolve_lineage_conflict, the reconcile cursor and
// apply_reconcile_result (T2), grants. Every test owns its issuers (and its `test.<hex>` pair), so
// suites running in parallel on the shared database never meet.
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import type {PoolClient} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';

const enabled=!!process.env.S4_TEST_STATE;
const MIGRATION='supabase/migrations/20261107091000_facts_extensions.sql';
const PLAN2='supabase/migrations/20261106090000_financial_facts.sql';

// Same replay policy as facts.integration.test.ts (not exported there).
const RETRYABLE=new Set(['55P03','40P01']);
async function replayMigration(pool:Pool,sql:string,attempts=10):Promise<void>{
 for(let attempt=1;;attempt++){
  const c=await pool.connect();
  try{await c.query(`begin; set local lock_timeout='3s';\n${sql}\n;commit;`);return;}
  catch(e){
   await c.query('rollback').catch(()=>{});
   const code=(e as {code?:string}).code;
   if(attempt>=attempts||!code||!RETRYABLE.has(code))throw e;
   await new Promise(r=>setTimeout(r,250*attempt+Math.floor(Math.random()*250)));
  }finally{c.release();}
 }
}
/** body inside one transaction that is ALWAYS rolled back; retried on lock timeout / deadlock (body must be repeatable). */
async function inRolledBackTx(pool:Pool,body:(c:PoolClient)=>Promise<void>,attempts=10):Promise<void>{
 for(let attempt=1;;attempt++){
  const c=await pool.connect();
  try{await c.query(`begin; set local lock_timeout='3s'`);await body(c);return;}
  catch(e){
   const code=(e as {code?:string}).code;
   if(attempt>=attempts||!code||!RETRYABLE.has(code))throw e;
   await new Promise(r=>setTimeout(r,250*attempt+Math.floor(Math.random()*250)));
  }finally{await c.query('rollback').catch(()=>{});c.release();}
 }
}
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
const fails=(p:Promise<unknown>)=>p.then(()=>{throw new Error('expected rejection');},e=>e as PgErr);
type FactSpec={filing_id:string;fact_id?:string;concept?:string;period_start?:string|null;period_end?:string;duration?:string;value?:string;unit?:string;available_date?:string;mapping_version?:string};
type Envelope={state_rev:number;rows:Record<string,unknown>[];truncated:boolean;row_count:number};
type LineageEnvelope={state_revs:{issuer_id:string;state_rev:number}[];lineage:string[];rows:Record<string,unknown>[];conflicts:{key:Record<string,string|null>;available_date:string;fact_ids:string[]}[];truncated:boolean;row_count:number};

describe.skipIf(!enabled)('F3-4 facts extensions migration on real PostgreSQL',()=>{
 let admin:Pool;
 const q=async(text:string,values:unknown[]=[])=>(await admin.query(text,values)).rows as Record<string,any>[];
 const one=async(text:string,values:unknown[]=[])=>(await q(text,values))[0]?.v;
 const issuer=async(name='ZZ Ext Test')=>{const id=randomUUID();await q(`insert into public.issuers(issuer_id,canonical_name_en) values($1,$2)`,[id,name]);return id;};
 const user=async()=>{const id=randomUUID();await q(`insert into auth.users(id,email) values($1,$2)`,[id,`${id}@ext.test`]);return id;};
 const batch=async(dataset='facts.us',finished=false)=>{
  const id=randomUUID();await q(`insert into public.ingest_batches(batch_id,producer,dataset) values($1,'ext-test',$2)`,[id,dataset]);
  if(finished)await q(`update public.ingest_batches set status='success',finished_at=now() where batch_id=$1`,[id]);
  return id;
 };
 const scope=(iss:string,market='US')=>one(`select public.reconcile_fact_sync_scope($1,$2::jsonb) v`,[market,JSON.stringify([{issuer_id:iss,reasons:['test'],priority:10,fetch_key:'0000000001'}])]);
 const claim=(iss:string,b:string,market='US')=>one(`select public.claim_fact_sync_lease($1,$2,$3,600) v`,[iss,market,b]);
 const begin=(iss:string,b:string,gen=1,market='US')=>one(`select public.begin_sync_run($1,$2,$3,$4) v`,[iss,market,b,gen]);
 const filing=async(run:string,o:{available?:string;sourceRef?:string;source?:string;origin?:string;form?:string}={})=>{
  const id=randomUUID();const sourceRef=o.sourceRef??`0000${randomUUID().slice(0,6)}-24-${randomUUID().slice(0,6)}`;
  const m=await one(`select public.stage_filings($1,$2::jsonb) v`,[run,JSON.stringify([{filing_id:id,source:o.source??'edgar',origin:o.origin??'sec',form_type:o.form??'10-K',fiscal_year:2023,fiscal_period:'FY',period_end:'2023-12-31',available_date:o.available??'2024-02-01',source_ref:sourceRef,url:null}])]);

codex
The change correctly treats topology placeholder rows as unresolved scope inputs and reuses the existing derivation and persistence paths. The added tests cover explicit sync and empty-cycle registration behavior; no actionable regressions were identified. Tests were not executed.
The change correctly treats topology placeholder rows as unresolved scope inputs and reuses the existing derivation and persistence paths. The added tests cover explicit sync and empty-cycle registration behavior; no actionable regressions were identified. Tests were not executed.

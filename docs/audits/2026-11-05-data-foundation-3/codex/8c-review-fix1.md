OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b06a-d6b4-7a90-8156-65a6a30cc905
--------
user
commit 5c79e7d
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 5c79e7d; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 445ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-yKvmRvtf' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-VcinOvT6' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/8c-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/8c-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/8c-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-o79Fx7Ar' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-ZHs33ArK' (errno=Operation not permitted)
5c79e7d fix(dq): 8c Codex P2s — frozen expected-key coverage, passed only when compared, fence-issuer test
 src/lib/dq/dq-extensions.integration.test.ts       | 52 +++++++++++++++++-----
 supabase/migrations.lock.json                      |  2 +-
 .../migrations/20261107091000_facts_extensions.sql | 40 +++++++++++++++--
 3 files changed, 79 insertions(+), 15 deletions(-)

exec
/bin/zsh -lc 'pwd; for d in . .. ../.. ../../.. ../../../.. ../../../../..; do for f in AGENTS.override.md AGENTS.md; do if [ -f "$d/$f" ]; then echo "$d/$f"; cat "$d/$f"; fi; done; done; git show 5c79e7d --; ls -a | head -30' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
../../../AGENTS.md
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-jDuYBlOT' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-T4tAuHZ2' (errno=Operation not permitted)
commit 5c79e7d04bf640b925eb91b49b619ac42be3d385
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 02:32:11 2026 -0800

    fix(dq): 8c Codex P2s — frozen expected-key coverage, passed only when compared, fence-issuer test
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/dq/dq-extensions.integration.test.ts b/src/lib/dq/dq-extensions.integration.test.ts
index 5d967a6..902f263 100644
--- a/src/lib/dq/dq-extensions.integration.test.ts
+++ b/src/lib/dq/dq-extensions.integration.test.ts
@@ -652,10 +652,11 @@ describe.skipIf(!enabled)('F3-4 facts extensions migration on real PostgreSQL',(
 
  describe('8c: reconcile cursor and apply_reconcile_result',()=>{
   const newPair=()=>`test.${randomUUID().slice(0,8)}`;   // one pair per test: never meets another suite's running cycle
-  const cycle=async(pair:string,members:{issuer_id:string;market?:string;expected:number}[],status='running')=>{
+  const keysOf=(m:{expected:number;keys?:string[]})=>m.keys??Array.from({length:m.expected},(_,i)=>`k${i+1}`);
+  const cycle=async(pair:string,members:{issuer_id:string;market?:string;expected:number;keys?:string[]}[],status='running')=>{
    const id=`${pair}-${randomUUID().slice(0,8)}`;
    await q(`insert into public.dq_reconcile_cycles(pair,cycle_id,started_at,finished_at,members,status,expected_total) values($1,$2,now(),$3,$4::jsonb,$5,$6)`,
-    [pair,id,status==='running'?null:new Date().toISOString(),JSON.stringify(members.map(m=>({issuer_id:m.issuer_id,market:m.market??'US',expected_keys:m.expected}))),status,members.reduce((n,m)=>n+m.expected,0)]);
+    [pair,id,status==='running'?null:new Date().toISOString(),JSON.stringify(members.map(m=>({issuer_id:m.issuer_id,market:m.market??'US',expected_keys:keysOf(m).map(k=>({naturalKey:k,locator:{}}))}))),status,members.reduce((n,m)=>n+m.expected,0)]);
    for(const m of members)await q(`insert into public.dq_reconcile_cursor(pair,cycle_id,issuer_id,market,expected) values($1,$2,$3,$4,$5)`,[pair,id,m.issuer_id,m.market??'US',m.expected]);
    return id;
   };
@@ -731,7 +732,7 @@ describe.skipIf(!enabled)('F3-4 facts extensions migration on real PostgreSQL',(
 
   it('apply_reconcile_result touches only the member\'s published ok rows; a quarantined left gets latest_result on its open items; review and lineage items change no visibility; invalid results write nothing',async()=>{
    const {iss,b,r0,r}=await published();const {x}=await sibling('5');
-   const pair=newPair();const cy=await cycle(pair,[{issuer_id:iss,expected:6}]);const w=await batch(`reconcile.${pair}`);const fence=(await claimM(pair,cy,iss,w))!;
+   const pair=newPair();const cy=await cycle(pair,[{issuer_id:iss,expected:8,keys:['k0','k1','k1m','k1p','k2','k3','k4','k5']}]);const w=await batch(`reconcile.${pair}`);const fence=(await claimM(pair,cy,iss,w))!;
    expect(await fails(apply(fence,res('k0',{action:'quarantine_left',left_fact_id:x})))).toMatchObject({message:'invalid_result',code:'22023'});   // another issuer's row
    expect(await fails(apply(fence,res('k0',{action:'quarantine_left'})))).toMatchObject({message:'invalid_result'});      // left_fact_id required
    expect(await fails(apply(fence,res('k0',{action:'review_item'})))).toMatchObject({message:'invalid_result'});          // item required
@@ -794,24 +795,55 @@ describe.skipIf(!enabled)('F3-4 facts extensions migration on real PostgreSQL',(
   });
 
   it('reconcile_mismatch items only ever name the fence issuer/market rows: payload.fact_ids never spans a lineage (restore_reconciled promotes one issuer)',async()=>{
-   const {iss,r}=await published();const {x}=await sibling('100');
-   const pair=newPair();const cy=await cycle(pair,[{issuer_id:iss,expected:2}]);
+   const {iss,r}=await published();const {iss:src,x}=await sibling('100');const by=await user();
+   const pair=newPair();const cy=await cycle(pair,[{issuer_id:iss,expected:3,keys:['kx','km','k1']}]);
    const w=await batch(`reconcile.${pair}`);const fence=(await claimM(pair,cy,iss,w))!;
-   // a row of another issuer (even one in the same lineage) is refused for the fence member
+   // a row of an unrelated issuer is refused for the fence member
    expect(await fails(apply(fence,res('kx',{action:'quarantine_left',left_fact_id:x})))).toMatchObject({message:'invalid_result'});
-   // the same row in the right market of the wrong fence is refused as well
+   // a member merged INTO the fence issuer is still another issuer's row: refused as well
+   await merge(src,iss,by);
+   expect(await fails(apply(fence,res('km',{action:'quarantine_left',left_fact_id:x})))).toMatchObject({message:'invalid_result'});
+   expect(await status(x)).toBe('ok');
    const a=await apply(fence,res('k1',{action:'quarantine_left',left_fact_id:r}));
    const [row]=await q(`select payload,detail from public.dq_quarantine where id=$1`,[a.item_id]);
    expect(row.payload.fact_ids).toEqual([r]);
-   const owners=await q(`select distinct issuer_id,market from public.financial_facts where fact_id=any($1::uuid[])`,[row.payload.fact_ids]);
-   expect(owners).toEqual([{issuer_id:iss,market:'US'}]);
+   expect(await q(`select distinct issuer_id,market from public.financial_facts where fact_id=any($1::uuid[])`,[row.payload.fact_ids])).toEqual([{issuer_id:iss,market:'US'}]);
    expect(row.detail).toMatchObject({issuer_id:iss,market:'US'});
-   // every reconcile_mismatch item of the pair satisfies the invariant
    const bad=await q(`select q.id from public.dq_quarantine q where q.reason_code='reconcile_mismatch' and q.detail->>'pair'=$1
      and exists(select 1 from jsonb_array_elements_text(q.payload->'fact_ids') i join public.financial_facts f on f.fact_id=i::uuid where f.issuer_id<>$2 or f.market<>'US')`,[pair,iss]);
    expect(bad).toEqual([]);
   });
 
+  it('frozen expected keys: duplicates refused at creation; a key outside the frozen set is invalid_result; complete needs exact coverage (member_incomplete otherwise)',async()=>{
+   const iss=await issuer();const pair=newPair();
+   expect(await fails(openC(admin,pair,`${pair}-d`,[{issuer_id:iss,market:'US',expected_keys:[{naturalKey:'A',locator:{}},{naturalKey:'A',locator:{}}]}],[]))).toMatchObject({message:'invalid_members'});
+   expect(await q(`select 1 from public.dq_reconcile_cycles where pair=$1`,[pair])).toEqual([]);
+   const {iss:i2,r}=await published();const pair2=newPair();
+   const cy=`${pair2}-c`;
+   expect(await openC(admin,pair2,cy,[{issuer_id:i2,market:'US',expected_keys:[{naturalKey:'A',locator:{}},{naturalKey:'B',locator:{}}]}],[])).toMatchObject({created:true});
+   const w=await batch(`reconcile.${pair2}`);const fence=(await claimM(pair2,cy,i2,w))!;
+   await apply(fence,res('A',{passed:true,right_value:'100',abs_diff:'0',rel_diff:'0'}));
+   expect(await fails(apply(fence,res('C',{passed:true,right_value:'100',abs_diff:'0',rel_diff:'0'})))).toMatchObject({message:'invalid_result',code:'22023'});
+   expect((await resultRows(pair2)).map(x=>x.natural_key)).toEqual(['A']);
+   expect(await fails(complete(fence))).toMatchObject({message:'member_incomplete'});
+   await apply(fence,res('B',{action:'quarantine_left',left_fact_id:r}));
+   expect(await complete(fence)).toEqual({compared_passed:1,compared_failed:1,not_compared:0});
+  });
+
+  it('passed=true only with outcome compared (invalid_result before any write); a non-compared result never sets or overwrites latest_result on an open mismatch',async()=>{
+   const {iss,r}=await published();const pair=newPair();const cy=await cycle(pair,[{issuer_id:iss,expected:4}]);
+   const w=await batch(`reconcile.${pair}`);const fence=(await claimM(pair,cy,iss,w))!;
+   const a=await apply(fence,res('k1',{action:'quarantine_left',left_fact_id:r}));
+   expect(await fails(apply(fence,res('k2',{left_fact_id:r,outcome:'right_missing',passed:true,right_value:null,abs_diff:null,rel_diff:null})))).toMatchObject({message:'invalid_result',code:'22023'});
+   expect((await resultRows(pair)).map(x=>x.natural_key)).toEqual(['k1']);
+   const lr=async()=>(await q(`select detail->'latest_result' lr from public.dq_quarantine where id=$1`,[a.item_id]))[0].lr;
+   expect(await lr()).toMatchObject({passed:false});
+   await apply(fence,res('k2',{left_fact_id:r,passed:true,right_value:'100',abs_diff:'0',rel_diff:'0',inputs_hash:'h2'}));
+   expect(await lr()).toMatchObject({passed:true,inputs_hash:'h2'});
+   await apply(fence,res('k3',{left_fact_id:r,outcome:'right_missing',right_value:null,abs_diff:null,rel_diff:null,inputs_hash:'h3'}));
+   expect(await lr()).toMatchObject({passed:true,inputs_hash:'h2'});         // passing evidence not overwritten
+  });
+
   // ---- open_reconcile_cycle (section 13, plan audit Q2): atomic creation, per-entry consumption, the lock shared with set_merge
   type Opened={created:boolean;cycle:Record<string,any>;transferred:unknown[]};
   const openC=(c:Pool|PoolClient,pair:string,id:string,members:unknown[],pending:unknown[])=>
diff --git a/supabase/migrations.lock.json b/supabase/migrations.lock.json
index 0b7bb82..f65b9c5 100644
--- a/supabase/migrations.lock.json
+++ b/supabase/migrations.lock.json
@@ -207,7 +207,7 @@
     },
     {
       "file": "20261107091000_facts_extensions.sql",
-      "sha256": "36372e7cc2db0f6e4de844b3d9298aededac1e907cf67e091c0c8c8d75498598"
+      "sha256": "d1827381ed1ddbf56da4d93618c80ac7987f3602ec57143f3488371d02853e3c"
     }
   ]
 }
diff --git a/supabase/migrations/20261107091000_facts_extensions.sql b/supabase/migrations/20261107091000_facts_extensions.sql
index a511d50..fe09a24 100644
--- a/supabase/migrations/20261107091000_facts_extensions.sql
+++ b/supabase/migrations/20261107091000_facts_extensions.sql
@@ -801,6 +801,19 @@ begin
 end $$;
 revoke execute on function public.reconcile_fence_lock(jsonb) from public, anon, authenticated, service_role;
 
+-- The member's frozen expected natural keys (dq_reconcile_cycles.members[].expected_keys, each element
+-- {naturalKey,...} or a bare string), as text[]; null when the member is not in the cycle. Internal.
+create or replace function public.reconcile_frozen_keys(p_pair text, p_cycle_id text, p_issuer uuid, p_market text)
+returns text[] language sql stable security definer set search_path = public as $$
+  select (select coalesce(array_agg(case jsonb_typeof(k) when 'object' then k ->> 'naturalKey' else k #>> '{}' end), '{}'::text[])
+          from jsonb_array_elements(m -> 'expected_keys') k)
+  from public.dq_reconcile_cycles y, jsonb_array_elements(y.members) m
+  where y.pair = p_pair and y.cycle_id = p_cycle_id and m ->> 'issuer_id' = p_issuer::text and m ->> 'market' = p_market
+    and jsonb_typeof(m -> 'expected_keys') = 'array'
+  limit 1
+$$;
+revoke execute on function public.reconcile_frozen_keys(text, text, uuid, text) from public, anon, authenticated, service_role;
+
 -- Claimable iff pending, or claimed with an expired lease, or failed with attempts < 3 (failed at
 -- 3 is terminal), and the cycle is running. One atomic update; the post-claim attempts is the fence.
 create or replace function public.claim_reconcile_member(p_pair text, p_cycle_id text, p_issuer uuid, p_market text, p_batch uuid)
@@ -824,7 +837,7 @@ grant execute on function public.claim_reconcile_member(text, text, uuid, text,
 -- compared ∧ ¬passed / any other outcome); their sum must equal expected, else member_incomplete.
 create or replace function public.complete_reconcile_member(p_fence jsonb)
 returns jsonb language plpgsql security definer set search_path = public as $$
-declare c public.dq_reconcile_cursor; v_p int; v_f int; v_n int;
+declare c public.dq_reconcile_cursor; v_p int; v_f int; v_n int; v_keys text[];
 begin
   c := public.reconcile_fence_lock(p_fence);
   select count(*) filter (where r.outcome = 'compared' and r.passed), count(*) filter (where r.outcome = 'compared' and not r.passed), count(*) filter (where r.outcome <> 'compared')
@@ -832,6 +845,15 @@ begin
   from public.dq_reconciliations r
   where r.pair = c.pair and r.cycle_id = c.cycle_id and r.issuer_id = c.issuer_id and r.market = c.market;
   if v_p + v_f + v_n <> c.expected then raise exception 'member_incomplete' using errcode = 'P0001'; end if;
+  -- exact coverage of the frozen key set: every frozen key has an accepted result and nothing else does
+  v_keys := public.reconcile_frozen_keys(c.pair, c.cycle_id, c.issuer_id, c.market);
+  if v_keys is null
+     or exists (select 1 from unnest(v_keys) k where not exists (select 1 from public.dq_reconciliations r
+                where r.pair = c.pair and r.cycle_id = c.cycle_id and r.issuer_id = c.issuer_id and r.market = c.market and r.natural_key = k))
+     or exists (select 1 from public.dq_reconciliations r
+                where r.pair = c.pair and r.cycle_id = c.cycle_id and r.issuer_id = c.issuer_id and r.market = c.market and r.natural_key <> all (v_keys)) then
+    raise exception 'member_incomplete' using errcode = 'P0001';
+  end if;
   update public.dq_reconcile_cursor
   set state = 'done', done_at = clock_timestamp(), claim_until = null, compared_passed = v_p, compared_failed = v_f, not_compared = v_n
   where pair = c.pair and cycle_id = c.cycle_id and issuer_id = c.issuer_id and market = c.market;
@@ -863,7 +885,7 @@ grant execute on function public.fail_reconcile_member(jsonb, text) to service_r
 --   left_value, right_value, right_locator} and detail {pair, reconciliation_id, inputs_hash,
 --   latest_result, issuer_id, market, hook pending}; the row → quarantined; state_rev + 1;
 --   materialize = {issuer_id, market}.
---  any action with a left_fact_id whose row is already quarantined (passed or not, any outcome): the
+--  any action with a left_fact_id whose row is already quarantined and a COMPARED result (passed or not): the
 --   OPEN reconcile_mismatch items of this pair that reference it get detail.latest_result = {passed,
 --   reconciliation_id, at, inputs_hash} — this is how a passing re-run makes an item restorable.
 --  quarantine_left otherwise (passed, or not compared, left ok): the result row only.
@@ -876,7 +898,7 @@ returns jsonb language plpgsql security definer set search_path = public as $$
 declare c public.dq_reconcile_cursor; v_existing public.dq_reconciliations; f public.financial_facts; v_run text;
         v_rid uuid := gen_random_uuid(); v_item uuid; v_q int := 0; v_mat jsonb; v_action text; v_nk text; v_left uuid;
         v_dataset text; v_nk_item text; v_latest jsonb; v_now timestamptz := now(); v_reason text;
-        v_lv numeric; v_rv numeric; v_ad numeric; v_rd numeric; v_tol numeric;
+        v_lv numeric; v_rv numeric; v_ad numeric; v_rd numeric; v_tol numeric; v_keys text[];
 begin
   c := public.reconcile_fence_lock(p_fence);
   if p_result is null or jsonb_typeof(p_result) <> 'object'
@@ -891,6 +913,11 @@ begin
   end if;
   v_action := p_result ->> 'action'; v_nk := p_result ->> 'natural_key';
   if length(v_nk) not between 1 and 400 then raise exception 'invalid_result' using errcode = '22023'; end if;
+  -- a pass is only meaningful for a compared pair of values
+  if (p_result -> 'passed') = 'true'::jsonb and p_result ->> 'outcome' <> 'compared' then raise exception 'invalid_result' using errcode = '22023'; end if;
+  -- the key must belong to the member's frozen expected set
+  v_keys := public.reconcile_frozen_keys(c.pair, c.cycle_id, c.issuer_id, c.market);
+  if v_keys is null or not (v_nk = any (v_keys)) then raise exception 'invalid_result' using errcode = '22023'; end if;
   begin
     v_lv := (p_result ->> 'left_value')::numeric; v_rv := (p_result ->> 'right_value')::numeric;
     v_ad := (p_result ->> 'abs_diff')::numeric; v_rd := (p_result ->> 'rel_diff')::numeric;
@@ -944,7 +971,7 @@ begin
     v_q := 1;
     update public.fact_sync_scope set state_rev = state_rev + 1, updated_at = now() where issuer_id = c.issuer_id and market = c.market;
     v_mat := jsonb_build_object('issuer_id', c.issuer_id, 'market', c.market);
-  elsif v_left is not null and f.status = 'quarantined' then
+  elsif v_left is not null and f.status = 'quarantined' and p_result ->> 'outcome' = 'compared' then
     with upd as (
       update public.dq_quarantine q set detail = q.detail || jsonb_build_object('latest_result', v_latest)
       where q.table_name = 'financial_facts' and q.reason_code = 'reconcile_mismatch' and q.status = 'open' and q.detail ->> 'pair' = c.pair
@@ -1003,6 +1030,11 @@ begin
      or exists (select 1 from jsonb_array_elements(p_members) m
                 where jsonb_typeof(m) <> 'object' or (m ->> 'issuer_id') is null or coalesce(m ->> 'market', '') not in ('US', 'CN')
                    or jsonb_typeof(m -> 'expected_keys') is distinct from 'array')
+     or exists (select 1 from jsonb_array_elements(p_members) m
+                where exists (select 1 from jsonb_array_elements(case when jsonb_typeof(m -> 'expected_keys') = 'array' then m -> 'expected_keys' else '[]'::jsonb end) k
+                              where (case jsonb_typeof(k) when 'object' then k ->> 'naturalKey' when 'string' then k #>> '{}' end) is null)
+                   or (select count(*) from jsonb_array_elements(case when jsonb_typeof(m -> 'expected_keys') = 'array' then m -> 'expected_keys' else '[]'::jsonb end))
+                      <> (select count(distinct (case jsonb_typeof(k) when 'object' then k ->> 'naturalKey' else k #>> '{}' end)) from jsonb_array_elements(case when jsonb_typeof(m -> 'expected_keys') = 'array' then m -> 'expected_keys' else '[]'::jsonb end) k))
      or (select count(*) from jsonb_array_elements(p_members))
         <> (select count(distinct (m ->> 'issuer_id', m ->> 'market')) from jsonb_array_elements(p_members) m)
      or exists (select 1 from jsonb_array_elements(p_pending) p
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
/bin/zsh -lc "sed -n '650,735p' src/lib/dq/dq-extensions.integration.test.ts; sed -n '1010,1110p' supabase/migrations/20261107091000_facts_extensions.sql; rg 'expected_keys|naturalKey' src/lib/dq/reconcile*; find src supabase -iname '*agents*'; cat package.json | head -85" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
  });
 });

 describe('8c: reconcile cursor and apply_reconcile_result',()=>{
  const newPair=()=>`test.${randomUUID().slice(0,8)}`;   // one pair per test: never meets another suite's running cycle
  const keysOf=(m:{expected:number;keys?:string[]})=>m.keys??Array.from({length:m.expected},(_,i)=>`k${i+1}`);
  const cycle=async(pair:string,members:{issuer_id:string;market?:string;expected:number;keys?:string[]}[],status='running')=>{
   const id=`${pair}-${randomUUID().slice(0,8)}`;
   await q(`insert into public.dq_reconcile_cycles(pair,cycle_id,started_at,finished_at,members,status,expected_total) values($1,$2,now(),$3,$4::jsonb,$5,$6)`,
    [pair,id,status==='running'?null:new Date().toISOString(),JSON.stringify(members.map(m=>({issuer_id:m.issuer_id,market:m.market??'US',expected_keys:keysOf(m).map(k=>({naturalKey:k,locator:{}}))}))),status,members.reduce((n,m)=>n+m.expected,0)]);
   for(const m of members)await q(`insert into public.dq_reconcile_cursor(pair,cycle_id,issuer_id,market,expected) values($1,$2,$3,$4,$5)`,[pair,id,m.issuer_id,m.market??'US',m.expected]);
   return id;
  };
  type FenceJson={pair:string;cycle_id:string;issuer_id:string;market:string;batch_id:string;attempt:number};
  const claimM=(pair:string,cy:string,iss:string,b:string,market='US')=>one(`select public.claim_reconcile_member($1,$2,$3,$4,$5) v`,[pair,cy,iss,market,b]) as Promise<FenceJson|null>;
  const apply=(fence:FenceJson,result:Record<string,unknown>)=>one(`select public.apply_reconcile_result($1::jsonb,$2::jsonb) v`,[JSON.stringify(fence),JSON.stringify(result)]);
  const complete=(fence:FenceJson)=>one(`select public.complete_reconcile_member($1::jsonb) v`,[JSON.stringify(fence)]);
  const failM=(fence:FenceJson,err:string)=>q(`select public.fail_reconcile_member($1::jsonb,$2)`,[JSON.stringify(fence),err]);
  const cursor=async(pair:string,cy:string,iss:string)=>(await q(`select state,attempts,claimed_by,last_error,compared_passed,compared_failed,not_compared from public.dq_reconcile_cursor where pair=$1 and cycle_id=$2 and issuer_id=$3`,[pair,cy,iss]))[0];
  const expire=(pair:string,cy:string,iss:string)=>q(`update public.dq_reconcile_cursor set claim_until=clock_timestamp()-interval '1 second' where pair=$1 and cycle_id=$2 and issuer_id=$3`,[pair,cy,iss]);
  const res=(nk:string,o:Record<string,unknown>={})=>({natural_key:nk,kind:'numeric',outcome:'compared',passed:false,left_value:'100',right_value:'99',abs_diff:'1',rel_diff:'0.01',tolerance:'0',
   left_source:'companyfacts',right_source:'ixbrl',detail:{right:{document:'d',sha256:'s',locator:'ix:nonFraction#c1'}},action:'record',inputs_hash:'h1',...o});
  const resultRows=(pair:string)=>q(`select natural_key,outcome,passed,attempt,issuer_id,market,cycle_id,dataset,batch_id,detail->>'item_id' item_id from public.dq_reconciliations where pair=$1 order by natural_key`,[pair]);

  it('claim (S4): pending → fence attempt 1; held → null; expired → attempt 2; failed with attempts < 3 → claimable; failed at 3 is terminal; a cycle that is not running → null',async()=>{
   const iss=await issuer();const pair=newPair();const cy=await cycle(pair,[{issuer_id:iss,expected:0}]);
   const b1=await batch(`reconcile.${pair}`),b2=await batch(`reconcile.${pair}`);
   expect(await claimM(pair,cy,iss,b1)).toEqual({pair,cycle_id:cy,issuer_id:iss,market:'US',batch_id:b1,attempt:1});
   expect(await claimM(pair,cy,iss,b2)).toBeNull();
   await expire(pair,cy,iss);
   const f2=(await claimM(pair,cy,iss,b2))!;expect(f2).toMatchObject({batch_id:b2,attempt:2});
   await failM(f2,'boom');
   expect(await cursor(pair,cy,iss)).toMatchObject({state:'failed',attempts:2,last_error:'boom'});
   const f3=(await claimM(pair,cy,iss,b1))!;expect(f3).toMatchObject({attempt:3});
   await failM(f3,'again');
   expect(await claimM(pair,cy,iss,b2)).toBeNull();
   expect(await cursor(pair,cy,iss)).toMatchObject({state:'failed',attempts:3});
   const other=await issuer();const pair2=newPair();const done=await cycle(pair2,[{issuer_id:other,expected:0}],'complete');
   expect(await claimM(pair2,done,other,b1)).toBeNull();
  });

  it('fence: an expired, foreign or stale-attempt fence is fence_failed for apply / complete / fail and writes nothing',async()=>{
   const {iss,r}=await published();const pair=newPair();const cy=await cycle(pair,[{issuer_id:iss,expected:1}]);
   const w=await batch(`reconcile.${pair}`);const fence=(await claimM(pair,cy,iss,w))!;
   for(const f of [{...fence,batch_id:randomUUID()},{...fence,attempt:2},{...fence,cycle_id:'nope'},{...fence,attempt:undefined} as unknown as FenceJson]){
    expect(await fails(apply(f,res('k1',{action:'quarantine_left',left_fact_id:r})))).toMatchObject({message:'fence_failed',code:'P0001'});
    expect(await fails(complete(f))).toMatchObject({message:'fence_failed'});
    expect(await fails(failM(f,'x'))).toMatchObject({message:'fence_failed'});
   }
   await expire(pair,cy,iss);
   expect(await fails(apply(fence,res('k1',{action:'quarantine_left',left_fact_id:r})))).toMatchObject({message:'fence_failed'});
   expect(await resultRows(pair)).toEqual([]);
   expect(await status(r)).toBe('ok');
   expect(await q(`select 1 from public.dq_quarantine where natural_key like $1`,[`${pair}:%`])).toEqual([]);
   expect(await cursor(pair,cy,iss)).toMatchObject({state:'claimed',attempts:1});
  });

  it('apply_reconcile_result: result row + mismatch item + quarantine + hook pending in one transaction; the same key again is reused; complete derives the counts (member_incomplete before); drc_done_accounted (S5)',async()=>{
   const {iss,r}=await published();const pair=newPair();const cy=await cycle(pair,[{issuer_id:iss,expected:3}]);
   const w=await batch(`reconcile.${pair}`);const fence=(await claimM(pair,cy,iss,w))!;
   const before=await rev(iss);
   const a=await apply(fence,res('k1',{action:'quarantine_left',left_fact_id:r}));
   expect(a).toMatchObject({reused:false,quarantined:1,materialize:{issuer_id:iss,market:'US'}});
   expect(await status(r)).toBe('quarantined');expect(await rev(iss)).toBe(before+1);
   const [row]=await q(`select dataset,natural_key,reason_code,status,batch_id,payload,detail from public.dq_quarantine where id=$1`,[a.item_id]);
   expect(row).toMatchObject({dataset:'facts.us',natural_key:`${pair}:k1:${r}`,reason_code:'reconcile_mismatch',status:'open',batch_id:w});
   expect(row.payload).toMatchObject({fact_ids:[r],left_value:'100',right_value:'99',right_locator:'ix:nonFraction#c1',
    key:{issuer_id:iss,market:'US',concept:'revenue',period_start:'2023-10-01',period_end:'2023-12-31',consolidation:'consolidated',unit:'USD',available_date:'2024-02-01'}});
   expect(row.detail).toMatchObject({pair,reconciliation_id:a.reconciliation_id,inputs_hash:'h1',issuer_id:iss,market:'US',latest_result:{passed:false,reconciliation_id:a.reconciliation_id,inputs_hash:'h1'},hook:{stage:'materialize',state:'pending'}});
   expect(await apply(fence,res('k1',{action:'quarantine_left',left_fact_id:r}))).toEqual({reused:true,reconciliation_id:a.reconciliation_id,item_id:a.item_id,quarantined:0,materialize:null});
   expect(await rev(iss)).toBe(before+1);
   expect(await fails(complete(fence))).toMatchObject({message:'member_incomplete'});
   await apply(fence,res('k2',{passed:true,right_value:'100',abs_diff:'0',rel_diff:'0'}));
   await apply(fence,res('k3',{outcome:'right_missing',left_value:'5',right_value:null,abs_diff:null,rel_diff:null}));
   expect(await complete(fence)).toEqual({compared_passed:1,compared_failed:1,not_compared:1});
   expect(await cursor(pair,cy,iss)).toMatchObject({state:'done',compared_passed:1,compared_failed:1,not_compared:1});
   expect((await resultRows(pair)).map(x=>[x.natural_key,x.outcome,x.passed,x.attempt,x.issuer_id,x.market,x.cycle_id,x.dataset,x.batch_id])).toEqual(
    ['k1','k2','k3'].map((k,i)=>[k,i===2?'right_missing':'compared',i===1,1,iss,'US',cy,`reconcile.${pair}`,w]));
   expect((await resultRows(pair))[0].item_id).toBe(a.item_id);
   expect(await fails(apply(fence,res('k4')))).toMatchObject({message:'fence_failed'});                   // done: the fence no longer holds
   await expect(q(`update public.dq_reconcile_cursor set compared_passed=null where pair=$1 and cycle_id=$2`,[pair,cy])).rejects.toMatchObject({code:'23514'});
  });

  it('apply_reconcile_result touches only the member\'s published ok rows; a quarantined left gets latest_result on its open items; review and lineage items change no visibility; invalid results write nothing',async()=>{
   const {iss,b,r0,r}=await published();const {x}=await sibling('5');
   const pair=newPair();const cy=await cycle(pair,[{issuer_id:iss,expected:8,keys:['k0','k1','k1m','k1p','k2','k3','k4','k5']}]);const w=await batch(`reconcile.${pair}`);const fence=(await claimM(pair,cy,iss,w))!;
--  else p_members [{issuer_id, market, expected_keys[]}] (distinct (issuer, market), keys resolved by the
--  runner) and p_pending [{issuer_id, market, source}] (the runner's snapshot; each entry's (issuer,
--  market) must be a member, i.e. its keys were resolved AFTER the merge was visible) are checked; the
--  cycle row (expected_total = Σ keys) and one pending cursor per member are inserted; exactly the
--  p_pending entries leave every cycle row's detail.pending_members (an entry registered after the
--  snapshot stays and joins the next cycle); the new row's detail records pending_merged_from /
--  pending_transferred. A writer that bypassed the lock hits the running partial unique index:
--  unique_violation → the winner is returned (created false). Lock order: advisory lock, then cursor
--  inserts (KEY SHARE on issuers via the FK), then cycle rows; set_merge takes the same advisory lock
--  FIRST, before its scope/issuer locks (plan audit R1) — so neither side holds a row the other needs
--  while waiting for the advisory lock; set_dissolved takes no advisory lock (one-way wait) — no cycle.
create or replace function public.open_reconcile_cycle(p_pair text, p_cycle_id text, p_started_at timestamptz, p_members jsonb, p_pending jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_row public.dq_reconcile_cycles; r record; v_keep jsonb; v_take jsonb; v_from text[] := '{}'; v_moved jsonb := '[]'::jsonb;
begin
  if p_pair is null or p_cycle_id is null or p_started_at is null then raise exception 'invalid_members' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('dq_reconcile_cycle:' || p_pair));
  select * into v_row from public.dq_reconcile_cycles where pair = p_pair and status = 'running';
  if found then return jsonb_build_object('created', false, 'cycle', to_jsonb(v_row), 'transferred', '[]'::jsonb); end if;
  if jsonb_typeof(p_members) is distinct from 'array' or jsonb_typeof(p_pending) is distinct from 'array'
     or exists (select 1 from jsonb_array_elements(p_members) m
                where jsonb_typeof(m) <> 'object' or (m ->> 'issuer_id') is null or coalesce(m ->> 'market', '') not in ('US', 'CN')
                   or jsonb_typeof(m -> 'expected_keys') is distinct from 'array')
     or exists (select 1 from jsonb_array_elements(p_members) m
                where exists (select 1 from jsonb_array_elements(case when jsonb_typeof(m -> 'expected_keys') = 'array' then m -> 'expected_keys' else '[]'::jsonb end) k
                              where (case jsonb_typeof(k) when 'object' then k ->> 'naturalKey' when 'string' then k #>> '{}' end) is null)
                   or (select count(*) from jsonb_array_elements(case when jsonb_typeof(m -> 'expected_keys') = 'array' then m -> 'expected_keys' else '[]'::jsonb end))
                      <> (select count(distinct (case jsonb_typeof(k) when 'object' then k ->> 'naturalKey' else k #>> '{}' end)) from jsonb_array_elements(case when jsonb_typeof(m -> 'expected_keys') = 'array' then m -> 'expected_keys' else '[]'::jsonb end) k))
     or (select count(*) from jsonb_array_elements(p_members))
        <> (select count(distinct (m ->> 'issuer_id', m ->> 'market')) from jsonb_array_elements(p_members) m)
     or exists (select 1 from jsonb_array_elements(p_pending) p
                where jsonb_typeof(p) <> 'object' or (p ->> 'source') is null
                   or not exists (select 1 from jsonb_array_elements(p_members) m
                                  where m ->> 'issuer_id' = p ->> 'issuer_id' and m ->> 'market' = p ->> 'market'))
  then raise exception 'invalid_members' using errcode = '22023'; end if;
  begin
    insert into public.dq_reconcile_cycles (pair, cycle_id, started_at, finished_at, members, status, expected_total, detail)
    values (p_pair, p_cycle_id, p_started_at, null, p_members, 'running',
            (select coalesce(sum(jsonb_array_length(m -> 'expected_keys')), 0) from jsonb_array_elements(p_members) m), '{}'::jsonb);
  exception when unique_violation then
    select * into v_row from public.dq_reconcile_cycles where pair = p_pair and status = 'running';
    if found then return jsonb_build_object('created', false, 'cycle', to_jsonb(v_row), 'transferred', '[]'::jsonb); end if;
    raise;
  end;
  insert into public.dq_reconcile_cursor (pair, cycle_id, issuer_id, market, expected)
  select p_pair, p_cycle_id, (m ->> 'issuer_id')::uuid, m ->> 'market', jsonb_array_length(m -> 'expected_keys')
  from jsonb_array_elements(p_members) m;
  for r in select c.cycle_id, c.detail from public.dq_reconcile_cycles c
           where c.pair = p_pair and c.cycle_id <> p_cycle_id and jsonb_typeof(c.detail -> 'pending_members') = 'array'
           order by c.cycle_id for update loop
    select coalesce(jsonb_agg(e) filter (where not (p_pending @> jsonb_build_array(e))), '[]'::jsonb),
           coalesce(jsonb_agg(e) filter (where p_pending @> jsonb_build_array(e)), '[]'::jsonb)
      into v_keep, v_take
    from jsonb_array_elements(r.detail -> 'pending_members') e;
    if jsonb_array_length(v_take) > 0 then
      update public.dq_reconcile_cycles
      set detail = jsonb_set(r.detail, '{pending_members}', v_keep) || jsonb_build_object('pending_consumed_by', p_cycle_id)
      where pair = p_pair and cycle_id = r.cycle_id;
      v_from := v_from || r.cycle_id::text; v_moved := v_moved || v_take;
    end if;
  end loop;
  update public.dq_reconcile_cycles
  set detail = jsonb_build_object('pending_merged_from', to_jsonb(v_from), 'pending_transferred', v_moved)
  where pair = p_pair and cycle_id = p_cycle_id
  returning * into v_row;
  return jsonb_build_object('created', true, 'cycle', to_jsonb(v_row), 'transferred', v_moved);
end $$;
revoke execute on function public.open_reconcile_cycle(text, text, timestamptz, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.open_reconcile_cycle(text, text, timestamptz, jsonb, jsonb) to service_role;
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
/bin/zsh -lc "sed -n '735,795p' src/lib/dq/dq-extensions.integration.test.ts; rg -n 'expected_keys|naturalKey' src/lib | grep -E 'reconcil|cycle' | head -65; sed -n '900,960p' supabase/migrations/20261107091000_facts_extensions.sql; ls .codex .claude 2>/dev/null" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 0ms:
   const pair=newPair();const cy=await cycle(pair,[{issuer_id:iss,expected:8,keys:['k0','k1','k1m','k1p','k2','k3','k4','k5']}]);const w=await batch(`reconcile.${pair}`);const fence=(await claimM(pair,cy,iss,w))!;
   expect(await fails(apply(fence,res('k0',{action:'quarantine_left',left_fact_id:x})))).toMatchObject({message:'invalid_result',code:'22023'});   // another issuer's row
   expect(await fails(apply(fence,res('k0',{action:'quarantine_left'})))).toMatchObject({message:'invalid_result'});      // left_fact_id required
   expect(await fails(apply(fence,res('k0',{action:'review_item'})))).toMatchObject({message:'invalid_result'});          // item required
   expect(await fails(apply(fence,res('k0',{left_value:'1e5x'})))).toMatchObject({message:'invalid_result'});
   expect(await resultRows(pair)).toEqual([]);
   const run2=await begin(iss,b);const g=await filing(run2);const [st]=await stage(run2,[{filing_id:g.id,concept:'net_income',value:'3'}]);
   expect(await apply(fence,res('k1',{action:'quarantine_left',left_fact_id:st}))).toMatchObject({quarantined:0,item_id:null,materialize:null});   // staged: recorded only
   expect(await status(st)).toBe('staged');
   // quarantine_left with passed=true or a non-compared outcome on an ok left row → result row only (接口对齐记录 #5)
   expect(await apply(fence,res('k1p',{action:'quarantine_left',left_fact_id:r,passed:true,right_value:'100',abs_diff:'0',rel_diff:'0'}))).toMatchObject({quarantined:0,item_id:null,materialize:null});
   expect(await apply(fence,res('k1m',{action:'quarantine_left',left_fact_id:r,outcome:'right_missing',right_value:null,abs_diff:null,rel_diff:null}))).toMatchObject({quarantined:0,item_id:null,materialize:null});
   expect(await status(r)).toBe('ok');
   const q1=await apply(fence,res('k2',{action:'quarantine_left',left_fact_id:r0}));
   const q2=await apply(fence,res('k3',{left_fact_id:r0,passed:true,right_value:'100',abs_diff:'0',rel_diff:'0',inputs_hash:'h9'}));
   expect(q2).toMatchObject({quarantined:0,item_id:q1.item_id,materialize:null});
   expect((await q(`select detail->'latest_result' lr from public.dq_quarantine where id=$1`,[q1.item_id]))[0].lr).toMatchObject({passed:true,reconciliation_id:q2.reconciliation_id,inputs_hash:'h9'});
   const rv=await apply(fence,res('k4',{action:'review_item',item:{natural_key:`${pair}:k4`,payload:{fact_ids:[r],left_value:'100',right_value:'99'}}}));
   const ln=await apply(fence,res('k5',{action:'lineage_item',item:{natural_key:`${iss}:revenue:2023-10-01:2023-12-31:consolidated:USD:2024-02-01`,payload:{fact_ids:[r],values:[]}}}));
   expect(await q(`select reason_code,status,dataset from public.dq_quarantine where id=any($1::uuid[]) order by reason_code`,[[rv.item_id,ln.item_id]])).toEqual([{reason_code:'lineage_conflict',status:'open',dataset:'facts.us'},{reason_code:'reconcile_review',status:'open',dataset:'facts.us'}]);
   expect(await status(r)).toBe('ok');
   const kinds=await q(`select natural_key,kind,outcome from public.dq_reconciliations where pair=$1 order by natural_key`,[pair]);
   expect(kinds.map(k=>k.natural_key)).toEqual(['k1','k1m','k1p','k2','k3','k4','k5']);
  });

  it('apply_reconcile_result holds the member scope lock: a concurrent publish_sync_run waits for it',async()=>{
   const {iss,b,r}=await published();const pair=newPair();const cy=await cycle(pair,[{issuer_id:iss,expected:1}]);
   const w=await batch(`reconcile.${pair}`);const fence=(await claimM(pair,cy,iss,w))!;
   const run2=await begin(iss,b);
   await inTx(admin,async({c,pid,commit})=>{
    await c.query(`select public.apply_reconcile_result($1::jsonb,$2::jsonb)`,[JSON.stringify(fence),JSON.stringify(res('k1',{action:'quarantine_left',left_fact_id:r}))]);
    const p=publish(run2,[]);p.catch(()=>{});
    await stillBlockedBehind(admin,pid,p);
    await commit();
    expect(await p).toBe(0);
   });
   expect(await rev(iss)).toBe(3);
  });

  it('T2: keys committed before the lease is lost stay valid; the successor reuses them; the old worker is fenced out; counts are not doubled',async()=>{
   const {iss,r}=await published();const pair=newPair();const cy=await cycle(pair,[{issuer_id:iss,expected:2}]);
   const wa=await batch(`reconcile.${pair}`),wb=await batch(`reconcile.${pair}`);
   const fa=(await claimM(pair,cy,iss,wa))!;
   const k1=await apply(fa,res('k1',{action:'quarantine_left',left_fact_id:r}));
   await expire(pair,cy,iss);
   const fb=(await claimM(pair,cy,iss,wb))!;expect(fb).toMatchObject({attempt:2,batch_id:wb});
   expect(await fails(apply(fa,res('k2',{passed:true})))).toMatchObject({message:'fence_failed'});
   expect(await fails(complete(fa))).toMatchObject({message:'fence_failed'});
   expect(await apply(fb,res('k1',{action:'quarantine_left',left_fact_id:r}))).toMatchObject({reused:true,reconciliation_id:k1.reconciliation_id,item_id:k1.item_id});
   await apply(fb,res('k2',{passed:true,right_value:'100',abs_diff:'0',rel_diff:'0'}));
   expect(await complete(fb)).toEqual({compared_passed:1,compared_failed:1,not_compared:0});
   expect((await resultRows(pair)).map(x=>[x.natural_key,x.attempt])).toEqual([['k1',1],['k2',2]]);
   expect(await q(`select count(*)::int n from public.dq_quarantine where natural_key=$1`,[`${pair}:k1:${r}`])).toEqual([{n:1}]);
  });

  it('a crash between apply_reconcile_result and materialisation leaves the item open with hook pending (picked up by --pending-hooks, Task 11)',async()=>{
   const {iss,r}=await published();const pair=newPair();const cy=await cycle(pair,[{issuer_id:iss,expected:1}]);
   const w=await batch(`reconcile.${pair}`);const fence=(await claimM(pair,cy,iss,w))!;
   const a=await apply(fence,res('k1',{action:'quarantine_left',left_fact_id:r}));   // committed; the "runner" dies here
   expect(await q(`select status,detail->'hook'->>'state' hook,detail->>'issuer_id' issuer from public.dq_quarantine where id=$1`,[a.item_id])).toEqual([{status:'open',hook:'pending',issuer:iss}]);
  });
src/lib/entities/identifiers/apply.ts:86:  }catch(e){errors.push({code:'reconciliation_error',key:r.naturalKey,message:errorMessage(e)});}
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
  if v_action = 'quarantine_left' and f.status = 'ok' and v_run = 'published'
     and p_result ->> 'outcome' = 'compared' and (p_result -> 'passed') = 'false'::jsonb then
    v_nk_item := c.pair || ':' || v_nk || ':' || v_left::text;
    if length(v_nk_item) > 512 then raise exception 'invalid_result' using errcode = '22023'; end if;
    select q.id into v_item from public.dq_quarantine q
    where q.dataset = v_dataset and q.table_name = 'financial_facts' and q.natural_key = v_nk_item and q.reason_code = 'reconcile_mismatch' and q.status = 'open'
    for update;
    if v_item is null then
      v_item := gen_random_uuid();
      insert into public.dq_quarantine (id, dataset, table_name, natural_key, reason_code, detail, payload, batch_id, status)
      values (v_item, v_dataset, 'financial_facts', v_nk_item, 'reconcile_mismatch',
              jsonb_build_object('pair', c.pair, 'reconciliation_id', v_rid, 'inputs_hash', coalesce(p_result -> 'inputs_hash', 'null'::jsonb), 'latest_result', v_latest,
                                 'issuer_id', c.issuer_id, 'market', c.market, 'hook', jsonb_build_object('stage', 'materialize', 'state', 'pending', 'at', to_jsonb(v_now))),
              jsonb_build_object('key', jsonb_build_object('issuer_id', f.issuer_id, 'market', f.market, 'concept', f.concept, 'period_start', f.period_start, 'period_end', f.period_end,
.claude:
agents
launch.json
scratch

codex
The frozen-key lookup introduces a UUID representation mismatch that prevents validly created members from processing or completing. The remaining changes appear consistent with the intended coverage and comparison checks.

Review comment:

- [P2] Compare frozen member issuer IDs as UUIDs — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/supabase/migrations/20261107091000_facts_extensions.sql:811-811
  When `open_reconcile_cycle` receives a valid uppercase or otherwise noncanonical UUID string, it preserves that spelling in `members` while casting the cursor's issuer ID to `uuid`. This text comparison then fails against PostgreSQL's canonical UUID spelling, so `reconcile_frozen_keys` returns null and every result application fails with `invalid_result` (and completion with `member_incomplete`). Compare the stored issuer ID as a UUID, or normalize it when creating the cycle.
The frozen-key lookup introduces a UUID representation mismatch that prevents validly created members from processing or completing. The remaining changes appear consistent with the intended coverage and comparison checks.

Review comment:

- [P2] Compare frozen member issuer IDs as UUIDs — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/supabase/migrations/20261107091000_facts_extensions.sql:811-811
  When `open_reconcile_cycle` receives a valid uppercase or otherwise noncanonical UUID string, it preserves that spelling in `members` while casting the cursor's issuer ID to `uuid`. This text comparison then fails against PostgreSQL's canonical UUID spelling, so `reconcile_frozen_keys` returns null and every result application fails with `invalid_result` (and completion with `member_incomplete`). Compare the stored issuer ID as a UUID, or normalize it when creating the cycle.

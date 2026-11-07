OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b06f-2365-7fb1-9cae-0b5ef58b03e2
--------
user
commit 6917afa
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 6917afa; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 429ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-PG2Veujm' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-KfYa0c32' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/8c-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/8c-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/8c-review-fix2.md
?? docs/audits/2026-11-05-data-foundation-3/codex/8c-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-Ve1jd1xN' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-P5Ut7qUS' (errno=Operation not permitted)
6917afa fix(dq): 8c round 2 — canonical uuid members, mismatch item on quarantined left, cycle-wide key uniqueness, item-key lock
 src/lib/dq/dq-extensions.integration.test.ts       | 64 ++++++++++++++++--
 supabase/migrations.lock.json                      |  2 +-
 .../migrations/20261107091000_facts_extensions.sql | 75 ++++++++++++++--------
 3 files changed, 108 insertions(+), 33 deletions(-)

exec
/bin/zsh -lc 'pwd; for d in /Volumes /Volumes/AIMATE_WORK /Volumes/AIMATE_WORK/Developer /Volumes/AIMATE_WORK/Developer/CodeX /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees "$PWD"; do for n in AGENTS.override.md AGENTS.md; do if [ -f "$d/$n" ]; then echo ==== $d/$n; cat "$d/$n"; fi; done; done; git show 6917afa --' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
zsh:1: === not found

exec
/bin/zsh -lc 'for d in /Volumes /Volumes/AIMATE_WORK /Volumes/AIMATE_WORK/Developer /Volumes/AIMATE_WORK/Developer/CodeX /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees "$PWD"; do for n in AGENTS.override.md AGENTS.md; do if [ -f "$d/$n" ]; then printf '"'\\n%s\\n' \""'$d/$n"; cat "$d/$n"; fi; done; done; git show 6917afa --' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:

/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-rQzclrc2' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-D2qh415Y' (errno=Operation not permitted)
commit 6917afa7b752d423a5bcef43a4934d67b179e54b
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 02:37:03 2026 -0800

    fix(dq): 8c round 2 — canonical uuid members, mismatch item on quarantined left, cycle-wide key uniqueness, item-key lock
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/dq/dq-extensions.integration.test.ts b/src/lib/dq/dq-extensions.integration.test.ts
index 902f263..7f6cb74 100644
--- a/src/lib/dq/dq-extensions.integration.test.ts
+++ b/src/lib/dq/dq-extensions.integration.test.ts
@@ -762,13 +762,14 @@ describe.skipIf(!enabled)('F3-4 facts extensions migration on real PostgreSQL',(
    const w=await batch(`reconcile.${pair}`);const fence=(await claimM(pair,cy,iss,w))!;
    const run2=await begin(iss,b);
    await inTx(admin,async({c,pid,commit})=>{
-    await c.query(`select public.apply_reconcile_result($1::jsonb,$2::jsonb)`,[JSON.stringify(fence),JSON.stringify(res('k1',{action:'quarantine_left',left_fact_id:r}))]);
+    // 'record' with a left row writes no scope row: only the explicit scope lock can make the publish wait
+    await c.query(`select public.apply_reconcile_result($1::jsonb,$2::jsonb)`,[JSON.stringify(fence),JSON.stringify(res('k1',{action:'record',left_fact_id:r,passed:true,right_value:'100',abs_diff:'0',rel_diff:'0'}))]);
     const p=publish(run2,[]);p.catch(()=>{});
     await stillBlockedBehind(admin,pid,p);
     await commit();
     expect(await p).toBe(0);
    });
-   expect(await rev(iss)).toBe(3);
+   expect(await rev(iss)).toBe(2);                                            // the publish only; apply bumped nothing
   });
 
   it('T2: keys committed before the lease is lost stay valid; the successor reuses them; the old worker is fenced out; counts are not doubled',async()=>{
@@ -800,9 +801,11 @@ describe.skipIf(!enabled)('F3-4 facts extensions migration on real PostgreSQL',(
    const w=await batch(`reconcile.${pair}`);const fence=(await claimM(pair,cy,iss,w))!;
    // a row of an unrelated issuer is refused for the fence member
    expect(await fails(apply(fence,res('kx',{action:'quarantine_left',left_fact_id:x})))).toMatchObject({message:'invalid_result'});
-   // a member merged INTO the fence issuer is still another issuer's row: refused as well
-   await merge(src,iss,by);
-   expect(await fails(apply(fence,res('km',{action:'quarantine_left',left_fact_id:x})))).toMatchObject({message:'invalid_result'});
+   // a member merged INTO the fence issuer is still another issuer's row: refused as well (rolled-back transaction: no topology left behind)
+   await inRolledBackTx(admin,async c=>{
+    await c.query(`select public.set_merge($1,$2,$3)`,[src,iss,by]);
+    expect(await fails(c.query(`select public.apply_reconcile_result($1::jsonb,$2::jsonb)`,[JSON.stringify(fence),JSON.stringify(res('km',{action:'quarantine_left',left_fact_id:x}))]))).toMatchObject({message:'invalid_result'});
+   },1);
    expect(await status(x)).toBe('ok');
    const a=await apply(fence,res('k1',{action:'quarantine_left',left_fact_id:r}));
    const [row]=await q(`select payload,detail from public.dq_quarantine where id=$1`,[a.item_id]);
@@ -844,6 +847,57 @@ describe.skipIf(!enabled)('F3-4 facts extensions migration on real PostgreSQL',(
    expect(await lr()).toMatchObject({passed:true,inputs_hash:'h2'});         // passing evidence not overwritten
   });
 
+  it('a failing compare on a left row already quarantined for another reason still opens the reconcile_mismatch item (no visibility change) and generic promotion stays blocked',async()=>{
+   const {iss,r}=await published();const pair=newPair();const cy=await cycle(pair,[{issuer_id:iss,expected:1}]);
+   const w=await batch(`reconcile.${pair}`);const fence=(await claimM(pair,cy,iss,w))!;
+   await q(`update public.financial_facts set status='quarantined' where fact_id=$1`,[r]);     // quarantined by something else
+   const before=await rev(iss);
+   const a=await apply(fence,res('k1',{action:'quarantine_left',left_fact_id:r}));
+   expect(a).toMatchObject({reused:false,quarantined:0,materialize:null});
+   expect(a.item_id).toBeTruthy();
+   const [row]=await q(`select reason_code,status,payload,detail from public.dq_quarantine where id=$1`,[a.item_id]);
+   expect(row).toMatchObject({reason_code:'reconcile_mismatch',status:'open'});
+   expect(row.payload.fact_ids).toEqual([r]);
+   expect(row.detail.latest_result).toMatchObject({passed:false});
+   expect(row.detail.hook).toBeUndefined();
+   expect(await rev(iss)).toBe(before);
+   expect(await one(`select public.promote_quarantined($1,'US',$2::uuid[]) v`,[iss,[r]])).toBe(0);
+   expect(await status(r)).toBe('quarantined');
+  });
+
+  it('two members creating the same review item key serialise: the second reuses the open item (no unique violation)',async()=>{
+   const {iss:a1}=await published();const {iss:a2}=await published();const pair=newPair();
+   const cy=await cycle(pair,[{issuer_id:a1,expected:1,keys:['kA']},{issuer_id:a2,expected:1,keys:['kB']}]);
+   const w1=await batch(`reconcile.${pair}`),w2=await batch(`reconcile.${pair}`);
+   const f1=(await claimM(pair,cy,a1,w1))!,f2=(await claimM(pair,cy,a2,w2))!;
+   const nk=`${pair}:shared-item`;
+   const mk=(key:string)=>res(key,{action:'review_item',item:{natural_key:nk,payload:{fact_ids:[],values:[]}}});
+   let second:Promise<any>|undefined;let first:any;
+   await inTx(admin,async({c,pid,commit})=>{
+    first=(await c.query(`select public.apply_reconcile_result($1::jsonb,$2::jsonb) v`,[JSON.stringify(f1),JSON.stringify(mk('kA'))])).rows[0].v;
+    second=apply(f2,mk('kB'));second.catch(()=>{});
+    await stillBlockedBehind(admin,pid,second);
+    await commit();
+   });
+   const sec=await second!;
+   expect(sec.item_id).toBe(first.item_id);
+   expect(await q(`select count(*)::int n from public.dq_quarantine where natural_key=$1 and status='open'`,[nk])).toEqual([{n:1}]);
+  });
+
+  it('open_reconcile_cycle freezes issuer_id as canonical uuid text (upper-case input works end to end); a non-uuid issuer_id and a natural key repeated across members are invalid_members',async()=>{
+   const {iss}=await published();const pair=newPair();const cy=`${pair}-c`;
+   const out=await openC(admin,pair,cy,[{issuer_id:iss.toUpperCase(),market:'US',expected_keys:[{naturalKey:'k1',locator:{}}]}],[]);
+   expect(out.cycle.members).toEqual([{issuer_id:iss,market:'US',expected_keys:[{naturalKey:'k1',locator:{}}]}]);
+   const w=await batch(`reconcile.${pair}`);const fence=(await claimM(pair,cy,iss,w))!;
+   expect(await apply(fence,res('k1',{passed:true,right_value:'100',abs_diff:'0',rel_diff:'0'}))).toMatchObject({reused:false});
+   expect(await complete(fence)).toEqual({compared_passed:1,compared_failed:0,not_compared:0});
+   const p2=newPair(),other=await issuer();
+   expect(await fails(openC(admin,p2,`${p2}-x`,[{issuer_id:'not-a-uuid',market:'US',expected_keys:[]}],[]))).toMatchObject({message:'invalid_members'});
+   expect(await fails(openC(admin,p2,`${p2}-x`,[{issuer_id:iss,market:'US',expected_keys:[]},{issuer_id:iss.toUpperCase(),market:'US',expected_keys:[]}],[]))).toMatchObject({message:'invalid_members'});
+   expect(await fails(openC(admin,p2,`${p2}-x`,[{issuer_id:iss,market:'US',expected_keys:[{naturalKey:'dup',locator:{}}]},{issuer_id:other,market:'US',expected_keys:['dup']}],[]))).toMatchObject({message:'invalid_members'});
+   expect(await q(`select 1 from public.dq_reconcile_cycles where pair=$1`,[p2])).toEqual([]);
+  });
+
   // ---- open_reconcile_cycle (section 13, plan audit Q2): atomic creation, per-entry consumption, the lock shared with set_merge
   type Opened={created:boolean;cycle:Record<string,any>;transferred:unknown[]};
   const openC=(c:Pool|PoolClient,pair:string,id:string,members:unknown[],pending:unknown[])=>
diff --git a/supabase/migrations.lock.json b/supabase/migrations.lock.json
index f65b9c5..766be6c 100644
--- a/supabase/migrations.lock.json
+++ b/supabase/migrations.lock.json
@@ -207,7 +207,7 @@
     },
     {
       "file": "20261107091000_facts_extensions.sql",
-      "sha256": "d1827381ed1ddbf56da4d93618c80ac7987f3602ec57143f3488371d02853e3c"
+      "sha256": "68fa70515220a4e0b7f0d760efea56ac58f66109d9129bd9d6267da8469de145"
     }
   ]
 }
diff --git a/supabase/migrations/20261107091000_facts_extensions.sql b/supabase/migrations/20261107091000_facts_extensions.sql
index fe09a24..31879c6 100644
--- a/supabase/migrations/20261107091000_facts_extensions.sql
+++ b/supabase/migrations/20261107091000_facts_extensions.sql
@@ -17,8 +17,12 @@
 --     and restore the previous value on every path (normal return and exception handler, S1).
 --  (8b) fact_promote_rows predicates; adopt_candidate; restore_reconciled; resolve_lineage_conflict.
 --  (8c) reconcile cursor claim/complete/fail and apply_reconcile_result.
--- Lock order everywhere: reconcile cursor row (fenced calls) → fact_sync_scope rows ordered by
--- (issuer_id, market) → issuers rows → dq_quarantine rows → fact rows → dq_reconcile_cycles row (last).
+-- Lock order everywhere: the pair's cycle advisory lock first (set_merge, open_reconcile_cycle: any
+-- function taking a dq_reconcile_cycle:* advisory lock takes it before every row lock) → reconcile
+-- cursor row (fenced calls) → fact_sync_scope rows ordered by (issuer_id, market) → issuers rows →
+-- dq_quarantine rows (apply_reconcile_result also takes a per-item-key advisory lock just before it
+-- creates a review / lineage item; it holds no other member's row) → fact rows → dq_reconcile_cycles
+-- row (last).
 -- Errors carry the code as the message: verdict / fence codes P0001; invalid_* 22023; triggers 23514.
 -- The hosted postgres role is not a superuser: functions keep the migration role as owner, set
 -- search_path = public and qualify every relation. Every function is followed by an explicit
@@ -808,7 +812,8 @@ returns text[] language sql stable security definer set search_path = public as
   select (select coalesce(array_agg(case jsonb_typeof(k) when 'object' then k ->> 'naturalKey' else k #>> '{}' end), '{}'::text[])
           from jsonb_array_elements(m -> 'expected_keys') k)
   from public.dq_reconcile_cycles y, jsonb_array_elements(y.members) m
-  where y.pair = p_pair and y.cycle_id = p_cycle_id and m ->> 'issuer_id' = p_issuer::text and m ->> 'market' = p_market
+  where y.pair = p_pair and y.cycle_id = p_cycle_id
+    and (case when m ->> 'issuer_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (m ->> 'issuer_id')::uuid end) = p_issuer and m ->> 'market' = p_market
     and jsonb_typeof(m -> 'expected_keys') = 'array'
   limit 1
 $$;
@@ -879,8 +884,8 @@ grant execute on function public.fail_reconcile_member(jsonb, text) to service_r
 -- fence check → (pair, cycle_id, natural_key) already accepted → that row is returned (reused,
 -- nothing written) → else, by action:
 --  quarantine_left (left_fact_id of the fence member required; any outcome / passed — 接口对齐记录 #5):
---   QUARANTINES only when outcome = 'compared' AND passed = false AND the left row is ok and its run
---   published: under the member's scope lock, open reconcile_mismatch
+--   opens the item only when outcome = 'compared' AND passed = false AND the left row is ok or already
+--   quarantined (another reason) and its run published; only an ok row is quarantined by it: under the member's scope lock, open reconcile_mismatch
 --   item (reused by natural key <pair>:<natural_key>:<fact_id>) with payload {key, fact_ids,
 --   left_value, right_value, right_locator} and detail {pair, reconciliation_id, inputs_hash,
 --   latest_result, issuer_id, market, hook pending}; the row → quarantined; state_rev + 1;
@@ -944,7 +949,10 @@ begin
     if not found or f.issuer_id <> c.issuer_id or f.market <> c.market then raise exception 'invalid_result' using errcode = '22023'; end if;
     select r.status into v_run from public.fact_sync_runs r where r.run_id = f.run_id;
   end if;
-  if v_action = 'quarantine_left' and f.status = 'ok' and v_run = 'published'
+  -- a failing compare on a published left row that is ok OR already quarantined (for another reason, with no
+  -- open item of this pair yet) opens the reconcile_mismatch item, so fact_promote_rows blocks a later generic
+  -- promotion; only an ok row changes visibility (status, state_rev, hook, materialize).
+  if v_action = 'quarantine_left' and f.status in ('ok', 'quarantined') and v_run = 'published'
      and p_result ->> 'outcome' = 'compared' and (p_result -> 'passed') = 'false'::jsonb then
     v_nk_item := c.pair || ':' || v_nk || ':' || v_left::text;
     if length(v_nk_item) > 512 then raise exception 'invalid_result' using errcode = '22023'; end if;
@@ -956,7 +964,8 @@ begin
       insert into public.dq_quarantine (id, dataset, table_name, natural_key, reason_code, detail, payload, batch_id, status)
       values (v_item, v_dataset, 'financial_facts', v_nk_item, 'reconcile_mismatch',
               jsonb_build_object('pair', c.pair, 'reconciliation_id', v_rid, 'inputs_hash', coalesce(p_result -> 'inputs_hash', 'null'::jsonb), 'latest_result', v_latest,
-                                 'issuer_id', c.issuer_id, 'market', c.market, 'hook', jsonb_build_object('stage', 'materialize', 'state', 'pending', 'at', to_jsonb(v_now))),
+                                 'issuer_id', c.issuer_id, 'market', c.market)
+                || case when f.status = 'ok' then jsonb_build_object('hook', jsonb_build_object('stage', 'materialize', 'state', 'pending', 'at', to_jsonb(v_now))) else '{}'::jsonb end,
               jsonb_build_object('key', jsonb_build_object('issuer_id', f.issuer_id, 'market', f.market, 'concept', f.concept, 'period_start', f.period_start, 'period_end', f.period_end,
                                                            'consolidation', f.consolidation, 'unit', f.unit, 'available_date', f.available_date),
                                  'fact_ids', jsonb_build_array(v_left), 'left_value', coalesce(p_result -> 'left_value', 'null'::jsonb), 'right_value', coalesce(p_result -> 'right_value', 'null'::jsonb),
@@ -964,13 +973,16 @@ begin
               c.claimed_by, 'open');
     else
       update public.dq_quarantine
-      set detail = detail || jsonb_build_object('reconciliation_id', v_rid, 'latest_result', v_latest, 'hook', jsonb_build_object('stage', 'materialize', 'state', 'pending', 'at', to_jsonb(v_now)))
+      set detail = detail || jsonb_build_object('reconciliation_id', v_rid, 'latest_result', v_latest)
+        || case when f.status = 'ok' then jsonb_build_object('hook', jsonb_build_object('stage', 'materialize', 'state', 'pending', 'at', to_jsonb(v_now))) else '{}'::jsonb end
       where id = v_item;
     end if;
-    update public.financial_facts set status = 'quarantined' where fact_id = v_left and status = 'ok';
-    v_q := 1;
-    update public.fact_sync_scope set state_rev = state_rev + 1, updated_at = now() where issuer_id = c.issuer_id and market = c.market;
-    v_mat := jsonb_build_object('issuer_id', c.issuer_id, 'market', c.market);
+    if f.status = 'ok' then
+      update public.financial_facts set status = 'quarantined' where fact_id = v_left and status = 'ok';
+      v_q := 1;
+      update public.fact_sync_scope set state_rev = state_rev + 1, updated_at = now() where issuer_id = c.issuer_id and market = c.market;
+      v_mat := jsonb_build_object('issuer_id', c.issuer_id, 'market', c.market);
+    end if;
   elsif v_left is not null and f.status = 'quarantined' and p_result ->> 'outcome' = 'compared' then
     with upd as (
       update public.dq_quarantine q set detail = q.detail || jsonb_build_object('latest_result', v_latest)
@@ -981,6 +993,8 @@ begin
   end if;
   if v_action in ('review_item','lineage_item') then
     v_reason := case v_action when 'review_item' then 'reconcile_review' else 'lineage_conflict' end;
+    -- two members creating the same item key serialise here, the second reuses the open item (no 23505 on the open-key index)
+    perform pg_advisory_xact_lock(hashtext('dq_item:' || v_dataset || ':' || v_reason || ':' || (p_result -> 'item' ->> 'natural_key')));
     select q.id into v_item from public.dq_quarantine q
     where q.dataset = v_dataset and q.table_name = 'financial_facts' and q.natural_key = p_result -> 'item' ->> 'natural_key' and q.reason_code = v_reason and q.status = 'open';
     if v_item is null then
@@ -1020,7 +1034,7 @@ grant execute on function public.apply_reconcile_result(jsonb, jsonb) to service
 --  while waiting for the advisory lock; set_dissolved takes no advisory lock (one-way wait) — no cycle.
 create or replace function public.open_reconcile_cycle(p_pair text, p_cycle_id text, p_started_at timestamptz, p_members jsonb, p_pending jsonb)
 returns jsonb language plpgsql security definer set search_path = public as $$
-declare v_row public.dq_reconcile_cycles; r record; v_keep jsonb; v_take jsonb; v_from text[] := '{}'; v_moved jsonb := '[]'::jsonb;
+declare v_row public.dq_reconcile_cycles; r record; v_members jsonb; v_keep jsonb; v_take jsonb; v_from text[] := '{}'; v_moved jsonb := '[]'::jsonb;
 begin
   if p_pair is null or p_cycle_id is null or p_started_at is null then raise exception 'invalid_members' using errcode = '22023'; end if;
   perform pg_advisory_xact_lock(hashtext('dq_reconcile_cycle:' || p_pair));
@@ -1028,24 +1042,31 @@ begin
   if found then return jsonb_build_object('created', false, 'cycle', to_jsonb(v_row), 'transferred', '[]'::jsonb); end if;
   if jsonb_typeof(p_members) is distinct from 'array' or jsonb_typeof(p_pending) is distinct from 'array'
      or exists (select 1 from jsonb_array_elements(p_members) m
-                where jsonb_typeof(m) <> 'object' or (m ->> 'issuer_id') is null or coalesce(m ->> 'market', '') not in ('US', 'CN')
+                where jsonb_typeof(m) <> 'object' or coalesce(m ->> 'issuer_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
+                   or coalesce(m ->> 'market', '') not in ('US', 'CN')
                    or jsonb_typeof(m -> 'expected_keys') is distinct from 'array')
-     or exists (select 1 from jsonb_array_elements(p_members) m
-                where exists (select 1 from jsonb_array_elements(case when jsonb_typeof(m -> 'expected_keys') = 'array' then m -> 'expected_keys' else '[]'::jsonb end) k
-                              where (case jsonb_typeof(k) when 'object' then k ->> 'naturalKey' when 'string' then k #>> '{}' end) is null)
-                   or (select count(*) from jsonb_array_elements(case when jsonb_typeof(m -> 'expected_keys') = 'array' then m -> 'expected_keys' else '[]'::jsonb end))
-                      <> (select count(distinct (case jsonb_typeof(k) when 'object' then k ->> 'naturalKey' else k #>> '{}' end)) from jsonb_array_elements(case when jsonb_typeof(m -> 'expected_keys') = 'array' then m -> 'expected_keys' else '[]'::jsonb end) k))
-     or (select count(*) from jsonb_array_elements(p_members))
-        <> (select count(distinct (m ->> 'issuer_id', m ->> 'market')) from jsonb_array_elements(p_members) m)
+     or exists (select 1 from jsonb_array_elements(p_pending) p where jsonb_typeof(p) <> 'object' or (p ->> 'source') is null)
+  then raise exception 'invalid_members' using errcode = '22023'; end if;
+  -- freeze issuer_id as canonical (lower-case) uuid text
+  select coalesce(jsonb_agg(jsonb_set(m, '{issuer_id}', to_jsonb(((m ->> 'issuer_id')::uuid)::text)) order by o), '[]'::jsonb)
+    into v_members from jsonb_array_elements(p_members) with ordinality as t(m, o);
+  if exists (select 1 from jsonb_array_elements(v_members) m
+             where exists (select 1 from jsonb_array_elements(m -> 'expected_keys') k
+                           where (case jsonb_typeof(k) when 'object' then k ->> 'naturalKey' when 'string' then k #>> '{}' end) is null))
+     or (select count(*) from jsonb_array_elements(v_members))
+        <> (select count(distinct (m ->> 'issuer_id', m ->> 'market')) from jsonb_array_elements(v_members) m)
+     -- natural keys are unique across the whole cycle: results are accepted per (pair, cycle, natural_key)
+     or (select count(*) from jsonb_array_elements(v_members) m, jsonb_array_elements(m -> 'expected_keys') k)
+        <> (select count(distinct (case jsonb_typeof(k) when 'object' then k ->> 'naturalKey' else k #>> '{}' end))
+            from jsonb_array_elements(v_members) m, jsonb_array_elements(m -> 'expected_keys') k)
      or exists (select 1 from jsonb_array_elements(p_pending) p
-                where jsonb_typeof(p) <> 'object' or (p ->> 'source') is null
-                   or not exists (select 1 from jsonb_array_elements(p_members) m
-                                  where m ->> 'issuer_id' = p ->> 'issuer_id' and m ->> 'market' = p ->> 'market'))
+                where not exists (select 1 from jsonb_array_elements(v_members) m
+                                  where m ->> 'issuer_id' = lower(p ->> 'issuer_id') and m ->> 'market' = p ->> 'market'))
   then raise exception 'invalid_members' using errcode = '22023'; end if;
   begin
     insert into public.dq_reconcile_cycles (pair, cycle_id, started_at, finished_at, members, status, expected_total, detail)
-    values (p_pair, p_cycle_id, p_started_at, null, p_members, 'running',
-            (select coalesce(sum(jsonb_array_length(m -> 'expected_keys')), 0) from jsonb_array_elements(p_members) m), '{}'::jsonb);
+    values (p_pair, p_cycle_id, p_started_at, null, v_members, 'running',
+            (select coalesce(sum(jsonb_array_length(m -> 'expected_keys')), 0) from jsonb_array_elements(v_members) m), '{}'::jsonb);
   exception when unique_violation then
     select * into v_row from public.dq_reconcile_cycles where pair = p_pair and status = 'running';
     if found then return jsonb_build_object('created', false, 'cycle', to_jsonb(v_row), 'transferred', '[]'::jsonb); end if;
@@ -1053,7 +1074,7 @@ begin
   end;
   insert into public.dq_reconcile_cursor (pair, cycle_id, issuer_id, market, expected)
   select p_pair, p_cycle_id, (m ->> 'issuer_id')::uuid, m ->> 'market', jsonb_array_length(m -> 'expected_keys')
-  from jsonb_array_elements(p_members) m;
+  from jsonb_array_elements(v_members) m;
   for r in select c.cycle_id, c.detail from public.dq_reconcile_cycles c
            where c.pair = p_pair and c.cycle_id <> p_cycle_id and jsonb_typeof(c.detail -> 'pending_members') = 'array'
            order by c.cycle_id for update loop

exec
/bin/zsh -lc "sed -n '900,1030p' supabase/migrations/20261107091000_facts_extensions.sql; sed -n '1070,1120p' supabase/migrations/20261107091000_facts_extensions.sql; rg -n 'restore_reconciled|latest_result|reconcile_mismatch' supabase/migrations/20261107091000_facts_extensions.sql; find . -name '*AGENTS*' -o -name CLAUDE.md" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 60ms:
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
  if v_action = 'quarantine_left' and f.status in ('ok', 'quarantined') and v_run = 'published'
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
                                 'issuer_id', c.issuer_id, 'market', c.market)
                || case when f.status = 'ok' then jsonb_build_object('hook', jsonb_build_object('stage', 'materialize', 'state', 'pending', 'at', to_jsonb(v_now))) else '{}'::jsonb end,
              jsonb_build_object('key', jsonb_build_object('issuer_id', f.issuer_id, 'market', f.market, 'concept', f.concept, 'period_start', f.period_start, 'period_end', f.period_end,
                                                           'consolidation', f.consolidation, 'unit', f.unit, 'available_date', f.available_date),
                                 'fact_ids', jsonb_build_array(v_left), 'left_value', coalesce(p_result -> 'left_value', 'null'::jsonb), 'right_value', coalesce(p_result -> 'right_value', 'null'::jsonb),
                                 'right_locator', coalesce(p_result -> 'detail' -> 'right' -> 'locator', 'null'::jsonb)),
              c.claimed_by, 'open');
    else
      update public.dq_quarantine
      set detail = detail || jsonb_build_object('reconciliation_id', v_rid, 'latest_result', v_latest)
        || case when f.status = 'ok' then jsonb_build_object('hook', jsonb_build_object('stage', 'materialize', 'state', 'pending', 'at', to_jsonb(v_now))) else '{}'::jsonb end
      where id = v_item;
    end if;
    if f.status = 'ok' then
      update public.financial_facts set status = 'quarantined' where fact_id = v_left and status = 'ok';
      v_q := 1;
      update public.fact_sync_scope set state_rev = state_rev + 1, updated_at = now() where issuer_id = c.issuer_id and market = c.market;
      v_mat := jsonb_build_object('issuer_id', c.issuer_id, 'market', c.market);
    end if;
  elsif v_left is not null and f.status = 'quarantined' and p_result ->> 'outcome' = 'compared' then
    with upd as (
      update public.dq_quarantine q set detail = q.detail || jsonb_build_object('latest_result', v_latest)
      where q.table_name = 'financial_facts' and q.reason_code = 'reconcile_mismatch' and q.status = 'open' and q.detail ->> 'pair' = c.pair
        and jsonb_typeof(q.payload -> 'fact_ids') = 'array' and q.payload -> 'fact_ids' ? v_left::text
      returning q.id)
    select upd.id into v_item from upd order by upd.id limit 1;
  end if;
  if v_action in ('review_item','lineage_item') then
    v_reason := case v_action when 'review_item' then 'reconcile_review' else 'lineage_conflict' end;
    -- two members creating the same item key serialise here, the second reuses the open item (no 23505 on the open-key index)
    perform pg_advisory_xact_lock(hashtext('dq_item:' || v_dataset || ':' || v_reason || ':' || (p_result -> 'item' ->> 'natural_key')));
    select q.id into v_item from public.dq_quarantine q
    where q.dataset = v_dataset and q.table_name = 'financial_facts' and q.natural_key = p_result -> 'item' ->> 'natural_key' and q.reason_code = v_reason and q.status = 'open';
    if v_item is null then
      v_item := gen_random_uuid();
      insert into public.dq_quarantine (id, dataset, table_name, natural_key, reason_code, detail, payload, batch_id, status)
      values (v_item, v_dataset, 'financial_facts', p_result -> 'item' ->> 'natural_key', v_reason,
              (case when jsonb_typeof(p_result -> 'item' -> 'detail') = 'object' then p_result -> 'item' -> 'detail' else '{}'::jsonb end)
                || jsonb_build_object('pair', c.pair, 'reconciliation_id', v_rid, 'issuer_id', c.issuer_id, 'market', c.market),
              p_result -> 'item' -> 'payload', c.claimed_by, 'open');
    end if;
  end if;
  insert into public.dq_reconciliations (id, dataset, left_source, right_source, natural_key, left_value, right_value, abs_diff, rel_diff, tolerance, passed, batch_id,
                                         pair, kind, outcome, detail, cycle_id, issuer_id, market, attempt)
  values (v_rid, 'reconcile.' || c.pair, p_result ->> 'left_source', p_result ->> 'right_source', v_nk, v_lv, v_rv, v_ad, v_rd, v_tol, (p_result ->> 'passed')::boolean, c.claimed_by,
          c.pair, p_result ->> 'kind', p_result ->> 'outcome',
          (p_result -> 'detail') || jsonb_build_object('item_id', v_item, 'inputs_hash', coalesce(p_result -> 'inputs_hash', 'null'::jsonb)),
          c.cycle_id, c.issuer_id, c.market, c.attempts);
  return jsonb_build_object('reused', false, 'reconciliation_id', v_rid, 'item_id', v_item, 'quarantined', v_q, 'materialize', coalesce(v_mat, 'null'::jsonb));
end $$;
revoke execute on function public.apply_reconcile_result(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_reconcile_result(jsonb, jsonb) to service_role;

-- ---------------------------------------------------------------- 14. atomic cycle creation (spec §3.1, §5.5; plan audit Q2)
-- The only writer of new dq_reconcile_cycles rows. Under the pair's cycle lock — the advisory lock
-- set_merge takes right before it registers a pending member (section 8a) — in one transaction:
--  a running cycle of the pair → returned unchanged (created false, nothing consumed);
--  else p_members [{issuer_id, market, expected_keys[]}] (distinct (issuer, market), keys resolved by the
--  runner) and p_pending [{issuer_id, market, source}] (the runner's snapshot; each entry's (issuer,
--  market) must be a member, i.e. its keys were resolved AFTER the merge was visible) are checked; the
--  cycle row (expected_total = Σ keys) and one pending cursor per member are inserted; exactly the
--  p_pending entries leave every cycle row's detail.pending_members (an entry registered after the
--  snapshot stays and joins the next cycle); the new row's detail records pending_merged_from /
--  pending_transferred. A writer that bypassed the lock hits the running partial unique index:
  exception when unique_violation then
    select * into v_row from public.dq_reconcile_cycles where pair = p_pair and status = 'running';
    if found then return jsonb_build_object('created', false, 'cycle', to_jsonb(v_row), 'transferred', '[]'::jsonb); end if;
    raise;
  end;
  insert into public.dq_reconcile_cursor (pair, cycle_id, issuer_id, market, expected)
  select p_pair, p_cycle_id, (m ->> 'issuer_id')::uuid, m ->> 'market', jsonb_array_length(m -> 'expected_keys')
  from jsonb_array_elements(v_members) m;
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
18:--  (8b) fact_promote_rows predicates; adopt_candidate; restore_reconciled; resolve_lineage_conflict.
417:-- (detail.quarantined_fact_ids) — to detail.chosen_fact_ids; (b) a reconcile_mismatch that
418:-- references the row blocks unless it is resolved_accept with latest_result.passed = true (open,
420:-- restore_reconciled). Callers hold the scope lock (promote_quarantined, resolve_facts_quarantine,
421:-- restore_reconciled).
457:      where q.table_name = 'financial_facts' and q.reason_code = 'reconcile_mismatch'
459:        and (q.status <> 'resolved_accept' or (q.detail -> 'latest_result' -> 'passed') is distinct from 'true'::jsonb));
601:-- ---------------------------------------------------------------- 9. restore after a passing re-run (spec §3.2 restore_reconciled, §5.6, R1)
602:-- Open reconcile_mismatch only; p_batch running. Scope lock (issuer of the first member row by
603:-- fact_id, else detail.issuer_id/market), item re-read under it. latest_result.passed must be
604:-- true and latest_result.inputs_hash must equal p_inputs_hash_now (computed by the caller from the
609:create or replace function public.restore_reconciled(p_item uuid, p_batch uuid, p_inputs_hash_now text, p_resolved_by uuid)
615:  if not found or q.status <> 'open' or q.table_name <> 'financial_facts' or q.reason_code <> 'reconcile_mismatch' then
629:  if (q.detail -> 'latest_result' -> 'passed') is distinct from 'true'::jsonb
630:     or p_inputs_hash_now is null or (q.detail -> 'latest_result' ->> 'inputs_hash') is distinct from p_inputs_hash_now then
651:revoke execute on function public.restore_reconciled(uuid, uuid, text, uuid) from public, anon, authenticated;
652:grant execute on function public.restore_reconciled(uuid, uuid, text, uuid) to service_role;
726:-- The plan-2 body verbatim plus one guard: reconcile_mismatch and lineage_conflict items never close here.
734:  -- migration two: these two reasons close only through restore_reconciled / resolve_lineage_conflict
735:  if q.reason_code in ('reconcile_mismatch', 'lineage_conflict') then raise exception 'use_dedicated_resolver' using errcode = '22023'; end if;
888:--   quarantined (another reason) and its run published; only an ok row is quarantined by it: under the member's scope lock, open reconcile_mismatch
891:--   latest_result, issuer_id, market, hook pending}; the row → quarantined; state_rev + 1;
894:--   OPEN reconcile_mismatch items of this pair that reference it get detail.latest_result = {passed,
953:  -- open item of this pair yet) opens the reconcile_mismatch item, so fact_promote_rows blocks a later generic
960:    where q.dataset = v_dataset and q.table_name = 'financial_facts' and q.natural_key = v_nk_item and q.reason_code = 'reconcile_mismatch' and q.status = 'open'
965:      values (v_item, v_dataset, 'financial_facts', v_nk_item, 'reconcile_mismatch',
966:              jsonb_build_object('pair', c.pair, 'reconciliation_id', v_rid, 'inputs_hash', coalesce(p_result -> 'inputs_hash', 'null'::jsonb), 'latest_result', v_latest,
976:      set detail = detail || jsonb_build_object('reconciliation_id', v_rid, 'latest_result', v_latest)
988:      update public.dq_quarantine q set detail = q.detail || jsonb_build_object('latest_result', v_latest)
989:      where q.table_name = 'financial_facts' and q.reason_code = 'reconcile_mismatch' and q.status = 'open' and q.detail ->> 'pair' = c.pair

codex
No actionable regressions were identified in the commit. The SQL changes and added integration coverage are consistent with the intended fixes; database-backed tests were not executed in the read-only environment.
No actionable regressions were identified in the commit. The SQL changes and added integration coverage are consistent with the intended fixes; database-backed tests were not executed in the read-only environment.

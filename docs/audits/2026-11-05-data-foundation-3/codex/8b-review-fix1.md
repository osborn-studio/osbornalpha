OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b060-663e-7bf0-9c15-6f63ad264666
--------
user
commit f99e785
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline f99e785; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 498ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-lJT47XwG' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-sdW1r4fb' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/8b-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/8b-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/8b-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-iY63SZNy' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-lt4tOwLG' (errno=Operation not permitted)
f99e785 fix(facts): 8b review — generic resolver refuses reconcile/lineage items, adopt_candidate locks and checks the whole lineage, replay deadlock victim
 src/lib/dq/dq-extensions.integration.test.ts       | 73 +++++++++++++++++++++-
 src/lib/dq/dq-foundation.integration.test.ts       |  2 +-
 src/lib/entities/identifiers.integration.test.ts   |  2 +-
 src/lib/entities/issuers.integration.test.ts       |  2 +-
 src/lib/facts/facts.integration.test.ts            |  2 +-
 .../migrations/20261107091000_facts_extensions.sql | 70 +++++++++++++++++++--
 6 files changed, 141 insertions(+), 10 deletions(-)

exec
/bin/zsh -lc 'pwd; for p in /AGENTS.md /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do test ! -f "$p" || cat "$p"; done; ls -a | head -30; git show f99e785 --' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
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
git: error: couldn't create cache file '/tmp/xcrun_db-xFB3PIKZ' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-VBMFI30e' (errno=Operation not permitted)
commit f99e785cc9f2811aca7316b72897bfe87b8ffdb7
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 02:20:55 2026 -0800

    fix(facts): 8b review — generic resolver refuses reconcile/lineage items, adopt_candidate locks and checks the whole lineage, replay deadlock victim
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/dq/dq-extensions.integration.test.ts b/src/lib/dq/dq-extensions.integration.test.ts
index 46e89e4..6818589 100644
--- a/src/lib/dq/dq-extensions.integration.test.ts
+++ b/src/lib/dq/dq-extensions.integration.test.ts
@@ -22,7 +22,7 @@ const RETRYABLE=new Set(['55P03','40P01']);
 async function replayMigration(pool:Pool,sql:string,attempts=10):Promise<void>{
  for(let attempt=1;;attempt++){
   const c=await pool.connect();
-  try{await c.query(`begin; set local lock_timeout='3s'; select pg_advisory_xact_lock(hashtext('test:migration-replay'));\n${sql}\n;commit;`);return;}
+  try{await c.query(`begin; set local lock_timeout='3s'; set local deadlock_timeout='50ms'; select pg_advisory_xact_lock(hashtext('test:migration-replay'));\n${sql}\n;commit;`);return;}
   catch(e){
    await c.query('rollback').catch(()=>{});
    const code=(e as {code?:string}).code;
@@ -397,14 +397,31 @@ describe.skipIf(!enabled)('F3-4 facts extensions migration on real PostgreSQL',(
    const other=await item({reason:'identity_bs',b,payload:{key:{},fact_ids:[r]}});
    expect(await resolveFacts(other,[],by)).toMatchObject({promoted:0,skipped:1});                      // resolve_facts_quarantine honours the predicate too
    const m3=await item({reason:'reconcile_mismatch',b,payload:{fact_ids:[r]},detail:latest(false)});
-   expect(await resolveFacts(m3,[],by)).toMatchObject({promoted:0});                                   // the generic resolver cannot bypass restore_reconciled
+   expect(await fails(resolveFacts(m3,[],by))).toMatchObject({message:'use_dedicated_resolver',code:'22023'});   // the generic resolver cannot bypass restore_reconciled
+   expect((await itemRow(m3)).status).toBe('open');
    expect(await status(r)).toBe('quarantined');
    await q(`update public.dq_quarantine set detail=detail||$2::jsonb where id=any($1::uuid[])`,[[m2,m3],JSON.stringify(latest(true))]);
+   await q(`update public.dq_quarantine set status='resolved_accept',resolved_by=$2,resolved_at=now() where id=$1`,[m3,by]);   // closed by hand: the generic resolver refuses it
    expect(await promote(iss,[r])).toBe(0);                                                            // m is still a reject
    await q(`update public.dq_quarantine set status='resolved_accept',detail=detail||$2::jsonb where id=$1`,[m,JSON.stringify(latest(true))]);
    expect(await promote(iss,[r])).toBe(1);
   });
 
+  it('resolve_facts_quarantine refuses reconcile_mismatch and lineage_conflict (passing result with a changed inputs hash cannot be closed or promoted); restore_reconciled still works with the matching hash',async()=>{
+   const {iss,b,r}=await published();const by=await user();const rb=await batch();
+   await park(r);
+   const m=await item({reason:'reconcile_mismatch',b,payload:{fact_ids:[r]},detail:{...latest(true,'h1'),issuer_id:iss,market:'US'}});
+   expect(await fails(resolveFacts(m,[],by))).toMatchObject({message:'use_dedicated_resolver'});
+   const l=await lineageItem(iss,b,[r]);
+   expect(await fails(resolveFacts(l,[],by))).toMatchObject({message:'use_dedicated_resolver'});
+   expect([(await itemRow(m)).status,(await itemRow(l)).status,await status(r)]).toEqual(['open','open','quarantined']);
+   expect(await fails(restore(m,rb,'changed',by))).toMatchObject({message:'not_passing'});
+   await q(`update public.dq_quarantine set status='resolved_reject',resolved_by=$2,resolved_at=now() where id=$1`,[l,by]);   // only to free the member for the matching-hash restore
+   await q(`update public.dq_quarantine set payload=jsonb_set(payload,'{fact_ids}','[]') where id=$1`,[l]);
+   expect(await restore(m,rb,'h1',by)).toEqual({promoted:1,skipped:[]});
+   expect(await status(r)).toBe('ok');
+  });
+
   it('T6: a resolved lineage_conflict binds promotion to its chosen rows, for payload members and for the rows it quarantined',async()=>{
    const {iss,b,r0,r}=await published();const by=await user();
    await park(r);await park(r0);
@@ -440,6 +457,19 @@ describe.skipIf(!enabled)('F3-4 facts extensions migration on real PostgreSQL',(
    expect(await fails(restore(wrong,rb,'h1',by))).toMatchObject({message:'item_not_open'});
   });
 
+  it('restore_reconciled skips rows blocked by the new T6 predicates: a resolved lineage_conflict that chose another row, a second reconcile_mismatch resolved_reject',async()=>{
+   const {iss,b,r0,r}=await published();const by=await user();const rb=await batch();
+   await park(r0);await park(r);
+   await item({reason:'lineage_conflict',b,payload:{fact_ids:[r0]},detail:{chosen_fact_ids:[r]},status:'resolved_accept',by});
+   const m1=await item({reason:'reconcile_mismatch',b,payload:{fact_ids:[r0]},detail:{...latest(true,'h1'),issuer_id:iss,market:'US'}});
+   expect(await restore(m1,rb,'h1',by)).toEqual({promoted:0,skipped:[{fact_id:r0,reason:'ineligible'}]});
+   expect(await status(r0)).toBe('quarantined');
+   await item({reason:'reconcile_mismatch',b,payload:{fact_ids:[r]},detail:latest(false),status:'resolved_reject',by});
+   const m2=await item({reason:'reconcile_mismatch',b,payload:{fact_ids:[r]},detail:{...latest(true,'h1'),issuer_id:iss,market:'US'}});
+   expect(await restore(m2,rb,'h1',by)).toEqual({promoted:0,skipped:[{fact_id:r,reason:'ineligible'}]});
+   expect(await status(r)).toBe('quarantined');
+  });
+
   it('adopt_candidate (T5): maps the persisted camelCase candidate, takes issuer and market from the filing, generation from the anchor run, mapping_version from retained rows; the hook in the same transaction; a management run',async()=>{
    const {iss,b,run,f,fRef}=await published();const by=await user();const ab=await batch();
    const id=await ambiguous({iss,b,run,ref:fRef,key:{issuer_id:randomUUID(),market:'CN'}});        // payload key is never trusted
@@ -489,6 +519,9 @@ describe.skipIf(!enabled)('F3-4 facts extensions migration on real PostgreSQL',(
    const run4=await begin(iss,b,2);await publish(run4,[]);                                              // an anchor run without rows
    const rr=await item({reason:'ambiguous_value',b,nk:NK(iss,fRef,2),payload:{candidates:[cand(fRef,'110')],run_id:run4}});
    expect(await fails(adopt(rr,0,await batch(),await rev(iss),by))).toMatchObject({message:'replay_required'});
+   const run5=await begin(iss,b,1);const z=await filing(run5);await publish(run5,[z.id]);                // anchor run without rows, filing without rows at its generation
+   const zr=await item({reason:'ambiguous_value',b,nk:NK(iss,z.sourceRef,1),payload:{candidates:[cand(z.sourceRef,'110')],run_id:run5}});
+   expect(await fails(adopt(zr,0,await batch(),await rev(iss),by))).toMatchObject({message:'replay_required'});
   });
 
   it('adopt_candidate conflict_exists (U3): a visible ok row with another value for (K, date), or an open same_day_conflict / lineage_conflict on it even with no ok competitor left',async()=>{
@@ -508,6 +541,42 @@ describe.skipIf(!enabled)('F3-4 facts extensions migration on real PostgreSQL',(
    expect(await adopt(a,0,await batch(),2,by)).toMatchObject({issuer_id:iss});
   });
 
+  it('adopt_candidate lineage (Codex P2): a competing ok value at another lineage member, with no open item, → conflict_exists',async()=>{
+   const {iss:t,b}=await published();const by=await user();            // t holds revenue 100 for 2023-10-01..12-31 on 2024-02-01
+   const u=await issuer();const ub=await batch();await scope(u);await claim(u,ub);
+   const run=await begin(u,ub);const g=await filing(run);
+   await stage(run,[{filing_id:g.id,concept:'total_assets',period_start:null,duration:'INSTANT',value:'9'}]);await publish(run,[g.id]);
+   await merge(u,t,by);
+   const key={periodStart:'2023-10-01',periodEnd:'2023-12-31'};
+   const own=await item({reason:'ambiguous_value',b:ub,nk:NK(u,g.sourceRef),payload:{candidates:[cand(g.sourceRef,'150',key),cand(g.sourceRef,'100',key)],run_id:run}});
+   expect(await fails(adopt(own,0,await batch(),await rev(u),by))).toMatchObject({message:'conflict_exists'});   // 150 against t's 100, u has no row of its own
+   expect((await itemRow(own)).status).toBe('open');
+   expect(await adopt(own,1,await batch(),await rev(u),by)).toMatchObject({issuer_id:u});                        // the same value agrees
+   void b;
+  });
+
+  it('adopt_candidate: two adoptions racing on different lineage members serialise; the second sees the first',async()=>{
+   const t=await issuer();const bt=await batch();await scope(t);await claim(t,bt);
+   const a=await sibling('0');const c=await sibling('0');
+   const by=await user();await merge(a.iss,t,by);await merge(c.iss,t,by);
+   const [{source_ref:aref}]=await q(`select source_ref from public.filings where filing_id=$1`,[a.f]);
+   const [{source_ref:cref}]=await q(`select source_ref from public.filings where filing_id=$1`,[c.f]);
+   const ia=await item({reason:'ambiguous_value',b:a.b,nk:NK(a.iss,aref),payload:{candidates:[cand(aref,'111')],run_id:a.run}});
+   const ic=await item({reason:'ambiguous_value',b:c.b,nk:NK(c.iss,cref),payload:{candidates:[cand(cref,'222')],run_id:c.run}});
+   const ab=await batch();
+   await inTx(admin,async({c:cx,pid,commit})=>{
+    await cx.query(`select 1 from public.fact_sync_scope where issuer_id=$1 and market='US' for update`,[c.iss]);
+    const p1=adopt(ia,0,ab,await rev(a.iss),by);p1.catch(()=>{});
+    await stillBlockedBehind(admin,pid,p1);
+    const p2=adopt(ic,0,ab,await rev(c.iss),by);p2.catch(()=>{});
+    await commit();
+    const res=await Promise.allSettled([p1,p2]);
+    expect(res.filter(x=>x.status==='fulfilled')).toHaveLength(1);
+    const bad=res.find(x=>x.status==='rejected') as PromiseRejectedResult;
+    expect(bad.reason).toMatchObject({message:'conflict_exists'});
+   });
+  });
+
   it('resolve_lineage_conflict: locks the whole lineage, re-queries under the lock, leaves exactly one ok value, persists the verdict that promote_quarantined then obeys',async()=>{
    const {iss:t,b,r}=await published();const {iss:s,b:sb,x}=await sibling('200');const by=await user();
    const run2=await begin(s,sb);const g=await filing(run2);const [z]=await stage(run2,[{filing_id:g.id,value:'300'}]);await publish(run2,[g.id]);   // not in the payload
diff --git a/src/lib/dq/dq-foundation.integration.test.ts b/src/lib/dq/dq-foundation.integration.test.ts
index 9739c00..85bd72a 100644
--- a/src/lib/dq/dq-foundation.integration.test.ts
+++ b/src/lib/dq/dq-foundation.integration.test.ts
@@ -18,7 +18,7 @@ async function replayMigration(pool:Pool,sql:string,attempts=10):Promise<void>{
  for(let attempt=1;;attempt++){
   const c=await pool.connect();
   try{
-   await c.query(`begin; set local lock_timeout='3s'; select pg_advisory_xact_lock(hashtext('test:migration-replay'));\n${sql}\n;commit;`);
+   await c.query(`begin; set local lock_timeout='3s'; set local deadlock_timeout='50ms'; select pg_advisory_xact_lock(hashtext('test:migration-replay'));\n${sql}\n;commit;`);
    return;
   }catch(e){
    await c.query('rollback').catch(()=>{});
diff --git a/src/lib/entities/identifiers.integration.test.ts b/src/lib/entities/identifiers.integration.test.ts
index ddb1f12..436b9bd 100644
--- a/src/lib/entities/identifiers.integration.test.ts
+++ b/src/lib/entities/identifiers.integration.test.ts
@@ -30,7 +30,7 @@ async function replayMigration(pool:Pool,sql:string,attempts=10):Promise<void>{
  for(let attempt=1;;attempt++){
   const c=await pool.connect();
   try{
-   await c.query(`begin; set local lock_timeout='3s'; select pg_advisory_xact_lock(hashtext('test:migration-replay'));\n${sql}\n;commit;`);
+   await c.query(`begin; set local lock_timeout='3s'; set local deadlock_timeout='50ms'; select pg_advisory_xact_lock(hashtext('test:migration-replay'));\n${sql}\n;commit;`);
    return;
   }catch(e){
    await c.query('rollback').catch(()=>{});
diff --git a/src/lib/entities/issuers.integration.test.ts b/src/lib/entities/issuers.integration.test.ts
index de78dd7..9ebdf02 100644
--- a/src/lib/entities/issuers.integration.test.ts
+++ b/src/lib/entities/issuers.integration.test.ts
@@ -20,7 +20,7 @@ async function replayMigration(pool:Pool,sql:string,attempts=10):Promise<void>{
  for(let attempt=1;;attempt++){
   const c=await pool.connect();
   try{
-   await c.query(`begin; set local lock_timeout='3s'; select pg_advisory_xact_lock(hashtext('test:migration-replay'));\n${sql}\n;commit;`);
+   await c.query(`begin; set local lock_timeout='3s'; set local deadlock_timeout='50ms'; select pg_advisory_xact_lock(hashtext('test:migration-replay'));\n${sql}\n;commit;`);
    return;
   }catch(e){
    await c.query('rollback').catch(()=>{});
diff --git a/src/lib/facts/facts.integration.test.ts b/src/lib/facts/facts.integration.test.ts
index 21a636d..9f78c0d 100644
--- a/src/lib/facts/facts.integration.test.ts
+++ b/src/lib/facts/facts.integration.test.ts
@@ -31,7 +31,7 @@ async function replayMigration(pool:Pool,sql:string,attempts=10):Promise<void>{
  for(let attempt=1;;attempt++){
   const c=await pool.connect();
   try{
-   await c.query(`begin; set local lock_timeout='3s'; select pg_advisory_xact_lock(hashtext('test:migration-replay'));\n${sql}\n;commit;`);
+   await c.query(`begin; set local lock_timeout='3s'; set local deadlock_timeout='50ms'; select pg_advisory_xact_lock(hashtext('test:migration-replay'));\n${sql}\n;commit;`);
    return;
   }catch(e){
    await c.query('rollback').catch(()=>{});
diff --git a/supabase/migrations/20261107091000_facts_extensions.sql b/supabase/migrations/20261107091000_facts_extensions.sql
index 863e4ca..7b7941c 100644
--- a/supabase/migrations/20261107091000_facts_extensions.sql
+++ b/supabase/migrations/20261107091000_facts_extensions.sql
@@ -479,6 +479,7 @@ returns jsonb language plpgsql security definer set search_path = public as $$
 declare q public.dq_quarantine; c jsonb; g public.filings; r public.fact_sync_runs; b public.ingest_batches;
         v_source text; v_market text; v_gen int; v_nk_gen int; v_versions text[]; v_rev bigint;
         v_ps date; v_pe date; v_value numeric; v_run uuid := gen_random_uuid(); v_fact uuid := gen_random_uuid(); v_t uuid; v_k text;
+        v_lineage uuid[]; v_now uuid[];
 begin
   if p_resolved_by is null then raise exception 'invalid_resolver' using errcode = '22023'; end if;
   select * into q from public.dq_quarantine where id = p_item;
@@ -536,7 +537,13 @@ begin
   if v_versions is null or cardinality(v_versions) <> 1 then raise exception 'replay_required' using errcode = 'P0001'; end if;
   select * into b from public.ingest_batches where batch_id = p_batch;
   if not found or b.status <> 'running' or b.dataset <> q.dataset then raise exception 'batch_mismatch' using errcode = 'P0001'; end if;
-  select s.state_rev into v_rev from public.fact_sync_scope s where s.issuer_id = g.issuer_id and s.market = g.market for update;
+  -- lock the whole lineage of the filing issuer's target (sorted by issuer_id; no cycle lock is taken here), then revalidate membership
+  v_t := coalesce((select i.merged_into from public.issuers i where i.issuer_id = g.issuer_id), g.issuer_id);
+  v_lineage := array(select l.i from (select v_t as i union select issuer_id from public.issuers where merged_into = v_t) l order by l.i);
+  perform 1 from public.fact_sync_scope s where s.issuer_id = any(v_lineage) and s.market = g.market order by s.issuer_id for update;
+  v_now := array(select l.i from (select v_t as i union select issuer_id from public.issuers where merged_into = v_t) l order by l.i);
+  if v_now <> v_lineage or not (g.issuer_id = any(v_now)) then raise exception 'lineage_changed' using errcode = 'P0001'; end if;
+  select s.state_rev into v_rev from public.fact_sync_scope s where s.issuer_id = g.issuer_id and s.market = g.market;
   if not found then raise exception 'scope_missing' using errcode = 'P0001'; end if;
   if v_rev is distinct from p_expected_rev then raise exception 'stale_evaluation' using errcode = 'P0001'; end if;
   select * into q from public.dq_quarantine where id = p_item for update;
@@ -546,15 +553,14 @@ begin
                and f.consolidation = c ->> 'consolidation' and f.unit = c ->> 'unit' and f.filing_id = g.filing_id and f.mapping_gen = v_gen) then
     raise exception 'duplicate' using errcode = 'P0001';
   end if;
-  v_t := coalesce((select i.merged_into from public.issuers i where i.issuer_id = g.issuer_id), g.issuer_id);
   v_k := (c ->> 'concept') || ':' || coalesce(c ->> 'periodStart', '') || ':' || (c ->> 'periodEnd') || ':' || (c ->> 'consolidation') || ':' || (c ->> 'unit');
   if exists (select 1 from public.financial_facts f join public.filings fg on fg.filing_id = f.filing_id and fg.mapping_gen = f.mapping_gen
-             where f.issuer_id = g.issuer_id and f.market = g.market and f.status = 'ok' and f.concept = c ->> 'concept'
+             where f.issuer_id = any(v_lineage) and f.market = g.market and f.status = 'ok' and f.concept = c ->> 'concept'
                and f.period_start is not distinct from v_ps and f.period_end = v_pe and f.consolidation = c ->> 'consolidation' and f.unit = c ->> 'unit'
                and f.available_date = g.available_date and f.value <> v_value)
      or exists (select 1 from public.dq_quarantine d
                 where d.table_name = 'financial_facts' and d.status = 'open' and d.reason_code = 'same_day_conflict'
-                  and d.payload -> 'key' ->> 'issuer_id' = g.issuer_id::text and d.payload -> 'key' ->> 'market' = g.market
+                  and d.payload -> 'key' ->> 'issuer_id' in (select l::text from unnest(v_lineage) l) and d.payload -> 'key' ->> 'market' = g.market
                   and d.payload -> 'key' ->> 'concept' = c ->> 'concept'
                   and coalesce(d.payload -> 'key' ->> 'period_start', '') = coalesce(c ->> 'periodStart', '')
                   and d.payload -> 'key' ->> 'period_end' = c ->> 'periodEnd'
@@ -704,3 +710,59 @@ begin
 end $$;
 revoke execute on function public.resolve_lineage_conflict(uuid, uuid, uuid, uuid) from public, anon, authenticated;
 grant execute on function public.resolve_lineage_conflict(uuid, uuid, uuid, uuid) to service_role;
+
+-- ---------------------------------------------------------------- 11. generic resolver guard (Codex 8b P1)
+-- The plan-2 body verbatim plus one guard: reconcile_mismatch and lineage_conflict items never close here.
+create or replace function public.resolve_facts_quarantine(p_item uuid, p_chosen uuid[], p_resolved_by uuid)
+returns jsonb language plpgsql security definer set search_path = public as $$
+declare q public.dq_quarantine; v_ids uuid[]; v_issuer uuid; v_market text; v_chosen uuid[]; v_promoted int := 0; v_run uuid;
+begin
+  if p_resolved_by is null then raise exception 'invalid_resolver' using errcode = '22023'; end if;
+  select * into q from public.dq_quarantine where id = p_item;
+  if not found or q.status <> 'open' or q.table_name <> 'financial_facts' then raise exception 'item_not_open' using errcode = 'P0001'; end if;
+  -- migration two: these two reasons close only through restore_reconciled / resolve_lineage_conflict
+  if q.reason_code in ('reconcile_mismatch', 'lineage_conflict') then raise exception 'use_dedicated_resolver' using errcode = '22023'; end if;
+  -- 1. provisional member read, only to locate the scope row to lock
+  v_ids := public.fact_item_members(q.payload);
+  select f.issuer_id, f.market into v_issuer, v_market from public.financial_facts f where f.fact_id = any(v_ids) limit 1;
+  if v_issuer is null then
+    select r.issuer_id, r.market into v_issuer, v_market from public.fact_sync_runs r where r.run_id = (q.payload ->> 'run_id')::uuid;
+  end if;
+  if v_issuer is not null then
+    perform 1 from public.fact_sync_scope where issuer_id = v_issuer and market = v_market for update;
+  end if;
+  -- 2. re-read and rebuild the member set under the lock (a concurrent merge is now visible)
+  select * into q from public.dq_quarantine where id = p_item for update;
+  if not found or q.status <> 'open' then raise exception 'item_not_open' using errcode = 'P0001'; end if;
+  v_ids := public.fact_item_members(q.payload);
+  -- 3. every member run, and the anchor run, must have left the staged state
+  if exists (select 1 from public.financial_facts f join public.fact_sync_runs r on r.run_id = f.run_id where f.fact_id = any(v_ids) and r.status = 'staged') then
+    raise exception 'run_pending' using errcode = 'P0001';
+  end if;
+  v_run := (q.payload ->> 'run_id')::uuid;
+  if v_run is not null and exists (select 1 from public.fact_sync_runs r where r.run_id = v_run and r.status = 'staged') then
+    raise exception 'run_pending' using errcode = 'P0001';
+  end if;
+  if q.reason_code = 'same_day_conflict' then
+    v_chosen := coalesce(p_chosen, '{}'::uuid[]);
+    if not (v_chosen <@ v_ids) then raise exception 'invalid_chosen' using errcode = '22023'; end if;
+    -- spec 7.3: the chosen rows (those still existing) must all carry the same numeric value
+    if (select count(distinct f.value) from public.financial_facts f where f.fact_id = any(v_chosen)) > 1 then raise exception 'invalid_chosen' using errcode = '22023'; end if;
+  else
+    v_chosen := v_ids;
+  end if;
+  update public.dq_quarantine
+  set status = 'resolved_accept', resolved_by = p_resolved_by, resolved_at = now(),
+      detail = detail || jsonb_build_object('chosen_fact_ids', to_jsonb(v_chosen))
+        || case when q.reason_code in ('same_day_conflict', 'identity_bs', 'identity_gp')
+                then jsonb_build_object('hook', jsonb_build_object('stage', 'materialize', 'state', 'pending', 'at', to_jsonb(now())))
+                else '{}'::jsonb end
+  where id = p_item;
+  if v_issuer is not null then
+    v_promoted := public.fact_promote_rows(v_issuer, v_market, v_chosen);
+    update public.fact_sync_scope set state_rev = state_rev + 1, updated_at = now() where issuer_id = v_issuer and market = v_market;
+  end if;
+  return jsonb_build_object('promoted', v_promoted, 'skipped', cardinality(v_chosen) - v_promoted, 'chosen_fact_ids', to_jsonb(v_chosen));
+end $$;
+revoke execute on function public.resolve_facts_quarantine(uuid, uuid[], uuid) from public, anon, authenticated;
+grant execute on function public.resolve_facts_quarantine(uuid, uuid[], uuid) to service_role;

exec
/bin/zsh -lc "find . -name 'AGENTS*' -not -path './node_modules/*'; ls .claude; sed -n '475,620p' supabase/migrations/20261107091000_facts_extensions.sql; rg -n 'merge_issuer|fact_sync_scope|merged_into' supabase/migrations/*issu* | tail -65; cat package.json" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 57ms:
agents
launch.json
scratch
-- chosen_candidate_index / adopted_fact_id / run_id / issuer_id / market / batch_id and
-- hook = pending, state_rev + 1.
create or replace function public.adopt_candidate(p_item uuid, p_index int, p_batch uuid, p_expected_rev bigint, p_resolved_by uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare q public.dq_quarantine; c jsonb; g public.filings; r public.fact_sync_runs; b public.ingest_batches;
        v_source text; v_market text; v_gen int; v_nk_gen int; v_versions text[]; v_rev bigint;
        v_ps date; v_pe date; v_value numeric; v_run uuid := gen_random_uuid(); v_fact uuid := gen_random_uuid(); v_t uuid; v_k text;
        v_lineage uuid[]; v_now uuid[];
begin
  if p_resolved_by is null then raise exception 'invalid_resolver' using errcode = '22023'; end if;
  select * into q from public.dq_quarantine where id = p_item;
  if not found or q.status <> 'open' then raise exception 'item_not_open' using errcode = 'P0001'; end if;
  if q.table_name <> 'financial_facts' or q.reason_code <> 'ambiguous_value' or q.dataset not in ('facts.us','facts.cn') then
    raise exception 'invalid_choice' using errcode = '22023';
  end if;
  if coalesce(jsonb_typeof(q.payload -> 'candidates'), '') <> 'array' or p_index is null or p_index < 0 or p_index >= jsonb_array_length(q.payload -> 'candidates') then
    raise exception 'invalid_choice' using errcode = '22023';
  end if;
  c := q.payload -> 'candidates' -> p_index;
  if jsonb_typeof(c) <> 'object'
     or coalesce(jsonb_typeof(c -> 'concept'), '') <> 'string' or coalesce(jsonb_typeof(c -> 'sourceConcept'), '') <> 'string'
     or coalesce(jsonb_typeof(c -> 'unit'), '') <> 'string' or coalesce(jsonb_typeof(c -> 'filingRef'), '') <> 'string'
     or coalesce(jsonb_typeof(c -> 'rawHash'), '') <> 'string' or coalesce(jsonb_typeof(c -> 'value'), '') <> 'string'
     or coalesce(jsonb_typeof(c -> 'periodEnd'), '') <> 'string' or coalesce(jsonb_typeof(c -> 'periodStart'), 'missing') not in ('null', 'string')
     or coalesce(c ->> 'statement', '') not in ('IS','BS','CF','DEI')
     or coalesce(c ->> 'duration', '') not in ('3M','6M','9M','12M','INSTANT')
     or coalesce(c ->> 'consolidation', '') not in ('consolidated','parent') then
    raise exception 'invalid_candidate' using errcode = '22023';
  end if;
  if length(c ->> 'concept') not between 1 and 64 or length(c ->> 'sourceConcept') not between 1 and 256
     or length(c ->> 'unit') not between 1 and 16 or length(c ->> 'rawHash') not between 1 and 128
     or (c ->> 'value') !~ '^-?[0-9]+(\.[0-9]+)?$' or (c ->> 'periodEnd') !~ '^\d{4}-\d{2}-\d{2}$'
     or (jsonb_typeof(c -> 'periodStart') = 'string' and (c ->> 'periodStart') !~ '^\d{4}-\d{2}-\d{2}$')
     or ((jsonb_typeof(c -> 'periodStart') = 'null') <> ((c ->> 'duration') = 'INSTANT')) then
    raise exception 'invalid_candidate' using errcode = '22023';
  end if;
  begin
    v_pe := (c ->> 'periodEnd')::date;
    v_ps := (c ->> 'periodStart')::date;
    v_value := (c ->> 'value')::numeric;
  exception when others then
    raise exception 'invalid_candidate' using errcode = '22023';
  end;
  if v_ps is not null and not (v_ps < v_pe) then raise exception 'invalid_candidate' using errcode = '22023'; end if;
  v_market := case q.dataset when 'facts.us' then 'US' else 'CN' end;
  v_source := case q.dataset when 'facts.us' then 'edgar' else 'tushare' end;
  select * into g from public.filings where source = v_source and source_ref = c ->> 'filingRef';
  if not found or g.market <> v_market then raise exception 'filing_not_found' using errcode = 'P0001'; end if;
  if coalesce(q.payload ->> 'run_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'generation_moved' using errcode = 'P0001';
  end if;
  select * into r from public.fact_sync_runs where run_id = (q.payload ->> 'run_id')::uuid;
  if not found then raise exception 'generation_moved' using errcode = 'P0001'; end if;
  v_gen := r.mapping_gen;
  v_nk_gen := substring(q.natural_key from ':([0-9]+)$')::int;
  if v_nk_gen is distinct from v_gen or g.mapping_gen is distinct from v_gen or v_gen <= 0 or r.market <> g.market then
    raise exception 'generation_moved' using errcode = 'P0001';
  end if;
  select array_agg(distinct f.mapping_version) into v_versions from public.financial_facts f where f.run_id = r.run_id;
  if v_versions is null then
    select array_agg(distinct f.mapping_version) into v_versions from public.financial_facts f where f.filing_id = g.filing_id and f.mapping_gen = v_gen;
  end if;
  if v_versions is null or cardinality(v_versions) <> 1 then raise exception 'replay_required' using errcode = 'P0001'; end if;
  select * into b from public.ingest_batches where batch_id = p_batch;
  if not found or b.status <> 'running' or b.dataset <> q.dataset then raise exception 'batch_mismatch' using errcode = 'P0001'; end if;
  -- lock the whole lineage of the filing issuer's target (sorted by issuer_id; no cycle lock is taken here), then revalidate membership
  v_t := coalesce((select i.merged_into from public.issuers i where i.issuer_id = g.issuer_id), g.issuer_id);
  v_lineage := array(select l.i from (select v_t as i union select issuer_id from public.issuers where merged_into = v_t) l order by l.i);
  perform 1 from public.fact_sync_scope s where s.issuer_id = any(v_lineage) and s.market = g.market order by s.issuer_id for update;
  v_now := array(select l.i from (select v_t as i union select issuer_id from public.issuers where merged_into = v_t) l order by l.i);
  if v_now <> v_lineage or not (g.issuer_id = any(v_now)) then raise exception 'lineage_changed' using errcode = 'P0001'; end if;
  select s.state_rev into v_rev from public.fact_sync_scope s where s.issuer_id = g.issuer_id and s.market = g.market;
  if not found then raise exception 'scope_missing' using errcode = 'P0001'; end if;
  if v_rev is distinct from p_expected_rev then raise exception 'stale_evaluation' using errcode = 'P0001'; end if;
  select * into q from public.dq_quarantine where id = p_item for update;
  if q.status <> 'open' then raise exception 'item_not_open' using errcode = 'P0001'; end if;
  if exists (select 1 from public.financial_facts f
             where f.issuer_id = g.issuer_id and f.concept = c ->> 'concept' and f.period_start is not distinct from v_ps and f.period_end = v_pe
               and f.consolidation = c ->> 'consolidation' and f.unit = c ->> 'unit' and f.filing_id = g.filing_id and f.mapping_gen = v_gen) then
    raise exception 'duplicate' using errcode = 'P0001';
  end if;
  v_k := (c ->> 'concept') || ':' || coalesce(c ->> 'periodStart', '') || ':' || (c ->> 'periodEnd') || ':' || (c ->> 'consolidation') || ':' || (c ->> 'unit');
  if exists (select 1 from public.financial_facts f join public.filings fg on fg.filing_id = f.filing_id and fg.mapping_gen = f.mapping_gen
             where f.issuer_id = any(v_lineage) and f.market = g.market and f.status = 'ok' and f.concept = c ->> 'concept'
               and f.period_start is not distinct from v_ps and f.period_end = v_pe and f.consolidation = c ->> 'consolidation' and f.unit = c ->> 'unit'
               and f.available_date = g.available_date and f.value <> v_value)
     or exists (select 1 from public.dq_quarantine d
                where d.table_name = 'financial_facts' and d.status = 'open' and d.reason_code = 'same_day_conflict'
                  and d.payload -> 'key' ->> 'issuer_id' in (select l::text from unnest(v_lineage) l) and d.payload -> 'key' ->> 'market' = g.market
                  and d.payload -> 'key' ->> 'concept' = c ->> 'concept'
                  and coalesce(d.payload -> 'key' ->> 'period_start', '') = coalesce(c ->> 'periodStart', '')
                  and d.payload -> 'key' ->> 'period_end' = c ->> 'periodEnd'
                  and d.payload -> 'key' ->> 'consolidation' = c ->> 'consolidation' and d.payload -> 'key' ->> 'unit' = c ->> 'unit'
                  and d.payload -> 'key' ->> 'available_date' = g.available_date::text)
     or exists (select 1 from public.dq_quarantine d
                where d.table_name = 'financial_facts' and d.status = 'open' and d.reason_code = 'lineage_conflict'
                  and d.natural_key = v_t::text || ':' || v_k || ':' || g.available_date::text) then
    raise exception 'conflict_exists' using errcode = 'P0001';
  end if;
  insert into public.fact_sync_runs (run_id, issuer_id, market, batch_id, mapping_gen, status, manifest, started_at, published_at)
  values (v_run, g.issuer_id, g.market, p_batch, v_gen, 'published', '[]'::jsonb, now(), now());
  insert into public.financial_facts (fact_id, issuer_id, market, filing_id, run_id, concept, source_concept, statement, period_start, period_end, duration, value, unit, consolidation, available_date, mapping_gen, mapping_version, raw_hash)
  values (v_fact, g.issuer_id, g.market, g.filing_id, v_run, c ->> 'concept', c ->> 'sourceConcept', c ->> 'statement', v_ps, v_pe, c ->> 'duration', v_value,
          c ->> 'unit', c ->> 'consolidation', g.available_date, v_gen, v_versions[1], c ->> 'rawHash');
  update public.financial_facts set status = 'ok' where fact_id = v_fact;
  update public.dq_quarantine
  set status = 'resolved_accept', resolved_by = p_resolved_by, resolved_at = now(),
      detail = detail || jsonb_build_object('chosen_candidate_index', p_index, 'adopted_fact_id', v_fact, 'run_id', v_run, 'issuer_id', g.issuer_id,
                                            'market', g.market, 'batch_id', p_batch, 'hook', jsonb_build_object('stage', 'materialize', 'state', 'pending', 'at', to_jsonb(now())))
  where id = p_item;
  update public.fact_sync_scope set state_rev = state_rev + 1, updated_at = now() where issuer_id = g.issuer_id and market = g.market;
  return jsonb_build_object('fact_id', v_fact, 'run_id', v_run, 'issuer_id', g.issuer_id, 'market', g.market);
end $$;
revoke execute on function public.adopt_candidate(uuid, int, uuid, bigint, uuid) from public, anon, authenticated;
grant execute on function public.adopt_candidate(uuid, int, uuid, bigint, uuid) to service_role;

-- ---------------------------------------------------------------- 9. restore after a passing re-run (spec §3.2 restore_reconciled, §5.6, R1)
-- Open reconcile_mismatch only; p_batch running. Scope lock (issuer of the first member row by
-- fact_id, else detail.issuer_id/market), item re-read under it. latest_result.passed must be
-- true and latest_result.inputs_hash must equal p_inputs_hash_now (computed by the caller from the
-- CURRENT inputs with the same function the runner uses), else not_passing. The item is closed
-- FIRST (it no longer blocks its own rows; other open items still do), then payload.fact_ids go
-- through fact_promote_rows; state_rev + 1; hook = pending. skipped lists every member not
-- promoted: missing / not_quarantined / ineligible.
create or replace function public.restore_reconciled(p_item uuid, p_batch uuid, p_inputs_hash_now text, p_resolved_by uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare q public.dq_quarantine; v_issuer uuid; v_market text; v_ids uuid[]; v_before uuid[]; v_promoted int := 0; v_skipped jsonb;
begin
  if p_resolved_by is null then raise exception 'invalid_resolver' using errcode = '22023'; end if;
  select * into q from public.dq_quarantine where id = p_item;
  if not found or q.status <> 'open' or q.table_name <> 'financial_facts' or q.reason_code <> 'reconcile_mismatch' then
    raise exception 'item_not_open' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.ingest_batches where batch_id = p_batch and status = 'running') then raise exception 'batch_mismatch' using errcode = 'P0001'; end if;
  v_ids := public.fact_item_members(q.payload);
  select f.issuer_id, f.market into v_issuer, v_market from public.financial_facts f where f.fact_id = any(v_ids) order by f.fact_id limit 1;
  if v_issuer is null and coalesce(q.detail ->> 'issuer_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_issuer := (q.detail ->> 'issuer_id')::uuid; v_market := q.detail ->> 'market';
  end if;
  if v_issuer is not null then
    perform 1 from public.fact_sync_scope where issuer_id = v_issuer and market = v_market for update;
  end if;
  select * into q from public.dq_quarantine where id = p_item for update;
  if q.status <> 'open' then raise exception 'item_not_open' using errcode = 'P0001'; end if;
  if (q.detail -> 'latest_result' -> 'passed') is distinct from 'true'::jsonb
     or p_inputs_hash_now is null or (q.detail -> 'latest_result' ->> 'inputs_hash') is distinct from p_inputs_hash_now then
12:-- dissolved) while other issuers' merged_into still points at it (re-point them first), so merge
31:  merged_into             uuid references public.issuers(issuer_id) on delete restrict,
37:  constraint issuers_merged_not_self check (merged_into is null or merged_into <> issuer_id),
38:  constraint issuers_merged_iff_status check ((status = 'merged') = (merged_into is not null))
44:create index if not exists issuers_merged_into_idx on public.issuers(merged_into) where merged_into is not null;
52:  if new.merged_into is not null then
53:    select i.status into target_status from public.issuers i where i.issuer_id = new.merged_into for share;
55:      raise exception 'merge_target_not_active: issuer % cannot merge into % (status %)', new.issuer_id, new.merged_into, coalesce(target_status, 'missing')
60:     and exists (select 1 from public.issuers r where r.merged_into = new.issuer_id and r.issuer_id <> new.issuer_id) then
67:create trigger issuers_merge_target_active before insert or update of merged_into, status on public.issuers
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
/bin/zsh -lc "rg -n 'create or replace function public.merge|state_rev|cycle' supabase/migrations/20261107091000_facts_extensions.sql; sed -n '270,395p' supabase/migrations/20261107091000_facts_extensions.sql; sed -n '1,75p' src/lib/dq/dq-extensions.integration.test.ts; rg -n 'deadlock_timeout|superuser|ADMIN.*URL' scripts/ci/research-db.ts src/lib/entities/issuers.integration.test.ts; find /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude -maxdepth 2 -name 'AGENTS*' " in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
9:--     re-reads the lineage under the locks, compares the set and every state_rev; the plan-2
21:-- (issuer_id, market) → issuers rows → dq_quarantine rows → fact rows → dq_reconcile_cycles row (last).
96:    update public.financial_metrics set based_on_lineage = jsonb_build_array(jsonb_build_object('issuer_id', issuer_id, 'state_rev', based_on_rev));
103:-- p_based_on = [{issuer_id, state_rev}]: issuer ids unique and containing p_issuer. Every member's
106:-- state_rev must match, else stale_computation. Stored vector: issuer_id ascending.
117:                   or coalesce(jsonb_typeof(e -> 'state_rev'), '') <> 'number'
119:                   or (e ->> 'state_rev') !~ '^[0-9]+$') then
123:         jsonb_agg(jsonb_build_object('issuer_id', (e ->> 'issuer_id')::uuid, 'state_rev', (e ->> 'state_rev')::bigint) order by (e ->> 'issuer_id')::uuid)
139:             where s.state_rev <> (e ->> 'state_rev')::bigint) then
142:  select state_rev into v_rev from public.fact_sync_scope where issuer_id = p_issuer and market = p_market;
167:  return public.replace_financial_metrics_lineage(p_issuer, p_market, jsonb_build_array(jsonb_build_object('issuer_id', p_issuer, 'state_rev', p_based_on_rev)), p_rows);
193:-- Envelope {state_revs (issuer_id asc), lineage (asc), rows, conflicts, truncated, row_count}.
248:  'state_revs', (select coalesce(jsonb_agg(jsonb_build_object('issuer_id', m.issuer_id, 'state_rev', public.fact_state_rev(m.issuer_id, p_market)) order by m.issuer_id), '[]'::jsonb) from members m),
262:-- Plan-2 signature and envelope {state_rev, rows, truncated, row_count}: one member, so the
269:    'state_rev', coalesce(x.v -> 'state_revs' -> 0 -> 'state_rev', to_jsonb(public.fact_state_rev(p_issuer, p_market))),
296:-- state_rev + 1; the target joins the next facts.lineage_same_day cycle — entry {issuer_id:T, market,
297:-- source:S} appended under the cycle lock open_reconcile_cycle also takes (plan audit Q2), so a cycle
299:-- Lock order (plan audit R1): the cycle advisory lock is taken FIRST, before the scope rows
300:-- (fact_topology_lock) and the issuers rows. open_reconcile_cycle holds the same advisory lock while
304:-- function that takes a dq_reconcile_cycle:* advisory lock takes it before any row lock.
315:  perform pg_advisory_xact_lock(hashtext('dq_reconcile_cycle:facts.lineage_same_day'));   -- FIRST, before any row lock (plan audit R1); serialises with open_reconcile_cycle (plan audit Q2)
329:  update public.fact_sync_scope set state_rev = state_rev + 1, updated_at = now() where issuer_id = any(v_set);
330:  -- the cycle advisory lock is already held (taken first, above)
331:  -- Registration is best effort: with no facts.lineage_same_day cycle row the UPDATE below affects 0 rows and
332:  -- nothing else happens (no cycle row is created here). Alignment decision #6: the runner's first cycle
334:  update public.dq_reconcile_cycles c
342:    and c.cycle_id = (select y.cycle_id from public.dq_reconcile_cycles y where y.pair = 'facts.lineage_same_day' order by (y.status = 'running') desc, y.started_at desc limit 1);
368:-- plan-1 trigger refuses an issuer with open securities; state_rev + 1; audit row.
369:-- Lock order (plan audit R1): set_dissolved registers no pending member and takes NO cycle advisory
370:-- lock, so it never waits for anything open_reconcile_cycle holds — a creator inserting a cursor for
371:-- this issuer may wait behind its FOR UPDATE (one-way wait, no cycle). If it ever needs the cycle
388:  update public.fact_sync_scope set state_rev = state_rev + 1, updated_at = now() where issuer_id = p_issuer;
470:-- filing's scope lock: state_rev = p_expected_rev (stale_evaluation); the full plan-2 candidate key
476:-- hook = pending, state_rev + 1.
540:  -- lock the whole lineage of the filing issuer's target (sorted by issuer_id; no cycle lock is taken here), then revalidate membership
546:  select s.state_rev into v_rev from public.fact_sync_scope s where s.issuer_id = g.issuer_id and s.market = g.market;
585:  update public.fact_sync_scope set state_rev = state_rev + 1, updated_at = now() where issuer_id = g.issuer_id and market = g.market;
597:-- through fact_promote_rows; state_rev + 1; hook = pending. skipped lists every member not
632:    update public.fact_sync_scope set state_rev = state_rev + 1, updated_at = now() where issuer_id = v_issuer and market = v_market;
653:-- state_rev + 1.
708:  update public.fact_sync_scope set state_rev = state_rev + 1, updated_at = now() where issuer_id = any(v_lineage) and market = v_market;
763:    update public.fact_sync_scope set state_rev = state_rev + 1, updated_at = now() where issuer_id = v_issuer and market = v_market;
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
revoke execute on function public.fact_set_merge_body(uuid, uuid, uuid) from public, anon, authenticated, service_role;

create or replace function public.set_merge(p_source uuid, p_target uuid, p_resolved_by uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_prev text := current_setting('entities.allow_topology_write', true); v_out jsonb;
begin
  perform set_config('entities.allow_topology_write', 'on', true);
  begin
    v_out := public.fact_set_merge_body(p_source, p_target, p_resolved_by);
  exception when others then
    perform set_config('entities.allow_topology_write', coalesce(v_prev, ''), true);
    raise;
  end;
  perform set_config('entities.allow_topology_write', coalesce(v_prev, ''), true);
  return v_out;
end $$;
revoke execute on function public.set_merge(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.set_merge(uuid, uuid, uuid) to service_role;

-- Body of set_dissolved: same lock set (issuer + referrers); referrers → has_referrers (re-point
-- them with set_merge first); active → dissolved (row_count = 1, else source_not_active); the
-- plan-1 trigger refuses an issuer with open securities; state_rev + 1; audit row.
-- Lock order (plan audit R1): set_dissolved registers no pending member and takes NO cycle advisory
-- lock, so it never waits for anything open_reconcile_cycle holds — a creator inserting a cursor for
-- this issuer may wait behind its FOR UPDATE (one-way wait, no cycle). If it ever needs the cycle
-- lock, it must take it first, as set_merge does.
create or replace function public.fact_set_dissolved_body(p_issuer uuid, p_resolved_by uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_set uuid[]; v_now uuid[]; n int;
begin
  if p_resolved_by is null then raise exception 'invalid_resolver' using errcode = '22023'; end if;
  if p_issuer is null or not exists (select 1 from public.issuers where issuer_id = p_issuer) then raise exception 'source_not_active' using errcode = 'P0001'; end if;
  v_set := array(select distinct x from unnest(array[p_issuer] || array(select issuer_id from public.issuers where merged_into = p_issuer)) as x order by x);
  perform public.fact_topology_lock(v_set);
  perform 1 from public.issuers where issuer_id = any(v_set) order by issuer_id for update;
  v_now := array(select distinct x from unnest(array[p_issuer] || array(select issuer_id from public.issuers where merged_into = p_issuer)) as x order by x);
  if v_now <> v_set then raise exception 'lineage_changed' using errcode = 'P0001'; end if;
  if cardinality(v_set) > 1 then raise exception 'has_referrers' using errcode = 'P0001'; end if;
  update public.issuers set status = 'dissolved', updated_at = now() where issuer_id = p_issuer and status = 'active';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'source_not_active' using errcode = 'P0001'; end if;
  update public.fact_sync_scope set state_rev = state_rev + 1, updated_at = now() where issuer_id = p_issuer;
  insert into public.research_audit_log (user_id, actor, action, object_type, object_id, detail)
  values (p_resolved_by, 'user', 'entities.dissolve', 'issuer', p_issuer, jsonb_build_object('issuer', p_issuer));
end $$;
revoke execute on function public.fact_set_dissolved_body(uuid, uuid) from public, anon, authenticated, service_role;

create or replace function public.set_dissolved(p_issuer uuid, p_resolved_by uuid)
returns void language plpgsql security definer set search_path = public as $$
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
  try{await c.query(`begin; set local lock_timeout='3s'; set local deadlock_timeout='50ms'; select pg_advisory_xact_lock(hashtext('test:migration-replay'));\n${sql}\n;commit;`);return;}
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
src/lib/entities/issuers.integration.test.ts:23:   await c.query(`begin; set local lock_timeout='3s'; set local deadlock_timeout='50ms'; select pg_advisory_xact_lock(hashtext('test:migration-replay'));\n${sql}\n;commit;`);

exec
/bin/zsh -lc "rg -n 'sibling|async function published|replayMigration|PLAN2' src/lib/dq/dq-extensions.integration.test.ts; sed -n '76,116p' src/lib/dq/dq-extensions.integration.test.ts; rg -n 'resolve_facts_quarantine|reconcile_mismatch|lineage_conflict' src/lib/dq/*ts | head -45; git diff f99e785"'^ f99e785 --check' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
18:const PLAN2='supabase/migrations/20261106090000_financial_facts.sql';
22:async function replayMigration(pool:Pool,sql:string,attempts=10):Promise<void>{
115: const sibling=async(value:string)=>{
183:   const legacyText=(()=>{const s=readFileSync(PLAN2,'utf8');const start=s.indexOf('create or replace function public.read_facts(');const end=s.indexOf('\n$$;',start);return s.slice(start,end+4).replace('create or replace function public.read_facts(','create function pg_temp.read_facts_v8(');})();
206:   const {iss:s,x}=await sibling('200');
213:   const {iss:u,x:ux}=await sibling('100');
231:   const {iss:t}=await published();const {iss:s}=await sibling('100');const by=await user();
330:   const {iss:t}=await published();const {iss:s}=await sibling('100');const by=await user();
364:   await expect(replayMigration(admin,sql())).resolves.toBeUndefined();
560:   const a=await sibling('0');const c=await sibling('0');
581:   const {iss:t,b,r}=await published();const {iss:s,b:sb,x}=await sibling('200');const by=await user();
600:   const {iss:t,b,r}=await published();const {iss:s,x}=await sibling('200');const {x:outsider}=await sibling('250');const by=await user();
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
  return {id:m[sourceRef] as string,sourceRef};
 };
 const factRow=(f:FactSpec)=>({fact_id:f.fact_id??randomUUID(),filing_id:f.filing_id,concept:f.concept??'revenue',source_concept:'Revenues',statement:f.concept==='total_assets'?'BS':'IS',period_start:f.period_start===undefined?'2023-10-01':f.period_start,period_end:f.period_end??'2023-12-31',duration:f.duration??'3M',value:f.value??'100',unit:f.unit??'USD',consolidation:'consolidated',available_date:f.available_date??'2024-02-01',mapping_version:f.mapping_version??'facts-map/1',raw_hash:'h'});
 const stage=async(run:string,rows:FactSpec[])=>{const full=rows.map(factRow);await one(`select public.stage_facts($1,$2::jsonb) v`,[run,JSON.stringify(full)]);return full.map(r=>r.fact_id);};
 const publish=(run:string,manifest:string[])=>one(`select public.publish_sync_run($1,$2::uuid[]) v`,[run,manifest]);
 const rev=(iss:string,market='US')=>one(`select public.fact_state_rev($1,$2) v`,[iss,market]).then(Number);
 const status=async(id:string)=>(await q(`select status from public.financial_facts where fact_id=$1`,[id]))[0]?.status??null;
 const merge=(s:string,t:string,by:string)=>one(`select public.set_merge($1,$2,$3) v`,[s,t,by]);
 const dissolve=(i:string,by:string)=>q(`select public.set_dissolved($1,$2)`,[i,by]);
 const lineageRead=async(issuers:string[],o:{concepts?:string[];asOf?:string;history?:boolean;limit?:number|null;nonOk?:boolean}={},client:Pool|PoolClient=admin)=>
  (await client.query(`select public.read_facts_lineage($1::uuid[],'US',$2::text[],$3::date,null,null,$4,$5,$6) v`,[issuers,o.concepts??['revenue','total_assets'],o.asOf??'2030-01-01',o.history??true,o.limit??null,o.nonOk??false])).rows[0].v as LineageEnvelope;
 const factsRead=async(iss:string,o:{concepts?:string[];asOf?:string;history?:boolean;limit?:number|null;nonOk?:boolean}={},client:Pool|PoolClient=admin)=>
  (await client.query(`select public.read_facts($1,'US',$2::text[],$3::date,null,null,$4,$5,$6) v`,[iss,o.concepts??['revenue','total_assets'],o.asOf??'2030-01-01',o.history??true,o.limit??null,o.nonOk??false])).rows[0].v as Envelope;
 const metric=(v:string,name='gross_margin')=>({metric:name,period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:v,unit:'ratio',input_unit:'USD',basis:'us_standard',formula_version:'facts-derive/1.0',inputs:[],as_of:'2024-03-01'});
 /** A leased US issuer with one published gen-1 run: f0 (2024-01-01) carries r0 = revenue 90, f (2024-02-01) carries r = revenue 100, same key. state_rev 1. */
 const published=async()=>{
  const iss=await issuer();const b=await batch();expect(await scope(iss)).toBe(1);expect(await claim(iss,b)).toBe(true);
  const run=await begin(iss,b);const f0=await filing(run,{available:'2024-01-01'});const f=await filing(run);
  const [r0]=await stage(run,[{filing_id:f0.id,value:'90',available_date:'2024-01-01'}]);
  const [r]=await stage(run,[{filing_id:f.id,value:'100'}]);
  expect(await publish(run,[f0.id,f.id])).toBe(2);
  return {iss,b,run,f0:f0.id,f:f.id,fRef:f.sourceRef,r0,r};
 };
 /** Another published issuer with one revenue row on 2024-02-01 for the same key (value given). */
 const sibling=async(value:string)=>{
  const iss=await issuer();const b=await batch();await scope(iss);await claim(iss,b);
src/lib/dq/dq-extensions.integration.test.ts:7:// T5, U3), restore_reconciled (R1), resolve_lineage_conflict, the reconcile cursor and
src/lib/dq/dq-extensions.integration.test.ts:367: describe('8b: promotion predicates, adopt_candidate, restore_reconciled, resolve_lineage_conflict',()=>{
src/lib/dq/dq-extensions.integration.test.ts:377:  const resolveFacts=(id:string,chosen:string[],by:string)=>one(`select public.resolve_facts_quarantine($1,$2::uuid[],$3) v`,[id,chosen,by]);
src/lib/dq/dq-extensions.integration.test.ts:386:  const lineageItem=(t:string,b:string,ids:string[],date='2024-02-01')=>item({reason:'lineage_conflict',b,nk:`${t}:revenue:2023-10-01:2023-12-31:consolidated:USD:${date}`,payload:{fact_ids:ids,values:[]}});
src/lib/dq/dq-extensions.integration.test.ts:387:  const resolveLineage=(id:string,keep:string,b:string,by:string)=>one(`select public.resolve_lineage_conflict($1,$2,$3,$4) v`,[id,keep,b,by]);
src/lib/dq/dq-extensions.integration.test.ts:389:  it('T6: an open, rejected or not-passing reconcile_mismatch blocks promotion through promote_quarantined and resolve_facts_quarantine; accepted-and-passing does not',async()=>{
src/lib/dq/dq-extensions.integration.test.ts:392:   const m=await item({reason:'reconcile_mismatch',b,payload:{fact_ids:[r]},detail:latest(false)});
src/lib/dq/dq-extensions.integration.test.ts:396:   const m2=await item({reason:'reconcile_mismatch',b,payload:{fact_ids:[r]},detail:latest(false),status:'resolved_accept',by});
src/lib/dq/dq-extensions.integration.test.ts:398:   expect(await resolveFacts(other,[],by)).toMatchObject({promoted:0,skipped:1});                      // resolve_facts_quarantine honours the predicate too
src/lib/dq/dq-extensions.integration.test.ts:399:   const m3=await item({reason:'reconcile_mismatch',b,payload:{fact_ids:[r]},detail:latest(false)});
src/lib/dq/dq-extensions.integration.test.ts:410:  it('resolve_facts_quarantine refuses reconcile_mismatch and lineage_conflict (passing result with a changed inputs hash cannot be closed or promoted); restore_reconciled still works with the matching hash',async()=>{
src/lib/dq/dq-extensions.integration.test.ts:413:   const m=await item({reason:'reconcile_mismatch',b,payload:{fact_ids:[r]},detail:{...latest(true,'h1'),issuer_id:iss,market:'US'}});
src/lib/dq/dq-extensions.integration.test.ts:425:  it('T6: a resolved lineage_conflict binds promotion to its chosen rows, for payload members and for the rows it quarantined',async()=>{
src/lib/dq/dq-extensions.integration.test.ts:428:   const l=await item({reason:'lineage_conflict',b,payload:{fact_ids:[r]},detail:{chosen_fact_ids:[],quarantined_fact_ids:[r0]},status:'resolved_accept',by});
src/lib/dq/dq-extensions.integration.test.ts:438:   const m=await item({reason:'reconcile_mismatch',b,payload:{fact_ids:[r]},detail:{...latest(true,'h1'),issuer_id:iss,market:'US'}});
src/lib/dq/dq-extensions.integration.test.ts:450:   const n=await item({reason:'reconcile_mismatch',b,payload:{fact_ids:[r0]},detail:latest(false,'h1')});
src/lib/dq/dq-extensions.integration.test.ts:460:  it('restore_reconciled skips rows blocked by the new T6 predicates: a resolved lineage_conflict that chose another row, a second reconcile_mismatch resolved_reject',async()=>{
src/lib/dq/dq-extensions.integration.test.ts:463:   await item({reason:'lineage_conflict',b,payload:{fact_ids:[r0]},detail:{chosen_fact_ids:[r]},status:'resolved_accept',by});
src/lib/dq/dq-extensions.integration.test.ts:464:   const m1=await item({reason:'reconcile_mismatch',b,payload:{fact_ids:[r0]},detail:{...latest(true,'h1'),issuer_id:iss,market:'US'}});
src/lib/dq/dq-extensions.integration.test.ts:467:   await item({reason:'reconcile_mismatch',b,payload:{fact_ids:[r]},detail:latest(false),status:'resolved_reject',by});
src/lib/dq/dq-extensions.integration.test.ts:468:   const m2=await item({reason:'reconcile_mismatch',b,payload:{fact_ids:[r]},detail:{...latest(true,'h1'),issuer_id:iss,market:'US'}});
src/lib/dq/dq-extensions.integration.test.ts:527:  it('adopt_candidate conflict_exists (U3): a visible ok row with another value for (K, date), or an open same_day_conflict / lineage_conflict on it even with no ok competitor left',async()=>{
src/lib/dq/dq-extensions.integration.test.ts:538:   const ln=await item({reason:'lineage_conflict',b,nk:`${iss}:revenue:2023-07-01:2023-09-30:consolidated:USD:2024-02-01`,payload:{fact_ids:[y]}});
src/lib/dq/dq-extensions.integration.test.ts:580:  it('resolve_lineage_conflict: locks the whole lineage, re-queries under the lock, leaves exactly one ok value, persists the verdict that promote_quarantined then obeys',async()=>{
src/lib/dq/dq-extensions.integration.test.ts:599:  it('resolve_lineage_conflict: payload rows outside the lineage → lineage_changed; a kept row that is not ok → unresolved with nothing changed; it waits behind a lock on any member scope',async()=>{
src/lib/dq/dq-extensions.integration.test.ts:618:   const malformed=await item({reason:'lineage_conflict',b,nk:`${t}:revenue:2024-02-01`,payload:{fact_ids:[r]}});
src/lib/dq/dq-extensions.integration.test.ts:624:   for(const sig of ['public.adopt_candidate(uuid,int,uuid,bigint,uuid)','public.restore_reconciled(uuid,uuid,text,uuid)','public.resolve_lineage_conflict(uuid,uuid,uuid,uuid)']){
src/lib/dq/facts-resolver.ts:2:// function resolve_facts_quarantine (run_pending check on every member row AND on the item's
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-Eo9tXAOx' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-ZTTYKrUX' (errno=Operation not permitted)

codex
No actionable regressions were identified in the commit. The resolver guard and lineage-wide locking and conflict checks are consistent with the surrounding implementation. Database integration tests were not executed in this read-only environment.
No actionable regressions were identified in the commit. The resolver guard and lineage-wide locking and conflict checks are consistent with the surrounding implementation. Database integration tests were not executed in this read-only environment.

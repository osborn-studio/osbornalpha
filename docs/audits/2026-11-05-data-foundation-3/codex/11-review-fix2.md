OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b0a8-800f-7001-b9ad-425c98aa8739
--------
user
commit a4b2a10
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline a4b2a10; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 2212ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-l7s9cUkF' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-Rgdg1ogK' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/11-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/11-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/11-review-fix2.md
?? docs/audits/2026-11-05-data-foundation-3/codex/11-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-0De7QtrH' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-bGZkNqtd' (errno=Operation not permitted)
a4b2a10 fix(dq): drop the 3-arg patch_quarantine_detail, scanner targetOf isolation, persisted lineage target, single restore_note (Task 11 quality review)
 src/app/api/admin/dq/quarantine/[id]/route.test.ts        |  5 +++--
 src/app/api/admin/dq/quarantine/[id]/route.ts             |  2 ++
 src/lib/dq/facts-resolver.test.ts                         | 15 +++++++++++++--
 src/lib/dq/facts-resolver.ts                              | 15 +++++++++------
 src/lib/dq/pending-hooks.test.ts                          | 15 +++++++++++++++
 src/lib/dq/pending-hooks.ts                               |  4 +++-
 src/lib/entities/identifiers.integration.test.ts          |  2 ++
 supabase/migrations.lock.json                             |  2 +-
 supabase/migrations/20261107090000_identifiers_and_dq.sql |  2 ++
 9 files changed, 50 insertions(+), 12 deletions(-)

exec
/bin/zsh -lc 'pwd; for p in /AGENTS.md /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do test ! -f "$p" || cat "$p"; done; ls -a | head -30; git show a4b2a10 --;' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
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
git: error: couldn't create cache file '/tmp/xcrun_db-bDozHZbi' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-eedMBfjJ' (errno=Operation not permitted)
commit a4b2a1013eab83d200c303f175f7d1b1bfde2e3f
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 03:39:42 2026 -0800

    fix(dq): drop the 3-arg patch_quarantine_detail, scanner targetOf isolation, persisted lineage target, single restore_note (Task 11 quality review)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/app/api/admin/dq/quarantine/[id]/route.test.ts b/src/app/api/admin/dq/quarantine/[id]/route.test.ts
index f66d98f..b8a15fb 100644
--- a/src/app/api/admin/dq/quarantine/[id]/route.test.ts
+++ b/src/app/api/admin/dq/quarantine/[id]/route.test.ts
@@ -262,10 +262,11 @@ describe('POST /api/admin/dq/quarantine/[id]', () => {
     expect(unwired.status).toBe(409);
     expect(await unwired.json()).toEqual({ id: ID, outcome: 'conflict', error: 'not_passing', detail: { restore_note: 'reconcile_wiring_missing' } });
     expect(mocks.insert).not.toHaveBeenCalled();
-    mocks.resolveFacts.mockResolvedValueOnce({ outcome: 'resolved', hook: HOOK, promoted: 0, restore: { promoted: 0, skipped: [{ fact_id: FACT_A, reason: 'ineligible' }], restore_note: 'no_rows_promoted' } });
+    mocks.resolveFacts.mockResolvedValueOnce({ outcome: 'resolved', hook: HOOK, promoted: 0, restore: { promoted: 0, skipped: [{ fact_id: FACT_A, reason: 'ineligible' }] }, restoreNote: 'no_rows_promoted' });
     const ok = await json({ status: 'resolved_accept' });
     expect(ok.status).toBe(200);
-    expect(await ok.json()).toMatchObject({ outcome: 'resolved', restore: { restore_note: 'no_rows_promoted' } });
+    expect(await ok.json()).toMatchObject({ outcome: 'resolved', restore: { promoted: 0 }, detail: { restore_note: 'no_rows_promoted' } });
+    expect((await (await json({ status: 'resolved_accept' })).json())).toBeDefined();
   });
   it('maps SQL codes thrown past the resolver: conflict codes 409, choice codes 400, body {id, outcome, error}; unknown codes stay a 500', async () => {
     await facts3('lineage_conflict');
diff --git a/src/app/api/admin/dq/quarantine/[id]/route.ts b/src/app/api/admin/dq/quarantine/[id]/route.ts
index 50b2ca5..68da278 100644
--- a/src/app/api/admin/dq/quarantine/[id]/route.ts
+++ b/src/app/api/admin/dq/quarantine/[id]/route.ts
@@ -119,6 +119,8 @@ export async function POST(request: Request, { params }: Ctx) {
           ...(r.chosenCandidateIndex !== undefined ? { chosen_candidate_index: r.chosenCandidateIndex } : {}),
           ...(r.keepFactId !== undefined ? { keep_fact_id: r.keepFactId } : {}),
           ...(r.restore !== undefined ? { restore: r.restore } : {}),
+          // restore_note lives in ONE place, detail.restore_note, on success (no_rows_promoted) and on refusal alike (spec §4.6/§8)
+          ...(r.restoreNote !== undefined ? { detail: { restore_note: r.restoreNote } } : {}),
           ...(r.quarantined !== undefined ? { quarantined: r.quarantined } : {}),
         };
         // refusals carry only {error:<code>, detail?} (no hook/promoted/... nulls); same body shape as the claims route (接口对齐记录 #9)
diff --git a/src/lib/dq/facts-resolver.test.ts b/src/lib/dq/facts-resolver.test.ts
index 31c4e92..9698330 100644
--- a/src/lib/dq/facts-resolver.test.ts
+++ b/src/lib/dq/facts-resolver.test.ts
@@ -189,7 +189,7 @@ describe('resolveFactsItem — plan 3 dispatch (spec §4.6, §5.6, T10)',()=>{
    readFacts:vi.fn(async(_issuer:string,_market:string,_opts:{history?:boolean})=>({stateRev:revs.length>1?revs.shift()!:revs[0],rows:o.readRows??[],truncated:false})),
    adoptCandidate:vi.fn(async(_item:string,_index:number,_batch:string,_rev:number,_by:string)=>({factId:'50000000-0000-4000-8000-000000000005',runId:'60000000-0000-4000-8000-000000000006',issuerId:ISSUER,market:'US' as const})),
    restoreReconciled:vi.fn(async():Promise<{promoted:number;skipped:{fact_id:string;reason:string}[]}>=>({promoted:1,skipped:[]})),
-   resolveLineageConflict:vi.fn(async()=>({quarantined:1})),
+   resolveLineageConflict:vi.fn(async(_item:string,_keep:string,_batch:string,_by:string)=>({quarantined:1})),
    resolveFactsQuarantine:vi.fn(async()=>({promoted:0,skipped:0,chosenFactIds:[]})),
    factsByIds:vi.fn(async()=>[]),
   };
@@ -291,7 +291,9 @@ describe('resolveFactsItem — plan 3 dispatch (spec §4.6, §5.6, T10)',()=>{
   expect(mocks.materialize).toHaveBeenCalledWith(db,ISSUER,'US');
   expect(r).toMatchObject({outcome:'resolved',promoted:1,restore:{promoted:1,skipped:[]},hook:{state:'done'}});
   db.restoreReconciled.mockResolvedValueOnce({promoted:0,skipped:[{fact_id:A,reason:'ineligible'}]});
-  expect((await resolveFactsItem(db,tables,it_,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW,inputsHashNow:hashOf})).restore).toEqual({promoted:0,skipped:[{fact_id:A,reason:'ineligible'}],restore_note:'no_rows_promoted'});
+  const none=await resolveFactsItem(db,tables,it_,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW,inputsHashNow:hashOf});
+  expect(none.restore).toEqual({promoted:0,skipped:[{fact_id:A,reason:'ineligible'}]});
+  expect(none.restoreNote).toBe('no_rows_promoted');
   db.restoreReconciled.mockRejectedValueOnce(new FactsDbError('not_passing'));
   expect(await resolveFactsItem(db,tables,it_,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW,inputsHashNow:hashOf})).toEqual({outcome:'conflict',code:'not_passing'});
  });
@@ -395,4 +397,13 @@ describe('resolveFactsItem — plan 3 dispatch (spec §4.6, §5.6, T10)',()=>{
   expect(r.hook).toMatchObject({state:'failed',message:'hook_superseded'});
   expect(((await tables.select('dq_quarantine',{id:racy.id}))[0].detail as {hook:unknown}).hook).toEqual(NEWER);
  });
+
+ it('review: the lineage verdict materialises the target the SQL verdict persisted (detail.issuer_id), the same as a retry would',async()=>{
+  const {tables,db,item}=h3();
+  const PERSISTED='70000000-0000-4000-8000-000000000007';
+  const it_=await item('lineage_conflict',{fact_ids:[KEEP,A]},{naturalKey:`${T}:revenue:2023-07-01:2023-09-30:consolidated:USD:2023-11-03`});
+  db.resolveLineageConflict.mockImplementationOnce(async(id:string)=>{const [cur]=await tables.select('dq_quarantine',{id});await tables.update('dq_quarantine',{id},{status:'resolved_accept',resolved_by:ADMIN,resolved_at:'x',detail:{...(cur.detail as Record<string,unknown>),chosen_fact_ids:[KEEP],issuer_id:PERSISTED,market:'US'}});return {quarantined:1};});
+  await resolveFactsItem(db,tables,it_,{status:'resolved_accept',keepFactId:KEEP,resolvedBy:ADMIN,now:NOW});
+  expect(mocks.materialize).toHaveBeenLastCalledWith(db,PERSISTED,'US');
+ });
 });
diff --git a/src/lib/dq/facts-resolver.ts b/src/lib/dq/facts-resolver.ts
index f1995f8..9943b19 100644
--- a/src/lib/dq/facts-resolver.ts
+++ b/src/lib/dq/facts-resolver.ts
@@ -12,7 +12,7 @@
 //   plan 3 Task 14c); absent → conflict not_passing + restoreNote 'reconcile_wiring_missing', an
 //   {unavailable} answer → that note ('inputs_unavailable' | 'current_evidence_unavailable', plan audit
 //   P2); nothing written, never promotes. restoreReconciled → materialize
-//   the persisted target; promoted 0 → restore_note 'no_rows_promoted' with the skipped reasons.
+//   the persisted target; promoted 0 → restoreNote 'no_rows_promoted' (the route's detail.restore_note, success and refusal alike) with the skipped reasons in restore.
 //  lineage_conflict + keepFactId → resolveLineageConflict → materialize T (natural key's first
 //   segment); without keepFactId → invalid_choice (keep_fact_id_required): the generic resolver
 //   would promote every member.
@@ -48,9 +48,9 @@ export interface FactsResolveResult{outcome:FactsResolveOutcome;hook?:HookState;
  /** machine code of a refusal (rule id, SQL code) */
  code?:string;
  /** why a reconcile_mismatch restore was refused before reaching SQL (route: detail.restore_note) */
- restoreNote?:'reconcile_wiring_missing'|InputsUnavailable['unavailable'];
+ restoreNote?:'reconcile_wiring_missing'|'no_rows_promoted'|InputsUnavailable['unavailable'];
  adoptedFactId?:string;
- restore?:{promoted:number;skipped:{fact_id:string;reason:string}[];restore_note?:'no_rows_promoted'};
+ restore?:{promoted:number;skipped:{fact_id:string;reason:string}[]};
  quarantined?:number;
  /** the verdict's persisted choices (a retry reports these, never the retrying request's body) */
  chosenCandidateIndex?:number;keepFactId?:string;
@@ -234,7 +234,7 @@ async function restore(db:FactsDb,tables:TableClient,item:Row,input:ResolveFacts
  try{r=await withBatch(tables,String(item.dataset),batchId=>db.restoreReconciled(id,batchId,hash,input.resolvedBy));}
  catch(e){const m=mapRefusal(e);if(m)return m;throw e;}
  const hook=await runHook(db,tables,id,hookTarget(item),now);
- return {outcome:'resolved',hook,promoted:r.promoted,restore:{promoted:r.promoted,skipped:r.skipped,...(r.promoted===0?{restore_note:'no_rows_promoted' as const}:{})}};
+ return {outcome:'resolved',hook,promoted:r.promoted,restore:{promoted:r.promoted,skipped:r.skipped},...(r.promoted===0?{restoreNote:'no_rows_promoted' as const}:{})};
 }
 
 async function lineageVerdict(db:FactsDb,tables:TableClient,item:Row,input:ResolveFactsInput,now:()=>Date):Promise<FactsResolveResult>{
@@ -243,8 +243,11 @@ async function lineageVerdict(db:FactsDb,tables:TableClient,item:Row,input:Resol
  let r:{quarantined:number};
  try{r=await withBatch(tables,String(item.dataset),batchId=>db.resolveLineageConflict(id,keep,batchId,input.resolvedBy));}
  catch(e){const m=mapRefusal(e);if(m)return m;throw e;}
- const target=String(item.natural_key).split(':')[0];
- const hook=await runHook(db,tables,id,market?{issuer:target,market}:null,now);
+ // the target is the one the SQL verdict persisted (detail.issuer_id / market), same as every retry; the natural key's first segment is only the fallback
+ let persisted:{issuer:string;market:Market}|null=null;
+ try{const [fresh]=await tables.select(TABLE,{id},{limit:1});persisted=fresh?hookTarget(fresh):null;}catch(e){console.error('[admin/dq] target read',e instanceof Error?e.message:String(e));}
+ const fallback=String(item.natural_key).split(':')[0];
+ const hook=await runHook(db,tables,id,persisted??(market?{issuer:fallback,market}:null),now);
  return {outcome:'resolved',hook,quarantined:r.quarantined,keepFactId:keep,chosenFactIds:[keep]};
 }
 
diff --git a/src/lib/dq/pending-hooks.test.ts b/src/lib/dq/pending-hooks.test.ts
index 0b89da5..7ced56d 100644
--- a/src/lib/dq/pending-hooks.test.ts
+++ b/src/lib/dq/pending-hooks.test.ts
@@ -99,4 +99,19 @@ describe('findPendingHooks / runPendingHooks (spec §4.6, U2)',()=>{
   expect(mat).toHaveBeenCalledTimes(1);
   expect(report).toMatchObject({items:1,failed:0,hookWriteFailed:1,skippedStale:0});
  });
+
+ it('review: a targetOf failure on one item is reported as untargeted, never thrown; the other items still run',async()=>{
+  const db=memoryFactsDb();
+  const mk=(k:string,issuer:string)=>quarantine(db.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:k,reasonCode:'reconcile_mismatch',batchId:BATCH,payload:{fact_ids:[]},detail:{issuer_id:issuer,market:'US',hook:{stage:'materialize',state:'pending',at:'2026-11-05T01:00:00.000Z'}}});
+  const bad=await mk('k:bad',SRC);const good=await mk('k:good',ISSUER);
+  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
+  const real=db.targetOf.bind(db);
+  (db as {targetOf:typeof db.targetOf}).targetOf=async i=>{if(i===SRC)throw new Error('topology read failed');return real(i);};
+  const mat=vi.fn(async(_d:unknown,i:string)=>({rows:0,stateRev:0,retried:false,target:i,basedOn:[]}));
+  const report=await runPendingHooks({db,tables:db.tables,now:NOW,materialize:mat as never});
+  spy.mockRestore();
+  expect(report).toMatchObject({items:2,failed:0,untargeted:[bad]});
+  expect(mat.mock.calls.map(c=>c[1])).toEqual([ISSUER]);
+  expect(report.targets[0].items).toEqual([good]);
+ });
 });
diff --git a/src/lib/dq/pending-hooks.ts b/src/lib/dq/pending-hooks.ts
index 4395218..6b405c7 100644
--- a/src/lib/dq/pending-hooks.ts
+++ b/src/lib/dq/pending-hooks.ts
@@ -49,7 +49,9 @@ export async function runPendingHooks(deps:PendingHookDeps):Promise<PendingHookR
  const {items,untargeted}=await findPendingHooks(deps.tables);
  const groups=new Map<string,{target:string;market:Market;items:PendingHookItem[]}>();
  for(const it of items){
-  const target=await deps.db.targetOf(it.issuer);
+  let target:string;
+  try{target=await deps.db.targetOf(it.issuer);}
+  catch(e){console.error('[pending-hooks] targetOf',e instanceof Error?e.message:String(e));untargeted.push(it.id);continue;}   // reported, never thrown: the other items still run
   const k=`${target}|${it.market}`;const g=groups.get(k)??{target,market:it.market,items:[]};g.items.push(it);groups.set(k,g);
  }
  const report:PendingHookReport={items:items.length,targets:[],failed:0,hookWriteFailed:0,skippedStale:0,untargeted};
diff --git a/src/lib/entities/identifiers.integration.test.ts b/src/lib/entities/identifiers.integration.test.ts
index d41b67c..2ef28f0 100644
--- a/src/lib/entities/identifiers.integration.test.ts
+++ b/src/lib/entities/identifiers.integration.test.ts
@@ -716,6 +716,8 @@ describe.skipIf(!enabled)('plan 3 migration one: resolve_identifier_claim',()=>{
    expect({fn,role,ok}).toEqual({fn,role,ok:role==='service_role'&&FNS.includes(fn)});
   }
   expect(await q(`select count(*)::int n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname='replace_filing_expectations'`)).toEqual([{n:1}]);
+  expect(await q(`select count(*)::int n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname='patch_quarantine_detail'`)).toEqual([{n:1}]);   // the 3-argument draft is dropped: named 3-argument calls resolve to the defaulted 4-argument one
+  expect(await q(`select public.patch_quarantine_detail(p_id => $1, p_key => 'hook', p_value => '{}'::jsonb) v`,[randomUUID()])).toEqual([{v:false}]);
   const a=await issuer();
   const id=await newClaim({issuer:a,id_type:'lei',value:randomLei(),op:'set_identifier',target:{issuer_id:a}});
   const c=await admin.connect();
diff --git a/supabase/migrations.lock.json b/supabase/migrations.lock.json
index 175ed53..a5b25f8 100644
--- a/supabase/migrations.lock.json
+++ b/supabase/migrations.lock.json
@@ -203,7 +203,7 @@
     },
     {
       "file": "20261107090000_identifiers_and_dq.sql",
-      "sha256": "733db2675c1f2fb28491facd160317d8cd452004aeff9338adc971570bd9f896"
+      "sha256": "228972f3d41c4d0312cc277f7ab3581cb960177b43bb11bcfc5deb6066d29fef"
     },
     {
       "file": "20261107091000_facts_extensions.sql",
diff --git a/supabase/migrations/20261107090000_identifiers_and_dq.sql b/supabase/migrations/20261107090000_identifiers_and_dq.sql
index b4d37f2..1950ca0 100644
--- a/supabase/migrations/20261107090000_identifiers_and_dq.sql
+++ b/supabase/migrations/20261107090000_identifiers_and_dq.sql
@@ -745,6 +745,8 @@ grant execute on function public.append_claim_evidence(uuid, text, text, text, t
 -- = compare-and-set refused (Task 11 review, Codex P2): when p_expect_hook_at is given and the item's
 -- detail->'hook'->>'at' is distinct from it, a newer pending hook (a restore / adoption / lineage verdict
 -- committed after the caller observed the item) belongs to its own owner and nothing is written.
+-- the 3-argument boolean version (earlier drafts) must go: with it alive, a named 3-argument call would be ambiguous against the defaulted 4-argument one
+drop function if exists public.patch_quarantine_detail(uuid, text, jsonb);
 create or replace function public.patch_quarantine_detail(p_id uuid, p_key text, p_value jsonb, p_expect_hook_at text default null)
 returns jsonb language plpgsql security definer set search_path = public as $$
 begin

exec
/bin/zsh -lc "cat src/lib/dq/pending-hooks.ts; cat src/lib/dq/facts-resolver.ts; sed -n '740,800p' supabase/migrations/20261107090000_identifiers_and_dq.sql; sed -n '80,150p' 'src/app/api/admin/dq/quarantine/[id]/route.ts'; find . -name '*AGENTS*' -not -path './node_modules/*'; cat package.json" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 282ms:
// src/lib/dq/pending-hooks.ts
// Unfinished materialisations (plan 3 spec §4.6, U2): (a) RESOLVED facts.* items whose hook is
// pending or failed, plus accepted plan-3 visibility verdicts (adoption, restore, lineage) with no
// hook at all; (b) OPEN reconcile_mismatch items whose hook is pending or failed (a reconciliation
// quarantine stays open until a human decides). The target is the item's persisted issuer/market
// (hookTarget); the CURRENT topology maps it to T(i), so a merge after the verdict still lands on
// the right target; one materialize per (T, market), then every item's hook is written done /
// failed. Items without a usable target are reported (untargeted), never guessed. Read-complete
// (selectAll pages to exhaustion); never throws per target.
import {selectAll} from '../db/table-client';
import type {Row,TableClient} from '../db/table-client';
import {materialize as realMaterialize} from '../facts/derive';
import {FactsDbError} from '../facts/types';
import type {FactsDb,Market} from '../facts/types';
import {FACT_ROW_REASONS,VERDICT_REASONS,hookTarget,writeHookCas} from './facts-resolver';
import type {HookState} from './facts-resolver';

export interface PendingHookItem{id:string;reason:string;status:string;issuer:string;market:Market;
 /** hook.at the scan observed (the compare-and-set fence of the done / failed write); null = the item had no hook */
 hookAt:string|null}
/** failed = targets whose materialize failed; hookWriteFailed = items whose hook write was rejected (materialization may have succeeded); skippedStale = items a newer pending hook superseded while we materialised (left to their owner / the next scan) */
export interface PendingHookReport{items:number;targets:{target:string;market:Market;state:'done'|'failed';message?:string;items:string[]}[];failed:number;hookWriteFailed:number;skippedStale:number;untargeted:string[]}
export interface PendingHookDeps{db:FactsDb;tables:TableClient;now?:()=>Date;materialize?:typeof realMaterialize}

const hookState=(r:Row)=>((r.detail??{}) as {hook?:{state?:unknown}}).hook?.state;
const hasHook=(r:Row)=>((r.detail??{}) as {hook?:unknown}).hook!==undefined;
const isVerdict=(r:Row)=>{
 const d=(r.detail??{}) as Record<string,unknown>;const reason=String(r.reason_code);
 return reason==='ambiguous_value'?typeof d.adopted_fact_id==='string':reason==='reconcile_mismatch'?typeof d.restored_by_batch==='string':reason==='lineage_conflict'?Array.isArray(d.chosen_fact_ids):false;
};

export async function findPendingHooks(tables:TableClient):Promise<{items:PendingHookItem[];untargeted:string[]}>{
 const items:PendingHookItem[]=[];const untargeted:string[]=[];
 const take=(r:Row)=>{const t=hookTarget(r);if(!t){untargeted.push(String(r.id));return;}const at=((r.detail??{}) as {hook?:{at?:unknown}}).hook?.at;items.push({id:String(r.id),reason:String(r.reason_code),status:String(r.status),issuer:t.issuer,market:t.market,hookAt:typeof at==='string'?at:null});};
 for(const reason of [...FACT_ROW_REASONS,...VERDICT_REASONS])for(const status of ['resolved_accept','resolved_reject']){
  for(const r of await selectAll(tables,'dq_quarantine',{table_name:'financial_facts',reason_code:reason,status},'id')){
   const st=hookState(r);
   if(st==='pending'||st==='failed'||(!hasHook(r)&&status==='resolved_accept'&&isVerdict(r)))take(r);
  }
 }
 for(const r of await selectAll(tables,'dq_quarantine',{table_name:'financial_facts',reason_code:'reconcile_mismatch',status:'open'},'id')){
  const st=hookState(r);if(st==='pending'||st==='failed')take(r);
 }
 return {items,untargeted};
}

export async function runPendingHooks(deps:PendingHookDeps):Promise<PendingHookReport>{
 const now=deps.now??(()=>new Date());const run=deps.materialize??realMaterialize;
 const {items,untargeted}=await findPendingHooks(deps.tables);
 const groups=new Map<string,{target:string;market:Market;items:PendingHookItem[]}>();
 for(const it of items){
  let target:string;
  try{target=await deps.db.targetOf(it.issuer);}
  catch(e){console.error('[pending-hooks] targetOf',e instanceof Error?e.message:String(e));untargeted.push(it.id);continue;}   // reported, never thrown: the other items still run
  const k=`${target}|${it.market}`;const g=groups.get(k)??{target,market:it.market,items:[]};g.items.push(it);groups.set(k,g);
 }
 const report:PendingHookReport={items:items.length,targets:[],failed:0,hookWriteFailed:0,skippedStale:0,untargeted};
 const ordered=[...groups.values()].sort((a,b)=>a.target<b.target?-1:a.target>b.target?1:a.market<b.market?-1:a.market>b.market?1:0);
 for(const g of ordered){
  let hook:HookState;
  try{await run(deps.db,g.target,g.market);hook={stage:'done',state:'done',at:now().toISOString()};}
  catch(e){
   console.error('[pending-hooks] materialize',e instanceof Error?e.message:String(e));
   hook={stage:'materialize',state:'failed',at:now().toISOString(),message:e instanceof FactsDbError?e.code:'materialize_failed'};
  }
  for(const it of g.items){
   const w=await writeHookCas(deps.tables,it.id,hook,it.hookAt??undefined);
   if(w.result==='stale')report.skippedStale++;else if(w.result==='write_failed')report.hookWriteFailed++;
  }
  if(hook.state==='failed')report.failed++;
  report.targets.push({target:g.target,market:g.market,state:hook.state,...(hook.message!==undefined?{message:hook.message}:{}),items:g.items.map(i=>i.id)});
 }
 return report;
}
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
async function withBatch<T>(tables:TableClient,dataset:string,body:(batchId:string)=>Promise<T>):Promise<T>{
 const {batchId}=await startBatch(tables,{producer:'dq-resolver',dataset,triggeredBy:'manual'});
 const counts=emptyCounts();counts.fetched=1;
 let out:T;
 try{out=await body(batchId);}
 catch(e){
  counts.failed=1;
  await finishBatch(tables,batchId,{counts,errors:[{code:e instanceof FactsDbError?e.code:e instanceof RuleFailed?'rule_failed':'unknown'}]}).catch(err=>console.error('[admin/dq] batch finish',err instanceof Error?err.message:String(err)));
  throw e;
 }
 counts.inserted=1;
 await finishBatch(tables,batchId,{counts,errors:[]}).catch(err=>console.error('[admin/dq] batch finish',err instanceof Error?err.message:String(err)));
 return out;
}
function mapRefusal(e:unknown):FactsResolveResult|null{
 if(e instanceof RuleFailed)return {outcome:'rule_failed',code:e.rule};
 if(!(e instanceof FactsDbError))return null;
 if(CHOICE_CODES.includes(e.code))return {outcome:'invalid_choice',code:e.code};
 if(CONFLICT_CODES.includes(e.code))return {outcome:'conflict',code:e.code};
 return null;
}
/** Shape check of a persisted FactCandidate before any read; the SQL function stays the final authority. */
function candidateOf(x:unknown):FactCandidate|null{
 if(!x||typeof x!=='object'||Array.isArray(x))return null;
 const c=x as Record<string,unknown>;
 const s=(k:string)=>typeof c[k]==='string'&&(c[k] as string).length>0;
 if(!s('concept')||!s('sourceConcept')||!s('unit')||!s('filingRef')||!s('rawHash')||!s('periodEnd')||!s('value'))return null;
 if(!['IS','BS','CF','DEI'].includes(String(c.statement))||!['3M','6M','9M','12M','INSTANT'].includes(String(c.duration)))return null;
 if(!(c.periodStart===null||s('periodStart'))||(c.periodStart===null)!==(c.duration==='INSTANT'))return null;
 return c as unknown as FactCandidate;
}
/**
 * plan-2 §7 statement rules on {candidate} ∪ EVERY ok row of the candidate's filing at the filing's
 * active generation (the read carries history, so rows a later disclosure superseded still count —
 * they are the filing's own balancing inputs; plan audit P1); the failing rule id, else null.
 */
function ruleFailure(c:FactCandidate,filing:FilingRow,rows:FactRow[]):string|null{
 const row:FactInsert={fact_id:PROBE_ID,issuer_id:filing.issuer_id,market:filing.market,filing_id:filing.filing_id,concept:c.concept,source_concept:c.sourceConcept,statement:c.statement,period_start:c.periodStart,period_end:c.periodEnd,
  duration:c.duration,value:c.value,unit:c.unit,consolidation:'consolidated',available_date:filing.available_date,mapping_gen:filing.mapping_gen,mapping_version:MAPPING_VERSION,raw_hash:c.rawHash};
 const own=rows.filter(r=>r.filing_id===filing.filing_id&&r.mapping_gen===filing.mapping_gen&&r.status==='ok');
 const res=evaluateFactRules({newRows:[row],okRows:own,sourceRefOf:new Map([[filing.filing_id,filing.source_ref]]),issuerId:filing.issuer_id,market:filing.market,mappingGen:filing.mapping_gen});
 return res.quarantine.find(q=>q.factIds.includes(PROBE_ID))?.reason??null;
}

async function adopt(db:FactsDb,tables:TableClient,item:Row,input:ResolveFactsInput,now:()=>Date):Promise<FactsResolveResult>{
 const id=String(item.id);const index=input.chosenCandidateIndex!;const market=marketOfDataset(item.dataset);
 const cands=payloadOf(item).candidates;
 if(market===null||!Array.isArray(cands)||!Number.isInteger(index)||index<0||index>=cands.length)return {outcome:'invalid_choice',code:'invalid_choice'};
 const cand=candidateOf(cands[index]);if(!cand)return {outcome:'invalid_choice',code:'invalid_candidate'};
 const filing=await db.findFilingBySourceRef(market==='US'?'edgar':'tushare',cand.filingRef);
 if(!filing||filing.market!==market)return {outcome:'conflict',code:'filing_not_found'};
 const today=input.today??now().toISOString().slice(0,10);
 const evaluate=async()=>{
  // history:true — a later disclosure must not hide the candidate filing's own rows; a truncated read could (plan audit P1)
  const read=await db.readFacts(filing.issuer_id,filing.market,{concepts:[...CONCEPT_IDS],asOf:today,from:cand.periodEnd,to:cand.periodEnd,history:true});
  if(read.truncated)throw new FactsDbError('read_truncated');
  return {stateRev:read.stateRev,failure:ruleFailure(cand,filing,read.rows)};
 };
 let ev:Awaited<ReturnType<typeof evaluate>>;
 try{ev=await evaluate();}catch(e){const m=mapRefusal(e);if(m)return m;throw e;}
 if(ev.failure!==null)return {outcome:'rule_failed',code:ev.failure};
 let out:Awaited<ReturnType<FactsDb['adoptCandidate']>>;
 try{
  out=await withBatch(tables,String(item.dataset),async batchId=>{
   try{return await db.adoptCandidate(id,index,batchId,ev.stateRev,input.resolvedBy);}
   catch(e){
    if(!(e instanceof FactsDbError)||e.code!=='stale_evaluation')throw e;
    ev=await evaluate();                                                     // one re-read and re-evaluation
    if(ev.failure!==null)throw new RuleFailed(ev.failure);
    return db.adoptCandidate(id,index,batchId,ev.stateRev,input.resolvedBy);
   }
  });
 }catch(e){const m=mapRefusal(e);if(m)return m;throw e;}
 // committed: nothing below may throw
 const hook=await runHook(db,tables,id,{issuer:out.issuerId,market:out.market},now);
 return {outcome:'resolved',hook,adoptedFactId:out.factId,chosenCandidateIndex:index,chosenFactIds:[out.factId]};
}

async function restore(db:FactsDb,tables:TableClient,item:Row,input:ResolveFactsInput,now:()=>Date):Promise<FactsResolveResult>{
 if(!input.inputsHashNow)return {outcome:'conflict',code:'not_passing',restoreNote:'reconcile_wiring_missing'};
 const id=String(item.id);const hash=await input.inputsHashNow(item);
 if(typeof hash!=='string')return {outcome:'conflict',code:'not_passing',restoreNote:hash.unavailable};
 let r:Awaited<ReturnType<FactsDb['restoreReconciled']>>;
 try{r=await withBatch(tables,String(item.dataset),batchId=>db.restoreReconciled(id,batchId,hash,input.resolvedBy));}
 catch(e){const m=mapRefusal(e);if(m)return m;throw e;}
 const hook=await runHook(db,tables,id,hookTarget(item),now);
 return {outcome:'resolved',hook,promoted:r.promoted,restore:{promoted:r.promoted,skipped:r.skipped},...(r.promoted===0?{restoreNote:'no_rows_promoted' as const}:{})};
}

async function lineageVerdict(db:FactsDb,tables:TableClient,item:Row,input:ResolveFactsInput,now:()=>Date):Promise<FactsResolveResult>{
 if(input.keepFactId===undefined)return {outcome:'invalid_choice',code:'keep_fact_id_required'};
 const id=String(item.id);const keep=input.keepFactId;const market=marketOfDataset(item.dataset);
 let r:{quarantined:number};
 try{r=await withBatch(tables,String(item.dataset),batchId=>db.resolveLineageConflict(id,keep,batchId,input.resolvedBy));}
 catch(e){const m=mapRefusal(e);if(m)return m;throw e;}
 // the target is the one the SQL verdict persisted (detail.issuer_id / market), same as every retry; the natural key's first segment is only the fallback
 let persisted:{issuer:string;market:Market}|null=null;
 try{const [fresh]=await tables.select(TABLE,{id},{limit:1});persisted=fresh?hookTarget(fresh):null;}catch(e){console.error('[admin/dq] target read',e instanceof Error?e.message:String(e));}
 const fallback=String(item.natural_key).split(':')[0];
 const hook=await runHook(db,tables,id,persisted??(market?{issuer:fallback,market}:null),now);
 return {outcome:'resolved',hook,quarantined:r.quarantined,keepFactId:keep,chosenFactIds:[keep]};
}

/**
 * Resolves one facts.* item (dispatch in the header). Throws FactsDbError('run_pending') straight
 * from the FactsDb when any member row's run is still staged (the route answers 409 and the item
 * stays open), and item_not_open / batch_mismatch / unknown errors likewise.
 */
export async function resolveFactsItem(db:FactsDb,tables:TableClient,item:Row,input:ResolveFactsInput):Promise<FactsResolveResult>{
 const now=input.now??(()=>new Date());const id=String(item.id);const where=hookTarget(item);
 if(item.status!=='open'){
  const hook=hookOf(item);
  if(input.status==='resolved_accept'&&unfinished(item)&&where!==null){
   const audited=detailOf(item).audit_written===true;
   const ran=await runHook(db,tables,id,where,now);
   const persisted=detailOf(item).chosen_fact_ids;
   const chosenFactIds=Array.isArray(persisted)?persisted.map(String):typeof detailOf(item).adopted_fact_id==='string'?[String(detailOf(item).adopted_fact_id)]:[];
   const d=detailOf(item);const reason=String(item.reason_code);
   // persisted verdict facts (Task 11 review, Codex P2): the response and the recovery audit describe what was committed, not this retry's body
   const persistedChoice:Partial<FactsResolveResult>={
    ...(reason==='ambiguous_value'&&typeof d.adopted_fact_id==='string'?{adoptedFactId:d.adopted_fact_id}:{}),
    ...(reason==='ambiguous_value'&&Number.isInteger(d.chosen_candidate_index)?{chosenCandidateIndex:d.chosen_candidate_index as number}:{}),
    ...(reason==='lineage_conflict'&&chosenFactIds.length===1?{keepFactId:chosenFactIds[0]}:{}),
   };
   const base:FactsResolveResult={outcome:'hook_retried',hook:ran,chosenFactIds,...persistedChoice,auditAs:audited?(ran.state==='done'?'hook_retried':null):'resolved'};
   if(audited)return base;
   return {...base,recovered:{resolvedBy:String(item.resolved_by),status:'resolved_accept',chosenFactIds,recoveredBy:input.resolvedBy,recoveredAt:now().toISOString()}};
  }
  return hook===undefined?{outcome:'already_resolved'}:{outcome:'already_resolved',hook};
 }
 if(input.status==='resolved_reject')return {outcome:await resolveQuarantine(tables,id,{status:'resolved_reject',resolvedBy:input.resolvedBy})};
 const reason=String(item.reason_code);
 if(reason==='reconcile_review')return {outcome:await resolveQuarantine(tables,id,{status:'resolved_accept',resolvedBy:input.resolvedBy})};
 if(reason==='ambiguous_value'&&input.chosenCandidateIndex!==undefined)return adopt(db,tables,item,input,now);
 if(reason==='reconcile_mismatch')return restore(db,tables,item,input,now);
 if(reason==='lineage_conflict')return lineageVerdict(db,tables,item,input,now);
 const members=payloadOf(item).fact_ids??[];
 let chosen:string[]=[];
 if(reason==='same_day_conflict'){
  chosen=[...new Set(input.chosenFactIds??[])];
  if(chosen.some(f=>!members.includes(f)))return {outcome:'invalid_choice'};
  if(chosen.length>1){
   const rows=await db.factsByIds(chosen);
   // rows that no longer exist (abandoned / deleted members) are ignored here; the SQL function decides
   if(rows.some(r=>!decimalEquals(r.value,rows[0].value)))return {outcome:'invalid_choice'};
  }
 }else if(FACT_ROW_REASONS.includes(reason))chosen=[...members];
 const {promoted,skipped,chosenFactIds}=await db.resolveFactsQuarantine(id,chosen,input.resolvedBy);
 // from here on the resolution is committed: nothing below may throw
 const hook=FACT_ROW_REASONS.includes(reason)?await runHook(db,tables,id,where,now):await writeHook(tables,id,{stage:'done',state:'done',at:now().toISOString()});
 return {outcome:'resolved',hook,promoted,skipped,chosenFactIds};
}
-- patch_quarantine_detail is the only TS-side writer of dq_quarantine.detail once an item exists (the
-- materialize hook state and the audit mark; quarantine.ts::patchQuarantineDetail). It locks the item and
-- replaces ONLY the named key, so a concurrent apply_reconcile_result / restore_reconciled / adoption that
-- rewrote latest_result, the chosen ids or the resolution columns is never rolled back to an older read.
-- Two keys only: 'hook' and 'audit_written'. Returns jsonb: true = written, false = no such item, 'stale'
-- = compare-and-set refused (Task 11 review, Codex P2): when p_expect_hook_at is given and the item's
-- detail->'hook'->>'at' is distinct from it, a newer pending hook (a restore / adoption / lineage verdict
-- committed after the caller observed the item) belongs to its own owner and nothing is written.
-- the 3-argument boolean version (earlier drafts) must go: with it alive, a named 3-argument call would be ambiguous against the defaulted 4-argument one
drop function if exists public.patch_quarantine_detail(uuid, text, jsonb);
create or replace function public.patch_quarantine_detail(p_id uuid, p_key text, p_value jsonb, p_expect_hook_at text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if p_key is null or p_key not in ('hook', 'audit_written') or p_value is null then
    raise exception 'invalid_detail_key' using errcode = '22023';
  end if;
  perform 1 from public.dq_quarantine where id = p_id for update;
  if not found then return to_jsonb(false); end if;
  if p_expect_hook_at is not null
     and (select detail->'hook'->>'at' from public.dq_quarantine where id = p_id) is distinct from p_expect_hook_at then
    return to_jsonb('stale'::text);
  end if;
  update public.dq_quarantine set detail = detail || jsonb_build_object(p_key, p_value) where id = p_id;
  return to_jsonb(true);
end $$;
revoke execute on function public.patch_quarantine_detail(uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.patch_quarantine_detail(uuid, text, jsonb, text) to service_role;

-- ---------------------------------------------------------------- guarded identifier write (plan audit round 3, R2)
-- set_security_identifier is the only writer of issuer_securities.isin/figi outside resolve_identifier_claim
-- (identifiers/apply.ts, Task 4a). It share-locks the issuer (resolve_identifier_claim's order: issuer, then
-- security), locks the open row (issuer, ticker, valid_from, valid_to null) and
-- in ONE UPDATE writes the column (only when empty) and merges the single provenance key with
-- `provenance || p_provenance` — never a whole-object replacement — so a concurrent write of the other
-- column, or a claim resolution (which also merges with ||), keeps its key. p_provenance must carry
-- exactly the key p_column. Outcomes: 'written' (the column was empty), 'duplicate' (the same value is
-- stored; a missing provenance key is completed in the same UPDATE), 'conflict' (another value is
-- stored; nothing written — the caller files correct_identifier), 'not_found' (no open row). ISIN
-- uniqueness / no-overlap violations (23505 / 23P01) pass through unchanged.
create or replace function public.set_security_identifier(p_issuer uuid, p_ticker text, p_valid_from date, p_column text, p_value text, p_provenance jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare v_cur text; v_prov jsonb; n int;
begin
  if p_column is null or p_column not in ('isin', 'figi') or coalesce(p_value, '') = ''
     or p_provenance is null or jsonb_typeof(p_provenance) <> 'object'
     or (select array_agg(k) from jsonb_object_keys(p_provenance) k) is distinct from array[p_column] then
    raise exception 'invalid_identifier_write' using errcode = '22023';
  end if;
  -- Same order as resolve_identifier_claim (issuer, then security row): FOR SHARE conflicts with its FOR UPDATE.
  perform 1 from public.issuers where issuer_id = p_issuer for share;
  if not found then return 'not_found'; end if;
  select case when p_column = 'isin' then s.isin else s.figi end, s.provenance into v_cur, v_prov
  from public.issuer_securities s
  where s.issuer_id = p_issuer and s.ticker = p_ticker and s.valid_from = p_valid_from and s.valid_to is null
  for update;
  if not found then return 'not_found'; end if;
  if v_cur is not null and v_cur <> p_value then return 'conflict'; end if;
  if v_cur = p_value and coalesce(v_prov ? p_column, false) then return 'duplicate'; end if;
  if p_column = 'isin' then
    update public.issuer_securities set isin = p_value, provenance = provenance || p_provenance
    where issuer_id = p_issuer and ticker = p_ticker and valid_from = p_valid_from and valid_to is null and isin is not distinct from v_cur;

    const admin = getAdminSupabase();
    const client = supabaseTableClient(admin);
    const [item] = await client.select('dq_quarantine', { id }, { limit: 1 });
    if (!item) return NextResponse.json({ id, outcome: 'not_found' }, { status: 404 });

    // chosen_fact_ids is a verdict on a same_day_conflict accept and nothing else
    if (chosen !== undefined && (status !== 'resolved_accept' || item.reason_code !== 'same_day_conflict')) {
      return NextResponse.json({ error: 'chosen_fact_ids_not_applicable' }, { status: 400 });
    }
    // chosen_candidate_index adopts a candidate of an ambiguous_value item; keep_fact_id settles a lineage_conflict (plan 3 §4.4, §4.6)
    if (index !== undefined && (status !== 'resolved_accept' || item.reason_code !== 'ambiguous_value')) {
      return NextResponse.json({ error: 'chosen_candidate_index_not_applicable' }, { status: 400 });
    }
    if (keep !== undefined && (status !== 'resolved_accept' || item.reason_code !== 'lineage_conflict')) {
      return NextResponse.json({ error: 'keep_fact_id_not_applicable' }, { status: 400 });
    }

    let outcome: Outcome;
    let auditAs: Outcome | null | undefined;
    let hookFailed = false;
    let isFacts = false;
    let recovered: Awaited<ReturnType<typeof resolveFactsItem>>['recovered'];
    let extra: Record<string, unknown> = {};
    if (String(item.dataset).startsWith('facts.')) {
      isFacts = true;
      try {
        const r = await resolveFactsItem(supabaseFactsDb(admin), client, item, {
          status: status as Resolution, chosenFactIds: chosen as string[] | undefined,
          chosenCandidateIndex: index as number | undefined, keepFactId: keep as string | undefined, resolvedBy: user.id,
        });
        outcome = r.outcome;
        auditAs = r.auditAs;
        recovered = r.recovered;
        hookFailed = r.hook?.state === 'failed';
        extra = {
          hook: r.hook ?? null, promoted: r.promoted ?? null, skipped: r.skipped ?? null, chosen_fact_ids: r.chosenFactIds ?? null,
          ...(r.adoptedFactId !== undefined ? { adopted_fact_id: r.adoptedFactId } : {}),
          // the PERSISTED choices (a retry's body may differ from what was committed)
          ...(r.chosenCandidateIndex !== undefined ? { chosen_candidate_index: r.chosenCandidateIndex } : {}),
          ...(r.keepFactId !== undefined ? { keep_fact_id: r.keepFactId } : {}),
          ...(r.restore !== undefined ? { restore: r.restore } : {}),
          // restore_note lives in ONE place, detail.restore_note, on success (no_rows_promoted) and on refusal alike (spec §4.6/§8)
          ...(r.restoreNote !== undefined ? { detail: { restore_note: r.restoreNote } } : {}),
          ...(r.quarantined !== undefined ? { quarantined: r.quarantined } : {}),
        };
        // refusals carry only {error:<code>, detail?} (no hook/promoted/... nulls); same body shape as the claims route (接口对齐记录 #9)
        if (r.outcome === 'rule_failed' || r.outcome === 'invalid_choice' || r.outcome === 'conflict') extra = r.code !== undefined ? { error: r.code, ...(r.restoreNote !== undefined ? { detail: { restore_note: r.restoreNote } } : {}) } : {};
      } catch (e) {
        const mapped = factsOutcome(e);
        if (mapped === null) throw e;
        outcome = mapped.outcome;
        if (mapped.code !== undefined) extra = { error: mapped.code };
      }
    } else {
      outcome = await resolveQuarantine(client, id, { status: status as Resolution, resolvedBy: user.id });
    }
    const auditOutcome = auditAs === undefined ? (AUDITED.includes(outcome) ? outcome : null) : auditAs;
    if (auditOutcome !== null) {
      // Audit trail through the shared research_audit_log helper (service role, scoped to the
      // resolving admin). The resolution is already committed, so an audit failure is logged
      // rather than turned into a 500 that would invite a retry answered with 409.
      try {
        // A recovered 'resolved' row describes the persisted resolution (original resolver, accept,
        // committed ids); the retrying admin is recorded separately.
        if (recovered) {
          await audit({ supabase: admin as unknown as ResearchSupabase, userId: recovered.resolvedBy }, 'dq.quarantine_resolve', id, {
            id, status: recovered.status, outcome: auditOutcome, ...extra, chosen_fact_ids: recovered.chosenFactIds, recovered_by: recovered.recoveredBy, recovered_at: recovered.recoveredAt,
          });
        } else {
          await audit({ supabase: admin as unknown as ResearchSupabase, userId: user.id }, 'dq.quarantine_resolve', id, { id, status, outcome: auditOutcome, ...extra });
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
/bin/zsh -lc "rg -n 'resolve_lineage_conflict|issuer_id.*v_target|patch_quarantine_detail' supabase/migrations/20261107* | tail -25; ls -a .claude; find /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude -maxdepth 2 \\( -name AGENTS.md -o -name AGENTS.override.md \\); rg -n 'restore_note|runPendingHooks' src --glob '"'!*.test.ts'"'; sed -n '1,90p' src/lib/entities/identifiers.integration.test.ts; ls vitest*; git log -3 --oneline" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 70ms:
supabase/migrations/20261107090000_identifiers_and_dq.sql:740:-- patch_quarantine_detail is the only TS-side writer of dq_quarantine.detail once an item exists (the
supabase/migrations/20261107090000_identifiers_and_dq.sql:749:drop function if exists public.patch_quarantine_detail(uuid, text, jsonb);
supabase/migrations/20261107090000_identifiers_and_dq.sql:750:create or replace function public.patch_quarantine_detail(p_id uuid, p_key text, p_value jsonb, p_expect_hook_at text default null)
supabase/migrations/20261107090000_identifiers_and_dq.sql:765:revoke execute on function public.patch_quarantine_detail(uuid, text, jsonb, text) from public, anon, authenticated;
supabase/migrations/20261107090000_identifiers_and_dq.sql:766:grant execute on function public.patch_quarantine_detail(uuid, text, jsonb, text) to service_role;
supabase/migrations/20261107091000_facts_extensions.sql:18:--  (8b) fact_promote_rows predicates; adopt_candidate; restore_reconciled; resolve_lineage_conflict.
supabase/migrations/20261107091000_facts_extensions.sql:654:-- ---------------------------------------------------------------- 10. lineage verdict (spec §3.2 resolve_lineage_conflict, §4.4)
supabase/migrations/20261107091000_facts_extensions.sql:664:create or replace function public.resolve_lineage_conflict(p_item uuid, p_keep uuid, p_batch uuid, p_resolved_by uuid)
supabase/migrations/20261107091000_facts_extensions.sql:722:revoke execute on function public.resolve_lineage_conflict(uuid, uuid, uuid, uuid) from public, anon, authenticated;
supabase/migrations/20261107091000_facts_extensions.sql:723:grant execute on function public.resolve_lineage_conflict(uuid, uuid, uuid, uuid) to service_role;
supabase/migrations/20261107091000_facts_extensions.sql:734:  -- migration two: these two reasons close only through restore_reconciled / resolve_lineage_conflict
.
..
agents
launch.json
scratch
src/lib/dq/facts-resolver.ts:15://   the persisted target; promoted 0 → restoreNote 'no_rows_promoted' (the route's detail.restore_note, success and refusal alike) with the skipped reasons in restore.
src/lib/dq/facts-resolver.ts:50: /** why a reconcile_mismatch restore was refused before reaching SQL (route: detail.restore_note) */
src/lib/dq/pending-hooks.ts:47:export async function runPendingHooks(deps:PendingHookDeps):Promise<PendingHookReport>{
src/app/api/admin/dq/quarantine/[id]/route.ts:27:// plan 3 (§4.6): rule_failed / invalid_choice 400; conflict (generation_moved, conflict_exists, duplicate, replay_required, filing_not_found, not_passing, lineage_changed, scope_missing, unresolved, stale_evaluation, target_not_active, use_dedicated_resolver, read_truncated) 409; batch_mismatch is a 500; refusal bodies are {id, outcome, error:<code>, detail?:{restore_note}} (plan 3 接口对齐记录 #9).
src/app/api/admin/dq/quarantine/[id]/route.ts:122:          // restore_note lives in ONE place, detail.restore_note, on success (no_rows_promoted) and on refusal alike (spec §4.6/§8)
src/app/api/admin/dq/quarantine/[id]/route.ts:123:          ...(r.restoreNote !== undefined ? { detail: { restore_note: r.restoreNote } } : {}),
src/app/api/admin/dq/quarantine/[id]/route.ts:127:        if (r.outcome === 'rule_failed' || r.outcome === 'invalid_choice' || r.outcome === 'conflict') extra = r.code !== undefined ? { error: r.code, ...(r.restoreNote !== undefined ? { detail: { restore_note: r.restoreNote } } : {}) } : {};
// src/lib/entities/identifiers.integration.test.ts
// Plan 3 Task 1 (spec 3 §3.1, §9.2): migration 20261107090000 on real PostgreSQL. Task 1a covers the
// guarded column additions and their one-time backfill (a seeded pre-migration database is upgraded,
// new evidence is written, then the migration is replayed and must not rewrite it), every new
// constraint, service-role-only privileges on the new tables and the reconcile-raw bucket. Task 1b
// appends resolve_identifier_claim, the calendar pass functions and the topology guard.
// test:db builds a fresh cluster per run, so rows are not cleaned up (every test uses its own
// issuers and tickers). Calendar passes are the one shared resource (one open pass per market):
// every test that touches them runs inside withCalendarLock, a session advisory lock shared with
// Task 18's calendar.integration.test.ts.
import {readFileSync,readdirSync} from 'node:fs';
import {randomBytes,randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {Pool} from 'pg';
import type {PoolClient} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {SCHEMA_BOOTSTRAP_SQL} from '../../../scripts/s4/local-db';

const enabled=!!process.env.S4_TEST_STATE;
const MIGRATION='supabase/migrations/20261107090000_identifiers_and_dq.sql';
const VERSION='20261107090000';
const NEW_TABLES=['dq_reconcile_cycles','dq_reconcile_cursor','dq_calendar_passes','dq_calendar_pass_members','issuer_filer_categories','dq_filing_expectations','issuer_filing_profiles'];
const hex=(n:number)=>randomBytes(n).toString('hex').toUpperCase();
const SHA='a'.repeat(64);

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

type PgErr={message:string;code?:string};
/** Resolves with the rejection (message + SQLSTATE) so tests can assert both. */
const fails=(p:Promise<unknown>)=>p.then(()=>{throw new Error('expected rejection');},e=>e as PgErr);

// The bootstrap scripts/s4/local-db.ts runs before the migrations (roles are cluster-wide and exist).
const BOOTSTRAP=SCHEMA_BOOTSTRAP_SQL;

/** A throwaway database in the same cluster, migrated up to (not including) `version`; dropped afterwards. */
async function withPreMigrationDatabase(adminUrl:string,version:string,body:(db:Pool)=>Promise<void>):Promise<void>{
 const name='df3_upgrade_'+randomBytes(4).toString('hex');
 const root=new Pool({connectionString:adminUrl,max:1});
 await root.query(`create database ${name}`);
 const url=new URL(adminUrl);url.pathname=`/${name}`;
 const db=new Pool({connectionString:url.toString(),max:2});
 try{
  await db.query(BOOTSTRAP);
  for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')&&f<version).sort()){
   try{await db.query(readFileSync(join('supabase/migrations',f),'utf8'));}
   catch(e){throw new Error(`pre-migration ${f}: ${(e as Error).message}`);}
  }
  await body(db);
 }finally{
  await db.end();
  await root.query(`drop database if exists ${name} with (force)`);
  await root.end();
 }
}

/**
 * Calendar passes are one-open-per-market shared state. Every suite that touches them holds this
 * session advisory lock for the body and closes any open pass before and after, so concurrent
 * suites never see each other's leases (Task 18b's calendar.integration.test.ts uses the same key).
 * Plan 3 advisory-lock registry (接口对齐记录 #4): 724311001 = CALENDAR_TEST_LOCK (test-only, session);
 * the SQL function claim_calendar_pass uses pg_advisory_xact_lock(hashtext('dq_calendar_pass:'||market)).
 */
const CALENDAR_TEST_LOCK=724_311_001;
async function withCalendarLock(pool:Pool,body:()=>Promise<void>):Promise<void>{
 const c=await pool.connect();
 try{
  await c.query('select pg_advisory_lock($1)',[CALENDAR_TEST_LOCK]);
  const close=()=>c.query(`update public.dq_calendar_passes set status='complete_with_failures',finished_at=clock_timestamp() where finished_at is null`);
  await close();
  try{await body();}finally{await close();}
 }finally{
  await c.query('select pg_advisory_unlock($1)',[CALENDAR_TEST_LOCK]).catch(()=>{});
  c.release();
 }
vitest.config.ts
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-qCaNMRaA' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-7eGQh2PR' (errno=Operation not permitted)
a4b2a10 fix(dq): drop the 3-arg patch_quarantine_detail, scanner targetOf isolation, persisted lineage target, single restore_note (Task 11 quality review)
d513043 fix(dq): hook compare-and-set, persisted recovery choices, scanner write accounting, batch_mismatch stays 500 (Task 11 review)
0094157 feat(dq): candidate adoption, restore and lineage verdict dispatch, pending-hook scan, E8 (F3-4)

codex
No actionable regressions were identified in the commit. The changes consistently update restore-note responses, isolate scanner failures, and use persisted lineage targets. Tests were inspected but not executed.
No actionable regressions were identified in the commit. The changes consistently update restore-note responses, isolate scanner failures, and use persisted lineage targets. Tests were inspected but not executed.

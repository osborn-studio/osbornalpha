OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b013-1e0b-7d42-9455-45586c3d2046
--------
user
commit 4e9d1db
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 4e9d1db; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 440ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-jyR5HBtz' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-VsPH4Oh6' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/5a-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/5a-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/5a-review-fix2.md
?? docs/audits/2026-11-05-data-foundation-3/codex/5a-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-6VkhMs66' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-KZ4LcKCi' (errno=Operation not permitted)
4e9d1db fix(entities): window backfill round 2 (page_overflow guard, per-ticker lock in claim attach/backdate, close attempted at current start, memory twin issuer check)
 src/lib/db/memory-table-client.ts                  |  1 +
 src/lib/db/table-client.test.ts                    |  2 ++
 src/lib/entities/backfill-windows.test.ts          | 22 ++++++++++++++----
 src/lib/entities/identifiers.integration.test.ts   | 27 ++++++++++++++++++++++
 src/lib/entities/windows.ts                        | 22 ++++++++++--------
 supabase/migrations.lock.json                      |  2 +-
 .../20261107090000_identifiers_and_dq.sql          |  5 ++++
 7 files changed, 67 insertions(+), 14 deletions(-)

exec
/bin/zsh -lc 'pwd; for p in /AGENTS.md /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do test ! -f "$p" || { echo "$p"; cat "$p"; }; done; ls -a | head -25; git show 4e9d1db --; cat src/lib/entities/windows.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
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
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-hQzFxPop' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-Bz6zRIv8' (errno=Operation not permitted)
commit 4e9d1dbbbb4c81ccd8d2b28ae64dae295ca7da5e
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 00:56:29 2026 -0800

    fix(entities): window backfill round 2 (page_overflow guard, per-ticker lock in claim attach/backdate, close attempted at current start, memory twin issuer check)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/db/memory-table-client.ts b/src/lib/db/memory-table-client.ts
index 3c71712..2c99cbf 100644
--- a/src/lib/db/memory-table-client.ts
+++ b/src/lib/db/memory-table-client.ts
@@ -78,6 +78,7 @@ const MEMORY_RPC:Record<string,(rowsOf:(t:string)=>Row[],a:Row)=>unknown>={
   const side=a.p_side,pv=a.p_provenance,nd=a.p_new_date;
   if((side!=='from'&&side!=='to')||typeof nd!=='string'||!isObj(pv)||Object.keys(pv).length!==1||!(`valid_${side}` in pv))
    throw new TableError('rpc','set_security_window','invalid_window_write','22023');
+  if(!rowsOf('issuers').some(r=>r.issuer_id===a.p_issuer))return 'not_found';
   const row=rowsOf('issuer_securities').find(r=>r.issuer_id===a.p_issuer&&r.ticker===a.p_ticker&&r.valid_from===a.p_valid_from);
   if(!row)return 'not_found';
   const prov=isObj(row.provenance)?row.provenance:{};
diff --git a/src/lib/db/table-client.test.ts b/src/lib/db/table-client.test.ts
index 0e41083..8d6c330 100644
--- a/src/lib/db/table-client.test.ts
+++ b/src/lib/db/table-client.test.ts
@@ -245,6 +245,7 @@ describe('rpc (plan 3 row-locking functions; plan audit P3/P4/R2)',()=>{
  });
  it('memoryTableClient emulates set_security_window: from/to written, duplicate, conflict (state, earliest row), not_found, invalid_window_write',async()=>{
   const c=memoryTableClient();
+  await c.insert('issuers',{issuer_id:'i'});
   await c.insert('issuer_securities',{issuer_id:'i',ticker:'X',valid_from:'2024-03-01',valid_to:null,valid_from_method:'first_observed',valid_to_method:null,provenance:{exchange:'SSE'}});
   const args=(side:string,from:string,date:string,pv:unknown)=>({p_issuer:'i',p_ticker:'X',p_valid_from:from,p_side:side,p_new_date:date,p_provenance:pv});
   const WF={valid_from:{source:'u'}},WT={valid_to:{source:'u'}};
@@ -258,6 +259,7 @@ describe('rpc (plan 3 row-locking functions; plan audit P3/P4/R2)',()=>{
   expect(await callRpc(c,'set_security_window',args('to','2001-08-27','2026-07-01',WT))).toBe('conflict');
   expect(c.rows('issuer_securities')[0]).toMatchObject({valid_from:'2001-08-27',valid_to:'2026-06-30',valid_from_method:'listing_date',valid_to_method:'delisting',provenance:{exchange:'SSE',...WF,...WT}});
   expect(await callRpc(c,'set_security_window',args('from','1999-01-01','1990-01-01',WF))).toBe('not_found');
+  expect(await callRpc(c,'set_security_window',{...args('from','2001-08-27','1990-01-01',WF),p_issuer:'ghost'})).toBe('not_found');
   await c.insert('issuer_securities',{issuer_id:'j',ticker:'X',valid_from:'1995-01-01',valid_to:'1996-01-01',valid_from_method:'first_observed',valid_to_method:'unrecorded',provenance:{}});
   await c.update('issuer_securities',{issuer_id:'i',ticker:'X'},{valid_from_method:'first_observed'});
   expect(await callRpc(c,'set_security_window',args('from','2001-08-27','1998-01-01',WF))).toBe('conflict');   // an earlier holding exists
diff --git a/src/lib/entities/backfill-windows.test.ts b/src/lib/entities/backfill-windows.test.ts
index 9a5da81..4fa9bec 100644
--- a/src/lib/entities/backfill-windows.test.ts
+++ b/src/lib/entities/backfill-windows.test.ts
@@ -57,6 +57,7 @@ describe('applyWindowBackfill',()=>{
  const row=(o:Partial<WindowRow>={})=>({...w(o),isin:null,figi:null,share_class:'A',is_primary:true,source:'curated'});
  it('applies guarded updates and quarantines evidence conflicts',async()=>{
   const c=memoryTableClient({dq_quarantine:['id']});
+  await c.insert('issuers',{issuer_id:'i1'});
   await c.insert('issuer_securities',row({}));
   await c.insert('issuer_securities',row({ticker:'000001.SZ',valid_from:'1980-01-01'}));
   const plan=planWindowBackfill([w({}),w({ticker:'000001.SZ',valid_from:'1980-01-01'})],new Map([u('600519.SH',{delist_date:'2026-06-30'}),u('000001.SZ',{list_date:'1991-04-03'})]),ASOF);
@@ -67,16 +68,17 @@ describe('applyWindowBackfill',()=>{
   expect(c.rows('dq_quarantine')).toEqual([expect.objectContaining({dataset:DATASET,table_name:'issuer_securities',natural_key:'000001.SZ:1980-01-01',reason_code:'window_evidence_conflict',status:'open'})]);
   expect(res.counts).toMatchObject({fetched:3,versioned:2,quarantined:1,failed:0});
  });
- it('an exclusion violation is an ownership_conflict and blocks the same row\'s close',async()=>{
+ it('an exclusion violation on the listing date is an ownership_conflict; the close is still attempted at the row\'s current start',async()=>{
   const c=memoryTableClient({dq_quarantine:['id']});
+  await c.insert('issuers',{issuer_id:'i1'});
   await c.insert('issuer_securities',row({}));
   const failing:TableClient={...c,rpc:async(fn,args)=>{if(fn==='set_security_window'&&args.p_side==='from')throw new TableError('rpc',fn,'conflicting key value violates exclusion constraint "issuer_securities_no_overlap"','23P01');return c.rpc(fn,args);}};
   const plan=planWindowBackfill([w({})],new Map([u('600519.SH',{delist_date:'2026-06-30'})]),ASOF);
   const res=await applyWindowBackfill(failing,plan,{batchId:BATCH,dataset:DATASET});
   expect(c.rows('dq_quarantine').map(q=>q.reason_code)).toEqual(['ownership_conflict']);
-  expect(c.rows('issuer_securities')[0]).toMatchObject({valid_from:'2024-03-01',valid_to:null});
-  expect(res.counts).toMatchObject({quarantined:1,failed:1,versioned:0});
-  expect(res.errors.map(e=>e.code)).toEqual(['ownership_conflict','blocked_by_from_change']);
+  expect(c.rows('issuer_securities')[0]).toMatchObject({valid_from:'2024-03-01',valid_to:'2026-06-30',valid_to_method:'delisting'});
+  expect(res.counts).toMatchObject({quarantined:1,failed:0,versioned:1});
+  expect(res.errors.map(e=>e.code)).toEqual(['ownership_conflict']);
  });
 });
 
@@ -84,6 +86,7 @@ describe('conflicts after a backdate, aggregation, paging, freshness',()=>{
  const row=(o:Partial<WindowRow>={})=>({...w(o),isin:null,figi:null,share_class:'A',is_primary:true,source:'curated'});
  it('a conflict on a row whose backdate landed is parked under the CURRENT key with the original snapshot, and E2 counts it',async()=>{
   const c=memoryTableClient({dq_quarantine:['id']});
+  await c.insert('issuers',{issuer_id:'i1'});
   await c.insert('issuer_securities',row({}));
   const u1=new Map([u('600519.SH',{delist_date:'2000-01-01'})]);
   const plan=planWindowBackfill([w({})],u1,ASOF);
@@ -100,6 +103,7 @@ describe('conflicts after a backdate, aggregation, paging, freshness',()=>{
  });
  it('two conflicts on one row persist as ONE item carrying both reasons and both evidence rows',async()=>{
   const c=memoryTableClient({dq_quarantine:['id']});
+  await c.insert('issuers',{issuer_id:'i1'});
   await c.insert('issuer_securities',row({valid_from:'2000-01-01'}));
   const plan=planWindowBackfill([w({valid_from:'2000-01-01'})],new Map([u('600519.SH',{list_date:'2001-08-27',delist_date:'1999-12-31'})]),ASOF);
   expect(plan.conflicts.map(x=>x.reason)).toEqual(['list_date_after_first_observed','delist_on_or_before_valid_from']);
@@ -111,6 +115,16 @@ describe('conflicts after a backdate, aggregation, paging, freshness',()=>{
    {reason:'delist_on_or_before_valid_from',delist_date:'1999-12-31',valid_from:'2000-01-01',source:'tushare_stock_basic'}]});
   expect(res.counts).toMatchObject({quarantined:1,failed:0});
  });
+ it('keysetAll never truncates silently: A,A,A,B with a cap of 3 either returns all rows or throws page_overflow',async()=>{
+  const c=memoryTableClient();
+  let i=0;for(const t of ['A','A','A','B'])await c.insert('t',{ticker:t,issuer_id:`i${i++}`,valid_from:'2020-01-01'});
+  const capped:TableClient={...c,select:(t,m,o)=>c.select(t,m,{...o,limit:Math.min(o?.limit??3,3)})};
+  await expect(keysetAll(capped,'t',{},{},'ticker',['issuer_id','ticker','valid_from'])).rejects.toThrow('page_overflow');
+  expect(await keysetAll(c,'t',{},{},'ticker',['issuer_id','ticker','valid_from'])).toHaveLength(4);
+  const exact=memoryTableClient();await exact.insert('t',{ticker:'A',issuer_id:'x',valid_from:'d'});await exact.insert('t',{ticker:'A',issuer_id:'y',valid_from:'d'});await exact.insert('t',{ticker:'A',issuer_id:'z',valid_from:'d'});
+  const cap3:TableClient={...exact,select:(t,m,o)=>exact.select(t,m,{...o,limit:Math.min(o?.limit??3,3)})};
+  expect(await keysetAll(cap3,'t',{},{},'ticker',['issuer_id','ticker','valid_from'])).toHaveLength(3);   // a full last group is the end, not an overflow
+ });
  it('keysetAll continues past a short page when the server caps pages below MAX_PAGE',async()=>{
   const c=memoryTableClient();
   const tickers=['A','B','B','C','D','E','F','F','G'];
diff --git a/src/lib/entities/identifiers.integration.test.ts b/src/lib/entities/identifiers.integration.test.ts
index a48ee88..508401f 100644
--- a/src/lib/entities/identifiers.integration.test.ts
+++ b/src/lib/entities/identifiers.integration.test.ts
@@ -1090,6 +1090,33 @@ describe.skipIf(!enabled)('plan 3 migration one: row-locked jsonb patches (appen
    expect(await second).toBe('written');
   });
  });
+ it('claim attach_security / backdate_window and set_security_window on one ticker serialise on the per-ticker advisory lock (issuer -> row -> advisory)',async()=>{
+  // attach: the claim inserts a holding of ANOTHER issuer while it holds the lock; the window write waits for it (an attach is open-ended, so it can only follow)
+  const a=await issuer(),b=await issuer();const t=await ticker();
+  await sec(a,t,'2024-03-01','2025-01-01',{valid_to_method:'curated'});
+  const id=await newClaim({issuer:b,id_type:'ticker',value:t,op:'attach_security',target:{issuer_id:b},params:{share_class:'A',valid_from:'2030-01-01',valid_from_method:'curated',source:'x'}});
+  await inTx(admin,async tx=>{
+   expect(await resolve(id,'accepted',null,REVIEWER,tx.c)).toMatchObject({applied:true});
+   const second=setWin(a,t,'2024-03-01','from','2001-08-27',WF);
+   await stillBlockedBehind(admin,tx.pid,second);
+   await tx.commit();
+   expect(await second).toBe('written');
+  });
+  expect((await q(`select issuer_id from public.issuer_securities where ticker=$1 and valid_from_method='listing_date'`,[t])).map(r=>r.issuer_id)).toEqual([a]);   // only the earliest row is marked
+  // backdate: the claim holds the lock after locking its row
+  const c=await issuer(),d=await issuer();const t2=await ticker();
+  await sec(c,t2,'2024-03-01',null);
+  await sec(d,t2,'1990-01-01','1995-01-01',{valid_to_method:'curated'});
+  const bd=await newClaim({issuer:d,id_type:'ticker',value:t2,op:'backdate_window',target:{issuer_id:d,ticker:t2,valid_from:'1990-01-01'},params:{new_valid_from:'1980-01-01',valid_from_method:'curated'}});
+  await inTx(admin,async tx=>{
+   expect(await resolve(bd,'accepted',null,REVIEWER,tx.c)).toMatchObject({applied:true});
+   const second=setWin(c,t2,'2024-03-01','from','2001-08-27',WF);
+   await stillBlockedBehind(admin,tx.pid,second);
+   await tx.commit();
+   expect(await second).toBe('conflict');
+  });
+  expect((await q(`select count(*)::int n from public.issuer_securities where ticker=$1 and valid_from_method='listing_date'`,[t2]))[0].n).toBe(0);
+ });
  it('set_security_window refuses a backdate into an earlier holding of the same ticker (earliest-row guard, before the exclusion constraint)',async()=>{
   const a=await issuer();const t=await ticker();
   await sec(a,t,'2010-01-01','2015-01-01',{valid_to_method:'unrecorded'});
diff --git a/src/lib/entities/windows.ts b/src/lib/entities/windows.ts
index bb98c5c..adf11a0 100644
--- a/src/lib/entities/windows.ts
+++ b/src/lib/entities/windows.ts
@@ -26,18 +26,25 @@ export interface WindowPlan{changes:WindowChange[];conflicts:WindowConflict[];un
 /**
  * Pages a table by a NON-unique order column with gte cursors, de-duplicating on keyCols (same
  * approach as the private helper in facts/scope.ts). The server may cap a page below MAX_PAGE, so
- * a short page is NOT the end: paging continues until a page adds no unseen row. Assumes no single
- * order value has more rows than the server cap (a ticker has a handful of holding rows).
+ * a short page is NOT the end: paging continues until a page adds no unseen row. When that happens
+ * a probe (offset = page length) decides: nothing beyond the page means the end; any further row
+ * means one order value has more rows than the server returns per page and the result would be
+ * silently truncated, so it throws page_overflow instead.
  */
 export async function keysetAll(tables:TableClient,table:string,match:Row,range:RangeOptions,orderBy:string,keyCols:readonly string[]):Promise<Row[]>{
  const seen=new Set<string>(),out:Row[]=[];
  let cursor:string|null=null;
  for(;;){
   const gte={...range.gte,...(cursor===null?{}:{[orderBy]:cursor})};
-  const page=await tables.select(table,match,{...range,gte,orderBy,limit:MAX_PAGE});
+  const opts={...range,gte,orderBy};
+  const page=await tables.select(table,match,{...opts,limit:MAX_PAGE});
   let added=0;
   for(const r of page){const k=keyCols.map(c=>String(r[c])).join('\u0000');if(!seen.has(k)){seen.add(k);out.push(r);added++;}}
-  if(page.length===0||added===0)return out;
+  if(page.length===0)return out;
+  if(added===0){
+   if((await tables.select(table,match,{...opts,offset:page.length,limit:1})).length>0)throw new Error('page_overflow');
+   return out;
+  }
   cursor=String(page[page.length-1][orderBy]);
  }
 }
@@ -90,23 +97,19 @@ export async function applyWindowBackfill(tables:TableClient,plan:WindowPlan,opt
  const park=(r:WindowRow,reason:'ownership_conflict'|'window_evidence_conflict',detail:Record<string,unknown>)=>parkConflict(tables,{
   dataset:opts.dataset,table:'issuer_securities',naturalKey:keyOf(r),reasonCode:reason,detail,payload:snapshot(r),batchId:opts.batchId,
  },counts,errors,{code:reason,key:keyOf(r)});
- const blocked=new Set<string>();
  for(const c of plan.changes){
   const id=idOf(c.row);
-  if(c.kind==='to'&&blocked.has(id)){counts.failed++;errors.push({code:'blocked_by_from_change',key:keyOf(c.row)});continue;}
   try{
    const out=await callRpc(tables,'set_security_window',c.kind==='from'
     ?{p_issuer:c.row.issuer_id,p_ticker:c.row.ticker,p_valid_from:c.row.valid_from,p_side:'from',p_new_date:c.newValidFrom,p_provenance:c.provenance}
-    :{p_issuer:c.row.issuer_id,p_ticker:c.row.ticker,p_valid_from:c.validFrom,p_side:'to',p_new_date:c.newValidTo,p_provenance:c.provenance});
+    :{p_issuer:c.row.issuer_id,p_ticker:c.row.ticker,p_valid_from:fromOf(c.row),p_side:'to',p_new_date:c.newValidTo,p_provenance:c.provenance});
    if(out==='written'||out==='duplicate'){
     if(c.kind==='from')current.set(id,c.newValidFrom);
     if(out==='written')counts.versioned++;else counts.duplicates++;
     continue;
    }
-   if(c.kind==='from')blocked.add(id);
    counts.failed++;errors.push({code:'row_changed',key:keyOf(c.row),message:`${c.kind}:${String(out)}`});
   }catch(e){
-   if(c.kind==='from')blocked.add(id);
    if(isUnique(e)){await park(c.row,'ownership_conflict',{reason:'window_overlaps_other_row',change:c.kind,new_value:c.kind==='from'?c.newValidFrom:c.newValidTo});continue;}
    counts.failed++;errors.push({code:'window_write_error',key:keyOf(c.row),message:errorMessage(e)});
   }
@@ -115,6 +118,7 @@ export async function applyWindowBackfill(tables:TableClient,plan:WindowPlan,opt
  const byRow=new Map<string,WindowConflict[]>();
  for(const x of plan.conflicts){const l=byRow.get(idOf(x.row))??[];l.push(x);byRow.set(idOf(x.row),l);}
  for(const xs of byRow.values())await park(xs[0].row,'window_evidence_conflict',{reason:xs[0].reason,reasons:xs.map(x=>x.reason),conflicts:xs.map(x=>({reason:x.reason,...x.detail}))});
+ // fetched counts write attempts and parked conflicts (one per outcome), not source rows
  counts.fetched=counts.inserted+counts.duplicates+counts.versioned+counts.quarantined+counts.failed;
  const skippedSummary:Record<string,number>={};
  for(const s of plan.skipped)skippedSummary[s]=(skippedSummary[s]??0)+1;
diff --git a/supabase/migrations.lock.json b/supabase/migrations.lock.json
index f1e8af1..e79a82c 100644
--- a/supabase/migrations.lock.json
+++ b/supabase/migrations.lock.json
@@ -203,7 +203,7 @@
     },
     {
       "file": "20261107090000_identifiers_and_dq.sql",
-      "sha256": "cfacdaa428d9bdede32bae861716865169d719ace3f0858d93c15f00c576d39e"
+      "sha256": "4c560a0ff34819da51f38f55f42f02c269380967341fef1156871e3284c9e200"
     }
   ]
 }
diff --git a/supabase/migrations/20261107090000_identifiers_and_dq.sql b/supabase/migrations/20261107090000_identifiers_and_dq.sql
index dd38796..0f74ee8 100644
--- a/supabase/migrations/20261107090000_identifiers_and_dq.sql
+++ b/supabase/migrations/20261107090000_identifiers_and_dq.sql
@@ -536,12 +536,17 @@ begin
       if not exists (select 1 from public.stocks_universe where ticker = v_ticker) then
         raise exception 'invalid_claim' using errcode = '22023', detail = 'params.ticker';
       end if;
+      -- same per-ticker advisory lock as set_security_window (issuer -> row -> advisory): a window write cannot interleave with an insert that could precede it
+      perform pg_advisory_xact_lock(hashtext('issuer_securities_ticker:' || v_ticker));
       insert into public.issuer_securities(issuer_id, ticker, isin, share_class, is_primary, valid_from, valid_to, valid_from_method, valid_to_method, source, provenance)
       values (c.issuer_id, v_ticker, nullif(pa ->> 'isin', ''), pa ->> 'share_class', false, (pa ->> 'valid_from')::date, null, pa ->> 'valid_from_method', null, pa ->> 'source', v_pw);
     elsif v_op = 'close_security' then
       update public.issuer_securities set valid_to = (pa ->> 'valid_to')::date, valid_to_method = pa ->> 'valid_to_method', provenance = provenance || v_pw
       where issuer_id = c.issuer_id and ticker = t ->> 'ticker' and valid_from = (t ->> 'valid_from')::date and valid_to is null;
     elsif v_op = 'backdate_window' then
+      -- lock order issuer -> row -> per-ticker advisory lock, as in set_security_window
+      perform 1 from public.issuer_securities where issuer_id = c.issuer_id and ticker = t ->> 'ticker' and valid_from = (t ->> 'valid_from')::date for update;
+      perform pg_advisory_xact_lock(hashtext('issuer_securities_ticker:' || (t ->> 'ticker')));
       update public.issuer_securities set valid_from = (pa ->> 'new_valid_from')::date, valid_from_method = pa ->> 'valid_from_method', provenance = provenance || v_pw
       where issuer_id = c.issuer_id and ticker = t ->> 'ticker' and valid_from = (t ->> 'valid_from')::date;
     else
// src/lib/entities/windows.ts
// Evidenced holding windows (spec §4.3.1–§4.3.2). planWindowBackfill is pure: per ticker it lifts
// the EARLIEST holding row's valid_from to stocks_universe.list_date (method listing_date) and
// closes the LATEST open row at delist_date (method delisting), copying the exact source-row
// values into a SINGLE provenance key (never a reference to the mutable universe table, never a whole-object
// copy: the database merges the key atomically in set_security_window). A listing date after
// the first observation, or a delisting on/before valid_from, is a window_evidence_conflict
// (quarantined, row unchanged). US tickers carry no list_date and are left as first_observed.
// applyWindowBackfill writes through the guarded RPC set_security_window; exclusion/unique violations become ownership_conflict.
import {MAX_PAGE,callRpc,type RangeOptions,type Row,type TableClient} from '../db/table-client';
import {emptyCounts,type BatchCounts,type BatchError,type BatchStatus} from '../dq/batches';
import {isUnique} from './claims';
import {errorMessage,loaderOutcome,parkConflict,withSkippedSummary,type ApplyResult} from './load-sec';
import {sanitizeProvenance} from './provenance';

export const WINDOWS_RULES_VERSION='windows/1';
export const SEC_ROW_KEY=['issuer_id','ticker','valid_from'] as const;
export interface UniverseDates{ticker:string;list_date:string|null;delist_date:string|null;source:string|null;source_updated_at:string|null}
export interface WindowRow{issuer_id:string;ticker:string;valid_from:string;valid_to:string|null;valid_from_method:string;valid_to_method:string|null;provenance:Record<string,unknown>}
export type WindowChange=
 |{kind:'from';row:WindowRow;newValidFrom:string;provenance:Record<string,unknown>}
 |{kind:'to';row:WindowRow;validFrom:string;newValidTo:string;provenance:Record<string,unknown>};
export interface WindowConflict{row:WindowRow;reason:'list_date_after_first_observed'|'delist_on_or_before_valid_from';detail:Record<string,unknown>}
export interface WindowPlan{changes:WindowChange[];conflicts:WindowConflict[];unchanged:number;skipped:string[]}

/**
 * Pages a table by a NON-unique order column with gte cursors, de-duplicating on keyCols (same
 * approach as the private helper in facts/scope.ts). The server may cap a page below MAX_PAGE, so
 * a short page is NOT the end: paging continues until a page adds no unseen row. When that happens
 * a probe (offset = page length) decides: nothing beyond the page means the end; any further row
 * means one order value has more rows than the server returns per page and the result would be
 * silently truncated, so it throws page_overflow instead.
 */
export async function keysetAll(tables:TableClient,table:string,match:Row,range:RangeOptions,orderBy:string,keyCols:readonly string[]):Promise<Row[]>{
 const seen=new Set<string>(),out:Row[]=[];
 let cursor:string|null=null;
 for(;;){
  const gte={...range.gte,...(cursor===null?{}:{[orderBy]:cursor})};
  const opts={...range,gte,orderBy};
  const page=await tables.select(table,match,{...opts,limit:MAX_PAGE});
  let added=0;
  for(const r of page){const k=keyCols.map(c=>String(r[c])).join('\u0000');if(!seen.has(k)){seen.add(k);out.push(r);added++;}}
  if(page.length===0)return out;
  if(added===0){
   if((await tables.select(table,match,{...opts,offset:page.length,limit:1})).length>0)throw new Error('page_overflow');
   return out;
  }
  cursor=String(page[page.length-1][orderBy]);
 }
}

const byFrom=(a:WindowRow,b:WindowRow)=>a.valid_from<b.valid_from?-1:a.valid_from>b.valid_from?1:0;

export function planWindowBackfill(rows:readonly WindowRow[],universe:ReadonlyMap<string,UniverseDates>,asOf:string):WindowPlan{
 const byTicker=new Map<string,WindowRow[]>();
 for(const r of rows){const l=byTicker.get(r.ticker)??[];l.push(r);byTicker.set(r.ticker,l);}
 const plan:WindowPlan={changes:[],conflicts:[],unchanged:0,skipped:[]};
 for(const ticker of [...byTicker.keys()].sort()){
  const list=[...byTicker.get(ticker)!].sort(byFrom);
  const u=universe.get(ticker);
  if(!u){plan.skipped.push('not_in_universe');continue;}
  const first=list[0],last=list[list.length-1];
  let firstFrom=first.valid_from;
  if(u.list_date===null)plan.skipped.push('no_list_date');
  else if(first.valid_from_method==='listing_date')plan.unchanged++;
  else if(first.valid_from_method!=='first_observed'&&first.valid_from_method!=='curated')plan.skipped.push(`method_${first.valid_from_method}`);
  else if(u.list_date>first.valid_from)plan.conflicts.push({row:first,reason:'list_date_after_first_observed',detail:{list_date:u.list_date,valid_from:first.valid_from,source:u.source}});
  else{
   const provenance=sanitizeProvenance({valid_from:{source:'stocks_universe.list_date',provider:u.source,as_of:asOf,row:{list_date:u.list_date,source:u.source,source_updated_at:u.source_updated_at}}});
   firstFrom=u.list_date;
   plan.changes.push({kind:'from',row:first,newValidFrom:firstFrom,provenance});
  }
  if(u.delist_date!==null&&last.valid_to===null){
   const vf=last===first?firstFrom:last.valid_from;
   if(u.delist_date<=vf)plan.conflicts.push({row:last,reason:'delist_on_or_before_valid_from',detail:{delist_date:u.delist_date,valid_from:vf,source:u.source}});
   else plan.changes.push({kind:'to',row:last,validFrom:vf,newValidTo:u.delist_date,provenance:sanitizeProvenance({valid_to:{source:'stocks_universe.delist_date',provider:u.source,as_of:asOf,row:{delist_date:u.delist_date,source:u.source,source_updated_at:u.source_updated_at}}})});
  }
 }
 plan.skipped.sort();
 return plan;
}

/** Freshness/exit policy of the window backfill: rows moved by a backfill (versioned) are landed rows, so a partial run that backfilled and only quarantined conflicts is still a good attempt. */
export function windowsOutcome(status:BatchStatus,counts:BatchCounts):{ok:boolean;exitCode:0|1}{
 return loaderOutcome(status,{...counts,duplicates:counts.duplicates+counts.versioned});
}

export async function applyWindowBackfill(tables:TableClient,plan:WindowPlan,opts:{batchId:string;dataset:string}):Promise<ApplyResult>{
 const counts=emptyCounts();const errors:BatchError[]=[];
 counts.duplicates=plan.unchanged;
 const idOf=(r:WindowRow)=>`${r.issuer_id}|${r.ticker}|${r.valid_from}`;
 // a row's CURRENT valid_from (its natural key), which moves when its backdate lands
 const current=new Map<string,string>();
 const fromOf=(r:WindowRow)=>current.get(idOf(r))??r.valid_from;
 const keyOf=(r:WindowRow)=>`${r.ticker}:${fromOf(r)}`;
 const snapshot=(r:WindowRow)=>({issuer_id:r.issuer_id,ticker:r.ticker,valid_from:r.valid_from,valid_to:r.valid_to,valid_from_method:r.valid_from_method,current_valid_from:fromOf(r)});
 const park=(r:WindowRow,reason:'ownership_conflict'|'window_evidence_conflict',detail:Record<string,unknown>)=>parkConflict(tables,{
  dataset:opts.dataset,table:'issuer_securities',naturalKey:keyOf(r),reasonCode:reason,detail,payload:snapshot(r),batchId:opts.batchId,
 },counts,errors,{code:reason,key:keyOf(r)});
 for(const c of plan.changes){
  const id=idOf(c.row);
  try{
   const out=await callRpc(tables,'set_security_window',c.kind==='from'
    ?{p_issuer:c.row.issuer_id,p_ticker:c.row.ticker,p_valid_from:c.row.valid_from,p_side:'from',p_new_date:c.newValidFrom,p_provenance:c.provenance}
    :{p_issuer:c.row.issuer_id,p_ticker:c.row.ticker,p_valid_from:fromOf(c.row),p_side:'to',p_new_date:c.newValidTo,p_provenance:c.provenance});
   if(out==='written'||out==='duplicate'){
    if(c.kind==='from')current.set(id,c.newValidFrom);
    if(out==='written')counts.versioned++;else counts.duplicates++;
    continue;
   }
   counts.failed++;errors.push({code:'row_changed',key:keyOf(c.row),message:`${c.kind}:${String(out)}`});
  }catch(e){
   if(isUnique(e)){await park(c.row,'ownership_conflict',{reason:'window_overlaps_other_row',change:c.kind,new_value:c.kind==='from'?c.newValidFrom:c.newValidTo});continue;}
   counts.failed++;errors.push({code:'window_write_error',key:keyOf(c.row),message:errorMessage(e)});
  }
 }
 // one quarantine item per row, carrying every conflict reason and its evidence row
 const byRow=new Map<string,WindowConflict[]>();
 for(const x of plan.conflicts){const l=byRow.get(idOf(x.row))??[];l.push(x);byRow.set(idOf(x.row),l);}
 for(const xs of byRow.values())await park(xs[0].row,'window_evidence_conflict',{reason:xs[0].reason,reasons:xs.map(x=>x.reason),conflicts:xs.map(x=>({reason:x.reason,...x.detail}))});
 // fetched counts write attempts and parked conflicts (one per outcome), not source rows
 counts.fetched=counts.inserted+counts.duplicates+counts.versioned+counts.quarantined+counts.failed;
 const skippedSummary:Record<string,number>={};
 for(const s of plan.skipped)skippedSummary[s]=(skippedSummary[s]??0)+1;
 return {counts,errors:withSkippedSummary(errors,skippedSummary),skippedSummary,rejectedSummary:{}};
}

exec
/bin/zsh -lc "sed -n '370,560p' supabase/migrations/20261107090000_identifiers_and_dq.sql; rg -n 'set_security_window|advisory|for update' supabase/migrations/20261107090000_identifiers_and_dq.sql; sed -n '760,900p' supabase/migrations/20261107090000_identifiers_and_dq.sql; cat src/lib/db/table-client.ts | head -150; find . -iname '*agents*' -o -name CLAUDE.md; for p in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/AGENTS.md; do test "'! -f "$p" || cat "$p"; done' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 60ms:
  if p_op in ('set_identifier','correct_identifier') then
    if p_id_type in ('lei','cik','usci','cninfo_org_id') then
      if full_target then return 'target'; end if;
    elsif p_id_type in ('isin','figi') then
      if not full_target then return 'target'; end if;
    else
      return 'op_id_type';
    end if;
    if p_op = 'set_identifier' then
      if not public.claim_keys_within(pa, array['candidates','note'])
         or (pa ? 'candidates' and jsonb_typeof(pa -> 'candidates') <> 'array')
         or (pa ? 'note' and jsonb_typeof(pa -> 'note') <> 'string') then return 'params'; end if;
    else
      if not public.claim_keys_within(pa, array['expected_current','new_value','candidates','note'])
         or jsonb_typeof(pa -> 'expected_current') is distinct from 'string' or length(pa ->> 'expected_current') not between 1 and 64
         or jsonb_typeof(pa -> 'new_value') is distinct from 'string' or length(pa ->> 'new_value') not between 1 and 64
         or pa ->> 'expected_current' = pa ->> 'new_value' then return 'params'; end if;
      if pa ->> 'new_value' is distinct from p_value then return 'params.new_value'; end if;
    end if;
    allowed := array[p_id_type];
  elsif p_op = 'attach_security' then
    if p_id_type <> 'ticker' or full_target then return 'op_id_type'; end if;
    if not public.claim_keys_within(pa, array['share_class','valid_from','valid_from_method','source','isin','note','ticker'])
       or coalesce(pa ->> 'share_class', '') not in ('A','H','ADR','common','preferred','other','unknown')
       or not public.claim_text_is_date(pa ->> 'valid_from')
       or coalesce(pa ->> 'valid_from_method', '') not in ('first_observed','listing_date','ticker_change','curated')
       or jsonb_typeof(pa -> 'source') is distinct from 'string' or length(pa ->> 'source') not between 1 and 64
       or (pa ? 'isin' and coalesce(jsonb_typeof(pa -> 'isin'), '') not in ('string','null'))
       or (pa ? 'ticker' and (jsonb_typeof(pa -> 'ticker') is distinct from 'string' or (pa ->> 'ticker') !~ '^[A-Z0-9][A-Z0-9.-]{0,31}$')) then return 'params'; end if;
    -- the inserted ticker is params.ticker, else the claim value (which an evidence_only amendment leaves as the accession)
    if not (pa ? 'ticker') and p_value !~ '^[A-Z0-9][A-Z0-9.-]{0,31}$' then return 'params.ticker'; end if;
    if jsonb_typeof(pa -> 'isin') = 'string' and (pa ->> 'isin') !~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$' then return 'params'; end if;
    allowed := array['isin','figi','valid_from'];
  elsif p_op in ('close_security','backdate_window') then
    if p_id_type <> 'ticker' or not full_target then return 'op_id_type'; end if;
    if t ->> 'ticker' is distinct from p_value then return 'target.ticker'; end if;
    if p_op = 'close_security' then
      if not public.claim_keys_within(pa, array['valid_to','valid_to_method','note'])
         or not public.claim_text_is_date(pa ->> 'valid_to')
         or coalesce(pa ->> 'valid_to_method', '') not in ('delisting','ticker_change','sec_file_absent','curated','merge_close','unrecorded') then return 'params'; end if;
      if (pa ->> 'valid_to')::date <= (t ->> 'valid_from')::date then return 'params'; end if;
      allowed := array['valid_to'];
    else
      if not public.claim_keys_within(pa, array['new_valid_from','valid_from_method','note'])
         or not public.claim_text_is_date(pa ->> 'new_valid_from')
         or coalesce(pa ->> 'valid_from_method', '') not in ('listing_date','ticker_change','curated') then return 'params'; end if;
      if (pa ->> 'new_valid_from')::date >= (t ->> 'valid_from')::date then return 'params'; end if;
      allowed := array['valid_from'];
    end if;
  elsif p_op = 'evidence_only' then
    if p_id_type <> 'ticker' or full_target then return 'op_id_type'; end if;
    if pa ? 'suggested_op' and coalesce(pa ->> 'suggested_op', '') not in ('attach_security','close_security','backdate_window') then return 'params.suggested_op'; end if;
    allowed := array[]::text[];
  else
    return 'op';
  end if;
  -- provenance_written must carry the op's own provenance key (the one resolve merges), plus only allowed keys.
  if pw is not null and (not public.claim_keys_within(pw, allowed) or not public.claim_provenance_safe(pw)
     or (cardinality(allowed) > 0 and not pw ? (case when p_op in ('set_identifier','correct_identifier') then p_id_type when p_op = 'close_security' then 'valid_to' else 'valid_from' end))) then
    return 'provenance_written';
  end if;
  return null;
end $$;
revoke execute on function public.identifier_claim_problem(text, text, text, uuid, jsonb) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------- resolve_identifier_claim (§3.1, §4.2.1, §7.1)
-- Locks the claim; refuses non-pending (already_resolved) and legacy (legacy_claim, either status)
-- claims. 'rejected' only flips the status of a non-legacy claim: no claim/1 validation, so a malformed
-- pending claim can still be cleared. 'accepted' refuses evidence_only without an amend
-- (amend_required), validates claim/1 and the stored target_key (invalid_claim), then performs the op's business write in
-- the same transaction with static SQL under a guard that must hit exactly one row of an active
-- issuer, merges detail.provenance_written (or, absent, the claim's evidence under the op's key) into
-- the target row's provenance, then records status/resolved_by/resolved_at. Any failure raises and
-- rolls back everything, so the claim stays pending.
create or replace function public.resolve_identifier_claim(p_id uuid, p_status text, p_resolved_by uuid, p_amend jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c public.issuer_identifier_claims;
  v_op text; v_value text; v_detail jsonb; v_amended boolean := false; v_problem text;
  t jsonb; pa jsonb; v_pw jsonb; v_key text; v_status text; n int; v_ev jsonb; v_safe jsonb; v_ticker text;
begin
  if p_status is null or p_status not in ('accepted','rejected') or p_resolved_by is null then
    raise exception 'invalid_claim' using errcode = '22023';
  end if;
  select * into c from public.issuer_identifier_claims where id = p_id for update;
  if not found then raise exception 'claim_not_found' using errcode = 'P0002'; end if;
  if c.status <> 'pending' then raise exception 'already_resolved' using errcode = 'P0001'; end if;
  if c.op = 'legacy' then raise exception 'legacy_claim' using errcode = 'P0001'; end if;
  v_op := c.op; v_value := c.value; v_detail := c.detail;
  if p_amend is not null then
    -- Only an evidence_only claim is amended, only on acceptance, only into a ticker op (§4.2.1).
    if c.op <> 'evidence_only' or p_status <> 'accepted' or jsonb_typeof(p_amend) <> 'object'
       or coalesce(p_amend ->> 'op', '') not in ('attach_security','close_security','backdate_window')
       or jsonb_typeof(p_amend -> 'target') is distinct from 'object' or jsonb_typeof(p_amend -> 'params') is distinct from 'object' then
      raise exception 'invalid_claim' using errcode = '22023';
    end if;
    v_op := p_amend ->> 'op';
    v_detail := c.detail || jsonb_build_object('target', p_amend -> 'target', 'params', p_amend -> 'params',
      'original_op', c.op, 'original_target', c.detail -> 'target', 'original_params', c.detail -> 'params',
      'amended_by', p_resolved_by, 'amended_at', clock_timestamp());
    if (p_amend -> 'target') ? 'ticker' then v_value := p_amend -> 'target' ->> 'ticker'; end if;
    v_amended := true;
  elsif c.op = 'evidence_only' and p_status = 'accepted' then
    raise exception 'amend_required' using errcode = 'P0001';
  end if;
  if p_status = 'rejected' then
    -- Rejection never needs a valid detail (spec 3.1): status flip only, so malformed claims can be cleared.
    update public.issuer_identifier_claims set status = 'rejected', resolved_by = p_resolved_by, resolved_at = clock_timestamp() where id = p_id;
    return jsonb_build_object('op', c.op, 'applied', false, 'amended', false);
  end if;
  v_problem := public.identifier_claim_problem(v_op, c.id_type, v_value, c.issuer_id, v_detail);
  if v_problem is not null then raise exception 'invalid_claim' using errcode = '22023', detail = v_problem; end if;
  if c.target_key is distinct from public.identifier_claim_target_key(c.op, c.detail -> 'target') then
    raise exception 'invalid_claim' using errcode = '22023', detail = 'target_key';
  end if;

  select status into v_status from public.issuers where issuer_id = c.issuer_id for no key update;
  if v_status is distinct from 'active' then raise exception 'issuer_not_active' using errcode = 'P0001'; end if;
  t := v_detail -> 'target'; pa := v_detail -> 'params';
  v_key := case when v_op in ('set_identifier','correct_identifier') then c.id_type when v_op = 'close_security' then 'valid_to' else 'valid_from' end;
  -- Fallback provenance carries only source / as_of / evidence_sha256 (+ a safe locator): the claim's
  -- free-form note and any unsafe locator never reach a public column.
  v_ev := v_detail -> 'evidence';
  v_safe := jsonb_build_object('source', v_ev -> 'source', 'as_of', v_ev -> 'as_of', 'evidence_sha256', v_ev -> 'evidence_sha256');
  if coalesce(v_ev ->> 'locator', '') ~ '^[A-Za-z0-9_.:/ ,=\[\]-]{1,200}$' and v_ev ->> 'locator' !~* '(\?|token|secret|passw|key=)'
     and public.claim_provenance_safe(to_jsonb(v_ev ->> 'locator')) then
    v_safe := v_safe || jsonb_build_object('locator', v_ev -> 'locator');
  end if;
  v_pw := coalesce(v_detail -> 'provenance_written', jsonb_build_object(v_key, v_safe));
  -- an attach_security that writes an ISIN records where that ISIN came from
  if v_op = 'attach_security' and nullif(v_detail -> 'params' ->> 'isin', '') is not null and not v_pw ? 'isin' then
    v_pw := v_pw || jsonb_build_object('isin', v_safe);
  end if;
  if not public.claim_provenance_safe(v_pw) then raise exception 'invalid_claim' using errcode = '22023', detail = 'provenance_written'; end if;

  begin
    if v_op = 'set_identifier' and c.id_type = 'lei' then
      update public.issuers set lei = v_value, provenance = provenance || v_pw, updated_at = now() where issuer_id = c.issuer_id and status = 'active' and lei is null;
    elsif v_op = 'set_identifier' and c.id_type = 'cik' then
      update public.issuers set cik = v_value, provenance = provenance || v_pw, updated_at = now() where issuer_id = c.issuer_id and status = 'active' and cik is null;
    elsif v_op = 'set_identifier' and c.id_type = 'usci' then
      update public.issuers set usci = v_value, provenance = provenance || v_pw, updated_at = now() where issuer_id = c.issuer_id and status = 'active' and usci is null;
    elsif v_op = 'set_identifier' and c.id_type = 'cninfo_org_id' then
      update public.issuers set cninfo_org_id = v_value, provenance = provenance || v_pw, updated_at = now() where issuer_id = c.issuer_id and status = 'active' and cninfo_org_id is null;
    elsif v_op = 'correct_identifier' and c.id_type = 'lei' then
      update public.issuers set lei = v_value, provenance = provenance || v_pw, updated_at = now() where issuer_id = c.issuer_id and status = 'active' and lei = pa ->> 'expected_current';
    elsif v_op = 'correct_identifier' and c.id_type = 'cik' then
      update public.issuers set cik = v_value, provenance = provenance || v_pw, updated_at = now() where issuer_id = c.issuer_id and status = 'active' and cik = pa ->> 'expected_current';
    elsif v_op = 'correct_identifier' and c.id_type = 'usci' then
      update public.issuers set usci = v_value, provenance = provenance || v_pw, updated_at = now() where issuer_id = c.issuer_id and status = 'active' and usci = pa ->> 'expected_current';
    elsif v_op = 'correct_identifier' and c.id_type = 'cninfo_org_id' then
      update public.issuers set cninfo_org_id = v_value, provenance = provenance || v_pw, updated_at = now() where issuer_id = c.issuer_id and status = 'active' and cninfo_org_id = pa ->> 'expected_current';
    elsif v_op = 'set_identifier' and c.id_type = 'isin' then
      update public.issuer_securities set isin = v_value, provenance = provenance || v_pw
      where issuer_id = c.issuer_id and ticker = t ->> 'ticker' and valid_from = (t ->> 'valid_from')::date and isin is null;
    elsif v_op = 'set_identifier' and c.id_type = 'figi' then
      update public.issuer_securities set figi = v_value, provenance = provenance || v_pw
      where issuer_id = c.issuer_id and ticker = t ->> 'ticker' and valid_from = (t ->> 'valid_from')::date and figi is null;
    elsif v_op = 'correct_identifier' and c.id_type = 'isin' then
      update public.issuer_securities set isin = v_value, provenance = provenance || v_pw
      where issuer_id = c.issuer_id and ticker = t ->> 'ticker' and valid_from = (t ->> 'valid_from')::date and isin = pa ->> 'expected_current';
    elsif v_op = 'correct_identifier' and c.id_type = 'figi' then
      update public.issuer_securities set figi = v_value, provenance = provenance || v_pw
      where issuer_id = c.issuer_id and ticker = t ->> 'ticker' and valid_from = (t ->> 'valid_from')::date and figi = pa ->> 'expected_current';
    elsif v_op = 'attach_security' then
      v_ticker := coalesce(pa ->> 'ticker', v_value);
      if not exists (select 1 from public.stocks_universe where ticker = v_ticker) then
        raise exception 'invalid_claim' using errcode = '22023', detail = 'params.ticker';
      end if;
      -- same per-ticker advisory lock as set_security_window (issuer -> row -> advisory): a window write cannot interleave with an insert that could precede it
      perform pg_advisory_xact_lock(hashtext('issuer_securities_ticker:' || v_ticker));
      insert into public.issuer_securities(issuer_id, ticker, isin, share_class, is_primary, valid_from, valid_to, valid_from_method, valid_to_method, source, provenance)
      values (c.issuer_id, v_ticker, nullif(pa ->> 'isin', ''), pa ->> 'share_class', false, (pa ->> 'valid_from')::date, null, pa ->> 'valid_from_method', null, pa ->> 'source', v_pw);
    elsif v_op = 'close_security' then
      update public.issuer_securities set valid_to = (pa ->> 'valid_to')::date, valid_to_method = pa ->> 'valid_to_method', provenance = provenance || v_pw
      where issuer_id = c.issuer_id and ticker = t ->> 'ticker' and valid_from = (t ->> 'valid_from')::date and valid_to is null;
    elsif v_op = 'backdate_window' then
      -- lock order issuer -> row -> per-ticker advisory lock, as in set_security_window
      perform 1 from public.issuer_securities where issuer_id = c.issuer_id and ticker = t ->> 'ticker' and valid_from = (t ->> 'valid_from')::date for update;
      perform pg_advisory_xact_lock(hashtext('issuer_securities_ticker:' || (t ->> 'ticker')));
      update public.issuer_securities set valid_from = (pa ->> 'new_valid_from')::date, valid_from_method = pa ->> 'valid_from_method', provenance = provenance || v_pw
      where issuer_id = c.issuer_id and ticker = t ->> 'ticker' and valid_from = (t ->> 'valid_from')::date;
    else
      raise exception 'invalid_claim' using errcode = '22023';
    end if;
    get diagnostics n = row_count;
  exception
    when unique_violation or exclusion_violation then
      -- an issuer identifier held by another issuer; a security key/window/ISIN held by another row
      if v_op in ('set_identifier','correct_identifier') and c.id_type in ('lei','cik','usci','cninfo_org_id') then
        raise exception 'value_conflict' using errcode = 'P0001';
454:  select * into c from public.issuer_identifier_claims where id = p_id for update;
539:      -- same per-ticker advisory lock as set_security_window (issuer -> row -> advisory): a window write cannot interleave with an insert that could precede it
540:      perform pg_advisory_xact_lock(hashtext('issuer_securities_ticker:' || v_ticker));
547:      -- lock order issuer -> row -> per-ticker advisory lock, as in set_security_window
548:      perform 1 from public.issuer_securities where issuer_id = c.issuer_id and ticker = t ->> 'ticker' and valid_from = (t ->> 'valid_from')::date for update;
549:      perform pg_advisory_xact_lock(hashtext('issuer_securities_ticker:' || (t ->> 'ticker')));
593:  select * into p from public.dq_calendar_passes where market = p_token ->> 'market' and pass_id = (p_token ->> 'pass_id')::uuid for update;
602:-- U1: creation is serialised per market by a transaction advisory lock. No unfinished pass → create
611:  perform pg_advisory_xact_lock(hashtext('dq_calendar_pass:' || p_market));
612:  select * into p from public.dq_calendar_passes where market = p_market and finished_at is null for update;
642:  select * into m from public.dq_calendar_pass_members where market = p.market and pass_id = p.pass_id and issuer_id = p_issuer for update;
681:  select * into m from public.dq_calendar_pass_members where market = p.market and pass_id = p.pass_id and issuer_id = p_issuer for update;
726:  for update;
751:  perform 1 from public.dq_quarantine where id = p_id for update;
785:  for update;
804:-- set_security_window is the only writer of an evidenced valid_from / valid_to (windows.ts, backfill-windows).
814:create or replace function public.set_security_window(p_issuer uuid, p_ticker text, p_valid_from date, p_side text, p_new_date date, p_provenance jsonb)
827:  where s.issuer_id = p_issuer and s.ticker = p_ticker and s.valid_from = p_valid_from for update;
835:    perform pg_advisory_xact_lock(hashtext('issuer_securities_ticker:' || p_ticker));
849:revoke execute on function public.set_security_window(uuid, text, date, text, date, jsonb) from public, anon, authenticated;
850:grant execute on function public.set_security_window(uuid, text, date, text, date, jsonb) to service_role;
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
  else
    update public.issuer_securities set figi = p_value, provenance = provenance || p_provenance
    where issuer_id = p_issuer and ticker = p_ticker and valid_from = p_valid_from and valid_to is null and figi is not distinct from v_cur;
  end if;
  get diagnostics n = row_count;
  if n <> 1 then return 'conflict'; end if;   -- the value moved between the read and the write
  return case when v_cur is null then 'written' else 'duplicate' end;
end $$;
revoke execute on function public.set_security_identifier(uuid, text, date, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.set_security_identifier(uuid, text, date, text, text, jsonb) to service_role;

-- ---------------------------------------------------------------- guarded evidenced-window write (Task 5a)
-- set_security_window is the only writer of an evidenced valid_from / valid_to (windows.ts, backfill-windows).
-- Lock order of set_security_identifier / resolve_identifier_claim: issuer FOR SHARE, then the row FOR UPDATE.
-- p_side 'from': the row (issuer, ticker, p_valid_from) must still have method first_observed or curated and
--   p_new_date <= valid_from and no other row of the ticker starting earlier; ONE UPDATE sets valid_from = p_new_date, valid_from_method = 'listing_date'.
-- p_side 'to': the row (issuer, ticker, p_valid_from) must still be open and p_new_date > valid_from; ONE UPDATE
--   sets valid_to, valid_to_method = 'delisting'.
-- Both merge `provenance || p_provenance` (never a whole-object replacement); p_provenance must be public-safe
-- (claim_provenance_safe) and hold exactly the key valid_from / valid_to matching p_side.
-- Outcomes: 'written', 'duplicate' (already evidenced at p_new_date with the key present), 'conflict' (state moved
-- or date rule violated; nothing written), 'not_found'. Exclusion / unique violations (23P01 / 23505) pass through.
create or replace function public.set_security_window(p_issuer uuid, p_ticker text, p_valid_from date, p_side text, p_new_date date, p_provenance jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare v_row public.issuer_securities%rowtype; n int;
begin
  if p_side is null or p_side not in ('from', 'to') or p_new_date is null or p_ticker is null or p_valid_from is null
     or p_provenance is null or jsonb_typeof(p_provenance) <> 'object'
     or (select array_agg(k) from jsonb_object_keys(p_provenance) k) is distinct from array['valid_' || p_side]
     or not public.claim_provenance_safe(p_provenance) then
    raise exception 'invalid_window_write' using errcode = '22023';
  end if;
  perform 1 from public.issuers where issuer_id = p_issuer for share;
  if not found then return 'not_found'; end if;
  select * into v_row from public.issuer_securities s
  where s.issuer_id = p_issuer and s.ticker = p_ticker and s.valid_from = p_valid_from for update;
  if not found then return 'not_found'; end if;
  if p_side = 'from' then
    if v_row.valid_from_method = 'listing_date' and v_row.valid_from = p_new_date and v_row.provenance ? 'valid_from' then return 'duplicate'; end if;
    if v_row.valid_from_method not in ('first_observed', 'curated') or p_new_date > v_row.valid_from then return 'conflict'; end if;
    -- the listing date belongs to the ticker's EARLIEST holding row: serialise window writers per ticker, then recheck
    -- that no other row (any issuer) of the ticker starts earlier (an earlier non-overlapping holding appeared since planning).
    -- Overlaps themselves are refused by the no-overlap exclusion constraint (23P01), not here.
    perform pg_advisory_xact_lock(hashtext('issuer_securities_ticker:' || p_ticker));
    if exists (select 1 from public.issuer_securities o where o.ticker = p_ticker and o.valid_from < p_valid_from) then return 'conflict'; end if;
    update public.issuer_securities set valid_from = p_new_date, valid_from_method = 'listing_date', provenance = provenance || p_provenance
    where issuer_id = p_issuer and ticker = p_ticker and valid_from = p_valid_from and valid_from_method in ('first_observed', 'curated');
  else
    if v_row.valid_to = p_new_date and v_row.valid_to_method = 'delisting' and v_row.provenance ? 'valid_to' then return 'duplicate'; end if;
    if v_row.valid_to is not null or p_new_date <= v_row.valid_from then return 'conflict'; end if;
    update public.issuer_securities set valid_to = p_new_date, valid_to_method = 'delisting', provenance = provenance || p_provenance
    where issuer_id = p_issuer and ticker = p_ticker and valid_from = p_valid_from and valid_to is null;
  end if;
  get diagnostics n = row_count;
  if n <> 1 then return 'conflict'; end if;
  return 'written';
end $$;
revoke execute on function public.set_security_window(uuid, text, date, text, date, jsonb) from public, anon, authenticated;
grant execute on function public.set_security_window(uuid, text, date, text, date, jsonb) to service_role;

-- ---------------------------------------------------------------- guarded issuer identifier write (Task 4b review, P1)
-- set_issuer_identifier is the only writer of issuers.cninfo_org_id outside resolve_identifier_claim
-- (cninfo-org-id.ts). It locks the issuer row FOR NO KEY UPDATE (the order and lock level of
-- resolve_identifier_claim), requires status 'active' and, in ONE UPDATE, writes the column (only when
-- empty) and merges provenance with `provenance || {p_column: p_provenance}` — never a whole-object
-- replacement — so a concurrent write of another provenance key (lei, usci, ...) keeps its key.
-- Outcomes: 'written', 'duplicate' (same value stored), 'conflict' (another value stored, or the
-- value is held by another issuer: unique violation), 'not_found', 'not_active'.
create or replace function public.set_issuer_identifier(p_issuer uuid, p_column text, p_value text, p_provenance jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare v_cur text; v_status text;
begin
  if p_column is distinct from 'cninfo_org_id' then raise exception 'invalid_column' using errcode = '22023'; end if;
  if coalesce(btrim(p_value), '') = '' or p_provenance is null or jsonb_typeof(p_provenance) <> 'object'
     or not public.claim_provenance_safe(p_provenance) then
    raise exception 'invalid_identifier_write' using errcode = '22023';
  end if;
  select i.status, i.cninfo_org_id into v_status, v_cur from public.issuers i where i.issuer_id = p_issuer for no key update;
  if not found then return 'not_found'; end if;
  if v_status <> 'active' then return 'not_active'; end if;
  if v_cur is not null then return case when v_cur = p_value then 'duplicate' else 'conflict' end; end if;
  begin
    update public.issuers set cninfo_org_id = p_value, provenance = provenance || jsonb_build_object(p_column, p_provenance), updated_at = now()
    where issuer_id = p_issuer;
  exception when unique_violation then return 'conflict';
  end;
  return 'written';
end $$;
revoke execute on function public.set_issuer_identifier(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.set_issuer_identifier(uuid, text, text, jsonb) to service_role;

-- ---------------------------------------------------------------- topology guard (§3.1, S1)
-- issuers.status/merged_into change only inside set_merge/set_dissolved (migration two), which switch
-- the transaction-local setting on and restore it on every exit path. A never-defined setting reads
-- NULL and the '' left after such a transaction both differ from 'on' and are refused (IS DISTINCT
-- FROM). The WHEN clause skips same-value writes. Named so it fires after the plan-1 lifecycle
-- triggers (BEFORE triggers run in name order), which keep reporting their own errors. A tripwire,
-- not a privilege boundary: any role can set the GUC. Inserts are guarded too (plan 3 接口对齐记录 #7):
-- an issuer born with status <> 'active' or merged_into set would add a lineage member without
-- set_merge's scope locks; plain active inserts pass.
create or replace function public.issuers_topology_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status is distinct from 'active' or new.merged_into is not null then
      if current_setting('entities.allow_topology_write', true) is distinct from 'on' then
        raise exception 'topology_write_forbidden' using errcode = '23514';
      end if;
    end if;
// Minimal table access used by dq/* and entities/* so logic is unit-testable with an
// in-memory client and runs in production over the service-role Supabase client.
// PostgREST caps every response (max_rows, default 1000), so select() returns at most one
// page. Reads that may exceed one page must use selectAll(), which pages in a fixed order.
import type {SupabaseClient} from '@supabase/supabase-js';

export type Row=Record<string,unknown>;
/** Inclusive lower (`gte`) and exclusive upper (`lt`) bounds per column. ISO timestamp strings compare as text, numbers numerically. */
export interface RangeOptions{gte?:Record<string,string|number>;lt?:Record<string,string|number>}
// offset requires orderBy: unordered pages are not stable across requests.
// limit is an integer 1..MAX_PAGE; offset a non-negative safe integer.
export interface SelectOptions extends RangeOptions{limit?:number;offset?:number;orderBy?:string;desc?:boolean}

/** Largest page PostgREST returns by default; also the limit and selectAll page-size ceiling. */
export const MAX_PAGE=1000;

/** Table operation failure; `code` is the PostgreSQL SQLSTATE when known (e.g. '23505' unique violation). */
export class TableError extends Error{
 readonly details?:string;
 readonly hint?:string;
 constructor(readonly op:string,readonly table:string,message:string,readonly code:string|null=null,extra:{details?:string|null;hint?:string|null;cause?:unknown}={}){
  super(`${table} ${op}: ${message}`,extra.cause===undefined?undefined:{cause:extra.cause});
  this.name='TableError';
  if(extra.details)this.details=extra.details;
  if(extra.hint)this.hint=extra.hint;
 }
}

export interface TableClient{
 insert(table:string,row:Row):Promise<Row>;
 /** Returns the number of rows the match hit. An empty match is rejected (no whole-table updates). */
 update(table:string,match:Row,patch:Row):Promise<number>;
 select(table:string,match:Row,opts?:SelectOptions):Promise<Row[]>;
 upsert(table:string,row:Row,onConflict:string):Promise<void>;
 count(table:string,match:Row,opts?:RangeOptions):Promise<number>;
 /**
  * Calls a service-role SQL function and returns its result (plan 3: the row-locking jsonb patches
  * append_claim_evidence / patch_quarantine_detail / set_security_identifier of migration 20261107090000). Optional so the landed
  * test stubs stay valid; callers go through callRpc, which fails loudly when it is missing.
  */
 rpc?(fn:string,args:Row):Promise<unknown>;
}

/** Calls `fn` through client.rpc. A client without rpc is a wiring error (rpc_unavailable:<fn>), never a silent no-op. */
export async function callRpc(client:TableClient,fn:string,args:Row):Promise<unknown>{
 if(!client.rpc)throw new Error(`rpc_unavailable:${fn}`);
 return client.rpc(fn,args);
}

/** Rejects `undefined` match values: they would otherwise be dropped or match nothing silently. */
export function assertMatch(match:Row):void{
 if(!match||typeof match!=='object')throw new Error('undefined_match_value');
 for(const v of Object.values(match))if(v===undefined)throw new Error('undefined_match_value');
}

export function assertUpdateMatch(match:Row):void{
 assertMatch(match);
 if(Object.keys(match).length===0)throw new Error('empty_update_match');
}

const okBound=(v:unknown)=>typeof v==='string'||(typeof v==='number'&&Number.isFinite(v));
function checkRange(opts:RangeOptions):void{
 for(const r of [opts.gte,opts.lt]){
  if(r===undefined)continue;
  if(!r||typeof r!=='object'||Object.values(r).some(v=>!okBound(v)))throw new Error('invalid_select_options');
 }
}

export function checkSelectOptions(opts:SelectOptions):void{
 if(opts.limit!==undefined&&(!Number.isSafeInteger(opts.limit)||opts.limit<1||opts.limit>MAX_PAGE))throw new Error('invalid_select_options');
 if(opts.offset!==undefined&&(!Number.isSafeInteger(opts.offset)||opts.offset<0))throw new Error('invalid_select_options');
 if(opts.offset!==undefined&&!opts.orderBy)throw new Error('offset_requires_orderBy');
 checkRange(opts);
}

export function checkRangeOptions(opts:RangeOptions):void{checkRange(opts);}

/**
 * Reads every matching row, paging by `offset` in `orderBy` order and stopping only on an empty
 * page, so a server max_rows below pageSize cannot truncate the result. `orderBy` must be a
 * unique column (ties make offset pages overlap or skip). Pages are separate requests, so the
 * result is not a snapshot: concurrent writes can be missed or seen twice.
 */
export async function selectAll(client:TableClient,table:string,match:Row,orderBy:string,pageSize=MAX_PAGE):Promise<Row[]>{
 if(!Number.isInteger(pageSize)||pageSize<1||pageSize>MAX_PAGE)throw new Error(`selectAll pageSize must be 1..${MAX_PAGE}`);
 const out:Row[]=[];
 for(let offset=0;;){
  const page=await client.select(table,match,{orderBy,offset,limit:pageSize});
  if(page.length===0)return out;
  out.push(...page);offset+=page.length;
 }
}

// `.eq(k,null)` renders `k=eq.null`, which never matches in SQL; null must use `.is`.
const applyMatch=(q:any,match:Row)=>{for(const [k,v] of Object.entries(match))q=v===null?q.is(k,null):q.eq(k,v);return q;};
const applyRange=(q:any,opts:RangeOptions)=>{
 for(const [k,v] of Object.entries(opts.gte??{}))q=q.gte(k,v);
 for(const [k,v] of Object.entries(opts.lt??{}))q=q.lt(k,v);
 return q;
};

interface PgError{message:string;code?:string;details?:string|null;hint?:string|null}

export function supabaseTableClient(client:SupabaseClient):TableClient{
 // The hand-maintained Database type does describe the dq/issuer tables, but TableClient takes
 // table names as plain strings so the same callers run over the in-memory client too; the
 // loosely typed handle keeps that parity instead of casting at every call site.
 const db=client as unknown as {from:(t:string)=>any};
 const fail=(op:string,table:string,error:PgError):never=>{throw new TableError(op,table,error.message,error.code??null,{details:error.details,hint:error.hint,cause:error});};
 return {
  async insert(table,row){const {data,error}=await db.from(table).insert(row).select().single();if(error)fail('insert',table,error);return data as Row;},
  // Exact count from Content-Range; no rows are returned. A missing count fails closed.
  async update(table,match,patch){
   assertUpdateMatch(match);
   const {count,error}=await applyMatch(db.from(table).update(patch,{count:'exact'}),match);
   if(error)fail('update',table,error);
   if(count===null||count===undefined)throw new Error('update_count_unavailable');
   return count as number;
  },
  async select(table,match,opts={}){
   assertMatch(match);checkSelectOptions(opts);
   let q=applyRange(applyMatch(db.from(table).select('*'),match),opts);
   if(opts.orderBy)q=q.order(opts.orderBy,{ascending:!opts.desc});
   if(opts.limit!==undefined||opts.offset!==undefined){const from=opts.offset??0;q=q.range(from,from+(opts.limit??MAX_PAGE)-1);}
   const {data,error}=await q;if(error)fail('select',table,error);return (data??[]) as Row[];
  },
  async upsert(table,row,onConflict){const {error}=await db.from(table).upsert(row,{onConflict});if(error)fail('upsert',table,error);},
  async count(table,match,opts={}){
   assertMatch(match);checkRangeOptions(opts);
   const {count,error}=await applyRange(applyMatch(db.from(table).select('*',{count:'exact',head:true}),match),opts);
   if(error)fail('count',table,error);
   if(count===null||count===undefined)throw new Error('count_unavailable');
   return count as number;
  },
  async rpc(fn,args){
   const {data,error}=await (client as unknown as {rpc:(f:string,a:Row)=>PromiseLike<{data:unknown;error:PgError|null}>}).rpc(fn,args);
   if(error)fail('rpc',fn,error);
   return data;
  },
 };
}
./node_modules/dsh-trade-strategy-evaluator/agents
./node_modules/playwright/lib/agents
./node_modules/playwright/lib/agents/generateAgents.js
./node_modules/caniuse-lite/dist/unpacker/agents.js
./node_modules/caniuse-lite/data/agents.js
./.claude/agents

exec
/bin/zsh -lc "rg -n 'set_security_window|applyWindowBackfill' src scripts --glob '*test*'; cat package.json | grep -A24 scripts; ls node_modules/.bin/vitest; git status --short; ls /Users/osborn/.codex/config.toml; rg 'project_doc' /Users/osborn/.codex/config.toml; sed -n '1,155p' src/lib/entities/backfill-windows.test.ts" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
src/lib/entities/identifiers.integration.test.ts:712:   'public.append_claim_evidence(uuid,text,text,text,text,jsonb)','public.patch_quarantine_detail(uuid,text,jsonb)','public.set_security_identifier(uuid,text,date,text,text,jsonb)','public.set_issuer_identifier(uuid,text,text,jsonb)','public.set_security_window(uuid,text,date,text,date,jsonb)'];
src/lib/entities/identifiers.integration.test.ts:1031:  on.query(`select public.set_security_window($1,$2,$3::date,$4,$5::date,$6::jsonb) v`,[a,t,from,side,date,JSON.stringify(prov)]).then(r=>r.rows[0].v as string);
src/lib/entities/identifiers.integration.test.ts:1035: it('set_security_window: from/to written, duplicate, state guards conflict, not_found, invalid; provenance merged',async()=>{
src/lib/entities/identifiers.integration.test.ts:1077: it('set_security_window from: an earlier non-overlapping holding of the ticker (any issuer) that appeared after planning makes it conflict; the advisory lock serialises window writers',async()=>{
src/lib/entities/identifiers.integration.test.ts:1093: it('claim attach_security / backdate_window and set_security_window on one ticker serialise on the per-ticker advisory lock (issuer -> row -> advisory)',async()=>{
src/lib/entities/identifiers.integration.test.ts:1120: it('set_security_window refuses a backdate into an earlier holding of the same ticker (earliest-row guard, before the exclusion constraint)',async()=>{
src/lib/entities/backfill-windows.test.ts:6:import {applyWindowBackfill,keysetAll,planWindowBackfill,windowsOutcome,type UniverseDates,type WindowRow} from './windows';
src/lib/entities/backfill-windows.test.ts:56:describe('applyWindowBackfill',()=>{
src/lib/entities/backfill-windows.test.ts:64:  const res=await applyWindowBackfill(c,plan,{batchId:BATCH,dataset:DATASET});
src/lib/entities/backfill-windows.test.ts:75:  const failing:TableClient={...c,rpc:async(fn,args)=>{if(fn==='set_security_window'&&args.p_side==='from')throw new TableError('rpc',fn,'conflicting key value violates exclusion constraint "issuer_securities_no_overlap"','23P01');return c.rpc(fn,args);}};
src/lib/entities/backfill-windows.test.ts:77:  const res=await applyWindowBackfill(failing,plan,{batchId:BATCH,dataset:DATASET});
src/lib/entities/backfill-windows.test.ts:94:  const res=await applyWindowBackfill(c,plan,{batchId:BATCH,dataset:DATASET});
src/lib/entities/backfill-windows.test.ts:110:  const res=await applyWindowBackfill(c,plan,{batchId:BATCH,dataset:DATASET});
src/lib/db/table-client.test.ts:246: it('memoryTableClient emulates set_security_window: from/to written, duplicate, conflict (state, earliest row), not_found, invalid_window_write',async()=>{
src/lib/db/table-client.test.ts:252:  expect(await callRpc(c,'set_security_window',args('from','2024-03-01','2025-01-01',WF))).toBe('conflict');
src/lib/db/table-client.test.ts:253:  expect(await callRpc(c,'set_security_window',args('from','2024-03-01','2001-08-27',WF))).toBe('written');
src/lib/db/table-client.test.ts:254:  expect(await callRpc(c,'set_security_window',args('from','2001-08-27','2001-08-27',WF))).toBe('duplicate');
src/lib/db/table-client.test.ts:255:  expect(await callRpc(c,'set_security_window',args('from','2001-08-27','2000-01-01',WF))).toBe('conflict');
src/lib/db/table-client.test.ts:256:  expect(await callRpc(c,'set_security_window',args('to','2001-08-27','2001-08-27',WT))).toBe('conflict');
src/lib/db/table-client.test.ts:257:  expect(await callRpc(c,'set_security_window',args('to','2001-08-27','2026-06-30',WT))).toBe('written');
src/lib/db/table-client.test.ts:258:  expect(await callRpc(c,'set_security_window',args('to','2001-08-27','2026-06-30',WT))).toBe('duplicate');
src/lib/db/table-client.test.ts:259:  expect(await callRpc(c,'set_security_window',args('to','2001-08-27','2026-07-01',WT))).toBe('conflict');
src/lib/db/table-client.test.ts:261:  expect(await callRpc(c,'set_security_window',args('from','1999-01-01','1990-01-01',WF))).toBe('not_found');
src/lib/db/table-client.test.ts:262:  expect(await callRpc(c,'set_security_window',{...args('from','2001-08-27','1990-01-01',WF),p_issuer:'ghost'})).toBe('not_found');
src/lib/db/table-client.test.ts:265:  expect(await callRpc(c,'set_security_window',args('from','2001-08-27','1998-01-01',WF))).toBe('conflict');   // an earlier holding exists
src/lib/db/table-client.test.ts:267:   await expect(callRpc(c,'set_security_window',bad)).rejects.toThrow(/invalid_window_write/);
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
node_modules/.bin/vitest
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-Ozocd2Eq' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-IHFU9hM9' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/5a-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/5a-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/5a-review-fix2.md
?? docs/audits/2026-11-05-data-foundation-3/codex/5a-review.md
/Users/osborn/.codex/config.toml
// src/lib/entities/backfill-windows.test.ts
import {describe,it,expect} from 'vitest';
import {TableError,type TableClient} from '../db/table-client';
import {memoryTableClient} from '../db/memory-table-client';
import {coverageE2} from './coverage';
import {applyWindowBackfill,keysetAll,planWindowBackfill,windowsOutcome,type UniverseDates,type WindowRow} from './windows';

const ASOF='2026-11-05',BATCH='33333333-3333-4333-8333-333333333333',DATASET='entities.windows';
const w=(o:Partial<WindowRow>):WindowRow=>({issuer_id:'i1',ticker:'600519.SH',valid_from:'2024-03-01',valid_to:null,valid_from_method:'first_observed',valid_to_method:null,provenance:{source:'curated'},...o});
const u=(ticker:string,o:Partial<UniverseDates>={}):[string,UniverseDates]=>[ticker,{ticker,list_date:'2001-08-27',delist_date:null,source:'tushare_stock_basic',source_updated_at:'2026-11-01T00:00:00Z',...o}];
const FROM_PROV={source:'stocks_universe.list_date',provider:'tushare_stock_basic',as_of:ASOF,row:{list_date:'2001-08-27',source:'tushare_stock_basic',source_updated_at:'2026-11-01T00:00:00Z'}};

describe('planWindowBackfill',()=>{
 it('moves the earliest row to the listing date, copying the source row values into provenance',()=>{
  const p=planWindowBackfill([w({})],new Map([u('600519.SH')]),ASOF);
  expect(p.changes).toEqual([{kind:'from',row:w({}),newValidFrom:'2001-08-27',provenance:{valid_from:FROM_PROV}}]);
  expect(p.conflicts).toEqual([]);
 });
 it('equal dates change only the method and provenance; a later listing date is a conflict',()=>{
  expect(planWindowBackfill([w({valid_from:'2001-08-27'})],new Map([u('600519.SH')]),ASOF).changes[0]).toMatchObject({kind:'from',newValidFrom:'2001-08-27'});
  const late=planWindowBackfill([w({valid_from:'2000-01-01'})],new Map([u('600519.SH')]),ASOF);
  expect(late.changes).toEqual([]);
  expect(late.conflicts).toEqual([{row:w({valid_from:'2000-01-01'}),reason:'list_date_after_first_observed',detail:{list_date:'2001-08-27',valid_from:'2000-01-01',source:'tushare_stock_basic'}}]);
 });
 it('touches only the earliest holding row of a ticker; curated rows qualify, other methods do not',()=>{
  const rows=[w({issuer_id:'i2',valid_from:'2010-01-01',valid_to:'2015-01-01'}),w({issuer_id:'i1',valid_from:'2015-01-01'})];
  const p=planWindowBackfill(rows,new Map([u('600519.SH')]),ASOF);
  expect(p.changes.map(c=>[c.kind,c.row.issuer_id])).toEqual([['from','i2']]);
  expect(planWindowBackfill([w({valid_from_method:'curated'})],new Map([u('600519.SH')]),ASOF).changes).toHaveLength(1);
  const done=planWindowBackfill([w({valid_from:'2001-08-27',valid_from_method:'listing_date'})],new Map([u('600519.SH')]),ASOF);
  expect(done.changes).toEqual([]);expect(done.unchanged).toBe(1);
  expect(planWindowBackfill([w({valid_from_method:'ticker_change'})],new Map([u('600519.SH')]),ASOF).skipped).toEqual(['method_ticker_change']);
 });
 it('closes the latest open row at the delisting date; a delisting on or before valid_from is a conflict',()=>{
  const rows=[w({issuer_id:'i2',valid_from:'2010-01-01',valid_to:'2015-01-01'}),w({issuer_id:'i1',valid_from:'2015-01-01'})];
  const p=planWindowBackfill(rows,new Map([u('600519.SH',{delist_date:'2026-06-30'})]),ASOF);
  const to=p.changes.find(c=>c.kind==='to')!;
  expect(to).toMatchObject({kind:'to',validFrom:'2015-01-01',newValidTo:'2026-06-30',provenance:{valid_to:{source:'stocks_universe.delist_date',provider:'tushare_stock_basic',as_of:ASOF,row:{delist_date:'2026-06-30',source:'tushare_stock_basic',source_updated_at:'2026-11-01T00:00:00Z'}}}});
  const bad=planWindowBackfill([w({valid_from:'2024-03-01'})],new Map([u('600519.SH',{list_date:null,delist_date:'2024-03-01'})]),ASOF);
  expect(bad.conflicts.map(c=>c.reason)).toEqual(['delist_on_or_before_valid_from']);
 });
 it('a single row gets both changes; the close uses the new valid_from and each change carries only its own single provenance key',()=>{
  const p=planWindowBackfill([w({})],new Map([u('600519.SH',{delist_date:'2026-06-30'})]),ASOF);
  expect(p.changes.map(c=>c.kind)).toEqual(['from','to']);
  const to=p.changes[1] as Extract<typeof p.changes[number],{kind:'to'}>;
  expect(to.validFrom).toBe('2001-08-27');
  expect(Object.keys(to.provenance)).toEqual(['valid_to']);
  expect(Object.keys((p.changes[0] as {provenance:object}).provenance)).toEqual(['valid_from']);
 });
 it('leaves US rows (no list_date) and tickers outside the universe alone',()=>{
  const p=planWindowBackfill([w({ticker:'AAPL'}),w({ticker:'ZZZZ'})],new Map([u('AAPL',{list_date:null})]),ASOF);
  expect(p.changes).toEqual([]);expect(p.skipped).toEqual(['no_list_date','not_in_universe']);
 });
});

describe('applyWindowBackfill',()=>{
 const row=(o:Partial<WindowRow>={})=>({...w(o),isin:null,figi:null,share_class:'A',is_primary:true,source:'curated'});
 it('applies guarded updates and quarantines evidence conflicts',async()=>{
  const c=memoryTableClient({dq_quarantine:['id']});
  await c.insert('issuers',{issuer_id:'i1'});
  await c.insert('issuer_securities',row({}));
  await c.insert('issuer_securities',row({ticker:'000001.SZ',valid_from:'1980-01-01'}));
  const plan=planWindowBackfill([w({}),w({ticker:'000001.SZ',valid_from:'1980-01-01'})],new Map([u('600519.SH',{delist_date:'2026-06-30'}),u('000001.SZ',{list_date:'1991-04-03'})]),ASOF);
  const res=await applyWindowBackfill(c,plan,{batchId:BATCH,dataset:DATASET});
  const moved=c.rows('issuer_securities').find(r=>r.ticker==='600519.SH')!;
  expect(moved).toMatchObject({valid_from:'2001-08-27',valid_from_method:'listing_date',valid_to:'2026-06-30',valid_to_method:'delisting'});
  expect(Object.keys(moved.provenance as object).sort()).toEqual(['source','valid_from','valid_to']);
  expect(c.rows('dq_quarantine')).toEqual([expect.objectContaining({dataset:DATASET,table_name:'issuer_securities',natural_key:'000001.SZ:1980-01-01',reason_code:'window_evidence_conflict',status:'open'})]);
  expect(res.counts).toMatchObject({fetched:3,versioned:2,quarantined:1,failed:0});
 });
 it('an exclusion violation on the listing date is an ownership_conflict; the close is still attempted at the row\'s current start',async()=>{
  const c=memoryTableClient({dq_quarantine:['id']});
  await c.insert('issuers',{issuer_id:'i1'});
  await c.insert('issuer_securities',row({}));
  const failing:TableClient={...c,rpc:async(fn,args)=>{if(fn==='set_security_window'&&args.p_side==='from')throw new TableError('rpc',fn,'conflicting key value violates exclusion constraint "issuer_securities_no_overlap"','23P01');return c.rpc(fn,args);}};
  const plan=planWindowBackfill([w({})],new Map([u('600519.SH',{delist_date:'2026-06-30'})]),ASOF);
  const res=await applyWindowBackfill(failing,plan,{batchId:BATCH,dataset:DATASET});
  expect(c.rows('dq_quarantine').map(q=>q.reason_code)).toEqual(['ownership_conflict']);
  expect(c.rows('issuer_securities')[0]).toMatchObject({valid_from:'2024-03-01',valid_to:'2026-06-30',valid_to_method:'delisting'});
  expect(res.counts).toMatchObject({quarantined:1,failed:0,versioned:1});
  expect(res.errors.map(e=>e.code)).toEqual(['ownership_conflict']);
 });
});

describe('conflicts after a backdate, aggregation, paging, freshness',()=>{
 const row=(o:Partial<WindowRow>={})=>({...w(o),isin:null,figi:null,share_class:'A',is_primary:true,source:'curated'});
 it('a conflict on a row whose backdate landed is parked under the CURRENT key with the original snapshot, and E2 counts it',async()=>{
  const c=memoryTableClient({dq_quarantine:['id']});
  await c.insert('issuers',{issuer_id:'i1'});
  await c.insert('issuer_securities',row({}));
  const u1=new Map([u('600519.SH',{delist_date:'2000-01-01'})]);
  const plan=planWindowBackfill([w({})],u1,ASOF);
  expect(plan.changes.map(x=>x.kind)).toEqual(['from']);
  const res=await applyWindowBackfill(c,plan,{batchId:BATCH,dataset:DATASET});
  expect(res.counts).toMatchObject({versioned:1,quarantined:1,failed:0});
  const q=c.rows('dq_quarantine');
  expect(q).toHaveLength(1);
  expect(q[0]).toMatchObject({natural_key:'600519.SH:2001-08-27',reason_code:'window_evidence_conflict',
   payload:{issuer_id:'i1',ticker:'600519.SH',valid_from:'2024-03-01',valid_from_method:'first_observed',current_valid_from:'2001-08-27'}});
  const rows=c.rows('issuer_securities');
  const e2=coverageE2({rows,listDates:new Map([['600519.SH','2001-08-27']]),queueIssuers:new Set(['i1']),openQuarantineKeys:new Set(q.map(x=>String(x.natural_key)))});
  expect(e2).toMatchObject({open_quarantine:1,passes:false});
 });
 it('two conflicts on one row persist as ONE item carrying both reasons and both evidence rows',async()=>{
  const c=memoryTableClient({dq_quarantine:['id']});
  await c.insert('issuers',{issuer_id:'i1'});
  await c.insert('issuer_securities',row({valid_from:'2000-01-01'}));
  const plan=planWindowBackfill([w({valid_from:'2000-01-01'})],new Map([u('600519.SH',{list_date:'2001-08-27',delist_date:'1999-12-31'})]),ASOF);
  expect(plan.conflicts.map(x=>x.reason)).toEqual(['list_date_after_first_observed','delist_on_or_before_valid_from']);
  const res=await applyWindowBackfill(c,plan,{batchId:BATCH,dataset:DATASET});
  const q=c.rows('dq_quarantine');
  expect(q).toHaveLength(1);
  expect(q[0].detail).toEqual({reason:'list_date_after_first_observed',reasons:['list_date_after_first_observed','delist_on_or_before_valid_from'],conflicts:[
   {reason:'list_date_after_first_observed',list_date:'2001-08-27',valid_from:'2000-01-01',source:'tushare_stock_basic'},
   {reason:'delist_on_or_before_valid_from',delist_date:'1999-12-31',valid_from:'2000-01-01',source:'tushare_stock_basic'}]});
  expect(res.counts).toMatchObject({quarantined:1,failed:0});
 });
 it('keysetAll never truncates silently: A,A,A,B with a cap of 3 either returns all rows or throws page_overflow',async()=>{
  const c=memoryTableClient();
  let i=0;for(const t of ['A','A','A','B'])await c.insert('t',{ticker:t,issuer_id:`i${i++}`,valid_from:'2020-01-01'});
  const capped:TableClient={...c,select:(t,m,o)=>c.select(t,m,{...o,limit:Math.min(o?.limit??3,3)})};
  await expect(keysetAll(capped,'t',{},{},'ticker',['issuer_id','ticker','valid_from'])).rejects.toThrow('page_overflow');
  expect(await keysetAll(c,'t',{},{},'ticker',['issuer_id','ticker','valid_from'])).toHaveLength(4);
  const exact=memoryTableClient();await exact.insert('t',{ticker:'A',issuer_id:'x',valid_from:'d'});await exact.insert('t',{ticker:'A',issuer_id:'y',valid_from:'d'});await exact.insert('t',{ticker:'A',issuer_id:'z',valid_from:'d'});
  const cap3:TableClient={...exact,select:(t,m,o)=>exact.select(t,m,{...o,limit:Math.min(o?.limit??3,3)})};
  expect(await keysetAll(cap3,'t',{},{},'ticker',['issuer_id','ticker','valid_from'])).toHaveLength(3);   // a full last group is the end, not an overflow
 });
 it('keysetAll continues past a short page when the server caps pages below MAX_PAGE',async()=>{
  const c=memoryTableClient();
  const tickers=['A','B','B','C','D','E','F','F','G'];
  let i=0;for(const t of tickers)await c.insert('t',{ticker:t,issuer_id:`i${i++}`,valid_from:'2020-01-01'});
  const capped:TableClient={...c,select:(t,m,o)=>c.select(t,m,{...o,limit:Math.min(o?.limit??3,3)})};
  const got=await keysetAll(capped,'t',{},{},'ticker',['issuer_id','ticker','valid_from']);
  expect(got).toHaveLength(9);
  expect(await keysetAll(capped,'empty',{},{},'ticker',['ticker'])).toEqual([]);
 });
 it('freshness counts backfilled rows as landed: a partial run with versioned + quarantined only is ok; quarantine only is not',()=>{
  const base={fetched:0,inserted:0,duplicates:0,versioned:0,quarantined:0,failed:0};
  expect(windowsOutcome('partial',{...base,versioned:3,quarantined:2})).toEqual({ok:true,exitCode:0});
  expect(windowsOutcome('partial',{...base,quarantined:2})).toEqual({ok:false,exitCode:0});
  expect(windowsOutcome('partial',{...base,versioned:3,failed:1})).toMatchObject({ok:false,exitCode:1});
  expect(windowsOutcome('success',{...base,versioned:3})).toEqual({ok:true,exitCode:0});
 });
});

exec
/bin/zsh -lc 'node node_modules/vitest/vitest.mjs run src/lib/entities/backfill-windows.test.ts src/lib/db/table-client.test.ts --no-cache' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 315ms:
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v4.1.11 /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61

 ❯ src/lib/entities/backfill-windows.test.ts (0 test)
 ❯ src/lib/db/table-client.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/lib/db/table-client.test.ts [ src/lib/db/table-client.test.ts ]
 FAIL  src/lib/entities/backfill-windows.test.ts [ src/lib/entities/backfill-windows.test.ts ]
Error: EPERM: operation not permitted, mkdir '/var/folders/97/wmwg4qzx02j74c3n73nh438w0000gn/T/Y-bnI9_o2wPU8nMS6a_CI/ssr'
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯


 Test Files  2 failed (2)
      Tests  no tests
   Start at  00:57:22
   Duration  214ms (transform 0ms, setup 0ms, import 0ms, tests 0ms, environment 0ms)


codex
No actionable regressions were identified in the commit. Targeted tests could not execute because the read-only sandbox prevented Vitest from creating temporary files.
No actionable regressions were identified in the commit. Targeted tests could not execute because the read-only sandbox prevented Vitest from creating temporary files.

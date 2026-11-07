OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b05b-1d4b-7e10-8e5e-107e8d54053e
--------
user
commit b4ea9a0
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline b4ea9a0; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 261ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-sAXintTs' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-AkGh6EIu' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/8b-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-eUZgohdO' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-BV9TVCyr' (errno=Operation not permitted)
b4ea9a0 feat(facts): migration two part 2 — promotion predicates, adopt_candidate, restore_reconciled, resolve_lineage_conflict (F3-4)
 src/lib/dq/dq-extensions.integration.test.ts       | 194 ++++++++++++++
 .../migrations/20261107091000_facts_extensions.sql | 298 +++++++++++++++++++++
 2 files changed, 492 insertions(+)

exec
/bin/zsh -lc 'ls -a; for d in /Volumes /Volumes/AIMATE_WORK /Volumes/AIMATE_WORK/Developer /Volumes/AIMATE_WORK/Developer/CodeX /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees; do for f in AGENTS.override.md AGENTS.md; do test ! -f "$d/$f" || cat "$d/$f"; done; done; git show b4ea9a0 --' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
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
reports
scripts
skills
src
supabase
tailwind.config.ts
tsconfig.json
tsconfig.tsbuildinfo
vendor
vercel.json
vitest.config.ts
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-CM5jOzYj' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-VR8w4RqJ' (errno=Operation not permitted)
commit b4ea9a01af261e4b2d679a1a961f8c5f2ded8410
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 02:15:11 2026 -0800

    feat(facts): migration two part 2 — promotion predicates, adopt_candidate, restore_reconciled, resolve_lineage_conflict (F3-4)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/dq/dq-extensions.integration.test.ts b/src/lib/dq/dq-extensions.integration.test.ts
index f271cad..46e89e4 100644
--- a/src/lib/dq/dq-extensions.integration.test.ts
+++ b/src/lib/dq/dq-extensions.integration.test.ts
@@ -364,4 +364,198 @@ describe.skipIf(!enabled)('F3-4 facts extensions migration on real PostgreSQL',(
    await expect(replayMigration(admin,sql())).resolves.toBeUndefined();
   },60000);
  });
+ describe('8b: promotion predicates, adopt_candidate, restore_reconciled, resolve_lineage_conflict',()=>{
+  const item=async(o:{dataset?:string;reason:string;nk?:string;b:string;payload:Record<string,unknown>;detail?:Record<string,unknown>;status?:string;by?:string})=>{
+   const id=randomUUID();
+   await q(`insert into public.dq_quarantine(id,dataset,table_name,natural_key,reason_code,batch_id,payload,detail) values($1,$2,'financial_facts',$3,$4,$5,$6::jsonb,$7::jsonb)`,
+    [id,o.dataset??'facts.us',o.nk??`ext:${randomUUID()}`,o.reason,o.b,JSON.stringify(o.payload),JSON.stringify(o.detail??{})]);
+   if(o.status&&o.status!=='open')await q(`update public.dq_quarantine set status=$2,resolved_by=$3,resolved_at=now() where id=$1`,[id,o.status,o.by??randomUUID()]);
+   return id;
+  };
+  const park=(id:string)=>q(`update public.financial_facts set status='quarantined' where fact_id=$1`,[id]);
+  const promote=(iss:string,ids:string[])=>one(`select public.promote_quarantined($1,'US',$2::uuid[]) v`,[iss,ids]);
+  const resolveFacts=(id:string,chosen:string[],by:string)=>one(`select public.resolve_facts_quarantine($1,$2::uuid[],$3) v`,[id,chosen,by]);
+  const restore=(id:string,b:string,hash:string|null,by:string)=>one(`select public.restore_reconciled($1,$2,$3,$4) v`,[id,b,hash,by]);
+  const itemRow=async(id:string)=>(await q(`select status,detail,payload from public.dq_quarantine where id=$1`,[id]))[0];
+  const latest=(passed:boolean,hash='h1')=>({latest_result:{passed,reconciliation_id:randomUUID(),at:'2026-11-05T00:00:00Z',inputs_hash:hash}});
+  const cand=(ref:string,value:string,o:Record<string,unknown>={})=>({concept:'revenue',sourceConcept:'us-gaap:Revenues',statement:'IS',periodStart:'2023-07-01',periodEnd:'2023-09-30',duration:'3M',value,unit:'USD',consolidation:'consolidated',filingRef:ref,rawHash:`h-${value}`,...o});
+  const NK=(iss:string,ref:string,gen=1,k='revenue:2023-07-01:2023-09-30:consolidated:USD')=>`${iss}:US:${k}:${ref}:${gen}`;
+  const ambiguous=(o:{iss:string;b:string;run:string;ref:string;candidates?:Record<string,unknown>[];key?:Record<string,unknown>})=>item({reason:'ambiguous_value',b:o.b,nk:NK(o.iss,o.ref),
+   payload:{key:o.key??{issuer_id:o.iss,market:'US',concept:'revenue',period_start:'2023-07-01',period_end:'2023-09-30',consolidation:'consolidated',unit:'USD'},candidates:o.candidates??[cand(o.ref,'110'),cand(o.ref,'111')],run_id:o.run}});
+  const adopt=(id:string,index:number,b:string,expected:number,by:string)=>one(`select public.adopt_candidate($1,$2,$3,$4,$5) v`,[id,index,b,expected,by]);
+  const lineageItem=(t:string,b:string,ids:string[],date='2024-02-01')=>item({reason:'lineage_conflict',b,nk:`${t}:revenue:2023-10-01:2023-12-31:consolidated:USD:${date}`,payload:{fact_ids:ids,values:[]}});
+  const resolveLineage=(id:string,keep:string,b:string,by:string)=>one(`select public.resolve_lineage_conflict($1,$2,$3,$4) v`,[id,keep,b,by]);
+
+  it('T6: an open, rejected or not-passing reconcile_mismatch blocks promotion through promote_quarantined and resolve_facts_quarantine; accepted-and-passing does not',async()=>{
+   const {iss,b,r}=await published();const by=await user();
+   await park(r);
+   const m=await item({reason:'reconcile_mismatch',b,payload:{fact_ids:[r]},detail:latest(false)});
+   expect(await promote(iss,[r])).toBe(0);                                                            // open
+   await q(`update public.dq_quarantine set status='resolved_reject',resolved_by=$2,resolved_at=now() where id=$1`,[m,by]);
+   expect(await promote(iss,[r])).toBe(0);                                                            // rejected: the left is really wrong
+   const m2=await item({reason:'reconcile_mismatch',b,payload:{fact_ids:[r]},detail:latest(false),status:'resolved_accept',by});
+   const other=await item({reason:'identity_bs',b,payload:{key:{},fact_ids:[r]}});
+   expect(await resolveFacts(other,[],by)).toMatchObject({promoted:0,skipped:1});                      // resolve_facts_quarantine honours the predicate too
+   const m3=await item({reason:'reconcile_mismatch',b,payload:{fact_ids:[r]},detail:latest(false)});
+   expect(await resolveFacts(m3,[],by)).toMatchObject({promoted:0});                                   // the generic resolver cannot bypass restore_reconciled
+   expect(await status(r)).toBe('quarantined');
+   await q(`update public.dq_quarantine set detail=detail||$2::jsonb where id=any($1::uuid[])`,[[m2,m3],JSON.stringify(latest(true))]);
+   expect(await promote(iss,[r])).toBe(0);                                                            // m is still a reject
+   await q(`update public.dq_quarantine set status='resolved_accept',detail=detail||$2::jsonb where id=$1`,[m,JSON.stringify(latest(true))]);
+   expect(await promote(iss,[r])).toBe(1);
+  });
+
+  it('T6: a resolved lineage_conflict binds promotion to its chosen rows, for payload members and for the rows it quarantined',async()=>{
+   const {iss,b,r0,r}=await published();const by=await user();
+   await park(r);await park(r0);
+   const l=await item({reason:'lineage_conflict',b,payload:{fact_ids:[r]},detail:{chosen_fact_ids:[],quarantined_fact_ids:[r0]},status:'resolved_accept',by});
+   expect(await promote(iss,[r,r0])).toBe(0);
+   await q(`update public.dq_quarantine set detail=jsonb_set(detail,'{chosen_fact_ids}',$2::jsonb) where id=$1`,[l,JSON.stringify([r0])]);
+   expect(await promote(iss,[r,r0])).toBe(1);
+   expect([await status(r0),await status(r)]).toEqual(['ok','quarantined']);
+  });
+
+  it('restore_reconciled (R1): passing with the same hash closes the item first and really promotes; another hash or a failing result is not_passing; another open item makes the row skip',async()=>{
+   const {iss,b,r0,r}=await published();const by=await user();const rb=await batch();
+   await park(r);
+   const m=await item({reason:'reconcile_mismatch',b,payload:{fact_ids:[r]},detail:{...latest(true,'h1'),issuer_id:iss,market:'US'}});
+   const before=await rev(iss);
+   expect(await fails(restore(m,rb,'h2',by))).toMatchObject({message:'not_passing',code:'P0001'});
+   expect(await fails(restore(m,rb,null,by))).toMatchObject({message:'not_passing'});
+   expect(await fails(restore(m,await batch('facts.us',true),'h1',by))).toMatchObject({message:'batch_mismatch'});
+   expect(await restore(m,rb,'h1',by)).toEqual({promoted:1,skipped:[]});
+   expect(await status(r)).toBe('ok');expect(await rev(iss)).toBe(before+1);
+   const row=await itemRow(m);
+   expect(row.status).toBe('resolved_accept');
+   expect(row.detail).toMatchObject({restored_by_batch:rb,chosen_fact_ids:[r],hook:{stage:'materialize',state:'pending'}});
+   expect(await fails(restore(m,rb,'h1',by))).toMatchObject({message:'item_not_open'});
+   await park(r0);
+   const n=await item({reason:'reconcile_mismatch',b,payload:{fact_ids:[r0]},detail:latest(false,'h1')});
+   expect(await fails(restore(n,rb,'h1',by))).toMatchObject({message:'not_passing'});
+   await item({reason:'identity_bs',b,payload:{key:{},fact_ids:[r0]}});                                 // still referenced elsewhere
+   await q(`update public.dq_quarantine set detail=detail||$2::jsonb where id=$1`,[n,JSON.stringify(latest(true,'h1'))]);
+   expect(await restore(n,rb,'h1',by)).toEqual({promoted:0,skipped:[{fact_id:r0,reason:'ineligible'}]});
+   expect((await itemRow(n)).status).toBe('resolved_accept');expect(await status(r0)).toBe('quarantined');
+   const wrong=await item({reason:'identity_bs',b,payload:{key:{},fact_ids:[]}});
+   expect(await fails(restore(wrong,rb,'h1',by))).toMatchObject({message:'item_not_open'});
+  });
+
+  it('adopt_candidate (T5): maps the persisted camelCase candidate, takes issuer and market from the filing, generation from the anchor run, mapping_version from retained rows; the hook in the same transaction; a management run',async()=>{
+   const {iss,b,run,f,fRef}=await published();const by=await user();const ab=await batch();
+   const id=await ambiguous({iss,b,run,ref:fRef,key:{issuer_id:randomUUID(),market:'CN'}});        // payload key is never trusted
+   const out=await adopt(id,1,ab,1,by);
+   expect(out).toMatchObject({issuer_id:iss,market:'US'});
+   const [fact]=await q(`select issuer_id,market,filing_id,run_id,concept,source_concept,statement,period_start::text ps,period_end::text pe,duration,value_text,unit,consolidation,available_date::text ad,mapping_gen,mapping_version,status,raw_hash from public.financial_facts where fact_id=$1`,[out.fact_id]);
+   expect(fact).toEqual({issuer_id:iss,market:'US',filing_id:f,run_id:out.run_id,concept:'revenue',source_concept:'us-gaap:Revenues',statement:'IS',ps:'2023-07-01',pe:'2023-09-30',duration:'3M',value_text:'111',unit:'USD',consolidation:'consolidated',ad:'2024-02-01',mapping_gen:1,mapping_version:'facts-map/1',status:'ok',raw_hash:'h-111'});
+   expect(await q(`select issuer_id,market,batch_id,mapping_gen,status,manifest,published_at is not null pub from public.fact_sync_runs where run_id=$1`,[out.run_id])).toEqual([{issuer_id:iss,market:'US',batch_id:ab,mapping_gen:1,status:'published',manifest:[],pub:true}]);
+   expect(await q(`select mapping_gen from public.filings where filing_id=$1`,[f])).toEqual([{mapping_gen:1}]);   // a management run activates nothing
+   const row=await itemRow(id);
+   expect(row.status).toBe('resolved_accept');
+   expect(row.detail).toMatchObject({chosen_candidate_index:1,adopted_fact_id:out.fact_id,run_id:out.run_id,issuer_id:iss,market:'US',batch_id:ab,hook:{stage:'materialize',state:'pending'}});
+   expect(await rev(iss)).toBe(2);
+   expect((await factsRead(iss,{concepts:['revenue'],history:false})).rows.map(x=>x.fact_id)).toContain(out.fact_id);
+   expect(await fails(adopt(id,0,ab,2,by))).toMatchObject({message:'item_not_open'});
+  });
+
+  it('adopt_candidate codes: invalid_choice, invalid_candidate, filing_not_found, batch_mismatch, stale_evaluation, generation_moved; the item stays open',async()=>{
+   const {iss,b,run,fRef}=await published();const by=await user();const ab=await batch();
+   const id=await ambiguous({iss,b,run,ref:fRef,candidates:[cand(fRef,'110'),cand(fRef,'111',{rawHash:undefined}),cand(fRef,'112',{periodStart:null}),cand('no-such-accession','113'),cand(fRef,'1e5')]});
+   for(const i of [-1,5])expect(await fails(adopt(id,i,ab,1,by))).toMatchObject({message:'invalid_choice',code:'22023'});
+   for(const i of [1,2,4])expect(await fails(adopt(id,i,ab,1,by))).toMatchObject({message:'invalid_candidate',code:'22023'});
+   expect(await fails(adopt(id,3,ab,1,by))).toMatchObject({message:'filing_not_found',code:'P0001'});
+   expect(await fails(adopt(id,0,await batch('facts.us',true),1,by))).toMatchObject({message:'batch_mismatch'});
+   expect(await fails(adopt(id,0,await batch('facts.cn'),1,by))).toMatchObject({message:'batch_mismatch'});
+   expect(await fails(adopt(id,0,ab,0,by))).toMatchObject({message:'stale_evaluation'});
+   const moved=await item({reason:'ambiguous_value',b,nk:NK(iss,fRef,2),payload:{candidates:[cand(fRef,'110')],run_id:run}});
+   expect(await fails(adopt(moved,0,ab,1,by))).toMatchObject({message:'generation_moved'});
+   const noRun=await item({reason:'ambiguous_value',b,nk:NK(iss,fRef,1,'revenue:2023-07-01:2023-09-30:consolidated:EUR'),payload:{candidates:[cand(fRef,'110')],run_id:randomUUID()}});
+   expect(await fails(adopt(noRun,0,ab,1,by))).toMatchObject({message:'generation_moved'});
+   const notAmbiguous=await item({reason:'odd_duration',b,payload:{candidates:[cand(fRef,'110')],run_id:run}});
+   expect(await fails(adopt(notAmbiguous,0,ab,1,by))).toMatchObject({message:'invalid_choice'});
+   expect((await itemRow(id)).status).toBe('open');expect(await rev(iss)).toBe(1);
+  });
+
+  it('adopt_candidate: duplicate on the full candidate key in any status; an old-generation row with the same key is no duplicate (T1); replay_required without exactly one retained mapping_version',async()=>{
+   const {iss,b,run,f,fRef}=await published();const by=await user();
+   const k4='revenue:2023-10-01:2023-12-31:consolidated:USD';                                          // the key of r on f, generation 1
+   const four=(value:string)=>cand(fRef,value,{periodStart:'2023-10-01',periodEnd:'2023-12-31'});
+   const dup=await item({reason:'ambiguous_value',b,nk:NK(iss,fRef,1,k4),payload:{candidates:[four('105')],run_id:run}});
+   expect(await fails(adopt(dup,0,await batch(),1,by))).toMatchObject({message:'duplicate'});
+   const run2=await begin(iss,b,2);await stage(run2,[{filing_id:f,concept:'net_income',value:'5',mapping_version:'facts-map/2'}]);await publish(run2,[f]);   // f moves to gen 2, r stays as evidence
+   const old=await item({reason:'ambiguous_value',b,nk:NK(iss,fRef,2,k4),payload:{candidates:[four('105')],run_id:run2}});
+   const out=await adopt(old,0,await batch(),2,by);
+   expect(await q(`select mapping_gen,mapping_version from public.financial_facts where fact_id=$1`,[out.fact_id])).toEqual([{mapping_gen:2,mapping_version:'facts-map/2'}]);
+   const run3=await begin(iss,b,2);await stage(run3,[{filing_id:f,concept:'total_assets',period_start:null,duration:'INSTANT',value:'9',mapping_version:'facts-map/3'}]);await publish(run3,[f]);
+   const run4=await begin(iss,b,2);await publish(run4,[]);                                              // an anchor run without rows
+   const rr=await item({reason:'ambiguous_value',b,nk:NK(iss,fRef,2),payload:{candidates:[cand(fRef,'110')],run_id:run4}});
+   expect(await fails(adopt(rr,0,await batch(),await rev(iss),by))).toMatchObject({message:'replay_required'});
+  });
+
+  it('adopt_candidate conflict_exists (U3): a visible ok row with another value for (K, date), or an open same_day_conflict / lineage_conflict on it even with no ok competitor left',async()=>{
+   const {iss,b,run,fRef}=await published();const by=await user();
+   const run2=await begin(iss,b,1);const g=await filing(run2);
+   const [y]=await stage(run2,[{filing_id:g.id,period_start:'2023-07-01',period_end:'2023-09-30',value:'109'}]);await publish(run2,[g.id]);
+   const a=await ambiguous({iss,b,run,ref:fRef});
+   expect(await fails(adopt(a,0,await batch(),2,by))).toMatchObject({message:'conflict_exists'});
+   await park(y);
+   const key={issuer_id:iss,market:'US',concept:'revenue',period_start:'2023-07-01',period_end:'2023-09-30',consolidation:'consolidated',unit:'USD',available_date:'2024-02-01'};
+   const sd=await item({reason:'same_day_conflict',b,nk:`${iss}:US:revenue:2023-07-01:2023-09-30:consolidated:USD:2024-02-01`,payload:{key,fact_ids:[y],values:[]}});
+   expect(await fails(adopt(a,0,await batch(),2,by))).toMatchObject({message:'conflict_exists'});
+   await q(`update public.dq_quarantine set status='resolved_reject',resolved_by=$2,resolved_at=now() where id=$1`,[sd,by]);
+   const ln=await item({reason:'lineage_conflict',b,nk:`${iss}:revenue:2023-07-01:2023-09-30:consolidated:USD:2024-02-01`,payload:{fact_ids:[y]}});
+   expect(await fails(adopt(a,0,await batch(),2,by))).toMatchObject({message:'conflict_exists'});
+   await q(`update public.dq_quarantine set status='resolved_reject',resolved_by=$2,resolved_at=now() where id=$1`,[ln,by]);
+   expect(await adopt(a,0,await batch(),2,by)).toMatchObject({issuer_id:iss});
+  });
+
+  it('resolve_lineage_conflict: locks the whole lineage, re-queries under the lock, leaves exactly one ok value, persists the verdict that promote_quarantined then obeys',async()=>{
+   const {iss:t,b,r}=await published();const {iss:s,b:sb,x}=await sibling('200');const by=await user();
+   const run2=await begin(s,sb);const g=await filing(run2);const [z]=await stage(run2,[{filing_id:g.id,value:'300'}]);await publish(run2,[g.id]);   // not in the payload
+   await merge(s,t,by);
+   expect((await lineageRead([t,s],{concepts:['revenue']})).conflicts[0].fact_ids).toEqual([r,x,z].sort());
+   const id=await lineageItem(t,b,[r,x]);
+   const revs=[await rev(t),await rev(s)];
+   expect(await fails(resolveLineage(id,randomUUID(),await batch(),by))).toMatchObject({message:'invalid_choice'});
+   expect(await resolveLineage(id,r,await batch(),by)).toEqual({quarantined:2});
+   expect([await status(r),await status(x),await status(z)]).toEqual(['ok','quarantined','quarantined']);
+   expect([await rev(t),await rev(s)]).toEqual([revs[0]+1,revs[1]+1]);
+   const row=await itemRow(id);
+   expect(row.status).toBe('resolved_accept');
+   expect(row.detail).toMatchObject({chosen_fact_ids:[r],quarantined_fact_ids:[x,z].sort(),issuer_id:t,market:'US',hook:{stage:'materialize',state:'pending'}});
+   const env=await lineageRead([t,s],{concepts:['revenue'],history:false});
+   expect(env.conflicts).toEqual([]);expect(env.rows.map(y=>y.fact_id)).toEqual([r]);
+   expect(await one(`select public.promote_quarantined($1,'US',$2::uuid[]) v`,[s,[x,z]])).toBe(0);    // the verdict binds
+  });
+
+  it('resolve_lineage_conflict: payload rows outside the lineage → lineage_changed; a kept row that is not ok → unresolved with nothing changed; it waits behind a lock on any member scope',async()=>{
+   const {iss:t,b,r}=await published();const {iss:s,x}=await sibling('200');const {x:outsider}=await sibling('250');const by=await user();
+   await merge(s,t,by);
+   const bad=await lineageItem(t,b,[r,outsider],'2024-02-02');
+   expect(await fails(resolveLineage(bad,r,await batch(),by))).toMatchObject({message:'lineage_changed'});
+   const id=await lineageItem(t,b,[r,x]);
+   await park(r);
+   expect(await fails(resolveLineage(id,r,await batch(),by))).toMatchObject({message:'unresolved'});
+   expect(await status(x)).toBe('ok');expect((await itemRow(id)).status).toBe('open');                 // rolled back
+   await q(`update public.financial_facts set status='ok' where fact_id=$1`,[r]);
+   const ab=await batch();
+   await inTx(admin,async({c,pid,commit})=>{
+    await c.query(`select 1 from public.fact_sync_scope where issuer_id=$1 and market='US' for update`,[s]);
+    const p=resolveLineage(id,x,ab,by);p.catch(()=>{});
+    await stillBlockedBehind(admin,pid,p);
+    await commit();
+    expect(await p).toEqual({quarantined:1});
+   });
+   expect([await status(r),await status(x)]).toEqual(['quarantined','ok']);
+   const malformed=await item({reason:'lineage_conflict',b,nk:`${t}:revenue:2024-02-01`,payload:{fact_ids:[r]}});
+   expect(await fails(resolveLineage(malformed,r,ab,by))).toMatchObject({message:'invalid_choice'});
+  });
+
+  it('grants: the three verdict functions are service_role only',async()=>{
+   const fn=(role:string,sig:string)=>one(`select has_function_privilege($1,$2,'EXECUTE') v`,[role,sig]);
+   for(const sig of ['public.adopt_candidate(uuid,int,uuid,bigint,uuid)','public.restore_reconciled(uuid,uuid,text,uuid)','public.resolve_lineage_conflict(uuid,uuid,uuid,uuid)']){
+    for(const role of ['anon','authenticated'])expect({sig,role,ok:await fn(role,sig)}).toEqual({sig,role,ok:false});
+    expect(await fn('service_role',sig)).toBe(true);
+   }
+  });
+ });
 });
diff --git a/supabase/migrations/20261107091000_facts_extensions.sql b/supabase/migrations/20261107091000_facts_extensions.sql
index 8dfaa97..863e4ca 100644
--- a/supabase/migrations/20261107091000_facts_extensions.sql
+++ b/supabase/migrations/20261107091000_facts_extensions.sql
@@ -406,3 +406,301 @@ begin
 end $$;
 revoke execute on function public.set_dissolved(uuid, uuid) from public, anon, authenticated;
 grant execute on function public.set_dissolved(uuid, uuid) to service_role;
+
+-- ---------------------------------------------------------------- 7. promotion eligibility (spec §3.2, T6)
+-- The plan-2 helper with every landed predicate kept verbatim, plus two: (a) a RESOLVED
+-- lineage_conflict binds its members — payload.fact_ids and the rows it quarantined
+-- (detail.quarantined_fact_ids) — to detail.chosen_fact_ids; (b) a reconcile_mismatch that
+-- references the row blocks unless it is resolved_accept with latest_result.passed = true (open,
+-- rejected, or accepted without a passing latest result all block; restoring goes through
+-- restore_reconciled). Callers hold the scope lock (promote_quarantined, resolve_facts_quarantine,
+-- restore_reconciled).
+create or replace function public.fact_promote_rows(p_issuer uuid, p_market text, p_fact_ids uuid[])
+returns int language plpgsql security definer set search_path = public as $$
+declare n int;
+begin
+  update public.financial_facts f set status = 'ok'
+  from public.fact_sync_runs r, public.filings g
+  where f.fact_id = any(p_fact_ids) and f.issuer_id = p_issuer and f.market = p_market and f.status = 'quarantined'
+    and r.run_id = f.run_id and r.status = 'published'
+    and g.filing_id = f.filing_id and g.mapping_gen = f.mapping_gen
+    and not exists (
+      select 1 from public.dq_quarantine q
+      where q.table_name = 'financial_facts' and q.status = 'open'
+        and jsonb_typeof(q.payload -> 'fact_ids') = 'array' and q.payload -> 'fact_ids' ? f.fact_id::text)
+    and not exists (
+      select 1 from public.dq_quarantine q
+      where q.table_name = 'financial_facts' and q.reason_code = 'same_day_conflict' and q.status = 'open'
+        and q.payload -> 'key' ->> 'issuer_id' = f.issuer_id::text and q.payload -> 'key' ->> 'market' = f.market
+        and q.payload -> 'key' ->> 'concept' = f.concept
+        and f.period_start is not distinct from nullif(q.payload -> 'key' ->> 'period_start', '')::date
+        and (q.payload -> 'key' ->> 'period_end')::date = f.period_end
+        and q.payload -> 'key' ->> 'consolidation' = f.consolidation and q.payload -> 'key' ->> 'unit' = f.unit
+        and (q.payload -> 'key' ->> 'available_date')::date = f.available_date)
+    and not exists (
+      select 1 from public.dq_quarantine q
+      where q.table_name = 'financial_facts' and q.reason_code = 'same_day_conflict' and q.status <> 'open'
+        and jsonb_typeof(q.payload -> 'fact_ids') = 'array' and q.payload -> 'fact_ids' ? f.fact_id::text
+        and not (coalesce(q.detail -> 'chosen_fact_ids', '[]'::jsonb) ? f.fact_id::text))
+    and not exists (
+      select 1 from public.dq_quarantine q
+      where q.table_name = 'financial_facts' and q.reason_code = 'lineage_conflict' and q.status <> 'open'
+        and ((jsonb_typeof(q.payload -> 'fact_ids') = 'array' and q.payload -> 'fact_ids' ? f.fact_id::text)
+             or (jsonb_typeof(q.detail -> 'quarantined_fact_ids') = 'array' and q.detail -> 'quarantined_fact_ids' ? f.fact_id::text))
+        and not (coalesce(q.detail -> 'chosen_fact_ids', '[]'::jsonb) ? f.fact_id::text))
+    and not exists (
+      select 1 from public.dq_quarantine q
+      where q.table_name = 'financial_facts' and q.reason_code = 'reconcile_mismatch'
+        and jsonb_typeof(q.payload -> 'fact_ids') = 'array' and q.payload -> 'fact_ids' ? f.fact_id::text
+        and (q.status <> 'resolved_accept' or (q.detail -> 'latest_result' -> 'passed') is distinct from 'true'::jsonb));
+  get diagnostics n = row_count;
+  return n;
+end $$;
+revoke execute on function public.fact_promote_rows(uuid, text, uuid[]) from public, anon, authenticated, service_role;
+
+-- ---------------------------------------------------------------- 8. adopt a quarantined candidate (spec §3.2 adopt_candidate, §4.6, T1, T5, U3)
+-- The item is an open ambiguous_value of facts.us / facts.cn; the persisted candidate is the plan-2
+-- FactCandidate (camelCase) and is mapped field by field (anything missing or ill-typed →
+-- invalid_candidate). The filing comes from (source by market, source_ref = filingRef) and gives
+-- issuer, market and available_date (the payload is not trusted). The generation is the anchor
+-- run's (payload.run_id) and must equal the natural key's last segment and filings.mapping_gen
+-- (> 0), else generation_moved. mapping_version = the one distinct value retained by the anchor
+-- run's rows (none → by the same filing and generation); zero or several → replay_required (the
+-- current default is never used). The batch must be running for the item's dataset. Under the
+-- filing's scope lock: state_rev = p_expected_rev (stale_evaluation); the full plan-2 candidate key
+-- (K + filing + generation) in any status → duplicate (an old generation alone is no duplicate);
+-- a visible ok row of (K, available_date) with another value OR an open same_day_conflict /
+-- lineage_conflict on it → conflict_exists. Then one transaction: a management run (published, no
+-- manifest, activates nothing), the fact staged → ok, the item resolved with
+-- chosen_candidate_index / adopted_fact_id / run_id / issuer_id / market / batch_id and
+-- hook = pending, state_rev + 1.
+create or replace function public.adopt_candidate(p_item uuid, p_index int, p_batch uuid, p_expected_rev bigint, p_resolved_by uuid)
+returns jsonb language plpgsql security definer set search_path = public as $$
+declare q public.dq_quarantine; c jsonb; g public.filings; r public.fact_sync_runs; b public.ingest_batches;
+        v_source text; v_market text; v_gen int; v_nk_gen int; v_versions text[]; v_rev bigint;
+        v_ps date; v_pe date; v_value numeric; v_run uuid := gen_random_uuid(); v_fact uuid := gen_random_uuid(); v_t uuid; v_k text;
+begin
+  if p_resolved_by is null then raise exception 'invalid_resolver' using errcode = '22023'; end if;
+  select * into q from public.dq_quarantine where id = p_item;
+  if not found or q.status <> 'open' then raise exception 'item_not_open' using errcode = 'P0001'; end if;
+  if q.table_name <> 'financial_facts' or q.reason_code <> 'ambiguous_value' or q.dataset not in ('facts.us','facts.cn') then
+    raise exception 'invalid_choice' using errcode = '22023';
+  end if;
+  if coalesce(jsonb_typeof(q.payload -> 'candidates'), '') <> 'array' or p_index is null or p_index < 0 or p_index >= jsonb_array_length(q.payload -> 'candidates') then
+    raise exception 'invalid_choice' using errcode = '22023';
+  end if;
+  c := q.payload -> 'candidates' -> p_index;
+  if jsonb_typeof(c) <> 'object'
+     or coalesce(jsonb_typeof(c -> 'concept'), '') <> 'string' or coalesce(jsonb_typeof(c -> 'sourceConcept'), '') <> 'string'
+     or coalesce(jsonb_typeof(c -> 'unit'), '') <> 'string' or coalesce(jsonb_typeof(c -> 'filingRef'), '') <> 'string'
+     or coalesce(jsonb_typeof(c -> 'rawHash'), '') <> 'string' or coalesce(jsonb_typeof(c -> 'value'), '') <> 'string'
+     or coalesce(jsonb_typeof(c -> 'periodEnd'), '') <> 'string' or coalesce(jsonb_typeof(c -> 'periodStart'), 'missing') not in ('null', 'string')
+     or coalesce(c ->> 'statement', '') not in ('IS','BS','CF','DEI')
+     or coalesce(c ->> 'duration', '') not in ('3M','6M','9M','12M','INSTANT')
+     or coalesce(c ->> 'consolidation', '') not in ('consolidated','parent') then
+    raise exception 'invalid_candidate' using errcode = '22023';
+  end if;
+  if length(c ->> 'concept') not between 1 and 64 or length(c ->> 'sourceConcept') not between 1 and 256
+     or length(c ->> 'unit') not between 1 and 16 or length(c ->> 'rawHash') not between 1 and 128
+     or (c ->> 'value') !~ '^-?[0-9]+(\.[0-9]+)?$' or (c ->> 'periodEnd') !~ '^\d{4}-\d{2}-\d{2}$'
+     or (jsonb_typeof(c -> 'periodStart') = 'string' and (c ->> 'periodStart') !~ '^\d{4}-\d{2}-\d{2}$')
+     or ((jsonb_typeof(c -> 'periodStart') = 'null') <> ((c ->> 'duration') = 'INSTANT')) then
+    raise exception 'invalid_candidate' using errcode = '22023';
+  end if;
+  begin
+    v_pe := (c ->> 'periodEnd')::date;
+    v_ps := (c ->> 'periodStart')::date;
+    v_value := (c ->> 'value')::numeric;
+  exception when others then
+    raise exception 'invalid_candidate' using errcode = '22023';
+  end;
+  if v_ps is not null and not (v_ps < v_pe) then raise exception 'invalid_candidate' using errcode = '22023'; end if;
+  v_market := case q.dataset when 'facts.us' then 'US' else 'CN' end;
+  v_source := case q.dataset when 'facts.us' then 'edgar' else 'tushare' end;
+  select * into g from public.filings where source = v_source and source_ref = c ->> 'filingRef';
+  if not found or g.market <> v_market then raise exception 'filing_not_found' using errcode = 'P0001'; end if;
+  if coalesce(q.payload ->> 'run_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
+    raise exception 'generation_moved' using errcode = 'P0001';
+  end if;
+  select * into r from public.fact_sync_runs where run_id = (q.payload ->> 'run_id')::uuid;
+  if not found then raise exception 'generation_moved' using errcode = 'P0001'; end if;
+  v_gen := r.mapping_gen;
+  v_nk_gen := substring(q.natural_key from ':([0-9]+)$')::int;
+  if v_nk_gen is distinct from v_gen or g.mapping_gen is distinct from v_gen or v_gen <= 0 or r.market <> g.market then
+    raise exception 'generation_moved' using errcode = 'P0001';
+  end if;
+  select array_agg(distinct f.mapping_version) into v_versions from public.financial_facts f where f.run_id = r.run_id;
+  if v_versions is null then
+    select array_agg(distinct f.mapping_version) into v_versions from public.financial_facts f where f.filing_id = g.filing_id and f.mapping_gen = v_gen;
+  end if;
+  if v_versions is null or cardinality(v_versions) <> 1 then raise exception 'replay_required' using errcode = 'P0001'; end if;
+  select * into b from public.ingest_batches where batch_id = p_batch;
+  if not found or b.status <> 'running' or b.dataset <> q.dataset then raise exception 'batch_mismatch' using errcode = 'P0001'; end if;
+  select s.state_rev into v_rev from public.fact_sync_scope s where s.issuer_id = g.issuer_id and s.market = g.market for update;
+  if not found then raise exception 'scope_missing' using errcode = 'P0001'; end if;
+  if v_rev is distinct from p_expected_rev then raise exception 'stale_evaluation' using errcode = 'P0001'; end if;
+  select * into q from public.dq_quarantine where id = p_item for update;
+  if q.status <> 'open' then raise exception 'item_not_open' using errcode = 'P0001'; end if;
+  if exists (select 1 from public.financial_facts f
+             where f.issuer_id = g.issuer_id and f.concept = c ->> 'concept' and f.period_start is not distinct from v_ps and f.period_end = v_pe
+               and f.consolidation = c ->> 'consolidation' and f.unit = c ->> 'unit' and f.filing_id = g.filing_id and f.mapping_gen = v_gen) then
+    raise exception 'duplicate' using errcode = 'P0001';
+  end if;
+  v_t := coalesce((select i.merged_into from public.issuers i where i.issuer_id = g.issuer_id), g.issuer_id);
+  v_k := (c ->> 'concept') || ':' || coalesce(c ->> 'periodStart', '') || ':' || (c ->> 'periodEnd') || ':' || (c ->> 'consolidation') || ':' || (c ->> 'unit');
+  if exists (select 1 from public.financial_facts f join public.filings fg on fg.filing_id = f.filing_id and fg.mapping_gen = f.mapping_gen
+             where f.issuer_id = g.issuer_id and f.market = g.market and f.status = 'ok' and f.concept = c ->> 'concept'
+               and f.period_start is not distinct from v_ps and f.period_end = v_pe and f.consolidation = c ->> 'consolidation' and f.unit = c ->> 'unit'
+               and f.available_date = g.available_date and f.value <> v_value)
+     or exists (select 1 from public.dq_quarantine d
+                where d.table_name = 'financial_facts' and d.status = 'open' and d.reason_code = 'same_day_conflict'
+                  and d.payload -> 'key' ->> 'issuer_id' = g.issuer_id::text and d.payload -> 'key' ->> 'market' = g.market
+                  and d.payload -> 'key' ->> 'concept' = c ->> 'concept'
+                  and coalesce(d.payload -> 'key' ->> 'period_start', '') = coalesce(c ->> 'periodStart', '')
+                  and d.payload -> 'key' ->> 'period_end' = c ->> 'periodEnd'
+                  and d.payload -> 'key' ->> 'consolidation' = c ->> 'consolidation' and d.payload -> 'key' ->> 'unit' = c ->> 'unit'
+                  and d.payload -> 'key' ->> 'available_date' = g.available_date::text)
+     or exists (select 1 from public.dq_quarantine d
+                where d.table_name = 'financial_facts' and d.status = 'open' and d.reason_code = 'lineage_conflict'
+                  and d.natural_key = v_t::text || ':' || v_k || ':' || g.available_date::text) then
+    raise exception 'conflict_exists' using errcode = 'P0001';
+  end if;
+  insert into public.fact_sync_runs (run_id, issuer_id, market, batch_id, mapping_gen, status, manifest, started_at, published_at)
+  values (v_run, g.issuer_id, g.market, p_batch, v_gen, 'published', '[]'::jsonb, now(), now());
+  insert into public.financial_facts (fact_id, issuer_id, market, filing_id, run_id, concept, source_concept, statement, period_start, period_end, duration, value, unit, consolidation, available_date, mapping_gen, mapping_version, raw_hash)
+  values (v_fact, g.issuer_id, g.market, g.filing_id, v_run, c ->> 'concept', c ->> 'sourceConcept', c ->> 'statement', v_ps, v_pe, c ->> 'duration', v_value,
+          c ->> 'unit', c ->> 'consolidation', g.available_date, v_gen, v_versions[1], c ->> 'rawHash');
+  update public.financial_facts set status = 'ok' where fact_id = v_fact;
+  update public.dq_quarantine
+  set status = 'resolved_accept', resolved_by = p_resolved_by, resolved_at = now(),
+      detail = detail || jsonb_build_object('chosen_candidate_index', p_index, 'adopted_fact_id', v_fact, 'run_id', v_run, 'issuer_id', g.issuer_id,
+                                            'market', g.market, 'batch_id', p_batch, 'hook', jsonb_build_object('stage', 'materialize', 'state', 'pending', 'at', to_jsonb(now())))
+  where id = p_item;
+  update public.fact_sync_scope set state_rev = state_rev + 1, updated_at = now() where issuer_id = g.issuer_id and market = g.market;
+  return jsonb_build_object('fact_id', v_fact, 'run_id', v_run, 'issuer_id', g.issuer_id, 'market', g.market);
+end $$;
+revoke execute on function public.adopt_candidate(uuid, int, uuid, bigint, uuid) from public, anon, authenticated;
+grant execute on function public.adopt_candidate(uuid, int, uuid, bigint, uuid) to service_role;
+
+-- ---------------------------------------------------------------- 9. restore after a passing re-run (spec §3.2 restore_reconciled, §5.6, R1)
+-- Open reconcile_mismatch only; p_batch running. Scope lock (issuer of the first member row by
+-- fact_id, else detail.issuer_id/market), item re-read under it. latest_result.passed must be
+-- true and latest_result.inputs_hash must equal p_inputs_hash_now (computed by the caller from the
+-- CURRENT inputs with the same function the runner uses), else not_passing. The item is closed
+-- FIRST (it no longer blocks its own rows; other open items still do), then payload.fact_ids go
+-- through fact_promote_rows; state_rev + 1; hook = pending. skipped lists every member not
+-- promoted: missing / not_quarantined / ineligible.
+create or replace function public.restore_reconciled(p_item uuid, p_batch uuid, p_inputs_hash_now text, p_resolved_by uuid)
+returns jsonb language plpgsql security definer set search_path = public as $$
+declare q public.dq_quarantine; v_issuer uuid; v_market text; v_ids uuid[]; v_before uuid[]; v_promoted int := 0; v_skipped jsonb;
+begin
+  if p_resolved_by is null then raise exception 'invalid_resolver' using errcode = '22023'; end if;
+  select * into q from public.dq_quarantine where id = p_item;
+  if not found or q.status <> 'open' or q.table_name <> 'financial_facts' or q.reason_code <> 'reconcile_mismatch' then
+    raise exception 'item_not_open' using errcode = 'P0001';
+  end if;
+  if not exists (select 1 from public.ingest_batches where batch_id = p_batch and status = 'running') then raise exception 'batch_mismatch' using errcode = 'P0001'; end if;
+  v_ids := public.fact_item_members(q.payload);
+  select f.issuer_id, f.market into v_issuer, v_market from public.financial_facts f where f.fact_id = any(v_ids) order by f.fact_id limit 1;
+  if v_issuer is null and coalesce(q.detail ->> 'issuer_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
+    v_issuer := (q.detail ->> 'issuer_id')::uuid; v_market := q.detail ->> 'market';
+  end if;
+  if v_issuer is not null then
+    perform 1 from public.fact_sync_scope where issuer_id = v_issuer and market = v_market for update;
+  end if;
+  select * into q from public.dq_quarantine where id = p_item for update;
+  if q.status <> 'open' then raise exception 'item_not_open' using errcode = 'P0001'; end if;
+  if (q.detail -> 'latest_result' -> 'passed') is distinct from 'true'::jsonb
+     or p_inputs_hash_now is null or (q.detail -> 'latest_result' ->> 'inputs_hash') is distinct from p_inputs_hash_now then
+    raise exception 'not_passing' using errcode = 'P0001';
+  end if;
+  v_ids := public.fact_item_members(q.payload);
+  update public.dq_quarantine
+  set status = 'resolved_accept', resolved_by = p_resolved_by, resolved_at = now(),
+      detail = detail || jsonb_build_object('restored_by_batch', p_batch, 'chosen_fact_ids', to_jsonb(v_ids),
+                                            'hook', jsonb_build_object('stage', 'materialize', 'state', 'pending', 'at', to_jsonb(now())))
+  where id = p_item;
+  v_before := array(select f.fact_id from public.financial_facts f where f.fact_id = any(v_ids) and f.status = 'quarantined');
+  if v_issuer is not null then
+    v_promoted := public.fact_promote_rows(v_issuer, v_market, v_ids);
+    update public.fact_sync_scope set state_rev = state_rev + 1, updated_at = now() where issuer_id = v_issuer and market = v_market;
+  end if;
+  select coalesce(jsonb_agg(jsonb_build_object('fact_id', x.id,
+           'reason', case when f.fact_id is null then 'missing' when not (x.id = any(v_before)) then 'not_quarantined' else 'ineligible' end) order by x.id), '[]'::jsonb)
+    into v_skipped
+  from unnest(v_ids) as x(id) left join public.financial_facts f on f.fact_id = x.id
+  where f.fact_id is null or not (x.id = any(v_before)) or f.status <> 'ok';
+  return jsonb_build_object('promoted', v_promoted, 'skipped', v_skipped);
+end $$;
+revoke execute on function public.restore_reconciled(uuid, uuid, text, uuid) from public, anon, authenticated;
+grant execute on function public.restore_reconciled(uuid, uuid, text, uuid) to service_role;
+
+-- ---------------------------------------------------------------- 10. lineage verdict (spec §3.2 resolve_lineage_conflict, §4.4)
+-- natural_key = <T>:<concept>:<period_start>:<period_end>:<consolidation>:<unit>:<available_date>.
+-- The current lineage of T (T ∪ merged_into = T) is computed, every member's scope row locked in
+-- (issuer_id, market) order (missing → scope_missing), the lineage re-read under the locks
+-- (changed → lineage_changed); payload rows must belong to it (else lineage_changed); p_keep must
+-- be a payload member (else invalid_choice). Every OTHER visible ok row of (K, date) in the lineage
+-- — re-queried under the locks, not only the payload — becomes quarantined; afterwards exactly one
+-- visible ok row must remain (else unresolved, rolled back). Verdict persisted
+-- (chosen_fact_ids, quarantined_fact_ids, issuer_id = T, market, hook pending); every member
+-- state_rev + 1.
+create or replace function public.resolve_lineage_conflict(p_item uuid, p_keep uuid, p_batch uuid, p_resolved_by uuid)
+returns jsonb language plpgsql security definer set search_path = public as $$
+declare q public.dq_quarantine; v_parts text[]; v_t uuid; v_market text; v_lineage uuid[]; v_now uuid[]; v_locked int; v_ids uuid[];
+        v_concept text; v_ps date; v_pe date; v_cons text; v_unit text; v_date date; v_q uuid[]; v_ok int;
+begin
+  if p_resolved_by is null then raise exception 'invalid_resolver' using errcode = '22023'; end if;
+  select * into q from public.dq_quarantine where id = p_item;
+  if not found or q.status <> 'open' then raise exception 'item_not_open' using errcode = 'P0001'; end if;
+  if q.table_name <> 'financial_facts' or q.reason_code <> 'lineage_conflict' or q.dataset not in ('facts.us','facts.cn') then
+    raise exception 'invalid_choice' using errcode = '22023';
+  end if;
+  if not exists (select 1 from public.ingest_batches where batch_id = p_batch and status = 'running') then raise exception 'batch_mismatch' using errcode = 'P0001'; end if;
+  v_parts := string_to_array(q.natural_key, ':');
+  if cardinality(v_parts) <> 7 then raise exception 'invalid_choice' using errcode = '22023'; end if;
+  begin
+    v_t := v_parts[1]::uuid; v_concept := v_parts[2]; v_ps := nullif(v_parts[3], '')::date; v_pe := v_parts[4]::date;
+    v_cons := v_parts[5]; v_unit := v_parts[6]; v_date := v_parts[7]::date;
+  exception when others then
+    raise exception 'invalid_choice' using errcode = '22023';
+  end;
+  v_market := case q.dataset when 'facts.us' then 'US' else 'CN' end;
+  v_lineage := array(select l.i from (select v_t as i union select issuer_id from public.issuers where merged_into = v_t) l order by l.i);
+  select count(*) into v_locked from (
+    select 1 from public.fact_sync_scope s where s.issuer_id = any(v_lineage) and s.market = v_market order by s.issuer_id for update) x;
+  if v_locked <> cardinality(v_lineage) then raise exception 'scope_missing' using errcode = 'P0001'; end if;
+  v_now := array(select l.i from (select v_t as i union select issuer_id from public.issuers where merged_into = v_t) l order by l.i);
+  if v_now <> v_lineage then raise exception 'lineage_changed' using errcode = 'P0001'; end if;
+  select * into q from public.dq_quarantine where id = p_item for update;
+  if q.status <> 'open' then raise exception 'item_not_open' using errcode = 'P0001'; end if;
+  v_ids := public.fact_item_members(q.payload);
+  if p_keep is null or not (p_keep = any(v_ids)) then raise exception 'invalid_choice' using errcode = '22023'; end if;
+  if exists (select 1 from public.financial_facts f where f.fact_id = any(v_ids) and not (f.issuer_id = any(v_lineage))) then
+    raise exception 'lineage_changed' using errcode = 'P0001';
+  end if;
+  with hit as (
+    update public.financial_facts f set status = 'quarantined'
+    from public.filings g
+    where g.filing_id = f.filing_id and g.mapping_gen = f.mapping_gen
+      and f.issuer_id = any(v_lineage) and f.market = v_market and f.status = 'ok' and f.fact_id <> p_keep
+      and f.concept = v_concept and f.period_start is not distinct from v_ps and f.period_end = v_pe
+      and f.consolidation = v_cons and f.unit = v_unit and f.available_date = v_date
+    returning f.fact_id)
+  select coalesce(array_agg(hit.fact_id order by hit.fact_id), '{}'::uuid[]) into v_q from hit;
+  select count(*) into v_ok
+  from public.financial_facts f join public.filings g on g.filing_id = f.filing_id and g.mapping_gen = f.mapping_gen
+  where f.issuer_id = any(v_lineage) and f.market = v_market and f.status = 'ok'
+    and f.concept = v_concept and f.period_start is not distinct from v_ps and f.period_end = v_pe
+    and f.consolidation = v_cons and f.unit = v_unit and f.available_date = v_date;
+  if v_ok <> 1 then raise exception 'unresolved' using errcode = 'P0001'; end if;
+  update public.dq_quarantine
+  set status = 'resolved_accept', resolved_by = p_resolved_by, resolved_at = now(),
+      detail = detail || jsonb_build_object('chosen_fact_ids', jsonb_build_array(p_keep), 'quarantined_fact_ids', to_jsonb(v_q), 'issuer_id', v_t,
+                                            'market', v_market, 'batch_id', p_batch, 'hook', jsonb_build_object('stage', 'materialize', 'state', 'pending', 'at', to_jsonb(now())))
+  where id = p_item;
+  update public.fact_sync_scope set state_rev = state_rev + 1, updated_at = now() where issuer_id = any(v_lineage) and market = v_market;
+  return jsonb_build_object('quarantined', cardinality(v_q));
+end $$;
+revoke execute on function public.resolve_lineage_conflict(uuid, uuid, uuid, uuid) from public, anon, authenticated;
+grant execute on function public.resolve_lineage_conflict(uuid, uuid, uuid, uuid) to service_role;

exec
/bin/zsh -lc 'git diff b4ea9a0''^ b4ea9a0 -- supabase/migrations/20261107091000_facts_extensions.sql | head -100; rg -n '"'fact_can_promote|fact_promote_rows|resolve_facts_quarantine|merge_issuers' supabase/migrations; find . -iname '*agents*' -o -name CLAUDE.md; cat .claude/CLAUDE.md 2>/dev/null" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 60ms:
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-AB6ueXKW' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-X55VtPzR' (errno=Operation not permitted)
diff --git a/supabase/migrations/20261107091000_facts_extensions.sql b/supabase/migrations/20261107091000_facts_extensions.sql
index 8dfaa97..863e4ca 100644
--- a/supabase/migrations/20261107091000_facts_extensions.sql
+++ b/supabase/migrations/20261107091000_facts_extensions.sql
@@ -406,3 +406,301 @@ begin
 end $$;
 revoke execute on function public.set_dissolved(uuid, uuid) from public, anon, authenticated;
 grant execute on function public.set_dissolved(uuid, uuid) to service_role;
+
+-- ---------------------------------------------------------------- 7. promotion eligibility (spec §3.2, T6)
+-- The plan-2 helper with every landed predicate kept verbatim, plus two: (a) a RESOLVED
+-- lineage_conflict binds its members — payload.fact_ids and the rows it quarantined
+-- (detail.quarantined_fact_ids) — to detail.chosen_fact_ids; (b) a reconcile_mismatch that
+-- references the row blocks unless it is resolved_accept with latest_result.passed = true (open,
+-- rejected, or accepted without a passing latest result all block; restoring goes through
+-- restore_reconciled). Callers hold the scope lock (promote_quarantined, resolve_facts_quarantine,
+-- restore_reconciled).
+create or replace function public.fact_promote_rows(p_issuer uuid, p_market text, p_fact_ids uuid[])
+returns int language plpgsql security definer set search_path = public as $$
+declare n int;
+begin
+  update public.financial_facts f set status = 'ok'
+  from public.fact_sync_runs r, public.filings g
+  where f.fact_id = any(p_fact_ids) and f.issuer_id = p_issuer and f.market = p_market and f.status = 'quarantined'
+    and r.run_id = f.run_id and r.status = 'published'
+    and g.filing_id = f.filing_id and g.mapping_gen = f.mapping_gen
+    and not exists (
+      select 1 from public.dq_quarantine q
+      where q.table_name = 'financial_facts' and q.status = 'open'
+        and jsonb_typeof(q.payload -> 'fact_ids') = 'array' and q.payload -> 'fact_ids' ? f.fact_id::text)
+    and not exists (
+      select 1 from public.dq_quarantine q
+      where q.table_name = 'financial_facts' and q.reason_code = 'same_day_conflict' and q.status = 'open'
+        and q.payload -> 'key' ->> 'issuer_id' = f.issuer_id::text and q.payload -> 'key' ->> 'market' = f.market
+        and q.payload -> 'key' ->> 'concept' = f.concept
+        and f.period_start is not distinct from nullif(q.payload -> 'key' ->> 'period_start', '')::date
+        and (q.payload -> 'key' ->> 'period_end')::date = f.period_end
+        and q.payload -> 'key' ->> 'consolidation' = f.consolidation and q.payload -> 'key' ->> 'unit' = f.unit
+        and (q.payload -> 'key' ->> 'available_date')::date = f.available_date)
+    and not exists (
+      select 1 from public.dq_quarantine q
+      where q.table_name = 'financial_facts' and q.reason_code = 'same_day_conflict' and q.status <> 'open'
+        and jsonb_typeof(q.payload -> 'fact_ids') = 'array' and q.payload -> 'fact_ids' ? f.fact_id::text
+        and not (coalesce(q.detail -> 'chosen_fact_ids', '[]'::jsonb) ? f.fact_id::text))
+    and not exists (
+      select 1 from public.dq_quarantine q
+      where q.table_name = 'financial_facts' and q.reason_code = 'lineage_conflict' and q.status <> 'open'
+        and ((jsonb_typeof(q.payload -> 'fact_ids') = 'array' and q.payload -> 'fact_ids' ? f.fact_id::text)
+             or (jsonb_typeof(q.detail -> 'quarantined_fact_ids') = 'array' and q.detail -> 'quarantined_fact_ids' ? f.fact_id::text))
+        and not (coalesce(q.detail -> 'chosen_fact_ids', '[]'::jsonb) ? f.fact_id::text))
+    and not exists (
+      select 1 from public.dq_quarantine q
+      where q.table_name = 'financial_facts' and q.reason_code = 'reconcile_mismatch'
+        and jsonb_typeof(q.payload -> 'fact_ids') = 'array' and q.payload -> 'fact_ids' ? f.fact_id::text
+        and (q.status <> 'resolved_accept' or (q.detail -> 'latest_result' -> 'passed') is distinct from 'true'::jsonb));
+  get diagnostics n = row_count;
+  return n;
+end $$;
+revoke execute on function public.fact_promote_rows(uuid, text, uuid[]) from public, anon, authenticated, service_role;
+
+-- ---------------------------------------------------------------- 8. adopt a quarantined candidate (spec §3.2 adopt_candidate, §4.6, T1, T5, U3)
+-- The item is an open ambiguous_value of facts.us / facts.cn; the persisted candidate is the plan-2
+-- FactCandidate (camelCase) and is mapped field by field (anything missing or ill-typed →
+-- invalid_candidate). The filing comes from (source by market, source_ref = filingRef) and gives
+-- issuer, market and available_date (the payload is not trusted). The generation is the anchor
+-- run's (payload.run_id) and must equal the natural key's last segment and filings.mapping_gen
+-- (> 0), else generation_moved. mapping_version = the one distinct value retained by the anchor
+-- run's rows (none → by the same filing and generation); zero or several → replay_required (the
+-- current default is never used). The batch must be running for the item's dataset. Under the
+-- filing's scope lock: state_rev = p_expected_rev (stale_evaluation); the full plan-2 candidate key
+-- (K + filing + generation) in any status → duplicate (an old generation alone is no duplicate);
+-- a visible ok row of (K, available_date) with another value OR an open same_day_conflict /
+-- lineage_conflict on it → conflict_exists. Then one transaction: a management run (published, no
+-- manifest, activates nothing), the fact staged → ok, the item resolved with
+-- chosen_candidate_index / adopted_fact_id / run_id / issuer_id / market / batch_id and
+-- hook = pending, state_rev + 1.
+create or replace function public.adopt_candidate(p_item uuid, p_index int, p_batch uuid, p_expected_rev bigint, p_resolved_by uuid)
+returns jsonb language plpgsql security definer set search_path = public as $$
+declare q public.dq_quarantine; c jsonb; g public.filings; r public.fact_sync_runs; b public.ingest_batches;
+        v_source text; v_market text; v_gen int; v_nk_gen int; v_versions text[]; v_rev bigint;
+        v_ps date; v_pe date; v_value numeric; v_run uuid := gen_random_uuid(); v_fact uuid := gen_random_uuid(); v_t uuid; v_k text;
+begin
+  if p_resolved_by is null then raise exception 'invalid_resolver' using errcode = '22023'; end if;
+  select * into q from public.dq_quarantine where id = p_item;
+  if not found or q.status <> 'open' then raise exception 'item_not_open' using errcode = 'P0001'; end if;
+  if q.table_name <> 'financial_facts' or q.reason_code <> 'ambiguous_value' or q.dataset not in ('facts.us','facts.cn') then
+    raise exception 'invalid_choice' using errcode = '22023';
+  end if;
+  if coalesce(jsonb_typeof(q.payload -> 'candidates'), '') <> 'array' or p_index is null or p_index < 0 or p_index >= jsonb_array_length(q.payload -> 'candidates') then
+    raise exception 'invalid_choice' using errcode = '22023';
+  end if;
+  c := q.payload -> 'candidates' -> p_index;
+  if jsonb_typeof(c) <> 'object'
+     or coalesce(jsonb_typeof(c -> 'concept'), '') <> 'string' or coalesce(jsonb_typeof(c -> 'sourceConcept'), '') <> 'string'
+     or coalesce(jsonb_typeof(c -> 'unit'), '') <> 'string' or coalesce(jsonb_typeof(c -> 'filingRef'), '') <> 'string'
+     or coalesce(jsonb_typeof(c -> 'rawHash'), '') <> 'string' or coalesce(jsonb_typeof(c -> 'value'), '') <> 'string'
+     or coalesce(jsonb_typeof(c -> 'periodEnd'), '') <> 'string' or coalesce(jsonb_typeof(c -> 'periodStart'), 'missing') not in ('null', 'string')
+     or coalesce(c ->> 'statement', '') not in ('IS','BS','CF','DEI')
+     or coalesce(c ->> 'duration', '') not in ('3M','6M','9M','12M','INSTANT')
+     or coalesce(c ->> 'consolidation', '') not in ('consolidated','parent') then
supabase/migrations/20261107091000_facts_extensions.sql:18:--  (8b) fact_promote_rows predicates; adopt_candidate; restore_reconciled; resolve_lineage_conflict.
supabase/migrations/20261107091000_facts_extensions.sql:416:-- restore_reconciled). Callers hold the scope lock (promote_quarantined, resolve_facts_quarantine,
supabase/migrations/20261107091000_facts_extensions.sql:418:create or replace function public.fact_promote_rows(p_issuer uuid, p_market text, p_fact_ids uuid[])
supabase/migrations/20261107091000_facts_extensions.sql:459:revoke execute on function public.fact_promote_rows(uuid, text, uuid[]) from public, anon, authenticated, service_role;
supabase/migrations/20261107091000_facts_extensions.sql:591:-- through fact_promote_rows; state_rev + 1; hook = pending. skipped lists every member not
supabase/migrations/20261107091000_facts_extensions.sql:625:    v_promoted := public.fact_promote_rows(v_issuer, v_market, v_ids);
supabase/migrations/20261106090000_financial_facts.sql:283:create or replace function public.fact_promote_rows(p_issuer uuid, p_market text, p_fact_ids uuid[])
supabase/migrations/20261106090000_financial_facts.sql:313:revoke execute on function public.fact_promote_rows(uuid, text, uuid[]) from public, anon, authenticated, service_role;
supabase/migrations/20261106090000_financial_facts.sql:544:-- Admin hook (§7.3): holds the scope lock, promotes eligible rows (fact_promote_rows), state_rev + 1
supabase/migrations/20261106090000_financial_facts.sql:551:  n := public.fact_promote_rows(p_issuer, p_market, coalesce(p_fact_ids, '{}'::uuid[]));
supabase/migrations/20261106090000_financial_facts.sql:572:create or replace function public.resolve_facts_quarantine(p_item uuid, p_chosen uuid[], p_resolved_by uuid)
supabase/migrations/20261106090000_financial_facts.sql:616:    v_promoted := public.fact_promote_rows(v_issuer, v_market, v_chosen);
supabase/migrations/20261106090000_financial_facts.sql:621:revoke execute on function public.resolve_facts_quarantine(uuid, uuid[], uuid) from public, anon, authenticated;
supabase/migrations/20261106090000_financial_facts.sql:622:grant execute on function public.resolve_facts_quarantine(uuid, uuid[], uuid) to service_role;
./node_modules/dsh-trade-strategy-evaluator/agents
./node_modules/playwright/lib/agents
./node_modules/playwright/lib/agents/generateAgents.js
./node_modules/caniuse-lite/dist/unpacker/agents.js
./node_modules/caniuse-lite/data/agents.js
./.claude/agents

exec
/bin/zsh -lc "sed -n '560,625p' supabase/migrations/20261106090000_financial_facts.sql; sed -n '1,130p' supabase/migrations/20261107091000_facts_extensions.sql; rg -n 'reconcile_mismatch|adopt_candidate|restore_reconciled' docs/spec* docs -g '*.md' | head -50; sed -n '280,390p' supabase/migrations/20261107091000_facts_extensions.sql" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
-- Admin hook (§4.5, §7.3; audits R6-1, R7-1; round-1 #2, #10). Lock order: scope row (derived
-- from a provisional read of the member rows, else from payload.run_id) then the item row — the
-- same order quarantine_facts uses. Under the lock the item is re-read and the member set is
-- REBUILT, so a quarantine_facts merge that committed while this call waited is validated too.
-- Any member row whose run is still staged, or an anchor run (payload.run_id) that is still
-- staged — the only run bookkeeping an item without fact rows has — → run_pending (item stays
-- open). Otherwise, in one transaction: item → resolved_accept with detail.chosen_fact_ids (the
-- verdict for same_day_conflict — must be a subset of payload.fact_ids — or all member ids
-- otherwise), promotion by the eligibility rules (the item itself is closed by then, so it no
-- longer blocks its members), state_rev + 1. For fact-row reasons the same update writes
-- detail.hook = {stage:'materialize', state:'pending', at} so an unfinished materialize is durable.
-- Returns {promoted, skipped, chosen_fact_ids} (the committed verdict, from the rebuilt member set).
create or replace function public.resolve_facts_quarantine(p_item uuid, p_chosen uuid[], p_resolved_by uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare q public.dq_quarantine; v_ids uuid[]; v_issuer uuid; v_market text; v_chosen uuid[]; v_promoted int := 0; v_run uuid;
begin
  if p_resolved_by is null then raise exception 'invalid_resolver' using errcode = '22023'; end if;
  select * into q from public.dq_quarantine where id = p_item;
  if not found or q.status <> 'open' or q.table_name <> 'financial_facts' then raise exception 'item_not_open' using errcode = 'P0001'; end if;
  -- 1. provisional member read, only to locate the scope row to lock
  v_ids := public.fact_item_members(q.payload);
  select f.issuer_id, f.market into v_issuer, v_market from public.financial_facts f where f.fact_id = any(v_ids) limit 1;
  if v_issuer is null then
    select r.issuer_id, r.market into v_issuer, v_market from public.fact_sync_runs r where r.run_id = (q.payload ->> 'run_id')::uuid;
  end if;
  if v_issuer is not null then
    perform 1 from public.fact_sync_scope where issuer_id = v_issuer and market = v_market for update;
  end if;
  -- 2. re-read and rebuild the member set under the lock (a concurrent merge is now visible)
  select * into q from public.dq_quarantine where id = p_item for update;
  if not found or q.status <> 'open' then raise exception 'item_not_open' using errcode = 'P0001'; end if;
  v_ids := public.fact_item_members(q.payload);
  -- 3. every member run, and the anchor run, must have left the staged state
  if exists (select 1 from public.financial_facts f join public.fact_sync_runs r on r.run_id = f.run_id where f.fact_id = any(v_ids) and r.status = 'staged') then
    raise exception 'run_pending' using errcode = 'P0001';
  end if;
  v_run := (q.payload ->> 'run_id')::uuid;
  if v_run is not null and exists (select 1 from public.fact_sync_runs r where r.run_id = v_run and r.status = 'staged') then
    raise exception 'run_pending' using errcode = 'P0001';
  end if;
  if q.reason_code = 'same_day_conflict' then
    v_chosen := coalesce(p_chosen, '{}'::uuid[]);
    if not (v_chosen <@ v_ids) then raise exception 'invalid_chosen' using errcode = '22023'; end if;
    -- spec 7.3: the chosen rows (those still existing) must all carry the same numeric value
    if (select count(distinct f.value) from public.financial_facts f where f.fact_id = any(v_chosen)) > 1 then raise exception 'invalid_chosen' using errcode = '22023'; end if;
  else
    v_chosen := v_ids;
  end if;
  update public.dq_quarantine
  set status = 'resolved_accept', resolved_by = p_resolved_by, resolved_at = now(),
      detail = detail || jsonb_build_object('chosen_fact_ids', to_jsonb(v_chosen))
        || case when q.reason_code in ('same_day_conflict', 'identity_bs', 'identity_gp')
                then jsonb_build_object('hook', jsonb_build_object('stage', 'materialize', 'state', 'pending', 'at', to_jsonb(now())))
                else '{}'::jsonb end
  where id = p_item;
  if v_issuer is not null then
    v_promoted := public.fact_promote_rows(v_issuer, v_market, v_chosen);
    update public.fact_sync_scope set state_rev = state_rev + 1, updated_at = now() where issuer_id = v_issuer and market = v_market;
  end if;
  return jsonb_build_object('promoted', v_promoted, 'skipped', cardinality(v_chosen) - v_promoted, 'chosen_fact_ids', to_jsonb(v_chosen));
end $$;
revoke execute on function public.resolve_facts_quarantine(uuid, uuid[], uuid) from public, anon, authenticated;
grant execute on function public.resolve_facts_quarantine(uuid, uuid[], uuid) to service_role;

-- Holds the scope lock; state_rev must equal p_based_on_rev (no scope row ⇒ 0) else
-- stale_computation; replaces every metric row of the issuer+market. Rows: MetricRow objects
-- supabase/migrations/20261107091000_facts_extensions.sql
-- F3-4 (data foundation plan 3 spec §3.2, §4.4–§4.6, §5.5–§5.6): extensions of the plan-2 facts
-- layer (20261106090000; that file is locked and is never edited).
--  1. filings.accepted_at / acceptance_source: set once (null → value) and only by
--     set_filing_acceptance (transaction-local facts.allow_acceptance_write); no role has a column
--     grant; the plan-2 link columns and the function-only, increase-only mapping_gen are kept (T11).
--  2. financial_metrics.based_on_lineage: added and backfilled ONCE (guarded block); never empty.
--  3. replace_financial_metrics_lineage: locks every member scope row in (issuer_id, market) order,
--     re-reads the lineage under the locks, compares the set and every state_rev; the plan-2
--     replace_financial_metrics is a wrapper (signature unchanged).
--  4. read_filing_facts: evidence reader, every generation and status of one filing (+ run status).
--  5. read_facts_lineage: read_facts over a set of issuers; with more than one member, ok rows of
--     the same (K, available_date) from different issuers with different values leave the current
--     value and are listed in conflicts. read_facts is now a wrapper over it (identical output).
--  6. set_merge / set_dissolved: the only topology writers. They switch the transaction-local
--     entities.allow_topology_write that the migration-one trigger issuers_topology_guard requires,
--     and restore the previous value on every path (normal return and exception handler, S1).
--  (8b) fact_promote_rows predicates; adopt_candidate; restore_reconciled; resolve_lineage_conflict.
--  (8c) reconcile cursor claim/complete/fail and apply_reconcile_result.
-- Lock order everywhere: reconcile cursor row (fenced calls) → fact_sync_scope rows ordered by
-- (issuer_id, market) → issuers rows → dq_quarantine rows → fact rows → dq_reconcile_cycles row (last).
-- Errors carry the code as the message: verdict / fence codes P0001; invalid_* 22023; triggers 23514.
-- The hosted postgres role is not a superuser: functions keep the migration role as owner, set
-- search_path = public and qualify every relation. Every function is followed by an explicit
-- revoke (Supabase grants EXECUTE on new functions to anon/authenticated by default) and the grant
-- it needs. Replayable: guarded add-column/backfill and constraints, create or replace.

-- ---------------------------------------------------------------- 1. filings acceptance (spec §4.5, T11)
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'filings' and column_name = 'accepted_at') then
    alter table public.filings add column accepted_at timestamptz, add column acceptance_source text;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.filings'::regclass and conname = 'filings_acceptance_source_check') then
    alter table public.filings add constraint filings_acceptance_source_check check (acceptance_source is null or acceptance_source in ('sec_submissions'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.filings'::regclass and conname = 'filings_acceptance_pair') then
    alter table public.filings add constraint filings_acceptance_pair check ((accepted_at is null) = (acceptance_source is null));
  end if;
end $$;

-- Same rules as plan 2 (document_ref/document_url/link_attempts/mapping_gen mutable, mapping_gen
-- never decreases, delete only under facts.allow_filing_delete) plus: accepted_at/acceptance_source
-- go null → value once, and only while set_filing_acceptance has facts.allow_acceptance_write on.
create or replace function public.filings_limited_update() returns trigger
language plpgsql set search_path = public as $$
declare v_mutable text[] := array['document_ref','document_url','link_attempts','mapping_gen','accepted_at','acceptance_source'];
begin
  if tg_op = 'DELETE' then
    if current_setting('facts.allow_filing_delete', true) is distinct from 'on' then
      raise exception 'append_only: filings are never deleted (begin_sync_run prunes empty gen-0 filings of abandoned runs)' using errcode = '23514';
    end if;
    return old;
  end if;
  if (to_jsonb(new) - v_mutable) <> (to_jsonb(old) - v_mutable) then
    raise exception 'append_only: filings allow document_ref, document_url, link_attempts, mapping_gen, accepted_at and acceptance_source changes only' using errcode = '23514';
  end if;
  if new.mapping_gen < old.mapping_gen then
    raise exception 'append_only: filings.mapping_gen may only increase (% -> %)', old.mapping_gen, new.mapping_gen using errcode = '23514';
  end if;
  if (new.accepted_at, new.acceptance_source) is distinct from (old.accepted_at, old.acceptance_source) then
    if old.accepted_at is not null or old.acceptance_source is not null then
      raise exception 'append_only: filings.accepted_at is set once (null -> value)' using errcode = '23514';
    end if;
    if current_setting('facts.allow_acceptance_write', true) is distinct from 'on' then
      raise exception 'append_only: filings.accepted_at is written only by set_filing_acceptance' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

-- accepted_at is null → write, true; the same value and source → false; another value → acceptance_conflict.
create or replace function public.set_filing_acceptance(p_filing uuid, p_accepted timestamptz, p_source text)
returns boolean language plpgsql security definer set search_path = public as $$
declare g public.filings;
begin
  if p_accepted is null or p_source is distinct from 'sec_submissions' then raise exception 'invalid_acceptance' using errcode = '22023'; end if;
  select * into g from public.filings where filing_id = p_filing for update;
  if not found then raise exception 'filing_not_found' using errcode = 'P0001'; end if;
  if g.source <> 'edgar' then raise exception 'invalid_acceptance' using errcode = '22023'; end if;
  if g.accepted_at is null then
    perform set_config('facts.allow_acceptance_write', 'on', true);
    update public.filings set accepted_at = p_accepted, acceptance_source = p_source where filing_id = p_filing;
    perform set_config('facts.allow_acceptance_write', 'off', true);
    return true;
  end if;
  if g.accepted_at = p_accepted and g.acceptance_source = p_source then return false; end if;
  raise exception 'acceptance_conflict' using errcode = 'P0001';
end $$;
revoke execute on function public.set_filing_acceptance(uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public.set_filing_acceptance(uuid, timestamptz, text) to service_role;

-- ---------------------------------------------------------------- 2. financial_metrics.based_on_lineage (spec §3.2)
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'financial_metrics' and column_name = 'based_on_lineage') then
    alter table public.financial_metrics add column based_on_lineage jsonb not null default '[]';
    update public.financial_metrics set based_on_lineage = jsonb_build_array(jsonb_build_object('issuer_id', issuer_id, 'state_rev', based_on_rev));
    alter table public.financial_metrics add constraint financial_metrics_lineage_nonempty
      check (jsonb_typeof(based_on_lineage) = 'array' and jsonb_array_length(based_on_lineage) >= 1);
  end if;
end $$;

-- ---------------------------------------------------------------- 3. lineage materialisation (spec §3.2, §4.4)
-- p_based_on = [{issuer_id, state_rev}]: issuer ids unique and containing p_issuer. Every member's
-- scope row is locked in (issuer_id, market) order (a missing one → scope_missing); under the
-- locks the lineage {p_issuer} ∪ {merged_into = p_issuer} must equal the member set and every
-- state_rev must match, else stale_computation. Stored vector: issuer_id ascending.
create or replace function public.replace_financial_metrics_lineage(p_issuer uuid, p_market text, p_based_on jsonb, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare v_members uuid[]; v_norm jsonb; v_locked int; v_lineage uuid[]; v_rev bigint; n int;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_rows' using errcode = '22023'; end if;
  if p_issuer is null or p_market is null or p_market not in ('US','CN') then raise exception 'invalid_based_on' using errcode = '22023'; end if;
  if p_based_on is null or jsonb_typeof(p_based_on) <> 'array' or jsonb_array_length(p_based_on) = 0
     or exists (select 1 from jsonb_array_elements(p_based_on) e
                where jsonb_typeof(e) <> 'object'
                   or coalesce(jsonb_typeof(e -> 'issuer_id'), '') <> 'string'
                   or coalesce(jsonb_typeof(e -> 'state_rev'), '') <> 'number'
                   or (e ->> 'issuer_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                   or (e ->> 'state_rev') !~ '^[0-9]+$') then
    raise exception 'invalid_based_on' using errcode = '22023';
  end if;
  select array_agg((e ->> 'issuer_id')::uuid order by (e ->> 'issuer_id')::uuid),
         jsonb_agg(jsonb_build_object('issuer_id', (e ->> 'issuer_id')::uuid, 'state_rev', (e ->> 'state_rev')::bigint) order by (e ->> 'issuer_id')::uuid)
    into v_members, v_norm
  from jsonb_array_elements(p_based_on) e;
  if cardinality(v_members) <> (select count(distinct m) from unnest(v_members) m) or not (p_issuer = any(v_members)) then
    raise exception 'invalid_based_on' using errcode = '22023';
  end if;
  select count(*) into v_locked from (
    select 1 from public.fact_sync_scope s where s.issuer_id = any(v_members) and s.market = p_market order by s.issuer_id for update) x;
zsh:1: no matches found: docs/spec*
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

exec
/bin/zsh -lc "rg -n 'adopt_candidate|restore_reconciled|U3|T6' docs --glob '*.md' | head -70; rg -n 'naturalKey|natural_key|ambiguous_value' src/lib/facts | head -40; sed -n '1,110p' supabase/migrations/20261106090000_financial_facts.sql; nl -ba supabase/migrations/20261107091000_facts_extensions.sql | sed -n '530,560p'" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
docs/research-os/2026-07-04-phase1-skeleton.md:70:### T6: Research 壳层
docs/research-os/2026-07-06-ic-memo-deal-variant-plan.md:82:### T6: 终审 + 合并（coordinator）
docs/superpowers/specs/2026-11-04-industry-research-design.md:3:日期：2026-11-04（第 5 稿。审计轨迹 `docs/audits/2026-11-04-industry-research/`：01 Codex 一轮（13 项）、02 Codex 二轮（R1–R13 复核 + N1–N6）、03 处置表（含三、四轮）、05 Codex 三轮（T1–T6 + 复核）、06 Codex 四轮（第 4 稿新引入缺陷 U1–U6 + 终审"not ready"）。第 5 稿按 Codex 四轮处方逐字实施 U1–U6，**未再审**（协调者指示：不再开 Codex 轮次））
docs/superpowers/specs/2026-11-04-industry-research-design.md:127:industry_fetch_events                             -- 一次持久化的抓取（U3 处方：观测身份键）
docs/superpowers/specs/2026-11-04-industry-research-design.md:253:| `apply_observations(p_kind text, p_fetch_event uuid, p_rows jsonb) returns jsonb` | service_role | §6.1 / §6.2：标记与官方值的唯一写入路径（U2/U3） |
docs/superpowers/specs/2026-11-04-industry-research-design.md:339:  applyObservations(kind, fetchEventId, rows): Promise<{inserted, duplicates, superseded}>;   // rpc apply_observations（U2/U3）
docs/superpowers/specs/2026-11-04-industry-research-design.md:434:- 适配器 `providers/tushare-marks.ts`：每次运行先 `beginFetchEvent('marks', {trade_date: D}, batch)` 得到 `fetch_event_id`（同一次抓取的重试复用该 id）；`daily_basic(trade_date=D)` 全市场，`has_more` 翻页；`total_share` 万股 × 10000（`transform='wan_to_unit'`）；行经 `apply_observations('marks', fetch_event_id, rows)` 写入。函数对每行（U2/U3 处方）：
docs/superpowers/specs/2026-11-04-SPEC-INDEX.md:9:| 数据底座三（F1b 标识符 + F5 对账与日历新鲜度） | `2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md` | 6 | 第五轮（增量 + 落地代码核对）T1–T15、第六轮确认 U1–U3 均按规定修法落实 | `2026-11-04-data-foundation-3/`（01–07 + 03 处置） | 计划三编写与执行中（`docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md`） |
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:240:**资格谓词加在共享助手 `fact_promote_rows(uuid,text,uuid[])`**（T6 规定修法；`create or replace`，保留落地的全部谓词与其 `revoke execute … from public, anon, authenticated, service_role`）：若该行曾属于某个已处理的 `lineage_conflict` 项，则必须在该项 `detail.chosen_fact_ids` 内；若该行有 open 的、或已处理但 `(detail->'latest_result'->>'passed')::boolean IS DISTINCT FROM true` 的 `reconcile_mismatch` 项引用，则不提升（恢复只能经 `restore_reconciled`；缺 `latest_result` 视为未通过）。`promote_quarantined` 保持为加锁/递增 rev 的包装；`resolve_facts_quarantine`、`restore_reconciled` 都经该助手提升。集成测试覆盖每个提升入口（`promote_quarantined`、`resolve_facts_quarantine`、`restore_reconciled`）。
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:248:| `restore_reconciled(p_item uuid, p_batch uuid, p_inputs_hash_now text, p_resolved_by uuid) returns jsonb` | 持锁；项必须 `open`、`reason_code='reconcile_mismatch'`；要求 `detail.latest_result.passed = true` 且 `detail.latest_result.inputs_hash = p_inputs_hash_now`（**由路由在请求时**从当前输入计算：左侧 `raw_hash` ‖ 右侧文档 sha256 ‖ 当前黄金文件/样本清单 sha256 ‖ 解析器版本；运行器写 `latest_result.inputs_hash` 时用同一函数；因此任何输入在最近一次通过之后的变化都会使二者不等）；不满足 → `raise 'not_passing'`。满足则**先**把本项置 `resolved_accept`（`resolved_by/at`，`detail.restored_by_batch`），**再**按 `promote_quarantined` 的资格规则（含本规格附加条款——此时本项已关闭，不再阻塞自己；其他 open 的 `reconcile_mismatch`/争议项仍阻塞）提升 `payload.fact_ids`；`state_rev + 1`；返回 `{promoted, skipped:[{fact_id, reason}]}`。顺序与规格二 `resolve_facts_quarantine` 一致（先关项后提升） |
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:249:| `read_filing_facts(p_filing uuid, p_include_non_ok boolean) returns jsonb` | **证据读取器**：返回该 filing 下**全部映射代、全部状态**（`p_include_non_ok=false` 时只 `ok`）的事实行（`financial_facts` 列 + `status`、`mapping_gen`、`run_id`、所属运行 `status`），不做窗口计算；`security definer`，仅 service_role。**绑定规则（S2 规定修法）**：常规对账把自然键绑定到该 filing **激活映射代**（`mapping_gen = filings.mapping_gen`）且所属运行 `published` 的行，状态 `ok` 或 `quarantined` 皆可；**先过滤**到激活代与已发布运行、**再**判断基数：过滤后多于一行 → 结果 `left_ambiguous`，不比较；仅旧代存在同键既不构成歧义也不参与绑定；显式复查（已隔离项的重跑）绑定到项的 `payload.fact_ids`，不论代，绝不换成别的行；`adopt_candidate` 的重复检查用规格二完整候选键（K + `filing_id` + `mapping_gen`），跨全部状态，仅旧代存在同键不构成重复（T1） |
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:250:| `adopt_candidate(p_item uuid, p_index int, p_batch uuid, p_expected_rev bigint, p_resolved_by uuid) returns jsonb` | **候选适配（T5 规定修法）**：项 `open` 且 `reason_code='ambiguous_value'`，`dataset ∈ {'facts.us','facts.cn'}`（T4，落地小写）；`p_index` 越界 → `invalid_choice`。持久化候选是计划二 `FactCandidate`（`concept, sourceConcept, statement, periodStart, periodEnd, duration, value, unit, consolidation, filingRef, rawHash`），函数显式映射到插入字段：`source_concept←sourceConcept`、`period_start←periodStart`、`period_end←periodEnd`、`raw_hash←rawHash`；任一字段缺失或类型不对 → `invalid_candidate`。**filing**：`source` 由项的市场决定（`facts.us → edgar`、`facts.cn → tushare`），`filings(source, source_ref=filingRef)` 唯一定位，不存在 → `filing_not_found`；发行人与市场**取自该 filing 行**（不信任 payload）。**代**：取自项的锚定运行 `payload.run_id` 的 `fact_sync_runs.mapping_gen`，并须等于 `natural_key` 末段的代与 `filings.mapping_gen`（且 `> 0`），否则 `generation_moved`。**映射版本**：取该锚定运行（无则同 filing 同代）的事实行留存的 `mapping_version`，恰一个不同值才用；零个或多个 → `replay_required`（409，需重放原始快照，绝不取当前默认值）。`p_batch` 必须存在、`status='running'`、`dataset = 项.dataset`（否则 `batch_mismatch`）；持该 (filing.issuer_id, filing.market) 的 scope 行锁；`state_rev <> p_expected_rev` → `stale_evaluation`。**重复（T1）**：规格二完整候选键（K + `filing_id` + `mapping_gen`）在任何状态下已存在 → `duplicate`；仅旧代存在同键**不**构成重复。在 scope 锁下检查，**任一**成立即 `conflict_exists`（U3）：同 K 同日存在值不同的 `ok` 行；**或**存在适用的 open 争议项（同 K 同日的 `same_day_conflict`/`lineage_conflict`）。测试：有 open 争议、无剩余 `ok` 竞争者时采用被拒。同一事务：生成 `run_id` 与 `fact_id`；插入 `fact_sync_runs(run_id, issuer_id=filing.issuer_id, market=filing.market, batch_id=p_batch, mapping_gen=该代, status='published', manifest='[]', started_at=now(), published_at=now())`（管理运行：不激活映射代，不改 `filings.mapping_gen`）；插入事实（`issuer_id`、`market`、`filing_id`、`available_date = filing.available_date`、`mapping_gen`、核实的 `mapping_version`）`staged` 再 `→ok`；项 `resolved_accept`、`resolved_by/at`、`detail.chosen_candidate_index/adopted_fact_id/run_id/issuer_id/market`、`detail.hook={stage:'materialize', state:'pending', at}`；`state_rev + 1`；返回 `{fact_id, run_id, issuer_id, market}` |
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:380:规格二 §7.3 规定 `facts.*` 项的接受全部经 `resolve_facts_quarantine`。**落地的分派点是 `src/lib/dq/facts-resolver.ts::resolveFactsItem`（由 `/api/admin/dq/quarantine/[id]` 调用），本规格扩展它（T10 规定修法）**，接受分支：`ambiguous_value` 带 `chosen_candidate_index` → `adopt_candidate`；`reconcile_mismatch` → `restore_reconciled`；`lineage_conflict` 带 `keep_fact_id` → `resolve_lineage_conflict`；`reconcile_review` → 计划一通用的守卫状态翻转（接受与拒绝都只改状态，不提升、不物化）；其余 `facts.*` 原因 → 落地路径（`resolve_facts_quarantine`）。拒绝分支保持落地的通用翻转（行保持 `quarantined`）。保留落地语义：持久化的 `chosen_fact_ids`、持久化的裁决人归属（`recovered`）、失败重试的 HTTP 502。**每个新的可见性变化裁决**（`adopt_candidate`、`restore_reconciled`、`resolve_lineage_conflict`）都在其 SQL 函数的同一事务内写 `detail.hook={stage:'materialize', state:'pending', at}` 与物化目标（`detail.issuer_id/market`）；恢复按持久化的目标与裁决处理缺失/pending/failed 钩子（`FACT_ROW_REASONS` 扩展为包含这三个原因的恢复判定）。新增 `scripts/facts/materialize.ts --pending-hooks`（落地脚本目前没有该参数）：扫描 (a) 全部 `facts.*` **已处理**项中 `hook.state ∈ {pending, failed}` 或缺失钩子的可见性裁决（采用、恢复、谱系），以及 (b) **open** 的 `reconcile_mismatch` 项中 `hook.state ∈ {pending, failed}` 者（对账隔离，项在人工处理前一直 open）；按项上持久化的 `detail.issuer_id/market` 取发行人，恢复时按当前拓扑重新求物化目标 `T(i)`（U2）。测试：`apply_reconcile_result` 提交后立即崩溃、项仍 open → 扫描完成物化。分派表与其测试必须穷举以上分支。
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:463:- 恢复：每轮对已隔离事实写 `detail.latest_result={passed, reconciliation_id, at, inputs_hash}`（`inputs_hash = computeInputsHash({left_raw_hash, right_sha256, gold_or_sample_sha256, parser_version})`，纯函数 `src/lib/dq/reconcile/inputs-hash.ts`）。管理员 `resolved_accept` → 路由用同一函数从**当前**输入算 `inputs_hash_now`（左侧 `raw_hash` 来自 `factsByIds`，右侧 sha256 来自桶 `meta.json`，黄金/样本文件 sha256 来自仓库当前文件，解析器版本来自代码）→ `restore_reconciled(item, batch, inputs_hash_now, resolvedBy)`（要求最近一次通过且哈希相等；否则 409 `not_passing`，响应说明"需先重跑对账"）。函数先关项后提升（§3.2），返回 `promoted/skipped`；`promoted=0` 时路由返回 200 但 `detail.restore_note='no_rows_promoted'` 并列出 skipped 原因（例如仍被争议项引用）。`resolved_reject` = 左侧确有问题，行保持 `quarantined`。规格二的 `resolve_facts_quarantine` 对 `reconcile_mismatch` 项不适用（分派表）。`reconcile_review` 项（§5.4）：接受/拒绝只改状态（无事实动作），由计划一通用路径处理。
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:569:| `adopt_candidate`：`stale_evaluation` | 重评一次后 409 | 同名 | — |
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:570:| `adopt_candidate`：`batch_mismatch` / 候选 `source_ref` 定位不到 filing | 500（编程错误）/ 409 `filing_not_found` | 同名 | — |
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:571:| `restore_reconciled`：`promoted=0` | 200，`restore_note='no_rows_promoted'` + skipped 原因 | — | — |
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:578:| `adopt_candidate`：`invalid_choice`/`invalid_candidate` → 400；`generation_moved`/`conflict_exists`/`duplicate`/`replay_required`/`filing_not_found` → 409 | 项保持 open | 同名 | — |
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:579:| `restore_reconciled`：`not_passing` | 409 | 同名 | — |
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:611:`identifiers.integration.test.ts`、`dq-extensions.integration.test.ts`（含 `S4_TEST_STATE`，登记 `criticalSuites`）：两迁移在有数据库上升级 + 写入新证据后重放不改写；`valid_from` 更新受互斥约束；`resolve_identifier_claim` 每个 op 的成功/冲突回滚/目标不一致拒绝/非活跃发行人拒绝/`legacy`/`amend_required`/并发 409；`dq_reconciliations` 两条 kind 约束；`dq_filing_expectations` 全部约束组合；`replace_filing_expectations` 原子替换；`issuer_filing_profiles` 复合主键；`issuer_filer_categories`；`dq_reconcile_cycles` 单运行周期唯一索引与 `drc_done_accounted`；`dq_calendar_passes` 单未完成遍；`dq_freshness` weekly；`filings.accepted_at` 只允许 null→值且无角色可直写；`set_filing_acceptance`；`apply_reconcile_result` 持锁、只动围栏发行人的 `ok` 行、结果行+项+隔离+`hook:pending` 同一事务、同键第二次调用 `reused:true`、`state_rev+1`、与并发 `publish_sync_run` 串行；`complete_reconcile_member` 从已接受结果行推导计数、缺键 → `member_incomplete`；**每个提升入口**（`promote_quarantined`、`resolve_facts_quarantine`、`restore_reconciled`）都遵守 `fact_promote_rows` 新谓词（T6）；`filings` 的 `document_ref/document_url/link_attempts` 列级 update 仍可用、`accepted_at` 不可直写（T11）；**`restore_reconciled`：通过 + 哈希相等 → 项关闭且行真正提升（R1 回归）**、哈希不等 → `not_passing`、被其他 open 项引用 → `skipped`；`read_filing_facts` 返回全部代含 `quarantined`（读取器本身不过滤，绑定在调用方过滤）；`adopt_candidate` 全部码（含 `batch_mismatch`、发行人/市场取自 filing）、`stale_evaluation`、事务内 `hook` 写入、管理运行字段；`resolve_lineage_conflict` 锁定完整谱系、锁下重查、`lineage_changed`、`unresolved` 回滚、`promote_quarantined` 附加条款生效；`read_facts_lineage` 单发行人三种模式与 `read_facts` 逐字段一致、双发行人抑制与 `conflicts`、anon 只见 `ok`；`replace_financial_metrics_lineage` 成员 rev / 集合变化 / `scope_missing`、包装函数一致、`based_on_lineage` 回填；**拓扑：`issuers_topology_guard` 在全新连接上拒绝直接 update、在同一事务内 `set_merge` 成功返回后仍拒绝直接 update（S1 两项测试）、函数异常路径后设置已恢复；`set_merge` A→B 后 B→C 成功且 A 改指 C（R3 回归）、`row_count` 断言、与物化交错 → `stale_computation`；`set_dissolved` 的 `has_referrers`**；游标：`failed` 且 `attempts<3` 可认领、`attempts=3` 终态（S4）；`drc_done_accounted` 对 NULL 计数拒绝（S5）；围栏：过期/易主的尝试调用 `apply_reconcile_result`/`complete_reconcile_member`/`fail_reconcile_member` 得 `fence_failed` 且无写入；租约丢失前已提交的键被接手者复用、计数不重复（T2）；绑定：激活代内多行同键 → `left_ambiguous`，仅旧代同键 → 不歧义、按激活代绑定，`adopt_candidate` 遇仅旧代同键不报 `duplicate`（T1）；`adopt_candidate` 从持久化 camelCase 候选映射、代取自锚定运行、`mapping_version` 无留存 → `replay_required`（T5）；日历遍：第二个工作者租不到遍、全部遍函数围栏、冻结成员不受范围变化影响、失败成员重试成功只置 `done` 一次、`finish_calendar_pass` 两种终态都写 `finished_at`、过期工作者不能改动新租约者的进度（T3）；`read_facts_lineage` 非 `ok` 行 `disclosure_seq` 为空且只在 `history` 时返回（T7）；RLS 与桶策略（anon/authenticated 不可读写新表与桶）。
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:615:- `ixbrl-pair.integration.test.ts`：AAPL/MSFT 夹具同步 → 全 passed；**注入改值的 companyfacts 夹具**作第二发行人 → mismatch → 隔离 → 不可见 → 物化重算 → 修正夹具重跑 → `latest_result.passed` 且 `inputs_hash` 相等 → `restore_reconciled` 恢复；未通过时恢复被拒。
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:42:supabase/migrations/20261107091000_facts_extensions.sql     filings 受理列、financial_metrics.based_on_lineage、fact_promote_rows 谓词、read_filing_facts、read_facts_lineage（read_facts 改为包装）、replace_financial_metrics_lineage（旧函数改包装）、set_filing_acceptance、adopt_candidate、restore_reconciled、resolve_lineage_conflict、apply_reconcile_result、游标三函数、set_merge、set_dissolved（Task 8a/8b/8c）
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:257:| `adopt_candidate`（2） | `(p_item uuid, p_index int, p_batch uuid, p_expected_rev bigint, p_resolved_by uuid) returns jsonb` → `{fact_id, run_id, issuer_id, market}` | `invalid_choice` `invalid_candidate` `filing_not_found` `generation_moved` `replay_required` `batch_mismatch` `stale_evaluation` `duplicate` `conflict_exists` `item_not_open` |
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:258:| `restore_reconciled`（2） | `(p_item uuid, p_batch uuid, p_inputs_hash_now text, p_resolved_by uuid) returns jsonb` → `{promoted, skipped}` | `not_passing` `item_not_open` |
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:1875:   // a newer verdict (apply_reconcile_result / restore_reconciled) holds the item row
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:2405:-- replaces ONLY the named key, so a concurrent apply_reconcile_result / restore_reconciled / adoption that
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:8777:规格条目：§3.2（迁移二全部，含 T1/T2/T5/T6/T7/T8/T11/U2/U3 规定修法）、§4.4（读时谱系、物化目标、读接口、`/metrics` 向量守卫）、§4.5（受理时刻、E7）、§4.6（候选选定、分派、钩子、`--pending-hooks`）、§5.5–§5.6 中由 SQL 承担的部分（游标三函数、`apply_reconcile_result`、`restore_reconciled`）、§8 相关行、§9.2 迁移二全部条目、§1.1 E7/E8。
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:8779:任务拆分（报告给指挥）：Task 8 → **8a**（filings 受理列、`based_on_lineage`、读取函数、谱系物化函数、拓扑函数）/ **8b**（`fact_promote_rows` 谓词、`adopt_candidate`、`restore_reconciled`、`resolve_lineage_conflict`）/ **8c**（游标三函数、`apply_reconcile_result`、类型、锁）；Task 9 → **9a**（类型与三实现）/ **9b**（共享契约用例）。Task 10、11、12 不拆。
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:8812:8. **`lineage_conflict` 项的 natural_key 格式**：`<T>:<concept>:<period_start>:<period_end>:<consolidation>:<unit>:<available_date>`（= `${T}:${factKey(K)}:${available_date}`，`keys.ts::factKey`，恰 7 段）。`adopt_candidate` 的争议检查与 `resolve_lineage_conflict` 的解析都依赖它；Part D 的 lineage 对必须这样渲染 `item.natural_key`。 **→ 已裁决：接口对齐记录 #10。**
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:8817:13. 比规格更严/更具体之处：`fact_promote_rows` 的 `reconcile_mismatch` 谓词也挡住 `resolved_reject` 项（拒绝 = 左侧确有问题）；`lineage_conflict` 谓词的成员集合 = `payload.fact_ids ∪ detail.quarantined_fact_ids`；`restore_reconciled`/`resolve_lineage_conflict` 要求 `p_batch` 为 running 批次（否则 `batch_mismatch`）；`read_facts_lineage` 的抑制条件用"去重后成员数 > 1"（合法输入下等价于 `array_length>1`）；`set_filing_acceptance` 只接受 `source='edgar'` 的 filing，且 `filings_limited_update` 要求事务内设置 `facts.allow_acceptance_write='on'`（所以连 owner 直写也被拒）。 **→ 已裁决：接口对齐记录 #35。**
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:8840:// guard (S1, R3), fact_promote_rows predicates on every promotion entry (T6), adopt_candidate (T1,
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:8841:// T5, U3), restore_reconciled (R1), resolve_lineage_conflict, the reconcile cursor and
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:9216:--  (8b) fact_promote_rows predicates; adopt_candidate; restore_reconciled; resolve_lineage_conflict.
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:9655:### Task 8b: 迁移二（二）—— 提升谓词、`adopt_candidate`、`restore_reconciled`、`resolve_lineage_conflict`
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:9666: describe('8b: promotion predicates, adopt_candidate, restore_reconciled, resolve_lineage_conflict',()=>{
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:9677:  const restore=(id:string,b:string,hash:string|null,by:string)=>one(`select public.restore_reconciled($1,$2,$3,$4) v`,[id,b,hash,by]);
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:9684:  const adopt=(id:string,index:number,b:string,expected:number,by:string)=>one(`select public.adopt_candidate($1,$2,$3,$4,$5) v`,[id,index,b,expected,by]);
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:9688:  it('T6: an open, rejected or not-passing reconcile_mismatch blocks promotion through promote_quarantined and resolve_facts_quarantine; accepted-and-passing does not',async()=>{
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:9699:   expect(await resolveFacts(m3,[],by)).toMatchObject({promoted:0});                                   // the generic resolver cannot bypass restore_reconciled
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:9707:  it('T6: a resolved lineage_conflict binds promotion to its chosen rows, for payload members and for the rows it quarantined',async()=>{
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:9717:  it('restore_reconciled (R1): passing with the same hash closes the item first and really promotes; another hash or a failing result is not_passing; another open item makes the row skip',async()=>{
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:9742:  it('adopt_candidate (T5): maps the persisted camelCase candidate, takes issuer and market from the filing, generation from the anchor run, mapping_version from retained rows; the hook in the same transaction; a management run',async()=>{
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:9759:  it('adopt_candidate codes: invalid_choice, invalid_candidate, filing_not_found, batch_mismatch, stale_evaluation, generation_moved; the item stays open',async()=>{
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:9777:  it('adopt_candidate: duplicate on the full candidate key in any status; an old-generation row with the same key is no duplicate (T1); replay_required without exactly one retained mapping_version',async()=>{
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:9793:  it('adopt_candidate conflict_exists (U3): a visible ok row with another value for (K, date), or an open same_day_conflict / lineage_conflict on it even with no ok competitor left',async()=>{
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:9854:   for(const sig of ['public.adopt_candidate(uuid,int,uuid,bigint,uuid)','public.restore_reconciled(uuid,uuid,text,uuid)','public.resolve_lineage_conflict(uuid,uuid,uuid,uuid)']){
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:9865:Expected: FAIL —— 8b 的用例报 `function public.adopt_candidate(...) does not exist` 等；两个 T6 用例因落地 `fact_promote_rows` 无新谓词而 `expected 0 to be …` / promoted 1。8a 用例仍 PASS。
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:9872:-- ---------------------------------------------------------------- 7. promotion eligibility (spec §3.2, T6)
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:9878:-- restore_reconciled). Callers hold the scope lock (promote_quarantined, resolve_facts_quarantine,
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:9879:-- restore_reconciled).
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:9923:-- ---------------------------------------------------------------- 8. adopt a quarantined candidate (spec §3.2 adopt_candidate, §4.6, T1, T5, U3)
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:9939:create or replace function public.adopt_candidate(p_item uuid, p_index int, p_batch uuid, p_expected_rev bigint, p_resolved_by uuid)
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10044:revoke execute on function public.adopt_candidate(uuid, int, uuid, bigint, uuid) from public, anon, authenticated;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10045:grant execute on function public.adopt_candidate(uuid, int, uuid, bigint, uuid) to service_role;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10047:-- ---------------------------------------------------------------- 9. restore after a passing re-run (spec §3.2 restore_reconciled, §5.6, R1)
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10055:create or replace function public.restore_reconciled(p_item uuid, p_batch uuid, p_inputs_hash_now text, p_resolved_by uuid)
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10097:revoke execute on function public.restore_reconciled(uuid, uuid, text, uuid) from public, anon, authenticated;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10098:grant execute on function public.restore_reconciled(uuid, uuid, text, uuid) to service_role;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10186:git commit -m "feat(facts): migration two part 2 — promotion predicates, adopt_candidate, restore_reconciled, resolve_lineage_conflict (F3-4)
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10831:   if(fn==='adopt_candidate')return {data:{fact_id:'nf',run_id:'nr',issuer_id:I1,market:'US'}};
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10832:   if(fn==='restore_reconciled')return {data:{promoted:'0',skipped:[{fact_id:'f',reason:'ineligible'}]}};
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10852:  expect(calls.at(-1)).toEqual({fn:'adopt_candidate',args:{p_item:'it',p_index:2,p_batch:'b',p_expected_rev:5,p_resolved_by:'adm'}});
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10854:  expect(calls.at(-1)).toEqual({fn:'restore_reconciled',args:{p_item:'it',p_batch:'b',p_inputs_hash_now:'h',p_resolved_by:'adm'}});
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:11245:  async adoptCandidate(item,index,batch,expectedRev,by){return adoptFromJson(await call<unknown>('adopt_candidate',{p_item:item,p_index:index,p_batch:batch,p_expected_rev:expectedRev,p_resolved_by:by}));},
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:11246:  async restoreReconciled(item,batch,hash,by){return restoreFromJson(await call<unknown>('restore_reconciled',{p_item:item,p_batch:batch,p_inputs_hash_now:hash,p_resolved_by:by}));},
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:11292:  async adoptCandidate(item,index,batch,expectedRev,by){return adoptFromJson(await fn<unknown>('public.adopt_candidate($1,$2,$3,$4::bigint,$5)',[item,index,batch,expectedRev,by]));},
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:11293:  async restoreReconciled(item,batch,hash,by){return restoreFromJson(await fn<unknown>('public.restore_reconciled($1,$2,$3,$4)',[item,batch,hash,by]));},
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:11350: /** The persisted plan-2 FactCandidate (camelCase), validated like adopt_candidate; null = invalid_candidate. */
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:11395: // promote_quarantined eligibility (§4.5 + plan 3 T6): quarantined, run published, filing on the
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:13969:规格条目：§5.1–§5.6（对账对、内联 XBRL 解析、美股样本、A 股黄金集、运行器、失败即隔离与恢复）；§3.1 `dq_reconciliations`/`dq_reconcile_cycles`/`dq_reconcile_cursor`（只用不建）；§3.2 `apply_reconcile_result`/游标三函数/`read_filing_facts`/`restore_reconciled`/`resolve_lineage_conflict`/`set_merge`（只用不建）；§4.4 谱系冲突处置；§8 对账相关各行；§9.1 `ixbrl/decimal/pairs/run/inputs-hash/gold-cn.schema` 单测；§9.3 `ixbrl-pair`、`lineage` 离线集成（`gold-cn` 按降级不创建）；§1.1 E4、E5（降级记录）。
src/lib/facts/sync.ts:213:  const park=(reasonCode:string,naturalKey:string,payload:Record<string,unknown>)=>quarantine(tables,{dataset,table:'financial_facts',naturalKey,reasonCode,batchId,payload:{...payload,run_id:runId}});
src/lib/facts/sync.ts:224:  for(const [naturalKey,rows] of grouped(ambiguousRows,x=>ambiguousKey(issuer,market,keyOfCandidate(x.c),x.c.filingRef,gen))){
src/lib/facts/sync.ts:226:   await park('ambiguous_value',naturalKey,{key:keyComponents(issuer,market,keyOfCandidate(c0)),parser_key:rows[0].parserKey,candidates:rows.map(x=>x.c),rows:rows.map(x=>x.c)});out.counts.quarantined+=rows.length;
src/lib/facts/sync.ts:228:  for(const [naturalKey,rows] of grouped(parsed.oddDuration,c=>ambiguousKey(issuer,market,keyOfCandidate(c),c.filingRef,gen))){
src/lib/facts/sync.ts:229:   await park('odd_duration',naturalKey,{key:keyComponents(issuer,market,keyOfCandidate(rows[0])),candidate:rows[0],rows});out.counts.quarantined+=rows.length;
src/lib/facts/sync.ts:231:  for(const [naturalKey,rows] of grouped(parsed.missingAvailableDate,r=>missingDateKey(issuer,scope.fetch_key,r))){
src/lib/facts/sync.ts:232:   await park('missing_available_date',naturalKey,{row:rows[0],rows});out.counts.quarantined+=rows.length;
src/lib/facts/sync.ts:252:  for(const a of plan.ambiguous)await park('ambiguous_value',a.naturalKey,{key:a.key,candidates:a.candidates});
src/lib/facts/sync.ts:254:   const itemId=await park('same_day_conflict',c.naturalKey,{key:c.key,fact_ids:[...c.newFactIds,...c.existingOkFactIds],values:c.values});
src/lib/facts/sync.ts:263:   const itemId=await park(rq.reason,rq.naturalKey,{key:rq.key,fact_ids:rq.factIds,rule:rq.rule,detail:rq.detail});
src/lib/facts/facts.integration.test.ts:104:  await q(`insert into public.dq_quarantine(id,dataset,table_name,natural_key,reason_code,batch_id,payload) values($1,'facts.us','financial_facts',$2,'same_day_conflict',$3,$4::jsonb)`,
src/lib/facts/facts.integration.test.ts:310:  await q(`insert into public.dq_quarantine(id,dataset,table_name,natural_key,reason_code,batch_id,payload) values($1,'facts.us','financial_facts',$2,'identity_gp',$3,$4::jsonb)`,[other,`${iss}:US:IS:${other}`,b,JSON.stringify({key:{},fact_ids:[c],run_id:runB})]);
src/lib/facts/facts.integration.test.ts:326:  await q(`insert into public.dq_quarantine(id,dataset,table_name,natural_key,reason_code,batch_id,payload) values($1,'facts.us','other_table',$2,'identity_gp',$3,$4::jsonb)`,[foreign,`${iss}:other:${foreign}`,b,JSON.stringify({key:{},fact_ids:[c],run_id:runB})]);
src/lib/facts/facts.integration.test.ts:549:   const item=await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${iss}:US:BS:${randomUUID()}`,reasonCode:'identity_bs',batchId:b1,payload:{key:{},fact_ids:[qd.fact_id],run_id:run1}});
src/lib/facts/facts.integration.test.ts:589:  const opened=async(iss:string,b:string,run:string,ids:string[])=>(await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${iss}:US:BS:${randomUUID()}`,reasonCode:'identity_bs',batchId:b,payload:{key:{},fact_ids:ids,run_id:run}})) as string;
src/lib/facts/types.ts:54:export interface ConflictItem{id:string;natural_key:string;fact_ids:string[];available_date:string;key:Record<string,string|null>}
src/lib/facts/plan.ts:5:// ambiguous_value (same candidate key, different values — no row), contested (an open item for
src/lib/facts/plan.ts:28:export interface PlanConflict{naturalKey:string;key:Record<string,string|null>;availableDate:string;newFactIds:string[];existingOkFactIds:string[];values:{filing:string;value:string}[]}
src/lib/facts/plan.ts:29:export interface PlanAmbiguous{naturalKey:string;key:Record<string,string|null>;candidates:FactCandidate[]}
src/lib/facts/plan.ts:59: const openByKey=new Map(input.openConflicts.map(i=>[i.natural_key,i]));
src/lib/facts/plan.ts:75:  if(values.size>1){result.ambiguous.push({naturalKey:ambiguousKey(issuerId,market,k,cands[0].filingRef,mappingGen),key:keyComponents(issuerId,market,k),candidates:cands});result.counts.quarantined+=cands.length;continue;}
src/lib/facts/plan.ts:103:   result.conflicts.push({naturalKey:dk,key:keyComponents(issuerId,market,k,date),availableDate:date,newFactIds:inserts.map(r=>r.fact_id),existingOkFactIds:sameDayOk.map(r=>r.fact_id),
src/lib/facts/db.ts:81:export function conflictFromItem(r:{id:string;natural_key:string;payload:Record<string,unknown>}):ConflictItem{
src/lib/facts/db.ts:85: return {id:r.id,natural_key:r.natural_key,fact_ids:ids,available_date:key.available_date??r.natural_key.slice(r.natural_key.lastIndexOf(':')+1),key};
src/lib/facts/db.ts:87:/** natural_key prefix of every facts quarantine item of an issuer+market (§7.1). */
src/lib/facts/db.ts:147:   return (await pageAll<{id:string;natural_key:string;payload:Record<string,unknown>}>(()=>c.from('dq_quarantine').select('id,natural_key,payload').eq('table_name','financial_facts').eq('reason_code','same_day_conflict').eq('status','open').like('natural_key',`${conflictPrefix(issuer,market)}%`).order('created_at').order('id'))).map(conflictFromItem);
src/lib/facts/read.test.ts:55:  await db.tables.insert('dq_quarantine',{id:itemId,dataset:'facts.us',table_name:'financial_facts',natural_key:`${iss}:US:IS:x`,reason_code:'identity_gp',status:'open',payload:{key:{issuer_id:iss,market:'US'},fact_ids:[],run_id:run},detail:{},batch_id:b,resolved_by:null,resolved_at:null,created_at:'2026-01-01T00:00:00.000Z'});
src/lib/facts/rules.test.ts:22:  expect(out.quarantine[0]).toMatchObject({reason:'identity_bs',rule:'identity_bs',factIds:[assets.fact_id],naturalKey:`${ISSUER}:US:BS:2023-09-30:USD:acc-1:1`,key:{statement:'BS',period_end:'2023-09-30',unit:'USD',source_ref:'acc-1'}});
src/lib/facts/rules.test.ts:38:  expect(out.quarantine[0]).toMatchObject({reason:'identity_gp',naturalKey:`${ISSUER}:US:IS:2022-10-01:2023-09-30:USD:acc-1:1`,factIds:[gp.fact_id,expect.any(String),expect.any(String)]});
src/lib/facts/sync.test.ts:106:  expect(items[0]).toMatchObject({dataset:'facts.us',table_name:'financial_facts',reason_code:'same_day_conflict',status:'open',natural_key:`${ISSUER}:US:revenue:2022-10-01:2023-09-30:consolidated:USD:2023-11-03`});
src/lib/facts/sync.test.ts:122:  expect(item).toMatchObject({reason_code:'identity_bs',natural_key:`${ISSUER}:US:BS:2023-09-30:USD:acc-1:1`});
src/lib/facts/sync.test.ts:133:  expect(tables.rows('dq_quarantine').map(i=>i.reason_code).sort()).toEqual(['ambiguous_value','odd_duration']);
src/lib/facts/sync.test.ts:261:  expect(tables.rows('dq_quarantine').map(i=>[i.reason_code,i.natural_key]).sort()).toEqual([
src/lib/facts/sync.test.ts:412:  expect(new Set(tables.rows('dq_quarantine').map(i=>i.natural_key)).size).toBe(3);
src/lib/facts/db-contract.ts:40:  const conflict=(iss:string,b:string,run:string,ids:string[],date='2024-02-01')=>quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${iss}:US:revenue:2023-10-01:2023-12-31:consolidated:USD:${date}`,reasonCode:'same_day_conflict',batchId:b,
src/lib/facts/db-contract.ts:149:   const other=await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${iss}:US:IS:${randomUUID()}`,reasonCode:'identity_gp',batchId:b,payload:{key:{},fact_ids:[c2.fact_id],run_id:runC}});
src/lib/facts/db-contract.ts:168:   const foreign=await quarantine(h.tables,{dataset:'facts.us',table:'other_table',naturalKey:`${iss}:US:${randomUUID()}`,reasonCode:'same_day_conflict',batchId:b,payload:{key:{},fact_ids:[],run_id:runB}});
src/lib/facts/db-contract.ts:312:   const identity=await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${iss}:US:IS:${randomUUID()}`,reasonCode:'identity_gp',batchId:b,payload:{key:{issuer_id:iss,market:'US'},fact_ids:[c3.fact_id],run_id:runC}});
src/lib/facts/db-contract.ts:326:   const parked=await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${iss}:US:cash::2023-09-30:consolidated:USD:acc-9:1`,reasonCode:'ambiguous_value',batchId:b,payload:{key:{issuer_id:iss,market:'US'},fact_ids:[],run_id:run}});
src/lib/facts/db-contract.ts:334:   const parked2=await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${iss}:US:cash::2023-06-30:consolidated:USD:acc-9:1`,reasonCode:'odd_duration',batchId:b,payload:{key:{issuer_id:iss,market:'US'},fact_ids:[],run_id:run2}});
-- supabase/migrations/20261106090000_financial_facts.sql
-- F2-0 (data foundation plan 2 spec §4): the disclosure log. A sync run per issuer+market is the
-- unit of publication (fact_sync_runs); filings are the documents; financial_facts is an
-- append-only log of "which filing, available on which date, disclosed which value for which
-- concept/period/unit"; financial_metrics is a derived cache replaced atomically per issuer;
-- fact_sync_scope holds the schedule, the lease and the fact-state version (state_rev).
-- Write path (§4.5, §4.7): NO role may insert/update/delete these tables — service_role included;
-- every change goes through the security definer functions below. Every function that changes
-- fact visibility starts by locking the issuer's fact_sync_scope row (`select … for update`), so
-- publish, quarantine membership, resolution/promotion and materialisation serialise (§5.4);
-- collector functions additionally verify the lease (lease_batch_id = batch and
-- lease_until > now(), else `lease_lost`). Two explicit exceptions: service_role may update
-- filings.document_ref/document_url/link_attempts (cninfo linking; column-level grant) and may
-- call reconcile_fact_sync_scope (schedule inputs, no lease).
-- Errors carry the code as the message: lease_lost (55P03); run_pending, run_published,
-- mapping_gen_regression, stale_computation (P0001); run_abandoned, item_not_open (P0001, bug
-- paths); run_not_found (P0002); invalid_* (22023). Triggers refuse with 23514, prefix `append_only:`.
-- The hosted `postgres` role is not a superuser: functions keep the migration role as owner (no
-- `alter function … owner`), `set search_path = public`, and qualify every relation.
-- Replayable: guarded creates, create or replace, drop-then-create policies and triggers,
-- insert … on conflict for the bucket. Only storage.buckets is referenced (local harness).

-- ---------------------------------------------------------------- 4.1 fact_sync_runs
create table if not exists public.fact_sync_runs (
  run_id        uuid primary key,
  issuer_id     uuid not null references public.issuers(issuer_id) on delete restrict,
  market        text not null check (market in ('US','CN')),
  batch_id      uuid not null references public.ingest_batches(batch_id) on delete restrict,
  mapping_gen   int not null check (mapping_gen >= 1),
  status        text not null default 'staged' check (status in ('staged','published','abandoned')),
  manifest      jsonb not null default '[]' check (jsonb_typeof(manifest) = 'array'),
  started_at    timestamptz not null default now(),
  published_at  timestamptz,
  constraint fact_sync_runs_published_iff check ((status = 'published') = (published_at is not null))
);
create index if not exists fact_sync_runs_issuer_status_idx on public.fact_sync_runs(issuer_id, market, status);
create index if not exists fact_sync_runs_batch_idx on public.fact_sync_runs(batch_id);

-- ---------------------------------------------------------------- 4.2 filings
create table if not exists public.filings (
  filing_id        uuid primary key,
  issuer_id        uuid not null references public.issuers(issuer_id) on delete restrict,
  market           text not null check (market in ('US','CN')),
  source           text not null check (source in ('edgar','tushare')),
  origin           text not null check (origin in ('sec','sse','szse','bse')),
  form_type        text not null check (form_type in ('10-K','10-Q','20-F','40-F','10-K/A','10-Q/A','20-F/A','annual','semiannual','q1','q3','restatement','other')),
  fiscal_year      int,
  fiscal_period    text check (fiscal_period is null or fiscal_period in ('FY','Q1','Q2','Q3','H1','9M')),
  period_end       date,
  available_date   date not null,
  source_ref       text not null check (length(source_ref) between 1 and 256),
  url              text,
  document_ref     text,
  document_url     text,
  link_attempts    int not null default 0 check (link_attempts >= 0),
  mapping_gen      int not null default 0 check (mapping_gen >= 0),      -- active generation; 0 = no published run covers it yet
  run_id           uuid not null references public.fact_sync_runs(run_id) on delete restrict,   -- the run that created it
  created_at       timestamptz not null default now(),
  constraint filings_source_ref_uniq unique (source, source_ref),
  constraint filings_id_issuer_market_uniq unique (filing_id, issuer_id, market),
  constraint filings_id_available_uniq unique (filing_id, available_date)
);
create index if not exists filings_issuer_available_idx on public.filings(issuer_id, market, available_date desc);
create index if not exists filings_run_idx on public.filings(run_id);

-- ---------------------------------------------------------------- 4.3 financial_facts
create table if not exists public.financial_facts (
  fact_id          uuid primary key,
  issuer_id        uuid not null,
  market           text not null check (market in ('US','CN')),
  filing_id        uuid not null,
  run_id           uuid not null references public.fact_sync_runs(run_id) on delete restrict,
  concept          text not null check (length(concept) between 1 and 64),
  source_concept   text not null check (length(source_concept) between 1 and 256),
  statement        text not null check (statement in ('IS','BS','CF','DEI')),
  period_start     date,
  period_end       date not null,
  duration         text not null check (duration in ('3M','6M','9M','12M','INSTANT')),
  value            numeric not null,
  value_text       text generated always as (value::text) stored,
  unit             text not null check (length(unit) between 1 and 16),
  consolidation    text not null default 'consolidated' check (consolidation in ('consolidated','parent')),
  available_date   date not null,
  mapping_gen      int not null check (mapping_gen >= 1),
  mapping_version  text not null check (length(mapping_version) between 1 and 64),
  status           text not null default 'staged' check (status in ('staged','ok','quarantined')),
  raw_hash         text not null check (length(raw_hash) between 1 and 128),
  created_at       timestamptz not null default now(),
  constraint financial_facts_filing_fkey foreign key (filing_id, issuer_id, market) references public.filings(filing_id, issuer_id, market) on delete restrict,
  constraint financial_facts_filing_date_fkey foreign key (filing_id, available_date) references public.filings(filing_id, available_date) on delete restrict,
  constraint financial_facts_period check (period_start is null or period_start < period_end),
  constraint financial_facts_instant check ((period_start is null) = (duration = 'INSTANT')),
  constraint financial_facts_candidate_key unique nulls not distinct (issuer_id, concept, period_start, period_end, consolidation, unit, filing_id, mapping_gen)
);
create index if not exists financial_facts_read_idx on public.financial_facts(issuer_id, market, concept, period_end, available_date);
create index if not exists financial_facts_run_idx on public.financial_facts(run_id);
create index if not exists financial_facts_filing_idx on public.financial_facts(filing_id);
-- publish/promote look items up by member fact id (payload.fact_ids ? id)
create index if not exists dq_quarantine_fact_ids_idx on public.dq_quarantine using gin ((payload -> 'fact_ids')) where table_name = 'financial_facts';

-- ---------------------------------------------------------------- 4.4 financial_metrics
create table if not exists public.financial_metrics (
  issuer_id        uuid not null references public.issuers(issuer_id) on delete restrict,
  market           text not null check (market in ('US','CN')),
  metric           text not null check (length(metric) between 1 and 64),
  period_start     date not null,
  period_end       date not null,
  duration         text not null check (duration in ('3M','6M','9M','12M','TTM','INSTANT')),
  value            numeric not null,
  value_text       text generated always as (value::text) stored,
   530	    raise exception 'generation_moved' using errcode = 'P0001';
   531	  end if;
   532	  select array_agg(distinct f.mapping_version) into v_versions from public.financial_facts f where f.run_id = r.run_id;
   533	  if v_versions is null then
   534	    select array_agg(distinct f.mapping_version) into v_versions from public.financial_facts f where f.filing_id = g.filing_id and f.mapping_gen = v_gen;
   535	  end if;
   536	  if v_versions is null or cardinality(v_versions) <> 1 then raise exception 'replay_required' using errcode = 'P0001'; end if;
   537	  select * into b from public.ingest_batches where batch_id = p_batch;
   538	  if not found or b.status <> 'running' or b.dataset <> q.dataset then raise exception 'batch_mismatch' using errcode = 'P0001'; end if;
   539	  select s.state_rev into v_rev from public.fact_sync_scope s where s.issuer_id = g.issuer_id and s.market = g.market for update;
   540	  if not found then raise exception 'scope_missing' using errcode = 'P0001'; end if;
   541	  if v_rev is distinct from p_expected_rev then raise exception 'stale_evaluation' using errcode = 'P0001'; end if;
   542	  select * into q from public.dq_quarantine where id = p_item for update;
   543	  if q.status <> 'open' then raise exception 'item_not_open' using errcode = 'P0001'; end if;
   544	  if exists (select 1 from public.financial_facts f
   545	             where f.issuer_id = g.issuer_id and f.concept = c ->> 'concept' and f.period_start is not distinct from v_ps and f.period_end = v_pe
   546	               and f.consolidation = c ->> 'consolidation' and f.unit = c ->> 'unit' and f.filing_id = g.filing_id and f.mapping_gen = v_gen) then
   547	    raise exception 'duplicate' using errcode = 'P0001';
   548	  end if;
   549	  v_t := coalesce((select i.merged_into from public.issuers i where i.issuer_id = g.issuer_id), g.issuer_id);
   550	  v_k := (c ->> 'concept') || ':' || coalesce(c ->> 'periodStart', '') || ':' || (c ->> 'periodEnd') || ':' || (c ->> 'consolidation') || ':' || (c ->> 'unit');
   551	  if exists (select 1 from public.financial_facts f join public.filings fg on fg.filing_id = f.filing_id and fg.mapping_gen = f.mapping_gen
   552	             where f.issuer_id = g.issuer_id and f.market = g.market and f.status = 'ok' and f.concept = c ->> 'concept'
   553	               and f.period_start is not distinct from v_ps and f.period_end = v_pe and f.consolidation = c ->> 'consolidation' and f.unit = c ->> 'unit'
   554	               and f.available_date = g.available_date and f.value <> v_value)
   555	     or exists (select 1 from public.dq_quarantine d
   556	                where d.table_name = 'financial_facts' and d.status = 'open' and d.reason_code = 'same_day_conflict'
   557	                  and d.payload -> 'key' ->> 'issuer_id' = g.issuer_id::text and d.payload -> 'key' ->> 'market' = g.market
   558	                  and d.payload -> 'key' ->> 'concept' = c ->> 'concept'
   559	                  and coalesce(d.payload -> 'key' ->> 'period_start', '') = coalesce(c ->> 'periodStart', '')
   560	                  and d.payload -> 'key' ->> 'period_end' = c ->> 'periodEnd'

exec
/bin/zsh -lc "sed -n '430,505p' supabase/migrations/20261106090000_financial_facts.sql; sed -n '1,120p' src/lib/dq/facts-resolver.ts; rg -n 'candidate|payload' supabase/migrations/20261106090000_financial_facts.sql | tail -25; git status --short" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:

-- This run's staged rows among p_fact_ids → quarantined (count returned), and the ids are merged
-- into dq_quarantine(p_item).payload.fact_ids under the same lock (append-only, deduplicated,
-- order kept; audit R6-1). Public rows are never touched here. The item must be open.
create or replace function public.quarantine_facts(p_run uuid, p_fact_ids uuid[], p_item uuid)
returns int language plpgsql security definer set search_path = public as $$
declare r public.fact_sync_runs; n int; v_ids uuid[] := coalesce(p_fact_ids, '{}'::uuid[]);
begin
  r := public.fact_run_lock(p_run);
  update public.financial_facts set status = 'quarantined'
  where run_id = p_run and status = 'staged' and fact_id = any(v_ids);
  get diagnostics n = row_count;
  update public.dq_quarantine q
  set payload = jsonb_set(q.payload, '{fact_ids}',
        (case when jsonb_typeof(q.payload -> 'fact_ids') = 'array' then q.payload -> 'fact_ids' else '[]'::jsonb end)
        || (select coalesce(jsonb_agg(to_jsonb(u.id::text) order by u.ord), '[]'::jsonb)
            from (select distinct on (id) id, ord from unnest(v_ids) with ordinality as t(id, ord) order by id, ord) u
            where not ((case when jsonb_typeof(q.payload -> 'fact_ids') = 'array' then q.payload -> 'fact_ids' else '[]'::jsonb end) ? u.id::text)),
        true)
  where q.id = p_item and q.status = 'open';
  if not found then raise exception 'item_not_open' using errcode = 'P0001'; end if;
  return n;
end $$;
revoke execute on function public.quarantine_facts(uuid, uuid[], uuid) from public, anon, authenticated;
grant execute on function public.quarantine_facts(uuid, uuid[], uuid) to service_role;

-- One transaction (§5.4): this run staged→ok; contested groups — every OPEN same_day_conflict
-- item that references a row of this run takes all of its still-ok members down, whichever run
-- produced them (audit R5-1: derived from the items, not from run bookkeeping; ids of deleted rows
-- are simply absent); manifest filings activate run.mapping_gen (a filing already on a higher
-- generation → mapping_gen_regression, nothing changes); run → published with manifest;
-- state_rev + 1. Returns the number of rows that became ok.
-- p_expected_rev (optional): the state_rev the caller's plan was read at; stage_*/quarantine_* never
-- bump it, only publish and promotion do, so a mismatch under the scope lock means a promotion or
-- resolution landed after planning and the plan is stale → stale_plan, nothing changes.
drop function if exists public.publish_sync_run(uuid, uuid[]);
create or replace function public.publish_sync_run(p_run uuid, p_manifest uuid[], p_expected_rev bigint default null)
returns int language plpgsql security definer set search_path = public as $$
declare r public.fact_sync_runs; n int; v_manifest uuid[] := coalesce(p_manifest, '{}'::uuid[]); v_rev bigint;
begin
  r := public.fact_run_lock(p_run);
  if p_expected_rev is not null then
    select state_rev into v_rev from public.fact_sync_scope where issuer_id = r.issuer_id and market = r.market;
    if v_rev is distinct from p_expected_rev then raise exception 'stale_plan' using errcode = 'P0001'; end if;
  end if;
  update public.financial_facts set status = 'ok' where run_id = p_run and status = 'staged';
  get diagnostics n = row_count;
  -- Set-based (no per-fact correlated scan): items found through the GIN index on this run's fact ids,
  -- then the distinct members of those items; only still-ok rows of this scope are taken down.
  update public.financial_facts f set status = 'quarantined'
  where f.status = 'ok' and f.issuer_id = r.issuer_id and f.market = r.market
    and f.fact_id in (
      select e::uuid
      from (
        select distinct q.id, q.payload -> 'fact_ids' as ids
        from public.financial_facts x
        join public.dq_quarantine q
          on q.table_name = 'financial_facts' and q.payload -> 'fact_ids' ? x.fact_id::text
        where x.run_id = p_run
          and q.reason_code = 'same_day_conflict' and q.status = 'open'
          and jsonb_typeof(q.payload -> 'fact_ids') = 'array'
      ) hit
      cross join lateral jsonb_array_elements_text(hit.ids) e
      where e ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    );
  if exists (select 1 from public.filings g where g.filing_id = any(v_manifest) and g.issuer_id = r.issuer_id and g.market = r.market and g.mapping_gen > r.mapping_gen) then
    raise exception 'mapping_gen_regression' using errcode = 'P0001';
  end if;
  update public.filings set mapping_gen = r.mapping_gen
  where filing_id = any(v_manifest) and issuer_id = r.issuer_id and market = r.market and mapping_gen < r.mapping_gen;
  update public.fact_sync_runs set status = 'published', published_at = now(), manifest = to_jsonb(v_manifest) where run_id = p_run;
  update public.fact_sync_scope set state_rev = state_rev + 1, updated_at = now() where issuer_id = r.issuer_id and market = r.market;
  return n;
end $$;
revoke execute on function public.publish_sync_run(uuid, uuid[], bigint) from public, anon, authenticated;
grant execute on function public.publish_sync_run(uuid, uuid[], bigint) to service_role;
// Admin hook for facts.* quarantine items (spec §7.3). Accepting is done entirely by the SQL
// function resolve_facts_quarantine (run_pending check on every member row AND on the item's
// anchor run payload.run_id — so an item without fact rows is also refused while its run is
// staged and stays open until that run is published or abandoned (round-1 #10); status flip,
// verdict in detail.chosen_fact_ids, promotion — one transaction). This module validates the
// verdict (same_day_conflict: chosen ⊆ payload.fact_ids with one value), calls the function,
// then runs materialize and records detail.hook = {stage, state, at, message?}; a later POST on
// a resolved_accept item with hook.state='failed' re-runs materialize only (idempotent).
// resolved_reject is the generic flip from quarantine.ts; fact rows stay quarantined.
// The SQL function stays the final authority: invalid_chosen / item_not_open / run_pending
// surface as FactsDbError (the route maps them to HTTP). For fact-row reasons the function itself
// commits detail.hook={stage:'materialize',state:'pending'} with the verdict, so an accepted item
// whose hook is missing / pending / failed is UNFINISHED: a later POST re-runs materialize only
// (never resolves again). Everything after the function commits is best-effort and never throws:
// a hook-write failure is reported as hook.state='failed' on a 'resolved' answer. Client-visible
// hook messages are codes only; full errors go to the server log.
import type {Row,TableClient} from '../db/table-client';
import {FactsDbError} from '../facts/types';
import type {FactsDb,Market} from '../facts/types';
import {decimalEquals} from '../facts/json-numbers';
import {materialize} from '../facts/derive';
import {resolveQuarantine} from './quarantine';
import type {QuarantineStatus} from './quarantine';

export interface HookState{stage:'materialize'|'done';state:'done'|'failed';at:string;message?:string}
export type FactsResolveOutcome='resolved'|'not_found'|'already_resolved'|'hook_retried'|'invalid_choice';
export interface FactsResolveResult{outcome:FactsResolveOutcome;hook?:HookState;promoted?:number;skipped?:number;chosenFactIds?:string[];
 /** What the route should audit: undefined = the outcome itself; null = nothing (retry of an already audited item). */
 auditAs?:'resolved'|'hook_retried'|null;
 /** Set when auditAs='resolved' on a retry: the audit row describes the PERSISTED resolution (original resolver, accept, committed ids); the retrying admin is recorded separately. */
 recovered?:{resolvedBy:string;status:'resolved_accept';chosenFactIds:string[];recoveredBy:string;recoveredAt:string}}
export interface ResolveFactsInput{status:Exclude<QuarantineStatus,'open'>;chosenFactIds?:string[];resolvedBy:string;now?:()=>Date}
/** Reason codes whose items reference fact rows; the other three (ambiguous_value, odd_duration, missing_available_date) have none. */
export const FACT_ROW_REASONS:readonly string[]=['same_day_conflict','identity_bs','identity_gp'];
const TABLE='dq_quarantine';
const MARKETS:readonly string[]=['US','CN'];

interface Payload{key?:Record<string,string|null>;fact_ids?:string[]}
const payloadOf=(item:Row):Payload=>(item.payload??{}) as Payload;
const detailOf=(item:Row):Record<string,unknown>=>(item.detail??{}) as Record<string,unknown>;
const hookOf=(item:Row):HookState|undefined=>detailOf(item).hook as HookState|undefined;
const target=(item:Row):{issuer:string;market:Market}|null=>{
 const key=payloadOf(item).key;const issuer=key?.issuer_id;const market=key?.market;
 return typeof issuer==='string'&&typeof market==='string'&&MARKETS.includes(market)?{issuer,market:market as Market}:null;
};

/** Re-reads the item (the SQL function may have written detail.chosen_fact_ids) and merges `hook` into detail. Never throws. */
async function writeHook(tables:TableClient,id:string,hook:HookState):Promise<HookState>{
 try{
  const [fresh]=await tables.select(TABLE,{id},{limit:1});
  await tables.update(TABLE,{id},{detail:{...detailOf(fresh??{}),hook}});
  return hook;
 }catch(e){
  console.error('[admin/dq] hook write',e instanceof Error?e.message:String(e));
  return hook.state==='done'?{stage:hook.stage,state:'failed',at:hook.at,message:'hook_write_failed'}:hook;
 }
}

async function runHook(db:FactsDb,tables:TableClient,id:string,where:{issuer:string;market:Market}|null,now:()=>Date):Promise<HookState>{
 let hook:HookState;
 if(where===null)hook={stage:'materialize',state:'failed',at:now().toISOString(),message:'no_target'};
 else{
  try{await materialize(db,where.issuer,where.market);hook={stage:'done',state:'done',at:now().toISOString()};}
  catch(e){
   console.error('[admin/dq] materialize',e instanceof Error?e.message:String(e));
   hook={stage:'materialize',state:'failed',at:now().toISOString(),message:e instanceof FactsDbError?e.code:'materialize_failed'};
  }
 }
 return writeHook(tables,id,hook);
}

/** Marks that the audit row of this resolution was written (best-effort; a missing mark only causes one extra audit row on retry). */
export async function markAudited(tables:TableClient,id:string):Promise<void>{
 try{
  const [fresh]=await tables.select(TABLE,{id},{limit:1});
  await tables.update(TABLE,{id},{detail:{...detailOf(fresh??{}),audit_written:true}});
 }catch(e){console.error('[admin/dq] audit mark',e instanceof Error?e.message:String(e));}
}

/**
 * Resolves one facts.* item. Throws FactsDbError('run_pending') straight from the FactsDb when any
 * member row's run is still staged (the route answers 409 and the item stays open).
 */
export async function resolveFactsItem(db:FactsDb,tables:TableClient,item:Row,input:ResolveFactsInput):Promise<FactsResolveResult>{
 const now=input.now??(()=>new Date());const id=String(item.id);const where=target(item);
 if(item.status!=='open'){
  const hook=hookOf(item);
  if(input.status==='resolved_accept'&&item.status==='resolved_accept'&&FACT_ROW_REASONS.includes(String(item.reason_code))&&hook?.state!=='done'&&where!==null){
   const audited=detailOf(item).audit_written===true;
   const ran=await runHook(db,tables,id,where,now);
   const persisted=detailOf(item).chosen_fact_ids;
   const chosenFactIds=Array.isArray(persisted)?persisted.map(String):[];
   const base:FactsResolveResult={outcome:'hook_retried',hook:ran,chosenFactIds,auditAs:audited?(ran.state==='done'?'hook_retried':null):'resolved'};
   if(audited)return base;
   return {...base,recovered:{resolvedBy:String(item.resolved_by),status:'resolved_accept',chosenFactIds,recoveredBy:input.resolvedBy,recoveredAt:now().toISOString()}};
  }
  return hook===undefined?{outcome:'already_resolved'}:{outcome:'already_resolved',hook};
 }
 if(input.status==='resolved_reject')return {outcome:await resolveQuarantine(tables,id,{status:'resolved_reject',resolvedBy:input.resolvedBy})};
 const reason=String(item.reason_code);const members=payloadOf(item).fact_ids??[];
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
280:-- its (K, available_date) — matched on the components stored in payload.key, whether or not the
295:        and jsonb_typeof(q.payload -> 'fact_ids') = 'array' and q.payload -> 'fact_ids' ? f.fact_id::text)
299:        and q.payload -> 'key' ->> 'issuer_id' = f.issuer_id::text and q.payload -> 'key' ->> 'market' = f.market
300:        and q.payload -> 'key' ->> 'concept' = f.concept
301:        and f.period_start is not distinct from nullif(q.payload -> 'key' ->> 'period_start', '')::date
302:        and (q.payload -> 'key' ->> 'period_end')::date = f.period_end
303:        and q.payload -> 'key' ->> 'consolidation' = f.consolidation and q.payload -> 'key' ->> 'unit' = f.unit
304:        and (q.payload -> 'key' ->> 'available_date')::date = f.available_date)
308:        and jsonb_typeof(q.payload -> 'fact_ids') = 'array' and q.payload -> 'fact_ids' ? f.fact_id::text
412:-- staged; an existing candidate key (any status, any run) is skipped. Returns the inserted count.
424:  on conflict on constraint financial_facts_candidate_key do nothing;
432:-- into dq_quarantine(p_item).payload.fact_ids under the same lock (append-only, deduplicated,
443:  set payload = jsonb_set(q.payload, '{fact_ids}',
444:        (case when jsonb_typeof(q.payload -> 'fact_ids') = 'array' then q.payload -> 'fact_ids' else '[]'::jsonb end)
447:            where not ((case when jsonb_typeof(q.payload -> 'fact_ids') = 'array' then q.payload -> 'fact_ids' else '[]'::jsonb end) ? u.id::text)),
484:        select distinct q.id, q.payload -> 'fact_ids' as ids
487:          on q.table_name = 'financial_facts' and q.payload -> 'fact_ids' ? x.fact_id::text
490:          and jsonb_typeof(q.payload -> 'fact_ids') = 'array'
561:-- from a provisional read of the member rows, else from payload.run_id) then the item row — the
564:-- Any member row whose run is still staged, or an anchor run (payload.run_id) that is still
567:-- verdict for same_day_conflict — must be a subset of payload.fact_ids — or all member ids
580:  v_ids := public.fact_item_members(q.payload);
583:    select r.issuer_id, r.market into v_issuer, v_market from public.fact_sync_runs r where r.run_id = (q.payload ->> 'run_id')::uuid;
591:  v_ids := public.fact_item_members(q.payload);
596:  v_run := (q.payload ->> 'run_id')::uuid;
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-rMJ9ktds' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-Q9RXnDXc' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/8b-review.md

codex
The new promotion guard allows generic resolution to bypass restore-time input validation, and candidate adoption misses conflicting values elsewhere in a merged lineage.

Full review comments:

- [P1] Prevent generic resolution from bypassing the restore hash check — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/supabase/migrations/20261107091000_facts_extensions.sql:452-454
  When an open `reconcile_mismatch` has `latest_result.passed = true` but its inputs have subsequently changed, `resolve_facts_quarantine` still closes it as `resolved_accept` and invokes this helper. This predicate then permits promotion without comparing the current inputs hash, bypassing the `not_passing` protection in `restore_reconciled`. The existing `resolveFactsItem` dispatcher can reach that generic resolver. Reject reconciliation items in the generic resolution path or require evidence of a hash-validated restore before allowing promotion.

- [P2] Check competing values across the current lineage — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/supabase/migrations/20261107091000_facts_extensions.sql:551-554
  For a merged issuer, this query only checks competitors belonging to the candidate's filing issuer. If another member of its lineage already has a visible, different value for the same key and date, and the reconciliation runner has not yet created an open `lineage_conflict`, adoption succeeds. `read_facts_lineage` then reports a conflict and excludes the affected current value instead of exposing the adopted fact. Check the full current lineage for competing values, with appropriate scope locks, rather than relying on an already-created quarantine item.
The new promotion guard allows generic resolution to bypass restore-time input validation, and candidate adoption misses conflicting values elsewhere in a merged lineage.

Full review comments:

- [P1] Prevent generic resolution from bypassing the restore hash check — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/supabase/migrations/20261107091000_facts_extensions.sql:452-454
  When an open `reconcile_mismatch` has `latest_result.passed = true` but its inputs have subsequently changed, `resolve_facts_quarantine` still closes it as `resolved_accept` and invokes this helper. This predicate then permits promotion without comparing the current inputs hash, bypassing the `not_passing` protection in `restore_reconciled`. The existing `resolveFactsItem` dispatcher can reach that generic resolver. Reject reconciliation items in the generic resolution path or require evidence of a hash-validated restore before allowing promotion.

- [P2] Check competing values across the current lineage — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/supabase/migrations/20261107091000_facts_extensions.sql:551-554
  For a merged issuer, this query only checks competitors belonging to the candidate's filing issuer. If another member of its lineage already has a visible, different value for the same key and date, and the reconciliation runner has not yet created an open `lineage_conflict`, adoption succeeds. `read_facts_lineage` then reports a conflict and excludes the affected current value instead of exposing the adopted fact. Check the full current lineage for competing values, with appropriate scope locks, rather than relying on an already-created quarantine item.

OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1ae99-235c-79b0-9496-957483723ddd
--------
user
commit a651281
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline a651281; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 447ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-fSaw8rZX' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-Jl5a0yOs' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-RyDIPVNz' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-hMZ6IhvD' (errno=Operation not permitted)
a651281 fix(entities): locator and provenance_written guards, guarded identifier write, no-key-update issuer lock, lenient rejection
 src/lib/entities/identifiers.integration.test.ts   | 60 ++++++++++++++++++----
 supabase/migrations.lock.json                      |  2 +-
 .../20261107090000_identifiers_and_dq.sql          | 47 +++++++++++------
 3 files changed, 82 insertions(+), 27 deletions(-)

exec
/bin/zsh -lc 'ls -a; for d in . .. ../.. ../../.. ../../../..; do for f in AGENTS.override.md AGENTS.md CLAUDE.md; do if [ -f "$d/$f" ]; then echo ==== $d/$f; cat "$d/$f"; fi; done; done; git show a651281 --; ' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 0ms:
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
zsh:1: === not found

exec
/bin/zsh -lc 'for d in . .. ../.. ../../.. ../../../..; do for f in AGENTS.override.md AGENTS.md CLAUDE.md; do if [ -f "$d/$f" ]; then printf '"'\\n%s\\n' \""'$d/$f"; cat "$d/$f"; fi; done; done; git show a651281 --' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:

../../../AGENTS.md
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-2CetkKMh' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-ldTpNVSH' (errno=Operation not permitted)
commit a65128195623ade890a273d418b2603908eea1b5
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Thu Nov 5 18:03:36 2026 -0800

    fix(entities): locator and provenance_written guards, guarded identifier write, no-key-update issuer lock, lenient rejection
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/entities/identifiers.integration.test.ts b/src/lib/entities/identifiers.integration.test.ts
index 774189f..b1a52a2 100644
--- a/src/lib/entities/identifiers.integration.test.ts
+++ b/src/lib/entities/identifiers.integration.test.ts
@@ -545,7 +545,7 @@ describe.skipIf(!enabled)('plan 3 migration one: resolve_identifier_claim',()=>{
    const id=await newClaim({issuer:c,id_type:'lei',value:randomLei(),op:'set_identifier',target:{issuer_id:c},over:{provenance_written:pw}});
    expect({pw,msg:(await fails(resolve(id,'accepted'))).message}).toEqual({pw,msg:'invalid_claim'});
    expect(await claimState(id)).toMatchObject({status:'pending'});
-   await q(`update public.issuer_identifier_claims set status='rejected',resolved_by=$2,resolved_at=now() where id=$1`,[id,REVIEWER]);
+   await resolve(id,'rejected');
   }
   const ok=await newClaim({issuer:c,id_type:'lei',value:randomLei(),op:'set_identifier',target:{issuer_id:c},over:{provenance_written:{lei:{source:'gleif',as_of:'2026-11-05',evidence_sha256:SHA,row:{exchange:'XNAS'}}}}});
   expect(await resolve(ok,'accepted')).toMatchObject({applied:true});
@@ -574,13 +574,33 @@ describe.skipIf(!enabled)('plan 3 migration one: resolve_identifier_claim',()=>{
   expect(await q(`select count(*)::int n from public.issuer_securities where ticker=$1`,[t2])).toEqual([{n:1}]);
  });
 
+ it('fallback locator needs the character pattern AND the provenance guard: UUID and key: locators are omitted; provenance_written must carry the op key',async()=>{
+  const a=await issuer();
+  for(const locator of ['doc:550e8400-e29b-41d4-a716-446655440000','key:abc']){
+   const lei=randomLei();
+   const id=await newClaim({issuer:a,id_type:'lei',value:lei,op:'set_identifier',target:{issuer_id:a},over:{evidence:{...EVIDENCE,locator}}});
+   const r=await resolve(id,'accepted');
+   expect({locator,r}).toEqual({locator,r:{op:'set_identifier',applied:true,amended:false}});
+   expect((await q(`select provenance->'lei' p from public.issuers where issuer_id=$1`,[a]))[0].p).toEqual({source:'test',as_of:'2026-11-05',evidence_sha256:SHA});
+   await q(`update public.issuers set lei=null,provenance='{}' where issuer_id=$1`,[a]);
+  }
+  const b=await issuer();const t=await ticker();
+  await sec(b,t,'2020-01-01',null);
+  const cases:[string,Promise<string>][]=[
+   ['empty',newClaim({issuer:b,id_type:'lei',value:randomLei(),op:'set_identifier',target:{issuer_id:b},over:{provenance_written:{}}})],
+   ['wrong key',newClaim({issuer:b,id_type:'isin',value:randomIsin(),op:'set_identifier',target:{issuer_id:b,ticker:t,valid_from:'2020-01-01'},over:{provenance_written:{figi:EVIDENCE}}})],
+   ['attach without valid_from',newClaim({issuer:b,id_type:'ticker',value:await ticker(),op:'attach_security',target:{issuer_id:b},params:{share_class:'H',valid_from:'2021-01-01',valid_from_method:'curated',source:'x'},over:{provenance_written:{isin:EVIDENCE}}})],
+  ];
+  for(const [name,idp] of cases){const id=await idp;expect({name,msg:(await fails(resolve(id,'accepted'))).message}).toEqual({name,msg:'invalid_claim'});}
+ });
+
  it('attach_security inserts the open row with its method and provenance; a held ticker is ownership_conflict',async()=>{
   const a=await issuer(),b=await issuer();const t=await ticker();
   const params={share_class:'H',valid_from:'2004-06-16',valid_from_method:'listing_date',source:'gleif_openfigi',isin:randomIsin()};
   const id=await newClaim({issuer:a,id_type:'ticker',value:t,op:'attach_security',target:{issuer_id:a},params,over:{evidence_kind:'name_match'}});
   expect(await resolve(id,'accepted')).toEqual({op:'attach_security',applied:true,amended:false});
   expect(await q(`select issuer_id,share_class,valid_from::text,valid_to,valid_from_method,valid_to_method,source,isin,is_primary,provenance from public.issuer_securities where ticker=$1`,[t])).toEqual([
-   {issuer_id:a,share_class:'H',valid_from:'2004-06-16',valid_to:null,valid_from_method:'listing_date',valid_to_method:null,source:'gleif_openfigi',isin:params.isin,is_primary:false,provenance:{valid_from:EVIDENCE}},
+   {issuer_id:a,share_class:'H',valid_from:'2004-06-16',valid_to:null,valid_from_method:'listing_date',valid_to_method:null,source:'gleif_openfigi',isin:params.isin,is_primary:false,provenance:{valid_from:EVIDENCE,isin:EVIDENCE}},
   ]);
   const held=await newClaim({issuer:b,id_type:'ticker',value:t,op:'attach_security',target:{issuer_id:b},params:{...params,isin:null,valid_from:'2026-01-01'}});
   expect((await fails(resolve(held,'accepted'))).message).toBe('ownership_conflict');
@@ -663,6 +683,9 @@ describe.skipIf(!enabled)('plan 3 migration one: resolve_identifier_claim',()=>{
   expect((await fails(resolve(badDate,'accepted',null,null))).message).toBe('invalid_claim');
   expect((await fails(resolve(randomUUID(),'accepted'))).message).toBe('claim_not_found');
   for(const id of [mismatch,pairing,foreignProv,wrongKey,badDate,extraParam])expect(await claimState(id)).toMatchObject({status:'pending',resolved:false});
+  // rejection is a status flip: even claims that fail claim/1 validation can be cleared through the function
+  for(const id of [mismatch,pairing,foreignProv,wrongKey,badDate,extraParam])expect({id,r:await resolve(id,'rejected')}).toEqual({id,r:{op:expect.any(String),applied:false,amended:false}});
+  for(const id of [mismatch,pairing,foreignProv,wrongKey,badDate,extraParam])expect(await claimState(id)).toMatchObject({status:'rejected',resolved:true});
   // a dissolved issuer cannot take writes, but its claims can still be rejected
   const gone=await issuer();
   const late=await newClaim({issuer:gone,id_type:'lei',value:randomLei(),op:'set_identifier',target:{issuer_id:gone}});
@@ -792,15 +815,21 @@ describe.skipIf(!enabled)('plan 3 migration one: calendar pass functions',()=>{
   });
  },60000);
 
- it('lets exactly one of two concurrent claimers create and lease the pass (advisory lock)',async()=>{
+ it('lets exactly one of two concurrent claimers create and lease the pass: both wait on the advisory lock',async()=>{
   await withCalendarLock(admin,async()=>{
    const i=await issuer();await scopeRow(i);
    const b1=await batch(),b2=await batch();
-   const got=await Promise.all([claimPass(b1),claimPass(b2)]);
-   expect(got.filter(Boolean)).toHaveLength(1);
-   expect(await q(`select count(*)::int n from public.dq_calendar_passes where market=$1 and finished_at is null`,[CAL])).toEqual([{n:1}]);
-   const tok=(got[0]??got[1])!;
-   await drain(tok);await finish(tok);
+   await inTx(admin,async tx=>{
+    await tx.c.query(`select pg_advisory_xact_lock(hashtext('dq_calendar_pass:'||$1))`,[CAL]);
+    const got=Promise.all([claimPass(b1),claimPass(b2)]);
+    await stillBlockedBehind(admin,tx.pid,got);
+    await tx.commit();
+    const res=await got;
+    expect(res.filter(Boolean)).toHaveLength(1);
+    expect(await q(`select count(*)::int n from public.dq_calendar_passes where market=$1 and finished_at is null`,[CAL])).toEqual([{n:1}]);
+    const tok=(res[0]??res[1])!;
+    await drain(tok);await finish(tok);
+   });
   });
  });
 
@@ -987,7 +1016,7 @@ describe.skipIf(!enabled)('plan 3 migration one: row-locked jsonb patches (appen
   const isin=randomIsin();
   await inTx(admin,async tx=>{
    // session A follows resolve_identifier_claim's order: issuer FOR UPDATE first, security row second
-   await tx.c.query(`select 1 from public.issuers where issuer_id=$1 for update`,[a]);
+   await tx.c.query(`select 1 from public.issuers where issuer_id=$1 for no key update`,[a]);
    const second=setId(k,'isin',isin,PI);
    await stillBlockedBehind(admin,tx.pid,second);     // would not block at all if B took the security row first
    await tx.c.query(`update public.issuer_securities set figi=$2 where ticker=$1 and valid_to is null`,[t,'BBG000000001']);
@@ -996,4 +1025,17 @@ describe.skipIf(!enabled)('plan 3 migration one: row-locked jsonb patches (appen
   });
   expect(await secState(t)).toEqual({isin,figi:'BBG000000001',provenance:{exchange:'Nasdaq',...PI}});
  });
+ it('two transactions writing different ISINs to the same empty row: the second returns conflict and the first value stays',async()=>{
+  const a=await issuer();const t=await ticker();const k={issuer:a,ticker:t};
+  await sec(a,t,'2020-01-01',null);
+  const i1=randomIsin(),i2=randomIsin();
+  await inTx(admin,async tx=>{
+   expect(await setId(k,'isin',i1,PI,tx.c)).toBe('written');
+   const second=setId(k,'isin',i2,PI);
+   await stillBlockedBehind(admin,tx.pid,second);
+   await tx.commit();
+   expect(await second).toBe('conflict');
+  });
+  expect((await secState(t)).isin).toBe(i1);
+ });
 });
diff --git a/supabase/migrations.lock.json b/supabase/migrations.lock.json
index 318747b..19af118 100644
--- a/supabase/migrations.lock.json
+++ b/supabase/migrations.lock.json
@@ -203,7 +203,7 @@
     },
     {
       "file": "20261107090000_identifiers_and_dq.sql",
-      "sha256": "552c3b056f3ebcc2ac997a7a2adbfc191632403caff6be56f5f271e95e2b1e2f"
+      "sha256": "b335217d9f253d52f1bab9953a5191c2f07fcc349a32cec1309b441d29800d5e"
     }
   ]
 }
diff --git a/supabase/migrations/20261107090000_identifiers_and_dq.sql b/supabase/migrations/20261107090000_identifiers_and_dq.sql
index 497631f..6464109 100644
--- a/supabase/migrations/20261107090000_identifiers_and_dq.sql
+++ b/supabase/migrations/20261107090000_identifiers_and_dq.sql
@@ -423,15 +423,20 @@ begin
   else
     return 'op';
   end if;
-  if pw is not null and (not public.claim_keys_within(pw, allowed) or not public.claim_provenance_safe(pw)) then return 'provenance_written'; end if;
+  -- provenance_written must carry the op's own provenance key (the one resolve merges), plus only allowed keys.
+  if pw is not null and (not public.claim_keys_within(pw, allowed) or not public.claim_provenance_safe(pw)
+     or (cardinality(allowed) > 0 and not pw ? (case when p_op in ('set_identifier','correct_identifier') then p_id_type when p_op = 'close_security' then 'valid_to' else 'valid_from' end))) then
+    return 'provenance_written';
+  end if;
   return null;
 end $$;
 revoke execute on function public.identifier_claim_problem(text, text, text, uuid, jsonb) from public, anon, authenticated, service_role;
 
 -- ---------------------------------------------------------------- resolve_identifier_claim (§3.1, §4.2.1, §7.1)
--- Locks the claim; refuses non-pending (already_resolved), legacy (legacy_claim) and evidence_only
--- acceptance without an amend (amend_required); validates claim/1 and the stored target_key
--- (invalid_claim); 'rejected' only flips the status. 'accepted' performs the op's business write in
+-- Locks the claim; refuses non-pending (already_resolved) and legacy (legacy_claim, either status)
+-- claims. 'rejected' only flips the status of a non-legacy claim: no claim/1 validation, so a malformed
+-- pending claim can still be cleared. 'accepted' refuses evidence_only without an amend
+-- (amend_required), validates claim/1 and the stored target_key (invalid_claim), then performs the op's business write in
 -- the same transaction with static SQL under a guard that must hit exactly one row of an active
 -- issuer, merges detail.provenance_written (or, absent, the claim's evidence under the op's key) into
 -- the target row's provenance, then records status/resolved_by/resolved_at. Any failure raises and
@@ -467,18 +472,18 @@ begin
   elsif c.op = 'evidence_only' and p_status = 'accepted' then
     raise exception 'amend_required' using errcode = 'P0001';
   end if;
+  if p_status = 'rejected' then
+    -- Rejection never needs a valid detail (spec 3.1): status flip only, so malformed claims can be cleared.
+    update public.issuer_identifier_claims set status = 'rejected', resolved_by = p_resolved_by, resolved_at = clock_timestamp() where id = p_id;
+    return jsonb_build_object('op', c.op, 'applied', false, 'amended', false);
+  end if;
   v_problem := public.identifier_claim_problem(v_op, c.id_type, v_value, c.issuer_id, v_detail);
   if v_problem is not null then raise exception 'invalid_claim' using errcode = '22023', detail = v_problem; end if;
   if c.target_key is distinct from public.identifier_claim_target_key(c.op, c.detail -> 'target') then
     raise exception 'invalid_claim' using errcode = '22023', detail = 'target_key';
   end if;
 
-  if p_status = 'rejected' then
-    update public.issuer_identifier_claims set status = 'rejected', resolved_by = p_resolved_by, resolved_at = clock_timestamp() where id = p_id;
-    return jsonb_build_object('op', c.op, 'applied', false, 'amended', false);
-  end if;
-
-  select status into v_status from public.issuers where issuer_id = c.issuer_id for update;
+  select status into v_status from public.issuers where issuer_id = c.issuer_id for no key update;
   if v_status is distinct from 'active' then raise exception 'issuer_not_active' using errcode = 'P0001'; end if;
   t := v_detail -> 'target'; pa := v_detail -> 'params';
   v_key := case when v_op in ('set_identifier','correct_identifier') then c.id_type when v_op = 'close_security' then 'valid_to' else 'valid_from' end;
@@ -486,10 +491,15 @@ begin
   -- free-form note and any unsafe locator never reach a public column.
   v_ev := v_detail -> 'evidence';
   v_safe := jsonb_build_object('source', v_ev -> 'source', 'as_of', v_ev -> 'as_of', 'evidence_sha256', v_ev -> 'evidence_sha256');
-  if coalesce(v_ev ->> 'locator', '') ~ '^[A-Za-z0-9_.:/ ,=\[\]-]{1,200}$' and v_ev ->> 'locator' !~* '(\?|token|secret|passw|key=)' then
+  if coalesce(v_ev ->> 'locator', '') ~ '^[A-Za-z0-9_.:/ ,=\[\]-]{1,200}$' and v_ev ->> 'locator' !~* '(\?|token|secret|passw|key=)'
+     and public.claim_provenance_safe(to_jsonb(v_ev ->> 'locator')) then
     v_safe := v_safe || jsonb_build_object('locator', v_ev -> 'locator');
   end if;
   v_pw := coalesce(v_detail -> 'provenance_written', jsonb_build_object(v_key, v_safe));
+  -- an attach_security that writes an ISIN records where that ISIN came from
+  if v_op = 'attach_security' and nullif(v_detail -> 'params' ->> 'isin', '') is not null and not v_pw ? 'isin' then
+    v_pw := v_pw || jsonb_build_object('isin', v_safe);
+  end if;
   if not public.claim_provenance_safe(v_pw) then raise exception 'invalid_claim' using errcode = '22023', detail = 'provenance_written'; end if;
 
   begin
@@ -586,7 +596,7 @@ revoke execute on function public.dq_calendar_lock_pass(jsonb) from public, anon
 
 -- U1: creation is serialised per market by a transaction advisory lock. No unfinished pass → create
 -- it, freeze the in-scope active issuers as members, lease it to p_batch. An unfinished pass whose
--- lease is free, expired, or already p_batch's → (re)lease it to p_batch. Otherwise null.
+-- lease is free, expired (claim_until <= now, the same test dq_calendar_lock_pass uses), or already p_batch's → (re)lease it to p_batch. Otherwise null.
 create or replace function public.claim_calendar_pass(p_market text, p_batch uuid)
 returns jsonb language plpgsql security definer set search_path = public as $$
 declare p public.dq_calendar_passes; v_pass uuid;
@@ -605,7 +615,7 @@ begin
     where s.market = p_market and s.priority > 0 and i.status = 'active';
     return jsonb_build_object('market', p_market, 'pass_id', v_pass, 'batch_id', p_batch);
   end if;
-  if p.claimed_by is null or p.claim_until is null or p.claim_until < clock_timestamp() or p.claimed_by = p_batch then
+  if p.claimed_by is null or p.claim_until is null or p.claim_until <= clock_timestamp() or p.claimed_by = p_batch then
     update public.dq_calendar_passes set claimed_by = p_batch, claim_until = clock_timestamp() + interval '10 minutes'
     where market = p.market and pass_id = p.pass_id;
     return jsonb_build_object('market', p_market, 'pass_id', p.pass_id, 'batch_id', p_batch);
@@ -743,7 +753,8 @@ grant execute on function public.patch_quarantine_detail(uuid, text, jsonb) to s
 
 -- ---------------------------------------------------------------- guarded identifier write (plan audit round 3, R2)
 -- set_security_identifier is the only writer of issuer_securities.isin/figi outside resolve_identifier_claim
--- (identifiers/apply.ts, Task 4a). It locks the open row (issuer, ticker, valid_from, valid_to null) and
+-- (identifiers/apply.ts, Task 4a). It share-locks the issuer (resolve_identifier_claim's order: issuer, then
+-- security), locks the open row (issuer, ticker, valid_from, valid_to null) and
 -- in ONE UPDATE writes the column (only when empty) and merges the single provenance key with
 -- `provenance || p_provenance` — never a whole-object replacement — so a concurrent write of the other
 -- column, or a claim resolution (which also merges with ||), keeps its key. p_provenance must carry
@@ -753,7 +764,7 @@ grant execute on function public.patch_quarantine_detail(uuid, text, jsonb) to s
 -- uniqueness / no-overlap violations (23505 / 23P01) pass through unchanged.
 create or replace function public.set_security_identifier(p_issuer uuid, p_ticker text, p_valid_from date, p_column text, p_value text, p_provenance jsonb)
 returns text language plpgsql security definer set search_path = public as $$
-declare v_cur text; v_prov jsonb;
+declare v_cur text; v_prov jsonb; n int;
 begin
   if p_column is null or p_column not in ('isin', 'figi') or coalesce(p_value, '') = ''
      or p_provenance is null or jsonb_typeof(p_provenance) <> 'object'
@@ -772,11 +783,13 @@ begin
   if v_cur = p_value and coalesce(v_prov ? p_column, false) then return 'duplicate'; end if;
   if p_column = 'isin' then
     update public.issuer_securities set isin = p_value, provenance = provenance || p_provenance
-    where issuer_id = p_issuer and ticker = p_ticker and valid_from = p_valid_from and valid_to is null;
+    where issuer_id = p_issuer and ticker = p_ticker and valid_from = p_valid_from and valid_to is null and isin is not distinct from v_cur;
   else
     update public.issuer_securities set figi = p_value, provenance = provenance || p_provenance
-    where issuer_id = p_issuer and ticker = p_ticker and valid_from = p_valid_from and valid_to is null;
+    where issuer_id = p_issuer and ticker = p_ticker and valid_from = p_valid_from and valid_to is null and figi is not distinct from v_cur;
   end if;
+  get diagnostics n = row_count;
+  if n <> 1 then return 'conflict'; end if;   -- the value moved between the read and the write
   return case when v_cur is null then 'written' else 'duplicate' end;
 end $$;
 revoke execute on function public.set_security_identifier(uuid, text, date, text, text, jsonb) from public, anon, authenticated;

exec
/bin/zsh -lc "sed -n '280,575p' supabase/migrations/20261107090000_identifiers_and_dq.sql; sed -n '760,810p' supabase/migrations/20261107090000_identifiers_and_dq.sql; find src supabase -iname '*agents*' -o -name CLAUDE.md; cat package.json" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
create or replace function public.claim_text_is_date(p text) returns boolean
language plpgsql immutable set search_path = public as $$
begin
  if p is null or p !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
  perform p::date;                                   -- rejects 2026-02-30
  return true;
exception when others then return false;
end $$;
revoke execute on function public.claim_text_is_date(text) from public, anon, authenticated, service_role;

create or replace function public.claim_keys_within(p jsonb, p_allowed text[]) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(bool_and(k = any(p_allowed)), true) from jsonb_object_keys(p) k
$$;
revoke execute on function public.claim_keys_within(jsonb, text[]) from public, anon, authenticated, service_role;

create or replace function public.claim_evidence_ok(e jsonb) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(e is not null and jsonb_typeof(e) = 'object'
    and jsonb_typeof(e -> 'source') = 'string' and length(e ->> 'source') between 1 and 64
    and public.claim_text_is_date(e ->> 'as_of')
    and coalesce(e ->> 'evidence_sha256', '') ~ '^[0-9a-f]{64}$'
    and (not (e ? 'locator') or jsonb_typeof(e -> 'locator') = 'string')
    and (not (e ? 'note') or jsonb_typeof(e -> 'note') = 'string'), false)
$$;
revoke execute on function public.claim_evidence_ok(jsonb) from public, anon, authenticated, service_role;

-- Recursive public-provenance guard (mirrors the TS sanitizeProvenance rules): no secret-like keys, no
-- URL query strings / fragments, no key=/token= assignments, no UUIDs, bounded depth and length.
-- Claim evidence may hold private notes; only what passes here may reach a public provenance column.
create or replace function public.claim_provenance_safe(p jsonb, p_depth int default 0) returns boolean
language plpgsql immutable set search_path = public as $$
declare k text; v jsonb; s text;
begin
  if p is null or p_depth > 4 then return false; end if;
  case jsonb_typeof(p)
    when 'object' then
      for k, v in select * from jsonb_each(p) loop
        if k ~* '(secret|token|passw|api[_-]?key|authorization|user_?id|cookie|credential|private)' then return false; end if;
        if not public.claim_provenance_safe(v, p_depth + 1) then return false; end if;
      end loop;
    when 'array' then
      for v in select * from jsonb_array_elements(p) loop
        if not public.claim_provenance_safe(v, p_depth + 1) then return false; end if;
      end loop;
    when 'string' then
      s := p #>> '{}';
      if length(s) > 500 then return false; end if;
      if s ~* '[a-z][a-z0-9+.-]*://[^[:space:]]*[?#]' or s ~ '\?[^[:space:]]*=' then return false; end if;
      if s ~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' then return false; end if;
      if s ~* '(token|secret|passw[a-z]*|api[_-]?key|\mkey)\s*[=:]' then return false; end if;
    else null;
  end case;
  return true;
end $$;
revoke execute on function public.claim_provenance_safe(jsonb, int) from public, anon, authenticated, service_role;

-- target_key = op ':' issuer_id, or op ':' issuer_id '|' ticker '|' valid_from (claims.ts::claimTargetKey).
create or replace function public.identifier_claim_target_key(p_op text, p_target jsonb) returns text
language sql immutable set search_path = public as $$
  select p_op || ':' || case when p_target ? 'ticker'
    then coalesce(p_target ->> 'issuer_id', '') || '|' || coalesce(p_target ->> 'ticker', '') || '|' || coalesce(p_target ->> 'valid_from', '')
    else coalesce(p_target ->> 'issuer_id', '') end
$$;
revoke execute on function public.identifier_claim_target_key(text, jsonb) from public, anon, authenticated, service_role;

-- null when the (op, id_type, value, detail) is a valid claim/1 for issuer p_issuer, else the field at fault.
create or replace function public.identifier_claim_problem(p_op text, p_id_type text, p_value text, p_issuer uuid, p_detail jsonb)
returns text language plpgsql stable set search_path = public as $$
declare t jsonb; pa jsonb; pw jsonb; s jsonb; full_target boolean; allowed text[];
begin
  if p_detail is null or jsonb_typeof(p_detail) <> 'object' or p_detail ->> 'schema' is distinct from 'claim/1' then return 'schema'; end if;
  if coalesce(p_detail ->> 'evidence_kind', '') not in ('hard_identifier','official_list','name_match','filing_form','provider_mapping') then return 'evidence_kind'; end if;
  t := p_detail -> 'target'; pa := p_detail -> 'params'; pw := p_detail -> 'provenance_written';
  if t is null or jsonb_typeof(t) <> 'object' or t ->> 'issuer_id' is distinct from p_issuer::text then return 'target.issuer_id'; end if;
  if pa is null or jsonb_typeof(pa) <> 'object' then return 'params'; end if;
  if not public.claim_evidence_ok(p_detail -> 'evidence') then return 'evidence'; end if;
  if jsonb_typeof(p_detail -> 'sources') is distinct from 'array' then return 'sources'; end if;
  for s in select x from jsonb_array_elements(p_detail -> 'sources') x loop
    if not public.claim_evidence_ok(s) then return 'sources'; end if;
  end loop;
  if pw is not null and jsonb_typeof(pw) <> 'object' then return 'provenance_written'; end if;
  full_target := t ? 'ticker' or t ? 'valid_from';
  if full_target then
    if jsonb_typeof(t -> 'ticker') is distinct from 'string' or length(t ->> 'ticker') not between 1 and 32
       or not public.claim_text_is_date(t ->> 'valid_from')
       or not public.claim_keys_within(t, array['issuer_id','ticker','valid_from']) then return 'target'; end if;
  elsif not public.claim_keys_within(t, array['issuer_id']) then
    return 'target';
  end if;
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
      insert into public.issuer_securities(issuer_id, ticker, isin, share_class, is_primary, valid_from, valid_to, valid_from_method, valid_to_method, source, provenance)
      values (c.issuer_id, v_ticker, nullif(pa ->> 'isin', ''), pa ->> 'share_class', false, (pa ->> 'valid_from')::date, null, pa ->> 'valid_from_method', null, pa ->> 'source', v_pw);
    elsif v_op = 'close_security' then
      update public.issuer_securities set valid_to = (pa ->> 'valid_to')::date, valid_to_method = pa ->> 'valid_to_method', provenance = provenance || v_pw
      where issuer_id = c.issuer_id and ticker = t ->> 'ticker' and valid_from = (t ->> 'valid_from')::date and valid_to is null;
    elsif v_op = 'backdate_window' then
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
      end if;
      raise exception 'ownership_conflict' using errcode = 'P0001';
    when check_violation or foreign_key_violation or invalid_text_representation or not_null_violation then
      raise exception 'invalid_claim' using errcode = '22023';
  end;
  if n <> 1 then
    if v_op = 'close_security' then raise exception 'already_closed' using errcode = 'P0001'; end if;
    raise exception 'value_conflict' using errcode = 'P0001';
  end if;
  update public.issuer_identifier_claims
  set status = 'accepted', op = v_op, value = v_value, detail = v_detail,
      target_key = public.identifier_claim_target_key(v_op, v_detail -> 'target'),
      resolved_by = p_resolved_by, resolved_at = clock_timestamp()
  where id = p_id;
  return jsonb_build_object('op', v_op, 'applied', true, 'amended', v_amended);
end $$;
revoke execute on function public.resolve_identifier_claim(uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.resolve_identifier_claim(uuid, text, uuid, jsonb) to service_role;

-- ---------------------------------------------------------------- calendar passes (§3.1, §6.2, T3/U1)
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
/bin/zsh -lc "rg -n 'provenance_written|evidence_only' src/lib/entities/claims.ts; sed -n '1,245p' src/lib/entities/claims.ts; sed -n '1,150p' src/lib/entities/identifiers.integration.test.ts; rg -n 'stillBlockedBehind|withCalendarLock' src/lib/entities/identifiers.integration.test.ts" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
// Pending issuer_identifier_claims: the review queue for identifiers that contradict stored data.
import {randomUUID} from 'node:crypto';
import {TableError} from '../db/table-client';
import type {TableClient} from '../db/table-client';
import type {ClaimIdType} from './types';

/** Unique (23505) or exclusion (23P01) violation, i.e. another row already holds the key. */
export const isUnique=(e:unknown)=>e instanceof TableError&&(e.code==='23505'||e.code==='23P01');

export interface ClaimInput{issuer_id:string;id_type:ClaimIdType;value:string;source:string}

/**
 * Files a pending claim unless an identical one is already pending. Retry-safe: the partial
 * unique index (issuer_id,id_type,value) where status='pending' turns a concurrent duplicate
 * into 23505, which is a no-op here. Returns whether a new claim row was written.
 */
export async function fileClaim(client:TableClient,c:ClaimInput):Promise<boolean>{
 const pending={issuer_id:c.issuer_id,id_type:c.id_type,value:c.value,status:'pending'};
 if(await client.count('issuer_identifier_claims',pending)>0)return false;
 try{
  await client.insert('issuer_identifier_claims',{id:randomUUID(),...c,confidence:0.5,status:'pending',created_at:new Date().toISOString()});
  return true;
 }catch(e){if(isUnique(e))return false;throw e;}
}
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
   await c.query(`begin; set local lock_timeout='3s';\n${sql}\n;commit;`);
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
}

let admin:Pool;
let adminUrl:string;
const q=async(text:string,values:unknown[]=[])=>(await admin.query(text,values)).rows as Record<string,any>[];
const insertRow=(table:string,row:Record<string,unknown>)=>{
 const cols=Object.keys(row);
 return admin.query(`insert into public.${table}(${cols.join(',')}) values(${cols.map((_,i)=>`$${i+1}`).join(',')})`,Object.values(row));
};
const issuer=async(name='ZZ Ident Test')=>{const id=randomUUID();await q(`insert into public.issuers(issuer_id,canonical_name_en) values($1,$2)`,[id,name]);return id;};
const ticker=async(market='US')=>{
 const t='ZZ'+hex(4);
 const r=await q(`insert into public.stocks_universe(ticker,name,market) values($1,'Ident Test',$2) on conflict (ticker) do nothing returning ticker`,[t,market]);
 if(r.length!==1)throw new Error('ZZ test ticker collided');
 return t;
};
const batch=async(dataset='dq.calendar.cn',producer='filing-calendar')=>{const id=randomUUID();await q(`insert into public.ingest_batches(batch_id,producer,dataset) values($1,$2,$3)`,[id,producer,dataset]);return id;};
/** issuer_securities row with source 'test' (so the default method is first_observed) plus `extra` columns. */
const sec=(iss:string,t:string,from:string,to:string|null,extra:Record<string,unknown>={})=>insertRow('issuer_securities',{issuer_id:iss,ticker:t,valid_from:from,valid_to:to,source:'test',...extra});

beforeAll(async()=>{
 if(!enabled)return;
 adminUrl=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8')).adminUrl;
 admin=new Pool({connectionString:adminUrl});
});
afterAll(async()=>{await admin?.end();});

describe.skipIf(!enabled)('plan 3 migration one: schema',()=>{
 it('adds the columns, creates seven service-role-only tables and the reconcile-raw bucket, and replays twice',async()=>{
  const cols=await q(`select table_name,column_name from information_schema.columns where table_schema='public' and (table_name,column_name) in (
   ('issuer_securities','valid_from_method'),('issuer_securities','valid_to_method'),
   ('issuer_identifier_claims','op'),('issuer_identifier_claims','target_key'),('issuer_identifier_claims','detail'),('issuer_identifier_claims','resolved_by'),('issuer_identifier_claims','resolved_at'),
   ('dq_reconciliations','pair'),('dq_reconciliations','kind'),('dq_reconciliations','outcome'),('dq_reconciliations','detail'),
   ('dq_reconciliations','cycle_id'),('dq_reconciliations','issuer_id'),('dq_reconciliations','market'),('dq_reconciliations','attempt'))`);
  expect(cols).toHaveLength(15);
  expect(await q(`select is_nullable from information_schema.columns where table_schema='public' and table_name='issuer_identifier_claims' and column_name='confidence'`)).toEqual([{is_nullable:'YES'}]);
  const rls=await q(`select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1) order by c.relname`,[NEW_TABLES]);
  expect(rls).toEqual([...NEW_TABLES].sort().map(relname=>({relname,relrowsecurity:true})));
  expect(await q(`select tablename from pg_policies where schemaname='public' and tablename=any($1)`,[NEW_TABLES])).toEqual([]);
  for(const role of ['anon','authenticated'])for(const t of [...NEW_TABLES,'issuer_identifier_claims'])for(const priv of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']){
   const ok=(await q(`select has_table_privilege($1,'public.'||$2,$3) ok`,[role,t,priv]))[0].ok;
   expect({role,t,priv,ok}).toEqual({role,t,priv,ok:false});
  }
  const SERVICE:Record<string,string[]>={
   dq_reconcile_cycles:['SELECT','INSERT','UPDATE'],dq_reconcile_cursor:['SELECT','INSERT'],
   dq_calendar_passes:['SELECT'],dq_calendar_pass_members:['SELECT'],dq_filing_expectations:['SELECT'],
   issuer_filer_categories:['SELECT','INSERT','UPDATE','DELETE'],issuer_filing_profiles:['SELECT','INSERT','UPDATE','DELETE'],
  };
  for(const [t,granted] of Object.entries(SERVICE))for(const priv of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']){
   const ok=(await q(`select has_table_privilege('service_role','public.'||$1,$2) ok`,[t,priv]))[0].ok;
   expect({t,priv,ok}).toEqual({t,priv,ok:granted.includes(priv)});
  }
  const c=await admin.connect();
  try{
   await c.query('set role anon');
   await expect(c.query('select * from public.dq_filing_expectations')).rejects.toThrow(/permission denied/);
  }finally{await c.query('reset role').catch(()=>{});c.release();}
  expect(await q(`select id,public,file_size_limit::text limit_bytes,allowed_mime_types from storage.buckets where id='reconcile-raw'`)).toEqual([{
   id:'reconcile-raw',public:false,limit_bytes:'52428800',
   allowed_mime_types:['application/json','text/html','application/pdf','text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/zip'],
9:// every test that touches them runs inside withCalendarLock, a session advisory lock shared with
80:async function withCalendarLock(pool:Pool,body:()=>Promise<void>):Promise<void>{
320:  await withCalendarLock(admin,async()=>{
460:async function stillBlockedBehind(pool:Pool,pid:number,p:Promise<unknown>):Promise<void>{
703:   await stillBlockedBehind(admin,tx.pid,second);
798:  await withCalendarLock(admin,async()=>{
819:  await withCalendarLock(admin,async()=>{
825:    await stillBlockedBehind(admin,tx.pid,got);
837:  await withCalendarLock(admin,async()=>{
869:  await withCalendarLock(admin,async()=>{
891:  await withCalendarLock(admin,async()=>{
937:   await stillBlockedBehind(admin,tx.pid,second);
952:   await stillBlockedBehind(admin,tx.pid,hook);
990:   await stillBlockedBehind(admin,tx.pid,second);
1006:    await stillBlockedBehind(admin,tx.pid,second);
1021:   await stillBlockedBehind(admin,tx.pid,second);     // would not block at all if B took the security row first
1035:   await stillBlockedBehind(admin,tx.pid,second);

codex
No actionable regressions were identified in the commit. The validation, provenance, rejection, and locking changes are consistent with the surrounding implementation; database integration tests were inspected but not executed.
No actionable regressions were identified in the commit. The validation, provenance, rejection, and locking changes are consistent with the surrounding implementation; database integration tests were inspected but not executed.

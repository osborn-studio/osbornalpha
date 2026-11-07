OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1ae93-576c-7641-850e-5650701098a6
--------
user
commit 8c18dde
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 8c18dde; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 588ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-419WzLRO' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-xHgs3ZRv' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-l8kUWJeD' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-nMGEBWQj' (errno=Operation not permitted)
8c18dde fix(entities): keep private claim evidence out of public provenance, lock issuer before security row, explicit attach_security ticker
 src/lib/entities/identifiers.integration.test.ts   | 65 +++++++++++++++++++++-
 supabase/migrations.lock.json                      |  2 +-
 .../20261107090000_identifiers_and_dq.sql          | 60 ++++++++++++++++++--
 3 files changed, 119 insertions(+), 8 deletions(-)

exec
/bin/zsh -lc 'pwd; for d in . .. ../.. ../../.. ../../../..; do ls "$d"/AGENTS* "$d"/CLAUDE.md 2>/dev/null; done; git show 8c18dde --; ls -a | head -35' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
zsh:1: no matches found: ./AGENTS*
zsh:1: no matches found: ../AGENTS*
zsh:1: no matches found: ../../AGENTS*
../../../AGENTS.md
zsh:1: no matches found: ../../../../AGENTS*
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-9zdR8JVS' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-tOtX6Zhi' (errno=Operation not permitted)
commit 8c18dde71dde6dfe992ed607e0c56931532000b9
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Thu Nov 5 17:57:19 2026 -0800

    fix(entities): keep private claim evidence out of public provenance, lock issuer before security row, explicit attach_security ticker
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/entities/identifiers.integration.test.ts b/src/lib/entities/identifiers.integration.test.ts
index 79d0046..774189f 100644
--- a/src/lib/entities/identifiers.integration.test.ts
+++ b/src/lib/entities/identifiers.integration.test.ts
@@ -526,6 +526,54 @@ describe.skipIf(!enabled)('plan 3 migration one: resolve_identifier_claim',()=>{
   expect((await fails(resolve(ghost,'accepted'))).message).toBe('value_conflict');
  });
 
+ it('never copies private evidence into public provenance: note and unsafe locators are dropped, unsafe provenance_written is invalid_claim',async()=>{
+  const a=await issuer(),b=await issuer();
+  const priv={...EVIDENCE,note:'private reviewer note, contact bob',locator:'https://x.example/doc?token=abc123'};
+  const l1=randomLei();
+  await resolve(await newClaim({issuer:a,id_type:'lei',value:l1,op:'set_identifier',target:{issuer_id:a},over:{evidence:priv}}),'accepted');
+  const prov=(await q(`select provenance->'lei' p from public.issuers where issuer_id=$1`,[a]))[0].p;
+  expect(prov).toEqual({source:'test',as_of:'2026-11-05',evidence_sha256:SHA});
+  expect(JSON.stringify(prov)).not.toMatch(/private|token|example/);
+  // a safe locator is kept, a note is still dropped
+  const l2=randomLei();
+  await resolve(await newClaim({issuer:b,id_type:'lei',value:l2,op:'set_identifier',target:{issuer_id:b},over:{evidence:{...EVIDENCE,note:'secret note',locator:'row:1,col=B'}}}),'accepted');
+  expect((await q(`select provenance->'lei' p from public.issuers where issuer_id=$1`,[b]))[0].p).toEqual({source:'test',as_of:'2026-11-05',evidence_sha256:SHA,locator:'row:1,col=B'});
+  // provenance_written is validated recursively
+  const c=await issuer();
+  const bad=[{lei:{source:'x',nested:{api_key:'k'}}},{lei:{source:'x',url:'https://x.example/a?b=1'}},{lei:{source:'x',who:randomUUID()}},{lei:{source:'x',list:[{password:'p'}]}},{lei:{source:'x',s:'token=abc'}}];
+  for(const pw of bad){
+   const id=await newClaim({issuer:c,id_type:'lei',value:randomLei(),op:'set_identifier',target:{issuer_id:c},over:{provenance_written:pw}});
+   expect({pw,msg:(await fails(resolve(id,'accepted'))).message}).toEqual({pw,msg:'invalid_claim'});
+   expect(await claimState(id)).toMatchObject({status:'pending'});
+   await q(`update public.issuer_identifier_claims set status='rejected',resolved_by=$2,resolved_at=now() where id=$1`,[id,REVIEWER]);
+  }
+  const ok=await newClaim({issuer:c,id_type:'lei',value:randomLei(),op:'set_identifier',target:{issuer_id:c},over:{provenance_written:{lei:{source:'gleif',as_of:'2026-11-05',evidence_sha256:SHA,row:{exchange:'XNAS'}}}}});
+  expect(await resolve(ok,'accepted')).toMatchObject({applied:true});
+ });
+
+ it('attach_security takes params.ticker; an accession-valued evidence_only claim amended to attach_security inserts that ticker and keeps the accession',async()=>{
+  const a=await issuer();const t=await ticker();
+  const accession='0001234567-26-000002';
+  const evParams={suggested_op:'attach_security',accession,form:'8-A12B',filing_date:'2026-02-20'};
+  const mk=()=>newClaim({issuer:a,id_type:'ticker',value:accession,op:'evidence_only',target:{issuer_id:a},params:evParams,over:{evidence_kind:'filing_form'}});
+  const attach=(over:Record<string,unknown>)=>({op:'attach_security',target:{issuer_id:a},params:{share_class:'common',valid_from:'2026-02-20',valid_from_method:'listing_date',source:'sec_8a',...over}});
+  // no usable ticker: the accession is not a universe ticker; an unknown or malformed params.ticker is refused
+  const first=await mk();
+  expect((await fails(resolve(first,'accepted',attach({})))).message).toBe('invalid_claim');
+  expect((await fails(resolve(first,'accepted',attach({ticker:'ZZNOSUCH'})))).message).toBe('invalid_claim');
+  expect((await fails(resolve(first,'accepted',attach({ticker:'zz bad'})))).message).toBe('invalid_claim');
+  expect(await claimState(first)).toMatchObject({status:'pending',op:'evidence_only'});
+  expect(await resolve(first,'accepted',attach({ticker:t}))).toEqual({op:'attach_security',applied:true,amended:true});
+  expect(await q(`select issuer_id,valid_from::text,valid_from_method from public.issuer_securities where ticker=$1`,[t])).toEqual([{issuer_id:a,valid_from:'2026-02-20',valid_from_method:'listing_date'}]);
+  const row=(await q(`select op,value,detail from public.issuer_identifier_claims where id=$1`,[first]))[0];
+  expect(row).toMatchObject({op:'attach_security',value:accession});
+  expect(row.detail).toMatchObject({original_op:'evidence_only',original_params:evParams,params:{ticker:t}});
+  // a direct attach_security claim without params.ticker still uses the claim value
+  const t2=await ticker();
+  expect(await resolve(await newClaim({issuer:a,id_type:'ticker',value:t2,op:'attach_security',target:{issuer_id:a},params:{share_class:'H',valid_from:'2026-01-01',valid_from_method:'curated',source:'x'}}),'accepted')).toMatchObject({applied:true});
+  expect(await q(`select count(*)::int n from public.issuer_securities where ticker=$1`,[t2])).toEqual([{n:1}]);
+ });
+
  it('attach_security inserts the open row with its method and provenance; a held ticker is ownership_conflict',async()=>{
   const a=await issuer(),b=await issuer();const t=await ticker();
   const params={share_class:'H',valid_from:'2004-06-16',valid_from_method:'listing_date',source:'gleif_openfigi',isin:randomIsin()};
@@ -639,7 +687,7 @@ describe.skipIf(!enabled)('plan 3 migration one: resolve_identifier_claim',()=>{
  it('grants the functions to service_role only, keeps the helpers private and has one replace_filing_expectations signature',async()=>{
   const FNS=['public.resolve_identifier_claim(uuid,text,uuid,jsonb)','public.replace_filing_expectations(uuid,text,jsonb,jsonb)','public.claim_calendar_pass(text,uuid)','public.fail_calendar_member(jsonb,uuid,text)','public.finish_calendar_pass(jsonb)',
    'public.append_claim_evidence(uuid,text,text,text,text,jsonb)','public.patch_quarantine_detail(uuid,text,jsonb)','public.set_security_identifier(uuid,text,date,text,text,jsonb)'];
-  const HELPERS=['public.claim_text_is_date(text)','public.claim_keys_within(jsonb,text[])','public.claim_evidence_ok(jsonb)','public.identifier_claim_target_key(text,jsonb)','public.identifier_claim_problem(text,text,text,uuid,jsonb)','public.dq_calendar_lock_pass(jsonb)'];
+  const HELPERS=['public.claim_text_is_date(text)','public.claim_keys_within(jsonb,text[])','public.claim_evidence_ok(jsonb)','public.identifier_claim_target_key(text,jsonb)','public.identifier_claim_problem(text,text,text,uuid,jsonb)','public.dq_calendar_lock_pass(jsonb)','public.claim_provenance_safe(jsonb,integer)'];
   for(const fn of [...FNS,...HELPERS])for(const role of ['anon','authenticated','service_role']){
    const ok=(await q(`select has_function_privilege($1,$2,'EXECUTE') ok`,[role,fn]))[0].ok;
    expect({fn,role,ok}).toEqual({fn,role,ok:role==='service_role'&&FNS.includes(fn)});
@@ -933,4 +981,19 @@ describe.skipIf(!enabled)('plan 3 migration one: row-locked jsonb patches (appen
    expect(await secState(t)).toEqual({isin,figi,provenance:{exchange:'Nasdaq',...PI,figi:EVIDENCE}});
   }
  });
+ it('set_security_identifier locks the issuer before the security row: it waits behind an issuer lock held by a claim-resolution-order writer, with no deadlock',async()=>{
+  const a=await issuer();const t=await ticker();const k={issuer:a,ticker:t};
+  await sec(a,t,'2020-01-01',null,{provenance:JSON.stringify({exchange:'Nasdaq'})});
+  const isin=randomIsin();
+  await inTx(admin,async tx=>{
+   // session A follows resolve_identifier_claim's order: issuer FOR UPDATE first, security row second
+   await tx.c.query(`select 1 from public.issuers where issuer_id=$1 for update`,[a]);
+   const second=setId(k,'isin',isin,PI);
+   await stillBlockedBehind(admin,tx.pid,second);     // would not block at all if B took the security row first
+   await tx.c.query(`update public.issuer_securities set figi=$2 where ticker=$1 and valid_to is null`,[t,'BBG000000001']);
+   await tx.commit();
+   expect(await second).toBe('written');
+  });
+  expect(await secState(t)).toEqual({isin,figi:'BBG000000001',provenance:{exchange:'Nasdaq',...PI}});
+ });
 });
diff --git a/supabase/migrations.lock.json b/supabase/migrations.lock.json
index 15e5e2e..318747b 100644
--- a/supabase/migrations.lock.json
+++ b/supabase/migrations.lock.json
@@ -203,7 +203,7 @@
     },
     {
       "file": "20261107090000_identifiers_and_dq.sql",
-      "sha256": "9a5b707394b6aee88c69e09930c33026ea7248f57005b5c58d63a583ca904e72"
+      "sha256": "552c3b056f3ebcc2ac997a7a2adbfc191632403caff6be56f5f271e95e2b1e2f"
     }
   ]
 }
diff --git a/supabase/migrations/20261107090000_identifiers_and_dq.sql b/supabase/migrations/20261107090000_identifiers_and_dq.sql
index 668484a..497631f 100644
--- a/supabase/migrations/20261107090000_identifiers_and_dq.sql
+++ b/supabase/migrations/20261107090000_identifiers_and_dq.sql
@@ -304,6 +304,36 @@ language sql immutable set search_path = public as $$
 $$;
 revoke execute on function public.claim_evidence_ok(jsonb) from public, anon, authenticated, service_role;
 
+-- Recursive public-provenance guard (mirrors the TS sanitizeProvenance rules): no secret-like keys, no
+-- URL query strings / fragments, no key=/token= assignments, no UUIDs, bounded depth and length.
+-- Claim evidence may hold private notes; only what passes here may reach a public provenance column.
+create or replace function public.claim_provenance_safe(p jsonb, p_depth int default 0) returns boolean
+language plpgsql immutable set search_path = public as $$
+declare k text; v jsonb; s text;
+begin
+  if p is null or p_depth > 4 then return false; end if;
+  case jsonb_typeof(p)
+    when 'object' then
+      for k, v in select * from jsonb_each(p) loop
+        if k ~* '(secret|token|passw|api[_-]?key|authorization|user_?id|cookie|credential|private)' then return false; end if;
+        if not public.claim_provenance_safe(v, p_depth + 1) then return false; end if;
+      end loop;
+    when 'array' then
+      for v in select * from jsonb_array_elements(p) loop
+        if not public.claim_provenance_safe(v, p_depth + 1) then return false; end if;
+      end loop;
+    when 'string' then
+      s := p #>> '{}';
+      if length(s) > 500 then return false; end if;
+      if s ~* '[a-z][a-z0-9+.-]*://[^[:space:]]*[?#]' or s ~ '\?[^[:space:]]*=' then return false; end if;
+      if s ~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' then return false; end if;
+      if s ~* '(token|secret|passw[a-z]*|api[_-]?key|\mkey)\s*[=:]' then return false; end if;
+    else null;
+  end case;
+  return true;
+end $$;
+revoke execute on function public.claim_provenance_safe(jsonb, int) from public, anon, authenticated, service_role;
+
 -- target_key = op ':' issuer_id, or op ':' issuer_id '|' ticker '|' valid_from (claims.ts::claimTargetKey).
 create or replace function public.identifier_claim_target_key(p_op text, p_target jsonb) returns text
 language sql immutable set search_path = public as $$
@@ -359,12 +389,15 @@ begin
     allowed := array[p_id_type];
   elsif p_op = 'attach_security' then
     if p_id_type <> 'ticker' or full_target then return 'op_id_type'; end if;
-    if not public.claim_keys_within(pa, array['share_class','valid_from','valid_from_method','source','isin','note'])
+    if not public.claim_keys_within(pa, array['share_class','valid_from','valid_from_method','source','isin','note','ticker'])
        or coalesce(pa ->> 'share_class', '') not in ('A','H','ADR','common','preferred','other','unknown')
        or not public.claim_text_is_date(pa ->> 'valid_from')
        or coalesce(pa ->> 'valid_from_method', '') not in ('first_observed','listing_date','ticker_change','curated')
        or jsonb_typeof(pa -> 'source') is distinct from 'string' or length(pa ->> 'source') not between 1 and 64
-       or (pa ? 'isin' and coalesce(jsonb_typeof(pa -> 'isin'), '') not in ('string','null')) then return 'params'; end if;
+       or (pa ? 'isin' and coalesce(jsonb_typeof(pa -> 'isin'), '') not in ('string','null'))
+       or (pa ? 'ticker' and (jsonb_typeof(pa -> 'ticker') is distinct from 'string' or (pa ->> 'ticker') !~ '^[A-Z0-9][A-Z0-9.-]{0,31}$')) then return 'params'; end if;
+    -- the inserted ticker is params.ticker, else the claim value (which an evidence_only amendment leaves as the accession)
+    if not (pa ? 'ticker') and p_value !~ '^[A-Z0-9][A-Z0-9.-]{0,31}$' then return 'params.ticker'; end if;
     if jsonb_typeof(pa -> 'isin') = 'string' and (pa ->> 'isin') !~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$' then return 'params'; end if;
     allowed := array['isin','figi','valid_from'];
   elsif p_op in ('close_security','backdate_window') then
@@ -390,7 +423,7 @@ begin
   else
     return 'op';
   end if;
-  if pw is not null and not public.claim_keys_within(pw, allowed) then return 'provenance_written'; end if;
+  if pw is not null and (not public.claim_keys_within(pw, allowed) or not public.claim_provenance_safe(pw)) then return 'provenance_written'; end if;
   return null;
 end $$;
 revoke execute on function public.identifier_claim_problem(text, text, text, uuid, jsonb) from public, anon, authenticated, service_role;
@@ -408,7 +441,7 @@ returns jsonb language plpgsql security definer set search_path = public as $$
 declare
   c public.issuer_identifier_claims;
   v_op text; v_value text; v_detail jsonb; v_amended boolean := false; v_problem text;
-  t jsonb; pa jsonb; v_pw jsonb; v_key text; v_status text; n int;
+  t jsonb; pa jsonb; v_pw jsonb; v_key text; v_status text; n int; v_ev jsonb; v_safe jsonb; v_ticker text;
 begin
   if p_status is null or p_status not in ('accepted','rejected') or p_resolved_by is null then
     raise exception 'invalid_claim' using errcode = '22023';
@@ -449,7 +482,15 @@ begin
   if v_status is distinct from 'active' then raise exception 'issuer_not_active' using errcode = 'P0001'; end if;
   t := v_detail -> 'target'; pa := v_detail -> 'params';
   v_key := case when v_op in ('set_identifier','correct_identifier') then c.id_type when v_op = 'close_security' then 'valid_to' else 'valid_from' end;
-  v_pw := coalesce(v_detail -> 'provenance_written', jsonb_build_object(v_key, v_detail -> 'evidence'));
+  -- Fallback provenance carries only source / as_of / evidence_sha256 (+ a safe locator): the claim's
+  -- free-form note and any unsafe locator never reach a public column.
+  v_ev := v_detail -> 'evidence';
+  v_safe := jsonb_build_object('source', v_ev -> 'source', 'as_of', v_ev -> 'as_of', 'evidence_sha256', v_ev -> 'evidence_sha256');
+  if coalesce(v_ev ->> 'locator', '') ~ '^[A-Za-z0-9_.:/ ,=\[\]-]{1,200}$' and v_ev ->> 'locator' !~* '(\?|token|secret|passw|key=)' then
+    v_safe := v_safe || jsonb_build_object('locator', v_ev -> 'locator');
+  end if;
+  v_pw := coalesce(v_detail -> 'provenance_written', jsonb_build_object(v_key, v_safe));
+  if not public.claim_provenance_safe(v_pw) then raise exception 'invalid_claim' using errcode = '22023', detail = 'provenance_written'; end if;
 
   begin
     if v_op = 'set_identifier' and c.id_type = 'lei' then
@@ -481,8 +522,12 @@ begin
       update public.issuer_securities set figi = v_value, provenance = provenance || v_pw
       where issuer_id = c.issuer_id and ticker = t ->> 'ticker' and valid_from = (t ->> 'valid_from')::date and figi = pa ->> 'expected_current';
     elsif v_op = 'attach_security' then
+      v_ticker := coalesce(pa ->> 'ticker', v_value);
+      if not exists (select 1 from public.stocks_universe where ticker = v_ticker) then
+        raise exception 'invalid_claim' using errcode = '22023', detail = 'params.ticker';
+      end if;
       insert into public.issuer_securities(issuer_id, ticker, isin, share_class, is_primary, valid_from, valid_to, valid_from_method, valid_to_method, source, provenance)
-      values (c.issuer_id, v_value, nullif(pa ->> 'isin', ''), pa ->> 'share_class', false, (pa ->> 'valid_from')::date, null, pa ->> 'valid_from_method', null, pa ->> 'source', v_pw);
+      values (c.issuer_id, v_ticker, nullif(pa ->> 'isin', ''), pa ->> 'share_class', false, (pa ->> 'valid_from')::date, null, pa ->> 'valid_from_method', null, pa ->> 'source', v_pw);
     elsif v_op = 'close_security' then
       update public.issuer_securities set valid_to = (pa ->> 'valid_to')::date, valid_to_method = pa ->> 'valid_to_method', provenance = provenance || v_pw
       where issuer_id = c.issuer_id and ticker = t ->> 'ticker' and valid_from = (t ->> 'valid_from')::date and valid_to is null;
@@ -715,6 +760,9 @@ begin
      or (select array_agg(k) from jsonb_object_keys(p_provenance) k) is distinct from array[p_column] then
     raise exception 'invalid_identifier_write' using errcode = '22023';
   end if;
+  -- Same order as resolve_identifier_claim (issuer, then security row): FOR SHARE conflicts with its FOR UPDATE.
+  perform 1 from public.issuers where issuer_id = p_issuer for share;
+  if not found then return 'not_found'; end if;
   select case when p_column = 'isin' then s.isin else s.figi end, s.provenance into v_cur, v_prov
   from public.issuer_securities s
   where s.issuer_id = p_issuer and s.ticker = p_ticker and s.valid_from = p_valid_from and s.valid_to is null
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

exec
/bin/zsh -lc "cat ../../../AGENTS.md; find src supabase -name 'AGENTS*' -o -name CLAUDE.md; sed -n '330,580p' supabase/migrations/20261107090000_identifiers_and_dq.sql; rg -n 'attach_security|sanitizeProvenance' src/lib/entities" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>      if s ~* '(token|secret|passw[a-z]*|api[_-]?key|\mkey)\s*[=:]' then return false; end if;
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
  if pw is not null and (not public.claim_keys_within(pw, allowed) or not public.claim_provenance_safe(pw)) then return 'provenance_written'; end if;
  return null;
end $$;
revoke execute on function public.identifier_claim_problem(text, text, text, uuid, jsonb) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------- resolve_identifier_claim (§3.1, §4.2.1, §7.1)
-- Locks the claim; refuses non-pending (already_resolved), legacy (legacy_claim) and evidence_only
-- acceptance without an amend (amend_required); validates claim/1 and the stored target_key
-- (invalid_claim); 'rejected' only flips the status. 'accepted' performs the op's business write in
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
  v_problem := public.identifier_claim_problem(v_op, c.id_type, v_value, c.issuer_id, v_detail);
  if v_problem is not null then raise exception 'invalid_claim' using errcode = '22023', detail = v_problem; end if;
  if c.target_key is distinct from public.identifier_claim_target_key(c.op, c.detail -> 'target') then
    raise exception 'invalid_claim' using errcode = '22023', detail = 'target_key';
  end if;

  if p_status = 'rejected' then
    update public.issuer_identifier_claims set status = 'rejected', resolved_by = p_resolved_by, resolved_at = clock_timestamp() where id = p_id;
    return jsonb_build_object('op', c.op, 'applied', false, 'amended', false);
  end if;

  select status into v_status from public.issuers where issuer_id = c.issuer_id for update;
  if v_status is distinct from 'active' then raise exception 'issuer_not_active' using errcode = 'P0001'; end if;
  t := v_detail -> 'target'; pa := v_detail -> 'params';
  v_key := case when v_op in ('set_identifier','correct_identifier') then c.id_type when v_op = 'close_security' then 'valid_to' else 'valid_from' end;
  -- Fallback provenance carries only source / as_of / evidence_sha256 (+ a safe locator): the claim's
  -- free-form note and any unsafe locator never reach a public column.
  v_ev := v_detail -> 'evidence';
  v_safe := jsonb_build_object('source', v_ev -> 'source', 'as_of', v_ev -> 'as_of', 'evidence_sha256', v_ev -> 'evidence_sha256');
  if coalesce(v_ev ->> 'locator', '') ~ '^[A-Za-z0-9_.:/ ,=\[\]-]{1,200}$' and v_ev ->> 'locator' !~* '(\?|token|secret|passw|key=)' then
    v_safe := v_safe || jsonb_build_object('locator', v_ev -> 'locator');
  end if;
  v_pw := coalesce(v_detail -> 'provenance_written', jsonb_build_object(v_key, v_safe));
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
-- The pass token {market, pass_id, batch_id} fences every pass write: the pass row is locked and must
-- be leased to token.batch_id, unexpired and unfinished, else fence_failed with no write.
create or replace function public.dq_calendar_lock_pass(p_token jsonb) returns public.dq_calendar_passes
language plpgsql set search_path = public as $$
declare p public.dq_calendar_passes;
begin
  if p_token is null or jsonb_typeof(p_token) <> 'object'
     or coalesce(p_token ->> 'market', '') not in ('US','CN')
     or coalesce(p_token ->> 'pass_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or coalesce(p_token ->> 'batch_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'fence_failed' using errcode = 'P0001';
  end if;
  select * into p from public.dq_calendar_passes where market = p_token ->> 'market' and pass_id = (p_token ->> 'pass_id')::uuid for update;
  if not found or p.claimed_by is distinct from (p_token ->> 'batch_id')::uuid
     or p.claim_until is null or p.claim_until <= clock_timestamp() or p.finished_at is not null then
src/lib/entities/identifiers.integration.test.ts:251:  await claim({op:'attach_security',target_key:`attach_security:${a}`});              // same value, another op
src/lib/entities/identifiers.integration.test.ts:554: it('attach_security takes params.ticker; an accession-valued evidence_only claim amended to attach_security inserts that ticker and keeps the accession',async()=>{
src/lib/entities/identifiers.integration.test.ts:557:  const evParams={suggested_op:'attach_security',accession,form:'8-A12B',filing_date:'2026-02-20'};
src/lib/entities/identifiers.integration.test.ts:559:  const attach=(over:Record<string,unknown>)=>({op:'attach_security',target:{issuer_id:a},params:{share_class:'common',valid_from:'2026-02-20',valid_from_method:'listing_date',source:'sec_8a',...over}});
src/lib/entities/identifiers.integration.test.ts:566:  expect(await resolve(first,'accepted',attach({ticker:t}))).toEqual({op:'attach_security',applied:true,amended:true});
src/lib/entities/identifiers.integration.test.ts:569:  expect(row).toMatchObject({op:'attach_security',value:accession});
src/lib/entities/identifiers.integration.test.ts:571:  // a direct attach_security claim without params.ticker still uses the claim value
src/lib/entities/identifiers.integration.test.ts:573:  expect(await resolve(await newClaim({issuer:a,id_type:'ticker',value:t2,op:'attach_security',target:{issuer_id:a},params:{share_class:'H',valid_from:'2026-01-01',valid_from_method:'curated',source:'x'}}),'accepted')).toMatchObject({applied:true});
src/lib/entities/identifiers.integration.test.ts:577: it('attach_security inserts the open row with its method and provenance; a held ticker is ownership_conflict',async()=>{
src/lib/entities/identifiers.integration.test.ts:580:  const id=await newClaim({issuer:a,id_type:'ticker',value:t,op:'attach_security',target:{issuer_id:a},params,over:{evidence_kind:'name_match'}});
src/lib/entities/identifiers.integration.test.ts:581:  expect(await resolve(id,'accepted')).toEqual({op:'attach_security',applied:true,amended:false});
src/lib/entities/identifiers.integration.test.ts:585:  const held=await newClaim({issuer:b,id_type:'ticker',value:t,op:'attach_security',target:{issuer_id:b},params:{...params,isin:null,valid_from:'2026-01-01'}});
src/lib/entities/identifiers.integration.test.ts:656:  const pairing=await newClaim({issuer:a,id_type:'lei',value:randomLei(),op:'attach_security',target:{issuer_id:a},params:{share_class:'A',valid_from:'2020-01-01',valid_from_method:'listing_date',source:'x'}});

exec
/bin/zsh -lc "rg -n 'sanitizeProvenance|locator:|ticker.*\\"'^|ticker.*check'"' src/lib supabase/migrations/2026110* | head -100; sed -n '280,306p' supabase/migrations/20261107090000_identifiers_and_dq.sql; sed -n '1,85p' src/lib/entities/identifiers.integration.test.ts; rg -n 'provenance|EVIDENCE' src/lib/entities/identifiers.integration.test.ts | head -40; find . -name AGENTS.override.md -o -name AGENTS.md -o -name CLAUDE.md | head -20" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 218ms:
supabase/migrations/20261107090000_identifiers_and_dq.sql:307:-- Recursive public-provenance guard (mirrors the TS sanitizeProvenance rules): no secret-like keys, no
supabase/migrations/20261107090000_identifiers_and_dq.sql:398:       or (pa ? 'ticker' and (jsonb_typeof(pa -> 'ticker') is distinct from 'string' or (pa ->> 'ticker') !~ '^[A-Z0-9][A-Z0-9.-]{0,31}$')) then return 'params'; end if;
supabase/migrations/20261107090000_identifiers_and_dq.sql:400:    if not (pa ? 'ticker') and p_value !~ '^[A-Z0-9][A-Z0-9.-]{0,31}$' then return 'params.ticker'; end if;
src/lib/entities/identifiers.integration.test.ts:246: it('claims: ticker id_type, op check, detail object, nullable confidence, resolution invariant and the rebuilt pending key',async()=>{
src/lib/entities/identifiers.integration.test.ts:419:const EVIDENCE={source:'test',as_of:'2026-11-05',evidence_sha256:SHA,locator:'row:1'};
src/lib/entities/identifiers.integration.test.ts:531:  const priv={...EVIDENCE,note:'private reviewer note, contact bob',locator:'https://x.example/doc?token=abc123'};
src/lib/entities/identifiers.integration.test.ts:539:  await resolve(await newClaim({issuer:b,id_type:'lei',value:l2,op:'set_identifier',target:{issuer_id:b},over:{evidence:{...EVIDENCE,note:'secret note',locator:'row:1,col=B'}}}),'accepted');
src/lib/entities/identifiers.integration.test.ts:540:  expect((await q(`select provenance->'lei' p from public.issuers where issuer_id=$1`,[b]))[0].p).toEqual({source:'test',as_of:'2026-11-05',evidence_sha256:SHA,locator:'row:1,col=B'});
src/lib/entities/identifiers.integration.test.ts:638:  // an amend on another op, to a non-ticker op, or one that fails the claim/1 check is invalid_claim
src/lib/research/earnings-quality-vendor/earnings-quality.d.mts:7:  basis: string; sourceId: string; locator: string;
src/lib/research/earnings-quality-vendor/earnings-quality.mjs:150:    facts.push({id:`${slot}-${metric}`,metric,role:'actual',value:m.row.val,entity:raw.entityName,period:p,currency:'USD',unit:'ones',basis:'US-GAAP',sourceId,locator:`/facts/us-gaap/${m.tag}/units/USD/${m.index}; accession=${options.accession}; ${p.start}..${p.end}`});
src/lib/data/sources/sina-kline.ts:14:  const match = ticker.trim().toUpperCase().match(/^(\d{6})\.(SH|SZ)$/);
src/lib/data/sources/twse.ts:68:  const m = ticker.toUpperCase().match(/^([0-9A-Z]+)\.(TW|TWO)$/);
src/lib/data/sources/twse.ts:473:  const m = ticker.toUpperCase().match(/^(\d{4,6})\.(TW|TWO)$/);
src/lib/data/sources/tushare.ts:91:  const m = ticker.toUpperCase().match(/^(\d{6})\.(SH|SZ|BJ)$/);
src/lib/facts/sync.test.ts:544:  const odd=(loc:string)=>({...cand('acc-1','revenue','1',{periodStart:'2023-08-01',duration:'3M',rawHash:loc.repeat(64)}),locator:`loc-${loc}`});
src/lib/facts/sync.test.ts:549:  const payload=items[0].payload as {candidate:{locator:string};rows:{locator:string;rawHash:string}[]};
src/lib/facts/sync.test.ts:556:  const row=(loc:string)=>({accn:'0000320193-23-000106',tag:'us-gaap:Revenues',start:'2022-10-01',end:'2023-09-30',unit:'USD',locator:loc});
src/lib/facts/sync.test.ts:562:  expect((shared.payload as {rows:{locator:string}[]}).rows.map(x=>x.locator)).toEqual(['l1','l2']);
src/lib/facts/sync.test.ts:563:  expect((shared.payload as {row:{locator:string}}).row.locator).toBe('l1');
src/lib/facts/providers/edgar-companyfacts.ts:146:    const build=(x:Ent,duration:Duration):FactCandidate&{locator:string}=>({concept:concept.id,sourceConcept:qualified,statement:tax==='dei'?'DEI':concept.statement,periodStart:x.e.start??null,periodEnd:x.e.end,duration,value:x.value,unit,consolidation:'consolidated',filingRef:x.e.accn,rawHash:rawHashOf(snapshot.sha256,locator(x)),locator:locator(x)});
src/lib/facts/providers/edgar-companyfacts.ts:157:     for(const x of g)out.missingAvailableDate.push({accn:x.e.accn,tag:qualified,start:x.e.start??null,end:x.e.end,unit:x.rawUnit,form:x.e.form??null,value:x.value,frame:x.e.frame??null,snapshot_sha256:snapshot.sha256,locator:locator(x)});
src/lib/facts/providers/tushare-statements.test.ts:203:  expect(m).toMatchObject({page:1,row:1,snapshot_sha256:expect.stringMatching(/^[0-9a-f]{64}$/),locator:'income:rt4:p1[end_date=20230331,ann=,update_flag=0,row=1]'});
src/lib/facts/providers/edgar-companyfacts.test.ts:172:  expect(r.missingAvailableDate).toEqual([expect.objectContaining({accn:'0000320193-23-000106',tag:'us-gaap:Revenues',start:base.start,end:base.end,unit:'USD',value:'1',frame:'CY2023',snapshot_sha256:s.sha256,locator:'facts.us-gaap.Revenues.units.USD[0](accn=0000320193-23-000106,start=2022-09-25,end=2023-09-30)'})]);
src/lib/facts/providers/shared.ts:17:export const rawHashOf=(snapshotSha256:string,locator:string)=>sha256Hex(`${snapshotSha256}\n${locator}`);
src/lib/facts/providers/tushare-statements.ts:170:    out.missingAvailableDate.push({ts_code:tsCode,end_date:endDate,report_type:rt,api:d.api,page:d.page,row:rowNo,update_flag:updateFlag,f_ann_date:original(row.f_ann_date),ann_date:original(row.ann_date),values,snapshot_sha256:d.sha256,locator:rowLocator('')});
src/lib/facts/providers/tushare-statements.ts:186:    const cand:FactCandidate&{locator:string}={concept:c.id,sourceConcept:`${d.api}.${'field' in t?t.field:t.sum.join('+')}`,statement:c.statement,periodStart,periodEnd,duration:duration==='odd'?nearestDuration(days):duration,value,unit:unitOf(c),consolidation:'consolidated',filingRef:sourceRef,rawHash:rawHashOf(d.sha256,locator),locator};
src/lib/research/s6/market-handoff.ts:18: security:object({ticker:{type:'string',pattern:'^[A-Z][A-Z0-9.]{0,15}$'},listing_mic:{type:'string',pattern:'^[A-Z0-9]{4}$'},currency:{const:'USD'},identity_ref:id}),
src/lib/research/s6/market-handoff.test.ts:18: it('does not equate listing MIC with calendar or authorize a real provider assertion',()=>{const p=fixture();p.synthetic=false;p.security.ticker='SPY';p.security.listing_mic='ARCX';for(const e of p.evidence)e.source_url='https://example.invalid/'+e.id;expect(check(p)).toMatchObject({engine_compatible:true,accepted_for_evaluation:false,security:{listing_mic:'ARCX'}});});
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
163:  await sec(a,t,'2020-01-01',null,{valid_from_method:'listing_date',provenance:JSON.stringify(prov)});
166:  expect(await q(`select ticker,valid_from_method,valid_to_method,provenance from public.issuer_securities where issuer_id=$1 order by valid_from`,[a])).toEqual([
167:   {ticker:t2,valid_from_method:'first_observed',valid_to_method:'delisting',provenance:{}},
168:   {ticker:t,valid_from_method:'listing_date',valid_to_method:null,provenance:prov},
205:   await db.query(`update public.issuer_securities set valid_from_method='listing_date',provenance=provenance||'{"valid_from":{"source":"stocks_universe.list_date","as_of":"2026-11-05"}}'::jsonb where ticker='ZZUPA'`);
217:   expect((await db.query(`select provenance from public.issuer_securities where ticker='ZZUPA'`)).rows[0].provenance).toEqual({valid_from:{source:'stocks_universe.list_date',as_of:'2026-11-05'}});
419:const EVIDENCE={source:'test',as_of:'2026-11-05',evidence_sha256:SHA,locator:'row:1'};
428: const detail={schema:'claim/1',evidence_kind:'hard_identifier',target:c.target,params:c.params??{},evidence:EVIDENCE,sources:[],...c.over};
472: it('set_identifier on an issuer column writes value and provenance under the null guard; conflicts roll back',async()=>{
475:  const id=await newClaim({issuer:a,id_type:'lei',value:lei,op:'set_identifier',target:{issuer_id:a},over:{provenance_written:pw}});
477:  expect(await q(`select lei,provenance from public.issuers where issuer_id=$1`,[a])).toEqual([{lei,provenance:pw}]);
489:  // without provenance_written the claim's evidence becomes the provenance entry
492:  expect(await q(`select cik,provenance->'cik' p from public.issuers where issuer_id=$1`,[b])).toEqual([{cik,p:EVIDENCE}]);
509:  expect(await q(`select isin,provenance->'isin' p from public.issuer_securities where ticker=$1`,[t])).toEqual([{isin,p:EVIDENCE}]);
529: it('never copies private evidence into public provenance: note and unsafe locators are dropped, unsafe provenance_written is invalid_claim',async()=>{
531:  const priv={...EVIDENCE,note:'private reviewer note, contact bob',locator:'https://x.example/doc?token=abc123'};
534:  const prov=(await q(`select provenance->'lei' p from public.issuers where issuer_id=$1`,[a]))[0].p;
539:  await resolve(await newClaim({issuer:b,id_type:'lei',value:l2,op:'set_identifier',target:{issuer_id:b},over:{evidence:{...EVIDENCE,note:'secret note',locator:'row:1,col=B'}}}),'accepted');
540:  expect((await q(`select provenance->'lei' p from public.issuers where issuer_id=$1`,[b]))[0].p).toEqual({source:'test',as_of:'2026-11-05',evidence_sha256:SHA,locator:'row:1,col=B'});
541:  // provenance_written is validated recursively
545:   const id=await newClaim({issuer:c,id_type:'lei',value:randomLei(),op:'set_identifier',target:{issuer_id:c},over:{provenance_written:pw}});
550:  const ok=await newClaim({issuer:c,id_type:'lei',value:randomLei(),op:'set_identifier',target:{issuer_id:c},over:{provenance_written:{lei:{source:'gleif',as_of:'2026-11-05',evidence_sha256:SHA,row:{exchange:'XNAS'}}}}});
577: it('attach_security inserts the open row with its method and provenance; a held ticker is ownership_conflict',async()=>{
582:  expect(await q(`select issuer_id,share_class,valid_from::text,valid_to,valid_from_method,valid_to_method,source,isin,is_primary,provenance from public.issuer_securities where ticker=$1`,[t])).toEqual([
583:   {issuer_id:a,share_class:'H',valid_from:'2004-06-16',valid_to:null,valid_from_method:'listing_date',valid_to_method:null,source:'gleif_openfigi',isin:params.isin,is_primary:false,provenance:{valid_from:EVIDENCE}},
596:  expect(await q(`select valid_to::text,valid_to_method,provenance->'valid_to' p from public.issuer_securities where ticker=$1`,[t])).toEqual([{valid_to:'2026-03-01',valid_to_method:'delisting',p:EVIDENCE}]);
609:  expect(await q(`select valid_from::text,valid_from_method,provenance->'valid_from' p from public.issuer_securities where issuer_id=$1 and ticker=$2`,[a,t])).toEqual([{valid_from:'2006-03-01',valid_from_method:'listing_date',p:EVIDENCE}]);
657:  const foreignProv=await newClaim({issuer:a,id_type:'lei',value:randomLei(),op:'set_identifier',target:{issuer_id:a},over:{provenance_written:{cik:{source:'x'}}}});
659:  const badDate=await newClaim({issuer:a,id_type:'lei',value:randomLei(),op:'set_identifier',target:{issuer_id:a},over:{evidence:{...EVIDENCE,as_of:'2026-02-30'}}});
690:  const HELPERS=['public.claim_text_is_date(text)','public.claim_keys_within(jsonb,text[])','public.claim_evidence_ok(jsonb)','public.identifier_claim_target_key(text,jsonb)','public.identifier_claim_problem(text,text,text,uuid,jsonb)','public.dq_calendar_lock_pass(jsonb)','public.claim_provenance_safe(jsonb,integer)'];
892:  expect(await append(k,EVIDENCE)).toBe('duplicate');                                   // the claim's own evidence
896:  expect((await q(`select detail->'evidence' e,detail->'target' t,detail->'params' p from public.issuer_identifier_claims where id=$1`,[id]))[0]).toEqual({e:EVIDENCE,t:{issuer_id:a},p:{}});
934: // Plan audit round 3, R2: the guarded identifier write and its provenance key land in one locked UPDATE.
937: const secState=async(t:string)=>(await q(`select isin,figi,provenance from public.issuer_securities where ticker=$1`,[t]))[0];
940: it('set_security_identifier: written / duplicate (completing a missing key) / conflict / not_found; exactly one provenance key; other keys kept',async()=>{
942:  await sec(a,t,'2020-01-01',null,{provenance:JSON.stringify({exchange:'Nasdaq'})});
947:  await q(`update public.issuer_securities set figi=$2 where ticker=$1`,[t,figi]);                    // value present, provenance key missing
949:  expect(await secState(t)).toEqual({isin,figi,provenance:{exchange:'Nasdaq',...PI,...PF}});
954: it('concurrent ISIN and FIGI writes on one row both keep their value and their provenance key: the second waits on the row lock',async()=>{
956:  await sec(a,t,'2020-01-01',null,{provenance:JSON.stringify({exchange:'Nasdaq'})});

codex
Fallback provenance filtering and final validation disagree, causing some valid claims with private evidence locators to become unresolvable instead of safely omitting those locators.

Review comment:

- [P2] Drop locators that fail the public-provenance guard — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/supabase/migrations/20261107090000_identifiers_and_dq.sql:490-492
  When evidence contains a UUID locator (for example, `doc:550e8400-e29b-41d4-a716-446655440000`), this character allowlist copies it into `v_safe`, but `claim_provenance_safe(v_pw)` subsequently rejects it. Thus an otherwise valid claim cannot be accepted, rather than having its unsafe locator omitted as intended. The same mismatch occurs with a locator such as `key:abc`. Apply the recursive safety check to the locator before including it in fallback provenance, and add regression coverage for these cases.
Fallback provenance filtering and final validation disagree, causing some valid claims with private evidence locators to become unresolvable instead of safely omitting those locators.

Review comment:

- [P2] Drop locators that fail the public-provenance guard — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/supabase/migrations/20261107090000_identifiers_and_dq.sql:490-492
  When evidence contains a UUID locator (for example, `doc:550e8400-e29b-41d4-a716-446655440000`), this character allowlist copies it into `v_safe`, but `claim_provenance_safe(v_pw)` subsequently rejects it. Thus an otherwise valid claim cannot be accepted, rather than having its unsafe locator omitted as intended. The same mismatch occurs with a locator such as `key:abc`. Apply the recursive safety check to the locator before including it in fallback provenance, and add regression coverage for these cases.

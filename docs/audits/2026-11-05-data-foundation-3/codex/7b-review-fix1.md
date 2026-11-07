OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b04a-7ddf-7992-bb60-644f24c721b6
--------
user
commit 8b03c81
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 8b03c81; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 442ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-dQ5640Xo' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-uSeXtPM5' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/7b-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/7b-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/7b-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-NZdDhjgs' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-QSBLaetC' (errno=Operation not permitted)
8b03c81 fix(admin): claims route accepts amends only for evidence_only claims, limits amend ops to what SQL allows, requires params.ticker for attach_security, logs error details
 src/app/api/admin/dq/claims/[id]/route.test.ts | 26 +++++++++++++++++++++++++-
 src/app/api/admin/dq/claims/[id]/route.ts      | 13 +++++++++----
 src/lib/entities/ah-link.integration.test.ts   | 24 +++++++++++++++++++++++-
 3 files changed, 57 insertions(+), 6 deletions(-)

exec
/bin/zsh -lc 'pwd; for p in /AGENTS.md /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do [ ! -f "$p" ] || cat "$p"; done; ls -a | head -25; git show 8b03c81; cat '"'src/app/api/admin/dq/claims/[id]/route.ts'" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
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
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-FPZc8QQg' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-oGUeX2RD' (errno=Operation not permitted)
commit 8b03c81006710acf8ca89a3cde9c568e56eca8c1
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 01:56:57 2026 -0800

    fix(admin): claims route accepts amends only for evidence_only claims, limits amend ops to what SQL allows, requires params.ticker for attach_security, logs error details
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/app/api/admin/dq/claims/[id]/route.test.ts b/src/app/api/admin/dq/claims/[id]/route.test.ts
index a9a21c3..fd9e32b 100644
--- a/src/app/api/admin/dq/claims/[id]/route.test.ts
+++ b/src/app/api/admin/dq/claims/[id]/route.test.ts
@@ -85,6 +85,29 @@ describe('POST /api/admin/dq/claims/[id]', () => {
     expect(mocks.rpc).not.toHaveBeenCalled();
   });
 
+  it('amend is limited to evidence_only claims and to attach/close/backdate ops', async () => {
+    const code = async (body: unknown) => { const r = await post(body); return [r.status, (await r.json()).error]; };
+    expect(await code({ status: 'accepted', amend: { ...AMEND, op: 'set_identifier', params: {} } })).toEqual([400, 'invalid_amend']);
+    expect(await code({ status: 'accepted', amend: { ...AMEND, op: 'correct_identifier' } })).toEqual([400, 'invalid_amend']);
+    const client = memoryTableClient({ issuer_identifier_claims: ['id'] });
+    await client.insert('issuer_identifier_claims', { ...CLAIM, op: 'attach_security', detail: { ...CLAIM.detail, params: {} } });
+    mocks.client = client;
+    const res = await post({ status: 'accepted', amend: AMEND });
+    expect(res.status).toBe(400);
+    expect(await res.json()).toEqual({ id: ID, error: 'amend_not_applicable' });
+    expect(mocks.rpc).not.toHaveBeenCalled();
+  });
+
+  it('an attach_security amend needs a valid params.ticker', async () => {
+    const attach = (params: Record<string, unknown>) => ({ op: 'attach_security', target: { issuer_id: ISSUER }, params: { share_class: 'H', valid_from: '2005-06-30', valid_from_method: 'listing_date', source: 'hkex_list_name_match', ...params } });
+    const code = async (body: unknown) => { const r = await post(body); return [r.status, (await r.json()).error]; };
+    expect(await code({ status: 'accepted', amend: attach({}) })).toEqual([400, 'invalid_amend']);
+    expect(await code({ status: 'accepted', amend: attach({ ticker: 'not a ticker!' }) })).toEqual([400, 'invalid_amend']);
+    expect(mocks.rpc).not.toHaveBeenCalled();
+    expect((await post({ status: 'accepted', amend: attach({ ticker: '00700.HK' }) })).status).toBe(200);
+    expect(mocks.rpc).toHaveBeenCalledTimes(1);
+  });
+
   it('404 for an unknown claim without calling the function', async () => {
     const res = await post({ status: 'accepted' }, { 'content-type': 'application/json' }, '00000000-0000-4000-8000-00000000dead');
     expect(res.status).toBe(404);
@@ -112,8 +135,9 @@ describe('POST /api/admin/dq/claims/[id]', () => {
 
   it('500 for any other function error and for unexpected exceptions, logged', async () => {
     const log = vi.spyOn(console, 'error').mockImplementation(() => {});
-    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'invalid_claim' } });
+    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'invalid_claim', details: 'params.ticker' } });
     expect((await post({ status: 'accepted' })).status).toBe(500);
+    expect(log).toHaveBeenCalledWith('[admin/dq/claims]', 'invalid_claim', 'params.ticker');
     mocks.rpc.mockRejectedValueOnce(new Error('db down'));
     const res = await post({ status: 'accepted' });
     expect(res.status).toBe(500);
diff --git a/src/app/api/admin/dq/claims/[id]/route.ts b/src/app/api/admin/dq/claims/[id]/route.ts
index 56605c0..16a722c 100644
--- a/src/app/api/admin/dq/claims/[id]/route.ts
+++ b/src/app/api/admin/dq/claims/[id]/route.ts
@@ -20,10 +20,10 @@ const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
 const STATUSES = ['accepted', 'rejected'] as const;
 type Status = typeof STATUSES[number];
 type AmendOp = Exclude<ClaimOp, 'legacy' | 'evidence_only'>;
-const AMEND_OPS: readonly AmendOp[] = ['set_identifier', 'correct_identifier', 'attach_security', 'close_security', 'backdate_window'];
+const AMEND_OPS: readonly AmendOp[] = ['attach_security', 'close_security', 'backdate_window'];   // what resolve_identifier_claim's amend path allows
 const CONFLICTS = new Set(['already_resolved', 'legacy_claim', 'amend_required', 'value_conflict', 'ownership_conflict', 'already_closed', 'issuer_not_active']);
 interface Amend { op: AmendOp; target: ClaimDetail['target']; params: Record<string, unknown> }
-type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> };
+type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string; details?: string | null } | null }> };
 
 const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
 function parseAmend(v: unknown): Amend | null {
@@ -64,9 +64,14 @@ export async function POST(request: Request, { params }: Ctx) {
     const [claim] = await supabaseTableClient(admin).select('issuer_identifier_claims', { id }, { limit: 1 });
     if (!claim) return NextResponse.json({ id, error: 'claim_not_found' }, { status: 404 });
     if (amend) {
+      // an amendment completes an evidence_only claim; every other claim is accepted as filed
+      if (claim.op !== 'evidence_only') return NextResponse.json({ id, error: 'amend_not_applicable' }, { status: 400 });
       if (amend.target.issuer_id !== claim.issuer_id) return NextResponse.json({ error: 'invalid_amend', detail: 'target_issuer_mismatch' }, { status: 400 });
       const stored = isObj(claim.detail) ? claim.detail : {};
-      const check = validateClaimDetail(amend.op, claim.id_type as ClaimIdType, { ...stored, target: amend.target, params: amend.params } as unknown as ClaimDetail);
+      // attach_security inserts params.ticker (the claim value of an evidence_only claim is an accession): it must be present and valid
+      if (amend.op === 'attach_security' && typeof amend.params.ticker !== 'string') return NextResponse.json({ error: 'invalid_amend', detail: 'params.ticker' }, { status: 400 });
+      const check = validateClaimDetail(amend.op, claim.id_type as ClaimIdType, { ...stored, target: amend.target, params: amend.params } as unknown as ClaimDetail,
+        amend.op === 'attach_security' ? amend.params.ticker as string : undefined);
       if (!check.ok) return NextResponse.json({ error: 'invalid_amend', detail: check.error }, { status: 400 });
     }
 
@@ -74,7 +79,7 @@ export async function POST(request: Request, { params }: Ctx) {
     if (error) {
       if (CONFLICTS.has(error.message)) return NextResponse.json({ id, error: error.message }, { status: 409 });
       if (error.message === 'claim_not_found') return NextResponse.json({ id, error: 'claim_not_found' }, { status: 404 });   // deleted between the read and the rpc (Task 1b P0002)
-      console.error('[admin/dq/claims]', error.message);
+      console.error('[admin/dq/claims]', error.message, error.details ?? '');
       return NextResponse.json({ error: 'claim resolve unavailable' }, { status: 500 });
     }
     const out = isObj(data) ? data : {};
diff --git a/src/lib/entities/ah-link.integration.test.ts b/src/lib/entities/ah-link.integration.test.ts
index 600d3e4..d7a84e0 100644
--- a/src/lib/entities/ah-link.integration.test.ts
+++ b/src/lib/entities/ah-link.integration.test.ts
@@ -14,7 +14,7 @@ import type {TableClient} from '../db/table-client';
 import {startBatch} from '../dq/batches';
 import {DATASETS} from '../dq/datasets';
 import {isValidIsin} from '../research/entity-keys/identifiers';
-import {claimTargetKey,fileClaim} from './claims';
+import {claimTargetKey,fileClaim,validateClaimDetail} from './claims';
 import {attachSecurity,upsertIssuerByIdentifiers} from './issuers';
 import type {HkexIsin} from './identifiers/hkex-list';
 import {applyAhLinks,planAhLinks,type AhFigiHit,type AhIssuer,type UniverseListing} from './link-ah';
@@ -200,4 +200,26 @@ describe.skipIf(!enabled)('A+H linking and claim review on real PostgreSQL',()=>
   expect(after.status).toBe('accepted');
   expect(after.detail.original_params).toMatchObject({suggested_op:'backdate_window',form:'8-A12B'});
  });
+ it('an attach_security amend without params.ticker is refused by the route pre-check and by SQL, leaving the claim pending',async()=>{
+  const aTicker=await universeRow('A','1998-01-01');
+  const e=await newIssuer('ZZ AH Amend Attach Co., Ltd.',aTicker);
+  const evidence={source:'sec_submissions',as_of:ASOF,evidence_sha256:'b'.repeat(64),locator:'recent#accessionNumber=0000999002-01-000002',note:'8-A12B'};
+  const detail={schema:'claim/1' as const,evidence_kind:'filing_form' as const,target:{issuer_id:e},params:{suggested_op:'attach_security'},evidence,sources:[evidence]};
+  expect(await fileClaim(db,{issuer_id:e,id_type:'ticker',value:'0000999002-01-000002',source:'sec_submissions',op:'evidence_only',detail})).toBe(true);
+  const [claim]=(await admin.query(`select id from public.issuer_identifier_claims where issuer_id=$1`,[e])).rows;
+  const hk=await universeRow('HK','2008-08-08');
+  const noTicker={op:'attach_security',target:{issuer_id:e},params:{share_class:'H',valid_from:'2008-08-08',valid_from_method:'listing_date',source:'curated'}};
+  // route pre-check: params.ticker is mandatory (typeof check), otherwise validateClaimDetail with value=params.ticker
+  expect(typeof (noTicker.params as Record<string,unknown>).ticker).not.toBe('string');
+  // the same amend with a ticker passes the route's validateClaimDetail call ...
+  const withTicker={...noTicker,params:{...noTicker.params,ticker:hk}};
+  expect(validateClaimDetail('attach_security','ticker',{...detail,target:withTicker.target,params:withTicker.params},hk)).toEqual({ok:true});
+  // ... and SQL agrees that the ticker-less amend is not acceptable
+  await expect(resolve(claim.id,'accepted',noTicker)).rejects.toThrow();
+  expect((await admin.query(`select status from public.issuer_identifier_claims where id=$1`,[claim.id])).rows[0].status).toBe('pending');
+  expect((await admin.query(`select count(*)::int as n from public.issuer_securities where ticker=$1`,[hk])).rows[0].n).toBe(0);
+  // with the ticker SQL accepts and inserts the claimed row
+  expect((await resolve(claim.id,'accepted',withTicker)).rows[0].r).toMatchObject({op:'attach_security',applied:true,amended:true});
+  expect((await admin.query(`select issuer_id::text,share_class from public.issuer_securities where ticker=$1`,[hk])).rows[0]).toEqual({issuer_id:e,share_class:'H'});
+ });
 });
// src/app/api/admin/dq/claims/[id]/route.ts
// Identifier-claim review (data foundation 3 spec §7.1). Order mirrors the landed quarantine route:
// admin session (401/403) → JSON content type (415) → same Origin (403) → UUID (400) → body. An
// `amend` (only with status 'accepted'; required for evidence_only claims, enforced by the SQL
// function) is validated with validateClaimDetail against the stored claim's evidence before the
// call. resolve_identifier_claim is the final authority: its coded errors are 409, anything else 500.
import { NextResponse } from 'next/server';
import { AdminForbidden, AdminUnauthenticated, requireAdminUser } from '@/lib/admin/auth';
import { supabaseTableClient } from '@/lib/db/table-client';
import { validateClaimDetail } from '@/lib/entities/claims';
import type { ClaimDetail, ClaimIdType, ClaimOp } from '@/lib/entities/types';
import { audit, type ResearchSupabase } from '@/lib/research/store';
import { getAdminSupabase } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

interface Ctx { params: Promise<{ id: string }> }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ['accepted', 'rejected'] as const;
type Status = typeof STATUSES[number];
type AmendOp = Exclude<ClaimOp, 'legacy' | 'evidence_only'>;
const AMEND_OPS: readonly AmendOp[] = ['attach_security', 'close_security', 'backdate_window'];   // what resolve_identifier_claim's amend path allows
const CONFLICTS = new Set(['already_resolved', 'legacy_claim', 'amend_required', 'value_conflict', 'ownership_conflict', 'already_closed', 'issuer_not_active']);
interface Amend { op: AmendOp; target: ClaimDetail['target']; params: Record<string, unknown> }
type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string; details?: string | null } | null }> };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function parseAmend(v: unknown): Amend | null {
  if (!isObj(v) || Object.keys(v).some((k) => !['op', 'target', 'params'].includes(k))) return null;
  if (typeof v.op !== 'string' || !(AMEND_OPS as readonly string[]).includes(v.op)) return null;
  if (!isObj(v.target) || typeof v.target.issuer_id !== 'string' || !isObj(v.params)) return null;
  return { op: v.op as AmendOp, target: v.target as unknown as ClaimDetail['target'], params: v.params };
}

export async function POST(request: Request, { params }: Ctx) {
  try {
    const user = await requireAdminUser();
    if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
      return NextResponse.json({ error: 'unsupported_media_type' }, { status: 415 });
    }
    // Defence in depth against cross-site form posts: a browser-sent Origin must be ours.
    const origin = request.headers.get('origin');
    if (origin !== null && origin !== new URL(request.url).origin) {
      return NextResponse.json({ error: 'forbidden_origin' }, { status: 403 });
    }
    const { id } = await params;
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

    const body: unknown = await request.json().catch(() => null);
    const status = isObj(body) ? body.status : undefined;
    if (typeof status !== 'string' || !STATUSES.includes(status as Status)) {
      return NextResponse.json({ error: 'invalid_status' }, { status: 400 });
    }
    const rawAmend = isObj(body) ? body.amend : undefined;
    let amend: Amend | null = null;
    if (rawAmend !== undefined && rawAmend !== null) {
      if (status !== 'accepted') return NextResponse.json({ error: 'amend_not_applicable' }, { status: 400 });
      amend = parseAmend(rawAmend);
      if (!amend) return NextResponse.json({ error: 'invalid_amend' }, { status: 400 });
    }

    const admin = getAdminSupabase();
    const [claim] = await supabaseTableClient(admin).select('issuer_identifier_claims', { id }, { limit: 1 });
    if (!claim) return NextResponse.json({ id, error: 'claim_not_found' }, { status: 404 });
    if (amend) {
      // an amendment completes an evidence_only claim; every other claim is accepted as filed
      if (claim.op !== 'evidence_only') return NextResponse.json({ id, error: 'amend_not_applicable' }, { status: 400 });
      if (amend.target.issuer_id !== claim.issuer_id) return NextResponse.json({ error: 'invalid_amend', detail: 'target_issuer_mismatch' }, { status: 400 });
      const stored = isObj(claim.detail) ? claim.detail : {};
      // attach_security inserts params.ticker (the claim value of an evidence_only claim is an accession): it must be present and valid
      if (amend.op === 'attach_security' && typeof amend.params.ticker !== 'string') return NextResponse.json({ error: 'invalid_amend', detail: 'params.ticker' }, { status: 400 });
      const check = validateClaimDetail(amend.op, claim.id_type as ClaimIdType, { ...stored, target: amend.target, params: amend.params } as unknown as ClaimDetail,
        amend.op === 'attach_security' ? amend.params.ticker as string : undefined);
      if (!check.ok) return NextResponse.json({ error: 'invalid_amend', detail: check.error }, { status: 400 });
    }

    const { data, error } = await (admin as unknown as RpcClient).rpc('resolve_identifier_claim', { p_id: id, p_status: status, p_resolved_by: user.id, p_amend: amend });
    if (error) {
      if (CONFLICTS.has(error.message)) return NextResponse.json({ id, error: error.message }, { status: 409 });
      if (error.message === 'claim_not_found') return NextResponse.json({ id, error: 'claim_not_found' }, { status: 404 });   // deleted between the read and the rpc (Task 1b P0002)
      console.error('[admin/dq/claims]', error.message, error.details ?? '');
      return NextResponse.json({ error: 'claim resolve unavailable' }, { status: 500 });
    }
    const out = isObj(data) ? data : {};
    const result = { id, status, op: typeof out.op === 'string' ? out.op : String(claim.op), applied: out.applied === true, amended: out.amended === true };
    // The resolution is committed: an audit failure is logged, never turned into a retry-inviting 500.
    try {
      await audit({ supabase: admin as unknown as ResearchSupabase, userId: user.id }, 'dq.claim_resolve', id, result);
    } catch (auditError) {
      console.error('[admin/dq/claims] audit failed', auditError instanceof Error ? auditError.message : auditError);
    }
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof AdminUnauthenticated) return NextResponse.json({ error: 'authentication required' }, { status: 401 });
    if (error instanceof AdminForbidden) return NextResponse.json({ error: 'admin role required' }, { status: 403 });
    console.error('[admin/dq/claims]', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'claim resolve unavailable' }, { status: 500 });
  }
}

exec
/bin/zsh -lc "cat src/lib/entities/claims.ts; rg -n 'p_amend|params.ticker|amend_not_applicable' supabase/migrations/*; cat package.json | head -65; find . -name '*AGENTS*' -o -name CLAUDE.md" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 60ms:
// src/lib/entities/claims.ts
// Pending issuer_identifier_claims in the claim/1 shape (spec 3 §4.2.1; plan 3 contract C2): the review
// queue for identifier and window changes that contradict stored data or need a human decision.
// validateClaimDetail mirrors the SQL check identifier_claim_problem that resolve_identifier_claim
// runs again on acceptance: keep the two in step (migration 20261107090000). A claim is keyed by
// (issuer_id, id_type, value, op, target_key) while pending (partial unique index); filing the same key
// again only appends new evidence to detail.sources and never changes target or params.
import {createHash,randomUUID} from 'node:crypto';
import {TableError,callRpc} from '../db/table-client';
import type {Row,TableClient} from '../db/table-client';
import {ProvenanceError,sanitizeProvenance} from './provenance';
import type {ClaimDetail,ClaimEvidence,ClaimIdType,ClaimOp,ClaimTarget,EvidenceKind} from './types';

/** Unique (23505) or exclusion (23P01) violation, i.e. another row already holds the key. */
export const isUnique=(e:unknown)=>e instanceof TableError&&(e.code==='23505'||e.code==='23P01');

export interface ClaimInput{issuer_id:string;id_type:ClaimIdType;value:string;source:string;op:Exclude<ClaimOp,'legacy'>;detail:ClaimDetail}
export const CLAIM_SCHEMA='claim/1';
export const EVIDENCE_KINDS:readonly EvidenceKind[]=['hard_identifier','official_list','name_match','filing_form','provider_mapping'];
const ISSUER_COLUMNS:readonly string[]=['lei','cik','usci','cninfo_org_id'];
const SECURITY_COLUMNS:readonly string[]=['isin','figi'];
const SHARE_CLASSES:readonly string[]=['A','H','ADR','common','preferred','other','unknown'];
const FROM_METHODS:readonly string[]=['first_observed','listing_date','ticker_change','curated'];
const TO_METHODS:readonly string[]=['delisting','ticker_change','sec_file_absent','curated','merge_close','unrecorded'];
const BACKDATE_METHODS:readonly string[]=['listing_date','ticker_change','curated'];
const SUGGESTED_OPS:readonly string[]=['attach_security','close_security','backdate_window'];
const ISIN=/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
const TICKER=/^[A-Z0-9][A-Z0-9.-]{0,31}$/;
const SHA256=/^[0-9a-f]{64}$/;

const isObj=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const str=(v:unknown,max=64):v is string=>typeof v==='string'&&v.length>=1&&v.length<=max;
const onlyKeys=(o:Record<string,unknown>,allowed:readonly string[])=>Object.keys(o).every(k=>allowed.includes(k));

/** A real calendar day as YYYY-MM-DD (2026-02-30 is not). */
export function isIsoDate(v:unknown):v is string{
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
 const d=new Date(`${v}T00:00:00Z`);
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;
}
const validEvidence=(e:unknown):e is ClaimEvidence=>isObj(e)&&str(e.source)&&isIsoDate(e.as_of)&&typeof e.evidence_sha256==='string'&&SHA256.test(e.evidence_sha256 as string)
 &&(e.locator===undefined||typeof e.locator==='string')&&(e.note===undefined||typeof e.note==='string');

/** op ':' issuer_id, or op ':' issuer_id '|' ticker '|' valid_from (= SQL identifier_claim_target_key). */
export function claimTargetKey(op:ClaimOp,target:ClaimTarget):string{
 return target.ticker!==undefined?`${op}:${target.issuer_id}|${target.ticker}|${target.valid_from}`:`${op}:${target.issuer_id}`;
}

/** Provenance keys an accepted claim may write to its target row (detail.provenance_written). */
export function provenanceKeysFor(op:ClaimOp,idType:ClaimIdType):readonly string[]{
 if(op==='set_identifier'||op==='correct_identifier')return [idType];
 if(op==='attach_security')return ['isin','figi','valid_from'];
 if(op==='close_security')return ['valid_to'];
 if(op==='backdate_window')return ['valid_from'];
 return [];
}

type Verdict={ok:true}|{ok:false;error:string};
const bad=(field:string):Verdict=>({ok:false,error:`invalid_claim:${field}`});

/**
 * claim/1 check for (op, id_type, detail) per spec 3 §4.2.1; with `value`, also that the claim's value
 * column agrees (correct_identifier new_value, close/backdate target.ticker). Unknown top-level detail
 * keys are allowed (amend bookkeeping); unknown params keys are not, except for evidence_only.
 */
export function validateClaimDetail(op:ClaimOp,idType:ClaimIdType,detail:unknown,value?:string):Verdict{
 if(op==='legacy')return {ok:false,error:'legacy_claim'};
 if(!isObj(detail)||detail.schema!==CLAIM_SCHEMA)return bad('schema');
 if(!EVIDENCE_KINDS.includes(detail.evidence_kind as EvidenceKind))return bad('evidence_kind');
 const t=detail.target,pa=detail.params;
 if(!isObj(t)||!str(t.issuer_id))return bad('target.issuer_id');
 if(!isObj(pa))return bad('params');
 if(!validEvidence(detail.evidence))return bad('evidence');
 if(!Array.isArray(detail.sources)||!detail.sources.every(validEvidence))return bad('sources');
 if(detail.provenance_written!==undefined&&!isObj(detail.provenance_written))return bad('provenance_written');
 const full='ticker' in t||'valid_from' in t;
 if(full){if(!str(t.ticker,32)||!isIsoDate(t.valid_from)||Object.keys(t).length!==3)return bad('target');}
 else if(Object.keys(t).length!==1)return bad('target');
 switch(op){
  case 'set_identifier':
  case 'correct_identifier':
   if(ISSUER_COLUMNS.includes(idType)){if(full)return bad('target');}
   else if(SECURITY_COLUMNS.includes(idType)){if(!full)return bad('target');}
   else return bad('op_id_type');
   if(op==='set_identifier'){
    if(!onlyKeys(pa,['candidates','note'])||(pa.candidates!==undefined&&!Array.isArray(pa.candidates))||(pa.note!==undefined&&typeof pa.note!=='string'))return bad('params');
   }else{
    if(!onlyKeys(pa,['expected_current','new_value','candidates','note'])||!str(pa.expected_current)||!str(pa.new_value)||pa.expected_current===pa.new_value)return bad('params');
    if(value!==undefined&&pa.new_value!==value)return bad('params.new_value');
   }
   break;
  case 'attach_security':
   if(idType!=='ticker'||full)return bad('op_id_type');
   if(!onlyKeys(pa,['share_class','valid_from','valid_from_method','source','isin','note','ticker'])||(pa.ticker!==undefined&&!(typeof pa.ticker==='string'&&TICKER.test(pa.ticker)))||!SHARE_CLASSES.includes(pa.share_class as string)
    ||!isIsoDate(pa.valid_from)||!FROM_METHODS.includes(pa.valid_from_method as string)||!str(pa.source)
    ||(pa.isin!==undefined&&pa.isin!==null&&!(typeof pa.isin==='string'&&ISIN.test(pa.isin as string))))return bad('params');
   // the inserted ticker is params.ticker, else the claim value (SQL: params.ticker)
   if(pa.ticker===undefined&&value!==undefined&&!TICKER.test(value))return bad('params.ticker');
   break;
  case 'close_security':
  case 'backdate_window':
   if(idType!=='ticker'||!full)return bad('op_id_type');
   if(value!==undefined&&t.ticker!==value)return bad('target.ticker');
   if(op==='close_security'){
    if(!onlyKeys(pa,['valid_to','valid_to_method','note'])||!isIsoDate(pa.valid_to)||!TO_METHODS.includes(pa.valid_to_method as string)||(pa.valid_to as string)<=(t.valid_from as string))return bad('params');
   }else if(!onlyKeys(pa,['new_valid_from','valid_from_method','note'])||!isIsoDate(pa.new_valid_from)||!BACKDATE_METHODS.includes(pa.valid_from_method as string)||(pa.new_valid_from as string)>=(t.valid_from as string))return bad('params');
   break;
  case 'evidence_only':
   if(idType!=='ticker'||full)return bad('op_id_type');
   if('suggested_op' in pa&&!(typeof pa.suggested_op==='string'&&SUGGESTED_OPS.includes(pa.suggested_op)))return bad('params.suggested_op');
   break;
  default:
   return bad('op');
 }
 if(detail.provenance_written!==undefined){
  try{sanitizeProvenance(detail.provenance_written,provenanceKeysFor(op,idType));}
  catch(e){if(e instanceof ProvenanceError)return bad(`provenance_written:${e.code}`);throw e;}
  // SQL: it must carry the op's own provenance key (the one resolve_identifier_claim merges)
  const own=op==='close_security'?'valid_to':op==='set_identifier'||op==='correct_identifier'?idType:'valid_from';
  if(provenanceKeysFor(op,idType).length>0&&!(own in detail.provenance_written))return bad('provenance_written');
 }
 return {ok:true};
}

/** Canonical JSON (keys sorted at every level, undefined dropped): the bytes whose sha256 names a record. */
export function canonicalJson(v:unknown):string{
 if(Array.isArray(v))return `[${v.map(canonicalJson).join(',')}]`;
 if(isObj(v))return `{${Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>`${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(',')}}`;
 return JSON.stringify(v??null);
}

/** Evidence for a claim derived from an input record: sha256 over its canonical JSON; as_of is the record's date (first 10 chars) or today (UTC). */
export function claimEvidence(input:{source:string;asOf?:unknown;record:unknown;locator?:string;note?:string}):ClaimEvidence{
 const day=typeof input.asOf==='string'?input.asOf.slice(0,10):'';
 return {
  source:input.source,as_of:isIsoDate(day)?day:new Date().toISOString().slice(0,10),
  evidence_sha256:createHash('sha256').update(canonicalJson(input.record)).digest('hex'),
  ...(input.locator?{locator:input.locator}:{}),...(input.note?{note:input.note}:{}),
 };
}

export function buildClaimDetail(input:{evidence_kind:EvidenceKind;target:ClaimTarget;params?:Record<string,unknown>;evidence:ClaimEvidence;sources?:ClaimEvidence[];provenance_written?:Record<string,unknown>}):ClaimDetail{
 return {schema:CLAIM_SCHEMA,evidence_kind:input.evidence_kind,target:input.target,params:input.params??{},evidence:input.evidence,sources:input.sources??[],
  ...(input.provenance_written?{provenance_written:input.provenance_written}:{})};
}

/**
 * Appends every evidence item of the incoming claim (detail.evidence plus each of detail.sources) to the
 * pending claim matching `key` through the row-locking SQL function append_claim_evidence (migration
 * 20261107090000, Task 1b; plan audit round 1, P3): it dedupes against the claim's evidence and sources
 * and patches detail.sources only, so concurrent filers never lose each other's evidence and target /
 * params / the first evidence are never touched. 'not_found' = the claim was resolved meanwhile.
 * Needs client.rpc (callRpc: rpc_unavailable otherwise).
 */
async function appendEvidence(client:TableClient,key:Row,detail:ClaimDetail):Promise<'ok'|'not_found'>{
 for(const evidence of [detail.evidence,...(detail.sources??[])]){
  const r=await callRpc(client,'append_claim_evidence',{p_issuer:key.issuer_id,p_id_type:key.id_type,p_value:key.value,p_op:key.op,p_target_key:key.target_key,p_evidence:evidence});
  if(r==='not_found')return 'not_found';
 }
 return 'ok';
}

/** detail.sources without repeats by (source, evidence_sha256), and without the primary evidence itself. */
function dedupeSources(detail:ClaimDetail):ClaimEvidence[]{
 const seen=new Set([`${detail.evidence.source}\u0000${detail.evidence.evidence_sha256}`]);
 return (detail.sources??[]).filter(e=>{const k=`${e.source}\u0000${e.evidence_sha256}`;if(seen.has(k))return false;seen.add(k);return true;});
}

/**
 * Files a pending claim/1 claim. Validates first (throws invalid_claim:<field> / legacy_claim, no DB
 * access). The same pending (issuer_id, id_type, value, op, target_key) → every incoming evidence item
 * is appended to detail.sources and false is returned; a concurrent duplicate (23505 on the partial
 * unique index) is treated the same way. If the pending claim was resolved between the lookup and the
 * append ('not_found'), the whole step is retried once against the current state (a new pending claim
 * is inserted when none is pending); when that still persists nothing the call throws
 * claim_not_persisted (retryable) — it never returns false without having persisted the evidence.
 * Returns whether a new claim row was written.
 */
export async function fileClaim(client:TableClient,c:ClaimInput):Promise<boolean>{
 const v=validateClaimDetail(c.op,c.id_type,c.detail,c.value);
 if(!v.ok)throw new Error(v.error);
 if(c.detail.target.issuer_id!==c.issuer_id)throw new Error('invalid_claim:target.issuer_id');
 if(!str(c.source))throw new Error('invalid_claim:source');
 if(!str(c.value))throw new Error('invalid_claim:value');
 const target_key=claimTargetKey(c.op,c.detail.target);
 const key:Row={issuer_id:c.issuer_id,id_type:c.id_type,value:c.value,op:c.op,target_key,status:'pending'};
 for(let attempt=0;attempt<2;attempt++){
  if((await client.select('issuer_identifier_claims',key,{limit:1})).length){
   if(await appendEvidence(client,key,c.detail)==='ok')return false;
   continue;
  }
  try{
   await client.insert('issuer_identifier_claims',{
    id:randomUUID(),issuer_id:c.issuer_id,id_type:c.id_type,value:c.value,source:c.source,confidence:null,status:'pending',
    op:c.op,target_key,detail:{...c.detail,sources:dedupeSources(c.detail)},resolved_by:null,resolved_at:null,created_at:new Date().toISOString(),
   });
   return true;
  }catch(e){
   if(!isUnique(e))throw e;
   if(await appendEvidence(client,key,c.detail)==='ok')return false;
  }
 }
 throw new Error('claim_not_persisted');
}
supabase/migrations/20261107090000_identifiers_and_dq.sql:399:    -- the inserted ticker is params.ticker, else the claim value (which an evidence_only amendment leaves as the accession)
supabase/migrations/20261107090000_identifiers_and_dq.sql:400:    if not (pa ? 'ticker') and p_value !~ '^[A-Z0-9][A-Z0-9.-]{0,31}$' then return 'params.ticker'; end if;
supabase/migrations/20261107090000_identifiers_and_dq.sql:444:create or replace function public.resolve_identifier_claim(p_id uuid, p_status text, p_resolved_by uuid, p_amend jsonb default null)
supabase/migrations/20261107090000_identifiers_and_dq.sql:459:  if p_amend is not null then
supabase/migrations/20261107090000_identifiers_and_dq.sql:461:    if c.op <> 'evidence_only' or p_status <> 'accepted' or jsonb_typeof(p_amend) <> 'object'
supabase/migrations/20261107090000_identifiers_and_dq.sql:462:       or coalesce(p_amend ->> 'op', '') not in ('attach_security','close_security','backdate_window')
supabase/migrations/20261107090000_identifiers_and_dq.sql:463:       or jsonb_typeof(p_amend -> 'target') is distinct from 'object' or jsonb_typeof(p_amend -> 'params') is distinct from 'object' then
supabase/migrations/20261107090000_identifiers_and_dq.sql:466:    v_op := p_amend ->> 'op';
supabase/migrations/20261107090000_identifiers_and_dq.sql:467:    v_detail := c.detail || jsonb_build_object('target', p_amend -> 'target', 'params', p_amend -> 'params',
supabase/migrations/20261107090000_identifiers_and_dq.sql:470:    if (p_amend -> 'target') ? 'ticker' then v_value := p_amend -> 'target' ->> 'ticker'; end if;
supabase/migrations/20261107090000_identifiers_and_dq.sql:537:        raise exception 'invalid_claim' using errcode = '22023', detail = 'params.ticker';
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

exec
/bin/zsh -lc "sed -n '444,485p' supabase/migrations/20261107090000_identifiers_and_dq.sql; sed -n '520,550p' supabase/migrations/20261107090000_identifiers_and_dq.sql; sed -n '1,95p' src/lib/entities/ah-link.integration.test.ts; sed -n '1,90p' 'src/app/api/admin/dq/claims/[id]/route.test.ts'; ls node_modules/.bin/vitest 2>/dev/null; for p in ../../AGENTS.md ../AGENTS.md ../../AGENTS.override.md ../AGENTS.override.md; do [ "'! -f "$p" ] || cat "$p"; done' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
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
// src/lib/entities/ah-link.integration.test.ts
// A+H linking and claim review on the real schema (spec §9.3). Rule 1 attaches the HK line of a
// same-LEI issuer through attachSecurity ONLY when the HKEX ISIN of the stock code equals the
// OpenFIGI hit's ISIN (exclusion constraints, owner trigger); every other provider hint, and rule 2
// name matches, become pending attach_security claims that resolve_identifier_claim accepts (row
// inserted with the claimed window) or rejects; superseded -OLD counters are rejected; a contested
// ticker is ONE quarantine entry; an evidence_only claim is accepted only with an amend.
import {readFileSync} from 'node:fs';
import {randomBytes,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {pgTableClient} from '../db/pg-table-client';
import type {TableClient} from '../db/table-client';
import {startBatch} from '../dq/batches';
import {DATASETS} from '../dq/datasets';
import {isValidIsin} from '../research/entity-keys/identifiers';
import {claimTargetKey,fileClaim,validateClaimDetail} from './claims';
import {attachSecurity,upsertIssuerByIdentifiers} from './issuers';
import type {HkexIsin} from './identifiers/hkex-list';
import {applyAhLinks,planAhLinks,type AhFigiHit,type AhIssuer,type UniverseListing} from './link-ah';

const enabled=!!process.env.S4_TEST_STATE;
const hex=(n:number)=>randomBytes(n).toString('hex').toUpperCase();
const digits=(n:number)=>Array.from({length:n},()=>Math.floor(Math.random()*10)).join('');
const randomIsin=()=>{const base='HKZZ'+hex(4).slice(0,7);return [...'0123456789'].map(d=>base+d).find(isValidIsin)!;};
const randomLei=()=>{
 const base=hex(9);
 const ds=(base+'00').replace(/[A-Z]/g,c=>String(c.charCodeAt(0)-55));
 let r=0;for(const d of ds)r=(r*10+Number(d))%97;
 return base+String(98-r).padStart(2,'0');
};
const ASOF='2026-11-05';

describe.skipIf(!enabled)('A+H linking and claim review on real PostgreSQL',()=>{
 let admin:Pool;let db:TableClient;let batchId:string;
 const issuers:string[]=[];const tickers:string[]=[];
 const resolver=randomUUID();
 const universeRow=async(market:'A'|'HK',listDate:string|null)=>{
  for(let i=0;i<5;i++){
   const t=market==='A'?`9${digits(5)}.SH`:`9${digits(4)}.HK`;
   const got=(await admin.query(`insert into public.stocks_universe(ticker,name,market,list_date,source,source_updated_at) values($1,'ZZ AH Test',$2,$3::date,'zz_test_universe','2026-11-01T00:00:00Z') on conflict (ticker) do nothing returning ticker`,[t,market,listDate])).rows;
   if(got.length===1){tickers.push(t);return t;}
  }
  throw new Error('could not allocate a test ticker');
 };
 const newIssuer=async(name:string,aTicker:string|null)=>{
  const out=await upsertIssuerByIdentifiers(db,{lei:randomLei(),canonical_name_en:name,provenance:{lei:{source:'test'}}});
  issuers.push(out.issuer_id!);
  if(aTicker)expect(await attachSecurity(db,{issuer_id:out.issuer_id!,ticker:aTicker,share_class:'A',valid_from:'2020-01-01',source:'test'})).toBe('inserted');
  return out.issuer_id!;
 };
 const universeOf=async(ts:string[])=>new Map<string,UniverseListing>((await admin.query(`select ticker,list_date::text as list_date,source,source_updated_at::text as source_updated_at from public.stocks_universe where ticker=any($1)`,[ts])).rows.map(r=>[r.ticker,{list_date:r.list_date,source:r.source,source_updated_at:r.source_updated_at}]));
 const ownersOf=async(ts:string[])=>new Map<string,string>((await admin.query(`select ticker,issuer_id::text from public.issuer_securities where valid_to is null and ticker=any($1)`,[ts])).rows.map(r=>[r.ticker,r.issuer_id]));
 const ahIssuer=(issuer_id:string,name:string,aTicker:string):AhIssuer=>({issuer_id,lei:null,usci:null,names:[name],aTickers:[aTicker],hTickers:[]});
 const hkexIsin=(isin:string,row=3):HkexIsin=>({isin,file:'list_of_securities' as HkexIsin['file'],sha256:'e'.repeat(64),row});
 const hitFor=(issuer_id:string,ticker:string,isin:string,figi:string|null):AhFigiHit=>({issuer_id,ticker,isin,figi,level:figi?'composite':null,job:{idType:'ID_ISIN',idValue:isin},gleifSha256:'a'.repeat(64),responseSha256:'c'.repeat(64),index:0,lei:'ZZTESTLEI00000000000'});
 const resolve=(id:string,status:'accepted'|'rejected',amend:unknown=null)=>admin.query(`select public.resolve_identifier_claim($1::uuid,$2,$3::uuid,$4::jsonb) as r`,[id,status,resolver,amend===null?null:JSON.stringify(amend)]);

 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  admin=new Pool({connectionString:state.adminUrl});
  db=pgTableClient(admin);
  ({batchId}=await startBatch(db,{producer:'ah-link-test',dataset:DATASETS.entities.ahLink}));
 });
 afterAll(async()=>{
  if(!admin)return;
  await admin.query(`delete from public.dq_quarantine where batch_id=$1`,[batchId]);
  await admin.query(`delete from public.ingest_batches where batch_id=$1`,[batchId]);
  await admin.query(`delete from public.issuer_identifier_claims where issuer_id=any($1::uuid[])`,[issuers]);
  await admin.query(`delete from public.issuer_securities where issuer_id=any($1::uuid[]) or ticker=any($2)`,[issuers,tickers]);
  await admin.query(`delete from public.issuers where issuer_id=any($1::uuid[])`,[issuers]);
  await admin.query(`delete from public.stocks_universe where ticker=any($1)`,[tickers]);
  await admin.end();
 },30000);

 it('rule 1: attaches the same-LEI HK line at its listing date when the HKEX ISIN equals the hit ISIN; a replay is a duplicate; another holder is quarantined',async()=>{
  const aTicker=await universeRow('A','2001-01-01');
  const hk=await universeRow('HK','2004-03-11');
  const x=await newIssuer('ZZ AH Same Lei Co., Ltd.',aTicker);
  const isin=randomIsin();
  const hit=hitFor(x,hk,isin,`BBG${hex(5).slice(0,9)}`);
  const hkexIsins=new Map([[hk.slice(0,5),hkexIsin(isin)]]);
  const base={asOf:ASOF,universe:await universeOf([hk]),hkex:null,hkexIsins};
  const plan=planAhLinks({...base,issuers:[ahIssuer(x,'ZZ AH Same Lei Co., Ltd.',aTicker)],figiHits:[hit],openOwner:await ownersOf([hk])});
  expect(plan.attaches).toHaveLength(1);expect(plan.claims).toHaveLength(0);
  const res=await applyAhLinks(db,plan,{batchId,dataset:DATASETS.entities.ahLink});
  expect(res.counts).toMatchObject({inserted:1,failed:0});
  const row=(await admin.query(`select share_class,valid_from::text,valid_from_method,source,isin,provenance from public.issuer_securities where ticker=$1`,[hk])).rows[0];
  expect(row).toMatchObject({share_class:'H',valid_from:'2004-03-11',valid_from_method:'listing_date',source:'gleif_openfigi',isin});
  expect(Object.keys(row.provenance).sort()).toEqual(['figi','isin','valid_from']);
  expect(row.provenance.isin).toMatchObject({source:'hkex_list_of_securities',evidence_sha256:'e'.repeat(64)});
  expect((await applyAhLinks(db,plan,{batchId,dataset:DATASETS.entities.ahLink})).counts).toMatchObject({inserted:0,duplicates:1});
  // another issuer claiming the now-held ticker: one stable quarantine entry keyed `${ticker}:${valid_from}`
  const y=await newIssuer('ZZ AH Other Holder Co., Ltd.',null);
  const other=planAhLinks({...base,issuers:[{...ahIssuer(y,'ZZ AH Other Holder Co., Ltd.',aTicker),aTickers:[]}],figiHits:[{...hit,issuer_id:y}],openOwner:await ownersOf([hk])});
// src/app/api/admin/dq/claims/[id]/route.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminForbidden, AdminUnauthenticated } from '@/lib/admin/auth';
import { memoryTableClient } from '@/lib/db/memory-table-client';

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), getAdmin: vi.fn(), rpc: vi.fn(), insert: vi.fn(), from: vi.fn(), client: null as unknown }));
vi.mock('@/lib/admin/auth', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/admin/auth')>();
  return { ...original, requireAdminUser: mocks.requireAdmin };
});
vi.mock('@/lib/supabase/admin', () => ({ getAdminSupabase: mocks.getAdmin }));
vi.mock('@/lib/db/table-client', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/db/table-client')>(), supabaseTableClient: () => mocks.client }));

import { POST } from './route';

const ID = '3f2b6c1e-8a4d-4f0e-9b7a-1c2d3e4f5a6b';
const ADMIN = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const ISSUER = '10000000-0000-4000-8000-000000000009';
const URL_ = `https://alpha.example/api/admin/dq/claims/${ID}`;
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });
const post = (body: unknown, headers: Record<string, string> = { 'content-type': 'application/json' }, id = ID) =>
  POST(new Request(URL_, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) }), ctx(id));
const EVIDENCE = { source: 'sec_submissions', as_of: '2026-11-05', evidence_sha256: 'f'.repeat(64), locator: 'recent#accessionNumber=0000999001-25-000031' };
const CLAIM = {
  id: ID, issuer_id: ISSUER, id_type: 'ticker', value: '0000999001-25-000031', source: 'sec_submissions', op: 'evidence_only', status: 'pending',
  detail: { schema: 'claim/1', evidence_kind: 'filing_form', target: { issuer_id: ISSUER }, params: { suggested_op: 'close_security' }, evidence: EVIDENCE, sources: [EVIDENCE] },
};
const AMEND = { op: 'close_security', target: { issuer_id: ISSUER, ticker: 'ZZF', valid_from: '2020-01-01' }, params: { valid_to: '2025-09-22', valid_to_method: 'delisting' } };

describe('POST /api/admin/dq/claims/[id]', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const client = memoryTableClient({ issuer_identifier_claims: ['id'] });
    await client.insert('issuer_identifier_claims', CLAIM);
    mocks.client = client;
    mocks.requireAdmin.mockResolvedValue({ id: ADMIN });
    mocks.insert.mockResolvedValue({ error: null });
    mocks.from.mockReturnValue({ insert: mocks.insert });
    mocks.getAdmin.mockReturnValue({ rpc: mocks.rpc, from: mocks.from });
    mocks.rpc.mockResolvedValue({ data: { op: 'close_security', applied: true, amended: true }, error: null });
  });

  it('accepts with an amend: calls resolve_identifier_claim, audits and answers 200', async () => {
    const res = await post({ status: 'accepted', amend: AMEND }, { 'content-type': 'application/json; charset=utf-8', origin: 'https://alpha.example' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: ID, status: 'accepted', op: 'close_security', applied: true, amended: true });
    expect(mocks.rpc).toHaveBeenCalledWith('resolve_identifier_claim', { p_id: ID, p_status: 'accepted', p_resolved_by: ADMIN, p_amend: AMEND });
    expect(mocks.from).toHaveBeenCalledWith('research_audit_log');
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({ user_id: ADMIN, action: 'dq.claim_resolve', object_type: 'dq', object_id: ID,
      detail: { id: ID, status: 'accepted', op: 'close_security', applied: true, amended: true } });
  });

  it('rejects without an amend and passes p_amend null', async () => {
    mocks.rpc.mockResolvedValue({ data: { op: 'evidence_only', applied: false, amended: false }, error: null });
    const res = await post({ status: 'rejected' });
    expect(res.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('resolve_identifier_claim', { p_id: ID, p_status: 'rejected', p_resolved_by: ADMIN, p_amend: null });
  });

  it('checks auth first (401/403), then content type (415), then Origin (403), then the id (400)', async () => {
    mocks.requireAdmin.mockRejectedValueOnce(new AdminUnauthenticated('x'));
    expect((await post({ status: 'accepted' }, { 'content-type': 'text/plain' })).status).toBe(401);
    mocks.requireAdmin.mockRejectedValueOnce(new AdminForbidden('x'));
    expect((await post({ status: 'accepted' }, { 'content-type': 'text/plain' })).status).toBe(403);
    expect((await post({ status: 'accepted' }, { 'content-type': 'text/plain', origin: 'https://evil.example' })).status).toBe(415);
    expect((await POST(new Request(URL_, { method: 'POST', body: '{}' }), ctx())).status).toBe(415);
    expect((await post({ status: 'accepted' }, { 'content-type': 'application/json', origin: 'https://evil.example' }, 'nope')).status).toBe(403);
    const bad = await post({ status: 'accepted' }, { 'content-type': 'application/json' }, 'nope');
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: 'invalid_id' });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('400 for a bad status, an amend on a rejection, a malformed amend or one that fails validateClaimDetail', async () => {
    const code = async (body: unknown) => { const r = await post(body); return [r.status, (await r.json()).error]; };
    expect(await code({ status: 'resolved_accept' })).toEqual([400, 'invalid_status']);
    expect(await code('not json')).toEqual([400, 'invalid_status']);
    expect(await code({ status: 'rejected', amend: AMEND })).toEqual([400, 'amend_not_applicable']);
    expect(await code({ status: 'accepted', amend: { ...AMEND, op: 'legacy' } })).toEqual([400, 'invalid_amend']);
    expect(await code({ status: 'accepted', amend: { ...AMEND, op: 'evidence_only' } })).toEqual([400, 'invalid_amend']);
    expect(await code({ status: 'accepted', amend: { op: 'close_security', target: AMEND.target } })).toEqual([400, 'invalid_amend']);
    expect(await code({ status: 'accepted', amend: { ...AMEND, extra: 1 } })).toEqual([400, 'invalid_amend']);
    expect(await code({ status: 'accepted', amend: { ...AMEND, target: { ...AMEND.target, issuer_id: '10000000-0000-4000-8000-0000000000ff' } } })).toEqual([400, 'invalid_amend']);
    expect(await code({ status: 'accepted', amend: { ...AMEND, params: {} } })).toEqual([400, 'invalid_amend']);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('amend is limited to evidence_only claims and to attach/close/backdate ops', async () => {
    const code = async (body: unknown) => { const r = await post(body); return [r.status, (await r.json()).error]; };
    expect(await code({ status: 'accepted', amend: { ...AMEND, op: 'set_identifier', params: {} } })).toEqual([400, 'invalid_amend']);
node_modules/.bin/vitest

codex
The changes align amendment validation with the SQL resolver and reject missing or invalid attachment tickers before calling it. No actionable regressions were identified. Tests were inspected but not executed.
The changes align amendment validation with the SQL resolver and reject missing or invalid attachment tickers before calling it. No actionable regressions were identified. Tests were inspected but not executed.

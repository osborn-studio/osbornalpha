OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b39a-fc01-7f12-9420-de544d37e95d
--------
user
commit f272c11
2026-11-07T01:24:03.341136Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when AuthRequired(AuthRequiredError { www_authenticate_header: "Bearer realm=\"OAuth\", resource_metadata=\"https://mcp.notion.com/.well-known/oauth-protected-resource/mcp\", scope=\"default\"" })
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline f272c11; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 11382ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-6UYkvtk7' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-A8PKpyjM' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/19a-review.md
?? src/lib/dq/fixtures/tushare/
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-gLTTsbtW' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-1E8UYBIV' (errno=Operation not permitted)
f272c11c feat(admin/dq): calendar, claims and per-pair reconciliation blocks with a market filter, server-computed restorable
 src/app/api/admin/dq/route.test.ts  | 27 +++++++++++
 src/app/api/admin/dq/route.ts       |  8 +++-
 src/lib/dq/dashboard-blocks.test.ts | 94 +++++++++++++++++++++++++++++++++++++
 src/lib/dq/dashboard-blocks.ts      | 82 ++++++++++++++++++++++++++++++++
 src/lib/dq/dashboard-view.test.ts   | 53 +++++++++++++++++++++
 src/lib/dq/dashboard-view.ts        | 63 +++++++++++++++++++++++++
 src/lib/dq/dashboard.test.ts        | 37 +++++++++++++++
 src/lib/dq/dashboard.ts             | 30 ++++++++++--
 8 files changed, 387 insertions(+), 7 deletions(-)

exec
/bin/zsh -lc 'pwd; for p in /AGENTS.md /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md AGENTS.md AGENTS.override.md; do if [ -f "$p" ]; then echo "=== $p"; cat "$p"; fi; done; git show f272c11 --; find src -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 102ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
=== /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-jpAXKodZ' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-7rNr15L1' (errno=Operation not permitted)
commit f272c11ca05914769c8b19a7c59fb5bfd9b63cce
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 17:23:24 2026 -0800

    feat(admin/dq): calendar, claims and per-pair reconciliation blocks with a market filter, server-computed restorable
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/app/api/admin/dq/route.test.ts b/src/app/api/admin/dq/route.test.ts
index 6a52b487..f5ffb95d 100644
--- a/src/app/api/admin/dq/route.test.ts
+++ b/src/app/api/admin/dq/route.test.ts
@@ -7,6 +7,14 @@ vi.mock('@/lib/admin/auth', async (importOriginal) => {
 });
 vi.mock('@/lib/supabase/admin', () => ({ getAdminSupabase: mocks.getAdmin }));
 
+const load = vi.hoisted(() => vi.fn());
+vi.mock('@/lib/dq/dashboard', async (importOriginal) => {
+  const original = await importOriginal<typeof import('@/lib/dq/dashboard')>();
+  return { ...original, loadDqDashboard: load };
+});
+const hashNow = vi.hoisted(() => vi.fn(async () => ({ unavailable: 'inputs_unavailable' })));
+vi.mock('@/lib/dq/reconcile/deps', () => ({ restoreInputsHashNow: () => hashNow }));
+
 import { AdminUnauthenticated } from '@/lib/admin/auth';
 import { GET } from './route';
 
@@ -36,4 +44,23 @@ describe('GET /api/admin/dq', () => {
     expect(spy).toHaveBeenCalledWith('[admin/dq]', 'no service role key');
     spy.mockRestore();
   });
+
+  it('rejects an unknown market before constructing the admin client', async () => {
+    mocks.requireAdmin.mockResolvedValue({ id: 'admin-1' });
+    const res = await GET(new Request('https://alpha.example/api/admin/dq?market=HK'));
+    expect(res.status).toBe(400);
+    expect(await res.json()).toEqual({ error: 'invalid_market' });
+    expect(mocks.getAdmin).not.toHaveBeenCalled();
+  });
+
+  it('passes the market filter and the restore hash function to the dashboard loader', async () => {
+    mocks.requireAdmin.mockResolvedValue({ id: 'admin-1' });
+    mocks.getAdmin.mockReturnValue({ from: vi.fn() });
+    load.mockResolvedValue({ ok: true });
+    const res = await GET(new Request('https://alpha.example/api/admin/dq?market=CN&page=2'));
+    expect(res.status).toBe(200);
+    expect(await res.json()).toEqual({ ok: true });
+    expect(load.mock.calls[0][1]).toEqual({ dataset: undefined, page: 2, pageSize: 50, market: 'CN' });
+    expect(load.mock.calls[0][3]).toEqual({ inputsHashNow: hashNow });
+  });
 });
diff --git a/src/app/api/admin/dq/route.ts b/src/app/api/admin/dq/route.ts
index 51ad639e..79a2d2a6 100644
--- a/src/app/api/admin/dq/route.ts
+++ b/src/app/api/admin/dq/route.ts
@@ -6,6 +6,7 @@ import {
 } from '@/lib/admin/auth';
 import { supabaseTableClient } from '@/lib/db/table-client';
 import { loadDqDashboard, parseDqQuery } from '@/lib/dq/dashboard';
+import { restoreInputsHashNow } from '@/lib/dq/reconcile/deps';
 import { getAdminSupabase } from '@/lib/supabase/admin';
 
 export const dynamic = 'force-dynamic';
@@ -15,8 +16,11 @@ export async function GET(request: Request) {
     await requireAdminUser();
     const parsed = parseDqQuery(new URL(request.url).searchParams);
     if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
-    const client = supabaseTableClient(getAdminSupabase());
-    return NextResponse.json(await loadDqDashboard(client, parsed.query, new Date()));
+    const admin = getAdminSupabase();
+    const client = supabaseTableClient(admin);
+    return NextResponse.json(
+      await loadDqDashboard(client, parsed.query, new Date(), { inputsHashNow: restoreInputsHashNow(admin) }),
+    );
   } catch (error) {
     if (error instanceof AdminUnauthenticated) {
       return NextResponse.json({ error: 'authentication required' }, { status: 401 });
diff --git a/src/lib/dq/dashboard-blocks.test.ts b/src/lib/dq/dashboard-blocks.test.ts
new file mode 100644
index 00000000..616e90cb
--- /dev/null
+++ b/src/lib/dq/dashboard-blocks.test.ts
@@ -0,0 +1,94 @@
+// src/lib/dq/dashboard-blocks.test.ts
+import {describe,expect,it} from 'vitest';
+import {memoryTableClient} from '../db/memory-table-client';
+import {CALENDAR_ROWS_MAX,loadCalendarBlock,loadClaimsBlock,loadReconciliationsByPair} from './dashboard-blocks';
+import {RECONCILE_PAIR_IDS} from './reconcile/types';
+
+const NOW=new Date('2026-11-05T08:00:00Z');
+const I1='00000000-0000-4000-8000-0000000000d1',I2='00000000-0000-4000-8000-0000000000d2';
+const exp=(issuer:string,market:'US'|'CN',period_end:string,disclosure_state:string,p:Record<string,unknown>={})=>({issuer_id:issuer,market,report_kind:market==='US'?'10-Q':'q3',period_end,period_end_estimated:false,deadline_state:'statutory',due_date:null,disclosure_state,detail:{},...p});
+
+describe('loadCalendarBlock',()=>{
+ async function seeded(){
+  const t=memoryTableClient();
+  const rows=[
+   exp(I1,'US','2026-06-30','overdue',{due_date:'2026-08-10'}),
+   exp(I1,'US','2026-03-31','filed_not_ingested',{due_date:'2026-05-11'}),
+   exp(I1,'US','2026-09-30','pending',{due_date:'2026-11-09'}),            // due in 4 days → shown
+   exp(I2,'US','2026-09-30','pending',{due_date:'2026-11-20'}),            // due in 15 days → not shown
+   exp(I2,'US','2026-06-27','pending',{period_end_estimated:true,deadline_state:'estimated',due_date:'2026-11-12'}),
+   exp(I2,'US','2025-12-31','pending',{deadline_state:'no_rule',due_date:null}),
+   exp(I1,'CN','2026-09-30','unknown_upstream',{due_date:'2026-10-31'}),
+   exp(I1,'CN','2026-06-30','overdue',{due_date:'2026-08-31'}),
+   exp(I1,'US','2025-06-30','received',{due_date:'2025-08-11'}),
+  ];
+  for(const r of rows)await t.insert('dq_filing_expectations',r);
+  return t;
+ }
+ it('counts per market regardless of the filter and lists attention rows in order',async()=>{
+  const b=await loadCalendarBlock(await seeded(),undefined,NOW);
+  expect(b.overdueByMarket).toEqual({US:1,CN:1});
+  expect(b.filedNotIngestedByMarket).toEqual({US:1,CN:0});
+  expect(b.unknownUpstreamByMarket).toEqual({US:0,CN:1});
+  expect(b.noRuleByMarket).toEqual({US:1,CN:0});
+  expect(b.estimatedByMarket).toEqual({US:1,CN:0});
+  expect(b.rows.map(r=>[r.market,r.period_end,r.disclosure_state])).toEqual([
+   ['US','2026-06-30','overdue'],['CN','2026-06-30','overdue'],['US','2026-03-31','filed_not_ingested'],['US','2026-09-30','pending'],['US','2026-06-27','pending'],['CN','2026-09-30','unknown_upstream']]);
+  expect(b.noRuleRows.map(r=>r.period_end)).toEqual(['2025-12-31']);
+ });
+ it('the market filter narrows rows but not the per-market counts',async()=>{
+  const b=await loadCalendarBlock(await seeded(),'CN',NOW);
+  expect(b.rows.map(r=>r.market)).toEqual(['CN','CN']);
+  expect(b.overdueByMarket).toEqual({US:1,CN:1});
+  expect(b.noRuleRows).toEqual([]);
+ });
+ it('caps the attention list',async()=>{
+  const t=memoryTableClient();
+  for(let i=0;i<150;i++)await t.insert('dq_filing_expectations',exp(`i-${String(i).padStart(3,'0')}`,'US','2026-06-30','overdue',{due_date:'2026-08-10'}));
+  expect((await loadCalendarBlock(t,'US',NOW)).rows).toHaveLength(CALENDAR_ROWS_MAX);
+ });
+});
+
+describe('loadClaimsBlock',()=>{
+ it('pending claims newest first with a real total, and securities only for evidence_only issuers',async()=>{
+  const t=memoryTableClient();
+  await t.insert('issuer_identifier_claims',{id:'c1',issuer_id:I1,op:'evidence_only',status:'pending',created_at:'2026-11-01T00:00:00Z'});
+  await t.insert('issuer_identifier_claims',{id:'c2',issuer_id:I2,op:'set_identifier',status:'pending',created_at:'2026-11-02T00:00:00Z'});
+  await t.insert('issuer_identifier_claims',{id:'c3',issuer_id:I2,op:'legacy',status:'accepted',created_at:'2026-11-03T00:00:00Z'});
+  await t.insert('issuer_securities',{issuer_id:I1,ticker:'OLD',valid_from:'2020-01-01',valid_to:'2026-01-01',valid_from_method:'first_observed',is_primary:true});
+  await t.insert('issuer_securities',{issuer_id:I1,ticker:'NEW',valid_from:'2026-01-01',valid_to:null,valid_from_method:'first_observed',is_primary:true});
+  await t.insert('issuer_securities',{issuer_id:I2,ticker:'ZZ',valid_from:'2020-01-01',valid_to:null,is_primary:true});
+  const b=await loadClaimsBlock(t);
+  expect(b.rows.map(r=>r.id)).toEqual(['c2','c1']);
+  expect(b.total).toBe(2);
+  expect(Object.keys(b.securitiesByIssuer)).toEqual([I1]);
+  expect(b.securitiesByIssuer[I1].map(s=>s.ticker)).toEqual(['OLD','NEW']);
+ });
+});
+
+describe('loadReconciliationsByPair',()=>{
+ it('failed count for every registered pair and the latest cycle for cycle pairs only',async()=>{
+  const t=memoryTableClient();
+  await t.insert('dq_reconciliations',{id:'r1',pair:'us.companyfacts_vs_ixbrl',natural_key:'k1',passed:false,created_at:'2026-11-01T00:00:00Z'});
+  await t.insert('dq_reconciliations',{id:'r2',pair:'us.companyfacts_vs_ixbrl',natural_key:'k2',passed:true,created_at:'2026-11-01T00:00:00Z'});
+  await t.insert('dq_reconciliations',{id:'r3',pair:'sec.filer_category',natural_key:'k3',passed:false,created_at:'2026-11-01T00:00:00Z'});
+  await t.insert('dq_reconcile_cycles',{pair:'us.companyfacts_vs_ixbrl',cycle_id:'a',started_at:'2026-11-01T02:00:00Z',status:'complete',finished_at:'2026-11-01T02:03:00Z'});
+  await t.insert('dq_reconcile_cycles',{pair:'us.companyfacts_vs_ixbrl',cycle_id:'b',started_at:'2026-11-04T02:00:00Z',status:'running',finished_at:null});
+  const b=await loadReconciliationsByPair(t);
+  expect(Object.keys(b)).toEqual([...RECONCILE_PAIR_IDS]);
+  expect(b['us.companyfacts_vs_ixbrl']).toEqual({failed:1,lastCycle:{cycle_id:'b',status:'running',finished_at:null}});
+  expect(b['sec.filer_category']).toEqual({failed:1,lastCycle:null});
+  expect(b['facts.lineage_same_day']).toEqual({failed:0,lastCycle:null});
+ });
+ it('counts distinct natural keys by their latest row, not raw rows (Task 14c best-effort dedupe)',async()=>{
+  const t=memoryTableClient();
+  const p='sec.filer_category';
+  await t.insert('dq_reconciliations',{id:'a1',pair:p,natural_key:'dup',passed:false,created_at:'2026-11-01T00:00:00Z'});
+  await t.insert('dq_reconciliations',{id:'a2',pair:p,natural_key:'dup',passed:false,created_at:'2026-11-02T00:00:00Z'});
+  await t.insert('dq_reconciliations',{id:'a3',pair:p,natural_key:'dup',passed:false,created_at:'2026-11-03T00:00:00Z'});
+  await t.insert('dq_reconciliations',{id:'b1',pair:p,natural_key:'fixed',passed:false,created_at:'2026-11-01T00:00:00Z'});
+  await t.insert('dq_reconciliations',{id:'b2',pair:p,natural_key:'fixed',passed:true,created_at:'2026-11-02T00:00:00Z'});
+  await t.insert('dq_reconciliations',{id:'c1',pair:p,natural_key:'other',passed:false,created_at:'2026-11-01T00:00:00Z'});
+  expect((await loadReconciliationsByPair(t))[p].failed).toBe(2);
+ });
+});
diff --git a/src/lib/dq/dashboard-blocks.ts b/src/lib/dq/dashboard-blocks.ts
new file mode 100644
index 00000000..32916298
--- /dev/null
+++ b/src/lib/dq/dashboard-blocks.ts
@@ -0,0 +1,82 @@
+// src/lib/dq/dashboard-blocks.ts
+// The plan-3 blocks of GET /api/admin/dq (spec §7 table): the filing calendar (per-market counts
+// that never depend on the market filter, plus the attention rows and the no-rule rows for the
+// selected market), pending identifier claims (with the securities an evidence_only amendment can
+// target), and reconciliation failures by pair (distinct natural keys, latest row) with each cycle pair's latest cycle. Reads go
+// through TableClient (equality + range filters only); every list is bounded.
+import {selectAll} from '../db/table-client';
+import type {Row,TableClient} from '../db/table-client';
+import type {Market} from '../facts/types';
+import {CYCLE_PAIR_IDS,RECONCILE_PAIR_IDS} from './reconcile/types';
+
+export const MARKETS:readonly Market[]=['US','CN'];
+export const CALENDAR_ROWS_MAX=100;
+export const CALENDAR_NO_RULE_MAX=50;
+export const CLAIMS_MAX=50;
+export const DUE_SOON_DAYS=7;
+export type ByMarket=Record<Market,number>;
+export interface CalendarBlock{overdueByMarket:ByMarket;filedNotIngestedByMarket:ByMarket;unknownUpstreamByMarket:ByMarket;noRuleByMarket:ByMarket;estimatedByMarket:ByMarket;rows:Row[];noRuleRows:Row[]}
+export interface ClaimsBlock{rows:Row[];total:number;securitiesByIssuer:Record<string,Row[]>}
+export type ReconciliationsByPair=Record<string,{failed:number;lastCycle:{cycle_id:string;status:string;finished_at:string|null}|null}>;
+
+const addDaysIso=(iso:string,n:number)=>new Date(Date.parse(`${iso}T00:00:00Z`)+n*86_400_000).toISOString().slice(0,10);
+async function byMarket(client:TableClient,match:Row):Promise<ByMarket>{
+ const [us,cn]=await Promise.all(MARKETS.map(m=>client.count('dq_filing_expectations',{...match,market:m})));
+ return {US:us,CN:cn};
+}
+/** Attention order: overdue, filed-not-ingested, due within 7 days, unknown upstream; then due date (none last), period end. */
+const RANK:Record<string,number>={overdue:0,filed_not_ingested:1,pending:2,unknown_upstream:3};
+const rowKey=(r:Row)=>`${r.issuer_id}|${r.market}|${r.report_kind}|${r.period_end}`;
+
+export async function loadCalendarBlock(client:TableClient,market:Market|undefined,now:Date):Promise<CalendarBlock>{
+ const today=now.toISOString().slice(0,10);
+ const scope:Row=market?{market}:{};
+ const list=(match:Row,orderBy:string,extra:{gte?:Record<string,string>;lt?:Record<string,string>}={})=>client.select('dq_filing_expectations',{...scope,...match},{orderBy,limit:CALENDAR_ROWS_MAX,...extra});
+ const [overdueByMarket,filedNotIngestedByMarket,unknownUpstreamByMarket,noRuleByMarket,estimatedByMarket,overdue,filed,soon,unknown,noRuleRows]=await Promise.all([
+  byMarket(client,{disclosure_state:'overdue'}),byMarket(client,{disclosure_state:'filed_not_ingested'}),byMarket(client,{disclosure_state:'unknown_upstream'}),
+  byMarket(client,{deadline_state:'no_rule'}),byMarket(client,{period_end_estimated:true}),
+  list({disclosure_state:'overdue'},'due_date'),list({disclosure_state:'filed_not_ingested'},'due_date'),
+  list({disclosure_state:'pending'},'due_date',{gte:{due_date:today},lt:{due_date:addDaysIso(today,DUE_SOON_DAYS+1)}}),
+  list({disclosure_state:'unknown_upstream'},'period_end'),
+  client.select('dq_filing_expectations',{...scope,deadline_state:'no_rule'},{orderBy:'period_end',desc:true,limit:CALENDAR_NO_RULE_MAX}),
+ ]);
+ const seen=new Set<string>();
+ const rows=[...overdue,...filed,...soon,...unknown].filter(r=>{const k=rowKey(r);if(seen.has(k))return false;seen.add(k);return true;})
+  .sort((a,b)=>(RANK[String(a.disclosure_state)]??9)-(RANK[String(b.disclosure_state)]??9)||String(a.due_date??'9999').localeCompare(String(b.due_date??'9999'))||String(b.period_end).localeCompare(String(a.period_end)))
+  .slice(0,CALENDAR_ROWS_MAX);
+ return {overdueByMarket,filedNotIngestedByMarket,unknownUpstreamByMarket,noRuleByMarket,estimatedByMarket,rows,noRuleRows};
+}
+
+export async function loadClaimsBlock(client:TableClient):Promise<ClaimsBlock>{
+ const [rows,total]=await Promise.all([
+  client.select('issuer_identifier_claims',{status:'pending'},{orderBy:'created_at',desc:true,limit:CLAIMS_MAX}),
+  client.count('issuer_identifier_claims',{status:'pending'}),
+ ]);
+ const issuers=[...new Set(rows.filter(r=>r.op==='evidence_only').map(r=>String(r.issuer_id)))];
+ const lists=await Promise.all(issuers.map(id=>selectAll(client,'issuer_securities',{issuer_id:id},'valid_from')));
+ const securitiesByIssuer=Object.fromEntries(issuers.map((id,i)=>[id,lists[i].map(s=>({ticker:s.ticker,valid_from:s.valid_from,valid_to:s.valid_to??null,valid_from_method:s.valid_from_method??null,is_primary:s.is_primary===true}))]));
+ return {rows,total,securitiesByIssuer};
+}
+
+/** Distinct (pair, natural_key) whose LATEST row failed: out-of-cycle recordReconciliation dedupe is best-effort (Task 14c), so raw row counts would double-count. */
+function failedDistinct(rows:Row[]):number{
+ const latest=new Map<string,Row>();
+ for(const r of rows){
+  const k=String(r.natural_key??r.id);
+  const cur=latest.get(k);
+  if(!cur||String(r.created_at??'')>String(cur.created_at??'')||(String(r.created_at??'')===String(cur.created_at??'')&&String(r.id)>String(cur.id)))latest.set(k,r);
+ }
+ return [...latest.values()].filter(r=>r.passed===false).length;
+}
+export async function loadReconciliationsByPair(client:TableClient):Promise<ReconciliationsByPair>{
+ const cyclePairs=new Set<string>(CYCLE_PAIR_IDS);
+ const entries=await Promise.all(RECONCILE_PAIR_IDS.map(async pair=>{
+  const [rows,cycles]=await Promise.all([
+   selectAll(client,'dq_reconciliations',{pair},'id'),
+   cyclePairs.has(pair)?client.select('dq_reconcile_cycles',{pair},{orderBy:'started_at',desc:true,limit:1}):Promise.resolve([] as Row[]),
+  ]);
+  const c=cycles[0];
+  return [pair,{failed:failedDistinct(rows),lastCycle:c?{cycle_id:String(c.cycle_id),status:String(c.status),finished_at:c.finished_at==null?null:String(c.finished_at)}:null}] as const;
+ }));
+ return Object.fromEntries(entries);
+}
diff --git a/src/lib/dq/dashboard-view.test.ts b/src/lib/dq/dashboard-view.test.ts
new file mode 100644
index 00000000..1c5ba96c
--- /dev/null
+++ b/src/lib/dq/dashboard-view.test.ts
@@ -0,0 +1,53 @@
+// src/lib/dq/dashboard-view.test.ts
+import {describe,expect,it} from 'vitest';
+import {amendBody,claimMode,disclosureTone,overdueDays,quarantineAcceptBody,quarantineControl,suggestedOp,sumByMarket} from './dashboard-view';
+
+describe('calendar view rules',()=>{
+ it.each([['overdue','text-danger'],['filed_not_ingested','text-warn'],['unknown_upstream','text-text-muted italic'],['pending','text-text-dim'],['received_late','text-warn'],['received',''],['other','text-text-dim']])('%s → %j',(s,tone)=>{expect(disclosureTone(s)).toBe(tone);});
+ it('overdue days only for overdue rows with a due date',()=>{
+  expect(overdueDays({disclosure_state:'overdue',due_date:'2026-08-10'},'2026-11-05')).toBe(87);
+  expect(overdueDays({disclosure_state:'pending',due_date:'2026-08-10'},'2026-11-05')).toBeNull();
+  expect(overdueDays({disclosure_state:'overdue',due_date:null},'2026-11-05')).toBeNull();
+  expect(sumByMarket({US:2,CN:3})).toBe(5);expect(sumByMarket(undefined)).toBe(0);
+ });
+});
+
+describe('claims view rules',()=>{
+ it('legacy is SQL-only, evidence_only needs an amendment, others accept directly',()=>{
+  expect(claimMode('legacy')).toBe('sql_only');expect(claimMode('evidence_only')).toBe('amend');expect(claimMode('set_identifier')).toBe('accept');
+ });
+ it('builds the amend body per op and rejects incomplete forms',()=>{
+  const base={issuerId:'i',ticker:'NEW',validFrom:'2026-01-01'};
+  expect(amendBody({...base,op:'backdate_window',date:'2025-12-15',method:'ticker_change'})).toEqual({ok:true,body:{status:'accepted',amend:{op:'backdate_window',target:{issuer_id:'i',ticker:'NEW',valid_from:'2026-01-01'},params:{new_valid_from:'2025-12-15',valid_from_method:'ticker_change'}}}});
+  expect(amendBody({...base,op:'close_security',date:'2026-03-01',method:'delisting'})).toMatchObject({ok:true,body:{amend:{params:{valid_to:'2026-03-01',valid_to_method:'delisting'}}}});
+  expect(amendBody({...base,ticker:'',op:'close_security',date:'2026-03-01',method:'delisting'})).toEqual({ok:false,error:'amend_security'});
+  expect(amendBody({...base,op:'close_security',date:'03/01/2026',method:'delisting'})).toEqual({ok:false,error:'amend_date'});
+  expect(amendBody({...base,op:'close_security',date:'2026-03-01',method:'listing_date'})).toEqual({ok:false,error:'amend_method'});
+  expect(suggestedOp({params:{suggested_op:'close_security'}})).toBe('close_security');expect(suggestedOp({})).toBe('backdate_window');
+ });
+});
+
+describe('quarantine inline controls',()=>{
+ it('ambiguous_value lists candidates and accepts only a listed index',()=>{
+  const c=quarantineControl({reason_code:'ambiguous_value',payload:{candidates:[{value:'100',unit:'USD',sourceConcept:'Revenues',filingRef:'acc-1'},{value:'101',unit:'USD',sourceConcept:'SalesRevenueNet',filingRef:'acc-1'}]}});
+  expect(c).toEqual({kind:'candidates',options:[{index:0,label:'100 USD · Revenues · acc-1'},{index:1,label:'101 USD · SalesRevenueNet · acc-1'}]});
+  expect(quarantineAcceptBody(c,1)).toEqual({status:'resolved_accept',chosen_candidate_index:1});
+  expect(quarantineAcceptBody(c,2)).toBeNull();expect(quarantineAcceptBody(c,null)).toBeNull();
+ });
+ it('lineage_conflict pairs fact ids with values (by fact_id, else by position) and accepts only a listed fact',()=>{
+  const c=quarantineControl({reason_code:'lineage_conflict',payload:{fact_ids:['f1','f2'],values:[{issuer_id:'A',filing:'x',value:'1'},{fact_id:'f2',issuer_id:'B',filing:'y',value:'2'}]}});
+  expect(c).toEqual({kind:'lineage',options:[{factId:'f1',label:'1 · A · x'},{factId:'f2',label:'2 · B · y'}]});
+  expect(quarantineAcceptBody(c,'f2')).toEqual({status:'resolved_accept',keep_fact_id:'f2'});
+  expect(quarantineAcceptBody(c,'f9')).toBeNull();
+ });
+ it('reconcile_mismatch restore is enabled only by a passing latest_result with server-computed restorable',()=>{
+  expect(quarantineControl({reason_code:'reconcile_mismatch',restorable:true,detail:{latest_result:{passed:true}}})).toEqual({kind:'restore',enabled:true,reason:'passing'});
+  expect(quarantineControl({reason_code:'reconcile_mismatch',restorable:false,detail:{latest_result:{passed:true}}})).toEqual({kind:'restore',enabled:false,reason:'inputs_changed'});
+  expect(quarantineControl({reason_code:'reconcile_mismatch',detail:{latest_result:{passed:true}}})).toEqual({kind:'restore',enabled:false,reason:'inputs_changed'});
+  const off=quarantineControl({reason_code:'reconcile_mismatch',detail:{latest_result:{passed:false}}});
+  expect(off).toEqual({kind:'restore',enabled:false,reason:'not_passing'});
+  expect(quarantineAcceptBody(off,null)).toBeNull();
+  expect(quarantineControl({reason_code:'reconcile_mismatch',detail:{}})).toEqual({kind:'restore',enabled:false,reason:'no_result'});
+  expect(quarantineControl({reason_code:'same_day_conflict'})).toEqual({kind:'plain'});
+ });
+});
diff --git a/src/lib/dq/dashboard-view.ts b/src/lib/dq/dashboard-view.ts
new file mode 100644
index 00000000..a4739f10
--- /dev/null
+++ b/src/lib/dq/dashboard-view.ts
@@ -0,0 +1,63 @@
+// src/lib/dq/dashboard-view.ts
+// Pure view rules for the /admin/dq panels (spec §7.2), kept out of the client component so they are
+// unit-tested (the repo has no component-test setup: vitest runs src/**/*.test.ts in node). Tones are
+// existing tokens only (text-danger / text-warn / text-text-muted / text-text-dim); no new colours.
+export type Tone=''|'text-danger'|'text-warn'|'text-text-dim'|'text-text-muted'|'text-text-muted italic';
+const DISCLOSURE_TONE:Record<string,Tone>={overdue:'text-danger',filed_not_ingested:'text-warn',unknown_upstream:'text-text-muted italic',pending:'text-text-dim',received_late:'text-warn',received:''};
+export const disclosureTone=(state:string):Tone=>DISCLOSURE_TONE[state]??'text-text-dim';
+/** Whole days past the due date for an overdue row; null otherwise (never for estimated / no_rule rows). */
+export function overdueDays(row:{disclosure_state?:unknown;due_date?:unknown},today:string):number|null{
+ if(row.disclosure_state!=='overdue'||typeof row.due_date!=='string')return null;
+ const d=Math.round((Date.parse(`${today}T00:00:00Z`)-Date.parse(`${row.due_date}T00:00:00Z`))/86_400_000);
+ return Number.isFinite(d)&&d>0?d:null;
+}
+export const sumByMarket=(b:{US:number;CN:number}|undefined)=>b?b.US+b.CN:0;
+
+/** Claims panel: what the accept control does for a row. */
+export type ClaimMode='accept'|'amend'|'sql_only';
+export const claimMode=(op:unknown):ClaimMode=>op==='legacy'?'sql_only':op==='evidence_only'?'amend':'accept';
+
+export interface AmendForm{op:'backdate_window'|'close_security';issuerId:string;ticker:string;validFrom:string;date:string;method:string}
+export const AMEND_METHODS={backdate_window:['listing_date','ticker_change','curated'],close_security:['delisting','ticker_change','curated']} as const;
+const ISO=/^\d{4}-\d{2}-\d{2}$/;
+/** POST /api/admin/dq/claims/[id] body for an evidence_only acceptance (spec §4.2.1 target/params per op), or an error key. */
+export function amendBody(f:AmendForm):{ok:true;body:{status:'accepted';amend:{op:AmendForm['op'];target:{issuer_id:string;ticker:string;valid_from:string};params:Record<string,string>}}}|{ok:false;error:'amend_security'|'amend_date'|'amend_method'}{
+ if(!f.ticker||!ISO.test(f.validFrom))return {ok:false,error:'amend_security'};
+ if(!ISO.test(f.date))return {ok:false,error:'amend_date'};
+ if(!(AMEND_METHODS[f.op] as readonly string[]).includes(f.method))return {ok:false,error:'amend_method'};
+ const params:Record<string,string>=f.op==='backdate_window'?{new_valid_from:f.date,valid_from_method:f.method}:{valid_to:f.date,valid_to_method:f.method};
+ return {ok:true,body:{status:'accepted',amend:{op:f.op,target:{issuer_id:f.issuerId,ticker:f.ticker,valid_from:f.validFrom},params}}};
+}
+/** The suggested op stored by the producer (params.suggested_op), defaulting to backdate_window. */
+export const suggestedOp=(detail:unknown):AmendForm['op']=>{
+ const op=(detail as {params?:{suggested_op?:unknown}}|null)?.params?.suggested_op;
+ return op==='close_security'?'close_security':'backdate_window';
+};
+
+/** Quarantine inline interactions (spec §7.2): which control a row shows. */
+export type QuarantineControl={kind:'candidates';options:{index:number;label:string}[]}|{kind:'lineage';options:{factId:string;label:string}[]}|{kind:'restore';enabled:boolean;reason:'passing'|'not_passing'|'no_result'|'inputs_changed'}|{kind:'plain'};
+const str=(v:unknown)=>v===null||v===undefined?'—':String(v);
+export function quarantineControl(row:{reason_code?:unknown;payload?:unknown;detail?:unknown;restorable?:unknown}):QuarantineControl{
+ const payload=(row.payload??{}) as Record<string,unknown>;
+ if(row.reason_code==='ambiguous_value'&&Array.isArray(payload.candidates))
+  return {kind:'candidates',options:(payload.candidates as Record<string,unknown>[]).map((c,index)=>({index,label:`${str(c.value)} ${str(c.unit)} · ${str(c.sourceConcept)} · ${str(c.filingRef)}`}))};
+ if(row.reason_code==='lineage_conflict'&&Array.isArray(payload.fact_ids)){
+  const values=Array.isArray(payload.values)?payload.values as Record<string,unknown>[]:[];
+  return {kind:'lineage',options:(payload.fact_ids as unknown[]).map((id,i)=>{const v=values.find(x=>x.fact_id===id)??values[i]??{};return {factId:String(id),label:`${str(v.value)} · ${str(v.issuer_id)} · ${str(v.filing)}`};})};
+ }
+ if(row.reason_code==='reconcile_mismatch'){
+  const latest=((row.detail??{}) as {latest_result?:{passed?:unknown}}).latest_result;
+  if(!latest)return {kind:'restore',enabled:false,reason:'no_result'};
+  if(latest.passed!==true)return {kind:'restore',enabled:false,reason:'not_passing'};
+  // server-computed (loadDqDashboard): passed AND latest inputs_hash === inputsHashNow(row)
+  return row.restorable===true?{kind:'restore',enabled:true,reason:'passing'}:{kind:'restore',enabled:false,reason:'inputs_changed'};
+ }
+ return {kind:'plain'};
+}
+/** POST /api/admin/dq/quarantine/[id] body for an accept with a selection (spec §4.4, §4.6). */
+export function quarantineAcceptBody(c:QuarantineControl,choice:number|string|null):{status:'resolved_accept';chosen_candidate_index?:number;keep_fact_id?:string}|null{
+ if(c.kind==='candidates'){if(typeof choice!=='number'||!c.options.some(o=>o.index===choice))return null;return {status:'resolved_accept',chosen_candidate_index:choice};}
+ if(c.kind==='lineage'){if(typeof choice!=='string'||!c.options.some(o=>o.factId===choice))return null;return {status:'resolved_accept',keep_fact_id:choice};}
+ if(c.kind==='restore'&&!c.enabled)return null;
+ return {status:'resolved_accept'};
+}
diff --git a/src/lib/dq/dashboard.test.ts b/src/lib/dq/dashboard.test.ts
index 84f4cb89..914bc4ff 100644
--- a/src/lib/dq/dashboard.test.ts
+++ b/src/lib/dq/dashboard.test.ts
@@ -70,6 +70,16 @@ describe('parseDqQuery',()=>{
  });
 });
 
+describe('parseDqQuery market',()=>{
+ const q=(s:string)=>parseDqQuery(new URLSearchParams(s));
+ it('accepts market US|CN once and rejects anything else',()=>{
+  expect(q('market=US')).toEqual({ok:true,query:{dataset:undefined,page:1,pageSize:50,market:'US'}});
+  expect(q('market=CN&dataset=facts.cn')).toEqual({ok:true,query:{dataset:'facts.cn',page:1,pageSize:50,market:'CN'}});
+  expect(q('market=')).toEqual({ok:true,query:{dataset:undefined,page:1,pageSize:50}});
+  for(const s of ['market=HK','market=us','market=US&market=CN'])expect(q(s)).toEqual({ok:false,error:'invalid_market'});
+ });
+});
+
 describe('loadDqDashboard',()=>{
  const stub=(counts:(table:string,match:Row)=>number)=>{
   const calls:{op:string;table:string;match:Row;opts?:SelectOptions}[]=[];
@@ -112,4 +122,31 @@ describe('loadDqDashboard',()=>{
   expect(out.summary.openQuarantineTotal).toBe(9);
   expect(out.quarantine.total).toBe(9);
  });
+ it('adds the calendar, claims and per-pair blocks; the calendar rows follow the market filter',async()=>{
+  const {client,calls}=stub(()=>0);
+  const out=await loadDqDashboard(client,{page:1,pageSize:50,market:'CN'},new Date('2026-11-04T12:00:00Z'));
+  expect(out.calendar).toMatchObject({overdueByMarket:{US:0,CN:0},rows:[],noRuleRows:[]});
+  expect(out.claims).toEqual({rows:[],total:0,securitiesByIssuer:{}});
+  expect(Object.keys(out.reconciliationsByPair)).toHaveLength(7);
+  const calSelects=calls.filter(c=>c.op==='select'&&c.table==='dq_filing_expectations');
+  expect(calSelects.length).toBeGreaterThan(0);
+  expect(calSelects.every(c=>c.match.market==='CN')).toBe(true);
+  const calCounts=calls.filter(c=>c.op==='count'&&c.table==='dq_filing_expectations').map(c=>c.match.market);
+  expect(new Set(calCounts)).toEqual(new Set(['US','CN']));
+ });
+
+ it('computes restorable on the server for reconcile_mismatch rows only',async()=>{
+  const mk=(id:string,reason:string):Row=>({id,dataset:'reconcile.x',status:'open',reason_code:reason,detail:{latest_result:{passed:true,inputs_hash:'h'}}});
+  const rows=[mk('q1','reconcile_mismatch'),mk('q2','reconcile_mismatch'),mk('q3','same_day_conflict')];
+  const {client}=stub(()=>0);
+  const c2:TableClient={...client,select:async(table)=>table==='dq_quarantine'?rows:[]};
+  const now=new Date('2026-11-04T12:00:00Z');
+  const withHash=await loadDqDashboard(c2,{page:1,pageSize:50},now,{inputsHashNow:async item=>item.id==='q1'?'h':'x'});
+  expect(withHash.quarantine.rows.map(r=>r.restorable)).toEqual([true,false,undefined]);
+  expect('restorable' in withHash.quarantine.rows[2]).toBe(false);
+  const without=await loadDqDashboard(c2,{page:1,pageSize:50},now);
+  expect(without.quarantine.rows.map(r=>r.restorable)).toEqual([false,false,undefined]);
+  const unavailable=await loadDqDashboard(c2,{page:1,pageSize:50},now,{inputsHashNow:async()=>({unavailable:'inputs_unavailable'})});
+  expect(unavailable.quarantine.rows[0].restorable).toBe(false);
+ });
 });
diff --git a/src/lib/dq/dashboard.ts b/src/lib/dq/dashboard.ts
index b3e90761..799aedbf 100644
--- a/src/lib/dq/dashboard.ts
+++ b/src/lib/dq/dashboard.ts
@@ -2,7 +2,11 @@
 // TableClient (stubbable in tests); the rest is pure shaping and query validation.
 import type {Row,TableClient} from '../db/table-client';
 import {DQ_DATASET_INVENTORY} from './datasets';
+import type {Market} from '../facts/types';
 import {freshnessOf} from './freshness';
+import {loadCalendarBlock,loadClaimsBlock,loadReconciliationsByPair} from './dashboard-blocks';
+import type {CalendarBlock,ClaimsBlock,ReconciliationsByPair} from './dashboard-blocks';
+import type {InputsHashNow} from './facts-resolver';
 
 export interface DqSummaryInput{
  batches:{dataset:string;status:string}[];
@@ -50,7 +54,7 @@ export const DQ_DEFAULT_PAGE_SIZE=50;
 export const DQ_MAX_PAGE_SIZE=200;
 // Used only as an equality filter (parameterised by PostgREST); the DB enforces length 1..64.
 const DATASET_RE=/^[^\x00-\x1f\x7f]{1,64}$/u;
-export type DqQuery={dataset?:string;page:number;pageSize:number};
+export type DqQuery={dataset?:string;page:number;pageSize:number;market?:Market};
 
 const positiveInt=(raw:string|null,fallback:number):number|null=>{
  if(raw===null)return fallback;
@@ -66,7 +70,11 @@ export function parseDqQuery(params:URLSearchParams):{ok:true;query:DqQuery}|{ok
  if(pageSize===null||pageSize>DQ_MAX_PAGE_SIZE)return {ok:false,error:'invalid_page_size'};
  const rawDataset=params.get('dataset');
  if(rawDataset!==null&&rawDataset!==''&&!DATASET_RE.test(rawDataset))return {ok:false,error:'invalid_dataset'};
- return {ok:true,query:{dataset:rawDataset?rawDataset:undefined,page,pageSize}};
+ const markets=params.getAll('market');
+ const rawMarket=markets[0]??null;
+ if(markets.length>1||(rawMarket!==null&&rawMarket!==''&&rawMarket!=='US'&&rawMarket!=='CN'))return {ok:false,error:'invalid_market'};
+ const market=rawMarket==='US'||rawMarket==='CN'?rawMarket:undefined;
+ return {ok:true,query:{dataset:rawDataset?rawDataset:undefined,page,pageSize,...(market?{market}:{})}};
 }
 
 export const DQ_RECENT_BATCHES=50;
@@ -80,6 +88,9 @@ export interface DqDashboard{
  freshness:Awaited<ReturnType<typeof freshnessOf>>;
  quarantine:{rows:Row[];page:number;pageSize:number;total:number};
  reconciliations:Row[];
+ calendar:CalendarBlock;
+ claims:ClaimsBlock;
+ reconciliationsByPair:ReconciliationsByPair;
  /** Dataset filter options: the registry plus every dataset this response loaded (spec 3 §6.3, E9). */
  datasets:string[];
  refreshedAt:string;
@@ -93,12 +104,19 @@ export function dashboardDatasets(loaded:Iterable<unknown>,selected?:string):str
  return [...out].sort();
 }
 
+/** Server-side restore eligibility of a reconcile_mismatch item (spec §7.2): passing latest_result AND its inputs_hash equals the CURRENT inputs hash (same function as the restore route; an {unavailable} answer is never equal → false). */
+export async function restorableOf(row:Row,hashNow?:InputsHashNow):Promise<boolean>{
+ const latest=((row.detail??{}) as {latest_result?:{passed?:unknown;inputs_hash?:unknown}}).latest_result;
+ if(!hashNow||latest?.passed!==true||typeof latest.inputs_hash!=='string')return false;
+ try{return (await hashNow(row))===latest.inputs_hash;}catch{return false;}
+}
+
 /**
  * All dashboard reads. The open-quarantine KPI is a global count; the pager total is a
  * separate count filtered by the selected dataset, so filtering never changes the KPI.
  */
-export async function loadDqDashboard(client:TableClient,query:DqQuery,now:Date):Promise<DqDashboard>{
- const {dataset,page,pageSize}=query;
+export async function loadDqDashboard(client:TableClient,query:DqQuery,now:Date,opts:{inputsHashNow?:InputsHashNow}={}):Promise<DqDashboard>{
+ const {dataset,page,pageSize,market}=query;
  const openMatch:Row={status:'open'};
  const pageMatch:Row=dataset?{status:'open',dataset}:openMatch;
  const [batches,freshness,openQuarantineTotal,quarantineTotal,quarantineRows,failedReconciliationsTotal,reconciliations]=
@@ -111,6 +129,7 @@ export async function loadDqDashboard(client:TableClient,query:DqQuery,now:Date)
    client.count('dq_reconciliations',{passed:false}),
    client.select('dq_reconciliations',{passed:false},{orderBy:'created_at',desc:true,limit:DQ_RECENT_RECONCILIATIONS}),
   ]);
+ const [calendar,claims,reconciliationsByPair]=await Promise.all([loadCalendarBlock(client,market,now),loadClaimsBlock(client),loadReconciliationsByPair(client)]);
  const batches24h=within(batches,'started_at',now,DAY_MS);
  const summary=summarizeDq({
   batches:batches24h.map(b=>({dataset:String(b.dataset),status:String(b.status)})),
@@ -125,8 +144,9 @@ export async function loadDqDashboard(client:TableClient,query:DqQuery,now:Date)
   batches24hTruncated:batches.length===DQ_RECENT_BATCHES&&batches24h.length===DQ_RECENT_BATCHES,
   batches,
   freshness,
-  quarantine:{rows:quarantineRows,page,pageSize,total:quarantineTotal??openQuarantineTotal},
+  quarantine:{rows:await Promise.all(quarantineRows.map(async r=>r.reason_code==='reconcile_mismatch'?{...r,restorable:await restorableOf(r,opts.inputsHashNow)}:r)),page,pageSize,total:quarantineTotal??openQuarantineTotal},
   reconciliations,
+  calendar,claims,reconciliationsByPair,
   datasets:dashboardDatasets([...batches,...freshness,...quarantineRows].map(r=>r.dataset),dataset),
   refreshedAt:now.toISOString(),
  };

exec
/bin/zsh -lc "cat src/lib/db/table-client.ts; cat src/lib/dq/reconcile/deps.ts; cat src/lib/dq/reconcile/types.ts; rg -n 'latest_result|inputsHashNow' src/lib/dq/facts-resolver.ts; ls -a | head -30; rg -n 'dq_reconciliations|cycle_id' src/lib/dq/reconcile/runner.ts" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 2 in 9ms:
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
// src/lib/dq/reconcile/deps.ts
// Production wiring of ReconcileDeps (plan 3 Task 14c) shared by /api/cron/reconcile and
// scripts/dq/reconcile.ts: Supabase FactsDb / TableClient / RawStore (bucket reconcile-raw), the global
// fetch (the pairs pace SEC themselves), and readRepoFileFromDisk, which reads ONLY JSON files under the two
// gold fixture directories (the sample and gold manifests; next.config.mjs traces them into the cron
// function). Anything else — absolute paths, '..', other directories or extensions — is refused.
import {readFile} from 'node:fs/promises';
import {join,normalize} from 'node:path';
import type {SupabaseClient} from '@supabase/supabase-js';
import {supabaseTableClient} from '../../db/table-client';
import {supabaseFactsDb} from '../../facts/db';
import {getAdminSupabase} from '../../supabase/admin';
import {supabaseRawStore} from '../raw-store';
import type {Row} from '../../db/table-client';
import {makeBudget} from '../../facts/sync';
import type {InputsHashNow} from '../facts-resolver';
import {RECONCILE_PAIRS,inputsHashNow} from './pairs';
import type {ReconcileDeps} from './run';
import {CYCLE_PAIR_IDS} from './types';
import type {CyclePairId,PairContext} from './types';

export const REPO_FILE_PREFIXES:readonly string[]=['src/lib/dq/fixtures/gold/','src/lib/facts/fixtures/gold/'];
export async function readRepoFileFromDisk(path:string):Promise<Uint8Array>{
 const n=normalize(path).replace(/\\/g,'/');
 if(path.startsWith('/')||n!==path||n.includes('..')||!n.endsWith('.json')||!REPO_FILE_PREFIXES.some(p=>n.startsWith(p)))throw new Error('repo_file_not_allowed');
 return new Uint8Array(await readFile(join(process.cwd(),n)));
}

/** Data gaps of pairs.ts::inputsHashNow that mean "cannot restore now" (→ {unavailable:'inputs_unavailable'} → 409 not_passing / restorable=false), not a bug. */
const RESTORE_GAP_CODES:readonly string[]=['pair_not_registered','left_fact_missing','no_latest_result'];
/**
 * The CURRENT inputs hash of a reconcile_mismatch item (spec §5.6), injected into the quarantine route
 * (resolveFactsItem.inputsHashNow, Task 11) and the admin dashboard's server-computed `restorable` (Task 19a).
 */
export function restoreInputsHashNow(admin?:SupabaseClient):InputsHashNow{
 const sb=admin??getAdminSupabase();
 const now=()=>new Date();
 const ctx:PairContext={db:supabaseFactsDb(sb),tables:supabaseTableClient(sb),raw:supabaseRawStore(sb),now,budget:makeBudget(null,now),
  fetch:globalThis.fetch.bind(globalThis),readRepoFile:readRepoFileFromDisk};
 return async(item:Row)=>{
  try{return await inputsHashNow(ctx,item);}
  catch(e){
   // the pair's CURRENT right evidence cannot be obtained now (plan audit P2): restore stays disabled
   if(e instanceof Error&&e.message==='current_evidence_unavailable')return {unavailable:'current_evidence_unavailable'};
   if(e instanceof Error&&RESTORE_GAP_CODES.includes(e.message))return {unavailable:'inputs_unavailable'};
   throw e;
  }
 };
}

/** CN pairs run only with FACTS_CN_ENABLED=1 (no Tushare token / unverified gold: spec T15). Shared by the cron route and the script. */
export const cnPairEnabled=(pair:string,env:Record<string,string|undefined>=process.env):boolean=>!pair.startsWith('cn.')||env.FACTS_CN_ENABLED==='1';

export const RECONCILE_USAGE='usage: reconcile.ts --pair <cycle pair id> [--issuer <ticker>...] [--apply]';
export type ReconcileArgs={pair:CyclePairId;apply:boolean;tickers:string[]}|{exit:2;message:string};
/** Argument parsing and gates of scripts/dq/reconcile.ts (pure): bad arguments, unknown / unregistered pair, and --apply of a cn.* pair without FACTS_CN_ENABLED=1 (checked before any production deps exist; a dry run needs no gate). */
export function parseReconcileArgs(argv:readonly string[],env:Record<string,string|undefined>=process.env,registry:Partial<Record<CyclePairId,unknown>>=RECONCILE_PAIRS):ReconcileArgs{
 let pair='',apply=false;const tickers:string[]=[];
 for(let i=0;i<argv.length;i++){
  const x=argv[i],v=argv[i+1];
  if(x==='--pair'&&v){pair=v;i++;}
  else if(x==='--issuer'&&v){tickers.push(v);i++;}
  else if(x==='--apply')apply=true;
  else return {exit:2,message:RECONCILE_USAGE};
 }
 if(!(CYCLE_PAIR_IDS as readonly string[]).includes(pair))return {exit:2,message:RECONCILE_USAGE};
 if(apply&&!cnPairEnabled(pair,env))return {exit:2,message:'cn_disabled: --apply for cn.* pairs needs FACTS_CN_ENABLED=1'};
 if(!registry[pair as CyclePairId])return {exit:2,message:`${RECONCILE_USAGE}\nregistered: ${Object.keys(registry).join(', ')}`};
 return {pair:pair as CyclePairId,apply,tickers};
}

export interface ProductionReconcileOptions{deadline:Date|null;codeVersion:string;admin?:SupabaseClient}
export function productionReconcileDeps(opts:ProductionReconcileOptions):ReconcileDeps{
 const sb=opts.admin??getAdminSupabase();
 return {db:supabaseFactsDb(sb),tables:supabaseTableClient(sb),raw:supabaseRawStore(sb),fetch:globalThis.fetch.bind(globalThis),
  readRepoFile:readRepoFileFromDisk,now:()=>new Date(),deadline:opts.deadline,codeVersion:opts.codeVersion};
}
// src/lib/dq/reconcile/types.ts
// Shared reconciliation contract (plan 3 C3; spec §3.1 dq_reconciliations / dq_reconcile_cycles /
// dq_reconcile_cursor, §5.1 pairs, §5.5 runner). Task 2a: RECONCILE_PAIR_IDS / ReconcilePairId; Task 9a:
// the FactsDb-facing subset (CYCLE_PAIR_IDS … MemberCounts); Task 13a: the runner/pair remainder below.
// Values are canonical decimal strings everywhere (never Number). Type-only imports from the facts layer.
import type {Budget,FactsDb,Market} from '../../facts/types';
import type {TableClient} from '../../db/table-client';
import type {RawStore} from '../raw-store';
export const RECONCILE_PAIR_IDS=['us.companyfacts_vs_ixbrl','cn.tushare_vs_cninfo_pdf_gold','us.companyfacts_vs_gold','sec.filing_date_vs_submissions','sec.filer_category','entities.isin_hkex_vs_gleif','facts.lineage_same_day'] as const;
export type ReconcilePairId=typeof RECONCILE_PAIR_IDS[number];
/** Pairs run by the cycle runner; the other three are recorded inline by their producers (record.ts, cycle_id null). */
export const CYCLE_PAIR_IDS=['us.companyfacts_vs_ixbrl','cn.tushare_vs_cninfo_pdf_gold','us.companyfacts_vs_gold','facts.lineage_same_day'] as const satisfies readonly ReconcilePairId[];
export type CyclePairId=typeof CYCLE_PAIR_IDS[number];
export type ReconcileKind='numeric'|'text'|'date';
export type ReconcileOutcome='compared'|'left_missing'|'left_unlinked'|'left_ambiguous'|'right_missing'|'unsupported'|'right_ambiguous'|'incomplete_gold';
export type ReconcileAction='record'|'quarantine_left'|'review_item'|'lineage_item';
export interface Fence{pair:CyclePairId;cycle_id:string;issuer_id:string;market:Market;batch_id:string;attempt:number}
/** One per expected key; values are canonical decimal strings (never Number). */
export interface ReconcileResultInput{
 natural_key:string;kind:ReconcileKind;outcome:ReconcileOutcome;passed:boolean;
 left_value:string|null;right_value:string|null;abs_diff:string|null;rel_diff:string|null;tolerance:string;
 left_source:string;right_source:string;detail:Record<string,unknown>;
 action:ReconcileAction;left_fact_id?:string;inputs_hash?:string;
 item?:{natural_key:string;payload:Record<string,unknown>;detail?:Record<string,unknown>};   // for review_item / lineage_item / quarantine_left
}
export interface ApplyReconcileOutcome{reused:boolean;reconciliationId:string;itemId:string|null;quarantined:0|1;materialize:{issuerId:string;market:Market}|null}
export interface MemberCounts{compared_passed:number;compared_failed:number;not_compared:number}
/** set_merge's registration of a merge target (plan audit Q2): one entry per (target, market, merged source). */
export interface PendingMember{issuer_id:string;market:Market;source:string}
/** open_reconcile_cycle input (plan audit Q2): members frozen with their expected keys (the {naturalKey, locator} shape Task 13a names ExpectedKey); pending = exactly the snapshot entries the runner resolved keys for. */
export interface OpenCycleInput{pair:CyclePairId;cycleId:string;startedAt:string;members:{issuer_id:string;market:Market;expected_keys:{naturalKey:string;locator:Record<string,unknown>}[]}[];pending:PendingMember[]}
export interface OpenCycleResult{created:boolean;cycle:Record<string,unknown>;transferred:PendingMember[]}
export const RECONCILE_OUTCOMES=['compared','left_missing','left_unlinked','left_ambiguous','right_missing','unsupported','right_ambiguous','incomplete_gold'] as const satisfies readonly ReconcileOutcome[];
/** Compile-time exhaustiveness: fails to typecheck if ReconcileOutcome gains a member missing from RECONCILE_OUTCOMES. */
export const OUTCOMES_EXHAUSTIVE:[Exclude<ReconcileOutcome,typeof RECONCILE_OUTCOMES[number]>] extends [never]?true:never=true;
export type CycleStatus='running'|'complete'|'complete_with_gaps';
export type CursorState='pending'|'claimed'|'done'|'failed';
/** A cursor whose attempts reached this value in state 'failed' is terminal (spec §5.5, S4). */
export const MAX_CURSOR_ATTEMPTS=3;
export interface ExpectedKey{naturalKey:string;locator:Record<string,unknown>}
export interface MemberPlan{issuerId:string;market:Market;expectedKeys:ExpectedKey[]}
export interface PairContext{db:FactsDb;tables:TableClient;raw:RawStore;now:()=>Date;budget:Budget;fetch:typeof fetch;readRepoFile:(path:string)=>Promise<Uint8Array>}
export interface ReconcilePair{
 id:CyclePairId;kind:ReconcileKind;left:string;right:string;
 /** frozen at cycle creation (pending_members merged by the runner) */
 members(ctx:PairContext):Promise<MemberPlan[]>;
 /** exactly one result per member.expectedKeys entry, same order; never throws for data problems (outcome encodes them) */
 evaluate(ctx:PairContext,member:MemberPlan):Promise<ReconcileResultInput[]>;
}
11://  reconcile_mismatch → restore: inputsHashNow(item) is injected (the hash of the CURRENT inputs,
68: inputsHashNow?:InputsHashNow}
230: if(!input.inputsHashNow)return {outcome:'conflict',code:'not_passing',restoreNote:'reconcile_wiring_missing'};
231: const id=String(item.id);const hash=await input.inputsHashNow(item);
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
rg: src/lib/dq/reconcile/runner.ts: IO error for operation on src/lib/dq/reconcile/runner.ts: No such file or directory (os error 2)

exec
/bin/zsh -lc "cat next.config.mjs | grep -A35 -B5 tracing; rg -n 'inputsHashNow|current_evidence' src/lib/dq/reconcile/pairs.ts; sed -n '1,100p' src/lib/dq/reconcile/pairs.ts; rg -n '7.2|reconciliationsByPair|failed count' docs/* -g '*data*' | head; find .claude .cursor -maxdepth 2 -type f | head; cat src/lib/dq/reconcile/pairs.ts | tail -110; rg -n 'issuer_securities|primary key' supabase/migrations/* | grep -A4 'issuer_securities' | head -25" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 24ms:
6:// deliberately absent. inputsHashNow recomputes a reconcile_mismatch item's inputs_hash from CURRENT
10:// the sha256 that run recorded; unobtainable → current_evidence_unavailable, plan audit P2), the CURRENT
29:export async function inputsHashNow(ctx:PairContext,item:Row):Promise<string>{
42: if(right===null)throw new Error('current_evidence_unavailable');
// src/lib/dq/reconcile/pairs.ts
// Registry of the cycle pairs run by run.ts (spec §5.1; contract C3). Task 14 registers
// facts.lineage_same_day and us.companyfacts_vs_gold; us.companyfacts_vs_ixbrl (Task 15); Task 16 adds
// cn.tushare_vs_cninfo_pdf_gold. The three non-cycle pairs (sec.filing_date_vs_submissions,
// sec.filer_category, entities.isin_hkex_vs_gleif) are recorded inline through record.ts and are
// deliberately absent. inputsHashNow recomputes a reconcile_mismatch item's inputs_hash from CURRENT
// inputs for restore_reconciled (spec §5.6): left raw_hash from the item's fact, the pair's CURRENT right
// evidence for the natural key of the result row named by latest_result (RegisteredPair.currentRight —
// iXBRL fetches and hashes the primary document now, gold pairs resolve the current manifest entry; never
// the sha256 that run recorded; unobtainable → current_evidence_unavailable, plan audit P2), the CURRENT
// gold or sample file bytes, the CURRENT parser version. Any change since the last passing run → a different hash.
import type {Row} from '../../db/table-client';
import {computeInputsHash} from './inputs-hash';
import {cnTushareVsGoldPair} from './pair-cn-gold';
import {lineageSameDayPair} from './pair-lineage';
import {sha256Hex} from './pair-support';
import type {RegisteredPair} from './pair-support';
import {usCompanyfactsVsGoldPair} from './pair-us-gold';
import {usCompanyfactsVsIxbrlPair} from './pair-us-ixbrl';
import type {CyclePairId,PairContext} from './types';

export const RECONCILE_PAIRS:Partial<Record<CyclePairId,RegisteredPair>>={
 'facts.lineage_same_day':lineageSameDayPair(),
 'us.companyfacts_vs_gold':usCompanyfactsVsGoldPair(),
 'us.companyfacts_vs_ixbrl':usCompanyfactsVsIxbrlPair(),
 'cn.tushare_vs_cninfo_pdf_gold':cnTushareVsGoldPair(),
};

export async function inputsHashNow(ctx:PairContext,item:Row):Promise<string>{
 const detail=(item.detail??{}) as {pair?:unknown;latest_result?:{reconciliation_id?:unknown}};
 const pair=typeof detail.pair==='string'?RECONCILE_PAIRS[detail.pair as CyclePairId]:undefined;
 if(!pair)throw new Error('pair_not_registered');
 const factIds=((item.payload??{}) as {fact_ids?:unknown}).fact_ids;
 const factId=Array.isArray(factIds)&&typeof factIds[0]==='string'?factIds[0]:null;
 const [fact]=factId===null?[]:await ctx.db.factsByIds([factId]);
 if(!fact)throw new Error('left_fact_missing');
 const recId=detail.latest_result?.reconciliation_id;
 if(typeof recId!=='string')throw new Error('no_latest_result');
 const [rec]=await ctx.tables.select('dq_reconciliations',{id:recId},{limit:1});
 if(!rec)throw new Error('no_latest_result');
 const right=await pair.currentRight(ctx,rec);   // what the right side says NOW (plan audit P2)
 if(right===null)throw new Error('current_evidence_unavailable');
 const file=pair.inputs.repoFile===null?'':sha256Hex(await ctx.readRepoFile(pair.inputs.repoFile));
 return computeInputsHash({left_raw_hash:fact.raw_hash,right_sha256:right,gold_or_sample_sha256:file,parser_version:pair.inputs.parserVersion});
}
docs/REALTIME_MARKET_DATA_API.md:86:  "updated_at": "2026-09-23T03:27:21.923Z",
docs/REALTIME_MARKET_DATA_API.md:132:      "updated_at": "2026-09-23T03:27:21.923Z",
docs/osbornalpha-beta-usage-report-2026-07-15.md:3:生成时间：2026-07-15 07:27 北京时间
docs/osbornalpha-beta-usage-report-2026-07-15.md:4:数据窗口：Supabase 全量业务表；Vercel 最近日志样本约 2026-07-15 06:33-07:28 北京时间
docs/osbornalpha-beta-usage-report-2026-07-15.md:75:最近日志样本 2000 条，时间跨度约 2026-07-15 06:38-07:25 北京时间：
docs/osbornalpha-beta-usage-report-2026-07-15.md:82:- 状态码：1958 次 200；40 次 307；2 次 0
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:521:| `GET /api/admin/dq` | 加 `datasets`、`calendar:{overdueByMarket, filedNotIngestedByMarket, unknownUpstreamByMarket, noRuleByMarket, estimatedByMarket, rows:[逾期 + 7 日内到期 + filed_not_ingested + unknown_upstream，≤ 100]、noRuleRows:[≤ 50]}`、`claims:{rows, total}`、`reconciliationsByPair:{<pair>:{failed, lastCycle:{cycle_id, status, finished_at}}}`；参数 `market` |
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:530:### 7.2 `/admin/dq` 页面流（视觉另在 Claude Design 画布设计）
docs/superpowers/specs/2026-07-15-security-master-data-search-design.md:248:### 7.2 港股主板
docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md:407:### 7.2 警告
.claude/agents/john-cameron.md
.claude/scratch/disclosure-verify.ts
.claude/scratch/insp3.ts
.claude/scratch/codex-prompt-13a.txt
.claude/scratch/codex-prompt-12.txt
.claude/scratch/codex-prompt-10.txt
.claude/scratch/codex-prompt-13b.txt
.claude/scratch/codex-prompt-13c.txt
.claude/scratch/carry-forward.md
.claude/scratch/codex-prompt-11.txt
// src/lib/dq/reconcile/pairs.ts
// Registry of the cycle pairs run by run.ts (spec §5.1; contract C3). Task 14 registers
// facts.lineage_same_day and us.companyfacts_vs_gold; us.companyfacts_vs_ixbrl (Task 15); Task 16 adds
// cn.tushare_vs_cninfo_pdf_gold. The three non-cycle pairs (sec.filing_date_vs_submissions,
// sec.filer_category, entities.isin_hkex_vs_gleif) are recorded inline through record.ts and are
// deliberately absent. inputsHashNow recomputes a reconcile_mismatch item's inputs_hash from CURRENT
// inputs for restore_reconciled (spec §5.6): left raw_hash from the item's fact, the pair's CURRENT right
// evidence for the natural key of the result row named by latest_result (RegisteredPair.currentRight —
// iXBRL fetches and hashes the primary document now, gold pairs resolve the current manifest entry; never
// the sha256 that run recorded; unobtainable → current_evidence_unavailable, plan audit P2), the CURRENT
// gold or sample file bytes, the CURRENT parser version. Any change since the last passing run → a different hash.
import type {Row} from '../../db/table-client';
import {computeInputsHash} from './inputs-hash';
import {cnTushareVsGoldPair} from './pair-cn-gold';
import {lineageSameDayPair} from './pair-lineage';
import {sha256Hex} from './pair-support';
import type {RegisteredPair} from './pair-support';
import {usCompanyfactsVsGoldPair} from './pair-us-gold';
import {usCompanyfactsVsIxbrlPair} from './pair-us-ixbrl';
import type {CyclePairId,PairContext} from './types';

export const RECONCILE_PAIRS:Partial<Record<CyclePairId,RegisteredPair>>={
 'facts.lineage_same_day':lineageSameDayPair(),
 'us.companyfacts_vs_gold':usCompanyfactsVsGoldPair(),
 'us.companyfacts_vs_ixbrl':usCompanyfactsVsIxbrlPair(),
 'cn.tushare_vs_cninfo_pdf_gold':cnTushareVsGoldPair(),
};

export async function inputsHashNow(ctx:PairContext,item:Row):Promise<string>{
 const detail=(item.detail??{}) as {pair?:unknown;latest_result?:{reconciliation_id?:unknown}};
 const pair=typeof detail.pair==='string'?RECONCILE_PAIRS[detail.pair as CyclePairId]:undefined;
 if(!pair)throw new Error('pair_not_registered');
 const factIds=((item.payload??{}) as {fact_ids?:unknown}).fact_ids;
 const factId=Array.isArray(factIds)&&typeof factIds[0]==='string'?factIds[0]:null;
 const [fact]=factId===null?[]:await ctx.db.factsByIds([factId]);
 if(!fact)throw new Error('left_fact_missing');
 const recId=detail.latest_result?.reconciliation_id;
 if(typeof recId!=='string')throw new Error('no_latest_result');
 const [rec]=await ctx.tables.select('dq_reconciliations',{id:recId},{limit:1});
 if(!rec)throw new Error('no_latest_result');
 const right=await pair.currentRight(ctx,rec);   // what the right side says NOW (plan audit P2)
 if(right===null)throw new Error('current_evidence_unavailable');
 const file=pair.inputs.repoFile===null?'':sha256Hex(await ctx.readRepoFile(pair.inputs.repoFile));
 return computeInputsHash({left_raw_hash:fact.raw_hash,right_sha256:right,gold_or_sample_sha256:file,parser_version:pair.inputs.parserVersion});
}
supabase/migrations/20261105091000_issuers.sql:15:-- provenance (issuers, issuer_securities, issuer_industry_memberships) is PUBLIC (anon SELECT):
supabase/migrations/20261105091000_issuers.sql:21:  issuer_id               uuid primary key,
supabase/migrations/20261105091000_issuers.sql:70:create table if not exists public.issuer_securities (
supabase/migrations/20261105091000_issuers.sql:81:  primary key (issuer_id, ticker, valid_from),
supabase/migrations/20261105091000_issuers.sql:83:  constraint issuer_securities_window check (valid_to is null or valid_to > valid_from),
supabase/migrations/20261105091000_issuers.sql:84:  constraint issuer_securities_provenance_object check (jsonb_typeof(provenance) = 'object')
supabase/migrations/20261105091000_issuers.sql:87:create unique index if not exists issuer_securities_open_owner_idx on public.issuer_securities(ticker) where valid_to is null;
supabase/migrations/20261105091000_issuers.sql:88:create unique index if not exists issuer_securities_isin_idx on public.issuer_securities(isin, valid_from) where isin is not null;
supabase/migrations/20261105091000_issuers.sql:90:-- reports the clearer issuer_securities_open_owner_idx name; every other overlap reports this one.
supabase/migrations/20261105091000_issuers.sql:92:  if not exists (select 1 from pg_constraint where conrelid = 'public.issuer_securities'::regclass and conname = 'issuer_securities_no_overlap') then
supabase/migrations/20261105091000_issuers.sql:93:    alter table public.issuer_securities add constraint issuer_securities_no_overlap
supabase/migrations/20261105091000_issuers.sql:100:  if not exists (select 1 from pg_constraint where conrelid = 'public.issuer_securities'::regclass and conname = 'issuer_securities_isin_no_overlap') then
supabase/migrations/20261105091000_issuers.sql:101:    alter table public.issuer_securities add constraint issuer_securities_isin_no_overlap
supabase/migrations/20261105091000_issuers.sql:107:create or replace function public.issuer_securities_owner_active() returns trigger
supabase/migrations/20261105091000_issuers.sql:120:drop trigger if exists issuer_securities_owner_active on public.issuer_securities;
supabase/migrations/20261105091000_issuers.sql:121:create trigger issuer_securities_owner_active before insert or update on public.issuer_securities
supabase/migrations/20261105091000_issuers.sql:122:  for each row execute function public.issuer_securities_owner_active();
supabase/migrations/20261105091000_issuers.sql:129:     and exists (select 1 from public.issuer_securities s where s.issuer_id = new.issuer_id and s.valid_to is null) then
supabase/migrations/20261105091000_issuers.sql:140:  id          uuid primary key,
supabase/migrations/20261105091000_issuers.sql:161:  primary key (scheme, version, code),
supabase/migrations/20261105091000_issuers.sql:177:  primary key (issuer_id, scheme, version, code, valid_from),
supabase/migrations/20261105091000_issuers.sql:192:  foreach t in array array['issuers','issuer_securities','issuer_identifier_claims','industry_classifications','issuer_industry_memberships'] loop
supabase/migrations/20261105091000_issuers.sql:197:  foreach t in array array['issuers','issuer_securities','industry_classifications','issuer_industry_memberships'] loop
supabase/migrations/20260922090000_research_s4.sql:22:  primary key(user_id,payload_hash),
supabase/migrations/20260922090000_research_s4.sql:40: user_id uuid primary key references auth.users(id),

exec
/bin/zsh -lc "rg -n 'outputFile|api/admin/dq|fixtures/gold' next.config.mjs; cat src/lib/dq/reconcile/pair-us-ixbrl.ts | grep -A45 'currentRight'; sed -n '530,550p' docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md; find /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude -maxdepth 2 -name 'AGENTS*'; nl -ba src/app/api/admin/dq/route.ts | head -30; rg -n 'pace|sleep|fetch' src/lib/dq/reconcile/ixbrl*.ts src/lib/dq/reconcile/pair-us-ixbrl.ts" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 12ms:
3:const RECONCILE_MANIFESTS = ['./src/lib/dq/fixtures/gold/**/*.json', './src/lib/facts/fixtures/gold/*.json'];
9:  outputFileTracingRoot: process.cwd(),
12:  outputFileTracingIncludes: {
14:    '/api/admin/dq/quarantine/[id]': RECONCILE_MANIFESTS,
15:    '/api/admin/dq': RECONCILE_MANIFESTS,
// currentRight (restore, plan audit P2): the sample filing that holds the result's natural key, its primary
// document fetched NOW and hashed; unobtainable (sample gone, not inline, 404, too large, SEC down) → null.
// sec.filer_category is NOT recorded here: its single producer is scripts/dq/filer-categories.ts (Task 17b,
// spec §6.1; plan 3 接口对齐记录). filerClass stays exported for select-us-sample.ts.
import {conceptById} from '../../facts/concepts';
import {tagsOf} from '../../facts/providers/edgar-companyfacts';
import {secPacer,sleep} from '../../facts/providers/shared';
import {memoryRawStore} from '../raw-store';
import type {RawStore} from '../raw-store';
import type {FactRow} from '../../facts/types';
import {DEFAULT_USER_AGENT} from '../../research/ingest/collectors/shared';
import {compareDecimal} from './decimal';
import {computeInputsHash} from './inputs-hash';
import {IXBRL_PARSER_VERSION,IxbrlParseError,MAX_IXBRL_BYTES,indexIxFacts,ixFactKey,parseInlineXbrl} from './ixbrl';
import type {IxbrlDocument,IxFact} from './ixbrl';
import {ReconcileConfigError,runContextOf,actionFor,activeRows,comparedNumeric,factKeyOf,mismatchItem,notCompared,openMismatches,readRepoJson,sha256Hex} from './pair-support';
import type {RegisteredPair} from './pair-support';
import type {MemberPlan,PairContext,ReconcileOutcome,ReconcileResultInput} from './types';
import {US_SAMPLE_PATH,US_SAMPLE_SCHEMA,entityIs,usNaturalKey,validateUsSample} from './us-sample';
import type {SampleFiling,UsSample} from './us-sample';

const PAIR='us.companyfacts_vs_ixbrl' as const;
const SIDES={left_source:'edgar.companyfacts',right_source:'edgar.ixbrl'};
const RESERVE_MS=10_000;

export type DocFetch={status:'ok';bytes:Uint8Array}|{status:'not_found'}|{status:'too_large';content_length:number|null;bytes_read:number};
/** Raw-evidence metadata never carries a query string, fragment or credentials: scheme, host and path only. */
const evidenceUrl=(u:string):string=>{try{const x=new URL(u);return `${x.protocol}//${x.host}${x.pathname}`;}catch{return '';}};
const FAILURE_BODY_CAP=1024*1024;
/** Dry runs never write production storage: evidence goes to an ephemeral in-memory store (hashes are still computed locally). */
const storeOf=(ctx:PairContext):RawStore=>runContextOf(ctx).dryRun?memoryRawStore():ctx.raw;
/**
 * Reads at most `limit` bytes of the body while streaming; past the limit the stream is cancelled and
 * exceeded=true (bytes then hold the first `limit` bytes). A response without a stream falls back to arrayBuffer.
 */
export async function readLimited(res:Response,limit:number):Promise<{bytes:Uint8Array;exceeded:boolean}>{
 if(!res.body){const all=new Uint8Array(await res.arrayBuffer());return all.byteLength>limit?{bytes:all.slice(0,limit),exceeded:true}:{bytes:all,exceeded:false};}
 const reader=res.body.getReader();const chunks:Uint8Array[]=[];let n=0;
 for(;;){
  const {done,value}=await reader.read();
  if(done)break;
  if(n+value.byteLength>limit){chunks.push(value.slice(0,limit-n));n=limit;await reader.cancel().catch(()=>undefined);return {bytes:concat(chunks,n),exceeded:true};}
  chunks.push(value);n+=value.byteLength;
 }
 return {bytes:concat(chunks,n),exceeded:false};
}
--
  async currentRight(ctx,rec){
   let sample:UsSample;
   try{sample=(await loadSample(ctx)).sample;}catch(e){if(e instanceof ReconcileConfigError)return null;throw e;}
   const nk=String(rec.natural_key);
   const entry=sample.issuers.flatMap(i=>i.filings.map(f=>({cik:i.cik,f}))).find(x=>x.f.expected_keys.some(k=>usNaturalKey(x.cik,x.f.accn,k)===nk))?.f;
   if(!entry||entry.is_inline_xbrl===false)return null;
   try{const got=await fetchSecDocument(entry.doc_url,ctx);return got.status==='ok'?sha256Hex(got.bytes):null;}
   catch(e){console.error('[reconcile] current right document',e instanceof Error?e.message:String(e));return null;}
  },
  async members(ctx){
   const {sample}=await loadSample(ctx);
   const out:MemberPlan[]=[];
   for(const iss of sample.issuers){
    const [row]=await ctx.tables.select('issuers',{cik:iss.cik},{limit:1});
    if(!row)throw new ReconcileConfigError('issuer_unresolved',`cik ${iss.cik}`);
    out.push({issuerId:String(row.issuer_id),market:'US',expectedKeys:iss.filings.flatMap(f=>f.expected_keys.map(k=>({naturalKey:usNaturalKey(iss.cik,f.accn,k),locator:{cik:iss.cik,accn:f.accn,concept:k.concept,period_start:k.period_start,period_end:k.period_end,unit:k.unit,source_concept:k.source_concept,origin:k.origin}})))});
   }
   return out;
  },
  async evaluate(ctx,member){
   const {sample,sha256:sampleSha}=await loadSample(ctx);
   const open=await openMismatches(ctx.tables,PAIR,'US');
   const results:ReconcileResultInput[]=new Array(member.expectedKeys.length);
   const groups=new Map<string,number[]>();
   member.expectedKeys.forEach((k,i)=>{const loc=k.locator as unknown as KeyLoc;const g=`${loc.cik}|${loc.accn}`;groups.set(g,[...(groups.get(g)??[]),i]);});
   for(const [g,idxs] of groups){
    const [cik,accn]=g.split('|');
    const entry=sample.issuers.find(x=>x.cik===cik)?.filings.find(f=>f.accn===accn);
    const every=(outcome:Exclude<ReconcileOutcome,'compared'>,detail:Record<string,unknown>)=>{for(const i of idxs)results[i]=notCompared(member.expectedKeys[i].naturalKey,'numeric',outcome,SIDES,{accn,...detail});};
    if(!entry){every('unsupported',{reason:'sample_changed'});continue;}
    const filing=await ctx.db.findFilingBySourceRef('edgar',accn);
    if(!filing){every('left_unlinked',{});continue;}
    const right=await rightSide(ctx,entry,cik);
    const byKey=new Map<string,FactRow[]>();
    if(right.kind==='ok'||open.size>0)for(const r of activeRows(await ctx.db.readFilingFacts(filing.filing_id,true),filing)){const kf=factKeyOf(r);byKey.set(kf,[...(byKey.get(kf)??[]),r]);}
    for(const i of idxs){
     const k=member.expectedKeys[i];const loc=k.locator as unknown as KeyLoc;const nk=k.naturalKey;
     const bound=open.get(nk);
     const rows=bound?(await ctx.db.factsByIds([bound.factIds[0]])).slice(0,1):(byKey.get(factKeyOf(loc))??[]);
     const left=rows.length===1?rows[0]:null;
     const rightSha=right.sha256;
     const inputs_hash=computeInputsHash({left_raw_hash:left?.raw_hash??'',right_sha256:rightSha,gold_or_sample_sha256:sampleSha,parser_version:IXBRL_PARSER_VERSION});
     const base={accn,origin:loc.origin,unit:loc.unit,tolerance_rule:'exact/1',inputs_hash,
      left:left?{fact_id:left.fact_id,raw_hash:left.raw_hash,status:left.status,precision:null,precision_note:'not_retained'}:null};
     const backToItem=bound!==undefined&&left!==null;
     const nc=(outcome:Exclude<ReconcileOutcome,'compared'>,detail:Record<string,unknown>)=>notCompared(nk,'numeric',outcome,SIDES,{...base,...detail},{inputs_hash,...(left?{left_fact_id:left.fact_id}:{}),...(backToItem?{action:'quarantine_left' as const,item:mismatchItem(PAIR,nk,left!,null,{document:entry.doc_url,accn},inputs_hash)}:{})});
### 7.2 `/admin/dq` 页面流（视觉另在 Claude Design 画布设计）

结构：指标卡 → 新鲜度 → **披露日历** → 批次 → 隔离 → **标识符声明** → 对账失败。

- **指标卡**：新增"逾期披露"（法定逾期之和，> 0 红；note `US n · CN m · 已申报未入库 k · 上游不可查 u`）。
- **披露日历面板**：筛选 `market`；主表列：ticker/发行人、市场、报告种类、期末（估计加标记）、期限状态（法定/估计/无规则）、应披露日、规则、预约日、上游申报日、披露状态 Pill（`overdue` 红、`filed_not_ingested` 黄、`unknown_upstream` 灰斜、`pending` 灰、`received_late` 黄、`received` 默认）、逾期天数；下方折叠"无规则行"列表。空状态文案两处。
- **标识符声明面板**：列：时间、发行人、op、类型、值、证据类别、来源、详情（折叠 JSON 含 target/params）、操作；`evidence_only` 行的"接受"打开修订表单（证券行选择 + 生效日 + 方法），提交为 `amend`；`legacy` 行只显示"需 SQL 处理"；409 文案；小屏卡片。
- **隔离面板**：`ambiguous_value` 候选单选 → "接受并采用候选 n"；`lineage_conflict` 显示各发行人的值并单选"保留此行"；`reconcile_mismatch` 显示 `latest_result`（通过且输入未变时"恢复"可用，否则禁用并说明）。
- **对账失败面板**：`pair`、`kind`、`outcome` 列；按 pair 的计数条含最近周期状态；详情展开。
- **新鲜度面板**：`dq.calendar.*`、`reconcile.*`（weekly）并入。
- i18n：`messages/{zh,en}/admin.json` 的 `dq` 下新增键（tiles/sections/columns/calendar/claims/quarantine 各组，与上面文案一一对应）；`messages/parity.test.ts` 比较 zh/en 键集。
- 组件与 tokens 复用现有，无新颜色。

**Claude Design 画布待设计清单**：1. 五张指标卡布局；2. 披露日历面板（市场筛选、三种期限状态、六态 Pill、估计/无规则提示、折叠区、空状态）；3. 标识符声明面板（表格/卡片、`evidence_only` 修订表单、冲突提示）；4. 隔离面板三种行内交互（候选单选、谱系保留单选、恢复按钮状态）；5. 对账失败面板的 pair 计数条与周期状态。

---

## 8. 错误处理

| 情形 | 行为 | 码 | 批次 |
|---|---|---|---|
     1	import { NextResponse } from 'next/server';
     2	import {
     3	  AdminForbidden,
     4	  AdminUnauthenticated,
     5	  requireAdminUser,
     6	} from '@/lib/admin/auth';
     7	import { supabaseTableClient } from '@/lib/db/table-client';
     8	import { loadDqDashboard, parseDqQuery } from '@/lib/dq/dashboard';
     9	import { restoreInputsHashNow } from '@/lib/dq/reconcile/deps';
    10	import { getAdminSupabase } from '@/lib/supabase/admin';
    11	
    12	export const dynamic = 'force-dynamic';
    13	
    14	export async function GET(request: Request) {
    15	  try {
    16	    await requireAdminUser();
    17	    const parsed = parseDqQuery(new URL(request.url).searchParams);
    18	    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    19	    const admin = getAdminSupabase();
    20	    const client = supabaseTableClient(admin);
    21	    return NextResponse.json(
    22	      await loadDqDashboard(client, parsed.query, new Date(), { inputsHashNow: restoreInputsHashNow(admin) }),
    23	    );
    24	  } catch (error) {
    25	    if (error instanceof AdminUnauthenticated) {
    26	      return NextResponse.json({ error: 'authentication required' }, { status: 401 });
    27	    }
    28	    if (error instanceof AdminForbidden) {
    29	      return NextResponse.json({ error: 'admin role required' }, { status: 403 });
    30	    }
src/lib/dq/reconcile/pair-us-ixbrl.ts:4://  1. no local filing (edgar, accn) → every key left_unlinked (the document is not fetched);
src/lib/dq/reconcile/pair-us-ixbrl.ts:5://  2. right document: is_inline_xbrl=false → unsupported(not_inline_xbrl); else GET doc_url with the shared process-wide SEC pacer
src/lib/dq/reconcile/pair-us-ixbrl.ts:23:// document fetched NOW and hashed; unobtainable (sample gone, not inline, 404, too large, SEC down) → null.
src/lib/dq/reconcile/pair-us-ixbrl.ts:28:import {secPacer,sleep} from '../../facts/providers/shared';
src/lib/dq/reconcile/pair-us-ixbrl.ts:75:export async function fetchSecDocument(url:string,ctx:PairContext):Promise<DocFetch>{
src/lib/dq/reconcile/pair-us-ixbrl.ts:81:  const res=await ctx.fetch(url,{headers:{'User-Agent':ua,Accept:'text/html,application/xhtml+xml'},signal:AbortSignal.any([ctx.budget.signal,AbortSignal.timeout(timeout)])});
src/lib/dq/reconcile/pair-us-ixbrl.ts:86:   if(attempt<2){await sleep(1000*2**attempt,ctx.budget.signal);continue;}
src/lib/dq/reconcile/pair-us-ixbrl.ts:117: const got=await fetchSecDocument(f.doc_url,ctx);
src/lib/dq/reconcile/pair-us-ixbrl.ts:141:   try{const got=await fetchSecDocument(entry.doc_url,ctx);return got.status==='ok'?sha256Hex(got.bytes):null;}
src/lib/dq/reconcile/ixbrl.ts:26://    (whitespace-collapsed raw text; a second, different text → unsupported(nonnumeric_conflict)).
src/lib/dq/reconcile/ixbrl.ts:34:export const NS={ix:'http://www.xbrl.org/2013/inlineXBRL',xbrli:'http://www.xbrl.org/2003/instance',xbrldi:'http://xbrl.org/2006/xbrldi',xsi:'http://www.w3.org/2001/XMLSchema-instance',iso4217:'http://www.xbrl.org/2003/iso4217',xml:'http://www.w3.org/XML/1998/namespace'} as const;
src/lib/dq/reconcile/ixbrl.ts:69:   // end tag: '</' + the element name (case-insensitive) + whitespace or '>'; no whole-document lowercasing (length-changing case folds)
src/lib/dq/reconcile/ixbrl.ts:109:   if(j<n&&!isWs(doc.charCodeAt(j))&&doc[j]!=='>'&&doc[j]!=='/')fail('bad_attribute');   // attributes need separating whitespace
src/lib/dq/reconcile/ixbrl.ts:124:export type NsMap=ReadonlyMap<string,string>;   // prefix ('' = default namespace) → URI
src/lib/dq/reconcile/ixbrl.ts:125:/** Element names and QName values use the default namespace when unprefixed (useDefault); plain attribute names never do. */
src/lib/dq/reconcile/ixbrl.ts:132:/** Canonical concept name: us-gaap / dei / ifrs-full / srt by namespace URI pattern (any taxonomy year), else Clark notation {uri}local. */
src/lib/dq/reconcile/ixbrl.ts:281:    // namespace and local name are validated together: iso4217 → ISO currency code, xbrli → shares | pure
src/lib/dq/reconcile/ixbrl-trim.test.ts:46:  it('re-declares namespaces bound on an ancestor (body) for facts, contexts and QName measures',()=>{
src/lib/dq/reconcile/ixbrl.test.ts:46: it('reads only the three dei nonNumeric facts, whitespace-collapsed',()=>{
src/lib/dq/reconcile/ixbrl.test.ts:55: it('resolves namespaces by xmlns declarations: a document with every prefix renamed parses identically',()=>{
src/lib/dq/reconcile/ixbrl.test.ts:60: it('an element named nonFraction in a foreign namespace is not a fact',()=>{
src/lib/dq/reconcile/ixbrl.test.ts:174: it('validates measure namespace and local name together',()=>{
src/lib/dq/reconcile/ixbrl.test.ts:233:  ['no whitespace between attributes','<a x="1"y="2"/>','bad_attribute'],
src/lib/dq/reconcile/ixbrl-pair.integration.test.ts:88: let sampleBytes:Uint8Array=new Uint8Array();let firstCycle='';let scope:{issuer_id:string;fetch_key:string}[]=[];   // widened: buildSample returns Uint8Array (plan audit P10)
src/lib/dq/reconcile/ixbrl-pair.integration.test.ts:89: const fakeFetch=(async(url:string|URL)=>{const b=docs.get(String(url));return b?new Response(new Uint8Array(b),{status:200}):new Response('',{status:404});}) as unknown as typeof fetch;   // owned copy = DOM BodyInit
src/lib/dq/reconcile/ixbrl-pair.integration.test.ts:91: const rdeps=():ReconcileDeps=>({db,tables,raw:memoryRawStore(),fetch:fakeFetch,readRepoFile,now:()=>new Date(),deadline:null,codeVersion:'test',pairs:{[PAIR]:usCompanyfactsVsIxbrlPair()}});
src/lib/dq/reconcile/ixbrl-pair.integration.test.ts:92: const pairCtx=(over:Partial<PairContext>={}):PairContext=>({db,tables,raw:memoryRawStore(),now:()=>new Date(),budget:makeBudget(null),fetch:fakeFetch,readRepoFile,...over});
src/lib/dq/reconcile/ixbrl-pair.integration.test.ts:121:  scope=Object.entries(ids).map(([t,id])=>({issuer_id:id,fetch_key:(t==='ZZ'?ZZ.cik:rekeyCik(REAL.find(r=>r.ticker===t)!.cik)).padStart(10,'0')}));
src/lib/dq/reconcile/ixbrl-pair.integration.test.ts:126:   fetchUs:async(cik10:string):Promise<RawSnapshot>=>{const b=fixtures.get(cik10);if(!b)throw new ProviderError('no_companyfacts',cik10);return snapshotOf(b,{source:'edgar',url:companyFactsUrl(cik10)});},
src/lib/dq/reconcile/ixbrl-pair.integration.test.ts:127:   fetchCn:async()=>{throw new ProviderError('tushare_unavailable','not in this suite');},

exec
/bin/zsh -lc "sed -n '75,90p' src/lib/dq/reconcile/pair-us-ixbrl.ts; rg -n 'secPacer' src/lib/facts/providers/shared.ts; sed -n '1,75p' src/lib/facts/providers/shared.ts; git rev-parse HEAD; find src -name '*AGENTS*'; nl -ba src/lib/dq/dashboard-blocks.ts | tail -22; rg -n 'delete.*reconciliation|delete from public.dq_reconciliations' supabase/migrations src | head" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
export async function fetchSecDocument(url:string,ctx:PairContext):Promise<DocFetch>{
 const ua=process.env.EDGAR_USER_AGENT??DEFAULT_USER_AGENT;
 for(let attempt=0;;attempt++){
  await secPacer.admit({budget:ctx.budget,reserveMs:RESERVE_MS});
  const timeout=Math.min(60_000,ctx.budget.remainingMs()-RESERVE_MS);
  if(!(timeout>0))throw new Error('sec_unavailable:budget_exhausted');
  const res=await ctx.fetch(url,{headers:{'User-Agent':ua,Accept:'text/html,application/xhtml+xml'},signal:AbortSignal.any([ctx.budget.signal,AbortSignal.timeout(timeout)])});
  if(res.status===404){await storeFailure(ctx,res,url);return {status:'not_found'};}
  if(res.status===429){await storeFailure(ctx,res,url);throw new Error('sec_rate_limited');}   // a run failure at once: no retry against a throttling SEC
  if(res.status>=500){
   await storeFailure(ctx,res,url);
   if(attempt<2){await sleep(1000*2**attempt,ctx.budget.signal);continue;}
   throw new Error(`sec_unavailable:http_${res.status}`);
  }
  if(!res.ok){await storeFailure(ctx,res,url);throw new Error(`sec_unavailable:http_${res.status}`);}
  const cl=res.headers.get('content-length'),declared=cl!==null&&/^\d+$/.test(cl)?Number(cl):null;
79:export const secPacer:Pacer=createPacer(SEC_MIN_INTERVAL_MS);
// src/lib/facts/providers/shared.ts
// Provider plumbing shared by the EDGAR and Tushare adapters (spec §6.2/§6.3; §4.7 raw_hash rule):
// typed provider failures (ProviderError IS SyncError from ../errors, so sync.ts reads `code` as the
// batch error code without re-wrapping), snapshot construction with sha256, the raw_hash locator rule
// sha256(snapshot.sha256 + "\n" + locator), and a number-preserving JSON serialiser used by the
// fixture recorder (never JSON.parse → stringify a financial value).
import {createHash} from 'node:crypto';
import {SyncError} from '../errors';
import type {SyncErrorCode} from '../errors';
import type {Budget,Duration,RawSnapshot} from '../types';

export type ProviderErrorCode=SyncErrorCode;
export const ProviderError=SyncError;
export type ProviderError=SyncError;

export const sha256Hex=(data:Uint8Array|string)=>createHash('sha256').update(data).digest('hex');
export const rawHashOf=(snapshotSha256:string,locator:string)=>sha256Hex(`${snapshotSha256}\n${locator}`);
export function snapshotOf(bytes:Uint8Array,meta:Partial<RawSnapshot['meta']>&{source:RawSnapshot['meta']['source']}):RawSnapshot{
 return {bytes,sha256:sha256Hex(bytes),meta:{fetched_at:new Date().toISOString(),http_status:200,...meta}};
}
export const padCik=(cik:string|number)=>String(cik).replace(/^0+/,'').padStart(10,'0');
export const ymd=(d:string)=>/^\d{8}$/.test(d)?`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`:d;
const BUCKETS:[number,Duration][]=[[90,'3M'],[182,'6M'],[273,'9M'],[365,'12M']];
/** Closest duration bucket for an odd period length; only used to type oddDuration candidates (never written as facts). */
export const nearestDuration=(days:number):Duration=>BUCKETS.reduce((best,cur)=>Math.abs(cur[0]-days)<Math.abs(best[0]-days)?cur:best)[1];
export function sleep(ms:number,signal:AbortSignal):Promise<void>{
 return new Promise((resolve,reject)=>{
  if(signal.aborted)return reject(signal.reason);
  const onAbort=()=>{clearTimeout(t);reject(signal.reason);};
  const t=setTimeout(()=>{signal.removeEventListener('abort',onAbort);resolve();},ms);
  signal.addEventListener('abort',onAbort,{once:true});
 });
}
/** Thrown by Pacer.admit; the message is the fixed code. Adapters map it to their own ProviderError code. */
export class PacerError extends Error{constructor(public readonly code:'budget_aborted'|'budget_exhausted'){super(code);this.name='PacerError';}}
export interface AdmitOptions{budget:Budget;reserveMs:number;now?:()=>number;sleep?:typeof sleep;minIntervalMs?:number}
export interface Pacer{admit(o:AdmitOptions):Promise<void>;reset():void}
/**
 * One process-wide request pacer per upstream. Admissions are SERIALISED (a promise chain), and each wait is computed from the
 * previous ACTUAL dispatch time recorded when admit() resolves, so a timer delayed by the event loop can never let two requests
 * start closer than the interval. A wait that would end inside the cleanup reserve (remaining - wait <= reserveMs) is rejected
 * up front with budget_exhausted instead of sleeping; an aborted budget gives budget_aborted (a queued caller is released as soon
 * as its own signal aborts, and its entry is skipped when its turn comes). The caller issues its request
 * right after admit() resolves.
 */
export function createPacer(defaultIntervalMs:number):Pacer{
 let chain:Promise<void>=Promise.resolve();let lastStart=-Infinity;
 const run=async(o:AdmitOptions)=>{
  const now=o.now??Date.now,wait=o.sleep??sleep,interval=o.minIntervalMs??defaultIntervalMs;
  const check=()=>{if(o.budget.signal.aborted)throw new PacerError('budget_aborted');if(o.budget.remainingMs()<=o.reserveMs)throw new PacerError('budget_exhausted');};
  check();
  const gap=lastStart+interval-now();
  if(gap>0){
   if(o.budget.remainingMs()-gap<=o.reserveMs)throw new PacerError('budget_exhausted');
   try{await wait(gap,o.budget.signal);}catch{throw new PacerError('budget_aborted');}
   check();                                  // the budget may have run out or been cancelled while waiting
  }
  lastStart=now();
 };
 return {
  admit(o){
   // The internal chain keeps serialising; the caller-facing promise also races its OWN signal, so an aborted caller is released
   // at once instead of waiting behind earlier admissions. When its turn comes the cancelled entry is skipped by run()'s first
   // check (no dispatch, lastStart unchanged).
   const p=chain.then(()=>run(o));chain=p.catch(()=>undefined);
   const signal=o.budget.signal;
   if(signal.aborted)return Promise.reject(new PacerError('budget_aborted'));
   return new Promise<void>((resolve,reject)=>{
    const onAbort=()=>reject(new PacerError('budget_aborted'));
    signal.addEventListener('abort',onAbort,{once:true});
    p.then(resolve,reject).finally(()=>signal.removeEventListener('abort',onAbort));
   });
  },
  reset(){chain=Promise.resolve();lastStart=-Infinity;},
 };
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-sTc6hbgV' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-kZH90GWg' (errno=Operation not permitted)
46c5b70f2625045ed334e8b3fb81fbccf143cd58
    61	/** Distinct (pair, natural_key) whose LATEST row failed: out-of-cycle recordReconciliation dedupe is best-effort (Task 14c), so raw row counts would double-count. */
    62	function failedDistinct(rows:Row[]):number{
    63	 const latest=new Map<string,Row>();
    64	 for(const r of rows){
    65	  const k=String(r.natural_key??r.id);
    66	  const cur=latest.get(k);
    67	  if(!cur||String(r.created_at??'')>String(cur.created_at??'')||(String(r.created_at??'')===String(cur.created_at??'')&&String(r.id)>String(cur.id)))latest.set(k,r);
    68	 }
    69	 return [...latest.values()].filter(r=>r.passed===false).length;
    70	}
    71	export async function loadReconciliationsByPair(client:TableClient):Promise<ReconciliationsByPair>{
    72	 const cyclePairs=new Set<string>(CYCLE_PAIR_IDS);
    73	 const entries=await Promise.all(RECONCILE_PAIR_IDS.map(async pair=>{
    74	  const [rows,cycles]=await Promise.all([
    75	   selectAll(client,'dq_reconciliations',{pair},'id'),
    76	   cyclePairs.has(pair)?client.select('dq_reconcile_cycles',{pair},{orderBy:'started_at',desc:true,limit:1}):Promise.resolve([] as Row[]),
    77	  ]);
    78	  const c=cycles[0];
    79	  return [pair,{failed:failedDistinct(rows),lastCycle:c?{cycle_id:String(c.cycle_id),status:String(c.status),finished_at:c.finished_at==null?null:String(c.finished_at)}:null}] as const;
    80	 }));
    81	 return Object.fromEntries(entries);
    82	}
src/lib/dq/dq-foundation.integration.test.ts:49:   await admin.query(`delete from public.dq_reconciliations where dataset=any($1) or batch_id=any($2::uuid[])`,[datasets,batches]);

exec
/bin/zsh -lc "git show f272c11:next.config.mjs | head -22; git diff f272c11 HEAD -- src/lib/dq/reconcile/deps.ts src/lib/dq/reconcile/pairs.ts src/lib/dq/dashboard-blocks.ts; git ls-tree -r --name-only f272c11 | grep -E '("'^|/)(AGENTS('"\\.override)?\\.md|CLAUDE.md)"'$'"'" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 14ms:
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-sMtPr01O' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-elAq4VpM' (errno=Operation not permitted)
import createNextIntlPlugin from 'next-intl/plugin';

const RECONCILE_MANIFESTS = ['./src/lib/dq/fixtures/gold/**/*.json', './src/lib/facts/fixtures/gold/*.json'];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
  outputFileTracingRoot: process.cwd(),
  // The reconcile cron reads the sample and gold manifests at runtime (src/lib/dq/reconcile/deps.ts); so do the
  // quarantine restore route and the admin dq dashboard (restoreInputsHashNow recomputes the current inputs hash).
  outputFileTracingIncludes: {
    '/api/cron/reconcile': RECONCILE_MANIFESTS,
    '/api/admin/dq/quarantine/[id]': RECONCILE_MANIFESTS,
    '/api/admin/dq': RECONCILE_MANIFESTS,
  },
  // Ignore the archived static demo
  webpack: (config) => {
    config.watchOptions = { ...config.watchOptions, ignored: ['**/legacy-demo/**'] };
    return config;
  },
  async redirects() {
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-qNlfeDCl' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-q7lmQka7' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-hOhEXzDY' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-i5SRftG4' (errno=Operation not permitted)

codex
The new per-pair counters introduce an unbounded historical-data download on every dashboard request, creating a performance regression as reconciliation history grows.

Review comment:

- [P2] Aggregate reconciliation failure counts in the database — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/dashboard-blocks.ts:73-75
  As reconciliation cycles accumulate, every dashboard request now downloads the entire reconciliation history for all seven pairs, including successful rows and their detail payloads. `selectAll` retains every page in memory before `failedDistinct` reduces it, so even a single quarantine-page request incurs work proportional to the full historical dataset. Compute the latest-per-natural-key failure counts in SQL and return only the aggregates, preserving deduplication without an unbounded transfer.
The new per-pair counters introduce an unbounded historical-data download on every dashboard request, creating a performance regression as reconciliation history grows.

Review comment:

- [P2] Aggregate reconciliation failure counts in the database — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/dashboard-blocks.ts:73-75
  As reconciliation cycles accumulate, every dashboard request now downloads the entire reconciliation history for all seven pairs, including successful rows and their detail payloads. `selectAll` retains every page in memory before `failedDistinct` reduces it, so even a single quarantine-page request incurs work proportional to the full historical dataset. Compute the latest-per-natural-key failure counts in SQL and return only the aggregates, preserving deduplication without an unbounded transfer.

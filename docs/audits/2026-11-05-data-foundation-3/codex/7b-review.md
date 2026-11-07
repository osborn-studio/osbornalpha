OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b046-b209-7193-97dd-e9452e25a304
--------
user
commit 5965308
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 5965308; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 419ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-Ut6fFHah' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-SFFRtb2a' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/7b-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-qwQp8E31' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-SGBVBlYd' (errno=Operation not permitted)
5965308 feat(admin): identifier claim review route (resolve_identifier_claim, amend validation, 409 mapping) and A+H linking integration suite (critical)
 scripts/ci/research-checks.ts                  |   2 +-
 src/app/api/admin/dq/claims/[id]/route.test.ts | 132 ++++++++++++++++
 src/app/api/admin/dq/claims/[id]/route.ts      |  95 ++++++++++++
 src/lib/entities/ah-link.integration.test.ts   | 203 +++++++++++++++++++++++++
 4 files changed, 431 insertions(+), 1 deletion(-)

exec
/bin/zsh -lc 'pwd; for p in /AGENTS.md /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do [ ! -f "$p" ] || cat "$p"; done; ls -a; git show 5965308' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
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
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-J2y2WpsN' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-LXNxKf2r' (errno=Operation not permitted)
commit 5965308eba96ae350c0636c4605db836ce9189a3
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 01:52:51 2026 -0800

    feat(admin): identifier claim review route (resolve_identifier_claim, amend validation, 409 mapping) and A+H linking integration suite (critical)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/scripts/ci/research-checks.ts b/scripts/ci/research-checks.ts
index b09ee48..d4aa69a 100644
--- a/scripts/ci/research-checks.ts
+++ b/scripts/ci/research-checks.ts
@@ -12,7 +12,7 @@ export const criticalSuites = [
   'entity-keys/entity-keys.integration.test.ts', 'ledger/calls-import.integration.test.ts',
   'cluster/alignments.integration.test.ts', 'fanout/run.integration.test.ts',
   'cards/cards.integration.test.ts', 'thesis-extension.integration.test.ts', 'weekly/weekly.integration.test.ts',
-].map(p => `src/lib/research/${p}`).concat('src/lib/observability/quote-snapshot.integration.test.ts', 'src/lib/analyst/recommendations-append-only.integration.test.ts', 'src/lib/dq/dq-foundation.integration.test.ts', 'src/lib/entities/issuers.integration.test.ts', 'src/lib/entities/issuers-write.integration.test.ts', 'src/lib/facts/facts.integration.test.ts', 'src/lib/facts/sync-us.integration.test.ts', 'src/lib/entities/identifiers.integration.test.ts');
+].map(p => `src/lib/research/${p}`).concat('src/lib/observability/quote-snapshot.integration.test.ts', 'src/lib/analyst/recommendations-append-only.integration.test.ts', 'src/lib/dq/dq-foundation.integration.test.ts', 'src/lib/entities/issuers.integration.test.ts', 'src/lib/entities/issuers-write.integration.test.ts', 'src/lib/facts/facts.integration.test.ts', 'src/lib/facts/sync-us.integration.test.ts', 'src/lib/entities/identifiers.integration.test.ts', 'src/lib/entities/ah-link.integration.test.ts');
 
 export function migrationInventory(root = process.cwd()) {
   const directory = join(root, 'supabase/migrations');
diff --git a/src/app/api/admin/dq/claims/[id]/route.test.ts b/src/app/api/admin/dq/claims/[id]/route.test.ts
new file mode 100644
index 0000000..a9a21c3
--- /dev/null
+++ b/src/app/api/admin/dq/claims/[id]/route.test.ts
@@ -0,0 +1,132 @@
+// src/app/api/admin/dq/claims/[id]/route.test.ts
+import { beforeEach, describe, expect, it, vi } from 'vitest';
+import { AdminForbidden, AdminUnauthenticated } from '@/lib/admin/auth';
+import { memoryTableClient } from '@/lib/db/memory-table-client';
+
+const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), getAdmin: vi.fn(), rpc: vi.fn(), insert: vi.fn(), from: vi.fn(), client: null as unknown }));
+vi.mock('@/lib/admin/auth', async (importOriginal) => {
+  const original = await importOriginal<typeof import('@/lib/admin/auth')>();
+  return { ...original, requireAdminUser: mocks.requireAdmin };
+});
+vi.mock('@/lib/supabase/admin', () => ({ getAdminSupabase: mocks.getAdmin }));
+vi.mock('@/lib/db/table-client', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/db/table-client')>(), supabaseTableClient: () => mocks.client }));
+
+import { POST } from './route';
+
+const ID = '3f2b6c1e-8a4d-4f0e-9b7a-1c2d3e4f5a6b';
+const ADMIN = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
+const ISSUER = '10000000-0000-4000-8000-000000000009';
+const URL_ = `https://alpha.example/api/admin/dq/claims/${ID}`;
+const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });
+const post = (body: unknown, headers: Record<string, string> = { 'content-type': 'application/json' }, id = ID) =>
+  POST(new Request(URL_, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) }), ctx(id));
+const EVIDENCE = { source: 'sec_submissions', as_of: '2026-11-05', evidence_sha256: 'f'.repeat(64), locator: 'recent#accessionNumber=0000999001-25-000031' };
+const CLAIM = {
+  id: ID, issuer_id: ISSUER, id_type: 'ticker', value: '0000999001-25-000031', source: 'sec_submissions', op: 'evidence_only', status: 'pending',
+  detail: { schema: 'claim/1', evidence_kind: 'filing_form', target: { issuer_id: ISSUER }, params: { suggested_op: 'close_security' }, evidence: EVIDENCE, sources: [EVIDENCE] },
+};
+const AMEND = { op: 'close_security', target: { issuer_id: ISSUER, ticker: 'ZZF', valid_from: '2020-01-01' }, params: { valid_to: '2025-09-22', valid_to_method: 'delisting' } };
+
+describe('POST /api/admin/dq/claims/[id]', () => {
+  beforeEach(async () => {
+    vi.clearAllMocks();
+    const client = memoryTableClient({ issuer_identifier_claims: ['id'] });
+    await client.insert('issuer_identifier_claims', CLAIM);
+    mocks.client = client;
+    mocks.requireAdmin.mockResolvedValue({ id: ADMIN });
+    mocks.insert.mockResolvedValue({ error: null });
+    mocks.from.mockReturnValue({ insert: mocks.insert });
+    mocks.getAdmin.mockReturnValue({ rpc: mocks.rpc, from: mocks.from });
+    mocks.rpc.mockResolvedValue({ data: { op: 'close_security', applied: true, amended: true }, error: null });
+  });
+
+  it('accepts with an amend: calls resolve_identifier_claim, audits and answers 200', async () => {
+    const res = await post({ status: 'accepted', amend: AMEND }, { 'content-type': 'application/json; charset=utf-8', origin: 'https://alpha.example' });
+    expect(res.status).toBe(200);
+    expect(await res.json()).toEqual({ id: ID, status: 'accepted', op: 'close_security', applied: true, amended: true });
+    expect(mocks.rpc).toHaveBeenCalledWith('resolve_identifier_claim', { p_id: ID, p_status: 'accepted', p_resolved_by: ADMIN, p_amend: AMEND });
+    expect(mocks.from).toHaveBeenCalledWith('research_audit_log');
+    expect(mocks.insert.mock.calls[0][0]).toMatchObject({ user_id: ADMIN, action: 'dq.claim_resolve', object_type: 'dq', object_id: ID,
+      detail: { id: ID, status: 'accepted', op: 'close_security', applied: true, amended: true } });
+  });
+
+  it('rejects without an amend and passes p_amend null', async () => {
+    mocks.rpc.mockResolvedValue({ data: { op: 'evidence_only', applied: false, amended: false }, error: null });
+    const res = await post({ status: 'rejected' });
+    expect(res.status).toBe(200);
+    expect(mocks.rpc).toHaveBeenCalledWith('resolve_identifier_claim', { p_id: ID, p_status: 'rejected', p_resolved_by: ADMIN, p_amend: null });
+  });
+
+  it('checks auth first (401/403), then content type (415), then Origin (403), then the id (400)', async () => {
+    mocks.requireAdmin.mockRejectedValueOnce(new AdminUnauthenticated('x'));
+    expect((await post({ status: 'accepted' }, { 'content-type': 'text/plain' })).status).toBe(401);
+    mocks.requireAdmin.mockRejectedValueOnce(new AdminForbidden('x'));
+    expect((await post({ status: 'accepted' }, { 'content-type': 'text/plain' })).status).toBe(403);
+    expect((await post({ status: 'accepted' }, { 'content-type': 'text/plain', origin: 'https://evil.example' })).status).toBe(415);
+    expect((await POST(new Request(URL_, { method: 'POST', body: '{}' }), ctx())).status).toBe(415);
+    expect((await post({ status: 'accepted' }, { 'content-type': 'application/json', origin: 'https://evil.example' }, 'nope')).status).toBe(403);
+    const bad = await post({ status: 'accepted' }, { 'content-type': 'application/json' }, 'nope');
+    expect(bad.status).toBe(400);
+    expect(await bad.json()).toEqual({ error: 'invalid_id' });
+    expect(mocks.rpc).not.toHaveBeenCalled();
+  });
+
+  it('400 for a bad status, an amend on a rejection, a malformed amend or one that fails validateClaimDetail', async () => {
+    const code = async (body: unknown) => { const r = await post(body); return [r.status, (await r.json()).error]; };
+    expect(await code({ status: 'resolved_accept' })).toEqual([400, 'invalid_status']);
+    expect(await code('not json')).toEqual([400, 'invalid_status']);
+    expect(await code({ status: 'rejected', amend: AMEND })).toEqual([400, 'amend_not_applicable']);
+    expect(await code({ status: 'accepted', amend: { ...AMEND, op: 'legacy' } })).toEqual([400, 'invalid_amend']);
+    expect(await code({ status: 'accepted', amend: { ...AMEND, op: 'evidence_only' } })).toEqual([400, 'invalid_amend']);
+    expect(await code({ status: 'accepted', amend: { op: 'close_security', target: AMEND.target } })).toEqual([400, 'invalid_amend']);
+    expect(await code({ status: 'accepted', amend: { ...AMEND, extra: 1 } })).toEqual([400, 'invalid_amend']);
+    expect(await code({ status: 'accepted', amend: { ...AMEND, target: { ...AMEND.target, issuer_id: '10000000-0000-4000-8000-0000000000ff' } } })).toEqual([400, 'invalid_amend']);
+    expect(await code({ status: 'accepted', amend: { ...AMEND, params: {} } })).toEqual([400, 'invalid_amend']);
+    expect(mocks.rpc).not.toHaveBeenCalled();
+  });
+
+  it('404 for an unknown claim without calling the function', async () => {
+    const res = await post({ status: 'accepted' }, { 'content-type': 'application/json' }, '00000000-0000-4000-8000-00000000dead');
+    expect(res.status).toBe(404);
+    expect(await res.json()).toEqual({ id: '00000000-0000-4000-8000-00000000dead', error: 'claim_not_found' });
+    expect(mocks.rpc).not.toHaveBeenCalled();
+  });
+
+  it('404 when the claim vanishes between the read and the function (claim_not_found)', async () => {
+    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'claim_not_found' } });
+    const res = await post({ status: 'accepted' });
+    expect(res.status).toBe(404);
+    expect(await res.json()).toEqual({ id: ID, error: 'claim_not_found' });
+    expect(mocks.insert).not.toHaveBeenCalled();
+  });
+
+  it('409 for every claim conflict code, without auditing', async () => {
+    for (const code of ['already_resolved', 'legacy_claim', 'amend_required', 'value_conflict', 'ownership_conflict', 'already_closed', 'issuer_not_active']) {
+      mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: code } });
+      const res = await post({ status: 'accepted' });
+      expect(res.status).toBe(409);
+      expect(await res.json()).toEqual({ id: ID, error: code });
+    }
+    expect(mocks.insert).not.toHaveBeenCalled();
+  });
+
+  it('500 for any other function error and for unexpected exceptions, logged', async () => {
+    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
+    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'invalid_claim' } });
+    expect((await post({ status: 'accepted' })).status).toBe(500);
+    mocks.rpc.mockRejectedValueOnce(new Error('db down'));
+    const res = await post({ status: 'accepted' });
+    expect(res.status).toBe(500);
+    expect(await res.json()).toEqual({ error: 'claim resolve unavailable' });
+    expect(log).toHaveBeenCalledWith('[admin/dq/claims]', 'db down');
+    log.mockRestore();
+  });
+
+  it('still answers 200 when the audit insert fails, and logs it', async () => {
+    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
+    mocks.insert.mockResolvedValue({ error: { message: 'audit down' } });
+    expect((await post({ status: 'accepted', amend: AMEND })).status).toBe(200);
+    expect(log).toHaveBeenCalledWith('[admin/dq/claims] audit failed', 'audit down');
+    log.mockRestore();
+  });
+});
diff --git a/src/app/api/admin/dq/claims/[id]/route.ts b/src/app/api/admin/dq/claims/[id]/route.ts
new file mode 100644
index 0000000..56605c0
--- /dev/null
+++ b/src/app/api/admin/dq/claims/[id]/route.ts
@@ -0,0 +1,95 @@
+// src/app/api/admin/dq/claims/[id]/route.ts
+// Identifier-claim review (data foundation 3 spec §7.1). Order mirrors the landed quarantine route:
+// admin session (401/403) → JSON content type (415) → same Origin (403) → UUID (400) → body. An
+// `amend` (only with status 'accepted'; required for evidence_only claims, enforced by the SQL
+// function) is validated with validateClaimDetail against the stored claim's evidence before the
+// call. resolve_identifier_claim is the final authority: its coded errors are 409, anything else 500.
+import { NextResponse } from 'next/server';
+import { AdminForbidden, AdminUnauthenticated, requireAdminUser } from '@/lib/admin/auth';
+import { supabaseTableClient } from '@/lib/db/table-client';
+import { validateClaimDetail } from '@/lib/entities/claims';
+import type { ClaimDetail, ClaimIdType, ClaimOp } from '@/lib/entities/types';
+import { audit, type ResearchSupabase } from '@/lib/research/store';
+import { getAdminSupabase } from '@/lib/supabase/admin';
+
+export const dynamic = 'force-dynamic';
+
+interface Ctx { params: Promise<{ id: string }> }
+
+const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
+const STATUSES = ['accepted', 'rejected'] as const;
+type Status = typeof STATUSES[number];
+type AmendOp = Exclude<ClaimOp, 'legacy' | 'evidence_only'>;
+const AMEND_OPS: readonly AmendOp[] = ['set_identifier', 'correct_identifier', 'attach_security', 'close_security', 'backdate_window'];
+const CONFLICTS = new Set(['already_resolved', 'legacy_claim', 'amend_required', 'value_conflict', 'ownership_conflict', 'already_closed', 'issuer_not_active']);
+interface Amend { op: AmendOp; target: ClaimDetail['target']; params: Record<string, unknown> }
+type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> };
+
+const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
+function parseAmend(v: unknown): Amend | null {
+  if (!isObj(v) || Object.keys(v).some((k) => !['op', 'target', 'params'].includes(k))) return null;
+  if (typeof v.op !== 'string' || !(AMEND_OPS as readonly string[]).includes(v.op)) return null;
+  if (!isObj(v.target) || typeof v.target.issuer_id !== 'string' || !isObj(v.params)) return null;
+  return { op: v.op as AmendOp, target: v.target as unknown as ClaimDetail['target'], params: v.params };
+}
+
+export async function POST(request: Request, { params }: Ctx) {
+  try {
+    const user = await requireAdminUser();
+    if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
+      return NextResponse.json({ error: 'unsupported_media_type' }, { status: 415 });
+    }
+    // Defence in depth against cross-site form posts: a browser-sent Origin must be ours.
+    const origin = request.headers.get('origin');
+    if (origin !== null && origin !== new URL(request.url).origin) {
+      return NextResponse.json({ error: 'forbidden_origin' }, { status: 403 });
+    }
+    const { id } = await params;
+    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
+
+    const body: unknown = await request.json().catch(() => null);
+    const status = isObj(body) ? body.status : undefined;
+    if (typeof status !== 'string' || !STATUSES.includes(status as Status)) {
+      return NextResponse.json({ error: 'invalid_status' }, { status: 400 });
+    }
+    const rawAmend = isObj(body) ? body.amend : undefined;
+    let amend: Amend | null = null;
+    if (rawAmend !== undefined && rawAmend !== null) {
+      if (status !== 'accepted') return NextResponse.json({ error: 'amend_not_applicable' }, { status: 400 });
+      amend = parseAmend(rawAmend);
+      if (!amend) return NextResponse.json({ error: 'invalid_amend' }, { status: 400 });
+    }
+
+    const admin = getAdminSupabase();
+    const [claim] = await supabaseTableClient(admin).select('issuer_identifier_claims', { id }, { limit: 1 });
+    if (!claim) return NextResponse.json({ id, error: 'claim_not_found' }, { status: 404 });
+    if (amend) {
+      if (amend.target.issuer_id !== claim.issuer_id) return NextResponse.json({ error: 'invalid_amend', detail: 'target_issuer_mismatch' }, { status: 400 });
+      const stored = isObj(claim.detail) ? claim.detail : {};
+      const check = validateClaimDetail(amend.op, claim.id_type as ClaimIdType, { ...stored, target: amend.target, params: amend.params } as unknown as ClaimDetail);
+      if (!check.ok) return NextResponse.json({ error: 'invalid_amend', detail: check.error }, { status: 400 });
+    }
+
+    const { data, error } = await (admin as unknown as RpcClient).rpc('resolve_identifier_claim', { p_id: id, p_status: status, p_resolved_by: user.id, p_amend: amend });
+    if (error) {
+      if (CONFLICTS.has(error.message)) return NextResponse.json({ id, error: error.message }, { status: 409 });
+      if (error.message === 'claim_not_found') return NextResponse.json({ id, error: 'claim_not_found' }, { status: 404 });   // deleted between the read and the rpc (Task 1b P0002)
+      console.error('[admin/dq/claims]', error.message);
+      return NextResponse.json({ error: 'claim resolve unavailable' }, { status: 500 });
+    }
+    const out = isObj(data) ? data : {};
+    const result = { id, status, op: typeof out.op === 'string' ? out.op : String(claim.op), applied: out.applied === true, amended: out.amended === true };
+    // The resolution is committed: an audit failure is logged, never turned into a retry-inviting 500.
+    try {
+      await audit({ supabase: admin as unknown as ResearchSupabase, userId: user.id }, 'dq.claim_resolve', id, result);
+    } catch (auditError) {
+      console.error('[admin/dq/claims] audit failed', auditError instanceof Error ? auditError.message : auditError);
+    }
+    return NextResponse.json(result, { status: 200 });
+  } catch (error) {
+    if (error instanceof AdminUnauthenticated) return NextResponse.json({ error: 'authentication required' }, { status: 401 });
+    if (error instanceof AdminForbidden) return NextResponse.json({ error: 'admin role required' }, { status: 403 });
+    console.error('[admin/dq/claims]', error instanceof Error ? error.message : error);
+    return NextResponse.json({ error: 'claim resolve unavailable' }, { status: 500 });
+  }
+}
diff --git a/src/lib/entities/ah-link.integration.test.ts b/src/lib/entities/ah-link.integration.test.ts
new file mode 100644
index 0000000..600d3e4
--- /dev/null
+++ b/src/lib/entities/ah-link.integration.test.ts
@@ -0,0 +1,203 @@
+// src/lib/entities/ah-link.integration.test.ts
+// A+H linking and claim review on the real schema (spec §9.3). Rule 1 attaches the HK line of a
+// same-LEI issuer through attachSecurity ONLY when the HKEX ISIN of the stock code equals the
+// OpenFIGI hit's ISIN (exclusion constraints, owner trigger); every other provider hint, and rule 2
+// name matches, become pending attach_security claims that resolve_identifier_claim accepts (row
+// inserted with the claimed window) or rejects; superseded -OLD counters are rejected; a contested
+// ticker is ONE quarantine entry; an evidence_only claim is accepted only with an amend.
+import {readFileSync} from 'node:fs';
+import {randomBytes,randomUUID} from 'node:crypto';
+import {Pool} from 'pg';
+import {afterAll,beforeAll,describe,expect,it} from 'vitest';
+import {pgTableClient} from '../db/pg-table-client';
+import type {TableClient} from '../db/table-client';
+import {startBatch} from '../dq/batches';
+import {DATASETS} from '../dq/datasets';
+import {isValidIsin} from '../research/entity-keys/identifiers';
+import {claimTargetKey,fileClaim} from './claims';
+import {attachSecurity,upsertIssuerByIdentifiers} from './issuers';
+import type {HkexIsin} from './identifiers/hkex-list';
+import {applyAhLinks,planAhLinks,type AhFigiHit,type AhIssuer,type UniverseListing} from './link-ah';
+
+const enabled=!!process.env.S4_TEST_STATE;
+const hex=(n:number)=>randomBytes(n).toString('hex').toUpperCase();
+const digits=(n:number)=>Array.from({length:n},()=>Math.floor(Math.random()*10)).join('');
+const randomIsin=()=>{const base='HKZZ'+hex(4).slice(0,7);return [...'0123456789'].map(d=>base+d).find(isValidIsin)!;};
+const randomLei=()=>{
+ const base=hex(9);
+ const ds=(base+'00').replace(/[A-Z]/g,c=>String(c.charCodeAt(0)-55));
+ let r=0;for(const d of ds)r=(r*10+Number(d))%97;
+ return base+String(98-r).padStart(2,'0');
+};
+const ASOF='2026-11-05';
+
+describe.skipIf(!enabled)('A+H linking and claim review on real PostgreSQL',()=>{
+ let admin:Pool;let db:TableClient;let batchId:string;
+ const issuers:string[]=[];const tickers:string[]=[];
+ const resolver=randomUUID();
+ const universeRow=async(market:'A'|'HK',listDate:string|null)=>{
+  for(let i=0;i<5;i++){
+   const t=market==='A'?`9${digits(5)}.SH`:`9${digits(4)}.HK`;
+   const got=(await admin.query(`insert into public.stocks_universe(ticker,name,market,list_date,source,source_updated_at) values($1,'ZZ AH Test',$2,$3::date,'zz_test_universe','2026-11-01T00:00:00Z') on conflict (ticker) do nothing returning ticker`,[t,market,listDate])).rows;
+   if(got.length===1){tickers.push(t);return t;}
+  }
+  throw new Error('could not allocate a test ticker');
+ };
+ const newIssuer=async(name:string,aTicker:string|null)=>{
+  const out=await upsertIssuerByIdentifiers(db,{lei:randomLei(),canonical_name_en:name,provenance:{lei:{source:'test'}}});
+  issuers.push(out.issuer_id!);
+  if(aTicker)expect(await attachSecurity(db,{issuer_id:out.issuer_id!,ticker:aTicker,share_class:'A',valid_from:'2020-01-01',source:'test'})).toBe('inserted');
+  return out.issuer_id!;
+ };
+ const universeOf=async(ts:string[])=>new Map<string,UniverseListing>((await admin.query(`select ticker,list_date::text as list_date,source,source_updated_at::text as source_updated_at from public.stocks_universe where ticker=any($1)`,[ts])).rows.map(r=>[r.ticker,{list_date:r.list_date,source:r.source,source_updated_at:r.source_updated_at}]));
+ const ownersOf=async(ts:string[])=>new Map<string,string>((await admin.query(`select ticker,issuer_id::text from public.issuer_securities where valid_to is null and ticker=any($1)`,[ts])).rows.map(r=>[r.ticker,r.issuer_id]));
+ const ahIssuer=(issuer_id:string,name:string,aTicker:string):AhIssuer=>({issuer_id,lei:null,usci:null,names:[name],aTickers:[aTicker],hTickers:[]});
+ const hkexIsin=(isin:string,row=3):HkexIsin=>({isin,file:'list_of_securities' as HkexIsin['file'],sha256:'e'.repeat(64),row});
+ const hitFor=(issuer_id:string,ticker:string,isin:string,figi:string|null):AhFigiHit=>({issuer_id,ticker,isin,figi,level:figi?'composite':null,job:{idType:'ID_ISIN',idValue:isin},gleifSha256:'a'.repeat(64),responseSha256:'c'.repeat(64),index:0,lei:'ZZTESTLEI00000000000'});
+ const resolve=(id:string,status:'accepted'|'rejected',amend:unknown=null)=>admin.query(`select public.resolve_identifier_claim($1::uuid,$2,$3::uuid,$4::jsonb) as r`,[id,status,resolver,amend===null?null:JSON.stringify(amend)]);
+
+ beforeAll(async()=>{
+  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
+  admin=new Pool({connectionString:state.adminUrl});
+  db=pgTableClient(admin);
+  ({batchId}=await startBatch(db,{producer:'ah-link-test',dataset:DATASETS.entities.ahLink}));
+ });
+ afterAll(async()=>{
+  if(!admin)return;
+  await admin.query(`delete from public.dq_quarantine where batch_id=$1`,[batchId]);
+  await admin.query(`delete from public.ingest_batches where batch_id=$1`,[batchId]);
+  await admin.query(`delete from public.issuer_identifier_claims where issuer_id=any($1::uuid[])`,[issuers]);
+  await admin.query(`delete from public.issuer_securities where issuer_id=any($1::uuid[]) or ticker=any($2)`,[issuers,tickers]);
+  await admin.query(`delete from public.issuers where issuer_id=any($1::uuid[])`,[issuers]);
+  await admin.query(`delete from public.stocks_universe where ticker=any($1)`,[tickers]);
+  await admin.end();
+ },30000);
+
+ it('rule 1: attaches the same-LEI HK line at its listing date when the HKEX ISIN equals the hit ISIN; a replay is a duplicate; another holder is quarantined',async()=>{
+  const aTicker=await universeRow('A','2001-01-01');
+  const hk=await universeRow('HK','2004-03-11');
+  const x=await newIssuer('ZZ AH Same Lei Co., Ltd.',aTicker);
+  const isin=randomIsin();
+  const hit=hitFor(x,hk,isin,`BBG${hex(5).slice(0,9)}`);
+  const hkexIsins=new Map([[hk.slice(0,5),hkexIsin(isin)]]);
+  const base={asOf:ASOF,universe:await universeOf([hk]),hkex:null,hkexIsins};
+  const plan=planAhLinks({...base,issuers:[ahIssuer(x,'ZZ AH Same Lei Co., Ltd.',aTicker)],figiHits:[hit],openOwner:await ownersOf([hk])});
+  expect(plan.attaches).toHaveLength(1);expect(plan.claims).toHaveLength(0);
+  const res=await applyAhLinks(db,plan,{batchId,dataset:DATASETS.entities.ahLink});
+  expect(res.counts).toMatchObject({inserted:1,failed:0});
+  const row=(await admin.query(`select share_class,valid_from::text,valid_from_method,source,isin,provenance from public.issuer_securities where ticker=$1`,[hk])).rows[0];
+  expect(row).toMatchObject({share_class:'H',valid_from:'2004-03-11',valid_from_method:'listing_date',source:'gleif_openfigi',isin});
+  expect(Object.keys(row.provenance).sort()).toEqual(['figi','isin','valid_from']);
+  expect(row.provenance.isin).toMatchObject({source:'hkex_list_of_securities',evidence_sha256:'e'.repeat(64)});
+  expect((await applyAhLinks(db,plan,{batchId,dataset:DATASETS.entities.ahLink})).counts).toMatchObject({inserted:0,duplicates:1});
+  // another issuer claiming the now-held ticker: one stable quarantine entry keyed `${ticker}:${valid_from}`
+  const y=await newIssuer('ZZ AH Other Holder Co., Ltd.',null);
+  const other=planAhLinks({...base,issuers:[{...ahIssuer(y,'ZZ AH Other Holder Co., Ltd.',aTicker),aTickers:[]}],figiHits:[{...hit,issuer_id:y}],openOwner:await ownersOf([hk])});
+  await applyAhLinks(db,other,{batchId,dataset:DATASETS.entities.ahLink});
+  await applyAhLinks(db,other,{batchId,dataset:DATASETS.entities.ahLink});
+  const q=(await admin.query(`select reason_code,status,natural_key from public.dq_quarantine where batch_id=$1 and natural_key=$2`,[batchId,`${hk}:2004-03-11`])).rows;
+  expect(q).toEqual([{reason_code:'ownership_conflict',status:'open',natural_key:`${hk}:2004-03-11`}]);
+ });
+
+ it('a provider hint without an agreeing HKEX ISIN files a provider_mapping claim with per-ISIN evidence; accepting it inserts the claimed window',async()=>{
+  const aTicker=await universeRow('A','2003-01-01');
+  const hk=await universeRow('HK','2006-07-14');
+  const m=await newIssuer('ZZ AH Hint Co., Ltd.',aTicker);
+  const isin=randomIsin();
+  const hit=hitFor(m,hk,isin,null);
+  const plan=planAhLinks({asOf:ASOF,issuers:[ahIssuer(m,'ZZ AH Hint Co., Ltd.',aTicker)],figiHits:[hit],universe:await universeOf([hk]),openOwner:await ownersOf([hk]),hkex:null,hkexIsins:new Map()});
+  expect(plan.attaches).toHaveLength(0);
+  expect(await applyAhLinks(db,plan,{batchId,dataset:DATASETS.entities.ahLink}).then(r=>r.claims)).toEqual({attach_security:1});
+  expect((await admin.query(`select count(*)::int as n from public.issuer_securities where ticker=$1`,[hk])).rows[0].n).toBe(0);
+  const claim=(await admin.query(`select id,op,id_type,value,source,status,detail from public.issuer_identifier_claims where issuer_id=$1`,[m])).rows[0];
+  expect(claim).toMatchObject({op:'attach_security',id_type:'ticker',value:hk,source:'gleif_openfigi',status:'pending'});
+  expect(claim.detail).toMatchObject({schema:'claim/1',evidence_kind:'provider_mapping',params:{ticker:hk,share_class:'H',valid_from:'2006-07-14',valid_from_method:'listing_date',source:'gleif_openfigi',isin}});
+  expect(claim.detail.evidence.source).toBe(`gleif_openfigi:${isin}`);
+  expect((await applyAhLinks(db,plan,{batchId,dataset:DATASETS.entities.ahLink})).claims).toEqual({attach_security_appended:1});
+  expect((await admin.query(`select count(*)::int as n from public.issuer_identifier_claims where issuer_id=$1`,[m])).rows[0].n).toBe(1);
+  expect((await resolve(claim.id,'accepted')).rows[0].r).toMatchObject({op:'attach_security',applied:true});
+  const row=(await admin.query(`select share_class,valid_from::text,valid_from_method,source,isin from public.issuer_securities where issuer_id=$1 and ticker=$2`,[m,hk])).rows[0];
+  expect(row).toEqual({share_class:'H',valid_from:'2006-07-14',valid_from_method:'listing_date',source:'gleif_openfigi',isin});
+ });
+
+ it('a superseded -OLD counter is dropped and a contested ticker is one aggregated quarantine entry',async()=>{
+  const aTicker=await universeRow('A','2004-01-01');
+  const hk=await universeRow('HK','2007-01-02');
+  const old=await universeRow('HK','2007-01-02');
+  const p=await newIssuer('ZZ AH Contender P Co., Ltd.',aTicker);
+  const q=await newIssuer('ZZ AH Contender Q Co., Ltd.',null);
+  const isinP=randomIsin(),isinQ=randomIsin();
+  const rows=[{stockCode:old.slice(0,5),name:'ZZ OLD COUNTER - OLD',category:'Equity',isin:null,row:2}];
+  const base={asOf:ASOF,universe:await universeOf([hk,old]),openOwner:await ownersOf([hk,old]),hkex:{file:'list_of_securities' as const,sha256:'d'.repeat(64),rows},hkexIsins:new Map<string,HkexIsin>()};
+  const plan=planAhLinks({...base,issuers:[ahIssuer(p,'ZZ AH Contender P Co., Ltd.',aTicker),{...ahIssuer(q,'ZZ AH Contender Q Co., Ltd.',aTicker),aTickers:[]}],
+   figiHits:[hitFor(p,hk,isinP,null),hitFor(q,hk,isinQ,null),hitFor(p,old,isinP,null)]});
+  expect(plan.skipped).toContain('superseded_counter');
+  expect(plan.claims).toHaveLength(0);
+  expect(plan.conflicts).toHaveLength(1);
+  await applyAhLinks(db,plan,{batchId,dataset:DATASETS.entities.ahLink});
+  const rowsQ=(await admin.query(`select reason_code,status,detail from public.dq_quarantine where batch_id=$1 and natural_key=$2`,[batchId,`${hk}:2007-01-02`])).rows;
+  expect(rowsQ).toHaveLength(1);
+  expect(rowsQ[0]).toMatchObject({reason_code:'ownership_conflict',status:'open'});
+  expect(rowsQ[0].detail).toMatchObject({reason:'ticker_claimed_by_several_issuers',competing_issuer_ids:[p,q].sort()});
+  expect((await admin.query(`select count(*)::int as n from public.issuer_securities where ticker=any($1)`,[[hk,old]])).rows[0].n).toBe(0);
+  expect((await admin.query(`select count(*)::int as n from public.issuer_identifier_claims where issuer_id=any($1::uuid[])`,[[p,q]])).rows[0].n).toBe(0);
+ });
+
+ it('rule 2: a name match files a pending claim/1 attach_security claim; accepting it inserts the claimed window',async()=>{
+  const tag=hex(3);
+  const aTicker=await universeRow('A','2002-01-01');
+  const hk=await universeRow('HK','2005-06-30');
+  const z=await newIssuer(`ZZ ${tag} Holdings Co., Ltd.`,aTicker);
+  const plan=planAhLinks({asOf:ASOF,issuers:[ahIssuer(z,`ZZ ${tag} Holdings Co., Ltd.`,aTicker)],figiHits:[],universe:await universeOf([hk]),openOwner:await ownersOf([hk]),
+   hkex:{file:'list_of_securities',sha256:'d'.repeat(64),rows:[{stockCode:hk.slice(0,5),name:`ZZ ${tag} HOLDINGS CO LTD - H`,category:'Equity',isin:null,row:7}]},hkexIsins:new Map()});
+  expect(plan.claims).toHaveLength(1);
+  const res=await applyAhLinks(db,plan,{batchId,dataset:DATASETS.entities.ahLink});
+  expect(res.claims).toEqual({attach_security:1});
+  const claim=(await admin.query(`select id,op,id_type,value,status,confidence,target_key,detail from public.issuer_identifier_claims where issuer_id=$1`,[z])).rows[0];
+  expect(claim).toMatchObject({op:'attach_security',id_type:'ticker',value:hk,status:'pending',confidence:null,target_key:claimTargetKey('attach_security',{issuer_id:z})});
+  expect(claim.detail).toMatchObject({schema:'claim/1',evidence_kind:'name_match',params:{share_class:'H',valid_from:'2005-06-30',valid_from_method:'listing_date',source:'hkex_list_name_match'}});
+  // replaying the same plan appends to the pending claim instead of filing a second one
+  expect((await applyAhLinks(db,plan,{batchId,dataset:DATASETS.entities.ahLink})).claims).toEqual({attach_security_appended:1});
+  expect((await admin.query(`select count(*)::int as n from public.issuer_identifier_claims where issuer_id=$1`,[z])).rows[0].n).toBe(1);
+  const out=(await resolve(claim.id,'accepted')).rows[0].r;
+  expect(out).toMatchObject({op:'attach_security',applied:true});
+  const row=(await admin.query(`select share_class,valid_from::text,valid_from_method from public.issuer_securities where issuer_id=$1 and ticker=$2`,[z,hk])).rows[0];
+  expect(row).toEqual({share_class:'H',valid_from:'2005-06-30',valid_from_method:'listing_date'});
+  const after=(await admin.query(`select status,resolved_by::text,resolved_at is not null as resolved from public.issuer_identifier_claims where id=$1`,[claim.id])).rows[0];
+  expect(after).toEqual({status:'accepted',resolved_by:resolver,resolved:true});
+  await expect(resolve(claim.id,'accepted')).rejects.toThrow('already_resolved');
+ });
+
+ it('rejecting a name-match claim changes only its status',async()=>{
+  const tag=hex(3);
+  const aTicker=await universeRow('A',null);
+  const hk=await universeRow('HK',null);
+  const w=await newIssuer(`ZZ ${tag} Group Limited`,aTicker);
+  const plan=planAhLinks({asOf:ASOF,issuers:[ahIssuer(w,`ZZ ${tag} Group Limited`,aTicker)],figiHits:[],universe:await universeOf([hk]),openOwner:await ownersOf([hk]),
+   hkex:{file:'list_of_securities',sha256:'d'.repeat(64),rows:[{stockCode:hk.slice(0,5),name:`ZZ ${tag} GROUP LTD - H SHS`,category:'Equity',isin:null,row:8}]},hkexIsins:new Map()});
+  await applyAhLinks(db,plan,{batchId,dataset:DATASETS.entities.ahLink});
+  const [claim]=(await admin.query(`select id,detail from public.issuer_identifier_claims where issuer_id=$1`,[w])).rows;
+  expect(claim.detail.params).toMatchObject({valid_from:ASOF,valid_from_method:'first_observed'});
+  expect((await resolve(claim.id,'rejected')).rows[0].r).toMatchObject({op:'attach_security',applied:false});
+  expect((await admin.query(`select status from public.issuer_identifier_claims where id=$1`,[claim.id])).rows[0].status).toBe('rejected');
+  expect((await admin.query(`select count(*)::int as n from public.issuer_securities where ticker=$1`,[hk])).rows[0].n).toBe(0);
+ });
+
+ it('an evidence_only claim is accepted only with an amend; the amended backdate_window moves valid_from',async()=>{
+  const aTicker=await universeRow('A','1999-01-01');
+  const e=await newIssuer('ZZ AH Evidence Co., Ltd.',aTicker);
+  const evidence={source:'sec_submissions',as_of:ASOF,evidence_sha256:'f'.repeat(64),locator:'recent#accessionNumber=0000999001-01-000001',note:'12(b) 交易所注册；所指证券类别与生效日须核对原文'};
+  expect(await fileClaim(db,{issuer_id:e,id_type:'ticker',value:'0000999001-01-000001',source:'sec_submissions',op:'evidence_only',detail:{
+   schema:'claim/1',evidence_kind:'filing_form',target:{issuer_id:e},params:{suggested_op:'backdate_window',accession:'0000999001-01-000001',form:'8-A12B',filing_date:'2019-05-20',note:evidence.note},evidence,sources:[evidence],
+  }})).toBe(true);
+  const [claim]=(await admin.query(`select id from public.issuer_identifier_claims where issuer_id=$1 and op='evidence_only'`,[e])).rows;
+  await expect(resolve(claim.id,'accepted')).rejects.toThrow('amend_required');
+  const amend={op:'backdate_window',target:{issuer_id:e,ticker:aTicker,valid_from:'2020-01-01'},params:{new_valid_from:'2019-06-03',valid_from_method:'listing_date'}};
+  expect((await resolve(claim.id,'accepted',amend)).rows[0].r).toMatchObject({op:'backdate_window',applied:true,amended:true});
+  const row=(await admin.query(`select valid_from::text,valid_from_method from public.issuer_securities where issuer_id=$1 and ticker=$2`,[e,aTicker])).rows[0];
+  expect(row).toEqual({valid_from:'2019-06-03',valid_from_method:'listing_date'});
+  const after=(await admin.query(`select status,op,detail from public.issuer_identifier_claims where id=$1`,[claim.id])).rows[0];
+  expect(after.status).toBe('accepted');
+  expect(after.detail.original_params).toMatchObject({suggested_op:'backdate_window',form:'8-A12B'});
+ });
+});

exec
/bin/zsh -lc "cat src/lib/entities/claims.ts; rg -n 'resolve_identifier_claim|invalid_amend|p_amend' supabase/migrations/*; cat src/app/api/admin/dq/quarantine/'[id]'/route.ts; cat .claude/CLAUDE.md 2>/dev/null; find . -name 'AGENTS*' -not -path './node_modules/*'; cat scripts/ci/research-checks.ts" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 55ms:
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
supabase/migrations/20261107090000_identifiers_and_dq.sql:435:-- ---------------------------------------------------------------- resolve_identifier_claim (§3.1, §4.2.1, §7.1)
supabase/migrations/20261107090000_identifiers_and_dq.sql:444:create or replace function public.resolve_identifier_claim(p_id uuid, p_status text, p_resolved_by uuid, p_amend jsonb default null)
supabase/migrations/20261107090000_identifiers_and_dq.sql:459:  if p_amend is not null then
supabase/migrations/20261107090000_identifiers_and_dq.sql:461:    if c.op <> 'evidence_only' or p_status <> 'accepted' or jsonb_typeof(p_amend) <> 'object'
supabase/migrations/20261107090000_identifiers_and_dq.sql:462:       or coalesce(p_amend ->> 'op', '') not in ('attach_security','close_security','backdate_window')
supabase/migrations/20261107090000_identifiers_and_dq.sql:463:       or jsonb_typeof(p_amend -> 'target') is distinct from 'object' or jsonb_typeof(p_amend -> 'params') is distinct from 'object' then
supabase/migrations/20261107090000_identifiers_and_dq.sql:466:    v_op := p_amend ->> 'op';
supabase/migrations/20261107090000_identifiers_and_dq.sql:467:    v_detail := c.detail || jsonb_build_object('target', p_amend -> 'target', 'params', p_amend -> 'params',
supabase/migrations/20261107090000_identifiers_and_dq.sql:470:    if (p_amend -> 'target') ? 'ticker' then v_value := p_amend -> 'target' ->> 'ticker'; end if;
supabase/migrations/20261107090000_identifiers_and_dq.sql:577:revoke execute on function public.resolve_identifier_claim(uuid, text, uuid, jsonb) from public, anon, authenticated;
supabase/migrations/20261107090000_identifiers_and_dq.sql:578:grant execute on function public.resolve_identifier_claim(uuid, text, uuid, jsonb) to service_role;
supabase/migrations/20261107090000_identifiers_and_dq.sql:760:-- set_security_identifier is the only writer of issuer_securities.isin/figi outside resolve_identifier_claim
supabase/migrations/20261107090000_identifiers_and_dq.sql:761:-- (identifiers/apply.ts, Task 4a). It share-locks the issuer (resolve_identifier_claim's order: issuer, then
supabase/migrations/20261107090000_identifiers_and_dq.sql:779:  -- Same order as resolve_identifier_claim (issuer, then security row): FOR SHARE conflicts with its FOR UPDATE.
supabase/migrations/20261107090000_identifiers_and_dq.sql:805:-- Lock order of set_security_identifier / resolve_identifier_claim: issuer FOR SHARE, then the row FOR UPDATE.
supabase/migrations/20261107090000_identifiers_and_dq.sql:918:-- set_issuer_identifier is the only writer of issuers.cninfo_org_id outside resolve_identifier_claim
supabase/migrations/20261107090000_identifiers_and_dq.sql:920:-- resolve_identifier_claim), requires status 'active' and, in ONE UPDATE, writes the column (only when
import { NextResponse } from 'next/server';
import {
  AdminForbidden,
  AdminUnauthenticated,
  requireAdminUser,
} from '@/lib/admin/auth';
import { supabaseTableClient } from '@/lib/db/table-client';
import { markAudited, resolveFactsItem, type FactsResolveOutcome } from '@/lib/dq/facts-resolver';
import { resolveQuarantine, type QuarantineStatus, type ResolveOutcome } from '@/lib/dq/quarantine';
import { supabaseFactsDb } from '@/lib/facts/db';
import { FactsDbError } from '@/lib/facts/types';
import { audit, type ResearchSupabase } from '@/lib/research/store';
import { getAdminSupabase } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

interface Ctx { params: Promise<{ id: string }> }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Resolution = Exclude<QuarantineStatus, 'open'>;
const RESOLUTIONS: readonly Resolution[] = ['resolved_accept', 'resolved_reject'];
const MAX_CHOSEN = 100;
type Outcome = ResolveOutcome | FactsResolveOutcome | 'run_pending';
// facts.* items (spec §7.3): run_pending and already_resolved are 409 (retry later / nothing to do),
// hook_retried is a successful re-run of materialize on an already accepted item; a retry whose
// materialize fails again answers 502 (the verdict is committed, the derived layer is not refreshed).
const HTTP_STATUS: Record<Outcome, number> = { resolved: 200, hook_retried: 200, not_found: 404, already_resolved: 409, run_pending: 409, invalid_choice: 400 };
const AUDITED: readonly Outcome[] = ['resolved', 'hook_retried'];

// The SQL function resolve_facts_quarantine is the final authority; its non-coded errors arrive as
// FactsDbError('unknown', '<message>').
function factsOutcome(e: unknown): Outcome | null {
  if (!(e instanceof FactsDbError)) return null;
  if (e.code === 'run_pending') return 'run_pending';
  if (e.code === 'invalid_chosen') return 'invalid_choice';
  if (e.code === 'item_not_open') return 'already_resolved';
  return null;
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
    const status = (body as { status?: unknown } | null)?.status;
    if (typeof status !== 'string' || !RESOLUTIONS.includes(status as Resolution)) {
      return NextResponse.json({ error: 'invalid_status' }, { status: 400 });
    }
    const chosen = (body as { chosen_fact_ids?: unknown } | null)?.chosen_fact_ids;
    if (chosen !== undefined && (!Array.isArray(chosen) || chosen.length > MAX_CHOSEN || chosen.some((v) => typeof v !== 'string' || !UUID_RE.test(v)))) {
      return NextResponse.json({ error: 'invalid_chosen_fact_ids' }, { status: 400 });
    }

    const admin = getAdminSupabase();
    const client = supabaseTableClient(admin);
    const [item] = await client.select('dq_quarantine', { id }, { limit: 1 });
    if (!item) return NextResponse.json({ id, outcome: 'not_found' }, { status: 404 });

    // chosen_fact_ids is a verdict on a same_day_conflict accept and nothing else
    if (chosen !== undefined && (status !== 'resolved_accept' || item.reason_code !== 'same_day_conflict')) {
      return NextResponse.json({ error: 'chosen_fact_ids_not_applicable' }, { status: 400 });
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
          status: status as Resolution, chosenFactIds: chosen as string[] | undefined, resolvedBy: user.id,
        });
        outcome = r.outcome;
        auditAs = r.auditAs;
        recovered = r.recovered;
        hookFailed = r.hook?.state === 'failed';
        extra = { hook: r.hook ?? null, promoted: r.promoted ?? null, skipped: r.skipped ?? null, chosen_fact_ids: r.chosenFactIds ?? null };
      } catch (e) {
        const mapped = factsOutcome(e);
        if (mapped === null) throw e;
        outcome = mapped;
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
        }
        if (isFacts) await markAudited(client, id);
      } catch (auditError) {
        console.error('[admin/dq] audit failed', auditError instanceof Error ? auditError.message : auditError);
      }
    }
    return NextResponse.json({ id, outcome, ...extra }, { status: outcome === 'hook_retried' && hookFailed ? 502 : HTTP_STATUS[outcome] });
  } catch (error) {
    if (error instanceof AdminUnauthenticated) {
      return NextResponse.json({ error: 'authentication required' }, { status: 401 });
    }
    if (error instanceof AdminForbidden) {
      return NextResponse.json({ error: 'admin role required' }, { status: 403 });
    }
    console.error('[admin/dq]', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'quarantine resolve unavailable' }, { status: 500 });
  }
}
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const recoveredMigration = {
  file: '20260904090000_watchlist_decision_sync.sql',
  sha256: '31b96984bd7fb6b3a3db557618a830ee6cd77d45ee3186452eefe7b218019107',
};
export const criticalSuites = [
  's4/integration.test.ts', 's4/anchor-two-phase.integration.test.ts', 's4/anchor-runner.integration.test.ts', 's4/checkpoint-registry.integration.test.ts', 's4/anchor-runner-program.integration.test.ts', 's4/ledger.integration.test.ts', 's4/source-extension.integration.test.ts',
  's6/arm-lineage.integration.test.ts', 's6/store.integration.test.ts', 's6/arm-report-db.integration.test.ts',
  'entity-keys/entity-keys.integration.test.ts', 'ledger/calls-import.integration.test.ts',
  'cluster/alignments.integration.test.ts', 'fanout/run.integration.test.ts',
  'cards/cards.integration.test.ts', 'thesis-extension.integration.test.ts', 'weekly/weekly.integration.test.ts',
].map(p => `src/lib/research/${p}`).concat('src/lib/observability/quote-snapshot.integration.test.ts', 'src/lib/analyst/recommendations-append-only.integration.test.ts', 'src/lib/dq/dq-foundation.integration.test.ts', 'src/lib/entities/issuers.integration.test.ts', 'src/lib/entities/issuers-write.integration.test.ts', 'src/lib/facts/facts.integration.test.ts', 'src/lib/facts/sync-us.integration.test.ts', 'src/lib/entities/identifiers.integration.test.ts', 'src/lib/entities/ah-link.integration.test.ts');

export function migrationInventory(root = process.cwd()) {
  const directory = join(root, 'supabase/migrations');
  const files = readdirSync(directory).filter(f => f.endsWith('.sql')).sort();
  const versions = new Set<string>();
  for (const file of files) {
    const version = /^(\d{14})_.+\.sql$/.exec(file)?.[1];
    if (!version || versions.has(version)) throw new Error(`Invalid/duplicate migration version: ${file}`);
    versions.add(version);
  }
  if (!files.includes(recoveredMigration.file)) throw new Error('Recovered migration missing');
  if (createHash('sha256').update(readFileSync(join(directory, recoveredMigration.file))).digest('hex') !== recoveredMigration.sha256) {
    throw new Error('Recovered migration bytes changed');
  }
  const lock = JSON.parse(readFileSync(join(root, 'supabase/migrations.lock.json'), 'utf8')) as { migrations: { file: string; sha256: string }[] };
  const maxLocked = lock.migrations.map(m => m.file.slice(0, 14)).sort().at(-1);
  if (!maxLocked) throw new Error('Migration lock is empty');
  for (const entry of lock.migrations) {
    if (!files.includes(entry.file) || createHash('sha256').update(readFileSync(join(directory, entry.file))).digest('hex') !== entry.sha256) throw new Error(`Locked migration changed/missing: ${entry.file}`);
  }
  for (const file of files) {
    if (!lock.migrations.some(m => m.file === file) && file.slice(0, 14) <= maxLocked) throw new Error(`Non-append migration: ${file}`);
  }
  return files.map(file => ({ file, sha256: createHash('sha256').update(readFileSync(join(directory, file))).digest('hex') }));
}

type Report = { success?: boolean; testResults?: { name: string; assertionResults: { status: string }[] }[] };
export function verifyDatabaseReport(report: Report, root = process.cwd()) {
  if (report.success !== true) throw new Error('Vitest did not succeed');
  let passed = 0;
  for (const file of criticalSuites) {
    const results = report.testResults?.filter(t => t.name === join(root, file));
    if (results?.length !== 1 || !results[0].assertionResults.length) throw new Error(`Critical suite missing/empty: ${file}`);
    if (results[0].assertionResults.some(t => t.status !== 'passed')) throw new Error(`Critical suite failed/skipped: ${file}`);
    passed += results[0].assertionResults.length;
  }
  return { criticalSuites: criticalSuites.length, criticalPassed: passed, criticalSkipped: 0 };
}

export function verifyCriticalSuiteInventory(root = process.cwd()) {
  const source = join(root, 'src');
  const discovered = readdirSync(source, { recursive: true }).filter((p): p is string => typeof p === 'string' && p.endsWith('.test.ts'))
    .filter(p => readFileSync(join(source, p), 'utf8').includes('S4_TEST_STATE'))
    .map(p => 'src/' + p.replaceAll('\\', '/')).sort();
  if (JSON.stringify(discovered) !== JSON.stringify([...criticalSuites].sort())) throw new Error('Database suite inventory drift');
}

exec
/bin/zsh -lc "sed -n '444,578p' supabase/migrations/20261107090000_identifiers_and_dq.sql; rg -n '7.1|amend|invalid_amend' docs/*/*data* docs -g '*foundation*' | head -45; cat vitest.config.ts; rg -n 'audit\\(|dq.claim' src/lib/research/store.ts; ls /Users/osborn/.codex/*config*; for p in .claude/../AGENTS.override.md ../../AGENTS.md ../../../AGENTS.md; do [ "'! -f "$p" ] || cat "$p"; done' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
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
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:5:上游：`docs/superpowers/specs/2026-11-04-data-foundation-design.md`（下称"规格一"）§3.2 F1b 行、§5.2、§10 WP-F1b 与 WP-F5、§12 开放问题 1；`docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md`（下称"规格二"，**第 8 稿 + §16 已落地偏差**；计划二已合并入 main，PR #102）§4.1、§4.5 函数表与行锁/`state_rev` 约定、§4.6 `read_facts` 信封、§4.8 `FactsDb`、§5.3、§7.1、§7.3、§15 开放问题 4/5/7。规格一 §14 与**落地的计划二（规格二第 8 稿 + §16 全部偏差 + `docs/audits/2026-11-04-data-foundation-2/16-implementation-log.md`）**在此视为既定事实；本规格只定义它们推迟的部分（T12 规定修法）。必须保留的落地契约：`publish_sync_run(uuid,uuid[],bigint default null)`、`FactsDb.publishRun(…,expectedRev)`、`stale_plan` 处理及其 10 分钟重排；`reconcile_fact_sync_scope(text,jsonb,timestamptz default null)`、`scope_confirmed_at`、完整集合的 scope 读取（`scopeAll`）与 5 分钟快照余量；`FACT_CONCEPTS` 为落地的 **35** 项（`MAX_READ_CONCEPTS` 由其长度导出，任何地方不得硬编码 33/34），`monetary_funds`（CN `money_cap`）与现金等价物不同、CN `cash` 留缺；公共 `/metrics` 的前后两次 rev 读取与 stale 抑制；CN 以 `FACTS_CN_ENABLED=1` 门控。拓扑函数建 scope 占位行时不得覆盖已有 scope 行、不得绕过上述退役保护（T12）。
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:226:**函数 `resolve_identifier_claim(p_id uuid, p_status text, p_resolved_by uuid, p_amend jsonb default null) returns jsonb`**（`security definer set search_path = public`，仅 service_role）：`select … for update` 声明行；非 `pending` → `raise 'already_resolved'`；`op='legacy'` → `raise 'legacy_claim'`；`op='evidence_only'` 且 `p_status='accepted'` → 要求 `p_amend` 把它改写为可执行 op（§4.2.1 修订规则），否则 `raise 'amend_required'`；校验 `detail` 符合 `claim/1` 模式、`detail.target.issuer_id = issuer_id`、`(op, id_type)` 配对合法（表 §4.2.1）；`rejected` → 只改状态；`accepted` → 在同一事务按 op 执行业务写入（每个分支为静态 SQL，目标发行人必须 `status='active'`；每个写入要求 `get diagnostics row_count = 1`，否则抛对应码回滚）并把 `detail.provenance_written`（白名单键）同时写入目标行的 `provenance`；成功写 `status/resolved_by/resolved_at`，返回 `{op, applied}`。
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:277:- `EXCH_MAP`（`EXCH_MAP_VERSION='exch-map/1'`，来源 `openfigi.com/about/exchange-codes`）：`US` 与美国场所码（`UN`,`UW`,`UA`,`UR`,`UP`,`UQ`）→ US；`CG` → `.SH`；`CS` → `.SZ`；`CH` → 按 ticker 前缀（6/9 → `.SH`，0/3 → `.SZ`）；`HK` → 港股。ticker 取响应 **`ticker`** 字段，再 `normalizeSecurityTicker(…, market)`。**实施前实测 AAPL（US0378331005）、贵州茅台（CNE0000018R8）、腾讯（KYG875721634），把 exchCode/securityType/compositeFIGI 的实际值记入 runbook；核对前不得 apply。**
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:313:| `evidence_only` | ticker | `{issuer_id}` | `{suggested_op?, …}` | **不可直接接受**：接受必须带 `p_amend={op, target, params}`（审核人读原文后填写证据所指的证券与生效日），函数把项改写为该 op 后按其分支执行；`detail.amended_by/at`、`detail.original_params` 保留 |
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:346:- `8-A12B`/`8-A12G`、`25`/`25-NSE`：写 **`evidence_only`** claim（`evidence_kind='filing_form'`，`target={issuer_id}`，`params={suggested_op:'backdate_window'|'close_security', accession, form, filing_date, note}`；8-A12G 注明"12(g) 注册，非交易所上市"；Form 25 注明"Rule 12d2-2(d) 下退市于申报后 10 日生效，须核对原文所指类别"）。**不预填证券与日期**；审核人读原文后用 `p_amend` 指定证券行与生效日。
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:523:| `POST /api/admin/dq/claims/[id]` | §7.1 |
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:526:### 7.1 `POST /api/admin/dq/claims/[id]`
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:528:顺序：`requireAdminUser()`（401/403）→ `Content-Type`（415）→ Origin（403）→ UUID（400）→ body `{status:'accepted'|'rejected', amend?:{op, target, params}}`（400；`amend` 经 `validateClaimDetail`）→ `rpc('resolve_identifier_claim', {p_id, p_status, p_resolved_by, p_amend})`。错误映射：`already_resolved`→409；`legacy_claim`/`amend_required`→409；`value_conflict`/`ownership_conflict`/`already_closed`→409（项保持 pending）；其他→500。成功写 `research_audit_log(action='dq.claim_resolve', detail={id, status, op, applied, amended})`。
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:536:- **标识符声明面板**：列：时间、发行人、op、类型、值、证据类别、来源、详情（折叠 JSON 含 target/params）、操作；`evidence_only` 行的"接受"打开修订表单（证券行选择 + 生效日 + 方法），提交为 `amend`；`legacy` 行只显示"需 SQL 处理"；409 文案；小屏卡片。
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:607:- `datasets.test.ts`；`facts-resolver.test.ts`（`resolveFactsItem` 分派穷举：采用、恢复、谱系、`reconcile_review` 只改状态、落地路径；拒绝通用翻转；`rule_failed`、`stale_evaluation` 重试、恢复禁用、`keep_fact_id`；三类新裁决的缺失/pending/failed 钩子恢复与 502 语义，T10）；`materialize.test.ts`（`--pending-hooks` 覆盖采用、恢复、谱系、对账隔离四类）；`metrics` 路由测试（谱系向量前后不一致 → `metrics:[]`、`stale:true`，T8）；路由测试（`asOf/tickerAsOf`、admin dq 新字段与 `market`、claims 顺序与 `amend`、quarantine 新字段）；`messages/parity.test.ts`。
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:611:`identifiers.integration.test.ts`、`dq-extensions.integration.test.ts`（含 `S4_TEST_STATE`，登记 `criticalSuites`）：两迁移在有数据库上升级 + 写入新证据后重放不改写；`valid_from` 更新受互斥约束；`resolve_identifier_claim` 每个 op 的成功/冲突回滚/目标不一致拒绝/非活跃发行人拒绝/`legacy`/`amend_required`/并发 409；`dq_reconciliations` 两条 kind 约束；`dq_filing_expectations` 全部约束组合；`replace_filing_expectations` 原子替换；`issuer_filing_profiles` 复合主键；`issuer_filer_categories`；`dq_reconcile_cycles` 单运行周期唯一索引与 `drc_done_accounted`；`dq_calendar_passes` 单未完成遍；`dq_freshness` weekly；`filings.accepted_at` 只允许 null→值且无角色可直写；`set_filing_acceptance`；`apply_reconcile_result` 持锁、只动围栏发行人的 `ok` 行、结果行+项+隔离+`hook:pending` 同一事务、同键第二次调用 `reused:true`、`state_rev+1`、与并发 `publish_sync_run` 串行；`complete_reconcile_member` 从已接受结果行推导计数、缺键 → `member_incomplete`；**每个提升入口**（`promote_quarantined`、`resolve_facts_quarantine`、`restore_reconciled`）都遵守 `fact_promote_rows` 新谓词（T6）；`filings` 的 `document_ref/document_url/link_attempts` 列级 update 仍可用、`accepted_at` 不可直写（T11）；**`restore_reconciled`：通过 + 哈希相等 → 项关闭且行真正提升（R1 回归）**、哈希不等 → `not_passing`、被其他 open 项引用 → `skipped`；`read_filing_facts` 返回全部代含 `quarantined`（读取器本身不过滤，绑定在调用方过滤）；`adopt_candidate` 全部码（含 `batch_mismatch`、发行人/市场取自 filing）、`stale_evaluation`、事务内 `hook` 写入、管理运行字段；`resolve_lineage_conflict` 锁定完整谱系、锁下重查、`lineage_changed`、`unresolved` 回滚、`promote_quarantined` 附加条款生效；`read_facts_lineage` 单发行人三种模式与 `read_facts` 逐字段一致、双发行人抑制与 `conflicts`、anon 只见 `ok`；`replace_financial_metrics_lineage` 成员 rev / 集合变化 / `scope_missing`、包装函数一致、`based_on_lineage` 回填；**拓扑：`issuers_topology_guard` 在全新连接上拒绝直接 update、在同一事务内 `set_merge` 成功返回后仍拒绝直接 update（S1 两项测试）、函数异常路径后设置已恢复；`set_merge` A→B 后 B→C 成功且 A 改指 C（R3 回归）、`row_count` 断言、与物化交错 → `stale_computation`；`set_dissolved` 的 `has_referrers`**；游标：`failed` 且 `attempts<3` 可认领、`attempts=3` 终态（S4）；`drc_done_accounted` 对 NULL 计数拒绝（S5）；围栏：过期/易主的尝试调用 `apply_reconcile_result`/`complete_reconcile_member`/`fail_reconcile_member` 得 `fence_failed` 且无写入；租约丢失前已提交的键被接手者复用、计数不重复（T2）；绑定：激活代内多行同键 → `left_ambiguous`，仅旧代同键 → 不歧义、按激活代绑定，`adopt_candidate` 遇仅旧代同键不报 `duplicate`（T1）；`adopt_candidate` 从持久化 camelCase 候选映射、代取自锚定运行、`mapping_version` 无留存 → `replay_required`（T5）；日历遍：第二个工作者租不到遍、全部遍函数围栏、冻结成员不受范围变化影响、失败成员重试成功只置 `done` 一次、`finish_calendar_pass` 两种终态都写 `finished_at`、过期工作者不能改动新租约者的进度（T3）；`read_facts_lineage` 非 `ok` 行 `disclosure_seq` 为空且只在 `history` 时返回（T7）；RLS 与桶策略（anon/authenticated 不可读写新表与桶）。
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:634:| F3-3 A+H 与声明接口/面板 | `names.ts`、`link-ah.ts`、claims 路由（含 amend）与面板、i18n | F3-1 | 集成测试绿 | 3 |
docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md:253:| `resolve_facts_quarantine(item_id, chosen uuid[], resolved_by uuid)` → jsonb | 管理员钩子专用（审计 R6-1、R7-1）；持行锁；项必须 `open`；读取该项 `payload.fact_ids` 对应的**全部**现存行：任一行所属运行仍为 `staged` → `raise 'run_pending'`（项保持 open）；**在同一事务内**：项 `status='resolved_accept'`、`resolved_by`、`resolved_at`、`detail.chosen_fact_ids = chosen`（`same_day_conflict` 时为裁决，其他类型为 `payload.fact_ids`），然后按 `promote_quarantined` 的资格规则提升——资格检查中"无 open 争议项"以本项已关闭为前提（本项不再阻塞自己）；`state_rev + 1`；返回 `{promoted, skipped}`。状态翻转、裁决持久化、成员检查与提升原子完成 |
docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md:323:  1. 若 (K, 日期) 争议中 → c 以 `staged` 写入后 `quarantine_facts`，并并入该项的 `fact_ids`（§7.1 的并入规则）；无论 c 的值是否与某一方相同。
docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md:394:### 7.1 隔离
docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md:420:- `POST /api/admin/dq/quarantine/[id]` 对 `facts.*` 项的接受**完全由** `resolve_facts_quarantine(item, chosen, resolved_by)`（§4.5）完成：函数在行锁内检查项内**全部**现存行所属的运行（不只是创建项的运行），任一仍 `staged` → 抛 `run_pending`，路由返回 409，项保持 `open`（审计 R5-3、R6-1）；否则函数原子地翻转项状态、持久化裁决并提升（审计 R7-1）。路由不再自己翻转 `facts.*` 项的状态；`resolved_reject` 仍走计划一的通用翻转。运行被废弃后项内指向已删行的 id 忽略。
docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md:494:`src/lib/facts/facts.integration.test.ts`：迁移可重放；唯一约束与两条复合外键；触发器；**每个函数**（租约互斥/过期/续租、`lease_lost` 在并发事务下、`begin_sync_run`/`abandon_sync_run` 先标后删且保留已发布运行的 quarantined 行、`abandon` 拒绝已发布运行、`publish_sync_run` 原子性 + 争议组处置（含"登记—废弃—重试—发布"序列后原 `ok` 行被处置）+ `mapping_gen_regression` + `state_rev` 递增、废弃运行不影响已发布行、`fact_state_rev` 对 anon 可用而 `fact_sync_scope` 不可读、`resolve_facts_quarantine` 在任一成员行的运行仍 staged 时抛 `run_pending`（含"登记—废弃—重试并入—发布前裁决"序列被拒）、`promote_quarantined` 的全部资格规则（未发布运行的行不提升；争议中不提升；已裁决只提升 chosen）、接受一个已发布的同日争议项后被选行真正可见且物化包含它（R7-1 回归）、`quarantine_facts` 并入成员与并发发布串行、`replace_financial_metrics` 的 `stale_computation` 在"发布—提升—物化"交错下、`read_facts` 信封在 1,001 行与 10,001 行下的 `truncated`、`reconcile_fact_sync_scope` 不动租约与调度列）；真实角色权限（anon/authenticated/service_role 都不能直接写事实表与 `filings.mapping_gen`；service_role 只能改三列链接；anon 能执行 `read_facts` 且只见 `ok`；anon 不能执行写函数）；`value_text` 与 20 位整数一致。
docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md:523:工作量：F2-0 3 人日（函数与并发测试）；F2-1 2；F2-2 2.5；F2-3 2；F2-4 3；F2-5 2；F2-6 2；F2-7 1。合计约 17.5 人日。
docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md:592:| 2026-11-04 | §7.1 `missing_available_date` 与奇异键 | (a) 缺日期隔离的自然键含**期间、单位**以及 `api / accn / tag / page / row` 等定位分量（规格键不含期间/单位，会让不同期间碰撞）；(b) EDGAR 行回退到 `accn/tag`；(c) 同一自然键在一份快照里有多行时，`ambiguous_value` 隔离项把全部行聚合进 `payload.rows[]`（值、`raw_hash`、定位），解析器自己的分组串存 `payload.parser_key`；(d) 缺日期证据保留缺失值与哈希；(e) 奇异期间（`oddDuration`）冲突值也进隔离，不被丢弃 | 审计 Task 5/8/10：缺日期键跨期碰撞；低优先级标签替补；证据只留首行 | `sync.ts`（`missingDateKey`、`ambiguousKey`）、`keys.ts`；接受 |
docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md:638:| 2026-11-04 | §11.3 | 美股回放集成测试补两项（commander 追加）：裁决后物化包含被选行（R7-1 物化半）；`stale_computation` 交错（`state_rev` 在 `readFacts` 与 `replaceMetrics` 之间被推进，重试一次成功） | 计划把这两项留给 Task 11 | `sync-us.integration.test.ts`；接受 |
docs/superpowers/plans/2026-11-04-data-foundation-1-dq-and-issuers.md:1727:   [{user_id:'u',entity_id:'e1',lei:'3003003LS77D1DRDDE25',usci:'913300002539329145',cik:null,cninfo_org_id:'gssh0600570',names_zh:['恒生电子'],names_en:['Hundsun Technologies Inc.'],home_market:'A',issuer_id:null},
docs/superpowers/plans/2026-11-04-data-foundation-1-dq-and-issuers.md:1732:  expect(plan.issuers).toEqual([{entity_key:'u:e1',input:{lei:'3003003LS77D1DRDDE25',usci:'913300002539329145',cik:null,cninfo_org_id:'gssh0600570',canonical_name_zh:'恒生电子',canonical_name_en:'Hundsun Technologies Inc.',country_code:'CN',provenance:{link:{source:'research_entity_keys',entity_id:'e1'}}}}]);
docs/superpowers/plans/2026-11-04-data-foundation-1-dq-and-issuers.md:1932:**规格覆盖**：§5.1 四表 → Task 1；§5.2 规则库 / 隔离 / 新鲜度 → Task 4、5；`/admin/dq` → Task 6；§3.1 五表与 `research_entity_*` 新列 → Task 7；合并规则 / 写入 / 解析 → Task 8、9；§3.2 的 SEC 与现有脚本改写 → Task 10、11（GLEIF/巨潮脚本改写、ISIN、FIGI、A/H 配对在计划三）；§6 迁移锁与类型 → Task 1、7、12；§5.2 的跨来源对账运行器与财报日历新鲜度属于 WP-F5，在计划三。
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:48:src/lib/facts/keys.ts             factKey / candidateKey / sameDayConflictKey / ambiguousKey / identityKey（§5.2 K 与 §7.1 自然键的唯一渲染点；Task 5）
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:77:scripts/facts/sync.ts  scripts/facts/materialize.ts  scripts/facts/record-fixture.ts   （Task 17、17、10/12/13）
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:184:- 隔离 `dataset` = 批次 dataset；`table_name='financial_facts'`；`reason_code ∈ ambiguous_value | odd_duration | missing_available_date | same_day_conflict | identity_bs | identity_gp`；`natural_key` 格式见规格 §7.1；`payload` 对象：`{key:{…}, fact_ids:[…], run_id, candidates?, values?, rule?, detail?}`。
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:206:| `keys.ts`（Task 5） | `FactKey`、`factKey(k)`、`candidateKey(k,filingId,gen)`、`sameDayConflictKey(issuer,market,k,date)`、`ambiguousKey(issuer,market,k,sourceRef,gen)`、`identityKey(issuer,market,'IS'|'BS',ps,pe,unit,sourceRef,gen)`、`keyComponents(issuer,market,k)` | §7.1 自然键的唯一渲染点；`period_start=null` 渲染为空段 |
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:242:| §7.1 隔离五类与自然键 | Task 5（`keys.ts`、`ambiguous_value`、`same_day_conflict`）、Task 6（`identity_*`）、Task 8（`odd_duration`、`missing_available_date` 落库） |
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:574:  expect((await read(iss,{concepts:['revenue']})).rows.map(x=>x.fact_id)).toContain(r);   // chosen row really visible (R7-1)
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:1290:-- Admin hook (§4.5, §7.3; audits R6-1, R7-1; round-1 #2, #10). Lock order: scope row (derived
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:2214:/** natural_key prefix of every facts quarantine item of an issuer+market (§7.1). */
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:2824:- 规格覆盖：§4.1–§4.5 五表与全部函数（含 `promote_quarantined` 与 `fact_state_rev`）、§4.6 信封与 10,000 上限、§4.7 权限/策略/桶/列级 update、§4.8 三实现、§5.4 锁与原子性（并发用例）、§11.2 清单逐项（租约互斥/过期/续租、并发 `lease_lost`、先标后删、废弃拒绝已发布、发布原子 + 争议组处置 + 登记—废弃—重试—发布、`mapping_gen_regression`、`state_rev`、`fact_state_rev` 对 anon 可用而 `fact_sync_scope` 不可读、`resolve` 的 `run_pending`、提升资格全部规则、R7-1 回归、并入与发布串行、`stale_computation` 交错、1,001/10,001 行、`reconcile` 不动租约与调度列、真实角色权限、`value_text` 20 位）。
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:2838:| `src/lib/facts/keys.ts`（新文件，Task 5） | `FactKey`、`factKey`、`candidateKey`、`sameDayConflictKey`、`ambiguousKey`、`identityKey`、`keyComponents` | §5.2 K 与 §7.1 各 `natural_key` 的唯一渲染点；`period_start=null` 渲染为空段 |
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:3735:// Natural-key strings (spec §5.2 K, §7.1 quarantine natural_key formats). One place renders
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:3747:/** same_day_conflict natural_key (§7.1). */
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:3749:/** ambiguous_value / odd_duration natural_key (§7.1). */
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:3751:/** identity_bs (BS, period_end only) and identity_gp (IS, period_start:period_end) natural_key (§7.1). */
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:3990:// Statement rules on a sync run (spec §7.1 identity_bs / identity_gp, §7.2 warnings). Groups are
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:4882:/** missing_available_date natural key (spec §7.1 `<issuer>:<ts_code>:<end_date>:<report_type>`; EDGAR rows carry accn/tag in those slots). */
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:4923:  // `key` is its own grouping string (it knows no issuer); the §7.1 natural key is rendered here
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:5117:实现要点对照 §6.1 步骤：0 未指定 `issuerIds` 时先 `reconcileScope({db,tables},market)` 再 `scopeDue`；指定时 `selectScopes` 用 `db.scopeRows` 按 id 直取（不对账、不看 `next_due_at`、不受 `limit` 约束——每个显式发行人都有一个 outcome，round-2 #13），缺行者 `scopeRowFor` 算出 → apply 时 `reconcileScope` 补建（`reasons:['explicit']`）、dry-run 时构造只读行，算不出的以 `scope_unresolved` 失败计入回执（round-1 #13）；1 `claimLease(…,600)`（失败 → `skipped_summary(leased)`）；2 `beginRun`；3 抓取 + `storage.put`（快照 sha256 记入 `IssuerOutcome.snapshotSha256`）；4 解析（异常 → `parse_error`，只带消息前 200 字；适配器抛的 `ProviderError` 是 `SyncError` 的别名，其 `code` 直接成为批次错误码）；**解析器遗留三类先落隔离**（`ambiguous_value` / `odd_duration` / `missing_available_date`，不依赖 filing 行；round-1 #9），`parsed.skipped` → `skipped_summary(<issuer>:parser)`，CN 且注入 `coverageCn` → `coverage_summary`（紧凑串，round-1 #12），然后才判"无文件无候选 → 发布空运行 + `no_rows`"；解析器的 `ambiguous[].key` 只是适配器内部分组串，落库时用 `ambiguousKey(issuer,market,K,filingRef,gen)` 渲染 §7.1 自然键并把原串存为 `payload.parser_key`；5 先 `stageFilings`（on-conflict 返回既有 id，使 FactInsert 在规划前就有 `filing_id` 与权威 `available_date`），再 `readFacts(all, 今天, history, includeNonOk)`（`truncated` → `read_truncated` 废弃）+ `openConflicts` → `planFactWrites`；6 `stageFacts`；7 `ambiguous_value`；`same_day_conflict` → `quarantine()` 后 `quarantineFacts(run, newIds, item)`；争议并入 → `quarantineFacts(run, ids, item)`；规则 → `quarantine()` + `quarantineFacts`；8 `publishRun(run, manifest=全部 filing)`（`mapping_gen_regression` → 废弃、failed）；**发布成功后置 `publishedRun=true`：之后任何失败都不再 `abandonRun`**（它只会抛 `run_published` 盖掉原错误），发行人 outcome 保持 `published`，原错误按自身码记入 `errors`，租约以 `failed` 释放（round-1 #11）；9 CN `linkCn` 对 `document_ref is null and link_attempts < 5` 且非 BJ、`form_type ∈ LINKABLE_FORMS` 的 filing，`updateFilingLink`——none / ambiguous / 成功 / **请求抛错** / **请求中途被预算切断**都持久化 `link_attempts+1`（已开始的请求就是一次尝试），只有在请求开始前预算已取消或不足 30 s 才不计、直接停止（round-1 #21、round-2 #21）；10 `materialize`（`stale_computation`/`read_truncated` 记错不撤发布；重算一次在 Task 15 的 `materialize` 内完成）；11 `releaseLease(outcome, now+7d | now+1d)`。`lease_lost` 在任何位置 → 不再调用 `abandonRun/releaseLease`；发布前 → 该发行人 failed，发布后 → 保持 published 并记 `lease_lost`。预算中止（`AbortError` 或 `budget.signal.aborted`）→ 发布前：废弃运行、失败释放、`deadline_hit`（信息码，不计 `failed`）；发布后：不废弃、失败释放、记 `deadline_hit`。`fetched` = 候选数；发行人级失败 `failed += max(1, fetched)`，使"fetched>0 无结果"不会被误判为 `unaccounted`。
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:5643:- 规格覆盖：§3（34 行目录、单位归一、`MAPPING_GEN/VERSION`）、§4.3 duration 带、§4.7 桶路径与 `upsert:false`、§5.1 可得日期、§5.2 序列/修订/代过滤、§5.3 重复/歧义/争议/同日冲突/计数、§6.1 步骤 1–11 + 批次/新鲜度/空转/截止/`code_version`、§6.2 数值解码、§7.1 五类隔离键与 payload、§7.2 警告汇总、§7.3 钩子与路由、§10 全部错误码、§11.1 本部分单测项（concepts/units/json-numbers/plan/rules/read/sync/路由钩子阶段重试与 `chosen_fact_ids`）。
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:9355:13. 解析器 `ambiguous[].key`：Part C 的两个适配器各自生成内部分组串（不含 issuer/market），Part B 的 `sync.ts` 直接把它当 §7.1 自然键落库 → 改生产者（`sync.ts` 用 `ambiguousKey(issuer,market,K,filingRef,gen)` 渲染，原串存 `payload.parser_key`，`payload.key` 补齐分量）。
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:242:| `resolve_identifier_claim`（1） | `(p_id uuid, p_status text, p_resolved_by uuid, p_amend jsonb default null) returns jsonb` → `{op, applied, amended}` | `already_resolved` `legacy_claim` `amend_required` `invalid_claim` `value_conflict` `ownership_conflict` `already_closed` `issuer_not_active`；`claim_not_found`（P0002，路由 404） |
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:426:| 65 | 一个未覆盖的老期间让 US 全部日历行变 `unknown_upstream`（计划审计 Q1） | `calendar-sync.ts::applyUpstreamCoverage(rows, entries)`（导出）逐期判定：`最早 filingDate < period_end` 为已覆盖；未覆盖但有正证据（`received`/`received_late`/`filed_not_ingested`）保持原行；只有未覆盖且无证据的 `pending`/`overdue` 行改为 `unknown_upstream` + `upstream_lookup='unavailable'` + `detail.upstream_incomplete=true` + `detail.upstream_covered_from` | Task 18a 协议、`computeMember`、3 个用例（含 20-F 回归）；顺带把夹具里过期的 `fromPeriodEnd` 期望 `2022-11-23` 改为 P6 后的 `2017-11-23` |
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
79:export async function audit(
/Users/osborn/.codex/config.toml
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>
exec
/bin/zsh -lc "rg -n 'figi|lei' src/lib/entities/issuers.ts src/lib/entities/link-ah.ts | head -45; rg -n 'project_doc|fallback' /Users/osborn/.codex/config.toml; find . -name CLAUDE.md -not -path './node_modules/*' -not -path './vendor/*' | head; sed -n '75,100p' src/lib/research/store.ts; rg -n 'amend' docs/superpowers/specs/2026-11-05-data-foundation-3* | tail -12; nl -ba 'src/app/api/admin/dq/claims/[id]/route.ts' | sed -n '62,78p'" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 52ms:
src/lib/entities/issuers.ts:19:const ENRICH_FIELDS=['lei','cik','usci','cninfo_org_id','hkex_stock_code_primary','canonical_name_zh','canonical_name_en','country_code'] as const;
src/lib/entities/issuers.ts:21:const CLAIMABLE:readonly string[]=['lei','cik','usci','cninfo_org_id'];
src/lib/entities/issuers.ts:28: if(out.lei!=null){const lei=String(out.lei).toUpperCase();if(!isValidLei(lei))throw new Error('invalid_identifier:lei');out.lei=lei;}
src/lib/entities/issuers.ts:105: * Not atomic across fields: each enrichment is its own guarded update. When a hard id (lei, cik,
src/lib/entities/link-ah.ts:23:import {groupFigiResults,type FigiEvidence,type FigiJob,type FigiJobResult} from './identifiers/openfigi';
src/lib/entities/link-ah.ts:32:export interface AhIssuer{issuer_id:string;lei:string|null;usci:string|null;names:string[];aTickers:string[];hTickers:string[]}
src/lib/entities/link-ah.ts:33:export interface AhFigiHit{issuer_id:string;ticker:string;isin:string;figi:string|null;level:'composite'|'venue'|null;job:FigiJob;gleifSha256:string;requestSha256?:string;responseSha256:string;index:number;lei:string}
src/lib/entities/link-ah.ts:36:export interface TickerLookup{figi:string;level:'composite'|'venue';evidence:FigiEvidence}
src/lib/entities/link-ah.ts:38:export interface FigiJobError{isin:string;lei:string;message:string;evidence:FigiEvidence}
src/lib/entities/link-ah.ts:40: asOf:string;issuers:readonly AhIssuer[];figiHits:readonly AhFigiHit[];
src/lib/entities/link-ah.ts:50: figiErrors?:readonly FigiJobError[];
src/lib/entities/link-ah.ts:52: raw?:{gleif?:{sha256:string;path:string};hkex?:{sha256:string;path:string}};
src/lib/entities/link-ah.ts:58: conflicts:{naturalKey:string;detail:Record<string,unknown>;payload:Record<string,unknown>}[];claims:ClaimInput[];skipped:string[];figiErrors:FigiJobError[];
src/lib/entities/link-ah.ts:68:export function selectAhIssuers(issuers:readonly {issuer_id:string;lei:string|null;usci:string|null;names:string[]}[],openTickers:readonly {issuer_id:string;ticker:string}[]):AhIssuer[]{
src/lib/entities/link-ah.ts:73:  return {issuer_id:i.issuer_id,lei:i.lei,usci:i.usci,names:i.names,aTickers:ts.filter(t=>/^\d{6}\.(SH|SZ)$/.test(t)),hTickers:ts.filter(t=>/^\d{5}\.HK$/.test(t))};
src/lib/entities/link-ah.ts:74: }).filter(i=>i.lei!==null||i.aTickers.length>0);
src/lib/entities/link-ah.ts:77:/** HK candidates of each issuer's LEI from stage-B style OpenFIGI results; figi only when exactly one group. */
src/lib/entities/link-ah.ts:78:export function figiHitsFromResults(issuers:readonly AhIssuer[],gleif:{sha256:string;byLei:ReadonlyMap<string,readonly string[]>},results:ReadonlyMap<string,FigiJobResult>):AhFigiHit[]{
src/lib/entities/link-ah.ts:81:  if(!i.lei)continue;
src/lib/entities/link-ah.ts:82:  for(const isin of gleif.byLei.get(i.lei)??[]){
src/lib/entities/link-ah.ts:88:    out.push({issuer_id:i.issuer_id,ticker:c.ticker,isin,figi:one?.figi??null,level:one?.level??null,job:r.job,gleifSha256:gleif.sha256,requestSha256:r.evidence.request_sha256,responseSha256:r.evidence.response_sha256,index:r.evidence.index,lei:i.lei});
src/lib/entities/link-ah.ts:96:export function figiErrorsFromResults(issuers:readonly AhIssuer[],gleif:{byLei:ReadonlyMap<string,readonly string[]>},results:ReadonlyMap<string,FigiJobResult>):FigiJobError[]{
src/lib/entities/link-ah.ts:99:  if(!i.lei)continue;
src/lib/entities/link-ah.ts:100:  for(const isin of gleif.byLei.get(i.lei)??[]){
src/lib/entities/link-ah.ts:103:   seen.add(isin);out.push({isin,lei:i.lei,message:r.message.slice(0,200),evidence:r.evidence});
src/lib/entities/link-ah.ts:132: const plan:AhLinkPlan={attaches:[],attachEvidence:{},conflicts:[],claims:[],skipped:[],figiErrors:[...(input.figiErrors??[])]};
src/lib/entities/link-ah.ts:140: const hits=[...input.figiHits].sort((a,b)=>cmp(a.issuer_id,b.issuer_id)||cmp(a.ticker,b.ticker)||cmp(a.isin,b.isin)||a.index-b.index);
src/lib/entities/link-ah.ts:162:  const g0=input.raw?.gleif,hk0=input.raw?.hkex;
src/lib/entities/link-ah.ts:163:  const rawEvidence={gleif_sha256:first.gleifSha256,...(g0?{gleif_path:g0.path}:{}),openfigi_response_sha256:first.responseSha256,openfigi_path:rawPath('openfigi',first.responseSha256,'json'),
src/lib/entities/link-ah.ts:177:  const figiHit=gh.find(x=>x.h.figi);
src/lib/entities/link-ah.ts:182:     corroborated_by:[{source:'gleif_openfigi',evidence_sha256:h.gleifSha256,locator:`gleif:${h.lei},${h.isin};openfigi:${h.responseSha256}#${h.index}`}]},
src/lib/entities/link-ah.ts:183:    ...(figiHit?.h.figi?{figi:{source:'openfigi',as_of:input.asOf,evidence_sha256:figiHit.h.responseSha256,job:jobOf(figiHit.h.job),level:figiHit.h.level}}:{}),
src/lib/entities/link-ah.ts:186:   plan.attaches.push({issuer_id:i.issuer_id,ticker,isin:h.isin,figi:figiHit?.h.figi??null,share_class:shareClassFor(i),is_primary:false,valid_from:l.valid_from,valid_from_method:l.valid_from_method,source:'gleif_openfigi',provenance});
src/lib/entities/link-ah.ts:187:   plan.attachEvidence[k]={rule:'same_lei',validated_by:'hkex_isin',evidence:rawEvidence,isin:h.isin};
src/lib/entities/link-ah.ts:194:   add({source:`gleif_openfigi:${h.isin}`,as_of:input.asOf,evidence_sha256:h.gleifSha256,locator:`gleif:${h.lei},${h.isin};openfigi:${h.responseSha256}#${h.index}`,
src/lib/entities/link-ah.ts:195:    note:`OpenFIGI mapped ISIN ${h.isin} to ${ticker}${h.figi?` (FIGI ${h.figi}, ${h.level})`:' (no single FIGI group)'}${h.requestSha256?`; request ${h.requestSha256}`:''}`});
src/lib/entities/link-ah.ts:200:  if(tl)add({source:'openfigi_ticker',as_of:input.asOf,evidence_sha256:tl.evidence.response_sha256,locator:`openfigi:${tl.evidence.response_sha256}#${tl.evidence.index}`,
src/lib/entities/link-ah.ts:201:   note:`ticker-level lookup FIGI ${tl.figi} (${tl.level}); request ${tl.evidence.request_sha256}; ${figiHit?.h.figi?(tl.figi===figiHit.h.figi?'matches':'differs from')+` ISIN-level FIGI ${figiHit.h.figi}`:'no ISIN-level FIGI to compare'}`});
src/lib/entities/link-ah.ts:205:  plan.claims.push({issuer_id:i.issuer_id,id_type:'ticker',value:ticker,source:'gleif_openfigi',op:'attach_security',detail:{
src/lib/entities/link-ah.ts:207:   params:{ticker,share_class:shareClassFor(i),valid_from:l.valid_from,valid_from_method:l.valid_from_method,source:'gleif_openfigi',...(isins.length===1&&!kinds.includes('disagree')?{isin:isins[0]}:{})},
src/lib/entities/link-ah.ts:219:    ?{reason:'ticker_owned_by_other_issuer',rule:'same_lei',owner_issuer_id:e.owner,...(one?{classified:one.classified,evidence:one.evidence}:{contenders:e.contenders})}
src/lib/entities/link-ah.ts:220:    :{reason:'ticker_claimed_by_several_issuers',rule:'same_lei',competing_issuer_ids:ids,contenders:e.contenders},
src/lib/entities/link-ah.ts:276: for(const e of plan.figiErrors){
src/lib/entities/link-ah.ts:278:  errors.push({code:'openfigi_error',key:e.isin,message:JSON.stringify({lei:e.lei,message:e.message,request_sha256:e.evidence.request_sha256,response_sha256:e.evidence.response_sha256,index:e.evidence.index})});
src/lib/entities/link-ah.ts:287:    await park(cause.reasonCode,`${a.ticker}:${a.valid_from}`,{...(plan.attachEvidence[`${a.issuer_id}|${a.ticker}`]??{}),rule:'same_lei',...cause.detail},
 * Append a research_audit_log row (compliance red line: ingest/generate/review
 * all leave a trace). object_type is derived from the action prefix
 * ('source.ingest' → 'source'), matching the old SQLite target_id semantics.
 */
export async function audit(
  ctx: ResearchCtx,
  action: string,
  objectId: string | null,
  detail: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await ctx.supabase.from('research_audit_log').insert({
    id: crypto.randomUUID(),
    user_id: ctx.userId,
    actor: 'user',
    action,
    object_type: action.split('.')[0] ?? 'unknown',
    object_id: objectId !== null && isUuid(objectId) ? objectId : null,
    detail: objectId !== null && !isUuid(objectId) ? { ...detail, object_ref: objectId } : detail,
    created_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}
zsh:1: no matches found: docs/superpowers/specs/2026-11-05-data-foundation-3*
    62	
    63	    const admin = getAdminSupabase();
    64	    const [claim] = await supabaseTableClient(admin).select('issuer_identifier_claims', { id }, { limit: 1 });
    65	    if (!claim) return NextResponse.json({ id, error: 'claim_not_found' }, { status: 404 });
    66	    if (amend) {
    67	      if (amend.target.issuer_id !== claim.issuer_id) return NextResponse.json({ error: 'invalid_amend', detail: 'target_issuer_mismatch' }, { status: 400 });
    68	      const stored = isObj(claim.detail) ? claim.detail : {};
    69	      const check = validateClaimDetail(amend.op, claim.id_type as ClaimIdType, { ...stored, target: amend.target, params: amend.params } as unknown as ClaimDetail);
    70	      if (!check.ok) return NextResponse.json({ error: 'invalid_amend', detail: check.error }, { status: 400 });
    71	    }
    72	
    73	    const { data, error } = await (admin as unknown as RpcClient).rpc('resolve_identifier_claim', { p_id: id, p_status: status, p_resolved_by: user.id, p_amend: amend });
    74	    if (error) {
    75	      if (CONFLICTS.has(error.message)) return NextResponse.json({ id, error: error.message }, { status: 409 });
    76	      if (error.message === 'claim_not_found') return NextResponse.json({ id, error: 'claim_not_found' }, { status: 404 });   // deleted between the read and the rpc (Task 1b P0002)
    77	      console.error('[admin/dq/claims]', error.message);
    78	      return NextResponse.json({ error: 'claim resolve unavailable' }, { status: 500 });

codex
Amendment validation does not enforce the SQL function's eligibility restriction, causing client-input errors to surface as server failures. The added tests mock the RPC and do not cover this mismatch.

Review comment:

- [P2] Reject amendments to non-evidence claims before invoking SQL — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/app/api/admin/dq/claims/[id]/route.ts:66-70
  When an accepted request includes an otherwise valid amendment for a pending `attach_security`, `close_security`, or identifier claim, this validation passes without checking the stored operation. However, `resolve_identifier_claim` only permits amendments to `evidence_only` claims and raises `invalid_claim` otherwise, which this route reports as a generic 500. Check amendment eligibility against `claim.op` and return a 400 for unsupported amendments; add a test using a non-evidence claim so the mocked RPC does not hide this mismatch.
Amendment validation does not enforce the SQL function's eligibility restriction, causing client-input errors to surface as server failures. The added tests mock the RPC and do not cover this mismatch.

Review comment:

- [P2] Reject amendments to non-evidence claims before invoking SQL — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/app/api/admin/dq/claims/[id]/route.ts:66-70
  When an accepted request includes an otherwise valid amendment for a pending `attach_security`, `close_security`, or identifier claim, this validation passes without checking the stored operation. However, `resolve_identifier_claim` only permits amendments to `evidence_only` claims and raises `invalid_claim` otherwise, which this route reports as a generic 500. Check amendment eligibility against `claim.op` and return a 400 for unsupported amendments; add a test using a non-evidence claim so the mocked RPC does not hide this mismatch.

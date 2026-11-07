OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b125-5a12-7613-89e6-f18cd43fb35b
--------
user
commit 1b53450
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 1b53450; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 1335ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-VJPA45hW' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-FDLSTk6p' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/14c-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/14c-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/14c-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-sF5KZsVt' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-nQ7x7Jx5' (errno=Operation not permitted)
1b53450 fix(dq): review fixes for reconcile wiring (cron entry, tracing, CN gate, tests)
 next.config.mjs                                    |  9 +++++--
 scripts/dq/reconcile.ts                            | 10 ++++---
 src/app/api/admin/dq/quarantine/[id]/route.test.ts |  2 +-
 src/app/api/cron/reconcile/route.test.ts           | 18 ++++++++++---
 src/lib/dq/reconcile/deps.test.ts                  | 21 ++++++++++++++-
 src/lib/dq/reconcile/deps.ts                       |  3 +++
 src/lib/facts/deps.test.ts                         | 31 ++++++++++++++++++++++
 vercel.json                                        |  4 ---
 8 files changed, 83 insertions(+), 15 deletions(-)

exec
/bin/zsh -lc 'git show 1b53450 --; pwd; ls -a | head -30; for p in /AGENTS.md /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do if [ -f "$p" ]; then echo "$p"; cat "$p"; fi; done' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-iZfYsn8A' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-tknofYgg' (errno=Operation not permitted)
commit 1b53450e7e5eaddcf03ba0a3126189b2dfae7d61
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 05:56:05 2026 -0800

    fix(dq): review fixes for reconcile wiring (cron entry, tracing, CN gate, tests)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/next.config.mjs b/next.config.mjs
index 4972423..e096074 100644
--- a/next.config.mjs
+++ b/next.config.mjs
@@ -1,13 +1,18 @@
 import createNextIntlPlugin from 'next-intl/plugin';
 
+const RECONCILE_MANIFESTS = ['./src/lib/dq/fixtures/gold/**/*.json', './src/lib/facts/fixtures/gold/*.json'];
+
 /** @type {import('next').NextConfig} */
 const nextConfig = {
   reactStrictMode: true,
   images: { unoptimized: true },
   outputFileTracingRoot: process.cwd(),
-  // The reconcile cron reads the sample and gold manifests at runtime (src/lib/dq/reconcile/deps.ts).
+  // The reconcile cron reads the sample and gold manifests at runtime (src/lib/dq/reconcile/deps.ts); so do the
+  // quarantine restore route and the admin dq dashboard (restoreInputsHashNow recomputes the current inputs hash).
   outputFileTracingIncludes: {
-    '/api/cron/reconcile': ['./src/lib/dq/fixtures/gold/**/*.json', './src/lib/facts/fixtures/gold/*.json'],
+    '/api/cron/reconcile': RECONCILE_MANIFESTS,
+    '/api/admin/dq/quarantine/[id]': RECONCILE_MANIFESTS,
+    '/api/admin/dq': RECONCILE_MANIFESTS,
   },
   // Ignore the archived static demo
   webpack: (config) => {
diff --git a/scripts/dq/reconcile.ts b/scripts/dq/reconcile.ts
index 5cc733c..af3886b 100644
--- a/scripts/dq/reconcile.ts
+++ b/scripts/dq/reconcile.ts
@@ -9,14 +9,14 @@
  * {issuer, market, natural_key, outcome, passed, action} and a summary. With --apply: one runReconcile
  * batch (triggered_by 'script', no deadline; code_version = VERCEL_GIT_COMMIT_SHA or git HEAD, refused when
  * unavailable) and the full receipt as JSON. --issuer restricts which members are processed (tickers are
- * resolved with resolveIssuer as of today). Exit 0 ok, 1 when the batch is not success or a member failed,
- * 2 on bad arguments.
+ * resolved with resolveIssuer as of today). --apply for a cn.* pair is refused (exit 2) unless FACTS_CN_ENABLED=1. Exit 0 ok, 1 when the batch
+ * is not success or a member failed, 2 on bad arguments.
  */
 import {supabaseTableClient} from '../../src/lib/db/table-client';
 import {resolveIssuer} from '../../src/lib/entities/resolve';
 import {resolveCodeVersion} from '../../src/lib/facts/deps';
 import {memoryRawStore} from '../../src/lib/dq/raw-store';
-import {productionReconcileDeps} from '../../src/lib/dq/reconcile/deps';
+import {cnPairEnabled,productionReconcileDeps} from '../../src/lib/dq/reconcile/deps';
 import {RECONCILE_PAIRS} from '../../src/lib/dq/reconcile/pairs';
 import {runReconcile} from '../../src/lib/dq/reconcile/run';
 import {CYCLE_PAIR_IDS} from '../../src/lib/dq/reconcile/types';
@@ -34,7 +34,9 @@ async function main(){
   else if(x==='--apply')apply=true;
   else{console.error(USAGE);process.exit(2);}
  }
- if(!(CYCLE_PAIR_IDS as readonly string[]).includes(pair)||!RECONCILE_PAIRS[pair as CyclePairId]){console.error(`${USAGE}\nregistered: ${Object.keys(RECONCILE_PAIRS).join(', ')}`);process.exit(2);}
+ if(!(CYCLE_PAIR_IDS as readonly string[]).includes(pair)){console.error(USAGE);process.exit(2);}
+ if(apply&&!cnPairEnabled(pair)){console.error('cn_disabled: --apply for cn.* pairs needs FACTS_CN_ENABLED=1');process.exit(2);}   // before any production deps
+ if(!RECONCILE_PAIRS[pair as CyclePairId]){console.error(`${USAGE}\nregistered: ${Object.keys(RECONCILE_PAIRS).join(', ')}`);process.exit(2);}
  const sb=getAdminSupabase();const tables=supabaseTableClient(sb);const today=new Date().toISOString().slice(0,10);
  const issuerIds:string[]=[];
  for(const t of tickers){const r=await resolveIssuer(tables,{ticker:t},{today});if(!r){console.error(`unknown ticker: ${t}`);process.exit(2);}issuerIds.push(r.issuer_id);}
diff --git a/src/app/api/admin/dq/quarantine/[id]/route.test.ts b/src/app/api/admin/dq/quarantine/[id]/route.test.ts
index 1daac3c..d98d7b0 100644
--- a/src/app/api/admin/dq/quarantine/[id]/route.test.ts
+++ b/src/app/api/admin/dq/quarantine/[id]/route.test.ts
@@ -124,7 +124,7 @@ describe('POST /api/admin/dq/quarantine/[id]', () => {
     const res = await json({ status: 'resolved_accept', chosen_fact_ids: [FACT_A] });
     expect(res.status).toBe(200);
     expect(await res.json()).toEqual({ id: ID, outcome: 'resolved', hook: HOOK, promoted: 1, skipped: 0, chosen_fact_ids: [FACT_A] });
-    expect(mocks.resolveFacts).toHaveBeenCalledWith({ facts: 'db' }, client, expect.objectContaining({ id: ID, dataset: 'facts.us' }), expect.objectContaining({ status: 'resolved_accept', chosenFactIds: [FACT_A], resolvedBy: ADMIN }));
+    expect(mocks.resolveFacts).toHaveBeenCalledWith({ facts: 'db' }, client, expect.objectContaining({ id: ID, dataset: 'facts.us' }), { status: 'resolved_accept', chosenFactIds: [FACT_A], resolvedBy: ADMIN, inputsHashNow: mocks.hashNow });
     expect(mocks.resolve).not.toHaveBeenCalled();
     expect(mocks.insert.mock.calls[0][0]).toMatchObject({ detail: { id: ID, status: 'resolved_accept', outcome: 'resolved', chosen_fact_ids: [FACT_A], hook: HOOK } });
   });
diff --git a/src/app/api/cron/reconcile/route.test.ts b/src/app/api/cron/reconcile/route.test.ts
index 89221db..a27358d 100644
--- a/src/app/api/cron/reconcile/route.test.ts
+++ b/src/app/api/cron/reconcile/route.test.ts
@@ -4,6 +4,7 @@ import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
 const mocks=vi.hoisted(()=>({run:vi.fn(),deps:vi.fn(),codeVersion:vi.fn()}));
 vi.mock('@/lib/dq/reconcile/run',async importOriginal=>({...(await importOriginal<typeof import('@/lib/dq/reconcile/run')>()),runReconcile:mocks.run}));
 vi.mock('@/lib/dq/reconcile/deps',()=>({productionReconcileDeps:mocks.deps}));
+vi.mock('@/lib/dq/reconcile/pairs',async importOriginal=>{const o=await importOriginal<typeof import('@/lib/dq/reconcile/pairs')>();return {...o,RECONCILE_PAIRS:{...o.RECONCILE_PAIRS,'cn.tushare_vs_cninfo_pdf_gold':{id:'cn.tushare_vs_cninfo_pdf_gold'}}};});   // a CN pair registered (as Task 16a will) so the gate is reached
 vi.mock('@/lib/facts/deps',()=>({resolveCodeVersion:mocks.codeVersion}));
 
 import {GET,POST} from './route';
@@ -38,11 +39,22 @@ describe('reconcile cron',()=>{
   }
   expect(mocks.run).not.toHaveBeenCalled();
  });
- it('refuses CN pairs unless FACTS_CN_ENABLED=1 (degraded path: no CN cron)',async()=>{
-  const res=await GET(req('pair=cn.tushare_vs_cninfo_pdf_gold',AUTH));
-  expect([400,403]).toContain(res.status);   // 400 until Task 16a registers the CN pair, 403 afterwards
+ it('answers 400 for a cycle pair that is not registered yet (US iXBRL until Task 15a) and does not run it',async()=>{
+  const res=await GET(req('pair=us.companyfacts_vs_ixbrl',AUTH));
+  expect(res.status).toBe(400);expect((await res.json()).error.code).toBe('invalid_parameter:pair');
   expect(mocks.run).not.toHaveBeenCalled();
  });
+ it('refuses a registered CN pair with exactly 403 cn_disabled unless FACTS_CN_ENABLED=1, then runs it',async()=>{
+  for(const v of [undefined,'0','true']){
+   if(v===undefined)delete process.env.FACTS_CN_ENABLED;else process.env.FACTS_CN_ENABLED=v;
+   const res=await GET(req('pair=cn.tushare_vs_cninfo_pdf_gold',AUTH));
+   expect(res.status,String(v)).toBe(403);expect((await res.json()).error.code).toBe('cn_disabled');
+  }
+  expect(mocks.run).not.toHaveBeenCalled();expect(mocks.deps).not.toHaveBeenCalled();
+  process.env.FACTS_CN_ENABLED='1';
+  expect((await GET(req('pair=cn.tushare_vs_cninfo_pdf_gold',AUTH))).status).toBe(200);
+  expect(mocks.run).toHaveBeenCalledWith({tag:'deps'},{pair:'cn.tushare_vs_cninfo_pdf_gold',triggeredBy:'cron'});
+ });
  it('refuses to run without a code version',async()=>{
   mocks.codeVersion.mockReturnValue(null);
   const res=await POST(req('pair=facts.lineage_same_day',AUTH));
diff --git a/src/lib/dq/reconcile/deps.test.ts b/src/lib/dq/reconcile/deps.test.ts
index 3efcbd8..9b098ab 100644
--- a/src/lib/dq/reconcile/deps.test.ts
+++ b/src/lib/dq/reconcile/deps.test.ts
@@ -3,7 +3,8 @@ import {describe,expect,it,vi} from 'vitest';
 import type {SupabaseClient} from '@supabase/supabase-js';
 const mocks=vi.hoisted(()=>({hash:vi.fn()}));
 vi.mock('./pairs',async importOriginal=>({...(await importOriginal<typeof import('./pairs')>()),inputsHashNow:mocks.hash}));
-import {REPO_FILE_PREFIXES,readRepoFileFromDisk,restoreInputsHashNow} from './deps';
+import {spawnSync} from 'node:child_process';
+import {REPO_FILE_PREFIXES,cnPairEnabled,readRepoFileFromDisk,restoreInputsHashNow} from './deps';
 
 describe('restoreInputsHashNow (quarantine route + admin dashboard, spec §5.6)',()=>{
  it('passes the hash through; known data gaps become inputs_unavailable, an unobtainable current right side current_evidence_unavailable (plan audit P2); anything else is rethrown',async()=>{
@@ -27,3 +28,21 @@ describe('readRepoFileFromDisk',()=>{
    await expect(readRepoFileFromDisk(p),p).rejects.toThrow('repo_file_not_allowed');
  });
 });
+
+describe('CN gate (FACTS_CN_ENABLED)',()=>{
+ it('cnPairEnabled: non-CN pairs always, cn.* only with FACTS_CN_ENABLED=1',()=>{
+  expect(cnPairEnabled('facts.lineage_same_day',{})).toBe(true);
+  expect(cnPairEnabled('cn.tushare_vs_cninfo_pdf_gold',{})).toBe(false);
+  expect(cnPairEnabled('cn.tushare_vs_cninfo_pdf_gold',{FACTS_CN_ENABLED:'true'})).toBe(false);
+  expect(cnPairEnabled('cn.tushare_vs_cninfo_pdf_gold',{FACTS_CN_ENABLED:'1'})).toBe(true);
+ });
+ const run=(env:Record<string,string>,args:string[])=>spawnSync('npx',['tsx','scripts/dq/reconcile.ts',...args],{encoding:'utf8',env:{...process.env,FACTS_CN_ENABLED:'',...env},timeout:60_000});
+ it('scripts/dq/reconcile.ts refuses --apply for a cn.* pair unless enabled, before building production deps; the enabled run gets past the gate',()=>{
+  const off=run({},['--pair','cn.tushare_vs_cninfo_pdf_gold','--apply']);
+  expect(off.status).toBe(2);expect(off.stderr).toContain('cn_disabled');
+  const on=run({FACTS_CN_ENABLED:'1'},['--pair','cn.tushare_vs_cninfo_pdf_gold','--apply']);
+  expect(on.status).toBe(2);expect(on.stderr).not.toContain('cn_disabled');expect(on.stderr).toContain('registered:');   // CN pair is not registered until Task 16a: the next check answers
+  const dry=run({},['--pair','cn.tushare_vs_cninfo_pdf_gold']);
+  expect(dry.stderr).not.toContain('cn_disabled');   // a dry run needs no gate
+ },120_000);
+});
diff --git a/src/lib/dq/reconcile/deps.ts b/src/lib/dq/reconcile/deps.ts
index 462754e..477ce4f 100644
--- a/src/lib/dq/reconcile/deps.ts
+++ b/src/lib/dq/reconcile/deps.ts
@@ -47,6 +47,9 @@ export function restoreInputsHashNow(admin?:SupabaseClient):InputsHashNow{
  };
 }
 
+/** CN pairs run only with FACTS_CN_ENABLED=1 (no Tushare token / unverified gold: spec T15). Shared by the cron route and the script. */
+export const cnPairEnabled=(pair:string,env:Record<string,string|undefined>=process.env):boolean=>!pair.startsWith('cn.')||env.FACTS_CN_ENABLED==='1';
+
 export interface ProductionReconcileOptions{deadline:Date|null;codeVersion:string;admin?:SupabaseClient}
 export function productionReconcileDeps(opts:ProductionReconcileOptions):ReconcileDeps{
  const sb=opts.admin??getAdminSupabase();
diff --git a/src/lib/facts/deps.test.ts b/src/lib/facts/deps.test.ts
index 7fe76fc..7f561b6 100644
--- a/src/lib/facts/deps.test.ts
+++ b/src/lib/facts/deps.test.ts
@@ -1,11 +1,18 @@
 // src/lib/facts/deps.test.ts
 import {afterEach,describe,expect,it,vi} from 'vitest';
 import {memoryTableClient} from '../db/memory-table-client';
+import {memoryRawStore} from '../dq/raw-store';
 import {cninfoLinker,productionSyncDeps,resolveCodeVersion} from './deps';
 import {coverageSummary,parseTushareStatements} from './providers/tushare-statements';
 import {loadTushareFixtures} from './providers/tushare-fixtures';
 import type {Budget,FactsDb,FilingRow} from './types';
 
+// Per-test overrides for the production wiring's Supabase-backed collaborators (null = the real factory).
+const over=vi.hoisted(()=>({facts:null as unknown,tables:null as unknown,raw:null as unknown}));
+vi.mock('./db',async importOriginal=>{const o=await importOriginal<typeof import('./db')>();return {...o,supabaseFactsDb:((sb:never)=>over.facts??o.supabaseFactsDb(sb)) as typeof o.supabaseFactsDb};});
+vi.mock('../db/table-client',async importOriginal=>{const o=await importOriginal<typeof import('../db/table-client')>();return {...o,supabaseTableClient:((sb:never)=>over.tables??o.supabaseTableClient(sb)) as typeof o.supabaseTableClient};});
+vi.mock('../dq/raw-store',async importOriginal=>{const o=await importOriginal<typeof import('../dq/raw-store')>();return {...o,supabaseRawStore:((sb:never)=>over.raw??o.supabaseRawStore(sb)) as typeof o.supabaseRawStore};});
+
 const SHA='c'.repeat(40);
 const original=process.env.VERCEL_GIT_COMMIT_SHA;
 afterEach(()=>{if(original===undefined)delete process.env.VERCEL_GIT_COMMIT_SHA;else process.env.VERCEL_GIT_COMMIT_SHA=original;});
@@ -103,3 +110,27 @@ describe('productionSyncDeps',()=>{
  });
 });
 
+
+describe('productionSyncDeps step 9b date-mismatch recording (plan 3 Task 14c)',()=>{
+ afterEach(()=>{over.facts=null;over.tables=null;over.raw=null;vi.unstubAllGlobals();});
+ it('writes a sec.filing_date_vs_submissions row (cycle-less, no batch) when the submissions filingDate differs from available_date',async()=>{
+  const tables=memoryTableClient({});
+  const availableDate=new Date(Date.now()-10*86_400_000).toISOString().slice(0,10);
+  const filing={filing_id:'F1',issuer_id:'I',market:'US',source:'edgar',source_ref:'0000320193-26-000001',available_date:availableDate,accepted_at:null} as unknown as FilingRow;
+  const setAcceptance=vi.fn(async()=>true);
+  over.facts={filingsOfIssuer:async()=>[filing],setFilingAcceptance:setAcceptance};over.tables=tables;over.raw=memoryRawStore();
+  const main={cik:'320193',name:'Apple',tickers:[],exchanges:[],filings:{recent:{accessionNumber:[filing.source_ref],filingDate:['2020-01-02'],form:['10-K'],acceptanceDateTime:['2020-01-02T06:00:00.000Z']},files:[]}};
+  const fetchStub=vi.fn(async()=>new Response(JSON.stringify(main),{status:200,headers:{'content-type':'application/json'}}));
+  vi.stubGlobal('fetch',fetchStub);
+  const deps=productionSyncDeps({deadline:null,codeVersion:SHA,admin:{} as never});
+  const budget:Budget={remainingMs:()=>300_000,signal:new AbortController().signal};
+  const out=await deps.enrichAcceptance!('I','0000320193',budget);
+  expect(fetchStub).toHaveBeenCalledTimes(1);
+  expect(out.mismatches).toHaveLength(1);
+  expect(setAcceptance).not.toHaveBeenCalled();   // a mismatching filing is not stamped
+  const rows=await tables.select('dq_reconciliations',{pair:'sec.filing_date_vs_submissions'});
+  expect(rows).toHaveLength(1);
+  expect(rows[0]).toMatchObject({dataset:'reconcile.sec.filing_date_vs_submissions',kind:'date',outcome:'compared',passed:false,batch_id:null,cycle_id:null,issuer_id:null,natural_key:`320193:${filing.source_ref}`});
+  expect(rows[0].detail).toMatchObject({left_text:availableDate,right_text:'2020-01-02'});
+ });
+});
diff --git a/vercel.json b/vercel.json
index 009bb64..87257e1 100644
--- a/vercel.json
+++ b/vercel.json
@@ -30,10 +30,6 @@
       "path": "/api/cron/facts-sync?market=US",
       "schedule": "5 */4 * * *"
     },
-    {
-      "path": "/api/cron/reconcile?pair=us.companyfacts_vs_ixbrl",
-      "schedule": "0 2 * * *"
-    },
     {
       "path": "/api/cron/reconcile?pair=facts.lineage_same_day",
       "schedule": "0 4 * * *"
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
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
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>
exec
/bin/zsh -lc "cat next.config.mjs; cat src/lib/dq/reconcile/deps.ts; cat src/app/api/cron/reconcile/route.ts; cat package.json; rg -n 'outputFileTracingIncludes|picomatch' node_modules/next/dist/build/collect-build-traces.js; find . -name 'AGENTS*' -not -path './node_modules/*'; cat src/app/api/admin/dq/route.ts" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 80ms:
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
    return [{ source: '/dashboard', destination: '/today', permanent: true }];
  },
};

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default withNextIntl(nextConfig);
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
import {inputsHashNow} from './pairs';
import type {ReconcileDeps} from './run';
import type {PairContext} from './types';

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

export interface ProductionReconcileOptions{deadline:Date|null;codeVersion:string;admin?:SupabaseClient}
export function productionReconcileDeps(opts:ProductionReconcileOptions):ReconcileDeps{
 const sb=opts.admin??getAdminSupabase();
 return {db:supabaseFactsDb(sb),tables:supabaseTableClient(sb),raw:supabaseRawStore(sb),fetch:globalThis.fetch.bind(globalThis),
  readRepoFile:readRepoFileFromDisk,now:()=>new Date(),deadline:opts.deadline,codeVersion:opts.codeVersion};
}
// src/app/api/cron/reconcile/route.ts
// Reconciliation trigger (spec §5.5): GET|POST /api/cron/reconcile?pair=<cycle pair id>. Same rules as
// /api/cron/facts-sync: CRON_SECRET bearer (constant-time), maxDuration 300 with a 240 s deadline handed to
// the runner (which starts a member only with >= 60 s left), a missing code_version refuses the run. The pair
// must be given once and be a REGISTERED cycle pair; cn.* pairs are refused unless FACTS_CN_ENABLED=1 (no
// Tushare token, no verified gold yet; vercel.json schedules US iXBRL 02:00 and lineage 04:00 UTC only).
// A duplicate cron delivery is harmless: cursor claims are fenced, a second worker finds nothing claimable.
// The HTTP receipt carries codes, keys and counts only — never error messages or dry-run results.
import {timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {resolveCodeVersion} from '@/lib/facts/deps';
import {productionReconcileDeps} from '@/lib/dq/reconcile/deps';
import {ReconcileConfigError} from '@/lib/dq/reconcile/pair-support';
import {RECONCILE_PAIRS} from '@/lib/dq/reconcile/pairs';
import {ReconcileError,runReconcile} from '@/lib/dq/reconcile/run';
import type {ReconcileReceipt} from '@/lib/dq/reconcile/run';
import {CYCLE_PAIR_IDS} from '@/lib/dq/reconcile/types';
import type {CyclePairId} from '@/lib/dq/reconcile/types';

export const dynamic='force-dynamic';
export const maxDuration=300;
const DEADLINE_MS=240_000;
const err=(code:string,message:string,status:number)=>NextResponse.json({error:{code,message}},{status,headers:{'Cache-Control':'no-store'}});

function publicReceipt(r:ReconcileReceipt){
 return {batchId:r.batchId,status:r.status,counts:r.counts,errors:r.errors.map(e=>e.key===undefined?{code:e.code}:{code:e.code,key:e.key}),cycle:r.cycle,
  members:r.members.map(m=>({issuerId:m.issuerId,market:m.market,outcome:m.outcome,...(m.counts?{counts:m.counts}:{}),...(m.code?{code:m.code.split(':')[0]}:{})})),hooks:r.hooks};
}
function authorized(auth:string|null,secret:string):boolean{
 const expected=Buffer.from(`Bearer ${secret}`),actual=Buffer.from(auth??'');
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}

async function run(request:Request):Promise<NextResponse>{
 const secret=process.env.CRON_SECRET;
 if(!secret)return err('cron_unavailable','Cron unavailable',503);
 if(!authorized(request.headers.get('authorization'),secret))return err('unauthorized','Unauthorized',401);
 const pairs=new URL(request.url).searchParams.getAll('pair');
 const pair=pairs.length===1?pairs[0]:'';
 if(!(CYCLE_PAIR_IDS as readonly string[]).includes(pair)||!RECONCILE_PAIRS[pair as CyclePairId])return err('invalid_parameter:pair','pair must be one registered cycle pair',400);
 if(pair.startsWith('cn.')&&process.env.FACTS_CN_ENABLED!=='1')return err('cn_disabled','CN reconciliation is not enabled (FACTS_CN_ENABLED)',403);
 const codeVersion=resolveCodeVersion({allowGit:false});
 if(!codeVersion)return err('code_version_unavailable','VERCEL_GIT_COMMIT_SHA not set',503);
 const started=new Date();
 try{
  const receipt=await runReconcile(productionReconcileDeps({deadline:new Date(started.getTime()+DEADLINE_MS),codeVersion}),{pair:pair as CyclePairId,triggeredBy:'cron'});
  return NextResponse.json({ok:receipt.status==='success',pair,started_at:started.toISOString(),receipt:publicReceipt(receipt)},{status:200,headers:{'Cache-Control':'no-store'}});
 }catch(e){
  return err(e instanceof ReconcileError||e instanceof ReconcileConfigError?e.code:'reconcile_failed','Reconcile failed',500);
 }
}

export async function GET(request:Request){return run(request);}
export async function POST(request:Request){return run(request);}
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
18:const _picomatch = /*#__PURE__*/ _interop_require_default(require("next/dist/compiled/picomatch"));
105:    const { outputFileTracingIncludes = {}, outputFileTracingExcludes = {} } = config;
107:    const includeGlobKeys = Object.keys(outputFileTracingIncludes);
151:            if ((0, _picomatch.default)(glob)('next-server')) {
159:            const isMatch = (0, _picomatch.default)(ignores, {
455:    // apply outputFileTracingIncludes/outputFileTracingExcludes after runTurbotrace
496:                const isMatch = (0, _picomatch.default)(curGlob, {
501:                    for (const include of outputFileTracingIncludes[curGlob]){
507:                const isMatch = (0, _picomatch.default)(curGlob, {
548:                const isMatch = (0, _picomatch.default)(resolvedGlobs, {
import { NextResponse } from 'next/server';
import {
  AdminForbidden,
  AdminUnauthenticated,
  requireAdminUser,
} from '@/lib/admin/auth';
import { supabaseTableClient } from '@/lib/db/table-client';
import { loadDqDashboard, parseDqQuery } from '@/lib/dq/dashboard';
import { getAdminSupabase } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminUser();
    const parsed = parseDqQuery(new URL(request.url).searchParams);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const client = supabaseTableClient(getAdminSupabase());
    return NextResponse.json(await loadDqDashboard(client, parsed.query, new Date()));
  } catch (error) {
    if (error instanceof AdminUnauthenticated) {
      return NextResponse.json({ error: 'authentication required' }, { status: 401 });
    }
    if (error instanceof AdminForbidden) {
      return NextResponse.json({ error: 'admin role required' }, { status: 403 });
    }
    console.error('[admin/dq]', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'dq dashboard unavailable' }, { status: 500 });
  }
}

exec
/bin/zsh -lc "sed -n '475,510p' node_modules/next/dist/build/collect-build-traces.js; node -e 'const p=require(\"next/dist/compiled/picomatch\"); console.log(p(\"/api/admin/dq/quarantine/[id]\",{dot:true,contains:true})(\"/api/admin/dq/quarantine/[id]\"))'; cat src/lib/dq/reconcile/pairs.ts | head -100; cat scripts/dq/reconcile.ts; cat vitest.config.*; cat src/lib/facts/deps.test.ts | head -115" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
            ...entryNameFilesMap ? Object.entries(entryNameFilesMap) : new Map()
        ].map(async ([entryName])=>{
            const isApp = entryName.startsWith('app/');
            const isPages = entryName.startsWith('pages/');
            let route = entryName;
            if (isApp) {
                route = (0, _apppaths.normalizeAppPath)(entryName);
            }
            if (isPages) {
                route = (0, _normalizepagepath.normalizePagePath)(entryName);
            }
            if (staticPages.includes(route)) {
                return;
            }
            // edge routes have no trace files
            if (edgeRuntimeRoutes.hasOwnProperty(route)) {
                return;
            }
            const combinedIncludes = new Set();
            const combinedExcludes = new Set();
            for (const curGlob of includeGlobKeys){
                const isMatch = (0, _picomatch.default)(curGlob, {
                    dot: true,
                    contains: true
                });
                if (isMatch(route)) {
                    for (const include of outputFileTracingIncludes[curGlob]){
                        combinedIncludes.add(include.replace(/\\/g, '/'));
                    }
                }
            }
            for (const curGlob of excludeGlobKeys){
                const isMatch = (0, _picomatch.default)(curGlob, {
                    dot: true,
                    contains: true
                });
true
// src/lib/dq/reconcile/pairs.ts
// Registry of the cycle pairs run by run.ts (spec §5.1; contract C3). Task 14 registers
// facts.lineage_same_day and us.companyfacts_vs_gold; Task 15 adds us.companyfacts_vs_ixbrl; Task 16 adds
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
import {lineageSameDayPair} from './pair-lineage';
import {sha256Hex} from './pair-support';
import type {RegisteredPair} from './pair-support';
import {usCompanyfactsVsGoldPair} from './pair-us-gold';
import type {CyclePairId,PairContext} from './types';

export const RECONCILE_PAIRS:Partial<Record<CyclePairId,RegisteredPair>>={
 'facts.lineage_same_day':lineageSameDayPair(),
 'us.companyfacts_vs_gold':usCompanyfactsVsGoldPair(),
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
// scripts/dq/reconcile.ts
/**
 * Runs one reconciliation pair (spec §5.5).
 *
 *   node --env-file=.env.local --import tsx scripts/dq/reconcile.ts --pair <cycle pair id> [--issuer <ticker>...] [--apply]
 *
 * Without --apply: dry run — members + evaluate only (right documents go to an in-memory raw store, no
 * batch, no cycle, no result rows, no items); prints one JSON line per expected key
 * {issuer, market, natural_key, outcome, passed, action} and a summary. With --apply: one runReconcile
 * batch (triggered_by 'script', no deadline; code_version = VERCEL_GIT_COMMIT_SHA or git HEAD, refused when
 * unavailable) and the full receipt as JSON. --issuer restricts which members are processed (tickers are
 * resolved with resolveIssuer as of today). --apply for a cn.* pair is refused (exit 2) unless FACTS_CN_ENABLED=1. Exit 0 ok, 1 when the batch
 * is not success or a member failed, 2 on bad arguments.
 */
import {supabaseTableClient} from '../../src/lib/db/table-client';
import {resolveIssuer} from '../../src/lib/entities/resolve';
import {resolveCodeVersion} from '../../src/lib/facts/deps';
import {memoryRawStore} from '../../src/lib/dq/raw-store';
import {cnPairEnabled,productionReconcileDeps} from '../../src/lib/dq/reconcile/deps';
import {RECONCILE_PAIRS} from '../../src/lib/dq/reconcile/pairs';
import {runReconcile} from '../../src/lib/dq/reconcile/run';
import {CYCLE_PAIR_IDS} from '../../src/lib/dq/reconcile/types';
import type {CyclePairId} from '../../src/lib/dq/reconcile/types';
import {getAdminSupabase} from '../../src/lib/supabase/admin';

const USAGE='usage: reconcile.ts --pair <cycle pair id> [--issuer <ticker>...] [--apply]';

async function main(){
 const argv=process.argv.slice(2);let pair='',apply=false;const tickers:string[]=[];
 for(let i=0;i<argv.length;i++){
  const x=argv[i],v=argv[i+1];
  if(x==='--pair'&&v){pair=v;i++;}
  else if(x==='--issuer'&&v){tickers.push(v);i++;}
  else if(x==='--apply')apply=true;
  else{console.error(USAGE);process.exit(2);}
 }
 if(!(CYCLE_PAIR_IDS as readonly string[]).includes(pair)){console.error(USAGE);process.exit(2);}
 if(apply&&!cnPairEnabled(pair)){console.error('cn_disabled: --apply for cn.* pairs needs FACTS_CN_ENABLED=1');process.exit(2);}   // before any production deps
 if(!RECONCILE_PAIRS[pair as CyclePairId]){console.error(`${USAGE}\nregistered: ${Object.keys(RECONCILE_PAIRS).join(', ')}`);process.exit(2);}
 const sb=getAdminSupabase();const tables=supabaseTableClient(sb);const today=new Date().toISOString().slice(0,10);
 const issuerIds:string[]=[];
 for(const t of tickers){const r=await resolveIssuer(tables,{ticker:t},{today});if(!r){console.error(`unknown ticker: ${t}`);process.exit(2);}issuerIds.push(r.issuer_id);}
 const codeVersion=apply?resolveCodeVersion({allowGit:true}):'dry-run';
 if(!codeVersion){console.error('code_version unavailable (VERCEL_GIT_COMMIT_SHA or git HEAD): refusing to apply');process.exit(2);}
 const base=productionReconcileDeps({deadline:null,codeVersion,admin:sb});
 const deps=apply?base:{...base,raw:memoryRawStore()};
 const receipt=await runReconcile(deps,{pair:pair as CyclePairId,triggeredBy:'script',dryRun:!apply,...(issuerIds.length?{issuerIds}:{})});
 if(!apply){
  let n=0;
  for(const m of receipt.dryRun??[])for(const r of m.results){n++;console.log(JSON.stringify({issuer:m.issuerId,market:m.market,natural_key:r.natural_key,outcome:r.outcome,passed:r.passed,action:r.action}));}
  console.log(JSON.stringify({pair,dry_run:true,members:receipt.dryRun?.length??0,keys:n}));
  process.exit(0);
 }
 console.log(JSON.stringify(receipt,null,1));
 process.exit(receipt.status==='success'&&receipt.members.every(m=>m.outcome!=='failed')?0:1);
}

main().catch(e=>{console.error(e instanceof Error?e.stack??e.message:e);process.exit(1);});
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
// src/lib/facts/deps.test.ts
import {afterEach,describe,expect,it,vi} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {memoryRawStore} from '../dq/raw-store';
import {cninfoLinker,productionSyncDeps,resolveCodeVersion} from './deps';
import {coverageSummary,parseTushareStatements} from './providers/tushare-statements';
import {loadTushareFixtures} from './providers/tushare-fixtures';
import type {Budget,FactsDb,FilingRow} from './types';

// Per-test overrides for the production wiring's Supabase-backed collaborators (null = the real factory).
const over=vi.hoisted(()=>({facts:null as unknown,tables:null as unknown,raw:null as unknown}));
vi.mock('./db',async importOriginal=>{const o=await importOriginal<typeof import('./db')>();return {...o,supabaseFactsDb:((sb:never)=>over.facts??o.supabaseFactsDb(sb)) as typeof o.supabaseFactsDb};});
vi.mock('../db/table-client',async importOriginal=>{const o=await importOriginal<typeof import('../db/table-client')>();return {...o,supabaseTableClient:((sb:never)=>over.tables??o.supabaseTableClient(sb)) as typeof o.supabaseTableClient};});
vi.mock('../dq/raw-store',async importOriginal=>{const o=await importOriginal<typeof import('../dq/raw-store')>();return {...o,supabaseRawStore:((sb:never)=>over.raw??o.supabaseRawStore(sb)) as typeof o.supabaseRawStore};});

const SHA='c'.repeat(40);
const original=process.env.VERCEL_GIT_COMMIT_SHA;
afterEach(()=>{if(original===undefined)delete process.env.VERCEL_GIT_COMMIT_SHA;else process.env.VERCEL_GIT_COMMIT_SHA=original;});

describe('resolveCodeVersion',()=>{
 it('prefers a 40-hex VERCEL_GIT_COMMIT_SHA',()=>{process.env.VERCEL_GIT_COMMIT_SHA=SHA;expect(resolveCodeVersion({allowGit:true})).toBe(SHA);expect(resolveCodeVersion({allowGit:false})).toBe(SHA);});
 it('returns null without a valid env value when git is not allowed',()=>{
  delete process.env.VERCEL_GIT_COMMIT_SHA;expect(resolveCodeVersion({allowGit:false})).toBeNull();
  process.env.VERCEL_GIT_COMMIT_SHA='deadbeef';expect(resolveCodeVersion({allowGit:false})).toBeNull();   // not a full sha → not trusted
 });
 it('falls back to git rev-parse HEAD (with -dirty when the tree is dirty) when allowed',()=>{
  delete process.env.VERCEL_GIT_COMMIT_SHA;
  expect(resolveCodeVersion({allowGit:true})).toMatch(/^[0-9a-f]{40}(-dirty)?$/);
 });
});

describe('cninfoLinker',()=>{
 const budget=():Budget=>({remainingMs:()=>300_000,signal:new AbortController().signal});
 const filing=(p:Partial<FilingRow>={}):FilingRow=>({filing_id:'g',issuer_id:'I',market:'CN',source:'tushare',origin:'sse',form_type:'annual',fiscal_year:2024,fiscal_period:'FY',period_end:'2024-12-31',available_date:'2025-04-03',source_ref:'600519.SH:20241231:1:20250403',url:null,document_ref:null,document_url:null,link_attempts:0,mapping_gen:1,run_id:'r',created_at:'2025-04-03T00:00:00Z',accepted_at:null,acceptance_source:null,...p});
 const fakeDb=(filings:FilingRow[])=>({filingsOfIssuer:async()=>filings}) as unknown as Pick<FactsDb,'filingsOfIssuer'>;
 async function tablesWithMoutai(){
  const tables=memoryTableClient({issuers:['issuer_id']});
  await tables.insert('issuers',{issuer_id:'I',cninfo_org_id:'9900000227',status:'active'});
  await tables.insert('issuer_securities',{issuer_id:'I',ticker:'600519.SH',is_primary:true,valid_from:'2001-08-27',valid_to:null});
  await tables.insert('issuer_securities',{issuer_id:'I',ticker:'600519.OLD',is_primary:true,valid_from:'1990-01-01',valid_to:'2001-08-26'});
  return tables;
 }
 it('resolves ts_code and org id once per issuer, queries cninfo with the collector body, and flags a type-1 filing with a type-5 sibling as corrected',async()=>{
  const bodies:string[]=[];
  const fetch=vi.fn(async(_input:RequestInfo|URL,init?:RequestInit)=>{bodies.push(String(init?.body));return new Response(JSON.stringify({announcements:[{announcementId:'2',announcementTitle:'贵州茅台：关于2024年年度报告的更正公告',adjunctUrl:'finalpage/2025-04-03/2.PDF'}],hasMore:false}),{status:200});});
  const db=fakeDb([filing(),filing({filing_id:'h',source_ref:'600519.SH:20241231:5:20250301',available_date:'2025-03-01'})]);
  const link=cninfoLinker(await tablesWithMoutai(),db,{fetch,minIntervalMs:0});
  expect(await link(filing(),budget())).toEqual({document_ref:'2',document_url:'https://static.cninfo.com.cn/finalpage/2025-04-03/2.PDF'});   // corrected → a 更正 title is the match
  expect(bodies[0]).toContain('stock=600519%2C9900000227');expect(bodies[0]).toContain('column=sse');expect(bodies[0]).toContain('seDate=2025-03-31%7E2025-04-06');
  expect(await link(filing({filing_id:'q',form_type:'q1',period_end:'2024-03-31',source_ref:'600519.SH:20240331:1:20240426',available_date:'2024-04-26'}),budget())).toBe('none');   // not corrected → 更正 title excluded
  expect(fetch).toHaveBeenCalledTimes(2);   // issuer context is cached: only the two hisAnnouncement queries
 });
 it("answers 'unlinkable' (no attempt consumed) without touching the network when the issuer has no current A-share listing",async()=>{
  const tables=memoryTableClient({issuers:['issuer_id']});
  await tables.insert('issuers',{issuer_id:'U',cninfo_org_id:null,status:'active'});
  const fetch=vi.fn();
  const link=cninfoLinker(tables,fakeDb([]),{fetch});
  expect(await link(filing({issuer_id:'U'}),budget())).toBe('unlinkable');
  expect(fetch).not.toHaveBeenCalled();
 });
 it('uses the scope A-share selection: B shares are excluded, two undecidable A-shares are ambiguous (unlinkable), a sole non-primary A-share is used',async()=>{
  const mk=async(secs:{ticker:string;is_primary:boolean;share_class?:string}[])=>{
   const t=memoryTableClient({issuers:['issuer_id']});
   await t.insert('issuers',{issuer_id:'I',cninfo_org_id:'9900000227',status:'active'});
   for(const x of secs)await t.insert('issuer_securities',{issuer_id:'I',valid_from:'2001-08-27',valid_to:null,...x});
   return t;
  };
  const body=async(t:Awaited<ReturnType<typeof mk>>)=>{
   const bodies:string[]=[];
   const fetch=vi.fn(async(_i:RequestInfo|URL,init?:RequestInit)=>{bodies.push(String(init?.body));return new Response(JSON.stringify({announcements:[],hasMore:false}),{status:200});});
   const r=await cninfoLinker(t,fakeDb([]),{fetch,minIntervalMs:0,today:'2026-11-04'})(filing(),budget());
   return {r,bodies};
  };
  const b=await body(await mk([{ticker:'900901.SH',is_primary:true},{ticker:'600519.SH',is_primary:false}]));
  expect(b.bodies[0]).toContain('stock=600519%2C');                       // the B share (900xxx.SH) is never queried
  expect((await body(await mk([{ticker:'900901.SH',is_primary:true}]))).r).toBe('unlinkable');
  expect((await body(await mk([{ticker:'600519.SH',is_primary:true},{ticker:'000001.SZ',is_primary:true}]))).r).toBe('unlinkable');   // ambiguous
  expect((await body(await mk([{ticker:'600519.SH',is_primary:false}]))).bodies.length).toBe(1);
 });
 it('reads the current A-share listing by the landed validity predicate: a scheduled future end still counts, a past end does not',async()=>{
  const tables=memoryTableClient({issuers:['issuer_id']});
  await tables.insert('issuers',{issuer_id:'I',cninfo_org_id:'9900000227',status:'active'});
  await tables.insert('issuer_securities',{issuer_id:'I',ticker:'600519.SH',is_primary:true,valid_from:'2001-08-27',valid_to:'2030-12-31'});
  const bodies:string[]=[];
  const fetch=vi.fn(async(_input:RequestInfo|URL,init?:RequestInit)=>{bodies.push(String(init?.body));return new Response(JSON.stringify({announcements:[],hasMore:false}),{status:200});});
  expect(await cninfoLinker(tables,fakeDb([]),{fetch,minIntervalMs:0,today:'2026-11-04'})(filing(),budget())).toBe('none');
  expect(bodies[0]).toContain('stock=600519%2C9900000227');                                            // the listing was resolved → a query went out
  const noCall=vi.fn();
  expect(await cninfoLinker(tables,fakeDb([]),{fetch:noCall,today:'2031-01-01'})(filing(),budget())).toBe('unlinkable');   // listing ended → no ts_code → no request
  expect(noCall).not.toHaveBeenCalled();
 });
});

describe('productionSyncDeps',()=>{
 it('assembles both adapters, the cninfo linker and the CN coverage summary over the admin client (round-1 #12)',()=>{
  const saved={url:process.env.NEXT_PUBLIC_SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY};
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='service-role-test-key';   // createClient never connects at construction
  try{
   const deps=productionSyncDeps({deadline:null,codeVersion:'c'.repeat(40)});
   for(const k of ['fetchUs','fetchCn','parseUs','parseCn','linkCn','coverageCn','enrichAcceptance','now'] as const)expect(typeof deps[k],k).toBe('function');
   expect(deps.coverageCn).toBe(coverageSummary);
   const parsed=parseTushareStatements(loadTushareFixtures('600519.SH'),{sinceYear:2014});
   expect(deps.coverageCn!(parsed)).toEqual(coverageSummary(parsed));
   expect(deps.coverageCn!(parsed).find(x=>x.api==='income'&&x.report_type===1)).toBeDefined();
   expect(deps).toMatchObject({deadline:null,codeVersion:'c'.repeat(40)});
  }finally{
   if(saved.url===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=saved.url;
   if(saved.key===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=saved.key;
  }
 });
});


describe('productionSyncDeps step 9b date-mismatch recording (plan 3 Task 14c)',()=>{
 afterEach(()=>{over.facts=null;over.tables=null;over.raw=null;vi.unstubAllGlobals();});

codex
No actionable regressions were identified in the commit. The CN apply gate, tracing additions, cron removal, and expanded tests are consistent with the current pair registry and production wiring. Tests were not executed in the read-only environment.
No actionable regressions were identified in the commit. The CN apply gate, tracing additions, cron removal, and expanded tests are consistent with the current pair registry and production wiring. Tests were not executed in the read-only environment.

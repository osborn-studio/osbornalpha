OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b09c-bf81-7401-90bb-98afbb9f6a1f
--------
user
commit 0094157
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 0094157; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 1636ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-2KCdtLcA' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-X0GO1nqA' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/11-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-XKUZyi10' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-CgkzzJvA' (errno=Operation not permitted)
0094157 feat(dq): candidate adoption, restore and lineage verdict dispatch, pending-hook scan, E8 (F3-4)
 scripts/facts/materialize.ts                       |  15 +-
 src/app/api/admin/dq/quarantine/[id]/route.test.ts |  60 ++++++
 src/app/api/admin/dq/quarantine/[id]/route.ts      |  50 ++++-
 src/lib/dq/dq-extensions.integration.test.ts       |  31 +++
 src/lib/dq/facts-resolver.test.ts                  | 206 +++++++++++++++++-
 src/lib/dq/facts-resolver.ts                       | 239 +++++++++++++++++----
 src/lib/dq/pending-hooks.test.ts                   |  77 +++++++
 src/lib/dq/pending-hooks.ts                        |  66 ++++++
 src/lib/dq/quarantine.test.ts                      |  14 +-
 src/lib/dq/quarantine.ts                           |  11 +-
 10 files changed, 715 insertions(+), 54 deletions(-)

exec
/bin/zsh -lc 'pwd; ls -a | head -30; for p in /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do [ ! -f "$p" ] || cat "$p"; done; git show 0094157 -- src/lib/dq/facts-resolver.ts src/lib/dq/pending-hooks.ts src/lib/dq/quarantine.ts '"'src/app/api/admin/dq/quarantine/[id]/route.ts' scripts/facts/materialize.ts" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
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
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-UGy9GL81' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-r3yHEWVM' (errno=Operation not permitted)
commit 00941572b01acc4877184a9e52d4892bb55ea4c1
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 03:26:51 2026 -0800

    feat(dq): candidate adoption, restore and lineage verdict dispatch, pending-hook scan, E8 (F3-4)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/scripts/facts/materialize.ts b/scripts/facts/materialize.ts
index bd3e910..db33c19 100644
--- a/scripts/facts/materialize.ts
+++ b/scripts/facts/materialize.ts
@@ -2,23 +2,36 @@
  * Rebuild financial_metrics per issuer (spec §8 materialize).
  *
  *   node --env-file=.env.local --import tsx scripts/facts/materialize.ts --market US|CN (--issuer <ticker>... | --all)
+ *   node --env-file=.env.local --import tsx scripts/facts/materialize.ts --pending-hooks
  *
  * --all = every fact_sync_scope row of the market with priority > 0. Each issuer: read_facts
  * envelope → deriveMetrics → replace_financial_metrics under the envelope's state_rev (one retry on
  * stale_computation; truncated reads are refused). Prints one JSON line per issuer. Exit 1 if any
  * issuer failed, 2 on bad arguments.
+ *
+ * --pending-hooks (alone): finish every unfinished materialisation (src/lib/dq/pending-hooks.ts, spec §4.6 U2): one JSON line
+ * per target, then a summary; exit 1 when a target failed or an item has no target.
  */
 import {selectAll,supabaseTableClient} from '../../src/lib/db/table-client';
+import {runPendingHooks} from '../../src/lib/dq/pending-hooks';
 import {resolveIssuer} from '../../src/lib/entities/resolve';
 import {supabaseFactsDb} from '../../src/lib/facts/db';
 import {materialize} from '../../src/lib/facts/derive';
 import type {Market} from '../../src/lib/facts/types';
 import {getAdminSupabase} from '../../src/lib/supabase/admin';
 
-const USAGE='usage: materialize.ts --market US|CN (--issuer <ticker>... | --all)';
+const USAGE='usage: materialize.ts --market US|CN (--issuer <ticker>... | --all) | --pending-hooks';
 
 async function main(){
  const argv=process.argv.slice(2);let market:string|undefined,all=false;const tickers:string[]=[];
+ if(argv.includes('--pending-hooks')){
+  if(argv.length!==1){console.error(USAGE);process.exit(2);}
+  const sb=getAdminSupabase();
+  const r=await runPendingHooks({db:supabaseFactsDb(sb),tables:supabaseTableClient(sb)});
+  for(const t of r.targets)console.log(JSON.stringify(t));
+  console.log(JSON.stringify({items:r.items,targets:r.targets.length,failed:r.failed,untargeted:r.untargeted}));
+  process.exit(r.failed>0||r.untargeted.length>0?1:0);
+ }
  for(let i=0;i<argv.length;i++){
   const x=argv[i],v=argv[i+1];
   if(x==='--market'&&v){market=v;i++;}
diff --git a/src/app/api/admin/dq/quarantine/[id]/route.ts b/src/app/api/admin/dq/quarantine/[id]/route.ts
index ee9ffe2..a909a4c 100644
--- a/src/app/api/admin/dq/quarantine/[id]/route.ts
+++ b/src/app/api/admin/dq/quarantine/[id]/route.ts
@@ -24,16 +24,24 @@ type Outcome = ResolveOutcome | FactsResolveOutcome | 'run_pending';
 // facts.* items (spec §7.3): run_pending and already_resolved are 409 (retry later / nothing to do),
 // hook_retried is a successful re-run of materialize on an already accepted item; a retry whose
 // materialize fails again answers 502 (the verdict is committed, the derived layer is not refreshed).
-const HTTP_STATUS: Record<Outcome, number> = { resolved: 200, hook_retried: 200, not_found: 404, already_resolved: 409, run_pending: 409, invalid_choice: 400 };
+// plan 3 (§4.6): rule_failed / invalid_choice 400; conflict (generation_moved, conflict_exists, duplicate, replay_required, filing_not_found, not_passing, lineage_changed, scope_missing, unresolved, stale_evaluation, target_not_active, use_dedicated_resolver, read_truncated) 409; refusal bodies are {id, outcome, error:<code>, detail?:{restore_note}} (plan 3 接口对齐记录 #9).
+const HTTP_STATUS: Record<Outcome, number> = { resolved: 200, hook_retried: 200, not_found: 404, already_resolved: 409, run_pending: 409, invalid_choice: 400, rule_failed: 400, conflict: 409 };
+const MAX_CANDIDATE_INDEX = 999;
 const AUDITED: readonly Outcome[] = ['resolved', 'hook_retried'];
 
 // The SQL function resolve_facts_quarantine is the final authority; its non-coded errors arrive as
 // FactsDbError('unknown', '<message>').
-function factsOutcome(e: unknown): Outcome | null {
+// Codes of the plan-3 SQL verdict functions that reach the route without passing through the resolver's own refusal mapping
+// (the resolver maps them itself; this is the defence in depth, and the only mapping for batch_mismatch, which the resolver throws).
+const SQL_CONFLICT_CODES: readonly string[] = ['use_dedicated_resolver', 'target_not_active', 'lineage_changed', 'scope_missing', 'conflict_exists', 'replay_required', 'filing_not_found', 'generation_moved', 'duplicate', 'stale_evaluation', 'batch_mismatch', 'not_passing', 'unresolved', 'read_truncated'];
+const SQL_CHOICE_CODES: readonly string[] = ['invalid_choice', 'invalid_candidate'];
+function factsOutcome(e: unknown): { outcome: Outcome; code?: string } | null {
   if (!(e instanceof FactsDbError)) return null;
-  if (e.code === 'run_pending') return 'run_pending';
-  if (e.code === 'invalid_chosen') return 'invalid_choice';
-  if (e.code === 'item_not_open') return 'already_resolved';
+  if (e.code === 'run_pending') return { outcome: 'run_pending' };
+  if (e.code === 'invalid_chosen') return { outcome: 'invalid_choice' };
+  if (e.code === 'item_not_open') return { outcome: 'already_resolved' };
+  if (SQL_CHOICE_CODES.includes(e.code)) return { outcome: 'invalid_choice', code: e.code };
+  if (SQL_CONFLICT_CODES.includes(e.code)) return { outcome: 'conflict', code: e.code };
   return null;
 }
 
@@ -61,6 +69,15 @@ export async function POST(request: Request, { params }: Ctx) {
       return NextResponse.json({ error: 'invalid_chosen_fact_ids' }, { status: 400 });
     }
 
+    const index = (body as { chosen_candidate_index?: unknown } | null)?.chosen_candidate_index;
+    if (index !== undefined && (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index > MAX_CANDIDATE_INDEX)) {
+      return NextResponse.json({ error: 'invalid_chosen_candidate_index' }, { status: 400 });
+    }
+    const keep = (body as { keep_fact_id?: unknown } | null)?.keep_fact_id;
+    if (keep !== undefined && (typeof keep !== 'string' || !UUID_RE.test(keep))) {
+      return NextResponse.json({ error: 'invalid_keep_fact_id' }, { status: 400 });
+    }
+
     const admin = getAdminSupabase();
     const client = supabaseTableClient(admin);
     const [item] = await client.select('dq_quarantine', { id }, { limit: 1 });
@@ -70,6 +87,13 @@ export async function POST(request: Request, { params }: Ctx) {
     if (chosen !== undefined && (status !== 'resolved_accept' || item.reason_code !== 'same_day_conflict')) {
       return NextResponse.json({ error: 'chosen_fact_ids_not_applicable' }, { status: 400 });
     }
+    // chosen_candidate_index adopts a candidate of an ambiguous_value item; keep_fact_id settles a lineage_conflict (plan 3 §4.4, §4.6)
+    if (index !== undefined && (status !== 'resolved_accept' || item.reason_code !== 'ambiguous_value')) {
+      return NextResponse.json({ error: 'chosen_candidate_index_not_applicable' }, { status: 400 });
+    }
+    if (keep !== undefined && (status !== 'resolved_accept' || item.reason_code !== 'lineage_conflict')) {
+      return NextResponse.json({ error: 'keep_fact_id_not_applicable' }, { status: 400 });
+    }
 
     let outcome: Outcome;
     let auditAs: Outcome | null | undefined;
@@ -81,17 +105,27 @@ export async function POST(request: Request, { params }: Ctx) {
       isFacts = true;
       try {
         const r = await resolveFactsItem(supabaseFactsDb(admin), client, item, {
-          status: status as Resolution, chosenFactIds: chosen as string[] | undefined, resolvedBy: user.id,
+          status: status as Resolution, chosenFactIds: chosen as string[] | undefined,
+          chosenCandidateIndex: index as number | undefined, keepFactId: keep as string | undefined, resolvedBy: user.id,
         });
         outcome = r.outcome;
         auditAs = r.auditAs;
         recovered = r.recovered;
         hookFailed = r.hook?.state === 'failed';
-        extra = { hook: r.hook ?? null, promoted: r.promoted ?? null, skipped: r.skipped ?? null, chosen_fact_ids: r.chosenFactIds ?? null };
+        extra = {
+          hook: r.hook ?? null, promoted: r.promoted ?? null, skipped: r.skipped ?? null, chosen_fact_ids: r.chosenFactIds ?? null,
+          ...(r.adoptedFactId !== undefined ? { adopted_fact_id: r.adoptedFactId } : {}),
+          ...(index !== undefined ? { chosen_candidate_index: index } : {}),
+          ...(r.restore !== undefined ? { restore: r.restore } : {}),
+          ...(r.quarantined !== undefined ? { quarantined: r.quarantined } : {}),
+        };
+        // refusals carry only {error:<code>, detail?} (no hook/promoted/... nulls); same body shape as the claims route (接口对齐记录 #9)
+        if (r.outcome === 'rule_failed' || r.outcome === 'invalid_choice' || r.outcome === 'conflict') extra = r.code !== undefined ? { error: r.code, ...(r.restoreNote !== undefined ? { detail: { restore_note: r.restoreNote } } : {}) } : {};
       } catch (e) {
         const mapped = factsOutcome(e);
         if (mapped === null) throw e;
-        outcome = mapped;
+        outcome = mapped.outcome;
+        if (mapped.code !== undefined) extra = { error: mapped.code };
       }
     } else {
       outcome = await resolveQuarantine(client, id, { status: status as Resolution, resolvedBy: user.id });
diff --git a/src/lib/dq/facts-resolver.ts b/src/lib/dq/facts-resolver.ts
index 9932cf6..b197550 100644
--- a/src/lib/dq/facts-resolver.ts
+++ b/src/lib/dq/facts-resolver.ts
@@ -1,54 +1,108 @@
-// Admin hook for facts.* quarantine items (spec §7.3). Accepting is done entirely by the SQL
-// function resolve_facts_quarantine (run_pending check on every member row AND on the item's
-// anchor run payload.run_id — so an item without fact rows is also refused while its run is
-// staged and stays open until that run is published or abandoned (round-1 #10); status flip,
-// verdict in detail.chosen_fact_ids, promotion — one transaction). This module validates the
-// verdict (same_day_conflict: chosen ⊆ payload.fact_ids with one value), calls the function,
-// then runs materialize and records detail.hook = {stage, state, at, message?}; a later POST on
-// a resolved_accept item with hook.state='failed' re-runs materialize only (idempotent).
-// resolved_reject is the generic flip from quarantine.ts; fact rows stay quarantined.
-// The SQL function stays the final authority: invalid_chosen / item_not_open / run_pending
-// surface as FactsDbError (the route maps them to HTTP). For fact-row reasons the function itself
-// commits detail.hook={stage:'materialize',state:'pending'} with the verdict, so an accepted item
-// whose hook is missing / pending / failed is UNFINISHED: a later POST re-runs materialize only
-// (never resolves again). Everything after the function commits is best-effort and never throws:
-// a hook-write failure is reported as hook.state='failed' on a 'resolved' answer. Client-visible
-// hook messages are codes only; full errors go to the server log.
+// src/lib/dq/facts-resolver.ts
+// Admin hook for facts.* quarantine items (plan 2 spec §7.3; plan 3 spec §4.6, §5.6, T10).
+// Accept dispatch (exhaustive; tests mirror this table):
+//  ambiguous_value + chosenCandidateIndex → adopt: the filing comes from the candidate's filingRef
+//   (findFilingBySourceRef, source by market; the payload is not trusted); readFacts of that issuer
+//   at `today` for the candidate's period (every concept, history:true so a later disclosure cannot
+//   hide the filing's own rows; truncated → conflict read_truncated) gives stateRev and the rows of the
+//   candidate's filing at its active generation that the plan-2 §7 statement rules check together
+//   with the candidate (failure → rule_failed, nothing written; plan audit P1); then a batch (producer dq-resolver, dataset = item.dataset) and adoptCandidate under
+//   stateRev (stale_evaluation → re-read and re-evaluate once, then 409); materialize T(issuer).
+//  reconcile_mismatch → restore: inputsHashNow(item) is injected (the hash of the CURRENT inputs,
+//   plan 3 Task 14c); absent → conflict not_passing + restoreNote 'reconcile_wiring_missing', an
+//   {unavailable} answer → that note ('inputs_unavailable' | 'current_evidence_unavailable', plan audit
+//   P2); nothing written, never promotes. restoreReconciled → materialize
+//   the persisted target; promoted 0 → restore_note 'no_rows_promoted' with the skipped reasons.
+//  lineage_conflict + keepFactId → resolveLineageConflict → materialize T (natural key's first
+//   segment); without keepFactId → invalid_choice (keep_fact_id_required): the generic resolver
+//   would promote every member.
+//  reconcile_review → the plan-1 status flip (accept and reject alike): no promotion, no hook.
+//  every other reason → the plan-2 path (resolve_facts_quarantine; ambiguous_value without an index
+//   is an acknowledgement).
+// Reject is the plan-1 flip for every reason; fact rows stay quarantined. The three new visibility
+// verdicts write detail.hook = pending and the target (detail.issuer_id/market) in their SQL
+// transaction; every later hook / audit write patches ONLY its key through patchQuarantineDetail
+// (row lock, plan audit P4), never a read-then-replace of detail; an accepted item whose hook is missing / pending / failed is UNFINISHED and a later
+// POST re-runs materialize only, on the persisted target (materialize re-derives T(i) then).
+// Code → outcome: invalid_choice / invalid_candidate → invalid_choice (400); generation_moved /
+// conflict_exists / duplicate / replay_required / filing_not_found / not_passing / lineage_changed
+// / scope_missing / unresolved / stale_evaluation (after the retry) / read_truncated → conflict (409);
+// item_not_open, batch_mismatch and anything else are thrown (the route: 409 already_resolved /
+// 500). Everything after a verdict commits is best-effort and never throws. Client-visible hook
+// messages are codes only; full errors go to the server log.
 import type {Row,TableClient} from '../db/table-client';
-import {FactsDbError} from '../facts/types';
-import type {FactsDb,Market} from '../facts/types';
-import {decimalEquals} from '../facts/json-numbers';
+import {CONCEPT_IDS,MAPPING_VERSION} from '../facts/concepts';
 import {materialize} from '../facts/derive';
-import {resolveQuarantine} from './quarantine';
+import {decimalEquals} from '../facts/json-numbers';
+import {evaluateFactRules} from '../facts/rules';
+import {FactsDbError} from '../facts/types';
+import type {FactCandidate,FactInsert,FactRow,FactsDb,FilingRow,Market} from '../facts/types';
+import {emptyCounts,finishBatch,startBatch} from './batches';
+import {DATASETS} from './datasets';
+import {patchQuarantineDetail,resolveQuarantine} from './quarantine';
 import type {QuarantineStatus} from './quarantine';
 
 export interface HookState{stage:'materialize'|'done';state:'done'|'failed';at:string;message?:string}
-export type FactsResolveOutcome='resolved'|'not_found'|'already_resolved'|'hook_retried'|'invalid_choice';
+export type FactsResolveOutcome='resolved'|'not_found'|'already_resolved'|'hook_retried'|'invalid_choice'|'rule_failed'|'conflict';
 export interface FactsResolveResult{outcome:FactsResolveOutcome;hook?:HookState;promoted?:number;skipped?:number;chosenFactIds?:string[];
+ /** machine code of a refusal (rule id, SQL code) */
+ code?:string;
+ /** why a reconcile_mismatch restore was refused before reaching SQL (route: detail.restore_note) */
+ restoreNote?:'reconcile_wiring_missing'|InputsUnavailable['unavailable'];
+ adoptedFactId?:string;
+ restore?:{promoted:number;skipped:{fact_id:string;reason:string}[];restore_note?:'no_rows_promoted'};
+ quarantined?:number;
  /** What the route should audit: undefined = the outcome itself; null = nothing (retry of an already audited item). */
  auditAs?:'resolved'|'hook_retried'|null;
  /** Set when auditAs='resolved' on a retry: the audit row describes the PERSISTED resolution (original resolver, accept, committed ids); the retrying admin is recorded separately. */
  recovered?:{resolvedBy:string;status:'resolved_accept';chosenFactIds:string[];recoveredBy:string;recoveredAt:string}}
-export interface ResolveFactsInput{status:Exclude<QuarantineStatus,'open'>;chosenFactIds?:string[];resolvedBy:string;now?:()=>Date}
-/** Reason codes whose items reference fact rows; the other three (ambiguous_value, odd_duration, missing_available_date) have none. */
+/** Why the current inputs of a reconcile_mismatch item cannot be hashed now (restore stays refused). */
+export interface InputsUnavailable{unavailable:'inputs_unavailable'|'current_evidence_unavailable'}
+/** Hash of the CURRENT reconciliation inputs of a reconcile_mismatch item (computeInputsHash over left raw_hash, the pair's CURRENT right evidence sha256, gold/sample sha256, parser version), or why it cannot be computed now. */
+export type InputsHashNow=(item:Row)=>Promise<string|InputsUnavailable>;
+export interface ResolveFactsInput{status:Exclude<QuarantineStatus,'open'>;chosenFactIds?:string[];chosenCandidateIndex?:number;keepFactId?:string;resolvedBy:string;now?:()=>Date;
+ /** the evaluation date of an adoption (default: now's UTC date) */
+ today?:string;
+ inputsHashNow?:InputsHashNow}
+/** Reason codes whose plan-2 items reference fact rows; the other three (ambiguous_value, odd_duration, missing_available_date) have none. */
 export const FACT_ROW_REASONS:readonly string[]=['same_day_conflict','identity_bs','identity_gp'];
+/** Reasons with a plan-3 visibility verdict (adopt / restore / lineage). */
+export const VERDICT_REASONS:readonly string[]=['ambiguous_value','reconcile_mismatch','lineage_conflict'];
 const TABLE='dq_quarantine';
 const MARKETS:readonly string[]=['US','CN'];
+const CHOICE_CODES:readonly string[]=['invalid_choice','invalid_candidate'];
+const CONFLICT_CODES:readonly string[]=['generation_moved','conflict_exists','duplicate','replay_required','filing_not_found','not_passing','lineage_changed','scope_missing','unresolved','stale_evaluation','read_truncated','target_not_active','use_dedicated_resolver'];
+const PROBE_ID='00000000-0000-4000-8000-000000000000';
 
-interface Payload{key?:Record<string,string|null>;fact_ids?:string[]}
+interface Payload{key?:Record<string,string|null>;fact_ids?:string[];candidates?:unknown}
 const payloadOf=(item:Row):Payload=>(item.payload??{}) as Payload;
 const detailOf=(item:Row):Record<string,unknown>=>(item.detail??{}) as Record<string,unknown>;
 const hookOf=(item:Row):HookState|undefined=>detailOf(item).hook as HookState|undefined;
-const target=(item:Row):{issuer:string;market:Market}|null=>{
+const marketOfDataset=(d:unknown):Market|null=>d===DATASETS.facts('US')?'US':d===DATASETS.facts('CN')?'CN':null;
+class RuleFailed extends Error{constructor(public rule:string){super(rule);this.name='RuleFailed';}}
+
+/** Where an item materialises: the persisted detail.issuer_id/market (plan-3 verdicts and reconciliation items), else payload.key (plan-2 items). */
+export function hookTarget(item:Row):{issuer:string;market:Market}|null{
+ const d=detailOf(item);
+ if(typeof d.issuer_id==='string'&&typeof d.market==='string'&&MARKETS.includes(d.market))return {issuer:d.issuer_id,market:d.market as Market};
  const key=payloadOf(item).key;const issuer=key?.issuer_id;const market=key?.market;
  return typeof issuer==='string'&&typeof market==='string'&&MARKETS.includes(market)?{issuer,market:market as Market}:null;
-};
+}
+/** An accepted item whose materialisation is not done: plan-2 fact-row reasons, or a plan-3 verdict that actually changed visibility. */
+function unfinished(item:Row):boolean{
+ if(item.status!=='resolved_accept'||hookOf(item)?.state==='done')return false;
+ const reason=String(item.reason_code);const d=detailOf(item);
+ if(FACT_ROW_REASONS.includes(reason))return true;
+ if(reason==='ambiguous_value')return typeof d.adopted_fact_id==='string';
+ if(reason==='reconcile_mismatch')return typeof d.restored_by_batch==='string';
+ if(reason==='lineage_conflict')return Array.isArray(d.chosen_fact_ids);
+ return false;
+}
 
-/** Re-reads the item (the SQL function may have written detail.chosen_fact_ids) and merges `hook` into detail. Never throws. */
-async function writeHook(tables:TableClient,id:string,hook:HookState):Promise<HookState>{
+/** Sets detail.hook alone through patchQuarantineDetail (row lock; plan audit P4): a concurrent verdict or result written meanwhile is kept. Never throws. */
+export async function writeHook(tables:TableClient,id:string,hook:HookState):Promise<HookState>{
  try{
-  const [fresh]=await tables.select(TABLE,{id},{limit:1});
-  await tables.update(TABLE,{id},{detail:{...detailOf(fresh??{}),hook}});
+  await patchQuarantineDetail(tables,id,'hook',hook);
   return hook;
  }catch(e){
   console.error('[admin/dq] hook write',e instanceof Error?e.message:String(e));
@@ -69,27 +123,127 @@ async function runHook(db:FactsDb,tables:TableClient,id:string,where:{issuer:str
  return writeHook(tables,id,hook);
 }
 
-/** Marks that the audit row of this resolution was written (best-effort; a missing mark only causes one extra audit row on retry). */
+/** Marks that the audit row of this resolution was written: detail.audit_written alone, through patchQuarantineDetail (plan audit P4). Best-effort; a missing mark only causes one extra audit row on retry. */
 export async function markAudited(tables:TableClient,id:string):Promise<void>{
+ try{await patchQuarantineDetail(tables,id,'audit_written',true);}
+ catch(e){console.error('[admin/dq] audit mark',e instanceof Error?e.message:String(e));}
+}
+
+/** A verdict under its own dq-resolver batch; the batch is finished whatever happens (best-effort after success). */
+async function withBatch<T>(tables:TableClient,dataset:string,body:(batchId:string)=>Promise<T>):Promise<T>{
+ const {batchId}=await startBatch(tables,{producer:'dq-resolver',dataset,triggeredBy:'manual'});
+ const counts=emptyCounts();counts.fetched=1;
+ let out:T;
+ try{out=await body(batchId);}
+ catch(e){
+  counts.failed=1;
+  await finishBatch(tables,batchId,{counts,errors:[{code:e instanceof FactsDbError?e.code:e instanceof RuleFailed?'rule_failed':'unknown'}]}).catch(err=>console.error('[admin/dq] batch finish',err instanceof Error?err.message:String(err)));
+  throw e;
+ }
+ counts.inserted=1;
+ await finishBatch(tables,batchId,{counts,errors:[]}).catch(err=>console.error('[admin/dq] batch finish',err instanceof Error?err.message:String(err)));
+ return out;
+}
+function mapRefusal(e:unknown):FactsResolveResult|null{
+ if(e instanceof RuleFailed)return {outcome:'rule_failed',code:e.rule};
+ if(!(e instanceof FactsDbError))return null;
+ if(CHOICE_CODES.includes(e.code))return {outcome:'invalid_choice',code:e.code};
+ if(CONFLICT_CODES.includes(e.code))return {outcome:'conflict',code:e.code};
+ return null;
+}
+/** Shape check of a persisted FactCandidate before any read; the SQL function stays the final authority. */
+function candidateOf(x:unknown):FactCandidate|null{
+ if(!x||typeof x!=='object'||Array.isArray(x))return null;
+ const c=x as Record<string,unknown>;
+ const s=(k:string)=>typeof c[k]==='string'&&(c[k] as string).length>0;
+ if(!s('concept')||!s('sourceConcept')||!s('unit')||!s('filingRef')||!s('rawHash')||!s('periodEnd')||!s('value'))return null;
+ if(!['IS','BS','CF','DEI'].includes(String(c.statement))||!['3M','6M','9M','12M','INSTANT'].includes(String(c.duration)))return null;
+ if(!(c.periodStart===null||s('periodStart'))||(c.periodStart===null)!==(c.duration==='INSTANT'))return null;
+ return c as unknown as FactCandidate;
+}
+/**
+ * plan-2 §7 statement rules on {candidate} ∪ EVERY ok row of the candidate's filing at the filing's
+ * active generation (the read carries history, so rows a later disclosure superseded still count —
+ * they are the filing's own balancing inputs; plan audit P1); the failing rule id, else null.
+ */
+function ruleFailure(c:FactCandidate,filing:FilingRow,rows:FactRow[]):string|null{
+ const row:FactInsert={fact_id:PROBE_ID,issuer_id:filing.issuer_id,market:filing.market,filing_id:filing.filing_id,concept:c.concept,source_concept:c.sourceConcept,statement:c.statement,period_start:c.periodStart,period_end:c.periodEnd,
+  duration:c.duration,value:c.value,unit:c.unit,consolidation:'consolidated',available_date:filing.available_date,mapping_gen:filing.mapping_gen,mapping_version:MAPPING_VERSION,raw_hash:c.rawHash};
+ const own=rows.filter(r=>r.filing_id===filing.filing_id&&r.mapping_gen===filing.mapping_gen&&r.status==='ok');
+ const res=evaluateFactRules({newRows:[row],okRows:own,sourceRefOf:new Map([[filing.filing_id,filing.source_ref]]),issuerId:filing.issuer_id,market:filing.market,mappingGen:filing.mapping_gen});
+ return res.quarantine.find(q=>q.factIds.includes(PROBE_ID))?.reason??null;
+}
+
+async function adopt(db:FactsDb,tables:TableClient,item:Row,input:ResolveFactsInput,now:()=>Date):Promise<FactsResolveResult>{
+ const id=String(item.id);const index=input.chosenCandidateIndex!;const market=marketOfDataset(item.dataset);
+ const cands=payloadOf(item).candidates;
+ if(market===null||!Array.isArray(cands)||!Number.isInteger(index)||index<0||index>=cands.length)return {outcome:'invalid_choice',code:'invalid_choice'};
+ const cand=candidateOf(cands[index]);if(!cand)return {outcome:'invalid_choice',code:'invalid_candidate'};
+ const filing=await db.findFilingBySourceRef(market==='US'?'edgar':'tushare',cand.filingRef);
+ if(!filing||filing.market!==market)return {outcome:'conflict',code:'filing_not_found'};
+ const today=input.today??now().toISOString().slice(0,10);
+ const evaluate=async()=>{
+  // history:true — a later disclosure must not hide the candidate filing's own rows; a truncated read could (plan audit P1)
+  const read=await db.readFacts(filing.issuer_id,filing.market,{concepts:[...CONCEPT_IDS],asOf:today,from:cand.periodEnd,to:cand.periodEnd,history:true});
+  if(read.truncated)throw new FactsDbError('read_truncated');
+  return {stateRev:read.stateRev,failure:ruleFailure(cand,filing,read.rows)};
+ };
+ let ev:Awaited<ReturnType<typeof evaluate>>;
+ try{ev=await evaluate();}catch(e){const m=mapRefusal(e);if(m)return m;throw e;}
+ if(ev.failure!==null)return {outcome:'rule_failed',code:ev.failure};
+ let out:Awaited<ReturnType<FactsDb['adoptCandidate']>>;
  try{
-  const [fresh]=await tables.select(TABLE,{id},{limit:1});
-  await tables.update(TABLE,{id},{detail:{...detailOf(fresh??{}),audit_written:true}});
- }catch(e){console.error('[admin/dq] audit mark',e instanceof Error?e.message:String(e));}
+  out=await withBatch(tables,String(item.dataset),async batchId=>{
+   try{return await db.adoptCandidate(id,index,batchId,ev.stateRev,input.resolvedBy);}
+   catch(e){
+    if(!(e instanceof FactsDbError)||e.code!=='stale_evaluation')throw e;
+    ev=await evaluate();                                                     // one re-read and re-evaluation
+    if(ev.failure!==null)throw new RuleFailed(ev.failure);
+    return db.adoptCandidate(id,index,batchId,ev.stateRev,input.resolvedBy);
+   }
+  });
+ }catch(e){const m=mapRefusal(e);if(m)return m;throw e;}
+ // committed: nothing below may throw
+ const hook=await runHook(db,tables,id,{issuer:out.issuerId,market:out.market},now);
+ return {outcome:'resolved',hook,adoptedFactId:out.factId,chosenFactIds:[out.factId]};
+}
+
+async function restore(db:FactsDb,tables:TableClient,item:Row,input:ResolveFactsInput,now:()=>Date):Promise<FactsResolveResult>{
+ if(!input.inputsHashNow)return {outcome:'conflict',code:'not_passing',restoreNote:'reconcile_wiring_missing'};
+ const id=String(item.id);const hash=await input.inputsHashNow(item);
+ if(typeof hash!=='string')return {outcome:'conflict',code:'not_passing',restoreNote:hash.unavailable};
+ let r:Awaited<ReturnType<FactsDb['restoreReconciled']>>;
+ try{r=await withBatch(tables,String(item.dataset),batchId=>db.restoreReconciled(id,batchId,hash,input.resolvedBy));}
+ catch(e){const m=mapRefusal(e);if(m)return m;throw e;}
+ const hook=await runHook(db,tables,id,hookTarget(item),now);
+ return {outcome:'resolved',hook,promoted:r.promoted,restore:{promoted:r.promoted,skipped:r.skipped,...(r.promoted===0?{restore_note:'no_rows_promoted' as const}:{})}};
+}
+
+async function lineageVerdict(db:FactsDb,tables:TableClient,item:Row,input:ResolveFactsInput,now:()=>Date):Promise<FactsResolveResult>{
+ if(input.keepFactId===undefined)return {outcome:'invalid_choice',code:'keep_fact_id_required'};
+ const id=String(item.id);const keep=input.keepFactId;const market=marketOfDataset(item.dataset);
+ let r:{quarantined:number};
+ try{r=await withBatch(tables,String(item.dataset),batchId=>db.resolveLineageConflict(id,keep,batchId,input.resolvedBy));}
+ catch(e){const m=mapRefusal(e);if(m)return m;throw e;}
+ const target=String(item.natural_key).split(':')[0];
+ const hook=await runHook(db,tables,id,market?{issuer:target,market}:null,now);
+ return {outcome:'resolved',hook,quarantined:r.quarantined,chosenFactIds:[keep]};
 }
 
 /**
- * Resolves one facts.* item. Throws FactsDbError('run_pending') straight from the FactsDb when any
- * member row's run is still staged (the route answers 409 and the item stays open).
+ * Resolves one facts.* item (dispatch in the header). Throws FactsDbError('run_pending') straight
+ * from the FactsDb when any member row's run is still staged (the route answers 409 and the item
+ * stays open), and item_not_open / batch_mismatch / unknown errors likewise.
  */
 export async function resolveFactsItem(db:FactsDb,tables:TableClient,item:Row,input:ResolveFactsInput):Promise<FactsResolveResult>{
- const now=input.now??(()=>new Date());const id=String(item.id);const where=target(item);
+ const now=input.now??(()=>new Date());const id=String(item.id);const where=hookTarget(item);
  if(item.status!=='open'){
   const hook=hookOf(item);
-  if(input.status==='resolved_accept'&&item.status==='resolved_accept'&&FACT_ROW_REASONS.includes(String(item.reason_code))&&hook?.state!=='done'&&where!==null){
+  if(input.status==='resolved_accept'&&unfinished(item)&&where!==null){
    const audited=detailOf(item).audit_written===true;
    const ran=await runHook(db,tables,id,where,now);
    const persisted=detailOf(item).chosen_fact_ids;
-   const chosenFactIds=Array.isArray(persisted)?persisted.map(String):[];
+   const chosenFactIds=Array.isArray(persisted)?persisted.map(String):typeof detailOf(item).adopted_fact_id==='string'?[String(detailOf(item).adopted_fact_id)]:[];
    const base:FactsResolveResult={outcome:'hook_retried',hook:ran,chosenFactIds,auditAs:audited?(ran.state==='done'?'hook_retried':null):'resolved'};
    if(audited)return base;
    return {...base,recovered:{resolvedBy:String(item.resolved_by),status:'resolved_accept',chosenFactIds,recoveredBy:input.resolvedBy,recoveredAt:now().toISOString()}};
@@ -97,7 +251,12 @@ export async function resolveFactsItem(db:FactsDb,tables:TableClient,item:Row,in
   return hook===undefined?{outcome:'already_resolved'}:{outcome:'already_resolved',hook};
  }
  if(input.status==='resolved_reject')return {outcome:await resolveQuarantine(tables,id,{status:'resolved_reject',resolvedBy:input.resolvedBy})};
- const reason=String(item.reason_code);const members=payloadOf(item).fact_ids??[];
+ const reason=String(item.reason_code);
+ if(reason==='reconcile_review')return {outcome:await resolveQuarantine(tables,id,{status:'resolved_accept',resolvedBy:input.resolvedBy})};
+ if(reason==='ambiguous_value'&&input.chosenCandidateIndex!==undefined)return adopt(db,tables,item,input,now);
+ if(reason==='reconcile_mismatch')return restore(db,tables,item,input,now);
+ if(reason==='lineage_conflict')return lineageVerdict(db,tables,item,input,now);
+ const members=payloadOf(item).fact_ids??[];
  let chosen:string[]=[];
  if(reason==='same_day_conflict'){
   chosen=[...new Set(input.chosenFactIds??[])];
diff --git a/src/lib/dq/pending-hooks.ts b/src/lib/dq/pending-hooks.ts
new file mode 100644
index 0000000..eb0fef9
--- /dev/null
+++ b/src/lib/dq/pending-hooks.ts
@@ -0,0 +1,66 @@
+// src/lib/dq/pending-hooks.ts
+// Unfinished materialisations (plan 3 spec §4.6, U2): (a) RESOLVED facts.* items whose hook is
+// pending or failed, plus accepted plan-3 visibility verdicts (adoption, restore, lineage) with no
+// hook at all; (b) OPEN reconcile_mismatch items whose hook is pending or failed (a reconciliation
+// quarantine stays open until a human decides). The target is the item's persisted issuer/market
+// (hookTarget); the CURRENT topology maps it to T(i), so a merge after the verdict still lands on
+// the right target; one materialize per (T, market), then every item's hook is written done /
+// failed. Items without a usable target are reported (untargeted), never guessed. Read-complete
+// (selectAll pages to exhaustion); never throws per target.
+import {selectAll} from '../db/table-client';
+import type {Row,TableClient} from '../db/table-client';
+import {materialize as realMaterialize} from '../facts/derive';
+import {FactsDbError} from '../facts/types';
+import type {FactsDb,Market} from '../facts/types';
+import {FACT_ROW_REASONS,VERDICT_REASONS,hookTarget,writeHook} from './facts-resolver';
+import type {HookState} from './facts-resolver';
+
+export interface PendingHookItem{id:string;reason:string;status:string;issuer:string;market:Market}
+export interface PendingHookReport{items:number;targets:{target:string;market:Market;state:'done'|'failed';message?:string;items:string[]}[];failed:number;untargeted:string[]}
+export interface PendingHookDeps{db:FactsDb;tables:TableClient;now?:()=>Date;materialize?:typeof realMaterialize}
+
+const hookState=(r:Row)=>((r.detail??{}) as {hook?:{state?:unknown}}).hook?.state;
+const hasHook=(r:Row)=>((r.detail??{}) as {hook?:unknown}).hook!==undefined;
+const isVerdict=(r:Row)=>{
+ const d=(r.detail??{}) as Record<string,unknown>;const reason=String(r.reason_code);
+ return reason==='ambiguous_value'?typeof d.adopted_fact_id==='string':reason==='reconcile_mismatch'?typeof d.restored_by_batch==='string':reason==='lineage_conflict'?Array.isArray(d.chosen_fact_ids):false;
+};
+
+export async function findPendingHooks(tables:TableClient):Promise<{items:PendingHookItem[];untargeted:string[]}>{
+ const items:PendingHookItem[]=[];const untargeted:string[]=[];
+ const take=(r:Row)=>{const t=hookTarget(r);if(!t){untargeted.push(String(r.id));return;}items.push({id:String(r.id),reason:String(r.reason_code),status:String(r.status),issuer:t.issuer,market:t.market});};
+ for(const reason of [...FACT_ROW_REASONS,...VERDICT_REASONS])for(const status of ['resolved_accept','resolved_reject']){
+  for(const r of await selectAll(tables,'dq_quarantine',{table_name:'financial_facts',reason_code:reason,status},'id')){
+   const st=hookState(r);
+   if(st==='pending'||st==='failed'||(!hasHook(r)&&status==='resolved_accept'&&isVerdict(r)))take(r);
+  }
+ }
+ for(const r of await selectAll(tables,'dq_quarantine',{table_name:'financial_facts',reason_code:'reconcile_mismatch',status:'open'},'id')){
+  const st=hookState(r);if(st==='pending'||st==='failed')take(r);
+ }
+ return {items,untargeted};
+}
+
+export async function runPendingHooks(deps:PendingHookDeps):Promise<PendingHookReport>{
+ const now=deps.now??(()=>new Date());const run=deps.materialize??realMaterialize;
+ const {items,untargeted}=await findPendingHooks(deps.tables);
+ const groups=new Map<string,{target:string;market:Market;items:PendingHookItem[]}>();
+ for(const it of items){
+  const target=await deps.db.targetOf(it.issuer);
+  const k=`${target}|${it.market}`;const g=groups.get(k)??{target,market:it.market,items:[]};g.items.push(it);groups.set(k,g);
+ }
+ const report:PendingHookReport={items:items.length,targets:[],failed:0,untargeted};
+ const ordered=[...groups.values()].sort((a,b)=>a.target<b.target?-1:a.target>b.target?1:a.market<b.market?-1:a.market>b.market?1:0);
+ for(const g of ordered){
+  let hook:HookState;
+  try{await run(deps.db,g.target,g.market);hook={stage:'done',state:'done',at:now().toISOString()};}
+  catch(e){
+   console.error('[pending-hooks] materialize',e instanceof Error?e.message:String(e));
+   hook={stage:'materialize',state:'failed',at:now().toISOString(),message:e instanceof FactsDbError?e.code:'materialize_failed'};
+  }
+  for(const it of g.items)await writeHook(deps.tables,it.id,hook);
+  if(hook.state==='failed')report.failed++;
+  report.targets.push({target:g.target,market:g.market,state:hook.state,...(hook.message!==undefined?{message:hook.message}:{}),items:g.items.map(i=>i.id)});
+ }
+ return report;
+}
diff --git a/src/lib/dq/quarantine.ts b/src/lib/dq/quarantine.ts
index af701e9..11dbef7 100644
--- a/src/lib/dq/quarantine.ts
+++ b/src/lib/dq/quarantine.ts
@@ -7,7 +7,7 @@
 // written so the DB invariants hold: (status='open') = (resolved_at is null), and
 // status='open' or resolved_by is not null.
 import {randomUUID} from 'node:crypto';
-import {TableError} from '../db/table-client';
+import {TableError,callRpc} from '../db/table-client';
 import type {Row,TableClient} from '../db/table-client';
 
 export type QuarantineStatus='open'|'resolved_accept'|'resolved_reject';
@@ -71,3 +71,12 @@ export async function listOpenQuarantine(client:TableClient,dataset?:string,limi
  const match:Row=dataset===undefined?{status:'open'}:{status:'open',dataset};
  return client.select(TABLE,match,{orderBy:'created_at',desc:true,limit});
 }
+/**
+ * Sets ONE key of an item's detail — 'hook' or 'audit_written' — through the row-locking SQL function
+ * patch_quarantine_detail (migration 20261107090000; plan audit round 1, P4). Every other detail key
+ * (latest_result, chosen ids, …) and the resolution columns stay as the latest committed writer left
+ * them. false = no such item. Needs client.rpc (callRpc: rpc_unavailable otherwise).
+ */
+export async function patchQuarantineDetail(client:TableClient,id:string,key:'hook'|'audit_written',value:unknown):Promise<boolean>{
+ return (await callRpc(client,'patch_quarantine_detail',{p_id:id,p_key:key,p_value:value}))===true;
+}

exec
/bin/zsh -lc "cat src/lib/dq/pending-hooks.test.ts; cat src/lib/facts/rules.ts; rg -n 'restore_reconciled|adopt_candidate|resolve_lineage_conflict|patch_quarantine_detail' supabase/migrations; cat src/lib/dq/facts-resolver.ts" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
// src/lib/dq/pending-hooks.test.ts
import {describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {memoryFactsDb} from '../facts/memory-facts-db';
import {factInsert,filingInsert} from '../facts/db-contract';
import {quarantine} from './quarantine';
import {findPendingHooks,runPendingHooks} from './pending-hooks';

const ISSUER='00000000-0000-4000-8000-000000000001',SRC='00000000-0000-4000-8000-000000000002',T='00000000-0000-4000-8000-000000000003';
const ADMIN='9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',BATCH='55555555-0000-4000-8000-000000000001';
const NOW=()=>new Date('2026-11-05T09:00:00.000Z');

async function seed(db:ReturnType<typeof memoryFactsDb>){
 const t=db.tables;
 const add=async(reason:string,o:{status?:string;detail?:Record<string,unknown>;payload?:Record<string,unknown>;naturalKey?:string}={})=>{
  const id=await quarantine(t,{dataset:'facts.us',table:'financial_facts',naturalKey:o.naturalKey??`k:${reason}:${randomUUID()}`,reasonCode:reason,batchId:BATCH,payload:o.payload??{fact_ids:[]},detail:o.detail});
  if(o.status&&o.status!=='open')await t.update('dq_quarantine',{id},{status:o.status,resolved_by:ADMIN,resolved_at:'2026-11-05T08:00:00.000Z'});
  return id;
 };
 const key={issuer_id:ISSUER,market:'US'};
 return {
  sameDayFailed:await add('same_day_conflict',{status:'resolved_accept',payload:{key,fact_ids:[]},detail:{hook:{stage:'materialize',state:'failed'}}}),
  adoptedNoHook:await add('ambiguous_value',{status:'resolved_accept',detail:{adopted_fact_id:'f',issuer_id:SRC,market:'US'}}),
  restoredPending:await add('reconcile_mismatch',{status:'resolved_accept',detail:{restored_by_batch:'b',issuer_id:ISSUER,market:'US',hook:{stage:'materialize',state:'pending'}}}),
  lineagePending:await add('lineage_conflict',{status:'resolved_accept',detail:{chosen_fact_ids:['k'],issuer_id:T,market:'US',hook:{stage:'materialize',state:'pending'}}}),
  openMismatch:await add('reconcile_mismatch',{detail:{issuer_id:ISSUER,market:'US',hook:{stage:'materialize',state:'pending'}}}),
  rejectedPendingMismatch:await add('reconcile_mismatch',{status:'resolved_reject',detail:{issuer_id:ISSUER,market:'US',hook:{stage:'materialize',state:'pending'}}}),
  untargeted:await add('identity_bs',{status:'resolved_accept',payload:{key:{},fact_ids:[]},detail:{hook:{stage:'materialize',state:'pending'}}}),
  // excluded
  done:await add('identity_gp',{status:'resolved_accept',payload:{key,fact_ids:[]},detail:{hook:{stage:'done',state:'done'}}}),
  ack:await add('ambiguous_value',{status:'resolved_accept',detail:{hook:{stage:'done',state:'done'}}}),
  openSameDay:await add('same_day_conflict',{payload:{key,fact_ids:[]},detail:{hook:{stage:'materialize',state:'pending'}}}),
  rejectNoHook:await add('lineage_conflict',{status:'resolved_reject'}),
  openMismatchDone:await add('reconcile_mismatch',{detail:{issuer_id:ISSUER,market:'US',hook:{stage:'done',state:'done'}}}),
 };
}

describe('findPendingHooks / runPendingHooks (spec §4.6, U2)',()=>{
 it('selects (a) resolved items with a pending/failed hook and accepted verdicts without one, (b) open reconcile_mismatch items with a pending/failed hook',async()=>{
  const db=memoryFactsDb();const ids=await seed(db);
  const {items,untargeted}=await findPendingHooks(db.tables);
  expect(items.map(i=>i.id).sort()).toEqual([ids.sameDayFailed,ids.adoptedNoHook,ids.restoredPending,ids.lineagePending,ids.openMismatch,ids.rejectedPendingMismatch].sort());
  expect(untargeted).toEqual([ids.untargeted]);
  expect(items.find(i=>i.id===ids.adoptedNoHook)).toMatchObject({issuer:SRC,market:'US',reason:'ambiguous_value'});
 });
 it('materialises each target T once (merged sources fold into their target) and writes done / failed on every item',async()=>{
  const db=memoryFactsDb();const ids=await seed(db);
  db.setTopology({[SRC]:{status:'merged',merged_into:ISSUER}});
  const mat=vi.fn(async(_db:unknown,issuer:string)=>{if(issuer===T)throw new Error('boom');return {rows:0,stateRev:0,retried:false,target:issuer,basedOn:[]};});
  const report=await runPendingHooks({db,tables:db.tables,now:NOW,materialize:mat as never});
  expect(mat.mock.calls.map(c=>c[1]).sort()).toEqual([ISSUER,T].sort());
  expect(report).toMatchObject({items:6,failed:1,untargeted:[ids.untargeted]});
  expect(report.targets.find(t=>t.target===ISSUER)!.items.sort()).toEqual([ids.sameDayFailed,ids.adoptedNoHook,ids.restoredPending,ids.openMismatch,ids.rejectedPendingMismatch].sort());
  const hook=async(id:string)=>((await db.tables.select('dq_quarantine',{id}))[0].detail as {hook:unknown}).hook;
  expect(await hook(ids.openMismatch)).toEqual({stage:'done',state:'done',at:'2026-11-05T09:00:00.000Z'});
  expect(await hook(ids.lineagePending)).toMatchObject({stage:'materialize',state:'failed',message:'materialize_failed'});
  expect((await db.tables.select('dq_quarantine',{id:ids.openMismatch}))[0].status).toBe('open');   // the reconciliation item stays open for a human
  expect((await findPendingHooks(db.tables)).items.map(i=>i.id)).toEqual([ids.lineagePending]);      // only the failed one is left
 });
 it('a crash right after applyReconcileResult (item open, hook pending) is completed by the scan with the real materialize',async()=>{
  const db=memoryFactsDb();const iss=randomUUID();const b=randomUUID();
  await db.tables.insert('ingest_batches',{batch_id:b,producer:'reconcile',dataset:'reconcile.us.companyfacts_vs_ixbrl',status:'running'});
  await db.reconcileScope('US',[{issuer_id:iss,reasons:['t'],priority:1,fetch_key:'k'}]);await db.claimLease(iss,'US',b,600);
  const run=await db.beginRun(iss,'US',b,1);const f=filingInsert(iss);await db.stageFilings(run,[f]);const x=factInsert(iss,f);await db.stageFacts(run,[x]);await db.publishRun(run,[f.filing_id]);
  const pair='us.companyfacts_vs_ixbrl' as const;
  await db.tables.insert('dq_reconcile_cycles',{pair,cycle_id:'c1',status:'running',started_at:NOW().toISOString(),members:[{issuer_id:iss,market:'US',expected_keys:[{naturalKey:'k1',locator:{}}]}],expected_total:1,detail:{}});
  await db.tables.insert('dq_reconcile_cursor',{pair,cycle_id:'c1',issuer_id:iss,market:'US',expected:1,state:'pending',claimed_by:null,claim_until:null,attempts:0,last_error:null,done_at:null,compared_passed:null,compared_failed:null,not_compared:null});
  const fence=(await db.claimReconcileMember(pair,'c1',iss,'US',b))!;
  const a=await db.applyReconcileResult(fence,{natural_key:'k1',kind:'numeric',outcome:'compared',passed:false,left_value:'100',right_value:'99',abs_diff:'1',rel_diff:'0.01',tolerance:'0',left_source:'l',right_source:'r',detail:{},action:'quarantine_left',left_fact_id:x.fact_id,inputs_hash:'h'});
  // … the runner dies here, before materialize
  const report=await runPendingHooks({db,tables:db.tables,now:NOW});
  expect(report).toMatchObject({items:1,failed:0});
  const [item]=await db.tables.select('dq_quarantine',{id:a.itemId!});
  expect(item.status).toBe('open');expect((item.detail as {hook:unknown}).hook).toEqual({stage:'done',state:'done',at:'2026-11-05T09:00:00.000Z'});
  expect((await db.factsByIds([x.fact_id]))[0].status).toBe('quarantined');
 });
});
// src/lib/facts/rules.ts
// Statement rules on a sync run (spec §7.1 identity_bs / identity_gp, §7.2 warnings). Groups are
// the (filing, period_start, period_end, unit) cells that contain at least one new row; inputs are
// the new rows plus the current-generation ok rows of that same cell, so an identity is always
// checked inside one report version. Only new rows are quarantined. Rule ids and tolerances are
// the spec's. Unlike the generic doubles in src/lib/dq/rules.ts, the math here is exact: fact
// values are canonical decimal strings of up to 512 characters, so they are compared as scaled
// BigInts (no 15-digit rounding, no Infinity on 1e300-sized values). Tolerances are exact rationals.
import type {RuleResult} from '../dq/rules';
import type {BatchError} from '../dq/batches';
import type {FactInsert,FactRow,Market} from './types';
import {identityKey} from './keys';
import {daysBetween} from './classify';
import {canonicalDecimal} from './json-numbers';

export type AnyFactRow=FactInsert|FactRow;
export interface FactRulesInput{newRows:FactInsert[];okRows:FactRow[];sourceRefOf:Map<string,string>;issuerId:string;market:Market;mappingGen:number}
export interface RuleQuarantine{reason:'identity_bs'|'identity_gp';naturalKey:string;key:Record<string,string|null>;factIds:string[];rule:string;detail:Record<string,unknown>}
export interface FactRulesResult{quarantine:RuleQuarantine[];warnings:Map<string,string[]>}
/** Documentation-only double forms; the checks use the exact rational IDENTITY_TOL_RATIO (5/1000) and the integer REVENUE_MAX_JUMP, never these doubles for arithmetic on values. */
export const IDENTITY_TOLERANCE=0.005;
export const GROSS_MARGIN_RANGE:[number,number]=[-1,1];
export const REVENUE_MAX_JUMP=10;
export const WARNING_RULES=['gross_margin_range','revenue_jump'] as const;
export const MAX_WARNING_KEYS=20;
const IDENTITY_TOL_RATIO:[bigint,bigint]=[5n,1000n];

/** Exact decimal: value = n / 10^s. */
interface Dec{n:bigint;s:number}
function dec(v:string):Dec|null{
 let c:string;
 try{c=canonicalDecimal(v);}catch{return null;}
 const neg=c.startsWith('-');const body=neg?c.slice(1):c;
 const [i,f='']=body.split('.');
 const n=BigInt(i+f);
 return {n:neg?-n:n,s:f.length};
}
const abs=(x:bigint)=>x<0n?-x:x;
const pow10=(k:number)=>10n**BigInt(k);
/** Both operands at a common scale. */
function align(a:Dec,b:Dec):[bigint,bigint,number]{
 const s=Math.max(a.s,b.s);
 return [a.n*pow10(s-a.s),b.n*pow10(s-b.s),s];
}
const sub=(a:Dec,b:Dec):Dec=>{const [x,y,s]=align(a,b);return {n:x-y,s};};
const add=(a:Dec,b:Dec):Dec=>{const [x,y,s]=align(a,b);return {n:x+y,s};};
const ONE:Dec={n:1n,s:0};
/** Sign of a − b. */
const cmp=(a:Dec,b:Dec):number=>{const [x,y]=align(a,b);return x<y?-1:x>y?1:0;};
const absDec=(a:Dec):Dec=>({n:abs(a.n),s:a.s});
const maxDec=(...xs:Dec[]):Dec=>xs.reduce((m,x)=>cmp(x,m)>0?x:m);
/** |diff| ≤ (num/den) × scale, exactly. */
const within=(diff:Dec,scale:Dec,num:bigint,den:bigint):boolean=>{
 const [d,sc]=align(absDec(diff),scale);
 return d*den<=sc*num;
};

/** |left − right| ≤ tolerance × max(|left|,|right|,1) with exact arithmetic (same rule as dq identityRule). */
function identity(ruleId:string,left:string,right:Dec):RuleResult{
 const l=dec(left);
 if(l===null)return {ruleId,passed:false,detail:{left,right:text(right),reason:'not_a_number'}};
 const diff=sub(l,right);
 const scale=maxDec(absDec(l),absDec(right),ONE);
 if(within(diff,scale,IDENTITY_TOL_RATIO[0],IDENTITY_TOL_RATIO[1]))return {ruleId,passed:true};
 return {ruleId,passed:false,detail:{left:text(l),right:text(right),tolerance:IDENTITY_TOLERANCE}};
}
const text=(d:Dec):string=>{
 const neg=d.n<0n;const digits=abs(d.n).toString().padStart(d.s+1,'0');
 const i=digits.slice(0,digits.length-d.s),f=digits.slice(digits.length-d.s);
 return `${neg?'-':''}${i}${f?`.${f}`:''}`;
};

const cell=(r:AnyFactRow)=>`${r.filing_id}|${r.period_start??''}|${r.period_end}|${r.unit}`;

export function evaluateFactRules(input:FactRulesInput):FactRulesResult{
 const {issuerId,market,mappingGen,sourceRefOf}=input;
 const out:FactRulesResult={quarantine:[],warnings:new Map(WARNING_RULES.map(r=>[r,[]]))};
 const groups=new Map<string,{rows:Map<string,AnyFactRow>;fresh:Set<string>;sample:AnyFactRow}>();
 for(const r of input.newRows){const g=groups.get(cell(r))??{rows:new Map(),fresh:new Set(),sample:r};g.rows.set(r.concept,r);g.fresh.add(r.concept);groups.set(cell(r),g);}
 // ok rows only fill inputs of the same mapping generation: rows of a superseded generation of a filing
 // being remapped disappear on publish, so using them would check an identity against a vanishing input.
 for(const r of input.okRows){const g=groups.get(cell(r));if(g&&r.mapping_gen===g.sample.mapping_gen&&!g.rows.has(r.concept))g.rows.set(r.concept,r);}
 for(const g of groups.values()){
  const s=g.sample;const sourceRef=sourceRefOf.get(s.filing_id)??s.filing_id;
  const get=(c:string)=>g.rows.get(c);
  const park=(reason:RuleQuarantine['reason'],statement:'IS'|'BS',res:RuleResult,inputs:string[])=>{
   const factIds=inputs.filter(c=>g.fresh.has(c)).map(c=>g.rows.get(c)!.fact_id);
   if(factIds.length===0)return;
   out.quarantine.push({reason,naturalKey:identityKey(issuerId,market,statement,s.period_start,s.period_end,s.unit,sourceRef,mappingGen),
    key:{issuer_id:issuerId,market,statement,period_start:s.period_start,period_end:s.period_end,unit:s.unit,filing_id:s.filing_id,source_ref:sourceRef},
    factIds,rule:res.ruleId,detail:{...(res.detail??{}),concepts:inputs}});
  };
  const val=(c:string)=>get(c)?.value;
  const d=(c:string)=>{const v=val(c);return v===undefined?undefined:dec(v);};
  // identity_bs: assets = liabilities_and_equity, else assets = liabilities + equity_total
  const assetsV=val('total_assets');
  if(assetsV!==undefined){
   const leV=val('liabilities_and_equity');const liab=d('total_liabilities');const eq=d('equity_total');
   if(leV!==undefined){
    const le=dec(leV);
    const res=le===null?{ruleId:'identity_bs',passed:false,detail:{left:assetsV,right:leV,reason:'not_a_number'}}:identity('identity_bs',assetsV,le);
    if(!res.passed)park('identity_bs','BS',res,['total_assets','liabilities_and_equity']);
   }else if(liab!==undefined&&eq!==undefined){
    const sum=liab!==null&&eq!==null?add(liab,eq):null;
    const res=sum===null?{ruleId:'identity_bs',passed:false,detail:{left:assetsV,reason:'not_a_number'}}:identity('identity_bs',assetsV,sum);
    if(!res.passed)park('identity_bs','BS',res,['total_assets','total_liabilities','equity_total']);
   }
  }
  // identity_gp: gross_profit = revenue − cost_of_revenue, only when gross_profit is disclosed
  const gpV=val('gross_profit');const gp=d('gross_profit');const rev=d('revenue');const margin=market==='CN'?d('revenue_operating'):rev;const cost=d('cost_of_revenue');
  if(gpV!==undefined&&rev!==undefined&&cost!==undefined){
   const net=rev!==null&&cost!==null?sub(rev,cost):null;
   const res=net===null?{ruleId:'identity_gp',passed:false,detail:{left:gpV,reason:'not_a_number'}}:identity('identity_gp',gpV,net);
   if(!res.passed)park('identity_gp','IS',res,['gross_profit','revenue','cost_of_revenue']);
  }
  // warnings (never quarantine)
  const warnKey=identityKey(issuerId,market,'IS',s.period_start,s.period_end,s.unit,sourceRef,mappingGen);
  // CN: cost_of_revenue is Tushare oper_cost, which pairs with revenue_operating (营业收入), not total revenue; skipped when absent
  if(margin!==undefined&&margin!==null&&margin.n!==0n&&(gp!==undefined||cost!==undefined)){
   // |margin| ≤ 1 ⇔ |numerator| ≤ |denominator| (GROSS_MARGIN_RANGE is [-1,1]); an invalid numerator input (null) is skipped
   const numer=gp!==undefined?gp:cost!==undefined&&cost!==null?sub(margin,cost):null;
   if(numer!==null&&cmp(absDec(numer),absDec(margin))>0)out.warnings.get('gross_margin_range')!.push(warnKey);
  }
  const revRow=get('revenue');
  if(revRow!==undefined&&g.fresh.has('revenue')&&revRow.duration!=='INSTANT'){
   // prior-year candidates come from stored ok rows and from the other new rows, so bulk and incremental ingestion agree
   const newSet=new Set<AnyFactRow>(input.newRows);
   const eligible=[...input.okRows,...input.newRows].filter(r=>r!==revRow&&r.concept==='revenue'&&(r as FactRow).is_current!==false&&r.unit===revRow.unit&&r.duration===revRow.duration&&(()=>{const dd=daysBetween(r.period_end,revRow.period_end);return dd!==null&&dd>=350&&dd<=380;})());
   // resolve each fact key to its CURRENT disclosure (read.ts order: available_date, stored before new on ties, fact_id; last wins),
   // so bulk and incremental ingestion see the same prior value; ambiguity is then only between distinct keys
   const rank=(r:AnyFactRow)=>`${r.available_date}|${newSet.has(r)?1:0}|${r.fact_id}`;
   const current=new Map<string,AnyFactRow>();
   for(const r of eligible){const k=`${r.period_start??''}|${r.period_end}|${r.consolidation}`;const c=current.get(k);if(c===undefined||rank(r)>rank(c))current.set(k,r);}
   const prev=new Set([...current.values()].map(r=>dec(r.value)).map(x=>x===null?'':text(x)));
   const cur=dec(revRow.value);
   if(prev.size===1&&!prev.has('')&&cur!==null){
    const p=dec([...prev][0])!;
    // |cur − prev| ≤ REVENUE_MAX_JUMP × max(|prev|,1)
    if(!within(sub(cur,p),maxDec(absDec(p),ONE),BigInt(REVENUE_MAX_JUMP),1n))out.warnings.get('revenue_jump')!.push(warnKey);
   }
  }
 }
 return out;
}

/** Appends `from` into `into` rule by rule (batch-level accumulation across issuers). */
export function mergeWarnings(into:Map<string,string[]>,from:Map<string,string[]>):Map<string,string[]>{
 for(const [rule,keys] of from){const list=into.get(rule)??[];list.push(...keys);into.set(rule,list);}
 return into;
}

/** One rule_warning_summary entry per rule that fired (INFO code: never degrades the batch). */
export function summarizeWarnings(warnings:Map<string,string[]>):BatchError[]{
 return [...warnings].filter(([,keys])=>keys.length>0).map(([rule,keys])=>({code:'rule_warning_summary',key:rule,message:JSON.stringify({count:keys.length,keys:keys.slice(0,MAX_WARNING_KEYS)})}));
}
supabase/migrations/20261107091000_facts_extensions.sql:18:--  (8b) fact_promote_rows predicates; adopt_candidate; restore_reconciled; resolve_lineage_conflict.
supabase/migrations/20261107091000_facts_extensions.sql:420:-- restore_reconciled). Callers hold the scope lock (promote_quarantined, resolve_facts_quarantine,
supabase/migrations/20261107091000_facts_extensions.sql:421:-- restore_reconciled).
supabase/migrations/20261107091000_facts_extensions.sql:465:-- ---------------------------------------------------------------- 8. adopt a quarantined candidate (spec §3.2 adopt_candidate, §4.6, T1, T5, U3)
supabase/migrations/20261107091000_facts_extensions.sql:481:create or replace function public.adopt_candidate(p_item uuid, p_index int, p_batch uuid, p_expected_rev bigint, p_resolved_by uuid)
supabase/migrations/20261107091000_facts_extensions.sql:598:revoke execute on function public.adopt_candidate(uuid, int, uuid, bigint, uuid) from public, anon, authenticated;
supabase/migrations/20261107091000_facts_extensions.sql:599:grant execute on function public.adopt_candidate(uuid, int, uuid, bigint, uuid) to service_role;
supabase/migrations/20261107091000_facts_extensions.sql:601:-- ---------------------------------------------------------------- 9. restore after a passing re-run (spec §3.2 restore_reconciled, §5.6, R1)
supabase/migrations/20261107091000_facts_extensions.sql:609:create or replace function public.restore_reconciled(p_item uuid, p_batch uuid, p_inputs_hash_now text, p_resolved_by uuid)
supabase/migrations/20261107091000_facts_extensions.sql:651:revoke execute on function public.restore_reconciled(uuid, uuid, text, uuid) from public, anon, authenticated;
supabase/migrations/20261107091000_facts_extensions.sql:652:grant execute on function public.restore_reconciled(uuid, uuid, text, uuid) to service_role;
supabase/migrations/20261107091000_facts_extensions.sql:654:-- ---------------------------------------------------------------- 10. lineage verdict (spec §3.2 resolve_lineage_conflict, §4.4)
supabase/migrations/20261107091000_facts_extensions.sql:664:create or replace function public.resolve_lineage_conflict(p_item uuid, p_keep uuid, p_batch uuid, p_resolved_by uuid)
supabase/migrations/20261107091000_facts_extensions.sql:722:revoke execute on function public.resolve_lineage_conflict(uuid, uuid, uuid, uuid) from public, anon, authenticated;
supabase/migrations/20261107091000_facts_extensions.sql:723:grant execute on function public.resolve_lineage_conflict(uuid, uuid, uuid, uuid) to service_role;
supabase/migrations/20261107091000_facts_extensions.sql:734:  -- migration two: these two reasons close only through restore_reconciled / resolve_lineage_conflict
supabase/migrations/20261107090000_identifiers_and_dq.sql:740:-- patch_quarantine_detail is the only TS-side writer of dq_quarantine.detail once an item exists (the
supabase/migrations/20261107090000_identifiers_and_dq.sql:742:-- replaces ONLY the named key, so a concurrent apply_reconcile_result / restore_reconciled / adoption that
supabase/migrations/20261107090000_identifiers_and_dq.sql:745:create or replace function public.patch_quarantine_detail(p_id uuid, p_key text, p_value jsonb)
supabase/migrations/20261107090000_identifiers_and_dq.sql:756:revoke execute on function public.patch_quarantine_detail(uuid, text, jsonb) from public, anon, authenticated;
supabase/migrations/20261107090000_identifiers_and_dq.sql:757:grant execute on function public.patch_quarantine_detail(uuid, text, jsonb) to service_role;
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
//   the persisted target; promoted 0 → restore_note 'no_rows_promoted' with the skipped reasons.
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
 restoreNote?:'reconcile_wiring_missing'|InputsUnavailable['unavailable'];
 adoptedFactId?:string;
 restore?:{promoted:number;skipped:{fact_id:string;reason:string}[];restore_note?:'no_rows_promoted'};
 quarantined?:number;
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
export async function writeHook(tables:TableClient,id:string,hook:HookState):Promise<HookState>{
 try{
  await patchQuarantineDetail(tables,id,'hook',hook);
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
 return {outcome:'resolved',hook,adoptedFactId:out.factId,chosenFactIds:[out.factId]};
}

async function restore(db:FactsDb,tables:TableClient,item:Row,input:ResolveFactsInput,now:()=>Date):Promise<FactsResolveResult>{
 if(!input.inputsHashNow)return {outcome:'conflict',code:'not_passing',restoreNote:'reconcile_wiring_missing'};
 const id=String(item.id);const hash=await input.inputsHashNow(item);
 if(typeof hash!=='string')return {outcome:'conflict',code:'not_passing',restoreNote:hash.unavailable};
 let r:Awaited<ReturnType<FactsDb['restoreReconciled']>>;
 try{r=await withBatch(tables,String(item.dataset),batchId=>db.restoreReconciled(id,batchId,hash,input.resolvedBy));}
 catch(e){const m=mapRefusal(e);if(m)return m;throw e;}
 const hook=await runHook(db,tables,id,hookTarget(item),now);
 return {outcome:'resolved',hook,promoted:r.promoted,restore:{promoted:r.promoted,skipped:r.skipped,...(r.promoted===0?{restore_note:'no_rows_promoted' as const}:{})}};
}

async function lineageVerdict(db:FactsDb,tables:TableClient,item:Row,input:ResolveFactsInput,now:()=>Date):Promise<FactsResolveResult>{
 if(input.keepFactId===undefined)return {outcome:'invalid_choice',code:'keep_fact_id_required'};
 const id=String(item.id);const keep=input.keepFactId;const market=marketOfDataset(item.dataset);
 let r:{quarantined:number};
 try{r=await withBatch(tables,String(item.dataset),batchId=>db.resolveLineageConflict(id,keep,batchId,input.resolvedBy));}
 catch(e){const m=mapRefusal(e);if(m)return m;throw e;}
 const target=String(item.natural_key).split(':')[0];
 const hook=await runHook(db,tables,id,market?{issuer:target,market}:null,now);
 return {outcome:'resolved',hook,quarantined:r.quarantined,chosenFactIds:[keep]};
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
   const base:FactsResolveResult={outcome:'hook_retried',hook:ran,chosenFactIds,auditAs:audited?(ran.state==='done'?'hook_retried':null):'resolved'};
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

exec
/bin/zsh -lc "sed -n '481,595p' supabase/migrations/20261107091000_facts_extensions.sql; sed -n '609,650p' supabase/migrations/20261107091000_facts_extensions.sql; rg -n 'targetOf|async function materialize' src/lib/facts/{derive.ts,db.ts,memory-facts-db.ts}; find . -iname '*agents*' -not -path './node_modules/*' -not -path './.git/*'; ls .claude; cat package.json | head -65; git show 0094157 -- 'src/app/api/admin/dq/quarantine/[id]/route.test.ts'" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 89ms:
create or replace function public.adopt_candidate(p_item uuid, p_index int, p_batch uuid, p_expected_rev bigint, p_resolved_by uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare q public.dq_quarantine; c jsonb; g public.filings; r public.fact_sync_runs; b public.ingest_batches;
        v_source text; v_market text; v_gen int; v_nk_gen int; v_versions text[]; v_rev bigint;
        v_ps date; v_pe date; v_value numeric; v_run uuid := gen_random_uuid(); v_fact uuid := gen_random_uuid(); v_t uuid; v_k text;
        v_lineage uuid[]; v_now uuid[]; v_locked int;
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
  select count(*) into v_locked from (
    select 1 from public.fact_sync_scope s where s.issuer_id = any(v_lineage) and s.market = g.market order by s.issuer_id for update) x;
  if v_locked <> cardinality(v_lineage) then raise exception 'scope_missing' using errcode = 'P0001'; end if;
  v_now := array(select l.i from (select v_t as i union select issuer_id from public.issuers where merged_into = v_t) l order by l.i);
  if v_now <> v_lineage or not (g.issuer_id = any(v_now))
     or v_t is distinct from coalesce((select i.merged_into from public.issuers i where i.issuer_id = g.issuer_id), g.issuer_id)
     or not exists (select 1 from public.issuers i where i.issuer_id = v_t and i.status = 'active') then
    raise exception 'lineage_changed' using errcode = 'P0001';
  end if;
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
                  and (d.payload -> 'key' ->> 'available_date') ~ '^\d{4}-\d{2}-\d{2}$' and (d.payload -> 'key' ->> 'available_date')::date = g.available_date)
     or exists (select 1 from public.dq_quarantine d
                where d.table_name = 'financial_facts' and d.status = 'open' and d.reason_code = 'lineage_conflict'
                  and d.natural_key = v_t::text || ':' || v_k || ':' || to_char(g.available_date, 'YYYY-MM-DD')) then
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
    raise exception 'not_passing' using errcode = 'P0001';
  end if;
  v_ids := public.fact_item_members(q.payload);
  update public.dq_quarantine
  set status = 'resolved_accept', resolved_by = p_resolved_by, resolved_at = now(),
      detail = detail || jsonb_build_object('restored_by_batch', p_batch, 'chosen_fact_ids', to_jsonb(v_ids),
                                            'hook', jsonb_build_object('stage', 'materialize', 'state', 'pending', 'at', to_jsonb(now())))
  where id = p_item;
  v_before := array(select f.fact_id from public.financial_facts f where f.fact_id = any(v_ids) and f.status = 'quarantined');
  if v_issuer is not null then
    v_promoted := public.fact_promote_rows(v_issuer, v_market, v_ids);
    update public.fact_sync_scope set state_rev = state_rev + 1, updated_at = now() where issuer_id = v_issuer and market = v_market;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('fact_id', x.id,
           'reason', case when f.fact_id is null then 'missing' when not (x.id = any(v_before)) then 'not_quarantined' else 'ineligible' end) order by x.id), '[]'::jsonb)
    into v_skipped
  from unnest(v_ids) as x(id) left join public.financial_facts f on f.fact_id = x.id
  where f.fact_id is null or not (x.id = any(v_before)) or f.status <> 'ok';
  return jsonb_build_object('promoted', v_promoted, 'skipped', v_skipped);
end $$;
src/lib/facts/derive.ts:14:// materialize() follows the plan-3 lineage contract (spec §4.4, T9): target T = targetOf(issuer); the
src/lib/facts/derive.ts:215:export type MaterializeDb=Pick<FactsDb,'targetOf'|'lineageOf'|'readFactsLineage'|'replaceMetricsLineage'>;
src/lib/facts/derive.ts:232:export async function materialize(db:MaterializeDb,issuer:string,market:Market,opts:{today?:string}={}):Promise<MaterializeResult>{
src/lib/facts/derive.ts:236:  const target=await db.targetOf(issuer);
src/lib/facts/memory-facts-db.ts:52:const ASYNC_METHODS=['claimLease','beginRun','stageFilings','stageFacts','quarantineFacts','publishRun','abandonRun','releaseLease','resolveFactsQuarantine','replaceMetrics','readFacts','factsByIds','openConflicts','filingsOfIssuer','updateFilingLink','reconcileScope','scopeDue','scopeRows','scopeAll','metricsOfIssuer','targetOf','lineageOf','stateRevs','readFactsLineage','readFilingFacts','replaceMetricsLineage','findFilingBySourceRef','filingsForCalendar','setFilingAcceptance','adoptCandidate','restoreReconciled','resolveLineageConflict','claimReconcileMember','applyReconcileResult','completeReconcileMember','failReconcileMember','openReconcileCycle','setMerge','setDissolved'] as const satisfies readonly (keyof FactsDb)[];
src/lib/facts/memory-facts-db.ts:440:  async targetOf(issuer){return topoOf(issuer).merged_into??issuer;},
src/lib/facts/memory-facts-db.ts:701:  claimLease:at(0),beginRun:at(0),releaseLease:at(0),readFacts:at(0),openConflicts:at(0),filingsOfIssuer:at(0),metricsOfIssuer:at(0),targetOf:at(0),lineageOf:at(0),
src/lib/facts/db.ts:5:// targetOf, lineageOf, findFilingBySourceRef, filingsForCalendar (reads fact_sync_runs, which anon cannot see:
src/lib/facts/db.ts:243:  async targetOf(issuer){const r=await rows<{merged_into:string|null}>(c.from('issuers').select('merged_into').eq('issuer_id',issuer).limit(1));return r[0]?.merged_into??issuer;},
./.claude/agents
agents
launch.json
scratch
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
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-M06KL5ai' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-QWmXD5FS' (errno=Operation not permitted)
commit 00941572b01acc4877184a9e52d4892bb55ea4c1
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 03:26:51 2026 -0800

    feat(dq): candidate adoption, restore and lineage verdict dispatch, pending-hook scan, E8 (F3-4)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/app/api/admin/dq/quarantine/[id]/route.test.ts b/src/app/api/admin/dq/quarantine/[id]/route.test.ts
index 90f0b19..3adbe73 100644
--- a/src/app/api/admin/dq/quarantine/[id]/route.test.ts
+++ b/src/app/api/admin/dq/quarantine/[id]/route.test.ts
@@ -227,4 +227,64 @@ describe('POST /api/admin/dq/quarantine/[id]', () => {
     expect((await json({ status: 'resolved_accept' })).status).toBe(500);
     spy.mockRestore();
   });
+  const facts3 = (reason: string) => client.update('dq_quarantine', { id: ID }, { dataset: 'facts.us', table_name: 'financial_facts', reason_code: reason, payload: { fact_ids: [FACT_A] } });
+  it('passes chosen_candidate_index (ambiguous_value) and keep_fact_id (lineage_conflict) through, and audits the index and the adopted fact', async () => {
+    mocks.requireAdmin.mockResolvedValue({ id: ADMIN });
+    await facts3('ambiguous_value');
+    mocks.resolveFacts.mockResolvedValueOnce({ outcome: 'resolved', hook: HOOK, adoptedFactId: FACT_B, chosenFactIds: [FACT_B] });
+    const res = await json({ status: 'resolved_accept', chosen_candidate_index: 1 });
+    expect(res.status).toBe(200);
+    expect(await res.json()).toEqual({ id: ID, outcome: 'resolved', hook: HOOK, promoted: null, skipped: null, chosen_fact_ids: [FACT_B], adopted_fact_id: FACT_B, chosen_candidate_index: 1 });
+    expect(mocks.resolveFacts.mock.calls[0][3]).toMatchObject({ status: 'resolved_accept', chosenCandidateIndex: 1, resolvedBy: ADMIN });
+    expect(mocks.insert.mock.calls[0][0]).toMatchObject({ detail: { chosen_candidate_index: 1, adopted_fact_id: FACT_B } });
+    await facts3('lineage_conflict');
+    await json({ status: 'resolved_accept', keep_fact_id: FACT_A });
+    expect(mocks.resolveFacts.mock.calls[1][3]).toMatchObject({ keepFactId: FACT_A });
+  });
+  it('validates and scopes the new body fields: bad values 400, not applicable 400', async () => {
+    await facts3('ambiguous_value');
+    for (const v of [-1, 1.5, '1', 1000]) expect((await json({ status: 'resolved_accept', chosen_candidate_index: v })).status).toBe(400);
+    expect(await (await json({ status: 'resolved_reject', chosen_candidate_index: 0 })).json()).toEqual({ error: 'chosen_candidate_index_not_applicable' });
+    expect(await (await json({ status: 'resolved_accept', keep_fact_id: FACT_A })).json()).toEqual({ error: 'keep_fact_id_not_applicable' });
+    expect((await json({ status: 'resolved_accept', keep_fact_id: 'not-a-uuid' })).status).toBe(400);
+    expect(mocks.resolveFacts).not.toHaveBeenCalled();
+  });
+  it('maps the new outcomes: rule_failed / invalid_choice 400, conflict 409, body {id, outcome, error, detail?}; restore detail on 200; no audit for refusals', async () => {
+    await facts3('reconcile_mismatch');
+    for (const [outcome, code, status] of [['rule_failed', 'identity_bs', 400], ['invalid_choice', 'invalid_candidate', 400], ['conflict', 'not_passing', 409]] as const) {
+      mocks.resolveFacts.mockResolvedValueOnce({ outcome, code });
+      const res = await json({ status: 'resolved_accept' });
+      expect(res.status).toBe(status);
+      expect(await res.json()).toEqual({ id: ID, outcome, error: code });
+    }
+    mocks.resolveFacts.mockResolvedValueOnce({ outcome: 'conflict', code: 'not_passing', restoreNote: 'reconcile_wiring_missing' });
+    const unwired = await json({ status: 'resolved_accept' });
+    expect(unwired.status).toBe(409);
+    expect(await unwired.json()).toEqual({ id: ID, outcome: 'conflict', error: 'not_passing', detail: { restore_note: 'reconcile_wiring_missing' } });
+    expect(mocks.insert).not.toHaveBeenCalled();
+    mocks.resolveFacts.mockResolvedValueOnce({ outcome: 'resolved', hook: HOOK, promoted: 0, restore: { promoted: 0, skipped: [{ fact_id: FACT_A, reason: 'ineligible' }], restore_note: 'no_rows_promoted' } });
+    const ok = await json({ status: 'resolved_accept' });
+    expect(ok.status).toBe(200);
+    expect(await ok.json()).toMatchObject({ outcome: 'resolved', restore: { restore_note: 'no_rows_promoted' } });
+  });
+  it('maps SQL codes thrown past the resolver: conflict codes 409, choice codes 400, body {id, outcome, error}; unknown codes stay a 500', async () => {
+    await facts3('lineage_conflict');
+    for (const code of ['use_dedicated_resolver', 'target_not_active', 'lineage_changed', 'scope_missing', 'conflict_exists', 'replay_required', 'filing_not_found', 'generation_moved', 'duplicate', 'stale_evaluation', 'batch_mismatch', 'not_passing', 'unresolved'] as const) {
+      mocks.resolveFacts.mockRejectedValueOnce(new FactsDbError(code));
+      const res = await json({ status: 'resolved_accept', keep_fact_id: FACT_A });
+      expect(res.status).toBe(409);
+      expect(await res.json()).toEqual({ id: ID, outcome: 'conflict', error: code });
+    }
+    for (const code of ['invalid_choice', 'invalid_candidate'] as const) {
+      mocks.resolveFacts.mockRejectedValueOnce(new FactsDbError(code));
+      const res = await json({ status: 'resolved_accept', keep_fact_id: FACT_A });
+      expect(res.status).toBe(400);
+      expect(await res.json()).toEqual({ id: ID, outcome: 'invalid_choice', error: code });
+    }
+    expect(mocks.insert).not.toHaveBeenCalled();
+    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
+    mocks.resolveFacts.mockRejectedValueOnce(new FactsDbError('unknown', 'boom'));
+    expect((await json({ status: 'resolved_accept', keep_fact_id: FACT_A })).status).toBe(500);
+    spy.mockRestore();
+  });
 });

exec
/bin/zsh -lc "sed -n '205,250p' src/lib/facts/db.ts; rg -n 'consolidation' src/lib/facts/read.ts src/lib/facts/types.ts | head -25; sed -n '1,80p' src/lib/facts/read.ts; rg -n 'parent|consolidation' src/lib/facts/facts* src/lib/dq/facts-resolver.test.ts 2>/dev/null; nl -ba src/lib/dq/pending-hooks.ts | tail -42; ls /Users/osborn/.codex/config*; for p in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/AGENTS.md; do [ "'! -f "$p" ] || cat "$p"; done' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
    let q=c.from('filings').select('*').eq('issuer_id',issuer).eq('market',market);
    if(opts.from!==undefined)q=q.gte('available_date',opts.from);
    if(opts.to!==undefined)q=q.lte('available_date',opts.to);
    if(opts.unlinkedOnly)q=q.is('document_ref',null);
    return q.order('available_date',{ascending:false}).order('filing_id');
   },opts.limit)).map(filingFromTable);
  },
  async updateFilingLink(filingId,patch){const {error}=await c.from('filings').update(linkPatch(patch)).eq('filing_id',filingId);if(error)throw toFactsDbError(error);},
  async reconcileScope(market,input,snapshotAt){return Number(await call<unknown>('reconcile_fact_sync_scope',{p_market:market,p_rows:input,p_snapshot_at:snapshotAt??null}));},
  async scopeDue(market,now,limit){
   if(limit<1)return [];
   return (await pageAll<Record<string,unknown>>(()=>c.from('fact_sync_scope').select('*').eq('market',market).gt('priority',0).lte('next_due_at',now).order('next_due_at').order('priority',{ascending:false}).order('issuer_id'),limit)).map(scopeFromTable);
  },
  async scopeRows(market,issuerIds){
   const out:ScopeRow[]=[];
   for(const part of chunkIds(issuerIds))out.push(...(await pageAll<Record<string,unknown>>(()=>c.from('fact_sync_scope').select('*').eq('market',market).in('issuer_id',part).order('issuer_id'))).map(scopeFromTable));
   return out;
  },
  async scopeAll(market){return (await pageAll<Record<string,unknown>>(()=>c.from('fact_sync_scope').select('*').eq('market',market).order('issuer_id'))).map(scopeFromTable);},
  async metricsOfIssuer(issuer,market,formulaVersion){
   // Pages may span a concurrent replace_financial_metrics: accept a read only when every row carries
   // the same based_on_rev AND the same based_on_lineage vector (T8) and the row count equals the first page's exact count; else retry, then fail.
   for(let attempt=0;attempt<METRICS_ATTEMPTS;attempt++){
    const out:Record<string,unknown>[]=[];let total:number|null=null;
    for(let from=0;;from+=READ_PAGE){
     const q=c.from('financial_metrics').select('*',from===0?{count:'exact'}:undefined).eq('issuer_id',issuer).eq('market',market).eq('formula_version',formulaVersion).order('metric').order('period_end').order('period_start').order('input_unit').order('basis') as Query;
     const {data,error,count}=await q.range(from,from+READ_PAGE-1);
     if(error)throw toFactsDbError(error);
     if(from===0)total=count??null;
     const part=(data??[]) as Record<string,unknown>[];
     out.push(...part);
     if(part.length<READ_PAGE)break;
    }
    const rev=out[0]?.based_on_rev;const vector=lineageKey(lineageRevsFrom(out[0]?.based_on_lineage));
    if(total===out.length&&out.every(r=>Number(r.based_on_rev)===Number(rev)&&lineageKey(lineageRevsFrom(r.based_on_lineage))===vector))return out.map(metricFromTable);
   }
   throw new FactsDbError('unknown','metrics_unstable');
  },
  async targetOf(issuer){const r=await rows<{merged_into:string|null}>(c.from('issuers').select('merged_into').eq('issuer_id',issuer).limit(1));return r[0]?.merged_into??issuer;},
  async lineageOf(target){return [target,...(await pageAll<{issuer_id:string}>(()=>c.from('issuers').select('issuer_id').eq('merged_into',target).order('issuer_id'))).map(r=>String(r.issuer_id))];},
  async stateRevs(issuers,market){
   if(issuers.length===0)return [];
   // read_facts_lineage with no concepts: the revs of every member in one snapshot (anon may call it)
   return lineageRevsFrom((await call<ReadFactsLineageEnvelope>('read_facts_lineage',readLineageArgs(issuers,market,{concepts:[],asOf:'1900-01-01'}))).state_revs);
  },
  async readFactsLineage(issuers,market,opts){return lineageResultFromEnvelope(await call<ReadFactsLineageEnvelope>('read_facts_lineage',readLineageArgs(issuers,market,opts)));},
src/lib/facts/types.ts:29: value:string;unit:string;consolidation:'consolidated';
src/lib/facts/types.ts:45: period_start:string|null;period_end:string;duration:Duration;value:string;value_text:string;unit:string;consolidation:string;
src/lib/facts/types.ts:136:export interface FactInsert{fact_id:string;issuer_id:string;market:Market;filing_id:string;concept:string;source_concept:string;statement:Statement;period_start:string|null;period_end:string;duration:Duration;value:string;unit:string;consolidation:'consolidated';available_date:string;mapping_gen:number;mapping_version:string;raw_hash:string}
src/lib/facts/read.ts:38:const keyOrder=(a:FactRow,b:FactRow)=>cmp(a.concept,b.concept)||cmp(a.period_end,b.period_end)||cmp(a.period_start??'',b.period_start??'')||cmp(a.unit,b.unit)||cmp(a.consolidation,b.consolidation)||cmp(a.issuer_id,b.issuer_id)||cmp(a.market,b.market);
// src/lib/facts/read.ts
// Reference read semantics of read_facts (spec §4.6, §5.2), pure, for derive and tests. Per
// filing only rows whose mapping_gen equals the filing's activated mapping_gen count; rows
// visible at asOf (available_date <= asOf) with status ok form one sequence per K ordered by
// (available_date, created_at, fact_id); disclosure_seq is the position, is_current marks the
// last row, is_revision a numeric value change against the previous row (decimalEquals, never
// JS numbers). includeNonOk adds staged/quarantined rows OUTSIDE the sequences (disclosure_seq
// undefined, is_current false, is_revision false) exactly like the SQL window and memoryFactsDb
// (audit round-1 #14); history=false keeps current rows only, so non-ok rows never appear there.
// All string comparisons are plain code-unit (C collation) order; created_at is compared as an
// instant (Date.parse; equal instants compare equal so fact_id breaks the tie like PostgreSQL;
// unparseable values sort last, among themselves by string). Adapters normalise timestamps to
// millisecond ISO, so sub-millisecond ordering between different transactions is not reproduced
// (accepted limitation; SQL read_facts is authoritative in production). Sequences are scoped per
// (issuer_id, market, K); asOf/from/to must be YYYY-MM-DD. Output is ascending by K, not the SQL's
// period_end-desc key rank: callers that need the SQL order use readFacts.
import type {FactRow} from './types';
import {factKey} from './keys';
import {decimalEquals} from './json-numbers';

export interface SequenceOptions{
 asOf:string;
 /** filing_id → activated mapping_gen (filings.mapping_gen); rows of unknown filings are dropped. */
 filings:Map<string,number>;
 includeNonOk?:boolean;history?:boolean;concepts?:readonly string[];from?:string;to?:string;
}

const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
const cmpInstant=(a:string,b:string)=>{
 const x=Date.parse(a),y=Date.parse(b),bx=Number.isNaN(x),by=Number.isNaN(y);
 if(bx||by)return bx&&by?cmp(a,b):bx?1:-1;
 return x<y?-1:x>y?1:0;
};
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const checkDay=(name:string,v:string|undefined)=>{if(v!==undefined&&(!DAY.test(v)||Number.isNaN(Date.parse(`${v}T00:00:00Z`))))throw new RangeError(`${name} must be YYYY-MM-DD, got ${v}`);};
const scoped=(r:FactRow)=>`${r.issuer_id}\u0000${r.market}\u0000${factKey(r)}`;
const order=(a:FactRow,b:FactRow)=>cmp(a.available_date,b.available_date)||cmpInstant(a.created_at,b.created_at)||cmp(a.fact_id,b.fact_id);
const keyOrder=(a:FactRow,b:FactRow)=>cmp(a.concept,b.concept)||cmp(a.period_end,b.period_end)||cmp(a.period_start??'',b.period_start??'')||cmp(a.unit,b.unit)||cmp(a.consolidation,b.consolidation)||cmp(a.issuer_id,b.issuer_id)||cmp(a.market,b.market);

export function sequencesOf(rows:FactRow[],opts:SequenceOptions):FactRow[]{
 checkDay('asOf',opts.asOf);checkDay('from',opts.from);checkDay('to',opts.to);
 const concepts=opts.concepts?new Set(opts.concepts):null;
 const visible=rows.filter(r=>opts.filings.get(r.filing_id)===r.mapping_gen&&r.available_date<=opts.asOf&&(opts.includeNonOk||r.status==='ok')
  &&(concepts===null||concepts.has(r.concept))&&(opts.from===undefined||r.period_end>=opts.from)&&(opts.to===undefined||r.period_end<=opts.to));
 const byKey=new Map<string,FactRow[]>();
 for(const r of visible)if(r.status==='ok'){const k=scoped(r);const g=byKey.get(k)??[];g.push(r);byKey.set(k,g);}
 const out:FactRow[]=[];
 for(const g of byKey.values()){
  g.sort(order);
  g.forEach((r,i)=>{
   const prev=i>0?g[i-1]:null;
   out.push({...r,disclosure_seq:i+1,is_current:i===g.length-1,is_revision:prev!==null&&!decimalEquals(prev.value,r.value)});
  });
 }
 for(const r of visible)if(r.status!=='ok')out.push({...r,disclosure_seq:undefined,is_current:false,is_revision:false});
 const kept=opts.history?out:out.filter(r=>r.is_current);
 return kept.sort((a,b)=>keyOrder(a,b)||order(a,b));
}

/** Current ok row per K at asOf (history=false, ok only). */
export const currentFacts=(rows:FactRow[],opts:Omit<SequenceOptions,'history'|'includeNonOk'>):FactRow[]=>sequencesOf(rows,{...opts,history:false,includeNonOk:false});
src/lib/dq/facts-resolver.test.ts:17:const fact=(id:string,value:string):FactRow=>({fact_id:id,issuer_id:ISSUER,market:'US',filing_id:'f',run_id:'r',concept:'revenue',source_concept:'Revenues',statement:'IS',period_start:'2022-10-01',period_end:'2023-09-30',duration:'12M',value,value_text:value,unit:'USD',consolidation:'consolidated',available_date:'2023-11-03',mapping_gen:1,mapping_version:'facts-map/1',status:'quarantined',raw_hash:'h',created_at:'2024-01-01T00:00:00Z'});
src/lib/dq/facts-resolver.test.ts:182: const cand=(o:Record<string,unknown>={})=>({concept:'revenue',sourceConcept:'us-gaap:Revenues',statement:'IS',periodStart:'2023-07-01',periodEnd:'2023-09-30',duration:'3M',value:'110',unit:'USD',consolidation:'consolidated',filingRef:'0000320193-23-000106',rawHash:'h-110',...o});
src/lib/facts/facts.integration.test.ts:90: const factRow=(f:FactSpec)=>({fact_id:f.fact_id??randomUUID(),filing_id:f.filing_id,concept:f.concept??'revenue',source_concept:'Revenues',statement:f.concept==='total_assets'?'BS':'IS',period_start:f.period_start===undefined?'2023-10-01':f.period_start,period_end:f.period_end??'2023-12-31',duration:f.duration??'3M',value:f.value??'100',unit:f.unit??'USD',consolidation:'consolidated',available_date:f.available_date??'2024-02-01',mapping_version:'facts-map/1',raw_hash:'h'});
src/lib/facts/facts.integration.test.ts:105:   [id,`${iss}:US:revenue:2023-10-01:2023-12-31:consolidated:USD:${date}`,b,JSON.stringify({key:{issuer_id:iss,market:'US',concept:'revenue',period_start:'2023-10-01',period_end:'2023-12-31',consolidation:'consolidated',unit:'USD',available_date:date},fact_ids:factIds,values:[],run_id:run})]);
    25	 const d=(r.detail??{}) as Record<string,unknown>;const reason=String(r.reason_code);
    26	 return reason==='ambiguous_value'?typeof d.adopted_fact_id==='string':reason==='reconcile_mismatch'?typeof d.restored_by_batch==='string':reason==='lineage_conflict'?Array.isArray(d.chosen_fact_ids):false;
    27	};
    28	
    29	export async function findPendingHooks(tables:TableClient):Promise<{items:PendingHookItem[];untargeted:string[]}>{
    30	 const items:PendingHookItem[]=[];const untargeted:string[]=[];
    31	 const take=(r:Row)=>{const t=hookTarget(r);if(!t){untargeted.push(String(r.id));return;}items.push({id:String(r.id),reason:String(r.reason_code),status:String(r.status),issuer:t.issuer,market:t.market});};
    32	 for(const reason of [...FACT_ROW_REASONS,...VERDICT_REASONS])for(const status of ['resolved_accept','resolved_reject']){
    33	  for(const r of await selectAll(tables,'dq_quarantine',{table_name:'financial_facts',reason_code:reason,status},'id')){
    34	   const st=hookState(r);
    35	   if(st==='pending'||st==='failed'||(!hasHook(r)&&status==='resolved_accept'&&isVerdict(r)))take(r);
    36	  }
    37	 }
    38	 for(const r of await selectAll(tables,'dq_quarantine',{table_name:'financial_facts',reason_code:'reconcile_mismatch',status:'open'},'id')){
    39	  const st=hookState(r);if(st==='pending'||st==='failed')take(r);
    40	 }
    41	 return {items,untargeted};
    42	}
    43	
    44	export async function runPendingHooks(deps:PendingHookDeps):Promise<PendingHookReport>{
    45	 const now=deps.now??(()=>new Date());const run=deps.materialize??realMaterialize;
    46	 const {items,untargeted}=await findPendingHooks(deps.tables);
    47	 const groups=new Map<string,{target:string;market:Market;items:PendingHookItem[]}>();
    48	 for(const it of items){
    49	  const target=await deps.db.targetOf(it.issuer);
    50	  const k=`${target}|${it.market}`;const g=groups.get(k)??{target,market:it.market,items:[]};g.items.push(it);groups.set(k,g);
    51	 }
    52	 const report:PendingHookReport={items:items.length,targets:[],failed:0,untargeted};
    53	 const ordered=[...groups.values()].sort((a,b)=>a.target<b.target?-1:a.target>b.target?1:a.market<b.market?-1:a.market>b.market?1:0);
    54	 for(const g of ordered){
    55	  let hook:HookState;
    56	  try{await run(deps.db,g.target,g.market);hook={stage:'done',state:'done',at:now().toISOString()};}
    57	  catch(e){
    58	   console.error('[pending-hooks] materialize',e instanceof Error?e.message:String(e));
    59	   hook={stage:'materialize',state:'failed',at:now().toISOString(),message:e instanceof FactsDbError?e.code:'materialize_failed'};
    60	  }
    61	  for(const it of g.items)await writeHook(deps.tables,it.id,hook);
    62	  if(hook.state==='failed')report.failed++;
    63	  report.targets.push({target:g.target,market:g.market,state:hook.state,...(hook.message!==undefined?{message:hook.message}:{}),items:g.items.map(i=>i.id)});
    64	 }
    65	 return report;
    66	}
/Users/osborn/.codex/config.toml

exec
/bin/zsh -lc "rg -n 'project_doc|fallback' /Users/osborn/.codex/config.toml; git show 0094157 -- src/lib/dq/dq-extensions.integration.test.ts; sed -n '180,385p' src/lib/dq/facts-resolver.test.ts; sed -n '1,105p' src/lib/dq/batches.ts" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-5xdGf28J' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-99BSqFIz' (errno=Operation not permitted)
commit 00941572b01acc4877184a9e52d4892bb55ea4c1
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 03:26:51 2026 -0800

    feat(dq): candidate adoption, restore and lineage verdict dispatch, pending-hook scan, E8 (F3-4)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/dq/dq-extensions.integration.test.ts b/src/lib/dq/dq-extensions.integration.test.ts
index 1568c61..7ef998d 100644
--- a/src/lib/dq/dq-extensions.integration.test.ts
+++ b/src/lib/dq/dq-extensions.integration.test.ts
@@ -12,6 +12,10 @@ import {randomUUID} from 'node:crypto';
 import {Pool} from 'pg';
 import type {PoolClient} from 'pg';
 import {afterAll,beforeAll,describe,expect,it} from 'vitest';
+import {pgTableClient} from '../db/pg-table-client';
+import {pgFactsDb} from '../facts/pg-facts-db';
+import {FORMULA_VERSION,materialize} from '../facts/derive';
+import {resolveFactsItem} from './facts-resolver';
 
 const enabled=!!process.env.S4_TEST_STATE;
 const MIGRATION='supabase/migrations/20261107091000_facts_extensions.sql';
@@ -1028,4 +1032,31 @@ describe.skipIf(!enabled)('F3-4 facts extensions migration on real PostgreSQL',(
    await expect(replayMigration(admin,sql())).resolves.toBeUndefined();
   },60000);
  });
+
+ describe('Task 11: E8 on PostgreSQL',()=>{
+  it('E8: an ambiguous_value item adopted through resolveFactsItem — the value is served by readFacts and financial_metrics.based_on_lineage moves; a repeat POST is already_resolved',async()=>{
+   const db=pgFactsDb(admin);const tables=pgTableClient(admin);
+   const {iss,b,run,f,fRef}=await published();
+   const run2=await begin(iss,b);await stage(run2,[{filing_id:f,concept:'gross_profit',period_start:'2023-07-01',period_end:'2023-09-30',value:'40'}]);await publish(run2,[f]);
+   await materialize(db,iss,'US',{today:'2030-01-01'});
+   const m0=await db.metricsOfIssuer(iss,'US',FORMULA_VERSION);
+   expect(m0.some(m=>m.metric==='gross_margin'&&m.period_end==='2023-09-30')).toBe(false);
+   const cand=(value:string)=>({concept:'revenue',sourceConcept:'us-gaap:Revenues',statement:'IS',periodStart:'2023-07-01',periodEnd:'2023-09-30',duration:'3M',value,unit:'USD',consolidation:'consolidated',filingRef:fRef,rawHash:`h-${value}`});
+   const id=randomUUID();
+   await q(`insert into public.dq_quarantine(id,dataset,table_name,natural_key,reason_code,batch_id,payload) values($1,'facts.us','financial_facts',$2,'ambiguous_value',$3,$4::jsonb)`,
+    [id,`${iss}:US:revenue:2023-07-01:2023-09-30:consolidated:USD:${fRef}:1`,b,JSON.stringify({key:{issuer_id:iss,market:'US'},candidates:[cand('110'),cand('111')],run_id:run})]);
+   const by=await user();
+   const row=async()=>(await tables.select('dq_quarantine',{id},{limit:1}))[0];
+   const r=await resolveFactsItem(db,tables,await row(),{status:'resolved_accept',chosenCandidateIndex:0,resolvedBy:by,today:'2030-01-01'});
+   expect(r).toMatchObject({outcome:'resolved',hook:{stage:'done',state:'done'}});
+   const env=await db.readFacts(iss,'US',{concepts:['revenue'],asOf:'2030-01-01'});
+   expect(env.rows.find(x=>x.fact_id===r.adoptedFactId)).toMatchObject({value:'110',is_current:true});
+   const m1=await db.metricsOfIssuer(iss,'US',FORMULA_VERSION);
+   expect(m1.find(m=>m.metric==='gross_margin'&&m.period_end==='2023-09-30')!.value).toBe('0.3636363636');
+   expect(m1[0].based_on_lineage).toEqual([{issuer_id:iss,state_rev:await rev(iss)}]);
+   expect(m1[0].based_on_lineage).not.toEqual(m0[0].based_on_lineage);
+   expect((await row()).detail).toMatchObject({chosen_candidate_index:0,adopted_fact_id:r.adoptedFactId,hook:{stage:'done',state:'done'}});
+   expect((await resolveFactsItem(db,tables,await row(),{status:'resolved_accept',chosenCandidateIndex:0,resolvedBy:by})).outcome).toBe('already_resolved');
+  },60000);
+ });
 });
 const FILING='30000000-0000-4000-8000-000000000001',T='40000000-0000-4000-8000-000000000004',KEEP='20000000-0000-4000-8000-0000000000ee';
 const filingRow=(p:Partial<FilingRow>={}):FilingRow=>({filing_id:FILING,issuer_id:ISSUER,market:'US',source:'edgar',origin:'sec',form_type:'10-Q',fiscal_year:2023,fiscal_period:'Q3',period_end:'2023-09-30',available_date:'2023-11-03',source_ref:'0000320193-23-000106',url:null,document_ref:null,document_url:null,link_attempts:0,mapping_gen:1,run_id:'r',created_at:'2024-01-01T00:00:00.000Z',accepted_at:null,acceptance_source:null,...p});
 const cand=(o:Record<string,unknown>={})=>({concept:'revenue',sourceConcept:'us-gaap:Revenues',statement:'IS',periodStart:'2023-07-01',periodEnd:'2023-09-30',duration:'3M',value:'110',unit:'USD',consolidation:'consolidated',filingRef:'0000320193-23-000106',rawHash:'h-110',...o});
 const okRow=(p:Partial<FactRow>):FactRow=>({...fact('20000000-0000-4000-8000-0000000000aa','0'),filing_id:FILING,status:'ok',period_start:'2023-07-01',period_end:'2023-09-30',duration:'3M',...p});
 function h3(o:{readRows?:FactRow[];revs?:number[]}={}){
  const tables=memoryTableClient({dq_quarantine:['id'],ingest_batches:['batch_id']});
  const revs=[...(o.revs??[4])];
  const db={
   findFilingBySourceRef:vi.fn(async(source:string,ref:string)=>source==='edgar'&&ref==='0000320193-23-000106'?filingRow():null),
   readFacts:vi.fn(async(_issuer:string,_market:string,_opts:{history?:boolean})=>({stateRev:revs.length>1?revs.shift()!:revs[0],rows:o.readRows??[],truncated:false})),
   adoptCandidate:vi.fn(async(_item:string,_index:number,_batch:string,_rev:number,_by:string)=>({factId:'50000000-0000-4000-8000-000000000005',runId:'60000000-0000-4000-8000-000000000006',issuerId:ISSUER,market:'US' as const})),
   restoreReconciled:vi.fn(async():Promise<{promoted:number;skipped:{fact_id:string;reason:string}[]}>=>({promoted:1,skipped:[]})),
   resolveLineageConflict:vi.fn(async()=>({quarantined:1})),
   resolveFactsQuarantine:vi.fn(async()=>({promoted:0,skipped:0,chosenFactIds:[]})),
   factsByIds:vi.fn(async()=>[]),
  };
  const item=async(reasonCode:string,payload:Record<string,unknown>,o2:{naturalKey?:string;detail?:Record<string,unknown>}={})=>{
   const id=await quarantine(tables,{dataset:'facts.us',table:'financial_facts',naturalKey:o2.naturalKey??`k:${reasonCode}:${Math.random()}`,reasonCode,batchId:BATCH,payload,detail:o2.detail});
   return (await tables.select('dq_quarantine',{id},{limit:1}))[0];
  };
  return {tables,db:db as unknown as FactsDb&typeof db,item};
 }
 const ambiguousPayload=(cands=[cand(),cand({value:'111',rawHash:'h-111'})])=>({key:{issuer_id:'00000000-0000-4000-8000-0000000000ff',market:'US'},candidates:cands,run_id:'r'});

 it('ambiguous_value + chosenCandidateIndex: filing from the candidate (not the payload), rules on candidate ∪ ok rows, a dq-resolver batch, adoptCandidate under the read stateRev, materialize of the filing issuer',async()=>{
  const {tables,db,item}=h3();
  const it_=await item('ambiguous_value',ambiguousPayload());
  const r=await resolveFactsItem(db,tables,it_,{status:'resolved_accept',chosenCandidateIndex:1,resolvedBy:ADMIN,now:NOW,today:'2026-11-04'});
  expect(db.findFilingBySourceRef).toHaveBeenCalledWith('edgar','0000320193-23-000106');
  expect(db.readFacts).toHaveBeenCalledWith(ISSUER,'US',expect.objectContaining({asOf:'2026-11-04',from:'2023-09-30',to:'2023-09-30',history:true}));
  const [batch]=tables.rows('ingest_batches');
  expect(batch).toMatchObject({producer:'dq-resolver',dataset:'facts.us',status:'success',triggered_by:'manual'});
  expect(db.adoptCandidate).toHaveBeenCalledWith(it_.id,1,batch.batch_id,4,ADMIN);
  expect(mocks.materialize).toHaveBeenCalledWith(db,ISSUER,'US');
  expect(r).toEqual({outcome:'resolved',hook:{stage:'done',state:'done',at:'2026-11-04T09:00:00.000Z'},adoptedFactId:'50000000-0000-4000-8000-000000000005',chosenFactIds:['50000000-0000-4000-8000-000000000005']});
 });
 it('rule_failed: the candidate breaks a statement identity with the ok rows → 400-class outcome, nothing written, no batch',async()=>{
  const {tables,db,item}=h3({readRows:[okRow({concept:'liabilities_and_equity',statement:'BS',period_start:null,duration:'INSTANT',value:'200',value_text:'200'})]});
  const it_=await item('ambiguous_value',ambiguousPayload([cand({concept:'total_assets',statement:'BS',periodStart:null,duration:'INSTANT',value:'100'})]));
  expect(await resolveFactsItem(db,tables,it_,{status:'resolved_accept',chosenCandidateIndex:0,resolvedBy:ADMIN,now:NOW})).toEqual({outcome:'rule_failed',code:'identity_bs'});
  expect(db.adoptCandidate).not.toHaveBeenCalled();expect(tables.rows('ingest_batches')).toEqual([]);
 });
 it('plan audit P1: a later filing that supersedes the balancing rows does not hide them — history read, only the candidate filing at its active generation counts',async()=>{
  const LATER='30000000-0000-4000-8000-000000000009';
  const bs={concept:'liabilities_and_equity',statement:'BS' as const,period_start:null,duration:'INSTANT' as const};
  const own=okRow({...bs,value:'200',value_text:'200',is_current:false});                                        // the candidate filing's own row, superseded
  const later=okRow({...bs,fact_id:'20000000-0000-4000-8000-0000000000bb',filing_id:LATER,value:'100',value_text:'100',is_current:true});
  const {tables,db,item}=h3();
  db.readFacts.mockImplementation(async(_i:string,_m:string,opts:{history?:boolean})=>({stateRev:4,rows:opts.history?[own,later]:[later],truncated:false}));
  const it_=await item('ambiguous_value',ambiguousPayload([cand({concept:'total_assets',statement:'BS',periodStart:null,duration:'INSTANT',value:'100'})]));
  const go=()=>resolveFactsItem(db,tables,it_,{status:'resolved_accept',chosenCandidateIndex:0,resolvedBy:ADMIN,now:NOW});
  expect(await go()).toEqual({outcome:'rule_failed',code:'identity_bs'});                                         // 100 ≠ 200 of its own filing
  expect(db.readFacts).toHaveBeenCalledWith(ISSUER,'US',expect.objectContaining({history:true}));
  expect(db.adoptCandidate).not.toHaveBeenCalled();
  db.readFacts.mockImplementation(async()=>({stateRev:4,rows:[{...own,mapping_gen:2},later],truncated:false}));   // another generation / another filing never count
  expect((await go()).outcome).toBe('resolved');
  expect(db.adoptCandidate).toHaveBeenCalledTimes(1);
 });
 it('plan audit P1: a truncated read refuses the adoption (conflict read_truncated), no batch, nothing written',async()=>{
  const {tables,db,item}=h3();
  db.readFacts.mockResolvedValue({stateRev:4,rows:[],truncated:true});
  const it_=await item('ambiguous_value',ambiguousPayload());
  expect(await resolveFactsItem(db,tables,it_,{status:'resolved_accept',chosenCandidateIndex:0,resolvedBy:ADMIN,now:NOW})).toEqual({outcome:'conflict',code:'read_truncated'});
  expect(db.adoptCandidate).not.toHaveBeenCalled();expect(tables.rows('ingest_batches')).toEqual([]);
 });
 it('stale_evaluation: re-read and re-evaluate once, then adopt under the new rev; a second stale answer is a 409 conflict',async()=>{
  const a=h3({revs:[4,5]});
  a.db.adoptCandidate.mockRejectedValueOnce(new FactsDbError('stale_evaluation'));
  const it1=await a.item('ambiguous_value',ambiguousPayload());
  expect((await resolveFactsItem(a.db,a.tables,it1,{status:'resolved_accept',chosenCandidateIndex:0,resolvedBy:ADMIN,now:NOW})).outcome).toBe('resolved');
  expect(a.db.readFacts).toHaveBeenCalledTimes(2);
  expect(a.db.adoptCandidate.mock.calls.map(c=>c[3])).toEqual([4,5]);
  const b=h3();
  b.db.adoptCandidate.mockRejectedValue(new FactsDbError('stale_evaluation'));
  const it2=await b.item('ambiguous_value',ambiguousPayload());
  expect(await resolveFactsItem(b.db,b.tables,it2,{status:'resolved_accept',chosenCandidateIndex:0,resolvedBy:ADMIN,now:NOW})).toEqual({outcome:'conflict',code:'stale_evaluation'});
  expect(b.tables.rows('ingest_batches')[0]).toMatchObject({status:'failed'});
 });
 it('adopt codes: out-of-range index and bad candidate → invalid_choice; unknown filing → conflict filing_not_found (no db write); SQL codes → conflict; batch_mismatch is a programming error (thrown)',async()=>{
  const {tables,db,item}=h3();
  const it_=await item('ambiguous_value',ambiguousPayload([cand(),cand({rawHash:7}),cand({filingRef:'nope'})]));
  const go=(i:number)=>resolveFactsItem(db,tables,it_,{status:'resolved_accept',chosenCandidateIndex:i,resolvedBy:ADMIN,now:NOW});
  expect(await go(9)).toEqual({outcome:'invalid_choice',code:'invalid_choice'});
  expect(await go(1)).toEqual({outcome:'invalid_choice',code:'invalid_candidate'});
  expect(await go(2)).toEqual({outcome:'conflict',code:'filing_not_found'});
  expect(db.adoptCandidate).not.toHaveBeenCalled();
  for(const c of ['generation_moved','conflict_exists','duplicate','replay_required','filing_not_found'] as const){
   db.adoptCandidate.mockRejectedValueOnce(new FactsDbError(c));expect(await go(0)).toEqual({outcome:'conflict',code:c});
  }
  db.adoptCandidate.mockRejectedValueOnce(new FactsDbError('invalid_candidate'));expect(await go(0)).toEqual({outcome:'invalid_choice',code:'invalid_candidate'});
  db.adoptCandidate.mockRejectedValueOnce(new FactsDbError('batch_mismatch'));
  await expect(go(0)).rejects.toMatchObject({code:'batch_mismatch'});
  expect(mocks.materialize).not.toHaveBeenCalled();
 });
 it('ambiguous_value without an index stays the plan-2 acknowledgement (resolve_facts_quarantine)',async()=>{
  const {tables,db,item}=h3();
  const it_=await item('ambiguous_value',ambiguousPayload());
  await resolveFactsItem(db,tables,it_,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW});
  expect(db.resolveFactsQuarantine).toHaveBeenCalledWith(it_.id,[],ADMIN);expect(db.adoptCandidate).not.toHaveBeenCalled();
 });
 it('reconcile_mismatch: without inputsHashNow → 409 not_passing + reconcile_wiring_missing (no write); {unavailable} → that note (inputs_unavailable / current_evidence_unavailable); with a hash → restoreReconciled(item, batch, hash) and materialize of the persisted target; promoted 0 → restore_note; not_passing → conflict',async()=>{
  const {tables,db,item}=h3();
  const it_=await item('reconcile_mismatch',{fact_ids:[A]},{detail:{issuer_id:ISSUER,market:'US',pair:'us.companyfacts_vs_ixbrl',hook:{stage:'materialize',state:'pending'}}});
  expect(await resolveFactsItem(db,tables,it_,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW})).toEqual({outcome:'conflict',code:'not_passing',restoreNote:'reconcile_wiring_missing'});
  expect(await resolveFactsItem(db,tables,it_,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW,inputsHashNow:async()=>({unavailable:'inputs_unavailable' as const})})).toEqual({outcome:'conflict',code:'not_passing',restoreNote:'inputs_unavailable'});
  expect(await resolveFactsItem(db,tables,it_,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW,inputsHashNow:async()=>({unavailable:'current_evidence_unavailable' as const})})).toEqual({outcome:'conflict',code:'not_passing',restoreNote:'current_evidence_unavailable'});
  expect(db.restoreReconciled).not.toHaveBeenCalled();expect(tables.rows('ingest_batches')).toEqual([]);
  const hashOf=vi.fn(async()=>'hash-now');
  const r=await resolveFactsItem(db,tables,it_,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW,inputsHashNow:hashOf});
  expect(hashOf).toHaveBeenCalledWith(it_);
  expect(db.restoreReconciled).toHaveBeenCalledWith(it_.id,expect.any(String),'hash-now',ADMIN);
  expect(mocks.materialize).toHaveBeenCalledWith(db,ISSUER,'US');
  expect(r).toMatchObject({outcome:'resolved',promoted:1,restore:{promoted:1,skipped:[]},hook:{state:'done'}});
  db.restoreReconciled.mockResolvedValueOnce({promoted:0,skipped:[{fact_id:A,reason:'ineligible'}]});
  expect((await resolveFactsItem(db,tables,it_,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW,inputsHashNow:hashOf})).restore).toEqual({promoted:0,skipped:[{fact_id:A,reason:'ineligible'}],restore_note:'no_rows_promoted'});
  db.restoreReconciled.mockRejectedValueOnce(new FactsDbError('not_passing'));
  expect(await resolveFactsItem(db,tables,it_,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW,inputsHashNow:hashOf})).toEqual({outcome:'conflict',code:'not_passing'});
 });
 it('lineage_conflict: keep_fact_id is required; resolveLineageConflict, then materialize of T from the natural key',async()=>{
  const {tables,db,item}=h3();
  const it_=await item('lineage_conflict',{fact_ids:[KEEP,A]},{naturalKey:`${T}:revenue:2023-07-01:2023-09-30:consolidated:USD:2023-11-03`});
  expect(await resolveFactsItem(db,tables,it_,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW})).toEqual({outcome:'invalid_choice',code:'keep_fact_id_required'});
  const r=await resolveFactsItem(db,tables,it_,{status:'resolved_accept',keepFactId:KEEP,resolvedBy:ADMIN,now:NOW});
  expect(db.resolveLineageConflict).toHaveBeenCalledWith(it_.id,KEEP,expect.any(String),ADMIN);
  expect(mocks.materialize).toHaveBeenCalledWith(db,T,'US');
  expect(r).toMatchObject({outcome:'resolved',quarantined:1,chosenFactIds:[KEEP],hook:{state:'done'}});
  for(const c of ['lineage_changed','scope_missing','unresolved'] as const){db.resolveLineageConflict.mockRejectedValueOnce(new FactsDbError(c));expect(await resolveFactsItem(db,tables,it_,{status:'resolved_accept',keepFactId:KEEP,resolvedBy:ADMIN,now:NOW})).toEqual({outcome:'conflict',code:c});}
 });
 it('reconcile_review: accept and reject are the plan-1 status flip only (no promotion, no hook, no materialize)',async()=>{
  const {tables,db,item}=h3();
  const it_=await item('reconcile_review',{fact_ids:[A]});
  expect(await resolveFactsItem(db,tables,it_,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW})).toEqual({outcome:'resolved'});
  const [row]=await tables.select('dq_quarantine',{id:it_.id});
  expect(row).toMatchObject({status:'resolved_accept',resolved_by:ADMIN});expect(row.detail).toEqual({});
  expect(db.resolveFactsQuarantine).not.toHaveBeenCalled();expect(mocks.materialize).not.toHaveBeenCalled();
 });
 it('rejecting a new-reason item is the generic flip (rows stay quarantined)',async()=>{
  const {tables,db,item}=h3();
  for(const reason of ['reconcile_mismatch','lineage_conflict','ambiguous_value']){
   const it_=await item(reason,{fact_ids:[A]});
   expect(await resolveFactsItem(db,tables,it_,{status:'resolved_reject',resolvedBy:ADMIN})).toEqual({outcome:'resolved'});
  }
  expect(db.restoreReconciled).not.toHaveBeenCalled();expect(db.resolveLineageConflict).not.toHaveBeenCalled();expect(db.adoptCandidate).not.toHaveBeenCalled();
 });
 it('unfinished verdicts (adopted / restored / lineage) with a missing, pending or failed hook re-run materialize only, on the persisted target; 502 semantics come from hook failed',async()=>{
  const {tables,db,item}=h3();
  const done=async(reason:string,detail:Record<string,unknown>,naturalKey?:string)=>{
   const it_=await item(reason,{fact_ids:[A]},{naturalKey,detail});
   await tables.update('dq_quarantine',{id:it_.id},{status:'resolved_accept',resolved_by:ADMIN,resolved_at:'2026-11-04T08:00:00.000Z'});
   return (await tables.select('dq_quarantine',{id:it_.id},{limit:1}))[0];
  };
  const adopted=await done('ambiguous_value',{adopted_fact_id:'f-new',issuer_id:ISSUER,market:'US',hook:{stage:'materialize',state:'pending'}});
  mocks.materialize.mockRejectedValueOnce(new FactsDbError('stale_computation'));
  const first=await resolveFactsItem(db,tables,adopted,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW});
  expect(first).toMatchObject({outcome:'hook_retried',hook:{state:'failed',message:'stale_computation'}});
  expect(db.adoptCandidate).not.toHaveBeenCalled();
  const restored=await done('reconcile_mismatch',{restored_by_batch:'b',issuer_id:T,market:'US'});                 // hook missing
  expect((await resolveFactsItem(db,tables,restored,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW})).outcome).toBe('hook_retried');
  expect(mocks.materialize).toHaveBeenLastCalledWith(db,T,'US');
  const lineage=await done('lineage_conflict',{chosen_fact_ids:[KEEP],issuer_id:T,market:'US',hook:{stage:'materialize',state:'failed'}});
  expect((await resolveFactsItem(db,tables,lineage,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW})).outcome).toBe('hook_retried');
  const ack=await done('ambiguous_value',{hook:{stage:'done',state:'done',at:'x'}});
  expect((await resolveFactsItem(db,tables,ack,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW})).outcome).toBe('already_resolved');
 });
 it('plan audit P4: hook and audit writes patch only their key — a newer latest_result committed right before the write survives',async()=>{
  const {tables,db,item}=h3();
  const it_=await item('lineage_conflict',{fact_ids:[KEEP,A]},{naturalKey:`${T}:revenue:2023-07-01:2023-09-30:consolidated:USD:2023-11-03`,detail:{latest_result:{passed:true,reconciliation_id:'r-old'}}});
  // a concurrent writer (apply_reconcile_result / another verdict) commits just before our first detail write;
  // the old read-then-replace would have written its stale copy back over it
  const newer=async()=>{const [cur]=await tables.select('dq_quarantine',{id:it_.id});await tables.update('dq_quarantine',{id:it_.id},{detail:{...(cur.detail as Record<string,unknown>),latest_result:{passed:false,reconciliation_id:'r-newer'}}});};
  let fired=false;
  const racing:typeof tables={...tables,
   async update(t,m,p){if(t==='dq_quarantine'&&'detail' in p&&!fired){fired=true;await newer();}return tables.update(t,m,p);},
   async rpc(fn,a){if(fn==='patch_quarantine_detail'&&!fired){fired=true;await newer();}return tables.rpc(fn,a);}};
  const r=await resolveFactsItem(db,racing,it_,{status:'resolved_accept',keepFactId:KEEP,resolvedBy:ADMIN,now:NOW});
  expect(r.hook).toMatchObject({stage:'done',state:'done'});
  await markAudited(racing,String(it_.id));
  const [row]=await tables.select('dq_quarantine',{id:it_.id});
  expect(row.detail).toMatchObject({latest_result:{passed:false,reconciliation_id:'r-newer'},hook:{stage:'done',state:'done'},audit_written:true});
 });

 it('never reaches the generic resolve_facts_quarantine for reconcile_mismatch / lineage_conflict (use_dedicated_resolver); target_not_active and use_dedicated_resolver surface as conflicts',async()=>{
  const {tables,db,item}=h3();
  for(const reason of ['reconcile_mismatch','lineage_conflict']){
   const a=await item(reason,{fact_ids:[A]},{naturalKey:`${T}:revenue:2023-07-01:2023-09-30:consolidated:USD:2023-11-03`,detail:{issuer_id:ISSUER,market:'US'}});
   await resolveFactsItem(db,tables,a,{status:'resolved_accept',keepFactId:KEEP,resolvedBy:ADMIN,now:NOW,inputsHashNow:async()=>'h'});
   const b=await item(reason,{fact_ids:[A]},{detail:{issuer_id:ISSUER,market:'US'}});
   await resolveFactsItem(db,tables,b,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW});          // no keep / no wiring: refused before any call
   await resolveFactsItem(db,tables,b,{status:'resolved_reject',resolvedBy:ADMIN,now:NOW});
  }
  expect(db.resolveFactsQuarantine).not.toHaveBeenCalled();
  const it_=await item('lineage_conflict',{fact_ids:[KEEP,A]},{naturalKey:`${T}:revenue:2023-07-01:2023-09-30:consolidated:USD:2023-11-03`});
  for(const c of ['target_not_active','use_dedicated_resolver'] as const){
   db.resolveLineageConflict.mockRejectedValueOnce(new FactsDbError(c));
   expect(await resolveFactsItem(db,tables,it_,{status:'resolved_accept',keepFactId:KEEP,resolvedBy:ADMIN,now:NOW})).toEqual({outcome:'conflict',code:c});
  }
 });
});
// Ingest receipts (spec §5.1 ingest_batches). Every producer starts a batch, writes rows that
// reference batch_id, and finishes with counts + errors. Status is derived from counts and
// errors so dashboards never guess: success = no failures and no non-informational errors;
// quarantined rows and informational entries (INFO_CODES) do not degrade status. The row is written with finished_at:null so the DB invariant
// (status='running' iff finished_at is null) holds. Only a running batch can be finished.
import {randomUUID} from 'node:crypto';
import type {TableClient} from '../db/table-client';

export type BatchStatus='running'|'success'|'partial'|'failed'|'rejected';
export type TriggeredBy='cron'|'manual'|'script';
/**
 * Receipt counters, all non-negative safe integers:
 * - fetched: rows read from the source;
 * - inserted: new rows written; duplicates: rows already present unchanged (no write);
 * - versioned: rows that superseded an existing version; quarantined: rows parked in dq_quarantine;
 * - failed: rows that could not be processed at all.
 * inserted+duplicates+versioned+quarantined+failed is the number of rows with an outcome; it may
 * be below fetched (rows filtered out by design), but fetched > 0 with no outcome at all means the
 * producer lost track of its rows and the batch finishes as failed ('unaccounted').
 */
export interface BatchCounts{fetched:number;inserted:number;duplicates:number;versioned:number;quarantined:number;failed:number}
export interface BatchError{code:string;key?:string;message?:string}
export interface StartBatchInput{producer:string;dataset:string;toolVersions?:Record<string,string>;codeVersion?:string;triggeredBy?:TriggeredBy}

const TRIGGERS:readonly TriggeredBy[]=['cron','manual','script'];
export const emptyCounts=():BatchCounts=>({fetched:0,inserted:0,duplicates:0,versioned:0,quarantined:0,failed:0});

const COUNTERS:readonly (keyof BatchCounts)[]=['fetched','inserted','duplicates','versioned','quarantined','failed'];
const MAX_ERRORS=100,MAX_MESSAGE=500;

function assertCounts(counts:BatchCounts):void{
 if(!counts||COUNTERS.some(k=>!Number.isSafeInteger(counts[k])||counts[k]<0))throw new Error('invalid_counts');
}

/** First MAX_ERRORS errors with messages capped, plus a `truncated` marker for the rest. */
function capErrors(errors:BatchError[]):BatchError[]{
 const kept=errors.slice(0,MAX_ERRORS).map(e=>e.message!==undefined&&e.message.length>MAX_MESSAGE?{...e,message:e.message.slice(0,MAX_MESSAGE)}:e);
 return errors.length>MAX_ERRORS?[...kept,{code:'truncated',message:`${errors.length-MAX_ERRORS} more`}]:kept;
}

/**
 * Error codes that only inform the receipt reader: `skipped_summary` (input rows left out by
 * expected filtering, e.g. not in the universe or not promotable yet) and `relink` (a research
 * entity re-pointed to another issuer), `rule_warning_summary` (one per warning rule per batch, facts spec §7.2),
 * `coverage_summary` (Tushare coverage summary, §6.3), `deadline_hit` (issuers not started after the deadline, §6.1) and `claims_summary` (identifier claims filed per op, data foundation 3 §4.2.2/§8). They stay in `errors` but never make a batch partial or
 * failed. `rejected_summary` (malformed or invalid input rows) is deliberately NOT informational:
 * it makes the batch partial, or failed when nothing landed.
 */
export const INFO_CODES=['skipped_summary','relink','rule_warning_summary','coverage_summary','deadline_hit','claims_summary'] as const;
export type InfoCode=typeof INFO_CODES[number];
export const isInfoError=(e:BatchError)=>(INFO_CODES as readonly string[]).includes(e.code);

const accounted=(c:BatchCounts)=>c.inserted+c.duplicates+c.versioned+c.quarantined+c.failed;
export const UNACCOUNTED_ERROR:BatchError={code:'unaccounted',message:'fetched rows without outcomes'};

/**
 * Pure status: rejected flag wins; fetched rows with no outcome → failed; any failure or
 * non-informational error → partial if something landed, else failed. Errors whose code is in
 * INFO_CODES are ignored here (a run whose only entries are skips/relinks is a success).
 */
export function batchStatusFromCounts(counts:BatchCounts,errors:BatchError[],flags:{rejected?:boolean}={}):BatchStatus{
 assertCounts(counts);
 if(flags.rejected)return 'rejected';
 if(counts.fetched>0&&accounted(counts)===0)return 'failed';
 const landed=counts.inserted+counts.duplicates+counts.versioned+counts.quarantined;
 if(counts.failed>0||errors.some(e=>!isInfoError(e)))return landed>0?'partial':'failed';
 return 'success';
}

export async function startBatch(client:TableClient,input:StartBatchInput):Promise<{batchId:string}>{
 const ok=(s:unknown)=>typeof s==='string'&&s.length>=1&&s.length<=64;
 const trigger=input.triggeredBy??'script';
 if(!ok(input.producer)||!ok(input.dataset)||!TRIGGERS.includes(trigger))throw new Error('invalid_batch');
 const batchId=randomUUID();
 await client.insert('ingest_batches',{
  batch_id:batchId,producer:input.producer,dataset:input.dataset,status:'running',
  started_at:new Date().toISOString(),finished_at:null,counts:emptyCounts(),errors:[],
  tool_versions:input.toolVersions??{},code_version:input.codeVersion??null,triggered_by:trigger,
 });
 return {batchId};
}

/**
 * Finishes a running batch. An unaccounted receipt (fetched > 0, no outcomes) finishes as failed
 * with an appended {code:'unaccounted'} error. Throws invalid_now when `now` or the stored
 * started_at is not a valid date, rather than writing a NaN finished_at.
 */
export async function finishBatch(client:TableClient,batchId:string,result:{counts:BatchCounts;errors:BatchError[];rejected?:boolean},now=new Date()):Promise<BatchStatus>{
 const status=batchStatusFromCounts(result.counts,result.errors,{rejected:result.rejected});
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw new Error('invalid_now');
 const unaccounted=!result.rejected&&result.counts.fetched>0&&accounted(result.counts)===0;
 const errors=unaccounted?[UNACCOUNTED_ERROR,...result.errors]:result.errors;
 const [batch]=await client.select('ingest_batches',{batch_id:batchId},{limit:1});
 if(!batch||batch.status!=='running')throw new Error('batch_not_running');
 const startedAt=Date.parse(String(batch.started_at));
 if(!Number.isFinite(startedAt))throw new Error('invalid_now');
 // Never before started_at (DB check finished_after_started), even under clock skew.
 const finishedAt=new Date(Math.max(now.getTime(),startedAt));
 // Matching on status='running' keeps a concurrent finish from being overwritten.
 const n=await client.update('ingest_batches',{batch_id:batchId,status:'running'},{status,counts:result.counts,errors:capErrors(errors),finished_at:finishedAt.toISOString()});
 if(n!==1)throw new Error('batch_not_running');
 return status;
}

codex
The pending-hook recovery command can report success despite failing to persist completion, masking unfinished recovery work.

Review comment:

- [P2] Include hook persistence failures in the scan result — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/pending-hooks.ts:61-63
  When materialization succeeds but `patch_quarantine_detail` fails, `writeHook` returns a failed hook with `message: 'hook_write_failed'`. This loop discards that result and reports the target as done, so `materialize.ts --pending-hooks` exits successfully even though the items remain pending or failed. Aggregate the returned hook states into the target result and failure count while continuing to process the remaining items.
The pending-hook recovery command can report success despite failing to persist completion, masking unfinished recovery work.

Review comment:

- [P2] Include hook persistence failures in the scan result — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/pending-hooks.ts:61-63
  When materialization succeeds but `patch_quarantine_detail` fails, `writeHook` returns a failed hook with `message: 'hook_write_failed'`. This loop discards that result and reports the target as done, so `materialize.ts --pending-hooks` exits successfully even though the items remain pending or failed. Aggregate the returned hook states into the target result and failure count while continuing to process the remaining items.

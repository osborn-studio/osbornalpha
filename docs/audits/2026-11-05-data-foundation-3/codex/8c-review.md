OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b067-1b6f-73e0-b2d9-faca666c64e7
--------
user
commit 1d6da0e
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 1d6da0e; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 458ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-fkVPLhXg' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-I98eVIiy' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/8c-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-Ec0gtckf' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-rofYyc0g' (errno=Operation not permitted)
1d6da0e feat(dq): migration two part 3 — reconcile cursor, apply_reconcile_result, lock (F3-4)
 src/lib/dq/dq-extensions.integration.test.ts       | 286 +++++++++++++++++++++
 src/lib/supabase/database.types.ts                 |   4 +
 supabase/migrations.lock.json                      |   4 +
 .../migrations/20261107091000_facts_extensions.sql | 271 +++++++++++++++++++
 4 files changed, 565 insertions(+)

exec
/bin/zsh -lc 'ls -a | head -40; for p in /AGENTS.md /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do test ! -f "$p" || cat "$p"; done; git show 1d6da0e -- supabase/migrations/20261107091000_facts_extensions.sql' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
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
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-LkeaTYVK' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-GFCvdsND' (errno=Operation not permitted)
commit 1d6da0e46b79cab9fe881314bc9b6e7a9419d701
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 02:28:16 2026 -0800

    feat(dq): migration two part 3 — reconcile cursor, apply_reconcile_result, lock (F3-4)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/supabase/migrations/20261107091000_facts_extensions.sql b/supabase/migrations/20261107091000_facts_extensions.sql
index 71ced7b..a511d50 100644
--- a/supabase/migrations/20261107091000_facts_extensions.sql
+++ b/supabase/migrations/20261107091000_facts_extensions.sql
@@ -773,3 +773,274 @@ begin
 end $$;
 revoke execute on function public.resolve_facts_quarantine(uuid, uuid[], uuid) from public, anon, authenticated;
 grant execute on function public.resolve_facts_quarantine(uuid, uuid[], uuid) to service_role;
+
+-- ---------------------------------------------------------------- 12. reconcile cursor (spec §3.1, §3.2, §5.5, S4, S5, T2)
+-- fence = {pair, cycle_id, issuer_id, market, batch_id, attempt}. A fenced call locks the cursor row
+-- and requires state = 'claimed', claimed_by = batch_id, attempts = attempt and claim_until > now
+-- (clock_timestamp), else fence_failed with nothing written (P0001: 55P03 would read as lease_lost).
+create or replace function public.reconcile_fence_lock(p_fence jsonb)
+returns public.dq_reconcile_cursor language plpgsql security definer set search_path = public as $$
+declare c public.dq_reconcile_cursor;
+begin
+  if p_fence is null or jsonb_typeof(p_fence) <> 'object'
+     or coalesce(jsonb_typeof(p_fence -> 'pair'), '') <> 'string' or coalesce(jsonb_typeof(p_fence -> 'cycle_id'), '') <> 'string'
+     or coalesce(jsonb_typeof(p_fence -> 'market'), '') <> 'string'
+     or coalesce(p_fence ->> 'issuer_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
+     or coalesce(p_fence ->> 'batch_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
+     or coalesce(jsonb_typeof(p_fence -> 'attempt'), '') <> 'number' or (p_fence ->> 'attempt') !~ '^[0-9]{1,9}$' then
+    raise exception 'fence_failed' using errcode = 'P0001';
+  end if;
+  select * into c from public.dq_reconcile_cursor
+  where pair = p_fence ->> 'pair' and cycle_id = p_fence ->> 'cycle_id' and issuer_id = (p_fence ->> 'issuer_id')::uuid and market = p_fence ->> 'market'
+  for update;
+  if not found or c.state <> 'claimed' or c.claimed_by is distinct from (p_fence ->> 'batch_id')::uuid
+     or c.attempts <> (p_fence ->> 'attempt')::int or c.claim_until is null or c.claim_until <= clock_timestamp() then
+    raise exception 'fence_failed' using errcode = 'P0001';
+  end if;
+  return c;
+end $$;
+revoke execute on function public.reconcile_fence_lock(jsonb) from public, anon, authenticated, service_role;
+
+-- Claimable iff pending, or claimed with an expired lease, or failed with attempts < 3 (failed at
+-- 3 is terminal), and the cycle is running. One atomic update; the post-claim attempts is the fence.
+create or replace function public.claim_reconcile_member(p_pair text, p_cycle_id text, p_issuer uuid, p_market text, p_batch uuid)
+returns jsonb language plpgsql security definer set search_path = public as $$
+declare v_attempt int;
+begin
+  if p_batch is null then raise exception 'invalid_batch' using errcode = '22023'; end if;
+  update public.dq_reconcile_cursor c
+  set state = 'claimed', claimed_by = p_batch, claim_until = clock_timestamp() + interval '10 minutes', attempts = c.attempts + 1, last_error = null
+  where c.pair = p_pair and c.cycle_id = p_cycle_id and c.issuer_id = p_issuer and c.market = p_market
+    and (c.state = 'pending' or (c.state = 'claimed' and c.claim_until < clock_timestamp()) or (c.state = 'failed' and c.attempts < 3))
+    and exists (select 1 from public.dq_reconcile_cycles y where y.pair = c.pair and y.cycle_id = c.cycle_id and y.status = 'running')
+  returning c.attempts into v_attempt;
+  if not found then return null; end if;
+  return jsonb_build_object('pair', p_pair, 'cycle_id', p_cycle_id, 'issuer_id', p_issuer, 'market', p_market, 'batch_id', p_batch, 'attempt', v_attempt);
+end $$;
+revoke execute on function public.claim_reconcile_member(text, text, uuid, text, uuid) from public, anon, authenticated;
+grant execute on function public.claim_reconcile_member(text, text, uuid, text, uuid) to service_role;
+
+-- Counts derived from the member's accepted result rows of this cycle (compared ∧ passed /
+-- compared ∧ ¬passed / any other outcome); their sum must equal expected, else member_incomplete.
+create or replace function public.complete_reconcile_member(p_fence jsonb)
+returns jsonb language plpgsql security definer set search_path = public as $$
+declare c public.dq_reconcile_cursor; v_p int; v_f int; v_n int;
+begin
+  c := public.reconcile_fence_lock(p_fence);
+  select count(*) filter (where r.outcome = 'compared' and r.passed), count(*) filter (where r.outcome = 'compared' and not r.passed), count(*) filter (where r.outcome <> 'compared')
+    into v_p, v_f, v_n
+  from public.dq_reconciliations r
+  where r.pair = c.pair and r.cycle_id = c.cycle_id and r.issuer_id = c.issuer_id and r.market = c.market;
+  if v_p + v_f + v_n <> c.expected then raise exception 'member_incomplete' using errcode = 'P0001'; end if;
+  update public.dq_reconcile_cursor
+  set state = 'done', done_at = clock_timestamp(), claim_until = null, compared_passed = v_p, compared_failed = v_f, not_compared = v_n
+  where pair = c.pair and cycle_id = c.cycle_id and issuer_id = c.issuer_id and market = c.market;
+  return jsonb_build_object('compared_passed', v_p, 'compared_failed', v_f, 'not_compared', v_n);
+end $$;
+revoke execute on function public.complete_reconcile_member(jsonb) from public, anon, authenticated;
+grant execute on function public.complete_reconcile_member(jsonb) to service_role;
+
+create or replace function public.fail_reconcile_member(p_fence jsonb, p_error text)
+returns void language plpgsql security definer set search_path = public as $$
+declare c public.dq_reconcile_cursor;
+begin
+  c := public.reconcile_fence_lock(p_fence);
+  update public.dq_reconcile_cursor
+  set state = 'failed', claim_until = null, last_error = left(coalesce(p_error, 'unknown'), 2000)
+  where pair = c.pair and cycle_id = c.cycle_id and issuer_id = c.issuer_id and market = c.market;
+end $$;
+revoke execute on function public.fail_reconcile_member(jsonb, text) from public, anon, authenticated;
+grant execute on function public.fail_reconcile_member(jsonb, text) to service_role;
+
+-- ---------------------------------------------------------------- 13. per-key atomic reconciliation write (spec §3.2 apply_reconcile_result, §5.6, T2, U2)
+-- The only entry for reconciliation-derived writes; one expected key per call, one transaction:
+-- fence check → (pair, cycle_id, natural_key) already accepted → that row is returned (reused,
+-- nothing written) → else, by action:
+--  quarantine_left (left_fact_id of the fence member required; any outcome / passed — 接口对齐记录 #5):
+--   QUARANTINES only when outcome = 'compared' AND passed = false AND the left row is ok and its run
+--   published: under the member's scope lock, open reconcile_mismatch
+--   item (reused by natural key <pair>:<natural_key>:<fact_id>) with payload {key, fact_ids,
+--   left_value, right_value, right_locator} and detail {pair, reconciliation_id, inputs_hash,
+--   latest_result, issuer_id, market, hook pending}; the row → quarantined; state_rev + 1;
+--   materialize = {issuer_id, market}.
+--  any action with a left_fact_id whose row is already quarantined (passed or not, any outcome): the
+--   OPEN reconcile_mismatch items of this pair that reference it get detail.latest_result = {passed,
+--   reconciliation_id, at, inputs_hash} — this is how a passing re-run makes an item restorable.
+--  quarantine_left otherwise (passed, or not compared, left ok): the result row only.
+--  review_item / lineage_item: an open reconcile_review / lineage_conflict item (reused by natural
+--   key) from result.item; no visibility change.
+--  record: the result row only.
+-- The result row carries cycle_id / issuer_id / market / attempt from the fence and detail.item_id.
+create or replace function public.apply_reconcile_result(p_fence jsonb, p_result jsonb)
+returns jsonb language plpgsql security definer set search_path = public as $$
+declare c public.dq_reconcile_cursor; v_existing public.dq_reconciliations; f public.financial_facts; v_run text;
+        v_rid uuid := gen_random_uuid(); v_item uuid; v_q int := 0; v_mat jsonb; v_action text; v_nk text; v_left uuid;
+        v_dataset text; v_nk_item text; v_latest jsonb; v_now timestamptz := now(); v_reason text;
+        v_lv numeric; v_rv numeric; v_ad numeric; v_rd numeric; v_tol numeric;
+begin
+  c := public.reconcile_fence_lock(p_fence);
+  if p_result is null or jsonb_typeof(p_result) <> 'object'
+     or coalesce(jsonb_typeof(p_result -> 'natural_key'), '') <> 'string'
+     or coalesce(p_result ->> 'kind', '') not in ('numeric','text','date')
+     or coalesce(p_result ->> 'outcome', '') not in ('compared','left_missing','left_unlinked','left_ambiguous','right_missing','unsupported','right_ambiguous','incomplete_gold')
+     or coalesce(jsonb_typeof(p_result -> 'passed'), '') <> 'boolean'
+     or coalesce(p_result ->> 'action', '') not in ('record','quarantine_left','review_item','lineage_item')
+     or coalesce(jsonb_typeof(p_result -> 'left_source'), '') <> 'string' or coalesce(jsonb_typeof(p_result -> 'right_source'), '') <> 'string'
+     or coalesce(jsonb_typeof(p_result -> 'detail'), '') <> 'object' or coalesce(jsonb_typeof(p_result -> 'tolerance'), '') <> 'string' then
+    raise exception 'invalid_result' using errcode = '22023';
+  end if;
+  v_action := p_result ->> 'action'; v_nk := p_result ->> 'natural_key';
+  if length(v_nk) not between 1 and 400 then raise exception 'invalid_result' using errcode = '22023'; end if;
+  begin
+    v_lv := (p_result ->> 'left_value')::numeric; v_rv := (p_result ->> 'right_value')::numeric;
+    v_ad := (p_result ->> 'abs_diff')::numeric; v_rd := (p_result ->> 'rel_diff')::numeric;
+    v_tol := (p_result ->> 'tolerance')::numeric; v_left := (p_result ->> 'left_fact_id')::uuid;
+  exception when others then
+    raise exception 'invalid_result' using errcode = '22023';
+  end;
+  if (v_action = 'quarantine_left' and v_left is null)
+     or (v_action in ('review_item','lineage_item')
+         and (coalesce(jsonb_typeof(p_result -> 'item'), '') <> 'object' or coalesce(jsonb_typeof(p_result -> 'item' -> 'natural_key'), '') <> 'string'
+              or coalesce(jsonb_typeof(p_result -> 'item' -> 'payload'), '') <> 'object' or length(p_result -> 'item' ->> 'natural_key') not between 1 and 512)) then
+    raise exception 'invalid_result' using errcode = '22023';
+  end if;
+  select * into v_existing from public.dq_reconciliations where pair = c.pair and cycle_id = c.cycle_id and natural_key = v_nk;
+  if found then
+    if v_existing.issuer_id is distinct from c.issuer_id or v_existing.market is distinct from c.market then raise exception 'invalid_result' using errcode = '22023'; end if;
+    return jsonb_build_object('reused', true, 'reconciliation_id', v_existing.id, 'item_id', coalesce(v_existing.detail -> 'item_id', 'null'::jsonb), 'quarantined', 0, 'materialize', 'null'::jsonb);
+  end if;
+  v_dataset := case c.market when 'US' then 'facts.us' else 'facts.cn' end;
+  v_latest := jsonb_build_object('passed', p_result -> 'passed', 'reconciliation_id', v_rid, 'at', to_jsonb(v_now), 'inputs_hash', coalesce(p_result -> 'inputs_hash', 'null'::jsonb));
+  if v_left is not null then
+    perform 1 from public.fact_sync_scope where issuer_id = c.issuer_id and market = c.market for update;
+    select * into f from public.financial_facts where fact_id = v_left;
+    if not found or f.issuer_id <> c.issuer_id or f.market <> c.market then raise exception 'invalid_result' using errcode = '22023'; end if;
+    select r.status into v_run from public.fact_sync_runs r where r.run_id = f.run_id;
+  end if;
+  if v_action = 'quarantine_left' and f.status = 'ok' and v_run = 'published'
+     and p_result ->> 'outcome' = 'compared' and (p_result -> 'passed') = 'false'::jsonb then
+    v_nk_item := c.pair || ':' || v_nk || ':' || v_left::text;
+    if length(v_nk_item) > 512 then raise exception 'invalid_result' using errcode = '22023'; end if;
+    select q.id into v_item from public.dq_quarantine q
+    where q.dataset = v_dataset and q.table_name = 'financial_facts' and q.natural_key = v_nk_item and q.reason_code = 'reconcile_mismatch' and q.status = 'open'
+    for update;
+    if v_item is null then
+      v_item := gen_random_uuid();
+      insert into public.dq_quarantine (id, dataset, table_name, natural_key, reason_code, detail, payload, batch_id, status)
+      values (v_item, v_dataset, 'financial_facts', v_nk_item, 'reconcile_mismatch',
+              jsonb_build_object('pair', c.pair, 'reconciliation_id', v_rid, 'inputs_hash', coalesce(p_result -> 'inputs_hash', 'null'::jsonb), 'latest_result', v_latest,
+                                 'issuer_id', c.issuer_id, 'market', c.market, 'hook', jsonb_build_object('stage', 'materialize', 'state', 'pending', 'at', to_jsonb(v_now))),
+              jsonb_build_object('key', jsonb_build_object('issuer_id', f.issuer_id, 'market', f.market, 'concept', f.concept, 'period_start', f.period_start, 'period_end', f.period_end,
+                                                           'consolidation', f.consolidation, 'unit', f.unit, 'available_date', f.available_date),
+                                 'fact_ids', jsonb_build_array(v_left), 'left_value', coalesce(p_result -> 'left_value', 'null'::jsonb), 'right_value', coalesce(p_result -> 'right_value', 'null'::jsonb),
+                                 'right_locator', coalesce(p_result -> 'detail' -> 'right' -> 'locator', 'null'::jsonb)),
+              c.claimed_by, 'open');
+    else
+      update public.dq_quarantine
+      set detail = detail || jsonb_build_object('reconciliation_id', v_rid, 'latest_result', v_latest, 'hook', jsonb_build_object('stage', 'materialize', 'state', 'pending', 'at', to_jsonb(v_now)))
+      where id = v_item;
+    end if;
+    update public.financial_facts set status = 'quarantined' where fact_id = v_left and status = 'ok';
+    v_q := 1;
+    update public.fact_sync_scope set state_rev = state_rev + 1, updated_at = now() where issuer_id = c.issuer_id and market = c.market;
+    v_mat := jsonb_build_object('issuer_id', c.issuer_id, 'market', c.market);
+  elsif v_left is not null and f.status = 'quarantined' then
+    with upd as (
+      update public.dq_quarantine q set detail = q.detail || jsonb_build_object('latest_result', v_latest)
+      where q.table_name = 'financial_facts' and q.reason_code = 'reconcile_mismatch' and q.status = 'open' and q.detail ->> 'pair' = c.pair
+        and jsonb_typeof(q.payload -> 'fact_ids') = 'array' and q.payload -> 'fact_ids' ? v_left::text
+      returning q.id)
+    select upd.id into v_item from upd order by upd.id limit 1;
+  end if;
+  if v_action in ('review_item','lineage_item') then
+    v_reason := case v_action when 'review_item' then 'reconcile_review' else 'lineage_conflict' end;
+    select q.id into v_item from public.dq_quarantine q
+    where q.dataset = v_dataset and q.table_name = 'financial_facts' and q.natural_key = p_result -> 'item' ->> 'natural_key' and q.reason_code = v_reason and q.status = 'open';
+    if v_item is null then
+      v_item := gen_random_uuid();
+      insert into public.dq_quarantine (id, dataset, table_name, natural_key, reason_code, detail, payload, batch_id, status)
+      values (v_item, v_dataset, 'financial_facts', p_result -> 'item' ->> 'natural_key', v_reason,
+              (case when jsonb_typeof(p_result -> 'item' -> 'detail') = 'object' then p_result -> 'item' -> 'detail' else '{}'::jsonb end)
+                || jsonb_build_object('pair', c.pair, 'reconciliation_id', v_rid, 'issuer_id', c.issuer_id, 'market', c.market),
+              p_result -> 'item' -> 'payload', c.claimed_by, 'open');
+    end if;
+  end if;
+  insert into public.dq_reconciliations (id, dataset, left_source, right_source, natural_key, left_value, right_value, abs_diff, rel_diff, tolerance, passed, batch_id,
+                                         pair, kind, outcome, detail, cycle_id, issuer_id, market, attempt)
+  values (v_rid, 'reconcile.' || c.pair, p_result ->> 'left_source', p_result ->> 'right_source', v_nk, v_lv, v_rv, v_ad, v_rd, v_tol, (p_result ->> 'passed')::boolean, c.claimed_by,
+          c.pair, p_result ->> 'kind', p_result ->> 'outcome',
+          (p_result -> 'detail') || jsonb_build_object('item_id', v_item, 'inputs_hash', coalesce(p_result -> 'inputs_hash', 'null'::jsonb)),
+          c.cycle_id, c.issuer_id, c.market, c.attempts);
+  return jsonb_build_object('reused', false, 'reconciliation_id', v_rid, 'item_id', v_item, 'quarantined', v_q, 'materialize', coalesce(v_mat, 'null'::jsonb));
+end $$;
+revoke execute on function public.apply_reconcile_result(jsonb, jsonb) from public, anon, authenticated;
+grant execute on function public.apply_reconcile_result(jsonb, jsonb) to service_role;
+
+-- ---------------------------------------------------------------- 14. atomic cycle creation (spec §3.1, §5.5; plan audit Q2)
+-- The only writer of new dq_reconcile_cycles rows. Under the pair's cycle lock — the advisory lock
+-- set_merge takes right before it registers a pending member (section 8a) — in one transaction:
+--  a running cycle of the pair → returned unchanged (created false, nothing consumed);
+--  else p_members [{issuer_id, market, expected_keys[]}] (distinct (issuer, market), keys resolved by the
+--  runner) and p_pending [{issuer_id, market, source}] (the runner's snapshot; each entry's (issuer,
+--  market) must be a member, i.e. its keys were resolved AFTER the merge was visible) are checked; the
+--  cycle row (expected_total = Σ keys) and one pending cursor per member are inserted; exactly the
+--  p_pending entries leave every cycle row's detail.pending_members (an entry registered after the
+--  snapshot stays and joins the next cycle); the new row's detail records pending_merged_from /
+--  pending_transferred. A writer that bypassed the lock hits the running partial unique index:
+--  unique_violation → the winner is returned (created false). Lock order: advisory lock, then cursor
+--  inserts (KEY SHARE on issuers via the FK), then cycle rows; set_merge takes the same advisory lock
+--  FIRST, before its scope/issuer locks (plan audit R1) — so neither side holds a row the other needs
+--  while waiting for the advisory lock; set_dissolved takes no advisory lock (one-way wait) — no cycle.
+create or replace function public.open_reconcile_cycle(p_pair text, p_cycle_id text, p_started_at timestamptz, p_members jsonb, p_pending jsonb)
+returns jsonb language plpgsql security definer set search_path = public as $$
+declare v_row public.dq_reconcile_cycles; r record; v_keep jsonb; v_take jsonb; v_from text[] := '{}'; v_moved jsonb := '[]'::jsonb;
+begin
+  if p_pair is null or p_cycle_id is null or p_started_at is null then raise exception 'invalid_members' using errcode = '22023'; end if;
+  perform pg_advisory_xact_lock(hashtext('dq_reconcile_cycle:' || p_pair));
+  select * into v_row from public.dq_reconcile_cycles where pair = p_pair and status = 'running';
+  if found then return jsonb_build_object('created', false, 'cycle', to_jsonb(v_row), 'transferred', '[]'::jsonb); end if;
+  if jsonb_typeof(p_members) is distinct from 'array' or jsonb_typeof(p_pending) is distinct from 'array'
+     or exists (select 1 from jsonb_array_elements(p_members) m
+                where jsonb_typeof(m) <> 'object' or (m ->> 'issuer_id') is null or coalesce(m ->> 'market', '') not in ('US', 'CN')
+                   or jsonb_typeof(m -> 'expected_keys') is distinct from 'array')
+     or (select count(*) from jsonb_array_elements(p_members))
+        <> (select count(distinct (m ->> 'issuer_id', m ->> 'market')) from jsonb_array_elements(p_members) m)
+     or exists (select 1 from jsonb_array_elements(p_pending) p
+                where jsonb_typeof(p) <> 'object' or (p ->> 'source') is null
+                   or not exists (select 1 from jsonb_array_elements(p_members) m
+                                  where m ->> 'issuer_id' = p ->> 'issuer_id' and m ->> 'market' = p ->> 'market'))
+  then raise exception 'invalid_members' using errcode = '22023'; end if;
+  begin
+    insert into public.dq_reconcile_cycles (pair, cycle_id, started_at, finished_at, members, status, expected_total, detail)
+    values (p_pair, p_cycle_id, p_started_at, null, p_members, 'running',
+            (select coalesce(sum(jsonb_array_length(m -> 'expected_keys')), 0) from jsonb_array_elements(p_members) m), '{}'::jsonb);
+  exception when unique_violation then
+    select * into v_row from public.dq_reconcile_cycles where pair = p_pair and status = 'running';
+    if found then return jsonb_build_object('created', false, 'cycle', to_jsonb(v_row), 'transferred', '[]'::jsonb); end if;
+    raise;
+  end;
+  insert into public.dq_reconcile_cursor (pair, cycle_id, issuer_id, market, expected)
+  select p_pair, p_cycle_id, (m ->> 'issuer_id')::uuid, m ->> 'market', jsonb_array_length(m -> 'expected_keys')
+  from jsonb_array_elements(p_members) m;
+  for r in select c.cycle_id, c.detail from public.dq_reconcile_cycles c
+           where c.pair = p_pair and c.cycle_id <> p_cycle_id and jsonb_typeof(c.detail -> 'pending_members') = 'array'
+           order by c.cycle_id for update loop
+    select coalesce(jsonb_agg(e) filter (where not (p_pending @> jsonb_build_array(e))), '[]'::jsonb),
+           coalesce(jsonb_agg(e) filter (where p_pending @> jsonb_build_array(e)), '[]'::jsonb)
+      into v_keep, v_take
+    from jsonb_array_elements(r.detail -> 'pending_members') e;
+    if jsonb_array_length(v_take) > 0 then
+      update public.dq_reconcile_cycles
+      set detail = jsonb_set(r.detail, '{pending_members}', v_keep) || jsonb_build_object('pending_consumed_by', p_cycle_id)
+      where pair = p_pair and cycle_id = r.cycle_id;
+      v_from := v_from || r.cycle_id::text; v_moved := v_moved || v_take;
+    end if;
+  end loop;
+  update public.dq_reconcile_cycles
+  set detail = jsonb_build_object('pending_merged_from', to_jsonb(v_from), 'pending_transferred', v_moved)
+  where pair = p_pair and cycle_id = p_cycle_id
+  returning * into v_row;
+  return jsonb_build_object('created', true, 'cycle', to_jsonb(v_row), 'transferred', v_moved);
+end $$;
+revoke execute on function public.open_reconcile_cycle(text, text, timestamptz, jsonb, jsonb) from public, anon, authenticated;
+grant execute on function public.open_reconcile_cycle(text, text, timestamptz, jsonb, jsonb) to service_role;

exec
/bin/zsh -lc "git show 1d6da0e -- src/lib/dq/dq-extensions.integration.test.ts src/lib/supabase/database.types.ts supabase/migrations.lock.json; find . -iname '*agents*' -o -name CLAUDE.md; sed -n '1,180p' supabase/migrations/20261107091000_facts_extensions.sql" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 41ms:
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-74GlWpd2' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-uLfXmKOF' (errno=Operation not permitted)
commit 1d6da0e46b79cab9fe881314bc9b6e7a9419d701
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 02:28:16 2026 -0800

    feat(dq): migration two part 3 — reconcile cursor, apply_reconcile_result, lock (F3-4)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/dq/dq-extensions.integration.test.ts b/src/lib/dq/dq-extensions.integration.test.ts
index 1ecb8a5..5d967a6 100644
--- a/src/lib/dq/dq-extensions.integration.test.ts
+++ b/src/lib/dq/dq-extensions.integration.test.ts
@@ -649,4 +649,290 @@ describe.skipIf(!enabled)('F3-4 facts extensions migration on real PostgreSQL',(
    }
   });
  });
+
+ describe('8c: reconcile cursor and apply_reconcile_result',()=>{
+  const newPair=()=>`test.${randomUUID().slice(0,8)}`;   // one pair per test: never meets another suite's running cycle
+  const cycle=async(pair:string,members:{issuer_id:string;market?:string;expected:number}[],status='running')=>{
+   const id=`${pair}-${randomUUID().slice(0,8)}`;
+   await q(`insert into public.dq_reconcile_cycles(pair,cycle_id,started_at,finished_at,members,status,expected_total) values($1,$2,now(),$3,$4::jsonb,$5,$6)`,
+    [pair,id,status==='running'?null:new Date().toISOString(),JSON.stringify(members.map(m=>({issuer_id:m.issuer_id,market:m.market??'US',expected_keys:m.expected}))),status,members.reduce((n,m)=>n+m.expected,0)]);
+   for(const m of members)await q(`insert into public.dq_reconcile_cursor(pair,cycle_id,issuer_id,market,expected) values($1,$2,$3,$4,$5)`,[pair,id,m.issuer_id,m.market??'US',m.expected]);
+   return id;
+  };
+  type FenceJson={pair:string;cycle_id:string;issuer_id:string;market:string;batch_id:string;attempt:number};
+  const claimM=(pair:string,cy:string,iss:string,b:string,market='US')=>one(`select public.claim_reconcile_member($1,$2,$3,$4,$5) v`,[pair,cy,iss,market,b]) as Promise<FenceJson|null>;
+  const apply=(fence:FenceJson,result:Record<string,unknown>)=>one(`select public.apply_reconcile_result($1::jsonb,$2::jsonb) v`,[JSON.stringify(fence),JSON.stringify(result)]);
+  const complete=(fence:FenceJson)=>one(`select public.complete_reconcile_member($1::jsonb) v`,[JSON.stringify(fence)]);
+  const failM=(fence:FenceJson,err:string)=>q(`select public.fail_reconcile_member($1::jsonb,$2)`,[JSON.stringify(fence),err]);
+  const cursor=async(pair:string,cy:string,iss:string)=>(await q(`select state,attempts,claimed_by,last_error,compared_passed,compared_failed,not_compared from public.dq_reconcile_cursor where pair=$1 and cycle_id=$2 and issuer_id=$3`,[pair,cy,iss]))[0];
+  const expire=(pair:string,cy:string,iss:string)=>q(`update public.dq_reconcile_cursor set claim_until=clock_timestamp()-interval '1 second' where pair=$1 and cycle_id=$2 and issuer_id=$3`,[pair,cy,iss]);
+  const res=(nk:string,o:Record<string,unknown>={})=>({natural_key:nk,kind:'numeric',outcome:'compared',passed:false,left_value:'100',right_value:'99',abs_diff:'1',rel_diff:'0.01',tolerance:'0',
+   left_source:'companyfacts',right_source:'ixbrl',detail:{right:{document:'d',sha256:'s',locator:'ix:nonFraction#c1'}},action:'record',inputs_hash:'h1',...o});
+  const resultRows=(pair:string)=>q(`select natural_key,outcome,passed,attempt,issuer_id,market,cycle_id,dataset,batch_id,detail->>'item_id' item_id from public.dq_reconciliations where pair=$1 order by natural_key`,[pair]);
+
+  it('claim (S4): pending → fence attempt 1; held → null; expired → attempt 2; failed with attempts < 3 → claimable; failed at 3 is terminal; a cycle that is not running → null',async()=>{
+   const iss=await issuer();const pair=newPair();const cy=await cycle(pair,[{issuer_id:iss,expected:0}]);
+   const b1=await batch(`reconcile.${pair}`),b2=await batch(`reconcile.${pair}`);
+   expect(await claimM(pair,cy,iss,b1)).toEqual({pair,cycle_id:cy,issuer_id:iss,market:'US',batch_id:b1,attempt:1});
+   expect(await claimM(pair,cy,iss,b2)).toBeNull();
+   await expire(pair,cy,iss);
+   const f2=(await claimM(pair,cy,iss,b2))!;expect(f2).toMatchObject({batch_id:b2,attempt:2});
+   await failM(f2,'boom');
+   expect(await cursor(pair,cy,iss)).toMatchObject({state:'failed',attempts:2,last_error:'boom'});
+   const f3=(await claimM(pair,cy,iss,b1))!;expect(f3).toMatchObject({attempt:3});
+   await failM(f3,'again');
+   expect(await claimM(pair,cy,iss,b2)).toBeNull();
+   expect(await cursor(pair,cy,iss)).toMatchObject({state:'failed',attempts:3});
+   const other=await issuer();const pair2=newPair();const done=await cycle(pair2,[{issuer_id:other,expected:0}],'complete');
+   expect(await claimM(pair2,done,other,b1)).toBeNull();
+  });
+
+  it('fence: an expired, foreign or stale-attempt fence is fence_failed for apply / complete / fail and writes nothing',async()=>{
+   const {iss,r}=await published();const pair=newPair();const cy=await cycle(pair,[{issuer_id:iss,expected:1}]);
+   const w=await batch(`reconcile.${pair}`);const fence=(await claimM(pair,cy,iss,w))!;
+   for(const f of [{...fence,batch_id:randomUUID()},{...fence,attempt:2},{...fence,cycle_id:'nope'},{...fence,attempt:undefined} as unknown as FenceJson]){
+    expect(await fails(apply(f,res('k1',{action:'quarantine_left',left_fact_id:r})))).toMatchObject({message:'fence_failed',code:'P0001'});
+    expect(await fails(complete(f))).toMatchObject({message:'fence_failed'});
+    expect(await fails(failM(f,'x'))).toMatchObject({message:'fence_failed'});
+   }
+   await expire(pair,cy,iss);
+   expect(await fails(apply(fence,res('k1',{action:'quarantine_left',left_fact_id:r})))).toMatchObject({message:'fence_failed'});
+   expect(await resultRows(pair)).toEqual([]);
+   expect(await status(r)).toBe('ok');
+   expect(await q(`select 1 from public.dq_quarantine where natural_key like $1`,[`${pair}:%`])).toEqual([]);
+   expect(await cursor(pair,cy,iss)).toMatchObject({state:'claimed',attempts:1});
+  });
+
+  it('apply_reconcile_result: result row + mismatch item + quarantine + hook pending in one transaction; the same key again is reused; complete derives the counts (member_incomplete before); drc_done_accounted (S5)',async()=>{
+   const {iss,r}=await published();const pair=newPair();const cy=await cycle(pair,[{issuer_id:iss,expected:3}]);
+   const w=await batch(`reconcile.${pair}`);const fence=(await claimM(pair,cy,iss,w))!;
+   const before=await rev(iss);
+   const a=await apply(fence,res('k1',{action:'quarantine_left',left_fact_id:r}));
+   expect(a).toMatchObject({reused:false,quarantined:1,materialize:{issuer_id:iss,market:'US'}});
+   expect(await status(r)).toBe('quarantined');expect(await rev(iss)).toBe(before+1);
+   const [row]=await q(`select dataset,natural_key,reason_code,status,batch_id,payload,detail from public.dq_quarantine where id=$1`,[a.item_id]);
+   expect(row).toMatchObject({dataset:'facts.us',natural_key:`${pair}:k1:${r}`,reason_code:'reconcile_mismatch',status:'open',batch_id:w});
+   expect(row.payload).toMatchObject({fact_ids:[r],left_value:'100',right_value:'99',right_locator:'ix:nonFraction#c1',
+    key:{issuer_id:iss,market:'US',concept:'revenue',period_start:'2023-10-01',period_end:'2023-12-31',consolidation:'consolidated',unit:'USD',available_date:'2024-02-01'}});
+   expect(row.detail).toMatchObject({pair,reconciliation_id:a.reconciliation_id,inputs_hash:'h1',issuer_id:iss,market:'US',latest_result:{passed:false,reconciliation_id:a.reconciliation_id,inputs_hash:'h1'},hook:{stage:'materialize',state:'pending'}});
+   expect(await apply(fence,res('k1',{action:'quarantine_left',left_fact_id:r}))).toEqual({reused:true,reconciliation_id:a.reconciliation_id,item_id:a.item_id,quarantined:0,materialize:null});
+   expect(await rev(iss)).toBe(before+1);
+   expect(await fails(complete(fence))).toMatchObject({message:'member_incomplete'});
+   await apply(fence,res('k2',{passed:true,right_value:'100',abs_diff:'0',rel_diff:'0'}));
+   await apply(fence,res('k3',{outcome:'right_missing',left_value:'5',right_value:null,abs_diff:null,rel_diff:null}));
+   expect(await complete(fence)).toEqual({compared_passed:1,compared_failed:1,not_compared:1});
+   expect(await cursor(pair,cy,iss)).toMatchObject({state:'done',compared_passed:1,compared_failed:1,not_compared:1});
+   expect((await resultRows(pair)).map(x=>[x.natural_key,x.outcome,x.passed,x.attempt,x.issuer_id,x.market,x.cycle_id,x.dataset,x.batch_id])).toEqual(
+    ['k1','k2','k3'].map((k,i)=>[k,i===2?'right_missing':'compared',i===1,1,iss,'US',cy,`reconcile.${pair}`,w]));
+   expect((await resultRows(pair))[0].item_id).toBe(a.item_id);
+   expect(await fails(apply(fence,res('k4')))).toMatchObject({message:'fence_failed'});                   // done: the fence no longer holds
+   await expect(q(`update public.dq_reconcile_cursor set compared_passed=null where pair=$1 and cycle_id=$2`,[pair,cy])).rejects.toMatchObject({code:'23514'});
+  });
+
+  it('apply_reconcile_result touches only the member\'s published ok rows; a quarantined left gets latest_result on its open items; review and lineage items change no visibility; invalid results write nothing',async()=>{
+   const {iss,b,r0,r}=await published();const {x}=await sibling('5');
+   const pair=newPair();const cy=await cycle(pair,[{issuer_id:iss,expected:6}]);const w=await batch(`reconcile.${pair}`);const fence=(await claimM(pair,cy,iss,w))!;
+   expect(await fails(apply(fence,res('k0',{action:'quarantine_left',left_fact_id:x})))).toMatchObject({message:'invalid_result',code:'22023'});   // another issuer's row
+   expect(await fails(apply(fence,res('k0',{action:'quarantine_left'})))).toMatchObject({message:'invalid_result'});      // left_fact_id required
+   expect(await fails(apply(fence,res('k0',{action:'review_item'})))).toMatchObject({message:'invalid_result'});          // item required
+   expect(await fails(apply(fence,res('k0',{left_value:'1e5x'})))).toMatchObject({message:'invalid_result'});
+   expect(await resultRows(pair)).toEqual([]);
+   const run2=await begin(iss,b);const g=await filing(run2);const [st]=await stage(run2,[{filing_id:g.id,concept:'net_income',value:'3'}]);
+   expect(await apply(fence,res('k1',{action:'quarantine_left',left_fact_id:st}))).toMatchObject({quarantined:0,item_id:null,materialize:null});   // staged: recorded only
+   expect(await status(st)).toBe('staged');
+   // quarantine_left with passed=true or a non-compared outcome on an ok left row → result row only (接口对齐记录 #5)
+   expect(await apply(fence,res('k1p',{action:'quarantine_left',left_fact_id:r,passed:true,right_value:'100',abs_diff:'0',rel_diff:'0'}))).toMatchObject({quarantined:0,item_id:null,materialize:null});
+   expect(await apply(fence,res('k1m',{action:'quarantine_left',left_fact_id:r,outcome:'right_missing',right_value:null,abs_diff:null,rel_diff:null}))).toMatchObject({quarantined:0,item_id:null,materialize:null});
+   expect(await status(r)).toBe('ok');
+   const q1=await apply(fence,res('k2',{action:'quarantine_left',left_fact_id:r0}));
+   const q2=await apply(fence,res('k3',{left_fact_id:r0,passed:true,right_value:'100',abs_diff:'0',rel_diff:'0',inputs_hash:'h9'}));
+   expect(q2).toMatchObject({quarantined:0,item_id:q1.item_id,materialize:null});
+   expect((await q(`select detail->'latest_result' lr from public.dq_quarantine where id=$1`,[q1.item_id]))[0].lr).toMatchObject({passed:true,reconciliation_id:q2.reconciliation_id,inputs_hash:'h9'});
+   const rv=await apply(fence,res('k4',{action:'review_item',item:{natural_key:`${pair}:k4`,payload:{fact_ids:[r],left_value:'100',right_value:'99'}}}));
+   const ln=await apply(fence,res('k5',{action:'lineage_item',item:{natural_key:`${iss}:revenue:2023-10-01:2023-12-31:consolidated:USD:2024-02-01`,payload:{fact_ids:[r],values:[]}}}));
+   expect(await q(`select reason_code,status,dataset from public.dq_quarantine where id=any($1::uuid[]) order by reason_code`,[[rv.item_id,ln.item_id]])).toEqual([{reason_code:'lineage_conflict',status:'open',dataset:'facts.us'},{reason_code:'reconcile_review',status:'open',dataset:'facts.us'}]);
+   expect(await status(r)).toBe('ok');
+   const kinds=await q(`select natural_key,kind,outcome from public.dq_reconciliations where pair=$1 order by natural_key`,[pair]);
+   expect(kinds.map(k=>k.natural_key)).toEqual(['k1','k1m','k1p','k2','k3','k4','k5']);
+  });
+
+  it('apply_reconcile_result holds the member scope lock: a concurrent publish_sync_run waits for it',async()=>{
+   const {iss,b,r}=await published();const pair=newPair();const cy=await cycle(pair,[{issuer_id:iss,expected:1}]);
+   const w=await batch(`reconcile.${pair}`);const fence=(await claimM(pair,cy,iss,w))!;
+   const run2=await begin(iss,b);
+   await inTx(admin,async({c,pid,commit})=>{
+    await c.query(`select public.apply_reconcile_result($1::jsonb,$2::jsonb)`,[JSON.stringify(fence),JSON.stringify(res('k1',{action:'quarantine_left',left_fact_id:r}))]);
+    const p=publish(run2,[]);p.catch(()=>{});
+    await stillBlockedBehind(admin,pid,p);
+    await commit();
+    expect(await p).toBe(0);
+   });
+   expect(await rev(iss)).toBe(3);
+  });
+
+  it('T2: keys committed before the lease is lost stay valid; the successor reuses them; the old worker is fenced out; counts are not doubled',async()=>{
+   const {iss,r}=await published();const pair=newPair();const cy=await cycle(pair,[{issuer_id:iss,expected:2}]);
+   const wa=await batch(`reconcile.${pair}`),wb=await batch(`reconcile.${pair}`);
+   const fa=(await claimM(pair,cy,iss,wa))!;
+   const k1=await apply(fa,res('k1',{action:'quarantine_left',left_fact_id:r}));
+   await expire(pair,cy,iss);
+   const fb=(await claimM(pair,cy,iss,wb))!;expect(fb).toMatchObject({attempt:2,batch_id:wb});
+   expect(await fails(apply(fa,res('k2',{passed:true})))).toMatchObject({message:'fence_failed'});
+   expect(await fails(complete(fa))).toMatchObject({message:'fence_failed'});
+   expect(await apply(fb,res('k1',{action:'quarantine_left',left_fact_id:r}))).toMatchObject({reused:true,reconciliation_id:k1.reconciliation_id,item_id:k1.item_id});
+   await apply(fb,res('k2',{passed:true,right_value:'100',abs_diff:'0',rel_diff:'0'}));
+   expect(await complete(fb)).toEqual({compared_passed:1,compared_failed:1,not_compared:0});
+   expect((await resultRows(pair)).map(x=>[x.natural_key,x.attempt])).toEqual([['k1',1],['k2',2]]);
+   expect(await q(`select count(*)::int n from public.dq_quarantine where natural_key=$1`,[`${pair}:k1:${r}`])).toEqual([{n:1}]);
+  });
+
+  it('a crash between apply_reconcile_result and materialisation leaves the item open with hook pending (picked up by --pending-hooks, Task 11)',async()=>{
+   const {iss,r}=await published();const pair=newPair();const cy=await cycle(pair,[{issuer_id:iss,expected:1}]);
+   const w=await batch(`reconcile.${pair}`);const fence=(await claimM(pair,cy,iss,w))!;
+   const a=await apply(fence,res('k1',{action:'quarantine_left',left_fact_id:r}));   // committed; the "runner" dies here
+   expect(await q(`select status,detail->'hook'->>'state' hook,detail->>'issuer_id' issuer from public.dq_quarantine where id=$1`,[a.item_id])).toEqual([{status:'open',hook:'pending',issuer:iss}]);
+  });
+
+  it('reconcile_mismatch items only ever name the fence issuer/market rows: payload.fact_ids never spans a lineage (restore_reconciled promotes one issuer)',async()=>{
+   const {iss,r}=await published();const {x}=await sibling('100');
+   const pair=newPair();const cy=await cycle(pair,[{issuer_id:iss,expected:2}]);
+   const w=await batch(`reconcile.${pair}`);const fence=(await claimM(pair,cy,iss,w))!;
+   // a row of another issuer (even one in the same lineage) is refused for the fence member
+   expect(await fails(apply(fence,res('kx',{action:'quarantine_left',left_fact_id:x})))).toMatchObject({message:'invalid_result'});
+   // the same row in the right market of the wrong fence is refused as well
+   const a=await apply(fence,res('k1',{action:'quarantine_left',left_fact_id:r}));
+   const [row]=await q(`select payload,detail from public.dq_quarantine where id=$1`,[a.item_id]);
+   expect(row.payload.fact_ids).toEqual([r]);
+   const owners=await q(`select distinct issuer_id,market from public.financial_facts where fact_id=any($1::uuid[])`,[row.payload.fact_ids]);
+   expect(owners).toEqual([{issuer_id:iss,market:'US'}]);
+   expect(row.detail).toMatchObject({issuer_id:iss,market:'US'});
+   // every reconcile_mismatch item of the pair satisfies the invariant
+   const bad=await q(`select q.id from public.dq_quarantine q where q.reason_code='reconcile_mismatch' and q.detail->>'pair'=$1
+     and exists(select 1 from jsonb_array_elements_text(q.payload->'fact_ids') i join public.financial_facts f on f.fact_id=i::uuid where f.issuer_id<>$2 or f.market<>'US')`,[pair,iss]);
+   expect(bad).toEqual([]);
+  });
+
+  // ---- open_reconcile_cycle (section 13, plan audit Q2): atomic creation, per-entry consumption, the lock shared with set_merge
+  type Opened={created:boolean;cycle:Record<string,any>;transferred:unknown[]};
+  const openC=(c:Pool|PoolClient,pair:string,id:string,members:unknown[],pending:unknown[])=>
+   c.query(`select public.open_reconcile_cycle($1,$2,now(),$3::jsonb,$4::jsonb) v`,[pair,id,JSON.stringify(members),JSON.stringify(pending)]).then(r=>r.rows[0].v as Opened);
+  const LINEAGE='facts.lineage_same_day';
+  const lid=()=>`${LINEAGE}-${randomUUID().slice(0,8)}`;
+  /** inside a rolled-back transaction only: no running lineage cycle from another suite, plus a "latest" row set_merge writes to */
+  const lineageStage=async(c:PoolClient,pending:unknown[])=>{
+   await c.query(`update public.dq_reconcile_cycles set status='complete', finished_at=now() where pair=$1 and status='running'`,[LINEAGE]);
+   const id=`${LINEAGE}-old-${randomUUID().slice(0,8)}`;
+   await c.query(`insert into public.dq_reconcile_cycles(pair,cycle_id,started_at,finished_at,members,status,expected_total,detail) values($1,$2,now()+interval '100 years',now()+interval '100 years','[]','complete',0,$3::jsonb)`,[LINEAGE,id,JSON.stringify({pending_members:pending})]);
+   return id;
+  };
+  const pendingIn=async(c:Pool|PoolClient,pair:string,id:string)=>(await c.query(`select detail from public.dq_reconcile_cycles where pair=$1 and cycle_id=$2`,[pair,id])).rows[0].detail as Record<string,unknown>;
+
+  it('open_reconcile_cycle: cycle row and every cursor in one call; only the listed pending entries are consumed; a running cycle is returned unchanged',async()=>{
+   const t1=await issuer(),t2=await issuer();
+   const e1={issuer_id:t1,market:'US',source:randomUUID()},e2={issuer_id:t2,market:'US',source:randomUUID()};
+   await inRolledBackTx(admin,async c=>{
+    const old=await lineageStage(c,[e1,e2]);
+    const id=lid();
+    const out=await openC(c,LINEAGE,id,[{issuer_id:t1,market:'US',expected_keys:[{naturalKey:'k1',locator:{}},{naturalKey:'k2',locator:{}}]}],[e1]);
+    expect(out).toMatchObject({created:true,transferred:[e1],cycle:{cycle_id:id,status:'running',expected_total:2,detail:{pending_merged_from:[old],pending_transferred:[e1]}}});
+    expect((await c.query(`select issuer_id,market,expected,state from public.dq_reconcile_cursor where pair=$1 and cycle_id=$2`,[LINEAGE,id])).rows).toEqual([{issuer_id:t1,market:'US',expected:2,state:'pending'}]);
+    expect(await pendingIn(c,LINEAGE,old)).toEqual({pending_members:[e2],pending_consumed_by:id});    // e2 was not listed: it waits for the next cycle
+    const again=await openC(c,LINEAGE,lid(),[{issuer_id:t2,market:'US',expected_keys:[]}],[e2]);
+    expect(again).toMatchObject({created:false,transferred:[],cycle:{cycle_id:id}});
+    expect((await pendingIn(c,LINEAGE,old)).pending_members).toEqual([e2]);                        // nothing consumed by the loser
+   });
+  });
+
+  it('open_reconcile_cycle: a merge registered after the runner snapshot survives creation — neither overwritten nor consumed (stale-snapshot interleaving)',async()=>{
+   const s=await issuer(),t=await issuer(),t0=await issuer(),by=await user();
+   const e0={issuer_id:t0,market:'US',source:randomUUID()};
+   await inRolledBackTx(admin,async c=>{
+    const old=await lineageStage(c,[e0]);
+    const snapshot=[e0];                                                          // the runner read pending_members here
+    await c.query(`select public.set_merge($1,$2,$3)`,[s,t,by]);                  // a merge lands before the function runs
+    const out=await openC(c,LINEAGE,lid(),[{issuer_id:t0,market:'US',expected_keys:[]}],snapshot);
+    expect(out.transferred).toEqual([e0]);
+    expect((out.cycle.members as {issuer_id:string}[]).map(m=>m.issuer_id)).toEqual([t0]);
+    expect((await pendingIn(c,LINEAGE,old)).pending_members).toEqual([{issuer_id:t,market:'CN',source:s},{issuer_id:t,market:'US',source:s}]);
+   });
+  });
+
+  it('open_reconcile_cycle and set_merge serialise on the cycle lock, both ways',async()=>{
+   const s1=await issuer(),t1=await issuer(),s2=await issuer(),t2=await issuer(),by=await user();
+   let waiter:Promise<void>|undefined;
+   await inTx(admin,async({c,pid})=>{
+    await c.query(`select public.set_merge($1,$2,$3)`,[s1,t1,by]);                // holds the cycle lock until this transaction ends
+    waiter=inRolledBackTx(admin,async c2=>{await openC(c2,LINEAGE,lid(),[],[]);},1);waiter.catch(()=>{});
+    await stillBlockedBehind(admin,pid,waiter);
+   });                                                                              // rolled back: the merge never happened, the waiter proceeds
+   await expect(waiter).resolves.toBeUndefined();
+   let merger:Promise<unknown>|undefined;
+   await inTx(admin,async({c,pid})=>{
+    await openC(c,LINEAGE,lid(),[],[]);                                             // takes the cycle lock (created or not)
+    merger=one(`select public.set_merge($1,$2,$3) v`,[s2,t2,by]);merger.catch(()=>{});
+    await stillBlockedBehind(admin,pid,merger);
+   });                                                                              // rolled back: no cycle was created
+   await expect(merger).resolves.toEqual({repointed:0});
+  });
+
+  it('lock order (plan audit R1): a creator whose cycle contains the merge target and a concurrent set_merge into that target both complete, in either order — no deadlock',async()=>{
+   const s1=await issuer(),t1=await issuer(),s2=await issuer(),t2=await issuer(),by=await user();
+   const lockSql=`select pg_advisory_xact_lock(hashtext('dq_reconcile_cycle:'||$1))`;
+   // (a) the creator already holds the cycle lock and has not inserted its cursors yet; the merge arrives now.
+   //     Fixed order: the merge waits on the advisory lock holding NO scope/issuer row; the creator's cursor
+   //     insert for t1 (KEY SHARE on issuers via the FK) does not wait; both finish. Old order: the merge held
+   //     t1 FOR UPDATE while waiting → 40P01 on one side.
+   let merger:Promise<unknown>|undefined;let opened:Opened|undefined;
+   await inTx(admin,async({c,pid})=>{
+    await lineageStage(c,[]);
+    await c.query(lockSql,[LINEAGE]);                                              // what open_reconcile_cycle takes first
+    merger=inRolledBackTx(admin,async c2=>{
+     expect((await c2.query(`select public.set_merge($1,$2,$3) v`,[s1,t1,by])).rows[0].v).toEqual({repointed:0});
+    },1);merger.catch(()=>{});
+    await stillBlockedBehind(admin,pid,merger);
+    expect(await q(`select distinct l.locktype from pg_locks l join pg_stat_activity a on a.pid=l.pid where not l.granted and $1 = any(pg_blocking_pids(a.pid))`,[pid])).toEqual([{locktype:'advisory'}]);   // the merge waits on the advisory lock, not on a row
+    opened=await openC(c,LINEAGE,lid(),[{issuer_id:t1,market:'US',expected_keys:[{naturalKey:'k',locator:{}}]}],[]);   // re-entrant advisory lock; cursor insert on t1
+   });                                                                              // rolled back
+   expect(opened).toMatchObject({created:true});
+   await expect(merger).resolves.toBeUndefined();
+   // (b) the merge into t2 runs first and holds every lock; the creator for a cycle containing t2 waits, then finishes.
+   let creator:Promise<void>|undefined;
+   await inTx(admin,async({c,pid})=>{
+    expect((await c.query(`select public.set_merge($1,$2,$3) v`,[s2,t2,by])).rows[0].v).toEqual({repointed:0});
+    creator=inRolledBackTx(admin,async c2=>{
+     await lineageStage(c2,[]);
+     expect(await openC(c2,LINEAGE,lid(),[{issuer_id:t2,market:'US',expected_keys:[{naturalKey:'k',locator:{}}]}],[])).toMatchObject({created:true});
+    },1);creator.catch(()=>{});
+    await stillBlockedBehind(admin,pid,creator);
+   });                                                                              // rolled back: the creator proceeds
+   await expect(creator).resolves.toBeUndefined();
+  });
+
+  it('open_reconcile_cycle: invalid members are refused; a creator that dies before commit leaves pending, cycle and cursors untouched, and the rerun consumes once (crash recovery)',async()=>{
+   const t1=await issuer();const pair=newPair();
+   const e1={issuer_id:t1,market:'US',source:randomUUID()};
+   expect(await fails(openC(admin,pair,`${pair}-x`,[],[e1]))).toMatchObject({message:'invalid_members',code:'22023'});              // a pending entry without its resolved member
+   expect(await fails(openC(admin,pair,`${pair}-x`,[{issuer_id:t1,market:'US',expected_keys:[]},{issuer_id:t1,market:'US',expected_keys:[]}],[]))).toMatchObject({message:'invalid_members'});
+   expect(await fails(openC(admin,pair,`${pair}-x`,[{issuer_id:t1,market:'US'}],[]))).toMatchObject({message:'invalid_members'});   // keys not resolved
+   const old=`${pair}-old`;
+   await q(`insert into public.dq_reconcile_cycles(pair,cycle_id,started_at,finished_at,members,status,expected_total,detail) values($1,$2,now(),now(),'[]','complete',0,$3::jsonb)`,[pair,old,JSON.stringify({pending_members:[e1]})]);
+   await inRolledBackTx(admin,async c=>{await openC(c,pair,`${pair}-dead`,[{issuer_id:t1,market:'US',expected_keys:[]}],[e1]);});   // the creator dies before commit
+   expect(await q(`select cycle_id from public.dq_reconcile_cycles where pair=$1`,[pair])).toEqual([{cycle_id:old}]);
+   expect(await q(`select count(*)::int n from public.dq_reconcile_cursor where pair=$1`,[pair])).toEqual([{n:0}]);
+   expect((await pendingIn(admin,pair,old)).pending_members).toEqual([e1]);
+   expect(await openC(admin,pair,`${pair}-live`,[{issuer_id:t1,market:'US',expected_keys:[{naturalKey:'k',locator:{}}]}],[e1])).toMatchObject({created:true,transferred:[e1]});
+   expect((await pendingIn(admin,pair,old)).pending_members).toEqual([]);
+   expect(await q(`select count(*)::int n from public.dq_reconcile_cursor where pair=$1 and cycle_id=$2`,[pair,`${pair}-live`])).toEqual([{n:1}]);
+  });
+
+  it('grants: cursor functions, apply_reconcile_result and open_reconcile_cycle are service_role only; the fence helper is closed to every role; replays',async()=>{
+   const fn=(role:string,sig:string)=>one(`select has_function_privilege($1,$2,'EXECUTE') v`,[role,sig]);
+   for(const sig of ['public.claim_reconcile_member(text,text,uuid,text,uuid)','public.complete_reconcile_member(jsonb)','public.fail_reconcile_member(jsonb,text)','public.apply_reconcile_result(jsonb,jsonb)','public.open_reconcile_cycle(text,text,timestamptz,jsonb,jsonb)']){
+    for(const role of ['anon','authenticated'])expect({sig,role,ok:await fn(role,sig)}).toEqual({sig,role,ok:false});
+    expect(await fn('service_role',sig)).toBe(true);
+   }
+   for(const role of ['anon','authenticated','service_role'])expect(await fn(role,'public.reconcile_fence_lock(jsonb)')).toBe(false);
+   await expect(replayMigration(admin,sql())).resolves.toBeUndefined();
+  },60000);
+ });
 });
diff --git a/src/lib/supabase/database.types.ts b/src/lib/supabase/database.types.ts
index 1c51f95..5f88477 100644
--- a/src/lib/supabase/database.types.ts
+++ b/src/lib/supabase/database.types.ts
@@ -14,6 +14,7 @@
 // + 20261107090000_identifiers_and_dq.sql (issuer_securities window methods; issuer_identifier_claims claim/1 columns;
 //   dq_reconciliations pair/kind/outcome/detail/cycle columns; dq_reconcile_cycles, dq_reconcile_cursor, dq_calendar_passes,
 //   dq_calendar_pass_members, issuer_filer_categories, dq_filing_expectations, issuer_filing_profiles; dq_freshness weekly)
+// + 20261107091000_facts_extensions.sql (filings.accepted_at/acceptance_source, financial_metrics.based_on_lineage; functions only otherwise)
 // Regenerate with: npm run supabase:types (after supabase link)
 
 export type Market = 'A' | 'HK' | 'US' | 'JP' | 'KR' | 'TW';
@@ -630,6 +631,8 @@ export interface Filing {
   link_attempts: number;
   mapping_gen: number;
   run_id: string;
+  accepted_at: string | null;
+  acceptance_source: 'sec_submissions' | null;
   created_at: string;
 }
 export interface FinancialFact {
@@ -670,6 +673,7 @@ export interface FinancialMetric {
   formula_version: string;
   inputs: Array<{ fact_id: string; concept: string; filing_id: string; available_date: string }>;
   based_on_rev: number;
+  based_on_lineage: Array<{ issuer_id: string; state_rev: number }>;
   as_of: string;
   computed_at: string;
 }
diff --git a/supabase/migrations.lock.json b/supabase/migrations.lock.json
index 68e04b1..0b7bb82 100644
--- a/supabase/migrations.lock.json
+++ b/supabase/migrations.lock.json
@@ -204,6 +204,10 @@
     {
       "file": "20261107090000_identifiers_and_dq.sql",
       "sha256": "6457ecff0c498b03d10665e9f56c811b026d9ef3cabee58b8017c32ff3799ee0"
+    },
+    {
+      "file": "20261107091000_facts_extensions.sql",
+      "sha256": "36372e7cc2db0f6e4de844b3d9298aededac1e907cf67e091c0c8c8d75498598"
     }
   ]
 }
./node_modules/dsh-trade-strategy-evaluator/agents
./node_modules/playwright/lib/agents
./node_modules/playwright/lib/agents/generateAgents.js
./node_modules/caniuse-lite/dist/unpacker/agents.js
./node_modules/caniuse-lite/data/agents.js
./.claude/agents
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
  if v_locked <> cardinality(v_members) then raise exception 'scope_missing' using errcode = 'P0001'; end if;
  -- a merged / dissolved issuer is no longer a materialisation target: the caller re-resolves T(i) and retries
  if not exists (select 1 from public.issuers where issuer_id = p_issuer and status = 'active') then raise exception 'stale_computation' using errcode = 'P0001'; end if;
  select array_agg(l.i order by l.i) into v_lineage
  from (select p_issuer as i union select issuer_id from public.issuers where merged_into = p_issuer) l;
  if v_lineage is distinct from v_members then raise exception 'stale_computation' using errcode = 'P0001'; end if;
  if exists (select 1 from jsonb_array_elements(v_norm) e
             join public.fact_sync_scope s on s.issuer_id = (e ->> 'issuer_id')::uuid and s.market = p_market
             where s.state_rev <> (e ->> 'state_rev')::bigint) then
    raise exception 'stale_computation' using errcode = 'P0001';
  end if;
  select state_rev into v_rev from public.fact_sync_scope where issuer_id = p_issuer and market = p_market;
  delete from public.financial_metrics where issuer_id = p_issuer and market = p_market;
  insert into public.financial_metrics (issuer_id, market, metric, period_start, period_end, duration, value, unit, input_unit, basis, formula_version, inputs, based_on_rev, based_on_lineage, as_of)
  select p_issuer, p_market, x ->> 'metric', (x ->> 'period_start')::date, (x ->> 'period_end')::date, x ->> 'duration', (x ->> 'value')::numeric,
         x ->> 'unit', x ->> 'input_unit', x ->> 'basis', x ->> 'formula_version', coalesce(x -> 'inputs', '[]'::jsonb), v_rev, v_norm, (x ->> 'as_of')::date
  from jsonb_array_elements(p_rows) x;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.replace_financial_metrics_lineage(uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.replace_financial_metrics_lineage(uuid, text, jsonb, jsonb) to service_role;

-- Plan-2 signature kept: a one-member vector [{p_issuer, p_based_on_rev}]. No scope row keeps the
-- plan-2 answer for a non-zero rev (stale_computation; "no scope row ⇒ rev 0"); rev 0 without a
-- scope row is scope_missing (the lineage function must lock the row).
create or replace function public.replace_financial_metrics(p_issuer uuid, p_market text, p_based_on_rev bigint, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_rows' using errcode = '22023'; end if;
  if p_based_on_rev is null then raise exception 'stale_computation' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.fact_sync_scope where issuer_id = p_issuer and market = p_market) then
    if p_based_on_rev <> 0 then raise exception 'stale_computation' using errcode = 'P0001'; end if;
    raise exception 'scope_missing' using errcode = 'P0001';
  end if;
  if p_based_on_rev < 0 then raise exception 'stale_computation' using errcode = 'P0001'; end if;
  return public.replace_financial_metrics_lineage(p_issuer, p_market, jsonb_build_array(jsonb_build_object('issuer_id', p_issuer, 'state_rev', p_based_on_rev)), p_rows);
end $$;
revoke execute on function public.replace_financial_metrics(uuid, text, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.replace_financial_metrics(uuid, text, bigint, jsonb) to service_role;

-- ---------------------------------------------------------------- 4. evidence reader (spec §3.2 read_filing_facts, S2/T1)
-- Every generation and status of one filing (p_include_non_ok = false: ok only), no window
-- computation; binding to the active generation / published runs is the caller's job.
create or replace function public.read_filing_facts(p_filing uuid, p_include_non_ok boolean)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('rows', coalesce(jsonb_agg((to_jsonb(f) - 'value') || jsonb_build_object('value', f.value_text, 'run_status', r.status)
           order by f.mapping_gen, f.concept collate "C", f.period_end, f.period_start nulls first, f.unit collate "C", f.created_at, f.fact_id), '[]'::jsonb))
  from public.financial_facts f
  join public.fact_sync_runs r on r.run_id = f.run_id

exec
/bin/zsh -lc "cat package.json | grep -A15 scripts; rg 'FinancialMetric|\\bFiling\\b' src/lib -n | head -55; rg -n 'dq_reconciliations|drc_|dq_reconcile_cursor' supabase/migrations/20261107090000_identifiers_and_dq.sql; rg -n 'unique.*|create unique' supabase/migrations/* | grep -E 'quarantine|dq_' | head -25; ls docs/*/*3*; find . -maxdepth 3 -name '*CLAUDE*' -o -name '*AGENTS*'" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
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
src/lib/supabase/database.types.ts:616:export interface Filing {
src/lib/supabase/database.types.ts:661:export interface FinancialMetric {
src/lib/supabase/database.types.ts:916:      filings: { Row: Filing; Insert: Partial<Filing>; Update: Partial<Filing> };
src/lib/supabase/database.types.ts:918:      financial_metrics: { Row: FinancialMetric; Insert: Partial<FinancialMetric>; Update: Partial<FinancialMetric> };
src/lib/research/wiki/source-pack.test.ts:13:const src=(n:number,entity_ids:string[],over:Record<string,unknown>={})=>{const raw=`Filing ${n} text.`;return {id:S(n),source_type:'FILING',title:`Filing ${n}`,url:null,author:null,published_at:null,ingested_at:'2026-09-01T00:00:00.000Z',raw_text:raw,content_hash:sha(raw),trust_level:'HIGH',entity_ids,metadata:{},event_time:null,available_at:`2026-09-${String(n).padStart(2,'0')}T00:00:00.000Z`,source_version:'1',cluster_id:null,cluster_first:null,origin_type:null,market:'US',permission:'public',...over};};
src/lib/research/wiki/source-pack.test.ts:49:  expect(pack.sources[0]).toMatchObject({source_version:'1',source_type:'FILING',trust_level:'HIGH',market:'US',content_hash:sha('Filing 1 text.'),raw_text:'Filing 1 text.'});
4:-- the claim/1 review queue (op, target_key, detail, resolution columns); dq_reconciliations gains
69:-- ---------------------------------------------------------------- dq_reconciliations: pairs, kinds, outcomes, cycle rows (§3.1, T2)
71:  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'dq_reconciliations' and column_name = 'pair') then
72:    alter table public.dq_reconciliations
82:    update public.dq_reconciliations set outcome = 'legacy';
85:alter table public.dq_reconciliations
86:  drop constraint if exists dq_reconciliations_pair_check,
87:  drop constraint if exists dq_reconciliations_kind_check,
88:  drop constraint if exists dq_reconciliations_outcome_check,
89:  drop constraint if exists dq_reconciliations_detail_object,
90:  drop constraint if exists dq_reconciliations_market_check,
91:  drop constraint if exists dq_reconciliations_attempt_check,
92:  drop constraint if exists dq_reconciliations_cycle_cols,
93:  drop constraint if exists dq_reconciliations_numeric_sides,
94:  drop constraint if exists dq_reconciliations_nonnumeric_sides,
95:  add constraint dq_reconciliations_pair_check check (length(pair) between 1 and 64),
96:  add constraint dq_reconciliations_kind_check check (kind in ('numeric','text','date')),
97:  add constraint dq_reconciliations_outcome_check check (outcome in ('compared','left_missing','left_unlinked','left_ambiguous','right_missing','unsupported','right_ambiguous','incomplete_gold','legacy')),
98:  add constraint dq_reconciliations_detail_object check (jsonb_typeof(detail) = 'object'),
99:  add constraint dq_reconciliations_market_check check (market is null or market in ('US','CN')),
100:  add constraint dq_reconciliations_attempt_check check (attempt is null or attempt >= 1),
102:  add constraint dq_reconciliations_cycle_cols check ((cycle_id is null) = (issuer_id is null) and (cycle_id is null) = (market is null) and (cycle_id is null) = (attempt is null)),
103:  add constraint dq_reconciliations_numeric_sides check (kind <> 'numeric' or outcome <> 'compared' or (left_value is not null and right_value is not null)),
105:  add constraint dq_reconciliations_nonnumeric_sides check (kind = 'numeric' or (left_value is null and right_value is null and rel_diff is null and abs_diff is null));
106:create index if not exists dq_reconciliations_pair_created_idx on public.dq_reconciliations(pair, created_at desc);
108:create unique index if not exists dq_reconciliations_cycle_key on public.dq_reconciliations(pair, cycle_id, natural_key) where cycle_id is not null;
136:create table if not exists public.dq_reconcile_cursor (
152:  constraint dq_reconcile_cursor_cycle_fkey foreign key (pair, cycle_id) references public.dq_reconcile_cycles(pair, cycle_id) on delete restrict,
153:  constraint drc_expected_nonneg check (expected >= 0),
154:  constraint drc_counters_nonneg check ((compared_passed is null or compared_passed >= 0) and (compared_failed is null or compared_failed >= 0) and (not_compared is null or not_compared >= 0)),
156:  constraint drc_done_accounted check (state <> 'done' or (compared_passed is not null and compared_failed is not null and not_compared is not null and compared_passed + compared_failed + not_compared = expected))
158:create index if not exists dq_reconcile_cursor_state_idx on public.dq_reconcile_cursor(pair, cycle_id, state);
252:  foreach t in array array['dq_reconcile_cycles','dq_reconcile_cursor','dq_calendar_passes','dq_calendar_pass_members','issuer_filer_categories','dq_filing_expectations','issuer_filing_profiles'] loop
260:grant select, insert on public.dq_reconcile_cursor to service_role;
supabase/migrations/20261105090000_dq_foundation.sql:52:create unique index if not exists dq_quarantine_open_key_uniq on public.dq_quarantine(dataset, table_name, natural_key, reason_code) where status = 'open';
supabase/migrations/20261107090000_identifiers_and_dq.sql:108:create unique index if not exists dq_reconciliations_cycle_key on public.dq_reconciliations(pair, cycle_id, natural_key) where cycle_id is not null;
supabase/migrations/20261107090000_identifiers_and_dq.sql:134:create unique index if not exists dq_reconcile_cycles_running_uniq on public.dq_reconcile_cycles(pair) where status = 'running';
supabase/migrations/20261107090000_identifiers_and_dq.sql:172:create unique index if not exists dq_calendar_passes_open_uniq on public.dq_calendar_passes(market) where finished_at is null;
docs/product/03_USER_JOURNEY_AND_USE_CASES.md
docs/product/13_RUNBOOK.md
docs/product/23_EXTERNAL_INTELLIGENCE_SKILLS.md
docs/research-os/2026-07-04-phase3-playbook.md

docs/audits/2026-11-04-data-foundation-3:
01-codex-round1.md
02-codex-round2.md
03-disposition.md
04-codex-round3.md
05-codex-round4.md
06-codex-round5.md
07-codex-round6.md

docs/audits/2026-11-05-data-foundation-3:
codex
implementation-log.md
raw
verification.md

docs/audits/2026-11-05-data-foundation-3-plan:
01-codex-plan-audit-round1.md
02-round1-disposition.md
03-codex-plan-audit-round2.md
04-codex-plan-audit-round3.md
05-codex-plan-audit-round4.md

docs/handoffs/alpha-e3b:
README.md
./docs/CLAUDE_EDGEONE_OSBORNALPHA_HANDOFF.md

exec
/bin/zsh -lc "rg -n 'apply_reconcile_result|expected_keys|latest_result|review_item' docs/spec* docs/plans* 2>/dev/null | head -65; sed -n '600,710p' supabase/migrations/20261107091000_facts_extensions.sql; sed -n '110,160p' supabase/migrations/20261107090000_identifiers_and_dq.sql; rg -n 'pending_members|for update' supabase/migrations/20261107091000_facts_extensions.sql | head -40; find /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude -maxdepth 2 -name AGENTS.md -o -name AGENTS.override.md" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
zsh:1: no matches found: docs/spec*
-- true and latest_result.inputs_hash must equal p_inputs_hash_now (computed by the caller from the
-- CURRENT inputs with the same function the runner uses), else not_passing. The item is closed
-- FIRST (it no longer blocks its own rows; other open items still do), then payload.fact_ids go
-- through fact_promote_rows; state_rev + 1; hook = pending. skipped lists every member not
-- promoted: missing / not_quarantined / ineligible.
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
revoke execute on function public.restore_reconciled(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.restore_reconciled(uuid, uuid, text, uuid) to service_role;

-- ---------------------------------------------------------------- 10. lineage verdict (spec §3.2 resolve_lineage_conflict, §4.4)
-- natural_key = <T>:<concept>:<period_start>:<period_end>:<consolidation>:<unit>:<available_date>.
-- The current lineage of T (T ∪ merged_into = T) is computed, every member's scope row locked in
-- (issuer_id, market) order (missing → scope_missing), the lineage re-read under the locks
-- (changed → lineage_changed); payload rows must belong to it (else lineage_changed); p_keep must
-- be a payload member (else invalid_choice). Every OTHER visible ok row of (K, date) in the lineage
-- — re-queried under the locks, not only the payload — becomes quarantined; afterwards exactly one
-- visible ok row must remain (else unresolved, rolled back). Verdict persisted
-- (chosen_fact_ids, quarantined_fact_ids, issuer_id = T, market, hook pending); every member
-- state_rev + 1.
create or replace function public.resolve_lineage_conflict(p_item uuid, p_keep uuid, p_batch uuid, p_resolved_by uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare q public.dq_quarantine; v_parts text[]; v_t uuid; v_market text; v_lineage uuid[]; v_now uuid[]; v_locked int; v_ids uuid[];
        v_concept text; v_ps date; v_pe date; v_cons text; v_unit text; v_date date; v_q uuid[]; v_ok int;
begin
  if p_resolved_by is null then raise exception 'invalid_resolver' using errcode = '22023'; end if;
  select * into q from public.dq_quarantine where id = p_item;
  if not found or q.status <> 'open' then raise exception 'item_not_open' using errcode = 'P0001'; end if;
  if q.table_name <> 'financial_facts' or q.reason_code <> 'lineage_conflict' or q.dataset not in ('facts.us','facts.cn') then
    raise exception 'invalid_choice' using errcode = '22023';
  end if;
  if not exists (select 1 from public.ingest_batches where batch_id = p_batch and status = 'running') then raise exception 'batch_mismatch' using errcode = 'P0001'; end if;
  v_parts := string_to_array(q.natural_key, ':');
  if cardinality(v_parts) <> 7 then raise exception 'invalid_choice' using errcode = '22023'; end if;
  begin
    v_t := v_parts[1]::uuid; v_concept := v_parts[2]; v_ps := nullif(v_parts[3], '')::date; v_pe := v_parts[4]::date;
    v_cons := v_parts[5]; v_unit := v_parts[6]; v_date := v_parts[7]::date;
  exception when others then
    raise exception 'invalid_choice' using errcode = '22023';
  end;
  v_market := case q.dataset when 'facts.us' then 'US' else 'CN' end;
  v_lineage := array(select l.i from (select v_t as i union select issuer_id from public.issuers where merged_into = v_t) l order by l.i);
  select count(*) into v_locked from (
    select 1 from public.fact_sync_scope s where s.issuer_id = any(v_lineage) and s.market = v_market order by s.issuer_id for update) x;
  if v_locked <> cardinality(v_lineage) then raise exception 'scope_missing' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.issuers i where i.issuer_id = v_t and i.status = 'active') then raise exception 'target_not_active' using errcode = 'P0001'; end if;
  v_now := array(select l.i from (select v_t as i union select issuer_id from public.issuers where merged_into = v_t) l order by l.i);
  if v_now <> v_lineage then raise exception 'lineage_changed' using errcode = 'P0001'; end if;
  select * into q from public.dq_quarantine where id = p_item for update;
  if q.status <> 'open' then raise exception 'item_not_open' using errcode = 'P0001'; end if;
  v_ids := public.fact_item_members(q.payload);
  if p_keep is null or not (p_keep = any(v_ids)) then raise exception 'invalid_choice' using errcode = '22023'; end if;
  if exists (select 1 from public.financial_facts f where f.fact_id = any(v_ids) and not (f.issuer_id = any(v_lineage))) then
    raise exception 'lineage_changed' using errcode = 'P0001';
  end if;
  with hit as (
    update public.financial_facts f set status = 'quarantined'
    from public.filings g
    where g.filing_id = f.filing_id and g.mapping_gen = f.mapping_gen
      and f.issuer_id = any(v_lineage) and f.market = v_market and f.status = 'ok' and f.fact_id <> p_keep
      and f.concept = v_concept and f.period_start is not distinct from v_ps and f.period_end = v_pe
      and f.consolidation = v_cons and f.unit = v_unit and f.available_date = v_date
    returning f.fact_id)
  select coalesce(array_agg(hit.fact_id order by hit.fact_id), '{}'::uuid[]) into v_q from hit;
  select count(*) into v_ok
  from public.financial_facts f join public.filings g on g.filing_id = f.filing_id and g.mapping_gen = f.mapping_gen
  where f.issuer_id = any(v_lineage) and f.market = v_market and f.status = 'ok'
    and f.concept = v_concept and f.period_start is not distinct from v_ps and f.period_end = v_pe
    and f.consolidation = v_cons and f.unit = v_unit and f.available_date = v_date;
  if v_ok <> 1 then raise exception 'unresolved' using errcode = 'P0001'; end if;
  update public.dq_quarantine
-- ---------------------------------------------------------------- dq_freshness: weekly cadence (§3.1)
alter table public.dq_freshness
  drop constraint if exists dq_freshness_expected_cadence_check,
  add constraint dq_freshness_expected_cadence_check check (expected_cadence in ('daily','weekly','monthly','quarterly','event'));

-- ---------------------------------------------------------------- reconcile cycles and cursor (§3.1, §5.5)
create table if not exists public.dq_reconcile_cycles (
  pair                text not null check (length(pair) between 1 and 64),
  cycle_id            text not null check (length(cycle_id) between 1 and 64),
  started_at          timestamptz not null,
  finished_at         timestamptz,
  members             jsonb not null,                                -- frozen [{issuer_id, market, expected_keys}]
  status              text not null check (status in ('running','complete','complete_with_gaps')),
  expected_total      int not null check (expected_total >= 0),
  compared_passed     int not null default 0 check (compared_passed >= 0),
  compared_failed     int not null default 0 check (compared_failed >= 0),
  not_compared        int not null default 0 check (not_compared >= 0),
  exec_failed_members int not null default 0 check (exec_failed_members >= 0),
  detail              jsonb not null default '{}',                   -- pending_members (set_merge, migration two) and settlement notes
  primary key (pair, cycle_id),
  constraint dq_reconcile_cycles_members_array check (jsonb_typeof(members) = 'array'),
  constraint dq_reconcile_cycles_detail_object check (jsonb_typeof(detail) = 'object'),
  constraint dq_reconcile_cycles_finished_iff_terminal check ((finished_at is null) = (status = 'running'))
);
create unique index if not exists dq_reconcile_cycles_running_uniq on public.dq_reconcile_cycles(pair) where status = 'running';

create table if not exists public.dq_reconcile_cursor (
  pair             text not null,
  cycle_id         text not null,
  issuer_id        uuid not null references public.issuers(issuer_id) on delete restrict,
  market           text not null check (market in ('US','CN')),
  expected         int not null,                                     -- this member's expected key count (frozen)
  state            text not null default 'pending' check (state in ('pending','claimed','done','failed')),
  claimed_by       uuid references public.ingest_batches(batch_id) on delete set null,
  claim_until      timestamptz,
  attempts         int not null default 0 check (attempts >= 0),
  last_error       text,
  done_at          timestamptz,
  compared_passed  int,
  compared_failed  int,
  not_compared     int,
  primary key (pair, cycle_id, issuer_id, market),
  constraint dq_reconcile_cursor_cycle_fkey foreign key (pair, cycle_id) references public.dq_reconcile_cycles(pair, cycle_id) on delete restrict,
  constraint drc_expected_nonneg check (expected >= 0),
  constraint drc_counters_nonneg check ((compared_passed is null or compared_passed >= 0) and (compared_failed is null or compared_failed >= 0) and (not_compared is null or not_compared >= 0)),
  -- S5: a done row has all three counters, non-null, summing to expected; settlement never coalesces.
  constraint drc_done_accounted check (state <> 'done' or (compared_passed is not null and compared_failed is not null and not_compared is not null and compared_passed + compared_failed + not_compared = expected))
);
create index if not exists dq_reconcile_cursor_state_idx on public.dq_reconcile_cursor(pair, cycle_id, state);

-- ---------------------------------------------------------------- calendar passes (§3.1, §6.2, T3/U1)
77:  select * into g from public.filings where filing_id = p_filing for update;
130:    select 1 from public.fact_sync_scope s where s.issuer_id = any(v_members) and s.market = p_market order by s.issuer_id for update) x;
287:  perform 1 from public.fact_sync_scope s where s.issuer_id = any(p_ids) order by s.issuer_id, s.market for update;
318:  perform 1 from public.issuers where issuer_id = any(v_set) order by issuer_id for update;
335:  set detail = jsonb_set(c.detail, '{pending_members}',
336:        coalesce(case when jsonb_typeof(c.detail -> 'pending_members') = 'array' then c.detail -> 'pending_members' end, '[]'::jsonb)
339:                     where not (coalesce(case when jsonb_typeof(c.detail -> 'pending_members') = 'array' then c.detail -> 'pending_members' end, '[]'::jsonb)
381:  perform 1 from public.issuers where issuer_id = any(v_set) order by issuer_id for update;
544:    select 1 from public.fact_sync_scope s where s.issuer_id = any(v_lineage) and s.market = g.market order by s.issuer_id for update) x;
555:  select * into q from public.dq_quarantine where id = p_item for update;
621:    perform 1 from public.fact_sync_scope where issuer_id = v_issuer and market = v_market for update;
623:  select * into q from public.dq_quarantine where id = p_item for update;
683:    select 1 from public.fact_sync_scope s where s.issuer_id = any(v_lineage) and s.market = v_market order by s.issuer_id for update) x;
688:  select * into q from public.dq_quarantine where id = p_item for update;
739:    perform 1 from public.fact_sync_scope where issuer_id = v_issuer and market = v_market for update;
742:  select * into q from public.dq_quarantine where id = p_item for update;
795:  for update;
915:    perform 1 from public.fact_sync_scope where issuer_id = c.issuer_id and market = c.market for update;
926:    for update;
987:--  p_pending entries leave every cycle row's detail.pending_members (an entry registered after the
1026:           where c.pair = p_pair and c.cycle_id <> p_cycle_id and jsonb_typeof(c.detail -> 'pending_members') = 'array'
1027:           order by c.cycle_id for update loop
1031:    from jsonb_array_elements(r.detail -> 'pending_members') e;
1034:      set detail = jsonb_set(r.detail, '{pending_members}', v_keep) || jsonb_build_object('pending_consumed_by', p_cycle_id)

exec
/bin/zsh -lc "rg -n 'apply_reconcile_result|expected_keys' docs --glob '*.md' | head -55; ./node_modules/.bin/tsc --noEmit --incremental false 2>&1 | head -35" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 6293ms:
docs/audits/2026-11-05-data-foundation-3-plan/01-codex-plan-audit-round1.md:6:| P4 | P1 | Tasks 8c, 11 and 14b, hook persistence | **Hook completion can overwrite a newer reconciliation verdict.** `plan:15333–15334` and `plan:12435–12439` replace `detail` after a separate read. Concurrent hook recovery and `apply_reconcile_result` can restore an older `latest_result`, including replacing a newer failure with an older pass. The inherited pattern at landed `src/lib/dq/facts-resolver.ts:48–51` is not safe for these newly concurrent writers; `src/lib/db/table-client.ts:103` replaces the supplied JSON value. | Add an atomic RPC that updates only `detail.hook` under the item lock; similarly patch `audit_written` without replacing detail. Add an interleaving test proving hook writes preserve the newest `latest_result` and resolution fields. |
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:42:supabase/migrations/20261107091000_facts_extensions.sql     filings 受理列、financial_metrics.based_on_lineage、fact_promote_rows 谓词、read_filing_facts、read_facts_lineage（read_facts 改为包装）、replace_financial_metrics_lineage（旧函数改包装）、set_filing_acceptance、adopt_candidate、restore_reconciled、resolve_lineage_conflict、apply_reconcile_result、游标三函数、set_merge、set_dissolved（Task 8a/8b/8c）
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:181:export interface OpenCycleInput{pair:CyclePairId;cycleId:string;startedAt:string;members:{issuer_id:string;market:Market;expected_keys:{naturalKey:string;locator:Record<string,unknown>}[]}[];pending:PendingMember[]}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:209://  |'invalid_result'（apply_reconcile_result 的结果形状错误；Task 9a 补）
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:261:| `apply_reconcile_result`（2） | `(p_fence jsonb, p_result jsonb) returns jsonb` → `{reused, reconciliation_id, item_id, quarantined, materialize}`；`quarantine_left` 只要求 `left_fact_id`，隔离条件见 C3 末段 | `fence_failed` `invalid_result` |
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:316:| §3.2 迁移二全部函数与扩展 | Task 8a（受理列、谱系读取/物化、拓扑函数）、8b（谓词、采用、恢复、谱系裁决）、8c（游标、`apply_reconcile_result`、锁定） |
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:366:| 5 | `quarantine_left` 的语义：原稿 SQL 对 `passed=true`/未比较的 `quarantine_left` 报 `invalid_result`，而运行器对绑定键一律发 `quarantine_left`（D2） | `apply_reconcile_result` 只要求 `quarantine_left` 带 `left_fact_id`；**只在** `outcome='compared' && passed=false && 左侧 ok 且运行 published` 时隔离；左侧已隔离 → 只更新引用它的 open `reconcile_mismatch` 项的 `detail.latest_result`；其余只写结果行。运行器 `actionFor`（14a/14b）原稿即此规则 | Task 8c 函数注释、入口校验、隔离分支条件、Step 1 用例（新增 `k1p`/`k1m`，结果行断言）；Task 9a 内存实现 `validResult` 与分支；骨架 C3 末段、C5 行 |
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:394:| 33 | `apply_reconcile_result` 约定（C11） | `reconcile_mismatch` 项 `natural_key=<pair>:<natural_key>:<left_fact_id>`（Part D `mismatchItemKey` 一致）；`dataset='reconcile.'\|\|pair`；结果行 `detail` 合并 `{item_id, inputs_hash}`；项 `batch_id`=围栏批次；`review_item`/`lineage_item` 同键 open 项复用 | Task 8c（原稿）；Task 14a（原稿） |
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:1052:-- The accepted-result marker: at most one row per cycle and key (apply_reconcile_result reuses it).
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:1066:  members             jsonb not null,                                -- frozen [{issuer_id, market, expected_keys}]
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:1292:  members: { issuer_id: string; market: FactMarket; expected_keys: unknown[] }[];
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:1875:   // a newer verdict (apply_reconcile_result / restore_reconciled) holds the item row
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:2405:-- replaces ONLY the named key, so a concurrent apply_reconcile_result / restore_reconciled / adoption that
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:8777:规格条目：§3.2（迁移二全部，含 T1/T2/T5/T6/T7/T8/T11/U2/U3 规定修法）、§4.4（读时谱系、物化目标、读接口、`/metrics` 向量守卫）、§4.5（受理时刻、E7）、§4.6（候选选定、分派、钩子、`--pending-hooks`）、§5.5–§5.6 中由 SQL 承担的部分（游标三函数、`apply_reconcile_result`、`restore_reconciled`）、§8 相关行、§9.2 迁移二全部条目、§1.1 E7/E8。
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:8779:任务拆分（报告给指挥）：Task 8 → **8a**（filings 受理列、`based_on_lineage`、读取函数、谱系物化函数、拓扑函数）/ **8b**（`fact_promote_rows` 谓词、`adopt_candidate`、`restore_reconciled`、`resolve_lineage_conflict`）/ **8c**（游标三函数、`apply_reconcile_result`、类型、锁）；Task 9 → **9a**（类型与三实现）/ **9b**（共享契约用例）。Task 10、11、12 不拆。
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:8786:| `src/lib/facts/types.ts` | `FactsDbErrorCode` 增 `'invalid_result'` | `apply_reconcile_result` 的结果形状错误（C5 表有、C4 列表漏） |
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:8815:11. **`apply_reconcile_result` 的若干约定**：`reconcile_mismatch` 项 natural_key 由 SQL 计算为 `<pair>:<natural_key>:<left_fact_id>`（`quarantine_left` 时忽略 `item`）；`dq_reconciliations.dataset = 'reconcile.' || pair`；结果行 `detail` 合并 `{item_id, inputs_hash}`；项的 `batch_id` = 围栏批次；`review_item`/`lineage_item` 同自然键 open 项复用。 **→ 已裁决：接口对齐记录 #33。**
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:8842:// apply_reconcile_result (T2), grants. Every test owns its issuers (and its `test.<hex>` pair), so
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:9217:--  (8c) reconcile cursor claim/complete/fail and apply_reconcile_result.
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10193:### Task 8c: 迁移二（三）—— 游标三函数、`apply_reconcile_result`、`open_reconcile_cycle`（计划审计 Q2）、类型、锁
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10206: describe('8c: reconcile cursor and apply_reconcile_result',()=>{
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10211:    [pair,id,status==='running'?null:new Date().toISOString(),JSON.stringify(members.map(m=>({issuer_id:m.issuer_id,market:m.market??'US',expected_keys:m.expected}))),status,members.reduce((n,m)=>n+m.expected,0)]);
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10217:  const apply=(fence:FenceJson,result:Record<string,unknown>)=>one(`select public.apply_reconcile_result($1::jsonb,$2::jsonb) v`,[JSON.stringify(fence),JSON.stringify(result)]);
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10259:  it('apply_reconcile_result: result row + mismatch item + quarantine + hook pending in one transaction; the same key again is reused; complete derives the counts (member_incomplete before); drc_done_accounted (S5)',async()=>{
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10285:  it('apply_reconcile_result touches only the member\'s published ok rows; a quarantined left gets latest_result on its open items; review and lineage items change no visibility; invalid results write nothing',async()=>{
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10312:  it('apply_reconcile_result holds the member scope lock: a concurrent publish_sync_run waits for it',async()=>{
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10317:    await c.query(`select public.apply_reconcile_result($1::jsonb,$2::jsonb)`,[JSON.stringify(fence),JSON.stringify(res('k1',{action:'quarantine_left',left_fact_id:r}))]);
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10342:  it('a crash between apply_reconcile_result and materialisation leaves the item open with hook pending (picked up by --pending-hooks, Task 11)',async()=>{
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10370:    const out=await openC(c,LINEAGE,id,[{issuer_id:t1,market:'US',expected_keys:[{naturalKey:'k1',locator:{}},{naturalKey:'k2',locator:{}}]}],[e1]);
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10374:    const again=await openC(c,LINEAGE,lid(),[{issuer_id:t2,market:'US',expected_keys:[]}],[e2]);
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10387:    const out=await openC(c,LINEAGE,lid(),[{issuer_id:t0,market:'US',expected_keys:[]}],snapshot);
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10428:    opened=await openC(c,LINEAGE,lid(),[{issuer_id:t1,market:'US',expected_keys:[{naturalKey:'k',locator:{}}]}],[]);   // re-entrant advisory lock; cursor insert on t1
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10438:     expect(await openC(c2,LINEAGE,lid(),[{issuer_id:t2,market:'US',expected_keys:[{naturalKey:'k',locator:{}}]}],[])).toMatchObject({created:true});
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10449:   expect(await fails(openC(admin,pair,`${pair}-x`,[{issuer_id:t1,market:'US',expected_keys:[]},{issuer_id:t1,market:'US',expected_keys:[]}],[]))).toMatchObject({message:'invalid_members'});
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10453:   await inRolledBackTx(admin,async c=>{await openC(c,pair,`${pair}-dead`,[{issuer_id:t1,market:'US',expected_keys:[]}],[e1]);});   // the creator dies before commit
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10457:   expect(await openC(admin,pair,`${pair}-live`,[{issuer_id:t1,market:'US',expected_keys:[{naturalKey:'k',locator:{}}]}],[e1])).toMatchObject({created:true,transferred:[e1]});
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10462:  it('grants: cursor functions, apply_reconcile_result and open_reconcile_cycle are service_role only; the fence helper is closed to every role; replays',async()=>{
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10464:   for(const sig of ['public.claim_reconcile_member(text,text,uuid,text,uuid)','public.complete_reconcile_member(jsonb)','public.fail_reconcile_member(jsonb,text)','public.apply_reconcile_result(jsonb,jsonb)','public.open_reconcile_cycle(text,text,timestamptz,jsonb,jsonb)']){
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10562:-- ---------------------------------------------------------------- 12. per-key atomic reconciliation write (spec §3.2 apply_reconcile_result, §5.6, T2, U2)
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10581:create or replace function public.apply_reconcile_result(p_fence jsonb, p_result jsonb)
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10683:revoke execute on function public.apply_reconcile_result(jsonb, jsonb) from public, anon, authenticated;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10684:grant execute on function public.apply_reconcile_result(jsonb, jsonb) to service_role;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10690:--  else p_members [{issuer_id, market, expected_keys[]}] (distinct (issuer, market), keys resolved by the
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10712:                   or jsonb_typeof(m -> 'expected_keys') is distinct from 'array')
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10723:            (select coalesce(sum(jsonb_array_length(m -> 'expected_keys')), 0) from jsonb_array_elements(p_members) m), '{}'::jsonb);
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10730:  select p_pair, p_cycle_id, (m ->> 'issuer_id')::uuid, m ->> 'market', jsonb_array_length(m -> 'expected_keys')
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10800:git commit -m "feat(dq): migration two part 3 — reconcile cursor, apply_reconcile_result, lock (F3-4)
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10835:   if(fn==='apply_reconcile_result')return {data:{reused:false,reconciliation_id:'r1',item_id:null,quarantined:1,materialize:{issuer_id:I1,market:'US'}}};
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10862:  expect(calls.at(-1)).toEqual({fn:'apply_reconcile_result',args:{p_fence:fence,p_result:result}});
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10866:  const open={pair:'facts.lineage_same_day' as const,cycleId:'c',startedAt:'2026-11-05T00:00:00.000Z',members:[{issuer_id:I1,market:'US' as const,expected_keys:[]}],pending:[{issuer_id:I1,market:'US' as const,source:I2}]};
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:10978:export interface OpenCycleInput{pair:CyclePairId;cycleId:string;startedAt:string;members:{issuer_id:string;market:Market;expected_keys:{naturalKey:string;locator:Record<string,unknown>}[]}[];pending:PendingMember[]}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:11249:  async applyReconcileResult(fence,result){return applyOutcomeFromJson(await call<unknown>('apply_reconcile_result',{p_fence:fenceArgs(fence),p_result:result}));},
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:11296:  async applyReconcileResult(fence,result){return applyOutcomeFromJson(await fn<unknown>('public.apply_reconcile_result($1::jsonb,$2::jsonb)',[JSON.stringify(fenceArgs(fence)),JSON.stringify(result)]));},
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:11679:   if(memberKeys.size!==i.members.length||i.members.some(m=>typeof m.issuer_id!=='string'||(m.market!=='US'&&m.market!=='CN')||!Array.isArray(m.expected_keys))
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:11682:    expected_total:i.members.reduce((n,m)=>n+m.expected_keys.length,0),compared_passed:0,compared_failed:0,not_compared:0,exec_failed_members:0,detail:{}};

exec
/bin/zsh -lc "sed -n '300,405p' supabase/migrations/20261107091000_facts_extensions.sql; sed -n '1,120p' src/lib/dq/dq-extensions.integration.test.ts; git rev-parse HEAD; ls docs/superpowers/specs | tail -5; cat tsconfig.json" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
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
end $$;
revoke execute on function public.fact_set_dissolved_body(uuid, uuid) from public, anon, authenticated, service_role;

create or replace function public.set_dissolved(p_issuer uuid, p_resolved_by uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_prev text := current_setting('entities.allow_topology_write', true);
begin
  perform set_config('entities.allow_topology_write', 'on', true);
  begin
    perform public.fact_set_dissolved_body(p_issuer, p_resolved_by);
  exception when others then
    perform set_config('entities.allow_topology_write', coalesce(v_prev, ''), true);
    raise;
  end;
  perform set_config('entities.allow_topology_write', coalesce(v_prev, ''), true);
// src/lib/dq/dq-extensions.integration.test.ts
// F3-4 (plan 3 spec §3.2, §9.2): migration 20261107091000 on real PostgreSQL — filings acceptance
// columns and set_filing_acceptance, financial_metrics.based_on_lineage (upgrade + replay),
// read_filing_facts, read_facts_lineage (and read_facts as a wrapper with identical output),
// replace_financial_metrics_lineage (and its wrapper), set_merge / set_dissolved with the topology
// guard (S1, R3), fact_promote_rows predicates on every promotion entry (T6), adopt_candidate (T1,
// T5, U3), restore_reconciled (R1), resolve_lineage_conflict, the reconcile cursor and
// apply_reconcile_result (T2), grants. Every test owns its issuers (and its `test.<hex>` pair), so
// suites running in parallel on the shared database never meet.
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import type {PoolClient} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';

const enabled=!!process.env.S4_TEST_STATE;
const MIGRATION='supabase/migrations/20261107091000_facts_extensions.sql';
const PLAN2='supabase/migrations/20261106090000_financial_facts.sql';

// Same replay policy as facts.integration.test.ts (not exported there).
const RETRYABLE=new Set(['55P03','40P01']);
async function replayMigration(pool:Pool,sql:string,attempts=10):Promise<void>{
 for(let attempt=1;;attempt++){
  const c=await pool.connect();
  try{await c.query(`begin; set local lock_timeout='3s'; set local deadlock_timeout='50ms'; select pg_advisory_xact_lock(hashtext('test:migration-replay'));\n${sql}\n;commit;`);return;}
  catch(e){
   await c.query('rollback').catch(()=>{});
   const code=(e as {code?:string}).code;
   if(attempt>=attempts||!code||!RETRYABLE.has(code))throw e;
   await new Promise(r=>setTimeout(r,250*attempt+Math.floor(Math.random()*250)));
  }finally{c.release();}
 }
}
/** body inside one transaction that is ALWAYS rolled back; retried on lock timeout / deadlock (body must be repeatable). */
async function inRolledBackTx(pool:Pool,body:(c:PoolClient)=>Promise<void>,attempts=10):Promise<void>{
 for(let attempt=1;;attempt++){
  const c=await pool.connect();
  try{await c.query(`begin; set local lock_timeout='3s'`);await body(c);return;}
  catch(e){
   const code=(e as {code?:string}).code;
   if(attempt>=attempts||!code||!RETRYABLE.has(code))throw e;
   await new Promise(r=>setTimeout(r,250*attempt+Math.floor(Math.random()*250)));
  }finally{await c.query('rollback').catch(()=>{});c.release();}
 }
}
interface Tx{c:PoolClient;pid:number;commit():Promise<void>}
async function inTx(pool:Pool,body:(tx:Tx)=>Promise<void>):Promise<void>{
 const c=await pool.connect();let open=false;let broken:Error|undefined;
 try{
  await c.query('begin');open=true;
  const pid=Number((await c.query('select pg_backend_pid() p')).rows[0].p);
  await body({c,pid,commit:async()=>{await c.query('commit');open=false;}});
 }finally{
  if(open)await c.query('rollback').catch(e=>{broken=e as Error;});
  c.release(broken);
 }
}
async function stillBlockedBehind(pool:Pool,pid:number,p:Promise<unknown>):Promise<void>{
 let settled=false;p.then(()=>{settled=true;},()=>{settled=true;});
 for(const deadline=Date.now()+3000;;){
  const n=Number((await pool.query(`select count(*)::int n from pg_stat_activity where $1 = any(pg_blocking_pids(pid))`,[pid])).rows[0].n);
  if(n>=1)break;
  if(settled||Date.now()>deadline)throw new Error(`no backend blocked behind pid ${pid} (settled=${settled})`);
  await new Promise(r=>setTimeout(r,20));
 }
 expect(settled).toBe(false);
}
type PgErr={message:string;code?:string};
const fails=(p:Promise<unknown>)=>p.then(()=>{throw new Error('expected rejection');},e=>e as PgErr);
type FactSpec={filing_id:string;fact_id?:string;concept?:string;period_start?:string|null;period_end?:string;duration?:string;value?:string;unit?:string;available_date?:string;mapping_version?:string};
type Envelope={state_rev:number;rows:Record<string,unknown>[];truncated:boolean;row_count:number};
type LineageEnvelope={state_revs:{issuer_id:string;state_rev:number}[];lineage:string[];rows:Record<string,unknown>[];conflicts:{key:Record<string,string|null>;available_date:string;fact_ids:string[]}[];truncated:boolean;row_count:number};

describe.skipIf(!enabled)('F3-4 facts extensions migration on real PostgreSQL',()=>{
 let admin:Pool;
 const q=async(text:string,values:unknown[]=[])=>(await admin.query(text,values)).rows as Record<string,any>[];
 const one=async(text:string,values:unknown[]=[])=>(await q(text,values))[0]?.v;
 const issuer=async(name='ZZ Ext Test')=>{const id=randomUUID();await q(`insert into public.issuers(issuer_id,canonical_name_en) values($1,$2)`,[id,name]);return id;};
 const user=async()=>{const id=randomUUID();await q(`insert into auth.users(id,email) values($1,$2)`,[id,`${id}@ext.test`]);return id;};
 const batch=async(dataset='facts.us',finished=false)=>{
  const id=randomUUID();await q(`insert into public.ingest_batches(batch_id,producer,dataset) values($1,'ext-test',$2)`,[id,dataset]);
  if(finished)await q(`update public.ingest_batches set status='success',finished_at=now() where batch_id=$1`,[id]);
  return id;
 };
 const scope=(iss:string,market='US')=>one(`select public.reconcile_fact_sync_scope($1,$2::jsonb) v`,[market,JSON.stringify([{issuer_id:iss,reasons:['test'],priority:10,fetch_key:'0000000001'}])]);
 const claim=(iss:string,b:string,market='US')=>one(`select public.claim_fact_sync_lease($1,$2,$3,600) v`,[iss,market,b]);
 const begin=(iss:string,b:string,gen=1,market='US')=>one(`select public.begin_sync_run($1,$2,$3,$4) v`,[iss,market,b,gen]);
 const filing=async(run:string,o:{available?:string;sourceRef?:string;source?:string;origin?:string;form?:string}={})=>{
  const id=randomUUID();const sourceRef=o.sourceRef??`0000${randomUUID().slice(0,6)}-24-${randomUUID().slice(0,6)}`;
  const m=await one(`select public.stage_filings($1,$2::jsonb) v`,[run,JSON.stringify([{filing_id:id,source:o.source??'edgar',origin:o.origin??'sec',form_type:o.form??'10-K',fiscal_year:2023,fiscal_period:'FY',period_end:'2023-12-31',available_date:o.available??'2024-02-01',source_ref:sourceRef,url:null}])]);
  return {id:m[sourceRef] as string,sourceRef};
 };
 const factRow=(f:FactSpec)=>({fact_id:f.fact_id??randomUUID(),filing_id:f.filing_id,concept:f.concept??'revenue',source_concept:'Revenues',statement:f.concept==='total_assets'?'BS':'IS',period_start:f.period_start===undefined?'2023-10-01':f.period_start,period_end:f.period_end??'2023-12-31',duration:f.duration??'3M',value:f.value??'100',unit:f.unit??'USD',consolidation:'consolidated',available_date:f.available_date??'2024-02-01',mapping_version:f.mapping_version??'facts-map/1',raw_hash:'h'});
 const stage=async(run:string,rows:FactSpec[])=>{const full=rows.map(factRow);await one(`select public.stage_facts($1,$2::jsonb) v`,[run,JSON.stringify(full)]);return full.map(r=>r.fact_id);};
 const publish=(run:string,manifest:string[])=>one(`select public.publish_sync_run($1,$2::uuid[]) v`,[run,manifest]);
 const rev=(iss:string,market='US')=>one(`select public.fact_state_rev($1,$2) v`,[iss,market]).then(Number);
 const status=async(id:string)=>(await q(`select status from public.financial_facts where fact_id=$1`,[id]))[0]?.status??null;
 const merge=(s:string,t:string,by:string)=>one(`select public.set_merge($1,$2,$3) v`,[s,t,by]);
 const dissolve=(i:string,by:string)=>q(`select public.set_dissolved($1,$2)`,[i,by]);
 const lineageRead=async(issuers:string[],o:{concepts?:string[];asOf?:string;history?:boolean;limit?:number|null;nonOk?:boolean}={},client:Pool|PoolClient=admin)=>
  (await client.query(`select public.read_facts_lineage($1::uuid[],'US',$2::text[],$3::date,null,null,$4,$5,$6) v`,[issuers,o.concepts??['revenue','total_assets'],o.asOf??'2030-01-01',o.history??true,o.limit??null,o.nonOk??false])).rows[0].v as LineageEnvelope;
 const factsRead=async(iss:string,o:{concepts?:string[];asOf?:string;history?:boolean;limit?:number|null;nonOk?:boolean}={},client:Pool|PoolClient=admin)=>
  (await client.query(`select public.read_facts($1,'US',$2::text[],$3::date,null,null,$4,$5,$6) v`,[iss,o.concepts??['revenue','total_assets'],o.asOf??'2030-01-01',o.history??true,o.limit??null,o.nonOk??false])).rows[0].v as Envelope;
 const metric=(v:string,name='gross_margin')=>({metric:name,period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:v,unit:'ratio',input_unit:'USD',basis:'us_standard',formula_version:'facts-derive/1.0',inputs:[],as_of:'2024-03-01'});
 /** A leased US issuer with one published gen-1 run: f0 (2024-01-01) carries r0 = revenue 90, f (2024-02-01) carries r = revenue 100, same key. state_rev 1. */
 const published=async()=>{
  const iss=await issuer();const b=await batch();expect(await scope(iss)).toBe(1);expect(await claim(iss,b)).toBe(true);
  const run=await begin(iss,b);const f0=await filing(run,{available:'2024-01-01'});const f=await filing(run);
  const [r0]=await stage(run,[{filing_id:f0.id,value:'90',available_date:'2024-01-01'}]);
  const [r]=await stage(run,[{filing_id:f.id,value:'100'}]);
  expect(await publish(run,[f0.id,f.id])).toBe(2);
  return {iss,b,run,f0:f0.id,f:f.id,fRef:f.sourceRef,r0,r};
 };
 /** Another published issuer with one revenue row on 2024-02-01 for the same key (value given). */
 const sibling=async(value:string)=>{
  const iss=await issuer();const b=await batch();await scope(iss);await claim(iss,b);
  const run=await begin(iss,b);const f=await filing(run);const [x]=await stage(run,[{filing_id:f.id,value}]);await publish(run,[f.id]);
  return {iss,b,run,f:f.id,x};
 };
 const sql=()=>readFileSync(MIGRATION,'utf8');
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-GcDVHeDF' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-QLsQ3kKw' (errno=Operation not permitted)
1d6da0e46b79cab9fe881314bc9b6e7a9419d701
2026-11-04-evals-and-gold-sets-design.md
2026-11-04-foreign-research-design.md
2026-11-04-industry-research-design.md
2026-11-04-judgment-framework-design.md
2026-11-04-macro-workbench-design.md
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "legacy-demo", "supabase/functions"]
}

codex
No actionable regressions were identified in the commit. TypeScript checking passed; database integration tests were not run.
No actionable regressions were identified in the commit. TypeScript checking passed; database integration tests were not run.

OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b04e-0f88-7213-acf3-27bfb6d3d0c5
--------
user
commit bfbd6ac
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline bfbd6ac; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 278ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-Ldhwjvpv' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-PbqjvTmf' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/8a-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-BWL344Cm' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-MpbYEHBA' (errno=Operation not permitted)
bfbd6ac feat(facts): migration two part 1 — acceptance columns, based_on_lineage, lineage reads and writes, topology functions (F3-4)
 scripts/ci/research-checks.ts                      |   2 +-
 src/lib/dq/dq-extensions.integration.test.ts       | 352 ++++++++++++++++++
 src/lib/facts/facts.integration.test.ts            |   6 +-
 .../migrations/20261107091000_facts_extensions.sql | 403 +++++++++++++++++++++
 4 files changed, 761 insertions(+), 2 deletions(-)

exec
/bin/zsh -lc 'pwd; for p in /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do test ! -f "$p" || cat "$p"; done; ls -a | head -30; git show bfbd6ac -- supabase/migrations/20261107091000_facts_extensions.sql' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
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
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-58CQT3nJ' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-3XULt5oY' (errno=Operation not permitted)
commit bfbd6ac108fb0f823bbc6c191e375bbd82691a93
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 02:00:53 2026 -0800

    feat(facts): migration two part 1 — acceptance columns, based_on_lineage, lineage reads and writes, topology functions (F3-4)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/supabase/migrations/20261107091000_facts_extensions.sql b/supabase/migrations/20261107091000_facts_extensions.sql
new file mode 100644
index 0000000..8f140eb
--- /dev/null
+++ b/supabase/migrations/20261107091000_facts_extensions.sql
@@ -0,0 +1,403 @@
+-- supabase/migrations/20261107091000_facts_extensions.sql
+-- F3-4 (data foundation plan 3 spec §3.2, §4.4–§4.6, §5.5–§5.6): extensions of the plan-2 facts
+-- layer (20261106090000; that file is locked and is never edited).
+--  1. filings.accepted_at / acceptance_source: set once (null → value) and only by
+--     set_filing_acceptance (transaction-local facts.allow_acceptance_write); no role has a column
+--     grant; the plan-2 link columns and the function-only, increase-only mapping_gen are kept (T11).
+--  2. financial_metrics.based_on_lineage: added and backfilled ONCE (guarded block); never empty.
+--  3. replace_financial_metrics_lineage: locks every member scope row in (issuer_id, market) order,
+--     re-reads the lineage under the locks, compares the set and every state_rev; the plan-2
+--     replace_financial_metrics is a wrapper (signature unchanged).
+--  4. read_filing_facts: evidence reader, every generation and status of one filing (+ run status).
+--  5. read_facts_lineage: read_facts over a set of issuers; with more than one member, ok rows of
+--     the same (K, available_date) from different issuers with different values leave the current
+--     value and are listed in conflicts. read_facts is now a wrapper over it (identical output).
+--  6. set_merge / set_dissolved: the only topology writers. They switch the transaction-local
+--     entities.allow_topology_write that the migration-one trigger issuers_topology_guard requires,
+--     and restore the previous value on every path (normal return and exception handler, S1).
+--  (8b) fact_promote_rows predicates; adopt_candidate; restore_reconciled; resolve_lineage_conflict.
+--  (8c) reconcile cursor claim/complete/fail and apply_reconcile_result.
+-- Lock order everywhere: reconcile cursor row (fenced calls) → fact_sync_scope rows ordered by
+-- (issuer_id, market) → issuers rows → dq_quarantine rows → fact rows.
+-- Errors carry the code as the message: verdict / fence codes P0001; invalid_* 22023; triggers 23514.
+-- The hosted postgres role is not a superuser: functions keep the migration role as owner, set
+-- search_path = public and qualify every relation. Every function is followed by an explicit
+-- revoke (Supabase grants EXECUTE on new functions to anon/authenticated by default) and the grant
+-- it needs. Replayable: guarded add-column/backfill and constraints, create or replace.
+
+-- ---------------------------------------------------------------- 1. filings acceptance (spec §4.5, T11)
+do $$ begin
+  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'filings' and column_name = 'accepted_at') then
+    alter table public.filings add column accepted_at timestamptz, add column acceptance_source text;
+  end if;
+  if not exists (select 1 from pg_constraint where conrelid = 'public.filings'::regclass and conname = 'filings_acceptance_source_check') then
+    alter table public.filings add constraint filings_acceptance_source_check check (acceptance_source is null or acceptance_source in ('sec_submissions'));
+  end if;
+  if not exists (select 1 from pg_constraint where conrelid = 'public.filings'::regclass and conname = 'filings_acceptance_pair') then
+    alter table public.filings add constraint filings_acceptance_pair check ((accepted_at is null) = (acceptance_source is null));
+  end if;
+end $$;
+
+-- Same rules as plan 2 (document_ref/document_url/link_attempts/mapping_gen mutable, mapping_gen
+-- never decreases, delete only under facts.allow_filing_delete) plus: accepted_at/acceptance_source
+-- go null → value once, and only while set_filing_acceptance has facts.allow_acceptance_write on.
+create or replace function public.filings_limited_update() returns trigger
+language plpgsql set search_path = public as $$
+declare v_mutable text[] := array['document_ref','document_url','link_attempts','mapping_gen','accepted_at','acceptance_source'];
+begin
+  if tg_op = 'DELETE' then
+    if current_setting('facts.allow_filing_delete', true) is distinct from 'on' then
+      raise exception 'append_only: filings are never deleted (begin_sync_run prunes empty gen-0 filings of abandoned runs)' using errcode = '23514';
+    end if;
+    return old;
+  end if;
+  if (to_jsonb(new) - v_mutable) <> (to_jsonb(old) - v_mutable) then
+    raise exception 'append_only: filings allow document_ref, document_url, link_attempts, mapping_gen, accepted_at and acceptance_source changes only' using errcode = '23514';
+  end if;
+  if new.mapping_gen < old.mapping_gen then
+    raise exception 'append_only: filings.mapping_gen may only increase (% -> %)', old.mapping_gen, new.mapping_gen using errcode = '23514';
+  end if;
+  if (new.accepted_at, new.acceptance_source) is distinct from (old.accepted_at, old.acceptance_source) then
+    if old.accepted_at is not null or old.acceptance_source is not null then
+      raise exception 'append_only: filings.accepted_at is set once (null -> value)' using errcode = '23514';
+    end if;
+    if current_setting('facts.allow_acceptance_write', true) is distinct from 'on' then
+      raise exception 'append_only: filings.accepted_at is written only by set_filing_acceptance' using errcode = '23514';
+    end if;
+  end if;
+  return new;
+end $$;
+
+-- accepted_at is null → write, true; the same value and source → false; another value → acceptance_conflict.
+create or replace function public.set_filing_acceptance(p_filing uuid, p_accepted timestamptz, p_source text)
+returns boolean language plpgsql security definer set search_path = public as $$
+declare g public.filings;
+begin
+  if p_accepted is null or p_source is distinct from 'sec_submissions' then raise exception 'invalid_acceptance' using errcode = '22023'; end if;
+  select * into g from public.filings where filing_id = p_filing for update;
+  if not found then raise exception 'filing_not_found' using errcode = 'P0001'; end if;
+  if g.source <> 'edgar' then raise exception 'invalid_acceptance' using errcode = '22023'; end if;
+  if g.accepted_at is null then
+    perform set_config('facts.allow_acceptance_write', 'on', true);
+    update public.filings set accepted_at = p_accepted, acceptance_source = p_source where filing_id = p_filing;
+    perform set_config('facts.allow_acceptance_write', 'off', true);
+    return true;
+  end if;
+  if g.accepted_at = p_accepted and g.acceptance_source = p_source then return false; end if;
+  raise exception 'acceptance_conflict' using errcode = 'P0001';
+end $$;
+revoke execute on function public.set_filing_acceptance(uuid, timestamptz, text) from public, anon, authenticated;
+grant execute on function public.set_filing_acceptance(uuid, timestamptz, text) to service_role;
+
+-- ---------------------------------------------------------------- 2. financial_metrics.based_on_lineage (spec §3.2)
+do $$ begin
+  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'financial_metrics' and column_name = 'based_on_lineage') then
+    alter table public.financial_metrics add column based_on_lineage jsonb not null default '[]';
+    update public.financial_metrics set based_on_lineage = jsonb_build_array(jsonb_build_object('issuer_id', issuer_id, 'state_rev', based_on_rev));
+    alter table public.financial_metrics add constraint financial_metrics_lineage_nonempty
+      check (jsonb_typeof(based_on_lineage) = 'array' and jsonb_array_length(based_on_lineage) >= 1);
+  end if;
+end $$;
+
+-- ---------------------------------------------------------------- 3. lineage materialisation (spec §3.2, §4.4)
+-- p_based_on = [{issuer_id, state_rev}]: issuer ids unique and containing p_issuer. Every member's
+-- scope row is locked in (issuer_id, market) order (a missing one → scope_missing); under the
+-- locks the lineage {p_issuer} ∪ {merged_into = p_issuer} must equal the member set and every
+-- state_rev must match, else stale_computation. Stored vector: issuer_id ascending.
+create or replace function public.replace_financial_metrics_lineage(p_issuer uuid, p_market text, p_based_on jsonb, p_rows jsonb)
+returns int language plpgsql security definer set search_path = public as $$
+declare v_members uuid[]; v_norm jsonb; v_locked int; v_lineage uuid[]; v_rev bigint; n int;
+begin
+  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_rows' using errcode = '22023'; end if;
+  if p_issuer is null or p_market is null or p_market not in ('US','CN') then raise exception 'invalid_based_on' using errcode = '22023'; end if;
+  if p_based_on is null or jsonb_typeof(p_based_on) <> 'array' or jsonb_array_length(p_based_on) = 0
+     or exists (select 1 from jsonb_array_elements(p_based_on) e
+                where jsonb_typeof(e) <> 'object'
+                   or coalesce(jsonb_typeof(e -> 'issuer_id'), '') <> 'string'
+                   or coalesce(jsonb_typeof(e -> 'state_rev'), '') <> 'number'
+                   or (e ->> 'issuer_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
+                   or (e ->> 'state_rev') !~ '^[0-9]+$') then
+    raise exception 'invalid_based_on' using errcode = '22023';
+  end if;
+  select array_agg((e ->> 'issuer_id')::uuid order by (e ->> 'issuer_id')::uuid),
+         jsonb_agg(jsonb_build_object('issuer_id', (e ->> 'issuer_id')::uuid, 'state_rev', (e ->> 'state_rev')::bigint) order by (e ->> 'issuer_id')::uuid)
+    into v_members, v_norm
+  from jsonb_array_elements(p_based_on) e;
+  if cardinality(v_members) <> (select count(distinct m) from unnest(v_members) m) or not (p_issuer = any(v_members)) then
+    raise exception 'invalid_based_on' using errcode = '22023';
+  end if;
+  select count(*) into v_locked from (
+    select 1 from public.fact_sync_scope s where s.issuer_id = any(v_members) and s.market = p_market order by s.issuer_id for update) x;
+  if v_locked <> cardinality(v_members) then raise exception 'scope_missing' using errcode = 'P0001'; end if;
+  select array_agg(l.i order by l.i) into v_lineage
+  from (select p_issuer as i union select issuer_id from public.issuers where merged_into = p_issuer) l;
+  if v_lineage is distinct from v_members then raise exception 'stale_computation' using errcode = 'P0001'; end if;
+  if exists (select 1 from jsonb_array_elements(v_norm) e
+             join public.fact_sync_scope s on s.issuer_id = (e ->> 'issuer_id')::uuid and s.market = p_market
+             where s.state_rev <> (e ->> 'state_rev')::bigint) then
+    raise exception 'stale_computation' using errcode = 'P0001';
+  end if;
+  select state_rev into v_rev from public.fact_sync_scope where issuer_id = p_issuer and market = p_market;
+  delete from public.financial_metrics where issuer_id = p_issuer and market = p_market;
+  insert into public.financial_metrics (issuer_id, market, metric, period_start, period_end, duration, value, unit, input_unit, basis, formula_version, inputs, based_on_rev, based_on_lineage, as_of)
+  select p_issuer, p_market, x ->> 'metric', (x ->> 'period_start')::date, (x ->> 'period_end')::date, x ->> 'duration', (x ->> 'value')::numeric,
+         x ->> 'unit', x ->> 'input_unit', x ->> 'basis', x ->> 'formula_version', coalesce(x -> 'inputs', '[]'::jsonb), v_rev, v_norm, (x ->> 'as_of')::date
+  from jsonb_array_elements(p_rows) x;
+  get diagnostics n = row_count;
+  return n;
+end $$;
+revoke execute on function public.replace_financial_metrics_lineage(uuid, text, jsonb, jsonb) from public, anon, authenticated;
+grant execute on function public.replace_financial_metrics_lineage(uuid, text, jsonb, jsonb) to service_role;
+
+-- Plan-2 signature kept: a one-member vector [{p_issuer, p_based_on_rev}]. No scope row keeps the
+-- plan-2 answer for a non-zero rev (stale_computation; "no scope row ⇒ rev 0"); rev 0 without a
+-- scope row is scope_missing (the lineage function must lock the row).
+create or replace function public.replace_financial_metrics(p_issuer uuid, p_market text, p_based_on_rev bigint, p_rows jsonb)
+returns int language plpgsql security definer set search_path = public as $$
+begin
+  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_rows' using errcode = '22023'; end if;
+  if p_based_on_rev is null then raise exception 'stale_computation' using errcode = 'P0001'; end if;
+  if not exists (select 1 from public.fact_sync_scope where issuer_id = p_issuer and market = p_market) then
+    if p_based_on_rev <> 0 then raise exception 'stale_computation' using errcode = 'P0001'; end if;
+    raise exception 'scope_missing' using errcode = 'P0001';
+  end if;
+  if p_based_on_rev < 0 then raise exception 'stale_computation' using errcode = 'P0001'; end if;
+  return public.replace_financial_metrics_lineage(p_issuer, p_market, jsonb_build_array(jsonb_build_object('issuer_id', p_issuer, 'state_rev', p_based_on_rev)), p_rows);
+end $$;
+revoke execute on function public.replace_financial_metrics(uuid, text, bigint, jsonb) from public, anon, authenticated;
+grant execute on function public.replace_financial_metrics(uuid, text, bigint, jsonb) to service_role;
+
+-- ---------------------------------------------------------------- 4. evidence reader (spec §3.2 read_filing_facts, S2/T1)
+-- Every generation and status of one filing (p_include_non_ok = false: ok only), no window
+-- computation; binding to the active generation / published runs is the caller's job.
+create or replace function public.read_filing_facts(p_filing uuid, p_include_non_ok boolean)
+returns jsonb language sql stable security definer set search_path = public as $$
+  select jsonb_build_object('rows', coalesce(jsonb_agg((to_jsonb(f) - 'value') || jsonb_build_object('value', f.value_text, 'run_status', r.status)
+           order by f.mapping_gen, f.concept collate "C", f.period_end, f.period_start nulls first, f.unit collate "C", f.created_at, f.fact_id), '[]'::jsonb))
+  from public.financial_facts f
+  join public.fact_sync_runs r on r.run_id = f.run_id
+  where f.filing_id = p_filing and (f.status = 'ok' or coalesce(p_include_non_ok, false))
+$$;
+revoke execute on function public.read_filing_facts(uuid, boolean) from public, anon, authenticated;
+grant execute on function public.read_filing_facts(uuid, boolean) to service_role;
+
+-- ---------------------------------------------------------------- 5. lineage read (spec §3.2 read_facts_lineage, §4.4, T7)
+-- The plan-2 read_facts statement over a member set: partitions carry no issuer_id; only qualified
+-- ok rows take part in sequences; non-ok rows carry disclosure_seq null / false flags and appear only
+-- with p_history; active-generation filter, key ranking and limit, the 10,000-row cap (truncated ⇒
+-- no rows), decimal strings and RLS (security invoker) are unchanged. Cross-issuer suppression only
+-- with more than one member and only over ok rows: a (K, available_date) whose ok rows come from
+-- different issuers with different values takes no part in sequences and is listed in conflicts.
+-- Envelope {state_revs (issuer_id asc), lineage (asc), rows, conflicts, truncated, row_count}.
+create or replace function public.read_facts_lineage(
+  p_issuers uuid[], p_market text, p_concepts text[], p_as_of date,
+  p_from date, p_to date, p_history boolean, p_limit int, p_include_non_ok boolean default false)
+returns jsonb language sql stable security invoker set search_path = public as $$
+with members as (
+  select distinct u.m as issuer_id from unnest(coalesce(p_issuers, '{}'::uuid[])) as u(m) where u.m is not null
+), base as (
+  select f.fact_id, f.issuer_id, f.market, f.filing_id, f.run_id, f.concept, f.source_concept, f.statement,
+         f.period_start, f.period_end, f.duration, f.value, f.value_text, f.unit, f.consolidation, f.available_date,
+         f.mapping_gen, f.mapping_version, f.status, f.raw_hash, f.created_at
+  from public.financial_facts f
+  join public.filings g on g.filing_id = f.filing_id and g.mapping_gen = f.mapping_gen
+  where f.issuer_id in (select issuer_id from members) and f.market = p_market
+    and (p_concepts is null or f.concept = any(p_concepts))
+    and f.available_date <= p_as_of
+    and (p_from is null or f.period_end >= p_from)
+    and (p_to is null or f.period_end <= p_to)
+    and (f.status = 'ok' or coalesce(p_include_non_ok, false))
+), clash as (
+  select b.concept, b.period_start, b.period_end, b.consolidation, b.unit, b.available_date,
+         jsonb_agg(to_jsonb(b.fact_id::text) order by b.fact_id) as fact_ids
+  from base b
+  where b.status = 'ok' and (select count(*) from members) > 1
+  group by b.concept, b.period_start, b.period_end, b.consolidation, b.unit, b.available_date
+  having count(distinct b.issuer_id) > 1 and count(distinct b.value) > 1
+), eligible as (
+  select b.* from base b
+  where b.status <> 'ok' or not exists (
+    select 1 from clash c
+    where c.concept = b.concept and c.period_start is not distinct from b.period_start and c.period_end = b.period_end
+      and c.consolidation = b.consolidation and c.unit = b.unit and c.available_date = b.available_date)
+), seq as (
+  select b.*,
+         row_number() over w as disclosure_seq,
+         (row_number() over w = count(*) over (partition by b.concept, b.period_start, b.period_end, b.consolidation, b.unit)) as is_current,
+         (lag(b.value) over w is not null and b.value <> lag(b.value) over w) as is_revision
+  from eligible b
+  where b.status = 'ok'
+  window w as (partition by b.concept, b.period_start, b.period_end, b.consolidation, b.unit order by b.available_date, b.created_at, b.fact_id)
+  union all
+  select b.*, null::bigint, false, false from eligible b where b.status <> 'ok'
+), keyed as (
+  select s.*,
+         dense_rank() over (order by s.period_end desc, s.concept collate "C", s.period_start desc nulls last, s.consolidation collate "C", s.unit collate "C") as key_rank
+  from seq s
+), picked as (
+  select * from keyed k
+  where (coalesce(p_history, false) or k.is_current) and (p_limit is null or k.key_rank <= p_limit)
+), capped as (
+  select * from picked order by key_rank, available_date, created_at, fact_id limit 10001
+), counted as (
+  select count(*)::int as n from capped
+)
+select jsonb_build_object(
+  'state_revs', (select coalesce(jsonb_agg(jsonb_build_object('issuer_id', m.issuer_id, 'state_rev', public.fact_state_rev(m.issuer_id, p_market)) order by m.issuer_id), '[]'::jsonb) from members m),
+  'lineage', (select coalesce(jsonb_agg(to_jsonb(m.issuer_id::text) order by m.issuer_id), '[]'::jsonb) from members m),
+  'conflicts', (select coalesce(jsonb_agg(jsonb_build_object(
+                   'key', jsonb_build_object('concept', c.concept, 'period_start', c.period_start, 'period_end', c.period_end, 'consolidation', c.consolidation, 'unit', c.unit),
+                   'available_date', c.available_date, 'fact_ids', c.fact_ids)
+                 order by c.available_date, c.concept collate "C", c.period_end, c.period_start nulls first, c.consolidation collate "C", c.unit collate "C"), '[]'::jsonb) from clash c),
+  'truncated', (select n from counted) > 10000,
+  'row_count', case when (select n from counted) > 10000 then 0 else (select n from counted) end,
+  'rows', case when (select n from counted) > 10000 then '[]'::jsonb
+               else coalesce((select jsonb_agg((to_jsonb(c) - 'key_rank' - 'value') || jsonb_build_object('value', c.value_text) order by c.key_rank, c.available_date, c.created_at, c.fact_id) from capped c), '[]'::jsonb) end)
+$$;
+revoke execute on function public.read_facts_lineage(uuid[], text, text[], date, date, date, boolean, int, boolean) from public;
+grant execute on function public.read_facts_lineage(uuid[], text, text[], date, date, date, boolean, int, boolean) to anon, authenticated, service_role;
+
+-- Plan-2 signature and envelope {state_rev, rows, truncated, row_count}: one member, so the
+-- suppression never applies and the output is that of the plan-2 statement.
+create or replace function public.read_facts(
+  p_issuer uuid, p_market text, p_concepts text[], p_as_of date,
+  p_from date, p_to date, p_history boolean, p_limit int, p_include_non_ok boolean default false)
+returns jsonb language sql stable security invoker set search_path = public as $$
+  select jsonb_build_object(
+    'state_rev', coalesce(x.v -> 'state_revs' -> 0 -> 'state_rev', to_jsonb(public.fact_state_rev(p_issuer, p_market))),
+    'truncated', x.v -> 'truncated', 'row_count', x.v -> 'row_count', 'rows', x.v -> 'rows')
+  from (select public.read_facts_lineage(array[p_issuer], p_market, p_concepts, p_as_of, p_from, p_to, p_history, p_limit, p_include_non_ok) as v) x
+$$;
+revoke execute on function public.read_facts(uuid, text, text[], date, date, date, boolean, int, boolean) from public;
+grant execute on function public.read_facts(uuid, text, text[], date, date, date, boolean, int, boolean) to anon, authenticated, service_role;
+
+-- ---------------------------------------------------------------- 6. topology writers (spec §3.1 guard, §3.2 set_merge / set_dissolved, R3, T12)
+-- Placeholder scope rows (priority 0, reasons [], fetch_key 'topology' — the plan-2 check needs
+-- 1..32 characters) for every issuer of the set in both markets, never overwriting an existing row,
+-- then every scope row of the set locked in (issuer_id, market) order.
+create or replace function public.fact_topology_lock(p_ids uuid[])
+returns void language plpgsql security definer set search_path = public as $$
+begin
+  insert into public.fact_sync_scope (issuer_id, market, reasons, priority, fetch_key)
+  select i, mk.m, '[]'::jsonb, 0, 'topology'
+  from unnest(p_ids) as i cross join (values ('US'), ('CN')) as mk(m)
+  on conflict (issuer_id, market) do nothing;
+  perform 1 from public.fact_sync_scope s where s.issuer_id = any(p_ids) order by s.issuer_id, s.market for update;
+end $$;
+revoke execute on function public.fact_topology_lock(uuid[]) from public, anon, authenticated, service_role;
+
+-- Body of set_merge (runs with entities.allow_topology_write on). Affected set = {source, target}
+-- ∪ referrers of both; scope rows locked; issuers rows locked; the set re-read under the locks
+-- (changed → lineage_changed); referrers of the source re-pointed to the target (row_count = n);
+-- the source retired (row_count = 1, else source_not_active); the plan-1 triggers check the target
+-- is active and the source holds no open security (errors pass through); every affected scope
+-- state_rev + 1; the target joins the next facts.lineage_same_day cycle — entry {issuer_id:T, market,
+-- source:S} appended under the cycle lock open_reconcile_cycle also takes (plan audit Q2), so a cycle
+-- creation never overwrites or half-consumes it; audit row.
+-- Lock order (plan audit R1): the cycle advisory lock is taken FIRST, before the scope rows
+-- (fact_topology_lock) and the issuers rows. open_reconcile_cycle holds the same advisory lock while
+-- its cursor inserts take KEY SHARE on issuers rows (cursor → issuers FK); taking the advisory lock
+-- after the issuer locks would let a merge hold FOR UPDATE on the target while waiting for the
+-- advisory lock that a creator holds while waiting for that row — a deadlock. Global rule: any
+-- function that takes a dq_reconcile_cycle:* advisory lock takes it before any row lock.
+create or replace function public.fact_set_merge_body(p_source uuid, p_target uuid, p_resolved_by uuid)
+returns jsonb language plpgsql security definer set search_path = public as $$
+declare v_set uuid[]; v_now uuid[]; v_refs uuid[]; n int;
+begin
+  if p_source is null or p_target is null or p_source = p_target then raise exception 'invalid_merge' using errcode = '22023'; end if;
+  if p_resolved_by is null then raise exception 'invalid_resolver' using errcode = '22023'; end if;
+  if not exists (select 1 from public.issuers where issuer_id = p_source) then raise exception 'source_not_active' using errcode = 'P0001'; end if;
+  if not exists (select 1 from public.issuers where issuer_id = p_target) then
+    raise exception 'merge_target_not_active: issuer % cannot merge into % (status missing)', p_source, p_target using errcode = '23514';
+  end if;
+  perform pg_advisory_xact_lock(hashtext('dq_reconcile_cycle:facts.lineage_same_day'));   -- FIRST, before any row lock (plan audit R1); serialises with open_reconcile_cycle (plan audit Q2)
+  v_set := array(select distinct x from unnest(array[p_source, p_target] || array(select issuer_id from public.issuers where merged_into in (p_source, p_target))) as x order by x);
+  perform public.fact_topology_lock(v_set);
+  perform 1 from public.issuers where issuer_id = any(v_set) order by issuer_id for update;
+  v_now := array(select distinct x from unnest(array[p_source, p_target] || array(select issuer_id from public.issuers where merged_into in (p_source, p_target))) as x order by x);
+  if v_now <> v_set then raise exception 'lineage_changed' using errcode = 'P0001'; end if;
+  if not exists (select 1 from public.issuers where issuer_id = p_source and status = 'active') then raise exception 'source_not_active' using errcode = 'P0001'; end if;
+  v_refs := array(select issuer_id from public.issuers where merged_into = p_source order by issuer_id);
+  update public.issuers set merged_into = p_target, updated_at = now() where merged_into = p_source;
+  get diagnostics n = row_count;
+  if n <> cardinality(v_refs) then raise exception 'lineage_changed' using errcode = 'P0001'; end if;
+  update public.issuers set status = 'merged', merged_into = p_target, updated_at = now() where issuer_id = p_source and status = 'active';
+  get diagnostics n = row_count;
+  if n <> 1 then raise exception 'source_not_active' using errcode = 'P0001'; end if;
+  update public.fact_sync_scope set state_rev = state_rev + 1, updated_at = now() where issuer_id = any(v_set);
+  -- the cycle advisory lock is already held (taken first, above)
+  update public.dq_reconcile_cycles c
+  set detail = jsonb_set(c.detail, '{pending_members}',
+        coalesce(case when jsonb_typeof(c.detail -> 'pending_members') = 'array' then c.detail -> 'pending_members' end, '[]'::jsonb)
+        || coalesce((select jsonb_agg(jsonb_build_object('issuer_id', p_target, 'market', mk.m, 'source', p_source) order by mk.m)
+                     from (values ('CN'), ('US')) as mk(m)
+                     where not (coalesce(case when jsonb_typeof(c.detail -> 'pending_members') = 'array' then c.detail -> 'pending_members' end, '[]'::jsonb)
+                                @> jsonb_build_array(jsonb_build_object('issuer_id', p_target, 'market', mk.m, 'source', p_source)))), '[]'::jsonb), true)
+  where c.pair = 'facts.lineage_same_day'
+    and c.cycle_id = (select y.cycle_id from public.dq_reconcile_cycles y where y.pair = 'facts.lineage_same_day' order by (y.status = 'running') desc, y.started_at desc limit 1);
+  insert into public.research_audit_log (user_id, actor, action, object_type, object_id, detail)
+  values (p_resolved_by, 'user', 'entities.merge', 'issuer', p_source, jsonb_build_object('source', p_source, 'target', p_target, 'repointed', cardinality(v_refs)));
+  return jsonb_build_object('repointed', cardinality(v_refs));
+end $$;
+revoke execute on function public.fact_set_merge_body(uuid, uuid, uuid) from public, anon, authenticated, service_role;
+
+create or replace function public.set_merge(p_source uuid, p_target uuid, p_resolved_by uuid)
+returns jsonb language plpgsql security definer set search_path = public as $$
+declare v_prev text := current_setting('entities.allow_topology_write', true); v_out jsonb;
+begin
+  perform set_config('entities.allow_topology_write', 'on', true);
+  begin
+    v_out := public.fact_set_merge_body(p_source, p_target, p_resolved_by);
+  exception when others then
+    perform set_config('entities.allow_topology_write', coalesce(v_prev, ''), true);
+    raise;
+  end;
+  perform set_config('entities.allow_topology_write', coalesce(v_prev, ''), true);
+  return v_out;
+end $$;
+revoke execute on function public.set_merge(uuid, uuid, uuid) from public, anon, authenticated;
+grant execute on function public.set_merge(uuid, uuid, uuid) to service_role;
+
+-- Body of set_dissolved: same lock set (issuer + referrers); referrers → has_referrers (re-point
+-- them with set_merge first); active → dissolved (row_count = 1, else source_not_active); the
+-- plan-1 trigger refuses an issuer with open securities; state_rev + 1; audit row.
+-- Lock order (plan audit R1): set_dissolved registers no pending member and takes NO cycle advisory
+-- lock, so it never waits for anything open_reconcile_cycle holds — a creator inserting a cursor for
+-- this issuer may wait behind its FOR UPDATE (one-way wait, no cycle). If it ever needs the cycle
+-- lock, it must take it first, as set_merge does.
+create or replace function public.fact_set_dissolved_body(p_issuer uuid, p_resolved_by uuid)
+returns void language plpgsql security definer set search_path = public as $$
+declare v_set uuid[]; v_now uuid[]; n int;
+begin
+  if p_resolved_by is null then raise exception 'invalid_resolver' using errcode = '22023'; end if;
+  if p_issuer is null or not exists (select 1 from public.issuers where issuer_id = p_issuer) then raise exception 'source_not_active' using errcode = 'P0001'; end if;
+  v_set := array(select distinct x from unnest(array[p_issuer] || array(select issuer_id from public.issuers where merged_into = p_issuer)) as x order by x);
+  perform public.fact_topology_lock(v_set);
+  perform 1 from public.issuers where issuer_id = any(v_set) order by issuer_id for update;
+  v_now := array(select distinct x from unnest(array[p_issuer] || array(select issuer_id from public.issuers where merged_into = p_issuer)) as x order by x);
+  if v_now <> v_set then raise exception 'lineage_changed' using errcode = 'P0001'; end if;
+  if cardinality(v_set) > 1 then raise exception 'has_referrers' using errcode = 'P0001'; end if;
+  update public.issuers set status = 'dissolved', updated_at = now() where issuer_id = p_issuer and status = 'active';
+  get diagnostics n = row_count;
+  if n <> 1 then raise exception 'source_not_active' using errcode = 'P0001'; end if;
+  update public.fact_sync_scope set state_rev = state_rev + 1, updated_at = now() where issuer_id = p_issuer;
+  insert into public.research_audit_log (user_id, actor, action, object_type, object_id, detail)
+  values (p_resolved_by, 'user', 'entities.dissolve', 'issuer', p_issuer, jsonb_build_object('issuer', p_issuer));
+end $$;
+revoke execute on function public.fact_set_dissolved_body(uuid, uuid) from public, anon, authenticated, service_role;
+
+create or replace function public.set_dissolved(p_issuer uuid, p_resolved_by uuid)
+returns void language plpgsql security definer set search_path = public as $$
+declare v_prev text := current_setting('entities.allow_topology_write', true);
+begin
+  perform set_config('entities.allow_topology_write', 'on', true);
+  begin
+    perform public.fact_set_dissolved_body(p_issuer, p_resolved_by);
+  exception when others then
+    perform set_config('entities.allow_topology_write', coalesce(v_prev, ''), true);
+    raise;
+  end;
+  perform set_config('entities.allow_topology_write', coalesce(v_prev, ''), true);
+end $$;
+revoke execute on function public.set_dissolved(uuid, uuid) from public, anon, authenticated;
+grant execute on function public.set_dissolved(uuid, uuid) to service_role;

exec
/bin/zsh -lc "git show bfbd6ac -- scripts src; find . -iname '*agents*' -not -path './node_modules/*'; rg -n 'pending_members|create.*open_reconcile|financial_metrics|fact_topology' supabase/migrations/20261107090000*; ls supabase/migrations | tail -8" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 60ms:
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-I4Wn4Bgd' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-ShmBfQlT' (errno=Operation not permitted)
commit bfbd6ac108fb0f823bbc6c191e375bbd82691a93
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 02:00:53 2026 -0800

    feat(facts): migration two part 1 — acceptance columns, based_on_lineage, lineage reads and writes, topology functions (F3-4)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/scripts/ci/research-checks.ts b/scripts/ci/research-checks.ts
index d4aa69a..909514d 100644
--- a/scripts/ci/research-checks.ts
+++ b/scripts/ci/research-checks.ts
@@ -12,7 +12,7 @@ export const criticalSuites = [
   'entity-keys/entity-keys.integration.test.ts', 'ledger/calls-import.integration.test.ts',
   'cluster/alignments.integration.test.ts', 'fanout/run.integration.test.ts',
   'cards/cards.integration.test.ts', 'thesis-extension.integration.test.ts', 'weekly/weekly.integration.test.ts',
-].map(p => `src/lib/research/${p}`).concat('src/lib/observability/quote-snapshot.integration.test.ts', 'src/lib/analyst/recommendations-append-only.integration.test.ts', 'src/lib/dq/dq-foundation.integration.test.ts', 'src/lib/entities/issuers.integration.test.ts', 'src/lib/entities/issuers-write.integration.test.ts', 'src/lib/facts/facts.integration.test.ts', 'src/lib/facts/sync-us.integration.test.ts', 'src/lib/entities/identifiers.integration.test.ts', 'src/lib/entities/ah-link.integration.test.ts');
+].map(p => `src/lib/research/${p}`).concat('src/lib/observability/quote-snapshot.integration.test.ts', 'src/lib/analyst/recommendations-append-only.integration.test.ts', 'src/lib/dq/dq-foundation.integration.test.ts', 'src/lib/entities/issuers.integration.test.ts', 'src/lib/entities/issuers-write.integration.test.ts', 'src/lib/facts/facts.integration.test.ts', 'src/lib/facts/sync-us.integration.test.ts', 'src/lib/entities/identifiers.integration.test.ts', 'src/lib/entities/ah-link.integration.test.ts', 'src/lib/dq/dq-extensions.integration.test.ts');
 
 export function migrationInventory(root = process.cwd()) {
   const directory = join(root, 'supabase/migrations');
diff --git a/src/lib/dq/dq-extensions.integration.test.ts b/src/lib/dq/dq-extensions.integration.test.ts
new file mode 100644
index 0000000..5e99752
--- /dev/null
+++ b/src/lib/dq/dq-extensions.integration.test.ts
@@ -0,0 +1,352 @@
+// src/lib/dq/dq-extensions.integration.test.ts
+// F3-4 (plan 3 spec §3.2, §9.2): migration 20261107091000 on real PostgreSQL — filings acceptance
+// columns and set_filing_acceptance, financial_metrics.based_on_lineage (upgrade + replay),
+// read_filing_facts, read_facts_lineage (and read_facts as a wrapper with identical output),
+// replace_financial_metrics_lineage (and its wrapper), set_merge / set_dissolved with the topology
+// guard (S1, R3), fact_promote_rows predicates on every promotion entry (T6), adopt_candidate (T1,
+// T5, U3), restore_reconciled (R1), resolve_lineage_conflict, the reconcile cursor and
+// apply_reconcile_result (T2), grants. Every test owns its issuers (and its `test.<hex>` pair), so
+// suites running in parallel on the shared database never meet.
+import {readFileSync} from 'node:fs';
+import {randomUUID} from 'node:crypto';
+import {Pool} from 'pg';
+import type {PoolClient} from 'pg';
+import {afterAll,beforeAll,describe,expect,it} from 'vitest';
+
+const enabled=!!process.env.S4_TEST_STATE;
+const MIGRATION='supabase/migrations/20261107091000_facts_extensions.sql';
+const PLAN2='supabase/migrations/20261106090000_financial_facts.sql';
+
+// Same replay policy as facts.integration.test.ts (not exported there).
+const RETRYABLE=new Set(['55P03','40P01']);
+async function replayMigration(pool:Pool,sql:string,attempts=10):Promise<void>{
+ for(let attempt=1;;attempt++){
+  const c=await pool.connect();
+  try{await c.query(`begin; set local lock_timeout='3s';\n${sql}\n;commit;`);return;}
+  catch(e){
+   await c.query('rollback').catch(()=>{});
+   const code=(e as {code?:string}).code;
+   if(attempt>=attempts||!code||!RETRYABLE.has(code))throw e;
+   await new Promise(r=>setTimeout(r,250*attempt+Math.floor(Math.random()*250)));
+  }finally{c.release();}
+ }
+}
+/** body inside one transaction that is ALWAYS rolled back; retried on lock timeout / deadlock (body must be repeatable). */
+async function inRolledBackTx(pool:Pool,body:(c:PoolClient)=>Promise<void>,attempts=10):Promise<void>{
+ for(let attempt=1;;attempt++){
+  const c=await pool.connect();
+  try{await c.query(`begin; set local lock_timeout='3s'`);await body(c);return;}
+  catch(e){
+   const code=(e as {code?:string}).code;
+   if(attempt>=attempts||!code||!RETRYABLE.has(code))throw e;
+   await new Promise(r=>setTimeout(r,250*attempt+Math.floor(Math.random()*250)));
+  }finally{await c.query('rollback').catch(()=>{});c.release();}
+ }
+}
+interface Tx{c:PoolClient;pid:number;commit():Promise<void>}
+async function inTx(pool:Pool,body:(tx:Tx)=>Promise<void>):Promise<void>{
+ const c=await pool.connect();let open=false;let broken:Error|undefined;
+ try{
+  await c.query('begin');open=true;
+  const pid=Number((await c.query('select pg_backend_pid() p')).rows[0].p);
+  await body({c,pid,commit:async()=>{await c.query('commit');open=false;}});
+ }finally{
+  if(open)await c.query('rollback').catch(e=>{broken=e as Error;});
+  c.release(broken);
+ }
+}
+async function stillBlockedBehind(pool:Pool,pid:number,p:Promise<unknown>):Promise<void>{
+ let settled=false;p.then(()=>{settled=true;},()=>{settled=true;});
+ for(const deadline=Date.now()+3000;;){
+  const n=Number((await pool.query(`select count(*)::int n from pg_stat_activity where $1 = any(pg_blocking_pids(pid))`,[pid])).rows[0].n);
+  if(n>=1)break;
+  if(settled||Date.now()>deadline)throw new Error(`no backend blocked behind pid ${pid} (settled=${settled})`);
+  await new Promise(r=>setTimeout(r,20));
+ }
+ expect(settled).toBe(false);
+}
+type PgErr={message:string;code?:string};
+const fails=(p:Promise<unknown>)=>p.then(()=>{throw new Error('expected rejection');},e=>e as PgErr);
+type FactSpec={filing_id:string;fact_id?:string;concept?:string;period_start?:string|null;period_end?:string;duration?:string;value?:string;unit?:string;available_date?:string;mapping_version?:string};
+type Envelope={state_rev:number;rows:Record<string,unknown>[];truncated:boolean;row_count:number};
+type LineageEnvelope={state_revs:{issuer_id:string;state_rev:number}[];lineage:string[];rows:Record<string,unknown>[];conflicts:{key:Record<string,string|null>;available_date:string;fact_ids:string[]}[];truncated:boolean;row_count:number};
+
+describe.skipIf(!enabled)('F3-4 facts extensions migration on real PostgreSQL',()=>{
+ let admin:Pool;
+ const q=async(text:string,values:unknown[]=[])=>(await admin.query(text,values)).rows as Record<string,any>[];
+ const one=async(text:string,values:unknown[]=[])=>(await q(text,values))[0]?.v;
+ const issuer=async(name='ZZ Ext Test')=>{const id=randomUUID();await q(`insert into public.issuers(issuer_id,canonical_name_en) values($1,$2)`,[id,name]);return id;};
+ const user=async()=>{const id=randomUUID();await q(`insert into auth.users(id,email) values($1,$2)`,[id,`${id}@ext.test`]);return id;};
+ const batch=async(dataset='facts.us',finished=false)=>{
+  const id=randomUUID();await q(`insert into public.ingest_batches(batch_id,producer,dataset) values($1,'ext-test',$2)`,[id,dataset]);
+  if(finished)await q(`update public.ingest_batches set status='success',finished_at=now() where batch_id=$1`,[id]);
+  return id;
+ };
+ const scope=(iss:string,market='US')=>one(`select public.reconcile_fact_sync_scope($1,$2::jsonb) v`,[market,JSON.stringify([{issuer_id:iss,reasons:['test'],priority:10,fetch_key:'0000000001'}])]);
+ const claim=(iss:string,b:string,market='US')=>one(`select public.claim_fact_sync_lease($1,$2,$3,600) v`,[iss,market,b]);
+ const begin=(iss:string,b:string,gen=1,market='US')=>one(`select public.begin_sync_run($1,$2,$3,$4) v`,[iss,market,b,gen]);
+ const filing=async(run:string,o:{available?:string;sourceRef?:string;source?:string;origin?:string;form?:string}={})=>{
+  const id=randomUUID();const sourceRef=o.sourceRef??`0000${randomUUID().slice(0,6)}-24-${randomUUID().slice(0,6)}`;
+  const m=await one(`select public.stage_filings($1,$2::jsonb) v`,[run,JSON.stringify([{filing_id:id,source:o.source??'edgar',origin:o.origin??'sec',form_type:o.form??'10-K',fiscal_year:2023,fiscal_period:'FY',period_end:'2023-12-31',available_date:o.available??'2024-02-01',source_ref:sourceRef,url:null}])]);
+  return {id:m[sourceRef] as string,sourceRef};
+ };
+ const factRow=(f:FactSpec)=>({fact_id:f.fact_id??randomUUID(),filing_id:f.filing_id,concept:f.concept??'revenue',source_concept:'Revenues',statement:f.concept==='total_assets'?'BS':'IS',period_start:f.period_start===undefined?'2023-10-01':f.period_start,period_end:f.period_end??'2023-12-31',duration:f.duration??'3M',value:f.value??'100',unit:f.unit??'USD',consolidation:'consolidated',available_date:f.available_date??'2024-02-01',mapping_version:f.mapping_version??'facts-map/1',raw_hash:'h'});
+ const stage=async(run:string,rows:FactSpec[])=>{const full=rows.map(factRow);await one(`select public.stage_facts($1,$2::jsonb) v`,[run,JSON.stringify(full)]);return full.map(r=>r.fact_id);};
+ const publish=(run:string,manifest:string[])=>one(`select public.publish_sync_run($1,$2::uuid[]) v`,[run,manifest]);
+ const rev=(iss:string,market='US')=>one(`select public.fact_state_rev($1,$2) v`,[iss,market]).then(Number);
+ const status=async(id:string)=>(await q(`select status from public.financial_facts where fact_id=$1`,[id]))[0]?.status??null;
+ const merge=(s:string,t:string,by:string)=>one(`select public.set_merge($1,$2,$3) v`,[s,t,by]);
+ const dissolve=(i:string,by:string)=>q(`select public.set_dissolved($1,$2)`,[i,by]);
+ const lineageRead=async(issuers:string[],o:{concepts?:string[];asOf?:string;history?:boolean;limit?:number|null;nonOk?:boolean}={},client:Pool|PoolClient=admin)=>
+  (await client.query(`select public.read_facts_lineage($1::uuid[],'US',$2::text[],$3::date,null,null,$4,$5,$6) v`,[issuers,o.concepts??['revenue','total_assets'],o.asOf??'2030-01-01',o.history??true,o.limit??null,o.nonOk??false])).rows[0].v as LineageEnvelope;
+ const factsRead=async(iss:string,o:{concepts?:string[];asOf?:string;history?:boolean;limit?:number|null;nonOk?:boolean}={},client:Pool|PoolClient=admin)=>
+  (await client.query(`select public.read_facts($1,'US',$2::text[],$3::date,null,null,$4,$5,$6) v`,[iss,o.concepts??['revenue','total_assets'],o.asOf??'2030-01-01',o.history??true,o.limit??null,o.nonOk??false])).rows[0].v as Envelope;
+ const metric=(v:string,name='gross_margin')=>({metric:name,period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:v,unit:'ratio',input_unit:'USD',basis:'us_standard',formula_version:'facts-derive/1.0',inputs:[],as_of:'2024-03-01'});
+ /** A leased US issuer with one published gen-1 run: f0 (2024-01-01) carries r0 = revenue 90, f (2024-02-01) carries r = revenue 100, same key. state_rev 1. */
+ const published=async()=>{
+  const iss=await issuer();const b=await batch();expect(await scope(iss)).toBe(1);expect(await claim(iss,b)).toBe(true);
+  const run=await begin(iss,b);const f0=await filing(run,{available:'2024-01-01'});const f=await filing(run);
+  const [r0]=await stage(run,[{filing_id:f0.id,value:'90',available_date:'2024-01-01'}]);
+  const [r]=await stage(run,[{filing_id:f.id,value:'100'}]);
+  expect(await publish(run,[f0.id,f.id])).toBe(2);
+  return {iss,b,run,f0:f0.id,f:f.id,fRef:f.sourceRef,r0,r};
+ };
+ /** Another published issuer with one revenue row on 2024-02-01 for the same key (value given). */
+ const sibling=async(value:string)=>{
+  const iss=await issuer();const b=await batch();await scope(iss);await claim(iss,b);
+  const run=await begin(iss,b);const f=await filing(run);const [x]=await stage(run,[{filing_id:f.id,value}]);await publish(run,[f.id]);
+  return {iss,b,run,f:f.id,x};
+ };
+ const sql=()=>readFileSync(MIGRATION,'utf8');
+
+ beforeAll(async()=>{admin=new Pool({connectionString:JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8')).adminUrl});});
+ afterAll(async()=>{await admin?.end();});
+
+ describe('8a: acceptance, lineage reads, lineage metrics, topology',()=>{
+  it('filings.accepted_at: set once through set_filing_acceptance only; no role may write it directly; the plan-2 link columns stay writable (T11)',async()=>{
+   const {iss,f}=await published();
+   for(const role of ['anon','authenticated','service_role'])for(const col of ['accepted_at','acceptance_source'])
+    expect({role,col,ok:await one(`select has_column_privilege($1,'public.filings',$2,'UPDATE') v`,[role,col])}).toEqual({role,col,ok:false});
+   expect(await fails(q(`update public.filings set accepted_at=now(),acceptance_source='sec_submissions' where filing_id=$1`,[f]))).toMatchObject({code:'23514',message:expect.stringContaining('append_only:')});
+   expect(await fails(one(`select public.set_filing_acceptance($1,'2024-02-01T21:05:00Z','other') v`,[f]))).toMatchObject({message:'invalid_acceptance',code:'22023'});
+   expect(await fails(one(`select public.set_filing_acceptance($1,'2024-02-01T21:05:00Z','sec_submissions') v`,[randomUUID()]))).toMatchObject({message:'filing_not_found'});
+   expect(await one(`select public.set_filing_acceptance($1,'2024-02-01T21:05:00Z','sec_submissions') v`,[f])).toBe(true);
+   expect(await one(`select public.set_filing_acceptance($1,'2024-02-01T21:05:00Z','sec_submissions') v`,[f])).toBe(false);
+   expect(await fails(one(`select public.set_filing_acceptance($1,'2024-02-01T21:06:00Z','sec_submissions') v`,[f]))).toMatchObject({message:'acceptance_conflict',code:'P0001'});
+   expect(await q(`select accepted_at=$2::timestamptz ok,acceptance_source from public.filings where filing_id=$1`,[f,'2024-02-01T21:05:00Z'])).toEqual([{ok:true,acceptance_source:'sec_submissions'}]);
+   // value → other value, even with the function's flag on, is refused by the trigger
+   await inRolledBackTx(admin,async c=>{
+    await c.query(`select set_config('facts.allow_acceptance_write','on',true)`);
+    await expect(c.query(`update public.filings set accepted_at=accepted_at+interval '1 second' where filing_id=$1`,[f])).rejects.toMatchObject({code:'23514'});
+   });
+   // pair constraint: one without the other is refused
+   await inRolledBackTx(admin,async c=>{
+    const run=(await c.query(`select run_id from public.filings where filing_id=$1`,[f])).rows[0].run_id;
+    await expect(c.query(`insert into public.filings(filing_id,issuer_id,market,source,origin,form_type,available_date,source_ref,run_id,accepted_at) values($1,$2,'US','edgar','sec','10-K','2024-01-01',$3,$4,now())`,[randomUUID(),iss,`x-${randomUUID()}`,run])).rejects.toMatchObject({code:'23514'});
+   });
+   // T11: service_role still updates the three link columns; mapping_gen and url stay closed
+   const c=await admin.connect();
+   try{
+    await c.query('set role service_role');
+    expect((await c.query(`update public.filings set document_ref='doc',document_url='https://example.test/doc',link_attempts=1 where filing_id=$1`,[f])).rowCount).toBe(1);
+    await expect(c.query(`update public.filings set accepted_at=null where filing_id=$1`,[f])).rejects.toThrow(/permission denied/);
+    await expect(c.query(`update public.filings set mapping_gen=5 where filing_id=$1`,[f])).rejects.toThrow(/permission denied/);
+   }finally{await c.query('reset role').catch(()=>{});c.release();}
+   await expect(q(`update public.filings set url='x' where filing_id=$1`,[f])).rejects.toThrow(/append_only:/);
+  });
+
+  it('set_filing_acceptance refuses a non-edgar filing',async()=>{
+   const iss=await issuer();const b=await batch('facts.cn');await scope(iss,'CN');await claim(iss,b,'CN');
+   const run=await begin(iss,b,1,'CN');const g=await filing(run,{source:'tushare',origin:'sse',form:'annual',sourceRef:`600000.SH:20231231:1:${randomUUID().slice(0,8)}`});
+   expect(await fails(one(`select public.set_filing_acceptance($1,now(),'sec_submissions') v`,[g.id]))).toMatchObject({message:'invalid_acceptance'});
+  });
+
+  it('read_filing_facts returns every generation and status of one filing with the run status; ok-only without include_non_ok; service_role only',async()=>{
+   const {iss,b,f,r}=await published();
+   const run2=await begin(iss,b,2);const [a2]=await stage(run2,[{filing_id:f,value:'101'}]);await publish(run2,[f]);   // r stays as gen-1 evidence
+   const run3=await begin(iss,b,2);const [st]=await stage(run3,[{filing_id:f,concept:'net_income',value:'5'}]);      // staged
+   const all=(await one(`select public.read_filing_facts($1,true) v`,[f])).rows as Record<string,unknown>[];
+   expect(all.map(x=>[x.fact_id,x.mapping_gen,x.status,x.run_status,x.value])).toEqual([[r,1,'ok','published','100'],[st,2,'staged','staged','5'],[a2,2,'ok','published','101']]);
+   const ok=(await one(`select public.read_filing_facts($1,false) v`,[f])).rows as Record<string,unknown>[];
+   expect(ok.map(x=>x.fact_id)).toEqual([r,a2]);
+   expect(await one(`select public.read_filing_facts($1,true) v`,[randomUUID()])).toEqual({rows:[]});
+  });
+
+  it('read_facts is a wrapper of read_facts_lineage with output identical to the plan-2 function in ok / includeNonOk / history modes (T7)',async()=>{
+   const {iss,b,f}=await published();
+   const run2=await begin(iss,b,2);await stage(run2,[{filing_id:f,value:'101'},{filing_id:f,concept:'total_assets',period_start:null,duration:'INSTANT',value:'7'}]);await publish(run2,[f]);
+   const run3=await begin(iss,b,2);const g=await filing(run3,{available:'2024-03-01'});const [qd]=await stage(run3,[{filing_id:g.id,value:'120',available_date:'2024-03-01'}]);
+   const item=randomUUID();
+   await q(`insert into public.dq_quarantine(id,dataset,table_name,natural_key,reason_code,batch_id,payload) values($1,'facts.us','financial_facts',$2,'same_day_conflict',$3,$4::jsonb)`,[item,`${iss}:US:revenue:2023-10-01:2023-12-31:consolidated:USD:2024-03-01`,b,JSON.stringify({key:{issuer_id:iss,market:'US',concept:'revenue',period_start:'2023-10-01',period_end:'2023-12-31',consolidation:'consolidated',unit:'USD',available_date:'2024-03-01'},fact_ids:[qd],values:[],run_id:run3})]);
+   await one(`select public.quarantine_facts($1,$2::uuid[],$3) v`,[run3,[qd],item]);await publish(run3,[g.id]);
+   const run4=await begin(iss,b,2);await stage(run4,[{filing_id:g.id,concept:'total_assets',period_start:null,duration:'INSTANT',value:'8',available_date:'2024-03-01'}]);   // staged, unpublished
+   const legacyText=(()=>{const s=readFileSync(PLAN2,'utf8');const start=s.indexOf('create or replace function public.read_facts(');const end=s.indexOf('\n$$;',start);return s.slice(start,end+4).replace('create or replace function public.read_facts(','create function pg_temp.read_facts_v8(');})();
+   const c=await admin.connect();
+   try{
+    await c.query(legacyText);
+    for(const o of [{history:false,nonOk:false},{history:true,nonOk:false},{history:true,nonOk:true},{history:false,nonOk:true},{history:true,nonOk:true,limit:1}]){
+     const args=[iss,['revenue','total_assets'],'2030-01-01',o.history,(o as {limit?:number}).limit??null,o.nonOk];
+     const legacy=(await c.query(`select pg_temp.read_facts_v8($1,'US',$2::text[],$3::date,null,null,$4,$5,$6) v`,args)).rows[0].v as Envelope;
+     const wrapped=(await c.query(`select public.read_facts($1,'US',$2::text[],$3::date,null,null,$4,$5,$6) v`,args)).rows[0].v as Envelope;
+     expect(wrapped).toEqual(legacy);                                                                  // field by field
+     expect((await c.query(`select pg_temp.read_facts_v8($1,'US',$2::text[],$3::date,null,null,$4,$5,$6) = public.read_facts($1,'US',$2::text[],$3::date,null,null,$4,$5,$6) v`,args)).rows[0].v).toBe(true);
+     const lin=await lineageRead([iss],{history:o.history,nonOk:o.nonOk,limit:(o as {limit?:number}).limit??null},c);
+     expect({state_rev:lin.state_revs[0].state_rev,rows:lin.rows,truncated:lin.truncated,row_count:lin.row_count}).toEqual(legacy);
+     expect(lin.conflicts).toEqual([]);expect(lin.lineage).toEqual([iss]);
+    }
+    const nonOk=(await lineageRead([iss],{history:true,nonOk:true},c)).rows.filter(x=>x.status!=='ok');
+    expect(nonOk.length).toBeGreaterThan(0);
+    for(const x of nonOk)expect(x).toMatchObject({disclosure_seq:null,is_current:false,is_revision:false});
+    expect((await lineageRead([iss],{history:false,nonOk:true},c)).rows.every(x=>x.status==='ok')).toBe(true);   // non-ok rows only with history
+   }finally{c.release();}
+  });
+
+  it('read_facts_lineage: two members suppress a cross-issuer same-day disagreement into conflicts (ok rows only) and the earlier disclosure becomes current; equal values are no conflict; anon sees ok only',async()=>{
+   const {iss:t,r0,r}=await published();
+   const {iss:s,x}=await sibling('200');
+   const env=await lineageRead([t,s,t],{concepts:['revenue'],history:true});
+   expect(env.lineage).toEqual([t,s].sort());
+   expect(env.state_revs).toEqual([t,s].sort().map(id=>({issuer_id:id,state_rev:1})));
+   expect(env.conflicts).toEqual([{key:{concept:'revenue',period_start:'2023-10-01',period_end:'2023-12-31',consolidation:'consolidated',unit:'USD'},available_date:'2024-02-01',fact_ids:[r,x].sort()}]);
+   expect(env.rows.map(y=>[y.fact_id,y.issuer_id,y.disclosure_seq,y.is_current])).toEqual([[r0,t,1,true]]);
+   expect((await lineageRead([t],{concepts:['revenue'],history:false})).rows.map(y=>y.fact_id)).toEqual([r]);   // one member: no suppression
+   const {iss:u,x:ux}=await sibling('100');
+   const same=await lineageRead([t,u],{concepts:['revenue'],history:true});
+   expect(same.conflicts).toEqual([]);
+   expect(same.rows.map(y=>y.fact_id)).toEqual([r0,r,ux]);
+   expect(same.rows.at(-1)).toMatchObject({fact_id:ux,is_current:true,is_revision:false,disclosure_seq:3});
+   // a quarantined row on the disputed key does not take part in suppression
+   await q(`update public.financial_facts set status='quarantined' where fact_id=$1`,[x]);
+   expect((await lineageRead([t,s],{concepts:['revenue'],history:true})).conflicts).toEqual([]);
+   const c=await admin.connect();
+   try{
+    await c.query('set role anon');
+    const anon=await lineageRead([t,s],{concepts:['revenue'],history:true,nonOk:true},c);
+    expect(anon.rows.every(y=>y.status==='ok')).toBe(true);
+    expect(anon.state_revs.map(v=>v.issuer_id)).toEqual([t,s].sort());
+   }finally{await c.query('reset role').catch(()=>{});c.release();}
+  });
+
+  it('replace_financial_metrics_lineage: member revs and the lineage set are checked under the scope locks; the wrapper writes a one-member vector',async()=>{
+   const {iss:t}=await published();const {iss:s}=await sibling('100');const by=await user();
+   const lin=(v:{issuer_id:string;state_rev:number}[])=>JSON.stringify(v);
+   const replace=(based:{issuer_id:string;state_rev:number}[],rows:unknown[]=[metric('0.5')],who=t,market='US')=>one(`select public.replace_financial_metrics_lineage($1,$2,$3::jsonb,$4::jsonb) v`,[who,market,lin(based),JSON.stringify(rows)]);
+   expect(await one(`select public.replace_financial_metrics($1,'US',1,$2::jsonb) v`,[t,JSON.stringify([metric('0.4')])])).toBe(1);
+   expect(await q(`select based_on_rev,based_on_lineage from public.financial_metrics where issuer_id=$1`,[t])).toEqual([{based_on_rev:'1',based_on_lineage:[{issuer_id:t,state_rev:1}]}]);
+   await merge(s,t,by);                                                                                // revs: t 2, s 2
+   expect(await fails(replace([{issuer_id:t,state_rev:2}]))).toMatchObject({message:'stale_computation',code:'P0001'});   // lineage grew
+   expect(await fails(one(`select public.replace_financial_metrics($1,'US',2,'[]'::jsonb) v`,[t]))).toMatchObject({message:'stale_computation'});   // the one-member wrapper no longer fits
+   expect(await fails(replace([{issuer_id:t,state_rev:2},{issuer_id:s,state_rev:1}]))).toMatchObject({message:'stale_computation'});
+   expect(await replace([{issuer_id:s,state_rev:2},{issuer_id:t,state_rev:2}])).toBe(1);
+   const [row]=await q(`select based_on_rev,based_on_lineage from public.financial_metrics where issuer_id=$1`,[t]);
+   expect(row).toEqual({based_on_rev:'2',based_on_lineage:[{issuer_id:t,state_rev:2},{issuer_id:s,state_rev:2}].sort((a,b)=>a.issuer_id<b.issuer_id?-1:1)});
+   expect(await fails(replace([{issuer_id:t,state_rev:2},{issuer_id:t,state_rev:2}]))).toMatchObject({message:'invalid_based_on',code:'22023'});
+   expect(await fails(replace([{issuer_id:s,state_rev:2}]))).toMatchObject({message:'invalid_based_on'});              // must contain p_issuer
+   const lone=await issuer();
+   expect(await fails(replace([{issuer_id:lone,state_rev:0}],[],lone,'CN'))).toMatchObject({message:'scope_missing',code:'P0001'});
+   expect(await fails(one(`select public.replace_financial_metrics($1,'US',0,'[]'::jsonb) v`,[lone]))).toMatchObject({message:'scope_missing'});
+   expect(await fails(one(`select public.replace_financial_metrics($1,'US',3,'[]'::jsonb) v`,[lone]))).toMatchObject({message:'stale_computation'});   // plan-2 contract: no scope ⇒ rev 0
+   expect(await fails(q(`update public.financial_metrics set based_on_lineage='[]' where issuer_id=$1`,[t]))).toMatchObject({code:'23514'});
+  });
+
+  it('upgrade on a database with data: the first replay adds based_on_lineage and backfills it once; a second replay leaves newer evidence untouched',async()=>{
+   const {iss}=await published();
+   expect(await one(`select public.replace_financial_metrics($1,'US',1,$2::jsonb) v`,[iss,JSON.stringify([metric('0.5')])])).toBe(1);
+   await inRolledBackTx(admin,async c=>{
+    await c.query(`alter table public.financial_metrics drop column based_on_lineage`);   // back to the plan-2 shape (its constraint goes with it)
+    await c.query(`insert into public.financial_metrics(issuer_id,market,metric,period_start,period_end,duration,value,unit,input_unit,basis,formula_version,inputs,based_on_rev,as_of) values($1,'US','legacy_metric','2023-10-01','2023-12-31','3M',1,'ratio','USD','us_standard','facts-derive/1.0','[]',7,'2024-03-01')`,[iss]);
+    await c.query(sql());
+    const read=async()=>(await c.query(`select metric,based_on_lineage from public.financial_metrics where issuer_id=$1 order by metric`,[iss])).rows;
+    expect(await read()).toEqual([{metric:'gross_margin',based_on_lineage:[{issuer_id:iss,state_rev:1}]},{metric:'legacy_metric',based_on_lineage:[{issuer_id:iss,state_rev:7}]}]);
+    await c.query(`update public.financial_metrics set based_on_lineage=jsonb_build_array(jsonb_build_object('issuer_id',issuer_id,'state_rev',99)) where issuer_id=$1 and metric='legacy_metric'`,[iss]);
+    await c.query(sql());                                                                                       // replay: guarded, no second backfill
+    expect((await read())[1]).toEqual({metric:'legacy_metric',based_on_lineage:[{issuer_id:iss,state_rev:99}]});
+   });
+  },60000);
+
+  it('topology guard (S1): a fresh connection cannot write status/merged_into; after set_merge returns inside a transaction a direct update is still refused; the setting is restored on the error path',async()=>{
+   const a=await issuer(),b=await issuer(),d=await issuer(),by=await user();   // d: active, no referrers (plan-1 merge_target_has_referrers would otherwise fire before the guard)
+   expect(await fails(q(`update public.issuers set status='merged',merged_into=$2 where issuer_id=$1`,[a,b]))).toMatchObject({code:'23514',message:expect.stringContaining('topology_write_forbidden')});
+   const c=await admin.connect();
+   try{
+    await c.query('begin');
+    expect((await c.query(`select public.set_merge($1,$2,$3) v`,[a,b,by])).rows[0].v).toEqual({repointed:0});
+    expect(['',null]).toContain((await c.query(`select current_setting('entities.allow_topology_write',true) v`)).rows[0].v);
+    await c.query('savepoint s1');
+    await expect(c.query(`update public.issuers set status='dissolved' where issuer_id=$1`,[d])).rejects.toMatchObject({code:'23514',message:expect.stringContaining('topology_write_forbidden')});
+    await c.query('rollback to savepoint s1');
+    await c.query('savepoint s2');
+    await expect(c.query(`select public.set_merge($1,$2,$3)`,[a,b,by])).rejects.toMatchObject({message:'source_not_active'});   // error path
+    await c.query('rollback to savepoint s2');
+    expect(['',null]).toContain((await c.query(`select current_setting('entities.allow_topology_write',true) v`)).rows[0].v);
+    await expect(c.query(`update public.issuers set merged_into=null,status='active' where issuer_id=$1`,[a])).rejects.toMatchObject({code:'23514'});
+    await c.query('rollback');
+   }finally{c.release();}
+   expect(await q(`select status,merged_into from public.issuers where issuer_id=$1`,[a])).toEqual([{status:'active',merged_into:null}]);   // rolled back
+  });
+
+  it('set_merge (R3): A→B then B→C re-points A to C before retiring B; every affected scope (both markets, placeholders created) bumps; audit rows; plan-1 trigger errors pass through',async()=>{
+   const a=await issuer(),b=await issuer(),c=await issuer(),by=await user();
+   expect(await merge(a,b,by)).toEqual({repointed:0});
+   expect(await q(`select market,priority,reasons,fetch_key,state_rev from public.fact_sync_scope where issuer_id=$1 order by market`,[a])).toEqual([{market:'CN',priority:0,reasons:[],fetch_key:'topology',state_rev:'1'},{market:'US',priority:0,reasons:[],fetch_key:'topology',state_rev:'1'}]);
+   expect(await merge(b,c,by)).toEqual({repointed:1});
+   expect(await q(`select issuer_id,status,merged_into from public.issuers where issuer_id=any($1::uuid[]) order by issuer_id`,[[a,b,c]])).toEqual([{issuer_id:a,status:'merged',merged_into:c},{issuer_id:b,status:'merged',merged_into:c},{issuer_id:c,status:'active',merged_into:null}].sort((x,y)=>x.issuer_id<y.issuer_id?-1:1));
+   expect(await q(`select issuer_id,market,state_rev from public.fact_sync_scope where issuer_id=any($1::uuid[]) order by issuer_id,market`,[[a,b,c]])).toEqual([a,b,c].sort().flatMap(id=>['CN','US'].map(m=>({issuer_id:id,market:m,state_rev:id===c?'1':'2'}))));
+   expect(await q(`select action,object_id,detail from public.research_audit_log where user_id=$1 order by created_at`,[by])).toEqual([{action:'entities.merge',object_id:a,detail:{source:a,target:b,repointed:0}},{action:'entities.merge',object_id:b,detail:{source:b,target:c,repointed:1}}]);
+   expect(await fails(merge(b,c,by))).toMatchObject({message:'source_not_active'});
+   const d=await issuer();
+   expect(await fails(merge(d,b,by))).toMatchObject({code:'23514',message:expect.stringContaining('merge_target_not_active')});
+   expect(await fails(merge(d,d,by))).toMatchObject({message:'invalid_merge',code:'22023'});
+   expect(await fails(merge(d,randomUUID(),by))).toMatchObject({message:expect.stringContaining('merge_target_not_active')});
+   expect(await q(`select status from public.issuers where issuer_id=$1`,[d])).toEqual([{status:'active'}]);
+  });
+
+  it('set_merge registers the target as a pending member of the latest facts.lineage_same_day cycle',async()=>{
+   const s=await issuer(),t=await issuer(),by=await user();
+   await inRolledBackTx(admin,async c=>{
+    await c.query(`insert into public.dq_reconcile_cycles(pair,cycle_id,started_at,finished_at,members,status,expected_total) values('facts.lineage_same_day',$1,now()+interval '100 years',now()+interval '100 years','[]','complete',0)`,[`facts.lineage_same_day-test-${randomUUID().slice(0,8)}`]);
+    await c.query(`select public.set_merge($1,$2,$3)`,[s,t,by]);
+    const [latest]=(await c.query(`select detail from public.dq_reconcile_cycles where pair='facts.lineage_same_day' order by (status='running') desc, started_at desc limit 1`)).rows;
+    expect(latest.detail.pending_members).toEqual(expect.arrayContaining([{issuer_id:t,market:'CN',source:s},{issuer_id:t,market:'US',source:s}]));   // one entry per merged source (plan audit Q2)
+   });
+  });
+
+  it('set_merge serialises with materialisation: a lineage write that waits behind it is refused as stale_computation',async()=>{
+   const {iss:t}=await published();const {iss:s}=await sibling('100');const by=await user();
+   await inTx(admin,async({c,pid,commit})=>{
+    await c.query(`select public.set_merge($1,$2,$3)`,[s,t,by]);
+    const p=one(`select public.replace_financial_metrics_lineage($1,'US',$2::jsonb,'[]'::jsonb) v`,[t,JSON.stringify([{issuer_id:t,state_rev:1}])]);p.catch(()=>{});
+    await stillBlockedBehind(admin,pid,p);
+    await commit();
+    expect(await fails(p)).toMatchObject({message:'stale_computation'});
+   });
+  });
+
+  it('set_dissolved: refuses referrers and non-active issuers; locks, bumps and audits',async()=>{
+   const a=await issuer(),b=await issuer(),by=await user();
+   await merge(a,b,by);
+   expect(await fails(dissolve(b,by))).toMatchObject({message:'has_referrers'});
+   const d=await issuer();
+   await dissolve(d,by);
+   expect(await q(`select status,merged_into from public.issuers where issuer_id=$1`,[d])).toEqual([{status:'dissolved',merged_into:null}]);
+   expect((await q(`select state_rev from public.fact_sync_scope where issuer_id=$1 order by market`,[d])).map(x=>x.state_rev)).toEqual(['1','1']);
+   expect(await fails(dissolve(d,by))).toMatchObject({message:'source_not_active'});
+   expect(await q(`select action from public.research_audit_log where user_id=$1 and object_id=$2`,[by,d])).toEqual([{action:'entities.dissolve'}]);
+  });
+
+  it('grants: new functions are service_role only (read_facts_lineage: every client role); plan-2 grants are unchanged; replays',async()=>{
+   const fn=(role:string,sig:string)=>one(`select has_function_privilege($1,$2,'EXECUTE') v`,[role,sig]);
+   for(const role of ['anon','authenticated','service_role']){
+    expect(await fn(role,'public.read_facts_lineage(uuid[],text,text[],date,date,date,boolean,int,boolean)')).toBe(true);
+    expect(await fn(role,'public.read_facts(uuid,text,text[],date,date,date,boolean,int,boolean)')).toBe(true);
+    for(const sig of ['public.fact_promote_rows(uuid,text,uuid[])','public.fact_topology_lock(uuid[])','public.fact_set_merge_body(uuid,uuid,uuid)','public.fact_set_dissolved_body(uuid,uuid)'])
+     expect({role,sig,ok:await fn(role,sig)}).toEqual({role,sig,ok:false});
+   }
+   for(const sig of ['public.set_filing_acceptance(uuid,timestamptz,text)','public.read_filing_facts(uuid,boolean)','public.replace_financial_metrics_lineage(uuid,text,jsonb,jsonb)','public.replace_financial_metrics(uuid,text,bigint,jsonb)','public.set_merge(uuid,uuid,uuid)','public.set_dissolved(uuid,uuid)']){
+    for(const role of ['anon','authenticated'])expect({sig,role,ok:await fn(role,sig)}).toEqual({sig,role,ok:false});
+    expect({sig,ok:await fn('service_role',sig)}).toEqual({sig,ok:true});
+   }
+   await expect(replayMigration(admin,sql())).resolves.toBeUndefined();
+  },60000);
+ });
+});
diff --git a/src/lib/facts/facts.integration.test.ts b/src/lib/facts/facts.integration.test.ts
index bf3e57f..5b2bcd9 100644
--- a/src/lib/facts/facts.integration.test.ts
+++ b/src/lib/facts/facts.integration.test.ts
@@ -18,6 +18,10 @@ import {pgFactsDb} from './pg-facts-db';
 
 const enabled=!!process.env.S4_TEST_STATE;
 const MIGRATION='supabase/migrations/20261106090000_financial_facts.sql';
+// Plan 3 (20261107091000) redefines fact_promote_rows, filings_limited_update, read_facts and
+// replace_financial_metrics: replaying the plan-2 file alone would expose the plan-2 versions to
+// suites running in parallel, so both files replay in one transaction.
+const EXTENSIONS='supabase/migrations/20261107091000_facts_extensions.sql';
 const TABLES=['fact_sync_runs','filings','financial_facts','financial_metrics','fact_sync_scope'];
 
 // Same replay policy as dq-foundation.integration.test.ts (not exported there): one transaction,
@@ -141,7 +145,7 @@ describe.skipIf(!enabled)('F2-0 financial facts migration on real PostgreSQL',()
    expect({sig,ok:await fn('service_role',sig)}).toEqual({sig,ok:true});
   }
   for(const role of ['anon','authenticated','service_role'])expect(await fn(role,'public.fact_promote_rows(uuid,text,uuid[])')).toBe(false);
-  await expect(replayMigration(admin,readFileSync(MIGRATION,'utf8'))).resolves.toBeUndefined();
+  await expect(replayMigration(admin,`${readFileSync(MIGRATION,'utf8')}\n${readFileSync(EXTENSIONS,'utf8')}`)).resolves.toBeUndefined();
  },60000);
 
  it('enforces the candidate key (nulls not distinct), both composite foreign keys, the period checks, and keeps 20-digit values exact',async()=>{
./.claude/agents
128:  detail              jsonb not null default '{}',                   -- pending_members (set_merge, migration two) and settlement notes
20261018090000_recommendation_scores_base_close.sql
20261018120000_anchor_runner.sql
20261018150000_anchor_runner_cache_read.sql
20261105090000_dq_foundation.sql
20261105091000_issuers.sql
20261106090000_financial_facts.sql
20261107090000_identifiers_and_dq.sql
20261107091000_facts_extensions.sql

exec
/bin/zsh -lc "rg -n 'pending_members|set_merge|topology|fetch_key' docs/*/*plan* docs -g '*spec*' | head -55; rg -n 'financial_metrics|read_facts\\(|reconcile_fact_sync_scope|fact_state_rev' supabase/migrations/20261106090000_financial_facts.sql; sed -n '100,170p' supabase/migrations/20261107090000_identifiers_and_dq.sql; rg -n 'merge_target|for update|for key share' supabase/migrations/20261105091000_issuers.sql" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
docs/audits/2026-11-04-data-foundation-2/02-claude-spec-review-round1.md:15:- **A9 · P3 — `fetch_key` "10 位 CIK" vs `issuers.cik` stored stripped.** Pad in one place.
5:-- concept/period/unit"; financial_metrics is a derived cache replaced atomically per issuer;
14:-- call reconcile_fact_sync_scope (schedule inputs, no lease).
101:-- ---------------------------------------------------------------- 4.4 financial_metrics
102:create table if not exists public.financial_metrics (
121:create index if not exists financial_metrics_read_idx on public.financial_metrics(issuer_id, market, metric, period_end desc);
139:  scope_confirmed_at timestamptz not null default now(),   -- last time reconcile_fact_sync_scope saw the row active in its sources or changed it (retirement guard)
318:drop function if exists public.reconcile_fact_sync_scope(text, jsonb);
323:create or replace function public.reconcile_fact_sync_scope(p_market text, p_rows jsonb, p_snapshot_at timestamptz default null)
344:revoke execute on function public.reconcile_fact_sync_scope(text, jsonb, timestamptz) from public, anon, authenticated;
345:grant execute on function public.reconcile_fact_sync_scope(text, jsonb, timestamptz) to service_role;
627:create or replace function public.replace_financial_metrics(p_issuer uuid, p_market text, p_based_on_rev bigint, p_rows jsonb)
635:  delete from public.financial_metrics where issuer_id = p_issuer and market = p_market;
636:  insert into public.financial_metrics (issuer_id, market, metric, period_start, period_end, duration, value, unit, input_unit, basis, formula_version, inputs, based_on_rev, as_of)
643:revoke execute on function public.replace_financial_metrics(uuid, text, bigint, jsonb) from public, anon, authenticated;
644:grant execute on function public.replace_financial_metrics(uuid, text, bigint, jsonb) to service_role;
648:create or replace function public.fact_state_rev(p_issuer uuid, p_market text)
652:revoke execute on function public.fact_state_rev(uuid, text) from public;
653:grant execute on function public.fact_state_rev(uuid, text) to anon, authenticated, service_role;
668:create or replace function public.read_facts(
707:  'state_rev', public.fact_state_rev(p_issuer, p_market),
713:revoke execute on function public.read_facts(uuid, text, text[], date, date, date, boolean, int, boolean) from public;
714:grant execute on function public.read_facts(uuid, text, text[], date, date, date, boolean, int, boolean) to anon, authenticated, service_role;
718:  foreach t in array array['fact_sync_runs','filings','financial_facts','financial_metrics','fact_sync_scope'] loop
722:  foreach t in array array['filings','financial_metrics'] loop
  add constraint dq_reconciliations_attempt_check check (attempt is null or attempt >= 1),
  -- Cycle result rows (T2) carry all four columns; old rows and out-of-cycle records carry none.
  add constraint dq_reconciliations_cycle_cols check ((cycle_id is null) = (issuer_id is null) and (cycle_id is null) = (market is null) and (cycle_id is null) = (attempt is null)),
  add constraint dq_reconciliations_numeric_sides check (kind <> 'numeric' or outcome <> 'compared' or (left_value is not null and right_value is not null)),
  -- text/date values live in detail.left_text/right_text; passed is string/date equality.
  add constraint dq_reconciliations_nonnumeric_sides check (kind = 'numeric' or (left_value is null and right_value is null and rel_diff is null and abs_diff is null));
create index if not exists dq_reconciliations_pair_created_idx on public.dq_reconciliations(pair, created_at desc);
-- The accepted-result marker: at most one row per cycle and key (apply_reconcile_result reuses it).
create unique index if not exists dq_reconciliations_cycle_key on public.dq_reconciliations(pair, cycle_id, natural_key) where cycle_id is not null;

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
create table if not exists public.dq_calendar_passes (
  market       text not null check (market in ('US','CN')),
  pass_id      uuid not null,
  started_at   timestamptz not null,
  finished_at  timestamptz,
  claimed_by   uuid references public.ingest_batches(batch_id) on delete set null,   -- one leased worker per market and pass
  claim_until  timestamptz,
  status       text not null default 'running' check (status in ('running','complete','complete_with_failures')),
  primary key (market, pass_id),
  constraint dcp_finished_iff_terminal check ((finished_at is null) = (status = 'running'))
48:create or replace function public.issuers_merge_target_active() returns trigger
55:      raise exception 'merge_target_not_active: issuer % cannot merge into % (status %)', new.issuer_id, new.merged_into, coalesce(target_status, 'missing')
61:    raise exception 'merge_target_has_referrers: issuer % is the merge target of other issuers and cannot become %', new.issuer_id, new.status
66:drop trigger if exists issuers_merge_target_active on public.issuers;
67:create trigger issuers_merge_target_active before insert or update of merged_into, status on public.issuers
68:  for each row execute function public.issuers_merge_target_active();

exec
/bin/zsh -lc "rg -n 'pending_members|首次|first cycle|set_merge|lineage_same_day' docs/plans | head -65; sed -n '718,760p' supabase/migrations/20261106090000_financial_facts.sql; rg -n 'financial_metrics' src/lib/facts | head -30; sed -n '320,345p' supabase/migrations/20261106090000_financial_facts.sql; find . -maxdepth 2 -iname '*claude.md' -o -iname '*agents.override.md'; nl -ba supabase/migrations/20261107091000_facts_extensions.sql | sed -n '324,342p'" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
rg: docs/plans: IO error for operation on docs/plans: No such file or directory (os error 2)
  foreach t in array array['fact_sync_runs','filings','financial_facts','financial_metrics','fact_sync_scope'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
  end loop;
  foreach t in array array['filings','financial_metrics'] loop
    execute format('grant select on public.%I to anon, authenticated, service_role', t);
    execute format('drop policy if exists "%s public read" on public.%I', t, t);
    execute format('create policy "%s public read" on public.%I for select using (true)', t, t);
  end loop;
  foreach t in array array['fact_sync_runs','fact_sync_scope'] loop
    execute format('grant select on public.%I to service_role', t);
    execute format('drop policy if exists "%s service read" on public.%I', t, t);
    execute format('create policy "%s service read" on public.%I for select to service_role using (true)', t, t);
  end loop;
end $$;
grant select on public.financial_facts to anon, authenticated, service_role;
drop policy if exists "financial_facts public read" on public.financial_facts;
create policy "financial_facts public read" on public.financial_facts for select to anon, authenticated using (status = 'ok');
drop policy if exists "financial_facts service read" on public.financial_facts;
create policy "financial_facts service read" on public.financial_facts for select to service_role using (true);
-- The one direct write: cninfo linking (§4.5 exception). Column-level; the trigger still forbids
-- anything else, and mapping_gen stays function-only.
grant update (document_ref, document_url, link_attempts) on public.filings to service_role;
drop policy if exists "filings service link update" on public.filings;
create policy "filings service link update" on public.filings for update to service_role using (true) with check (true);
src/lib/facts/facts.integration.test.ts:22:// replace_financial_metrics: replaying the plan-2 file alone would expose the plan-2 versions to
src/lib/facts/facts.integration.test.ts:25:const TABLES=['fact_sync_runs','filings','financial_facts','financial_metrics','fact_sync_scope'];
src/lib/facts/facts.integration.test.ts:133:  for(const t of ['filings','financial_facts','financial_metrics'])for(const role of ['anon','authenticated','service_role'])expect({t,role,ok:await priv(role,t,'SELECT')}).toEqual({t,role,ok:true});
src/lib/facts/facts.integration.test.ts:143:  for(const sig of ['public.begin_sync_run(uuid,text,uuid,int)','public.reconcile_fact_sync_scope(text,jsonb,timestamptz)','public.resolve_facts_quarantine(uuid,uuid[],uuid)','public.replace_financial_metrics(uuid,text,bigint,jsonb)']){
src/lib/facts/facts.integration.test.ts:384: it('replace_financial_metrics refuses a stale based_on_rev across publish and promote, and replaces the issuer atomically',async()=>{
src/lib/facts/facts.integration.test.ts:387:  const replace=(based:number,rows:unknown[])=>one(`select public.replace_financial_metrics($1,'US',$2,$3::jsonb) v`,[iss,based,JSON.stringify(rows)]);
src/lib/facts/facts.integration.test.ts:393:  expect(await q(`select metric,value_text,based_on_rev from public.financial_metrics where issuer_id=$1 order by metric`,[iss])).toEqual([{metric:'gross_margin',value_text:'0.6',based_on_rev:'2'},{metric:'net_margin',value_text:'0.7',based_on_rev:'2'}]);
src/lib/facts/facts.integration.test.ts:395:  expect(await q(`select 1 from public.financial_metrics where issuer_id=$1`,[iss])).toHaveLength(0);
src/lib/facts/facts.integration.test.ts:492:   await expect(c.query(`delete from public.financial_metrics where issuer_id=$1`,[iss])).rejects.toThrow(/permission denied/);
src/lib/facts/facts.integration.test.ts:501:    await expect(c.query(`select public.replace_financial_metrics($1,'US',1,'[]'::jsonb)`,[iss])).rejects.toThrow(/permission denied/);
src/lib/facts/db.ts:67:/** MetricRow → replace_financial_metrics row (issuer/market come from the call). */
src/lib/facts/db.ts:139:  async replaceMetrics(issuer,market,rev,input){return Number(await call<unknown>('replace_financial_metrics',{p_issuer:issuer,p_market:market,p_based_on_rev:rev,p_rows:input.map(metricArgs)}));},
src/lib/facts/db.ts:171:   // Pages may span a concurrent replace_financial_metrics: accept a read only when every row carries
src/lib/facts/db.ts:176:     const q=c.from('financial_metrics').select('*',from===0?{count:'exact'}:undefined).eq('issuer_id',issuer).eq('market',market).eq('formula_version',formulaVersion).order('metric').order('period_end').order('period_start').order('input_unit').order('basis') as Query;
src/lib/facts/pg-facts-db.ts:35:  replaceMetrics:(issuer,market,rev,input)=>fn<number>('public.replace_financial_metrics($1,$2,$3,$4::jsonb)',[issuer,market,rev,JSON.stringify(input.map(metricArgs))]),
src/lib/facts/pg-facts-db.ts:73:   return (await run(`select * from ${rel('financial_metrics')} where issuer_id = $1 and market = $2 and formula_version = $3 order by metric, period_end, period_start, input_unit, basis`,[issuer,market,formulaVersion])).rows.map(metricFromTable);
src/lib/facts/derive.ts:96: // Consolidated rows only: the metric vocabulary is consolidated-only and financial_metrics has no consolidation column in its key,
src/lib/facts/derive.ts:215:/** as_of = today; the envelope's state_rev guards replace_financial_metrics; stale_computation → re-read and recompute once. */
src/lib/facts/memory-facts-db.ts:241:   if(new Set(input.map(pk)).size!==input.length)throw new FactsDbError('duplicate_key','financial_metrics_pkey');
src/lib/facts/db.test.ts:109:  const totals:Record<string,number>={financial_metrics:1005,filings:1002,fact_sync_scope:3,financial_facts:2};
src/lib/facts/db.test.ts:113:   return Array.from({length:Math.max(0,Math.min(totals[table],to+1)-from)},(_,i)=>table==='financial_metrics'?metric(from+i):table==='filings'?{filing_id:`f${from+i}`,value_text:'1',created_at:'2026-01-01T00:00:00+00:00'}:table==='fact_sync_scope'?scope(from+i):{fact_id:`a${from+i}`,value_text:'1',created_at:'2026-01-01T00:00:00+00:00'});
-- priority > 0) is only retired if no reconcile changed it OR confirmed it active after that instant
-- (scope_confirmed_at <= p_snapshot_at): a newer reconcile's activation or unchanged confirmation survives an older, stale retirement. Upserts and activations always apply;
-- null p_snapshot_at applies everything (legacy callers, tests).
create or replace function public.reconcile_fact_sync_scope(p_market text, p_rows jsonb, p_snapshot_at timestamptz default null)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_market is null or p_market not in ('US','CN') then raise exception 'invalid_market' using errcode = '22023'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_rows' using errcode = '22023'; end if;
  insert into public.fact_sync_scope (issuer_id, market, reasons, priority, fetch_key)
  select distinct on ((x ->> 'issuer_id')) (x ->> 'issuer_id')::uuid, p_market, coalesce(x -> 'reasons', '[]'::jsonb), (x ->> 'priority')::int, x ->> 'fetch_key'
  from jsonb_array_elements(p_rows) x
  on conflict (issuer_id, market) do update
    set reasons = excluded.reasons, priority = excluded.priority, fetch_key = excluded.fetch_key, updated_at = now(), scope_confirmed_at = now()
    where (fact_sync_scope.reasons, fact_sync_scope.priority, fact_sync_scope.fetch_key)
          is distinct from (excluded.reasons, excluded.priority, excluded.fetch_key)
      and (p_snapshot_at is null or excluded.priority > 0 or fact_sync_scope.priority = 0 or fact_sync_scope.scope_confirmed_at <= p_snapshot_at);
  get diagnostics n = row_count;
  -- Unchanged active rows are confirmed too (not counted): a stale run's retirement must not win over them.
  update public.fact_sync_scope s set scope_confirmed_at = now()
  from jsonb_array_elements(p_rows) x
  where s.issuer_id = (x ->> 'issuer_id')::uuid and s.market = p_market and (x ->> 'priority')::int > 0 and s.priority > 0 and s.scope_confirmed_at < now();
  return n;
end $$;
revoke execute on function public.reconcile_fact_sync_scope(text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.reconcile_fact_sync_scope(text, jsonb, timestamptz) to service_role;
   324	  update public.issuers set status = 'merged', merged_into = p_target, updated_at = now() where issuer_id = p_source and status = 'active';
   325	  get diagnostics n = row_count;
   326	  if n <> 1 then raise exception 'source_not_active' using errcode = 'P0001'; end if;
   327	  update public.fact_sync_scope set state_rev = state_rev + 1, updated_at = now() where issuer_id = any(v_set);
   328	  -- the cycle advisory lock is already held (taken first, above)
   329	  update public.dq_reconcile_cycles c
   330	  set detail = jsonb_set(c.detail, '{pending_members}',
   331	        coalesce(case when jsonb_typeof(c.detail -> 'pending_members') = 'array' then c.detail -> 'pending_members' end, '[]'::jsonb)
   332	        || coalesce((select jsonb_agg(jsonb_build_object('issuer_id', p_target, 'market', mk.m, 'source', p_source) order by mk.m)
   333	                     from (values ('CN'), ('US')) as mk(m)
   334	                     where not (coalesce(case when jsonb_typeof(c.detail -> 'pending_members') = 'array' then c.detail -> 'pending_members' end, '[]'::jsonb)
   335	                                @> jsonb_build_array(jsonb_build_object('issuer_id', p_target, 'market', mk.m, 'source', p_source)))), '[]'::jsonb), true)
   336	  where c.pair = 'facts.lineage_same_day'
   337	    and c.cycle_id = (select y.cycle_id from public.dq_reconcile_cycles y where y.pair = 'facts.lineage_same_day' order by (y.status = 'running') desc, y.started_at desc limit 1);
   338	  insert into public.research_audit_log (user_id, actor, action, object_type, object_id, detail)
   339	  values (p_resolved_by, 'user', 'entities.merge', 'issuer', p_source, jsonb_build_object('source', p_source, 'target', p_target, 'repointed', cardinality(v_refs)));
   340	  return jsonb_build_object('repointed', cardinality(v_refs));
   341	end $$;
   342	revoke execute on function public.fact_set_merge_body(uuid, uuid, uuid) from public, anon, authenticated, service_role;

codex
The merge writer silently loses reconciliation registrations when no cycle exists yet. The added test covers only registration against an existing cycle.

Review comment:

- [P2] Persist pending merge members before the first cycle exists — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/supabase/migrations/20261107091000_facts_extensions.sql:336-337
  When `set_merge` runs before any `facts.lineage_same_day` cycle exists, this UPDATE affects zero rows, but the merge still commits successfully. Neither market's pending-member entry is persisted, so the promised registration for the next reconciliation cycle is silently lost. Persist pending members independently of an existing cycle, or create an appropriate initial record under the advisory lock; add a test with an empty cycle table rather than always inserting a cycle first.
The merge writer silently loses reconciliation registrations when no cycle exists yet. The added test covers only registration against an existing cycle.

Review comment:

- [P2] Persist pending merge members before the first cycle exists — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/supabase/migrations/20261107091000_facts_extensions.sql:336-337
  When `set_merge` runs before any `facts.lineage_same_day` cycle exists, this UPDATE affects zero rows, but the merge still commits successfully. Neither market's pending-member entry is persisted, so the promised registration for the next reconciliation cycle is silently lost. Persist pending members independently of an existing cycle, or create an appropriate initial record under the advisory lock; add a test with an empty cycle table rather than always inserting a cycle first.

OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1ae84-a230-71e2-a01d-adf2390bcd74
--------
user
commit 52c5414
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 52c5414; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 565ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-zf1g1GUw' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-ZwPrOBvd' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-mYAR48ns' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-EF7rHJmN' (errno=Operation not permitted)
52c5414 feat(dq): migration one schema — window methods, claim/1 columns, reconcile and calendar tables, reconcile-raw bucket
 scripts/ci/research-checks.ts                      |   2 +-
 src/lib/dq/dq-foundation.integration.test.ts       |   4 +-
 src/lib/entities/identifiers.integration.test.ts   | 407 +++++++++++++++++++++
 src/lib/entities/issuers.integration.test.ts       |   7 +-
 src/lib/entities/securities.ts                     |   5 +-
 src/lib/supabase/database.types.ts                 | 129 ++++++-
 .../20261107090000_identifiers_and_dq.sql          | 273 ++++++++++++++
 7 files changed, 817 insertions(+), 10 deletions(-)

exec
/bin/zsh -lc 'pwd; for p in /AGENTS.md /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do if test -f "$p"; then echo "$p"; cat "$p"; fi; done; ls -a | head -30; git show 52c5414 -- supabase/migrations/20261107090000_identifiers_and_dq.sql src/lib/entities/securities.ts scripts/ci/research-checks.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md
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
git: error: couldn't create cache file '/tmp/xcrun_db-EFpiAMde' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-lMLKs3Fq' (errno=Operation not permitted)
commit 52c5414677c46d6160b41760d563eaaf621bfaf4
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Thu Nov 5 17:23:28 2026 -0800

    feat(dq): migration one schema — window methods, claim/1 columns, reconcile and calendar tables, reconcile-raw bucket
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/scripts/ci/research-checks.ts b/scripts/ci/research-checks.ts
index f04623c..b09ee48 100644
--- a/scripts/ci/research-checks.ts
+++ b/scripts/ci/research-checks.ts
@@ -12,7 +12,7 @@ export const criticalSuites = [
   'entity-keys/entity-keys.integration.test.ts', 'ledger/calls-import.integration.test.ts',
   'cluster/alignments.integration.test.ts', 'fanout/run.integration.test.ts',
   'cards/cards.integration.test.ts', 'thesis-extension.integration.test.ts', 'weekly/weekly.integration.test.ts',
-].map(p => `src/lib/research/${p}`).concat('src/lib/observability/quote-snapshot.integration.test.ts', 'src/lib/analyst/recommendations-append-only.integration.test.ts', 'src/lib/dq/dq-foundation.integration.test.ts', 'src/lib/entities/issuers.integration.test.ts', 'src/lib/entities/issuers-write.integration.test.ts', 'src/lib/facts/facts.integration.test.ts', 'src/lib/facts/sync-us.integration.test.ts');
+].map(p => `src/lib/research/${p}`).concat('src/lib/observability/quote-snapshot.integration.test.ts', 'src/lib/analyst/recommendations-append-only.integration.test.ts', 'src/lib/dq/dq-foundation.integration.test.ts', 'src/lib/entities/issuers.integration.test.ts', 'src/lib/entities/issuers-write.integration.test.ts', 'src/lib/facts/facts.integration.test.ts', 'src/lib/facts/sync-us.integration.test.ts', 'src/lib/entities/identifiers.integration.test.ts');
 
 export function migrationInventory(root = process.cwd()) {
   const directory = join(root, 'supabase/migrations');
diff --git a/src/lib/entities/securities.ts b/src/lib/entities/securities.ts
index efb389f..05fa39e 100644
--- a/src/lib/entities/securities.ts
+++ b/src/lib/entities/securities.ts
@@ -49,7 +49,10 @@ export async function attachSecurity(client:TableClient,raw:IssuerSecurityInput)
  try{
   await client.insert('issuer_securities',{
    issuer_id:sec.issuer_id,ticker:sec.ticker,isin:sec.isin,figi:sec.figi??null,share_class:sec.share_class,
-   is_primary:sec.is_primary??false,valid_from:sec.valid_from,valid_to:sec.valid_to,source:sec.source,provenance:sec.provenance??{},
+   is_primary:sec.is_primary??false,valid_from:sec.valid_from,valid_to:sec.valid_to,
+   // interim (plan 3 Task 1a): same rule as the migration backfill; Task 2b makes callers name the method
+   valid_to_method:sec.valid_to===null?null:(sec.source==='curated'?'curated':'unrecorded'),
+   source:sec.source,provenance:sec.provenance??{},
   });
   return 'inserted';
  }catch(e){
diff --git a/supabase/migrations/20261107090000_identifiers_and_dq.sql b/supabase/migrations/20261107090000_identifiers_and_dq.sql
new file mode 100644
index 0000000..e7355ed
--- /dev/null
+++ b/supabase/migrations/20261107090000_identifiers_and_dq.sql
@@ -0,0 +1,273 @@
+-- supabase/migrations/20261107090000_identifiers_and_dq.sql
+-- Data foundation 3, migration one (spec 2026-11-04-data-foundation-3 §3.1; plan 3 Tasks 1a/1b).
+-- issuer_securities gains evidence methods for both window ends; issuer_identifier_claims becomes
+-- the claim/1 review queue (op, target_key, detail, resolution columns); dq_reconciliations gains
+-- pair/kind/outcome/detail and the cycle-result columns; new tables hold reconcile cycles and
+-- cursors, calendar passes and their frozen members, filer categories, filing expectations and
+-- filing profiles; dq_freshness accepts 'weekly'; bucket reconcile-raw stores raw evidence.
+-- Replayable: every column added to an existing table is added together with its one-time backfill
+-- inside a guard on information_schema.columns, so a replay never rewrites evidence written after
+-- the first run (spec §3). Constraints are dropped-if-exists then added (old rows satisfy them).
+-- New tables are service-role only (RLS on, client roles revoked; service_role gets only what its
+-- writers need — function-written tables are SELECT only). Business writes go through the security
+-- definer functions in the second half (Task 1b); errors carry the code as the message.
+-- The hosted postgres role is not a superuser: no `alter function … owner`; search_path = public.
+-- Only the buckets table is referenced (local harness).
+
+-- ---------------------------------------------------------------- issuer_securities: window-end methods (§3.1, §4.3.1)
+do $$ begin
+  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'issuer_securities' and column_name = 'valid_from_method') then
+    alter table public.issuer_securities
+      add column valid_from_method text not null default 'first_observed',
+      add column valid_to_method text;
+    -- One-time backfill: curated rows were entered by hand; a closed row of any other source has no
+    -- evidence for its end (an observation bound, 'unrecorded').
+    update public.issuer_securities set valid_from_method = 'curated' where source = 'curated';
+    update public.issuer_securities set valid_to_method = case source when 'curated' then 'curated' else 'unrecorded' end where valid_to is not null;
+  end if;
+end $$;
+alter table public.issuer_securities
+  drop constraint if exists issuer_securities_valid_from_method_check,
+  drop constraint if exists issuer_securities_valid_to_method_check,
+  drop constraint if exists issuer_securities_to_method_iff_to,
+  add constraint issuer_securities_valid_from_method_check check (valid_from_method in ('first_observed','listing_date','ticker_change','curated')),
+  add constraint issuer_securities_valid_to_method_check check (valid_to_method is null or valid_to_method in ('delisting','ticker_change','sec_file_absent','curated','merge_close','unrecorded')),
+  add constraint issuer_securities_to_method_iff_to check ((valid_to is null) = (valid_to_method is null));
+
+-- ---------------------------------------------------------------- issuer_identifier_claims: claim/1 (§3.1, §4.2.1)
+do $$ begin
+  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'issuer_identifier_claims' and column_name = 'op') then
+    -- Existing rows become op='legacy', target_key='', detail='{}' through the defaults: they cannot be
+    -- resolved by the route, only by runbook §4 SQL or rejection.
+    alter table public.issuer_identifier_claims
+      add column op text not null default 'legacy',
+      add column target_key text not null default '',
+      add column detail jsonb not null default '{}',
+      add column resolved_by uuid,
+      add column resolved_at timestamptz;
+  end if;
+end $$;
+alter table public.issuer_identifier_claims alter column confidence drop not null;
+alter table public.issuer_identifier_claims
+  drop constraint if exists issuer_identifier_claims_id_type_check,
+  drop constraint if exists issuer_identifier_claims_op_check,
+  drop constraint if exists issuer_identifier_claims_target_key_check,
+  drop constraint if exists issuer_identifier_claims_target_key_required,
+  drop constraint if exists issuer_identifier_claims_detail_object,
+  drop constraint if exists issuer_identifier_claims_pending_has_no_resolution,
+  add constraint issuer_identifier_claims_id_type_check check (id_type in ('lei','cik','usci','isin','figi','cninfo_org_id','ticker')),
+  add constraint issuer_identifier_claims_op_check check (op in ('legacy','evidence_only','set_identifier','correct_identifier','attach_security','close_security','backdate_window')),
+  add constraint issuer_identifier_claims_target_key_check check (length(target_key) <= 256),
+  add constraint issuer_identifier_claims_target_key_required check (op = 'legacy' or length(target_key) > 0),
+  add constraint issuer_identifier_claims_detail_object check (jsonb_typeof(detail) = 'object'),
+  add constraint issuer_identifier_claims_pending_has_no_resolution check (status <> 'pending' or resolved_at is null);
+-- At most one PENDING claim per (issuer, id_type, value, op, target): fileClaim converges concurrent
+-- filers on it (23505 → append evidence to the winner's detail.sources).
+drop index if exists public.issuer_identifier_claims_pending_unique;
+create unique index issuer_identifier_claims_pending_unique on public.issuer_identifier_claims(issuer_id, id_type, value, op, target_key) where status = 'pending';
+
+-- ---------------------------------------------------------------- dq_reconciliations: pairs, kinds, outcomes, cycle rows (§3.1, T2)
+do $$ begin
+  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'dq_reconciliations' and column_name = 'pair') then
+    alter table public.dq_reconciliations
+      add column pair text not null default 'legacy',
+      add column kind text not null default 'numeric',
+      add column outcome text not null default 'compared',
+      add column detail jsonb not null default '{}',
+      add column cycle_id text,
+      add column issuer_id uuid,
+      add column market text,
+      add column attempt int;
+    -- The table had no writer before this migration (production is empty); any row is legacy.
+    update public.dq_reconciliations set outcome = 'legacy';
+  end if;
+end $$;
+alter table public.dq_reconciliations
+  drop constraint if exists dq_reconciliations_pair_check,
+  drop constraint if exists dq_reconciliations_kind_check,
+  drop constraint if exists dq_reconciliations_outcome_check,
+  drop constraint if exists dq_reconciliations_detail_object,
+  drop constraint if exists dq_reconciliations_market_check,
+  drop constraint if exists dq_reconciliations_attempt_check,
+  drop constraint if exists dq_reconciliations_cycle_cols,
+  drop constraint if exists dq_reconciliations_numeric_sides,
+  drop constraint if exists dq_reconciliations_nonnumeric_sides,
+  add constraint dq_reconciliations_pair_check check (length(pair) between 1 and 64),
+  add constraint dq_reconciliations_kind_check check (kind in ('numeric','text','date')),
+  add constraint dq_reconciliations_outcome_check check (outcome in ('compared','left_missing','left_unlinked','left_ambiguous','right_missing','unsupported','right_ambiguous','incomplete_gold','legacy')),
+  add constraint dq_reconciliations_detail_object check (jsonb_typeof(detail) = 'object'),
+  add constraint dq_reconciliations_market_check check (market is null or market in ('US','CN')),
+  add constraint dq_reconciliations_attempt_check check (attempt is null or attempt >= 1),
+  -- Cycle result rows (T2) carry all four columns; old rows and out-of-cycle records carry none.
+  add constraint dq_reconciliations_cycle_cols check ((cycle_id is null) = (issuer_id is null) and (cycle_id is null) = (market is null) and (cycle_id is null) = (attempt is null)),
+  add constraint dq_reconciliations_numeric_sides check (kind <> 'numeric' or outcome <> 'compared' or (left_value is not null and right_value is not null)),
+  -- text/date values live in detail.left_text/right_text; passed is string/date equality.
+  add constraint dq_reconciliations_nonnumeric_sides check (kind = 'numeric' or (left_value is null and right_value is null and rel_diff is null and abs_diff is null));
+create index if not exists dq_reconciliations_pair_created_idx on public.dq_reconciliations(pair, created_at desc);
+-- The accepted-result marker: at most one row per cycle and key (apply_reconcile_result reuses it).
+create unique index if not exists dq_reconciliations_cycle_key on public.dq_reconciliations(pair, cycle_id, natural_key) where cycle_id is not null;
+
+-- ---------------------------------------------------------------- dq_freshness: weekly cadence (§3.1)
+alter table public.dq_freshness
+  drop constraint if exists dq_freshness_expected_cadence_check,
+  add constraint dq_freshness_expected_cadence_check check (expected_cadence in ('daily','weekly','monthly','quarterly','event'));
+
+-- ---------------------------------------------------------------- reconcile cycles and cursor (§3.1, §5.5)
+create table if not exists public.dq_reconcile_cycles (
+  pair                text not null check (length(pair) between 1 and 64),
+  cycle_id            text not null check (length(cycle_id) between 1 and 64),
+  started_at          timestamptz not null,
+  finished_at         timestamptz,
+  members             jsonb not null,                                -- frozen [{issuer_id, market, expected_keys}]
+  status              text not null check (status in ('running','complete','complete_with_gaps')),
+  expected_total      int not null check (expected_total >= 0),
+  compared_passed     int not null default 0 check (compared_passed >= 0),
+  compared_failed     int not null default 0 check (compared_failed >= 0),
+  not_compared        int not null default 0 check (not_compared >= 0),
+  exec_failed_members int not null default 0 check (exec_failed_members >= 0),
+  detail              jsonb not null default '{}',                   -- pending_members (set_merge, migration two) and settlement notes
+  primary key (pair, cycle_id),
+  constraint dq_reconcile_cycles_members_array check (jsonb_typeof(members) = 'array'),
+  constraint dq_reconcile_cycles_detail_object check (jsonb_typeof(detail) = 'object'),
+  constraint dq_reconcile_cycles_finished_iff_terminal check ((finished_at is null) = (status = 'running'))
+);
+create unique index if not exists dq_reconcile_cycles_running_uniq on public.dq_reconcile_cycles(pair) where status = 'running';
+
+create table if not exists public.dq_reconcile_cursor (
+  pair             text not null,
+  cycle_id         text not null,
+  issuer_id        uuid not null references public.issuers(issuer_id) on delete restrict,
+  market           text not null check (market in ('US','CN')),
+  expected         int not null,                                     -- this member's expected key count (frozen)
+  state            text not null default 'pending' check (state in ('pending','claimed','done','failed')),
+  claimed_by       uuid references public.ingest_batches(batch_id) on delete set null,
+  claim_until      timestamptz,
+  attempts         int not null default 0 check (attempts >= 0),
+  last_error       text,
+  done_at          timestamptz,
+  compared_passed  int,
+  compared_failed  int,
+  not_compared     int,
+  primary key (pair, cycle_id, issuer_id, market),
+  constraint dq_reconcile_cursor_cycle_fkey foreign key (pair, cycle_id) references public.dq_reconcile_cycles(pair, cycle_id) on delete restrict,
+  constraint drc_expected_nonneg check (expected >= 0),
+  constraint drc_counters_nonneg check ((compared_passed is null or compared_passed >= 0) and (compared_failed is null or compared_failed >= 0) and (not_compared is null or not_compared >= 0)),
+  -- S5: a done row has all three counters, non-null, summing to expected; settlement never coalesces.
+  constraint drc_done_accounted check (state <> 'done' or (compared_passed is not null and compared_failed is not null and not_compared is not null and compared_passed + compared_failed + not_compared = expected))
+);
+create index if not exists dq_reconcile_cursor_state_idx on public.dq_reconcile_cursor(pair, cycle_id, state);
+
+-- ---------------------------------------------------------------- calendar passes (§3.1, §6.2, T3/U1)
+create table if not exists public.dq_calendar_passes (
+  market       text not null check (market in ('US','CN')),
+  pass_id      uuid not null,
+  started_at   timestamptz not null,
+  finished_at  timestamptz,
+  claimed_by   uuid references public.ingest_batches(batch_id) on delete set null,   -- one leased worker per market and pass
+  claim_until  timestamptz,
+  status       text not null default 'running' check (status in ('running','complete','complete_with_failures')),
+  primary key (market, pass_id),
+  constraint dcp_finished_iff_terminal check ((finished_at is null) = (status = 'running'))
+);
+create unique index if not exists dq_calendar_passes_open_uniq on public.dq_calendar_passes(market) where finished_at is null;
+
+-- Frozen when the pass is created (in-scope issuers); scope changes during a pass go to the next one.
+create table if not exists public.dq_calendar_pass_members (
+  market      text not null,
+  pass_id     uuid not null,
+  issuer_id   uuid not null references public.issuers(issuer_id) on delete restrict,
+  state       text not null default 'pending' check (state in ('pending','done','failed')),
+  attempts    int not null default 0 check (attempts >= 0),
+  last_error  text,
+  done_at     timestamptz,
+  primary key (market, pass_id, issuer_id),
+  constraint dq_calendar_pass_members_pass_fkey foreign key (market, pass_id) references public.dq_calendar_passes(market, pass_id) on delete restrict
+);
+create index if not exists dq_calendar_pass_members_state_idx on public.dq_calendar_pass_members(market, pass_id, state);
+
+-- ---------------------------------------------------------------- filer categories, expectations, profiles (§3.1, §6.1)
+-- Per fiscal year, from that year's 10-K cover page (iXBRL dei), never from submissions.category.
+create table if not exists public.issuer_filer_categories (
+  issuer_id          uuid not null references public.issuers(issuer_id) on delete restrict,
+  fiscal_year        int not null,
+  acceleration       text not null check (acceleration in ('large_accelerated','accelerated','non_accelerated')),
+  smaller_reporting  boolean,
+  category_raw       text not null check (length(category_raw) between 1 and 256),
+  source             text not null check (source in ('ixbrl_dei')),
+  accession          text not null check (length(accession) between 1 and 32),
+  evidence_sha256    text not null check (evidence_sha256 ~ '^[0-9a-f]{64}$'),
+  as_of              date not null,
+  primary key (issuer_id, fiscal_year)
+);
+
+create table if not exists public.dq_filing_expectations (
+  issuer_id            uuid not null references public.issuers(issuer_id) on delete restrict,
+  market               text not null check (market in ('US','CN')),
+  report_kind          text not null check (report_kind in ('10-K','10-Q','20-F','40-F','annual','semiannual','q1','q3')),
+  period_end           date not null,
+  period_end_estimated boolean not null default false,
+  deadline_state       text not null check (deadline_state in ('statutory','estimated','no_rule')),
+  due_date             date,
+  due_rule             text not null check (length(due_rule) between 1 and 64),
+  expected_date        date,                                            -- CN appointment date (same period)
+  upstream_lookup      text not null check (upstream_lookup in ('ok','unavailable','not_applicable')),
+  upstream_filed_date  date,
+  disclosure_state     text not null check (disclosure_state in ('pending','overdue','filed_not_ingested','received','received_late','unknown_upstream')),
+  received_filing_id   uuid,
+  received_date        date,
+  profile_as_of        date,
+  detail               jsonb not null default '{}',
+  computed_at          timestamptz not null,
+  batch_id             uuid not null references public.ingest_batches(batch_id) on delete restrict,
+  primary key (issuer_id, market, report_kind, period_end),
+  constraint dq_filing_expectations_detail_object check (jsonb_typeof(detail) = 'object'),
+  -- deadline_state and disclosure_state are orthogonal: a no_rule row may still be received.
+  constraint dfe_due_iff_known check ((due_date is null) = (deadline_state = 'no_rule')),
+  constraint dfe_received_iff check ((disclosure_state in ('received','received_late')) = (received_filing_id is not null and received_date is not null)),
+  constraint dfe_late_requires_due check (disclosure_state <> 'received_late' or due_date is not null),
+  -- estimated rows are never overdue: past due they stay pending with detail.estimated_due_passed=true
+  constraint dfe_overdue_requires_statutory check (disclosure_state <> 'overdue' or deadline_state = 'statutory'),
+  constraint dfe_unknown_upstream_iff check ((disclosure_state = 'unknown_upstream') = (upstream_lookup = 'unavailable' and received_filing_id is null))
+);
+create index if not exists dq_filing_expectations_state_idx on public.dq_filing_expectations(market, disclosure_state, due_date);
+
+create table if not exists public.issuer_filing_profiles (
+  issuer_id             uuid not null references public.issuers(issuer_id) on delete restrict,
+  market                text not null check (market in ('US','CN')),
+  category_raw_current  text,                                           -- submissions.category as written; reference only, never decides a deadline
+  regime                text not null check (regime in ('10-K','20-F','40-F','cn')),
+  fiscal_year_end       text check (fiscal_year_end ~ '^(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])$'),
+  week52_pattern        boolean not null default false,
+  source                text not null check (length(source) between 1 and 64),
+  source_sha256         text check (source_sha256 is null or source_sha256 ~ '^[0-9a-f]{64}$'),
+  as_of                 date not null,
+  updated_at            timestamptz not null default now(),
+  primary key (issuer_id, market)
+);
+
+-- ---------------------------------------------------------------- privileges (service-role only)
+do $$ declare t text; begin
+  foreach t in array array['dq_reconcile_cycles','dq_reconcile_cursor','dq_calendar_passes','dq_calendar_pass_members','issuer_filer_categories','dq_filing_expectations','issuer_filing_profiles'] loop
+    execute format('alter table public.%I enable row level security', t);
+    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
+  end loop;
+end $$;
+-- run.ts creates and settles cycles and inserts the frozen cursor rows; claiming, completing and
+-- failing a cursor row happen only in migration two's functions (fenced).
+grant select, insert, update on public.dq_reconcile_cycles to service_role;
+grant select, insert on public.dq_reconcile_cursor to service_role;
+-- Written only by the pass functions below (fenced): read-only for every client role.
+grant select on public.dq_calendar_passes, public.dq_calendar_pass_members, public.dq_filing_expectations to service_role;
+-- Plain registries written by the calendar sync and filer-category scripts through TableClient.
+grant select, insert, update, delete on public.issuer_filer_categories, public.issuer_filing_profiles to service_role;
+
+-- ---------------------------------------------------------------- bucket reconcile-raw (§3.1)
+-- Content-addressed raw evidence (<kind>/<sha256>.<ext>), private, no object-level policy, so only
+-- the service role reaches it. Uploads use upsert:false; 409 means the bytes are already stored.
+insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
+values ('reconcile-raw', 'reconcile-raw', false, 52428800,
+        array['application/json','text/html','application/pdf','text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/zip'])
+on conflict (id) do update
+set public = false,
+    file_size_limit = excluded.file_size_limit,
+    allowed_mime_types = excluded.allowed_mime_types;

exec
/bin/zsh -lc "git show 52c5414 -- src/lib/entities/identifiers.integration.test.ts src/lib/entities/issuers.integration.test.ts src/lib/dq/dq-foundation.integration.test.ts src/lib/supabase/database.types.ts; rg 'valid_to|issuer_identifier_claims' supabase/migrations/*issuer* src/lib/entities -n" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-HIdny1Tj' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-BxeKA5vH' (errno=Operation not permitted)
commit 52c5414677c46d6160b41760d563eaaf621bfaf4
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Thu Nov 5 17:23:28 2026 -0800

    feat(dq): migration one schema — window methods, claim/1 columns, reconcile and calendar tables, reconcile-raw bucket
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/dq/dq-foundation.integration.test.ts b/src/lib/dq/dq-foundation.integration.test.ts
index b55041b..f2a305f 100644
--- a/src/lib/dq/dq-foundation.integration.test.ts
+++ b/src/lib/dq/dq-foundation.integration.test.ts
@@ -82,7 +82,7 @@ describe.skipIf(!enabled)('WP-F0 dq foundation on real PostgreSQL',()=>{
 
   await admin.query(`insert into public.dq_freshness(dataset,expected_cadence,status) values($1,'daily','missing')`,[d]);
   const f2=newDs();
-  await expect(admin.query(`insert into public.dq_freshness(dataset,expected_cadence,status) values($1,'weekly','missing')`,[f2])).rejects.toThrow(/dq_freshness_expected_cadence_check/);
+  await expect(admin.query(`insert into public.dq_freshness(dataset,expected_cadence,status) values($1,'hourly','missing')`,[f2])).rejects.toThrow(/dq_freshness_expected_cadence_check/);
   await expect(admin.query(`insert into public.dq_freshness(dataset,expected_cadence,status,consecutive_errors) values($1,'daily','error',-1)`,[f2])).rejects.toThrow(/dq_freshness_consecutive_errors_check/);
   await expect(admin.query(`insert into public.dq_freshness(dataset,expected_cadence,status) values($1,'daily','fresh')`,[f2])).rejects.toThrow(/dq_freshness_ok_requires_last_ok/);
  });
@@ -111,7 +111,7 @@ describe.skipIf(!enabled)('WP-F0 dq foundation on real PostgreSQL',()=>{
 
   const reconciled=await insertBatch(d);
   const recId=randomUUID();
-  await admin.query(`insert into public.dq_reconciliations(id,dataset,left_source,right_source,natural_key,tolerance,passed,batch_id) values($1,$2,'a','b','k',0,true,$3)`,[recId,d,reconciled]);
+  await admin.query(`insert into public.dq_reconciliations(id,dataset,left_source,right_source,natural_key,left_value,right_value,tolerance,passed,batch_id) values($1,$2,'a','b','k',1,1,0,true,$3)`,[recId,d,reconciled]);
   await admin.query(`delete from public.ingest_batches where batch_id=$1`,[reconciled]);
   const rec=(await admin.query(`select batch_id from public.dq_reconciliations where id=$1`,[recId])).rows[0];
   expect(rec.batch_id).toBeNull();
diff --git a/src/lib/entities/identifiers.integration.test.ts b/src/lib/entities/identifiers.integration.test.ts
new file mode 100644
index 0000000..7b4fa64
--- /dev/null
+++ b/src/lib/entities/identifiers.integration.test.ts
@@ -0,0 +1,407 @@
+// src/lib/entities/identifiers.integration.test.ts
+// Plan 3 Task 1 (spec 3 §3.1, §9.2): migration 20261107090000 on real PostgreSQL. Task 1a covers the
+// guarded column additions and their one-time backfill (a seeded pre-migration database is upgraded,
+// new evidence is written, then the migration is replayed and must not rewrite it), every new
+// constraint, service-role-only privileges on the new tables and the reconcile-raw bucket. Task 1b
+// appends resolve_identifier_claim, the calendar pass functions and the topology guard.
+// test:db builds a fresh cluster per run, so rows are not cleaned up (every test uses its own
+// issuers and tickers). Calendar passes are the one shared resource (one open pass per market):
+// every test that touches them runs inside withCalendarLock, a session advisory lock shared with
+// Task 18's calendar.integration.test.ts.
+import {readFileSync,readdirSync} from 'node:fs';
+import {randomBytes,randomUUID} from 'node:crypto';
+import {join} from 'node:path';
+import {Pool} from 'pg';
+import {afterAll,beforeAll,describe,expect,it} from 'vitest';
+
+const enabled=!!process.env.S4_TEST_STATE;
+const MIGRATION='supabase/migrations/20261107090000_identifiers_and_dq.sql';
+const VERSION='20261107090000';
+const NEW_TABLES=['dq_reconcile_cycles','dq_reconcile_cursor','dq_calendar_passes','dq_calendar_pass_members','issuer_filer_categories','dq_filing_expectations','issuer_filing_profiles'];
+const hex=(n:number)=>randomBytes(n).toString('hex').toUpperCase();
+const SHA='a'.repeat(64);
+
+// Same replay policy as dq-foundation.integration.test.ts (not exported there): one transaction,
+// short lock_timeout, retry on lock timeout (55P03) and deadlock (40P01).
+const RETRYABLE=new Set(['55P03','40P01']);
+async function replayMigration(pool:Pool,sql:string,attempts=10):Promise<void>{
+ for(let attempt=1;;attempt++){
+  const c=await pool.connect();
+  try{
+   await c.query(`begin; set local lock_timeout='3s';\n${sql}\n;commit;`);
+   return;
+  }catch(e){
+   await c.query('rollback').catch(()=>{});
+   const code=(e as {code?:string}).code;
+   if(attempt>=attempts||!code||!RETRYABLE.has(code))throw e;
+   await new Promise(r=>setTimeout(r,250*attempt+Math.floor(Math.random()*250)));   // jittered backoff: other suites hold locks on the shared DB
+  }finally{c.release();}
+ }
+}
+
+type PgErr={message:string;code?:string};
+/** Resolves with the rejection (message + SQLSTATE) so tests can assert both. */
+const fails=(p:Promise<unknown>)=>p.then(()=>{throw new Error('expected rejection');},e=>e as PgErr);
+
+// The bootstrap scripts/s4/local-db.ts runs before the migrations (roles are cluster-wide and exist).
+const BOOTSTRAP=`create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
+ create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
+ create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
+ create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`;
+
+/** A throwaway database in the same cluster, migrated up to (not including) `version`; dropped afterwards. */
+async function withPreMigrationDatabase(adminUrl:string,version:string,body:(db:Pool)=>Promise<void>):Promise<void>{
+ const name='df3_upgrade_'+randomBytes(4).toString('hex');
+ const root=new Pool({connectionString:adminUrl,max:1});
+ await root.query(`create database ${name}`);
+ const url=new URL(adminUrl);url.pathname=`/${name}`;
+ const db=new Pool({connectionString:url.toString(),max:2});
+ try{
+  await db.query(BOOTSTRAP);
+  for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')&&f<version).sort()){
+   try{await db.query(readFileSync(join('supabase/migrations',f),'utf8'));}
+   catch(e){throw new Error(`pre-migration ${f}: ${(e as Error).message}`);}
+  }
+  await body(db);
+ }finally{
+  await db.end();
+  await root.query(`drop database if exists ${name} with (force)`);
+  await root.end();
+ }
+}
+
+/**
+ * Calendar passes are one-open-per-market shared state. Every suite that touches them holds this
+ * session advisory lock for the body and closes any open pass before and after, so concurrent
+ * suites never see each other's leases (Task 18b's calendar.integration.test.ts uses the same key).
+ * Plan 3 advisory-lock registry (接口对齐记录 #4): 724311001 = CALENDAR_TEST_LOCK (test-only, session);
+ * the SQL function claim_calendar_pass uses pg_advisory_xact_lock(hashtext('dq_calendar_pass:'||market)).
+ */
+const CALENDAR_TEST_LOCK=724_311_001;
+async function withCalendarLock(pool:Pool,body:()=>Promise<void>):Promise<void>{
+ const c=await pool.connect();
+ try{
+  await c.query('select pg_advisory_lock($1)',[CALENDAR_TEST_LOCK]);
+  const close=()=>c.query(`update public.dq_calendar_passes set status='complete_with_failures',finished_at=clock_timestamp() where finished_at is null`);
+  await close();
+  try{await body();}finally{await close();}
+ }finally{
+  await c.query('select pg_advisory_unlock($1)',[CALENDAR_TEST_LOCK]).catch(()=>{});
+  c.release();
+ }
+}
+
+let admin:Pool;
+let adminUrl:string;
+const q=async(text:string,values:unknown[]=[])=>(await admin.query(text,values)).rows as Record<string,any>[];
+const insertRow=(table:string,row:Record<string,unknown>)=>{
+ const cols=Object.keys(row);
+ return admin.query(`insert into public.${table}(${cols.join(',')}) values(${cols.map((_,i)=>`$${i+1}`).join(',')})`,Object.values(row));
+};
+const issuer=async(name='ZZ Ident Test')=>{const id=randomUUID();await q(`insert into public.issuers(issuer_id,canonical_name_en) values($1,$2)`,[id,name]);return id;};
+const ticker=async(market='US')=>{
+ const t='ZZ'+hex(4);
+ const r=await q(`insert into public.stocks_universe(ticker,name,market) values($1,'Ident Test',$2) on conflict (ticker) do nothing returning ticker`,[t,market]);
+ if(r.length!==1)throw new Error('ZZ test ticker collided');
+ return t;
+};
+const batch=async(dataset='dq.calendar.cn',producer='filing-calendar')=>{const id=randomUUID();await q(`insert into public.ingest_batches(batch_id,producer,dataset) values($1,$2,$3)`,[id,producer,dataset]);return id;};
+/** issuer_securities row with source 'test' (so the default method is first_observed) plus `extra` columns. */
+const sec=(iss:string,t:string,from:string,to:string|null,extra:Record<string,unknown>={})=>insertRow('issuer_securities',{issuer_id:iss,ticker:t,valid_from:from,valid_to:to,source:'test',...extra});
+
+beforeAll(async()=>{
+ if(!enabled)return;
+ adminUrl=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8')).adminUrl;
+ admin=new Pool({connectionString:adminUrl});
+});
+afterAll(async()=>{await admin?.end();});
+
+describe.skipIf(!enabled)('plan 3 migration one: schema',()=>{
+ it('adds the columns, creates seven service-role-only tables and the reconcile-raw bucket, and replays twice',async()=>{
+  const cols=await q(`select table_name,column_name from information_schema.columns where table_schema='public' and (table_name,column_name) in (
+   ('issuer_securities','valid_from_method'),('issuer_securities','valid_to_method'),
+   ('issuer_identifier_claims','op'),('issuer_identifier_claims','target_key'),('issuer_identifier_claims','detail'),('issuer_identifier_claims','resolved_by'),('issuer_identifier_claims','resolved_at'),
+   ('dq_reconciliations','pair'),('dq_reconciliations','kind'),('dq_reconciliations','outcome'),('dq_reconciliations','detail'),
+   ('dq_reconciliations','cycle_id'),('dq_reconciliations','issuer_id'),('dq_reconciliations','market'),('dq_reconciliations','attempt'))`);
+  expect(cols).toHaveLength(15);
+  expect(await q(`select is_nullable from information_schema.columns where table_schema='public' and table_name='issuer_identifier_claims' and column_name='confidence'`)).toEqual([{is_nullable:'YES'}]);
+  const rls=await q(`select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1) order by c.relname`,[NEW_TABLES]);
+  expect(rls).toEqual([...NEW_TABLES].sort().map(relname=>({relname,relrowsecurity:true})));
+  expect(await q(`select tablename from pg_policies where schemaname='public' and tablename=any($1)`,[NEW_TABLES])).toEqual([]);
+  for(const role of ['anon','authenticated'])for(const t of [...NEW_TABLES,'issuer_identifier_claims'])for(const priv of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']){
+   const ok=(await q(`select has_table_privilege($1,'public.'||$2,$3) ok`,[role,t,priv]))[0].ok;
+   expect({role,t,priv,ok}).toEqual({role,t,priv,ok:false});
+  }
+  const SERVICE:Record<string,string[]>={
+   dq_reconcile_cycles:['SELECT','INSERT','UPDATE'],dq_reconcile_cursor:['SELECT','INSERT'],
+   dq_calendar_passes:['SELECT'],dq_calendar_pass_members:['SELECT'],dq_filing_expectations:['SELECT'],
+   issuer_filer_categories:['SELECT','INSERT','UPDATE','DELETE'],issuer_filing_profiles:['SELECT','INSERT','UPDATE','DELETE'],
+  };
+  for(const [t,granted] of Object.entries(SERVICE))for(const priv of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']){
+   const ok=(await q(`select has_table_privilege('service_role','public.'||$1,$2) ok`,[t,priv]))[0].ok;
+   expect({t,priv,ok}).toEqual({t,priv,ok:granted.includes(priv)});
+  }
+  const c=await admin.connect();
+  try{
+   await c.query('set role anon');
+   await expect(c.query('select * from public.dq_filing_expectations')).rejects.toThrow(/permission denied/);
+  }finally{await c.query('reset role').catch(()=>{});c.release();}
+  expect(await q(`select id,public,file_size_limit::text limit_bytes,allowed_mime_types from storage.buckets where id='reconcile-raw'`)).toEqual([{
+   id:'reconcile-raw',public:false,limit_bytes:'52428800',
+   allowed_mime_types:['application/json','text/html','application/pdf','text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/zip'],
+  }]);
+  // A private bucket with no storage.objects policy is unreadable and unwritable for anon/authenticated
+  // on hosted Supabase; the migration must not add one (the local harness has no storage.objects).
+  const sql=readFileSync(MIGRATION,'utf8');
+  expect(sql).not.toMatch(/storage\.objects/);
+  await replayMigration(admin,sql);
+  await replayMigration(admin,sql);
+ },120000);
+
+ it('leaves evidence written after the first run untouched on replay',async()=>{
+  const a=await issuer();const t=await ticker();const t2=await ticker();
+  const prov={valid_from:{source:'stocks_universe.list_date',as_of:'2026-11-05'}};
+  await sec(a,t,'2020-01-01',null,{valid_from_method:'listing_date',provenance:JSON.stringify(prov)});
+  await sec(a,t2,'2010-01-01','2015-01-01',{valid_to_method:'delisting'});
+  await replayMigration(admin,readFileSync(MIGRATION,'utf8'));
+  expect(await q(`select ticker,valid_from_method,valid_to_method,provenance from public.issuer_securities where issuer_id=$1 order by valid_from`,[a])).toEqual([
+   {ticker:t2,valid_from_method:'first_observed',valid_to_method:'delisting',provenance:{}},
+   {ticker:t,valid_from_method:'listing_date',valid_to_method:null,provenance:prov},
+  ]);
+ },60000);
+
+ it('upgrades a seeded pre-migration database once; a second run after new evidence rewrites nothing',async()=>{
+  await withPreMigrationDatabase(adminUrl,VERSION,async db=>{
+   const iss=randomUUID();
+   await db.query(`insert into public.issuers(issuer_id,canonical_name_en) values($1,'ZZ Upgrade Co')`,[iss]);
+   for(const t of ['ZZUPA','ZZUPB','ZZUPC','ZZUPD'])await db.query(`insert into public.stocks_universe(ticker,name,market) values($1,'Upgrade Test','US')`,[t]);
+   const sec0=(t:string,from:string,to:string|null,source:string)=>db.query(`insert into public.issuer_securities(issuer_id,ticker,valid_from,valid_to,source) values($1,$2,$3,$4,$5)`,[iss,t,from,to,source]);
+   await sec0('ZZUPA','2020-01-01',null,'curated');
+   await sec0('ZZUPB','2010-01-01','2015-01-01','curated');
+   await sec0('ZZUPC','2011-01-01','2016-01-01','sec_company_tickers_exchange');
+   await sec0('ZZUPD','2021-01-01',null,'sec_company_tickers_exchange');
+   const handled=randomUUID(),pending=randomUUID();
+   // a claim handled by SQL before resolved_at existed (runbook §4), and a pending one
+   await db.query(`insert into public.issuer_identifier_claims(id,issuer_id,id_type,value,source,confidence,status) values($1,$3,'lei','LEIUPGRADE0000000012','test',0.5,'accepted'),($2,$3,'cik','123','test',0.5,'pending')`,[handled,pending,iss]);
+   const rec=randomUUID();
+   await db.query(`insert into public.dq_reconciliations(id,dataset,left_source,right_source,natural_key,left_value,right_value,tolerance,passed) values($1,'legacy.test','a','b','k',1,2,0,false)`,[rec]);
+   await db.query(`insert into public.dq_freshness(dataset,expected_cadence,status) values('legacy.test','daily','missing')`);
+   const sql=readFileSync(MIGRATION,'utf8');
+   await db.query(sql);                                                       // first upgrade: backfill runs
+   const methods=async()=>(await db.query(`select ticker,valid_from_method,valid_to_method from public.issuer_securities where issuer_id=$1 order by ticker`,[iss])).rows;
+   expect(await methods()).toEqual([
+    {ticker:'ZZUPA',valid_from_method:'curated',valid_to_method:null},
+    {ticker:'ZZUPB',valid_from_method:'curated',valid_to_method:'curated'},
+    {ticker:'ZZUPC',valid_from_method:'first_observed',valid_to_method:'unrecorded'},
+    {ticker:'ZZUPD',valid_from_method:'first_observed',valid_to_method:null},
+   ]);
+   const claims=async()=>(await db.query(`select id,op,target_key,detail,confidence::text conf,status,resolved_at from public.issuer_identifier_claims where issuer_id=$1 order by value`,[iss])).rows;
+   expect(await claims()).toEqual([
+    {id:pending,op:'legacy',target_key:'',detail:{},conf:'0.5',status:'pending',resolved_at:null},
+    {id:handled,op:'legacy',target_key:'',detail:{},conf:'0.5',status:'accepted',resolved_at:null},
+   ]);
+   const recRow=async()=>(await db.query(`select pair,kind,outcome,detail,cycle_id from public.dq_reconciliations where id=$1`,[rec])).rows[0];
+   expect(await recRow()).toEqual({pair:'legacy',kind:'numeric',outcome:'legacy',detail:{},cycle_id:null});
+   // new evidence written between the two runs
+   await db.query(`update public.issuer_securities set valid_from_method='listing_date',provenance=provenance||'{"valid_from":{"source":"stocks_universe.list_date","as_of":"2026-11-05"}}'::jsonb where ticker='ZZUPA'`);
+   await db.query(`update public.issuer_securities set valid_to_method='delisting' where ticker='ZZUPC'`);
+   await db.query(`update public.dq_reconciliations set outcome='compared' where id=$1`,[rec]);
+   const fresh=randomUUID();
+   await db.query(`insert into public.issuer_identifier_claims(id,issuer_id,id_type,value,source,status,op,target_key,detail) values($1,$2,'ticker','ZZUPA','test','pending','evidence_only',$3,'{"schema":"claim/1"}')`,[fresh,iss,`evidence_only:${iss}`]);
+   await db.query(sql);                                                       // second run: guarded blocks skip the backfill
+   expect(await methods()).toEqual([
+    {ticker:'ZZUPA',valid_from_method:'listing_date',valid_to_method:null},
+    {ticker:'ZZUPB',valid_from_method:'curated',valid_to_method:'curated'},
+    {ticker:'ZZUPC',valid_from_method:'first_observed',valid_to_method:'delisting'},
+    {ticker:'ZZUPD',valid_from_method:'first_observed',valid_to_method:null},
+   ]);
+   expect((await db.query(`select provenance from public.issuer_securities where ticker='ZZUPA'`)).rows[0].provenance).toEqual({valid_from:{source:'stocks_universe.list_date',as_of:'2026-11-05'}});
+   expect((await recRow()).outcome).toBe('compared');
+   expect((await db.query(`select op from public.issuer_identifier_claims where id=$1`,[fresh])).rows).toEqual([{op:'evidence_only'}]);
+   await db.query(`insert into public.dq_freshness(dataset,expected_cadence,status) values('weekly.test','weekly','missing')`);
+  });
+ },240000);
+
+ it('enforces the window-method checks and to_method_iff_to on issuer_securities',async()=>{
+  const a=await issuer();const t=await ticker();
+  expect((await fails(sec(a,t,'2020-01-01',null,{valid_from_method:'guessed'}))).message).toMatch(/issuer_securities_valid_from_method_check/);
+  expect((await fails(sec(a,t,'2020-01-01','2021-01-01'))).message).toMatch(/issuer_securities_to_method_iff_to/);
+  expect((await fails(sec(a,t,'2020-01-01',null,{valid_to_method:'delisting'}))).message).toMatch(/issuer_securities_to_method_iff_to/);
+  expect((await fails(sec(a,t,'2020-01-01','2021-01-01',{valid_to_method:'vanished'}))).message).toMatch(/issuer_securities_valid_to_method_check/);
+  await sec(a,t,'2020-01-01','2021-01-01',{valid_to_method:'sec_file_absent'});
+  expect((await fails(q(`update public.issuer_securities set valid_to=null where issuer_id=$1 and ticker=$2`,[a,t]))).message).toMatch(/issuer_securities_to_method_iff_to/);
+  await sec(a,t,'2021-01-01',null,{valid_from_method:'ticker_change'});
+  expect(await q(`select valid_from::text,valid_from_method,valid_to_method from public.issuer_securities where ticker=$1 order by valid_from`,[t])).toEqual([
+   {valid_from:'2020-01-01',valid_from_method:'first_observed',valid_to_method:'sec_file_absent'},
+   {valid_from:'2021-01-01',valid_from_method:'ticker_change',valid_to_method:null},
+  ]);
+ });
+
+ it('claims: ticker id_type, op check, detail object, nullable confidence, resolution invariant and the rebuilt pending key',async()=>{
+  const a=await issuer();
+  const claim=(over:Record<string,unknown>)=>insertRow('issuer_identifier_claims',{id:randomUUID(),issuer_id:a,id_type:'ticker',value:'ZZX',source:'test',status:'pending',op:'evidence_only',target_key:`evidence_only:${a}`,detail:'{}',...over});
+  await claim({});
+  expect((await fails(claim({}))).message).toMatch(/issuer_identifier_claims_pending_unique/);
+  await claim({op:'attach_security',target_key:`attach_security:${a}`});              // same value, another op
+  await claim({target_key:`evidence_only:${a}|ZZX|2020-01-01`});                        // same op, another target
+  await claim({status:'rejected',resolved_by:randomUUID(),resolved_at:new Date().toISOString()});   // resolved rows may repeat
+  expect((await fails(claim({id_type:'ric'}))).message).toMatch(/issuer_identifier_claims_id_type_check/);
+  expect((await fails(claim({op:'merge',target_key:'merge:x'}))).message).toMatch(/issuer_identifier_claims_op_check/);
+  expect((await fails(claim({value:'ZZY',detail:'[]'}))).message).toMatch(/issuer_identifier_claims_detail_object/);
+  expect((await fails(claim({value:'ZZY',resolved_at:new Date().toISOString()}))).message).toMatch(/issuer_identifier_claims_pending_has_no_resolution/);
+  expect((await fails(claim({value:'ZZY',target_key:''}))).message).toMatch(/issuer_identifier_claims_target_key_required/);
+  expect((await fails(claim({value:'ZZY',target_key:'x'.repeat(257)}))).message).toMatch(/issuer_identifier_claims_target_key_check/);
+  expect((await fails(claim({value:'ZZY',confidence:1.5}))).message).toMatch(/issuer_identifier_claims_confidence_check/);
+  await claim({value:'ZZY',confidence:null});
+  const legacy=randomUUID();
+  await q(`insert into public.issuer_identifier_claims(id,issuer_id,id_type,value,source,confidence) values($1,$2,'lei','L1','test',0.5)`,[legacy,a]);
+  expect(await q(`select op,target_key,detail,status from public.issuer_identifier_claims where id=$1`,[legacy])).toEqual([{op:'legacy',target_key:'',detail:{},status:'pending'}]);
+ });
+
+ it('dq_reconciliations: kind/outcome checks, side constraints, cycle columns all-or-none, one result per cycle key',async()=>{
+  const rec=(over:Record<string,unknown>)=>insertRow('dq_reconciliations',{id:randomUUID(),dataset:'reconcile.test',left_source:'l',right_source:'r',natural_key:'k:'+randomUUID(),tolerance:0,passed:true,pair:'us.companyfacts_vs_ixbrl',kind:'numeric',outcome:'compared',left_value:'10',right_value:'10',...over});
+  await rec({});
+  expect((await fails(rec({kind:'percent'}))).message).toMatch(/dq_reconciliations_kind_check/);
+  expect((await fails(rec({outcome:'skipped'}))).message).toMatch(/dq_reconciliations_outcome_check/);
+  for(const outcome of ['left_missing','left_unlinked','left_ambiguous','right_missing','unsupported','right_ambiguous','incomplete_gold'])await rec({outcome,left_value:null,right_value:null,passed:false});
+  expect((await fails(rec({left_value:null}))).message).toMatch(/dq_reconciliations_numeric_sides/);
+  expect((await fails(rec({kind:'text'}))).message).toMatch(/dq_reconciliations_nonnumeric_sides/);
+  await rec({kind:'date',left_value:null,right_value:null,detail:JSON.stringify({left_text:'2026-01-02',right_text:'2026-01-02'})});
+  expect((await fails(rec({kind:'date',left_value:null,right_value:null,rel_diff:'0'}))).message).toMatch(/dq_reconciliations_nonnumeric_sides/);
+  expect((await fails(rec({detail:'[]'}))).message).toMatch(/dq_reconciliations_detail_object/);
+  expect((await fails(rec({pair:''}))).message).toMatch(/dq_reconciliations_pair_check/);
+  const iss=await issuer();
+  expect((await fails(rec({cycle_id:'c1',issuer_id:iss,market:'US'}))).message).toMatch(/dq_reconciliations_cycle_cols/);   // attempt missing
+  expect((await fails(rec({attempt:1}))).message).toMatch(/dq_reconciliations_cycle_cols/);
+  const key='k:'+randomUUID();
+  await rec({natural_key:key,cycle_id:'c-'+key,issuer_id:iss,market:'US',attempt:1});
+  expect((await fails(rec({natural_key:key,cycle_id:'c-'+key,issuer_id:iss,market:'US',attempt:2}))).message).toMatch(/dq_reconciliations_cycle_key/);
+  await rec({natural_key:key,cycle_id:'c2-'+key,issuer_id:iss,market:'US',attempt:1});   // the next cycle has its own key
+  await rec({natural_key:key});                                                           // outside cycles the log is append-only
+  await rec({natural_key:key});
+  expect((await fails(rec({cycle_id:'c3-'+key,issuer_id:iss,market:'HK',attempt:1}))).message).toMatch(/dq_reconciliations_market_check/);
+  expect((await fails(rec({cycle_id:'c4-'+key,issuer_id:iss,market:'US',attempt:0}))).message).toMatch(/dq_reconciliations_attempt_check/);
+ });
+
+ it('reconcile cycles and cursor: one running cycle per pair, terminal iff finished, drc_* invariants',async()=>{
+  const pair='test.'+randomUUID().slice(0,8);
+  const cycle=(id:string,status='running',finished:string|null=null,members='[]')=>insertRow('dq_reconcile_cycles',{pair,cycle_id:id,started_at:new Date().toISOString(),finished_at:finished,members,status,expected_total:0});
+  await cycle('c1');
+  expect((await fails(cycle('c2'))).message).toMatch(/dq_reconcile_cycles_running_uniq/);
+  expect((await fails(cycle('c3','complete',new Date().toISOString(),'{}'))).message).toMatch(/dq_reconcile_cycles_members_array/);
+  expect((await fails(cycle('c4','complete'))).message).toMatch(/dq_reconcile_cycles_finished_iff_terminal/);
+  expect((await fails(cycle('c5','paused',new Date().toISOString()))).message).toMatch(/dq_reconcile_cycles_status_check/);
+  await cycle('c0','complete_with_gaps',new Date().toISOString());
+  const cursor=async(over:Record<string,unknown>)=>insertRow('dq_reconcile_cursor',{pair,cycle_id:'c1',issuer_id:await issuer(),market:'US',expected:2,...over});
+  const first=await issuer();
+  await cursor({issuer_id:first});
+  expect((await fails(cursor({issuer_id:first}))).message).toMatch(/dq_reconcile_cursor_pkey/);
+  expect((await fails(cursor({cycle_id:'nope'}))).message).toMatch(/dq_reconcile_cursor_cycle_fkey/);
+  expect((await fails(cursor({expected:-1}))).message).toMatch(/drc_expected_nonneg/);
+  expect((await fails(cursor({state:'running'}))).message).toMatch(/dq_reconcile_cursor_state_check/);
+  expect((await fails(cursor({compared_failed:-1}))).message).toMatch(/drc_counters_nonneg/);
+  expect((await fails(cursor({attempts:-1}))).message).toMatch(/dq_reconcile_cursor_attempts_check/);
+  expect((await fails(cursor({market:'HK'}))).message).toMatch(/dq_reconcile_cursor_market_check/);
+  // S5: a done row needs all three counters, non-null, summing to expected (NULL is never coalesced to 0)
+  expect((await fails(cursor({state:'done',compared_passed:2,compared_failed:0}))).message).toMatch(/drc_done_accounted/);
+  expect((await fails(cursor({state:'done',compared_passed:1,compared_failed:0,not_compared:0}))).message).toMatch(/drc_done_accounted/);
+  await cursor({state:'done',compared_passed:1,compared_failed:0,not_compared:1,done_at:new Date().toISOString()});
+  await cursor({state:'failed',attempts:3,last_error:'boom'});
+  expect((await fails(q(`delete from public.dq_reconcile_cycles where pair=$1 and cycle_id='c1'`,[pair]))).message).toMatch(/dq_reconcile_cursor_cycle_fkey/);
+ });
+
+ it('calendar pass tables: one open pass per market, finished iff terminal, member checks',async()=>{
+  await withCalendarLock(admin,async()=>{
+   const b=await batch();
+   const pass=async(market:string,status='running',finished:string|null=null)=>{
+    const id=randomUUID();
+    await insertRow('dq_calendar_passes',{market,pass_id:id,started_at:new Date().toISOString(),finished_at:finished,claimed_by:b,claim_until:new Date(Date.now()+600_000).toISOString(),status});
+    return id;
+   };
+   const open=await pass('CN');
+   expect((await fails(pass('CN'))).message).toMatch(/dq_calendar_passes_open_uniq/);
+   expect((await fails(pass('HK'))).message).toMatch(/dq_calendar_passes_market_check/);
+   expect((await fails(pass('US','complete'))).message).toMatch(/dcp_finished_iff_terminal/);
+   expect((await fails(pass('US','running',new Date().toISOString()))).message).toMatch(/dcp_finished_iff_terminal/);
+   expect((await fails(pass('US','paused',new Date().toISOString()))).message).toMatch(/dq_calendar_passes_status_check/);
+   const member=async(over:Record<string,unknown>)=>insertRow('dq_calendar_pass_members',{market:'CN',pass_id:open,issuer_id:await issuer(),...over});
+   const first=await issuer();
+   await member({issuer_id:first});
+   expect((await fails(member({issuer_id:first}))).message).toMatch(/dq_calendar_pass_members_pkey/);
+   expect((await fails(member({attempts:-1}))).message).toMatch(/dq_calendar_pass_members_attempts_check/);
+   expect((await fails(member({state:'claimed'}))).message).toMatch(/dq_calendar_pass_members_state_check/);
+   expect((await fails(member({pass_id:randomUUID()}))).message).toMatch(/dq_calendar_pass_members_pass_fkey/);
+   await member({state:'failed',attempts:3,last_error:'sec_unavailable'});
+  });
+ });
+
+ it('dq_filing_expectations: every dfe_* combination, the other checks and the key',async()=>{
+  const b=await batch('dq.calendar.us');const iss=await issuer();
+  let n=0;
+  // each row gets its own period_end unless the case sets one, so only the asserted constraint can fail
+  const exp=(over:Record<string,unknown>)=>{
+   n++;
+   return insertRow('dq_filing_expectations',{issuer_id:iss,market:'US',report_kind:'10-K',period_end:`${2010+n}-12-31`,deadline_state:'statutory',due_date:'2027-03-01',due_rule:'10-K.large_accelerated.60d',upstream_lookup:'ok',disclosure_state:'pending',computed_at:new Date().toISOString(),batch_id:b,...over});
+  };
+  const filed=()=>({received_filing_id:randomUUID(),received_date:'2027-02-01'});
+  await exp({});                                                                                    // statutory, pending
+  await exp({deadline_state:'no_rule',due_date:null,due_rule:'none.src_only'});                       // no_rule, pending
+  await exp({deadline_state:'no_rule',due_date:null,due_rule:'none.src_only',disclosure_state:'received',...filed()});   // no_rule rows may be received
+  await exp({deadline_state:'estimated',period_end_estimated:true,detail:JSON.stringify({estimated_due_passed:true})});   // estimated past due stays pending
+  await exp({disclosure_state:'overdue'});
+  await exp({disclosure_state:'received_late',received_filing_id:randomUUID(),received_date:'2027-03-05'});
+  await exp({disclosure_state:'filed_not_ingested',upstream_filed_date:'2027-02-20'});
+  await exp({upstream_lookup:'unavailable',disclosure_state:'unknown_upstream'});
+  await exp({upstream_lookup:'unavailable',disclosure_state:'received',...filed()});                  // received although the lookup was unavailable
+  await exp({market:'CN',report_kind:'annual',upstream_lookup:'not_applicable',expected_date:'2027-04-20'});
+  await exp({period_end:'2099-06-30'});
+  const bad=async(over:Record<string,unknown>,constraint:RegExp)=>expect((await fails(exp(over))).message).toMatch(constraint);
+  await bad({deadline_state:'no_rule'},/dfe_due_iff_known/);                                        // no_rule with a due date
+  await bad({due_date:null},/dfe_due_iff_known/);                                                   // statutory without one
+  await bad({disclosure_state:'received'},/dfe_received_iff/);                                      // received without the filing
+  await bad(filed(),/dfe_received_iff/);                                                            // pending yet carries a filing
+  await bad({disclosure_state:'received',received_filing_id:randomUUID()},/dfe_received_iff/);     // missing received_date
+  await bad({deadline_state:'no_rule',due_date:null,disclosure_state:'received_late',...filed()},/dfe_late_requires_due/);
+  await bad({deadline_state:'estimated',disclosure_state:'overdue'},/dfe_overdue_requires_statutory/);
+  await bad({deadline_state:'no_rule',due_date:null,disclosure_state:'overdue'},/dfe_overdue_requires_statutory/);
+  await bad({disclosure_state:'unknown_upstream'},/dfe_unknown_upstream_iff/);                      // lookup was ok
+  await bad({upstream_lookup:'unavailable'},/dfe_unknown_upstream_iff/);                            // unavailable, nothing received, not unknown_upstream
+  await bad({market:'HK'},/dq_filing_expectations_market_check/);
+  await bad({report_kind:'8-K'},/dq_filing_expectations_report_kind_check/);
+  await bad({deadline_state:'late'},/dq_filing_expectations_deadline_state_check/);
+  await bad({disclosure_state:'missing'},/dq_filing_expectations_disclosure_state_check/);
+  await bad({upstream_lookup:'maybe'},/dq_filing_expectations_upstream_lookup_check/);
+  await bad({detail:'[]'},/dq_filing_expectations_detail_object/);
+  await bad({batch_id:randomUUID()},/dq_filing_expectations_batch_id_fkey/);
+  await bad({period_end:'2099-06-30'},/dq_filing_expectations_pkey/);
+ });
+
+ it('issuer_filer_categories and issuer_filing_profiles: checks and composite keys',async()=>{
+  const iss=await issuer();
+  const cat=(over:Record<string,unknown>)=>insertRow('issuer_filer_categories',{issuer_id:iss,fiscal_year:2025,acceleration:'large_accelerated',smaller_reporting:false,category_raw:'Large Accelerated Filer',source:'ixbrl_dei',accession:'0000320193-25-000079',evidence_sha256:SHA,as_of:'2026-11-05',...over});
+  await cat({});
+  await cat({fiscal_year:2024,acceleration:'non_accelerated',smaller_reporting:true,category_raw:'Non-accelerated Filer'});
+  await cat({fiscal_year:2023,smaller_reporting:null});
+  expect((await fails(cat({}))).message).toMatch(/issuer_filer_categories_pkey/);
+  expect((await fails(cat({fiscal_year:2022,acceleration:'smaller_reporting'}))).message).toMatch(/issuer_filer_categories_acceleration_check/);
+  expect((await fails(cat({fiscal_year:2021,source:'submissions'}))).message).toMatch(/issuer_filer_categories_source_check/);
+  expect((await fails(cat({fiscal_year:2020,evidence_sha256:'xyz'}))).message).toMatch(/issuer_filer_categories_evidence_sha256_check/);
+  const prof=(over:Record<string,unknown>)=>insertRow('issuer_filing_profiles',{issuer_id:iss,market:'US',category_raw_current:'Large accelerated filer',regime:'10-K',fiscal_year_end:'0927',week52_pattern:true,source:'sec_submissions',source_sha256:SHA,as_of:'2026-11-05',...over});
+  await prof({});
+  await prof({market:'CN',category_raw_current:null,regime:'cn',fiscal_year_end:'1231',week52_pattern:false,source:'tushare_stock_basic',source_sha256:null});
+  expect((await fails(prof({}))).message).toMatch(/issuer_filing_profiles_pkey/);
+  const other=await issuer();
+  expect((await fails(prof({issuer_id:other,fiscal_year_end:'1332'}))).message).toMatch(/issuer_filing_profiles_fiscal_year_end_check/);
+  expect((await fails(prof({issuer_id:other,fiscal_year_end:'927'}))).message).toMatch(/issuer_filing_profiles_fiscal_year_end_check/);
+  expect((await fails(prof({issuer_id:other,regime:'8-K'}))).message).toMatch(/issuer_filing_profiles_regime_check/);
+  expect((await fails(prof({issuer_id:other,market:'HK'}))).message).toMatch(/issuer_filing_profiles_market_check/);
+  expect((await fails(prof({issuer_id:other,source_sha256:'zz'}))).message).toMatch(/issuer_filing_profiles_source_sha256_check/);
+  await prof({issuer_id:other,fiscal_year_end:null});                                              // unknown fiscal year end stays missing
+ });
+
+ it('dq_freshness accepts the weekly cadence and still rejects unknown ones',async()=>{
+  const d='reconcile.test-'+randomUUID().slice(0,8);
+  await q(`insert into public.dq_freshness(dataset,expected_cadence,status) values($1,'weekly','missing')`,[d]);
+  expect((await fails(q(`insert into public.dq_freshness(dataset,expected_cadence,status) values($1,'hourly','missing')`,[d+'x']))).message).toMatch(/dq_freshness_expected_cadence_check/);
+ });
+});
diff --git a/src/lib/entities/issuers.integration.test.ts b/src/lib/entities/issuers.integration.test.ts
index d7915f6..c1b77cc 100644
--- a/src/lib/entities/issuers.integration.test.ts
+++ b/src/lib/entities/issuers.integration.test.ts
@@ -52,7 +52,8 @@ describe.skipIf(!enabled)('WP-F1a issuers on real PostgreSQL',()=>{
   return t;
  };
  const usTicker=async()=>{const t=await newTicker('US');if(!t) throw new Error('ZZ test ticker collided');return t;};
- const sec=(issuer:string,ticker:string,from:string,to:string|null,extraCols='',extraVals='',params:unknown[]=[])=>admin.query(`insert into public.issuer_securities(issuer_id,ticker,valid_from,valid_to,source${extraCols}) values($1,$2,$3,$4,'test'${extraVals})`,[issuer,ticker,from,to,...params]);
+ // plan 3: a closed window must name how it was closed (issuer_securities_to_method_iff_to)
+const sec=(issuer:string,ticker:string,from:string,to:string|null,extraCols='',extraVals='',params:unknown[]=[])=>admin.query(`insert into public.issuer_securities(issuer_id,ticker,valid_from,valid_to,source${to===null?'':',valid_to_method'}${extraCols}) values($1,$2,$3,$4,'test'${to===null?'':",'unrecorded'"}${extraVals})`,[issuer,ticker,from,to,...params]);
  const newVersion=async()=>{
   const version='t'+hex(4);
   await admin.query(`insert into public.industry_classifications(scheme,version,code,level,name_en) values('custom',$1,'10',1,'Energy')`,[version]);
@@ -130,7 +131,7 @@ describe.skipIf(!enabled)('WP-F1a issuers on real PostgreSQL',()=>{
   await claim('cik',0.6,'Y');
   const claims=(await admin.query(`select id_type,value,status from public.issuer_identifier_claims where issuer_id=$1 order by id_type,status`,[a])).rows;
   expect(claims).toEqual([{id_type:'cik',value:'Y',status:'accepted'},{id_type:'cik',value:'Y',status:'pending'},{id_type:'cik',value:'Y',status:'rejected'},{id_type:'lei',value:'X',status:'pending'},{id_type:'lei',value:'X',status:'rejected'}]);
-  await expect(claim('ticker',0.5)).rejects.toThrow(/issuer_identifier_claims_id_type_check/);
+  await expect(claim('ric',0.5)).rejects.toThrow(/issuer_identifier_claims_id_type_check/);
   await expect(claim('cik',1.5)).rejects.toThrow(/issuer_identifier_claims_confidence_check/);
 
   const version=await newVersion();
@@ -205,7 +206,7 @@ describe.skipIf(!enabled)('WP-F1a issuers on real PostgreSQL',()=>{
   await sec(a,t,'2020-01-01',null);
   await expect(admin.query(`update public.issuers set status='dissolved' where issuer_id=$1`,[a])).rejects.toThrow(/open_securities_exist/);
   await expect(admin.query(`update public.issuers set status='merged',merged_into=$2 where issuer_id=$1`,[a,b])).rejects.toThrow(/open_securities_exist/);
-  await admin.query(`update public.issuer_securities set valid_to='2024-01-01' where issuer_id=$1 and ticker=$2`,[a,t]);
+  await admin.query(`update public.issuer_securities set valid_to='2024-01-01',valid_to_method='unrecorded' where issuer_id=$1 and ticker=$2`,[a,t]);
   await admin.query(`update public.issuers set status='dissolved' where issuer_id=$1`,[a]);
   expect((await admin.query(`select status from public.issuers where issuer_id=$1`,[a])).rows[0].status).toBe('dissolved');
  },30000);
diff --git a/src/lib/supabase/database.types.ts b/src/lib/supabase/database.types.ts
index d8a31b1..1c51f95 100644
--- a/src/lib/supabase/database.types.ts
+++ b/src/lib/supabase/database.types.ts
@@ -11,6 +11,9 @@
 // + migrations up to 20261105091000_issuers.sql (issuers, issuer_securities, issuer_identifier_claims,
 //   industry_classifications, issuer_industry_memberships; research_entity_* link columns are not typed here)
 // + 20261106090000_financial_facts.sql (fact_sync_runs, filings, financial_facts, financial_metrics, fact_sync_scope)
+// + 20261107090000_identifiers_and_dq.sql (issuer_securities window methods; issuer_identifier_claims claim/1 columns;
+//   dq_reconciliations pair/kind/outcome/detail/cycle columns; dq_reconcile_cycles, dq_reconcile_cursor, dq_calendar_passes,
+//   dq_calendar_pass_members, issuer_filer_categories, dq_filing_expectations, issuer_filing_profiles; dq_freshness weekly)
 // Regenerate with: npm run supabase:types (after supabase link)
 
 export type Market = 'A' | 'HK' | 'US' | 'JP' | 'KR' | 'TW';
@@ -573,12 +576,20 @@ export interface DqReconciliation {
   passed: boolean;
   batch_id: string | null;
   created_at: string;
+  pair: string;
+  kind: DqReconcileKind;
+  outcome: DqReconcileOutcome;
+  detail: Record<string, unknown>;
+  cycle_id: string | null;
+  issuer_id: string | null;
+  market: FactMarket | null;
+  attempt: number | null;
 }
 
 export type DqFreshnessStatus = 'fresh' | 'stale' | 'error' | 'missing';
 export interface DqFreshness {
   dataset: string;
-  expected_cadence: 'daily' | 'monthly' | 'quarterly' | 'event';
+  expected_cadence: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'event';
   last_ok_at: string | null;
   last_attempt_at: string | null;
   consecutive_errors: number;
@@ -709,19 +720,27 @@ export interface IssuerSecurity {
   is_primary: boolean;
   valid_from: string;
   valid_to: string | null;
+  valid_from_method: ValidFromMethod;
+  valid_to_method: ValidToMethod | null;
   source: string;
   provenance: Record<string, unknown>;
 }
 
-export type IssuerIdentifierType = 'lei' | 'cik' | 'usci' | 'isin' | 'figi' | 'cninfo_org_id';
+export type IssuerIdentifierType = 'lei' | 'cik' | 'usci' | 'isin' | 'figi' | 'cninfo_org_id' | 'ticker';
+export type IssuerClaimOp = 'legacy' | 'evidence_only' | 'set_identifier' | 'correct_identifier' | 'attach_security' | 'close_security' | 'backdate_window';
 export interface IssuerIdentifierClaim {
   id: string;
   issuer_id: string;
   id_type: IssuerIdentifierType;
   value: string;
   source: string;
-  confidence: number;
+  confidence: number | null;          // legacy rows only; claim/1 claims carry evidence classes, not confidence
   status: 'accepted' | 'pending' | 'rejected';
+  op: IssuerClaimOp;
+  target_key: string;
+  detail: Record<string, unknown>;    // claim/1 payload (src/lib/entities/types.ts ClaimDetail); {} on legacy rows
+  resolved_by: string | null;
+  resolved_at: string | null;
   created_at: string;
 }
 
@@ -747,6 +766,103 @@ export interface IssuerIndustryMembership {
   provenance: Record<string, unknown>;
 }
 
+// 20261107090000_identifiers_and_dq.sql (plan 3 Task 1). All new tables are service-role only.
+export type ValidFromMethod = 'first_observed' | 'listing_date' | 'ticker_change' | 'curated';
+export type ValidToMethod = 'delisting' | 'ticker_change' | 'sec_file_absent' | 'curated' | 'merge_close' | 'unrecorded';
+export type DqReconcileKind = 'numeric' | 'text' | 'date';
+export type DqReconcileOutcome = 'compared' | 'left_missing' | 'left_unlinked' | 'left_ambiguous' | 'right_missing' | 'unsupported' | 'right_ambiguous' | 'incomplete_gold' | 'legacy';
+export interface DqReconcileCycle {
+  pair: string;
+  cycle_id: string;
+  started_at: string;
+  finished_at: string | null;
+  members: { issuer_id: string; market: FactMarket; expected_keys: unknown[] }[];
+  status: 'running' | 'complete' | 'complete_with_gaps';
+  expected_total: number;
+  compared_passed: number;
+  compared_failed: number;
+  not_compared: number;
+  exec_failed_members: number;
+  detail: Record<string, unknown>;
+}
+export interface DqReconcileCursor {
+  pair: string;
+  cycle_id: string;
+  issuer_id: string;
+  market: FactMarket;
+  expected: number;
+  state: 'pending' | 'claimed' | 'done' | 'failed';
+  claimed_by: string | null;
+  claim_until: string | null;
+  attempts: number;
+  last_error: string | null;
+  done_at: string | null;
+  compared_passed: number | null;
+  compared_failed: number | null;
+  not_compared: number | null;
+}
+export interface DqCalendarPass {
+  market: FactMarket;
+  pass_id: string;
+  started_at: string;
+  finished_at: string | null;
+  claimed_by: string | null;
+  claim_until: string | null;
+  status: 'running' | 'complete' | 'complete_with_failures';
+}
+export interface DqCalendarPassMember {
+  market: FactMarket;
+  pass_id: string;
+  issuer_id: string;
+  state: 'pending' | 'done' | 'failed';
+  attempts: number;
+  last_error: string | null;
+  done_at: string | null;
+}
+export interface IssuerFilerCategory {
+  issuer_id: string;
+  fiscal_year: number;
+  acceleration: 'large_accelerated' | 'accelerated' | 'non_accelerated';
+  smaller_reporting: boolean | null;
+  category_raw: string;
+  source: 'ixbrl_dei';
+  accession: string;
+  evidence_sha256: string;
+  as_of: string;
+}
+export interface DqFilingExpectation {
+  issuer_id: string;
+  market: FactMarket;
+  report_kind: '10-K' | '10-Q' | '20-F' | '40-F' | 'annual' | 'semiannual' | 'q1' | 'q3';
+  period_end: string;
+  period_end_estimated: boolean;
+  deadline_state: 'statutory' | 'estimated' | 'no_rule';
+  due_date: string | null;
+  due_rule: string;
+  expected_date: string | null;
+  upstream_lookup: 'ok' | 'unavailable' | 'not_applicable';
+  upstream_filed_date: string | null;
+  disclosure_state: 'pending' | 'overdue' | 'filed_not_ingested' | 'received' | 'received_late' | 'unknown_upstream';
+  received_filing_id: string | null;
+  received_date: string | null;
+  profile_as_of: string | null;
+  detail: Record<string, unknown>;
+  computed_at: string;
+  batch_id: string;
+}
+export interface IssuerFilingProfile {
+  issuer_id: string;
+  market: FactMarket;
+  category_raw_current: string | null;
+  regime: '10-K' | '20-F' | '40-F' | 'cn';
+  fiscal_year_end: string | null;
+  week52_pattern: boolean;
+  source: string;
+  source_sha256: string | null;
+  as_of: string;
+  updated_at: string;
+}
+
 export type Database = {
   public: {
     Tables: {
@@ -797,6 +913,13 @@ export type Database = {
       financial_facts: { Row: FinancialFact; Insert: Partial<FinancialFact>; Update: Partial<FinancialFact> };
       financial_metrics: { Row: FinancialMetric; Insert: Partial<FinancialMetric>; Update: Partial<FinancialMetric> };
       fact_sync_scope: { Row: FactSyncScope; Insert: Partial<FactSyncScope>; Update: Partial<FactSyncScope> };
+      dq_reconcile_cycles: { Row: DqReconcileCycle; Insert: Partial<DqReconcileCycle>; Update: Partial<DqReconcileCycle> };
+      dq_reconcile_cursor: { Row: DqReconcileCursor; Insert: Partial<DqReconcileCursor>; Update: Partial<DqReconcileCursor> };
+      dq_calendar_passes: { Row: DqCalendarPass; Insert: Partial<DqCalendarPass>; Update: Partial<DqCalendarPass> };
+      dq_calendar_pass_members: { Row: DqCalendarPassMember; Insert: Partial<DqCalendarPassMember>; Update: Partial<DqCalendarPassMember> };
+      issuer_filer_categories: { Row: IssuerFilerCategory; Insert: Partial<IssuerFilerCategory>; Update: Partial<IssuerFilerCategory> };
+      dq_filing_expectations: { Row: DqFilingExpectation; Insert: Partial<DqFilingExpectation>; Update: Partial<DqFilingExpectation> };
+      issuer_filing_profiles: { Row: IssuerFilingProfile; Insert: Partial<IssuerFilingProfile>; Update: Partial<IssuerFilingProfile> };
     };
     Functions: {
       quote_alert_window_samples: {
supabase/migrations/20261105091000_issuers.sql:9:-- never delete. Ownership windows are half-open [valid_from, valid_to) and may not overlap, per
supabase/migrations/20261105091000_issuers.sql:14:-- (valid_to is null) security row (close it first); and only an active issuer may hold one.
supabase/migrations/20261105091000_issuers.sql:78:  valid_to    date,
supabase/migrations/20261105091000_issuers.sql:83:  constraint issuer_securities_window check (valid_to is null or valid_to > valid_from),
supabase/migrations/20261105091000_issuers.sql:87:create unique index if not exists issuer_securities_open_owner_idx on public.issuer_securities(ticker) where valid_to is null;
supabase/migrations/20261105091000_issuers.sql:94:      exclude using gist (ticker with =, daterange(valid_from, valid_to, '[)') with &&);
supabase/migrations/20261105091000_issuers.sql:102:      exclude using gist (isin with =, daterange(valid_from, valid_to, '[)') with &&) where (isin is not null);
supabase/migrations/20261105091000_issuers.sql:111:  if new.valid_to is null then
supabase/migrations/20261105091000_issuers.sql:129:     and exists (select 1 from public.issuer_securities s where s.issuer_id = new.issuer_id and s.valid_to is null) then
supabase/migrations/20261105091000_issuers.sql:139:create table if not exists public.issuer_identifier_claims (
supabase/migrations/20261105091000_issuers.sql:149:create index if not exists issuer_identifier_claims_pending_idx on public.issuer_identifier_claims(created_at desc) where status = 'pending';
supabase/migrations/20261105091000_issuers.sql:150:create index if not exists issuer_identifier_claims_issuer_idx on public.issuer_identifier_claims(issuer_id);
supabase/migrations/20261105091000_issuers.sql:151:create unique index if not exists issuer_identifier_claims_pending_unique on public.issuer_identifier_claims(issuer_id, id_type, value) where status = 'pending';
supabase/migrations/20261105091000_issuers.sql:174:  valid_to    date,
supabase/migrations/20261105091000_issuers.sql:179:  constraint issuer_industry_memberships_window check (valid_to is null or valid_to > valid_from),
supabase/migrations/20261105091000_issuers.sql:182:    (issuer_id with =, scheme with =, version with =, code with =, daterange(valid_from, valid_to, '[)') with &&)
supabase/migrations/20261105091000_issuers.sql:192:  foreach t in array array['issuers','issuer_securities','issuer_identifier_claims','industry_classifications','issuer_industry_memberships'] loop
src/lib/entities/resolve.test.ts:11: await c.insert('issuer_securities',{issuer_id:'a',ticker:'AAPL',isin:'US0378331005',figi:null,share_class:'common',is_primary:true,valid_from:'2000-01-01',valid_to:null,source:'sec'});
src/lib/entities/resolve.test.ts:12: await c.insert('issuer_securities',{issuer_id:'a',ticker:'AAPL.OLD',isin:null,figi:null,share_class:'other',is_primary:false,valid_from:'1990-01-01',valid_to:'1999-12-31',source:'sec'});
src/lib/entities/resolve.test.ts:13: await c.insert('issuer_securities',{issuer_id:'a',ticker:'AAPL.FUT',isin:null,figi:null,share_class:'other',is_primary:false,valid_from:'2030-01-01',valid_to:null,source:'sec'});
src/lib/entities/resolve.test.ts:57:   await expect(resolveIssuer(c,{ticker:'AAPL'},{today})).rejects.toThrow('invalid_today');
src/lib/entities/resolve.test.ts:63:  await c.insert('issuer_securities',{issuer_id:'brk',ticker:'BRK.A',isin:null,figi:null,share_class:'A',is_primary:true,valid_from:'2000-01-01',valid_to:null,source:'sec'});
src/lib/entities/resolve.test.ts:64:  await c.insert('issuer_securities',{issuer_id:'brk',ticker:'BRK.B',isin:null,figi:null,share_class:'B',is_primary:false,valid_from:'2000-01-01',valid_to:null,source:'sec'});
src/lib/entities/resolve.test.ts:65:  await c.insert('issuer_securities',{issuer_id:'other',ticker:'BRK',isin:null,figi:null,share_class:'common',is_primary:true,valid_from:'2000-01-01',valid_to:null,source:'sec'});
src/lib/entities/resolve.test.ts:75:  await c.insert('issuer_securities',{issuer_id:'old-xyz',ticker:'XYZ.A',isin:null,figi:null,share_class:'A',is_primary:true,valid_from:'2000-01-01',valid_to:'2010-01-01',source:'t'});
src/lib/entities/resolve.test.ts:76:  await c.insert('issuer_securities',{issuer_id:'xyz',ticker:'XYZ',isin:null,figi:null,share_class:'common',is_primary:true,valid_from:'2000-01-01',valid_to:null,source:'t'});
src/lib/entities/resolve.test.ts:86:  await c.insert('issuer_securities',{issuer_id:'dup',ticker:'AAPL',isin:null,figi:null,share_class:'common',is_primary:true,valid_from:'2020-01-01',valid_to:null,source:'sec'});
src/lib/entities/resolve.test.ts:98:  await c.insert('issuer_securities',{issuer_id:'x1',ticker:'X1',isin,figi:null,share_class:null,is_primary:true,valid_from:'2000-01-01',valid_to:'2020-01-01',source:'t'});
src/lib/entities/resolve.test.ts:99:  await c.insert('issuer_securities',{issuer_id:'x2',ticker:'X2',isin,figi:null,share_class:null,is_primary:true,valid_from:'2020-01-01',valid_to:null,source:'t'});
src/lib/entities/resolve.test.ts:100:  await c.insert('issuer_securities',{issuer_id:'x3',ticker:'X3',isin,figi:null,share_class:null,is_primary:true,valid_from:'2027-01-01',valid_to:null,source:'t'});
src/lib/entities/resolve.test.ts:106:  await c.insert('issuer_securities',{issuer_id:'old',ticker:'OLDX',isin:null,figi:null,share_class:'common',is_primary:false,valid_from:'2001-01-01',valid_to:null,source:'sec'});
src/lib/entities/load-sec.test.ts:124:    payload:{ticker:'GOOGL',isin:null,share_class:'unknown',is_primary:false,valid_from:AS_OF,valid_to:null,cik:'1652044'},batch_id:BATCH},
src/lib/entities/issuers.ts:2:// become pending issuer_identifier_claims rows instead of silent overwrites.
src/lib/entities/types.ts:4:/** id_type values allowed by the issuer_identifier_claims check constraint. */
src/lib/entities/types.ts:13:export interface IssuerSecurityInput{issuer_id:string;ticker:string;isin?:string|null;figi?:string|null;share_class:ShareClass;is_primary?:boolean;valid_from:string;valid_to?:string|null;source:string;provenance?:Record<string,unknown>}
src/lib/entities/load-sec.ts:150:    payload:{ticker:sec.ticker,isin:null,share_class:sec.share_class,is_primary:sec.is_primary,valid_from:sec.valid_from,valid_to:null,cik:sec.cik},batchId:opts.batchId},counts,errors,{code:'ownership_conflict',key:sec.ticker});
src/lib/entities/issuers-write.integration.test.ts:46: const pendingClaims=async(issuer:string)=>(await admin.query(`select id_type,value from public.issuer_identifier_claims where issuer_id=$1 and status='pending' order by id_type,value`,[issuer])).rows;
src/lib/entities/issuers-write.integration.test.ts:47: const sec=(issuer_id:string,ticker:string,valid_from:string,valid_to:string|null=null)=>({issuer_id,ticker,share_class:'common' as const,valid_from,valid_to,source:'test'});
src/lib/entities/issuers-write.integration.test.ts:67:   await admin.query(`delete from public.issuer_identifier_claims where issuer_id=any($1::uuid[])`,[issuers]);
src/lib/entities/issuers-write.integration.test.ts:115:  await expect(admin.query(`insert into public.issuer_identifier_claims(id,issuer_id,id_type,value,source,confidence) values($1,$2,'lei',$3,'test',0.5)`,[randomUUID(),id,lei]))
src/lib/entities/issuers-write.integration.test.ts:116:   .rejects.toThrow(/issuer_identifier_claims_pending_unique/);
src/lib/entities/issuers-write.integration.test.ts:134:  const rows=(await admin.query(`select issuer_id,valid_from::text,valid_to::text from public.issuer_securities where ticker=$1 order by valid_from`,[t])).rows;
src/lib/entities/issuers-write.integration.test.ts:135:  expect(rows).toEqual([{issuer_id:b,valid_from:'2000-01-01',valid_to:'2005-01-01'},{issuer_id:c,valid_from:'2005-01-01',valid_to:'2010-01-01'},{issuer_id:a,valid_from:'2010-01-01',valid_to:null}]);
src/lib/entities/issuers.test.ts:11:const KEYS={issuers:['issuer_id'],issuer_securities:['issuer_id','ticker','valid_from'],issuer_identifier_claims:['id']};
src/lib/entities/issuers.test.ts:21:const claims=(c:ReturnType<typeof client>)=>c.rows('issuer_identifier_claims').map(r=>({issuer_id:r.issuer_id,id_type:r.id_type,value:r.value})).sort((a,b)=>`${a.issuer_id}${a.id_type}`.localeCompare(`${b.issuer_id}${b.id_type}`));
src/lib/entities/issuers.test.ts:45:  expect(c.rows('issuer_identifier_claims')).toEqual([expect.objectContaining({id_type:'lei',value:LEI_OTHER,status:'pending',source:'test'})]);
src/lib/entities/issuers.test.ts:51:  expect(c.rows('issuer_identifier_claims')).toHaveLength(1);
src/lib/entities/issuers.test.ts:57:  c.insert=async(t,row)=>{if(t==='issuer_identifier_claims')throw dupErr(t);return base(t,row);};
src/lib/entities/issuers.test.ts:124:  expect(c.rows('issuer_identifier_claims')).toEqual([expect.objectContaining({issuer_id:'d',id_type:'lei',value:LEI_APPLE,source:'gleif',status:'pending'})]);
src/lib/entities/issuers.test.ts:146:  expect(c.rows('issuer_identifier_claims')).toEqual([expect.objectContaining({issuer_id:'a',id_type:'lei',value:LEI_APPLE,source:'gleif'})]);
src/lib/entities/issuers.test.ts:154:  expect(c.rows('issuer_identifier_claims')).toHaveLength(0);
src/lib/entities/issuers.test.ts:164:  expect(c.rows('issuer_identifier_claims')).toEqual([expect.objectContaining({issuer_id:'a',id_type:'lei',value:LEI_APPLE})]);
src/lib/entities/issuers.test.ts:266:  await attachSecurity(c,{...sec,valid_to:'2010-01-01'});
src/lib/entities/issuers.test.ts:272:  expect(await attachSecurity(c,{...sec,issuer_id:'b',valid_from:'2000-01-01',valid_to:'2005-01-01'})).toBe('inserted');
src/lib/entities/issuers.test.ts:273:  expect(await attachSecurity(c,{...sec,issuer_id:'c',valid_from:'2005-01-01',valid_to:'2010-01-01'})).toBe('inserted');
src/lib/entities/issuers.test.ts:279:  expect(await attachSecurity(c,{...sec,issuer_id:'b',valid_from:'2005-01-01',valid_to:'2012-01-01'})).toBe('conflict');
src/lib/entities/issuers.test.ts:281:  expect(c.rows('issuer_identifier_claims')).toEqual([]);
src/lib/entities/issuers.test.ts:285:  expect(await attachSecurity(c,{...sec,valid_to:'2010-01-01'})).toBe('inserted');
src/lib/entities/issuers.test.ts:286:  expect(await attachSecurity(c,{...sec,valid_to:'2010-01-01'})).toBe('duplicate');
src/lib/entities/issuers.test.ts:289: it('reports conflict when a replay changes valid_to or the ISIN, claiming only a differing ISIN',async()=>{
src/lib/entities/issuers.test.ts:291:  expect(await attachSecurity(c,{...sec,valid_to:'2010-01-01',isin:'US0378331005'})).toBe('inserted');
src/lib/entities/issuers.test.ts:292:  expect(await attachSecurity(c,{...sec,valid_to:'2011-01-01'})).toBe('conflict');
src/lib/entities/issuers.test.ts:293:  expect(await attachSecurity(c,{...sec,valid_to:null})).toBe('conflict');
src/lib/entities/issuers.test.ts:294:  expect(c.rows('issuer_identifier_claims')).toEqual([]);
src/lib/entities/issuers.test.ts:295:  expect(await attachSecurity(c,{...sec,valid_to:'2010-01-01'})).toBe('duplicate');
src/lib/entities/issuers.test.ts:296:  expect(await attachSecurity(c,{...sec,valid_to:'2010-01-01',isin:'US5949181045'})).toBe('conflict');
src/lib/entities/issuers.test.ts:298:  expect(c.rows('issuer_securities')).toEqual([expect.objectContaining({valid_to:'2010-01-01',isin:'US0378331005'})]);
src/lib/entities/issuers.test.ts:310:  expect(c.rows('issuer_identifier_claims')).toEqual([expect.objectContaining({issuer_id:'b',id_type:'isin',value:'US0378331005'})]);
src/lib/entities/issuers.test.ts:324:  const closed={...sec,valid_to:'2010-01-01'};
src/lib/entities/issuers.test.ts:357:  expect(c.rows('issuer_identifier_claims')).toEqual([]);
src/lib/entities/identifiers.integration.test.ts:110:const sec=(iss:string,t:string,from:string,to:string|null,extra:Record<string,unknown>={})=>insertRow('issuer_securities',{issuer_id:iss,ticker:t,valid_from:from,valid_to:to,source:'test',...extra});
src/lib/entities/identifiers.integration.test.ts:122:   ('issuer_securities','valid_from_method'),('issuer_securities','valid_to_method'),
src/lib/entities/identifiers.integration.test.ts:123:   ('issuer_identifier_claims','op'),('issuer_identifier_claims','target_key'),('issuer_identifier_claims','detail'),('issuer_identifier_claims','resolved_by'),('issuer_identifier_claims','resolved_at'),
src/lib/entities/identifiers.integration.test.ts:127:  expect(await q(`select is_nullable from information_schema.columns where table_schema='public' and table_name='issuer_identifier_claims' and column_name='confidence'`)).toEqual([{is_nullable:'YES'}]);
src/lib/entities/identifiers.integration.test.ts:131:  for(const role of ['anon','authenticated'])for(const t of [...NEW_TABLES,'issuer_identifier_claims'])for(const priv of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']){
src/lib/entities/identifiers.integration.test.ts:165:  await sec(a,t2,'2010-01-01','2015-01-01',{valid_to_method:'delisting'});
src/lib/entities/identifiers.integration.test.ts:167:  expect(await q(`select ticker,valid_from_method,valid_to_method,provenance from public.issuer_securities where issuer_id=$1 order by valid_from`,[a])).toEqual([
src/lib/entities/identifiers.integration.test.ts:168:   {ticker:t2,valid_from_method:'first_observed',valid_to_method:'delisting',provenance:{}},
src/lib/entities/identifiers.integration.test.ts:169:   {ticker:t,valid_from_method:'listing_date',valid_to_method:null,provenance:prov},
src/lib/entities/identifiers.integration.test.ts:178:   const sec0=(t:string,from:string,to:string|null,source:string)=>db.query(`insert into public.issuer_securities(issuer_id,ticker,valid_from,valid_to,source) values($1,$2,$3,$4,$5)`,[iss,t,from,to,source]);
src/lib/entities/identifiers.integration.test.ts:185:   await db.query(`insert into public.issuer_identifier_claims(id,issuer_id,id_type,value,source,confidence,status) values($1,$3,'lei','LEIUPGRADE0000000012','test',0.5,'accepted'),($2,$3,'cik','123','test',0.5,'pending')`,[handled,pending,iss]);
src/lib/entities/identifiers.integration.test.ts:191:   const methods=async()=>(await db.query(`select ticker,valid_from_method,valid_to_method from public.issuer_securities where issuer_id=$1 order by ticker`,[iss])).rows;
src/lib/entities/identifiers.integration.test.ts:193:    {ticker:'ZZUPA',valid_from_method:'curated',valid_to_method:null},
src/lib/entities/identifiers.integration.test.ts:194:    {ticker:'ZZUPB',valid_from_method:'curated',valid_to_method:'curated'},
src/lib/entities/identifiers.integration.test.ts:195:    {ticker:'ZZUPC',valid_from_method:'first_observed',valid_to_method:'unrecorded'},
src/lib/entities/identifiers.integration.test.ts:196:    {ticker:'ZZUPD',valid_from_method:'first_observed',valid_to_method:null},
src/lib/entities/identifiers.integration.test.ts:198:   const claims=async()=>(await db.query(`select id,op,target_key,detail,confidence::text conf,status,resolved_at from public.issuer_identifier_claims where issuer_id=$1 order by value`,[iss])).rows;
src/lib/entities/identifiers.integration.test.ts:207:   await db.query(`update public.issuer_securities set valid_to_method='delisting' where ticker='ZZUPC'`);
src/lib/entities/identifiers.integration.test.ts:210:   await db.query(`insert into public.issuer_identifier_claims(id,issuer_id,id_type,value,source,status,op,target_key,detail) values($1,$2,'ticker','ZZUPA','test','pending','evidence_only',$3,'{"schema":"claim/1"}')`,[fresh,iss,`evidence_only:${iss}`]);
src/lib/entities/identifiers.integration.test.ts:213:    {ticker:'ZZUPA',valid_from_method:'listing_date',valid_to_method:null},
src/lib/entities/identifiers.integration.test.ts:214:    {ticker:'ZZUPB',valid_from_method:'curated',valid_to_method:'curated'},
src/lib/entities/identifiers.integration.test.ts:215:    {ticker:'ZZUPC',valid_from_method:'first_observed',valid_to_method:'delisting'},
src/lib/entities/identifiers.integration.test.ts:216:    {ticker:'ZZUPD',valid_from_method:'first_observed',valid_to_method:null},
src/lib/entities/identifiers.integration.test.ts:220:   expect((await db.query(`select op from public.issuer_identifier_claims where id=$1`,[fresh])).rows).toEqual([{op:'evidence_only'}]);
src/lib/entities/identifiers.integration.test.ts:229:  expect((await fails(sec(a,t,'2020-01-01',null,{valid_to_method:'delisting'}))).message).toMatch(/issuer_securities_to_method_iff_to/);
src/lib/entities/identifiers.integration.test.ts:230:  expect((await fails(sec(a,t,'2020-01-01','2021-01-01',{valid_to_method:'vanished'}))).message).toMatch(/issuer_securities_valid_to_method_check/);
src/lib/entities/identifiers.integration.test.ts:231:  await sec(a,t,'2020-01-01','2021-01-01',{valid_to_method:'sec_file_absent'});
src/lib/entities/identifiers.integration.test.ts:232:  expect((await fails(q(`update public.issuer_securities set valid_to=null where issuer_id=$1 and ticker=$2`,[a,t]))).message).toMatch(/issuer_securities_to_method_iff_to/);
src/lib/entities/identifiers.integration.test.ts:234:  expect(await q(`select valid_from::text,valid_from_method,valid_to_method from public.issuer_securities where ticker=$1 order by valid_from`,[t])).toEqual([
src/lib/entities/identifiers.integration.test.ts:235:   {valid_from:'2020-01-01',valid_from_method:'first_observed',valid_to_method:'sec_file_absent'},
src/lib/entities/identifiers.integration.test.ts:236:   {valid_from:'2021-01-01',valid_from_method:'ticker_change',valid_to_method:null},
src/lib/entities/identifiers.integration.test.ts:242:  const claim=(over:Record<string,unknown>)=>insertRow('issuer_identifier_claims',{id:randomUUID(),issuer_id:a,id_type:'ticker',value:'ZZX',source:'test',status:'pending',op:'evidence_only',target_key:`evidence_only:${a}`,detail:'{}',...over});
src/lib/entities/identifiers.integration.test.ts:244:  expect((await fails(claim({}))).message).toMatch(/issuer_identifier_claims_pending_unique/);
src/lib/entities/identifiers.integration.test.ts:248:  expect((await fails(claim({id_type:'ric'}))).message).toMatch(/issuer_identifier_claims_id_type_check/);
src/lib/entities/identifiers.integration.test.ts:249:  expect((await fails(claim({op:'merge',target_key:'merge:x'}))).message).toMatch(/issuer_identifier_claims_op_check/);
src/lib/entities/identifiers.integration.test.ts:250:  expect((await fails(claim({value:'ZZY',detail:'[]'}))).message).toMatch(/issuer_identifier_claims_detail_object/);
src/lib/entities/identifiers.integration.test.ts:251:  expect((await fails(claim({value:'ZZY',resolved_at:new Date().toISOString()}))).message).toMatch(/issuer_identifier_claims_pending_has_no_resolution/);
src/lib/entities/identifiers.integration.test.ts:252:  expect((await fails(claim({value:'ZZY',target_key:''}))).message).toMatch(/issuer_identifier_claims_target_key_required/);
src/lib/entities/identifiers.integration.test.ts:253:  expect((await fails(claim({value:'ZZY',target_key:'x'.repeat(257)}))).message).toMatch(/issuer_identifier_claims_target_key_check/);
src/lib/entities/identifiers.integration.test.ts:254:  expect((await fails(claim({value:'ZZY',confidence:1.5}))).message).toMatch(/issuer_identifier_claims_confidence_check/);
src/lib/entities/identifiers.integration.test.ts:257:  await q(`insert into public.issuer_identifier_claims(id,issuer_id,id_type,value,source,confidence) values($1,$2,'lei','L1','test',0.5)`,[legacy,a]);
src/lib/entities/identifiers.integration.test.ts:258:  expect(await q(`select op,target_key,detail,status from public.issuer_identifier_claims where id=$1`,[legacy])).toEqual([{op:'legacy',target_key:'',detail:{},status:'pending'}]);
src/lib/entities/link-research.test.ts:37:const sec=(over:Partial<EntitySecurityRow>):EntitySecurityRow=>({user_id:U,id:'s',entity_id:'e',exchange_code:'AAPL',isin:null,market:'US',security_type:'common',is_primary:false,valid_from:'2000-01-01',valid_to:null,...over});
src/lib/entities/link-research.test.ts:60:   {entity_key:`${U}:e1`,user_id:U,entity_id:'e1',security_id:'s1',ticker:'600570.SH',isin:'CNE000001GN7',share_class:'A',is_primary:true,valid_from:'2003-12-16',valid_to:null,source:'curated',provenance:sprov},
src/lib/entities/link-research.test.ts:61:   {entity_key:`${U}:e3`,user_id:U,entity_id:'e3',security_id:'s2',ticker:'AAPL',isin:null,share_class:'ADR',is_primary:false,valid_from:'2000-01-01',valid_to:null,source:'curated',provenance:sprov},
src/lib/entities/link-research.test.ts:180:    payload:{ticker:'MSFT',isin:null,share_class:'common',is_primary:false,valid_from:'2000-01-01',valid_to:null,entity_key:`${U}:e2:s2`},batch_id:BATCH},
src/lib/entities/link-research.test.ts:187:  await c.update('research_entity_securities',{user_id:U,id:'s2'},{valid_to:'2009-12-31'});
src/lib/entities/link-research.test.ts:192:   {natural_key:'MSFT:2000-01-01',payload:{ticker:'MSFT',isin:null,share_class:'common',is_primary:false,valid_from:'2000-01-01',valid_to:'2009-12-31',entity_key:`${U}:e2:s2`}},
src/lib/entities/link-research.test.ts:193:   {natural_key:'MSFT:2010-01-01',payload:{ticker:'MSFT',isin:'US5949181045',share_class:'common',is_primary:true,valid_from:'2010-01-01',valid_to:null,entity_key:`${U}:e2:s3`}},
src/lib/entities/claims.ts:1:// Pending issuer_identifier_claims: the review queue for identifiers that contradict stored data.
src/lib/entities/claims.ts:19: if(await client.count('issuer_identifier_claims',pending)>0)return false;
src/lib/entities/claims.ts:21:  await client.insert('issuer_identifier_claims',{id:randomUUID(),...c,confidence:0.5,status:'pending',created_at:new Date().toISOString()});
src/lib/entities/issuers.integration.test.ts:9:const TABLES=['issuers','issuer_securities','issuer_identifier_claims','industry_classifications','issuer_industry_memberships'];
src/lib/entities/issuers.integration.test.ts:10:const PUBLIC_TABLES=TABLES.filter(t=>t!=='issuer_identifier_claims');
src/lib/entities/issuers.integration.test.ts:56:const sec=(issuer:string,ticker:string,from:string,to:string|null,extraCols='',extraVals='',params:unknown[]=[])=>admin.query(`insert into public.issuer_securities(issuer_id,ticker,valid_from,valid_to,source${to===null?'':',valid_to_method'}${extraCols}) values($1,$2,$3,$4,'test'${to===null?'':",'unrecorded'"}${extraVals})`,[issuer,ticker,from,to,...params]);
src/lib/entities/issuers.integration.test.ts:71:   await admin.query(`delete from public.issuer_identifier_claims where issuer_id=any($1::uuid[])`,[issuers]);
src/lib/entities/issuers.integration.test.ts:122:  const owners=(await admin.query(`select issuer_id,valid_to from public.issuer_securities where ticker=$1 order by valid_from`,[us])).rows;
src/lib/entities/issuers.integration.test.ts:125:  const claim=(id_type:string,confidence:number,value='X',status='pending')=>admin.query(`insert into public.issuer_identifier_claims(id,issuer_id,id_type,value,source,confidence,status) values($1,$2,$3,$4,'test',$5,$6)`,[randomUUID(),a,id_type,value,confidence,status]);
src/lib/entities/issuers.integration.test.ts:127:  await expect(claim('lei',0.8)).rejects.toThrow(/issuer_identifier_claims_pending_unique/);
src/lib/entities/issuers.integration.test.ts:132:  const claims=(await admin.query(`select id_type,value,status from public.issuer_identifier_claims where issuer_id=$1 order by id_type,status`,[a])).rows;
src/lib/entities/issuers.integration.test.ts:134:  await expect(claim('ric',0.5)).rejects.toThrow(/issuer_identifier_claims_id_type_check/);
src/lib/entities/issuers.integration.test.ts:135:  await expect(claim('cik',1.5)).rejects.toThrow(/issuer_identifier_claims_confidence_check/);
src/lib/entities/issuers.integration.test.ts:156:  const rows=(await admin.query(`select issuer_id,valid_from::text,valid_to::text from public.issuer_securities where ticker=$1 order by valid_from`,[t2])).rows;
src/lib/entities/issuers.integration.test.ts:157:  expect(rows).toEqual([{issuer_id:a,valid_from:'2020-01-01',valid_to:'2021-01-01'},{issuer_id:b,valid_from:'2021-01-01',valid_to:null}]);
src/lib/entities/issuers.integration.test.ts:187:  await expect(admin.query(`update public.issuer_securities set valid_to=null where issuer_id=$1 and ticker=$2`,[a,t])).rejects.toThrow(/issuer_not_active/);
src/lib/entities/issuers.integration.test.ts:209:  await admin.query(`update public.issuer_securities set valid_to='2024-01-01',valid_to_method='unrecorded' where issuer_id=$1 and ticker=$2`,[a,t]);
src/lib/entities/issuers.integration.test.ts:221:  const mem=(from:string,to:string|null)=>admin.query(`insert into public.issuer_industry_memberships(issuer_id,scheme,version,code,valid_from,valid_to,source) values($1,'custom',$2,'1010',$3,$4,'test')`,[a,version,from,to]);
src/lib/entities/issuers.integration.test.ts:235:    const allowed=(await admin.query(`select has_table_privilege($1,'public.issuer_identifier_claims',$2) ok`,[role,priv])).rows[0].ok;
src/lib/entities/issuers.integration.test.ts:250:    await expect(c.query(`select * from public.issuer_identifier_claims`)).rejects.toThrow(/permission denied/);
src/lib/entities/resolve.ts:6:// row is current at `today` iff valid_from <= today and (valid_to is null or valid_to > today).
src/lib/entities/resolve.ts:17:export interface ResolvedSecurity{ticker:string;isin:string|null;figi:string|null;share_class:string|null;is_primary:boolean;valid_from:string;valid_to:string|null}
src/lib/entities/resolve.ts:27:const isCurrent=(r:Row,today:string)=>{const from=str(r.valid_from),to=str(r.valid_to);return from!==null&&from<=today&&(to===null||to>today);};
src/lib/entities/resolve.ts:28:/** The one validity predicate (valid_from <= today && (valid_to is null || valid_to > today)); reused by the facts scope (plan 2 Task 14). */
src/lib/entities/resolve.ts:30:const toSecurity=(r:Row):ResolvedSecurity=>({ticker:String(r.ticker),isin:str(r.isin),figi:str(r.figi),share_class:str(r.share_class),is_primary:r.is_primary===true,valid_from:String(r.valid_from),valid_to:str(r.valid_to)});
src/lib/entities/resolve.ts:35: if(!/^\d{4}-\d{2}-\d{2}$/.test(today))throw new Error('invalid_today');
src/lib/entities/resolve.ts:37: if(Number.isNaN(ms)||new Date(ms).toISOString().slice(0,10)!==today)throw new Error('invalid_today');
src/lib/entities/link-research.ts:22:export interface EntitySecurityRow{user_id:string;id:string;entity_id:string;exchange_code:string;isin:string|null;market:Market;security_type:'common'|'adr'|'preferred'|'other';is_primary:boolean;valid_from:string;valid_to:string|null}
src/lib/entities/link-research.ts:24:export interface PlannedSecurity{entity_key:string;user_id:string;entity_id:string;security_id:string;ticker:string;isin:string|null;share_class:ShareClass;is_primary:boolean;valid_from:string;valid_to:string|null;source:typeof CURATED;provenance:{source:typeof CURATED;as_of:string}}
src/lib/entities/link-research.ts:111:  plan.securities.push({entity_key,user_id:s.user_id,entity_id:s.entity_id,security_id:s.id,ticker:t,isin:str(s.isin),share_class:shareClass(s,t,entity),is_primary:s.is_primary===true,valid_from:s.valid_from,valid_to:s.valid_to??null,source:CURATED,provenance:{source:CURATED,as_of:asOf}});
src/lib/entities/link-research.ts:174:   const payload={ticker:sec.ticker,isin:sec.isin,share_class:sec.share_class,is_primary:sec.is_primary,valid_from:sec.valid_from,valid_to:sec.valid_to,entity_key:key};
src/lib/entities/securities.ts:2:// half-open [valid_from, valid_to) windows; this module classifies an incoming window against the
src/lib/entities/securities.ts:11:type Window={valid_from:string;valid_to:string|null};
src/lib/entities/securities.ts:13:/** Half-open overlap with null valid_to = +∞. Dates are ISO 'YYYY-MM-DD', so text order is date order. */
src/lib/entities/securities.ts:15: const from=String(r.valid_from),to=str(r.valid_to);
src/lib/entities/securities.ts:16: return (w.valid_to===null||from<w.valid_to)&&(to===null||w.valid_from<to);
src/lib/entities/securities.ts:20: const sec={...raw,ticker:normalizeTicker(raw.ticker),isin:normalizeIsin(raw.isin),valid_to:isBlank(raw.valid_to)?null:String(raw.valid_to)};
src/lib/entities/securities.ts:36:   if(str(same.valid_to)===sec.valid_to&&!isinDiffers)return 'duplicate';
src/lib/entities/securities.ts:52:   is_primary:sec.is_primary??false,valid_from:sec.valid_from,valid_to:sec.valid_to,
src/lib/entities/securities.ts:54:   valid_to_method:sec.valid_to===null?null:(sec.source==='curated'?'curated':'unrecorded'),

exec
/bin/zsh -lc "git show 52c5414 -- src/lib/supabase/database.types.ts; rg -n 'set valid_to|valid_to:' supabase/migrations/*issuer* src/lib/entities/merge*; sed -n '260,410p' src/lib/entities/identifiers.integration.test.ts; find . -name '*AGENTS*' -not -path './node_modules/*'; ls -a .claude; cat .codex/config.toml 2>/dev/null" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 80ms:
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-W4Hat7W1' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-EEAUnuoG' (errno=Operation not permitted)
commit 52c5414677c46d6160b41760d563eaaf621bfaf4
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Thu Nov 5 17:23:28 2026 -0800

    feat(dq): migration one schema — window methods, claim/1 columns, reconcile and calendar tables, reconcile-raw bucket
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/supabase/database.types.ts b/src/lib/supabase/database.types.ts
index d8a31b1..1c51f95 100644
--- a/src/lib/supabase/database.types.ts
+++ b/src/lib/supabase/database.types.ts
@@ -11,6 +11,9 @@
 // + migrations up to 20261105091000_issuers.sql (issuers, issuer_securities, issuer_identifier_claims,
 //   industry_classifications, issuer_industry_memberships; research_entity_* link columns are not typed here)
 // + 20261106090000_financial_facts.sql (fact_sync_runs, filings, financial_facts, financial_metrics, fact_sync_scope)
+// + 20261107090000_identifiers_and_dq.sql (issuer_securities window methods; issuer_identifier_claims claim/1 columns;
+//   dq_reconciliations pair/kind/outcome/detail/cycle columns; dq_reconcile_cycles, dq_reconcile_cursor, dq_calendar_passes,
+//   dq_calendar_pass_members, issuer_filer_categories, dq_filing_expectations, issuer_filing_profiles; dq_freshness weekly)
 // Regenerate with: npm run supabase:types (after supabase link)
 
 export type Market = 'A' | 'HK' | 'US' | 'JP' | 'KR' | 'TW';
@@ -573,12 +576,20 @@ export interface DqReconciliation {
   passed: boolean;
   batch_id: string | null;
   created_at: string;
+  pair: string;
+  kind: DqReconcileKind;
+  outcome: DqReconcileOutcome;
+  detail: Record<string, unknown>;
+  cycle_id: string | null;
+  issuer_id: string | null;
+  market: FactMarket | null;
+  attempt: number | null;
 }
 
 export type DqFreshnessStatus = 'fresh' | 'stale' | 'error' | 'missing';
 export interface DqFreshness {
   dataset: string;
-  expected_cadence: 'daily' | 'monthly' | 'quarterly' | 'event';
+  expected_cadence: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'event';
   last_ok_at: string | null;
   last_attempt_at: string | null;
   consecutive_errors: number;
@@ -709,19 +720,27 @@ export interface IssuerSecurity {
   is_primary: boolean;
   valid_from: string;
   valid_to: string | null;
+  valid_from_method: ValidFromMethod;
+  valid_to_method: ValidToMethod | null;
   source: string;
   provenance: Record<string, unknown>;
 }
 
-export type IssuerIdentifierType = 'lei' | 'cik' | 'usci' | 'isin' | 'figi' | 'cninfo_org_id';
+export type IssuerIdentifierType = 'lei' | 'cik' | 'usci' | 'isin' | 'figi' | 'cninfo_org_id' | 'ticker';
+export type IssuerClaimOp = 'legacy' | 'evidence_only' | 'set_identifier' | 'correct_identifier' | 'attach_security' | 'close_security' | 'backdate_window';
 export interface IssuerIdentifierClaim {
   id: string;
   issuer_id: string;
   id_type: IssuerIdentifierType;
   value: string;
   source: string;
-  confidence: number;
+  confidence: number | null;          // legacy rows only; claim/1 claims carry evidence classes, not confidence
   status: 'accepted' | 'pending' | 'rejected';
+  op: IssuerClaimOp;
+  target_key: string;
+  detail: Record<string, unknown>;    // claim/1 payload (src/lib/entities/types.ts ClaimDetail); {} on legacy rows
+  resolved_by: string | null;
+  resolved_at: string | null;
   created_at: string;
 }
 
@@ -747,6 +766,103 @@ export interface IssuerIndustryMembership {
   provenance: Record<string, unknown>;
 }
 
+// 20261107090000_identifiers_and_dq.sql (plan 3 Task 1). All new tables are service-role only.
+export type ValidFromMethod = 'first_observed' | 'listing_date' | 'ticker_change' | 'curated';
+export type ValidToMethod = 'delisting' | 'ticker_change' | 'sec_file_absent' | 'curated' | 'merge_close' | 'unrecorded';
+export type DqReconcileKind = 'numeric' | 'text' | 'date';
+export type DqReconcileOutcome = 'compared' | 'left_missing' | 'left_unlinked' | 'left_ambiguous' | 'right_missing' | 'unsupported' | 'right_ambiguous' | 'incomplete_gold' | 'legacy';
+export interface DqReconcileCycle {
+  pair: string;
+  cycle_id: string;
+  started_at: string;
+  finished_at: string | null;
+  members: { issuer_id: string; market: FactMarket; expected_keys: unknown[] }[];
+  status: 'running' | 'complete' | 'complete_with_gaps';
+  expected_total: number;
+  compared_passed: number;
+  compared_failed: number;
+  not_compared: number;
+  exec_failed_members: number;
+  detail: Record<string, unknown>;
+}
+export interface DqReconcileCursor {
+  pair: string;
+  cycle_id: string;
+  issuer_id: string;
+  market: FactMarket;
+  expected: number;
+  state: 'pending' | 'claimed' | 'done' | 'failed';
+  claimed_by: string | null;
+  claim_until: string | null;
+  attempts: number;
+  last_error: string | null;
+  done_at: string | null;
+  compared_passed: number | null;
+  compared_failed: number | null;
+  not_compared: number | null;
+}
+export interface DqCalendarPass {
+  market: FactMarket;
+  pass_id: string;
+  started_at: string;
+  finished_at: string | null;
+  claimed_by: string | null;
+  claim_until: string | null;
+  status: 'running' | 'complete' | 'complete_with_failures';
+}
+export interface DqCalendarPassMember {
+  market: FactMarket;
+  pass_id: string;
+  issuer_id: string;
+  state: 'pending' | 'done' | 'failed';
+  attempts: number;
+  last_error: string | null;
+  done_at: string | null;
+}
+export interface IssuerFilerCategory {
+  issuer_id: string;
+  fiscal_year: number;
+  acceleration: 'large_accelerated' | 'accelerated' | 'non_accelerated';
+  smaller_reporting: boolean | null;
+  category_raw: string;
+  source: 'ixbrl_dei';
+  accession: string;
+  evidence_sha256: string;
+  as_of: string;
+}
+export interface DqFilingExpectation {
+  issuer_id: string;
+  market: FactMarket;
+  report_kind: '10-K' | '10-Q' | '20-F' | '40-F' | 'annual' | 'semiannual' | 'q1' | 'q3';
+  period_end: string;
+  period_end_estimated: boolean;
+  deadline_state: 'statutory' | 'estimated' | 'no_rule';
+  due_date: string | null;
+  due_rule: string;
+  expected_date: string | null;
+  upstream_lookup: 'ok' | 'unavailable' | 'not_applicable';
+  upstream_filed_date: string | null;
+  disclosure_state: 'pending' | 'overdue' | 'filed_not_ingested' | 'received' | 'received_late' | 'unknown_upstream';
+  received_filing_id: string | null;
+  received_date: string | null;
+  profile_as_of: string | null;
+  detail: Record<string, unknown>;
+  computed_at: string;
+  batch_id: string;
+}
+export interface IssuerFilingProfile {
+  issuer_id: string;
+  market: FactMarket;
+  category_raw_current: string | null;
+  regime: '10-K' | '20-F' | '40-F' | 'cn';
+  fiscal_year_end: string | null;
+  week52_pattern: boolean;
+  source: string;
+  source_sha256: string | null;
+  as_of: string;
+  updated_at: string;
+}
+
 export type Database = {
   public: {
     Tables: {
@@ -797,6 +913,13 @@ export type Database = {
       financial_facts: { Row: FinancialFact; Insert: Partial<FinancialFact>; Update: Partial<FinancialFact> };
       financial_metrics: { Row: FinancialMetric; Insert: Partial<FinancialMetric>; Update: Partial<FinancialMetric> };
       fact_sync_scope: { Row: FactSyncScope; Insert: Partial<FactSyncScope>; Update: Partial<FactSyncScope> };
+      dq_reconcile_cycles: { Row: DqReconcileCycle; Insert: Partial<DqReconcileCycle>; Update: Partial<DqReconcileCycle> };
+      dq_reconcile_cursor: { Row: DqReconcileCursor; Insert: Partial<DqReconcileCursor>; Update: Partial<DqReconcileCursor> };
+      dq_calendar_passes: { Row: DqCalendarPass; Insert: Partial<DqCalendarPass>; Update: Partial<DqCalendarPass> };
+      dq_calendar_pass_members: { Row: DqCalendarPassMember; Insert: Partial<DqCalendarPassMember>; Update: Partial<DqCalendarPassMember> };
+      issuer_filer_categories: { Row: IssuerFilerCategory; Insert: Partial<IssuerFilerCategory>; Update: Partial<IssuerFilerCategory> };
+      dq_filing_expectations: { Row: DqFilingExpectation; Insert: Partial<DqFilingExpectation>; Update: Partial<DqFilingExpectation> };
+      issuer_filing_profiles: { Row: IssuerFilingProfile; Insert: Partial<IssuerFilingProfile>; Update: Partial<IssuerFilingProfile> };
     };
     Functions: {
       quote_alert_window_samples: {

 it('dq_reconciliations: kind/outcome checks, side constraints, cycle columns all-or-none, one result per cycle key',async()=>{
  const rec=(over:Record<string,unknown>)=>insertRow('dq_reconciliations',{id:randomUUID(),dataset:'reconcile.test',left_source:'l',right_source:'r',natural_key:'k:'+randomUUID(),tolerance:0,passed:true,pair:'us.companyfacts_vs_ixbrl',kind:'numeric',outcome:'compared',left_value:'10',right_value:'10',...over});
  await rec({});
  expect((await fails(rec({kind:'percent'}))).message).toMatch(/dq_reconciliations_kind_check/);
  expect((await fails(rec({outcome:'skipped'}))).message).toMatch(/dq_reconciliations_outcome_check/);
  for(const outcome of ['left_missing','left_unlinked','left_ambiguous','right_missing','unsupported','right_ambiguous','incomplete_gold'])await rec({outcome,left_value:null,right_value:null,passed:false});
  expect((await fails(rec({left_value:null}))).message).toMatch(/dq_reconciliations_numeric_sides/);
  expect((await fails(rec({kind:'text'}))).message).toMatch(/dq_reconciliations_nonnumeric_sides/);
  await rec({kind:'date',left_value:null,right_value:null,detail:JSON.stringify({left_text:'2026-01-02',right_text:'2026-01-02'})});
  expect((await fails(rec({kind:'date',left_value:null,right_value:null,rel_diff:'0'}))).message).toMatch(/dq_reconciliations_nonnumeric_sides/);
  expect((await fails(rec({detail:'[]'}))).message).toMatch(/dq_reconciliations_detail_object/);
  expect((await fails(rec({pair:''}))).message).toMatch(/dq_reconciliations_pair_check/);
  const iss=await issuer();
  expect((await fails(rec({cycle_id:'c1',issuer_id:iss,market:'US'}))).message).toMatch(/dq_reconciliations_cycle_cols/);   // attempt missing
  expect((await fails(rec({attempt:1}))).message).toMatch(/dq_reconciliations_cycle_cols/);
  const key='k:'+randomUUID();
  await rec({natural_key:key,cycle_id:'c-'+key,issuer_id:iss,market:'US',attempt:1});
  expect((await fails(rec({natural_key:key,cycle_id:'c-'+key,issuer_id:iss,market:'US',attempt:2}))).message).toMatch(/dq_reconciliations_cycle_key/);
  await rec({natural_key:key,cycle_id:'c2-'+key,issuer_id:iss,market:'US',attempt:1});   // the next cycle has its own key
  await rec({natural_key:key});                                                           // outside cycles the log is append-only
  await rec({natural_key:key});
  expect((await fails(rec({cycle_id:'c3-'+key,issuer_id:iss,market:'HK',attempt:1}))).message).toMatch(/dq_reconciliations_market_check/);
  expect((await fails(rec({cycle_id:'c4-'+key,issuer_id:iss,market:'US',attempt:0}))).message).toMatch(/dq_reconciliations_attempt_check/);
 });

 it('reconcile cycles and cursor: one running cycle per pair, terminal iff finished, drc_* invariants',async()=>{
  const pair='test.'+randomUUID().slice(0,8);
  const cycle=(id:string,status='running',finished:string|null=null,members='[]')=>insertRow('dq_reconcile_cycles',{pair,cycle_id:id,started_at:new Date().toISOString(),finished_at:finished,members,status,expected_total:0});
  await cycle('c1');
  expect((await fails(cycle('c2'))).message).toMatch(/dq_reconcile_cycles_running_uniq/);
  expect((await fails(cycle('c3','complete',new Date().toISOString(),'{}'))).message).toMatch(/dq_reconcile_cycles_members_array/);
  expect((await fails(cycle('c4','complete'))).message).toMatch(/dq_reconcile_cycles_finished_iff_terminal/);
  expect((await fails(cycle('c5','paused',new Date().toISOString()))).message).toMatch(/dq_reconcile_cycles_status_check/);
  await cycle('c0','complete_with_gaps',new Date().toISOString());
  const cursor=async(over:Record<string,unknown>)=>insertRow('dq_reconcile_cursor',{pair,cycle_id:'c1',issuer_id:await issuer(),market:'US',expected:2,...over});
  const first=await issuer();
  await cursor({issuer_id:first});
  expect((await fails(cursor({issuer_id:first}))).message).toMatch(/dq_reconcile_cursor_pkey/);
  expect((await fails(cursor({cycle_id:'nope'}))).message).toMatch(/dq_reconcile_cursor_cycle_fkey/);
  expect((await fails(cursor({expected:-1}))).message).toMatch(/drc_expected_nonneg/);
  expect((await fails(cursor({state:'running'}))).message).toMatch(/dq_reconcile_cursor_state_check/);
  expect((await fails(cursor({compared_failed:-1}))).message).toMatch(/drc_counters_nonneg/);
  expect((await fails(cursor({attempts:-1}))).message).toMatch(/dq_reconcile_cursor_attempts_check/);
  expect((await fails(cursor({market:'HK'}))).message).toMatch(/dq_reconcile_cursor_market_check/);
  // S5: a done row needs all three counters, non-null, summing to expected (NULL is never coalesced to 0)
  expect((await fails(cursor({state:'done',compared_passed:2,compared_failed:0}))).message).toMatch(/drc_done_accounted/);
  expect((await fails(cursor({state:'done',compared_passed:1,compared_failed:0,not_compared:0}))).message).toMatch(/drc_done_accounted/);
  await cursor({state:'done',compared_passed:1,compared_failed:0,not_compared:1,done_at:new Date().toISOString()});
  await cursor({state:'failed',attempts:3,last_error:'boom'});
  expect((await fails(q(`delete from public.dq_reconcile_cycles where pair=$1 and cycle_id='c1'`,[pair]))).message).toMatch(/dq_reconcile_cursor_cycle_fkey/);
 });

 it('calendar pass tables: one open pass per market, finished iff terminal, member checks',async()=>{
  await withCalendarLock(admin,async()=>{
   const b=await batch();
   const pass=async(market:string,status='running',finished:string|null=null)=>{
    const id=randomUUID();
    await insertRow('dq_calendar_passes',{market,pass_id:id,started_at:new Date().toISOString(),finished_at:finished,claimed_by:b,claim_until:new Date(Date.now()+600_000).toISOString(),status});
    return id;
   };
   const open=await pass('CN');
   expect((await fails(pass('CN'))).message).toMatch(/dq_calendar_passes_open_uniq/);
   expect((await fails(pass('HK'))).message).toMatch(/dq_calendar_passes_market_check/);
   expect((await fails(pass('US','complete'))).message).toMatch(/dcp_finished_iff_terminal/);
   expect((await fails(pass('US','running',new Date().toISOString()))).message).toMatch(/dcp_finished_iff_terminal/);
   expect((await fails(pass('US','paused',new Date().toISOString()))).message).toMatch(/dq_calendar_passes_status_check/);
   const member=async(over:Record<string,unknown>)=>insertRow('dq_calendar_pass_members',{market:'CN',pass_id:open,issuer_id:await issuer(),...over});
   const first=await issuer();
   await member({issuer_id:first});
   expect((await fails(member({issuer_id:first}))).message).toMatch(/dq_calendar_pass_members_pkey/);
   expect((await fails(member({attempts:-1}))).message).toMatch(/dq_calendar_pass_members_attempts_check/);
   expect((await fails(member({state:'claimed'}))).message).toMatch(/dq_calendar_pass_members_state_check/);
   expect((await fails(member({pass_id:randomUUID()}))).message).toMatch(/dq_calendar_pass_members_pass_fkey/);
   await member({state:'failed',attempts:3,last_error:'sec_unavailable'});
  });
 });

 it('dq_filing_expectations: every dfe_* combination, the other checks and the key',async()=>{
  const b=await batch('dq.calendar.us');const iss=await issuer();
  let n=0;
  // each row gets its own period_end unless the case sets one, so only the asserted constraint can fail
  const exp=(over:Record<string,unknown>)=>{
   n++;
   return insertRow('dq_filing_expectations',{issuer_id:iss,market:'US',report_kind:'10-K',period_end:`${2010+n}-12-31`,deadline_state:'statutory',due_date:'2027-03-01',due_rule:'10-K.large_accelerated.60d',upstream_lookup:'ok',disclosure_state:'pending',computed_at:new Date().toISOString(),batch_id:b,...over});
  };
  const filed=()=>({received_filing_id:randomUUID(),received_date:'2027-02-01'});
  await exp({});                                                                                    // statutory, pending
  await exp({deadline_state:'no_rule',due_date:null,due_rule:'none.src_only'});                       // no_rule, pending
  await exp({deadline_state:'no_rule',due_date:null,due_rule:'none.src_only',disclosure_state:'received',...filed()});   // no_rule rows may be received
  await exp({deadline_state:'estimated',period_end_estimated:true,detail:JSON.stringify({estimated_due_passed:true})});   // estimated past due stays pending
  await exp({disclosure_state:'overdue'});
  await exp({disclosure_state:'received_late',received_filing_id:randomUUID(),received_date:'2027-03-05'});
  await exp({disclosure_state:'filed_not_ingested',upstream_filed_date:'2027-02-20'});
  await exp({upstream_lookup:'unavailable',disclosure_state:'unknown_upstream'});
  await exp({upstream_lookup:'unavailable',disclosure_state:'received',...filed()});                  // received although the lookup was unavailable
  await exp({market:'CN',report_kind:'annual',upstream_lookup:'not_applicable',expected_date:'2027-04-20'});
  await exp({period_end:'2099-06-30'});
  const bad=async(over:Record<string,unknown>,constraint:RegExp)=>expect((await fails(exp(over))).message).toMatch(constraint);
  await bad({deadline_state:'no_rule'},/dfe_due_iff_known/);                                        // no_rule with a due date
  await bad({due_date:null},/dfe_due_iff_known/);                                                   // statutory without one
  await bad({disclosure_state:'received'},/dfe_received_iff/);                                      // received without the filing
  await bad(filed(),/dfe_received_iff/);                                                            // pending yet carries a filing
  await bad({disclosure_state:'received',received_filing_id:randomUUID()},/dfe_received_iff/);     // missing received_date
  await bad({deadline_state:'no_rule',due_date:null,disclosure_state:'received_late',...filed()},/dfe_late_requires_due/);
  await bad({deadline_state:'estimated',disclosure_state:'overdue'},/dfe_overdue_requires_statutory/);
  await bad({deadline_state:'no_rule',due_date:null,disclosure_state:'overdue'},/dfe_overdue_requires_statutory/);
  await bad({disclosure_state:'unknown_upstream'},/dfe_unknown_upstream_iff/);                      // lookup was ok
  await bad({upstream_lookup:'unavailable'},/dfe_unknown_upstream_iff/);                            // unavailable, nothing received, not unknown_upstream
  await bad({market:'HK'},/dq_filing_expectations_market_check/);
  await bad({report_kind:'8-K'},/dq_filing_expectations_report_kind_check/);
  await bad({deadline_state:'late'},/dq_filing_expectations_deadline_state_check/);
  await bad({disclosure_state:'missing'},/dq_filing_expectations_disclosure_state_check/);
  await bad({upstream_lookup:'maybe'},/dq_filing_expectations_upstream_lookup_check/);
  await bad({detail:'[]'},/dq_filing_expectations_detail_object/);
  await bad({batch_id:randomUUID()},/dq_filing_expectations_batch_id_fkey/);
  await bad({period_end:'2099-06-30'},/dq_filing_expectations_pkey/);
 });

 it('issuer_filer_categories and issuer_filing_profiles: checks and composite keys',async()=>{
  const iss=await issuer();
  const cat=(over:Record<string,unknown>)=>insertRow('issuer_filer_categories',{issuer_id:iss,fiscal_year:2025,acceleration:'large_accelerated',smaller_reporting:false,category_raw:'Large Accelerated Filer',source:'ixbrl_dei',accession:'0000320193-25-000079',evidence_sha256:SHA,as_of:'2026-11-05',...over});
  await cat({});
  await cat({fiscal_year:2024,acceleration:'non_accelerated',smaller_reporting:true,category_raw:'Non-accelerated Filer'});
  await cat({fiscal_year:2023,smaller_reporting:null});
  expect((await fails(cat({}))).message).toMatch(/issuer_filer_categories_pkey/);
  expect((await fails(cat({fiscal_year:2022,acceleration:'smaller_reporting'}))).message).toMatch(/issuer_filer_categories_acceleration_check/);
  expect((await fails(cat({fiscal_year:2021,source:'submissions'}))).message).toMatch(/issuer_filer_categories_source_check/);
  expect((await fails(cat({fiscal_year:2020,evidence_sha256:'xyz'}))).message).toMatch(/issuer_filer_categories_evidence_sha256_check/);
  const prof=(over:Record<string,unknown>)=>insertRow('issuer_filing_profiles',{issuer_id:iss,market:'US',category_raw_current:'Large accelerated filer',regime:'10-K',fiscal_year_end:'0927',week52_pattern:true,source:'sec_submissions',source_sha256:SHA,as_of:'2026-11-05',...over});
  await prof({});
  await prof({market:'CN',category_raw_current:null,regime:'cn',fiscal_year_end:'1231',week52_pattern:false,source:'tushare_stock_basic',source_sha256:null});
  expect((await fails(prof({}))).message).toMatch(/issuer_filing_profiles_pkey/);
  const other=await issuer();
  expect((await fails(prof({issuer_id:other,fiscal_year_end:'1332'}))).message).toMatch(/issuer_filing_profiles_fiscal_year_end_check/);
  expect((await fails(prof({issuer_id:other,fiscal_year_end:'927'}))).message).toMatch(/issuer_filing_profiles_fiscal_year_end_check/);
  expect((await fails(prof({issuer_id:other,regime:'8-K'}))).message).toMatch(/issuer_filing_profiles_regime_check/);
  expect((await fails(prof({issuer_id:other,market:'HK'}))).message).toMatch(/issuer_filing_profiles_market_check/);
  expect((await fails(prof({issuer_id:other,source_sha256:'zz'}))).message).toMatch(/issuer_filing_profiles_source_sha256_check/);
  await prof({issuer_id:other,fiscal_year_end:null});                                              // unknown fiscal year end stays missing
 });

 it('dq_freshness accepts the weekly cadence and still rejects unknown ones',async()=>{
  const d='reconcile.test-'+randomUUID().slice(0,8);
  await q(`insert into public.dq_freshness(dataset,expected_cadence,status) values($1,'weekly','missing')`,[d]);
  expect((await fails(q(`insert into public.dq_freshness(dataset,expected_cadence,status) values($1,'hourly','missing')`,[d+'x']))).message).toMatch(/dq_freshness_expected_cadence_check/);
 });
});
.
..
agents
launch.json
scratch

exec
/bin/zsh -lc "rg -n 'valid_to\\s*=|update.*issuer_securities' supabase/migrations src scripts | head -90; cat src/lib/entities/merge.ts; cat src/lib/entities/securities.ts; rg -n 'project_doc|fallback' /Users/osborn/.codex/config.toml; sed -n '1,100p' scripts/ci/research-checks.ts; rg -n 'replayMigration|readFileSync.*migration' src/lib/entities/issuers.integration.test.ts" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
src/lib/entities/issuers.integration.test.ts:187:  await expect(admin.query(`update public.issuer_securities set valid_to=null where issuer_id=$1 and ticker=$2`,[a,t])).rejects.toThrow(/issuer_not_active/);
src/lib/entities/issuers.integration.test.ts:209:  await admin.query(`update public.issuer_securities set valid_to='2024-01-01',valid_to_method='unrecorded' where issuer_id=$1 and ticker=$2`,[a,t]);
src/lib/entities/identifiers.integration.test.ts:206:   await db.query(`update public.issuer_securities set valid_from_method='listing_date',provenance=provenance||'{"valid_from":{"source":"stocks_universe.list_date","as_of":"2026-11-05"}}'::jsonb where ticker='ZZUPA'`);
src/lib/entities/identifiers.integration.test.ts:207:   await db.query(`update public.issuer_securities set valid_to_method='delisting' where ticker='ZZUPC'`);
src/lib/entities/identifiers.integration.test.ts:232:  expect((await fails(q(`update public.issuer_securities set valid_to=null where issuer_id=$1 and ticker=$2`,[a,t]))).message).toMatch(/issuer_securities_to_method_iff_to/);
src/lib/entities/securities.ts:13:/** Half-open overlap with null valid_to = +∞. Dates are ISO 'YYYY-MM-DD', so text order is date order. */
src/lib/entities/securities.ts:16: return (w.valid_to===null||from<w.valid_to)&&(to===null||w.valid_from<to);
src/lib/entities/securities.ts:54:   valid_to_method:sec.valid_to===null?null:(sec.source==='curated'?'curated':'unrecorded'),
supabase/migrations/20261105091000_issuers.sql:121:create trigger issuer_securities_owner_active before insert or update on public.issuer_securities
supabase/migrations/20261107090000_identifiers_and_dq.sql:25:    update public.issuer_securities set valid_from_method = 'curated' where source = 'curated';
supabase/migrations/20261107090000_identifiers_and_dq.sql:26:    update public.issuer_securities set valid_to_method = case source when 'curated' then 'curated' else 'unrecorded' end where valid_to is not null;
src/lib/research/wiki/source-pack.ts:62:  const current = row.securities.filter(s => s.valid_to == null);
src/lib/research/entity-keys/store.test.ts:55:  const sec=structuredClone(rows);sec[0].securities[0].valid_to='2027-01-01';
src/lib/research/playbook-registration.ts:80:    .filter((s) => s.entity_id === entity.id && s.is_primary && s.valid_to === null)
src/lib/facts/scope.test.ts:75:  await tables.update('issuer_securities',{issuer_id:A,ticker:'AAPL'},{valid_to:'2030-12-31'});   // ends in the future: AAPL is still owned today
src/lib/facts/scope.test.ts:79:  await tables.update('issuer_securities',{issuer_id:A,ticker:'AAPL'},{valid_to:TODAY});          // valid_to > today fails: no owner today
// Hard identifiers (LEI, CIK, USCI) decide automatic merges; anything softer becomes a claim.
import type {HardIdType,IssuerIdentifiers} from './types';

export const HARD_IDS:readonly HardIdType[]=['lei','cik','usci'];
// 'inactive_issuer' is never produced by matchIssuer (pure, status-blind); issuers.ts raises it when a
// hit is dissolved or merged into a non-active issuer (or 'identifiers_split' when an active issuer
// was hit as well), and when a guarded enrichment finds the issuer no longer active.
export type ConflictReason='identifiers_split'|'hard_id_mismatch'|'inactive_issuer';
export type MatchResult={kind:'same';issuer_id:string}|{kind:'new'}|{kind:'conflict';issuer_ids:string[];reason:ConflictReason};

export function matchIssuer(candidates:(IssuerIdentifiers&{issuer_id:string})[],incoming:IssuerIdentifiers):MatchResult{
 const present=HARD_IDS.filter(k=>incoming[k]);
 if(present.length===0)throw new Error('no_hard_identifier');
 const hits=new Set<string>();
 for(const c of candidates)for(const k of present)if(c[k]&&c[k]===incoming[k])hits.add(c.issuer_id);
 if(hits.size===0)return {kind:'new'};
 if(hits.size>1)return {kind:'conflict',issuer_ids:[...hits].sort(),reason:'identifiers_split'};
 const [id]=hits;const hit=candidates.find(c=>c.issuer_id===id)!;
 for(const k of present)if(hit[k]&&hit[k]!==incoming[k])return {kind:'conflict',issuer_ids:[id],reason:'hard_id_mismatch'};
 return {kind:'same',issuer_id:id};
}
// Ticker ownership over time. The DB enforces one open owner per ticker and no overlapping
// half-open [valid_from, valid_to) windows; this module classifies an incoming window against the
// rows it overlaps and turns those violations into 'duplicate' / 'conflict' outcomes.
import type {Row,TableClient} from '../db/table-client';
import {fileClaim,isUnique} from './claims';
import {isBlank,normalizeIsin,normalizeTicker} from './normalize';
import type {IssuerSecurityInput} from './types';

export type AttachResult='inserted'|'duplicate'|'conflict';

type Window={valid_from:string;valid_to:string|null};
const str=(v:unknown)=>v==null?null:String(v);
/** Half-open overlap with null valid_to = +∞. Dates are ISO 'YYYY-MM-DD', so text order is date order. */
const overlaps=(r:Row,w:Window)=>{
 const from=String(r.valid_from),to=str(r.valid_to);
 return (w.valid_to===null||from<w.valid_to)&&(to===null||w.valid_from<to);
};

export async function attachSecurity(client:TableClient,raw:IssuerSecurityInput):Promise<AttachResult>{
 const sec={...raw,ticker:normalizeTicker(raw.ticker),isin:normalizeIsin(raw.isin),valid_to:isBlank(raw.valid_to)?null:String(raw.valid_to)};
 // The claims check has no 'ticker' id_type, so only an ISIN can be recorded as a claim;
 // otherwise the return value carries the conflict.
 const conflict=async():Promise<AttachResult>=>{
  if(sec.isin)await fileClaim(client,{issuer_id:sec.issuer_id,id_type:'isin',value:sec.isin,source:sec.source});
  return 'conflict';
 };
 /** null when nothing on this ticker overlaps the incoming window (safe to insert). */
 const classify=async():Promise<AttachResult|null>=>{
  // A ticker has a handful of ownership rows at most; overlap is computed here, not in SQL.
  const rows=await client.select('issuer_securities',{ticker:sec.ticker},{orderBy:'valid_from'});
  const same=rows.find(r=>r.issuer_id===sec.issuer_id&&String(r.valid_from)===sec.valid_from);
  if(same){
   // Same primary key: a replay is a duplicate only if the window end and (when given) ISIN agree.
   // An absent incoming ISIN carries no information and never contradicts a stored one.
   const isinDiffers=sec.isin!==null&&same.isin!==sec.isin;
   if(str(same.valid_to)===sec.valid_to&&!isinDiffers)return 'duplicate';
   if(isinDiffers)await fileClaim(client,{issuer_id:sec.issuer_id,id_type:'isin',value:sec.isin!,source:sec.source});
   return 'conflict';
  }
  const hit=rows.filter(r=>overlaps(r,sec));
  if(!hit.length)return null;
  // Same issuer under a different valid_from: a duplicate unless the incoming ISIN contradicts
  // an overlapping row's ISIN (an absent incoming ISIN never contradicts).
  if(hit.every(r=>r.issuer_id===sec.issuer_id))return sec.isin!==null&&hit.some(r=>r.isin!==sec.isin)?conflict():'duplicate';
  return conflict();
 };
 const before=await classify();
 if(before)return before;
 try{
  await client.insert('issuer_securities',{
   issuer_id:sec.issuer_id,ticker:sec.ticker,isin:sec.isin,figi:sec.figi??null,share_class:sec.share_class,
   is_primary:sec.is_primary??false,valid_from:sec.valid_from,valid_to:sec.valid_to,
   // interim (plan 3 Task 1a): same rule as the migration backfill; Task 2b makes callers name the method
   valid_to_method:sec.valid_to===null?null:(sec.source==='curated'?'curated':'unrecorded'),
   source:sec.source,provenance:sec.provenance??{},
  });
  return 'inserted';
 }catch(e){
  const code=(e as {code?:unknown})?.code;
  if(code==='23514'&&e instanceof Error&&e.message.includes('issuer_not_active:'))throw new Error('issuer_not_active');
  if(!isUnique(e))throw e;
  // The ISIN index (isin, valid_from) and the ISIN no-overlap exclusion span tickers: another
  // ticker already carries this ISIN over an overlapping window. A ticker-only re-read cannot see it.
  if(e instanceof Error&&(e.message.includes('issuer_securities_isin_idx')||(code==='23P01'&&e.message.includes('issuer_securities_isin_no_overlap'))))return conflict();
  // A concurrent writer took the window (PK, open-owner index or no-overlap exclusion): re-read once.
  const after=await classify();
  if(after)return after;
  // A unique violation that no current row explains is an exact replay that raced us.
  if(code==='23505')return 'duplicate';
  throw e;
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
].map(p => `src/lib/research/${p}`).concat('src/lib/observability/quote-snapshot.integration.test.ts', 'src/lib/analyst/recommendations-append-only.integration.test.ts', 'src/lib/dq/dq-foundation.integration.test.ts', 'src/lib/entities/issuers.integration.test.ts', 'src/lib/entities/issuers-write.integration.test.ts', 'src/lib/facts/facts.integration.test.ts', 'src/lib/facts/sync-us.integration.test.ts', 'src/lib/entities/identifiers.integration.test.ts');

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
19:async function replayMigration(pool:Pool,sql:string,attempts=10):Promise<void>{
89:  await expect(replayMigration(admin,readFileSync(MIGRATION,'utf8'))).resolves.toBeUndefined();

exec
/bin/zsh -lc "sed -n '85,125p' supabase/migrations/20261105091000_issuers.sql; sed -n '1,115p' src/lib/dq/dq-foundation.integration.test.ts; rg -n 'expected_cadence|create.*dq_recon' supabase/migrations/20261105090000*; cat package.json | head -65; rg -n 'curated|valid_from_method' docs/specs/*data-foundation-3* | head -20" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
);
-- (ticker, valid_from) UNIQUE already serves ticker lookups; no standalone ticker index.
create unique index if not exists issuer_securities_open_owner_idx on public.issuer_securities(ticker) where valid_to is null;
create unique index if not exists issuer_securities_isin_idx on public.issuer_securities(isin, valid_from) where isin is not null;
-- Added after open_owner_idx on purpose: index checks run in creation order, so an open/open clash
-- reports the clearer issuer_securities_open_owner_idx name; every other overlap reports this one.
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.issuer_securities'::regclass and conname = 'issuer_securities_no_overlap') then
    alter table public.issuer_securities add constraint issuer_securities_no_overlap
      exclude using gist (ticker with =, daterange(valid_from, valid_to, '[)') with &&);
  end if;
end $$;
-- An ISIN belongs to at most one security row at any date: no two rows (any issuer, any ticker)
-- may carry the same ISIN over overlapping windows, so an ISIN resolves to a single owner.
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.issuer_securities'::regclass and conname = 'issuer_securities_isin_no_overlap') then
    alter table public.issuer_securities add constraint issuer_securities_isin_no_overlap
      exclude using gist (isin with =, daterange(valid_from, valid_to, '[)') with &&) where (isin is not null);
  end if;
end $$;

-- Only an active issuer may hold an open security row; closed historical rows are always allowed.
create or replace function public.issuer_securities_owner_active() returns trigger
language plpgsql set search_path = '' as $$
declare owner_status text;
begin
  if new.valid_to is null then
    select i.status into owner_status from public.issuers i where i.issuer_id = new.issuer_id for share;
    if owner_status is distinct from 'active' then
      raise exception 'issuer_not_active: issuer % (status %) cannot hold open security %', new.issuer_id, coalesce(owner_status, 'missing'), new.ticker
        using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists issuer_securities_owner_active on public.issuer_securities;
create trigger issuer_securities_owner_active before insert or update on public.issuer_securities
  for each row execute function public.issuer_securities_owner_active();

-- The reverse direction: an issuer may not be retired while it still holds an open security row.
create or replace function public.issuers_retire_requires_closed_securities() returns trigger
// src/lib/dq/dq-foundation.integration.test.ts
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';

const enabled=!!process.env.S4_TEST_STATE;
const MIGRATION='supabase/migrations/20261105090000_dq_foundation.sql';
const TABLES=['ingest_batches','dq_quarantine','dq_reconciliations','dq_freshness'];
const ds=()=>'dq-'+randomUUID().slice(0,8);

// Replays a migration in one transaction with a short lock_timeout, retrying lock timeouts
// (55P03) and deadlocks (40P01). Same policy as issuers.integration.test.ts: the DB suites
// run concurrently and the issuers migration alters research_entity_* tables that other suites use,
// so replays must not queue behind (and block) foreign locks.
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

describe.skipIf(!enabled)('WP-F0 dq foundation on real PostgreSQL',()=>{
 let admin:Pool;
 const batches:string[]=[];
 const datasets:string[]=[];
 const newDs=()=>{const d=ds();datasets.push(d);return d;};
 const insertBatch=async(dataset:string)=>{
  const id=randomUUID();batches.push(id);
  await admin.query(`insert into public.ingest_batches(batch_id,producer,dataset) values($1,'test',$2)`,[id,dataset]);
  return id;
 };
 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  admin=new Pool({connectionString:state.adminUrl});
 });
 afterAll(async()=>{
  if(admin){
   await admin.query(`delete from public.dq_quarantine where dataset=any($1) or batch_id=any($2::uuid[])`,[datasets,batches]);
   await admin.query(`delete from public.dq_reconciliations where dataset=any($1) or batch_id=any($2::uuid[])`,[datasets,batches]);
   await admin.query(`delete from public.ingest_batches where batch_id=any($1::uuid[]) or dataset=any($2)`,[batches,datasets]);
   await admin.query(`delete from public.dq_freshness where dataset=any($1)`,[datasets]);
   await admin.end();
  }
 });

 it('creates the four tables with RLS enabled and no policies, and replays without error',async()=>{
  const rows=(await admin.query(`select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1)`,[TABLES])).rows;
  expect(rows.map((r:{relname:string})=>r.relname).sort()).toEqual([...TABLES].sort());
  for(const r of rows) expect(r.relrowsecurity).toBe(true);
  const policies=(await admin.query(`select count(*)::int n from pg_policies where schemaname='public' and tablename=any($1)`,[TABLES])).rows[0].n;
  expect(policies).toBe(0);
  await expect(replayMigration(admin,readFileSync(MIGRATION,'utf8'))).resolves.toBeUndefined();
 },60000);

 it('enforces named check, foreign-key and invariant constraints on all four tables',async()=>{
  const d=newDs();
  const batch=await insertBatch(d);
  const ins=(cols:string,vals:string,params:unknown[])=>admin.query(`insert into public.ingest_batches(batch_id,producer,dataset,${cols}) values($1,'test',$2,${vals})`,[randomUUID(),d,...params]);
  await expect(ins('status,finished_at',`'bogus',now()`,[])).rejects.toThrow(/ingest_batches_status_check/);
  await expect(ins('triggered_by',`'robot'`,[])).rejects.toThrow(/ingest_batches_triggered_by_check/);
  await expect(ins('status,started_at,finished_at',`'success',$3,$4`,['2026-01-02T00:00:00Z','2026-01-01T00:00:00Z'])).rejects.toThrow(/ingest_batches_finished_after_started/);
  await expect(ins('status',`'success'`,[])).rejects.toThrow(/ingest_batches_running_iff_unfinished/);
  await expect(ins('counts',`'[]'::jsonb`,[])).rejects.toThrow(/ingest_batches_counts_object/);

  const q=(extraCols:string,extraVals:string,batchId:string,params:unknown[]=[])=>admin.query(`insert into public.dq_quarantine(id,dataset,table_name,natural_key,reason_code,batch_id${extraCols}) values($1,$2,'t','k','range',$3${extraVals})`,[randomUUID(),d,batchId,...params]);
  // The FK case runs before the valid open insert: an open row with the same key would make the
  // open-key unique index fire first and mask the FK violation.
  await expect(q('','',randomUUID())).rejects.toThrow(/dq_quarantine_batch_id_fkey/);
  await q('','',batch);
  await expect(q(',status,resolved_by,resolved_at',`,'done',$4,now()`,batch,[randomUUID()])).rejects.toThrow(/dq_quarantine_status_check/);
  await expect(q(',status,resolved_by',`,'resolved_accept',$4`,batch,[randomUUID()])).rejects.toThrow(/dq_quarantine_open_iff_unresolved/);

  await admin.query(`insert into public.dq_freshness(dataset,expected_cadence,status) values($1,'daily','missing')`,[d]);
  const f2=newDs();
  await expect(admin.query(`insert into public.dq_freshness(dataset,expected_cadence,status) values($1,'hourly','missing')`,[f2])).rejects.toThrow(/dq_freshness_expected_cadence_check/);
  await expect(admin.query(`insert into public.dq_freshness(dataset,expected_cadence,status,consecutive_errors) values($1,'daily','error',-1)`,[f2])).rejects.toThrow(/dq_freshness_consecutive_errors_check/);
  await expect(admin.query(`insert into public.dq_freshness(dataset,expected_cadence,status) values($1,'daily','fresh')`,[f2])).rejects.toThrow(/dq_freshness_ok_requires_last_ok/);
 });

 it('allows one open item per (dataset, table_name, natural_key, reason_code); resolved rows may repeat',async()=>{
  const d=newDs();
  const batch=await insertBatch(d);
  const open=()=>admin.query(`insert into public.dq_quarantine(id,dataset,table_name,natural_key,reason_code,batch_id) values($1,$2,'t','k','range',$3)`,[randomUUID(),d,batch]);
  await open();
  await expect(open()).rejects.toThrow(/dq_quarantine_open_key_uniq/);
  // Same key on another reason or table is a different item.
  await admin.query(`insert into public.dq_quarantine(id,dataset,table_name,natural_key,reason_code,batch_id) values($1,$2,'t','k','jump',$3)`,[randomUUID(),d,batch]);
  // A resolved row with the same key coexists with the open one and with a new open row once the first is resolved.
  await admin.query(`insert into public.dq_quarantine(id,dataset,table_name,natural_key,reason_code,batch_id,status,resolved_by,resolved_at) values($1,$2,'t','k','range',$3,'resolved_reject',$4,now())`,[randomUUID(),d,batch,randomUUID()]);
  await admin.query(`update public.dq_quarantine set status='resolved_accept',resolved_by=$2,resolved_at=now() where dataset=$1 and natural_key='k' and reason_code='range' and status='open'`,[d,randomUUID()]);
  await open();
  const n=(await admin.query(`select status,count(*)::int n from public.dq_quarantine where dataset=$1 and reason_code='range' group by status order by status`,[d])).rows;
  expect(n).toEqual([{status:'open',n:1},{status:'resolved_accept',n:1},{status:'resolved_reject',n:1}]);
 });

 it('restricts batch deletion while quarantine evidence exists and nulls reconciliation batch_id on delete',async()=>{
  const d=newDs();
  const quarantined=await insertBatch(d);
  await admin.query(`insert into public.dq_quarantine(id,dataset,table_name,natural_key,reason_code,batch_id) values($1,$2,'t','k','range',$3)`,[randomUUID(),d,quarantined]);
  await expect(admin.query(`delete from public.ingest_batches where batch_id=$1`,[quarantined])).rejects.toThrow(/dq_quarantine_batch_id_fkey/);

  const reconciled=await insertBatch(d);
  const recId=randomUUID();
  await admin.query(`insert into public.dq_reconciliations(id,dataset,left_source,right_source,natural_key,left_value,right_value,tolerance,passed,batch_id) values($1,$2,'a','b','k',1,1,0,true,$3)`,[recId,d,reconciled]);
  await admin.query(`delete from public.ingest_batches where batch_id=$1`,[reconciled]);
55:create table if not exists public.dq_reconciliations (
70:create index if not exists dq_reconciliations_failed_idx on public.dq_reconciliations(dataset, created_at desc) where passed = false;
71:create index if not exists dq_reconciliations_batch_idx on public.dq_reconciliations(batch_id);
76:  expected_cadence   text not null check (expected_cadence in ('daily','monthly','quarterly','event')),
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
zsh:1: no matches found: docs/specs/*data-foundation-3*

exec
/bin/zsh -lc "./node_modules/.bin/tsc --noEmit --incremental false 2>&1 | head -60; find docs -iname '*foundation-3*'; sed -n '160,190p' src/lib/entities/link-research.ts; git status --short" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 5923ms:
docs/audits/2026-11-05-data-foundation-3
docs/audits/2026-11-04-data-foundation-3
docs/audits/2026-11-05-data-foundation-3-plan
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md
 for(const sec of plan.securities){
  const {entity_key,security_id,user_id:_u,entity_id:_e,...rest}=sec;
  const key=`${entity_key}:${security_id}`;
  const issuer_id=issuerByEntity.get(entity_key);
  if(!issuer_id){counts.failed++;errors.push({code:'blocked_by_issuer',key,message:sec.ticker});continue;}
  let res;
  try{res=await attachSecurity(client,{...rest,issuer_id});}
  catch(e){
   counts.failed++;
   const msg=errorMessage(e);
   errors.push({code:msg==='issuer_not_active'?'issuer_not_active':'security_error',key,message:msg});
   continue;
  }
  if(res==='conflict'){
   const payload={ticker:sec.ticker,isin:sec.isin,share_class:sec.share_class,is_primary:sec.is_primary,valid_from:sec.valid_from,valid_to:sec.valid_to,entity_key:key};
   await parkConflict(client,{dataset:RESEARCH_LINK_DATASET,table:'issuer_securities',naturalKey:`${sec.ticker}:${sec.valid_from}`,reasonCode:'ownership_conflict',detail:{reason:'ticker_owned_by_other_issuer',entity_key:key},payload,batchId:opts.batchId},counts,errors,{code:'ownership_conflict',key,message:sec.ticker});
   continue;
  }
  if(res==='inserted')counts.inserted++;else counts.duplicates++;
  try{
   const n=await client.update('research_entity_securities',{user_id,id:security_id},{ticker:sec.ticker});
   if(n!==1){counts.failed++;errors.push({code:'link_failed',key,message:`expected 1 row, updated ${n}`});}
  }catch(e){counts.failed++;errors.push({code:'link_failed',key,message:errorMessage(e)});}
 }
 return finish();
}
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-a2kRsDwd' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-CiAq0uUP' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/

codex
New curated security rows receive incorrect start-date evidence metadata. Type checking passed, but database integration tests were not run.

Review comment:

- [P2] Set the start-window method for new curated securities — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/entities/securities.ts:52-55
  When `attachSecurity` receives `source: 'curated'` (as the research-link importer supplies), it sets only `valid_to_method`, leaving `valid_from_method` at the database default of `first_observed`. This mislabels manually curated start dates and makes newly imported rows inconsistent with identical existing rows, which the migration backfills as `curated`. Set `valid_from_method` using the same source-based rule as the backfill; replaying the migration will not repair these subsequently inserted rows.
New curated security rows receive incorrect start-date evidence metadata. Type checking passed, but database integration tests were not run.

Review comment:

- [P2] Set the start-window method for new curated securities — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/entities/securities.ts:52-55
  When `attachSecurity` receives `source: 'curated'` (as the research-link importer supplies), it sets only `valid_to_method`, leaving `valid_from_method` at the database default of `first_observed`. This mislabels manually curated start dates and makes newly imported rows inconsistent with identical existing rows, which the migration backfills as `curated`. Set `valid_from_method` using the same source-based rule as the backfill; replaying the migration will not repair these subsequently inserted rows.

OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b064-078c-7fd2-9300-837fe1c043e3
--------
user
commit ef8430a
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline ef8430a; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 440ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-7uPzoq7c' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-sAFOh7MS' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/8b-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/8b-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/8b-review-fix2.md
?? docs/audits/2026-11-05-data-foundation-3/codex/8b-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-Qzmk3iOn' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-q6O4f28v' (errno=Operation not permitted)
ef8430a fix(facts): 8b quality review — adopt_candidate revalidates target and scope rows, date comparisons, target_not_active
 src/lib/dq/dq-extensions.integration.test.ts       | 22 ++++++++++++++++++++++
 .../migrations/20261107091000_facts_extensions.sql | 17 ++++++++++++-----
 2 files changed, 34 insertions(+), 5 deletions(-)

exec
/bin/zsh -lc "sed -n '470,730p' supabase/migrations/20261107091000_facts_extensions.sql; rg -n 'create.*set_merge|scope_missing|available_date' supabase/migrations/20261107091000_facts_extensions.sql | head -35; find . -name '*AGENTS*' -not -path './node_modules/*' -not -path './.git/*'; ls .codex 2>/dev/null" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 43ms:
-- filing's scope lock: state_rev = p_expected_rev (stale_evaluation); the full plan-2 candidate key
-- (K + filing + generation) in any status → duplicate (an old generation alone is no duplicate);
-- a visible ok row of (K, available_date) with another value OR an open same_day_conflict /
-- lineage_conflict on it → conflict_exists. Then one transaction: a management run (published, no
-- manifest, activates nothing), the fact staged → ok, the item resolved with
-- chosen_candidate_index / adopted_fact_id / run_id / issuer_id / market / batch_id and
-- hook = pending, state_rev + 1.
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
  return jsonb_build_object('fact_id', v_fact, 'run_id', v_run, 'issuer_id', g.issuer_id, 'market', g.market);
end $$;
revoke execute on function public.adopt_candidate(uuid, int, uuid, bigint, uuid) from public, anon, authenticated;
grant execute on function public.adopt_candidate(uuid, int, uuid, bigint, uuid) to service_role;

-- ---------------------------------------------------------------- 9. restore after a passing re-run (spec §3.2 restore_reconciled, §5.6, R1)
-- Open reconcile_mismatch only; p_batch running. Scope lock (issuer of the first member row by
-- fact_id, else detail.issuer_id/market), item re-read under it. latest_result.passed must be
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
  set status = 'resolved_accept', resolved_by = p_resolved_by, resolved_at = now(),
      detail = detail || jsonb_build_object('chosen_fact_ids', jsonb_build_array(p_keep), 'quarantined_fact_ids', to_jsonb(v_q), 'issuer_id', v_t,
                                            'market', v_market, 'batch_id', p_batch, 'hook', jsonb_build_object('stage', 'materialize', 'state', 'pending', 'at', to_jsonb(now())))
  where id = p_item;
  update public.fact_sync_scope set state_rev = state_rev + 1, updated_at = now() where issuer_id = any(v_lineage) and market = v_market;
  return jsonb_build_object('quarantined', cardinality(v_q));
end $$;
revoke execute on function public.resolve_lineage_conflict(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.resolve_lineage_conflict(uuid, uuid, uuid, uuid) to service_role;

-- ---------------------------------------------------------------- 11. generic resolver guard (Codex 8b P1)
-- The plan-2 body verbatim plus one guard: reconcile_mismatch and lineage_conflict items never close here.
create or replace function public.resolve_facts_quarantine(p_item uuid, p_chosen uuid[], p_resolved_by uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare q public.dq_quarantine; v_ids uuid[]; v_issuer uuid; v_market text; v_chosen uuid[]; v_promoted int := 0; v_run uuid;
begin
  if p_resolved_by is null then raise exception 'invalid_resolver' using errcode = '22023'; end if;
  select * into q from public.dq_quarantine where id = p_item;
  if not found or q.status <> 'open' or q.table_name <> 'financial_facts' then raise exception 'item_not_open' using errcode = 'P0001'; end if;
  -- migration two: these two reasons close only through restore_reconciled / resolve_lineage_conflict
13:--     the same (K, available_date) from different issuers with different values leave the current
104:-- scope row is locked in (issuer_id, market) order (a missing one → scope_missing); under the
131:  if v_locked <> cardinality(v_members) then raise exception 'scope_missing' using errcode = 'P0001'; end if;
156:-- scope row is scope_missing (the lineage function must lock the row).
164:    raise exception 'scope_missing' using errcode = 'P0001';
191:-- with more than one member and only over ok rows: a (K, available_date) whose ok rows come from
202:         f.period_start, f.period_end, f.duration, f.value, f.value_text, f.unit, f.consolidation, f.available_date,
208:    and f.available_date <= p_as_of
213:  select b.concept, b.period_start, b.period_end, b.consolidation, b.unit, b.available_date,
217:  group by b.concept, b.period_start, b.period_end, b.consolidation, b.unit, b.available_date
224:      and c.consolidation = b.consolidation and c.unit = b.unit and c.available_date = b.available_date)
232:  window w as (partition by b.concept, b.period_start, b.period_end, b.consolidation, b.unit order by b.available_date, b.created_at, b.fact_id)
243:  select * from picked order by key_rank, available_date, created_at, fact_id limit 10001
252:                   'available_date', c.available_date, 'fact_ids', c.fact_ids)
253:                 order by c.available_date, c.concept collate "C", c.period_end, c.period_start nulls first, c.consolidation collate "C", c.unit collate "C"), '[]'::jsonb) from clash c),
257:               else coalesce((select jsonb_agg((to_jsonb(c) - 'key_rank' - 'value') || jsonb_build_object('value', c.value_text) order by c.key_rank, c.available_date, c.created_at, c.fact_id) from capped c), '[]'::jsonb) end)
305:create or replace function public.fact_set_merge_body(p_source uuid, p_target uuid, p_resolved_by uuid)
349:create or replace function public.set_merge(p_source uuid, p_target uuid, p_resolved_by uuid)
439:        and (q.payload -> 'key' ->> 'available_date')::date = f.available_date)
465:-- issuer, market and available_date (the payload is not trusted). The generation is the anchor
472:-- a visible ok row of (K, available_date) with another value OR an open same_day_conflict /
545:  if v_locked <> cardinality(v_lineage) then raise exception 'scope_missing' using errcode = 'P0001'; end if;
553:  if not found then raise exception 'scope_missing' using errcode = 'P0001'; end if;
566:               and f.available_date = g.available_date and f.value <> v_value)
574:                  and (d.payload -> 'key' ->> 'available_date') ~ '^\d{4}-\d{2}-\d{2}$' and (d.payload -> 'key' ->> 'available_date')::date = g.available_date)
577:                  and d.natural_key = v_t::text || ':' || v_k || ':' || to_char(g.available_date, 'YYYY-MM-DD')) then
582:  insert into public.financial_facts (fact_id, issuer_id, market, filing_id, run_id, concept, source_concept, statement, period_start, period_end, duration, value, unit, consolidation, available_date, mapping_gen, mapping_version, raw_hash)
584:          c ->> 'unit', c ->> 'consolidation', g.available_date, v_gen, v_versions[1], c ->> 'rawHash');
651:-- natural_key = <T>:<concept>:<period_start>:<period_end>:<consolidation>:<unit>:<available_date>.
653:-- (issuer_id, market) order (missing → scope_missing), the lineage re-read under the locks
684:  if v_locked <> cardinality(v_lineage) then raise exception 'scope_missing' using errcode = 'P0001'; end if;
701:      and f.consolidation = v_cons and f.unit = v_unit and f.available_date = v_date
708:    and f.consolidation = v_cons and f.unit = v_unit and f.available_date = v_date;

exec
/bin/zsh -lc "sed -n '295,390p' supabase/migrations/20261107091000_facts_extensions.sql; sed -n '1,95p' src/lib/dq/dq-extensions.integration.test.ts; rg -n 'same_day_conflict|available_date' src/lib/facts | head -45; git log -3 --oneline; find /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude -maxdepth 2 -name 'AGENTS*'; cat package.json | grep -A15 scripts" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
-- is active and the source holds no open security (errors pass through); every affected scope
-- state_rev + 1; the target joins the next facts.lineage_same_day cycle — entry {issuer_id:T, market,
-- source:S} appended under the cycle lock open_reconcile_cycle also takes (plan audit Q2), so a cycle
-- creation never overwrites or half-consumes it; audit row.
-- Lock order (plan audit R1): the cycle advisory lock is taken FIRST, before the scope rows
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
src/lib/facts/sync.ts:142:/** missing_available_date natural key (spec §7.1 `<issuer>:<ts_code>:<end_date>:<report_type>`; EDGAR rows carry accn/tag in those slots). */
src/lib/facts/sync.ts:215:  // lack an available date must still leave its missing_available_date evidence behind even though
src/lib/facts/sync.ts:232:   await park('missing_available_date',naturalKey,{row:rows[0],rows});out.counts.quarantined+=rows.length;
src/lib/facts/sync.ts:243:  const filingCandidates=parsed.filings.map(f=>({...f,availableDate:staged.filingRows.get(staged.filingIds.get(f.sourceRef)??'')!.available_date}));
src/lib/facts/sync.ts:254:   const itemId=await park('same_day_conflict',c.naturalKey,{key:c.key,fact_ids:[...c.newFactIds,...c.existingOkFactIds],values:c.values});
src/lib/facts/rules.ts:129:   // resolve each fact key to its CURRENT disclosure (read.ts order: available_date, stored before new on ties, fact_id; last wins),
src/lib/facts/rules.ts:131:   const rank=(r:AnyFactRow)=>`${r.available_date}|${newSet.has(r)?1:0}|${r.fact_id}`;
src/lib/facts/deps.ts:54:  return linkCninfoFiling({form_type:filing.form_type,fiscal_year:filing.fiscal_year,period_end:filing.period_end,available_date:filing.available_date,corrected:filing.source_ref.split(':')[2]==='1'&&corrected.has(key)},issuer,{budget:b,fetch:opts.fetch,userAgent:opts.userAgent,minIntervalMs:opts.minIntervalMs});
src/lib/facts/facts.integration.test.ts:73:type FactSpec={filing_id:string;fact_id?:string;concept?:string;period_start?:string|null;period_end?:string;duration?:string;value?:string;unit?:string;available_date?:string};
src/lib/facts/facts.integration.test.ts:87:  const m=await one(`select public.stage_filings($1,$2::jsonb) v`,[run,JSON.stringify([{filing_id:id,source:'edgar',origin:'sec',form_type:'10-K',fiscal_year:2023,fiscal_period:'FY',period_end:'2023-12-31',available_date:available,source_ref:sourceRef,url:null}])]);
src/lib/facts/facts.integration.test.ts:90: const factRow=(f:FactSpec)=>({fact_id:f.fact_id??randomUUID(),filing_id:f.filing_id,concept:f.concept??'revenue',source_concept:'Revenues',statement:f.concept==='total_assets'?'BS':'IS',period_start:f.period_start===undefined?'2023-10-01':f.period_start,period_end:f.period_end??'2023-12-31',duration:f.duration??'3M',value:f.value??'100',unit:f.unit??'USD',consolidation:'consolidated',available_date:f.available_date??'2024-02-01',mapping_version:'facts-map/1',raw_hash:'h'});
src/lib/facts/facts.integration.test.ts:104:  await q(`insert into public.dq_quarantine(id,dataset,table_name,natural_key,reason_code,batch_id,payload) values($1,'facts.us','financial_facts',$2,'same_day_conflict',$3,$4::jsonb)`,
src/lib/facts/facts.integration.test.ts:105:   [id,`${iss}:US:revenue:2023-10-01:2023-12-31:consolidated:USD:${date}`,b,JSON.stringify({key:{issuer_id:iss,market:'US',concept:'revenue',period_start:'2023-10-01',period_end:'2023-12-31',consolidation:'consolidated',unit:'USD',available_date:date},fact_ids:factIds,values:[],run_id:run})]);
src/lib/facts/facts.integration.test.ts:113:  const {ids:[r0]}=await stage(run,[{filing_id:f0,value:'90',available_date:'2024-01-01'}]);
src/lib/facts/facts.integration.test.ts:155:  await q(`insert into public.filings(filing_id,issuer_id,market,source,origin,form_type,available_date,source_ref,run_id) values($1,$2,'US','edgar','sec','10-K','2024-02-01',$3,$4)`,[f,iss,randomUUID(),run]);
src/lib/facts/facts.integration.test.ts:157:   const r:Record<string,unknown>={fact_id:randomUUID(),issuer_id:iss,market:'US',filing_id:f,run_id:run,concept:'total_assets',source_concept:'Assets',statement:'BS',period_start:null,period_end:'2023-12-31',duration:'INSTANT',value:'1',unit:'USD',available_date:'2024-02-01',mapping_gen:1,mapping_version:'facts-map/1',raw_hash:'h',...cols};
src/lib/facts/facts.integration.test.ts:163:  await expect(ins({available_date:'2024-02-02',period_end:'2023-11-30'})).rejects.toThrow(/financial_facts_filing_date_fkey/);
src/lib/facts/facts.integration.test.ts:175:  await q(`insert into public.filings(filing_id,issuer_id,market,source,origin,form_type,available_date,source_ref,run_id) values($1,$2,'US','edgar','sec','10-K','2024-02-01',$3,$4),($5,$2,'US','edgar','sec','10-Q','2024-02-01',$6,$4)`,[f,iss,randomUUID(),run,g,randomUUID()]);
src/lib/facts/facts.integration.test.ts:177:  const base=`insert into public.financial_facts(fact_id,issuer_id,market,filing_id,run_id,concept,source_concept,statement,period_start,period_end,duration,value,unit,available_date,mapping_gen,mapping_version,raw_hash,status) values($1,$2,'US',$3,$4,'revenue','Revenues','IS','2023-10-01','2023-12-31','3M',100,'USD','2024-02-01',1,'facts-map/1','h',$5)`;
src/lib/facts/facts.integration.test.ts:386:  const metric=(v:string,name='gross_margin')=>({metric:name,period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:v,unit:'ratio',input_unit:'USD',basis:'us_standard',formula_version:'facts-derive/1.0',inputs:[{fact_id:r,concept:'revenue',filing_id:'f',available_date:'2024-02-01'}],as_of:'2024-03-01'});
src/lib/facts/facts.integration.test.ts:402:  const disclose=async(available:string,value:string)=>{const run=await begin(iss,b);const f=await filing(run,available);const {ids:[id]}=await stage(run,[{filing_id:f,value,available_date:available}]);await publish(run,[f]);return id;};
src/lib/facts/facts.integration.test.ts:409:  const run=await begin(iss,b);const f=await filing(run,'2024-09-01');const {ids:[qd]}=await stage(run,[{filing_id:f,value:'121',available_date:'2024-09-01'}]);
src/lib/facts/facts.integration.test.ts:422:  await stage(run2,[{filing_id:f2,concept:'total_assets',period_start:null,duration:'INSTANT',period_end:'2024-06-30',value:'1',available_date:'2024-10-01'},{filing_id:f2,concept:'total_assets',period_start:null,duration:'INSTANT',period_end:'2024-03-31',value:'2',available_date:'2024-10-01'}]);
src/lib/facts/facts.integration.test.ts:485:   await expect(c.query(`insert into public.financial_facts(fact_id,issuer_id,market,filing_id,run_id,concept,source_concept,statement,period_start,period_end,duration,value,unit,available_date,mapping_gen,mapping_version,raw_hash) select gen_random_uuid(),issuer_id,market,filing_id,run_id,'x',source_concept,statement,period_start,period_end,duration,value,unit,available_date,mapping_gen,mapping_version,raw_hash from public.financial_facts where fact_id=$1`,[r])).rejects.toThrow(/permission denied/);
src/lib/facts/types.ts:44: available_date:string;mapping_gen:number;mapping_version:string;status:FactStatus;raw_hash:string;created_at:string;
src/lib/facts/types.ts:49: period_end:string|null;available_date:string;source_ref:string;url:string|null;document_ref:string|null;document_url:string|null;
src/lib/facts/types.ts:53:export interface MetricRow{issuer_id:string;market:Market;metric:string;period_start:string;period_end:string;duration:MetricDuration;value:string;unit:string;input_unit:string;basis:string;formula_version:string;inputs:{fact_id:string;concept:string;filing_id:string;available_date:string;ytd_rule?:'same_filing'|'never_revised';quarter?:[string,string]}[];based_on_rev:number;as_of:string}
src/lib/facts/types.ts:54:export interface ConflictItem{id:string;natural_key:string;fact_ids:string[];available_date:string;key:Record<string,string|null>}
src/lib/facts/types.ts:93:export interface FactInsert{fact_id:string;issuer_id:string;market:Market;filing_id:string;concept:string;source_concept:string;statement:Statement;period_start:string|null;period_end:string;duration:Duration;value:string;unit:string;consolidation:'consolidated';available_date:string;mapping_gen:number;mapping_version:string;raw_hash:string}
src/lib/facts/db.test.ts:36:  await expect(db.stageFacts(run,[factInsert(iss,f,{available_date:'2024-02-02'})])).rejects.toMatchObject({message:'financial_facts_filing_date_fkey'});
src/lib/facts/db.test.ts:47:  const item=await quarantine(db.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${iss}:US:x:2024-02-01`,reasonCode:'same_day_conflict',batchId:b,payload:{key:{},fact_ids:[],run_id:run}});
src/lib/facts/db.test.ts:58:  await db.tables.insert('dq_quarantine',{id:'i1',dataset:'facts.us',table_name:'financial_facts',natural_key:'a:US:x',reason_code:'same_day_conflict',status:'open',payload:{key:{available_date:'2024-01-01'},fact_ids:['f1']},detail:{},batch_id:'b',created_at:'2026-01-01T00:00:00.000Z'});
src/lib/facts/db.test.ts:59:  expect(await db.openConflicts('a','US')).toEqual([{id:'i1',natural_key:'a:US:x',fact_ids:['f1'],available_date:'2024-01-01',key:{available_date:'2024-01-01'}}]);
src/lib/facts/db.test.ts:123:  expect(pages[n]).toContainEqual(['order',['available_date',{ascending:false}]]);
src/lib/facts/db.test.ts:179:  expect(calls.at(-1)!.args.p_rows).toEqual([{filing_id:f.filing_id,source:'edgar',origin:'sec',form_type:'10-K',fiscal_year:2023,fiscal_period:'FY',period_end:'2023-12-31',available_date:'2024-02-01',source_ref:f.sourceRef,url:null}]);
src/lib/facts/public-route.ts:128:export const publicFiling=(f:FilingRow)=>({filingId:f.filing_id,formType:f.form_type,periodEnd:f.period_end,availableDate:f.available_date,sourceRef:f.source_ref,url:f.url,documentRef:f.document_ref,documentUrl:f.document_url,citation:citationOf(f)});
src/lib/facts/public-route.ts:129:export const publicFact=(r:FactRow)=>({factId:r.fact_id,concept:r.concept,sourceConcept:r.source_concept,statement:r.statement,periodStart:r.period_start,periodEnd:r.period_end,duration:r.duration,value:r.value_text,unit:r.unit,availableDate:r.available_date,filingId:r.filing_id,disclosureSeq:r.disclosure_seq??null,isCurrent:r.is_current??null,isRevision:r.is_revision??null,mappingGen:r.mapping_gen,rawHash:r.raw_hash});
src/lib/facts/read.test.ts:12:const row=(filingId:string,value:string,availableDate:string,over:Partial<FactRow>={}):FactRow=>({fact_id:`20000000-0000-4000-8000-${String(++n).padStart(12,'0')}`,issuer_id:'i',market:'US',filing_id:filingId,run_id:'r',concept:'revenue',source_concept:'Revenues',statement:'IS',period_start:'2022-10-01',period_end:'2023-09-30',duration:'12M',value,value_text:value,unit:'USD',consolidation:'consolidated',available_date:availableDate,mapping_gen:1,mapping_version:'facts-map/1',status:'ok',raw_hash:'h',created_at:`2024-01-01T00:00:00.${String(n).padStart(3,'0')}Z`,...over});
src/lib/facts/db.ts:70:export function filingArgs(rows:FilingInsert[]){return rows.map(r=>({filing_id:r.filing_id,source:r.source,origin:r.origin,form_type:r.formType,fiscal_year:r.fiscalYear,fiscal_period:r.fiscalPeriod,period_end:r.periodEnd,available_date:r.availableDate,source_ref:r.sourceRef,url:r.url}));}
src/lib/facts/db.ts:80:/** dq_quarantine row → ConflictItem: fact_ids from payload, available_date from payload.key or the natural key's last segment. */
src/lib/facts/db.ts:85: return {id:r.id,natural_key:r.natural_key,fact_ids:ids,available_date:key.available_date??r.natural_key.slice(r.natural_key.lastIndexOf(':')+1),key};
src/lib/facts/db.ts:147:   return (await pageAll<{id:string;natural_key:string;payload:Record<string,unknown>}>(()=>c.from('dq_quarantine').select('id,natural_key,payload').eq('table_name','financial_facts').eq('reason_code','same_day_conflict').eq('status','open').like('natural_key',`${conflictPrefix(issuer,market)}%`).order('created_at').order('id'))).map(conflictFromItem);
src/lib/facts/db.ts:152:    if(opts.from!==undefined)q=q.gte('available_date',opts.from);
src/lib/facts/db.ts:153:    if(opts.to!==undefined)q=q.lte('available_date',opts.to);
src/lib/facts/db.ts:155:    return q.order('available_date',{ascending:false}).order('filing_id');
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-bda0RC87' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-pczOb3qM' (errno=Operation not permitted)
ef8430a fix(facts): 8b quality review — adopt_candidate revalidates target and scope rows, date comparisons, target_not_active
f99e785 fix(facts): 8b review — generic resolver refuses reconcile/lineage items, adopt_candidate locks and checks the whole lineage, replay deadlock victim
b4ea9a0 feat(facts): migration two part 2 — promotion predicates, adopt_candidate, restore_reconciled, resolve_lineage_conflict (F3-4)
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

codex
No actionable regressions were identified in the changed SQL or integration tests. The patch strengthens lineage revalidation and scope locking and removes session-dependent date formatting from conflict checks. Database integration tests were not executed.
No actionable regressions were identified in the changed SQL or integration tests. The patch strengthens lineage revalidation and scope locking and removes session-dependent date formatting from conflict checks. Database integration tests were not executed.

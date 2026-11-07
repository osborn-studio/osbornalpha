OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1ae8e-cc5b-76d1-882e-2a3a251cdcb5
--------
user
commit 6fdef0d
exec
/bin/zsh -lc 'git status --short; git show --stat --oneline 6fdef0d; cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 454ms:
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-Qdh4ADjZ' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-IjFCN2ym' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-Kxpxp3Oj' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-M97yyCzW' (errno=Operation not permitted)
6fdef0d feat(entities): resolve_identifier_claim, calendar pass functions and the issuers topology guard; lock migration one
 src/lib/entities/identifiers.integration.test.ts   | 522 +++++++++++++++++++++
 src/lib/entities/issuers-write.integration.test.ts |  16 +-
 src/lib/entities/issuers.integration.test.ts       |  52 +-
 supabase/migrations.lock.json                      |   4 +
 .../20261107090000_identifiers_and_dq.sql          | 489 +++++++++++++++++++
 5 files changed, 1064 insertions(+), 19 deletions(-)
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

exec
/bin/zsh -lc 'pwd; ls -a | head -30; for p in /AGENTS.md /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do test ! -f "$p" || cat "$p"; done; git show 6fdef0d -- supabase/migrations/20261107090000_identifiers_and_dq.sql' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
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
git: error: couldn't create cache file '/tmp/xcrun_db-0lXjss45' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-3C3S1Ddy' (errno=Operation not permitted)
commit 6fdef0d130f3eaf4deabc5a6b95f7907887cb701
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Thu Nov 5 17:52:23 2026 -0800

    feat(entities): resolve_identifier_claim, calendar pass functions and the issuers topology guard; lock migration one
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/supabase/migrations/20261107090000_identifiers_and_dq.sql b/supabase/migrations/20261107090000_identifiers_and_dq.sql
index 96b70e9..668484a 100644
--- a/supabase/migrations/20261107090000_identifiers_and_dq.sql
+++ b/supabase/migrations/20261107090000_identifiers_and_dq.sql
@@ -273,3 +273,492 @@ on conflict (id) do update
 set public = false,
     file_size_limit = excluded.file_size_limit,
     allowed_mime_types = excluded.allowed_mime_types;
+
+-- ================================================================ functions (plan 3 Task 1b)
+-- ---------------------------------------------------------------- claim/1 helpers (internal; §4.2.1)
+-- claims.ts::validateClaimDetail mirrors identifier_claim_problem: keep the two in step.
+create or replace function public.claim_text_is_date(p text) returns boolean
+language plpgsql immutable set search_path = public as $$
+begin
+  if p is null or p !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
+  perform p::date;                                   -- rejects 2026-02-30
+  return true;
+exception when others then return false;
+end $$;
+revoke execute on function public.claim_text_is_date(text) from public, anon, authenticated, service_role;
+
+create or replace function public.claim_keys_within(p jsonb, p_allowed text[]) returns boolean
+language sql immutable set search_path = public as $$
+  select coalesce(bool_and(k = any(p_allowed)), true) from jsonb_object_keys(p) k
+$$;
+revoke execute on function public.claim_keys_within(jsonb, text[]) from public, anon, authenticated, service_role;
+
+create or replace function public.claim_evidence_ok(e jsonb) returns boolean
+language sql immutable set search_path = public as $$
+  select coalesce(e is not null and jsonb_typeof(e) = 'object'
+    and jsonb_typeof(e -> 'source') = 'string' and length(e ->> 'source') between 1 and 64
+    and public.claim_text_is_date(e ->> 'as_of')
+    and coalesce(e ->> 'evidence_sha256', '') ~ '^[0-9a-f]{64}$'
+    and (not (e ? 'locator') or jsonb_typeof(e -> 'locator') = 'string')
+    and (not (e ? 'note') or jsonb_typeof(e -> 'note') = 'string'), false)
+$$;
+revoke execute on function public.claim_evidence_ok(jsonb) from public, anon, authenticated, service_role;
+
+-- target_key = op ':' issuer_id, or op ':' issuer_id '|' ticker '|' valid_from (claims.ts::claimTargetKey).
+create or replace function public.identifier_claim_target_key(p_op text, p_target jsonb) returns text
+language sql immutable set search_path = public as $$
+  select p_op || ':' || case when p_target ? 'ticker'
+    then coalesce(p_target ->> 'issuer_id', '') || '|' || coalesce(p_target ->> 'ticker', '') || '|' || coalesce(p_target ->> 'valid_from', '')
+    else coalesce(p_target ->> 'issuer_id', '') end
+$$;
+revoke execute on function public.identifier_claim_target_key(text, jsonb) from public, anon, authenticated, service_role;
+
+-- null when the (op, id_type, value, detail) is a valid claim/1 for issuer p_issuer, else the field at fault.
+create or replace function public.identifier_claim_problem(p_op text, p_id_type text, p_value text, p_issuer uuid, p_detail jsonb)
+returns text language plpgsql stable set search_path = public as $$
+declare t jsonb; pa jsonb; pw jsonb; s jsonb; full_target boolean; allowed text[];
+begin
+  if p_detail is null or jsonb_typeof(p_detail) <> 'object' or p_detail ->> 'schema' is distinct from 'claim/1' then return 'schema'; end if;
+  if coalesce(p_detail ->> 'evidence_kind', '') not in ('hard_identifier','official_list','name_match','filing_form','provider_mapping') then return 'evidence_kind'; end if;
+  t := p_detail -> 'target'; pa := p_detail -> 'params'; pw := p_detail -> 'provenance_written';
+  if t is null or jsonb_typeof(t) <> 'object' or t ->> 'issuer_id' is distinct from p_issuer::text then return 'target.issuer_id'; end if;
+  if pa is null or jsonb_typeof(pa) <> 'object' then return 'params'; end if;
+  if not public.claim_evidence_ok(p_detail -> 'evidence') then return 'evidence'; end if;
+  if jsonb_typeof(p_detail -> 'sources') is distinct from 'array' then return 'sources'; end if;
+  for s in select x from jsonb_array_elements(p_detail -> 'sources') x loop
+    if not public.claim_evidence_ok(s) then return 'sources'; end if;
+  end loop;
+  if pw is not null and jsonb_typeof(pw) <> 'object' then return 'provenance_written'; end if;
+  full_target := t ? 'ticker' or t ? 'valid_from';
+  if full_target then
+    if jsonb_typeof(t -> 'ticker') is distinct from 'string' or length(t ->> 'ticker') not between 1 and 32
+       or not public.claim_text_is_date(t ->> 'valid_from')
+       or not public.claim_keys_within(t, array['issuer_id','ticker','valid_from']) then return 'target'; end if;
+  elsif not public.claim_keys_within(t, array['issuer_id']) then
+    return 'target';
+  end if;
+  if p_op in ('set_identifier','correct_identifier') then
+    if p_id_type in ('lei','cik','usci','cninfo_org_id') then
+      if full_target then return 'target'; end if;
+    elsif p_id_type in ('isin','figi') then
+      if not full_target then return 'target'; end if;
+    else
+      return 'op_id_type';
+    end if;
+    if p_op = 'set_identifier' then
+      if not public.claim_keys_within(pa, array['candidates','note'])
+         or (pa ? 'candidates' and jsonb_typeof(pa -> 'candidates') <> 'array')
+         or (pa ? 'note' and jsonb_typeof(pa -> 'note') <> 'string') then return 'params'; end if;
+    else
+      if not public.claim_keys_within(pa, array['expected_current','new_value','candidates','note'])
+         or jsonb_typeof(pa -> 'expected_current') is distinct from 'string' or length(pa ->> 'expected_current') not between 1 and 64
+         or jsonb_typeof(pa -> 'new_value') is distinct from 'string' or length(pa ->> 'new_value') not between 1 and 64
+         or pa ->> 'expected_current' = pa ->> 'new_value' then return 'params'; end if;
+      if pa ->> 'new_value' is distinct from p_value then return 'params.new_value'; end if;
+    end if;
+    allowed := array[p_id_type];
+  elsif p_op = 'attach_security' then
+    if p_id_type <> 'ticker' or full_target then return 'op_id_type'; end if;
+    if not public.claim_keys_within(pa, array['share_class','valid_from','valid_from_method','source','isin','note'])
+       or coalesce(pa ->> 'share_class', '') not in ('A','H','ADR','common','preferred','other','unknown')
+       or not public.claim_text_is_date(pa ->> 'valid_from')
+       or coalesce(pa ->> 'valid_from_method', '') not in ('first_observed','listing_date','ticker_change','curated')
+       or jsonb_typeof(pa -> 'source') is distinct from 'string' or length(pa ->> 'source') not between 1 and 64
+       or (pa ? 'isin' and coalesce(jsonb_typeof(pa -> 'isin'), '') not in ('string','null')) then return 'params'; end if;
+    if jsonb_typeof(pa -> 'isin') = 'string' and (pa ->> 'isin') !~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$' then return 'params'; end if;
+    allowed := array['isin','figi','valid_from'];
+  elsif p_op in ('close_security','backdate_window') then
+    if p_id_type <> 'ticker' or not full_target then return 'op_id_type'; end if;
+    if t ->> 'ticker' is distinct from p_value then return 'target.ticker'; end if;
+    if p_op = 'close_security' then
+      if not public.claim_keys_within(pa, array['valid_to','valid_to_method','note'])
+         or not public.claim_text_is_date(pa ->> 'valid_to')
+         or coalesce(pa ->> 'valid_to_method', '') not in ('delisting','ticker_change','sec_file_absent','curated','merge_close','unrecorded') then return 'params'; end if;
+      if (pa ->> 'valid_to')::date <= (t ->> 'valid_from')::date then return 'params'; end if;
+      allowed := array['valid_to'];
+    else
+      if not public.claim_keys_within(pa, array['new_valid_from','valid_from_method','note'])
+         or not public.claim_text_is_date(pa ->> 'new_valid_from')
+         or coalesce(pa ->> 'valid_from_method', '') not in ('listing_date','ticker_change','curated') then return 'params'; end if;
+      if (pa ->> 'new_valid_from')::date >= (t ->> 'valid_from')::date then return 'params'; end if;
+      allowed := array['valid_from'];
+    end if;
+  elsif p_op = 'evidence_only' then
+    if p_id_type <> 'ticker' or full_target then return 'op_id_type'; end if;
+    if pa ? 'suggested_op' and coalesce(pa ->> 'suggested_op', '') not in ('attach_security','close_security','backdate_window') then return 'params.suggested_op'; end if;
+    allowed := array[]::text[];
+  else
+    return 'op';
+  end if;
+  if pw is not null and not public.claim_keys_within(pw, allowed) then return 'provenance_written'; end if;
+  return null;
+end $$;
+revoke execute on function public.identifier_claim_problem(text, text, text, uuid, jsonb) from public, anon, authenticated, service_role;
+
+-- ---------------------------------------------------------------- resolve_identifier_claim (§3.1, §4.2.1, §7.1)
+-- Locks the claim; refuses non-pending (already_resolved), legacy (legacy_claim) and evidence_only
+-- acceptance without an amend (amend_required); validates claim/1 and the stored target_key
+-- (invalid_claim); 'rejected' only flips the status. 'accepted' performs the op's business write in
+-- the same transaction with static SQL under a guard that must hit exactly one row of an active
+-- issuer, merges detail.provenance_written (or, absent, the claim's evidence under the op's key) into
+-- the target row's provenance, then records status/resolved_by/resolved_at. Any failure raises and
+-- rolls back everything, so the claim stays pending.
+create or replace function public.resolve_identifier_claim(p_id uuid, p_status text, p_resolved_by uuid, p_amend jsonb default null)
+returns jsonb language plpgsql security definer set search_path = public as $$
+declare
+  c public.issuer_identifier_claims;
+  v_op text; v_value text; v_detail jsonb; v_amended boolean := false; v_problem text;
+  t jsonb; pa jsonb; v_pw jsonb; v_key text; v_status text; n int;
+begin
+  if p_status is null or p_status not in ('accepted','rejected') or p_resolved_by is null then
+    raise exception 'invalid_claim' using errcode = '22023';
+  end if;
+  select * into c from public.issuer_identifier_claims where id = p_id for update;
+  if not found then raise exception 'claim_not_found' using errcode = 'P0002'; end if;
+  if c.status <> 'pending' then raise exception 'already_resolved' using errcode = 'P0001'; end if;
+  if c.op = 'legacy' then raise exception 'legacy_claim' using errcode = 'P0001'; end if;
+  v_op := c.op; v_value := c.value; v_detail := c.detail;
+  if p_amend is not null then
+    -- Only an evidence_only claim is amended, only on acceptance, only into a ticker op (§4.2.1).
+    if c.op <> 'evidence_only' or p_status <> 'accepted' or jsonb_typeof(p_amend) <> 'object'
+       or coalesce(p_amend ->> 'op', '') not in ('attach_security','close_security','backdate_window')
+       or jsonb_typeof(p_amend -> 'target') is distinct from 'object' or jsonb_typeof(p_amend -> 'params') is distinct from 'object' then
+      raise exception 'invalid_claim' using errcode = '22023';
+    end if;
+    v_op := p_amend ->> 'op';
+    v_detail := c.detail || jsonb_build_object('target', p_amend -> 'target', 'params', p_amend -> 'params',
+      'original_op', c.op, 'original_target', c.detail -> 'target', 'original_params', c.detail -> 'params',
+      'amended_by', p_resolved_by, 'amended_at', clock_timestamp());
+    if (p_amend -> 'target') ? 'ticker' then v_value := p_amend -> 'target' ->> 'ticker'; end if;
+    v_amended := true;
+  elsif c.op = 'evidence_only' and p_status = 'accepted' then
+    raise exception 'amend_required' using errcode = 'P0001';
+  end if;
+  v_problem := public.identifier_claim_problem(v_op, c.id_type, v_value, c.issuer_id, v_detail);
+  if v_problem is not null then raise exception 'invalid_claim' using errcode = '22023', detail = v_problem; end if;
+  if c.target_key is distinct from public.identifier_claim_target_key(c.op, c.detail -> 'target') then
+    raise exception 'invalid_claim' using errcode = '22023', detail = 'target_key';
+  end if;
+
+  if p_status = 'rejected' then
+    update public.issuer_identifier_claims set status = 'rejected', resolved_by = p_resolved_by, resolved_at = clock_timestamp() where id = p_id;
+    return jsonb_build_object('op', c.op, 'applied', false, 'amended', false);
+  end if;
+
+  select status into v_status from public.issuers where issuer_id = c.issuer_id for update;
+  if v_status is distinct from 'active' then raise exception 'issuer_not_active' using errcode = 'P0001'; end if;
+  t := v_detail -> 'target'; pa := v_detail -> 'params';
+  v_key := case when v_op in ('set_identifier','correct_identifier') then c.id_type when v_op = 'close_security' then 'valid_to' else 'valid_from' end;
+  v_pw := coalesce(v_detail -> 'provenance_written', jsonb_build_object(v_key, v_detail -> 'evidence'));
+
+  begin
+    if v_op = 'set_identifier' and c.id_type = 'lei' then
+      update public.issuers set lei = v_value, provenance = provenance || v_pw, updated_at = now() where issuer_id = c.issuer_id and status = 'active' and lei is null;
+    elsif v_op = 'set_identifier' and c.id_type = 'cik' then
+      update public.issuers set cik = v_value, provenance = provenance || v_pw, updated_at = now() where issuer_id = c.issuer_id and status = 'active' and cik is null;
+    elsif v_op = 'set_identifier' and c.id_type = 'usci' then
+      update public.issuers set usci = v_value, provenance = provenance || v_pw, updated_at = now() where issuer_id = c.issuer_id and status = 'active' and usci is null;
+    elsif v_op = 'set_identifier' and c.id_type = 'cninfo_org_id' then
+      update public.issuers set cninfo_org_id = v_value, provenance = provenance || v_pw, updated_at = now() where issuer_id = c.issuer_id and status = 'active' and cninfo_org_id is null;
+    elsif v_op = 'correct_identifier' and c.id_type = 'lei' then
+      update public.issuers set lei = v_value, provenance = provenance || v_pw, updated_at = now() where issuer_id = c.issuer_id and status = 'active' and lei = pa ->> 'expected_current';
+    elsif v_op = 'correct_identifier' and c.id_type = 'cik' then
+      update public.issuers set cik = v_value, provenance = provenance || v_pw, updated_at = now() where issuer_id = c.issuer_id and status = 'active' and cik = pa ->> 'expected_current';
+    elsif v_op = 'correct_identifier' and c.id_type = 'usci' then
+      update public.issuers set usci = v_value, provenance = provenance || v_pw, updated_at = now() where issuer_id = c.issuer_id and status = 'active' and usci = pa ->> 'expected_current';
+    elsif v_op = 'correct_identifier' and c.id_type = 'cninfo_org_id' then
+      update public.issuers set cninfo_org_id = v_value, provenance = provenance || v_pw, updated_at = now() where issuer_id = c.issuer_id and status = 'active' and cninfo_org_id = pa ->> 'expected_current';
+    elsif v_op = 'set_identifier' and c.id_type = 'isin' then
+      update public.issuer_securities set isin = v_value, provenance = provenance || v_pw
+      where issuer_id = c.issuer_id and ticker = t ->> 'ticker' and valid_from = (t ->> 'valid_from')::date and isin is null;
+    elsif v_op = 'set_identifier' and c.id_type = 'figi' then
+      update public.issuer_securities set figi = v_value, provenance = provenance || v_pw
+      where issuer_id = c.issuer_id and ticker = t ->> 'ticker' and valid_from = (t ->> 'valid_from')::date and figi is null;
+    elsif v_op = 'correct_identifier' and c.id_type = 'isin' then
+      update public.issuer_securities set isin = v_value, provenance = provenance || v_pw
+      where issuer_id = c.issuer_id and ticker = t ->> 'ticker' and valid_from = (t ->> 'valid_from')::date and isin = pa ->> 'expected_current';
+    elsif v_op = 'correct_identifier' and c.id_type = 'figi' then
+      update public.issuer_securities set figi = v_value, provenance = provenance || v_pw
+      where issuer_id = c.issuer_id and ticker = t ->> 'ticker' and valid_from = (t ->> 'valid_from')::date and figi = pa ->> 'expected_current';
+    elsif v_op = 'attach_security' then
+      insert into public.issuer_securities(issuer_id, ticker, isin, share_class, is_primary, valid_from, valid_to, valid_from_method, valid_to_method, source, provenance)
+      values (c.issuer_id, v_value, nullif(pa ->> 'isin', ''), pa ->> 'share_class', false, (pa ->> 'valid_from')::date, null, pa ->> 'valid_from_method', null, pa ->> 'source', v_pw);
+    elsif v_op = 'close_security' then
+      update public.issuer_securities set valid_to = (pa ->> 'valid_to')::date, valid_to_method = pa ->> 'valid_to_method', provenance = provenance || v_pw
+      where issuer_id = c.issuer_id and ticker = t ->> 'ticker' and valid_from = (t ->> 'valid_from')::date and valid_to is null;
+    elsif v_op = 'backdate_window' then
+      update public.issuer_securities set valid_from = (pa ->> 'new_valid_from')::date, valid_from_method = pa ->> 'valid_from_method', provenance = provenance || v_pw
+      where issuer_id = c.issuer_id and ticker = t ->> 'ticker' and valid_from = (t ->> 'valid_from')::date;
+    else
+      raise exception 'invalid_claim' using errcode = '22023';
+    end if;
+    get diagnostics n = row_count;
+  exception
+    when unique_violation or exclusion_violation then
+      -- an issuer identifier held by another issuer; a security key/window/ISIN held by another row
+      if v_op in ('set_identifier','correct_identifier') and c.id_type in ('lei','cik','usci','cninfo_org_id') then
+        raise exception 'value_conflict' using errcode = 'P0001';
+      end if;
+      raise exception 'ownership_conflict' using errcode = 'P0001';
+    when check_violation or foreign_key_violation or invalid_text_representation or not_null_violation then
+      raise exception 'invalid_claim' using errcode = '22023';
+  end;
+  if n <> 1 then
+    if v_op = 'close_security' then raise exception 'already_closed' using errcode = 'P0001'; end if;
+    raise exception 'value_conflict' using errcode = 'P0001';
+  end if;
+  update public.issuer_identifier_claims
+  set status = 'accepted', op = v_op, value = v_value, detail = v_detail,
+      target_key = public.identifier_claim_target_key(v_op, v_detail -> 'target'),
+      resolved_by = p_resolved_by, resolved_at = clock_timestamp()
+  where id = p_id;
+  return jsonb_build_object('op', v_op, 'applied', true, 'amended', v_amended);
+end $$;
+revoke execute on function public.resolve_identifier_claim(uuid, text, uuid, jsonb) from public, anon, authenticated;
+grant execute on function public.resolve_identifier_claim(uuid, text, uuid, jsonb) to service_role;
+
+-- ---------------------------------------------------------------- calendar passes (§3.1, §6.2, T3/U1)
+-- The pass token {market, pass_id, batch_id} fences every pass write: the pass row is locked and must
+-- be leased to token.batch_id, unexpired and unfinished, else fence_failed with no write.
+create or replace function public.dq_calendar_lock_pass(p_token jsonb) returns public.dq_calendar_passes
+language plpgsql set search_path = public as $$
+declare p public.dq_calendar_passes;
+begin
+  if p_token is null or jsonb_typeof(p_token) <> 'object'
+     or coalesce(p_token ->> 'market', '') not in ('US','CN')
+     or coalesce(p_token ->> 'pass_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
+     or coalesce(p_token ->> 'batch_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
+    raise exception 'fence_failed' using errcode = 'P0001';
+  end if;
+  select * into p from public.dq_calendar_passes where market = p_token ->> 'market' and pass_id = (p_token ->> 'pass_id')::uuid for update;
+  if not found or p.claimed_by is distinct from (p_token ->> 'batch_id')::uuid
+     or p.claim_until is null or p.claim_until <= clock_timestamp() or p.finished_at is not null then
+    raise exception 'fence_failed' using errcode = 'P0001';
+  end if;
+  return p;
+end $$;
+revoke execute on function public.dq_calendar_lock_pass(jsonb) from public, anon, authenticated, service_role;
+
+-- U1: creation is serialised per market by a transaction advisory lock. No unfinished pass → create
+-- it, freeze the in-scope active issuers as members, lease it to p_batch. An unfinished pass whose
+-- lease is free, expired, or already p_batch's → (re)lease it to p_batch. Otherwise null.
+create or replace function public.claim_calendar_pass(p_market text, p_batch uuid)
+returns jsonb language plpgsql security definer set search_path = public as $$
+declare p public.dq_calendar_passes; v_pass uuid;
+begin
+  if p_market is null or p_market not in ('US','CN') then raise exception 'invalid_market' using errcode = '22023'; end if;
+  if p_batch is null then raise exception 'invalid_batch' using errcode = '22023'; end if;
+  perform pg_advisory_xact_lock(hashtext('dq_calendar_pass:' || p_market));
+  select * into p from public.dq_calendar_passes where market = p_market and finished_at is null for update;
+  if not found then
+    v_pass := gen_random_uuid();
+    insert into public.dq_calendar_passes(market, pass_id, started_at, claimed_by, claim_until, status)
+    values (p_market, v_pass, clock_timestamp(), p_batch, clock_timestamp() + interval '10 minutes', 'running');
+    insert into public.dq_calendar_pass_members(market, pass_id, issuer_id)
+    select p_market, v_pass, s.issuer_id
+    from public.fact_sync_scope s join public.issuers i on i.issuer_id = s.issuer_id
+    where s.market = p_market and s.priority > 0 and i.status = 'active';
+    return jsonb_build_object('market', p_market, 'pass_id', v_pass, 'batch_id', p_batch);
+  end if;
+  if p.claimed_by is null or p.claim_until is null or p.claim_until < clock_timestamp() or p.claimed_by = p_batch then
+    update public.dq_calendar_passes set claimed_by = p_batch, claim_until = clock_timestamp() + interval '10 minutes'
+    where market = p.market and pass_id = p.pass_id;
+    return jsonb_build_object('market', p_market, 'pass_id', p.pass_id, 'batch_id', p_batch);
+  end if;
+  return null;
+end $$;
+revoke execute on function public.claim_calendar_pass(text, uuid) from public, anon, authenticated;
+grant execute on function public.claim_calendar_pass(text, uuid) to service_role;
+
+-- The only signature (no 3-arg overload). The member must belong to the pass and be pending, or
+-- failed with attempts < 3; its rows for (issuer, market) are replaced atomically and it becomes done.
+-- Rows carry the ExpectationRow columns (src/lib/dq/calendar.ts); computed_at and batch_id are set here.
+create or replace function public.replace_filing_expectations(p_issuer uuid, p_market text, p_rows jsonb, p_pass_token jsonb)
+returns int language plpgsql security definer set search_path = public as $$
+declare p public.dq_calendar_passes; m public.dq_calendar_pass_members; n int;
+begin
+  p := public.dq_calendar_lock_pass(p_pass_token);
+  if p_market is distinct from p.market then raise exception 'fence_failed' using errcode = 'P0001'; end if;
+  select * into m from public.dq_calendar_pass_members where market = p.market and pass_id = p.pass_id and issuer_id = p_issuer for update;
+  if not found or not (m.state = 'pending' or (m.state = 'failed' and m.attempts < 3)) then
+    raise exception 'member_not_claimable' using errcode = 'P0001';
+  end if;
+  if p_rows is null or jsonb_typeof(p_rows) <> 'array'
+     or exists (select 1 from jsonb_array_elements(p_rows) x
+                where jsonb_typeof(x) <> 'object'
+                   or (x ? 'issuer_id' and x ->> 'issuer_id' is distinct from p_issuer::text)
+                   or (x ? 'market' and x ->> 'market' is distinct from p_market)) then
+    raise exception 'invalid_rows' using errcode = '22023';
+  end if;
+  begin
+    delete from public.dq_filing_expectations where issuer_id = p_issuer and market = p_market;
+    insert into public.dq_filing_expectations(issuer_id, market, report_kind, period_end, period_end_estimated, deadline_state,
+      due_date, due_rule, expected_date, upstream_lookup, upstream_filed_date, disclosure_state, received_filing_id, received_date,
+      profile_as_of, detail, computed_at, batch_id)
+    select p_issuer, p_market, x ->> 'report_kind', (x ->> 'period_end')::date, coalesce((x ->> 'period_end_estimated')::boolean, false),
+      x ->> 'deadline_state', (x ->> 'due_date')::date, x ->> 'due_rule', (x ->> 'expected_date')::date, x ->> 'upstream_lookup',
+      (x ->> 'upstream_filed_date')::date, x ->> 'disclosure_state', (x ->> 'received_filing_id')::uuid, (x ->> 'received_date')::date,
+      (x ->> 'profile_as_of')::date, coalesce(x -> 'detail', '{}'::jsonb), clock_timestamp(), p.claimed_by
+    from jsonb_array_elements(p_rows) x;
+    get diagnostics n = row_count;
+  exception when check_violation or not_null_violation or unique_violation or foreign_key_violation
+              or invalid_text_representation or invalid_datetime_format or datetime_field_overflow or invalid_parameter_value then
+    raise exception 'invalid_rows' using errcode = '22023';
+  end;
+  update public.dq_calendar_pass_members set state = 'done', done_at = clock_timestamp()
+  where market = p.market and pass_id = p.pass_id and issuer_id = p_issuer;
+  update public.dq_calendar_passes set claim_until = clock_timestamp() + interval '10 minutes' where market = p.market and pass_id = p.pass_id;
+  return n;
+end $$;
+revoke execute on function public.replace_filing_expectations(uuid, text, jsonb, jsonb) from public, anon, authenticated;
+grant execute on function public.replace_filing_expectations(uuid, text, jsonb, jsonb) to service_role;
+
+create or replace function public.fail_calendar_member(p_pass_token jsonb, p_issuer uuid, p_error text)
+returns void language plpgsql security definer set search_path = public as $$
+declare p public.dq_calendar_passes; m public.dq_calendar_pass_members;
+begin
+  p := public.dq_calendar_lock_pass(p_pass_token);
+  select * into m from public.dq_calendar_pass_members where market = p.market and pass_id = p.pass_id and issuer_id = p_issuer for update;
+  if not found or not (m.state = 'pending' or (m.state = 'failed' and m.attempts < 3)) then
+    raise exception 'member_not_claimable' using errcode = 'P0001';
+  end if;
+  update public.dq_calendar_pass_members set state = 'failed', attempts = attempts + 1, last_error = left(coalesce(p_error, 'unknown'), 1000)
+  where market = p.market and pass_id = p.pass_id and issuer_id = p_issuer;
+  update public.dq_calendar_passes set claim_until = clock_timestamp() + interval '10 minutes' where market = p.market and pass_id = p.pass_id;
+end $$;
+revoke execute on function public.fail_calendar_member(jsonb, uuid, text) from public, anon, authenticated;
+grant execute on function public.fail_calendar_member(jsonb, uuid, text) to service_role;
+
+-- Settles only from persisted member state: anything still processable → pass_incomplete; else all
+-- done → complete, otherwise complete_with_failures; both terminal states write finished_at.
+create or replace function public.finish_calendar_pass(p_pass_token jsonb)
+returns text language plpgsql security definer set search_path = public as $$
+declare p public.dq_calendar_passes; v_status text;
+begin
+  p := public.dq_calendar_lock_pass(p_pass_token);
+  if exists (select 1 from public.dq_calendar_pass_members where market = p.market and pass_id = p.pass_id
+             and (state = 'pending' or (state = 'failed' and attempts < 3))) then
+    raise exception 'pass_incomplete' using errcode = 'P0001';
+  end if;
+  v_status := case when exists (select 1 from public.dq_calendar_pass_members where market = p.market and pass_id = p.pass_id and state <> 'done')
+                   then 'complete_with_failures' else 'complete' end;
+  update public.dq_calendar_passes set status = v_status, finished_at = clock_timestamp() where market = p.market and pass_id = p.pass_id;
+  return v_status;
+end $$;
+revoke execute on function public.finish_calendar_pass(jsonb) from public, anon, authenticated;
+grant execute on function public.finish_calendar_pass(jsonb) to service_role;
+
+-- ---------------------------------------------------------------- row-locked jsonb patches (plan audit round 1, P3/P4)
+-- append_claim_evidence is the only writer of a pending claim's detail.sources after filing (claims.ts
+-- fileClaim). It locks the pending row of the five-column key, drops evidence that already is the claim's
+-- evidence or one of its sources (same source + evidence_sha256) and appends the rest with jsonb_set on
+-- detail.sources alone: two concurrent filers both keep their evidence (the old read-then-replace lost
+-- one). 'not_found' = no pending row any more (resolved meanwhile); nothing is written then.
+create or replace function public.append_claim_evidence(p_issuer uuid, p_id_type text, p_value text, p_op text, p_target_key text, p_evidence jsonb)
+returns text language plpgsql security definer set search_path = public as $$
+declare v_id uuid; v_detail jsonb; v_sources jsonb;
+begin
+  if not public.claim_evidence_ok(p_evidence) then
+    raise exception 'invalid_evidence' using errcode = '22023';
+  end if;
+  select id, detail into v_id, v_detail from public.issuer_identifier_claims
+  where issuer_id = p_issuer and id_type = p_id_type and value = p_value and op = p_op and target_key = p_target_key and status = 'pending'
+  for update;
+  if not found then return 'not_found'; end if;
+  v_sources := case when jsonb_typeof(v_detail -> 'sources') = 'array' then v_detail -> 'sources' else '[]'::jsonb end;
+  if coalesce(v_detail -> 'evidence' ->> 'source' = p_evidence ->> 'source' and v_detail -> 'evidence' ->> 'evidence_sha256' = p_evidence ->> 'evidence_sha256', false)
+     or exists (select 1 from jsonb_array_elements(v_sources) s
+                where s ->> 'source' = p_evidence ->> 'source' and s ->> 'evidence_sha256' = p_evidence ->> 'evidence_sha256') then
+    return 'duplicate';
+  end if;
+  update public.issuer_identifier_claims set detail = jsonb_set(detail, '{sources}', v_sources || jsonb_build_array(p_evidence), true) where id = v_id;
+  return 'appended';
+end $$;
+revoke execute on function public.append_claim_evidence(uuid, text, text, text, text, jsonb) from public, anon, authenticated;
+grant execute on function public.append_claim_evidence(uuid, text, text, text, text, jsonb) to service_role;
+
+-- patch_quarantine_detail is the only TS-side writer of dq_quarantine.detail once an item exists (the
+-- materialize hook state and the audit mark; quarantine.ts::patchQuarantineDetail). It locks the item and
+-- replaces ONLY the named key, so a concurrent apply_reconcile_result / restore_reconciled / adoption that
+-- rewrote latest_result, the chosen ids or the resolution columns is never rolled back to an older read.
+-- Two keys only: 'hook' and 'audit_written'. false = no such item.
+create or replace function public.patch_quarantine_detail(p_id uuid, p_key text, p_value jsonb)
+returns boolean language plpgsql security definer set search_path = public as $$
+begin
+  if p_key is null or p_key not in ('hook', 'audit_written') or p_value is null then
+    raise exception 'invalid_detail_key' using errcode = '22023';
+  end if;
+  perform 1 from public.dq_quarantine where id = p_id for update;
+  if not found then return false; end if;
+  update public.dq_quarantine set detail = detail || jsonb_build_object(p_key, p_value) where id = p_id;
+  return true;
+end $$;
+revoke execute on function public.patch_quarantine_detail(uuid, text, jsonb) from public, anon, authenticated;
+grant execute on function public.patch_quarantine_detail(uuid, text, jsonb) to service_role;
+
+-- ---------------------------------------------------------------- guarded identifier write (plan audit round 3, R2)
+-- set_security_identifier is the only writer of issuer_securities.isin/figi outside resolve_identifier_claim
+-- (identifiers/apply.ts, Task 4a). It locks the open row (issuer, ticker, valid_from, valid_to null) and
+-- in ONE UPDATE writes the column (only when empty) and merges the single provenance key with
+-- `provenance || p_provenance` — never a whole-object replacement — so a concurrent write of the other
+-- column, or a claim resolution (which also merges with ||), keeps its key. p_provenance must carry
+-- exactly the key p_column. Outcomes: 'written' (the column was empty), 'duplicate' (the same value is
+-- stored; a missing provenance key is completed in the same UPDATE), 'conflict' (another value is
+-- stored; nothing written — the caller files correct_identifier), 'not_found' (no open row). ISIN
+-- uniqueness / no-overlap violations (23505 / 23P01) pass through unchanged.
+create or replace function public.set_security_identifier(p_issuer uuid, p_ticker text, p_valid_from date, p_column text, p_value text, p_provenance jsonb)
+returns text language plpgsql security definer set search_path = public as $$
+declare v_cur text; v_prov jsonb;
+begin
+  if p_column is null or p_column not in ('isin', 'figi') or coalesce(p_value, '') = ''
+     or p_provenance is null or jsonb_typeof(p_provenance) <> 'object'
+     or (select array_agg(k) from jsonb_object_keys(p_provenance) k) is distinct from array[p_column] then
+    raise exception 'invalid_identifier_write' using errcode = '22023';
+  end if;
+  select case when p_column = 'isin' then s.isin else s.figi end, s.provenance into v_cur, v_prov
+  from public.issuer_securities s
+  where s.issuer_id = p_issuer and s.ticker = p_ticker and s.valid_from = p_valid_from and s.valid_to is null
+  for update;
+  if not found then return 'not_found'; end if;
+  if v_cur is not null and v_cur <> p_value then return 'conflict'; end if;
+  if v_cur = p_value and coalesce(v_prov ? p_column, false) then return 'duplicate'; end if;
+  if p_column = 'isin' then
+    update public.issuer_securities set isin = p_value, provenance = provenance || p_provenance
+    where issuer_id = p_issuer and ticker = p_ticker and valid_from = p_valid_from and valid_to is null;
+  else
+    update public.issuer_securities set figi = p_value, provenance = provenance || p_provenance
+    where issuer_id = p_issuer and ticker = p_ticker and valid_from = p_valid_from and valid_to is null;
+  end if;
+  return case when v_cur is null then 'written' else 'duplicate' end;
+end $$;
+revoke execute on function public.set_security_identifier(uuid, text, date, text, text, jsonb) from public, anon, authenticated;
+grant execute on function public.set_security_identifier(uuid, text, date, text, text, jsonb) to service_role;
+
+-- ---------------------------------------------------------------- topology guard (§3.1, S1)
+-- issuers.status/merged_into change only inside set_merge/set_dissolved (migration two), which switch
+-- the transaction-local setting on and restore it on every exit path. A never-defined setting reads
+-- NULL and the '' left after such a transaction both differ from 'on' and are refused (IS DISTINCT
+-- FROM). The WHEN clause skips same-value writes. Named so it fires after the plan-1 lifecycle
+-- triggers (BEFORE triggers run in name order), which keep reporting their own errors. A tripwire,
+-- not a privilege boundary: any role can set the GUC. Inserts are guarded too (plan 3 接口对齐记录 #7):
+-- an issuer born with status <> 'active' or merged_into set would add a lineage member without
+-- set_merge's scope locks; plain active inserts pass.
+create or replace function public.issuers_topology_guard() returns trigger
+language plpgsql set search_path = public as $$
+begin
+  if tg_op = 'INSERT' then
+    if new.status is distinct from 'active' or new.merged_into is not null then
+      if current_setting('entities.allow_topology_write', true) is distinct from 'on' then
+        raise exception 'topology_write_forbidden' using errcode = '23514';
+      end if;
+    end if;
+  elsif old.status is distinct from new.status or old.merged_into is distinct from new.merged_into then
+    if current_setting('entities.allow_topology_write', true) is distinct from 'on' then
+      raise exception 'topology_write_forbidden' using errcode = '23514';
+    end if;
+  end if;
+  return new;
+end $$;
+drop trigger if exists issuers_topology_guard on public.issuers;
+create trigger issuers_topology_guard before insert or update of status, merged_into on public.issuers
+  for each row execute function public.issuers_topology_guard();

exec
/bin/zsh -lc "git show 6fdef0d -- src/lib/entities/issuers-write.integration.test.ts src/lib/entities/issuers.integration.test.ts; sed -n '1,275p' supabase/migrations/20261107090000_identifiers_and_dq.sql; ls supabase/migrations; cat src/lib/entities/claims.ts" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-2kznda9x' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-ThC3uVhr' (errno=Operation not permitted)
commit 6fdef0d130f3eaf4deabc5a6b95f7907887cb701
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Thu Nov 5 17:52:23 2026 -0800

    feat(entities): resolve_identifier_claim, calendar pass functions and the issuers topology guard; lock migration one
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/entities/issuers-write.integration.test.ts b/src/lib/entities/issuers-write.integration.test.ts
index b9835c0..bf17c89 100644
--- a/src/lib/entities/issuers-write.integration.test.ts
+++ b/src/lib/entities/issuers-write.integration.test.ts
@@ -44,6 +44,18 @@ describe.skipIf(!enabled)('issuer write path on real PostgreSQL',()=>{
   return track(out.issuer_id)!;
  };
  const pendingClaims=async(issuer:string)=>(await admin.query(`select id_type,value from public.issuer_identifier_claims where issuer_id=$1 and status='pending' order by id_type,value`,[issuer])).rows;
+ // Plan 3 migration one guards issuers.status/merged_into (issuers_topology_guard): lifecycle fixtures
+ // switch the transaction-local setting on, as set_merge/set_dissolved do. The plan-1 triggers still run.
+ const topo=async(sql:string,params:unknown[]=[])=>{
+  const c=await admin.connect();
+  try{
+   await c.query('begin');
+   await c.query(`select set_config('entities.allow_topology_write','on',true)`);
+   await c.query(sql,params);
+   await c.query('commit');
+  }catch(e){await c.query('rollback').catch(()=>{});throw e;}
+  finally{c.release();}
+ };
  const sec=(issuer_id:string,ticker:string,valid_from:string,valid_to:string|null=null)=>({issuer_id,ticker,share_class:'common' as const,valid_from,valid_to,source:'test'});
  /** Hides existing ownership rows from the first pre-insert read, so the insert races the DB constraint. */
  const blindFirstRead=(seen:{code?:string|null})=>{
@@ -178,7 +190,7 @@ describe.skipIf(!enabled)('issuer write path on real PostgreSQL',()=>{
 
  it('rejects an open security on an issuer merged into an active one with issuer_not_active, but keeps closed history',async()=>{
   const a=await newIssuer(),b=await newIssuer();
-  await admin.query(`update public.issuers set status='merged',merged_into=$2 where issuer_id=$1`,[a,b]);
+  await topo(`update public.issuers set status='merged',merged_into=$2 where issuer_id=$1`,[a,b]);
   const t=await usTicker();
   await expect(attachSecurity(db,sec(a,t,'2020-01-01'))).rejects.toThrow(/^issuer_not_active$/);
   expect(await attachSecurity(db,sec(a,t,'2000-01-01','2005-01-01'))).toBe('inserted');
@@ -188,7 +200,7 @@ describe.skipIf(!enabled)('issuer write path on real PostgreSQL',()=>{
  it('returns inactive_issuer for a dissolved hit and claims only the ids it does not hold',async()=>{
   const id=await newIssuer();
   const cik=(await admin.query(`select cik from public.issuers where issuer_id=$1`,[id])).rows[0].cik as string;
-  await admin.query(`update public.issuers set status='dissolved' where issuer_id=$1`,[id]);
+  await topo(`update public.issuers set status='dissolved' where issuer_id=$1`,[id]);
   const lei=randomLei();
   expect(await upsertIssuerByIdentifiers(db,{cik,lei,canonical_name_en:'Zombie'})).toEqual({issuer_id:null,created:false,conflict:true,reason:'inactive_issuer'});
   expect(await pendingClaims(id)).toEqual([{id_type:'lei',value:lei}]);
diff --git a/src/lib/entities/issuers.integration.test.ts b/src/lib/entities/issuers.integration.test.ts
index d706c14..5660066 100644
--- a/src/lib/entities/issuers.integration.test.ts
+++ b/src/lib/entities/issuers.integration.test.ts
@@ -41,6 +41,24 @@ describe.skipIf(!enabled)('WP-F1a issuers on real PostgreSQL',()=>{
   await admin.query(`insert into public.issuers(issuer_id,canonical_name_en${cols}) values($1,'Test Co'${vals})`,[id,...params]);
   return id;
  };
+ // Plan 3 migration one guards issuers.status/merged_into (issuers_topology_guard): lifecycle fixtures
+ // switch the transaction-local setting on, as set_merge/set_dissolved do. The plan-1 triggers still run.
+ const topo=async(sql:string,params:unknown[]=[])=>{
+  const c=await admin.connect();
+  try{
+   await c.query('begin');
+   await c.query(`select set_config('entities.allow_topology_write','on',true)`);
+   await c.query(sql,params);
+   await c.query('commit');
+  }catch(e){await c.query('rollback').catch(()=>{});throw e;}
+  finally{c.release();}
+ };
+ // Inserts born merged/dissolved are guarded too (plan 3 接口对齐记录 #7): same fixture, inside a topo transaction.
+ const newIssuerTopo=async(cols:string,vals:string,params:unknown[]=[])=>{
+  const id=randomUUID();issuers.push(id);
+  await topo(`insert into public.issuers(issuer_id,canonical_name_en${cols}) values($1,'Test Co'${vals})`,[id,...params]);
+  return id;
+ };
  // Tickers enter the cleanup list only after their own insert succeeded. US tickers use a ZZ
  // prefix no seed uses; an A-share code can collide with seed data, so it is inserted with
  // ON CONFLICT DO NOTHING and the caller skips that case (returns null) rather than adopting it.
@@ -95,11 +113,11 @@ describe.skipIf(!enabled)('WP-F1a issuers on real PostgreSQL',()=>{
   await expect(newIssuer(',cik',',$2',[cik])).rejects.toThrow(/issuers_cik_idx/);
   await expect(newIssuer(',cik',',$2',['0123'])).rejects.toThrow(/issuers_cik_check/);
   await expect(admin.query(`insert into public.issuers(issuer_id) values($1)`,[randomUUID()])).rejects.toThrow(/issuers_has_name/);
-  await expect(admin.query(`update public.issuers set status='merged',merged_into=issuer_id where issuer_id=$1`,[a])).rejects.toThrow(/issuers_merged_not_self/);
-  await expect(newIssuer(',status',`,'merged'`)).rejects.toThrow(/issuers_merged_iff_status/);
-  await expect(newIssuer(',merged_into',',$2',[a])).rejects.toThrow(/issuers_merged_iff_status/);
+  await expect(topo(`update public.issuers set status='merged',merged_into=issuer_id where issuer_id=$1`,[a])).rejects.toThrow(/issuers_merged_not_self/);
+  await expect(newIssuerTopo(',status',`,'merged'`)).rejects.toThrow(/issuers_merged_iff_status/);
+  await expect(newIssuerTopo(',merged_into',',$2',[a])).rejects.toThrow(/issuers_merged_iff_status/);
   await expect(newIssuer(',provenance',`,'[]'::jsonb`)).rejects.toThrow(/issuers_provenance_object/);
-  await newIssuer(',status,merged_into',`,'merged',$2`,[a]);
+  await newIssuerTopo(',status,merged_into',`,'merged',$2`,[a]);
  },30000);
 
  it('enforces security ownership windows, identifiers and foreign keys',async()=>{
@@ -175,12 +193,12 @@ describe.skipIf(!enabled)('WP-F1a issuers on real PostgreSQL',()=>{
  it('enforces the merge and ownership lifecycle',async()=>{
   const a=await newIssuer();
   const b=await newIssuer();
-  await admin.query(`update public.issuers set status='merged',merged_into=$2 where issuer_id=$1`,[a,b]);
-  await expect(admin.query(`update public.issuers set status='merged',merged_into=$2 where issuer_id=$1`,[b,a])).rejects.toThrow(/merge_target_not_active/);
+  await topo(`update public.issuers set status='merged',merged_into=$2 where issuer_id=$1`,[a,b]);
+  await expect(topo(`update public.issuers set status='merged',merged_into=$2 where issuer_id=$1`,[b,a])).rejects.toThrow(/merge_target_not_active/);
   const c=await newIssuer();
-  await expect(newIssuer(',status,merged_into',`,'merged',$2`,[a])).rejects.toThrow(/merge_target_not_active/);
-  await admin.query(`update public.issuers set status='dissolved' where issuer_id=$1`,[c]);
-  await expect(newIssuer(',status,merged_into',`,'merged',$2`,[c])).rejects.toThrow(/merge_target_not_active/);
+  await expect(newIssuerTopo(',status,merged_into',`,'merged',$2`,[a])).rejects.toThrow(/merge_target_not_active/);
+  await topo(`update public.issuers set status='dissolved' where issuer_id=$1`,[c]);
+  await expect(newIssuerTopo(',status,merged_into',`,'merged',$2`,[c])).rejects.toThrow(/merge_target_not_active/);
   const t=await usTicker();
   await expect(sec(a,t,'2021-01-01',null)).rejects.toThrow(/issuer_not_active/);
   await sec(a,t,'2020-01-01','2021-01-01');
@@ -190,12 +208,12 @@ describe.skipIf(!enabled)('WP-F1a issuers on real PostgreSQL',()=>{
 
  it('rejects merge chains: an issuer that others merged into cannot itself be merged or dissolved',async()=>{
   const a=await newIssuer(),b=await newIssuer(),c=await newIssuer();
-  await admin.query(`update public.issuers set status='merged',merged_into=$2 where issuer_id=$1`,[a,b]);
-  await expect(admin.query(`update public.issuers set status='merged',merged_into=$2 where issuer_id=$1`,[b,c])).rejects.toThrow(/merge_target_has_referrers/);
-  await expect(admin.query(`update public.issuers set status='dissolved' where issuer_id=$1`,[b])).rejects.toThrow(/merge_target_has_referrers/);
+  await topo(`update public.issuers set status='merged',merged_into=$2 where issuer_id=$1`,[a,b]);
+  await expect(topo(`update public.issuers set status='merged',merged_into=$2 where issuer_id=$1`,[b,c])).rejects.toThrow(/merge_target_has_referrers/);
+  await expect(topo(`update public.issuers set status='dissolved' where issuer_id=$1`,[b])).rejects.toThrow(/merge_target_has_referrers/);
   // Re-point the referrer first, then the former target can be retired.
-  await admin.query(`update public.issuers set merged_into=$2 where issuer_id=$1`,[a,c]);
-  await admin.query(`update public.issuers set status='merged',merged_into=$2 where issuer_id=$1`,[b,c]);
+  await topo(`update public.issuers set merged_into=$2 where issuer_id=$1`,[a,c]);
+  await topo(`update public.issuers set status='merged',merged_into=$2 where issuer_id=$1`,[b,c]);
   const rows=(await admin.query(`select issuer_id,status,merged_into from public.issuers where issuer_id=any($1::uuid[]) order by issuer_id`,[[a,b,c]])).rows;
   expect(rows).toEqual([{issuer_id:a,status:'merged',merged_into:c},{issuer_id:b,status:'merged',merged_into:c},{issuer_id:c,status:'active',merged_into:null}].sort((x,y)=>x.issuer_id.localeCompare(y.issuer_id)));
  },30000);
@@ -204,10 +222,10 @@ describe.skipIf(!enabled)('WP-F1a issuers on real PostgreSQL',()=>{
   const a=await newIssuer(),b=await newIssuer();
   const t=await usTicker();
   await sec(a,t,'2020-01-01',null);
-  await expect(admin.query(`update public.issuers set status='dissolved' where issuer_id=$1`,[a])).rejects.toThrow(/open_securities_exist/);
-  await expect(admin.query(`update public.issuers set status='merged',merged_into=$2 where issuer_id=$1`,[a,b])).rejects.toThrow(/open_securities_exist/);
+  await expect(topo(`update public.issuers set status='dissolved' where issuer_id=$1`,[a])).rejects.toThrow(/open_securities_exist/);
+  await expect(topo(`update public.issuers set status='merged',merged_into=$2 where issuer_id=$1`,[a,b])).rejects.toThrow(/open_securities_exist/);
   await admin.query(`update public.issuer_securities set valid_to='2024-01-01',valid_to_method='unrecorded' where issuer_id=$1 and ticker=$2`,[a,t]);
-  await admin.query(`update public.issuers set status='dissolved' where issuer_id=$1`,[a]);
+  await topo(`update public.issuers set status='dissolved' where issuer_id=$1`,[a]);
   expect((await admin.query(`select status from public.issuers where issuer_id=$1`,[a])).rows[0].status).toBe('dissolved');
  },30000);
 
-- supabase/migrations/20261107090000_identifiers_and_dq.sql
-- Data foundation 3, migration one (spec 2026-11-04-data-foundation-3 §3.1; plan 3 Tasks 1a/1b).
-- issuer_securities gains evidence methods for both window ends; issuer_identifier_claims becomes
-- the claim/1 review queue (op, target_key, detail, resolution columns); dq_reconciliations gains
-- pair/kind/outcome/detail and the cycle-result columns; new tables hold reconcile cycles and
-- cursors, calendar passes and their frozen members, filer categories, filing expectations and
-- filing profiles; dq_freshness accepts 'weekly'; bucket reconcile-raw stores raw evidence.
-- Replayable: every column added to an existing table is added together with its one-time backfill
-- inside a guard on information_schema.columns, so a replay never rewrites evidence written after
-- the first run (spec §3). Constraints are dropped-if-exists then added (old rows satisfy them).
-- New tables are service-role only (RLS on, client roles revoked; service_role gets only what its
-- writers need — function-written tables are SELECT only). Business writes go through the security
-- definer functions in the second half (Task 1b); errors carry the code as the message.
-- The hosted postgres role is not a superuser: no `alter function … owner`; search_path = public.
-- Only the buckets table is referenced (local harness).

-- ---------------------------------------------------------------- issuer_securities: window-end methods (§3.1, §4.3.1)
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'issuer_securities' and column_name = 'valid_from_method') then
    alter table public.issuer_securities
      add column valid_from_method text not null default 'first_observed',
      add column valid_to_method text;
    -- One-time backfill: curated rows were entered by hand; a closed row of any other source has no
    -- evidence for its end (an observation bound, 'unrecorded').
    update public.issuer_securities set valid_from_method = 'curated' where source = 'curated';
    update public.issuer_securities set valid_to_method = case source when 'curated' then 'curated' else 'unrecorded' end where valid_to is not null;
  end if;
end $$;
alter table public.issuer_securities
  drop constraint if exists issuer_securities_valid_from_method_check,
  drop constraint if exists issuer_securities_valid_to_method_check,
  drop constraint if exists issuer_securities_to_method_iff_to,
  add constraint issuer_securities_valid_from_method_check check (valid_from_method in ('first_observed','listing_date','ticker_change','curated')),
  add constraint issuer_securities_valid_to_method_check check (valid_to_method is null or valid_to_method in ('delisting','ticker_change','sec_file_absent','curated','merge_close','unrecorded')),
  add constraint issuer_securities_to_method_iff_to check ((valid_to is null) = (valid_to_method is null));

-- ---------------------------------------------------------------- issuer_identifier_claims: claim/1 (§3.1, §4.2.1)
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'issuer_identifier_claims' and column_name = 'op') then
    -- Existing rows become op='legacy', target_key='', detail='{}' through the defaults: they cannot be
    -- resolved by the route, only by runbook §4 SQL or rejection.
    alter table public.issuer_identifier_claims
      add column op text not null default 'legacy',
      add column target_key text not null default '',
      add column detail jsonb not null default '{}',
      add column resolved_by uuid,
      add column resolved_at timestamptz;
  end if;
end $$;
alter table public.issuer_identifier_claims alter column confidence drop not null;
alter table public.issuer_identifier_claims
  drop constraint if exists issuer_identifier_claims_id_type_check,
  drop constraint if exists issuer_identifier_claims_op_check,
  drop constraint if exists issuer_identifier_claims_target_key_check,
  drop constraint if exists issuer_identifier_claims_target_key_required,
  drop constraint if exists issuer_identifier_claims_detail_object,
  drop constraint if exists issuer_identifier_claims_pending_has_no_resolution,
  add constraint issuer_identifier_claims_id_type_check check (id_type in ('lei','cik','usci','isin','figi','cninfo_org_id','ticker')),
  add constraint issuer_identifier_claims_op_check check (op in ('legacy','evidence_only','set_identifier','correct_identifier','attach_security','close_security','backdate_window')),
  add constraint issuer_identifier_claims_target_key_check check (length(target_key) <= 256),
  add constraint issuer_identifier_claims_target_key_required check (op = 'legacy' or length(target_key) > 0),
  add constraint issuer_identifier_claims_detail_object check (jsonb_typeof(detail) = 'object'),
  add constraint issuer_identifier_claims_pending_has_no_resolution check (status <> 'pending' or resolved_at is null);
-- At most one PENDING claim per (issuer, id_type, value, op, target): fileClaim converges concurrent
-- filers on it (23505 → append evidence to the winner's detail.sources).
drop index if exists public.issuer_identifier_claims_pending_unique;
create unique index issuer_identifier_claims_pending_unique on public.issuer_identifier_claims(issuer_id, id_type, value, op, target_key) where status = 'pending';

-- ---------------------------------------------------------------- dq_reconciliations: pairs, kinds, outcomes, cycle rows (§3.1, T2)
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'dq_reconciliations' and column_name = 'pair') then
    alter table public.dq_reconciliations
      add column pair text not null default 'legacy',
      add column kind text not null default 'numeric',
      add column outcome text not null default 'compared',
      add column detail jsonb not null default '{}',
      add column cycle_id text,
      add column issuer_id uuid references public.issuers(issuer_id) on delete restrict,
      add column market text,
      add column attempt int;
    -- The table had no writer before this migration (production is empty); any row is legacy.
    update public.dq_reconciliations set outcome = 'legacy';
  end if;
end $$;
alter table public.dq_reconciliations
  drop constraint if exists dq_reconciliations_pair_check,
  drop constraint if exists dq_reconciliations_kind_check,
  drop constraint if exists dq_reconciliations_outcome_check,
  drop constraint if exists dq_reconciliations_detail_object,
  drop constraint if exists dq_reconciliations_market_check,
  drop constraint if exists dq_reconciliations_attempt_check,
  drop constraint if exists dq_reconciliations_cycle_cols,
  drop constraint if exists dq_reconciliations_numeric_sides,
  drop constraint if exists dq_reconciliations_nonnumeric_sides,
  add constraint dq_reconciliations_pair_check check (length(pair) between 1 and 64),
  add constraint dq_reconciliations_kind_check check (kind in ('numeric','text','date')),
  add constraint dq_reconciliations_outcome_check check (outcome in ('compared','left_missing','left_unlinked','left_ambiguous','right_missing','unsupported','right_ambiguous','incomplete_gold','legacy')),
  add constraint dq_reconciliations_detail_object check (jsonb_typeof(detail) = 'object'),
  add constraint dq_reconciliations_market_check check (market is null or market in ('US','CN')),
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
);
create unique index if not exists dq_calendar_passes_open_uniq on public.dq_calendar_passes(market) where finished_at is null;

-- Frozen when the pass is created (in-scope issuers); scope changes during a pass go to the next one.
create table if not exists public.dq_calendar_pass_members (
  market      text not null,
  pass_id     uuid not null,
  issuer_id   uuid not null references public.issuers(issuer_id) on delete restrict,
  state       text not null default 'pending' check (state in ('pending','done','failed')),
  attempts    int not null default 0 check (attempts >= 0),
  last_error  text,
  done_at     timestamptz,
  primary key (market, pass_id, issuer_id),
  constraint dq_calendar_pass_members_pass_fkey foreign key (market, pass_id) references public.dq_calendar_passes(market, pass_id) on delete restrict
);
create index if not exists dq_calendar_pass_members_state_idx on public.dq_calendar_pass_members(market, pass_id, state);

-- ---------------------------------------------------------------- filer categories, expectations, profiles (§3.1, §6.1)
-- Per fiscal year, from that year's 10-K cover page (iXBRL dei), never from submissions.category.
create table if not exists public.issuer_filer_categories (
  issuer_id          uuid not null references public.issuers(issuer_id) on delete restrict,
  fiscal_year        int not null,
  acceleration       text not null check (acceleration in ('large_accelerated','accelerated','non_accelerated')),
  smaller_reporting  boolean,
  category_raw       text not null check (length(category_raw) between 1 and 256),
  source             text not null check (source in ('ixbrl_dei')),
  accession          text not null check (length(accession) between 1 and 32),
  evidence_sha256    text not null check (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  as_of              date not null,
  primary key (issuer_id, fiscal_year)
);

create table if not exists public.dq_filing_expectations (
  issuer_id            uuid not null references public.issuers(issuer_id) on delete restrict,
  market               text not null check (market in ('US','CN')),
  report_kind          text not null check (report_kind in ('10-K','10-Q','20-F','40-F','annual','semiannual','q1','q3')),
  period_end           date not null,
  period_end_estimated boolean not null default false,
  deadline_state       text not null check (deadline_state in ('statutory','estimated','no_rule')),
  due_date             date,
  due_rule             text not null check (length(due_rule) between 1 and 64),
  expected_date        date,                                            -- CN appointment date (same period)
  upstream_lookup      text not null check (upstream_lookup in ('ok','unavailable','not_applicable')),
  upstream_filed_date  date,
  disclosure_state     text not null check (disclosure_state in ('pending','overdue','filed_not_ingested','received','received_late','unknown_upstream')),
  received_filing_id   uuid,
  received_date        date,
  profile_as_of        date,
  detail               jsonb not null default '{}',
  computed_at          timestamptz not null,
  batch_id             uuid not null references public.ingest_batches(batch_id) on delete restrict,
  primary key (issuer_id, market, report_kind, period_end),
  constraint dq_filing_expectations_detail_object check (jsonb_typeof(detail) = 'object'),
  -- deadline_state and disclosure_state are orthogonal: a no_rule row may still be received.
  constraint dfe_due_iff_known check ((due_date is null) = (deadline_state = 'no_rule')),
  constraint dfe_received_iff check ((disclosure_state in ('received','received_late')) = (received_filing_id is not null and received_date is not null)),
  constraint dfe_late_requires_due check (disclosure_state <> 'received_late' or due_date is not null),
  -- estimated rows are never overdue: past due they stay pending with detail.estimated_due_passed=true
  constraint dfe_overdue_requires_statutory check (disclosure_state <> 'overdue' or deadline_state = 'statutory'),
  constraint dfe_unknown_upstream_iff check ((disclosure_state = 'unknown_upstream') = (upstream_lookup = 'unavailable' and received_filing_id is null))
);
-- received_filing_id and received_date travel together, whatever the state (Codex round 1 P2)
alter table public.dq_filing_expectations drop constraint if exists dfe_received_pair, add constraint dfe_received_pair check ((received_filing_id is null) = (received_date is null));
create index if not exists dq_filing_expectations_state_idx on public.dq_filing_expectations(market, disclosure_state, due_date);

create table if not exists public.issuer_filing_profiles (
  issuer_id             uuid not null references public.issuers(issuer_id) on delete restrict,
  market                text not null check (market in ('US','CN')),
  category_raw_current  text,                                           -- submissions.category as written; reference only, never decides a deadline
  regime                text not null check (regime in ('10-K','20-F','40-F','cn')),
  fiscal_year_end       text check (fiscal_year_end ~ '^(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])$'),
  week52_pattern        boolean not null default false,
  source                text not null check (length(source) between 1 and 64),
  source_sha256         text check (source_sha256 is null or source_sha256 ~ '^[0-9a-f]{64}$'),
  as_of                 date not null,
  updated_at            timestamptz not null default now(),
  primary key (issuer_id, market)
);

-- ---------------------------------------------------------------- privileges (service-role only)
do $$ declare t text; begin
  foreach t in array array['dq_reconcile_cycles','dq_reconcile_cursor','dq_calendar_passes','dq_calendar_pass_members','issuer_filer_categories','dq_filing_expectations','issuer_filing_profiles'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
  end loop;
end $$;
-- run.ts creates and settles cycles and inserts the frozen cursor rows; claiming, completing and
-- failing a cursor row happen only in migration two's functions (fenced).
grant select, insert, update on public.dq_reconcile_cycles to service_role;
grant select, insert on public.dq_reconcile_cursor to service_role;
-- Written only by the pass functions below (fenced): read-only for every client role.
grant select on public.dq_calendar_passes, public.dq_calendar_pass_members, public.dq_filing_expectations to service_role;
-- Plain registries written by the calendar sync and filer-category scripts through TableClient.
grant select, insert, update, delete on public.issuer_filer_categories, public.issuer_filing_profiles to service_role;

-- ---------------------------------------------------------------- bucket reconcile-raw (§3.1)
-- Content-addressed raw evidence (<kind>/<sha256>.<ext>), private, no object-level policy, so only
-- the service role reaches it. Uploads use upsert:false; 409 means the bytes are already stored.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reconcile-raw', 'reconcile-raw', false, 52428800,
        array['application/json','text/html','application/pdf','text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/zip'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
20260515000000_initial_schema.sql
20260621000000_profiles_and_billing_hooks.sql
20260624090000_llm_settings.sql
20260702090000_decision_layer.sql
20260703090000_usage_events.sql
20260703120000_stripe_billing.sql
20260704000000_timezone_auto_default.sql
20260704090000_markets_jp_kr_tw.sql
20260705000000_research_os_tables.sql
20260706120000_deal_memo.sql
20260715000000_user_events.sql
20260715090000_beta_observability.sql
20260715130000_security_master_data.sql
20260715140000_watchlist_security_fk.sql
20260721080000_auth_funnel_milestones.sql
20260721081500_service_alert_runs.sql
20260721083000_auth_email_probes.sql
20260728090000_llm_daily_cost_budget.sql
20260728100000_usage_event_status.sql
20260728110000_llm_incurred_budget.sql
20260728120000_llm_reservation_usage_audit.sql
20260728130000_usage_run_lifecycle.sql
20260728140000_cap_exempt_platform_audit.sql
20260728150000_profile_entitlement_security.sql
20260904090000_watchlist_decision_sync.sql
20260922090000_research_s4.sql
20260922100000_research_s6.sql
20260922101000_research_s6_hardening.sql
20260922102000_research_s6_session_clock.sql
20260922103000_research_s6_receipt_clock.sql
20260922104000_research_s6_rel_fixture.sql
20260925230000_research_source_extension.sql
20260926000000_research_judgment_ledger.sql
20260926010000_research_entity_keys.sql
20260926100000_research_source_entity_alignments.sql
20260926110000_research_thesis_extension.sql
20260926120000_research_cards.sql
20260926130000_research_decisions_observation.sql
20260926140000_research_analyst_identities.sql
20261005165000_evaluation_intent_cancel.sql
20261005175000_evaluation_intent_fence.sql
20261006212400_quote_alert_window_samples.sql
20261017090000_analyst_scoring.sql
20261017120000_recommendations_append_only.sql
20261018090000_recommendation_scores_base_close.sql
20261018120000_anchor_runner.sql
20261018150000_anchor_runner_cache_read.sql
20261105090000_dq_foundation.sql
20261105091000_issuers.sql
20261106090000_financial_facts.sql
20261107090000_identifiers_and_dq.sql
// Pending issuer_identifier_claims: the review queue for identifiers that contradict stored data.
import {randomUUID} from 'node:crypto';
import {TableError} from '../db/table-client';
import type {TableClient} from '../db/table-client';
import type {ClaimIdType} from './types';

/** Unique (23505) or exclusion (23P01) violation, i.e. another row already holds the key. */
export const isUnique=(e:unknown)=>e instanceof TableError&&(e.code==='23505'||e.code==='23P01');

export interface ClaimInput{issuer_id:string;id_type:ClaimIdType;value:string;source:string}

/**
 * Files a pending claim unless an identical one is already pending. Retry-safe: the partial
 * unique index (issuer_id,id_type,value) where status='pending' turns a concurrent duplicate
 * into 23505, which is a no-op here. Returns whether a new claim row was written.
 */
export async function fileClaim(client:TableClient,c:ClaimInput):Promise<boolean>{
 const pending={issuer_id:c.issuer_id,id_type:c.id_type,value:c.value,status:'pending'};
 if(await client.count('issuer_identifier_claims',pending)>0)return false;
 try{
  await client.insert('issuer_identifier_claims',{id:randomUUID(),...c,confidence:0.5,status:'pending',created_at:new Date().toISOString()});
  return true;
 }catch(e){if(isUnique(e))return false;throw e;}
}

exec
/bin/zsh -lc "cat src/lib/entities/identifiers.integration.test.ts; rg -n 'provenance_written|resolve_identifier_claim|set_security_identifier' docs | head -65; find . -iname '*agents*' -o -name CLAUDE.md | head -30" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 47ms:
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
  try{await body();}finally{await close();}
 }finally{
  await c.query('select pg_advisory_unlock($1)',[CALENDAR_TEST_LOCK]).catch(()=>{});
  c.release();
 }
}

let admin:Pool;
let adminUrl:string;
const q=async(text:string,values:unknown[]=[])=>(await admin.query(text,values)).rows as Record<string,any>[];
const insertRow=(table:string,row:Record<string,unknown>)=>{
 const cols=Object.keys(row);
 return admin.query(`insert into public.${table}(${cols.join(',')}) values(${cols.map((_,i)=>`$${i+1}`).join(',')})`,Object.values(row));
};
const issuer=async(name='ZZ Ident Test')=>{const id=randomUUID();await q(`insert into public.issuers(issuer_id,canonical_name_en) values($1,$2)`,[id,name]);return id;};
const ticker=async(market='US')=>{
 const t='ZZ'+hex(4);
 const r=await q(`insert into public.stocks_universe(ticker,name,market) values($1,'Ident Test',$2) on conflict (ticker) do nothing returning ticker`,[t,market]);
 if(r.length!==1)throw new Error('ZZ test ticker collided');
 return t;
};
const batch=async(dataset='dq.calendar.cn',producer='filing-calendar')=>{const id=randomUUID();await q(`insert into public.ingest_batches(batch_id,producer,dataset) values($1,$2,$3)`,[id,producer,dataset]);return id;};
/** issuer_securities row with source 'test' (so the default method is first_observed) plus `extra` columns. */
const sec=(iss:string,t:string,from:string,to:string|null,extra:Record<string,unknown>={})=>insertRow('issuer_securities',{issuer_id:iss,ticker:t,valid_from:from,valid_to:to,source:'test',...extra});

beforeAll(async()=>{
 if(!enabled)return;
 adminUrl=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8')).adminUrl;
 admin=new Pool({connectionString:adminUrl});
});
afterAll(async()=>{await admin?.end();});

describe.skipIf(!enabled)('plan 3 migration one: schema',()=>{
 it('adds the columns, creates seven service-role-only tables and the reconcile-raw bucket, and replays twice',async()=>{
  const cols=await q(`select table_name,column_name from information_schema.columns where table_schema='public' and (table_name,column_name) in (
   ('issuer_securities','valid_from_method'),('issuer_securities','valid_to_method'),
   ('issuer_identifier_claims','op'),('issuer_identifier_claims','target_key'),('issuer_identifier_claims','detail'),('issuer_identifier_claims','resolved_by'),('issuer_identifier_claims','resolved_at'),
   ('dq_reconciliations','pair'),('dq_reconciliations','kind'),('dq_reconciliations','outcome'),('dq_reconciliations','detail'),
   ('dq_reconciliations','cycle_id'),('dq_reconciliations','issuer_id'),('dq_reconciliations','market'),('dq_reconciliations','attempt'))`);
  expect(cols).toHaveLength(15);
  expect(await q(`select is_nullable from information_schema.columns where table_schema='public' and table_name='issuer_identifier_claims' and column_name='confidence'`)).toEqual([{is_nullable:'YES'}]);
  const rls=await q(`select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1) order by c.relname`,[NEW_TABLES]);
  expect(rls).toEqual([...NEW_TABLES].sort().map(relname=>({relname,relrowsecurity:true})));
  expect(await q(`select tablename from pg_policies where schemaname='public' and tablename=any($1)`,[NEW_TABLES])).toEqual([]);
  for(const role of ['anon','authenticated'])for(const t of [...NEW_TABLES,'issuer_identifier_claims'])for(const priv of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']){
   const ok=(await q(`select has_table_privilege($1,'public.'||$2,$3) ok`,[role,t,priv]))[0].ok;
   expect({role,t,priv,ok}).toEqual({role,t,priv,ok:false});
  }
  const SERVICE:Record<string,string[]>={
   dq_reconcile_cycles:['SELECT','INSERT','UPDATE'],dq_reconcile_cursor:['SELECT','INSERT'],
   dq_calendar_passes:['SELECT'],dq_calendar_pass_members:['SELECT'],dq_filing_expectations:['SELECT'],
   issuer_filer_categories:['SELECT','INSERT','UPDATE','DELETE'],issuer_filing_profiles:['SELECT','INSERT','UPDATE','DELETE'],
  };
  for(const [t,granted] of Object.entries(SERVICE))for(const priv of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']){
   const ok=(await q(`select has_table_privilege('service_role','public.'||$1,$2) ok`,[t,priv]))[0].ok;
   expect({t,priv,ok}).toEqual({t,priv,ok:granted.includes(priv)});
  }
  const c=await admin.connect();
  try{
   await c.query('set role anon');
   await expect(c.query('select * from public.dq_filing_expectations')).rejects.toThrow(/permission denied/);
  }finally{await c.query('reset role').catch(()=>{});c.release();}
  expect(await q(`select id,public,file_size_limit::text limit_bytes,allowed_mime_types from storage.buckets where id='reconcile-raw'`)).toEqual([{
   id:'reconcile-raw',public:false,limit_bytes:'52428800',
   allowed_mime_types:['application/json','text/html','application/pdf','text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/zip'],
  }]);
  // A private bucket with no storage.objects policy is unreadable and unwritable for anon/authenticated
  // on hosted Supabase; the migration must not add one (the local harness has no storage.objects).
  const sql=readFileSync(MIGRATION,'utf8');
  expect(sql).not.toMatch(/storage\.objects/);
  await replayMigration(admin,sql);
  await replayMigration(admin,sql);
 },120000);

 it('leaves evidence written after the first run untouched on replay',async()=>{
  const a=await issuer();const t=await ticker();const t2=await ticker();
  const prov={valid_from:{source:'stocks_universe.list_date',as_of:'2026-11-05'}};
  await sec(a,t,'2020-01-01',null,{valid_from_method:'listing_date',provenance:JSON.stringify(prov)});
  await sec(a,t2,'2010-01-01','2015-01-01',{valid_to_method:'delisting'});
  await replayMigration(admin,readFileSync(MIGRATION,'utf8'));
  expect(await q(`select ticker,valid_from_method,valid_to_method,provenance from public.issuer_securities where issuer_id=$1 order by valid_from`,[a])).toEqual([
   {ticker:t2,valid_from_method:'first_observed',valid_to_method:'delisting',provenance:{}},
   {ticker:t,valid_from_method:'listing_date',valid_to_method:null,provenance:prov},
  ]);
 },60000);

 it('upgrades a seeded pre-migration database once; a second run after new evidence rewrites nothing',async()=>{
  await withPreMigrationDatabase(adminUrl,VERSION,async db=>{
   const iss=randomUUID();
   await db.query(`insert into public.issuers(issuer_id,canonical_name_en) values($1,'ZZ Upgrade Co')`,[iss]);
   for(const t of ['ZZUPA','ZZUPB','ZZUPC','ZZUPD'])await db.query(`insert into public.stocks_universe(ticker,name,market) values($1,'Upgrade Test','US')`,[t]);
   const sec0=(t:string,from:string,to:string|null,source:string)=>db.query(`insert into public.issuer_securities(issuer_id,ticker,valid_from,valid_to,source) values($1,$2,$3,$4,$5)`,[iss,t,from,to,source]);
   await sec0('ZZUPA','2020-01-01',null,'curated');
   await sec0('ZZUPB','2010-01-01','2015-01-01','curated');
   await sec0('ZZUPC','2011-01-01','2016-01-01','sec_company_tickers_exchange');
   await sec0('ZZUPD','2021-01-01',null,'sec_company_tickers_exchange');
   const handled=randomUUID(),pending=randomUUID();
   // a claim handled by SQL before resolved_at existed (runbook §4), and a pending one
   await db.query(`insert into public.issuer_identifier_claims(id,issuer_id,id_type,value,source,confidence,status) values($1,$3,'lei','LEIUPGRADE0000000012','test',0.5,'accepted'),($2,$3,'cik','123','test',0.5,'pending')`,[handled,pending,iss]);
   const rec=randomUUID();
   await db.query(`insert into public.dq_reconciliations(id,dataset,left_source,right_source,natural_key,left_value,right_value,tolerance,passed) values($1,'legacy.test','a','b','k',1,2,0,false)`,[rec]);
   await db.query(`insert into public.dq_freshness(dataset,expected_cadence,status) values('legacy.test','daily','missing')`);
   const sql=readFileSync(MIGRATION,'utf8');
   await db.query(sql);                                                       // first upgrade: backfill runs
   const methods=async()=>(await db.query(`select ticker,valid_from_method,valid_to_method from public.issuer_securities where issuer_id=$1 order by ticker`,[iss])).rows;
   expect(await methods()).toEqual([
    {ticker:'ZZUPA',valid_from_method:'curated',valid_to_method:null},
    {ticker:'ZZUPB',valid_from_method:'curated',valid_to_method:'curated'},
    {ticker:'ZZUPC',valid_from_method:'first_observed',valid_to_method:'unrecorded'},
    {ticker:'ZZUPD',valid_from_method:'first_observed',valid_to_method:null},
   ]);
   const claims=async()=>(await db.query(`select id,op,target_key,detail,confidence::text conf,status,resolved_at from public.issuer_identifier_claims where issuer_id=$1 order by value`,[iss])).rows;
   expect(await claims()).toEqual([
    {id:pending,op:'legacy',target_key:'',detail:{},conf:'0.5',status:'pending',resolved_at:null},
    {id:handled,op:'legacy',target_key:'',detail:{},conf:'0.5',status:'accepted',resolved_at:null},
   ]);
   const recRow=async()=>(await db.query(`select pair,kind,outcome,detail,cycle_id from public.dq_reconciliations where id=$1`,[rec])).rows[0];
   expect(await recRow()).toEqual({pair:'legacy',kind:'numeric',outcome:'legacy',detail:{},cycle_id:null});
   // new evidence written between the two runs
   await db.query(`update public.issuer_securities set valid_from_method='listing_date',provenance=provenance||'{"valid_from":{"source":"stocks_universe.list_date","as_of":"2026-11-05"}}'::jsonb where ticker='ZZUPA'`);
   await db.query(`update public.issuer_securities set valid_to_method='delisting' where ticker='ZZUPC'`);
   await db.query(`update public.dq_reconciliations set outcome='compared' where id=$1`,[rec]);
   const fresh=randomUUID();
   await db.query(`insert into public.issuer_identifier_claims(id,issuer_id,id_type,value,source,status,op,target_key,detail) values($1,$2,'ticker','ZZUPA','test','pending','evidence_only',$3,'{"schema":"claim/1"}')`,[fresh,iss,`evidence_only:${iss}`]);
   await db.query(sql);                                                       // second run: guarded blocks skip the backfill
   expect(await methods()).toEqual([
    {ticker:'ZZUPA',valid_from_method:'listing_date',valid_to_method:null},
    {ticker:'ZZUPB',valid_from_method:'curated',valid_to_method:'curated'},
    {ticker:'ZZUPC',valid_from_method:'first_observed',valid_to_method:'delisting'},
    {ticker:'ZZUPD',valid_from_method:'first_observed',valid_to_method:null},
   ]);
   expect((await db.query(`select provenance from public.issuer_securities where ticker='ZZUPA'`)).rows[0].provenance).toEqual({valid_from:{source:'stocks_universe.list_date',as_of:'2026-11-05'}});
   expect((await recRow()).outcome).toBe('compared');
   expect((await db.query(`select op from public.issuer_identifier_claims where id=$1`,[fresh])).rows).toEqual([{op:'evidence_only'}]);
   await db.query(`insert into public.dq_freshness(dataset,expected_cadence,status) values('weekly.test','weekly','missing')`);
  });
 },240000);

 it('keeps valid_from_method=curated for a curated row written after the migration, across a replay',async()=>{
  const a=await issuer();const t=await ticker();
  await sec(a,t,'2020-01-01',null,{source:'curated',valid_from_method:'curated'});
  await replayMigration(admin,readFileSync(MIGRATION,'utf8'));
  expect(await q(`select valid_from_method from public.issuer_securities where issuer_id=$1`,[a])).toEqual([{valid_from_method:'curated'}]);
 });

 it('enforces the window-method checks and to_method_iff_to on issuer_securities',async()=>{
  const a=await issuer();const t=await ticker();
  expect((await fails(sec(a,t,'2020-01-01',null,{valid_from_method:'guessed'}))).message).toMatch(/issuer_securities_valid_from_method_check/);
  expect((await fails(sec(a,t,'2020-01-01','2021-01-01'))).message).toMatch(/issuer_securities_to_method_iff_to/);
  expect((await fails(sec(a,t,'2020-01-01',null,{valid_to_method:'delisting'}))).message).toMatch(/issuer_securities_to_method_iff_to/);
  expect((await fails(sec(a,t,'2020-01-01','2021-01-01',{valid_to_method:'vanished'}))).message).toMatch(/issuer_securities_valid_to_method_check/);
  await sec(a,t,'2020-01-01','2021-01-01',{valid_to_method:'sec_file_absent'});
  expect((await fails(q(`update public.issuer_securities set valid_to=null where issuer_id=$1 and ticker=$2`,[a,t]))).message).toMatch(/issuer_securities_to_method_iff_to/);
  await sec(a,t,'2021-01-01',null,{valid_from_method:'ticker_change'});
  expect(await q(`select valid_from::text,valid_from_method,valid_to_method from public.issuer_securities where ticker=$1 order by valid_from`,[t])).toEqual([
   {valid_from:'2020-01-01',valid_from_method:'first_observed',valid_to_method:'sec_file_absent'},
   {valid_from:'2021-01-01',valid_from_method:'ticker_change',valid_to_method:null},
  ]);
 });

 it('claims: ticker id_type, op check, detail object, nullable confidence, resolution invariant and the rebuilt pending key',async()=>{
  const a=await issuer();
  const claim=(over:Record<string,unknown>)=>insertRow('issuer_identifier_claims',{id:randomUUID(),issuer_id:a,id_type:'ticker',value:'ZZX',source:'test',status:'pending',op:'evidence_only',target_key:`evidence_only:${a}`,detail:'{}',...over});
  await claim({});
  expect((await fails(claim({}))).message).toMatch(/issuer_identifier_claims_pending_unique/);
  await claim({op:'attach_security',target_key:`attach_security:${a}`});              // same value, another op
  await claim({target_key:`evidence_only:${a}|ZZX|2020-01-01`});                        // same op, another target
  await claim({status:'rejected',resolved_by:randomUUID(),resolved_at:new Date().toISOString()});   // resolved rows may repeat
  expect((await fails(claim({id_type:'ric'}))).message).toMatch(/issuer_identifier_claims_id_type_check/);
  expect((await fails(claim({op:'merge',target_key:'merge:x'}))).message).toMatch(/issuer_identifier_claims_op_check/);
  expect((await fails(claim({value:'ZZY',detail:'[]'}))).message).toMatch(/issuer_identifier_claims_detail_object/);
  expect((await fails(claim({value:'ZZY',resolved_at:new Date().toISOString()}))).message).toMatch(/issuer_identifier_claims_pending_has_no_resolution/);
  expect((await fails(claim({value:'ZZY',target_key:''}))).message).toMatch(/issuer_identifier_claims_target_key_required/);
  expect((await fails(claim({value:'ZZY',target_key:'x'.repeat(257)}))).message).toMatch(/issuer_identifier_claims_target_key_check/);
  expect((await fails(claim({value:'ZZY',confidence:1.5}))).message).toMatch(/issuer_identifier_claims_confidence_check/);
  await claim({value:'ZZY',confidence:null});
  const legacy=randomUUID();
  await q(`insert into public.issuer_identifier_claims(id,issuer_id,id_type,value,source,confidence) values($1,$2,'lei','L1','test',0.5)`,[legacy,a]);
  expect(await q(`select op,target_key,detail,status from public.issuer_identifier_claims where id=$1`,[legacy])).toEqual([{op:'legacy',target_key:'',detail:{},status:'pending'}]);
 });

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
  await bad({upstream_lookup:'ok',disclosure_state:'pending',received_filing_id:randomUUID()},/dfe_received_pair/);   // filing without a date
  await bad({upstream_lookup:'ok',disclosure_state:'pending',received_date:'2027-02-01'},/dfe_received_pair/);       // date without a filing
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

// ================================================================ Task 1b: functions and topology guard
const REVIEWER=randomUUID();
const EVIDENCE={source:'test',as_of:'2026-11-05',evidence_sha256:SHA,locator:'row:1'};
const randomLei=()=>hex(9)+'12';                         // matches the issuers.lei format check
const randomIsin=()=>'ZZ'+hex(5).slice(0,9)+'7';         // matches the issuer_securities.isin format check
const randomFigi=()=>'BBG'+hex(5).slice(0,9);
const randomCik=()=>String(1+Math.floor(Math.random()*9))+String(Math.floor(Math.random()*1e9)).padStart(9,'0');
/** claims.ts::claimTargetKey */
const targetKey=(op:string,t:Record<string,string>)=>t.ticker!==undefined?`${op}:${t.issuer_id}|${t.ticker}|${t.valid_from}`:`${op}:${t.issuer_id}`;
async function newClaim(c:{issuer:string;id_type:string;value:string;op:string;target:Record<string,string>;params?:Record<string,unknown>;over?:Record<string,unknown>;target_key?:string}):Promise<string>{
 const id=randomUUID();
 const detail={schema:'claim/1',evidence_kind:'hard_identifier',target:c.target,params:c.params??{},evidence:EVIDENCE,sources:[],...c.over};
 await insertRow('issuer_identifier_claims',{id,issuer_id:c.issuer,id_type:c.id_type,value:c.value,source:'test',status:'pending',op:c.op,target_key:c.target_key??targetKey(c.op,c.target),detail:JSON.stringify(detail)});
 return id;
}
const resolve=async(id:string,status:string,amend:unknown=null,by:string|null=REVIEWER,on:Pool|PoolClient=admin)=>
 (await on.query(`select public.resolve_identifier_claim($1,$2,$3,$4::jsonb) v`,[id,status,by,amend===null?null:JSON.stringify(amend)])).rows[0].v;
const claimState=async(id:string)=>(await q(`select status,op,value,resolved_by,(resolved_at is not null) resolved from public.issuer_identifier_claims where id=$1`,[id]))[0];
/** Topology changes in fixtures switch the transaction-local setting on, as set_merge/set_dissolved do. */
const topo=async(sql:string,params:unknown[]=[])=>{
 const c=await admin.connect();
 try{
  await c.query('begin');
  await c.query(`select set_config('entities.allow_topology_write','on',true)`);
  await c.query(sql,params);
  await c.query('commit');
 }catch(e){await c.query('rollback').catch(()=>{});throw e;}
 finally{c.release();}
};
/** Runs body inside one transaction on its own connection (pid known); rolls back only if still open. */
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
/** Deterministic "is blocked": polls (20 ms, <= 3 s) until some backend waits on `pid`, then asserts p is still pending. */
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

describe.skipIf(!enabled)('plan 3 migration one: resolve_identifier_claim',()=>{
 it('set_identifier on an issuer column writes value and provenance under the null guard; conflicts roll back',async()=>{
  const a=await issuer();const lei=randomLei();
  const pw={lei:{source:'gleif',as_of:'2026-11-05',evidence_sha256:SHA}};
  const id=await newClaim({issuer:a,id_type:'lei',value:lei,op:'set_identifier',target:{issuer_id:a},over:{provenance_written:pw}});
  expect(await resolve(id,'accepted')).toEqual({op:'set_identifier',applied:true,amended:false});
  expect(await q(`select lei,provenance from public.issuers where issuer_id=$1`,[a])).toEqual([{lei,provenance:pw}]);
  expect(await claimState(id)).toEqual({status:'accepted',op:'set_identifier',value:lei,resolved_by:REVIEWER,resolved:true});
  // the column is no longer null: a second set conflicts and nothing changes
  const again=await newClaim({issuer:a,id_type:'lei',value:randomLei(),op:'set_identifier',target:{issuer_id:a}});
  expect((await fails(resolve(again,'accepted'))).message).toBe('value_conflict');
  expect(await claimState(again)).toMatchObject({status:'pending',resolved:false});
  expect(await q(`select lei from public.issuers where issuer_id=$1`,[a])).toEqual([{lei}]);
  // another issuer holding the value (unique index) is value_conflict too
  const b=await issuer();
  const stolen=await newClaim({issuer:b,id_type:'lei',value:lei,op:'set_identifier',target:{issuer_id:b}});
  expect((await fails(resolve(stolen,'accepted'))).message).toBe('value_conflict');
  expect(await q(`select lei from public.issuers where issuer_id=$1`,[b])).toEqual([{lei:null}]);
  // without provenance_written the claim's evidence becomes the provenance entry
  const cik=randomCik();
  await resolve(await newClaim({issuer:b,id_type:'cik',value:cik,op:'set_identifier',target:{issuer_id:b}}),'accepted');
  expect(await q(`select cik,provenance->'cik' p from public.issuers where issuer_id=$1`,[b])).toEqual([{cik,p:EVIDENCE}]);
  // correct_identifier needs the current value to still match
  const lei2=randomLei();
  const stale=await newClaim({issuer:a,id_type:'lei',value:lei2,op:'correct_identifier',target:{issuer_id:a},params:{expected_current:randomLei(),new_value:lei2}});
  expect((await fails(resolve(stale,'accepted'))).message).toBe('value_conflict');
  await resolve(stale,'rejected');                       // the failed claim stays pending; clear it so the same-key correction can be filed
  const fix=await newClaim({issuer:a,id_type:'lei',value:lei2,op:'correct_identifier',target:{issuer_id:a},params:{expected_current:lei,new_value:lei2}});
  expect(await resolve(fix,'accepted')).toEqual({op:'correct_identifier',applied:true,amended:false});
  expect(await q(`select lei from public.issuers where issuer_id=$1`,[a])).toEqual([{lei:lei2}]);
 });

 it('set/correct_identifier on a security row: ISIN and FIGI under row guards; an ISIN held elsewhere is ownership_conflict',async()=>{
  const a=await issuer(),b=await issuer();const t=await ticker(),t2=await ticker();
  await sec(a,t,'2020-01-01',null);
  const isin=randomIsin();
  const target={issuer_id:a,ticker:t,valid_from:'2020-01-01'};
  expect(await resolve(await newClaim({issuer:a,id_type:'isin',value:isin,op:'set_identifier',target}),'accepted')).toEqual({op:'set_identifier',applied:true,amended:false});
  expect(await q(`select isin,provenance->'isin' p from public.issuer_securities where ticker=$1`,[t])).toEqual([{isin,p:EVIDENCE}]);
  // the same ISIN on another open row (any issuer) violates the ISIN no-overlap exclusion
  await sec(b,t2,'2021-01-01',null);
  const dup=await newClaim({issuer:b,id_type:'isin',value:isin,op:'set_identifier',target:{issuer_id:b,ticker:t2,valid_from:'2021-01-01'}});
  expect((await fails(resolve(dup,'accepted'))).message).toBe('ownership_conflict');
  expect(await q(`select isin from public.issuer_securities where ticker=$1`,[t2])).toEqual([{isin:null}]);
  expect(await claimState(dup)).toMatchObject({status:'pending',resolved:false});
  // FIGI: set, then correct only while expected_current still matches
  const [f1,f2,f3]=[randomFigi(),randomFigi(),randomFigi()];
  await resolve(await newClaim({issuer:a,id_type:'figi',value:f1,op:'set_identifier',target}),'accepted');
  const stale=await newClaim({issuer:a,id_type:'figi',value:f3,op:'correct_identifier',target,params:{expected_current:f2,new_value:f3}});
  expect((await fails(resolve(stale,'accepted'))).message).toBe('value_conflict');
  const fix=await newClaim({issuer:a,id_type:'figi',value:f2,op:'correct_identifier',target,params:{expected_current:f1,new_value:f2}});
  expect(await resolve(fix,'accepted')).toMatchObject({op:'correct_identifier',applied:true});
  expect(await q(`select figi from public.issuer_securities where ticker=$1`,[t])).toEqual([{figi:f2}]);
  // a target row that does not exist matches nothing → value_conflict
  const ghost=await newClaim({issuer:a,id_type:'figi',value:randomFigi(),op:'set_identifier',target:{issuer_id:a,ticker:t,valid_from:'1999-01-01'}});
  expect((await fails(resolve(ghost,'accepted'))).message).toBe('value_conflict');
 });

 it('attach_security inserts the open row with its method and provenance; a held ticker is ownership_conflict',async()=>{
  const a=await issuer(),b=await issuer();const t=await ticker();
  const params={share_class:'H',valid_from:'2004-06-16',valid_from_method:'listing_date',source:'gleif_openfigi',isin:randomIsin()};
  const id=await newClaim({issuer:a,id_type:'ticker',value:t,op:'attach_security',target:{issuer_id:a},params,over:{evidence_kind:'name_match'}});
  expect(await resolve(id,'accepted')).toEqual({op:'attach_security',applied:true,amended:false});
  expect(await q(`select issuer_id,share_class,valid_from::text,valid_to,valid_from_method,valid_to_method,source,isin,is_primary,provenance from public.issuer_securities where ticker=$1`,[t])).toEqual([
   {issuer_id:a,share_class:'H',valid_from:'2004-06-16',valid_to:null,valid_from_method:'listing_date',valid_to_method:null,source:'gleif_openfigi',isin:params.isin,is_primary:false,provenance:{valid_from:EVIDENCE}},
  ]);
  const held=await newClaim({issuer:b,id_type:'ticker',value:t,op:'attach_security',target:{issuer_id:b},params:{...params,isin:null,valid_from:'2026-01-01'}});
  expect((await fails(resolve(held,'accepted'))).message).toBe('ownership_conflict');
  expect(await claimState(held)).toMatchObject({status:'pending',resolved:false});
 });

 it('close_security closes an open row once; a second close is already_closed',async()=>{
  const a=await issuer();const t=await ticker();
  await sec(a,t,'2020-01-01',null);
  const target={issuer_id:a,ticker:t,valid_from:'2020-01-01'};
  const first=await newClaim({issuer:a,id_type:'ticker',value:t,op:'close_security',target,params:{valid_to:'2026-03-01',valid_to_method:'delisting'},over:{evidence_kind:'filing_form'}});
  expect(await resolve(first,'accepted')).toEqual({op:'close_security',applied:true,amended:false});
  expect(await q(`select valid_to::text,valid_to_method,provenance->'valid_to' p from public.issuer_securities where ticker=$1`,[t])).toEqual([{valid_to:'2026-03-01',valid_to_method:'delisting',p:EVIDENCE}]);
  const again=await newClaim({issuer:a,id_type:'ticker',value:t,op:'close_security',target,params:{valid_to:'2026-04-01',valid_to_method:'curated'}});
  expect((await fails(resolve(again,'accepted'))).message).toBe('already_closed');
  expect(await claimState(again)).toMatchObject({status:'pending'});
 });

 it('backdate_window moves valid_from under the old-value guard; an overlap is ownership_conflict',async()=>{
  const a=await issuer(),b=await issuer();const t=await ticker();
  await sec(b,t,'2000-01-01','2005-01-01',{valid_to_method:'curated'});
  await sec(a,t,'2010-01-01',null);
  const target={issuer_id:a,ticker:t,valid_from:'2010-01-01'};
  const ok=await newClaim({issuer:a,id_type:'ticker',value:t,op:'backdate_window',target,params:{new_valid_from:'2006-03-01',valid_from_method:'listing_date'}});
  expect(await resolve(ok,'accepted')).toEqual({op:'backdate_window',applied:true,amended:false});
  expect(await q(`select valid_from::text,valid_from_method,provenance->'valid_from' p from public.issuer_securities where issuer_id=$1 and ticker=$2`,[a,t])).toEqual([{valid_from:'2006-03-01',valid_from_method:'listing_date',p:EVIDENCE}]);
  // the old valid_from is gone → value_conflict
  const stale=await newClaim({issuer:a,id_type:'ticker',value:t,op:'backdate_window',target,params:{new_valid_from:'2007-01-01',valid_from_method:'curated'}});
  expect((await fails(resolve(stale,'accepted'))).message).toBe('value_conflict');
  // moving into b's closed window [2000,2005) → no-overlap exclusion → ownership_conflict, nothing moves
  const over=await newClaim({issuer:a,id_type:'ticker',value:t,op:'backdate_window',target:{issuer_id:a,ticker:t,valid_from:'2006-03-01'},params:{new_valid_from:'2004-01-01',valid_from_method:'curated'}});
  expect((await fails(resolve(over,'accepted'))).message).toBe('ownership_conflict');
  expect(await q(`select valid_from::text from public.issuer_securities where issuer_id=$1 and ticker=$2`,[a,t])).toEqual([{valid_from:'2006-03-01'}]);
 });

 it('evidence_only needs an amend to be accepted; the amend rewrites the claim and keeps the original',async()=>{
  const a=await issuer();const t=await ticker();
  await sec(a,t,'2020-01-01',null);
  const params={suggested_op:'close_security',accession:'0001234567-26-000001',form:'25-NSE',filing_date:'2026-02-20',note:'Rule 12d2-2(d): delisting effective 10 days after filing; check the class named in the form'};
  const evidenceClaim=()=>newClaim({issuer:a,id_type:'ticker',value:t,op:'evidence_only',target:{issuer_id:a},params,over:{evidence_kind:'filing_form'}});
  const first=await evidenceClaim();
  expect((await fails(resolve(first,'accepted'))).message).toBe('amend_required');
  expect(await resolve(first,'rejected')).toEqual({op:'evidence_only',applied:false,amended:false});
  expect(await claimState(first)).toEqual({status:'rejected',op:'evidence_only',value:t,resolved_by:REVIEWER,resolved:true});
  const second=await evidenceClaim();
  const amend={op:'close_security',target:{issuer_id:a,ticker:t,valid_from:'2020-01-01'},params:{valid_to:'2026-03-02',valid_to_method:'delisting'}};
  expect(await resolve(second,'accepted',amend)).toEqual({op:'close_security',applied:true,amended:true});
  const row=(await q(`select op,value,target_key,detail from public.issuer_identifier_claims where id=$1`,[second]))[0];
  expect(row.op).toBe('close_security');
  expect(row.value).toBe(t);
  expect(row.target_key).toBe(`close_security:${a}|${t}|2020-01-01`);
  expect(row.detail).toMatchObject({target:amend.target,params:amend.params,original_op:'evidence_only',original_params:params,original_target:{issuer_id:a},amended_by:REVIEWER});
  expect(typeof row.detail.amended_at).toBe('string');
  expect(await q(`select valid_to::text,valid_to_method from public.issuer_securities where ticker=$1`,[t])).toEqual([{valid_to:'2026-03-02',valid_to_method:'delisting'}]);
  // an amend on another op, to a non-ticker op, or one that fails the claim/1 check is invalid_claim
  const other=await newClaim({issuer:a,id_type:'lei',value:randomLei(),op:'set_identifier',target:{issuer_id:a}});
  expect((await fails(resolve(other,'accepted',amend))).message).toBe('invalid_claim');
  const third=await evidenceClaim();
  expect((await fails(resolve(third,'accepted',{op:'set_identifier',target:{issuer_id:a},params:{}}))).message).toBe('invalid_claim');
  expect((await fails(resolve(third,'accepted',{...amend,params:{valid_to:'2019-01-01',valid_to_method:'delisting'}}))).message).toBe('invalid_claim');
  expect(await claimState(third)).toMatchObject({status:'pending',op:'evidence_only'});
 });

 it('refuses resolved, legacy, malformed, mismatched, inactive and unknown claims, leaving them pending',async()=>{
  const a=await issuer(),b=await issuer();
  const done=await newClaim({issuer:a,id_type:'lei',value:randomLei(),op:'set_identifier',target:{issuer_id:a}});
  await resolve(done,'rejected');
  expect((await fails(resolve(done,'accepted'))).message).toBe('already_resolved');
  const legacy=randomUUID();
  await q(`insert into public.issuer_identifier_claims(id,issuer_id,id_type,value,source,confidence) values($1,$2,'lei',$3,'test',0.5)`,[legacy,a,randomLei()]);
  expect((await fails(resolve(legacy,'rejected'))).message).toBe('legacy_claim');
  const mismatch=await newClaim({issuer:a,id_type:'lei',value:randomLei(),op:'set_identifier',target:{issuer_id:b},target_key:`set_identifier:${a}`});
  const pairing=await newClaim({issuer:a,id_type:'lei',value:randomLei(),op:'attach_security',target:{issuer_id:a},params:{share_class:'A',valid_from:'2020-01-01',valid_from_method:'listing_date',source:'x'}});
  const foreignProv=await newClaim({issuer:a,id_type:'lei',value:randomLei(),op:'set_identifier',target:{issuer_id:a},over:{provenance_written:{cik:{source:'x'}}}});
  const wrongKey=await newClaim({issuer:a,id_type:'lei',value:randomLei(),op:'set_identifier',target:{issuer_id:a},target_key:`set_identifier:${b}`});
  const badDate=await newClaim({issuer:a,id_type:'lei',value:randomLei(),op:'set_identifier',target:{issuer_id:a},over:{evidence:{...EVIDENCE,as_of:'2026-02-30'}}});
  const extraParam=await newClaim({issuer:a,id_type:'lei',value:randomLei(),op:'set_identifier',target:{issuer_id:a},params:{expected_current:'x'}});
  for(const id of [mismatch,pairing,foreignProv,wrongKey,badDate,extraParam])expect({id,msg:(await fails(resolve(id,'accepted'))).message}).toEqual({id,msg:'invalid_claim'});
  expect((await fails(resolve(badDate,'maybe'))).message).toBe('invalid_claim');
  expect((await fails(resolve(badDate,'accepted',null,null))).message).toBe('invalid_claim');
  expect((await fails(resolve(randomUUID(),'accepted'))).message).toBe('claim_not_found');
  for(const id of [mismatch,pairing,foreignProv,wrongKey,badDate,extraParam])expect(await claimState(id)).toMatchObject({status:'pending',resolved:false});
  // a dissolved issuer cannot take writes, but its claims can still be rejected
  const gone=await issuer();
  const late=await newClaim({issuer:gone,id_type:'lei',value:randomLei(),op:'set_identifier',target:{issuer_id:gone}});
  await topo(`update public.issuers set status='dissolved' where issuer_id=$1`,[gone]);
  expect((await fails(resolve(late,'accepted'))).message).toBe('issuer_not_active');
  expect(await resolve(late,'rejected')).toEqual({op:'set_identifier',applied:false,amended:false});
 });

 it('serialises concurrent resolutions on the claim row: the second waits, then sees already_resolved',async()=>{
  const a=await issuer();
  const id=await newClaim({issuer:a,id_type:'lei',value:randomLei(),op:'set_identifier',target:{issuer_id:a}});
  await inTx(admin,async tx=>{
   expect(await resolve(id,'accepted',null,REVIEWER,tx.c)).toMatchObject({applied:true});
   const second=fails(resolve(id,'rejected'));
   await stillBlockedBehind(admin,tx.pid,second);
   await tx.commit();
   expect((await second).message).toBe('already_resolved');
  });
  expect(await claimState(id)).toMatchObject({status:'accepted'});
 });

 it('grants the functions to service_role only, keeps the helpers private and has one replace_filing_expectations signature',async()=>{
  const FNS=['public.resolve_identifier_claim(uuid,text,uuid,jsonb)','public.replace_filing_expectations(uuid,text,jsonb,jsonb)','public.claim_calendar_pass(text,uuid)','public.fail_calendar_member(jsonb,uuid,text)','public.finish_calendar_pass(jsonb)',
   'public.append_claim_evidence(uuid,text,text,text,text,jsonb)','public.patch_quarantine_detail(uuid,text,jsonb)','public.set_security_identifier(uuid,text,date,text,text,jsonb)'];
  const HELPERS=['public.claim_text_is_date(text)','public.claim_keys_within(jsonb,text[])','public.claim_evidence_ok(jsonb)','public.identifier_claim_target_key(text,jsonb)','public.identifier_claim_problem(text,text,text,uuid,jsonb)','public.dq_calendar_lock_pass(jsonb)'];
  for(const fn of [...FNS,...HELPERS])for(const role of ['anon','authenticated','service_role']){
   const ok=(await q(`select has_function_privilege($1,$2,'EXECUTE') ok`,[role,fn]))[0].ok;
   expect({fn,role,ok}).toEqual({fn,role,ok:role==='service_role'&&FNS.includes(fn)});
  }
  expect(await q(`select count(*)::int n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname='replace_filing_expectations'`)).toEqual([{n:1}]);
  const a=await issuer();
  const id=await newClaim({issuer:a,id_type:'lei',value:randomLei(),op:'set_identifier',target:{issuer_id:a}});
  const c=await admin.connect();
  try{
   await c.query('set role authenticated');
   await expect(c.query(`select public.resolve_identifier_claim($1,'accepted',$2)`,[id,REVIEWER])).rejects.toThrow(/permission denied/);
   await c.query('reset role');
   await c.query('set role service_role');
   expect(await resolve(id,'rejected',null,REVIEWER,c)).toEqual({op:'set_identifier',applied:false,amended:false});
  }finally{await c.query('reset role').catch(()=>{});c.release();}
 });
});

describe.skipIf(!enabled)('plan 3 migration one: issuers_topology_guard',()=>{
 it('rejects a direct merge, dissolution or re-point on a brand-new connection where the setting was never defined',async()=>{
  const a=await issuer(),b=await issuer();
  const fresh=new Pool({connectionString:adminUrl,max:1});
  try{
   const c=await fresh.connect();
   try{
    expect((await c.query(`select current_setting('entities.allow_topology_write',true) v`)).rows[0].v).toBeNull();
    expect(await fails(c.query(`update public.issuers set status='merged',merged_into=$2 where issuer_id=$1`,[a,b]))).toMatchObject({message:'topology_write_forbidden',code:'23514'});
    expect((await fails(c.query(`update public.issuers set status='dissolved' where issuer_id=$1`,[a]))).message).toBe('topology_write_forbidden');
    expect((await fails(c.query(`update public.issuers set merged_into=$2 where issuer_id=$1`,[a,b]))).message).toBe('topology_write_forbidden');
   }finally{c.release();}
  }finally{await fresh.end();}
  expect(await q(`select status,merged_into from public.issuers where issuer_id=$1`,[a])).toEqual([{status:'active',merged_into:null}]);
 });

 it("still rejects on a connection whose earlier transaction switched the setting on locally ('' after commit)",async()=>{
  const a=await issuer(),b=await issuer();
  const c=await admin.connect();
  try{
   await c.query('begin');
   await c.query(`select set_config('entities.allow_topology_write','on',true)`);
   await c.query('commit');
   expect((await c.query(`select current_setting('entities.allow_topology_write',true) v`)).rows[0].v).toBe('');
   expect((await fails(c.query(`update public.issuers set status='merged',merged_into=$2 where issuer_id=$1`,[a,b]))).message).toBe('topology_write_forbidden');
  }finally{c.release();}
 });

 it('lets a transaction with the setting on change topology, with the plan-1 lifecycle triggers still enforced',async()=>{
  const a=await issuer(),b=await issuer(),dead=await issuer();
  await topo(`update public.issuers set status='dissolved' where issuer_id=$1`,[dead]);
  expect((await fails(topo(`update public.issuers set status='merged',merged_into=$2 where issuer_id=$1`,[a,dead]))).message).toMatch(/merge_target_not_active/);
  await topo(`update public.issuers set status='merged',merged_into=$2 where issuer_id=$1`,[a,b]);
  expect(await q(`select status,merged_into from public.issuers where issuer_id=$1`,[a])).toEqual([{status:'merged',merged_into:b}]);
 });

 it('leaves non-topology updates, same-value writes and active inserts alone; an insert born merged/dissolved needs the setting (接口对齐记录 #7)',async()=>{
  const a=await issuer(),b=await issuer();
  await q(`update public.issuers set canonical_name_en='ZZ Renamed' where issuer_id=$1`,[a]);
  await q(`update public.issuers set status='active',merged_into=null where issuer_id=$1`,[a]);   // unchanged values: the guard skips them
  expect(await q(`select canonical_name_en,status from public.issuers where issuer_id=$1`,[a])).toEqual([{canonical_name_en:'ZZ Renamed',status:'active'}]);
  await q(`insert into public.issuers(issuer_id,canonical_name_en) values($1,'ZZ Born Active')`,[randomUUID()]);   // status active, merged_into null: not guarded
  expect(await fails(q(`insert into public.issuers(issuer_id,canonical_name_en,status,merged_into) values($1,'ZZ Born Merged','merged',$2)`,[randomUUID(),b]))).toMatchObject({message:'topology_write_forbidden',code:'23514'});
  expect((await fails(q(`insert into public.issuers(issuer_id,canonical_name_en,status) values($1,'ZZ Born Dissolved','dissolved')`,[randomUUID()]))).message).toBe('topology_write_forbidden');
  const born=randomUUID();
  await topo(`insert into public.issuers(issuer_id,canonical_name_en,status,merged_into) values($1,'ZZ Born Merged','merged',$2)`,[born,b]);
  expect(await q(`select status,merged_into from public.issuers where issuer_id=$1`,[born])).toEqual([{status:'merged',merged_into:b}]);
 });
});

describe.skipIf(!enabled)('plan 3 migration one: calendar pass functions',()=>{
 const CAL='CN';
 type Token={market:string;pass_id:string;batch_id:string};
 // next_due_at far in the future: no facts sync in another suite ever picks these scope rows up
 const scopeRow=(iss:string)=>q(`insert into public.fact_sync_scope(issuer_id,market,reasons,priority,fetch_key,next_due_at) values($1,$2,'["test"]',5,'df3cal','2999-01-01') on conflict (issuer_id,market) do update set priority=5`,[iss,CAL]);
 const claimPass=async(b:string)=>(await q(`select public.claim_calendar_pass($1,$2) v`,[CAL,b]))[0].v as Token|null;
 const replace=async(tok:unknown,iss:string,rows:unknown,market=CAL)=>(await q(`select public.replace_filing_expectations($1,$2,$3::jsonb,$4::jsonb) v`,[iss,market,JSON.stringify(rows),JSON.stringify(tok)]))[0].v as number;
 const failMember=(tok:unknown,iss:string,err='boom')=>q(`select public.fail_calendar_member($1::jsonb,$2,$3)`,[JSON.stringify(tok),iss,err]);
 const finish=async(tok:unknown)=>(await q(`select public.finish_calendar_pass($1::jsonb) v`,[JSON.stringify(tok)]))[0].v as string;
 const members=(passId:string)=>q(`select issuer_id,state,attempts,last_error from public.dq_calendar_pass_members where market=$1 and pass_id=$2 order by issuer_id`,[CAL,passId]);
 const member=async(passId:string,iss:string)=>(await members(passId)).find(m=>m.issuer_id===iss);
 /** In-scope issuers other suites created are members too: settle them with an empty replacement. */
 const drain=async(tok:Token,except:string[]=[])=>{for(const m of await members(tok.pass_id))if(m.state==='pending'&&!except.includes(m.issuer_id))await replace(tok,m.issuer_id,[]);};
 const expRow=(over:Record<string,unknown>={})=>({report_kind:'annual',period_end:'2025-12-31',period_end_estimated:false,deadline_state:'statutory',due_date:'2026-04-30',due_rule:'cn.annual.4m',expected_date:null,upstream_lookup:'ok',upstream_filed_date:null,disclosure_state:'pending',received_filing_id:null,received_date:null,profile_as_of:null,detail:{},...over});

 it('creates one pass per market, freezes the in-scope members and leases it to one worker',async()=>{
  await withCalendarLock(admin,async()=>{
   const i1=await issuer(),i2=await issuer();await scopeRow(i1);await scopeRow(i2);
   const b1=await batch(),b2=await batch();
   const tok=(await claimPass(b1))!;
   expect(tok).toEqual({market:CAL,pass_id:expect.any(String),batch_id:b1});
   for(const i of [i1,i2])expect(await member(tok.pass_id,i)).toMatchObject({state:'pending',attempts:0});
   expect(await claimPass(b2)).toBeNull();                                  // leased to b1
   expect((await claimPass(b1))!.pass_id).toBe(tok.pass_id);                // the holder renews its own lease
   expect(await q(`select (claim_until > clock_timestamp() + interval '9 minutes') fresh from public.dq_calendar_passes where market=$1 and pass_id=$2`,[CAL,tok.pass_id])).toEqual([{fresh:true}]);
   const i3=await issuer();await scopeRow(i3);
   expect(await member(tok.pass_id,i3)).toBeUndefined();                    // frozen: scope changes wait for the next pass
   await drain(tok);
   expect(await finish(tok)).toBe('complete');
   const next=(await claimPass(b2))!;
   expect(next.pass_id).not.toBe(tok.pass_id);
   for(const i of [i1,i2,i3])expect(await member(next.pass_id,i)).toMatchObject({state:'pending'});
   await drain(next);await finish(next);
  });
 },60000);

 it('lets exactly one of two concurrent claimers create and lease the pass (advisory lock)',async()=>{
  await withCalendarLock(admin,async()=>{
   const i=await issuer();await scopeRow(i);
   const b1=await batch(),b2=await batch();
   const got=await Promise.all([claimPass(b1),claimPass(b2)]);
   expect(got.filter(Boolean)).toHaveLength(1);
   expect(await q(`select count(*)::int n from public.dq_calendar_passes where market=$1 and finished_at is null`,[CAL])).toEqual([{n:1}]);
   const tok=(got[0]??got[1])!;
   await drain(tok);await finish(tok);
  });
 });

 it("replace_filing_expectations swaps an issuer's rows atomically under the fence and marks the member done once",async()=>{
  await withCalendarLock(admin,async()=>{
   const i=await issuer(),j=await issuer();await scopeRow(i);await scopeRow(j);
   const b=await batch();
   const tok=(await claimPass(b))!;
   expect(await replace(tok,i,[expRow(),expRow({report_kind:'semiannual',period_end:'2025-06-30',due_date:'2025-08-31',due_rule:'cn.semiannual.2m'})])).toBe(2);
   expect(await q(`select report_kind,period_end::text,batch_id from public.dq_filing_expectations where issuer_id=$1 and market=$2 order by period_end`,[i,CAL])).toEqual([
    {report_kind:'semiannual',period_end:'2025-06-30',batch_id:b},{report_kind:'annual',period_end:'2025-12-31',batch_id:b}]);
   expect(await member(tok.pass_id,i)).toMatchObject({state:'done',attempts:0});
   expect((await fails(replace(tok,i,[expRow()]))).message).toBe('member_not_claimable');        // done is final within a pass
   // invalid rows write nothing and keep the member pending
   expect((await fails(replace(tok,j,[expRow({deadline_state:'no_rule'})]))).message).toBe('invalid_rows');   // dfe_due_iff_known
   expect((await fails(replace(tok,j,[{...expRow(),issuer_id:i}]))).message).toBe('invalid_rows');            // a row for another issuer
   expect((await fails(replace(tok,j,[expRow(),expRow()]))).message).toBe('invalid_rows');                    // duplicate key in one call
   expect((await fails(replace(tok,j,{}))).message).toBe('invalid_rows');                                     // not an array
   expect(await q(`select count(*)::int n from public.dq_filing_expectations where issuer_id=$1`,[j])).toEqual([{n:0}]);
   expect(await member(tok.pass_id,j)).toMatchObject({state:'pending'});
   // not a member; another market in the call; a token naming another batch; a malformed token
   expect((await fails(replace(tok,await issuer(),[]))).message).toBe('member_not_claimable');
   expect((await fails(replace(tok,j,[],'US'))).message).toBe('fence_failed');
   expect((await fails(replace({...tok,batch_id:randomUUID()},j,[expRow()]))).message).toBe('fence_failed');
   expect((await fails(replace({market:CAL},j,[expRow()]))).message).toBe('fence_failed');
   await drain(tok);
   expect(await finish(tok)).toBe('complete');
   // the next pass replaces the whole set for the issuer
   const tok2=(await claimPass(b))!;
   expect(await replace(tok2,i,[expRow({report_kind:'semiannual',period_end:'2026-06-30',due_date:'2026-08-31',due_rule:'cn.semiannual.2m'})])).toBe(1);
   expect(await q(`select period_end::text from public.dq_filing_expectations where issuer_id=$1`,[i])).toEqual([{period_end:'2026-06-30'}]);
   await drain(tok2);await finish(tok2);
  });
 },60000);

 it('fail_calendar_member retries up to three attempts; finish_calendar_pass settles only from persisted state',async()=>{
  await withCalendarLock(admin,async()=>{
   const i=await issuer(),k=await issuer();await scopeRow(i);await scopeRow(k);
   const b=await batch();const tok=(await claimPass(b))!;
   await drain(tok,[i,k]);
   await failMember(tok,i,'sec_unavailable');
   expect(await member(tok.pass_id,i)).toMatchObject({state:'failed',attempts:1,last_error:'sec_unavailable'});
   expect((await fails(finish(tok))).message).toBe('pass_incomplete');      // i may still be retried, k is pending
   expect(await replace(tok,i,[expRow()])).toBe(1);                          // a retry that succeeds is simply done
   expect(await member(tok.pass_id,i)).toMatchObject({state:'done',attempts:1});
   for(let n=0;n<3;n++)await failMember(tok,k,`boom ${n}`);
   expect(await member(tok.pass_id,k)).toMatchObject({state:'failed',attempts:3,last_error:'boom 2'});
   expect((await fails(failMember(tok,k))).message).toBe('member_not_claimable');        // terminal
   expect((await fails(replace(tok,k,[expRow()]))).message).toBe('member_not_claimable');
   expect((await fails(failMember(tok,i))).message).toBe('member_not_claimable');        // done members cannot fail
   expect(await finish(tok)).toBe('complete_with_failures');
   expect(await q(`select status,(finished_at is not null) finished from public.dq_calendar_passes where market=$1 and pass_id=$2`,[CAL,tok.pass_id])).toEqual([{status:'complete_with_failures',finished:true}]);
   expect((await fails(finish(tok))).message).toBe('fence_failed');                       // a finished pass is closed to every function
   expect((await fails(replace(tok,i,[]))).message).toBe('fence_failed');
  });
 },60000);

 it('an expired worker cannot change the progress of the worker that took the pass over',async()=>{
  await withCalendarLock(admin,async()=>{
   const i=await issuer();await scopeRow(i);
   const b1=await batch(),b2=await batch();
   const old=(await claimPass(b1))!;
   await q(`update public.dq_calendar_passes set claim_until=clock_timestamp()-interval '1 second' where market=$1 and pass_id=$2`,[CAL,old.pass_id]);
   expect((await fails(replace(old,i,[expRow()]))).message).toBe('fence_failed');          // expired even before anyone takes over
   const cur=(await claimPass(b2))!;
   expect(cur).toEqual({market:CAL,pass_id:old.pass_id,batch_id:b2});                     // takeover keeps the pass and its frozen members
   expect((await fails(replace(old,i,[expRow()]))).message).toBe('fence_failed');
   expect((await fails(failMember(old,i))).message).toBe('fence_failed');
   expect((await fails(finish(old))).message).toBe('fence_failed');
   expect(await member(cur.pass_id,i)).toMatchObject({state:'pending',attempts:0});
   expect(await q(`select count(*)::int n from public.dq_filing_expectations where issuer_id=$1`,[i])).toEqual([{n:0}]);
   expect(await replace(cur,i,[expRow()])).toBe(1);
   await drain(cur);
   expect(await finish(cur)).toBe('complete');
  });
 },60000);
});

// Plan audit round 1, P3/P4: the two row-locking jsonb patches. Each concurrent case holds the row in
// one transaction and proves the second writer waits on it and then keeps the first writer's keys.
describe.skipIf(!enabled)('plan 3 migration one: row-locked jsonb patches (append_claim_evidence, patch_quarantine_detail)',()=>{
 const ev=(sha:string)=>({source:'test',as_of:'2026-11-05',evidence_sha256:sha});
 const append=(k:{issuer:string;value:string},e:unknown,on:Pool|PoolClient=admin)=>
  on.query(`select public.append_claim_evidence($1,'lei',$2,'set_identifier',$3,$4::jsonb) v`,[k.issuer,k.value,`set_identifier:${k.issuer}`,JSON.stringify(e)]).then(r=>r.rows[0].v as string);
 const sources=async(id:string)=>(await q(`select detail->'sources' s from public.issuer_identifier_claims where id=$1`,[id]))[0].s;
 it('append_claim_evidence dedupes against the evidence and the sources, patches only detail.sources and leaves resolved claims alone',async()=>{
  const a=await issuer();const value=randomLei();const k={issuer:a,value};
  const id=await newClaim({issuer:a,id_type:'lei',value,op:'set_identifier',target:{issuer_id:a}});
  expect(await append(k,EVIDENCE)).toBe('duplicate');                                   // the claim's own evidence
  expect(await append(k,ev('b'.repeat(64)))).toBe('appended');
  expect(await append(k,ev('b'.repeat(64)))).toBe('duplicate');                        // already a source
  expect(await sources(id)).toEqual([ev('b'.repeat(64))]);
  expect((await q(`select detail->'evidence' e,detail->'target' t,detail->'params' p from public.issuer_identifier_claims where id=$1`,[id]))[0]).toEqual({e:EVIDENCE,t:{issuer_id:a},p:{}});
  expect((await fails(append(k,{source:'test',as_of:'2026-11-05',evidence_sha256:'nope'}))).message).toBe('invalid_evidence');
  await resolve(id,'rejected');
  expect(await append(k,ev('c'.repeat(64)))).toBe('not_found');
  expect(await sources(id)).toEqual([ev('b'.repeat(64))]);
 });
 it('two concurrent appenders both keep their evidence: the second waits on the claim row lock',async()=>{
  const a=await issuer();const value=randomLei();const k={issuer:a,value};
  const id=await newClaim({issuer:a,id_type:'lei',value,op:'set_identifier',target:{issuer_id:a}});
  await inTx(admin,async tx=>{
   expect(await append(k,ev('1'.repeat(64)),tx.c)).toBe('appended');
   const second=append(k,ev('2'.repeat(64)));
   await stillBlockedBehind(admin,tx.pid,second);
   await tx.commit();
   expect(await second).toBe('appended');
  });
  expect(await sources(id)).toEqual([ev('1'.repeat(64)),ev('2'.repeat(64))]);
 });
 it('patch_quarantine_detail replaces only its key: a hook write interleaved with a newer latest_result and a resolution keeps both',async()=>{
  const id=randomUUID();const b=await batch('facts.us','dq-resolver');
  await q(`insert into public.dq_quarantine(id,dataset,table_name,natural_key,reason_code,batch_id,payload,detail) values($1,'facts.us','financial_facts',$2,'reconcile_mismatch',$3,'{}'::jsonb,$4::jsonb)`,
   [id,`test:${id}`,b,JSON.stringify({pair:'test',latest_result:{passed:false,reconciliation_id:'r1'},hook:{stage:'materialize',state:'pending'}})]);
  const patch=(key:string,value:unknown,on:Pool|PoolClient=admin)=>on.query(`select public.patch_quarantine_detail($1,$2,$3::jsonb) v`,[id,key,JSON.stringify(value)]).then(r=>r.rows[0].v as boolean);
  await inTx(admin,async tx=>{
   // a newer verdict (apply_reconcile_result / restore_reconciled) holds the item row
   await tx.c.query(`update public.dq_quarantine set detail=detail||'{"latest_result":{"passed":true,"reconciliation_id":"r2"}}'::jsonb,status='resolved_accept',resolved_by=$2,resolved_at=now() where id=$1`,[id,REVIEWER]);
   const hook=patch('hook',{stage:'done',state:'done',at:'2026-11-05T00:00:00.000Z'});
   await stillBlockedBehind(admin,tx.pid,hook);
   await tx.commit();
   expect(await hook).toBe(true);
  });
  expect(await patch('audit_written',true)).toBe(true);
  expect((await q(`select status,resolved_by,detail from public.dq_quarantine where id=$1`,[id]))[0]).toEqual({status:'resolved_accept',resolved_by:REVIEWER,
   detail:{pair:'test',latest_result:{passed:true,reconciliation_id:'r2'},hook:{stage:'done',state:'done',at:'2026-11-05T00:00:00.000Z'},audit_written:true}});
  expect((await fails(patch('latest_result',{passed:false}))).message).toBe('invalid_detail_key');
  expect(await admin.query(`select public.patch_quarantine_detail($1,'hook','{}'::jsonb) v`,[randomUUID()]).then(r=>r.rows[0].v)).toBe(false);
 });

 // Plan audit round 3, R2: the guarded identifier write and its provenance key land in one locked UPDATE.
 const setId=(k:{issuer:string;ticker:string},col:string,value:string,prov:unknown,on:Pool|PoolClient=admin)=>
  on.query(`select public.set_security_identifier($1,$2,'2020-01-01'::date,$3,$4,$5::jsonb) v`,[k.issuer,k.ticker,col,value,JSON.stringify(prov)]).then(r=>r.rows[0].v as string);
 const secState=async(t:string)=>(await q(`select isin,figi,provenance from public.issuer_securities where ticker=$1`,[t]))[0];
 const PI={isin:{source:'gleif_openfigi',as_of:'2026-11-05',evidence_sha256:'1'.repeat(64)}};
 const PF={figi:{source:'openfigi',as_of:'2026-11-05',evidence_sha256:'2'.repeat(64)}};
 it('set_security_identifier: written / duplicate (completing a missing key) / conflict / not_found; exactly one provenance key; other keys kept',async()=>{
  const a=await issuer();const t=await ticker();const k={issuer:a,ticker:t};
  await sec(a,t,'2020-01-01',null,{provenance:JSON.stringify({exchange:'Nasdaq'})});
  const isin=randomIsin(),figi=randomFigi();
  expect(await setId(k,'isin',isin,PI)).toBe('written');
  expect(await setId(k,'isin',isin,PI)).toBe('duplicate');
  expect(await setId(k,'isin',randomIsin(),PI)).toBe('conflict');
  await q(`update public.issuer_securities set figi=$2 where ticker=$1`,[t,figi]);                    // value present, provenance key missing
  expect(await setId(k,'figi',figi,PF)).toBe('duplicate');
  expect(await secState(t)).toEqual({isin,figi,provenance:{exchange:'Nasdaq',...PI,...PF}});
  expect(await setId({issuer:a,ticker:await ticker()},'isin',randomIsin(),PI)).toBe('not_found');
  for(const bad of [()=>setId(k,'lei',randomLei(),{lei:{}}),()=>setId(k,'isin',randomIsin(),PF),()=>setId(k,'isin',randomIsin(),{...PI,...PF}),()=>setId(k,'figi','',PF)])
   expect(await fails(bad())).toMatchObject({message:'invalid_identifier_write',code:'22023'});
 });
 it('concurrent ISIN and FIGI writes on one row both keep their value and their provenance key: the second waits on the row lock',async()=>{
  const a=await issuer();const t=await ticker();const k={issuer:a,ticker:t};
  await sec(a,t,'2020-01-01',null,{provenance:JSON.stringify({exchange:'Nasdaq'})});
  const isin=randomIsin(),figi=randomFigi();
  await inTx(admin,async tx=>{
   expect(await setId(k,'isin',isin,PI,tx.c)).toBe('written');
   const second=setId(k,'figi',figi,PF);
   await stillBlockedBehind(admin,tx.pid,second);
   await tx.commit();
   expect(await second).toBe('written');
  });
  expect(await secState(t)).toEqual({isin,figi,provenance:{exchange:'Nasdaq',...PI,...PF}});
 });
 it('an identifier write interleaved with a claim resolution on the same row keeps both values and both evidence keys, in either order',async()=>{
  for(const claimFirst of [true,false]){
   const a=await issuer();const t=await ticker();const k={issuer:a,ticker:t};
   await sec(a,t,'2020-01-01',null,{provenance:JSON.stringify({exchange:'Nasdaq'})});
   const isin=randomIsin(),figi=randomFigi();
   const id=await newClaim({issuer:a,id_type:'figi',value:figi,op:'set_identifier',target:{issuer_id:a,ticker:t,valid_from:'2020-01-01'}});   // provenance = {figi: EVIDENCE}
   await inTx(admin,async tx=>{
    if(claimFirst)expect(await resolve(id,'accepted',null,REVIEWER,tx.c)).toMatchObject({applied:true});
    else expect(await setId(k,'isin',isin,PI,tx.c)).toBe('written');
    const second=claimFirst?setId(k,'isin',isin,PI):resolve(id,'accepted');
    await stillBlockedBehind(admin,tx.pid,second);
    await tx.commit();
    expect(await second).toEqual(claimFirst?'written':{op:'set_identifier',applied:true,amended:false});
   });
   expect(await secState(t)).toEqual({isin,figi,provenance:{exchange:'Nasdaq',...PI,figi:EVIDENCE}});
  }
 });
});
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:226:**函数 `resolve_identifier_claim(p_id uuid, p_status text, p_resolved_by uuid, p_amend jsonb default null) returns jsonb`**（`security definer set search_path = public`，仅 service_role）：`select … for update` 声明行；非 `pending` → `raise 'already_resolved'`；`op='legacy'` → `raise 'legacy_claim'`；`op='evidence_only'` 且 `p_status='accepted'` → 要求 `p_amend` 把它改写为可执行 op（§4.2.1 修订规则），否则 `raise 'amend_required'`；校验 `detail` 符合 `claim/1` 模式、`detail.target.issuer_id = issuer_id`、`(op, id_type)` 配对合法（表 §4.2.1）；`rejected` → 只改状态；`accepted` → 在同一事务按 op 执行业务写入（每个分支为静态 SQL，目标发行人必须 `status='active'`；每个写入要求 `get diagnostics row_count = 1`，否则抛对应码回滚）并把 `detail.provenance_written`（白名单键）同时写入目标行的 `provenance`；成功写 `status/resolved_by/resolved_at`，返回 `{op, applied}`。
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:303:`detail = {schema:'claim/1', evidence_kind, target, params, evidence:{source, as_of, evidence_sha256, locator?, note?}, sources:[…追加…], provenance_written?}`。`target_key` 列 = `op:` + 规范化 target（`issuer_id` 或 `issuer_id|ticker|valid_from`）。`claims.ts::validateClaimDetail(op, id_type, detail)` 在写入端校验，SQL 函数再校验一次（字段存在与类型）。
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:528:顺序：`requireAdminUser()`（401/403）→ `Content-Type`（415）→ Origin（403）→ UUID（400）→ body `{status:'accepted'|'rejected', amend?:{op, target, params}}`（400；`amend` 经 `validateClaimDetail`）→ `rpc('resolve_identifier_claim', {p_id, p_status, p_resolved_by, p_amend})`。错误映射：`already_resolved`→409；`legacy_claim`/`amend_required`→409；`value_conflict`/`ownership_conflict`/`already_closed`→409（项保持 pending）；其他→500。成功写 `research_audit_log(action='dq.claim_resolve', detail={id, status, op, applied, amended})`。
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:611:`identifiers.integration.test.ts`、`dq-extensions.integration.test.ts`（含 `S4_TEST_STATE`，登记 `criticalSuites`）：两迁移在有数据库上升级 + 写入新证据后重放不改写；`valid_from` 更新受互斥约束；`resolve_identifier_claim` 每个 op 的成功/冲突回滚/目标不一致拒绝/非活跃发行人拒绝/`legacy`/`amend_required`/并发 409；`dq_reconciliations` 两条 kind 约束；`dq_filing_expectations` 全部约束组合；`replace_filing_expectations` 原子替换；`issuer_filing_profiles` 复合主键；`issuer_filer_categories`；`dq_reconcile_cycles` 单运行周期唯一索引与 `drc_done_accounted`；`dq_calendar_passes` 单未完成遍；`dq_freshness` weekly；`filings.accepted_at` 只允许 null→值且无角色可直写；`set_filing_acceptance`；`apply_reconcile_result` 持锁、只动围栏发行人的 `ok` 行、结果行+项+隔离+`hook:pending` 同一事务、同键第二次调用 `reused:true`、`state_rev+1`、与并发 `publish_sync_run` 串行；`complete_reconcile_member` 从已接受结果行推导计数、缺键 → `member_incomplete`；**每个提升入口**（`promote_quarantined`、`resolve_facts_quarantine`、`restore_reconciled`）都遵守 `fact_promote_rows` 新谓词（T6）；`filings` 的 `document_ref/document_url/link_attempts` 列级 update 仍可用、`accepted_at` 不可直写（T11）；**`restore_reconciled`：通过 + 哈希相等 → 项关闭且行真正提升（R1 回归）**、哈希不等 → `not_passing`、被其他 open 项引用 → `skipped`；`read_filing_facts` 返回全部代含 `quarantined`（读取器本身不过滤，绑定在调用方过滤）；`adopt_candidate` 全部码（含 `batch_mismatch`、发行人/市场取自 filing）、`stale_evaluation`、事务内 `hook` 写入、管理运行字段；`resolve_lineage_conflict` 锁定完整谱系、锁下重查、`lineage_changed`、`unresolved` 回滚、`promote_quarantined` 附加条款生效；`read_facts_lineage` 单发行人三种模式与 `read_facts` 逐字段一致、双发行人抑制与 `conflicts`、anon 只见 `ok`；`replace_financial_metrics_lineage` 成员 rev / 集合变化 / `scope_missing`、包装函数一致、`based_on_lineage` 回填；**拓扑：`issuers_topology_guard` 在全新连接上拒绝直接 update、在同一事务内 `set_merge` 成功返回后仍拒绝直接 update（S1 两项测试）、函数异常路径后设置已恢复；`set_merge` A→B 后 B→C 成功且 A 改指 C（R3 回归）、`row_count` 断言、与物化交错 → `stale_computation`；`set_dissolved` 的 `has_referrers`**；游标：`failed` 且 `attempts<3` 可认领、`attempts=3` 终态（S4）；`drc_done_accounted` 对 NULL 计数拒绝（S5）；围栏：过期/易主的尝试调用 `apply_reconcile_result`/`complete_reconcile_member`/`fail_reconcile_member` 得 `fence_failed` 且无写入；租约丢失前已提交的键被接手者复用、计数不重复（T2）；绑定：激活代内多行同键 → `left_ambiguous`，仅旧代同键 → 不歧义、按激活代绑定，`adopt_candidate` 遇仅旧代同键不报 `duplicate`（T1）；`adopt_candidate` 从持久化 camelCase 候选映射、代取自锚定运行、`mapping_version` 无留存 → `replay_required`（T5）；日历遍：第二个工作者租不到遍、全部遍函数围栏、冻结成员不受范围变化影响、失败成员重试成功只置 `done` 一次、`finish_calendar_pass` 两种终态都写 `finished_at`、过期工作者不能改动新租约者的进度（T3）；`read_facts_lineage` 非 `ok` 行 `disclosure_seq` 为空且只在 `history` 时返回（T7）；RLS 与桶策略（anon/authenticated 不可读写新表与桶）。
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:631:| F3-0 迁移一、类型、声明函数、清单 | `20261107090000`（含 `resolve_identifier_claim`、`replace_filing_expectations`、weekly 节奏）、types、`IssuerSecurityInput`/`attachSecurity`/`fileClaim`/`validateClaimDetail`/`sanitizeProvenance` 与现有调用方、`datasets.ts`、看板下拉 | 计划一 | 有数据演练两次绿；E9 下拉 | 2.5 |
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:41:supabase/migrations/20261107090000_identifiers_and_dq.sql   issuer_securities 方法列、claims 扩展、dq_reconciliations 扩展、对账周期/游标、日历遍、日历/档案/类别表、weekly、reconcile-raw 桶（Task 1a）；resolve_identifier_claim、replace_filing_expectations 与遍函数、拓扑守卫触发器（insert 与 update）、行锁 jsonb 补丁函数 append_claim_evidence / patch_quarantine_detail（Task 1b）
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:57:src/lib/db/table-client.ts、memory-table-client.ts、pg-table-client.ts   TableClient.rpc? / callRpc；内存实现模拟迁移一三个行锁函数（Task 2b；`set_security_identifier` 为计划审计 R2）
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:148:export interface ClaimDetail{schema:'claim/1';evidence_kind:EvidenceKind;target:ClaimTarget;params:Record<string,unknown>;evidence:ClaimEvidence;sources:ClaimEvidence[];provenance_written?:Record<string,unknown>}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:242:| `resolve_identifier_claim`（1） | `(p_id uuid, p_status text, p_resolved_by uuid, p_amend jsonb default null) returns jsonb` → `{op, applied, amended}` | `already_resolved` `legacy_claim` `amend_required` `invalid_claim` `value_conflict` `ownership_conflict` `already_closed` `issuer_not_active`；`claim_not_found`（P0002，路由 404） |
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:249:| `set_security_identifier`（1） | `(p_issuer uuid, p_ticker text, p_valid_from date, p_column text, p_value text, p_provenance jsonb) returns text` → `'written'\|'duplicate'\|'conflict'\|'not_found'`；`p_column ∈ {isin, figi}`、`p_provenance` 恰含 `p_column` 一个键；`for update` 锁住开放行后**同一条 UPDATE** 写列（仅空列）并 `provenance = provenance \|\| p_provenance`（只合并该键，不整体替换）；同值缺键 → 补键并答 `duplicate`；ISIN 唯一/互斥违反（23505/23P01）原样抛出；TS 入口 `identifiers/apply.ts` → `callRpc`（Task 4a；计划审计 R2） | `invalid_identifier_write`（22023） |
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:345:| 5 | Task 7a → 7b | Task 6b（7b 用 1b 的 `resolve_identifier_claim`） |
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:428:| 67 | 并发写 ISIN/FIGI 会互相抹掉 provenance（计划审计 R2） | 迁移一新函数 `set_security_identifier(p_issuer uuid, p_ticker text, p_valid_from date, p_column text, p_value text, p_provenance jsonb) returns text`（`'written'\|'duplicate'\|'conflict'\|'not_found'`；`for update` 锁开放行，同一 UPDATE 写空列并 `provenance = provenance \|\| p_provenance`；`p_provenance` 恰含 `p_column` 键；`invalid_identifier_write` 22023；ISIN 唯一/互斥违反原样抛出；仅 `service_role`）；内存实现模拟；`apply.ts` 每个列写入只经 `callRpc(tables,'set_security_identifier',…)`，`conflict` 时再读当前值建 `correct_identifier`。核对：`resolve_identifier_claim` 已是按键 `provenance \|\| v_pw`（不改） | C5；Part A 新增导出；Task 1b SQL、授权用例、3 个集成用例（结果语义、并发 ISIN/FIGI、与声明解析两种交错）、计数 35；Task 2b `memory-table-client.ts`、`table-client.test.ts` +1；Task 4a `apply.ts`、`apply.test.ts`（互斥违反用例改 spy `rpc`、新增并发用例）；规格 §15 偏差行 |
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:442:| Task 1b | 迁移一的**函数半**：`resolve_identifier_claim`（§4.2.1 全部 op 含 `evidence_only` 修订）、日历遍四函数（U1 认领协议）、`issuers_topology_guard`；对应集成测试；既有测试改用拓扑开关；锁文件 |
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:448:- SQL（迁移一）：内部助手 `claim_text_is_date(text) returns boolean`、`claim_keys_within(jsonb, text[]) returns boolean`、`claim_evidence_ok(jsonb) returns boolean`、`identifier_claim_target_key(text, jsonb) returns text`、`identifier_claim_problem(text, text, text, uuid, jsonb) returns text`（null = 合法，否则字段名）、`dq_calendar_lock_pass(jsonb) returns dq_calendar_passes`（全部 `revoke … from public, anon, authenticated, service_role`）。触发器函数 `issuers_topology_guard()`。服务端函数（仅 `service_role`；计划审计 P3/P4/R2）：`append_claim_evidence(uuid, text, text, text, text, jsonb) returns text`、`patch_quarantine_detail(uuid, text, jsonb) returns boolean`、`set_security_identifier(uuid, text, date, text, text, jsonb) returns text`（见 C5）。
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:449:- SQL 码（C5 之外）：`resolve_identifier_claim` 另抛 `claim_not_found`（P0002，路由应映射 404）；`fail_calendar_member` 另抛 `member_not_claimable`（成员不存在 / 已 `done` / `attempts >= 3`）；`claim_calendar_pass` 另抛 `invalid_market`、`invalid_batch`（22023）。业务码一律 P0001，`invalid_claim`/`invalid_rows` 为 22023，`topology_write_forbidden` 为 23514。
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:453:- `src/lib/db/table-client.ts`：`TableClient.rpc?(fn, args): Promise<unknown>`（可选：落地的测试桩不受影响）、`callRpc(client, fn, args)`（无 `rpc` → `throw new Error('rpc_unavailable:<fn>')`）；`memoryTableClient` 模拟 `append_claim_evidence`、`patch_quarantine_detail`、`set_security_identifier`（计划审计 R2；未知函数 → `TableError` 42883）；`pgTableClient.rpc` 用命名参数调用 `public.<fn>`。
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:460:- `src/lib/entities/claims.ts`：`CLAIM_SCHEMA`、`EVIDENCE_KINDS`、`isIsoDate(v)`、`canonicalJson(v)`、`claimEvidence({source, asOf?, record, locator?, note?}): ClaimEvidence`、`buildClaimDetail({evidence_kind, target, params?, evidence, sources?, provenance_written?}): ClaimDetail`、`provenanceKeysFor(op, idType)`；`validateClaimDetail(op, idType, detail, value?)`（第四参数可选，给出时校验 `new_value`/`target.ticker` 与列值一致）。
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:500:// appends resolve_identifier_claim, the calendar pass functions and the topology guard.
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:1412:- Modify: `src/lib/entities/identifiers.integration.test.ts`（加一行 import，末尾追加四个 describe；第四个是计划审计 P3/P4 的补丁函数与交错用例，以及计划审计 R2 的 `set_security_identifier` 用例）
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:1437: (await on.query(`select public.resolve_identifier_claim($1,$2,$3,$4::jsonb) v`,[id,status,by,amend===null?null:JSON.stringify(amend)])).rows[0].v;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:1475:describe.skipIf(!enabled)('plan 3 migration one: resolve_identifier_claim',()=>{
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:1479:  const id=await newClaim({issuer:a,id_type:'lei',value:lei,op:'set_identifier',target:{issuer_id:a},over:{provenance_written:pw}});
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:1493:  // without provenance_written the claim's evidence becomes the provenance entry
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:1612:  const foreignProv=await newClaim({issuer:a,id_type:'lei',value:randomLei(),op:'set_identifier',target:{issuer_id:a},over:{provenance_written:{cik:{source:'x'}}}});
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:1643:  const FNS=['public.resolve_identifier_claim(uuid,text,uuid,jsonb)','public.replace_filing_expectations(uuid,text,jsonb,jsonb)','public.claim_calendar_pass(text,uuid)','public.fail_calendar_member(jsonb,uuid,text)','public.finish_calendar_pass(jsonb)',
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:1644:   'public.append_claim_evidence(uuid,text,text,text,text,jsonb)','public.patch_quarantine_detail(uuid,text,jsonb)','public.set_security_identifier(uuid,text,date,text,text,jsonb)'];
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:1656:   await expect(c.query(`select public.resolve_identifier_claim($1,'accepted',$2)`,[id,REVIEWER])).rejects.toThrow(/permission denied/);
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:1891:  on.query(`select public.set_security_identifier($1,$2,'2020-01-01'::date,$3,$4,$5::jsonb) v`,[k.issuer,k.ticker,col,value,JSON.stringify(prov)]).then(r=>r.rows[0].v as string);
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:1895: it('set_security_identifier: written / duplicate (completing a missing key) / conflict / not_found; exactly one provenance key; other keys kept',async()=>{
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:1995:Expected: FAIL——Task 1a 的 11 个用例仍通过；新用例报 `function public.resolve_identifier_claim(unknown, unknown, unknown, jsonb) does not exist`、`function public.claim_calendar_pass(unknown, unknown) does not exist`、`function public.append_claim_evidence(…) does not exist`、`function public.patch_quarantine_detail(…) does not exist`、`function public.set_security_identifier(…) does not exist`；守卫用例 `expected rejection`（无触发器时直接 update 成功）。
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:2046:  t := p_detail -> 'target'; pa := p_detail -> 'params'; pw := p_detail -> 'provenance_written';
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:2054:  if pw is not null and jsonb_typeof(pw) <> 'object' then return 'provenance_written'; end if;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:2116:  if pw is not null and not public.claim_keys_within(pw, allowed) then return 'provenance_written'; end if;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:2121:-- ---------------------------------------------------------------- resolve_identifier_claim (§3.1, §4.2.1, §7.1)
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:2126:-- issuer, merges detail.provenance_written (or, absent, the claim's evidence under the op's key) into
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:2129:create or replace function public.resolve_identifier_claim(p_id uuid, p_status text, p_resolved_by uuid, p_amend jsonb default null)
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:2175:  v_pw := coalesce(v_detail -> 'provenance_written', jsonb_build_object(v_key, v_detail -> 'evidence'));
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:2240:revoke execute on function public.resolve_identifier_claim(uuid, text, uuid, jsonb) from public, anon, authenticated;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:2241:grant execute on function public.resolve_identifier_claim(uuid, text, uuid, jsonb) to service_role;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:2423:-- set_security_identifier is the only writer of issuer_securities.isin/figi outside resolve_identifier_claim
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:2432:create or replace function public.set_security_identifier(p_issuer uuid, p_ticker text, p_valid_from date, p_column text, p_value text, p_provenance jsonb)
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:2457:revoke execute on function public.set_security_identifier(uuid, text, date, text, text, jsonb) from public, anon, authenticated;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:2458:grant execute on function public.set_security_identifier(uuid, text, date, text, text, jsonb) to service_role;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:2493:Expected: PASS——`identifiers.integration.test.ts` 11 + 9 + 4 + 5 + 6 = 35 个用例全部通过（第四个 describe 含计划审计 R2 的 3 个 `set_security_identifier` 用例）；另三套件全部通过（拓扑夹具经 `topo()`，计划一触发器的错误原样出现）。
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:2520:git commit -m "feat(entities): resolve_identifier_claim, calendar pass functions and the issuers topology guard; lock migration one" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:3021:- Modify: `src/lib/db/table-client.ts`（`TableClient.rpc?`、`callRpc`、`supabaseTableClient.rpc`）、`src/lib/db/memory-table-client.ts`（`rpc`：模拟迁移一的 `append_claim_evidence`、`patch_quarantine_detail`、`set_security_identifier`（计划审计 R2））、`src/lib/db/pg-table-client.ts`（`rpc`）、`src/lib/db/table-client.test.ts`（追加 rpc 用例）——计划审计 P3/P4：声明证据的追加与隔离项 `detail` 的补丁只经 Task 1b 的行锁函数，不再读后整体替换
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:3140:   [['set_identifier','lei',d({provenance_written:{cik:{source:'x'}}})],'invalid_claim:provenance_written:unknown_key'],
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:3141:   [['set_identifier','lei',d({provenance_written:{lei:{source:'x',user_id:'u'}}})],'invalid_claim:provenance_written:secret_key'],
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:3142:   [['evidence_only','ticker',d({provenance_written:{valid_from:{source:'x'}}})],'invalid_claim:provenance_written:unknown_key'],
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:3153:  expect(verdict(validateClaimDetail('attach_security','ticker',d({params:{share_class:'A',valid_from:'2001-08-27',valid_from_method:'listing_date',source:'x'},provenance_written:{valid_from:{source:'stocks_universe.list_date',as_of:'2026-11-05'}}})))).toBe('ok');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:3170:  expect(buildClaimDetail({evidence_kind:'provider_mapping',target:rowT,params:{candidates:[]},evidence:EV,provenance_written:{isin:{source:'gleif'}}})).toMatchObject({params:{candidates:[]},provenance_written:{isin:{source:'gleif'}}});
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:3495: it('memoryTableClient emulates set_security_identifier: guarded write, one provenance key merged, concurrent ISIN/FIGI both kept (plan audit R2)',async()=>{
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:3500:  expect(await Promise.all([callRpc(c,'set_security_identifier',args('isin','US0378331005',PI)),callRpc(c,'set_security_identifier',args('figi','BBG000B9XRY4',PF))])).toEqual(['written','written']);
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:3502:  expect(await callRpc(c,'set_security_identifier',args('isin','US0378331005',PI))).toBe('duplicate');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:3503:  expect(await callRpc(c,'set_security_identifier',args('isin','US0000000000',PI))).toBe('conflict');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:3504:  expect(await callRpc(c,'set_security_identifier',{...args('isin','X',PI),p_ticker:'NOPE'})).toBe('not_found');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:3505:  await expect(callRpc(c,'set_security_identifier',args('isin','X',PF))).rejects.toMatchObject({code:'22023'});
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:3546:export interface ClaimDetail{schema:'claim/1';evidence_kind:EvidenceKind;target:ClaimTarget;params:Record<string,unknown>;evidence:ClaimEvidence;sources:ClaimEvidence[];provenance_written?:Record<string,unknown>}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:3630:// validateClaimDetail mirrors the SQL check identifier_claim_problem that resolve_identifier_claim
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:3674:/** Provenance keys an accepted claim may write to its target row (detail.provenance_written). */
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:3700: if(detail.provenance_written!==undefined&&!isObj(detail.provenance_written))return bad('provenance_written');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:3738: if(detail.provenance_written!==undefined){
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:3739:  try{sanitizeProvenance(detail.provenance_written,provenanceKeysFor(op,idType));}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:3740:  catch(e){if(e instanceof ProvenanceError)return bad(`provenance_written:${e.code}`);throw e;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:3762:export function buildClaimDetail(input:{evidence_kind:EvidenceKind;target:ClaimTarget;params?:Record<string,unknown>;evidence:ClaimEvidence;sources?:ClaimEvidence[];provenance_written?:Record<string,unknown>}):ClaimDetail{
./node_modules/dsh-trade-strategy-evaluator/agents
./node_modules/playwright/lib/agents
./node_modules/playwright/lib/agents/generateAgents.js
./node_modules/caniuse-lite/dist/unpacker/agents.js
./node_modules/caniuse-lite/data/agents.js
./.claude/agents

exec
/bin/zsh -lc "rg -n 'trigger|for update|for share|for key' supabase/migrations/20261105091000_issuers.sql; sed -n '165,265p' supabase/migrations/20261105091000_issuers.sql; sed -n '300,360p' docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md; sed -n '405,530p' src/lib/entities/identifiers.integration.test.ts; find . -path './node_modules' -prune -o -iname '*AGENTS*.md' -print; ls -a .claude" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
48:create or replace function public.issuers_merge_target_active() returns trigger
53:    select i.status into target_status from public.issuers i where i.issuer_id = new.merged_into for share;
66:drop trigger if exists issuers_merge_target_active on public.issuers;
67:create trigger issuers_merge_target_active before insert or update of merged_into, status on public.issuers
107:create or replace function public.issuer_securities_owner_active() returns trigger
112:    select i.status into owner_status from public.issuers i where i.issuer_id = new.issuer_id for share;
120:drop trigger if exists issuer_securities_owner_active on public.issuer_securities;
121:create trigger issuer_securities_owner_active before insert or update on public.issuer_securities
125:create or replace function public.issuers_retire_requires_closed_securities() returns trigger
135:drop trigger if exists issuers_retire_requires_closed_securities on public.issuers;
136:create trigger issuers_retire_requires_closed_securities before update of status on public.issuers
  constraint industry_classifications_has_name check (name_zh is not null or name_en is not null)
);

create table if not exists public.issuer_industry_memberships (
  issuer_id   uuid not null references public.issuers(issuer_id) on delete restrict,
  scheme      text not null,
  version     text not null,
  code        text not null,
  valid_from  date not null,
  valid_to    date,
  source      text not null check (length(source) between 1 and 64),
  provenance  jsonb not null default '{}',
  primary key (issuer_id, scheme, version, code, valid_from),
  foreign key (scheme, version, code) references public.industry_classifications(scheme, version, code),
  constraint issuer_industry_memberships_window check (valid_to is null or valid_to > valid_from),
  constraint issuer_industry_memberships_provenance_object check (jsonb_typeof(provenance) = 'object'),
  constraint issuer_industry_memberships_no_overlap exclude using gist
    (issuer_id with =, scheme with =, version with =, code with =, daterange(valid_from, valid_to, '[)') with &&)
);
create index if not exists issuer_industry_memberships_code_idx on public.issuer_industry_memberships(scheme, version, code);

alter table public.research_entity_keys add column if not exists issuer_id uuid references public.issuers(issuer_id) on delete restrict;
alter table public.research_entity_securities add column if not exists ticker text references public.stocks_universe(ticker) on delete restrict;
create index if not exists research_entity_keys_issuer_idx on public.research_entity_keys(issuer_id) where issuer_id is not null;
create index if not exists research_entity_securities_ticker_idx on public.research_entity_securities(ticker) where ticker is not null;

do $$ declare t text; begin
  foreach t in array array['issuers','issuer_securities','issuer_identifier_claims','industry_classifications','issuer_industry_memberships'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
  foreach t in array array['issuers','issuer_securities','industry_classifications','issuer_industry_memberships'] loop
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('drop policy if exists "%s public read" on public.%I', t, t);
    execute format('create policy "%s public read" on public.%I for select using (true)', t, t);
  end loop;
end $$;

#### 4.2.1 统一载荷 `claim/1`

`detail = {schema:'claim/1', evidence_kind, target, params, evidence:{source, as_of, evidence_sha256, locator?, note?}, sources:[…追加…], provenance_written?}`。`target_key` 列 = `op:` + 规范化 target（`issuer_id` 或 `issuer_id|ticker|valid_from`）。`claims.ts::validateClaimDetail(op, id_type, detail)` 在写入端校验，SQL 函数再校验一次（字段存在与类型）。

| `op` | `id_type` | `target` | `params` | 接受时（函数内静态 SQL；目标发行人必须 `active`；`row_count` 必须 = 1） |
|---|---|---|---|---|
| `set_identifier` | lei/cik/usci/cninfo_org_id | `{issuer_id}` | `{}` | `update issuers set <col>=value, provenance=provenance||{<col>:prov} where issuer_id and status='active' and <col> is null`；唯一冲突/0 行 → `value_conflict` |
| `set_identifier` | isin/figi | `{issuer_id, ticker, valid_from}` | `{}` | 对该证券行同样的空值守卫更新 + provenance |
| `correct_identifier` | 同上两组 | 同上 | `{expected_current, new_value}` | `where <col> = expected_current` 的守卫更新；0 行 → `value_conflict`；`value` 列 = `new_value` |
| `attach_security` | ticker | `{issuer_id}` | `{share_class, valid_from, valid_from_method, source, isin?}` | 插入 `issuer_securities`（`source` 必填；冲突分类同 `attachSecurity` → `ownership_conflict`） |
| `close_security` | ticker | `{issuer_id, ticker, valid_from}` | `{valid_to, valid_to_method}` | `update … set valid_to, valid_to_method, provenance where … and valid_to is null`；0 行 → `already_closed` |
| `backdate_window` | ticker | `{issuer_id, ticker, valid_from}` | `{new_valid_from, valid_from_method}` | `update … set valid_from=new where … and valid_from=target.valid_from`；0 行 → `value_conflict`；23505/23P01 → `ownership_conflict` |
| `evidence_only` | ticker | `{issuer_id}` | `{suggested_op?, …}` | **不可直接接受**：接受必须带 `p_amend={op, target, params}`（审核人读原文后填写证据所指的证券与生效日），函数把项改写为该 op 后按其分支执行；`detail.amended_by/at`、`detail.original_params` 保留 |
| `legacy` | 任意 | — | — | 路由 409 `legacy_claim`；runbook §4 SQL 处理 |

`evidence_kind ∈ {hard_identifier, official_list, name_match, filing_form, provider_mapping}`；`confidence` 为 null。`fileClaim(client, {issuer_id, id_type, value, source, op, detail})`：同 `(issuer_id, id_type, value, op, target_key)` pending 已存在 → 守卫更新追加 `detail.sources[]`（不改 target/params），返回 false。

#### 4.2.2 A+H 配对 `scripts/entity-keys/link-ah.ts`

1. **同 LEI**（自动，`hard_identifier`）：阶段 B 对该 LEI 返回 `HK` ticker，且该 ticker 在 `stocks_universe` 且无持有人 → `attachSecurity({issuer_id, ticker, isin, share_class, valid_from: stocks_universe.list_date ?? as_of, valid_from_method: list_date ? 'listing_date' : 'first_observed', source:'gleif_openfigi', provenance})`；已被别的发行人持有 → `ownership_conflict` 隔离。`share_class='H'` 只在该发行人同时持有 `.SH/.SZ` 行或有 USCI 时判定，否则 `unknown`。
2. **HKEX 名单名称归一**（只产 claim `attach_security`，`name_match`）：`normalizeCompanyName`（纯函数：全角转半角、去空白与标点、去后缀词表——中文 股份有限公司/有限公司/集团/控股；英文 Limited/Ltd/Co/Company/Corp/Corporation/Holdings/Group/Inc/PLC；港股 `-H`、`- H SHS`、`(H)`；英文小写）。持有 A 股行、无 H 股行、有名称的发行人，在名单 `Category='Equity'` 中找归一后完全相等者；恰一条 → claim（`params.share_class` 按规则 1，`valid_from` 同规则 1，`source='hkex_list_name_match'`）；多条或零条 → 不产生。
3. **官方 A+H 名单**（`official_list`）：URL 未确认（§14-1）；确认后替代第二条。

批次 `DATASETS.entities.ahLink`；claim 数进信息码 `claims_summary`。

### 4.3 有证据的持有区间

#### 4.3.1 语义

`[valid_from, valid_to)` 半开。方法枚举见 §3.1，分两类：**观测界**（`first_observed`、`sec_file_absent`、`unrecorded`）表示"本库在此日期观测到/不再观测到"，不是生效日；**证据日**（`listing_date`、`delisting`、`ticker_change`、`merge_close`、`curated`）表示有文件支持的生效日。`ticker_change` 只能由人工声明（`close_security`/`backdate_window`，证据如 8-K Item 8.01 代码变更公告）写入，脚本不自动判定（§4.3.4）。读接口把方法原样返回，使用方据此判断区间端点的性质。**上市日只属于该 ticker 在本库最早的持有行**；更晚的持有行保持原方法。

#### 4.3.2 回填 `scripts/entity-keys/backfill-windows.ts`（`DATASETS.entities.windows`）

对每个证券行 join `stocks_universe`（同 ticker）：
- 可回填条件：`list_date` 非空；本行是该 ticker `valid_from` 最小的行；方法 ∈ {`first_observed`,`curated`}。
  - `list_date <= valid_from` → `update … set valid_from=list_date, valid_from_method='listing_date', provenance=provenance||{valid_from:{source:'stocks_universe.list_date', provider:<source>, as_of, row:{list_date, source, source_updated_at}}} where issuer_id and ticker and valid_from=<旧>`（相等时只改方法与 provenance）。23P01/23505 → 隔离 `ownership_conflict`。
  - `list_date > valid_from` → 隔离 `window_evidence_conflict`，不改。
- `delist_date` 非空且行未关闭且本行是该 ticker 最晚的持有行 → `valid_to=delist_date, valid_to_method='delisting'`（provenance 同法）；`delist_date <= valid_from` → 隔离。
- 美股无 `list_date`：不回填。

#### 4.3.3 美股：SEC submissions `src/lib/entities/identifiers/sec-submissions.ts`

对范围内有 CIK 的发行人抓 submissions JSON（UA、120 ms 间隔；入桶；`filings.files[]` 的分页在需要时抓取并入桶——F3-4 第一步用一家申报超过 `recent` 容量的老公司实测结构并录夹具）。一次抓取服务五个消费者（受理时刻、档案、上游申报存在性、本节证据、换名）。

- `formerNames` → `security_aliases(alias, ticker=主行, 'name', source='sec_submissions')`。
- `8-A12B`/`8-A12G`、`25`/`25-NSE`：写 **`evidence_only`** claim（`evidence_kind='filing_form'`，`target={issuer_id}`，`params={suggested_op:'backdate_window'|'close_security', accession, form, filing_date, note}`；8-A12G 注明"12(g) 注册，非交易所上市"；Form 25 注明"Rule 12d2-2(d) 下退市于申报后 10 日生效，须核对原文所指类别"）。**不预填证券与日期**；审核人读原文后用 `p_amend` 指定证券行与生效日。
- `tickers[]`：SEC 有、本库无且在 `stocks_universe` → 挂接 `first_observed`；本库有、SEC 无 → §4.3.4 的第二来源。

#### 4.3.4 换码检测（`load-sec.ts` 扩展）

`load-sec --apply` 必须带 `--fetched-at <ISO>`（下载时刻，写入 `tool_versions`）与文件 sha256；`as_of` 与 `fetched_at` 都必须 ≥ 上一次成功批次的值（`stale_snapshot`）；文件数据行数 < 上一次的 90% → 拒绝（`incomplete_snapshot`）。对一个 CIK：
- 新 ticker → 新行 `first_observed`（既有）。
- 本库未关闭、`source='sec_company_tickers_exchange'` 的 ticker 在文件中对该 CIK 消失：
  - 首次：`provenance.pending_change={first_missing_as_of, first_missing_sha256, first_missing_fetched_at, replacement_tickers:[本次该 CIK 新增且 securityType 不明的 ticker], sources:['sec_company_tickers_exchange']}`，不关闭。
  - 再次出现 → 删除 `pending_change`。
  - 关闭条件（全部满足）：仍消失；`fetched_at − first_missing_fetched_at ≥ 7 天`；本次 sha256 ≠ 首次；**第二来源确认**：该 CIK 的 submissions `tickers[]`（本次运行抓取）不含 OLD。则 `valid_to = first_missing_as_of`，`valid_to_method = 'sec_file_absent'`（**观测界**：最后一次观测到持有是 `first_missing_as_of` 之前的那次运行；不断言换码生效日），`provenance.valid_to` 记两次文件哈希、submissions 哈希与 `last_seen_as_of`；`replacement_tickers` 只保留在 `provenance.pending_change`，并为该发行人写一条 `evidence_only` claim（`params.suggested_op='backdate_window'`，`note='观测到 OLD 消失、NEW 出现；换码生效日需 8-K/公告证据'`），由人工把 NEW 行改为 `ticker_change` 并给出生效日。
  - 该 ticker 在文件中归另一 CIK → `ownership_conflict` 隔离，不关闭。
  - 关闭后再次出现 → 新行 `first_observed`（从再出现的 `as_of` 起）；旧关闭行不改。
- 换码夹具：T0（CIK X 持 OLD）、T1（X 持 NEW，OLD 消失，`as_of=T0+1d`）、T2（仍无 OLD，`as_of=T0+8d`，不同 sha256，submissions 夹具 `tickers=['NEW']`）。断言：`resolveIssuer({ticker:'OLD'},{asOf:T0})` = X；T1 后 T2 前 `{asOf:T1}` = X；T2 后 `{asOf:T1}` = null、`{asOf:T0}` = X；OLD 行 `valid_to_method='sec_file_absent'`、NEW 行仍 `first_observed`、存在一条 `evidence_only` claim；缺少 submissions 确认时不关闭。

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

// ================================================================ Task 1b: functions and topology guard
const REVIEWER=randomUUID();
const EVIDENCE={source:'test',as_of:'2026-11-05',evidence_sha256:SHA,locator:'row:1'};
const randomLei=()=>hex(9)+'12';                         // matches the issuers.lei format check
const randomIsin=()=>'ZZ'+hex(5).slice(0,9)+'7';         // matches the issuer_securities.isin format check
const randomFigi=()=>'BBG'+hex(5).slice(0,9);
const randomCik=()=>String(1+Math.floor(Math.random()*9))+String(Math.floor(Math.random()*1e9)).padStart(9,'0');
/** claims.ts::claimTargetKey */
const targetKey=(op:string,t:Record<string,string>)=>t.ticker!==undefined?`${op}:${t.issuer_id}|${t.ticker}|${t.valid_from}`:`${op}:${t.issuer_id}`;
async function newClaim(c:{issuer:string;id_type:string;value:string;op:string;target:Record<string,string>;params?:Record<string,unknown>;over?:Record<string,unknown>;target_key?:string}):Promise<string>{
 const id=randomUUID();
 const detail={schema:'claim/1',evidence_kind:'hard_identifier',target:c.target,params:c.params??{},evidence:EVIDENCE,sources:[],...c.over};
 await insertRow('issuer_identifier_claims',{id,issuer_id:c.issuer,id_type:c.id_type,value:c.value,source:'test',status:'pending',op:c.op,target_key:c.target_key??targetKey(c.op,c.target),detail:JSON.stringify(detail)});
 return id;
}
const resolve=async(id:string,status:string,amend:unknown=null,by:string|null=REVIEWER,on:Pool|PoolClient=admin)=>
 (await on.query(`select public.resolve_identifier_claim($1,$2,$3,$4::jsonb) v`,[id,status,by,amend===null?null:JSON.stringify(amend)])).rows[0].v;
const claimState=async(id:string)=>(await q(`select status,op,value,resolved_by,(resolved_at is not null) resolved from public.issuer_identifier_claims where id=$1`,[id]))[0];
/** Topology changes in fixtures switch the transaction-local setting on, as set_merge/set_dissolved do. */
const topo=async(sql:string,params:unknown[]=[])=>{
 const c=await admin.connect();
 try{
  await c.query('begin');
  await c.query(`select set_config('entities.allow_topology_write','on',true)`);
  await c.query(sql,params);
  await c.query('commit');
 }catch(e){await c.query('rollback').catch(()=>{});throw e;}
 finally{c.release();}
};
/** Runs body inside one transaction on its own connection (pid known); rolls back only if still open. */
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
/** Deterministic "is blocked": polls (20 ms, <= 3 s) until some backend waits on `pid`, then asserts p is still pending. */
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

describe.skipIf(!enabled)('plan 3 migration one: resolve_identifier_claim',()=>{
 it('set_identifier on an issuer column writes value and provenance under the null guard; conflicts roll back',async()=>{
  const a=await issuer();const lei=randomLei();
  const pw={lei:{source:'gleif',as_of:'2026-11-05',evidence_sha256:SHA}};
  const id=await newClaim({issuer:a,id_type:'lei',value:lei,op:'set_identifier',target:{issuer_id:a},over:{provenance_written:pw}});
  expect(await resolve(id,'accepted')).toEqual({op:'set_identifier',applied:true,amended:false});
  expect(await q(`select lei,provenance from public.issuers where issuer_id=$1`,[a])).toEqual([{lei,provenance:pw}]);
  expect(await claimState(id)).toEqual({status:'accepted',op:'set_identifier',value:lei,resolved_by:REVIEWER,resolved:true});
  // the column is no longer null: a second set conflicts and nothing changes
  const again=await newClaim({issuer:a,id_type:'lei',value:randomLei(),op:'set_identifier',target:{issuer_id:a}});
  expect((await fails(resolve(again,'accepted'))).message).toBe('value_conflict');
  expect(await claimState(again)).toMatchObject({status:'pending',resolved:false});
  expect(await q(`select lei from public.issuers where issuer_id=$1`,[a])).toEqual([{lei}]);
  // another issuer holding the value (unique index) is value_conflict too
  const b=await issuer();
  const stolen=await newClaim({issuer:b,id_type:'lei',value:lei,op:'set_identifier',target:{issuer_id:b}});
  expect((await fails(resolve(stolen,'accepted'))).message).toBe('value_conflict');
  expect(await q(`select lei from public.issuers where issuer_id=$1`,[b])).toEqual([{lei:null}]);
  // without provenance_written the claim's evidence becomes the provenance entry
  const cik=randomCik();
  await resolve(await newClaim({issuer:b,id_type:'cik',value:cik,op:'set_identifier',target:{issuer_id:b}}),'accepted');
  expect(await q(`select cik,provenance->'cik' p from public.issuers where issuer_id=$1`,[b])).toEqual([{cik,p:EVIDENCE}]);
  // correct_identifier needs the current value to still match
  const lei2=randomLei();
  const stale=await newClaim({issuer:a,id_type:'lei',value:lei2,op:'correct_identifier',target:{issuer_id:a},params:{expected_current:randomLei(),new_value:lei2}});
  expect((await fails(resolve(stale,'accepted'))).message).toBe('value_conflict');
  await resolve(stale,'rejected');                       // the failed claim stays pending; clear it so the same-key correction can be filed
  const fix=await newClaim({issuer:a,id_type:'lei',value:lei2,op:'correct_identifier',target:{issuer_id:a},params:{expected_current:lei,new_value:lei2}});
  expect(await resolve(fix,'accepted')).toEqual({op:'correct_identifier',applied:true,amended:false});
  expect(await q(`select lei from public.issuers where issuer_id=$1`,[a])).toEqual([{lei:lei2}]);
 });

 it('set/correct_identifier on a security row: ISIN and FIGI under row guards; an ISIN held elsewhere is ownership_conflict',async()=>{
  const a=await issuer(),b=await issuer();const t=await ticker(),t2=await ticker();
  await sec(a,t,'2020-01-01',null);
  const isin=randomIsin();
  const target={issuer_id:a,ticker:t,valid_from:'2020-01-01'};
  expect(await resolve(await newClaim({issuer:a,id_type:'isin',value:isin,op:'set_identifier',target}),'accepted')).toEqual({op:'set_identifier',applied:true,amended:false});
  expect(await q(`select isin,provenance->'isin' p from public.issuer_securities where ticker=$1`,[t])).toEqual([{isin,p:EVIDENCE}]);
  // the same ISIN on another open row (any issuer) violates the ISIN no-overlap exclusion
  await sec(b,t2,'2021-01-01',null);
  const dup=await newClaim({issuer:b,id_type:'isin',value:isin,op:'set_identifier',target:{issuer_id:b,ticker:t2,valid_from:'2021-01-01'}});
  expect((await fails(resolve(dup,'accepted'))).message).toBe('ownership_conflict');
  expect(await q(`select isin from public.issuer_securities where ticker=$1`,[t2])).toEqual([{isin:null}]);
  expect(await claimState(dup)).toMatchObject({status:'pending',resolved:false});
  // FIGI: set, then correct only while expected_current still matches
  const [f1,f2,f3]=[randomFigi(),randomFigi(),randomFigi()];
  await resolve(await newClaim({issuer:a,id_type:'figi',value:f1,op:'set_identifier',target}),'accepted');
  const stale=await newClaim({issuer:a,id_type:'figi',value:f3,op:'correct_identifier',target,params:{expected_current:f2,new_value:f3}});
  expect((await fails(resolve(stale,'accepted'))).message).toBe('value_conflict');
  const fix=await newClaim({issuer:a,id_type:'figi',value:f2,op:'correct_identifier',target,params:{expected_current:f1,new_value:f2}});
  expect(await resolve(fix,'accepted')).toMatchObject({op:'correct_identifier',applied:true});
  expect(await q(`select figi from public.issuer_securities where ticker=$1`,[t])).toEqual([{figi:f2}]);
  // a target row that does not exist matches nothing → value_conflict
  const ghost=await newClaim({issuer:a,id_type:'figi',value:randomFigi(),op:'set_identifier',target:{issuer_id:a,ticker:t,valid_from:'1999-01-01'}});
  expect((await fails(resolve(ghost,'accepted'))).message).toBe('value_conflict');
 });

 it('attach_security inserts the open row with its method and provenance; a held ticker is ownership_conflict',async()=>{
  const a=await issuer(),b=await issuer();const t=await ticker();
.
..
agents
launch.json
scratch

exec
/bin/zsh -lc "sed -n '103,123p' supabase/migrations/20261105091000_issuers.sql; sed -n '900,960p' src/lib/entities/identifiers.integration.test.ts; nl -ba supabase/migrations/20261107090000_identifiers_and_dq.sql | sed -n '705,735p'; git status --short; command -v psql" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
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

  expect(await setId(k,'figi',figi,PF)).toBe('duplicate');
  expect(await secState(t)).toEqual({isin,figi,provenance:{exchange:'Nasdaq',...PI,...PF}});
  expect(await setId({issuer:a,ticker:await ticker()},'isin',randomIsin(),PI)).toBe('not_found');
  for(const bad of [()=>setId(k,'lei',randomLei(),{lei:{}}),()=>setId(k,'isin',randomIsin(),PF),()=>setId(k,'isin',randomIsin(),{...PI,...PF}),()=>setId(k,'figi','',PF)])
   expect(await fails(bad())).toMatchObject({message:'invalid_identifier_write',code:'22023'});
 });
 it('concurrent ISIN and FIGI writes on one row both keep their value and their provenance key: the second waits on the row lock',async()=>{
  const a=await issuer();const t=await ticker();const k={issuer:a,ticker:t};
  await sec(a,t,'2020-01-01',null,{provenance:JSON.stringify({exchange:'Nasdaq'})});
  const isin=randomIsin(),figi=randomFigi();
  await inTx(admin,async tx=>{
   expect(await setId(k,'isin',isin,PI,tx.c)).toBe('written');
   const second=setId(k,'figi',figi,PF);
   await stillBlockedBehind(admin,tx.pid,second);
   await tx.commit();
   expect(await second).toBe('written');
  });
  expect(await secState(t)).toEqual({isin,figi,provenance:{exchange:'Nasdaq',...PI,...PF}});
 });
 it('an identifier write interleaved with a claim resolution on the same row keeps both values and both evidence keys, in either order',async()=>{
  for(const claimFirst of [true,false]){
   const a=await issuer();const t=await ticker();const k={issuer:a,ticker:t};
   await sec(a,t,'2020-01-01',null,{provenance:JSON.stringify({exchange:'Nasdaq'})});
   const isin=randomIsin(),figi=randomFigi();
   const id=await newClaim({issuer:a,id_type:'figi',value:figi,op:'set_identifier',target:{issuer_id:a,ticker:t,valid_from:'2020-01-01'}});   // provenance = {figi: EVIDENCE}
   await inTx(admin,async tx=>{
    if(claimFirst)expect(await resolve(id,'accepted',null,REVIEWER,tx.c)).toMatchObject({applied:true});
    else expect(await setId(k,'isin',isin,PI,tx.c)).toBe('written');
    const second=claimFirst?setId(k,'isin',isin,PI):resolve(id,'accepted');
    await stillBlockedBehind(admin,tx.pid,second);
    await tx.commit();
    expect(await second).toEqual(claimFirst?'written':{op:'set_identifier',applied:true,amended:false});
   });
   expect(await secState(t)).toEqual({isin,figi,provenance:{exchange:'Nasdaq',...PI,figi:EVIDENCE}});
  }
 });
});
   705	-- exactly the key p_column. Outcomes: 'written' (the column was empty), 'duplicate' (the same value is
   706	-- stored; a missing provenance key is completed in the same UPDATE), 'conflict' (another value is
   707	-- stored; nothing written — the caller files correct_identifier), 'not_found' (no open row). ISIN
   708	-- uniqueness / no-overlap violations (23505 / 23P01) pass through unchanged.
   709	create or replace function public.set_security_identifier(p_issuer uuid, p_ticker text, p_valid_from date, p_column text, p_value text, p_provenance jsonb)
   710	returns text language plpgsql security definer set search_path = public as $$
   711	declare v_cur text; v_prov jsonb;
   712	begin
   713	  if p_column is null or p_column not in ('isin', 'figi') or coalesce(p_value, '') = ''
   714	     or p_provenance is null or jsonb_typeof(p_provenance) <> 'object'
   715	     or (select array_agg(k) from jsonb_object_keys(p_provenance) k) is distinct from array[p_column] then
   716	    raise exception 'invalid_identifier_write' using errcode = '22023';
   717	  end if;
   718	  select case when p_column = 'isin' then s.isin else s.figi end, s.provenance into v_cur, v_prov
   719	  from public.issuer_securities s
   720	  where s.issuer_id = p_issuer and s.ticker = p_ticker and s.valid_from = p_valid_from and s.valid_to is null
   721	  for update;
   722	  if not found then return 'not_found'; end if;
   723	  if v_cur is not null and v_cur <> p_value then return 'conflict'; end if;
   724	  if v_cur = p_value and coalesce(v_prov ? p_column, false) then return 'duplicate'; end if;
   725	  if p_column = 'isin' then
   726	    update public.issuer_securities set isin = p_value, provenance = provenance || p_provenance
   727	    where issuer_id = p_issuer and ticker = p_ticker and valid_from = p_valid_from and valid_to is null;
   728	  else
   729	    update public.issuer_securities set figi = p_value, provenance = provenance || p_provenance
   730	    where issuer_id = p_issuer and ticker = p_ticker and valid_from = p_valid_from and valid_to is null;
   731	  end if;
   732	  return case when v_cur is null then 'written' else 'duplicate' end;
   733	end $$;
   734	revoke execute on function public.set_security_identifier(uuid, text, date, text, text, jsonb) from public, anon, authenticated;
   735	grant execute on function public.set_security_identifier(uuid, text, date, text, text, jsonb) to service_role;
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-yNXC7rY0' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-finEusWZ' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/
/opt/homebrew/bin/psql

exec
/bin/zsh -lc "rg -n \"evidence_only|attach_security\" src/lib/entities/identifiers.integration.test.ts | tail -18; rg -n \"value:.*(accession|form)|op:'evidence_only'\" docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md | tail -15; ls /Users/osborn/.codex/config.toml; rg -n 'fallback' /Users/osborn/.codex/config.toml; sed -n '560,595p' src/lib/entities/identifiers.integration.test.ts" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
209:   await db.query(`insert into public.issuer_identifier_claims(id,issuer_id,id_type,value,source,status,op,target_key,detail) values($1,$2,'ticker','ZZUPA','test','pending','evidence_only',$3,'{"schema":"claim/1"}')`,[fresh,iss,`evidence_only:${iss}`]);
219:   expect((await db.query(`select op from public.issuer_identifier_claims where id=$1`,[fresh])).rows).toEqual([{op:'evidence_only'}]);
248:  const claim=(over:Record<string,unknown>)=>insertRow('issuer_identifier_claims',{id:randomUUID(),issuer_id:a,id_type:'ticker',value:'ZZX',source:'test',status:'pending',op:'evidence_only',target_key:`evidence_only:${a}`,detail:'{}',...over});
251:  await claim({op:'attach_security',target_key:`attach_security:${a}`});              // same value, another op
252:  await claim({target_key:`evidence_only:${a}|ZZX|2020-01-01`});                        // same op, another target
529: it('attach_security inserts the open row with its method and provenance; a held ticker is ownership_conflict',async()=>{
532:  const id=await newClaim({issuer:a,id_type:'ticker',value:t,op:'attach_security',target:{issuer_id:a},params,over:{evidence_kind:'name_match'}});
533:  expect(await resolve(id,'accepted')).toEqual({op:'attach_security',applied:true,amended:false});
537:  const held=await newClaim({issuer:b,id_type:'ticker',value:t,op:'attach_security',target:{issuer_id:b},params:{...params,isin:null,valid_from:'2026-01-01'}});
571: it('evidence_only needs an amend to be accepted; the amend rewrites the claim and keeps the original',async()=>{
575:  const evidenceClaim=()=>newClaim({issuer:a,id_type:'ticker',value:t,op:'evidence_only',target:{issuer_id:a},params,over:{evidence_kind:'filing_form'}});
578:  expect(await resolve(first,'rejected')).toEqual({op:'evidence_only',applied:false,amended:false});
579:  expect(await claimState(first)).toEqual({status:'rejected',op:'evidence_only',value:t,resolved_by:REVIEWER,resolved:true});
587:  expect(row.detail).toMatchObject({target:amend.target,params:amend.params,original_op:'evidence_only',original_params:params,original_target:{issuer_id:a},amended_by:REVIEWER});
596:  expect(await claimState(third)).toMatchObject({status:'pending',op:'evidence_only'});
608:  const pairing=await newClaim({issuer:a,id_type:'lei',value:randomLei(),op:'attach_security',target:{issuer_id:a},params:{share_class:'A',valid_from:'2020-01-01',valid_from_method:'listing_date',source:'x'}});
1590:  expect(row.detail).toMatchObject({target:amend.target,params:amend.params,original_op:'evidence_only',original_params:params,original_target:{issuer_id:a},amended_by:REVIEWER});
1599:  expect(await claimState(third)).toMatchObject({status:'pending',op:'evidence_only'});
7206:  return [{issuer_id:issuerId,id_type:'ticker' as const,value:f.accessionNumber,source:'sec_submissions',op:'evidence_only' as const,detail:{
7696:   if(await fileClaim(client,{issuer_id:issuerId,id_type:'ticker',value:ticker,source:SEC_SOURCE,op:'evidence_only',detail:{
8480:  expect(await fileClaim(db,{issuer_id:e,id_type:'ticker',value:'0000999001-01-000001',source:'sec_submissions',op:'evidence_only',detail:{
8938: const metric=(v:string,name='gross_margin')=>({metric:name,period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:v,unit:'ratio',input_unit:'USD',basis:'us_standard',formula_version:'facts-derive/1.0',inputs:[],as_of:'2024-03-01'});
10875:  const m={issuer_id:I1,market:'US' as const,metric:'m',period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M' as const,value:'1',unit:'u',input_unit:'USD',basis:'us_standard',formula_version:'v',inputs:[],based_on_rev:3,based_on_lineage:[{issuer_id:I1,state_rev:3}],as_of:'2024-01-01'};
10877:  expect(calls.at(-1)).toEqual({fn:'replace_financial_metrics_lineage',args:{p_issuer:I1,p_market:'US',p_based_on:[{issuer_id:I1,state_rev:3}],p_rows:[{metric:'m',period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:'1',unit:'u',input_unit:'USD',basis:'us_standard',formula_version:'v',inputs:[],as_of:'2024-01-01'}]}});
10894:  const row=(i:number,lineage:unknown)=>({issuer_id:'iss',market:'US',metric:`m${String(i).padStart(4,'0')}`,period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:1,value_text:'1',unit:'u',input_unit:'USD',basis:'us_standard',formula_version:'v',inputs:[],based_on_rev:2,based_on_lineage:lineage,as_of:'2024-01-01'});
10930:  const m={issuer_id:'z',market:'US' as const,metric:'m',period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M' as const,value:'1',unit:'u',input_unit:'USD',basis:'us_standard',formula_version:'v',inputs:[],based_on_rev:0,based_on_lineage:[{issuer_id:'z',state_rev:0}],as_of:'2024-01-01'};
11045:export interface MetricRow{issuer_id:string;market:Market;metric:string;period_start:string;period_end:string;duration:MetricDuration;value:string;unit:string;input_unit:string;basis:string;formula_version:string;inputs:{fact_id:string;concept:string;filing_id:string;available_date:string;ytd_rule?:'same_filing'|'never_revised';quarter?:[string,string]}[];based_on_rev:number;
11171:  value:String(r.value_text),unit:String(r.unit),input_unit:String(r.input_unit),basis:String(r.basis),formula_version:String(r.formula_version),inputs:(Array.isArray(r.inputs)?r.inputs:[]) as MetricRow['inputs'],based_on_rev:Number(r.based_on_rev),
11860:   const row=(v:string):MetricRow=>({issuer_id:t,market:'US',metric:'gross_margin',period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:v,unit:'ratio',input_unit:'USD',basis:'us_standard',formula_version:'facts-derive/1.0',
12153:const metric=(p:Partial<MetricRow>={}):MetricRow=>({issuer_id:ISSUER,market:'US',metric:'gross_margin',period_start:'2024-01-01',period_end:'2024-03-31',duration:'3M',value:'0.4',unit:'pure',input_unit:'USD',basis:'us_standard',formula_version:FORMULA_VERSION,
20910:  await t.insert('issuer_identifier_claims',{id:'c1',issuer_id:I1,op:'evidence_only',status:'pending',created_at:'2026-11-01T00:00:00Z'});
/Users/osborn/.codex/config.toml
  expect(await resolve(ok,'accepted')).toEqual({op:'backdate_window',applied:true,amended:false});
  expect(await q(`select valid_from::text,valid_from_method,provenance->'valid_from' p from public.issuer_securities where issuer_id=$1 and ticker=$2`,[a,t])).toEqual([{valid_from:'2006-03-01',valid_from_method:'listing_date',p:EVIDENCE}]);
  // the old valid_from is gone → value_conflict
  const stale=await newClaim({issuer:a,id_type:'ticker',value:t,op:'backdate_window',target,params:{new_valid_from:'2007-01-01',valid_from_method:'curated'}});
  expect((await fails(resolve(stale,'accepted'))).message).toBe('value_conflict');
  // moving into b's closed window [2000,2005) → no-overlap exclusion → ownership_conflict, nothing moves
  const over=await newClaim({issuer:a,id_type:'ticker',value:t,op:'backdate_window',target:{issuer_id:a,ticker:t,valid_from:'2006-03-01'},params:{new_valid_from:'2004-01-01',valid_from_method:'curated'}});
  expect((await fails(resolve(over,'accepted'))).message).toBe('ownership_conflict');
  expect(await q(`select valid_from::text from public.issuer_securities where issuer_id=$1 and ticker=$2`,[a,t])).toEqual([{valid_from:'2006-03-01'}]);
 });

 it('evidence_only needs an amend to be accepted; the amend rewrites the claim and keeps the original',async()=>{
  const a=await issuer();const t=await ticker();
  await sec(a,t,'2020-01-01',null);
  const params={suggested_op:'close_security',accession:'0001234567-26-000001',form:'25-NSE',filing_date:'2026-02-20',note:'Rule 12d2-2(d): delisting effective 10 days after filing; check the class named in the form'};
  const evidenceClaim=()=>newClaim({issuer:a,id_type:'ticker',value:t,op:'evidence_only',target:{issuer_id:a},params,over:{evidence_kind:'filing_form'}});
  const first=await evidenceClaim();
  expect((await fails(resolve(first,'accepted'))).message).toBe('amend_required');
  expect(await resolve(first,'rejected')).toEqual({op:'evidence_only',applied:false,amended:false});
  expect(await claimState(first)).toEqual({status:'rejected',op:'evidence_only',value:t,resolved_by:REVIEWER,resolved:true});
  const second=await evidenceClaim();
  const amend={op:'close_security',target:{issuer_id:a,ticker:t,valid_from:'2020-01-01'},params:{valid_to:'2026-03-02',valid_to_method:'delisting'}};
  expect(await resolve(second,'accepted',amend)).toEqual({op:'close_security',applied:true,amended:true});
  const row=(await q(`select op,value,target_key,detail from public.issuer_identifier_claims where id=$1`,[second]))[0];
  expect(row.op).toBe('close_security');
  expect(row.value).toBe(t);
  expect(row.target_key).toBe(`close_security:${a}|${t}|2020-01-01`);
  expect(row.detail).toMatchObject({target:amend.target,params:amend.params,original_op:'evidence_only',original_params:params,original_target:{issuer_id:a},amended_by:REVIEWER});
  expect(typeof row.detail.amended_at).toBe('string');
  expect(await q(`select valid_to::text,valid_to_method from public.issuer_securities where ticker=$1`,[t])).toEqual([{valid_to:'2026-03-02',valid_to_method:'delisting'}]);
  // an amend on another op, to a non-ticker op, or one that fails the claim/1 check is invalid_claim
  const other=await newClaim({issuer:a,id_type:'lei',value:randomLei(),op:'set_identifier',target:{issuer_id:a}});
  expect((await fails(resolve(other,'accepted',amend))).message).toBe('invalid_claim');
  const third=await evidenceClaim();
  expect((await fails(resolve(third,'accepted',{op:'set_identifier',target:{issuer_id:a},params:{}}))).message).toBe('invalid_claim');
  expect((await fails(resolve(third,'accepted',{...amend,params:{valid_to:'2019-01-01',valid_to_method:'delisting'}}))).message).toBe('invalid_claim');

codex
The new functions introduce a lock-order deadlock and an attachment-amendment path that cannot specify a previously unknown ticker. Both require changes despite the existing sequential and interleaving test coverage.

Full review comments:

- [P2] Lock the issuer before locking the security row — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/supabase/migrations/20261107090000_identifiers_and_dq.sql:718-721
  Concurrent `set_security_identifier` and `resolve_identifier_claim` calls on the same open security can deadlock: this function locks the security first, while claim resolution locks the issuer first. The subsequent security UPDATE invokes `issuer_securities_owner_active`, which requests a conflicting `FOR SHARE` lock on that issuer. If resolution obtains its issuer lock between this SELECT and UPDATE, each transaction waits for the other and PostgreSQL aborts one with `40P01`. Acquire locks in the same issuer-then-security order; the existing interleaving tests finish the first function before starting the second and therefore miss this case.

- [P2] Allow attachment amendments to specify the intended ticker — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/supabase/migrations/20261107090000_identifiers_and_dq.sql:437-437
  When an `evidence_only` claim's value is an accession or another placeholder rather than the intended ticker, amending it to `attach_security` cannot succeed. This assignment only changes `v_value` when the amended target contains `ticker`, but `identifier_claim_problem` rejects full targets for `attach_security`; with the required issuer-only target, the INSERT instead uses the original placeholder and fails its ticker foreign key. Provide a validated way to supply the attachment ticker in an amendment rather than requiring it to have been known when the evidence-only claim was filed.
The new functions introduce a lock-order deadlock and an attachment-amendment path that cannot specify a previously unknown ticker. Both require changes despite the existing sequential and interleaving test coverage.

Full review comments:

- [P2] Lock the issuer before locking the security row — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/supabase/migrations/20261107090000_identifiers_and_dq.sql:718-721
  Concurrent `set_security_identifier` and `resolve_identifier_claim` calls on the same open security can deadlock: this function locks the security first, while claim resolution locks the issuer first. The subsequent security UPDATE invokes `issuer_securities_owner_active`, which requests a conflicting `FOR SHARE` lock on that issuer. If resolution obtains its issuer lock between this SELECT and UPDATE, each transaction waits for the other and PostgreSQL aborts one with `40P01`. Acquire locks in the same issuer-then-security order; the existing interleaving tests finish the first function before starting the second and therefore miss this case.

- [P2] Allow attachment amendments to specify the intended ticker — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/supabase/migrations/20261107090000_identifiers_and_dq.sql:437-437
  When an `evidence_only` claim's value is an accession or another placeholder rather than the intended ticker, amending it to `attach_security` cannot succeed. This assignment only changes `v_value` when the amended target contains `ticker`, but `identifier_claim_problem` rejects full targets for `attach_security`; with the required issuer-only target, the INSERT instead uses the original placeholder and fails its ticker foreign key. Provide a validated way to supply the attachment ticker in an amendment rather than requiring it to have been known when the evidence-only claim was filed.
